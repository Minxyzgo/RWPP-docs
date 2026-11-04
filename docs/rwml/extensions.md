# 扩展系统

扩展是一个带 `META-INF/extension.properties` 的 jar。宿主只读取描述符，不执行扩展代码即可完成发现、排序与版本选择。

## 描述符

```properties
id=com.example.hello
name=Hello
version=1.0.0
mainClass=com.example.HelloExtension
apiVersion=1.0.0
description=最小示例扩展
authors=Example
license=MIT
tags=example,ui
dependsOn=io.github.rwpp.api
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 扩展标识，同一时间只加载一个版本 |
| `version` | 是 | 归档版本，参与比较与选择 |
| `mainClass` | 否 | 实现 `io.github.rwml.api.Extension` 的入口类；资源包可以省略 |
| `apiVersion` | 否 | 依赖的 API 版本，用于展示与校验 |
| `dependsOn` | 否 | 硬依赖，可带版本约束 |
| `loadAfter` / `loadBefore` | 否 | 仅影响顺序，不构成依赖 |
| `uiFramework` | 否 | 实现 `UiFramework` 的类，宿主据此启动界面 |
| `resourcePack` | 否 | 为 `true` 时按资源包处理 |

入口类通过无参构造函数实例化。`onLoad` 抛出的异常会让扩展进入失败状态，其他扩展继续加载。

## 依赖与顺序

```properties
dependsOn=com.example.core, com.example.render>=1.4
dependsOn=com.example.core >= 1.4 <2.0
```

约束支持比较运算符、`^`、`~`、`=1.4.x` 与显式区间。无法解析的版本号按 0 处理，不会阻止宿主启动。

`loadAfter` 与 `loadBefore` 只表达顺序偏好。真正缺失的依赖会让扩展被标记为失败，并在界面中给出依赖名称。

## 版本选择

同一标识可以并存多个归档，但一个进程只加载一个。选择记录在 `data/extension-state.properties`；没有记录时，宿主取满足依赖约束的最高版本。

版本冲突不会静默处理：启动器会要求为每个冲突标识选定版本，再进入游戏。

## 整合包

整合包是一个 zip，内含多个扩展 jar 以及可选的 `rwml-pack.properties`。导入时逐个安装成员：

- 已有同一版本的相同内容会被跳过。
- 较新的版本替换较旧版本，旧归档在不再被占用后删除。
- 清单中的固定版本在安装完成后写入，使下一次启动按作者意图解析。

导入结果按成员汇总，单个成员失败不影响其他成员。

## 从仓库安装 {: #repository-install }

扩展仓库读取一份 HTTPS 目录 JSON，按标识安装对应平台的归档。客户端实现位于 `core`，桌面与 Android 共用。

安装规则：

| 检查 | 处理 |
| --- | --- |
| 地址协议 | 只接受 HTTPS，不得包含凭据；重定向后仍需 HTTPS |
| 摘要 | `sha256` 必填，缺失摘要的条目拒绝安装 |
| 大小 | 单个归档不超过 256 MiB，目录文档不超过 8 MiB |
| 一致性 | 收到字节数与 `size` 一致，摘要不符即删除临时文件 |

安装写入扩展目录，与手工导入共用同一条路径，因此不会绕过版本选择或启用状态。同一扩展的多个归档按顺序安装，首个失败即停止，避免留下版本不一致的组合。

目录地址按以下顺序确定：

1. 系统属性 `rwml.repository.index`
2. 环境变量 `RWML_REPOSITORY_INDEX`
3. `data/repository.properties` 中的 `index`
4. 内置默认地址

## 在界面中管理

启动器的扩展页提供搜索、详情、启用、禁用、移除与版本选择。导入同一标识时询问是否替换；移除只删除归档，扩展数据保留。所有文件操作在界面线程之外执行，改动在重启后生效。

仓库页在此基础上增加安装与更新：列表标出未安装、可更新与已是最新，支持逐个安装与全部更新。

字段定义与接口见 [仓库 API](../api/index.md)。
