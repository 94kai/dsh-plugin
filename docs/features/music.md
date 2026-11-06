# 音乐：下载与整理

## 范围与入口

入口为侧栏「音乐」和媒体页面顶部音乐 tab（面板 key `pocket-kit.music`）。业务后端源于原 allinone 的独立 music-download 模块，保留聚合搜索、网易会员/声音、异步下载、下载库试听、重命名、删除、批量移动、元信息/歌词编辑和封面刮削。这里不接管小爱播放、外部曲库数据库或其他模块内部状态。

前端 Slot、DSH Host 注册及 Fetch 适配由工具箱装配层负责；业务类保留 `MusicDownloadModule` 与 `handle(req,res,url)` Node HTTP 兼容接口。不要从前端 import 后端、私密配置或第三方凭据。

## 复用接口与依赖

`new MusicDownloadModule({ projectDir, dataDir, fileRoots = [], env = {} })`；`dataDir` 应指向工具箱 `.local/data`，类追加 `music-download`。测试可传 `fetchImpl`（生产不要替换安全传输）。`initialize()` 只做本地目录创建和已存状态读取，不下载组件、不启动搜索；卸载必须 `await dispose()`。

可供 Host service / agent tool 共用的方法：`search`、`createDownload`、`listFiles`、`readMetadata`、`writeMetadata`、`scrape`、`renameDownloadedFile`、`deleteDownloadedFile`、`moveFiles`、`browseMoveDirectories`、`updateMoveRoots`、`createNeteaseQr`、`checkNeteaseQr`、`importNeteaseCookie`、`logoutNetease`、`installTools`。`resolveDownloadedFile` 已是异步真实路径校验，不再是同步方法。

依赖：Node ESM/Fetch/AbortSignal/流与加密；npm `qrcode` 仅在生成二维码时动态加载；外部 `media-get 0.2.14` 用于公开来源搜索/解析；`ffprobe` 用于标签读取和回读验证；`ffmpeg` 用于音频流复制重封装。媒体工具缺失时**不会自动下载安装或执行下载脚本**。只有显式安装操作才下载固定版本；已迁移的二进制不在初始化时执行。第三方二进制没有内置签名校验，应仅使用可信发行物；自动安装不是安全沙箱。

配置只从传入 `env` 读取：`MUSIC_DOWNLOAD_DIR`、`MUSIC_MOVE_ROOTS`、`MUSIC_SEARCH_SOURCES`、`MUSIC_MEDIA_GET_PATH`、`NETEASE_COOKIE_SECRET`、兼容旧密钥的 `DEVSTUDIO_TOKEN`、`FFPROBE_PATH`、`FFMPEG_PATH`，以及受控子进程 `PATH`。不会把宿主全部环境（尤其代理、token）透传子进程。

## 完整能力与 API

业务兼容前缀 `/api/modules/music-download`。实际 DSH 接入为 `POST /api/pocket-kit/music`，输入 `{module:'music',path,method,body}`；path 是表中短路径，method 承载原 GET/POST/PUT/DELETE，外层校验同源 JSON 和 `X-Pocket-Kit: 1`。音频独立使用已认证的 `GET /api/pocket-kit/music/audio?file=...`。Agent 工具 `pocket_music` 与 UI 共用 FeatureService，但登录授权和工具安装仅在 UI 操作。

| 路径 | 方法 | 输入与结果 |
| --- | --- | --- |
| `/status` | GET | `{ready,downloadDir,roots:[{id,label}],netease:{loggedIn,secureStorageReady}}` |
| `/tools/install` | POST | 新增显式安装，返回 `{ready:true}`；可能联网下载二进制，不自动执行搜索 |
| `/netease/qr` | POST | `{qr:{id,image,expiresAt}}`；3 分钟有效 |
| `/netease/qr` | GET | `id` → `{state,loggedIn}`；waiting/confirming/expired/authorized |
| `/netease/session` | PUT / DELETE | `{cookie}` 导入或退出；返回 `{loggedIn}` |
| `/config` | GET / PUT | `{moveRoots:[{id,label,path}]}`；保存输入 label/path，1–20 个已存在根目录 |
| `/search` | GET | `q`、`quality` → `{items,warnings,sources,excludedByTitle,unavailable}` |
| `/downloads` | GET | `{items:[{id,name,size,modified}],jobs}`，最近 30 个内存任务 |
| `/downloads` | POST | 搜索条目 → 202 `{job}`；可下载与暂不可下载结果均可尝试 |
| `/downloads` | DELETE | `file` → `{deleted}`；永久删除，UI 必须确认 |
| `/downloads/rename` | POST | `{filename,name}`，name 不含扩展名 → `{filename,warning}` |
| `/audio` | GET | `file`，HTTP Range 试听，200/206；无效范围 416 |
| `/directories` | GET | `root,path` → `{root:{id,label},path,parent,directories}` |
| `/move` | POST | `{files,root,path}` → `{moved:[{name,destination}]}`；1–200 个文件 |
| `/metadata` | GET | `file` → `{metadata}`：标题/歌手/专辑/年份/流派/轨号/歌词、格式/时长/码率/采样率、封面状态 |
| `/metadata` | PUT | `{filename,title,artist,album,date,genre,track,lyrics?,scrapeToken?}` → `{metadata}` |
| `/scrape` | POST | `{filename,title,artist}` → `{candidates}`，最多 8 个含确认 token 的候选 |

搜索默认来源 migu、netease、qq、kugou、kuwo、bilibili；来源标签还识别 douyin、youtube、qmkg。搜索按完整关键词包含于歌名过滤（忽略大小写、保留内部空格），不是歌手匹配。登录后网易单曲使用账号权益，另并行搜索网易声音和公开来源；声音上传者单独存 `uploader`，不冒充歌手。公开/会员/声音失败互不阻断，warnings 指明失败，保留不可下载原因并允许尝试下载。支持音质 standard/exhigh/lossless/hires/jyeffect/sky/jymaster，实际以账号和来源为准。

