# 小爱音箱：播放与音响控制

## 范围与入口

「随身工具箱 → 小爱音箱」包含 **小爱播放 / 音响控制** 两个子视图。迁移来源是 Allinone 的 `xiaoai-music` 和 `xiaoai-assistant`，不是音乐下载模块。两子视图共用一个 `XiaoAiMusicModule` 实例及其设备连接，助手模块不另建 worker。

默认仅读取本地数据，**所有 worker 暂停**。打开页面、读取状态、切换音箱、读取歌单不启动音箱、不播放、不启动自动化。手动启动须满足私密配置风险开关和可信私网绑定，并经 UI 确认。本文记录源码契约，不表示真实设备已验收。

## 能力清单

### 小爱播放

- 保留多设备配置、设备选择、服务/音箱连接状态、监听状态、曲库数量、刷新状态、当前歌曲。
- 本地歌曲按歌名、歌手、专辑、文件名搜索；网页查询最多100字符，最多返回100条。网页搜索仍为文字匹配，不偷偷改成拼音搜索。
- 搜索结果单曲播放、逐首或全部加入持久播放列表；按音箱保存播放列表；共享「我喜欢」收藏。
- 从播放列表或收藏指定位置开始播放后续歌曲；播放轮数1–20，按设备保存浏览器偏好。单曲、随机播放也支持轮数。
- 持久列表移除、清空；收藏增删；以上操作不删除音乐文件。停止运行播放不会删除持久列表。
- 当前曲目与最多99首后续运行队列展示；从队列跳转切歌。运行队列和持久列表互相独立，运行队列不承诺跨重启恢复。
- 停止播放并清空运行队列；音量0–100；刷新曲库；开启/关闭语音识别监听。监听关闭仍保留设备 WebSocket，网页设备操作继续可用。
- 修改设备名称、1–10个绝对音乐目录、音箱可访问的音频base URL、搜索数量上限、定时刷新间隔及播放/附加停止/刷新/随机关键词。运行中的目标worker重启；暂停的保持暂停。原模块没有设备新增/删除接口，本次不凭空创建默认设备。
- 展示实际worker内置停止词表及条数，只读；附加停止关键词最多20条。内置规则为完整表达，不把关灯、关空调或歌曲名中的停止词误当停止音乐。
- 保留原音乐模块播报API和每设备最近5条播报记录、重播及清空。它与音响控制历史分开，不丢弃旧数据。
- 语音点歌文字搜索失败时按无声调、保留音节边界的拼音兜底；按歌名/文件名、歌手、专辑优先级匹配，同级随机，按数量上限组队列；专辑缺失时使用直接父目录名。没有下载新歌曲、歌词或封面能力。
- 保留云端响应等待接管逻辑：语音任务等待云端响应与安静窗口后停止云端歌曲、播报数量并播放本地；新语音或停止取消旧请求，云端歌曲重新接管会清空本地后续队列。已知设备限制：播放器stop不能可靠中断云端语音，会员提示可能重叠。

### 定时与语音歌单

- 最多30个命名歌单，每单最多100首；新增、改名、删除、搜索加曲、移除歌曲、导入当前播放列表独立副本。
- 最多50条规则，关联设备与命名歌单，时间HH:mm与语音提示词至少一项，播放轮数1–20，新增/编辑/启停/删除。
- 同设备启用规则不能重复时间或规范化提示词；启用规则必须有歌；提示词不能与已配置停止、刷新、随机词冲突。
- 语音提示词NFKC规范化、忽略空白标点及英文大小写，整句匹配；1秒内去重。
- worker启动后每5秒检查，时区固定Asia/Shanghai。每规则每天最多尝试一次，执行前先写日期标记；错过、离线或失败不补播，修改当天已触发规则时间不再次执行。
- 规则关闭网页仍有效，但**只在显式启动的worker中有效**。状态损坏停用自动执行；配置错误不覆盖原文件。UI展示最近执行状态和错误。
- revision保护整体配置保存，多页面冲突返回409；界面保留失败表单并可重新读取。

### 音响控制

- 共享设备状态和音量，直接朗读文字（speak，最多500字符）或自然语言小爱指令（ask，最多200字符）。ask可以影响真实米家设备，必须用户明确点击发送。
- 每设备最近5条成功发送历史，按文本+模式去重置顶；填入编辑、明确「再次发送」、清空历史。
- 最多30个共享快捷控制，分类灯光/空调/场景/其他；pair模式有自定义开启/关闭标签与两条命令，action模式有单次命令；新增/编辑/删除及在当前音箱执行。
- 失败保留输入，保存与发送有busy状态，危险删除/清空/启动/停止操作有确认。

