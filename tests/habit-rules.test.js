// Run with: node --test tests/habit-rules.test.js
// The one set of rules for "is this habit due / done / on a streak". Used by the app and by the reminder job.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'habit-rules.js')).href);

// ── Reference: how streaks were worked out before this module existed (copied from app.js as shipped in batch 2).
// Old habits must get exactly these answers from the new rules.
const num = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const key = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const oldPeriod = (day, freq) => { const [y, m] = day.split('-').map(Number); if (freq === 'monthly') return y * 12 + (m - 1); const n = num(day); return freq === 'weekly' ? Math.floor((n + 3) / 7) : n; };
const oldFreq = h => (h.frequency === 'weekly' || h.frequency === 'monthly') ? h.frequency : 'daily';
function oldStreak(h, today, frozen = []) {
  const freq = oldFreq(h), set = new Set((h.completedDates || []).map(d => oldPeriod(d, freq)));
  if (freq === 'daily') frozen.forEach(d => set.add(oldPeriod(d, freq)));
  let p = oldPeriod(today, freq); if (!set.has(p)) p--;
  let s = 0; while (set.has(p)) { s++; p--; } return s;
}
function oldLongest(h, today, frozen = []) {
  const freq = oldFreq(h), ps = [...new Set((h.completedDates || []).map(d => oldPeriod(d, freq)))].sort((a, b) => a - b);
  let longest = 0, run = 0; ps.forEach((p, i) => { run = i > 0 && p === ps[i - 1] + 1 ? run + 1 : 1; if (run > longest) longest = run; });
  return Math.max(oldStreak(h, today, frozen), longest);
}
// A small deterministic random source, so failures can be reproduced
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

const TODAY = '2026-11-25';                       // a Wednesday
const back = n => key(num(TODAY) - n);

test('old habits (no new fields) get exactly the streaks they had before', async () => {
  const { habitStreak, habitLongestStreak } = await load();
  const r = rng(42);
  for (const frequency of ['daily', 'weekly', 'monthly', undefined]) {
    for (let i = 0; i < 40; i++) {
      const span = frequency === 'monthly' ? 400 : frequency === 'weekly' ? 120 : 40;
      const density = 0.35 + r() * 0.6;
      const completedDates = []; for (let n = 0; n < span; n++) if (r() < density) completedDates.push(back(n));
      const frozen = frequency === 'daily' || !frequency ? [back(1 + Math.floor(r() * 6))].filter(() => r() < 0.4) : [];
      const h = { frequency, completedDates };
      assert.equal(habitStreak(h, TODAY, frozen), oldStreak(h, TODAY, frozen), `streak ${frequency} #${i} ${JSON.stringify(completedDates.slice(0, 12))}`);
      assert.equal(habitLongestStreak(h, TODAY, frozen), oldLongest(h, TODAY, frozen), `longest ${frequency} #${i}`);
    }
  }
});

test('an empty habit has no streak, and today not being done yet does not break one', async () => {
  const { habitStreak } = await load();
  assert.equal(habitStreak({ completedDates: [] }, TODAY), 0);
  assert.equal(habitStreak({ completedDates: [back(1), back(2), back(3)] }, TODAY), 3);
  assert.equal(habitStreak({ completedDates: [back(0), back(1), back(2), back(3)] }, TODAY), 4);
  assert.equal(habitStreak({ completedDates: [back(2), back(3)] }, TODAY), 0);          // yesterday missed
});

test('scheduleOn falls back to the frequency, and reads dated history', async () => {
  const { scheduleOn } = await load();
  assert.deepEqual(scheduleOn({}, TODAY), { type: 'daily' });
  assert.deepEqual(scheduleOn({ frequency: 'weekly' }, TODAY), { type: 'times', times: 1 });
  assert.deepEqual(scheduleOn({ frequency: 'monthly' }, TODAY), { type: 'monthly' });
  assert.deepEqual(scheduleOn({ schedule: { type: 'days', days: [1, 3, 5] } }, TODAY), { type: 'days', days: [1, 3, 5] });
  const h = { schedule: { type: 'days', days: [1, 3, 5] }, scheduleHistory: [{ from: '0000-00-00', schedule: { type: 'daily' } }, { from: back(0), schedule: { type: 'days', days: [1, 3, 5] } }] };
  assert.deepEqual(scheduleOn(h, back(1)), { type: 'daily' });
  assert.deepEqual(scheduleOn(h, back(0)), { type: 'days', days: [1, 3, 5] });
});

