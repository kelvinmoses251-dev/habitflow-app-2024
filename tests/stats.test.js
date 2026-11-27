// Run with: node --test tests/stats.test.js
// What the Statistics page says, worked out from the habits alone. Pure functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'stats.js')).href);

const num = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const key = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const TODAY = '2026-11-25';                                   // a Wednesday
const ago = n => key(num(TODAY) - n);
const range = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(n); return out; };
const H = (name, days = [], o = {}) => ({ id: name.toLowerCase(), name, category: 'health', frequency: 'daily', completedDates: days.map(ago), createdAt: '2020-01-05T10:00:00Z', ...o });

test('the stats modules load the same copies of the habit rules and history as the app', () => {
  const v = (f, re) => (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(re) || [])[1];
  for (const f of ['stats.js']) {
    assert.equal(v(f, /habit-rules\.js\?v=(\d+)/), v('app.js', /habit-rules\.js\?v=(\d+)/), f);
    assert.equal(v(f, /habit-history\.js\?v=(\d+)/), v('app.js', /habit-history\.js\?v=(\d+)/), f);
  }
});

// ── Periods ────────────────────────────────────────────────
test('periodRange: a week is today and the six days before, compared with the seven before that', async () => {
  const { periodRange } = await load();
  const r = periodRange('week', TODAY, []);
  assert.deepEqual([r.from, r.to, r.days], ['2026-11-19', '2026-11-25', 7]);
  assert.deepEqual(r.prev, { from: '2026-11-12', to: '2026-11-18', days: 7 });
  assert.equal(r.label, 'Last 7 days');
  assert.equal(r.span, '19 – 25 Nov');
});

test('periodRange: a month is thirty days', async () => {
  const { periodRange } = await load();
  const r = periodRange('month', TODAY, []);
  assert.deepEqual([r.from, r.to, r.days], ['2026-10-27', '2026-11-25', 30]);
  assert.deepEqual(r.prev, { from: '2026-09-27', to: '2026-10-26', days: 30 });
  assert.equal(r.span, '27 Oct – 25 Nov');
});

test('periodRange: a year is twelve calendar months ending with this one', async () => {
  const { periodRange } = await load();
  const r = periodRange('year', TODAY, []);
  assert.deepEqual([r.from, r.to], ['2025-12-01', '2026-11-25']);
  assert.deepEqual([r.prev.from, r.prev.to], ['2024-12-01', '2025-11-30']);
  assert.equal(r.days, 360);
  assert.equal(r.span, '1 Dec 2025 – 25 Nov 2026');
  const leap = periodRange('year', '2024-02-29', []);
  assert.deepEqual([leap.from, leap.prev.from, leap.prev.to], ['2023-03-01', '2022-03-01', '2023-02-28']);
  const jan = periodRange('year', '2027-01-03', []);
  assert.deepEqual([jan.from, jan.to], ['2026-02-01', '2027-01-03']);
});

test('periodRange: all time starts when the first habit did, and has nothing to compare with', async () => {
  const { periodRange } = await load();
  const r = periodRange('all', TODAY, [H('Read', [3], { createdAt: '2026-03-10T09:00:00' }), H('Run', [], { createdAt: '2026-01-02T09:00:00' })]);
  assert.deepEqual([r.from, r.to, r.prev], ['2026-01-02', TODAY, null]);
  assert.equal(r.span, 'Since 2 Jan 2026');
  assert.equal(periodRange('all', TODAY, []).from, TODAY);
  assert.equal(periodRange('all', TODAY, [H('Old', [], { createdAt: '1990-01-01T00:00:00' })]).days, 3660, 'never more than ten years of days');
  assert.equal(periodRange('nonsense', TODAY, []).period, 'week', 'an unknown period falls back to the week');
});

// ── One day ────────────────────────────────────────────────
test('dayTotals: what was owed, what of it was done, and every check-in', async () => {
  const { dayTotals } = await load();
  const habits = [H('Read', [1]), H('Run', []), H('Call', [1], { frequency: 'weekly' })];
  assert.deepEqual(dayTotals(habits, ago(1), TODAY), { day: ago(1), owed: 2, doneOwed: 1, done: 2, open: 0 });
});

