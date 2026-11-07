import { FileManagerModule } from './backend.mjs';
import { dataDir, privateConfig } from '../../lib/module-host.mjs';
import { mountUtility } from '../../lib/utility-host.mjs';
export const inject=['connection','tools'];
export function apply(ctx){mountUtility(ctx,{name:'file-manager',title:'文件管理',async factory(){const config=await privateConfig();const module=new FileManagerModule({dataDir,fileRoots:config.fileRoots});await module.initialize();return module;},upload:(module,req)=>module.upload(req),download:(module,req)=>module.download(req),userOnly:(path,method)=>method!=='GET',help:{notes:'仅浏览已配置根目录。私人文件内容仅按用户明确请求读取。写入/删除/目录授权/分享在 UI 完成，Agent 文件修改请使用遵守 DSH 沙箱与审批的文件工具。旧分享记录保留，但 DSH 下载仍需登录，不自动开放匿名访问。',routes:[['GET','/config','根目录与 revision'],['GET','/entries?root=<id>&path=<relative>&hidden=0','最多2000个条目'],['GET','/text?root=<id>&path=<relative>','最多512 KiB UTF-8文本；工具响应最多48KB'],['GET','/favorites','收藏目录'],['GET','/shares','保留的分享记录，authenticatedOnly=true']]}});}