## 模块接口

`features/xiaoai/index.mjs` 导出：

```js
const music = new XiaoAiMusicModule({ projectDir, dataDir, env });
const assistant = new XiaoAiAssistantModule({ dataDir, xiaoAiMusic: music });
await music.initialize();       // 只读本地配置；不创建目录、不生成worker、不启动服务
await assistant.initialize();  // 只读助手数据
await music.handle(req, res, url);
await assistant.handle(req, res, url);
await assistant.dispose();
await music.dispose();
```

`dataDir` 应为工具包私密数据根（例如根目录 `.local/data`），内部分别追加 `xiaoai-music` 和 `xiaoai-assistant`。`projectDir`仅保留构造兼容；Python源码位置从模块自身URL解析，不依赖源Allinone绝对路径。模块配置只取显式注入的`env`，不会悄悄从宿主环境读取XIAOAI配置。

复用边界：assistant只调用music的 `assistantProfiles()`、`assistantCommand(profileId,mode,text)`、`assistantVolume(profileId,volume)`。音量配置仍由music持久化。自动化沿用 `MusicAutomation.initialize()/update()` 与Python `Automation`；worker沿用Runtime、App、MusicSearcher、MusicIndexStore、MusicIndexer、MusicSearchEngine、LocalMusicHttpServer和设备RPC层。不要启动两个music实例抢同一套端口。

前端 `createXiaoaiView(React, shared)` 返回React组件；由共享客户端内联，不单独注册模块。仅用公开的shared helpers，不操作其他模块DOM。传给桥的路径为短路径，`module='playback'`或`'assistant'`；Host固定补模块前缀，禁止客户端指定任意上游URL。

## HTTP路由契约

以下为后端原Node handle路径；DSH管理桥通过POST envelope映射受控方法，不暴露另一个公共管理端口。一般请求体64KiB；自动化整体保存2MiB。错误由Host桥转换为JSON并保留status。

### 播放模块

前缀 `/api/modules/xiaoai-music`；`P=/profiles/:id`。

| 方法与后缀 | 输入/响应 |
| --- | --- |
| GET `/profiles` | `{profiles}`；公开配置及online、workerState、speakerConnected、librarySize、refreshing、currentSong、queueSize、queue、automation等；暂停不探测旧worker |
| PUT `P` | 可编辑设备配置；`{profile}`，仅原本运行的worker重启 |
| POST `P/worker/start` | 显式启动；`{success:true,workerState:'starting'}`，不代表设备已连接或可播放；默认风险未确认409 |
| POST `P/worker/stop` | 停止本实例拥有的worker；`{success:true,workerState:'stopped'}` |
| GET `P/search?q=...` | `{items:[{path,name,title,artist,album,size}]}` |
| GET `P/collection` | `{playlist,favorites,announcements}` |
| POST `P/playlist` | `{songs,mode:'append'|'replace'}`；`{playlist}`；先校验再替换，非法请求不清空原列表 |
| DELETE `P/playlist?path=...` | `{playlist}` |
| PUT `P/favorites` | `{song,favorite}`；`{favorites}` |
| POST `P/collection/play` | `{source:'playlist'|'favorites',index,repeat}`；`{success:true}` |
| POST `P/queue/jump` | `{index}`；`{success:true}` |
| POST `P/play` | `{path,repeat}`；`{success:true}` |
| POST `P/play-search` | `{keyword}`；`{success:true}`；保留旧API |
| POST `P/random` | `{repeat}`；`{success:true}` |
| POST `P/stop` | 清运行队列及切歌计时；`{success:true}` |
| POST `P/refresh` | `{success:true,total,costMs}`；最长10分钟 |
| POST `P/listener` | `{enabled}`；`{success:true}`，保存配置 |
| POST `P/volume` | `{volume}`；`{success:true,volume}`，保存配置 |
| POST `P/speak` | `{text}`；`{success:true,announcements}` |
| DELETE `P/announcements` | `{announcements:[]}` |
| GET `/automation` | `{revision,playlists,rules}` |
| PUT `/automation` | 同结构整体更新；新revision；冲突409，数据损坏503 |

命名歌单 `{id,profileId,name,songs}`；规则 `{id,profileId,playlistId,enabled,time,phrase,repeat}`。

### 助手模块

前缀 `/api/modules/xiaoai-assistant`。

