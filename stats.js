// stats.js: what the Statistics page says. Periods, daily totals, rates, and (as batch 6 grows) the charts' series,
// the year, the balance between categories and the records.
//
// Everything is worked out from the list of habits and a day. Nothing is stored, nothing touches the page or
// Firebase; the page is drawn by stats-page.js. Unit tests: node --test tests/stats.test.js
//
// Words used here, and on the page:
//   check-in   one habit done on one day, whatever its schedule
//   owed       a day-by-day habit that was due that day (weekly and monthly habits are never owed on a day)
//   rate       done-and-owed out of owed, as a whole percent; null when nothing was owed
//   open       owed today and not done yet: not held against the rate until the day is over
// History is never re-judged: each past day is judged by the schedule that was in force on that day.
import * as rules from './habit-rules.js?v=7';
import { doneSet, owedOn, createdDay } from './habit-history.js?v=1';

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const pad2 = n => String(n).padStart(2, '0');
const real = habits => (Array.isArray(habits) ? habits.filter(h => h && typeof h === 'object') : []);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = day => day.split('-').map(Number);
export const shortDay = (day, withYear = false) => { const [y, m, d] = parts(day); return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`; };
const firstOfMonth = (day, back = 0) => { const [y, m] = parts(day); const idx = y * 12 + (m - 1) - back; return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}-01`; };
const daysBetween = (from, to) => rules.dayNumber(to) - rules.dayNumber(from) + 1;

// ── Periods ────────────────────────────────────────────────
export const PERIODS = ['week', 'month', 'year', 'all'];
export const MAX_DAYS = 3660;                                  // "all time" never looks further back than ten years

// The first day there is anything to say about: when the oldest habit was made (or, for habits with no date,
// the first day one was done). Never in the future, never more than ten years back.
export function firstDay(habits, today) {
  let first = '';
  for (const h of real(habits)) {
    const made = createdDay(h);
    let day = made;
    if (!isDay(day)) for (const d of doneSet(h)) if (!day || d < day) day = d;
    if (isDay(day) && (!first || day < first)) first = day;
  }
  const floor = rules.shiftDay(today, -(MAX_DAYS - 1));
  return !first || first > today ? today : first < floor ? floor : first;
}

// A range of days ending today, and the one before it to compare with.
//   week   today and the six days before          (before: the seven days before that)
//   month  thirty days                            (before: the thirty before)
//   year   twelve calendar months, this one last  (before: the twelve before)
//   all    since the first habit                  (nothing to compare with)
export function periodRange(period, today, habits = []) {
  const p = PERIODS.includes(period) ? period : 'week';
  let from, prev = null, label, prevLabel = '';
  if (p === 'week' || p === 'month') {
    const n = p === 'week' ? 7 : 30;
    from = rules.shiftDay(today, -(n - 1));
    prev = { from: rules.shiftDay(from, -n), to: rules.shiftDay(from, -1), days: n };
    label = `Last ${n} days`; prevLabel = `the ${n} days before`;
  } else if (p === 'year') {
    from = firstOfMonth(today, 11);
    const before = firstOfMonth(today, 23), end = rules.shiftDay(from, -1);
    prev = { from: before, to: end, days: daysBetween(before, end) };
    label = 'Last 12 months'; prevLabel = 'the 12 months before';
  } else {
    from = firstDay(habits, today);
    label = 'All time';
  }
  const sameYear = from.slice(0, 4) === today.slice(0, 4), sameMonth = sameYear && from.slice(5, 7) === today.slice(5, 7);
  const span = p === 'all' ? `Since ${shortDay(from, true)}`
    : sameMonth ? `${parts(from)[2]} – ${shortDay(today)}`
    : sameYear ? `${shortDay(from)} – ${shortDay(today)}`
    : `${shortDay(from, true)} – ${shortDay(today, true)}`;
  return { period: p, from, to: today, days: daysBetween(from, today), prev, label, prevLabel, span };
}

// ── One day ────────────────────────────────────────────────
// Whether a habit was owed and done on a day is worked out once per habit object (the app makes fresh objects
// whenever the data changes), so switching period, and every chart on the page, reuses the same answers.
const OWED = 1, DONE = 2;
const marks = new WeakMap();
function markOn(h, day) {
  let kept = marks.get(h);
  if (!kept) { kept = new Map(); marks.set(h, kept); }
  let m = kept.get(day);
  if (m === undefined) {
    m = 0;
    try { if (owedOn(h, day)) m |= OWED; } catch (_) { /* junk dates: not owed */ }
    if (doneSet(h).has(day)) m |= DONE;
    kept.set(day, m);
  }
  return m;
}
export const wasOwed = (h, day) => (markOn(h, day) & OWED) !== 0;
export const wasDone = (h, day) => (markOn(h, day) & DONE) !== 0;

