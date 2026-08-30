// firebase-messaging-sw.js – handles background push notifications
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// ✅ Config inlined directly — importScripts cannot load ES modules (export/import),
// so we cannot use importScripts('firebase-config.js') which uses `export const`.
const firebaseConfig = {
  apiKey:            "AIzaSyDG0cS8uxLPMNc76Rws4NMuIeQBO85p04w",
  authDomain:        "habit-tracker-demo-34c0a.firebaseapp.com",
  projectId:         "habit-tracker-demo-34c0a",
  storageBucket:     "habit-tracker-demo-34c0a.firebasestorage.app",
  messagingSenderId: "1011289539803",
  appId:             "1:1011289539803:web:a2e9fe1d07e72d6b35f8fe",
  measurementId:     "G-Y7M3MN6ZZN"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message received:', payload);

  const notificationTitle = payload.notification?.title || '💪 Habit Reminder';
  const notificationOptions = {
    body: payload.notification?.body || 'Time to check your habits for today!',
    icon: '/icons/icon-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Required for PWA installability (a fetch listener)
self.addEventListener('fetch', (event) => {
  // We can just fall back to network for now without aggressive caching
  event.respondWith(fetch(event.request).catch(() => {
    // Offline fallback if needed
  }));
});
