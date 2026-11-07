import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const base=process.argv[2];if(!base||!path.isAbsolute(base))throw Error('Pass inspected sidebar package directory');
const target=path.join(base,'lib/client.js'),slot='local.sidebar.before-workspaces';
const original=await readFile(target,'utf8');
if(original.includes(slot)){console.log('Sidebar bridge already present');process.exit(0);}
const pairs=[
 ['"sidebar.workspaces": {\n\t\t\t\t\tkind: "single",',`"${slot}": {kind:"list",scope:"root"},\n                "sidebar.workspaces": {\n\t\t\t\t\tkind: "single",`],
 ['(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.regionArea,',`renderSlot("${slot}", {wide}),\n                    (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.regionArea,`]
];
let updated=original;for(const [from,to] of pairs){const escaped=from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[\t\n]+/g,'\\s+');const pattern=new RegExp(escaped,'g');if([...updated.matchAll(pattern)].length!==1)throw Error('Unsupported sidebar version: '+from.slice(0,40));updated=updated.replace(pattern,()=>to);}
const backup=new URL('../../.local/terminal-touch-bridge/',import.meta.url);await mkdir(backup,{recursive:true,mode:0o700});
await writeFile(new URL('sidebar.client.js.original',backup),original,{flag:'wx',mode:0o600}).catch(async e=>{if(e.code!=='EEXIST')throw e;if(await readFile(new URL('sidebar.client.js.original',backup),'utf8')!==original)throw Error('Backup mismatch; refusing overwrite');});
await writeFile(target,updated);await writeFile(new URL('sidebar-package.txt',backup),base+'\n',{mode:0o600});console.log('Added one action slot immediately above workspaces; original sidebar retained');
