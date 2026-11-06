import { randomBytes } from 'node:crypto';

export const SPEED_TEST_PROTOCOL = 'dsh-network-speed-v1';
export const SPEED_TEST_SCHEMA = 1;
const DEFAULTS = Object.freeze({
  phaseMs: 8000, maxBytes: 134217728, maxChunkBytes: 4194304,
  ttlMs: 45000, maxSessions: 2, cooldownMs: 3000,
  requestMs: 12000, stallMs: 3000, cleanupMs: 1000,
});
const COMMON_HEADERS = {
  'X-DSH-Speed-Protocol': '1',
  'Cache-Control': 'no-store, no-transform',
  'Content-Encoding': 'identity',
  'X-Accel-Buffering': 'no',
  'X-Content-Type-Options': 'nosniff',
};
class TestError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
function integer(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { ...COMMON_HEADERS, 'Content-Type': 'application/json' },
  });
}
// Cancellation of an untrusted underlying source is deliberately fire-and-forget.
function cancelReader(reader) {
  try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* already closed */ }
}

/**
 * Native Fetch routes for ctx.connection.fetch.register(route).
 * Authentication and Origin checks belong to Connection. The additional marker
 * prevents ordinary cross-origin forms/images from starting or consuming tests.
 * Limits may only be lowered; timer injection is for deterministic resource tests.
 * Reserved bytes are never refunded, even on cancellation, so concurrent requests
 * cannot reuse a reservation to exceed either session's directional byte budget.
 */
