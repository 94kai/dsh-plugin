import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const inject = ['connection'];
const defaultFile = new URL('../../.local/bookmarks.json', import.meta.url);
const queues = new Map();
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const revision = raw => createHash('sha256').update(raw).digest('hex');
class InputError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

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

function validate(input) {
  const fail = () => { throw new InputError(400, '输入无效，请检查标题、网址和字段长度。'); };
  if (!input || !['add', 'update'].includes(input.action) || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) fail();
  if (Object.keys(input).some(key => !['action', 'revision', 'id', 'title', 'url', 'description', 'notes', 'color'].includes(key))) fail();
  if (input.action === 'update' && (typeof input.id !== 'string' || !input.id)) fail();
  const fields = {};
  for (const [key, max] of Object.entries({ title: 200, url: 8192, description: 1000, notes: 20000, color: 100 })) {
    if (typeof input[key] !== 'string' || input[key].length > max) fail();
    fields[key] = key === 'notes' ? input[key] : input[key].trim();
  }
  if (!fields.title || !fields.url || (fields.color && !/^#[a-f0-9]{6}$/i.test(fields.color))) fail();
  try { publicBookmarks([{ id: 'validate', ...fields }]); } catch { fail(); }
  return fields;
}

export function createHandler({ bookmarksFile = defaultFile } = {}) {
  const file = bookmarksFile instanceof URL ? fileURLToPath(bookmarksFile) : resolve(bookmarksFile);
  async function load() {
    let raw;
    try { raw = await readFile(file, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; raw = '[]'; }
    const items = JSON.parse(raw);
    return { raw, items, snapshot: { items: publicBookmarks(items), revision: revision(raw) } };
  }
  async function save(items) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    let handle, created = false;
    try {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      handle = await open(temporary, 'wx', 0o600); created = true;
      const raw = `${JSON.stringify(items, null, 2)}\n`;
      await handle.writeFile(raw, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
      if (dirname(temporary) !== dirname(file) || temporary === file) throw new Error('Invalid temporary path');
      await rename(temporary, file); created = false;
      return { items: publicBookmarks(items), revision: revision(raw) };
    } finally {
      if (handle) await handle.close().catch(() => {});
      if (created && dirname(temporary) === dirname(file) && temporary !== file) await unlink(temporary).catch(() => {});
    }
  }
  return async request => {
    try {
      if (!request || request.method === 'GET') return Response.json((await load()).snapshot, { headers });
      if (request.method !== 'POST') throw new InputError(405, '仅支持 GET 和 POST。');
      const site = request.headers.get('sec-fetch-site');
      if (request.headers.get('x-pocket-kit') !== '1' || (site && !['same-origin', 'none'].includes(site))) throw new InputError(403, '请从当前工具箱页面保存。');
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new InputError(415, '需要 JSON 请求。');
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 64 * 1024) throw new InputError(413, '输入内容过长。');
      let input;
      try { input = JSON.parse(raw); } catch { throw new InputError(400, 'JSON 格式无效。'); }
      const fields = validate(input);
      const previous = queues.get(file) ?? Promise.resolve();
      const result = previous.then(async () => {
        const { items, snapshot } = await load();
        if (input.revision !== snapshot.revision) throw new InputError(409, '链接已在其他页面更新，请保留输入，取消后刷新链接再编辑。');
        if (input.action === 'add') {
          if (items.length >= 2000) throw new InputError(400, '最多保存 2000 个快捷入口。');
          items.push({ id: randomUUID(), ...fields });
        } else {
          const item = items.find(item => item.id === input.id);
          if (!item) throw new InputError(404, '该快捷入口已不存在，请刷新。');
          // Preserve existing icons and non-display metadata without exposing them.
          Object.assign(item, fields);
        }
        return save(items);
      });
      const tail = result.catch(() => {}); queues.set(file, tail);
      void tail.then(() => { if (queues.get(file) === tail) queues.delete(file); });
      return Response.json(await result, { headers });
    } catch (error) {
      return Response.json({ error: error instanceof InputError ? error.message : 'Unable to read bookmarks' }, { status: error.status ?? 500, headers });
    }
  };
}

export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/shortcuts/bookmarks', methods: ['GET', 'POST'], requestBody: 'buffered',
    fetch: createHandler(),
  }));
}
