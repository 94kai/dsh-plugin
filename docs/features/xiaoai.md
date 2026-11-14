# 小爱音箱：播放与音响控制

## 范围与入口

「随身工具箱 → 小爱音箱」包含 **小爱播放 / 音响控制** 两个子视图。迁移来源是 Allinone 的 `xiaoai-music` 和 `xiaoai-assistant`，不是音乐下载模块。两子视图共用一个 `XiaoAiMusicModule` 实例及其设备连接，助手模块不另建 worker。

2026-11-09 起，经用户要求，**已确认局域网风险且未设置 `XIAOAI_AUTO_START=false` 时，Host 初始化自动启动全部配置音箱的自有 worker**，无需打开页面；未确认风险仍保持暂停。启动沿用可信私网绑定、端口冲突检查和卸载清理，不接管旧 Allinone。已有启用的定时/语音规则随 worker 生效，不恢复旧临时队列。手动停止在本次 Host 生命周期内保持暂停，重载后重新自动连接；特殊情况运行 Allinone 前先停用小爱 Host。以下 2026-11-07 默认暂停描述是历史记录，以本段为准。

## 2026-11-14 定时播放界面重排

- 去掉“先歌单后规则”的绕行说明和底部折叠表单：规则页顶部直接“新增规则/收起编辑”，编辑表单紧邻按钮；“歌单管理”用当前歌单下拉 + 单行搜索，歌曲用紧凑行（序号、歌名、移除图标）。
- 规则改为卡片：歌单名、启用/停用徽标、`每天 07:30 · 说“提示词” · 播放 N 轮` 一行摘要，右侧启用/停用、编辑、删除；空歌单/空规则有明确下一步提示。歌单重命名、复制播放列表、删除合入“歌单设置”折叠区。
- 修复重排时遗漏 `ruleList` 定义导致点击“编辑/新增规则”白屏（渲染期 ReferenceError）；补回定义并增加“声明必须先于表单构建”的回归断言。未改变 automation API、数据结构或执行逻辑；仅调整界面与文案。`npm run verify` 212 项通过。验收浏览器会话已过期到 DSH 登录页，未读取登录 token，本轮未做浏览器截图；需在已登录页面刷新确认。

## 2026-11-14 播放器式播放界面

- 播放列表、搜索结果和喜欢列表统一为紧凑曲目行：序号/当前曲标记、标题与歌手/专辑、右侧图标操作（播放、加入、喜欢、移除），不再使用整行大按钮；移动端不换行，标题单行省略。
- 当前播放改为独立卡片（♪ + 正在播放 + 曲名）；播放模式改为四段紧凑选择；搜索框与“搜索”按钮同一行，结果计数与“全部加入列表”同一行；搜索输入框标签缩短为“搜索”，窄屏不再折行。
- 长标题跑马灯：任何实际溢出的曲名和顶部正在播放标题都会滚动（`transform` 平移，9 秒往返）；用 ResizeObserver 测量溢出，不溢出不创建动画。共享一个 IntersectionObserver，离屏行自动暂停，避免长列表同时跑大量动画；尊重 `prefers-reduced-motion`。曲目操作按钮缩小为 40×44（移动端 38×44）、图标 15/14px，仍保留整行高度作为触控区。
- 子视图导航在窄屏改为等宽单行 tab（按实际标签数量均分，不固定四列），13px 字号且禁止折行；同样适用于两标签的“小爱播放/音响控制”和三标签的音乐页。
- 浏览器验收：在 `http://127.0.0.1:2007` 打开工具箱 → 小爱音箱，实际渲染播放台、曲库搜索（搜索“许嵩”，只读）；用 CDP 模拟 390×844 检查移动端，模式按钮不换行、曲目行约 60px、无横向溢出；在 240px 宽度下确认正在播放标题溢出后添加 `is-marquee`、`--pk-shift=-45px` 且动画实际运行；恢复 1280 桌面后再次确认列表与搜索行。未点击播放、未控制音箱、未验证暗色主题。
- `npm run verify` 211 项通过；`dist/client.js` 已重建。客户端更新通过页面刷新生效，未重载插件 Host。等宽 tab 与全量跑马灯的最终版本未再做浏览器截图：验收用的独立浏览器会话已过期到 DSH 登录页，未索取或读取登录 token；需在用户已登录的页面刷新确认。
- 后续微调：无当前播放歌曲时隐藏“停止播放”；跑马灯动画时长由9秒改为3秒。`npm run verify` 213项通过；本轮未进行浏览器或真机视觉验收。
- 音量改为滑杆松手即提交（鼠标/触屏 pointer up，键盘调整后 key up），移除单独的“应用音量”按钮；变更后以滑杆值发送。`npm run verify` 214 项通过；未做浏览器/真机验收。

