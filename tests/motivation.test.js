// Run with: node --test tests/motivation.test.js
// What the app says about a person's record (levels, XP history, milestones, achievements, recaps), worked out
// from the habits they already have. Pure functions: no page, no Firebase.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'motivation.js')).href);

const num = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const key = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const TODAY = '2026-11-25';                                   // a Wednesday
const ago = n => key(num(TODAY) - n);
const H = (name, days = [], o = {}) => ({ id: name.toLowerCase(), name, category: 'health', frequency: 'daily', completedDates: days.map(ago), createdAt: '2025-01-05T10:00:00Z', ...o });

test('motivation.js loads the same copy of the habit rules as the app (one module, not two)', () => {
  const v = f => (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(/habit-rules\.js\?v=(\d+)/) || [])[1];
  assert.ok(v('app.js'));
  assert.equal(v('motivation.js'), v('app.js'));
});

// ── Levels ─────────────────────────────────────────────────
test('levels: ten of them, each with a name and a plain meaning, thresholds rising', async () => {
  const { LEVELS } = await load();
  assert.equal(LEVELS.length, 10);
  LEVELS.forEach((l, i) => {
    assert.equal(l.level, i + 1);
    assert.ok(l.title && l.meaning && l.meaning.length <= 90, JSON.stringify(l));
    if (i) assert.ok(l.minXP > LEVELS[i - 1].minXP);
  });
  assert.equal(LEVELS[0].minXP, 0);
});

test('levelInfo: the level, what is left, and the next one', async () => {
  const { levelInfo } = await load();
  assert.deepEqual(levelInfo(0), { level: 1, title: 'Starter', totalXP: 0, xpInCurrentLevel: 0, xpRequiredForNext: 100, levelTargetXP: 100, progressPct: 0, nextTitle: 'Builder', toGo: 100, isTop: false });
  assert.equal(levelInfo(99).level, 1);
  assert.equal(levelInfo(99).toGo, 1);
  assert.equal(levelInfo(100).level, 2);
  const three = levelInfo(300);
  assert.equal(three.level, 3); assert.equal(three.title, 'Steady'); assert.equal(three.xpInCurrentLevel, 50); assert.equal(three.xpRequiredForNext, 200); assert.equal(three.progressPct, 25); assert.equal(three.toGo, 150);
  const top = levelInfo(3200);
  assert.equal(top.level, 10); assert.equal(top.isTop, true); assert.equal(top.levelTargetXP, 4000);
  assert.equal(levelInfo(99999).level, 10);
  assert.equal(levelInfo(99999).progressPct, 100);
  assert.equal(levelInfo(99999).toGo, 0);
});

test('levelInfo: junk is treated as no XP', async () => {
  const { levelInfo } = await load();
  for (const bad of [undefined, null, NaN, -50, 'lots']) assert.equal(levelInfo(bad).level, 1, String(bad));
});

// ── XP history ─────────────────────────────────────────────
test('xpHistory: 25 a completion, newest day first, days with nothing left out', async () => {
  const { xpHistory } = await load();
  const out = xpHistory([H('Read', [0, 1, 3]), H('Run', [1])], TODAY);
  assert.deepEqual(out.map(d => d.day), [ago(0), ago(1), ago(3)]);
  assert.deepEqual(out.map(d => d.done), [1, 2, 1]);
  assert.deepEqual(out[0], { day: ago(0), done: 1, bonus: false, xp: 25, names: ['Read'] });
});

test('xpHistory: a day with every due daily habit done carries the 100 bonus', async () => {
  const { xpHistory } = await load();
  const out = xpHistory([H('Read', [0, 1, 3]), H('Run', [1])], TODAY);
  assert.deepEqual(out[1], { day: ago(1), done: 2, bonus: true, xp: 150, names: ['Read', 'Run'] });
  assert.equal(out[2].bonus, false);                          // Run was due three days ago and was not done
});

test('xpHistory: rest days and paused habits are not owed, weekly habits earn but are not part of the bonus', async () => {
  const { xpHistory } = await load();
  const weekdaysOnly = H('Gym', [], { schedule: { type: 'days', days: [1, 2, 4, 5] } });            // not Wednesdays
  const paused = H('Swim', [], { pauses: [{ from: ago(5) }] });
  const weekly = H('Call home', [0], { frequency: 'weekly' });
  const out = xpHistory([H('Read', [0]), weekdaysOnly, paused, weekly], TODAY);
  assert.deepEqual(out, [{ day: ago(0), done: 2, bonus: true, xp: 150, names: ['Read', 'Call home'] }]);
});

