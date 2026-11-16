import { validDate, validInstant, validZone, dateInZone, daysBetween } from './time.js';
export const SCHEMA_VERSION = 1;
export const SOURCE_NAMES = { manual: 'Manual entries', outlook: 'Outlook calendar', socs: 'SOCS calendars', teams: 'Teams assignments', email: 'Important email', 'power-automate': 'Power Automate' };
export const TYPES = ['event', 'assignment', 'reminder', 'task', 'goal', 'journal'];
const fields = ['externalId','type','title','notes','start','end','date','due','startDate','endDate','timeZone','status','updatedAt','recurrence','seriesExternalId','originalStart','location'];
const fail = message => { throw new Error(message); };
const plain = x => x && typeof x === 'object' && !Array.isArray(x);
function keys(value, allowed, name) {
  if (!plain(value)) fail(`${name} must be an object.`);
  const unknown = Object.keys(value).filter(k => !allowed.includes(k));
  if (unknown.length) fail(`${name}: unsupported field ${unknown[0]}. Use the documented format; do not import tokens or credentials.`);
}
function str(value, name, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) fail(`${name} must be ${required ? 'a non-empty' : 'a'} string of at most ${max} characters.`);
  return value.trim();
}
const instant = (v, name) => v == null ? null : validInstant(v) ? new Date(v).toISOString() : fail(`${name} needs an ISO timestamp with Z or an explicit offset.`);
const date = (v, name) => v == null ? null : validDate(v) ? v : fail(`${name} needs a valid YYYY-MM-DD date.`);
export function emptyState(mode = 'personal') {
  return { schemaVersion: 1, revision: 0, mode, items: [], sources: Object.entries(SOURCE_NAMES).map(([id, name]) => ({ id, name, lastImportAt: null, reportedSyncAt: null, lastAttemptAt: null, lastError: null, verification: 'unverified' })) };
}
export function itemKey(sourceId, externalId) { return JSON.stringify([sourceId, externalId]); }
export function normalizeItem(raw, sourceId, evidence = 'imported') {
  keys(raw, fields, 'Record');
  if (!Object.hasOwn(SOURCE_NAMES, sourceId)) fail('Unknown source.');
  const type = TYPES.includes(raw.type) ? raw.type : fail('Unknown record type.');
  const item = { externalId: str(raw.externalId, 'externalId', 300, true), type, title: str(raw.title, 'title', 300, true), notes: str(raw.notes, 'notes', 10000), location: str(raw.location, 'location', 300), start: instant(raw.start, 'start'), end: instant(raw.end, 'end'), date: date(raw.date, 'date'), due: instant(raw.due, 'due'), startDate: date(raw.startDate, 'startDate'), endDate: date(raw.endDate, 'endDate'), timeZone: raw.timeZone ?? 'Europe/London', status: raw.status ?? 'active', updatedAt: instant(raw.updatedAt, 'updatedAt'), recurrence: null, seriesExternalId: str(raw.seriesExternalId, 'seriesExternalId', 300), originalStart: instant(raw.originalStart, 'originalStart') };
  if (!validZone(item.timeZone)) fail('Use an IANA time zone, such as Europe/London.');
  if (!['active', 'completed', 'cancelled'].includes(item.status)) fail('Unsupported status.');
  if (!item.updatedAt) fail('updatedAt is required for safe replay and change detection.');
  if (item.end && !item.start) fail('end requires start.');
  if (item.start && item.end && item.end <= item.start) fail('end must be after start.');
  if (item.startDate && item.start) fail('Choose all-day dates or timed start/end.');
  if (item.endDate && !item.startDate) fail('endDate requires startDate.');
  if (item.startDate && (!item.endDate || item.endDate <= item.startDate)) fail('All-day events require an exclusive endDate after startDate.');
  if ((item.seriesExternalId || item.originalStart) && !(item.seriesExternalId && item.originalStart && type === 'event')) fail('Event exceptions require both seriesExternalId and originalStart.');
  if (item.seriesExternalId === item.externalId) fail('An exception must have its own externalId.');
  if (type !== 'event' && (item.start || item.end || item.startDate || item.endDate || raw.recurrence)) fail('Only events have start/end or recurrence. Use due for deadlines.');
  if (raw.recurrence != null) {
    keys(raw.recurrence, ['frequency', 'weekdays', 'intervalWeeks', 'until', 'excludeDates'], 'recurrence');
    const r = raw.recurrence;
    if (type !== 'event' || !item.start || !item.end || item.seriesExternalId || dateInZone(item.start, item.timeZone) !== dateInZone(item.end, item.timeZone)) fail('Weekly recurrence requires a same-day timed event without an exception parent.');
    if (!/:00\.000Z$/.test(item.start) || !/:00\.000Z$/.test(item.end)) fail('Weekly recurrence requires minute-aligned times. Import second-precision schedules as expanded occurrences.');
    if (r.frequency !== 'weekly' || !Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail('Only weekly recurrence with weekdays 0–6 is supported. Import other recurrence as expanded occurrences.');
    const until = date(r.until, 'recurrence.until'), first = dateInZone(item.start, item.timeZone);
    if (!until || until < first || daysBetween(first, until) > 730) fail('Recurrence needs an until date within two years of start.');
    if (![1,2].includes(r.intervalWeeks ?? 1)) fail('intervalWeeks must be 1 or 2.');
    if (r.excludeDates != null && (!Array.isArray(r.excludeDates) || r.excludeDates.length > 1000 || r.excludeDates.some(d => !validDate(d)))) fail('excludeDates must contain valid dates.');
    item.recurrence = { frequency: 'weekly', weekdays: [...new Set(r.weekdays)].sort(), intervalWeeks: r.intervalWeeks ?? 1, until, excludeDates: r.excludeDates ?? [] };
  }
  return { ...item, id: itemKey(sourceId, item.externalId), sourceId, evidence };
}
export function rawItem(item) { return Object.fromEntries(fields.filter(k => item[k] != null).map(k => [k, item[k]])); }
export function missingFields(item) {
  const missing = [];
  if (item.type === 'event' && !item.startDate) { if (!item.start) missing.push('start time'); if (!item.end) missing.push('end time'); }
  if (['assignment', 'task', 'reminder'].includes(item.type) && !item.due) missing.push('deadline');
  if (item.type === 'journal' && !item.date) missing.push('journal date');
  return missing;
}
export function parseImport(input) {
  if (typeof input === 'string' && input.length > 2_000_000) fail('Import limit is 2 MB.');
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  keys(data, ['schemaVersion', 'sourceId', 'exportedAt', 'lastSuccessfulSyncAt', 'items'], 'Import');
  if (data.schemaVersion !== 1) fail('Unsupported schemaVersion. Expected 1.');
  if (!Object.hasOwn(SOURCE_NAMES, data.sourceId) || data.sourceId === 'manual') fail('Choose a supported external source; manual entries use the form.');
  if (!Array.isArray(data.items) || data.items.length > 3000) fail('items must be an array with at most 3,000 records.');
  const exportedAt = instant(data.exportedAt, 'exportedAt') ?? fail('exportedAt is required.');
  const reportedSyncAt = instant(data.lastSuccessfulSyncAt, 'lastSuccessfulSyncAt');
  if (reportedSyncAt && reportedSyncAt > exportedAt) fail('lastSuccessfulSyncAt cannot be after exportedAt.');
  return { sourceId: data.sourceId, exportedAt, reportedSyncAt, items: data.items.map(x => normalizeItem(x, data.sourceId)) };
}
export function applyImport(state, parsed, now = new Date().toISOString()) {
  if (state.mode === 'demo') fail('Switch to My life before importing school data.');
  if (Date.parse(parsed.exportedAt) > Date.parse(now) + 300000 || parsed.items.some(x => Date.parse(x.updatedAt) > Date.parse(parsed.exportedAt) + 300000)) fail('Import contains future export or modification timestamps.');
  const next = structuredClone(state), map = new Map(next.items.map(i => [i.id, i]));
  const summary = { added: 0, updated: 0, unchanged: 0, stale: 0 };
  for (const item of parsed.items) {
    const old = map.get(item.id);
    if (old && item.updatedAt < old.updatedAt) { summary.stale++; continue; }
    if (old && item.updatedAt === old.updatedAt) {
      if (JSON.stringify(rawItem(old)) !== JSON.stringify(rawItem(item))) fail(`Conflicting versions of “${item.title}” have the same updatedAt. Nothing was imported.`);
      summary.unchanged++; continue;
    }
    summary[old ? 'updated' : 'added']++; map.set(item.id, item);
  }
  const all = [...map.values()];
  const exceptions = new Set();
  for (const i of all.filter(i => i.seriesExternalId)) {
    const key = JSON.stringify([i.sourceId, i.seriesExternalId, i.originalStart]);
    if (exceptions.has(key)) fail('Multiple exceptions target the same occurrence.');
    exceptions.add(key);
    if (!map.get(itemKey(i.sourceId, i.seriesExternalId))?.recurrence) fail('Import the recurring parent with its exception.');
  }
  next.items = all;
  const source = next.sources.find(s => s.id === parsed.sourceId);
  Object.assign(source, { lastImportAt: now, lastAttemptAt: now, lastError: null, reportedSyncAt: parsed.reportedSyncAt && (!source.reportedSyncAt || parsed.reportedSyncAt > source.reportedSyncAt) ? parsed.reportedSyncAt : source.reportedSyncAt });
  validateState(next);
  return { state: next, summary };
}
export function markImportFailure(state, sourceId, now, message) {
  const next = structuredClone(state), source = next.sources.find(s => s.id === sourceId);
  if (source) Object.assign(source, { lastAttemptAt: now, lastError: message.slice(0, 400) });
  return next;
}
export function validateState(data) {
  keys(data, ['schemaVersion','revision','mode','items','sources'], 'Saved workspace');
  if (!plain(data) || data.schemaVersion !== 1 || !['demo','personal'].includes(data.mode) || !Number.isInteger(data.revision) || data.revision < 0 || !Array.isArray(data.items) || !Array.isArray(data.sources)) fail('Unsupported or damaged saved data. Export a recovery copy before resetting.');
  if (data.items.length > 10000) fail('Saved record limit exceeded.');
  const ids = new Set(), normalizedItems = [];
  for (const item of data.items) {
    keys(item, [...fields, 'id','sourceId','evidence'], 'Saved record');
    const normalized = normalizeItem(rawItem(item), item.sourceId, item.evidence);
    if (!['demo','imported','user-entered'].includes(item.evidence) || item.id !== normalized.id || ids.has(item.id)) fail('Damaged saved record identity or evidence.');
    if (data.mode === 'personal' && item.evidence === 'demo' || data.mode === 'demo' && item.evidence !== 'demo') fail('Demo and personal records must remain separate.');
    if (data.mode === 'personal' && (item.sourceId === 'manual' ? item.evidence !== 'user-entered' : item.evidence !== 'imported')) fail('Evidence does not match record provenance.');
    ids.add(item.id); normalizedItems.push(normalized);
  }
  if (data.sources.length !== Object.keys(SOURCE_NAMES).length) fail('Damaged saved source list.');
  for (const source of data.sources) keys(source, ['id','name','lastImportAt','reportedSyncAt','lastAttemptAt','lastError','verification'], 'Saved source');
  for (const id of Object.keys(SOURCE_NAMES)) {
    const source = data.sources.filter(s => s.id === id);
    if (source.length !== 1 || source[0].name !== SOURCE_NAMES[id] || source[0].verification !== 'unverified') fail('Damaged saved source metadata.');
    for (const key of ['lastImportAt','lastAttemptAt','reportedSyncAt']) if (source[0][key] != null && !validInstant(source[0][key])) fail('Damaged saved source timestamp.');
    if (source[0].lastError != null && typeof source[0].lastError !== 'string') fail('Damaged saved source error.');
  }
  return { ...data, items: normalizedItems };
}
