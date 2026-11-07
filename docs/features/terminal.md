# 终端（1.3.0）

## 目的、API 与数据

接续原 `allinone-` 前缀tmux会话，创建/结束会话、文本输入与常用控制键。保留 `.local/data/terminal.json` 中 enabled、cwd、maxSessions；现有会话由原tmux服务器持有，不迁移或销毁进程。

功能内 `/status`、`/sessions`（POST创建/DELETE确认结束）、`/screen?name=`、`/input`、`/key`。通过已认证Connection HTTP传输，不另起WebSocket端口、不依赖node-pty编译。会话名限制1–32位安全字符，tmux使用execFile参数和精确会话匹配；单条输入8KiB，屏幕最多300行，子命令3秒超时。

## 重要决策与生命周期

轻量终端每1.5秒串行刷新文本快照，页面隐藏/关闭时停止订阅；暂停刷新与断开查看不结束会话。支持Enter、Ctrl-C/D、Tab、Esc、方向键。不是xterm逐字符终端，ANSI颜色、鼠标协议和全屏程序体验有差异。用户需要完整交互时仍可用原终端或SSH。

Agent仅状态/屏幕读取；创建、按键、命令、结束会话仅UI，避免绕过DSH命令审批。Host卸载仅中止自己的短期tmux子进程，绝不kill用户会话。测试mock tmux，没有向真实会话发送命令。

## 共同接入与移动端

客户端由 `features/utilities/client.js` 装配 React 页面，不嵌入旧 HTML、不另起服务器。工具箱卡片打开 `pocket-kit.terminal`；Host 条目为 `pocket-kit-terminal`。管理请求走已认证的 `POST /api/pocket-kit/terminal`，JSON envelope 为 `{path,method,body}`，要求 `X-Pocket-Kit: 1` 和同源 JSON。路径限制在功能内部。Agent 工具 `pocket_terminal` 先 help 发现接口，与 UI 共用 FeatureService；权限授予、凭据和真实终端命令只在 UI。

采用主题色、卡片分组、44px 控件、16px 输入、可换行长文、安全区底部留白和局部滚动表格；加载、空列表、错误和手动重试均有入口。移动宽度 320/375/390/430px、软键盘、深浅主题还没有真实浏览器验收，不以 CSS 或注册测试替代。

## 验证与限制（2026-11-07）

Node v26.7.0：`npm run verify` 104 项通过，其中新增隔离临时数据测试覆盖健康版本冲突、文件越界/符号链接/不覆盖上传/Range、凭据不回显/迁移自动任务暂停、终端参数边界、账单规则和 UI/Agent 共用入口。正式数据只做复制与一致性核验，没有对真实业务做写入测试。安装和实时注册结果见[迁移记录](../utilities-migration.md)。
