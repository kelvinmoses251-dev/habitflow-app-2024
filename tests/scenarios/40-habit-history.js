// A habit's history on its page (roadmap batch 5): the month calendar, the charts, the year.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const TZ = 'Africa/Lagos';
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now(), ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const open = async id => { await ev(`location.hash = '#habit/${id}'`); await sleep(600); };
  const monthName = n => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(new Date(day(0).slice(0, 7) + '-15T12:00:00Z').setUTCMonth(new Date(day(0) + 'T12:00:00Z').getUTCMonth() - n)));
  const cls = d => ev(`(document.querySelector('#hp-calendar td[data-day="${d}"]') || { className: 'absent' }).className`);
  const sameMonth = d => d.slice(0, 7) === day(0).slice(0, 7);

  // ── 42: a month calendar with streak runs ────────────────
  scenario('calendar: the month at a glance, with runs of days joined up', async () => {
    await boot({ seed: seed({
      a: H('Read', { completedDates: [...run(0, 3), day(6)], completedTimestamps: { [day(0)]: Date.now() - 4000000 } }),
      n: H('New', { order: 2, createdAt: new Date(Date.now() - 2 * 864e5).toISOString() }),
    }) }); await rows(); await sleep(300);
    await open('a');
    check('the habit page has a calendar, as a real table with weekday headings', await ev(`(() => { const t = document.querySelector('#hp-calendar table.cal'); return !!t && t.querySelectorAll('thead th[scope="col"]').length === 7 && !!document.getElementById(t.getAttribute('aria-labelledby')); })()`));
    check('it opens on this month', (await text('#cal-label')).trim() === monthName(0), await text('#cal-label'));
    check('weeks start on Monday', /Monday/.test(await text('#hp-calendar thead th')));
    const today = await cls(day(0));
    check('today is marked, and done', /is-today/.test(today) && /is-done/.test(today), today);
    check('its label says so in words', /^[A-Z][a-z]+day [0-9]{1,2} [A-Z][a-z]+: done \(today\)$/.test(await ev(`document.querySelector('#hp-calendar td.is-today').getAttribute('aria-label')`)), await ev(`document.querySelector('#hp-calendar td.is-today').getAttribute('aria-label')`));
    check('today ends a run of days', /run-end/.test(today), today);
    if (sameMonth(day(1))) check('the day before is the middle of the run', /run-mid/.test(await cls(day(1))), await cls(day(1)));
    if (sameMonth(day(3))) check('and the run starts three days back', /run-start/.test(await cls(day(3))), await cls(day(3)));
    if (sameMonth(day(4))) check('a day that was due and not done reads as missed', /is-missed/.test(await cls(day(4))) && /missed/.test(await ev(`document.querySelector('#hp-calendar td[data-day="${day(4)}"]').getAttribute('aria-label')`)));
    if (sameMonth(day(6))) check('a single done day stands alone', /run-single/.test(await cls(day(6))), await cls(day(6)));
    check('a run is drawn as one band behind its days', await ev(`(() => { const td = document.querySelector('#hp-calendar td.run-end'); const b = getComputedStyle(td, '::before'); return b.content !== 'none' && b.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(b.height) > 20; })()`));
    check('every day of the month has a label in words', await ev(`[...document.querySelectorAll('#hp-calendar td.cal-day')].every(td => /^[A-Z][a-z]+day [0-9]/.test(td.getAttribute('aria-label')))`));
    check('a line sums the month up', /^[0-9]+ of [0-9]+ days done this month$/.test((await text('#cal-sum')).trim()), await text('#cal-sum'));
    check('Next is off in the current month, Previous is on', await ev(`document.querySelector('.cal-nav[aria-label="Next month"]').disabled && !document.querySelector('.cal-nav[aria-label="Previous month"]').disabled`));
    await ev(`document.querySelector('.cal-nav[aria-label="Previous month"]').focus(); document.querySelector('.cal-nav[aria-label="Previous month"]').click()`); await sleep(250);
    check('Previous shows last month', (await text('#cal-label')).trim() === monthName(1), await text('#cal-label'));
    check('the focus stays on the arrow just used', await ev(`document.activeElement === document.querySelector('.cal-nav[aria-label="Previous month"]')`));
    check('no day is marked today there', (await ev(`document.querySelectorAll('#hp-calendar td.is-today').length`)) === 0);
    await ev(`document.querySelector('.cal-nav[aria-label="Next month"]').click()`); await sleep(250);
    check('Next comes back to this month', (await text('#cal-label')).trim() === monthName(0) && (await ev(`document.querySelectorAll('#hp-calendar td.is-today').length`)) === 1);
    await ev(`__mockRemote('habits', 'a', { completedDates: ${JSON.stringify(run(0, 6))} })`); await sleep(500);
    if (sameMonth(day(4))) check('the calendar keeps up when the data changes', /is-done/.test(await cls(day(4))));
    await size(320, 568); await sleep(200);
    check('320px: the calendar fits with no sideways scroll, arrows are thumb-sized', await ev(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('#hp-calendar table').getBoundingClientRect().right <= innerWidth && [...document.querySelectorAll('.cal-nav')].every(b => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)`));
    await open('n');
    check('a habit made two days ago cannot go back before it began', sameMonth(day(2)) ? await ev(`document.querySelector('.cal-nav[aria-label="Previous month"]').disabled`) : true);
    check('days before it began are quiet, not "missed"', sameMonth(day(5)) ? /is-before/.test(await cls(day(5))) : true, await cls(day(5)));
    check('opening another habit starts on this month again', (await text('#cal-label')).trim() === monthName(0));
    noExceptions();
  });
  // ── 43: charts ───────────────────────────────────────────
  const weekdayOf = d => new Date(d + 'T12:00:00Z').getUTCDay();
  scenario('charts: twelve weeks and the days of the week, in bars and in words', async () => {
    const onlyTueThu = []; for (let n = 0; n < 84; n++) if ([2, 4].includes(weekdayOf(day(n)))) onlyTueThu.push(day(n));
    await boot({ seed: seed({ a: H('Read', { completedDates: onlyTueThu }), m: H('Budget', { order: 2, frequency: 'monthly', completedDates: [day(3)] }), e: H('Empty', { order: 3 }) }) }); await rows(); await sleep(300);
    await open('a');
    const weeks = JSON.parse(await ev(`JSON.stringify((() => { const c = document.querySelector('#hp-weeks .chart'); const bars = [...c.querySelectorAll('.bar')];
      return { role: c.getAttribute('role'), label: c.getAttribute('aria-label'), n: bars.length, rates: bars.map(b => b.dataset.rate), heights: bars.map(b => Math.round(b.getBoundingClientRect().height)), now: bars.filter(b => b.classList.contains('is-now')).length, box: Math.round(c.querySelector('.bars').getBoundingClientRect().height) }; })())`));
    check('twelve bars, one per week, the current one marked', weeks.n === 12 && weeks.now === 1, JSON.stringify(weeks));
    check('a full earlier week reads 29% (two days of seven)', weeks.rates[5] === '29', JSON.stringify(weeks.rates));
    check('bar heights follow the numbers', weeks.heights[5] > 10 && Math.abs(weeks.heights[5] - weeks.box * 0.29) <= 3, JSON.stringify(weeks.heights) + ' of ' + weeks.box);
    check('the chart says its numbers to a screen reader', weeks.role === 'img' && /twelve weeks/.test(weeks.label) && /29%/.test(weeks.label), weeks.label);
    check('and a sentence under it sums it up', /^(This week: [0-9]+ of [0-9]+\.|Nothing due this week\.) Twelve-week average: [0-9]+%\.$/.test((await text('#weeks-cap')).trim()), await text('#weeks-cap'));
    const days = JSON.parse(await ev(`JSON.stringify((() => { const c = document.querySelector('#hp-weekdays .chart'); const bars = [...c.querySelectorAll('.bar')];
      return { label: c.getAttribute('aria-label'), n: bars.length, best: bars.map((b, i) => (b.classList.contains('is-best') ? i : -1)).filter(i => i >= 0), heights: bars.map(b => Math.round(b.getBoundingClientRect().height)), letters: [...c.querySelectorAll('.bar-lbl')].map(l => l.textContent).join('') }; })())`));
    check('seven bars, Monday first', days.n === 7 && days.letters === 'MTWTFSS', JSON.stringify(days));
    check('Tuesday is marked best (it ties with Thursday; the earlier day wins)', days.best.length === 1 && days.best[0] === 1, JSON.stringify(days.best));
    check('done days stand tall, missed days are stubs', days.heights[1] > 60 && days.heights[3] > 60 && days.heights[0] <= 8, JSON.stringify(days.heights));
    check('the caption names the best day with its numbers', (await text('#weekday-cap')).trim() === 'Best on Tuesdays: 12 of 12.', await text('#weekday-cap'));
    check('and the label carries every day', /Monday 0 of 12/.test(days.label) && /Tuesday 12 of 12/.test(days.label), days.label);
    await size(320, 568); await sleep(200);
    check('320px: the charts fit', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#hp-charts .bars')].every(b => b.getBoundingClientRect().right <= innerWidth)`));
    await open('m');
    check('a monthly habit says why it has no weekly chart', await visible('#weeks-none'));
    await open('e');
    check('a habit never done has no best day yet, and says so', (await visible('#weekday-none')) && /0%/.test(await text('#weeks-cap')));
    noExceptions();
  });
  // ── 45: a year heatmap for the habit ─────────────────────
  scenario('year: the last year, a dot a day, scrolling in its own box', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(0, 9), createdAt: new Date(Date.now() - 19 * 864e5).toISOString(), completedTimestamps: { [day(0)]: Date.now() - 4000000 } }) }) }); await rows(); await sleep(300);
    await open('a');
    const y = JSON.parse(await ev(`JSON.stringify((() => { const box = document.getElementById('year-scroll'); const cells = [...box.querySelectorAll('.yc')];
      return { cols: box.querySelectorAll('.year-col').length, cells: cells.length, done: cells.filter(c => c.classList.contains('is-done')).length, today: cells.filter(c => c.classList.contains('is-today')).map(c => c.dataset.day),
        label: box.getAttribute('aria-label'), focusable: box.tabIndex === 0, months: box.querySelectorAll('.year-months span').length }; })())`));
    check('53 weeks of seven days', y.cols === 53 && y.cells === 371, JSON.stringify(y));
    check('ten days done, and today marked', y.done === 10 && y.today.length === 1 && y.today[0] === day(0), JSON.stringify(y));
    check('months are labelled along the top', y.months >= 12 && y.months <= 14);
    check('a sentence says the year in numbers', (await text('#year-sum')).trim() === '10 of 20 days in the last year.', await text('#year-sum'));
    check('the box has a name that carries the numbers, and can be reached by keyboard to scroll', /last year/.test(y.label) && /10 of 20/.test(y.label) && y.focusable, y.label);
    const s = JSON.parse(await ev(`JSON.stringify((() => { const box = document.getElementById('year-scroll'); const t = box.querySelector('.yc.is-today').getBoundingClientRect(), b = box.getBoundingClientRect();
      return { scrolls: box.scrollWidth > box.clientWidth, atEnd: Math.abs(box.scrollLeft + box.clientWidth - box.scrollWidth) <= 2, todayIn: t.left >= b.left && t.right <= b.right + 1, page: document.documentElement.scrollWidth <= innerWidth }; })())`));
    check('on a phone it scrolls sideways inside its box, and the page does not', s.scrolls && s.page, JSON.stringify(s));
    check('it starts at today', s.atEnd && s.todayIn, JSON.stringify(s));
    await ev(`document.getElementById('year-scroll').scrollLeft = 40`); await sleep(100);
    await ev(`__mockRemote('habits', 'a', { completedDates: ${JSON.stringify(run(0, 10))} })`); await sleep(500);
    check('a change in the data redraws it without throwing the person back to the end', (await ev(`document.getElementById('year-scroll').scrollLeft`)) === 40 && /11 of 20/.test(await text('#year-sum')), await text('#year-sum'));
    await boot({ mobile: false, colorScheme: 'dark', seed: seed({ a: H('Read', { completedDates: run(0, 9) }) }) }); await rows(); await sleep(300);
    await open('a');
    check('desktop: the whole year fits without scrolling', await ev(`(() => { const box = document.getElementById('year-scroll'); return box.scrollWidth <= box.clientWidth + 1; })()`));
    check('dark: a done day stands out from a missed one', await ev(`(() => { const d = getComputedStyle(document.querySelector('.yc.is-done')).backgroundColor, m = getComputedStyle(document.querySelector('.yc.is-missed')).backgroundColor; return d !== m; })()`));
    noExceptions();
  });
  // ── 44: a notes timeline with search ─────────────────────
  const noteAt = (n, text) => ({ date: new Date(Date.now() - n * 864e5).toISOString(), text });
  const setField = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const notesShown = () => ev(`[...document.querySelectorAll('#details-journal-list .journal-text')].map(n => n.textContent)`);

  scenario('notes: a timeline by month that can be searched', async () => {
    const journals = [noteAt(1, 'Had a Café au lait after the run'), noteAt(2, 'Long run, slow'), noteAt(40, 'Rest day <img src=x onerror=window.__x=1>'), noteAt(41, 'Knee sore'), noteAt(75, 'First try')];
    await boot({ seed: seed({ a: H('Run', { journals }), few: H('Few', { order: 2, journals: journals.slice(0, 2) }) }) }); await rows(); await sleep(300);
    await open('a');
    check('all five notes are listed, newest first', JSON.stringify(await notesShown()) === JSON.stringify(journals.map(j => j.text)), JSON.stringify(await notesShown()));
    check('they are grouped under month headings', (await ev(`document.querySelectorAll('#details-journal-list .notes-month').length`)) >= 2 && /^[A-Z][a-z]+ [0-9]{4}$/.test((await text('#details-journal-list .notes-month')).trim()), await text('#details-journal-list .notes-month'));
    check('each note has a real time element and a named delete button', await ev(`[...document.querySelectorAll('#details-journal-list .journal-entry')].every(e => !!e.querySelector('time[datetime]') && /Delete the note from/.test(e.querySelector('.delete-journal-btn').getAttribute('aria-label')))`));
    check('a note with HTML in it is shown as text and runs nothing', (await ev(`window.__x`)) === undefined && !(await ev(`!!document.querySelector('#details-journal-list img')`)));
    check('with more than three notes a search box appears', (await visible('#notes-search')) && await ev(`!!document.getElementById('notes-search').getAttribute('aria-label')`));
    await setField('notes-search', 'RUN'); await sleep(250);
    check('searching narrows the list, whatever the case', JSON.stringify(await notesShown()) === JSON.stringify([journals[0].text, journals[1].text]), JSON.stringify(await notesShown()));
    check('and marks what matched', (await ev(`[...document.querySelectorAll('#details-journal-list mark')].map(m => m.textContent).join('|')`)) === 'run|run');
    check('a count says how many', (await text('#notes-count')).trim() === '2 of 5 notes', await text('#notes-count'));
    await setField('notes-search', 'cafe run'); await sleep(250);
    check('accents do not matter and every word must be there', JSON.stringify(await notesShown()) === JSON.stringify([journals[0].text]) && (await ev(`[...document.querySelectorAll('#details-journal-list mark')].map(m => m.textContent).join('|')`)) === 'Café|run');
    await setField('notes-search', 'zebra'); await sleep(250);
    check('no match says so, and repeats the words as text', /No notes match/.test(await text('#notes-none')) && /zebra/.test(await text('#notes-none')));
    await setField('notes-search', '<img src=x onerror=window.__y=1>'); await sleep(250);
    check('a hostile search is just text', (await ev(`window.__y`)) === undefined && !(await ev(`!!document.querySelector('#hp-notes img')`)));
    await setField('notes-search', 'knee'); await sleep(250);
    await ev(`document.querySelector('#details-journal-list .delete-journal-btn').click()`); await sleep(600);
    check('deleting a note while searching removes that note', await ev(`__mockDB.habits.a.journals.length === 4 && !__mockDB.habits.a.journals.some(j => j.text === 'Knee sore')`));
    await setField('notes-search', ''); await sleep(250);
    check('clearing the search brings the rest back', (await notesShown()).length === 4 && !(await visible('#notes-count')));
    await size(320, 568); await sleep(200);
    check('320px: notes fit, delete is thumb-sized', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#details-journal-list .delete-journal-btn')].every(b => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)`));
    await open('few');
    check('with only two notes there is no search box', !(await visible('#notes-search')) && (await notesShown()).length === 2);
    noExceptions();
  });
  // ── 48: plain-language insights ──────────────────────────
  scenario('insights: the habit page says what stands out, in sentences', async () => {
    const at = (n, hour) => { const d = new Date(Date.now() - n * 864e5); d.setHours(hour, 10, 0, 0); return d.getTime(); };
    const days10 = run(0, 23), stamps = Object.fromEntries(days10.map((d, n) => [d, at(n, 7)])), moods = Object.fromEntries(days10.slice(0, 5).map(d => [d, 5]));
    await boot({ seed: seed({ a: H('Read', { completedDates: [...days10, ...run(30, 47)], completedTimestamps: stamps, moods }), n: H('New <i>one</i>', { order: 2, createdAt: new Date(Date.now() - 2 * 864e5).toISOString(), completedDates: [day(0)], completedTimestamps: { [day(0)]: Date.now() - 4000000 } }) }) }); await rows(); await sleep(300);
    await open('a');
    const lines = await ev(`[...document.querySelectorAll('#hp-insights li')].map(li => li.textContent.trim())`);
    check('up to four sentences, as a list', lines.length >= 3 && lines.length <= 4 && await ev(`document.getElementById('hp-insights').tagName === 'UL'`), JSON.stringify(lines));
    check('the last thirty days against the month before', lines.some(l => /^Done on 24 of the last 30 days it was due, up from 18 of 30 the month before\.$/.test(l)), JSON.stringify(lines));
    check('when in the day it gets done', lines.some(l => /^Usually done in the morning \(24 of 24 times\)\.$/.test(l)), JSON.stringify(lines));
    check('the run it is on', lines.some(l => /longest run yet: 24 days/.test(l)), JSON.stringify(lines));
    check('how it feels', lines.some(l => /^It usually feels great \(5 out of 5 over 5 notes\)\.$/.test(l)), JSON.stringify(lines));
    check('each has a drawn icon, hidden from screen readers', await ev(`[...document.querySelectorAll('#hp-insights li')].every(li => !!li.querySelector('.ins-ic[aria-hidden="true"] use') && !!document.querySelector(li.querySelector('use').getAttribute('href')))`));
    await open('n');
    const fresh = await ev(`[...document.querySelectorAll('#hp-insights li')].map(li => li.textContent.trim())`);
    check('a new habit gets one line saying what will come, nothing made up', fresh.length === 1 && /week or two/.test(fresh[0]) && await ev(`document.querySelector('#hp-insights li').classList.contains('is-waiting')`), JSON.stringify(fresh));
    await size(320, 568); await sleep(200);
    check('320px: the sentences wrap inside the card', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#hp-insights li')].every(li => li.getBoundingClientRect().right <= innerWidth)`));
    noExceptions();
  });
  // ── 49: focus sessions on the habit page ─────────────────
  const clock = `(() => { const real = Date.now.bind(Date); window.__skew = 0; Date.now = () => real() + window.__skew; })();`;
  const running = () => ev(`!document.getElementById('timer-modal').classList.contains('hidden') && !document.getElementById('timer-pause').classList.contains('hidden')`);
  const pass = async minutes => { await ev(`window.__skew += ${minutes} * 60000 + 1000; 0`); await sleep(1900); };
  const sessions = id => ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(id)}].sessions || [])`).then(JSON.parse);

  scenario('focus: a session starts from the habit page in one tap, and is kept in its history', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }, { xp: 900 }), initScript: clock }); await rows(); await sleep(300);
    await open('a');
    check('the page has a Focus section with three lengths', (await ev(`[...document.querySelectorAll('#hp-focus [data-focus]')].map(b => b.textContent.trim()).join(',')`)) === '15 min,25 min,45 min' && await ev(`document.querySelector('#hp-focus [role="group"]').getAttribute('aria-label').length > 5`));
    check('with no sessions yet it says what a session does', /No sessions yet/.test(await text('#focus-total')) && (await ev(`document.querySelectorAll('#focus-sessions li').length`)) === 0);
    await ev(`document.querySelector('#hp-focus [data-focus="15"]').click()`); await sleep(400);
    check('one tap starts a 15-minute session for this habit', (await running()) && (await ev(`document.getElementById('timer-input').value`)) === '15' && (await text('#timer-habit-name')).trim() === 'Read' && /^1[45]:[0-9]{2}$/.test((await text('#timer-display')).trim()), await text('#timer-display'));
    await pass(15);
    check('when it ends the timer closes', await ev(`document.getElementById('timer-modal').classList.contains('hidden')`));
    const one = await sessions('a');
    check('the session is saved on the habit: when, and how long', one.length === 1 && one[0].minutes === 15 && typeof one[0].at === 'number', JSON.stringify(one));
    check('the habit is completed for the normal 25 XP', await ev(`__mockDB.habits.a.completedDates.length === 1 && __mockDB.users['u-test'].xp === 925`), String(await ev(`__mockDB.users['u-test'].xp`)));
    check('the page lists it', /^15 min/.test((await text('#focus-sessions li')).trim()) && (await text('#focus-total')).trim() === '1 session, 15 min in all.', await text('#focus-total'));
    await ev(`document.getElementById('all-done-close')?.click()`); await sleep(300);
    await ev(`document.querySelector('#hp-focus [data-focus="45"]').click()`); await sleep(400);
    await pass(45);
    const two = await sessions('a');
    check('a second session on a habit already done is recorded too', two.length === 2 && two[1].minutes === 45, JSON.stringify(two));
    check('but earns nothing more', await ev(`__mockDB.users['u-test'].xp === 925 && __mockDB.habits.a.completedDates.length === 1`));
    check('the total adds up in hours and minutes', (await text('#focus-total')).trim() === '2 sessions, 1 h in all.' && (await ev(`document.querySelectorAll('#focus-sessions li').length`)) === 2 && /^45 min/.test((await text('#focus-sessions li')).trim()), await text('#focus-total'));
    await ev(`document.querySelector('#hp-focus [data-focus="25"]').click()`); await sleep(400);
    await ev(`document.getElementById('timer-close').click()`); await sleep(300);
    check('a session that is cancelled is not recorded', (await sessions('a')).length === 2);
    await ev(`location.hash = '#home'`); await sleep(400);
    await ev(`(() => { document.querySelector('.habit-item[data-id="b"] [data-action="timer"]').click(); const i = document.getElementById('timer-input'); i.value = '2'; i.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('timer-start').click(); })()`); await sleep(300);
    await pass(2);
    check('a session started from a row is kept as well, with the length typed', JSON.stringify((await sessions('b')).map(s => s.minutes)) === '[2]', JSON.stringify(await sessions('b')));
    await size(320, 568); await sleep(100); await open('a');
    check('320px: the three buttons fit and are thumb-sized', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#hp-focus [data-focus]')].every(b => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().right <= innerWidth)`));
    noExceptions();
  });

  scenario('focus: only the newest sixty sessions are kept, and junk in the history is ignored', async () => {
    const sixty = Array.from({ length: 60 }, (_, i) => ({ at: Date.now() - (70 - i) * 864e5, minutes: 10 }));
    await boot({ seed: seed({ a: H('Read', { sessions: sixty }), j: H('Junk', { order: 2, sessions: [{ at: 'x', minutes: 5 }, null, { at: Date.now() - 864e5, minutes: 30 }, { at: Date.now(), minutes: -4 }, 'no'] }), k: H('Odd', { order: 3, sessions: 'none' }) }), initScript: clock }); await rows(); await sleep(300);
    await open('a');
    check('sixty sessions: the total counts them all, the list shows the latest five', (await text('#focus-total')).trim() === '60 sessions, 10 h in all.' && (await ev(`document.querySelectorAll('#focus-sessions li').length`)) === 5, await text('#focus-total'));
    await ev(`document.querySelector('#hp-focus [data-focus="25"]').click()`); await sleep(400);
    await pass(25);
    const kept = await sessions('a');
    check('one more: still sixty, the oldest dropped, the new one last', kept.length === 60 && kept[59].minutes === 25 && kept[0].at === sixty[1].at, kept.length + ' ' + JSON.stringify(kept[59]));
    await ev(`document.getElementById('all-done-close')?.click()`); await sleep(200);
    await open('j');
    check('junk entries are ignored: one real session counts', (await text('#focus-total')).trim() === '1 session, 30 min in all.', await text('#focus-total'));
    await open('k');
    check('a history that is not a list shows as none', /No sessions yet/.test(await text('#focus-total')));
    const privacy = require('fs').readFileSync(require('path').resolve(__dirname, '..', '..', 'privacy.html'), 'utf8');
    check('the privacy policy says focus sessions are stored', /focus sessions/.test(privacy));
    noExceptions();
  });
};
