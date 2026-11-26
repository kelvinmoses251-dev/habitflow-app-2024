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

// ── Charts ─────────────────────────────────────────────────
test('weeklyRates: twelve weeks, oldest first, each the share of owed days that were done', async () => {
  const { weeklyRates } = await load();
  // TODAY is Wednesday 25 November: this week so far is Mon 23, Tue 24, Wed 25
  const w = weeklyRates(H('Read', [0, 1, 3, 4, 5, 6, 7, 8, 9]), TODAY);
  assert.equal(w.length, 12);
  assert.equal(w[11].start, '2026-11-23'); assert.equal(w[11].current, true); assert.equal(w[0].start, '2026-09-07');
  assert.deepEqual([w[11].due, w[11].done, w[11].rate], [3, 2, 67]);         // Monday missed
  assert.deepEqual([w[10].due, w[10].done, w[10].rate], [7, 7, 100]);
  assert.deepEqual([w[9].due, w[9].done, w[9].rate], [7, 0, 0]);
  assert.ok(w.slice(0, 11).every(x => x.current === false));
});

test('weeklyRates: rest days, pauses and the time before the habit existed are not owed', async () => {
  const { weeklyRates } = await load();
  const weekdays = weeklyRates(H('Gym', [], { schedule: { type: 'days', days: [1, 2, 3, 4, 5] } }), TODAY);
  assert.equal(weekdays[10].due, 5); assert.equal(weekdays[11].due, 3);
  const paused = weeklyRates(H('Swim', [], { pauses: [{ from: '2026-11-16', to: '2026-11-22' }] }), TODAY);
  assert.deepEqual([paused[10].due, paused[10].rate], [0, null]);
  const fresh = weeklyRates(H('New', [0], { createdAt: '2026-11-24T12:00:00Z' }), TODAY);
  assert.deepEqual([fresh[11].due, fresh[11].done], [2, 1]);
  assert.ok(fresh.slice(0, 11).every(x => x.rate === null));
});

test('weeklyRates: a times-a-week habit is measured against its weekly target; a monthly one has no weekly figures', async () => {
  const { weeklyRates } = await load();
  const three = weeklyRates(H('Run', [0, 1, 3, 5, 7, 8], { frequency: 'weekly', schedule: { type: 'times', times: 3 } }), TODAY);
  assert.deepEqual([three[11].due, three[11].done, three[11].rate], [3, 2, 67]);
  assert.deepEqual([three[10].due, three[10].done, three[10].rate], [3, 3, 100]);     // four done, capped at the target
  const weekly = weeklyRates(H('Call home', [2, 9], { frequency: 'weekly' }), TODAY);
  assert.deepEqual([weekly[11].rate, weekly[10].rate, weekly[9].rate], [100, 100, 0]);
  assert.ok(weeklyRates(H('Budget', [3], { frequency: 'monthly' }), TODAY).every(x => x.rate === null));
});

