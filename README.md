# 随身工具箱 · Pocket Kit

一个只为自己使用、手机优先的 DSH 个人工具包：`@local/pocket-kit`。
统一安装和构建，按功能维护代码，不把不同业务塞进一个大文件。

## 现有功能

- **快捷访问**：侧栏底部「随身工具箱」菜单，网站书签及详情/备注。
- **连接测速**：工具箱菜单 → 连接测速；测量当前浏览器与 DSH 服务端之间的连接。
- **出门清单**：保留侧栏独立入口，在主面板管理可重复使用的物品清单。

一个客户端载体负责三个功能的界面，三个 Host 条目分别负责书签 API、测速服务与清单 API。后端条目可以单独启停，但不提供进程级隔离；关闭某后端不会自动隐藏相应界面。

## 开发

需要支持内置 `node:test`、Fetch 和 ESM 的现代 Node.js（本环境验证版本见迁移记录）。无第三方构建依赖、无需安装脚本。

```sh
npm run build   # 明确列出的功能源代码 → dist/client.js
npm run check   # 语法和导出资源检查
npm test        # 功能测试与合并注册测试；首次先 build
npm run verify # 完整执行以上步骤
```

只安装仓库根目录，不再分别安装功能子目录。通过 DSH `plugin_manager install_bundle` 安装；不要手写 profile 配置。已有三个旧包的迁移与回滚见 [迁移记录](docs/migration.md)。首次本地安装前必须先构建。

更新客户端后先运行构建，再按安装结果重新加载并刷新原 GUI；Host 更新若要求重启，应重启既有 DSH 服务。没有验证同一 checkout 的开发 watcher 时，不承诺热更新，也不启动替代服务器。

## 私人配置

私人书签放在 `.local/bookmarks.json`，该目录被 Git 忽略且不进入发布文件清单。全新配置可从 [示例](features/shortcuts/bookmarks.example.json) 复制；已有文件不要覆盖。缺少书签文件时显示空列表。

Key、token 等未来私密配置也放在忽略的本地文件中并仅由 Host 读取，或使用 DSH 的 credentials service。**书签备注会发给已登录浏览器，不是密钥保险箱。** 清单沿用原服务端数据位置，不因合包自动搬迁或重置。

## 文档

- [AGENTS 开发索引](AGENTS.md)：后续 Agent 的最小入口。
- [架构](docs/architecture.md) · [新增功能流程](docs/development.md)
- [安全与隐私](docs/security-privacy.md) · [手机适配规范](docs/mobile.md)
- [快捷访问](docs/features/shortcuts.md) · [测速](docs/features/network-speed.md) · [出门清单](docs/features/outing-checklist.md)
- [功能文档模板](docs/features/_template.md)：新增功能时记录数据、API、重要决策、生命周期和实际验证结果。

本次为保留既有行为的结构合并和移动端基础改进，不代表所有历史 UI 已完成视觉验收；实际验证范围和限制见迁移记录。
