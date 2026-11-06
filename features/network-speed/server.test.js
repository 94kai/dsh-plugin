import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeedTestServer, SPEED_TEST_PROTOCOL } from './server.js';

function timerTracker() {
  const timeouts = new Set();
  const intervals = new Set();
  return {
    timers: {
      setTimeout(fn, delay) {
        const timer = setTimeout(() => { timeouts.delete(timer); fn(); }, delay);
        timeouts.add(timer);
        return timer;
      },
      clearTimeout(timer) { clearTimeout(timer); timeouts.delete(timer); },
      setInterval(fn, delay) { const timer = setInterval(fn, delay); intervals.add(timer); return timer; },
      clearInterval(timer) { clearInterval(timer); intervals.delete(timer); },
    },
    count: () => timeouts.size + intervals.size,
  };
}
function fixture(t, options = {}) {
  const tracker = timerTracker();
  const server = createSpeedTestServer({
    maxBytes: 32, maxChunkBytes: 16, cooldownMs: 0,
    ...options, timers: tracker.timers,
  });
  t.after(() => { server.dispose(); assert.equal(tracker.count(), 0, 'all owned timers cleaned'); });
  async function call(name, { id, bytes, headers = {}, body, signal, marker = true, method } = {}) {
    const route = server.routes.find(route => route.path.endsWith('/' + name));
    const request = new Request(`http://localhost${route.path}${bytes === undefined ? '' : `?bytes=${bytes}`}`, {
      method: method ?? route.methods[0],
      headers: { ...(name === 'upload' ? { 'Content-Type': 'application/octet-stream' } : {}), ...(marker ? { 'X-DSH-Speed-Test': '1' } : {}), ...(id ? { 'X-DSH-Speed-Id': id } : {}), ...headers },
      ...(body !== undefined ? { body, duplex: 'half' } : {}), ...(signal ? { signal } : {}),
    });
    return route.fetch(request);
  }
  async function start() {
    const result = await call('start');
    assert.equal(result.status, 200);
    return (await result.json()).testId;
  }
  return { ...server, call, start, tracker };
}
async function error(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: code });
}
function stalled(cancel = () => {}) {
  return new ReadableStream({ pull() { return new Promise(() => {}); }, cancel });
}
async function bounded(promise, timeout = 1000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('test operation hung')), timeout); })]); }
  finally { clearTimeout(timer); }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('exact connection route specs and protocol headers; no marker is forbidden everywhere', async t => {
  const server = fixture(t);
  assert.deepEqual(server.routes.map(({ path, methods, requestBody }) => ({ path, methods, requestBody })),
    ['start', 'ping', 'download', 'upload', 'stop'].map(name => ({
      path: '/api/network-speed/' + name, methods: [['ping', 'download'].includes(name) ? 'GET' : 'POST'], requestBody: name === 'upload' ? 'streaming' : 'buffered',
    })));
  for (const name of ['start', 'ping', 'download', 'upload', 'stop']) {
    const response = await server.call(name, { marker: false });
    assert.equal(response.headers.get('X-DSH-Speed-Protocol'), '1');
    await error(response, 403, 'MARKER_REQUIRED');
  }
  const a = await (await server.call('ping')).json();
  const b = await (await server.call('ping')).json();
  assert.equal(a.protocol, SPEED_TEST_PROTOCOL);
  assert.equal(a.schema, 1);
  assert.notEqual(a.nonce, b.nonce);
  await error(await server.call('ping', { method: 'POST' }), 405, 'METHOD_NOT_ALLOWED');
});

