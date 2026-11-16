import { personalDataPolicy, requirePersonalData } from './privacy.js';
import { assessCoverage, scheduleSnapshot, createBriefing } from './intelligence.js';
import { handleStore, linkedFileConnector } from './linked-files.js';
import { emptyState, SOURCE_NAMES, normalizeItem, parseImport, applyImport, markImportFailure, validateState, itemKey } from './model.js';
import { addDays, dateInZone, timeInZone, wallTime, weekday, minutesBetween } from './time.js';
import { eventsForDay, activity, freeWindows, upcoming, possibleDuplicates } from './schedule.js';
import { repository, storageKey } from './storage.js';
import { demoState } from './demo.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => dateInZone(new Date());
let mode = 'demo', state, repo, blocked = false, importPreview = null, noticeTimer;
const privacy = personalDataPolicy(location);
const guardPersonal = () => requirePersonalData(location);
let connector = null, linkStatus = [], refreshing = false, autoRefresh = false, connectionError = '';
if (privacy.allowed) {try{connector = linkedFileConnector({guard:guardPersonal,store:handleStore(indexedDB),picker:window.showOpenFilePicker?.bind(window)});}catch(error){connectionError=`Linked-file storage is unavailable: ${error.message}`;}}
let selectedDate = today(), fileReading = false, fileReadSequence = 0;
try { mode = privacy.allowed && localStorage.getItem('little-life.mode') === 'personal' ? 'personal' : 'demo'; } catch { /* Storage failure is explained by loadWorkspace. */ }
const now = () => mode === 'demo' ? wallTime(selectedDate, '11:05') : new Date().toISOString();
const dateLabel = date => new Intl.DateTimeFormat('en-GB',{ weekday:'long',day:'numeric',month:'long',timeZone:'Europe/London' }).format(new Date(`${date}T12:00:00Z`));
const shortDate = instant => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date(instant));
const duration = mins => mins >= 60 ? `${Math.floor(mins/60)}h${mins%60 ? ` ${mins%60}m` : ''}` : `${mins}m`;
const badge = evidence => `<span class="pill ${esc(evidence)}">${evidence === 'demo' ? 'Demo' : evidence === 'user-entered' ? 'You entered' : 'Imported · unverified'}</span>`;
const empty = (title, copy) => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>`;
const heading = (title, copy, action = true) => `<div class="page-heading"><div><p class="eyebrow">${esc(dateLabel(selectedDate).toUpperCase())}</p><h1>${title}</h1><p>${copy}</p></div>${action ? '<div class="heading-actions"><button class="button primary" data-action="add"><span aria-hidden="true">＋</span> Add entry</button></div>' : ''}</div>`;
function notify(text) { $('#notice').textContent = text; $('#notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').hidden = true, 6500); }
function loadWorkspace() {
  fileReadSequence++; fileReading=false;
  if (!privacy.allowed) mode = 'demo';
  blocked = false;
  try {
    repo = repository(localStorage, mode); state = repo.load();
    if (mode === 'demo' && !state.items.length && state.revision === 0) state = demoState(selectedDate);
  } catch (error) { state = emptyState(mode); blocked = true; notify(`Storage is unavailable or damaged. Changes cannot be saved: ${error.message}`); }
  render();
}
async function commit(next) {
  if (mode === 'personal') guardPersonal();
  if (blocked) throw new Error('Storage is unavailable or damaged. Use Your data to recover or reset it.');
  const controls=[...document.querySelectorAll('#main input, #main textarea, #main button')].map(element=>({element,disabled:element.disabled}));
  controls.forEach(({element})=>{element.disabled=true;});
  try {
    const save = () => { state = repo.save(next); };
    if (navigator.locks) await navigator.locks.request(`little-life-${mode}`, save); else save();
    render();
  } finally {controls.forEach(({element,disabled})=>{if(element.isConnected)element.disabled=disabled;});}
}
function view() { const v = location.hash.slice(1); return ['overview','tomorrow','tasks','journal','integrations','data','briefing'].includes(v) ? v : 'overview'; }
function render() {
  const currentView = view();
  document.title = `Little Life · ${{overview:'Your day',tomorrow:'Tomorrow',tasks:'Tasks',journal:'Journal',integrations:'Integrations',data:'Your data',briefing:'Daily briefing'}[currentView]}`;
  document.querySelectorAll('[data-view]').forEach(a => { if (a.dataset.view === currentView) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = `Your space / ${{overview:'My day',tomorrow:'Tomorrow',tasks:'Tasks & assignments',journal:'Journal & goals',integrations:'Integrations',data:'Your data',briefing:'Daily briefing'}[currentView]}`;
  $('#mode-banner').className = `mode-banner ${mode}`;
  $('#mode-banner').innerHTML = mode === 'demo'
    ? `<span><strong>Demonstration workspace</strong> · Sample schedules, no school connections. Preview clock: ${esc(selectedDate)} at 11:05.</span>${privacy.allowed ? '<button data-action="switch">Use my data →</button>' : '<a href="#integrations">Demo only · connection guide →</a>'}`
    : '<span><strong>My life · local workspace</strong> · Selected-file refresh available. Source content remains unverified.</span><button data-action="switch">View demo</button>';
  const storageWarning = blocked ? '<div class="callout error">Storage is unavailable or damaged. Saving is disabled to protect the existing copy. Open Your data to recover or reset.</div>' : '';
  $('#main').innerHTML = storageWarning + ({overview:renderDay,tomorrow:renderTomorrow,tasks:renderTasks,journal:renderJournal,integrations:renderIntegrations,data:renderData,briefing:renderBriefing}[currentView])();
  document.querySelectorAll('[data-action="add"]').forEach(b => b.disabled = blocked || !privacy.allowed);
}
function timeline(events) {
  if (!events.length) return empty('A little room in your day', 'No events recorded. Add an entry or import a schedule. This does not confirm that your calendar is empty.');
  const clock = now();
  return `<div class="timeline">${events.map(e => `<div class="timeline-row ${e.status === 'cancelled' ? 'cancelled' : e.start <= clock && e.end > clock ? 'current' : e.end && e.end <= clock ? 'past' : ''}"><div class="timeline-time">${e.startDate ? 'All day' : e.start ? timeInZone(e.start) : '—'}</div><div class="timeline-track"></div><div class="timeline-content"><h3 class="overflow-title">${esc(e.title)}</h3><p>${e.startDate ? `${esc(e.startDate)} · all day` : e.start && e.end ? `${timeInZone(e.start)} – ${timeInZone(e.end)}` : e.start ? `${timeInZone(e.start)} · end time unavailable` : 'Time unavailable'}${e.location ? ` · ${esc(e.location)}` : ''}</p><div class="row-meta">${badge(e.evidence)}${e.status !== 'active' ? `<span class="pill cancelled">${esc(e.status)}</span>` : ''}<span class="pill">${esc(e.category)}</span>${e.recurrence ? '<span class="pill">Repeats weekly</span>' : ''}${e.missing.length ? `<span class="pill warning">Missing ${esc(e.missing.join(', '))}</span>` : ''}${e.sourceId === 'manual' ? `<button class="text-button" data-action="edit" data-id="${esc(e.recurrence ? itemKey(e.sourceId,e.externalId) : e.id)}">${e.recurrence ? 'Edit series' : 'Edit'}</button>` : ''}</div>${e.notes ? `<p>${esc(e.notes)}</p>` : ''}</div></div>`).join('')}</div>`;
}
function tasks(items, limit = Infinity) {
  if (!items.length) return empty('Nothing waiting here', 'Assignments, tasks and reminders will appear when you add or import them.');
  return items.slice(0,limit).map(i => `<div class="task-row ${i.status === 'completed' ? 'completed' : ''}"><span class="task-marker" aria-hidden="true"></span><div class="task-copy"><h3 class="overflow-title">${esc(i.title)}</h3><p>${esc(i.notes || SOURCE_NAMES[i.sourceId])}</p><div class="button-row">${badge(i.evidence)}${i.sourceId === 'manual' ? `<button class="text-button" data-action="complete" data-id="${esc(i.id)}">${i.status === 'active' ? 'Mark done' : 'Reopen'}</button><button class="text-button" data-action="edit" data-id="${esc(i.id)}">Edit</button>` : ''}</div></div><span class="due ${i.overdue ? 'overdue' : ''}">${i.due ? `${i.overdue ? 'Overdue · ' : ''}${esc(shortDate(i.due))}` : 'Due date<br>unavailable'}</span></div>`).join('');
}
function renderDay() {
  const clock = now(), snapshot = scheduleSnapshot(state, selectedDate, clock), events = snapshot.events;
  const known = events.filter(e => e.status === 'active');
  const { current, next } = snapshot;
  const free = snapshot.availability.windows;
  const assignments = upcoming(state,clock), total = free.reduce((n,w) => n+w.minutes,0);
  const tomorrowEvents = eventsForDay(state,addDays(selectedDate,1)).filter(e => e.status === 'active').slice(0,3);
  return `${heading('Your day, a little clearer.', 'A place for your plans. And a little space between them.')}
  ${scheduleWarnings(snapshot)}
  <div class="stats"><div class="stat"><div class="stat-icon">▦</div><div><strong>${known.length}</strong><span>recorded events on your timeline</span></div></div><div class="stat"><div class="stat-icon">◷</div><div><strong>${total ? duration(total) : '—'}</strong><span>inferred gaps · coverage required</span></div></div><div class="stat"><div class="stat-icon">☑</div><div><strong>${assignments.filter(i=>i.type === 'assignment').length}</strong><span>upcoming assignments</span></div></div></div>
  <div class="dashboard-grid"><section class="card"><div class="card-heading"><h2>Today’s timeline</h2><label class="minor">View date<input class="date-picker" type="date" id="view-date" value="${selectedDate}" aria-label="Timeline date"></label></div>${timeline(events)}</section>
  <div class="stack"><section class="card breathing"><div class="sun-drawing" aria-hidden="true"></div><p class="eyebrow">HERE & NOW · ${timeInZone(clock)}</p><h2>One thing at a time.</h2><span class="pill ${snapshot.coverage.status==='covered'?'':'warning'}">Recorded activity · ${snapshot.coverage.status==='covered'?'coverage reported':'schedule uncertain'}</span><h3 class="overflow-title">${current.length ? esc(current.map(i=>i.title).join(' + ')) : 'A moment between things'}</h3><p>${current.length ? `Until ${timeInZone(current.map(i=>i.end).sort().at(-1))}${current.length > 1 ? ' · overlapping events' : ''}` : 'No fully timed current activity recorded.'}</p><div class="now-line"><span class="dot"></span><span>${next ? `<strong>Next recorded · ${esc(next.title)}</strong><br>${esc(shortDate(next.start))} · in ${duration(minutesBetween(clock,next.start))}${snapshot.nextConfidence.status!=='covered' ? '<br>Earlier events may be missing.' : ''}` : 'No next event recorded in the next 14 days.'}</span></div></section>
  <section class="card"><div class="card-heading"><h2>Possible breathing room</h2><span class="pill">Inferred</span></div>${free.length ? free.slice(0,3).map(w=>`<div class="free-row"><span class="free-icon" aria-hidden="true">⌁</span><div><strong>${timeInZone(w.start)} – ${timeInZone(w.end)}</strong><small>${w.minutes >= 30 ? 'Room to make it your own' : 'A small pause'}</small></div><span class="duration">${duration(w.minutes)}</span></div>`).join('') : `<p class="small-copy">${snapshot.availability.status==='unknown'?'Free time is unknown. Required coverage or event details are missing.':'No gap is established before 18:00.'}</p>`}<p class="card-note">Inferred gaps within 08:00–18:00 are shown only when required sources report fresh, complete coverage. Source content is unverified; gaps are never confirmed free time.</p></section>
  <section class="card"><div class="card-heading"><h2>Coming up</h2><a class="text-button" href="#tasks">View all →</a></div>${tasks(assignments,3)}</section></div></div>
  <section class="card tomorrow-preview"><div class="card-heading"><h2>A glance at tomorrow</h2><a class="text-button" href="#tomorrow">See tomorrow →</a></div>${tomorrowEvents.length ? `<div class="preview-events">${tomorrowEvents.map(e=>`<div class="preview-event"><small>${e.start ? timeInZone(e.start) : 'Time unavailable'} · ${esc(SOURCE_NAMES[e.sourceId])}</small><h3 class="overflow-title">${esc(e.title)}</h3><p>${esc(e.location || 'Location not provided')} · ${e.evidence === 'demo' ? 'Demo' : 'Unverified'}</p></div>`).join('')}</div>` : empty('Tomorrow is still taking shape', 'No events recorded for tomorrow yet.')}</section>`;
}
function renderTomorrow() {
  const date = addDays(selectedDate,1), snapshot = scheduleSnapshot(state,date,now()), events = snapshot.events, free = snapshot.availability.windows;
  return `${heading('A little look ahead.',esc(dateLabel(date)))}${scheduleWarnings(snapshot)}<div class="dashboard-grid"><section class="card"><div class="card-heading"><h2>Tomorrow’s schedule</h2><span class="minor">${events.filter(i=>i.status==='active').length} recorded events</span></div>${timeline(events)}</section><section class="card"><div class="card-heading"><h2>Possible free periods</h2><span class="pill">Inferred</span></div>${free.length ? free.map(w=>`<div class="free-row"><div><strong>${timeInZone(w.start)} – ${timeInZone(w.end)}</strong><small>${duration(w.minutes)} between recorded commitments</small></div></div>`).join('') : '<p class="small-copy">Free time is unknown, or no gap is established within 08:00–18:00.</p>'}<p class="card-note">These are inferred gaps, not verified school free periods. Unavailable calendars may contain other events.</p></section></div>`;
}
function renderTasks() {
  const items = upcoming(state,now()), done = state.items.filter(i=>['task','assignment','reminder'].includes(i.type) && i.status !== 'active');
  return `${heading('One small thing at a time.', 'Deadlines, reminders and the things you want to get done.')}<section class="card"><div class="card-heading"><h2>Assignments, tasks & reminders</h2><span class="minor">${items.length} open</span></div>${tasks(items)}</section>${done.length ? `<section class="card full-card"><h2>Completed & cancelled</h2>${tasks(done)}</section>` : ''}`;
}
function renderJournal() {
  const entries = state.items.filter(i=>i.type==='journal').sort((a,b)=>(b.date??'').localeCompare(a.date??''));
  const goals = state.items.filter(i=>i.type==='goal');
  const note = i => `<article class="journal-note ${i.status === 'completed' ? 'completed' : ''}"><small>${esc(i.type === 'journal' ? i.date || 'Date unavailable' : 'Personal goal')} · ${badge(i.evidence)} · ${esc(i.status)}</small><h3 class="overflow-title">${esc(i.title)}</h3><p>${esc(i.notes)}</p>${i.sourceId === 'manual' ? `<div class="button-row"><button class="text-button" data-action="edit" data-id="${esc(i.id)}">Edit</button>${i.type==='goal' ? `<button class="text-button" data-action="complete" data-id="${esc(i.id)}">${i.status==='active' ? 'Mark done' : 'Reopen'}</button>` : ''}</div>` : ''}</article>`;
  return `${heading('The little things count.', 'A few words for today. A little intention for tomorrow.')}<div class="journal-grid"><section class="card"><h2>Daily journal</h2>${entries.length ? entries.map(note).join('') : empty('A blank page, just for you', 'Add a journal entry to remember something about your day.')}</section><section class="card"><h2>Personal goals</h2>${goals.length ? goals.map(note).join('') : empty('Start small', 'Add a goal that makes a little space for what matters.')}</section></div>`;
}
const routes = {
  manual: ['✎','Ready for local entries','Use the entry form. No school account or additional permission needed.'],
  outlook: ['▦','Awaiting authorised data','Recommended: an approved Power Automate export. Graph is an optional later route, subject to school consent.'],
  socs: ['◈','Awaiting authorised data','Use the existing flow or an official school-enabled calendar feed. Academic timetable coverage must be checked.'],
  teams: ['☑','Awaiting authorised data','Existing assignment flow reported working by Sebastian. No output or school connection verified in Little Life.'],
  email: ['✉','Awaiting authorised data','Export selected important email metadata or enter reminders yourself. No mailbox access in this prototype.'],
  'power-automate': ['⇄','Existing flows · user reported','SOCS and Teams retrieval reported working. Little Life import mapping and ongoing delivery remain unverified.']
};

function scheduleWarnings(snapshot) {
  const issues = [...snapshot.coverage.missing, ...snapshot.unknown.map(e=>`${e.title}: event time or category unavailable.`)];
  return `<section class="schedule-health" aria-label="Schedule confidence"><span class="pill ${issues.length ? 'warning' : ''}">${issues.length ? 'Schedule coverage uncertain' : mode==='demo' ? 'Synthetic coverage' : 'Coverage reported by exporter'}</span>${snapshot.overlaps.length ? `<p class="error">${snapshot.overlaps.length} overlapping commitment(s): ${snapshot.overlaps.map(c=>`${esc(c.first.title)} / ${esc(c.second.title)}`).join('; ')}</p>` : ''}${snapshot.cancellations.length ? `<p>${snapshot.cancellations.length} cancelled event(s) excluded from activity and free-time calculations.</p>` : ''}${issues.length ? `<details><summary>What is missing? (${issues.length})</summary><ul>${issues.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></details>` : '<p>Fresh coverage was supplied for required sources. Content remains unverified.</p>'}</section>`;
}
function renderBriefing() {
  const briefing=createBriefing(state,selectedDate,now());
  return `${heading('A briefing, grounded in your day.', 'Deterministic answers from your recorded schedule. No AI service or invented events.',false)}<div class="callout">${mode==='demo'?'All answers use synthetic demonstration records.':'Answers use recorded data and exporter-reported coverage, with uncertainty preserved.'} Current activity and next lesson use the current clock; the daily view uses ${esc(selectedDate)}.</div><div class="briefing-grid">${Object.values(briefing.answers).map(answer=>`<section class="card"><h2>${esc(answer.question)}</h2><p class="briefing-answer">${esc(answer.text)}</p><span class="pill">${esc(briefing.evidence)}</span><p class="card-note">${answer.ids.length} supporting record(s) · generated by the life engine</p></section>`).join('')}</div>`;
}
function renderWizard() {
  const disabled=!privacy.allowed||mode!=='personal'||blocked;
  const scope=assessCoverage(state,wallTime(selectedDate,'08:00'),wallTime(selectedDate,'18:00'),now(),{assignments:true});
  return `<section class="card wizard" aria-label="Connection wizard"><p class="eyebrow">CONNECTION WIZARD · PRIVATE FILES, READ ONLY</p><h2>From your existing flows to your day</h2>
    ${!privacy.allowed ? `<div class="callout"><strong>This is a synthetic-only deployment.</strong> ${esc(privacy.reason)} Personal forms, imports and file access are blocked. Read the setup instructions; use an approved dedicated origin for school data.</div>` : `<p class="small-copy">${esc(privacy.reason)} ${mode==='demo'?'Select “Use my data” above to link files in the personal workspace.':''}</p>`}
    <ol class="wizard-steps"><li><strong>Prepare the private exports.</strong> In a copy of each working flow, map schema v2 and use OneDrive for Business to update <code>Little Life/socs.json</code> and <code>Little Life/teams.json</code>. Keep the files private. <a href="./docs/ll-002-connection.html" target="_blank" rel="noopener">Follow the exact setup steps ↗</a><div class="button-row"><button class="text-button" data-action="flow-template" data-source="socs">SOCS starter JSON</button><button class="text-button" data-action="flow-template" data-source="teams">Teams starter JSON</button></div></li>
    <li><strong>Check scope and freshness.</strong> A complete export must include all pages and explicit changes/cancellations. Academic and activity coverage are separate. Templates start partial until checked. Required scopes: ${state.requirements.map(r=>`${esc(r.category)} from ${esc(SOURCE_NAMES[r.sourceId])} (${r.maxAgeMinutes} minutes)`).join('; ')}.
    ${privacy.allowed&&mode==='personal'?`<form id="requirements-form"><label class="check-label"><input type="checkbox" name="manualPersonal" ${state.requirements.some(r=>r.category==='personal')?'':'checked'}> I manage all personal events manually; I do not use an Outlook personal calendar.</label><button type="submit" class="button subtle">Save calendar scope</button></form>`:''}</li>
    <li><strong>Link the two synced files once.</strong> In an approved Edge/Chrome browser, select the files from your already synced school OneDrive folder. Only those selected files can be read; no folder is scanned and no Microsoft sign-in is added.
    <div class="file-links">${['socs','teams'].map(id=>{const link=mode==='personal'?linkStatus.find(s=>s.sourceId===id):null;return `<div class="linked-file"><h3>${esc(SOURCE_NAMES[id])}</h3><p>${link?.name?`${esc(link.name)} · ${esc(link.permission)}`:'No file linked'}</p><div class="button-row"><button class="button" data-action="link-file" data-source="${id}" ${disabled?'disabled':''}>Link and read ${id==='socs'?'SOCS':'Teams'} file</button>${link?.name?`<button class="text-button" data-action="reconnect-file" data-source="${id}" ${disabled?'disabled':''}>Reconnect ${id==='socs'?'SOCS':'Teams'}</button><button class="text-button" data-action="forget-file" data-source="${id}" ${disabled?'disabled':''}>Forget file</button>`:''}</div></div>`;}).join('')}</div>${connector&&!connector.supported?'<p class="error">This browser does not support linked files. Manual import is available in Your data. Use an already-approved compatible browser; do not bypass browser policy.</p>':''}</li>
    <li><strong>Refresh without repeated importing.</strong> Once linked, the app rereads those files. The upstream flow and OneDrive must have completed first. A file read does not prove a fresh flow run.
    <div class="button-row"><button class="button primary" data-action="refresh-files" ${disabled||refreshing?'disabled':''}>${refreshing?'Reading linked files…':'Refresh linked files'}</button><label class="check-label"><input type="checkbox" id="auto-refresh" ${autoRefresh?'checked':''} ${disabled?'disabled':''}> Check every minute while this page is visible</label></div><p class="card-note">Handles are remembered on this trusted origin. Browser permission may need reconfirming after a reload. Closing the page stops refresh. A deleted/recreated file may need relinking.</p></li></ol>
    ${connectionError?`<p class="error" role="alert">${esc(connectionError)}</p>`:''}
    <div class="scope-status" aria-label="Source coverage status">${scope.scopes.map(s=>`<p><span class="pill ${s.status==='covered'?'':'warning'}">${esc(s.status)}</span> ${esc(s.reason)}${s.observedAt?` Last upstream observation: ${esc(shortDate(s.observedAt))}.`:''}</p>`).join('')}</div>
    <p class="card-note">Status describes selected-file processing, not verified live school access. Direct OneDrive web fetching is not implemented: it would require a separate Graph app/consent route. Manual JSON import remains in Your data.</p></section>`;
}
function templateFor(sourceId) {
  const date=today(),stamp=new Date().toISOString(),start=wallTime(date,'00:00'),end=wallTime(addDays(date,7),'00:00');
  return {schemaVersion:2,sourceId,exportedAt:stamp,lastSuccessfulSyncAt:stamp,coverage:(sourceId==='socs'?['lesson','activity']:['assignment']).map(category=>({category,start,end,observedAt:stamp,completeness:'partial'})),items:[sourceId==='socs'?{externalId:'REPLACE-WITH-STABLE-SOURCE-ID',type:'event',category:'lesson',title:'DEMO — replace with mapped title',start:wallTime(date,'09:00'),end:wallTime(date,'10:00'),updatedAt:stamp}:{externalId:'REPLACE-CLASS-ID:ASSIGNMENT-ID',type:'assignment',category:'assignment',title:'DEMO — replace with displayName',due:null,updatedAt:stamp}]};
}
async function ingestLinked(sourceId,candidate=null) {
  guardPersonal();if(mode!=='personal')throw new Error('Switch to the personal workspace before connecting files.');
  const text=await connector.read(sourceId,candidate);
  guardPersonal();if(mode!=='personal')throw new Error('Workspace changed during file read; no records were imported.');
  const parsed=parseImport(text);
  if(parsed.sourceId!==sourceId)throw new Error(`Wrong source: the selected file declares ${parsed.sourceId}; choose the ${sourceId} export.`);
  const result=applyImport(state,parsed);
  await commit(result.state);return result.summary;
}
async function refreshFiles() {
  guardPersonal();if(!connector||refreshing||mode!=='personal')return;
  refreshing=true;connectionError='';if(view()==='integrations')render();
  const results=[];
  try {
    linkStatus=await connector.status();
    for(const linked of linkStatus.filter(s=>s.name)) {
      try {const summary=await ingestLinked(linked.sourceId);results.push(`${linked.sourceId}: ${summary.added} new, ${summary.updated} changed`);}
      catch(error){connectionError+=`${linked.sourceId}: ${error.message} `;if(mode==='personal')await commit(markImportFailure(state,linked.sourceId,new Date().toISOString(),error.message));}
    }
    if(!results.length&&!connectionError)connectionError='Link an approved SOCS or Teams export first.';
  } finally {refreshing=false;if(view()==='integrations')render();}
  if(results.length)notify(`Files read locally — ${results.join('; ')}. Upstream freshness is assessed separately.`);
}

function renderIntegrations() {
  return `${heading('Everything, with a source.', 'An honest view of what’s connected, imported and still unknown.',false)}${renderWizard()}<div class="callout">No live school integration has been verified in Little Life. A successful file import confirms local processing only. It does not verify completeness, school authorisation, or automatic synchronisation.</div><div class="integration-grid">${state.sources.map(s=>`<section class="card"><div class="integration-title"><span class="integration-symbol" aria-hidden="true">${routes[s.id][0]}</span><div><h2>${esc(s.name)}</h2><small>${routes[s.id][1]}</small></div></div><p class="small-copy">${routes[s.id][2]}</p><dl class="source-detail"><dt>Connection verified</dt><dd>${s.id==='manual' ? 'Local entry only' : 'No · not connected'}</dd><dt>Records in this workspace</dt><dd>${state.items.filter(i=>i.sourceId===s.id).length}${mode==='demo' ? ' · demonstration' : ''}</dd><dt>Last successful local import</dt><dd>${s.lastImportAt ? esc(shortDate(s.lastImportAt)) : 'Never'}</dd><dt>Upstream sync · reported, unverified</dt><dd>${s.reportedSyncAt ? esc(shortDate(s.reportedSyncAt)) : 'Unavailable'}</dd><dt>Latest import attempt</dt><dd>${s.lastAttemptAt ? esc(shortDate(s.lastAttemptAt)) : 'Never'}</dd></dl>${s.lastError ? `<p class="error">Last attempt failed: ${esc(s.lastError)}</p>` : ''}<span class="pill ${s.id==='manual' ? '' : 'warning'}">${s.id==='manual' ? 'Local first' : 'Selected-file transport · school data unverified'}</span></section>`).join('')}</div><section class="card full-card"><h2>Connect with confidence</h2><p class="small-copy">The integration report covers official routes, permissions, school restrictions and steps only Sebastian can complete.</p><a class="report-link" href="./docs/integrations.html" target="_blank" rel="noopener">Read the integration & connection guide ↗</a></section>`;
}
function renderData() {
  const duplicates = possibleDuplicates(state);
  return `${heading('Your data. Your little life.', 'Import deliberately, keep a backup, and know where everything came from.',false)}
  ${!privacy.allowed ? `<div class="callout"><strong>Personal data is disabled on this origin.</strong> ${esc(privacy.reason)} <a href="./docs/ll-002-connection.html">Deployment and privacy instructions</a></div>` : ''}
  ${mode === 'demo' ? '<div class="callout">This workspace contains demonstration data only. Select “Use my data” to start an empty personal workspace before importing school records.</div>' : ''}
  ${duplicates.length ? `<div class="callout"><strong>${duplicates.length} possible duplicate group(s) across sources.</strong> Identical titles and times were found. Import each upstream calendar through one route; check mirrored SOCS events in Outlook. Different sources are kept for review to avoid silently merging real separate commitments.</div>` : ''}
  <div class="data-grid"><section class="card"><h2>Structured import</h2><p class="small-copy">Choose or paste a version 1 JSON export. Preview checks the entire batch before saving. Re-imports update by source + external ID.</p><label>JSON file<input id="import-file" type="file" accept=".json,application/json" ${mode==='demo'||blocked?'disabled':''}></label><label>Or paste JSON<textarea id="import-text" class="code-input" spellcheck="false" placeholder='{"schemaVersion":1,"sourceId":"socs",...}' ${mode==='demo'||blocked?'disabled':''}></textarea></label><div class="button-row"><button class="button primary" data-action="preview-import" ${mode==='demo'||blocked?'disabled':''}>Preview import</button><button class="text-button" data-action="example">Download sample JSON</button></div><div id="import-result" aria-live="polite"></div><p class="card-note">Max 2 MB / 3,000 records per import. Unknown fields and credentials fields are rejected. Do not paste passwords, tokens, private feed URLs or full flow definitions.</p><a class="report-link" href="./docs/import-format.html" target="_blank" rel="noopener">Import format & Power Automate mapping ↗</a></section>
  <div class="stack"><section class="card"><h2>Keep a local backup</h2><p class="small-copy">${state.items.length} records · schema v2 · ${mode==='demo'?'demonstration':'personal'} workspace</p><p class="small-copy">Browser storage can be cleared or blocked by school policy. It is not encrypted. A backup is a private file; keep it in an approved location.</p><div class="button-row"><button class="button" data-action="export">Download ${blocked?'recovery copy':'backup'}</button><button class="text-button" data-action="reload">Reload from storage</button></div><label>Restore a Little Life backup<input id="restore-file" type="file" accept=".json,application/json" ${blocked||!privacy.allowed?'disabled':''}></label><p class="card-note">Restore replaces this workspace after confirmation. It cannot mix demo and personal records. Export a backup first.</p></section>
  <section class="card"><h2>A fresh page</h2><p class="small-copy">Reset only the ${mode==='demo'?'demonstration':'personal'} workspace on this browser. The other workspace is separate.</p><button class="button danger" data-action="reset">Reset this workspace</button></section><section class="card"><h2>What stays on this device?</h2><p class="small-copy">Your entries, imports and status history live in this browser’s local storage. There is no cloud database, account login or AI request. Public builds disable all personal-data inputs. Other apps on the same website origin may access browser storage; use a dedicated origin for sensitive data.</p></section></div></div>`;
}
function openEntry(id = null) {
  if (!privacy.allowed) throw new Error('This public demo accepts no typed personal data. Use the built-in synthetic examples.');
  const form = $('#entry-form'); form.reset(); $('#entry-error').textContent='';
  const item = id ? state.items.find(i=>i.id===id) : null;
  if (item && item.sourceId !== 'manual') return;
  form.elements.id.value = item?.id ?? '';
  for (const field of ['type','title','notes','location','status','category']) if (item?.[field]) form.elements[field].value = item[field];
  form.elements.eventDate.value = item?.start ? dateInZone(item.start) : selectedDate;
  form.elements.startTime.value = item?.start ? timeInZone(item.start) : '16:00';
  form.elements.endTime.value = item?.end ? timeInZone(item.end) : '17:00';
  form.elements.dueDate.value = item?.due ? dateInZone(item.due) : '';
  form.elements.dueTime.value = item?.due ? timeInZone(item.due) : '17:00';
  form.elements.journalDate.value = item?.date ?? selectedDate;
  form.elements.until.value = item?.recurrence?.until ?? addDays(selectedDate,28);
  form.elements.repeat.checked = !!item?.recurrence;
  $('#entry-title').textContent = item ? 'Edit your entry' : 'Add an entry';
  updateForm(); $('#entry-dialog').showModal(); form.elements.title.focus();
}
function updateForm() {
  const f=$('#entry-form'), type=f.elements.type.value;
  $('#event-fields').hidden=type!=='event'; $('#due-fields').hidden=!['assignment','task','reminder'].includes(type); $('#journal-date').hidden=type!=='journal'; $('#repeat-until').hidden=!f.elements.repeat.checked;
  for (const name of ['eventDate','startTime','endTime']) f.elements[name].required=type==='event';
  f.elements.journalDate.required=type==='journal'; f.elements.until.required=type==='event'&&f.elements.repeat.checked;
}
$('#entry-form').addEventListener('change',updateForm);
$('#close-entry').addEventListener('click',()=>$('#entry-dialog').close());
$('#entry-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if (!privacy.allowed) { notify(privacy.reason); return; }
  const f=event.currentTarget, value=name=>f.elements[name].value, prior=state.items.find(i=>i.id===value('id'));
  try {
    const raw={ externalId:prior?.externalId??crypto.randomUUID(),type:value('type'),title:value('title'),notes:value('notes'),status:value('status'),updatedAt:new Date().toISOString() };
    if(raw.type==='event') { raw.category=value('category'); raw.start=wallTime(value('eventDate'),value('startTime')); raw.end=wallTime(value('eventDate'),value('endTime')); raw.location=value('location'); if(f.elements.repeat.checked) raw.recurrence={frequency:'weekly',weekdays:[weekday(value('eventDate'))],intervalWeeks:1,until:value('until')}; }
    if(['assignment','task','reminder'].includes(raw.type)&&value('dueDate')) raw.due=wallTime(value('dueDate'),value('dueTime'));
    if(raw.type==='journal') raw.date=value('journalDate');
    const item=normalizeItem(raw,'manual',mode==='demo'?'demo':'user-entered'), next=structuredClone(state);
    next.items=next.items.filter(i=>i.id!==item.id); next.items.push(item);
    await commit(next); $('#entry-dialog').close(); notify('Entry saved on this browser.');
  } catch(error) { $('#entry-error').textContent=error.message; }
});
function download(name,content) {
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'})), a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  try {
    if(action==='flow-template') { download(`little-life-${button.dataset.source}-starter.json`,JSON.stringify(templateFor(button.dataset.source),null,2)); return; }
    if(action==='link-file') {
      guardPersonal(); connectionError=''; const id=button.dataset.source;
      try {const picked=await connector.choose(id);await ingestLinked(id,picked.handle);await connector.accept(id,picked.handle);linkStatus=await connector.status();render();notify('File linked and processed locally. School data remains unverified.');}
      catch(error){connectionError=error.name==='AbortError'?'File selection cancelled; no connection changed.':error.message;if(error.name!=='AbortError'&&mode==='personal')await commit(markImportFailure(state,id,new Date().toISOString(),connectionError));render();}
      return;
    }
    if(action==='reconnect-file') {await connector.reconnect(button.dataset.source);linkStatus=await connector.status();await refreshFiles();return;}
    if(action==='forget-file') {await connector.forget(button.dataset.source);linkStatus=await connector.status();render();notify('File handle forgotten. Existing records remain; revoke browser file permission in site settings if needed.');return;}
    if(action==='refresh-files') {await refreshFiles();return;}
    if(action==='switch') { guardPersonal(); mode=mode==='demo'?'personal':'demo';selectedDate=today();try{localStorage.setItem('little-life.mode',mode);}catch{} loadWorkspace();return; }
    if(action==='add'||action==='edit') {openEntry(button.dataset.id);return;}
    if(action==='complete') {const next=structuredClone(state),i=next.items.find(i=>i.id===button.dataset.id);if(!i||i.sourceId!=='manual')return;i.status=i.status==='active'?'completed':'active';i.updatedAt=new Date().toISOString();await commit(next);notify('Entry updated.');}
    if(action==='preview-import') {
      guardPersonal(); if(fileReading)throw new Error('Wait for the selected file to finish reading.');
      const text=$('#import-text').value;
      try { const parsed=parseImport(text),result=applyImport(state,parsed); importPreview={text,parsed}; $('#import-result').innerHTML=`<div class="preview-box"><strong>Ready to import · ${esc(SOURCE_NAMES[parsed.sourceId])}</strong><p>${result.summary.added} new · ${result.summary.updated} updates · ${result.summary.unchanged} unchanged · ${result.summary.stale} stale ignored</p><p>Evidence: imported, unverified. No live connection is established.</p><button class="button primary" data-action="apply-import">Import these records</button></div>`; }
      catch(error) { importPreview=null; $('#import-result').innerHTML=`<p class="error">${esc(error.message)}</p>`; let sourceId;try{sourceId=JSON.parse(text).sourceId;}catch{}if(Object.hasOwn(SOURCE_NAMES,sourceId)&&sourceId!=='manual') { const failure=markImportFailure(state,sourceId,new Date().toISOString(),error.message); await commit(failure); $('#import-text').value=text; $('#import-result').innerHTML=`<p class="error">${esc(error.message)}</p>`; } }
    }
    if(action==='apply-import') { guardPersonal(); if(!importPreview||importPreview.text!==$('#import-text').value)throw new Error('The import changed. Preview it again.'); const result=applyImport(state,importPreview.parsed); await commit(result.state);importPreview=null;notify(`Imported locally: ${result.summary.added} new, ${result.summary.updated} updated. School connection remains unverified.`); }
    if(action==='example') {const date=today(),stamp=new Date().toISOString();download('little-life-demo-import.json',JSON.stringify({schemaVersion:1,sourceId:'socs',exportedAt:stamp,lastSuccessfulSyncAt:stamp,items:[{externalId:'demo-rehearsal-001',type:'event',title:'Sample rehearsal — replace before real import',start:wallTime(addDays(date,1),'16:00'),end:wallTime(addDays(date,1),'17:00'),updatedAt:stamp}]},null,2));}
    if(action==='export') {let content;if(blocked){try{content=localStorage.getItem(storageKey(mode));}catch{throw new Error('Browser policy blocks access to the stored copy.');}if(content===null)throw new Error('No saved copy is accessible.');}else content=JSON.stringify(state,null,2);download(`little-life-${mode}-${today()}${blocked?'-recovery':''}.json`,content);}
    if(action==='reload')loadWorkspace();
    if(action==='reset') {if(!confirm(`Delete this browser’s ${mode} workspace? Export a backup first. This cannot be undone.`))return;repo=repository(localStorage,mode);repo.reset();loadWorkspace();notify('Workspace reset.');}
  }catch(error){notify(error.message);}
});
document.addEventListener('input',event=>{if(event.target.id==='import-text'){importPreview=null;$('#import-result').replaceChildren();}});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='requirements-form')return;event.preventDefault();
  try{guardPersonal();const next=structuredClone(state),manual=event.target.elements.manualPersonal.checked;next.requirements=next.requirements.filter(r=>r.category!=='personal');if(!manual)next.requirements.push({sourceId:'outlook',category:'personal',maxAgeMinutes:360});await commit(next);notify('Calendar scope saved. Lesson and activity coverage remain required.');}catch(error){notify(error.message);}
});
document.addEventListener('change',async event=>{
  if(event.target.id==='auto-refresh'){try{guardPersonal();autoRefresh=event.target.checked;localStorage.setItem('little-life.auto-refresh',String(autoRefresh));}catch(error){notify(error.message);}return;}
  if(event.target.id==='view-date'&&event.target.value){selectedDate=event.target.value;render();return;}
  if(!['import-file','restore-file'].includes(event.target.id))return;
  const file=event.target.files[0];if(!file)return;
  const importFile=event.target.id==='import-file', sequence=++fileReadSequence, readMode=mode;
  if(importFile){fileReading=true;importPreview=null;$('#import-text').value='';$('#import-result').textContent='Reading selected file…';document.querySelector('[data-action="preview-import"]').disabled=true;}
  try {
    guardPersonal();
    if(file.size>2_000_000)throw new Error('File limit is 2 MB.');
    const text=await file.text();
    if(sequence!==fileReadSequence||readMode!==mode||view()!=='data')return;
    if(event.target.id==='import-file') {$('#import-text').value=text;$('#import-result').replaceChildren();importPreview=null;return;}
    const incoming=validateState(JSON.parse(text));
    if(incoming.mode!==mode)throw new Error('This backup belongs to the other workspace. Switch workspace first.');
    if(!confirm(`Replace the ${mode} workspace with ${incoming.items.length} records from this backup?`))return;
    incoming.revision=state.revision;await commit(incoming);notify('Backup restored locally. School integrations remain unverified.');
  }catch(error){notify(error.message);event.target.value='';}
  finally{if(sequence===fileReadSequence){fileReading=false;const button=document.querySelector('[data-action="preview-import"]');if(button)button.disabled=mode==='demo'||blocked||!privacy.allowed;}}
});
window.addEventListener('hashchange',()=>{importPreview=null;fileReadSequence++;fileReading=false;render();$('#main').focus();});
window.addEventListener('storage',event=>{if(event.key===storageKey(mode)){loadWorkspace();notify('Workspace refreshed after a change in another tab.');}});
setInterval(()=>{if(mode==='personal'&&['overview','tomorrow'].includes(view())&&!$('#entry-dialog').open&&!document.activeElement?.matches('input,textarea,select')){if(selectedDate<today())selectedDate=today();render();}},60000);
loadWorkspace();

if (connector) connector.restore().then(status=>{linkStatus=status;if(view()==='integrations')render();}).catch(error=>{connectionError=error.message;if(view()==='integrations')render();});

if(privacy.allowed) {try{autoRefresh=localStorage.getItem('little-life.auto-refresh')==='true';}catch{}setInterval(()=>{if(autoRefresh&&mode==='personal'&&document.visibilityState==='visible'&&!$('#entry-dialog').open&&!document.activeElement?.matches('input:not([type=checkbox]),textarea,select'))refreshFiles().catch(error=>notify(error.message));},60000);}
