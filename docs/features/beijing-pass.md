# 进京证（1.3.0）

## 目的、API 与数据

查询证件、脱敏车辆/驾驶人资料、手动申请、监控结果和自动办理开关。保留功能内 `/config`、`/prepare`、`/state`、`/apply`、`/automation`、`/automation/check`。状态查询会访问官方服务及刷新现有凭据；办理会提交真实申请，前端明确确认并由后端再次检查已有证件。

`.local/data/beijing-pass/` 保存配置、固定目的地、历史申请尝试和自动任务。旧凭据沿用后端0600私有文件，不回显到浏览器、工具或发布包；此迁移未创建新的 DSH OAuth 登录流程，未转换为 credentials service。凭据输入为password，空值保留原值。只允许北京官方HTTPS接口，禁止重定向。

## 重要决策与生命周期

迁移保留原config/automation的migration-backup副本；新副本 `enabled=false,migrationPaused=true`，活动监控改为 migration-paused。原服务不修改。用户确认旧服务停止后才在UI开启每日22:00自动办理。未启用时不创建定时器，也不在启动时发送迁移提醒。凭据、自动授权与办理确认只在UI；Agent可读取状态/查询。

后端维护12秒上游超时、保存队列、重复申请保护与历史attempts；Host卸载清理定时器并中止网络请求。真实申请、凭据有效性及通知未测试，避免消耗额度或重复提交。固定目的地保留旧数据，新增目的地的图形编辑不在此版本。

## 共同接入与移动端

客户端由 `features/utilities/client.js` 装配 React 页面，不嵌入旧 HTML、不另起服务器。工具箱卡片打开 `pocket-kit.beijing-pass`；Host 条目为 `pocket-kit-beijing-pass`。管理请求走已认证的 `POST /api/pocket-kit/beijing-pass`，JSON envelope 为 `{path,method,body}`，要求 `X-Pocket-Kit: 1` 和同源 JSON。路径限制在功能内部。Agent 工具 `pocket_beijing_pass` 先 help 发现接口，与 UI 共用 FeatureService；权限授予、凭据和真实终端命令只在 UI。

采用主题色、卡片分组、44px 控件、16px 输入、可换行长文、安全区底部留白和局部滚动表格；加载、空列表、错误和手动重试均有入口。移动宽度 320/375/390/430px、软键盘、深浅主题还没有真实浏览器验收，不以 CSS 或注册测试替代。

## 验证与限制（2026-11-07）

Node v26.7.0：`npm run verify` 104 项通过，其中新增隔离临时数据测试覆盖健康版本冲突、文件越界/符号链接/不覆盖上传/Range、凭据不回显/迁移自动任务暂停、终端参数边界、账单规则和 UI/Agent 共用入口。正式数据只做复制与一致性核验，没有对真实业务做写入测试。安装和实时注册结果见[迁移记录](../utilities-migration.md)。
