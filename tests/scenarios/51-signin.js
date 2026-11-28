// Getting in (roadmap batch 7): the redesigned sign-in card, sign-in by emailed link, and email verification.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const landing = async () => { await waitFor(`!document.getElementById('auth-screen').classList.contains('hidden')`); await sleep(300); };
  const inApp = () => waitFor(`!document.getElementById('app').classList.contains('hidden')`, 5000);
  const type = (id, value) => ev(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const click = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(400); };
  const toasts = () => ev(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`);
  const linkSeed = email => ({ habitly_link_email: JSON.stringify({ email, at: Date.now() }) });
  const openLink = async (code = 'good') => { await ev(`location.href = '/?apiKey=x&mode=signIn&oobCode=${code}&lang=en'`); await sleep(1500); };

  // ── 65: a redesigned sign-in card, with a link by email ──
  scenario('sign-in: one card with two clear modes', async () => {
    await boot(); await landing();
    const mode = () => ev(`[...document.querySelectorAll('#auth-mode [data-mode]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.mode).join()`);
    check('a new visitor starts on Create account', (await mode()) === 'signup');
    check('with one button for it, and no Sign in button competing', (await visible('#email-signup-btn')) && !(await visible('#email-signin-btn')) && (await trim('#email-signup-btn')) === 'Create account');
    check('the password field expects a new password, and Forgot password is not offered yet', (await ev(`document.getElementById('auth-password').autocomplete`)) === 'new-password' && !(await visible('#forgot-btn')));
    await click('#auth-mode [data-mode="signin"]');
    check('switching to Sign in swaps the button, the heading and the password hint', (await mode()) === 'signin' && (await visible('#email-signin-btn')) && !(await visible('#email-signup-btn')) && (await trim('#auth-heading')) === 'Sign in' && (await ev(`document.getElementById('auth-password').autocomplete`)) === 'current-password' && (await visible('#forgot-btn')));
    await click('#auth-mode [data-mode="signup"]');
    check('and back again', (await mode()) === 'signup' && /account|progress/i.test(await trim('#auth-heading')), await trim('#auth-heading'));
    check('both modes offer a link by email', (await visible('#email-link-btn')) && /link/i.test(await trim('#email-link-btn')));
    await type('auth-email', 'new@example.com'); await type('auth-password', 'secret1');
    await ev(`document.getElementById('email-auth-form').requestSubmit()`);
    check('Enter creates the account in Create account mode', await inApp());
    await boot({ seed: { habitly_returning: '1' } }); await landing();
    check('someone coming back starts on Sign in', (await mode()) === 'signin' && (await visible('#email-signin-btn')));
    await size(320, 640); await sleep(300);
    check('the card fits a 320px phone with thumb-sized controls', (await ev(`document.documentElement.scrollWidth <= innerWidth`)) && await ev(`[...document.querySelectorAll('#auth-card button')].filter(b => b.getClientRects().length && b.id !== 'pw-toggle').every(b => b.getBoundingClientRect().height >= 44)`));
    noExceptions();
  });

  scenario('sign-in: a link by email is sent, and says where it went', async () => {
    await boot(); await landing();
    await click('#email-link-btn');
    check('with no address typed, it asks for one and sends nothing', !(await ev(`(window.__mockEmails || []).length`)) && /email/i.test(await ev(`(document.querySelector('#auth-card .field-msg') || {}).textContent || ''`)), await toasts());
    await type('auth-email', 'ada@example.com');
    await click('#email-link-btn');
    const sent = JSON.parse(await ev(`JSON.stringify(window.__mockEmails || [])`));
    check('the link is sent to that address, to come back to this site and finish here', sent.length === 1 && sent[0].type === 'link' && sent[0].email === 'ada@example.com' && sent[0].settings.handleCodeInApp === true && /^http:\/\/localhost:\d+\/$|habit-tracker-demo-34c0a\.web\.app\/$/.test(sent[0].settings.url), JSON.stringify(sent));
    check('the card says to check that inbox', (await visible('#link-sent')) && (await trim('#link-sent-to')) === 'ada@example.com' && !(await visible('#email-auth-form')));
    check('the address is remembered on this device for when the link is opened', JSON.parse(await ev(`localStorage.getItem('habitly_link_email')`)).email === 'ada@example.com');
    check('Send again cannot be hammered', await ev(`document.getElementById('link-resend').disabled`));
    await click('#link-other');
    check('Use a different email goes back to the form', (await visible('#email-auth-form')) && !(await visible('#link-sent')));
    check('no password was needed or asked for', !(await ev(`(window.__mockEvents || []).some(e => /password/.test(JSON.stringify(e)))`)));
    noExceptions();
  });

  scenario('sign-in: opening the link signs you in, on this device or another', async () => {
    await boot({ seed: linkSeed('ada@example.com') }); await landing();
    await openLink();
    check('on the device that asked, the link signs in with no more typing', await inApp());
    check('the address bar is cleaned of the one-time code', !/oobCode|mode=signIn/.test(await ev(`location.href`)), await ev(`location.href`));
    check('and the remembered address is gone', (await ev(`localStorage.getItem('habitly_link_email')`)) === null);
    check('signed in as the address the link was sent to', (await ev(`JSON.parse(localStorage.getItem('mock_fb_user')).email`)) === 'ada@example.com');
    await boot(); await landing();
    await openLink();
    check('on another device it asks which address the link was sent to', (await visible('#link-confirm')) && !(await ev(`!document.getElementById('app').classList.contains('hidden')`)));
    await type('link-confirm-email', 'wrong@example.com'); await ev(`document.getElementById('link-confirm-form').requestSubmit()`); await sleep(600);
    check('the wrong address is refused, in words', /not the address/.test(await trim('#link-confirm')) && (await visible('#link-confirm')), await trim('#link-confirm'));
    await type('link-confirm-email', 'ada@example.com'); await ev(`document.getElementById('link-confirm-form').requestSubmit()`);
    check('the right one signs in', await inApp());
    noExceptions();
  });

  scenario('sign-in: a dead link, a link while signed in, and the provider switched off', async () => {
    await boot({ seed: linkSeed('ada@example.com') }); await landing();
    await openLink('expired');
    check('an expired or used link says so and leaves the normal card', /expired or was already used/.test(await toasts()) && (await visible('#email-auth-form')) && !(await visible('#link-confirm')), await toasts());
    check('and the code is cleaned from the address bar', !/oobCode/.test(await ev(`location.href`)));
    await boot({ seed: signedIn() }); await inApp();
    await openLink();
    check('opened while signed in, the link does not switch accounts', (await inApp()) && (await ev(`JSON.parse(localStorage.getItem('mock_fb_user')).email`)) === 'test@example.com' && /already signed in/i.test(await toasts()), await toasts());
    await boot({ initScript: 'window.__mockLinkOff = true;' }); await landing();
    await type('auth-email', 'ada@example.com'); await click('#email-link-btn');
    check('if the owner has not switched link sign-in on, the person is told plainly', /not switched on/.test(await toasts()) && !(await visible('#link-sent')), await toasts());
    check('the option is put away, and the password form is still there', !(await visible('#email-link-btn')) && (await visible('#email-auth-form')));
    await type('auth-password', 'secret1'); await ev(`document.getElementById('email-auth-form').requestSubmit()`);
    check('a password still works', await inApp());
    const privacy = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
    check('the privacy page says the address is kept on the device until the link is opened', /sign-in link/i.test(privacy) && /on (this|your) device/i.test(privacy));
    noExceptions();
  });
  // ── 66: email verification, with a friendly banner ───────
  const signUp = async email => { await type('auth-email', email); await type('auth-password', 'secret1'); await click('#auth-mode [data-mode="signup"]'); await ev(`document.getElementById('email-auth-form').requestSubmit()`); await inApp(); await sleep(500); };
  const mails = () => ev(`JSON.stringify((window.__mockEmails || []).map(m => m.type + ':' + m.email))`).then(JSON.parse);
  scenario('verify: a new password account is asked to confirm its email, without being blocked', async () => {
    await boot(); await landing();
    await signUp('new@example.com');
    check('a verification email goes to the new address', (await mails()).join() === 'verify:new@example.com', (await mails()).join());
    check('a slim banner says where it went', (await visible('#verify-bar')) && /new@example\.com/.test(await trim('#verify-bar')) && /confirm/i.test(await trim('#verify-bar')), await trim('#verify-bar'));
    check('the banner sits in the page, it does not cover it', await ev(`(() => { const s = getComputedStyle(document.getElementById('verify-bar')); return s.position !== 'fixed' && s.position !== 'absolute'; })()`));
    check('nothing is locked: the app works as usual', (await visible('#page-home')) && await ev(`!document.documentElement.classList.contains('dialog-open')`));
    await click('#verify-check');
    check('"I have confirmed" checks, and says so when it is not done yet', (await visible('#verify-bar')) && /not confirmed yet/i.test(await toasts()), await toasts());
    await click('#verify-resend');
    check('Send again sends another, then rests for a minute', (await mails()).length === 2 && await ev(`document.getElementById('verify-resend').disabled`), (await mails()).join());
    await ev(`window.__mockVerified = true`);
    await click('#verify-check');
    check('once the link has been opened, the banner goes with a thank-you', !(await visible('#verify-bar')) && /confirmed/i.test(await toasts()), await toasts());
    await ev(`location.reload()`); await sleep(1500); await inApp();
    check('and it stays gone', !(await visible('#verify-bar')));
    noExceptions();
  });

  scenario('verify: the banner clears itself, can be put away, and is never shown to verified accounts', async () => {
    await boot(); await landing();
    await signUp('new@example.com');
    await ev(`window.__mockVerified = true; document.dispatchEvent(new Event('visibilitychange'))`); await sleep(700);
    check('coming back to the tab after confirming clears it without a tap', !(await visible('#verify-bar')));
    await boot(); await landing();
    await signUp('other@example.com');
    await click('#verify-hide');
    check('it can be put away for this visit', !(await visible('#verify-bar')) && (await ev(`Object.keys(sessionStorage).some(k => k.startsWith('habitly_verify_hidden_'))`)));
    await boot(); await landing(); await ev(`sessionStorage.clear()`);
    await signUp('small@example.com');
    await size(320, 640); await sleep(400);
    check('on a 320px phone it fits, with thumb-sized buttons', (await ev(`document.documentElement.scrollWidth <= innerWidth`)) && await ev(`[...document.querySelectorAll('#verify-bar button')].every(b => b.getBoundingClientRect().height >= 44)`));
    await boot({ seed: signedIn() }); await inApp(); await sleep(400);
    check('a Google account never sees it', !(await visible('#verify-bar')));
    await boot({ seed: { habitly_link_email: JSON.stringify({ email: 'ada@example.com', at: Date.now() }) } }); await landing();
    await openLink(); await inApp(); await sleep(400);
    check('nor does someone who came in by an emailed link', !(await visible('#verify-bar')));
    noExceptions();
  });
};
