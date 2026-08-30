// app.js – Habitly v1.0 — Full SPA Logic

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, updateProfile,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, getAdditionalUserInfo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, where,
  onSnapshot, deleteDoc, doc, setDoc, updateDoc, getDoc,
  arrayUnion, arrayRemove, getDocs, orderBy, limit, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref, uploadString, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { firebaseConfig } from "./firebase-config.js";

// ── Firebase Init ────────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);

// ── Dark Mode Init ───────────────────────────────────────
if (localStorage.getItem('theme') === 'dark') {
  document.body.setAttribute('data-theme', 'dark');
}

// ── Audio Synthesizers ─────────────────────────────────────
const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && AudioCtxClass) {
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Bouncy, satisfying checkbox check sound
function playPop() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.09);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  } catch (e) {
    console.warn('playPop error:', e);
  }
}

// Soft untick sound
function playUncheck() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  } catch (e) {
    console.warn('playUncheck error:', e);
  }
}

// Full Celebration Chime (Joyful Major Arpeggio C5 -> E5 -> G5 -> C6 -> E6)
function playChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
    const startNow = ctx.currentTime;

    notes.forEach((freq, i) => {
      const noteTime = startNow + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.3, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.65);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.7);
    });
  } catch (e) {
    console.warn('playChime error:', e);
  }
}

const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);
storage.maxUploadRetryTime = 5000;
let   messaging;
try { messaging = getMessaging(firebaseApp); } catch (_) { /* not supported */ }

// ── Icons (Lucide) ───────────────────────────────────────
const icons = {
  health: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  mind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  social: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  growth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m15 9-6 6"/><path d="M9 9h6v6"/></svg>',
  productive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  nutrition: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  fitness: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m18 11 2 2v5h-5l-2-2"/><path d="m6 11-2 2v5h5l2-2"/><path d="M2 13v-2l5-5h10l5 5v2"/></svg>',
  reading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  saving: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  relaxation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>'
};

// ── Categories ───────────────────────────────────────────
const CATS = {
  health:     { label: 'Health',     emoji: icons.health, color: '#DC2626', bg: '#FFF0F0' },
  mind:       { label: 'Mind',       emoji: icons.mind, color: '#4361EE', bg: '#EEF0FF' },
  social:     { label: 'Social',     emoji: icons.social, color: '#EA580C', bg: '#FFF4ED' },
  growth:     { label: 'Growth',     emoji: icons.growth, color: '#16A34A', bg: '#F0FDF4' },
  productive: { label: 'Productive', emoji: icons.productive, color: '#CA8A04', bg: '#FEFCE8' },
  nutrition:  { label: 'Nutrition',  emoji: icons.nutrition, color: '#059669', bg: '#ECFDF5' },
  fitness:    { label: 'Fitness',    emoji: icons.fitness, color: '#7C3AED', bg: '#F5F3FF' },
  reading:    { label: 'Reading',    emoji: icons.reading, color: '#0891B2', bg: '#ECFEFF' },
  saving:     { label: 'Saving',     emoji: icons.saving, color: '#B45309', bg: '#FEF3C7' },
  relaxation: { label: 'Relaxation', emoji: icons.relaxation, color: '#7E22CE', bg: '#FAF5FF' },
  project:    { label: 'Project',    emoji: icons.project, color: '#475569', bg: '#F1F5F9' },
};

// ── State ─────────────────────────────────────────────────
let currentUser  = null;
let allHabits    = [];
let weeklyChart  = null;
let catChart     = null;
let unsubHabits  = null;
let routerReady  = false;

// ── Date Helpers ─────────────────────────────────────────
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDisplayDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getFirstName(user) {
  const n = user.displayName || user.email || 'there';
  return n.split(' ')[0].split('@')[0];
}

// ── Stats Helpers ─────────────────────────────────────────
function calcStreak(habits) {
  // Global max streak across all individual habits
  if (!habits || !habits.length) return 0;
  return Math.max(...habits.map(calcHabitStreak));
}