## 2026-11-14 单一播放列表与播放模式

- 用户要求去掉“已保存歌曲/本次播放队列”两个列表，统一为一个播放列表；播过的歌曲保留，用模式实现顺序、列表循环、单曲循环和随机。原“打乱列表”与运行队列面板删除。
- worker 新增 `play_source`/`play_mode`：`/queue/playlist` 接收 `{mode,source,paths}`，`/queue/mode` 切换模式；曲目结束后按模式重填待播（loop-one 重播当前曲，loop-all/随机重填完整列表），顺序模式播完停止。旧的 `play_paths(paths,repeat)` 保留给定时歌单和语音。
- Node 新增 `/playlist/play`、`/playlist/mode`、`/search/play`、`/favorites/play`；`/queue/shuffle`、`/queue/jump` 删除；`/collection/play` 仅保留旧客户端兼容。
- 修复播放列表接口记录播放状态时引用未定义 `logger` 导致 HTTP 500：worker 显式初始化 Python logger，并增加静态回归测试。本轮 `npm run verify` 通过（212 项），`python3 features/xiaoai/safety_test.py` 通过（8 项）；未真实播放或控制音箱。
- 原验证记录：`node --check` 通过；`node --test features/xiaoai/*.test.js` 38 项通过；`python3 features/xiaoai/safety_test.py` 7 项通过。模式循环依赖 worker 实际曲目结束计时，真机播放连续性尚未验证。

## 2026-11-09 自动连接变更与验证

- 仅改本包后端，不修改风险许可、私人配置、DSH 宿主或 Allinone；未新增接口或持久数据字段。`XIAOAI_AUTO_START=false` 可由用户在私密配置关闭自动启动。
- 全部配置和自动化校验完成后逐台调用原有 `start()`；单台启动失败不阻断其他设备和管理接口，状态显示脱敏错误，支持手动重试。不杀端口占用者，也不循环抢占冲突端口。
- `node --check` 检查 music/host 通过；`node --test features/xiaoai/*.test.js` **35 项通过**，新增许可自动启动、关闭开关、失败隔离/脱敏/重试、私网与端口保护回归；`git diff --check` 通过。仅后端变更，无需重建客户端。
- 仅禁用再启用 `include:pocket-kit-xiaoai`，返回 applied；新 help 已加载。未调用手动启动接口，随后读取两台均 `workerState=running`、`online=true`、`speakerConnected=true`，曲库各2739首，当前无播放/队列。
- 未发送播放、播报或音量指令，未触发规则测试，未重启整个 DSH 或主机，未进行浏览器 UI 验证。重启后自动启动以初始化回归及本次 Host 重载验证为依据。

## 2026-11-09 本次播放队列打乱

- 队列展开区新增“打乱列表”，使用现有动作锁和提交后状态刷新；不足2首待播、离线、未连接或操作中禁用。只调整待播顺序，当前歌曲继续播放；不修改已保存歌曲、收藏或自动歌单。
- 新增 `POST P/queue/shuffle {}`，通过原有鉴权管理桥转发自有 worker。Python 在 `local_music_lock` 内对完整 `App.play_queue` 原地随机打乱，保留重复项，不切歌、不取消计时、不重新生成播放任务；空/单首安全无操作。
- 构建和语法/资源检查通过。完整非浏览器回归166项：165通过，1项现有首页断言失败（注册入口预期2个，现有首页代码实际3个；本次未改首页）。小爱37项均通过，包含Python纯模拟7项：全队列超过99首、重复项、当前歌曲/计时保留、锁、空/单首、路由鉴权与Node转发/不写持久列表；UI新增按钮与禁用条件源码回归。`git diff --check` 通过。
- 用户随后明确要求部署，已仅重载 `include:pocket-kit-xiaoai` 与客户端载体 `include:pocket-kit`，均返回 applied，无 warnings；未重启整个 DSH、其他业务 Host 或 Allinone。两台音箱自动重连，均 online/speakerConnected，临时队列清空。新 help 路由可读，客厅空队列 `POST queue/shuffle {}` 返回200/success；未为测试新增播放任务或改变非空真实队列。用户需刷新原GUI加载新客户端，未以 applied 冒充浏览器交互验收。
- 未进行浏览器 UI 验证，未验证手机布局或真实播放连续性；模拟测试不代表真机验收。

