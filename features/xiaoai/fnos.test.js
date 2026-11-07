import test from 'node:test';
import assert from 'node:assert/strict';
import { FnosMusic,FnosTransport,fnosSong,safeOrigin,signMusic,CALLBACK } from './fnos.mjs';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';
function fixture(){
 let record;const calls=[];let rejectMe=false,rows=[{guid:'track-a',title:'测试歌',audioSpec:{path:'/fixture/song.mp3',size:123},artists:[{name:'测试歌手'}]}];
 const credentials={readRecord:async()=>record,modifyRecord:async(key,fn)=>{assert.equal(key,'pocket-kit/fnos-music');record=await fn(record);return record;},deleteRecord:async()=>{record=undefined;}};
 const transport={request:async(method,endpoint,values,token)=>{calls.push({method,endpoint,values,token});if(endpoint==='/sys/config')return {nasOAuth:{clientId:'test-client'}};if(endpoint==='/initialization/state')return {initialized:true};if(endpoint==='/user/auth-login')return {userToken:'SECRET-FIXTURE-TOKEN'};if(endpoint==='/user/me'){if(rejectMe)throw Object.assign(new Error('授权失效'),{status:401});return {guid:'user-a',name:'测试用户',password:'must-not-leak'};}if(endpoint.endsWith('/list'))return {list:rows,total:rows.length};return {};},dispose(){}};
 const music=new FnosMusic({credentials,transport,now:()=>10000});
 return {music,calls,get record(){return record;},set rejectMe(v){rejectMe=v;},set rows(v){rows=v;}};
}
async function authorize(f){const result=await f.music.start('https://nas.example.test','https://dsh.example.test');const state=new URL(result.authorizationUrl).searchParams.get('state');await f.music.finish('one-time-code',state,result.cookie);return result;}
test('OAuth starts with exact callback, browser-bound expiring state, and no writes until confirmed',async()=>{
 const f=fixture(),result=await f.music.start('https://nas.example.test','https://dsh.example.test');const url=new URL(result.authorizationUrl),state=url.searchParams.get('state');
 assert.equal(url.origin,'https://nas.example.test');assert.equal(url.searchParams.get('redirect_uri'),'https://dsh.example.test'+CALLBACK);assert.match(result.cookie,/HttpOnly; SameSite=Lax; Secure/);assert.equal(f.record,undefined);
 await assert.rejects(f.music.finish('code',state,''),{status:403});
 await f.music.finish('code',state,result.cookie);assert.equal(f.record.payload.token,'SECRET-FIXTURE-TOKEN');assert.equal(f.record.payload.nasOrigin,'https://nas.example.test');
 await assert.rejects(f.music.finish('code',state,result.cookie),{status:403});
 const publicState=await f.music.status();assert.equal(publicState.connected,true);assert.equal(publicState.user.name,'测试用户');assert.doesNotMatch(JSON.stringify(publicState),/SECRET|password/);
});
test('new connect and disconnect invalidate old authorization flows',async()=>{
 const f=fixture(),a=await f.music.start('https://nas.example.test','https://dsh.example.test');await f.music.start('https://nas.example.test','https://dsh.example.test');
 await assert.rejects(f.music.finish('code',new URL(a.authorizationUrl).searchParams.get('state'),a.cookie),{status:403});
 await authorize(f);await f.music.disconnect();assert.equal(f.record,undefined);assert.equal((await f.music.status()).configured,false);
});
test('failed user verification does not persist a token',async()=>{
 const f=fixture(),a=await f.music.start('https://nas.example.test','https://dsh.example.test');f.rejectMe=true;
 await assert.rejects(f.music.finish('code',new URL(a.authorizationUrl).searchParams.get('state'),a.cookie));assert.equal(f.record,undefined);
});
test('favorites resolve exact accessible paths, not supplied GUIDs or song titles',async()=>{
 const f=fixture();await assert.rejects(f.music.favorites(),{status:401});await authorize(f);
 await f.music.setFavorite({path:'/fixture/song.mp3',guid:'spoofed'},true);
 const mutation=f.calls.find(c=>c.endpoint==='/favorite-track/create');assert.deepEqual(mutation.values,{trackGUID:'track-a'});
 await f.music.setFavorite({path:'/fixture/song.mp3'},false);assert.ok(f.calls.some(c=>c.endpoint==='/favorite-track/delete'));
 await assert.rejects(f.music.setFavorite({path:'/fixture/not-in-library.mp3'},true),{status:409});
 f.rows=[{guid:'cue-a',isCue:true,audioSpec:{path:'/fixture/song.mp3'}}];await assert.rejects(f.music.setFavorite({path:'/fixture/song.mp3'},true),{status:409});
 f.rows=[{guid:'a',audioSpec:{path:'/fixture/song.mp3'}},{guid:'b',audioSpec:{path:'/fixture/song.mp3'}}];await assert.rejects(f.music.setFavorite({path:'/fixture/song.mp3'},true),{status:409});
});
test('pagination returns every page and rejects incomplete lists',async()=>{
 const f=fixture();let page=0;f.music.transport.request=async()=>{page++;return page===1?{list:[{guid:'a'}],total:2}:{list:[{guid:'b'}],total:2};};assert.equal((await f.music.pages('/favorite-track/list','token')).length,2);
 f.music.transport.request=async()=>({list:[],total:2});await assert.rejects(f.music.pages('/favorite-track/list','token'),{status:502});
});
test('origins and normalized tracks fail closed',()=>{
 for(const url of ['javascript:alert(1)','https://user:pass@host.test','https://host.test/path','https://host.test?token=x'])assert.throws(()=>safeOrigin(url));
 assert.throws(()=>safeOrigin('http://host.test',true));assert.equal(safeOrigin('https://nas.test/'),'https://nas.test');
 assert.equal(fnosSong({guid:'a',audioSpec:'{"path":"/fixture/a.mp3"}'}).path,'/fixture/a.mp3');assert.equal(fnosSong({audioSpec:{path:'relative'}}).path,'');
});
test('signature follows frontend GET canonicalization and JSON body rules',()=>{
 const md5=s=>createHash('md5').update(s).digest('hex'),values={size:300,page:1,q:'中文 a+b'};
 const expected=md5(['salt','/music/api/v1/track/list','123456','123',md5('page=1&q=中文 a+b&size=300'),'key'].join('_'));
 assert.equal(signMusic('GET','/music/api/v1/track/list',values,{salt:'salt',key:'key'},'123456','123'),`nonce=123456&timestamp=123&sign=${expected}`);
});
test('local transport pins socket, enforces endpoints, parses envelopes and omits raw server errors',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'fnos-api-test-')),socket=path.join(dir,'music.sock');let received;
 const server=http.createServer((req,res)=>{received=req;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({code:0,data:{list:[],total:0}}));});
 await new Promise(resolve=>server.listen(socket,resolve));
 const transport=new FnosTransport({socketPath:socket,signing:{salt:'salt',key:'key'}});
 try{await transport.request('GET','/favorite-track/list',{page:1,size:300},'secret');assert.equal(received.url,'/music/api/v1/favorite-track/list?page=1&size=300');assert.equal(received.headers.cookie,'music-token=secret');assert.ok(received.headers.authx);await assert.rejects(transport.request('POST','/track/metadata',{}),{status:403});}
 finally{transport.dispose();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(dir),tmpdir());await rm(dir,{recursive:true,force:true});}
});


