import { getStore } from "@netlify/blobs";

// 扩展归档存放在 Netlify Blobs 的 extensions 仓库里，函数只负责按名称读取并输出。
// 路径形如 /api/archives/rwpp-client-2.0.0-jvm.jar，与目录条目中的 url 字段一致。
// 不使用 /api/extensions/：那条路径已经用于单条扩展的 JSON。
const STORE = "extensions";
const MARKER = "/api/archives/";
const CACHE = "public, max-age=31536000, immutable";

function requestedName(url) {
  // 站点路由会把文件名放进 file 查询参数；直接调用函数时按路径解析。
  const fromQuery = url.searchParams.get("file");
  if (fromQuery) {
    return decodeURIComponent(fromQuery.trim());
  }
  const index = url.pathname.indexOf(MARKER);
  if (index < 0) {
    return "";
  }
  return decodeURIComponent(url.pathname.slice(index + MARKER.length));
}

function notFound() {
  return new Response("Extension archive not found", { status: 404 });
}

export default async (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const name = requestedName(new URL(request.url));
  // 只接受单层文件名：目录分隔与上级引用一律拒绝。
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return notFound();
  }

  const store = getStore(STORE);
  const entry = await store.getWithMetadata(name, { type: "stream" });
  if (!entry || !entry.data) {
    return notFound();
  }

  const etag = entry.etag ? `"${entry.etag}"` : null;
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  const headers = new Headers({
    "Content-Type": "application/java-archive",
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": CACHE,
    "X-Content-Type-Options": "nosniff",
  });
  if (etag) {
    headers.set("ETag", etag);
  }
  const digest = entry.metadata && entry.metadata.sha256;
  if (digest) {
    headers.set("X-Checksum-Sha256", digest);
  }

  // HEAD 只需头部信息，避免把归档读入响应体。
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(entry.data, { status: 200, headers });
};

export const config = { path: "/api/archives/*", preferStatic: false };
