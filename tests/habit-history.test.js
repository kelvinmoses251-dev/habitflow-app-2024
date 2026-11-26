// Run with: node --test tests/habit-history.test.js
// What a habit's own page says about it, worked out from the habit alone. Pure functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'habit-history.js')).href);

const num = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const key = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const TODAY = '2026-11-25';                                   // a Wednesday
const ago = n => key(num(TODAY) - n);
const range = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(n); return out; };
const H = (name, days = [], o = {}) => ({ id: name.toLowerCase(), name, category: 'health', frequency: 'daily', completedDates: days.map(ago), createdAt: '2020-01-05T10:00:00Z', ...o });

test('habit-history.js loads the same copy of the habit rules as the app', () => {
  const v = f => (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(/habit-rules\.js\?v=(\d+)/) || [])[1];
  assert.ok(v('app.js'));
  assert.equal(v('habit-history.js'), v('app.js'));
});

// ── Summary ────────────────────────────────────────────────
test('habitSummary: streak, longest, total and the last 30 days as a share of what was due', async () => {
  const { habitSummary } = await load();
  const s = habitSummary(H('Read', [...range(1, 12), 20, 21]), TODAY);
  assert.deepEqual(s, { streak: 12, longest: 12, total: 14, due30: 30, done30: 14, rate30: 47 });
});

test('habitSummary: rest days, paused days and days before the habit existed are not owed', async () => {
  const { habitSummary } = await load();
  const weekdays = habitSummary(H('Gym', [0, 1, 2, 5], { schedule: { type: 'days', days: [1, 2, 3, 4, 5] } }), TODAY);
  assert.equal(weekdays.due30, 22); assert.equal(weekdays.done30, 4); assert.equal(weekdays.rate30, 18);
  const paused = habitSummary(H('Swim', [0, 1], { pauses: [{ from: ago(20), to: ago(5) }] }), TODAY);
  assert.equal(paused.due30, 14); assert.equal(paused.done30, 2);
  const fresh = habitSummary(H('New', [0, 1, 2], { createdAt: new Date(num(ago(2)) * 86400000 + 12 * 3600000).toISOString() }), TODAY);
  assert.equal(fresh.due30, 3); assert.equal(fresh.rate30, 100);
});

test('habitSummary: a weekly habit is judged over the last four weeks, a monthly one has no 30-day figure', async () => {
  const { habitSummary } = await load();
  const weekly = habitSummary(H('Call home', [2, 9, 23], { frequency: 'weekly' }), TODAY);
  assert.equal(weekly.due30, 4); assert.equal(weekly.done30, 3); assert.equal(weekly.rate30, 75);
  const monthly = habitSummary(H('Budget', [3], { frequency: 'monthly' }), TODAY);
  assert.equal(monthly.rate30, null);
  assert.equal(monthly.total, 1);
});

test('habitSummary: an empty habit, a shield day, and junk', async () => {
  const { habitSummary } = await load();
  assert.deepEqual(habitSummary(H('Read'), TODAY), { streak: 0, longest: 0, total: 0, due30: 30, done30: 0, rate30: 0 });
  assert.equal(habitSummary(H('Read', [0, 2, 3]), TODAY, [ago(1)]).streak, 4);
  for (const bad of [null, undefined, {}, { completedDates: 'no' }, { completedDates: ['banana', 3, null] }]) {
    const s = habitSummary(bad, TODAY, 'no');
    assert.equal(s.total, 0); assert.equal(s.streak, 0);
  }
});

// ── The month calendar ─────────────────────────────────────
const cell = (grid, day) => grid.weeks.flat().find(c => c.day === day);

test('monthGrid: weeks run Monday to Sunday and cover the whole month', async () => {
  const { monthGrid } = await load();
  const g = monthGrid(H('Read'), '2026-11', TODAY);
  assert.equal(g.month, '2026-11'); assert.equal(g.label, 'November 2026');
  assert.equal(g.weeks.length, 6);                            // 1 November 2026 is a Sunday
  assert.ok(g.weeks.every(w => w.length === 7));
  assert.equal(g.weeks[0][0].day, '2026-10-26'); assert.equal(g.weeks[0][0].inMonth, false);
  assert.equal(g.weeks[0][6].day, '2026-11-01'); assert.equal(g.weeks[0][6].inMonth, true);
  assert.equal(g.weeks[5][0].day, '2026-11-30'); assert.equal(g.weeks[5][6].inMonth, false);
  assert.equal(g.weeks.flat().filter(c => c.inMonth).length, 30);
  const feb = monthGrid(H('Read'), '2024-02', TODAY);
  assert.equal(feb.weeks.flat().filter(c => c.inMonth).length, 29);   // a leap year
});

