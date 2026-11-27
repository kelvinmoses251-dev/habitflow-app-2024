// The charts on the Statistics page (roadmap batch 6): drawn in-house as SVG, with detail on hover, tap and arrow keys.
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
  const press = async (key, code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code }); await sleep(150); };
  const weekday = n => new Intl.DateTimeFormat('en', { timeZone: 'Africa/Lagos', weekday: 'short' }).format(Date.now() - n * 864e5);
  const three = () => ({
    a: H('Read 10 pages', { completedDates: run(0, 20), category: 'reading' }),
    b: H('Run <b>far</b>', { order: 2, completedDates: [day(1), day(2), day(3)], category: 'fitness' }),
    w: H('Call home', { order: 3, frequency: 'weekly', completedDates: [day(2)], category: 'social' }),
  });
  const bars = () => ev(`[...document.querySelectorAll('#bars .bar-slot')].map(g => g.dataset.v).join(',')`);

  // ── 52: charts drawn in-house ────────────────────────────
  scenario('charts: the check-ins chart is SVG, one bar per day, with no chart library', async () => {
    await boot({ seed: seed(three()) }); await stats(); await sleep(1500);
    check('seven bars for the week, each as tall as its check-ins', (await bars()) === '1,1,1,2,3,2,1', await bars());
    check('drawn as SVG', await ev(`!!document.querySelector('#bars svg') && !document.querySelector('#page-stats canvas')`));
    check('the tallest bar is the tallest', await ev(`(() => { const r = [...document.querySelectorAll('#bars .bar-rect')].map(x => x.getBoundingClientRect().height); return r[4] === Math.max(...r) && r[4] > r[0] * 2.5; })()`));
    check('today\'s bar is marked', await ev(`[...document.querySelectorAll('#bars .bar-slot')].map(g => g.classList.contains('is-now')).join() === 'false,false,false,false,false,false,true'`));
    check('Chart.js is never loaded', (await ev(`typeof window.Chart`)) === 'undefined' && !(await ev(`[...document.scripts].some(s => /chart/i.test(s.src))`)));
    check('and the app no longer knows of it', !(await ev(`fetch('/app.js').then(r => r.text()).then(t => /chart\\.umd|chart\\.js@/.test(t))`)));
    check('the chart says its total in words', /11 check-ins/.test(await trim('#bars .chart-detail')), await trim('#bars .chart-detail'));
    check('and every bar is in a table for screen readers', (await ev(`document.querySelectorAll('#bars .sr-only tbody tr').length`)) === 7 && /check-ins/i.test(await text('#bars .sr-only caption')));
    await pick('month');
    check('a month is thirty bars', (await ev(`document.querySelectorAll('#bars .bar-slot').length`)) === 30);
    await pick('year');
    check('a year is twelve', (await ev(`document.querySelectorAll('#bars .bar-slot').length`)) === 12);
    await pick('all');
    check('all time is by month for a young account', (await ev(`document.querySelectorAll('#bars .bar-slot').length`)) >= 22);
    check('axis labels never overlap', await ev(`(() => { const t = [...document.querySelectorAll('#bars .x-label')].map(x => x.getBoundingClientRect()).sort((a, b) => a.left - b.left); return t.length >= 2 && t.every((r, i) => !i || r.left >= t[i - 1].right - 1); })()`));
    noExceptions();
  });

  scenario('charts: a bar gives its detail on tap, on hover and from the keyboard', async () => {
    await boot({ seed: seed(three()) }); await stats();
    const rest = await trim('#bars .chart-detail');
    await ev(`document.querySelectorAll('#bars .bar-slot')[4].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))`); await sleep(150);
    check('tapping a bar says that day: check-ins and what was due', new RegExp('^' + weekday(2) + ' .*: 3 check-ins, 2 of 2 due done').test(await trim('#bars .chart-detail')), await trim('#bars .chart-detail'));
    check('and marks the bar', await ev(`document.querySelectorAll('#bars .bar-slot')[4].classList.contains('is-on') && document.querySelectorAll('#bars .is-on').length === 1`));
    await ev(`document.querySelectorAll('#bars .bar-slot')[3].dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))`); await sleep(150);
    check('hovering another moves the detail', /2 check-ins, 2 of 2 due done/.test(await trim('#bars .chart-detail')), await trim('#bars .chart-detail'));
    await ev(`document.querySelector('#bars').dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }))`); await sleep(150);
    check('leaving with the mouse returns to the summary', (await trim('#bars .chart-detail')) === rest, await trim('#bars .chart-detail'));
    check('the plot can be reached with Tab and says how to use it', await ev(`(() => { const p = document.querySelector('#bars .chart-plot'); return p.tabIndex === 0 && /arrow/i.test(p.getAttribute('aria-label')) ; })()`));
    await ev(`document.querySelector('#bars .chart-plot').focus()`);
    await press('ArrowLeft', 37);
    check('the first arrow key reads today (so far)', new RegExp('^' + weekday(0) + ' .*: 1 check-in, .*so far').test(await trim('#bars .chart-detail')), await trim('#bars .chart-detail'));
    await press('ArrowLeft', 37);
    check('Left moves a day back', new RegExp('^' + weekday(1) + ' ').test(await trim('#bars .chart-detail')), await trim('#bars .chart-detail'));
    await press('Home', 36);
    check('Home goes to the first bar', await ev(`document.querySelectorAll('#bars .bar-slot')[0].classList.contains('is-on')`));
    await press('Escape', 27);
    check('Escape returns to the summary', (await trim('#bars .chart-detail')) === rest && !(await ev(`!!document.querySelector('#bars .is-on')`)));
    check('the detail line is announced politely', (await ev(`document.querySelector('#bars .chart-detail').getAttribute('aria-live')`)) === 'polite');
    noExceptions();
  });

  scenario('charts: colours follow the theme without a redraw, and the chart follows the width', async () => {
    await size(1280, 800);
    await boot({ seed: seed(three()), mobile: false }); await stats();
    const before = await ev(`(() => { window.__bar = document.querySelector('#bars .bar-slot.is-now .bar-rect'); return getComputedStyle(window.__bar).fill; })()`);
    await ev(`document.documentElement.setAttribute('data-theme', 'dark'); document.body.setAttribute('data-theme', 'dark')`); await sleep(200);
    check('switching theme recolours the same bar', await ev(`document.querySelector('#bars .bar-slot.is-now .bar-rect') === window.__bar && getComputedStyle(window.__bar).fill !== ${JSON.stringify(before)}`));
    const wide = await ev(`document.querySelector('#bars svg').viewBox.baseVal.width`);
    check('on a desktop the chart is drawn at the width of its card', wide > 700 && await ev(`Math.abs(document.querySelector('#bars svg').getBoundingClientRect().width - document.querySelector('#bars svg').viewBox.baseVal.width) < 2`), String(wide));
    await size(375, 667); await sleep(600);
    check('made narrow, it is drawn again to fit', await ev(`(() => { const s = document.querySelector('#bars svg'); return s.viewBox.baseVal.width < 360 && Math.abs(s.getBoundingClientRect().width - s.viewBox.baseVal.width) < 2; })()`), String(await ev(`document.querySelector('#bars svg').viewBox.baseVal.width`)));
    check('text in the chart stays a readable size', await ev(`[...document.querySelectorAll('#bars svg text')].every(t => parseFloat(getComputedStyle(t).fontSize) >= 11)`));
    check('the page does not scroll sideways', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    noExceptions();
  });

  scenario('charts: a period with nothing done says so, and categories are listed without a pie', async () => {
    await boot({ seed: seed({ a: H('New today', { createdAt: new Date().toISOString() }) }) }); await stats();
    check('no bars are drawn for nothing', !(await ev(`!!document.querySelector('#bars svg')`)) && /No check-ins/.test(await trim('#bars')), await trim('#bars'));
    await boot({ seed: seed(three()) }); await stats();
    const cats = await ev(`[...document.querySelectorAll('#cat-list .cat-row')].map(r => r.dataset.cat + ':' + r.querySelector('.cat-n').textContent.trim()).join('|')`);
    check('categories by check-ins this period, most first', cats === 'reading:7|fitness:3|social:1', cats);
    check('each is named, not only coloured', /Reading/.test(await text('#cat-list')) && /Fitness/.test(await text('#cat-list')));
    noExceptions();
  });
};
