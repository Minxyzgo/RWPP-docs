# 仓库 API

扩展目录是一组静态 JSON，由仓库的 `data/extensions.json` 生成，随站点一起部署。RWML 只读取 `/api/v1/index.json`，其余端点供网页、脚本与第三方工具使用。

| 端点 | 用途 |
| --- | --- |
| `GET /api/v1/index.json` | 完整目录，启动器与网页读取此文件 |
| `GET /api/v1/search.json` | 精简记录，适合搜索索引 |
| `GET /api/v1/extensions/{id}.json` | 单个扩展的完整条目 |
| `GET /api/v1/manifest.json` | 端点清单、生成时间与条目数量 |
| `GET /api/search?q=&platform=` | 服务端搜索，由 Netlify Function 提供 |

## 目录结构

```json
{
  "schemaVersion": 1,
  "name": "RWML Extension Registry",
  "generatedAt": "2026-11-03T14:36:37Z",
  "extensions": [
    {
      "id": "io.github.rwpp",
      "name": "RWPP",
      "version": "2.0.0",
      "apiVersion": "1.0.2",
      "summary": "多人联机增强与扩展运行时。",
      "description": "较长的说明，可以包含换行。",
      "authors": ["RWPP Team"],
      "tags": ["client", "multiplayer"],
      "categories": ["客户端"],
      "license": "RWPP-Team Shield 1.0.0",
      "homepage": "https://github.com/RWPP-Team/RWPP",
      "icon": "",
      "platforms": ["jvm", "android"],
      "downloads": 0,
      "updatedAt": "2026-11-03",
      "notes": "此版本的更新说明。",
      "artifacts": [
        {
          "id": "io.github.rwpp",
          "platform": "jvm",
          "url": "https://rwpp-team.top/api/archives/rwpp-client-2.0.0-jvm.jar",
          "sha256": "8545f6d6d3ae3981b19caf357168d24daaeb68f11b70792acf77afca2e9d30c6",
          "size": 79041523
        }
      ]
    }
  ]
}
```

### 条目字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 扩展标识，与归档描述符一致 |
| `name` | 是 | 显示名称 |
| `version` | 是 | 目录中的最新版本 |
| `apiVersion` | 否 | 要求的 RWML API 版本 |
| `summary` | 否 | 列表中的一行摘要 |
| `description` | 否 | 完整说明 |
| `authors` / `tags` / `categories` | 否 | 展示与筛选 |
| `license` / `homepage` / `icon` | 否 | 展示信息 |
| `platforms` | 否 | 支持平台，缺省为 `jvm` 与 `android` |
| `downloads` | 否 | 累计下载数 |
| `updatedAt` | 否 | 发布日期 |
| `notes` | 否 | 更新说明 |
| `artifacts` | 是 | 可下载归档，至少一项 |

### 归档字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 否 | 归档内的扩展标识，缺省沿用条目 `id` |
| `platform` | 否 | `jvm`、`android` 或留空表示全部平台 |
| `url` | 是 | 归档地址，由本站 `/api/archives/<文件名>` 提供 |
| `sha256` | 是 | 64 位十六进制摘要 |
| `size` | 是 | 正整数字节数 |

同一扩展可以携带多个归档：不同平台各一份，或把 API 与实现拆成两个 jar。宿主按当前平台取用全部匹配归档，逐个校验并写入扩展目录；首个失败即停止。

## 读取

```bash
curl -s https://<域名>/api/v1/index.json
curl -s "https://<域名>/api/search?q=rwpp&platform=jvm"
```

目录公开可读，没有写操作。网页与启动器都要求 HTTPS。

## 在宿主中配置

RWML 按以下顺序确定目录地址：

1. 系统属性 `rwml.repository.index`
2. 环境变量 `RWML_REPOSITORY_INDEX`
3. `data/repository.properties` 中的 `index`
4. 内置默认地址

文件内容只有一行：

```properties
index=https://<域名>/api/v1/index.json
```

修改后重启宿主，扩展页的“浏览”页签读取新目录。

## 校验规则

- 目录与归档地址必须是 HTTPS，且不得包含用户名或密码；重定向后的地址同样必须是 HTTPS。
- 归档必须带 SHA-256；缺失摘要的条目会被拒绝，不会退化为不校验安装。
- 收到字节数必须与 `size` 一致，单个归档不超过 256 MiB。
- 摘要不一致时删除临时文件并报告失败。

规则集中在宿主实现中，与手工导入共用同一条写入路径，因此不会绕过版本选择或启用状态。
