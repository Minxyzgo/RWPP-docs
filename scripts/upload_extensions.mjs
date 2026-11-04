// 把扩展归档写入 Netlify Blobs，并把目录中的下载地址改写为站点路径。
//
// 用法：
//   NETLIFY_SITE_ID=... NETLIFY_AUTH_TOKEN=... npm run upload:extensions -- a.jar b.jar
//   ... -- --apply
//
// 不带 --apply 时只上传；带 --apply 时按摘要找到 data/extensions.json 中对应的条目，
// 把 url 改成 /api/archives/<文件名>，并由构建阶段的 generate_api.py 重新生成目录。

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";

import { getStore } from "@netlify/blobs";

const STORE = "extensions";
const MANIFEST = resolve("data/extensions.json");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function archivePaths() {
  return process.argv.slice(2).filter((item) => !item.startsWith("--") && item !== option("--site"));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function upload(store, path) {
  const name = basename(path);
  const data = await readFile(path);
  const digest = sha256(data);
  await store.set(name, data, {
    metadata: { sha256: digest, size: data.byteLength, uploadedAt: new Date().toISOString() },
  });
  console.log(`uploaded ${name} ${data.byteLength} bytes ${digest}`);
  return { name, size: data.byteLength, sha256: digest };
}

async function rewriteManifest(uploaded) {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  let replaced = 0;
  for (const entry of manifest.extensions ?? []) {
    for (const artifact of entry.artifacts ?? []) {
      const match = uploaded.find((item) => item.sha256 === artifact.sha256);
      if (!match) {
        continue;
      }
      const next = `/api/archives/${match.name}`;
      if (artifact.url !== next) {
        artifact.url = next;
        replaced += 1;
      }
    }
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`rewrote ${replaced} artifact url(s) in data/extensions.json`);
}

async function main() {
  const paths = archivePaths();
  if (paths.length === 0) {
    console.error("usage: upload_extensions.mjs <archive...> [--apply] [--site <site-id>]");
    process.exitCode = 2;
    return;
  }

  const siteID = option("--site") ?? process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  if (!siteID || !token) {
    console.error("NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN are required");
    process.exitCode = 2;
    return;
  }

  const store = getStore({ name: STORE, siteID, token });
  const uploaded = [];
  for (const path of paths) {
    uploaded.push(await upload(store, path));
  }

  if (process.argv.includes("--apply")) {
    await rewriteManifest(uploaded);
  }
}

await main();
