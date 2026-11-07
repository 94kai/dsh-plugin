# 随身工具箱 · Pocket Kit

一个只为自己使用、手机优先的 DSH 个人工具包：`@local/pocket-kit`。
统一安装和构建，按功能维护代码，不把不同业务塞进一个大文件。

## 工具箱导航

从左侧栏底部「工具箱」进入，集中展示全部个人工具和现有快捷链接。旧工具箱弹出菜单及会话上方的个人工具入口已移除；工具页面保留，各页可返回工具箱。详情见[工具箱文档](docs/features/home.md)。

## 现有功能

- **文件**：目录、收藏、上传下载、文本/图片/音视频/PDF预览，保留分享记录（下载仍需登录）。
- **进京证**：状态查询、手动办理、监控和提醒；迁移后自动办理先暂停。
- **健康**：健康时间线、人员/指标配置、记录编辑、对比和Excel导出。
- **原生终端增强**：左侧“更多”上方使用标准条目打开当前会话的DSH原生终端；Esc、36px高单方向按钮、Ctrl+C及软键盘避让。属于当前插件，不再单独安装；内置兼容桥的升级限制见[终端按键文档](docs/features/terminal-touch-keys.md)。
- **工具箱轻量终端**：保留原tmux会话入口与文本快照，暂未移除；与原生终端增强不是同一页面。
- **记账单**：微信/支付宝/招商银行账单导入、分类过滤和统一Excel导出。

- **快捷访问**：工具箱快捷链接与详情/备注。
- **连接测速**：工具箱 → 连接测速；测量当前浏览器与 DSH 服务端之间的连接。
- **出门清单**：从工具箱进入，在主面板管理可重复使用的物品清单。

- **音乐 tab**：跨来源搜索、网易云登录、下载队列、试听、移动/改名/删除、标签/歌词/封面编辑。
- **小爱音箱 tab**：统一“小爱播放”和“音响控制”，包含歌单/收藏、自动播放规则、播报、音量和快捷指令。

一个客户端载体、十个 Host 条目。音乐和小爱从工具箱进入，也可在页面顶部互相切换。后端条目可以单独启停，但不提供进程级隔离；关闭某后端不会自动隐藏相应界面。

**小爱迁移后默认暂停**，不会自动接管旧音箱服务或执行定时播放。启用前必须停用旧服务的对应 worker、确认 LAN 隔离与端口，并由用户设置本地兼容许可，详见[小爱音箱文档](docs/features/xiaoai.md)。

## 开发

需要支持内置 `node:test`、Fetch 和 ESM 的现代 Node.js（本环境验证版本见迁移记录）。无第三方构建依赖、无需安装脚本；运行时 `qrcode` 用于网易云二维码，`xlsx`/`pdfjs-dist` 用于健康与账单；健康需要支持node:sqlite的Node版本（至少22.13），终端需要tmux。全新检出先执行 `npm ci --ignore-scripts`。音乐标签依赖系统 FFmpeg/ffprobe，小爱依赖 Python 3.10+；不会自动安装系统工具或启动设备服务。

```sh
npm run build   # 明确列出的功能源代码 → dist/client.js
npm run check   # 语法和导出资源检查
npm test        # 功能测试与合并注册测试；首次先 build
npm run verify # 完整执行以上步骤
```

只安装仓库根目录，不再分别安装功能子目录。通过 DSH `plugin_manager install_bundle` 安装；不要手写 profile 配置。已有三个旧包的迁移与回滚见 [迁移记录](docs/migration.md)。首次本地安装前必须先构建。

更新客户端后先运行构建，再按安装结果重新加载并刷新原 GUI；Host 更新若要求重启，应重启既有 DSH 服务。没有验证同一 checkout 的开发 watcher 时，不承诺热更新，也不启动替代服务器。

## 私人配置

私人书签放在 `.local/bookmarks.json`，该目录被 Git 忽略且不进入发布文件清单。全新配置可从 [示例](features/shortcuts/bookmarks.example.json) 复制；已有文件不要覆盖。缺少书签文件时显示空列表。

Key、token 等未来私密配置也放在忽略的本地文件中并仅由 Host 读取，或使用 DSH 的 credentials service。**书签备注会发给已登录浏览器，不是密钥保险箱。** 清单沿用原服务端数据位置，不因合包自动搬迁或重置。

音乐和小爱数据位于 `.local/data/{music-download,xiaoai-music,xiaoai-assistant}/`，私密集成配置在 `.local/integrations.json`。现有下载文件与加密登录状态已迁移；外部 NAS 曲库保留目录引用，不重复复制整座曲库。一次性迁移脚本会拒绝覆盖已有目标，不要再次盲目执行。详情见[音乐与小爱迁移记录](docs/music-xiaoai-migration.md)。

## 文档

- [AGENTS 开发索引](AGENTS.md)：后续 Agent 的最小入口。
- [架构](docs/architecture.md) · [新增功能流程](docs/development.md)
- [安全与隐私](docs/security-privacy.md) · [手机适配规范](docs/mobile.md)
- [快捷访问](docs/features/shortcuts.md) · [测速](docs/features/network-speed.md) · [出门清单](docs/features/outing-checklist.md)
- [功能文档模板](docs/features/_template.md)：新增功能时记录数据、API、重要决策、生命周期和实际验证结果。

本次为保留既有行为的结构合并和移动端基础改进，不代表所有历史 UI 已完成视觉验收；实际验证范围和限制见迁移记录。

五个新模块的数据保护、验证和已知差异见[五模块迁移记录](docs/utilities-migration.md)。

1.5.1为终端入口恢复版本：隐藏专用会话方案已撤回，普通终端仍依赖当前会话。启动故障和回滚验证见[终端按键记录](docs/features/terminal-touch-keys.md)。
