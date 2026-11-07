// Read-only real-GUI screenshots. No persisted credentials or replacement server.
import {createRequire} from 'node:module';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const help=`工具箱实页截图（只浏览，不修改业务数据）
  node scripts/preview-ui.mjs          # 手机390px：首页、文件页
  node scripts/preview-ui.mjs --all    # 桌面、320/375/390/430px手机、390px暗色
环境变量：
  POCKET_PREVIEW_TOKEN                用户临时授权的登录token（必填，不写入文件）
  POCKET_BROWSER_TOOLS                包含node_modules/playwright的目录（可选）
默认预览地址：https://dsh.xuekai.top:8888/
默认截图位置：系统临时目录下独立的pocket-kit-preview-*目录
`;

function loadPlaywright(){
  const locations=process.env.POCKET_BROWSER_TOOLS?[resolve(process.env.POCKET_BROWSER_TOOLS)]:[resolve('.'),'/tmp/dsh-outing-browser-test'];
  for(const location of locations){
    try{return createRequire(join(location,'package.json'))('playwright');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
  }
  throw Error('找不到Playwright。请先阅读docs/browser-preview.md；不要重复下载已存在的浏览器。');
}

async function main(){
  const token=process.env.POCKET_PREVIEW_TOKEN;
  if(!token)throw Error('缺少POCKET_PREVIEW_TOKEN。请向用户取得临时登录授权；不要把凭据写入代码。');
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
  const output=await mkdtemp(join(tmpdir(),'pocket-kit-preview-'));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    for(const [name,options] of profiles){
      const context=await browser.newContext(options);
      try{
        const page=await context.newPage(),errors=[];
        page.on('pageerror',error=>errors.push(redact(error.message,token)));
        const url=new URL('https://dsh.xuekai.top:8888/');url.searchParams.set('token',token);
        const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
        if(!response?.ok())throw Error('GUI登录失败，HTTP '+response?.status()+'；请确认授权有效。');
        await page.locator('.pk-home, .pk-home-launcher').first().waitFor({state:'attached',timeout:30000});
        // Our own launcher may be inside the closed mobile sidebar. Invoke its
        // existing navigation handler without opening or reading session views.
        if(!await page.locator('.pk-home').count())await page.locator('.pk-home-launcher').first().evaluate(button=>button.click());
        const home=page.locator('.pk-home');await home.locator('.pk-home-tool').first().waitFor();
        const uncovered=await home.evaluate(el=>{const r=el.getBoundingClientRect();const hit=document.elementFromPoint(Math.min(innerWidth-16,r.right-16),Math.max(64,r.top+36));return !!hit?.closest('.pk-home');});
        if(!uncovered)throw Error('工具箱被宿主侧栏或浮层遮挡；请先关闭遮挡，再截图，不能按遮挡截图验收。');
        await home.screenshot({path:join(output,'home-'+name+'.png')});
        const homeWidth=await home.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
        await home.locator('[data-tool="file-manager"]').click();
        const files=page.locator('.pk-util');await files.locator('.pk-f').waitFor();await files.locator('fieldset:enabled').waitFor();
        const failed=files.locator('[role="alert"]');
        if(await failed.count())throw Error('文件页面出现业务错误；未读取或打印私人错误内容，请在UI检查。');
        await files.screenshot({path:join(output,'files-'+name+'.png')});
        const filesWidth=await files.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));
        console.log(name,JSON.stringify({home:homeWidth,files:filesWidth,pageErrors:errors}));
        if(homeWidth.scrollWidth>homeWidth.width||filesWidth.scrollWidth>filesWidth.width||errors.length)throw Error('发现页面溢出或运行时错误，请检查截图。');
      }finally{await context.close();}
    }
    console.log('截图目录：'+output);
  }finally{await browser.close();}
}
function redact(value,token){return String(value).replaceAll(token||'__missing__','[凭据已隐藏]').replace(/https?:\/\/[^\s]+/g,'[URL已隐藏]');}
if(process.argv.includes('--help'))console.log(help);
else await main().catch(error=>{console.error(redact(error.message,process.env.POCKET_PREVIEW_TOKEN));process.exitCode=1;});