function calcHabitStreak(habit) {
  const dates = new Set(habit.completedDates || []);
  let streak = 0;
  const d = new Date();
  
  if (!dates.has(todayStr())) d.setDate(d.getDate() - 1);
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (dates.has(ds)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function getUserBadge(maxStreak) {
  if (maxStreak >= 365) return { name: 'Legend', icon: '🌌', color: '#6366f1', c1: '#818cf8', c2: '#312e81', cb: '#a5b4fc' };
  if (maxStreak >= 200) return { name: 'Ascended', icon: '☄️', color: '#8b5cf6', c1: '#c084fc', c2: '#581c87', cb: '#e879f9' };
  if (maxStreak >= 100) return { name: 'Mystic', icon: '🔮', color: '#a855f7', c1: '#d8b4fe', c2: '#6b21a8', cb: '#f3e8ff' };
  if (maxStreak >= 60)  return { name: 'Diamond', icon: '💎', color: '#0ea5e9', c1: '#7dd3fc', c2: '#0369a1', cb: '#e0f2fe' };
  if (maxStreak >= 30)  return { name: 'Master', icon: '👑', color: '#eab308', c1: '#fde047', c2: '#a16207', cb: '#fef08a' };
  if (maxStreak >= 21)  return { name: 'Gold', icon: '🥇', color: '#f59e0b', c1: '#fcd34d', c2: '#b45309', cb: '#fef3c7' };
  if (maxStreak >= 14)  return { name: 'Silver', icon: '🥈', color: '#9ca3af', c1: '#d1d5db', c2: '#4b5563', cb: '#f3f4f6' };
  if (maxStreak >= 7)   return { name: 'Bronze', icon: '🥉', color: '#b45309', c1: '#fdba74', c2: '#9a3412', cb: '#ffedd5' };
  if (maxStreak >= 3)   return { name: 'Sprout', icon: '🌿', color: '#22c55e', c1: '#86efac', c2: '#166534', cb: '#dcfce3' };
  return { name: 'Seedling', icon: '🌱', color: '#84cc16', c1: '#bef264', c2: '#3f6212', cb: '#ecfccb' };
}

function calcTotalDone(habits) {
  return habits.reduce((s, h) => s + (h.completedDates?.length || 0), 0);
}

function getWeeklyData(habits) {
  const labels = [], counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
    counts.push(habits.filter(h => (h.completedDates || []).includes(ds)).length);
  }
  return { labels, counts };
}

// ── Toast ─────────────────────────────────────────────────
function toast(msg, type = 'info', ms = 3500) {
  const tc = document.getElementById('toast-container');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

// ── Loading ───────────────────────────────────────────────
function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (!ls) return;
  ls.classList.add('fade-out');
  setTimeout(() => ls.remove(), 450);
}

// ── Onboarding ────────────────────────────────────────────
function initOnboarding(force = false) {
  if (!currentUser && !force) return;
  const userKey = currentUser ? 'habitly_seen_' + currentUser.uid : 'habitly_seen';
  if (!force && localStorage.getItem(userKey)) return;

  const ob = document.getElementById('onboarding');
  if (!ob) return;
  ob.classList.remove('hidden');
  ob.style.opacity = '1';
  const slides = [...ob.querySelectorAll('.slide')];
  const dots   = [...ob.querySelectorAll('.dot')];
  const next   = document.getElementById('onboarding-next');
  const skip   = document.getElementById('onboarding-skip');
  let cur      = 0;

  // Reset to first slide
  slides.forEach((s, idx) => s.classList.toggle('active', idx === 0));
  dots.forEach((d, idx) => d.classList.toggle('active', idx === 0));
  if (next) next.textContent = slides.length === 1 ? 'Get Started 🚀' : 'Next →';

  function go(i) {
    if (slides[cur]) slides[cur].classList.remove('active');
    if (dots[cur]) dots[cur].classList.remove('active');
    cur = i;
    if (slides[cur]) slides[cur].classList.add('active');
    if (dots[cur]) dots[cur].classList.add('active');
    if (next) next.textContent = cur === slides.length - 1 ? 'Get Started 🚀' : 'Next →';
    // Haptic pulse on slide change
    if (navigator.vibrate) navigator.vibrate(30);
  }

  dots.forEach(d => {
    d.onclick = () => go(+d.dataset.dot);
  });
  if (next) next.onclick = () => (cur < slides.length - 1 ? go(cur + 1) : done());
  if (skip) skip.onclick = done;

  function done() {
    if (currentUser) {
      localStorage.setItem('habitly_seen_' + currentUser.uid, '1');
    } else {
      localStorage.setItem('habitly_seen', '1');
    }
    ob.style.transition = 'opacity .35s ease';
    ob.style.opacity = '0';
    setTimeout(() => ob.classList.add('hidden'), 380);
  }
}

// ── All-Done Celebration ──────────────────────────────────
let isCelebrating = false;

function checkAllDone(justCompletedId = null) {
  const today = todayStr();
  const dailyHabits = allHabits.filter(h => !h.frequency || h.frequency === 'daily');
  if (dailyHabits.length === 0) return;

  const allDone = dailyHabits.every(h => {
    const dates = h.completedDates || [];
    if (dates.includes(today)) return true;
    if (justCompletedId && h.id === justCompletedId) return true;
    return false;
  });

  if (!allDone) {
    sessionStorage.removeItem('allDoneCelebrated');
    return;
  }

  // Prevent multiple overlapping triggers in the same moment
  if (isCelebrating) return;
  isCelebrating = true;
  sessionStorage.setItem('allDoneCelebrated', today);

  setTimeout(() => {
    playChime();
    const overlay = document.getElementById('all-done-overlay');
    if (overlay) overlay.classList.remove('hidden');

    // Mega confetti blast!
    if (window.confetti) {
      const end = Date.now() + 2500;
      const colors = ['#7c3aed', '#a78bfa', '#f59e0b', '#10b981', '#3b82f6', '#ec4899'];
      (function frame() {
        window.confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors });
        window.confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    }
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
    setTimeout(() => { isCelebrating = false; }, 3000);
  }, 400);
}

// Overlay dismiss listeners
const allDoneOverlay = document.getElementById('all-done-overlay');
if (allDoneOverlay) {
  allDoneOverlay.addEventListener('click', (e) => {
    const closeBtn = document.getElementById('all-done-close');
    if (e.target === allDoneOverlay || e.target === closeBtn || (closeBtn && closeBtn.contains(e.target))) {
      allDoneOverlay.classList.add('hidden');
    }
  });
}

// ── Router ────────────────────────────────────────────────
function initRouter() {
  if (routerReady) return;
  routerReady = true;

  const pages  = document.querySelectorAll('.page');
  const links  = document.querySelectorAll('.nav-link');
  const bnItems = document.querySelectorAll('.bn-item');

  function navigate(page) {
    page = page || 'home';
    pages.forEach(p => {
      const active = p.id === `page-${page}`;
      p.classList.toggle('active', active);
    });
    links.forEach(l    => l.classList.toggle('active', l.dataset.page === page));
    bnItems.forEach(b  => b.classList.toggle('active', b.dataset.page === page));
    if (page === 'stats')   renderStats();
    if (page === 'profile') renderProfile();
  }

  window.addEventListener('hashchange', () => navigate(location.hash.replace('#', '')));
  navigate(location.hash.replace('#', '') || 'home');
}

// ── Confetti ────────────────────────────────────────────────
function fireConfetti() {
  if (window.confetti) {
    window.confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#8b5cf6', '#a78bfa', '#d8b4fe', '#fbcfe8'] // Brand colors
    });
  }
}

// ── Auth ──────────────────────────────────────────────────
// Handle redirect sign-in result (if user was redirected on mobile/webview)
getRedirectResult(auth).then(cred => {
  if (cred) {
    const details = getAdditionalUserInfo(cred);
    if (details && details.isNewUser) {
      fireConfetti();
    }
  }
}).catch(err => {
  if (err.code !== 'auth/credential-already-in-use') {
    console.warn('Redirect sign-in error:', err);
  }
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    const details = getAdditionalUserInfo(cred);
    if (details && details.isNewUser) {
      fireConfetti();
    }
  } catch (e) {
    // If popup is blocked by mobile browser or webview, fall back to redirect
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectErr) {
        toast('Sign-in failed: ' + redirectErr.message, 'error');
      }
    } else {
      toast('Sign-in failed: ' + e.message, 'error');
    }
  }
});

const emailForm = document.getElementById('email-auth-form');
const emailInput = document.getElementById('auth-email');
const passInput = document.getElementById('auth-password');
const signupBtn = document.getElementById('email-signup-btn');
const signinBtn = document.getElementById('email-signin-btn');

emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const pass = passInput.value;
  if (!email || !pass) return;
  
  signinBtn.disabled = true; signinBtn.textContent = 'Signing in...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    emailForm.reset();
  } catch (e) {
    toast('Sign-in failed: ' + e.message, 'error');
  } finally {
    signinBtn.disabled = false; signinBtn.textContent = 'Sign In';
  }
});

