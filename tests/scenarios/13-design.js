// Design guardrails: the product must not use emoji, and must not drift back to decorative effects
// (gradients, blur, glow, endless animation) that make an interface look generated.
const fs = require('fs'), path = require('path');

module.exports = (scenario, c) => {
  const { ev, boot, waitFor, check, sleep, signedIn } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
  const today = new Date().toLocaleDateString('en-CA');
  const key = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const habit = (name, category, order, dates, extra = {}) => ({ userId: 'u-test', name, category, frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), order, ...extra });
  const db = {
    users: { 'u-test': { xp: 380, streakShields: 1 } },
    habits: {
      a: habit('Drink water', 'health', 1, [today, key(-1), key(-2)], { completedTimestamps: { [today]: Date.now() - 4000000 } }),
      b: habit('Read 10 pages', 'reading', 2, [key(-1), key(-2), key(-3)]),
      c: habit('Review budget', 'saving', 3, [], { frequency: 'weekly' }),
    },
  };

  scenario('design: no emoji anywhere in shipped source files', async () => {
    const files = ['index.html', 'app.js', 'landing-demo.js', 'style.css', 'firebase-messaging-sw.js', 'manifest.json', 'scripts/send-reminders.js', 'functions/index.js'];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split(/\r?\n/);
      const hits = lines.map((l, i) => EMOJI.test(l) ? `${i + 1}: ${l.trim().slice(0, 70)}` : null).filter(Boolean);
      check(`${f} has no emoji`, hits.length === 0, hits.slice(0, 3).join(' | '));
    }
  });

  // Collect every string a user could read or hear: text nodes (hidden dialogs included) and attributes.
  const collect = () => ev(`(() => {
    const out = [document.title];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode, p = n.parentElement; if (p && !/^(SCRIPT|STYLE)$/.test(p.tagName)) out.push(n.nodeValue); }
    document.querySelectorAll('[title],[aria-label],[placeholder],[alt]').forEach(e => ['title','aria-label','placeholder','alt'].forEach(a => { const v = e.getAttribute(a); if (v) out.push(v); }));
    return out.join('\\n');
  })()`);
  const noEmoji = async label => { const s = await collect(); const m = s.match(/.{0,20}(\p{Extended_Pictographic}|\p{Regional_Indicator}).{0,20}/u); check(`${label}: no emoji in rendered text`, !m, m && m[0]); };

  scenario('design: no emoji on any rendered screen, dialog or toast', async () => {
    await boot();
    await noEmoji('landing');
    await ev(`document.querySelectorAll('.demo-habit').forEach(b => b.click())`); await sleep(1200);
    await noEmoji('landing after demo');

    await boot({ seed: { ...signedIn(), mock_fb_db: db } });
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`);
    await noEmoji('home');
    await ev(`document.getElementById('level-up-modal').classList.remove('hidden'); document.getElementById('all-done-overlay').classList.remove('hidden')`);
    await ev(`document.querySelector('#habits .habit-check:not(:checked)').click()`); await sleep(300);
    await noEmoji('home with dialogs open');
    await ev(`document.getElementById('open-tutorial-btn').click()`); await sleep(200);
    await noEmoji('tour');
    await ev(`location.hash = '#stats'`); await sleep(1800);
    await noEmoji('stats');
    await ev(`location.hash = '#profile'`); await sleep(500);
    await noEmoji('profile');
    await ev(`document.querySelector('#habits [data-action="delete"]') && 0`);

    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    await noEmoji('empty home (starter packs)');
  });

  scenario('design: flat surfaces. No gradients, blur, glow or endless motion on any main screen', async () => {
    const audit = () => ev(`(() => {
      const bad = [];
      document.querySelectorAll('body *').forEach(e => {
        if (!e.getClientRects().length) return;                       // only what is visible
        const s = getComputedStyle(e), id = e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
        if (/gradient/.test(s.backgroundImage)) bad.push('gradient: ' + id);
        if (s.backdropFilter && s.backdropFilter !== 'none') bad.push('backdrop-filter: ' + id);
        if (s.textShadow && s.textShadow !== 'none') bad.push('text-shadow: ' + id);
        if (s.filter && s.filter !== 'none') bad.push('filter: ' + id);
        if (s.animationName !== 'none' && s.animationIterationCount === 'infinite') bad.push('infinite animation: ' + id);
        // Depth must stay soft and neutral: a blurred shadow may not be coloured or wider than 48px.
        // (Zero-blur rings are outlines, not shadows. No backslashes here: this runs inside a template string.)
        if (s.boxShadow && s.boxShadow !== 'none') {
          s.boxShadow.split(/,(?![^(]*[)])/).forEach(layer => {
            const col = (layer.match(/rgba?[(][^)]+[)]/) || ['rgb(0,0,0)'])[0].match(/[0-9.]+/g).map(Number);
            const px = (layer.replace(/rgba?[(][^)]+[)]/, '').match(/-?[0-9.]+px/g) || []).map(parseFloat);   // x, y, blur, spread
            if (!px[2]) return;
            if (Math.max(col[0], col[1], col[2]) - Math.min(col[0], col[1], col[2]) > 12) bad.push('coloured shadow: ' + id);
            if (px[2] > 48) bad.push('shadow blur over 48px: ' + id);
          });
        }
      });
      return bad;
    })()`);

    await boot();
    check('landing is flat', (await audit()).length === 0, JSON.stringify((await audit()).slice(0, 4)));
    check('typeface is Inter', (await ev(`getComputedStyle(document.body).fontFamily`)).startsWith('Inter'));

    await boot({ seed: { ...signedIn(), mock_fb_db: db } });
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`);
    check('home is flat', (await audit()).length === 0, JSON.stringify((await audit()).slice(0, 4)));
    await ev(`location.hash = '#stats'`); await sleep(1800);
    check('stats is flat', (await audit()).length === 0, JSON.stringify((await audit()).slice(0, 4)));
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('profile is flat', (await audit()).length === 0, JSON.stringify((await audit()).slice(0, 4)));

    await boot({ seed: { ...signedIn({ theme: 'dark' }), mock_fb_db: db } });
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`);
    check('dark home is flat', (await audit()).length === 0, JSON.stringify((await audit()).slice(0, 4)));
  });
};
