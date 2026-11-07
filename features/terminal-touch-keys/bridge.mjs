// Compatibility bridge for the installed DSH terminal bundle. No user sessions are accessed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const base=process.argv[2];
if(!base||!path.isAbsolute(base))throw Error('Pass the inspected absolute terminal package directory');
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
                        const data=key==="escape"?"\\x1b":key==="interrupt"?"\\x03":Object.hasOwn(arrows,key)?"\\x1b"+(xterm.modes.applicationCursorKeysMode?"O":"[")+arrows[key]:undefined;
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
await mkdir(backupDir,{recursive:true,mode:0o700});
const plans=[];
for(const [name,pairs] of Object.entries(replacements)){
 const target=path.join(base,'lib',name),original=await readFile(target,'utf8');
 if(original.includes(slot)){console.log(name+': bridge already present');continue;}
 let updated=original;
 for(const [from,to] of pairs){if(updated.split(from).length!==2)throw Error('Unsupported DSH terminal artifact: '+name);updated=updated.replace(from,to);}
 plans.push({name,target,original,updated});
}
for(const p of plans){
 const backup=new URL(p.name+'.original',backupDir);
 await writeFile(backup,p.original,{flag:'wx',mode:0o600}).catch(async error=>{if(error.code!=='EEXIST')throw error;if(hash(await readFile(backup,'utf8'))!==hash(p.original))throw Error('Backup belongs to another DSH build; refusing overwrite');});
 await writeFile(p.target,p.updated);
 console.log(p.name+': rebuilt with additive terminal-key bridge; original sha256 '+hash(p.original));
}
await writeFile(new URL('installed-package.txt',backupDir),base+'\n',{mode:0o600});
