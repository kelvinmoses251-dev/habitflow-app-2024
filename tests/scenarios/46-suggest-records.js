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
};
