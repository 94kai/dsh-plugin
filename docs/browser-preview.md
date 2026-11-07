# 实页预览与截图

## 新会话从哪里开始

本项目当前采用 **Playwright 脚本，不依赖专用 skill**。项目根 `AGENTS.md` 已索引本页，新会话在此工作目录开发时应先读取规则，再按需读本页。项目说明会持久保存；旧聊天中的登录 token 不会自动成为新会话上下文，但首次授权后保存的浏览器登录状态会留在私有工具目录，后续可直接复用。

预览地址：**<https://dsh.xuekai.top:8888/>**。以最新 runtime context 为准，不另起服务器替代当前GUI。前端仅中文；截图浏览器固定 `zh-CN`。

## 现有环境（2026-11-07已验证）

持久工具根目录：**`~/tools/pocket-kit-preview/`**（2026-11-07从 `/tmp` 和 `~/.cache` 迁入）。`/tmp` 在开机时由 tmpfiles 清空；`~/.cache` 按约定可被随时清理，都不适合放需要长期复用的浏览器。`~/tools` 已存有 jdk/gradle，适合同类持久工具。

| 内容 | 路径 | 大小 |
| --- | --- | --- |
| 实际浏览器二进制 | `~/tools/pocket-kit-preview/browser/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell` | 283M |
| Playwright 1.65.0、React、esbuild | `~/tools/pocket-kit-preview/browser-tools/node_modules` | 39M |
| happy-dom、React、react-dom | `~/tools/pocket-kit-preview/dom-tools/node_modules` | 32M |
| 持久登录状态（非仓库） | `~/tools/pocket-kit-preview/state/storage.json` | 目录 700、文件 600 |

- 实际二进制即 `chromium.launch({headless:true})` 启动的 headless shell，Chromium **158.0.8127.18**，迁移后已验证可启动。
- `scripts/preview-ui.mjs` 默认从这个持久目录加载 Playwright，并在未显式设置时自动把 `PLAYWRIGHT_BROWSERS_PATH` 指向 `browser/`；`browser-check.mjs` / `dom-check.mjs` 同样优先使用持久目录，找不到才回退旧 `/tmp` 路径。`POCKET_PREVIEW_ROOT`、`POCKET_BROWSER_TOOLS`、`FILE_TEST_TOOLS`、`FILE_DOM_TOOLS` 可覆盖。
- `chromium.executablePath()` 仍会返回 `~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`（完整Chrome，**不存在**），不能据此判断浏览器缺失，也不要改用该路径启动；只安装了headless shell，因此不能使用 `headless:false` 或有头截图。
- 浏览器构建号 1254 与 Playwright 1.65.0 配套；换版本需先确认构建匹配，不要混用。原CDN下载多次中断，后来由用户提供完整ZIP解压安装，ZIP已删除。若工具目录丢失，先说明缺失情况再按上述版本补齐；使用独立工具目录，不改宿主安装、不因截图重装整个profile。

## 用法

可复用入口：`scripts/preview-ui.mjs`。默认只打开工具箱首页、文件页并截图；`--music` 额外以只读方式打开音乐页，断言没有小爱切换入口。不上传、创建、删除、播放或操作其他业务；登录状态保存在私有工具目录，只截工具箱内容区域，避免带入无关会话。

```bash
node scripts/preview-ui.mjs --help

# 首次使用或执行 --reset-login 后：token 只经环境变量传入。
read -rsp '临时预览 token: ' POCKET_PREVIEW_TOKEN; echo
export POCKET_PREVIEW_TOKEN
node scripts/preview-ui.mjs --music   # 登录成功后会保存私有登录状态
unset POCKET_PREVIEW_TOKEN

# 之后无需 token，直接复用已保存状态。
node scripts/preview-ui.mjs
node scripts/preview-ui.mjs --all --music

# 退出/换账号/状态失效：删除状态，下次重新需要 token。
node scripts/preview-ui.mjs --reset-login
```

**登录状态持久化**：默认写入 `~/tools/pocket-kit-preview/state/storage.json`，目录权限 700、文件权限 600；可用 `POCKET_PREVIEW_STATE` 指定其他私有路径。脚本保存的是 `context.storageState()`（cookies 与 localStorage），不是原始 token。该文件等同凭据：不要复制进项目、发布包或截图，不要提交 Git；需要退出时用 `--reset-login` 删除。token 本身仍不得写入源码、文档、Git、发布包或截图文件名。

