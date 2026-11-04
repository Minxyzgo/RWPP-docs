# 服务端

`rwpp-server` 是 Rusted Warfare 的无图形界面服务端。它与客户端共享 `rwpp-api`，不依赖声音、OpenGL 与界面库，因此可以在没有显示设备的机器上运行。

同一端口同时提供 KCP 与 TCP。客户端优先使用 KCP，失败后回退 TCP；两条路径共用同一套握手与加密实现。

## 构建

需要 JDK 25 与游戏资源。

```powershell
.\gradlew.bat :rwpp-server:installDist
```

产物位于 `build/install/rwpp-server/`，压缩包使用 `:rwpp-server:distZip`。

## 启动

运行目录需要包含原版游戏的 `assets/`，扩展放入 `extensions/`。

```powershell
.\scripts\start-server.ps1 -RuntimeDir 'E:\server-runtime' -Port 5123
```

也可以直接调用发行包的 `bin/rwpp-server.bat`，Linux 使用 `bin/rwpp-server`。

| 选项 | 用途 |
| --- | --- |
| `--help` | 查看全部参数 |
| `--port 5123` | TCP 与 UDP 端口 |
| `--no-console` | 后台运行 |
| `--ticks 180` | 运行指定帧数后退出 |
| `--transfer-mods` | 允许客户端下载服务端启用的模组 |
| `-- <参数>` | 向服务端扩展传参 |

## 控制台

房间设置与玩家管理只在大厅执行，管理命令仅对服务端控制台可见，并由原版模拟线程执行。

| 命令 | 作用 |
| --- | --- |
| `players` | 列出玩家与连接状态 |
| `maps` / `map` | 列出地图、按序号或路径切换 |
| `maxplayers` | 设置人数上限 |
| `start` | 开始对局 |
| `addai` / `ai` | 添加或调整 AI |
| `kick` / `team` / `move` | 玩家管理 |
| `credits` / `startingunits` / `income` | 对局资源设置 |
| `fog` / `revealed` / `revealedmap` / `nukes` / `sharedcontrol` | 规则开关 |
| `replay on\|off\|status` | 控制原版回放录制 |
| `status` / `say` / `return` / `stop` | 状态、广播、返回大厅与退出 |

`map` 接受列表序号、原版路径或唯一地图名；`credits` 接受 `default` 或金额；`startingunits` 接受原版预设编号，包含当前加载的模组扩展项。

## 扩展

服务端同样由 RWML 加载扩展。服务端扩展以 `rwpp-server` 为编译依赖，并在描述符中声明：

```properties
dependsOn=io.github.rwpp.api,io.github.rwpp.server
```

普通扩展遵循 RWML 生命周期；实现 `ServerExtension` 可以接管运行循环，用于自动化测试或自定义托管逻辑。

## 日志与诊断

启动日志打印端口、传输层与扩展加载结果。客户端断开时会记录原因；回放录制状态可以通过 `replay status` 查询。

扩展加载失败不会阻止服务端启动，失败的扩展及其原因会在启动输出中列出，便于对照扩展标识排查。
