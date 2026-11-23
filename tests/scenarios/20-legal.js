// Privacy policy and terms: the pages exist, say what the app really does, and are reachable before sign-up
// and from inside the app.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator})/u;
  const open = async (page, { width = 390, dark = false } = {}) => {
    await boot({ seed: dark ? { theme: 'dark' } : {} });                       // sets the origin, viewport and storage
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: (await ev('location.origin')) + '/' + page });
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('main.legal h1')`, 10000);
    await sleep(200);
  };
  const body = () => ev(`document.querySelector('main.legal').innerText`);
  const noSideScroll = () => ev(`document.documentElement.scrollWidth <= window.innerWidth`);

  scenario('legal: the privacy policy describes what the app actually collects and the controls it offers', async () => {
    await open('privacy.html');
    const t = await body();
    check('has a title', (await ev(`document.querySelector('main.legal h1').textContent`)) === 'Privacy policy');
    check('shows when it was last updated', /Last updated: \d{1,2} \w+ \d{4}/.test(t));
    for (const [what, re] of [
      ['email address', /email address/i], ['habits and notes', /habits[\s\S]*notes/i], ['profile picture', /profile picture/i],
      ['push token for reminders', /push token/i], ['timezone', /time ?zone/i], ['Google Analytics', /Google Analytics/i],
      ['Do Not Track is honoured', /Do Not Track/i], ['Firebase as the processor', /Firebase/i],
      ['how to delete the account', /Delete account/i], ['how to export data', /Export/i],
      ['no selling of data', /(do not|never) sell/i],
    ]) check(`mentions ${what}`, re.test(t));
    const mail = await ev(`(document.querySelector('main.legal a[href^="mailto:"]') || {}).href || ''`);
    check('gives a real contact address', /^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(mail) && !/example\.|CONTACT/i.test(mail), mail || 'none');
    check('links back to the app', await ev(`!!document.querySelector('a[href="/"]')`));
    check('links to the terms', await ev(`!!document.querySelector('a[href="/terms.html"]')`));
    noExceptions();
  });

  scenario('legal: the terms cover the basics in plain language', async () => {
    await open('terms.html');
    const t = await body();
    check('has a title', (await ev(`document.querySelector('main.legal h1').textContent`)) === 'Terms of use');
    for (const [what, re] of [['your content stays yours', /belongs? to you|remains yours|stays yours/i], ['no medical advice', /medical/i],
      ['provided as is', /as is/i], ['how to stop using it', /delete your account/i]]) check(`covers: ${what}`, re.test(t));
    check('links to the privacy policy', await ev(`!!document.querySelector('a[href="/privacy.html"]')`));
    noExceptions();
  });

  scenario('legal: pages fit a small phone, follow dark mode and use no emoji', async () => {
    for (const page of ['privacy.html', 'terms.html']) {
      await open(page, { width: 320 });
      check(`${page}: no horizontal scroll at 320px`, await noSideScroll());
      await open(page, { width: 1280, dark: true });
      const bg = await ev(`getComputedStyle(document.body).backgroundColor`);
      const lum = bg.match(/\d+/g).slice(0, 3).reduce((a, n) => a + +n, 0) / 3;
      check(`${page}: dark theme applies`, lum < 60, bg);
      check(`${page}: no emoji`, !EMOJI.test(fs.readFileSync(path.join(ROOT, page), 'utf8')));
    }
  });

  scenario('legal: both pages are linked from the sign-up card and from Profile', async () => {
    await boot({ seed: {} });
    for (const href of ['/privacy.html', '/terms.html']) {
      check(`sign-up card links to ${href}`, await ev(`(() => { const a = document.querySelector('#auth-card a[href="${href}"]'); return !!a && a.getClientRects().length > 0; })()`));
    }
    await boot({ seed: signedIn(), hash: '#profile' });
    await sleep(600);
    for (const href of ['/privacy.html', '/terms.html']) {
      check(`Profile links to ${href}`, await ev(`(() => { const a = document.querySelector('#page-profile a[href="${href}"], [data-page-id="profile"] a[href="${href}"], .profile-legal a[href="${href}"]'); return !!a && a.getClientRects().length > 0; })()`));
    }
    noExceptions();
  });
};
