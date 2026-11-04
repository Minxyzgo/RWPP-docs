---
title: 两个产品，一套运行时
description: RWPP-Team 维护 RWML 扩展运行时与 RWPP 客户端、服务端，并提供扩展目录与仓库接口。
layout: home
---

<section class="p-hero">
  <div class="p-wrap p-hero__inner">
    <div>
      <h1>两个产品，一套运行时。</h1>
      <p class="p-lead">RWML 负责扩展的加载、校验与更新。RWPP 是运行在它上面的客户端与服务端，提供界面、联机与托管。</p>
      <div class="p-actions">
        <a class="p-btn p-btn--primary" href="rwml/">了解 RWML</a>
        <a class="p-btn" href="rwpp/">了解 RWPP</a>
        <a class="p-link" href="extensions/">浏览扩展目录</a>
      </div>
      <ul class="p-facts">
        <li><span>运行时</span><strong>RWML 1.0.2</strong></li>
        <li><span>客户端</span><strong>RWPP 2.0.0</strong></li>
        <li><span>平台</span><strong>Windows、Linux、Android</strong></li>
        <li><span>许可</span><strong>RWPP-Team Shield 1.0.0</strong></li>
      </ul>
    </div>
    <div>
      <div class="p-console" role="img" aria-label="桌面端启动日志">
        <div class="p-console__bar"><span>rwml.log</span><span>启动</span></div>
        <pre class="p-console__body"><span class="dim">[rwml]</span> Game directory: ...\Rusted Warfare
<span class="dim">[rwml]</span> Extensions directory: ...\Rusted Warfare\extensions
<span class="ok">[rwml]</span> Bytecode transformer is active; mixins apply as classes load.
<span class="dim">[rwml]</span>   <span class="add">+</span> RWML Interface 1.0.2  [io.github.rwml.builtin]
<span class="dim">[rwml]</span>   <span class="add">+</span> RWML API 1.0.2  [io.github.rwpp.api]
<span class="dim">[rwml]</span>   <span class="add">+</span> RWPP 2.0.0  [io.github.rwpp]
<span class="dim">[rwml]</span> Starting Rusted Warfare <span class="p-console__caret"></span></pre>
      </div>
      <p class="p-caption">桌面端启动日志节选。标识、版本与加载结果均取自实际运行。</p>
    </div>
  </div>
</section>

<section class="p-section">
  <div class="p-wrap">
    <div class="p-section__head">
      <div>
        <h2>产品</h2>
        <p>运行时与客户端分开演进。加载、依赖与完整性属于 RWML；界面、联机与服务器属于 RWPP。</p>
      </div>
    </div>
    <div class="p-products">
      <article class="p-product">
        <div>
          <h3 class="p-product__name">RWML</h3>
          <p class="p-product__role">扩展运行时</p>
        </div>
        <div class="p-product__body">
          <p>桌面与 Android 的 mixin 扩展加载器。解析依赖、选择版本、改写游戏类。</p>
          <ul>
            <li>依赖排序与版本约束</li>
            <li>资源包替换</li>
            <li>HTTPS 目录与摘要校验</li>
          </ul>
        </div>
        <a class="p-link p-product__link" href="rwml/">产品说明</a>
      </article>
      <article class="p-product">
        <div>
          <h3 class="p-product__name">RWPP</h3>
          <p class="p-product__role">客户端与服务端</p>
        </div>
        <div class="p-product__body">
          <p>以两个扩展运行在 RWML 之上。客户端提供 Aero 界面与联机功能，服务端可无图形界面托管对局。</p>
          <ul>
            <li>KCP 与 TCP 同端口</li>
            <li>模组传输</li>
            <li>管理命令与扩展点</li>
          </ul>
        </div>
        <a class="p-link p-product__link" href="rwpp/">产品说明</a>
      </article>
    </div>
  </div>
</section>

<section class="p-section">
  <div class="p-wrap">
    <div class="p-section__head">
      <div>
        <h2>运行时负责的事</h2>
        <p>扩展只声明身份、版本与依赖。选择哪个归档、按什么顺序加载、改动是否生效，都由宿主决定。</p>
      </div>
    </div>
    <dl class="p-terms">
      <div class="p-term">
        <dt>发现与解析</dt>
        <dd>扫描扩展目录，读取 <code>META-INF/extension.properties</code>，按依赖关系排序；同一标识只加载一个版本。</dd>
      </div>
      <div class="p-term">
        <dt>类改写</dt>
        <dd>通过 ASM 在类加载时应用 mixin。桌面与 Android 各自提供变换与 dex 准备，扩展代码保持同一份。</dd>
      </div>
      <div class="p-term">
        <dt>完整性校验</dt>
        <dd>从目录安装时强制 HTTPS 与 SHA-256，单个归档不超过 256 MiB；校验失败即丢弃下载内容。</dd>
      </div>
      <div class="p-term">
        <dt>状态与回滚</dt>
        <dd>启用状态、选中版本与资源包记录在数据目录。改动在下一个宿主进程生效，正在加载的归档不会被替换。</dd>
      </div>
    </dl>
  </div>
</section>

<section class="p-section">
  <div class="p-wrap">
    <div class="p-section__head">
      <div>
        <h2>扩展目录</h2>
        <p>与启动器、文档站读取同一份 JSON。条目包含版本、平台、归档地址与校验值。</p>
      </div>
      <a class="p-link" href="extensions/">全部扩展</a>
    </div>
    <div class="rw-catalog__grid" id="rw-home-extensions">
      <div class="rw-skeleton"></div>
      <div class="rw-skeleton"></div>
      <div class="rw-skeleton"></div>
    </div>
  </div>
</section>

<section class="p-section">
  <div class="p-wrap">
    <div class="p-section__head">
      <div>
        <h2>文档</h2>
        <p>三条入口：使用产品、编写扩展、读取目录接口。</p>
      </div>
    </div>
    <div class="p-docs">
      <a class="p-doc" href="rwml/overview/">
        <h3>RWML 运行时</h3>
        <p>模块划分、引导流程、扩展描述符与仓库配置。</p>
        <span>阅读文档</span>
      </a>
      <a class="p-doc" href="extension/start/">
        <h3>扩展开发</h3>
        <p>从描述文件与入口点开始，接入事件、界面与命令。</p>
        <span>阅读文档</span>
      </a>
      <a class="p-doc" href="api/">
        <h3>目录接口</h3>
        <p>JSON 字段、下载校验规则与客户端仓库配置。</p>
        <span>阅读文档</span>
      </a>
    </div>
  </div>
</section>

<section class="p-close">
  <div class="p-wrap p-close__inner">
    <div>
      <h2>从安装开始</h2>
      <p>先装 RWML，再导入 RWPP。扩展的安装与更新由启动器负责。</p>
    </div>
    <div class="p-actions">
      <a class="p-btn p-btn--primary" href="rwpp/install/">安装 RWPP</a>
      <a class="p-btn" href="https://github.com/RWPP-Team">GitHub</a>
    </div>
  </div>
</section>
