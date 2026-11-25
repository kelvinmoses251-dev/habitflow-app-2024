// Sends habit reminders. Run hourly by .github/workflows/daily-reminders.yml.
//
//   node send-reminders.js          send
//   node send-reminders.js --dry    show who would be reminded, send nothing
//
// Each user is reminded in their OWN morning (from 08:00) and evening (from 20:00), at most once per window,
// and only if a habit is still open on their local day. A habit with its own reminder hour is announced by name
// in that hour instead. The decisions live in reminder-logic.js (tested).

const admin = require('firebase-admin');
const { localParts, reminderSlot, dueReminders, reminderBody, buildMessage } = require('./reminder-logic');

const DRY = process.argv.includes('--dry');

const serviceAccountKeyJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountKeyJson) {
  console.error('FATAL ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is not set.');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountKeyJson);
} catch (err) {
  console.error('FATAL ERROR: Could not parse FIREBASE_SERVICE_ACCOUNT as JSON.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();

// Plain, useful reminders. Short, specific and never guilt-tripping.
const REMINDER_MESSAGES = [
  'You still have habits to complete today.',
  "A quick check-in: some of today's habits are still open.",
  "Keep your streak going. Complete today's habits.",
  "Today's habits only take a few minutes. Open Habitly to finish them.",
  'Your habits for today are waiting.',
];

// Tokens that will never work again: the browser unsubscribed or the app data was cleared.
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument']);

async function runReminders() {
  const now = new Date();
  // The app's own rules for what is due and done (an ES module in the project root, shared with the browser)
  const rules = await import('../habit-rules.js');
  const isOpen = (habit, day) => rules.isOpenOn(habit, day);
  // Only users who switched reminders on have a token.
  const usersSnap = await db.collection('users').where('fcmToken', '>', '').get();
  console.log(`${usersSnap.size} user(s) with reminders on.`);

  const due = [];
  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    // Cheap check first, so habits are only read for users who could be due right now: inside a reminder window,
    // or at an hour one of their habits asks for (the app keeps that list on the profile as reminderHours).
    const hour = localParts(now, user.tz).hour;
    const timedHours = Array.isArray(user.reminderHours) ? user.reminderHours : [];
    if (!reminderSlot(hour) && !timedHours.includes(hour) && !timedHours.includes(hour - 1)) continue;   // the hour before too: a late run still delivers
    const habitsSnap = await db.collection('habits').where('userId', '==', userDoc.id).get();
    const hit = dueReminders(user, habitsSnap.docs.map(d => d.data()), now, isOpen);
    if (hit) due.push({ ref: userDoc.ref, token: user.fcmToken, slot: hit.key, marks: hit.marks, body: reminderBody(hit.habitNames, hit.more) });
  }

  if (!due.length) { console.log('Nobody is due a reminder this hour.'); return; }
  console.log(`${due.length} reminder(s) due.`);
  if (DRY) { due.forEach(d => console.log(`  would remind ${d.ref.id} for ${d.slot}`)); return; }

  const messages = due.map(d => buildMessage(d.token, d.body || REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)]));
  let sent = 0, failed = 0, removed = 0;
  for (let i = 0; i < messages.length; i += 500) {                       // sendEach accepts at most 500
    const res = await messaging.sendEach(messages.slice(i, i + 500));
    await Promise.all(res.responses.map((r, j) => {
      const d = due[i + j];
      if (r.success) { sent++; return d.ref.set(d.marks, { merge: true }); }
      failed++;
      const code = r.error && r.error.code;
      console.error(`  failed for ${d.ref.id}: ${code}`);                 // never log the token itself
      if (DEAD_TOKEN.has(code)) { removed++; return d.ref.update({ fcmToken: admin.firestore.FieldValue.delete() }); }
      return null;
    }));
  }
  console.log(`Sent ${sent}, failed ${failed}, dead tokens removed ${removed}.`);
}

runReminders().catch(err => {
  console.error('Error during reminder script:', err);
  process.exit(1);
});
