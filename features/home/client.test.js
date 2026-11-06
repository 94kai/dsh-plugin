import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./client.js',import.meta.url),'utf8')).replace('/* HOME_STARTUP */',()=> 'function mountHomeStartup(){return ()=>{};}');
function setup(){
 let definition;
 vm.runInNewContext(source,{window:{__ModuleLoader__:{load:value=>{definition=value;}}}});
 return definition.factory(name=>{assert.equal(name,'react');return {createElement:(type,props,...children)=>({type,props,children})};});
}
test('homepage declares tool slot and exactly one footer entry, never a top sidebar entry',()=>{
 const plugin=setup(),registrations=[],disposers=[],nav=[];
 let selected='pocket-kit.home';
 plugin.apply({
  effect:fn=>{const dispose=fn();if(dispose)disposers.push(dispose);},
  locale:{register:()=>()=>{}},
  slots:{inject:(_key,fn)=>fn(),register:(meta,component)=>{registrations.push({meta,component});return()=>{};}},
  layout:{selectPanel:id=>nav.push(id),panelInfo:{getSnapshot:()=>({activePanelId:selected})}}
 });
 assert.equal(registrations.length,2);
 const main=registrations.find(item=>item.meta.name==='main');
 assert.equal(main.meta.key,'pocket-kit.home');
 assert.equal(main.meta.children['local.pocket-kit.home.tool'].scope,'root');
 const footer=registrations.find(item=>item.meta.name==='sidebar.footer.action');
 assert.equal(footer.meta.id,'pocket-kit-home');
 for (const wide of [true,false]) {
   const element=footer.component({wide,t:key=>key==='title'?'首页':key});
   const tree=element.type(element.props);
   const button=tree.children.find(child=>child?.type==='button');
   assert.equal(button.props['aria-label'],'首页');
   assert.equal(button.props.type,'button');
 }

 footer.component({}).props.open();assert.deepEqual(nav,['pocket-kit.home']);
 nav.length=0;main.component({}).props.chat();assert.deepEqual(nav,[null]);
 nav.length=0;main.component({}).props.open('shortcuts');assert.deepEqual(nav,['shortcuts']);
 nav.length=0;disposers.at(-1)();assert.deepEqual(nav,[null]);
 selected='another-panel';nav.length=0;disposers.at(-1)();assert.deepEqual(nav,[]);
});
test('home keeps mobile, private-link and safe external navigation constraints',()=>{
 assert.match(source,/44px/);assert.match(source,/safe-area-inset-bottom/);
 assert.match(source,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(source,/max-width:360px/);
 assert.match(source,/noopener noreferrer/);
 assert.match(source,/AbortController/);
 assert.match(source,/credentials:'same-origin'/);
 assert.match(source,/item\.iconDataUrl/);
 assert.doesNotMatch(source,/item\.notes/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
});