test('xpHistory: looks back 14 days unless told otherwise, and survives junk', async () => {
  const { xpHistory } = await load();
  assert.equal(xpHistory([H('Read', [0, 13, 14, 40])], TODAY).length, 2);
  assert.equal(xpHistory([H('Read', [0, 13, 14, 40])], TODAY, 60).length, 4);
  assert.deepEqual(xpHistory([], TODAY), []);
  assert.deepEqual(xpHistory(null, TODAY), []);
  const odd = { id: 'x', name: 'Odd', completedDates: ['banana', 12, null, ago(0)] };
  assert.equal(xpHistory([odd, { id: 'y' }], TODAY)[0].done, 1);
});

// ── Milestones ─────────────────────────────────────────────
test('milestones: 7, 30, 100 and 365 days, each with a line to say', async () => {
  const { MILESTONES, MILESTONE_LINES } = await load();
  assert.deepEqual(MILESTONES, [7, 30, 100, 365]);
  for (const m of MILESTONES) assert.ok(typeof MILESTONE_LINES[m] === 'string' && MILESTONE_LINES[m].length > 10 && MILESTONE_LINES[m].length <= 80, String(m));
});

test('milestoneCrossed: the milestone a streak just passed, or null', async () => {
  const { milestoneCrossed } = await load();
  assert.equal(milestoneCrossed(6, 7), 7);
  assert.equal(milestoneCrossed(29, 30), 30);
  assert.equal(milestoneCrossed(99, 100), 100);
  assert.equal(milestoneCrossed(364, 365), 365);
  assert.equal(milestoneCrossed(7, 8), null);
  assert.equal(milestoneCrossed(0, 1), null);
  assert.equal(milestoneCrossed(5, 6), null);
});

test('milestoneCrossed: a jump over several gives the highest; standing still or falling gives none', async () => {
  const { milestoneCrossed } = await load();
  assert.equal(milestoneCrossed(0, 400), 365);
  assert.equal(milestoneCrossed(3, 31), 30);
  assert.equal(milestoneCrossed(7, 7), null);
  assert.equal(milestoneCrossed(30, 7), null);
  for (const bad of [[undefined, 7], [6, NaN], ['6', '7'], [null, null]]) assert.equal(milestoneCrossed(...bad), null, JSON.stringify(bad));
});

// ── Achievements ───────────────────────────────────────────
const earned = out => out.filter(a => a.earned).map(a => a.id).sort();
const get = (out, id) => out.find(a => a.id === id);
const range = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(n); return out; };

test('achievements: about eighteen, each with a name, a way to earn it and an icon the app has', async () => {
  const { ACHIEVEMENTS } = await load();
  const sprite = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(ACHIEVEMENTS.length >= 16 && ACHIEVEMENTS.length <= 20, String(ACHIEVEMENTS.length));
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.id)).size, ACHIEVEMENTS.length);
  assert.equal(new Set(ACHIEVEMENTS.map(a => a.name)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name && a.name.length <= 20 && a.how && a.how.length <= 48 && a.goal >= 1, JSON.stringify(a));
    assert.ok(sprite.includes(`<symbol id="i-${a.icon}"`), a.id + ' icon ' + a.icon);
  }
});

test('achievements: an empty account has earned nothing', async () => {
  const { achievements, ACHIEVEMENTS } = await load();
  for (const habits of [[], null, undefined]) {
    const out = achievements(habits, { today: TODAY, xp: 0 });
    assert.equal(out.length, ACHIEVEMENTS.length);
    assert.deepEqual(earned(out), []);
    assert.ok(out.every(a => a.have === 0 || a.id.startsWith('level-')), JSON.stringify(out.filter(a => a.have)));
  }
  assert.equal(get(achievements([], { today: TODAY }), 'level-5').have, 1);          // everyone starts at level 1
});

test('achievements: check-ins count each completed day once, across all habits', async () => {
  const { achievements } = await load();
  const dup = H('Run', [], { completedDates: [ago(0), ago(0)] });
  const out = achievements([H('Read', range(20, 28)), dup], { today: TODAY });
  assert.equal(get(out, 'checkins-10').have, 10);
  assert.ok(get(out, 'checkins-1').earned && get(out, 'checkins-10').earned);
  assert.equal(get(out, 'checkins-50').earned, false);
  assert.equal(get(out, 'checkins-50').have, 10);
});

test('achievements: the streak family uses the longest run ever, not only the current one', async () => {
  const { achievements } = await load();
  const out = achievements([H('Read', range(40, 46)), H('Call home', range(0, 9).map(n => n * 7), { frequency: 'weekly' })], { today: TODAY });
  assert.ok(get(out, 'streak-3').earned && get(out, 'streak-7').earned);
  assert.equal(get(out, 'streak-30').earned, false);
  assert.equal(get(out, 'streak-30').have, 7);                                       // ten weeks in a row is not ten days
});

