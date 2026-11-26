// Looking back (roadmap batch 4): the one-tap mood note, the end-of-day recap, perfect weeks on the week strip.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const dayIn = (n, tz = 'Africa/Lagos') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(Date.now() - n * 864e5);
  const day = n => dayIn(n);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 1, frozenDates: [], ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const open = id => ev(`!document.getElementById(${JSON.stringify(id)}).classList.contains('hidden')`);
  const tick = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-check').click()`);
  const key = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: 27 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }));
  const doneToast = `[...document.querySelectorAll('.toast')].find(t => /Completed/.test(t.textContent))`;
  const face = n => `${doneToast}.querySelector('.mood-btn[data-mood="${n}"]')`;

  // ── 37: a one-tap mood note ──────────────────────────────
  scenario('mood: the completion toast offers five faces, and one tap notes how it felt', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }) }); await rows(); await sleep(300);
    await tick('a');
    check('the toast arrives with the faces', await waitFor(`!!(${doneToast} && ${doneToast}.querySelector('.toast-moods'))`, 2500));
    const m = JSON.parse(await ev(`(() => { const row = ${doneToast}.querySelector('.toast-moods'); const b = [...row.querySelectorAll('button')]; const t = ${doneToast}.getBoundingClientRect();
      return JSON.stringify({ role: row.getAttribute('role'), label: row.getAttribute('aria-label'), names: b.map(x => x.getAttribute('aria-label')), pressed: b.map(x => x.getAttribute('aria-pressed')),
        sizes: b.map(x => Math.round(Math.min(x.getBoundingClientRect().width, x.getBoundingClientRect().height))), icons: b.map(x => (x.querySelector('use') || { getAttribute() {} }).getAttribute('href')),
        symbols: b.every(x => !!document.querySelector(x.querySelector('use').getAttribute('href'))), inView: t.left >= 0 && t.right <= innerWidth, undo: !!${doneToast}.querySelector('.toast-action'), text: ${doneToast}.textContent }); })()`));
    check('they are a labelled group of five buttons', m.role === 'group' && /feel/i.test(m.label) && m.names.join(',') === 'Awful,Hard,Okay,Good,Great', JSON.stringify(m));
    check('none is chosen to begin with', m.pressed.every(p => p === 'false'));
    check('each is a line-drawn face from the icon set', m.symbols && m.icons.join(',') === '#i-mood-1,#i-mood-2,#i-mood-3,#i-mood-4,#i-mood-5', JSON.stringify(m.icons));
    check('no emoji anywhere in the toast', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(m.text));
    check('on a phone each face is a 44px target and the toast fits the screen', m.sizes.every(s => s >= 44) && m.inView, JSON.stringify(m.sizes));
    check('Undo is still there', m.undo);
    check('the message and Undo sit on one line, level with each other', await ev(`(() => { const t = ${doneToast}; const a = t.querySelector('.toast-msg').getBoundingClientRect(), b = t.querySelector('.toast-action').getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= 4; })()`));
    check('nothing is saved until a face is tapped', await ev(`!('moods' in __mockDB.habits.a)`));
    await ev(`${face(4)}.click()`); await sleep(400);
    check('one tap saves it on the habit for today', await ev(`__mockDB.habits.a.moods[${JSON.stringify(day(0))}] === 4`), await ev(`JSON.stringify(__mockDB.habits.a.moods)`));
    check('the chosen face is marked, and the toast stays so Undo is not lost', await ev(`!!${doneToast} && ${face(4)}.getAttribute('aria-pressed') === 'true' && !!${doneToast}.querySelector('.toast-action')`));
    await ev(`${face(5)}.click()`); await sleep(400);
    check('a second tap changes it', await ev(`__mockDB.habits.a.moods[${JSON.stringify(day(0))}] === 5 && ${face(4)}.getAttribute('aria-pressed') === 'false'`));
    await ev(`${doneToast}.querySelector('.toast-action').click()`); await sleep(700);
    check('Undo takes the completion back, and the note with it', await ev(`__mockDB.habits.a.completedDates.length === 0 && !(__mockDB.habits.a.moods && ${JSON.stringify(day(0))} in __mockDB.habits.a.moods)`), await ev(`JSON.stringify(__mockDB.habits.a)`));
    await tick('b'); await sleep(7000);
    check('ignoring the faces saves nothing', await ev(`__mockDB.habits.b.completedDates.length === 1 && !('moods' in __mockDB.habits.b)`));
    noExceptions();
  });

  scenario('mood: it can be switched off, it feeds insights, and odd data is ignored', async () => {
    const d = n => day(n);
    await boot({ seed: seed({
      a: H('Run <i>fast</i>', { completedDates: run(1, 4), moods: { [d(1)]: 5, [d(2)]: 5, [d(3)]: 4, banana: 1, [d(9)]: 1 } }),
      t: H('Taxes', { order: 2, completedDates: run(1, 3), moods: { [d(1)]: 1, [d(2)]: 2, [d(3)]: 2 } }),
      j: H('Junk', { order: 3, completedDates: run(1, 3), moods: 'nope' }),
      k: H('Two notes', { order: 4, completedDates: run(1, 3), moods: { [d(1)]: 1, [d(2)]: 9, [d(3)]: 1.5 } }),
    }) }); await rows(); await sleep(300);
    await ev(`location.hash = '#stats'`); await sleep(900);
    const ins = await ev(`[...document.querySelectorAll('#insights-list li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())`);
    check('insights say which habit feels best', ins.some(t => /Run <i>fast<\/i>/.test(t) && /feels best/.test(t) && /4\.7 out of 5/.test(t)), JSON.stringify(ins));
    check('and which has felt hard', ins.some(t => /Taxes/.test(t) && /felt hard/.test(t) && /1\.7 out of 5/.test(t)), JSON.stringify(ins));
    check('a name with HTML in it is shown as text', !(await ev(`!!document.querySelector('#insights-list i')`)));
    check('habits with junk or too few notes are left out', !ins.some(t => /Junk|Two notes/.test(t) && /feel|felt/.test(t)));
    check('the insight uses a drawn face', await ev(`!!document.querySelector('#insights-list use[href="#i-mood-5"]')`));
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('Profile has a switch for it, on by default', await ev(`(() => { const t = document.getElementById('mood-toggle'); return !!t && t.type === 'checkbox' && t.checked && !!t.getAttribute('aria-label'); })()`));
    await ev(`document.getElementById('mood-toggle').click()`); await sleep(200);
    check('switching it off is remembered', (await ev(`localStorage.getItem('habitly_mood')`)) === 'off');
    await ev(`location.hash = '#home'`); await sleep(400);
    await tick('j');
    check('the toast still arrives', await waitFor(`!!${doneToast}`, 2500));
    check('without the faces', await ev(`!${doneToast}.querySelector('.toast-moods')`));
    const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
    check('the privacy policy says how a completion felt may be stored', /how a completion felt/.test(privacy) && /optional/.test(privacy));
    noExceptions();
  });
};
