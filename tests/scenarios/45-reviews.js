// Looking back (roadmap batch 6): the guided weekly review, and the month and year stories.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now(), ...user } } } });
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const stats = async () => { await waitFor(`!document.getElementById('app').classList.contains('hidden')`); await ev(`location.hash = '#stats'`); await sleep(700); };
  const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(350); };
  const press = async (key, code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code }); await sleep(250); };
  const user = () => ev(`JSON.stringify(__mockDB.users['u-test'])`).then(JSON.parse);
  const habit = id => ev(`JSON.stringify(__mockDB.habits[${JSON.stringify(id)}])`).then(JSON.parse);
  // Last week ran from `mon` days ago (its Monday) to `sun` days ago (its Sunday), whatever today is.
  const sinceMonday = (new Date(day(0) + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const sun = sinceMonday + 1, mon = sinceMonday + 7;
  const week = () => ({
    a: H('Read 10 pages', { completedDates: run(0, mon + 7) }),                                    // 7 of 7 last week
    b: H('Run <b>far</b>', { order: 2, completedDates: [day(sun), day(mon)] }),                     // 2 of 7: slipped
    c: H('Stretch', { order: 3, completedDates: [...run(sun, sun + 4), ...run(0, sinceMonday)] }),  // 5 of 7: held
    w: H('Call home', { order: 4, frequency: 'weekly', completedDates: [day(sun + 2)] }),           // done once
  });

  // ── 56: a guided weekly review ───────────────────────────
  scenario('review: the weekly review walks through the week in four steps', async () => {
    await boot({ seed: seed(week()) }); await stats();
    check('Stats offers the review, for the week that just ended', (await visible('#review-open')) && /Not reviewed yet/.test(await trim('#review-status')) && new RegExp(' to ').test(await trim('#review-status')), await trim('#review-status'));
    await click('#review-open');
    check('it opens as a dialog on step 1', (await visible('#review-modal')) && (await trim('#review-title')) === 'Your week' && /Step 1 of 4/i.test(await trim('#review-step')), await trim('#review-step'));
    check('with the week\'s figures', /67%/.test(await trim('#review-body')) && /15 check-ins/.test(await trim('#review-body')), await trim('#review-body'));
    check('and how that compares with the week before', /(up|down) \d+ points? on the week before|the same as the week before/.test(await trim('#review-body')), await trim('#review-body'));
    await click('#review-next');
    check('step 2 names what went well', (await trim('#review-title')) === 'What went well' && /Read 10 pages/.test(await trim('#review-body')) && /7 of 7/.test(await trim('#review-body')) && /Call home/.test(await trim('#review-body')) && !/Run/.test(await trim('#review-body')), await trim('#review-body'));
    check('the title takes the focus on each step', (await ev(`document.activeElement.id`)) === 'review-title');
    await click('#review-next');
    check('step 3 names what slipped, with its numbers', (await trim('#review-title')) === 'What slipped' && /Run <b>far<\/b>/.test(await trim('#review-body')) && /2 of 7/.test(await trim('#review-body')) && !/Stretch/.test(await trim('#review-body')), await trim('#review-body'));
    check('a name with HTML in it is shown as text', !(await ev(`!!document.querySelector('#review-body b')`)));
    check('each slipped habit can be kept or paused, kept by default', await ev(`(() => { const r = [...document.querySelectorAll('#review-body input[name="slip-b"]')]; return r.length === 2 && r.find(x => x.value === 'keep').checked && !r.find(x => x.value === 'pause').checked; })()`));
    await click('#review-body input[name="slip-b"][value="pause"]');
    await click('#review-back');
    check('Back goes to step 2', (await trim('#review-title')) === 'What went well');
    await click('#review-next');
    check('and the choice is still there on return', await ev(`document.querySelector('#review-body input[name="slip-b"][value="pause"]').checked`));
    check('nothing has been paused or saved yet', !(await habit('b')).pauses && !(await user()).reviews);
    await click('#review-next');
    check('step 4 asks for one focus', (await trim('#review-title')) === 'One focus for this week' && /Step 4 of 4/i.test(await trim('#review-step')));
    const choices = await ev(`[...document.querySelectorAll('#review-body input[name="focus"]')].map(x => x.value).join(',')`);
    check('from the habits that carry on (not the one being paused), or none', choices === ',a,c,w', choices);
    check('the last button says Finish', (await trim('#review-next')) === 'Finish');
    await click('#review-body input[name="focus"][value="c"]');
    await click('#review-next');
    check('Finish closes the dialog', !(await visible('#review-modal')));
    const u = await user(), keys = Object.keys(u.reviews || {});
    check('the review is saved under the Monday of that week, with the focus', keys.length === 1 && keys[0] === day(mon) && u.reviews[keys[0]].focus === 'c' && typeof u.reviews[keys[0]].at === 'number', JSON.stringify(u.reviews));
    check('the habit chosen for a pause is paused from today, the others are not', (await habit('b')).pauses.length === 1 && (await habit('b')).pauses[0].from === day(0) && !(await habit('a')).pauses && !(await habit('c')).pauses, JSON.stringify((await habit('b')).pauses));
    check('a toast confirms it', await ev(`[...document.querySelectorAll('.toast')].some(t => /Review saved/.test(t.textContent))`));
    await sleep(400);
    check('Stats now says it was reviewed', /^Reviewed/.test(await trim('#review-status')), await trim('#review-status'));
    check('and shows the focus with this week so far', new RegExp('Stretch.*' + (sinceMonday + 1) + ' of ' + (sinceMonday + 1)).test(await trim('#review-focus')), await trim('#review-focus'));
    noExceptions();
  });

  scenario('review: leaving half way saves nothing, and a review can be done again', async () => {
    await boot({ seed: seed(week()) }); await stats();
    await click('#review-open'); await click('#review-next'); await click('#review-next');
    await click('#review-body input[name="slip-b"][value="pause"]');
    await press('Escape', 27);
    check('Escape closes it', !(await visible('#review-modal')));
    check('with nothing paused and nothing saved', !(await habit('b')).pauses && !(await user()).reviews);
    await click('#review-open');
    check('opening again starts at step 1 with nothing remembered', (await trim('#review-title')) === 'Your week');
    await click('#review-next'); await click('#review-next');
    check('(the choice is back to Keep)', await ev(`document.querySelector('#review-body input[name="slip-b"][value="keep"]').checked`));
    await click('#review-next'); await click('#review-next');
    check('finishing with no focus is fine', (await user()).reviews[day(mon)].focus === null && !(await visible('#review-focus')));
    await click('#review-open'); await click('#review-next'); await click('#review-next'); await click('#review-next');
    await click('#review-body input[name="focus"][value="a"]'); await click('#review-next');
    const u = await user();
    check('doing it again replaces that week', Object.keys(u.reviews).length === 1 && u.reviews[day(mon)].focus === 'a');
    check('a focus on a habit that is later deleted simply goes', await ev(`(() => { __mockRemote('habits', 'a', { deletedAt: Date.now() }); return true; })()`));
    await sleep(600);
    check('(no focus line, no error)', !(await visible('#review-focus')));
    noExceptions();
  });

  scenario('review: a new account, a quiet week and a phone', async () => {
    await boot({ seed: seed({ a: H('New', { createdAt: new Date().toISOString() }) }) }); await stats();
    check('with no finished week yet, the card says when to come back', !(await visible('#review-open')) && /first full week/i.test(await trim('#review-status')), await trim('#review-status'));
    await boot({ seed: seed({ a: H('Read', { completedDates: run(sun, mon) }) }) }); await stats();
    await click('#review-open'); await click('#review-next'); await click('#review-next');
    check('a week with nothing slipped says so', /Nothing slipped/.test(await trim('#review-body')), await trim('#review-body'));
    await press('Escape', 27);
    await size(375, 667);
    await boot({ seed: seed(week()) }); await stats();
    await click('#review-open'); await click('#review-next'); await click('#review-next');
    check('on a phone every choice and button is at least 44px tall', await ev(`[...document.querySelectorAll('#review-modal button:not([hidden]), #review-body label')].filter(x => x.getClientRects().length).every(x => x.getBoundingClientRect().height >= 44)`));
    check('the dialog has a handle and a way out', await ev(`!!document.querySelector('#review-modal .dialog > .sheet-handle') && !!document.querySelector('#review-modal [data-dismiss]')`));
    check('the page behind does not scroll sideways', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    noExceptions();
  });
  // ── 57: the month and the year as a short story ──────────
  const dlSpy = `window.__dl = []; const _click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, size: (this.href || '').length, png: /^data:image\\/png/.test(this.href || '') }); return; } return _click.call(this); };
    try { Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined }); } catch (_) {}`;
  const lastMonth = new Intl.DateTimeFormat('en', { timeZone: 'Africa/Lagos', month: 'long', year: 'numeric' }).format(new Date(new Date(day(0).slice(0, 8) + '01T12:00:00Z').getTime() - 864e5));
  const thisYear = day(0).slice(0, 4);
  const long = () => ({
    a: H('Read <b>10</b> pages', { completedDates: run(0, 75) }),
    b: H('Run', { order: 2, completedDates: run(0, 75).filter((_, i) => i % 2 === 0) }),
  });
  const slide = async () => ({ kicker: await trim('#story-kicker'), big: await trim('#story-big'), line: await trim('#story-line'), marks: await ev(`[...document.querySelectorAll('#story-marks i')].map(i => i.classList.contains('is-done') ? 1 : 0).join('')`), label: await ev(`document.getElementById('story-slide').getAttribute('aria-label')`) });

  scenario('story: last month is told a slide at a time, and can be saved as a picture', async () => {
    await boot({ seed: seed(long()), initScript: dlSpy }); await stats();
    check('Stats offers last month by name', (await trim('#review-stories .rv-row strong')) === lastMonth && /^Told in \d+ short slides\.$/.test(await trim('#story-month-status')), await trim('#review-stories'));
    await click('#story-open-month');
    let s = await slide();
    const n = s.marks.length;
    check('it opens on the first slide: how many days you showed up', (await visible('#story-modal')) && s.kicker === 'You showed up' && /^\d+ of \d+ days$/.test(s.big) && /check-ins in all\.$/.test(s.line), JSON.stringify(s));
    check('marks show where you are', n >= 4 && s.marks === '1' + '0'.repeat(n - 1) && s.label === 'Slide 1 of ' + n, JSON.stringify(s));
    check('on the first slide there is Close and Next, no Back', (await visible('#story-close')) && !(await visible('#story-back')) && (await trim('#story-next')) === 'Next' && !(await visible('#story-save')));
    await click('#story-next');
    s = await slide();
    check('Next moves to the rate, compared with the month before', s.kicker === 'Of everything due' && /^\d+%$/.test(s.big) && /due\. (Up|Down) \d+ points? on |due\. The same as /.test(s.line) && s.label === 'Slide 2 of ' + n, JSON.stringify(s));
    check('the slide takes the focus, so it is read out', (await ev(`document.activeElement.id`)) === 'story-slide');
    await sleep(2500);
    check('nothing moves by itself', (await slide()).kicker === 'Of everything due');
    await press('ArrowRight', 39);
    s = await slide();
    check('the Right arrow moves on, to the steadiest habit, its name shown as text', s.kicker === 'Your steadiest habit' && s.big === 'Read <b>10</b> pages' && !(await ev(`!!document.querySelector('#story-modal b')`)), JSON.stringify(s));
    await press('ArrowLeft', 37);
    check('the Left arrow moves back', (await slide()).kicker === 'Of everything due');
    await click('#story-back');
    check('and so does Back', (await slide()).kicker === 'You showed up');
    for (let i = 1; i < n; i++) await click('#story-next');
    s = await slide();
    check('the last slide is the whole month in one', s.kicker === lastMonth && s.marks === '1'.repeat(n) && /check-ins on \d+ days/.test(s.line), JSON.stringify(s));
    check('with Save picture and Done', (await visible('#story-save')) && (await trim('#story-next')) === 'Done');
    await press('ArrowRight', 39);
    check('the Right arrow does not close it by accident', await visible('#story-modal'));
    await ev(`document.getElementById('story-save').click()`); await sleep(1500);
    const dl = await ev(`window.__dl`);
    check('Save picture makes a picture on the device', dl.length === 1 && dl[0].png && dl[0].size > 20000 && /^habitly-month-\d{4}-\d{2}\.png$/.test(dl[0].name), JSON.stringify(dl));
    check('1080 by 1350, on the dark ink, with the big figure drawn', await ev(`(() => { const c = document.getElementById('story-canvas'), x = c.getContext('2d'); let lit = 0; const d = x.getImageData(96, 380, 600, 240).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 200) lit++; return c.width === 1080 && c.height === 1350 && [...x.getImageData(5, 5, 1, 1).data].slice(0, 3).join(',') === '17,17,19' && lit > 2000; })()`));
    await click('#story-next');
    check('Done closes it', !(await visible('#story-modal')));
    noExceptions();
  });

  scenario('story: the year so far, a new account, and a phone', async () => {
    await boot({ seed: seed(long()) }); await stats();
    check('the year is offered by name', new RegExp('^' + thisYear + '( so far)?$').test(await ev(`document.querySelectorAll('#review-stories .rv-row strong')[1].textContent.trim()`)) || /^\d{4}$/.test(await ev(`document.querySelectorAll('#review-stories .rv-row strong')[1].textContent.trim()`)));
    await click('#story-open-year');
    check('and opens the same way', (await visible('#story-modal')) && (await trim('#story-kicker')) === 'You showed up');
    await press('Escape', 27);
    check('Escape closes it', !(await visible('#story-modal')));
    check('the dialog has a handle and a way out', await ev(`!!document.querySelector('#story-modal .dialog > .sheet-handle') && !!document.querySelector('#story-modal [data-dismiss]')`));
    await boot({ seed: seed({ a: H('New', { createdAt: new Date().toISOString() }) }) }); await stats();
    check('with nothing done yet there is no story to open, and it says so', !(await ev(`!!document.querySelector('#review-stories [data-story]')`)) && /Nothing to tell yet/.test(await trim('#story-month-status')) && /Nothing to tell yet/.test(await trim('#story-year-status')));
    await size(375, 667);
    await boot({ seed: seed(long()) }); await stats();
    await click('#story-open-month');
    check('on a phone the buttons are thumb-sized and the big line fits', await ev(`[...document.querySelectorAll('#story-modal button')].filter(b => b.getClientRects().length).every(b => b.getBoundingClientRect().height >= 44) && document.getElementById('story-big').scrollWidth <= document.getElementById('story-big').clientWidth + 1`));
    noExceptions();
  });
};
