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
};
