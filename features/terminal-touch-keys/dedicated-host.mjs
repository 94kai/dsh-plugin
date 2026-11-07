import { homedir } from 'node:os';
import { readEnvelope, failure } from '../../lib/http-adapter.mjs';
export const TERMINAL_SESSION_ID = 'pocket-kit-terminal-home-v1';

// A real ordinary Session owns the original DSH terminal; never submit prompts or archive it.
export class DedicatedTerminalSession {
  constructor(ctx,{home=homedir()}={}) { this.ctx=ctx;this.home=home;this.pending=null;this.closed=false; }
  async ensure() {
    if(this.closed)throw new Error('终端会话入口已关闭');
    if(this.pending)return this.pending;
    this.pending=this.open();
    try{return await this.pending;}finally{this.pending=null;}
  }
  async open() {
    const ctx=this.ctx,id=TERMINAL_SESSION_ID;
    let agent=ctx.agents.get(id);
    if(!agent){
      const snapshot=await ctx.sessionPersistence.stat(id);
      if(this.closed)throw new Error('终端会话入口已关闭');
      if(snapshot && snapshot.header.cwd!==this.home)throw new Error('专用终端会话目录异常，拒绝接管');
      agent=ctx.agents.get(id);
      if(!agent){
        // SessionController owns the Agent lifecycle. Do not tie a live terminal's owner to a UI feature's hot reload.
        if(!snapshot){
          const prepared=ctx.sessions.prepare(id,{meta:{cwd:this.home}});
          const handle=await ctx.sessionPersistence.create(prepared.header);
          try{await handle.flush();}finally{await handle.close();}
        }
        const result=await ctx.sessionController.resolveAgent(id);
        if(result.error)throw new Error('无法恢复专用终端会话');
        agent=result.agent;
      }
    }
    const session=ctx.sessions.get(id);
    if(!session||session.header.cwd!==this.home)throw new Error('专用终端会话未就绪或目录异常');
    await ctx.sessions.flush(session);
    return {sessionId:id,home:this.home};
  }
  dispose(){this.closed=true;}
}
export function mountDedicatedTerminal(ctx){
  ctx.effect(()=>{
    const service=new DedicatedTerminalSession(ctx);
    const stop=ctx.connection.fetch.register({path:'/api/pocket-kit/native-terminal',methods:['POST'],requestBody:'buffered',async fetch(request){
      try{const input=await readEnvelope(request);if(input.action!=='open')return failure(400,'不支持的操作');return Response.json(await service.ensure(),{headers:{'Cache-Control':'no-store'}});}
      catch(error){return failure(error.status||503,error.status?error.message:'无法打开专用终端，请刷新后重试。');}
    }});
    return async()=>{service.dispose();await stop();};
  });
}
