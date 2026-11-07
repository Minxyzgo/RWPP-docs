#!/usr/bin/env node
/*
 * Local verification for the R2 runtime registry.
 *
 * Run after scripts/build_local.py and scripts/generate_registry.py:
 *   RWPP_ARCHIVE_SECRET=<the site secret> node scripts/verify_local.js
 *
 * Everything is offline. R2, GitHub and Cloudflare API calls are replaced by an
 * in-process mock, and a small HTTP server applies the generated _redirects
 * rules to the real function handlers. No deploy is performed.
 */

"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "site");
const REGISTRY = path.join(ROOT, "build", "registry.json");
const SECRET = process.env.RWPP_ARCHIVE_SECRET;

if (!SECRET) {
  console.error("RWPP_ARCHIVE_SECRET is required");
  process.exit(2);
}

process.env.RWPP_ARCHIVE_SECRET = SECRET;
process.env.RWPP_R2_ACCOUNT_ID = process.env.RWPP_R2_ACCOUNT_ID || "test-account";
process.env.RWPP_R2_BUCKET = "rwpp";
process.env.RWPP_R2_PREFIX = "extensions";
process.env.RWPP_R2_ACCESS_KEY_ID = "test-access-key";
process.env.RWPP_R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.RWPP_R2_DISABLED = "false";
delete process.env.RWPP_R2_QUOTA_STATE;

const realFetch = global.fetch;
const rwpp = require(path.join(ROOT, "netlify/lib/rwpp.js"));
const functions = {
  catalog: require(path.join(ROOT, "netlify/functions/catalog.js")),
  search: require(path.join(ROOT, "netlify/functions/search.js")),
  "archive-download": require(path.join(ROOT, "netlify/functions/archive-download.js")),
};

const staticIndex = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/api/v1/index.json"), "utf8"));
const staticSearch = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/api/v1/search.json"), "utf8"));
const staticManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/api/v1/manifest.json"), "utf8"));
const staticExtension = JSON.parse(fs.readFileSync(
  path.join(ROOT, "docs/api/v1/extensions/io.github.rwpp.json"), "utf8"));
const fallbackSources = JSON.parse(fs.readFileSync(
  path.join(ROOT, "netlify/functions/archive-sources.json"), "utf8")).files;

let registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
let registryFails = false;
let githubAvailable = true;
let registryReads = 0;
const objectSizes = new Map();
let ipCounter = 0;

const key = /^[0-9a-fA-F]+$/.test(SECRET) && SECRET.length % 2 === 0
  ? Buffer.from(SECRET, "hex")
  : Buffer.from(SECRET, "utf8");

function makeToken(file, salt = 0) {
  const now = Math.floor(Date.now() / 1000) - salt;
  const claims = { f: file, s: now, e: now + 30 * 24 * 3600 };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = crypto.createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

global.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("registry.json")) {
    registryReads += 1;
    if (registryFails) throw new Error("simulated R2 outage");
    return new Response(JSON.stringify(registry), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }
  if (url.includes("api.cloudflare.com")) {
    return new Response(JSON.stringify({ result: { payloadSize: 0, metadataSize: 0 } }),
      { status: 200 });
  }
  if (url.includes("r2.cloudflarestorage.com")) {
    const match = url.match(/\/([A-Za-z0-9._-]+\.jar)\?/);
    const name = match ? match[1] : "";
    const record = registry.sources[name] || fallbackSources[name];
    if (!record) return new Response("", { status: 404 });
    const size = objectSizes.has(name) ? objectSizes.get(name) : record.size;
    return new Response("", { status: 200, headers: { "content-length": String(size) } });
  }
  if (url.includes("github.com")) {
    return new Response("", { status: githubAvailable ? 200 : 404 });
  }
  return new Response("", { status: 404 });
};

function catalogEvent(kind, id) {
  return {
    path: "/api/v1/index.json",
    rawUrl: `https://rwpp-team.top/api/v1/index.json?kind=${kind}`,
    httpMethod: "GET",
    queryStringParameters: id ? { kind, id } : { kind },
    headers: {},
  };
}

function searchEvent(query) {
  const params = new URLSearchParams(query);
  return {
    path: "/api/search",
    rawUrl: `https://rwpp-team.top/api/search?${params}`,
    httpMethod: "GET",
    queryStringParameters: Object.fromEntries(params),
    headers: { "x-nf-client-connection-ip": `10.8.0.${++ipCounter}` },
  };
}

