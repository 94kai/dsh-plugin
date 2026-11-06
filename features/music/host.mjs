import { MusicDownloadModule } from './backend.mjs';
import { mountFeature, privateConfig, projectDir, dataDir } from '../../lib/module-host.mjs';
export const inject = ['connection','tools'];
export function apply(ctx) {
  mountFeature(ctx,{
    name:'music',prefixes:{music:'/api/modules/music-download'},
    async factory(){const config=await privateConfig();const music=new MusicDownloadModule({projectDir,dataDir,...config});await music.initialize();return {music};},
    help:{module:'music',notes:'路径相对音乐模块。GET不会主动播放；POST下载会消耗网络和磁盘，DELETE不可恢复，移动会移除原文件。仅操作用户有权下载的内容。登录与安装只在UI完成。',routes:[
      ['GET','/status','下载器及网易登录状态，不含凭据'],['GET','/search?q=<keyword>&quality=lossless','返回items供下载，支持standard/exhigh/lossless/hires/jyeffect/sky/jymaster'],
      ['GET','/downloads','文件及任务'],['POST','/downloads','body=搜索返回的item'],['DELETE','/downloads?file=<filename>','删除文件'],['POST','/downloads/rename','{filename,name:不含扩展名}'],
      ['GET','/config','移动目录配置'],['PUT','/config','{moveRoots:[{label,path}]}'],['GET','/directories?root=<id>&path=<relative>','浏览允许的目标目录'],['POST','/move','{files:[filename],root:根id,path:相对目录}'],
      ['GET','/metadata?file=<filename>','读取全部音频标签'],['PUT','/metadata','先GET取得全部metadata，再只改所需字段提交完整对象；歌词lyrics，封面候选scrapeToken'],['POST','/scrape','{filename,title,artist}，返回带token的候选，需核实后写入']
    ]}
  });
}
