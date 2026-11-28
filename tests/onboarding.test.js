// Run with: node --test tests/onboarding.test.js
// Getting in and getting started: the email-link hand-off, first habits for a goal, which install help to show.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'onboarding.js')).href);
const store = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), has: k => m.has(k) }; };
const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

// ── Sign-in by emailed link ────────────────────────────────
test('the address a link was sent to is remembered on the device, and handed back once', async () => {
  const { rememberLinkEmail, takeLinkEmail, LINK_EMAIL_KEY } = await load();
  const s = store();
  assert.equal(rememberLinkEmail(s, '  Ada@Example.com ', 1000), true);
  assert.ok(s.has(LINK_EMAIL_KEY));
  assert.equal(takeLinkEmail(s, 2000), 'Ada@Example.com');
  assert.ok(!s.has(LINK_EMAIL_KEY), 'it is removed once used');
  assert.equal(takeLinkEmail(s, 3000), '');
});

test('a remembered address goes stale after a day, and junk or blocked storage gives nothing', async () => {
  const { rememberLinkEmail, takeLinkEmail, LINK_EMAIL_KEY, LINK_EMAIL_TTL } = await load();
  const s = store();
  rememberLinkEmail(s, 'ada@example.com', 0);
  assert.equal(takeLinkEmail(s, LINK_EMAIL_TTL + 1), '');
  assert.ok(!s.has(LINK_EMAIL_KEY), 'a stale address is cleared too');
  assert.equal(takeLinkEmail(store({ [LINK_EMAIL_KEY]: '{not json' })), '');
  assert.equal(takeLinkEmail(store({ [LINK_EMAIL_KEY]: JSON.stringify({ email: 42, at: 1 }) }), 2), '');
  assert.equal(rememberLinkEmail(broken, 'a@b.co'), false);
  assert.equal(takeLinkEmail(broken), '');
});

test('isEmail: a quick shape check before anything is sent', async () => {
  const { isEmail } = await load();
  for (const ok of ['a@b.co', 'first.last+tag@sub.example.org']) assert.equal(isEmail(ok), true, ok);
  for (const bad of ['', 'a', 'a@b', 'a b@c.d', '@b.co', 'a@.co', null, undefined]) assert.equal(isEmail(bad), false, String(bad));
});

test('linkProblem: each way a link can fail is said in plain words', async () => {
  const { linkProblem } = await load();
  assert.match(linkProblem('auth/invalid-action-code'), /expired or was already used/);
  assert.match(linkProblem('auth/expired-action-code'), /expired or was already used/);
  assert.match(linkProblem('auth/invalid-email'), /not the address/);
  assert.match(linkProblem('auth/operation-not-allowed'), /not switched on/);
  assert.match(linkProblem('auth/network-request-failed'), /offline/);
  assert.match(linkProblem('auth/too-many-requests'), /Too many/);
  assert.match(linkProblem('something-else'), /Something went wrong/);
});

// ── First habits for a goal ────────────────────────────────
const T = (name, goals) => ({ name, category: 'health', goals });
const LIST = [T('Water', ['Energy']), T('Sleep', ['Energy', 'Calm']), T('Sun', ['Energy']), T('Breakfast', ['Energy']), T('Walk', ['Fitness', 'Energy']), T('Lift', ['Fitness']), T('Run', ['Fitness']), T('Stretch', ['Fitness', 'Calm']), T('Breathe', ['Calm']), T('Read', ['Learning'])];

test('habitsForGoals: one goal suggests its first three habits', async () => {
  const { habitsForGoals } = await load();
  assert.deepEqual(habitsForGoals(LIST, ['Fitness']).map(t => t.name), ['Walk', 'Lift', 'Run']);
  assert.deepEqual(habitsForGoals(LIST, ['Learning']).map(t => t.name), ['Read'], 'a goal with one habit suggests one');
});

test('habitsForGoals: several goals take turns, with no habit twice, up to five', async () => {
  const { habitsForGoals } = await load();
  assert.deepEqual(habitsForGoals(LIST, ['Energy', 'Calm']).map(t => t.name), ['Water', 'Sleep', 'Sun', 'Stretch']);
  assert.deepEqual(habitsForGoals(LIST, ['Energy', 'Fitness', 'Calm', 'Learning']).map(t => t.name), ['Water', 'Walk', 'Sleep', 'Read', 'Sun']);
  assert.equal(new Set(habitsForGoals(LIST, ['Energy', 'Fitness', 'Calm']).map(t => t.name)).size, 5);
});