// owed: due that day (today: only what is already done). doneOwed: done, of what was owed. done: every check-in.
// open: owed today and not done yet.
export function dayTotals(habits, day, today) {
  let owed = 0, doneOwed = 0, done = 0, open = 0;
  for (const h of real(habits)) {
    const m = markOn(h, day);
    if (m & DONE) done++;
    if (m & OWED) {
      if (m & DONE) { owed++; doneOwed++; }
      else if (day === today) open++;
      else owed++;
    }
  }
  return { day, owed, doneOwed, done, open };
}

// Each day of a span, oldest first.
export function eachDay(from, to, fn) {
  for (let n = rules.dayNumber(from), end = rules.dayNumber(to); n <= end; n++) fn(rules.dayKey(n));
}

// Totals over a span of days. perfect: days when everything owed was done. active: days with any check-in.
export function spanTotals(habits, from, to, today) {
  const list = real(habits);
  let owed = 0, doneOwed = 0, checkins = 0, perfect = 0, active = 0, days = 0;
  if (isDay(from) && isDay(to)) eachDay(from, to, day => {
    const t = dayTotals(list, day, today);
    owed += t.owed; doneOwed += t.doneOwed; checkins += t.done; days++;
    if (t.owed > 0 && t.doneOwed === t.owed && t.open === 0) perfect++;
    if (t.done > 0) active++;
  });
  return { owed, doneOwed, rate: pct(doneOwed, owed), checkins, perfect, active, days };
}
export const periodSummary = (habits, range) => spanTotals(habits, range.from, range.to, range.to);

// ── Each habit over the period ─────────────────────────────
// Day-by-day habits by their rate; weekly and monthly ones by how many times they were done. A habit with nothing
// owed and nothing done in the period (archived before it, say) is left out. Best first.
export function habitRates(habits, range) {
  const rows = [];
  for (const h of real(habits)) {
    let owed = 0, doneOwed = 0, done = 0;
    eachDay(range.from, range.to, day => {
      const m = markOn(h, day);
      if (m & DONE) done++;
      if ((m & OWED) && ((m & DONE) || day !== range.to)) { owed++; if (m & DONE) doneOwed++; }
    });
    if (!owed && !done) continue;
    const kind = rules.baseFreq(h);
    rows.push({ id: h.id, archived: !!h.archivedAt, name: String(h.name == null ? '' : h.name), kind, owed, done: kind === 'daily' ? doneOwed : done, extra: kind === 'daily' ? done - doneOwed : 0, rate: kind === 'daily' ? pct(doneOwed, owed) : null });
  }
  return rows.sort((a, b) => (b.rate === null ? -1 : b.rate) - (a.rate === null ? -1 : a.rate) || b.done - a.done || a.name.localeCompare(b.name));
}

// ── The bars: check-ins over the period ────────────────────
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const later = (a, b) => (a > b ? a : b), earlier = (a, b) => (a < b ? a : b);
const lastOfMonth = day => rules.shiftDay(firstOfMonth(day, -1), -1);
export const longDay = day => `${WEEKDAYS[rules.weekdayOf(day)]} ${shortDay(day)}`;

// The period cut into the pieces a chart shows: days for a week or a month, calendar months for a year, and for
// all time months (up to two years of them) or years. The first and last piece are cut to the period.
export function buckets(range) {
  const out = [];
  if (range.period === 'week' || range.period === 'month') {
    eachDay(range.from, range.to, day => out.push({ from: day, to: day, label: range.period === 'week' ? WEEKDAYS[rules.weekdayOf(day)] : String(parts(day)[2]), long: longDay(day), unit: 'day' }));
    return out;
  }
  const months = rules.monthIndex(range.to) - rules.monthIndex(range.from) + 1;
  if (range.period === 'all' && months > 24) {
    for (let y = parts(range.from)[0]; y <= parts(range.to)[0]; y++) out.push({ from: later(range.from, `${y}-01-01`), to: earlier(range.to, `${y}-12-31`), label: String(y), long: String(y), unit: 'year' });
    return out;
  }
  for (let first = firstOfMonth(range.from), i = 0; first <= range.to && i < 400; first = firstOfMonth(first, -1), i++) {
    const [y, m] = parts(first);
    out.push({ from: later(range.from, first), to: earlier(range.to, lastOfMonth(first)), label: MONTHS[m - 1], long: `${MONTHS_LONG[m - 1]} ${y}`, unit: 'month' });
  }
  return out;
}
// done: check-ins in the piece. now: the piece that holds today (still filling up).
export function barSeries(habits, range) {
  return buckets(range).map(b => {
    const t = spanTotals(habits, b.from, b.to, range.to);
    return { ...b, owed: t.owed, doneOwed: t.doneOwed, done: t.checkins, rate: t.rate, now: b.to === range.to };
  });
}

