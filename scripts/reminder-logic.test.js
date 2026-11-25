// Run with: node --test scripts/
const test = require('node:test');
const assert = require('node:assert/strict');
const { localParts, reminderSlot, isHabitDone, dueSlot, buildMessage } = require('./reminder-logic');

const at = iso => new Date(iso);
const habit = (o = {}) => ({ name: 'Read', frequency: 'daily', completedDates: [], ...o });

test('local day and hour follow the user\'s timezone, not UTC', () => {
  // 23:30 UTC on the 23rd is already the 24th in Lagos (UTC+1) and still the 23rd in New York
  assert.deepEqual(localParts(at('2026-11-23T23:30:00Z'), 'Africa/Lagos'), { day: '2026-11-24', hour: 0 });
  assert.deepEqual(localParts(at('2026-11-23T23:30:00Z'), 'America/New_York'), { day: '2026-11-23', hour: 18 });
});

test('a missing or invalid timezone falls back to UTC', () => {
  assert.deepEqual(localParts(at('2026-11-23T09:15:00Z'), undefined), { day: '2026-11-23', hour: 9 });
  assert.deepEqual(localParts(at('2026-11-23T09:15:00Z'), 'Not/AZone'), { day: '2026-11-23', hour: 9 });
});

test('reminders go out in a morning and an evening window, with slack for a late job', () => {
  assert.equal(reminderSlot(7), null);
  assert.equal(reminderSlot(8), 'am');
  assert.equal(reminderSlot(10), 'am');
  assert.equal(reminderSlot(11), null);
  assert.equal(reminderSlot(19), null);
  assert.equal(reminderSlot(20), 'pm');
  assert.equal(reminderSlot(22), 'pm');
  assert.equal(reminderSlot(23), null);
});

test('a daily habit is done only if ticked on the user\'s local day', () => {
  const now = at('2026-11-23T23:30:00Z');                       // the 24th in Lagos
  const h = habit({ completedDates: ['2026-11-23'] });
  assert.equal(isHabitDone(h, now, 'Africa/Lagos'), false);
  assert.equal(isHabitDone(h, now, 'America/New_York'), true);
});

test('a weekly habit is done if ticked any day of the local Monday-to-Sunday week', () => {
  const now = at('2026-11-25T12:00:00Z');                       // Wednesday
  assert.equal(isHabitDone(habit({ frequency: 'weekly', completedDates: ['2026-11-23'] }), now, 'UTC'), true);   // Monday
  assert.equal(isHabitDone(habit({ frequency: 'weekly', completedDates: ['2026-11-22'] }), now, 'UTC'), false);  // last Sunday
  assert.equal(isHabitDone(habit({ frequency: 'weekly', completedDates: ['2026-11-29'] }), at('2026-11-29T12:00:00Z'), 'UTC'), true);  // Sunday itself
});

test('a monthly habit is done if ticked in the local month', () => {
  const now = at('2026-11-25T12:00:00Z');
  assert.equal(isHabitDone(habit({ frequency: 'monthly', completedDates: ['2026-11-01'] }), now, 'UTC'), true);
  assert.equal(isHabitDone(habit({ frequency: 'monthly', completedDates: ['2026-10-31'] }), now, 'UTC'), false);
});

test('a user is due when it is their reminder window and something is still open', () => {
  const user = { fcmToken: 't', tz: 'Africa/Lagos' };
  assert.equal(dueSlot(user, [habit()], at('2026-11-23T19:10:00Z')), '2026-11-23-pm');   // 20:10 in Lagos
  assert.equal(dueSlot(user, [habit()], at('2026-11-23T07:10:00Z')), '2026-11-23-am');   // 08:10 in Lagos
});

test('not due outside the window, e.g. the old fixed 21:00 UTC run for someone in Tokyo', () => {
  assert.equal(dueSlot({ fcmToken: 't', tz: 'Asia/Tokyo' }, [habit()], at('2026-11-23T21:00:00Z')), null);   // 06:00 in Tokyo
});

test('not due without a token, without habits, or when everything is done', () => {
  const now = at('2026-11-23T19:10:00Z');
  assert.equal(dueSlot({ tz: 'Africa/Lagos' }, [habit()], now), null);
  assert.equal(dueSlot({ fcmToken: 't', tz: 'Africa/Lagos' }, [], now), null);
  assert.equal(dueSlot({ fcmToken: 't', tz: 'Africa/Lagos' }, [habit({ completedDates: ['2026-11-23'] })], now), null);
});

test('deleted habits do not trigger a reminder', () => {
  assert.equal(dueSlot({ fcmToken: 't', tz: 'UTC' }, [habit({ deletedAt: 123 })], at('2026-11-23T20:10:00Z')), null);
});

test('never sent twice for the same window, even if the job runs every hour', () => {
  const user = { fcmToken: 't', tz: 'Africa/Lagos', lastReminder: '2026-11-23-pm' };
  assert.equal(dueSlot(user, [habit()], at('2026-11-23T20:10:00Z')), null);              // 21:10 in Lagos, same window
  assert.equal(dueSlot(user, [habit()], at('2026-11-24T07:10:00Z')), '2026-11-24-am');   // next morning
});

