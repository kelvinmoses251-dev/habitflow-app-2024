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

test('dayList gives the last n local days, oldest first, across month and year boundaries', async () => {
  const { dayList } = await load();
  assert.deepEqual(dayList(7, '2026-03-02'), ['2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  assert.deepEqual(dayList(3, '2027-01-01'), ['2026-12-30', '2026-12-31', '2027-01-01']);
  assert.deepEqual(dayList(2, '2028-03-01'), ['2028-02-29', '2028-03-01']);      // leap year
  assert.deepEqual(dayList(1, '2026-11-24'), ['2026-11-24']);
});

test('dayList is not thrown by daylight-saving days', async () => {
  const { dayList } = await load();
  // Clocks change on these dates in Europe and the US; every day must still appear exactly once
  assert.deepEqual(dayList(3, '2026-03-30'), ['2026-03-28', '2026-03-29', '2026-03-30']);
  assert.deepEqual(dayList(3, '2026-11-02'), ['2026-10-31', '2026-11-01', '2026-11-02']);
});

test('weekDots marks each of the last seven days as done, missed, or before the habit existed', async () => {
  const { weekDots } = await load();
  const h = { completedDates: ['2026-11-24', '2026-11-22', '2026-11-10'], createdAt: '2026-11-21T09:00:00' };
  const d = weekDots(h, '2026-11-24');
  assert.deepEqual(d.map(x => x.state), ['na', 'na', 'na', 'off', 'on', 'off', 'on']);
  assert.equal(d[6].today, true);
  assert.equal(d[5].today, false);
  // No creation date (very old habits): every day counts
  assert.deepEqual(weekDots({ completedDates: [] }, '2026-11-24').map(x => x.state), ['off', 'off', 'off', 'off', 'off', 'off', 'off']);
});

test('moveItem moves one id to a new position without touching the rest', async () => {
  const { moveItem } = await load();
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 2, 0), ['c', 'a', 'b', 'd']);
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 3), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a']);      // past the end clamps
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -5), ['c', 'a', 'b']);      // before the start clamps
  const input = ['a', 'b'];
  moveItem(input, 0, 1);
  assert.deepEqual(input, ['a', 'b']);                                       // the input is not changed
});

test('planReorder writes only the moved habit when there is room between its new neighbours', async () => {
  const { planReorder } = await load();
  const items = [{ id: 'a', order: 100 }, { id: 'b', order: 200 }, { id: 'c', order: 300 }];
  assert.deepEqual(planReorder(items, 'c', 0), [{ id: 'c', order: 99 }]);             // to the top: just below the first
  assert.deepEqual(planReorder(items, 'a', 2), [{ id: 'a', order: 301 }]);            // to the end: just above the last
  assert.deepEqual(planReorder(items, 'c', 1), [{ id: 'c', order: 150 }]);            // between: the midpoint
  assert.deepEqual(planReorder(items, 'b', 1), []);                                   // no move, no writes
});

test('planReorder renumbers when neighbours leave no room, and still writes as little as it can', async () => {
  const { planReorder } = await load();
  const tight = [{ id: 'a', order: 5 }, { id: 'b', order: 5 }, { id: 'c', order: 9 }];
  const writes = planReorder(tight, 'c', 1);                                 // between two equal orders: no midpoint exists
  const after = Object.fromEntries(tight.map(x => [x.id, x.order]));
  writes.forEach(w => { after[w.id] = w.order; });
  assert.ok(after.a < after.c && after.c < after.b, JSON.stringify(after));  // the final order is a, c, b
  assert.ok(writes.every(w => Number.isFinite(w.order)));
});

test('planReorder copes with habits that have no order yet', async () => {
  const { planReorder } = await load();
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const writes = planReorder(items, 'c', 0);
  const after = { a: 0, b: 0, c: 0 };
  writes.forEach(w => { after[w.id] = w.order; });
  assert.ok(after.c < after.a && after.a < after.b, JSON.stringify(after));
});

test('swipeIntent waits for 12px, then decides between a sideways swipe and a scroll', async () => {
  const { swipeIntent } = await load();
  assert.equal(swipeIntent(5, 3), 'pending');          // not enough movement yet
  assert.equal(swipeIntent(-8, 8), 'pending');
  assert.equal(swipeIntent(20, 4), 'swipe');           // clearly sideways
  assert.equal(swipeIntent(-30, 10), 'swipe');
  assert.equal(swipeIntent(6, 30), 'scroll');          // clearly up or down: leave it to the page
  assert.equal(swipeIntent(14, 13), 'scroll');         // diagonal is treated as a scroll, never as a swipe
});

test('swipeResult needs more than 72px before anything happens', async () => {
  const { swipeResult } = await load();
  assert.equal(swipeResult(30), null);
  assert.equal(swipeResult(72), null);
  assert.equal(swipeResult(73), 'right');
  assert.equal(swipeResult(-72), null);
  assert.equal(swipeResult(-90), 'left');
});

test('habitsOnDay lists the daily habits that existed on a day, with whether each was done', async () => {
  const { habitsOnDay } = await load();
  const habits = [
    { id: 'a', name: 'Old', createdAt: '2026-11-01T08:00:00', completedDates: ['2026-11-20', '2026-11-22'] },
    { id: 'b', name: 'Newer', createdAt: '2026-11-22T08:00:00', completedDates: [] },
    { id: 'w', name: 'Weekly', frequency: 'weekly', createdAt: '2026-11-01T08:00:00', completedDates: ['2026-11-20'] },
    { id: 'd', name: 'Deleted', createdAt: '2026-11-01T08:00:00', completedDates: ['2026-11-20'], deletedAt: 123 },
    { id: 'n', name: 'No date', completedDates: ['2026-11-20'] },
  ];
  const on20 = habitsOnDay(habits, '2026-11-20');
  assert.deepEqual(on20.map(x => [x.habit.id, x.done]), [['a', true], ['n', true]]);       // b did not exist yet; weekly and deleted are left out
  const on22 = habitsOnDay(habits, '2026-11-22');
  assert.deepEqual(on22.map(x => [x.habit.id, x.done]), [['a', true], ['b', false], ['n', false]]);
});

test('shiftDay moves a day key by whole days', async () => {
  const { shiftDay } = await load();
  assert.equal(shiftDay('2026-11-24', -1), '2026-11-23');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-11-24', 0), '2026-11-24');
});

test('matchesFilter matches by category, by text, or both, ignoring case and accents', async () => {
  const { matchesFilter } = await load();
  const h = { name: 'Café run', category: 'fitness' };
  assert.equal(matchesFilter(h, {}), true);
  assert.equal(matchesFilter(h, { category: 'fitness' }), true);
  assert.equal(matchesFilter(h, { category: 'reading' }), false);
  assert.equal(matchesFilter(h, { text: 'cafe' }), true);                    // accent-insensitive
  assert.equal(matchesFilter(h, { text: 'RUN' }), true);                     // case-insensitive
  assert.equal(matchesFilter(h, { text: '  run  ' }), true);                 // stray spaces
  assert.equal(matchesFilter(h, { text: 'walk' }), false);
  assert.equal(matchesFilter(h, { category: 'fitness', text: 'walk' }), false);
  assert.equal(matchesFilter(h, { category: 'all', text: '' }), true);       // "All" and an empty box mean no filter
  assert.equal(matchesFilter({ name: 'Read', category: 'reading' }, { text: 'reading' }), true);   // typing a category name finds it
});
