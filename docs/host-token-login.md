# DSH 独立窗口手动登录：改动说明与升级恢复手册

## 范围与安装边界

2026-11-08 用户明确授权修改本机 DSH 宿主鉴权产物；此功能不属于工具箱插件，未登录时插件尚未加载。只改 `@deepseek-ai/dsh-client-connection` 的 `lib/index.js`，不新增安装包或路由，不自动重启服务。

当前目标：`/home/xuekai/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`。npm/npx 升级、重装或换运行目录后补丁视为丢失，不能跨版本盲目套用；升级后的适配需用户再次明确授权。

## 为什么需要它

安装到桌面的 Web App 每次启动访问不带 token 的固定 URL（这是正常设计）。手机实测该启动导航被浏览器标记为 `cross-site`，且**即使 `SameSite=Lax` 也不带登录 Cookie**，服务端因此返回登录页；但同一页面上发起的同源请求**可以**带上该 Cookie（错误 token 却能进入即为证据）。

所以登录页做了两件事：

1. 打开时先做一次同源探测，若会话有效就直接进入，不要求重输 token（每次冷启动会有短暂登录页过渡）。
2. 会话确实无效时，才显示 token 输入框。

## 行为与安全

- 未授权的 `/`、`/index.html` 在 GET/HEAD 且接受 HTML 时返回中文登录页，保持 401；HEAD 无响应体；API 与 `/connect` 仍返回原有拒绝响应。
- 输入纯 token 或完整 HTTP(S) 链接；完整链接只提取 token，导航目标始终是同源干净首页。
- **只有服务端确认 token 匹配才报告成功**：匹配时 303 到 `./?dsh-token-auth=verified`，登录页核对 `response.url`；错误 token 但已有有效会话时提示“本次 token 未通过验证；当前浏览器已有有效登录状态”，1.2 秒后进入，不谎称 token 正确；错误 token 且无会话仍是 401 提示。该标记只用于展示判断，不参与鉴权。
- token 不写入页面 URL、浏览器持久存储或页面 HTML；不调用 localStorage/sessionStorage；失败可重试，20 秒超时取消。
- 无第三方资源；CSP 使用脚本哈希和同源 `connect-src`，禁止嵌套、表单默认提交与 base 改写；响应 no-store、no-referrer、nosniff。
- Cookie 保持 HttpOnly、`SameSite=Strict` 与原有 TLS Secure 判定；未放宽鉴权。
- 已知边界：token 仍通过 GET 查询串提交，与原有登录链接一致，反向代理日志可能记录，需自行脱敏；未修改代理配置。

## 补丁、验证与回滚

[补丁](host-token-login.patch)以原始 Strict 文件为基线，只新增 `browserLoginPage()`、在 `writeUnauthorized()` 中为首页 HTML 请求返回登录页，并把 token 正确时的 303 目标改为 `./?dsh-token-auth=verified`。已用 `--fuzz=0` 试打并从原始文件逐字节复现当前部署文件。

```bash
node scripts/host-login-script-check.mjs /实际安装路径/.../dsh-client-connection/lib/index.js
```

该[非浏览器回归](../scripts/host-login-script-check.mjs)使用模拟 DOM 与 stub fetch，覆盖自动进入、401 回退、空输入、错误 token 加有效会话、正确 token、粘贴链接、标记伪造、断网、导航不含 token、不使用 Web Storage，以及服务端 303/Cookie/HEAD/API 隔离断言。它不访问网络、不读取真实凭据。语法检查、模块动态导入已通过；本次精简改动**未做浏览器 UI 验证**，也未重启线上服务，需用户重启后确认冷启动行为。

回滚：原始 Strict 文件备份为目标旁的 `index.js.before-samesite-lax`；本次精简前（含临时诊断与 Lax 试验）的版本为 `index.js.before-auth-cleanup`。确认路径属于同一次安装后复制回目标文件并用原方式重启。不要用旧备份覆盖未来新版。

## 历史：错误 token 被当成成功（已修复）