test('achievements: perfect days need every owed daily habit done; rest days and weekly habits are not owed', async () => {
  const { achievements, perfectDays } = await load();
  const habits = [H('Read', [1, 2, 3]), H('Run', [1, 2]), H('Gym', [1], { schedule: { type: 'days', days: [2] } }), H('Call home', [], { frequency: 'weekly' })];
  // 1 = Tuesday: all three daily habits owed and done. 2 = Monday: Gym rests, both others done. 3: Run missing.
  assert.equal(perfectDays(habits), 2);
  const out = achievements(habits, { today: TODAY });
  assert.ok(get(out, 'perfect-1').earned);
  assert.equal(get(out, 'perfect-7').have, 2);
});

test('achievements: habits kept counts what is in play, and level comes from XP', async () => {
  const { achievements } = await load();
  const habits = [H('A'), H('B'), H('C', [], { archivedAt: 1, archivedOn: ago(3) }), H('D', [], { endDate: ago(2) }), H('E', [], { pauses: [{ from: ago(1) }] })];
  const out = achievements(habits, { today: TODAY, xp: 700 });
  assert.ok(get(out, 'kept-3').earned);                                               // A, B and the paused E
  assert.equal(get(out, 'kept-5').have, 3);
  assert.ok(get(out, 'level-5').earned);
  assert.equal(get(out, 'level-10').have, 5);
});

test('achievements: progress never passes the goal, and junk never throws', async () => {
  const { achievements } = await load();
  const out = achievements([H('Read', range(0, 60))], { today: TODAY, xp: 99999 });
  assert.ok(out.every(a => a.have <= a.goal && a.have >= 0 && Number.isInteger(a.have)));
  assert.equal(get(out, 'checkins-50').have, 50);
  assert.doesNotThrow(() => achievements([{ id: 'x' }, null, 7, { completedDates: 'no', moods: 3 }], { today: TODAY, xp: NaN, frozen: 'no' }));
  assert.doesNotThrow(() => achievements([H('Read', [0])]));
});

// ── Time away ──────────────────────────────────────────────
test('daysAway: whole days since anything was last completed', async () => {
  const { daysAway, lastDoneDay } = await load();
  assert.equal(daysAway([H('Read', [0])], TODAY), 0);
  assert.equal(daysAway([H('Read', [1, 5])], TODAY), 1);
  assert.equal(daysAway([H('Read', [9]), H('Run', [3, 20])], TODAY), 3);
  assert.equal(lastDoneDay([H('Read', [9]), H('Run', [3, 20])], TODAY), ago(3));
});

test('daysAway: nothing ever done, an empty account and junk all count as not away', async () => {
  const { daysAway, lastDoneDay } = await load();
  assert.equal(daysAway([H('Read')], TODAY), 0);
  assert.equal(daysAway([], TODAY), 0);
  assert.equal(daysAway(null, TODAY), 0);
  assert.equal(lastDoneDay([], TODAY), '');
  assert.equal(daysAway([{ completedDates: ['banana', 7, null] }, { completedDates: 'x' }], TODAY), 0);
  assert.equal(daysAway([H('Read', [4], { completedDates: [ago(4), ago(-2)] })], TODAY), 4);   // a date in the future is not "today"
});

// ── Mood notes ─────────────────────────────────────────────
test('moods: five of them, from Awful to Great', async () => {
  const { MOODS } = await load();
  assert.deepEqual(MOODS, ['Awful', 'Hard', 'Okay', 'Good', 'Great']);
});

test('moodOf: a note counts only on a day that is still done, and only as a whole number from 1 to 5', async () => {
  const { moodOf } = await load();
  const h = H('Read', [0, 1, 2], { moods: { [ago(0)]: 4, [ago(1)]: 9, [ago(2)]: 2.5, [ago(3)]: 5, banana: 3 } });
  assert.equal(moodOf(h, ago(0)), 4);
  assert.equal(moodOf(h, ago(1)), null);                     // 9 is not a mood
  assert.equal(moodOf(h, ago(2)), null);                     // nor is 2.5
  assert.equal(moodOf(h, ago(3)), null);                     // that day is not done
  assert.equal(moodOf(h, 'banana'), null);
  for (const bad of [null, undefined, {}, { moods: 'x' }, { moods: null, completedDates: [ago(0)] }]) assert.equal(moodOf(bad, ago(0)), null);
});

