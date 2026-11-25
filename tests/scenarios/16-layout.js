// Professional layout: a real desktop dashboard, no horizontal scroll at any width, a quick-add that works
// from the keyboard, and the ink summary block. These guard the structure, not the pixels.
module.exports = (scenario, c) => {
  const { ev, send, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;
  const key = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const habit = (name, dates = [], order = 1, cat = 'fitness') => ({ userId: 'u-test', name, category: cat, frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), order });
  const habits = { a: habit('Run 5k', [key(0), key(-1)], 1), b: habit('Read', [key(-1)], 2, 'reading'), c: habit('Meditate', [], 3, 'relaxation'), d: habit('Journal', [], 4, 'mind') };
  const seed = (extra = {}) => ({ ...signedIn(extra), mock_fb_db: { habits } });
  const ready = () => waitFor(`document.querySelectorAll('#habits .habit-item').length === 4`);
  const viewport = (w, h, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  const rect = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; })()`);
  const overflow = () => ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1536];

  scenario('layout: no horizontal scroll from 320px phones to wide desktops (landing, home, stats, profile)', async () => {
    const bad = { landing: [], home: [], stats: [], profile: [] };
    await boot();
    for (const w of WIDTHS) { await viewport(w, 900, w < 768); await sleep(250); if ((await overflow()) > 0) bad.landing.push(w); }
    await boot({ seed: seed() });
    await ready();
    for (const page of ['home', 'stats', 'profile']) {
      await ev(`location.hash = '#${page}'`); await sleep(page === 'stats' ? 1600 : 400);
      for (const w of WIDTHS) { await viewport(w, 900, w < 768); await sleep(250); if ((await overflow()) > 0) bad[page].push(w); }
    }
    for (const [page, ws] of Object.entries(bad)) check(`${page} fits every width`, ws.length === 0, 'overflows at ' + ws.join(', '));
  });

  scenario('layout: desktop home is a two-column dashboard with a pinned summary; it stacks below 1024px', async () => {
    await boot({ seed: seed(), mobile: false });
    await ready(); await sleep(500);
    const sum = await rect('.summary'), list = await rect('#habits');
    check('summary sits to the right of the list', sum.l >= list.r, JSON.stringify({ sum, list }));
    check('the summary starts at the top of the page content', sum.t > 56 && sum.t < 140, sum.t);
    check('summary is pinned while the list scrolls', (await ev(`getComputedStyle(document.querySelector('.summary')).position`)) === 'sticky');
    check('the list gets the wider column', list.w > sum.w * 1.4, `${list.w} vs ${sum.w}`);
    await viewport(900, 900); await sleep(300);
    const s2 = await rect('.summary'), l2 = await rect('#habits');
    check('below 1024px the summary stacks above the list', s2.b <= l2.t && Math.abs(s2.l - l2.l) < 40, JSON.stringify({ s2, l2 }));
    noExceptions();
  });

  scenario('layout: desktop stats uses two columns for the report cards and full width for the charts', async () => {
    await boot({ seed: seed(), mobile: false });
    await ready();
    await ev(`location.hash = '#stats'`); await sleep(1600);
    const ins = await rect('#insights-card'), rep = await rect('.weekly-report-card'), chart = await rect('#weekly-chart');
    check('insights and the weekly report sit side by side', ins && rep && ins.r <= rep.l + 1 && Math.abs(ins.t - rep.t) < 4, JSON.stringify({ ins, rep }));
    check('the weekly chart spans the full width', chart.w > (ins.w + rep.w) * 0.9, JSON.stringify({ chart, ins, rep }));
  });

  scenario('summary: one dark focal block (flat), light and dark themes', async () => {
    await boot({ seed: seed() });
    await ready();
    check('light theme: ink surface', (await ev(`getComputedStyle(document.querySelector('.summary')).backgroundColor`)) === 'rgb(23, 22, 30)');
    check('numerals and greeting stay legible on it', (await ev(`getComputedStyle(document.getElementById('greeting-name')).color`)) === 'rgb(244, 243, 250)');
    check('no gradient', !/gradient/.test(await ev(`getComputedStyle(document.querySelector('.summary')).backgroundImage`)));
    await boot({ seed: seed({ theme: 'dark' }) });
    await ready();
    check('dark theme: deep indigo surface', (await ev(`getComputedStyle(document.querySelector('.summary')).backgroundColor`)) === 'rgb(28, 26, 51)');
  });

  scenario('quick add: top-bar button (desktop) and the N key open the form with the cursor in it', async () => {
    await boot({ seed: seed(), mobile: false });
    await ready();
    check('top bar offers New habit on desktop', await visible('#topnav-new'));
    check('collapsed to begin with', (await ev(`document.getElementById('habit-form').hidden`)) === true);
    await ev(`document.getElementById('topnav-new').click()`); await sleep(200);
    check('button opens the form', (await ev(`document.getElementById('habit-form').hidden`)) === false);
    check('and focuses the name field', await waitFor(`document.activeElement.id === 'habit-input'`, 3000));

    await boot({ seed: seed(), mobile: false });
    await ready();
    const press = (k, extra = '') => ev(`(() => { const e = new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true${extra} }); document.dispatchEvent(e); return e.defaultPrevented; })()`);
    check('N is handled', (await press('n')) === true);
    check('N opens the form', (await ev(`document.getElementById('habit-form').hidden`)) === false);
    check('and focuses it', await waitFor(`document.activeElement.id === 'habit-input'`, 3000));
    check('typing the letter n in the field is left alone', (await press('n')) === false);
    check('Ctrl+N (browser shortcut) is left alone', (await ev(`document.activeElement.blur(), 0`)) === 0 && (await press('n', ', ctrlKey: true')) === false);

    await ev(`document.getElementById('habit-cancel').click()`); await sleep(300);      // the sheet is a dialog: close it before trying the key elsewhere
    await ev(`location.hash = '#stats'`); await sleep(500);
    await ev(`document.activeElement.blur()`);
    await press('N');
    check('from another page it returns Home first', await waitFor(`location.hash === '#home' && document.activeElement.id === 'habit-input'`, 3000));

    await ev(`document.getElementById('level-up-modal').classList.remove('hidden')`);
    await ev(`document.activeElement.blur(); document.getElementById('habit-form').hidden = true`);
    check('N does nothing while a dialog is open', (await press('n')) === false && (await ev(`document.getElementById('habit-form').hidden`)) === true);
    noExceptions();

    await boot({ seed: seed() });
    await ready();
    check('the top-bar button is not shown on phones (the row is the entry point)', !(await visible('#topnav-new')));
  });

  scenario('rows: secondary actions appear on hover or focus with a mouse, and stay visible on touch', async () => {
    await boot({ seed: seed(), mobile: false });
    await ready();
    const fine = await ev(`matchMedia('(hover: hover) and (pointer: fine)').matches`);
    if (fine) {
      check('actions are tucked away at rest', Number(await ev(`getComputedStyle(document.querySelector('#habits .habit-actions')).opacity`)) === 0);
      await ev(`document.querySelector('#habits .habit-check').focus()`); await sleep(250);
      check('keyboard focus reveals them', Number(await ev(`getComputedStyle(document.querySelector('#habits .habit-actions')).opacity`)) === 1);
    } else check('(no fine pointer in this browser: reveal rule not exercised)', true);
    check('timer, edit and delete are still real buttons', (await ev(`document.querySelectorAll('#habits .habit-item:first-child .habit-actions button').length`)) >= 2);
    check('a locked completion keeps its words for screen readers', (await ev(`!!document.querySelector('.locked-badge .sr-only') || document.querySelectorAll('.locked-badge').length === 0`)) === true);
  });

  scenario('landing: top bar, Sign in jumps to the form, sign-up sits beside the demo on desktop', async () => {
    await boot();
    check('Sign in is in the top bar', await visible('#landing-signin'));
    await ev(`document.getElementById('landing-signin').click()`);
    check('it focuses the email field', await waitFor(`document.activeElement.id === 'auth-email'`, 3000));

    await boot({ mobile: false });
    const title = await rect('.landing-title'), auth = await rect('#auth-card'), demo = await rect('.demo-stage');
    check('headline spans above both columns', title.b <= auth.t && title.b <= demo.t, JSON.stringify({ title, auth, demo }));
    check('sign-up on the left, demo on the right', auth.r <= demo.l + 1, JSON.stringify({ auth, demo }));
    check('no horizontal scroll', (await overflow()) <= 0);

    await boot();
    const d2 = await rect('#demo-card'), a2 = await rect('#auth-card');
    check('on a phone the demo comes first, then the account card', a2.t > d2.b, JSON.stringify({ d2, a2 }));

    await boot({ seed: { habitly_returning: '1' } });
    check('returning visitors get just the sign-in card (no top bar, headline or demo)', !(await visible('#landing-signin')) && !(await visible('.landing-copy')) && !(await visible('.demo-stage')) && (await visible('#auth-card')));
  });
};
