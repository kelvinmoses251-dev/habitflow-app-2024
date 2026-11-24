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
};
