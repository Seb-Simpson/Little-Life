import { addDays, dateInZone, dayBounds, daysBetween, timeInZone, wallTime, weekday, minutesBetween } from './time.js';
import { itemKey, missingFields } from './model.js';
const overlaps = (a, b, start, end) => a < end && b > start;
export function eventsForDay(state, date, zone = 'Europe/London') {
  const [from, to] = dayBounds(date, zone), result = [];
  const exceptions = new Map(state.items.filter(i => i.seriesExternalId).map(i => [JSON.stringify([i.sourceId, i.seriesExternalId, i.originalStart]), i]));
  const add = item => {
    let start = item.start, end = item.end;
    if (item.startDate) { start = wallTime(item.startDate, '00:00', item.timeZone); end = wallTime(item.endDate, '00:00', item.timeZone); }
    if (start && overlaps(start, end ?? to, from, to) || !start && (!item.date || item.date === date)) result.push({ ...item, start, end, missing: missingFields(item) });
  };
  for (const item of state.items.filter(i => i.type === 'event')) {
    if (item.seriesExternalId) {
      const parent = state.items.find(p => p.id === itemKey(item.sourceId, item.seriesExternalId));
      if (parent?.status === 'cancelled') continue;
      add(item); continue;
    }
    if (!item.recurrence) { add(item); continue; }
    const r = item.recurrence, first = dateInZone(item.start, item.timeZone);
    const anchorMonday = addDays(first, -((weekday(first) + 6) % 7));
    // Consider adjacent source dates so display and recurrence zones may differ.
    const sourceDate = dateInZone(from, item.timeZone);
    for (let n = -1; n <= 2; n++) {
      const d = addDays(sourceDate, n);
      if (d < first || d > r.until || !r.weekdays.includes(weekday(d)) || Math.floor(daysBetween(anchorMonday, d) / 7) % r.intervalWeeks || r.excludeDates.includes(d)) continue;
      let start, end;
      try { start = wallTime(d, timeInZone(item.start, item.timeZone), item.timeZone); end = wallTime(d, timeInZone(item.end, item.timeZone), item.timeZone); }
      catch { if (d === date) result.push({ ...item, start: null, end: null, date: d, missing: ['daylight-saving time needs an explicit occurrence'] }); continue; }
      if (exceptions.has(JSON.stringify([item.sourceId, item.externalId, start]))) continue;
      if (overlaps(start, end, from, to)) result.push({ ...item, id: `${item.id}@${start}`, start, end, missing: [] });
    }
  }
  return result.sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999') || a.title.localeCompare(b.title));
}
export function activity(events, now) {
  now = new Date(now).toISOString();
  const active = [...new Map(events.map(e => [e.id, e])).values()].filter(e => e.status === 'active' && e.start);
  return { current: active.filter(e => e.end && e.start <= now && now < e.end), next: active.filter(e => e.start > now).sort((a,b) => a.start.localeCompare(b.start))[0] ?? null };
}
export function freeWindows(events, date, { zone = 'Europe/London', startTime = '08:00', endTime = '18:00', now = null } = {}) {
  let start = wallTime(date, startTime, zone), end = wallTime(date, endTime, zone);
  if (end <= start) throw new Error('Free-time window must end after it starts.');
  if (now) now = new Date(now).toISOString();
  if (now && now > start) start = now;
  if (start >= end) return [];
  // Unknown end means busy until the end of the window; unknown start prevents any claim.
  const busy = events.filter(e => e.status === 'active');
  if (busy.some(e => !e.start)) return [];
  const spans = busy.filter(e => overlaps(e.start, e.end ?? end, start, end)).map(e => [e.start > start ? e.start : start, e.end && e.end < end ? e.end : end]).sort((a,b) => a[0].localeCompare(b[0]));
  const free = []; let cursor = start;
  for (const [a,b] of spans) { if (a > cursor) free.push({ start: cursor, end: a, minutes: minutesBetween(cursor, a), evidence: 'inferred' }); if (b > cursor) cursor = b; }
  if (cursor < end) free.push({ start: cursor, end, minutes: minutesBetween(cursor, end), evidence: 'inferred' });
  return free;
}
export function upcoming(state, now) {
  now = new Date(now).toISOString();
  return state.items.filter(i => ['assignment','task','reminder'].includes(i.type) && i.status === 'active').sort((a,b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')).map(i => ({ ...i, overdue: !!i.due && i.due < now, missing: missingFields(i) }));
}
export function possibleDuplicates(state) {
  const groups = new Map();
  for (const i of state.items.filter(i => i.status === 'active')) {
    const when = i.start ?? i.startDate ?? i.due;
    if (!when) continue;
    const key = JSON.stringify([i.type, i.title.toLowerCase().trim(), when]);
    const list = groups.get(key) ?? []; list.push(i); groups.set(key, list);
  }
  return [...groups.values()].filter(items => new Set(items.map(i => i.sourceId)).size > 1);
}
