import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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
test('missing bookmarks are empty; malformed files fail without leaking contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pocket-kit-bookmarks-'));
  const file = join(directory, 'bookmarks.json');
  try {
    const handler = createHandler({ bookmarksFile: file });
    assert.deepEqual(await (await handler()).json(), { items: [] });
    await writeFile(file, '{invalid-test-fixture');
    const response = await handler();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Unable to read bookmarks' });
  } finally {
    if (!directory.startsWith(join(tmpdir(), 'pocket-kit-bookmarks-'))) throw new Error('Unsafe cleanup');
    await rm(directory, { recursive: true });
  }
});
