import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const script=await readFile(new URL('./bridge.mjs',import.meta.url),'utf8');
const legacy=String.raw`const data=key==="escape"?"\x1b":key==="interrupt"?"\x03":Object.hasOwn(arrows,key)?"\x1b"+(xterm.modes.applicationCursorKeysMode?"O":"[")+arrows[key]:undefined;`;
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'terminal-bridge-test-')),base=join(root,'native'),file=join(root,'features/terminal-touch-keys/bridge.mjs');
 await mkdir(join(root,'features/terminal-touch-keys'),{recursive:true});await mkdir(join(base,'lib'),{recursive:true});
 await writeFile(file,script);await writeFile(join(base,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-client-ui-sidebar-terminal',version:'fixture'}));
 await writeFile(join(base,'lib/client.js'),'const slot={children: {"local.terminal.touch.keys": {kind:"list",scope:"session"}}};');
 const original='// local.terminal.touch.keys\nfunction send(key){const live=current.current;const xterm=terminal.current;if(!xterm||!live.state.writable||live.state.phase!=="connected"||live.state.info?.state!=="running")return false;const arrows={};'+legacy+'xterm.input(data,true);}';
 const artifact=join(base,'lib/client.terminal.js');await writeFile(artifact,original);
 const run=(...args)=>spawnSync(process.execPath,[file,base,...args],{encoding:'utf8'});
 return {root,base,artifact,original,run};
}
test('bridge check is read-only, apply is idempotent and rollback is hash guarded',async()=>{
 const f=await fixture();let result=f.run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/CHECK ONLY/);assert.equal(await readFile(f.artifact,'utf8'),f.original);
 result=f.run('--apply');assert.equal(result.status,0,result.stderr);const patched=await readFile(f.artifact,'utf8');assert.match(patched,/vimQuit/);
 const dir=join(f.root,'.local/terminal-touch-bridge'),manifest=join(dir,(await readdir(dir)).find(name=>name.startsWith('manifest-')));
 result=f.run('--apply');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/no files written/);
 await writeFile(f.artifact,patched+'\n// later change');result=f.run('--rollback',manifest);assert.notEqual(result.status,0);assert.match(result.stderr,/Hash mismatch/);
 await writeFile(f.artifact,patched);result=f.run('--rollback',manifest);assert.equal(result.status,0,result.stderr);assert.equal(await readFile(f.artifact,'utf8'),f.original);
});
test('an already extended chunk still changes the entry revision, once only',async()=>{
 const f=await fixture(),entry=join(f.base,'lib/client.js'),originalEntry=await readFile(entry,'utf8');
 let result=f.run('--apply');assert.equal(result.status,0,result.stderr);
 const chunk=await readFile(f.artifact,'utf8'),digest=createHash('sha256').update(chunk).digest('hex');
 assert.ok((await readFile(entry,'utf8')).startsWith('// pocket-kit-terminal-touch-keys-chunk-sha256: '+digest+'\n'));
 // Reproduce the first deployment: new chunk bytes but unchanged entry bundle.
 await writeFile(entry,originalEntry);
 result=f.run('--check');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/CHECK ONLY: 1 file/);assert.equal(await readFile(entry,'utf8'),originalEntry);
 result=f.run('--apply');assert.equal(result.status,0,result.stderr);assert.equal(await readFile(f.artifact,'utf8'),chunk);
 assert.ok((await readFile(entry,'utf8')).startsWith('// pocket-kit-terminal-touch-keys-chunk-sha256: '+digest+'\n'));
 result=f.run('--apply');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/no files written/);
});
test('unknown mapping or syntax fails before modifying any target',async()=>{
 const f=await fixture();const unknown=f.original.replace(legacy,'const data="unknown";');await writeFile(f.artifact,unknown);
 let result=f.run('--apply');assert.notEqual(result.status,0);assert.equal(await readFile(f.artifact,'utf8'),unknown);
 await writeFile(f.artifact,f.original+'\n invalid {{{');result=f.run('--apply');assert.notEqual(result.status,0);assert.match(result.stderr,/Syntax validation failed/);
});
