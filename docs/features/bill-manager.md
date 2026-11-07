# 记账单（1.3.0）

## 目的、API 与数据

保留微信Excel、支付宝CSV、招商银行PDF解析，分类规则、支付宝付款方式过滤、账单模板和Excel导出。管理API `/status`、`/reload`、`/category-rules`、`/alipay-filter-rules`；原始上传使用 `/api/pocket-kit/bill-manager/upload?role=wechat|alipay|cmb&name=`，二进制最多20MB；下载为 GET `/api/pocket-kit/bill-manager/download`。

`.local/data/bill-manager/` 保存source原始账单、config规则和accounts账户映射。9个原文件共219922字节逐文件hash一致；原源码硬编码的个人账户名称提取到私有accounts.json，分发代码只保留通用默认值。导出不上传第三方，不修改原账单。客户端表格每页50行，过滤影响导出预览。

## 生命周期与取舍

请求串行避免同模块配置/上传相互覆盖；上传临时文件验证来源后才替换“当前”账单。原迁移文件保留。PDF与电子表格解析为本机同步/异步库，20MB限制不等于恶意压缩包完整隔离；只应导入可信官方账单。已保留旧模板逻辑，不新增自动财务判断。未使用真实账单运行写入测试；外部来源格式仍需用户导出后核对。

## 共同接入与移动端

客户端由 `features/utilities/client.js` 装配 React 页面，不嵌入旧 HTML、不另起服务器。工具箱卡片打开 `pocket-kit.bill-manager`；Host 条目为 `pocket-kit-bill-manager`。管理请求走已认证的 `POST /api/pocket-kit/bill-manager`，JSON envelope 为 `{path,method,body}`，要求 `X-Pocket-Kit: 1` 和同源 JSON。路径限制在功能内部。Agent 工具 `pocket_bill_manager` 先 help 发现接口，与 UI 共用 FeatureService；权限授予、凭据和真实终端命令只在 UI。

采用主题色、卡片分组、44px 控件、16px 输入、可换行长文、安全区底部留白和局部滚动表格；加载、空列表、错误和手动重试均有入口。移动宽度 320/375/390/430px、软键盘、深浅主题还没有真实浏览器验收，不以 CSS 或注册测试替代。

## 验证与限制（2026-11-07）

Node v26.7.0：`npm run verify` 104 项通过，其中新增隔离临时数据测试覆盖健康版本冲突、文件越界/符号链接/不覆盖上传/Range、凭据不回显/迁移自动任务暂停、终端参数边界、账单规则和 UI/Agent 共用入口。正式数据只做复制与一致性核验，没有对真实业务做写入测试。安装和实时注册结果见[迁移记录](../utilities-migration.md)。

补充：GET `/summary` 返回来源/规则计数，`/preview?kind=bills|alipay|cmb&offset=0&limit=20` 返回最多50条预览；同来源多文件时按最新mtime优先，避免新导入后仍导出旧迁移账单。
