// habit-history.js: what a habit's own page says about it. The summary figures, the month calendar, the charts,
// the year, the notes search, the insights.
//
// Everything is worked out from the one habit. Nothing is stored, nothing touches the page or Firebase; the page
// is drawn by habit-page.js. Unit tests: node --test tests/habit-history.test.js
//
// Days are local calendar days as "YYYY-MM-DD" keys, as in habit-rules.js, which decides what was due and done.
// History is never re-judged: each past day is judged by the schedule that was in force on that day.
import * as rules from './habit-rules.js?v=6';

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
