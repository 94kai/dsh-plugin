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
  assert.equal(registrations.length, 11);
  assert.ok(registrations.some(({ meta }) => meta.name === 'main' && meta.key === 'pocket-kit.home' && meta.children['local.pocket-kit.home.tool']));
  assert.deepEqual(registrations.filter(({meta})=>meta.name==='sidebar.footer.action').map(({meta})=>meta.id),['pocket-kit-home']);
  assert.equal(registrations.filter(({meta})=>meta.name==='sidebar.panellist').length,0);
  assert.ok(registrations.some(({ meta }) => meta.name === 'local.pocket-kit.home.tool' && meta.id === 'network-speed'));
  assert.ok(registrations.some(({ meta }) => meta.name === 'main' && meta.key === 'local.outing-checklist'));
  assert.deepEqual(registrations.filter(({meta})=>meta.name==='local.pocket-kit.home.tool').map(({meta})=>meta.id).sort(),['local.outing-checklist','network-speed','pocket-kit.music','pocket-kit.xiaoai']);
  for (const dispose of disposals.reverse()) dispose();
});
test('package exports one client and five independent host entries', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.name, '@local/pocket-kit');
  for (const key of ['./client', './shortcuts', './network-speed', './outing-checklist', './music', './xiaoai']) assert.ok(pkg.exports[key]);
  assert.ok(pkg.files.every(path => !path.includes('.local') && !path.includes('bookmarks.json')));
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  assert.equal((patch.match(/- id:/g) || []).length, 6);
});
test('mobile styles include touch sizing and constrained dialogs', async () => {
  for (const path of ['features/shortcuts/client.js', 'features/network-speed/client-entry.js', 'features/outing-checklist/client.js']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /44px/);
    assert.match(source, /safe-area-inset-bottom/);
    if (!path.includes('shortcuts')) assert.match(source, /100dvh/);
  }
});
