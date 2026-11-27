#!/usr/bin/env node
// Habitly smoke tests: drives the REAL app in headless Edge/Chrome with an in-memory Firebase.
//
//   node tests/smoke.js                 run everything
//   node tests/smoke.js --only demo     run scenarios whose name contains "demo"
//   node tests/smoke.js --shots out/    also save a screenshot per scenario
//   node tests/smoke.js --origin https://habit-tracker-demo-34c0a.web.app   test the deployed site
//   EDGE_PATH=... to point at a different Chromium-based browser
//
// Requires Node 22+ (global WebSocket/fetch). No npm dependencies.

const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MOCK_SRC = fs.readFileSync(path.join(__dirname, 'firebase-mock.js'));
const args = process.argv.slice(2);
const argVal = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = argVal('--only');
const SHOTS = argVal('--shots');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const BROWSERS = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const BROWSER = BROWSERS.find(p => fs.existsSync(p));
if (!BROWSER) { console.error('No Chromium-based browser found. Set EDGE_PATH.'); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain', '.xml': 'application/xml' };
const PORT = Number(process.env.SMOKE_PORT) || 8137, DEBUG_PORT = Number(process.env.SMOKE_DEBUG_PORT) || 9447;   // overridable, so a second copy of the suite can run beside this one
// --origin https://... runs the same suite against a deployed site (real files, mocked Firebase backend)
const ORIGIN = (argVal('--origin') || `http://localhost:${PORT}`).replace(/\/+$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT);

// ── Results ──────────────────────────────────────────────
let passed = 0, failed = 0, current = '';
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`   ✓ ${name}`); }
  else { failed++; failures.push(`${current} › ${name}${detail !== undefined ? ' — ' + detail : ''}`); console.log(`   ✗ ${name}${detail !== undefined ? '  → ' + detail : ''}`); }
}

(async () => {
  // A browser from a run that has only just finished may still be shutting down and holding the debugging port.
  // Starting before it lets go made the next run fail at once, so wait (up to 20s) for the port to be free.
  for (let i = 0; i < 80; i++) {
    try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(400) }); } catch (_) { break; }
    await sleep(250);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'habitly-test-'));
  let proc = null;
  const killBrowser = () => { try { process.platform === 'win32' ? execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' }) : proc.kill('SIGKILL'); } catch (_) {} };
  const cleanup = () => {
    killBrowser();
    try { server.close(); } catch (_) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
  };
  process.on('exit', cleanup);

  // Start the browser and wait for its page. On a busy machine it occasionally fails to come up, which used to
  // abort the whole run with a TypeError, so try up to three times before giving up with a clear message.
  let targets = null;
  for (let attempt = 1; attempt <= 3 && !targets; attempt++) {
    proc = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
      '--no-first-run', '--disable-gpu', '--disable-extensions', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 80; i++) {
      try { const t = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json(); if (t.some(x => x.type === 'page')) { targets = t; break; } } catch (_) {}
      await sleep(250);
    }
    if (!targets) { console.error(`Browser did not start (attempt ${attempt} of 3).`); killBrowser(); await sleep(2000); }
  }
  if (!targets) { console.error('Could not start a browser for the tests.'); process.exit(2); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));

  let id = 0; const pending = new Map(); let logs = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') logs.push({ t: 'exception', m: d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text });
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push({ t: 'error', m: d.params.args.map(a => a.value ?? a.description).join(' ') });
    if (d.method === 'Fetch.requestPaused') {
      const { requestId, request } = d.params;
      if (/gstatic\.com\/firebasejs\//.test(request.url)) {
        send('Fetch.fulfillRequest', { requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
          body: MOCK_SRC.toString('base64') });
      } else send('Fetch.continueRequest', { requestId });
    }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { __err: r.result.exceptionDetails.exception?.description || 'eval error' };
    return r.result?.result?.value;
  };
  const waitFor = async (expr, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await ev(expr); if (v && !v.__err) return true; await sleep(100); } return false; };
  const shot = async name => { if (!SHOTS) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); };

  await send('Runtime.enable'); await send('Page.enable');
  // A registered service worker would route subresource loads around our Firebase interception
  await send('Network.enable'); await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.gstatic.com/firebasejs/*' }] });

  // Load the origin, wipe + seed storage, reload. `seed` is a map of localStorage keys.
  let initScriptId = null;
  async function boot({ seed = {}, mobile = true, tz = 'Africa/Lagos', hash = '', colorScheme = 'light', initScript = null } = {}) {
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });   // a previous scenario may have gone offline
    if (initScriptId) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScriptId }); initScriptId = null; }
    if (initScript) initScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript })).result.identifier;
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: colorScheme }] });
    await send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setTimezoneOverride', { timezoneId: tz });
    await send('Page.navigate', { url: ORIGIN + '/404-boot' }); await sleep(300);   // any same-origin page to reach localStorage
    await ev(`localStorage.clear(); ${Object.entries(seed).filter(([, v]) => v != null).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))});`).join('')} 0`);
    logs = [];
    await send('Page.navigate', { url: ORIGIN + '/index.html' + hash });
    await waitFor(`!!document.getElementById('auth-screen') && !document.getElementById('loading-screen')`, 20000);
    await sleep(300);
  }
  const user = (over = {}) => JSON.stringify({ uid: 'u-test', displayName: 'Test User', email: 'test@example.com', photoURL: null, metadata: { creationTime: '2026-01-05T10:00:00Z' }, ...over });
  // Most older scenarios walk through the "Mark as complete?" dialog, so the shared seed switches it on.
  // The real default (one tap, with Undo) is covered in 24-home.js, which passes habitly_confirm: null.
  // The evening recap offer depends on the clock, so the shared seed switches it off (Profile, "Evening recap"):
  // the suite must behave the same at 9am and 9pm. 36-reflection.js passes habitly_recap: null to test the offer.
  const signedIn = (extra = {}) => ({ mock_fb_user: user(), 'habitly_seen_u-test': '1', habitly_returning: '1', habitly_confirm: 'on', habitly_recap: 'off', ...extra });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent`);
  const visible = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display!=='none' && e.getClientRects().length>0})()`);
  const noExceptions = () => check('no uncaught exceptions', !logs.some(l => l.t === 'exception'), logs.filter(l => l.t === 'exception').map(l => l.m).join(' | ').slice(0, 300));

  const scenarios = [];
  const scenario = (name, fn) => scenarios.push({ name, fn });
  const ctx = { send, ev, waitFor, shot, boot, user, signedIn, text, visible, check, sleep, noExceptions, get logs() { return logs; } };

  // Scenarios live in tests/scenarios/*.js so each improvement can add its own regression test
  const dir = path.join(__dirname, 'scenarios');
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().forEach(f => require(path.join(dir, f))(scenario, ctx));

  for (const s of scenarios) {
    if (ONLY && !s.name.includes(ONLY)) continue;
    current = s.name; console.log(`\n> ${s.name}`);
    try { await s.fn(); await shot(s.name.replace(/[^a-z0-9]+/gi, '_')); }
    catch (e) { failed++; failures.push(`${s.name} › threw: ${e.message}`); console.log(`   ✗ threw: ${e.message}`); }
    if (args.includes('--verbose')) logs.slice(0, 12).forEach(l => console.log(`     [${l.t}] ${String(l.m).slice(0, 260)}`));
  }

  console.log(`\n${failed ? '✗' : '✓'} ${passed} passed, ${failed} failed`);
  if (failed) failures.forEach(f => console.log('  - ' + f));
  cleanup();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
