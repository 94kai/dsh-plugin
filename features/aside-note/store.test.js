import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.js';
import { createHandler, apply } from './host.js';
const session = { kind: 'session', id: 'test-session' }, workspace = { kind: 'workspace', id: 'test-workspace' };
async function setup(t) { const dir = await mkdtemp(join(tmpdir(), 'pocket-notes-test-')); t.after(() => rm(dir, { recursive: true, force: true })); const file = join(dir, 'private', 'notes.json'); return { file, store: createStore({ dataFile: file }) }; }
const note = (id = 'old-1', text = '测试便笺') => ({ id, text, done: false, createdAt: 100, updatedAt: 100 });
const legacy = items => ({ sessions: { version: 1, sessions: { 'test-session': { items } } } });
test('notes survive a new store (another browser/server reload) and use private mode', async t => {
  const { store, file } = await setup(t);
  const first = await store.read(session); assert.equal(first.revision, 0);
  const added = await store.mutate({ action: 'add', scope: session, revision: 0, text: '跨浏览器记录' });
  assert.equal(added.items[0].text, '跨浏览器记录');
  const second = await createStore({ dataFile: file }).read(session); assert.deepEqual(second, added);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(join(file, '..'))).mode & 0o777, 0o700);
  assert.equal((await store.read(workspace)).items.length, 0);
});
test('global notes, drafts and preference persist independently from sessions and workspaces', async t => {
  const { store, file } = await setup(t), global = { kind: 'global', id: 'all' };
  await store.mutate({ action: 'add', scope: session, revision: 0, text: '会话独有' });
  await store.mutate({ action: 'add', scope: workspace, revision: 0, text: '工作区独有' });
  let state = await store.mutate({ action: 'add', scope: global, revision: 0, text: '全局共享' });
  state = await store.mutate({ action: 'draft', scope: global, revision: state.revision, draft: { add: '全局草稿', edits: {} } });
  await store.mutate({ action: 'preferences', ...state.preferences, scopeMode: 'global' });
  const other = createStore({ dataFile: file }), saved = await other.read(global);
  assert.equal(saved.items[0].text, '全局共享'); assert.equal(saved.draft.add, '全局草稿'); assert.equal(saved.preferences.scopeMode, 'global');
  assert.equal((await other.read(session)).items[0].text, '会话独有'); assert.equal((await other.read(workspace)).items[0].text, '工作区独有');
  assert.equal((await other.read(session)).draft.add, '');
  await store.mutate({ action: 'delete', scope: global, revision: saved.revision, id: saved.items[0].id });
  await assert.rejects(other.mutate({ action: 'add', scope: global, revision: saved.revision, text: '过期写入' }), error => error.status === 409);
  assert.equal((await other.read(workspace)).items.length, 1);
});
test('global API accepts only the canonical all id and includes the shared list in backups', async t => {
  const { store } = await setup(t), handler = createHandler(store), url = 'http://localhost/api/pocket-kit/aside-note';
  const response = await handler(new Request(url, { method: 'POST', headers: { 'x-pocket-kit': '1', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', scope: { kind: 'global', id: 'all' }, revision: 0, text: '全局API' }) }));
  assert.equal(response.status, 200);
  assert.equal((await (await handler(new Request(url + '?kind=global&id=all'))).json()).items[0].text, '全局API');
  assert.equal((await handler(new Request(url + '?kind=global&id=other'))).status, 400);
  const backup = await (await handler(new Request(url + '?export=1'))).json();
  assert.equal(backup.records['["global","all"]'].items[0].text, '全局API');
});
test('concurrent clients and hot reload instances reject stale updates', async t => {
  const { store, file } = await setup(t), other = createStore({ dataFile: file });
  const results = await Promise.allSettled([store, other].map((value, i) => value.mutate({ action: 'add', scope: session, revision: 0, text: `记录${i}` })));
  assert.equal(results.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(results.find(value => value.status === 'rejected').reason.status, 409);
});
test('CRUD, completion time, draft clearing and completed cleanup', async t => {
  const { store } = await setup(t);
  let state = await store.mutate({ action: 'draft', scope: session, revision: 0, draft: { add: '待添加', edits: {} } });
  state = await store.mutate({ action: 'add', scope: session, revision: state.revision, text: '待添加' });
  assert.equal(state.draft.add, ''); const id = state.items[0].id;
  state = await store.mutate({ action: 'update', scope: session, revision: state.revision, id, text: '已修改', done: true });
  assert.ok(state.items[0].completedAt); assert.equal(state.items[0].text, '已修改');
  state = await store.mutate({ action: 'forward', scope: session, revision: state.revision, id, forwarded: true });
  assert.equal(state.forwarded[id], true);
  state = await store.mutate({ action: 'clear', scope: session, revision: state.revision });
  assert.equal(state.items.length, 0); assert.deepEqual(state.forwarded, {});
  await assert.rejects(store.mutate({ action: 'delete', scope: session, revision: state.revision, id }), error => error.status === 404);
});
test('drafts and preferences persist; preferences have separate CAS', async t => {
  const { store, file } = await setup(t);
  await store.mutate({ action: 'draft', scope: session, revision: 0, draft: { add: '草稿', edits: { 'old-1': '修改草稿' } } });
  await store.mutate({ action: 'preferences', revision: 0, sendShortcut: 'mod-enter', scopeMode: 'session', forwardPrefix: '继续处理：' });
  const state = await createStore({ dataFile: file }).read(session);
  assert.equal(state.draft.add, '草稿'); assert.equal(state.draft.edits['old-1'], '修改草稿');
  assert.equal(state.preferences.sendShortcut, 'mod-enter'); assert.equal(state.revision, 1);
  await assert.rejects(store.mutate({ action: 'preferences', revision: 0, sendShortcut: 'enter', scopeMode: 'session', forwardPrefix: '' }), error => error.status === 409);
});
test('panel geometry and sections persist across clients and 1.7.0 snapshots load without rewriting', async t => {
  const { store, file } = await setup(t);
  await store.mutate({ action: 'add', scope: session, revision: 0, text: '兼容记录' });
  const previous = JSON.parse(await readFile(file, 'utf8'));
  delete previous.preferences.panelWidth; delete previous.preferences.panelHeight; delete previous.preferences.sections;
  await writeFile(file, JSON.stringify(previous));
  const before = await readFile(file, 'utf8');
  let state = await store.read(session);
  assert.equal(state.preferences.panelWidth, 360); assert.equal(await readFile(file, 'utf8'), before);
  await store.mutate({ action: 'preferences', ...state.preferences, panelWidth: 480, panelHeight: 560, sections: { open: false, done: true } });
  state = await createStore({ dataFile: file }).read(session);
  assert.equal(state.preferences.panelWidth, 480); assert.equal(state.preferences.panelHeight, 560); assert.deepEqual(state.preferences.sections, { open: false, done: true });
  for (const patch of [{ panelWidth: 100 }, { panelWidth: 1000 }, { panelHeight: -1 }, { sections: { open: 'yes', done: false } }]) await assert.rejects(store.mutate({ action: 'preferences', ...state.preferences, ...patch }), error => error.status === 400);
  assert.equal((await store.read(session)).items[0].text, '兼容记录');
});
test('visible scopes persist, normalize a hidden selection and reject invalid or empty configurations atomically', async t => {
  const { store, file } = await setup(t);
  await store.mutate({ action: 'add', scope: session, revision: 0, text: '隐藏后保留的会话数据' });
  const current = (await store.read(session)).preferences;
  assert.deepEqual(current.visibleScopes, { session: true, workspace: true, global: true });
  const saved = await store.mutate({ action: 'preferences', ...current, scopeMode: 'session', visibleScopes: { session: false, workspace: false, global: true } });
  assert.equal(saved.scopeMode, 'global');
  const other = createStore({ dataFile: file });
  assert.deepEqual((await other.read(session)).preferences.visibleScopes, saved.visibleScopes);
  assert.equal((await other.read(session)).items[0].text, '隐藏后保留的会话数据');
  const before = await readFile(file, 'utf8');
  for (const visibleScopes of [null, [], {}, { session: false, workspace: false, global: false }, { session: 'true', workspace: false, global: false }, { session: true, workspace: false, global: false, extra: true }]) await assert.rejects(store.mutate({ action: 'preferences', ...saved, visibleScopes }), error => error.status === 400);
  assert.equal(await readFile(file, 'utf8'), before);
  await assert.rejects(other.mutate({ action: 'preferences', ...current }), error => error.status === 409);
  const { visibleScopes: _removed, ...oldClient } = saved;
  await store.mutate({ action: 'preferences', ...oldClient, forwardPrefix: '旧客户端请求' });
  assert.deepEqual((await other.read(session)).preferences.visibleScopes, saved.visibleScopes);
});
test('missing visibility in old snapshots defaults in memory without rewriting data', async t => {
  const { store, file } = await setup(t);
  await store.mutate({ action: 'add', scope: session, revision: 0, text: '旧数据' });
  const old = JSON.parse(await readFile(file, 'utf8')); delete old.preferences.visibleScopes;
  await writeFile(file, JSON.stringify(old)); const before = await readFile(file, 'utf8');
  assert.deepEqual((await store.read(session)).preferences.visibleScopes, { session: true, workspace: true, global: true });
  assert.equal(await readFile(file, 'utf8'), before);
});
test('legacy presentation import preserves dimensions and section state', async t => {
  const { store } = await setup(t);
  await store.mutate({ action: 'import', data: { preferences: { panelWidth: 500, panelHeight: 600, sections: { open: false, done: true } } } });
  const state = await store.read(session);
  assert.equal(state.preferences.panelWidth, 500); assert.equal(state.preferences.panelHeight, 600); assert.equal(state.preferences.sections.done, true);
});
test('workspace seeding happens once and does not resurrect a deleted note', async t => {
  const { store } = await setup(t);
  const one = await store.mutate({ action: 'add', scope: session, revision: 0, text: '会话记录' });
  let state = await store.mutate({ action: 'seed', scope: workspace, revision: 0, sessionIds: [session.id] });
  assert.equal(state.items[0].id, one.items[0].id);
  state = await store.mutate({ action: 'delete', scope: workspace, revision: state.revision, id: one.items[0].id });
  state = await store.mutate({ action: 'seed', scope: workspace, revision: state.revision, sessionIds: [session.id] });
  assert.equal(state.items.length, 0); assert.equal((await store.read(session)).items.length, 1);
});
test('legacy migration merges both scopes, drafts, marks and settings without replacing server notes', async t => {
  const { store } = await setup(t);
  await store.mutate({ action: 'add', scope: session, revision: 0, text: '服务端记录' });
  const data = { ...legacy([note()]), workspaces: { version: 1, workspaces: { 'test-workspace': { items: [note('ws-1')], seededSessionIds: [session.id] } } }, drafts: { version: 1, sessions: { 'test-session': { add: '旧草稿', edits: { 'old-1': '旧编辑' } }, 'ws:test-workspace': { add: '工作区草稿', edits: {} } } }, forwarded: { version: 1, sessions: { 'test-session': { 'old-1': true } } }, preferences: { sendShortcut: 'mod-enter', forwardPrefix: '请处理', scopeMode: 'session' } };
  assert.equal((await store.mutate({ action: 'import', data })).imported, 2);
  const state = await store.read(session); assert.equal(state.items.length, 2); assert.equal(state.draft.add, '旧草稿'); assert.equal(state.forwarded['old-1'], true);
  assert.equal((await store.read(workspace)).draft.add, '工作区草稿');
  assert.equal(state.preferences.forwardPrefix, '请处理');
  assert.equal((await store.mutate({ action: 'import', data })).alreadyImported, true);
});
test('repeated import after deletion is idempotent and divergent ID content is preserved', async t => {
  const { store } = await setup(t), data = legacy([note()]);
  await store.mutate({ action: 'import', data });
  await store.mutate({ action: 'import', data: legacy([note('old-1', '另一浏览器的版本')]) });
  let state = await store.read(session); assert.equal(state.items.length, 2);
  state = await store.mutate({ action: 'delete', scope: session, revision: state.revision, id: 'old-1' });
  await store.mutate({ action: 'import', data }); assert.equal((await store.read(session)).items.length, 1);
});
test('invalid migration is atomic; malformed storage is never overwritten', async t => {
  const { store, file } = await setup(t);
  await store.mutate({ action: 'add', scope: session, revision: 0, text: '原记录' }); const before = await readFile(file, 'utf8');
  await assert.rejects(store.mutate({ action: 'import', data: { ...legacy([note()]), workspaces: { version: 1, workspaces: { bad: { items: [{ text: '无效' }] } } } } }));
  assert.equal(await readFile(file, 'utf8'), before);
  await writeFile(file, '{ broken');
  await assert.rejects(store.mutate({ action: 'add', scope: session, revision: 1, text: '不能覆盖' }), error => error.code === 'storage_error');
  assert.equal(await readFile(file, 'utf8'), '{ broken');
});
test('reject oversized, prototype, invalid scope and invalid completion input', async t => {
  const { store } = await setup(t);
  for (const command of [
    { action: 'add', text: 'x'.repeat(10001) }, { action: 'add', text: '' },
    { action: 'draft', draft: { add: '', edits: JSON.parse('{"__proto__":"bad"}') } },
    { action: 'add', scope: { kind: 'global', id: 'test' }, text: '不合法' },
    { action: 'add', scope: { kind: 'session', id: '__proto__' }, text: '不合法' },
  ]) await assert.rejects(store.mutate({ scope: session, revision: 0, ...command }), error => error.status === 400);
  assert.equal((await store.read(session)).revision, 0);
});
test('HTTP validates CSRF, content type, payload budget, JSON, method, scope and cache headers', async t => {
  const { store } = await setup(t), handler = createHandler(store), url = 'http://localhost/api/pocket-kit/aside-note';
  const post = (body, headers = {}) => handler(new Request(url, { method: 'POST', headers, body }));
  assert.equal((await post('{}')).status, 403);
  assert.equal((await post('{}', { 'x-pocket-kit': '1' })).status, 415);
  const headers = { 'x-pocket-kit': '1', 'content-type': 'application/json' };
  assert.equal((await post('{}', { ...headers, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post('bad json', headers)).status, 400);
  assert.equal((await post('x'.repeat(2 * 1024 * 1024 + 1), headers)).status, 413);
  assert.equal((await handler(new Request(url, { method: 'DELETE' }))).status, 405);
  assert.equal((await handler(new Request(url))).status, 400);
  const response = await handler(new Request(url + '?kind=session&id=test-session'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const added = await post(JSON.stringify({ action: 'add', scope: session, revision: 0, text: 'API测试' }), headers); assert.equal(added.status, 200);
  const conflict = await post(JSON.stringify({ action: 'add', scope: session, revision: 0, text: '陈旧写入' }), headers); assert.equal(conflict.status, 409);
  const backup = await handler(new Request(url + '?export=1')); assert.equal((await backup.json()).version, 1);
});
test('host registers only an authenticated Connection route and releases it on disposal', () => {
  let registered, disposed = false; const effects = [];
  apply({ effect: fn => effects.push(fn()), connection: { fetch: { register: value => { registered = value; return () => { disposed = true; }; } } } });
  assert.equal(registered.path, '/api/pocket-kit/aside-note'); assert.equal(registered.requestBody, 'buffered'); assert.deepEqual(registered.methods, ['GET', 'POST']);
  effects[0](); assert.equal(disposed, true);
});
