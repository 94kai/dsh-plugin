# Pocket Kit 开发索引

随身工具箱（`@local/pocket-kit`）：一个安装包，按业务分模块。按任务读取以下文档；详细约束与验证记录不堆在本索引。

- [架构与兼容边界](docs/architecture.md)：目录、客户端载体、Host 条目、稳定 API / 面板 ID。
- [开发与新增功能](docs/development.md)：实现流程、文档更新、构建验证及迁移待办。
- [安全与隐私](docs/security-privacy.md)：私人文件、凭据、打包、存储与日志；接触数据前必读。
- [移动端规范](docs/mobile.md)：手机主用的布局、触控、键盘与验收要求；修改 UI 前必读。
- 功能：[快捷访问](docs/features/shortcuts.md) · [连接测速](docs/features/network-speed.md) · [出门清单](docs/features/outing-checklist.md)。
- [功能文档模板](docs/features/_template.md)：新增功能时复制，记录 API、数据、重要决策、生命周期及验证限制。

每次新增或修改功能，必须同步更新对应功能文档中的重要决策、数据/API、验证结果和限制；新增功能还要补本页索引。手机是主要使用场景，隐私文件不得进入 Git、发布包或客户端。

[安装迁移与验证记录](docs/migration.md)记录本次合包和回滚方式。架构规范不等于验收通过；以源码、根包脚本及实际执行记录为准。
