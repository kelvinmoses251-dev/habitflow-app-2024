// habit-rules.js: the one place that decides whether a habit is due, done, open, and what its streak is.
//
// It has no dependencies and touches neither the page nor Firebase, so the app (app.js) and the reminder job
// (scripts/send-reminders.js) both use it and can never disagree. Unit tests: node --test tests/habit-rules.test.js
//
// Days are local calendar days as "YYYY-MM-DD" keys. All arithmetic treats them as plain calendar dates, so
// daylight-saving changes cannot skip or repeat a day.
//
// Every field beyond name/category/frequency/completedDates is optional. A habit with none of them behaves
// exactly as habits always have. History is never re-judged: when a schedule changes, the change is recorded
// with the day it took effect (scheduleHistory), and each past day is judged by the rule in force that day.

// ── Days ──────────────────────────────────────────────────
const pad2 = n => String(n).padStart(2, '0');
export const dayNumber = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const dayKey = num => { const d = new Date(num * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
export const shiftDay = (key, by) => dayKey(dayNumber(key) + by);
export const weekdayOf = key => new Date(dayNumber(key) * 86400000).getUTCDay();          // 0 = Sunday … 6 = Saturday
export const weekIndex = key => Math.floor((dayNumber(key) + 3) / 7);                     // weeks run Monday to Sunday
export const monthIndex = key => { const [y, m] = key.split('-').map(Number); return y * 12 + (m - 1); };
const weekStart = idx => dayKey(idx * 7 - 3);                                             // the Monday of week `idx`

// ── Frequency and schedule ────────────────────────────────
// `frequency` is the coarse bucket (it decides which Home section a habit is in). `schedule` refines it:
//   { type: 'daily' }                 every day
//   { type: 'days', days: [1,3,5] }   chosen weekdays (bucket: daily)
//   { type: 'times', times: 3 }       that many times a week, any days (bucket: weekly; plain weekly is times: 1)
//   { type: 'monthly' }               once a month
export const baseFreq = h => (h && (h.frequency === 'weekly' || h.frequency === 'monthly') ? h.frequency : 'daily');
const defaultSchedule = freq => (freq === 'weekly' ? { type: 'times', times: 1 } : freq === 'monthly' ? { type: 'monthly' } : { type: 'daily' });

// A stored schedule made safe: anything malformed falls back to the habit's plain frequency.
export function normalizeSchedule(s, freq = 'daily') {
  if (s && typeof s === 'object') {
    if (s.type === 'daily' || s.type === 'monthly') return { type: s.type };
    if (s.type === 'days' && Array.isArray(s.days)) {
      const days = [...new Set(s.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
      if (days.length) return { type: 'days', days };
    }
    if (s.type === 'times' && Number.isInteger(s.times) && s.times >= 1 && s.times <= 7) return { type: 'times', times: s.times };
  }
  return defaultSchedule(freq);
}

// The schedule that was in force on `day`.
export function scheduleOn(habit, day) {
  const freq = baseFreq(habit);
  const history = Array.isArray(habit && habit.scheduleHistory) ? habit.scheduleHistory.filter(e => e && typeof e.from === 'string') : [];
  let found = null;
  for (const e of history) if (e.from <= day && (!found || e.from >= found.from)) found = e;
  if (found) return normalizeSchedule(found.schedule, found.schedule && found.schedule.type === 'times' ? 'weekly' : found.schedule && found.schedule.type === 'monthly' ? 'monthly' : 'daily');
  return normalizeSchedule(habit && habit.schedule, freq);
}
const bucketOf = schedule => (schedule.type === 'times' ? 'weekly' : schedule.type === 'monthly' ? 'monthly' : 'daily');

// ── Due, done, open ───────────────────────────────────────
const doneSet = habit => new Set((habit && habit.completedDates) || []);

// ── Active window, pauses ─────────────────────────────────
// A habit may have a start and an end date, may be paused for stretches, and may be archived. On any day it is
// not active, or is paused, it is simply not expected: such days are skipped by streaks, never counted as misses.
const isDayKey = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Archiving is dated (archivedOn, the local day it was put away), so the days before it are judged as they were.
// An archived habit with no usable day is treated as archived throughout.
export const archivedDay = habit => (!habit || !habit.archivedAt ? null
  : isDayKey(habit.archivedOn) ? habit.archivedOn
  : Number.isFinite(habit.archivedAt) && habit.archivedAt > 86400000 ? dayKey(Math.floor(habit.archivedAt / 86400000)) : '0000-00-00');

export function isActiveOn(habit, day) {
  if (!habit || habit.deletedAt) return false;
  if (habit.archivedAt && day >= archivedDay(habit)) return false;
  if (isDayKey(habit.startDate) && day < habit.startDate) return false;
  if (isDayKey(habit.endDate) && day > habit.endDate) return false;
  return true;
}

// pauses: [{ from, to }] with `to` the last paused day; a pause with no `to` is still running.
export function isPausedOn(habit, day) {
  const pauses = habit && Array.isArray(habit.pauses) ? habit.pauses : [];
  return pauses.some(p => p && isDayKey(p.from) && p.from <= day && (!isDayKey(p.to) || day <= p.to));
}

// For a habit with both a start and an end date: which day of its run `today` is ({ day: 12, of: 30 }), else null.
export function runDay(habit, today) {
  if (!habit || !isDayKey(habit.startDate) || !isDayKey(habit.endDate) || habit.endDate < habit.startDate) return null;
  if (today < habit.startDate || today > habit.endDate) return null;
  return { day: dayNumber(today) - dayNumber(habit.startDate) + 1, of: dayNumber(habit.endDate) - dayNumber(habit.startDate) + 1 };
}

// The pauses list after pausing from `day`, and after resuming on `day` (the pause then ends the day before;
// a pause begun and ended on the same day leaves nothing behind). Malformed entries are dropped on the way.
const cleanPauses = habit => (habit && Array.isArray(habit.pauses) ? habit.pauses : [])
  .filter(p => p && isDayKey(p.from)).map(p => (isDayKey(p.to) ? { from: p.from, to: p.to } : { from: p.from }));
export function withPause(habit, day) {
  const pauses = cleanPauses(habit);
  return isPausedOn(habit, day) ? pauses : [...pauses, { from: day }];
}
export function withResume(habit, day) {
  return cleanPauses(habit).flatMap(p => {
    if (p.to && p.to < day) return [p];                 // long over
    if (p.from > day) return [p];                       // not begun yet
    return p.from === day ? [] : [{ from: p.from, to: shiftDay(day, -1) }];
  });
}
// The pauses list after restoring an archived habit, or one whose run had ended, on `day`: the stretch it was
// away (from the day it was archived, or the day after its end date) up to yesterday is recorded as a pause.
export function withRestore(habit, day) {
  const pauses = cleanPauses(habit);
  const from = [archivedDay(habit), hasEndedOn(habit, day) ? shiftDay(habit.endDate, 1) : null].filter(isDayKey).sort()[0];
  const to = shiftDay(day, -1);
  return from && from <= to ? [...pauses, { from, to }] : pauses;
}
// The first day of the pause that covers `day`, or null.
export function pausedSince(habit, day) {
  const hit = cleanPauses(habit).filter(p => p.from <= day && (!p.to || day <= p.to)).map(p => p.from).sort();
  return hit.length ? hit[0] : null;
}

export const notStartedOn = (habit, day) => !!habit && isDayKey(habit.startDate) && day < habit.startDate;
export const hasEndedOn = (habit, day) => !!habit && isDayKey(habit.endDate) && day > habit.endDate;

const isOffOn = (habit, day) => !isActiveOn(habit, day) || isPausedOn(habit, day);

// Days a streak steps over without counting or breaking: paused, archived, or after the habit's end date.
// The days before a start date are NOT among them: a start date set later must never excuse old misses.
const streakSkips = (habit, day) => isPausedOn(habit, day) || (!!habit.archivedAt && day >= archivedDay(habit)) || hasEndedOn(habit, day);
// Was any day from `from` to `to` such a day? (For weeks and months, without walking every day.)
function skipsBetween(habit, from, to) {
  if (habit.archivedAt && archivedDay(habit) <= to) return true;
  if (isDayKey(habit.endDate) && habit.endDate < to) return true;
  const pauses = Array.isArray(habit.pauses) ? habit.pauses : [];
  return pauses.some(p => p && isDayKey(p.from) && p.from <= to && (!isDayKey(p.to) || p.to >= from));
}
const monthBounds = m => {
  const y = Math.floor(m / 12), mo = m % 12;
  const start = `${y}-${pad2(mo + 1)}-01`, next = `${mo === 11 ? y + 1 : y}-${pad2(mo === 11 ? 1 : mo + 2)}-01`;
  return { start, end: shiftDay(next, -1) };
};

// ── Measurable targets ────────────────────────────────────
// target: { amount, unit, step }. progress: { [day]: number }. Reaching the target is what completes the habit
// (the app then adds the day to completedDates); a count below it is progress, not "done".
export function targetOf(habit) {
  const t = habit && habit.target;
  if (!t || typeof t !== 'object' || !Number.isFinite(t.amount) || t.amount < 1 || t.amount > 100000) return null;
  const step = Number.isFinite(t.step) && t.step >= 0.001 && t.step <= t.amount ? t.step : 1;   // counts are kept to 3 decimals
  return { amount: t.amount, unit: typeof t.unit === 'string' ? t.unit.trim().slice(0, 12).trim() : '', step };
}
export function progressOn(habit, day) {
  const v = habit && habit.progress && habit.progress[day];
  return Number.isFinite(v) && v > 0 ? v : 0;
}
// The count after one step up (dir 1) or down (dir -1): never below zero, never past the target.
export function stepProgress(habit, day, dir) {
  const t = targetOf(habit);
  if (!t) return 0;
  const next = Math.round((progressOn(habit, day) + (dir < 0 ? -1 : 1) * t.step) * 1000) / 1000;   // rounded, so 0.1 + 0.2 is 0.3
  return Math.max(0, Math.min(t.amount, next));
}
export function isTargetMet(habit, day) {
  const t = targetOf(habit);
  return !!t && progressOn(habit, day) >= t.amount;
}

// Is the habit expected on this day? (Weekly and monthly habits are "due" on every day of their period.)
export function isDueOn(habit, day) {
  if (isOffOn(habit, day)) return false;
  const s = scheduleOn(habit, day);
  return s.type === 'days' ? s.days.includes(weekdayOf(day)) : true;
}

export const isDoneOn = (habit, day) => doneSet(habit).has(day);

// A missed day can still be filled in until the end of the following day (owner decision, 26 November 2026).
// Only yesterday, only for a day-by-day habit that was due and active that day, already existed, and is not done
// for it. Weekly and monthly habits have their whole period to be done in, so there is nothing to fill in.
// Nothing older can ever be changed: `today` is the device's own day, and the day after tomorrow this says no.
export function canFillIn(habit, day, today) {
  if (!habit || typeof habit !== 'object' || habit.deletedAt || habit.archivedAt || !isDayKey(day) || !isDayKey(today)) return false;
  if (day !== shiftDay(today, -1)) return false;
  const type = scheduleOn(habit, day).type;
  if (type !== 'daily' && type !== 'days') return false;
  if (!isDueOn(habit, day) || isDoneOn(habit, day)) return false;
  const made = habit.createdAt ? new Date(habit.createdAt) : null;          // a habit owes nothing before it existed
  if (made && !isNaN(made) && `${made.getFullYear()}-${pad2(made.getMonth() + 1)}-${pad2(made.getDate())}` > day) return false;
  return true;
}

const countInWeek = (habit, idx) => ((habit && habit.completedDates) || []).filter(d => weekIndex(d) === idx).length;

// How far along the current week or month a weekly/monthly habit is: { done, target }.
export function periodProgress(habit, today) {
  const s = scheduleOn(habit, today);
  if (s.type === 'times') return { done: countInWeek(habit, weekIndex(today)), target: s.times };
  if (s.type === 'monthly') return { done: ((habit.completedDates) || []).some(d => monthIndex(d) === monthIndex(today)) ? 1 : 0, target: 1 };
  return { done: isDoneOn(habit, today) ? 1 : 0, target: 1 };
}

// Is there still something to do for this habit today? The single answer used by the ring, "N left today",
// focus view and the reminder job.
export function isOpenOn(habit, today) {
  if (!habit || habit.deletedAt || habit.archivedAt || isOffOn(habit, today)) return false;
  const s = scheduleOn(habit, today);
  if (s.type === 'daily' || s.type === 'days') return isDueOn(habit, today) && !isDoneOn(habit, today);
  const { done, target } = periodProgress(habit, today);
  if (done >= target) return false;
  return !(s.type === 'times' && isDoneOn(habit, today));       // several times a week: once a day, come back tomorrow
}

// ── Streaks ───────────────────────────────────────────────
// A streak is counted in the habit's own period: days (due days only), weeks, or months. The current period
// being unfinished never breaks a streak; only a finished period that was missed does.
const LOOKBACK_DAYS = 3660;

function dailyStreak(habit, today, frozen) {
  const done = doneSet(habit);
  const all = [...done, ...frozen];
  if (!all.length) return 0;
  const earliest = dayNumber(all.reduce((a, b) => (a < b ? a : b)));
  let streak = 0;
  for (let n = dayNumber(today), i = 0; n >= earliest && i < LOOKBACK_DAYS; n--, i++) {
    const day = dayKey(n);
    const s = scheduleOn(habit, day);
    if (bucketOf(s) !== 'daily') break;                         // it was a weekly or monthly habit back then: a different unit
    const rest = s.type === 'days' && !s.days.includes(weekdayOf(day));
    if (done.has(day)) {
      if (!rest) streak++;                                       // done on a rest day: a bonus, not a streak day
      continue;
    }
    if (rest) continue;                                          // a rest day: skip
    if (streakSkips(habit, day)) continue;                       // paused, archived or ended: skip (a shield adds nothing here)
    if (frozen.has(day)) { streak++; continue; }                 // a due day covered by a shield
    if (day === today) continue;                                 // today is still open
    break;
  }
  return streak;
}

function weeklyStreak(habit, today) {
  const dates = (habit.completedDates) || [];
  if (!dates.length) return 0;
  const first = Math.min(...dates.map(weekIndex));
  let streak = 0;
  for (let w = weekIndex(today); w >= first; w--) {
    const ref = w === weekIndex(today) ? today : shiftDay(weekStart(w), 6);    // the rule in force at the end of that week
    const s = scheduleOn(habit, ref);
    if (s.type !== 'times') break;
    if (countInWeek(habit, w) >= s.times) { streak++; continue; }
    if (w === weekIndex(today)) continue;                        // this week is still open
    const monday = weekStart(w);
    if (skipsBetween(habit, monday, shiftDay(monday, 6))) continue;   // paused, archived or over for part of that week: skip
    break;
  }
  return streak;
}

function monthlyStreak(habit, today) {
  const months = new Set(((habit.completedDates) || []).map(monthIndex));
  if (!months.size) return 0;
  const first = Math.min(...months), current = monthIndex(today);
  let streak = 0;
  for (let m = current; m >= first; m--) {
    const { start, end } = monthBounds(m);
    if (scheduleOn(habit, m === current ? today : end).type !== 'monthly') break;   // it was not a monthly habit back then
    if (months.has(m)) { streak++; continue; }
    if (m === current) continue;                                 // this month is still open
    if (skipsBetween(habit, start, end)) continue;               // paused, archived or over for part of that month: skip
    break;
  }
  return streak;
}

// The habit's current streak, in its own unit. `frozenDays` are the account's shield-protected days (daily habits only).
export function habitStreak(habit, today, frozenDays = []) {
  const bucket = bucketOf(scheduleOn(habit, today));
  if (bucket === 'weekly') return weeklyStreak(habit, today);
  if (bucket === 'monthly') return monthlyStreak(habit, today);
  return dailyStreak(habit, today, new Set(frozenDays || []));
}

// The longest run the habit has ever had (shield days do not count towards a record), never less than the current streak.
export function habitLongestStreak(habit, today, frozenDays = []) {
  const current = habitStreak(habit, today, frozenDays);
  const dates = (habit.completedDates) || [];
  if (!dates.length) return current;
  const bucket = bucketOf(scheduleOn(habit, today));
  let longest = 0, run = 0;
  if (bucket === 'monthly') {
    const months = new Set(dates.map(monthIndex));
    for (let m = Math.min(...months); m <= monthIndex(today); m++) {
      const { start, end } = monthBounds(m);
      if (scheduleOn(habit, m === monthIndex(today) ? today : end).type !== 'monthly') { run = 0; continue; }
      if (months.has(m)) { run++; if (run > longest) longest = run; }
      else if (m !== monthIndex(today) && !skipsBetween(habit, start, end)) run = 0;
    }
  } else if (bucket === 'weekly') {
    const first = Math.min(...dates.map(weekIndex));
    for (let w = first; w <= weekIndex(today); w++) {
      const s = scheduleOn(habit, w === weekIndex(today) ? today : shiftDay(weekStart(w), 6));
      if (s.type === 'times' && countInWeek(habit, w) >= s.times) { run++; if (run > longest) longest = run; }
      else if (s.type !== 'times' || !skipsBetween(habit, weekStart(w), shiftDay(weekStart(w), 6))) run = 0;
    }
  } else {
    const done = doneSet(habit);
    const first = dayNumber(dates.reduce((a, b) => (a < b ? a : b)));
    for (let n = Math.max(first, dayNumber(today) - LOOKBACK_DAYS); n <= dayNumber(today); n++) {
      const day = dayKey(n);
      const s = scheduleOn(habit, day);
      const rest = s.type === 'days' && !s.days.includes(weekdayOf(day));
      if (done.has(day)) { if (!rest) { run++; if (run > longest) longest = run; } }
      else if (!rest && !streakSkips(habit, day)) run = 0;
    }
  }
  return Math.max(current, longest);
}
