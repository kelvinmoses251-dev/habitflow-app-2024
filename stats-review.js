// stats-review.js: looking back. The weekly review (and, as batch 6 grows, the month and year stories and the
// suggestions drawn from the data).
//
// Pure: everything is worked out from the list of habits and a day. Nothing is stored here and nothing touches
// the page. Unit tests: node --test tests/stats-review.test.js
import * as rules from './habit-rules.js?v=7';
import { spanTotals, wasOwed, wasDone, eachDay, shortDay } from './stats.js?v=1';

const real = habits => (Array.isArray(habits) ? habits.filter(h => h && typeof h === 'object') : []);
const nameOf = h => String(h.name == null ? '' : h.name);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const inPlay = (h, day) => !h.archivedAt && !rules.hasEndedOn(h, day) && !rules.notStartedOn(h, day);

// ── The weekly review ──────────────────────────────────────
export const WIN_RATE = 80;                                   // a day-by-day habit at or above this had a good week
export const SLIP_RATE = 50;                                  // below this, with at least two days owed, it slipped
export const REVIEWS_KEPT = 26;                               // half a year of reviews is remembered

// The Monday of the week `day` is in.
export const mondayOf = day => rules.shiftDay(day, -((rules.weekdayOf(day) + 6) % 7));

// One habit over a span: what was owed, what of it was done, and every time it was done.
function habitSpan(h, from, to) {
  let owed = 0, doneOwed = 0, done = 0;
  eachDay(from, to, day => {
    const d = wasDone(h, day);
    if (d) done++;
    if (wasOwed(h, day)) { owed++; if (d) doneOwed++; }
  });
  return { owed, doneOwed, done };
}

// The last finished week, Monday to Sunday: the figures, the same for the week before, and each habit sorted into
// what went well, what slipped and what was never touched. Habits that are archived, ended or paused today are
// not put up for a decision (there is nothing to decide about them).
export function weekReview(habits, today) {
  const list = real(habits);
  const from = rules.shiftDay(mondayOf(today), -7), to = rules.shiftDay(from, 6);
  const now = spanTotals(list, from, to, today), before = spanTotals(list, rules.shiftDay(from, -7), rules.shiftDay(from, -1), today);
  const wins = [], slipped = [], steady = [], quiet = [];
  for (const h of list) {
    const s = habitSpan(h, from, to), kind = rules.baseFreq(h);
    if (!s.owed && !s.done) { if (inPlay(h, to) && !rules.isPausedOn(h, to) && kind !== 'daily') quiet.push({ id: h.id, name: nameOf(h), kind }); continue; }
    const row = { id: h.id, name: nameOf(h), kind, owed: s.owed, done: kind === 'daily' ? s.doneOwed : s.done, rate: kind === 'daily' ? pct(s.doneOwed, s.owed) : null };
    const live = inPlay(h, today) && !rules.isPausedOn(h, today);
    if (kind !== 'daily') { if (s.done) wins.push(row); continue; }
    if (row.rate !== null && row.rate >= WIN_RATE) wins.push(row);
    else if (row.rate !== null && row.rate < SLIP_RATE && s.owed >= 2 && live) slipped.push(row);
    else steady.push(row);
  }
  wins.sort((a, b) => (b.rate === null ? -1 : b.rate) - (a.rate === null ? -1 : a.rate) || b.done - a.done || a.name.localeCompare(b.name));
  slipped.sort((a, b) => a.rate - b.rate || b.owed - a.owed || a.name.localeCompare(b.name));
  return {
    key: from, from, to, label: `${shortDay(from)} to ${shortDay(to)}`,
    now, before, delta: now.rate !== null && before.rate !== null ? now.rate - before.rate : null,
    wins, slipped, steady, quiet, any: now.owed > 0 || now.checkins > 0,
  };
}

// The habits a focus can be chosen from: in play today, not paused, and not about to be paused.
export function focusChoices(habits, today, pausing = []) {
  return real(habits).filter(h => inPlay(h, today) && !rules.isPausedOn(h, today) && !pausing.includes(h.id)).map(h => ({ id: h.id, name: nameOf(h), kind: rules.baseFreq(h) }));
}