signupBtn.addEventListener('click', async () => {
  if (!emailForm.checkValidity()) {
    emailForm.reportValidity();
    return;
  }
  const email = emailInput.value.trim();
  const pass = passInput.value;
  if (!email || !pass) return;

  signupBtn.disabled = true; signupBtn.textContent = 'Signing up...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    // Optionally set a default display name from the email prefix
    const name = email.split('@')[0];
    await updateProfile(cred.user, { displayName: name });
    emailForm.reset();
    toast('Account created successfully! 🎉', 'success');
    fireConfetti();
  } catch (e) {
    toast('Sign-up failed: ' + e.message, 'error');
  } finally {
    signupBtn.disabled = false; signupBtn.textContent = 'Sign Up';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (unsubHabits) { unsubHabits(); unsubHabits = null; }
  allHabits = []; routerReady = false;
  await signOut(auth);
  toast('Signed out. See you soon! 👋');
});

onAuthStateChanged(auth, async user => {
  hideLoading();
  if (user) {
    currentUser = user;
    showApp();
    updateAvatars(user);
    subscribeToHabits();
    await requestNotificationPermission();
  } else {
    currentUser = null;
    allHabits = [];
    showAuth();
  }
});

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  const appEl = document.getElementById('app');
  appEl.classList.remove('hidden');

  // Greeting
  document.getElementById('greeting-time').textContent = getGreeting();
  document.getElementById('greeting-name').textContent = getFirstName(currentUser) + '!';
  document.getElementById('today-date').textContent    = formatDisplayDate();

  initOnboarding();
  initRouter();
}

function showAuth() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
}

let userProfileUnsubscribe = null;

function updateAvatars(user) {
  if (userProfileUnsubscribe) {
    userProfileUnsubscribe();
  }

  const navAva  = document.getElementById('nav-avatar');
  const navInit = document.getElementById('nav-initials');
  const profAva = document.getElementById('profile-avatar');
  const profInit= document.getElementById('profile-initials');

  const name = user.displayName || '';
  const parts = name.trim().split(' ');
  const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');

  userProfileUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
    let photoURL = user.photoURL;
    if (docSnap.exists() && docSnap.data().avatar) {
      photoURL = docSnap.data().avatar;
    }
    
    if (photoURL) {
      [navAva, profAva].forEach(el => { el.src = photoURL; el.classList.remove('hidden'); });
      [navInit, profInit].forEach(el => el.classList.add('hidden'));
    } else {
      [navAva, profAva].forEach(el => el.classList.add('hidden'));
      [navInit, profInit].forEach(el => {
        el.textContent = initials.toUpperCase() || '?';
        el.classList.remove('hidden');
      });
    }
  }, (err) => {
    console.warn("Could not fetch custom avatar from Firestore", err);
  });
}

// ── Profile Picture Cropper ───────────────────────────────
let cropper = null;
const cropModal = document.getElementById('crop-modal');
const cropImg = document.getElementById('crop-image');

document.getElementById('ava-upload-trigger').addEventListener('click', () => {
  document.getElementById('ava-upload-input').click();
});

document.getElementById('ava-upload-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    cropImg.src = e.target.result;
    cropModal.classList.remove('hidden');
    if (cropper) cropper.destroy();
    cropper = new Cropper(cropImg, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: false,
      cropBoxResizable: false,
      toggleDragModeOnDblclick: false,
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById('crop-cancel').addEventListener('click', () => {
  cropModal.classList.add('hidden');
  if (cropper) cropper.destroy();
  document.getElementById('ava-upload-input').value = '';
});

document.getElementById('crop-save').addEventListener('click', async () => {
  if (!cropper || !currentUser) return;
  const btn = document.getElementById('crop-save');
  btn.disabled = true; btn.textContent = 'Saving...';
  
  try {
    // Scale down drastically to keep the base64 string tiny
    const canvas = cropper.getCroppedCanvas({ width: 120, height: 120 });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    // Bypass Firebase Storage and Auth Limits and save directly to Firestore
    const userRef = doc(db, 'users', currentUser.uid);
    await setDoc(userRef, { avatar: dataUrl }, { merge: true });
    
    toast('Profile picture updated!', 'success');
    
    cropModal.classList.add('hidden');
    cropper.destroy();
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Picture';
    document.getElementById('ava-upload-input').value = '';
  }
});


// ── Firestore CRUD ────────────────────────────────────────
async function addHabit(name, category, frequency) {
  if (!currentUser) return;
  await addDoc(collection(db, 'habits'), {
    userId:         currentUser.uid,
    name,
    category,
    frequency:      frequency || 'daily',
    completedDates: [],
    createdAt:      new Date().toISOString(),
    order:          Date.now()
  });
}

async function deleteHabit(id) {
  await updateDoc(doc(db, 'habits', id), {
    deletedAt: Date.now()
  });
}

async function restoreHabit(id) {
  await updateDoc(doc(db, 'habits', id), {
    deletedAt: null
  });
}

async function toggleHabit(id, currentlyDone, dateToRemove) {
  const d = dateToRemove || todayStr();
  const habitRef = doc(db, 'habits', id);
  const now = Date.now();

  if (currentlyDone) {
    // Check if habit is locked (> 1 hour old)
    const h = allHabits.find(x => x.id === id);
    if (h) {
      const completionTime = h.completedTimestamps?.[d];
      if (completionTime && (now - completionTime > 3600000)) {
        toast('🔒 Habit is locked! Cannot be unchecked after 1 hour.', 'warning');
        return false;
      }
      if (!completionTime && d !== todayStr()) {
        toast('🔒 Habit is locked! Past completions cannot be unchecked.', 'warning');
        return false;
      }
    }

    const updatePayload = {
      completedDates: arrayRemove(d)
    };
    if (h && h.completedTimestamps && h.completedTimestamps[d]) {
      updatePayload[`completedTimestamps.${d}`] = deleteField();
    }
    await updateDoc(habitRef, updatePayload);
  } else {
    // Checking the habit
    await updateDoc(habitRef, {
      completedDates: arrayUnion(d),
      [`completedTimestamps.${d}`]: now
    });
  }
  return true;
}

let deletedHabits = []; // Stores soft-deleted habits

function subscribeToHabits() {
  if (unsubHabits) unsubHabits();
  const q = query(collection(db, 'habits'), where('userId', '==', currentUser.uid));
  unsubHabits = onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allHabits = [];
    deletedHabits = [];
    const now = Date.now();
    
    all.forEach(h => {
      if (h.deletedAt) {
        // If it's been in the trash for > 1 hour (3600000 ms), permanently delete
        if (now - h.deletedAt > 3600000) {
          deleteDoc(doc(db, 'habits', h.id)).catch(console.error);
        } else {
          deletedHabits.push(h);
        }
      } else {
        allHabits.push(h);
      }
    });

    renderHabits();
    updateStreak();
    syncUserStats();
    if (location.hash === '#stats') renderStats();
    if (location.hash === '#profile') renderProfile();
    if (!document.getElementById('recovery-modal').classList.contains('hidden')) {
      renderDeletedHabits();
    }
  });
}

