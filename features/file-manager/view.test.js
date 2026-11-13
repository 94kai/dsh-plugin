import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./view.js',import.meta.url),'utf8');
const parseCSV=vm.runInNewContext(source+';parseCSV');
test('CSV parser handles BOM, quoted commas, escaped quotes and uneven rows',()=>{
  const parsed=parseCSV('\uFEFF姓名,备注,值\r\n小明,"第一行,补充","a""b"\r\n小红,普通');
  assert.deepEqual(Array.from(parsed.headers),['姓名','备注','值']);
  assert.deepEqual(Array.from(parsed.rows[0]),['小明','第一行,补充','a"b']);
  assert.deepEqual(Array.from(parsed.rows[1]),['小红','普通','']);
});
async function fixture(){
  const states=[],effects=[],calls=[],pending=[];let index=0,first=true,confirm=false;
  const h=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(c=>c!==null&&c!==undefined&&c!==false)});
  const React={createElement:h,Fragment:'fragment',useState(value){const key=index++;if(!(key in states))states[key]=value;return [states[key],value=>{states[key]=value;}];},useRef:()=>({current:null}),useEffect(fn){if(first)effects.push(fn);}};
  const rows=[{name:'z.txt',path:'z.txt',type:'file',size:20,modified:'2026-11-07'},{name:'文件夹',path:'文件夹',type:'folder',size:0,modified:'2026-11-07'},{name:'a.txt',path:'a.txt',type:'file',size:100,modified:'2026-11-07'}];
  const task={busy:false,error:'',notice:'',run(fn){const p=Promise.resolve().then(fn).catch(e=>{task.error=e.message;});pending.push(p);return p;}};
  const api=async(path,method='GET',body)=>{calls.push({path,method,body});const url=new URL(path,'https://test');return url.pathname==='/config'?{roots:[{id:'r',label:'示例',path:'/fixture'}]}:url.pathname==='/favorites'?{items:[]}:url.pathname==='/entries'?{path:url.searchParams.get('path')||'',entries:url.searchParams.get('path')?[]:rows}:url.pathname==='/text'?{content:'preview fixture'}:{};};
  const shared={t:v=>v,h,useApi:()=>api,useTask:()=>task,button:(label,onClick,disabled=false)=>h('button',{onClick,disabled},label),field:(label,value,set,options)=>h('input',{'aria-label':label,value,onChange:e=>set(e.target.value),...options}),select(){},check:()=>null,card:(title,...children)=>h('section',{},title,...children),empty:text=>h('div',{},text),Status:()=>null,downloadLink:(_feature,params,label)=>h('a',{params},label)};
  const factory=vm.runInNewContext(source+';createFileManagerView',{URL,URLSearchParams,structuredClone,window:{confirm:()=>confirm},document:{baseURI:'https://test/'}}),View=factory(React,shared);
  const render=()=>{index=0;const tree=View();first=false;return tree;};
  const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
  const nodes=tree=>[tree,...(tree.children||[]).filter(x=>typeof x==='object').flatMap(nodes)];
  render();for(const fn of effects)fn();await flush();
  return {render,flush,nodes,calls,setConfirm:v=>{confirm=v;},find:(tree,predicate)=>nodes(tree).find(predicate)};
}
const hasClass=(node,value)=>node.props.className?.split(' ').includes(value);
test('file explorer sorts folders first, searches locally and switches view',async()=>{
  const f=await fixture();let tree=f.render();let entries=f.nodes(tree).filter(n=>hasClass(n,'pk-f-entry'));assert.equal(entries.length,3);assert.match(JSON.stringify(entries[0]),/文件夹/);assert.match(JSON.stringify(entries[1]),/a.txt/);
  f.find(tree,n=>n.props['aria-label']==='搜索当前目录').props.onChange({target:{value:'missing'}});assert.equal(f.nodes(f.render()).filter(n=>hasClass(n,'pk-f-entry')).length,0);
  tree=f.render();f.find(tree,n=>n.props['aria-label']==='搜索当前目录').props.onChange({target:{value:''}});tree=f.render();f.find(tree,n=>n.props['aria-label']==='网格视图').props.onClick();assert.ok(f.nodes(f.render()).some(n=>hasClass(n,'pk-f-grid')));
  tree=f.render();f.find(tree,n=>n.props['aria-label']==='排序').props.onChange({target:{value:'size'}});entries=f.nodes(f.render()).filter(n=>hasClass(n,'pk-f-entry'));assert.match(JSON.stringify(entries[1]),/a.txt/);
});
test('folder navigation resets filtering and exposes parent action',async()=>{
  const f=await fixture();let tree=f.render();f.find(tree,n=>hasClass(n,'pk-f-open')).props.onClick();await f.flush();tree=f.render();assert.equal(f.nodes(tree).filter(n=>hasClass(n,'pk-f-entry')).length,0);const up=f.find(tree,n=>n.props['aria-label']==='上一级');assert.equal(up.props.disabled,false);up.props.onClick();await f.flush();assert.equal(f.nodes(f.render()).filter(n=>hasClass(n,'pk-f-entry')).length,3);
});
test('delete remains confirmed and sends explicit confirmation only after consent',async()=>{
  const f=await fixture();let tree=f.render();const remove=()=>f.find(tree,n=>n.type==='button'&&n.children[0]==='删除');remove().props.onClick();await f.flush();assert.ok(!f.calls.some(c=>c.method==='DELETE'));f.setConfirm(true);remove().props.onClick();await f.flush();assert.ok(f.calls.some(c=>c.method==='DELETE'&&c.body.confirmed===true&&c.path==='/entry'));
});
test('preview uses authenticated feature endpoint without executing file HTML',async()=>{
  const f=await fixture(),tree=f.render();const file=f.nodes(tree).filter(n=>hasClass(n,'pk-f-open'))[1];file.props.onClick();await f.flush();assert.ok(f.calls.some(c=>c.path.startsWith('/text?')));assert.match(JSON.stringify(f.render()),/preview fixture/);assert.ok(!source.includes('dangerouslySetInnerHTML'));
});
