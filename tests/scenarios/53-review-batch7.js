// Regressions from the independent review of roadmap batch 7.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/[ \t\n]+/g, ' ').trim();
  const landing = async () => { await waitFor(`!document.getElementById('auth-screen').classList.contains('hidden')`); await sleep(300); };
  const inApp = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`, 5000);
  const type = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(400); };
  const toasts = () => ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`);
  const enter = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); await sleep(500); };
  const openLink = async (code = 'good') => { await ev(`location.href = '/?apiKey=x&mode=signIn&oobCode=${code}&lang=en'`); await sleep(400); await waitFor(`document.readyState === 'complete' && (!document.getElementById('auth-screen').classList.contains('hidden') || !document.getElementById('app').classList.contains('hidden'))`, 10000); await sleep(900); };   // the page has loaded and decided what to show
  const mode = () => ev(`[...document.querySelectorAll('#auth-mode [data-mode]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.mode).join()`);

  scenario('review: a real Enter key on the sign-up form creates the account', async () => {
    await boot(); await landing();
    await type('auth-email', 'new@example.com'); await type('auth-password', 'secret1');
    await ev(`document.getElementById('auth-password').focus()`);
    await enter();
    check('Enter in Create account mode creates the account (it does not try to sign in)', (await inApp()) && await ev(`(window.__mockEvents || []).some(e => e.name === 'sign_up' && e.params.method === 'email')`), await toasts());
    await boot({ seed: { habitly_returning: '1' } }); await landing();
    await type('auth-email', 'back@example.com'); await type('auth-password', 'secret1');
    await ev(`document.getElementById('auth-password').focus()`);
    await enter();
    check('Enter in Sign in mode signs in', (await inApp()) && await ev(`(window.__mockEvents || []).some(e => e.name === 'login' && e.params.method === 'email')`));
    noExceptions();
  });

  scenario('review: the top bar\'s Sign in leads to Sign in, and the heading always matches the mode', async () => {
    await boot(); await landing();
    await click('#landing-signin'); await sleep(500);
    check('"Sign in" in the top bar switches the card to Sign in', (await mode()) === 'signin' && (await visible('#email-signin-btn')) && (await trim('#auth-heading')) === 'Sign in');
    check('and that button looks like the main action', await ev(`getComputedStyle(document.getElementById('email-signin-btn')).backgroundColor === (() => { const d = document.createElement('i'); d.style.color = 'var(--primary)'; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; })()`));
    await ev(`document.querySelectorAll('#demo-list .demo-habit')[0].click()`); await sleep(400);
    check('ticking a demo habit does not turn a Sign in card into "Save your progress"', (await trim('#auth-heading')) === 'Sign in', await trim('#auth-heading'));
    await click('#auth-mode [data-mode="signup"]');
    check('back on Create account, the heading speaks of the progress to save', /Save your progress/.test(await trim('#auth-heading')), await trim('#auth-heading'));
    check('the line under it no longer says "Sign in below"', !/below/.test(await trim('#auth-sub')), await trim('#auth-sub'));
    await boot({ seed: { habitly_returning: '1' } }); await landing();
    await click('#auth-mode [data-mode="signup"]');
    check('someone coming back who chooses Create account gets a Create account heading', /Create your account/.test(await trim('#auth-heading')), await trim('#auth-heading'));
    noExceptions();
  });

  scenario('review: the one-time code leaves the address at once, and a bad connection does not waste the link', async () => {
    await boot(); await landing();
    await openLink();
    check('on another device the code is out of the address bar while the address is still being asked for', (await visible('#link-confirm')) && !/oobCode|apiKey|mode=signIn/.test(await ev(`location.href`)), await ev(`location.href`));
    check('focus is in the panel that appeared', await ev(`!!document.activeElement.closest('#link-confirm')`));
    await type('link-confirm-email', 'ada@example.com'); await ev(`document.getElementById('link-confirm-form').requestSubmit()`);
    check('and the link still works from there', await inApp());
    await boot({ seed: { habitly_link_email: JSON.stringify({ email: 'ada@example.com', at: Date.now() }) }, initScript: `window.__mockLinkFails = 'auth/network-request-failed';` }); await landing();
    await openLink();
    check('a failed connection says so', /offline/i.test(await toasts()), await toasts());
    check('and keeps the link and the address ready to try again', (await visible('#link-confirm')) && (await ev(`document.getElementById('link-confirm-email').value`)) === 'ada@example.com');
    await ev(`window.__mockLinkFails = null; document.getElementById('link-confirm-form').requestSubmit()`);
    check('trying again signs in', await inApp());
    noExceptions();
  });

  scenario('review: an older password account is not told an email was sent when none was', async () => {
    await boot({ seed: { habitly_returning: '1' } }); await landing();
    await type('auth-email', 'unverified@example.com'); await type('auth-password', 'secret1');
    await ev(`document.getElementById('email-auth-form').requestSubmit()`); await inApp(); await sleep(500);
    check('the banner offers to send a link, and does not claim one was sent', (await visible('#verify-bar')) && /can send/i.test(await trim('#verify-bar')) && !/We sent/.test(await trim('#verify-bar')) && (await trim('#verify-resend')) === 'Send the link', await trim('#verify-bar'));
    check('nothing has been emailed yet', !(await ev(`(window.__mockEmails || []).length`)));
    await click('#verify-resend');
    check('asking sends it, and the banner then says where it went', (await ev(`(window.__mockEmails || []).length`)) === 1 && /We sent a link to/.test(await trim('#verify-bar')) && (await trim('#verify-resend')) === 'Send again', await trim('#verify-bar'));
    noExceptions();
  });

  scenario('review: a remembered link address does not linger, and the privacy page says what happens', async () => {
    await boot({ seed: { habitly_link_email: JSON.stringify({ email: 'old@example.com', at: Date.now() - 26 * 3600 * 1000 }) } }); await landing();
    check('an address remembered more than a day ago is removed when the app is next opened', (await ev(`localStorage.getItem('habitly_link_email')`)) === null);
    await boot({ seed: { habitly_link_email: JSON.stringify({ email: 'ada@example.com', at: Date.now() }), habitly_returning: '1' } }); await landing();
    check('a fresh one is kept while the link is awaited', (await ev(`localStorage.getItem('habitly_link_email')`)) !== null);
    await type('auth-email', 'ada@example.com'); await type('auth-password', 'secret1');
    await ev(`document.getElementById('email-auth-form').requestSubmit()`); await inApp(); await sleep(400);
    check('and removed once the person has signed in another way', (await ev(`localStorage.getItem('habitly_link_email')`)) === null);
    const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
    check('the privacy page says when it is removed, and carries a new date', /sign in another way/.test(privacy) && /Last updated: 28 November 2026/.test(privacy));
    const sw = fs.readFileSync(path.join(ROOT, 'firebase-messaging-sw.js'), 'utf8');
    check('the offline cache does not fetch the landing pictures in advance', /shot-/.test(sw) && /LAZY|lazy/.test(sw));
    noExceptions();
  });

  scenario('review: the goal picker keeps its order, waits for the server, and forgets on sign-out', async () => {
    await boot({ seed: signedIn({ mock_fb_db: { habits: {}, users: { 'u-test': { xp: 0 } } } }) }); await inApp();
    await waitFor(`!!document.querySelector('#goal-chips [data-goal]')`, 5000); await sleep(4000);
    await click('#goal-chips [data-goal="Fitness"]');
    const want = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#goal-list .goal-name')].map(x => x.textContent.trim()))`));
    await click('#goal-add'); await sleep(700);
    const made = JSON.parse(await ev(`JSON.stringify(Object.values(__mockDB.habits).sort((a, b) => a.order - b.order).map(h => [h.name, h.order]))`));
    check('the habits are added in the order they were suggested, each with its own place', made.map(m => m[0]).join('|') === want.join('|') && new Set(made.map(m => m[1])).size === made.length, JSON.stringify(made));
    await boot({ seed: signedIn({ mock_fb_db: { habits: {}, users: { 'u-test': { xp: 0 } } } }), initScript: 'window.__mockCacheFirst = true;' }); await inApp();
    await waitFor(`!!document.querySelector('#goal-chips [data-goal]')`, 3000);
    await ev(`document.querySelector('#goal-chips [data-goal="Fitness"]').click()`); await sleep(150);
    await ev(`document.getElementById('goal-add').click()`); await sleep(300);
    check('while only this device\'s copy has answered, nothing is added (it may be out of date)', (await ev(`Object.keys(__mockDB.habits).length`)) === 0 && /moment/i.test(await toasts()), await toasts());
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    check('the picks are forgotten with the rest of the account on sign-out', /function resetUserState\(\) \{[\s\S]{0,3000}goalsPicked\.clear\(\)/.test(app));
    noExceptions();
  });
};
