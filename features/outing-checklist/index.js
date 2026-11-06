import { ChecklistError, createStore } from './store.js';

export const inject = ['connection'];
const MAX_BODY_BYTES = 64 * 1024;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

// Exported separately for Fetch-native tests; Connection supplies authentication.
export function createHandler(store) {
  return async function fetch(request) {
    try {
      if (request.method === 'GET') return Response.json(await store.read(), { headers });
      if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed', message: 'Use GET or POST' }, { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
      // A non-simple header prevents cross-origin HTML forms and requires a CORS
      // preflight for cross-origin scripts. This route never grants CORS access.
      // Connection additionally validates Host/Origin before invoking this route.
      // Do not compare Origin against the bridge URL (which may be internal HTTP).
      const site = request.headers.get('sec-fetch-site');
      if (request.headers.get('x-outing-checklist') !== '1' || (site && !['same-origin', 'none'].includes(site))) {
        throw new ChecklistError(403, 'csrf_rejected', 'Same-origin request with X-Outing-Checklist: 1 required');
      }
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        throw new ChecklistError(415, 'unsupported_media_type', 'Content-Type must be application/json');
      }
      // Connection's buffered bridge also enforces its configured aggregate cap.
      const raw = await request.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new ChecklistError(413, 'payload_too_large', 'Request body exceeds 64 KiB');
      let command;
      try { command = JSON.parse(raw); }
      catch { throw new ChecklistError(400, 'invalid_json', 'Request body must be valid JSON'); }
      return Response.json(await store.mutate(command), { headers });
    } catch (error) {
      if (error instanceof ChecklistError) {
        return Response.json({ error: error.code, message: error.message, ...error.details }, { status: error.status, headers });
      }
      return Response.json({ error: 'internal_error', message: 'Unable to process checklist request' }, { status: 500, headers });
    }
  };
}

export function apply(ctx, config = {}) {
  const store = createStore({ dataFile: config.dataFile });
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/outing-checklist',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: createHandler(store),
  }));
}
