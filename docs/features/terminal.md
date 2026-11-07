# 终端（1.6.0 起统一复用 DSH 原生终端）

## 当前入口

- 工具箱「终端」卡片与左侧栏「终端」条目共用 `pocket-kit.native-terminal` 入口。
- 原生终端位于DSH右侧面板，已有当前会话终端则直接展开/聚焦，没有时委托DSH原生新建。
- 不自动执行`t`或其他命令；本次自动命令实验在部署前已取消。没有可用会话时提示选择/新建会话，不创建隐藏会话。
- Esc、单方向按钮、Ctrl+C及键盘避让仍由当前插件提供。按键36px高、无下方提示行。详细边界见[原生终端按键](terminal-touch-keys.md)。

## 已移除的轻量终端

原 `features/terminal/` 文本快照页面与后端已移出运行代码，归档在忽略的 `.local/legacy-plugins/terminal-lightweight-1.5.2/`，不进入Git和发布包。

以下旧标识已退役：

- `pocket-kit.terminal` 主面板与工具卡片。
- `pocket-kit-terminal` Host条目与`@local/pocket-kit/terminal`导出。
- `POST /api/pocket-kit/terminal`管理路由与`pocket_terminal`模型工具。

当前不再创建、读取或写入轻量终端自己的屏幕快照，不再有1.5秒轮询。其他功能不受本次退役影响。

## 数据与生命周期

没有删除 `.local/data/terminal.json`，也没有关闭原 `allinone-` tmux会话或删除其进程。退役只停止轻量模块自身正在运行的短期子命令/请求，不销毁tmux服务器里的用户会话。原生终端和tmux的保留/关闭策略由各自原有机制负责。

工具箱卡片只触发导航；终端创建、输入和控制权仍走原生DSH接口，不另开端口、不修改宿主内置文件、不增加独立插件。

## 验证记录

新增合包回归确认只有一张原生终端工具卡片、指向与侧栏相同的panel，构建不含createTerminalView或自动t逻辑，manifest和patch不再导出/挂载旧Host。完整命令结果及运行注册见[原生终端记录](terminal-touch-keys.md)。没有向用户真实终端发送测试字符，移动布局和工具箱点击需实页验证。
