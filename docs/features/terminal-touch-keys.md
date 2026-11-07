# 右侧原生终端辅助按键

## 目的与入口

自 Pocket Kit 1.4.0 起，功能位于 `features/terminal-touch-keys/`，与当前 `@local/pocket-kit` 共用唯一客户端构建与安装包，不再独立安装。直接为DSH右侧原生终端添加Esc、单个方向按钮、Ctrl+C；按键栏不创建终端、不结束原有会话，左侧快捷入口仅在没有可复用终端时委托DSH原生创建。旧独立包已卸载，源码归档至忽略的.local/legacy-plugins供回滚。

## 接入与兼容决定

实查当前0.2.2-rc.1终端只有body/title注册，没有按键栏扩展槽。为避免替换整套终端或读取其他组件DOM，先用bridge.mjs给已安装的内置Client产物增加一个子Slot：`local.terminal.touch.keys`（list/session），owner props是`enabled:boolean`及`sendKey(key):boolean`。六种键名是left/up/down/right/escape/interrupt，不允许任意字符串写入。

桥保留原xterm与model的生命周期，方向键依据application cursor mode使用CSI/SS3，控制键走原xterm.input→onData→model.write。断开、隐藏、只读、进程结束时禁止发送，也不自动夺取输入权。纯用户终端键盘不开放为Agent工具，以免绕过Agent命令审批。

这是**本机兼容补丁，不是上游正式API**。脚本检查精确上下文、备份原产物并拒绝不匹配版本；原产物位于.local/terminal-touch-bridge，发布包不含备份。DSH升级后可能需要重新适配；source map未重生成。桥脚本现在位于本功能目录。回滚桥时先停用当前工具箱的客户端载体，将.local/terminal-touch-bridge中的对应original备份恢复到记录的同版本安装路径，再刷新页面；不要把旧版本备份覆盖到升级后的DSH。停用客户端载体不结束DSH原生终端进程。

## 手势与移动端

按钮至少44px，可换行，使用DSH主题变量，底部安全区留白。方向按钮边缘点按发送一步，中心不发送；按住按钮拖动，每22px发一步，每次事件最多4步。无长按连发定时器；pointercancel、失去捕获、停用或卸载清理手势状态。抑制拖动后的额外click，并保留键盘激活按钮的能力。pointerdown阻止按钮夺焦，避免主动关闭手机键盘；真机效果待验证。

## 验证（2026-11-07）

- 三个Client产物语法检查通过。
- `node --test addons/terminal-touch-keys/keys.test.mjs`：9项通过，覆盖六键编码、application cursor mode、失去控制权/断连、任意命令拒绝、拖动死区和限速、无全局DOM劫持/连发计时器。测试只调用隔离逻辑，未向用户真实终端发送字符。
- 安装返回application: applied、warnings=[]。pnpm提示其他已有插件的peer依赖问题，未改动这些插件。
- 当前页面需要刷新后加载内置桥。初次Inspect时新Slot尚不可用；不能以安装成功代替终端视觉和交互验收。
- 未完成320/375/390/430px、软键盘和Vim等真实应用测试。Ctrl+C可能中断程序，请在可安全中断的会话试用。

## 1.1.0 更新与安装

用户刷新后明确确认初版按键栏已显示；按要求将四键合并为单个84×76px方向按钮，保留四向拖动与边缘点按。增加左侧工作区上方原生终端按钮，使用新的local.sidebar.before-workspaces（list/root，wide属性）桥槽。控制器契约来自当前安装包service.d.ts：commandTarget、tabsIn、active、isExpanded、toggleExpanded、focus、openTabFromTarget；不访问私有存储、不新建替代终端。已有终端优先复用，无终端才调用DSH原生创建，没有当前可用会话时提示用户选择。

