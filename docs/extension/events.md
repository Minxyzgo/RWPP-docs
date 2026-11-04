# 事件

RWPP 的 API 提供一个进程级事件通道。监听器是协程，广播在发布者协程中按优先级顺序执行；只有当监听器显式指定调度器时才会切换线程。

## 订阅

```kotlin
val owner = EventOwner(context)
GlobalEventChannel.filter(ChatMessageEvent::class).subscribeAlways(owner) { event ->
    event.cancel()
}
```

`owner` 把订阅绑定到扩展的生命周期，卸载时自动关闭。一次性监听取 `subscribeOnce` 或 `subscribeGlobalOnce`。

优先级从高到低为 `HIGHEST`、`HIGH`、`NORMAL`、`LOW`、`LOWEST`、`MONITOR`。`MONITOR` 用于观测，事件被拦截后仍会收到通知。

## 拦截与取消

`intercept()` 表示事件已被处理，后续普通监听器跳过，只有 `MONITOR` 继续收到；`cancel()` 表示结果被否决，发布方据此跳过原版行为。两者语义不同，按用途选择。

监听器抛出异常时默认记录日志并继续广播；声明可失败的事件会让异常向发布方传播。

## 事件一览

### 聊天与系统消息

| 事件 | 参数 |
| --- | --- |
| `ChatMessageEvent` | 发送者、消息、颜色 |
| `SystemMessageEvent` | 文本 |

### 帧与模拟

| 事件 | 时机 |
| --- | --- |
| `FrameBeginEvent` / `FrameEndEvent` | 每帧首尾，带 `deltaMillis` |
| `DrawFrameEvent` | 绘制阶段 |
| `SimulationBeforeTickEvent` / `SimulationAfterTickEvent` | 模拟步前后，带 tick |
| `UnitDrawEvent` / `UnitOverlayBarEvent` | 单位绘制与血条覆盖 |

这些事件频率很高。监听器不得保存事件对象，也不要在其中做分配密集的工作。

### 游戏与状态

`GameLoadedEvent`、`StartGameEvent`、`ResumeGameEvent`、`GameOverEvent`、`QuitGameEvent`、`ReturnMainMenuEvent`、`HostGameEvent`、`HostSinglePlayerGameEvent`、`MapChangedEvent`、`StateChangedEvent`、`RefreshUIEvent`。

### 地图与回放

`MapLoadEvent`、`ReplayLoadEvent`。

### 模组

`ReloadModEvent`、`ReloadModFinishedEvent`、`ModReloadFailedEvent`、`ModCheckEvent`。

### 网络与房间

`TransportConnectedEvent`、`JoinGameEvent`、`DisconnectEvent`、`RoomReturnedEvent`、`RoomSetupAppliedEvent`、`PlayerJoinAttemptEvent`。

### 玩家与队伍

`PlayerJoinEvent`、`PlayerLeaveEvent`、`PlayerDefeatedEvent`、`TeamWipedOutEvent`。

### 单位

`UnitSpawnedEvent`、`UnitCreatedEvent`、`UnitConstructionCompletedEvent`、`UnitDamagedEvent`、`UnitTeamChangedEvent`、`UnitUpgradedEvent`、`UnitDiedEvent`、`UnitRemovedEvent`。

### 世界与触发器

`TriggerActivateEvent`、`LocalPlayerUnitDamagedEvent`、`LocalPlayerBaseDamagedEvent`、`LocalPlayerUnitCreatedEvent`、`LocalPlayerBuildingConstructedEvent`、`LocalPlayerUpgradedCompletedEvent`。

### 存档

`PersistenceBeforeEvent`、`PersistenceSavedEvent`、`PersistenceLoadedEvent`、`PersistenceFailedEvent`。

### 命令

`CommandQueueEvent`、`CommandPathsReadyEvent`。

## 发布

扩展可以创建自己的 `EventChannel` 广播内部事件；需要让其他扩展看到时，使用 `GlobalEventChannel`。广播是挂起函数，调用方决定在哪个线程等待。

事件对象在广播结束后不再有效。需要跨帧保存的数据应复制到自己的状态中。
