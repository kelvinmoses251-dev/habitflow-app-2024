// Core regression scenarios: landing demo, demo -> account carry-over, and the signed-in happy path.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;

  scenario('landing: signed-out visitor can play the demo', async () => {
    await boot();
    check('hero is shown to new visitors', await visible('#landing-hero'));
    check('auth card invites visitors to create an account', (await text('#auth-heading')) === 'Create your account');
    await ev(`document.querySelector('.demo-habit').click()`);
    await sleep(400);
    check('streak lights up after first tick', (await text('#demo-streak-n')) === '1');
    check('auth copy reacts to progress', (await text('#auth-heading')) === 'Save your progress');
    noExceptions();
  });

  scenario('landing: returning users get the compact card (no hero)', async () => {
    await boot({ seed: { habitly_returning: '1' } });
    check('hero hidden', !(await visible('#landing-hero')));
    check('heading is "Sign in"', (await text('#auth-heading')) === 'Sign in');
  });

  scenario('demo carry-over: new account adopts demo habits + ticks, tour skipped', async () => {
    await boot();
    await ev(`document.querySelectorAll('.demo-habit')[0].click()`); await sleep(250);
    await ev(`document.querySelectorAll('.demo-habit')[1].click()`); await sleep(250);
    await ev(`document.getElementById('login-btn').click()`);
    check('app shell appears', await waitFor(`!document.getElementById('app').classList.contains('hidden')`));
    check('3 habits seeded', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 3`));
    check('2 of them are ticked', await waitFor(`document.querySelectorAll('#habits .habit-check:checked').length === 2`));
    check('tour was skipped', !(await visible('#onboarding')));
    check('XP seeded from carried ticks (50)', await waitFor(`document.getElementById('user-current-xp').textContent === '50'`));
    check('demo key cleared (no double seed)', (await ev(`localStorage.getItem('habitly_demo')`)) === null);
    const adds = await ev(`window.__mockWrites.filter(w=>w.op==='add').length`);
    check('exactly 3 habit docs written', adds === 3, adds);
    noExceptions();
  });

  scenario('signed-in: add, tick (confirm), stats, profile, sign out', async () => {
    await boot({ seed: signedIn() });
    check('app shell appears', await waitFor(`!document.getElementById('app').classList.contains('hidden')`));
    check('empty state visible', await waitFor(`!document.getElementById('empty-state').classList.contains('hidden')`));

    await ev(`document.getElementById('habit-input').value='Read 10 pages';
              document.getElementById('habit-category').value='reading';
              document.getElementById('habit-frequency').value='daily';
              document.getElementById('habit-form').requestSubmit()`);
    check('habit appears in list', await waitFor(`document.querySelectorAll('#habits .habit-item').length === 1`));

    await ev(`document.querySelector('#habits .habit-check').click()`);
    check('confirm modal opens', await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`));
    await ev(`document.getElementById('confirm-check-yes').click()`);
    check('habit is checked', await waitFor(`document.querySelector('#habits .habit-check').checked === true`));
    check('XP +25', await waitFor(`document.getElementById('user-current-xp').textContent === '25'`));
    check('streak is 1', await waitFor(`document.getElementById('greeting-streak').textContent === '1'`));

    await ev(`location.hash = '#stats'`);
    check('stats shows 1/1 today', await waitFor(`document.getElementById('stat-today').textContent === '1/1'`));
    await ev(`location.hash = '#profile'`);
    check('profile shows name', await waitFor(`document.getElementById('profile-name').textContent === 'Test User'`));

    await ev(`document.getElementById('logout-btn').click()`);
    check('signed out -> auth screen', await waitFor(`!document.getElementById('auth-screen').classList.contains('hidden')`));
    noExceptions();
  });
};
