// Integrity regressions: local-timezone days, streak shield semantics, XP farming.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, sleep, signedIn, noExceptions } = c;
  const TZ = 'Africa/Lagos';

  // Local YYYY-MM-DD for `n` days from today in a given IANA timezone (computed in Node).
  const key = (n = 0, tz = TZ) => {
    const base = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const habitDoc = (name, dates) => ({ userId: 'u-test', name, category: 'reading', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 20 * 864e5).toISOString(), order: 1 });
  const db = (habits, user) => ({ mock_fb_db: { habits, ...(user ? { users: { 'u-test': user } } : {}) } });

  async function addAndTick(name = 'Read') {
    await ev(`document.getElementById('habit-input').value=${JSON.stringify(name)};document.getElementById('habit-category').value='reading';document.getElementById('habit-frequency').value='daily';document.getElementById('habit-form').requestSubmit()`);
    await waitFor(`document.querySelectorAll('#habits .habit-item').length===1`);
    await ev(`document.querySelector('#habits .habit-check').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    await waitFor(`document.querySelector('#habits .habit-check').checked === true`);
    await waitFor(`(Object.values(window.__mockDB.habits)[0].completedDates || []).length === 1`);   // the write lands ~300ms after the checkbox flips
  }

  // UTC+14 and UTC-11 can't BOTH share today's date with UTC, so at least one of these fails on a UTC-based "today".
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    scenario(`timezone: "today" is the user's local day (${tz})`, async () => {
      await boot({ seed: signedIn(), tz });
      await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
      await addAndTick();
      const stored = await ev(`Object.values(window.__mockDB.habits)[0].completedDates[0]`);
      const local = await ev(`new Date().toLocaleDateString('en-CA')`);
      check(`tick stored under local date ${local}`, stored === local, `stored ${stored}`);
      check('streak is 1 (not inflated)', await waitFor(`document.getElementById('greeting-streak').textContent === '1'`));
    });
  }

  scenario('shield: a brand-new user is NOT given a free 2-day streak or a burned shield', async () => {
    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await addAndTick();
    await sleep(800);
    check('streak is exactly 1', (await text('#greeting-streak')) === '1', await text('#greeting-streak'));
    check('shield still available', (await text('#greeting-shield-count')) === '1', await text('#greeting-shield-count'));
    const frozen = await ev(`JSON.stringify((window.__mockDB.users||{})['u-test']?.frozenDates||[])`);
    check('nothing frozen', frozen === '[]', frozen);
  });

  scenario('shield: protects a REAL streak that missed yesterday, and is consumed', async () => {
    await boot({ seed: { ...signedIn(), ...db({ h1: habitDoc('Read', [key(-2), key(-3), key(-4)]) }) } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    check('yesterday gets frozen', await waitFor(`JSON.stringify((window.__mockDB.users||{})['u-test']?.frozenDates||[]).includes(${JSON.stringify(key(-1))})`));
    check('streak preserved (4)', await waitFor(`document.getElementById('greeting-streak').textContent === '4'`));
    check('shield consumed', await waitFor(`document.getElementById('greeting-shield-count').textContent === '0'`));
  });

  scenario('shield: does not burn a shield when the streak was already broken', async () => {
    await boot({ seed: { ...signedIn(), ...db({ h1: habitDoc('Read', [key(-5), key(-6)]) }) } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await sleep(1200);
    check('shield untouched', (await text('#greeting-shield-count')) === '1', await text('#greeting-shield-count'));
    check('streak is 0', (await text('#greeting-streak')) === '0', await text('#greeting-streak'));
  });

  scenario('shield: recharges after a week (as the Profile page promises)', async () => {
    await boot({ seed: { ...signedIn(), ...db({ h1: habitDoc('Read', [key(0)]) }, { streakShields: 0, frozenDates: [], shieldUsedAt: Date.now() - 8 * 864e5 }) } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    check('shield recharged to 1', await waitFor(`document.getElementById('greeting-shield-count').textContent === '1'`));
    check('recharge persisted', await waitFor(`(window.__mockDB.users||{})['u-test']?.streakShields === 1`));
  });

  scenario('shield: does NOT recharge early', async () => {
    await boot({ seed: { ...signedIn(), ...db({ h1: habitDoc('Read', [key(0)]) }, { streakShields: 0, frozenDates: [], shieldUsedAt: Date.now() - 2 * 864e5 }) } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await sleep(1200);
    check('still 0 shields', (await text('#greeting-shield-count')) === '0', await text('#greeting-shield-count'));
  });

  scenario('xp: un-tick + re-tick cannot farm XP or the Daily Master bonus', async () => {
    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await addAndTick();
    check('tick + daily bonus = 125 XP', await waitFor(`(window.__mockDB.users||{})['u-test']?.xp === 125`, 8000), await ev(`(window.__mockDB.users||{})['u-test']?.xp`));
    await sleep(3600);                                                   // let the celebration cooldown pass
    await ev(`document.getElementById('all-done-overlay').classList.add('hidden')`);
    await ev(`document.querySelector('#habits .habit-check').click()`);  // un-tick (within the 1h window)
    check('un-tick refunds the 25 XP', await waitFor(`(window.__mockDB.users||{})['u-test']?.xp === 100`, 5000), await ev(`(window.__mockDB.users||{})['u-test']?.xp`));
    await ev(`document.querySelector('#habits .habit-check').click()`);  // re-tick
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    await sleep(2500);
    const xp = await ev(`(window.__mockDB.users||{})['u-test']?.xp`);
    check('final XP is 125, not 250', xp === 125, xp);
    noExceptions();
  });

  scenario('security: a habit named with HTML cannot inject markup (Recently Deleted)', async () => {
    await boot({ seed: { ...signedIn(), ...db({ h1: { ...habitDoc('<img src=x onerror=window.__pwned=1>', []), deletedAt: Date.now() - 60000 } }) } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`document.getElementById('open-recovery-btn').click()`);
    await sleep(600);
    check('no injected <img>', (await ev(`document.querySelectorAll('#deleted-habits-list img').length`)) === 0);
    check('payload did not run', (await ev(`window.__pwned === undefined`)) === true);
    check('name shown as text', /<img src=x/.test(await text('#deleted-habits-list .deleted-habit-name')));
  });
};
