// Run with: node --test tests/sw-push.test.js
// Loads the real service worker in a sandbox and checks what it shows for a push message.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');

function loadWorker() {
  const shown = [];
  let handler = null;
  const self = {
    location: { origin: 'https://example.test' },
    addEventListener() {},
    skipWaiting() {},
    registration: { showNotification: (title, options) => { shown.push({ title, ...options }); return Promise.resolve(); } },
  };
  const sandbox = {
    self, URL, Promise, Set, console, setTimeout,
    importScripts() {},
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: fn => { handler = fn; } }) },
    caches: {}, clients: {}, fetch() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'firebase-messaging-sw.js'), 'utf8'), sandbox);
  return { push: payload => handler(payload), shown };
}

test('a data-only reminder is shown exactly once, with its text', () => {
  const w = loadWorker();
  w.push({ data: { title: 'Habitly', body: 'Your habits for today are waiting.', url: '/' } });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'Habitly');
  assert.equal(w.shown[0].body, 'Your habits for today are waiting.');
  assert.equal(w.shown[0].tag, 'habitly-reminder');
  assert.equal(w.shown[0].data.url, '/');
});

test('a message with a notification block is left to the Firebase SDK, which already shows it', () => {
  const w = loadWorker();
  w.push({ notification: { title: 'Habitly', body: 'Hello' }, data: {} });
  assert.equal(w.shown.length, 0);
});

test('a reminder with no text still shows something sensible', () => {
  const w = loadWorker();
  w.push({ data: {} });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'Habitly');
  assert.ok(w.shown[0].body.length > 10);
});
