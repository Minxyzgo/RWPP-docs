// 构建阶段把目录中的扩展归档同步到 Netlify Blobs，并把下载地址改写为站点路径。
//
// 只在 Netlify 构建环境里运行：那里会注入 NETLIFY_BLOBS_CONTEXT（base64 JSON）。
// 本地构建缺少上下文时静默跳过，目录保持原样。
//
// 已存在的对象不再下载，因此重复部署只处理新增或替换的归档。

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(ROOT, "data/extensions.json");
const STATUS = resolve(ROOT, "data/blob-status.json");
const STORE = "extensions";
const SITE_PREFIX = "/api/archives/";

function blobContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) {
    return null;
  }
  return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
}

function archiveName(url) {
  try {
    return basename(new URL(url).pathname);
  } catch {
    return "";
  }
}

async function writeStatus(status) {
  await writeFile(STATUS, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

async function exists(context, name) {
  const base = (context.uncachedEdgeURL || context.edgeURL || "").replace(/\/$/, "");
  const response = await fetch(`${base}/${STORE}/${encodeURIComponent(name)}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${context.token}` },
  });
  return response.status === 200;
}

async function upload(context, name, url) {
  const base = (context.uncachedEdgeURL || context.edgeURL || "").replace(/\/$/, "");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`download failed for ${name}: ${response.status}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const put = await fetch(`${base}/${STORE}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${context.token}`,
      "Content-Type": "application/octet-stream",
    },
    body: data,
  });
  if (!put.ok) {
    throw new Error(`upload failed for ${name}: ${put.status} ${await put.text()}`);
  }
  console.log(`synced ${name} ${data.byteLength} bytes`);
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  const context = blobContext();
  if (!context || !context.token) {
    // 本地或不支持 Blobs 的环境：保留原有下载地址。
    console.log("Blob context is unavailable; keeping the catalog download urls.");
    await writeStatus({ available: false, reason: "no-blob-context" });
    return;
  }

  const manifest = JSON.parse(await readFile(SOURCE, "utf8"));
  const result = { available: true, synced: [], reused: [], failed: [], rewritten: 0 };

  for (const entry of manifest.extensions ?? []) {
    for (const artifact of entry.artifacts ?? []) {
      if (String(artifact.url).startsWith(SITE_PREFIX)) {
        result.reused.push(artifact.url.slice(SITE_PREFIX.length));
        continue;
      }
      const name = archiveName(artifact.url);
      if (!name) {
        result.failed.push({ url: artifact.url, reason: "unreadable-name" });
        continue;
      }
      try {
        if (await exists(context, name)) {
          result.reused.push(name);
        } else {
          const digest = await upload(context, name, artifact.url);
          if (artifact.sha256 && digest !== artifact.sha256) {
            result.failed.push({ name, reason: `sha256 mismatch: ${digest}` });
            continue;
          }
          result.synced.push(name);
        }
        artifact.url = `${SITE_PREFIX}${name}`;
        result.rewritten += 1;
      } catch (error) {
        result.failed.push({ name, reason: String(error.message || error) });
      }
    }
  }

  await writeFile(SOURCE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeStatus(result);
  console.log(`archives: ${result.synced.length} synced, ${result.reused.length} reused, ${result.failed.length} failed`);
}

await main();
