// Regressions from the independent review of roadmap batch 5.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2020-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now(), ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const open = async id => { await ev(`location.hash = '#habit/${id}'`); await sleep(600); };
  const habit = id => ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(id)}])`).then(JSON.parse);
  const xp = () => ev(`__mockDB.users['u-test'].xp`);

  scenario('review: a habit\'s name never reaches analytics through the tab title', async () => {
    await boot({ seed: seed({ a: H('Take my medicine') }) }); await rows(); await sleep(300);
    const base = await ev(`document.title`);
    await open('a');
    check('with usage data shared (the default), the tab title does not carry the habit\'s name', !/medicine/i.test(await ev(`document.title`)) && /Habitly/.test(await ev(`document.title`)), await ev(`document.title`));
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    check('every analytics event pins the page title and address to fixed values', /page_title: 'Habitly'/.test(app) && /page_location: location\.origin \+ location\.pathname/.test(app));
    await boot({ seed: seed({ a: H('Take my medicine') }, {}, { habitly_analytics: 'off' }) }); await rows(); await sleep(300);
    await open('a');
    check('with usage data switched off, the tab title is the habit', (await ev(`document.title`)) === 'Take my medicine · Habitly', await ev(`document.title`));
    await ev(`location.hash = '#home'`); await sleep(400);
    check('and it goes back on leaving', (await ev(`document.title`)) === base);
    noExceptions();
  });

  scenario('review: a day filled in by mistake can be taken back for an hour, not six seconds', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(2, 5) }), b: H('Run', { order: 2 }) }) }); await rows(); await sleep(300);
    await open('a');
    await ev(`document.getElementById('hp-fill-btn').click()`); await sleep(7200);
    check('the Undo toast has gone', !(await ev(`[...document.querySelectorAll('.toast')].some(t => /Yesterday filled in/.test(t.textContent))`)));
    check('the page still offers to take it back', (await visible('#hp-fill')) && /take it back/i.test(await text('#hp-fill-btn')) && /hour/.test(await text('#hp-fill')), await text('#hp-fill'));
    await ev(`document.getElementById('hp-fill-btn').click()`); await sleep(800);
    const a = await habit('a');
    check('taking it back removes the day, its mark and the XP', !a.completedDates.includes(day(1)) && !(a.backfilled && day(1) in a.backfilled) && (await xp()) === 300, JSON.stringify(a.completedDates) + ' ' + await xp());
    check('and the page offers to fill it in again', /Fill in yesterday/.test(await text('#hp-fill-btn')));
    await ev(`location.hash = '#home'`); await sleep(400);
    await ev(`document.getElementById('day-prev').click()`); await sleep(400);
    await ev(`document.querySelector('#habits [data-action="fill-in"][data-id="b"]').click()`); await sleep(800);
    check('on Home, the row filled in offers Take back', await ev(`(() => { const b = document.querySelector('#habits .habit-item[data-id="b"] [data-action="fill-undo"]'); return !!b && /Take back/.test(b.textContent) && b.getBoundingClientRect().height >= 44; })()`));
    await ev(`document.querySelector('#habits .habit-item[data-id="b"] [data-action="fill-undo"]').click()`); await sleep(800);
    check('which takes it back', !(await habit('b')).completedDates.includes(day(1)) && (await xp()) === 300, String(await xp()));
    await ev(`__mockRemote('habits', 'b', { completedDates: [${JSON.stringify(day(1))}], completedTimestamps: { [${JSON.stringify(day(1))}]: Date.now() - 2 * 3600000 }, backfilled: { [${JSON.stringify(day(1))}]: true } })`); await sleep(600);
    check('after an hour the offer is gone: it is locked like any completion', !(await ev(`!!document.querySelector('#habits .habit-item[data-id="b"] [data-action="fill-undo"]')`)));
    noExceptions();
  });

  scenario('review: a weekly habit\'s page counts sensibly, and a perfect record reads 100%', async () => {
    await boot({ seed: seed({ w: H('Call home', { frequency: 'weekly', completedDates: [day(1), day(8), day(15)] }), d: H('Read', { order: 2, completedDates: run(1, 60) }) }) }); await rows(); await sleep(300);
    await open('w');
    check('the year says how many days it was done, not "3 of 3"', /^Done on 3 days in the last year\.$/.test((await text('#year-sum')).trim()), await text('#year-sum'));
    check('the calendar likewise', /^(Done on [0-9]+ days? this month|Nothing was due this month)$/.test((await text('#cal-sum')).trim()), await text('#cal-sum'));
    await open('d');
    check('a daily habit done every day up to yesterday reads 100% while today is still open', (await text('#hp-rate')).trim() === '100%', await text('#hp-rate'));
    check('and its insight says 30 of 30', await ev(`[...document.querySelectorAll('#hp-insights li')].some(li => /Done on 30 of the last 30 days/.test(li.textContent))`));
    noExceptions();
  });

  scenario('review: the notes search waits for a pause in typing', async () => {
    const journals = Array.from({ length: 6 }, (_, i) => ({ date: new Date(Date.now() - i * 864e5).toISOString(), text: 'note ' + i + ' run' }));
    await boot({ seed: seed({ a: H('Run', { journals }) }) }); await rows(); await sleep(300);
    await open('a');
    const drawn = await ev(`(async () => { let n = 0; const list = document.getElementById('details-journal-list'); const mo = new MutationObserver(records => { n += records.length; }); mo.observe(list, { childList: true });
      const box = document.getElementById('notes-search'); for (const q of ['n', 'no', 'not', 'note', 'note 3']) { box.value = q; box.dispatchEvent(new Event('input', { bubbles: true })); }
      await new Promise(r => setTimeout(r, 500)); mo.disconnect(); return n; })()`);
    check('five quick keystrokes redraw the list once', drawn === 1, String(drawn));
    check('with the right result', (await ev(`document.querySelectorAll('#details-journal-list .journal-entry').length`)) === 1 && (await text('#notes-count')).trim() === '1 of 6 notes');
    noExceptions();
  });
};
