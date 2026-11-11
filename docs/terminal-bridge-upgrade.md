# 原生终端辅助按键：宿主补丁与升级适配手册

## 先看结论与边界

这是 `@local/pocket-kit` 的本机兼容桥，**不是 DSH 正式扩展 API**。用户于 2026-11-08 明确同意在现有桥上增加 Tab 与 Vim `:q`，同时要求保留升级适配文档。升级可能覆盖宿主补丁；不自动重打、不保证新版兼容。后续涉及新的宿主适配仍先说明范围、风险与回滚，取得明确授权。

- 插件源码：[按键栏](../features/terminal-touch-keys/client.js)。根包统一构建，不另建插件。
- 宿主补丁脚本：[bridge.mjs](../features/terminal-touch-keys/bridge.mjs)。只处理原生终端包的 `lib/client.js` 与 `lib/client.terminal.js`；已有旧桥时扩展按键映射，并在入口添加绑定终端分块SHA256的注释标记以更新缓存版本。首次部署漏更新入口导致用户反馈Tab无反应，后续已补此步骤。
- 现有桥提供 `local.terminal.touch.keys`（list/session），props 为 `enabled`、`sendKey(key):boolean`。插件不直接访问 PTY、会话存储或宿主 DOM。
- 固定白名单：left/up/down/right/escape/interrupt/tab/vimQuit。未知键拒绝，不提供任意命令入口。原来的可写、可见、已连接、进程运行检查保留；输入走 `xterm.input(data,true)`。
- `tab` = `\t`；`vimQuit` = `\x1b:q\r`，即 Esc → `:q` → 回车。方向键仍区分 CSI/SS3。
- `:q` 不强退未保存修改，不发送 `:q!`、不保存文件。**按钮不检测前台程序，仅在 Vim 中使用**；在 shell 或其他程序里点按也会发送上述字符，可能导致无效命令或其他行为。多窗口 Vim 的 `:q` 通常只关闭当前窗口，不等于退出全部 Vim。
- 保留 36px 紧凑高度、方向手势及键盘避让，不恢复侧栏独立入口、不自动创建隐藏会话、不运行启动命令。
- **禁止运行已撤回的 dedicated-bridge.mjs，禁止用旧版整文件覆盖新版宿主。** 此桥不依赖那个故障适配，也不需要 sidebar-bridge.mjs。

## 升级后操作顺序

### 1. 确认真正运行的新版路径

以当前会话 runtime context、实际 DSH 启动入口及安装包解析结果为准。npm/npx 升级可能换目录，桌面版又是另一条路径；不要从历史路径猜，不要修改所有搜索命中的副本。

2026-11-08 本次确认的包目录（**仅作记录，升级后不要直接照抄**）：

```text
/home/xuekai/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-client-ui-sidebar-terminal
```

确认目标 `package.json` 的 name 为 `@deepseek-ai/dsh-client-ui-sidebar-terminal`，记录版本；本次为 `0.2.2-rc.1`。检查新版两个产物：原有的 TerminalBody/TerminalScreen、renderSlot 传递、当前状态 ref、xterm.input 和按键生命周期是否仍匹配。优先查询上游是否已有正式扩展接口，有则考虑迁移，不继续堆补丁。

### 2. 只检查，不写入

在项目根目录执行，先把示例路径换成**已确认正在运行的新版包目录**：

```bash
TERMINAL_PACKAGE='/已确认的新版路径/node_modules/@deepseek-ai/dsh-client-ui-sidebar-terminal'
node features/terminal-touch-keys/bridge.mjs "${TERMINAL_PACKAGE:?}" --check
```

默认不带模式也是 `--check`：只读取、匹配和语法校验，不创建备份、不写目标文件。

- `already current` / `0 file(s)`：补丁已在磁盘，不重复写；仍需实页验证浏览器加载的是它。
- `compatible, change planned`：精确上下文匹配，打印将修改的绝对目标路径；**不是已应用，也不是实页验收**。
- `Unsupported…`、`Unknown…`、语法错误：停止。不删检查、不强行替换、不盲套旧补丁。

脚本支持三种状态：未加桥的匹配产物、当前六键旧桥、当前八键桥；不靠版本号盲目放行。未来改版若不匹配，重新读新版上下文，保持输入白名单、权限校验、生命周期和 Slot 所有权；在隔离 fixture 验证完整启动后再考虑应用。

### 3. 测试、应用与备份

```bash
node --test features/terminal-touch-keys/keys.test.js features/terminal-touch-keys/bridge.test.js features/terminal-touch-keys/viewport.test.js features/terminal-touch-keys/navigation.test.js
npm run build
npm run check
node features/terminal-touch-keys/bridge.mjs "${TERMINAL_PACKAGE:?}" --apply
```

只有 `--apply` 写入。脚本先规划所有目标并通过 Node 语法检查，再把**本次修改前**的原文按 SHA256 保存到项目 `.local/terminal-touch-bridge/`，并写出 `manifest-时间戳.json`：记录真实安装路径、包版本、文件名、前后 SHA256。备份为 600，目录创建为 700；不进入 Git 或发布包。先记下控制台打印的 manifest 绝对路径，再继续。

重复应用已是新版的桥不会创建新备份或重复替换。保留原来历史 `.original` 备份，不混用、不覆盖。

若未来第一次向全新安装加桥，将涉及两个产物；两者虽都提前校验并备份，但不是跨文件事务。若磁盘写入中途失败，停止后检查每个文件的前后 hash，再按 manifest 逐个恢复已修改项；不要因批量回滚 hash 拒绝而强制覆盖。旧桥升级八键现在会同时更新分块与入口缓存标记；若分块已更新但入口标记缺失，则只修改入口文件。