test('dayTotals: today, what is not done yet is open, not missed', async () => {
  const { dayTotals } = await load();
  const habits = [H('Read', [0]), H('Run', [])];
  assert.deepEqual(dayTotals(habits, TODAY, TODAY), { day: TODAY, owed: 1, doneOwed: 1, done: 1, open: 1 });
});

test('dayTotals: nothing is owed before a habit existed, on a rest day, while paused or once archived', async () => {
  const { dayTotals } = await load();
  const young = H('Young', [], { createdAt: ago(2) + 'T08:00:00' });
  assert.equal(dayTotals([young], ago(3), TODAY).owed, 0);
  assert.equal(dayTotals([young], ago(2), TODAY).owed, 1);
  const paused = H('Paused', [], { pauses: [{ from: ago(5), to: ago(3) }] });
  assert.equal(dayTotals([paused], ago(4), TODAY).owed, 0);
  assert.equal(dayTotals([paused], ago(2), TODAY).owed, 1);
  assert.deepEqual(dayTotals([null, 'junk', undefined], ago(1), TODAY), { day: ago(1), owed: 0, doneOwed: 0, done: 0, open: 0 });
});

// ── A period ───────────────────────────────────────────────
test('periodSummary: rate, check-ins, perfect and active days for the week', async () => {
  const { periodRange, periodSummary } = await load();
  const habits = [H('Read', range(0, 6)), H('Run', [1, 2, 3]), H('Call', [2], { frequency: 'weekly' })];
  const s = periodSummary(habits, periodRange('week', TODAY, habits));
  // Owed: Read 7, Run 6 (today is still open for Run). Done of that: 7 + 3.
  assert.deepEqual(s, { owed: 13, doneOwed: 10, rate: 77, checkins: 11, perfect: 3, active: 7, days: 7 });
});

test('periodSummary: with nothing owed the rate is unknown, not zero', async () => {
  const { periodRange, periodSummary } = await load();
  const habits = [H('Call', [2, 9], { frequency: 'weekly' })];
  const s = periodSummary(habits, periodRange('month', TODAY, habits));
  assert.deepEqual([s.owed, s.rate, s.checkins, s.perfect, s.active], [0, null, 2, 0, 2]);
  assert.equal(periodSummary([], periodRange('all', TODAY, [])).rate, null);
});

test('periodSummary: history is not re-judged when the schedule changes', async () => {
  const { periodRange, periodSummary } = await load();
  // Daily until three days ago, weekly since: the days before stay owed, the days since are not.
  const h = H('Swim', [5, 6], { frequency: 'weekly', scheduleHistory: [{ from: '2020-01-05', schedule: { type: 'daily' } }, { from: ago(3), schedule: { type: 'times', times: 1 } }] });
  const s = periodSummary([h], periodRange('week', TODAY, [h]));
  assert.deepEqual([s.owed, s.doneOwed, s.rate, s.checkins], [3, 2, 67, 2]);
});

test('habitRates: each habit over the period, best first; weekly habits by count', async () => {
  const { periodRange, habitRates } = await load();
  const habits = [H('Run', [1, 2, 3]), H('Read', range(0, 6)), H('Call', [2], { frequency: 'weekly' }), H('Gone', [], { archivedAt: num(ago(40)) * 864e5 })];
  const rows = habitRates(habits, periodRange('week', TODAY, habits));
  assert.deepEqual(rows.map(r => [r.name, r.kind, r.owed, r.done, r.rate]), [['Read', 'daily', 7, 7, 100], ['Run', 'daily', 6, 3, 50], ['Call', 'weekly', 0, 1, null]]);
});

test('a long history is summed quickly, and again at once', async () => {
  const { periodRange, periodSummary } = await load();
  const habits = Array.from({ length: 30 }, (_, i) => H('H' + i, range(0, 1800).filter(n => (n + i) % 3), { createdAt: '2021-06-01T08:00:00' }));
  const r = periodRange('all', TODAY, habits);
  let t = performance.now(); const a = periodSummary(habits, r); const first = performance.now() - t;
  t = performance.now(); const b = periodSummary(habits, r); const again = performance.now() - t;
  assert.deepEqual(a, b);
  assert.ok(first < 1500, 'first pass ' + Math.round(first) + ' ms');
  assert.ok(again < 60, 'second pass ' + Math.round(again) + ' ms');
});