| 方法与后缀 | 输入/响应 |
| --- | --- |
| GET `/state` | `{profiles,controls,history}` |
| POST `/send` | `{profileId,mode:'speak'|'ask',text}`；`{success:true,history}` |
| POST `/execute` | `{profileId,controlId,operation:'on'|'off'|'action'}`；`{success:true}` |
| POST `/volume` | `{profileId,volume}`；`{success:true,volume}` |
| POST `/controls` | 控制字段；201 `{control}` |
| PUT `/controls/:id` | 控制字段；`{controls}` |
| DELETE `/controls/:id` | `{controls}` |
| DELETE `/history/:profileId` | `{history:[]}` |

控制字段 `{id,name,category,mode,onLabel,offLabel,onCommand,offCommand,command}`。history为按profileId分组的 `{text,mode,usedAt}[]`。

## worker、端口与生命周期

- 一个profile一个Python子进程，入口本模块 `worker_bridge.py --config <私密worker路径>`。Python解释器取`env.XIAOAI_PYTHON`，未配置为python3。
- 每worker三端口：设备WS、音频HTTP、回环管理API。源代码默认示例分别为4399/18080/18180与4400/18081/18181；**迁移后的实际值仅从私密配置读取**，没有硬编码NAS路径或IP。
- `XIAOAI_ALLOW_LAN_UNAUTHENTICATED=true` 是显式局域网兼容风险确认；`XIAOAI_BIND_HOST`必须为明确的RFC1918私网或127/8 IPv4地址，默认127.0.0.1；拒绝0.0.0.0、公网和hostname监听。不能因为确认开关就转发端口到公网。
- 启动前依次尝试绑定检查三端口，冲突409。不会kill端口占用者，也不会接管源Allinone；检查与实际绑定间仍有竞态，因此worker控制API还使用每次启动随机Bearer token，只有本实例持有。
- 生成worker JSON原子保存0600；API只绑定127.0.0.1，并校验token。`worker()`在本实例children无有效记录时直接503，连GET status都不访问旧端口。
- Python启动顺序：ffprobe能力检查、音乐HTTP、loopback API、设备WS、首次曲库刷新、自动化循环及可选定时索引刷新。初始化可能较长，启动返回starting不保证ready；UI刷新检查实际online。
- 开启语音监听注册on_event；关闭只移除回调，不断开共享WS。WS只接受一个活动音箱，新连接会替换旧连接。
- 意外退出原设计3秒重试，重试计时器归本实例跟踪；显式停止和dispose取消重试。SIGTERM后最多等待4秒，再SIGKILL本实例拥有的child，不触碰源项目进程。dispose等待启动中操作并关闭所有自有child。
- Python退出取消自动化、语音、切歌、自动恢复及刷新任务，关闭API/HTTP/WS资源。不保证立即停止设备缓存中的声音；明确停止播放接口才负责设备停止和队列清空。

## 数据、配置与依赖

目标私密目录：

```text
.local/data/xiaoai-music/
  config.json
  library.json
  automation.json
  <profile-id>-index.json
  <profile-id>-automation-state.json
  <profile-id>-worker.json       # 派生文件；新启动重建，含本实例临时token
  python-deps/                  # pypinyin及元信息，不进源码包
.local/data/xiaoai-assistant/
  state.json
```

必须保留profile ID、歌单与规则ID、原绝对歌曲路径、收藏、播报/指令历史、快捷控制、规则每日执行标记和曲库索引。不要把规则执行状态丢掉后在同一分钟启动，避免重复尝试；原运行中的临时队列不在持久数据中，不能假称可恢复。音乐文件本体不复制，实际音乐根路径须继续存在且可读。浏览器偏好跨不同origin无法自动搬迁；同origin可读取旧选择与轮数key后写入Pocket Kit命名空间。

仅元信息研究记录（未读取内容）：源music目录config.json 1461字节、library.json 6199字节、automation.json 859字节、living-room-automation-state.json 244字节、两份index各2字节、两份worker各1040字节、python-deps共130文件/3681765字节；assistant/state.json 1735字节。此为研究时快照，不代表数据内容有效或最终迁移结果。

Node模块仅使用标准库；Python核心为标准库，必须有ffprobe（通常由ffmpeg提供）；语音拼音兜底可选pypinyin==0.55.0，缺失时普通文字搜索和播放仍可用。worker从其配置所在目录的python-deps加载，不再引用源项目。**不自动安装Python依赖，不自动启动外部进程来“验证”。** Python语法使用3.10+类型写法，建议使用实际兼容的3.11+环境；ZoneInfo需要可用时区数据。

## 安全与迁移风险

