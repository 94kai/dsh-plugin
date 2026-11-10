import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler, publicBookmarks } from './index.js';

test('bookmark responses allow only display fields, not incidental credentials', () => {
  const [item] = publicBookmarks([{ id: 'example', title: 'Example', url: 'https://example.com', key: 'fake-test-key', token: 'fake-test-token', notes: 'Public fixture' }]);
  assert.equal(item.key, undefined);
  assert.equal(item.token, undefined);
  assert.equal(item.notes, 'Public fixture');
});
test('ICO bookmark icons survive the public-field filter', () => {
  for (const mime of ['image/x-icon', 'image/vnd.microsoft.icon']) {
    const iconDataUrl = `data:${mime};base64,AAABAA==`;
    const [item] = publicBookmarks([{ id: 'fixture', title: 'Fixture', url: 'https://example.com', iconDataUrl }]);
    assert.equal(item.iconDataUrl, iconDataUrl);
  }
});
test('bookmark links reject script schemes and embedded credentials', () => {
  for (const url of ['javascript:alert(1)', 'https://user:pass@example.com']) assert.throws(() => publicBookmarks([{ id: 'x', title: 'x', url }]));
});
const fields = { title: '示例', url: 'https://example.com', description: '说明', notes: '普通备注', color: '#7160df' };
const post = (handler, body, options = {}) => handler(new Request('https://example.test/api/shortcuts/bookmarks', {
  method: options.method || 'POST', headers: options.headers || { 'Content-Type': 'application/json', 'X-Pocket-Kit': '1', 'Sec-Fetch-Site': 'same-origin' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}));
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'pocket-kit-bookmarks-'));
  try { const file = join(directory, 'bookmarks.json'); await run(createHandler({ bookmarksFile: file }), file, directory); }
  finally { if (!directory.startsWith(join(tmpdir(), 'pocket-kit-bookmarks-'))) throw new Error('Unsafe cleanup'); await rm(directory, { recursive: true }); }
}
test('add and update use atomic private storage, preserve icons and hidden metadata', () => fixture(async (handler, file, directory) => {
  let snapshot = await (await handler()).json();
  let response = await post(handler, { action: 'add', revision: snapshot.revision, ...fields });
  assert.equal(response.status, 200); snapshot = await response.json();
  assert.equal(snapshot.items.length, 1); assert.notEqual(snapshot.items[0].id, '');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  raw[0].iconDataUrl = 'data:image/x-icon;base64,AAABAA=='; raw[0].hidden = 'fixture-only';
  await writeFile(file, JSON.stringify(raw)); snapshot = await (await handler()).json();
  response = await post(handler, { action: 'update', revision: snapshot.revision, id: snapshot.items[0].id, ...fields, title: '新标题' });
  assert.equal(response.status, 200); const saved = await response.json();
  assert.equal(saved.items[0].title, '新标题'); assert.equal(saved.items[0].iconDataUrl, raw[0].iconDataUrl);
  assert.equal(saved.items[0].hidden, undefined);
  assert.equal(JSON.parse(await readFile(file, 'utf8'))[0].hidden, 'fixture-only');
  assert.deepEqual(await readdir(directory), ['bookmarks.json']);
}));
test('stale revisions and simultaneous writers cannot overwrite each other', () => fixture(async (handler, file) => {
  const { revision } = await (await handler()).json();
  const second = createHandler({ bookmarksFile: file });
  const responses = await Promise.all([handler, second].map(h => post(h, { action: 'add', revision, ...fields })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await (await handler()).json()).items.length, 1);
  const stale = await post(handler, { action: 'add', revision, ...fields }); assert.equal(stale.status, 409);
}));
test('writes reject unsafe inputs, CSRF, wrong content type and oversized bodies', () => fixture(async handler => {
  const { revision } = await (await handler()).json();
  const command = { action: 'add', revision, ...fields };
  for (const change of [{ url: 'javascript:alert(1)' }, { url: 'https://user:pass@example.com' }, { title: ' ' }, { color: 'red' }, { token: 'no' }, { notes: 'x'.repeat(20001) }, { action: 'delete' }]) {
    assert.equal((await post(handler, { ...command, ...change })).status, 400);
  }
  assert.equal((await post(handler, command, { headers: { 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await post(handler, command, { headers: { 'Content-Type': 'application/json', 'X-Pocket-Kit': '1', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await post(handler, command, { headers: { 'Content-Type': 'text/plain', 'X-Pocket-Kit': '1' } })).status, 415);
  assert.equal((await post(handler, '{')).status, 400);
  assert.equal((await post(handler, 'x'.repeat(65537))).status, 413);
  assert.equal((await post(handler, command, { method: 'PUT' })).status, 405);
  assert.deepEqual((await (await handler()).json()).items, []);
}));
test('invalid existing data is never overwritten by writes', () => fixture(async (handler, file) => {
  const { revision } = await (await handler()).json();
  await writeFile(file, '{broken-fixture');
  assert.equal((await post(handler, { action: 'add', revision, ...fields })).status, 500);
  assert.equal(await readFile(file, 'utf8'), '{broken-fixture');
}));
test('missing bookmarks are empty; malformed files fail without leaking contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pocket-kit-bookmarks-'));
  const file = join(directory, 'bookmarks.json');
  try {
    const handler = createHandler({ bookmarksFile: file });
    const empty = await (await handler()).json();
    assert.deepEqual(empty.items, []);
    assert.match(empty.revision, /^[a-f0-9]{64}$/);
    await writeFile(file, '{invalid-test-fixture');
    const response = await handler();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Unable to read bookmarks' });
  } finally {
    if (!directory.startsWith(join(tmpdir(), 'pocket-kit-bookmarks-'))) throw new Error('Unsafe cleanup');
    await rm(directory, { recursive: true });
  }
});
