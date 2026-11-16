import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, normalizeItem, parseImport, applyImport, markImportFailure, missingFields, validateState } from '../src/model.js';
import { eventsForDay, activity, freeWindows, upcoming, possibleDuplicates } from '../src/schedule.js';
import { wallTime, dayBounds, minutesBetween, dateInZone, validInstant } from '../src/time.js';
import { demoState } from '../src/demo.js';
const stamp='2026-11-16T07:00:00.000Z';
const event=(extra={})=>({externalId:'event-1',type:'event',title:'Mathematics',start:'2026-11-16T09:00:00Z',end:'2026-11-16T10:00:00Z',updatedAt:stamp,...extra});
const stateWith=(records)=>({...emptyState(),items:records.map(r=>normalizeItem(r,'socs'))});
const envelope=(items,extra={})=>({schemaVersion:1,sourceId:'socs',exportedAt:stamp,items,...extra});
const ingest=(state,items,extra={})=>applyImport(state,parseImport(envelope(items,extra)),'2026-11-16T12:00:00Z');

test('wall time uses London winter and summer offsets',()=>{
  assert.equal(wallTime('2026-11-16','09:00'),'2026-11-16T09:00:00.000Z');
  assert.equal(wallTime('2026-07-16','09:00'),'2026-07-16T08:00:00.000Z');
  assert.equal(dateInZone('2026-07-16T23:30:00Z'),'2026-07-17');
});
test('DST day boundaries have 23 and 25 hours',()=>{
  assert.equal(minutesBetween(...dayBounds('2026-03-29')),23*60);
  assert.equal(minutesBetween(...dayBounds('2026-10-25')),25*60);
});
test('nonexistent and ambiguous local times require explicit offsets',()=>{
  assert.throws(()=>wallTime('2026-03-29','01:30'),/daylight/);
  assert.throws(()=>wallTime('2026-10-25','01:30'),/daylight/);
  assert.throws(()=>wallTime('2026-02-30','09:00'),/valid/);
});
test('timestamps reject local, invalid calendar dates and invalid clock values',()=>{
  for(const v of ['2026-11-16T09:00','2026-02-30T09:00:00Z','2026-11-16T24:00:00Z','2026-11-16T09:61:00Z'])assert.equal(validInstant(v),false,v);
  assert.equal(validInstant('2026-11-16T09:00:00+01:00'),true);
});
test('current activity uses half-open intervals and detects overlaps',()=>{
  const events=eventsForDay(stateWith([event(),event({externalId:'two',start:'2026-11-16T09:30:00Z',end:'2026-11-16T11:00:00Z'})]),'2026-11-16');
  assert.equal(activity(events,'2026-11-16T09:30:00.000Z').current.length,2);
  assert.equal(activity(events,'2026-11-16T10:00:00.000Z').current.length,1);
  assert.equal(activity(events,'2026-11-16T08:00:00.000Z').next.title,'Mathematics');
});
test('free windows merge overlaps, clip bounds and exclude cancelled or completed events',()=>{
  const events=eventsForDay(stateWith([event({start:'2026-11-16T07:00:00Z'}),event({externalId:'overlap',start:'2026-11-16T09:30:00Z',end:'2026-11-16T11:00:00Z'}),event({externalId:'cancel',start:'2026-11-16T12:00:00Z',end:'2026-11-16T14:00:00Z',status:'cancelled'}),event({externalId:'done',start:'2026-11-16T14:00:00Z',end:'2026-11-16T15:00:00Z',status:'completed'})]),'2026-11-16');
  const free=freeWindows(events,'2026-11-16');assert.equal(free.length,1);assert.equal(free[0].start,'2026-11-16T11:00:00.000Z');assert.equal(free[0].minutes,420);assert.equal(free[0].evidence,'inferred');
});
test('free windows exclude elapsed time and stop after window end',()=>{
  assert.equal(freeWindows([],'2026-11-16',{now:'2026-11-16T12:00:00.000Z'})[0].minutes,360);
  assert.deepEqual(freeWindows([],'2026-11-16',{now:'2026-11-16T19:00:00.000Z'}),[]);
});
test('unknown start blocks free-time inference; unknown end blocks rest of day',()=>{
  const unknown=eventsForDay(stateWith([event({start:null,end:null,date:'2026-11-16'})]),'2026-11-16');
  assert.deepEqual(freeWindows(unknown,'2026-11-16'),[]);
  const noEnd=eventsForDay(stateWith([event({end:null})]),'2026-11-16');
  assert.equal(freeWindows(noEnd,'2026-11-16')[0].minutes,60);
});
test('overnight events appear on both days without leaking across an end boundary',()=>{
  const state=stateWith([event({start:'2026-11-16T23:00:00Z',end:'2026-11-17T01:00:00Z'})]);
  assert.equal(eventsForDay(state,'2026-11-16').length,1);assert.equal(eventsForDay(state,'2026-11-17').length,1);assert.equal(eventsForDay(state,'2026-11-18').length,0);
});
test('all-day exclusive end blocks only its date range',()=>{
  const state=stateWith([event({start:null,end:null,startDate:'2026-11-16',endDate:'2026-11-17'})]);
  assert.equal(eventsForDay(state,'2026-11-16').length,1);assert.equal(eventsForDay(state,'2026-11-17').length,0);assert.deepEqual(freeWindows(eventsForDay(state,'2026-11-16'),'2026-11-16'),[]);
});
test('weekly recurrence preserves local time across DST',()=>{
  const state=stateWith([event({start:'2026-03-23T09:00:00Z',end:'2026-03-23T10:00:00Z',recurrence:{frequency:'weekly',weekdays:[1],until:'2026-04-20'}})]);
  assert.equal(eventsForDay(state,'2026-03-30')[0].start,'2026-03-30T08:00:00.000Z');assert.equal(eventsForDay(state,'2026-03-24').length,0);
});
test('fortnightly recurrence anchors to Monday and honours exclusions and until',()=>{
  const state=stateWith([event({recurrence:{frequency:'weekly',weekdays:[1,3],intervalWeeks:2,until:'2026-12-15',excludeDates:['2026-11-18']}})]);
  assert.equal(eventsForDay(state,'2026-11-18').length,0);assert.equal(eventsForDay(state,'2026-11-23').length,0);assert.equal(eventsForDay(state,'2026-11-30').length,1);assert.equal(eventsForDay(state,'2026-12-16').length,0);
});
test('a moved occurrence replaces the original and a cancelled occurrence leaves no busy interval',()=>{
  const parent=event({recurrence:{frequency:'weekly',weekdays:[1],until:'2026-12-14'}});
  const moved=event({externalId:'move',seriesExternalId:'event-1',originalStart:'2026-11-23T09:00:00Z',start:'2026-11-24T11:00:00Z',end:'2026-11-24T12:00:00Z'});
  const cancelled=event({externalId:'cancel',seriesExternalId:'event-1',originalStart:'2026-11-30T09:00:00Z',start:'2026-11-30T09:00:00Z',end:'2026-11-30T10:00:00Z',status:'cancelled'});
  const state=ingest(emptyState(),[parent,moved,cancelled]).state;
  assert.equal(eventsForDay(state,'2026-11-23').length,0);assert.equal(eventsForDay(state,'2026-11-24').length,1);
  assert.equal(freeWindows(eventsForDay(state,'2026-11-30'),'2026-11-30')[0].minutes,600);
});
test('cancelling a series disables its active exceptions',()=>{
  const state=stateWith([event({status:'cancelled',recurrence:{frequency:'weekly',weekdays:[1],until:'2026-12-14'}}),event({externalId:'move',seriesExternalId:'event-1',originalStart:'2026-11-23T09:00:00Z',start:'2026-11-24T11:00:00Z',end:'2026-11-24T12:00:00Z'})]);
  assert.equal(eventsForDay(state,'2026-11-24').length,0);
});
test('recurrence at a DST gap produces a missing-time warning only on affected day',()=>{
  const state=stateWith([event({start:'2026-03-22T01:30:00Z',end:'2026-03-22T02:30:00Z',recurrence:{frequency:'weekly',weekdays:[0],until:'2026-04-05'}})]);
  assert.equal(eventsForDay(state,'2026-03-29')[0].start,null);assert.equal(eventsForDay(state,'2026-03-28').length,0);
});
test('unsupported recurrence is rejected instead of guessed',()=>{
  assert.throws(()=>normalizeItem(event({recurrence:{frequency:'monthly',weekdays:[1],until:'2027-01-01'}}),'socs'),/weekly/);
  assert.throws(()=>normalizeItem(event({recurrence:{frequency:'weekly',weekdays:[1],until:'2030-01-01'}}),'socs'),/two years/);
});
test('replaying an identical export deduplicates records',()=>{
  const first=ingest(emptyState(),[event()]);const second=ingest(first.state,[event()]);assert.equal(second.state.items.length,1);assert.equal(second.summary.unchanged,1);assert.equal(second.summary.added,0);
});
test('identity is source-scoped and duplicate mirrors are flagged',()=>{
  const s=ingest(emptyState(),[event()]).state;const other=applyImport(s,parseImport(envelope([event()],{sourceId:'outlook'})),'2026-11-16T12:00:00Z').state;
  assert.equal(other.items.length,2);assert.equal(possibleDuplicates(other).length,1);
});
test('same-source change updates one entry; stale data cannot resurrect a cancellation',()=>{
  const first=ingest(emptyState(),[event()]).state;
  const cancelled=ingest(first,[event({status:'cancelled',updatedAt:'2026-11-16T08:00:00Z'})],{exportedAt:'2026-11-16T09:00:00Z'}).state;
  const stale=ingest(cancelled,[event()]);assert.equal(stale.state.items[0].status,'cancelled');assert.equal(stale.summary.stale,1);assert.equal(stale.state.items.length,1);
});
test('same-timestamp conflicts reject entire batch without changing input state',()=>{
  const first=ingest(emptyState(),[event()]).state, copy=structuredClone(first);
  assert.throws(()=>ingest(first,[event({externalId:'new'}),event({title:'Conflicting title'})]),/Conflicting/);assert.deepEqual(first,copy);
});
test('duplicate rows in one export collapse to one identity',()=>{
  assert.equal(ingest(emptyState(),[event(),event()]).state.items.length,1);
});
test('absence in an export never implies cancellation',()=>{
  const state=ingest(emptyState(),[event()]).state;assert.equal(ingest(state,[]).state.items[0].status,'active');
});
test('missing external IDs, local timestamps and impossible end times reject import',()=>{
  for(const bad of [event({externalId:null}),event({start:'2026-11-16T09:00'}),event({end:'2026-11-16T08:00:00Z'}),event({type:'bogus'})])assert.throws(()=>parseImport(envelope([bad])));
});
test('missing assignment due dates remain null, visible and sorted after known deadlines',()=>{
  const s=stateWith([{externalId:'unknown',type:'assignment',title:'Research',updatedAt:stamp},{externalId:'known',type:'assignment',title:'Essay',due:'2026-11-16T08:00:00Z',updatedAt:stamp}]);
  const list=upcoming(s,'2026-11-16T10:00:00.000Z');assert.equal(list[0].externalId,'known');assert.equal(list[0].overdue,true);assert.equal(list[1].due,null);assert.deepEqual(missingFields(list[1]),['deadline']);
});
test('sources only report a local import and explicitly unverified upstream timestamp',()=>{
  const state=ingest(emptyState(),[event()],{lastSuccessfulSyncAt:'2026-11-16T06:00:00Z'}).state, source=state.sources.find(s=>s.id==='socs');
  assert.equal(source.verification,'unverified');assert.equal(source.lastImportAt,'2026-11-16T12:00:00Z');assert.equal(source.reportedSyncAt,'2026-11-16T06:00:00.000Z');assert.equal(state.items[0].evidence,'imported');
});
test('failed import attempt preserves last successful import and records error',()=>{
  const state=ingest(emptyState(),[event()]).state;
  const failed=markImportFailure(state,'socs','2026-11-17T09:00:00Z','Invalid input');
  assert.equal(failed.sources.find(s=>s.id==='socs').lastImportAt,'2026-11-16T12:00:00Z');assert.equal(failed.sources.find(s=>s.id==='socs').lastError,'Invalid input');assert.equal(state.sources.find(s=>s.id==='socs').lastError,null);
});
test('credential fields, evidence claims and unknown schema versions are rejected',()=>{
  assert.throws(()=>parseImport(envelope([event()],{token:'private'})),/unsupported field/);
  assert.throws(()=>parseImport(envelope([event({verified:true})])),/unsupported field/);
  assert.throws(()=>parseImport(envelope([event()],{schemaVersion:3})),/schemaVersion/);
});
test('unknown source names including prototype properties are rejected',()=>{
  for(const sourceId of ['constructor','__proto__','unknown','manual'])assert.throws(()=>parseImport(envelope([event()],{sourceId})));
});
test('future metadata and missing exception parents are rejected',()=>{
  assert.throws(()=>ingest(emptyState(),[event()],{exportedAt:'2027-11-16T07:00:00Z'}),/future/);
  assert.throws(()=>ingest(emptyState(),[event({seriesExternalId:'missing',originalStart:'2026-11-16T09:00:00Z'})]),/parent/);
});
test('demo cannot receive imports or be restored as personal data',()=>{
  assert.throws(()=>ingest(demoState('2026-11-16'),[event()]),/My life/);
  const bad=demoState('2026-11-16');bad.mode='personal';assert.throws(()=>validateState(bad),/separate/);
});
test('backup validation rejects forged verification, credentials and duplicate identities',()=>{
  const s=ingest(emptyState(),[event()]).state;
  const a=structuredClone(s);a.sources[0].verification='verified';assert.throws(()=>validateState(a));
  const b=structuredClone(s);b.items[0].accessToken='secret';assert.throws(()=>validateState(b),/unsupported/);
  const c=structuredClone(s);c.items.push(c.items[0]);assert.throws(()=>validateState(c),/identity/);
});
test('demo contains only demo evidence and no invented sync timestamps',()=>{
  const state=validateState(demoState('2026-11-16'));assert.ok(state.items.length>10);assert.ok(state.items.every(i=>i.evidence==='demo'));assert.ok(state.sources.every(s=>s.reportedSyncAt===null&&s.lastImportAt===null));
});
test('multi-day events count once when current activity spans several queried dates',()=>{
  const state=stateWith([event({start:null,end:null,startDate:'2026-11-16',endDate:'2026-11-19'})]);
  const horizon=['2026-11-16','2026-11-17','2026-11-18'].flatMap(d=>eventsForDay(state,d));
  assert.equal(activity(horizon,'2026-11-16T09:00:00+00:00').current.length,1);
});
test('current, deadlines and free time compare instants rather than offset strings',()=>{
  const state=stateWith([event()]),events=eventsForDay(state,'2026-11-16');
  assert.equal(activity(events,'2026-11-16T10:30:00+01:00').current.length,1);
  assert.equal(freeWindows(events,'2026-11-16',{now:'2026-11-16T12:00:00+01:00'})[0].start,'2026-11-16T11:00:00.000Z');
});
test('a future event with an unknown end still appears as next without asserting current activity',()=>{
  const events=eventsForDay(stateWith([event({end:null})]),'2026-11-16');
  assert.equal(activity(events,'2026-11-16T08:00:00Z').next.externalId,'event-1');assert.equal(activity(events,'2026-11-16T09:30:00Z').current.length,0);
});
test('second-precision recurrence is rejected rather than silently rounded',()=>{
  assert.throws(()=>normalizeItem(event({start:'2026-11-16T09:00:30Z',recurrence:{frequency:'weekly',weekdays:[1],until:'2026-12-14'}}),'socs'),/minute-aligned/);
});
test('journal entries without a supplied date remain explicitly missing',()=>{
  const item=normalizeItem({externalId:'journal',type:'journal',title:'Imported note',updatedAt:stamp},'socs');assert.equal(item.date,null);assert.deepEqual(missingFields(item),['journal date']);
});
