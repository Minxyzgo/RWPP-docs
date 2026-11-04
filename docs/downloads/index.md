---
title: 下载
description: RWML 安装程序、MSI 与宿主归档的下载入口，提供 GitHub 与 Gitee 镜像。
layout: wide
---

<section class="p-product-hero">
  <div class="p-wrap">
    <h1>下载</h1>
    <p class="p-lead">安装程序与宿主归档随每个 RWML 版本发布。两个镜像内容相同，选择访问更快的来源即可。</p>
    <div class="p-actions">
      <a class="p-btn p-btn--primary" href="/downloads/github/rwml-setup.exe">GitHub 下载</a>
      <a class="p-btn" href="/downloads/gitee/rwml-setup.exe">Gitee 镜像</a>
      <a class="p-link" href="https://github.com/RWPP-Team/RWML/releases/latest/download/SHA256SUMS.txt">校验值</a>
    </div>
    <div class="p-specs">
      <div class="p-spec"><span>当前版本</span><strong>1.0.2</strong></div>
      <div class="p-spec"><span>系统</span><strong>Windows 10 与 11</strong></div>
      <div class="p-spec"><span>运行时</span><strong>.NET Framework 4.8</strong></div>
      <div class="p-spec"><span>许可</span><strong>RWPP-Team Shield 1.0.0</strong></div>
    </div>
  </div>
</section>

<div class="p-wrap p-body" markdown="1">

## 文件

| 文件 | 用途 | GitHub | Gitee |
| --- | --- | --- | --- |
| `rwml-setup.exe` | 安装程序：定位游戏目录、替换 `game-lib.jar`、保留原版备份 | [下载](/downloads/github/rwml-setup.exe) | [下载](/downloads/gitee/rwml-setup.exe) |
| `rwml-setup.msi` | MSI 安装包，适合批量部署；需提供 `GAMEDIR` | [下载](/downloads/github/rwml-setup.msi) | [下载](/downloads/gitee/rwml-setup.msi) |
| `game-lib.jar` | 宿主归档，手动替换时使用 | [下载](/downloads/github/game-lib.jar) | [下载](/downloads/gitee/game-lib.jar) |
| `SHA256SUMS.txt` | 上述文件的 SHA-256 | [下载](https://github.com/RWPP-Team/RWML/releases/latest/download/SHA256SUMS.txt) | 同 GitHub |

## 安装

1. 运行安装程序。程序从 Steam 注册表与库目录定位游戏，也可以手动选择。
2. 确认目录后点击安装。原版 `game-lib.jar` 保存为 `game-lib.jar.original`，随后写入 RWML 的归档。
3. 启动游戏。启动器在需要时获取 Java 25 运行时。

卸载或回退使用安装程序的“恢复原版”，也可以把 `game-lib.jar.original` 复制回 `game-lib.jar`。

## 校验

下载后可以核对摘要：

```powershell
Get-FileHash .\rwml-setup.exe -Algorithm SHA256
```

输出应与 `SHA256SUMS.txt` 中对应行一致。摘要不符时不要运行安装程序。

## 镜像说明

- GitHub 指向最新正式版本，发布后立即可用。
- Gitee 镜像通过发行版接口解析最新标签，可能比 GitHub 晚几分钟；标签未同步时会回到 Gitee 发行版列表。
- 站点不保存二进制文件，两个地址都是跳转，下载流量不经过本站。

</div>
