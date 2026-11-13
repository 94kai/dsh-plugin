# 文件管理（1.3.0 引入，1.8.0 移除）

## 移除记录（2026-11-13）

用户确认“文件管理”已无用途，按最小范围删除，未改动其他功能与宿主。

- 代码：`features/file-manager/`（Host、后端、view、测试、图标、locale）移出仓库，暂存于忽略目录 `.local/removed/file-manager/`，需要可原样恢复。
- 构建与接入：`features/utilities/client.js` 去掉视图内联、工具卡片与 `file-manager` 语言项；`scripts/build.mjs` 不再内联该视图；`features/home/client.js` 去掉卡片配色；`features/shared/chrome.js` 去掉 `pocket-kit.file-manager` 面板键（旧 localStorage 值回退到工具箱首页）；`features/utilities/messages.json` 删除该页专用文案。
- Host：根 `package.json` 移除 `./file-manager` 导出与打包条目，描述去掉“文件”；`cordis.patch.yml` 删除 `pocket-kit-file-manager`，Host 条目由十个降为九个。Agent 工具 `pocket_file_manager` 随之不再注册。
- 数据：`.local/data/file-manager/`（config、favorites、shares）与所有被管理的实际文件均未删除，只是不再有入口读取。原匿名分享服务不受影响。

## 验证

Node v26.7.0：`npm run verify` 通过（build、check、209 项测试）；`dist/client.js` 已无 `file-manager` / `pk-files-page` / `pocket_file_manager` 残留；bundle 测试更新为 24 个注册、10 个 `- id:`。未做浏览器/实页验收。

## 历史说明（已被移除的实现）

原功能提供 `/config`、`/entries`、`/text`、`/favorites`、`/shares`、`/directory`、`/entry` 接口，下载 `GET /api/pocket-kit/file-manager/download`，上传 `POST /api/pocket-kit/file-manager/upload`（1 GiB 上限、不覆盖同名文件）；凭据与目录授权只走 UI，分享记录保留但 DSH 下载仍需登录。这些接口随本次移除不再可用。

## 部署（2026-11-13）

根包在 `~/.dsh/profiles/web` 中为 `link:` 安装，Host 条目直接来自仓库 `cordis.patch.yml`；`dsh plugin`/重装不需要，按用户指示 `pm2 restart dsh`（pid 1390599，重启次数 2）后生效。离线 `dsh --profile web --dump-config` 确认组合配置含 9 个 pocket-kit 条目且无 `pocket-kit-file-manager`；三条 profile 层 warning（`dsh-context`、`pocket-kit-terminal`、`better-workspace-file-manager` not found）为既有问题，与本次移除无关。`dist/client.js` 无 `file-manager` 残留。

限制：DSH 鉴权下未登录只能得到 401，本次未登录，因此没有实页确认卡片消失和路由已注销；用户刷新原 GUI 后仍需目视确认首页只剩其他工具卡片。
