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
  run('tour-1', { seed: { ...signedIn(), mock_fb_db: db } }, async () => {
    await ready(); await ev(`document.getElementById('open-tutorial-btn').click()`); await settle();
  });
  run('tour-3', { seed: { ...signedIn(), mock_fb_db: db } }, async () => {
    await ready(); await ev(`document.getElementById('open-tutorial-btn').click()`); await settle(300);
    await ev(`document.getElementById('onboarding-next').click(); document.getElementById('onboarding-next').click()`); await settle();
  });
  run('share-card', { seed }, async () => {
    await ready(); await ev(`document.getElementById('open-share-trigger').click()`); await settle(1800);
  });
  run('empty-home', { seed: signedIn() }, async () => { await ready(); await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`); await settle(); });
  run('toast', { seed }, async () => {
    await ready(); await ev(`document.querySelector('#habits [data-action="delete"]').click()`); await settle(500);
  });
};
