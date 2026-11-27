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