test('a broken schedule is treated as the plain frequency, never as an error', async () => {
  const { scheduleOn, isDueOn } = await load();
  for (const bad of [{ type: 'days', days: [] }, { type: 'days', days: [9, 'x'] }, { type: 'times', times: 0 }, { type: 'times', times: 99 }, { type: 'nope' }, 'daily', 7, null]) {
    assert.deepEqual(scheduleOn({ schedule: bad }, TODAY), { type: 'daily' }, JSON.stringify(bad));
    assert.equal(isDueOn({ schedule: bad }, TODAY), true);
  }
});

test('a weekday habit is due only on its days', async () => {
  const { isDueOn } = await load();
  const mwf = { schedule: { type: 'days', days: [1, 3, 5] } };
  assert.equal(isDueOn(mwf, '2026-11-25'), true);      // Wednesday
  assert.equal(isDueOn(mwf, '2026-11-26'), false);     // Thursday
  assert.equal(isDueOn(mwf, '2026-11-27'), true);      // Friday
  assert.equal(isDueOn(mwf, '2026-11-29'), false);     // Sunday
  assert.equal(isDueOn({ schedule: { type: 'days', days: [0] } }, '2026-11-29'), true);
});

test('a weekday habit\'s streak counts its due days and skips the others', async () => {
  const { habitStreak, habitLongestStreak } = await load();
  // Mon/Wed/Fri. Done Wed 25, Mon 23, Fri 20, Wed 18; missed Mon 16; done Fri 13.
  const h = { schedule: { type: 'days', days: [1, 3, 5] }, completedDates: ['2026-11-25', '2026-11-23', '2026-11-20', '2026-11-18', '2026-11-13'] };
  assert.equal(habitStreak(h, '2026-11-25'), 4);
  assert.equal(habitStreak(h, '2026-11-26'), 4);       // Thursday: a rest day neither breaks nor extends it
  assert.equal(habitStreak({ ...h, completedDates: h.completedDates.slice(1) }, '2026-11-25'), 3);   // Wednesday not done yet: still alive
  assert.equal(habitStreak({ ...h, completedDates: h.completedDates.slice(1) }, '2026-11-27'), 0);   // Wednesday missed, seen on Friday
  assert.equal(habitLongestStreak(h, '2026-11-25'), 4);
  // Done on a rest day as well: it does not count twice or break anything
  assert.equal(habitStreak({ ...h, completedDates: [...h.completedDates, '2026-11-24'] }, '2026-11-25'), 4);
});

test('changing the schedule never rewrites history', async () => {
  const { habitStreak } = await load();
  // Daily for a week (done every day up to Tuesday 24), then switched to Mon/Wed/Fri on Wednesday 25.
  const daily7 = ['2026-11-24', '2026-11-23', '2026-11-22', '2026-11-21', '2026-11-20', '2026-11-19', '2026-11-18'];
  const h = { schedule: { type: 'days', days: [1, 3, 5] }, completedDates: daily7,
    scheduleHistory: [{ from: '0000-00-00', schedule: { type: 'daily' } }, { from: '2026-11-25', schedule: { type: 'days', days: [1, 3, 5] } }] };
  assert.equal(habitStreak(h, '2026-11-25'), 7);                                   // nothing lost by switching
  assert.equal(habitStreak({ ...h, completedDates: ['2026-11-25', ...daily7] }, '2026-11-26'), 8);   // Thursday is now a rest day
  // Without the history the same data would be judged by the new rule only: that is what the history prevents
  assert.notEqual(habitStreak({ schedule: h.schedule, completedDates: daily7 }, '2026-11-25'), 7);
});