function archiveEvent(file, token, extra) {
  const query = { file, ...(token ? { k: token } : {}), ...(extra || {}) };
  return {
    path: `/api/archives/${file}`,
    rawUrl: `https://rwpp-team.top/api/archives/${file}?${new URLSearchParams(query)}`,
    httpMethod: "GET",
    queryStringParameters: query,
    headers: { "x-nf-client-connection-ip": `10.9.0.${++ipCounter}` },
  };
}

function comparable(payload) {
  const copy = JSON.parse(JSON.stringify(payload));
  delete copy.generatedAt;
  for (const entry of copy.extensions || []) {
    for (const artifact of entry.artifacts || []) {
      if (artifact.url) artifact.url = artifact.url.split("?")[0];
    }
  }
  if (copy.artifacts) {
    for (const artifact of copy.artifacts) {
      if (artifact.url) artifact.url = artifact.url.split("?")[0];
    }
  }
  if (copy.url) copy.url = copy.url.split("?")[0];
  return copy;
}

function tokensOf(payload) {
  const result = [];
  for (const entry of payload.extensions || []) {
    for (const artifact of entry.artifacts || []) {
      const url = new URL(artifact.url);
      result.push([path.posix.basename(url.pathname), url.searchParams.get("k")]);
    }
  }
  if (payload.url) {
    const url = new URL(payload.url);
    result.push([path.posix.basename(url.pathname), url.searchParams.get("k")]);
  }
  return result;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push(["FAIL", name, error.message]);
    console.error(`FAIL  ${name}: ${error.message}`);
  }
}

function parseRules() {
  return fs.readFileSync(path.join(SITE, "_redirects"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [from, to, status] = line.split("\t");
      const names = [];
      const pattern = from
        .replace(/:([A-Za-z]\w*)/g, (_, name) => { names.push(name); return "([^/]+)"; })
        .replace(/\*/g, "(.*)");
      return {
        from, to, names,
        code: Number.parseInt(status, 10),
        force: status.endsWith("!"),
        re: new RegExp(`^${pattern}$`),
      };
    });
}

