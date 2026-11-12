import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./startup.js',import.meta.url),'utf8');
function fixture({href='https://example.test/',base='https://example.test/',explicitBase=false,active=null,restored=false,storage=new Map()}={}){
 const listeners=new Set();
 const window={location:{href},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}},document={baseURI:base,querySelector:()=>explicitBase?{}:null};
 const global=vm.createContext({window,document,URL,Symbol});vm.runInContext(source,global);
 const calls=[],cleanups=[];
 const select=value=>{active=value;for(const listener of listeners)listener();};
 const ctx={layout:{panelInfo:{getSnapshot:()=>({activePanelId:active}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}},selectPanel:id=>{calls.push(id);select(id);}},effect:fn=>cleanups.push(fn()),get(){if(restored)throw new Error('Startup must not read sessions');}};
 return {global,window,document,ctx,calls,cleanups,storage,listeners,mount:()=>global.mountHomeStartup(ctx),track:()=>global.trackHomeOpen(ctx),select};
}
test('bare document entry selects home once without changing session services',()=>{
 const f=fixture({restored:true});f.mount();assert.deepEqual(f.calls,['pocket-kit.home']);
 assert.equal(f.window[Symbol.for('pocket-kit.home.startup.v1')].reason,'selected');
});
test('HMR and main slot redeclaration never steal a later Conversation',()=>{
 const f=fixture();f.mount();for(const dispose of f.cleanups)dispose();f.select(null);
 vm.runInContext(source,f.global);f.mount();assert.deepEqual(f.calls,['pocket-kit.home']);
});
test('new document reload gets a fresh opportunity even with same test window',()=>{
 const f=fixture();f.mount();f.select(null);f.global.document={baseURI:'https://example.test/',querySelector:()=>null};f.mount();assert.equal(f.calls.length,2);
});
test('explicit query, hash and route deep links are preserved without reading values',()=>{
 for(const href of ['https://example.test/?session=fixture','https://example.test/#session/fixture','https://example.test/sessions/fixture','https://example.test/sessions/fixture/']){
  const f=fixture({href,base:href});f.mount();assert.deepEqual(f.calls,[]);
  f.window.location.href='https://example.test/';f.mount();assert.deepEqual(f.calls,[],'skip consumes the document opportunity');
 }
});
test('explicit mount base supports subpath deployments but not nested paths',()=>{
 const f=fixture({href:'https://example.test/dsh/',base:'https://example.test/dsh/',explicitBase:true});f.mount();assert.equal(f.calls.length,1);
 const deep=fixture({href:'https://example.test/dsh/sessions/fixture',base:'https://example.test/dsh/',explicitBase:true});deep.mount();assert.equal(deep.calls.length,0);
});
test('existing global panel is preserved and skip persists through unloading',()=>{
 const f=fixture({active:'plugins'});f.mount();assert.equal(f.calls.length,0);f.select(null);for(const dispose of f.cleanups)dispose();f.mount();assert.equal(f.calls.length,0);
});
test('selection failure is contained and does not retry after user interaction',()=>{
 const f=fixture();let attempts=0;f.ctx.layout.selectPanel=()=>{attempts++;throw new Error('main unavailable');};assert.doesNotThrow(()=>f.mount());f.mount();assert.equal(attempts,1);
});
test('closing toolbox persists across fresh entries; reopening enables home again',()=>{
 const f=fixture();const stop=f.track();f.mount();
 assert.equal(f.storage.get('pocket-kit.home.open.v1'),'true');
 f.select(null);assert.equal(f.storage.get('pocket-kit.home.open.v1'),'false');
 const next=fixture({storage:f.storage});next.track();next.mount();assert.deepEqual(next.calls,[]);
 assert.equal(next.window[Symbol.for('pocket-kit.home.startup.v1')].reason,'remembered-closed');
 next.select('pocket-kit.home');
 const reopened=fixture({storage:f.storage});reopened.mount();assert.deepEqual(reopened.calls,['pocket-kit.home']);
 stop();assert.equal(f.listeners.size,0);
});
test('tool pages remain open and unrelated panels close the toolbox memory',()=>{
 const f=fixture();vm.runInContext("const KIT_PANELS = new Set(['pocket-kit.home','pocket-kit.music']);",f.global);
 const stop=f.track();f.select('pocket-kit.music');assert.equal(f.storage.get('pocket-kit.home.open.v1'),'true');
 f.select('plugins');assert.equal(f.storage.get('pocket-kit.home.open.v1'),'false');
 stop();f.select('pocket-kit.home');assert.equal(f.storage.get('pocket-kit.home.open.v1'),'false');
});
test('tracking initial Conversation does not overwrite saved open state and survives HMR',()=>{
 const f=fixture({storage:new Map([['pocket-kit.home.open.v1','true']])});
 const stop=f.track();assert.equal(f.storage.get('pocket-kit.home.open.v1'),'true');f.mount();stop();
 vm.runInContext(source,f.global);f.track();f.select(null);f.mount();
 assert.equal(f.storage.get('pocket-kit.home.open.v1'),'false');assert.equal(f.calls.length,1);
});
test('unavailable storage does not break startup or panel navigation',()=>{
 const f=fixture();Object.defineProperty(f.window,'localStorage',{get(){throw new Error('blocked');}});
 f.track();assert.doesNotThrow(()=>f.mount());assert.doesNotThrow(()=>f.select(null));assert.equal(f.calls.length,1);
});
test('non-browser test contexts are inert',()=>{
 const global=vm.createContext({URL,Symbol});vm.runInContext(source,global);assert.equal(typeof global.mountHomeStartup({}), 'function');
});