Agent的每次bash调用是独立shell，不能假定前一次 `export` 会延续。只有用户已明确授权登录时，才在本次调用的进程环境中临时传入凭据；不打印凭据，不读取宿主配置或其他会话来找token。已有状态文件时通常无需 token；遇到401或状态失效，向用户说明并索取一次授权，使用 `--reset-login` 重新登录，不绕过鉴权。可使用 `POCKET_BROWSER_TOOLS=/其他工具目录` 指向包含 `node_modules/playwright` 的目录。

脚本为每次运行创建系统临时目录 `pocket-kit-preview-*`，结束时打印路径；截图写入系统临时目录，登录状态只写入私有工具目录，不写入项目。截图可能包含用户文件名、网站及其他私人信息，不提交Git、不放发布包。

## 验收边界

- 手机使用独立浏览器context：移动UA、`isMobile`、触屏、设备像素比及手机视口，不是把桌面窗口缩窄；默认iPhone13模拟，完整检查320/375/390/430px，另查暗色与桌面。
- 侧栏/浮层遮挡时脚本报错，先关闭遮挡再验收；不可把有遮挡、未登录或未加载完成的截图说成正常页面效果。
- 修改客户端后先根构建，再按插件管理器重新加载 **客户端载体 `include:pocket-kit`**，刷新原GUI截图。不要重启不相关业务Host。没有同checkout的 `pnpm run dev:web` watcher时，不承诺自动热更新。
- `--music` 会从首页进入音乐页并断言没有「小爱音箱」切换按钮，同时检查「返回会话 / 返回首页」按钮；该页挂载时只读取状态与下载列表，不触发搜索、下载、播放、移动或删除。出现 `role="alert"` 时脚本直接失败，不读取或打印私人错误内容。
- 生成截图后调用 `read_image` 实际查看；需要给用户看时可用 `present`。若模型不支持图片输入，明确说明，不以DOM检查冒充看图。
- 浏览器模拟不证明真实Safari、软键盘、安全区、系统大字体或真实设备交互已验收。正式数据只做浏览，写入、删除与其他真实业务另需用户明确授权；交互回归优先使用隔离fixture。

初次整理时已用此脚本的390px移动模式在原GUI完成首页与文件页截图、无溢出/无pageerror检查；完整宽度及明暗实页结果见首页与文件功能文档。没有为本项目新增独立skill；将来若多个项目复用，再把通用浏览器操作提炼为skill，本页保留项目地址与约束即可。

## 2026-11-07 持久登录与音乐页核验

- `preview-ui.mjs` 新增登录状态持久化：首次带 `POCKET_PREVIEW_TOKEN` 登录后保存 `storage.json`（目录 700、文件 600），后续运行不再需要 token；新增 `--reset-login` 和 `--music`。
- 首次授权登录成功，随后**不带 token** 执行 `--all --music`：桌面与 320/375/390/430px、暗色共 6 组均无横向溢出和 pageerror；音乐页均无「小爱音箱」按钮。
- 暗色下选中 tab 文字对比不足（白底白字）一并修复，改用 `--dsw-alias-bg-base` 作为品牌色背景上的文字色；已重新截图确认。
- 截图位于系统临时目录（`/tmp/pocket-kit-preview-*`），未提交；未做真实设备、软键盘或业务写入验收。持久状态文件未进入项目。
- 同一次持久登录会话还实页验证了：音乐试听（`readyState=4`、267 秒、无 media error）、完整 FLAC 下载到本机（28,988,615 字节、无 download failure）、音乐信息弹窗的关闭按钮/背景/Escape 三种关闭方式，以及各页面「返回会话 / 返回首页」和上次页面记忆；未把含私人文件名的截图放入仓库或发布包。

## 迁移或恢复

迁移只需保持目录层级（`browser/chromium_headless_shell-1254/...` 与各工具目录的 `node_modules/`），脚本会自动发现；换机器时把整个 `~/tools/pocket-kit-preview/` 复制过去即可，不建议重新走CDN下载。迁移后先验证：

```bash
node --check scripts/preview-ui.mjs
POCKET_PREVIEW_TOKEN=... node scripts/preview-ui.mjs   # 首次登录并保存私有状态
node scripts/preview-ui.mjs --all --music              # 之后无需 token
```

持久登录状态在 `~/tools/pocket-kit-preview/state/`，不属于依赖目录；迁移时可一并复制，但必须保持 700/600 权限并确认接收方可信。若只复制浏览器和工具依赖，首次运行仍需 token。仅当目录确实缺失或版本不匹配时才补齐依赖；补齐后同样用上述命令验证，不以“安装成功”代替真实启动。