## 能力清单

### 小爱播放

- 保留多设备配置、设备选择、服务/音箱连接状态、监听状态、曲库数量、刷新状态、当前歌曲。
- 本地歌曲按歌名、歌手、专辑、文件名搜索；网页查询最多100字符，最多返回100条。网页搜索仍为文字匹配，不偷偷改成拼音搜索。
- **单一播放列表**：按音箱保存一个播放列表，不再区分“运行队列”和“已保存歌曲”。搜索或“我喜欢”中的歌曲都可以加入；播放列表中的歌曲也可以点“喜欢”。
- 点搜索结果或喜欢列表中的某一首播放时，先清空播放列表，再把该曲及其后面的歌曲（按当前搜索结果/喜欢列表顺序）填入并开始播放；播放列表内点某首则从该曲开始，保留完整列表。
- **播放模式**：顺序播放、列表循环、单曲循环、随机播放。模式只决定下一首，不删除已播歌曲；停止播放保留列表。播过的歌曲保留在列表中，“移除”需用户明确操作。
- 播放列表移除、清空；收藏增删；以上操作不删除音乐文件。原来的“打乱列表”和运行队列面板已移除，随机改由播放模式承担。
- 音量0–100；刷新曲库；开启/关闭语音识别监听。监听关闭仍保留设备 WebSocket，网页设备操作继续可用。
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
await music.initialize();       // 校验配置后按风险许可与自动启动开关启动自有worker
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
| POST `P/playlist/play` | `{path?,mode}`；播放唯一播放列表，path为起始曲；mode=sequence/loop-all/loop-one/shuffle |
| POST `P/playlist/mode` | `{mode}`；切换当前播放模式，不中断当前曲 |
| POST `P/search/play` | `{keyword,path?,mode}`；清空列表后把该曲及后续搜索结果填入并播放，最多1000首 |
| POST `P/favorites/play` | `{path?,mode}`；清空列表后把该喜欢曲及后续可播放喜欢填入并播放 |
| POST `P/collection/play` | 旧客户端兼容：`{source:'playlist'|'favorites',path?,index?,repeat?}` |
| POST `P/play` | `{path,repeat}`；旧接口，单曲/语音路径 |
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

## 2026-11-07 实际启用

- 用户明确确认无鉴权局域网兼容风险。`.local/integrations.json` 的 `env` 已加入 `XIAOAI_ALLOW_LAN_UNAUTHENTICATED=true` 与本机私网 `XIAOAI_BIND_HOST`（具体值不入库）；修改前备份至 `.local/backups/`，文件权限保持 0600。
- 经用户确认停止整个旧 Allinone 服务：`pm2 stop allinone` 后 `pm2 save`，未改其源码或数据；旧的两个 Python worker 及 4399/4400、18080/18081、18180/18181 端口均已释放。
- 通过 Plugin Manager 先禁用再启用 `pocket-kit-xiaoai` Host，使新 env 生效；随后通过同一 Host 的 Agent 工具分别显式启动 living-room 与 new-speaker（未用浏览器点击启动按钮）。
- 实测结果：两个 worker `online`、`speakerConnected=true`；WS/音频端口仅绑定私网 IPv4，管理 API 仍为 127.0.0.1；首次全量索引各 **2738 首**，`search` 正常返回；客厅音箱音量写回 63 成功；自动化配置与状态可读，此前“播放列表包含不在当前曲库中的歌曲”的失败在曲库建立后已具备重试条件。
- 启用当时未执行：真实播放/播报/语音点歌、定时规则触发、手机浏览器布局与交互。后续网页交互验证见下节，仍不以接口成功冒充实际发声。

## 2026-11-07 手机交互优化与实页复验

