import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const execute=promisify(execFile);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export class TerminalModule {
  constructor({dataDir}){this.file=path.join(dataDir,'terminal.json');this.controllers=new Set();this.queue=Promise.resolve();this.closed=false;}
  async initialize(){try{this.config=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;this.config={enabled:false};}this.prefix='allinone-';}
  async tmux(args){if(this.closed)throw fail('终端已关闭',503);const controller=new AbortController();this.controllers.add(controller);try{return (await execute('tmux',args,{timeout:3000,maxBuffer:512*1024,signal:controller.signal})).stdout;}finally{this.controllers.delete(controller);}}
  clean(name){if(typeof name!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(name))throw fail('会话名需为 1–32 位字母、数字、下划线或短横线');return this.prefix+name;}
  async status(){if(!this.config.enabled)return {enabled:false,ready:false,sessions:[],error:'终端未启用，请检查迁移的终端设置'};try{await this.tmux(['-V']);}catch{return {enabled:true,ready:false,sessions:[],error:'tmux 不可用'};}return {enabled:true,ready:true,sessions:await this.sessions(),maxSessions:this.config.maxSessions||8};}
  async sessions(){try{return (await this.tmux(['list-sessions','-F','#{session_name}\t#{session_windows}\t#{session_attached}'])).trim().split('\n').filter(row=>row.startsWith(this.prefix)).map(row=>{const [name,windows,attached]=row.split('\t');return {name:name.slice(this.prefix.length),windows:Number(windows),attached:Number(attached)};});}catch(e){if(e.code===1)return [];throw e;}}
  async operate(route,method,input,url){
    if(route==='/status'&&method==='GET')return this.status();
    if(!this.config.enabled)throw fail('终端未启用',403);
    const full=this.clean(input.name||url.searchParams.get('name'));
    if(route==='/sessions'&&method==='POST'){
      const sessions=await this.sessions();
      if(!sessions.some(s=>this.prefix+s.name===full)){
        if(sessions.length>=(this.config.maxSessions||8))throw fail('会话数量已达上限',409);
        await this.tmux(['new-session','-d','-s',full,'-c',this.config.cwd||process.cwd(),'-x','100','-y','30']);
      }
      await this.tmux(['set-option','-t','='+full,'destroy-unattached','off']);
      return {name:full.slice(this.prefix.length)};
    }
    // Exact tmux targets, never prefix-match a different session.
    const target='='+full;
    if(route==='/screen'&&method==='GET')return {output:await this.tmux(['capture-pane','-p','-J','-S','-300','-t',target])};
    if(route==='/input'&&method==='POST'){
      if(typeof input.text!=='string'||Buffer.byteLength(input.text)>8192)throw fail('输入最多 8 KiB');
      if(input.text)await this.tmux(['send-keys','-t',target,'-l','--',input.text]);
      if(input.enter===true)await this.tmux(['send-keys','-t',target,'Enter']);
      return {sent:true};
    }
    if(route==='/key'&&method==='POST'){
      if(!['Enter','C-c','C-d','Tab','Escape','Up','Down','Left','Right','BSpace'].includes(input.key))throw fail('不支持的按键');
      await this.tmux(['send-keys','-t',target,input.key]);return {sent:true};
    }
    if(route==='/sessions'&&method==='DELETE'){
      if(input.confirmed!==true)throw fail('结束会话前需要确认');
      await this.tmux(['kill-session','-t',target]);return {deleted:true};
    }
    throw fail('终端操作不存在',404);
  }
  async handle(req,res,url){
    const route=url.pathname.slice('/api/modules/terminal'.length);let input={};
    if(req.method!=='GET'){let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw fail('输入过大',413);}try{input=JSON.parse(text||'{}');}catch{throw fail('JSON 无效');}}
    const run=()=>this.operate(route,req.method,input,url);
    const operation=req.method==='GET'?run():this.queue.catch(()=>{}).then(run);if(req.method!=='GET')this.queue=operation;
    const value=await operation;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));return true;
  }
  shutdown(){this.closed=true;for(const c of this.controllers)c.abort();this.controllers.clear();/* tmux belongs to user: never kill it on plugin unload */}
}
