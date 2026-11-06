import { readFile } from 'node:fs/promises';

export const inject = ['connection'];
const defaultFile = new URL('../../.local/bookmarks.json', import.meta.url);

// Only explicitly displayable fields cross the authenticated browser boundary.
// This is a bookmark list, never a credential vault.
export function publicBookmarks(value) {
  if (!Array.isArray(value)) throw new TypeError('Bookmarks must be an array');
  const ids = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.title !== 'string' || !item.title.trim()) throw new TypeError('Invalid bookmark');
    ids.add(item.id);
    const url = new URL(item.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Unsafe bookmark URL');
    const result = { id: item.id, title: item.title, url: url.href };
    for (const key of ['description', 'notes', 'color']) if (typeof item[key] === 'string') result[key] = item[key];
    if (typeof item.iconDataUrl === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/i.test(item.iconDataUrl)) result.iconDataUrl = item.iconDataUrl;
    return result;
  });
}

export function createHandler({ bookmarksFile = defaultFile } = {}) {
  return async () => {
    try {
      let raw;
      try { raw = await readFile(bookmarksFile, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; raw = '[]'; }
      return Response.json({ items: publicBookmarks(JSON.parse(raw)) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'Unable to read bookmarks' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
  };
}

export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/shortcuts/bookmarks', methods: ['GET'], requestBody: 'buffered',
    fetch: createHandler(),
  }));
}
