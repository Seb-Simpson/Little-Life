import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyState, parseImport, applyImport, validateState } from '../src/model.js';
for(const file of ['socs.demo.json','teams.demo.json'])test(`documented example ${file} imports and replays without duplicates`,async()=>{
  const parsed=parseImport(await readFile(new URL(`../examples/${file}`,import.meta.url),'utf8'));
  const first=applyImport(emptyState(),parsed,'2026-11-16T12:00:00Z');
  const second=applyImport(first.state,parsed,'2026-11-16T13:00:00Z');
  assert.equal(second.summary.added,0);assert.equal(second.summary.unchanged,parsed.items.length);assert.equal(validateState(second.state).items.length,parsed.items.length);assert.ok(second.state.items.every(i=>i.title.startsWith('DEMO')));
});
