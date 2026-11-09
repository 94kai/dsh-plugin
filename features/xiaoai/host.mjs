import { FnosMusic } from './fnos.mjs';
import { XiaoAiMusicModule, XiaoAiAssistantModule } from './index.mjs';
import { mountFeature, privateConfig, projectDir, dataDir } from '../../lib/module-host.mjs';
export const inject = ['connection','tools','credentials'];
export function apply(ctx){
 mountFeature(ctx,{
  name:'xiaoai',prefixes:{playback:'/api/modules/xiaoai-music',assistant:'/api/modules/xiaoai-assistant'},
  async factory(){
   const {env}=await privateConfig();const playback=new XiaoAiMusicModule({projectDir,dataDir,env});
   await playback.initialize();playback.fnos=new FnosMusic({credentials:ctx.credentials});const assistant=new XiaoAiAssistantModule({dataDir,xiaoAiMusic:playback});await assistant.initialize();return {assistant,playback};
  },
  help:{notes:'已确认局域网风险且未设置XIAOAI_AUTO_START=false时，加载后自动启动自有worker；不接管旧服务。播放、音量、朗读和快捷控制会影响真实设备；只有用户明确请求时调用。先profiles取得id。网络兼容风险许可只能用户编辑本地配置，不由工具代为授权。',modules:{
   playback:{prefix:'/profiles/<id>',routes:[
    ['GET','/profiles','音箱配置和本实例运行状态'],['POST','/profiles/<id>/worker/start','显式启动，受本地网络许可和端口冲突检查'],['POST','/profiles/<id>/worker/stop','停止本实例worker'],['PUT','/profiles/<id>','先GET取得profile，修改后提交完整可见配置'],
    ['GET','/profiles/<id>/search?q=<keyword>','曲库搜索'],['GET','/profiles/<id>/collection','playlist与飞牛favorites及授权/错误状态；未授权不回落本地收藏'],['POST','/profiles/<id>/playlist','{songs:[搜索结果],mode:append|replace}'],['DELETE','/profiles/<id>/playlist?path=<songPath>','移出播放列表'],['PUT','/profiles/<id>/favorites','{song,favorite:boolean}'],
    ['POST','/profiles/<id>/play','{path,repeat:1..20}'],['POST','/profiles/<id>/play-search','{keyword}'],['POST','/profiles/<id>/random','{repeat}'],['POST','/profiles/<id>/stop','停止播放并清队列'],['POST','/profiles/<id>/collection/play','{source:playlist|favorites,index,repeat}'],['POST','/profiles/<id>/queue/jump','{index}'],['POST','/profiles/<id>/listener','{enabled}'],['POST','/profiles/<id>/refresh','刷新曲库'],['POST','/profiles/<id>/volume','{volume:0..100}'],['POST','/profiles/<id>/speak','{text}'],['DELETE','/profiles/<id>/announcements','清除播报历史'],
    ['GET','/automation','完整revision/playlists/rules'],['PUT','/automation','提交完整revision/playlists/rules；冲突409时重新读取，禁止盲目覆盖']
   ]},assistant:{routes:[['GET','/state','设备、快捷控制和近期指令'],['POST','/send','{profileId,mode:ask|speak,text}'],['POST','/execute','{profileId,controlId,operation:on|off|action}'],['POST','/volume','{profileId,volume}'],['POST','/controls','{name,category:light|aircon|scene|custom,mode:pair|action,onLabel,offLabel,onCommand,offCommand,command}'],['PUT','/controls/<id>','同创建字段'],['DELETE','/controls/<id>','删除快捷控制'],['DELETE','/history/<profileId>','清除指令历史']]}
  }}
 });
}
