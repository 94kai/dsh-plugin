import test from 'node:test';
import assert from 'node:assert/strict';
import {DedicatedTerminalSession,TERMINAL_SESSION_ID as ID,mountDedicatedTerminal} from './dedicated-host.mjs';
function fixture({persisted=false,wrongHome=false,live=false}={}){
 const calls=[],home='/fixture/home',session={id:ID,header:{cwd:wrongHome?'/other':home}},agent={id:ID};let exists=persisted,active=live;
 const ctx={
  agents:{get:id=>{assert.equal(id,ID);return active?agent:undefined;}},
  sessions:{prepare:(id,options)=>{calls.push('prepare');assert.equal(id,ID);assert.equal(options.meta.cwd,home);return {header:{id,cwd:home,version:1,isSeeded:false,createdAt:0}};},get:()=>active?session:undefined,flush:async()=>calls.push('session-flush')},
  sessionPersistence:{stat:async()=>exists?{header:session.header}:undefined,create:async header=>{assert.equal(header.id,ID);calls.push('persist-create');exists=true;return {flush:async()=>calls.push('handle-flush'),close:async()=>calls.push('handle-close')};}},
  sessionController:{resolveAgent:async id=>{assert.equal(id,ID);calls.push('resolve');active=true;return {agent};}}
 };
 return {calls,ctx,service:new DedicatedTerminalSession(ctx,{home})};
}
test('dedicated terminal creates one durable Home session without a prompt or archive',async()=>{const f=fixture();const result=await f.service.ensure();assert.deepEqual(result,{sessionId:ID,home:'/fixture/home'});assert.deepEqual(f.calls,['prepare','persist-create','handle-flush','handle-close','resolve','session-flush']);await f.service.ensure();assert.equal(f.calls.filter(c=>c==='persist-create').length,1);assert.equal(f.calls.filter(c=>c==='resolve').length,1);});
test('concurrent opens share one create and existing persisted Session resumes',async()=>{const fresh=fixture();await Promise.all([fresh.service.ensure(),fresh.service.ensure(),fresh.service.ensure()]);assert.equal(fresh.calls.filter(c=>c==='persist-create').length,1);const f=fixture({persisted:true});await f.service.ensure();assert.deepEqual(f.calls,['resolve','session-flush']);});
test('existing Agent is reused; hot-unload never disposes Session or native PTY',async()=>{const f=fixture({live:true});await f.service.ensure();f.service.dispose();assert.deepEqual(f.calls,['session-flush']);await assert.rejects(f.service.ensure(),/关闭/);});
test('wrong Home fails closed and failed create can be retried',async()=>{const f=fixture({persisted:true,wrongHome:true});await assert.rejects(f.service.ensure(),/目录异常/);assert.equal(f.calls.length,0);const retry=fixture();const create=retry.ctx.sessionPersistence.create;retry.ctx.sessionPersistence.create=async()=>{throw Error('disk full');};await assert.rejects(retry.service.ensure(),/disk full/);retry.ctx.sessionPersistence.create=create;assert.equal((await retry.service.ensure()).sessionId,ID);});
test('user entry requires same-origin JSON header and supports no arbitrary session identity',async()=>{const f=fixture();let route,stop;mountDedicatedTerminal({...f.ctx,effect:fn=>{stop=fn();},connection:{fetch:{register:value=>{route=value;return async()=>{};}}}});try{assert.equal((await route.fetch(new Request('http://internal',{method:'POST',body:'{}'}))).status,403);const req=new Request('http://internal',{method:'POST',headers:{'Content-Type':'application/json','X-Pocket-Kit':'1'},body:JSON.stringify({action:'bad',sessionId:'someone-else'})});assert.equal((await route.fetch(req)).status,400);assert.equal(f.calls.length,0);}finally{await stop();}});
