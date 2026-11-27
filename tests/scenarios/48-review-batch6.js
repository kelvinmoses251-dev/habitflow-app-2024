// Regressions from the independent review of roadmap batch 6.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now(), ...user } } } });
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const stats = async () => { await waitFor(`!document.getElementById('app').classList.contains('hidden')`); await ev(`location.hash = '#stats'`); await sleep(800); };
  const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(350); };
  const user = () => ev(`JSON.stringify(__mockDB.users['u-test'])`).then(JSON.parse);
  const sinceMonday = (new Date(day(0) + 'T12:00:00Z').getUTCDay() + 6) % 7, sun = sinceMonday + 1, mon = sinceMonday + 7;
  const two = () => ({ a: H('Read', { completedDates: run(0, 40) }), b: H('Run', { order: 2, completedDates: [day(sun), day(mon)] }) });

  scenario('review: switching period redraws only what depends on the period', async () => {
    await size(1280, 800);
    await boot({ seed: seed(two()), mobile: false }); await stats();
    await ev(`window.__kept = { rec: document.querySelector('#records .rec'), heat: document.querySelector('#heat .hc[data-day]'), row: document.querySelector('#review-week .rv-row'), bar: document.querySelector('#bars .bar-slot') }`);
    await click('#stats-period [data-period="month"]'); await sleep(300);
    check('the records, the year and the reviews are left as they were', await ev(`document.querySelector('#records .rec') === __kept.rec && document.querySelector('#heat .hc[data-day]') === __kept.heat && document.querySelector('#review-week .rv-row') === __kept.row`));
    check('the bars are drawn again for the new period', await ev(`document.querySelector('#bars .bar-slot') !== __kept.bar && document.querySelectorAll('#bars .bar-slot').length === 30`));
    await ev(`__kept.bar = document.querySelector('#bars .bar-slot'); __kept.heat = document.querySelector('#heat .hc[data-day]')`);
    await size(700, 800); await sleep(700);
    check('a new width redraws the charts to fit', await ev(`document.querySelector('#bars .bar-slot') !== __kept.bar && document.querySelector('#heat .hc[data-day]') !== __kept.heat`));
    check('and still not the records or the reviews', await ev(`document.querySelector('#records .rec') === __kept.rec && document.querySelector('#review-week .rv-row') === __kept.row`));
    await ev(`__mockRemote('habits', 'b', { completedDates: [${JSON.stringify(day(1))}] })`); await sleep(900);
    check('new data redraws everything', await ev(`document.querySelector('#records .rec') !== __kept.rec`));
    noExceptions();
  });

  scenario('review: the year can be scrolled sideways with a finger', async () => {
    await size(375, 667);
    await boot({ seed: seed(two()) }); await stats();
    const touch = await ev(`getComputedStyle(document.querySelector('#heat .heat-scroll')).touchAction`);
    check('the scrolling box allows sideways panning', touch === 'auto' || /pan-x/.test(touch), touch);
    noExceptions();
  });

  scenario('review: saving a weekly review touches only that week, and choices survive a stray tap', async () => {
    await boot({ seed: seed(two(), { reviews: { '2020-01-06': { at: 5, focus: null } } }) }); await stats();
    await click('#review-open'); await click('#review-next'); await click('#review-next');
    await click('#review-body input[name="slip-b"][value="pause"]');
    await ev(`(() => { const m = document.getElementById('review-modal'); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`); await sleep(400);
    check('a tap on the backdrop does not throw the choices away', (await visible('#review-modal')) && await ev(`document.querySelector('#review-body input[name="slip-b"][value="pause"]').checked`));
    await ev(`__mockRemote('users', 'u-test', { reviews: { '2020-01-06': { at: 5, focus: null }, '2021-03-01': { at: 7, focus: null } } })`); await sleep(400);
    await click('#review-next'); await click('#review-next');
    const u = await user();
    check('a review saved on another device meanwhile is still there', !!u.reviews['2021-03-01'] && !!u.reviews['2020-01-06'] && !!u.reviews[day(mon)], JSON.stringify(Object.keys(u.reviews)));
    const w = JSON.parse(await ev(`JSON.stringify(window.__mockWrites.filter(x => x.col === 'users' && x.data && x.data.reviews).map(x => Object.keys(x.data.reviews)))`));
    check('the write names only the week reviewed', w.length === 1 && w[0].length === 1 && w[0][0] === day(mon), JSON.stringify(w));
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    check('reviews are wiped from memory with the rest of the account on sign-out', /function resetUserState\(\) \{[\s\S]{0,2500}userReviews = \{\}/.test(app));
    noExceptions();
  });

  scenario('review: no "0 of 0", no first-week claim for an old account, and the privacy page matches', async () => {
    await boot({ seed: seed({ a: H('Stretch', { completedDates: run(1, 3), scheduleHistory: [{ from: '2025-01-05', schedule: { type: 'times', times: 3 } }, { from: day(0), schedule: { type: 'daily' } }] }) }) }); await stats();
    check('a habit done only when it was not due does not read "0 of 0"', !/0 of 0/.test(await trim('#by-habit-list')) && /3 times when it was not due/.test(await trim('#by-habit-list')), await trim('#by-habit-list'));
    check('nothing on the page reads NaN, undefined, null or "0 of 0"', !/NaN|undefined|null|\b0 of 0\b/.test(await ev(`document.getElementById('page-stats').innerText`)));
    await boot({ seed: seed({ w: H('Call home', { frequency: 'weekly', completedDates: [day(40)] }) }) }); await stats();
    check('an old account with a quiet week is told so, not "your first full week"', !/first full week/i.test(await trim('#review-status')) && /Nothing was due or done last week/.test(await trim('#review-status')), await trim('#review-status'));
    const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
    check('the privacy page no longer says a chart library is fetched from another site', !/libraries for charts/.test(privacy) && !/jsDelivr/.test(privacy) && /cdnjs/.test(privacy));
    check('nor does the app fetch anything from jsDelivr', !/cdn\.jsdelivr\.net/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')) && !/Chart\.js/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
    noExceptions();
  });

  scenario('review: a story slide is read out, and a new account is not offered one', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(0, 75) }) }) }); await stats();
    await click('#story-open-month');
    check('the slide is a live region, so its words are spoken when it changes', (await ev(`document.getElementById('story-slide').getAttribute('aria-live')`)) === 'polite');
    await boot({ seed: seed({ a: H('New', { createdAt: new Date().toISOString(), completedDates: [day(0)] }) }) }); await stats();
    check('one day of history is not offered as a year', !(await ev(`!!document.querySelector('#review-stories [data-story]')`)) && /Nothing to tell yet/.test(await trim('#story-year-status')));
    noExceptions();
  });
};