// ── Render: Home ──────────────────────────────────────────
function renderHabits() {
  const list  = document.getElementById('habits');
  const empty = document.getElementById('empty-state');
  const t     = todayStr();

  list.innerHTML = '';

  if (!allHabits.length) {
    empty.classList.remove('hidden');
    updateProgress(0, 0);
    return;
  }
  empty.classList.add('hidden');

  // Sort logic
  const smartSortEnabled = localStorage.getItem('smartSort') !== 'false';
  const sorted = [...allHabits].sort((a, b) => {
    const aOrder = a.order || 0;
    const bOrder = b.order || 0;
    if (smartSortEnabled) {
      const aDone = (a.completedDates || []).includes(t);
      const bDone = (b.completedDates || []).includes(t);
      if (aDone !== bDone) return aDone - bDone;
    }
    return aOrder - bOrder;
  });

  let done = 0;
  sorted.forEach(h => {
    let isDone = false;
    let completedDateForToggle = t;
    const freq = h.frequency || 'daily';
    
    if (freq === 'weekly') {
      isDone = (h.completedDates || []).some(isSameWeek);
      completedDateForToggle = (h.completedDates || []).find(isSameWeek) || t;
    } else if (freq === 'monthly') {
      isDone = (h.completedDates || []).some(isSameMonth);
      completedDateForToggle = (h.completedDates || []).find(isSameMonth) || t;
    } else {
      isDone = (h.completedDates || []).includes(t);
    }
    
    if (isDone) done++;
    const cat = CATS[h.category] || CATS.health;

    // Check if habit was created in the last 1 hour
    const nowMs = Date.now();
    const createdMs = h.createdAt ? new Date(h.createdAt).getTime() : 0;
    const isEditable = (nowMs - createdMs) <= 60 * 60 * 1000;

    // Check if completion is locked (> 1 hour after checking)
    let isLocked = false;
    if (isDone) {
      const completionTime = h.completedTimestamps?.[completedDateForToggle];
      if (completionTime) {
        isLocked = (nowMs - completionTime) > 3600000;
      } else if (completedDateForToggle !== t) {
        isLocked = true;
      }
    }

    const habitStreak = calcHabitStreak(h);
    
    const li = document.createElement('li');
    li.className = 'habit-item';
    li.dataset.id = h.id;
    li.innerHTML = `
      <div class="habit-label">
        <input type="checkbox" class="habit-check" data-id="${h.id}" data-date="${completedDateForToggle}" ${isDone ? 'checked' : ''} ${isLocked ? 'data-locked="1"' : ''} />
        <div class="habit-meta" data-action="details" data-id="${h.id}" style="cursor: pointer;">
          <span class="habit-name ${isDone ? 'done' : ''}">${escHtml(h.name)}</span>
          <div class="badges-row">
            <span class="cat-badge" style="color:${cat.color};background:${cat.bg}">${cat.emoji} ${cat.label}</span>
            ${freq !== 'daily' ? '<span class="freq-badge">' + freq + '</span>' : ''}
            ${habitStreak > 0 ? '<span class="streak-pill">🔥 ' + habitStreak + '</span>' : ''}
            ${isLocked ? '<span class="locked-badge" title="Completed & locked (cannot uncheck after 1 hr)">🔒 Locked</span>' : ''}
          </div>
        </div>
      </div>
      <div class="habit-actions">
        <button class="btn-icon" data-id="${h.id}" data-action="timer" title="Start Focus Timer">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button>
        ${isEditable ?
        '<button class="btn-icon" data-id="' + h.id + '" data-action="edit" title="Edit habit">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
        '</button>'
        : ''}
        <button class="btn-icon" data-id="${h.id}" data-action="delete" title="Remove habit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
        </button>
      </div>`;
    list.appendChild(li);
  });

  updateProgress(done, allHabits.length);
}

function updateProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progress-fill').style.width  = pct + '%';
  document.getElementById('progress-label').textContent = `${done} / ${total}`;
}

let previousMaxStreak = null;