1. 默认暂停至关重要：源`initialize()`会重写文件并自动启动所有worker；迁移副本已改为只读。源文件始终只读，数据复制及正式切换由主迁移流程负责。
2. 原`ask_xiaoai`及播放URL直接嵌shell单引号存在注入风险；已统一进行单引号转义，测试用恶意形状的虚构字符串确认只作为一个JSON参数，不执行shell。
3. 设备WS和音频HTTP仍因旧音箱协议兼容而**没有设备级鉴权/TLS**；它们不因管理UI受DSH保护就变安全。必须可信LAN、防火墙、禁止公网/NAT转发。WS接入者可冒充音箱，音频hex路径不是秘密token。
4. 音频HTTP仅服务本实例创建URL的allowlist文件，并再次校验realpath位于配置音乐根；索引排除逃逸根目录的symlink。仍需防止不可信本机用户替换允许目录下文件；不是完整OS沙箱。
5. WS单帧及累计分片限制16MiB。管理API bearer仅写私密worker JSON，不回传浏览器。原始stdout/stderr被排空但不公开，避免语音、路径、凭据进入日志/状态；前端只收到泛化错误。
6. 私密配置未知字段保留在磁盘，publicProfile和workerConfig按白名单构造；不公开password/token等额外字段。base URL不允许内嵌用户密码，公开显示去掉query/hash。不要在歌单、语音历史或设备名称中存凭据；这些是用户功能数据，会展示给已登录用户。
7. JSON持久化使用同目录随机临时文件和原子替换、0600权限、按路径写队列；配置损坏拒绝覆盖。自动化有revision冲突保护，其余旧接口仍是单服务所有者语义，不可让两套实例同时写同一数据目录。
8. 保存开启中的自动规则、手动启动或执行指令都可能造成真实声响/设备动作，不能作为自动化测试副作用。禁用/卸载工具包应回收自有worker；不得杀源Allinone进程完成测试。

## 手机与验证

UI复用手机优先共享样式，单列窄屏布局、至少44px按钮和16px表单、长文换行、显式状态和错误、无hover依赖。队列、配置和历史可折叠；复杂自动歌单使用表单而非仅JSON编辑器；切换设备清理旧搜索/编辑草稿，失败保留当前输入。轮询仅页面挂载且可见时读取状态，卸载取消计时器，网络请求由共享useApi中止。

已执行：`node --check features/xiaoai/view.js`；`node --test features/xiaoai/backend.test.js` **15项通过**（含一个运行5项Python纯模拟测试的测试）。覆盖只读初始化、不写默认、不连接旧worker、默认风险拒绝、私网限制、模拟端口冲突、私密字段、离线配置、收藏/列表持久化、非法替换不清空、automation revision、助手历史和控制、损坏拒绝覆盖、自有fake child卸载，以及Python语法、shell引号、停止指令、文件根与鉴权入口。

异步交互回归补充：播放列表以设备ID与请求代次双重校验；切换设备、修改列表/收藏/播报历史及卸载立即使旧请求失效，A→B→A不会复活旧A响应。只有已完成读取且归属当前设备的列表可展示和按索引操作；读取失败保持列表操作不可用，用户可刷新重试。助手数据与自动化配置也使用最新请求序号，写操作先使旧读取失效。

真实控制或持久化成功后，状态刷新失败只显示“操作已完成，但刷新失败；仅刷新状态，不要重复操作”，不能把播报/播放已发送误报为未执行。新增快捷控制一旦写成功即清除新增草稿，不因后续刷新失败诱导重复创建。busy时整个操作fieldset禁用，防止成功返回清空等待期间的新输入。

新增 `features/xiaoai/view.test.js` 的6项纯逻辑/源码回归覆盖最新请求、A→B→A、修改/卸载失效、已提交动作刷新失败不重发、abort，以及fieldset和数据归属约束；无React/DOM模拟。合并运行 `node --test features/xiaoai/*.test.js` **21项通过**。

未执行：真实worker启动、端口监听、真实音箱命令/播放/自动化、正式数据写入、手机真机或视觉验收。新增功能完成不等于这些限制已解除。至少后续在获授权条件下逐项验收320/375/390/430px、软键盘、离线/冲突、真实设备连接和运行队列；验收结果另行记录，不使用模拟截图冒充当前GUI。

## 1.3.0 导航文案

随统一入口改名，返回按钮显示“返回工具箱”，原面板ID、业务API、数据与生命周期不变。完整104项回归测试通过；没有借本次导航改名操作真实音箱、下载或正式清单。
