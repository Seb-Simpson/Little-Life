import { eventsForDay, activity, freeWindows, upcoming } from './schedule.js';
import { missingFields, SOURCE_NAMES } from './model.js';
import { addDays, dayBounds, wallTime, dateInZone, timeInZone } from './time.js';
const intersects = (a, b, from, to) => a < to && b > from;
function covers(windows, from, to) {
  let cursor = from;
  for (const w of [...windows].sort((a,b) => a.start.localeCompare(b.start))) {
    if (w.start > cursor) return false;
    if (w.end > cursor) cursor = w.end;
    if (cursor >= to) return true;
  }
  return cursor >= to;
}
export function assessCoverage(state, from, to, now, { assignments = false } = {}) {
  now = new Date(now).toISOString();
  const requirements = state.requirements.filter(r => assignments || r.category !== 'assignment');
  const scopes = requirements.map(r => {
    const source = state.sources.find(s => s.id === r.sourceId);
    const windows = (source?.coverage ?? []).filter(w => w.category === r.category && intersects(w.start,w.end,from,to));
    const fresh = windows.filter(w => Date.parse(now) - Date.parse(w.observedAt) <= r.maxAgeMinutes*60000 && Date.parse(w.observedAt) <= Date.parse(now)+300000);
    const complete = fresh.filter(w => w.completeness === 'complete');
    let status = 'missing';
    if (source?.lastError) status = 'failed';
    else if (covers(complete,from,to)) status = 'covered';
    else if (windows.length && !fresh.length) status = 'stale';
    else if (windows.length) status = 'incomplete';
    const label = `${SOURCE_NAMES[r.sourceId]} · ${r.category}`;
    return { ...r, status, label, observedAt: windows.map(w=>w.observedAt).sort().at(-1) ?? null, reason: status === 'covered' ? `${label}: exporter reports complete coverage.` : status === 'stale' ? `${label}: older than ${r.maxAgeMinutes} minutes.` : status === 'failed' ? `${label}: latest read/import failed; retained records may be out of date.` : status === 'incomplete' ? `${label}: coverage is partial or does not span the requested time.` : `${label}: no coverage supplied for this time.` };
  });
  return { status: scopes.every(s=>s.status==='covered') ? 'covered' : 'unknown', scopes, missing: scopes.filter(s=>s.status!=='covered').map(s=>s.reason), evidence: state.mode === 'demo' ? 'demo' : 'exporter-reported' };
}
export function detectOverlaps(events) {
  const timed = events.filter(e=>e.status==='active'&&e.start&&e.end).sort((a,b)=>a.start.localeCompare(b.start));
  const conflicts=[];
  for(let i=0;i<timed.length;i++) for(let j=i+1;j<timed.length&&timed[j].start<timed[i].end;j++) {
    if(timed[i].id!==timed[j].id) conflicts.push({ first: timed[i], second: timed[j], start: timed[j].start > timed[i].start ? timed[j].start : timed[i].start, end: timed[j].end < timed[i].end ? timed[j].end : timed[i].end });
  }
  return conflicts;
}
export function availabilityForDay(state,date,now,{ startTime='08:00',endTime='18:00' }={}) {
  now=new Date(now).toISOString();
  const from=wallTime(date,startTime),to=wallTime(date,endTime),start=now>from?now:from;
  if(start>=to)return {status:'ended',windows:[],reasons:['The 08:00–18:00 planning window has ended.'],evidence:'inferred'};
  const coverage=assessCoverage(state,start,to,now),events=eventsForDay(state,date);
  const unknown=events.filter(e=>e.status==='active'&&(!e.start||!e.end||e.category==='unclassified'));
  const reasons=[...coverage.missing,...unknown.map(e=>`${e.title}: ${e.category==='unclassified'?'event category unavailable':`missing ${e.missing.join(', ')}`}.`)];
  if(reasons.length)return {status:'unknown',windows:[],reasons,evidence:'unavailable',coverage};
  return {status:'covered',windows:freeWindows(events,date,{now,startTime,endTime}),reasons:[],evidence:'inferred',coverage};
}
export function scheduleSnapshot(state,date,now,{horizonDays=14}={}) {
  now=new Date(now).toISOString();
  const [from,to]=dayBounds(date),events=eventsForDay(state,date);
  // Anchor current/next to the actual clock, independently of a browsed timeline date.
  const clockDate=dateInZone(now),horizon=Array.from({length:horizonDays},(_,i)=>eventsForDay(state,addDays(clockDate,i))).flat();
  const coverage=assessCoverage(state,from,to,now,{assignments:true});
  const current=activity(horizon,now),lessons=horizon.filter(e=>e.category==='lesson');
  const nextLesson=activity(lessons,now).next;
  const next=current.next;
  const nextConfidence=next ? assessCoverage(state,now,next.start,now) : assessCoverage(state,now,dayBounds(addDays(clockDate,horizonDays))[0],now);
  const nextLessonConfidence=nextLesson?assessCoverage(state,now,nextLesson.start,now):nextConfidence;
  return { date, now, nextLessonConfidence, events, current:current.current, next, nextLesson, nextConfidence, overlaps:detectOverlaps(events), cancellations:events.filter(e=>e.status==='cancelled'), coverage, availability:availabilityForDay(state,date,now), assignments:upcoming(state,now), unknown:events.filter(e=>missingFields(e).length||e.category==='unclassified'), horizonDays };
}
const showEvent = e => `${e.title} (${e.startDate ? 'all day' : e.start ? timeInZone(e.start) : 'time unavailable'}${e.end && !e.startDate ? `–${timeInZone(e.end)}` : ''})`;
export function createBriefing(state,date,now) {
  const snapshot=scheduleSnapshot(state,date,now),endSoon=Date.parse(now)+7*86400000;
  const listed=snapshot.events.filter(e=>e.status==='active');
  const due=snapshot.assignments.filter(i=>i.type==='assignment'&&i.due&&Date.parse(i.due)<=endSoon);
  const missing=[...snapshot.coverage.missing,...snapshot.unknown.map(e=>`${e.title}: ${[...missingFields(e),...(e.category==='unclassified'?['event category']:[])].join(', ')} unavailable.`),...snapshot.assignments.filter(i=>!i.due).map(i=>`${i.title}: deadline unavailable.`)];
  const assignmentScopes=snapshot.coverage.scopes.filter(s=>s.category==='assignment');
  if(!assignmentScopes.length)missing.push('Assignment source coverage is not configured.');
  const warning=snapshot.coverage.status==='covered'?'Coverage is exporter reported, not independently verified.':'The schedule is incomplete or stale; other commitments may be missing.';
  return { date, evidence:state.mode==='demo'?'demo':'recorded data', snapshot, answers:{
    today:{question:'What do I have today?',text:`${listed.length ? listed.map(showEvent).join('; ') : 'No active events are recorded for this date.'} ${warning}`,ids:listed.map(e=>e.id)},
    nextLesson:{question:'What is my next lesson?',text:snapshot.nextLesson?`${showEvent(snapshot.nextLesson)} on ${dateInZone(snapshot.nextLesson.start)}. ${snapshot.nextLessonConfidence.status==='covered'?'Based on the covered recorded schedule.':'This is the next recorded lesson; missing or stale data may hide an earlier one.'}`:`No lesson is recorded in the next ${snapshot.horizonDays} days. This does not confirm there are no lessons.`,ids:snapshot.nextLesson?[snapshot.nextLesson.id]:[]},
    free:{question:'When am I next free?',text:snapshot.availability.status==='unknown'?`I cannot determine a free period. ${snapshot.availability.reasons.join(' ')}`:snapshot.availability.status==='ended'?'Today’s planning window has ended. No later free period has been established.':snapshot.availability.windows.length?`The next inferred gap is ${timeInZone(snapshot.availability.windows[0].start)}–${timeInZone(snapshot.availability.windows[0].end)}. Required sources report coverage; this is not confirmation of free time.`:'No gap appears in the covered recorded schedule before 18:00.',ids:[]},
    assignments:{question:'What assignments are due soon?',text:`${due.length?due.map(i=>`${i.title}: ${i.overdue?'overdue, ':''}due ${dateInZone(i.due)} at ${timeInZone(i.due)}`).join('; '):'No dated assignment is recorded as due within seven days.'}${snapshot.assignments.some(i=>!i.due)?' Some deadlines are unavailable.':''} ${assignmentScopes.length&&assignmentScopes.every(s=>s.status==='covered')?'Assignment coverage is exporter reported.':'Assignment coverage is missing, partial or stale.'}`,ids:due.map(i=>i.id)},
    missing:{question:'What information is missing?',text:missing.length?missing.join(' '):'No missing required coverage or record fields were detected for this date. Source content remains unverified.',ids:snapshot.unknown.map(i=>i.id)},
  }};
}