function updateStreak() {
  const maxStreak = calcStreak(allHabits);
  document.getElementById('greeting-streak').textContent = maxStreak;
  
  // Update badge UI
  const badge = getUserBadge(maxStreak);
  
  // Level up logic!
  if (previousMaxStreak !== null && maxStreak > previousMaxStreak) {
    const oldBadge = getUserBadge(previousMaxStreak);
    if (badge.name !== oldBadge.name) {
      toast(`Level Up! You earned the ${badge.name} Badge! ${badge.icon}`, 'success', 5000);
      playChime();
      fireConfetti();
    }
  }
  previousMaxStreak = maxStreak;
  
  const headerIcon = document.getElementById('header-badge');
  if (headerIcon) {
    headerIcon.textContent = badge.icon;
    headerIcon.title = badge.name + ' Badge';
    headerIcon.className = 'badge-icon-3d';
    headerIcon.style.setProperty('--c1', badge.c1);
    headerIcon.style.setProperty('--c2', badge.c2);
    headerIcon.style.setProperty('--cb', badge.cb);
  }
  
  const profileIcon = document.getElementById('profile-badge-icon');
  if (profileIcon) {
    profileIcon.textContent = badge.icon;
    profileIcon.className = 'badge-icon-3d';
    profileIcon.style.setProperty('--c1', badge.c1);
    profileIcon.style.setProperty('--c2', badge.c2);
    profileIcon.style.setProperty('--cb', badge.cb);
  }
  
  const profileName = document.getElementById('profile-badge-name');
  if (profileName) {
    profileName.textContent = badge.name + ' Badge';
    profileName.style.color = badge.color;
  }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Habit Form ────────────────────────────────────────────
document.getElementById('habit-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name     = document.getElementById('habit-input').value.trim();
  const category = document.getElementById('habit-category').value;
  const freqEl   = document.getElementById('habit-frequency');
  const frequency = freqEl ? freqEl.value : 'daily';
  if (!name) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Adding…';
  
  try {
    await addHabit(name, category, frequency);
    document.getElementById('habit-input').value = '';
    toast('Habit added! 💪', 'success');
  } catch (err) {
    toast('Failed to add habit: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '+ Add Habit';
  }
});

// ── Habit List Events (delegation) ───────────────────────
document.getElementById('habits').addEventListener('click', async e => {
  // Delete
  const del = e.target.closest('[data-action="delete"]');
  if (del) {
    await deleteHabit(del.dataset.id);
    toast('Habit removed', 'warning');
    return;
  }
  // Edit
  const editBtn = e.target.closest('[data-action="edit"]');
  if (editBtn) {
    const h = allHabits.find(x => x.id === editBtn.dataset.id);
    if (!h) return;
    document.getElementById('edit-habit-id').value = h.id;
    document.getElementById('edit-habit-name').value = h.name;
    document.getElementById('edit-habit-category').value = h.category || 'health';
    document.getElementById('edit-habit-frequency').value = h.frequency || 'daily';
    document.getElementById('edit-modal').classList.remove('hidden');
    return;
  }
  // Timer
  const timerBtn = e.target.closest('[data-action="timer"]');
  if (timerBtn) {
    const h = allHabits.find(x => x.id === timerBtn.dataset.id);
    if (!h) return;
    openTimerModal(h);
    return;
  }
  // Details
  const detailsBtn = e.target.closest('[data-action="details"]');
  if (detailsBtn) {
    const h = allHabits.find(x => x.id === detailsBtn.dataset.id);
    if (!h) return;
    openDetailsModal(h);
    return;
  }
  // Toggle checkbox
  const cb = e.target.closest('.habit-check');
  if (cb) {
    const id       = cb.dataset.id;
    const dateToRm = cb.dataset.date;
    const isDone   = cb.checked; // new state after click

    // If user is trying to uncheck a habit, check if it is locked (> 1 hour)
    if (!isDone) {
      const h = allHabits.find(x => x.id === id);
      const completionTime = h?.completedTimestamps?.[dateToRm];
      const nowMs = Date.now();
      const isLocked = completionTime ? (nowMs - completionTime > 3600000) : (dateToRm !== todayStr());

      if (isLocked) {
        cb.checked = true; // Re-check the checkbox immediately
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        toast('🔒 Habit is locked! Completed habits cannot be unchecked after 1 hour.', 'warning');
        return;
      }
    }

    // Play sound immediately on user tap
    if (isDone) {
      playPop();
    } else {
      playUncheck();
    }

    // Haptic feedback on tick
    if (navigator.vibrate) navigator.vibrate(isDone ? [40, 20, 40] : 30);

    // Slight delay to let the bouncy animation play
    setTimeout(async () => {
      await toggleHabit(id, !isDone, dateToRm);
      if (isDone) {
        toast('Great job! Habit completed 🎉', 'success');
        fireConfetti();
        // Check if all habits for today are completed
        checkAllDone(id);
      }
    }, 350);
  }
});

// ── Double-click to Open Details ────────────────────────
document.getElementById('habits').addEventListener('dblclick', async e => {
  const item = e.target.closest('.habit-item');
  if (item) {
    const h = allHabits.find(x => x.id === item.dataset.id);
    if (!h) return;
    openDetailsModal(h);
  }
});

// Edit Habit Form
document.getElementById('edit-habit-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('edit-habit-id').value;
  const name = document.getElementById('edit-habit-name').value.trim();
  const category = document.getElementById('edit-habit-category').value;
  const frequency = document.getElementById('edit-habit-frequency').value;
  
  if (!name || !id) return;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Saving...';
  
  try {
    await updateDoc(doc(db, 'habits', id), { name, category, frequency });
    document.getElementById('edit-modal').classList.add('hidden');
    toast('Habit updated!', 'success');
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes';
  }
});

document.getElementById('edit-cancel').addEventListener('click', () => {
  document.getElementById('edit-modal').classList.add('hidden');
});

// ── Recovery Modal Events ──────────────────────────────────
document.getElementById('open-recovery-btn').addEventListener('click', () => {
  renderDeletedHabits();
  document.getElementById('recovery-modal').classList.remove('hidden');
});

document.getElementById('recovery-close').addEventListener('click', () => {
  document.getElementById('recovery-modal').classList.add('hidden');
});

function renderDeletedHabits() {
  const list = document.getElementById('deleted-habits-list');
  list.innerHTML = '';
  
  if (!deletedHabits.length) {
    list.innerHTML = '<div style="text-align:center; padding: 2rem 0; color: var(--text-secondary);">No recently deleted habits.</div>';
    return;
  }
  
  deletedHabits.sort((a, b) => b.deletedAt - a.deletedAt).forEach(h => {
    const minsLeft = Math.max(0, Math.floor((3600000 - (Date.now() - h.deletedAt)) / 60000));
    
    const div = document.createElement('div');
    div.className = 'deleted-habit-item';
    div.innerHTML = `
      <div class="deleted-habit-info">
        <span class="deleted-habit-name">${h.name}</span>
        <span class="deleted-habit-time">Permanently deleted in ${minsLeft}m</span>
      </div>
      <button class="btn-ghost restore-btn" data-id="${h.id}" style="color: var(--primary);">Restore</button>
    `;
    list.appendChild(div);
  });
}

// Delegate restore clicks
document.getElementById('deleted-habits-list').addEventListener('click', async e => {
  if (e.target.classList.contains('restore-btn')) {
    const id = e.target.dataset.id;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Restoring...';
    try {
      await restoreHabit(id);
      toast('Habit restored!', 'success');
    } catch (err) {
      toast('Failed to restore: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Restore';
    }
  }
});

// ── Render: Stats Page ────────────────────────────────────
function renderStats() {
  const t = todayStr();
  const doneToday = allHabits.filter(h => (h.completedDates || []).includes(t)).length;
  const streak    = calcStreak(allHabits);
  const total     = calcTotalDone(allHabits);
  const { labels, counts } = getWeeklyData(allHabits);

  // Weekly completion rate
  const maxPossible = allHabits.length * 7;
  const weeklySum   = counts.reduce((a, b) => a + b, 0);
  const rate        = maxPossible > 0 ? Math.round((weeklySum / maxPossible) * 100) : 0;

  document.getElementById('stat-today').textContent  = `${doneToday}/${allHabits.length}`;
  animCount('stat-streak', streak);
  animCount('stat-total',  total);
  document.getElementById('stat-rate').textContent   = rate + '%';

  renderChart(labels, counts);
  renderCatBreakdown();
  renderHeatmap();
  renderWeeklyReport();
  renderSuccessRate();
}

function animCount(id, target) {
  const el = document.getElementById(id);
  if (typeof target !== 'number') { el.textContent = target; return; }
  const from = parseInt(el.textContent) || 0;
  const dur  = 700;
  let start;
  const step = ts => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    el.textContent = Math.round(from + (target - from) * p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderChart(labels, counts) {
  const ctx = document.getElementById('weekly-chart').getContext('2d');
  if (weeklyChart) weeklyChart.destroy();
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Habits done',
        data: counts,
        backgroundColor: isDark ? 'rgba(124,58,237,.4)' : 'rgba(124,58,237,.15)',
        borderColor:     isDark ? '#A78BFA' : 'rgba(124,58,237,.85)',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: isDark ? '#A0A0A0' : '#9E9BC0', font: { family: 'Inter' } },
          grid:  { color: isDark ? '#2A2A2A' : '#F3F0FF' }
        },
        x: {
          ticks: { color: isDark ? '#A0A0A0' : '#9E9BC0', font: { family: 'Inter' } },
          grid:  { display: false }
        }
      }
    }
  });
}

