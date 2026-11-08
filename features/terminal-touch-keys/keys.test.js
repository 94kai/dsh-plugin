import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const client=await readFile(new URL('./client.js',import.meta.url),'utf8');
// Exercise the bridge's generated function without requiring or changing a DSH installation.
const screen=await readFile(new URL('./bridge.mjs',import.meta.url),'utf8');
const start=screen.indexOf('sendKey: (key) => {');
assert.ok(start>0);
const functionSource=vm.runInNewContext('`'+screen.slice(start+'sendKey: '.length,screen.indexOf('\n                })',start)).trim()+'`');
function sender({enabled=true,application=false}={}){
 const inputs=[],live={visible:enabled,state:{writable:enabled,phase:'connected',info:{state:'running'}}};
 const terminal={current:{modes:{applicationCursorKeysMode:application},input:(data,user)=>inputs.push({data,user})}};
 return {inputs,live,terminal,send:vm.runInNewContext('('+functionSource+')',{current:{current:live},terminal})};
}
test('normal arrows, Esc and Ctrl+C use the original xterm input path',()=>{const s=sender();for(const key of ['up','down','right','left','escape','interrupt'])assert.equal(s.send(key),true);assert.deepEqual(s.inputs.map(i=>i.data),['\x1b[A','\x1b[B','\x1b[C','\x1b[D','\x1b','\x03']);assert.ok(s.inputs.every(i=>i.user===true));});
test('Tab and Vim quit use fixed safe encodings',()=>{const s=sender();assert.equal(s.send('tab'),true);assert.equal(s.send('vimQuit'),true);assert.deepEqual(s.inputs.map(i=>i.data),['\t','\x1b:q\r']);assert.ok(s.inputs.every(i=>i.user===true));assert.equal(s.send(':q!'),false);});
test('new keys reject ended processes, missing xterm and lost control',()=>{for(const key of ['tab','vimQuit']){const s=sender();s.live.state.info.state='exited';assert.equal(s.send(key),false);s.live.state.info.state='running';s.terminal.current=null;assert.equal(s.send(key),false);assert.equal(sender({enabled:false}).send(key),false);assert.equal(s.inputs.length,0);}});
test('new buttons expose explicit Chinese accessible labels',()=>{assert.match(client,/simple\('tab','Tab'\)/);assert.match(client,/simple\('vimQuit',':q'\)/);assert.match(client,/vimQuit:'Vim 退出：.*仅在 Vim 中使用'/);});
test('application cursor mode uses SS3 for terminal applications',()=>{const s=sender({application:true});s.send('up');assert.equal(s.inputs[0].data,'\x1bOA');});
test('live ownership, visibility and disconnected states reject stale clicks',()=>{const s=sender();s.live.state.writable=false;assert.equal(s.send('interrupt'),false);s.live.state.writable=true;s.live.visible=false;assert.equal(s.send('up'),false);s.live.visible=true;s.live.state.phase='disconnected';assert.equal(s.send('escape'),false);assert.equal(s.inputs.length,0);});
test('bridge exposes no arbitrary terminal input or command operation',()=>{const s=sender();assert.equal(s.send('rm -rf /'),false);assert.equal(s.send('constructor'),false);assert.equal(s.inputs.length,0);});
const tapSource=client.slice(client.indexOf('function tapKey('),client.indexOf('function Toolbar(')).trim();
test('single pad has an inactive center and four tap directions',()=>{const tap=vm.runInNewContext('('+tapSource+')');assert.equal(tap(0,0),null);assert.equal(tap(30,2),'right');assert.equal(tap(-30,2),'left');assert.equal(tap(1,-30),'up');assert.equal(tap(1,30),'down');assert.match(client,/const directionPad=h\('button'/);assert.doesNotMatch(client,/const arrow=/);});
test('recovery entry never depends on the removed dedicated renderer',()=>{assert.doesNotMatch(client,/local.terminal.dedicated.body|sessions.retain|DedicatedPage/);assert.match(client,/revealNativeTerminal/);assert.match(client,/role:error\?'alert':'status'/);});
test('terminal is exposed only through the toolbox, not the left sidebar',()=>{assert.doesNotMatch(client,/sidebar.panellist|ttk-launcher|native-terminal-launcher|local.sidebar.before-workspaces/);assert.match(client,/name:'local.pocket-kit.home.tool',id:PANEL/);});
const moveSource=client.slice(client.indexOf('function move(event)'),client.indexOf('function finish(')).trim();
function dragTest(dx,dy,enabled=true){const inputs=[],drag={current:{id:7,x:0,y:0,moved:false}};const move=vm.runInNewContext('('+moveSource+')',{enabled,drag,send:key=>inputs.push(key),Math});move({pointerId:7,clientX:dx,clientY:dy,preventDefault(){}});return {inputs,drag};}
test('gesture dead zone avoids accidental input; movement is bounded',()=>{assert.equal(dragTest(5,8).inputs.length,0);assert.deepEqual(dragTest(0,-45).inputs,['up','up']);assert.deepEqual(dragTest(500,2).inputs,['right','right','right','right']);assert.equal(dragTest(100,0,false).inputs.length,0);});
test('client stays additive without repeat timers or raw terminal transport',()=>{assert.match(client,/slots.inject\('local.terminal.touch.keys'/);assert.doesNotMatch(client,/setInterval|setTimeout|document\.querySelector|webTerminals/);assert.match(client,/onPointerCancel/);assert.match(client,/onLostPointerCapture/);});

test('compact toolbar contains only keys and retains accessible names',()=>{const toolbar=client.slice(client.indexOf('function Toolbar('),client.indexOf('const PANEL='));assert.doesNotMatch(toolbar,/ttk-hint|setNotice|notice\|\|/);assert.match(client,/min-height:36px;height:36px/);assert.match(client,/width:44px;height:36px/);assert.match(toolbar,/'aria-label':t\('pad'\)/);assert.match(toolbar,/disabled:!enabled/);});

test('toolbox terminal card retains its native panel',()=>{assert.match(client,/name:'local.pocket-kit.home.tool',id:PANEL/);assert.match(client,/onClick:\(\)=>ctx.layout.selectPanel\(PANEL\)/);assert.doesNotMatch(client,/startFreshTerminal|runTerminalStartup|TERMINAL_STARTUP/);});