test('messages are data-only so the browser shows exactly one notification', () => {
  const m = buildMessage('tok', 'Body text');
  assert.equal(m.token, 'tok');
  assert.equal(m.notification, undefined);
  assert.deepEqual(m.data, { title: 'Habitly', body: 'Body text', url: '/' });
});

// ── With the app's rules passed in (what send-reminders.js does) ──
const path = require('path');
const { pathToFileURL } = require('url');
const loadRules = () => import(pathToFileURL(path.join(__dirname, '..', 'habit-rules.js')).href);

test('with the app\'s rules: a habit that rests today never triggers a reminder', async () => {
  const rules = await loadRules();
  const isOpen = (h, day) => rules.isOpenOn(h, day);
  const user = { fcmToken: 't', tz: 'UTC' };
  const thursdayEvening = at('2026-11-26T20:10:00Z');
  const mwf = habit({ schedule: { type: 'days', days: [1, 3, 5] } });
  assert.equal(dueSlot(user, [mwf], thursdayEvening, isOpen), null);                    // Mon/Wed/Fri habit on a Thursday
  assert.equal(dueSlot(user, [mwf], at('2026-11-27T20:10:00Z'), isOpen), '2026-11-27-pm');   // Friday: due and open
  assert.equal(dueSlot(user, [mwf], thursdayEvening), '2026-11-26-pm');                 // the old built-in check would have nagged
});

test('with the app\'s rules: paused, archived, not-started and week-complete habits are left alone', async () => {
  const rules = await loadRules();
  const isOpen = (h, day) => rules.isOpenOn(h, day);
  const user = { fcmToken: 't', tz: 'UTC' };
  const now = at('2026-11-25T20:10:00Z');                                              // Wednesday
  assert.equal(dueSlot(user, [habit({ pauses: [{ from: '2026-11-20' }] })], now, isOpen), null);
  assert.equal(dueSlot(user, [habit({ archivedAt: 1 })], now, isOpen), null);
  assert.equal(dueSlot(user, [habit({ startDate: '2026-12-01' })], now, isOpen), null);
  assert.equal(dueSlot(user, [habit({ frequency: 'weekly', schedule: { type: 'times', times: 2 }, completedDates: ['2026-11-23', '2026-11-24'] })], now, isOpen), null);
  assert.equal(dueSlot(user, [habit({ frequency: 'weekly', schedule: { type: 'times', times: 3 }, completedDates: ['2026-11-23', '2026-11-24'] })], now, isOpen), '2026-11-25-pm');
});

test('with the app\'s rules: an ordinary old habit is judged exactly as before', async () => {
  const rules = await loadRules();
  const isOpen = (h, day) => rules.isOpenOn(h, day);
  const user = { fcmToken: 't', tz: 'Africa/Lagos' };
  const now = at('2026-11-23T19:10:00Z');
  for (const h of [habit(), habit({ completedDates: ['2026-11-23'] }), habit({ frequency: 'weekly', completedDates: ['2026-11-23'] }), habit({ frequency: 'monthly', completedDates: ['2026-11-02'] }), habit({ frequency: 'monthly', completedDates: ['2026-10-30'] })])
    assert.equal(dueSlot(user, [h], now, isOpen), dueSlot(user, [h], now), JSON.stringify(h));
});

// ── A reminder time for each habit (roadmap 25) ──────────
const { dueReminders, reminderBody } = require('./reminder-logic');
const timed = (name, reminderHour, o = {}) => habit({ name, reminderHour, ...o });

test('timed: a habit is reminded in the hour chosen, in the user\'s own time zone', () => {
  const now = at('2026-11-23T06:10:00Z');                                    // 07:10 in Lagos, 15:10 in Tokyo
  assert.deepEqual(dueReminders({ fcmToken: 't', tz: 'Africa/Lagos' }, [timed('Stretch', 7)], now),
    { key: '2026-11-23-h07', field: 'lastTimedReminder', habitNames: ['Stretch'] });
  assert.equal(dueReminders({ fcmToken: 't', tz: 'Asia/Tokyo' }, [timed('Stretch', 7)], now), null);
  assert.deepEqual(dueReminders({ fcmToken: 't', tz: 'Asia/Tokyo' }, [timed('Tea', 15), timed('Stretch', 7), timed('Walk', 15)], now).habitNames, ['Tea', 'Walk']);
  assert.equal(dueReminders({ tz: 'Africa/Lagos' }, [timed('Stretch', 7)], now), null);                 // no token, no reminder
});

test('timed: never twice in the same hour, and a new hour is a new reminder', () => {
  const user = { fcmToken: 't', tz: 'UTC', lastTimedReminder: '2026-11-23-h15' };
  assert.equal(dueReminders(user, [timed('Tea', 15)], at('2026-11-23T15:40:00Z')), null);
  assert.equal(dueReminders(user, [timed('Tea', 15), timed('Walk', 16)], at('2026-11-23T16:05:00Z')).key, '2026-11-23-h16');
  assert.equal(dueReminders(user, [timed('Tea', 15)], at('2026-11-24T15:05:00Z')).key, '2026-11-24-h15');
});

