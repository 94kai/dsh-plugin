# 快捷访问

## 用途与入口

显示私人书签，支持新标签页打开、详情备注和复制。侧栏底部 `sidebar.footer.action` 条目 `shortcuts` 打开“随身工具箱”菜单，详情页仍叫“快捷访问”；主面板 key 为 `shortcuts`，详情页可返回对话。

菜单声明 root 范围 list 插槽 `local.shortcuts.menu.action`，传入 `closeMenu()` 和 `itemClassName`。测速按钮使用该插槽；新增菜单动作关闭菜单后再执行，使用 `role="menuitem"`、`tabIndex={-1}` 保持导航一致。

## API 与数据

- `GET /api/shortcuts/bookmarks`：返回 `{ items }`，缺失文件返回空数组；畸形内容或其他读取失败返回 500 `{ error }`。经 DSH Connection 鉴权，不缓存响应。
- 书签位置为根目录 `.local/bookmarks.json`，只在后端读取。1.0.0 迁移保留内容字节一致并设为 0600，详见[迁移记录](../migration.md)。
- JSON 顶层数组，稳定且唯一的 `id`、非空 `title`、`url` 为必要展示字段。API 只返回白名单字段，另可含 `description`、`notes`、`color`、受限的 base64 图片 `iconDataUrl`。URL 仅允许 HTTP(S)，拒绝 URL 内用户名/密码；未知字段不发往客户端。
- API 将内容发送到已登录浏览器；备注不得存密码、令牌或其他秘密。`.local/` 需要同时 Git 忽略与打包排除。

### 图标兼容

支持 base64 内嵌 PNG、JPEG、WebP、GIF、SVG，以及 ICO 的 `image/x-icon` / `image/vnd.microsoft.icon` MIME。1.0.1 修复了合包白名单遗漏 ICO 导致飞牛书签图标消失的问题；不要只按常见位图扩展名过滤浏览器本来支持的 favicon。回归测试覆盖两种 ICO MIME。原图标字节保持不变，不把私人图标写入公开测试夹具。

## 决策与生命周期

只读书签文件，不提供后台写书签接口。独立业务模块与统一工具包入口并存，不复制一套测速导航。主面板 / 菜单 UI 保留原标识以避免包改名破坏导航。

客户端获取数据使用 AbortController，卸载取消请求；菜单监听 popover toggle、resize 并清理，支持 Escape、方向键、Home/End。复制失败提供手工选择提示。未来修改应继续处理关闭后焦点恢复、请求过期及卸载后的状态更新。

## 验证与限制

合包验证已覆盖书签展示字段白名单、协议限制及统一客户端注册，具体结果见[迁移记录](../migration.md)。真实浏览器仍需刷新后检查入口和交互。后端独立停用时，统一客户端仍显示入口并报不可用。

回归重点：缺失/无效书签、空数组、加载失败重试、长标题和备注、复制失败、新标签页安全、菜单扩展及键盘导航；320/375/390/430px、44px 触控和 safe area 按[移动规范](../mobile.md)检查。已添加移动触控适配，但样式测试不等于视觉验证。