test('habitsForGoals: nothing picked suggests nothing; names already in use are skipped; junk is ignored', async () => {
  const { habitsForGoals } = await load();
  assert.deepEqual(habitsForGoals(LIST, []), []);
  assert.deepEqual(habitsForGoals(LIST, ['Nonsense']), []);
  assert.deepEqual(habitsForGoals(LIST, ['Fitness'], ['walk', 'LIFT']).map(t => t.name), ['Run', 'Stretch']);
  assert.deepEqual(habitsForGoals(null, ['Fitness']), []);
  assert.deepEqual(habitsForGoals([null, { name: 'x' }, T('Lift', ['Fitness'])], ['Fitness']).map(t => t.name), ['Lift']);
});

test('habitsForGoals: the real library gives three to five for any choice of goals', async () => {
  const { habitsForGoals } = await load();
  const tpl = await import(pathToFileURL(path.join(__dirname, '..', 'templates.js')).href);
  for (const g of tpl.TEMPLATE_GOALS) assert.equal(habitsForGoals(tpl.TEMPLATES, [g]).length, 3, g);
  assert.equal(habitsForGoals(tpl.TEMPLATES, tpl.TEMPLATE_GOALS.slice(0, 2)).length, 4);
  assert.equal(habitsForGoals(tpl.TEMPLATES, tpl.TEMPLATE_GOALS).length, 5);
});

// ── Which install help to show ─────────────────────────────
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0';

test('installPlatform: the right help for the device', async () => {
  const { installPlatform } = await load();
  assert.equal(installPlatform({ ua: ANDROID, standalone: true, canPrompt: true }), 'installed', 'already running as an app');
  assert.equal(installPlatform({ ua: ANDROID, canPrompt: true }), 'prompt', 'the browser offers to install');
  assert.equal(installPlatform({ ua: IPHONE }), 'ios', 'iPhone Safari: Share, then Add to Home Screen');
  assert.equal(installPlatform({ ua: IPHONE_CHROME }), 'ios-other', 'another browser on iPhone: go to Safari first');
  assert.equal(installPlatform({ ua: IPAD, touchPoints: 5 }), 'ios', 'an iPad says it is a Mac, but has a touch screen');
  assert.equal(installPlatform({ ua: IPAD, touchPoints: 0 }), 'manual', 'a real Mac');
  assert.equal(installPlatform({ ua: FIREFOX }), 'manual');
  assert.equal(installPlatform({ ua: ANDROID }), 'manual', 'Android before the browser has offered');
  assert.equal(installPlatform({}), 'manual');
  assert.equal(installPlatform(), 'manual');
});

// ── From the independent review of batch 7 ─────────────────
test('review: a stale remembered address is dropped when the app opens; a fresh one is left for the link', async () => {
  const { rememberLinkEmail, dropStaleLinkEmail, forgetLinkEmail, LINK_EMAIL_KEY, LINK_EMAIL_TTL } = await load();
  const s = store();
  rememberLinkEmail(s, 'ada@example.com', 1000);
  dropStaleLinkEmail(s, 2000);
  assert.ok(s.has(LINK_EMAIL_KEY), 'fresh: kept');
  dropStaleLinkEmail(s, 1000 + LINK_EMAIL_TTL + 1);
  assert.ok(!s.has(LINK_EMAIL_KEY), 'older than a day: removed');
  const junk = store({ [LINK_EMAIL_KEY]: '{not json' });
  dropStaleLinkEmail(junk); assert.ok(!junk.has(LINK_EMAIL_KEY));
  rememberLinkEmail(s, 'ada@example.com'); forgetLinkEmail(s); assert.ok(!s.has(LINK_EMAIL_KEY));
  dropStaleLinkEmail(broken); forgetLinkEmail(broken);
});

test('review: in-app browsers on iPhone are sent to Safari too', async () => {
  const { installPlatform } = await load();
  const base = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  assert.equal(installPlatform({ ua: base + ' [FBAN/FBIOS;FBAV/450.0]' }), 'ios-other');
  assert.equal(installPlatform({ ua: base + ' Instagram 320.0' }), 'ios-other');
});
