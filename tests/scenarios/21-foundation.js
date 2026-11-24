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
};
