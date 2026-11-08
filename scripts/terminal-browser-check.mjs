// 隔离按键栏：仅捕获 sendKey，不连接宿主或真实终端。
import {createRequire} from 'node:module';
import {readFile,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const root=join(homedir(),'tools/pocket-kit-preview');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= join(root,'browser');
const require=createRequire(join(root,'browser-tools/package.json'));
const {chromium,devices}=require('playwright'),{build}=require('esbuild');
const bundle=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';window.React=React;window.createRoot=createRoot;",resolveDir:join(root,'dom-tools')},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'}});
let source=await readFile(new URL('../features/terminal-touch-keys/client.js',import.meta.url),'utf8');
source=source.replace('/* TERMINAL_VIEWPORT */',(await readFile(new URL('../features/terminal-touch-keys/viewport.js',import.meta.url),'utf8')).replace(/^export /gm,''));
const output=await mkdtemp(join(tmpdir(),'terminal-keys-fixture-'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const theme of ['light','dark'])for(const width of [320,375,390,430]){
  const context=await browser.newContext({...devices['iPhone 13'],viewport:{width,height:812},colorScheme:theme,locale:'zh-CN'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:var(--dsw-alias-bg-base);--dsw-alias-bg-base:'+(theme==='dark'?'#151515':'#fff')+';--dsw-alias-bg-layer-1:'+(theme==='dark'?'#252525':'#f6f6f6')+';--dsw-alias-bg-layer-2:#888;--dsw-alias-border-l2:#888;--dsw-alias-label-primary:'+(theme==='dark'?'#eee':'#222')+';--dsw-alias-brand-primary:#5588ee}#root{position:fixed;bottom:0;width:100%}</style><div id="root"></div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(()=>{window.__ModuleLoader__={load(mod){window.plugin=mod.factory(()=>window.React);}};});
  await page.addScriptTag({content:source});
  await page.evaluate(()=>{
   let Toolbar,labels;window.sent=[];
   window.plugin.apply({effect:fn=>fn(),locale:{register:(_,all)=>{labels=all.zh;},bind:()=>key=>labels[key]},slots:{inject:(_,fn)=>fn(),register:(meta,fn)=>{if(meta.id==='terminal-touch-keys')Toolbar=fn;}},layout:{},sidebarRight:{}});
   window.reactRoot=window.createRoot(document.getElementById('root'));
   window.renderToolbar=enabled=>window.reactRoot.render(window.React.createElement(Toolbar,{enabled,sendKey:key=>window.sent.push(key),t:key=>labels[key]}));window.renderToolbar(true);
  });
  const bar=page.locator('.ttk-bar');await bar.waitFor();
  const geometry=await bar.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,rows:[...el.querySelectorAll('button')].map(b=>b.getBoundingClientRect().top)}));
  assert.equal(geometry.scrollWidth,geometry.width);assert.equal(new Set(geometry.rows).size,1);
  await page.getByRole('button',{name:'Tab：补全或缩进',exact:true}).tap();
  await page.getByRole('button',{name:/^Vim 退出：/}).tap();
  assert.deepEqual(await page.evaluate(()=>window.sent),['tab','vimQuit']);
  await page.evaluate(()=>window.renderToolbar(false));await page.waitForFunction(()=>[...document.querySelectorAll('button')].every(b=>b.disabled));
  assert.equal(await bar.locator('button:disabled').count(),5);
  await page.evaluate(()=>window.renderToolbar(true));await page.waitForFunction(()=>[...document.querySelectorAll('button')].every(b=>!b.disabled));
  await bar.screenshot({path:join(output,theme+'-'+width+'.png')});
  assert.deepEqual(errors,[]);console.log(theme,width,'单行无溢出，Tab/:q 触屏点击与禁用状态通过');
  await context.close();
 }
 console.log('隔离截图目录：'+output+'；不是宿主实页或真机验收。');
}finally{await browser.close();}
