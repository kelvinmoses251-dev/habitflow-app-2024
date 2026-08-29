const admin = require('firebase-admin');

// 1. Parse the Service Account Key from the Environment Variable
const serviceAccountKeyJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountKeyJson) {
  console.error("FATAL ERROR: FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountKeyJson);
} catch (err) {
  console.error("FATAL ERROR: Could not parse FIREBASE_SERVICE_ACCOUNT as JSON.", err);
  process.exit(1);
}

// 2. Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// Date Helpers
const todayStr = () => new Date().toISOString().split('T')[0];

function isSameWeek(ds) {
  const [y, m, d] = ds.split('-');
  const date = new Date(y, m - 1, d);
  const now = new Date(); now.setHours(0,0,0,0);
  const day = now.getDay() || 7;
  const start = new Date(now); start.setDate(start.getDate() - day + 1);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
  return date >= start && date <= end;
}

function isSameMonth(ds) {
  const [y, m] = ds.split('-');
  const now = new Date();
  return +y === now.getFullYear() && +(m) === now.getMonth() + 1;
}

const SASSY_MESSAGES = [
  "I dare you not to complete this habit you lazy dude",
  "Procrastination is the key to your destruction",
  "Success doesn't come by skipping daily habits",
  "Your future self is weeping right now. Get to it!",
  "Are you really going to let your streak die like this?",
  "Excuses don't build empires. Finish your habits!"
];

async function runReminders() {
  console.log('🔔 Starting daily habit reminder script...');
  try {
    // 3. Fetch all users
    const usersSnap = await db.collection('users').get();
    
    if (usersSnap.empty) {
      console.log('No users found in database.');
      return;
    }

    const messages = [];
    const t = todayStr();

    // 4. Fetch all habits to check completion status
    const habitsSnap = await db.collection('habits').get();
    const allHabits = habitsSnap.docs.map(d => d.data()).filter(h => !h.deletedAt);

    // 5. Loop through users and build notifications
    usersSnap.forEach(userDoc => {
      const fcmToken = userDoc.get('fcmToken');
      const uid = userDoc.id;
      
      // Skip if the user hasn't opted into notifications
      if (!fcmToken) return;

      // Find user's habits
      const userHabits = allHabits.filter(h => h.userId === uid);
      
      let hasIncompleteHabit = false;
      
      for (const h of userHabits) {
        let isDone = false;
        const freq = h.frequency || 'daily';
        
        if (freq === 'weekly') {
          isDone = (h.completedDates || []).some(isSameWeek);
        } else if (freq === 'monthly') {
          isDone = (h.completedDates || []).some(isSameMonth);
        } else {
          isDone = (h.completedDates || []).includes(t);
        }

        if (!isDone) {
          hasIncompleteHabit = true;
          break;
        }
      }

      // Only send a notification if they have an uncompleted habit
      if (hasIncompleteHabit) {
        const randomMessage = SASSY_MESSAGES[Math.floor(Math.random() * SASSY_MESSAGES.length)];
        
        const payload = {
          token: fcmToken,
          notification: {
            title: '⏰ Habit Tracker',
            body: randomMessage,
          },
          data: {
            click_action: 'FLUTTER_NOTIFICATION_CLICK' 
          }
        };

        messages.push(payload);
      }
    });

    if (messages.length === 0) {
      console.log('No users have push notifications enabled with incomplete habits.');
      return;
    }

    console.log(`Sending ${messages.length} notifications...`);
    
    // 6. Send all notifications in a batch
    const response = await messaging.sendEach(messages);
    
    console.log(`✅ Successfully sent ${response.successCount} messages.`);
    if (response.failureCount > 0) {
      console.error(`❌ Failed to send ${response.failureCount} messages.`);
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.error(`Error for token ${messages[idx].token}:`, resp.error);
        }
      });
    }

  } catch (err) {
    console.error("Error during reminder script:", err);
    process.exit(1);
  }
}

// Run the script
runReminders();
