// Shared components (roadmap batch 1): custom select, dialog system, toasts.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const key = async k => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }); await sleep(60); };
  const catBtn = `document.querySelector('#habit-category ~ .select-btn')`;
  const openList = `document.querySelector('.select-list:not([hidden])')`;

  scenario('components: the category select is a designed, keyboard-friendly list', async () => {
    await boot({ seed: signedIn() });
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
};
