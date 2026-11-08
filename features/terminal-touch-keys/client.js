window.__ModuleLoader__.load({
  id: '@local/pocket-kit-terminal-touch-keys',
  factory(require) {
    const React = require('react'), h = React.createElement;
    /* KIT_CHROME */
    /* TERMINAL_VIEWPORT */
    /* TERMINAL_NAVIGATION */
    const ns = 'local-terminal-touch-keys';
    const css = `.ttk-positioner{flex:none;min-width:0;box-sizing:border-box}.ttk-bar{box-sizing:border-box;display:flex;flex:none;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 4px max(4px,env(safe-area-inset-bottom));border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}.ttk-bar button{box-sizing:border-box;min-width:44px;min-height:36px;height:36px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:inherit;font:14px/1.2 system-ui;touch-action:none;user-select:none;-webkit-user-select:none;cursor:pointer}.ttk-bar button:disabled{opacity:.4;cursor:not-allowed}.ttk-bar button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.ttk-bar button:active{background:var(--dsw-alias-bg-layer-2)}.ttk-bar .ttk-pad{display:flex;align-items:center;justify-content:center;min-width:44px;width:44px;height:36px;padding:4px 8px}.ttk-pad svg{pointer-events:none}.ttk-interrupt{margin-inline-start:auto}@media(max-width:360px){.ttk-bar{gap:4px}.ttk-bar button{padding:4px 8px}.ttk-interrupt{margin-inline-start:0}}`;
    function tapKey(dx,dy){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return null;return Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');}
    function Toolbar({enabled, sendKey, t}) {
      const drag=React.useRef(null),positioner=React.useRef(null);
      React.useLayoutEffect(()=>followKeyboard(positioner.current,window),[]);
      React.useEffect(()=>{if(!enabled)drag.current=null;},[enabled]);
      React.useEffect(()=>()=>{drag.current=null;},[]);
      const send=key=>{if(enabled)sendKey(key);};
      function begin(event,key){
        if(!enabled||!event.isPrimary||(event.pointerType==='mouse'&&event.button!==0))return;
        event.preventDefault();
        const rect=event.currentTarget.getBoundingClientRect();
        key=tapKey(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2);
        drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,key,moved:false};
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      function move(event){
        const d=drag.current;if(!enabled||!d||d.id!==event.pointerId)return;
        const dx=event.clientX-d.x,dy=event.clientY-d.y,distance=Math.max(Math.abs(dx),Math.abs(dy));
        if(distance<22)return;
        event.preventDefault();d.moved=true;
        const key=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');
        for(let i=0;i<Math.min(4,Math.floor(distance/22));i++)send(key);
        d.x=event.clientX;d.y=event.clientY;
      }
      function finish(event,cancel=false){const d=drag.current;if(!d||d.id!==event.pointerId)return;drag.current=null;if(!cancel&&!d.moved&&d.key)send(d.key);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
      const directionPad=h('button',{type:'button',className:'ttk-pad',disabled:!enabled,'aria-label':t('pad'),onPointerDown:e=>begin(e,null),onPointerMove:move,onPointerUp:e=>finish(e),onPointerCancel:e=>finish(e,true),onLostPointerCapture:()=>{drag.current=null;},onContextMenu:e=>e.preventDefault(),onKeyDown:e=>{const key={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.key];if(key){e.preventDefault();e.stopPropagation();send(key);}}},h('svg',{width:24,height:24,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3'})));
      const simple=(key,label,className)=>h('button',{type:'button',className,disabled:!enabled,'aria-label':t(key),onPointerDown:e=>e.preventDefault(),onClick:()=>send(key)},label);
      return h('div',{className:'ttk-positioner',ref:positioner},h('div',{className:'ttk-bar',role:'group','aria-label':t('title')},h('style',null,css),simple('escape','Esc'),simple('tab','Tab'),directionPad,simple('vimQuit',':q'),simple('interrupt','Ctrl+C','ttk-interrupt')));
    }
    const PANEL='pocket-kit.native-terminal';
    function TerminalIcon({size=18}){return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'m4 5 6 7-6 7 M12 19h8'}));}
    function NativeEntryPage({t,open,back,home,getError}){
      const [error,setError]=React.useState(getError());
      const launch=React.useCallback(()=>{open();},[open]);
      React.useEffect(()=>{if(!getError())launch();},[launch,getError]);
      return h('section',{style:{height:'100%',boxSizing:'border-box',padding:20,color:'var(--dsw-alias-label-primary)',background:'var(--dsw-alias-bg-base)'}},
        h('header',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:16}},h('h1',{style:{fontSize:18,margin:0}},t('terminal')),h(KitNavActions,{chat:back,home})),
        h('p',{role:error?'alert':'status'},error||t('opening')),
        h('button',{type:'button',onClick:launch,style:{minHeight:44,padding:'8px 14px',font:'inherit',color:'inherit',background:'var(--dsw-alias-bg-layer-1)',border:'1px solid var(--dsw-alias-border-l2)',borderRadius:8}},t('retry'))
      );
    }
    return {inject:['slots','locale','sidebarRight','layout'],apply(ctx){
      ctx.effect(()=>ctx.locale.register(ns,{
        zh:{toolDescription:'打开 DSH 原生终端',dedicatedHome:'独立终端 · 默认 Home 目录',opening:'正在打开终端…',back:'返回对话',retry:'重试',terminal:'终端',openTerminal:'打开 DSH 终端',selectSession:'请先选择一个会话或返回对话，再打开终端。',openFailed:'终端暂时无法打开，请刷新后重试。',pad:'方向按钮：上下左右滑动，点按边缘单步移动，中心不发送',title:'终端辅助键盘',left:'向左',up:'向上',down:'向下',right:'向右',escape:'Esc：退出或取消',tab:'Tab：补全或缩进',vimQuit:'Vim 退出：发送 Esc、:q 和回车；未保存时不强退，仅在 Vim 中使用',interrupt:'Ctrl+C：中断当前程序',drag:'可向任意方向拖动',hint:'滑动控制方向 · 边缘点按单步 · 中心不发送',unavailable:'终端未连接或不可输入，请先取得控制权'},
        en:{toolDescription:'Open the DSH native terminal',dedicatedHome:'Dedicated terminal · Home directory',opening:'Opening terminal…',back:'Back to chat',retry:'Retry',terminal:'Terminal',openTerminal:'Open DSH terminal',selectSession:'Select a session or return to chat before opening a terminal.',openFailed:'Could not open terminal. Refresh and retry.',pad:'Direction pad: swipe or tap an edge; center does not send a key',title:'Terminal touch keys',left:'Left',up:'Up',down:'Down',right:'Right',escape:'Escape',interrupt:'Ctrl+C: interrupt current program',drag:'Drag in any direction',hint:'Swipe to move · Tap an edge for one step · Center is inactive',unavailable:'Terminal disconnected or read-only; take control first'}
      }));
      const t=ctx.locale.bind(ns);let error='';const lifetime=new AbortController();
      ctx.effect(()=>()=>lifetime.abort());
      const getError=()=>error;
      const openNativeTerminal=async()=>{
        error='';ctx.layout.selectPanel(null);
        const navigation=ctx.layout.beginNavigation();
        const signal=AbortSignal.any([navigation,lifetime.signal]);
        try{
          const result=await revealNativeTerminal(ctx,window,signal);
          if(result==='no-session'&&!signal.aborted){error=t('selectSession');ctx.layout.selectPanel(PANEL);}
        }catch{if(!signal.aborted){error=t('openFailed');ctx.layout.selectPanel(PANEL);}}
      };
      ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:PANEL,locale:ns},props=>h(NativeEntryPage,{...props,open:openNativeTerminal,getError,back:()=>ctx.layout.selectPanel(null),home:()=>ctx.layout.selectPanel('pocket-kit.home')})));
      ctx.slots.inject('local.pocket-kit.home.tool',()=>ctx.slots.register({name:'local.pocket-kit.home.tool',id:PANEL,locale:ns,order:60},({renderCard,t})=>renderCard({id:'terminal',title:t('terminal'),description:t('toolDescription'),icon:h(TerminalIcon),onClick:()=>ctx.layout.selectPanel(PANEL)})));
      ctx.slots.inject('local.terminal.touch.keys',()=>ctx.slots.register({name:'local.terminal.touch.keys',id:'terminal-touch-keys',locale:ns,order:0},Toolbar));
    }};
  }
});
