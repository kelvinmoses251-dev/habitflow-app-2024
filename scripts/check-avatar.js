const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

async function checkAvatar() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`User ${doc.id} (${data.displayName || data.email}):`);
    console.log(`- has avatar field: ${!!data.avatar}`);
    if (data.avatar) {
      console.log(`- avatar length: ${data.avatar.length} chars`);
    }
  });
}

checkAvatar().catch(console.error);
