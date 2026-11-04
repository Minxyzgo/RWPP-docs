/*
 * GET /api/archives/<file>?k=<token>
 *
 * Extension archives live in a private Cloudflare R2 bucket. Every download must
 * present a signed token from the catalog, and the function issues a short-lived
 * S3 presigned URL only after the quota gate is clear. When R2 is unavailable or
 * the free-tier budget is exhausted, GitHub Release is used instead. No R2
 * address is issued in that case, so a paused service cannot generate charges.
 *
 * The source map is generated from data/extensions.json by scripts/generate_api.py.
 */

const crypto = require("node:crypto");
const sources = require("./archive-sources.json");

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.jar$/;
const ARCHIVE_PATH = "/api/archives/";
const PROBE_TIMEOUT_MS = 4000;
const PRESIGN_SECONDS = 300;
const RATE_WINDOW_MS = 60_000;
const TOKEN_RATE_LIMIT = 5;
const IP_RATE_LIMIT = 20;
// Both budgets sit far below the free tier, so per-instance counting cannot
// drift past the paid threshold even when several function instances run.
const MONTHLY_BUDGET = Number(process.env.RWPP_R2_MONTHLY_BUDGET || 500_000);
const TOKEN_LIFETIME_LIMIT = 10_000;

const rateHits = new Map();
const tokenSpend = new Map();
let issued = { month: "", count: 0 };
let usageCache = { at: 0, bytes: 0, valid: false };

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

