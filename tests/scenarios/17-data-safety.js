// XP must never be overwritten by a guess, and deleting an account must remove everything or nothing.
module.exports = (scenario, c) => {
  const { boot, ev, sleep, waitFor, signedIn, check, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const habit = (o = {}) => ({ userId: 'u-test', name: 'Read', category: 'reading', frequency: 'daily',
    completedDates: [day(1)], createdAt: '2026-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, profile) => signedIn({ habitly_confirm: 'off',
    mock_fb_db: { habits, users: profile ? { 'u-test': profile } : {} } });
  const xp = () => ev(`__mockDB.users['u-test'].xp`);
  const slow = 'window.__mockProfileDelay = 700;';

  scenario('data: saved XP survives a profile that loads after the habits', async () => {
    await boot({ seed: seed({ a: habit() }, { xp: 900 }), initScript: slow });
    await sleep(1800);
    check('XP is still 900', (await xp()) === 900, await xp());
    noExceptions();
  });

  scenario('data: completing a habit before the profile loads adds to saved XP', async () => {
    await boot({ seed: seed({ a: habit(), b: habit({ name: 'Run', order: 2 }) }, { xp: 900 }), initScript: 'window.__mockProfileDelay = 4000;' });
    await waitFor(`!!document.querySelector('.habit-check')`);
    await ev(`document.querySelector('.habit-check').click()`);
    await sleep(1000);
    check('XP is 925', (await xp()) === 925, await xp());
  });

  scenario('data: XP earned on another device is added to, not overwritten', async () => {
    await boot({ seed: seed({ a: habit(), b: habit({ name: 'Run', order: 2 }) }, { xp: 900 }) });
    await sleep(800);
    await ev(`__mockDB.users['u-test'].xp = 1000; 0`);          // the other device, not yet synced to this one
    await ev(`document.querySelector('.habit-check').click()`);
    await sleep(1000);
    check('XP is 1025', (await xp()) === 1025, await xp());
  });

  scenario('data: an older account with no XP yet is still credited for its history', async () => {
    await boot({ seed: seed({ a: habit({ completedDates: [day(1), day(2)] }) }, { displayName: 'Old' }), initScript: slow });
    await sleep(1800);
    check('XP is 50', (await xp()) === 50, await xp());
  });

  const clickDelete = () => ev(`window.confirm = () => true; document.getElementById('delete-account-btn').click(); 0`);
  const state = async () => JSON.parse(await ev(`JSON.stringify({ h: Object.keys(__mockDB.habits || {}), u: Object.keys(__mockDB.users || {}), user: !!__mockAuth.currentUser })`));
  const habits = () => ({ a: habit(), trashed: habit({ deletedAt: Date.now() }), other: habit({ userId: 'someone-else' }) });

  scenario('delete account: removes every habit (including recently deleted), the profile and the login', async () => {
    await boot({ seed: seed(habits(), { xp: 900 }) });
    await sleep(800); await clickDelete(); await sleep(1200);
    const s = await state();
    check('only the other account keeps its habit', s.h.join() === 'other', s.h.join());
    check('the profile is not re-created', s.u.length === 0, s.u.join());
    check('signed out', !s.user);
    check('the button works for the next account', await ev(`!document.getElementById('delete-account-btn').disabled`));
    noExceptions();
  });

  scenario('delete account: an old sign-in is refused before anything is erased', async () => {
    await boot({ seed: seed(habits(), { xp: 900 }), initScript: 'window.__mockAuthAgeMs = 3600000;' });
    await sleep(800); await clickDelete(); await sleep(1200);
    const s = await state();
    check('habits are intact', s.h.length === 3, s.h.join());
    check('XP is intact', (await xp()) === 900, await xp());
    check('still signed in', s.user);
    check('says to sign in again', await ev(`/sign out and sign back in/i.test(document.body.innerText)`));
  });

  scenario('delete account: offline is refused before anything is erased', async () => {
    await boot({ seed: seed(habits(), { xp: 900 }) });
    await sleep(800);
    await ev(`Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); 0`);
    await clickDelete(); await sleep(1200);
    const s = await state();
    check('habits are intact', s.h.length === 3, s.h.join());
    check('profile is intact', s.u.length === 1);
  });

  scenario('delete account: if the last step fails it can be retried', async () => {
    await boot({ seed: seed(habits(), { xp: 900 }), initScript: 'window.__mockDeleteUserFails = true;' });
    await sleep(800); await clickDelete(); await sleep(1200);
    check('still signed in after the failure', (await state()).user);
    await ev(`__mockDeleteUserFails = false; 0`);
    await clickDelete(); await sleep(1200);
    const s = await state();
    check('a retry finishes the deletion', !s.user && s.u.length === 0 && s.h.join() === 'other', JSON.stringify(s));
  });
};
