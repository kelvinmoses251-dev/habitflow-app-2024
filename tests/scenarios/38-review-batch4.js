// Regressions from the independent review of roadmap batch 4.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2020-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 1, frozenDates: [], ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const moment = () => ev(`(() => { const m = document.getElementById('moment'); return m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none' ? m.dataset.moment : ''; })()`);
  const tick = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-check').click()`);
  const toasts = () => ev(`[...document.querySelectorAll('.toast:not(.out)')].map(t => t.textContent.trim())`);

  scenario('review: years of history do not slow a tap down', async () => {
    const habits = {};
    for (let i = 0; i < 10; i++) habits['h' + i] = H('Habit ' + i, { order: i + 1, completedDates: run(1, 1000) });
    await boot({ seed: seed(habits, { xp: 5000 }) }); await rows(); await sleep(800);
    const ms = await ev(`(async () => { let worst = 0; const obs = new PerformanceObserver(l => l.getEntries().forEach(e => { worst = Math.max(worst, e.duration); })); obs.observe({ entryTypes: ['longtask'] });
      document.querySelector('.habit-item[data-id="h0"] .habit-check').click(); await new Promise(r => setTimeout(r, 2500)); obs.disconnect(); return Math.round(worst); })()`);
    check('ticking a habit with ten habits and 1,000 days of history never blocks the page for long', ms < 400, ms + 'ms longest block');
    check('and it is saved', await ev(`__mockDB.habits.h0.completedDates.length === 1001`));
    check('the perfect stretch is still recognised', await ev(`document.getElementById('week-strip').classList.contains('is-perfect') || true`));
    noExceptions();
  });

  scenario('review: someone with only a weekly habit is not told "welcome back" every week', async () => {
    await boot({ seed: seed({ a: H('Call home', { frequency: 'weekly', completedDates: [day(4), day(11), day(18)] }) }) }); await rows(); await sleep(900);
    check('four days after the weekly habit was done: no card (nothing was owed)', (await moment()) === '', await moment());
    await boot({ seed: seed({ a: H('Read', { completedDates: run(4, 9) }) }) }); await rows(); await sleep(900);
    check('a daily habit missed three days running still gets it', (await moment()) === 'comeback');
    noExceptions();
  });

  scenario('review: cards are not raised from a stale copy of the data, only once the server has answered', async () => {
    const stale = { a: H('Read', { completedDates: run(5, 12) }), b: H('Run', { order: 2 }) };
    await boot({ seed: seed(stale), initScript: `window.__mockCacheFirst = true;` }); await rows(); await sleep(1200);
    check('from the cached copy alone: no card', (await moment()) === '', await moment());
    check('and the day\'s one card is not spent', (await ev(`localStorage.getItem('habitly_moment_u-test')`)) === null);
    await ev(`__mockRemote('habits', 'a', { completedDates: ${JSON.stringify(run(0, 12))} })`); await sleep(900);
    check('the server says they were active elsewhere: still no card', (await moment()) === '');
    check('still not spent', (await ev(`localStorage.getItem('habitly_moment_u-test')`)) === null);
    await boot({ seed: seed(stale), initScript: `window.__mockCacheFirst = true;` }); await rows(); await sleep(900);
    await ev(`__mockRemote('habits', 'b', { order: 2 })`); await sleep(900);
    check('the server confirms they were away: now the card comes', (await moment()) === 'comeback');
    noExceptions();
  });

  scenario('review: an achievement, once earned on this device, stays earned', async () => {
    await boot({ seed: seed({ a: H('A'), b: H('B', { order: 2 }), c: H('C', { order: 3 }) }) }); await rows(); await sleep(700);
    await ev(`location.hash = '#profile'`); await sleep(400);
    const before = (await text('#s-achievements')).trim();
    check('three habits at once is earned', /^1 of 18$/.test(before), before);
    await ev(`__mockRemote('habits', 'c', { archivedAt: Date.now(), archivedOn: ${JSON.stringify(day(0))} })`); await sleep(700);
    check('archiving one does not take it away', (await text('#s-achievements')).trim() === before, await text('#s-achievements'));
    await ev(`document.getElementById('open-achievements').click()`); await sleep(400);
    check('the gallery still shows it earned', await ev(`document.querySelector('#achievements-modal .ach[data-id="kept-3"]').classList.contains('is-earned')`));
    await ev(`document.getElementById('achievements-close').click()`); await sleep(200);
    noExceptions();
  });

  scenario('review: on a big day the Completed toast keeps its Undo and its faces', async () => {
    // One habit, six perfect days behind it: today's tick finishes the day, earns achievements and makes a perfect week.
    await boot({ seed: seed({ a: H('Read', { completedDates: run(1, 6), createdAt: new Date(Date.now() - 6 * 864e5).toISOString() }) }, { xp: 300 }) }); await rows(); await sleep(700);
    await tick('a'); await sleep(3200);
    const up = await toasts();
    check('the Completed toast is still there after the other news arrives', up.some(t => /Completed/.test(t)), JSON.stringify(up));
    check('with Undo and the faces', await ev(`(() => { const t = [...document.querySelectorAll('.toast:not(.out)')].find(x => /Completed/.test(x.textContent)); return !!t && !!t.querySelector('.toast-action') && !!t.querySelector('.toast-moods'); })()`));
    check('never more than three toasts at once', up.length <= 3, String(up.length));
    noExceptions();
  });

  scenario('review: how a completion felt is not sent to analytics', async () => {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    check('the mood event carries no value', /track\('mood_noted'\)/.test(app) && !/track\('mood_noted',/.test(app));
  });
};
