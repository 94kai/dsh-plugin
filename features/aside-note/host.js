import { createStore, NoteError } from './store.js';
export const inject = ['connection'];
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const MAX_BODY = 2 * 1024 * 1024;
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new NoteError(400, 'invalid_json', '请求内容为空');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new NoteError(413, 'payload_too_large', '迁移数据超过 2 MiB，请分批处理'); }
      chunks.push(Buffer.from(value));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new NoteError(400, 'invalid_json', '请求不是有效的 JSON'); }
  } finally { reader.releaseLock(); }
}
export function createHandler(store) {
  return async request => {
    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        if (url.searchParams.get('export') === '1') return Response.json(await store.export(), { headers: { ...headers, 'Content-Disposition': 'attachment; filename="aside-note-backup.json"' } });
        return Response.json(await store.read({ kind: url.searchParams.get('kind'), id: url.searchParams.get('id') }), { headers });
      }
      if (request.method !== 'POST') return Response.json({ message: '仅支持 GET / POST' }, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
      const site = request.headers.get('sec-fetch-site');
      if (request.headers.get('x-pocket-kit') !== '1' || (site && !['same-origin', 'none'].includes(site))) throw new NoteError(403, 'csrf_rejected', '请从当前页面操作');
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new NoteError(415, 'unsupported_media_type', '需要 JSON 请求');
      return Response.json(await store.mutate(await readBody(request)), { headers });
    } catch (error) {
      if (error instanceof NoteError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers });
      return Response.json({ error: 'internal_error', message: '便笺服务暂不可用，请重试；原数据未覆盖' }, { status: 500, headers });
    }
  };
}
export function apply(ctx, config = {}) {
  const store = createStore({ dataFile: config.dataFile });
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/pocket-kit/aside-note', methods: ['GET', 'POST'], requestBody: 'buffered', fetch: createHandler(store) }));
}
