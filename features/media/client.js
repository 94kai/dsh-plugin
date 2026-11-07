window.__ModuleLoader__.load({
  id: '@local/pocket-kit-media',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    /* MUSIC_VIEW */
    /* XIAOAI_VIEW */
    const css = `
.pk-media{height:100%;overflow:auto;box-sizing:border-box;padding:16px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:14px/1.5 system-ui,sans-serif}
.pk-media *{box-sizing:border-box}.pk-media-inner{max-width:1000px;margin:auto;padding-bottom:max(24px,env(safe-area-inset-bottom))}.pk-media button,.pk-media input,.pk-media select,.pk-media textarea{font:inherit;color:inherit;min-height:44px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:9px 12px;background:var(--dsw-alias-bg-layer-1);max-width:100%}.pk-media button{cursor:pointer;min-width:44px}.pk-media button:disabled{opacity:.5;cursor:not-allowed}.pk-media :is(button,input,select,textarea):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.pk-media input,.pk-media textarea,.pk-media select{font-size:16px;min-width:0}.pk-media input[type=checkbox]{width:22px;height:22px;min-height:22px;flex:none}.pk-media label{display:flex;flex-direction:column;gap:5px;min-width:0}.pk-media label.pk-check{flex-direction:row;align-items:center;min-height:44px}.pk-media textarea{width:100%;min-height:100px;resize:vertical}.pk-media h1{font-size:20px;margin:0}.pk-media h2{font-size:17px;margin:0 0 10px}.pk-media h3{font-size:15px;margin:0}.pk-media p{margin:8px 0}.pk-toolbar,.pk-actions,.pk-tabs{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pk-toolbar{justify-content:space-between;margin-bottom:12px}.pk-tabs{margin:10px 0 16px}.pk-tabs button[aria-current=page],.pk-tabs button[aria-pressed=true],.pk-primary{background:var(--dsw-alias-brand-primary)!important;color:var(--dsw-alias-on-brand-primary,#fff)!important}.pk-panel{padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;margin:12px 0;min-width:0}.pk-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pk-row{display:flex;gap:10px;align-items:center;padding:12px 0;min-width:0}.pk-row+.pk-row{border-top:1px solid var(--dsw-alias-border-l2)}.pk-grow{flex:1;min-width:0}.pk-wrap{overflow-wrap:anywhere}.pk-muted{font-size:13px;color:var(--dsw-alias-label-secondary)}.pk-error{border:1px solid var(--dsw-alias-state-error-primary);padding:10px;border-radius:8px;overflow-wrap:anywhere}.pk-note{padding:8px 0;overflow-wrap:anywhere}.pk-media summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}.pk-media audio{width:100%;max-width:100%}.pk-media .pk-field{width:100%}.pk-media .pk-form{display:grid;gap:12px}.pk-media .pk-check input{margin:0}.pk-media img.pk-qr{max-width:min(100%,280px);height:auto;display:block}.pk-media code{overflow-wrap:anywhere;white-space:pre-wrap}.pk-danger{color:var(--dsw-alias-state-error-primary)!important}.pk-log{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}.pk-media button:hover{filter:brightness(.97)}
@media(max-width:640px){.pk-media{padding:12px}.pk-grid{grid-template-columns:1fr}.pk-row{flex-wrap:wrap}.pk-row>.pk-actions{width:100%}.pk-row .pk-actions button{flex:1}.pk-panel{padding:12px}.pk-tabs button{flex:1}.pk-toolbar{align-items:flex-start}.pk-actions input.pk-grow{flex-basis:100%}.pk-media .pk-form>button{width:100%}}
`;
    function useApi(feature) {
      const active = React.useRef(true), controllers = React.useRef(new Set());
      React.useEffect(()=>{active.current=true;return()=>{active.current=false;for(const controller of controllers.current)controller.abort();controllers.current.clear();};},[]);
      return React.useCallback(async(path,method='GET',body,module)=>{
        const controller=new AbortController();controllers.current.add(controller);
        try{
          const response=await fetch(new URL(`api/pocket-kit/${feature}`,document.baseURI),{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-Pocket-Kit':'1'},body:JSON.stringify({path,method,body,module})});
          const value=await response.json();if(!response.ok)throw new Error(value.error||`请求失败（${response.status}）`);
          if(!active.current||controller.signal.aborted)throw new DOMException('页面已关闭','AbortError');return value;
        }finally{controllers.current.delete(controller);}
      },[feature]);
    }
    function useAction(){
      const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
      const lock=React.useRef(null),active=React.useRef(true);
      React.useEffect(()=>{active.current=true;return()=>{active.current=false;lock.current=null;};},[]);
      async function run(action,message='操作已完成'){
        if(lock.current)return;const token={};lock.current=token;setBusy(true);setError('');setNotice('');
        try{const result=await action();if(active.current&&lock.current===token)setNotice(message);return result;}
        catch(error){if(active.current&&lock.current===token&&error.name!=='AbortError')setError(error.message);return undefined;}
        finally{if(lock.current===token){lock.current=null;if(active.current)setBusy(false);}}
      }
      return {busy,error,notice,run,setError};
    }
    function Status({state}){return h(React.Fragment,null,state.error&&h('div',{className:'pk-error',role:'alert'},state.error),h('div',{className:'pk-note',role:'status','aria-live':'polite'},state.busy?'正在处理…':state.notice));}
    const button=(label,onClick,disabled=false,className='')=>h('button',{type:'button',onClick,disabled,className},label);
    const field=(label,value,onChange,options={})=>h('label',null,label,h('input',{value:value??'',onChange:event=>onChange(event.target.value),...options}));
    const select=(label,value,onChange,options)=>h('label',null,label,h('select',{value,onChange:event=>onChange(event.target.value)},options.map(([value,label])=>h('option',{key:value,value},label))));
    const shared={h,useApi,useAction,Status,button,field,select};
    const MusicView=createMusicView(React,shared),XiaoaiView=createXiaoaiView(React,shared);
    function Icon({size=20,type='music'}){return type==='xiaoai'?h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('rect',{x:6,y:2,width:12,height:20,rx:4}),h('path',{d:'M10 6h4'}),h('circle',{cx:12,cy:14,r:3.5})):h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,'aria-hidden':true},h('path',{d:'M9 18V5l11-2v13M9 8l11-2'}),h('ellipse',{cx:6,cy:18,rx:3,ry:2}),h('ellipse',{cx:17,cy:16,rx:3,ry:2}));}
    function Page({tab,navigate,back}){return h('section',{className:'pk-media','aria-label':tab==='music'?'音乐':'小爱音箱'},h('style',null,css),h('div',{className:'pk-media-inner'},h('header',{className:'pk-toolbar'},h('h1',null,tab==='music'?'音乐':'小爱音箱'),button('返回工具箱',back)),h('nav',{className:'pk-tabs','aria-label':'功能切换'},[['music','音乐'],['xiaoai','小爱音箱']].map(([id,label])=>h('button',{key:id,type:'button','aria-current':tab===id?'page':undefined,onClick:()=>navigate(id)},label))),tab==='music'?h(MusicView):h(XiaoaiView)));}
    return {inject:['slots','layout','locale'],apply(ctx){
      for(const [tab,label,order] of [['music','音乐',10],['xiaoai','小爱音箱',20]]){
        const panel=`pocket-kit.${tab}`;
        ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:panel},()=>h(Page,{tab,navigate:id=>ctx.layout.selectPanel(`pocket-kit.${id}`),back:()=>ctx.layout.selectPanel('pocket-kit.home')})));
        ctx.slots.inject('local.pocket-kit.home.tool',()=>ctx.slots.register({name:'local.pocket-kit.home.tool',id:panel,order,label:()=>label},({renderCard})=>renderCard({id:tab,title:label,description:tab==='music'?'搜索、下载与整理喜欢的音乐':'播放收藏、管理歌单和音箱',icon:h(Icon,{type:tab}),onClick:()=>ctx.layout.selectPanel(panel)})));
      }
      ctx.effect(()=>()=>{const current=ctx.layout.panelInfo.getSnapshot().activePanelId;if(current==='pocket-kit.music'||current==='pocket-kit.xiaoai')ctx.layout.selectPanel(null);});
    }};
  }
});
