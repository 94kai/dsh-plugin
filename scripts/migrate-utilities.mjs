// Explicit, non-destructive migration. Never print private values or source filenames.
import { access, mkdir, copyFile, readdir, lstat, chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
const source = path.resolve(process.argv[2] || '/home/xuekai/project/DevStudioProject/allinone');
const target = new URL('../.local/data/', import.meta.url).pathname;
const exists = file => access(file).then(()=>true,()=>false);
async function copyTree(from,to) {
  const info=await lstat(from);
  if(info.isSymbolicLink()) throw new Error('Migration refuses symlinks');
  if(info.isDirectory()){await mkdir(to,{recursive:true,mode:0o700});for(const name of await readdir(from))await copyTree(path.join(from,name),path.join(to,name));}
  else {await copyFile(from,to,1);await chmod(to,0o600);}
}
await mkdir(target,{recursive:true,mode:0o700});
for(const name of ['health','bill-manager','beijing-pass','file-manager']) {
  const from=path.join(source,'data',name),to=path.join(target,name);
  if(await exists(to)){console.log(`${name}: target exists; skipped, no overwrite`);continue;}
  if(!await exists(from)){console.log(`${name}: source absent`);continue;}
  if(name==='health'){
    await mkdir(to,{mode:0o700});
    for(const entry of await readdir(from))if(!/^health\.sqlite(?:-wal|-shm)?$/.test(entry))await copyTree(path.join(from,entry),path.join(to,entry));
    const db=new DatabaseSync(path.join(from,'health.sqlite'),{readOnly:true});
    try {await backup(db,path.join(to,'health.sqlite'));}finally{db.close();}
    await chmod(path.join(to,'health.sqlite'),0o600);
    const check=new DatabaseSync(path.join(to,'health.sqlite'),{readOnly:true});
    try {if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed');console.log('health: consistent snapshot verified; people='+check.prepare('SELECT count(*) AS n FROM people').get().n+'; records='+check.prepare('SELECT count(*) AS n FROM records').get().n);}finally{check.close();}
  }else{
    await copyTree(from,to);
    if(name==='beijing-pass'){
      for(const file of ['config.json','automation.json']) {
        const p=path.join(to,file);if(!await exists(p))continue;
        await copyFile(p,path.join(to,`${file}.migration-backup`),1);
        const value=JSON.parse(await readFile(p,'utf8'));
        if(file==='automation.json'){value.enabled=false;value.migrationPaused=true;}
        else if(value.monitor?.status==='active')value.monitor.status='migration-paused';
        await writeFile(p,JSON.stringify(value,null,2)+'\n',{mode:0o600});
      }
    }
    console.log(`${name}: copied privately; source unchanged`);
  }
}
const favorites=path.join(source,'data','favorites.json');
if(await exists(favorites)&&!await exists(path.join(target,'file-manager','favorites.json')))await copyTree(favorites,path.join(target,'file-manager','favorites.json'));
// Legacy bill defaults were hardcoded in source; retain privately, not in distributable code.
const accounts=path.join(target,'bill-manager','accounts.json');
if(!await exists(accounts)){
  const code=await readFile(path.join(source,'modules/bill-manager/index.mjs'),'utf8');
  const values=[...code.matchAll(/'收支账户': '([^']+)'/g)].map(match=>match[1]);
  await writeFile(accounts,JSON.stringify({wechat:values[0]||'微信钱包',alipay:values[1]||'支付宝',cmb:values[2]||'招商银行'},null,2)+'\n',{flag:'wx',mode:0o600});
}
const settings=path.join(target,'terminal.json');
if(!await exists(settings)){
  let text='';try{text=await readFile(path.join(source,'.env'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  const env={};for(const line of text.split(/\r?\n/)){const m=/^\s*(?:export\s+)?(TERMINAL_ENABLED|TERMINAL_CWD|TERMINAL_MAX_SESSIONS)\s*=\s*(.*?)\s*$/.exec(line);if(m)env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2');}
  await writeFile(settings,JSON.stringify({enabled:env.TERMINAL_ENABLED==='true',cwd:env.TERMINAL_CWD||source,maxSessions:Math.max(1,Math.min(20,Number(env.TERMINAL_MAX_SESSIONS)||8)),prefix:'allinone-'},null,2)+'\n',{flag:'wx',mode:0o600});
}
console.log('favorites, account mappings and terminal settings preserved; existing tmux sessions untouched');