async function httpEndToEnd() {
  const rules = parseRules();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    for (const rule of rules) {
      const match = url.pathname.match(rule.re);
      if (!match) continue;
      let target = rule.to;
      rule.names.forEach((name, index) => {
        target = target.replace(`:${name}`, match[index + 1]);
      });
      if (rule.code >= 300) {
        response.writeHead(rule.code, { Location: target });
        response.end();
        return;
      }
      const rewritten = new URL(target, "http://127.0.0.1");
      const name = rewritten.pathname.split("/").pop();
      const query = Object.fromEntries(rewritten.searchParams);
      for (const [param, value] of url.searchParams) {
        if (!(param in query)) query[param] = value;
      }
      const fn = functions[name];
      if (!fn) {
        response.writeHead(500);
        response.end(`unknown function ${name}`);
        return;
      }
      const event = {
        path: url.pathname,
        rawUrl: `https://rwpp-team.top${url.pathname}${url.search}`,
        httpMethod: request.method,
        queryStringParameters: query,
        headers: { "x-nf-client-connection-ip": "127.0.0.1" },
      };
      const result = await fn.handler(event);
      response.writeHead(result.statusCode, result.headers);
      response.end(result.body || "");
      return;
    }
    const file = path.join(SITE, url.pathname);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(fs.readFileSync(file));
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await realFetch(`${base}/api/v1/index.json`);
    assert.equal(index.status, 200);
    assert.equal(index.headers.get("x-rwpp-registry"), "r2");
    const body = await index.json();
    assert.equal(body.extensions[0].version, registry.extensions[0].version);

    const alias = await realFetch(`${base}/api/index.json`);
    assert.equal(alias.status, 200);
    assert.equal((await alias.json()).extensions[0].version, registry.extensions[0].version);

    const extension = await realFetch(`${base}/api/v1/extensions/io.github.rwpp.json`);
    assert.equal(extension.status, 200);
    assert.equal((await extension.json()).id, "io.github.rwpp");

    const search = await realFetch(`${base}/api/search?q=rwpp`);
    assert.equal(search.status, 200);
    assert.ok((await search.json()).total >= 1);

    const file = Object.keys(registry.sources)[0];
    const download = await realFetch(
      `${base}/api/archives/${file}?k=${makeToken(file, 900)}`, { redirect: "manual" });
    assert.equal(download.status, 302);
    assert.equal(download.headers.get("x-rwpp-source"), "r2");

    const external = await realFetch(`${base}/downloads/game-lib.jar`, { redirect: "manual" });
    assert.equal(external.status, 302);
    assert.ok(external.headers.get("location").includes("github.com"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  rwpp.resetCache();

  await check("registry document is complete", () => {
    assert.ok(Array.isArray(registry.extensions) && registry.extensions.length);
    assert.ok(Object.keys(registry.sources).length >= 4);
    assert.equal(typeof registry.generatedAt, "string");
    for (const [name, record] of Object.entries(registry.sources)) {
      assert.ok(record.github.includes(name), `${name} fallback address`);
      assert.ok(record.size > 0 && /^[0-9a-f]{64}$/.test(record.sha256));
    }
  });

  await check("catalog index matches the build-time snapshot", async () => {
    const response = await functions.catalog.handler(catalogEvent("index"));
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["X-RWPP-Registry"], "r2");
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(comparable(body), comparable(staticIndex));
    for (const entry of body.extensions) {
      for (const artifact of entry.artifacts) assert.equal(artifact.sources, undefined);
    }
    for (const [file, token] of tokensOf(body)) {
      assert.ok(rwpp.verifyToken(token, file), `runtime token for ${file}`);
      assert.equal(functions["archive-download"].verifyToken(token, "other.jar"), null);
    }
  });

  await check("build-time Python tokens verify in the Node runtime", () => {
    for (const [file, token] of tokensOf(staticIndex)) {
      assert.ok(functions["archive-download"].verifyToken(token, file), file);
    }
  });

  await check("search, manifest and extension endpoints match the snapshot", async () => {
    const search = await functions.catalog.handler(catalogEvent("search"));
    assert.deepStrictEqual(comparable(JSON.parse(search.body)), comparable(staticSearch));
    const manifest = await functions.catalog.handler(catalogEvent("manifest"));
    assert.deepStrictEqual(comparable(JSON.parse(manifest.body)), comparable(staticManifest));
    const extension = await functions.catalog.handler(catalogEvent("extension", "io.github.rwpp.json"));
    assert.deepStrictEqual(comparable(JSON.parse(extension.body)), comparable(staticExtension));
  });

  await check("unknown endpoints are rejected", async () => {
    assert.equal((await functions.catalog.handler(catalogEvent("nope"))).statusCode, 404);
    assert.equal((await functions.catalog.handler(catalogEvent("extension", "missing"))).statusCode, 404);
  });

  let updatedFile;
  await check("replacing only the R2 object changes the live catalog", async () => {
    updatedFile = Object.keys(registry.sources)[0];
    const entry = registry.extensions[0];
    const artifact = entry.artifacts.find((item) => item.url.includes(updatedFile));
    assert.ok(artifact, "artifact for the updated archive");
    artifact.sha256 = "a".repeat(64);
    artifact.size += 1;
    registry.sources[updatedFile].sha256 = artifact.sha256;
    registry.sources[updatedFile].size = artifact.size;
    entry.version = "2.0.0-beta03";
    entry.updatedAt = "2026-11-06";
    registry.generatedAt = "2026-11-06T00:00:00Z";
    objectSizes.set(updatedFile, artifact.size);
    rwpp.resetCache();

    const response = await functions.catalog.handler(catalogEvent("index"));
    const body = JSON.parse(response.body);
    assert.equal(response.headers["X-RWPP-Registry"], "r2");
    assert.equal(body.generatedAt, "2026-11-06T00:00:00Z");
    assert.equal(body.extensions[0].version, "2.0.0-beta03");
    const published = body.extensions[0].artifacts.find((item) => item.url.includes(updatedFile));
    assert.equal(published.sha256, "a".repeat(64));
    assert.equal(published.size, registry.sources[updatedFile].size);
    for (const [file, token] of tokensOf(body)) {
      assert.ok(rwpp.verifyToken(token, file));
    }
  });

  await check("archive entry follows the updated registry metadata", async () => {
    const response = await functions["archive-download"].handler(
      archiveEvent(updatedFile, makeToken(updatedFile, 100)));
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers["X-RWPP-Source"], "r2");
    assert.ok(response.headers.Location.includes("r2.cloudflarestorage.com"));
  });

  await check("stale R2 object falls back to GitHub", async () => {
    const expected = registry.sources[updatedFile].size;
    objectSizes.set(updatedFile, expected + 100);
    const response = await functions["archive-download"].handler(
      archiveEvent(updatedFile, makeToken(updatedFile, 200)));
    objectSizes.set(updatedFile, expected);
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers["X-RWPP-Source"], "github");
    assert.ok(response.headers.Location.includes("github.com"));
  });

  await check("quota switch stops issuing R2 addresses", async () => {
    process.env.RWPP_R2_DISABLED = "true";
    const response = await functions["archive-download"].handler(
      archiveEvent(updatedFile, makeToken(updatedFile, 300)));
    process.env.RWPP_R2_DISABLED = "false";
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers["X-RWPP-Source"], "github");
  });

  await check("archive entry rejects unknown files and invalid tokens", async () => {
    assert.equal((await functions["archive-download"].handler(
      archiveEvent("unknown.jar", makeToken("unknown.jar", 400)))).statusCode, 404);
    assert.equal((await functions["archive-download"].handler(
      archiveEvent(updatedFile, null))).statusCode, 401);
    assert.equal((await functions["archive-download"].handler(
      archiveEvent(updatedFile, "bad.token"))).statusCode, 401);
  });

  await check("search function serves the updated registry", async () => {
    const response = await functions.search.handler(searchEvent({ q: "rwpp" }));
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.ok(body.total >= 1);
    assert.equal(body.results[0].version, "2.0.0-beta03");
    assert.equal(body.results[0].artifacts[0].sources, undefined);
  });

  await check("search function keeps its query contract", async () => {
    const unsupported = await functions.search.handler(searchEvent({ platform: "windows" }));
    assert.equal(unsupported.statusCode, 400);
    assert.equal((await functions.search.handler({
      ...searchEvent({}), httpMethod: "POST",
    })).statusCode, 405);
    assert.equal((await functions.search.handler({
      ...searchEvent({}), httpMethod: "OPTIONS",
    })).statusCode, 204);
  });

  await check("R2 outage falls back to the deploy snapshot", async () => {
    registryFails = true;
    rwpp.resetCache();
    const response = await functions.catalog.handler(catalogEvent("index"));
    const sources = await rwpp.getSources();
    registryFails = false;
    rwpp.resetCache();
    assert.equal(response.headers["X-RWPP-Registry"], "fallback");
    assert.deepStrictEqual(JSON.parse(response.body), staticIndex);
    assert.ok(sources[updatedFile]);
    assert.equal(sources[updatedFile].size, fallbackSources[updatedFile].size);
  });

  await check("missing signing key falls back instead of unsigned URLs", async () => {
    process.env.RWPP_ARCHIVE_SECRET = "";
    rwpp.resetCache();
    const response = await functions.catalog.handler(catalogEvent("index"));
    process.env.RWPP_ARCHIVE_SECRET = SECRET;
    rwpp.resetCache();
    assert.equal(response.headers["X-RWPP-Registry"], "fallback");
  });

  await check("generated redirect and header rules are complete", () => {
    const redirects = fs.readFileSync(path.join(SITE, "_redirects"), "utf8");
    const catalogRules = redirects.split(/\r?\n/).filter((line) => line.includes("functions/catalog"));
    assert.equal(catalogRules.length, 6, "six catalog rules");
    for (const rule of catalogRules) assert.ok(rule.endsWith("200!"), rule);
    assert.ok(redirects.includes("&id=:id"));
    assert.ok(redirects.includes("/api/archives/:file\t/.netlify/functions/archive-download?file=:file\t200!"));
    assert.ok(redirects.includes("/api/search\t/.netlify/functions/search\t200"));
    const headers = fs.readFileSync(path.join(SITE, "_headers"), "utf8");
    for (const rule of ["/api/*", "/api/v1/*", "/assets/*", "/api/archives/*"]) {
      assert.ok(headers.includes(rule), rule);
    }
  });

  await check("HTTP end-to-end over the generated rules", httpEndToEnd);

  const failed = results.filter((entry) => entry[0] === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(`R2 registry reads: ${registryReads}`);
  if (failed.length) {
    for (const [, name, message] of failed) console.error(`  ${name}: ${message}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