// ── Categories ─────────────────────────────────────────────
// Check-ins by category over the period, most first; categories with none are left out.
export function categoryCheckins(habits, range) {
  const counts = new Map();
  for (const h of real(habits)) {
    let n = 0;
    eachDay(range.from, range.to, day => { if (wasDone(h, day)) n++; });
    if (n) { const key = typeof h.category === 'string' && h.category ? h.category : 'health'; counts.set(key, (counts.get(key) || 0) + n); }
  }
  return [...counts].map(([key, checkins]) => ({ key, checkins })).sort((a, b) => b.checkins - a.checkins || a.key.localeCompare(b.key));
}

// ── The rate over the period, against the period before ────
// A week is seven days, a month six stretches of five days, a year its twelve months, all time its bars. The
// period before is cut the same way, so point 3 of one sits over point 3 of the other. A point where nothing was
// owed has no rate (the line breaks there; it does not dive to zero).
function trendCuts(span, period) {
  if (period !== 'month') return buckets({ ...span, period });
  const out = [];
  for (let from = span.from; from <= span.to; from = rules.shiftDay(from, 5)) {
    const to = earlier(span.to, rules.shiftDay(from, 4));
    out.push({ from, to, label: shortDay(from), long: `${shortDay(from)} to ${shortDay(to)}`, unit: 'days' });
  }
  return out;
}
export function trend(habits, range) {
  const points = span => trendCuts(span, range.period).map(b => {
    const t = spanTotals(habits, b.from, b.to, range.to);
    return { label: b.label, long: b.long, from: b.from, to: b.to, owed: t.owed, doneOwed: t.doneOwed, rate: t.rate };
  });
  const now = points(range), sum = spanTotals(habits, range.from, range.to, range.to);
  let before = null, prevRate = null;
  if (range.prev) {
    prevRate = spanTotals(habits, range.prev.from, range.prev.to, range.to).rate;
    if (prevRate !== null) before = points(range.prev);
  }
  return { now, before, rate: sum.rate, owed: sum.owed, doneOwed: sum.doneOwed, prevRate, delta: sum.rate !== null && prevRate !== null ? sum.rate - prevRate : null };
}

// ── The year, a square a day ───────────────────────────────
// Fifty-three weeks, Monday to Sunday, the last one holding today. A day's level says how much of what was due
// got done: 0 nothing, 1 under a third, 2 under two thirds, 3 not quite all, 4 all of it (or something done on a
// day nothing was due). Today is judged against everything due today, done or not.
export function heatYear(habits, today) {
  const list = real(habits);
  const start = rules.shiftDay(today, -((rules.weekdayOf(today) + 6) % 7) - 52 * 7);
  const weeks = [], months = [];
  let active = 0, perfect = 0, days = 0, lastMonth = '';
  for (let w = 0; w < 53; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = rules.shiftDay(start, w * 7 + d);
      if (day > today) { col.push({ day, future: true, today: false, level: 0, owed: 0, doneOwed: 0, done: 0 }); continue; }
      const t = dayTotals(list, day, today), due = t.owed + t.open, share = due ? t.doneOwed / due : 1;
      const level = !t.done ? 0 : !due || share >= 1 ? 4 : share < 1 / 3 ? 1 : share < 2 / 3 ? 2 : 3;
      days++; if (t.done) active++; if (due && t.doneOwed === due) perfect++;
      col.push({ day, future: false, today: day === today, level, owed: due, doneOwed: t.doneOwed, done: t.done });
    }
    const month = col[6].day.slice(0, 7);                       // a column is labelled by the month its Sunday falls in
    if (month !== lastMonth) { months.push({ col: w, label: MONTHS[Number(month.slice(5)) - 1] }); lastMonth = month; }
    weeks.push(col);
  }
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();   // no room for a sliver of a month
  return { weeks, months, active, perfect, days, from: start, to: today };
}

// One day, by name: what was done, what was missed, and (today) what is still open.
export function dayDetail(habits, day, today) {
  const doneNames = [], missedNames = [], openNames = [];
  for (const h of real(habits)) {
    const name = String(h.name == null ? '' : h.name);
    if (wasDone(h, day)) doneNames.push(name);
    else if (wasOwed(h, day)) (day === today ? openNames : missedNames).push(name);
  }
  const t = dayTotals(habits, day, today);
  return { day, long: `${longDay(day)} ${day.slice(0, 4)}`, owed: t.owed + t.open, doneOwed: t.doneOwed, done: t.done, doneNames, missedNames, openNames };
}
