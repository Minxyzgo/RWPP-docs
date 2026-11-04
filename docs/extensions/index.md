---
title: 扩展目录
description: RWPP-Team 的扩展目录，与 RWML 的扩展页读取同一份 JSON。
layout: wide
---

<section class="p-product-hero">
  <div class="p-wrap">
    <h1>扩展目录</h1>
    <p class="p-lead">这里列出的条目与 RWML 的扩展页读取同一份 JSON。每条记录包含版本、平台、归档地址与 SHA-256，安装前由宿主校验。</p>
    <div class="p-actions">
      <a class="p-btn" href="../api/">接口说明</a>
      <a class="p-btn" href="../extension/start/">编写扩展</a>
    </div>
  </div>
</section>

<section class="p-section">
  <div class="p-wrap">
  <div class="rw-catalog" id="rw-catalog" data-api="../api/v1">
    <div class="rw-catalog__toolbar">
      <label class="rw-catalog__search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="M20 20l-3.5-3.5"></path>
        </svg>
        <input id="rw-catalog-search" type="search" placeholder="搜索名称、标签或标识" autocomplete="off">
      </label>
      <select class="rw-catalog__select" id="rw-catalog-platform" aria-label="平台"></select>
      <select class="rw-catalog__select" id="rw-catalog-category" aria-label="分类"></select>
      <select class="rw-catalog__select" id="rw-catalog-sort" aria-label="排序">
        <option value="name">按名称</option>
        <option value="updated">最近更新</option>
        <option value="downloads">下载量</option>
      </select>
      <span class="rw-catalog__stats" id="rw-catalog-stats"></span>
    </div>
    <div class="rw-catalog__grid" id="rw-catalog-grid"></div>
    <div class="rw-catalog__empty" id="rw-catalog-empty" hidden>没有匹配的扩展。</div>
  </div>
  </div>
</section>

<div class="p-wrap p-body" markdown="1">

## 在宿主中安装

桌面启动器与 Android 扩展管理页的“浏览”页签读取同一目录：搜索名称、查看详情、安装或更新。安装完成后重启游戏，新版本在下一个进程加载。

目录由 RWPP-Team 维护，条目随 RWML 发行版更新。字段定义见 [目录接口](../api/index.md)。

</div>
