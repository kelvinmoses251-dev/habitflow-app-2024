// Auth form: recovery, human error messages, password-manager friendliness.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, sleep, noExceptions } = c;
  const fill = (email, pw = 'secret123') => ev(`(()=>{document.getElementById('auth-email').value=${JSON.stringify(email)};document.getElementById('auth-password').value=${JSON.stringify(pw)};})()`);
  const toastText = () => ev(`document.getElementById('toast-container').textContent`);

  scenario('auth: forgot password asks for an email first, then sends a reset link', async () => {
    await boot({ seed: { habitly_returning: '1' } });
    await ev(`document.getElementById('forgot-btn').click()`);
    check('asks for an email when empty', await waitFor(`document.getElementById('toast-container').textContent.includes('Type your email above')`));
    check('nothing was sent', (await ev(`(window.__mockResets||[]).length`)) === 0);

    await fill('me@example.com');
    await ev(`document.getElementById('forgot-btn').click()`);
    check('reset email requested', await waitFor(`(window.__mockResets||[]).includes('me@example.com')`));
    check('confirmation toast shown (no account enumeration)', await waitFor(`document.getElementById('toast-container').textContent.includes('reset link is on its way')`));
    noExceptions();
  });

  scenario('auth: failures read like a human wrote them', async () => {
    await boot({ seed: { habitly_returning: '1' } });
    await fill('wrong@example.com');
    await ev(`document.getElementById('email-auth-form').requestSubmit()`);
    check('bad sign-in suggests Sign Up', await waitFor(`document.getElementById('toast-container').textContent.includes('New here? Tap Sign Up')`));
    check('raw Firebase text is not shown', !/Firebase: Error/.test(await toastText()));

    await ev(`document.getElementById('toast-container').textContent=''`);
    await fill('taken@example.com');
    await ev(`document.getElementById('email-signup-btn').click()`);
    check('duplicate sign-up points to Sign In / reset', await waitFor(`document.getElementById('toast-container').textContent.includes('already has an account')`));
  });

  scenario('auth: show/hide password and autofill hints', async () => {
    await boot({ seed: { habitly_returning: '1' } });
    check('email autocomplete=email', (await ev(`document.getElementById('auth-email').autocomplete`)) === 'email');
    check('password autocomplete set', (await ev(`document.getElementById('auth-password').autocomplete`)) === 'current-password');
    check('password hidden by default', (await ev(`document.getElementById('auth-password').type`)) === 'password');
    await ev(`document.getElementById('pw-toggle').click()`);
    check('toggle reveals password', (await ev(`document.getElementById('auth-password').type`)) === 'text');
    check('toggle label updates', (await text('#pw-toggle')) === 'Hide');
    await ev(`document.getElementById('pw-toggle').click()`);
    check('toggle hides it again', (await ev(`document.getElementById('auth-password').type`)) === 'password');
  });
};
