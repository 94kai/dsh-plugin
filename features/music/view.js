function createMusicView(React,{h,useApi,useAction,Status,button,field,select}) {
  const bytes=value=>value>1048576?`${(value/1048576).toFixed(1)} MiB`:`${Math.round((value||0)/1024)} KiB`;
  const qualities=[['standard','标准'],['exhigh','极高'],['lossless','无损'],['hires','Hi-Res'],['jyeffect','高清环绕声'],['sky','沉浸环绕声'],['jymaster','超清母带']];
  function Metadata({api,filename,onClose,onSaved}){
    const [meta,setMeta]=React.useState(null),[candidates,setCandidates]=React.useState([]);const action=useAction();
    React.useEffect(()=>{action.run(async()=>setMeta((await api('/metadata?file='+encodeURIComponent(filename))).metadata),'');},[filename]);
    const change=(key,value)=>setMeta(current=>({...current,[key]:value}));
    if(!meta)return h('section',{className:'pk-panel'},h(Status,{state:action}),button('关闭',onClose));
    return h('section',{className:'pk-panel','aria-label':'音乐信息编辑'},h('div',{className:'pk-toolbar'},h('h2',null,'编辑音乐信息'),button('关闭',onClose)),h('p',{className:'pk-muted pk-wrap'},filename),h(Status,{state:action}),h('form',{className:'pk-form',onSubmit:event=>{event.preventDefault();action.run(async()=>{const payload={...meta};if(meta.lyricsSupported===false)delete payload.lyrics;setMeta((await api('/metadata','PUT',payload)).metadata);await onSaved();},'音乐信息已保存');}},h('div',{className:'pk-grid'},[['title','歌曲名'],['artist','歌手'],['album','专辑'],['date','日期'],['genre','风格'],['track','曲序']].map(([key,label])=>h(React.Fragment,{key},field(label,meta[key],value=>change(key,value))))),h('label',null,'歌词',h('textarea',{value:meta.lyrics||'',onChange:event=>change('lyrics',event.target.value),disabled:meta.lyricsSupported===false})),h('p',{className:'pk-muted'},meta.lyricsSupported===false?'该格式不支持歌词写入。':'保存会保留表单中未修改字段；刮削结果须自行确认。'),h('div',{className:'pk-actions'},h('button',{className:'pk-primary',disabled:action.busy,type:'submit'},'保存修改'),button('搜索歌词与封面',()=>action.run(async()=>setCandidates((await api('/scrape','POST',{filename,title:meta.title,artist:meta.artist})).candidates||[]),'已取得候选，请核对后选用'),action.busy))),candidates.map((candidate,index)=>h('div',{className:'pk-row',key:candidate.token||index},h('div',{className:'pk-grow pk-wrap'},h('strong',null,candidate.name),h('div',{className:'pk-muted'},candidate.artist,' · ',candidate.album),candidate.lyricsMessage&&h('p',null,candidate.lyricsMessage)),button('选用此候选',()=>{setMeta(current=>({...current,title:candidate.name||current.title,artist:candidate.artist||current.artist,album:candidate.album||current.album,lyrics:candidate.lyrics||current.lyrics,scrapeToken:candidate.token}));setCandidates([]);},action.busy))));
  }
  function Settings({api,status,reload}){
    const action=useAction();const [cookie,setCookie]=React.useState(''),[qr,setQr]=React.useState(null),[roots,setRoots]=React.useState(null);
    React.useEffect(()=>{action.run(async()=>setRoots((await api('/config')).moveRoots||[]),'');},[]);
    async function checkQr(){const result=await api('/netease/qr?id='+encodeURIComponent(qr.id));if(result.loggedIn){setQr(null);await reload();return 'authorized';}return result.state;}
    return h('section',null,h(Status,{state:action}),h('div',{className:'pk-panel'},h('h2',null,'网易云登录'),h('p',null,status?.netease?.loggedIn?'已登录（凭据只保存在服务端）':'未登录'),h('p',{className:'pk-muted'},'仅下载账号有权访问的内容。二维码和 Cookie 不写入源码、浏览器存储或日志。'),h('div',{className:'pk-actions'},button('生成登录二维码',()=>action.run(async()=>setQr((await api('/netease/qr','POST',{})).qr),'请用网易云App扫码，再检查状态'),action.busy),status?.netease?.loggedIn&&button('退出网易云',()=>{if(window.confirm('退出网易云并删除本地登录凭据？'))action.run(async()=>{await api('/netease/session','DELETE');await reload();});},action.busy)),qr&&h('div',null,h('img',{className:'pk-qr',src:qr.image,alt:'网易云登录二维码'}),h('p',{className:'pk-muted'},'有效期至 ',new Date(qr.expiresAt).toLocaleTimeString()),button('检查扫码登录状态',()=>action.run(async()=>{const state=await checkQr();if(state!=='authorized')throw new Error(state==='expired'?'二维码已过期，请重新生成。':state==='confirming'?'请在网易云App确认授权。':'尚未扫码，请扫码后重试。');},'登录成功'),action.busy)),h('details',null,h('summary',null,'使用 Cookie 登录'),h('form',{className:'pk-form',onSubmit:event=>{event.preventDefault();action.run(async()=>{await api('/netease/session','PUT',{cookie});setCookie('');await reload();},'登录成功');}},field('Cookie（仅发送至当前DSH后端）',cookie,setCookie,{type:'password',autoComplete:'off',required:true}),h('button',{type:'submit',disabled:action.busy||!cookie},'验证并保存')))),h('div',{className:'pk-panel'},h('h2',null,'移动目标目录'),h('p',{className:'pk-muted'},'仅配置本人允许音乐文件移动到的目录。原 NAS 目录保留引用，不复制整座曲库。'),roots&&h('form',{className:'pk-form',onSubmit:event=>{event.preventDefault();action.run(async()=>{setRoots((await api('/config','PUT',{moveRoots:roots})).moveRoots);await reload();},'目录配置已保存');}},roots.map((root,index)=>h('div',{className:'pk-grid',key:index},field('名称',root.label,value=>setRoots(items=>items.map((item,i)=>i===index?{...item,label:value}:item))),field('绝对路径',root.path,value=>setRoots(items=>items.map((item,i)=>i===index?{...item,path:value}:item))),button('移除此目标',()=>setRoots(items=>items.filter((_,i)=>i!==index)),action.busy))),h('div',{className:'pk-actions'},button('添加目标',()=>setRoots(items=>[...items,{label:'',path:''}]),action.busy),h('button',{type:'submit',disabled:action.busy},'保存目标目录')))),!status?.ready&&h('div',{className:'pk-panel'},h('h2',null,'下载工具'),h('p',null,'搜索依赖 media-get。安装会从上游下载并准备可执行程序，只在你明确点击后进行。'),button('安装下载工具',()=>{if(window.confirm('从上游下载并安装 media-get 到本地私人目录？'))action.run(async()=>{await api('/tools/install','POST',{});await reload();},'下载工具已就绪');},action.busy)));
  }
  return function MusicView(){
    const api=useApi('music'),action=useAction();
    const [tab,setTab]=React.useState('search'),[status,setStatus]=React.useState(null),[q,setQ]=React.useState(''),[quality,setQuality]=React.useState('lossless'),[results,setResults]=React.useState(null),[downloads,setDownloads]=React.useState({items:[],jobs:[]}),[selected,setSelected]=React.useState([]),[audio,setAudio]=React.useState(''),[editing,setEditing]=React.useState(''),[moveRoot,setMoveRoot]=React.useState(''),[directory,setDirectory]=React.useState(null);
    const [showUnavailable,setShowUnavailable]=React.useState(true),[movePath,setMovePath]=React.useState('');
    const active=React.useRef(true);React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
    async function reload(){const [next,list]=await Promise.all([api('/status'),api('/downloads')]);if(active.current){setStatus(next);setDownloads(list);}}
    async function refreshAfterWrite(){try{await reload();}catch(error){if(error.name!=='AbortError')action.setError('操作已提交，但列表刷新失败。请先刷新状态，不要重复提交。');}}
    React.useEffect(()=>{action.run(reload,'');},[]);
    const running=downloads.jobs.some(job=>['queued','running'].includes(job.status));
    React.useEffect(()=>{if(!running)return;let cancelled=false;let timer;const poll=async()=>{try{const list=await api('/downloads');if(!cancelled)setDownloads(list);}catch(error){if(!cancelled&&error.name!=='AbortError')action.setError(error.message);}if(!cancelled)timer=setTimeout(poll,3000);};timer=setTimeout(poll,3000);return()=>{cancelled=true;clearTimeout(timer);};},[running]);
    async function browse(root,path=''){setDirectory(await api('/directories?'+new URLSearchParams({root,path})));setMoveRoot(root);setMovePath(path);}
    const audioUrl=file=>new URL('api/pocket-kit/music/audio?file='+encodeURIComponent(file),document.baseURI).href;
    const searchPanel = h(React.Fragment,null,
      h('form',{className:'pk-panel pk-form',onSubmit:event=>{event.preventDefault();action.run(async()=>setResults(await api('/search?'+new URLSearchParams({q,quality}))),'搜索完成');}},
        h('div',{className:'pk-grid'},field('歌曲名',q,setQ,{placeholder:'输入歌名关键词（按歌名筛选）',required:true,maxLength:100}),select('网易云音质',quality,setQuality,qualities)),
        h('div',{className:'pk-actions'},h('button',{type:'submit',className:'pk-primary',disabled:action.busy||!q.trim()},'搜索'),button('刷新状态',()=>action.run(reload,''),action.busy)),
        status&&!status.ready&&h('p',{className:'pk-muted'},'下载工具未就绪，可在设置中显式安装。')),
      results&&h('section',{className:'pk-panel','aria-label':'搜索结果'},
        h('h2',null,`搜索结果（${results.items?.length||0}）`),
        h('p',{className:'pk-muted pk-wrap'},`来源：${(results.sources||[]).join('、')} · 歌名过滤 ${results.excludedByTitle||0} 项 · 暂不可用 ${results.unavailable||0} 项`),
        h('label',{className:'pk-check'},h('input',{type:'checkbox',checked:showUnavailable,onChange:event=>setShowUnavailable(event.target.checked)}),'显示暂不可下载的结果（可尝试重新解析）'),
        (results.warnings||[]).map((warning,index)=>h('p',{className:'pk-muted pk-wrap',key:index},typeof warning==='string'?warning:warning.message||'部分来源暂不可用')),
        !(results.items||[]).length&&h('p',null,'没有找到可用结果，可调整关键词或检查来源登录状态。'),
        (results.items||[]).filter(item=>showUnavailable||item.downloadable!==false).map((item,index)=>h('article',{className:'pk-row',key:item.id||index},
          h('div',{className:'pk-grow pk-wrap'},h('strong',null,item.name),h('div',{className:'pk-muted'},[item.artist,item.uploader,item.album,item.sourceLabel,item.actualQuality].filter(Boolean).join(' · ')),item.unavailableReason&&h('p',{className:'pk-muted'},item.unavailableReason)),
          button(item.downloadable===false?'尝试下载':'下载',()=>action.run(async()=>{await api('/downloads','POST',item);await refreshAfterWrite();},'已加入下载队列，可在已下载页查看进度'),action.busy)))));
    const fileRows=downloads.items.map(item=>h('article',{className:'pk-row',key:item.name},
      h('label',{className:'pk-check pk-grow'},h('input',{type:'checkbox',checked:selected.includes(item.name),onChange:event=>setSelected(names=>event.target.checked?[...names,item.name]:names.filter(name=>name!==item.name))}),h('span',{className:'pk-wrap'},item.name,h('div',{className:'pk-muted'},bytes(item.size)))),
      h('div',{className:'pk-actions'},
        button(audio===item.name?'收起播放':'试听',()=>setAudio(current=>current===item.name?'':item.name)),
        h('a',{href:audioUrl(item.name),download:item.name,style:{padding:'12px'},'aria-label':`下载到本机：${item.name}`},'下载到本机'),
        button('信息',()=>setEditing(item.name),action.busy),
        button('改名',()=>{const name=window.prompt('新文件名（不含扩展名）',item.name.replace(/\.[^.]+$/,''));if(name!==null)action.run(async()=>{await api('/downloads/rename','POST',{filename:item.name,name});setAudio('');setSelected([]);await refreshAfterWrite();});},action.busy),
        button('删除',()=>{if(window.confirm(`删除下载文件“${item.name}”？此操作不可恢复。`))action.run(async()=>{await api('/downloads?file='+encodeURIComponent(item.name),'DELETE');setAudio('');setSelected(names=>names.filter(name=>name!==item.name));await refreshAfterWrite();});},action.busy,'pk-danger'))));
    const movePanel=selected.length>0&&h('section',{className:'pk-panel'},
      h('h2',null,`移动已选 ${selected.length} 首`),
      select('目标根目录',moveRoot,value=>value?action.run(()=>browse(value),''):(setMoveRoot(''),setDirectory(null)),[['','请选择'],...(status?.roots||[]).map(root=>[root.id,root.label])]),
      directory&&h('div',null,h('p',{className:'pk-wrap'},'浏览目录：',directory.path||'/'),
        field('移动目标相对子目录（可填写新目录）',movePath,setMovePath,{placeholder:'留空表示根目录'}),
        h('div',{className:'pk-actions'},directory.parent!==null&&button('上一级',()=>action.run(()=>browse(moveRoot,directory.parent),''),action.busy),directory.directories.map(name=>h('span',{key:name},button(name,()=>action.run(()=>browse(moveRoot,[directory.path,name].filter(Boolean).join('/')),''),action.busy)))),
        button('移动到当前目录',()=>{if(window.confirm('将所选文件移动到当前目标目录？原下载目录中的文件会移走。'))action.run(async()=>{await api('/move','POST',{files:selected,root:moveRoot,path:movePath});setSelected([]);setAudio('');await refreshAfterWrite();},'文件已移动');},action.busy)));
    const filesPanel=h(React.Fragment,null,
      h('div',{className:'pk-toolbar'},h('h2',null,'已下载音乐'),button('刷新列表',()=>action.run(reload,''),action.busy)),
      downloads.jobs.length>0&&h('details',{className:'pk-panel',open:running},h('summary',null,'下载任务'),downloads.jobs.map(job=>h('div',{className:'pk-row',key:job.id},h('div',{className:'pk-grow pk-wrap'},job.title,h('div',{className:'pk-muted'},({queued:'等待中',running:'下载中',finished:'已完成',failed:'失败',cancelled:'已取消'})[job.status]||job.status),job.error&&h('div',{role:'alert'},job.error))))),
      !downloads.items.length&&h('p',{className:'pk-panel'},'暂无下载文件。'),
      downloads.items.length>0&&h('section',{className:'pk-panel'},fileRows),
      audio&&h('div',{className:'pk-panel'},h('p',{className:'pk-wrap'},audio),h('audio',{key:audio,src:audioUrl(audio),controls:true,autoPlay:true,preload:'none'})),
      movePanel,
      editing&&h(Metadata,{key:editing,api,filename:editing,onClose:()=>setEditing(''),onSaved:refreshAfterWrite}));
    return h('div',null,
      h('div',{className:'pk-tabs','aria-label':'音乐操作'},[['search','搜索下载'],['files','已下载'],['settings','设置与登录']].map(([id,label])=>h('button',{key:id,type:'button','aria-pressed':tab===id,onClick:()=>setTab(id)},label))),
      h(Status,{state:action}),!status&&h('p',{role:'status'},'正在读取音乐状态…'),
      tab==='search'?searchPanel:tab==='files'?filesPanel:h(Settings,{api,status,reload:refreshAfterWrite}));
  };
}
