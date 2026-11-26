// The completion moment (roadmap batch 4, item 31): the check draws, the ring fills, the row settles.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const buzzSpy = `Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: p => { (window.__buzz = window.__buzz || []).push(p); return true; } });`;
  // Click a row's control and, in the same breath (before any timer or save can run), report what the row looks like.
  const tapAndLook = (id, control = '.habit-check') => ev(`(() => {
    const row = document.querySelector('.habit-item[data-id="${id}"]');
    row.querySelector('${control}').click();
    const fx = row.querySelector('.tick-fx');
    const info = el => { if (!el) return null; const s = getComputedStyle(el); return { name: s.animationName, ends: (parseFloat(s.animationDuration) + parseFloat(s.animationDelay)) * 1000, count: s.animationIterationCount }; };
    return JSON.stringify({ completing: row.classList.contains('completing'), fx: !!fx, hidden: fx && fx.getAttribute('aria-hidden'), shown: fx && getComputedStyle(fx).display !== 'none',
      ring: info(fx && fx.querySelector('.fx-ring')), mark: info(fx && fx.querySelector('.fx-mark')), fill: info(fx && fx.querySelector('.fx-fill')), row: info(row) });
  })()`).then(JSON.parse);
  const once = a => a && a.count === '1' && a.ends > 0 && a.ends <= 900;

  scenario('completion: the tick draws at once, runs once, and carries on through the save', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }), initScript: buzzSpy }); await rows(); await sleep(300);
    const r = await tapAndLook('a');
    check('the row starts its completion effect in the same instant as the tap', r.completing && r.fx && r.shown, JSON.stringify(r));
    check('the effect is decoration: hidden from screen readers', r.hidden === 'true');
    check('the ring draws, once, in under 900ms', r.ring && r.ring.name === 'fxRing' && once(r.ring), JSON.stringify(r.ring));
    check('the box fills, once', r.fill && r.fill.name === 'fxFill' && once(r.fill), JSON.stringify(r.fill));
    check('the check draws, once', r.mark && r.mark.name === 'fxMark' && once(r.mark), JSON.stringify(r.mark));
    check('the row settles, once', r.row && r.row.name === 'fxSettle' && once(r.row), JSON.stringify(r.row));
    check('the vibration matches: ring, then check', JSON.stringify(await ev(`window.__buzz && window.__buzz[window.__buzz.length - 1]`)) === '[14,50,26]', JSON.stringify(await ev(`window.__buzz`)));
    await sleep(500);
    check('the completion is saved on time', await ev(`__mockDB.habits.a.completedDates.includes(${JSON.stringify(day(0))})`));
    check('the toast still says so, with Undo', await ev(`[...document.querySelectorAll('.toast')].some(t => /Completed/.test(t.textContent) && !!t.querySelector('.toast-action'))`));
    const after = JSON.parse(await ev(`(() => { const row = document.querySelector('.habit-item[data-id="a"]'); const m = row.querySelector('.tick-fx .fx-mark');
      return JSON.stringify({ completing: row.classList.contains('completing'), delay: m ? parseFloat(getComputedStyle(m).animationDelay) * 1000 : null, checked: row.querySelector('.habit-check').checked }); })()`));
    check('the redrawn row carries on from where the effect was (it does not start again)', after.completing && after.delay !== null && after.delay < -100, JSON.stringify(after));
    check('the box is ticked', after.checked);
    check('the other row was left alone', await ev(`!document.querySelector('.habit-item[data-id="b"]').classList.contains('completing') && !document.querySelector('.habit-item[data-id="b"] .tick-fx')`));
    await sleep(1300);
    await ev(`document.querySelector('.habit-item[data-id="b"] .habit-check').click()`); await sleep(600);
    check('a later redraw does not replay the first row', await ev(`!document.querySelector('.habit-item[data-id="a"]').classList.contains('completing')`));
    noExceptions();
  });

  scenario('completion: with reduced motion the box is simply ticked', async () => {
    await boot({ seed: seed({ a: H('Read') }) }); await rows(); await sleep(300);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });   // after boot: boot sets the media itself
    try {
      const r = await tapAndLook('a');
      check('no drawn effect is shown', !r.shown, JSON.stringify(r));
      check('the box shows its own tick straight away', await ev(`(() => { const cb = document.querySelector('.habit-item[data-id="a"] .habit-check'); return cb.checked && getComputedStyle(cb).backgroundImage !== 'none'; })()`));
      await sleep(500);
      check('and it is saved', await ev(`__mockDB.habits.a.completedDates.length === 1`));
    } finally { await send('Emulation.setEmulatedMedia', { features: [] }); }
    noExceptions();
  });

  scenario('completion: a counting habit gets the effect on the step that reaches its goal, not before', async () => {
    await boot({ seed: seed({ w: H('Water', { target: { amount: 3, unit: 'glasses', step: 1 }, progress: { [day(0)]: 1 } }) }) }); await rows(); await sleep(300);
    const mid = await tapAndLook('w', '.habit-step');
    check('a step on the way has no completion effect', !mid.completing && !mid.fx, JSON.stringify(mid));
    await sleep(400);
    const last = await tapAndLook('w', '.habit-step');
    check('the step that reaches the goal does', last.completing && last.fx && last.mark && last.mark.name === 'fxMark', JSON.stringify(last));
    await sleep(600);
    check('the goal is saved as a completion', await ev(`__mockDB.habits.w.completedDates.length === 1`));
    noExceptions();
  });

  scenario('completion: taking a tick back plays no completion effect', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }), initScript: buzzSpy }); await rows(); await sleep(300);
    await tapAndLook('a');
    const off = JSON.parse(await ev(`(() => { const row = document.querySelector('.habit-item[data-id="a"]'); row.querySelector('.habit-check').click();
      return JSON.stringify({ completing: row.classList.contains('completing'), fx: !!row.querySelector('.tick-fx'), checked: row.querySelector('.habit-check').checked }); })()`));
    check('un-ticking within the moment stops the effect', !off.completing && !off.fx && !off.checked, JSON.stringify(off));
    await sleep(600);
    check('and nothing was saved', await ev(`__mockDB.habits.a.completedDates.length === 0`));
    await ev(`document.querySelector('.habit-item[data-id="b"] .habit-check').click()`); await sleep(1500);
    const back = JSON.parse(await ev(`(() => { const row = document.querySelector('.habit-item[data-id="b"]'); row.querySelector('.habit-check').click();
      return JSON.stringify({ completing: row.classList.contains('completing'), fx: !!row.querySelector('.tick-fx') }); })()`));
    check('un-ticking a saved completion shows no effect either', !back.completing && !back.fx, JSON.stringify(back));
    check('a take-back keeps its own short buzz', await ev(`window.__buzz[window.__buzz.length - 1] === 30`));
    await sleep(500);
    check('after the redraw the row is plain and open', await ev(`(() => { const row = document.querySelector('.habit-item[data-id="b"]'); return !row.classList.contains('completing') && !row.querySelector('.habit-check').checked; })()`));
    noExceptions();
  });
};
