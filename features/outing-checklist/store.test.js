import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createStore, resolveDataFile } from './store.js';
import { apply, createHandler } from './index.js';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'outing-checklist-test-'));
  t.after(async () => {
    // Only remove the exact dedicated directory returned by mkdtemp.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.startsWith(join(tmpdir(), 'outing-checklist-test-')));
    await rm(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'nested', 'checklist.json');
  return { directory, file, store: createStore({ dataFile: file }) };
}
const rejects = (operation, status, code) => assert.rejects(operation, (error) => error.status === status && error.code === code);

test('default and tilde paths resolve without accessing real user data', () => {
  assert.equal(resolveDataFile(), join(homedir(), '.dsh', 'outing-checklist.json'));
  assert.equal(resolveDataFile('~/test.json'), join(homedir(), 'test.json'));
  for (const value of ['', null, 42, 'x\0y']) assert.throws(() => resolveDataFile(value));
});

test('empty default, all mutations, restart persistence and private atomic file', async (t) => {
  const { file, store } = await fixture(t);
  assert.deepEqual(await store.read(), { items: [], revision: 0 });
  await assert.rejects(stat(file), { code: 'ENOENT' });
  let state = await store.mutate({ revision: 0, action: 'add', text: ' 水杯 ' });
  const first = state.items[0].id;
  assert.deepEqual(state.items[0], { id: first, text: '水杯', person: '通用', checked: false });
  state = await store.mutate({ revision: 1, action: 'add', text: '纸巾', person: '妈妈' });
  const second = state.items[1].id;
  state = await store.mutate({ revision: 2, action: 'update', id: first, text: '温水', person: '爸爸', checked: true });
  assert.equal(state.items[0].checked, true);
  state = await store.mutate({ revision: 3, action: 'move', id: second, direction: 'up' });
  assert.deepEqual(state.items.map((item) => item.id), [second, first]);
  state = await store.mutate({ revision: 4, action: 'move', id: second, direction: 'down' });
  assert.deepEqual(state.items.map((item) => item.id), [first, second]);
  state = await store.mutate({ revision: 5, action: 'move', id: first, direction: 'up' });
  assert.equal(state.revision, 6);
  state = await store.mutate({ revision: 6, action: 'reset' });
  assert.equal(state.items.length, 2);
  assert.ok(state.items.every((item) => !item.checked));
  state = await store.mutate({ revision: 7, action: 'delete', id: second });
  assert.equal(state.items.length, 1);
  assert.deepEqual(await createStore({ dataFile: file }).read(), state);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), state);
  assert.deepEqual(await readdir(dirname(file)), ['checklist.json']);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  state.items[0].text = 'outside mutation';
  assert.equal((await store.read()).items[0].text, '温水');
});

test('concurrent store instances serialize and reject stale revisions; queue survives errors', async (t) => {
  const { file, store } = await fixture(t);
  const other = createStore({ dataFile: file });
  const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) =>
    (i % 2 ? store : other).mutate({ revision: 0, action: 'add', text: `item ${i}` })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  for (const result of results.filter((result) => result.status === 'rejected')) {
    assert.equal(result.reason.status, 409);
    assert.equal(result.reason.details.revision, 1);
  }
  await store.mutate({ revision: 1, action: 'add', text: 'next', person: '赞赞' });
  assert.equal((await other.read()).revision, 2);
});

test('strict command validation does not modify file or revision', async (t) => {
  const { store } = await fixture(t);
  const state = await store.mutate({ revision: 0, action: 'add', text: 'valid' });
  const id = state.items[0].id;
  const bad = [null, [], {}, { revision: -1, action: 'reset' }, { revision: 1.1, action: 'reset' },
    { action: 'unknown' }, { action: ['reset'] }, { action: {} }, { action: '__proto__' }, { action: 'add', text: ' ' },
    { action: 'add', text: 'x'.repeat(501) }, { action: 'add', text: 4 },
    { action: 'add', text: 'x', person: '其他' }, { action: 'add', text: 'x', surprise: true },
    { action: 'update', id }, { action: 'update', id, checked: 'yes' },
    { action: 'update', id, person: null }, { action: 'delete', id: '' },
    { action: 'move', id, direction: 'left' }, { action: 'reset', items: [] }];
  for (const command of bad) {
    await rejects(store.mutate(command && !Array.isArray(command) ? { revision: 1, ...command } : command), 400, 'invalid_request');
  }
  await rejects(store.mutate({ revision: 1, action: 'delete', id: 'missing' }), 404, 'item_not_found');
  assert.deepEqual(await store.read(), state);
});

test('corrupt persisted data is never overwritten and read errors are sanitized', async (t) => {
  const { file, store } = await fixture(t);
  await mkdir(dirname(file), { recursive: true });
  for (const raw of ['{broken', '{"items":[],"revision":-1}', '{"items":[{}],"revision":0}']) {
    await writeFile(file, raw);
    await rejects(store.read(), 500, 'storage_error');
    await rejects(store.mutate({ revision: 0, action: 'reset' }), 500, 'storage_error');
    assert.equal(await readFile(file, 'utf8'), raw);
  }
});

test('failed atomic replacement leaves no temporary file and does not poison queue', async (t) => {
  const { file, store } = await fixture(t);
  // A missing parent is created by save. Block that creation with a regular file.
  await writeFile(dirname(file), 'not a directory');
  await rejects(store.mutate({ revision: 0, action: 'reset' }), 500, 'storage_error');
  assert.equal(await readFile(dirname(file), 'utf8'), 'not a directory');
  assert.equal((await readdir(dirname(dirname(file)))).length, 1);
});

function request(body, extraHeaders = {}, method = 'POST') {
  return new Request('https://example.test/api/outing-checklist', {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Outing-Checklist': '1', 'Sec-Fetch-Site': 'same-origin', ...extraHeaders },
    ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

test('Fetch-native API contract, errors and CSRF protection', async (t) => {
  const { store } = await fixture(t);
  const fetch = createHandler(store);
  let response = await fetch(request(undefined, {}, 'GET'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { items: [], revision: 0 });
  response = await fetch(request({ revision: 0, action: 'add', text: '帽子', person: '赞赞' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);
  response = await fetch(request({ revision: 0, action: 'reset' }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'revision_conflict', message: 'Checklist changed; reload and retry', revision: 1 });
  for (const extra of [{ 'X-Outing-Checklist': '' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) {
    assert.equal((await fetch(request({ revision: 1, action: 'reset' }, extra))).status, 403);
  }
  assert.equal((await fetch(request('{}', { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await fetch(request('{invalid'))).status, 400);
  assert.equal((await fetch(request('x'.repeat(65537)))).status, 413);
  assert.equal((await fetch(request({ revision: 1, action: 'update', id: 'missing', checked: true }))).status, 404);
  assert.equal((await store.read()).revision, 1);
  const broken = createHandler({ read: async () => { throw new Error('/private/file secret'); } });
  response = await broken(request(undefined, {}, 'GET'));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes('secret'));
});

test('plugin registers exact buffered route with a disposable effect', async (t) => {
  const { file } = await fixture(t);
  let route;
  const dispose = async () => {};
  apply({ effect(callback) { assert.equal(callback(), dispose); }, connection: { fetch: { register(value) { route = value; return dispose; } } } }, { dataFile: file });
  assert.equal(route.path, '/api/outing-checklist');
  assert.deepEqual(route.methods, ['GET', 'POST']);
  assert.equal(route.requestBody, 'buffered');
  assert.equal((await route.fetch(request(undefined, {}, 'GET'))).status, 200);
});
