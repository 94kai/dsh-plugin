// 显式入口参数决定本次是否展示首页：?toolbox=1 固定展示，?toolbox=0 固定不展示。
// 不带参数时沿用上次状态，保持原有无参数入口的行为。
function forcedHomeStartup() {
  try {
    const value = new URL(window.location.href).searchParams.get('toolbox');
    return value === '1' ? 'open' : value === '0' ? 'closed' : null;
  } catch { return null; }
}

// ?toolbox=1 的独立入口只展示工具页面：只保留包含全局面板的中心列，隐藏框架其余区域
// （侧栏开关、右上角入口、右栏、底部行、浮层）和面板顶部留白；面板关闭后恢复。
// 不改宿主文件、不读写宿主存储，只在当前 document 上标记元素。
function mountImmersiveChrome() {
  const noop = () => {};
  if (typeof window === 'undefined' || typeof document === 'undefined') return noop;
  let immersive = false;
  try { immersive = new URL(window.location.href).searchParams.get('toolbox') === '1'; } catch { return noop; }
  if (!immersive) return noop;
  const key = Symbol.for('pocket-kit.chrome.v1');
  if (window[key]?.document === document) return noop;
  const style = document.createElement('style');
  style.dataset.pocketKitChrome = '';
  style.textContent = 'html.pk-immersive [data-pk-immersive]{display:none!important}html.pk-immersive [data-pk-frame]{grid-template-columns:0 minmax(0,1fr) 0!important}html.pk-immersive [data-global-panel]{padding-top:0!important}';
  document.head.append(style);
  const hidden = new Set();
  let frameNode = null;
  let frame = 0;
  let timer = 0;
  const sweep = () => {
    const panel = document.querySelector('[data-global-panel]');
    document.documentElement.classList.toggle('pk-immersive', panel !== null);
    const next = new Set();
    if (panel !== null) {
      const chrome = document.querySelector('[data-shell-overlay]') ?? document.querySelector('[data-shell-leading]');
      const host = chrome?.parentElement;
      if (host !== undefined && host !== null && host.contains(panel)) {
        if (frameNode !== host) {
          if (frameNode !== null && frameNode.isConnected) frameNode.removeAttribute('data-pk-frame');
          frameNode = host;
        }
        host.setAttribute('data-pk-frame', '');
        // 宿主框架里与中心列并列的区域整体隐藏，避免顶部条带的按钮时有时无。
        let top = panel;
        while (top.parentElement !== null && top.parentElement !== host) top = top.parentElement;
        for (const child of host.children) if (child !== top) next.add(child);
      }
      for (const node of document.querySelectorAll('button,[role="button"],a')) {
        if (panel.contains(node) || node.closest('[data-pk-immersive]') !== null) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.height <= 48 && rect.top >= 0 && rect.top < 56) next.add(node);
      }
    }
    for (const node of hidden) if (!next.has(node)) { node.removeAttribute('data-pk-immersive'); hidden.delete(node); }
    if (panel === null && frameNode !== null) { frameNode.removeAttribute('data-pk-frame'); frameNode = null; }
    for (const node of next) if (!hidden.has(node)) { node.setAttribute('data-pk-immersive', ''); hidden.add(node); }
  };
  const schedule = () => { if (frame === 0) frame = requestAnimationFrame(() => { frame = 0; sweep(); }); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-global-panel'] });
  schedule();
  // 重新渲染可能只改类名不增删节点：低频复查，保证顶部入口不会偶发露出来。
  timer = setInterval(sweep, 700);
  try { window[key] = { document }; } catch { return noop; }
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    clearInterval(timer);
    style.remove();
    document.documentElement.classList.remove('pk-immersive');
    for (const node of hidden) node.removeAttribute('data-pk-immersive');
    hidden.clear();
    if (frameNode !== null) { frameNode.removeAttribute('data-pk-frame'); frameNode = null; }
  };
}

function trackHomeOpen(ctx, panel = 'pocket-kit.home') {
  // 固定入口只决定本次导航，不覆盖“上次是否开启”，两个 URL 互不影响。
  if (forcedHomeStartup() !== null) return;
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
  const forced = forcedHomeStartup();
  const attempt = () => {
    try {
      const layout = ctx.layout;
      if (!layout?.panelInfo?.getSnapshot || typeof layout.selectPanel !== 'function') {
        state.reason = 'layout-unavailable'; return noop;
      }
      if (forced === 'open') {
        // 参数入口无条件进入首页，覆盖上次状态和已恢复的面板。
        layout.selectPanel(panel);
        state.reason = 'forced-open'; return noop;
      }
      if (forced === 'closed') { state.reason = 'forced-closed'; return noop; }
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
