/*
 * Shared runtime for the RWPP docs functions.
 *
 * Catalog content, archive metadata and the archive allow-list live in one JSON
 * object in the private R2 bucket. Functions read it at request time, so a new
 * archive is published by replacing that object and the archive itself. The
 * build-time JSON files stay bundled as a fallback snapshot: any R2 failure
 * degrades to exactly the behaviour that existed before this change.
 */

const crypto = require("node:crypto");

const fallbackIndex = require("../../docs/api/v1/index.json");
const fallbackSearch = require("../../docs/api/v1/search.json");
const fallbackManifest = require("../../docs/api/v1/manifest.json");
const fallbackSources = require("../functions/archive-sources.json");

const TOKEN_TTL_SECONDS = 30 * 24 * 3600;
const CACHE_TTL_MS = 15_000;
const READ_TIMEOUT_MS = 4000;
const PRESIGN_SECONDS = 300;
const REGISTRY_FILE = "registry.json";
const ARCHIVE_PATH = "/api/archives/";
const CACHE_LIVE = "public, max-age=60, must-revalidate";
const CACHE_FALLBACK = "public, max-age=300, must-revalidate";

let cache = { at: 0, value: null };

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function uriEncode(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (character) => "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function equal(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function secretKey(secret) {
  if (!secret) return null;
  const key = /^[0-9a-fA-F]+$/.test(secret) && secret.length % 2 === 0
    ? Buffer.from(secret, "hex")
    : Buffer.from(secret, "utf8");
  return key.length ? key : Buffer.from(secret, "utf8");
}

/** Object address for a published archive or for the runtime registry itself. */
function r2Location(file) {
  const account = process.env.RWPP_R2_ACCOUNT_ID;
  if (!account) return null;
  const bucket = process.env.RWPP_R2_BUCKET || "rwpp";
  const prefix = (process.env.RWPP_R2_PREFIX || "extensions").replace(/^\/+|\/+$/g, "");
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${prefix}/${encodeURIComponent(file)}`;
}

/** AWS Signature Version 4 presigned URL for a private R2 object. */
function presign(method, target, expires) {
  const url = new URL(target);
  const host = url.host;
  const canonicalUri = url.pathname;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const accessKey = process.env.RWPP_R2_ACCESS_KEY_ID;
  const secret = process.env.RWPP_R2_SECRET_ACCESS_KEY;
  if (!accessKey || !secret) return null;
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${uriEncode(name)}=${uriEncode(query[name])}`)
    .join("&");
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  let key = hmac(Buffer.from(`AWS4${secret}`, "utf8"), dateStamp);
  key = hmac(key, "auto");
  key = hmac(key, "s3");
  key = hmac(key, "aws4_request");
  const signature = crypto.createHmac("sha256", key).update(stringToSign).digest("hex");
  return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Verify the catalog token: HMAC signature, file binding, sequence and expiry. */
function verifyToken(token, file) {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const key = secretKey(process.env.RWPP_ARCHIVE_SECRET);
  if (!key) return null;
  const expected = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  if (!equal(signature, expected)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || claims.f !== file || typeof claims.s !== "number" || typeof claims.e !== "number") {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.s <= 0 || claims.s > now + 300 || claims.e <= now || claims.e - claims.s > 31 * 86400) {
    return null;
  }
  return claims;
}

function signUrl(baseUrl, now) {
  const key = secretKey(process.env.RWPP_ARCHIVE_SECRET);
  if (!key) return null;
  const clean = String(baseUrl).split("?")[0];
  let parsed;
  try {
    parsed = new URL(clean);
  } catch {
    return null;
  }
  if (!parsed.pathname.includes(ARCHIVE_PATH)) return clean;
  const name = decodeURIComponent(parsed.pathname.split("/").pop());
  const claims = { f: name, s: now, e: now + TOKEN_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  return `${clean}?k=${payload}.${signature}`;
}

function validRegistry(document) {
  return Boolean(
    document
    && Array.isArray(document.extensions)
    && document.extensions.length
    && document.sources
    && typeof document.sources === "object"
    && typeof document.generatedAt === "string",
  );
}

/** Read the live registry from R2. A failed read returns null and selects the fallback. */
async function loadRegistry() {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_TTL_MS) return cache.value;
  let value = null;
  const location = r2Location(REGISTRY_FILE);
  if (location) {
    try {
      const url = presign("GET", location, PRESIGN_SECONDS);
      if (url) {
        const response = await fetch(url, { signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
        if (response.ok) {
          const document = await response.json();
          if (validRegistry(document)) value = document;
          else console.warn("registry: R2 document has an unexpected shape");
        } else {
          console.warn(`registry: R2 read returned HTTP ${response.status}`);
        }
      }
    } catch (error) {
      console.warn(`registry: R2 read failed: ${error.message}`);
    }
  }
  cache = { at: now, value };
  return value;
}

function resetCache() {
  cache = { at: 0, value: null };
}

async function getSources() {
  const registry = await loadRegistry();
  return registry ? registry.sources : fallbackSources.files;
}

function publicEntry(entry) {
  return {
    ...entry,
    artifacts: (entry.artifacts || []).map((artifact) => {
      const copy = { ...artifact };
      delete copy.sources;
      return copy;
    }),
  };
}

function searchRecord(entry) {
  return {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    summary: entry.summary,
    tags: entry.tags,
    categories: entry.categories,
    platforms: entry.platforms,
    updatedAt: entry.updatedAt,
    downloads: entry.downloads,
  };
}

function jsonResponse(statusCode, body, cacheControl, extra) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      ...(extra || {}),
    },
    body: JSON.stringify(body),
  };
}

