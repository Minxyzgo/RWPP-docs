# 命令

RWPP 提供一份全局命令注册表，客户端与无头服务端共用同一个 DSL。命令由聊天输入或服务端控制台触发。

## 注册

```kotlin
import io.github.rwpp.api.commands

command("hello", "示例命令") {
    aliases("hi")
    requireVisibility(CommandVisibility.CLIENT)
    body {
        reply("hello")
    }
}
```

`commands` 是共享实例，宿主与扩展都向它注册。名称只允许字母开头，后接字母、数字、下划线与连字符；别名与名称共用命名空间。

## 描述与补全

```kotlin
command("map", "切换地图") {
    onComplete { args ->
        if (args.size == 1) listOf("list", "current") else emptyList()
    }
    body {
        when (argument(0)) {
            "list" -> reply("...")
            else -> reply("current map")
        }
    }
}
```

`argument(index)` 在参数缺失时抛出异常，命令体可以选择捕获并回复用法。

## 权限与可见范围

```kotlin
command("kick", "移出玩家") {
    requirePermission("rwpp.room.kick")
    requireVisibility(CommandVisibility.SERVER)
    body { /* ... */ }
}
```

- `requirePermission` 由发送者实现判断，客户端与服务端可以有不同的策略。
- `requireVisibility` 声明命令应在哪些环境出现，发送者必须覆盖全部声明范围。客户端为 `client`，无头服务端为 `server`。
- 未声明可见范围的命令在任何环境都可见。

`help` 会自动注册，并按权限与可见范围过滤，因此扩展不需要自己维护帮助列表。

## 文本与本地化

命令的回复文本由调用方组装。需要跟随语言切换时，从 `UiServices.messages()` 读取，不要把中文写死在命令体里。

## 执行线程

命令体由注册方决定在哪个线程执行。游戏内命令通常在游戏循环上执行；服务端的管理命令由原版模拟线程执行。涉及引擎状态的操作不要直接在聊天输入线程上调用。
