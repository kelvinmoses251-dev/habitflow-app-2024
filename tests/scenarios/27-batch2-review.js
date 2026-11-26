// Fixes from the independent review of roadmap batch 2. Each scenario pins one finding.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#habits .habit-item')`);
  const xp = () => ev(`__mockDB.users['u-test'].xp`);
  const tick = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-check').click()`);
  const done = id => ev(`(__mockDB.habits[${JSON.stringify(id)}].completedDates || []).length`);

  scenario('review 2: time-of-day groups stay whole when weekly habits sit between daily ones', async () => {
    await boot({ seed: seed({
      m1: H('Morning one', { order: 1, timeOfDay: 'morning' }), e1: H('Evening one', { order: 2, timeOfDay: 'evening' }),
      w1: H('Weekly A', { order: 3, frequency: 'weekly' }), m2: H('Morning two', { order: 4, timeOfDay: 'morning' }),
      a1: H('Any one', { order: 5 }), w2: H('Weekly B', { order: 6, frequency: 'weekly' }), m3: H('Morning three', { order: 7, timeOfDay: 'morning' }),
    }), initScript: `(() => { const R = Date; const b = new R(); b.setHours(9, 0, 0, 0); const k = b.getTime() - R.now(); window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + k); } static now() { return R.now() + k; } }; })();` });
    await rows(); await sleep(300);
    const layout = await ev(`[...document.querySelectorAll('#habits > li')].map(li => li.classList.contains('group-head') ? '[' + li.textContent.trim() + ']' : li.querySelector('.habit-name').textContent.trim()).join(' ')`);
    check('each heading appears once, with all its habits under it', layout === '[Morning] Morning one Morning two Morning three [Evening] Evening one [Any time] Any one', layout);
    noExceptions();
  });

  scenario('review 2: XP can never be refunded twice or lost by tapping quickly', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }) }); await rows(); await sleep(300);
    await tick('a'); await waitFor(`__mockDB.users['u-test'].xp === 325`, 3000);
    await tick('a'); await waitFor(`__mockDB.users['u-test'].xp === 300`, 3000);          // un-ticked by hand
    await ev(`document.querySelector('#toast-container .toast-action').click()`); await sleep(700);   // then Undo on the toast that is still showing
    check('Undo on something already un-ticked changes nothing', (await xp()) === 300 && (await done('a')) === 0, await xp());
    await ev(`(() => { const cb = document.querySelector('.habit-item[data-id="b"] .habit-check'); cb.click(); cb.click(); })()`); await sleep(900);
    check('a double tap leaves the habit open with XP unchanged', (await done('b')) === 0 && (await xp()) === 300, `${await done('b')} done, ${await xp()} XP`);
    check('and the box shows it', !(await ev(`document.querySelector('.habit-item[data-id="b"] .habit-check').checked`)));
    await ev(`(() => { const cb = document.querySelector('.habit-item[data-id="b"] .habit-check'); cb.click(); cb.click(); cb.click(); })()`); await sleep(900);
    check('three quick taps end completed, with exactly 25 XP', (await done('b')) === 1 && (await xp()) === 325, `${await done('b')} done, ${await xp()} XP`);
    noExceptions();
  });

  scenario('review 2: focus view never completes a habit twice or one you have not seen', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }), c: H('Walk', { order: 3 }) }) }); await rows(); await sleep(300);
    await ev(`document.getElementById('focus-open').click()`); await sleep(400);
    await ev(`(() => { const d = document.getElementById('focus-done'); d.click(); d.click(); })()`); await sleep(900);
    check('a double tap on Done completes only the habit that was showing', (await done('a')) === 1 && (await done('b')) === 0, `a ${await done('a')}, b ${await done('b')}`);
    check('and awards XP once', (await xp()) === 325, await xp());
    // "Run" is completed on another device while it is on screen here
    await ev(`import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(m => m.updateDoc(m.doc({}, 'habits', 'b'), { completedDates: m.arrayUnion(${JSON.stringify(day(0))}) }))`); await sleep(500);
    await sleep(500);
    check('the view moves on by itself, past the habit completed elsewhere', (await ev(`document.getElementById('focus-name').textContent.trim()`)) === 'Walk', await ev(`document.getElementById('focus-name').textContent.trim()`));
    check('and no XP was added for it here', (await xp()) === 325, await xp());
    check('the habit name is announced to screen readers when it changes', (await ev(`document.getElementById('focus-name').getAttribute('aria-live')`)) === 'polite');
    await ev(`document.getElementById('logout-btn').click()`); await sleep(900);
    check('signing out closes the focus view', !(await visible('#focus-view')));
    noExceptions();
  });

  scenario('review 2: time of day can be set on any habit, however old, from its details', async () => {
    await boot({ seed: seed({ a: H('Old habit', { createdAt: '2025-01-01T10:00:00Z' }) }) }); await rows(); await sleep(300);
    check('an old habit can be edited as well (since batch 3)', (await ev(`document.querySelectorAll('.habit-item[data-id="a"] [data-action="edit"]').length`)) === 1);
    await ev(`document.querySelector('.habit-item[data-id="a"] [data-action="details"]').click()`); await sleep(350);
    check('its details offer a time of day', (await ev(`document.getElementById('details-time').value`)) === 'any' && await visible('#page-habit .select-btn'));
    await ev(`(() => { const s = document.getElementById('details-time'); s.value = 'evening'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(400);
    check('choosing one saves it', (await ev(`__mockDB.habits.a.timeOfDay`)) === 'evening');
    await ev(`(() => { const s = document.getElementById('details-time'); s.value = 'any'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(400);
    check('"Any time" removes it', await ev(`!('timeOfDay' in __mockDB.habits.a)`));
    noExceptions();
  });

  scenario('review 2: the app notices midnight, so a tick never lands on yesterday', async () => {
    const clock = `(() => { const R = Date; window.__skew = 0; window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + window.__skew); } static now() { return R.now() + window.__skew; } }; })();`;
    await boot({ seed: seed({ a: H('Read') }), initScript: clock }); await rows(); await sleep(300);
    const before = await ev(`document.querySelector('.habit-check').dataset.date`);
    await ev(`window.__skew = 24 * 3600 * 1000; document.dispatchEvent(new Event('visibilitychange')); 0`); await sleep(400);
    const after = await ev(`document.querySelector('.habit-check').dataset.date`);
    check('coming back to the tab the next day refreshes the list for the new day', after !== before && after > before, `${before} -> ${after}`);
    await tick('a'); await sleep(800);
    check('a tick is saved for the new day', (await ev(`__mockDB.habits.a.completedDates.join()`)) === after, await ev(`__mockDB.habits.a.completedDates.join()`));
    noExceptions();
  });

  scenario('review 2: keyboard focus survives a move, a filter chip, and the Undo toast is reachable from focus view', async () => {
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['h' + i, H('Habit ' + i, { order: i + 1, category: i % 2 ? 'reading' : 'health', createdAt: new Date().toISOString() })]));
    await boot({ seed: seed(nine) }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="h2"] .row-more').click()`); await sleep(250);
    await ev(`(() => { const b = document.querySelector('.habit-item[data-id="h2"] [data-action="move-up"]'); b.focus(); b.click(); })()`); await sleep(500);
    check('after Move up, focus is still on that habit\'s Move up', await ev(`document.activeElement.dataset.action === 'move-up' && document.activeElement.dataset.id === 'h2'`));
    await ev(`(() => { const c = [...document.querySelectorAll('#home-filter .chip')].find(x => x.textContent.trim() === 'Reading'); c.focus(); c.click(); })()`); await sleep(400);
    check('after pressing a chip, focus is still on that chip', await ev(`document.activeElement.classList.contains('chip') && document.activeElement.textContent.trim() === 'Reading'`));
    await ev(`[...document.querySelectorAll('#home-filter .chip')].find(x => x.textContent.trim() === 'All').click()`); await sleep(300);
    await ev(`document.getElementById('focus-open').click()`); await sleep(400);
    await ev(`document.getElementById('focus-done').click()`); await sleep(900);
    let reached = false;
    for (let i = 0; i < 8 && !reached; i++) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' }); await sleep(60); reached = await ev(`document.activeElement.classList.contains('toast-action')`); }
    check('Tab reaches Undo on the toast while the focus view is open', reached);
    noExceptions();
  });

  scenario('review 2: touch screens wider than a phone can reorder, and stale filter text is cleared', async () => {
    const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
    check('Move up and Move down are shown on any touch screen', /@media \(pointer: coarse\)[^{]*\{[^}]*\.row-move[^}]*display: grid/.test(css.replace(/\s+/g, ' ')));
    const nine = Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['h' + i, H('Habit ' + i, { order: i + 1, createdAt: new Date().toISOString() })]));
    await boot({ seed: seed(nine) }); await rows(); await sleep(300);
    await ev(`(() => { const i = document.getElementById('habit-search'); i.value = 'Habit 3'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(250);
    await ev(`document.querySelector('.habit-item [data-action="delete"]').click()`); await sleep(600);    // down to eight: the bar goes away
    check('when the list gets short again the bar and its text are cleared', !(await visible('#home-filter')) && (await ev(`document.getElementById('habit-search').value`)) === '' && (await ev(`document.querySelectorAll('#habits .habit-item').length`)) === 8);
    noExceptions();
  });
};
