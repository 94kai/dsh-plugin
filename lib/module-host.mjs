import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { nodeHandlerResponse, readEnvelope, failure } from './http-adapter.mjs';

export const projectDir = fileURLToPath(new URL('../', import.meta.url));
export const dataDir = fileURLToPath(new URL('../.local/data/', import.meta.url));
export async function privateConfig() {
  try {
    const config = JSON.parse(await readFile(new URL('../.local/integrations.json',import.meta.url),'utf8'));
    if (!config || typeof config !== 'object' || !config.env || !Array.isArray(config.fileRoots)) throw new Error();
    return config;
  } catch (error) {
    if (error.code === 'ENOENT') return {env:{},fileRoots:[]};
    throw new Error('本地集成配置无效，请检查迁移记录；未覆盖原文件。');
  }
}

export class FeatureService {
  constructor(factory, prefixes) {
    this.prefixes = prefixes;
    this.closed = false;
    this.controllers = new Set();
    this.ready = Promise.resolve().then(factory).then(modules => { this.modules = modules; return modules; });
    this.ready.catch(()=>{});
  }
  async request(input, { signal, headers, audio = false } = {}) {
    const { module = Object.keys(this.prefixes)[0], path = '/status', method = 'GET', body } = input;
    if (this.closed) return failure(503,'功能正在卸载');
    if (!Object.hasOwn(this.prefixes,module) || !['GET','POST','PUT','DELETE'].includes(method) || typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\r\n\\]/.test(path)) return failure(400,'操作路径或方法不合法');
    const prefix = this.prefixes[module];
    const url = new URL(prefix + path,'http://pocket-kit.internal');
    if (!url.pathname.startsWith(prefix+'/') || (!audio && url.pathname === prefix+'/audio')) return failure(400,'操作路径不在功能范围内');
    if (audio && (method !== 'GET' || url.pathname !== prefix+'/audio')) return failure(400,'音频路径不合法');
    let modules;
    try { modules = await this.ready; } catch { return failure(503,'功能初始化失败，请检查本地配置与迁移记录。'); }
    if (this.closed) return failure(503,'功能正在卸载');
    const controller = new AbortController();
    this.controllers.add(controller);
    const combined = AbortSignal.any([controller.signal, ...(!audio ? [AbortSignal.timeout(600000)] : []), ...(signal ? [signal] : [])]);
    combined.addEventListener('abort', () => this.controllers.delete(controller), {once:true});
    const response = await nodeHandlerResponse(modules[module].handle.bind(modules[module]), {method,url,body,headers,signal:combined});
    // 包装响应以便音频取消/消费完成后释放控制器。
    if (!response.body) { this.controllers.delete(controller); return response; }
    const reader = response.body.getReader();
    const done = () => this.controllers.delete(controller);
    const stream = new ReadableStream({
      async pull(out) { try { const next = await reader.read(); if(next.done){done();out.close();}else out.enqueue(next.value); } catch(error){done();out.error(error);} },
      async cancel(reason) { controller.abort();done();await reader.cancel(reason).catch(()=>{}); }
    });
    return new Response(stream,{status:response.status,headers:response.headers});
  }
  async dispose() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    const modules = await this.ready.catch(()=>null);
    if (modules) for (const module of new Set(Object.values(modules))) {
      if (module.dispose) await module.dispose();
      else if (module.shutdown) await module.shutdown();
    }
  }
}

export function mountFeature(ctx, {name, factory, prefixes, help}) {
  ctx.effect(() => {
    const service = new FeatureService(factory,prefixes);
    const dispose = [];
    try {
      dispose.push(ctx.connection.fetch.register({
        path:`/api/pocket-kit/${name}`,methods:['POST'],requestBody:'buffered',
        async fetch(request) {
          try { return await service.request(await readEnvelope(request),{signal:request.signal,headers:{origin:request.headers.get('origin')||new URL(request.url).origin}}); }
          catch(error){return failure(error.status || 500,error.status ? error.message : '操作失败');}
        }
      }));
      // OAuth callback inherits the DSH connection authentication gate. No public port.
      if(name==='xiaoai') dispose.push(ctx.connection.fetch.register({
        path:'/api/pocket-kit/xiaoai/fnos/callback',methods:['GET'],requestBody:'buffered',
        fetch:request=>service.request({module:'playback',path:'/fnos/callback'+new URL(request.url).search,method:'GET'},{signal:request.signal,headers:{cookie:request.headers.get('cookie')||''}})
      }));
      // Audio is a GET response; do not use streaming request bodies here.
      // A streaming GET body is invalid Fetch and makes the DSH bridge return 400.
      if(name==='music') dispose.push(ctx.connection.fetch.register({
        path:'/api/pocket-kit/music/audio',methods:['GET'],requestBody:'buffered',
        fetch:request=>service.request({path:'/audio'+new URL(request.url).search},{audio:true,signal:request.signal,headers:{range:request.headers.get('range')||''}})
      }));
      const tools = ctx.get('tools');
      if (tools) dispose.push(tools.register({
        name:`pocket_${name}`, description:`随身工具箱${name==='music'?'音乐下载与文件管理':'小爱播放与音箱控制'}。先调用 help 获取路径和输入约定。写操作可能修改文件、播放音频或控制真实设备，必须符合用户明确请求；登录授权与运行时安装仅在 UI 操作。`,
        parameters:{type:'object',properties:{action:{type:'string',enum:['help','request']},module:{type:'string',enum:Object.keys(prefixes)},path:{type:'string',description:'help列出的功能内路径，可带查询参数。'},method:{type:'string',enum:['GET','POST','PUT','DELETE']},body:{type:'object',additionalProperties:true,description:'对应操作的JSON输入；不传密码、Cookie或token。'}},required:['action'],additionalProperties:false},
        output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
        async execute(args,exec) {
          if(args.action==='help') return help;
          if(args.action!=='request') return {status:400,error:'不支持的操作'};
          if(/\/(netease|tools)\//.test(args.path||'')||/^\/fnos\/(connect|disconnect|callback)$/.test(new URL(args.path||'/', 'http://pocket-kit.internal').pathname)) return {status:403,error:'登录授权及工具安装只能由用户在界面操作'};
          const response = await service.request(args,{signal:exec.signal});
          const text = await response.text();
          if(text.length>48000) return {status:response.status,truncated:true,preview:text.slice(0,48000),hint:'缩小查询范围或到对应UI查看完整列表。'};
          return {status:response.status,data:JSON.parse(text)};
        },
        isConcurrencySafe:args=>args.action==='help'||args.method==='GET'
      }));
    } catch(error) { for(const stop of dispose.reverse()) void stop();void service.dispose();throw error; }
    return async()=>{await Promise.all(dispose.reverse().map(stop=>stop()));await service.dispose();};
  });
}
