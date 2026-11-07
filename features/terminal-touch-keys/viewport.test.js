import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardLift, followKeyboard } from './viewport.js';

test('keyboard occlusion lifts toolbar without accumulating its existing offset',()=>{
  assert.equal(keyboardLift(800,0,500),300);
  assert.equal(keyboardLift(500,300,500),300);
  assert.equal(keyboardLift(500,300,800),0);
});
test('already resized layouts and panes above keyboard stay put',()=>{
  assert.equal(keyboardLift(500,0,500),0);
  assert.equal(keyboardLift(380,0,500),0);
  assert.equal(keyboardLift(800,0,450+50),300);
});
test('pinch zoom and invalid viewport values do not act as a keyboard',()=>{
  assert.equal(keyboardLift(800,0,400,2),0);
  assert.equal(keyboardLift(800,0,NaN),0);
});
test('viewport listeners coalesce events, restore layout and clean up',()=>{
  const listeners=new Map(),frames=new Map();let serial=0,observed=false,disconnected=false;
  const target=prefix=>({addEventListener:(name,fn)=>listeners.set(prefix+name,fn),removeEventListener:name=>listeners.delete(prefix+name)});
  const viewport={...target('v:'),height:500,offsetTop:0,scale:1};
  const node={style:{marginBottom:''},dataset:{},getBoundingClientRect:()=>({width:320,height:76,bottom:800-(parseFloat(node.style.marginBottom)||0)})};
  const view={...target('w:'),visualViewport:viewport,innerHeight:800,requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){observed=true;}disconnect(){disconnected=true;}}};
  const flush=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
  const dispose=followKeyboard(node,view);assert.equal(observed,true);flush();assert.equal(node.style.marginBottom,'300px');
  listeners.get('v:resize')();listeners.get('v:scroll')();assert.equal(frames.size,1);flush();assert.equal(node.style.marginBottom,'300px');
  viewport.height=800;listeners.get('v:resize')();flush();assert.equal(node.style.marginBottom,'');
  listeners.get('v:resize')();dispose();assert.equal(frames.size,0);assert.equal(listeners.size,0);assert.equal(disconnected,true);assert.equal(node.dataset.keyboardLifted,undefined);
});
test('fallback uses window resize when visualViewport is unavailable',()=>{
  let pending;const node={style:{},dataset:{},getBoundingClientRect:()=>({width:320,height:70,bottom:700})};
  const view={innerHeight:450,requestAnimationFrame:fn=>(pending=fn,1),cancelAnimationFrame(){},addEventListener(){},removeEventListener(){}};
  const stop=followKeyboard(node,view);pending();assert.equal(node.style.marginBottom,'250px');stop();assert.equal(node.style.marginBottom,'');
});
