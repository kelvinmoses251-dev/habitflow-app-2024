// Regression tests for what the independent review of roadmap batch 3 found.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}) => signedIn({ habitly_confirm: null, mock_fb_db: { habits, users: { 'u-test': { xp: 300, ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const xp = () => ev(`__mockDB.users['u-test'].xp`);
  const dates = id => ev(`JSON.stringify((__mockDB.habits[${JSON.stringify(id)}].completedDates || []).slice().sort())`);
  const setField = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const save = async () => { await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(500); };
  const fieldMsg = () => ev(`[...document.querySelectorAll('#habit-sheet .field-msg')].map(m => m.textContent).join(' | ')`);
  const run = (from, n) => Array.from({ length: n }, (_, i) => day(from + i));
  // Another day of this same Monday-to-Sunday week: yesterday, or tomorrow when today is Monday.
  const weekday = new Date(day(0) + 'T12:00:00Z').getUTCDay();
  const other = weekday === 1 ? day(-1) : day(1);

  scenario('review: a times-a-week habit can be ticked again later in the week, for 25 XP each time and no more', async () => {
    await boot({ seed: seed({
      r: H('Run', { frequency: 'weekly', schedule: { type: 'times', times: 3 }, completedDates: [other] }),
      w: H('Review budget', { order: 2, frequency: 'weekly', completedDates: [other], completedTimestamps: { [other]: Date.now() - 5 * 60000 } }),
    }), mobile: false }); await rows(); await sleep(300);
    check('the open row is ticked for today, not for the day it was last done', (await ev(`document.querySelector('.habit-item[data-id="r"] .habit-check').dataset.date`)) === day(0));
    await ev(`document.querySelector('.habit-item[data-id="r"] .habit-check').click()`); await sleep(900);
    check('ticking it adds today beside the earlier day', (await dates('r')) === JSON.stringify([other, day(0)].sort()), await dates('r'));
    check('for 25 XP', (await xp()) === 325, await xp());
    check('and the row moves on to 2 of 3', /2 of 3 this week/.test(await text('.habit-item[data-id="r"] .freq-badge')), await text('.habit-item[data-id="r"] .freq-badge'));
    check('the earlier completion keeps its own time stamp', await ev(`!(__mockDB.habits.r.completedTimestamps || {})[${JSON.stringify(other)}]`));
    check('a habit already done for the week still un-ticks the day it was done', (await ev(`document.querySelector('.habit-item[data-id="w"] .habit-check').dataset.date`)) === other);
    await ev(`document.querySelector('.habit-item[data-id="w"] .habit-check').click()`); await sleep(700);
    check('and taking it back refunds the 25 XP once', (await dates('w')) === '[]' && (await xp()) === 300, await xp());
    noExceptions();
  });

  scenario('review: setting dates on an old habit, or archiving it, never changes its streak', async () => {
    await boot({ seed: seed({
      g: H('Scattered', { completedDates: [day(20), day(50), day(90), day(200)] }),
      k: H('Kept up', { order: 2, completedDates: run(1, 4) }),
    }), mobile: false }); await rows(); await sleep(300);
    check('before: no streak on the scattered habit, 4 on the other', !(await text('.habit-item[data-id="g"] .streak-pill')) && /4/.test(await text('.habit-item[data-id="k"] .streak-pill')));
    await ev(`document.querySelector('.habit-item[data-id="g"] [data-action="edit"]').click()`); await sleep(450);
    await ev(`document.getElementById('habit-dates').open = true; document.querySelector('#habit-dates [data-run="30"]').click()`); await sleep(150);
    await save();
    check('the 30-day run is saved', (await ev(`__mockDB.habits.g.startDate`)) === day(0));
    check('and it does not invent a streak', !(await text('.habit-item[data-id="g"] .streak-pill')), await text('.habit-item[data-id="g"] .streak-pill'));
    check('the headline streak is still 4', /4/.test(await text('#greeting-streak')) || /4/.test(await text('#bar-streak')), (await text('#greeting-streak')) + '|' + (await text('#bar-streak')));
    await ev(`document.querySelector('.habit-item[data-id="g"] [data-action="details"]').click()`); await sleep(400);
    await ev(`document.getElementById('details-archive').click()`); await sleep(500);
    check('archiving records the day it was put away', (await ev(`__mockDB.habits.g.archivedOn`)) === day(0) && await ev(`typeof __mockDB.habits.g.archivedAt === 'number'`));
    check('the leaderboard total counts only habits in play', await waitFor(`__mockDB.users['u-test'].totalStreak === 4`, 3000), await ev(`__mockDB.users['u-test'].totalStreak`));
    await ev(`[...document.querySelectorAll('#toast-container .toast-action')].find(b => b.textContent.trim() === 'Undo').click()`); await sleep(500);
    check('Undo right away leaves no trace', await ev(`!('archivedAt' in __mockDB.habits.g) && !('archivedOn' in __mockDB.habits.g) && !(__mockDB.habits.g.pauses || []).length`));
    noExceptions();
  });

  scenario('review: a habit archived for days comes back with the streak it had', async () => {
    await boot({ seed: seed({
      a: H('Read'),
      o: H('Old project', { order: 2, completedDates: run(6, 5), archivedAt: Date.now() - 5 * 864e5, archivedOn: day(5) }),
      f: H('Finished run', { order: 3, startDate: day(12), endDate: day(4), completedDates: run(4, 3) }),
    }), mobile: false, hash: '#profile' }); await sleep(900);
    await ev(`document.getElementById('open-archive-btn').click()`); await sleep(400);
    await ev(`document.querySelector('#archive-list .archive-item[data-id="o"] [data-action="unarchive"]').click()`); await sleep(500);
    check('restoring records the time away as a pause', (await ev(`JSON.stringify(__mockDB.habits.o.pauses)`)) === JSON.stringify([{ from: day(5), to: day(1) }]) && await ev(`!('archivedAt' in __mockDB.habits.o) && !('archivedOn' in __mockDB.habits.o)`), await ev(`JSON.stringify(__mockDB.habits.o.pauses)`));
    await ev(`document.querySelector('#archive-list .archive-item[data-id="f"] [data-action="unarchive"]').click()`); await sleep(500);
    check('so does restoring a habit whose run had ended', (await ev(`JSON.stringify(__mockDB.habits.f.pauses)`)) === JSON.stringify([{ from: day(3), to: day(1) }]) && await ev(`!('endDate' in __mockDB.habits.f)`), await ev(`JSON.stringify(__mockDB.habits.f.pauses)`));
    await ev(`document.getElementById('archive-close').click(); location.hash = '#home'`); await sleep(600);
    check('the archived habit is back with its streak of 5', /5/.test(await text('.habit-item[data-id="o"] .streak-pill')), await text('.habit-item[data-id="o"] .streak-pill'));
    check('and the finished one with its 3', /3/.test(await text('.habit-item[data-id="f"] .streak-pill')), await text('.habit-item[data-id="f"] .streak-pill'));
    noExceptions();
  });

  scenario('review: a streak shield is not spent on a day when nothing was due', async () => {
    const yesterdayWd = new Date(day(1) + 'T12:00:00Z').getUTCDay();
    const allBut = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== yesterdayWd);
    await boot({ seed: seed({ a: H('Six days a week', { schedule: { type: 'days', days: allBut }, completedDates: run(2, 4) }) }, { streakShields: 1, frozenDates: [] }) }); await rows(); await sleep(1500);
    check('yesterday was a rest day: the shield is kept', await ev(`__mockDB.users['u-test'].streakShields === 1 && !(__mockDB.users['u-test'].frozenDates || []).length`), await ev(`JSON.stringify(__mockDB.users['u-test'])`));
    check('and the streak of 4 stands', /4/.test(await text('.habit-item[data-id="a"] .streak-pill')), await text('.habit-item[data-id="a"] .streak-pill'));
    await boot({ seed: seed({ a: H('Paused', { completedDates: run(3, 4), pauses: [{ from: day(2) }] }), b: H('Also paused', { order: 2, pauses: [{ from: day(2) }] }) }, { streakShields: 1, frozenDates: [] }) }); await sleep(1800);
    check('everything paused: the shield is kept', await ev(`__mockDB.users['u-test'].streakShields === 1 && !(__mockDB.users['u-test'].frozenDates || []).length`));
    await boot({ seed: seed({ a: H('Every day', { completedDates: run(2, 4) }) }, { streakShields: 1, frozenDates: [] }) }); await rows(); await sleep(1500);
    check('a real missed day is still covered, as before', await ev(`__mockDB.users['u-test'].streakShields === 0 && JSON.stringify(__mockDB.users['u-test'].frozenDates) === ${JSON.stringify(JSON.stringify([day(1)]))}`), await ev(`JSON.stringify(__mockDB.users['u-test'])`));
    noExceptions();
  });

  scenario('review: a weekly counting habit done on another day shows its full count', async () => {
    await boot({ seed: seed({ w: H('Batch cook', { frequency: 'weekly', target: { amount: 8, unit: 'portions', step: 1 }, completedDates: [other], progress: { [other]: 8 } }) }), mobile: false }); await rows(); await sleep(300);
    check('the row reads 8 / 8, not 0 / 8', (await text('.habit-item[data-id="w"] .target-count')).trim() === '8 / 8 portions', await text('.habit-item[data-id="w"] .target-count'));
    check('and the button says the goal was reached with 8 of 8', /goal reached, 8 of 8 portions/.test(await ev(`document.querySelector('.habit-item[data-id="w"] .habit-step').getAttribute('aria-label')`)));
    noExceptions();
  });

  scenario('review: a half-typed number or a step too small to count gets a message, not silence', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await ev(`document.getElementById('new-habit-toggle').click()`); await sleep(450);
    await setField('habit-input', 'Water'); await setField('habit-category', 'health');
    await ev(`document.getElementById('habit-target-amount').focus()`);
    await send('Input.insertText', { text: '1e' }); await sleep(100);
    check('the box really holds something the browser cannot read as a number', await ev(`document.getElementById('habit-target-amount').validity.badInput`));
    await save();
    check('Save explains what is wrong', /1 to 100,000/.test(await fieldMsg()) && await visible('#habit-sheet'), await fieldMsg());
    check('and nothing was saved', (await ev(`Object.keys(__mockDB.habits).length`)) === 1);
    await ev(`document.getElementById('habit-target-amount').value = ''`);
    await setField('habit-target-amount', '5'); await setField('habit-target-unit', 'km'); await setField('habit-target-step', '0.0001'); await save();
    check('a step of 0.0001 is refused with a reason', /0\.001/.test(await fieldMsg()) && (await ev(`Object.keys(__mockDB.habits).length`)) === 1, await fieldMsg());
    await setField('habit-target-step', '0.5'); await save();
    check('a step of 0.5 is fine', await ev(`Object.values(__mockDB.habits).some(h => h.name === 'Water' && h.target.step === 0.5)`));
    noExceptions();
  });

  scenario('review: the stats count only what was due', async () => {
    await boot({ seed: seed({
      a: H('Every day', { completedDates: run(0, 30) }),
      o: H('Put away', { order: 2, archivedAt: Date.now() - 40 * 864e5, archivedOn: day(40) }),
      p: H('Paused all month', { order: 3, pauses: [{ from: day(45) }] }),
      n: H('Starts next week', { order: 4, startDate: day(-7) }),
    }), mobile: false, hash: '#stats' }); await sleep(2000);
    check('archived, paused and not-yet-started habits do not spoil perfect days', (await text('#report-perfect-days')).trim() === '30', await text('#report-perfect-days'));
    check('today counts one habit of one', (await text('#stat-today')).trim() === '1/1', await text('#stat-today'));
    noExceptions();
  });
};
