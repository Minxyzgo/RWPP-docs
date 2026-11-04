---
title: RWML
description: 面向 Rusted Warfare 桌面与 Android 的 mixin 扩展加载器，负责依赖解析、类改写、资源包与扩展仓库。
layout: wide
---

<section class="p-product-hero">
  <div class="p-wrap">
    <h1>RWML</h1>
    <p class="p-lead">面向 Rusted Warfare 桌面与 Android 的 mixin 扩展加载器。它解析依赖、选择版本、改写游戏类，并托管扩展仓库。</p>
    <div class="p-actions">
      <a class="p-btn p-btn--primary" href="https://github.com/RWPP-Team/RWML/releases/latest">下载安装程序</a>
      <a class="p-btn" href="../rwml/overview/">阅读文档</a>
      <a class="p-link" href="https://github.com/RWPP-Team/RWML">源代码</a>
    </div>
    <div class="p-specs">
      <div class="p-spec"><span>当前版本</span><strong>1.0.2</strong></div>
      <div class="p-spec"><span>桌面要求</span><strong>Java 8+ 引导，自动获取 Java 25</strong></div>
      <div class="p-spec"><span>Android 要求</span><strong>Android 8.0（API 26）</strong></div>
      <div class="p-spec"><span>许可</span><strong>RWPP-Team Shield 1.0.0</strong></div>
    </div>
  </div>
</section>

<div class="p-wrap p-body" markdown="1">

## 它解决什么问题

游戏没有插件接口。桌面端替换 `game-lib.jar`，Android 端在宿主 APK 内准备 dex，启动时都会改写游戏类。安装程序把原文件保存为 `game-lib.jar.original`，可以恢复。

每个扩展用描述符声明身份、版本与依赖。宿主据此决定加载哪些归档、按什么顺序加载、冲突时用哪个版本。

## 模块

| 模块 | 职责 |
| --- | --- |
| `core` | 扩展 API、依赖解析、仓库实现与引导流程，不引用任何游戏类 |
| `game-adapter` | 两端共用的游戏数据、设置与语言 hook |
| `desktop` | JVM 类变换、桌面启动器与内置界面 |
| `android` | 游戏 dex 准备、缓存、存储权限与内置界面 |
| `example` | 最小示例扩展 |

core 不依赖游戏，因此同一份 API 可以在桌面与 Android 的类路径上解析；涉及游戏类的部分集中在 game-adapter 与两个宿主模块。

## 安装

### 桌面

安装程序随 Releases 发布，文件名 `rwml-setup.exe`。在[发行版页面](https://github.com/RWPP-Team/RWML/releases/latest)选择需要的文件下载。

1. 运行安装程序。程序会从 Steam 注册表与库目录定位游戏，也可以手动选择目录。
2. 点击安装。原版 `game-lib.jar` 保存为 `game-lib.jar.original`，随后写入 RWML 的归档。
3. 启动游戏。启动器在需要时获取 Java 25 运行时。

扩展放在游戏目录下的 `extensions/`。恢复原版使用安装程序的“恢复原版”按钮，或把备份复制回 `game-lib.jar`。

### Android

安装 APK 后，首次启动会申请存储访问权限，再加载 `/storage/emulated/0/rustedWarfare/extensions` 中的扩展。扩展变更会重建受影响的 dex 缓存。

## 扩展如何加载

1. 启动器读取扩展目录，解析 `META-INF/extension.properties`。
2. 依赖关系排序，并对同一标识的多个版本做选择。
3. 注册 mixin，逐个扩展执行 `onLoad`。
4. 界面框架接管启动流程，随后把控制权交给游戏。

任何一步失败都会回到启动器并显示诊断信息。扩展导致的异常不会静默忽略。

## 仓库与资源包

RWML 可以从 HTTPS 目录读取扩展列表，搜索、安装与更新都在启动器内完成。下载必须提供 SHA-256，单个归档上限 256 MiB，校验失败即丢弃文件。目录地址写在数据目录的 `repository.properties`，也可以用系统属性覆盖。

资源包属于扩展的一种，标记 `resourcePack=true` 后替换游戏资源。同一时间只有一个资源包生效，选择记录在 `data/extension-state.properties`。

## 命令行

| 参数 | 作用 |
| --- | --- |
| `--rwml-no-launcher` | 跳过启动器，直接进入游戏 |
| `--rwml-manager` | 强制打开扩展管理界面 |

## 致谢

字节码改写基于 [RELAY-CN](https://github.com/RELAY-CN) 的 [ASM-Framework](https://github.com/RELAY-CN/ASM-Framework)。感谢作者与维护者提供这套面向 JVM 与 Android 的 ASM 工具库，扩展类改写与 mixin 注册依赖它。

游戏类映射由 [Anvil](https://github.com/RWPP-Team/Anvil) 维护。

## 接下来

- [运行时概览](overview.md)：模块边界与启动顺序
- [扩展系统](extensions.md)：描述符、依赖、整合包与版本选择
- [扩展仓库](extensions.md#repository-install)：目录字段与校验规则
- [界面框架](ui.md)：`UiFramework`、`UiHost` 与共享服务

</div>