test('weekdayRates: each day of the week over twelve weeks, and the best one', async () => {
  const { weekdayRates } = await load();
  const tuesdays = range(0, 83).filter(n => [2, 4].includes(new Date(num(ago(n)) * 86400000).getUTCDay()));   // every Tuesday and Thursday
  const d = weekdayRates(H('Read', tuesdays), TODAY);
  assert.deepEqual(d.map(x => x.label), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.deepEqual(d.map(x => x.weekday), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual([d[1].due, d[1].done, d[1].rate], [12, 12, 100]);
  assert.deepEqual([d[0].due, d[0].done, d[0].rate], [12, 0, 0]);
  assert.deepEqual(d.filter(x => x.best).map(x => x.label), ['Tuesday']);     // Thursday ties; the earlier day wins
});

test('weekdayRates: days never owed have no rate, a weekly habit counts completions, an empty habit has no best day', async () => {
  const { weekdayRates } = await load();
  const gym = weekdayRates(H('Gym', [0, 7], { schedule: { type: 'days', days: [1, 3, 5] } }), TODAY);
  assert.equal(gym[1].rate, null); assert.equal(gym[1].due, 0);
  assert.equal(gym[2].due, 12); assert.equal(gym[2].done, 2);
  const weekly = weekdayRates(H('Call home', [3, 10, 17, 22], { frequency: 'weekly' }), TODAY);   // three Sundays and a Tuesday
  assert.deepEqual(weekly.map(x => x.done), [0, 1, 0, 0, 0, 0, 3]);
  assert.equal(weekly.find(x => x.best).label, 'Sunday');
  assert.ok(weekly.every(x => x.rate === null));
  assert.equal(weekdayRates(H('Read'), TODAY).filter(x => x.best).length, 0);
  assert.doesNotThrow(() => weekdayRates(null, TODAY));
});

// ── The last year ──────────────────────────────────────────
test('yearCells: 53 weeks of seven days, Monday first, ending with this week', async () => {
  const { yearCells } = await load();
  const y = yearCells(H('Read', range(0, 9)), TODAY);
  assert.equal(y.weeks.length, 53);
  assert.ok(y.weeks.every(col => col.length === 7));
  assert.equal(y.weeks[52][0].day, '2026-11-23');             // this week's Monday
  assert.equal(y.weeks[52][2].day, TODAY); assert.equal(y.weeks[52][2].today, true);
  assert.equal(y.weeks[52][3].state, 'future');
  assert.equal(y.weeks[0][0].day, '2025-11-24');
  assert.equal(y.weeks.flat().filter(c => c.today).length, 1);
});

test('yearCells: counts what was done against what was owed, and says where each month starts', async () => {
  const { yearCells } = await load();
  const y = yearCells(H('Read', range(0, 9), { createdAt: '2026-11-06T12:00:00Z' }), TODAY, []);
  assert.equal(y.done, 10);
  assert.equal(y.due, 20);                                    // 6 to 25 November
  assert.equal(y.weeks[49][0].state, 'before');               // Monday 2 November: before it began
  assert.equal(y.months[y.months.length - 1].label, 'Nov');
  assert.equal(y.months[0].label, 'Dec'); assert.equal(y.months[0].col, 1);   // one column of last November is too narrow for a label
  assert.ok(y.months.every((m, i) => i === 0 || m.col - y.months[i - 1].col >= 3));
  assert.ok(y.months.length >= 12 && y.months.length <= 14);
  assert.ok(y.months.every((m, i) => i === 0 || m.col > y.months[i - 1].col));
});

test('yearCells: shield days, rest days and junk', async () => {
  const { yearCells } = await load();
  const y = yearCells(H('Gym', [0, 2], { schedule: { type: 'days', days: [1, 2, 3, 4, 5] } }), TODAY, [ago(1)]);
  const at = day => y.weeks.flat().find(c => c.day === day);
  assert.equal(at(ago(1)).state, 'shield');
  assert.equal(at(ago(3)).state, 'rest');
  assert.equal(at(ago(5)).state, 'missed');
  for (const bad of [null, {}, { completedDates: 'x' }]) { const r = yearCells(bad, TODAY, 'no'); assert.equal(r.weeks.length, 53); assert.equal(r.done, 0); }
});

// ── Notes search ───────────────────────────────────────────
const note = (n, text) => ({ date: new Date(num(ago(n)) * 86400000 + 12 * 3600000).toISOString(), text });
const joined = item => item.parts.map(p => p.text).join('');

test('searchNotes: newest first, and with no query every note comes back whole', async () => {
  const { searchNotes } = await load();
  const out = searchNotes([note(9, 'Old one'), note(1, 'New one'), note(4, 'Middle')]);
  assert.deepEqual(out.map(n => n.text), ['New one', 'Middle', 'Old one']);
  assert.ok(out.every(n => n.parts.length === 1 && n.parts[0].hit === false && joined(n) === n.text));
  assert.equal(out[0].day, ago(1));
});

test('searchNotes: folds case and accents, needs every word, and marks what matched', async () => {
  const { searchNotes, foldText } = await load();
  assert.equal(foldText('  Café AU Lait '), '  cafe au lait ');
  const notes = [note(1, 'Had a Café au lait after the run'), note(2, 'Long run, slow'), note(3, 'Rest day')];
  assert.deepEqual(searchNotes(notes, 'RUN').map(n => n.text), ['Had a Café au lait after the run', 'Long run, slow']);
  assert.deepEqual(searchNotes(notes, 'cafe run').map(n => n.text), ['Had a Café au lait after the run']);
  assert.deepEqual(searchNotes(notes, 'run zebra'), []);
  const hit = searchNotes(notes, 'cafe')[0];
  assert.deepEqual(hit.parts, [{ text: 'Had a ', hit: false }, { text: 'Café', hit: true }, { text: ' au lait after the run', hit: false }]);
  const twice = searchNotes([note(1, 'run, Run, RUN')], 'run')[0];
  assert.equal(twice.parts.filter(p => p.hit).length, 3);
  assert.equal(joined(twice), 'run, Run, RUN');
});

test('searchNotes: the pieces always join back into the exact text, whatever is in it', async () => {
  const { searchNotes } = await load();
  const odd = ['<img src=x onerror=alert(1)>', 'İstanbul ﬁne Straße', 'tab\there\nnew line', 'été already split', '😀 emoji run'];
  for (const text of odd) for (const q of ['', 'e', 'run', 'i', 'st', 'img']) {
    for (const item of searchNotes([note(1, text)], q)) assert.equal(joined(item), text, JSON.stringify([text, q]));
  }
  assert.equal(searchNotes([note(1, '<b>bold</b>')], 'bold')[0].parts.find(p => p.hit).text, 'bold');
});

test('searchNotes: things that are not notes are dropped', async () => {
  const { searchNotes } = await load();
  const out = searchNotes([note(1, 'Real'), null, 7, { text: 'no date' }, { date: 'never', text: 'bad date' }, { date: note(2, '').date, text: '   ' }, { date: note(2, '').date, text: 12 }]);
  assert.deepEqual(out.map(n => n.text), ['Real']);
  for (const bad of [null, undefined, 'x', {}]) assert.deepEqual(searchNotes(bad, 'a'), []);
});


// ── Insights for one habit ─────────────────────────────────
const says = (out, re) => out.some(i => re.test(i.text));
const stamp = (n, hour) => { const [y, m, d] = ago(n).split('-').map(Number); return new Date(y, m - 1, d, hour, 15).getTime(); };

test('habitInsights: a habit with little history gets one line saying what will come', async () => {
  const { habitInsights } = await load();
  for (const h of [H('Read'), H('Read', [0, 1]), null, {}]) {
    const out = habitInsights(h && h.name ? { ...h, createdAt: new Date(num(ago(3)) * 86400000 + 12 * 3600000).toISOString() } : h, TODAY);
    assert.equal(out.length, 1); assert.equal(out[0].placeholder, true); assert.ok(out[0].text.length > 20);
  }
});

test('habitInsights: the last thirty days against the thirty before', async () => {
  const { habitInsights } = await load();
  const up = habitInsights(H('Read', [...range(0, 23), ...range(30, 47)]), TODAY);
  assert.ok(says(up, /^Done on 24 of the last 30 days it was due, up from 18 of 30 the month before\.$/), JSON.stringify(up));
  const down = habitInsights(H('Read', [...range(0, 11), ...range(30, 55)]), TODAY);
  assert.ok(says(down, /Done on 12 of the last 30 days it was due, down from 26 of 30 the month before\./), JSON.stringify(down));
  const same = habitInsights(H('Read', [...range(0, 19), ...range(30, 49)]), TODAY);
  assert.ok(says(same, /about the same as the month before/));
  const young = habitInsights(H('Read', range(0, 11), { createdAt: new Date(num(ago(14)) * 86400000 + 12 * 3600000).toISOString() }), TODAY);
  assert.ok(says(young, /^Done on 12 of the last 15 days it was due \(80%\)\.$/), JSON.stringify(young));
});

test('habitInsights: strongest and hardest weekday, only when they really differ', async () => {
  const { habitInsights } = await load();
  const weekdays = range(0, 83).filter(n => ![0, 6].includes(new Date(num(ago(n)) * 86400000).getUTCDay()));   // never at weekends
  const out = habitInsights(H('Read', weekdays), TODAY);
  assert.ok(says(out, /^Strongest on Mondays \(12 of 12\), hardest on Saturdays \(0 of 12\)\.$/), JSON.stringify(out));
  assert.ok(!says(habitInsights(H('Read', range(0, 83)), TODAY), /Strongest/));
});

test('habitInsights: the usual time of day, the longest run, and how it feels', async () => {
  const { habitInsights } = await load();
  const days10 = range(0, 9);
  const morning = Object.fromEntries(days10.map(n => [ago(n), stamp(n, n < 8 ? 7 : 20)]));
  const moods = Object.fromEntries(days10.slice(0, 4).map(n => [ago(n), 4]));
  const out = habitInsights(H('Read', days10, { completedTimestamps: morning, moods }), TODAY);
  assert.ok(says(out, /^Usually done in the morning \(8 of 10 times\)\.$/), JSON.stringify(out));
  assert.ok(says(out, /^You are on your longest run yet: 10 days\.$/), JSON.stringify(out));
  assert.ok(says(out, /^It usually feels good \(4 out of 5 over 4 notes\)\.$/), JSON.stringify(out));
  assert.ok(out.length <= 4);
  const mixed = Object.fromEntries(days10.map(n => [ago(n), stamp(n, n % 2 ? 7 : 20)]));
  assert.ok(!says(habitInsights(H('Read', days10, { completedTimestamps: mixed }), TODAY), /Usually done/));
  const late = habitInsights(H('Read', days10, { completedTimestamps: morning, backfilled: Object.fromEntries(days10.slice(0, 7).map(n => [ago(n), true])) }), TODAY);
  assert.ok(!says(late, /Usually done/));                     // days filled in late say nothing about when it is done
  const broken = habitInsights(H('Read', [0, ...range(20, 34)]), TODAY);
  assert.ok(says(broken, /^Your longest run is 15 days\. You are at 1 now\.$/), JSON.stringify(broken));
});

test('habitInsights: weekly habits speak in weeks, and junk never throws', async () => {
  const { habitInsights } = await load();
  const weekly = habitInsights(H('Call home', [2, 9, 16, 23, 30], { frequency: 'weekly' }), TODAY);
  assert.ok(says(weekly, /longest run yet: 5 weeks/), JSON.stringify(weekly));
  assert.ok(!says(weekly, /days it was due/));
  for (const bad of [{ completedDates: ['x'], completedTimestamps: 'no', moods: [9], backfilled: 4 }, { completedDates: range(0, 20).map(ago), completedTimestamps: { [ago(0)]: 'x', [ago(1)]: -5 }, moods: { [ago(0)]: 'sad' } }]) {
    assert.doesNotThrow(() => habitInsights(bad, TODAY, 'no'));
  }
  assert.ok(habitInsights(H('Read', range(0, 40)), TODAY).every(i => typeof i.icon === 'string' && typeof i.text === 'string' && !/[<>]/.test(i.text)));
});