test('timed: done, deleted, resting, paused, archived and not-started habits are left alone', async () => {
  const rules = await loadRules();
  const isOpen = (h, day) => rules.isOpenOn(h, day);
  const user = { fcmToken: 't', tz: 'UTC' };
  const now = at('2026-11-26T15:10:00Z');                                    // a Thursday
  const quiet = [
    timed('Done', 15, { completedDates: ['2026-11-26'] }),
    timed('Deleted', 15, { deletedAt: 1 }),
    timed('Rest day', 15, { schedule: { type: 'days', days: [1, 3, 5] } }),
    timed('Paused', 15, { pauses: [{ from: '2026-11-20' }] }),
    timed('Archived', 15, { archivedAt: 1 }),
    timed('Next month', 15, { startDate: '2026-12-01' }),
  ];
  assert.equal(dueReminders(user, quiet, now, isOpen), null);
  assert.deepEqual(dueReminders(user, [...quiet, timed('Open', 15)], now, isOpen).habitNames, ['Open']);
});

test('timed: habits without a time keep the morning and evening reminders, exactly as before', () => {
  const cases = [
    [{ fcmToken: 't', tz: 'Africa/Lagos' }, [habit()], '2026-11-23T19:10:00Z'],
    [{ fcmToken: 't', tz: 'Africa/Lagos' }, [habit()], '2026-11-23T07:10:00Z'],
    [{ fcmToken: 't', tz: 'Asia/Tokyo' }, [habit()], '2026-11-23T21:00:00Z'],
    [{ fcmToken: 't', tz: 'Africa/Lagos' }, [habit({ completedDates: ['2026-11-23'] })], '2026-11-23T19:10:00Z'],
    [{ fcmToken: 't', tz: 'Africa/Lagos', lastReminder: '2026-11-23-pm' }, [habit()], '2026-11-23T20:10:00Z'],
    [{ fcmToken: 't', tz: 'UTC' }, [habit({ deletedAt: 3 })], '2026-11-23T20:10:00Z'],
    [{ fcmToken: 't', tz: 'UTC' }, [], '2026-11-23T20:10:00Z'],
  ];
  for (const [user, habits, when] of cases) {
    const got = dueReminders(user, habits, at(when));
    assert.equal(got ? got.key : null, dueSlot(user, habits, at(when)), when);
    if (got) assert.deepEqual([got.field, got.habitNames], ['lastReminder', []]);
  }
});

test('timed: a habit with its own time is not also nagged in the general windows', () => {
  const user = { fcmToken: 't', tz: 'UTC' };
  assert.equal(dueReminders(user, [timed('Tea', 15)], at('2026-11-23T20:10:00Z')), null);             // evening window, but its time was 15:00
  assert.equal(dueReminders(user, [timed('Tea', 15), habit({ name: 'Read' })], at('2026-11-23T20:10:00Z')).key, '2026-11-23-pm');   // Read has no time
});

test('timed: the two kinds of reminder never make each other repeat', () => {
  const habits = [timed('Tea', 21), habit({ name: 'Read' })];
  // Evening reminder went at 20:00, Tea's at 21:00. At 22:00 nothing is left to send.
  assert.equal(dueReminders({ fcmToken: 't', tz: 'UTC', lastReminder: '2026-11-23-pm', lastTimedReminder: '2026-11-23-h21' }, habits, at('2026-11-23T22:10:00Z')), null);
  // Tea's went at 21:00 first; the evening one is still owed for Read.
  assert.equal(dueReminders({ fcmToken: 't', tz: 'UTC', lastTimedReminder: '2026-11-23-h21' }, habits, at('2026-11-23T22:10:00Z')).key, '2026-11-23-pm');
});

test('timed: an hour that is not a whole number from 0 to 23 counts as no time at all', () => {
  const user = { fcmToken: 't', tz: 'UTC' };
  for (const bad of [24, -1, 7.5, '15', null, NaN]) {
    assert.equal(dueReminders(user, [timed('Odd', bad)], at('2026-11-23T15:10:00Z')), null, String(bad));
    assert.equal(dueReminders(user, [timed('Odd', bad)], at('2026-11-23T20:10:00Z')).key, '2026-11-23-pm', String(bad));
  }
  assert.equal(dueReminders(user, [timed('Midnight', 0)], at('2026-11-23T00:10:00Z')).key, '2026-11-23-h00');
});

test('timed: the message names the habits, up to three', () => {
  assert.equal(reminderBody(['Stretch']), 'Time for Stretch.');
  assert.equal(reminderBody(['Stretch', 'Read']), 'Time for Stretch and Read.');
  assert.equal(reminderBody(['Stretch', 'Read', 'Walk']), 'Time for Stretch, Read and Walk.');
  assert.equal(reminderBody(['Stretch', 'Read', 'Walk', 'Tea']), 'Time for Stretch, Read and 2 more.');
  assert.equal(reminderBody(['A'.repeat(200)]).length <= 120, true);                                   // a very long name is cut, not sent whole
  assert.equal(reminderBody([]), null);
});
