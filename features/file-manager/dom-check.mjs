// Optional real React integration with simulated DOM, no layout/visual assertions.
// FILE_DOM_TOOLS must contain happy-dom, react and react-dom.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import vm from 'node:vm';
const toolRoot=join(homedir(),'tools','pocket-kit-preview');
const tools=process.env.FILE_DOM_TOOLS||(existsSync(join(toolRoot,'dom-tools','node_modules','happy-dom'))?join(toolRoot,'dom-tools'):'/tmp/dsh-outing-dom-test');
const require=createRequire(join(resolve(tools),'package.json'));
const {Window}=require('happy-dom'),window=new Window({url:'https://files.test/'});
Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
process.env.NODE_ENV='development';
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
const views=Object.fromEntries(await Promise.all(['health','file-manager','beijing-pass','bill-manager'].map(async name=>[name,await readFile(new URL('../'+name+'/view.js',import.meta.url),'utf8')])));
let source=await readFile(new URL('../utilities/client.js',import.meta.url),'utf8');
for(const name of ['health','file-manager','beijing-pass','bill-manager'])source=source.replace(`/* ${name.toUpperCase().replaceAll('-','_')}_VIEW */`,()=>views[name]);
let fail=false,consent=false,View;const calls=[];
window.confirm=()=>consent;
async function fetch(_url,options){const input=JSON.parse(options.body);calls.push(input);const url=new URL(input.path,'https://internal');if(fail&&url.pathname==='/entries')return {ok:false,json:async()=>({error:'测试连接失败，请重试'})};return {ok:true,json:async()=>url.pathname==='/config'?{roots:[{id:'r',label:'示例目录',path:'/fixture'}]}:url.pathname==='/favorites'?{items:[]}:url.pathname==='/entries'?{path:url.searchParams.get('path')||'',entries:url.searchParams.get('path')?[]:[{name:'照片',path:'照片',type:'folder',size:0,modified:'2026-11-07'},{name:'说明.txt',path:'说明.txt',type:'file',size:100,modified:'2026-11-07'}]}:url.pathname==='/text'?{content:'隔离示例文本'}:{}};}
let plugin;window.__ModuleLoader__={load:mod=>{plugin=mod.factory(()=>React);}};
vm.runInNewContext(source,{window,document:window.document,fetch,URL,URLSearchParams,AbortController,structuredClone});
plugin.apply({effect:fn=>fn(),locale:{bind:()=>value=>value,register:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(meta,component)=>{if(meta.key==='pocket-kit.file-manager')View=component;return()=>{};}},layout:{selectPanel(){},panelInfo:{getSnapshot:()=>({})}}});
window.document.body.innerHTML='<div id="root"></div>';const root=createRoot(window.document.getElementById('root'));
const query=s=>window.document.querySelector(s),all=s=>[...window.document.querySelectorAll(s)];
async function step(fn){await act(async()=>{fn();for(let i=0;i<6;i++)await new Promise(setImmediate);});}
const click=node=>step(()=>{assert.ok(node);node.click();});
const named=name=>all('button').find(b=>b.textContent===name||b.getAttribute('aria-label')===name);
try{
  await step(()=>root.render(React.createElement(View,{t:value=>value})));assert.equal(all('.pk-f-entry').length,2);
  await click(named('网格视图'));assert.ok(query('.pk-f-grid'));await click(named('列表视图'));assert.equal(query('.pk-f-grid'),null);
  await click(query('.pk-f-open'));assert.equal(all('.pk-f-entry').length,0);assert.ok(window.document.body.textContent.includes('这个文件夹是空的'));
  await click(named('上一级'));assert.equal(all('.pk-f-entry').length,2);
  await click(all('.pk-f-open')[1]);assert.equal(query('.pk-f-preview pre').textContent,'隔离示例文本');await click(named('关闭预览'));
  await click(named('新建文件夹'));assert.ok(query('.pk-f-create'));await click(named('取消'));assert.equal(query('.pk-f-create'),null);
  await click(query('.pk-f-menu summary'));await click(named('删除'));assert.ok(!calls.some(c=>c.method==='DELETE'));consent=true;await click(named('删除'));assert.ok(calls.some(c=>c.method==='DELETE'&&c.body.confirmed));
  fail=true;await click(named('刷新'));assert.match(query('[role=alert]').textContent,/测试连接失败/);fail=false;await click(named('重试'));assert.equal(query('[role=alert]'),null);
  await click(named('目录设置'));assert.ok(query('.pk-f-settings'));await click(named('取消'));assert.equal(query('.pk-f-settings'),null);
  console.log('PASS real React simulated DOM: mount, list/grid, navigation, preview, create/cancel, delete confirmation, failure/retry, settings. No real files read or modified.');
}finally{await act(()=>root.unmount());await window.happyDOM.abort();}
