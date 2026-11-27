// Run with: node --test tests/stats-export.test.js
// What leaves the app as a file: the CSV of every check-in, and the figures the PDF report is drawn from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'stats-export.js')).href);

const num = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const key = n => { const d = new Date(n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const TODAY = '2026-11-25';
const ago = n => key(num(TODAY) - n);
const range = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(n); return out; };
const H = (name, days = [], o = {}) => ({ id: name.toLowerCase(), name, category: 'health', frequency: 'daily', completedDates: days.map(ago), createdAt: '2026-09-01T10:00:00', ...o });
const lines = csv => csv.replace(/^﻿/, '').split('\r\n');

test('stats-export.js loads the same copies of the rules and the stats as the app', () => {
  const v = (f, re) => (fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(re) || [])[1];
  assert.equal(v('stats-export.js', /habit-rules\.js\?v=(\d+)/), v('app.js', /habit-rules\.js\?v=(\d+)/));
  assert.equal(v('stats-export.js', /\/stats\.js\?v=(\d+)/), v('app.js', /\/stats\.js\?v=(\d+)/));
});

// ── CSV ────────────────────────────────────────────────────
test('toCsv: one row per check-in, oldest first, with a header', async () => {
  const { toCsv } = await load();
  const habits = [
    H('Read', [2, 0], { category: 'reading', moods: { [ago(2)]: 4 } }),
    H('Water', [1], { target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [ago(1)]: 8 }, backfilled: { [ago(1)]: true } }),
    H('Call', [2], { frequency: 'weekly' }),
  ];
  const out = toCsv(habits, k => ({ health: 'Health', reading: 'Reading' })[k] || 'Health');
  assert.ok(out.startsWith('﻿'), 'a byte order mark, so Excel reads it as UTF-8');
  assert.ok(out.endsWith('\r\n'));
  assert.deepEqual(lines(out).slice(0, -1), [
    'Date,Habit,Category,Schedule,Count,Filled in late,Mood (1 to 5)',
    `${ago(2)},Call,Health,Once a week,,,`,
    `${ago(2)},Read,Reading,Every day,,,4`,
    `${ago(1)},Water,Health,Every day,8 glasses,yes,`,
    `${ago(0)},Read,Reading,Every day,,,`,
  ]);
});

test('toCsv: awkward names are quoted, and nothing can run as a formula', async () => {
  const { toCsv, csvCell } = await load();
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvCell('+1 walk'), "'+1 walk");
  assert.equal(csvCell('-5kg, slowly'), '"\'-5kg, slowly"');
  assert.equal(csvCell('@home'), "'@home");
  assert.equal(csvCell('\tTabbed'), "'\tTabbed");
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(12), '12');
  const out = toCsv([H('=HYPERLINK("http://x","click"), now', [1])], () => 'Health');
  assert.equal(lines(out)[1], `${ago(1)},"'=HYPERLINK(""http://x"",""click""), now",Health,Every day,,,`);
});

test('toCsv: the schedule is the one in force that day; junk habits and dates are left out', async () => {
  const { toCsv } = await load();
  const h = H('Swim', [1, 20], { frequency: 'weekly', scheduleHistory: [{ from: '2026-09-01', schedule: { type: 'days', days: [1, 3, 5] } }, { from: ago(10), schedule: { type: 'times', times: 3 } }] });
  const out = lines(toCsv([h, null, 'junk', { name: 'Bad', completedDates: ['not-a-day', 5] }], () => 'Health'));
  assert.deepEqual(out.slice(1, -1), [`${ago(20)},Swim,Health,"Mon, Wed, Fri",,,`, `${ago(1)},Swim,Health,3 times a week,,,`]);
  assert.deepEqual(lines(toCsv([], () => 'Health')), ['Date,Habit,Category,Schedule,Count,Filled in late,Mood (1 to 5)', '']);
});

// ── The report ─────────────────────────────────────────────
test('reportModel: the figures the PDF is drawn from', async () => {
  const { reportModel } = await load();
  const habits = [
    H('Read', range(0, 40), { category: 'reading', journals: [{ date: ago(3) + 'T19:30:00', text: 'Finished the chapter.' }, { date: ago(50) + 'T08:00:00', text: 'Started.' }] }),
    H('Run', range(1, 10), {}),
    H('Call', [3, 12], { frequency: 'weekly' }),
    H('Gone', [30], { archivedAt: num(ago(20)) * 864e5, archivedOn: ago(20) }),
  ];
  const m = reportModel(habits, TODAY, { name: 'Ada', catLabel: k => (k === 'reading' ? 'Reading' : 'Health') });
  assert.deepEqual([m.title, m.name, m.made], ['Habit report', 'Ada', 'Wed 25 Nov 2026']);
  assert.deepEqual(m.figures.map(f => f.label), ['Done of what was due, last 30 days', 'Check-ins, last 30 days', 'Perfect days, last 30 days', 'Longest streak']);
  assert.deepEqual(m.figures.map(f => f.value), ['59%', '42', '10', '41 days']);
  assert.equal(m.months.length, 12);
  assert.deepEqual([m.months[11].label, m.months[11].done], ['Nov', 37]);
  assert.deepEqual(m.rows, [
    ['Read', 'Reading', 'Every day', '41 days', '41 days', '100%', '41'],
    ['Run', 'Health', 'Every day', '10 days', '10 days', '34%', '10'],
    ['Call', 'Health', 'Once a week', '2 weeks', '2 weeks', '-', '2'],
    ['Gone (archived)', 'Health', 'Every day', '-', '1 day', '0%', '1'],
  ]);
  assert.ok(m.records.length >= 5 && m.records.every(r => r.length === 3));
  assert.deepEqual(m.notes, [{ when: ago(3), habit: 'Read', text: 'Finished the chapter.' }, { when: ago(50), habit: 'Read', text: 'Started.' }]);
});

test('reportModel: an empty account still makes a report, and nothing reads NaN', async () => {
  const { reportModel } = await load();
  const m = reportModel([], TODAY, {});
  assert.deepEqual([m.name, m.rows, m.records, m.notes], ['', [], [], []]);
  assert.ok(!/NaN|undefined|null/.test(JSON.stringify(m.figures)));
  assert.equal(m.figures[0].value, '-');
  assert.ok(!/[^\x00-\xff]/.test(JSON.stringify(reportModel([H('Call', [3], { frequency: 'weekly' })], TODAY, {}))), 'nothing outside Latin-1 is put into the PDF by the app itself');
});
