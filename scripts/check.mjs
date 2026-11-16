import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory())await walk(path);else if(/\.(js|mjs)$/.test(path))files.push(path);}}
for(const dir of ['src','scripts','tests'])await walk(dir);
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status)throw new Error(r.stderr);}
const html=await readFile('index.html','utf8');
if(!html.includes('connect-src \'none\''))throw new Error('Little Life must not send life data over the network.');
for(const ref of [...html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)].map(m=>m[1]))await readFile(ref);
console.log(`Syntax checked ${files.length} JavaScript files; local assets and no-network CSP checked.`);