- 两级切换按钮统一 `aria-pressed`，修复原先 `aria-selected` 与共享 CSS 不匹配、无法辨认当前页面的问题；保留原生按钮 Tab / Enter / Space 操作。
- 曲库搜索、我喜欢、定时播放入口移到播放器之前；切换后只渲染相应内容，不再先滚过整个播放器。播放器和已保存歌曲位于“播放台”页（后续澄清命名），轮数设置仍为搜索、收藏播放共用的设备偏好。
- 精简音箱状态区：在线时不再重复迁移警告或显示不可用的启动按钮；“停止服务”收入“服务管理”，明确它与“停止播放”不同。停止播放清队列增加确认；旧版播报历史和内置停止词保留，后者折叠展示。
- 操作反馈吸附于页面滚动区域顶部；成功提示 6 秒后收起，错误保留到关闭或下一次操作，切换页面清除旧提示。共享媒体 `useAction` 新增 `notify/clear` 和计时器清理，音乐页同时获得成功提示自动收起。
- 曲库刷新不占用整页动作锁；按设备独立去重并展示进行中，失败提示只反馈到归属设备。页面仍可搜索、切换和控制；卸载时由现有请求控制器取消浏览器等待。
- 音量改为 0–100 滑杆，紧邻“应用音量”；拖动不发送设备指令，明确点击应用才提交。规则/快捷控制编辑滚动到表单，上次执行时间按北京时间显示，执行状态中文化。
- API、Host、数据格式、设备连接与自动化策略均未更改；只重载 `include:pocket-kit` 客户端载体，未重启小爱 Host 或中断当前播放。
- 已执行当时的浏览器检查脚本（现已移除）：隔离虚构 API 验证搜索、选中态、歌单创建、规则保存/编辑、非阻塞刷新、播报失败保留草稿与成功清空、快捷控制草稿取消、设备切换；不向真实设备发送写操作。`npm run verify` 构建/检查及 **137 项测试通过**。
- 实页：复用私有登录状态，在原 GUI 使用 Chromium 移动 UA/触屏检查 **320/375/390/430px、390px暗色与1440px桌面**。搜索、列表/收藏/自动化切换、提示滚动可见、配置取消、快捷控制草稿取消、设备切换均通过；无横向溢出、pageerror 或小爱写请求。实际查看390px首屏、暗色控制页与320px搜索截图；截图仅存系统临时目录，不提交或打包。
- 限制：未做真机 Safari、软键盘、大字体、实际播放/播报/设备指令与自动规则触发验收；未为测试修改正式歌单、收藏、历史或设备音量。

### 四项流程澄清（同日后续）

- 服务管理改成带箭头和 `aria-expanded/aria-controls` 的普通展开按钮，展开不发起启停请求；区域持续展示服务/设备状态、分别禁用不适用的启动/停止动作，两项均须再次确认。切换音箱收起面板，避免把前一设备的管理状态带到下一台。
- 播放页不再包含播报输入和旧记录。音响控制“最近发送”展示助手历史与旧 `announcements`，按文字+模式去重，优先保留有时间的近期项；独有旧项标注“旧记录”。仅展示合并，不搬迁或删除磁盘数据，不伪造旧项时间；两个清空按钮分别明确对应近期与旧版存储，避免非原子跨文件清空。
- 原“播放列表”入口改为“播放台”。当前临时任务标为“本次播放队列”；持久列表标为“已保存的歌曲”，说明只有显式播放才生成队列、停止/重启不清空保存内容。内部 `playlist` API 与数据不变。
- 定时页拆成“播放规则 / 歌单管理”：默认先展示规则卡片；新增/编辑才展开表单。按“歌单 → 触发方式 → 轮数”填写，定时、语音、两者均可三选一，提交清除未选触发方式的隐藏字段；空歌单不可创建规则，执行说明与旧执行结果折叠。歌单管理按新建、添加歌曲、查看歌曲、为此歌单建规则组织；添加歌曲搜索/复制、重命名/删除分别折叠，已加入项禁止重复加入，删除提示关联规则数。
- 修复重复选择同一音箱会使列表失效而不重新加载的问题；所有后端校验、revision 冲突、自动播放行为保持原样。
- `npm run verify` **138 项通过**。隔离浏览器补测服务展开不触发写入、历史去重与模式区分、完整新建歌单→添加歌曲→创建规则、双条件规则、切回仅定时后清空隐藏语音字段、409保留表单。真实 GUI 重新检查320/375/390/430px、暗色和桌面，覆盖服务展开收起、规则查看/编辑取消、歌单切换、搜索与导航，无小爱写请求或页面错误；实际查看390px服务、规则、歌单管理和规则编辑截图。仅重载客户端，未停止音箱服务、触发播放或修改正式数据。

### 旧记录退役与配置弹窗（同日后续）