安装1.1.0返回application: applied、warnings=[]。新增测试覆盖单按钮中心死区/四向点按、复用现有终端、委托原生创建、无会话拒绝。最终Client Inspect已确认local.sidebar.before-workspaces中的native-terminal-launcher与local.terminal.touch.keys中的terminal-touch-keys均active；未向真实终端发送测试字符，真机点击/滑动与软键盘保持仍待用户验收。

## Pocket Kit 1.4.0：合包、键盘避让与紧凑方向按钮

- 终端按键和左侧原生终端入口由根包统一构建，不增加新的Host或客户端安装条目。独立@local/terminal-touch-keys通过plugin_manager卸载，旧代码归档，不清除任何终端会话或数据。AGENTS明确默认单包迭代，除非用户强调独立插件。
- 方向按钮改为44×44px，与其他按键同高；使用24px四向SVG图标，保留22px拖动步距、边缘单步与中心死区。
- 软键盘避让由viewport.js负责。监听visualViewport.resize/scroll及窗口resize/orientationchange，比较自己拥有的按键容器与visualViewport的底边，用margin-bottom预留真实键盘遮挡空间。原终端flex屏幕缩小后由DSH自己的ResizeObserver重新适配网格，不覆盖终端内容、不全局修改页面高度、不读取其他插件DOM。
- 计算时扣回已应用的偏移，避免事件重复累积导致栏位越抬越高；宿主已随键盘缩高时不重复上抬。忽略缩放手势，缺少visualViewport时回退window.innerHeight。卸载取消帧、断开观察器、移除监听并清理本组件样式。
- `npm run verify`：118项通过，包括14项终端按键/原生入口/键盘视口回归。键盘弹出、收起、视口平移、重复事件不漂移、宿主已缩高、缩放忽略和卸载清理均有隔离逻辑测试。
- 真机软键盘可视范围仍需用户验证；不将数字几何测试当成手机浏览器验收。部分不报告可视视口变化的旧浏览器无法保证键盘避让。

### 1.4.0 安装记录

plugin_manager已移除独立包并应用根包1.4.0（application: applied、warnings=[]）。Host Config目录确认@local/terminal-touch-keys条目为0；重装后Client需刷新，最初两处桥Slot查询不可用，不以此推断真实页面未更新。当前手机键盘避让视觉仍待用户反馈。

## 1.5.0 事故与1.5.1恢复（2026-11-07，以本节为当前状态）

1.5.0尝试隐藏专用会话和独立原生渲染适配，导致内置 `dsh-client-ui-sidebar-terminal` 激活失败，Web boot中止。此前语法/单元/安装成功没有覆盖真实框架激活，这是验证缺口，不能视为功能验收。导致失败的新增适配已撤回；目前没有取得浏览器异常堆栈，不将猜测的Slot冲突当成已证实根因。

- 用带SHA256校验的修改前备份恢复内置terminal客户端主产物及workspace列表产物；用户确认原GUI可启动。原本已确认能用的辅助按键桥保留，未还原整个npx安装、未删除会话文件、未重置profile。
- 删除根Host的隐藏会话入口挂载，禁用故障桥脚本，故障适配/后端不再进入发布包。隐藏会话方案明确暂停，不再宣称已完成。若此前已经创建过专用会话，不自动删除其数据。
- 第一版回滚留下了仍指向已撤回适配的面板，导致白屏；随后移除这项依赖并加错误提示。用户反馈“显示请选择会话”后，又修复了第二处时序问题：先恢复Conversation，再等待右侧Session目标挂载（最多12动画帧），然后委托原生终端打开。新的用户导航或插件卸载会取消等待，不晚到打开另一个会话的终端。
- 当前左侧终端使用宿主标准sidebar.panellist条目，order=20，位于更多之前；不再使用自绘带边框Launcher。仍复用**当前会话**的DSH原生终端，无当前会话时明确提示，不私自新建聊天或隐藏会话。
- 44px单方向按钮、Esc、Ctrl+C和键盘避让保留。现有会话终端优先复用，没有才调用原生新建；关闭全局面板不主动结束终端。
- `npm run verify`：127项通过；增加面板目标延迟可用、复用/新建分支、导航取消和无会话显式失败测试。
- 已在原web profile安装1.5.1，application: applied、warnings=[]。用户最终实页回答“正常打开终端”，这是本次入口恢复验收；不是对隐藏会话方案的验收。

