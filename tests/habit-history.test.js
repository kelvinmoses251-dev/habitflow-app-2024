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