test('start limits, unpredictable ids, download exact bytes and successful streamed upload', async t => {
  const server = fixture(t);
  const start = await (await server.call('start')).json();
  assert.deepEqual(start.limits, { phaseMs: 8000, maxBytes: 32, maxChunkBytes: 16, ttlMs: 45000 });
  assert.match(start.testId, /^[a-f0-9]{48}$/);
  assert.notEqual(start.testId, await server.start());
  const response = await server.call('download', { id: start.testId, bytes: 16 });
  assert.equal(response.status, 200);
  for (const [key, value] of Object.entries({ 'Content-Encoding': 'identity', 'Content-Type': 'application/octet-stream', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store, no-transform' })) assert.equal(response.headers.get(key), value);
  assert.equal((await response.arrayBuffer()).byteLength, 16);
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(3)); c.enqueue(new Uint8Array(4)); c.close(); } });
  const upload = await server.call('upload', { id: start.testId, body, headers: { 'X-DSH-Speed-Bytes': '7' } });
  assert.equal(upload.status, 200);
  const receipt = await upload.json();
  assert.equal(receipt.bytes, 7);
  assert.ok(receipt.elapsedMs >= 0);
  assert.equal(server.tracker.count(), 1, 'only the pruning interval remains');
});

test('session capacity, process-wide cooldown and stop idempotency', async t => {
  const server = fixture(t);
  const id = await server.start();
  await server.start();
  await error(await server.call('start'), 429, 'TOO_MANY_TESTS');
  assert.equal((await server.call('stop', { id })).status, 200);
  assert.equal((await server.call('stop', { id })).status, 200);
  await error(await server.call('ping', { id }), 404, 'SESSION_NOT_FOUND');
  await server.start();
  const cooldown = fixture(t, { cooldownMs: 100 });
  await cooldown.start();
  await error(await cooldown.call('start'), 429, 'START_COOLDOWN');
});

test('invalid ids, URL ids, positive query integers and request caps', async t => {
  const server = fixture(t);
  const id = await server.start();
  await error(await server.call('download', { bytes: 1 }), 400, 'INVALID_TEST_ID');
  await error(await server.call('ping', { id: 'a'.repeat(48) }), 404, 'SESSION_NOT_FOUND');
  for (const bytes of ['0', '-1', '1.5', '1e1', '01', '1&bytes=2', '9007199254740992']) {
    await error(await server.call('download', { id, bytes }), 400, 'INVALID_BYTES');
  }
  await error(await server.call('download', { id, bytes: 17 }), 413, 'REQUEST_TOO_LARGE');
  await error(await server.call('upload', { id, body: new Uint8Array(1), headers: { 'X-DSH-Speed-Bytes': '17' } }), 413, 'REQUEST_TOO_LARGE');
});

test('directional budgets reserve before streaming; cancellation cannot refund them', async t => {
  const server = fixture(t);
  const id = await server.start();
  for (let i = 0; i < 2; i++) {
    const response = await server.call('download', { id, bytes: 16 });
    await response.body.cancel();
  }
  await error(await server.call('download', { id, bytes: 1 }), 413, 'BUDGET_EXCEEDED');
  const first = new AbortController();
  const second = new AbortController();
  const p1 = server.call('upload', { id, body: stalled(), headers: { 'X-DSH-Speed-Bytes': '16' }, signal: first.signal });
  const p2 = server.call('upload', { id, body: stalled(), headers: { 'Content-Length': '16' }, signal: second.signal });
  await error(await server.call('upload', { id, body: new Uint8Array(1), headers: { 'X-DSH-Speed-Bytes': '1' } }), 429, 'TOO_MANY_TRANSFERS');
  first.abort(); second.abort();
  await error(await bounded(p1), 408, 'REQUEST_ABORTED');
  await error(await bounded(p2), 408, 'REQUEST_ABORTED');
  await error(await server.call('upload', { id, body: new Uint8Array(1), headers: { 'X-DSH-Speed-Bytes': '1' } }), 413, 'BUDGET_EXCEEDED');
});

