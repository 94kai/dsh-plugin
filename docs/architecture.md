# 架构与兼容边界

## 目标

随身工具箱 Pocket Kit（`@local/pocket-kit`）是一个根安装包，不是把全部业务塞进一个文件。业务实现和测试分别位于 `features/shortcuts/`、`features/network-speed/`、`features/outing-checklist/`。各目录承载业务边界；目录存在不等于运行验证通过。

统一构建输出 `dist/client.js`，只注册一个客户端载体。服务端按功能导出独立 Host 子路径条目，由 bundle 挂载；Host 子路径为 `@local/pocket-kit/{shortcuts,network-speed,outing-checklist}`，对应条目 `pocket-kit-shortcuts`、`pocket-kit-network-speed`、`pocket-kit-outing-checklist`；客户端载体条目为 `pocket-kit`。客户端装配层只负责依赖与注册，业务逻辑留在功能目录；构建产物不手工修改。

## 边界

- 一包统一安装、版本和构建；不同功能保留自己的 API、数据模型、测试与清理逻辑。
- UI 入口可以分别位于侧栏、菜单、主面板或浮层，入口数量不决定包数量。
- Host 条目独立有助于管理生命周期，不提供进程级或安全隔离。客户端统一启停，三个 Host 独立启停；关闭某 Host 不会移除其 UI，当前界面会显示后端不可用错误。
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

根包清单已提供上述导出与统一脚本。构建读取三个功能工厂，合并为唯一运行时模块 `@local/pocket-kit`；功能源码保留旧 wrapper 便于测试，不表示运行时还分别注册旧客户端。测速 measurement 由根构建内联，无需子构建。安装步骤与回滚留存见[迁移记录](migration.md)，后续操作遵循[开发流程](development.md)。避免旧、新 Host 同时注册相同 API。

构建、40 项测试及打包检查结果已记录在[迁移记录](migration.md)；客户端刷新、真机布局与交互仍有验证限制，不以 Host 激活替代浏览器验收。
