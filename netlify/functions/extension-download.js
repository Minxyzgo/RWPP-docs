/*
 * GET /api/archives/<file>
 *
 * 扩展归档存放在 Netlify Blobs 的 extensions 仓库。函数读取边缘地址后原样返回，
 * 不引入 npm 依赖，因此站点构建不需要安装 Node 包。
 */

const { basename } = require("node:path");

const STORE = "extensions";
const MARKER = "/api/archives/";
const CACHE = "public, max-age=31536000, immutable";

function blobContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) {
    return null;
  }
  // 运行时注入的上下文是 base64 编码的 JSON，含站点、令牌与边缘地址。
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

function requestedName(event) {
  const fromQuery = event.queryStringParameters && event.queryStringParameters.file;
  if (fromQuery) {
    return decodeURIComponent(String(fromQuery).trim());
  }
  const path = event.path || "";
  const index = path.indexOf(MARKER);
  return index >= 0 ? decodeURIComponent(path.slice(index + MARKER.length)) : "";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return { statusCode: 405, headers: { Allow: "GET, HEAD" }, body: "Method not allowed" };
  }

  const name = requestedName(event);
  // 只接受单层文件名：目录分隔与上级引用一律拒绝。
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return { statusCode: 404, body: "Extension archive not found" };
  }

  const context = blobContext();
  if (!context || !context.token) {
    console.error("Blob context is unavailable; cannot read extension archives.");
    return { statusCode: 503, body: "Extension archive storage is unavailable" };
  }

  const base = (context.uncachedEdgeURL || context.edgeURL || "").replace(/\/$/, "");
  const target = `${base}/${STORE}/${encodeURIComponent(name)}`;
  const upstream = await fetch(target, {
    headers: { Authorization: `Bearer ${context.token}` },
    cache: "no-store",
  });

  if (upstream.status === 404) {
    return { statusCode: 404, body: "Extension archive not found" };
  }
  if (!upstream.ok) {
    console.error(`Blob read failed for ${name}: ${upstream.status}`);
    return { statusCode: 502, body: "Extension archive storage is unavailable" };
  }

  const headers = {
    "Content-Type": "application/java-archive",
    "Content-Disposition": `attachment; filename="${basename(name)}"`,
    "Cache-Control": CACHE,
    "X-Content-Type-Options": "nosniff",
  };
  const etag = upstream.headers.get("etag");
  if (etag) {
    headers.ETag = etag;
    if (event.headers["if-none-match"] === etag) {
      return { statusCode: 304, headers, body: "" };
    }
  }

  if (event.httpMethod === "HEAD") {
    return { statusCode: 200, headers, body: "" };
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  return { statusCode: 200, headers, body: buffer.toString("base64"), isBase64Encoded: true };
};
