import { BeijingPassModule } from './index.mjs';
import { dataDir } from '../../lib/module-host.mjs';
import { mountUtility } from '../../lib/utility-host.mjs';
export const inject=['connection','tools'];
export function apply(ctx){mountUtility(ctx,{name:'beijing-pass',title:'进京证',async factory(){const module=new BeijingPassModule({dataDir});await module.initialize();return module;},userOnly:(path,method)=>method!=='GET'&&(/\/(config|automation)(\/|$)/.test(path)||path.endsWith('/apply')),help:{notes:'凭据只在后端，迁移后自动办理暂停。查询会访问官方服务并可能刷新已有凭据；不会提交办理。提交、凭据更新、自动申请授权仅用户在 UI 完成。',routes:[['GET','/config','配置状态、审核监控与自动申请状态，不含凭据'],['GET','/prepare','查询车辆、证件和脱敏驾驶人资料'],['GET','/automation','自动办理状态'],['POST','/state','与 prepare 一致，主动查询官方接口']]}});}