function renderCatBreakdown() {
  const catCounts = Object.entries(CATS).map(([key, cat]) => ({
    key, cat,
    count: allHabits
      .filter(h => h.category === key)
      .reduce((s, h) => s + (h.completedDates?.length || 0), 0)
  })).filter(c => c.count > 0).sort((a, b) => b.count - a.count);

  const ctx = document.getElementById('pie-chart').getContext('2d');
  if (catChart) catChart.destroy();

  if (!catCounts.length) {
    return;
  }

  const isDark = document.body.getAttribute('data-theme') === 'dark';
  catChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: catCounts.map(c => c.cat.label),
      datasets: [{
        data: catCounts.map(c => c.count),
        backgroundColor: catCounts.map(c => c.cat.color),
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { color: isDark ? '#A0A0A0' : '#4B4680', font: { family: 'Inter', size: 12 }, usePointStyle: true, pointStyle: 'circle' } }
      }
    }
  });
}

function renderHeatmap() {
  const container = document.getElementById('heatmap');
  const monthLabelsEl = document.getElementById('heatmap-month-labels');
  if (!container) return;
  container.innerHTML = '';
  if (monthLabelsEl) monthLabelsEl.innerHTML = '';

  // Build last 16 weeks (112 days), starting from the most recent Monday
  const today = new Date(); today.setHours(0,0,0,0);
  // Find the start of this week (Monday)
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
  // Go back 15 more weeks for 16 total
  const gridStart = new Date(weekStart);
  gridStart.setDate(weekStart.getDate() - 15 * 7);

  // Build all days from gridStart to today
  const days = [];
  const d = new Date(gridStart);
  while (d <= today) {
    const ds = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
    days.push({ ds, date: new Date(d) });
    d.setDate(d.getDate() + 1);
  }

  // Count completions per day
  const counts = {};
  days.forEach(({ ds }) => counts[ds] = 0);
  allHabits.forEach(h => {
    (h.completedDates || []).forEach(ds => {
      if (counts[ds] !== undefined) counts[ds]++;
    });
  });

  // Build month labels (one per column-week where month changes)
  if (monthLabelsEl) {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let lastMonth = -1;
    let colIndex = 0;
    const totalCols = Math.ceil(days.length / 7);
    const labels = [];
    for (let col = 0; col < totalCols; col++) {
      const dayIndex = col * 7;
      if (dayIndex < days.length) {
        const month = days[dayIndex].date.getMonth();
        if (month !== lastMonth) {
          labels.push({ col, label: MONTHS[month] });
          lastMonth = month;
        } else {
          labels.push({ col, label: '' });
        }
      }
    }
    // Render month label spans with dynamic widths
    let i = 0;
    while (i < labels.length) {
      const span = document.createElement('span');
      span.className = 'heatmap-month-label';
      span.textContent = labels[i].label;
      // width = number of columns until next label * (14px cell + 4px gap)
      const nextIdx = labels.findIndex((l, idx) => idx > i && l.label !== '');
      const spanCols = (nextIdx === -1 ? labels.length : nextIdx) - i;
      span.style.width = (spanCols * 18) + 'px';
      span.style.flexShrink = '0';
      monthLabelsEl.appendChild(span);
      i = nextIdx === -1 ? labels.length : nextIdx;
    }
  }

  // Render heatmap cells
  days.forEach(({ ds, date }) => {
    const count = counts[ds];
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    const displayDate = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    cell.title = `${displayDate}: ${count} habit${count !== 1 ? 's' : ''} completed`;
    if (count > 0) {
      const intensity = Math.min(Math.ceil(count / Math.max(allHabits.length / 4, 1)), 4);
      cell.setAttribute('data-count', intensity);
    }
    // Dim future placeholder cells
    if (date > today) cell.style.opacity = '0';
    container.appendChild(cell);
  });
}

function renderWeeklyReport() {
  if (!allHabits.length) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Analyse last 30 days
  const days30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
    days30.push({ ds, date: d });
  }

  // Perfect days (all daily habits done)
  const dailyHabits = allHabits.filter(h => !h.frequency || h.frequency === 'daily');
  let perfectDays = 0;
  let bestDayCount = 0; let bestDayName = '—';
  const dayTotals = {};

  days30.forEach(({ ds, date }) => {
    const doneThatDay = allHabits.filter(h => (h.completedDates || []).includes(ds)).length;
    if (dailyHabits.length > 0 && doneThatDay >= dailyHabits.length && dailyHabits.every(h => (h.completedDates||[]).includes(ds))) perfectDays++;
    if (doneThatDay > bestDayCount) { bestDayCount = doneThatDay; bestDayName = DAYS[date.getDay()]; }
    const dayName = DAYS[date.getDay()];
    dayTotals[dayName] = (dayTotals[dayName] || 0) + doneThatDay;
  });

  // Top habit (most completions in 30 days)
  const topHabit = allHabits
    .map(h => ({ name: h.name, count: (h.completedDates||[]).filter(ds => days30.some(d => d.ds === ds)).length }))
    .sort((a, b) => b.count - a.count)[0];

  // Active weeks (weeks where at least 1 habit was done)
  let activeWeeks = 0;
  for (let w = 0; w < 4; w++) {
    const wStart = new Date(today); wStart.setDate(today.getDate() - (w+1)*7 + 1);
    const wEnd   = new Date(today); wEnd.setDate(today.getDate() - w*7);
    const active = allHabits.some(h =>
      (h.completedDates||[]).some(ds => { const d = new Date(ds); return d >= wStart && d <= wEnd; })
    );
    if (active) activeWeeks++;
  }

  document.getElementById('report-best-day').textContent  = bestDayCount > 0 ? `${bestDayName} (${bestDayCount})` : '—';
  document.getElementById('report-top-habit').textContent  = topHabit?.count > 0 ? topHabit.name : '—';
  document.getElementById('report-perfect-days').textContent = perfectDays;
  document.getElementById('report-active-weeks').textContent = `${activeWeeks}/4`;

  // Summary sentence
  const total30 = days30.reduce((s, {ds}) => s + allHabits.filter(h => (h.completedDates||[]).includes(ds)).length, 0);
  const possible30 = dailyHabits.length * 30;
  const pct30 = possible30 > 0 ? Math.round((total30 / possible30) * 100) : 0;
  let summary = '';
  if (pct30 >= 80) summary = `🔥 Incredible! You completed ${pct30}% of your habits over the last 30 days. You're on fire — keep it up!`;
  else if (pct30 >= 50) summary = `💪 Good progress! You completed ${pct30}% of your habits over 30 days. Push a little harder this week!`;
  else if (pct30 > 0) summary = `📈 You're building momentum — ${pct30}% in 30 days. Consistency is the key. Keep showing up!`;
  else summary = `🌱 Start small. Every big journey begins with a single step. Tick your first habit today!`;
  document.getElementById('report-summary-text').textContent = summary;
}

