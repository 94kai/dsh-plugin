window.__ModuleLoader__.load({
  id: '@local/pocket-kit-home',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    /* KIT_CHROME */
    const PANEL = 'pocket-kit.home';
    const NS = 'pocket-kit-home';
    /* HOME_STARTUP */
    const dictionaries = {
      zh: {title:'工具箱',subtitle:'常用工具，一触即达。',tools:'日常工具',links:'常用网站',details:'管理链接',chat:'返回对话',loading:'正在加载快捷链接…',error:'快捷链接暂时无法加载。工具入口仍可使用。',retry:'重新加载',empty:'还没有配置快捷链接。',newTab:'在新标签页打开',refresh:'刷新链接',open:'打开'},
      en: {title:'Toolbox',subtitle:'Your tools and everyday links, in one place.',tools:'Tools',links:'Quick links',details:'Details and notes',chat:'Back to chat',loading:'Loading quick links…',error:'Quick links are unavailable. Your tools are still accessible.',retry:'Retry',empty:'No quick links configured yet.',newTab:'Opens in a new tab',refresh:'Refresh links',open:'Open'}
    };
    const css = `
.pk-home{--pk-accent:#7160df;--pk-bg:var(--dsw-alias-bg-base,#fff);--pk-ink:var(--dsw-alias-label-primary,#202332);--pk-muted:var(--dsw-alias-label-secondary,#777d8d);height:100%;min-width:0;box-sizing:border-box;overflow:auto;padding:36px 32px;color:var(--pk-ink);background:color-mix(in srgb,var(--pk-ink) 2.5%,var(--pk-bg));font:14px/1.5 system-ui,sans-serif}
.pk-home *{box-sizing:border-box}.pk-home-inner{max-width:1000px;margin:auto;padding-bottom:max(24px,env(safe-area-inset-bottom))}.pk-home-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 32px}.pk-home-title{display:flex;align-items:center;gap:13px;min-width:0}.pk-home-title h1{font-size:27px;font-weight:700;letter-spacing:-.7px;line-height:1.3;margin:0}.pk-home-title p{margin:6px 0 0;font-size:13px;color:var(--pk-muted)}.pk-home-mark{display:grid;place-items:center;width:48px;height:48px;flex:none;border-radius:15px;color:#fff;background:linear-gradient(145deg,#8c7cf0,#6756ce);box-shadow:0 5px 12px #7160df22}
.pk-home-section{margin:0 0 28px}.pk-home-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}.pk-home-section-head h2{font-size:14px;font-weight:650;margin:0;letter-spacing:.3px}.pk-home-actions{display:flex;gap:4px;flex-wrap:wrap}.pk-home .pk-home-button{min-height:44px;min-width:44px;padding:9px 12px;border:1px solid color-mix(in srgb,var(--pk-ink) 9%,transparent);border-radius:12px;background:var(--pk-bg);color:var(--pk-muted);font:inherit;font-size:12px;cursor:pointer}.pk-home-actions .pk-home-button{border-color:transparent;background:transparent}.pk-home .pk-home-button:disabled{opacity:.5;cursor:default}
.pk-home-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.pk-home .pk-home-tool{--tool-color:#7160df;min-width:0;min-height:104px;display:grid;grid-template-columns:48px minmax(0,1fr) 16px;grid-template-rows:auto auto;column-gap:14px;row-gap:5px;align-content:center;text-align:left;padding:20px;border:1px solid color-mix(in srgb,var(--pk-ink) 7%,transparent);border-radius:18px;background:var(--pk-bg);box-shadow:0 2px 3px #00000002;color:inherit;font:inherit;cursor:pointer}.pk-home-tool-icon{grid-row:1/3;display:grid;place-items:center;align-self:center;width:48px;height:48px;border-radius:15px;background:color-mix(in srgb,var(--tool-color) 11%,var(--pk-bg));color:var(--tool-color)}.pk-home-tool-icon svg{width:24px;height:24px}.pk-home-tool-heading{min-width:0;grid-column:2;align-self:end;font-weight:650;font-size:15px;overflow-wrap:anywhere}.pk-home-tool>.pk-home-arrow{grid-column:3;grid-row:1/3;align-self:center;font-size:20px;color:var(--pk-muted);opacity:.5}.pk-home-tool-description{grid-column:2;min-width:0;align-self:start;color:var(--pk-muted);font-size:12px;overflow-wrap:anywhere;line-height:1.5}
.pk-home-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pk-home .pk-home-link{min-width:0;display:flex;align-items:center;gap:12px;min-height:76px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--pk-ink) 7%,transparent);border-radius:15px;text-decoration:none;color:inherit;background:var(--pk-bg)}.pk-home-link-icon{flex:none;width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:color-mix(in srgb,var(--pk-ink) 3%,var(--pk-bg));color:var(--pk-accent);font-weight:600}.pk-home-link-icon img{width:25px;height:25px;object-fit:contain}.pk-home-link-text{flex:1;min-width:0;overflow-wrap:anywhere}.pk-home-link-text strong{font-size:13px;display:block;font-weight:600}.pk-home-link-text small{display:block;color:var(--pk-muted);font-size:11px;margin-top:3px}.pk-home-arrow{font-weight:400;color:var(--pk-muted)}.pk-home-status{padding:20px;border:1px dashed color-mix(in srgb,var(--pk-ink) 15%,transparent);border-radius:14px;color:var(--pk-muted)}.pk-home-status p{margin:0 0 10px}.pk-home :is(button,a):focus-visible,.pk-home-launcher:focus-visible{outline:2px solid #7160df;outline-offset:3px}
.pk-home-footer{width:100%;min-width:0;color:var(--dsw-alias-label-primary)}.pk-home-launcher{display:flex;align-items:center;gap:8px;width:100%;min-width:44px;min-height:44px;padding:8px calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px));border:0;border-inline:var(--dsh-sidebar-paint-inset,3px) solid transparent;border-radius:var(--dsw-radius-md);background:transparent;background-clip:padding-box;color:inherit;text-align:left;font:inherit;cursor:pointer}.pk-home-footer[data-wide=false] .pk-home-launcher{width:44px;padding:0;justify-content:center;border:0}.pk-home-launcher[aria-current=page]{background-color:var(--dsw-alias-interactive-bg-hover)}
@media(hover:hover){.pk-home .pk-home-tool:hover{border-color:color-mix(in srgb,var(--tool-color) 32%,transparent);box-shadow:0 5px 16px #00000006}.pk-home .pk-home-link:hover,.pk-home .pk-home-button:hover{background:color-mix(in srgb,var(--pk-accent) 5%,var(--pk-bg))}.pk-home-launcher:hover{background-color:var(--dsw-alias-interactive-bg-hover)}}
@media(max-width:1000px) and (min-width:721px){.pk-home-tools{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.pk-home{padding:22px 16px}.pk-home-header{align-items:flex-start;margin-bottom:26px;gap:8px}.pk-home-title{gap:10px}.pk-home-title h1{font-size:24px}.pk-home-title p{font-size:12px;margin-top:4px}.pk-home-mark{width:42px;height:42px;border-radius:13px}.pk-home-header>.pk-home-button{font-size:11px;padding:8px 9px;flex:none}.pk-home-tools{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pk-home .pk-home-tool{display:flex;flex-direction:column;justify-content:flex-start;align-items:center;gap:11px;min-height:112px;padding:17px 5px 13px;text-align:center;border-radius:17px}.pk-home-tool-icon{width:46px;height:46px;border-radius:14px}.pk-home-tool-heading{font-size:13px;line-height:1.45;align-self:auto}.pk-home-tool>.pk-home-arrow,.pk-home-tool-description{display:none}.pk-home-section{margin-bottom:26px}.pk-home-section-head{margin-bottom:12px;gap:4px}.pk-home-section-head h2{font-size:13px}.pk-home-links{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pk-home .pk-home-link{padding:12px 10px;gap:8px;min-height:70px;border-radius:13px}.pk-home-link-icon{width:30px;height:32px}.pk-home-link-icon img{width:23px;height:23px}.pk-home-link-text strong{font-size:12px}.pk-home-link-text small{font-size:10px}.pk-home-link>.pk-home-arrow{display:none}.pk-home-actions .pk-home-button{font-size:11px;padding:8px 6px}}
@media(max-width:360px){.pk-home{padding:18px 12px}.pk-home-title p{max-width:140px}.pk-home-header>.pk-home-button{padding:8px}.pk-home .pk-home-tool{min-height:108px}.pk-home-links{grid-template-columns:repeat(2,minmax(0,1fr))}.pk-home-link-text small{display:none}}
@media(prefers-reduced-motion:no-preference){.pk-home-tool,.pk-home-link{transition:background-color .15s,border-color .15s,box-shadow .15s}}
`;
    function HomeIcon({size=20}){return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'M4 7h16v14H4z M9 7V3h6v4 M4 12h16 M10 12v3h4v-3'}));}
    function useLinks(){
      const [state,setState]=React.useState({loading:true,error:false,items:[]}),[version,setVersion]=React.useState(0);
      React.useEffect(()=>{
        const controller=new AbortController();setState(current=>({...current,loading:true,error:false}));
        fetch(new URL('api/shortcuts/bookmarks',document.baseURI),{credentials:'same-origin',cache:'no-store',signal:controller.signal})
          .then(async response=>{if(!response.ok)throw new Error();const value=await response.json();if(!Array.isArray(value.items))throw new Error();if(!controller.signal.aborted)setState({loading:false,error:false,items:value.items});})
          .catch(()=>{if(!controller.signal.aborted)setState({loading:false,error:true,items:[]});});
        return()=>controller.abort();
      },[version]);
      return {...state,reload:()=>setVersion(value=>value+1)};
    }
    function BookmarkIcon({item}){
      const [failed,setFailed]=React.useState(false);
      return item.iconDataUrl&&!failed?h('img',{src:item.iconDataUrl,alt:'',onError:()=>setFailed(true)}):h('span',{'aria-hidden':true},item.title?.slice(0,1)||'↗');
    }
    function Page({t,renderSlot,open,chat}){
      const links=useLinks();
      const tools={music:['音乐','搜索、下载喜欢的音乐','#e58c4b'],xiaoai:['小爱音箱','音乐与音箱，一起管理','#629a7c'],'outing-checklist':['出门清单','出发前，把重要的带齐','#c49641'],'file-manager':['文件','浏览、整理与传输文件','#6588d8'],'network-speed':['连接测速','看看当前连接有多快','#599fae'],'beijing-pass':['进京证','证件状态与办理提醒','#9c7ccc'],health:['健康','记录家人的健康点滴','#d17b83'],terminal:['终端','打开原生终端工作区','#7f8798'],'bill-manager':['记账单','把每一笔收支理清楚','#ae9070']};
      const renderCard=({id,title,description,icon,onClick})=>{const info=tools[id];if(info)[title,description]=info;return h('button',{type:'button',className:'pk-home-tool','data-tool':id,style:{'--tool-color':info?.[2]||'#7160df'},onClick,'aria-label':title+'，'+description,title:description},h('span',{className:'pk-home-tool-icon'},icon),h('span',{className:'pk-home-tool-heading'},title),h('span',{className:'pk-home-tool-description'},description),h('span',{className:'pk-home-arrow','aria-hidden':true},'›'));};
      return h('section',{className:'pk-home','aria-label':t('title')},h('style',null,css),h('div',{className:'pk-home-inner'},
        h('header',{className:'pk-home-header'},h('div',{className:'pk-home-title'},h('span',{className:'pk-home-mark'},h(HomeIcon,{size:25})),h('div',null,h('h1',null,t('title')),h('p',null,t('subtitle')))),h(KitNavActions,{chat,primary:'chat',compact:true})),
        h('section',{className:'pk-home-section','aria-label':t('tools')},h('div',{className:'pk-home-section-head'},h('h2',null,t('tools'))),h('div',{className:'pk-home-tools'},renderSlot('local.pocket-kit.home.tool',{renderCard}))),
        h('section',{className:'pk-home-section','aria-label':t('links')},h('div',{className:'pk-home-section-head'},h('h2',null,t('links')),h('div',{className:'pk-home-actions'},h('button',{type:'button',className:'pk-home-button',onClick:links.reload,disabled:links.loading},t('refresh')),h('button',{type:'button',className:'pk-home-button',onClick:()=>open('shortcuts')},t('details')))),
          links.loading?h('div',{className:'pk-home-status',role:'status'},t('loading')):links.error?h('div',{className:'pk-home-status',role:'alert'},h('p',null,t('error')),h('button',{type:'button',className:'pk-home-button',onClick:links.reload},t('retry'))):!links.items.length?h('div',{className:'pk-home-status'},t('empty')):h('div',{className:'pk-home-links'},links.items.map(item=>h('a',{key:item.id,className:'pk-home-link',href:item.url,target:'_blank',rel:'noopener noreferrer',title:item.title+' · '+t('newTab')},h('span',{className:'pk-home-link-icon'},h(BookmarkIcon,{item})),h('span',{className:'pk-home-link-text'},h('strong',null,item.title),item.description&&h('small',null,item.description)),h('span',{className:'pk-home-arrow','aria-hidden':true},'↗'))))
        )
      ));
    }
    // 底部入口仅依赖该Slot明确提供的wide和locale，不依赖页面状态hook。
    function Footer({wide,t,open}){
      return h('div',{className:'pk-home-footer','data-wide':String(wide)},h('style',null,css),h('button',{type:'button',className:'pk-home-launcher',title:t('title'),'aria-label':t('title'),onClick:open},h(HomeIcon),wide&&h('span',null,t('title'))));
    }
    return {inject:['slots','layout','locale'],apply(ctx){
      ctx.effect(()=>ctx.locale.register(NS,{zh:dictionaries.zh,en:dictionaries.zh}));
      ctx.effect(()=>kitTrackLastPanel(ctx));
      ctx.slots.inject('main',()=>{
        const dispose=ctx.slots.register({name:'main',key:PANEL,locale:NS,children:{'local.pocket-kit.home.tool':{kind:'list',scope:'root'}}},props=>h(Page,{...props,open:id=>ctx.layout.selectPanel(id),chat:()=>ctx.layout.selectPanel(null)}));
        const stopStartup=mountHomeStartup(ctx,PANEL);
        return()=>{stopStartup?.();dispose();};
      });
      ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'pocket-kit-home',order:10,locale:NS},props=>h(Footer,{...props,open:()=>kitOpenLast(ctx)})));
      ctx.effect(()=>()=>{if(ctx.layout.panelInfo.getSnapshot().activePanelId===PANEL)ctx.layout.selectPanel(null);});
    }};
  }
});
