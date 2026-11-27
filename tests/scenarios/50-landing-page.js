// The landing page below the demo (roadmap batch 7): real pictures, self-demonstrating features, how it works,
// pricing, questions and the footer.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  const landing = async () => { await waitFor(`!document.getElementById('auth-screen').classList.contains('hidden')`); await sleep(300); };
  const into = async sel => { await ev(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`); await sleep(900); };

  // ── 61: real product pictures in device frames ───────────
  scenario('landing: real pictures of the app, in device frames', async () => {
    await size(1280, 900);
    await boot({ mobile: false }); await landing();
    check('there is a showcase below the demo', await ev(`!!document.getElementById('landing-more') && !!document.querySelector('#showcase .device')`));
    const imgs = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#showcase img')].map(i => ({ src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height'), lazy: i.loading, alt: i.alt, cls: i.className })))`));
    check('three screens, each in a light and a dark version', imgs.length === 6 && imgs.filter(i => /shot-light/.test(i.cls)).length === 3 && imgs.filter(i => /shot-dark/.test(i.cls)).length === 3, JSON.stringify(imgs.map(i => i.src)));
    check('every picture is a file in the project, small enough to load fast', imgs.every(i => fs.existsSync(path.join(ROOT, i.src)) && fs.statSync(path.join(ROOT, i.src)).size < 150000), imgs.map(i => i.src).join(' '));
    check('each has its size set (no jump when it loads), loads lazily and is described', imgs.every(i => Number(i.w) > 0 && Number(i.h) > 0 && i.lazy === 'lazy' && i.alt.length > 20));
    await into('#showcase');
    check('in light theme the light pictures show and load, the dark ones do not', (await waitFor(`[...document.querySelectorAll('#showcase .shot-light')].every(i => i.getClientRects().length && i.complete && i.naturalWidth > 0)`, 8000)) && await ev(`[...document.querySelectorAll('#showcase .shot-dark')].every(i => !i.getClientRects().length)`));
    check('the size set on each picture matches the real file', await ev(`[...document.querySelectorAll('#showcase .shot-light')].every(i => Math.abs(i.naturalWidth / i.naturalHeight - i.width / i.height) < 0.01)`));
    check('phones and a browser window are drawn as frames, each with a caption', (await ev(`document.querySelectorAll('#showcase .device-phone').length`)) === 2 && (await ev(`document.querySelectorAll('#showcase .device-browser').length`)) === 1 && (await ev(`[...document.querySelectorAll('#showcase figcaption')].every(f => f.textContent.trim().length > 3)`)));
    await ev(`document.documentElement.setAttribute('data-theme', 'dark'); document.body.setAttribute('data-theme', 'dark')`); await sleep(900);
    check('in dark theme the dark pictures take over', await ev(`[...document.querySelectorAll('#showcase .shot-dark')].every(i => i.getClientRects().length) && [...document.querySelectorAll('#showcase .shot-light')].every(i => !i.getClientRects().length)`));
    const staged = require('child_process').execSync('node tools/deploy.js --dry', { cwd: ROOT }).toString();
    check('the pictures are published with the site', imgs.every(i => staged.includes(i.src)));
    noExceptions();
  });

  scenario('landing: the showcase fits a small phone and is not shown to someone coming back', async () => {
    await size(320, 640);
    await boot(); await landing(); await into('#showcase');
    check('nothing overflows at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    check('the frames stay inside the page', await ev(`[...document.querySelectorAll('#showcase .device')].every(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })`));
    await boot({ seed: { habitly_returning: '1' } }); await landing();
    check('a returning visitor sees only the sign-in card', !(await visible('#landing-more')) && (await visible('#auth-card')));
    noExceptions();
  });
};
