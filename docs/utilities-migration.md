# 五模块迁移记录（1.3.0）

## 来源与范围

来源为 `/home/xuekai/project/DevStudioProject/allinone`。文件、进京证、健康、终端、记账单迁入同一个 `@local/pocket-kit` 安装包；页面在现有 DSH GUI 的工具箱中，不启动替代服务器。“首页”显示名改为“工具箱”，稳定 panel/Slot ID 保留。

## 数据保护与核验

执行 `node scripts/migrate-utilities.mjs`，目标是本工作区 `.local/data/`。目标目录存在时跳过，不盲目覆盖。源项目、源数据库和原终端会话未修改；不复制真实文件根目录的大量文件，而保留入口路径和原 inode。权限为目录0700/私人文件0600，Git忽略与发布白名单分别检查。

`node scripts/audit-utilities.mjs` 输出仅含计数和校验结论：

- 健康：SQLite在线快照；people=1，records=25，imports=1，逐表内容一致，integrity_check=ok。
- 记账单：9个源文件，219922字节，逐文件hash一致；个人账户映射从旧源码提取至私人accounts.json，未放入发布代码。
- 文件配置/分享：2个原文件，852字节，hash一致；收藏独立核对一致。
- 进京证：凭据配置与固定目的地一致；原config和automation另存migration-backup。新副本自动申请暂停，不自动发送提醒/提交；原服务保持原状，重新启用前用户须确认旧服务不再自动办理。
- 终端：迁移enabled/cwd/maxSessions设置；沿用allinone-前缀，不创建、关闭或发送测试命令至真实tmux会话。

## 实现取舍

1. 新 UI 为手机优先主题卡片：健康时间线/关注指标，账单来源/规则/分页预览，进京证状态/办理分区，文件路径/收藏/传输，终端会话/控制键。不是旧站CSS搬运。
2. 旧匿名分享记录保留，但DSH下载仍需登录；不开放新的匿名服务。旧匿名链接由原服务管理。
3. 终端使用安全参数调用tmux与文本快照，未引入node-pty原生构建；全屏程序、颜色和鼠标交互不等同原xterm终端。
4. 文件上传上限1GiB（原10GiB），文本预览512KiB、列表2000项；账单20MB。二进制单独认证路由，不塞入JSON工具响应。
5. Agent工具与UI共用业务入口。文件写入/根授权、终端操作以及凭据/自动办理授权仅UI，避免绕过DSH文件与命令审批。工具输出48KB上限，超限只提示，不泄露截断私人片段。
6. 进京证迁移保留旧后端私有凭据文件，未实施新的OAuth或credentials-service迁移；凭据不回显。官方网络及真实办理未测试。

## 已执行验证

- Node v26.7.0，`npm run verify`：104项通过（含8项新增隔离数据测试）；测试未触发真实申请/通知/终端指令。
- `npm pack --dry-run --json`：初次99个文件，未发现.local、数据库、账单source、accounts、favorites、shares等私人数据。增加文档后最终清单需重验。
- 图标为本次自绘SVG，Host子路径均导出中英文显示元信息与图标。
- 安装与当前GUI注册：待安装后补记。没有可用的浏览器控制能力，不能声称完成320/375/390/430px、软键盘或深浅主题视觉验收。

## 回滚

源项目未变，可继续使用。需要回滚代码时使用迁移前版本重新通过plugin_manager安装，不能手工重写profile。新插件写入后数据可能已分叉，不自动用旧副本覆盖新记录；应先备份两个系统的数据并人工核对。重启或停用新Host不会销毁原tmux会话。原匿名分享服务与原自动办理服务不随新插件停用而停止。

## 安装观察

初次直接安装返回already-installed，按管理器提示先remove_bundle再install_bundle。第一次重装的空registry参数被拒绝，改为有效https registry后1.3.0返回application: applied且无warnings。随后五个工具help与无内容readiness探针均响应，确认业务初始化完成；客户端Inspect最初未见入口，刷新后已确认九张工具卡片active（含五个新模块）。后续源代码加固仍需重新部署核验，不能以旧注册证明新代码已加载。

## 最终验证

- 最终 `npm run verify`：104/104通过，包含上传取消不得发布残缺文件、删除符号链接不得误删目标。`git diff --check`通过。
- 最终打包清单105个文件，无私人数据；5个Host的中英文元信息、自绘SVG导出均存在。
- 最终代码通过remove/install重新部署，管理器返回 `application: applied`、版本1.3.0、warnings=[]。底层pnpm另提示已有dshmarket的cordis peer缺失，非本包依赖，未擅自修改该插件。
- 最新Host已实际响应健康 `/status`：ready=true、1人25条；记账单 `/summary`：ready=true、8份可解析来源（含模板/历史副本）、14条分类规则和1条过滤规则；这些新增接口在重装前返回404、重装后返回200，确认非仅沿用旧注册。
- 最终重装后再次通过Client Inspect确认9张工具卡片active，包含五个新模块。注册成功不等于视觉验收；没有控制浏览器截图或真机测试。用户若仍看到旧页面，应刷新现有GUI载入新客户端，不需另启服务器。
