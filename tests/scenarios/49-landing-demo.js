// The landing demo as a mini-app (roadmap batch 7): Today and Stats, with a week of sample history.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const landing = async () => { await waitFor(`!document.getElementById('auth-screen').classList.contains('hidden')`); await sleep(300); };
  const tick = async i => { await ev(`document.querySelectorAll('#demo-list .demo-habit')[${i}].click()`); await sleep(250); };
  const tab = async name => { await ev(`document.querySelector('#demo-tabs [data-tab="${name}"]').click()`); await sleep(250); };

  // ── 68: the demo is a mini-app with a week of sample history ─
  scenario('demo: it opens with a week of sample history, and ticking moves it', async () => {
    await boot(); await landing();
    check('the demo has two tabs, Today chosen', await ev(`(() => { const t = [...document.querySelectorAll('#demo-tabs [role="tab"]')]; return t.length === 2 && t[0].textContent.trim() === 'Today' && t[1].textContent.trim() === 'Stats' && t[0].getAttribute('aria-selected') === 'true' && t[1].getAttribute('aria-selected') === 'false'; })()`));
    check('a streak is already running from the sample week, waiting on today', (await trim('#demo-streak-n')) === '6' && !(await ev(`document.getElementById('demo-streak').classList.contains('lit')`)), await trim('#demo-streak-n'));
    await tick(0);
    check('ticking the habit on a six-day run makes it seven, and lights it', (await trim('#demo-streak-n')) === '7' && await ev(`document.getElementById('demo-streak').classList.contains('lit')`), await trim('#demo-streak-n'));
    await tick(0);
    check('unticking takes it back', (await trim('#demo-streak-n')) === '6');
    await tab('stats');
    check('Stats shows instead of the list', (await visible('#demo-stats')) && !(await visible('#demo-today')) && (await ev(`document.querySelector('#demo-tabs [data-tab="stats"]').getAttribute('aria-selected')`)) === 'true');
    check('it says plainly that the history is a sample', /sample/i.test(await trim('#demo-stats')), await trim('#demo-stats'));
    check('a week of seven days, the last one today', (await ev(`document.querySelectorAll('#demo-week .dw-day').length`)) === 7 && await ev(`document.querySelector('#demo-week .dw-day:last-child').classList.contains('is-today')`));
    const before = await trim('#demo-rate');
    check('the week\'s figure is stated with its numbers', /^\d+%$/.test(before) && /13 of 21/.test(await trim('#demo-rate-sub')), before + ' ' + await trim('#demo-rate-sub'));
    check('each habit has its own row of seven days and its streak', (await ev(`document.querySelectorAll('#demo-habits-week .dh-row').length`)) === 3 && (await ev(`document.querySelectorAll('#demo-habits-week .dh-row')[0].querySelectorAll('.dh-dot').length`)) === 7 && /6 days/.test(await trim('#demo-habits-week .dh-row')), await trim('#demo-habits-week'));
    await tab('today'); await tick(0); await tick(1); await tab('stats');
    check('ticking today moves the figures', /15 of 21/.test(await trim('#demo-rate-sub')) && (await trim('#demo-rate')) !== before && /7 days/.test(await trim('#demo-habits-week .dh-row')), await trim('#demo-rate-sub'));
    check('today\'s column fills as habits are ticked', await ev(`document.querySelector('#demo-week .dw-day.is-today .dw-fill').getBoundingClientRect().height > 10`));
    noExceptions();
  });

  scenario('demo: the tabs work from the keyboard, and the sample never becomes real history', async () => {
    await boot(); await landing();
    await ev(`document.querySelector('#demo-tabs [data-tab="today"]').focus()`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await sleep(250);
    check('Right arrow moves to Stats and shows it', (await ev(`document.activeElement.dataset.tab`)) === 'stats' && (await visible('#demo-stats')));
    check('one tab stop, and each tab names its panel', await ev(`(() => { const t = [...document.querySelectorAll('#demo-tabs [role="tab"]')]; return t.filter(x => x.tabIndex === 0).length === 1 && t.every(x => document.getElementById(x.getAttribute('aria-controls')).getAttribute('role') === 'tabpanel'); })()`));
    await tab('today'); await tick(0);
    await ev(`(() => { const i = document.getElementById('demo-add-input'); i.value = 'Call mum'; document.getElementById('demo-add-form').requestSubmit(); })()`); await sleep(300);
    const saved = JSON.parse(await ev(`localStorage.getItem('habitly_demo')`));
    check('what is kept for a new account is the habits and today\'s ticks only', saved.habits.length === 4 && saved.habits.every(h => Object.keys(h).sort().join() === 'category,done,id,name') && saved.habits[0].done === true, JSON.stringify(saved));
    await tab('stats');
    check('a habit the visitor added has no invented past', await ev(`(() => { const r = [...document.querySelectorAll('#demo-habits-week .dh-row')].pop(); return /Call mum/.test(r.textContent) && r.querySelectorAll('.dh-dot.is-done').length === 0 && /new/i.test(r.textContent); })()`), await trim('#demo-habits-week'));
    await ev(`location.reload()`); await sleep(1200); await landing();
    check('after a reload the tick and the streak are still there', (await trim('#demo-streak-n')) === '7');
    noExceptions();
  });

  scenario('demo: it fits a small phone, and the page tells search engines what it is', async () => {
    await boot(); await landing(); await size(320, 640); await sleep(400); await tab('stats');
    check('nothing overflows at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    check('tabs are thumb-sized', await ev(`[...document.querySelectorAll('#demo-tabs [role="tab"]')].every(b => b.getBoundingClientRect().height >= 44)`));
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
    let data = null; try { data = JSON.parse(ld); } catch (_) { /* checked below */ }
    check('the page carries structured data for a free web application', !!data && data['@type'] === 'WebApplication' && data.name === 'Habitly' && data.offers && String(data.offers.price) === '0', ld ? ld.slice(0, 120) : 'none');
    check('with no invented ratings or reviews in it', !!data && !('aggregateRating' in data) && !('review' in data));
    check('robots.txt allows crawling and points to the sitemap', /User-agent: \*/.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')) && /Sitemap: https:\/\/habit-tracker-demo-34c0a\.web\.app\/sitemap\.xml/.test(fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8')));
    check('the sitemap lists the public pages', ['/', '/privacy.html', '/terms.html'].every(p => fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8').includes('https://habit-tracker-demo-34c0a.web.app' + p + '<')));
    const staged = require('child_process').execSync('node tools/deploy.js --dry', { cwd: ROOT }).toString();
    check('and both are published', /robots\.txt/.test(staged) && /sitemap\.xml/.test(staged));
    noExceptions();
  });
};
