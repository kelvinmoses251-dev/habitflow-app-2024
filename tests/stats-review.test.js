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

// ── The month and the year, told as a story ────────────────
// October 2026 is 55 to 25 days before TODAY.
const october = () => [H('Read', range(25, 55)), H('Run', range(25, 55).filter(n => n % 2 === 0)), H('Call', [30, 37], { frequency: 'weekly' })];

test('story: the last finished month, slide by slide', async () => {
  const { story } = await load();
  const s = story(october(), 'month', TODAY);
  assert.deepEqual([s.kind, s.title, s.from, s.to], ['month', 'October 2026', '2026-10-01', '2026-10-31']);
  const by = Object.fromEntries(s.slides.map(x => [x.id, x]));
  assert.deepEqual([by.days.big, by.days.line], ['31 of 31 days', 'You did at least one habit on every day of the month. 48 check-ins in all.']);
  assert.deepEqual([by.rate.big, by.rate.line], ['74%', '46 of 62 due. Up 74 points on September.']);
  assert.deepEqual([by.top.big, by.top.line], ['Read', 'Done on 31 of 31 days.']);
  assert.deepEqual([by.perfect.big, by.perfect.line], ['15 perfect days', 'Days when everything due was done.']);
  assert.deepEqual([by.busiest.big, by.busiest.line], ['3 check-ins', 'Your fullest day: Mon 26 Oct.']);
  assert.equal(s.slides[0].id, 'days');
  assert.equal(s.slides[s.slides.length - 1].id, 'sum');
  assert.ok(s.slides.every(x => typeof x.kicker === 'string' && x.kicker && typeof x.big === 'string' && x.big && typeof x.line === 'string'));
  assert.deepEqual(s.sum, { rate: 74, checkins: 48, active: 31, days: 31, perfect: 15 });
});

test('story: a run of perfect days is told as a run', async () => {
  const { story } = await load();
  const s = story([H('Read', range(25, 55)), H('Run', range(40, 48))], 'month', TODAY);
  const run = s.slides.find(x => x.id === 'run');
  assert.deepEqual([run.big, run.line], ['9 days', 'Everything due was done 9 days in a row, 8 Oct to 16 Oct.']);
  assert.ok(!s.slides.some(x => x.id === 'perfect'));
});

test('story: the best and hardest day of the week, only when they really differ', async () => {
  const { story } = await load();
  // Every day of October except its Saturdays (3, 10, 17, 24, 31 Oct)
  const noSaturdays = range(25, 55).filter(n => ![25, 32, 39, 46, 53].includes(n));
  const s = story([H('Read', noSaturdays)], 'month', TODAY);
  const w = s.slides.find(x => x.id === 'weekday');
  assert.deepEqual([w.big, w.line], ['Mondays', '100% of what was due on Mondays. The hardest day: Saturdays, at 0%.']);
  assert.ok(!story([H('Read', range(25, 55))], 'month', TODAY).slides.some(x => x.id === 'weekday'), 'an even month has no best day');
});

test('story: with nothing last month it tells this month so far; with nothing at all there is no story', async () => {
  const { story } = await load();
  const s = story([H('Read', range(0, 10), { createdAt: ago(10) + 'T08:00:00' })], 'month', TODAY);
  assert.deepEqual([s.title, s.from, s.to], ['November 2026 so far', '2026-11-01', TODAY]);
  assert.ok(!s.slides.find(x => x.id === 'rate').line.includes('October'), 'nothing to compare with');
  assert.equal(story([], 'month', TODAY), null);
  assert.equal(story([H('Idle')], 'year', TODAY), null);
  assert.equal(story([null], 'month', TODAY), null);
});

test('story: the year so far, and in January the year just ended', async () => {
  const { story } = await load();
  const habits = [H('Read', range(0, 500))];
  const y = story(habits, 'year', TODAY);
  assert.deepEqual([y.title, y.from, y.to], ['2026 so far', '2026-01-01', TODAY]);
  assert.equal(y.slides.find(x => x.id === 'days').big, '329 of 329 days');
  assert.match(y.slides.find(x => x.id === 'rate').line, /^329 of 329 due\. Up 53 points on 2025\.$/);
  assert.ok(y.slides.find(x => x.id === 'month'), 'a year names its best month');
  const jan = story(habits, 'year', '2026-01-10');
  assert.deepEqual([jan.title, jan.from, jan.to], ['2025', '2025-01-01', '2025-12-31']);
});

// ── Suggestions ────────────────────────────────────────────
const at = (n, hour) => { const [y, m, d] = ago(n).split('-').map(Number); return new Date(y, m - 1, d, hour, 5).getTime(); };
const stamps = (days, hour) => Object.fromEntries(days.map(n => [ago(n), at(n, hour)]));

