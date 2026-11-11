// Retention: streak-at-risk nudge, contextual reminder ask, theme, sound & vibration prefs.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, visible, sleep, signedIn, noExceptions } = c;

  // Real wall-clock hour in a timezone, so we can test "evening" without faking time.
  const ZONES = ['Pacific/Kiritimati', 'Pacific/Auckland', 'Australia/Sydney', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/Moscow',
    'Europe/Berlin', 'Europe/London', 'Africa/Lagos', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Pacific/Honolulu', 'Pacific/Pago_Pago'];
  const hourIn = tz => +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date());
  const pickZone = (lo, hi) => ZONES.find(z => hourIn(z) >= lo && hourIn(z) <= hi);
  const key = (n, tz) => {
    const d = new Date(new Date().toLocaleDateString('en-CA', { timeZone: tz }) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const habit = (name, dates) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 9 * 864e5).toISOString(), order: 1 });
  const withHabits = (habits, extra = {}) => ({ ...signedIn(), mock_fb_db: { habits }, ...extra });
  const ready = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`);
  async function tickFirst() {
    await ev(`document.querySelector('#habits .habit-check:not(:checked)').click()`);
    await waitFor(`!document.getElementById('confirm-check-modal').classList.contains('hidden')`);
    await ev(`document.getElementById('confirm-check-yes').click()`);
    await waitFor(`document.querySelectorAll('#habits .habit-check:checked').length >= 1`);
  }

  // ── Streak at risk ──
  const evening = pickZone(17, 22), morning = pickZone(6, 11);

  scenario('streak-at-risk: evening + live streak + nothing ticked => countdown banner', async () => {
    if (!evening) return check('an evening timezone exists right now', false);
    await boot({ tz: evening, seed: withHabits({ h1: habit('Evening Run', [key(-1, evening), key(-2, evening), key(-3, evening)]) }) });
    await ready();
    check('banner visible', await waitFor(`!document.getElementById('streak-risk').classList.contains('hidden')`));
    const title = await text('#risk-title');
    check('names the streak and the habit', /3-day streak/.test(title) && /Evening Run/.test(title), title);
    check('shows time left', /ends in (\d+h \d+m|\d+m)/.test(title), title);
    check('mentions the shield', /shield/i.test(await text('#risk-sub')));
    check('reads as a single tappable control', (await ev(`document.getElementById('streak-risk').tagName`)) === 'BUTTON');
    await ev(`document.getElementById('streak-risk').click()`);
    check('tapping it nudges that habit', await waitFor(`!!document.querySelector('#habits .habit-check.nudge')`));
    noExceptions();
  });

  scenario('streak-at-risk: hidden in the morning', async () => {
    if (!morning) return check('a morning timezone exists right now', false);
    await boot({ tz: morning, seed: withHabits({ h1: habit('Run', [key(-1, morning), key(-2, morning)]) }) });
    await ready(); await sleep(500);
    check('banner hidden', !(await visible('#streak-risk')));
  });

  scenario('streak-at-risk: hidden once the habit is done today', async () => {
    if (!evening) return check('an evening timezone exists right now', false);
    await boot({ tz: evening, seed: withHabits({ h1: habit('Run', [key(0, evening), key(-1, evening), key(-2, evening)]) }) });
    await ready(); await sleep(500);
    check('banner hidden', !(await visible('#streak-risk')));
  });

  scenario('streak-at-risk: hidden when there is no live streak', async () => {
    if (!evening) return check('an evening timezone exists right now', false);
    await boot({ tz: evening, seed: withHabits({ h1: habit('Run', [key(-6, evening)]) }) });
    await ready(); await sleep(500);
    check('banner hidden', !(await visible('#streak-risk')));
  });

  // ── Reminders asked in context ──
  const notifStub = perm => `(()=>{ window.__perm='${perm}'; window.__permCalls=0;
    Object.defineProperty(Notification,'permission',{get(){return window.__perm},configurable:true});
    Notification.requestPermission = async () => { window.__permCalls++; window.__perm='granted'; return 'granted'; }; })();`;
  const todo = () => withHabits({ h1: habit('Read', []) });

  scenario('reminders: NOT requested at login; asked after the first completed habit; "Remind me" prompts once', async () => {
    await boot({ seed: todo(), initScript: notifStub('default') });
    await ready(); await sleep(600);
    check('no permission prompt at login', (await ev(`window.__permCalls`)) === 0);
    check('ask card is not showing yet', !(await visible('#notif-ask')));
    await tickFirst();
    check('ask card appears after completing a habit', await waitFor(`!document.getElementById('notif-ask').classList.contains('hidden')`, 6000));
    await ev(`document.getElementById('notif-ask-yes').click()`);
    check('browser prompt fired exactly once', await waitFor(`window.__permCalls === 1`));
    check('card is dismissed', !(await visible('#notif-ask')));
    noExceptions();
  });

  scenario('reminders: "Not now" never prompts and is not repeated within a week', async () => {
    await boot({ seed: todo(), initScript: notifStub('default') });
    await ready();
    await tickFirst();
    await waitFor(`!document.getElementById('notif-ask').classList.contains('hidden')`, 6000);
    await ev(`document.getElementById('notif-ask-no').click()`);
    check('no prompt', (await ev(`window.__permCalls`)) === 0);
    check('remembered', (await ev(`+localStorage.getItem('habitly_notif_asked') > 0`)) === true);
    // simulate a reload within the week
    await boot({ seed: { ...todo(), habitly_notif_asked: String(Date.now()) }, initScript: notifStub('default') });
    await ready();
    await tickFirst(); await sleep(2600);
    check('not asked again', !(await visible('#notif-ask')));
  });

  scenario('reminders: already-granted users are not nagged', async () => {
    await boot({ seed: todo(), initScript: notifStub('granted') });
    await ready();
    await tickFirst(); await sleep(2600);
    check('no ask card', !(await visible('#notif-ask')));
  });

  // ── Theme ──
  scenario('theme: follows the system when nothing is saved, before first paint', async () => {
    await boot({ seed: signedIn(), colorScheme: 'dark' });
    await ready();
    check('<html> is dark', (await ev(`document.documentElement.getAttribute('data-theme')`)) === 'dark');
    check('<body> is dark', (await ev(`document.body.getAttribute('data-theme')`)) === 'dark');
    check('Settings toggle reflects it', (await ev(`document.getElementById('dark-mode-toggle').checked`)) === true);
  });

  scenario('theme: an explicit light choice beats a dark system', async () => {
    await boot({ seed: signedIn({ theme: 'light' }), colorScheme: 'dark' });
    await ready();
    check('not dark', (await ev(`document.documentElement.getAttribute('data-theme')`)) === null && (await ev(`document.body.getAttribute('data-theme')`)) === null);
    await ev(`document.getElementById('dark-mode-toggle').click()`);
    check('toggle flips to dark and saves', (await ev(`localStorage.getItem('theme')`)) === 'dark' && (await ev(`document.body.getAttribute('data-theme')`)) === 'dark');
  });

  // ── Sound & vibration ──
  const counters = `(()=>{ window.__vib=0; window.__ac=0; navigator.vibrate=()=>{window.__vib++; return true;};
    const A=window.AudioContext; if(A){ window.AudioContext=function(){ window.__ac++; return new A(...arguments); }; window.AudioContext.prototype=A.prototype; } })();`;

  scenario('prefs: vibration is on by default, sound is opt-in', async () => {
    await boot({ seed: todo(), initScript: counters });
    await ready();
    check('sound toggle starts off', (await ev(`document.getElementById('sound-toggle').checked`)) === false);
    await tickFirst(); await sleep(400);
    check('vibrated', (await ev(`window.__vib`)) > 0);
    check('no audio unless the user opts in', (await ev(`window.__ac`)) === 0, await ev(`window.__ac`));
  });

  scenario('prefs: sound plays once the user turns it on', async () => {
    await boot({ seed: { ...todo(), habitly_sound: 'on' }, initScript: counters });
    await ready();
    check('toggle reflects the saved choice', (await ev(`document.getElementById('sound-toggle').checked`)) === true);
    await tickFirst(); await sleep(400);
    check('audio used', (await ev(`window.__ac`)) > 0);
  });

  scenario('prefs: turning sound and vibration off silences everything', async () => {
    await boot({ seed: { ...todo(), habitly_sound: 'off', habitly_haptics: 'off' }, initScript: counters });
    await ready();
    check('toggles show off', (await ev(`document.getElementById('sound-toggle').checked`)) === false && (await ev(`document.getElementById('haptics-toggle').checked`)) === false);
    await tickFirst(); await sleep(400);
    check('no vibration', (await ev(`window.__vib`)) === 0, await ev(`window.__vib`));
    check('no audio context created', (await ev(`window.__ac`)) === 0, await ev(`window.__ac`));
  });
};
