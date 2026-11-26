// Looking back (roadmap batch 4): the one-tap mood note, the end-of-day recap, perfect weeks on the week strip.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const dayIn = (n, tz = 'Africa/Lagos') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(Date.now() - n * 864e5);
  const day = n => dayIn(n);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, habitly_recap: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 1, frozenDates: [], ...user } } } });
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
  // ── 34: an end-of-day recap ──────────────────────────────
  const ZONES = ['Pacific/Kiritimati', 'Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/Moscow',
    'Europe/Berlin', 'Europe/London', 'Africa/Lagos', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Pago_Pago'];
  const hourIn = tz => +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date());
  const pickZone = (lo, hi) => ZONES.find(z => hourIn(z) >= lo && hourIn(z) <= hi);
  const daytime = pickZone(8, 18);                             // a zone where it is plainly not evening, so no card is raised
  const moment = () => ev(`(() => { const m = document.getElementById('moment'); return m && !m.classList.contains('hidden') && getComputedStyle(m).display !== 'none' ? m.dataset.moment : ''; })()`);
  const momentBtn = label => `[...document.querySelectorAll('#moment button')].find(b => b.textContent.trim() === ${JSON.stringify(label)})`;
  const reload = async () => { await ev(`location.reload()`); await sleep(500); await waitFor(`!!window.__mockDB && !!document.querySelector('#page-home .habit-item')`); await sleep(900); };

  scenario('recap: the ring opens the day in review, and habits can be finished from it', async () => {
    const d = n => dayIn(n, daytime);
    await boot({ tz: daytime, mobile: false, seed: seed({
      a: H('Read', { completedDates: [d(0), d(1), d(2)], completedTimestamps: { [d(0)]: Date.now() - 5000 }, moods: { [d(0)]: 4 } }),
      b: H('Run <b>far</b>', { order: 2 }),
      w: H('Water', { order: 3, target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [d(0)]: 3 } }),
      p: H('Swim', { order: 4, pauses: [{ from: d(3) }] }),
      k: H('Call home', { order: 5, frequency: 'weekly' }),
    }) }); await rows(); await sleep(500);
    check('the ring on Home is a button that says it opens the recap', await ev(`(() => { const r = document.getElementById('today-ring'); return r.tagName === 'BUTTON' && /habits done today/.test(r.getAttribute('aria-label')) && /recap/i.test(r.getAttribute('aria-label')); })()`), await ev(`document.getElementById('today-ring').getAttribute('aria-label')`));
    await ev(`document.getElementById('today-ring').focus(); document.getElementById('today-ring').click()`); await sleep(450);
    check('it opens the recap', await open('recap-modal'));
    check('a named dialog headed by the date', await ev(`(() => { const m = document.getElementById('recap-modal'); return m.getAttribute('role') === 'dialog' && /^[A-Z][a-z]+day [0-9]{1,2} [A-Z][a-z]+$/.test(document.getElementById(m.getAttribute('aria-labelledby')).textContent.trim()); })()`), await text('#recap-title'));
    check('Close has the focus, so a stray Enter completes nothing', await ev(`document.activeElement === document.getElementById('recap-close')`));
    check('it counts what was done against what was there to do', (await text('#recap-count')).trim() === '1 of 4 done', await text('#recap-count'));
    check('XP earned today', (await text('#recap-xp')).trim() === '+25', await text('#recap-xp'));
    check('the streak', (await text('#recap-streak')).trim() === '3 days', await text('#recap-streak'));
    check('and what tomorrow holds (paused and weekly habits are not counted)', (await text('#recap-tomorrow')).trim() === '3 habits', await text('#recap-tomorrow'));
    const done = await ev(`[...document.querySelectorAll('#recap-done li')].map(li => li.innerText.replace(/\\s+/g, ' ').trim())`);
    check('the done list has Read, with how it felt', done.length === 1 && /^Read/.test(done[0]) && /Felt good/.test(done[0]) && await ev(`!!document.querySelector('#recap-done use[href="#i-mood-4"]')`), JSON.stringify(done));
    check('how the day felt is summed up', /good/.test(await text('#recap-mood')), await text('#recap-mood'));
    const still = await ev(`[...document.querySelectorAll('#recap-open li')].map(li => li.querySelector('.rc-name').innerText.replace(/\\s+/g, ' ').trim())`);
    check('still open: Run, Water with its count, and the weekly habit; not the paused one', still.length === 3 && still[0] === 'Run <b>far</b>' && /Water 3 \/ 8 glasses/.test(still[1]) && still[2] === 'Call home', JSON.stringify(still));
    check('a name with HTML in it is shown as text', !(await ev(`!!document.querySelector('#recap-modal b')`)));
    await ev(`document.querySelector('#recap-open [data-recap-complete="b"]').click()`); await sleep(900);
    check('Complete finishes a habit from the recap', await ev(`__mockDB.habits.b.completedDates.includes(${JSON.stringify(d(0))})`));
    check('and the recap keeps up', (await text('#recap-count')).trim() === '2 of 4 done' && (await text('#recap-xp')).trim() === '+50', (await text('#recap-count')) + ' ' + (await text('#recap-xp')));
    await size(320, 568); await sleep(200);
    check('320px: nothing spills sideways, the stats stay on one row', await ev(`(() => { const dlg = document.querySelector('#recap-modal .dialog'); const tops = [...document.querySelectorAll('#recap-modal .recap-stats > div')].map(x => Math.round(x.getBoundingClientRect().top));
      return document.documentElement.scrollWidth <= innerWidth && dlg.scrollWidth <= dlg.clientWidth + 1 && new Set(tops).size === 1; })()`));
    await key('Escape'); await sleep(300);
    check('Escape closes it', !(await open('recap-modal')));
    noExceptions();
  });

  scenario('recap: offered once in the evening, through the card, and never in the morning', async () => {
    const evening = pickZone(20, 23), morning = pickZone(6, 11);
    if (!evening || !morning) return check('an evening and a morning timezone exist right now', false);
    const two = tz => ({ a: H('Read', { completedDates: [dayIn(0, tz), dayIn(1, tz)], completedTimestamps: { [dayIn(0, tz)]: Date.now() - 4000000 } }), b: H('Run', { order: 2, completedDates: [dayIn(1, tz)] }) });
    await boot({ tz: evening, seed: seed(two(evening)) }); await rows(); await sleep(900);
    check('evening: the card offers the recap', (await moment()) === 'recap', await moment());
    check('it says how the day stands', /1 of 2 done today/.test(await text('#moment-text')), await text('#moment-text'));
    check('the list is still usable behind it', await ev(`(() => { const cb = document.querySelector('.habit-item[data-id="b"] .habit-check'); const r = cb.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === cb; })()`));
    await ev(`${momentBtn('See recap')}.click()`); await sleep(450);
    check('See recap opens it and puts the card away', (await open('recap-modal')) && (await moment()) === '');
    await ev(`document.getElementById('recap-close').click()`); await sleep(300);
    await reload();
    check('it is offered once a day: not again after a reload', (await moment()) === '');
    await boot({ tz: morning, seed: seed(two(morning)) }); await rows(); await sleep(900);
    check('morning: no card', (await moment()) === '');
    await boot({ tz: evening, seed: seed({ a: H('Swim', { pauses: [{ from: dayIn(5, evening) }] }) }) }); await sleep(1500);
    check('evening with nothing due today: no card', (await moment()) === '');
    noExceptions();
  });

  scenario('recap: the all-done card leads to it', async () => {
    await boot({ tz: daytime, seed: seed({ a: H('Read') }, { xp: 75 }) }); await rows(); await sleep(300);   // this tap also reaches level 2
    await tick('a');
    check('the all-done card shows', await waitFor(`!document.getElementById('all-done-overlay').classList.contains('hidden')`, 3000));
    check('with a link to the recap', await ev(`(() => { const b = document.getElementById('all-done-recap'); return !!b && b.tagName === 'BUTTON' && b.getBoundingClientRect().height >= 44; })()`));
    await ev(`document.getElementById('all-done-recap').click()`); await sleep(500);
    check('which opens in its place', (await open('recap-modal')) && !(await open('all-done-overlay')));
    check('a full day shows the bonus', (await text('#recap-count')).trim() === '1 of 1 done' && (await text('#recap-xp')).trim() === '+125' && /Full day/.test(await text('#recap-modal .recap-bonus')), await text('#recap-xp'));
    check('nothing is left open', (await ev(`document.querySelectorAll('#recap-open li').length`)) === 0);
    await sleep(1200);
    check('the level-up card waits behind the recap instead of opening on top of it', !(await open('level-up-modal')));
    await ev(`document.getElementById('recap-close').click()`);
    check('and comes once the recap is closed', await waitFor(`!document.getElementById('level-up-modal').classList.contains('hidden')`, 2500));
    await ev(`document.getElementById('level-up-claim-btn').click()`); await sleep(300);
    noExceptions();
  });
  scenario('recap: the evening offer has a switch in Profile', async () => {
    const evening = pickZone(20, 23);
    if (!evening) return check('an evening timezone exists right now', false);
    const two = tz => ({ a: H('Read', { completedDates: [dayIn(1, tz)] }), b: H('Run', { order: 2, completedDates: [dayIn(1, tz)] }) });
    await boot({ tz: evening, seed: seed(two(evening), {}, { habitly_recap: 'off' }) }); await rows(); await sleep(900);
    check('switched off: no card in the evening', (await moment()) === '');
    check('the ring still opens the recap by hand', await ev(`(() => { document.getElementById('today-ring').click(); return !document.getElementById('recap-modal').classList.contains('hidden'); })()`));
    await ev(`document.getElementById('recap-close').click()`); await sleep(300);
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('Profile has the switch, showing it is off', await ev(`(() => { const t = document.getElementById('recap-toggle'); return !!t && t.type === 'checkbox' && !t.checked && !!t.getAttribute('aria-label'); })()`));
    await ev(`document.getElementById('recap-toggle').click()`); await sleep(200);
    check('switching it on is remembered', (await ev(`localStorage.getItem('habitly_recap')`)) === 'on');
    await boot({ tz: evening, seed: seed(two(evening)) }); await rows(); await sleep(900);
    check('it is on unless switched off', (await moment()) === 'recap' && await ev(`(() => { location.hash = '#profile'; return true; })()`));
    await sleep(400);
    check('and Profile shows it on', await ev(`document.getElementById('recap-toggle').checked`));
    noExceptions();
  });
  // ── 39: perfect weeks and months on the week strip ───────
  const done = (from, to, tz) => { const out = {}; const dates = []; for (let n = from; n <= to; n++) dates.push(dayIn(n, tz)); return { completedDates: dates, completedTimestamps: { [dayIn(0, tz)]: Date.now() - 4000000 } }; };
  const strip = () => ev(`JSON.stringify((() => { const w = document.getElementById('week-strip'), n = document.getElementById('week-note'); const line = getComputedStyle(w, '::before');
    return { perfect: w.classList.contains('is-perfect'), label: w.getAttribute('aria-label'), note: n && !n.classList.contains('hidden') && getComputedStyle(n).display !== 'none' ? n.textContent.trim() : '', line: line.content !== 'none' && line.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(line.height) > 0 }; })())`).then(JSON.parse);
  const toastSays = re => ev(`[...document.querySelectorAll('.toast')].filter(t => ${re}.test(t.textContent)).length`);

  scenario('perfect week: seven days with nothing missed join up on the week strip', async () => {
    await boot({ tz: daytime, mobile: false, seed: seed({ a: H('Read', done(0, 6, daytime)), b: H('Run', { order: 2, ...done(0, 6, daytime) }) }) }); await rows(); await sleep(600);
    let s = await strip();
    check('the strip is marked perfect and its dots are joined by a line', s.perfect && s.line, JSON.stringify(s));
    check('a note under it says so', /^Perfect week: 7 days, nothing missed$/.test(s.note), s.note);
    check('and so does its label for screen readers', s.label === 'Last 7 days. Perfect week', s.label);
    check('all seven dots are full', (await ev(`document.querySelectorAll('#week-strip .wk-day.full').length`)) === 7);
    await sleep(2200);
    check('a week that was already perfect is not announced on opening the app', (await toastSays('/Perfect week/')) === 0);
    await boot({ tz: daytime, mobile: false, colorScheme: 'dark', seed: seed({ a: H('Read', done(0, 5, daytime)), b: H('Run', { order: 2, ...done(0, 5, daytime) }) }) }); await rows(); await sleep(600);
    s = await strip();
    check('six days is not a perfect week: no line, no note, plain label', !s.perfect && !s.line && s.note === '' && s.label === 'Last 7 days', JSON.stringify(s));
    check('and the note takes no room when it has nothing to say', await ev(`document.getElementById('week-note').getBoundingClientRect().height === 0`));
    noExceptions();
  });

  scenario('perfect week: reaching it is said once, rest days do not break it, and thirty days is a month', async () => {
    const six = () => { const dates = []; for (let n = 1; n <= 6; n++) dates.push(dayIn(n, daytime)); return { completedDates: dates }; };
    await boot({ tz: daytime, mobile: false, seed: seed({ a: H('Read', six()), b: H('Run', { order: 2, ...six() }) }) }); await rows(); await sleep(600);
    check('six perfect days and today still open: not yet', !(await strip()).perfect);
    await tick('a'); await sleep(900);
    check('one of two done today: still not', !(await strip()).perfect);
    await tick('b'); await sleep(900);
    const s = await strip();
    check('finishing today makes the seventh perfect day', s.perfect && /Perfect week/.test(s.note), JSON.stringify(s));
    check('and that is announced', await waitFor(`[...document.querySelectorAll('.toast')].some(t => /Perfect week\\. Seven days, nothing missed\\./.test(t.textContent))`, 4000));
    check('once', (await toastSays('/Perfect week/')) === 1);
    await ev(`document.getElementById('all-done-close')?.click()`); await sleep(300);

    const wd = new Date(dayIn(0, daytime) + 'T12:00:00Z').getUTCDay();
    const restDays = [(wd + 6) % 7, (wd + 5) % 7];             // yesterday and the day before are rest days
    const workDays = [0, 1, 2, 3, 4, 5, 6].filter(x => !restDays.includes(x));
    const dates = []; for (let n = 0; n <= 8; n++) if (workDays.includes(new Date(dayIn(n, daytime) + 'T12:00:00Z').getUTCDay())) dates.push(dayIn(n, daytime));
    await boot({ tz: daytime, mobile: false, seed: seed({ a: H('Gym', { schedule: { type: 'days', days: workDays }, completedDates: dates, completedTimestamps: { [dayIn(0, daytime)]: Date.now() - 4000000 } }) }) }); await rows(); await sleep(600);
    check('two rest days inside the week do not break it', (await strip()).perfect, JSON.stringify(await strip()));

    await boot({ tz: daytime, seed: seed({ a: H('Read', done(0, 29, daytime)) }) }); await rows(); await sleep(400);
    await ev(`document.getElementById('summary-toggle').click()`); await sleep(400);
    const m = await strip();
    check('thirty days with nothing missed is a perfect month', m.perfect && /^Perfect month: 30 days, nothing missed$/.test(m.note) && m.label === 'Last 7 days. Perfect month', JSON.stringify(m));
    check('phone: the open summary still fits the screen width', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    await ev(`document.getElementById('summary-toggle').click()`); await sleep(400);
    check('phone: with the summary folded, the first habit still starts near the top', await ev(`document.querySelector('#habits .habit-item').getBoundingClientRect().top <= 320`), String(await ev(`document.querySelector('#habits .habit-item').getBoundingClientRect().top`)));
    noExceptions();
  });
};
