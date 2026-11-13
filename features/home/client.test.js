import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const chrome=await readFile(new URL('../shared/chrome.js',import.meta.url),'utf8');
const startup=await readFile(new URL('./startup.js',import.meta.url),'utf8');
const source=(await readFile(new URL('./client.js',import.meta.url),'utf8')).replace('/* HOME_STARTUP */',()=>startup).replace('/* KIT_CHROME */',()=>chrome);
function setup(){
 let definition;
 vm.runInNewContext(source,{window:{__ModuleLoader__:{load:value=>{definition=value;}}}});
 return definition.factory(name=>{assert.equal(name,'react');return {createElement:(type,props,...children)=>({type,props,children}),useState:value=>[value,()=>{}],useEffect:()=>{}};});
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
 assert.equal(registrations.length,3);
 assert.equal(registrations.filter(item=>item.meta.name==='sidebar.footer.action').length,1);
 assert.equal(registrations.filter(item=>item.meta.name==='conversation.session.header.utilities').length,1);
 assert.equal(registrations.some(item=>item.meta.name==='sidebar.panellist'),false);
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
test('toolbox stays Chinese and normalizes contributed cards by stable id',()=>{
 const plugin=setup(),registrations=[];let dictionaries,renderCard,opened=false;
 plugin.apply({effect:fn=>fn(),locale:{register:(_ns,value)=>{dictionaries=value;return()=>{};}},slots:{inject:(_key,fn)=>fn(),register:(meta,component)=>{registrations.push({meta,component});return()=>{};}},layout:{selectPanel(){},panelInfo:{getSnapshot:()=>({})}}});
 assert.equal(dictionaries.zh.title,'工具箱');assert.equal(dictionaries.en.title,'工具箱');
 const component=registrations.find(r=>r.meta.name==='main').component;
 const element=component({t:key=>dictionaries.en[key],renderSlot:(_key,props)=>{renderCard=props.renderCard;return [];}});element.type(element.props);
 const card=renderCard({id:'health',title:'Health',description:'English fallback',icon:'icon',onClick:()=>{opened=true;}});
 assert.equal(card.props['data-tool'],'health');assert.equal(card.props['aria-label'],'健康，记录家人的健康点滴');assert.equal(card.props.style['--tool-color'],'#d17b83');
 card.props.onClick();assert.equal(opened,true);
});
test('homepage no longer mounts connection status or its automatic probe',()=>{
  assert.doesNotMatch(source,/h\(ConnectionStatus\b/);
  const page=source.slice(source.indexOf('    function Page('),source.indexOf('    const headerCss'));
  assert.doesNotMatch(page,/useConnection|probeConnection|pk-home-connection/);
  assert.match(page,/'network-speed':\['连接测速'/);
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
 // Browser persistence contains only a non-sensitive panel id and toolbox open flag.
 assert.match(source,/KIT_LAST_KEY = 'pocket-kit\.last-panel\.v1'/);
 assert.doesNotMatch(source,/sessionStorage|document\.cookie|indexedDB/);
});
function storageSetup() {
  let definition;
  const data = new Map();
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { definition = value; } }, localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) } } });
  return { plugin: definition.factory(name => { assert.equal(name, 'react'); return { createElement: (type, props, ...children) => ({ type, props, children }) }; }), data };
}
test('toolbox launcher reopens the last normal page and falls back safely', () => {
  const { plugin, data } = storageSetup();
  const registrations = [], nav = [], listeners = [];
  let active = 'pocket-kit.home';
  plugin.apply({
    effect(fn) { fn(); },
    locale: { register: () => () => {} },
    slots: { inject: (_key, fn) => fn(), register: (meta, component) => { registrations.push({ meta, component }); return () => {}; } },
    layout: {
      selectPanel(id) {
        if (id && !['pocket-kit.home', 'pocket-kit.music'].includes(id)) throw new Error('panel not registered');
        active = id; nav.push(id);
      },
      panelInfo: {
        getSnapshot: () => ({ activePanelId: active }),
        subscribe(fn) { listeners.push(fn); return () => {}; },
      },
    },
  });
  const footer = registrations.find(item => item.meta.name === 'sidebar.footer.action');
  active = 'pocket-kit.music'; for (const listener of listeners) listener();
  assert.equal(data.get('pocket-kit.last-panel.v1'), 'pocket-kit.music');
  nav.length = 0; footer.component({}).props.open(); assert.deepEqual(nav, ['pocket-kit.music']);
  data.set('pocket-kit.last-panel.v1', 'pocket-kit.removed');
  nav.length = 0; footer.component({}).props.open(); assert.deepEqual(nav, ['pocket-kit.home']);
});
