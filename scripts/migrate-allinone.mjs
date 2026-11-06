import { cp, mkdir, readFile, writeFile, readdir, lstat, chmod, access } from 'node:fs/promises';
import { resolve, join, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 显式运行的一次性迁移：只读来源，绝不启动旧模块或覆盖已有目标。
const destination = resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = resolve(process.argv[2] || '');
if (!process.argv[2] || source === destination) throw new Error('Usage: node scripts/migrate-allinone.mjs /absolute/source/project');
const local = join(destination, '.local');
const modules = ['music-download', 'xiaoai-music', 'xiaoai-assistant'];
const targetConfig = join(local, 'integrations.json');
for (const target of [targetConfig, ...modules.map(name => join(local, 'data', name))]) {
  try { await access(target); throw new Error('Migration target already exists; refusing overwrite.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const env = {};
try {
  for (const line of (await readFile(join(source, '.env'), 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const remap = value => typeof value === 'string' && value.startsWith(join(source, 'data') + sep)
  ? join(local, 'data', relative(join(source, 'data'), value)) : value;
const selectedEnv = Object.fromEntries(Object.entries(env).filter(([key]) => /^(MUSIC_|NETEASE_|XIAOAI_)/.test(key)).map(([key,value]) => [key, remap(value)]));
if (!selectedEnv.NETEASE_COOKIE_SECRET && env.DEVSTUDIO_TOKEN) selectedEnv.NETEASE_COOKIE_SECRET = env.DEVSTUDIO_TOKEN;
// 下载文件与既有工具已复制到本地；旧部署可能使用容器绝对路径，不能照搬执行。
selectedEnv.MUSIC_DOWNLOAD_DIR = join(local, 'data', 'music-download', 'downloads');
selectedEnv.MUSIC_MEDIA_GET_PATH = join(local, 'data', 'music-download', 'bin', 'media-get');
// 不迁移已启用的兼容网络许可；用户必须在新部署显式确认网络边界。
delete selectedEnv.XIAOAI_ALLOW_LAN_UNAUTHENTICATED;
const roots = (env.FILE_ROOTS || `Home:${homedir()}`).split(',').filter(Boolean).map((value, index) => {
  const split = value.indexOf(':');
  const path = resolve(split > 0 ? value.slice(split + 1).trim() : value.trim());
  return { id: createHash('sha1').update(path).digest('hex').slice(0,10), label: split > 0 ? value.slice(0,split).trim() : `目录 ${index + 1}`, path };
});
await mkdir(join(local, 'data'), { recursive: true, mode: 0o700 });
const report = { version: 1, at: new Date().toISOString(), source, destination, modules: {}, rewrittenJson: [], workersStarted: false };
function rewrite(value) {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item)]));
  return remap(value);
}
async function validateTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Source data contains a symlink; manual review required.');
    if (entry.isDirectory() && entry.name !== '__pycache__') await validateTree(path);
  }
}
async function verifyAndProtect(origin, target, stats) {
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const src = join(origin,entry.name), dst = join(target,entry.name);
    if (entry.isDirectory()) { await chmod(dst,0o700); await verifyAndProtect(src,dst,stats); continue; }
    const a = await readFile(src), b = await readFile(dst);
    if (!a.equals(b)) throw new Error('Source changed during copy; migration needs review, no source was changed.');
    stats.files++; stats.bytes += b.length;
    await chmod(dst, ((await lstat(src)).mode & 0o111) ? 0o700 : 0o600);
    if (entry.name.endsWith('.json')) {
      let value;
      try { value = JSON.parse(b.toString('utf8')); } catch { continue; }
      const next = rewrite(value);
      if (JSON.stringify(value) !== JSON.stringify(next)) {
        await writeFile(dst, JSON.stringify(next,null,2)+'\n', {mode:0o600});
        report.rewrittenJson.push(relative(local,dst));
      }
    }
  }
}
for (const name of modules) {
  const origin = join(source,'data',name), target = join(local,'data',name);
  await validateTree(origin);
  await cp(origin,target,{recursive:true,errorOnExist:true,force:false,filter:path=>!path.split(sep).includes('__pycache__')});
  await chmod(target,0o700);
  const stats = {files:0,bytes:0};
  await verifyAndProtect(origin,target,stats);
  report.modules[name] = stats;
}
await writeFile(targetConfig,JSON.stringify({version:1,env:selectedEnv,fileRoots:roots},null,2)+'\n',{flag:'wx',mode:0o600});
await writeFile(join(local,'allinone-migration.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Copied three module data directories and selected private configuration; source preserved.');
for (const [name,stats] of Object.entries(report.modules)) console.log(`${name}: ${stats.files} files, ${stats.bytes} bytes`);
console.log('No credentials or user data values printed; no workers or downloads started.');
