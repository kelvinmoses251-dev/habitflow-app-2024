// Offline-first: the core loop must keep working with no connection, and say so.
module.exports = (scenario, c) => {
  const { ev, send, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;
  const habit = (name, extra = {}) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: [], createdAt: new Date(Date.now() - 600000).toISOString(), order: 1, ...extra });
  const ready = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`);
  // Real browser offline (navigator.onLine + events) AND real-Firestore write semantics (promises never ack)
  const setOffline = async off => {
    await send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await ev(`window.__mockOffline = ${off}`);
  };

  scenario('offline: banner appears, and ticking a habit updates XP + celebrates without waiting for the server', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { users: { 'u-test': { xp: 0 } }, habits: { h1: habit('Run 5k'), h2: habit('Read', { order: 2 }) } } } });
    await ready();
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 2`);
    check('no banner while online', !(await visible('#offline-bar')));

    await setOffline(true);
    check('offline banner shows', await waitFor(`!document.getElementById('offline-bar').classList.contains('hidden')`, 4000));
    check('banner explains saving locally', /saved on this device/.test(await text('#offline-bar')));

    await ev(`document.querySelector('#habits .habit-check:not(:checked)').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    check('habit shows as done', await waitFor(`document.querySelectorAll('#habits .habit-check:checked').length === 1`, 4000));
    check('XP updated immediately (not blocked on the server)', await waitFor(`document.getElementById('user-current-xp').textContent === '25'`, 4000), await text('#user-current-xp'));
    check('success toast shown', await waitFor(`document.getElementById('toast-container').textContent.includes('Habit completed')`, 4000));
    noExceptions();

    await setOffline(false);
    check('banner hides when back online', await waitFor(`document.getElementById('offline-bar').classList.contains('hidden')`, 4000));
    check('"back online" toast', await waitFor(`document.getElementById('toast-container').textContent.includes('Back online')`, 4000));
  });

  scenario('offline: adding, editing and deleting habits never leaves the UI stuck', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Floss') } } } });
    await ready();
    await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`);
    await setOffline(true);

    await ev(`document.getElementById('habit-input').value='Stretch';document.getElementById('habit-category').value='fitness';document.getElementById('habit-frequency').value='daily';document.getElementById('habit-form').requestSubmit()`);
    check('new habit appears', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 2`, 4000));
    check('Add button is not stuck on "Adding…"', await waitFor(`document.querySelector('#habit-form button[type=submit]').textContent.includes('Add Habit') && !document.querySelector('#habit-form button[type=submit]').disabled`, 4000), await text('#habit-form button[type=submit]'));

    await ev(`document.querySelector('#habits [data-action="edit"]').click()`);
    await ev(`document.getElementById('edit-habit-name').value='Floss daily'; document.getElementById('edit-habit-form').requestSubmit()`);
    check('edit modal closes (not stuck on "Saving…")', await waitFor(`document.getElementById('edit-modal').classList.contains('hidden')`, 4000));

    await ev(`document.querySelector('#habits [data-action="delete"]').click()`);
    check('delete reflects immediately', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`, 4000));
    await ev(`document.querySelector('#toast-container .toast-action').click()`);
    check('undo reflects immediately', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 2`, 4000));
    noExceptions();
  });

  scenario('offline: a new user can add a starter pack with no connection', async () => {
    await boot({ seed: signedIn() });
    await ready();
    await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`);
    await setOffline(true);
    await ev(`document.querySelector('#starter-packs .pack-card').click()`);
    check('3 habits appear', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`, 4000));
    check('success toast (not an error)', await waitFor(`document.getElementById('toast-container').textContent.includes('added')`, 4000));
  });
};
