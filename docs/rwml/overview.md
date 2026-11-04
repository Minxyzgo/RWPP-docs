# 运行时概览

RWML 在游戏启动前决定加载哪些扩展，在类加载阶段改写游戏类，然后把控制权交给游戏或扩展界面。

## 边界

`core` 不引用游戏类，只定义扩展 API、依赖解析、仓库与引导流程。桌面与 Android 共用这一份实现。

这条边界是硬性约束。core 一旦引用游戏类，宿主加载 core 时就会提前定义游戏类，Android 上的 mixin 随之失效。构建会检查 core 的类文件是否引用了宿主或游戏类型。

游戏相关的部分在 `game-adapter`，平台相关的部分在 `desktop` 与 `android`。

## 启动顺序

1. 启动器确认 Java 版本，准备运行时。
2. 扫描扩展目录，读取每个归档的描述符。
3. 解析依赖，处理同一标识的版本冲突。
4. 注册 mixin，逐个加载扩展并调用 `onLoad`。
5. 界面框架接管启动流程，进入游戏。

第 3 步可以中断启动。同一标识有多个版本且没有选定版本时，桌面端会打开扩展管理界面，要求先选择。

## 数据目录

桌面端的数据目录是游戏目录下的 `data/`：

| 路径 | 内容 |
| --- | --- |
| `data/extension-state.properties` | 禁用列表、选中版本与资源包 |
| `data/resource-pack/` | 当前资源包物化后的文件 |
| `data/language.txt` | 界面语言偏好 |
| `data/repository.properties` | 扩展目录地址 |
| `extensions/` | 扩展归档，位于数据目录之外 |

启用状态按标识记录。切换版本不改变启用状态。移除扩展只删除归档，扩展数据保留。

## 平台差异

| 项目 | 桌面 | Android |
| --- | --- | --- |
| 启动方式 | 替换后的 `game-lib.jar` | APK 内的宿主进程 |
| Java | Java 8+ 引导，自动获取 Java 25 | 系统运行时 |
| 扩展目录 | 游戏目录下的 `extensions/` | `/storage/emulated/0/rustedWarfare/extensions` |
| 类改写 | 启动时安装 ASM agent | 预先生成 dex 并缓存 |
| 存储权限 | 普通文件读写 | 首次启动申请 |

扩展归档变化时，Android 重建 dex 缓存；校验值未变则复用。

## 故障处理

扩展加载失败不会阻止游戏启动。失败的扩展被隔离，启动器列出原因。mixin 注册失败时，依赖它的扩展不会加载。

两个参数用于排查：

- `--rwml-no-launcher`：跳过启动器，直接进入游戏。
- `--rwml-manager`：界面扩展不可用时强制打开管理界面。

日志保留原始语言，不受界面语言影响。

## 相关文档

- [扩展系统](extensions.md)
- [资源包](resource-packs.md)
- [界面框架](ui.md)
- [发布](publishing.md)
