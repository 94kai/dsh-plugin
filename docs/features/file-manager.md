# 文件管理（1.3.0）

## 目的、API 与数据

保留原目录入口、收藏、分享记录；管理 `/config`、`/entries?root=&path=&hidden=`、`/text`、`/favorites`、`/shares`、`/directory`、`/entry`。下载走已认证的 GET `/api/pocket-kit/file-manager/download?root=&path=`，上传为带 X-Pocket-Kit 的 POST `/api/pocket-kit/file-manager/upload?root=&path=&name=`，流式上限1GiB且不覆盖同名文件；原系统10GiB上限未沿用。文本预览只支持512KiB内UTF-8。列表最多2000项。

`.local/data/file-manager/` 保存 config、favorites、shares；目录实际文件继续使用原物理位置，不复制整块硬盘或改文件 inode。根 ID 保留，使收藏和分享记录仍能定位。目录更新校验 revision、真实目录存在；路径使用 realpath 限定根范围，外逃符号链接不可读取。删除根目录被拒绝，其他删除需确认。

## 重要决策与生命周期

不把旧匿名分享服务直接开放到 DSH：记录保留，当前分享下载仍要求 DSH 登录。旧链接继续归原项目管理，本迁移不改变其服务。不要将这里的下载链接当作新的匿名分享链接。Agent 文件写入/目录授权/分享修改仅 UI；Agent 应使用遵守 DSH 文件沙箱的原生工具。

收藏写入串行、配置原子替换；传输取消释放流/句柄，Host卸载中止本模块流而不删除用户文件。临时上传只清理本次创建的临时文件。文件系统外部进程并发替换路径不具备内核级 openat 隔离，故不应将根目录交给不可信本机用户管理。

## 共同接入与移动端

客户端由 `features/utilities/client.js` 装配 React 页面，不嵌入旧 HTML、不另起服务器。工具箱卡片打开 `pocket-kit.file-manager`；Host 条目为 `pocket-kit-file-manager`。管理请求走已认证的 `POST /api/pocket-kit/file-manager`，JSON envelope 为 `{path,method,body}`，要求 `X-Pocket-Kit: 1` 和同源 JSON。路径限制在功能内部。Agent 工具 `pocket_file_manager` 先 help 发现接口，与 UI 共用 FeatureService；权限授予、凭据和真实终端命令只在 UI。

采用主题色、卡片分组、44px 控件、16px 输入、可换行长文、安全区底部留白和局部滚动表格；加载、空列表、错误和手动重试均有入口。移动宽度 320/375/390/430px、软键盘、深浅主题还没有真实浏览器验收，不以 CSS 或注册测试替代。

## 验证与限制（2026-11-07）

Node v26.7.0：`npm run verify` 104 项通过，其中新增隔离临时数据测试覆盖健康版本冲突、文件越界/符号链接/不覆盖上传/Range、凭据不回显/迁移自动任务暂停、终端参数边界、账单规则和 UI/Agent 共用入口。正式数据只做复制与一致性核验，没有对真实业务做写入测试。安装和实时注册结果见[迁移记录](../utilities-migration.md)。

补充：安全媒体预览支持PNG/JPEG/GIF/WebP、音视频和PDF，走已认证下载路由的preview参数；HTML/SVG不作为同源活动内容运行。取消上传不得发布残缺目标；删除符号链接只删除链接本身，已补回归测试。