test('upload lengths: missing, malformed, conflicting, short, long and oversized actual body', async t => {
  for (const [headers, body, code, status] of [
    [{}, new Uint8Array(1), 'LENGTH_REQUIRED', 400],
    [{ 'Content-Length': '1.5' }, new Uint8Array(1), 'INVALID_LENGTH', 400],
    [{ 'X-DSH-Speed-Bytes': '-1' }, new Uint8Array(1), 'INVALID_LENGTH', 400],
    [{ 'Content-Length': '2', 'X-DSH-Speed-Bytes': '3' }, new Uint8Array(2), 'LENGTH_MISMATCH', 400],
    [{ 'X-DSH-Speed-Bytes': '2' }, new Uint8Array(1), 'LENGTH_MISMATCH', 400],
    [{ 'X-DSH-Speed-Bytes': '1' }, new Uint8Array(2), 'LENGTH_MISMATCH', 400],
    [{ 'X-DSH-Speed-Bytes': '1' }, new Uint8Array(17), 'REQUEST_TOO_LARGE', 413],
    [{ 'X-DSH-Speed-Bytes': '0' }, new Uint8Array(0), 'INVALID_BYTES', 400],
    [{ 'X-DSH-Speed-Bytes': '1' }, undefined, 'BODY_REQUIRED', 400],
  ]) {
    const server = fixture(t);
    await error(await server.call('upload', { id: await server.start(), headers, body }), status, code);
  }
});

test('lazy TTL pruning, interval TTL cleanup, phase deadline and capacity recovery', async t => {
  const server = fixture(t, { ttlMs: 25, cleanupMs: 1000 });
  const id = await server.start();
  await wait(35);
  await error(await server.call('download', { id, bytes: 1 }), 404, 'SESSION_NOT_FOUND');
  await server.start();
  const interval = fixture(t, { ttlMs: 25, cleanupMs: 5 });
  const intervalId = await interval.start();
  const pending = interval.call('upload', { id: intervalId, body: stalled(), headers: { 'X-DSH-Speed-Bytes': '1' } });
  const result = await bounded(pending);
  assert.ok([404, 408].includes(result.status), 'interval or request TTL deadline ends transfer');
  assert.equal(interval.tracker.count(), 1);
  const phase = fixture(t, { phaseMs: 20 });
  const phaseId = await phase.start();
  await (await phase.call('download', { id: phaseId, bytes: 1 })).arrayBuffer();
  await wait(30);
  await error(await phase.call('download', { id: phaseId, bytes: 1 }), 408, 'PHASE_EXPIRED');
});

test('request deadline and data stall end malicious reads without awaiting cancel', async t => {
  for (const options of [{ requestMs: 20, stallMs: 100 }, { requestMs: 100, stallMs: 20 }]) {
    const server = fixture(t, options);
    let canceled = false;
    const response = await bounded(server.call('upload', {
      id: await server.start(), headers: { 'X-DSH-Speed-Bytes': '1' },
      body: stalled(() => { canceled = true; return new Promise(() => {}); }),
    }));
    await error(response, 408, options.requestMs < options.stallMs ? 'REQUEST_TIMEOUT' : 'STALL_TIMEOUT');
    assert.ok(canceled);
    assert.equal(server.tracker.count(), 1);
  }
});

test('abort before handler and while reading download/upload', async t => {
  const server = fixture(t);
  const id = await server.start();
  const aborted = new AbortController(); aborted.abort();
  await error(await server.call('download', { id, bytes: 1, signal: aborted.signal }), 408, 'REQUEST_ABORTED');
  const controller = new AbortController();
  const response = await server.call('download', { id, bytes: 16, signal: controller.signal });
  controller.abort();
  await assert.rejects(response.arrayBuffer(), /REQUEST_ABORTED/);
  const upController = new AbortController();
  const upload = server.call('upload', { id, body: stalled(), signal: upController.signal, headers: { 'X-DSH-Speed-Bytes': '1' } });
  upController.abort();
  await error(await bounded(upload), 408, 'REQUEST_ABORTED');
  assert.equal(server.tracker.count(), 1);
});

test('stop and dispose abort all active streams, clean timers, and are idempotent', async t => {
  for (const finish of ['stop', 'dispose']) {
    const server = fixture(t);
    const id = await server.start();
    const download = await server.call('download', { id, bytes: 16 });
    const upload = server.call('upload', { id, body: stalled(() => new Promise(() => {})), headers: { 'X-DSH-Speed-Bytes': '1' } });
    if (finish === 'stop') await server.call('stop', { id });
    else { server.dispose(); server.dispose(); }
    await assert.rejects(download.arrayBuffer(), finish === 'stop' ? /TEST_STOPPED/ : /SERVER_DISPOSED/);
    await error(await bounded(upload), finish === 'stop' ? 409 : 503, finish === 'stop' ? 'TEST_STOPPED' : 'SERVER_DISPOSED');
    assert.equal(server.tracker.count(), finish === 'stop' ? 1 : 0);
    if (finish === 'dispose') await error(await server.call('ping'), 503, 'SERVER_DISPOSED');
  }
});

