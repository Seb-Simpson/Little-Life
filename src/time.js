export const DEFAULT_ZONE = 'Europe/London';
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validInstant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) && validDate(value.slice(0, 10)) && Number(value.slice(11,13)) < 24 && Number(value.slice(14,16)) < 60 && (!value.slice(17,19) || Number(value.slice(17,19)) < 60) && Number.isFinite(Date.parse(value));
export function validZone(zone) {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return typeof zone === 'string'; } catch { return false; }
}
export function parts(instant, zone = DEFAULT_ZONE) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
}
export function dateInZone(instant, zone = DEFAULT_ZONE) {
  const p = parts(instant, zone); return `${p.year}-${p.month}-${p.day}`;
}
export function timeInZone(instant, zone = DEFAULT_ZONE) {
  const p = parts(instant, zone); return `${p.hour}:${p.minute}`;
}
export function addDays(date, count) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10);
}
export function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
export function weekday(date) { return new Date(`${date}T12:00:00Z`).getUTCDay(); }
// Resolve a wall time using offsets on either side of a possible DST transition.
// Ambiguous and nonexistent times require an explicit offset in an import.
export function wallTime(date, time, zone = DEFAULT_ZONE) {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !validZone(zone)) throw new Error('Use a valid date, time and IANA time zone.');
  const target = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set([-36, 0, 36].map(hours => {
    const sample = target + hours * 3600000, p = parts(sample, zone);
    return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - sample;
  }));
  const candidates = [...offsets].map(offset => new Date(target - offset).toISOString()).filter(iso => dateInZone(iso, zone) === date && timeInZone(iso, zone) === time);
  if (candidates.length !== 1) throw new Error('This local time is ambiguous or does not exist because of daylight saving. Import a timestamp with an explicit offset.');
  return candidates[0];
}
export function dayBounds(date, zone = DEFAULT_ZONE) { return [wallTime(date, '00:00', zone), wallTime(addDays(date, 1), '00:00', zone)]; }
export const minutesBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
