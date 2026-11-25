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
};
