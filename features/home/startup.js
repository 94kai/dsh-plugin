function trackHomeOpen(ctx, panel = 'pocket-kit.home') {
  const store = ctx.layout?.panelInfo;
  if (typeof store?.subscribe !== 'function') return;
  // 不同步初始快照：宿主启动时的Conversation不是用户主动关闭，不能覆盖旧记录。
  return store.subscribe(() => {
    const id = store.getSnapshot()?.activePanelId;
    const open = id === panel || (typeof KIT_PANELS !== 'undefined' && KIT_PANELS.has(id));
    try { window.localStorage?.setItem('pocket-kit.home.open.v1', String(open)); } catch {}
  });
}

// 裸入口按上次工具箱开关状态展示首页，不改变或释放当前Session。
function mountHomeStartup(ctx, panel = 'pocket-kit.home') {
  const noop = () => {};
  if (typeof window === 'undefined' || typeof document === 'undefined') return noop;
  const key = Symbol.for('pocket-kit.home.startup.v1');
  const previous = window[key];
  if (previous?.document === document) return noop;
  // 即使本次跳过也消费机会；卸载绝不删除，避免热更新反复抢页。
  const state = { document, reason: 'pending' };
  try { window[key] = state; } catch { return noop; }
  const attempt = () => {
    try {
      const current = new URL(window.location.href);
      const explicitBase = typeof document.querySelector === 'function' ? document.querySelector('base[href]') : undefined;
      const base = new URL(explicitBase || typeof document.querySelector !== 'function' ? document.baseURI : '/', current);
      // 不读取查询参数值；任何查询/fragment/非入口路径都保守视为显式导航。
      if (current.origin !== base.origin || current.pathname !== base.pathname || current.search || current.hash) {
        state.reason = 'explicit-location'; return noop;
      }
      try {
        if (window.localStorage?.getItem('pocket-kit.home.open.v1') === 'false') {
          state.reason = 'remembered-closed'; return noop;
        }
      } catch {}
      const layout = ctx.layout;
      if (!layout?.panelInfo?.getSnapshot || typeof layout.selectPanel !== 'function') {
        state.reason = 'layout-unavailable'; return noop;
      }
      if (layout.panelInfo.getSnapshot().activePanelId != null) {
        state.reason = 'existing-panel'; return noop;
      }
      // 未记录或上次开启时展示首页；不触碰Session引用。
      layout.selectPanel(panel);
      state.reason = 'selected';
    } catch {
      // Slot注册/布局生命周期竞态时不重试，更不能在用户稍后操作后抢页。
      state.reason = 'unavailable';
    }
    return noop;
  };
  if (typeof ctx.effect === 'function') ctx.effect(attempt);
  else attempt();
  return noop;
}
