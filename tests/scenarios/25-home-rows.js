// Home rows (roadmap batch 2): seven-day dots, drag to reorder, swipe.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#habits .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const dots = id => ev(`[...document.querySelectorAll('.habit-item[data-id="${id}"] .dots i')].map(i => i.classList.contains('on') ? 'X' : i.classList.contains('na') ? '-' : 'o').join('')`);

  // ── 19: seven-day dots ───────────────────────────────────
  scenario('rows: each daily habit shows its last seven days', async () => {
    await boot({ seed: seed({
      a: H('Drink water', { order: 1, completedDates: [day(0), day(1), day(3), day(6), day(9)], completedTimestamps: { [day(0)]: Date.now() - 5000 } }),
      b: H('New habit', { order: 2, createdAt: new Date(Date.now() - 2 * 864e5).toISOString(), completedDates: [day(1)] }),
      w: H('Weekly review', { order: 3, frequency: 'weekly', completedDates: [day(0)] }),
      long: H('A very long habit name that goes on and on to sixty chars!!', { order: 4 }),
    }) });
    await rows(); await sleep(300);
    check('seven dots, oldest first, with the right days filled', (await dots('a')) === 'XooXoXX', await dots('a'));
    check('today is marked', await ev(`document.querySelector('.habit-item[data-id="a"] .dots i:last-child').classList.contains('today')`));
    check('it has a label for screen readers', (await ev(`document.querySelector('.habit-item[data-id="a"] .dots').getAttribute('aria-label')`)) === 'Last 7 days: 4 of 7 done');
    check('days before a habit existed are blank, not misses', (await dots('b')) === '----oXo', await dots('b'));
    check('and its label counts only the days it existed', (await ev(`document.querySelector('.habit-item[data-id="b"] .dots').getAttribute('aria-label')`)) === 'Last 7 days: 1 of 3 done');
    check('weekly habits have no day dots', (await ev(`document.querySelectorAll('.habit-item[data-id="w"] .dots').length`)) === 0);
    check('dots are small (7px or less) and do not make the row taller', await ev(`(() => { const d = document.querySelector('.habit-item[data-id="a"] .dots i').getBoundingClientRect(); const withDots = document.querySelector('.habit-item[data-id="a"]').getBoundingClientRect().height, without = document.querySelector('.habit-item[data-id="w"]').getBoundingClientRect().height; return d.width <= 7 && Math.abs(withDots - without) < 2; })()`));
    for (const w of [320, 390]) {
      await size(w, 700); await sleep(200);
      check(`${w}px: no horizontal scroll, even with a 60-character name`, await ev(`document.documentElement.scrollWidth <= innerWidth`));
    }
    await ev(`document.querySelector('.habit-item[data-id="long"] .habit-check').click()`);
    check('completing a habit fills today\'s dot', await waitFor(`document.querySelector('.habit-item[data-id="long"] .dots i:last-child').classList.contains('on')`, 3000));
    noExceptions();
  });

  // ── 14: swipe a row, and a More button that does the same without a gesture ─
  const fresh = () => new Date().toISOString();                 // created now, so Edit is allowed
  const three = () => ({
    a: H('Drink water', { order: 1, createdAt: fresh(), completedDates: [day(1), day(2)] }),
    b: H('Read', { order: 2, createdAt: fresh(), category: 'reading' }),
    c: H('Old and done', { order: 3, completedDates: [day(0)], completedTimestamps: { [day(0)]: Date.now() - 2 * 3600000 } }),   // done two hours ago: locked
  });
  const swipe = (id, dx, dy = 0) => ev(`(async () => { const el = document.querySelector('.habit-item[data-id="${id}"] .habit-name'), r = el.getBoundingClientRect(), x = r.left + 20, y = r.top + r.height / 2;
    const fire = (t, px, py) => (t === 'pointerdown' ? el : window).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, button: 0, clientX: px, clientY: py }));
    fire('pointerdown', x, y);
    for (let i = 1; i <= 5; i++) { fire('pointermove', x + ${dx} * i / 5, y + ${dy} * i / 5); await new Promise(r => setTimeout(r, 12)); }
    fire('pointerup', x + ${dx}, y + ${dy}); el.click(); return 1; })()`);     // el.click(): a real finger lift also clicks
  const done = id => ev(`(__mockDB.habits[${JSON.stringify(id)}].completedDates || []).includes(${JSON.stringify(day(0))})`);
  const revealed = id => ev(`(() => { const r = document.querySelector('.habit-item[data-id="${id}"]'), a = r.querySelector('.habit-actions'); return r.classList.contains('is-revealed') && getComputedStyle(a).visibility === 'visible'; })()`);

  scenario('rows: on a phone, a More button reveals the row actions and rows stay one line', async () => {
    await boot({ seed: seed(three()) }); await rows(); await sleep(300);
    check('each row has a More button with a name', (await ev(`document.querySelector('.habit-item[data-id="a"] .row-more').getAttribute('aria-label')`)) === 'More actions for Drink water');
    check('it is a 44px target', (await ev(`(() => { const r = document.querySelector('.row-more').getBoundingClientRect(); return Math.min(r.width, r.height); })()`)) >= 44);
    check('the actions are tucked away until asked for', !(await revealed('a')) && (await ev(`getComputedStyle(document.querySelector('.habit-item[data-id="a"] .habit-actions')).visibility`)) === 'hidden');
    check('a row with a streak and dots is still one line of badges', await ev(`(() => { const r = document.querySelector('.habit-item[data-id="a"]'); return Math.abs(r.querySelector('.dots').getBoundingClientRect().top - r.querySelector('.cat-badge').getBoundingClientRect().top) < 12; })()`));
    await ev(`document.querySelector('.habit-item[data-id="a"] .row-more').click()`); await sleep(300);
    check('tapping More reveals timer, edit and remove', (await revealed('a')) && (await ev(`[...document.querySelectorAll('.habit-item[data-id="a"] .habit-actions [data-action]')].map(b => b.dataset.action).join()`)) === 'timer,edit,delete');
    check('More says it is expanded', (await ev(`document.querySelector('.habit-item[data-id="a"] .row-more').getAttribute('aria-expanded')`)) === 'true');
    await ev(`document.querySelector('.habit-item[data-id="b"] .row-more').click()`); await sleep(300);
    check('only one row is open at a time', (await revealed('b')) && !(await revealed('a')));
    await ev(`document.querySelector('.section-title').click()`); await sleep(300);
    check('tapping elsewhere closes it', !(await revealed('b')));
    await ev(`document.querySelector('.habit-item[data-id="b"] .row-more').click()`); await sleep(250);
    await ev(`document.querySelector('.habit-item[data-id="b"] [data-action="timer"]').click()`); await sleep(350);
    check('a revealed action works', await visible('#timer-modal'));
    await size(320, 640); await sleep(200);
    check('no horizontal scroll at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    await boot({ seed: seed(three()), mobile: false }); await rows(); await sleep(300);
    check('desktop: no More button, the hover actions are unchanged', !(await visible('.row-more')) && (await ev(`document.querySelectorAll('.habit-item[data-id="a"] .habit-actions [data-action]').length`)) === 3);
    noExceptions();
  });

  scenario('rows: swipe right completes, swipe left reveals, and scrolling never does either', async () => {
    await boot({ seed: seed(three()) }); await rows(); await sleep(300);
    await swipe('a', 30); await sleep(500);
    check('a short swipe does nothing', !(await done('a')));
    await swipe('a', 10, 120); await sleep(500);
    check('a scroll down does nothing', !(await done('a')) && !(await revealed('a')));
    await swipe('a', 60, 55); await sleep(500);
    check('a diagonal drag is treated as a scroll', !(await done('a')));
    await swipe('a', 110); await sleep(900);
    check('a swipe right completes the habit', await done('a'));
    check('with the same Undo toast as a tap', await ev(`!!document.querySelector('#toast-container .toast-action')`));
    check('a swipe does not open the details dialog', !(await visible('#details-modal')));
    await swipe('b', -110); await sleep(400);
    check('a swipe left reveals the actions', await revealed('b'));
    await swipe('c', 110); await sleep(600);
    check('a locked completion cannot be swiped away', await done('c'));
    await boot({ seed: seed(three()), mobile: false }); await rows(); await sleep(300);
    await swipe('b', 110); await sleep(600);
    check('desktop: dragging a row with the mouse does not complete it', !(await done('b')));
    noExceptions();
  });
};
