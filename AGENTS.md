# Pocket Kit 开发索引

随身工具箱（`@local/pocket-kit`）：一个安装包，按业务分模块。按任务读取以下文档；详细约束与验证记录不堆在本索引。

**默认单包迭代：除非用户明确强调开发独立插件，否则所有新增功能、界面扩展和修复都必须基于当前 `@local/pocket-kit` 插件迭代。** 业务放入 `features/<feature>/` 并接入根包统一构建、安装和文档；不要默认新建独立安装包或额外插件管理条目。功能需要不同 UI 入口或内置兼容桥，不构成拆包理由。

**宿主启动安全：默认不直接修改 DSH npm/npx 安装目录里的内置插件产物。** 若确需宿主兼容补丁，先说明具体改动、启动风险及可验证回滚方案，并取得针对宿主改动的明确同意。语法检查、单元测试、安装返回 applied 都不等于浏览器启动成功；缺乏真实激活验证时不得宣称宿主补丁已验收。1.5.0 专用终端适配曾导致 Web boot 失败，已撤回，禁止重新应用 `dedicated-bridge.mjs`。

- [架构与兼容边界](docs/architecture.md)：目录、客户端载体、Host 条目、稳定 API / 面板 ID。
- [开发与新增功能](docs/development.md)：实现流程、文档更新、构建验证及迁移待办。
- [安全与隐私](docs/security-privacy.md)：私人文件、凭据、打包、存储与日志；接触数据前必读。
- [移动端规范](docs/mobile.md)：手机主用的布局、触控、键盘与验收要求；修改 UI 前必读。
- 功能：[工具箱导航](docs/features/home.md) · [快捷访问](docs/features/shortcuts.md) · [连接测速](docs/features/network-speed.md) · [出门清单](docs/features/outing-checklist.md) · [音乐](docs/features/music.md) · [小爱音箱](docs/features/xiaoai.md)。
- 新迁入：[文件](docs/features/file-manager.md) · [进京证](docs/features/beijing-pass.md) · [健康](docs/features/health.md) · [终端](docs/features/terminal.md) · [记账单](docs/features/bill-manager.md)。
- [右侧终端辅助按键](docs/features/terminal-touch-keys.md)：同包功能与本机内置终端扩展桥，DSH升级兼容限制。
- [五模块迁移记录](docs/utilities-migration.md)：数据核验、安装状态和功能差异。
- [音乐与小爱迁移记录](docs/music-xiaoai-migration.md)：数据保留、兼容路径、设备默认暂停及验证边界。涉及真实音箱前必读。
- [功能文档模板](docs/features/_template.md)：新增功能时复制，记录 API、数据、重要决策、生命周期及验证限制。

每次新增或修改功能，必须同步更新对应功能文档中的重要决策、数据/API、验证结果和限制；新增功能还要补本页索引。手机是主要使用场景，隐私文件不得进入 Git、发布包或客户端。

[安装迁移与验证记录](docs/migration.md)记录本次合包和回滚方式。架构规范不等于验收通过；以源码、根包脚本及实际执行记录为准。