test('a times-per-week habit counts weeks that reached the number', async () => {
  const { habitStreak, periodProgress, isOpenOn } = await load();
  const h = { frequency: 'weekly', schedule: { type: 'times', times: 3 },
    // this week (Mon 23 to Sun 29): two so far. Last week (16 to 22): three. The week before (9 to 15): four. Before that (2 to 8): two.
    completedDates: ['2026-11-23', '2026-11-25', '2026-11-16', '2026-11-18', '2026-11-22', '2026-11-09', '2026-11-10', '2026-11-12', '2026-11-15', '2026-11-03', '2026-11-05'] };
  assert.deepEqual(periodProgress(h, '2026-11-25'), { done: 2, target: 3 });
  assert.equal(habitStreak(h, '2026-11-25'), 2);                                   // this week still open, two full weeks behind it
  assert.equal(isOpenOn(h, '2026-11-25'), false);                                  // already done today: come back tomorrow
  assert.equal(isOpenOn(h, '2026-11-26'), true);                                   // one more needed this week
  const met = { ...h, completedDates: [...h.completedDates, '2026-11-26'] };
  assert.deepEqual(periodProgress(met, '2026-11-27'), { done: 3, target: 3 });
  assert.equal(habitStreak(met, '2026-11-27'), 3);
  assert.equal(isOpenOn(met, '2026-11-27'), false);                                // target met: nothing left this week
});

test('weeks run Monday to Sunday', async () => {
  const { periodProgress } = await load();
  const h = { frequency: 'weekly', schedule: { type: 'times', times: 2 }, completedDates: ['2026-11-22', '2026-11-23'] };   // Sunday, then Monday
  assert.deepEqual(periodProgress(h, '2026-11-22'), { done: 1, target: 2 });
  assert.deepEqual(periodProgress(h, '2026-11-23'), { done: 1, target: 2 });
});

test('isOpenOn is the single answer to "is there still something to do today"', async () => {
  const { isOpenOn } = await load();
  assert.equal(isOpenOn({ completedDates: [] }, TODAY), true);
  assert.equal(isOpenOn({ completedDates: [TODAY] }, TODAY), false);
  assert.equal(isOpenOn({ schedule: { type: 'days', days: [1] }, completedDates: [] }, TODAY), false);            // not a Monday
  assert.equal(isOpenOn({ frequency: 'weekly', completedDates: ['2026-11-23'] }, TODAY), false);                   // weekly, done this week
  assert.equal(isOpenOn({ frequency: 'weekly', completedDates: ['2026-11-20'] }, TODAY), true);
  assert.equal(isOpenOn({ frequency: 'monthly', completedDates: ['2026-11-02'] }, TODAY), false);
  assert.equal(isOpenOn({ frequency: 'monthly', completedDates: ['2026-10-30'] }, TODAY), true);
  assert.equal(isOpenOn({ completedDates: [], deletedAt: 5 }, TODAY), false);
});

// ── Pausing ───────────────────────────────────────────────
test('paused days are skipped: they neither break a streak nor add to it', async () => {
  const { habitStreak, isDueOn, isOpenOn, isPausedOn } = await load();
  // Done five days running (back 8..4), paused for three days (back 3..1), then done today.
  const h = { completedDates: [back(8), back(7), back(6), back(5), back(4), back(0)], pauses: [{ from: back(3), to: back(1) }] };
  assert.equal(isPausedOn(h, back(2)), true);
  assert.equal(isPausedOn(h, back(4)), false);
  assert.equal(isDueOn(h, back(2)), false);
  assert.equal(habitStreak(h, TODAY), 6);                                              // 5 + today, the pause in between is skipped
  assert.equal(habitStreak({ ...h, completedDates: h.completedDates.slice(0, 5) }, TODAY), 5);   // today still open
  // The same history without the pause is a broken streak
  assert.equal(habitStreak({ completedDates: h.completedDates }, TODAY), 1);
});

test('a habit that is paused now is not open, however long the pause', async () => {
  const { isOpenOn, isDueOn, habitStreak } = await load();
  const h = { completedDates: [back(10), back(9)], pauses: [{ from: back(8) }] };       // open-ended: still paused
  assert.equal(isDueOn(h, TODAY), false);
  assert.equal(isOpenOn(h, TODAY), false);
  assert.equal(habitStreak(h, TODAY), 2);                                               // kept exactly as it was when paused
});

