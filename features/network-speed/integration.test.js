// Bounded loopback-only HTTP integration, using the same request-body modes
// and Request/Response boundary as DSH's Connection carrier. No public traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { webcrypto } from 'node:crypto';
import { createSpeedTestServer } from './server.js';
import { createSpeedTestRunner } from './measurement.js';

test('measurement engine completes through real streaming HTTP without GET bodies', { timeout: 5000 }, async t => {
  const backend = createSpeedTestServer({ maxBytes: 65536, maxChunkBytes: 16384, phaseMs: 500, cooldownMs: 0 });
  const requests = [];
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController();
    outgoing.on('close', () => { if (!outgoing.writableEnded) abort.abort(); });
    try {
      const url = new URL(incoming.url, 'http://localhost');
      const route = backend.routes.find(item => item.path === url.pathname);
      if (!route) { outgoing.writeHead(404); outgoing.end(); return; }
      requests.push(url.pathname);
      const options = { method: incoming.method, headers: incoming.headers, signal: abort.signal };
      if (route.requestBody === 'streaming') {
        options.body = Readable.toWeb(incoming); options.duplex = 'half';
      } else {
        const chunks = [];
        for await (const chunk of incoming) chunks.push(chunk);
        if (chunks.length) options.body = Buffer.concat(chunks);
      }
      const response = await route.fetch(new Request(url, options));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        for await (const chunk of response.body) {
          if (abort.signal.aborted) break;
          if (!outgoing.write(chunk)) await once(outgoing, 'drain', { signal: abort.signal });
        }
      }
      outgoing.end();
    } catch (error) {
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    backend.dispose();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const snapshots = [];
  const runner = createSpeedTestRunner({ baseUrl: `http://127.0.0.1:${server.address().port}/`, cryptoImpl: webcrypto, onUpdate: state => snapshots.push(state) });
  t.after(() => runner.dispose());
  await runner.run();
  const result = snapshots.at(-1);
  assert.equal(result.status, 'done', JSON.stringify(result));
  assert.equal(result.download.bytes, 65536);
  assert.equal(result.upload.bytes, 65536);
  assert.ok(result.download.mbps > 0 && result.upload.mbps > 0);
  assert.ok(result.latency > 0);
  assert.equal(requests.at(-1), '/api/network-speed/stop');
});
