// Visual foundation (roadmap batch 1): tokens, depth, colour, icons, fonts, controls, loading.
const fs = require('fs'), path = require('path');
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const ROOT = path.resolve(__dirname, '..', '..');
  const css = () => fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const rules = () => css().split(/\/\* ── Base/)[1];          // everything after the token blocks
  const lum = col => { const [r, g, b] = col.match(/[\d.]+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

  scenario('foundation: the stylesheet uses tokens, not one-off values', async () => {
    const body = rules();
    const sizes = [...body.matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^(var\(|clamp\(|inherit|1em|100%)/.test(v));
    check('every font size is a token', sizes.length === 0, [...new Set(sizes)].slice(0, 6).join(' '));
    const radii = [...body.matchAll(/border-radius:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => /\d+px/.test(v) && !/^var\(/.test(v));
    check('every radius is a token', radii.length === 0, [...new Set(radii)].slice(0, 6).join(' '));
    const hex = [...body.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map(m => m[0]);
    check('no colour is written outside the token blocks', hex.length === 0, [...new Set(hex)].slice(0, 6).join(' '));
  });

  scenario('foundation: three elevation levels and nothing else', async () => {
    const shadows = [...rules().matchAll(/box-shadow:\s*([^;}]+)/g)].map(m => m[1].trim())
      .filter(v => !/^(none|var\(--elev-[123]\)|0 0 0 [\d.]+(px|vmax) var\()/.test(v));          // an elevation token, or a zero-blur ring
    check('every shadow is an elevation token or a ring', shadows.length === 0, shadows.slice(0, 4).join(' | '));
    check('the old shadow names are gone', !/--sh-(sm|md|card|lg)/.test(css()));
    await boot({ seed: signedIn() });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    check('cards sit on the first level', (await ev(`getComputedStyle(document.querySelector('.card')).boxShadow`)) !== 'none');
  });

  scenario('foundation: colour ramps drive both themes, with readable contrast', async () => {
    const root = css().split(/\/\* ── Base/)[0];
    check('neutral ramp has at least 12 steps', (root.match(/--n-\d+:/g) || []).length >= 12);
    check('accent ramp has 10 steps', (root.match(/--a-\d+:/g) || []).length >= 10);
    check('the brand colour is unchanged', /--a-600:\s*#4A3AB8/i.test(root));
    for (const theme of ['light', 'dark']) {
      await boot({ seed: { ...signedIn(), ...(theme === 'dark' ? { theme: 'dark' } : {}) } });
      await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
      const v = JSON.parse(await ev(`JSON.stringify((() => { const g = n => { const d = document.createElement('i'); d.style.color = 'var(' + n + ')'; document.body.appendChild(d); const col = getComputedStyle(d).color; d.remove(); return col; };
        return { bg: g('--bg'), surface: g('--surface'), s3: g('--surface-3'), text: g('--text'), text2: g('--text-2'), muted: g('--muted'), primary: g('--primary'), on: g('--on-primary') }; })())`));
      check(`${theme}: text on surface is at least 7:1`, ratio(v.text, v.surface) >= 7, ratio(v.text, v.surface).toFixed(2));
      check(`${theme}: secondary text is at least 4.5:1`, ratio(v.text2, v.surface) >= 4.5, ratio(v.text2, v.surface).toFixed(2));
      check(`${theme}: muted text is at least 4.5:1 on the page`, ratio(v.muted, v.bg) >= 4.5, ratio(v.muted, v.bg).toFixed(2));
      check(`${theme}: button text is at least 4.5:1`, ratio(v.on, v.primary) >= 4.5, ratio(v.on, v.primary).toFixed(2));
      if (theme === 'dark') {
        check('dark: raised surfaces are lighter than the page', lum(v.s3) > lum(v.surface) && lum(v.surface) > lum(v.bg), `${v.bg} ${v.surface} ${v.s3}`);
        await ev(`document.querySelector('.habit-check') ? 0 : 0; document.getElementById('confirm-export-modal').classList.remove('hidden')`);
        check('dark: a dialog sits on the raised surface', (await ev(`getComputedStyle(document.querySelector('#confirm-export-modal .dialog')).backgroundColor`)) === v.s3);
      }
    }
  });

  const CAT_KEYS = ['health', 'mind', 'social', 'growth', 'productive', 'nutrition', 'fitness', 'reading', 'saving', 'relaxation', 'project'];
  scenario('foundation: category icons come from the one icon set', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    for (const k of CAT_KEYS) check(`sprite has i-cat-${k}`, html.includes(`id="i-cat-${k}"`));
    check('no hand-written icon strings left in app.js', !/stroke-width="2"/.test(js));
    const habits = Object.fromEntries(CAT_KEYS.map((k, i) => ['h' + i, { userId: 'u-test', name: 'Habit ' + k, category: k, frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: i }]));
    for (const theme of ['light', 'dark']) {
      await boot({ seed: { ...signedIn(), ...(theme === 'dark' ? { theme: 'dark' } : {}), mock_fb_db: { habits, users: {} } } });
      await waitFor(`document.querySelectorAll('.habit-item').length === 11`);
      if (theme === 'light') {
        check('each row draws its category from the sprite', await ev(`${JSON.stringify(CAT_KEYS)}.every((k, i) => !!document.querySelector('.habit-item[data-id="h' + i + '"] .cat-ico use[href="#i-cat-' + k + '"]'))`));
        check('category icons use the shared 1.75 stroke', (await ev(`getComputedStyle(document.querySelector('.habit-item .cat-ico svg')).strokeWidth`)) === '1.75px');
        check('row action icons come from the sprite too', await ev(`['clock', 'trash'].every(n => !!document.querySelector('.habit-item .btn-icon use[href="#i-' + n + '"]'))`));
      }
      const cols = JSON.parse(await ev(`JSON.stringify({ bg: getComputedStyle(document.querySelector('#habits').closest('.card')).backgroundColor, icons: [...document.querySelectorAll('.habit-item .cat-ico')].map(e => getComputedStyle(e).color) })`));
      const worst = Math.min(...cols.icons.map(col => ratio(col, cols.bg)));
      check(`${theme}: every category colour is at least 3:1 against its card`, worst >= 3, worst.toFixed(2));
    }
    noExceptions();
  });

  scenario('foundation: fonts are served from the site itself', async () => {
    for (const f of ['index.html', 'privacy.html', 'terms.html'])
      check(`${f} makes no Google Fonts request`, !/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    check('the service worker does not fetch Google Fonts either', !/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(path.join(ROOT, 'firebase-messaging-sw.js'), 'utf8')));
    await boot();
    await ev(`document.fonts.ready.then(() => 1)`); await sleep(300);
    check('Inter is loaded', await ev(`document.fonts.check('500 16px Inter')`));
    check('the display serif is loaded', await ev(`document.fonts.check('italic 40px "Instrument Serif"')`));
    const files = JSON.parse(await ev(`JSON.stringify(performance.getEntriesByType('resource').filter(r => /woff2/.test(r.name)).map(r => r.name))`));
    check('font files were fetched', files.length >= 2, files.length);
    check('every font file came from this origin', files.every(f => f.startsWith('http://localhost') || f.includes('habit-tracker-demo-34c0a.web.app')), files.find(f => /gstatic|googleapis/.test(f)) || '');
    check('the privacy policy no longer lists Google Fonts', !/Google Fonts/.test(fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8')));
    const { execSync } = require('child_process');
    const staged = execSync('node tools/deploy.js --dry', { cwd: ROOT }).toString();
    check('the deploy publishes the font files', (staged.match(/fonts\/[\w-]+\.woff2/g) || []).length >= 3, (staged.match(/fonts\/[\w-]+\.woff2/g) || []).join(' '));
    noExceptions();
  });

  scenario('foundation: text still renders and fits when the fonts cannot load', async () => {
    await send('Network.setBlockedURLs', { urls: ['*.woff2'] });
    try {
      await boot();
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
      await sleep(500);
      check('headline is visible', await visible('.landing-title'));
      check('headline falls back to a serif', /Georgia|Times|serif/i.test(await ev(`getComputedStyle(document.querySelector('.landing-title')).fontFamily`)));
      check('no horizontal scroll at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
    } finally { await send('Network.setBlockedURLs', { urls: [] }); }
  });

  scenario('foundation: buttons and fields have designed states', async () => {
    await boot({ seed: { habitly_returning: '1' } });
    const h = sel => ev(`document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().height`);
    check('primary button is at least 44px tall on a phone', (await h('#email-signin-btn')) >= 44, await h('#email-signin-btn'));
    check('fields are at least 44px tall on a phone', (await h('#auth-email')) >= 44, await h('#auth-email'));
    check('focus ring is a 2px outline in the accent colour', await ev(`(() => { const r = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (_) { return []; } }).find(r => r.selectorText === ':focus-visible'); return !!r && r.cssText.includes('outline: 2px solid var(--primary-ink)') && r.style.outlineOffset === '2px'; })()`));
    check('pressed buttons move down a pixel', await ev(`[...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (_) { return []; } }).some(r => r.selectorText && /btn-primary/.test(r.selectorText) && /:active/.test(r.selectorText) && /translateY\\(1px\\)/.test(r.style.transform))`));
    await ev(`(() => { document.getElementById('auth-email').value = 'wrong@example.com'; document.getElementById('auth-password').value = 'secret1'; document.getElementById('email-auth-form').requestSubmit(); })()`);
    await sleep(700);
    check('the failing field is marked invalid', (await ev(`document.getElementById('auth-password').getAttribute('aria-invalid')`)) === 'true');
    check('the reason is shown under the field', /match/i.test(await ev(`(document.querySelector('#email-auth-form .field-msg') || {}).textContent || ''`)));
    check('the field points at its message for screen readers', await ev(`(() => { const p = document.getElementById('auth-password'), m = document.querySelector('#email-auth-form .field-msg'); return !!m && !!m.id && p.getAttribute('aria-describedby') === m.id; })()`));
    check('the invalid field has a danger border', await ev(`(() => { const d = document.createElement('i'); d.style.color = 'var(--danger)'; document.body.appendChild(d); const col = getComputedStyle(d).color; d.remove(); return getComputedStyle(document.getElementById('auth-password')).borderTopColor === col; })()`));
    check('the button is usable again', await ev(`!document.getElementById('email-signin-btn').disabled && document.getElementById('email-signin-btn').getAttribute('aria-busy') !== 'true' && /sign in/i.test(document.getElementById('email-signin-btn').textContent)`));
    await ev(`(() => { const p = document.getElementById('auth-password'); p.value = 'x'; p.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check('typing clears the error', (await ev(`document.getElementById('auth-password').getAttribute('aria-invalid')`)) !== 'true' && !(await ev(`!!document.querySelector('#email-auth-form .field-msg')`)));
    await boot({ seed: { habitly_returning: '1' }, mobile: false });
    check('desktop buttons are 40px', Math.round(await h('#email-signin-btn')) === 40, await h('#email-signin-btn'));
    noExceptions();
  });

  scenario('foundation: loading shows the shape of the page, with no spinner', async () => {
    check('the stylesheet has no endless animation at all', !/infinite/.test(css()));
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const block = html.slice(html.indexOf('id="loading-screen"'), html.indexOf('<!-- All habits done -->'));
    check('the loading screen is built from placeholder blocks', (block.match(/class="[^"]*\bskel\b/g) || []).length >= 5, (block.match(/class="[^"]*\bskel\b/g) || []).length);
    check('the spinner is gone', !/loading-spinner/.test(html) && !/loading-spinner/.test(css()));
    check('first paint knows whether to draw the app or the landing page', /habitly_returning/.test(html.slice(0, html.indexOf('</head>'))) && /data-returning/.test(html.slice(0, html.indexOf('</head>'))));
    await boot({ seed: signedIn(), initScript: 'window.__mockSnapshotDelay = 2500;' });
    check('rows are placeholders while habits load', (await ev(`document.querySelectorAll('#habits .skel-row').length`)) === 4);
    check('placeholders are not animated', await ev(`[...document.querySelectorAll('#habits .skel-row, #habits .skel-row *')].every(e => getComputedStyle(e).animationName === 'none')`));
    check('the list is marked busy', (await ev(`document.getElementById('habits').getAttribute('aria-busy')`)) === 'true');
    check('the empty state is not shown yet', !(await visible('#empty-state')));
    check('the New habit form does not pop open before we know the list is empty', await ev(`document.getElementById('habit-form').hidden`));
    await sleep(2900);
    check('placeholders are gone once data arrives', (await ev(`document.querySelectorAll('#habits .skel-row').length`)) === 0);
    check('the list is no longer busy', (await ev(`document.getElementById('habits').getAttribute('aria-busy')`)) !== 'true');
    check('an empty account then shows its empty state', await visible('#empty-state'));
    noExceptions();
  });
};
