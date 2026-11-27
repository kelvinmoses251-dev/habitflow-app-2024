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
  // ── 54: the rate as a line, against the period before ────
  scenario('trend: the completion rate is drawn against the period before', async () => {
    await boot({ seed: seed(three()) }); await stats();
    check('the rate and the change are stated', (await trim('#trend-rate')) === '77%' && /27 points up/.test(await trim('#trend-delta')), await trim('#trend-rate') + ' ' + await trim('#trend-delta'));
    check('the change has an icon as well as words', await ev(`!!document.querySelector('#trend-delta use[href="#i-trend-up"]')`));
    check('and said in a sentence with both figures', /^77% done \(10 of 13\), up 27 points on the 7 days before \(50%\)\.$/.test(await trim('#trend .chart-detail')), await trim('#trend .chart-detail'));
    check('this period is a solid line, the one before a dashed one', await ev(`(() => { const a = document.querySelector('#trend .trend-now'), b = document.querySelector('#trend .trend-before'); return !!a && !!b && getComputedStyle(a).strokeDasharray === 'none' && getComputedStyle(b).strokeDasharray !== 'none'; })()`));
    check('a legend says which is which', /Last 7 days/.test(await text('#trend .chart-legend')) && /The 7 days before/.test(await text('#trend .chart-legend')));
    await ev(`document.querySelectorAll('#trend .trend-pt')[4].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))`); await sleep(150);
    check('a point gives that day and the same day a week earlier', new RegExp('^' + weekday(2) + ' .*: 100% \\(2 of 2\\)\\. ' + weekday(9) + ' .*: 50%\\.$').test(await trim('#trend .chart-detail')), await trim('#trend .chart-detail'));
    await ev(`document.querySelector('#trend .chart-plot').focus()`); await press('End', 35); await press('ArrowLeft', 37);
    check('arrow keys walk the points', await ev(`document.querySelectorAll('#trend .trend-pt')[5].classList.contains('is-on')`));
    await pick('month');
    check('a month has six points', (await ev(`document.querySelectorAll('#trend .trend-pt').length`)) === 6);
    await pick('all');
    check('all time has nothing to compare with, and says so', !(await ev(`!!document.querySelector('#trend .trend-before')`)) && !(await ev(`!!document.getElementById('trend-delta')`)) && /since the start/.test(await trim('#trend .chart-detail')), await trim('#trend .chart-detail'));
    check('a table carries the same for screen readers', (await ev(`document.querySelectorAll('#trend .sr-only tbody tr').length`)) >= 22);
    noExceptions();
  });

  scenario('trend: new accounts, rest days and weekly-only accounts are drawn honestly', async () => {
    await boot({ seed: seed({ a: H('New', { createdAt: new Date(Date.now() - 2 * 864e5).toISOString(), completedDates: run(0, 2) }) }) }); await stats();
    check('with no earlier days, there is no dashed line and no change figure', !(await ev(`!!document.querySelector('#trend .trend-before')`)) && !(await ev(`!!document.getElementById('trend-delta')`)));
    check('and the sentence says why', /nothing to compare with yet/.test(await trim('#trend .chart-detail')), await trim('#trend .chart-detail'));
    const dow = n => new Date(day(n) + 'T12:00:00Z').getUTCDay();
    const offDay = dow(3);                                      // make three days ago a rest day
    await boot({ seed: seed({ a: H('Most days', { schedule: { type: 'days', days: [0, 1, 2, 3, 4, 5, 6].filter(d => d !== offDay) }, completedDates: run(0, 6) }) }) }); await stats();
    check('a rest day breaks the line instead of dropping it to zero', (await ev(`(document.querySelector('#trend .trend-now').getAttribute('d').match(/M/g) || []).length`)) === 2, await ev(`document.querySelector('#trend .trend-now').getAttribute('d')`));
    await boot({ seed: seed({ w: H('Call home', { frequency: 'weekly', completedDates: [day(2)] }) }) }); await stats();
    check('a weekly-only account gets a sentence, not an empty chart', !(await ev(`!!document.querySelector('#trend svg')`)) && /no rate to draw/.test(await trim('#trend')), await trim('#trend'));
    noExceptions();
  });
  // ── 53: the year, a square a day ─────────────────────────
  const cellOf = n => `document.querySelector('#heat .hc[data-day="${day(n)}"]')`;
  scenario('year: a full-width heatmap with month labels and day detail', async () => {
    await size(1280, 800);
    await boot({ seed: seed(three()), mobile: false }); await stats();
    check('fifty-three weeks of squares, the first a Monday', await ev(`(() => { const all = document.querySelectorAll('#heat .heat-grid .hc'); const first = document.querySelector('#heat .hc[data-day]').dataset.day; return all.length === 371 && new Date(first + 'T12:00:00Z').getUTCDay() === 1; })()`));
    check('today is the last square, and marked', await ev(`(() => { const d = [...document.querySelectorAll('#heat .hc[data-day]')]; const last = d[d.length - 1]; return last.dataset.day === ${JSON.stringify(day(0))} && last.classList.contains('is-today'); })()`));
    check('a day with everything done is the darkest, half done is in between, nothing is blank', await ev(`${cellOf(2)}.classList.contains('l-4') && ${cellOf(5)}.classList.contains('l-2') && ${cellOf(25)}.classList.contains('l-0')`));
    check('the darkest and the blank really differ in colour', await ev(`getComputedStyle(${cellOf(2)}).backgroundColor !== getComputedStyle(${cellOf(25)}).backgroundColor`));
    check('month labels are there and do not overlap', await ev(`(() => { const t = [...document.querySelectorAll('#heat .heat-months span')].map(x => x.getBoundingClientRect()); return t.length >= 11 && t.every((r, i) => !i || r.left >= t[i - 1].right); })()`));
    check('on a desktop it fills the card without scrolling', await ev(`(() => { const s = document.querySelector('#heat .heat-scroll'), g = document.querySelector('#heat .heat-grid').getBoundingClientRect(), card = document.querySelector('.heat-card').getBoundingClientRect(); return s.scrollWidth <= s.clientWidth + 1 && g.width > card.width * 0.8; })()`));
    check('it says the year in a sentence', /^Active on 21 of the last 3\d\d days, with everything done on 3\.$/.test(await trim('#heat .chart-detail')), await trim('#heat .chart-detail'));
    check('a legend explains the shades', (await ev(`document.querySelectorAll('#heat .heat-legend .hc').length`)) === 5 && /Less/.test(await text('#heat .heat-legend')));
    await ev(`${cellOf(2)}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))`); await sleep(150);
    check('tapping a day names what was done', / \d{4}: 2 of 2 due done\. Done: Read 10 pages, Run <b>far<\/b>, Call home\.$/.test(await trim('#heat .chart-detail')), await trim('#heat .chart-detail'));
    check('names are shown as text', !(await ev(`!!document.querySelector('#heat .chart-detail b')`)));
    await ev(`${cellOf(5)}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }))`); await sleep(150);
    check('and what was missed', /1 of 2 due done\. Done: Read 10 pages\. Missed: Run <b>far<\/b>\.$/.test(await trim('#heat .chart-detail')), await trim('#heat .chart-detail'));
    check('the old sixteen-week grid is gone', !(await ev(`!!document.getElementById('heatmap')`)));
    noExceptions();
  });

  scenario('year: the heatmap works from the keyboard and on a phone', async () => {
    await size(375, 667);
    await boot({ seed: seed(three()) }); await stats();
    check('on a phone it scrolls inside its own box, starting at today', await ev(`(() => { const s = document.querySelector('#heat .heat-scroll'); return s.scrollWidth > s.clientWidth + 50 && s.scrollLeft + s.clientWidth >= s.scrollWidth - 2; })()`));
    check('and the page does not scroll sideways', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    check('squares are big enough to tap', await ev(`document.querySelector('#heat .hc[data-day]').getBoundingClientRect().width >= 13`));
    await ev(`document.querySelector('#heat .heat-scroll').focus()`);
    await press('ArrowLeft', 37);
    check('the first arrow key lands on today, and says what is still open', (await ev(`${cellOf(0)}.classList.contains('is-on')`)) && /1 of 2 due done\. Done: Read 10 pages\. Still open: Run/.test(await trim('#heat .chart-detail')), await trim('#heat .chart-detail'));
    await press('ArrowUp', 38);
    check('Up is the day before', await ev(`${cellOf(1)}.classList.contains('is-on')`));
    await press('ArrowLeft', 37);
    check('Left is a week before', await ev(`${cellOf(8)}.classList.contains('is-on')`));
    await press('ArrowRight', 39); await press('ArrowDown', 40); await press('ArrowDown', 40);
    check('it never walks into the future', await ev(`${cellOf(0)}.classList.contains('is-on')`));
    await press('Home', 36);
    check('Home goes to the first day, scrolled into view', await ev(`(() => { const c = document.querySelector('#heat .hc[data-i="0"]'), s = document.querySelector('#heat .heat-scroll').getBoundingClientRect(), r = c.getBoundingClientRect(); return c.classList.contains('is-on') && r.left >= s.left - 1 && r.right <= s.right + 1; })()`));
    await press('Escape', 27);
    check('Escape returns to the summary', /^Active on/.test(await trim('#heat .chart-detail')));
    noExceptions();
  });
  // ── 55: the balance between categories ───────────────────
  scenario('balance: where the check-ins went, and which areas went quiet', async () => {
    await boot({ seed: seed({ ...three(), q: H('Sit still', { order: 4, category: 'mind' }) }) }); await stats();
    const rows = await ev(`[...document.querySelectorAll('#cat-list .cat-row')].map(r => r.dataset.cat + ':' + r.querySelector('.cat-share').textContent.trim() + ':' + r.querySelector('.cat-n').textContent.trim()).join('|')`);
    check('each category with its share and its count, most first, the quiet one last', rows === 'reading:64%:7|fitness:27%:3|social:9%:1|mind:none:0', rows);
    check('one bar is split by share, widest first', await ev(`(() => { const s = [...document.querySelectorAll('#cat-list .bal-seg')].map(x => x.getBoundingClientRect().width); const all = s.reduce((a, b) => a + b, 0); return s.length === 3 && Math.abs(s[0] / all - 0.64) < 0.04 && s[0] > s[1] && s[1] > s[2]; })()`));
    check('each segment has its category colour, and they differ', await ev(`(() => { const c = [...document.querySelectorAll('#cat-list .bal-seg')].map(x => getComputedStyle(x).backgroundColor); return new Set(c).size === 3 && c.every(v => v !== 'rgba(0, 0, 0, 0)'); })()`));
    check('each row says how many habits and how they did', /1 habit · 100% of what was due/.test(await trim('#cat-list .cat-row[data-cat="reading"]')) && /1 habit · 50% of what was due/.test(await trim('#cat-list .cat-row[data-cat="fitness"]')) && /no daily rate/.test(await trim('#cat-list .cat-row[data-cat="social"]')), await trim('#cat-list'));
    check('a sentence names the largest and the quiet one', (await trim('#balance-says')) === 'Reading took 64% of your check-ins. Mind had none.', await trim('#balance-says'));
    check('the quiet category is marked by more than colour', await ev(`document.querySelector('#cat-list .cat-row[data-cat="mind"]').classList.contains('is-quiet')`) && /none/.test(await trim('#cat-list .cat-row[data-cat="mind"]')));
    await pick('month');
    check('it follows the period', /^reading:84%:21\|/.test(await ev(`[...document.querySelectorAll('#cat-list .cat-row')].map(r => r.dataset.cat + ':' + r.querySelector('.cat-share').textContent.trim() + ':' + r.querySelector('.cat-n').textContent.trim()).join('|')`)));
    check('the card is called Balance', /^Balance/.test(await trim('.balance-card .card-title')));
    noExceptions();
  });

  scenario('balance: one area, many areas and none', async () => {
    await boot({ seed: seed({ a: H('Read', { completedDates: run(0, 3), category: 'reading' }) }) }); await stats();
    check('one area says so', (await trim('#balance-says')) === 'Every check-in in this period went to Reading.', await trim('#balance-says'));
    const many = Object.fromEntries(['health', 'mind', 'social', 'growth', 'fitness'].map((cat, i) => [cat, H('H ' + cat, { order: i, category: cat, completedDates: [day(1), day(2)] })]));
    await boot({ seed: seed(many) }); await stats();
    check('an even spread is called a spread', /^Your check-ins are spread over 5 areas; .* leads with 20%\.$/.test(await trim('#balance-says')), await trim('#balance-says'));
    check('shares add up to 100', (await ev(`[...document.querySelectorAll('#cat-list .cat-share')].reduce((s, x) => s + parseInt(x.textContent, 10), 0)`)) === 100);
    await boot({ seed: seed({ a: H('<i>Odd</i>', { category: '<img src=x onerror=alert(1)>' }) }) }); await stats();
    check('a category the app does not know is shown as Health, and nothing is injected', /Health/.test(await trim('#cat-list')) && !(await ev(`!!document.querySelector('#cat-list img, #cat-list i:not(.cat-dot)')`)) && /No check-ins|none/.test(await trim('#cat-list')));
    noExceptions();
  });
};