test('moodInsights: says which habit feels best and which has felt hard, once there are three notes', async () => {
  const { moodInsights } = await load();
  const run = H('Run <i>fast</i>', [1, 2, 3, 4], { moods: { [ago(1)]: 5, [ago(2)]: 5, [ago(3)]: 4 } });
  const taxes = H('Taxes', [1, 2, 3], { moods: { [ago(1)]: 1, [ago(2)]: 2, [ago(3)]: 2 } });
  const few = H('Few', [1, 2], { moods: { [ago(1)]: 5, [ago(2)]: 5 } });
  const middling = H('Walk', [1, 2, 3], { moods: { [ago(1)]: 3, [ago(2)]: 3, [ago(3)]: 3 } });
  assert.deepEqual(moodInsights([run, taxes, few, middling]), [
    { kind: 'best', name: 'Run <i>fast</i>', avg: 4.7, count: 3 },      // the name comes back as typed: the caller escapes it
    { kind: 'hard', name: 'Taxes', avg: 1.7, count: 3 },
  ]);
  assert.deepEqual(moodInsights([few, middling]), []);
  assert.deepEqual(moodInsights([]), []);
  assert.deepEqual(moodInsights(null), []);
});

test('moodInsights: one habit is never both the best and the hard one', async () => {
  const { moodInsights } = await load();
  const only = H('Only', [1, 2, 3], { moods: { [ago(1)]: 1, [ago(2)]: 1, [ago(3)]: 1 } });
  assert.deepEqual(moodInsights([only]), [{ kind: 'hard', name: 'Only', avg: 1, count: 3 }]);
  const great = H('Great', [1, 2, 3], { moods: { [ago(1)]: 5, [ago(2)]: 5, [ago(3)]: 5 } });
  assert.deepEqual(moodInsights([great]), [{ kind: 'best', name: 'Great', avg: 5, count: 3 }]);
});

// ── The day's recap ────────────────────────────────────────
test('dayRecap: what was done, what is still open, the XP, the streak and tomorrow', async () => {
  const { dayRecap } = await load();
  const habits = [
    H('Read', [0, 1, 2], { moods: { [ago(0)]: 4 } }),
    H('Run'),
    H('Water', [], { target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [ago(0)]: 3 } }),   // part-way is still open
    H('Swim', [], { pauses: [{ from: ago(3) }] }),
    H('Call home', [], { frequency: 'weekly' }),
    H('Gym', [], { schedule: { type: 'days', days: [4] } }),                                         // Thursdays: rests today, due tomorrow
  ];
  const r = dayRecap(habits, TODAY);
  assert.deepEqual(r.done.map(h => h.name), ['Read']);
  assert.deepEqual(r.open.map(h => h.name), ['Run', 'Water', 'Call home']);
  assert.equal(r.total, 4);
  assert.equal(r.xp, 25);
  assert.equal(r.bonus, false);
  assert.equal(r.streak, 3);
  assert.equal(r.moodAvg, 4);
  assert.equal(r.tomorrowDue, 4);                            // Read, Run, Water and Gym; not the paused or weekly one
  assert.equal(r.day, TODAY);
});

test('dayRecap: a full day carries the bonus; weekly habits done today earn but are not part of it', async () => {
  const { dayRecap } = await load();
  const r = dayRecap([H('Read', [0]), H('Run', [0]), H('Call home', [0], { frequency: 'weekly' })], TODAY);
  assert.equal(r.done.length, 3);
  assert.equal(r.open.length, 0);
  assert.equal(r.bonus, true);
  assert.equal(r.xp, 175);
  assert.equal(r.moodAvg, null);
});

test('dayRecap: a shield day counts in the streak, and archived habits are left out', async () => {
  const { dayRecap } = await load();
  const r = dayRecap([H('Read', [0, 2, 3]), H('Old', [0], { archivedAt: 5, archivedOn: ago(0) })], TODAY, { frozen: [ago(1)] });
  assert.equal(r.streak, 4);
  assert.deepEqual(r.done.map(h => h.name), ['Read']);
});

test('dayRecap: nothing due, an empty account and junk', async () => {
  const { dayRecap } = await load();
  for (const habits of [[], null, [H('Swim', [], { pauses: [{ from: ago(3) }] })], [{ id: 'x' , completedDates: 'no' }, 7]]) {
    const r = dayRecap(habits, TODAY, { frozen: 'no' });
    assert.equal(r.done.length, 0);
    assert.equal(r.xp, 0);
    assert.equal(r.bonus, false);
    assert.equal(r.moodAvg, null);
  }
  assert.equal(dayRecap([], TODAY).total, 0);
});
