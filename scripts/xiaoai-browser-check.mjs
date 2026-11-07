// 隔离浏览器回归：只连接虚构 API，不读取真实音箱或持久数据。
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
let source=await readFile(new URL('../features/media/client.js',import.meta.url),'utf8');
source=source.replace('/* KIT_CHROME */',await readFile(new URL('../features/shared/chrome.js',import.meta.url),'utf8')).replace('/* MUSIC_VIEW */','function createMusicView(){return ()=>null;}').replace('/* XIAOAI_VIEW */',await readFile(new URL('../features/xiaoai/view.js',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({...devices['iPhone 13'],locale:'zh-CN'});
const page=await context.newPage(),errors=[],calls=[];
page.on('pageerror',e=>errors.push(e.message));
const song={path:'/fixture/song.mp3',name:'测试歌曲.mp3',title:'测试歌曲',artist:'测试歌手'};
let automation={revision:'initial',playlists:[{id:'list',profileId:'A',name:'测试歌单',songs:[song]}],rules:[]};
let releaseRefresh,failSend=false,failAutomation=false,fnosConnected=false;
await page.route('https://xiaoai.test/**',async route=>{
 if(route.request().method()!=='POST')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#fff;--dsw-alias-border-l2:#ddd;--dsw-alias-label-primary:#111;--dsw-alias-label-secondary:#555;--dsw-alias-brand-primary:#4263cc;--dsw-alias-state-error-primary:#b00}#root{height:100dvh}</style></head><body><div id="root"></div></body></html>'});
 const c=route.request().postDataJSON();calls.push(c);
 let data={};
 if(c.path==='/profiles')data={profiles:['A','B'].map(id=>({id,name:id==='A'?'客厅音箱':'卧室音箱',online:true,speakerConnected:true,workerState:'running',volume:id==='A'?50:40,librarySize:2,listenerEnabled:true,baseUrl:'http://192.168.1.2:18080',maxResults:20,refreshInterval:0,musicDirs:['/fixture'],playKeywords:[],stopKeywords:[],refreshKeywords:[],randomKeywords:[],queue:[]}))};
 else if(c.path.endsWith('/collection'))data={playlist:[song],favorites:fnosConnected?[song]:[],favoritesSource:'fnos',favoritesReady:fnosConnected,favoritesTotal:fnosConnected?1:0,favoritesError:fnosConnected?'':'请先连接飞牛音乐'};
  else if(c.path==='/fnos/status')data={configured:fnosConnected,connected:fnosConnected,user:fnosConnected?{name:'测试飞牛账号'}:undefined};
  else if(c.path==='/fnos/connect')data={authorizationUrl:'https://nas.test/signin?state=fixture-state',expiresAt:Date.now()+600000};
  else if(c.path==='/fnos/disconnect'){fnosConnected=false;data={success:true};}
 else if(c.path==='/profiles/A'&&c.method==='PUT')return route.fulfill({status:503,json:{error:'隔离测试：保存配置失败'}});
  else if(c.path==='/state')data={controls:[],history:{A:[{text:'测试播报',mode:'speak'}]}};
 else if(c.path==='/automation'){
  if(c.method==='PUT'){if(failAutomation)return route.fulfill({status:409,json:{error:'隔离测试：配置版本冲突，请重新读取'}});automation={...c.body,revision:'saved'};}
  data=automation;
 }
 else if(c.path.includes('/search?'))data={items:[song]};
 else if(c.path.endsWith('/refresh')){await new Promise(resolve=>{releaseRefresh=resolve;});data={success:true};}
 else if(c.path==='/send'){
  if(failSend)return route.fulfill({status:503,json:{error:'隔离测试：设备未连接'}});
  data={success:true,history:[{text:c.body.text,mode:c.body.mode}]};
 }else data={success:true};
 return route.fulfill({json:data});
});
try{
 await page.goto('https://xiaoai.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(()=>{window.__ModuleLoader__={load(mod){window.plugin=mod.factory(()=>window.React);}};});
 await page.addScriptTag({content:source});
 await page.evaluate(()=>{let View;window.plugin.apply({effect:fn=>fn(),slots:{inject:(_,fn)=>fn(),register:(meta,fn)=>{if(meta.key==='pocket-kit.xiaoai')View=fn;return ()=>{};}},layout:{selectPanel(){},panelInfo:{getSnapshot:()=>({})}}});window.createRoot(document.getElementById('root')).render(window.React.createElement(View));});
 await page.getByLabel('所选音箱').selectOption('A');
 const service=page.getByRole('button',{name:'服务管理 ▾',exact:true});
 const writesBefore=calls.filter(c=>c.method!=='GET').length;
 await service.click();assert.equal(await page.getByRole('button',{name:'收起服务管理 ▴',exact:true}).getAttribute('aria-expanded'),'true');
 assert.equal(await page.getByRole('button',{name:'启动音箱服务',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'停止音箱服务',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'收起服务管理 ▴',exact:true}).click();
 assert.equal(calls.filter(c=>c.method!=='GET').length,writesBefore,'展开服务管理不能启停设备');
 await page.getByRole('heading',{name:'已保存的歌曲（1首）',exact:true}).waitFor();
 assert.equal(await page.getByText('旧版播报记录（迁移数据）',{exact:true}).count(),0);
 const nav=page.getByRole('navigation',{name:'播放内容'});
 await nav.getByRole('button',{name:'我喜欢',exact:true}).click();
 await page.getByText('尚未连接飞牛音乐',{exact:true}).waitFor();
 await page.getByLabel('本机飞牛NAS管理地址').fill('https://nas.test');
 await page.evaluate(()=>window.open=()=>null);
 await page.getByRole('button',{name:'连接飞牛音乐',exact:true}).click();
 await page.getByRole('link',{name:'点击打开飞牛授权页',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'点击打开飞牛授权页',exact:true}).getAttribute('href'),'https://nas.test/signin?state=fixture-state');
 fnosConnected=true;await page.getByRole('button',{name:'检查连接',exact:true}).click();await page.getByText('已连接：测试飞牛账号',{exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'点击打开飞牛授权页',exact:true}).count(),0);
 await page.getByRole('button',{name:'取消喜欢',exact:true}).click();await page.getByText('收藏已更新',{exact:true}).waitFor();
 assert.ok(calls.some(c=>c.path==='/profiles/A/favorites'&&c.body.favorite===false));

 await nav.getByRole('button',{name:'曲库搜索'}).click();
 assert.equal(await nav.getByRole('button',{name:'曲库搜索'}).getAttribute('aria-pressed'),'true');
 await page.getByLabel('搜索本地曲库').fill('测试');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByText('找到 1 首',{exact:true}).waitFor();
 assert.equal(await page.locator('article').count(),1);
 await nav.getByRole('button',{name:'定时播放'}).click();
 const autoNav=page.getByRole('navigation',{name:'自动播放管理'});
 assert.equal(await page.getByLabel('新歌单名称').count(),0,'默认不展示创建表单');
 assert.equal(await page.getByRole('region',{name:'规则设置'}).count(),0,'默认不展示规则表单');
 await autoNav.getByRole('button',{name:'歌单管理',exact:true}).click();
 await page.getByRole('button',{name:'新建歌单',exact:true}).click();
 await page.getByLabel('新歌单名称').fill('新增测试歌单');await page.getByRole('button',{name:'创建歌单',exact:true}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('option')].some(n=>n.textContent.includes('新增测试歌单')));
 assert.equal(automation.playlists.length,2);
 assert.equal(await page.getByRole('button',{name:'为此歌单添加规则',exact:true}).isDisabled(),true,'空歌单不能创建规则');
 await page.getByText('添加歌曲',{exact:true}).click();
 await page.getByLabel('搜索曲库歌曲').fill('测试');await page.getByRole('button',{name:'搜索歌曲',exact:true}).click();
 await page.getByRole('button',{name:'加入歌单',exact:true}).click();await page.getByRole('button',{name:'已加入',exact:true}).waitFor();
 await page.getByRole('button',{name:'为此歌单添加规则',exact:true}).click();
 assert.equal(await autoNav.getByRole('button',{name:'播放规则',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByLabel('2. 如何触发').selectOption('voice');
 assert.equal(await page.getByLabel('每天北京时间',{exact:true}).count(),0);
 await page.getByLabel('语音提示词',{exact:true}).fill('测试提示词');await page.getByRole('button',{name:'保存播放规则',exact:true}).click();
 await page.getByRole('button',{name:'停用规则',exact:true}).waitFor();assert.equal(automation.rules.length,1);
 assert.equal(automation.rules[0].time,'');
 await page.getByRole('button',{name:'编辑规则',exact:true}).click();assert.equal(await page.getByLabel('语音提示词',{exact:true}).inputValue(),'测试提示词');
 await page.getByLabel('2. 如何触发').selectOption('both');await page.getByLabel('每天北京时间',{exact:true}).fill('08:30');
 await page.getByRole('button',{name:'保存播放规则',exact:true}).click();await page.getByRole('button',{name:'编辑规则',exact:true}).waitFor();
 assert.equal(automation.rules[0].time,'08:30');assert.equal(automation.rules[0].phrase,'测试提示词');
 await page.getByRole('button',{name:'编辑规则',exact:true}).click();
 await page.getByLabel('2. 如何触发').selectOption('time');
 failAutomation=true;await page.getByRole('button',{name:'保存播放规则',exact:true}).click();
 await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('每天北京时间',{exact:true}).inputValue(),'08:30','冲突不能清空编辑表单');
 failAutomation=false,fnosConnected=false;await page.getByRole('button',{name:'保存播放规则',exact:true}).click();await page.getByRole('button',{name:'编辑规则',exact:true}).waitFor();
 assert.equal(automation.rules[0].phrase,'','仅定时规则不能残留隐藏的语音触发');

 await nav.getByRole('button',{name:'播放台',exact:true}).click();
 const configButton=page.getByRole('button',{name:'音箱配置',exact:true});
 await configButton.click();
 const configDialog=page.getByRole('dialog',{name:'音箱配置',exact:true});
 await configDialog.waitFor();
 assert.equal(await page.getByLabel('关闭音箱配置').evaluate(el=>document.activeElement===el),true);
 await page.keyboard.press('Shift+Tab');assert.equal(await configDialog.getByRole('button',{name:'保存配置',exact:true}).evaluate(el=>document.activeElement===el),true,'焦点应限制在弹窗');
 await page.keyboard.press('Tab');assert.equal(await page.getByLabel('关闭音箱配置').evaluate(el=>document.activeElement===el),true);
 await configDialog.getByLabel('名称',{exact:true}).fill('仅在浏览器编辑');
 await page.keyboard.press('Escape');await configDialog.waitFor({state:'hidden'});
 assert.equal(await configButton.evaluate(el=>document.activeElement===el),true,'关闭后恢复触发按钮焦点');
 assert.equal(calls.some(c=>c.method==='PUT'&&c.path==='/profiles/A'),false,'关闭不得写配置');
 await configButton.click();assert.equal(await configDialog.getByLabel('名称',{exact:true}).inputValue(),'客厅音箱','取消修改不得影响配置');
 await page.getByLabel('关闭音箱配置').click();
 await configButton.click();await page.locator('.pk-modal').click({position:{x:2,y:2}});await configDialog.waitFor({state:'hidden'});
 await configButton.click();await configDialog.getByRole('button',{name:'取消',exact:true}).click();await configDialog.waitFor({state:'hidden'});
 await configButton.click();await configDialog.getByLabel('名称',{exact:true}).fill('失败后保留配置草稿');
 page.once('dialog',dialog=>dialog.accept());await configDialog.getByRole('button',{name:'保存配置',exact:true}).click();await configDialog.getByRole('alert').waitFor();
 assert.equal(await configDialog.getByLabel('名称',{exact:true}).inputValue(),'失败后保留配置草稿');
 await configDialog.getByRole('button',{name:'取消',exact:true}).click();

 await page.getByRole('button',{name:'刷新曲库',exact:true}).click();
 await page.getByRole('button',{name:'正在刷新曲库…',exact:true}).waitFor();
 assert.equal(await page.locator('fieldset').isDisabled(),false,'刷新不能锁住整页');
 await nav.getByRole('button',{name:'曲库搜索'}).click();
 releaseRefresh();await page.getByText('客厅音箱曲库刷新完成',{exact:true}).waitFor();
 await page.getByLabel('关闭提示').click();
 await page.getByRole('button',{name:'音响控制',exact:true}).click();
 assert.equal(await page.locator('.pk-row').filter({hasText:'测试播报'}).count(),1,'重复历史只能展示一份');
 assert.equal(await page.locator('.pk-row').filter({hasText:'独有旧播报'}).count(),0,'旧版数据不得再进入界面');
 await page.getByLabel('播报文字（最多500字）').fill('失败后保留草稿');failSend=true;
 await page.getByRole('button',{name:'发送到所选音箱'}).click();await page.getByRole('alert').waitFor();
 assert.equal(await page.getByLabel('播报文字（最多500字）').inputValue(),'失败后保留草稿');
 await page.getByLabel('关闭提示').click();failSend=false;
 await page.getByRole('button',{name:'发送到所选音箱'}).click();await page.getByText('播报已发送',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('播报文字（最多500字）').inputValue(),'');
 await page.getByRole('button',{name:'添加快捷控制'}).click();await page.getByLabel('名称',{exact:true}).fill('虚构快捷控制');await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByLabel('所选音箱').selectOption('B');assert.equal(await page.getByLabel('音量',{exact:true}).inputValue(),'40');
 await page.getByRole('button',{name:'小爱播放',exact:true}).click();
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});
  for(const name of ['播放台','曲库搜索','我喜欢','定时播放']){
   await nav.getByRole('button',{name,exact:true}).click();
   assert.equal(await page.locator('.pk-media').evaluate(el=>el.scrollWidth>el.clientWidth),false,`${width} ${name} overflow`);
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: fixture search, active tabs, playlist/rule writes, rule editing, nonblocking refresh, send failure/retry, draft retention, device switching, mobile widths. Real devices untouched.');
}finally{releaseRefresh?.();await browser.close();}