function renderSuccessRate() {
  const list = document.getElementById('success-rate-list');
  if (!list || !allHabits.length) return;
  list.innerHTML = '';

  const today = new Date(); today.setHours(0,0,0,0);
  const days30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    days30.push([d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'));
  }

  const rates = allHabits
    .filter(h => !h.frequency || h.frequency === 'daily') // only daily habits for 30-day rate
    .map(h => {
      const done = (h.completedDates || []).filter(ds => days30.includes(ds)).length;
      const pct  = Math.round((done / 30) * 100);
      return { name: h.name, done, pct };
    })
    .sort((a, b) => b.pct - a.pct);

  if (!rates.length) {
    list.innerHTML = '<p style="color:var(--text-2);font-size:.9rem;">No daily habits tracked yet.</p>';
    return;
  }

  rates.forEach(({ name, done, pct }) => {
    const colorClass = pct >= 70 ? 'high' : pct >= 40 ? 'mid' : 'low';
    const item = document.createElement('div');
    item.className = 'success-rate-item';
    item.innerHTML = `
      <div class="success-rate-header">
        <span class="success-rate-name">${escHtml(name)}</span>
        <span class="success-rate-pct">${pct}%</span>
      </div>
      <div class="success-rate-bar-bg">
        <div class="success-rate-bar-fill ${colorClass}" style="width:0%" data-pct="${pct}"></div>
      </div>
      <span class="success-rate-meta">${done} of 30 days completed</span>
    `;
    list.appendChild(item);
  });

  // Animate bars after a short delay (for visual pop)
  requestAnimationFrame(() => {
    setTimeout(() => {
      list.querySelectorAll('.success-rate-bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.pct + '%';
      });
    }, 100);
  });
}

// ── Render: Profile Page ──────────────────────────────────
function renderProfile() {
  if (!currentUser) return;
  document.getElementById('profile-name').textContent = currentUser.displayName || 'Anonymous';
  document.getElementById('profile-email').textContent = currentUser.email;
  document.getElementById('s-habit-count').textContent = allHabits.length;
  const since = new Date(currentUser.metadata.creationTime);
  document.getElementById('s-member-since').textContent = since.toLocaleDateString('en', { month: 'short', year: 'numeric' });
}

// Settings events
document.getElementById('notif-toggle').addEventListener('change', async e => {
  if (e.target.checked) await requestNotificationPermission();
  else toast('Daily reminders paused 🔕', 'warning');
});

const darkModeToggle = document.getElementById('dark-mode-toggle');
if (darkModeToggle) {
  darkModeToggle.checked = localStorage.getItem('theme') === 'dark';
  darkModeToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      document.body.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
    if (location.hash === '#stats') renderStats();
  });
}

const smartSortToggle = document.getElementById('smart-sort-toggle');

const openTutorialBtn = document.getElementById('open-tutorial-btn');
if (openTutorialBtn) {
  openTutorialBtn.addEventListener('click', () => {
    initOnboarding(true);
  });
}
if (smartSortToggle) {
  smartSortToggle.checked = localStorage.getItem('smartSort') !== 'false';
  smartSortToggle.addEventListener('change', (e) => {
    localStorage.setItem('smartSort', e.target.checked);
    renderHabits();
  });
}

const exportDataBtn = document.getElementById('export-data-btn');
if (exportDataBtn) {
  exportDataBtn.addEventListener('click', () => {
    if (!allHabits || allHabits.length === 0) {
      toast('No data to export', 'warning');
      return;
    }
    const dataStr = JSON.stringify(allHabits, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habitly-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported successfully!', 'success');
  });
}

const delAccBtn = document.getElementById('delete-account-btn');
if (delAccBtn) {
  delAccBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to completely delete your account and all your habits? This cannot be undone.')) return;
    try {
      delAccBtn.disabled = true;
      // Delete all habits
      const batch = [];
      allHabits.forEach(h => batch.push(deleteDoc(doc(db, 'habits', h.id))));
      await Promise.all(batch);
      
      // Delete user doc
      await deleteDoc(doc(db, 'users', currentUser.uid));
      
      // Delete Auth user
      await deleteUser(currentUser);
      
      toast('Account deleted.', 'info');
    } catch (err) {
      if (err.code === 'auth/requires-recent-login') {
        toast('For security, please sign out and sign back in to delete your account.', 'error');
      } else {
        toast('Failed to delete account: ' + err.message, 'error');
      }
      delAccBtn.disabled = false;
    }
  });
}

// ── Push Notifications ────────────────────────────────────
const VAPID_KEY = "BE5rwPAdz5SJaPh4ML2Mqb8L-Ecdqj6lBjxpmMEt8T8VCkhvx3IjJuJ2GV5pa_80-YxE2rXXZ4SJbKGLAP-es1k";

async function requestNotificationPermission() {
  if (!messaging) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      document.getElementById('notif-toggle').checked = false;
      return;
    }
    document.getElementById('notif-toggle').checked = true;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return;
    await setDoc(doc(db, 'users', currentUser.uid),
      { fcmToken: token, email: currentUser.email },
      { merge: true }
    );
  } catch (err) {
    console.warn('Notification setup:', err.message);
  }
}

if (messaging) {
  onMessage(messaging, ({ notification }) => {
    if (notification?.title) toast(`${notification.title}: ${notification.body}`, 'info', 6000);
  });
}

// ── Service Worker ────────────────────────────────────────
// ── Social & Leaderboard ─────────────────────────────────
async function syncUserStats() {
  if (!currentUser) return;
  
  let totalStreak = 0;
  let badgesCount = 0;
  
  allHabits.forEach(h => {
    const habitStreak = calcHabitStreak(h);
    totalStreak += habitStreak;
    const badge = getUserBadge(habitStreak);
    // Map badge name to a numeric level for storage
    const badgeLevels = { 'Seedling': 1, 'Sprout': 2, 'Bronze': 3, 'Silver': 4, 'Gold': 5, 'Master': 6, 'Diamond': 7, 'Mystic': 8, 'Ascended': 9, 'Legend': 10 };
    badgesCount += badgeLevels[badge.name] || 1;
  });
  
  try {
    await setDoc(doc(db, 'users', currentUser.uid), {
      displayName: currentUser.displayName || 'Anonymous',
      email: currentUser.email,
      totalStreak: totalStreak,
      totalBadges: badgesCount,
      lastActive: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error("Error syncing stats:", err);
  }
}



if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {});
}

