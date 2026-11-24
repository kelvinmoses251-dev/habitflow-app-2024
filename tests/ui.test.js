// Run with: node --test tests/ui.test.js
// Pure helpers from ui.js (the shared UI module). ui.js is an ES module, so it is loaded with import().
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'ui.js')).href);

const fakeButton = text => {
  const attrs = {};
  return { textContent: text, disabled: false, dataset: {}, attrs,
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, getAttribute(k) { return attrs[k] ?? null; } };
};

test('setBusy shows the busy label, disables the button and marks it busy', async () => {
  const { setBusy } = await load();
  const b = fakeButton('Sign in');
  setBusy(b, 'Signing in');
  assert.equal(b.textContent, 'Signing in');
  assert.equal(b.disabled, true);
  assert.equal(b.attrs['aria-busy'], 'true');
});

test('setBusy(null) puts everything back', async () => {
  const { setBusy } = await load();
  const b = fakeButton('Sign in');
  setBusy(b, 'Signing in');
  setBusy(b, null);
  assert.equal(b.textContent, 'Sign in');
  assert.equal(b.disabled, false);
  assert.equal('aria-busy' in b.attrs, false);
});

test('going busy twice still restores the original label', async () => {
  const { setBusy } = await load();
  const b = fakeButton('Add habit');
  setBusy(b, 'Adding');
  setBusy(b, 'Still adding');
  setBusy(b, null);
  assert.equal(b.textContent, 'Add habit');
});

test('clearing a button that was never busy changes nothing', async () => {
  const { setBusy } = await load();
  const b = fakeButton('Save');
  setBusy(b, null);
  assert.equal(b.textContent, 'Save');
  assert.equal(b.disabled, false);
});
