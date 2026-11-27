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
};
