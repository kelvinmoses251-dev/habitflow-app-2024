// Run with: node --test tests/home.test.js
// Pure helpers behind the Home screen (home.js is an ES module, so it is loaded with import()).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'home.js')).href);

test('timeSlot reads a habit\'s time of day, and anything else is "any"', async () => {
  const { timeSlot } = await load();
  assert.equal(timeSlot({ timeOfDay: 'morning' }), 'morning');
  assert.equal(timeSlot({ timeOfDay: 'afternoon' }), 'afternoon');
  assert.equal(timeSlot({ timeOfDay: 'evening' }), 'evening');
  assert.equal(timeSlot({}), 'any');
  assert.equal(timeSlot({ timeOfDay: 'any' }), 'any');
  assert.equal(timeSlot({ timeOfDay: 'midnight' }), 'any');
  assert.equal(timeSlot({ timeOfDay: 42 }), 'any');
  assert.equal(timeSlot(null), 'any');
});

test('currentSlot turns an hour into the part of the day', async () => {
  const { currentSlot } = await load();
  assert.equal(currentSlot(0), 'morning');
  assert.equal(currentSlot(11), 'morning');
  assert.equal(currentSlot(12), 'afternoon');
  assert.equal(currentSlot(16), 'afternoon');
  assert.equal(currentSlot(17), 'evening');
  assert.equal(currentSlot(23), 'evening');
});

test('slotOrder lists the current part of the day first, the rest in day order, and "any" last', async () => {
  const { slotOrder } = await load();
  assert.deepEqual(slotOrder('morning'), ['morning', 'afternoon', 'evening', 'any']);
  assert.deepEqual(slotOrder('afternoon'), ['afternoon', 'evening', 'morning', 'any']);
  assert.deepEqual(slotOrder('evening'), ['evening', 'morning', 'afternoon', 'any']);
});
