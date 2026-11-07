import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const source='/home/xuekai/project/DevStudioProject/allinone/data';
const target=new URL('../.local/data/',import.meta.url).pathname;
const hash=value=>createHash('sha256').update(value).digest('hex');
async function auditDirectory(name){let files=0,bytes=0;async function walk(relative=''){for(const entry of await readdir(path.join(source,name,relative))){const sub=path.join(relative,entry),from=path.join(source,name,sub),to=path.join(target,name,sub),info=await lstat(from);if(info.isDirectory())await walk(sub);else if(info.isFile()){const original=await readFile(from),copy=await readFile(to);if(hash(original)!==hash(copy))throw new Error(`${name}: copied file mismatch (name withheld)`);files++;bytes+=copy.length;}else throw new Error('Unsupported source entry');}}await walk();return {files,bytes,hashesMatch:true};}
const result={};
for(const name of ['bill-manager','file-manager'])result[name]=await auditDirectory(name);
const a=new DatabaseSync(path.join(source,'health','health.sqlite'),{readOnly:true}),b=new DatabaseSync(path.join(target,'health','health.sqlite'),{readOnly:true});
try{result.health={};for(const table of ['people','records','imports']){const rowsA=a.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),rowsB=b.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();if(hash(JSON.stringify(rowsA))!==hash(JSON.stringify(rowsB)))throw new Error('health row mismatch');result.health[table]=rowsB.length;}result.health.integrity=b.prepare('PRAGMA integrity_check').get().integrity_check;}finally{a.close();b.close();}
const original=JSON.parse(await readFile(path.join(source,'beijing-pass/config.json'),'utf8')),copy=JSON.parse(await readFile(path.join(target,'beijing-pass/config.json'),'utf8'));
if(hash(JSON.stringify(original.config))!==hash(JSON.stringify(copy.config)))throw new Error('credential configuration mismatch');
const automation=JSON.parse(await readFile(path.join(target,'beijing-pass/automation.json'),'utf8'));
result['beijing-pass']={credentialsPreserved:true,automationPaused:automation.enabled===false&&automation.migrationPaused===true,defaultsPreserved:hash(await readFile(path.join(source,'beijing-pass/apply-defaults.json')))===hash(await readFile(path.join(target,'beijing-pass/apply-defaults.json')))};
result.favorites={preserved:hash(await readFile(path.join(source,'favorites.json')))===hash(await readFile(path.join(target,'file-manager/favorites.json')))};
console.log(JSON.stringify(result,null,2));
