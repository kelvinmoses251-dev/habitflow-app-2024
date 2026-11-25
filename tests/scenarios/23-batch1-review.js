// Fixes from the independent review of roadmap batch 1. Each scenario pins one finding.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const withHabit = (extra = {}) => signedIn({ ...extra, mock_fb_db: { users: {}, habits: {
    a: { userId: 'u-test', name: 'Read', category: 'reading', frequency: 'daily', completedDates: [], createdAt: new Date().toISOString(), order: 1 } } } });
  const ready = () => waitFor(`!!document.querySelector('.habit-item .habit-check')`);
  // A real backdrop click is a press and a release on the backdrop. A drag that started inside the dialog is not.
  const backdropClick = id => ev(`(() => { const m = document.getElementById(${JSON.stringify(id)}); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  const dragOut = (id, from) => ev(`(() => { const m = document.getElementById(${JSON.stringify(id)}); m.querySelector(${JSON.stringify(from)}).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
  const show = id => ev(`document.getElementById(${JSON.stringify(id)}).classList.remove('hidden')`);

  scenario('review: a drag that starts in a dialog and ends on the backdrop does not close it', async () => {
    await boot({ seed: withHabit(), mobile: false }); await ready();
    await show('recovery-modal'); await sleep(300);
    await dragOut('recovery-modal', '.dialog-title'); await sleep(200);
    check('still open after selecting text out past the edge', await visible('#recovery-modal'));
    await backdropClick('recovery-modal'); await sleep(200);
    check('a real backdrop click still closes it', !(await visible('#recovery-modal')));
    noExceptions();
  });

  scenario('review: dialogs that hold work in progress cannot be closed by a stray tap or drag', async () => {
    await boot({ seed: withHabit() }); await ready();
    await ev(`document.querySelector('.habit-item [data-action="timer"]').click()`); await sleep(350);
    await ev(`document.getElementById('timer-start').click()`); await sleep(100);
    await backdropClick('timer-modal'); await sleep(200);
    check('a running focus timer survives a tap outside', await visible('#timer-modal') && await ev(`!document.getElementById('timer-pause').classList.contains('hidden')`));
    check('its sheet shows no drag handle', !(await visible('#timer-modal .sheet-handle')));
    await ev(`document.getElementById('timer-close').click()`); await sleep(200);
    await ev(`document.querySelector('.habit-item [data-action="edit"]').click()`); await sleep(350);
    await ev(`document.getElementById('habit-input').value = 'Read 20 pages'`);
    await backdropClick('habit-sheet'); await sleep(200);
    check('the edit form survives a tap outside, text intact', await visible('#habit-sheet') && (await ev(`document.getElementById('habit-input').value`)) === 'Read 20 pages');
    check('the photo cropper is protected the same way', await ev(`document.getElementById('crop-modal').hasAttribute('data-sticky')`));
    const key = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k });
    await key('Escape'); await sleep(250);
    check('Escape and Cancel still close them', !(await visible('#habit-sheet')));
    noExceptions();
  });

  scenario('review: the custom select is announced properly and stays inside its dialog', async () => {
    await boot({ seed: withHabit(), mobile: false }); await ready();
    check('the button is a combobox that controls a listbox', await ev(`(() => { const b = document.querySelector('#habit-category ~ .select-btn'); return b.getAttribute('role') === 'combobox' && b.getAttribute('aria-haspopup') === 'listbox' && !!document.getElementById(b.getAttribute('aria-controls')); })()`));
    await ev(`document.querySelector('.habit-item [data-action="edit"]').click()`); await sleep(350);
    await ev(`document.querySelector('#habit-category ~ .select-btn').click()`); await sleep(120);
    check('inside a dialog, the list opens inside that dialog (so it is not hidden from screen readers)', await ev(`!!document.querySelector('#habit-sheet .select-list:not([hidden])')`));
    check('and still sits right under its button', await ev(`(() => { const b = document.querySelector('#habit-category ~ .select-btn').getBoundingClientRect(), l = document.querySelector('#habit-sheet .select-list:not([hidden])').getBoundingClientRect(); return Math.abs(l.left - b.left) < 2 && (Math.abs(l.top - b.bottom - 4) < 2 || Math.abs(b.top - l.bottom - 4) < 2); })()`));
    await ev(`document.querySelector('#habit-sheet .select-list [data-value="fitness"]').click()`); await sleep(120);
    check('choosing works and the dialog stays open', (await ev(`document.getElementById('habit-category').value`)) === 'fitness' && await visible('#habit-sheet'));
    noExceptions();
  });

  scenario('review: small controls have a 44px touch area on phones', async () => {
    await boot({ seed: withHabit(), hash: '#home' }); await ready();
    const hit = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}), r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const owns = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t) || t.contains(e) && t.matches('label, .toggle')); };
      return owns(cx - 21, cy) && owns(cx + 21, cy) && owns(cx, cy - 21) && owns(cx, cy + 21); })()`);
    check('the habit checkbox', await hit('.habit-item .habit-check'));
    const box = sel => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return Math.min(r.width, r.height); })()`);
    check('row action buttons', (await box('.habit-item .btn-icon')) >= 44, await box('.habit-item .btn-icon'));
    check('the checkbox still draws at its normal size', await ev(`(() => { const s = getComputedStyle(document.querySelector('.habit-check')); return parseFloat(s.width) <= 26; })()`));
    await ev(`location.hash = '#profile'`); await sleep(500);
    check('settings switches', await hit('#dark-mode-toggle'));
    await ev(`import('./ui.js').then(m => { m.toast('Habit removed', 'info', 60000, { label: 'Undo', onClick() {} }); return 1; })`); await sleep(100);
    check('the toast action', (await ev(`document.querySelector('.toast-action').getBoundingClientRect().height`)) >= 44);
    noExceptions();
  });

  scenario('review: sheets are dragged by a real grab area that the browser will not scroll', async () => {
    await boot({ seed: withHabit() }); await ready();
    await ev(`(() => { const cb = document.querySelector('.habit-check'); cb.click(); })()`); await sleep(450);
    const h = JSON.parse(await ev(`JSON.stringify((() => { const e = document.querySelector('#confirm-check-modal .sheet-handle'), r = e.getBoundingClientRect(), d = e.closest('.dialog').getBoundingClientRect(); return { h: r.height, w: r.width, dw: d.width, ta: getComputedStyle(e).touchAction }; })())`));
    check('the grab area is at least 24px tall and spans the sheet', h.h >= 24 && h.w >= h.dw - 2, JSON.stringify(h));
    check('the browser leaves touches on it to the app', h.ta === 'none', h.ta);
    await ev(`(async () => { const t = document.querySelector('#confirm-check-modal .dialog-title'), r = t.getBoundingClientRect(); const f = (ty, y) => (ty === 'pointerdown' ? t : window).dispatchEvent(new PointerEvent(ty, { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: r.left + 20, clientY: y })); f('pointerdown', r.top + 5); f('pointermove', r.top + 150); f('pointerup', r.top + 150); return 1; })()`); await sleep(300);
    check('dragging the title does not move or close the sheet (it would fight scrolling)', await visible('#confirm-check-modal'));
    noExceptions();
  });

  scenario('review: if habits cannot be loaded, the placeholders give way to a message', async () => {
    await boot({ seed: signedIn(), initScript: 'window.__mockSnapshotError = "permission-denied";' });
    await sleep(900);
    check('no placeholder rows left', (await ev(`document.querySelectorAll('#habits .skel-row').length`)) === 0);
    check('the list is not stuck busy', (await ev(`document.getElementById('habits').getAttribute('aria-busy')`)) !== 'true');
    check('it says what happened', /could not load your habits/i.test(await ev(`document.body.innerText`)));
  });
};
