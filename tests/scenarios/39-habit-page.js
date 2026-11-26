// The habit page (roadmap batch 5): a full page for each habit, with its own link.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now(), ...user } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const onPage = () => ev(`document.getElementById('page-habit').classList.contains('active') && !document.getElementById('page-home').classList.contains('active')`);
  const openFromRow = async id => { await ev(`document.querySelector('.habit-item[data-id="${id}"] [data-action="details"]').click()`); await sleep(450); };
  const setField = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const three = () => ({
    a: H('Read 10 pages', { completedDates: run(1, 12), cue: 'After dinner', category: 'reading' }),
    b: H('Run <b>far</b>', { order: 2, completedDates: [day(1), day(3)] }),
    w: H('Call home', { order: 3, frequency: 'weekly', completedDates: [day(2), day(9)] }),
  });

  // ── 41: a full habit page ────────────────────────────────
  scenario('habit page: a habit opens as a full page with its numbers', async () => {
    await boot({ seed: seed(three()) }); await rows(); await sleep(300);
    await openFromRow('a');
    check('tapping a habit opens its page, not a dialog', (await onPage()) && !(await ev(`!!document.getElementById('details-modal')`)) && !(await ev(`document.documentElement.classList.contains('dialog-open')`)));
    check('the page is headed by the habit, as the one h1 on screen', await ev(`(() => { const h = [...document.querySelectorAll('h1')].filter(x => x.getClientRects().length); return h.length === 1 && h[0].id === 'details-habit-name' && h[0].textContent.trim() === 'Read 10 pages'; })()`));
    check('it shows the category and the cue', /Reading/.test(await text('#hp-sub')) && /After dinner/.test(await text('#hp-sub')), await text('#hp-sub'));
    check('streak, longest and total are right', (await text('#details-current-streak')).trim() === '12' && (await text('#details-longest-streak')).trim() === '12' && (await text('#details-total-days')).trim() === '12');
    check('and the last 30 days as a share of what was due', (await text('#hp-rate')).trim() === '40%', await text('#hp-rate'));
    check('the bottom bar still shows Home as where you are', await ev(`(() => { const b = document.querySelector('.bn-item[data-page="home"]'); return b.classList.contains('active') && b.getAttribute('aria-current') === 'page'; })()`));
    check('the page starts at the top', (await ev(`Math.round(scrollY)`)) === 0);
    check('Back is a real button', await ev(`(() => { const b = document.getElementById('details-close'); return b.tagName === 'BUTTON' && /back/i.test(b.textContent + (b.getAttribute('aria-label') || '')) && b.getBoundingClientRect().height >= 44; })()`));
    await ev(`document.getElementById('details-close').click()`); await sleep(450);
    check('Back returns to Home', await ev(`document.getElementById('page-home').classList.contains('active') && !document.getElementById('page-habit').classList.contains('active')`));
    check('with the focus on that habit\'s row', await ev(`!!document.activeElement.closest('.habit-item[data-id="a"]')`));
    noExceptions();
  });

  scenario('habit page: edit, pause and archive work from the page, and it keeps up with changes', async () => {
    await boot({ seed: seed(three()) }); await rows(); await sleep(300);
    await openFromRow('b');
    check('a name with HTML in it is shown as text', (await text('#details-habit-name')).trim() === 'Run <b>far</b>' && !(await ev(`!!document.querySelector('#page-habit h1 b')`)));
    await ev(`document.getElementById('hp-edit').click()`); await sleep(450);
    check('Edit opens the habit sheet filled in', (await visible('#habit-sheet')) && (await ev(`document.getElementById('habit-input').value`)) === 'Run <b>far</b>');
    await setField('habit-input', 'Run 5k'); await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(600);
    check('after saving, the page shows the new name', (await onPage()) && (await text('#details-habit-name')).trim() === 'Run 5k', await text('#details-habit-name'));
    await ev(`document.getElementById('details-pause').click()`); await sleep(500);
    check('Pause pauses it and the page stays, now offering Resume', (await onPage()) && await ev(`(__mockDB.habits.b.pauses || []).length === 1`) && /Resume/.test(await text('#details-pause')) && /Paused since/.test(await text('#details-life-note')));
    await ev(`document.getElementById('details-pause').click()`); await sleep(500);
    check('Resume brings it back', /Pause/.test(await text('#details-pause')) && !/Resume/.test(await text('#details-pause')));
    await ev(`__mockRemote('habits', 'b', { completedDates: ${JSON.stringify([day(0), day(1), day(3)])} })`); await sleep(500);
    check('a change from elsewhere shows on the page at once', (await text('#details-total-days')).trim() === '3' && (await text('#details-current-streak')).trim() === '2');
    await ev(`document.getElementById('details-archive').click()`); await sleep(600);
    check('Archive puts it away and returns to Home with Undo', await ev(`document.getElementById('page-home').classList.contains('active') && typeof __mockDB.habits.b.archivedAt === 'number' && [...document.querySelectorAll('.toast')].some(t => /Archived/.test(t.textContent) && !!t.querySelector('.toast-action'))`));
    noExceptions();
  });

  scenario('habit page: weekly habits, notes, small screens and dark', async () => {
    await boot({ colorScheme: 'dark', seed: seed(three()) }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="w"] [data-action="details"]').click()`); await sleep(450);
    check('a weekly habit counts its streak in weeks', /2 wk/.test(await text('#details-current-streak')), await text('#details-current-streak'));
    check('and has no time-of-day choice', !(await visible('#details-time-row')));
    await setField('details-journal-input', 'Mum says <i>hello</i>'); await ev(`document.getElementById('details-save-journal').click()`); await sleep(500);
    check('a note is saved and shown as text', await ev(`__mockDB.habits.w.journals.length === 1`) && /Mum says <i>hello<\/i>/.test(await text('#details-journal-list')) && !(await ev(`!!document.querySelector('#details-journal-list i')`)));
    await size(320, 568); await sleep(200);
    check('320px: nothing spills sideways, the four figures fit', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#page-habit .hp-stats > div')].every(d => d.getBoundingClientRect().right <= innerWidth)`));
    check('the action buttons are thumb-sized', await ev(`['hp-edit', 'details-pause', 'details-archive'].every(id => document.getElementById(id).getBoundingClientRect().height >= 44)`));
    check('dark: the heading can be read', await ev(`(() => { const lum = c => { const [r, g, b] = c.match(/[\\d.]+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      const a = lum(getComputedStyle(document.getElementById('details-habit-name')).color), b = lum(getComputedStyle(document.body).backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 7; })()`));
    await ev(`__mockRemote('habits', 'w', { deletedAt: Date.now() })`); await sleep(600);
    check('if the habit is deleted while its page is open, the page leaves for Home', await ev(`document.getElementById('page-home').classList.contains('active')`));
    noExceptions();
  });
  // ── 50: a link for every habit ───────────────────────────
  const clipSpy = `window.__clip = []; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__clip.push(t); return Promise.resolve(); } } }); } catch (_) {}`;
  const loaded = () => waitFor(`!!window.__mockDB && !document.getElementById('loading-screen') && !document.getElementById('app').classList.contains('hidden')`);

  scenario('habit link: each habit has an address, and Back, Forward and reload work', async () => {
    await boot({ seed: seed(three()), initScript: clipSpy }); await rows(); await sleep(300);
    const title = await ev(`document.title`);
    await openFromRow('a');
    check('the address names the habit', (await ev(`location.hash`)) === '#habit/a', await ev(`location.hash`));
    check('the tab title is the habit', (await ev(`document.title`)) === 'Read 10 pages · Habitly', await ev(`document.title`));
    await ev(`history.back()`); await sleep(450);
    check('the browser\'s Back goes to Home', (await ev(`location.hash`)) !== '#habit/a' && await ev(`document.getElementById('page-home').classList.contains('active')`));
    check('and the title goes back too', (await ev(`document.title`)) === title, await ev(`document.title`));
    await ev(`history.forward()`); await sleep(450);
    check('Forward returns to the habit', (await onPage()) && (await text('#details-habit-name')).trim() === 'Read 10 pages');
    await ev(`location.reload()`); await sleep(500); await loaded(); await sleep(900);
    check('a reload stays on the habit', (await onPage()) && (await text('#details-habit-name')).trim() === 'Read 10 pages' && (await text('#details-current-streak')).trim() === '12', await text('#details-habit-name'));
    check('and the page body is shown, not the "not here" message', (await visible('#habit-body')) && !(await visible('#habit-missing')));
    await ev(`document.getElementById('details-close').click()`); await sleep(450);
    check('Back on a page reached by its address goes Home', await ev(`document.getElementById('page-home').classList.contains('active')`));
    await openFromRow('b');
    await ev(`document.getElementById('hp-link').click()`); await sleep(300);
    const copied = await ev(`window.__clip`);
    check('Copy link copies the habit\'s full address', copied.length === 1 && /^https?:\/\/[^#]+#habit\/b$/.test(copied[0]), JSON.stringify(copied));
    check('and says so', await ev(`[...document.querySelectorAll('.toast')].some(t => /Link copied/.test(t.textContent))`));
    check('the link button is thumb-sized and named', await ev(`(() => { const b = document.getElementById('hp-link'); return b.tagName === 'BUTTON' && b.getBoundingClientRect().height >= 44 && /link/i.test(b.textContent + (b.getAttribute('aria-label') || '')); })()`));
    noExceptions();
  });

  scenario('habit link: an address for a habit that is not there says so plainly', async () => {
    await boot({ seed: seed({ ...three(), z: H('Old', { order: 9, archivedAt: Date.now() - 864e5, archivedOn: day(1) }) }), hash: '#habit/nope' }); await loaded(); await sleep(900);
    check('an unknown habit shows a plain message, not a blank page', (await onPage()) && (await visible('#habit-missing')) && !(await visible('#habit-body')) && /not here/i.test(await text('#habit-missing')));
    check('with a way Home', await ev(`(() => { const a = document.querySelector('#habit-missing a, #habit-missing button'); return !!a && /home/i.test(a.textContent) && a.getBoundingClientRect().height >= 44; })()`));
    check('the title stays the app\'s', !/nope/.test(await ev(`document.title`)));
    await ev(`document.querySelector('#habit-missing a, #habit-missing button').click()`); await sleep(450);
    check('it leads Home', await ev(`document.getElementById('page-home').classList.contains('active')`));
    await ev(`location.hash = '#habit/z'`); await sleep(500);
    check('an archived habit\'s address says the same', (await visible('#habit-missing')) && !(await visible('#habit-body')));
    await ev(`location.hash = '#habit/' + encodeURIComponent('<img src=x onerror=window.__x=1>')`); await sleep(500);
    check('a hostile address does nothing but show the message', (await visible('#habit-missing')) && (await ev(`window.__x`)) === undefined && !(await ev(`!!document.querySelector('#page-habit img')`)));
    await ev(`location.hash = '#habit/a'`); await sleep(500);
    check('a good address typed in opens the habit', (await visible('#habit-body')) && (await text('#details-habit-name')).trim() === 'Read 10 pages');
    await ev(`location.hash = '#habit/b'`); await sleep(500);
    check('and going straight to another habit shows that one', (await text('#details-habit-name')).trim() === 'Run <b>far</b>' && (await text('#details-total-days')).trim() === '2');
    noExceptions();
  });
};