test('suggestions: a habit that is slipping is named with both fortnights, and the time of day it used to work', async () => {
  const { suggestions } = await load();
  const before = range(15, 28), h = H('Meditate', [2, 6, 10, 14, ...before], { completedTimestamps: stamps(before, 7) });
  const s = suggestions([h], TODAY);
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].id, s[0].kind, s[0].habitId, s[0].title], ['slipping:meditate', 'slipping', 'meditate', 'Meditate is slipping']);
  assert.equal(s[0].text, 'Done on 4 of the last 14 days it was due, down from 14 of 14 before that. It mostly got done in the morning. Try mornings again?');
  assert.deepEqual(s[0].action, { label: 'Edit habit', go: 'edit' });
  const evening = suggestions([{ ...h, completedTimestamps: stamps(before, 21) }], TODAY)[0].text;
  assert.match(evening, /It mostly got done in the evening\. Try evenings again\?$/);
  const noTimes = suggestions([{ ...h, completedTimestamps: undefined }], TODAY)[0].text;
  assert.match(noTimes, /before that\. A smaller version may be easier to keep\.$/);
});

test('suggestions: a small dip, a young habit and a habit still mostly done are left alone', async () => {
  const { suggestions } = await load();
  const dip = H('Dip', [...range(1, 11), ...range(15, 28)]);                 // 11 of 14 after 14 of 14: down 21 points
  const fine = H('Fine', [...range(1, 9), ...range(15, 28)], {});            // 9 of 14 = 64%: still above 60
  const young = H('Young', [1, 2], { createdAt: ago(10) + 'T08:00:00' });    // no earlier fortnight to compare with
  assert.deepEqual(suggestions([dip, fine, young], TODAY), []);
  assert.deepEqual(suggestions([], TODAY), []);
  assert.deepEqual(suggestions([null, 'junk'], TODAY), []);
});

test('suggestions: one day of the week a habit rarely happens on', async () => {
  const { suggestions } = await load();
  // TODAY is a Wednesday, so Fridays are 5, 12, 19 ... days ago
  const h = H('Run', range(1, 60).filter(n => n % 7 !== 5));
  const s = suggestions([h], TODAY);
  assert.deepEqual([s.length, s[0].kind, s[0].title], [1, 'weekday', 'Run rarely happens on Fridays']);
  assert.equal(s[0].text, 'Done on 0 of the last 8 Fridays, against 100% on other days. Make Friday a rest day?');
  assert.equal(s[0].id, 'weekday:run:5');
  assert.equal(suggestions([H('Run', range(1, 60).filter(n => n % 7 !== 5 && n % 2))], TODAY).filter(x => x.kind === 'weekday').length, 0, 'not when the other days are weak too');
});

test('suggestions: too much due each day', async () => {
  const { suggestions } = await load();
  const many = range(1, 9).map(i => H('H' + i, range(0, 60).filter(n => (n + i) % 5 < 2)));       // nine habits, each done two days in five
  const s = suggestions(many, TODAY);
  assert.deepEqual(s.map(x => x.kind), ['overload']);
  assert.equal(s[0].text, 'About 9 habits are due on a typical day, and 40% of them got done in the last two weeks. Pausing a few may help the rest.');
  assert.deepEqual([s[0].habitId, s[0].action], [null, null]);
});

test('suggestions: a habit done every day for a month is ready for more', async () => {
  const { suggestions } = await load();
  const s = suggestions([H('Read', range(1, 40))], TODAY);
  assert.deepEqual([s.length, s[0].kind, s[0].title, s[0].text], [1, 'raise', 'Read is solid', 'Done on all 30 of the last 30 days it was due. Ready to make it a little bigger?']);
  assert.deepEqual(suggestions([H('Read', range(1, 40).filter(n => n !== 17))], TODAY), [], 'one miss and it is not said');
});

test('suggestions: at most three, one per habit, never for paused or archived habits', async () => {
  const { suggestions } = await load();
  const before = range(15, 28);
  const slipping = ['A', 'B', 'C', 'D'].map((n, i) => H(n, [...range(1, i), ...before]));
  const s = suggestions([...slipping, H('Solid', range(1, 40))], TODAY);
  assert.deepEqual(s.map(x => x.id), ['slipping:a', 'slipping:b', 'slipping:c']);
  const off = [H('Paused', before, { pauses: [{ from: ago(2) }] }), H('Gone', before, { archivedAt: 1, archivedOn: ago(1) }), H('Call', before, { frequency: 'weekly' })];
  assert.deepEqual(suggestions(off, TODAY), []);
});

test('undismissed: a dismissed suggestion stays away for four weeks, then may return', async () => {
  const { undismissed } = await load();
  const items = [{ id: 'slipping:a' }, { id: 'raise:b' }];
  assert.deepEqual(undismissed(items, { 'slipping:a': ago(3) }, TODAY).map(x => x.id), ['raise:b']);
  assert.deepEqual(undismissed(items, { 'slipping:a': ago(27) }, TODAY).map(x => x.id), ['raise:b']);
  assert.deepEqual(undismissed(items, { 'slipping:a': ago(28) }, TODAY).map(x => x.id), ['slipping:a', 'raise:b']);
  assert.deepEqual(undismissed(items, { 'slipping:a': 'junk', 'raise:b': ago(-3) }, TODAY).length, 2, 'junk and future dates dismiss nothing');
  assert.deepEqual(undismissed(items, null, TODAY).length, 2);
});
