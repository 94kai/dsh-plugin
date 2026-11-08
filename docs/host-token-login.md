# DSH 独立窗口手动登录：改动说明与升级恢复手册

## 范围与安装边界

2026-11-08 用户明确授权修改本机 DSH 宿主鉴权产物；此功能不属于工具箱插件。未登录时插件尚未加载，必须由宿主返回登录入口。不新增安装包，不改其他宿主模块，不自动重启服务。

当前目标为 `/home/xuekai/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`。npm/npx 升级、重新安装或更换运行目录后，补丁应视为丢失；不能跨版本盲目套用。

## 行为与安全

- 未授权的首页 `/`、`/index.html` 在 GET/HEAD 请求接受 HTML 时返回中文登录页，保持 401；HEAD 无响应体，API 与 `/connect` 仍返回原有拒绝响应。
- 输入纯 token 或完整 HTTP(S) 登录链接。完整链接只提取 token，不控制提交目标。
- 通过同源 `fetch` 请求原有 `/?token=...` 验证入口，复用已有签名 Cookie 和 303 跳转；成功后替换导航到无 token 首页。
- 不把 token 写入页面 URL、浏览器持久存储或页面 HTML；失败可重试，提供网络/超时提示，20 秒取消。
- 这不是 POST 登录接口：token 仍出现在登录 GET 请求 URL 中，与原有登录链接相同。反向代理/访问日志可能记录查询串，应脱敏；未更改实际代理日志配置，也不能声称 token 不会进入日志。
- 无第三方资源，CSP 使用脚本哈希、同源连接限制，禁止嵌套、表单默认提交和 base 改写；响应 no-store、no-referrer、nosniff。
- 撤销未解决桌面启动问题的 Lax 试验，恢复 HttpOnly、SameSite=Strict；保持原有 TLS Secure 逻辑。

## 补丁、验证与回滚

[补丁](host-token-login.patch)以最初的 Strict 原文件为基线，供审查与后续版本适配，不自动重打补丁。[隔离测试脚本](../scripts/host-token-login-check.mjs)只使用临时生成的虚构凭据，直接测试鉴权片段，并用浏览器拦截虚构域名请求，不启动另一套 DSH 服务、不读取真实凭据。

```bash
node scripts/host-token-login-check.mjs /实际安装路径/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js
```

原始 Strict 文件备份为目标文件旁的 `index.js.before-samesite-lax`；本次改动前的 Lax 文件另存为 `index.js.before-token-login`。恢复原始行为应选择前者，复制回目标后重启同一 DSH 服务。操作前确认运行路径仍是上述目录；不要覆盖升级后的不同版本。

验证：宿主 JavaScript 语法检查通过。隔离鉴权覆盖正确/错误/重复 token、Cookie 签名与篡改、HEAD、API 拒绝隔离、CSP 脚本哈希与 Strict/Secure；Chromium Android UA、触屏、移动模式下，320/375/390/430px 明暗共八组通过，无横向溢出，登录按钮至少44px，覆盖错误 token、断网、完整链接提取、成功导航和无持久化 token。已实际查看320px亮色及390px暗色截图。测试初次成功页漏写 UTF-8 导致中文断言失败，修正测试 fixture 后全量通过，未为此更改宿主行为。

宿主模块动态导入检查通过。补丁完成时未自动重启，原 GUI 当时仍返回 `401 text/plain`。随后用户实测并反馈“完美”，确认本次桌面安装版手动登录可用；此为用户真机反馈，不等于 Agent 已完成所有实页验收。真实软键盘、安全区、长期窗口持久化未逐项验收。

## 升级后失效，如何重做

### 1. 先判断是否仍需要补丁

- 在安装版中打开首页并重新加载。如果新版已经自带可用的登录页，直接使用官方功能，不再打补丁。
- 若又显示原来的纯文本未授权提示，再检查下面的运行路径与代码。
- 不要先改 `SameSite=Lax`：本机已实测它不能解决该问题。此次有效方案是独立窗口内手动登录。
- 这份文档不是永久自动修改宿主的授权。以后由 Agent 操作时，仍需遵守宿主修改前说明风险、取得当次明确同意的规则。

### 2. 确认“新版正在运行”的安装位置

优先查看当前会话最新 runtime context 的 **DeepSeek Harness implementation checkout**，结合实际启动服务/进程确认它就是当前 GUI 使用的安装。不要沿用本文旧的 npx 哈希目录，不要仅凭 `which dsh` 或找到的某个缓存目录就修改。

用文件发现与内容搜索工具定位新版的：

- `node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`：核查 `BrowserAuth`、`authorizeIndex`、`writeUnauthorized`、`sessionCookie`。
- `node_modules/@deepseek-ai/dsh-host-frontend-static/lib/index.js`：确认首页请求仍经上述鉴权，静态入口与方法限制是否变化。