// ── Details & Journal ────────────────────────────────────
let currentDetailsHabitId = null;

function openDetailsModal(habit) {
  currentDetailsHabitId = habit.id;
  document.getElementById('details-habit-name').textContent = habit.name;
  
  const streak = calcHabitStreak(habit);
  let longest = 0;
  let current = 0;
  if (habit.completedDates && habit.completedDates.length > 0) {
    const sortedDates = [...habit.completedDates].sort();
    let tempStreak = 1;
    longest = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const diff = new Date(sortedDates[i]) - new Date(sortedDates[i-1]);
      if (diff <= 86400000 * 1.5) { // consecutive roughly
        tempStreak++;
        if (tempStreak > longest) longest = tempStreak;
      } else {
        tempStreak = 1;
      }
    }
  }
  
  document.getElementById('details-current-streak').textContent = streak;
  document.getElementById('details-longest-streak').textContent = Math.max(streak, longest);
  document.getElementById('details-total-days').textContent = habit.completedDates ? habit.completedDates.length : 0;
  
  document.getElementById('details-journal-input').value = '';
  renderJournal(habit);
  
  document.getElementById('details-modal').classList.remove('hidden');
}

document.getElementById('details-close').addEventListener('click', () => {
  document.getElementById('details-modal').classList.add('hidden');
  currentDetailsHabitId = null;
});

document.getElementById('details-save-journal').addEventListener('click', async () => {
  const note = document.getElementById('details-journal-input').value.trim();
  if (!note || !currentDetailsHabitId) return;
  
  const h = allHabits.find(x => x.id === currentDetailsHabitId);
  if (!h) return;
  
  const journals = h.journals || [];
  journals.push({
    date: new Date().toISOString(),
    text: note
  });
  
  await updateDoc(doc(db, 'habits', h.id), { journals });
  document.getElementById('details-journal-input').value = '';
});

function renderJournal(habit) {
  const list = document.getElementById('details-journal-list');
  list.innerHTML = '';
  if (!habit.journals || habit.journals.length === 0) {
    list.innerHTML = '<p class="text-secondary" style="font-size: 0.85rem; text-align: center;">No journal entries yet.</p>';
    return;
  }
  
  // Sort descending
  const sorted = [...habit.journals].sort((a,b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(j => {
    const div = document.createElement('div');
    div.style = 'background: var(--surface-2); padding: var(--sp-2); border-radius: var(--r-sm); border: 1px solid var(--border); position: relative;';
    div.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--text-2); margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>${new Date(j.date).toLocaleString()}</span>
        <button class="btn-icon text-danger delete-journal-btn" data-date="${j.date}" style="color: var(--danger); padding: 0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
        </button>
      </div>
      <div style="font-size: 0.9rem; color: var(--text);">${escHtml(j.text)}</div>
    `;
    list.appendChild(div);
  });
}

document.getElementById('details-journal-list').addEventListener('click', async e => {
  const btn = e.target.closest('.delete-journal-btn');
  if (btn) {
    if (!currentDetailsHabitId) return;
    const h = allHabits.find(x => x.id === currentDetailsHabitId);
    if (!h || !h.journals) return;
    
    const dateToRemove = btn.dataset.date;
    const newJournals = h.journals.filter(j => j.date !== dateToRemove);
    
    try {
      await updateDoc(doc(db, 'habits', h.id), { journals: newJournals });
      toast('Journal entry deleted', 'success');
    } catch (err) {
      toast('Failed to delete journal: ' + err.message, 'error');
    }
  }
});

// Update details view if it's open and data changes
const originalRenderHabits = renderHabits;
renderHabits = function() {
  originalRenderHabits();
  if (currentDetailsHabitId && !document.getElementById('details-modal').classList.contains('hidden')) {
    const h = allHabits.find(x => x.id === currentDetailsHabitId);
    if (h) openDetailsModal(h); // Re-render details with new data
  }
};

// ── Timer Logic ───────────────────────────────────────────
let timerInterval = null;
let timeLeft = 25 * 60; // 25 minutes in seconds
let activeTimerHabit = null;

function openTimerModal(habit) {
  activeTimerHabit = habit;
  const inputEl = document.getElementById('timer-input');
  if (inputEl) inputEl.value = '25'; // Reset to default on open
  timeLeft = 25 * 60;
  updateTimerDisplay();
  document.getElementById('timer-habit-name').textContent = habit.name;
  document.getElementById('timer-modal').classList.remove('hidden');
}

document.getElementById('timer-input')?.addEventListener('input', (e) => {
  if (timerInterval) return; // Cannot edit while running
  let mins = parseInt(e.target.value);
  if (isNaN(mins) || mins < 1) mins = 1;
  if (mins > 120) mins = 120;
  timeLeft = mins * 60;
  updateTimerDisplay();
});

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

document.getElementById('timer-start')?.addEventListener('click', () => {
  if (timerInterval) return;
  document.getElementById('timer-start').classList.add('hidden');
  document.getElementById('timer-pause').classList.remove('hidden');
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      playChime();
      fireConfetti();
      toggleHabit(activeTimerHabit.id, false, todayStr()); // Check it off
      document.getElementById('timer-modal').classList.add('hidden');
      document.getElementById('timer-start').classList.remove('hidden');
      document.getElementById('timer-pause').classList.add('hidden');
    }
  }, 1000);
});

document.getElementById('timer-pause')?.addEventListener('click', () => {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('timer-start').classList.remove('hidden');
  document.getElementById('timer-pause').classList.add('hidden');
});

document.getElementById('timer-close')?.addEventListener('click', () => {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('timer-start').classList.remove('hidden');
  document.getElementById('timer-pause').classList.add('hidden');
  document.getElementById('timer-modal').classList.add('hidden');
});

// ── PWA Install Flow ──────────────────────────────────────
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI to notify the user they can add to home screen
  const installRow = document.getElementById('install-app-row');
  if (installRow) installRow.style.display = 'flex';
});

document.getElementById('install-app-btn')?.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      const installRow = document.getElementById('install-app-row');
      if (installRow) installRow.style.display = 'none';
    }
    deferredPrompt = null;
  }
});