早期版本只判断 `response.ok`。错误 token 被服务端忽略时，若浏览器已有有效 Cookie，`/?token=wrong` 仍 303 到首页返回 200，页面便误报成功。现以 `dsh-token-auth=verified` 标记区分，并补充了上面的回归用例。

## 升级后失效，如何重做

### 1. 先判断是否仍需要补丁

- 安装版打开首页；若新版已自带可用登录入口，直接用官方功能，不打补丁。
- 若又出现纯文本未授权提示，再按下面步骤检查。
- Lax 试验已被手机实测否定：跨站启动仍是 `no_cookie_header`，不要再靠放宽 SameSite 解决。
- 本文档不是永久授权；重做前仍须说明风险并取得当次同意。

### 2. 确认新版实际运行路径

以最新 runtime context 的 **DeepSeek Harness implementation checkout** 和实际服务进程为准，不要沿用旧 npx 目录，也不要只凭 `which dsh` 或缓存目录判断。

读取新版：

- `node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`：`BrowserAuth`、`authorizeIndex`、`writeUnauthorized`、`sessionCookie`。
- `node_modules/@deepseek-ai/dsh-host-frontend-static/lib/index.js`：确认首页仍经该鉴权、静态入口与方法限制未变。

若接口或结构已改变，停止套旧补丁，按新代码最小适配，并更新补丁与测试。

### 3. 备份新版并试打补丁

以下为人工模板，逐步核对，失败即停。`PKG` 必须是新版实际运行的包目录。

```bash
PROJECT='/home/xuekai/project/dsh-plugin'
PKG='/已确认的新安装目录/node_modules/@deepseek-ai/dsh-client-connection'
TARGET="${PKG:?}/lib/index.js"
PATCH="${PROJECT:?}/docs/host-token-login.patch"

realpath -- "$TARGET"   # 人工确认后再继续
BACKUP="${TARGET}.before-token-login-$(date +%Y%m%d-%H%M%S)"
test ! -e "$BACKUP" && cp -p -- "$TARGET" "$BACKUP"

patch --dry-run --batch --forward --fuzz=0 -d "$PKG" -p1 < "$PATCH"
patch --batch --forward --fuzz=0 -d "$PKG" -p1 < "$PATCH"
```

dry-run 失败、提示 reversed/already applied 或需要模糊匹配时停止。不得 `--force`、提高 fuzz 或用旧版整文件覆盖新版；部分应用失败时先从本次备份恢复，不叠加实验改动。

### 4. 重启前验证

```bash
node --check "$TARGET"
node --input-type=module -e 'import { pathToFileURL } from "node:url"; await import(pathToFileURL(process.argv[1]).href); console.log("模块加载通过");' "$TARGET"
node "$PROJECT/scripts/host-login-script-check.mjs" "$TARGET"
diff -u -- "$BACKUP" "$TARGET"
```

前三项须成功；`diff` 有预期改动时退出码为 1 属正常。人工确认只涉及登录页及未授权响应分支和 token 成功标记，未放宽鉴权或更改 Cookie 密钥。

### 5. 重启并按真机验收

- 与用户约好窗口，按现有部署方式重启 DSH，不另起服务器替代当前 GUI。
- 原地址（`https://dsh.xuekai.top:8888/`，以后以最新 runtime context 为准）验证：无会话显示中文登录页且错误 token 被拒；有会话直接进入。
- 手机桌面安装版：登录一次 → 关闭 → 重开，确认自动进入而非要求输入 token；再确认冷启动只是短暂过渡。
- 不把真实 token 写进文档、命令历史、Git、截图文件名或测试源码。
- 成功后更新本文：新版路径/版本、备份路径、补丁与实际测试结果，不能沿用旧版结论。

### 6. 回滚

确认 `TARGET` 与 `BACKUP` 属于同一新版后再执行：

```bash
realpath -- "$TARGET" "$BACKUP"
cp -p -- "${BACKUP:?}" "${TARGET:?}"
node --check "$TARGET"
```

然后用原方式重启同一个 DSH，确认恢复升级后的原始行为。**不要用旧 npx 目录的备份覆盖新版**；回滚不会清除已有 Cookie。
