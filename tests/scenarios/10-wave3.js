// Analytics (privacy-first), auto emoji, undo-delete, PWA shortcuts and small polish.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;
  const habit = (name, category = 'fitness', extra = {}) => ({ userId: 'u-test', name, category, frequency: 'daily', completedDates: [], createdAt: new Date(Date.now() - 600000).toISOString(), order: 1, ...extra });
  const ready = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`);
  const events = () => ev(`(window.__mockEvents || []).map(e => e.name)`);
  const tick = async () => {
    await ev(`document.querySelector('#habits .habit-check:not(:checked)').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    await waitFor(`document.querySelectorAll('#habits .habit-check:checked').length >= 1`);
  };

  // ── Analytics ──
  scenario('analytics: landing funnel + signup + core actions are recorded, with no personal data', async () => {
    await boot();
    check('landing_view logged', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'landing_view')`, 8000), JSON.stringify(await events()));
    await ev(`document.querySelectorAll('.demo-habit')[0].click()`); await sleep(300);
    check('demo_first_tick logged', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'demo_first_tick')`));
    await ev(`document.getElementById('login-btn').click()`);
    await ready();
    check('sign_up logged (google)', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'sign_up' && e.params.method === 'google')`));
    check('demo_carried_over logged', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'demo_carried_over')`));

    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`);
    await tick();
    check('habit_completed logged', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'habit_completed')`));
    const blob = JSON.stringify(await ev(`window.__mockEvents`));
    check('no email / name / habit text in any event', !/test@example|Test User|Drink water|Read 10/.test(blob), blob.slice(0, 300));
    noExceptions();
  });

  scenario('analytics: starter pack + form add are recorded', async () => {
    await boot({ seed: signedIn() });
    await ready();
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    await ev(`document.querySelector('#starter-packs .pack-card').click()`);
    check('starter_pack_added logged', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'starter_pack_added' && e.params.pack === 'morning')`));
    await ev(`document.getElementById('habit-input').value='Floss';document.getElementById('habit-category').value='health';document.getElementById('habit-frequency').value='daily';document.getElementById('habit-form').requestSubmit()`);
    check('habit_added logged', await waitFor(`(window.__mockEvents||[]).some(e => e.name === 'habit_added' && e.params.source === 'form')`));
  });

  scenario('analytics: Do Not Track is honoured', async () => {
    await boot({ seed: signedIn(), initScript: `Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });` });
    await ready();
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    await ev(`document.querySelector('#starter-packs .pack-card').click()`);
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`);
    await sleep(800);
    check('nothing was sent', (await events()).length === 0, JSON.stringify(await events()));
  });

  scenario('analytics: the in-app opt-out works and is remembered', async () => {
    await boot({ seed: signedIn() });
    await ready();
    check('toggle starts on', (await ev(`document.getElementById('analytics-toggle').checked`)) === true);
    await ev(`document.getElementById('analytics-toggle').click()`);
    check('preference saved', (await ev(`localStorage.getItem('habitly_analytics')`)) === 'off');
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    await ev(`document.querySelector('#starter-packs .pack-card').click()`);
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`);
    await sleep(800);
    check('no events after opting out', (await events()).length === 0, JSON.stringify(await events()));
    await boot({ seed: signedIn({ habitly_analytics: 'off' }) });
    await ready();
    check('toggle stays off after reload', (await ev(`document.getElementById('analytics-toggle').checked`)) === false);
  });

  // ── Undo delete ──
  scenario('undo: removing a habit offers Undo, which restores it', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Floss', 'health') } } } });
    await ready();
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`);
    await ev(`document.querySelector('#habits [data-action="delete"]').click()`);
    check('habit disappears', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 0`));
    check('toast offers Undo', await waitFor(`!!document.querySelector('#toast-container .toast-action')`));
    await ev(`document.querySelector('#toast-container .toast-action').click()`);
    check('habit is back', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`));
    check('deletedAt cleared', (await ev(`window.__mockDB.habits.h1.deletedAt`)) === null);
    noExceptions();
  });

  // ── Small polish ──
  scenario('polish: PWA shortcuts, 11 categories copy, habit name length cap', async () => {
    await boot();
    const m = await ev(`fetch('/manifest.json').then(r => r.json())`);
    check('manifest has 2 shortcuts', Array.isArray(m.shortcuts) && m.shortcuts.length === 2, JSON.stringify(m.shortcuts));
    check('shortcut deep-links to #stats', m.shortcuts.some(s => /#stats$/.test(s.url)));
    check('dropdown really has 11', (await ev(`document.querySelectorAll('#habit-category option:not([disabled])').length`)) === 11);
    check('habit name input capped at 60', (await ev(`document.getElementById('habit-input').maxLength`)) === 60);
  });
};
