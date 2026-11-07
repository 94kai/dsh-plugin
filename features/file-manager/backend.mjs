import path from 'node:path';
import crypto from 'node:crypto';
import { readFile, writeFile, readdir, realpath, stat, lstat, mkdir, rm, rename, open, link, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { FilePaths } from './paths.mjs';
import { FileShares } from './shares.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const inside=(base,target)=>target===base||target.startsWith(base+path.sep);
export class FileManagerModule {
  constructor({dataDir,fileRoots=[]}){this.dir=path.join(dataDir,'file-manager');this.paths=new FilePaths(dataDir,fileRoots);this.shares=new FileShares(dataDir,(...args)=>this.resolve(...args));this.queue=Promise.resolve();this.controllers=new Set();this.closed=false;}
  async initialize(){await this.paths.initialize();await this.shares.initialize();try{this.favorites=JSON.parse(await readFile(path.join(this.dir,'favorites.json'),'utf8'));if(!Array.isArray(this.favorites))throw Error();}catch(e){if(e.code!=='ENOENT')throw fail('收藏读取失败，未覆盖原数据',503);this.favorites=[];}}
  async resolve(id,relative=''){
    if(typeof relative!=='string'||relative.includes('\0')||relative.includes('\\')||path.isAbsolute(relative))throw fail('相对路径无效');
    const root=this.paths.get().roots.find(item=>item.id===id);if(!root)throw fail('目录入口不存在',404);
    const base=await realpath(root.path),target=await realpath(path.resolve(base,relative));
    if(!inside(base,target))throw fail('目标超出允许目录',403);
    return {root,base,target,relative:path.relative(base,target).split(path.sep).join('/')};
  }
  name(value){if(typeof value!=='string'||!value||['.','..'].includes(value)||/[\\/\x00-\x1f\x7f]/.test(value)||Buffer.byteLength(value)>255)throw fail('文件名无效');return value;}
  async saveFavorites(){await mkdir(this.dir,{recursive:true,mode:0o700});await writeFile(path.join(this.dir,'favorites.json.tmp'),JSON.stringify(this.favorites),{mode:0o600});await rename(path.join(this.dir,'favorites.json.tmp'),path.join(this.dir,'favorites.json'));}
  async operation(route,method,input,url){
    const root=input.root||url.searchParams.get('root'),relative=input.path??url.searchParams.get('path')??'';
    if(route==='/config'&&method==='GET')return this.paths.get();
    if(route==='/config'&&method==='PUT')return this.paths.update(input);
    if(route==='/favorites'&&method==='GET')return {items:this.favorites};
    if(route==='/favorites'&&method==='POST'){const dir=await this.resolve(root,relative);if(!(await stat(dir.target)).isDirectory())throw fail('只能收藏目录');let item=this.favorites.find(i=>i.root===root&&i.path===dir.relative);if(!item){item={id:crypto.randomUUID(),root,path:dir.relative,title:input.title||path.basename(dir.target)};this.favorites.push(item);await this.saveFavorites();}return {item};}
    if(route==='/favorites'&&method==='DELETE'){this.favorites=this.favorites.filter(i=>i.id!==input.id);await this.saveFavorites();return {deleted:true};}
    if(route==='/shares'&&method==='GET')return {...await this.shares.list(),authenticatedOnly:true};
    if(route==='/shares'&&method==='DELETE')return this.shares.revoke(input.id);
    if(route==='/shares'&&method==='POST')return this.shares.create(input);
    if(route==='/shares'&&method==='PUT')return this.shares.update(input.id,input);
    if(route==='/entries'&&method==='GET'){
      const dir=await this.resolve(root,relative);const all=await readdir(dir.target,{withFileTypes:true});const entries=[];
      for(const entry of all.filter(e=>url.searchParams.get('hidden')==='1'||!e.name.startsWith('.')).slice(0,2000)){
        try{const file=await this.resolve(root,path.posix.join(dir.relative,entry.name));const info=await stat(file.target);entries.push({name:entry.name,path:path.posix.join(dir.relative,entry.name),type:info.isDirectory()?'folder':'file',size:info.size,modified:info.mtime.toISOString()});}catch{/* Do not leak targets outside root. */}
      }
      entries.sort((a,b)=>(a.type==='folder'?0:1)-(b.type==='folder'?0:1)||a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
      return {path:dir.relative,entries,truncated:all.length>2000};
    }
    if(route==='/text'&&method==='GET'){const file=await this.resolve(root,relative);const handle=await open(file.target,'r');try{const info=await handle.stat();if(!info.isFile()||info.size>512*1024)throw fail('只预览 512 KiB 内文本',413);const content=await handle.readFile();if(content.includes(0))throw fail('不支持二进制文本预览',415);try{return {content:new TextDecoder('utf-8',{fatal:true}).decode(content)};}catch{throw fail('文件不是 UTF-8 文本',415);}}finally{await handle.close();}}
    if(route==='/directory'&&method==='POST'){const dir=await this.resolve(root,relative);try{await mkdir(path.join(dir.target,this.name(input.name)),{mode:0o700});}catch(e){if(e.code==='EEXIST')throw fail('同名项目已存在',409);throw e;}return {created:true};}
    if(route==='/entry'&&method==='DELETE'){
      if(input.confirmed!==true)throw fail('删除需要明确确认');
      if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\\')||relative.includes('\0'))throw fail('不能删除入口根目录或无效路径',403);
      const owner=this.paths.get().roots.find(item=>item.id===root);if(!owner)throw fail('目录入口不存在',404);
      const base=await realpath(owner.path),lexical=path.resolve(base,relative);
      if(!inside(base,lexical)||lexical===base)throw fail('不能删除根目录或范围外路径',403);
      const parent=await realpath(path.dirname(lexical));if(!inside(base,parent))throw fail('目标超出允许目录',403);
      const target=path.join(parent,path.basename(lexical));const info=await lstat(target);
      const file={target,relative:path.relative(base,target).split(path.sep).join('/')};
      // Check resolved parent plus final lexical entry; remove a symlink itself, not its destination.
      await rm(file.target,{recursive:info.isDirectory()});
      this.favorites=this.favorites.filter(i=>i.root!==root||!(i.path===file.relative||i.path.startsWith(file.relative+'/')));await this.saveFavorites();return {deleted:true};
    }
    throw fail('文件操作不存在',404);
  }
  async handle(req,res,url){const route=url.pathname.slice('/api/modules/file-manager'.length);let input={};if(req.method!=='GET'){let text='';for await(const chunk of req){text+=chunk;if(text.length>256*1024)throw fail('输入过大',413);}try{input=JSON.parse(text||'{}');}catch{throw fail('JSON 无效');}}
    const run=()=>this.operation(route,req.method,input,url);const result=req.method==='GET'?run():this.queue.catch(()=>{}).then(run);if(req.method!=='GET')this.queue=result;const value=await result;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));return true;}
  async download(request){
    const url=new URL(request.url);let root=url.searchParams.get('root'),relative=url.searchParams.get('path')||'',share;
    if(url.searchParams.has('share')){this.shares.check();share=this.shares.items.find(i=>i.id===url.searchParams.get('share'));if(!share)throw fail('分享记录不存在',404);root=share.root;relative=share.path;}
    const file=await this.resolve(root,relative),handle=await open(file.target,'r');
    try{const info=await handle.stat();if(!info.isFile())throw fail('目标不是文件');if(share&&(share.ino!==info.ino||share.dev!==info.dev))throw fail('分享文件已替换，请重新创建分享',404);
      const headers={'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(path.basename(file.target))}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};let start=0,end=info.size-1,status=200;
      const previewTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm'};
      if(url.searchParams.get('preview')==='1'&&previewTypes[path.extname(file.target).toLowerCase()]){headers['Content-Type']=previewTypes[path.extname(file.target).toLowerCase()];headers['Content-Disposition']='inline';headers['Content-Security-Policy']="sandbox; default-src 'none'; frame-ancestors 'self'";}
      if(request.headers.has('range')){const m=/^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range'));if(!m||(!m[1]&&!m[2]))throw fail('无效文件范围',416);start=m[1]?Number(m[1]):Math.max(0,info.size-Number(m[2]));end=m[1]&&m[2]?Math.min(Number(m[2]),info.size-1):info.size-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start||start>=info.size)throw fail('文件范围超界',416);status=206;headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;}
      headers['Content-Length']=String(Math.max(0,end-start+1));if(!info.size){await handle.close();return new Response(null,{headers});}
      const stream=handle.createReadStream({start,end});const stop=()=>stream.destroy();request.signal.addEventListener('abort',stop,{once:true});this.controllers.add(stop);stream.once('close',()=>{request.signal.removeEventListener('abort',stop);this.controllers.delete(stop);});return new Response(Readable.toWeb(stream),{status,headers});
    }catch(e){await handle.close();throw e;}
  }
  async upload(request){
    const url=new URL(request.url),dir=await this.resolve(url.searchParams.get('root'),url.searchParams.get('path')||''),name=this.name(url.searchParams.get('name'));
    const target=path.join(dir.target,name),temporary=path.join(dir.target,`.pocket-upload-${crypto.randomUUID()}`);const handle=await open(temporary,'wx',0o600);let size=0;const reader=request.body?.getReader();if(!reader){await handle.close();await unlink(temporary);throw fail('上传内容为空');}
    let cancelled=false;const stop=()=>{cancelled=true;return reader.cancel().catch(()=>{});};this.controllers.add(stop);request.signal.addEventListener('abort',stop,{once:true});
    try{while(true){if(this.closed||request.signal.aborted||cancelled)throw fail('上传取消',499);const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024*1024)throw fail('上传最多 1 GiB',413);await handle.writeFile(value);}if(this.closed||request.signal.aborted||cancelled)throw fail('上传取消',499);await handle.close();await link(temporary,target);return Response.json({uploaded:true,size});}
    catch(e){if(e.code==='EEXIST')throw fail('同名文件已存在，不覆盖',409);throw e;}
    finally{request.signal.removeEventListener('abort',stop);this.controllers.delete(stop);await reader.cancel().catch(()=>{});await handle.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
  }
  async shutdown(){this.closed=true;for(const stop of this.controllers)await stop();this.controllers.clear();await this.queue.catch(()=>{});}
}
