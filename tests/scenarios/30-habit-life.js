// The life of a habit (roadmap batch 3): start and end dates, pausing, archiving.
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
  const inToday = name => ev(`[...document.querySelectorAll('#habits .habit-item .habit-name, #habits-week .habit-item .habit-name, #habits-month .habit-item .habit-name')].some(n => n.textContent.trim() === ${JSON.stringify(name)})`);
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const fieldMsg = () => ev(`[...document.querySelectorAll('#habit-sheet .field-msg')].map(m => m.textContent).join(' | ')`);
  const weekdayOf = key => new Date(key + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });

  // ── 30: start and end dates ──────────────────────────────
  scenario('dates: a habit with a start and an end shows its day, and waits or leaves outside them', async () => {
    await boot({ seed: seed({
      a: H('Read'),
      c: H('Challenge', { order: 2, startDate: day(11), endDate: day(-18) }),
      u: H('Upcoming', { order: 3, startDate: day(-3) }),
      v: H('Tomorrow', { order: 4, startDate: day(-1), frequency: 'weekly' }),
      f: H('Finished', { order: 5, startDate: day(40), endDate: day(1), completedDates: [day(1), day(2)] }),
      e: H('Last day', { order: 6, startDate: day(6), endDate: day(0) }),
      x: H('Odd dates', { order: 7, startDate: 'banana', endDate: 12 }),
    }) }); await rows(); await sleep(300);
    check('a habit on a run says which day it is', (await text('.habit-item[data-id="c"] .run-badge')).trim() === 'Day 12 of 30', await text('.habit-item[data-id="c"] .run-badge'));
    check('on its last day it is still in Today', (await inToday('Last day')) && (await text('.habit-item[data-id="e"] .run-badge')).trim() === 'Day 7 of 7');
    check('a habit that has not started is not in Today', !(await inToday('Upcoming')) && !(await inToday('Tomorrow')));
    check('a habit that has ended is not in Today', !(await inToday('Finished')));
    check('dates that make no sense are ignored, the habit shows as usual', await inToday('Odd dates'));
    check('the ring counts only what is in play today', /of 4$/.test(await text('#ring-of')), await text('#ring-of'));
    check('a quiet line says some habits start later', (await visible('#soon-note')) && /2 habits start later/.test(await text('#soon-note')), await text('#soon-note'));
    check('the line is a closed disclosure', (await ev(`document.getElementById('soon-note').getAttribute('aria-expanded')`)) === 'false' && !(await visible('#habits-soon')));
    await ev(`document.getElementById('soon-note').click()`); await sleep(200);
    check('opening it lists them with the day they start', (await visible('#habits-soon')) && (await text('#habits-soon .habit-item[data-id="u"] .run-badge')).trim() === 'Starts ' + weekdayOf(day(-3)), await text('#habits-soon .habit-item[data-id="u"] .run-badge'));
    check('one that starts tomorrow says so', (await text('#habits-soon .habit-item[data-id="v"] .run-badge')).trim() === 'Starts tomorrow');
    check('they cannot be ticked yet, but can be edited', await ev(`document.querySelector('#habits-soon .habit-check').disabled && !!document.querySelector('#habits-soon [data-action="edit"]')`));
    check('the history of an ended habit is kept', await ev(`__mockDB.habits.f.completedDates.length === 2`));
    await size(320, 568); await sleep(200);
    check('320px: no horizontal scroll, the day badge stays on the badge line', await ev(`document.documentElement.scrollWidth <= innerWidth && (() => { const r = document.querySelector('.habit-item[data-id="c"]'); return Math.abs(r.querySelector('.run-badge').getBoundingClientRect().top - r.querySelector('.cat-badge').getBoundingClientRect().top) < 12; })()`));
    noExceptions();
  });

  scenario('dates: the sheet sets them, offers quick lengths, and refuses an end before the start', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await openNew();
    await setField('habit-input', 'Cold showers'); await setField('habit-category', 'health');
    check('dates are tucked in their own section, saying Always', (await text('#habit-dates-val')).trim() === 'Always' && await ev(`!document.getElementById('habit-dates').open`));
    await ev(`document.getElementById('habit-dates').open = true; document.querySelector('#habit-dates [data-run="30"]').click()`); await sleep(200);
    check('"30 days" fills today and the 30th day', (await ev(`document.getElementById('habit-start').value`)) === day(0) && (await ev(`document.getElementById('habit-end').value`)) === day(-29), await ev(`document.getElementById('habit-start').value + ' ' + document.getElementById('habit-end').value`));
    check('the section says 30 days', (await text('#habit-dates-val')).trim() === '30 days');
    check('the preview shows Day 1 of 30', /Day 1 of 30/.test(await ev(`document.getElementById('habit-preview').innerText`)));
    await ev(`document.querySelector('#habit-dates [data-run="66"]').click()`); await sleep(150);
    check('"66 days" moves the end', (await ev(`document.getElementById('habit-end').value`)) === day(-65));
    await ev(`document.querySelector('#habit-dates [data-run="0"]').click()`); await sleep(150);
    check('"No end" clears the end and keeps the start', (await ev(`document.getElementById('habit-end').value`)) === '' && (await ev(`document.getElementById('habit-start').value`)) === day(0));
    await ev(`document.querySelector('#habit-dates [data-run="30"]').click()`); await sleep(150);
    await save();
    const id = await byName('Cold showers');
    check('both dates are saved', await ev(`__mockDB.habits[${JSON.stringify(id)}].startDate === ${JSON.stringify(day(0))} && __mockDB.habits[${JSON.stringify(id)}].endDate === ${JSON.stringify(day(-29))}`));
    check('the new row says Day 1 of 30', (await text(`.habit-item[data-id="${id}"] .run-badge`)).trim() === 'Day 1 of 30');
    check('a habit made without dates stores none', await ev(`!('startDate' in __mockDB.habits.a) && !('endDate' in __mockDB.habits.a)`));
    const n = await ev(`Object.keys(__mockDB.habits).length`);
    await openNew(); await setField('habit-input', 'Backwards'); await setField('habit-category', 'health');
    await setField('habit-start', day(-10)); await setField('habit-end', day(-5)); await save();
    check('an end before the start is refused with a reason', /before the start/.test(await fieldMsg()) && (await ev(`Object.keys(__mockDB.habits).length`)) === n && await visible('#habit-sheet'), await fieldMsg());
    check('and the section is opened so the message can be seen', await ev(`document.getElementById('habit-dates').open`));
    await setField('habit-end', ''); await save();
    const later = await byName('Backwards');
    check('a start in the future saves, and the habit waits under "starts later"', !!later && !(await inToday('Backwards')) && /1 habit starts later/.test(await text('#soon-note')), await text('#soon-note'));
    await openEdit(id);
    check('Edit shows the saved dates', (await ev(`document.getElementById('habit-start').value + ' ' + document.getElementById('habit-end').value`)) === day(0) + ' ' + day(-29) && (await text('#habit-dates-val')).trim() === '30 days');
    await setField('habit-start', ''); await setField('habit-end', ''); await save();
    check('clearing them removes the fields', await ev(`!('startDate' in __mockDB.habits[${JSON.stringify(id)}]) && !('endDate' in __mockDB.habits[${JSON.stringify(id)}])`));
    check('the privacy policy mentions start and end dates', /start and end dates/i.test(privacy()));
    noExceptions();
  });

  // ── 28: pause and archive ────────────────────────────────
  const openDetails = async id => { await ev(`document.querySelector('.habit-item[data-id="${id}"] [data-action="details"]').click()`); await sleep(400); };
  const pauses = id => ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(id)}].pauses || null)`);
  const streakOf = id => text(`.habit-item[data-id="${id}"] .streak-pill`);
  const five = () => [day(1), day(2), day(3), day(4), day(5)];

  scenario('pause: a habit can be paused from its details and waits at the foot of Today', async () => {
    await boot({ seed: seed({ a: H('Read'), g: H('Gym', { order: 2, completedDates: five() }) }) }); await rows(); await sleep(300);
    check('before: two habits count today', /of 2$/.test(await text('#ring-of')));
    await openDetails('g');
    check('details offers Pause and Archive', (await text('#details-pause')).trim() === 'Pause' && (await text('#details-archive')).trim() === 'Archive');
    await ev(`document.getElementById('details-pause').click()`); await sleep(500);
    check('pausing records an open pause from today', (await pauses('g')) === JSON.stringify([{ from: day(0) }]), await pauses('g'));
    check('the page stays, offers Resume, and a toast confirms', (await ev(`document.getElementById('page-habit').classList.contains('active')`)) && /Resume/.test(await ev(`document.getElementById('details-pause').textContent`)) && /Paused/.test(await ev(`document.getElementById('toast-container').innerText`)));
    await ev(`document.getElementById('details-close').click()`); await sleep(400);
    check('the habit leaves Today', !(await inToday('Gym')));
    check('and the ring counts one habit', /of 1$/.test(await text('#ring-of')), await text('#ring-of'));
    check('a quiet line says one habit is paused', (await visible('#paused-note')) && /1 habit paused/.test(await text('#paused-note')), await text('#paused-note'));
    await ev(`document.getElementById('paused-note').click()`); await sleep(200);
    check('opening it shows the habit with a Resume button that can be seen and tapped', await ev(`(() => { const b = document.querySelector('#habits-paused .habit-item[data-id="g"] [data-action="resume"]'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && getComputedStyle(b).visibility === 'visible' && getComputedStyle(b.parentElement).opacity === '1'; })()`));
    check('nothing was deleted: its history is intact', await ev(`__mockDB.habits.g.completedDates.length === 5 && !__mockDB.habits.g.deletedAt`));
    await ev(`document.querySelector('#habits-paused [data-action="resume"]').click()`); await sleep(500);
    check('resuming the same day leaves no pause behind', (await pauses('g')) === '[]', await pauses('g'));
    check('the habit is back in Today with its streak', (await inToday('Gym')) && /5/.test(await streakOf('g')), await streakOf('g'));
    noExceptions();
  });

  scenario('pause: paused days never break a streak, and never add to it', async () => {
    // Done five days, then paused for three, resumed today
    await boot({ seed: seed({
      g: H('Gym', { completedDates: [day(4), day(5), day(6), day(7), day(8)], pauses: [{ from: day(3), to: day(1) }] }),
      p: H('Still paused', { order: 2, completedDates: [day(6), day(7)], pauses: [{ from: day(5) }] }),
      w: H('Weekly one', { order: 3, frequency: 'weekly', pauses: [{ from: day(2) }] }),
    }), mobile: false }); await rows(); await sleep(300);
    check('after a pause the streak is where it was left', /5/.test(await streakOf('g')), await streakOf('g'));
    await ev(`document.querySelector('.habit-item[data-id="g"] .habit-check').click()`); await sleep(900);
    check('doing it on the day of return makes it six', /6/.test(await streakOf('g')), await streakOf('g'));
    check('paused habits of any kind wait in the paused line', !(await inToday('Still paused')) && !(await inToday('Weekly one')) && /2 habits paused/.test(await text('#paused-note')), await text('#paused-note'));
    await ev(`document.getElementById('paused-note').click()`); await sleep(200);
    check('each says since when', /^Paused since /.test((await text('#habits-paused .habit-item[data-id="p"] .run-badge')).trim()), await text('#habits-paused .habit-item[data-id="p"] .run-badge'));
    await ev(`document.querySelector('#habits-paused .habit-item[data-id="p"] [data-action="details"]').click()`); await sleep(400);
    check('details of a paused habit offers Resume and says the streak is safe', (await text('#details-pause')).trim() === 'Resume' && /never break/.test(await text('#details-life-note')));
    await ev(`document.getElementById('details-pause').click()`); await sleep(500);
    check('resuming closes the pause on yesterday', (await pauses('p')) === JSON.stringify([{ from: day(5), to: day(1) }]), await pauses('p'));
    check('and its streak of two is still there', /2/.test(await streakOf('p')), await streakOf('p'));
    noExceptions();
  });

  scenario('archive: a habit can be put away and brought back, with nothing lost', async () => {
    await boot({ seed: seed({
      a: H('Read'),
      o: H('Old project', { order: 2, completedDates: five() }),
      f: H('Finished run', { order: 3, startDate: day(40), endDate: day(1), completedDates: [day(1), day(2), day(3)] }),
    }), mobile: false }); await rows(); await sleep(300);
    await openDetails('o');
    await ev(`document.getElementById('details-archive').click()`); await sleep(500);
    check('archiving stamps the habit and deletes nothing', await ev(`typeof __mockDB.habits.o.archivedAt === 'number' && !__mockDB.habits.o.deletedAt && __mockDB.habits.o.completedDates.length === 5`));
    check('it leaves Today and the ring', !(await inToday('Old project')) && /of 1$/.test(await text('#ring-of')), await text('#ring-of'));
    check('the toast says where it went and offers Undo', /Archive/.test(await ev(`document.getElementById('toast-container').innerText`)) && /Undo/.test(await text('#toast-container .toast-action')));
    await ev(`document.querySelector('#toast-container .toast-action').click()`); await sleep(500);
    check('Undo brings it straight back', (await inToday('Old project')) && await ev(`!('archivedAt' in __mockDB.habits.o)`));
    await openDetails('o'); await ev(`document.getElementById('details-archive').click()`); await sleep(500);
    await ev(`location.hash = '#profile'`); await sleep(500);
    check('Profile has an Archive entry', await visible('#open-archive-btn'));
    await ev(`document.getElementById('open-archive-btn').click()`); await sleep(400);
    check('the archive lists the archived habit with its tally', (await visible('#archive-modal')) && /Old project/.test(await text('#archive-list')) && /5 check-ins/.test(await text('#archive-list .archive-item[data-id="o"]')), await text('#archive-list'));
    check('and the habit whose run ended, as Finished', /Finished/.test(await text('#archive-list .archive-item[data-id="f"]')) && /3 check-ins/.test(await text('#archive-list .archive-item[data-id="f"]')), await text('#archive-list .archive-item[data-id="f"]'));
    await ev(`document.querySelector('#archive-list .archive-item[data-id="o"] [data-action="unarchive"]').click()`); await sleep(500);
    check('Restore puts an archived habit back', await ev(`!('archivedAt' in __mockDB.habits.o)`) && !/Old project/.test(await text('#archive-list')));
    await ev(`document.querySelector('#archive-list .archive-item[data-id="f"] [data-action="unarchive"]').click()`); await sleep(500);
    check('Restore on a finished habit lets it run on, by removing its end date', await ev(`!('endDate' in __mockDB.habits.f) && __mockDB.habits.f.completedDates.length === 3`));
    check('an empty archive says so', /Nothing in the archive/.test(await text('#archive-list')), await text('#archive-list'));
    await ev(`document.getElementById('archive-close').click(); location.hash = '#home'`); await sleep(500);
    check('both are in Today again', (await inToday('Old project')) && (await inToday('Finished run')));
    noExceptions();
  });

  scenario('archive: deleting from the archive uses the normal one-hour bin, and it all fits a phone', async () => {
    await boot({ seed: seed({ a: H('Read'), o: H('A habit with quite a long name that I put away last spring', { order: 2, archivedAt: Date.now() - 864e5, completedDates: five() }), p: H('Paused one', { order: 3, pauses: [{ from: day(2) }] }) }) }); await size(320, 568); await rows(); await sleep(300);
    check('an archived habit is not in Today when the app opens', !(await inToday('A habit with quite a long name that I put away last spring')) && /of 1$/.test(await text('#ring-of')));
    await ev(`document.getElementById('paused-note').click()`); await sleep(200);
    check('320px: the paused list fits, no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    await ev(`location.hash = '#profile'`); await sleep(500);
    await ev(`document.getElementById('open-archive-btn').click()`); await sleep(400);
    check('320px: the archive fits, with 44px buttons', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#archive-list button')].every(b => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().right <= innerWidth)`));
    await ev(`document.querySelector('#archive-list [data-action="archive-delete"]').click()`); await sleep(500);
    check('Delete moves it to Recently deleted, not straight to nothing', await ev(`typeof __mockDB.habits.o.deletedAt === 'number'`));
    check('the dialog can be closed with Escape', await (async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300); return !(await visible('#archive-modal')); })());
    noExceptions();
  });

  // ── 25: a reminder time for each habit ───────────────────
  const withUser = (habits, user = {}) => signedIn({ habitly_confirm: null, mock_fb_db: { habits, users: { 'u-test': { xp: 300, ...user } } } });
  const hours = () => ev(`JSON.stringify(__mockDB.users['u-test'].reminderHours || null)`);

  scenario('reminder: a habit can have its own reminder time, shown on its row', async () => {
    await boot({ seed: withUser({ a: H('Read'), s: H('Stretch', { order: 2, reminderHour: 7 }), z: H('Odd', { order: 3, reminderHour: 99 }) }, { fcmToken: 'tok' }), mobile: false }); await rows(); await sleep(300);
    check('a habit with a reminder shows a small bell and the time', (await text('.habit-item[data-id="s"] .remind-badge')).replace(/\s+/g, ' ').trim() === 'Reminder at 7 am' && await ev(`!!document.querySelector('.habit-item[data-id="s"] .remind-badge svg')`), await text('.habit-item[data-id="s"] .remind-badge'));
    check('habits without one, or with a nonsense hour, show none', await ev(`!document.querySelector('.habit-item[data-id="a"] .remind-badge') && !document.querySelector('.habit-item[data-id="z"] .remind-badge')`));
    check('the account records which hours are in use, for the reminder job', await waitFor(`JSON.stringify(__mockDB.users['u-test'].reminderHours) === '[7]'`, 3000), await hours());
    await openNew();
    await setField('habit-input', 'Wind down'); await setField('habit-category', 'health');
    check('the reminder sits in its own section, saying None', (await text('#habit-remind-val')).trim() === 'None' && await ev(`!document.getElementById('habit-remind').open`));
    check('it offers no reminder and every hour of the day, in plain words', await ev(`(() => { const o = [...document.getElementById('habit-reminder').options].map(x => x.textContent.trim()); return o.length === 25 && o[0] === 'No reminder' && o[1] === '12 am' && o[8] === '7 am' && o[13] === '12 pm' && o[24] === '11 pm'; })()`));
    check('with reminders on, no extra note is shown', await ev(`document.getElementById('habit-reminder-note').hidden`));
    await ev(`document.getElementById('habit-remind').open = true`);
    await setField('habit-reminder', '21'); await sleep(150);
    check('the section and the preview show the time chosen', (await text('#habit-remind-val')).trim() === '9 pm' && /9 pm/.test(await ev(`document.getElementById('habit-preview').innerText`)), await text('#habit-remind-val'));
    await save();
    const id = await byName('Wind down');
    check('the hour is saved as a number', await ev(`__mockDB.habits[${JSON.stringify(id)}].reminderHour === 21`));
    check('a habit made without one stores none', await ev(`!('reminderHour' in __mockDB.habits.a)`));
    check('the hours in use follow', await waitFor(`JSON.stringify(__mockDB.users['u-test'].reminderHours) === '[7,21]'`, 3000), await hours());
    await openEdit('s');
    check('Edit shows the saved time', (await ev(`document.getElementById('habit-reminder').value`)) === '7' && (await text('#habit-remind-val')).trim() === '7 am');
    await setField('habit-reminder', ''); await save();
    check('choosing No reminder removes it', await ev(`!('reminderHour' in __mockDB.habits.s)`) && await waitFor(`JSON.stringify(__mockDB.users['u-test'].reminderHours) === '[21]'`, 3000), await hours());
    await openNew(); await setField('habit-input', 'Midnight'); await setField('habit-category', 'health'); await setField('habit-reminder', '0'); await save();
    check('midnight (hour 0) is a real choice, not "none"', await ev(`__mockDB.habits[${JSON.stringify(await byName('Midnight'))}].reminderHour === 0`));
    check('the privacy policy mentions reminder times', /reminder time/i.test(privacy()));
    noExceptions();
  });

  scenario('reminder: with reminders off the sheet says how to get them, and rows fit a small phone', async () => {
    await boot({ seed: withUser({ a: H('Read'), s: H('Stretch every single morning before work', { order: 2, reminderHour: 7, completedDates: [day(1), day(2)], cue: 'After coffee' }) }) }); await size(390, 800); await rows(); await sleep(300);
    check('390px: the bell stays on the badge line', await ev(`(() => { const r = document.querySelector('.habit-item[data-id="s"]'); return Math.abs(r.querySelector('.remind-badge').getBoundingClientRect().top - r.querySelector('.cat-badge').getBoundingClientRect().top) < 12; })()`));
    await size(320, 568); await sleep(200);
    check('320px: no horizontal scroll and the badges stay on one line', await ev(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('.habit-item[data-id="s"] .badges-row').getBoundingClientRect().height < 30`));
    await openNew();
    await ev(`document.getElementById('habit-remind').open = true`); await sleep(150);
    check('with reminders off, a line says where to switch them on', (await ev(`!document.getElementById('habit-reminder-note').hidden`)) && /Daily reminders/.test(await text('#habit-reminder-note')), await text('#habit-reminder-note'));
    await setField('habit-input', 'Later'); await setField('habit-category', 'health'); await setField('habit-reminder', '18'); await save();
    check('the time can still be saved, ready for when they are on', await ev(`__mockDB.habits[${JSON.stringify(await byName('Later'))}].reminderHour === 18`));
    noExceptions();
  });
};
