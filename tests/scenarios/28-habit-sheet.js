// Creating and editing habits (roadmap batch 3): edit at any time, the habit sheet, look, cue.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#habits .habit-item')`);

  // ── 27: edit at any time ─────────────────────────────────
  scenario('habits: an old habit can still be edited, and keeps its history', async () => {
    const history = [day(1), day(2), day(3)];
    await boot({ seed: seed({ a: H('Read 10 pages', { category: 'reading', completedDates: history }) }), mobile: false }); await rows(); await sleep(300);
    check('a habit made long ago has an Edit action', (await ev(`document.querySelectorAll('.habit-item[data-id="a"] [data-action="edit"]').length`)) === 1);
    await ev(`document.querySelector('.habit-item[data-id="a"] [data-action="edit"]').click()`); await sleep(350);
    check('Edit opens with the habit filled in', (await ev(`document.getElementById('habit-input').value`)) === 'Read 10 pages' && (await ev(`document.getElementById('habit-category').value`)) === 'reading');
    await ev(`(() => { document.getElementById('habit-input').value = 'Read 20 pages'; document.getElementById('habit-category').value = 'growth'; document.getElementById('habit-form').requestSubmit(); })()`); await sleep(500);
    check('the new name and category are saved', (await ev(`__mockDB.habits.a.name + '|' + __mockDB.habits.a.category`)) === 'Read 20 pages|growth');
    check('its completions are untouched', (await ev(`__mockDB.habits.a.completedDates.join()`)) === history.join());
    check('its streak is still shown', (await ev(`document.querySelector('.habit-item[data-id="a"] .streak-pill').textContent.trim()`)) === '3');
    await boot({ seed: seed({ a: H('Read 10 pages') }) }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="a"] .row-more').click()`); await sleep(250);
    check('on a phone, Edit is among the row actions for an old habit too', await ev(`!!document.querySelector('.habit-item[data-id="a"] .habit-actions [data-action="edit"]')`));
    noExceptions();
  });

  // ── 21: one sheet for creating and editing, with a live preview ─
  const sheetOpen = () => ev(`!document.getElementById('habit-sheet').classList.contains('hidden')`);
  const closeSheet = async () => { await ev(`document.getElementById('habit-cancel').click()`); await sleep(250); };
  const fill = (name, cat, time) => ev(`(() => { const i = document.getElementById('habit-input'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('input', { bubbles: true }));
    ${cat ? `const c = document.getElementById('habit-category'); c.value = ${JSON.stringify(cat)}; c.dispatchEvent(new Event('change', { bubbles: true }));` : ''}
    ${time ? `const t = document.getElementById('habit-time'); t.value = ${JSON.stringify(time)}; t.dispatchEvent(new Event('change', { bubbles: true }));` : ''} })()`);
  const preview = () => ev(`document.getElementById('habit-preview').innerText.replace(/\\s+/g, ' ').trim()`);

  scenario('sheet: New habit opens a sheet from every route, with the cursor in the name', async () => {
    await boot({ seed: seed({ a: H('Read') }), mobile: false }); await rows(); await sleep(300);
    check('Home no longer carries an inline form', !(await sheetOpen()) && (await ev(`document.querySelectorAll('#page-home form').length`)) === 0);
    const routes = [['the New habit row', `document.getElementById('new-habit-toggle').click()`], ['the top bar button', `document.querySelector('.topnav-new').click()`]];
    for (const [what, js] of routes) {
      await ev(js); await sleep(450);
      check(`${what} opens it`, (await sheetOpen()) && (await ev(`document.activeElement.id`)) === 'habit-input', await ev(`document.activeElement.id`));
      check(`${what}: it is titled New habit and empty`, (await ev(`document.getElementById('habit-sheet-title').textContent`)) === 'New habit' && (await ev(`document.getElementById('habit-input').value`)) === '');
      await closeSheet();
    }
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'n', code: 'KeyN' }); await sleep(450);
    check('the N key opens it', await sheetOpen());
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await sleep(300);
    check('Escape closes it', !(await sheetOpen()));
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await ev(`document.getElementById('today-add').click()`); await sleep(450);
    check('phone: the + in the Today header opens it', await sheetOpen());
    check('a tap outside does not close it (work in progress)', await ev(`(() => { const m = document.getElementById('habit-sheet'); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); m.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !m.classList.contains('hidden'); })()`));
    noExceptions();
  });

  scenario('sheet: the preview shows the row exactly as it is being built', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await ev(`(() => { const b = document.getElementById('new-habit-toggle'); b.focus(); b.click(); })()`); await sleep(450);
    check('before anything is typed the preview shows a placeholder', /your habit/i.test(await preview()), await preview());
    await fill('Evening walk', 'fitness', 'evening'); await sleep(150);
    check('it follows the name', /Evening walk/.test(await preview()), await preview());
    check('it shows the category with its icon', /Fitness/.test(await preview()) && await ev(`!!document.querySelector('#habit-preview use[href="#i-cat-fitness"]')`));
    check('it shows the time of day', /Evening/.test(await preview()));
    await ev(`(() => { const f = document.getElementById('habit-frequency'); f.value = 'weekly'; f.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
    check('it shows a weekly habit as weekly', /weekly/i.test(await preview()));
    check('the preview cannot be ticked or tabbed to', await ev(`document.getElementById('habit-preview').getAttribute('aria-hidden') === 'true' && document.querySelectorAll('#habit-preview input, #habit-preview button, #habit-preview a').length === 0`));
    await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(500);
    check('Add saves the habit and closes the sheet', (await ev(`Object.values(__mockDB.habits).filter(h => h.name === 'Evening walk' && h.category === 'fitness' && h.frequency === 'weekly' && h.timeOfDay === 'evening').length`)) === 1 && !(await sheetOpen()));
    check('focus returns to where it was', (await ev(`document.activeElement.id`)) === 'new-habit-toggle', await ev(`document.activeElement.id`));
    noExceptions();
  });

  scenario('sheet: editing uses the same sheet, filled in', async () => {
    await boot({ seed: seed({ a: H('Read 10 pages', { category: 'reading', timeOfDay: 'morning', completedDates: [day(1)] }) }), mobile: false }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="a"] [data-action="edit"]').click()`); await sleep(450);
    check('it is titled Edit habit, with a Save button', (await ev(`document.getElementById('habit-sheet-title').textContent`)) === 'Edit habit' && /save/i.test(await ev(`document.getElementById('habit-save').textContent`)));
    check('every field is filled in', (await ev(`['habit-input', 'habit-category', 'habit-frequency', 'habit-time'].map(id => document.getElementById(id).value).join('|')`)) === 'Read 10 pages|reading|daily|morning');
    check('the preview already shows the habit', /Read 10 pages/.test(await preview()) && /Morning/.test(await preview()));
    await fill('Read 20 pages'); await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(500);
    check('Save updates that habit and adds no other', (await ev(`Object.keys(__mockDB.habits).length + '|' + __mockDB.habits.a.name + '|' + __mockDB.habits.a.completedDates.length`)) === '1|Read 20 pages|1');
    await ev(`document.getElementById('new-habit-toggle').click()`); await sleep(450);
    check('opening New habit afterwards starts clean', (await ev(`document.getElementById('habit-input').value`)) === '' && (await ev(`document.getElementById('habit-sheet-title').textContent`)) === 'New habit');
    noExceptions();
  });

  scenario('sheet: it guards against mistakes and fits a small phone', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 568, deviceScaleFactor: 1, mobile: true }); await rows(); await sleep(300);
    await ev(`document.getElementById('today-add').click()`); await sleep(450);
    check('320x568: no horizontal scroll, and the sheet fits the screen', await ev(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('#habit-sheet .dialog').getBoundingClientRect().bottom <= innerHeight + 1`));
    check('the Add button can be reached (visible, or by scrolling inside the sheet)', await ev(`(() => { const b = document.getElementById('habit-save'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`));
    await fill('   '); await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(300);
    check('a blank name is not saved', (await ev(`Object.keys(__mockDB.habits).length`)) === 1 && await sheetOpen());
    await fill('Stretch'); await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(300);
    check('a missing category is explained under the field', /choose a category/i.test(await ev(`(document.querySelector('#habit-sheet .field-msg') || {}).textContent || ''`)) && (await ev(`Object.keys(__mockDB.habits).length`)) === 1);
    await fill('<img src=x onerror=window.__x=1>', 'health'); await sleep(150);
    check('markup typed into the name is shown as text in the preview', (await ev(`!window.__x && document.querySelectorAll('#habit-preview img').length`)) === 0);
    await boot({ seed: seed({}) }); await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`); await sleep(300);
    check('an empty account is not ambushed by an open sheet', !(await sheetOpen()));
    check('it has a clear way to make a first habit', await visible('#empty-create'));
    await ev(`document.getElementById('empty-create').click()`); await sleep(450);
    check('which opens the sheet', await sheetOpen());
    noExceptions();
  });
};
