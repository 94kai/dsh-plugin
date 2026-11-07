// 隔离浏览器：所有 API 均为虚构数据，无真实数据写入。
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const root=join(homedir(),'tools/pocket-kit-preview');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= join(root,'browser');
const require=createRequire(join(root,'browser-tools/package.json'));
const {chromium,devices}=require('playwright'),{build}=require('esbuild');
const bundle=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';window.React=React;window.createRoot=createRoot;",resolveDir:join(root,'dom-tools')},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
let source=await readFile(new URL('../features/utilities/client.js',import.meta.url),'utf8');
for(const [marker,file] of [['KIT_CHROME','shared/chrome.js'],['HEALTH_VIEW','health/view.js'],['BILL_MANAGER_VIEW','bill-manager/view.js']])source=source.replace('/* '+marker+' */',await readFile(new URL('../features/'+file,import.meta.url),'utf8'));
source=source.replace('/* FILE_MANAGER_VIEW */','function createFileManagerView(){return ()=>null;}').replace('/* BEIJING_PASS_VIEW */','function createBeijingPassView(){return ()=>null;}');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({...devices['iPhone 13'],locale:'zh-CN'}),page=await context.newPage(),errors=[],calls=[];
page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
let failSave=false,failRules=false;
const health={person:{id:1,name:'虚构人员',visible:['c0','c1','c2'],focused:[],hideEmpty:false,revision:1},columns:[{id:'c0',label:'日期'},{id:'c1',label:'来源'},{id:'c2',label:'测试指标'},{id:'c3',label:'隐藏指标'}],records:[{id:1,revision:1,cells:{c0:'2026-11-08',c1:'测试',c2:'1',c3:'必须保留'}}]};
const bills={sources:[],config:{categoryRules:[{keyword:'测试',primary:'测试分类',secondary:''}],alipayFilterRules:[]},exportPreview:Object.fromEntries(['bills','alipay','cmb'].map(id=>[id,{columns:['日期','备注'],rows:Array.from({length:51},(_,i)=>({日期:'2026-11-08',备注:'虚构记录'+i}))}]))};
await page.route('https://records.test/**',async route=>{
  if(route.request().method()!=='POST')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#eee;--dsw-alias-border-l1:#ddd;--dsw-alias-border-l2:#aaa;--dsw-alias-label-primary:#111;--dsw-alias-label-secondary:#555;--dsw-alias-brand-primary:#4263cc}#root{height:100dvh}</style></head><body><div id="root"></div></body></html>'});
  const c=route.request().postDataJSON();calls.push(c);let data={};
  if(c.path==='/people')data={people:[{id:1,name:'虚构人员'}],columns:health.columns};
  else if(c.path==='/people/1')data=health;
  else if(c.path==='/people/1/columns'){const col={id:'custom_1',label:c.body.label};health.columns.push(col);health.person.visible.push(col.id);health.person.revision++;data={column:col,person:health.person};}
  else if(c.path.includes('/records')){if(failSave)return route.fulfill({status:409,json:{error:'测试冲突，请重新读取'}});if(c.method==='POST')health.records.push({id:2,revision:1,cells:c.body.cells});else if(c.method==='PUT')health.records[0]={id:1,revision:2,cells:c.body.cells};data={id:1};}
  else if(c.path==='/status')data=bills;
  else if(c.path==='/category-rules'){if(failRules)return route.fulfill({status:400,json:{error:'测试规则保存失败'}});bills.config.categoryRules=c.body.rules;data=bills;}
  return route.fulfill({json:data});
});
async function mount(id){await page.evaluate(id=>{window.reactRoot?.unmount();let View;window.plugin.apply({effect:fn=>fn(),locale:{register:()=>()=>{}},slots:{inject:(_,fn)=>fn(),register:(meta,fn)=>{if(meta.key==='pocket-kit.'+id)View=fn;return()=>{};}},layout:{selectPanel(){},panelInfo:{getSnapshot:()=>({})}}});window.reactRoot=window.createRoot(document.getElementById('root'));window.reactRoot.render(window.React.createElement(View));},id);await page.locator('fieldset:enabled').waitFor();}
try{
  await page.goto('https://records.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>{window.__ModuleLoader__={load(mod){window.plugin=mod.factory(()=>window.React);}};});await page.addScriptTag({content:source});
  await mount('health');await page.locator('.pk-health-table').waitFor();assert.equal(await page.locator('h1').count(),0);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);await page.getByRole('button',{name:'首页',exact:true}).waitFor();await page.getByRole('button',{name:'会话',exact:true}).waitFor();
  await page.getByRole('button',{name:'编辑 2026-11-08 的记录'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('测试指标',{exact:true}).fill('2');failSave=true;
  await dialog.getByRole('button',{name:'保存记录',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('测试指标',{exact:true}).inputValue(),'2');
  failSave=false;await dialog.getByRole('button',{name:'保存记录',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(health.records[0].cells.c3,'必须保留');assert.equal(health.records[0].cells.c2,'2');
  await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'管理',exact:true}).click();await dialog.getByLabel('字段名称（可含单位）').fill('自定义测试');await dialog.getByRole('button',{name:'添加字段',exact:true}).click();await dialog.getByText('字段已添加，可在新增或编辑记录中填写',{exact:true}).waitFor();await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  const add=page.getByRole('button',{name:'新增',exact:true});await add.click();await dialog.getByLabel('自定义测试',{exact:true}).fill('66');await dialog.getByRole('button',{name:'保存记录',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(health.records[1].cells.custom_1,'66');
  await add.click();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await add.evaluate(el=>document.activeElement===el),true);
  const count=calls.length;await page.getByLabel('搜索记录',{exact:true}).fill('不匹配');await page.getByText('没有匹配的记录，可清空搜索重试。',{exact:true}).waitFor();assert.equal(calls.length,count);
  health.records.push(...Array.from({length:23},(_,i)=>({id:i+3,revision:1,cells:{c0:'2026-01-'+String(i+1).padStart(2,'0'),c1:'较长来源'.repeat(30),c2:'测试值'}})));
  await page.getByLabel('搜索记录',{exact:true}).fill('');await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'刷新记录',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===25);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);
  await page.getByRole('button',{name:'查看 2026-01-01 的来源',exact:true}).click();assert.equal(await dialog.getByLabel('来源',{exact:true}).inputValue(),'较长来源'.repeat(30));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await mount('bill-manager');await page.locator('tbody tr').first().waitFor();assert.equal(await page.locator('tbody tr').count(),51);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);assert.equal(await page.locator('h1').count(),0);await page.getByLabel('账单来源').selectOption('alipay');assert.equal(await page.locator('tbody tr').count(),51);await page.getByLabel('搜索当前来源').fill('虚构记录0');assert.equal(await page.locator('tbody tr').count(),1);await page.getByLabel('搜索当前来源').fill('');assert.equal(await page.locator('tbody tr').count(),51);
  assert.ok(await page.getByRole('link',{name:'导出全部',exact:true}).getAttribute('href'));await page.getByRole('button',{name:'更多',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'更多',exact:true}).getAttribute('aria-expanded'),'false');await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'导入账单',exact:true}).click();await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'更多',exact:true}).click();await page.getByRole('button',{name:'分类规则',exact:true}).click();await dialog.getByLabel('备注包含',{exact:true}).fill('新规则');failRules=true;await dialog.getByRole('button',{name:'保存规则',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('备注包含',{exact:true}).inputValue(),'新规则');failRules=false;await dialog.getByRole('button',{name:'保存规则',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(bills.config.categoryRules[0].keyword,'新规则');
  assert.deepEqual(errors,[]);console.log('健康默认表格、编辑保留隐藏值、冲突保留草稿、添加字段/记录、Escape焦点恢复、搜索；账单全量无分页、来源下拉、搜索、菜单、规则失败恢复：通过');
}catch(error){console.error(await page.locator('.pk-util').innerText());throw error;}finally{await context.close();await browser.close();}
