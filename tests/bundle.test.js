import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
test('built client registers only Pocket Kit and composes all feature entries', async () => {
  const source = await readFile(new URL('dist/client.js', root), 'utf8');
  const modules = [];
  vm.runInNewContext(source, { AbortController, window: { __ModuleLoader__: { load: value => modules.push(value) } } });
  assert.equal(modules.length, 1);
  assert.equal(modules[0].id, '@local/pocket-kit');
  const plugin = modules[0].factory(name => {
    if (name === 'react') return { createElement: (type, props) => ({ type, props }) };
    if (name === 'react-dom') return { createPortal: node => node };
    assert.equal(name, '@deepseek-ai/dsh-client-ui-primitives');
    return {};
  });
  const registrations = [], disposals = [], selectedPanels = [];
  plugin.apply({
    effect: callback => { const dispose = callback(); if (dispose) disposals.push(dispose); },
    documentPreviews: { register: meta => { assert.equal(meta.id,'@local/pocket-kit/csv-preview'); assert.equal(meta.loading,'bytes-complete'); return () => {}; } },
    locale: { register: () => () => {}, bind: () => key => key },
    slots: { inject: (key, callback) => callback(), register: (meta, component) => { registrations.push({ meta, component }); return () => {}; } },
    layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }) }, selectPanel(id) {selectedPanels.push(id);} },
  });
  assert.equal(registrations.length, 26);
  assert.ok(registrations.some(({meta})=>meta.name==='sidebar.right.tab.document' && meta.key==='@local/pocket-kit/csv-preview'));
  const header = registrations.filter(({meta})=>meta.name==='conversation.session.header.utilities');
  assert.equal(header.length,2);
  assert.equal(header[1].meta.id,'pocket-kit.aside-note');
  assert.equal(header[0].meta.id,'pocket-kit-home');
  assert.equal(typeof header[0].component().props.open,'function');
  header[0].component().props.open();
  assert.equal(selectedPanels.at(-1),'pocket-kit.home');
  assert.ok(!registrations.some(({meta})=>meta.name==='conversation.view'));
  assert.equal(registrations.filter(({meta})=>meta.name==='local.terminal.touch.keys').length,1);
  assert.equal(registrations.filter(({meta})=>meta.name==='main'&&meta.key==='pocket-kit.native-terminal').length,1);
  assert.ok(registrations.some(({ meta }) => meta.name === 'main' && meta.key === 'pocket-kit.home' && meta.children['local.pocket-kit.home.tool']));
  assert.deepEqual(registrations.filter(({meta})=>meta.name==='sidebar.footer.action').map(({meta})=>meta.id),['pocket-kit-home']);
  assert.equal(registrations.filter(({meta})=>meta.name==='sidebar.panellist'&&meta.id==='pocket-kit.native-terminal').length,0);
  assert.ok(registrations.some(({ meta }) => meta.name === 'local.pocket-kit.home.tool' && meta.id === 'network-speed'));
  assert.ok(registrations.some(({ meta }) => meta.name === 'main' && meta.key === 'local.outing-checklist'));
  assert.deepEqual(registrations.filter(({meta})=>meta.name==='local.pocket-kit.home.tool').map(({meta})=>meta.id).sort(),['local.outing-checklist','network-speed',...['file-manager','beijing-pass','health','native-terminal','bill-manager','music','xiaoai'].map(id=>'pocket-kit.'+id)].sort());
  assert.ok(!registrations.some(({meta})=>meta.key==='pocket-kit.terminal'||meta.id==='pocket-kit.terminal'));
  assert.doesNotMatch(source,/createTerminalView|startFreshTerminal|runTerminalStartup|TERMINAL_STARTUP/);
  for (const dispose of disposals.reverse()) dispose();
});
test('package exports one client and ten independent host entries', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.name, '@local/pocket-kit');
  for (const key of ['./client', './shortcuts', './network-speed', './outing-checklist', './music', './xiaoai', './file-manager', './health', './beijing-pass', './bill-manager', './aside-note']) assert.ok(pkg.exports[key]);
  assert.ok(!pkg.exports['./terminal']);
  assert.ok(!pkg.files.some(path=>path.startsWith('features/terminal/')));
  assert.ok(pkg.files.every(path => !path.includes('.local') && !path.includes('bookmarks.json')));
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  assert.equal((patch.match(/- id:/g) || []).length, 11);
});
test('mobile styles include touch sizing and constrained dialogs', async () => {
  for (const path of ['features/shortcuts/client.js', 'features/network-speed/client-entry.js', 'features/outing-checklist/client.js']) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.match(source, /44px/);
    assert.match(source, /safe-area-inset-bottom/);
    if (!path.includes('shortcuts')) assert.match(source, /100dvh/);
  }
});
