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
};
