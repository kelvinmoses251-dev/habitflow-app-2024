// What a habit can be (roadmap batch 3): a cue, a schedule, a measurable target.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const openNew = async () => { await ev(`document.getElementById('new-habit-toggle').click()`); await sleep(450); };
  const openEdit = async id => { await ev(`document.querySelector('.habit-item[data-id="${id}"] [data-action="edit"]').click()`); await sleep(450); };
  const setField = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const save = async () => { await ev(`document.getElementById('habit-form').requestSubmit()`); await sleep(500); };
  const byName = name => ev(`Object.keys(__mockDB.habits).find(k => __mockDB.habits[k].name === ${JSON.stringify(name)})`);
  const privacy = () => fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');

  // ── 29: a cue for each habit ─────────────────────────────
  scenario('cue: a habit can say what triggers it, and the row shows it', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Stretch', { order: 2, cue: 'After I pour my coffee' }) }) }); await rows(); await sleep(300);
    check('a habit with a cue shows it under its name', (await ev(`document.querySelector('.habit-item[data-id="b"] .habit-cue').textContent.trim()`)) === 'After I pour my coffee');
    check('a habit without one has no empty line', (await ev(`document.querySelectorAll('.habit-item[data-id="a"] .habit-cue').length`)) === 0);
    await openNew();
    await setField('habit-input', 'Floss'); await setField('habit-category', 'health');
    await setField('habit-cue', '  After I brush my teeth  '); await sleep(150);
    check('the preview shows the cue as it is typed', /After I brush my teeth/.test(await ev(`document.getElementById('habit-preview').innerText`)));
    await save();
    const id = await byName('Floss');
    check('it is saved, trimmed', (await ev(`__mockDB.habits[${JSON.stringify(id)}].cue`)) === 'After I brush my teeth');
    check('the field cannot take more than 80 characters', (await ev(`document.getElementById('habit-cue').maxLength`)) === 80);
    await openNew();
    await setField('habit-input', 'Tricky'); await setField('habit-category', 'health'); await setField('habit-cue', '<img src=x onerror="window.__cue=1">'); await save();
    check('markup in a cue is shown as text, never run', await ev(`!window.__cue && document.querySelectorAll('#page-home .habit-cue img').length === 0`));
    check('a habit made with no cue stores nothing', await ev(`!('cue' in __mockDB.habits.a)`));
    noExceptions();
  });

  scenario('cue: it can be edited away, fits a small phone, and appears in focus view', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Stretch', { order: 2, cue: 'After I pour my coffee and sit down at the desk by the window in the morning light' }) }), mobile: false }); await rows(); await sleep(300);
    await openEdit('b');
    check('Edit shows the saved cue', /After I pour my coffee/.test(await ev(`document.getElementById('habit-cue').value`)));
    await setField('habit-cue', ''); await save();
    check('clearing it removes the field', await ev(`!('cue' in __mockDB.habits.b)`));
    await boot({ seed: seed({ a: H('Read', { cue: 'After lunch' }), b: H('Stretch', { order: 2, cue: 'After I pour my coffee and sit down at the desk by the window in the morning light' }) }) }); await size(320, 568); await rows(); await sleep(300);
    check('320px: a long cue is cut short, with no horizontal scroll', await ev(`document.documentElement.scrollWidth <= innerWidth && (() => { const e = document.querySelector('.habit-item[data-id="b"] .habit-cue'); return e.scrollWidth > e.clientWidth && e.getBoundingClientRect().height < 24; })()`));
    await ev(`document.getElementById('focus-open').click()`); await sleep(450);
    check('focus view shows the cue for the habit on screen', (await ev(`document.getElementById('focus-cue').textContent.trim()`)) === 'After lunch');
    check('the privacy policy mentions the cue', /cue/i.test(privacy()));
    noExceptions();
  });
};