export function createSpeedTestServer(options = {}) {
  const config = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (options[key] === undefined) continue;
    const minimum = key === 'cooldownMs' ? 0 : 1;
    if (!Number.isSafeInteger(options[key]) || options[key] < minimum || options[key] > DEFAULTS[key]) {
      throw new RangeError(`Invalid speed test option: ${key}`);
    }
    config[key] = options[key];
  }
  const timers = options.timers ?? { setTimeout, clearTimeout, setInterval, clearInterval };
  const now = () => performance.now();
  const sessions = new Map();
  const stopped = new Map();
  const operations = new Set();
  let disposed = false;
  let lastStart = -Infinity;
  const limits = Object.freeze({
    phaseMs: config.phaseMs, maxBytes: config.maxBytes,
    maxChunkBytes: config.maxChunkBytes, ttlMs: config.ttlMs,
  });

  function endSession(session, error) {
    sessions.delete(session.id);
    for (const operation of [...session.operations]) operation.abort(error);
  }
  function prune() {
    const time = now();
    for (const session of sessions.values()) {
      if (time >= session.expires) endSession(session, new TestError('SESSION_EXPIRED', 404));
    }
    for (const [id, expiry] of stopped) if (time >= expiry) stopped.delete(id);
  }
  const cleanupTimer = timers.setInterval(prune, config.cleanupMs);
  cleanupTimer?.unref?.();

  function sessionId(request) {
    const id = request.headers.get('X-DSH-Speed-Id');
    if (!id || !/^[a-f0-9]{48}$/.test(id)) throw new TestError('INVALID_TEST_ID', 400);
    return id;
  }
  function requireSession(request) {
    const session = sessions.get(sessionId(request));
    if (!session) throw new TestError('SESSION_NOT_FOUND', 404);
    return session;
  }
  function reserve(session, direction, bytes) {
    if (session.operations.size >= 2) throw new TestError('TOO_MANY_TRANSFERS', 429);
    if (bytes <= 0) throw new TestError('INVALID_BYTES', 400);
    if (bytes > config.maxChunkBytes) throw new TestError('REQUEST_TOO_LARGE', 413);
    if (session[direction] + bytes > config.maxBytes) throw new TestError('BUDGET_EXCEEDED', 413);
    const phase = `${direction}Started`;
    session[phase] ??= now();
    if (now() >= session[phase] + config.phaseMs) throw new TestError('PHASE_EXPIRED', 408);
    session[direction] += bytes;
    return Math.min(session.expires, session[phase] + config.phaseMs, now() + config.requestMs);
  }

  function operation(session, request, deadline, onAbort) {
    let closed = false;
    let timeout;
    let stalled;
    let reason;
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    // A download has no awaiting handler after returning Response.
    aborted.catch(() => {});
    const item = {
      get reason() { return reason; },
      aborted,
      close() {
        if (closed) return;
        closed = true;
        timers.clearTimeout(timeout);
        timers.clearTimeout(stalled);
        request.signal.removeEventListener('abort', requestAborted);
        operations.delete(item);
        session.operations.delete(item);
      },
      abort(error) {
        if (closed) return;
        reason = error;
        item.close();
        rejectAbort(error);
        try { onAbort(error); } catch { /* source may already have closed */ }
      },
      touch() {
        if (closed) return;
        timers.clearTimeout(stalled);
        stalled = timers.setTimeout(() => item.abort(new TestError('STALL_TIMEOUT', 408)), config.stallMs);
        stalled?.unref?.();
      },
    };
    function requestAborted() { item.abort(new TestError('REQUEST_ABORTED', 408)); }
    operations.add(item);
    session.operations.add(item);
    request.signal.addEventListener('abort', requestAborted, { once: true });
    timeout = timers.setTimeout(() => item.abort(new TestError('REQUEST_TIMEOUT', 408)), Math.max(0, deadline - now()));
    timeout?.unref?.();
    item.touch();
    if (request.signal.aborted) requestAborted();
    return item;
  }

  function start() {
    if (sessions.size >= config.maxSessions) throw new TestError('TOO_MANY_TESTS', 429);
    const time = now();
    if (time - lastStart < config.cooldownMs) throw new TestError('START_COOLDOWN', 429);
    const id = randomBytes(24).toString('hex');
    sessions.set(id, { id, expires: time + config.ttlMs, download: 0, upload: 0, operations: new Set() });
    lastStart = time;
    return json({ testId: id, protocol: SPEED_TEST_PROTOCOL, schema: SPEED_TEST_SCHEMA, limits });
  }
  function ping(request) {
    if (request.headers.has('X-DSH-Speed-Id')) requireSession(request);
    return json({ protocol: SPEED_TEST_PROTOCOL, schema: SPEED_TEST_SCHEMA, nonce: randomBytes(12).toString('hex') });
  }
  function download(request) {
    const session = requireSession(request);
    const query = new URL(request.url).searchParams;
    if (query.getAll('bytes').length !== 1) throw new TestError('INVALID_BYTES', 400);
    const bytes = integer(query.get('bytes'));
    if (bytes === null) throw new TestError('INVALID_BYTES', 400);
    const deadline = reserve(session, 'download', bytes);
    const pool = randomBytes(Math.min(65536, bytes));
    let remaining = bytes;
    let controller;
    let active;
    const body = new ReadableStream({
      start(value) { controller = value; },
      pull() {
        if (active.reason) return;
        if (now() >= deadline) {
          active.abort(new TestError('REQUEST_TIMEOUT', 408));
          return;
        }
        active.touch();
        const size = Math.min(remaining, pool.length);
        // Copy each view: a consumer must not mutate a future recycled chunk.
        controller.enqueue(new Uint8Array(pool.subarray(0, size)));
        remaining -= size;
        if (remaining === 0) { controller.close(); active.close(); }
      },
      cancel() { active.close(); },
    }, { highWaterMark: 0 });
    active = operation(session, request, deadline, error => controller.error(error));
    return new Response(body, { headers: {
      ...COMMON_HEADERS, 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes),
    } });
  }
  async function upload(request) {
    const session = requireSession(request);
    const mediaType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    if (mediaType !== 'application/octet-stream') throw new TestError('UNSUPPORTED_MEDIA_TYPE', 415);
    const encoding = request.headers.get('Content-Encoding');
    if (encoding !== null && encoding.trim().toLowerCase() !== 'identity') throw new TestError('UNSUPPORTED_ENCODING', 415);
    const length = request.headers.get('Content-Length');
    const explicit = request.headers.get('X-DSH-Speed-Bytes');
    if (length === null && explicit === null) throw new TestError('LENGTH_REQUIRED', 400);
    const lengthBytes = length === null ? null : integer(length);
    const explicitBytes = explicit === null ? null : integer(explicit);
    if ((length !== null && lengthBytes === null) || (explicit !== null && explicitBytes === null)) {
      throw new TestError('INVALID_LENGTH', 400);
    }
    if (lengthBytes !== null && explicitBytes !== null && lengthBytes !== explicitBytes) {
      throw new TestError('LENGTH_MISMATCH', 400);
    }
    const expected = lengthBytes ?? explicitBytes;
    if (!request.body) throw new TestError('BODY_REQUIRED', 400);
    const deadline = reserve(session, 'upload', expected);
    let reader;
    try { reader = request.body.getReader(); } catch { throw new TestError('BODY_UNAVAILABLE', 409); }
    const started = now();
    let bytes = 0;
    let emptyChunks = 0;
    const active = operation(session, request, deadline, () => cancelReader(reader));
    try {
      while (true) {
        if (active.reason) throw active.reason;
        if (now() >= deadline) throw new TestError('REQUEST_TIMEOUT', 408);
        const result = await Promise.race([reader.read(), active.aborted]);
        if (active.reason) throw active.reason;
        if (now() >= deadline) throw new TestError('REQUEST_TIMEOUT', 408);
        if (result.done) break;
        if (!(result.value instanceof Uint8Array)) throw new TestError('INVALID_BODY', 400);
        const size = result.value.byteLength;
        emptyChunks = size === 0 ? emptyChunks + 1 : 0;
        if (emptyChunks > 32) throw new TestError('INVALID_BODY', 400);
        if (size > config.maxChunkBytes - bytes || size > config.maxBytes - bytes) {
          throw new TestError('REQUEST_TOO_LARGE', 413);
        }
        if (size > expected - bytes) throw new TestError('LENGTH_MISMATCH', 400);
        bytes += size;
        // Empty chunks cannot keep a stalled transfer alive.
        if (size > 0) active.touch();
      }
      if (bytes !== expected) throw new TestError('LENGTH_MISMATCH', 400);
      return json({ bytes, elapsedMs: Math.max(0, now() - started) });
    } catch (error) {
      cancelReader(reader);
      throw error instanceof TestError ? error : new TestError('BODY_READ_FAILED', 400);
    } finally {
      active.close();
      try { reader.releaseLock(); } catch { /* outstanding hostile read */ }
    }
  }
  function stop(request) {
    const id = sessionId(request);
    const session = sessions.get(id);
    if (session) {
      stopped.set(id, session.expires);
      endSession(session, new TestError('TEST_STOPPED', 409));
    } else if (!stopped.has(id)) throw new TestError('SESSION_NOT_FOUND', 404);
    return json({ stopped: true });
  }
  function route(name, method, handler) {
    return {
      // DSH's streaming request bridge always supplies a body, which is invalid
      // for GET. Only upload needs streaming input; output remains streamed.
      path: `/api/network-speed/${name}`, methods: [method], requestBody: name === 'upload' ? 'streaming' : 'buffered',
      async fetch(request) {
        try {
          if (disposed) throw new TestError('SERVER_DISPOSED', 503);
          if (request.headers.get('X-DSH-Speed-Test') !== '1') throw new TestError('MARKER_REQUIRED', 403);
          if (request.method !== method) throw new TestError('METHOD_NOT_ALLOWED', 405);
          if (request.signal.aborted) throw new TestError('REQUEST_ABORTED', 408);
          prune();
          if (name !== 'upload' && request.body) throw new TestError('UNEXPECTED_BODY', 400);
          return await handler(request);
        } catch (error) {
          // Reject control bodies and invalid upload headers without draining.
          if (request.body && !request.body.locked) {
            try { const reader = request.body.getReader(); cancelReader(reader); reader.releaseLock(); } catch { /* disturbed body */ }
          }
          return json({ error: error instanceof TestError ? error.code : 'INTERNAL_ERROR' }, error instanceof TestError ? error.status : 500);
        }
      },
    };
  }
  const routes = [route('start', 'POST', start), route('ping', 'GET', ping),
    route('download', 'GET', download), route('upload', 'POST', upload), route('stop', 'POST', stop)];
  function dispose() {
    if (disposed) return;
    disposed = true;
    timers.clearInterval(cleanupTimer);
    for (const active of [...operations]) active.abort(new TestError('SERVER_DISPOSED', 503));
    sessions.clear();
    stopped.clear();
  }
  return { routes, dispose };
}
