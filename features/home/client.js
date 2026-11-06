window.__ModuleLoader__.load({
  id: '@local/pocket-kit-home',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'pocket-kit.home';
    const NS = 'pocket-kit-home';
    /* HOME_STARTUP */
    const dictionaries = {
      zh: {title:'首页',subtitle:'工具和常用网站，都在这里。',tools:'常用工具',links:'快捷链接',details:'详情与备注',chat:'返回对话',loading:'正在加载快捷链接…',error:'快捷链接暂时无法加载。工具入口仍可使用。',retry:'重新加载',empty:'还没有配置快捷链接。',newTab:'在新标签页打开',refresh:'刷新链接',open:'打开'},
      en: {title:'Home',subtitle:'Your tools and everyday links, in one place.',tools:'Tools',links:'Quick links',details:'Details and notes',chat:'Back to chat',loading:'Loading quick links…',error:'Quick links are unavailable. Your tools are still accessible.',retry:'Retry',empty:'No quick links configured yet.',newTab:'Opens in a new tab',refresh:'Refresh links',open:'Open'}
    };
    const css = `
.pk-home{height:100%;min-width:0;box-sizing:border-box;overflow:auto;padding:24px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:14px/1.5 system-ui,sans-serif}
.pk-home *{box-sizing:border-box}.pk-home-inner{max-width:1000px;margin:auto;padding-bottom:max(24px,env(safe-area-inset-bottom))}.pk-home-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 28px}.pk-home-title{display:flex;align-items:center;gap:12px;min-width:0}.pk-home-title h1{font-size:25px;letter-spacing:-.5px;margin:0}.pk-home-title p{margin:4px 0 0;font-size:13px;color:var(--dsw-alias-label-secondary)}.pk-home-mark{display:grid;place-items:center;width:44px;height:44px;flex:none;border-radius:13px;color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2)}
.pk-home-section{margin:0 0 28px}.pk-home-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}.pk-home-section-head h2{font-size:16px;margin:0}.pk-home-actions{display:flex;gap:8px;flex-wrap:wrap}.pk-home-button{min-height:44px;min-width:44px;padding:9px 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer}
.pk-home-tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.pk-home-tool{min-width:0;min-height:136px;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:9px;padding:18px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;cursor:pointer}.pk-home-tool-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}.pk-home-tool-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;font-weight:600;font-size:15px;overflow-wrap:anywhere}.pk-home-arrow{font-weight:400;color:var(--dsw-alias-label-tertiary)}.pk-home-tool-description{color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}
.pk-home-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.pk-home-link{min-width:0;display:flex;align-items:center;gap:10px;min-height:76px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;text-decoration:none;color:inherit;background:var(--dsw-alias-bg-layer-1)}.pk-home-link-icon{flex:none;width:36px;height:36px;display:grid;place-items:center;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-weight:600}.pk-home-link-icon img{width:26px;height:26px;object-fit:contain}.pk-home-link-text{flex:1;min-width:0;overflow-wrap:anywhere}.pk-home-link-text strong{font-size:14px;display:block}.pk-home-link-text small{display:block;color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:3px}.pk-home-status{padding:14px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-secondary)}.pk-home-status p{margin:0 0 10px}.pk-home :is(button,a):focus-visible,.pk-home-launcher:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.pk-home-footer{width:100%;min-width:0;color:var(--dsw-alias-label-primary)}.pk-home-launcher{display:flex;align-items:center;gap:8px;width:100%;min-width:44px;min-height:44px;padding:8px calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px));border:0;border-inline:var(--dsh-sidebar-paint-inset,3px) solid transparent;border-radius:var(--dsw-radius-md);background:transparent;background-clip:padding-box;color:inherit;text-align:left;font:inherit;cursor:pointer}.pk-home-footer[data-wide=false] .pk-home-launcher{width:44px;padding:0;justify-content:center;border:0}.pk-home-launcher[aria-current=page]{background-color:var(--dsw-alias-interactive-bg-hover)}
@media(hover:hover){.pk-home-tool:hover,.pk-home-link:hover,.pk-home-button:hover,.pk-home-launcher:hover{background-color:var(--dsw-alias-interactive-bg-hover)}}
@media(max-width:720px){.pk-home{padding:18px 14px}.pk-home-tools{grid-template-columns:repeat(2,minmax(0,1fr))}.pk-home-links{grid-template-columns:repeat(2,minmax(0,1fr))}.pk-home-header{margin-bottom:22px}.pk-home-tool{padding:14px;min-height:130px}.pk-home-link{padding:12px;gap:8px}.pk-home-link-icon{width:30px;height:30px}.pk-home-link-icon img{width:24px;height:24px}}
@media(max-width:360px){.pk-home-links{grid-template-columns:1fr}.pk-home-title h1{font-size:22px}.pk-home-tool{padding:12px}.pk-home-section-head{align-items:flex-start}}
@media(prefers-reduced-motion:no-preference){.pk-home-tool,.pk-home-link{transition:background-color .15s}}
`;
    function HomeIcon({size=20}){return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9'}));}
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
      const renderCard=({title,description,icon,onClick})=>h('button',{type:'button',className:'pk-home-tool',onClick},h('span',{className:'pk-home-tool-icon'},icon),h('span',{className:'pk-home-tool-heading'},title,h('span',{className:'pk-home-arrow','aria-hidden':true},'↗')),h('span',{className:'pk-home-tool-description'},description));
      return h('section',{className:'pk-home','aria-label':t('title')},h('style',null,css),h('div',{className:'pk-home-inner'},
        h('header',{className:'pk-home-header'},h('div',{className:'pk-home-title'},h('span',{className:'pk-home-mark'},h(HomeIcon,{size:25})),h('div',null,h('h1',null,t('title')),h('p',null,t('subtitle')))),h('button',{type:'button',className:'pk-home-button',onClick:chat},t('chat'))),
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
      ctx.effect(()=>ctx.locale.register(NS,dictionaries));
      ctx.slots.inject('main',()=>{
        const dispose=ctx.slots.register({name:'main',key:PANEL,locale:NS,children:{'local.pocket-kit.home.tool':{kind:'list',scope:'root'}}},props=>h(Page,{...props,open:id=>ctx.layout.selectPanel(id),chat:()=>ctx.layout.selectPanel(null)}));
        const stopStartup=mountHomeStartup(ctx,PANEL);
        return()=>{stopStartup?.();dispose();};
      });
      ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'pocket-kit-home',order:10,locale:NS},props=>h(Footer,{...props,open:()=>ctx.layout.selectPanel(PANEL)})));
      ctx.effect(()=>()=>{if(ctx.layout.panelInfo.getSnapshot().activePanelId===PANEL)ctx.layout.selectPanel(null);});
    }};
  }
});
