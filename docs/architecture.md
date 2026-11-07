# 架构与兼容边界

## 目标

随身工具箱 Pocket Kit（`@local/pocket-kit`）是一个根安装包，不是把全部业务塞进一个文件。业务实现和测试分别位于 `features/shortcuts/`、`features/network-speed/`、`features/outing-checklist/`、`features/music/`、`features/xiaoai/`。各目录承载业务边界；目录存在不等于运行验证通过。

统一构建输出 `dist/client.js`，只注册一个客户端载体。服务端按功能导出独立 Host 子路径条目，由 bundle 挂载；Host 子路径为 `@local/pocket-kit/{shortcuts,network-speed,outing-checklist,music,xiaoai}`，对应条目 `pocket-kit-shortcuts`、`pocket-kit-network-speed`、`pocket-kit-outing-checklist`、`pocket-kit-music`、`pocket-kit-xiaoai`；客户端载体条目为 `pocket-kit`。客户端装配层只负责依赖与注册，业务逻辑留在功能目录；构建产物不手工修改。

## 边界

- 一包统一安装、版本和构建；不同功能保留自己的 API、数据模型、测试与清理逻辑。
- UI 入口可以分别位于侧栏、菜单、主面板或浮层，入口数量不决定包数量。
- Host 条目独立有助于管理生命周期，不提供进程级或安全隔离。客户端统一启停，五个 Host 独立启停；关闭某 Host 不会移除其 UI，当前界面会显示后端不可用错误。
- 不让书签、清单、测速相互读取内部状态。共享代码只抽取真实重复的基础能力，不引入全局可变业务仓库。
- React 与 DSH 服务使用宿主提供的依赖；不另起页面框架或替代服务器。

## 保留的兼容标识

| 功能 | API | UI 标识 |
| --- | --- | --- |
| 快捷访问 | `GET /api/shortcuts/bookmarks` | 主面板及侧栏条目 `shortcuts`；菜单扩展槽 `local.shortcuts.menu.action` |
| 连接测速 | `/api/network-speed/{start,ping,download,upload,stop}` | 菜单动作、浮层条目 `network-speed` |
| 出门清单 | `GET/POST /api/outing-checklist` | 主面板及侧栏条目 `local.outing-checklist` |

不因包改名而改这些标识。测速依赖快捷访问提供入口；不默认增加另一个侧栏入口。

## 数据不随代码合并

私人文件统一放根目录 `.local/`，加入 Git 忽略并排除打包；书签目标路径为 `.local/bookmarks.json`。清单默认路径继续使用 `~/.dsh/outing-checklist.json`，不能因合并而创建第二份空清单。其他功能未来独立定义数据迁移和备份策略，不把全部业务揉成一个大 JSON。

## 迁移状态

根包清单已提供上述导出与统一脚本。构建读取四个功能工厂（media 工厂显式内联 music/xiaoai 两个独立视图），合并为唯一运行时模块 `@local/pocket-kit`；功能源码保留旧 wrapper 便于测试，不表示运行时还分别注册旧客户端。测速 measurement 由根构建内联，无需子构建。安装步骤与回滚留存见[迁移记录](migration.md)，后续操作遵循[开发流程](development.md)。避免旧、新 Host 同时注册相同 API。

构建、40 项测试及打包检查结果已记录在[迁移记录](migration.md)；客户端刷新、真机布局与交互仍有验证限制，不以 Host 激活替代浏览器验收。

## 音乐与小爱迁移边界

- `features/media/client.js` 只提供共享手机页面壳、请求/状态控件和两个 tab 的注册；业务界面在各自 `view.js`。音乐和小爱仍各有独立后端。
- `lib/module-host.mjs` 的 FeatureService 是 UI 和 Agent 工具共用的操作入口；`lib/http-adapter.mjs` 把原 Node HTTP 业务处理器接到 DSH Fetch，不另开管理服务器。
- 实际管理路由为 `POST /api/pocket-kit/music` 和 `POST /api/pocket-kit/xiaoai`，输入 `{module,path,method,body}`，path 是功能内短路径。外层只允许带 `X-Pocket-Kit: 1` 的同源 JSON；内层支持旧 GET/POST/PUT/DELETE 语义。
- 音乐 module 为 `music`；小爱为 `playback`（默认）和 `assistant`。浏览器音频单独走已认证的 `GET /api/pocket-kit/music/audio?file=...`，支持 Range，不把整个音频缓存在内存。
- 主面板/侧栏 key：`pocket-kit.music`、`pocket-kit.xiaoai`，页面顶部相互切换。
- Agent 的 `pocket_music` / `pocket_xiaoai` 先 help 发现具体操作，再 request；与 UI 共用业务方法。登录授权与下载器安装不开放给 Agent 工具。真实设备控制必须符合用户明确请求。
- 查询请求取消会中止音乐搜索/刮削/标签读取的网络或子进程；已接收的下载任务归 Host，页面关闭不撤销入队。卸载会中止本实例任务并清理。
- 小爱 worker 是业务必须的设备协议桥，不是替代 DSH GUI 的服务器；默认不开启，显式启动也不连接或接管其他进程的旧 worker。详细数据与验证见[迁移记录](music-xiaoai-migration.md)。

## 1.3.0 五模块扩展

新增独立Host子路径 file-manager、health、beijing-pass、terminal、bill-manager；共10个业务Host和1个客户端载体。客户端 utilities 工厂显式内联五个独立 view.js，业务后端仍按模块隔离。utility-host复用FeatureService，并为原始上传/下载提供认证路由。详见[五模块迁移记录](utilities-migration.md)。

## 1.4.0 原生终端增强合包

terminal-touch-keys工厂和viewport辅助逻辑纳入根构建，与已有六个工厂一起输出唯一dist/client.js。沿用原生终端扩展桥与侧栏扩展桥，不增加Host条目、不增加独立安装包。独立terminal-touch-keys安装已移除，旧目录归档至.local/legacy-plugins。新增功能默认遵守AGENTS的单包迭代约定。

## 1.6.0 终端统一

旧轻量terminal Host退役，当前为9个业务Host和1个客户端载体。工具箱终端由terminal-touch-keys工厂贡献，指向与侧栏相同的pocket-kit.native-terminal；utilities工厂只内联文件、进京证、健康、记账单四个视图。原tmux和配置数据保留，自动t命令未部署且已取消。