test('monthGrid: each day says what happened', async () => {
  const { monthGrid } = await load();
  const h = H('Gym', [0, 1, 2, 6, 12], { schedule: { type: 'days', days: [1, 2, 3, 4, 5] }, pauses: [{ from: ago(16), to: ago(14) }], createdAt: '2026-11-05T12:00:00Z', backfilled: { [ago(6)]: true, [ago(3)]: true } });
  const g = monthGrid(h, '2026-11', TODAY, [ago(5)]);
  assert.equal(cell(g, ago(0)).state, 'done'); assert.equal(cell(g, ago(0)).today, true);
  assert.equal(cell(g, ago(5)).state, 'shield');              // Friday, owed, covered
  assert.equal(cell(g, ago(3)).state, 'rest');                // Sunday
  assert.equal(cell(g, ago(7)).state, 'missed');              // Wednesday, owed, not done
  assert.equal(cell(g, ago(15)).state, 'paused');
  assert.equal(cell(g, '2026-11-03').state, 'before');
  assert.equal(cell(g, '2026-11-27').state, 'future');
  assert.equal(cell(g, ago(6)).late, true);                   // done and marked as filled in late
  assert.equal(cell(g, ago(3)).late, false);                  // marked, but not done: not late
  const open = monthGrid(H('Read', [1]), '2026-11', TODAY);
  assert.equal(cell(open, TODAY).state, 'open');
});

test('monthGrid: done days next to each other are one run, across weeks, months and shield days', async () => {
  const { monthGrid } = await load();
  const g = monthGrid(H('Read', [0, 1, 2, 4, 9, 10, 11, 12, 20]), '2026-11', TODAY, [ago(3)]);
  assert.equal(cell(g, ago(0)).run, 'end');
  assert.equal(cell(g, ago(1)).run, 'mid');
  assert.equal(cell(g, ago(3)).run, 'mid');                   // the shield day joins the run
  assert.equal(cell(g, ago(4)).run, 'start');
  assert.equal(cell(g, ago(9)).run, 'end'); assert.equal(cell(g, ago(12)).run, 'start');   // Friday to Monday: across a week boundary
  assert.equal(cell(g, ago(20)).run, 'single');
  assert.equal(cell(g, ago(6)).run, null);
  const oct = monthGrid(H('Read', range(22, 30)), '2026-10', TODAY);   // 26 October to 3 November
  assert.equal(cell(oct, '2026-10-31').run, 'mid');           // the run carries on into November
  assert.equal(cell(oct, '2026-11-01').inMonth, false);
});

test('monthGrid: the arrows stop at the habit\'s first month and at this month; odd input is put right', async () => {
  const { monthGrid, firstMonth } = await load();
  const h = H('Read', [40], { createdAt: '2026-09-10T12:00:00Z' });
  assert.equal(firstMonth(h, TODAY), '2026-09');
  assert.deepEqual([monthGrid(h, '2026-11', TODAY).prev, monthGrid(h, '2026-11', TODAY).next], ['2026-10', null]);
  assert.deepEqual([monthGrid(h, '2026-09', TODAY).prev, monthGrid(h, '2026-09', TODAY).next], [null, '2026-10']);
  assert.equal(monthGrid(h, '2031-01', TODAY).month, '2026-11');      // not into the future
  assert.equal(monthGrid(h, '2019-01', TODAY).month, '2026-09');      // not before it began
  assert.equal(monthGrid(h, 'banana', TODAY).month, '2026-11');
  assert.equal(monthGrid(H('Old', [500], { createdAt: '2026-11-01T12:00:00Z' }), '2026-11', TODAY).prev, '2026-10');   // done before it was "created": history wins
  assert.equal(monthGrid(h, '2026-12', TODAY).label, 'November 2026');
  const jan = monthGrid(H('Read', [], { createdAt: '2025-06-01T12:00:00Z' }), '2026-01', TODAY);
  assert.equal(jan.prev, '2025-12'); assert.equal(jan.next, '2026-02');
});

test('monthGrid: counts for the month, and junk never throws', async () => {
  const { monthGrid } = await load();
  const g = monthGrid(H('Read', [0, 1, 2, 10]), '2026-11', TODAY);
  assert.equal(g.done, 4); assert.equal(g.owed, 25);          // 1 to 25 November were owed (today is still open)
  for (const bad of [null, undefined, {}, { completedDates: ['x', 1], pauses: 'no', backfilled: 3, createdAt: 'never' }]) {
    assert.doesNotThrow(() => monthGrid(bad, '2026-11', TODAY, 'no'));
    assert.equal(monthGrid(bad, '2026-11', TODAY).weeks.length, 6);
  }
});
