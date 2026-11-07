# 元数据

宿主只依赖 `META-INF/extension.properties` 判断扩展的身份、版本与依赖，因此这个文件必须放在归档根部的 `META-INF/` 下，并使用 UTF-8 编码。

## 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 扩展标识，只允许字母、数字、点、下划线与连字符 |
| `name` | 否 | 显示名称，缺省使用标识 |
| `version` | 是 | 版本号，参与比较与选择 |
| `description` | 否 | 说明文本 |
| `authors` | 否 | 作者，逗号分隔 |
| `license` / `licenseUrl` | 否 | 许可证名称与地址 |
| `homepage` | 否 | 项目主页 |
| `icon` | 否 | 图标在归档内的路径 |
| `tags` | 否 | 标签，逗号分隔 |
| `mainClass` | 否 | 实现 `Extension` 的入口类；资源包可以省略 |
| `uiFramework` | 否 | 实现 `UiFramework` 的类 |
| `resourcePack` | 否 | 为 `true` 时按资源包处理 |
| `apiVersion` | 否 | 依赖的 API 版本 |
| `dependsOn` | 否 | 硬依赖，可带版本约束 |
| `loadBefore` / `loadAfter` | 否 | 顺序提示，不构成依赖 |

旧版的注解式元数据不再读取。所有信息以这个文件为准，归档中的其他描述文件不参与解析。

## 依赖

```properties
dependsOn=com.example.core, com.example.render>=1.4
dependsOn=com.example.core >= 1.4 <2.0
```

| 写法 | 含义 |
| --- | --- |
| `lib` | 任意版本 |
| `lib>=1.4`、`lib<2.0` | 单侧边界 |
| `lib=1.4.2` | 精确版本 |
| `lib^1.4.2` | `[1.4.2, 2.0)`；最左侧非零位决定上限 |
| `lib~1.4.2` | `[1.4.2, 1.5)` |
| `lib=1.4.x` | `[1.4, 1.5)` |
| `lib[1.4,2.0)` | 显式区间 |
| `lib>=1.4 <2.0` | 同一标识的多个边界 |

版本号按点分数字比较，缺失段视为 0；`-` 之后的部分表达预发布顺序，`+` 之后的元数据不参与比较。

## 顺序提示

`loadAfter` 与 `loadBefore` 只影响加载顺序。依赖缺失不会因为顺序提示而被满足，宿主会直接把扩展标记为失败，并列出缺失的标识。

## 整合包清单

整合包可以在根目录放 `rwml-pack.properties`，声明包名、版本与固定版本：

```properties
name=RWPP
version=2.0.0
pin.io.github.rwpp.api=1.0.2
pin.io.github.rwpp=2.0.0
```

`pin.<id>` 表示安装完成后为该标识写入选中版本，使下一次启动按作者意图解析。没有清单的 zip 也可以导入，宿主只按成员逐个安装。

## 资源与本地化

归档内除类文件外的资源可用于界面、配置与原生库。原生库通过 `ExtensionContext.extractNativeLibrary(entry)` 提取到扩展私有目录，再交给 `System.load`；宿主不选择 ABI。

扩展可以用自己的命名空间补充翻译键，通过 `UiServices.messages()` 注册。语言切换后需要刷新界面时订阅 `UiHooks.LANGUAGE_CHANGED`。
