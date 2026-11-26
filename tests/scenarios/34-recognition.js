// Recognition (roadmap batch 4): the level page, milestone moments, achievements.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = { xp: 300 }, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': user } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const open = id => ev(`!document.getElementById(${JSON.stringify(id)}).classList.contains('hidden')`);
  const key = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : 13 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }));
  const fits = sel => ev(`(() => { const d = document.querySelector(${JSON.stringify(sel)}); return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth + 1; })()`);

  // ── 35: the level page ───────────────────────────────────
  scenario('level page: opens from Home, explains the level, the ladder and where XP came from', async () => {
    await boot({ mobile: false, seed: seed({ a: H('Read', { completedDates: [day(1)] }), b: H('Run', { order: 2, completedDates: [day(1), day(2)] }) }) }); await rows(); await sleep(400);
    check('the Level tile on Home is a button that says what it opens', await ev(`(() => { const b = document.getElementById('open-level'); return !!b && b.tagName === 'BUTTON' && /Level 3/.test(b.getAttribute('aria-label')) && /Steady/.test(b.getAttribute('aria-label')); })()`), await ev(`(document.getElementById('open-level') || {}).outerHTML`));
    await ev(`document.getElementById('open-level').focus(); document.getElementById('open-level').click()`); await sleep(350);
    check('it opens the level page', await open('level-modal'));
    check('named as a dialog', await ev(`(() => { const m = document.getElementById('level-modal'); return m.getAttribute('role') === 'dialog' && !!document.getElementById(m.getAttribute('aria-labelledby')); })()`));
    check('the heading is the level and its name', /Level 3/.test(await text('#level-title')) && /Steady/.test(await text('#level-title')), await text('#level-title'));
    check('it says what the level means', (await text('#level-modal .level-meaning')).trim() === 'The routine is starting to hold.', await text('#level-modal .level-meaning'));
    check('it says what is left to the next one', /150 XP to Level 4/.test(await text('#level-to-go')) && /Consistent/.test(await text('#level-to-go')), await text('#level-to-go'));
    check('the bar is a real progress bar at 25%', await ev(`(() => { const b = document.querySelector('#level-modal .level-bar'); return b.getAttribute('role') === 'progressbar' && b.getAttribute('aria-valuenow') === '25'; })()`));
    check('the ladder lists all ten levels', (await ev(`document.querySelectorAll('#level-modal .level-ladder li').length`)) === 10);
    check('two are passed, one is current, seven are ahead', await ev(`(() => { const q = s => document.querySelectorAll('#level-modal .level-ladder ' + s).length; return q('li.is-passed') === 2 && q('li.is-current') === 1 && q('li[aria-current="true"]') === 1; })()`));
    check('the current one is Steady', /Steady/.test(await text('#level-modal .level-ladder li.is-current')));
    check('each level says the XP it starts at', /250 XP/.test(await text('#level-modal .level-ladder li.is-current .lv-xp')));
    check('how XP is earned is spelled out', /\+25/.test(await text('#level-modal .level-rules')) && /\+100/.test(await text('#level-modal .level-rules')));
    const hist = await ev(`[...document.querySelectorAll('#level-modal .xp-history li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())`);
    check('recent XP lists yesterday first, with the full-day bonus', hist.length === 2 && /^Yesterday/.test(hist[0]) && /Read and Run/.test(hist[0]) && /Full day bonus/.test(hist[0]) && /\+150$/.test(hist[0]), JSON.stringify(hist));
    check('and the day before, without it', hist[1] && /Run/.test(hist[1]) && !/bonus/i.test(hist[1]) && /\+25$/.test(hist[1]), JSON.stringify(hist));
    await key('Escape'); await sleep(300);
    check('Escape closes it', !(await open('level-modal')));
    check('focus goes back to the tile', await ev(`document.activeElement === document.getElementById('open-level')`));
    noExceptions();
  });

  scenario('level page: opens from Profile, updates after a completion, and fits a small phone', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }, { xp: 3300 }) }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="a"] .habit-check').click()`); await sleep(700);
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('the Level row in Profile is a button', await ev(`(() => { const b = document.getElementById('open-level-profile'); return !!b && b.tagName === 'BUTTON'; })()`));
    await size(320, 568); await sleep(150);
    await ev(`document.getElementById('open-level-profile').click()`); await sleep(400);
    check('it opens the same page', await open('level-modal'));
    check('at the top level it says so, with no "to go"', /Top level reached/.test(await text('#level-to-go')) && /Level 10/.test(await text('#level-title')), await text('#level-to-go'));
    check('every earlier level is ticked', (await ev(`document.querySelectorAll('#level-modal .level-ladder li.is-passed').length`)) === 9);
    check('today is in the history after completing a habit', /^Today/.test(await ev(`(document.querySelector('#level-modal .xp-history li') || { innerText: '' }).innerText.trim()`)));
    check('320px: nothing spills sideways', await fits('#level-modal .dialog'));
    check('the Close button is a full thumb target', await ev(`document.getElementById('level-close').getBoundingClientRect().height >= 44`));
    await ev(`document.getElementById('level-close').click()`); await sleep(250);
    check('Close closes it', !(await open('level-modal')));
    noExceptions();
  });

  scenario('level page: an account with no history says so plainly', async () => {
    await boot({ seed: seed({ a: H('Read') }, { xp: 0 }), colorScheme: 'dark' }); await rows(); await sleep(300);
    await ev(`document.getElementById('summary-toggle').click()`); await sleep(350);
    await ev(`document.getElementById('open-level').click()`); await sleep(350);
    check('level 1, Starter', /Level 1/.test(await text('#level-title')) && /Starter/.test(await text('#level-title')));
    check('no history yet is explained, not left blank', await visible('#xp-history-none'));
    check('nothing is passed yet', (await ev(`document.querySelectorAll('#level-modal .level-ladder li.is-passed').length`)) === 0);
    check('dark: the current level stands out from the page', await ev(`(() => { const li = document.querySelector('#level-modal .level-ladder li.is-current'); return getComputedStyle(li).backgroundColor !== getComputedStyle(li.parentElement).backgroundColor; })()`));
    noExceptions();
  });
  // ── 32: milestone moments ────────────────────────────────
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const tick = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-check').click()`);
  const dlSpy = `window.__dl = []; const _click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, size: (this.href || '').length, png: /^data:image\\/png/.test(this.href || '') }); return; } return _click.call(this); };
    try { Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined }); } catch (_) {}`;

  scenario('milestone: the seventh day in a row gets a full-screen card, once', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(1, 6) }), b: H('Run', { order: 2 }) }), initScript: dlSpy }); await rows(); await sleep(300);
    await tick('a');
    check('the card opens', await waitFor(`!document.getElementById('milestone-modal').classList.contains('hidden')`, 2500));
    check('the completion was saved before it showed', await ev(`__mockDB.habits.a.completedDates.includes(${JSON.stringify(day(0))})`));
    check('it shows the number', (await text('#milestone-num')).trim() === '7', await text('#milestone-num'));
    check('says what it is', (await text('#milestone-title')).trim() === '7 days in a row', await text('#milestone-title'));
    check('and names the habit', (await text('#milestone-habit')).trim() === 'Read', await text('#milestone-habit'));
    check('it is a named dialog', await ev(`(() => { const m = document.getElementById('milestone-modal'); return m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true' && !!document.getElementById(m.getAttribute('aria-labelledby')); })()`));
    check('it fills the screen', await ev(`(() => { const r = document.querySelector('#milestone-modal .dialog').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; })()`));
    check('Continue has the focus, so Enter moves on', await ev(`document.activeElement === document.getElementById('milestone-close')`));
    check('its animation runs once', await ev(`[...document.querySelectorAll('#milestone-modal *')].every(e => getComputedStyle(e).animationIterationCount !== 'infinite')`));
    await ev(`document.getElementById('milestone-share').click()`); await sleep(900);
    const dl = await ev(`window.__dl`);
    check('Share makes a picture (saved when the device cannot share files)', dl.length === 1 && dl[0].png && dl[0].size > 20000 && /habitly-7-days/.test(dl[0].name), JSON.stringify(dl));
    check('the card is still open after sharing', await open('milestone-modal'));
    await key('Escape'); await sleep(300);
    check('Escape closes it', !(await open('milestone-modal')));
    await sleep(900);
    await tick('a'); await sleep(500);
    check('the tick can be taken back', await ev(`__mockDB.habits.a.completedDates.length === 6`));
    await tick('a'); await sleep(1200);
    check('ticking it again does not show the card twice', !(await open('milestone-modal')) && await ev(`__mockDB.habits.a.completedDates.length === 7`));
    noExceptions();
  });

  scenario('milestone: one card at a time when the same tap finishes the day and reaches a new level', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(1, 29) }) }, { xp: 75 }) }); await rows(); await sleep(300);
    await tick('a');
    check('the milestone card comes first', await waitFor(`!document.getElementById('milestone-modal').classList.contains('hidden')`, 2500));
    check('it is the 30', (await text('#milestone-num')).trim() === '30' && /30 days in a row/.test(await text('#milestone-title')));
    await sleep(1500);
    check('nothing else is stacked on it', !(await open('all-done-overlay')) && !(await open('level-up-modal')));
    check('the XP and the bonus are already saved underneath', await ev(`__mockDB.users['u-test'].xp === 200 && __mockDB.users['u-test'].allDoneBonusDate === ${JSON.stringify(day(0))}`), await ev(`JSON.stringify(__mockDB.users['u-test'])`));
    await ev(`document.getElementById('milestone-close').click()`);
    check('closing it brings the all-done card', await waitFor(`!document.getElementById('all-done-overlay').classList.contains('hidden')`, 2000));
    check('and still not the level card', !(await open('level-up-modal')) && !(await open('milestone-modal')));
    await ev(`document.getElementById('all-done-close').click()`);
    check('then the new level', await waitFor(`!document.getElementById('level-up-modal').classList.contains('hidden')`, 2000));
    check('which is the right one', /Level 2/.test(await text("#level-up-new-level")), await text('#level-up-new-level'));
    await ev(`document.getElementById('level-up-claim-btn').click()`); await sleep(600);
    check('after that the screen is clear', !(await open('level-up-modal')) && !(await open('all-done-overlay')) && !(await open('milestone-modal')));
    noExceptions();
  });

  scenario('milestone: only day streaks at 7, 30, 100 and 365, and it fits a small dark screen', async () => {
    await boot({ colorScheme: 'dark', seed: seed({
      w: H('Call home', { frequency: 'weekly', completedDates: [7, 14, 21, 28, 35, 42].map(day) }),
      e: H('Stretch', { order: 2, completedDates: run(1, 7) }),
      y: H('Walk <b>far</b>', { order: 3, completedDates: run(1, 364) }),
      z: H('Rest', { order: 4 }),
    }) }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="w"] .habit-check').click()`); await sleep(1300);
    check('a weekly habit reaching 7 weeks shows no day milestone', !(await open('milestone-modal')));
    await tick('e'); await sleep(1300);
    check('the eighth day shows none', !(await open('milestone-modal')));
    await size(320, 568); await sleep(150);
    await tick('y');
    check('the 365th day does', await waitFor(`!document.getElementById('milestone-modal').classList.contains('hidden')`, 2500) && (await text('#milestone-num')).trim() === '365');
    check('a name with HTML in it is shown as text', (await text('#milestone-habit')).trim() === 'Walk <b>far</b>' && !(await ev(`!!document.querySelector('#milestone-habit b')`)));
    check('320px: nothing spills sideways and both buttons are thumb-sized', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#milestone-modal .dialog-actions button')].every(b => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.right <= innerWidth && r.bottom <= innerHeight; })`));
    check('dark: the number can be read against the card', await ev(`(() => { const n = document.getElementById('milestone-num'); const lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const a = lum(getComputedStyle(n).color), b2 = lum(getComputedStyle(document.querySelector('#milestone-modal .dialog')).backgroundColor); return (Math.max(a, b2) + .05) / (Math.min(a, b2) + .05) >= 4.5; })()`));
    await ev(`document.getElementById('milestone-close').click()`); await sleep(300);
    noExceptions();
  });
};
