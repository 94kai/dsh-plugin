// Read-only real-GUI screenshots. Login state is stored in a private local profile for reuse.
import {createRequire} from 'node:module';
import {chmod,mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';

// Persistent tool root. /tmp is wiped at boot and ~/.cache is disposable.
const TOOL_ROOT=process.env.POCKET_PREVIEW_ROOT||join(homedir(),'tools','pocket-kit-preview');
// Reuse one authenticated browser state so the login token is only needed once.
const STATE_FILE=process.env.POCKET_PREVIEW_STATE?resolve(process.env.POCKET_PREVIEW_STATE):join(TOOL_ROOT,'state','storage.json');
const BASE_URL='https://dsh.xuekai.top:8888/';
const help=`工具箱实页截图（只浏览，不修改业务数据）
  node scripts/preview-ui.mjs                 # 手机390px：首页、文件页
  node scripts/preview-ui.mjs --all           # 桌面、320/375/390/430px手机、390px暗色
  node scripts/preview-ui.mjs --music         # 额外打开音乐页，核验无小爱切换入口
  node scripts/preview-ui.mjs --records      # 仅健康、记账单；--all 检查四种手机宽度明暗主题
  node scripts/preview-ui.mjs --terminal      # 仅打开原生终端、截按键栏，不发送按键；--all 检查四种宽度明暗主题
  node scripts/preview-ui.mjs --header        # 返回会话，核验标题工具箱图标可见且可打开原工具箱
  node scripts/preview-ui.mjs --reset-login   # 删除已保存的登录状态；下次需要 token
  node scripts/preview-ui.mjs --help
环境变量：
  POCKET_PREVIEW_TOKEN        首次登录或 --reset-login 后使用的临时token；之后可省略
  POCKET_PREVIEW_STATE        可选，私有登录状态路径（默认~/tools/pocket-kit-preview/state/storage.json）
  POCKET_BROWSER_TOOLS        包含node_modules/playwright的目录（默认持久工具目录）
  POCKET_PREVIEW_ROOT         持久工具根目录（默认~/tools/pocket-kit-preview）
默认预览地址：https://dsh.xuekai.top:8888/
默认截图位置：系统临时目录下独立的pocket-kit-preview-*目录
`;

function loadPlaywright(){
  const locations=process.env.POCKET_BROWSER_TOOLS?[resolve(process.env.POCKET_BROWSER_TOOLS)]:[join(TOOL_ROOT,'browser-tools'),resolve('.'),'/tmp/dsh-outing-browser-test'];
  for(const location of locations){
    try{return createRequire(join(location,'package.json'))('playwright');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
  }
  throw Error('找不到Playwright。请先阅读docs/browser-preview.md；不要重复下载已存在的浏览器。');
}

// Playwright resolves browsers from PLAYWRIGHT_BROWSERS_PATH. Point it at the
// persistent copy unless the caller supplied an explicit value.
function usePersistentBrowsers(){
  const browsers=join(TOOL_ROOT,'browser');
  if(!process.env.PLAYWRIGHT_BROWSERS_PATH&&existsSync(join(browsers,'chromium_headless_shell-1254')))process.env.PLAYWRIGHT_BROWSERS_PATH=browsers;
}

// The state file contains login cookies and local storage. Keep the directory
// private; never print its contents or write it into the project.
async function readState(){
  if(!existsSync(STATE_FILE))return undefined;
  try{
    const state=JSON.parse(await readFile(STATE_FILE,'utf8'));
    if(!state||!Array.isArray(state.cookies)||!Array.isArray(state.origins))throw Error('格式无效');
    return state;
  }catch(error){
    throw Error('已保存的预览登录状态无法读取（'+error.message+'）。可使用 --reset-login 后带 POCKET_PREVIEW_TOKEN 重新登录。');
  }
}

async function saveState(state){
  const directory=dirname(STATE_FILE),temporary=STATE_FILE+'.tmp-'+process.pid;
  await mkdir(directory,{recursive:true,mode:0o700});
  await chmod(directory,0o700);
  await writeFile(temporary,JSON.stringify(state),{mode:0o600});
  await chmod(temporary,0o600);
  await rename(temporary,STATE_FILE);
  await chmod(STATE_FILE,0o600);
}

function tokenUrl(token){
  const url=new URL(BASE_URL);
  if(token)url.searchParams.set('token',token);
  return url.href;
}

async function waitForHome(page){
  await page.locator('.pk-home, .pk-home-launcher').first().waitFor({state:'attached',timeout:30000});
}

async function authenticate(browser,options,token){
  const context=await browser.newContext(options);
  try{
    const page=await context.newPage();
    const response=await page.goto(tokenUrl(token),{waitUntil:'domcontentloaded',timeout:45000});
    if(response&&!response.ok())throw Error('GUI登录失败，HTTP '+response.status()+'；请确认 POCKET_PREVIEW_TOKEN 有效。');
    await waitForHome(page);
    const state=await context.storageState();
    await saveState(state);
    return state;
  }finally{await context.close();}
}

async function main(){
  const token=(process.env.POCKET_PREVIEW_TOKEN||'').trim();
  const reset=process.argv.includes('--reset-login');
  if(reset){await rm(STATE_FILE,{force:true});console.log('已删除保存的预览登录状态。');}
  let state=await readState();
  if(!state&&!token)throw Error('首次使用或重置后需要 POCKET_PREVIEW_TOKEN。请向用户取得临时登录授权；不要把凭据写入代码。');
  usePersistentBrowsers();
  const {chromium,devices}=loadPlaywright();
  const phone={...devices['iPhone 13'],locale:'zh-CN'};
  const profiles=process.argv.includes('--all')?[
    ['desktop',{viewport:{width:1440,height:1000},locale:'zh-CN'}],
    ['mobile-320',{...phone,viewport:{width:320,height:740}}],
    ['mobile-375',{...phone,viewport:{width:375,height:812}}],
    ['mobile-390',phone],
    ['mobile-430',{...phone,viewport:{width:430,height:932}}],
    ['mobile-dark',{...phone,colorScheme:'dark'}],
  ]:[['mobile-390',phone]];
  if(process.argv.includes('--all')&&(process.argv.includes('--records')||process.argv.includes('--terminal')))for(const width of [320,375,430])profiles.push(['mobile-dark-'+width,{...phone,viewport:{width,height:812},colorScheme:'dark'}]);
  const requestedProfile=process.argv.find(value=>value.startsWith('--profile='))?.slice('--profile='.length);
  if(requestedProfile){const selected=profiles.filter(([name])=>name===requestedProfile);if(!selected.length)throw Error('未知预览profile；请配合 --all 使用已定义的名称');profiles.splice(0,profiles.length,...selected);}
  const withMusic=process.argv.includes('--music');
  const output=await mkdtemp(join(tmpdir(),'pocket-kit-preview-'));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    if(!state){
      state=await authenticate(browser,profiles[0][1],token);
      console.log('已保存预览登录状态：'+STATE_FILE+'（私有目录，内容不显示；后续无需 token）');
    }
    for(const [name,options] of profiles){
      const context=await browser.newContext({...options,storageState:state});
      try{
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(redact(error.message,token)));
        const response=await page.goto(BASE_URL,{waitUntil:'domcontentloaded',timeout:45000});
        if(!response?.ok())throw Error('GUI会话不可用，HTTP '+(response?.status()??'未知')+'；请使用 --reset-login 后带 token 重新登录。');
        try{await waitForHome(page);}catch{throw Error('工具箱未在30秒内加载；已保存的登录状态可能失效，请使用 --reset-login 后带 POCKET_PREVIEW_TOKEN 重新登录。');}
        // Our own launcher may be inside the closed mobile sidebar. Invoke its
        // existing navigation handler without opening or reading session views.
        if(!await page.locator('.pk-home').count())await page.locator('.pk-home-launcher').first().evaluate(button=>button.click());
        const home=page.locator('.pk-home');await home.locator('.pk-home-tool').first().waitFor();
        const uncovered=await home.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(Math.min(innerWidth-16,r.right-16),Math.max(64,r.top+36));return !!hit?.closest('.pk-home');});
        if(!uncovered)throw Error('工具箱被宿主侧栏或浮层遮挡；请先关闭遮挡，再截图，不能按遮挡截图验收。');
        if(process.argv.includes('--terminal')){
          // Open via our existing card, never type into or capture terminal contents.
          await home.locator('[data-tool="terminal"]').click();
          const bar=page.locator('.ttk-bar').first();
          try{await bar.waitFor({state:'visible',timeout:15000});}catch{
            const noSession=await page.getByText('请先选择一个会话或返回对话，再打开终端。',{exact:true}).count();
            const failed=await page.getByText('终端暂时无法打开，请刷新后重试。',{exact:true}).count();
            throw Error('原 GUI 已启动，但终端按键栏不可见；无会话提示='+Boolean(noSession)+'，入口失败提示='+Boolean(failed)+'，pageerror 数='+errors.length+'。未读取会话或终端内容。');
          }
          await bar.getByRole('button',{name:'Tab：补全或缩进',exact:true}).waitFor();
          await bar.getByRole('button',{name:/^Vim 退出：/}).waitFor();
          const geometry=await bar.evaluate(el=>{
            const r=el.getBoundingClientRect();
            return {width:r.width,scrollWidth:el.scrollWidth,buttons:[...el.querySelectorAll('button')].map(button=>{const b=button.getBoundingClientRect();return {label:button.textContent,width:b.width,height:b.height,visible:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight&&document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('button')===button};})};
          });
          if(geometry.scrollWidth>Math.ceil(geometry.width)||geometry.buttons.length!==5||geometry.buttons.some(b=>!b.visible)||errors.length)throw Error('终端按键溢出、被遮挡或页面运行错误；未输出终端内容');
          await bar.screenshot({path:join(output,'terminal-keys-'+name+'.png')});
          console.log(name,'终端按键栏（未发送按键）',JSON.stringify(geometry));
          continue;
        }
        if(process.argv.includes('--header')){
          await home.getByRole('button',{name:'返回会话',exact:true}).click();
          const launcher=page.locator('.pk-home-header-launcher');
          try{await launcher.waitFor({state:'visible',timeout:5000});}catch(error){await page.screenshot({path:join(output,'header-unavailable-'+name+'.png')});console.log('入口检查失败截图目录：'+output);throw error;}
          const geometry=await launcher.evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,visible:r.left>=0&&r.right<=innerWidth&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.pk-home-header-launcher')===el};});
          if(!geometry.visible||geometry.width<28||geometry.height<28)throw Error('标题入口被遮挡、溢出或触控尺寸不足。');
          await launcher.screenshot({path:join(output,'header-icon-'+name+'.png')});
          await launcher.click();await home.waitFor({state:'visible'});
          console.log(name,'标题入口打开/返回通过',JSON.stringify(geometry));
        }
        if(process.argv.includes('--records')){
          page.on('dialog',dialog=>dialog.type()==='confirm'?dialog.accept():dialog.dismiss());
          for(const feature of ['health','bill-manager']){
            await page.locator('.pk-home [data-tool="'+feature+'"]').click();
            const panel=page.locator('.pk-util');await panel.locator('fieldset:enabled').waitFor();
            if(await panel.locator('[role="alert"]').count())throw Error(feature+' 加载失败（未输出私人内容）');
            await panel.screenshot({path:join(output,feature+'-'+name+'.png')});
            const geometry=await panel.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
            console.log(name,feature,JSON.stringify(geometry));
            if(geometry.scrollWidth>geometry.width||errors.length)throw Error(feature+' 页面溢出或运行错误');
            if(feature==='health'){
              await panel.locator('.pk-health-table').waitFor();
              const healthDensity=await panel.locator('.pk-health-table').evaluate(el=>({tableTop:Math.round(el.getBoundingClientRect().top-el.closest('.pk-util').getBoundingClientRect().top),rows:el.querySelectorAll('tbody tr').length,rowHeight:Math.round(el.querySelector('tbody tr')?.getBoundingClientRect().height||0)}));
              console.log(name,'健康密度',JSON.stringify(healthDensity));
              if(healthDensity.tableTop>130||healthDensity.rowHeight>42)throw Error('健康表格不够紧凑');
              await panel.getByRole('button',{name:'新增',exact:true}).click();
              const sheet=panel.locator('dialog');await sheet.waitFor({state:'visible'});
              await sheet.screenshot({path:join(output,'health-editor-'+name+'.png')});
              await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'});
              await panel.getByRole('button',{name:'更多',exact:true}).click();
              await panel.getByRole('button',{name:'显示字段',exact:true}).click();
              await sheet.waitFor({state:'visible'});await sheet.getByRole('button',{name:'关闭',exact:true}).click();
              await panel.getByRole('button',{name:'更多',exact:true}).click();
              await panel.getByRole('button',{name:'管理',exact:true}).click();
              await sheet.getByRole('button',{name:'添加字段',exact:true}).waitFor();
              await sheet.getByRole('button',{name:'关闭',exact:true}).click();
            }else{
              const density=await panel.locator('.pk-bill-table').evaluate(el=>{const r=el.getBoundingClientRect(),panel=el.closest('.pk-util').getBoundingClientRect();return {tableTop:Math.round(r.top-panel.top),tableHeight:Math.round(r.height),rows:el.querySelectorAll('tbody tr').length,rowHeight:Math.round(el.querySelector('tbody tr')?.getBoundingClientRect().height||0)};});
              console.log(name,'账单密度',JSON.stringify(density));
              if(density.tableTop>130||density.rowHeight>40)throw Error('账单布局不够紧凑');
              await panel.getByRole('button',{name:'更多',exact:true}).click();
              await panel.getByRole('button',{name:'导入账单',exact:true}).click();
              await panel.locator('dialog').screenshot({path:join(output,'bill-import-'+name+'.png')});
              await panel.locator('dialog').getByRole('button',{name:'关闭',exact:true}).click();
              await panel.getByRole('button',{name:'更多',exact:true}).click();
              await panel.getByRole('button',{name:'分类规则',exact:true}).click();
              await panel.locator('dialog').waitFor({state:'visible'});
              await panel.locator('dialog').screenshot({path:join(output,'bill-rules-'+name+'.png')});
              await page.keyboard.press('Escape');await panel.locator('dialog').waitFor({state:'hidden'});
            }
            console.log(name,feature,'只读交互通过');
            if(errors.length)throw Error(feature+' 交互运行错误');
            await panel.getByRole('button',{name:'会话',exact:true}).waitFor({state:'visible'});
            await panel.getByRole('button',{name:'首页',exact:true}).click();
          }
          continue;
        }
        await home.screenshot({path:join(output,'home-'+name+'.png')});
        const homeWidth=await home.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
        await home.locator('[data-tool="file-manager"]').click();
        const files=page.locator('.pk-util');await files.locator('.pk-f').waitFor();await files.locator('fieldset:enabled').waitFor();
        const failed=files.locator('[role="alert"]');
        if(await failed.count())throw Error('文件页面出现业务错误；未读取或打印私人错误内容，请在UI检查。');
        await files.screenshot({path:join(output,'files-'+name+'.png')});
        const filesWidth=await files.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
        const result={home:homeWidth,files:filesWidth};
        if(withMusic){
          await files.getByRole('button',{name:'返回首页'}).click();
          await page.locator('.pk-home').waitFor();
          await page.locator('[data-tool="music"]').click();
          const music=page.locator('.pk-media[aria-label="音乐"]');await music.waitFor({state:'visible'});
          await music.locator('h1').filter({hasText:'音乐'}).waitFor();
          const musicFailed=music.locator('[role="alert"]');
          if(await musicFailed.count())throw Error('音乐页面出现业务错误；未读取或打印私人错误内容，请在UI检查。');
          const switchTabs=await music.locator('nav[aria-label="功能切换"]').count();
          const xiaoaiButton=await music.getByRole('button',{name:'小爱音箱',exact:true}).count();
          if(switchTabs||xiaoaiButton)throw Error('音乐页仍包含小爱切换入口。');
          const navChat=await music.getByRole('button',{name:'返回会话'}).count();
          const navHome=await music.getByRole('button',{name:'返回首页'}).count();
          if(!navChat||!navHome)throw Error('音乐页缺少返回会话或返回首页按钮。');
          await music.screenshot({path:join(output,'music-'+name+'.png')});
          result.music=await music.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
        }
        console.log(name,JSON.stringify({...result,pageErrors:errors}));
        if(homeWidth.scrollWidth>homeWidth.width||filesWidth.scrollWidth>filesWidth.width||(result.music&&result.music.scrollWidth>result.music.width)||errors.length)throw Error('发现页面溢出或运行时错误，请检查截图。');
      }finally{await context.close();}
    }
    console.log('截图目录：'+output);
  }finally{await browser.close();}
}
function redact(value,token){return String(value).replaceAll(token||'__missing__','[凭据已隐藏]').replace(/https?:\/\/[^\s]+/g,'[URL已隐藏]');}
if(process.argv.includes('--help'))console.log(help);
else await main().catch(error=>{console.error(redact(error.message,process.env.POCKET_PREVIEW_TOKEN));process.exitCode=1;});
