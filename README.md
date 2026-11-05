# RWPP-docs

文档站源码。站点部署在 Netlify（`rwpp-team.top`）。

## 部署

站点的自动构建已停止，推送到 `main` 不会触发 Netlify 构建。每次发布在本机构建，再用命令行上传：

```bash
python scripts/build_local.py   # 生成目录数据、MkDocs 页面、_redirects 与 _headers
python C:/Users/12253/.gradle/rwpp-docs/publish.py   # 本机构建并通过 Netlify CLI 部署
```

`netlify.toml` 中的重定向与响应头规则由 `scripts/build_local.py` 写入 `site/_redirects` 与
`site/_headers`。Netlify 的构建原本在服务端完成这一步，手动部署上传的是构建产物，因此必须在本地生成。
`netlify/functions` 下的两个函数随部署一并上传，运行环境所需的变量保存在站点环境变量中。

`RWPP_ARCHIVE_SECRET` 用于给目录中的归档地址签名，由运维脚本从本机凭据文件注入，不进入仓库。
