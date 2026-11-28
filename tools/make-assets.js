#!/usr/bin/env node
// Regenerates the brand assets from code, so they stay consistent and reproducible:
//   favicon.png, icon-192.png, icon-512.png, icon-maskable-512.png, icon-*.svg, og-image.png
// Needs a Chromium-based browser (Edge/Chrome). Run:  node tools/make-assets.js   (add --og for the link preview only)
//
// Design: flat accent square, plain white check mark. No gradients.

const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BROWSERS = [process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const BROWSER = BROWSERS.find(p => fs.existsSync(p));
if (!BROWSER) { console.error('No Chromium-based browser found. Set EDGE_PATH.'); process.exit(2); }

const ACCENT = '#4A3AB8';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'habitly-assets-'));

function shot(html, outFile, w, h, scale = 1, transparent = false) {
  const page = path.join(tmp, path.basename(outFile) + '.html');
  fs.writeFileSync(page, html);
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmp, 'profile')}`,
    `--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`, '--virtual-time-budget=9000',
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${outFile}`, 'file:///' + page.replace(/\\/g, '/')];
  const r = spawnSync(BROWSER, args, { stdio: 'ignore' });
  if (!fs.existsSync(outFile)) throw new Error('screenshot failed for ' + outFile + ' (exit ' + r.status + ')');
  console.log('wrote', path.relative(ROOT, outFile));
}

// ── Icons ────────────────────────────────────────────────
// `inset` shrinks the artwork for maskable icons (the OS may crop up to 20% from each edge)
const iconSvg = (size, { rounded = true, inset = 0 } = {}) => {
  const r = rounded ? size * 0.22 : 0;
  const s = size * (1 - inset * 2), o = size * inset;       // artwork box
  const p = (x, y) => `${(o + s * x).toFixed(2)},${(o + s * y).toFixed(2)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${ACCENT}"/>
  <polyline points="${p(.28, .52)} ${p(.44, .68)} ${p(.73, .34)}" fill="none" stroke="#fff" stroke-width="${(s * 0.1).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};
const iconPage = svg => `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`;

const ONLY_OG = process.argv.includes('--og');
if (!ONLY_OG) {
fs.writeFileSync(path.join(ROOT, 'icon-192.svg'), iconSvg(192));
fs.writeFileSync(path.join(ROOT, 'icon-512.svg'), iconSvg(512));
fs.writeFileSync(path.join(ROOT, 'icon-maskable-512.svg'), iconSvg(512, { rounded: false, inset: 0.14 }));

shot(iconPage(iconSvg(512)), path.join(ROOT, 'icon-512.png'), 512, 512, 1, true);
shot(iconPage(iconSvg(512)), path.join(ROOT, 'icon-192.png'), 512, 512, 192 / 512, true);
shot(iconPage(iconSvg(512)), path.join(ROOT, 'favicon.png'), 512, 512, 64 / 512, true);
shot(iconPage(iconSvg(512, { rounded: false, inset: 0.14 })), path.join(ROOT, 'icon-maskable-512.png'), 512, 512, 1, false);

}

// ── Open Graph preview (1200x630), dark ───────────────────
const FONT_DIR = 'file:///' + path.join(ROOT, 'fonts').split(String.fromCharCode(92)).join('/');
const FONT_FACES = `@font-face{font-family:Inter;font-weight:100 900;src:url("${FONT_DIR}/inter-var-latin.woff2") format("woff2")}
  @font-face{font-family:'Instrument Serif';font-style:normal;src:url("${FONT_DIR}/instrument-serif-latin.woff2") format("woff2")}
  @font-face{font-family:'Instrument Serif';font-style:italic;src:url("${FONT_DIR}/instrument-serif-italic-latin.woff2") format("woff2")}`;
const OG_ACCENT = '#6657DB', OG_INK = '#A79EF5';
const check = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
const row = (name, done, cat) => `
  <div class="row ${done ? 'done' : ''}"><span class="box">${done ? check : ''}</span><span class="nm">${name}</span><span class="cat">${cat}</span></div>`;
const og = `<!doctype html><html><head><meta charset="utf-8">
<style>
  ${FONT_FACES}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1200px;height:630px;overflow:hidden}
  body{font-family:Inter,system-ui,sans-serif;background:#111113;color:#EDEDF0;display:flex;align-items:center;padding:0 88px;gap:72px}
  .left{flex:1.1}
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:44px}
  .logo{width:44px;height:44px;border-radius:10px;background:${OG_ACCENT};display:grid;place-items:center}
  .brand b{font-size:30px;font-weight:600;letter-spacing:-.01em}
  h1{font-family:'Instrument Serif',Georgia,serif;font-size:112px;line-height:.98;font-weight:400;letter-spacing:-.02em;margin-bottom:28px}
  h1 em{font-style:italic;color:${OG_INK}}
  p{font-size:28px;line-height:1.45;color:#ABABB4;max-width:560px}
  .note{margin-top:34px;font-size:22px;color:#8C8C96}
  .card{flex:.9;background:#1C1C20;border:1px solid #2E2E34;border-radius:18px;padding:30px}
  .top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
  .top b{font-size:22px;font-weight:600}.top span{font-size:18px;color:#8C8C96}
  .bar{height:8px;background:#28282D;border-radius:99px;margin-bottom:22px;overflow:hidden}.bar i{display:block;width:50%;height:100%;background:${OG_ACCENT}}
  .row{display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid #2E2E34;border-radius:10px;margin-bottom:10px;font-size:20px;font-weight:500}
  .row .box{width:24px;height:24px;border-radius:7px;border:2px solid #3D3D44;display:grid;place-items:center;flex:none}
  .row.done{background:#17171A;color:#8C8C96}.row.done .nm{text-decoration:line-through;text-decoration-color:#3D3D44}.row.done .box{background:${OG_ACCENT};border-color:${OG_ACCENT}}
  .row .nm{flex:1}.row .cat{font-size:15px;color:#8C8C96;font-weight:400}
  .stats{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #2E2E34;border-radius:10px;margin-top:20px}
  .stats div{padding:14px 16px}.stats div+div{border-left:1px solid #2E2E34}
  .stats small{display:block;font-size:14px;color:#8C8C96}.stats strong{font-family:'Instrument Serif',Georgia,serif;font-size:36px;font-weight:400}
</style></head><body>
  <div class="left">
    <div class="brand"><div class="logo"><svg viewBox="0 0 32 32" width="26" height="26"><path d="M9 16.5l5 5 9-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div><b>Habitly</b></div>
    <h1>Build habits<br>that <em>last</em>.</h1>
    <p>Track daily, weekly and monthly habits with streaks, levels and clear progress charts.</p>
    <div class="note">Try the demo. No account needed.</div>
  </div>
  <div class="card">
    <div class="top"><b>Today</b><span>2 / 4 done</span></div>
    <div class="bar"><i></i></div>
    ${row('Drink 2 litres of water', true, 'Health')}${row('Read 10 pages', true, 'Reading')}${row('Workout for 30 minutes', false, 'Fitness')}${row('Meditate for 10 minutes', false, 'Relaxation')}
    <div class="stats"><div><small>Streak</small><strong>12 days</strong></div><div><small>Level</small><strong>4</strong></div><div><small>Shield</small><strong>1</strong></div></div>
  </div>
</body></html>`;
shot(og, path.join(ROOT, 'og-image.png'), 1200, 630);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
