import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
function setup() {
  let module;
  const React = { createElement: (type, props) => ({ type, props }) };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { module = value; } } } });
  assert.equal(module.id, '@local/outing-checklist');
  return module.factory(name => { assert.equal(name, 'react'); return React; });
}

test('client registers paired homepage launcher and main panel through scoped injects', () => {
  const plugin = setup();
  const registrations = [], disposals = [], localeCalls = [], navigations = [];
  let selected = 'local.outing-checklist';
  const ctx = {
    effect(callback) { const dispose = callback(); if (dispose) disposals.push(dispose); },
    locale: { register(...args) { localeCalls.push(args); return () => {}; } },
    slots: {
      inject(name, callback) { callback(); },
      register(meta, component) { registrations.push({ meta, component }); return () => {}; },
    },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: selected }) }, selectPanel(id) { navigations.push(id); } },
  };
  plugin.apply(ctx);
  assert.equal(registrations.length, 2);
  const main = registrations.find(r => r.meta.name === 'main');
  const sidebar = registrations.find(r => r.meta.name === 'local.pocket-kit.home.tool');
  assert.equal(registrations.some(r=>r.meta.name==='sidebar.panellist'),false);
  assert.equal(main.meta.key, sidebar.meta.id);
  assert.equal(sidebar.meta.label(), '出门清单');
  assert.equal(sidebar.meta.order, 30);
  assert.equal(typeof sidebar.component, 'function');
  main.component().props.back();
  assert.deepEqual(navigations, ['pocket-kit.home']);
  navigations.length = 0;
  disposals.at(-1)();
  assert.deepEqual(navigations, [null]);
  navigations.length = 0;
  selected = 'other-panel';
  disposals.at(-1)();
  assert.deepEqual(navigations, []);
  assert.equal(localeCalls.length, 1);
});
