import { FeatureService } from './module-host.mjs';
import { readEnvelope, failure } from './http-adapter.mjs';

// Same domain operations for UI and Agent; authority/configuration actions remain UI-only.
export function mountUtility(ctx,{name,title,factory,help,userOnly=()=>false,upload,download}) {
  ctx.effect(()=>{
    const service=new FeatureService(async()=>({[name]:await factory()}),{[name]:`/api/modules/${name}`});
    const disposers=[],transfers=new Set();
    async function transfer(req,operation){if(transfers.size>=4)return failure(429,'正在传输的任务过多，请稍后重试');const controller=new AbortController();transfers.add(controller);try{return await operation(new Request(req,{signal:AbortSignal.any([req.signal,controller.signal,AbortSignal.timeout(600000)])}));}finally{transfers.delete(controller);}}
    const request=async(input,signal)=>service.request(input,{signal});
    disposers.push(ctx.connection.fetch.register({path:`/api/pocket-kit/${name}`,methods:['POST'],requestBody:'buffered',async fetch(req){try{return await request(await readEnvelope(req),req.signal);}catch(e){return failure(e.status||500,e.status?e.message:'操作失败');}}}));
    if(download)disposers.push(ctx.connection.fetch.register({path:`/api/pocket-kit/${name}/download`,methods:['GET'],requestBody:'streaming',async fetch(req){try{const modules=await service.ready;if(service.closed)return failure(503,'功能正在卸载');return await download(modules[name],req);}catch(e){return failure(e.status||500,e.status?e.message:'下载失败');}}}));
    if(upload)disposers.push(ctx.connection.fetch.register({path:`/api/pocket-kit/${name}/upload`,methods:['POST'],requestBody:'streaming',async fetch(req){
      try{
        if(req.headers.get('x-pocket-kit')!=='1'||(req.headers.get('sec-fetch-site')&&!['same-origin','none'].includes(req.headers.get('sec-fetch-site'))))return failure(403,'拒绝跨站上传');
        const modules=await service.ready;if(service.closed)return failure(503,'功能正在卸载');
        return await transfer(req,owned=>upload(modules[name],owned));
      }catch(e){return failure(e.status||500,e.status?e.message:'上传失败');}
    }}));
    disposers.push(ctx.tools.register({
      name:`pocket_${name.replaceAll('-','_')}`,
      description:`随身工具箱${title}。先 help 发现操作与输入。私人数据只按用户请求读取；写入、删除和真实操作须有明确授权；配置权限与凭据仅在 UI 修改。`,
      parameters:{type:'object',properties:{action:{type:'string',enum:['help','request']},path:{type:'string',description:'help 中的功能内路径，可带查询参数。'},method:{type:'string',enum:['GET','POST','PUT','DELETE'],description:'默认 GET。'},body:{type:'object',additionalProperties:true,description:'对应操作输入，不传凭据。'}},required:['action'],additionalProperties:false},
      output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
      async execute(args,exec){
        if(args.action==='help')return help;
        if(args.action!=='request')return {status:400,error:'不支持的操作'};
        // Parse exactly as FeatureService does, so encoded/path-normalized variants cannot bypass policy.
        let pathname;try{pathname=new URL(`/api/modules/${name}${args.path||'/status'}`,'http://internal').pathname;}catch{return {status:400,error:'路径无效'};}
        if(userOnly(pathname,args.method||'GET'))return {status:403,error:'此操作仅可由用户在界面完成'};
        const response=await request(args,exec.signal);
        if(!response.headers.get('content-type')?.includes('application/json')){await response.body?.cancel();return {status:400,error:'二进制文件请在界面下载，不能作为文本返回'};}
        const reader=response.body.getReader();let text='',length=0;const decoder=new TextDecoder();
        while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>48000){await reader.cancel();return {status:response.status,truncated:true,hint:'结果超过 48 KB，请缩小查询范围或使用 UI；未输出私人内容片段。'};}text+=decoder.decode(value,{stream:true});}
        return {status:response.status,data:JSON.parse(text+decoder.decode())};
      },isConcurrencySafe:args=>args.action==='help'||args.method==='GET'
    }));
    return async()=>{for(const controller of transfers)controller.abort();transfers.clear();await Promise.all(disposers.reverse().map(dispose=>dispose()));await service.dispose();};
  });
}
