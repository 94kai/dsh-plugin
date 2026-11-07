function createMusicView(React,{h,useApi,useAction,Status,button,field,select}) {
  const bytes=value=>value>1048576?`${(value/1048576).toFixed(1)} MiB`:`${Math.round((value||0)/1024)} KiB`;
  const qualities=[['standard','标准'],['exhigh','极高'],['lossless','无损'],['hires','Hi-Res'],['jyeffect','高清环绕声'],['sky','沉浸环绕声'],['jymaster','超清母带']];
  const durationText=value=>{const seconds=Number(value);return Number.isFinite(seconds)&&seconds>0?`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`:'';};

  function MusicModal({title,subtitle,onClose,onBack,children,footer}){
    const closeRef=React.useRef(null);
    React.useEffect(()=>{const onKey=event=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',onKey);closeRef.current?.focus?.();return()=>document.removeEventListener('keydown',onKey);},[onClose]);
    return h('div',{className:'pk-modal',onClick:event=>{if(event.target===event.currentTarget)onClose();}},
      h('section',{className:'pk-modal-card',role:'dialog','aria-modal':'true','aria-label':title,onClick:event=>event.stopPropagation()},
        h('header',{className:'pk-modal-head'},
          h('div',{className:'pk-modal-title'},
            h('div',{className:'pk-modal-title-row'},
              onBack?h('button',{type:'button',className:'pk-modal-back',onClick:onBack,'aria-label':'返回编辑'},'←'):null,
              h('h2',null,title)),
            subtitle?h('p',{className:'pk-muted pk-wrap'},subtitle):null),
          h('button',{ref:closeRef,type:'button',className:'pk-modal-close',onClick:onClose,'aria-label':'关闭'},'×')),
        h('div',{className:'pk-modal-body'},children),
        footer?h('footer',{className:'pk-modal-foot'},footer):null));
  }

  function Metadata({api,filename,onClose,onSaved}){
    const [meta,setMeta]=React.useState(null),[candidates,setCandidates]=React.useState([]),[view,setView]=React.useState('edit'),[appliedToken,setAppliedToken]=React.useState('');
    const action=useAction();
    React.useEffect(()=>{action.run(async()=>setMeta((await api('/metadata?file='+encodeURIComponent(filename))).metadata),'');},[filename]);
    const change=(key,value)=>setMeta(current=>({...current,[key]:value}));
    const save=()=>action.run(async()=>{const payload={...meta};if(meta.lyricsSupported===false)delete payload.lyrics;setMeta((await api('/metadata','PUT',payload)).metadata);setCandidates([]);setAppliedToken('');await onSaved();},'音乐信息已保存');
    const search=()=>action.run(async()=>{if(!String(meta?.title||'').trim())throw new Error('请先填写歌曲名再搜索匹配。');const result=await api('/scrape','POST',{filename,title:meta.title,artist:meta.artist});setCandidates(result.candidates||[]);setView('candidates');},'');
    const apply=candidate=>{setMeta(current=>({...current,title:candidate.name||current.title,artist:candidate.artist||current.artist,album:candidate.album||current.album,lyrics:candidate.lyrics||current.lyrics,scrapeToken:candidate.token}));setAppliedToken(candidate.token);setView('edit');};
    if(!meta)return h(MusicModal,{title:'编辑音乐信息',subtitle:filename,onClose},h(Status,{state:action}),h('p',{className:'pk-muted'},'正在读取音乐信息…'));
    if(view==='candidates'){
      const rows=candidates.map((candidate,index)=>h('article',{className:'pk-candidate',key:candidate.token||index,'data-applied':appliedToken===candidate.token?'true':undefined},
        h('div',{className:'pk-candidate-main'},
          h('div',{className:'pk-candidate-heading'},h('strong',null,candidate.name),appliedToken===candidate.token?h('span',{className:'pk-candidate-badge'},'已应用'):null),
          h('div',{className:'pk-muted pk-wrap'},[candidate.artist,candidate.album,candidate.sourceLabel,durationText(candidate.duration)].filter(Boolean).join(' · ')),
          candidate.lyricsMessage?h('p',{className:'pk-muted'},candidate.lyricsMessage):null,
          candidate.lyrics?h('details',{className:'pk-candidate-lyrics'},h('summary',null,'查看歌词预览'),h('pre',null,candidate.lyrics.slice(0,800)+(candidate.lyrics.length>800?'…':''))):null),
        h('div',{className:'pk-candidate-actions'},h('button',{type:'button',className:'pk-candidate-use',onClick:()=>apply(candidate),disabled:action.busy},appliedToken===candidate.token?'重新使用此匹配':'使用此匹配'))));
      return h(MusicModal,{title:'选择匹配结果',subtitle:`找到 ${candidates.length} 个匹配；选择后回到编辑，保存修改后才会写入文件。`,onClose,onBack:()=>setView('edit'),footer:h(React.Fragment,null,
        button('返回编辑',()=>setView('edit'),action.busy),
        button('重新搜索',search,action.busy))},
        h(Status,{state:action}),
        candidates.length?h('section',{className:'pk-candidate-list','aria-label':'匹配候选'},rows):h('p',null,'没有找到匹配，可返回编辑调整歌曲名或歌手后重试。'));
    }
    const fields=[['title','歌曲名'],['artist','歌手'],['album','专辑'],['date','日期'],['genre','风格'],['track','曲序']];
    return h(MusicModal,{title:'编辑音乐信息',subtitle:filename,onClose,footer:h(React.Fragment,null,
      button(candidates.length?'重新搜索匹配':'搜索匹配',search,action.busy),
      candidates.length?button(`查看候选（${candidates.length}）`,()=>setView('candidates'),action.busy):null,
      h('button',{type:'button',className:'pk-primary',onClick:save,disabled:action.busy},'保存修改'))},
      h(Status,{state:action}),
      appliedToken?h('div',{className:'pk-applied'},h('span',null,'已应用匹配，保存后才会写入文件。'),button('查看候选',()=>setView('candidates'),action.busy)):null,
      h('form',{className:'pk-form',onSubmit:event=>{event.preventDefault();save();}},
        h('div',{className:'pk-grid'},fields.map(([key,label])=>h(React.Fragment,{key},field(label,meta[key],value=>change(key,value))))),
        h('label',null,'歌词',h('textarea',{value:meta.lyrics||'',onChange:event=>change('lyrics',event.target.value),disabled:meta.lyricsSupported===false})),
        h('p',{className:'pk-muted'},meta.lyricsSupported===false?'该格式不支持歌词写入。':'保存会保留表单中未修改字段；匹配结果须自行确认。')));
  }

  function MoveDialog({api,files,roots,onClose,onMoved,onManageTargets}){
    const action=useAction();
    const [root,setRoot]=React.useState(roots[0]?.id||''),[path,setPath]=React.useState(''),[directory,setDirectory]=React.useState(null);
    React.useEffect(()=>{
      setDirectory(null);setPath('');
      if(!root)return;
      action.run(async()=>{const next=await api('/directories?'+new URLSearchParams({root,path:''}));setDirectory(next);setPath(next.path||'');},'');
    },[root]);
    const browse=nextPath=>action.run(async()=>{const next=await api('/directories?'+new URLSearchParams({root,path:nextPath}));setDirectory(next);setPath(next.path||'');},'');
    const move=()=>{if(!directory)return;const target=path.trim()||'/';if(!window.confirm(`将 ${files.length} 首文件移动到“${target}”？原下载目录中的文件会移走，此操作不可撤销。`))return;action.run(async()=>{await api('/move','POST',{files,root,path});await onMoved();},'文件已移动');};
    return h(MusicModal,{title:`移动 ${files.length} 首音乐`,subtitle:'选择目标目录；移动会从下载目录移走原文件，不可撤销。',onClose,footer:h(React.Fragment,null,
      button('取消',onClose,action.busy),
      h('button',{type:'button',className:'pk-primary',onClick:move,disabled:action.busy||!directory||!files.length},'移动到此目录'))},
      h(Status,{state:action}),
      h('div',{className:'pk-form'},!roots.length
        ?h('div',{className:'pk-move-empty'},h('p',null,'还没有移动目标目录。'),button('管理目标目录',onManageTargets,action.busy))
        :h(React.Fragment,null,
          select('目标根目录',root,setRoot,roots.map(item=>[item.id,item.label])),
          directory?h(React.Fragment,null,
            h('div',{className:'pk-breadcrumb'},h('span',{className:'pk-muted'},'当前位置'),h('strong',null,directory.path||'/')),
            field('移动目标相对子目录（可填写新目录）',path,setPath,{placeholder:'留空表示根目录'}),
            h('div',{className:'pk-directory-list'},directory.parent!==null?button('上一级',()=>browse(directory.parent),action.busy):null,directory.directories.map(name=>button(name,()=>browse([directory.path,name].filter(Boolean).join('/')),action.busy)))):h('p',{className:'pk-muted'},'正在读取目录…'))));
  }

  function MoveTargets({api,onClose,onSaved}){
    const action=useAction(),[items,setItems]=React.useState(null);
    React.useEffect(()=>{action.run(async()=>setItems((await api('/config')).moveRoots||[]),'');},[]);
    const save=()=>action.run(async()=>{const result=await api('/config','PUT',{moveRoots:items});setItems(result.moveRoots||[]);await onSaved();onClose();},'');
    return h(MusicModal,{title:'移动目标目录',subtitle:'配置允许下载文件移动到的目录；不会复制整个曲库。',onClose,footer:h(React.Fragment,null,
      button('完成',onClose,action.busy),
      h('button',{type:'button',className:'pk-primary',onClick:save,disabled:action.busy||!items?.length},'保存目标目录'))},
      h(Status,{state:action}),
      !items?h('p',{className:'pk-muted'},'正在读取目录配置…'):h(React.Fragment,null,
        items.length?items.map((root,index)=>h('div',{className:'pk-move-root',key:index},
          h('div',{className:'pk-grid'},field('名称',root.label,value=>setItems(list=>list.map((item,i)=>i===index?{...item,label:value}:item))),field('绝对路径',root.path,value=>setItems(list=>list.map((item,i)=>i===index?{...item,path:value}:item)))),
          button('移除此目标',()=>setItems(list=>list.filter((_,i)=>i!==index)),action.busy))):h('p',{className:'pk-muted'},'还没有目标目录，请至少添加一个。'),
        h('div',{className:'pk-actions'},button('添加目标',()=>setItems(list=>[...(list||[]),{label:'',path:''}]),action.busy))));
  }

  function Settings({api,status,reload}){
    const action=useAction(),[cookie,setCookie]=React.useState(''),[qr,setQr]=React.useState(null);
    async function checkQr(){const result=await api('/netease/qr?id='+encodeURIComponent(qr.id));if(result.loggedIn){setQr(null);await reload();return 'authorized';}return result.state;}
    return h('section',null,h(Status,{state:action}),
      h('div',{className:'pk-panel'},h('h2',null,'网易云登录'),h('p',null,status?.netease?.loggedIn?'已登录（凭据只保存在服务端）':'未登录'),h('p',{className:'pk-muted'},'仅下载账号有权访问的内容。二维码和 Cookie 不写入源码、浏览器存储或日志。'),h('div',{className:'pk-actions'},button('生成登录二维码',()=>action.run(async()=>setQr((await api('/netease/qr','POST',{})).qr),'请用网易云App扫码，再检查状态'),action.busy),status?.netease?.loggedIn&&button('退出网易云',()=>{if(window.confirm('退出网易云并删除本地登录凭据？'))action.run(async()=>{await api('/netease/session','DELETE');await reload();});},action.busy)),qr&&h('div',null,h('img',{className:'pk-qr',src:qr.image,alt:'网易云登录二维码'}),h('p',{className:'pk-muted'},'有效期至 ',new Date(qr.expiresAt).toLocaleTimeString()),button('检查扫码登录状态',()=>action.run(async()=>{const state=await checkQr();if(state!=='authorized')throw new Error(state==='expired'?'二维码已过期，请重新生成。':state==='confirming'?'请在网易云App确认授权。':'尚未扫码，请扫码后重试。');},'登录成功'),action.busy)),h('details',null,h('summary',null,'使用 Cookie 登录'),h('form',{className:'pk-form',onSubmit:event=>{event.preventDefault();action.run(async()=>{await api('/netease/session','PUT',{cookie});setCookie('');await reload();},'登录成功');}},field('Cookie（仅发送至当前DSH后端）',cookie,setCookie,{type:'password',autoComplete:'off',required:true}),h('button',{type:'submit',disabled:action.busy||!cookie},'验证并保存')))),
      !status?.ready&&h('div',{className:'pk-panel'},h('h2',null,'下载工具'),h('p',null,'搜索依赖 media-get。安装会从上游下载并准备可执行程序，只在你明确点击后进行。'),button('安装下载工具',()=>{if(window.confirm('从上游下载并安装 media-get 到本地私人目录？'))action.run(async()=>{await api('/tools/install','POST',{});await reload();},'下载工具已就绪');},action.busy)));
  }

  return function MusicView(){
    const api=useApi('music'),action=useAction();
    const [tab,setTab]=React.useState('search'),[status,setStatus]=React.useState(null),[q,setQ]=React.useState(''),[quality,setQuality]=React.useState('lossless'),[results,setResults]=React.useState(null),[downloads,setDownloads]=React.useState({items:[],jobs:[]}),[selected,setSelected]=React.useState([]),[audio,setAudio]=React.useState(''),[editing,setEditing]=React.useState(''),[moving,setMoving]=React.useState(false),[targetsOpen,setTargetsOpen]=React.useState(false);
    const [showUnavailable,setShowUnavailable]=React.useState(true);
    const active=React.useRef(true);React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
    async function reload(){const [next,list]=await Promise.all([api('/status'),api('/downloads')]);if(active.current){setStatus(next);setDownloads(list);}}
    async function refreshAfterWrite(){try{await reload();}catch(error){if(error.name!=='AbortError')action.setError('操作已提交，但列表刷新失败。请先刷新状态，不要重复提交。');}}
    React.useEffect(()=>{action.run(reload,'');},[]);
    const running=downloads.jobs.some(job=>['queued','running'].includes(job.status));
    React.useEffect(()=>{if(!running)return;let cancelled=false;let timer;const poll=async()=>{try{const list=await api('/downloads');if(!cancelled)setDownloads(list);}catch(error){if(!cancelled&&error.name!=='AbortError')action.setError(error.message);}if(!cancelled)timer=setTimeout(poll,3000);};timer=setTimeout(poll,3000);return()=>{cancelled=true;clearTimeout(timer);};},[running]);
    const audioUrl=(file,download=false)=>new URL('api/pocket-kit/music/audio?file='+encodeURIComponent(file)+(download?'&download=1':''),document.baseURI).href;
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
        h('a',{className:'pk-download-local',href:audioUrl(item.name,true),download:item.name,title:'下载到本机','aria-label':`下载到本机：${item.name}`},'下载'),
        button('信息',()=>setEditing(item.name),action.busy),
        button('改名',()=>{const name=window.prompt('新文件名（不含扩展名）',item.name.replace(/\.[^.]+$/,''));if(name!==null)action.run(async()=>{await api('/downloads/rename','POST',{filename:item.name,name});setAudio('');setSelected([]);await refreshAfterWrite();});},action.busy),
        button('删除',()=>{if(window.confirm(`删除下载文件“${item.name}”？此操作不可恢复。`))action.run(async()=>{await api('/downloads?file='+encodeURIComponent(item.name),'DELETE');setAudio('');setSelected(names=>names.filter(name=>name!==item.name));await refreshAfterWrite();});},action.busy,'pk-danger'))));
    const selectionBar=selected.length>0&&h('div',{className:'pk-selection-bar'},
      h('div',{className:'pk-selection-info'},h('strong',null,`已选 ${selected.length} 首`),h('span',{className:'pk-muted'},'勾选歌曲后可批量移动')),
      h('div',{className:'pk-actions'},button('取消选择',()=>setSelected([]),action.busy),h('button',{type:'button',className:'pk-primary',onClick:()=>setMoving(true),disabled:action.busy},'移动已选')));
    const filesPanel=h(React.Fragment,null,
      h('div',{className:'pk-toolbar'},h('div',null,h('h2',null,'已下载音乐'),h('p',{className:'pk-muted'},`${downloads.items.length} 首 · 已选 ${selected.length} 首`)),h('div',{className:'pk-actions'},button('目标目录',()=>setTargetsOpen(true),action.busy),button('刷新列表',()=>action.run(reload,''),action.busy))),
      selectionBar,
      downloads.jobs.length>0&&h('details',{className:'pk-panel',open:running},h('summary',null,'下载任务'),downloads.jobs.map(job=>h('div',{className:'pk-row',key:job.id},h('div',{className:'pk-grow pk-wrap'},job.title,h('div',{className:'pk-muted'},({queued:'等待中',running:'下载中',finished:'已完成',failed:'失败',cancelled:'已取消'})[job.status]||job.status),job.error&&h('div',{role:'alert'},job.error))))),
      !downloads.items.length&&h('p',{className:'pk-panel'},'暂无下载文件。'),
      downloads.items.length>0&&h('section',{className:'pk-panel'},fileRows),
      audio&&h('div',{className:'pk-panel'},h('p',{className:'pk-wrap'},audio),h('audio',{key:audio,src:audioUrl(audio),controls:true,autoPlay:true,preload:'none'})),
      editing&&h(Metadata,{key:editing,api,filename:editing,onClose:()=>setEditing(''),onSaved:refreshAfterWrite}),
      moving&&h(MoveDialog,{api,files:selected,roots:status?.roots||[],onClose:()=>setMoving(false),onManageTargets:()=>{setMoving(false);setTargetsOpen(true);},onMoved:async()=>{setSelected([]);setAudio('');setMoving(false);await refreshAfterWrite();}}),
      targetsOpen&&h(MoveTargets,{api,onClose:()=>setTargetsOpen(false),onSaved:refreshAfterWrite}));
    return h('div',null,
      h('div',{className:'pk-tabs','aria-label':'音乐操作'},[['search','搜索下载'],['files','已下载'],['settings','设置与登录']].map(([id,label])=>h('button',{key:id,type:'button','aria-pressed':tab===id,onClick:()=>setTab(id)},label))),
      h(Status,{state:action}),!status&&h('p',{role:'status'},'正在读取音乐状态…'),
      tab==='search'?searchPanel:tab==='files'?filesPanel:h(Settings,{api,status,reload:refreshAfterWrite}));
  };
}
