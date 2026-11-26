// Moments the app raises on its own (roadmap batch 4): the shield question, the comeback card, the evening recap.
// They share one card at the foot of the screen, never block a tap, and at most one appears unasked per day.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 1, frozenDates: [], ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const profile = () => ev(`JSON.stringify(__mockDB.users['u-test'])`).then(JSON.parse);
  const moment = () => ev(`(() => { const m = document.getElementById('moment'); return m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none' ? m.dataset.moment : ''; })()`);
  const momentBtn = label => `[...document.querySelectorAll('#moment button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
  const reload = async () => { await ev(`location.reload()`); await sleep(500); await waitFor(`!!window.__mockDB && !!document.querySelector('#page-home .habit-item')`); await sleep(900); };
  const key = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: 27 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }));
  const streakOf12 = () => ({ a: H('Read', { completedDates: run(2, 13) }), b: H('Run', { order: 2 }) });

  // ── 33: the shield is a choice ───────────────────────────
  scenario('shield: a missed day is a question, and nothing is spent until it is answered', async () => {
    await boot({ seed: seed(streakOf12()) }); await rows(); await sleep(900);
    check('the question is on screen', (await moment()) === 'shield', await moment());
    check('it says what happened and what the shield would keep', /missed yesterday/i.test(await text('#moment-title')) && /13-day streak/.test(await text('#moment-text')) && /Read/.test(await text('#moment-text')), await text('#moment-text'));
    const before = await profile();
    check('nothing has been spent or written', before.streakShields === 1 && before.frozenDates.length === 0 && !before.shieldUsedAt, JSON.stringify(before));
    check('until it is answered the streak shows as it truly is', (await text('#greeting-streak')) === '0', await text('#greeting-streak'));
    check('it is a labelled region, not a dialog that traps the page', await ev(`(() => { const m = document.getElementById('moment'); return m.getAttribute('role') === 'region' && !!m.getAttribute('aria-label') && m.getAttribute('aria-modal') === null && !document.documentElement.classList.contains('dialog-open'); })()`));
    check('it offers Use shield, Let it go and a way to dismiss', await ev(`!!${momentBtn('Use shield')} && !!${momentBtn('Let it go')} && !!document.querySelector('#moment-dismiss[aria-label]')`));
    check('every button is thumb-sized', await ev(`[...document.querySelectorAll('#moment button')].every(b => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })`));
    check('the first habit can still be reached and tapped', await ev(`(() => { const cb = document.querySelector('.habit-item[data-id="b"] .habit-check'); const r = cb.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === cb; })()`));
    await ev(`document.querySelector('.habit-item[data-id="b"] .habit-check').click()`); await sleep(700);
    check('ticking a habit while it is up works', await ev(`__mockDB.habits.b.completedDates.length === 1`));
    check('and the question stays', (await moment()) === 'shield');
    check('the list can scroll clear of the card', await ev(`(() => { window.scrollTo(0, document.documentElement.scrollHeight); const last = [...document.querySelectorAll('#page-home .habit-item')].pop().getBoundingClientRect(); return last.bottom <= document.getElementById('moment').getBoundingClientRect().top + 1; })()`));
    await ev(`${momentBtn('Use shield')}.click()`); await sleep(600);
    const after = await profile();
    check('Use shield spends it on yesterday', after.streakShields === 0 && JSON.stringify(after.frozenDates) === JSON.stringify([day(1)]) && typeof after.shieldUsedAt === 'number', JSON.stringify(after));
    check('the streak is kept', (await text('.habit-item[data-id="a"] .streak-pill')).replace(/\D/g, '') === '13', await text('.habit-item[data-id="a"] .streak-pill'));
    check('the card has gone', (await moment()) === '');
    check('and the Shield tile shows none left', (await text('#greeting-shield-count')) === '0');
    noExceptions();
  });

  scenario('shield: letting it go keeps the shield, and the question does not come back', async () => {
    await boot({ seed: seed(streakOf12()) }); await rows(); await sleep(900);
    await ev(`${momentBtn('Let it go')}.click()`); await sleep(500);
    const p = await profile();
    check('the shield is kept and nothing is frozen', p.streakShields === 1 && p.frozenDates.length === 0, JSON.stringify(p));
    check('the card has gone', (await moment()) === '');
    check('the streak starts again', (await text('#greeting-streak')) === '0');
    await reload();
    check('after a reload it does not ask again', (await moment()) === '');
    await ev(`document.getElementById('greeting-shield-badge').click()`); await sleep(400);
    check('the Shield tile then just explains the shield', (await moment()) === '' && await ev(`[...document.querySelectorAll('.toast')].some(t => /shield/i.test(t.textContent))`));
    noExceptions();
  });

  scenario('shield: dismissing leaves the offer open all day from the Shield tile', async () => {
    await boot({ mobile: false, seed: seed(streakOf12()) }); await rows(); await sleep(900);
    check('desktop: the card sits in a corner, clear of the list', await ev(`(() => { const m = document.getElementById('moment').getBoundingClientRect(), l = document.querySelector('#page-home .habit-item').getBoundingClientRect(); return m.width <= 420 && m.bottom <= innerHeight && (m.left >= l.right || m.top >= l.bottom); })()`));
    await ev(`document.getElementById('moment-dismiss').click()`); await sleep(300);
    check('Dismiss closes the card', (await moment()) === '');
    check('and spends nothing', (await profile()).streakShields === 1);
    check('the Shield tile is a button that says an answer is waiting', await ev(`(() => { const b = document.getElementById('greeting-shield-badge'); return b.tagName === 'BUTTON' && /use/i.test(b.getAttribute('aria-label')); })()`), await ev(`document.getElementById('greeting-shield-badge').getAttribute('aria-label')`));
    await reload();
    check('it is not raised again the same day', (await moment()) === '');
    await ev(`document.getElementById('greeting-shield-badge').click()`); await sleep(400);
    check('but the Shield tile brings the question back', (await moment()) === 'shield');
    await key('Escape'); await sleep(300);
    check('Escape dismisses it', (await moment()) === '');
    await ev(`document.getElementById('greeting-shield-badge').click()`); await sleep(300);
    await ev(`${momentBtn('Use shield')}.click()`); await sleep(600);
    check('and it can still be used', (await profile()).streakShields === 0 && (await profile()).frozenDates[0] === day(1));
    noExceptions();
  });

  scenario('shield: no question when there is no shield, nothing to save, or nothing was due', async () => {
    await boot({ seed: seed(streakOf12(), { streakShields: 0, shieldUsedAt: Date.now() - 2 * 864e5 }) }); await rows(); await sleep(900);
    check('no shield in hand: no card', (await moment()) !== 'shield');
    await boot({ seed: seed({ a: H('Read', { completedDates: run(5, 9) }) }) }); await rows(); await sleep(900);
    check('the streak ended days ago: no card', (await moment()) !== 'shield');
    check('and the shield is untouched', (await profile()).streakShields === 1);
    await boot({ seed: seed({ a: H('Read', { completedDates: run(1, 6) }) }) }); await rows(); await sleep(900);
    check('nothing was missed: no card', (await moment()) !== 'shield');
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(900);
    check('a new account: no card', (await moment()) === '');
    noExceptions();
  });

  scenario('shield: an answer given on another device clears the question here', async () => {
    await boot({ seed: seed(streakOf12()) }); await rows(); await sleep(900);
    check('the question is up', (await moment()) === 'shield');
    await ev(`__mockRemote('users', 'u-test', { streakShields: 0, frozenDates: [${JSON.stringify(day(1))}], shieldUsedAt: Date.now() })`); await sleep(700);
    check('it goes when the shield is used elsewhere', (await moment()) === '', await moment());
    check('and the count never goes below zero', (await text('#greeting-shield-count')) === '0' && (await profile()).streakShields === 0);
    noExceptions();
  });
  // ── 38: a comeback flow ──────────────────────────────────
  const open = id => ev(`!document.getElementById(${JSON.stringify(id)}).classList.contains('hidden')`);
  const awayFor = n => ({ a: H('Read', { completedDates: run(n, n + 16) }), b: H('Run', { order: 2, completedDates: [day(n), day(n + 2)] }), c: H('Walk', { order: 3 }) });

  scenario('comeback: after days away the app says welcome back and offers to ease back in', async () => {
    await boot({ seed: seed(awayFor(4)) }); await rows(); await sleep(900);
    check('the welcome-back card is up', (await moment()) === 'comeback', await moment());
    check('it says how long it has been', (await text('#moment-title')).trim() === 'Welcome back' && /4 days/.test(await text('#moment-text')), await text('#moment-text'));
    check('habits can still be tapped behind it', await ev(`(() => { const cb = document.querySelector('.habit-item[data-id="a"] .habit-check'); const r = cb.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === cb; })()`));
    await ev(`${momentBtn('Ease back in')}.click()`); await sleep(450);
    check('Ease back in opens a sheet and puts the card away', (await open('comeback-modal')) && (await moment()) === '');
    check('it is a named dialog', await ev(`(() => { const m = document.getElementById('comeback-modal'); return m.getAttribute('role') === 'dialog' && !!document.getElementById(m.getAttribute('aria-labelledby')); })()`));
    check('it says what is still theirs', /19 check-ins/.test(await text('#comeback-kept')) && /best streak of 17 days/.test(await text('#comeback-kept')), await text('#comeback-kept'));
    check('every habit is listed, ticked to keep', (await ev(`document.querySelectorAll('#comeback-list .pick-check').length`)) === 3 && (await ev(`document.querySelectorAll('#comeback-list .pick-check:checked').length`)) === 3);
    check('each tick box is labelled by its habit', await ev(`[...document.querySelectorAll('#comeback-list .pick-check')].every(b => b.closest('label') && b.closest('label').textContent.trim().length > 2)`));
    check('the button says all three', (await text('#comeback-go')).trim() === 'Start again with all 3');
    await ev(`['b', 'c'].forEach(id => document.querySelector('#comeback-list .pick-check[data-id="' + id + '"]').click())`); await sleep(200);
    check('un-ticking two changes the count', (await text('#comeback-go')).trim() === 'Start again with 1');
    await size(320, 568); await sleep(150);
    check('320px: fits, rows and buttons are thumb-sized', await ev(`(() => { const d = document.querySelector('#comeback-modal .dialog'); return document.documentElement.scrollWidth <= innerWidth && d.scrollWidth <= d.clientWidth + 1 && [...document.querySelectorAll('#comeback-modal .pick-item, #comeback-modal .dialog-actions button')].every(e => e.getBoundingClientRect().height >= 44); })()`));
    await ev(`document.getElementById('comeback-go').click()`); await sleep(700);
    check('the sheet closes', !(await open('comeback-modal')));
    check('exactly the two un-ticked habits are paused from today', await ev(`(() => { const h = __mockDB.habits, p = x => JSON.stringify(x.pauses || []); return p(h.b) === ${JSON.stringify(JSON.stringify([{ from: day(0) }]))} && p(h.c) === p(h.b) && p(h.a) === '[]'; })()`), await ev(`JSON.stringify([__mockDB.habits.a.pauses, __mockDB.habits.b.pauses, __mockDB.habits.c.pauses])`));
    check('nothing else about them changed', await ev(`__mockDB.habits.b.completedDates.length === 2 && __mockDB.habits.a.completedDates.length === 17`));
    check('it says so', await ev(`[...document.querySelectorAll('.toast')].some(t => /2 habits paused/.test(t.textContent))`));
    check('Today now shows the one habit kept, and where the others went', (await ev(`document.querySelectorAll('#habits .habit-item').length`)) === 1 && await visible('#paused-note'));
    await reload();
    check('it is said once: no card after a reload', (await moment()) === '');
    noExceptions();
  });

  scenario('comeback: not for a short gap, a new account, a used allowance, or twice', async () => {
    await boot({ seed: seed(awayFor(2)) }); await rows(); await sleep(900);
    check('two days away: no welcome back', (await moment()) !== 'comeback', await moment());
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }) }); await rows(); await sleep(900);
    check('an account with nothing ticked yet: no card', (await moment()) === '');
    await boot({ seed: seed(awayFor(5), {}, { 'habitly_moment_u-test': day(0) }) }); await rows(); await sleep(900);
    check('another card already used today: none raised', (await moment()) === '');
    await boot({ seed: seed(awayFor(5)) }); await rows(); await sleep(900);
    check('five days away: the card is up', (await moment()) === 'comeback' && /5 days/.test(await text('#moment-text')));
    await ev(`document.querySelector('.habit-item[data-id="c"] .habit-check').click()`); await sleep(800);
    check('completing a habit puts it away: they are back', (await moment()) === '');
    await boot({ seed: seed(awayFor(5)) }); await rows(); await sleep(900);
    await ev(`document.getElementById('moment-dismiss').click()`); await sleep(300);
    await reload();
    check('dismissed: not raised again for the same absence', (await moment()) === '');
    await boot({ seed: seed(awayFor(5)) }); await rows(); await sleep(900);
    await ev(`${momentBtn('Ease back in')}.click()`); await sleep(400);
    await ev(`document.querySelectorAll('#comeback-list .pick-check').forEach(b => b.click())`); await sleep(200);
    check('with nothing kept the button is off and says why', await ev(`document.getElementById('comeback-go').disabled`) && await visible('#comeback-none'));
    await key('Escape'); await sleep(300);
    check('Escape closes the sheet and pauses nothing', !(await open('comeback-modal')) && await ev(`Object.values(__mockDB.habits).every(h => !(h.pauses || []).length)`));
    noExceptions();
  });
};