后续禁止重新运行dedicated-bridge.mjs。若继续隐藏会话，应先重新设计受支持的边界，并在独立测试环境验证内置插件完整启动，不能直接在当前npx安装上实验。

## 1.5.2 紧凑按键栏

按用户要求移除按键下方的全部可见提示（含手势说明/不可输入说明），只保留Esc、方向按钮和Ctrl+C。保留aria-label和禁用状态；断连或只读状态仍由DSH原终端自身显示，按键不自动夺取控制权。去掉title工具提示，减少多余提示。

按钮高度从44px改为36px，最小宽度44px；方向按钮44×36px。上下留白从8px改4px，移除提示行后整体显著缩矮。这里按用户明确要求例外缩小触控高度，不声称满足默认44×44移动规范；其他控件标准不变。键盘避让及手势步距保持，不修改任何内置产物。

无当前会话仍显示选择/新建会话提示，不自动创建会话或PTY，隐藏会话方案保持撤回。

`npm run verify`：128项通过（新增紧凑样式、无提示、可访问名称和禁用状态回归）。本次仅重新启用当前根客户端载体，返回application: applied、warnings=[]；没有卸载其他业务Host。Client Inspect当前未取得按键Slot，真实手机效果需刷新后查看，不能当作已完成视觉验收。

## 1.6.0：取消自动命令、工具箱复用原生终端

用户取消自动执行`t`功能；该功能没有部署，源码改动已撤回，实验文件归档到.local，当前构建不含启动命令或相关回调。

工具箱「终端」卡片现在由terminal-touch-keys工厂贡献，id为pocket-kit.native-terminal，与左侧条目复用同一main入口及原生导航方法。旧pocket-kit.terminal卡片/视图/Host/API/Agent工具退役，旧源码归档到.local；原tmux会话与terminal.json不删除。包不再导出或发布features/terminal，patch移除pocket-kit-terminal。客户端与后端仍同属当前安装包。

当前依旧需要可用的聊天会话，不自动创建隐藏会话；已有终端只聚焦，不执行t。36px按键和键盘避让不变。未修改DSH内置文件。

### 1.6.0 验证与安装

- `npm run verify`：128项通过；打包检查确认features/terminal、自动startup代码、.local私人数据均不在发布包。
- 安装过程中已有dshmarket的GitHub源触发prepare失败（tsc缺失），不是工具箱构建失败。经用户明确批准，通过plugin_manager将dshmarket改为同版本1.73.14 npm发布包，未升级、未手工重写profile、未删除市场数据；安装返回applied。
- 重新安装当前根包1.6.0返回application: applied、warnings=[]。Host Config确认旧@local/pocket-kit/terminal条目为0。
- 安装后初次Client Inspect尚未取得工具箱Slot，仍需刷新原GUI检查卡片。单元注册测试确认原生终端卡片唯一、与侧栏共用panel；不将注册测试等同于真实点击验收。

## 仅保留工具箱入口（2026-11-07）

按用户要求移除sidebar.panellist中的独立终端条目。工具箱终端卡片、pocket-kit.native-terminal主入口、原生导航时序、36px按键与键盘避让保持不变；不结束现有终端或修改会话数据。不改宿主文件、不卸载整包，仅构建并重新加载根客户端载体。相关注册回归确保侧栏终端为0、工具箱终端仍唯一。构建与18项针对性测试通过；根客户端载体重新启用返回applied，实时Inspect确认侧栏已无终端条目、工具箱仍有终端卡片。未卸载业务Host或操作用户终端。
