/*
 * 首页数据区：目录数量与精选扩展。
 *
 * 数据来自构建生成的 /api/v1/index.json，与文档站的扩展浏览器、RWML 客户端读取同一份目录。
 * 读取失败时保留占位文本，不让首页依赖网络可用性。
 */

(function () {
  "use strict";

  const PLATFORM_LABELS = { jvm: "桌面", android: "Android" };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    const text = String(name || "").trim();
    return (text.slice(0, 2) || "?").toUpperCase();
  }

  function formatSize(entry) {
    const total = (entry.artifacts || []).reduce((sum, artifact) => sum + (artifact.size || 0), 0);
    if (!total) return "";
    const mib = 1024 * 1024;
    return total < mib ? Math.round(total / 1024) + " KiB" : (total / mib).toFixed(1) + " MiB";
  }

  function card(entry) {
    const tags = (entry.tags || []).slice(0, 3)
      .map((tag) => '<span class="rw-chip">' + escapeHtml(tag) + "</span>").join("");
    const platforms = (entry.platforms || [])
      .map((platform) => '<span class="rw-chip">' + escapeHtml(PLATFORM_LABELS[platform] || platform) + "</span>")
      .join("");
    const icon = entry.icon
      ? '<div class="rw-card__avatar"><img src="' + escapeHtml(entry.icon) + '" alt="" loading="lazy"></div>'
      : '<div class="rw-card__avatar">' + escapeHtml(initials(entry.name)) + "</div>";
    return (
      '<article class="rw-card">' +
        '<div class="rw-card__head">' + icon +
          '<div class="rw-card__title">' +
            '<div class="rw-card__name">' + escapeHtml(entry.name) +
              '<span class="rw-chip rw-chip--primary">v' + escapeHtml(entry.version) + "</span></div>" +
            '<div class="rw-card__id">' + escapeHtml(entry.id) + "</div>" +
          "</div>" +
        "</div>" +
        '<p class="rw-card__summary">' + escapeHtml(entry.summary) + "</p>" +
        '<div class="rw-card__tags">' + tags + "</div>" +
        '<div class="rw-card__foot">' + platforms +
          "<span>" + formatSize(entry) + "</span>" +
          '<a class="rw-btn" href="extensions/">详情</a>' +
        "</div>" +
      "</article>"
    );
  }

  function render(catalog) {
    const entries = catalog.extensions || [];
    const counter = document.getElementById("rw-stat-extensions");
    if (counter) {
      counter.textContent = String(entries.length);
    }
    const grid = document.getElementById("rw-home-extensions");
    if (!grid) return;
    if (entries.length === 0) {
      grid.innerHTML = '<div class="rw-catalog__empty">目录暂无扩展。</div>';
      return;
    }
    const featured = entries
      .slice()
      .sort((left, right) => (right.downloads || 0) - (left.downloads || 0))
      .slice(0, 3);
    grid.innerHTML = featured.map(card).join("");
  }

  async function init() {
    const root = document.querySelector(".p-page--home");
    if (!root || root.dataset.loaded === "true") return;
    root.dataset.loaded = "true";
    try {
      const response = await fetch(new URL("api/v1/index.json", document.baseURI).href, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      render(await response.json());
    } catch (error) {
      const grid = document.getElementById("rw-home-extensions");
      if (grid) {
        grid.innerHTML = '<div class="rw-catalog__empty rw-catalog__error">目录暂时无法读取：' +
          escapeHtml(error.message) + "</div>";
      }
    }
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(init);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
