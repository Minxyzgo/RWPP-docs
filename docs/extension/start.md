# 开始

扩展是一个 jar，内含 `META-INF/extension.properties` 与实现 `io.github.rwml.api.Extension` 的入口类。它由 RWML 加载，可以选择使用 RWPP 提供的 API。

## 准备

- 两个编译依赖：`rwml-core` 与映射后的 `game-lib`。需要 RWPP 的 API 时再引入 `rwpp-api`。

```kotlin
repositories {
    mavenCentral()
}

dependencies {
    compileOnly("io.github.rwpp-team:rwml-core:1.0.2")
    compileOnly("io.github.rwpp-team:game-lib:v3-1.15")
    compileOnly("io.github.rwpp-team:rwpp-api:2.0.0")
}
```

三者都使用 `compileOnly`。运行时由宿主提供 core 与游戏类，RWPP 的 API 由 `io.github.rwpp.api` 扩展提供。

## 描述符

```properties
id=com.example.hello
name=Hello
version=1.0.0
mainClass=com.example.HelloExtension
apiVersion=1.0.0
description=最小示例扩展
authors=Example
dependsOn=io.github.rwpp.api
```

字段含义与依赖语法见 [元数据](metadata.md)。

## 入口类

```kotlin
package com.example.hello

import io.github.rwml.api.Extension
import io.github.rwml.api.ExtensionContext

class HelloExtension : Extension {
    override fun onLoad(context: ExtensionContext) {
        context.log("Hello from ${context.extensionId()}")
    }
}
```

`onLoad` 在游戏类准备完成前后由宿主调用，具体时机取决于扩展声明的依赖。耗时工作应放到自己的协程或线程，不要阻塞加载线程。

`onLoad` 抛出的异常会让扩展进入失败状态。需要长期存在的资源，例如事件订阅，用 `context.own(...)` 交给宿主管理，卸载时自动关闭。

## 使用 RWPP 的服务

声明 `dependsOn=io.github.rwpp.api` 后，可以使用共享容器与事件通道：

```kotlin
import io.github.rwpp.api.appKoin
import io.github.rwpp.api.event.EventOwner
import io.github.rwpp.api.event.GlobalEventChannel
import io.github.rwpp.api.event.events.GameLoadedEvent
override fun onLoad(context: ExtensionContext) {
    val owner = EventOwner(context)
    GlobalEventChannel.filter(GameLoadedEvent::class).subscribeAlways(owner) {
        context.log("game loaded")
    }
}
```

`appKoin` 与 `gameScope` 由 API 扩展初始化。不要在静态初始化块里访问它们，那时 API 还没有加载。

## 安装

导入归档后重启游戏。启动日志会出现一行 `+ <名称> <版本> [<标识>]`。若出现失败行，日志会给出原因。

## 开发者交流群

扩展开发相关的问题可以加入 RWPP 开发者交流群 1004399208（[加群链接](https://qm.qq.com/q/auLINpWtr4)）。安装、兼容与联机等玩家问题请使用文档站的玩家群。

## 下一步

- [元数据](metadata.md)：描述符全部字段与依赖约束
- [事件](events.md)：订阅、优先级与取消语义
- [界面](ui.md)：声明界面框架与创建窗口
- [命令](commands.md)：注册斜杠命令
