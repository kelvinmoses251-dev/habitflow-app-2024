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

  // ── 23: measurable targets ───────────────────────────────
  const xp = () => ev(`__mockDB.users['u-test'].xp`);
  const count = id => ev(`(document.querySelector('.habit-item[data-id="${id}"] .target-count') || {}).textContent`);
  const stepUp = async id => { await ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-step').click()`); await sleep(250); };
  const stepDown = async id => { await ev(`document.querySelector('.habit-item[data-id="${id}"] [data-action="step-down"]').click()`); await sleep(250); };
  const prog = id => ev(`(__mockDB.habits[${JSON.stringify(id)}].progress || {})[${JSON.stringify(day(0))}]`);
  const doneToday = id => ev(`(__mockDB.habits[${JSON.stringify(id)}].completedDates || []).includes(${JSON.stringify(day(0))})`);
  const water = (o = {}) => H('Water', { order: 2, target: { amount: 3, unit: 'glasses' }, progress: { [day(0)]: 1 }, ...o });

  scenario('target: a counting habit fills one tap at a time and completes on the last', async () => {
    await boot({ seed: seed({ a: H('Read'), w: water() }) }); await rows(); await sleep(300);
    check('a counting habit shows a + button in place of the tick box', await ev(`(() => { const r = document.querySelector('.habit-item[data-id="w"]'); const b = r.querySelector('.habit-step'); return !!b && b.getClientRects().length > 0 && r.querySelector('.habit-check').getClientRects().length === 0; })()`));
    check('an ordinary habit keeps its tick box', await ev(`!document.querySelector('.habit-item[data-id="a"] .habit-step') && document.querySelector('.habit-item[data-id="a"] .habit-check').getClientRects().length > 0`));
    check('the row says how far along it is', (await count('w')) === '1 / 3 glasses', await count('w'));
    check('the button says what it does and where things stand', /Add 1.*Water.*1 of 3 glasses/.test(await ev(`document.querySelector('.habit-item[data-id="w"] .habit-step').getAttribute('aria-label')`)));
    const ring = () => ev(`+document.querySelector('.habit-item[data-id="w"] .step-ring .fill').getAttribute('stroke-dashoffset')`);
    const before = await ring();
    await stepUp('w');
    check('+ adds one and saves it', (await prog('w')) === 2, await prog('w'));
    check('the label follows', (await count('w')) === '2 / 3 glasses');
    check('the ring fills further', (await ring()) < before, `${before} -> ${await ring()}`);
    check('part of the way is not done: no completion, no XP', !(await doneToday('w')) && (await xp()) === 300);
    await stepUp('w');
    check('the last step completes the habit', await waitFor(`(__mockDB.habits.w.completedDates || []).includes(${JSON.stringify(day(0))})`, 3000));
    check('with the count at the target', (await prog('w')) === 3);
    check('and 25 XP, once', await waitFor(`__mockDB.users['u-test'].xp === 325`, 3000), await xp());
    check('the row shows it done', await ev(`document.querySelector('.habit-item[data-id="w"] .habit-name').classList.contains('done') && document.querySelector('.habit-item[data-id="w"] .habit-step').classList.contains('is-done')`));
    await stepUp('w'); await stepUp('w'); await sleep(500);
    check('tapping again adds nothing', (await prog('w')) === 3 && (await xp()) === 325);
    check('the toast offers Undo', /Undo/.test(await ev(`(document.querySelector('#toast-container .toast-action') || {}).textContent || ''`)));
    await ev(`document.querySelector('#toast-container .toast-action').click()`); await sleep(700);
    check('Undo takes back the last step only', !(await doneToday('w')) && (await prog('w')) === 2, await prog('w'));
    check('and the 25 XP', (await xp()) === 300, await xp());
    check('the row is open again at 2 / 3', (await count('w')) === '2 / 3 glasses' && await ev(`!document.querySelector('.habit-item[data-id="w"] .habit-step').classList.contains('is-done')`));
    noExceptions();
  });

  scenario('target: the minus step takes one back, and a finished count locks after an hour', async () => {
    const now = Date.now();
    await boot({ seed: seed({
      w: water({ progress: { [day(0)]: 3 }, completedDates: [day(0)], completedTimestamps: { [day(0)]: now - 10 * 60000 } }),
      x: H('Pages', { order: 3, target: { amount: 20, unit: 'pages', step: 5 }, progress: { [day(0)]: 20 }, completedDates: [day(0)], completedTimestamps: { [day(0)]: now - 2 * 3600000 } }),
      y: H('Steps', { order: 4, target: { amount: 2000, unit: 'ml', step: 750 }, progress: { [day(0)]: 750 } }),
      z: H('Fresh', { order: 5, target: { amount: 4, unit: '' } }),
      a: H('Read', { order: 6 }),
    }), mobile: false }); await rows(); await sleep(300);
    check('a counting habit with something counted has a minus action', await ev(`!!document.querySelector('.habit-item[data-id="y"] [data-action="step-down"]')`));
    check('one with nothing counted, and an ordinary habit, do not', await ev(`!document.querySelector('.habit-item[data-id="z"] [data-action="step-down"]') && !document.querySelector('.habit-item[data-id="a"] [data-action="step-down"]')`));
    check('a count with no unit reads cleanly', (await count('z')) === '0 / 4', await count('z'));
    check('big numbers are easy to read', (await count('y')) === '750 / 2,000 ml', await count('y'));
    await stepDown('w'); await sleep(600);
    check('minus within the hour re-opens the habit one step back', !(await doneToday('w')) && (await prog('w')) === 2, await prog('w'));
    check('and refunds the 25 XP', (await xp()) === 275, await xp());
    await stepDown('x'); await sleep(600);
    check('after an hour the finished count is locked', (await doneToday('x')) && (await prog('x')) === 20 && (await xp()) === 275);
    check('and the app says why', /Locked/.test(await ev(`document.getElementById('toast-container').innerText`)));
    await stepDown('y');
    check('minus on a part-way count removes a step and stores nothing at zero', await ev(`!(${JSON.stringify(day(0))} in (__mockDB.habits.y.progress || {}))`), await prog('y'));
    await stepUp('y'); await stepUp('y');
    check('steps of 750 towards 2,000 go 750, 1,500', (await prog('y')) === 1500, await prog('y'));
    await stepUp('y');
    check('and the last step stops at the target, not past it', await waitFor(`(__mockDB.habits.y.progress || {})[${JSON.stringify(day(0))}] === 2000 && (__mockDB.habits.y.completedDates || []).length === 1`, 3000), await prog('y'));
    noExceptions();
  });

  scenario('target: the sheet sets a goal, checks it, and shows it in the preview', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await openNew();
    await setField('habit-input', 'Water'); await setField('habit-category', 'health');
    await setField('habit-target-amount', '8'); await setField('habit-target-unit', 'glasses'); await sleep(150);
    check('the preview shows the count as it will look', /0 \/ 8 glasses/.test(await ev(`document.getElementById('habit-preview').innerText`)), await ev(`document.getElementById('habit-preview').innerText`));
    await save();
    const id = await byName('Water');
    check('the goal is saved', JSON.stringify(await ev(`__mockDB.habits[${JSON.stringify(id)}].target`)) === JSON.stringify({ amount: 8, unit: 'glasses', step: 1 }), JSON.stringify(await ev(`__mockDB.habits[${JSON.stringify(id)}].target`)));
    check('the new row counts from zero', (await count(id)) === '0 / 8 glasses');
    check('a habit made without a goal stores none', await ev(`!('target' in __mockDB.habits.a)`));
    const fieldMsg = () => ev(`[...document.querySelectorAll('#habit-sheet .field-msg')].map(m => m.textContent).join(' | ')`);
    const habitCount = () => ev(`Object.keys(__mockDB.habits).length`);
    const n = await habitCount();
    await openNew(); await setField('habit-input', 'Bad unit'); await setField('habit-category', 'health');
    await setField('habit-target-amount', '5'); await setField('habit-target-unit', 'x'.repeat(60)); await save();
    check('a 60-character unit is refused with a reason', /12 characters/.test(await fieldMsg()) && (await habitCount()) === n && await visible('#habit-sheet'), await fieldMsg());
    await setField('habit-target-unit', 'cups'); await setField('habit-target-amount', '0'); await save();
    check('zero is refused', /1 to 100,000/.test(await fieldMsg()) && (await habitCount()) === n, await fieldMsg());
    await setField('habit-target-amount', '1000000'); await save();
    check('a million is refused', /1 to 100,000/.test(await fieldMsg()) && (await habitCount()) === n);
    await setField('habit-target-amount', ''); await save();
    check('a unit with no number is refused', /number for the goal/.test(await fieldMsg()) && (await habitCount()) === n, await fieldMsg());
    await setField('habit-target-amount', '2000'); await setField('habit-target-unit', 'ml'); await setField('habit-target-step', '5000'); await save();
    check('a step bigger than the goal is refused', /up to the goal/.test(await fieldMsg()) && (await habitCount()) === n, await fieldMsg());
    await setField('habit-target-step', '250'); await save();
    const ml = await byName('Bad unit');
    check('a goal with its own step size is saved', JSON.stringify(await ev(`__mockDB.habits[${JSON.stringify(ml)}].target`)) === JSON.stringify({ amount: 2000, unit: 'ml', step: 250 }));
    await openEdit(id);
    check('Edit shows the saved goal', (await ev(`document.getElementById('habit-target-amount').value + ' ' + document.getElementById('habit-target-unit').value`)) === '8 glasses');
    await setField('habit-target-amount', ''); await setField('habit-target-unit', ''); await save();
    check('clearing the goal turns it back into a tick-box habit', await ev(`!('target' in __mockDB.habits[${JSON.stringify(id)}]) && !document.querySelector('.habit-item[data-id=${JSON.stringify(id)}] .habit-step')`));
    await openNew(); await setField('habit-input', 'Sneaky'); await setField('habit-category', 'health'); await setField('habit-target-amount', '2'); await setField('habit-target-unit', '<b id=u>x</b>'); await save();
    check('markup in a unit is shown as text', await ev(`!document.getElementById('u')`));
    check('the privacy policy mentions goals and counts', /goal/i.test(privacy()));
    noExceptions();
  });

  scenario('target: counting works offline, on a small phone, by swipe and from focus view', async () => {
    await boot({ seed: seed({ w: water({ name: 'Drink plenty of water every single day', cue: 'After each meal' }), a: H('Read', { order: 3 }) }) }); await size(320, 568); await rows(); await sleep(300);
    check('320px: no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    check('320px: a counting row is no taller than an ordinary row with a cue would be', await ev(`(() => { const w = document.querySelector('.habit-item[data-id="w"]'), b = w.querySelector('.badges-row'); return b.getBoundingClientRect().height < 30 && Math.abs(w.querySelector('.target-count').getBoundingClientRect().top - w.querySelector('.cat-ico').getBoundingClientRect().top) < 12; })()`));
    check('the + is a 44px target on a phone', (await ev(`(() => { const b = document.querySelector('.habit-item[data-id="w"] .habit-step'); const r = b.getBoundingClientRect(); const p = getComputedStyle(b, '::before'); return Math.min(r.width - parseFloat(p.left) - parseFloat(p.right), r.height - parseFloat(p.top) - parseFloat(p.bottom)); })()`)) >= 44);
    await ev(`window.__mockOffline = true; 0`);
    await stepUp('w');
    check('offline: the count moves at once', (await count('w')) === '2 / 3 glasses', await count('w'));
    await ev(`window.__mockOffline = false; 0`);
    await ev(`document.getElementById('focus-open').click()`); await sleep(450);
    check('focus view opens on the counting habit', /water/i.test(await ev(`document.getElementById('focus-view').innerText`)));
    await ev(`document.getElementById('focus-done').click()`); await sleep(900);
    check('Done in focus view fills the count and completes it', (await doneToday('w')) && (await prog('w')) === 3, await prog('w'));
    check('for 25 XP', (await xp()) === 325, await xp());
    noExceptions();
  });

  scenario('target: busy rows stay on one line on a phone, and the goal boxes are labelled', async () => {
    const run = n => Array.from({ length: n }, (_, i) => day(i + 1));
    await boot({ seed: seed({
      r: H('Read', { category: 'reading', completedDates: [day(0), ...run(4)], completedTimestamps: { [day(0)]: Date.now() - 4000000 }, target: { amount: 20, unit: 'pages', step: 5 }, progress: { [day(0)]: 20 } }),
      c: H('Cold showers', { order: 2, completedDates: run(4), startDate: day(11), endDate: day(-18) }),
      s: H('Stretch', { order: 3, completedDates: run(6), reminderHour: 7, cue: 'After I pour my coffee' }),
      p: H('Plain', { order: 4, completedDates: run(3) }),
    }) }); await size(390, 844); await rows(); await sleep(300);
    const oneLine = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .badges-row').getBoundingClientRect().height < 30`);
    check('390px: a finished counting row is one line of badges', await oneLine('r'));
    check('390px: a row on a dated run is one line of badges', await oneLine('c'));
    check('390px: a row with a reminder is one line of badges', await oneLine('s'));
    check('an ordinary row still shows its seven-day dots', await ev(`document.querySelector('.habit-item[data-id="p"] .dots').getClientRects().length > 0`) && await oneLine('p'));
    await size(360, 740); await sleep(200);
    check('360px: all four are still one line', (await oneLine('r')) && (await oneLine('c')) && (await oneLine('s')) && (await oneLine('p')));
    check('the quiet lines at the foot of Today sit close together', await ev(`(() => { const n = [...document.querySelectorAll('#page-home .rest-note')]; return n.length >= 3 && n.every(e => parseFloat(getComputedStyle(e).marginTop) <= 8); })()`));
    await openNew();
    check('each goal box has a visible label', (await ev(`[...document.querySelectorAll('#habit-goal label > span')].map(e => e.textContent.trim()).join()`)) === 'Goal,Unit,Count by' && await ev(`[...document.querySelectorAll('#habit-goal label > span')].every(e => e.getClientRects().length > 0)`));
    check('and each box is tied to its label', await ev(`['habit-target-amount', 'habit-target-unit', 'habit-target-step'].every(id => !!document.getElementById(id).closest('label'))`));
    await size(320, 568); await sleep(200);
    check('320px: the three goal boxes fit side by side', await ev(`document.documentElement.scrollWidth <= innerWidth && (() => { const r = [...document.querySelectorAll('#habit-goal input')].map(i => i.getBoundingClientRect()); return r.every(x => x.width >= 60 && x.right <= innerWidth) && Math.abs(r[0].top - r[2].top) < 2; })()`));
    noExceptions();
  });
};
