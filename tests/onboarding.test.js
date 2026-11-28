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