- 用户明确授权清空两台旧播报记录。通过现有业务 DELETE announcements 接口分别执行成功，持久数据复核 living-room / new-speaker 旧记录均为0；助手近期记录各5条保留。未清除收藏、已保存歌曲、规则或快捷控制。
- 移除客户端旧记录合并函数、announcements读取状态、旧记录标签及清空按钮；“最近发送”仅展示助手近期记录。旧播放侧后端 speak/announcements API 为兼容保留，当前网页已不调用，不能将本次变更描述为删除了兼容API。
- 音箱配置改为 `role=dialog` 模态弹窗：标题/关闭与底部保存/取消固定，中间内容滚动；支持关闭按钮、取消、遮罩和Escape。打开聚焦关闭按钮，Tab循环约束在弹窗内，关闭还原焦点及页面滚动；保存过程中不允许误关闭，失败留在弹窗显示错误并保留草稿。配置提交及运行中服务重启确认不变。
- 隔离浏览器覆盖四种关闭方式、焦点进入/约束/还原、取消不提交、配置保存失败保留草稿及旧记录不再显示。`npm run verify` **138项通过**。原GUI复验320/375/390/430px、暗色和桌面，弹窗及固定底栏在视口内，无溢出/pageerror或额外业务写入；未在真实音箱保存配置或触发重启。仅重载客户端，音箱连接保持运行。真机键盘/Safari仍未验收。

## 飞牛音乐“我喜欢”对接调研（2026-11-07，调研时尚未接入）

- 已定位本机 `trim-music` 服务、安装包前端构建和 SQLite 建表脚本；后端交付为 Go 二进制，只有控制器/服务/DAO符号证据，未取得完整后端源码。服务监听本地 Unix socket `/var/run/trim_music.socket`，Web路径前缀 `/music/api/v1`。
- 前端 SDK 与喜欢页面调用确认：`GET /favorite-track/list?page=1&size=...` 返回分页 `list/total`；`POST /favorite-track/create` 和 `POST /favorite-track/delete` 请求体均为 `{trackGUID: <曲目guid>}`。后端符号存在相应 UserPreferenceController 和 userPreferenceService 方法；favorite_track 按 user_id+track_id 唯一，属于用户级收藏，不是按音箱隔离。
- 前端使用 `music-token` 会话 Cookie，另带 `authx` 请求签名；NAS系统登录/影视token不能当成音乐token。两种路径无凭据只读探测均返回HTTP401：NAS反代与音乐socket。未读取现有数据库会话token、未绕过鉴权、未修改收藏，也未取得已登录的喜欢列表。
- 对接建议：以飞牛API作为唯一喜欢源，在Pocket Kit后端代理分页读取与明确的create/delete；按实际曲目GUID写入，歌曲绝对路径与audioSpec映射只用于定位，不按标题模糊认定。同文件多CUE曲目、库外文件和权限不可见项必须明确处理；认证失败不回退到另一份本地收藏。原Pocket Kit收藏保持备份/原样，不自动批量导入飞牛。
- 两个skill已用用户级符号链接接入DSH并启用filesystem provider，当前会话可通过skill工具正常加载，不复制或迁移任何登录态。trim-cli本机打包版本可运行help，但不支持`--version`且没有music命令；它的media是影视、file fav是文件收藏。fnos-cli skill固定0.5.1，首次CLI下载的GitHub与npmmirror源均失败，尚未准备好可执行运行时；文档也没有音乐收藏专用命令。skill注册成功不等于CLI联网/登录成功。
- 最小下一步：通过用户UI取得目标飞牛音乐账号的独立授权，验证分页喜欢列表和GUID/路径映射，再实现适配器；真实单曲添加/取消喜欢验收需明确选定歌曲。调研时没有改动“我喜欢”的数据源或正式收藏。后续实现与真实连接结果如下。

## 飞牛音乐授权与收藏对接（2026-11-07 实施）

