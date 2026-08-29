// functions/index.js – Cloud Function to send daily habit reminder via FCM
// Deploy with: firebase deploy --only functions

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp(); // ✅ Fixed: was "admind.initializeApp()" (typo)

/**
 * Scheduled function that runs once per day at 09:00 UTC.
 * Adjust the cron expression if you need a different time.
 */
exports.dailyHabitReminder = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Etc/UTC')
  .onRun(async (context) => {
    // Query Firestore for all users that have a stored FCM token
    const db       = admin.firestore();
    const usersSnap = await db
      .collection('users')
      .where('fcmToken', '!=', null)
      .get();

    const tokens = [];
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) tokens.push(data.fcmToken);
    });

    if (tokens.length === 0) {
      console.log('No user tokens found – no notifications sent.');
      return null;
    }

    const message = {
      notification: {
        title: '💪 Your Daily Habit Reminder',
        // ✅ Fixed: apostrophe inside single-quoted string broke the syntax.
        // Now using a template literal so apostrophes are safe.
        body: `Check your habit tracker and mark today's progress!`
      },
      data: {
        click_action: 'OPEN_HABIT_TRACKER'
      },
      tokens
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(
        `Notifications sent: ${response.successCount} success, ${response.failureCount} failure(s).`
      );
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) failedTokens.push(tokens[idx]);
        });
        console.warn('Failed tokens:', failedTokens);
      }
    } catch (error) {
      console.error('Error sending push notifications:', error);
    }

    return null;
  });
