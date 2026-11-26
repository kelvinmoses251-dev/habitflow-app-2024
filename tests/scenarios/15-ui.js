// UI behaviour added to make the product feel alive: progress ring, week strip, tidy new-habit row,
// a clear completion moment, display type, and an opt-out for the completion confirmation.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;
  const key = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const habit = (name, dates = [], extra = {}) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), order: 1, ...extra });
  const seed = habits => ({ ...signedIn(), mock_fb_db: { habits } });
  const ready = n => waitFor(`document.querySelectorAll('#habits .habit-item').length === ${n}`);
  const RING = 2 * Math.PI * 44;

  scenario('ring: shows how many of today\'s habits are done, with the right arc and wording', async () => {
    await boot({ seed: seed({ a: habit('A', [key(0)]), b: habit('B', [key(0)]), c: habit('C') }) });
    await ready(3);
    check('big number is 2', (await text('#ring-num')) === '2');
    check('"of 3" under it', (await text('#ring-of')) === 'of 3');
    check('summary line says 1 left', (await text('#summary-line')) === '1 left today', await text('#summary-line'));
    const off = +(await ev(`document.getElementById('ring-fg').style.strokeDashoffset`));
    check('arc covers two thirds', Math.abs(off - RING / 3) < 1, off);
    check('screen readers get the sentence', (await ev(`document.getElementById('today-ring').getAttribute('aria-label')`)) === "2 of 3 habits done today. Open today's recap");   // the ring is a button since batch 4
    check('not marked complete yet', (await ev(`document.getElementById('today-ring').classList.contains('complete')`)) === false);
  });

  scenario('ring: turns green and says so when everything is done; reads sensibly with no habits', async () => {
    await boot({ seed: seed({ a: habit('A', [key(0)]), b: habit('B', [key(0)]) }) });
    await ready(2);
    check('complete state', (await ev(`document.getElementById('today-ring').classList.contains('complete')`)) === true);
    check('summary line', (await text('#summary-line')) === 'All done for today');
    check('arc is full', Math.abs(+(await ev(`document.getElementById('ring-fg').style.strokeDashoffset`))) < 1);
    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    check('empty: "No habits yet"', (await text('#summary-line')) === 'No habits yet');
    check('empty: ring label', (await ev(`document.getElementById('today-ring').getAttribute('aria-label')`)) === "No habits yet. Open today's recap");
  });

  scenario('week strip: seven days, today marked, filled = all done, tinted = some done', async () => {
    // yesterday: both done (full). 2 days ago: one of two (some). 3 days ago: nothing. Today: nothing yet.
    await boot({ seed: seed({ a: habit('A', [key(-1), key(-2)]), b: habit('B', [key(-1)]) }) });
    await ready(2);
    check('7 days', (await ev(`document.querySelectorAll('#week-strip .wk-day').length`)) === 7);
    const cls = await ev(`[...document.querySelectorAll('#week-strip .wk-day')].map(d => d.className.replace('wk-day ', ''))`);
    check('last cell is today', /is-today/.test(cls[6]), JSON.stringify(cls));
    check('yesterday is full', /^full/.test(cls[5]), JSON.stringify(cls));
    check('two days ago is partial', /^some/.test(cls[4]), JSON.stringify(cls));
    check('three days ago is empty', /^none/.test(cls[3]), JSON.stringify(cls));
    check('a full day shows a check mark', (await ev(`document.querySelectorAll('#week-strip .wk-day.full .wk-dot svg').length`)) >= 1);
    check('each day is labelled for screen readers', (await ev(`[...document.querySelectorAll('#week-strip .wk-day')].every(d => /: (all|some|no) habits? done$/.test(d.getAttribute('aria-label')))`)) === true);
  });

  scenario('week strip: a habit created today does not make earlier days look "incomplete"', async () => {
    await boot({ seed: seed({ a: habit('A', [key(-1)], { createdAt: new Date(Date.now() - 864e5 * 1.5).toISOString() }), b: habit('New today', [], { createdAt: new Date().toISOString() }) }) });
    await ready(2);
    const cls = await ev(`[...document.querySelectorAll('#week-strip .wk-day')].map(d => d.className.replace('wk-day ', ''))`);
    check('yesterday still counts as full', /^full/.test(cls[5]), JSON.stringify(cls));
  });

  scenario('new habit: one tidy row on Home that opens the habit sheet and hands you the name field', async () => {
    await boot({ seed: seed({ a: habit('A'), b: habit('B') }) });
    await ready(2);
    check('closed to begin with', (await ev(`document.getElementById('habit-form').hidden`)) === true);
    check('toggle reflects it for assistive tech', (await ev(`document.getElementById('new-habit-toggle').getAttribute('aria-expanded')`)) === 'false');
    await ev(`document.getElementById('new-habit-toggle').click()`);
    check('opens on tap', (await ev(`document.getElementById('habit-form').hidden`)) === false);
    check('and focuses the name field', await waitFor(`document.activeElement.id === 'habit-input'`, 3000));
    await ev(`document.getElementById('habit-input').value='Third';document.getElementById('habit-category').value='health';document.getElementById('habit-frequency').value='daily';document.getElementById('habit-form').requestSubmit()`);
    await ready(3);
    check('closes once the habit is added', await waitFor(`document.getElementById('habit-form').hidden === true`));

    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    check('an empty account is not met by an open sheet', (await ev(`document.getElementById('habit-form').hidden`)) === true);
    await ev(`document.getElementById('empty-create').click()`); await sleep(300);
    check('Create your own opens it', (await ev(`document.getElementById('habit-form').hidden`)) === false);
    await ev(`document.getElementById('habit-input').value='First';document.getElementById('habit-category').value='health';document.getElementById('habit-frequency').value='daily';document.getElementById('habit-form').requestSubmit()`);
    await ready(1);
    check('it closes after the first habit too: the list is what you see next', (await ev(`document.getElementById('habit-form').hidden`)) === true);
  });

  scenario('completion moment: the row is highlighted, the ring and week strip update, and each row carries its category colour', async () => {
    await boot({ seed: seed({ a: habit('A'), b: habit('B') }) });
    await ready(2);
    check('rows carry a category colour on a tinted icon chip', (await ev(`(() => { const r = document.querySelector('#habits .habit-item'); const chip = r.querySelector('.cat-ico'); return !!getComputedStyle(r).getPropertyValue('--cat').trim() && !!chip && getComputedStyle(chip).width === '18px'; })()`)) === true);
    await ev(`document.querySelector('#habits .habit-check').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    check('the completed row is highlighted', await waitFor(`!!document.querySelector('#habits .habit-item.just-done')`, 3000));
    check('ring moves to 1 of 2', await waitFor(`document.getElementById('ring-num').textContent === '1' && document.getElementById('ring-of').textContent === 'of 2'`, 3000));
    check('today becomes partial in the week strip', await waitFor(`document.querySelector('#week-strip .wk-day.is-today').classList.contains('some')`, 3000));
    noExceptions();
  });

  scenario('all-done dialog: names the streak and draws the check', async () => {
    await boot({ seed: seed({ a: habit('A', [key(-1), key(-2)]) }) });
    await ready(1);
    await ev(`document.querySelector('#habits .habit-check').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    check('dialog opens', await waitFor(`!document.getElementById('all-done-overlay').classList.contains('hidden')`, 6000));
    check('mentions the 3-day streak', /streak is 3 days/.test(await text('#all-done-text')), await text('#all-done-text'));
    check('check mark is a drawn stroke', (await ev(`getComputedStyle(document.querySelector('.done-check')).strokeDasharray`)) !== 'none');
  });

  scenario('Ask before completing: off by default (one tap); a saved choice is respected', async () => {
    await boot({ seed: { ...seed({ a: habit('A') }), habitly_confirm: null } });
    await ready(1);
    check('setting is off by default', (await ev(`document.getElementById('confirm-toggle').checked`)) === false);
    await boot({ seed: { ...seed({ a: habit('A') }), habitly_confirm: 'on' } });
    await ready(1);
    check('switched on, it shows on', (await ev(`document.getElementById('confirm-toggle').checked`)) === true);
    await boot({ seed: { ...seed({ a: habit('A') }), habitly_confirm: 'off' } });
    await ready(1);
    check('setting reflects the saved choice', (await ev(`document.getElementById('confirm-toggle').checked`)) === false);
    await ev(`document.querySelector('#habits .habit-check').click()`);
    check('completes without a dialog', await waitFor(`document.querySelectorAll('#habits .habit-check:checked').length === 1`, 3000));
    check('no confirmation shown', !(await visible('#confirm-check-modal')));
    check('XP awarded', await waitFor(`(window.__mockDB.users||{})['u-test']?.xp >= 25`, 4000));
  });

  scenario('type: serif for headlines and numerals, Inter for everything you read or tap', async () => {
    await boot({ seed: seed({ a: habit('A') }) });
    await ready(1);
    check('greeting is set in the display serif', (await ev(`getComputedStyle(document.getElementById('greeting-name')).fontFamily`)).startsWith('"Instrument Serif"'));
    check('ring numeral is serif', (await ev(`getComputedStyle(document.getElementById('ring-num')).fontFamily`)).startsWith('"Instrument Serif"'));
    check('habit names stay in Inter', (await ev(`getComputedStyle(document.querySelector('.habit-name')).fontFamily`)).startsWith('Inter'));
    check('buttons stay in Inter', (await ev(`getComputedStyle(document.querySelector('#new-habit-toggle')).fontFamily`)).startsWith('Inter'));
    await boot();
    check('landing headline is serif with one italic accent word', (await ev(`getComputedStyle(document.querySelector('.landing-title')).fontFamily`)).startsWith('"Instrument Serif"') && (await ev(`getComputedStyle(document.querySelector('.landing-title em')).fontStyle`)) === 'italic');
  });
};
