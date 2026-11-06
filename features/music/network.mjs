import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

export function isPublicAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0,168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18,19,51].includes(b)) || (a === 203 && b === 0));
  }
  // Accept only native global-unicast IPv6; reject mapped IPv4, ULA,
  // link-local, loopback, multicast, documentation and transition ranges.
  return version === 6 && /^[23]/i.test(address) && !/^2001:(?:db8|0|10|20):/i.test(address) && !/^2002:/i.test(address);
}
export async function resolvePublicUrl(input, resolver = lookup) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('仅允许无凭据的公开 HTTP/HTTPS 地址');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address:hostname, family:isIP(hostname) }] : await resolver(hostname, { all:true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('拒绝访问本地、私有或保留网络');
  return { url, address:addresses[0] };
}

// DNS is checked and pinned to the actual connection; every redirect is checked.
// Unlike global fetch this transport cannot silently honor a configured proxy.
export async function publicFetch(input, options = {}, hops = 0) {
  if (hops > 5) throw new Error('远程重定向过多');
  const { url, address } = await resolvePublicUrl(input);
  const body = options.body instanceof URLSearchParams ? options.body.toString() : options.body;
  const response = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method:options.method || 'GET', headers:options.headers, signal:options.signal,
      lookup:(_hostname, opts, callback) => opts.all ? callback(null,[address]) : callback(null,address.address,address.family),
    }, incoming => resolve(incoming));
    request.once('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
  if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
    response.destroy();
    const next = new URL(response.headers.location,url);
    const headers = new Headers(options.headers);
    if (next.origin !== url.origin) { headers.delete('cookie'); headers.delete('authorization'); }
    const method = response.statusCode === 303 || ([301,302].includes(response.statusCode) && options.method === 'POST') ? 'GET' : options.method;
    return publicFetch(next, { ...options,headers:Object.fromEntries(headers),method,body:method==='GET'?undefined:body },hops+1);
  }
  const headers = new Headers();
  for (const [name,value] of Object.entries(response.headers)) for (const item of Array.isArray(value)?value:[value]) if(item!==undefined) headers.append(name,item);
  return new Response([204,205,304].includes(response.statusCode) ? null : Readable.toWeb(response), { status:response.statusCode, headers });
}
