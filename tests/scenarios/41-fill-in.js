// 24 hours to fill in a missed day (roadmap batch 5, item 46; approved by the owner on 26 November 2026).
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 1, frozenDates: [], ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const open = async id => { await ev(`location.hash = '#habit/${id}'`); await sleep(600); };
  const home = async () => { await ev(`location.hash = '#home'`); await sleep(400); };
  const habit = id => ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(id)}])`).then(JSON.parse);
  const xp = () => ev(`__mockDB.users['u-test'].xp`);
  const moment = () => ev(`(() => { const m = document.getElementById('moment'); return m && !m.classList.contains('hidden') ? m.dataset.moment : ''; })()`);
  const fillButtons = () => ev(`[...document.querySelectorAll('#habits [data-action="fill-in"]')].map(b => b.dataset.id).sort().join(',')`);
  const yesterdayWeekday = new Date(day(1) + 'T12:00:00Z').getUTCDay();

  scenario('fill in: a day missed yesterday can be completed today, from the habit page', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(2, 8) }), b: H('Run', { order: 2 }) }) }); await rows(); await sleep(900);
    check('the shield question is up for the missed day', (await moment()) === 'shield');
    await open('a');
    check('the habit page offers to fill in yesterday', (await visible('#hp-fill')) && /yesterday/i.test(await text('#hp-fill')) && /midnight/i.test(await text('#hp-fill')));
    check('with a thumb-sized button', await ev(`(() => { const b = document.getElementById('hp-fill-btn'); return b.tagName === 'BUTTON' && b.getBoundingClientRect().height >= 44; })()`));
    await ev(`(() => { const b = document.getElementById('hp-fill-btn'); b.click(); b.click(); })()`); await sleep(800);
    const a = await habit('a');
    check('it is saved as done yesterday, with the time it was really done', a.completedDates.includes(day(1)) && typeof a.completedTimestamps[day(1)] === 'number' && Date.now() - a.completedTimestamps[day(1)] < 60000, JSON.stringify(a.completedTimestamps));
    check('and marked as filled in late', a.backfilled && a.backfilled[day(1)] === true, JSON.stringify(a.backfilled));
    check('it earns 25 XP once, even on a double tap', (await xp()) === 325, String(await xp()));
    check('never the daily bonus, and no all-done card', (await ev(`__mockDB.users['u-test'].allDoneBonusDate`)) === undefined && await ev(`document.getElementById('all-done-overlay').classList.contains('hidden')`));
    check('the streak joins up', (await text('#details-current-streak')).trim() === '8', await text('#details-current-streak'));
    check('the offer goes', !(await visible('#hp-fill')));
    check('and so does the shield question: nothing was missed after all', (await moment()) === '' && (await ev(`__mockDB.users['u-test'].streakShields`)) === 1);
    if (day(1).slice(0, 7) === day(0).slice(0, 7)) check('the calendar shows the day as done, filled in late', await ev(`(() => { const td = document.querySelector('#hp-calendar td[data-day="${day(1)}"]'); return td.classList.contains('is-done') && td.classList.contains('is-late') && /filled in late/.test(td.getAttribute('aria-label')); })()`));
    check('a toast says so, with Undo', await ev(`[...document.querySelectorAll('.toast')].some(t => /Yesterday filled in/.test(t.textContent) && !!t.querySelector('.toast-action'))`));
    await ev(`[...document.querySelectorAll('.toast')].find(t => /Yesterday filled in/.test(t.textContent)).querySelector('.toast-action').click()`); await sleep(800);
    const undone = await habit('a');
    check('Undo takes it all back: the day, its time, the mark and the XP', !undone.completedDates.includes(day(1)) && !(undone.completedTimestamps && day(1) in undone.completedTimestamps) && !(undone.backfilled && day(1) in undone.backfilled) && (await xp()) === 300, JSON.stringify(undone) + ' ' + await xp());
    check('and the offer is back', await visible('#hp-fill'));
    noExceptions();
  });

  scenario('fill in: from Home, looking at yesterday; and never for older days', async () => {
    await boot({ seed: seed({
      a: H('Read', { completedDates: [day(1), day(3)] }),
      b: H('Run', { order: 2 }),
      w: H('Water', { order: 3, target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [day(1)]: 3 } }),
      k: H('Call home', { order: 4, frequency: 'weekly' }),
    }, { streakShields: 0, shieldUsedAt: Date.now() }) }); await rows(); await sleep(400);
    check('today\'s list has no fill-in buttons', (await fillButtons()) === '');
    await ev(`document.getElementById('day-prev').click()`); await sleep(400);
    check('yesterday: the missed daily habits can be filled in, not the done or weekly ones', (await fillButtons()) === 'b,w', await fillButtons());
    check('the note says yesterday can still be filled in', /still be filled in until midnight/.test(await text('#past-note')), await text('#past-note'));
    check('each is a named, thumb-sized button', await ev(`[...document.querySelectorAll('#habits [data-action="fill-in"]')].every(b => b.tagName === 'BUTTON' && /yesterday/.test(b.getAttribute('aria-label')) && b.getBoundingClientRect().height >= 44)`));
    await ev(`document.querySelector('#habits [data-action="fill-in"][data-id="w"]').click()`); await sleep(800);
    const w = await habit('w');
    check('filling in a counting habit completes it with its full count', w.completedDates.includes(day(1)) && w.progress[day(1)] === 8 && w.backfilled[day(1)] === true, JSON.stringify(w));
    check('the row now shows it done, marked as filled in late, with no button', await ev(`(() => { const r = document.querySelector('#habits .habit-item[data-id="w"]'); return r.querySelector('.habit-check').checked && /Filled in late/.test(r.textContent) && !r.querySelector('[data-action="fill-in"]'); })()`));
    check('for 25 XP', (await xp()) === 325);
    await ev(`document.getElementById('day-prev').click()`); await sleep(400);
    check('two days ago: the note says it cannot be changed', /cannot be changed/.test(await text('#past-note')));
    check('two days ago: nothing can be filled in', (await fillButtons()) === '' && await ev(`[...document.querySelectorAll('#habits .habit-check')].every(c => c.disabled)`));
    await ev(`document.getElementById('back-to-today').click()`); await sleep(300);
    noExceptions();
  });

  scenario('fill in: not offered when yesterday was done, a rest day, paused, or before the habit began', async () => {
    const others = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== yesterdayWeekday);
    await boot({ seed: seed({
      d: H('Done', { completedDates: [day(1)] }),
      r: H('Rests', { order: 2, schedule: { type: 'days', days: others } }),
      p: H('Paused then', { order: 3, pauses: [{ from: day(4), to: day(1) }] }),
      n: H('New today', { order: 4, createdAt: new Date().toISOString() }),
      z: H('Archived', { order: 5, archivedAt: Date.now(), archivedOn: day(0) }),
      m: H('Missed', { order: 6 }),
    }, { streakShields: 0, shieldUsedAt: Date.now() }) }); await rows(); await sleep(400);
    for (const [id, why] of [['d', 'done yesterday'], ['r', 'a rest day yesterday'], ['p', 'paused yesterday'], ['n', 'made today']]) {
      await open(id);
      check(`${why}: no offer`, !(await visible('#hp-fill')));
    }
    await open('m');
    check('a plain missed day: offered', await visible('#hp-fill'));
    await home();
    await ev(`document.getElementById('day-prev').click()`); await sleep(400);
    check('and on Home only that one has the button', (await fillButtons()) === 'm', await fillButtons());
    const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
    check('the privacy policy mentions days filled in the day after', /filled in the day after/.test(privacy));
    noExceptions();
  });
};
