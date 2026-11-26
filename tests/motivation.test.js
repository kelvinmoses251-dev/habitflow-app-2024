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
