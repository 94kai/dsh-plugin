window.__ModuleLoader__.load({
  id: '@local/outing-checklist',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PANEL = 'local.outing-checklist';
    const PEOPLE = ['通用', '爸爸', '妈妈', '赞赞'];
    const css = `
      .oc-page{--oc-accent:#247f68;--oc-tint:color-mix(in srgb,var(--oc-accent) 10%,transparent);height:100%;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:1.6;padding:32px 40px;}
      .oc-page *{box-sizing:border-box}.oc-wrap{max-width:1000px;margin:auto;padding-bottom:40px}.oc-page button,.oc-page input,.oc-page select{font:inherit;color:inherit}.oc-page button{cursor:pointer}.oc-page button:disabled{opacity:.45;cursor:not-allowed}.oc-page :is(button,input,select):focus-visible{outline:2px solid var(--oc-accent);outline-offset:3px}.oc-page button,.oc-page select{min-height:36px}.oc-top,.oc-flex{display:flex;align-items:center;gap:12px}.oc-top{justify-content:space-between;margin-bottom:34px;flex-wrap:wrap}.oc-eyebrow{font-size:11px;letter-spacing:.16em;color:var(--dsw-alias-label-tertiary)}.oc-title{font-size:30px;font-weight:650;letter-spacing:-1px;margin:4px 0}.oc-muted{color:var(--dsw-alias-label-tertiary);font-size:13px}.oc-btn{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:7px 13px;background:transparent}.oc-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.oc-primary{background:var(--oc-accent);border-color:var(--oc-accent);color:white!important}.oc-primary:hover{filter:brightness(1.08);background:var(--oc-accent)}
      .oc-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;background:var(--oc-tint);border:1px solid color-mix(in srgb,var(--oc-accent) 18%,transparent);border-radius:20px;padding:26px 30px;margin-bottom:24px}.oc-hero h2{font-size:21px;margin:0 0 5px}.oc-ring{width:88px;height:88px;flex:none;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--oc-accent) var(--progress),color-mix(in srgb,var(--oc-accent) 14%,transparent) 0)}.oc-ring-inner{width:72px;height:72px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--dsw-alias-bg-base,#fff)}.oc-ring strong{font-size:22px;line-height:1.2}.oc-ring small{font-size:10px;color:var(--dsw-alias-label-tertiary)}
      .oc-persons{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:22px}.oc-person{border:1px solid var(--dsw-alias-border-l2);background:transparent;border-radius:99px;padding:7px 16px;display:flex;gap:10px;align-items:center}.oc-person[aria-pressed=true]{background:var(--oc-tint);border-color:var(--oc-accent);color:var(--oc-accent);font-weight:600}.oc-person small{opacity:.65}.oc-tools{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin:20px 0 12px}.oc-tools .oc-flex{flex-wrap:wrap}.oc-input,.oc-select{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 11px;background:var(--dsw-alias-bg-base);min-width:0}.oc-toggle{display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer}.oc-toggle input{accent-color:var(--oc-accent)}.oc-add{display:flex;gap:8px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);margin-bottom:10px}.oc-add input{flex:1;width:80px}.oc-list{list-style:none;padding:0;margin:0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}.oc-row{display:flex;gap:12px;align-items:center;padding:14px 16px;min-height:66px;background:var(--dsw-alias-bg-layer-1)}.oc-row+.oc-row{border-top:1px solid var(--dsw-alias-border-l2)}.oc-check{display:flex;flex:1;align-items:center;gap:12px;border:0;background:transparent;text-align:left;padding:0;min-width:0}.oc-box{width:23px;height:23px;flex:none;border:1.5px solid var(--dsw-alias-border-l2);border-radius:7px;display:grid;place-items:center}.oc-checked .oc-box{background:var(--oc-accent);border-color:var(--oc-accent);color:white}.oc-item-text{overflow-wrap:anywhere;font-size:15px}.oc-checked .oc-item-text{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}.oc-tag{font-size:11px;padding:3px 9px;border-radius:6px;background:var(--oc-tint);color:var(--oc-accent);white-space:nowrap}.oc-row-actions{display:flex;gap:2px}.oc-icon-btn{border:0;border-radius:6px;background:transparent;padding:4px 8px;color:var(--dsw-alias-label-tertiary)!important}.oc-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}.oc-empty{text-align:center;padding:42px 20px;border:1px dashed var(--dsw-alias-border-l2);border-radius:14px}.oc-empty h3{font-size:17px;margin:12px 0 5px}.oc-foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:15px;font-size:12px;color:var(--dsw-alias-label-tertiary)}.oc-alert{padding:12px 16px;border-radius:9px;border:1px solid #bb634e;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}.oc-notice{min-height:24px;margin-top:8px;color:var(--oc-accent);font-size:12px}.oc-dialog{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2);border-radius:18px;padding:26px;width:min(440px,calc(100vw - 32px));max-height:85vh;overflow:auto;box-shadow:0 20px 80px #0003}.oc-dialog::backdrop{background:#0006}.oc-dialog h2{margin:0 0 12px;font-size:20px}.oc-dialog label{display:flex;flex-direction:column;gap:5px;margin:14px 0}.oc-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.oc-danger{color:#bd5546!important}.oc-suggest{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:18px}
      @media(max-width:640px){.oc-page{padding:22px 16px}.oc-top{margin-bottom:22px}.oc-title{font-size:25px}.oc-hero{padding:20px;gap:12px}.oc-hero h2{font-size:18px}.oc-ring{width:72px;height:72px}.oc-ring-inner{width:58px;height:58px}.oc-person{padding:6px 12px}.oc-add{flex-wrap:wrap;padding:10px}.oc-add input{flex-basis:calc(100% - 95px)}.oc-add .oc-primary{width:100%}.oc-row{padding:12px 10px;gap:8px}.oc-row-actions{gap:0}.oc-icon-btn{padding:4px 6px}.oc-tools>.oc-flex{width:100%}}@media(prefers-reduced-motion:no-preference){.oc-box{transition:background .15s}.oc-btn{transition:background .15s}}
      @media(max-width:640px),(pointer:coarse){
        .oc-page button,.oc-page select,.oc-dialog button,.oc-dialog select{min-height:44px}
        .oc-page input:not([type=checkbox]),.oc-page select,.oc-dialog input,.oc-dialog select{font-size:16px;min-height:44px}
        .oc-icon-btn{min-width:44px}.oc-row{flex-wrap:wrap}.oc-row-actions{flex-basis:100%;justify-content:flex-end;gap:6px}
        .oc-check{min-height:44px}.oc-page{padding-bottom:max(24px,env(safe-area-inset-bottom))}
        .oc-dialog{max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto}
        .oc-dialog-actions{flex-wrap:wrap}.oc-toggle{min-height:44px}
      }
      .oc-hero>div:first-child,.oc-top>div{min-width:0;overflow-wrap:anywhere}
    `;
    function Icon({ size = 20 }) {
      return h('svg', { width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true },h('rect',{x:5,y:5,width:14,height:16,rx:3}),h('path',{d:'M9 5V3h6v2M9 11l2 2 4-4M9 17h6'}));
    }
    async function request(body, signal) {
      const response = await fetch(new URL('api/outing-checklist', document.baseURI), { method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal,headers:body?{'Content-Type':'application/json','X-Outing-Checklist':'1'}:undefined,body:body?JSON.stringify(body):undefined });
      const data = await response.json();
      if (!response.ok) {
        const messages={revision_conflict:'清单已在其他页面更新，请重新加载后再操作。',storage_error:'清单存储暂不可用，请稍后重试。',item_not_found:'这件物品已被移除，请重新加载清单。',invalid_request:'物品内容或操作无效，请检查后重试。',csrf_rejected:'请求验证失败，请刷新页面后重试。'};
        const error=new Error(messages[data.error] || (response.status===401?'登录已过期，请刷新页面重新登录。':'保存失败，请检查连接后重试。')); error.status=response.status;throw error;
      }
      return data;
    }
    function Dialog({ mode, busy, error, onClose, onSubmit }) {
      const ref=React.useRef(null);
      const [text,setText]=React.useState(mode.item?.text || '');
      const [person,setPerson]=React.useState(mode.item?.person || '通用');
      React.useEffect(()=>{ref.current.showModal();},[]);
      const edit=mode.type==='edit';
      return h('dialog',{ref,className:'oc-dialog','aria-label':edit?'编辑物品':mode.type==='delete'?'移除物品':'重置准备状态',onCancel:event=>{event.preventDefault();if(!busy)onClose();},onClose},
        h('form',{onSubmit:event=>{event.preventDefault();onSubmit(edit?{action:'update',id:mode.item.id,text:text.trim(),person}:mode.type==='delete'?{action:'delete',id:mode.item.id}:{action:'reset'});}},
          h('h2',null,edit?'编辑物品':mode.type==='delete'?'移除这件物品？':'开始下一次出门？'),
          edit?h(React.Fragment,null,h('label',null,'物品名称',h('input',{className:'oc-input',autoFocus:true,required:true,maxLength:200,value:text,onChange:e=>setText(e.target.value)})),h('label',null,'为谁准备',h('select',{className:'oc-select',value:person,onChange:e=>setPerson(e.target.value)},PEOPLE.map(p=>h('option',{key:p},p))))):h('p',{className:'oc-muted'},mode.type==='delete'?`“${mode.item.text}”将从清单中删除。`:'保留所有物品和顺序，将所有成员的物品恢复为「待准备」。'),
          error?h('p',{role:'alert',className:'oc-danger'},error):null,
          h('div',{className:'oc-dialog-actions'},h('button',{type:'button',className:'oc-btn',disabled:busy,onClick:onClose},'取消'),h('button',{type:'submit',className:'oc-btn oc-primary',disabled:busy || (edit&&!text.trim())},busy?'保存中…':edit?'保存修改':mode.type==='delete'?'确认移除':'重置准备状态'))));
    }
    function Page({ back }) {
      const [data,setData]=React.useState(null), [error,setError]=React.useState(''), [busy,setBusy]=React.useState(false);
      const [person,setPerson]=React.useState('全部'), [pendingOnly,setPendingOnly]=React.useState(false), [sort,setSort]=React.useState('custom');
      const [text,setText]=React.useState(''), [addPerson,setAddPerson]=React.useState('通用'), [mode,setMode]=React.useState(null), [notice,setNotice]=React.useState('');
      const lock=React.useRef(false), active=React.useRef(false), input=React.useRef(null), fetchSerial=React.useRef(0);
      async function load(signal) {
        const serial=++fetchSerial.current;
        try {const next=await request(null,signal);if(active.current&&serial===fetchSerial.current){setData(next);setError('');}}
        catch(e){if(active.current&&e.name!=='AbortError'&&serial===fetchSerial.current)setError('无法读取清单，请检查连接后重试。');}
      }
      React.useEffect(()=>{active.current=true;const controller=new AbortController();load(controller.signal);const focus=()=>{if(!lock.current)load(controller.signal);};window.addEventListener('focus',focus);return()=>{active.current=false;controller.abort();window.removeEventListener('focus',focus);};},[]);
      async function mutate(action) {
        if(lock.current||!data)return false;
        lock.current=true;++fetchSerial.current;setBusy(true);setError('');setNotice('');
        try {const next=await request({...action,revision:data.revision});if(active.current){setData(next);setNotice('已保存');}return true;}
        catch(e){if(active.current){if(e.status===409)await load();setError(e.message);}return false;}
        finally{lock.current=false;if(active.current)setBusy(false);}
      }
      const items=data?.items || [], done=items.filter(i=>i.checked).length, percent=items.length?Math.round(done/items.length*100):0;
      const scoped=items.filter(i=>person==='全部'||i.person===person);
      const shown=scoped.filter(i=>!pendingOnly||!i.checked);
      if(sort==='pinyin')shown.sort((a,b)=>a.text.localeCompare(b.text,'zh-CN-u-co-pinyin'));
      if(sort==='pending')shown.sort((a,b)=>Number(a.checked)-Number(b.checked));
      function choosePerson(p){setPerson(p);setAddPerson(p==='全部'?'通用':p);}
      return h('section',{className:'oc-page','aria-label':'出门清单'},h('style',null,css),h('div',{className:'oc-wrap'},
        h('header',{className:'oc-top'},h('div',null,h('div',{className:'oc-eyebrow'},'READY TO GO'),h('h1',{className:'oc-title'},'出门清单'),h('div',{className:'oc-muted'},'少一点惦记，从容一点出发。')),h('button',{className:'oc-btn',onClick:back},'← 返回工具箱')),
        h('div',{className:'oc-hero'},h('div',null,h('h2',null,!data?'正在读取清单…':!items.length?'下一次出发，从这里准备':done===items.length?'都准备好了，安心出发！':`还有 ${items.length-done} 件，慢慢准备`),h('div',{className:'oc-muted'},items.length?`全部成员 · 已准备 ${done} / ${items.length} 件`:'把出门要带的东西记下来，下次也能继续用。')),h('div',{className:'oc-ring',style:{'--progress':`${percent}%`},role:'progressbar','aria-label':'全部物品准备进度','aria-valuenow':percent,'aria-valuemin':0,'aria-valuemax':100},h('div',{className:'oc-ring-inner'},h('strong',null,`${percent}%`),h('small',null,'准备完成')))),
        error?h('div',{className:'oc-alert',role:'alert'},h('span',null,error),h('button',{className:'oc-btn',disabled:busy,onClick:()=>load()},'重新加载')):null,
        h('nav',{className:'oc-persons','aria-label':'按成员筛选'},['全部',...PEOPLE].map(p=>h('button',{key:p,className:'oc-person','aria-pressed':person===p,onClick:()=>choosePerson(p)},p,h('small',null,items.filter(i=>p==='全部'||i.person===p).length)))),
        h('form',{className:'oc-add',onSubmit:async e=>{e.preventDefault();if(text.trim()&&await mutate({action:'add',text:text.trim(),person:addPerson})){setText('');input.current?.focus();}}},h('input',{ref:input,className:'oc-input','aria-label':'要带的物品',placeholder:'添加一件要带的物品…',maxLength:200,required:true,value:text,disabled:busy||!data,onChange:e=>setText(e.target.value)}),h('select',{className:'oc-select','aria-label':'新物品归属人',value:addPerson,disabled:busy||!data,onChange:e=>setAddPerson(e.target.value)},PEOPLE.map(p=>h('option',{key:p},p))),h('button',{className:'oc-btn oc-primary',type:'submit',disabled:busy||!data||!text.trim()},'＋ 添加物品')),
        h('div',{className:'oc-tools'},h('div',{className:'oc-flex'},h('label',{className:'oc-toggle'},h('input',{type:'checkbox',checked:pendingOnly,onChange:e=>setPendingOnly(e.target.checked)}),'只看待准备')),h('select',{className:'oc-select','aria-label':'清单排序',value:sort,onChange:e=>setSort(e.target.value)},h('option',{value:'custom'},'自定义顺序'),h('option',{value:'pending'},'待准备优先'),h('option',{value:'pinyin'},'按拼音排序'))),
        !data?h('div',{className:'oc-empty',role:'status'},error?'清单暂不可用':'正在加载你的物品…'):shown.length?h('ul',{className:'oc-list','aria-label':`${person}的物品`},shown.map(item=>h('li',{key:item.id,className:`oc-row${item.checked?' oc-checked':''}`},h('button',{className:'oc-check','aria-pressed':item.checked,'aria-label':`${item.checked?'标记待准备':'标记已准备'}：${item.text}`,disabled:busy,onClick:()=>mutate({action:'update',id:item.id,checked:!item.checked})},h('span',{className:'oc-box','aria-hidden':true},item.checked?'✓':''),h('span',{className:'oc-item-text'},item.text)),h('span',{className:'oc-tag'},item.person),h('div',{className:'oc-row-actions'},sort==='custom'&&person==='全部'&&!pendingOnly?h(React.Fragment,null,h('button',{className:'oc-icon-btn',disabled:busy||items[0].id===item.id,title:'上移','aria-label':`上移 ${item.text}`,onClick:()=>mutate({action:'move',id:item.id,direction:'up'})},'↑'),h('button',{className:'oc-icon-btn',disabled:busy||items[items.length-1].id===item.id,title:'下移','aria-label':`下移 ${item.text}`,onClick:()=>mutate({action:'move',id:item.id,direction:'down'})},'↓')):null,h('button',{className:'oc-icon-btn',disabled:busy,title:'编辑物品','aria-label':`编辑 ${item.text}`,onClick:()=>setMode({type:'edit',item})},'编辑'),h('button',{className:'oc-icon-btn',disabled:busy,title:'移除物品','aria-label':`移除 ${item.text}`,onClick:()=>setMode({type:'delete',item})},'×'))))):h('div',{className:'oc-empty'},h(Icon,{size:32}),h('h3',null,!items.length?'轻装出发，也别落下重要的':pendingOnly&&scoped.length?'这个范围的物品都准备好了':'这里暂时没有物品'),h('div',{className:'oc-muted'},!items.length?'先添加钥匙、手机、证件，或者任何你在意的东西。':'试试切换成员，或添加新物品。'),!items.length?h('div',{className:'oc-suggest'},['钥匙','手机','身份证','充电器'].map(name=>h('button',{key:name,className:'oc-btn',disabled:busy,onClick:()=>mutate({action:'add',text:name,person:addPerson})},`＋ ${name}`))):null),
        h('footer',{className:'oc-foot'},h('span',null,`当前显示 ${shown.length} 件 · ${person==='全部'?'全部成员':person}已准备 ${scoped.filter(i=>i.checked).length} / ${scoped.length}`),h('button',{className:'oc-btn',disabled:busy||!done,onClick:()=>setMode({type:'reset'})},'↻ 下一次出门')),
        h('div',{className:'oc-notice',role:'status','aria-live':'polite'},busy?'正在保存…':notice),
        h('div',{className:'oc-muted'},'自动保存到服务端 · 在全部成员、自定义顺序下可用 ↑ ↓ 调整物品顺序'),
        mode?h(Dialog,{key:mode.type+(mode.item?.id||''),mode,busy,error,onClose:()=>setMode(null),onSubmit:async action=>{if(await mutate(action)){setMode(null);}}}):null));
    }
    return { inject:['slots','locale','layout'], apply(ctx) {
      ctx.effect(()=>ctx.locale.register(PANEL,{zh:{title:'出门清单'},en:{title:'Outing checklist'}}));
      ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:PANEL,locale:PANEL},()=>h(Page,{back:()=>ctx.layout.selectPanel('pocket-kit.home')})));
      ctx.slots.inject('local.pocket-kit.home.tool',()=>ctx.slots.register({name:'local.pocket-kit.home.tool',id:PANEL,order:30,locale:PANEL,label:()=> '出门清单'},({renderCard})=>renderCard({id:'outing-checklist',title:'出门清单',description:'整理随身物品，出发前从容检查',icon:h(Icon),onClick:()=>ctx.layout.selectPanel(PANEL)})));
      ctx.effect(()=>()=>{if(ctx.layout.panelInfo.getSnapshot().activePanelId===PANEL)ctx.layout.selectPanel(null);});
    }};
  },
});
