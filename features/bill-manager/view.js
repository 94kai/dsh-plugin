function createBillManagerView(React,{h,useApi,useTask,button,field,empty,Status,downloadLink,Sheet}){
  const sources=[['wechat','微信','.xls,.xlsx'],['alipay','支付宝','.csv'],['cmb','招商银行','.pdf']];
  function RuleEditor({rules,setRules,filter=false}){
    return h('div',{className:'pk-u-form'},rules.map((rule,index)=>h('div',{key:index,className:'pk-bill-rule'},
      h('div',{className:'pk-u-row pk-u-between'},h('strong',null,'规则 '+(index+1)),button('移除',()=>setRules(rules.filter((_,i)=>i!==index)),false,'danger')),
      field(filter?'付款方式包含':'备注包含',rule.keyword,v=>setRules(rules.map((r,i)=>i===index?{...r,keyword:v}:r)),{required:true,maxLength:100}),
      !filter&&h('div',{className:'pk-bill-rule-categories'},field('一级分类',rule.primary,v=>setRules(rules.map((r,i)=>i===index?{...r,primary:v}:r)),{required:true,maxLength:100}),field('二级分类（可选）',rule.secondary,v=>setRules(rules.map((r,i)=>i===index?{...r,secondary:v}:r)),{maxLength:100})))),button('添加规则',()=>setRules([...rules,filter?{keyword:''}:{keyword:'',primary:'',secondary:''}])));
  }
  return function BillManagerView({home,chat}){
    const api=useApi('bill-manager'),task=useTask(),menuRef=React.useRef(null),moreRef=React.useRef(null),tableRef=React.useRef(null);
    const [data,setData]=React.useState(null),[tab,setTab]=React.useState('bills'),[query,setQuery]=React.useState(''),[editing,setEditing]=React.useState(null),[imports,setImports]=React.useState(false),[menu,setMenu]=React.useState(false);
    const load=async()=>setData(await api('/status'));React.useEffect(()=>{task.run(load,'');},[api]);
    React.useEffect(()=>{if(!menu)return;const outside=e=>{if(!menuRef.current?.contains(e.target))setMenu(false);},escape=e=>{if(e.key==='Escape'){setMenu(false);moreRef.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[menu]);
    React.useEffect(()=>{if(tableRef.current)tableRef.current.scrollTop=0;},[tab,query]);
    const previews=data?.exportPreview||{},rows=(previews[tab]?.rows||[]).filter(row=>!query||Object.values(row).some(v=>String(v).toLowerCase().includes(query.toLowerCase()))),columns=previews[tab]?.columns||[];
    function action(fn){setMenu(false);moreRef.current?.focus();fn();}
    function editRules(filter){action(()=>setEditing({filter,rules:structuredClone(filter?data.config.alipayFilterRules:data.config.categoryRules)}));}
    const upload=(role,file)=>{if(!file)return;if(file.size>20*1024*1024){task.run(()=>{throw new Error('账单文件不能超过 20 MB');});return;}if(!window.confirm('导入后将替换此来源的“当前账单”，旧迁移原文件保留。继续？'))return;task.run(async()=>{setData(await api('?'+new URLSearchParams({role,name:file.name}),'POST',file,{upload:true}));setTab(role==='wechat'?'bills':role);setQuery('');setImports(false);},'已导入，请核对后导出');};
    function close(){if(!task.busy&&window.confirm('放弃本次未保存的规则修改？'))setEditing(null);}
    return h('div',{className:'pk-records-page pk-compact-content'},
      h('fieldset',{className:'pk-u-fieldset pk-compact-main',disabled:task.busy},
        h('div',{className:'pk-compact-toolbar'},button('首页',home),button('会话',chat),
          h('select',{'aria-label':'账单来源',value:tab,onChange:e=>setTab(e.target.value)},Object.entries({bills:'微信',alipay:'支付宝',cmb:'招商银行'}).map(([id,label])=>h('option',{key:id,value:id},label+' · '+(previews[id]?.rows.length||0)))),
          data&&Object.values(previews).some(p=>p.rows?.length)?downloadLink('bill-manager',{},'导出全部'):h('button',{type:'button',disabled:true},'导出全部'),
          h('div',{className:'pk-compact-more',ref:menuRef},h('button',{ref:moreRef,type:'button','aria-expanded':menu,'aria-controls':'pk-compact-more-actions',onClick:()=>setMenu(!menu)},'更多'),menu&&h('div',{id:'pk-compact-more-actions',className:'pk-compact-menu'},
            button('导入账单',()=>action(()=>setImports(true))),button('分类规则',()=>editRules(false),!data),button('支付宝过滤',()=>editRules(true),!data),button('重新读取文件',()=>action(()=>task.run(async()=>setData(await api('/reload','POST')),'来源已刷新'))),h('p',null,'导出全部来源，不受搜索影响。')))),
        h('div',{className:'pk-compact-search'},h('input',{type:'search','aria-label':'搜索当前来源',placeholder:'搜索日期、分类、备注',value:query,onChange:e=>setQuery(e.target.value)}),h('span',{className:'pk-u-muted'},rows.length+' 条')),
        !editing&&!imports&&h(Status,{task}),
        !rows.length?empty(query?'没有匹配记录':'暂无账单，从“更多”导入'):h('div',{ref:tableRef,className:'pk-u-scroll pk-bill-table',tabIndex:0,'aria-label':'账单导出预览'},h('table',null,h('thead',null,h('tr',null,columns.map(c=>h('th',{key:c,scope:'col'},c)))),h('tbody',null,rows.map((row,i)=>h('tr',{key:i},columns.map(c=>h('td',{key:c},row[c]))))))),
        !data&&!task.busy&&button('重新加载',()=>task.run(load,''))),
      imports&&h(Sheet,{title:'导入账单',onClose:()=>setImports(false),busy:task.busy},h(Status,{task}),h('fieldset',{className:'pk-u-fieldset',disabled:task.busy},h('p',{className:'pk-u-muted'},'官方账单 · 本机处理 · 每个文件 ≤20 MB'),sources.map(([role,label,accept])=>h('div',{key:role,className:'pk-bill-import-row'},h('div',null,h('strong',null,label),h('small',null,accept.replaceAll(',',' / '))),h('label',{className:'pk-upload-button'},'选择文件',h('input',{type:'file',accept,'aria-label':'导入'+label+'账单',onChange:e=>{upload(role,e.target.files[0]);e.target.value='';}})))),data&&h('details',null,h('summary',null,'已读取文件（'+data.sources.length+'）'),data.sources.map((source,i)=>h('article',{key:i,className:'pk-bill-source'},h('strong',null,source.label+' · '+source.rows.length+' 条'),h('div',{className:'pk-u-wrap pk-u-muted'},source.name),source.error&&h('p',{className:'pk-u-error'},source.error)))))),
      editing&&h(Sheet,{title:editing.filter?'支付宝过滤规则':'分类规则',onClose:close,busy:task.busy},h(Status,{task}),h('fieldset',{className:'pk-u-fieldset',disabled:task.busy},h('form',{className:'pk-u-form',onSubmit:e=>{e.preventDefault();task.run(async()=>{setData(await api(editing.filter?'/alipay-filter-rules':'/category-rules','PUT',{rules:editing.rules}));setEditing(null);},'规则已保存');}},h(RuleEditor,{rules:editing.rules,setRules:rules=>setEditing({...editing,rules}),filter:editing.filter}),h('div',{className:'pk-u-sheet-footer'},h('button',{type:'submit',className:'pk-u-primary'},'保存规则'),button('取消',close))))));
  };
}
