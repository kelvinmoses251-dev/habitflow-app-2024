// Visual review gallery (not a test). Run:  GALLERY=1 node tests/smoke.js --only gallery --shots <dir>
// Captures every major screen in light + dark and on mobile + desktop so design changes can be reviewed by eye.
module.exports = (scenario, c) => {
  if (!process.env.GALLERY) return;
  const { ev, send, waitFor, boot, sleep, signedIn } = c;
  const today = new Date().toLocaleDateString('en-CA');
  const key = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const mk = (name, category, order, dates, extra = {}) => ({ userId: 'u-test', name, category, frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), order, ...extra });
  const streak = n => Array.from({ length: n }, (_, i) => key(-i - 1));
  const db = {
    users: { 'u-test': { xp: 380, streakShields: 1, frozenDates: [] } },
    habits: {
      a: mk('Drink 2 litres of water', 'health', 1, [today, ...streak(11)], { completedTimestamps: { [today]: Date.now() - 4000000 } }),
      b: mk('Read 10 pages', 'reading', 2, [today, ...streak(6)], { completedTimestamps: { [today]: Date.now() - 4000000 } }),
      c: mk('Workout for 30 minutes', 'fitness', 3, streak(14)),
      d: mk('Meditate for 10 minutes', 'relaxation', 4, streak(3)),
      e: mk('Write in journal', 'mind', 5, [key(-2), key(-4)]),
      f: mk('Review weekly budget', 'saving', 6, [], { frequency: 'weekly' }),
    },
  };
  const ready = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`);
  const settle = ms => sleep(ms || 700);

  const run = (name, opts, steps) => scenario('gallery: ' + name, async () => {
    await boot(opts);
    await steps();
  });

  for (const scheme of ['light', 'dark']) {
    const seed = { ...signedIn(), mock_fb_db: db, ...(scheme === 'dark' ? { theme: 'dark' } : {}) };
    run(`landing-${scheme}`, { colorScheme: scheme, seed: scheme === 'dark' ? { theme: 'dark' } : {} }, async () => { await settle(); });
    run(`landing-ticked-${scheme}`, { colorScheme: scheme, seed: scheme === 'dark' ? { theme: 'dark' } : {} }, async () => {
      await ev(`document.querySelectorAll('.demo-habit').forEach(b => b.click())`); await settle(1500);
    });
    run(`home-${scheme}`, { seed }, async () => { await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`); await settle(); });
    run(`home-list-${scheme}`, { seed }, async () => {
      await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`);
      await ev(`document.getElementById('habits').scrollIntoView({block:'start'})`); await settle();
    });
    run(`stats-${scheme}`, { seed }, async () => {
      await ready(); await ev(`location.hash='#stats'`); await settle(1800);
    });
    run(`stats-lower-${scheme}`, { seed }, async () => {
      await ready(); await ev(`location.hash='#stats'`); await settle(1800);
      await ev(`document.getElementById('insights-card').scrollIntoView({block:'start'})`); await settle();
    });
    run(`profile-${scheme}`, { seed }, async () => { await ready(); await ev(`location.hash='#profile'`); await settle(); });
  }

  const seed = { ...signedIn(), mock_fb_db: db };
  run('desktop-landing', { mobile: false }, async () => { await settle(); });
  run('desktop-home', { mobile: false, seed }, async () => { await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`); await settle(); });
  run('desktop-stats', { mobile: false, seed }, async () => { await ready(); await ev(`location.hash='#stats'`); await settle(1800); });
  const darkSeed = { ...seed, theme: 'dark' };
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  run('desktop-home-dark', { mobile: false, seed: darkSeed }, async () => { await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`); await settle(); });
  run('desktop-landing-dark', { mobile: false, colorScheme: 'dark', seed: { theme: 'dark' } }, async () => { await settle(); });
  run('desktop-profile', { mobile: false, seed }, async () => { await ready(); await ev(`location.hash='#profile'`); await settle(); });
  run('desktop-stats-lower', { mobile: false, seed }, async () => {
    await ready(); await ev(`location.hash='#stats'`); await settle(1800);
    await ev(`document.querySelector('.card-wide:nth-of-type(2)') && window.scrollTo(0, 900)`); await settle();
  });
  run('tablet-home', { mobile: false, seed }, async () => { await ready(); await size(820, 1100); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`); await settle(); });
  run('tablet-landing', { mobile: false }, async () => { await size(820, 1100); await settle(); });
  run('wide-landing', { mobile: false }, async () => { await size(1440, 900); await settle(); });
  run('wide-home', { mobile: false, seed }, async () => { await ready(); await size(1600, 900); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`); await settle(); });
  run('desktop-row-hover', { mobile: false, seed }, async () => {
    await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`); await settle();
    const p = await ev(`(() => { const b = document.querySelectorAll('#habits .habit-item')[2].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await settle(400);
  });

  run('modal-all-done', { seed }, async () => { await ready(); await ev(`document.getElementById('all-done-overlay').classList.remove('hidden')`); await settle(); });
  run('modal-level-up', { seed }, async () => {
    await ready();
    await ev(`document.getElementById('level-up-new-level').textContent='Level 3';document.getElementById('level-up-new-title').textContent='Disciplined';document.getElementById('level-up-modal').classList.remove('hidden')`); await settle();
  });
  run('modal-confirm', { seed }, async () => {
    await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`);
    await ev(`document.querySelectorAll('#habits .habit-check:not(:checked)')[0].click()`); await settle();
  });
  run('modal-details', { seed }, async () => {
    await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`);
    await ev(`document.querySelector('#habits .habit-meta').click()`); await settle();
  });
  run('modal-timer', { seed }, async () => {
    await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`);
    await ev(`document.querySelector('#habits [data-action="timer"]').click()`); await settle();
  });
  const tourAt = (name, n, opts = {}) => run(name, { seed: { ...signedIn(), mock_fb_db: db }, ...opts }, async () => {
    await ready(); await waitFor(`document.querySelectorAll('#habits .habit-item').length === 6`);
    await ev(`document.getElementById('help-btn').click()`); await settle(500);
    for (let i = 0; i < n; i++) { await ev(`document.getElementById('coach-next').click()`); await settle(600); }
    await settle(500);
  });
  tourAt('tour-1-welcome', 0);
  tourAt('tour-2-progress', 1);
  tourAt('tour-3-add', 2);
  tourAt('tour-4-list', 3);
  tourAt('tour-5-stats', 4);
  tourAt('tour-6-profile', 5);
  tourAt('tour-7-ready', 6);
  tourAt('tour-desktop-progress', 1, { mobile: false });
  tourAt('tour-desktop-stats', 4, { mobile: false });
  run('share-card', { seed }, async () => {
    await ready(); await ev(`document.getElementById('open-share-trigger').click()`); await settle(1800);
  });
  run('empty-home', { seed: signedIn() }, async () => { await ready(); await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`); await settle(); });
  run('toast', { seed }, async () => {
    await ready(); await ev(`document.querySelector('#habits [data-action="delete"]').click()`); await settle(500);
  });

  // ── Batch 3: creating and editing habits ──
  const wdToday = new Date().getDay();
  const b3db = {
    users: { 'u-test': { xp: 380, streakShields: 1, frozenDates: [], fcmToken: 'tok' } },
    habits: {
      a: mk('Drink water', 'health', 1, streak(11), { icon: 'drop', color: 'blue', target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [today]: 5 } }),
      b: mk('Stretch', 'fitness', 2, streak(6), { cue: 'After I pour my coffee', timeOfDay: 'morning', reminderHour: 7 }),
      c: mk('Cold showers', 'health', 3, streak(4), { startDate: key(-11), endDate: key(18) }),
      d: mk('Read', 'reading', 4, [today, ...streak(3)], { target: { amount: 20, unit: 'pages', step: 5 }, progress: { [today]: 20 }, completedTimestamps: { [today]: Date.now() - 4000000 }, timeOfDay: 'evening' }),
      e: mk('Strength training', 'fitness', 5, [key(-2)], { schedule: { type: 'days', days: [(wdToday + 1) % 7, (wdToday + 3) % 7, (wdToday + 5) % 7] } }),
      f: mk('Run', 'fitness', 6, [key(-1)], { frequency: 'weekly', schedule: { type: 'times', times: 3 } }),
      g: mk('Practise guitar', 'growth', 7, streak(9), { icon: 'music', pauses: [{ from: key(-3) }] }),
      h: mk('Language course', 'growth', 8, [], { startDate: key(4) }),
      i: mk('30-day plank challenge', 'fitness', 9, streak(30).slice(2), { startDate: key(-32), endDate: key(-2) }),
      j: mk('Old side project', 'project', 10, streak(12), { archivedAt: Date.now() - 6 * 864e5 }),
    },
  };
  const b3seed = { ...signedIn(), habitly_confirm: null, mock_fb_db: b3db };
  const b3rows = () => waitFor(`document.querySelectorAll('#habits .habit-item').length >= 4`);
  const fill = (id, v) => ev(`(() => { const e = document.getElementById('${id}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const openAsides = () => ev(`document.querySelectorAll('#page-home .rest-note:not(.hidden)').forEach(n => n.click())`);
  for (const [tag, opts] of [['', { seed: b3seed }], ['-dark', { seed: { ...b3seed, theme: 'dark' } }], ['-desktop', { mobile: false, seed: b3seed }]]) {
    run('b3-home' + tag, opts, async () => { await ready(); await b3rows(); await ev(`document.getElementById('habits').scrollIntoView({block:'start'})`); await settle(); });
  }
  run('b3-home-lower', { seed: b3seed }, async () => { await ready(); await b3rows(); await openAsides(); await ev(`document.getElementById('rest-note').scrollIntoView({block:'center'})`); await settle(); });
  const sheetFilled = async () => {
    await ready(); await b3rows(); await ev(`document.getElementById('new-habit-toggle').click()`); await settle(500);
    await fill('habit-input', 'Evening walk'); await fill('habit-category', 'fitness'); await fill('habit-time', 'evening'); await fill('habit-cue', 'After dinner');
    await fill('habit-target-amount', '30'); await fill('habit-target-unit', 'minutes'); await fill('habit-target-step', '10'); await fill('habit-reminder', '19');
  };
  for (const [tag, opts] of [['', { seed: b3seed }], ['-dark', { seed: { ...b3seed, theme: 'dark' } }], ['-desktop', { mobile: false, seed: b3seed }]]) {
    run('b3-sheet' + tag, opts, async () => { await sheetFilled(); await settle(); });
  }
  run('b3-sheet-lower', { seed: b3seed }, async () => {
    await sheetFilled(); await ev(`document.getElementById('habit-dates').open = true; document.querySelector('#habit-dates [data-run="30"]').click(); document.getElementById('habit-look').open = true; document.getElementById('habit-dates').scrollIntoView({block:'start'})`); await settle();
  });
  for (const [tag, opts] of [['', { seed: b3seed }], ['-dark', { seed: { ...b3seed, theme: 'dark' } }], ['-desktop', { mobile: false, seed: b3seed }]]) {
    run('b3-library' + tag, opts, async () => { await ready(); await b3rows(); await ev(`document.getElementById('new-habit-toggle').click()`); await settle(400); await ev(`document.getElementById('browse-ideas').click()`); await waitFor(`document.querySelectorAll('#library-list .library-item').length > 0`); await settle(); });
  }
  run('b3-details', { seed: b3seed }, async () => { await ready(); await b3rows(); await ev(`document.querySelector('.habit-item[data-id="b"] [data-action="details"]').click()`); await settle(); });
  run('b3-archive', { seed: b3seed }, async () => { await ready(); await ev(`location.hash='#profile'`); await settle(); await ev(`document.getElementById('open-archive-btn').click()`); await settle(); });
  run('b3-empty', { seed: signedIn() }, async () => { await ready(); await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`); await ev(`document.getElementById('empty-state').scrollIntoView({block:'start'})`); await settle(); });

  // ── Batch 4: the completion moment and motivation ─────────
  const b4seed = { ...signedIn(), habitly_confirm: null, mock_fb_db: db };
  for (const [tag, opts] of [['', { seed: b4seed }], ['-dark', { seed: b4seed, colorScheme: 'dark' }], ['-desktop', { seed: b4seed, mobile: false }]]) {
    run('b4-level' + tag, opts, async () => { await ready(); await settle(); await ev(`document.getElementById('open-level').click()`); await settle(); });
  }

  const b4mile = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: db.users, habits: { a: mk('Read 10 pages', 'reading', 1, streak(29)), b: mk('Workout for 30 minutes', 'fitness', 2, streak(3)) } } };
  for (const [tag, opts] of [['', { seed: b4mile }], ['-dark', { seed: b4mile, colorScheme: 'dark' }], ['-desktop', { seed: b4mile, mobile: false }]]) {
    run('b4-milestone' + tag, opts, async () => { await ready(); await settle(); await ev(`document.querySelector('.habit-item[data-id="a"] .habit-check').click()`); await waitFor(`!document.getElementById('milestone-modal').classList.contains('hidden')`); await settle(1400); });
  }
  for (const [tag, opts] of [['', { seed: b4seed }], ['-dark', { seed: b4seed, colorScheme: 'dark' }], ['-desktop', { seed: b4seed, mobile: false }]]) {
    run('b4-achievements' + tag, opts, async () => { await ready(); await settle(); await ev(`location.hash = '#profile'`); await settle(500); await ev(`document.getElementById('open-achievements').click()`); await settle(); });
  }
  const b4shield = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: db.users, habits: { a: mk('Read 10 pages', 'reading', 1, streak(13).slice(1)), b: mk('Workout for 30 minutes', 'fitness', 2, [key(-3)]), c: mk('Meditate for 10 minutes', 'relaxation', 3, []) } } };
  for (const [tag, opts] of [['', { seed: b4shield }], ['-dark', { seed: b4shield, colorScheme: 'dark' }], ['-desktop', { seed: b4shield, mobile: false }]]) {
    run('b4-shield' + tag, opts, async () => { await ready(); await waitFor(`!document.getElementById('moment').classList.contains('hidden')`); await settle(900); });
  }
  const away = n => Array.from({ length: n }, (_, i) => key(-i - 5));
  const b4back = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: db.users, habits: { a: mk('Read 10 pages', 'reading', 1, away(21)), b: mk('Workout for 30 minutes', 'fitness', 2, away(9)), c: mk('Meditate for 10 minutes', 'relaxation', 3, away(4)), d: mk('Write in journal', 'mind', 4, away(2)) } } };
  for (const [tag, opts] of [['', { seed: b4back }], ['-dark', { seed: b4back, colorScheme: 'dark' }]]) {
    run('b4-comeback-card' + tag, opts, async () => { await ready(); await waitFor(`!document.getElementById('moment').classList.contains('hidden')`); await settle(900); });
    run('b4-comeback-sheet' + tag, opts, async () => { await ready(); await waitFor(`!document.getElementById('moment').classList.contains('hidden')`); await settle(400); await ev(`document.querySelector('#moment-actions button').click()`); await settle(500); await ev(`document.querySelector('#comeback-list .pick-check[data-id="d"]').click()`); await settle(); });
  }
  for (const [tag, opts] of [['', { seed: b4seed }], ['-dark', { seed: b4seed, colorScheme: 'dark' }], ['-desktop', { seed: b4seed, mobile: false }]]) {
    run('b4-mood' + tag, opts, async () => { await ready(); await settle(); await ev(`document.querySelector('.habit-item[data-id="d"] .habit-check').click()`); await waitFor(`!!document.querySelector('.toast .toast-moods')`); await settle(300); await ev(`document.querySelector('.toast .mood-btn[data-mood="4"]').click()`); await settle(400); });
  }
  const b4day = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: db.users, habits: { ...db.habits,
    a: { ...db.habits.a, moods: { [today]: 4 } }, b: { ...db.habits.b, moods: { [today]: 5 } },
    g: mk('Drink water', 'health', 7, streak(2), { target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [today]: 5 } }) } } };
  for (const [tag, opts] of [['', { seed: b4day }], ['-dark', { seed: b4day, colorScheme: 'dark' }], ['-desktop', { seed: b4day, mobile: false }]]) {
    run('b4-recap' + tag, opts, async () => { await ready(); await settle(); await ev(`document.getElementById('today-ring').click()`); await settle(); });
  }
  const full = n => [today, ...streak(n)];
  const b4perfect = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: db.users, habits: {
    a: mk('Drink 2 litres of water', 'health', 1, full(11), { completedTimestamps: { [today]: Date.now() - 4000000 } }),
    b: mk('Read 10 pages', 'reading', 2, full(9), { completedTimestamps: { [today]: Date.now() - 4000000 } }),
    c: mk('Workout for 30 minutes', 'fitness', 3, full(8), { completedTimestamps: { [today]: Date.now() - 4000000 } }) } } };
  for (const [tag, opts] of [['-desktop', { seed: b4perfect, mobile: false }], ['-desktop-dark', { seed: b4perfect, mobile: false, colorScheme: 'dark' }]]) {
    run('b4-perfect-week' + tag, opts, async () => { await ready(); await settle(900); });
  }
  run('b4-perfect-week', { seed: b4perfect }, async () => { await ready(); await settle(); await ev(`document.getElementById('summary-toggle').click()`); await settle(600); });
  const b4sound = { ...b4seed, habitly_sound: 'on', habitly_sound_theme: 'wood' };
  for (const [tag, opts] of [['', { seed: b4sound }], ['-dark', { seed: b4sound, colorScheme: 'dark' }]]) {
    run('b4-settings' + tag, opts, async () => { await ready(); await ev(`location.hash = '#profile'`); await settle(600); await ev(`document.getElementById('sound-theme-row').scrollIntoView({ block: 'center' })`); await settle(400); });
  }
  // ── Batch 5: the habit page ───────────────────────────────
  const b5seed = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: db.users, habits: { ...db.habits,
    c: { ...db.habits.c, cue: 'After work, before dinner', journals: [{ date: new Date(Date.now() - 2 * 864e5).toISOString(), text: 'Legs day. Slow but done.' }, { date: new Date(Date.now() - 9 * 864e5).toISOString(), text: 'New shoes help.' }] } } } };
  const openHabit = async id => { await ready(); await settle(); await ev(`document.querySelector('.habit-item[data-id="${id}"] [data-action="details"]').click()`); await settle(700); };
  for (const [tag, opts] of [['', { seed: b5seed }], ['-dark', { seed: b5seed, colorScheme: 'dark' }], ['-desktop', { seed: b5seed, mobile: false }]]) {
    run('b5-habit-page' + tag, opts, async () => { await openHabit('c'); });
  }
  const b5hist = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: { 'u-test': { xp: 380, streakShields: 0, frozenDates: [key(-9)], shieldUsedAt: Date.now() } }, habits: { ...b5seed.mock_fb_db.habits,
    c: { ...b5seed.mock_fb_db.habits.c, completedDates: [...streak(8), key(-10), key(-11), key(-12), key(-15), key(-16), key(-20), key(-21), key(-22), key(-23), key(-27)] } } } };
  const section = id => ev(`document.getElementById('${id}').scrollIntoView({ block: 'start' }); window.scrollBy(0, -70)`);
  for (const [tag, opts] of [['', { seed: b5hist }], ['-dark', { seed: b5hist, colorScheme: 'dark' }], ['-desktop', { seed: b5hist, mobile: false }]]) {
    run('b5-calendar' + tag, opts, async () => { await openHabit('c'); await section('hp-month'); await settle(400); });
  }
  const b5fill = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: { 'u-test': { xp: 380, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now() } }, habits: { a: mk('Read 10 pages', 'reading', 1, streak(9).slice(1)), b: mk('Workout for 30 minutes', 'fitness', 2, [key(-1), key(-2)]) } } };
  for (const [tag, opts] of [['', { seed: b5fill }], ['-dark', { seed: b5fill, colorScheme: 'dark' }]]) {
    run('b5-fill-in' + tag, opts, async () => { await openHabit('a'); });
    run('b5-fill-in-home' + tag, opts, async () => { await ready(); await settle(); await ev(`document.getElementById('day-prev').click()`); await settle(500); });
  }
  const pattern = Array.from({ length: 330 }, (_, i) => i).filter(i => i % 7 !== 5 && i % 11 !== 3 && !(i > 120 && i < 150)).map(i => key(-i - 1));
  const b5year = { ...signedIn(), habitly_confirm: null, mock_fb_db: { users: { 'u-test': { xp: 2100, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now() } }, habits: { c: mk('Workout for 30 minutes', 'fitness', 1, pattern, { createdAt: new Date(Date.now() - 340 * 864e5).toISOString() }) } } };
  for (const [tag, opts] of [['', { seed: b5year }], ['-dark', { seed: b5year, colorScheme: 'dark' }], ['-desktop', { seed: b5year, mobile: false }]]) {
    run('b5-charts-year' + tag, opts, async () => { await openHabit('c'); await section('hp-charts'); await settle(400); });
  }
};
