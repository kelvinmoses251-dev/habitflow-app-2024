// Getting started (roadmap batch 7): the goal picker for an account with no habits, and installing the app.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const inApp = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`, 5000);
  const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(350); };
  const empty = async () => { await boot({ seed: signedIn({ mock_fb_db: { habits: {}, users: { 'u-test': { xp: 0 } } } }) }); await inApp(); await waitFor(`!!document.querySelector('#goal-chips [data-goal]')`, 5000); await sleep(200); };
  const goal = name => click(`#goal-chips [data-goal="${name}"]`);
  const suggested = () => ev(`JSON.stringify([...document.querySelectorAll('#goal-list input')].map(i => [i.closest('li').querySelector('.goal-name').textContent.trim(), i.checked]))`).then(JSON.parse);
  const habits = () => ev(`JSON.stringify(Object.values(__mockDB.habits).map(h => ({ name: h.name, target: h.target || null, schedule: h.schedule || null, done: h.completedDates.length })))`).then(JSON.parse);

  // ── 64: a goal picker that suggests first habits ─────────
  scenario('goals: a new account picks what it wants more of, and gets first habits suggested', async () => {
    await empty();
    check('the empty Home asks what you want more of', (await visible('#goal-picker')) && /What do you want more of/.test(await trim('#goal-picker')));
    check('eight goals, as buttons that say whether they are picked', await ev(`(() => { const b = [...document.querySelectorAll('#goal-chips [data-goal]')]; return b.length === 8 && b.every(x => x.tagName === 'BUTTON' && x.getAttribute('aria-pressed') === 'false'); })()`));
    check('nothing is suggested until a goal is picked', !(await visible('#goal-suggest')));
    await goal('Fitness');
    let s = await suggested();
    check('one goal suggests three habits, all ticked', (await visible('#goal-suggest')) && s.length === 3 && s.every(x => x[1]) && s[0][0] === 'Walk', JSON.stringify(s));
    check('each suggestion says how often and how much', /8,?000 steps/.test(await trim('#goal-list li')), await trim('#goal-list li'));
    check('the button counts them', (await trim('#goal-add')) === 'Add 3 habits');
    await goal('Calm');
    s = await suggested();
    check('a second goal brings the list to four, taking turns', s.length === 4 && (await ev(`document.querySelector('#goal-chips [data-goal="Calm"]').getAttribute('aria-pressed')`)) === 'true', JSON.stringify(s));
    await click('#goal-list li:last-child input');
    check('unticking one changes the count', (await trim('#goal-add')) === 'Add 3 habits' && (await suggested()).filter(x => x[1]).length === 3);
    await ev(`document.querySelectorAll('#goal-list input:checked').forEach(i => i.click())`); await sleep(200);
    check('with none ticked there is nothing to add', await ev(`document.getElementById('goal-add').disabled`));
    await ev(`document.querySelectorAll('#goal-list input').forEach((i, n) => { if (n < 2) i.click(); })`); await sleep(200);
    const want = (await suggested()).filter(x => x[1]).map(x => x[0]);
    await click('#goal-add'); await sleep(600);
    const made = await habits();
    check('Add makes exactly the ticked habits', made.length === 2 && want.every(n => made.some(h => h.name === n)), JSON.stringify(made));
    check('with the goal and schedule the library gives them', made.some(h => h.name === 'Walk' && h.target && h.target.amount === 8000), JSON.stringify(made));
    check('none of them is marked done', made.every(h => h.done === 0));
    check('Home shows them, and the picker is gone', (await ev(`document.querySelectorAll('#habits .habit-item').length`)) === 2 && !(await visible('#goal-picker')));
    check('it says what happened', await ev(`[...document.querySelectorAll('.toast')].some(t => /2 habits added/.test(t.textContent))`));
    const ev1 = JSON.parse(await ev(`JSON.stringify((window.__mockEvents || []).filter(e => e.name === 'goals_picked'))`));
    check('analytics gets counts only, never names', ev1.length === 1 && ev1[0].params.goals === 2 && ev1[0].params.habits === 2 && !/Walk|Stretch/.test(JSON.stringify(ev1)), JSON.stringify(ev1));
    noExceptions();
  });

  scenario('goals: the picker is only for an account with no habits, and fits a phone', async () => {
    await empty();
    check('the ready-made sets are still offered below it', (await ev(`document.querySelectorAll('#starter-packs .pack-card').length`)) === 4);
    await goal('Focus'); await goal('Focus');
    check('unpicking the only goal puts the suggestions away', !(await visible('#goal-suggest')) && (await ev(`document.querySelector('#goal-chips [data-goal="Focus"]').getAttribute('aria-pressed')`)) === 'false');
    await size(320, 640); await sleep(300);
    await goal('Energy');
    check('at 320px nothing overflows and every control is thumb-sized', (await ev(`document.documentElement.scrollWidth <= innerWidth`)) && await ev(`[...document.querySelectorAll('#goal-chips button, #goal-add, #goal-list label')].every(b => b.getBoundingClientRect().height >= 44)`));
    await boot({ seed: signedIn({ mock_fb_db: { habits: { a: { userId: 'u-test', name: 'Read', category: 'reading', frequency: 'daily', completedDates: [], createdAt: new Date().toISOString(), order: 1 } } } }) }); await inApp(); await sleep(500);
    check('an account that already has a habit never sees the picker', !(await visible('#goal-picker')) && !(await visible('#empty-state')));
    noExceptions();
  });
};