先读取新版实现，确认现有 token 验证、Cookie 签发、首页入口和 API 拒绝语义仍兼容。若模块已拆分、鉴权接口改变或官方已增加其他登录机制，停止套旧补丁，按新代码重新适配。

### 3. 备份新版，再试打补丁

以下是**人工操作模板**，不应整段盲目执行；每一步失败就停止。将路径替换为第2步核实的绝对路径。`PKG` 必须是新版实际运行的 `@deepseek-ai/dsh-client-connection` 包目录。

```bash
PROJECT='/home/xuekai/project/dsh-plugin'
PKG='/已确认的新安装目录/node_modules/@deepseek-ai/dsh-client-connection'
TARGET="${PKG:?}/lib/index.js"
PATCH="${PROJECT:?}/docs/host-token-login.patch"

# 先核对输出，必须是当前服务正在使用的那个文件。
realpath -- "$TARGET"
# 人工确认上述路径后再继续；备份不得覆盖既有文件。
BACKUP="${TARGET}.before-token-login-$(date +%Y%m%d-%H%M%S)"
test ! -e "$BACKUP" && cp -p -- "$TARGET" "$BACKUP"

# 只试打，不落盘；失败、提示 reversed/already applied 或需要模糊匹配时停止。
patch --dry-run --batch --forward --fuzz=0 -d "$PKG" -p1 < "$PATCH"
# 核查 dry-run 全部成功及新版实现兼容后，才实际应用。
patch --batch --forward --fuzz=0 -d "$PKG" -p1 < "$PATCH"
```

保存此次 `BACKUP` 的确切路径，以便回滚。原补丁只新增 `browserLoginPage()` 并在 `writeUnauthorized()` 中为首页 HTML 请求提供登录页，不重写 token/Cookie 鉴权。补丁中没有 `Strict → Lax` 修改。即使 dry-run 成功，也不等于新版的安全语义兼容，仍需阅读差异。

若旧补丁无法干净应用：不要使用 `--force`、提高 fuzz，或用旧版整文件覆盖新版；由开发者在新版对应位置最小适配，并更新补丁和测试。若实际应用部分成功后失败，先从本次新版备份恢复，不叠加实验修改。

### 4. 重启前验证

```bash
node --check "$TARGET"
node --input-type=module -e 'import { pathToFileURL } from "node:url"; await import(pathToFileURL(process.argv[1]).href); console.log("模块加载通过");' "$TARGET"
node "$PROJECT/scripts/host-token-login-check.mjs" "$TARGET"
diff -u -- "$BACKUP" "$TARGET"
```

前三项须成功；`diff` 有预期改动时退出码为1是正常的，其他异常需调查。人工确认只改变登录页及其未授权响应分支，没有绕过鉴权、放宽 API 或更改 Cookie 密钥。

测试脚本依赖 `~/tools/pocket-kit-preview/` 中现有 Playwright 与 Chromium，不下载新浏览器，不使用真实 token。若新版改变了脚本提取代码的边界，应适配测试，不能跳过鉴权断言后宣称通过。浏览器测试覆盖四种手机宽度、明暗主题、失败/断网/成功路径；它仍然不代表线上启动通过。

### 5. 重启原服务，并在原地址验收

- 与用户约好重启窗口，使用当前部署原有的管理方式重启 DSH；不要猜测服务名、杀错进程或另起服务器替代当前 GUI。
- 在原 GUI 地址 `https://dsh.xuekai.top:8888/`（以后以最新 runtime context 为准）验证：未登录显示中文登录页，已有登录仍正常，错误 token 仍被拒绝。
- 从 Android 桌面安装版打开，必要时重新加载；输入**本次启动当前有效的 token 或完整链接**，确认进入 DSH，再关闭重开确认登录状态。
- 不把真实 token 写进文档、命令历史、Git、截图文件名或测试源码。注意现有 GET token 请求仍可能进入代理日志。
- 成功后更新本文：新版安装路径/版本、备份路径、补丁、实际执行的测试和用户真机反馈。不能把旧版验收结论沿用到新版。

### 6. 出问题就回滚

仅在确认 `TARGET` 与 `BACKUP` 是**本次同一新版**对应的绝对路径后执行：

```bash
realpath -- "$TARGET" "$BACKUP"
# 人工确认两者属于本次同一安装，再恢复。
cp -p -- "${BACKUP:?}" "${TARGET:?}"
node --check "$TARGET"
```

随后用原管理方式重启同一个 DSH 服务，确认恢复升级后的原始行为。**不要用本文最初 npx 目录里的旧备份覆盖未来新版。** 回滚会撤销手动登录入口，但不会主动清除已有 Cookie；不要在未授权的情况下删除登录凭据或用户数据。
