import { emptyState, normalizeItem } from './model.js';
import { addDays, wallTime, weekday } from './time.js';
export function demoState(date) {
  const state = emptyState('demo'), tomorrow = addDays(date, 1), updatedAt = wallTime(date, '07:00');
  const add = (sourceId, externalId, type, title, extra = {}) => state.items.push(normalizeItem({ externalId, type, title, updatedAt, ...extra }, sourceId, 'demo'));
  const event = (id, title, start, end, extra = {}) => add('socs', id, 'event', title, { start: wallTime(date, start), end: wallTime(date, end), ...extra });
  event('registration', 'Morning registration', '08:30', '08:50', { location: 'House common room' });
  event('maths', 'Mathematics', '09:00', '10:00', { location: 'Room 12' });
  event('physics', 'Physics', '10:20', '11:20', { location: 'Science block' });
  event('literature', 'English literature', '11:40', '12:40', { location: 'Room 8', notes: 'Bring your annotated text.' });
  event('lunch', 'Lunch & a proper break', '12:40', '13:30');
  event('games', 'Afternoon games', '14:00', '15:30', { location: 'Playing fields' });
  event('club', 'Photography club', '16:00', '17:00', { status: 'cancelled', notes: 'Demonstration of a cancelled event; this no longer blocks time.' });
  add('outlook','piano','event','Piano practice',{start:wallTime(date,'17:00'),end:wallTime(date,'17:30'), location:'Music room', recurrence:{frequency:'weekly',weekdays:[weekday(date)],intervalWeeks:1,until:addDays(date,28)}});
  add('socs','tomorrow-history','event','History',{start:wallTime(tomorrow,'09:00'),end:wallTime(tomorrow,'10:00'),location:'Room 4'});
  add('socs','tomorrow-maths','event','Mathematics',{start:wallTime(tomorrow,'10:20'),end:wallTime(tomorrow,'11:20'),location:'Room 12'});
  add('socs','tomorrow-music','event','Chamber choir',{start:wallTime(tomorrow,'13:30'),end:wallTime(tomorrow,'14:30'),location:'Music school'});
  add('teams','essay','assignment','A perspective on modern poetry',{due:wallTime(tomorrow,'09:00'),notes:'English literature · 800 words'});
  add('teams','problem-set','assignment','Mechanics problem set',{due:wallTime(addDays(date,3),'16:00'),notes:'Physics · Questions 1–8'});
  add('teams','research','assignment','History research outline',{notes:'Due date was not provided. Check Teams.'});
  add('email','form','reminder','Return the trip consent form',{due:wallTime(addDays(date,2),'08:00'),notes:'Demonstration email reminder. No mailbox connected.'});
  add('manual','reading','goal','Read a little every day',{notes:'Make room for twenty minutes without a screen.'});
  add('manual','journal','journal','A small thing worth remembering',{date,notes:'A walk between lessons made the whole afternoon feel lighter.'});
  return state;
}
