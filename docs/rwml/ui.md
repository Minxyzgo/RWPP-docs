# 界面框架

RWML 不提供通用界面，只规定扩展如何取得平台窗口与共享服务。桌面与 Android 的窗口、绘制表面与事件源完全不同，因此界面代码必须由扩展按平台实现。

## 声明与启动

扩展在描述符中声明实现 `io.github.rwml.api.ui.UiFramework` 的类：

```properties
uiFramework=com.example.MyFramework
```

宿主在加载该扩展后实例化这个类，并调用一次 `start(UiHost)`。没有扩展声明界面框架时不会启动任何框架，桌面端回退到游戏原始启动器。

同一进程只启动一个界面框架。多个扩展声明时，按加载顺序取第一个，其余仅作为普通扩展加载。

## UiHost

`UiHost` 是宿主交给界面的对象：

| 方法 | 用途 |
| --- | --- |
| `services()` | 共享的翻译、扩展库、仓库与事件 |
| `platform()` | 平台对象；桌面为运行时，Android 为 `Context` |
| `arguments()` | 启动参数 |
| `gameBoot()` | 共享的游戏启动流程 |
| `createSurface()` | 创建扩展自有界面表面 |
| `createGameSurface()` | 在游戏视图上叠加内容 |
| `openScreen(name)` | 请求平台切换到某个界面 |
| `restart()` | 在新进程中重启宿主 |

`createSurface()` 与 `createGameSurface()` 不是所有宿主都支持，调用前应处理 `UnsupportedOperationException`。

## UiServices

`UiServices` 在游戏类加载前即可使用：

- `messages()`：翻译与语言切换。
- `extensions()`：扩展库，读取条目、启用、移除、导入。
- `repository()`：扩展仓库，搜索、安装与更新；不支持远程仓库的宿主会返回不可用。
- `hooks()`：类型化通知，例如扩展列表变化与语言变化。
- `register(Class, service)`：注册类型化服务，避免 core 引用平台类型。
- `registerScreen(name, executor, screen)`：以命名空间注册额外界面。

界面实现应把目录读取与文件操作放到工作线程，把结果切回界面线程。扩展库的写入是同步的，不能在界面线程上直接调用。

## 绘制表面

`UiSurface` 提供界面线程执行器、原生内容挂载与关闭通知。桌面接受 AWT 窗口，Android 接受挂接到现有 `ComponentActivity` 的视图。挂载与关闭都由平台决定，扩展不应假设窗口的生命周期。

## 多语言

界面文案通过 `Messages.text(key, args...)` 获取。宿主内置中英文资源；扩展可以用自己的命名空间补充键值，并在语言变化时通过 `UiHooks.LANGUAGE_CHANGED` 刷新界面。

诊断日志保持原始语言，不随界面语言变化。

## 失败恢复

`start` 抛出的异常会被宿主记录。Android 显示内置诊断界面，桌面端回退到游戏原始启动器，因此界面框架的缺陷不会让进程停在空白窗口上。