- 同包新增 `features/xiaoai/fnos.mjs`，不新建安装包或公开管理端口。通过本机音乐Unix socket请求有限的API白名单；签名材料从已安装音乐前端的公开协议提取，不读取音乐数据库或已有用户token。NAS管理地址仅用于浏览器跳转，不作为后端可变代理目标。
- 播放模块增加 `GET /fnos/status`、UI专用 `POST /fnos/connect {nasOrigin}`、UI专用 `POST /fnos/disconnect`。connect以请求Origin构造固定回调地址，调用音乐公开配置确定clientId；NAS登录通过 `/signin`，音乐授权码通过 `/user/auth-login` 交换，再用 `/user/me`核验。
- 回调为已有DSH鉴权连接上的 `GET /api/pocket-kit/xiaoai/fnos/callback`，不是新的公共端口。随机state与HttpOnly/SameSite=Lax浏览器cookie绑定，10分钟有效、一次性使用；重新授权、断开、卸载使旧待授权流程失效。响应禁缓存、禁止Referrer、设置CSP，不回显code/token，并用history清除地址栏query。一次性code仍经过标准OAuth回调URL，不能承诺反向代理访问日志不记录URL；本插件不记录授权请求正文或响应秘密。
- 音乐token使用宿主 `ctx.credentials` 的grant记录 `pocket-kit/fnos-music` 保存；只返回安全账号信息，不回传token，不进入客户端持久化/普通集成配置。该授权由当前DSH所有者共享，不按会话或音箱隔离。断开仅清除插件grant，不登出用户其他音乐客户端或删除喜欢。Agent工具禁止发起授权、断开和调用回调（包含规范化路径绕过用例）。
- `collection` 在线实际部署固定使用飞牛喜欢源，增加 `favoritesSource:'fnos'`、`favoritesReady`、`favoritesTotal/favoritesError`；未授权/查询失败不回退到原本地收藏，但已保存歌曲照常可读。接入时未自动导入本地favorites；随后按用户要求彻底清除，见下节。PUT favorites复用原客户端入口，服务端按规范化绝对路径查询飞牛可访问曲库，重新确定唯一GUID，再执行create/delete；不信任客户端GUID或按歌名模糊匹配。CUE、多GUID同路径、库外或无权限歌曲拒绝写入。
- 喜欢列表按所选音箱目录筛选可播放歌曲，页面同时显示飞牛总数与可播放数；收藏播放重新读取飞牛列表，单曲点击带path防止列表顺序变化播放错误歌曲。分页每页300、最多100页，不接受不完整分页；网络有超时/响应上限，卸载及取消请求清理本实例连接。
- 我喜欢页面提供NAS地址、连接/检查/断开、弹窗被拦截时的授权链接。连接成功后账号设置折叠，不占据整页；所有授权动作由用户UI触发。无需CLI运行时，未改变已安装两个skill的登录态。
- `npm run verify` **148项通过**；隔离浏览器覆盖授权入口与回查、取消喜欢请求、失败保留状态；Node测试覆盖state/cookie/单次消费、断开及重新授权失效、分页、路径/GUID/CUE校验、签名、凭据不泄露、UI回调及Agent授权隔离，兼顾原播放功能。打包确认包含适配器，不包含私人数据、新测试或浏览器脚本。
- 实际部署时两台音箱均无当前播放或待播任务；重载小爱Host及客户端后重新启动两台worker，设备均已恢复WebSocket连接。用户在页面完成授权后，实际 `/fnos/status` 为connected，读取到 **29首飞牛喜欢歌曲，29首可在当前音箱曲库播放**。没有复制数据库token，没有为验收发起真实收藏增删或播放。
- 原GUI以移动UA/触屏复验320/375/390/430px、暗色和1440px桌面：均展示已连接账号与29首歌曲，无横向溢出、pageerror或Agent产生的业务写入，实际查看明暗截图。未授权回调HTTP401、已登录但伪造state回调HTTP400，真实授权状态不受伪造回调影响。用户随后明确告知真实使用验收已通过，不再重复进行真实收藏增删；真机Safari/软键盘与升级后的协议兼容性未作保证。

### 旧本地收藏彻底退役（按用户授权）

- 已清除插件本地的16首旧收藏，删除私密library中的favorites字段；播放列表与其他字段保持不变，未改飞牛收藏或凭据。源Allinone数据不在本次清理范围。
- 移除本地收藏默认值、持久化读写、收藏播放和“未挂载飞牛适配器时回落本地”的分支。初始化丢弃遗留favorites字段，后续保存列表不会重新写回；飞牛不可用时仅返回明确错误/不可用状态。
- 同步移除“旧收藏仍保留”的界面文案，已有回归用例改为检查退役字段不回写与无本地回退。仅做语法检查、客户端构建及16项隔离后端回归，不重复网页/真机或真实收藏写入验收。
- 在无当前播放/待播任务时短暂重载小爱Host清除旧进程内存，随后重新请求启动两台音箱服务，并重载客户端。私人数据及凭据不提交Git。
