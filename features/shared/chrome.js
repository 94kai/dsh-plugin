// Shared toolbox chrome, inlined into every client factory by scripts/build.mjs.
// Keep panel keys in sync with the registrations in features/*/client.js.
const KIT_HOME = 'pocket-kit.home';
const KIT_LAST_KEY = 'pocket-kit.last-panel.v1';
const KIT_PANELS = new Set([
  'pocket-kit.home',
  'pocket-kit.music',
  'pocket-kit.xiaoai',
  'pocket-kit.file-manager',
  'pocket-kit.health',
  'pocket-kit.beijing-pass',
  'pocket-kit.bill-manager',
  'shortcuts',
  'local.outing-checklist',
  // The native terminal entry is intentionally excluded: returning to it would
  // auto-open a terminal instead of restoring a normal toolbox page.
]);

function kitStorage() {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch { return null; }
}

function kitLastPanel() {
  try {
    const value = kitStorage()?.getItem(KIT_LAST_KEY);
    return typeof value === 'string' && KIT_PANELS.has(value) ? value : KIT_HOME;
  } catch { return KIT_HOME; }
}

function kitRememberPanel(id) {
  if (typeof id !== 'string' || !KIT_PANELS.has(id)) return;
  try { kitStorage()?.setItem(KIT_LAST_KEY, id); } catch {}
}

// The launcher opens the last normal toolbox page. A stale panel key (for
// example after unloading a feature) falls back to the toolbox home.
function kitOpenLast(ctx) {
  const target = kitLastPanel();
  try { ctx.layout.selectPanel(target); } catch { ctx.layout.selectPanel(KIT_HOME); }
}

function kitTrackLastPanel(ctx) {
  const store = ctx.layout?.panelInfo;
  if (!store?.getSnapshot) return;
  const sync = () => {
    const id = store.getSnapshot()?.activePanelId;
    if (typeof id === 'string') kitRememberPanel(id);
  };
  sync();
  return typeof store.subscribe === 'function' ? store.subscribe(sync) : undefined;
}

const KIT_NAV_CSS = `.kit-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;min-width:0}.kit-nav .kit-nav-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:8px 13px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;line-height:1.2;white-space:nowrap;cursor:pointer;box-shadow:0 1px 2px #0000000d;transition:background-color .15s,border-color .15s,box-shadow .15s,transform .15s}.kit-nav .kit-nav-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent)}.kit-nav .kit-nav-btn:active{transform:translateY(1px)}.kit-nav .kit-nav-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.kit-nav .kit-nav-btn-primary{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px #0000000d}.kit-nav .kit-nav-btn-primary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,var(--dsw-alias-bg-layer-1));border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 36%,transparent)}.kit-nav .kit-nav-btn svg{width:15px;height:15px;flex:none}.kit-nav-compact{justify-content:flex-end}@media(max-width:640px){.kit-nav{width:100%;justify-content:stretch;gap:7px}.kit-nav .kit-nav-btn{flex:1;min-height:44px;padding:9px 10px;font-size:12px}.kit-nav-compact{width:auto;flex:0 0 auto}.kit-nav-compact .kit-nav-btn{flex:0 0 auto;min-height:40px;padding:8px 12px}}@media(prefers-reduced-motion:reduce){.kit-nav .kit-nav-btn{transition:none}}`;

function KitChatIcon() {
  return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7A2.5 2.5 0 0 1 17.5 15H9l-5 4V5.5z' }),
    h('path', { d: 'M8 8h8M8 11h5' }));
}

function KitHomeIcon() {
  return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('path', { d: 'M4 10.5 12 4l8 6.5V20h-5v-5H9v5H4z' }));
}

function KitNavActions({ chat, home, compact = false, primary = 'home' }) {
  return h(React.Fragment, null,
    h('style', null, KIT_NAV_CSS),
    h('div', { className: 'kit-nav' + (compact ? ' kit-nav-compact' : ''), role: 'group', 'aria-label': '页面导航' },
      chat ? h('button', { type: 'button', className: 'kit-nav-btn' + (primary === 'chat' ? ' kit-nav-btn-primary' : ''), onClick: chat, 'aria-label': '返回会话' }, h(KitChatIcon), h('span', null, '返回会话')) : null,
      home ? h('button', { type: 'button', className: 'kit-nav-btn' + (primary !== 'chat' ? ' kit-nav-btn-primary' : ''), onClick: home, 'aria-label': '返回首页' }, h(KitHomeIcon), h('span', null, '返回首页')) : null));
}
