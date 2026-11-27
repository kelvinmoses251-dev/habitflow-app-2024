// Suggestions drawn from the data, and the personal records wall (roadmap batch 6).
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
  const morning = n => Date.parse(day(n) + 'T07:05:00+01:00');
  const slipping = (name = 'Meditate') => H(name, { completedDates: [day(2), day(6), day(10), day(14), ...run(15, 28)], completedTimestamps: Object.fromEntries(run(15, 28).map((d, i) => [d, morning(15 + i)])) });
  const dow = n => new Date(day(n) + 'T12:00:00Z').getUTCDay();
  const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ── 58: suggestions drawn from the data ──────────────────
  scenario('suggestions: a slipping habit is named with its numbers and a way to act', async () => {
    await boot({ seed: seed({ a: slipping('Meditate <b>now</b>'), b: H('Read', { order: 2, completedDates: run(0, 45).filter((_, i) => i !== 17) }) }) }); await stats();
    check('a Suggestions card appears', await visible('#suggest-card'));
    const items = await ev(`[...document.querySelectorAll('#suggest-list .sg')].map(x => x.dataset.id)`);
    check('with one suggestion, for the slipping habit', items.length === 1 && items[0] === 'slipping:a', JSON.stringify(items));
    check('it says the habit by name, as text', (await trim('#suggest-list .sg-title')) === 'Meditate <b>now</b> is slipping' && !(await ev(`!!document.querySelector('#suggest-list b')`)));
    check('with both fortnights and what used to work', (await trim('#suggest-list .sg-text')) === 'Done on 4 of the last 14 days it was due, down from 14 of 14 before that. It mostly got done in the morning. Try mornings again?', await trim('#suggest-list .sg-text'));
    check('it offers to edit the habit, or to put the suggestion away', (await trim('#suggest-list [data-suggest="act"]')) === 'Edit habit' && (await trim('#suggest-list [data-suggest="dismiss"]')) === 'Not now');
    await click('#suggest-list [data-suggest="act"]');
    check('Edit habit opens that habit in the edit sheet', (await visible('#habit-sheet')) && (await ev(`document.getElementById('habit-input').value`)) === 'Meditate <b>now</b>', await ev(`document.getElementById('habit-input').value`));
    noExceptions();
  });

  scenario('suggestions: Not now puts one away for four weeks on this device', async () => {
    await boot({ seed: seed({ a: slipping() }) }); await stats();
    await click('#suggest-list [data-suggest="dismiss"]');
    check('it goes, and the empty card with it', !(await visible('#suggest-card')) && (await ev(`document.querySelectorAll('#suggest-list .sg').length`)) === 0);
    check('and says for how long', await ev(`[...document.querySelectorAll('.toast')].some(t => /four weeks/.test(t.textContent))`));
    check('nothing was written to the account', !(await ev(`JSON.stringify(__mockDB)`)).includes('suggest'));
    await ev(`location.reload()`); await sleep(1500); await stats();
    check('it stays away after a reload', !(await visible('#suggest-card')));
    await ev(`localStorage.setItem('habitly_suggest_u-test', JSON.stringify({ 'slipping:a': ${JSON.stringify(day(29))} }))`);
    await ev(`location.reload()`); await sleep(1500); await stats();
    check('after four weeks it may come back', (await visible('#suggest-card')) && (await trim('#suggest-list .sg-title')) === 'Meditate is slipping');
    await ev(`localStorage.setItem('habitly_suggest_u-test', '{not json')`);
    await ev(`location.reload()`); await sleep(1500); await stats();
    check('a damaged store is ignored, not fatal', await visible('#suggest-card'));
    noExceptions();
  });

  scenario('suggestions: a weekday that rarely happens, nothing to say, and a phone', async () => {
    const off = dow(3);                                         // three days ago, and every same weekday before it
    const most = run(1, 60).filter((_, i) => dow(i + 1) !== off);
    await boot({ seed: seed({ a: H('Run', { completedDates: most }) }) }); await stats();
    check('a habit never done on one weekday gets a rest-day suggestion', new RegExp('^Run rarely happens on ' + DAY[off] + 's$').test(await trim('#suggest-list .sg-title')) && new RegExp('Make ' + DAY[off] + ' a rest day\\?$').test(await trim('#suggest-list .sg-text')), await trim('#suggest-list'));
    check('with Edit schedule as the way to act', (await trim('#suggest-list [data-suggest="act"]')) === 'Edit schedule');
    await boot({ seed: seed({ a: H('Read', { completedDates: run(0, 20).filter((_, i) => i % 3 !== 1) }) }) }); await stats();
    check('with nothing worth saying there is no card at all', !(await visible('#suggest-card')));
    await size(375, 667);
    await boot({ seed: seed({ a: slipping() }) }); await stats();
    check('on a phone both buttons are thumb-sized and nothing overflows', (await ev(`[...document.querySelectorAll('#suggest-list button')].every(b => b.getBoundingClientRect().height >= 44)`)) && (await ev(`document.documentElement.scrollWidth <= innerWidth`)));
    noExceptions();
  });
  // ── 60: a personal records wall ──────────────────────────
  const tile = id => ev(`(() => { const t = document.querySelector('#records .rec[data-id="${id}"]'); return t ? { label: t.querySelector('.rec-label').childNodes[0].textContent.trim(), value: t.querySelector('.rec-value').textContent.replace(/\\s+/g, ' ').trim(), detail: t.querySelector('.rec-detail').textContent.trim(), fresh: t.classList.contains('is-fresh'), tag: !!t.querySelector('.rec-new') } : null; })()`);
  scenario('records: a wall of personal bests, each with when or which habit', async () => {
    await boot({ seed: seed({
      a: H('Read <b>10</b> pages', { completedDates: [...run(0, 11), ...run(20, 50)], createdAt: new Date(Date.now() - 60 * 864e5).toISOString() }),
      b: H('Run', { order: 2, completedDates: [...run(1, 4), ...run(30, 36)], createdAt: new Date(Date.now() - 60 * 864e5).toISOString(), sessions: [{ at: Date.now() - 864e5, minutes: 25 }, { at: Date.now() - 2 * 864e5, minutes: 45 }] }),
      w: H('Call home', { order: 3, frequency: 'weekly', completedDates: [day(3), day(33)], createdAt: new Date(Date.now() - 60 * 864e5).toISOString() }),
    }) }); await stats();
    check('the wall is on the Stats page', (await visible('#records-card')) && /^Personal records/.test(await trim('#records-card .card-title')));
    const streak = await tile('streak');
    check('the longest streak, with the habit it belongs to (as text)', streak && streak.value === '31 days' && streak.detail === 'Read <b>10</b> pages' && !streak.fresh && !(await ev(`!!document.querySelector('#records b')`)), JSON.stringify(streak));
    const perfect = await tile('perfect');
    check('the longest run of perfect days, with its dates', perfect && perfect.value === '7 days' && / to /.test(perfect.detail), JSON.stringify(perfect));
    const best = await tile('day');
    check('the fullest day, marked New because it was this week', best && best.value === '3 check-ins' && best.fresh && best.tag && /\d{4}$/.test(best.detail), JSON.stringify(best));
    check('the most-done habit', (await tile('habit')).value === '43 times' && (await tile('habit')).detail === 'Read <b>10</b> pages', JSON.stringify(await tile('habit')));
    check('every check-in, and how many days you showed up', (await tile('total')).value === '56 check-ins' && /^Since /.test((await tile('total')).detail) && (await tile('active')).value === '43 days' && /^Of 6[01] since you began$/.test((await tile('active')).detail), JSON.stringify([await tile('total'), await tile('active')]));
    check('time in focus', (await tile('focus')).value === '1 h 10 min' && (await tile('focus')).detail === '2 sessions', JSON.stringify(await tile('focus')));
    check('a best week and a best month', !!(await tile('week')) && !!(await tile('month')));
    check('New is said in words, not only by colour', (await ev(`document.querySelector('#records .rec.is-fresh .rec-new').textContent`)) === 'New');
    noExceptions();
  });

  scenario('records: a streak still running, an account with nothing done, and a phone', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(0, 11), createdAt: new Date(Date.now() - 40 * 864e5).toISOString() }) }) }); await stats();
    const streak = await tile('streak');
    check('a streak that is still going says so, and is marked New', streak && streak.value === '12 days' && streak.detail === 'Read, and still going' && streak.fresh, JSON.stringify(streak));
    await boot({ seed: seed({ a: H('Idle') }) }); await stats();
    check('with nothing done there are no tiles, only how to begin', (await visible('#records-none')) && !(await ev(`!!document.querySelector('#records .rec')`)) && !/NaN|undefined|null/.test(await trim('#records-card')));
    await size(375, 667);
    await boot({ seed: seed({ a: H('Read a very long habit name that goes on and on', { completedDates: run(0, 11) }) }) }); await stats();
    check('on a phone the tiles sit two across and nothing overflows', await ev(`(() => { const t = [...document.querySelectorAll('#records .rec')].map(x => x.getBoundingClientRect()); return t.length >= 4 && Math.abs(t[0].top - t[1].top) < 2 && t[2].top > t[0].top + 10 && document.documentElement.scrollWidth <= innerWidth && t.every(r => r.right <= innerWidth); })()`));
    noExceptions();
  });
};
