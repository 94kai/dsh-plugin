import { Readable, PassThrough } from 'node:stream';

export function failure(status, message) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// 将已有 Node HTTP 业务处理器接到 DSH Fetch；不另开HTTP端口。
export function nodeHandlerResponse(handler, { method = 'GET', url, body, headers = {}, signal }) {
  return new Promise(resolve => {
    const input = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    input.method = method;
    input.signal = signal;
    input.headers = { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) };
    input.url = url.pathname + url.search;
    const output = new PassThrough({ highWaterMark: 64 * 1024 });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    let sent = false;
    output.setHeader = (key, value) => responseHeaders.set(key, String(value));
    output.getHeader = key => responseHeaders.get(key);
    output.writeHead = (status, values = {}) => {
      if (sent) return output;
      for (const [key,value] of Object.entries(values)) responseHeaders.set(key,String(value));
      // 所有响应禁止共享缓存，特别是用户音频和状态。
      responseHeaders.set('Cache-Control','no-store');
      sent = true;
      resolve(new Response(Readable.toWeb(output), { status, headers: responseHeaders }));
      return output;
    };
    const abort = () => {
      input.destroy(); output.destroy();
      if (!sent) { sent = true; resolve(failure(499,'请求已取消')); }
    };
    output.on('error', () => {});
    output.on('pipe', source => output.once('close', () => source.destroy()));
    input.on('error', () => {});
    output.once('close', () => signal?.removeEventListener('abort',abort));
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) return abort();
    Promise.resolve().then(() => handler(input,output,url)).then(handled => {
      if (!handled && !sent) { sent = true; output.destroy(); resolve(failure(404,'操作不存在')); }
    }).catch(error => {
      if (sent) { output.destroy(error); return; }
      sent = true; output.destroy();
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
      resolve(failure(status, error.status && typeof error.message === 'string' ? error.message : '操作失败，请检查功能配置或稍后重试。'));
    });
  });
}

export async function readEnvelope(request) {
  if (request.headers.get('x-pocket-kit') !== '1' || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw Object.assign(new Error('需要同源 JSON 请求和 X-Pocket-Kit 请求头'),{status:403});
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin','none'].includes(site)) throw Object.assign(new Error('拒绝跨站请求'),{status:403});
  const text = await request.text();
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Object.assign(new Error('请求内容不能超过 2 MiB'),{status:413});
  let input;
  try { input = JSON.parse(text); } catch { throw Object.assign(new Error('JSON 格式错误'),{status:400}); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('请求格式错误'),{status:400});
  return input;
}
