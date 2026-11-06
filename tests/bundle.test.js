import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
test('built client registers only Pocket Kit and composes all feature entries', async () => {
  const source = await readFile(new URL('dist/client.js', root), 'utf8');
  const modules = [];
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => modules.push(value) } } });
  assert.equal(modules.length, 1);
  assert.equal(modules[0].id, '@local/pocket-kit');
  const plugin = modules[0].factory(name => {
    assert.equal(name, 'react');
    return { createElement: (type, props) => ({ type, props }) };
  });
  const registrations = [], disposals = [];
  plugin.apply({
    effect: callback => { const dispose = callback(); if (dispose) disposals.push(dispose); },
    locale: { register: () => () => {}, bind: () => key => key },
    slots: { inject: (key, callback) => callback(), register: (meta, component) => { registrations.push({ meta, component }); return () => {}; } },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }) }, selectPanel() {} },
  });
  assert.equal(registrations.length, 6);
  assert.ok(registrations.some(({ meta }) => meta.name === 'sidebar.footer.action' && meta.children['local.shortcuts.menu.action']));
  assert.ok(registrations.some(({ meta }) => meta.name === 'local.shortcuts.menu.action' && meta.id === 'network-speed'));
  assert.ok(registrations.some(({ meta }) => meta.name === 'main' && meta.key === 'local.outing-checklist'));
  for (const dispose of disposals.reverse()) dispose();
});
test('package exports one client and three independent host entries', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.name, '@local/pocket-kit');
  for (const key of ['./client', './shortcuts', './network-speed', './outing-checklist']) assert.ok(pkg.exports[key]);
  assert.ok(pkg.files.every(path => !path.includes('.local') && !path.includes('bookmarks.json')));
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  assert.equal((patch.match(/- id:/g) || []).length, 4);
});
test('mobile styles include touch sizing and constrained dialogs', async () => {
  for (const path of ['features/shortcuts/client.js', 'features/network-speed/client-entry.js', 'features/outing-checklist/client.js']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /44px/);
    assert.match(source, /safe-area-inset-bottom/);
    assert.match(source, /100dvh/);
  }
});
