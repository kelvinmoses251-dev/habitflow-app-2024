// Pure decision logic for reminders (no Firebase), so it can be tested: node --test scripts/reminder-logic.test.js
//
// The app stores completions as the user's LOCAL calendar day ("YYYY-MM-DD"), so the server has to judge
// "done today?" and "is it reminder time?" in each user's own timezone (users/{uid}.tz, saved by the app).

// Reminder windows in the user's local time: [startHour, endHour). The job runs hourly; a window is three
// hours wide so a late or skipped run still delivers, and `lastReminder` stops a second send in the same window.
const WINDOWS = { am: [8, 11], pm: [20, 23] };

function localParts(now, tz) {
  const read = timeZone => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    const get = type => parts.find(p => p.type === type).value;
    return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: +get('hour') };
  };
  try { return read(tz || 'UTC'); } catch (_) { return read('UTC'); }
}

function reminderSlot(hour) {
  for (const [slot, [from, to]] of Object.entries(WINDOWS)) if (hour >= from && hour < to) return slot;
  return null;
}

// Day strings are compared as plain calendar dates (UTC arithmetic on a date with no time is timezone-safe).
const dayNumber = day => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

function isHabitDone(habit, now, tz) {
  const today = localParts(now, tz).day;
  const dates = habit.completedDates || [];
  const freq = habit.frequency || 'daily';
  if (freq === 'monthly') return dates.some(d => d.slice(0, 7) === today.slice(0, 7));
  if (freq === 'weekly') {
    const n = dayNumber(today);
    const weekday = (new Date(n * 86400000).getUTCDay() + 6) % 7;      // Monday = 0, as in the app
    const monday = n - weekday;
    return dates.some(d => { const x = dayNumber(d); return x >= monday && x <= monday + 6; });
  }
  return dates.includes(today);
}

// Returns the slot key to send for (e.g. "2026-11-23-pm"), or null when no reminder should go out now.
// `isOpen(habit, day)` is the app's own rule for "still something to do today" (habit-rules.js, passed in by
// send-reminders.js), so schedules, pauses, dates and targets are judged exactly as the app judges them.
// Without it, the simple built-in check below is used.
function dueSlot(user, habits, now, isOpen) {
  if (!user || !user.fcmToken) return null;
  const { day, hour } = localParts(now, user.tz);
  const slot = reminderSlot(hour);
  if (!slot) return null;
  const key = `${day}-${slot}`;
  if (user.lastReminder === key) return null;
  const stillOpen = isOpen ? h => isOpen(h, day) : h => !isHabitDone(h, now, user.tz);
  const open = (habits || []).filter(h => !h.deletedAt).some(stillOpen);
  return open ? key : null;
}

// A habit may carry its own reminder hour (0 to 23, the user's local time). Anything else means "no time of its own".
const hasHour = h => Number.isInteger(h.reminderHour) && h.reminderHour >= 0 && h.reminderHour <= 23;

// What to send this user right now, or null. Two kinds, each remembered in its own field so that neither can
// make the other repeat:
//   - habits with their own hour: one message in that hour naming them  (key "2026-11-23-h07", field lastTimedReminder)
//   - every other habit: the morning and evening windows, as before     (key "2026-11-23-pm",  field lastReminder)
// A habit with its own hour is never also chased in the general windows.
function dueReminders(user, habits, now, isOpen) {
  if (!user || !user.fcmToken) return null;
  const { day, hour } = localParts(now, user.tz);
  const stillOpen = isOpen ? h => isOpen(h, day) : h => !isHabitDone(h, now, user.tz);
  const live = (habits || []).filter(h => h && !h.deletedAt);

  // The general windows, for the habits that have no hour of their own
  const slot = reminderSlot(hour);
  const windowKey = slot ? `${day}-${slot}` : null;
  const windowDue = !!windowKey && user.lastReminder !== windowKey && live.filter(h => !hasHour(h)).some(stillOpen);

  // Habits with their own hour. The job is scheduled hourly but a run can start late or be dropped, so the hour
  // before is still honoured if nothing was sent for it. The key remembered is always the current hour's, and
  // keys of one day sort in time order, so "already sent" is a plain comparison.
  const hourKey = h => `${day}-h${String(h).padStart(2, '0')}`;
  const last = typeof user.lastTimedReminder === 'string' ? user.lastTimedReminder : '';
  const owed = [hour - 1, hour].filter(h => h >= 0 && !(last.startsWith(day) && last >= hourKey(h)));
  const names = live.filter(h => hasHour(h) && owed.includes(h.reminderHour) && stillOpen(h))
    .sort((a, b) => a.reminderHour - b.reminderHour).map(h => String(h.name || 'your habit'));
  if (names.length) {
    // One notification. If the general reminder is due in this same run it rides along, and both are marked sent,
    // so timed habits in every hour of a window can never crowd it out.
    const marks = { lastTimedReminder: hourKey(hour) };
    if (windowDue) marks.lastReminder = windowKey;
    return { key: hourKey(hour), field: 'lastTimedReminder', habitNames: names, more: windowDue, marks };
  }
  return windowDue ? { key: windowKey, field: 'lastReminder', habitNames: [], more: false, marks: { lastReminder: windowKey } } : null;
}

// "Time for Stretch, Read and 2 more." Up to three names; a long name is cut so the notification stays short.
function reminderBody(names, more) {
  const body = namedBody(names);
  return body && more ? body + ' Your other habits are still open too.' : body;
}
function namedBody(names) {
  const list = (names || []).map(n => (n.length > 40 ? n.slice(0, 39).trimEnd() + '…' : n));
  if (!list.length) return null;
  if (list.length === 1) return `Time for ${list[0]}.`;
  if (list.length <= 3) return `Time for ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}.`;
  return `Time for ${list[0]}, ${list[1]} and ${list.length - 2} more.`;
}

// Data-only on purpose: with a `notification` block the Firebase SDK shows one notification itself and the
// service worker shows another. The service worker (firebase-messaging-sw.js) displays this payload once.
function buildMessage(token, body) {
  return { token, data: { title: 'Habitly', body, url: '/' }, webpush: { headers: { Urgency: 'normal', TTL: '7200' } } };
}

module.exports = { localParts, reminderSlot, isHabitDone, dueSlot, dueReminders, reminderBody, buildMessage };
