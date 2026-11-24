// Home views (roadmap batch 2): day browser, filter and search, focus view.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#habits .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const key = async k => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }); await sleep(200); };
  const names = () => ev(`[...document.querySelectorAll('#habits .habit-item')].map(r => r.querySelector('.habit-name').textContent.trim() + (r.querySelector('.habit-check').checked ? '*' : '')).join(', ')`);
  const title = () => ev(`document.getElementById('today-title').textContent.trim()`);

  // ── 16: day browser ──────────────────────────────────────
  const history = () => ({
    a: H('Drink water', { order: 1, completedDates: [day(0), day(1), day(2)], completedTimestamps: { [day(0)]: Date.now() - 5000 } }),
    b: H('Read', { order: 2, category: 'reading', completedDates: [day(1)] }),
    c: H('Brand new', { order: 3, createdAt: new Date().toISOString() }),
    w: H('Weekly review', { order: 4, frequency: 'weekly', completedDates: [day(1)] }),
  });

  scenario('views: past days can be looked at, one day at a time', async () => {
    await boot({ seed: seed(history()) }); await rows(); await sleep(300);
    check('today: the title says Today and there is nowhere later to go', (await title()) === 'Today' && await ev(`document.getElementById('day-next').disabled`));
    check('the arrows have names', (await ev(`document.getElementById('day-prev').getAttribute('aria-label') + '|' + document.getElementById('day-next').getAttribute('aria-label')`)) === 'Previous day|Next day');
    await ev(`document.getElementById('day-prev').click()`); await sleep(300);
    const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' }).format(Date.now() - 864e5);
    check('yesterday: the title is the weekday', (await title()) === wd, await title());
    check('it shows what was done that day, and leaves out habits that did not exist yet', (await names()) === 'Drink water*, Read*', await names());
    check('it says the day cannot be changed', /past day/i.test(await ev(`document.getElementById('past-note').textContent`)) && await visible('#past-note'));
    check('weekly and monthly sections step aside', !(await visible('#week-card')));
    check('the boxes cannot be ticked', await ev(`[...document.querySelectorAll('#habits .habit-check')].every(b => b.disabled)`));
    check('there are no row actions, grips or More buttons', (await ev(`document.querySelectorAll('#habits .habit-actions, #habits .row-grip, #habits .row-more').length`)) === 0);
    const before = await ev(`JSON.stringify(__mockDB.habits)`);
    await ev(`document.querySelectorAll('#habits .habit-check').forEach(b => b.click())`); await sleep(500);
    check('clicking changes nothing in the database', (await ev(`JSON.stringify(__mockDB.habits)`)) === before);
    await ev(`document.getElementById('day-prev').click()`); await sleep(300);
    check('two days ago: only what was done then', (await names()) === 'Drink water*, Read', await names());
    await ev(`document.getElementById('day-next').click()`); await sleep(200);
    await ev(`document.getElementById('day-next').click()`); await sleep(300);
    check('stepping forward returns to today, editable again', (await title()) === 'Today' && (await ev(`document.querySelectorAll('#habits .habit-check:disabled').length`)) === 0 && await visible('#week-card'));
    noExceptions();
  });

  scenario('views: Back to today, the keyboard, and the limits of the day browser', async () => {
    await boot({ seed: seed(history()), mobile: false }); await rows(); await sleep(300);
    await ev(`document.getElementById('day-prev').focus()`);
    await key('ArrowLeft'); await key('ArrowLeft');
    check('ArrowLeft steps back a day at a time', (await names()) === 'Drink water*, Read', await names());
    await key('ArrowRight');
    check('ArrowRight steps forward', (await names()) === 'Drink water*, Read*', await names());
    await ev(`document.getElementById('back-to-today').click()`); await sleep(300);
    check('Back to today returns in one tap', (await title()) === 'Today' && !(await visible('#past-note')));
    await ev(`(() => { for (let i = 0; i < 70; i++) document.getElementById('day-prev').click(); })()`); await sleep(400);
    check('it stops at 60 days back', await ev(`document.getElementById('day-prev').disabled`));
    await ev(`document.getElementById('back-to-today').click()`); await sleep(200);
    await ev(`document.querySelector('#week-strip [data-day]').click()`); await sleep(300);
    check('tapping a day in the week strip opens that day', (await title()) !== 'Today' && await visible('#past-note'));
    await ev(`document.getElementById('logout-btn').click()`); await sleep(800);
    check('signing out resets the view', await ev(`!document.getElementById('past-note') || document.getElementById('past-note').classList.contains('hidden')`));
    noExceptions();
  });

  scenario('views: the day browser fits a phone and keeps the list on the first screen', async () => {
    for (const [w, h] of [[375, 667], [320, 568]]) {
      await boot({ seed: seed(history()) }); await size(w, h); await ev(`scrollTo(0, 0)`); await rows(); await sleep(300);
      check(`${w}px: first habit within 320px`, (await ev(`Math.round(document.querySelector('#habits .habit-item').getBoundingClientRect().top)`)) <= 320, await ev(`Math.round(document.querySelector('#habits .habit-item').getBoundingClientRect().top)`));
      check(`${w}px: no horizontal scroll`, await ev(`document.documentElement.scrollWidth <= innerWidth`));
      check(`${w}px: the arrows are 44px targets`, (await ev(`Math.min(...['day-prev', 'day-next'].flatMap(id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.width, r.height]; }))`)) >= 44);
    }
    noExceptions();
  });

  // ── 18: filter chips and search ──────────────────────────
  const many = n => Object.fromEntries(Array.from({ length: n }, (_, i) => {
    const cats = ['health', 'reading', 'fitness'];
    const names = ['Drink water', 'Read a chapter', 'Morning run', 'Vitamins', 'Read the news', 'Stretch', 'Café walk', 'Sleep by eleven', 'Push-ups', 'Journal', 'Floss'];
    return ['h' + i, H(names[i % names.length], { order: i + 1, category: cats[i % 3] })];
  }).concat([['wk', H('Weekly review', { order: 99, frequency: 'weekly', category: 'reading' })]]));
  const shown = () => ev(`[...document.querySelectorAll('#habits .habit-item')].map(r => r.querySelector('.habit-name').textContent.trim()).join('|')`);
  const type = text => ev(`(() => { const i = document.getElementById('habit-search'); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);

  scenario('views: a long list can be searched and filtered by category', async () => {
    await boot({ seed: seed(many(7)) }); await rows(); await sleep(300);      // 7 daily + 1 weekly = 8 habits
    check('eight habits or fewer: no filter bar', !(await visible('#home-filter')));
    await boot({ seed: seed(many(9)) }); await rows(); await sleep(300);
    check('more than eight: the filter bar appears', await visible('#home-filter'));
    check('the search field has a name', (await ev(`document.getElementById('habit-search').getAttribute('aria-label')`)) === 'Search habits');
    check('there is a chip for each category in use, plus All', (await ev(`[...document.querySelectorAll('#home-filter .chip')].map(c => c.textContent.trim()).join('|')`)) === 'All|Health|Fitness|Reading', await ev(`[...document.querySelectorAll('#home-filter .chip')].map(c => c.textContent.trim()).join('|')`));
    await type('read'); await sleep(250);
    check('typing filters the list', (await shown()) === 'Read a chapter|Read the news', await shown());
    check('it filters the weekly section too, hiding it when nothing there matches', !(await visible('#week-card')));
    await type('weekly'); await sleep(250);
    check('and shows it when something does', (await ev(`document.querySelectorAll('#habits-week .habit-item').length`)) === 1 && (await shown()) === '' && !(await visible('#no-match')));
    await type('cafe'); await sleep(250);
    check('search ignores accents and case', (await shown()) === 'Café walk', await shown());
    await type('zzz'); await sleep(250);
    check('nothing found: it says so and offers to clear', (await shown()) === '' && await visible('#no-match') && /no habits match/i.test(await ev(`document.getElementById('no-match').textContent`)));
    await ev(`document.querySelector('#no-match button').click()`); await sleep(250);
    check('Clear brings everything back', (await ev(`document.querySelectorAll('#habits .habit-item').length`)) === 9 && (await ev(`document.getElementById('habit-search').value`)) === '');
    await ev(`[...document.querySelectorAll('#home-filter .chip')].find(c => c.textContent.trim() === 'Fitness').click()`); await sleep(250);
    check('a chip filters by category and shows as pressed', (await shown()) === 'Morning run|Stretch|Push-ups' && (await ev(`[...document.querySelectorAll('#home-filter .chip')].find(c => c.textContent.trim() === 'Fitness').getAttribute('aria-pressed')`)) === 'true', await shown());
    check('the ring still counts every habit, not just the ones shown', /of 10/.test(await ev(`document.getElementById('summary-toggle').textContent`)));
    await ev(`[...document.querySelectorAll('#home-filter .chip')].find(c => c.textContent.trim() === 'All').click()`); await sleep(250);
    check('All clears the category', (await ev(`document.querySelectorAll('#habits .habit-item').length`)) === 9);
    noExceptions();
  });

  scenario('views: the filter bar keeps the list on the first screen and resets on sign-out', async () => {
    for (const [w, h] of [[375, 667], [320, 568]]) {
      await boot({ seed: seed(many(9)) }); await size(w, h); await ev(`scrollTo(0, 0)`); await rows(); await sleep(300);
      check(`${w}px: the bar is 44px tall or less`, (await ev(`document.getElementById('home-filter').getBoundingClientRect().height`)) <= 45, await ev(`document.getElementById('home-filter').getBoundingClientRect().height`));
      check(`${w}px: first habit within 320px`, (await ev(`Math.round(document.querySelector('#habits .habit-item').getBoundingClientRect().top)`)) <= 320, await ev(`Math.round(document.querySelector('#habits .habit-item').getBoundingClientRect().top)`));
      check(`${w}px: no horizontal scroll`, await ev(`document.documentElement.scrollWidth <= innerWidth`));
    }
    await type('read'); await sleep(200);
    await ev(`document.getElementById('day-prev').click()`); await sleep(250);
    check('the bar steps aside while looking at a past day', !(await visible('#home-filter')));
    await ev(`document.getElementById('back-to-today').click()`); await sleep(250);
    await ev(`document.getElementById('logout-btn').click()`); await sleep(800);
    check('signing out clears the search', (await ev(`document.getElementById('habit-search').value`)) === '');
    noExceptions();
  });

  // ── 20: focus view ───────────────────────────────────────
  const five = () => ({
    a: H('Drink water', { order: 1, completedDates: [day(0), day(1)], completedTimestamps: { [day(0)]: Date.now() - 5000 } }),
    b: H('Read 10 pages', { order: 2, category: 'reading', completedDates: [day(1), day(2)] }),
    c: H('Workout', { order: 3, category: 'fitness' }),
    d: H('Meditate', { order: 4, category: 'relaxation' }),
    w: H('Weekly review', { order: 5, frequency: 'weekly' }),
  });
  const focusName = () => ev(`document.getElementById('focus-name').textContent.trim()`);
  const focusOpen = () => visible('#focus-view');
  const doneToday = id => ev(`(__mockDB.habits[${JSON.stringify(id)}].completedDates || []).includes(${JSON.stringify(day(0))})`);

  scenario('views: focus view walks through the open habits one at a time', async () => {
    await boot({ seed: seed(five()) }); await rows(); await sleep(300);
    check('a Focus button is offered when two or more daily habits are open', await visible('#focus-open'));
    await ev(`(() => { const b = document.getElementById('focus-open'); b.focus(); b.click(); })()`); await sleep(450);
    check('it opens on the first open habit, in list order', (await focusOpen()) && (await focusName()) === 'Read 10 pages', await focusName());
    check('it says where you are', (await ev(`document.getElementById('focus-progress').textContent.trim()`)) === '1 of 3');
    check('it shows the habit\'s streak', /2/.test(await ev(`document.getElementById('focus-streak').textContent`)));
    check('Done has the focus, so Enter completes', await ev(`document.activeElement.id === 'focus-done'`));
    await ev(`document.getElementById('focus-done').click()`); await sleep(700);
    check('Done completes the habit', await doneToday('b'));
    check('and moves to the next one', (await focusName()) === 'Workout' && (await ev(`document.getElementById('focus-progress').textContent.trim()`)) === '2 of 3', await focusName());
    await ev(`document.getElementById('focus-skip').click()`); await sleep(300);
    check('Skip moves on without completing', !(await doneToday('c')) && (await focusName()) === 'Meditate');
    await ev(`document.getElementById('focus-view').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(300);
    check('after the last one it says so', /everything for today/i.test(await ev(`document.getElementById('focus-view').innerText`)) && !(await visible('#focus-skip')));
    await ev(`document.getElementById('focus-done').click()`); await sleep(400);
    check('Finish closes it', !(await focusOpen()));
    check('focus returns to the Focus button', await ev(`document.activeElement.id === 'focus-open'`));
    check('weekly habits are not part of the walk-through', !(await ev(`(__mockDB.habits.w.completedDates || []).length`)));
    noExceptions();
  });

  scenario('views: focus view can start a timer, exit at any time, and fits a small phone', async () => {
    await boot({ seed: seed(five()) }); await size(320, 568); await rows(); await sleep(300);
    await ev(`document.getElementById('focus-open').click()`); await sleep(450);
    check('no horizontal or vertical scroll at 320x568', await ev(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('#focus-view .dialog').scrollHeight <= innerHeight`));
    check('a tap outside does not close it', await ev(`(() => { const m = document.getElementById('focus-view'); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !m.classList.contains('hidden'); })()`));
    await ev(`document.getElementById('focus-timer').click()`); await sleep(400);
    check('Start timer opens the focus timer for this habit, on top', (await visible('#timer-modal')) && (await ev(`document.getElementById('timer-habit-name').textContent`)) === 'Read 10 pages');
    await ev(`document.getElementById('timer-close').click()`); await sleep(300);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await sleep(350);
    check('Escape exits', !(await focusOpen()));
    check('nothing was completed by opening and leaving', !(await doneToday('b')));
    await boot({ seed: seed({ a: H('Only one') }) }); await rows(); await sleep(300);
    check('with one open habit there is no Focus button', !(await visible('#focus-open')));
    noExceptions();
  });
};