test('malformed pauses are ignored', async () => {
  const { isPausedOn } = await load();
  for (const pauses of [null, 'x', [null], [{ to: back(1) }], [{ from: 5 }]]) assert.equal(isPausedOn({ pauses }, TODAY), false, JSON.stringify(pauses));
});

// ── Start and end dates ───────────────────────────────────
test('a habit is only due inside its start and end dates', async () => {
  const { isActiveOn, isDueOn, isOpenOn, runDay } = await load();
  const h = { startDate: back(-2), completedDates: [] };                                // starts in two days
  assert.equal(isActiveOn(h, TODAY), false);
  assert.equal(isOpenOn(h, TODAY), false);
  assert.equal(isDueOn(h, back(-2)), true);
  const run = { startDate: back(11), endDate: back(-18), completedDates: [] };          // a 30-day run, today is day 12
  assert.deepEqual(runDay(run, TODAY), { day: 12, of: 30 });
  assert.equal(isActiveOn(run, back(-18)), true);
  assert.equal(isActiveOn(run, back(-19)), false);                                      // the day after it ends
  assert.equal(runDay({ startDate: back(3) }, TODAY), null);                            // no end date: no countdown
  assert.equal(runDay(run, back(12)), null);                                            // before it starts
});

test('a finished habit keeps the streak it ended with', async () => {
  const { habitStreak } = await load();
  const h = { startDate: back(9), endDate: back(5), completedDates: [back(5), back(6), back(7), back(8), back(9)] };
  assert.equal(habitStreak(h, TODAY), 5);
});

test('an archived habit is never due or open', async () => {
  const { isOpenOn, isDueOn, isActiveOn } = await load();
  const h = { completedDates: [], archivedAt: 1700000000000 };
  assert.equal(isActiveOn(h, TODAY), false);
  assert.equal(isDueOn(h, TODAY), false);
  assert.equal(isOpenOn(h, TODAY), false);
});

// ── Measurable targets ────────────────────────────────────
test('a target is read safely, and progress is counted per day', async () => {
  const { targetOf, progressOn, isTargetMet } = await load();
  assert.equal(targetOf({}), null);
  assert.deepEqual(targetOf({ target: { amount: 8, unit: 'glasses' } }), { amount: 8, unit: 'glasses', step: 1 });
  assert.deepEqual(targetOf({ target: { amount: 20, unit: 'min', step: 5 } }), { amount: 20, unit: 'min', step: 5 });
  for (const bad of [{ amount: 0 }, { amount: -3 }, { amount: 'eight' }, { amount: 1e9 }, 'x', null]) assert.equal(targetOf({ target: bad }), null, JSON.stringify(bad));
  assert.equal(targetOf({ target: { amount: 8, unit: 'x'.repeat(40) } }).unit.length, 12);     // a long unit is cut
  assert.equal(targetOf({ target: { amount: 8, step: 0 } }).step, 1);
  const h = { target: { amount: 8, unit: 'glasses' }, progress: { [TODAY]: 5, [back(1)]: 9, [back(2)]: 'junk' } };
  assert.equal(progressOn(h, TODAY), 5);
  assert.equal(progressOn(h, back(1)), 9);
  assert.equal(progressOn(h, back(2)), 0);
  assert.equal(progressOn(h, back(3)), 0);
  assert.equal(isTargetMet(h, TODAY), false);
  assert.equal(isTargetMet(h, back(1)), true);
  assert.equal(isTargetMet({ completedDates: [] }, TODAY), false);                       // no target: never "met" by count
});

test('partial progress is not done: only completedDates decides', async () => {
  const { isOpenOn, isDoneOn } = await load();
  const h = { target: { amount: 8 }, progress: { [TODAY]: 5 }, completedDates: [] };
  assert.equal(isDoneOn(h, TODAY), false);
  assert.equal(isOpenOn(h, TODAY), true);
  assert.equal(isOpenOn({ ...h, completedDates: [TODAY] }, TODAY), false);
});
