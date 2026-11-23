// The "Daily reminders" switch must really switch reminders on and off for THIS device, and a signed-out
// device must stop receiving the previous person's reminders.
module.exports = (scenario, c) => {
  const { boot, ev, sleep, waitFor, signedIn, check, noExceptions } = c;
  const stub = (perm, token = 'tok-A') => `(() => { window.__perm = ${JSON.stringify(perm)}; window.__mockFcmToken = ${JSON.stringify(token)};
    Object.defineProperty(Notification, 'permission', { get() { return window.__perm; }, configurable: true });
    Notification.requestPermission = async () => { window.__perm = 'granted'; return 'granted'; }; })();`;
  const seed = (profile = {}, extra = {}) => signedIn({ ...extra, mock_fb_db: { habits: {}, users: { 'u-test': profile } } });
  const profile = async () => JSON.parse(await ev(`JSON.stringify(__mockDB.users['u-test'] || {})`));
  const flip = on => ev(`(() => { const t = document.getElementById('notif-toggle'); t.checked = ${on}; t.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const checked = () => ev(`document.getElementById('notif-toggle').checked`);

  scenario('reminders: an opted-in device saves its push token and the user\'s timezone', async () => {
    await boot({ seed: seed(), initScript: stub('granted'), tz: 'America/New_York' });
    await sleep(900);
    const p = await profile();
    check('token saved', p.fcmToken === 'tok-A', p.fcmToken);
    check('timezone saved', p.tz === 'America/New_York', p.tz);
    check('switch shows on', await checked());
    noExceptions();
  });

  scenario('reminders: switching off removes the token and stays off after a reload', async () => {
    await boot({ seed: seed(), initScript: stub('granted') });
    await sleep(900);
    await flip(false); await sleep(600);
    check('token removed', !('fcmToken' in await profile()), JSON.stringify(await profile()));
    await ev(`location.reload()`); await sleep(500); await waitFor(`!!window.__mockDB && !!document.getElementById('notif-toggle') && !document.getElementById('loading-screen')`, 20000); await sleep(1200);
    check('token not re-registered after reload', !('fcmToken' in await profile()));
    check('switch still shows off', !(await checked()));
  });

  scenario('reminders: switching back on registers the token again', async () => {
    await boot({ seed: seed({}, { habitly_reminders: 'off' }), initScript: stub('granted') });
    await sleep(900);
    check('starts without a token', !('fcmToken' in await profile()));
    await flip(true); await sleep(600);
    check('token saved', (await profile()).fcmToken === 'tok-A');
    await ev(`location.reload()`); await sleep(500); await waitFor(`!!window.__mockDB && !!document.getElementById('notif-toggle') && !document.getElementById('loading-screen')`, 20000); await sleep(1200);
    check('switch shows on after reload', await checked());
  });

  scenario('reminders: signing out removes this device\'s token', async () => {
    await boot({ seed: seed(), initScript: stub('granted') });
    await sleep(900);
    check('token saved first', (await profile()).fcmToken === 'tok-A');
    await ev(`document.getElementById('logout-btn').click()`); await sleep(900);
    check('token removed', !('fcmToken' in await profile()), JSON.stringify(await profile()));
    check('signed out', await ev(`!__mockAuth.currentUser`));
  });

  scenario('reminders: a device with reminders off leaves another device\'s token alone', async () => {
    await boot({ seed: seed({ fcmToken: 'tok-other-device' }, { habitly_reminders: 'off' }), initScript: stub('granted') });
    await sleep(900);
    await ev(`document.getElementById('logout-btn').click()`); await sleep(900);
    check('other device still registered', (await profile()).fcmToken === 'tok-other-device', (await profile()).fcmToken);
  });
};
