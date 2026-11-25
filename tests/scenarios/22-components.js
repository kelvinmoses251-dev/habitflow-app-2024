// Shared components (roadmap batch 1): custom select, dialog system, toasts.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const key = async k => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }); await sleep(60); };
  const catBtn = `document.querySelector('#habit-category ~ .select-btn')`;
  const openList = `document.querySelector('.select-list:not([hidden])')`;

  scenario('components: the category select is a designed, keyboard-friendly list', async () => {
    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`); await sleep(300); await ev(`document.getElementById('new-habit-toggle').click()`);   // the fields live in the habit sheet
    await waitFor(`!!document.querySelector('#habit-form .select-btn') && !document.getElementById('habit-form').hidden`, 6000);
    check('all four selects are enhanced', (await ev(`document.querySelectorAll('.select-btn').length`)) === 4);
    check('the button shows the placeholder first', /Category/.test(await ev(`${catBtn}.textContent`)));
    await ev(`${catBtn}.click()`); await sleep(100);
    check('opens a listbox with the 11 categories', (await ev(`${openList}.querySelectorAll('[role=option]').length`)) === 11);
    check('the button says it is expanded', (await ev(`${catBtn}.getAttribute('aria-expanded')`)) === 'true');
    check('options show the category icon', await ev(`!!${openList}.querySelector('[role=option] use[href^="#i-cat-"]')`));
    await ev(`[...${openList}.querySelectorAll('[role=option]')].find(o => o.dataset.value === 'reading').click()`); await sleep(100);
    check('choosing sets the real select', (await ev(`document.getElementById('habit-category').value`)) === 'reading');
    check('the button shows the choice', /Reading/.test(await ev(`${catBtn}.textContent`)));
    check('the list closed and focus is on the button', await ev(`!${openList} && document.activeElement === ${catBtn}`));
    await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
    check('arrow keys and Enter choose the next option', (await ev(`document.getElementById('habit-category').value`)) === 'saving', await ev(`document.getElementById('habit-category').value`));
    await key('ArrowDown'); await key('Escape');
    check('Escape closes without changing', await ev(`!${openList} && document.getElementById('habit-category').value === 'saving'`));
    await key('ArrowDown'); await key('f'); await key('Enter');
    check('typing a letter jumps to a matching option', (await ev(`document.getElementById('habit-category').value`)) === 'fitness');
    await ev(`document.getElementById('habit-category').value = 'health'`); await sleep(50);
    check('the button follows a value set by code', /Health/.test(await ev(`${catBtn}.textContent`)));
    await ev(`${catBtn}.click()`); await sleep(80);
    await ev(`document.querySelector('.page-title, .section-title, body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`); await sleep(80);
    check('a tap elsewhere closes the list', await ev(`!${openList}`));
    noExceptions();
  });

  scenario('components: a required select explains itself instead of failing silently', async () => {
    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`); await sleep(300); await ev(`document.getElementById('new-habit-toggle').click()`);   // the fields live in the habit sheet
    await waitFor(`!!document.querySelector('#habit-form .select-btn') && !document.getElementById('habit-form').hidden`, 6000);
    await ev(`(() => { document.getElementById('habit-input').value = 'Stretch'; document.getElementById('habit-form').requestSubmit(); })()`); await sleep(300);
    check('no habit was added', (await ev(`Object.keys(__mockDB.habits || {}).length`)) === 0);
    check('the category button is marked invalid', (await ev(`${catBtn}.getAttribute('aria-invalid')`)) === 'true');
    check('it says what to do', /choose/i.test(await ev(`(document.querySelector('#habit-form .field-msg') || {}).textContent || ''`)));
    await ev(`${catBtn}.click()`); await sleep(80);
    await ev(`${openList}.querySelector('[data-value="health"]').click()`); await sleep(80);
    check('choosing clears the error', (await ev(`${catBtn}.getAttribute('aria-invalid')`)) !== 'true');
    noExceptions();
  });

  scenario('components: selects fit a small phone and dark mode', async () => {
    await boot({ seed: signedIn({ theme: 'dark' }) });
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`); await sleep(300); await ev(`document.getElementById('new-habit-toggle').click()`);   // the fields live in the habit sheet
    await waitFor(`!!document.querySelector('#habit-form .select-btn') && !document.getElementById('habit-form').hidden`, 6000);
    await sleep(600);
    // Bring the button on screen, let the page finish moving (a page scroll closes the list by design), then open
    // and measure everything in one go.
    const m = JSON.parse(await ev(`(async () => { ${catBtn}.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 250)); ${catBtn}.click(); const l = ${openList}; if (!l) return JSON.stringify({ open: false });
      const r = l.getBoundingClientRect(), d = document.createElement('i'); d.style.color = 'var(--surface-3)'; document.body.appendChild(d); const s3 = getComputedStyle(d).color; d.remove();
      return JSON.stringify({ open: true, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
        noScroll: document.documentElement.scrollWidth <= innerWidth, raised: getComputedStyle(l).backgroundColor === s3, optH: l.querySelector('[role=option]').getBoundingClientRect().height }); })()`));
    check('the list opens', m.open);
    check('no horizontal scroll with the list open at 320px', m.noScroll);
    check('the open list sits inside the screen', m.fits, JSON.stringify(m.rect));
    check('dark: the list is on the raised surface', m.raised);
    check('options are at least 44px tall on a phone', m.optH >= 44, m.optH);
    await ev(`document.querySelector('.summary').dispatchEvent(new Event('scroll'))`); await sleep(100);   // a container that does not hold the button
    check('an unrelated container scrolling does not close the list', await ev(`!!${openList}`));
    await ev(`document.dispatchEvent(new Event('scroll'))`); await sleep(100);
    check('the page scrolling closes the list', await ev(`!${openList}`));
  });

  // ── Dialogs ──────────────────────────────────────────────
  const withHabit = (extra = {}) => signedIn({ ...extra, mock_fb_db: { users: {}, habits: {
    a: { userId: 'u-test', name: 'Read', category: 'reading', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1 } } } });
  const confirmDlg = `document.querySelector('#confirm-check-modal .dialog')`;
  const openConfirm = async () => {
    await waitFor(`!!document.querySelector('.habit-item:not(.skel-row) .habit-check')`);
    await ev(`(() => { const cb = document.querySelector('.habit-check'); cb.focus(); cb.click(); })()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`, 3000);
    await sleep(350);                                             // entrance finished
  };
  const drag = (sel, dx, dy) => ev(`(async () => { const el = document.querySelector(${JSON.stringify(sel)}), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const fire = (t, px, py) => (t === 'pointerdown' ? el : window).dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
    fire('pointerdown', x, y);
    for (let i = 1; i <= 4; i++) { fire('pointermove', x + ${dx} * i / 4, y + ${dy} * i / 4); await new Promise(r => setTimeout(r, 16)); }
    fire('pointerup', x + ${dx}, y + ${dy}); return 1; })()`);

  scenario('components: dialogs are bottom sheets on phones and centred on desktop', async () => {
    await boot({ seed: withHabit() }); await openConfirm();
    const r = JSON.parse(await ev(`JSON.stringify((() => { const d = ${confirmDlg}.getBoundingClientRect(); return { bottom: Math.round(d.bottom), width: Math.round(d.width), vh: innerHeight, vw: innerWidth }; })())`));
    check('phone: the sheet sits on the bottom edge', r.bottom === r.vh, `${r.bottom} vs ${r.vh}`);
    check('phone: the sheet is full width', r.width === r.vw, `${r.width} vs ${r.vw}`);
    check('phone: it shows a drag handle', await visible('#confirm-check-modal .sheet-handle'));
    check('phone: the top corners are rounded and the bottom ones square', await ev(`(() => { const s = getComputedStyle(${confirmDlg}); return parseFloat(s.borderTopLeftRadius) >= 16 && parseFloat(s.borderBottomLeftRadius) === 0; })()`));
    check('the page behind cannot scroll', (await ev(`getComputedStyle(document.documentElement).overflow`)) === 'hidden');
    check('every dialog has a handle and a way to dismiss it', await ev(`[...document.querySelectorAll('.modal')].every(m => m.querySelector('.dialog > .sheet-handle') && m.querySelector('[data-dismiss]'))`));
    await boot({ seed: withHabit(), mobile: false }); await openConfirm();
    check('desktop: the dialog is centred', await ev(`(() => { const d = ${confirmDlg}.getBoundingClientRect(); return Math.abs((d.left + d.right) / 2 - innerWidth / 2) < 2 && d.bottom < innerHeight - 40 && d.top > 40; })()`));
    check('desktop: no drag handle', !(await visible('#confirm-check-modal .sheet-handle')));
    noExceptions();
  });

  scenario('components: dialogs trap focus, restore it, and dismiss through their own cancel', async () => {
    await boot({ seed: withHabit(), mobile: false }); await openConfirm();
    check('focus moved into the dialog', await ev(`${confirmDlg}.contains(document.activeElement)`));
    for (let i = 0; i < 5; i++) await key('Tab');
    check('Tab stays inside', await ev(`${confirmDlg}.contains(document.activeElement)`));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 }); await sleep(60);
    check('Shift+Tab stays inside', await ev(`${confirmDlg}.contains(document.activeElement)`));
    await key('Escape'); await sleep(250);
    check('Escape closed it', !(await visible('#confirm-check-modal')));
    check('its cancel logic ran (habit not completed, box un-ticked)', await ev(`!document.querySelector('.habit-check').checked && __mockDB.habits.a.completedDates.length === 0`));
    check('focus went back to where it was', await ev(`document.activeElement.classList.contains('habit-check')`));
    check('the page scrolls again', (await ev(`getComputedStyle(document.documentElement).overflow`)) !== 'hidden');
    await ev(`document.getElementById('export-data-btn').click()`); await sleep(350);
    await ev(`(() => { const m = document.getElementById('confirm-export-modal'); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`); await sleep(200);
    check('a click on the backdrop dismisses', !(await visible('#confirm-export-modal')));
    await ev(`document.getElementById('recovery-modal').classList.remove('hidden')`); await sleep(350);
    await ev(`(() => { const m = document.getElementById('recovery-modal'); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`); await sleep(200);
    check('that works for dialogs that had no backdrop handling before', !(await visible('#recovery-modal')));
    noExceptions();
  });

  scenario('components: a sheet can be dragged down to dismiss, and respects reduced motion', async () => {
    await boot({ seed: withHabit() }); await openConfirm();
    await drag('#confirm-check-modal .sheet-handle', 0, 40); await sleep(350);
    check('a short drag springs back', await visible('#confirm-check-modal'));
    check('and the sheet is back on the bottom edge', await ev(`Math.round(${confirmDlg}.getBoundingClientRect().bottom) === innerHeight`));
    await drag('#confirm-check-modal .sheet-handle', 0, 140); await sleep(350);
    check('a long drag dismisses', !(await visible('#confirm-check-modal')));
    check('dismissing by drag runs the cancel logic too', await ev(`__mockDB.habits.a.completedDates.length === 0`));
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    try {
      await openConfirm();
      check('reduced motion: the sheet does not animate in', (await ev(`getComputedStyle(${confirmDlg}).animationName`)) === 'none');
    } finally { await send('Emulation.setEmulatedMedia', { features: [] }); }
    await boot({ seed: withHabit({ theme: 'dark' }) }); await openConfirm();
    check('dark: the sheet is on the raised surface', await ev(`(() => { const d = document.createElement('i'); d.style.color = 'var(--surface-3)'; document.body.appendChild(d); const col = getComputedStyle(d).color; d.remove(); return getComputedStyle(${confirmDlg}).backgroundColor === col; })()`));
    noExceptions();
  });

  // ── Toasts ───────────────────────────────────────────────
  const raise = (msg, type = 'info', ms = 3500) => ev(`import('./ui.js').then(m => { m.toast(${JSON.stringify(msg)}, ${JSON.stringify(type)}, ${ms}); return 1; })`);
  const toasts = () => ev(`document.querySelectorAll('#toast-container .toast').length`);
  const appReady = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`);

  scenario('components: toasts have an icon, a countdown, a limit and can be swiped away', async () => {
    await boot({ seed: signedIn() }); await appReady(); await sleep(300);
    await raise('Saved', 'success', 60000);
    check('success shows a tick', await ev(`!!document.querySelector('.toast.success use[href="#i-check"]')`));
    await raise('Careful', 'warning', 60000); await raise('Broken', 'error', 60000);
    check('warnings and errors show an alert icon', await ev(`!!document.querySelector('.toast.warning use[href="#i-alert"]') && !!document.querySelector('.toast.error use[href="#i-alert"]')`));
    check('the countdown bar runs once', (await ev(`getComputedStyle(document.querySelector('.toast .toast-bar')).animationIterationCount`)) === '1');
    check('phone: toasts sit above the bottom navigation', await ev(`(() => { const n = document.querySelector('.bottomnav').getBoundingClientRect(); return [...document.querySelectorAll('.toast')].every(t => t.getBoundingClientRect().bottom <= n.top); })()`));
    await raise('One more', 'info', 60000);
    check('info shows an info icon', await ev(`!!document.querySelector('.toast.info use[href="#i-info"]')`));
    check('never more than three at once', (await toasts()) === 3, await toasts());
    check('the oldest one made room', !(await ev(`[...document.querySelectorAll('.toast')].some(t => t.textContent.includes('Saved'))`)));
    await raise('A'.repeat(200), 'error', 60000);
    check('a very long toast does not widen the page', await ev(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.toast')].every(t => t.getBoundingClientRect().right <= innerWidth)`));
    const before = await toasts();
    await drag('#toast-container .toast:last-child', 120, 0); await sleep(450);
    check('swiping removes one', (await toasts()) === before - 1, `${before} -> ${await toasts()}`);
    await ev(`document.getElementById('recovery-modal').classList.remove('hidden')`); await sleep(400);
    check('phone: with a sheet open, toasts move to the top so they never cover its buttons', await ev(`(() => { const d = document.querySelector('#recovery-modal .dialog').getBoundingClientRect(); return [...document.querySelectorAll('.toast')].every(t => t.getBoundingClientRect().bottom <= d.top); })()`));
    noExceptions();
  });

  scenario('components: a toast waits while you are reading it, then goes', async () => {
    await boot({ seed: signedIn(), mobile: false }); await appReady(); await sleep(300);
    await raise('Hold on', 'info', 700);
    await ev(`document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerenter'))`); await sleep(1300);
    check('still there while hovered', (await toasts()) === 1);
    check('the bar is paused', (await ev(`getComputedStyle(document.querySelector('.toast .toast-bar')).animationPlayState`)) === 'paused');
    await ev(`document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerleave'))`); await sleep(1500);
    check('gone after you leave', (await toasts()) === 0);
    await raise('Where am I', 'info', 60000);
    check('desktop: toasts are top right, under the top bar', await ev(`(() => { const t = document.querySelector('.toast').getBoundingClientRect(), n = document.querySelector('.topnav').getBoundingClientRect(); return document.documentElement.clientWidth - t.right <= 16 && t.top >= n.bottom; })()`));
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    try {
      await raise('Quiet', 'success', 60000);
      check('reduced motion: no entrance and no moving bar', await ev(`(() => { const t = [...document.querySelectorAll('.toast')].pop(); return getComputedStyle(t).animationName === 'none' && getComputedStyle(t.querySelector('.toast-bar')).animationName === 'none'; })()`));
    } finally { await send('Emulation.setEmulatedMedia', { features: [] }); }
    noExceptions();
  });

  scenario('components: toasts are readable in dark mode and keep their action', async () => {
    await boot({ seed: signedIn({ theme: 'dark' }) }); await appReady(); await sleep(300);
    await ev(`import('./ui.js').then(m => { window.__undone = 0; m.toast('Habit removed', 'info', 60000, { label: 'Undo', onClick: () => { window.__undone++; } }); return 1; })`);
    check('dark: the toast is on the raised surface', await ev(`(() => { const d = document.createElement('i'); d.style.color = 'var(--surface-3)'; document.body.appendChild(d); const col = getComputedStyle(d).color; d.remove(); return getComputedStyle(document.querySelector('.toast')).backgroundColor === col; })()`));
    await ev(`document.querySelector('.toast .toast-action').click()`);
    check('the action runs and the toast leaves', (await ev(`window.__undone`)) === 1 && (await toasts()) === 0);
    noExceptions();
  });
};
