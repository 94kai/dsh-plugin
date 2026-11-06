// Optional lightweight integration test. Uses real React and a simulated DOM,
// not a browser layout engine. No server or production checklist data is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { createStore } from './store.js';
import { createHandler } from './index.js';
const tools=process.env.OUTING_TEST_TOOLS;
if(!tools)throw new Error('Set OUTING_TEST_TOOLS to a directory containing happy-dom, react and react-dom');
const require=createRequire(join(resolve(tools),'package.json'));
const {Window}=require('happy-dom');
const window=new Window({url:'https://outing.test/'});
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
if(!window.HTMLDialogElement.prototype.showModal)window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
const React=require('react');
const {act}=React;
const {createRoot}=require('react-dom/client');
const directory=await mkdtemp(join(tmpdir(),'outing-dom-'));
const store=createStore({dataFile:join(directory,'items.json')});
const handler=createHandler(store), pending=new Set();
let fail=false;
async function fetch(url,options={}){
  if(fail&&options.method==='POST')throw new Error('测试：连接中断');
  const promise=(async()=>{const response=await handler(new Request(url,options));const data=await response.json();return {ok:response.ok,status:response.status,json:async()=>data};})();pending.add(promise);
  try{return await promise;}finally{pending.delete(promise);}
}
let plugin;
window.__ModuleLoader__={load(mod){plugin=mod.factory(()=>React);}};
vm.runInNewContext(await readFile(new URL('./client.js',import.meta.url),'utf8'),{window,document:window.document,fetch,URL,AbortController});
const registrations={};
plugin.apply({effect:fn=>fn(),locale:{register:()=>()=>{}},slots:{inject:(name,fn)=>fn(),register:(meta,component)=>{registrations[meta.name]={meta,component};return()=>{};}},layout:{panelInfo:{getSnapshot:()=>({activePanelId:'local.outing-checklist'})},selectPanel:()=>{back=true;}}});
window.document.body.innerHTML='<div id="root"></div>';
const root=createRoot(window.document.getElementById('root'));
let back=false;
const query=selector=>window.document.querySelector(selector);
const buttons=()=>[...window.document.querySelectorAll('button')];
const button=text=>{const found=buttons().find(b=>b.textContent===text);assert.ok(found,`Missing button: ${text}`);return found;};
async function step(fn){await act(async()=>{fn();});await act(async()=>{for(let turn=0;turn<4;turn++){while(pending.size)await Promise.all([...pending]);await new Promise(setImmediate);}});}
async function input(node,value){await step(()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function select(node,value){await step(()=>{node.value=value;node.dispatchEvent(new window.Event('change',{bubbles:true}));});}
async function click(node){assert.ok(node);assert.equal(node.disabled,false,'button unexpectedly disabled');await step(()=>node.click());}
async function mount(){await step(()=>root.render(React.createElement(registrations.main.component)));}
try{
  await mount();
  assert.equal(registrations['sidebar.panellist'].meta.id,registrations.main.meta.key);
  await click(button('＋ 钥匙'));
  assert.equal((await store.read()).items[0].text,'钥匙');
  await input(query('input[aria-label="要带的物品"]'),'水杯');
  await select(query('select[aria-label="新物品归属人"]'),'妈妈');
  await step(()=>query('.oc-add').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal((await store.read()).items.length,2);
  await click(query('button[aria-label="标记已准备：钥匙"]'));
  assert.equal(query('[role="progressbar"]').getAttribute('aria-valuenow'),'50');
  await click(query('button[aria-label="编辑 水杯"]'));
  await input(query('dialog input'),'保温水杯');
  fail=true;
  await step(()=>query('dialog form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.ok(query('dialog [role="alert"]').textContent.includes('连接中断'));
  assert.equal(query('dialog input').value,'保温水杯');
  fail=false;
  await step(()=>query('dialog form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(query('dialog'),null);
  assert.equal((await store.read()).items[1].text,'保温水杯');
  assert.equal(query('input[type="search"]'),null,'Search is intentionally not part of the checklist');
  await click(query('button[aria-label="上移 保温水杯"]'));
  assert.equal((await store.read()).items[0].text,'保温水杯');
  // External concurrent update: stale UI must refresh instead of overwriting.
  const state=await store.read();
  await store.mutate({revision:state.revision,action:'add',text:'纸巾',person:'通用'});
  await click(query('button[aria-label="标记已准备：保温水杯"]'));
  assert.equal(window.document.querySelectorAll('.oc-row').length,3);
  assert.ok(query('[role="alert"]').textContent.includes('其他页面更新'));
  await step(()=>root.render(null));await mount();
  assert.equal(window.document.querySelectorAll('.oc-row').length,3);
  assert.equal(query('[role="progressbar"]').getAttribute('aria-valuenow'),'33');
  const mom=[...window.document.querySelectorAll('.oc-person')].find(b=>b.textContent.startsWith('妈妈'));
  await click(mom);assert.equal(window.document.querySelectorAll('.oc-row').length,1);
  await click(query('.oc-person'));
  await click(button('↻ 下一次出门'));
  await step(()=>query('dialog form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.ok((await store.read()).items.every(i=>!i.checked));
  await click(query('button[aria-label="移除 钥匙"]'));
  await step(()=>query('dialog form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal((await store.read()).items.length,2);
  await click(button('← 返回对话'));assert.equal(back,true);
  console.log('PASS: real React DOM integration: add, check, edit, modal failure/retry, no search box, reorder, stale-revision refresh, reopen persistence, member filter, reset, delete, return navigation.');
}finally{
  await act(()=>root.unmount());await window.happyDOM.abort();
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(directory.startsWith(join(tmpdir(),'outing-dom-')));
  await rm(directory,{recursive:true,force:true});
}
