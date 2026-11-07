import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8');

function fixture() {
  const modules = [];
  vm.runInNewContext(source, { AbortController, window: { __ModuleLoader__: { load: value => modules.push(value) } } });
  assert.equal(modules.length, 1);
  const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false) });
  const plugin = modules[0].factory(() => ({ createElement: h, Fragment: 'fragment' }));
  const registrations = [];
  plugin.apply({
    effect: callback => callback(),
    locale: { register: () => () => {}, bind: () => key => key },
    slots: { inject: (_key, callback) => callback(), register: (meta, component) => { registrations.push({ meta, component }); return () => {}; } },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }) }, selectPanel() {} },
  });
  const panel = key => registrations.find(({ meta }) => meta.name === 'main' && meta.key === key);
  const render = key => { const element = panel(key).component(); return element.type(element.props); };
  const nodes = tree => [tree, ...(tree.children || []).filter(child => child && typeof child === 'object').flatMap(nodes)];
  return { render, nodes };
}

test('built music panel no longer embeds the xiaoai switch', () => {
  const { render, nodes } = fixture();
  const all = nodes(render('pocket-kit.music'));
  assert.ok(all.some(node => node.type === 'h1' && node.children.includes('音乐')));
  assert.ok(all.some(node => typeof node.type === 'function' && node.type.name === 'KitNavActions' && typeof node.props.chat === 'function' && typeof node.props.home === 'function'));
  assert.ok(!all.some(node => node.type === 'nav' && node.props['aria-label'] === '功能切换'));
  assert.ok(!all.some(node => node.type === 'button' && node.children.includes('小爱音箱')));
});

test('built xiaoai panel no longer embeds the music switch', () => {
  const { render, nodes } = fixture();
  const all = nodes(render('pocket-kit.xiaoai'));
  assert.ok(all.some(node => node.type === 'h1' && node.children.includes('小爱音箱')));
  assert.ok(!all.some(node => node.type === 'button' && node.children.includes('音乐')));
});
