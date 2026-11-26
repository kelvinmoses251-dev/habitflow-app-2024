// habit-history.js: what a habit's own page says about it. The summary figures, the month calendar, the charts,
// the year, the notes search, the insights.
//
// Everything is worked out from the one habit. Nothing is stored, nothing touches the page or Firebase; the page
// is drawn by habit-page.js. Unit tests: node --test tests/habit-history.test.js
//
// Days are local calendar days as "YYYY-MM-DD" keys, as in habit-rules.js, which decides what was due and done.
// History is never re-judged: each past day is judged by the schedule that was in force on that day.
import * as rules from './habit-rules.js?v=7';

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pad2 = n => String(n).padStart(2, '0');
const asHabit = h => (h && typeof h === 'object' ? h : {});
const days = frozen => (Array.isArray(frozen) ? frozen.filter(isDay) : []);

// A habit's done days as a Set, and the local day it was created, each worked out once per habit object (the app
// makes fresh objects whenever the data changes, so nothing here goes stale).
const doneCache = new WeakMap(), createdCache = new WeakMap();
export function doneSet(h) {
  let set = doneCache.get(h);
  if (!set) { set = new Set(Array.isArray(h.completedDates) ? h.completedDates.filter(isDay) : []); doneCache.set(h, set); }
  return set;
}
export function createdDay(h) {
  if (createdCache.has(h)) return createdCache.get(h);
  const d = h.createdAt ? new Date(h.createdAt) : null;
  const day = d && !isNaN(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
  createdCache.set(h, day);
  return day;
}
// Was it a day-by-day habit on that day (rather than a weekly or monthly one)?
const isDailyOn = (h, day) => { const t = rules.scheduleOn(h, day).type; return t === 'daily' || t === 'days'; };
// Was it owed that day: already created, a daily habit then, due by its schedule, and not paused, ended or archived.
export const owedOn = (h, day) => createdDay(h) <= day && isDailyOn(h, day) && rules.isDueOn(h, day);

// ── The figures at the top of the page ─────────────────────
// streak and longest are in the habit's own unit (days, weeks or months). The 30-day figure is the share of owed
// days that were done; a weekly habit is judged over its last four weeks instead, a monthly one has none.
export function habitSummary(habit, today, frozen = []) {
  const h = asHabit(habit), done = doneSet(h), freq = rules.baseFreq(h);
  let streak = 0, longest = 0;
  try { streak = rules.habitStreak(h, today, days(frozen)); longest = rules.habitLongestStreak(h, today, days(frozen)); } catch (_) { /* junk dates: no streak */ }
  let due30 = 0, done30 = 0, rate30 = null;
  if (freq === 'daily') {
    for (let n = 0; n < 30; n++) { const day = rules.shiftDay(today, -n); if (owedOn(h, day)) { due30++; if (done.has(day)) done30++; } }
    rate30 = due30 ? Math.round((done30 / due30) * 100) : null;
  } else if (freq === 'weekly') {
    for (let w = 0; w < 4; w++) {
      const day = rules.shiftDay(today, -7 * w);
      if (createdDay(h) > day) continue;
      const p = rules.periodProgress(h, day);
      due30++; if (p.done >= p.target) done30++;
    }
    rate30 = due30 ? Math.round((done30 / due30) * 100) : null;
  }
  return { streak, longest, total: done.size, due30, done30, rate30 };
}

// ── One day of a habit's history ───────────────────────────
// 'done'    completed that day
// 'shield'  missed, but covered by a streak shield
// 'open'    today, owed and not done yet
// 'missed'  owed and not done
// 'paused'  the habit was paused
// 'rest'    nothing was owed (a rest day, a weekly or monthly habit, after its end date)
// 'before'  the habit did not exist yet
// 'future'  a day that has not come
export function dayState(habit, day, today, frozenSet) {
  if (day > today) return 'future';
  if (doneSet(habit).has(day)) return 'done';
  if (createdDay(habit) > day) return 'before';
  if (rules.isPausedOn(habit, day)) return 'paused';
  if (!owedOn(habit, day)) return 'rest';
  if (frozenSet && frozenSet.has(day)) return 'shield';
  return day === today ? 'open' : 'missed';
}
const isLate = (h, day) => !!(h.backfilled && typeof h.backfilled === 'object' && h.backfilled[day] === true) && doneSet(h).has(day);
// Done days and shield days next to each other make a run, drawn as one band.
const inRun = state => state === 'done' || state === 'shield';
function runPart(habit, day, state, today, frozenSet) {
  if (!inRun(state)) return null;
  const before = inRun(dayState(habit, rules.shiftDay(day, -1), today, frozenSet));
  const after = inRun(dayState(habit, rules.shiftDay(day, 1), today, frozenSet));
  return before && after ? 'mid' : after ? 'start' : before ? 'end' : 'single';
}
const cellOf = (h, day, today, frozenSet) => {
  const state = dayState(h, day, today, frozenSet);
  return { day, state, late: isLate(h, day), run: runPart(h, day, state, today, frozenSet), today: day === today };
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isMonth = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const stepMonth = (month, by) => { const [y, m] = month.split('-').map(Number); const n = y * 12 + (m - 1) + by; return `${Math.floor(n / 12)}-${pad2((n % 12) + 1)}`; };
// The first month the habit has anything to show: the month it was created, or of its first completion if earlier.
export function firstMonth(habit, today) {
  const h = asHabit(habit);
  const firsts = [createdDay(h), [...doneSet(h)].sort()[0] || ''].filter(isDay).sort();
  return (firsts[0] || today).slice(0, 7);
}

// ── The month calendar ─────────────────────────────────────
// Weeks run Monday to Sunday. Days of the neighbouring months fill the first and last week (inMonth: false).
// prev / next are the months the arrows lead to, or null where there is nothing to show (before the habit began,
// or after this month).
export function monthGrid(habit, month, today, frozen = []) {
  const h = asHabit(habit), frozenSet = new Set(days(frozen));
  const thisMonth = today.slice(0, 7), first = firstMonth(h, today);
  let m = isMonth(month) ? month : thisMonth;
  if (m > thisMonth) m = thisMonth;
  if (m < first) m = first;
  const start = `${m}-01`, lead = (rules.weekdayOf(start) + 6) % 7;          // Monday first
  const weeks = [];
  for (let day = rules.shiftDay(start, -lead); day.slice(0, 7) <= m; ) {
    const week = [];
    for (let i = 0; i < 7; i++, day = rules.shiftDay(day, 1)) week.push({ ...cellOf(h, day, today, frozenSet), inMonth: day.slice(0, 7) === m });
    weeks.push(week);
  }
  const [y, mo] = m.split('-').map(Number);
  const inMonth = weeks.flat().filter(c => c.inMonth);
  return {
    month: m, label: `${MONTHS[mo - 1]} ${y}`, weeks,
    prev: m > first ? stepMonth(m, -1) : null, next: m < thisMonth ? stepMonth(m, 1) : null,
    done: inMonth.filter(c => c.state === 'done').length, owed: inMonth.filter(c => ['done', 'missed', 'shield', 'open'].includes(c.state)).length,
  };
}

// ── Charts: twelve weeks, and the days of the week ─────────
const mondayOf = day => rules.shiftDay(day, -((rules.weekdayOf(day) + 6) % 7));
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The last twelve weeks, oldest first. For a day-by-day habit, `due` is the days it was owed that week (up to
// today) and `done` how many of those were done. For a habit counted by the week ("3 times a week"), `due` is its
// weekly target and `done` how far it got. A monthly habit has no weekly figures (rate null throughout).
export function weeklyRates(habit, today) {
  const h = asHabit(habit), done = doneSet(h), thisMonday = mondayOf(today), out = [];
  for (let w = 11; w >= 0; w--) {
    const start = rules.shiftDay(thisMonday, -7 * w), end = rules.shiftDay(start, 6), last = end > today ? today : end;
    let due = 0, got = 0;
    const type = rules.scheduleOn(h, last).type;
    if (type === 'times') {
      if (createdDay(h) <= last && !rules.isPausedOn(h, last) && rules.isActiveOn(h, last)) { const p = rules.periodProgress(h, last); due = p.target; got = Math.min(p.done, p.target); }
    } else if (type !== 'monthly') {
      for (let day = start; day <= last; day = rules.shiftDay(day, 1)) if (owedOn(h, day)) { due++; if (done.has(day)) got++; }
    }
    out.push({ start, due, done: got, rate: due ? Math.round((got / due) * 100) : null, current: w === 0 });
  }
  return out;
}

// The days of the week over the last twelve weeks (84 days), Monday first. For a day-by-day habit, each has the
// days it was owed and done, and a rate; `best` marks the highest rate among days owed at least three times (the
// earliest wins a tie). For other habits there is no "owed": `done` counts completions and `best` is the busiest day.
export function weekdayRates(habit, today) {
  const h = asHabit(habit), done = doneSet(h);
  const out = DAY_NAMES.map((label, i) => ({ weekday: i + 1, label, due: 0, done: 0, rate: null, best: false }));
  const daily = rules.baseFreq(h) === 'daily';
  for (let n = 0; n < 84; n++) {
    const day = rules.shiftDay(today, -n), slot = out[(rules.weekdayOf(day) + 6) % 7];
    if (daily) { if (owedOn(h, day)) { slot.due++; if (done.has(day)) slot.done++; } }
    else if (done.has(day)) slot.done++;
  }
  out.forEach(s => { s.rate = daily && s.due ? Math.round((s.done / s.due) * 100) : null; });
  const score = s => (daily ? (s.due >= 3 ? s.done / s.due : -1) : (s.done > 0 ? s.done : -1));
  const top = out.reduce((best, s) => (score(s) > score(best) ? s : best), out[0]);
  if (score(top) > 0) top.best = true;
  return out;
}
