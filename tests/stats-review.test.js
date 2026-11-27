// Run with: node --test tests/stats-review.test.js
// Looking back: the weekly review, the stories and the suggestions. Pure functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'stats-review.js')).href);

const num = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const key = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const TODAY = '2026-11-25';                                   // a Wednesday; last week ran Mon 16 to Sun 22 (9 to 3 days ago)
const ago = n => key(num(TODAY) - n);
const range = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(n); return out; };
const H = (name, days = [], o = {}) => ({ id: name.toLowerCase(), name, category: 'health', frequency: 'daily', completedDates: days.map(ago), createdAt: '2020-01-05T10:00:00Z', ...o });

test('stats-review.js loads the same copies of the rules and the stats as the app', () => {
  const v = (f, re) => (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(re) || [])[1];
  assert.equal(v('stats-review.js', /habit-rules\.js\?v=(\d+)/), v('app.js', /habit-rules\.js\?v=(\d+)/));
  assert.equal(v('stats-review.js', /stats\.js\?v=(\d+)/), v('app.js', /\/stats\.js\?v=(\d+)/));
});

// ── The weekly review ──────────────────────────────────────
test('weekReview: the last finished week, Monday to Sunday', async () => {
  const { weekReview, mondayOf } = await load();
  assert.deepEqual([weekReview([], TODAY).from, weekReview([], TODAY).to], ['2026-11-16', '2026-11-22']);
  assert.deepEqual([weekReview([], '2026-11-23').from, weekReview([], '2026-11-23').to], ['2026-11-16', '2026-11-22'], 'on a Monday: the week that just ended');
  assert.deepEqual([weekReview([], '2026-11-22').from, weekReview([], '2026-11-22').to], ['2026-11-09', '2026-11-15'], 'on a Sunday: this week is not over');
  assert.equal(weekReview([], TODAY).label, '16 Nov to 22 Nov');
  assert.equal(weekReview([], '2026-01-01').from, '2025-12-22');
  assert.equal(mondayOf('2026-11-25'), '2026-11-23');
});

test('weekReview: the figures, against the week before', async () => {
  const { weekReview } = await load();
  const habits = [H('Read', range(3, 16)), H('Run', [4, 8, 10, 12, 14]), H('Call', [5], { frequency: 'weekly' })];
  const r = weekReview(habits, TODAY);
  assert.deepEqual([r.now.owed, r.now.doneOwed, r.now.rate, r.now.checkins, r.now.perfect], [14, 9, 64, 10, 2]);
  assert.deepEqual([r.before.rate, r.delta], [71, -7]);
  assert.equal(r.any, true);
});

test('weekReview: each habit is sorted into what went well, what slipped and what held', async () => {
  const { weekReview } = await load();
  const habits = [
    H('Read', range(3, 9)),                                    // 7 of 7
    H('Stretch', [3, 4, 5, 6, 7, 8]),                          // 6 of 7: 86%
    H('Write', [3, 4, 5, 6]),                                  // 4 of 7: 57% (held)
    H('Run', [4, 8]),                                          // 2 of 7: 29% (slipped)
    H('Floss', []),                                            // 0 of 7 (slipped, worst)
    H('Call', [5], { frequency: 'weekly' }),                   // done once
    H('Budget', [], { frequency: 'weekly' }),                  // never touched
    H('Gone', [4], { archivedAt: num(ago(1)) * 864e5, archivedOn: ago(1) }),   // slipped, but archived since: nothing to decide
    H('New', [0], { createdAt: ago(1) + 'T09:00:00' }),        // did not exist last week
  ];
  const r = weekReview(habits, TODAY);
  assert.deepEqual(r.wins.map(w => [w.name, w.done, w.owed, w.rate]), [['Read', 7, 7, 100], ['Stretch', 6, 7, 86], ['Call', 1, 0, null]]);
  assert.deepEqual(r.slipped.map(w => [w.name, w.done, w.owed, w.rate]), [['Floss', 0, 7, 0], ['Run', 2, 7, 29]]);
  assert.deepEqual(r.steady.map(w => w.name), ['Write', 'Gone']);
  assert.deepEqual(r.quiet.map(w => w.name), ['Budget']);
});

test('weekReview: an account with nothing last week has nothing to review', async () => {
  const { weekReview } = await load();
  assert.equal(weekReview([], TODAY).any, false);
  assert.equal(weekReview([H('New', [0], { createdAt: ago(1) + 'T09:00:00' })], TODAY).any, false);
  assert.equal(weekReview([null, 'junk'], TODAY).any, false);
});

test('focusChoices: habits in play, not paused and not about to be', async () => {
  const { focusChoices } = await load();
  const habits = [H('Read'), H('Run'), H('Rest', [], { pauses: [{ from: ago(2) }] }), H('Gone', [], { archivedAt: 1, archivedOn: ago(30) }), H('Call', [], { frequency: 'weekly' })];
  assert.deepEqual(focusChoices(habits, TODAY, ['run']).map(h => [h.id, h.kind]), [['read', 'daily'], ['call', 'weekly']]);
});

test('focusProgress: this week so far, with today not held against it', async () => {
  const { focusProgress } = await load();
  assert.deepEqual(focusProgress(H('Read', [1, 2]), TODAY), { kind: 'daily', done: 2, owed: 2 });       // Mon, Tue done; Wed still open
  assert.deepEqual(focusProgress(H('Read', [0, 2]), TODAY), { kind: 'daily', done: 2, owed: 3 });
  assert.deepEqual(focusProgress(H('Call', [1, 6], { frequency: 'weekly' }), TODAY), { kind: 'weekly', done: 1, owed: null });
  assert.equal(focusProgress(null, TODAY), null);
});

test('withReview: the new entry is added, the oldest dropped past twenty-six, junk left behind', async () => {
  const { withReview, REVIEWS_KEPT } = await load();
  assert.deepEqual(withReview(undefined, '2026-11-16', { at: 1, focus: 'a' }), { '2026-11-16': { at: 1, focus: 'a' } });
  assert.deepEqual(withReview({}, '2026-11-16', { at: 1, focus: '' }), { '2026-11-16': { at: 1, focus: null } });
  const many = Object.fromEntries(range(0, REVIEWS_KEPT - 1).map(n => [key(num('2026-01-05') + n * 7), { at: n, focus: null }]));
  const out = withReview({ ...many, junk: 1, '2025-01-06': 'nope' }, '2026-11-16', { at: 9, focus: 'b' });
  assert.equal(Object.keys(out).length, REVIEWS_KEPT);
  assert.ok(!('2026-01-05' in out) && !('junk' in out) && !('2025-01-06' in out));
  assert.deepEqual(out['2026-11-16'], { at: 9, focus: 'b' });
  const redo = withReview(many, '2026-01-05', { at: 9, focus: null });
  assert.deepEqual([Object.keys(redo).length, redo['2026-01-05'].at], [REVIEWS_KEPT, 9], 'redoing a week replaces it');
});