// How the focus habit is doing this week (Monday to today). Today is not held against it until it is over.
export function focusProgress(habit, today) {
  if (!habit || typeof habit !== 'object') return null;
  const kind = rules.baseFreq(habit), from = mondayOf(today);
  if (kind !== 'daily') {
    let done = 0;
    eachDay(kind === 'weekly' ? from : today.slice(0, 8) + '01', today, day => { if (wasDone(habit, day)) done++; });
    return { kind, done, owed: null };
  }
  let owed = 0, done = 0;
  eachDay(from, today, day => { if (!wasOwed(habit, day)) return; const d = wasDone(habit, day); if (d || day !== today) owed++; if (d) done++; });
  return { kind, done, owed };
}

// The reviews to store after one more: the new entry added (or replacing the same week), only the newest kept,
// and anything that is not a review dropped. The whole map is written back as one field.
export function withReview(reviews, key, entry) {
  const all = {};
  if (reviews && typeof reviews === 'object' && !Array.isArray(reviews)) {
    for (const [k, v] of Object.entries(reviews)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object' && Number.isFinite(v.at)) all[k] = { at: v.at, focus: typeof v.focus === 'string' ? v.focus : null };
  }
  all[key] = { at: entry.at, focus: typeof entry.focus === 'string' && entry.focus ? entry.focus : null };
  return Object.fromEntries(Object.keys(all).sort().slice(-REVIEWS_KEPT).map(k => [k, all[k]]));
}

// ── The month and the year, told as a short story ──────────
// A handful of slides, each one figure and one sentence, in the order a person would tell it. A slide appears
// only when there is something true to say; nothing is rounded up or invented.
//   month  the last finished calendar month when it has check-ins, else this month so far
//   year   this calendar year so far (in January: the year that just ended)
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = n => String(n).padStart(2, '0');
const monthStart = (y, m) => `${y}-${pad2(m)}-01`;                                  // m: 1 to 12
const monthEnd = (y, m) => rules.shiftDay(m === 12 ? monthStart(y + 1, 1) : monthStart(y, m + 1), -1);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const STORY_MIN_SLIDES = 3;
export const WEEKDAY_SPREAD = 25;                             // points between the best and hardest weekday before it is worth saying

function storySpan(kind, today) {
  const [y, m] = today.split('-').map(Number);
  if (kind === 'year') {
    const year = m === 1 ? y - 1 : y;
    return { from: monthStart(year, 1), to: m === 1 ? monthEnd(year, 12) : today, title: m === 1 ? String(year) : `${year} so far`, name: String(year),
      prev: { from: monthStart(year - 1, 1), to: monthEnd(year - 1, 12), name: String(year - 1) } };
  }
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1, ppy = pm === 1 ? py - 1 : py, ppm = pm === 1 ? 12 : pm - 1;
  return {
    last: { from: monthStart(py, pm), to: monthEnd(py, pm), title: `${MONTH_NAMES[pm - 1]} ${py}`, name: MONTH_NAMES[pm - 1], prev: { from: monthStart(ppy, ppm), to: monthEnd(ppy, ppm), name: MONTH_NAMES[ppm - 1] } },
    current: { from: monthStart(y, m), to: today, title: `${MONTH_NAMES[m - 1]} ${y} so far`, name: MONTH_NAMES[m - 1], prev: { from: monthStart(py, pm), to: monthEnd(py, pm), name: MONTH_NAMES[pm - 1] } },
  };
}

export function story(habits, kind, today) {
  const list = real(habits), k = kind === 'year' ? 'year' : 'month';
  let span = storySpan(k, today);
  if (k === 'month') span = spanTotals(list, span.last.from, span.last.to, today).checkins ? span.last : span.current;
  const sum = spanTotals(list, span.from, span.to, today);
  if (!sum.checkins) return null;
  const slides = [], unit = k === 'year' ? 'year' : 'month';
  const add = (id, kicker, big, line) => slides.push({ id, kicker, big, line });

  // 1. Showing up
  add('days', 'You showed up', `${sum.active} of ${plural(sum.days, 'day')}`,
    `${sum.active === sum.days ? `You did at least one habit on every day of the ${unit}.` : `You did at least one habit on ${plural(sum.active, 'day')}.`} ${plural(sum.checkins, 'check-in')} in all.`);

  // 2. The rate, against the period before
  if (sum.rate !== null) {
    const before = spanTotals(list, span.prev.from, span.prev.to, today).rate, d = before === null ? null : sum.rate - before;
    add('rate', 'Of everything due', `${sum.rate}%`, `${sum.doneOwed} of ${sum.owed} due.${d === null ? '' : d === 0 ? ` The same as ${span.prev.name}.` : ` ${d > 0 ? 'Up' : 'Down'} ${plural(Math.abs(d), 'point')} on ${span.prev.name}.`}`);
  }

  // 3. The steadiest habit: the best rate among day-by-day habits owed at least five days; else the one done most
  let top = null;
  for (const h of list) {
    const s = habitSpan(h, span.from, span.to), daily = rules.baseFreq(h) === 'daily' && s.owed >= 5;
    if (!s.done) continue;
    const c = { name: nameOf(h), daily, rate: daily ? s.doneOwed / s.owed : -1, done: s.doneOwed, owed: s.owed, all: s.done };
    if (!top || c.rate > top.rate || (c.rate === top.rate && c.all > top.all)) top = c;
  }
  if (top) add('top', 'Your steadiest habit', top.name, top.daily ? `Done on ${top.done} of ${plural(top.owed, 'day')}.` : `Done ${plural(top.all, 'time')}.`);

  // 4. Perfect days: the longest run of them, or how many there were
  let best = { len: 0, from: '', to: '' }, len = 0, start = '', fullest = { n: 0, day: '' };
  const byWeekday = Array.from({ length: 7 }, () => ({ owed: 0, done: 0 }));
  eachDay(span.from, span.to, day => {
    const t = spanTotals(list, day, day, today), w = byWeekday[rules.weekdayOf(day)];
    w.owed += t.owed; w.done += t.doneOwed;
    if (t.checkins >= fullest.n && t.checkins > 0) fullest = { n: t.checkins, day };
    if (t.perfect) { if (!len) start = day; len++; if (len > best.len) best = { len, from: start, to: day }; } else len = 0;
  });
  if (best.len >= 2) add('run', 'Your best run', plural(best.len, 'day'), `Everything due was done ${best.len} days in a row, ${shortDay(best.from)} to ${shortDay(best.to)}.`);
  else if (sum.perfect) add('perfect', 'Nothing left undone', plural(sum.perfect, 'perfect day'), 'Days when everything due was done.');

  // 5. A year names its best month
  if (k === 'year') {
    let month = null;
    const year = Number(span.from.slice(0, 4));
    for (let m = 1; m <= 12 && monthStart(year, m) <= span.to; m++) {
      const to = monthEnd(year, m), t = spanTotals(list, monthStart(year, m), to < span.to ? to : span.to, today);
      if (t.owed >= 10 && (!month || t.rate > month.rate)) month = { name: MONTH_NAMES[m - 1], rate: t.rate, done: t.doneOwed, owed: t.owed };
    }
    if (month) add('month', 'Your best month', month.name, `${month.rate}% of what was due: ${month.done} of ${month.owed}.`);
  }

  // 6. The shape of the week, when the best and the hardest day really differ
  const days = byWeekday.map((w, i) => ({ i, owed: w.owed, rate: pct(w.done, w.owed) })).filter(w => w.owed >= 3);
  if (days.length >= 2) {
    const order = i => (i + 6) % 7;                             // Monday first
    const hi = days.reduce((a, b) => (b.rate > a.rate || (b.rate === a.rate && order(b.i) < order(a.i)) ? b : a));
    const lo = days.reduce((a, b) => (b.rate < a.rate || (b.rate === a.rate && order(b.i) < order(a.i)) ? b : a));
    if (hi.rate - lo.rate >= WEEKDAY_SPREAD) add('weekday', 'Your best day of the week', DAY_NAMES[hi.i], `${hi.rate}% of what was due on ${DAY_NAMES[hi.i]}. The hardest day: ${DAY_NAMES[lo.i]}, at ${lo.rate}%.`);
  }

  // 7. The fullest single day
  if (fullest.n >= 2) add('busiest', 'One day stood out', plural(fullest.n, 'check-in'), `Your fullest day: ${DAY_SHORT[rules.weekdayOf(fullest.day)]} ${shortDay(fullest.day)}.`);

  // 8. The whole of it on one slide (this is the one that can be saved as a picture)
  add('sum', span.title, sum.rate === null ? plural(sum.checkins, 'check-in') : `${sum.rate}%`,
    `${plural(sum.checkins, 'check-in')} on ${plural(sum.active, 'day')}${sum.perfect ? `, ${plural(sum.perfect, 'perfect day')}` : ''}.`);

  return { kind: k, title: span.title, from: span.from, to: span.to, enough: slides.length >= STORY_MIN_SLIDES,
    sum: { rate: sum.rate, checkins: sum.checkins, active: sum.active, days: sum.days, perfect: sum.perfect }, slides };
}
