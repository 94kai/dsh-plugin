import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeHandlerResponse, readEnvelope } from '../lib/http-adapter.mjs';
import { FeatureService, mountFeature } from '../lib/module-host.mjs';

const json = (res,status,value) => { res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));return true; };
test('HTTP adapter preserves method, body, status and stream bytes',async()=>{
 const response=await nodeHandlerResponse(async(req,res,url)=>{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   assert.equal(req.method,'PUT');assert.equal(url.pathname,'/fixture');
   return json(res,201,{value:JSON.parse(Buffer.concat(chunks)),header:req.headers.range});
 },{method:'PUT',url:new URL('http://example.test/fixture'),body:{name:'fixture'},headers:{range:'bytes=0-9'}});
 assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{value:{name:'fixture'},header:'bytes=0-9'});
});
test('adapter distinguishes explicit safe failures from unexpected exceptions',async()=>{
 for(const [error,status,message] of [[Object.assign(new Error('服务暂停'),{status:503}),503,'服务暂停'],[new Error('private-fixture'),500,'操作失败，请检查功能配置或稍后重试。']]){
 const response=await nodeHandlerResponse(()=>{throw error;},{url:new URL('http://example.test/')});
 assert.equal(response.status,status);assert.equal((await response.json()).error,message);
 }
});
test('command envelopes require same-origin JSON and reject oversized body',async()=>{
 const req=(headers,body='{}')=>new Request('https://example.test/api',{method:'POST',headers,body});
 await assert.rejects(()=>readEnvelope(req({'Content-Type':'application/json'})),{status:403});
 await assert.rejects(()=>readEnvelope(req({'Content-Type':'application/json','X-Pocket-Kit':'1','Sec-Fetch-Site':'cross-site'})),{status:403});
 await assert.rejects(()=>readEnvelope(req({'Content-Type':'application/json','X-Pocket-Kit':'1'},'x'.repeat(2*1024*1024+1))),{status:413});
 assert.deepEqual(await readEnvelope(req({'Content-Type':'application/json','X-Pocket-Kit':'1'},'{"path":"/status"}')),{path:'/status'});
});
test('service confines dispatch and disposes only owned modules',async()=>{
 let disposed=0,calls=0;
 const service=new FeatureService(async()=>({playback:{handle:(_req,res,url)=>{calls++;return json(res,200,{path:url.pathname});},dispose:()=>{disposed++;}}}),{playback:'/api/modules/xiaoai-music'});
 for(const path of ['/../../escape','//outside','/audio'])assert.equal((await service.request({path})).status,400);
 assert.equal((await service.request({module:'unknown',path:'/status'})).status,400);
 const response=await service.request({path:'/profiles'});assert.deepEqual(await response.json(),{path:'/api/modules/xiaoai-music/profiles'});assert.equal(calls,1);
 await service.dispose();assert.equal(disposed,1);assert.equal((await service.request({path:'/profiles'})).status,503);
});
test('UI route and agent tool call the same application service',async()=>{
 const routes=[],tools=[],effects=[];
 const ctx={effect:fn=>effects.push(fn()),connection:{fetch:{register:route=>{routes.push(route);return()=>{};}}},get:()=>({register:tool=>{tools.push(tool);return()=>{};}})};
 const module={handle:async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);return json(res,200,{method:req.method,input:chunks.length?JSON.parse(Buffer.concat(chunks)):null});},dispose(){}};
 mountFeature(ctx,{name:'fixture',factory:async()=>({fixture:module}),prefixes:{fixture:'/api/modules/fixture'},help:{routes:['/status']}});
 const request={module:'fixture',path:'/status',method:'PUT',body:{name:'fake'}};
 const response=await routes[0].fetch(new Request('https://example.test/api/pocket-kit/fixture',{method:'POST',headers:{'Content-Type':'application/json','X-Pocket-Kit':'1'},body:JSON.stringify(request)}));
 const result=await tools[0].execute({action:'request',...request},{signal:new AbortController().signal});
 assert.deepEqual(await response.json(),result.data);assert.equal(result.status,200);
 assert.equal((await tools[0].execute({action:'request',path:'/netease/session'},{signal:new AbortController().signal})).status,403);
 await effects[0]();
});
