# RWPP-docs

RWML 与 RWPP 的文档站源码。站点面向玩家与扩展作者，提供产品说明、安装指引、扩展开发文档与扩展目录。

## 页面

| 目录 | 内容 |
| --- | --- |
| `docs/index.md` | 站点首页 |
| `docs/rwml/` | RWML 的架构、扩展系统、资源包与界面框架 |
| `docs/rwpp/` | RWPP 的安装、功能、服务端与常见问题 |
| `docs/extension/` | 扩展开发文档 |
| `docs/api/` | 目录接口说明 |
| `docs/downloads/` | 发行版下载入口 |

页面结构与导航由 `mkdocs.yml` 定义。

## 数据

扩展目录条目保存在 `data/extensions.json`，接口快照位于 `docs/api/v1/`。归档地址的签名密钥由站点环境变量提供，仓库不保存凭据。

## 许可

站点内容随 RWPP-Team 项目分发。
