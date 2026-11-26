// Home (roadmap batch 2): today's list first, faster completion, a list that organises itself.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}, profile = { xp: 300 }) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': profile } } });
  const six = () => ({
    a: H('Drink water', { order: 1, completedDates: [day(0), day(1), day(2)], completedTimestamps: { [day(0)]: Date.now() - 5000 } }),
    b: H('Read 10 pages', { order: 2, category: 'reading', completedDates: [day(0), day(1)], completedTimestamps: { [day(0)]: Date.now() - 5000 } }),
    c: H('Workout', { order: 3, category: 'fitness', completedDates: [day(1), day(2)] }),
    d: H('Meditate', { order: 4, category: 'relaxation' }),
    e: H('Journal', { order: 5, category: 'mind' }),
    f: H('Stretch', { order: 6, category: 'fitness' }),
  });
  const rows = () => waitFor(`!!document.querySelector('#habits .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const firstRowTop = () => ev(`Math.round(document.querySelector('#habits .habit-item').getBoundingClientRect().top)`);

  // ── 11: the summary collapses on phones ──────────────────
  scenario('home: the first habit is on the first screen of a phone', async () => {
    for (const [w, h] of [[375, 667], [390, 844], [320, 568]]) {
      await boot({ seed: seed(six()) }); await size(w, h); await ev(`scrollTo(0, 0)`); await rows(); await sleep(350);
      const top = await firstRowTop();
      check(`${w}x${h}: first habit row starts within 320px of the top`, top <= 320, top);
      check(`${w}x${h}: no horizontal scroll`, await ev(`document.documentElement.scrollWidth <= innerWidth`));
    }
    noExceptions();
  });

  scenario('home: the compact summary shows progress and expands on tap', async () => {
    await boot({ seed: seed(six()) }); await rows(); await sleep(350);
    const more = `document.getElementById('summary-more')`;
    check('the compact bar is a button', await visible('#summary-toggle') && (await ev(`document.getElementById('summary-toggle').getAttribute('aria-expanded')`)) === 'false');
    check('it shows how many are done', /2 of 6/.test(await ev(`document.getElementById('summary-toggle').textContent`)));
    check('it shows the streak', /\b3\b/.test(await ev(`document.getElementById('bar-streak').textContent`)), await ev(`document.getElementById('bar-streak').textContent`));
    check('the details are folded away and out of the tab order', await ev(`${more}.getBoundingClientRect().height < 2 && ${more}.inert === true`));
    await ev(`document.getElementById('summary-toggle').click()`); await sleep(400);
    check('tapping expands it', await ev(`${more}.getBoundingClientRect().height > 200 && !${more}.inert && document.getElementById('summary-toggle').getAttribute('aria-expanded') === 'true'`));
    check('the week strip is there', await visible('#week-strip'));
    await ev(`location.reload()`); await rows(); await sleep(400);
    check('the choice is remembered', (await ev(`document.getElementById('summary-toggle').getAttribute('aria-expanded')`)) === 'true');
    await ev(`document.getElementById('summary-toggle').click()`); await sleep(400);
    check('tapping again folds it', await ev(`${more}.getBoundingClientRect().height < 2`));
    check('the list comes before New habit on a phone', await ev(`document.querySelector('#habits').getBoundingClientRect().top < document.getElementById('new-habit-toggle').getBoundingClientRect().top`));
    await ev(`document.getElementById('today-add').click()`); await sleep(600);
    check('the + in the Today header opens the New habit form with the cursor in it', await ev(`!document.getElementById('habit-form').hidden && document.activeElement.id === 'habit-input'`));
    check('the + is a 44px target', (await ev(`Math.min(...['width', 'height'].map(k => document.getElementById('today-add').getBoundingClientRect()[k]))`)) >= 44);
    noExceptions();
  });

  scenario('home: a streak at risk is shown in the slim bar instead of pushing the list down', async () => {
    // Late evening, by moving the clock: 21:30 local today
    const late = `(() => { const R = Date; const base = new R(); base.setHours(21, 30, 0, 0); const skew = base.getTime() - R.now();
      window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + skew); } static now() { return R.now() + skew; } }; })();`;
    await boot({ seed: seed({ a: H('Evening run', { completedDates: [day(1), day(2), day(3)] }), b: H('Read', { order: 2 }) }), initScript: late });
    await rows(); await sleep(400);
    check('the bar carries the warning', /Evening run: 3-day streak ends in/.test(await ev(`document.getElementById('bar-line').textContent`)), await ev(`document.getElementById('bar-line').textContent`));
    check('the separate banner is not shown while folded', !(await visible('#streak-risk')));
    check('the first row is still on the first screen', (await firstRowTop()) <= 320, await firstRowTop());
    await ev(`document.getElementById('summary-toggle').click()`); await sleep(400);
    check('unfolded, the banner is back', await visible('#streak-risk'));
    noExceptions();
  });

  // ── 15: one tap completes, with Undo ─────────────────────
  const xp = () => ev(`__mockDB.users['u-test'].xp`);
  const doneToday = id => ev(`(__mockDB.habits[${JSON.stringify(id)}].completedDates || []).includes(${JSON.stringify(day(0))})`);
  const tick = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-check').click()`);
  const undo = () => ev(`document.querySelector('#toast-container .toast-action').click()`);

  scenario('home: one tap completes a habit and Undo puts everything back', async () => {
    await boot({ seed: seed(six()) }); await rows(); await sleep(300);
    await tick('d');
    check('no question is asked', await waitFor(`${JSON.stringify(day(0))} && (__mockDB.habits.d.completedDates || []).length === 1`, 3000) && !(await visible('#confirm-check-modal')));
    check('XP goes up by 25', await waitFor(`__mockDB.users['u-test'].xp === 325`, 3000), await xp());
    check('the toast offers Undo', await waitFor(`!!document.querySelector('#toast-container .toast-action')`, 3000) && /Undo/.test(await ev(`document.querySelector('#toast-container .toast-action').textContent`)));
    check('the toast stays about six seconds', await ev(`parseFloat(getComputedStyle(document.querySelector('.toast .toast-bar')).animationDuration) === 6`));
    await undo();
    check('Undo un-completes it', await waitFor(`(__mockDB.habits.d.completedDates || []).length === 0`, 3000));
    check('and refunds the XP', await waitFor(`__mockDB.users['u-test'].xp === 300`, 3000), await xp());
    check('the row is un-ticked', await waitFor(`!document.querySelector('.habit-item[data-id="d"] .habit-check').checked`, 3000));
    noExceptions();
  });

  scenario('home: Undo after the last habit follows the same rules as un-ticking', async () => {
    const one = { a: H('Only habit') };
    await boot({ seed: seed(one) }); await rows(); await sleep(300);
    await tick('a');
    check('finishing everything shows the all-done dialog and the bonus', await waitFor(`!document.getElementById('all-done-overlay').classList.contains('hidden') && __mockDB.users['u-test'].xp === 425`, 6000), await xp());
    await undo(); await sleep(900);
    check('Undo takes back the 25 XP for the habit', (await xp()) === 400, await xp());
    check('the habit is open again', !(await doneToday('a')));
    await ev(`document.getElementById('all-done-close').click()`); await sleep(200);
    await tick('a'); await sleep(1500);
    check('doing it again cannot claim the daily bonus twice', (await xp()) === 425, await xp());
    noExceptions();
  });

  scenario('home: people who switched "Ask before completing" on still get asked, and it works offline', async () => {
    await boot({ seed: seed(six(), { habitly_confirm: 'on' }) }); await rows(); await sleep(300);
    await tick('d');
    check('the question appears', await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`, 3000));
    check('nothing is completed until they answer', !(await doneToday('d')));
    await ev(`document.getElementById('confirm-check-yes').click()`);
    check('answering yes completes it, with Undo offered too', await waitFor(`(__mockDB.habits.d.completedDates || []).length === 1 && !!document.querySelector('#toast-container .toast-action')`, 4000));
    await boot({ seed: seed(six()) }); await rows(); await sleep(300);
    await ev(`window.__mockOffline = true; 0`);
    await tick('e');
    check('offline: the row ticks at once', await waitFor(`document.querySelector('.habit-item[data-id="e"] .habit-check').checked`, 3000));
    await waitFor(`!!document.querySelector('#toast-container .toast-action')`, 3000); await undo();
    check('offline: Undo un-ticks at once', await waitFor(`!document.querySelector('.habit-item[data-id="e"] .habit-check').checked`, 3000));
    noExceptions();
  });

  scenario('home: the summary is open for an empty account and always full on desktop', async () => {
    await boot({ seed: seed({}) }); await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`); await sleep(300);
    check('empty account: expanded, so the first thing seen is not a bare bar', await ev(`document.getElementById('summary-more').getBoundingClientRect().height > 200`));
    await boot({ seed: seed(six(), { habitly_summary: 'closed' }), mobile: false }); await rows(); await sleep(300);
    check('desktop: details always shown', await ev(`document.getElementById('summary-more').getBoundingClientRect().height > 200 && !document.getElementById('summary-more').inert`));
    check('desktop: no compact bar', !(await visible('#summary-toggle')));
    check('desktop: greeting is visible', await visible('#greeting-name'));
    await boot({ seed: seed(six()) }); await rows();
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });   // after boot: boot sets its own media emulation
    try {
      await sleep(100);
      check('reduced motion: folding does not animate', (await ev(`getComputedStyle(document.getElementById('summary-more')).transitionDuration`)).split(',').every(d => parseFloat(d) < 0.01));   // the global reduced-motion rule sets .01ms
    } finally { await send('Emulation.setEmulatedMedia', { features: [] }); }
    noExceptions();
  });

  // ── 17: weekly and monthly habits have their own sections ─
  const mixed = () => ({
    a: H('Drink water', { order: 1 }),
    b: H('Read', { order: 2, category: 'reading' }),
    w1: H('Review budget', { order: 3, category: 'saving', frequency: 'weekly', completedDates: [day(0)], completedTimestamps: { [day(0)]: Date.now() - 5000 } }),
    w2: H('Call family', { order: 4, category: 'social', frequency: 'weekly' }),
    m1: H('Back up photos', { order: 5, category: 'project', frequency: 'monthly' }),
  });
  const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  const txt = id => ev(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);

  scenario('home: weekly and monthly habits have their own sections', async () => {
    await boot({ seed: seed(mixed()) }); await rows(); await sleep(300);
    check('Today lists only the daily habits', (await count('#habits .habit-item')) === 2);
    check('This week lists the weekly ones', (await count('#habits-week .habit-item')) === 2 && await visible('#week-card'));
    check('This week says how many are done', (await txt('week-count')) === '1 of 2', await txt('week-count'));
    check('This month lists the monthly one', (await count('#habits-month .habit-item')) === 1 && (await txt('month-count')) === '0 of 1');
    check('each habit appears exactly once', (await count('.habit-item')) === 5);
    check('the sections have headings', (await ev(`[...document.querySelectorAll('#week-card h2, #month-card h2')].map(h => h.textContent.trim()).join('|')`)) === 'This week|This month');
    await ev(`document.querySelector('.habit-item[data-id="w2"] .habit-check').click()`);
    check('completing a weekly habit works from its section', await waitFor(`(__mockDB.habits.w2.completedDates || []).length === 1`, 3000));
    check('and its count updates', await waitFor(`document.getElementById('week-count').textContent.trim() === '2 of 2'`, 3000));
    await ev(`document.querySelector('.habit-item[data-id="m1"] [data-action="details"]').click()`); await sleep(300);
    check('row actions work in the other sections too', await ev(`document.getElementById('page-habit').classList.contains('active')`));   // the habit page (a dialog before batch 5)
    check('no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    noExceptions();
  });

  scenario('home: the extra sections only appear when they are needed', async () => {
    await boot({ seed: seed(six()) }); await rows(); await sleep(300);
    check('daily habits only: no This week or This month', !(await visible('#week-card')) && !(await visible('#month-card')));
    await boot({ seed: seed({ w1: H('Review budget', { frequency: 'weekly' }) }) });
    await waitFor(`!!document.querySelector('#habits-week .habit-item')`); await sleep(300);
    check('weekly habits only: Today explains itself instead of sitting empty', /no daily habits/i.test(await ev(`document.getElementById('page-home').innerText`)) && !(await visible('#empty-state')));
    await boot({ seed: seed(mixed()), mobile: false }); await rows(); await sleep(300);
    check('desktop: the sections sit in the list column beside the summary', /* geometry */await ev(`(() => { const w = document.getElementById('week-card').getBoundingClientRect(), s = document.getElementById('summary').getBoundingClientRect(), t = document.getElementById('habits').getBoundingClientRect(); return Math.abs(w.left - t.left) < 40 && w.right <= s.left; })()`));
    noExceptions();
  });

  // ── 12: Today grouped by time of day ─────────────────────
  // A fixed local hour, by moving the clock (same trick as the streak-risk scenario).
  const atHour = h => `(() => { const R = Date; const base = new R(); base.setHours(${h}, 15, 0, 0); const skew = base.getTime() - R.now();
    window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + skew); } static now() { return R.now() + skew; } }; })();`;
  const timed = () => ({
    a: H('Stretch', { order: 1, timeOfDay: 'morning' }),
    b: H('Walk', { order: 2, timeOfDay: 'afternoon' }),
    c: H('Read', { order: 3, timeOfDay: 'evening' }),
    d: H('Drink water', { order: 4 }),
    e: H('Vitamins', { order: 5, timeOfDay: 'morning' }),
  });
  const layout = () => ev(`[...document.querySelectorAll('#habits > li')].map(li => li.classList.contains('group-head') ? '[' + li.textContent.trim() + ']' : li.querySelector('.habit-name').textContent.trim()).join(' ')`);

  scenario('home: Today is grouped by time of day, with the current part of the day first', async () => {
    await boot({ seed: seed(six()) }); await rows(); await sleep(300);
    check('no group headings when no habit has a time', (await count('#habits .group-head')) === 0);
    await boot({ seed: seed(timed()), initScript: atHour(9) }); await rows(); await sleep(300);
    check('morning: Morning first', (await layout()) === '[Morning] Stretch Vitamins [Afternoon] Walk [Evening] Read [Any time] Drink water', await layout());
    await boot({ seed: seed(timed()), initScript: atHour(19) }); await rows(); await sleep(300);
    check('evening: Evening first', (await layout()) === '[Evening] Read [Morning] Stretch Vitamins [Afternoon] Walk [Any time] Drink water', await layout());
    check('headings are slim (28px or less)', (await ev(`Math.max(...[...document.querySelectorAll('#habits .group-head')].map(e => e.getBoundingClientRect().height))`)) <= 28);
    check('headings are not announced as list items to tick', await ev(`[...document.querySelectorAll('#habits .group-head')].every(e => !e.querySelector('input, button'))`));
    for (const [w, h] of [[375, 667], [320, 568]]) {
      await size(w, h); await ev(`scrollTo(0, 0)`); await sleep(250);
      check(`${w}x${h}: the first habit is still on the first screen with headings`, (await firstRowTop()) <= 320, await firstRowTop());
    }
    noExceptions();
  });

  scenario('home: a habit can be given a time of day when it is created or edited', async () => {
    await boot({ seed: seed({}) }); await waitFor(`!document.getElementById('habit-form').hidden`); await sleep(300);
    check('the form offers a time of day, defaulting to any time', (await ev(`document.getElementById('habit-time').value`)) === 'any' && (await count('#habit-form .select-btn')) === 5);
    await ev(`(() => { document.getElementById('habit-input').value = 'Evening walk'; document.getElementById('habit-category').value = 'fitness'; document.getElementById('habit-frequency').value = 'daily'; document.getElementById('habit-time').value = 'evening'; document.getElementById('habit-form').requestSubmit(); })()`);
    await waitFor(`Object.keys(__mockDB.habits || {}).length === 1`, 3000);
    check('it is saved with the habit', (await ev(`Object.values(__mockDB.habits)[0].timeOfDay`)) === 'evening');
    check('and it appears under Evening', /\[Evening\] Evening walk/.test(await layout()), await layout());
    await ev(`(() => { document.getElementById('habit-input').value = 'Water'; document.getElementById('habit-category').value = 'health'; document.getElementById('habit-frequency').value = 'daily'; document.getElementById('habit-time').value = 'any'; document.getElementById('habit-form').requestSubmit(); })()`);
    await waitFor(`Object.keys(__mockDB.habits || {}).length === 2`, 3000);
    check('"any time" stores nothing extra', await ev(`Object.values(__mockDB.habits).filter(h => 'timeOfDay' in h).length === 1`));
    await ev(`document.querySelector('.habit-item [data-action="edit"]').click()`); await sleep(350);
    const id = await ev(`document.querySelector('.habit-item [data-action="edit"]').dataset.id`);
    check('editing shows the saved time', (await ev(`document.getElementById('habit-time').value`)) === (await ev(`__mockDB.habits[${JSON.stringify(id)}].timeOfDay || 'any'`)));
    await ev(`(() => { document.getElementById('habit-time').value = 'morning'; document.getElementById('habit-form').requestSubmit(); })()`); await sleep(400);
    check('and saves a change', (await ev(`__mockDB.habits[${JSON.stringify(id)}].timeOfDay`)) === 'morning');
    const fs = require('fs'), path = require('path');
    check('the privacy policy says a habit can store a time of day', /time of day/i.test(fs.readFileSync(path.resolve(__dirname, '..', '..', 'privacy.html'), 'utf8')));
    noExceptions();
  });
};
