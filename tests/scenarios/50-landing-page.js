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
  // ── 62: feature sections that demonstrate themselves ─────
  scenario('features: each section plays its small demonstration once, when scrolled to', async () => {
    await size(1280, 800);
    await boot({ mobile: false }); await landing();
    check('four feature sections, each with a heading, a sentence and a built demonstration', await ev(`(() => { const f = [...document.querySelectorAll('#features .feature')]; return f.length === 4 && f.every(x => x.querySelector('h3') && x.querySelector('p').textContent.trim().length > 40 && x.querySelector('.feature-demo')); })()`));
    check('the demonstrations are decoration: the words carry the meaning', await ev(`[...document.querySelectorAll('#features .feature-demo')].every(d => d.getAttribute('aria-hidden') === 'true')`));
    check('before scrolling, nothing below the fold has played', await ev(`[...document.querySelectorAll('#features .feature')].every(f => !f.classList.contains('is-in'))`));
    const ring = `getComputedStyle(document.querySelector('#features .f-ring-fg')).strokeDashoffset`;
    const before = await ev(ring);
    await into('#features .feature');
    check('scrolled to, the first one plays: the ring fills and the habit is ticked', (await ev(`document.querySelector('#features .feature').classList.contains('is-in')`)) && (await ev(ring)) !== before && parseFloat(await ev(ring)) < parseFloat(before), before + ' -> ' + await ev(ring));
    check('the others wait their turn', !(await ev(`document.querySelectorAll('#features .feature')[3].classList.contains('is-in')`)));
    await ev(`scrollTo(0, 0)`); await sleep(500);
    check('it plays once: scrolling away does not reset it', await ev(`document.querySelector('#features .feature').classList.contains('is-in')`));
    await into('#features .feature:nth-of-type(3)');
    check('the year grid is filled in', (await ev(`document.querySelectorAll('#features .f-heat i').length`)) >= 100 && await waitFor(`getComputedStyle(document.querySelector('#features .f-heat i:last-child')).opacity === '1'`, 4000));
    check('nothing loops for ever', await ev(`[...document.querySelectorAll('#features *')].every(e => getComputedStyle(e).animationIterationCount !== 'infinite')`));
    noExceptions();
  });

  scenario('features: with reduced motion everything is simply shown, and it fits a phone', async () => {
    await size(360, 700);
    await boot();
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await ev(`location.reload()`); await sleep(1200); await landing();
    check('every section is already in its final state, with no scrolling', await ev(`[...document.querySelectorAll('#features .feature')].every(f => f.classList.contains('is-in'))`));
    check('and nothing is animated', await ev(`[...document.querySelectorAll('#features .feature-demo *')].every(e => parseFloat(getComputedStyle(e).transitionDuration) === 0)`));
    await into('#features');
    check('nothing overflows on a phone', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    await send('Emulation.setEmulatedMedia', { features: [] });
    const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
    check('the hidden starting states apply only once the script has said it will reveal them', !/^\.feature(?!s)[^{]*\{[^}]*opacity: 0/m.test(css) && /\.js-reveal /.test(css));
    noExceptions();
  });
  // ── 63: how it works, pricing and questions ──────────────
  scenario('landing: how it works, an honest price and answers to common questions', async () => {
    await boot(); await landing();
    check('how it works is three numbered steps', await ev(`(() => { const l = document.querySelector('#how ol'); return !!l && l.children.length === 3 && [...l.children].every(li => li.querySelector('h3') && li.querySelector('p')); })()`));
    check('the price is stated plainly: free, no ads, no card', /Free/.test(await trim('#pricing .price')) && /no ads/i.test(await trim('#pricing')) && /no card/i.test(await trim('#pricing')), await trim('#pricing'));
    check('the price box leads to signing up', await ev(`(() => { const b = document.querySelector('#pricing [data-to-signup]'); return !!b && b.getBoundingClientRect().height >= 44; })()`));
    const more = await ev(`document.getElementById('landing-more').innerText`);
    check('nothing is invented: no testimonials, ratings, stars or user counts', !/testimonial|rated|\d[\d,.]* (users|people|downloads)|loved by|trusted by|★|out of 5/i.test(more));
    const qs = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#faq details')].map(d => ({ q: d.querySelector('summary').textContent.trim(), a: d.querySelector('.faq-a').textContent.replace(/\\s+/g, ' ').trim(), open: d.open, h: d.querySelector('summary').getBoundingClientRect().height })))`));
    check('six questions, closed to begin with, each a thumb-sized row', qs.length === 6 && qs.every(x => !x.open && x.h >= 44 && x.q.endsWith('?') && x.a.length > 40), JSON.stringify(qs.map(x => x.q)));
    await ev(`document.querySelector('#faq summary').click()`); await sleep(200);
    check('a question opens to its answer', await ev(`document.querySelector('#faq details').open && document.querySelector('#faq details .faq-a').getClientRects().length > 0`));
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => { try { return JSON.parse(m[1]); } catch (_) { return null; } });
    const faq = blocks.find(b => b && b['@type'] === 'FAQPage');
    check('the same questions and answers are given to search engines, word for word', !!faq && faq.mainEntity.length === 6 && faq.mainEntity.every((e, i) => e.name === qs[i].q && e.acceptedAnswer.text === qs[i].a), faq ? faq.mainEntity.map(e => e.name).join(' | ') : 'none');
    await ev(`document.querySelector('#pricing [data-to-signup]').click()`); await sleep(900);
    check('the price box button brings the sign-in card into view', await ev(`(() => { const r = document.getElementById('auth-card').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()`));
    await size(320, 640); await sleep(300); await into('#faq');
    check('nothing overflows at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    noExceptions();
  });
};