test('UI callback exchanges code server-side and Agent paths cannot initiate authorization',async()=>{
  const {mountFeature}=await import('../../lib/module-host.mjs');
  const f=fixture(),routes=[],tools=[];let dispose;
  mountFeature({effect:fn=>{dispose=fn();},connection:{fetch:{register:route=>{routes.push(route);return ()=>{};}}},get:()=>({register:tool=>{tools.push(tool);return ()=>{};}})},
    {name:'xiaoai',prefixes:{playback:'/api/modules/xiaoai-music'},factory:async()=>({playback:{handle:f.music.handle.bind(f.music),dispose:()=>f.music.dispose()}}),help:{}});
  try{
    const api=routes.find(r=>r.path==='/api/pocket-kit/xiaoai');
    const response=await api.fetch(new Request('https://dsh.example.test/api/pocket-kit/xiaoai',{method:'POST',headers:{'X-Pocket-Kit':'1','Content-Type':'application/json',Origin:'https://dsh.example.test'},body:JSON.stringify({path:'/fnos/connect',module:'playback',method:'POST',body:{nasOrigin:'https://nas.example.test'}})}));
    assert.equal(response.status,200);const payload=await response.json(),state=new URL(payload.authorizationUrl).searchParams.get('state');
    const callback=routes.find(r=>r.path===CALLBACK);assert.deepEqual(callback.methods,['GET']);assert.equal(callback.requestBody,'buffered');
    const returned=await callback.fetch(new Request('https://dsh.example.test'+CALLBACK+'?code=one-time-fixture-code&state='+state,{headers:{Cookie:response.headers.get('set-cookie')}}));
    assert.equal(returned.status,200);const html=await returned.text();assert.match(html,/已连接飞牛音乐/);assert.doesNotMatch(html,/SECRET|one-time-fixture-code/);assert.equal(returned.headers.get('referrer-policy'),'no-referrer');
    for(const pathname of ['/fnos/connect','/profiles/../fnos/connect','/fnos/callback?code=untrusted','/fnos/disconnect']){
      const result=await tools[0].execute({action:'request',path:pathname,method:'POST'},{});assert.equal(result.status,403);
    }
  }finally{await dispose();}
});
