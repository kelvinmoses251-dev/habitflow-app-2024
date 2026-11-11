// Accessibility regressions: names for controls, dialog semantics, keyboard escape, contrast.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, sleep, signedIn, noExceptions } = c;
  const habit = (name, dates = []) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 600000).toISOString(), order: 1 });
  const ready = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`);
  const press = key => ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }))`);

  scenario('a11y: every habit control has an accessible name that includes the habit', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Evening Run') } } } });
    await ready();
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`);
    const names = await ev(`[...document.querySelectorAll('#habits .habit-item input, #habits .habit-item button')].map(e => e.getAttribute('aria-label') || '')`);
    check('checkbox + timer + edit + delete all labelled', names.length >= 4 && names.every(n => /Evening Run/.test(n)), JSON.stringify(names));
    check('active nav item is aria-current', (await ev(`document.querySelectorAll('[aria-current="page"]').length`)) >= 1);
    check('toasts are announced', (await ev(`document.getElementById('toast-container').getAttribute('aria-live')`)) === 'polite');
    check('form fields have names', (await ev(`['habit-input','habit-category','habit-frequency'].every(id => !!document.getElementById(id).getAttribute('aria-label'))`)) === true);
  });

  scenario('a11y: modals are dialogs and Escape closes the top-most one', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Evening Run') } } } });
    await ready();
    const modals = ['edit-modal', 'recovery-modal', 'timer-modal', 'details-modal', 'confirm-check-modal', 'confirm-export-modal', 'level-up-modal', 'share-card-modal', 'crop-modal'];
    const ok = await ev(`${JSON.stringify(modals)}.every(id => { const m = document.getElementById(id); return m.getAttribute('role') === 'dialog' && m.getAttribute('aria-modal') === 'true' && !!m.getAttribute('aria-label'); })`);
    check('all 9 modals declare role=dialog + aria-modal + label', ok === true);

    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`);
    await ev(`document.querySelector('#habits [data-action="edit"]').click()`);
    check('edit modal opens', await waitFor(`!document.getElementById('edit-modal').classList.contains('hidden')`));
    await press('Escape');
    check('Escape closes it', await waitFor(`document.getElementById('edit-modal').classList.contains('hidden')`));

    await ev(`document.querySelector('#habits .habit-check').click()`);
    check('confirm dialog opens', await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`));
    await press('Escape');
    check('Escape cancels it (nothing ticked)', await waitFor(`document.getElementById('confirm-check-modal').classList.contains('hidden')`) && (await ev(`document.querySelector('#habits .habit-check').checked`)) === false);
    noExceptions();
  });

  scenario('a11y: muted text meets WCAG AA (4.5:1) in light and dark', async () => {
    for (const scheme of ['light', 'dark']) {
      await boot({ seed: signedIn({ theme: scheme }) });
      await ready();
      const ratio = await ev(`(() => {
        const rgb = s => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
        const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
        const probe = document.createElement('span'); probe.style.color = 'var(--muted)'; document.body.appendChild(probe);
        const fg = rgb(getComputedStyle(probe).color); probe.remove();
        const bg = rgb(getComputedStyle(document.body).getPropertyValue('--surface').trim().startsWith('#') ? (()=>{ const h = getComputedStyle(document.body).getPropertyValue('--surface').trim().slice(1); return 'rgb(' + [0,2,4].map(i => parseInt(h.substr(i,2),16)).join(',') + ')'; })() : 'rgb(255,255,255)');
        const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        return (a + .05) / (b + .05);
      })()`);
      check(`--muted on surface (${scheme}) is ${Number(ratio).toFixed(1)}:1`, ratio >= 4.5, ratio);
    }
  });
};
