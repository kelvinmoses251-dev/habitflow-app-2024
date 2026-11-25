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
    check('Edit opens with the habit filled in', (await ev(`document.getElementById('edit-habit-name').value`)) === 'Read 10 pages' && (await ev(`document.getElementById('edit-habit-category').value`)) === 'reading');
    await ev(`(() => { document.getElementById('edit-habit-name').value = 'Read 20 pages'; document.getElementById('edit-habit-category').value = 'growth'; document.getElementById('edit-habit-form').requestSubmit(); })()`); await sleep(500);
    check('the new name and category are saved', (await ev(`__mockDB.habits.a.name + '|' + __mockDB.habits.a.category`)) === 'Read 20 pages|growth');
    check('its completions are untouched', (await ev(`__mockDB.habits.a.completedDates.join()`)) === history.join());
    check('its streak is still shown', (await ev(`document.querySelector('.habit-item[data-id="a"] .streak-pill').textContent.trim()`)) === '3');
    await boot({ seed: seed({ a: H('Read 10 pages') }) }); await rows(); await sleep(300);
    await ev(`document.querySelector('.habit-item[data-id="a"] .row-more').click()`); await sleep(250);
    check('on a phone, Edit is among the row actions for an old habit too', await ev(`!!document.querySelector('.habit-item[data-id="a"] .habit-actions [data-action="edit"]')`));
    noExceptions();
  });
};
