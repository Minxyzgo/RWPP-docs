/*
 * GET /api/search?q=<text>&platform=<jvm|android>&category=<name>&limit=<n>
 *
 * 服务端搜索：在构建时随函数一起打包目录数据，冷启动后只做内存匹配。返回结构与
 * /api/v1/index.json 中的条目一致，便于客户端复用同一套渲染逻辑。
 */

// The generated catalog carries the signed archive URLs; the source registry is
// only build input. Source addresses are removed before results are returned.
const catalog = require("../../docs/api/v1/index.json");

const PLATFORMS = new Set(["jvm", "android"]);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const ipHits = new Map();

function rateLimited(client) {
  const now = Date.now();
  const hits = (ipHits.get(client) || []).filter((at) => now - at < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    ipHits.set(client, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(client, hits);
  if (ipHits.size > 4096) {
    for (const [key, values] of ipHits) {
      if (values.every((at) => now - at >= RATE_WINDOW_MS)) ipHits.delete(key);
    }
  }
  return false;
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

function normalize(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function score(entry, tokens) {
  const id = normalize(entry.id);
  const name = normalize(entry.name);
  const summary = normalize(entry.summary);
  const description = normalize(entry.description);
  const keywords = new Set(
    [id, name, ...(entry.tags || []), ...(entry.categories || [])]
      .flatMap((value) => normalize(value).split(/[^a-z0-9\u4e00-\u9fa5]+/))
      .filter(Boolean)
  );
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    if (id === token) best = 120;
    else if (id.startsWith(token)) best = 90;
    else if (id.includes(token)) best = 70;
    if (name === token) best = Math.max(best, 110);
    else if (name.startsWith(token)) best = Math.max(best, 85);
    else if (name.includes(token)) best = Math.max(best, 65);
    if (keywords.has(token)) best = Math.max(best, 45);
    if (summary.includes(token)) best = Math.max(best, 25);
    if (description.includes(token)) best = Math.max(best, 10);
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

function payload(body, statusCode, extraHeaders) {
  return {
    statusCode: statusCode || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Cache-Control": statusCode >= 400 ? "no-store" : "public, max-age=300",
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return payload({}, 204);
  }
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return payload({ error: "Only GET is supported" }, 405);
  }
  const client = event.headers["x-nf-client-connection-ip"]
    || event.headers["x-forwarded-for"]
    || "unknown";
  if (rateLimited(client)) {
    return payload({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }

  const query = event.queryStringParameters || {};
  const text = normalize(query.q);
  const platform = normalize(query.platform);
  const category = normalize(query.category);
  const requested = Number.parseInt(query.limit || "50", 10);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 200) : 50;

  if (platform && !PLATFORMS.has(platform)) {
    return payload({ error: `Unsupported platform: ${platform}` }, 400);
  }

  const tokens = text ? text.split(/\s+/).filter(Boolean) : [];
  const matches = [];
  for (const entry of catalog.extensions || []) {
    if (platform && !(entry.platforms || []).includes(platform)) continue;
    if (category && !(entry.categories || []).map(normalize).includes(category)) continue;
    const rank = tokens.length === 0 ? 1 : score(entry, tokens);
    if (rank > 0) matches.push({ entry, rank });
  }

  matches.sort((left, right) => right.rank - left.rank ||
    String(left.entry.name).localeCompare(String(right.entry.name), "zh"));

  return payload({
    schemaVersion: catalog.schemaVersion || 1,
    query: { q: text, platform, category },
    total: matches.length,
    results: matches.slice(0, limit).map((match) => publicEntry(match.entry)),
  });
};
