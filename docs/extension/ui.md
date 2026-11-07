# 界面

扩展可以提供自己的启动界面，也可以只在游戏内绘制内容。两者的入口不同：启动界面由 `UiFramework` 接管，游戏内内容通过事件与游戏绘制接口完成。

## 声明启动界面

在描述符中声明实现 `io.github.rwml.api.ui.UiFramework` 的类：

```properties
uiFramework=com.example.MyLauncher
```

宿主在扩展加载完成后实例化这个类并调用 `start(host)`。桌面在启动器线程调用，Android 在加载线程调用，涉及视图的操作需要提交到主线程。

同一进程只启动一个界面框架。声明了框架的扩展会接管启动流程，其他扩展不能再提供第二个；没有声明时，桌面端回退到游戏原始启动器。

## 宿主与表面

`UiHost` 提供平台对象、启动参数、游戏引导流程与共享服务：

```kotlin
class MyLauncher : UiFramework {
    override fun start(host: UiHost) {
        val services = host.services()
        val surface = host.createSurface()
        val composeHost: Any = host.platform()
        // 在 surface 的界面线程上挂载内容
        services.messages().text("my.launcher.title")
    }
}
```

`createSurface()` 返回的平台表面负责界面线程、原生内容挂载与关闭通知。桌面接受 AWT 窗口，Android 接受挂接到现有 Activity 的视图。不支持自有表面的宿主会抛出 `UnsupportedOperationException`，实现方应当处理。

启动游戏使用 `host.gameBoot()`，并把进度回调接到自己的加载界面。游戏引导只会执行一次，重复请求不会创建第二个引擎。

## Compose

界面通常使用 Compose Multiplatform 实现。扩展需要自行携带 Compose 运行时与资源，宿主不提供 UI 工具包。桌面与 Android 的依赖差异由各自的源集处理，界面代码可以共用。

RWPP 客户端的 Aero 控件位于客户端扩展内部，不属于公开 API。第三方扩展可以参照其行为，但不能依赖这些类，因为客户端升级可能改变它们。

## 游戏内绘制

不接管启动流程的扩展可以通过绘制事件在游戏画面上叠加内容：

- `UnitDrawEvent` 与 `UnitOverlayBarEvent` 用于单位相关的绘制。
- `DrawFrameEvent` 用于每帧一次的覆盖层绘制。
- 地形与水面的效果必须按游戏窗口裁剪，遵守原版迷雾规则。

这些事件频率高，监听器应避免分配对象，也不要保存事件实例。

## 多语言与诊断

文案通过 `UiServices.messages()` 获取，支持扩展自己的命名空间。界面语言变化时订阅 `UiHooks.LANGUAGE_CHANGED` 刷新。

`start` 抛出的异常会被宿主记录：Android 显示诊断界面，桌面端回退到游戏原始启动器。
