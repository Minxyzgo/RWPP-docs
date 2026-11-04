# 核心发布

RWML 的核心库与映射后的游戏库发布到 Maven Central，供扩展作者编译时引用。扩展作者依赖两个坐标：

```kotlin
compileOnly("io.github.rwpp-team:rwml-core:1.0.2")
compileOnly("io.github.rwpp-team:game-lib:v3-1.15")
```

`game-lib` 的 `v3` 是映射修订号，游戏版本仍是 1.15。它附带反编译源码，便于在 IDE 中对照原版实现。两者都应以 `compileOnly` 引入：运行时由宿主提供 core，游戏类由宿主进程提供。

## 构建要求

- Windows 与 JDK 25（构建工具链使用新版本语言特性，产物对 Java 17 可用）。
- Python 3.10+ 与 GPG，仅在发布到 Maven Central 时需要。
- 已通过验证的 Central 命名空间与 Portal 用户令牌。

## 发布流程

仓库中的 `scripts/publish/publish-core.ps1` 封装了签名、校验和上传：

```powershell
.\scripts\publish\publish-core.ps1 -Action PrepareSigning
.\scripts\publish\publish-core.ps1 -Action SaveToken
.\scripts\publish\publish-core.ps1 -Action Build -Offline
.\scripts\publish\publish-core.ps1 -Action Publish -Offline
.\scripts\publish\publish-core.ps1 -Action Status
```

凭据与 RSA-4096 签名密钥保存在仓库之外的 `%USERPROFILE%\.gradle\rwml-central`，令牌与密码使用当前 Windows 用户加密。

构建产物为 `build/rwml-<version>-central-bundle.zip`，部署记录写入 `build/central-deployment-rwml-<version>.json`。签名、POM、源码与 Javadoc 都包含在包内。

游戏库单独发布，使用同一套凭据：

```powershell
.\scripts\publish\publish-core.ps1 -Target GameLib -Action Build -Offline
.\scripts\publish\publish-core.ps1 -Target GameLib -Action Publish -Offline
```

它生成 `build/game-lib-v3-1.15-central-bundle.zip`，包含映射后的二进制与生成的 Java 源码。

## 版本与兼容

新版本需要同时更新 `gradle.properties` 中的版本、内置扩展的描述符与文档示例。已发布的 Central 版本不能覆盖，因此每次发布都要递增版本号。

`rwml-core` 的公共 API 面向 Java 17 字节码，宿主工具链可以使用更新的 JDK，但扩展库的编译目标应保持 Java 17。
