---
title: RWPP
description: 建立在 RWML 之上的 Rusted Warfare 客户端与服务端，提供 Aero 界面、房间管理、单位禁用与无头托管。
layout: wide
---

<section class="p-product-hero">
  <div class="p-wrap">
    <h1>RWPP</h1>
    <p class="p-lead">建立在 RWML 之上的客户端与服务端。客户端由两个扩展组成，提供 Aero 界面、房间管理、单位禁用、黑名单与回放控制；服务端在没有图形界面的进程里托管对局。</p>
    <div class="p-actions">
      <a class="p-btn p-btn--primary" href="../rwpp/install/">安装</a>
      <a class="p-btn" href="https://github.com/RWPP-Team/RWPP">源代码</a>
    </div>
    <div class="p-specs">
      <div class="p-spec"><span>当前版本</span><strong>2.0.0</strong></div>
      <div class="p-spec"><span>组成</span><strong>rwpp-api 与 rwpp-client</strong></div>
      <div class="p-spec"><span>客户端平台</span><strong>桌面 JVM 与 Android</strong></div>
      <div class="p-spec"><span>许可</span><strong>RWPP-Team Shield 1.0.0</strong></div>
    </div>
  </div>
</section>

<div class="p-wrap p-body" markdown="1">

## 客户端

客户端不是独立进程，而是一个 RWML 扩展。它声明自己的界面框架，在宿主完成扩展加载后接管启动流程，把 Aero 界面绘制在游戏之上。另一个扩展 `io.github.rwpp.api` 提供共享实现，两者必须来自同一发布版本。

已验证的客户端能力包括：

- Aero 界面：房间、聊天、玩家列表、控制台与回放控制使用同一套视觉与按键音效。
- 房间管理：锁定房间、队伍外观、玩家配置与旁观者统计。
- 单位禁用与黑名单：按房间限制单位，按玩家维护黑名单。
- 联机辅助：服务器列表、延迟与状态显示、模组传输。
- 回放与观战：回放进度控制、观战统计与视角切换。
- 沙盒工具：单位编辑器与地图修补。

## 服务端

`rwpp-server` 是无图形界面的 JVM 进程，与客户端共享 API，不依赖声音与 OpenGL。同一端口同时提供 KCP 与 TCP，客户端优先 KCP，失败后回退 TCP。

控制台提供房间设置、玩家管理与录制控制，例如 `players`、`map`、`maxplayers`、`start`、`addai`、`kick`、`team`、`replay`、`status`、`say`、`return`、`stop`。管理命令只对服务端控制台可见，并由原版模拟线程执行。

## 两个扩展的关系

| 扩展 | 标识 | 作用 |
| --- | --- | --- |
| API | `io.github.rwpp.api` | 共享 API、事件、命令、网络与服务端实现 |
| 客户端 | `io.github.rwpp` | 界面、游戏内功能与联机行为 |

客户端声明 `dependsOn=io.github.rwpp.api`，并独立声明界面框架。升级时两个归档需要一起更新，扩展目录中的同一发布条目会同时提供两者。

## 安装与更新

扩展可以通过启动器的扩展页从目录安装，也可以手动导入整合包。安装只写入归档，重启后由版本解析决定实际加载的版本。

- [安装步骤](install.md)
- [客户端功能](features.md)
- [服务端](server.md)

## 编写扩展

RWPP 的扩展遵循 RWML 的生命周期，并额外获得游戏、房间、事件与命令服务。

- [开始](../extension/start.md)
- [元数据](../extension/metadata.md)
- [事件](../extension/events.md)
- [界面](../extension/ui.md)
- [命令](../extension/commands.md)

</div>
