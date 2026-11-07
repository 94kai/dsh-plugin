# 健康记录（1.3.0）

## 目的、API 与数据

健康时间线、人员切换、记录新增/编辑/删除、关注指标/显示列配置、局部横向对比表和 Excel 导出。不提供医疗诊断。功能内 API 保留旧 `/people`、`/people/:id`、`/people/:id/config`、`/people/:id/records[/recordId]` 和 `/people/:id/export?scope=all|visible`。写入使用完整 cells，修改/删除使用 revision；过期修改返回409，不覆盖他人更新。

数据为 `.local/data/health/health.sqlite`，包含人员、记录、导入指纹和原有字段迁移备份。SQLite online backup 生成一致性快照，而非直接复制活动数据库；校验了1位人员、25条记录、1个导入指纹及 integrity_check=ok。原始记录与显示偏好均保留。客户端只在打开页面时读取，未写浏览器存储。Excel 导出由本机生成。删除不可恢复，UI 要求确认；原项目数据库可作迁移回滚源。

## 生命周期与取舍

Host 卸载关闭数据库；页面卸载取消 fetch。SQLite 事务和 revision 防冲突，原有颈动脉字段迁移标记保留。全部字段编辑表单较长，优先保证原数据不丢字段；真机表单滚动待验收。

## 共同接入与移动端

客户端由 `features/utilities/client.js` 装配 React 页面，不嵌入旧 HTML、不另起服务器。工具箱卡片打开 `pocket-kit.health`；Host 条目为 `pocket-kit-health`。管理请求走已认证的 `POST /api/pocket-kit/health`，JSON envelope 为 `{path,method,body}`，要求 `X-Pocket-Kit: 1` 和同源 JSON。路径限制在功能内部。Agent 工具 `pocket_health` 先 help 发现接口，与 UI 共用 FeatureService；权限授予、凭据和真实终端命令只在 UI。

采用主题色、卡片分组、44px 控件、16px 输入、可换行长文、安全区底部留白和局部滚动表格；加载、空列表、错误和手动重试均有入口。移动宽度 320/375/390/430px、软键盘、深浅主题还没有真实浏览器验收，不以 CSS 或注册测试替代。

## 验证与限制（2026-11-07）

Node v26.7.0：`npm run verify` 104 项通过，其中新增隔离临时数据测试覆盖健康版本冲突、文件越界/符号链接/不覆盖上传/Range、凭据不回显/迁移自动任务暂停、终端参数边界、账单规则和 UI/Agent 共用入口。正式数据只做复制与一致性核验，没有对真实业务做写入测试。安装和实时注册结果见[迁移记录](../utilities-migration.md)。

补充：GET `/status` 仅返回就绪状态和人数/记录数；`/people/:id/records?offset=0&limit=10` 支持1–50条分页，`/people/:id/records/:recordId`读取单条，供Agent缩小私人数据上下文。
