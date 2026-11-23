// Weekly and monthly habits keep streaks in their own unit, the focus timer cannot mint XP, and closing the
// Google sign-in window is a cancel, not a redirect.
module.exports = (scenario, c) => {
  const { boot, ev, sleep, waitFor, signedIn, check, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const monthsAgo = n => { const [y, m] = day(0).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 - n, 15)); return d.toISOString().slice(0, 10); };
  const habit = (o = {}) => ({ userId: 'u-test', name: 'Read', category: 'reading', frequency: 'daily',
    completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: 'off', ...extra,
    mock_fb_db: { habits, users: { 'u-test': { xp: 900 } } } });
  const pill = id => ev(`(document.querySelector('.habit-item[data-id="${id}"] .streak-pill') || { textContent: '' }).textContent.trim()`);
  const ready = () => waitFor(`!!document.querySelector('.habit-item')`);
  const xp = () => ev(`__mockDB.users['u-test'].xp`);

  scenario('streaks: a weekly habit done four weeks running shows a 4-week streak', async () => {
    await boot({ seed: seed({ w: habit({ frequency: 'weekly', completedDates: [day(0), day(7), day(14), day(21)] }) }) });
    await ready(); await sleep(400);
    check('row shows 4 wk', (await pill('w')) === '4 wk', await pill('w'));
    noExceptions();
  });

  scenario('streaks: a weekly streak is still alive before this week\'s check-in, and a missed week ends it', async () => {
    await boot({ seed: seed({
      alive:  habit({ name: 'Alive', frequency: 'weekly', completedDates: [day(7), day(14), day(21)] }),
      broken: habit({ name: 'Broken', frequency: 'weekly', order: 2, completedDates: [day(0), day(14), day(21)] }),
    }) });
    await ready(); await sleep(400);
    check('not yet done this week: 3 wk', (await pill('alive')) === '3 wk', await pill('alive'));
    check('gap last week: back to 1 wk', (await pill('broken')) === '1 wk', await pill('broken'));
  });

  scenario('streaks: a monthly habit counts months', async () => {
    await boot({ seed: seed({ m: habit({ frequency: 'monthly', completedDates: [day(0), monthsAgo(1), monthsAgo(2)] }) }) });
    await ready(); await sleep(400);
    check('row shows 3 mo', (await pill('m')) === '3 mo', await pill('m'));
  });

  scenario('streaks: the day streak on Home counts daily habits only', async () => {
    await boot({ seed: seed({
      d: habit({ completedDates: [day(0), day(1), day(2)] }),
      w: habit({ name: 'Weekly', frequency: 'weekly', order: 2, completedDates: [day(0), day(7), day(14), day(21), day(28)] }),
    }) });
    await ready(); await sleep(400);
    check('daily row still shows a plain number', (await pill('d')) === '3', await pill('d'));
    check('Home streak is 3 days, not 5', (await ev(`document.getElementById('greeting-streak').textContent`)) === '3');
  });

  // The timer follows the clock. Jumping the clock forward stands in for waiting (or for a throttled background tab).
  const clock = `(() => { const real = Date.now.bind(Date); window.__skew = 0; Date.now = () => real() + window.__skew; })();`;
  const startTimer = id => ev(`(() => { document.querySelector('.habit-item[data-id="${id}"] [data-action="timer"]').click();
    const i = document.getElementById('timer-input'); i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('timer-start').click(); })()`);
  const finishTimer = async () => { await ev(`window.__skew += 61000; 0`); await sleep(1800); };
  const timerOpen = () => ev(`!document.getElementById('timer-modal').classList.contains('hidden')`);

  scenario('timer: finishing a session on an open habit completes it for the normal 25 XP', async () => {
    await boot({ seed: seed({ a: habit(), b: habit({ name: 'Run', order: 2 }) }), initScript: clock });
    await ready(); await sleep(400);
    await startTimer('a'); await sleep(300);
    check('timer is running', await timerOpen());
    await finishTimer();
    check('timer closed', !(await timerOpen()));
    check('habit is completed today', await ev(`__mockDB.habits.a.completedDates.includes(${JSON.stringify(day(0))})`));
    check('XP is 925', (await xp()) === 925, await xp());
    noExceptions();
  });

  scenario('timer: repeat sessions on a habit that is already done earn nothing', async () => {
    await boot({ seed: seed({ a: habit({ completedDates: [day(0)], completedTimestamps: { [day(0)]: Date.now() } }), b: habit({ name: 'Run', order: 2 }) }), initScript: clock });
    await ready(); await sleep(400);
    for (let i = 0; i < 2; i++) { await startTimer('a'); await sleep(300); await finishTimer(); }
    check('timer closed', !(await timerOpen()));
    check('XP is still 900', (await xp()) === 900, await xp());
    check('still completed exactly once', await ev(`__mockDB.habits.a.completedDates.length === 1`));
  });

  scenario('timer: the countdown follows the clock, not the number of ticks', async () => {
    await boot({ seed: seed({ a: habit() }), initScript: clock });
    await ready(); await sleep(400);
    await ev(`(() => { document.querySelector('.habit-item[data-id="a"] [data-action="timer"]').click(); document.getElementById('timer-start').click(); })()`);
    await sleep(300);
    await ev(`window.__skew += 10 * 60000; 0`); await sleep(1500);       // ten minutes pass with the tab asleep
    const shown = await ev(`document.getElementById('timer-display').textContent`);
    check('about 15 minutes remain', /^14:5\d$/.test(shown), shown);
    await ev(`document.getElementById('timer-pause').click()`); await sleep(200);
    await ev(`window.__skew += 5 * 60000; 0`); await sleep(1300);
    check('paused time does not count', /^14:5\d$/.test(await ev(`document.getElementById('timer-display').textContent`)));
  });

  const authSeed = { habitly_returning: '1' };
  const google = code => `window.__mockPopupError = ${JSON.stringify(code)}; window.__mockRedirects = 0;`;
  const clickGoogle = async () => { await ev(`document.getElementById('login-btn').click()`); await sleep(700); };

  scenario('sign-in: closing the Google window just cancels', async () => {
    await boot({ seed: authSeed, initScript: google('auth/popup-closed-by-user') });
    await clickGoogle();
    check('no redirect to Google', (await ev(`window.__mockRedirects`)) === 0);
    check('still on the sign-in screen', await ev(`!document.getElementById('auth-screen').classList.contains('hidden') && !__mockAuth.currentUser`));
    check('no error message', (await ev(`document.querySelectorAll('.toast').length`)) === 0);
    noExceptions();
  });

  scenario('sign-in: a blocked popup still falls back to a redirect', async () => {
    await boot({ seed: authSeed, initScript: google('auth/popup-blocked') });
    await clickGoogle();
    check('redirected once', (await ev(`window.__mockRedirects`)) === 1);
  });
};
