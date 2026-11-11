// Guided tour: a spotlight that points at the REAL interface and says what each part is for.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, user, signedIn, noExceptions } = c;
  const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

  // A brand-new account: no "seen the tour" flag.
  const fresh = (extra = {}) => ({ mock_fb_user: user(), habitly_returning: '1', ...extra });
  const habit = (name, order = 1) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: [], createdAt: new Date(Date.now() - 600000).toISOString(), order });
  const withHabits = (extra = {}) => ({ ...fresh(extra), mock_fb_db: { habits: { h1: habit('Run 5k', 1), h2: habit('Read', 2) } } });
  const coach = () => visible('#coach');
  const step = () => text('#coach-step');
  const title = () => text('#coach-title');
  const next = async () => { await ev(`document.getElementById('coach-next').click()`); await sleep(700); };

  // Which element each step must spotlight (mobile uses the bottom nav, desktop the top nav).
  const targets = mobile => ({
    'Your progress at a glance': ['.summary'],
    'Add a habit': ['#new-habit-toggle'],
    'Complete habits here': ['#habits .habit-item'],
    'Start with a ready-made set': ['#starter-packs'],
    'Stats': [mobile ? '.bottomnav [data-page="stats"]' : '.topnav-links [data-page="stats"]'],
    'Profile and settings': [mobile ? '.bottomnav [data-page="profile"]' : '.topnav-links [data-page="profile"]'],
  });

  // Geometry of the spotlight, the card and the intended target, in CSS pixels.
  const geometry = sel => ev(`(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const spot = document.querySelector('.coach-spot'), card = document.querySelector('.coach-card');
    const target = ${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'null'};
    return { vw: innerWidth, vh: innerHeight, spot: r(spot), card: r(card), target: target ? r(target) : null, arrow: getComputedStyle(document.querySelector('.coach-arrow')).display !== 'none' };
  })()`);

  async function walk(label, mobile) {
    const map = targets(mobile);
    let guard = 0;
    while (guard++ < 10) {
      const t = await title();
      const sels = map[t];
      const g = await geometry(sels ? sels[0] : null);
      check(`${label}: card "${t}" stays inside the screen`, g.card.l >= 0 && g.card.r <= g.vw + 0.5 && g.card.t >= 0 && g.card.b <= g.vh + 0.5,
        JSON.stringify({ l: g.card.l, r: g.card.r, t: g.card.t, b: g.card.b, vw: g.vw, vh: g.vh }));
      if (sels) {
        const pad = /^(Stats|Profile and settings)$/.test(t) ? 2 : 8, tol = 4;      // nav items get a tight cut-out
        check(`${label}: "${t}" spotlights its real target`, g.target && Math.abs(g.spot.l - (g.target.l - pad)) < tol && Math.abs(g.spot.t - (g.target.t - pad)) < tol
          && Math.abs(g.spot.w - (g.target.w + pad * 2)) < tol && Math.abs(g.spot.h - (g.target.h + pad * 2)) < tol, JSON.stringify({ spot: g.spot, target: g.target }));
        check(`${label}: "${t}" card does not cover its target`, !(g.card.t < g.target.b && g.card.b > g.target.t && g.card.l < g.target.r && g.card.r > g.target.l) || !g.arrow, '');
      }
      const body = (await title()) + ' ' + (await text('#coach-text'));
      if (EMOJI.test(body)) check(`${label}: no emoji`, false, body);
      if (/^Get started$/.test(await text('#coach-next'))) return true;
      await next();
    }
    return false;
  }

  scenario('tour: starts for a new account, explains the welcome, and counts the steps', async () => {
    await boot({ seed: withHabits() });
    check('tour opens by itself', await waitFor(`!!document.getElementById('coach')`, 8000));
    check('is an accessible modal dialog', (await ev(`(() => { const d = document.getElementById('coach'); return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && !!d.getAttribute('aria-labelledby'); })()`)) === true);
    check('first stop is the welcome', (await title()) === 'Welcome to Habitly');
    check('shows 1 of 7', (await step()) === '1 of 7', await step());
    check('Back is hidden on the first stop', (await ev(`document.getElementById('coach-back').hidden`)) === true);
    check('primary action is clear', (await text('#coach-next')) === 'Show me around');
    check('a welcome has no spotlight cut-out', (await ev(`document.querySelector('.coach-spot').classList.contains('is-empty')`)) === true);
    check('the page behind cannot be clicked', (await ev(`(() => { const e = document.elementFromPoint(innerWidth / 2, 120); return !!e.closest('#coach'); })()`)) === true);
    noExceptions();
  });

  scenario('tour (mobile): every stop highlights the real element, in view, with a readable card', async () => {
    await boot({ seed: withHabits() });
    await waitFor(`!!document.getElementById('coach')`, 8000); await sleep(600);
    check('walked to the last stop', await walk('mobile', true));
    check('last stop reads "Get started"', (await text('#coach-next')) === 'Get started');
  });

  scenario('tour (desktop): points at the top navigation instead of the bottom bar', async () => {
    await boot({ seed: withHabits(), mobile: false });
    await waitFor(`!!document.getElementById('coach')`, 8000); await sleep(600);
    check('walked to the last stop', await walk('desktop', false));
  });

  scenario('tour: Back and Next, progress segments, and keyboard (arrows, Tab, Escape)', async () => {
    await boot({ seed: withHabits() });
    await waitFor(`!!document.getElementById('coach')`, 8000); await sleep(500);
    await next();
    check('second stop', (await step()) === '2 of 7', await step());
    check('progress shows 2 filled segments', (await ev(`document.querySelectorAll('.coach-progress span.on').length`)) === 2);
    await ev(`document.getElementById('coach-back').click()`); await sleep(300);
    check('Back returns to the welcome', (await title()) === 'Welcome to Habitly');
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(300);
    check('ArrowRight advances', (await step()) === '2 of 7');
    // Tab never leaves the card
    for (let i = 0; i < 6; i++) await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))`);
    check('focus stays inside the tour', (await ev(`!!document.activeElement.closest('#coach')`)) === true);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300);
    check('Escape closes it', !(await ev(`!!document.getElementById('coach')`)));
    check('and remembers it was seen', (await ev(`localStorage.getItem('habitly_seen_u-test')`)) === '1');
  });

  scenario('tour: Skip closes it for good and it does not return on the next visit', async () => {
    await boot({ seed: withHabits() });
    await waitFor(`!!document.getElementById('coach')`, 8000);
    await ev(`document.getElementById('coach-skip').click()`); await sleep(300);
    check('closed', !(await ev(`!!document.getElementById('coach')`)));
    check('page scrolling restored', (await ev(`document.documentElement.style.overflow`)) !== 'hidden');
    await boot({ seed: { ...withHabits(), 'habitly_seen_u-test': '1' } });
    await sleep(1200);
    check('not shown again for a returning user', !(await ev(`!!document.getElementById('coach')`)));
  });

  scenario('tour: adapts to an empty account (points at the starter sets, not a missing habit row)', async () => {
    await boot({ seed: fresh() });
    await waitFor(`!!document.getElementById('coach')`, 8000); await sleep(400);
    check('7 stops', (await step()) === '1 of 7');
    for (let i = 0; i < 3; i++) await next();
    check('the list stop talks about ready-made sets', (await title()) === 'Start with a ready-made set', await title());
    const g = await geometry('#starter-packs');
    check('and spotlights the starter sets', g.target && Math.abs(g.spot.l - (g.target.l - 8)) < 4 && Math.abs(g.spot.t - (g.target.t - 8)) < 4, JSON.stringify(g));
  });

  scenario('tour: finishing on an empty account opens the New habit form ready to type', async () => {
    await boot({ seed: fresh() });
    await waitFor(`!!document.getElementById('coach')`, 8000); await sleep(400);
    let n = 0;
    while (n++ < 10 && (await text('#coach-next')) !== 'Get started') await next();
    await ev(`document.getElementById('coach-next').click()`); await sleep(500);
    check('tour closed', !(await ev(`!!document.getElementById('coach')`)));
    check('New habit form is open', (await ev(`document.getElementById('habit-form').hidden`)) === false);
    check('the name field has focus', (await ev(`document.activeElement.id`)) === 'habit-input');
    check('completion remembered', (await ev(`localStorage.getItem('habitly_seen_u-test')`)) === '1');
  });

  scenario('tour: can be replayed from the help button and from Profile', async () => {
    await boot({ seed: { ...withHabits(), 'habitly_seen_u-test': '1' } });
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 2`);
    check('help button is in the header with a name', (await ev(`document.getElementById('help-btn').getAttribute('aria-label')`)) === 'Take the guided tour');
    await ev(`document.getElementById('help-btn').click()`); await sleep(500);
    check('help button starts the tour', await coach());
    await ev(`document.getElementById('coach-skip').click()`); await sleep(300);

    await ev(`location.hash = '#profile'`); await sleep(400);
    await ev(`document.getElementById('open-tutorial-btn').click()`); await sleep(900);
    check('Profile entry starts it', await coach());
    check('and brings you back to Home so it can point at things', (await ev(`location.hash`)) === '#home');
  });

  scenario('tour: a new account that played the landing demo still gets oriented in the real app', async () => {
    await boot();
    await ev(`document.querySelectorAll('.demo-habit')[0].click()`); await sleep(250);
    await ev(`document.getElementById('login-btn').click()`);
    check('the tour starts after sign-up', await waitFor(`!!document.getElementById('coach')`, 10000));
    check('demo habits were still carried over', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`, 8000));
  });
};
