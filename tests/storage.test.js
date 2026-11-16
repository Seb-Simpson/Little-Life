import test from 'node:test';
import assert from 'node:assert/strict';
import { repository, storageKey } from '../src/storage.js';
import { emptyState, normalizeItem } from '../src/model.js';
import { demoState } from '../src/demo.js';
function memoryStorage() {const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};}
function personal() {const state=emptyState();state.items=[normalizeItem({externalId:'journal-1',type:'journal',title:'A good day',notes:'Something worth remembering.',date:'2026-11-16',updatedAt:'2026-11-16T12:00:00Z'},'manual','user-entered')];return state;}
test('saved entries and source metadata survive a fresh repository instance',()=>{
  const storage=memoryStorage(), repo=repository(storage,'personal'), state=personal();const saved=repo.save(state), loaded=repository(storage,'personal').load();
  assert.deepEqual(loaded,saved);assert.equal(loaded.items[0].notes,'Something worth remembering.');assert.equal(saved.revision,1);assert.equal(state.revision,0);
});
test('demo and personal workspaces have isolated keys and resets',()=>{
  const storage=memoryStorage();const p=repository(storage,'personal'),d=repository(storage,'demo');p.save(personal());d.save(demoState('2026-11-16'));d.reset();assert.equal(p.load().items.length,1);assert.equal(d.load().items.length,0);
});
test('damaged JSON is not overwritten by a subsequent save',()=>{
  const storage=memoryStorage(), repo=repository(storage,'personal');storage.setItem(storageKey('personal'),'{broken');assert.throws(()=>repo.load());assert.throws(()=>repo.save(personal()));assert.equal(repo.raw(),'{broken');
});
test('future schema versions are preserved for recovery',()=>{
  const storage=memoryStorage(), repo=repository(storage,'personal');storage.setItem(storageKey('personal'),JSON.stringify({...emptyState(),schemaVersion:99}));assert.throws(()=>repo.load(),/Unsupported/);assert.equal(JSON.parse(repo.raw()).schemaVersion,99);
});
test('quota failures leave the prior persisted copy and input state intact',()=>{
  const storage=memoryStorage(), repo=repository(storage,'personal'),first=repo.save(personal()),previous=repo.raw();storage.setItem=()=>{throw new Error('QuotaExceededError');};const next=structuredClone(first);next.items[0].title='New title';assert.throws(()=>repo.save(next),/Quota/);assert.equal(repo.raw(),previous);assert.equal(next.revision,first.revision);
});
test('disabled browser storage surfaces an error',()=>{
  const storage={getItem(){throw new Error('SecurityError');}};assert.throws(()=>repository(storage,'personal').load(),/Security/);
});
test('revision guard rejects a stale writer from another tab',()=>{
  const storage=memoryStorage(),a=repository(storage,'personal'),b=repository(storage,'personal'),old=b.load();a.save(personal());assert.throws(()=>b.save(old),/Another tab/);assert.equal(a.load().items.length,1);
});
test('restoring demo data into a personal repository is rejected',()=>{
  assert.throws(()=>repository(memoryStorage(),'personal').save(demoState('2026-11-16')),/mix/);
});
test('restored offset timestamps are canonical before scheduling comparisons',()=>{
  const storage=memoryStorage(),repo=repository(storage,'personal'),state=personal();state.items[0].updatedAt='2026-11-16T13:00:00+01:00';
  const loaded=repo.save(state);assert.equal(loaded.items[0].updatedAt,'2026-11-16T12:00:00.000Z');assert.equal(repo.load().items[0].updatedAt,'2026-11-16T12:00:00.000Z');
});
