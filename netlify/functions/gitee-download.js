/*
 * GET /downloads/gitee/<file>
 *
 * 解析 Gitee 最新正式发行版，并跳转到同名附件的下载地址。
 * 可用环境变量：
 *   GITEE_OWNER  仓库所有者，默认 rwpp-team
 *   GITEE_REPO   仓库名，默认 RWML
 *   GITEE_TAG    固定标签；设置后跳过接口请求
 *   GITEE_TOKEN  可选令牌，提高接口额度
 */

const OWNER = process.env.GITEE_OWNER || "rwpp-team";
const REPO = process.env.GITEE_REPO || "RWML";
const FILE_NAME = /^[A-Za-z0-9._-]+$/;
const API = "https://gitee.com/api/v5/repos";

function redirect(location, cacheSeconds) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      "Cache-Control": `public, max-age=${cacheSeconds || 300}`,
    },
    body: "",
  };
}

async function latestTag() {
  const headers = { Accept: "application/json", "User-Agent": "rwpp-docs" };
  if (process.env.GITEE_TOKEN) {
    headers.Authorization = `token ${process.env.GITEE_TOKEN}`;
  }
  const response = await fetch(`${API}/${OWNER}/${REPO}/releases/latest`, { headers });
  if (!response.ok) {
    throw new Error(`Gitee API returned HTTP ${response.status}`);
  }
  const release = await response.json();
  if (!release.tag_name) {
    throw new Error("Gitee release has no tag_name");
  }
  return release.tag_name;
}

function requestedFile(event) {
  const fromQuery = event.queryStringParameters && event.queryStringParameters.file;
  if (fromQuery) {
    return String(fromQuery).trim();
  }
  const raw = event.path || "";
  const marker = "/downloads/gitee/";
  const index = raw.indexOf(marker);
  return index >= 0 ? raw.slice(index + marker.length) : "";
}

exports.handler = async (event) => {
  const file = requestedFile(event);
  if (!file || !FILE_NAME.test(file)) {
    return { statusCode: 400, body: "Invalid file name" };
  }

  const pinned = process.env.GITEE_TAG;
  if (pinned) {
    return redirect(`https://gitee.com/${OWNER}/${REPO}/releases/download/${pinned}/${file}`);
  }

  try {
    const tag = await latestTag();
    return redirect(`https://gitee.com/${OWNER}/${REPO}/releases/download/${encodeURIComponent(tag)}/${file}`);
  } catch (error) {
    // 接口不可用时退到发行版列表，让访问者自行选择文件。
    console.warn(`gitee-download: ${error.message}`);
    return redirect(`https://gitee.com/${OWNER}/${REPO}/releases`, 60);
  }
};
