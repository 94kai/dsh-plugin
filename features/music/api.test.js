import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { PassThrough, Readable } from 'node:stream';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { MusicDownloadModule } from './backend.mjs';

async function fixture(run) {
  const root=await mkdtemp(path.join(os.tmpdir(),'pocket-music-api-'));
  const b=new MusicDownloadModule({projectDir:root,dataDir:root,env:{NETEASE_COOKIE_SECRET:'offline-api-fixture'},fetchImpl:async()=>{throw Error('offline only');}});
  try { await b.initialize(); await run(b); }
  finally { await b.dispose(); assert.ok(path.basename(root).startsWith('pocket-music-api-')); assert.equal(path.dirname(root),os.tmpdir()); await rm(root,{recursive:true,force:true}); }
}

test('HTTP handle exposes status and empty downloads without any network operation',()=>fixture(async b=>{
  for (const [route,key] of [['status','ready'],['downloads','items']]) {
    let result,status;
    const res={writeHead(value){status=value;},end(body){result=JSON.parse(body);}};
    assert.equal(await b.handle({method:'GET'},res,new URL(`http://fixture/api/modules/music-download/${route}`)),true);
    assert.equal(status,200); assert.ok(Object.hasOwn(result,key));
  }
}));

test('audio streaming returns actual bounded Range bytes',()=>fixture(async b=>{
  await writeFile(path.join(b.downloadDir,'fixture.mp3'),'0123456789');
  const res=new PassThrough(); let status,headers;
  res.writeHead=(s,h)=>{status=s;headers=h;};
  const chunks=[];res.on('data',chunk=>chunks.push(chunk));
  const end=once(res,'end');
  await b.streamAudio({headers:{range:'bytes=2-5'}},res,'fixture.mp3');
  await end;
  assert.equal(status,206);assert.equal(headers['Content-Range'],'bytes 2-5/10');assert.equal(Buffer.concat(chunks).toString(),'2345');
}));

test('metadata probe exposes tags and lyrics via fake subprocess only',()=>fixture(async b=>{
  await writeFile(path.join(b.downloadDir,'fixture.mp3'),'offline');
  b.exec=async()=>({stdout:JSON.stringify({format:{tags:{TITLE:'Fixture',ARTIST:'Test',LYRICS:'[00:01]Fixture'},duration:'12',bit_rate:'128000'},streams:[{codec_type:'audio',codec_name:'mp3',sample_rate:'44100'}]})});
  const data=await b.readMetadata('fixture.mp3');
  assert.equal(data.title,'Fixture');assert.equal(data.lyrics,'[00:01]Fixture');assert.equal(data.lyricsSupported,true);assert.equal(data.sampleRate,44100);
}));

test('GET search cancellation reaches fetch and releases the search lock',()=>fixture(async b=>{
  const controller=new AbortController(); let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  b.fetchImpl=async(_url,{signal})=>new Promise((_resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  b.searchInternal=()=>b.fetch('https://example.com/');
  const operation=b.handle({method:'GET',signal:controller.signal},{},new URL('http://fixture/api/modules/music-download/search?q=test'));
  const rejected=assert.rejects(operation,error=>error.name==='AbortError');
  await started;controller.abort();await rejected;assert.equal(b.searching,false);
}));

test('GET metadata cancellation reaches subprocess without running a real binary',()=>fixture(async b=>{
  const controller=new AbortController();let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  b.execImpl=async(_binary,_args,{signal})=>new Promise((_resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  b.readMetadata=()=>b.exec('fake-probe',[],{timeout:1000});
  const operation=b.handle({method:'GET',signal:controller.signal},{},new URL('http://fixture/api/modules/music-download/metadata?file=fixture.mp3'));
  const rejected=assert.rejects(operation,error=>error.name==='AbortError');
  await started;controller.abort();await rejected;assert.equal(b.pending.size,0);
}));

test('POST scrape inherits request cancellation but accepted downloads explicitly detach',()=>fixture(async b=>{
  const controller=new AbortController();let entered;
  const started=new Promise(resolve=>{entered=resolve;});
  b.fetchImpl=async(_url,{signal})=>new Promise((_resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  b.scrape=()=>b.fetch('https://example.com/');
  const req=Readable.from([Buffer.from('{}')]);req.method='POST';req.signal=controller.signal;
  const operation=b.handle(req,{},new URL('http://fixture/api/modules/music-download/scrape'));
  const rejected=assert.rejects(operation,error=>error.name==='AbortError');
  await started;controller.abort();await rejected;
  const enqueue=new AbortController();let release,downloadSignal,notify;
  const downloading=new Promise(resolve=>{notify=resolve;});
  b.fetchImpl=async(_url,{signal})=>{downloadSignal=signal;notify();return new Promise(resolve=>{release=()=>resolve(new Response('offline-download-fixture'));});};
  const job=b.requestScope.run(enqueue.signal,()=>b.createDownload({url:'https://music.163.com/song?id=1',audioUrl:'https://example.com/audio',name:'Detached'}));
  await downloading;enqueue.abort();assert.equal(downloadSignal.aborted,false);
  release();await Promise.all([...b.pending]);assert.equal(job.status,'finished');
}));

test('failed cookie import does not erase previously stored credentials',()=>fixture(async b=>{
  await b.saveNeteaseAuth('MUSIC_U=old-offline-fixture');
  b.fetchImpl=async()=>Response.json({code:401});
  await assert.rejects(b.importNeteaseCookie({cookie:'MUSIC_U=invalid-offline-fixture-long'}),/原登录状态保持/);
  assert.equal(b.neteaseCookie,'MUSIC_U=old-offline-fixture');
  assert.equal((await stat(b.neteaseAuthFile)).mode&0o777,0o600);
}));
