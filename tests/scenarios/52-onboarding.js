// Getting started (roadmap batch 7): the goal picker for an account with no habits, and installing the app.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const inApp = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`, 5000);
  const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(350); };
  const empty = async () => { await boot({ seed: signedIn({ mock_fb_db: { habits: {}, users: { 'u-test': { xp: 0 } } } }) }); await inApp(); await waitFor(`!!document.querySelector('#goal-chips [data-goal]')`, 5000); await sleep(200); };
  const goal = name => click(`#goal-chips [data-goal="${name}"]`);
  const suggested = () => ev(`JSON.stringify([...document.querySelectorAll('#goal-list input')].map(i => [i.closest('li').querySelector('.goal-name').textContent.trim(), i.checked]))`).then(JSON.parse);
  const habits = () => ev(`JSON.stringify(Object.values(__mockDB.habits).map(h => ({ name: h.name, target: h.target || null, schedule: h.schedule || null, done: h.completedDates.length })))`).then(JSON.parse);

  // ── 64: a goal picker that suggests first habits ─────────
  scenario('goals: a new account picks what it wants more of, and gets first habits suggested', async () => {
    await empty();
    check('the empty Home asks what you want more of', (await visible('#goal-picker')) && /What do you want more of/.test(await trim('#goal-picker')));
    check('eight goals, as buttons that say whether they are picked', await ev(`(() => { const b = [...document.querySelectorAll('#goal-chips [data-goal]')]; return b.length === 8 && b.every(x => x.tagName === 'BUTTON' && x.getAttribute('aria-pressed') === 'false'); })()`));
    check('nothing is suggested until a goal is picked', !(await visible('#goal-suggest')));
    await goal('Fitness');
    let s = await suggested();
    check('one goal suggests three habits, all ticked', (await visible('#goal-suggest')) && s.length === 3 && s.every(x => x[1]) && s[0][0] === 'Walk', JSON.stringify(s));
    check('each suggestion says how often and how much', /8,?000 steps/.test(await trim('#goal-list li')), await trim('#goal-list li'));
    check('the button counts them', (await trim('#goal-add')) === 'Add 3 habits');
    await goal('Calm');
    s = await suggested();
    check('a second goal brings the list to four, taking turns', s.length === 4 && (await ev(`document.querySelector('#goal-chips [data-goal="Calm"]').getAttribute('aria-pressed')`)) === 'true', JSON.stringify(s));
    await click('#goal-list li:last-child input');
    check('unticking one changes the count', (await trim('#goal-add')) === 'Add 3 habits' && (await suggested()).filter(x => x[1]).length === 3);
    await ev(`document.querySelectorAll('#goal-list input:checked').forEach(i => i.click())`); await sleep(200);
    check('with none ticked there is nothing to add', await ev(`document.getElementById('goal-add').disabled`));
    await ev(`document.querySelectorAll('#goal-list input').forEach((i, n) => { if (n < 2) i.click(); })`); await sleep(200);
    const want = (await suggested()).filter(x => x[1]).map(x => x[0]);
    await click('#goal-add'); await sleep(600);
    const made = await habits();
    check('Add makes exactly the ticked habits', made.length === 2 && want.every(n => made.some(h => h.name === n)), JSON.stringify(made));
    check('with the goal and schedule the library gives them', made.some(h => h.name === 'Walk' && h.target && h.target.amount === 8000), JSON.stringify(made));
    check('none of them is marked done', made.every(h => h.done === 0));
    check('Home shows them, and the picker is gone', (await ev(`document.querySelectorAll('#habits .habit-item').length`)) === 2 && !(await visible('#goal-picker')));
    check('it says what happened', await ev(`[...document.querySelectorAll('.toast')].some(t => /2 habits added/.test(t.textContent))`));
    const ev1 = JSON.parse(await ev(`JSON.stringify((window.__mockEvents || []).filter(e => e.name === 'goals_picked'))`));
    check('analytics gets counts only, never names', ev1.length === 1 && ev1[0].params.goals === 2 && ev1[0].params.habits === 2 && !/Walk|Stretch/.test(JSON.stringify(ev1)), JSON.stringify(ev1));
    noExceptions();
  });

  scenario('goals: the picker is only for an account with no habits, and fits a phone', async () => {
    await empty();
    check('the ready-made sets are still offered below it', (await ev(`document.querySelectorAll('#starter-packs .pack-card').length`)) === 4);
    await goal('Focus'); await goal('Focus');
    check('unpicking the only goal puts the suggestions away', !(await visible('#goal-suggest')) && (await ev(`document.querySelector('#goal-chips [data-goal="Focus"]').getAttribute('aria-pressed')`)) === 'false');
    await size(320, 640); await sleep(300);
    await goal('Energy');
    check('at 320px nothing overflows and every control is thumb-sized', (await ev(`document.documentElement.scrollWidth <= innerWidth`)) && await ev(`[...document.querySelectorAll('#goal-chips button, #goal-add, #goal-list label')].every(b => b.getBoundingClientRect().height >= 44)`));
    await boot({ seed: signedIn({ mock_fb_db: { habits: { a: { userId: 'u-test', name: 'Read', category: 'reading', frequency: 'daily', completedDates: [], createdAt: new Date().toISOString(), order: 1 } } } }) }); await inApp(); await sleep(500);
    check('an account that already has a habit never sees the picker', !(await visible('#goal-picker')) && !(await visible('#empty-state')));
    noExceptions();
  });
  // ── 69: a designed install experience ────────────────────
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
  const noOffer = `window.addEventListener('beforeinstallprompt', e => { if (!e.prompt || !window.__letOffer) e.stopImmediatePropagation(); }, true);`;
  const profile = async opts => { await boot({ seed: signedIn(), hash: '#profile', initScript: noOffer, ...opts }); await inApp(); await sleep(500); };
  scenario('install: Profile always offers it, with the right help for the device', async () => {
    await profile();
    check('Install app is in Profile whether or not the browser has offered', (await visible('#install-app-row')) && (await visible('#install-app-btn')));
    await click('#install-app-btn');
    check('it opens a guide, named, with a handle and a way out', (await visible('#install-modal')) && (await trim('#install-title')) === 'Install Habitly' && await ev(`!!document.querySelector('#install-modal .dialog > .sheet-handle') && !!document.querySelector('#install-modal [data-dismiss]')`));
    check('it says what installing gives you', /home screen/i.test(await trim('#install-why')) && /offline/i.test(await trim('#install-why')), await trim('#install-why'));
    check('with no offer from the browser, it says where to look in the menu', (await ev(`document.getElementById('install-body').dataset.platform`)) === 'manual' && /menu/i.test(await trim('#install-body')) && !(await visible('#install-go')), await trim('#install-body'));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(350);
    check('Escape closes it', !(await visible('#install-modal')));
    await ev(`(() => { window.__asked = 0; window.__letOffer = true; const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__asked++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); })()`);
    await click('#install-app-btn');
    check('when the browser offers, the guide has one Install button', (await ev(`document.getElementById('install-body').dataset.platform`)) === 'prompt' && (await visible('#install-go')));
    await click('#install-go'); await sleep(400);
    check('which asks the browser to install, then closes with a thank-you', (await ev(`window.__asked`)) === 1 && !(await visible('#install-modal')) && await ev(`[...document.querySelectorAll('.toast')].some(t => /installed/i.test(t.textContent))`));
    noExceptions();
  });

  scenario('install: iPhone gets drawn steps, and other iPhone browsers are sent to Safari', async () => {
    await send('Emulation.setUserAgentOverride', { userAgent: IPHONE });
    await profile();
    await click('#install-app-btn');
    const steps = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#install-body ol li')].map(li => ({ t: li.innerText.trim(), icon: !!li.querySelector('svg') })))`));
    check('three numbered steps for iPhone Safari', (await ev(`document.getElementById('install-body').dataset.platform`)) === 'ios' && steps.length === 3, JSON.stringify(steps));
    check('Share, then Add to Home Screen, then Add, each with its icon drawn', /Share/.test(steps[0].t) && /Add to Home Screen/.test(steps[1].t) && /Add/.test(steps[2].t) && steps[0].icon && steps[1].icon, JSON.stringify(steps));
    check('no Install button is promised where the browser has none', !(await visible('#install-go')));
    await size(320, 640); await sleep(300);
    check('it fits a 320px phone', (await ev(`document.documentElement.scrollWidth <= innerWidth`)) && await ev(`[...document.querySelectorAll('#install-modal button')].filter(b => b.getClientRects().length).every(b => b.getBoundingClientRect().height >= 44)`));
    await send('Emulation.setUserAgentOverride', { userAgent: IPHONE_CHROME });
    await profile();
    await click('#install-app-btn');
    check('another browser on iPhone is told to open the page in Safari first', (await ev(`document.getElementById('install-body').dataset.platform`)) === 'ios-other' && /Safari/.test(await trim('#install-body')), await trim('#install-body'));
    await send('Emulation.setUserAgentOverride', { userAgent: '' });
    await boot({ initScript: noOffer }); await waitFor(`!document.getElementById('auth-screen').classList.contains('hidden')`); await sleep(300);
    await click('#site-footer [data-install]');
    check('the landing page footer opens the same guide', await visible('#install-modal'));
    noExceptions();
  });
  // ── 70: screenshots in the install dialog, and a dark link preview ──
  scenario('install: the browser\'s own install dialog gets real screenshots, and links preview in dark', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const shots = manifest.screenshots || [];
    const dims = f => { const b = fs.readFileSync(path.join(ROOT, f)); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
    check('the manifest lists screenshots for phones and for wide screens', shots.filter(s => s.form_factor === 'narrow').length >= 2 && shots.filter(s => s.form_factor === 'wide').length >= 1, JSON.stringify(shots.map(s => s.form_factor)));
    check('each is a real file of the size it claims, with a label', shots.every(s => s.type === 'image/png' && fs.existsSync(path.join(ROOT, s.src)) && dims(s.src.replace(/^\//, '')) === s.sizes && s.label && s.label.length > 10), JSON.stringify(shots.map(s => [s.src, s.sizes])));
    check('they are small enough to ship', shots.every(s => fs.statSync(path.join(ROOT, s.src)).size < 250000));
    const staged = require('child_process').execSync('node tools/deploy.js --dry', { cwd: ROOT }).toString();
    check('and are published with the site', shots.every(s => staged.includes(s.src.replace(/^\//, ''))));
    check('the link-preview picture is 1200 by 630', dims('og-image.png') === '1200x630');
    await boot(); await sleep(400);
    const px = JSON.parse(await ev(`(async () => { const img = new Image(); img.src = '/og-image.png?' + Date.now(); await img.decode(); const c = document.createElement('canvas'); c.width = 1200; c.height = 630; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const at = (a, b) => [...x.getImageData(a, b, 1, 1).data].slice(0, 3); let light = 0; const d = x.getImageData(80, 150, 600, 300).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200) light++; return JSON.stringify({ corner: at(6, 6), right: at(1190, 620), light }); })()`));
    check('it is dark, edge to edge', px.corner.every(v => v < 40) && px.right.every(v => v < 40), JSON.stringify(px));
    check('with the headline drawn in light type', px.light > 3000, String(px.light));
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    check('the page still points previews at it, with a description', /og:image" content="https:\/\/habit-tracker-demo-34c0a\.web\.app\/og-image\.png/.test(html) && /og:image:alt" content="[^"]{20,}"/.test(html));
    noExceptions();
  });
};