### 4. 重新加载与原 GUI 验证

- **宿主桥有变时不能只重载工具箱。** 当前DSH会缓存分块响应，分块URL使用入口bundle的rev；只改 `client.terminal.js` 可能仍命中旧缓存。脚本会给 `client.js` 添加 `pocket-kit-terminal-touch-keys-chunk-sha256` 注释，绑定分块内容使入口版本变化；重复执行不重复添加。应用后用插件管理器先禁用再启用当前清单中的原生终端客户端（本次为 `include:ui-sidebar-terminal`），再刷新原GUI。这会暂时卸载终端面板；不禁用 terminal-controller，不主动结束PTY。
- 插件按钮有变时：根构建后，通过插件管理器先禁用再启用 **`include:pocket-kit` 客户端载体**。不卸载整包、不重装 profile、不重启音乐/健康等 Host。

### 5. 回滚（只回到本次修改前）

使用本次控制台记录的 manifest，目标必须仍是**同一安装路径、同一包版本**，且当前内容仍匹配补丁后的 SHA256：

```bash
node features/terminal-touch-keys/bridge.mjs "${TERMINAL_PACKAGE:?}" --rollback '/本机备份目录/manifest-本次时间戳.json'
```

脚本先验证全部目标、备份 hash 和语法，通过后才恢复。路径/版本/hash 不符就拒绝，必须调查原因，不能关闭保护继续写。已升级宿主时**不要使用旧 manifest 回滚新版**。

最初映射修改的manifest回滚只恢复六键旧桥，不移除原有桥。后续缓存修复manifest只恢复入口版本标记前的文件，不回滚八键映射；恢复后仍需重载原生终端客户端并刷新，且可能重新遇到旧缓存问题。需要完整撤销时，依次使用缓存修复和最初映射修改各自的manifest，不混用。若同时要回滚按钮，移除插件新增 Tab/`:q` 两个按钮、重新构建并重载客户端；不要把新版按钮仍显示却不生效当作完整恢复。若新版本第一次加桥，则备份是该版本未加桥的产物，回滚会移除那次新增的桥。

## 2026-11-08 实施记录

- 用户明确授权增加两个按键及宿主最小映射，并要求编写本手册。未修改隐藏会话、专用渲染器、其他内置插件或会话数据。
- 当前包 `0.2.2-rc.1`：已有六键桥，只更新 `client.terminal.js` 的映射行；`client.js` 无变化。
- 本机回滚 manifest：`.local/terminal-touch-bridge/manifest-1794097465530.json`。补丁后 SHA256：`d99f197f10377085d1888c1f76bd15eabfdf1768728057e94c2d6f7cf1c729fa`。
- 25 项针对性测试通过；构建及资源/语法检查通过。测试涵盖固定编码、断连/不可写/进程结束/无 xterm 拒绝、任意输入拒绝、只检查不写入、重复应用、未知上下文拒绝、语法错误拒绝和 hash 回滚保护。
- 客户端载体禁用/启用均返回 applied、warnings=[]，没有重装业务 Host。
- 原 GUI 已完整启动，实际打开原生终端；桌面、320/375/390/430px浅色及320/390px暗色共7组按键栏检查通过（五按钮可见、无溢出、无遮挡、无pageerror），并实际看图。暗色375/430px的独立复测没有取得可见按键栏，既无入口错误提示也无pageerror，原因未定位，不宣称这两组实页通过；没有为补齐截图扩大修改宿主或会话机制。最初重载后一次桌面预览也超时，重试后桌面通过。
- 当时的终端浏览器检查脚本（现已移除）：四种手机宽度明暗主题共8组隔离浏览器通过，Tab/`:q`触屏点击只捕获sendKey键名，验证禁用状态和单行无溢出。截图已查看；不是原GUI、真实Vim或软键盘验收。真实终端未发送测试字符。
- 全量 `npm test`：154/155通过；唯一失败为未改动的 `features/home/client.test.js:22` 仍断言注册数2，而现有首页已含标题入口、实际注册3。本次不改首页或放宽该测试，不能宣称全量测试通过。
- 当前功能已应用；仍需用户刷新后在安全的Vim会话确认实际退出、Tab补全及真机软键盘体验。实页未通过项与上述既有测试失败均保留记录。

### Tab无反应后的缓存修复

用户反馈Tab按钮无反应，并明确批准宿主缓存修复。检查发现磁盘映射正确，但当前DSH的分块响应缓存和immutable URL依赖入口rev；首次部署只改分块、仅重载工具箱，未推进终端入口版本。此机制是明确的部署缺口，是否完全解释用户现象仍待用户复测确认。

- 桥脚本新增绑定分块SHA256的入口注释；本次仅修改 `client.js`，未改终端输入逻辑或资源缓存服务本身。
- 回滚manifest：`.local/terminal-touch-bridge/manifest-1794098688616.json`；入口补丁后SHA256：`f93953278e0910fc1babeb487083aa6466cda2871434ee1755bac0ad98bc7891`。
- 17项桥/按键针对测试通过，包括分块已更新但入口未变的回归、只检查不写入、标记幂等及回滚保护；应用后检查为0个待改文件。
- `include:ui-sidebar-terminal` 禁用/启用均返回applied、warnings=[]。未重启DSH、未禁用终端controller、未发送真实终端字符。
- 遵循最新AGENTS，缓存修复后未运行浏览器验证；不把applied当作实际Tab已恢复。
- 最终用户明确反馈“那个按键我测试没问题了”，按键功能通过用户实际验收。此前记录的自动化布局覆盖限制仍保留，不扩展为所有设备/软键盘均已验收。
- 升级后仅在用户主动要求时重新适配；终端按键与token登录分别授权，不因升级或失效自动重打补丁。
