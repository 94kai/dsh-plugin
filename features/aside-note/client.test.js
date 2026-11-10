import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const scope = { kind: 'session', id: 'fixture-session' };
const base = () => ({ revision: 0, items: [{ id: 'fixture-note', text: '测试文本', done: false, createdAt: 100, updatedAt: 100 }], draft: { add: '', edits: {} }, forwarded: {}, seededSessionIds: [], preferences: { revision: 0, scopeMode: 'session', sendShortcut: 'enter', forwardPrefix: '请继续：', panelWidth: 360, panelHeight: 0, sections: { open: true, done: false } } });
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)] : [];
const cls = (tree, name) => nodes(tree).find(node => node.props.className?.split(' ').includes(name));
async function harness(t, { effects = false } = {}) {
  let source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
  const modelSource = (await readFile(new URL('./client-model.js', import.meta.url), 'utf8')).replace(/^export /gm, '');
  const ui = await readFile(new URL('./original-ui.js', import.meta.url), 'utf8'), css = await readFile(new URL('./original.css', import.meta.url), 'utf8');
  source = source.replace('/* NOTES_MODEL */', () => modelSource).replace('/* NOTES_ORIGINAL_UI */', () => ui).replace("/* NOTES_ORIGINAL_CSS */ ''", () => JSON.stringify(css)).replace("      ctx.slots.inject('conversation.session.header.utilities'", "      globalThis.notesTest = {model, open, scopeFor, ScopeSwitch, ScopeVisibilitySettings, EmptyState, Panel, Header, HeaderButton, HeaderGlyph, Overlay, TodoRow, PanelHead, ComposerForm, NoteList, SettingsPanel, usePanelGeometry, memoPopoverStyle, forwardToComposer, say, css};\n      ctx.slots.inject('conversation.session.header.utilities'");
  const stores = new Map(), pendingEffects = [], cleanups = [], calls = [], eventListeners = new Map(), timers = new Map();
  let current, cursor, plugin, record = base(), timerId = 0;
  const listeners = name => { if (!eventListeners.has(name)) eventListeners.set(name, new Set()); return eventListeners.get(name); };
  const style = { userSelect: 'text', cursor: 'default' };
  const body = { style };
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const key = cursor++; if (!(key in current)) current[key] = typeof initial === 'function' ? initial() : initial; const saved = current; return [saved[key], value => { saved[key] = typeof value === 'function' ? value(saved[key]) : value; }]; },
    useRef(initial) { return current[cursor++] ||= { current: initial }; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn) { const key = cursor++; if (effects && !current[key]) { current[key] = true; pendingEffects.push(fn); } },
    useLayoutEffect(fn) { this.useEffect(fn); },
    useSyncExternalStore(_subscribe, get) { cursor++; return get(); },
  };
  const win = { innerWidth: 390, innerHeight: 844, __ModuleLoader__: { load: value => { plugin = value; } }, confirm: () => false,
    addEventListener: (name, fn) => listeners(name).add(fn), removeEventListener: (name, fn) => listeners(name).delete(fn),
    setInterval: fn => { timers.set(++timerId, fn); return timerId; }, clearInterval: id => timers.delete(id),
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  };
  const context = vm.createContext({ console, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, window: win,
    document: { baseURI: 'https://example.test/', body, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    navigator: { platform: 'Linux', clipboard: { writeText: async () => {} } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    fetch: async (_url, options) => {
      if (options.method === 'POST') {
        const command = JSON.parse(options.body); calls.push(command);
        if (command.action === 'add') record = { ...record, revision: record.revision + 1, items: [...record.items, { ...record.items[0], id: 'new', text: command.text }], draft: { ...record.draft, add: '' } };
        if (command.action === 'forward') record = { ...record, revision: record.revision + 1, forwarded: command.forwarded ? { 'fixture-note': true } : {} };
        if (command.action === 'delete') record = { ...record, revision: record.revision + 1, items: [] };
      }
      return Response.json(record);
    },
  });
  vm.runInContext(source, context);
  plugin.factory(name => name === 'react' ? React : name === 'react-dom' ? { createPortal: node => node } : {}).apply({ slots: { inject: (_slot, fn) => fn(), register: () => () => {} }, effect: fn => cleanups.push(fn()) });
  t.after(() => cleanups.reverse().forEach(fn => fn?.()));
  const api = context.notesTest; await api.model.load(scope);
  function render(Type, props, key = Type) { if (!stores.has(key)) stores.set(key, []); current = stores.get(key); cursor = 0; const result = Type(props); while (pendingEffects.length) cleanups.push(pendingEffects.shift()()); return result; }
  return { ...api, calls, window: win, body, eventListeners, timers, render, unmount: () => cleanups.splice(0).reverse().forEach(fn => fn?.()), panel: binding => render(api.Panel, { scope, binding, anchorRef: { current: null }, onClose() {} }), setRecord: value => { record = value; } };
}

test('upstream CSS parity is exact after namespace isolation and loading-selector confinement', async () => {
  const css = await readFile(new URL('./original.css', import.meta.url), 'utf8');
  const source = JSON.parse(await readFile(new URL('./original-source.json', import.meta.url), 'utf8'));
  const original = css.replaceAll('.pk-an-iconBtn[data-loading="true"]', '[data-loading="true"]').replaceAll('pk-an', 'dsh-an').replaceAll('--pkan-', '--an-');
  // Upstream includes an extra blank EOF line; restore it only for byte parity.
  assert.equal(createHash('sha256').update(original + '\n').digest('hex'), source.cssSha256);
  for (const rule of ['width:28px;height:28px', 'top:-2px;right:-2px', 'min-width:16px;height:16px', 'width:24px;height:24px', '--dsw-radius-panel', '--dsw-elevation-panel']) assert.ok(css.includes(rule));
  assert.doesNotMatch(css, /^\[data-loading/m);
});
test('header uses original document glyph and count badge: zero hidden, one visible, 99+ capped', async t => {
  const app = await harness(t);
  for (const [count, expected] of [[0, null], [1, '1'], [99, '99'], [100, '99+']]) {
    const button = app.render(app.HeaderButton, { count, active: true, kind: 'session' });
    assert.equal(button.props.className, 'pk-an-headerBtn'); assert.equal(button.props['data-active'], 'true');
    const badge = cls(button, 'pk-an-headerCount'); assert.equal(badge?.children[0] ?? null, expected);
    assert.equal(button.children[0].type, app.HeaderGlyph);
  }
  const glyph = app.render(app.HeaderGlyph, {});
  assert.match(glyph.props.dangerouslySetInnerHTML.__html, /M3\.25 2\.75h6\.5l3 3v7\.5/);
  assert.match(glyph.props.dangerouslySetInnerHTML.__html, /width="16" height="16"/);
});
test('settings omit about details but retain shortcut, prefix and data maintenance', async t => {
  const app = await harness(t); let opened = false;
  const settings = app.render(app.SettingsPanel, { say: app.say, sendShortcut: 'enter', chooseShortcut() {}, forwardPrefix: '', changeForwardPrefix() {}, prefixRef: { current: null }, onDataTools: () => { opened = true; } });
  const text = nodes(settings).flatMap(node => node.children.filter(value => typeof value === 'string')).join(' ');
  assert.doesNotMatch(text, /关于|版本|作者|源代码|github/);
  assert.ok(text.includes('发送快捷键')); assert.ok(text.includes('一键转发'));
  assert.equal(nodes(settings).some(node => node.type === 'a'), false);
  nodes(settings).find(node => node.type === 'button' && node.children.includes('数据与迁移')).props.onClick();
  assert.equal(opened, true);
});
test('panel preserves upstream hierarchy, original compact composer, sections and inline actions', async t => {
  const app = await harness(t), panel = app.panel({});
  assert.equal(panel.props.className, 'pk-an-popover pk-an-popoverRight');
  assert.equal(panel.props.style.width, '360px'); assert.equal(panel.props.style.right, '12px');
  const children = panel.children.filter(Boolean);
  assert.deepEqual(children.slice(0, 2).map(node => node.props.className), ['pk-an-resizeHandle', 'pk-an-resizeHandleBottom']);
  assert.equal(children[2].type, app.PanelHead); assert.equal(children[3].type, app.ComposerForm); assert.equal(children[4].type, app.NoteList);
  const head = app.render(app.PanelHead, children[2].props);
  assert.equal(cls(head, 'pk-an-popClose'), undefined);
  assert.equal(nodes(head).filter(node => node.type === 'button').length, 1);
  assert.ok(cls(head, 'pk-an-settingsBtn'));
  assert.equal(cls(head, 'pk-an-popTitle').children[0], '旁边记'); assert.equal(cls(head, 'pk-an-popMeta').children[0], '1 未完成 · 1 条');
  const list = app.render(app.NoteList, children[4].props);
  assert.ok(cls(list, 'pk-an-listViewport')); assert.ok(cls(list, 'pk-an-listArea')); assert.ok(cls(list, 'pk-an-rows'));
  assert.ok(!nodes(panel).some(node => node.children?.includes('迁移原插件浏览器数据')));
});
test('original composer writes server draft/add contract and keeps longer existing text editable', async t => {
  const app = await harness(t);
  let component = app.panel({}).children.find(node => node?.type === app.ComposerForm);
  let form = app.render(component.type, component.props);
  const target = { value: '新增输入', style: {}, scrollHeight: 20 };
  cls(form, 'pk-an-input').props.onChange({ target });
  component = app.panel({}).children.find(node => node?.type === app.ComposerForm); form = app.render(component.type, component.props);
  assert.equal(cls(form, 'pk-an-input').props.maxLength, 10000);
  form.props.onSubmit({ preventDefault() {} }); form.props.onSubmit({ preventDefault() {} });
  await app.model.entry(scope).chain;
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0].action, 'add'); assert.equal(app.calls[0].revision, 0); assert.equal(app.calls[0].text, '新增输入');
  assert.equal(app.model.snapshot(scope).draft.add, '');
});
test('upstream row icons and forwarded checkmark retain safe public composer insertion', async t => {
  const app = await harness(t), inserted = [];
  const binding = { active: true, input: { draft: '已有输入', draftRev: 7, phase: 'plain' }, inputActions: { insertText: (value, span) => { inserted.push({ value, span }); return true; }, persistDraft() {}, submit() { assert.fail('must not submit'); }, setDraft() { assert.fail('must not replace'); } } };
  let list = app.panel(binding).children.find(node => node?.type === app.NoteList);
  let component = list.props.row(list.props.openItems[0]);
  let row = app.render(component.type, component.props);
  assert.deepEqual(nodes(row).filter(node => node.props.className?.includes('pk-an-iconBtn')).map(node => node.props['aria-label']), ['复制', '转发到会话', '编辑', '删除']);
  nodes(row).find(node => node.props['aria-label'] === '转发到会话').props.onClick();
  await app.model.entry(scope).chain;
  assert.equal(inserted[0].value, '\n- 测试文本'); assert.deepEqual(JSON.parse(JSON.stringify(inserted[0].span)), { start: 4, end: 4, draftRev: 7 });
  list = app.panel(binding).children.find(node => node?.type === app.NoteList); component = list.props.row(list.props.openItems[0]); row = app.render(component.type, component.props);
  assert.ok(cls(row, 'pk-an-forwardMark')); assert.equal(app.calls[0].action, 'forward');
});
test('global switch is shared across bindings, visible without a workspace and usable without a session', async t => {
  const app = await harness(t), changes = [];
  const renderSwitch = canUseWorkspace => app.render(app.ScopeSwitch, { say: app.say, mode: 'global', canUseWorkspace, onChange: value => changes.push(value) });
  let buttons = nodes(renderSwitch(true)).filter(node => node.type === 'button');
  assert.deepEqual(buttons.map(node => node.children[0]), ['全局', '工作区', '会话']);
  assert.equal(buttons[0].props['aria-pressed'], true); buttons[0].props.onClick(); assert.deepEqual(changes, ['global']);
  assert.deepEqual(nodes(renderSwitch(false)).filter(node => node.type === 'button').map(node => node.children[0]), ['全局', '会话']);
  const a = app.scopeFor({ sessionId: 'a', workspace: { workspaceId: 'one' } }, 'global');
  const b = app.scopeFor({ sessionId: 'b', workspace: { workspaceId: 'two' } }, 'global');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), { kind: 'global', id: 'all' }); assert.deepEqual(a, b);
  await app.model.load(a); app.model.setPreferences({ scopeMode: 'global' });
  const header = app.render(app.Header, { sessionId: 'other-session' }).children.find(node => node?.type === app.HeaderButton);
  assert.equal(header.props.kind, 'global'); assert.equal(header.props.count, 1);
  app.open(null);
  const overlay = app.render(app.Overlay, {}), panel = overlay.children.find(node => node?.type === app.Panel);
  assert.equal(panel.props.scope.kind, 'global'); assert.equal(panel.props.scope.id, 'all');
});
test('visible scope settings require one option and hide single available tab', async t => {
  const app = await harness(t), onlySession = { session: true, workspace: false, global: false }, onlyWorkspace = { session: false, workspace: true, global: false };
  assert.equal(app.render(app.ScopeSwitch, { say: app.say, visibleScopes: onlySession, canUseSession: true, canUseWorkspace: true }), null);
  assert.equal(app.render(app.ScopeSwitch, { say: app.say, visibleScopes: onlyWorkspace, canUseSession: true, canUseWorkspace: false }), null);
  const changes = [], controls = app.render(app.ScopeVisibilitySettings, { say: app.say, visibleScopes: onlySession, onVisibilityChange: (...args) => changes.push(args) });
  const boxes = nodes(controls).filter(node => node.type === 'input');
  assert.equal(boxes.length, 3); assert.equal(boxes[0].props.disabled, true); assert.equal(boxes[1].props.disabled, false);
  boxes[2].props.onChange({ target: { checked: true } }); assert.deepEqual(changes, [['global', true]]);
  const binding = { sessionId: 'a', workspace: { workspaceId: 'b' } };
  assert.equal(app.scopeFor(binding, 'global', onlySession).kind, 'session');
  assert.equal(app.scopeFor({ sessionId: 'a' }, 'workspace', onlyWorkspace), null);
  const kinds = nodes(app.render(app.ScopeSwitch, { say: app.say, visibleScopes: { session: false, workspace: true, global: true }, canUseSession: true, canUseWorkspace: true })).filter(node => node.type === 'button').map(node => node.props['data-scope-mode']);
  assert.deepEqual(kinds, ['global', 'workspace']);
});
test('visibility edits reject disabling the last scope, select a visible fallback and keep settings accessible', async t => {
  const app = await harness(t), binding = { sessionId: 'fixture-session' };
  app.model.setPreferences({ visibleScopes: { session: true, workspace: false, global: false } });
  let panel = app.panel(binding), head = panel.children.find(node => node?.type === app.PanelHead);
  head.props.onToggleSettings();
  panel = app.panel(binding);
  let settings = nodes(panel).find(node => node.type === app.SettingsPanel);
  const before = app.model.preferences.value;
  settings.props.onVisibilityChange('session', false); assert.equal(app.model.preferences.value, before);
  settings.props.onVisibilityChange('global', true); settings.props.onVisibilityChange('session', false);
  assert.equal(app.model.preferences.value.scopeMode, 'global'); assert.equal(app.model.preferences.value.visibleScopes.session, false);
  app.open(null); let overlay = app.render(app.Overlay, {}), next = overlay.children.find(node => node?.type === app.Panel);
  assert.equal(next.props.key, undefined); assert.equal(next.props.scope.kind, 'global');
  await app.model.load(next.props.scope);
  panel = app.render(app.Panel, next.props); assert.ok(nodes(panel).find(node => node.type === app.SettingsPanel));
  app.model.setPreferences({ visibleScopes: { session: false, workspace: true, global: false }, scopeMode: 'workspace' });
  overlay = app.render(app.Overlay, {}); next = overlay.children.find(node => node?.type === app.Panel);
  assert.equal(next.props.scope, null);
  panel = app.render(app.Panel, next.props);
  assert.ok(nodes(panel).find(node => node.type === app.SettingsPanel)); assert.ok(nodes(panel).find(node => node.type === app.EmptyState));
  assert.ok(!nodes(panel).find(node => node.type === app.ComposerForm));
});
test('narrow viewport geometry remains within each requested phone width', async t => {
  const app = await harness(t);
  for (const width of [320, 375, 390, 430]) {
    app.window.innerWidth = width;
    const style = app.memoPopoverStyle(null, 'right', 360, 0);
    assert.ok(parseFloat(style.width) + parseFloat(style.right) + 12 <= width);
  }
});
test('drag resize restores body state and removes listeners on cancellation and unmount', async t => {
  const app = await harness(t, { effects: true }), saved = [], anchor = { current: null }, panel = { current: null };
  const Geometry = () => app.usePanelGeometry(anchor, 'right', panel, { panelWidth: 360, panelHeight: 0 }, patch => saved.push(patch));
  let geometry = app.render(Geometry);
  geometry.startPanelResize({ button: 0, clientX: 200, preventDefault() {} });
  assert.equal(app.body.style.cursor, 'ew-resize');
  for (const fn of app.eventListeners.get('pointermove')) fn({ clientX: 140 });
  for (const fn of [...app.eventListeners.get('pointercancel')]) fn();
  assert.equal(saved[0].panelWidth, 358); // Clamped to viewport width minus 32.
  assert.equal(app.body.style.cursor, 'default'); assert.equal(app.body.style.userSelect, 'text');
  geometry = app.render(Geometry);
  geometry.startPanelHeightResize({ button: 0, clientY: 200, preventDefault() {} });
  app.unmount();
  for (const name of ['pointermove', 'pointerup', 'pointercancel', 'resize', 'scroll']) assert.equal(app.eventListeners.get(name)?.size || 0, 0);
  assert.equal(app.body.style.cursor, 'default'); assert.equal(app.body.style.userSelect, 'text');
  assert.equal(app.timers.size, 0);
});