test('control POST bodies and rejected uploads are canceled without awaiting hostile cancel', async t => {
  const server = fixture(t);
  let canceled = 0;
  for (const name of ['start', 'stop']) {
    const response = await bounded(server.call(name, { body: stalled(() => { canceled++; return new Promise(() => {}); }) }));
    await error(response, 400, 'UNEXPECTED_BODY');
  }
  const response = await bounded(server.call('upload', { body: stalled(() => { canceled++; return new Promise(() => {}); }), marker: false }));
  await error(response, 403, 'MARKER_REQUIRED');
  assert.equal(canceled, 3);
});

test('empty-chunk storms cannot starve cancellation timers; invalid options cannot increase caps', async t => {
  const server = fixture(t);
  const response = await bounded(server.call('upload', {
    id: await server.start(), headers: { 'X-DSH-Speed-Bytes': '1' },
    body: new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(0)); } }),
  }));
  await error(response, 400, 'INVALID_BODY');
  for (const options of [{ ttlMs: 45001 }, { maxSessions: 3 }, { requestMs: 0 }, { cooldownMs: -1 }, { maxBytes: 1.5 }]) {
    assert.throws(() => createSpeedTestServer(options), RangeError);
  }
});

test('at most two active transfers per session; rejected transfers reserve no bytes', async t => {
  const server = fixture(t, { maxBytes: 3, maxChunkBytes: 3 });
  const id = await server.start();
  const first = await server.call('download', { id, bytes: 1 });
  const second = await server.call('download', { id, bytes: 1 });
  await error(await server.call('download', { id, bytes: 1 }), 429, 'TOO_MANY_TRANSFERS');
  await error(await server.call('upload', { id, headers: { 'X-DSH-Speed-Bytes': '1' }, body: new Uint8Array(1) }), 429, 'TOO_MANY_TRANSFERS');
  await first.body.cancel();
  const last = await server.call('download', { id, bytes: 1 });
  assert.equal(last.status, 200);
  await second.body.cancel(); await last.body.cancel();
  const upload = await server.call('upload', { id, headers: { 'X-DSH-Speed-Bytes': '3' }, body: new Uint8Array(3) });
  assert.equal(upload.status, 200);
  assert.equal(server.tracker.count(), 1);
});

test('upload requires binary MIME and identity encoding', async t => {
  const server = fixture(t);
  const id = await server.start();
  for (const type of ['', 'text/plain', 'application/json']) {
    await error(await server.call('upload', { id, headers: { 'Content-Type': type, 'X-DSH-Speed-Bytes': '1' }, body: new Uint8Array(1) }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  for (const encoding of ['gzip', 'br', 'identity, gzip']) {
    await error(await server.call('upload', { id, headers: { 'Content-Encoding': encoding, 'X-DSH-Speed-Bytes': '1' }, body: new Uint8Array(1) }), 415, 'UNSUPPORTED_ENCODING');
  }
  const response = await server.call('upload', { id, headers: { 'Content-Encoding': 'identity', 'X-DSH-Speed-Bytes': '1' }, body: new Uint8Array(1) });
  assert.equal(response.status, 200);
});

test('large downloads recycle bounded random blocks but deliver independent chunk buffers', async t => {
  const server = fixture(t, { maxBytes: 200000, maxChunkBytes: 150000 });
  const response = await server.call('download', { id: await server.start(), bytes: 150000 });
  const reader = response.body.getReader();
  const first = (await reader.read()).value;
  assert.equal(first.byteLength, 65536);
  const copy = first.slice();
  first.fill(0);
  const second = (await reader.read()).value;
  assert.deepEqual(second, copy);
  const third = (await reader.read()).value;
  assert.equal(first.length + second.length + third.length, 150000);
  assert.equal((await reader.read()).done, true);
  assert.equal(server.tracker.count(), 1);
});