歌词编辑仅 MP3/FLAC/M4A，最多 12000 字、拒绝 NUL；省略保留、空字符串删除。FFmpeg 输出替换前用 ffprobe 回读验证。刮削搜索使用当前标题+歌手及文件时长排序，不用严格标题包含；网易候选可取歌词。封面候选 token 绑定文件，10 分钟有效，确认后才写入。

## 数据布局与迁移

私有根 `.local/data/music-download/`：

- `downloads/`：下载的普通音频（MP3/FLAC/M4A/AAC/WAV/OGG/APE/WMA），不递归扫描；音频兼容性由浏览器决定。
- `catalog.json`：以文件名为 key 的对象，value 包含 name/artist/album/duration/uploader/programId/source/sourceLabel/requestedQuality/actualQuality、来源 url/coverUrl 和时间戳；没有设计内本地绝对路径字段。
- `config.json`：`{moveRoots:[{id,label,path}]}`；id 为绝对路径 SHA1 前 10 字符。变更路径要同步重算 id，不能把 URL 当路径重写。
- `netease-auth.json`：`{iv,tag,data}` base64 AES-256-GCM 密文。旧密钥 SHA256 派生；迁移密文需保留密钥，否则重新登录，不可猜测或输出密钥。
- `bin/media-get`（Windows 为 exe）：可信媒体解析工具；平台/架构必须匹配。

catalog/config/auth 新写文件均为 0600、同目录临时文件原子替换；文件损坏拒绝初始化/覆盖。不要把损坏数据静默当空库。认证失败导入不会擦除旧登录。任务队列、扫码状态、刮削 token 仅内存保存，重启不恢复；已完成文件与 catalog 保留。批量移动逐项执行并落索引，不是整体事务，后续项失败时此前成功项不回滚。

原 source 的数据和 `.env` 不属于公开代码。凭据仅位于被忽略的本地配置或 DSH credentials；本次适配保留旧密文兼容，新的跨服务凭据设计应优先 credentials service。本次已复制下载文件、索引、密文、配置与已有工具，私密设置位于 `.local/integrations.json`；2 个下载文件可见且已有密文成功解密，真实第三方登录有效性未联网验证，详见[迁移记录](../music-xiaoai-migration.md)。

## 安全、限额和生命周期

- 后端 HTTP 传输在每次重定向验证 DNS 公网地址并固定实际连接 IP，拒绝本地/私有/保留 IP、URL 凭据和非标准端口；跨域重定向移除 Cookie/Authorization。不继承宿主代理环境。
- media-get 输入来源 URL 仅允许已知平台域名。**第三方进程的内部请求不受 Node 的 DNS 绑定传输控制**，因此必须信任工具，不能把它当成严格网络隔离。未来高风险环境需进程级网络沙箱。
- 搜索单次并发、最短间隔 1.5 秒；下载并发 2、待处理总数上限 32，保留任务最多约 100。公开/声音验证各最多 4 路；JSON 响应 4 MiB、请求 JSON 64 KiB；音频直链流 1 GiB、封面 10 MiB、安装包 128 MiB。media-get 输出在落盘前检查 1 GiB，但外部工具运行期间没有严格磁盘配额。
- 公开搜索 45 秒、解析 20 秒、平台请求通常 15–30 秒、下载 10 分钟、标签写入 120 秒、probe 15 秒。失败不回显完整子进程 stderr；下载错误显示概括说明。
- 文件操作拒绝源文件路径穿越及符号链接，目标目录逐级校验 realpath 并拒绝中间符号链接；改名/移动以不覆盖方式落地。需要信任本机其他进程不会恶意并发替换目录（并非内核级 openat 沙箱）。写元信息、移动、改名、删除、配置更新串行执行。
- `dispose()` 关闭接受新任务、标记排队任务 cancelled、AbortController 取消网络与子进程、等待已跟踪操作、清理扫码/候选内存。下载/标签临时目录在 finally 清理，试听流随断连/卸载销毁。
- 关闭音乐页面是否停止服务器下载由 UI/产品策略决定；目前后台任务由 Host 生命周期拥有，不以页面关闭自动取消。尚无逐任务取消 API。

## 手机 UI 与验证

UI 应支持 320/375/390/430px、44px 触控、长歌名换行、音质选择、可见错误与重试、滚动元信息/歌词编辑及目录逐级选择。播放使用原生 audio 控件；不依赖 hover，删除确认，移动/标签保存明确副作用。搜索只在用户触发后执行，禁止进入 tab 自动搜索或安装。

2026-11-07 执行 `node --check features/music/backend.mjs`、`node --check features/music/network.mjs`、`node --test features/music/*.test.js`：**19 项离线测试通过**。请求取消回归额外覆盖搜索锁释放、元数据子进程中止、刮削取消，以及已接收下载任务不继承入队请求的取消信号。覆盖公网地址政策、混合 DNS、显式安装去重、损坏文件保护、密文权限与错误密钥、URL 平台限制、路径穿越/符号链接、移动逃逸、改名冲突、模拟下载落盘、卸载、队列上限、HTTP 返回、真实临时文件 Range 流、模拟 ffprobe 元数据及 Cookie 验证失败保留旧状态。

所有测试使用临时夹具与 fake fetch/exec，没有真实下载、远程调用、二进制安装执行或读写正式数据；不代表第三方接口、真实音质、FFmpeg 重封装、DSH 安装和真机 UI 已验收。原文档曾写“无歌词刮削”，已过期，以当前代码能力为准。
