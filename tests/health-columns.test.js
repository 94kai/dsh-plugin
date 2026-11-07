import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import {HealthModule} from '../features/health/index.mjs';
import {nodeHandlerResponse} from '../lib/http-adapter.mjs';


test('custom health fields are isolated, revision protected, persistent and exported',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pocket-health-fields-'));
  let module=new HealthModule({dataDir:dir});await module.initialize();
  t.after(async()=>{module.shutdown();assert.ok(path.isAbsolute(dir)&&path.basename(dir).startsWith('pocket-health-fields-'));await rm(dir,{recursive:true,force:true});});
  const raw=(route,method='GET',body)=>nodeHandlerResponse(module.handle.bind(module),{url:new URL('http://internal/api/modules/health'+route),method,body});
  const request=async(...args)=>{const r=await raw(...args);return {status:r.status,data:await r.json()};};
  const a=(await request('/people','POST',{name:'测试甲'})).data.person,b=(await request('/people','POST',{name:'测试乙'})).data.person;
  assert.equal((await request('/people')).status,200);
  assert.equal((await request('/people')).data.people.length,2);
  const base='/people/'+a.id;
  let result=await request(base+'/columns','POST',{label:'静息心率（次/分）',revision:a.revision});assert.equal(result.status,201);
  const field=result.data.column,revision=result.data.person.revision;
  assert.ok(result.data.person.visible.includes(field.id));
  assert.equal((await request(base+'/columns','POST',{label:'另一个指标',revision:a.revision})).status,409);
  assert.equal((await request(base+'/columns','POST',{label:field.label,revision})).status,409);
  for(const label of ['', 'x'.repeat(81),'a\u0000b'])assert.equal((await request(base+'/columns','POST',{label,revision})).status,400);
  assert.ok(!(await request(base+'/columns')).data.columns.some(c=>c.label==='另一个指标'));
  assert.ok(!(await request('/people/'+b.id+'/columns')).data.columns.some(c=>c.id===field.id));
  assert.equal((await request('/people/'+b.id+'/records','POST',{cells:{c0:'2026-11-08',[field.id]:60}})).status,400);
  assert.equal((await request(base+'/records','POST',{cells:{c0:'2026-11-08',unknown:1}})).status,400);
  assert.equal((await request(base+'/records','POST',{cells:{[field.id]:60}})).status,400);
  result=await request(base+'/records','POST',{cells:{c0:'2026-11-08',c2:'保留值',[field.id]:60}});assert.equal(result.status,201);
  const recordId=result.data.id;let row=(await request(base+'/records/'+recordId)).data.record;
  assert.equal((await request(base+'/records/'+recordId,'PUT',{revision:row.revision,cells:{...row.cells,[field.id]:65}})).status,200);
  assert.equal((await request(base+'/records/'+recordId,'PUT',{revision:row.revision,cells:row.cells})).status,409);
  module.shutdown();module=new HealthModule({dataDir:dir});await module.initialize();
  result=await request(base);assert.ok(result.data.columns.some(c=>c.id===field.id));assert.equal(result.data.records[0].cells[field.id],65);assert.equal(result.data.records[0].cells.c2,'保留值');
  const response=await raw(base+'/export?scope=all');assert.equal(response.status,200);
  const book=XLSX.read(Buffer.from(await response.arrayBuffer()),{type:'buffer'}),rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});assert.equal(rows[1][rows[0].indexOf(field.label)],65);
});

test('health Agent help exposes additive fields and full-replacement record contract',async()=>{
  // Static help contract only; do not initialize the production Host in tests.
  const source=await readFile(new URL('../features/health/host.mjs',import.meta.url),'utf8');
  assert.match(source,/\['POST','\/people\/<id>\/columns'/);assert.match(source,/完整替换/);
});