function fallbackResponse(kind, params) {
  let body;
  if (kind === "index") body = fallbackIndex;
  else if (kind === "search") body = fallbackSearch;
  else if (kind === "manifest") body = fallbackManifest;
  else if (kind === "extension") {
    const id = String(params.id || "").replace(/\.json$/, "");
    body = (fallbackIndex.extensions || []).find((entry) => entry.id === id);
    if (!body) {
      return jsonResponse(404, { error: "extension not found" }, CACHE_FALLBACK,
        { "X-RWPP-Registry": "fallback" });
    }
  } else {
    return jsonResponse(404, { error: "unknown catalog endpoint" }, CACHE_FALLBACK,
      { "X-RWPP-Registry": "fallback" });
  }
  return jsonResponse(200, body, CACHE_FALLBACK, { "X-RWPP-Registry": "fallback" });
}

/** Render one of the four /api/v1 endpoints from the live registry. */
async function renderCatalog(kind, params) {
  const registry = await loadRegistry();
  if (!registry || !secretKey(process.env.RWPP_ARCHIVE_SECRET)) {
    return fallbackResponse(kind, params);
  }
  const now = Math.floor(Date.now() / 1000);
  const entries = registry.extensions.map((entry) => ({
    ...entry,
    artifacts: (entry.artifacts || []).map((artifact) => {
      const url = signUrl(artifact.url, now);
      return url ? { ...artifact, url } : null;
    }),
  }));
  if (entries.some((entry) => entry.artifacts.some((artifact) => !artifact))) {
    return fallbackResponse(kind, params);
  }

  let body;
  if (kind === "index") {
    body = {
      schemaVersion: registry.schemaVersion || 1,
      name: registry.name,
      generatedAt: registry.generatedAt,
      registryUpdatedAt: registry.updatedAt || "",
      extensions: entries.map(publicEntry),
    };
  } else if (kind === "search") {
    body = {
      schemaVersion: registry.schemaVersion || 1,
      generatedAt: registry.generatedAt,
      extensions: entries.map(searchRecord),
    };
  } else if (kind === "manifest") {
    body = {
      schemaVersion: registry.schemaVersion || 1,
      generatedAt: registry.generatedAt,
      count: entries.length,
      endpoints: {
        catalog: "/api/v1/index.json",
        search: "/api/v1/search.json",
        searchFunction: "/api/search?q=",
        extension: "/api/v1/extensions/{id}.json",
      },
    };
  } else if (kind === "extension") {
    const id = String(params.id || "").replace(/\.json$/, "");
    const entry = entries.find((item) => item.id === id);
    if (!entry) {
      return jsonResponse(404, { error: "extension not found" }, CACHE_LIVE,
        { "X-RWPP-Registry": "r2" });
    }
    body = publicEntry(entry);
  } else {
    return jsonResponse(404, { error: "unknown catalog endpoint" }, CACHE_LIVE,
      { "X-RWPP-Registry": "r2" });
  }
  return jsonResponse(200, body, CACHE_LIVE, { "X-RWPP-Registry": "r2" });
}

async function getIndex() {
  const response = await renderCatalog("index", {});
  return response.statusCode === 200 ? JSON.parse(response.body) : fallbackIndex;
}

module.exports = {
  sha256, hmac, uriEncode, equal, secretKey, r2Location, presign, verifyToken, signUrl,
  loadRegistry, resetCache, getSources, getIndex, renderCatalog,
};
