// Activation: what a brand-new, empty account sees and can do in its first 10 seconds.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;

  scenario('starter packs: empty account offers one-tap packs; adding one creates 3 habits and nudges the first tick', async () => {
    await boot({ seed: signedIn() });
    check('empty state shows', await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`));
    check('4 starter packs offered', (await ev(`document.querySelectorAll('#starter-packs .pack-card').length`)) === 4);
    check('pack previews its habits', /Drink a glass of water/.test(await text('#starter-packs .pack-card')));

    await ev(`document.querySelector('#starter-packs .pack-card').click()`);
    check('3 habits appear', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`));
    check('empty state is gone', !(await visible('#empty-state')));
    check('first checkbox is nudged', await waitFor(`!!document.querySelector('#habits .habit-check.nudge')`));
    check('packs are all daily habits with valid categories', (await ev(`Object.values(window.__mockDB.habits).every(h => h.frequency==='daily' && ['health','fitness','productive'].includes(h.category))`)) === true);
    check('exactly 3 docs written (no double-add)', (await ev(`window.__mockWrites.filter(w=>w.op==='add').length`)) === 3);

    await ev(`document.querySelector('#habits .habit-check').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    await waitFor(`document.querySelectorAll('#habits .habit-check:checked').length === 1`);
    await sleep(500);
    check('nudge stops after the first tick', (await ev(`document.querySelectorAll('#habits .habit-check.nudge').length`)) === 0);
    noExceptions();
  });
};
