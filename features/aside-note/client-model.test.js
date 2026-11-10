import test from 'node:test';
import assert from 'node:assert/strict';
import { NotesClient, collectLegacy } from './client-model.js';
const scope = { kind: 'session', id: 'test' };
const record = revision => ({ revision, items: [], draft: { add: '', edits: {} }, forwarded: {}, seededSessionIds: [], preferences: { revision: 0, scopeMode: 'workspace', sendShortcut: 'enter', forwardPrefix: '' } });
const timers = () => { const callbacks = new Map(); let next = 0; return { callbacks, setTimeout: fn => { callbacks.set(++next, fn); return next; }, clearTimeout: id => callbacks.delete(id) }; };
test('legacy reader reads only allowlisted old keys, never writes and maps old shortcut', () => {
  const values = new Map([['dsh.aside-note', JSON.stringify({ version: 1, sessions: {} })], ['dsh.aside-note.send-shortcut', 'ctrl-enter']]);
  const data = collectLegacy({ getItem: key => values.get(key) ?? null });
  assert.equal(data.preferences.sendShortcut, 'mod-enter'); assert.deepEqual(data.sessions, { version: 1, sessions: {} });
  assert.throws(() => collectLegacy({ getItem: () => null }), /没有原插件数据/);
  assert.throws(() => collectLegacy({ getItem: key => key === 'dsh.aside-note' ? '{' : null }), /无法解析/);
});
test('drafts save to server and stay in memory until acknowledgement', async () => {
  const clock = timers(); let resolve;
  const model = new NotesClient(command => command ? new Promise(done => { resolve = done; }) : Promise.resolve(record(0)), clock);
  await model.load(scope); model.setDraft(scope, { add: '草稿', edits: {} });
  assert.equal(model.hasUnsaved(), true);
  const saving = model.saveDraft(scope); await Promise.resolve();
  assert.equal(model.snapshot(scope).dirty, true);
  resolve({ ...record(1), draft: { add: '草稿', edits: {} } }); await saving;
  assert.equal(model.snapshot(scope).dirty, false); assert.equal(model.snapshot(scope).draft.add, '草稿'); model.dispose(); assert.equal(clock.callbacks.size, 0);
});
test('network failure preserves text and never claims it was saved', async () => {
  const model = new NotesClient(command => command ? Promise.reject(new Error('网络异常')) : Promise.resolve(record(0)), timers());
  await model.load(scope); model.setDraft(scope, { add: '不能丢', edits: {} });
  assert.equal(await model.mutate(scope, { action: 'add', text: '不能丢' }), false);
  assert.equal(model.snapshot(scope).draft.add, '不能丢'); assert.equal(model.snapshot(scope).dirty, true); assert.match(model.snapshot(scope).error, /网络异常/); model.dispose();
});
test('conflict blocks automatic overwrite; refresh keeps local draft and requires deliberate resume', async () => {
  let rev = 0, calls = 0;
  const model = new NotesClient(command => {
    if (!command) return Promise.resolve(record(rev));
    calls++; const error = new Error('版本冲突'); error.status = 409; return Promise.reject(error);
  }, timers());
  await model.load(scope); model.setDraft(scope, { add: '本地未存', edits: {} });
  await model.saveDraft(scope); assert.equal(model.snapshot(scope).conflict, true);
  rev = 3; await model.refresh(scope);
  assert.equal(model.snapshot(scope).record.revision, 3); assert.equal(model.snapshot(scope).draft.add, '本地未存');
  await model.saveDraft(scope); assert.equal(calls, 1);
  model.resume(scope); await model.saveDraft(scope, true); assert.equal(calls, 2); model.dispose();
});
test('serialized writes use latest revision and stale draft queued after add cannot resurrect input', async () => {
  const calls = []; let rev = 0;
  const model = new NotesClient(async command => {
    if (!command) return record(rev);
    calls.push(command); assert.equal(command.revision, rev); return record(++rev);
  }, timers());
  await model.load(scope); model.setDraft(scope, { add: '提交一次', edits: {} });
  const add = model.mutate(scope, { action: 'add', text: '提交一次' }); const draft = model.saveDraft(scope);
  await Promise.all([add, draft]);
  assert.equal(calls.length, 1); assert.equal(model.snapshot(scope).draft.add, ''); assert.equal(model.hasUnsaved(), false); model.dispose();
});
test('typing during a pending save never clears newer text', async () => {
  let resolve;
  const model = new NotesClient(command => command ? new Promise(done => { resolve = done; }) : Promise.resolve(record(0)), timers());
  await model.load(scope); model.setDraft(scope, { add: '旧稿', edits: {} });
  const saving = model.saveDraft(scope); await Promise.resolve(); model.setDraft(scope, { add: '新稿', edits: {} });
  resolve({ ...record(1), draft: { add: '旧稿', edits: {} } }); await saving;
  assert.equal(model.snapshot(scope).draft.add, '新稿'); assert.equal(model.snapshot(scope).dirty, true); model.dispose();
});
test('presentation preferences debounce, serialize and survive an acknowledgement while typing', async () => {
  const clock = timers(), calls = []; let resolve;
  const model = new NotesClient(command => {
    if (!command) return Promise.resolve(record(0));
    calls.push(command); return new Promise(done => { resolve = done; });
  }, clock);
  await model.load(scope);
  model.setPreferences({ panelWidth: 420, sections: { open: false, done: true } });
  const first = model.savePreferences(); await Promise.resolve();
  model.setPreferences({ forwardPrefix: '新前缀' });
  resolve({ ...calls[0], revision: 1 }); await first;
  assert.equal(model.preferences.value.forwardPrefix, '新前缀'); assert.equal(model.preferences.dirty, true);
  const second = model.savePreferences(); await Promise.resolve();
  assert.equal(calls[1].revision, 1); assert.equal(calls[1].panelWidth, 420);
  resolve({ ...calls[1], revision: 2 }); await second;
  assert.equal(model.preferences.dirty, false); assert.equal(model.snapshot(scope).record.preferences.revision, 2);
  model.dispose(); assert.equal(clock.callbacks.size, 0);
});
test('remote preference changes cannot silently overwrite unsaved local settings', async () => {
  let remote = 0; const calls = [];
  const model = new NotesClient(async command => {
    if (!command) return { ...record(0), preferences: { ...record(0).preferences, revision: remote } };
    calls.push(command);
    if (command.revision !== remote) { const error = new Error('设置冲突'); error.status = 409; throw error; }
    return { ...command, revision: ++remote };
  }, timers());
  await model.load(scope); model.setPreferences({ forwardPrefix: '保留本地输入' }); remote = 1;
  await model.refresh(scope); await model.savePreferences();
  assert.equal(calls[0].revision, 0); assert.equal(model.preferences.conflict, true);
  assert.equal(model.preferences.value.forwardPrefix, '保留本地输入');
  await model.savePreferences(); assert.equal(calls.length, 1);
  model.resumePreferences(); await model.savePreferences(true);
  assert.equal(calls[1].revision, 1); assert.equal(model.preferences.dirty, false); model.dispose();
});
test('legacy presentation settings use only explicit keys and never write browser storage', () => {
  const values = new Map([['dsh.aside-note.panel-width', '423.4'], ['dsh.aside-note.panel-height', '540'], ['dsh.aside-note.sections', '{"open":false,"done":true}']]);
  const result = collectLegacy({ getItem: key => values.get(key) ?? null });
  assert.equal(result.preferences.panelWidth, 423); assert.equal(result.preferences.panelHeight, 540);
  assert.deepEqual(result.preferences.sections, { open: false, done: true });
});
test('stale GET cannot roll back a successful mutation', async () => {
  let first = true, resolve;
  const model = new NotesClient(command => {
    if (command) return Promise.resolve(record(2));
    if (first) { first = false; return Promise.resolve(record(0)); }
    return new Promise(done => { resolve = done; });
  }, timers());
  await model.load(scope); const loading = model.load(scope);
  await model.mutate(scope, { action: 'add', text: '最新' }); resolve(record(0)); await loading;
  assert.equal(model.snapshot(scope).record.revision, 2); model.dispose();
});
