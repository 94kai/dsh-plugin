// Optional isolated browser regression: reuse existing tools; never reads real files.
// FILE_TEST_TOOLS=/path/with/node_modules node features/file-manager/browser-check.mjs
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';
const toolRoot=join(homedir(),'tools','pocket-kit-preview');
const tools=process.env.FILE_TEST_TOOLS||(existsSync(join(toolRoot,'browser-tools','node_modules','playwright'))?join(toolRoot,'browser-tools'):'/tmp/dsh-outing-browser-test');
if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(join(toolRoot,'browser','chromium_headless_shell-1254')))process.env.PLAYWRIGHT_BROWSERS_PATH=join(toolRoot,'browser');
const require=createRequire(join(resolve(tools),'package.json'));
const {chromium}=require('playwright'),{build}=require('esbuild');
const bundle=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';window.React=React;window.createRoot=createRoot;",resolveDir:resolve(tools)},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
const view=await readFile(new URL('./view.js',import.meta.url),'utf8');
let source=await readFile(new URL('../utilities/client.js',import.meta.url),'utf8');
source=source.replace('/* UTILITY_MESSAGES */','');
for(const name of ['health','file-manager','beijing-pass','bill-manager'])source=source.replace(`/* ${name.toUpperCase().replaceAll('-','_')}_VIEW */`,()=>name==='file-manager'?view:'function create'+({'health':'Health','beijing-pass':'BeijingPass','bill-manager':'BillManager'}[name])+'View(){return ()=>null;}');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));
let fail=false;
const roots=[{id:'test',label:'示例文件',path:'/fixture'}],modified='2026-11-07T05:00:00Z';
const files=[{name:'照片',path:'照片',type:'folder',size:0,modified},{name:'项目说明.txt',path:'项目说明.txt',type:'file',size:1234,modified},{name:'风景.webp',path:'风景.webp',type:'file',size:4567,modified},{name:'这是一个非常长的中文文件名称用于检查窄屏换行与菜单可达性.txt',path:'long.txt',type:'file',size:42,modified}];
await page.route('https://files.test/**',async route=>{
  if(route.request().method()==='POST'){
    const input=route.request().postDataJSON();calls.push(input);const url=new URL(input.path,'https://internal');
    if(fail&&url.pathname==='/entries')return route.fulfill({status:503,json:{error:'测试加载失败，请重试'}});
    const data=url.pathname==='/config'?{revision:1,roots}:url.pathname==='/favorites'?{items:[]}:url.pathname==='/shares'?{shares:[]}:url.pathname==='/text'?{content:'这是隔离的示例预览'}:url.pathname==='/entries'?{path:url.searchParams.get('path')||'',entries:url.searchParams.get('path')?[]:files}:{};
    return route.fulfill({json:data});
  }
  await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;--dsw-alias-bg-base:#f7f8fa;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f6f7fa;--dsw-alias-border-l1:#e8eaf0;--dsw-alias-border-l2:#dce0e8;--dsw-alias-label-primary:#273248;--dsw-alias-label-secondary:#788196;--dsw-alias-brand-primary:#5375db;--dsw-alias-state-error-primary:#c54848}#root{height:100dvh}</style></head><body><div id="root"></div></body></html>'});
});
try{
  await page.goto('https://files.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{window.__ModuleLoader__={load(mod){window.plugin=mod.factory(()=>window.React);}};});
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{let View;window.plugin.apply({effect:fn=>fn(),locale:{bind:()=>value=>value,register:()=>()=>{}},slots:{inject:(_name,fn)=>fn(),register:(meta,component)=>{if(meta.key==='pocket-kit.file-manager')View=component;return()=>{};}},layout:{selectPanel(){},panelInfo:{getSnapshot:()=>({})}}});window.createRoot(document.getElementById('root')).render(window.React.createElement(View,{t:value=>value}));});
  await page.locator('.pk-f-entry').first().waitFor();
  assert.equal(await page.locator('.pk-f-entry').count(),4);
  await page.getByLabel('搜索当前目录',{exact:true}).fill('不存在');assert.equal(await page.locator('.pk-f-entry').count(),0);await page.getByText('没有匹配的文件',{exact:true}).waitFor();
  await page.getByLabel('搜索当前目录',{exact:true}).fill('');
  await page.getByLabel('排序',{exact:true}).selectOption('size');assert.match(await page.locator('.pk-f-entry').nth(1).innerText(),/风景/);
  await page.getByLabel('网格视图',{exact:true}).click();assert.equal(await page.locator('.pk-f-grid').count(),1);
  await page.getByLabel('列表视图',{exact:true}).click();
  await page.locator('.pk-f-open').filter({hasText:'照片'}).click();await page.getByText('这个文件夹是空的',{exact:true}).waitFor();
  await page.getByLabel('上一级',{exact:true}).click();await page.locator('.pk-f-entry').first().waitFor();
  await page.locator('.pk-f-open').filter({hasText:'项目说明.txt'}).click();await page.getByText('这是隔离的示例预览',{exact:true}).waitFor();await page.getByRole('button',{name:'关闭预览',exact:true}).click();
  await page.getByRole('button',{name:'新建文件夹',exact:true}).click();await page.getByLabel('文件夹名称',{exact:true}).fill('测试目录');await page.getByRole('button',{name:'创建',exact:true}).click();await page.getByText('文件夹已创建',{exact:true}).waitFor();assert.ok(calls.some(c=>c.method==='POST'&&c.path==='/directory'&&c.body.name==='测试目录'));
  for(const width of [320,375,390,430,1100]){
    await page.setViewportSize({width,height:900});
    for(const mode of ['列表视图','网格视图']){
      await page.getByLabel(mode,{exact:true}).click();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width} ${mode} overflow`);
      if(mode==='列表视图'){
        const metrics=await page.locator('.pk-f').evaluate(el=>({tools:el.querySelector('.pk-f-tools').getBoundingClientRect().height,row:el.querySelector('.pk-f-entry').getBoundingClientRect().height,first:el.querySelector('.pk-f-entry').getBoundingClientRect().top-el.getBoundingClientRect().top}));
        assert.ok(metrics.tools<=(width<=760?116:74),`${width} inflated toolbar: ${metrics.tools}`);
        assert.ok(metrics.row<80,`${width} inflated row: ${metrics.row}`);
        assert.ok(metrics.first<=(width<=760?245:200),`${width} wasted first screen: ${metrics.first}`);
      }
      const small=await page.locator('.pk-f button:visible,.pk-f summary:visible').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.width<43.9||r.height<43.9;}).map(n=>n.textContent||n.getAttribute('aria-label')));
      assert.deepEqual(small,[],`${width} small targets`);
    }
  }
  await page.setViewportSize({width:1100,height:900});await page.getByLabel('列表视图',{exact:true}).click();await page.screenshot({path:'/tmp/pocket-file-manager-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/pocket-file-manager-mobile.png',fullPage:true});
  fail=true;await page.getByLabel('刷新',{exact:true}).click();await page.getByRole('alert').waitFor();fail=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('fieldset:enabled').waitFor();
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('.pk-f-menu summary').first().click();await page.getByRole('button',{name:'删除',exact:true}).first().click();assert.ok(!calls.some(c=>c.method==='DELETE'));
  await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>{document.body.style.setProperty('--dsw-alias-bg-layer-1','#202530');document.body.style.setProperty('--dsw-alias-bg-layer-2','#191e28');document.body.style.setProperty('--dsw-alias-label-primary','#e4e8f2');});
  assert.deepEqual(errors,[]);
  console.log('PASS: fixture-only navigation, search, sort, views, text preview, create, failure/retry, deletion cancellation; 320/375/390/430/1100 overflow and touch targets.');
  const live=await page.goto('https://dsh.xuekai.top:8888/');console.log('Existing GUI HTTP:',live.status(),'; title:',await page.title());
}finally{await browser.close();}
