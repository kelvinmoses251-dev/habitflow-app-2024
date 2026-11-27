// The Statistics dashboard (roadmap batch 6): a period switcher, headline figures and each habit over the period.
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
  const pick = async p => { await ev(`document.querySelector('#stats-period [data-period="${p}"]').click()`); await sleep(350); };
  const checked = () => ev(`[...document.querySelectorAll('#stats-period [role="radio"]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.period).join(',')`);
  const three = () => ({
    a: H('Read 10 pages', { completedDates: run(0, 20) }),
    b: H('Run <b>far</b>', { order: 2, completedDates: [day(1), day(2), day(3)] }),
    w: H('Call home', { order: 3, frequency: 'weekly', completedDates: [day(2)] }),
  });

  // ── 51: a dashboard with a period switcher ───────────────
  scenario('stats: the headline figures follow the period', async () => {
    await boot({ seed: seed(three()) }); await stats();
    check('the page starts on the week', (await checked()) === 'week');
    check('and says which days that is', /^Last 7 days/.test(await trim('#stats-range')), await trim('#stats-range'));
    check('completion is what was done of what was due (today still open for Run)', (await trim('#stat-rate')) === '77%' && /10 of 13/.test(await trim('#stat-rate-sub')), await trim('#stat-rate') + ' ' + await trim('#stat-rate-sub'));
    check('check-ins count every habit, weekly ones too', (await trim('#stat-done')) === '11', await trim('#stat-done'));
    check('perfect days are days when everything due was done', (await trim('#stat-perfect')) === '3', await trim('#stat-perfect'));
    check('the streak is the account\'s, in days', (await trim('#stat-streak')) === '21', await trim('#stat-streak'));
    await pick('month');
    check('choosing Month moves the choice', (await checked()) === 'month');
    check('and every figure', (await trim('#stat-rate')) === '41%' && (await trim('#stat-done')) === '25' && /^Last 30 days/.test(await trim('#stats-range')), await trim('#stat-rate') + ' ' + await trim('#stat-done'));
    await pick('all');
    check('All time says since when', /Since 5 Jan 2025/.test(await trim('#stats-range')), await trim('#stats-range'));
    check('the old weekly report card is gone', !(await ev(`!!document.querySelector('.weekly-report-card')`)));
    check('one h1, and it is the page title', await ev(`(() => { const h = [...document.querySelectorAll('h1')].filter(x => x.getClientRects().length); return h.length === 1 && h[0].textContent.trim() === 'Statistics'; })()`));
    noExceptions();
  });

  scenario('stats: the period is remembered, and works from the keyboard', async () => {
    await boot({ seed: seed(three()) }); await stats();
    await pick('month');
    await ev(`location.reload()`); await sleep(1500); await stats();
    check('after a reload it is still Month', (await checked()) === 'month' && (await trim('#stat-done')) === '25', await checked());
    check('it is a radio group with one tab stop', await ev(`(() => { const g = document.getElementById('stats-period'); const r = [...g.querySelectorAll('[role="radio"]')]; return g.getAttribute('role') === 'radiogroup' && !!g.getAttribute('aria-label') && r.length === 4 && r.filter(b => b.tabIndex === 0).length === 1 && r.find(b => b.tabIndex === 0).dataset.period === 'month'; })()`));
    await ev(`document.querySelector('#stats-period [data-period="month"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await sleep(350);
    check('Right arrow chooses Year and keeps the focus on it', (await checked()) === 'year' && (await ev(`document.activeElement.dataset.period`)) === 'year', await checked());
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 }); await sleep(350);
    check('Home goes to Week', (await checked()) === 'week' && (await ev(`document.activeElement.dataset.period`)) === 'week');
    check('a stored period that makes no sense falls back to the week', await ev(`(() => { localStorage.setItem('habitly_stats_period', '<x>'); return true; })()`));
    await ev(`location.reload()`); await sleep(1500); await stats();
    check('(it does)', (await checked()) === 'week');
    noExceptions();
  });

  scenario('stats: each habit over the period, best first, as links to its page', async () => {
    await boot({ seed: seed(three()) }); await stats(); await pick('month');
    const rows = await ev(`[...document.querySelectorAll('#by-habit-list .rate-row')].map(r => r.dataset.id + ':' + r.querySelector('.rate-pct').textContent.trim() + ':' + r.querySelector('.rate-meta').textContent.replace(/\\s+/g, ' ').trim())`);
    check('day-by-day habits by their rate, weekly ones by count', rows.join('|') === 'a:70%:21 of 30 days|b:10%:3 of 29 days|w:1 time:Weekly habit', rows.join('|'));
    check('a name with HTML in it is shown as text', !(await ev(`!!document.querySelector('#by-habit-list b')`)) && /Run <b>far<\/b>/.test(await text('#by-habit-list')));
    check('the bar is as long as the rate', await ev(`(() => { const r = document.querySelector('#by-habit-list .rate-row[data-id="a"]'); const bg = r.querySelector('.rate-bar').getBoundingClientRect(), fill = r.querySelector('.rate-fill').getBoundingClientRect(); return Math.abs(fill.width / bg.width - 0.7) < 0.03; })()`));
    await ev(`document.querySelector('#by-habit-list .rate-row[data-id="a"]').click()`); await sleep(500);
    check('a row opens that habit\'s page', await ev(`location.hash === '#habit/a' && document.getElementById('page-habit').classList.contains('active')`));
    noExceptions();
  });

  scenario('stats: an account with only weekly habits, and an empty one, say something true', async () => {
    await boot({ seed: seed({ w: H('Call home', { frequency: 'weekly', completedDates: [day(2), day(9)] }) }) }); await stats(); await pick('month');
    check('the rate is a dash, with why', (await trim('#stat-rate')) === '–' && /weekly|monthly/i.test(await trim('#stat-rate-sub')), await trim('#stat-rate') + ' ' + await trim('#stat-rate-sub'));
    check('check-ins are counted', (await trim('#stat-done')) === '2');
    check('nothing on the page reads NaN, undefined or null', !/NaN|undefined|null/.test(await ev(`document.getElementById('page-stats').innerText`)));
    await boot({ seed: seed({}) }); await stats();
    check('with no habits the page says how to begin', (await visible('#stats-empty')) && /habit/i.test(await trim('#stats-empty')));
    check('and shows no empty figures or cards', !(await visible('#stats-body')));
    check('nothing reads NaN', !/NaN|undefined|null/.test(await ev(`document.getElementById('page-stats').innerText`)));
    noExceptions();
  });

  scenario('stats: the dashboard fits a phone and fills a desktop', async () => {
    await size(375, 667);
    await boot({ seed: seed(three()) }); await stats();
    check('period buttons are at least 44px tall on a phone', await ev(`[...document.querySelectorAll('#stats-period [role="radio"]')].every(b => b.getBoundingClientRect().height >= 44)`));
    check('the page does not scroll sideways', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    check('the four figures sit two by two', await ev(`(() => { const c = [...document.querySelectorAll('#page-stats .stat-card')].map(x => x.getBoundingClientRect()); return c.length === 4 && Math.abs(c[0].top - c[1].top) < 2 && c[2].top > c[0].bottom - 1; })()`));
    await size(1280, 800); await sleep(300);
    check('on a desktop the four figures sit in one row', await ev(`(() => { const c = [...document.querySelectorAll('#page-stats .stat-card')].map(x => x.getBoundingClientRect()); return c.every(x => Math.abs(x.top - c[0].top) < 2); })()`));
    noExceptions();
  });
};