/** Verify the catalog token: HMAC signature, file binding, sequence and expiry. */
function verifyToken(token, file) {
  if (!token || typeof token !== "string") {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return null;
  }
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const secret = process.env.RWPP_ARCHIVE_SECRET;
  if (!secret) {
    return null;
  }
  let key;
  try {
    key = Buffer.from(secret, "hex");
  } catch {
    key = Buffer.from(secret, "utf8");
  }
  if (key.length === 0) {
    key = Buffer.from(secret, "utf8");
  }
  const expected = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  if (!equal(signature, expected)) {
    return null;
  }
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

/** Per-instance sliding window. It stops bursts; the token and quota gate stop sustained abuse. */
function rateLimited(key, limit) {
  const now = Date.now();
  const hits = (rateHits.get(key) || []).filter((at) => now - at < RATE_WINDOW_MS);
  if (hits.length >= limit) {
    rateHits.set(key, hits);
    return true;
  }
  hits.push(now);
  rateHits.set(key, hits);
  if (rateHits.size > 4096) {
    for (const [entry, values] of rateHits) {
      if (values.every((at) => now - at >= RATE_WINDOW_MS)) {
        rateHits.delete(entry);
      }
    }
  }
  return false;
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function markIssued() {
  const month = monthKey();
  if (issued.month !== month) {
    issued = { month, count: 0 };
  }
  issued.count += 1;
}

/** Read the live storage figure from Cloudflare. A failed read disables R2 conservatively. */
async function storageBytes() {
  if (usageCache.valid && Date.now() - usageCache.at < 600_000) {
    return usageCache.bytes;
  }
  const token = process.env.RWPP_R2_API_TOKEN;
  const account = process.env.RWPP_R2_ACCOUNT_ID;
  if (!token || !account) {
    return null;
  }
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/rwpp/usage`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
    );
    if (!response.ok) {
      return null;
    }
    const document = await response.json();
    const result = document && document.result;
    if (!result) {
      return null;
    }
    const bytes = Number(result.payloadSize || 0) + Number(result.metadataSize || 0);
    usageCache = { at: Date.now(), bytes, valid: true };
    return bytes;
  } catch {
    return null;
  }
}

/** Reasons to stop issuing R2 addresses. Any of them routes the request to GitHub. */
async function quotaBlock() {
  if (process.env.RWPP_R2_DISABLED === "true") {
    return "r2 service switched off";
  }
  const limit = Number(process.env.RWPP_R2_CLASS_B_LIMIT || 9_000_000);
  const storageLimit = Number(process.env.RWPP_R2_STORAGE_LIMIT || 9 * 1024 * 1024 * 1024);
  let state = {};
  try {
    state = JSON.parse(process.env.RWPP_R2_QUOTA_STATE || "{}");
  } catch {
    state = {};
  }
  const month = monthKey();
  if (state.month === month && Number(state.classB || 0) >= limit) {
    return "class B operation budget exhausted";
  }
  if (state.month === month && Number(state.storageBytes || 0) >= storageLimit) {
    return "storage budget exhausted";
  }
  const runtimeLimit = Math.min(limit, MONTHLY_BUDGET);
  if (issued.month === month && issued.count >= runtimeLimit) {
    return "monthly R2 budget exhausted";
  }
  const bytes = await storageBytes();
  if (bytes !== null && bytes >= storageLimit) {
    return "cloudflare storage over the free tier";
  }
  return null;
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
  if (!accessKey || !secret) {
    return null;
  }
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

async function head(url, verifySize, size) {
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    headers: { "User-Agent": "rwpp-docs" },
  });
  if (!response.ok) {
    return false;
  }
  if (verifySize) {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 0 && declared !== size) {
      return false;
    }
  }
  return true;
}

function redirect(location, source, reason) {
  const headers = {
    Location: location,
    "Cache-Control": "no-store",
    "X-RWPP-Source": source,
  };
  if (reason) {
    headers["X-RWPP-Reason"] = reason;
  }
  return { statusCode: 302, headers, body: "" };
}

function failure(status, message, extra) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extra || {}),
    },
    body: JSON.stringify({ error: message }),
  };
}

function rawQuery(event) {
  if (!event.rawUrl) {
    return null;
  }
  try {
    return new URL(event.rawUrl).searchParams;
  } catch {
    return null;
  }
}

function requestedFile(event) {
  const query = event.queryStringParameters || {};
  if (query.file) {
    return String(query.file).trim();
  }
  const raw = event.path || "";
  const index = raw.indexOf(ARCHIVE_PATH);
  if (index >= 0) {
    return raw.slice(index + ARCHIVE_PATH.length).split("?")[0];
  }
  const params = rawQuery(event);
  return params ? params.get("file") || "" : "";
}

function requestedToken(event) {
  const query = event.queryStringParameters || {};
  if (query.k) {
    return String(query.k);
  }
  const params = rawQuery(event);
  return params ? params.get("k") || "" : "";
}

// Exported for local verification; Netlify only invokes the handler.
exports.presign = presign;
exports.verifyToken = verifyToken;

exports.handler = async (event) => {
  const file = requestedFile(event);
  if (!file || !FILE_NAME.test(file)) {
    return failure(400, "invalid archive name");
  }
  const record = sources.files[file];
  if (!record) {
    return failure(404, "archive not found");
  }
  const token = requestedToken(event);
  const claims = verifyToken(token, file);
  if (!claims) {
    return failure(401, "invalid or expired archive token");
  }
  const spent = tokenSpend.get(token) || 0;
  const tokenExhausted = spent >= TOKEN_LIFETIME_LIMIT;
  const client = event.headers["x-nf-client-connection-ip"]
    || event.headers["x-forwarded-for"]
    || "unknown";
  if (rateLimited(`token:${token}`, TOKEN_RATE_LIMIT) || rateLimited(`ip:${client}`, IP_RATE_LIMIT)) {
    return failure(429, "too many archive requests", { "Retry-After": "60" });
  }

  const blocked = await quotaBlock();
  const r2Reason = blocked || (tokenExhausted ? "archive token budget exhausted" : null);
  if (!r2Reason && record.r2) {
    try {
      const probe = presign("HEAD", record.r2, PRESIGN_SECONDS);
      if (probe && (await head(probe, true, record.size))) {
        const location = presign("GET", record.r2, PRESIGN_SECONDS);
        if (location) {
          markIssued();
          tokenSpend.set(token, spent + 1);
          return redirect(location, "r2");
        }
      }
    } catch (error) {
      console.warn(`archive-download: r2 probe failed: ${error.message}`);
    }
  }

  try {
    if (await head(record.github, false, record.size)) {
      return redirect(record.github, "github", r2Reason || "r2 unavailable");
    }
  } catch (error) {
    console.warn(`archive-download: github probe failed: ${error.message}`);
  }

  return failure(503, "archive service is paused", {
    "X-RWPP-Reason": r2Reason || "all sources unavailable",
  });
};
