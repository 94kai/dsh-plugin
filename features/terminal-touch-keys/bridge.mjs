// Compatibility bridge for the installed DSH terminal bundle. No user sessions are accessed.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
const requested=process.argv[2], mode=process.argv[3]||'--check';
if(!requested||!path.isAbsolute(requested)||!['--check','--apply','--rollback'].includes(mode))throw Error('Usage: node bridge.mjs /absolute/terminal-package [--check|--apply|--rollback manifest.json]');
const base=await realpath(requested);
const pkg=JSON.parse(await readFile(path.join(base,'package.json'),'utf8'));
if(pkg.name!=='@deepseek-ai/dsh-client-ui-sidebar-terminal')throw Error('Not the native terminal package');
const backupDir=new URL('../../.local/terminal-touch-bridge/',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const slot='local.terminal.touch.keys';
const replacements={
 'client.js':[[ '}, LazyTerminalBody)), "ui-sidebar-terminal.body");', '}, LazyTerminalBody)), "ui-sidebar-terminal.body");' ]],
 'client.terminal.js':[
  ['function TerminalBody({ useTabInfo, useTerminal, useTheme, view, t }) {','function TerminalBody({ useTabInfo, useTerminal, useTheme, view, t, renderSlot }) {'],
  ['\t\t\t\t\t\tvisible: tab.visible,','\t\t\t\t\t\trenderSlot,\n\t\t\t\t\t\tvisible: tab.visible,'],
  ['function TerminalScreen({ state, model, visible, label, theme }) {','function TerminalScreen({ state, model, visible, label, theme, renderSlot }) {'],
  ['return (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: terminal_module_css_default.screen,\n\t\t\t\tref: element\n\t\t\t});',`return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, {children: [
                (0, react_jsx_runtime.jsx)("div", {className: terminal_module_css_default.screen, ref: element}),
                renderSlot?.("${slot}", {
                    enabled: visible && state.writable && state.phase === "connected" && state.info?.state === "running",
                    sendKey: (key) => {
                        const live=current.current;
                        const xterm=terminal.current;
                        if(!xterm || !live.visible || !live.state.writable || live.state.phase!=="connected" || live.state.info?.state!=="running")return false;
                        const arrows={up:"A",down:"B",right:"C",left:"D"};
                        const data=key==="escape"?"\\x1b":key==="interrupt"?"\\x03":key==="tab"?"\\t":key==="vimQuit"?"\\x1b:q\\r":Object.hasOwn(arrows,key)?"\\x1b"+(xterm.modes.applicationCursorKeysMode?"O":"[")+arrows[key]:undefined;
                        if(data===undefined)return false;
                        xterm.input(data,true);
                        return true;
                    }
                })
            ]});`]
 ]
};
// Declare only a new child seat; leave original body registration and all lifecycle owners intact.
replacements['client.js']=[['name: "sidebar.right.pane.tab",\n\t\t\t\tkey: id,',`name: "sidebar.right.pane.tab",\n                children: {"${slot}": {kind:"list",scope:"session"}},\n\t\t\t\tkey: id,`]];
function replaceOnce(source,from,to,name){
 if(source.split(from).length!==2)throw Error('Unsupported DSH terminal artifact: '+name+'; stop and inspect the new version');
 return source.replace(from,to);
}
function syntax(source){
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});
 if(result.status!==0)throw Error('Syntax validation failed; no target written: '+result.stderr);
}
const names=Object.keys(replacements);
async function targetFor(name){
 if(!names.includes(name))throw Error('Unexpected artifact name');
 const target=await realpath(path.join(base,'lib',name));
 if(target!==path.join(base,'lib',name))throw Error('Refusing redirected artifact: '+target);
 return target;
}
if(mode==='--rollback'){
 const manifestPath=process.argv[4];
 if(!manifestPath||!path.isAbsolute(manifestPath))throw Error('Pass the absolute backup manifest path');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(manifest.base!==base||manifest.version!==pkg.version)throw Error('Backup belongs to another installation/version');
 const restore=[];
 if(!Array.isArray(manifest.files)||manifest.files.length>names.length||new Set(manifest.files.map(e=>e.name)).size!==manifest.files.length)throw Error('Invalid backup manifest');
 for(const entry of manifest.files){
  if(!/^[a-f0-9]{64}$/.test(entry.originalHash)||!/^[a-f0-9]{64}$/.test(entry.patchedHash))throw Error('Invalid backup hash');
  const target=await targetFor(entry.name), current=await readFile(target,'utf8');
  const original=await readFile(new URL(entry.originalHash+'.original',backupDir),'utf8');
  if(hash(current)!==entry.patchedHash||hash(original)!==entry.originalHash)throw Error('Hash mismatch; refusing rollback');
  syntax(original);restore.push({target,original});
 }
 for(const item of restore){await writeFile(item.target,item.original);console.log('Restored '+item.target);}
 process.exit(0);
}
const plans=[];
for(const [name,pairs] of Object.entries(replacements)){
 const target=await targetFor(name),original=await readFile(target,'utf8');
 let updated=original;
 if(original.includes(slot)){
  if(name==='client.terminal.js'){
   const legacy=String.raw`const data=key==="escape"?"\x1b":key==="interrupt"?"\x03":Object.hasOwn(arrows,key)?"\x1b"+(xterm.modes.applicationCursorKeysMode?"O":"[")+arrows[key]:undefined;`;
   const extended=legacy.replace(':Object.hasOwn',String.raw`:key==="tab"?"\t":key==="vimQuit"?"\x1b:q\r":Object.hasOwn`);
   if(!original.includes(extended))updated=replaceOnce(original,legacy,extended,name);
   // Refuse a partial or foreign bridge even when the slot name exists.
   for(const guard of ['const live=current.current;','!live.state.writable','live.state.phase!=="connected"','live.state.info?.state!=="running"','xterm.input(data,true);'])if(!updated.includes(guard))throw Error('Unknown bridge implementation: '+guard);
  }else if(!original.includes('children: {"'+slot+'": {kind:"list",scope:"session"}}'))throw Error('Unknown slot declaration');
 }else{
  for(const [from,to] of pairs)updated=replaceOnce(updated,from,to,name);
 }
 syntax(updated);
 if(updated!==original)plans.push({name,target,original,updated});
 console.log(name+': '+(updated===original?'already current':'compatible, change planned')+'; '+target);
}
// DSH revisions package-local chunks by the entry bundle, not by chunk bytes.
// Include the chunk hash in the entry so server and browser immutable caches move together.
const chunkPlan=plans.find(p=>p.name==='client.terminal.js');
const chunkSource=chunkPlan?.updated??await readFile(await targetFor('client.terminal.js'),'utf8');
let entryPlan=plans.find(p=>p.name==='client.js');
const entryTarget=await targetFor('client.js');
const entryOriginal=entryPlan?.original??await readFile(entryTarget,'utf8');
const entrySource=entryPlan?.updated??entryOriginal;
const revisionMarker='// pocket-kit-terminal-touch-keys-chunk-sha256: '+hash(chunkSource)+'\n';
const revisedEntry=revisionMarker+entrySource.replace(/^\/\/ pocket-kit-terminal-touch-keys-chunk-sha256: [a-f0-9]{64}\r?\n/,'');
syntax(revisedEntry);
if(revisedEntry!==entrySource){
 if(entryPlan)entryPlan.updated=revisedEntry;
 else plans.push({name:'client.js',target:entryTarget,original:entryOriginal,updated:revisedEntry});
 console.log('client.js: chunk cache revision update planned');
}
if(mode==='--check'){console.log('CHECK ONLY: '+plans.length+' file(s); no files written. Package '+pkg.version);process.exit(0);}
if(!plans.length){console.log('Already current; no files written.');process.exit(0);}
await mkdir(backupDir,{recursive:true,mode:0o700});
const manifest={base,version:pkg.version,createdAt:new Date().toISOString(),files:[]};
for(const p of plans){
 const originalHash=hash(p.original),patchedHash=hash(p.updated),backup=new URL(originalHash+'.original',backupDir);
 await writeFile(backup,p.original,{flag:'wx',mode:0o600}).catch(async error=>{if(error.code!=='EEXIST')throw error;if(hash(await readFile(backup,'utf8'))!==originalHash)throw Error('Backup hash mismatch');});
 manifest.files.push({name:p.name,originalHash,patchedHash});
}
const manifestFile=new URL('manifest-'+Date.now()+'.json',backupDir);
await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
console.log('Rollback manifest: '+manifestFile.pathname);
for(const p of plans){
 if(hash(await readFile(p.target,'utf8'))!==hash(p.original))throw Error('Artifact changed during patch; stop');
 await writeFile(p.target,p.updated);
 console.log('Patched '+p.target+'; sha256 '+hash(p.updated));
}
