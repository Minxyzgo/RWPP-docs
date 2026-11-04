/*
 * 扩展目录：读取构建生成的 /api/v1/index.json 并渲染为可搜索的卡片列表。
 *
 * 数据来自 docs/api/v1/index.json，由 scripts/generate_api.py 生成，因此页面展示与 RWML
 * 扩展浏览器读取的是同一份目录。所有颜色来自 CSS 变量，深浅色切换不需要重新渲染。
 */

(function () {
  "use strict";

  const PLATFORM_LABELS = { jvm: "桌面", android: "Android" };
  const PLATFORM_FILTERS = [
    { value: "", label: "全部平台" },
    { value: "jvm", label: "桌面 JVM" },
    { value: "android", label: "Android" },
  ];

  const state = {
    catalog: null,
    entries: [],
    query: "",
    platform: "",
    category: "",
    sort: "name",
    modal: null,
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    const text = String(name || "").trim();
    if (!text) return "?";
    const first = text[0];
    const second = text.length > 1 ? text[1] : "";
    return (first + second).toUpperCase();
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    const mib = 1024 * 1024;
    if (bytes < mib) return Math.round(bytes / 1024) + " KiB";
    return (bytes / mib).toFixed(1) + " MiB";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
      String(date.getDate()).padStart(2, "0");
  }

  function platformChips(platforms) {
    return (platforms || [])
      .map((platform) => '<span class="rw-chip">' + escapeHtml(PLATFORM_LABELS[platform] || platform) + "</span>")
      .join("");
  }

  function artifactSize(entry) {
    return (entry.artifacts || []).reduce((total, artifact) => total + (artifact.size || 0), 0);
  }

  function matches(entry, query) {
    if (!query) return true;
    const haystack = [
      entry.id,
      entry.name,
      entry.summary,
      entry.description,
      (entry.tags || []).join(" "),
      (entry.categories || []).join(" "),
      (entry.authors || []).join(" "),
    ].join(" ").toLowerCase();
    return query.split(/\s+/).every((token) => !token || haystack.includes(token));
  }

  function filtered() {
    const query = state.query.trim().toLowerCase();
    let result = state.entries.filter((entry) => {
      if (!matches(entry, query)) return false;
      if (state.platform && !(entry.platforms || []).includes(state.platform)) return false;
      if (state.category && !(entry.categories || []).includes(state.category)) return false;
      return true;
    });
    if (state.sort === "updated") {
      result = result.slice().sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    } else if (state.sort === "downloads") {
      result = result.slice().sort((left, right) => (right.downloads || 0) - (left.downloads || 0));
    } else {
      result = result.slice().sort((left, right) => String(left.name).localeCompare(String(right.name), "zh"));
    }
    return result;
  }

  function card(entry) {
    const tags = (entry.tags || []).slice(0, 4)
      .map((tag) => '<span class="rw-chip">' + escapeHtml(tag) + "</span>").join("");
    const icon = entry.icon
      ? '<div class="rw-card__avatar"><img src="' + escapeHtml(entry.icon) + '" alt="" loading="lazy"></div>'
      : '<div class="rw-card__avatar">' + escapeHtml(initials(entry.name)) + "</div>";
    const size = formatSize(artifactSize(entry));
    return (
      '<article class="rw-card" data-id="' + escapeHtml(entry.id) + '">' +
        '<div class="rw-card__head">' + icon +
          '<div class="rw-card__title">' +
            '<div class="rw-card__name">' + escapeHtml(entry.name) +
              '<span class="rw-chip rw-chip--primary">v' + escapeHtml(entry.version) + "</span>" +
            "</div>" +
            '<div class="rw-card__id">' + escapeHtml(entry.id) + "</div>" +
          "</div>" +
        "</div>" +
        '<p class="rw-card__summary">' + escapeHtml(entry.summary) + "</p>" +
        '<div class="rw-card__tags">' + tags + "</div>" +
        '<div class="rw-card__foot">' + platformChips(entry.platforms) +
          (size ? "<span>" + size + "</span>" : "") +
          '<button class="rw-btn" type="button" data-action="details">详情</button>' +
        "</div>" +
      "</article>"
    );
  }

  function render() {
    const grid = document.getElementById("rw-catalog-grid");
    const stats = document.getElementById("rw-catalog-stats");
    if (!grid) return;
    const entries = filtered();
    if (stats) {
      stats.textContent = entries.length === state.entries.length
        ? "共 " + state.entries.length + " 个扩展"
        : "匹配 " + entries.length + " / " + state.entries.length;
    }
    grid.innerHTML = entries.map(card).join("");
    const empty = document.getElementById("rw-catalog-empty");
    if (empty) empty.hidden = entries.length > 0;
    grid.hidden = entries.length === 0;
  }

  function artifactRows(entry) {
    return (entry.artifacts || [])
      .map((artifact) => (
        "<tr><td>" + escapeHtml(PLATFORM_LABELS[artifact.platform] || artifact.platform || "全部") + "</td>" +
        "<td>" + escapeHtml(artifact.id) + "</td>" +
        "<td>" + formatSize(artifact.size) + "</td>" +
        '<td><a href="' + escapeHtml(artifact.url) + '" rel="noopener">下载</a></td></tr>'
      ))
      .join("");
  }

  function detail(entry) {
    const tags = (entry.tags || []).map((tag) => '<span class="rw-chip">' + escapeHtml(tag) + "</span>").join("");
    return (
      '<div class="rw-modal__head">' +
        '<div class="rw-card__title">' +
          '<div class="rw-card__name">' + escapeHtml(entry.name) +
            '<span class="rw-chip rw-chip--primary">v' + escapeHtml(entry.version) + "</span></div>" +
          '<div class="rw-card__id">' + escapeHtml(entry.id) + "</div>" +
        "</div>" +
        '<button class="rw-modal__close" type="button" data-action="close" aria-label="关闭">×</button>' +
      "</div>" +
      '<div class="rw-modal__body">' +
        "<p>" + escapeHtml(entry.description || entry.summary) + "</p>" +
        '<div class="rw-card__tags" style="margin-top:10px">' + tags + "</div>" +
        '<div class="rw-modal__section"><h3>归档</h3>' +
          '<table class="rw-artifacts"><thead><tr><th>平台</th><th>扩展</th><th>大小</th><th>地址</th></tr></thead>' +
          "<tbody>" + artifactRows(entry) + "</tbody></table></div>" +
        '<div class="rw-modal__section"><h3>在 RWML 中安装</h3>' +
          "<p>打开 RWML 启动器的“扩展”，在“浏览”页搜索名称后点击安装。仓库地址写在数据目录的 " +
          "<code>repository.properties</code> 中：</p>" +
          '<div class="rw-code">index=' + escapeHtml(state.catalogUri || "/api/v1/index.json") + "</div>" +
          "<p>也可以在浏览页直接搜索；安装完成后重启游戏加载新版本。</p></div>" +
        (entry.notes
          ? '<div class="rw-modal__section"><h3>更新说明</h3><p>' + escapeHtml(entry.notes) + "</p></div>"
          : "") +
        '<div class="rw-modal__section"><h3>信息</h3><p>' +
          "作者：" + escapeHtml((entry.authors || []).join("、") || "未注明") + "<br>" +
          "许可证：" + escapeHtml(entry.license || "未注明") + "<br>" +
          "更新：" + escapeHtml(formatDate(entry.updatedAt)) +
          (entry.homepage
            ? '<br>主页：<a href="' + escapeHtml(entry.homepage) + '" rel="noopener">' + escapeHtml(entry.homepage) + "</a>"
            : "") +
        "</p></div>" +
      "</div>"
    );
  }

  function openModal(entry) {
    if (!state.modal) return;
    state.modal.querySelector(".rw-modal__panel").innerHTML = detail(entry);
    state.modal.setAttribute("open", "");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!state.modal) return;
    state.modal.removeAttribute("open");
    document.body.style.overflow = "";
  }

  function ensureModal() {
    if (state.modal) return state.modal;
    const modal = document.createElement("div");
    modal.className = "rw-modal";
    modal.innerHTML = '<div class="rw-modal__panel" role="dialog" aria-modal="true"></div>';
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest('[data-action="close"]')) closeModal();
    });
    document.body.appendChild(modal);
    state.modal = modal;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModal();
    });
    return modal;
  }

  function bind() {
    const root = document.getElementById("rw-catalog");
    if (!root || root.dataset.ready === "true") return;
    root.dataset.ready = "true";

    const search = document.getElementById("rw-catalog-search");
    const platform = document.getElementById("rw-catalog-platform");
    const category = document.getElementById("rw-catalog-category");
    const sort = document.getElementById("rw-catalog-sort");
    const grid = document.getElementById("rw-catalog-grid");

    if (platform) {
      platform.innerHTML = PLATFORM_FILTERS
        .map((item) => '<option value="' + item.value + '">' + item.label + "</option>").join("");
      platform.addEventListener("change", () => {
        state.platform = platform.value;
        render();
      });
    }
    if (sort) {
      sort.addEventListener("change", () => {
        state.sort = sort.value;
        render();
      });
    }
    if (search) {
      let timer = 0;
      search.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          state.query = search.value;
          render();
        }, 120);
      });
    }
    if (category) {
      category.addEventListener("change", () => {
        state.category = category.value;
        render();
      });
    }
    if (grid) {
      grid.addEventListener("click", (event) => {
        const card = event.target.closest(".rw-card");
        if (!card) return;
        const entry = state.entries.find((item) => item.id === card.dataset.id);
        if (entry) openModal(entry);
      });
    }
    ensureModal();
  }

  function fillCategories() {
    const select = document.getElementById("rw-catalog-category");
    if (!select) return;
    const categories = Array.from(new Set(state.entries.flatMap((entry) => entry.categories || []))).sort();
    select.innerHTML = '<option value="">全部分类</option>' +
      categories.map((item) => '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + "</option>").join("");
  }

  function fail(message) {
    const grid = document.getElementById("rw-catalog-grid");
    const empty = document.getElementById("rw-catalog-empty");
    if (grid) {
      grid.innerHTML = "";
      grid.hidden = true;
    }
    if (empty) {
      empty.hidden = false;
      empty.classList.add("rw-catalog__error");
      empty.textContent = message;
    }
  }

  async function load() {
    const root = document.getElementById("rw-catalog");
    if (!root) return;
    const api = (root.dataset.api || "../api/v1").replace(/\/$/, "");
    try {
      const response = await fetch(api + "/index.json", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const catalog = await response.json();
      state.catalog = catalog;
      state.entries = catalog.extensions || [];
      state.catalogUri = new URL(api + "/index.json", window.location.href).href;
      fillCategories();
      render();
    } catch (error) {
      fail("扩展目录无法读取：" + error.message + "。请先运行 scripts/generate_api.py 生成 /api/v1。");
    }
  }

  function init() {
    if (!document.getElementById("rw-catalog")) return;
    state.entries = [];
    state.query = "";
    state.platform = "";
    state.category = "";
    const grid = document.getElementById("rw-catalog-grid");
    if (grid && !state.catalog) {
      grid.innerHTML = '<div class="rw-skeleton"></div><div class="rw-skeleton"></div><div class="rw-skeleton"></div>';
    }
    bind();
    load();
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(init);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
