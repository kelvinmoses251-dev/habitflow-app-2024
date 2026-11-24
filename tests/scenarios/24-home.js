// Home (roadmap batch 2): today's list first, faster completion, a list that organises itself.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}, profile = { xp: 300 }) => signedIn({ ...extra, mock_fb_db: { habits, users: { 'u-test': profile } } });
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
};
