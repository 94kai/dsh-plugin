// Optional integration test: OUTING_TEST_TOOLS must name a directory containing
// playwright, esbuild, react and react-dom. No replacement DSH server is started.
import { createRequire } from 'node:module';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createStore } from './store.js';
import { createHandler } from './index.js';
const tools = process.env.OUTING_TEST_TOOLS;
if (!tools) throw new Error('Set OUTING_TEST_TOOLS to the browser test dependencies directory');
const require = createRequire(join(resolve(tools), 'package.json'));
const { chromium } = require('playwright');
const { build } = require('esbuild');
const source = await readFile(new URL('./client.js', import.meta.url), 'utf8');
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; window.React=React; window.createRoot=createRoot;`, resolveDir:resolve(tools) }, bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'} });
const directory = await mkdtemp(join(tmpdir(), 'outing-browser-'));
const store = createStore({dataFile:join(directory,'items.json')});
const handler = createHandler(store);
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const page = await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://outing.test/**',async route=>{
  const req=route.request();
  if(new URL(req.url()).pathname==='/api/outing-checklist') {
    const response=await handler(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}: {})}));
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  } else await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{margin:0;font-family:system-ui;background:white;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-border-l2:#e4e7e6;--dsw-alias-label-primary:#20302c;--dsw-alias-label-tertiary:#73807b;--dsw-alias-interactive-bg-hover:#f1f5f3}#root{height:100vh}</style></head><body><div id="root"></div></body></html>'});
});
async function mount(){
  await page.goto('https://outing.test/');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{
    window.registrations={};window.__ModuleLoader__={load(mod){window.plugin=mod.factory(()=>window.React);}};
  });
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
    const React=window.React;window.root=window.createRoot(document.getElementById('root'));
    window.plugin.apply({effect:fn=>fn(),locale:{register:()=>()=>{}},slots:{inject:(name,fn)=>fn(),register:(meta,component)=>{window.registrations[meta.name]={meta,component};return()=>{};}},layout:{panelInfo:{getSnapshot:()=>({activePanelId:'local.outing-checklist'})},selectPanel:id=>window.root.render(React.createElement('p',null,'已返回对话'))}});
    window.root.render(React.createElement(window.registrations.main.component));
  });
  await page.locator('input[aria-label="要带的物品"]:enabled').waitFor();
}
async function saved(){await page.getByRole('status').filter({hasText:'已保存'}).waitFor();}
try {
  await mount();
  await page.getByRole('button',{name:'＋ 钥匙',exact:true}).click();await saved();
  await page.getByRole('textbox',{name:'要带的物品'}).fill('水杯');
  await page.getByLabel('新物品归属人').selectOption('妈妈');
  await page.getByRole('button',{name:'＋ 添加物品',exact:true}).click();await saved();
  await page.getByRole('button',{name:'标记已准备：钥匙',exact:true}).click();await saved();
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'50');
  await page.getByRole('button',{name:'编辑 水杯',exact:true}).click();
  await page.getByRole('textbox',{name:'物品名称'}).fill('保温水杯');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();await saved();
  await page.getByRole('dialog').waitFor({state:'detached'});
  assert.equal(await page.getByRole('searchbox').count(),0);
  await page.getByLabel('只看待准备').check();assert.equal(await page.locator('.oc-row').count(),1);
  await page.getByLabel('只看待准备').uncheck();
  await page.getByRole('button',{name:'上移 保温水杯',exact:true}).click();await saved();
  assert.equal((await store.read()).items[0].text,'保温水杯');
  // Recreate the page: verifies server-backed persistence, not component memory.
  await mount();assert.equal(await page.locator('.oc-row').count(),2);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'50');
  await page.getByRole('button',{name:'↻ 下一次出门',exact:true}).click();
  await page.getByRole('button',{name:'重置准备状态',exact:true}).click();await saved();
  assert.ok((await store.read()).items.every(i=>!i.checked));
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'移除 钥匙',exact:true}).click();
  await page.getByRole('button',{name:'确认移除',exact:true}).click();await saved();
  assert.equal((await store.read()).items.length,1);
  await page.getByRole('dialog').waitFor({state:'detached'});
  await mkdir(new URL('./artifacts/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('./artifacts/desktop.png',import.meta.url).pathname,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:new URL('./artifacts/mobile.png',import.meta.url).pathname,fullPage:true});
  await page.getByRole('button',{name:'← 返回对话',exact:true}).click();
  await page.getByText('已返回对话',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: add, check, edit, no search box, pending filter, reorder, reload persistence, reset, delete, mobile overflow, return navigation; no browser errors.');
  const live=await page.goto('https://dsh.xuekai.top:8888/');
  console.log('Existing GUI response:',live.status(),'; title:',await page.title());
} finally {
  await browser.close();
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(directory.startsWith(join(tmpdir(),'outing-browser-')));
  await rm(directory,{recursive:true,force:true});
}
