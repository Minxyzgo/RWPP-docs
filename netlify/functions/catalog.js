/*
 * GET /api/v1/index.json, /api/v1/search.json, /api/v1/manifest.json,
 *     /api/v1/extensions/<id>.json and the two stable aliases.
 *
 * The response is rendered from the runtime registry in R2. Redirect rules pass
 * the requested kind and id as query parameters; event.path is used as a
 * fallback for direct function invocations.
 */

const { renderCatalog } = require("../lib/rwpp.js");

exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  const path = String(event.path || "").split("?")[0];
  let kind = query.kind || "";

  if (!kind) {
    if (path.endsWith("/index.json")) kind = "index";
    else if (path.endsWith("/search.json")) kind = "search";
    else if (path.endsWith("/manifest.json")) kind = "manifest";
    else if (path.includes("/extensions/")) kind = "extension";
  }
  if (kind === "extension" && !query.id) {
    const match = path.match(/\/extensions\/([^/?]+)/);
    if (match) query.id = match[1];
  }

  return renderCatalog(kind, query);
};
