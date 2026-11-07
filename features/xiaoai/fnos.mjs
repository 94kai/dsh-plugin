import http from 'node:http';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { httpError } from './storage.mjs';

const PREFIX = '/music/api/v1';
const KEY = 'pocket-kit/fnos-music';
export const CALLBACK = '/api/pocket-kit/xiaoai/fnos/callback';
const COOKIE = 'pk-fnos-state';
const methods = new Map([
  ['/sys/config','GET'], ['/initialization/state','GET'], ['/user/auth-login','POST'], ['/user/me','GET'],
  ['/favorite-track/list','GET'], ['/favorite-track/create','POST'], ['/favorite-track/delete','POST'], ['/track/list','GET'],
]);
const md5 = value => createHash('md5').update(value).digest('hex');
const safeUser = user => ({ id: String(user?.guid || user?.id || ''), name: String(user?.name || user?.username || '飞牛音乐用户').slice(0,100) });
export function safeOrigin(value, callback = false) {
  let url; try { url = new URL(value); } catch { throw httpError('请输入完整的飞牛NAS管理地址'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) throw httpError('管理地址仅允许HTTP/HTTPS站点地址，不要填写路径、参数或账号密码');
  if (callback && url.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw httpError('授权回调必须使用HTTPS');
  return url.origin;
}
export function signMusic(method, pathname, values, {salt,key}, nonce, timestamp) {
  const query = new URLSearchParams();
  for (const k of Object.keys(values || {}).sort()) if (values[k] != null) query.set(k,String(values[k]));
  const canonical = method === 'GET' ? decodeURIComponent(query.toString().replace(/\+/g,'%20')) : values == null ? '' : JSON.stringify(values);
  return `nonce=${nonce}&timestamp=${timestamp}&sign=${md5([salt,pathname,nonce,timestamp,md5(canonical),key].join('_'))}`;
}

// 仅调用本机音乐socket；NAS地址只用于浏览器打开登录页，绝不成为服务端任意代理。
export class FnosTransport {
  constructor({socketPath='/var/run/trim_music.socket',assetsDir='/usr/local/apps/@appcenter/trim.music/static/assets',signing}={}) {
    this.socketPath=socketPath;this.assetsDir=assetsDir;this.material=signing;this.pending=new Set();this.closed=false;
  }
  async signing() {
    if(this.material)return this.material;
    for(const name of (await readdir(this.assetsDir)).filter(name=>name.endsWith('.js')&&name.startsWith('bdf49c3c'))) {
      const source=await readFile(path.join(this.assetsDir,name),'utf8');
      const bytes=source.match(/Ny=.*?Uint8Array\(\[([\d,]+)\]/s),salt=source.match(/l=\[`([^`]+)`,r,s,c,o,t\]/);
      if(bytes&&salt){this.material={key:String.fromCharCode(...bytes[1].split(',').map(n=>Number(n)^185)),salt:salt[1]};return this.material;}
    }
    throw httpError('当前飞牛音乐版本的签名协议尚不兼容',503);
  }
  async request(method,endpoint,values,token='',signal) {
    if(this.closed)throw httpError('飞牛音乐连接已卸载',503);
    if(signal?.aborted)throw Object.assign(new Error('请求已取消'),{name:'AbortError'});
    if(methods.get(endpoint)!==method)throw httpError('不允许的飞牛音乐接口',403);
    const signing=await this.signing(),pathname=PREFIX+endpoint;
    const query=new URLSearchParams();for(const [k,v]of Object.entries(values||{}))if(v!=null)query.set(k,String(v));
    const payload=method==='POST'?JSON.stringify(values||{}):'';
    const headers={'Content-Type':'application/json',authx:signMusic(method,pathname,values,signing,String(randomInt(100000,1000000)),String(Date.now()))};
    if(token)headers.Cookie=`music-token=${encodeURIComponent(token)}`;
    if(payload)headers['Content-Length']=Buffer.byteLength(payload);
    return new Promise((resolve,reject)=>{
      const request=http.request({socketPath:this.socketPath,path:pathname+(method==='GET'&&query.size?'?'+query:''),method,headers},response=>{
        const chunks=[];let size=0;
        response.on('data',chunk=>{size+=chunk.length;if(size>4*1024*1024)request.destroy(httpError('飞牛音乐响应过大',502));else chunks.push(chunk);});
        response.on('error',()=>reject(httpError('飞牛音乐响应中断，请重试',502)));
        response.on('end',()=>{
          if(response.statusCode===401||response.statusCode===403)return reject(httpError('飞牛音乐授权已失效，请重新连接',401));
          let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reject(httpError('飞牛音乐返回了无效响应',502));}
          if(response.statusCode!==200||result.code!==0)return reject(httpError('飞牛音乐请求失败；请检查授权、曲库权限和服务版本',502));
          resolve(result.data);
        });
      });
      const abort=()=>request.destroy(Object.assign(new Error('请求已取消'),{name:'AbortError',status:499}));
      signal?.addEventListener('abort',abort,{once:true});
      this.pending.add(request);request.on('close',()=>{this.pending.delete(request);signal?.removeEventListener('abort',abort);});
      request.on('error',error=>reject(error.status?error:httpError('无法连接本机飞牛音乐服务',503)));
      request.setTimeout(15000,()=>request.destroy(httpError('飞牛音乐请求超时',504)));
      if(this.closed||signal?.aborted)abort();else request.end(payload||undefined);
    });
  }
  dispose(){this.closed=true;for(const request of this.pending)request.destroy();this.pending.clear();}
}

export function fnosSong(track) {
  let spec=track?.audioSpec;
  if(typeof spec==='string'){try{spec=JSON.parse(spec);}catch{spec={};}}
  const file=spec?.path||'';
  return {guid:String(track?.guid||''),path:typeof file==='string'&&path.isAbsolute(file)?path.normalize(file):'',name:typeof file==='string'?path.basename(file):'',title:String(track?.title||''),artist:(track?.artists||[]).map(item=>String(item.name||'')).join(' / '),album:String(track?.album?.name||''),size:Number(spec?.size)||0,cue:!!track?.isCue};
}
function json(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));}
async function body(req){let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>8192)throw httpError('授权请求过大',413);raw+=chunk;}try{return JSON.parse(raw||'{}');}catch{throw httpError('请求格式无效');}}

export class FnosMusic {
  constructor({credentials,transport=new FnosTransport(),now=()=>Date.now()}={}){this.credentials=credentials;this.transport=transport;this.now=now;this.sessions=new Map();this.generation=0;this.closed=false;}
  async grant(){const record=await this.credentials?.readRecord(KEY);return record?.kind==='grant'?record.payload:undefined;}
  async status(signal){
    if(!this.credentials)return {configured:false,connected:false,error:'宿主凭据服务不可用'};
    const grant=await this.grant();if(!grant?.token)return {configured:false,connected:false};
    try{const user=await this.transport.request('GET','/user/me',undefined,grant.token,signal);return {configured:true,connected:true,user:safeUser(user?.user||user),nasOrigin:grant.nasOrigin};}
    catch(error){return {configured:true,connected:false,error:error.message,nasOrigin:grant.nasOrigin};}
  }
  async start(nasOrigin,returnOrigin){
    if(this.closed||!this.credentials)throw httpError('凭据服务暂不可用',503);
    const nas=safeOrigin(nasOrigin),origin=safeOrigin(returnOrigin,true);
    const config=await this.transport.request('GET','/sys/config');
    if(!(await this.transport.request('GET','/initialization/state'))?.initialized)throw httpError('请先在飞牛音乐完成初始化',409);
    if(!config?.nasOAuth?.clientId)throw httpError('飞牛音乐未配置NAS授权',503);
    const state=randomBytes(32).toString('hex'),expiresAt=this.now()+600000;
    this.sessions.clear();const generation=++this.generation;
    this.sessions.set(state,{origin,nas,expiresAt,generation,deviceId:randomBytes(16).toString('hex')});
    const url=new URL('/signin',nas);url.search=new URLSearchParams({client_id:config.nasOAuth.clientId,redirect_uri:origin+CALLBACK,state,app_name:'飞牛音乐 · 随身工具箱'}).toString();
    return {authorizationUrl:url.href,expiresAt,cookie:`${COOKIE}=${state}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${origin.startsWith('https:')?'; Secure':''}`};
  }
  async finish(code,state,cookie){
    const session=this.sessions.get(state);
    const browserState=String(cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
    if(!session||session.expiresAt<this.now()||browserState!==state||this.closed)throw httpError('授权已过期或不是本浏览器发起，请重新连接',403);
    if(typeof code!=='string'||!code||code.length>4096)throw httpError('授权结果无效');
    this.sessions.delete(state);
    const result=await this.transport.request('POST','/user/auth-login',{code,deviceId:session.deviceId});
    if(!result?.userToken||typeof result.userToken!=='string'||result.userToken.length>4096)throw httpError('飞牛音乐未返回有效授权',502);
    const me=await this.transport.request('GET','/user/me',undefined,result.userToken);
    if(session.generation!==this.generation||this.closed)throw httpError('授权已取消，请重新连接',409);
    await this.credentials.modifyRecord(KEY,async()=>{
      if(session.generation!==this.generation||this.closed)throw httpError('授权已取消',409);
      return {kind:'grant',payload:{token:result.userToken,deviceId:session.deviceId,user:safeUser(me?.user||me),nasOrigin:session.nas,connectedAt:this.now()}};
    });
    return session.origin;
  }
  async disconnect(){++this.generation;this.sessions.clear();await this.credentials?.deleteRecord(KEY);return {success:true};}
  async pages(endpoint,token,signal){
    const rows=[];let page=1;
    while(page<=100){
      const value=await this.transport.request('GET',endpoint,{page,size:300},token,signal);
      if(!Array.isArray(value?.list)||!Number.isSafeInteger(value.total)||value.total<0)throw httpError('飞牛音乐列表格式与当前版本不兼容',502);
      rows.push(...value.list);if(rows.length>=value.total)return rows;
      if(!value.list.length)throw httpError('飞牛音乐分页不完整，请刷新重试',502);page++;
    }
    throw httpError('飞牛曲库超过当前分页上限，未返回不完整列表',503);
  }
  async favorites(signal){const grant=await this.grant();if(!grant?.token)throw httpError('请先连接飞牛音乐',401);return (await this.pages('/favorite-track/list',grant.token,signal)).map(fnosSong);}
  async setFavorite(song,favorite,signal){
    if(typeof favorite!=='boolean'||!song||!path.isAbsolute(String(song.path||'')))throw httpError('歌曲与收藏状态无效');
    const grant=await this.grant();if(!grant?.token)throw httpError('请先连接飞牛音乐',401);
    const generation=this.generation;
    const rows=(await this.pages('/track/list',grant.token,signal)).map(fnosSong);
    const matches=rows.filter(item=>item.path===path.normalize(song.path));
    if(matches.length!==1||matches[0].cue||!matches[0].guid)throw httpError(matches.length>1?'同一文件对应多首曲目，暂不支持从此处收藏':'歌曲不在可访问的飞牛曲库中，或属于不支持的CUE曲目',409);
    if(generation!==this.generation||this.closed)throw httpError('连接已变化，请刷新后再操作',409);
    await this.transport.request('POST',favorite?'/favorite-track/create':'/favorite-track/delete',{trackGUID:matches[0].guid},grant.token,signal);
    return {success:true};
  }
  async handle(req,res,url){
    const action=url.pathname.split('/fnos/')[1];if(!action)return false;
    if(action==='status'&&req.method==='GET'){json(res,200,await this.status(req.signal));return true;}
    if(action==='connect'&&req.method==='POST'){
      const input=await body(req),result=await this.start(input.nasOrigin,req.headers.origin);
      json(res,200,{authorizationUrl:result.authorizationUrl,expiresAt:result.expiresAt},{'Set-Cookie':result.cookie});return true;
    }
    if(action==='disconnect'&&req.method==='POST'){json(res,200,await this.disconnect());return true;}
    if(action==='callback'&&req.method==='GET'){
      let ok=false;try{await this.finish(url.searchParams.get('code'),url.searchParams.get('state'),req.headers.cookie);ok=true;}catch{}
      const nonce=randomBytes(18).toString('base64');
      res.writeHead(ok?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,'Set-Cookie':`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`});
      res.end(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>飞牛音乐授权</title><style>body{font:16px/1.6 system-ui;padding:32px;max-width:520px;margin:auto}a{display:inline-block;padding:12px}</style><h1>${ok?'已连接飞牛音乐':'连接未完成'}</h1><p>${ok?'请返回原来的小爱音箱页面，点击“检查连接”。可以关闭本页。':'授权过期、回调被拒绝或会话验证失败。请回到插件重新连接，不要重复刷新本页。'}</p><p>本页不会显示授权码或音乐令牌。</p><a href="/">返回工具箱</a><script nonce="${nonce}">history.replaceState(null,'',location.pathname);</script></html>`);return true;
    }
    throw httpError('飞牛音乐操作不存在',404);
  }
  dispose(){this.closed=true;++this.generation;this.sessions.clear();this.transport.dispose?.();}
}
