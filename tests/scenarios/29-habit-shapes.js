// What a habit can be (roadmap batch 3): a cue, a schedule, a measurable target.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const openNew = async () => { await ev(`document.getElementById('new-habit-toggle').click()`); await sleep(450); };
  const openEdit = async id => { await ev(`document.querySelector('.habit-item[data-id="${id}"] [data-action="edit"]').click()`); await sleep(450); };
  const setField = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const save = async () => { await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(500); };
  const byName = name => ev(`Object.keys(__mockDB.habits).find(k => __mockDB.habits[k].name === ${JSON.stringify(name)})`);
  const privacy = () => fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');

  // ── 29: a cue for each habit ─────────────────────────────
  scenario('cue: a habit can say what triggers it, and the row shows it', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Stretch', { order: 2, cue: 'After I pour my coffee' }) }) }); await rows(); await sleep(300);
    check('a habit with a cue shows it under its name', (await ev(`document.querySelector('.habit-item[data-id="b"] .habit-cue').textContent.trim()`)) === 'After I pour my coffee');
    check('a habit without one has no empty line', (await ev(`document.querySelectorAll('.habit-item[data-id="a"] .habit-cue').length`)) === 0);
    await openNew();
    await setField('habit-input', 'Floss'); await setField('habit-category', 'health');
    await setField('habit-cue', '  After I brush my teeth  '); await sleep(150);
    check('the preview shows the cue as it is typed', /After I brush my teeth/.test(await ev(`document.getElementById('habit-preview').innerText`)));
    await save();
    const id = await byName('Floss');
    check('it is saved, trimmed', (await ev(`__mockDB.habits[${JSON.stringify(id)}].cue`)) === 'After I brush my teeth');
    check('the field cannot take more than 80 characters', (await ev(`document.getElementById('habit-cue').maxLength`)) === 80);
    await openNew();
    await setField('habit-input', 'Tricky'); await setField('habit-category', 'health'); await setField('habit-cue', '<img src=x onerror="window.__cue=1">'); await save();
    check('markup in a cue is shown as text, never run', await ev(`!window.__cue && document.querySelectorAll('#page-home .habit-cue img').length === 0`));
    check('a habit made with no cue stores nothing', await ev(`!('cue' in __mockDB.habits.a)`));
    noExceptions();
  });

  scenario('cue: it can be edited away, fits a small phone, and appears in focus view', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Stretch', { order: 2, cue: 'After I pour my coffee and sit down at the desk by the window in the morning light' }) }), mobile: false }); await rows(); await sleep(300);
    await openEdit('b');
    check('Edit shows the saved cue', /After I pour my coffee/.test(await ev(`document.getElementById('habit-cue').value`)));
    await setField('habit-cue', ''); await save();
    check('clearing it removes the field', await ev(`!('cue' in __mockDB.habits.b)`));
    await boot({ seed: seed({ a: H('Read', { cue: 'After lunch' }), b: H('Stretch', { order: 2, cue: 'After I pour my coffee and sit down at the desk by the window in the morning light' }) }) }); await size(320, 568); await rows(); await sleep(300);
    check('320px: a long cue is cut short, with no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth && (() => { const e = document.querySelector('.habit-item[data-id="b"] .habit-cue'); return e.scrollWidth > e.clientWidth && e.getBoundingClientRect().height < 24; })()`));
    await ev(`document.getElementById('focus-open').click()`); await sleep(450);
    check('focus view shows the cue for the habit on screen', (await ev(`document.getElementById('focus-cue').textContent.trim()`)) === 'After lunch');
    check('the privacy policy mentions the cue', /cue/i.test(privacy()));
    noExceptions();
  });

  // ── 22: schedules ────────────────────────────────────────
  const wd = n => new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) + 'T12:00:00Z').getUTCDay() + n;   // weekday number, today + n
  const today = () => ((wd(0) % 7) + 7) % 7, tomorrow = () => ((wd(1) % 7) + 7) % 7, yesterday = () => ((wd(-1) % 7) + 7) % 7;
  const dayChip = d => `document.querySelector('#schedule-days input[value="${d}"]')`;
  const setDays = days => ev(`(() => { document.querySelectorAll('#schedule-days input').forEach(i => { i.checked = ${JSON.stringify(days)}.includes(+i.value); }); document.querySelector('#schedule-days input').dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const inToday = name => ev(`[...document.querySelectorAll('#habits .habit-item .habit-name')].some(n => n.textContent.trim() === ${JSON.stringify(name)})`);

  scenario('schedule: a habit can be for chosen weekdays, and only appears on them', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await openNew();
    await setField('habit-input', 'Gym'); await setField('habit-category', 'fitness');
    check('a daily habit offers the seven weekdays, all on to begin with', (await ev(`[...document.querySelectorAll('#schedule-days input')].filter(i => i.checked).length`)) === 7 && await visible('#schedule-days'));
    check('each day has a name and is a 44px target', await ev(`[...document.querySelectorAll('#schedule-days label')].every(l => l.textContent.trim().length >= 2 && l.getBoundingClientRect().height >= 44)`));
    await setDays([today(), (today() + 2) % 7]); await sleep(150);
    check('the preview says which days', /2 days a week|days a week/i.test(await ev(`document.getElementById('habit-preview').innerText`)), await ev(`document.getElementById('habit-preview').innerText.replace(/\\s+/g, ' ')`));
    await save();
    const gym = await byName('Gym');
    check('the schedule is saved, and the habit stays in the daily bucket', (await ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(gym)}].schedule) + '|' + __mockDB.habits[${JSON.stringify(gym)}].frequency`)) === JSON.stringify({ type: 'days', days: [today(), (today() + 2) % 7].sort((x, y) => x - y) }) + '|daily');
    check('it is in Today, because today is one of its days', await inToday('Gym'));
    await openNew();
    await setField('habit-input', 'Rest-day habit'); await setField('habit-category', 'health'); await setDays([tomorrow()]); await save();
    check('a habit not due today is not in the Today list', !(await inToday('Rest-day habit')));
    check('Today says quietly that one habit rests today', /1 habit rests today/i.test(await ev(`document.getElementById('rest-note').textContent`)) && await visible('#rest-note'));
    check('the ring counts only what is due', /of 2/.test(await ev(`document.getElementById('summary-toggle').textContent`)), await ev(`document.getElementById('bar-count').textContent`));
    await ev(`document.getElementById('rest-note').click()`); await sleep(250);
    check('tapping it lists the resting habits, with nothing to tick', (await ev(`document.querySelectorAll('#habits-rest .habit-item').length`)) === 1 && (await ev(`document.querySelectorAll('#habits-rest .habit-check:not(:disabled)').length`)) === 0);
    await openNew(); await setField('habit-input', 'No days'); await setField('habit-category', 'health'); await setDays([]); await save();
    check('choosing no days at all is refused with a reason', (await byName('No days')) === undefined && /at least one day/i.test(await ev(`(document.querySelector('#habit-sheet .field-msg') || {}).textContent || ''`)));
    noExceptions();
  });

  scenario('schedule: changing a habit\'s days keeps the streak it had earned', async () => {
    const six = [day(1), day(2), day(3), day(4), day(5), day(6)];
    await boot({ seed: seed({ a: H('Read', { completedDates: six }) }), mobile: false }); await rows(); await sleep(300);
    check('six days running to begin with', (await ev(`document.querySelector('.habit-item[data-id="a"] .streak-pill').textContent.trim()`)) === '6');
    await openEdit('a'); await setDays([today(), (today() + 3) % 7]); await save();
    check('the change is recorded with the day it took effect', await ev(`(() => { const h = __mockDB.habits.a.scheduleHistory; return Array.isArray(h) && h.length === 2 && h[0].schedule.type === 'daily' && h[1].from === ${JSON.stringify(day(0))} && h[1].schedule.type === 'days'; })()`), await ev(`JSON.stringify(__mockDB.habits.a.scheduleHistory)`));
    check('the streak earned under the old schedule is untouched', (await ev(`document.querySelector('.habit-item[data-id="a"] .streak-pill').textContent.trim()`)) === '6');
    await openEdit('a');
    check('Edit shows the days that are set', (await ev(`[...document.querySelectorAll('#schedule-days input')].filter(i => i.checked).length`)) === 2);
    await setDays([0, 1, 2, 3, 4, 5, 6]); await save();
    check('all seven days means every day again', (await ev(`__mockDB.habits.a.schedule ? __mockDB.habits.a.schedule.type : 'none'`)) !== 'days');
    check('two changes on the same day leave one entry for that day, the latest', (await ev(`(() => { const h = __mockDB.habits.a.scheduleHistory; return h.length + '|' + h[h.length - 1].schedule.type; })()`)) === '2|daily');
    noExceptions();
  });

  scenario('schedule: a habit can be several times a week, counted in This week', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await openNew();
    await setField('habit-input', 'Run'); await setField('habit-category', 'fitness'); await setField('habit-frequency', 'weekly'); await sleep(150);
    check('a weekly habit asks how many times, not which days', (await visible('#schedule-times')) && !(await visible('#schedule-days')));
    await setField('habit-times', '3'); await sleep(150);
    check('the preview says 3 times a week', /3 times a week/i.test(await ev(`document.getElementById('habit-preview').innerText`)));
    await save();
    const run = await byName('Run');
    check('it is saved as a weekly habit with a count', (await ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(run)}].schedule) + '|' + __mockDB.habits[${JSON.stringify(run)}].frequency`)) === '{"type":"times","times":3}|weekly');
    const row = `document.querySelector('.habit-item[data-id="${run}"]')`;
    check('it sits in This week and shows 0 of 3', await ev(`!!document.querySelector('#habits-week .habit-item[data-id="${run}"]')`) && /0 of 3/.test(await ev(`${row}.textContent`)));
    await ev(`${row}.querySelector('.habit-check').click()`); await waitFor(`(__mockDB.habits[${JSON.stringify(run)}].completedDates || []).length === 1`, 3000); await sleep(400);
    check('ticking it counts one: 1 of 3', /1 of 3/.test(await ev(`${row}.textContent`)), await ev(`${row}.textContent.replace(/\\s+/g, ' ')`));
    check('it shows as done for today, and the section still counts it as open for the week', (await ev(`${row}.querySelector('.habit-check').checked`)) === true && (await ev(`document.getElementById('week-count').textContent.trim()`)) === '0 of 1');
    check('XP was added once', (await ev(`__mockDB.users['u-test'].xp`)) === 325);
    noExceptions();
  });

  scenario('schedule: a times-a-week habit is done for the week once the number is reached', async () => {
    // Three completions this week already (the two earlier ones may fall in last week early in a week, so seed by week)
    const monday = (() => { const d = new Date(day(0) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; })();
    const inWeek = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(monday); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); }).filter(k => k <= day(0));
    const needed = Math.min(2, inWeek.length);          // on a Monday only one day of the week has happened
    await boot({ seed: seed({ r: H('Run', { frequency: 'weekly', schedule: { type: 'times', times: needed }, completedDates: inWeek.slice(-needed), completedTimestamps: Object.fromEntries(inWeek.slice(-needed).map(k => [k, Date.now() - 7200000])) }) }) });
    await rows(); await sleep(300);
    check('the row shows the number reached', new RegExp(`${needed} of ${needed}`).test(await ev(`document.querySelector('.habit-item[data-id="r"]').textContent`)));
    check('This week counts it as done', (await ev(`document.getElementById('week-count').textContent.trim()`)) === '1 of 1');
    check('nothing is left today', /All done|0 left/i.test(await ev(`document.getElementById('summary-line').textContent`)), await ev(`document.getElementById('summary-line').textContent`));
    noExceptions();
  });
};
