import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function httpError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export async function readPrivateJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw httpError('小爱本地数据无法读取或格式损坏；未覆盖原文件', 503);
  }
}
const queues = new Map();
export async function savePrivateJson(file, data) {
  const serialized = JSON.stringify(data, null, 2) + '\n';
  const previous = queues.get(file) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
    } finally {
      if (dirname(temporary) !== dirname(file) || temporary === file) throw new Error('Unsafe temporary path');
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  });
  queues.set(file, operation);
  try { return await operation; }
  finally { if (queues.get(file) === operation) queues.delete(file); }
}

export function privateBindHost(value = '127.0.0.1') {
  const host = String(value);
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255) || !/^\d+\.\d+\.\d+\.\d+$/.test(host)) throw httpError('XIAOAI_BIND_HOST 必须为明确的回环或私网 IPv4 地址');
  if (!(parts[0] === 127 || parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168))) throw httpError('禁止在公网或通配地址开放未鉴权音箱端口');
  return host;
}
