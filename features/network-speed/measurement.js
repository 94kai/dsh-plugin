// Browser-side measurement engine. No DOM, React, persistence, or background runs.
export class SpeedTestError extends Error {
  constructor(code, status) { super(code); this.name = 'SpeedTestError'; this.code = code; this.status = status; }
}
// The engine keeps decimal Mbps internally; the UI displays decimal MB/s.
export function toMegabytesPerSecond(mbps) {
  return typeof mbps === 'number' && Number.isFinite(mbps) ? mbps / 8 : null;
}
export function byteRateDisplay(mbps) {
  const value = toMegabytesPerSecond(mbps);
  return value !== null && value < 1
    ? { value: value * 1000, unit: 'KB/s' }
    : { value, unit: 'MB/s' };
}
export function initialSpeedState() {
  const metric = () => ({ bytes: 0, submitted: 0, mbps: null, durationMs: 0, complete: false, capped: false });
  return { status: 'idle', phase: 'preparing', latency: null, jitter: null, download: metric(), upload: metric(), samples: [], error: null, limits: null, finishedAt: null };
}
export function createSpeedTestRunner({ baseUrl, onUpdate = () => {}, fetchImpl = globalThis.fetch.bind(globalThis), now = () => performance.now(), cryptoImpl = globalThis.crypto } = {}) {
  let active = null;
  let disposed = false;
  let state = initialSpeedState();
  const endpoint = name => new URL(`api/network-speed/${name}`, baseUrl);
  const publish = () => {
    if (!disposed) onUpdate({ ...state, download: { ...state.download }, upload: { ...state.upload }, samples: state.samples.map(sample => ({ ...sample })) });
  };
  function boundedSignal(parent, ms, code) {
    const controller = new AbortController();
    const abort = () => controller.abort(parent.reason);
    if (parent?.aborted) abort(); else parent?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new SpeedTestError(code)), ms);
    return { signal: controller.signal, dispose() { clearTimeout(timer); parent?.removeEventListener('abort', abort); } };
  }
  async function request(name, { signal, testId, bytes, method = 'GET', body } = {}) {
    const url = endpoint(name);
    url.searchParams.set('nonce', cryptoImpl.randomUUID());
    if (bytes !== undefined && method === 'GET') url.searchParams.set('bytes', String(bytes));
    const headers = { 'X-DSH-Speed-Test': '1' };
    if (testId) headers['X-DSH-Speed-Id'] = testId;
    if (body) { headers['Content-Type'] = 'application/octet-stream'; headers['X-DSH-Speed-Bytes'] = String(bytes); }
    let response;
    try { response = await fetchImpl(url, { method, body, headers, signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' }); }
    catch (error) { if (signal?.aborted) throw signal.reason; throw new SpeedTestError('NETWORK_ERROR'); }
    if (!response.ok) {
      let code = response.status === 401 || response.status === 403 ? 'UNAUTHORIZED' : response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
      try { const body = await response.json(); if (typeof body.error === 'string') code = body.error; } catch { /* Non-JSON proxy failure. */ }
      throw new SpeedTestError(code, response.status);
    }
    if (response.headers.get('X-DSH-Speed-Protocol') !== '1') {
      void response.body?.cancel().catch(() => {});
      throw new SpeedTestError('PROTOCOL_ERROR');
    }
    return response;
  }
  async function jsonRequest(name, options, timeout = 4000) {
    const scope = boundedSignal(options.signal, timeout, 'REQUEST_TIMEOUT');
    try {
      const response = await request(name, { ...options, signal: scope.signal });
      return await response.json();
    } catch (error) {
      if (scope.signal.aborted) throw scope.signal.reason;
      if (error instanceof SpeedTestError) throw error;
      throw new SpeedTestError('PROTOCOL_ERROR');
    } finally { scope.dispose(); }
  }
  async function run() {
    if (active || disposed) return;
    const controller = new AbortController();
    active = controller;
    const overall = setTimeout(() => controller.abort(new SpeedTestError('TEST_TIMEOUT')), 40000);
    state = initialSpeedState(); state.status = 'running'; publish();
    let testId;
    let chartStart;
    try {
      const started = await jsonRequest('start', { method: 'POST', signal: controller.signal });
      testId = started.testId;
      const limits = started.limits;
      if (typeof testId !== 'string' || !testId || !limits || !Number.isInteger(limits.phaseMs) || limits.phaseMs < 1 || limits.phaseMs > 10000 || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 1 || limits.maxBytes > 128 * 1024 * 1024 || !Number.isSafeInteger(limits.maxChunkBytes) || limits.maxChunkBytes < 1 || limits.maxChunkBytes > 4 * 1024 * 1024) throw new SpeedTestError('PROTOCOL_ERROR');
      state.limits = limits;
      state.phase = 'latency'; publish();
      const rtts = [];
      // Discard one connection-warmup request; report HTTP request RTT, not ICMP ping.
      for (let i = 0; i < 6; i++) {
        const t0 = now();
        const pong = await jsonRequest('ping', { testId, signal: controller.signal }, 3000);
        if (pong.protocol !== 'dsh-network-speed-v1') throw new SpeedTestError('PROTOCOL_ERROR');
        if (i) rtts.push(Math.max(0, now() - t0));
      }
      state.latency = [...rtts].sort((a, b) => a - b)[Math.floor(rtts.length / 2)];
      state.jitter = rtts.slice(1).reduce((sum, value, i) => sum + Math.abs(value - rtts[i]), 0) / (rtts.length - 1);
      publish();
      for (const direction of ['download', 'upload']) {
        if (controller.signal.aborted) throw controller.signal.reason;
        const metric = state[direction];
        let payload;
        if (direction === 'upload') {
          payload = new Uint8Array(limits.maxChunkBytes);
          for (let offset = 0; offset < payload.length; offset += 65536) cryptoImpl.getRandomValues(payload.subarray(offset, offset + 65536));
        }
        state.phase = direction; publish();
        const start = now();
        chartStart ??= start;
        let lastAckAt = start;
        let lastPublish = -Infinity;
        let size = Math.min(256 * 1024, limits.maxChunkBytes);
        const scope = boundedSignal(controller.signal, limits.phaseMs, 'PHASE_COMPLETE');
        const sample = (force = false) => {
          const time = now();
          if (!force && time - lastPublish < 150) return;
          const elapsed = direction === 'upload' ? lastAckAt - start : time - start;
          metric.durationMs = Math.max(0, elapsed);
          metric.mbps = metric.bytes > 0 && elapsed > 0 ? metric.bytes * 8 / (elapsed * 1000) : null;
          if (metric.mbps !== null) {
            state.samples.push({ phase: direction, seconds: (time - chartStart) / 1000, mbps: metric.mbps });
            if (state.samples.length > 160) state.samples.shift();
          }
          lastPublish = time; publish();
        };
        try {
          while (metric.submitted < limits.maxBytes && now() - start < limits.phaseMs) {
            if (scope.signal.aborted) throw scope.signal.reason;
            const bytes = Math.min(size, limits.maxBytes - metric.submitted);
            metric.submitted += bytes;
            const roundStart = now();
            if (direction === 'download') {
              const response = await request('download', { testId, bytes, signal: scope.signal });
              const encoding = response.headers.get('Content-Encoding');
              if ((encoding && encoding !== 'identity') || !response.body || response.headers.get('Content-Type')?.split(';')[0] !== 'application/octet-stream' || Number(response.headers.get('Content-Length')) !== bytes) {
                void response.body?.cancel().catch(() => {});
                throw new SpeedTestError('PROTOCOL_ERROR');
              }
              const reader = response.body.getReader();
              let roundBytes = 0;
              try {
                while (true) {
                  const next = await reader.read();
                  if (scope.signal.aborted) throw scope.signal.reason;
                  if (next.done) break;
                  roundBytes += next.value.byteLength;
                  if (roundBytes > bytes) throw new SpeedTestError('PROTOCOL_ERROR');
                  metric.bytes += next.value.byteLength;
                  sample();
                }
                if (roundBytes !== bytes) throw new SpeedTestError('PROTOCOL_ERROR');
              } finally {
                void reader.cancel().catch(() => {});
                reader.releaseLock();
              }
            } else {
              const response = await request('upload', { method: 'POST', testId, bytes, body: payload.subarray(0, bytes), signal: scope.signal });
              const ack = await response.json();
              if (ack.bytes !== bytes) throw new SpeedTestError('PROTOCOL_ERROR');
              metric.bytes += ack.bytes;
              lastAckAt = now();
              sample();
            }
            const roundMs = Math.max(1, now() - roundStart);
            size = Math.min(limits.maxChunkBytes, Math.max(Math.min(65536, limits.maxChunkBytes), Math.round(bytes / roundMs * 750)));
          }
          metric.capped = metric.submitted >= limits.maxBytes;
        } catch (error) {
          if (controller.signal.aborted) throw controller.signal.reason;
          if (scope.signal.reason?.code !== 'PHASE_COMPLETE') throw error;
          // The hard phase window intentionally cancels the last in-flight transfer.
        } finally { scope.dispose(); sample(true); }
        if (metric.bytes === 0 || metric.mbps === null) throw new SpeedTestError('NO_SAMPLES');
        metric.complete = true; publish();
      }
      state.phase = 'complete'; state.status = 'done'; state.finishedAt = Date.now();
    } catch (error) {
      const reason = controller.signal.aborted ? controller.signal.reason : error;
      state.status = reason?.name === 'AbortError' ? 'stopped' : 'error';
      state.error = state.status === 'error' ? (reason?.code || 'NETWORK_ERROR') : null;
    } finally {
      clearTimeout(overall);
      // Stop is independent of the cancelled measurement signal, but also bounded.
      if (testId) {
        try { await jsonRequest('stop', { method: 'POST', testId }, 2000); }
        catch { /* Server TTL still releases an unreachable session. */ }
      }
      if (active === controller) active = null;
      publish();
    }
  }
  return {
    run,
    stop() { active?.abort(new DOMException('Stopped', 'AbortError')); },
    dispose() { disposed = true; active?.abort(new DOMException('Closed', 'AbortError')); },
  };
}
