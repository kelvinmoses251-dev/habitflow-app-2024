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
// ── The bars ───────────────────────────────────────────────
test('barSeries: a week is seven days, named by weekday', async () => {
  const { periodRange, barSeries } = await load();
  const habits = [H('Read', range(0, 6)), H('Run', [1, 2, 3]), H('Call', [2], { frequency: 'weekly' })];
  const bars = barSeries(habits, periodRange('week', TODAY, habits));
  assert.deepEqual(bars.map(b => b.label), ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']);
  assert.deepEqual(bars.map(b => b.done), [1, 1, 1, 2, 3, 2, 1]);
  assert.deepEqual(bars.map(b => b.now), [false, false, false, false, false, false, true]);
  assert.equal(bars[4].long, 'Mon 23 Nov');
  assert.deepEqual([bars[4].owed, bars[4].doneOwed, bars[4].rate], [2, 2, 100]);
});

test('barSeries: a month is thirty days, a year is twelve months', async () => {
  const { periodRange, barSeries } = await load();
  const habits = [H('Read', range(0, 400))];
  const month = barSeries(habits, periodRange('month', TODAY, habits));
  assert.equal(month.length, 30);
  assert.deepEqual([month[0].label, month[29].label, month[29].long], ['27', '25', 'Wed 25 Nov']);
  const year = barSeries(habits, periodRange('year', TODAY, habits));
  assert.deepEqual(year.map(b => b.label), ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
  assert.deepEqual([year[0].done, year[2].done, year[11].done, year[11].to, year[0].long], [31, 28, 25, '2026-11-25', 'December 2025']);
});

test('barSeries: all time is by month up to two years, then by year', async () => {
  const { periodRange, barSeries } = await load();
  const young = [H('Read', range(0, 10), { createdAt: '2026-03-10T09:00:00' })];
  const months = barSeries(young, periodRange('all', TODAY, young));
  assert.deepEqual(months.map(b => b.label), ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
  assert.equal(months[0].from, '2026-03-10', 'the first month starts when the habit did');
  const old = [H('Read', range(0, 10), { createdAt: '2022-06-01T09:00:00' })];
  const years = barSeries(old, periodRange('all', TODAY, old));
  assert.deepEqual(years.map(b => b.label), ['2022', '2023', '2024', '2025', '2026']);
  assert.deepEqual([years[0].from, years[4].to, years[4].done], ['2022-06-01', TODAY, 11]);
});


// ── The trend ──────────────────────────────────────────────
test('trend: this week against the week before, point by point', async () => {
  const { periodRange, trend } = await load();
  const habits = [H('Read', [...range(0, 6), 8, 10, 12])];
  const t = trend(habits, periodRange('week', TODAY, habits));
  assert.deepEqual(t.now.map(p => p.rate), [100, 100, 100, 100, 100, 100, 100]);
  assert.deepEqual(t.before.map(p => p.rate), [0, 100, 0, 100, 0, 100, 0]);
  assert.deepEqual([t.rate, t.prevRate, t.delta], [100, 43, 57]);
  assert.equal(t.now[6].long, 'Wed 25 Nov');
});

test('trend: with nothing owed before, there is no earlier line and no delta', async () => {
  const { periodRange, trend } = await load();
  const young = [H('Read', range(0, 4), { createdAt: ago(4) + 'T08:00:00' })];
  const t = trend(young, periodRange('week', TODAY, young));
  assert.deepEqual([t.before, t.prevRate, t.delta, t.rate], [null, null, null, 100]);
  assert.deepEqual(t.now.map(p => p.rate), [null, null, 100, 100, 100, 100, 100]);
  const all = trend(young, periodRange('all', TODAY, young));
  assert.deepEqual([all.before, all.delta, all.now.length], [null, null, 1]);
});

test('trend: a day when nothing was due has no rate, rather than zero', async () => {
  const { periodRange, trend } = await load();
  const weekdays = [H('Work out', range(0, 6), { schedule: { type: 'days', days: [1, 2, 3, 4, 5] } })];
  const t = trend(weekdays, periodRange('week', TODAY, weekdays));
  assert.deepEqual(t.now.map(p => p.rate), [100, 100, null, null, 100, 100, 100]);   // Thu Fri Sat Sun Mon Tue Wed
});

test('trend: a month is six stretches of five days; a year is its twelve months, each against a year earlier', async () => {
  const { periodRange, trend } = await load();
  const habits = [H('Read', range(0, 800).filter(n => n < 30 || n % 2))];
  const m = trend(habits, periodRange('month', TODAY, habits));
  assert.equal(m.now.length, 6);
  assert.deepEqual([m.now[0].label, m.now[0].long, m.now[5].long], ['27 Oct', '27 Oct to 31 Oct', '21 Nov to 25 Nov']);
  assert.equal(m.before.length, 6);
  assert.equal(m.rate, 100);
  const y = trend(habits, periodRange('year', TODAY, habits));
  assert.deepEqual([y.now.length, y.before.length, y.now[11].label, y.before[11].long], [12, 12, 'Nov', 'November 2025']);
  assert.ok(y.delta > 0);
});

// ── The year ───────────────────────────────────────────────
test('heatYear: fifty-three weeks from a Monday, the last one holding today', async () => {
  const { heatYear } = await load();
  const y = heatYear([H('Read', range(0, 20)), H('Run', [1, 2, 3]), H('Call', [2], { frequency: 'weekly' })], TODAY);
  assert.equal(y.weeks.length, 53);
  assert.ok(y.weeks.every(w => w.length === 7));
  assert.equal(y.weeks[0][0].day, '2025-11-24');
  assert.deepEqual(y.weeks[52].map(c => [c.day.slice(8), c.future, c.today]), [['23', false, false], ['24', false, false], ['25', false, true], ['26', true, false], ['27', true, false], ['28', true, false], ['29', true, false]]);
  assert.equal(y.days, 367);
  assert.equal(y.active, 21);
  assert.equal(y.perfect, 3);
});

test('heatYear: the level of a day is the share of what was due that got done', async () => {
  const { heatYear } = await load();
  const habits = [H('A', [1, 2, 3, 4]), H('B', [1, 2, 3]), H('C', [1, 2]), H('D', [1, 6], {}), H('W', [8], { frequency: 'weekly' })];
  const y = heatYear(habits, TODAY), at = n => y.weeks.flat().find(c => c.day === ago(n));
  assert.deepEqual([1, 2, 3, 4, 5, 6, 8].map(n => at(n).level), [4, 3, 2, 1, 0, 1, 1]);
  assert.deepEqual([at(0).level, at(0).owed], [0, 4], 'today, nothing done yet');
  const rest = heatYear([H('Weekends', [3], { schedule: { type: 'days', days: [1, 2, 3, 4, 5] } })], TODAY).weeks.flat().find(c => c.day === ago(3));
  assert.deepEqual([rest.level, rest.owed, rest.done], [4, 0, 1], 'something done on a day nothing was due');
});

test('heatYear: month labels sit over the week their month begins in, with no sliver at the start', async () => {
  const { heatYear } = await load();
  const y = heatYear([], TODAY);
  assert.deepEqual(y.months.map(m => m.label), ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov']);
  assert.ok(y.months.every((m, i) => !i || m.col - y.months[i - 1].col >= 3));
});

test('dayDetail: a day by name', async () => {
  const { dayDetail } = await load();
  const habits = [H('Read', [0, 1]), H('Run', [1]), H('Swim', []), H('Call', [1], { frequency: 'weekly' })];
  assert.deepEqual(dayDetail(habits, ago(1), TODAY), { day: ago(1), long: 'Tue 24 Nov 2026', owed: 3, doneOwed: 2, done: 3, doneNames: ['Read', 'Run', 'Call'], missedNames: ['Swim'], openNames: [] });
  const now = dayDetail(habits, TODAY, TODAY);
  assert.deepEqual([now.owed, now.doneOwed, now.doneNames, now.missedNames, now.openNames], [3, 1, ['Read'], [], ['Run', 'Swim']]);
});

// ── The balance between categories ─────────────────────────
test('categoryBalance: check-ins, share and rate for each category, most first', async () => {
  const { periodRange, categoryBalance } = await load();
  const habits = [H('Read', range(0, 6), { category: 'reading' }), H('Run', [1, 2], { category: 'fitness' }), H('Lift', [1], { category: 'fitness' }), H('Call', [2], { category: 'social', frequency: 'weekly' })];
  const rows = categoryBalance(habits, periodRange('week', TODAY, habits), ['health', 'reading', 'fitness', 'social']);
  assert.deepEqual(rows, [
    { key: 'reading', habits: 1, checkins: 7, share: 64, owed: 7, doneOwed: 7, rate: 100 },
    { key: 'fitness', habits: 2, checkins: 3, share: 27, owed: 12, doneOwed: 3, rate: 25 },
    { key: 'social', habits: 1, checkins: 1, share: 9, owed: 0, doneOwed: 0, rate: null },
  ]);
});

test('categoryBalance: shares are whole percents that add up to 100', async () => {
  const { periodRange, categoryBalance } = await load();
  const habits = [H('A', [1], { category: 'a' }), H('B', [1], { category: 'b' }), H('C', [1], { category: 'c' })];
  const rows = categoryBalance(habits, periodRange('week', TODAY, habits));
  assert.deepEqual(rows.map(r => r.share), [34, 33, 33]);
  const seven = [H('A', [1, 2, 3], { category: 'a' }), H('B', [1, 2], { category: 'b' }), H('C', [1, 2], { category: 'c' })];
  assert.equal(categoryBalance(seven, periodRange('week', TODAY, seven)).reduce((s, r) => s + r.share, 0), 100);
});

test('categoryBalance: a category with habits and no check-ins is listed as quiet; an archived one is not', async () => {
  const { periodRange, categoryBalance } = await load();
  const habits = [H('Read', [1], { category: 'reading' }), H('Sit', [], { category: 'mind' }), H('Gone', [], { category: 'saving', archivedAt: num(ago(40)) * 864e5, archivedOn: ago(40) }), H('Odd', [2], { category: 'nonsense' })];
  const rows = categoryBalance(habits, periodRange('week', TODAY, habits), ['health', 'reading', 'mind', 'saving']);
  assert.deepEqual(rows.map(r => [r.key, r.habits, r.checkins, r.share]), [['health', 1, 1, 50], ['reading', 1, 1, 50], ['mind', 1, 0, 0]]);
  assert.deepEqual(categoryBalance([], periodRange('week', TODAY, [])), []);
  const none = categoryBalance([H('Sit', [], { category: 'mind' })], periodRange('week', TODAY, []), ['health', 'mind']);
  assert.deepEqual([none.length, none[0].share, none[0].rate], [1, 0, 0]);
});
