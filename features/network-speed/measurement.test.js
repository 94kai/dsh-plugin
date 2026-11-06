import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSpeedTestRunner, toMegabytesPerSecond, byteRateDisplay } from './measurement.js';

test('display converts decimal bit rates to byte rates, retaining missing values', () => {
  assert.equal(toMegabytesPerSecond(8), 1);
  assert.equal(toMegabytesPerSecond(100), 12.5);
  assert.equal(toMegabytesPerSecond(0), 0);
  assert.equal(toMegabytesPerSecond(null), null);
  assert.equal(toMegabytesPerSecond(NaN), null);
});

test('rates below one MB/s use decimal KB/s with an exact boundary', () => {
  assert.deepEqual(byteRateDisplay(4), { value: 500, unit: 'KB/s' });
  assert.deepEqual(byteRateDisplay(7.992), { value: 999, unit: 'KB/s' });
  assert.deepEqual(byteRateDisplay(8), { value: 1, unit: 'MB/s' });
  assert.deepEqual(byteRateDisplay(80), { value: 10, unit: 'MB/s' });
  assert.deepEqual(byteRateDisplay(0), { value: 0, unit: 'KB/s' });
  assert.deepEqual(byteRateDisplay(null), { value: null, unit: 'MB/s' });
});

const headers = { 'X-DSH-Speed-Protocol': '1', 'Content-Type': 'application/json' };
function fixture({ mutate, transferDelay = 2 } = {}) {
  const calls = [];
  const snapshots = [];
  const fetchImpl = async (url, options) => {
    const name = url.pathname.split('/').at(-1);
    calls.push({ name, options, url });
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['X-DSH-Speed-Test'], '1');
    if (mutate) { const special = await mutate(name, url, options); if (special) return special; }
    if (name === 'start') return Response.json({ testId: 'test-1', limits: { phaseMs: 100, maxBytes: 1024, maxChunkBytes: 256, ttlMs: 45000 } }, { headers });
    if (name === 'stop') return Response.json({ stopped: true }, { headers });
    if (name === 'ping') return Response.json({ protocol: 'dsh-network-speed-v1' }, { headers });
    await new Promise((resolve, reject) => {
      if (options.signal.aborted) return reject(options.signal.reason);
      const abort = () => { clearTimeout(timer); reject(options.signal.reason); };
      const timer = setTimeout(() => { options.signal.removeEventListener('abort', abort); resolve(); }, transferDelay);
      options.signal.addEventListener('abort', abort, { once: true });
    });
    if (name === 'download') {
      const size = Number(url.searchParams.get('bytes'));
      return new Response(new Uint8Array(size), { headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Content-Encoding': 'identity' } });
    }
    return Response.json({ bytes: options.body.byteLength }, { headers });
  };
  const runner = createSpeedTestRunner({ baseUrl: 'https://example.test/mount/', fetchImpl, cryptoImpl: webcrypto, onUpdate: state => snapshots.push(state) });
  return { calls, snapshots, runner };
}

test('real byte counts, bounds, sequential stages, units, and session cleanup', async () => {
  const { runner, calls, snapshots } = fixture();
  await runner.run();
  const result = snapshots.at(-1);
  assert.equal(result.status, 'done');
  for (const direction of ['download', 'upload']) {
    const metric = result[direction];
    assert.equal(metric.bytes, 1024);
    assert.equal(metric.submitted, 1024);
    assert.equal(metric.capped, true);
    assert.equal(metric.complete, true);
    assert.ok(metric.durationMs > 0);
    assert.equal(metric.mbps, metric.bytes * 8 / (metric.durationMs * 1000));
  }
  assert.ok(result.latency >= 0 && result.jitter >= 0);
  assert.equal(calls.filter(call => call.name === 'ping').length, 6);
  assert.equal(calls.at(-1).name, 'stop');
  assert.ok(calls.every(call => call.url.pathname.startsWith('/mount/api/network-speed/')));
  assert.ok(calls.findIndex(call => call.name === 'upload') > calls.findLastIndex(call => call.name === 'download'));
  assert.equal(snapshots[0].download.bytes, 0, 'published snapshots are immutable');
  runner.dispose();
});

test('bad upload acknowledgment cannot become a successful speed result', async () => {
  const { runner, snapshots, calls } = fixture({ mutate: name => name === 'upload' ? Response.json({ bytes: 1 }, { headers }) : undefined });
  await runner.run();
  assert.equal(snapshots.at(-1).status, 'error');
  assert.equal(snapshots.at(-1).error, 'PROTOCOL_ERROR');
  assert.equal(snapshots.at(-1).upload.bytes, 0);
  assert.equal(snapshots.at(-1).download.complete, true);
  assert.equal(calls.at(-1).name, 'stop');
});

test('proxy-compressed download is rejected', async () => {
  const { runner, snapshots } = fixture({ mutate: name => name === 'download' ? new Response(new Uint8Array(256), { headers: { ...headers, 'Content-Type':'application/octet-stream', 'Content-Length':'256', 'Content-Encoding':'gzip' } }) : undefined });
  await runner.run();
  assert.equal(snapshots.at(-1).error, 'PROTOCOL_ERROR');
  assert.equal(snapshots.at(-1).download.bytes, 0);
});

test('cancel aborts transfer, preserves incomplete status, and releases session', async () => {
  const { runner, calls, snapshots } = fixture({ transferDelay: 500 });
  const running = runner.run();
  const stopTimer = setTimeout(() => runner.stop(), 15);
  await running;
  clearTimeout(stopTimer);
  assert.equal(snapshots.at(-1).status, 'stopped');
  assert.equal(snapshots.at(-1).download.complete, false);
  assert.equal(calls.at(-1).name, 'stop');
  assert.equal(calls.some(call => call.name === 'upload'), false);
});

test('hard phase deadline ends stalled transfer without false zero result', async () => {
  const { runner, snapshots, calls } = fixture({ transferDelay: 500 });
  await runner.run();
  assert.equal(snapshots.at(-1).status, 'error');
  assert.equal(snapshots.at(-1).error, 'NO_SAMPLES');
  assert.equal(snapshots.at(-1).download.mbps, null);
  assert.equal(calls.at(-1).name, 'stop');
});

test('duplicate run is ignored and dispose suppresses late UI updates', async () => {
  const { runner, snapshots, calls } = fixture({ transferDelay: 500 });
  const running = runner.run();
  await runner.run();
  const count = snapshots.length;
  runner.dispose();
  await running;
  assert.equal(calls.filter(call => call.name === 'start').length, 1);
  assert.equal(snapshots.length, count);
});

test('server failure and unexpected response do not produce measurements', async () => {
  for (const response of [Response.json({error:'RATE_LIMITED'},{status:429}),new Response('<html>wrong route</html>')]) {
    const { runner, snapshots } = fixture({mutate:name=>name==='start'?response:undefined});
    await runner.run();
    assert.equal(snapshots.at(-1).status,'error');
    assert.equal(snapshots.at(-1).download.mbps,null);
  }
});
