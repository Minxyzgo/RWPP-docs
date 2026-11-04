---
title: 下载
description: RWML 的发行版入口。安装程序与宿主归档列在对应版本下，按需选择。
layout: wide
---

<section class="p-product-hero">
  <div class="p-wrap">
    <h1>下载</h1>
    <p class="p-lead">安装程序与宿主归档随每个 RWML 版本发布。先打开发行版页面，再选择需要的文件。</p>
    <div class="p-actions">
      <a class="p-btn p-btn--primary" href="https://github.com/RWPP-Team/RWML/releases/latest">打开 GitHub Release</a>
      <a class="p-btn" href="../extensions/">扩展目录</a>
      <a class="p-link" href="https://qm.qq.com/q/auLINpWtr4">QQ 群</a>
    </div>
    <div class="p-specs">
      <div class="p-spec"><span>当前版本</span><strong>1.0.2</strong></div>
      <div class="p-spec"><span>系统</span><strong>Windows 10 与 11（64 位）</strong></div>
      <div class="p-spec"><span>运行时</span><strong>.NET Framework 4.8</strong></div>
      <div class="p-spec"><span>许可</span><strong>RWPP-Team Shield 1.0.0</strong></div>
    </div>
  </div>
</section>

<div class="p-wrap p-body" markdown="1">

## 发行版包含的文件

| 文件 | 用途 |
| --- | --- |
| `rwml-setup-fat.exe` | 安装程序：内置 Java 25 运行时，安装后即可启动 |
| `rwml-setup.exe` | 安装程序：不含运行时，首次启动下载 Java 25 |
| `game-lib.jar` | 宿主归档，无法运行安装程序时手动替换 |
| `SHA256SUMS.txt` | 上述文件的 SHA-256 |

两个安装程序做的事情相同：定位游戏目录、备份并替换 `game-lib.jar`。区别只在于是否随包携带 Java 25。

## 安装

1. 运行安装程序。程序从 Steam 注册表与库目录定位游戏，也可以手动选择。
2. 确认目录后点击安装。原版 `game-lib.jar` 保存为 `game-lib.jar.original`，随后写入 RWML 的归档。
3. 含运行时的版本把 Java 25 解压到游戏目录的 `rwml-runtime`，启动游戏时直接使用；不含运行时的版本在首次启动时获取。

卸载或回退使用安装程序的“恢复原版”，也可以把 `game-lib.jar.original` 复制回 `game-lib.jar`。

## 校验

在同一次下载中取得 `SHA256SUMS.txt`，与本地摘要比对：

```powershell
Get-FileHash .\rwml-setup.exe -Algorithm SHA256
```

输出应与文件中的对应行一致。摘要不符时不要运行安装程序。

## 分发来源

- 安装程序与宿主归档随 RWML 发行版提供，下载按钮指向最新正式版本。
- 扩展归档由本站归档入口分发，客户端从目录读取带令牌的地址。
- 站点仓库不保存二进制文件。

## 遇到问题

安装失败、启动异常或扩展无法加载时，先查看游戏目录下的 `data/rwml-bootstrap.log`。也可以在 [Issues](https://github.com/RWPP-Team/RWPP/issues) 提交，或加入 [QQ 群](https://qm.qq.com/q/auLINpWtr4)（1004399208）询问。

</div>
