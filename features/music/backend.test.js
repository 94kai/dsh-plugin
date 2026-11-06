import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, symlink, stat, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MusicDownloadModule } from './backend.mjs';
import { isPublicAddress, resolvePublicUrl } from './network.mjs';

async function fixture(run, env = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pocket-music-test-'));
  const backend = new MusicDownloadModule({ projectDir:root, dataDir:root, env, fetchImpl:async () => { throw new Error('Unexpected network call in offline test'); } });
  try { await backend.initialize(); await run(backend,root); }
  finally {
    await backend.dispose();
    assert.equal(path.dirname(root),os.tmpdir()); assert.ok(path.basename(root).startsWith('pocket-music-test-'));
    await rm(root,{recursive:true,force:true});
  }
}

test('network policy rejects local, mapped, reserved and mixed DNS addresses', async () => {
  for (const value of ['127.0.0.1','10.1.2.3','169.254.1.1','172.20.0.1','192.168.0.1','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1']) assert.equal(isPublicAddress(value),false,value);
  assert.equal(isPublicAddress('8.8.8.8'),true);
  await assert.rejects(resolvePublicUrl('http://127.0.0.1/'));
  await assert.rejects(resolvePublicUrl('https://example.com/',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]));
  await assert.rejects(resolvePublicUrl('https://user:secret@example.com/'));
  await assert.rejects(resolvePublicUrl('https://example.com:8443/'));
  assert.equal((await resolvePublicUrl('https://example.com/',async()=>[{address:'8.8.8.8',family:4}])).address.address,'8.8.8.8');
});

test('initialize is local only and search cannot automatically install a binary', () => fixture(async b => {
  assert.deepEqual(await b.listFiles(),[]);
  let installed=false; b.installBinary=async()=>{installed=true;};
  await assert.rejects(b.ensureBinary(),/显式安装/);
  assert.equal(installed,false);
  const result=await b.search('fixture','lossless',{detailed:true});
  assert.equal(result.items.length,0); assert.ok(result.warnings.length);
  assert.equal(installed,false);
}));

test('explicit tool install is deduplicated and reports readiness', () => fixture(async b => {
  let installs=0;
  b.installBinary=async target=>{installs++; await writeFile(target,'not-an-executable-test-fixture');};
  const results=await Promise.all([b.installTools(),b.installTools()]);
  assert.equal(installs,1); assert.ok(results.every(x=>x.ready));
}));

test('catalog and config are written privately; corrupt data refuses initialization', () => fixture(async (b,root) => {
  b.catalog={'fixture.mp3':{name:'Fixture'}}; await b.saveCatalog();
  assert.equal((await stat(b.catalogFile)).mode&0o777,0o600);
  await writeFile(b.catalogFile,'{invalid');
  const other = new MusicDownloadModule({projectDir:root,dataDir:root});
  await assert.rejects(other.initialize(),/损坏/);
  assert.equal(await readFile(b.catalogFile,'utf8'),'{invalid'); await other.dispose();
}));

test('encrypted auth persists without plaintext and wrong keys do not overwrite it', () => fixture(async (b,root) => {
  const cookie='MUSIC_U=offline-test-secret-only'; await b.saveNeteaseAuth(cookie);
  const before=await readFile(b.neteaseAuthFile,'utf8'); assert.ok(!before.includes(cookie));
  assert.equal((await stat(b.neteaseAuthFile)).mode&0o777,0o600);
  const other=new MusicDownloadModule({projectDir:root,dataDir:root,env:{NETEASE_COOKIE_SECRET:'wrong-test-key'}});
  await assert.rejects(other.initialize(),/密钥不匹配/); assert.equal(await readFile(b.neteaseAuthFile,'utf8'),before); await other.dispose();
}, {NETEASE_COOKIE_SECRET:'offline-fixture-secret'}));

test('source URL policy rejects arbitrary hosts and URL credentials', () => fixture(async b => {
  for(const url of ['http://127.0.0.1/song','https://example.com/song','https://music.163.com.evil.invalid/song','https://user:pass@music.163.com/song']) assert.throws(()=>b.createDownload({url}));
  assert.equal(b.validateSourceUrl('https://music.163.com/song?id=1').hostname,'music.163.com');
}));

test('downloaded file access rejects traversal and symlinks', () => fixture(async (b,root) => {
  const outside=path.join(root,'outside.mp3'); await writeFile(outside,'fixture');
  await symlink(outside,path.join(b.downloadDir,'escape.mp3'));
  await assert.rejects(b.resolveDownloadedFile('../outside.mp3'));
  await assert.rejects(b.resolveDownloadedFile('escape.mp3'));
  assert.deepEqual(await b.listFiles(),[]);
}));

test('moving cannot create directories through an escaping symlink', () => fixture(async (b,root) => {
  const destination=path.join(root,'destination'),outside=path.join(root,'outside');
  await mkdir(destination);await mkdir(outside);await symlink(outside,path.join(destination,'escape'));
  const roots=await b.updateMoveRoots({moveRoots:[{label:'Fixture',path:destination}]});
  await writeFile(path.join(b.downloadDir,'track.mp3'),'fixture');
  await assert.rejects(b.moveFiles({files:['track.mp3'],root:roots[0].id,path:'escape/new'}),/符号链接/);
  assert.deepEqual(await readdir(outside),[]);
  assert.equal((await b.listFiles()).length,1);
}));

test('rename preserves extension, prevents overwrite, and moves catalog records', () => fixture(async b => {
  await writeFile(path.join(b.downloadDir,'old.mp3'),'fixture');
  await writeFile(path.join(b.downloadDir,'occupied.mp3'),'keep');
  b.catalog['old.mp3']={name:'Old'};
  await assert.rejects(b.renameDownloadedFile({filename:'old.mp3',name:'occupied'}),/同名/);
  assert.equal((await b.renameDownloadedFile({filename:'old.mp3',name:'new'})).filename,'new.mp3');
  assert.equal(b.catalog['new.mp3'].name,'Old'); assert.equal(b.catalog['old.mp3'],undefined);
  await b.deleteDownloadedFile('new.mp3'); assert.equal(b.catalog['new.mp3'],undefined);
}));

test('successful mock download persists private file and catalog without remote calls', () => fixture(async b => {
  b.downloadAudioUrl=async (_url,target)=>writeFile(target,'offline-audio-fixture');
  const job=b.createDownload({url:'https://music.163.com/song?id=1',audioUrl:'https://example.com/audio',name:'Fixture',artist:'Artist'});
  await Promise.all([...b.pending]);
  assert.equal(job.status,'finished'); assert.ok(b.catalog[job.filename]);
  assert.equal((await stat(path.join(b.downloadDir,job.filename))).mode&0o777,0o600);
  assert.ok((await readdir(b.downloadDir)).every(name=>!name.startsWith('.allinone-')));
}));

test('dispose aborts pending transport and prevents new jobs', () => fixture(async b => {
  b.fetchImpl=async (_url,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});
  const request=b.fetch('https://example.com/'); const rejection=assert.rejects(request,/aborted/);
  await b.dispose(); await rejection;
  assert.throws(()=>b.createDownload({url:'https://music.163.com/song?id=1'}),/停止/);
}));

test('download queue has a fixed upper bound', () => fixture(async b => {
  b.pumpQueue=()=>{};
  for(let i=0;i<32;i++) b.createDownload({url:'https://music.163.com/song?id=1',name:'Fixture'});
  assert.throws(()=>b.createDownload({url:'https://music.163.com/song?id=1'}),/已满/);
  await b.dispose(); assert.ok([...b.jobs.values()].every(job=>job.status==='cancelled'));
}));
