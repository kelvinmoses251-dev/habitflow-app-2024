// app.js – Habitly v1.0 — Full SPA Logic

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, updateProfile,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, deleteUser, getAdditionalUserInfo, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, addDoc, query, where,
  onSnapshot, deleteDoc, doc, setDoc, updateDoc, getDoc,
  arrayUnion, arrayRemove, getDocs, orderBy, limit, deleteField, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getMessaging, getToken, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { firebaseConfig } from "./firebase-config.js";
import { setBusy, setFieldError, clearFieldError } from "./ui.js?v=1";

// ── Firebase Init ────────────────────────────────────────
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);

// ── Lazy third-party libraries ────────────────────────────
// Chart.js, jsPDF(+AutoTable) and Cropper used to load synchronously in <head> on every visit.
// They are only needed on the Stats page, PDF export and avatar upload, so load them on demand.
const LIBS = {
  chart:   { js: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'], ready: () => !!window.Chart },
  pdf:     { js: ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'],
             ready: () => !!(window.jspdf && window.jspdf.jsPDF) },
  cropper: { css: ['https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css'],
             js: ['https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js'], ready: () => !!window.Cropper },
};
const libPromises = {};
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src; el.async = false;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(el);
  });
}
function ensureLib(name) {
  const lib = LIBS[name];
  if (lib.ready()) return Promise.resolve();
  if (!libPromises[name]) {
    libPromises[name] = (async () => {
      (lib.css || []).forEach(href => {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
      });
      for (const src of lib.js) await loadScript(src);   // sequential: AutoTable needs jsPDF first
    })().catch(err => { delete libPromises[name]; throw err; });
  }
  return libPromises[name];
}

// ── Analytics (privacy-first) ─────────────────────────────
// Anonymous product events only: never names, emails or habit text. Honours Do Not Track / Global Privacy
// Control and an in-app opt-out. The SDK is imported lazily so it can never block or break the app.
const analyticsAllowed = () => {
  try {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return false;
    return localStorage.getItem('habitly_analytics') !== 'off';
  } catch (_) { return false; }
};
let analyticsReady = null;
function track(name, params = {}) {
  if (!analyticsAllowed()) return;
  try {
    if (!analyticsReady) {
      analyticsReady = import('https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js')
        .then(async m => (await m.isSupported()) ? { m, a: m.getAnalytics(firebaseApp) } : null)
        .catch(() => null);
    }
    analyticsReady.then(x => { if (x) x.m.logEvent(x.a, name, params); });
  } catch (_) { /* analytics must never affect the app */ }
}
function drainTrackQueue() {
  const q = window.__habitlyQ || [];
  window.__habitlyQ = [];
  q.forEach(e => track(e.name, e.params));
}
window.addEventListener('habitly:track', drainTrackQueue);
drainTrackQueue();   // events the landing demo queued before this module loaded

// ── Theme: saved choice wins, otherwise follow the system (a head script applies it before first paint) ──
const systemDark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function isDarkTheme() {
  const saved = localStorage.getItem('theme');
  return saved ? saved === 'dark' : !!(systemDark && systemDark.matches);
}
function applyTheme() {
  const dark = isDarkTheme();
  [document.documentElement, document.body].forEach(el => dark ? el.setAttribute('data-theme', 'dark') : el.removeAttribute('data-theme'));
}
applyTheme();
if (systemDark && systemDark.addEventListener) {
  systemDark.addEventListener('change', () => {
    if (localStorage.getItem('theme')) return;     // an explicit choice always wins
    applyTheme();
    if (location.hash === '#stats') renderStats();
  });
}

// ── Sound & vibration preferences ─────────────────────────
const prefOn = key => localStorage.getItem(key) !== 'off';
const soundOn = () => localStorage.getItem('habitly_sound') === 'on';   // opt-in
const hapticsOn = () => prefOn('habitly_haptics');
function buzz(pattern) { if (hapticsOn() && navigator.vibrate) navigator.vibrate(pattern); }

// ── Audio Synthesizers ─────────────────────────────────────
const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
  if (!soundOn()) return null;     // every sound helper bails when there is no context
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

// Offline-first: keep a persistent local copy of the user's data (IndexedDB, shared across tabs). Reads work with
// no connection and writes are applied locally at once, then synced. Falls back to the in-memory cache if
// IndexedDB is unavailable (private browsing, blocked storage).
let db;
try {
  db = initializeFirestore(firebaseApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (err) {
  console.warn('Offline cache unavailable, using memory cache:', err);
  db = getFirestore(firebaseApp);
}

// A Firestore write promise only resolves on SERVER acknowledgement, which never happens while offline, yet the
// local cache has already applied the change and fired snapshots. So UI flows must not `await` writes:
// hand them to this helper, which reports a real failure (e.g. permission denied) without blocking anything.
function backgroundWrite(promise, what = 'save your changes', quiet = false) {
  Promise.resolve(promise).catch(err => {
    console.warn(`Could not ${what}:`, err);
    if (!quiet) toast(`Couldn't ${what}. ${err && err.code === 'permission-denied' ? 'You may need to sign in again.' : 'It will retry when you are back online.'}`, 'error', 5000);
  });
}
let   messaging;
try { messaging = getMessaging(firebaseApp); } catch (_) { /* not supported */ }

// ── Categories ───────────────────────────────────────────
// Icons live in the sprite in index.html (#i-cat-<key>) so every icon in the app shares one stroke and grid.
// Each category has a colour for light surfaces and a lighter one for dark surfaces (both at least 3:1).
const catIcon = key => `<svg class="icon" aria-hidden="true"><use href="#i-cat-${key}"/></svg>`;
const CATS = {
  health:     { label: 'Health',     color: '#DC2626', dark: '#F87171' },
  mind:       { label: 'Mind',       color: '#4361EE', dark: '#8AA0FF' },
  social:     { label: 'Social',     color: '#EA580C', dark: '#FB923C' },
  growth:     { label: 'Growth',     color: '#16A34A', dark: '#4ADE80' },
  productive: { label: 'Productive', color: '#A16207', dark: '#FACC15' },
  nutrition:  { label: 'Nutrition',  color: '#059669', dark: '#34D399' },
  fitness:    { label: 'Fitness',    color: '#7C3AED', dark: '#A78BFA' },
  reading:    { label: 'Reading',    color: '#0891B2', dark: '#22D3EE' },
  saving:     { label: 'Saving',     color: '#B45309', dark: '#FBBF24' },
  relaxation: { label: 'Relaxation', color: '#7E22CE', dark: '#C084FC' },
  project:    { label: 'Project',    color: '#475569', dark: '#94A3B8' },
};
Object.keys(CATS).forEach(key => { CATS[key].icon = catIcon(key); });
const catColor = cat => (isDarkTheme() ? cat.dark : cat.color);

// ── Starter packs (one-tap activation for empty accounts) ─
const STARTER_PACKS = [
  { id: 'morning', title: 'Morning routine', habits: [
    ['Drink a glass of water', 'health'], ['5-minute stretch', 'fitness'], ['Plan my top 3 tasks', 'productive'] ] },
  { id: 'fit',     title: 'Fitness', habits: [
    ['Workout 20 minutes', 'fitness'], ['Walk 8,000 steps', 'health'], ['Protein with every meal', 'nutrition'] ] },
  { id: 'calm',    title: 'Mindfulness', habits: [
    ['Meditate 5 minutes', 'relaxation'], ['Write 3 lines in a journal', 'mind'], ['No phone in bed', 'mind'] ] },
  { id: 'learn',   title: 'Learning', habits: [
    ['Read 10 pages', 'reading'], ['Practice a skill for 15 min', 'growth'], ['Review today\u2019s notes', 'productive'] ] },
];
let nudgeFirstHabit = false;
let habitsEntered = false;       // stagger the list in once, not on every snapshot
let justCompletedId = null;      // the row that was just completed (gets a short highlight)   // pulse the first checkbox right after a pack is added

// ── State ─────────────────────────────────────────────────
let currentUser  = null;
let allHabits    = [];
let weeklyChart  = null;
let catChart     = null;
let unsubHabits  = null;
let routerReady  = false;

// ── Date Helpers ─────────────────────────────────────────
// Day keys are LOCAL calendar days ("YYYY-MM-DD") so a day rolls over at the user's own midnight.
// (Using toISOString() meant UTC midnight: streaks broke at 7pm in New York, 1am in Lagos.)
const pad2 = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dayKeyOffset = n => { const d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); };
const todayStr = () => dayKey();

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

// ── Stats Helpers & Streak Shield ────────────────────────
let userStreakShields = 1;
let userFrozenDates = [];
let userShieldUsedAt = 0;          // ms timestamp the last shield was consumed (drives the weekly recharge)
let userAllDoneBonusDate = null;   // local day the +100 Daily Master bonus was last awarded (once per day)
let userDocLoaded = false;         // true once users/{uid} has been read, so we never act on default values
let profileHasXP = true;           // false only when the SERVER says this account has no saved XP yet
let habitsLoaded = false;          // true once the first habits snapshot for this account has arrived
let deletingAccount = false;       // account deletion in progress: nothing may write to the profile
const SHIELD_RECHARGE_MS = 7 * 24 * 60 * 60 * 1000;
const XP_PER_HABIT = 25;
const XP_DAILY_BONUS = 100;

// Wipe per-account state so one user's XP/shields can never leak into (or be written onto) another account.
function resetUserState() {
  currentUserXP = 0;
  userStreakShields = 1;
  userFrozenDates = [];
  userShieldUsedAt = 0;
  userAllDoneBonusDate = null;
  userDocLoaded = false;
  profilePushToken = null;
  devicePushToken = null;
  profileHasXP = true;
  habitsLoaded = false;
  previousMaxStreak = null;
}

// A streak is counted in the habit's own period: days for daily habits, weeks for weekly, months for monthly.
// (Weekly and monthly habits used to be counted in days, so four weeks in a row showed as a 1-day streak.)
const habitFreq = h => (h.frequency === 'weekly' || h.frequency === 'monthly') ? h.frequency : 'daily';
function periodIndex(dayStr, freq) {
  const [y, m, d] = dayStr.split('-').map(Number);
  if (freq === 'monthly') return y * 12 + (m - 1);
  const n = Math.round(Date.UTC(y, m - 1, d) / 86400000);     // calendar day number (1970-01-01 was a Thursday)
  return freq === 'weekly' ? Math.floor((n + 3) / 7) : n;     // weeks run Monday to Sunday, as in isSameWeek
}
function streakPeriods(habit) {
  const freq = habitFreq(habit);
  const set = new Set((habit.completedDates || []).map(ds => periodIndex(ds, freq)));
  if (freq === 'daily') (userFrozenDates || []).forEach(ds => set.add(periodIndex(ds, freq)));   // shields cover days
  return { freq, set };
}
const streakUnit = (habit, n) => ({ daily: 'day', weekly: 'week', monthly: 'month' })[habitFreq(habit)] + (n === 1 ? '' : 's');
const streakShort = (habit, n) => ({ daily: String(n), weekly: n + ' wk', monthly: n + ' mo' })[habitFreq(habit)];

// The headline streak on Home, the share card and the tiers are in DAYS, so only daily habits count towards it.
function calcStreak(habits) {
  const daily = (habits || []).filter(h => habitFreq(h) === 'daily');
  if (!daily.length) return 0;
  return Math.max(...daily.map(calcHabitStreak));
}

function calcHabitStreak(habit) {
  const { freq, set } = streakPeriods(habit);
  let p = periodIndex(todayStr(), freq);
  if (!set.has(p)) p--;                    // the current period is still open: the streak is alive until it ends
  let streak = 0;
  while (set.has(p)) { streak++; p--; }
  return streak;
}

function calcLongestStreak(habit) {
  const { freq } = streakPeriods(habit);
  const periods = [...new Set((habit.completedDates || []).map(ds => periodIndex(ds, freq)))].sort((a, b) => a - b);
  let longest = 0, run = 0;
  periods.forEach((p, i) => { run = i > 0 && p === periods[i - 1] + 1 ? run + 1 : 1; if (run > longest) longest = run; });
  return Math.max(calcHabitStreak(habit), longest);
}

function getUserBadge(maxStreak) {
  if (maxStreak >= 365) return { name: 'Legend' };
  if (maxStreak >= 200) return { name: 'Ascended' };
  if (maxStreak >= 100) return { name: 'Mystic' };
  if (maxStreak >= 60)  return { name: 'Diamond' };
  if (maxStreak >= 30)  return { name: 'Master' };
  if (maxStreak >= 21)  return { name: 'Gold' };
  if (maxStreak >= 14)  return { name: 'Silver' };
  if (maxStreak >= 7)   return { name: 'Bronze' };
  if (maxStreak >= 3)   return { name: 'Rising' };
  return { name: 'Starter' };
}

// ── Levels ──────────────────────────────────────────────────
const LEVEL_TITLES = [
  { level: 1,  minXP: 0,    title: 'Starter' },
  { level: 2,  minXP: 100,  title: 'Builder' },
  { level: 3,  minXP: 250,  title: 'Steady' },
  { level: 4,  minXP: 450,  title: 'Consistent' },
  { level: 5,  minXP: 700,  title: 'Dedicated' },
  { level: 6,  minXP: 1000, title: 'Committed' },
  { level: 7,  minXP: 1400, title: 'Disciplined' },
  { level: 8,  minXP: 1900, title: 'Expert' },
  { level: 9,  minXP: 2500, title: 'Master' },
  { level: 10, minXP: 3200, title: 'Grandmaster' }
];

let currentUserXP = 0;

function getLevelInfo(totalXP) {
  const xp = Math.max(0, totalXP || 0);
  let cur = LEVEL_TITLES[0];
  let next = LEVEL_TITLES[1];
  for (let i = 0; i < LEVEL_TITLES.length; i++) {
    if (xp >= LEVEL_TITLES[i].minXP) {
      cur = LEVEL_TITLES[i];
      next = LEVEL_TITLES[i + 1] || { level: cur.level + 1, minXP: cur.minXP + 800, title: 'Grandmaster' };
    } else break;
  }
  const xpInCurrentLevel = xp - cur.minXP;
  const xpRequiredForNext = next.minXP - cur.minXP;
  return {
    level: cur.level,
    title: cur.title,
    totalXP: xp,
    xpInCurrentLevel,
    xpRequiredForNext,
    levelTargetXP: next.minXP,
    progressPct: Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNext) * 100))),
    nextTitle: next.title
  };
}

function updateXPUI() {
  const info = getLevelInfo(currentUserXP);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('user-level-badge', info.level);
  set('user-level-title', info.title);
  set('user-current-xp', info.xpInCurrentLevel);
  set('user-next-xp', info.xpRequiredForNext);
  set('user-xp-pct', info.progressPct + '%');
  const barEl = document.getElementById('user-xp-bar');
  if (barEl) barEl.style.width = `${info.progressPct}%`;
  // Profile rows
  set('s-level-rank', `Level ${info.level} · ${info.title}`);
  set('s-total-xp', `${info.totalXP.toLocaleString()} XP`);
}

function playLevelUpSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { f: 523.25, t: 0.00 }, // C5
      { f: 659.25, t: 0.10 }, // E5
      { f: 783.99, t: 0.20 }, // G5
      { f: 1046.50, t: 0.32 }, // C6
      { f: 1318.51, t: 0.46 }, // E6
      { f: 1567.98, t: 0.62 }  // G6
    ];
    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0, now + t);
      gain.gain.linearRampToValueAtTime(0.22, now + t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.85);
    });
  } catch(e) {
    console.warn("Level up sound error", e);
  }
}

function spawnFloatingXP(targetEl, amount = 25) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const chip = document.createElement('div');
  chip.className = 'floating-xp';
  chip.textContent = `+${amount} XP`;
  chip.style.left = `${Math.max(10, rect.left + rect.width / 2 - 28)}px`;
  chip.style.top = `${rect.top + window.scrollY - 10}px`;
  document.body.appendChild(chip);
  setTimeout(() => { if (chip.parentNode) chip.parentNode.removeChild(chip); }, 1200);
}

function showLevelUpModal(info) {
  playLevelUpSound();
  buzz([60, 40, 60]);
  const modal = document.getElementById('level-up-modal');
  if (!modal) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('level-up-new-level', `Level ${info.level}`);
  set('level-up-new-title', info.title);
  set('level-up-perk-text', `You reached level ${info.level}. Next level at ${info.levelTargetXP.toLocaleString()} XP.`);
  modal.classList.remove('hidden');
  modal.style.opacity = '1';
}

const levelUpClaimBtn = document.getElementById('level-up-claim-btn');
if (levelUpClaimBtn) {
  levelUpClaimBtn.addEventListener('click', () => {
    const modal = document.getElementById('level-up-modal');
    if (modal) modal.classList.add('hidden');
  });
}

async function addXP(amount, targetEl = null) {
  if (!currentUser) return;
  if (targetEl && amount > 0) spawnFloatingXP(targetEl, amount);

  const prevInfo = getLevelInfo(currentUserXP);
  currentUserXP = Math.max(0, currentUserXP + amount);
  const newInfo = getLevelInfo(currentUserXP);

  updateXPUI();

  // Save to Firestore (not awaited: see backgroundWrite). The server ADDS the amount to whatever is saved:
  // writing our own total would wipe XP whenever this device's copy is stale (profile not loaded yet,
  // or XP earned on another device).
  profileHasXP = true;
  backgroundWrite(setDoc(doc(db, 'users', currentUser.uid), { xp: increment(amount) }, { merge: true }), 'save your XP', true);

  // Check Level-Up (not before the saved total is known, or level 1 -> 2 would be announced to a level 6 user)
  if (userDocLoaded && amount > 0 && newInfo.level > prevInfo.level) {
    setTimeout(() => {
      showLevelUpModal(newInfo);
    }, 600);
  }
}

// ── Streak Shield Management ──────────────────────────────
function updateStreakShieldUI() {
  const shieldCount = document.getElementById('greeting-shield-count');
  if (shieldCount) shieldCount.textContent = userStreakShields;
  const sShields = document.getElementById('s-streak-shields');
  if (sShields) {
    if (userStreakShields > 0) sShields.textContent = `${userStreakShields} active`;
    else {
      const usedAt = userShieldUsedAt || (userFrozenDates.length ? new Date([...userFrozenDates].sort().pop() + 'T12:00:00').getTime() : Date.now());
      const days = Math.max(1, Math.ceil((usedAt + SHIELD_RECHARGE_MS - Date.now()) / 86400000));
      sShields.textContent = `Recharges in ${days} day${days === 1 ? '' : 's'}`;
    }
  }
}

async function checkAndApplyStreakShield() {
  // Never act on default values: wait for users/{uid} and for at least one habit.
  if (!currentUser || !userDocLoaded || allHabits.length === 0) return;

  // 1) Weekly recharge: a spent shield comes back 7 days after it was used.
  if (userStreakShields <= 0) {
    const lastFrozen = userFrozenDates.length ? new Date([...userFrozenDates].sort().pop() + 'T12:00:00').getTime() : 0;
    const usedAt = userShieldUsedAt || lastFrozen;
    if (Date.now() - usedAt >= SHIELD_RECHARGE_MS) {
      userStreakShields = 1;
      backgroundWrite(setDoc(doc(db, 'users', currentUser.uid), { streakShields: 1 }, { merge: true }), 'recharge your shield', true);
      toast('Streak shield recharged', 'success', 4500);
      updateStreakShieldUI();
    }
  }
  if (userStreakShields <= 0) return;

  // 2) Protect yesterday only if there was a streak to protect. A shield guards an existing streak;
  //    it must not conjure one for a brand-new user or "rescue" a streak that already ended.
  const yesterdayStr = dayKeyOffset(-1);
  const covered = ds => userFrozenDates.includes(ds) || allHabits.some(h => (h.completedDates || []).includes(ds));
  if (covered(yesterdayStr)) return;            // nothing was missed
  if (!covered(dayKeyOffset(-2))) return;       // no streak running into yesterday

  userStreakShields--;
  userFrozenDates = [...userFrozenDates, yesterdayStr];
  userShieldUsedAt = Date.now();
  // Show the protected streak straight away (not only after the next habit write), and don't
  // treat "streak restored by a shield" as a level-up.
  previousMaxStreak = null;
  updateStreakShieldUI();
  renderHabits();
  updateStreak();
  backgroundWrite(setDoc(doc(db, 'users', currentUser.uid), {
    streakShields: userStreakShields,
    frozenDates: userFrozenDates,
    shieldUsedAt: userShieldUsedAt
  }, { merge: true }), 'save your streak shield', true);
  toast('Streak shield used. Yesterday was covered.', 'info', 5000);
}

// ── Shareable 9:16 Story Progress Canvas ─────────────────
function drawRoundRect(ctx, x, y, width, height, radius, fillStyle = null, strokeStyle = null, lineWidth = 1) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

async function renderStoryCanvas() {
  const canvas = document.getElementById('share-story-canvas');
  if (!canvas) return;
  // Canvas text only uses a web font once it has loaded; without this the card silently falls back to a system font.
  try { await Promise.all([...['400', '500', '600', '700'].map(w => document.fonts.load(`${w} 28px Inter`)), document.fonts.load('400 40px "Instrument Serif"')]); } catch (_) { /* fall back gracefully */ }

  const ctx = canvas.getContext('2d');
  const W = 1080, H = 1920, M = 96;
  const FONT = 'Inter, system-ui, sans-serif';
  const INK = '#111113', LINE = '#2C2C31', TEXT = '#F2F2F4', MUTED = '#9A9AA3', ACCENT = '#A79EF5';

  const name = (currentUser?.displayName || 'Habitly user').trim();
  const levelInfo = getLevelInfo(currentUserXP);
  const maxStreak = calcStreak(allHabits);
  const totalDone = calcTotalDone(allHabits);
  const shieldCount = typeof userStreakShields === 'number' ? userStreakShields : 1;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // Header: logo mark, wordmark, date
  drawRoundRect(ctx, M, 120, 56, 56, 13, '#6657DB');
  ctx.beginPath();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.moveTo(M + 15, 149); ctx.lineTo(M + 25, 159); ctx.lineTo(M + 42, 139);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.font = `600 36px ${FONT}`; ctx.fillStyle = TEXT;
  ctx.fillText('Habitly', M + 76, 160);
  ctx.textAlign = 'right';
  ctx.font = `500 28px ${FONT}`; ctx.fillStyle = MUTED;
  ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), W - M, 158);

  // Identity
  ctx.textAlign = 'left';
  ctx.font = `600 64px ${FONT}`; ctx.fillStyle = TEXT;
  let shown = name;
  while (shown.length > 3 && ctx.measureText(shown).width > W - M * 2) shown = shown.slice(0, -2);
  ctx.fillText(shown === name ? name : shown.trimEnd() + '...', M, 430);
  ctx.font = `500 34px ${FONT}`; ctx.fillStyle = MUTED;
  ctx.fillText(`Level ${levelInfo.level} · ${levelInfo.title}`, M, 488);

  ctx.fillStyle = LINE; ctx.fillRect(M, 560, W - M * 2, 2);

  // Streak: line flame, big number, label
  ctx.save();
  ctx.translate(M, 640); ctx.scale(4.2, 4.2);
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(new Path2D('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'));
  ctx.restore();
  ctx.font = '400 440px "Instrument Serif", Georgia, serif'; ctx.fillStyle = TEXT;
  ctx.fillText(String(maxStreak), M - 10, 1140);
  ctx.font = `500 48px ${FONT}`; ctx.fillStyle = MUTED;
  ctx.fillText(maxStreak === 1 ? 'day streak' : 'day streak', M, 1210);

  // Three figures separated by hairlines
  const top = 1360, colW = (W - M * 2) / 3;
  ctx.fillStyle = LINE;
  ctx.fillRect(M, top, W - M * 2, 2);
  ctx.fillRect(M, top + 200, W - M * 2, 2);
  [[allHabits.length, 'Habits'], [totalDone, 'Check-ins'], [shieldCount, 'Shields']].forEach(([val, label], i) => {
    const x = M + i * colW + (i ? 32 : 0);
    if (i) ctx.fillRect(M + i * colW, top + 2, 2, 198);
    ctx.font = `600 84px ${FONT}`; ctx.fillStyle = TEXT;
    ctx.fillText(String(val), x, top + 120);
    ctx.font = `500 28px ${FONT}`; ctx.fillStyle = MUTED;
    ctx.fillText(label, x, top + 168);
    ctx.fillStyle = LINE;
  });

  // Footer
  ctx.font = `500 36px ${FONT}`; ctx.fillStyle = TEXT;
  ctx.fillText(SHARE_URL.replace('https://', ''), M, 1700);
  ctx.font = `400 28px ${FONT}`; ctx.fillStyle = MUTED;
  ctx.fillText('Habit tracker', M, 1748);
}

async function openShareCardModal() {
  if (!currentUser) return;
  track('story_opened');
  
  const modal = document.getElementById('share-card-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.opacity = '1';
  }

  // Render high-definition story canvas
  await renderStoryCanvas();
}

function closeShareCardModal() {
  const modal = document.getElementById('share-card-modal');
  if (modal) modal.classList.add('hidden');
}

document.getElementById('open-share-trigger')?.addEventListener('click', openShareCardModal);
document.getElementById('all-done-share')?.addEventListener('click', () => {
  const overlay = document.getElementById('all-done-overlay');
  if (overlay) overlay.classList.add('hidden');
  openShareCardModal();
});
document.getElementById('share-card-close')?.addEventListener('click', closeShareCardModal);

const shareModalEl = document.getElementById('share-card-modal');
if (shareModalEl) {
  shareModalEl.addEventListener('click', (e) => {
    if (e.target === shareModalEl) closeShareCardModal();
  });
}

// The link every shared story points back to (also printed on the card itself)
const SHARE_URL = 'https://habit-tracker-demo-34c0a.web.app';
function shareMessage() {
  const n = calcStreak(allHabits);
  return n > 0
    ? `I'm on a ${n}-day streak on Habitly. ${SHARE_URL}`
    : `I'm tracking my habits on Habitly. ${SHARE_URL}`;
}

// Download Card as PNG directly from Canvas
document.getElementById('share-card-download')?.addEventListener('click', () => {
  const canvas = document.getElementById('share-story-canvas');
  if (!canvas) return;

  try {
    const link = document.createElement('a');
    link.download = `habitly-streak-story-${dayKey()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Image saved', 'success');
  } catch (err) {
    console.error('Download canvas error:', err);
    toast('Could not save image: ' + err.message, 'error');
  }
});

// Share Card via Web Share API directly from Canvas
document.getElementById('share-card-share')?.addEventListener('click', () => {
  const canvas = document.getElementById('share-story-canvas');
  if (!canvas) return;
  track('story_share_clicked');

  try {
    toast('Opening share...', 'info');
    canvas.toBlob(async (blob) => {
      if (blob && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'streak.png', { type: 'image/png' })] })) {
        const file = new File([blob], 'habitly-streak-story.png', { type: 'image/png' });
        try {
          await navigator.share({ title: 'My Habitly Streak', text: shareMessage(), files: [file] });
        } catch (e) { if (e.name !== 'AbortError') console.warn('Share failed:', e); }
      } else if (navigator.share) {
        try {
          await navigator.share({ title: 'My Habitly Streak', text: shareMessage(), url: SHARE_URL });
        } catch (e) { if (e.name !== 'AbortError') console.warn('Share failed:', e); }
      } else {
        const link = document.createElement('a');
        link.download = `habitly-streak-story-${dayKey()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Image saved', 'success');
      }
    }, 'image/png');
  } catch (err) {
    console.error('Share canvas error:', err);
  }
});

function calcTotalDone(habits) {
  return habits.reduce((s, h) => s + (h.completedDates?.length || 0), 0);
}

function getWeeklyData(habits) {
  const labels = [], counts = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = dayKey(d);
    labels.push(d.toLocaleDateString('en', { weekday: 'short' }));
    counts.push(habits.filter(h => (h.completedDates || []).includes(ds)).length);
  }
  return { labels, counts };
}

// ── Toast ─────────────────────────────────────────────────
function toast(msg, type = 'info', ms = 3500, action = null) {
  const tc = document.getElementById('toast-container');
  const t  = document.createElement('div');
  t.className = `toast ${type}`;
  const label = document.createElement('span');
  label.textContent = msg;
  t.appendChild(label);
  if (action) {                                   // e.g. { label: 'Undo', onClick }
    t.classList.add('has-action');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
    b.addEventListener('click', () => { t.remove(); action.onClick(); });
    t.appendChild(b);
  }
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
let tourRunning = false;
function initOnboarding(force = false) {
  if (!currentUser && !force) return;
  const userKey = currentUser ? 'habitly_seen_' + currentUser.uid : 'habitly_seen';
  if (!force && localStorage.getItem(userKey)) return;
  runGuidedTour(userKey);
}

// Spotlight tour that points at the real interface (see coach.js). Loaded on demand.
async function runGuidedTour(userKey) {
  if (tourRunning) return;
  tourRunning = true;
  try {
    const { startTour } = await import('./coach.js?v=1');
    track('tour_started');
    const { completed, step } = await startTour();
    try { localStorage.setItem(userKey, '1'); } catch (_) { /* storage unavailable */ }
    track(completed ? 'tour_completed' : 'tour_skipped', { step });
    if (completed && !allHabits.length) setNewHabitOpen(true, { focus: true });   // the tour ends on the first action to take
  } catch (err) {
    console.warn('Guided tour unavailable:', err);
  } finally {
    tourRunning = false;
  }
}
document.getElementById('help-btn')?.addEventListener('click', () => initOnboarding(true));

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

  setTimeout(async () => {
    playChime();
    const overlay = document.getElementById('all-done-overlay');
    const n = Math.max(calcStreak(allHabits), 1);
    const line = document.getElementById('all-done-text');
    if (line) line.textContent = `You completed every daily habit. Your streak is ${n} day${n === 1 ? '' : 's'}.`;
    if (overlay) overlay.classList.remove('hidden');
    if (userAllDoneBonusDate !== today) {
      userAllDoneBonusDate = today;
      await addXP(XP_DAILY_BONUS);
      setDoc(doc(db, 'users', currentUser.uid), { allDoneBonusDate: today }, { merge: true }).catch(console.warn);
      toast('All habits done. +100 XP bonus', 'success');
      track('all_done_bonus');
    } else {
      toast("All habits done. Today's bonus was already claimed", 'info');
    }
    buzz([60, 40, 60]);
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
    links.forEach(l    => { const on = l.dataset.page === page; l.classList.toggle('active', on); on ? l.setAttribute('aria-current', 'page') : l.removeAttribute('aria-current'); });
    bnItems.forEach(b  => { const on = b.dataset.page === page; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    if (page === 'stats')   renderStats();
    if (page === 'profile') renderProfile();
  }

  window.addEventListener('hashchange', () => navigate(location.hash.replace('#', '')));
  navigate(location.hash.replace('#', '') || 'home');
}

// ── Escape closes the top-most dialog (keyboard users were trapped in modals) ──
const ESC_CLOSERS = [   // ordered top of the stack first
  ['share-card-modal', 'share-card-close'], ['level-up-modal', 'level-up-claim-btn'],
  ['confirm-export-modal', 'confirm-export-cancel'], ['confirm-check-modal', 'confirm-check-cancel'],
  ['crop-modal', 'crop-cancel'], ['recovery-modal', 'recovery-close'], ['details-modal', 'details-close'],
  ['edit-modal', 'edit-cancel'], ['timer-modal', 'timer-close'], ['all-done-overlay', 'all-done-close'],
  ['notif-ask', 'notif-ask-no'],
];
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  for (const [modalId, btnId] of ESC_CLOSERS) {
    const m = document.getElementById(modalId);
    if (m && !m.classList.contains('hidden')) {
      document.getElementById(btnId)?.click();
      e.preventDefault();
      return;
    }
  }
});

// ── Auth ──────────────────────────────────────────────────
// Turn Firebase's raw error ("Firebase: Error (auth/invalid-credential).") into something a person can act on.
function authErrorMessage(err) {
  const code = (err && err.code) || '';
  const noMatch = "That email and password don't match. New here? Tap Sign Up.";
  const map = {
    'auth/invalid-credential': noMatch,
    'auth/invalid-login-credentials': noMatch,
    'auth/wrong-password': noMatch,
    'auth/user-not-found': noMatch,
    'auth/email-already-in-use': 'That email already has an account. Tap Sign In, or use "Forgot password?".',
    'auth/weak-password': 'Please choose a password with at least 6 characters.',
    'auth/invalid-email': "That email address doesn't look right.",
    'auth/too-many-requests': 'Too many attempts. Please wait a minute, or reset your password.',
    'auth/network-request-failed': 'You seem to be offline. Check your connection and try again.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/unauthorized-domain': 'Sign-in is not enabled for this web address.',
  };
  if (map[code]) return map[code];
  console.warn('Auth error:', err);
  return 'Something went wrong. Please try again.';
}
// Handle redirect sign-in result (if user was redirected on mobile/webview)
getRedirectResult(auth).then(cred => {
  if (cred) {
    const details = getAdditionalUserInfo(cred);
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
    track(details && details.isNewUser ? 'sign_up' : 'login', { method: 'google' });
      } catch (e) {
    // The person closed the Google window (or opened a second one): that is a cancel, not an error.
    // It used to force a full-page redirect to Google.
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    // If the popup is blocked by a mobile browser or webview, fall back to redirect
    if (e.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectErr) {
        toast(authErrorMessage(redirectErr), 'error');
      }
    } else {
      toast(authErrorMessage(e), 'error');
    }
  }
});

// Which field an auth error is about, so the reason can be shown under that field as well as in a toast.
const AUTH_ERROR_FIELD = {
  'auth/invalid-credential': 'password', 'auth/invalid-login-credentials': 'password', 'auth/wrong-password': 'password',
  'auth/user-not-found': 'email', 'auth/weak-password': 'password',
  'auth/email-already-in-use': 'email', 'auth/invalid-email': 'email',
};
function showAuthError(err) {
  const message = authErrorMessage(err);
  const field = AUTH_ERROR_FIELD[(err && err.code) || ''];
  if (field) setFieldError(field === 'email' ? emailInput : passInput, message);
  toast(message, 'error');
}
function clearAuthErrors() { clearFieldError(emailInput); clearFieldError(passInput); }

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
  
  clearAuthErrors();
  setBusy(signinBtn, 'Signing in');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    track('login', { method: 'email' });
    emailForm.reset();
  } catch (e) {
    showAuthError(e);
  } finally {
    setBusy(signinBtn, null);
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

  clearAuthErrors();
  setBusy(signupBtn, 'Creating account');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    // Optionally set a default display name from the email prefix
    const name = email.split('@')[0];
    await updateProfile(cred.user, { displayName: name });
    emailForm.reset();
    toast('Account created', 'success');
    track('sign_up', { method: 'email' });
  } catch (e) {
    showAuthError(e);
  } finally {
    setBusy(signupBtn, null);
  }
});

// Password reset: previously there was no way back in after forgetting a password.
document.getElementById('forgot-btn').addEventListener('click', async e => {
  const email = emailInput.value.trim();
  if (!email || !emailInput.checkValidity()) {
    toast('Type your email above first, then tap "Forgot password?".', 'warning');
    emailInput.focus();
    return;
  }
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    // Surface only errors that don't reveal whether an account exists
    if (['auth/invalid-email', 'auth/network-request-failed', 'auth/too-many-requests'].includes(err.code)) {
      toast(authErrorMessage(err), 'error');
      btn.disabled = false;
      return;
    }
  }
  track('password_reset_requested');
  toast(`If ${email} has an account, a reset link is on its way. Check your spam folder too.`, 'success', 7000);
  btn.disabled = false;
});

document.getElementById('pw-toggle').addEventListener('click', e => {
  const show = passInput.type === 'password';
  passInput.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Hide' : 'Show';
  e.currentTarget.setAttribute('aria-pressed', String(show));
  e.currentTarget.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  // A signed-out device must not keep getting this person's reminders. Wait briefly (the write needs the
  // signed-in session), but never let a slow or offline network block signing out.
  await Promise.race([removePushToken().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
  if (unsubHabits) { unsubHabits(); unsubHabits = null; }
  allHabits = []; routerReady = false; resetUserState();
  await signOut(auth);
  toast('Signed out');
});

onAuthStateChanged(auth, async user => {
  hideLoading();
  if (user) {
    if (currentUser && currentUser.uid !== user.uid) resetUserState();
    currentUser = user;
    try { localStorage.setItem('habitly_returning', '1'); } catch (_) {}
    showApp();
    updateAvatars(user);
    subscribeToHabits();
    initNotifications();
  } else {
    currentUser = null;
    allHabits = [];
    resetUserState();
    showAuth();
  }
});

// ── Connectivity ──────────────────────────────────────────
// Firebase's push SDK tries to register an installation as soon as it loads; offline that rejects with
// installations/app-offline. It is harmless (it retries online), so don't let it surface as an error.
window.addEventListener('unhandledrejection', e => {
  if (e.reason && e.reason.code === 'installations/app-offline') e.preventDefault();
});

function updateOnlineStatus(announce = false) {
  const offline = navigator.onLine === false;
  document.getElementById('offline-bar')?.classList.toggle('hidden', !offline);
  if (announce && !offline) toast('Back online. Syncing your changes', 'success');
}
window.addEventListener('offline', () => updateOnlineStatus());
window.addEventListener('online', () => updateOnlineStatus(true));

function showApp() {
  updateOnlineStatus();
  if (!riskTimer) riskTimer = setInterval(updateStreakRisk, 60000);   // keep the countdown fresh
  // Warm up Chart.js when the browser is idle so the Stats tab opens instantly
  (window.requestIdleCallback || (cb => setTimeout(cb, 4000)))(() => ensureLib('chart').catch(() => {}));
  document.getElementById('auth-screen').classList.add('hidden');
  const appEl = document.getElementById('app');
  appEl.classList.remove('hidden');

  // Greeting
  document.getElementById('greeting-time').textContent = getGreeting();
  document.getElementById('greeting-name').textContent = getFirstName(currentUser);
  document.getElementById('today-date').textContent    = formatDisplayDate();

  initOnboarding();
  initRouter();
}

function showAuth() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  // Lets landing-demo.js refresh the hero / returning-user state
  window.dispatchEvent(new Event('habitly:auth-shown'));
}

// ── Landing demo carry-over ───────────────────────────────
// landing-demo.js lets visitors play with habits before signing up and parks
// the result in localStorage. For a brand-new account (zero habits) we turn
// that into real habits, including today's ticks, so nothing they did is lost.
const LANDING_DEMO_KEY = 'habitly_demo';

function readLandingDemo() {
  try {
    const d = JSON.parse(localStorage.getItem(LANDING_DEMO_KEY));
    if (d && Array.isArray(d.habits) && d.habits.length) return d;
  } catch (_) { /* ignore */ }
  return null;
}

async function seedHabitsFromLandingDemo() {
  const demo = readLandingDemo();
  if (!demo || !currentUser) return;
  // Clear first so a second snapshot / tab can never seed twice
  try { localStorage.removeItem(LANDING_DEMO_KEY); } catch (_) {}

  const today = todayStr();
  const carryTicks = demo.day === today;
  const base = Date.now();
  let ticked = 0;
  try {
    for (const [i, h] of demo.habits.slice(0, 5).entries()) {
      const name = String(h.name || '').trim().slice(0, 60);
      if (!name) continue;
      const done = carryTicks && !!h.done;
      if (done) ticked++;
      await addDoc(collection(db, 'habits'), {
        userId:         currentUser.uid,
        name,
        category:       CATS[h.category] ? h.category : 'productive',
        frequency:      'daily',
        completedDates: done ? [today] : [],
        ...(done ? { completedTimestamps: { [today]: base + i } } : {}),
        createdAt:      new Date().toISOString(),
        order:          base + i
      });
    }
    track('demo_carried_over', { habits: demo.habits.length, ticked });
    toast(ticked
      ? `Demo progress saved. ${ticked} habit${ticked === 1 ? '' : 's'} already completed.`
      : 'Demo habits added to your account.', 'success', 5000);
  } catch (e) {
    console.warn('Could not carry over demo habits:', e);
  }
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
    profilePushToken = (docSnap.exists() && docSnap.data().fcmToken) || null;
    if (docSnap.exists()) {
      const uData = docSnap.data();
      if (uData.avatar) photoURL = uData.avatar;
      if (typeof uData.xp === 'number') {
        currentUserXP = Math.max(0, uData.xp);
        updateXPUI();
      }
      if (typeof uData.streakShields === 'number') {
        userStreakShields = uData.streakShields;
      }
      if (Array.isArray(uData.frozenDates)) {
        userFrozenDates = uData.frozenDates;
      }
      if (typeof uData.shieldUsedAt === 'number') userShieldUsedAt = uData.shieldUsedAt;
      if (typeof uData.allDoneBonusDate === 'string') userAllDoneBonusDate = uData.allDoneBonusDate;
      updateStreakShieldUI();
    }
    // Only a server answer can tell us the account has no XP: a cache miss looks the same as "no profile".
    if (!docSnap.metadata.fromCache && !docSnap.metadata.hasPendingWrites) {
      profileHasXP = docSnap.exists() && typeof docSnap.data().xp === 'number';
    }
    if (!userDocLoaded) {
      userDocLoaded = true;
      if (allHabits.length) { checkAndApplyStreakShield(); renderHabits(); updateStreak(); }
    }
    seedXPFromHistory();
    
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
  reader.onload = async e => {
    cropImg.src = e.target.result;
    cropModal.classList.remove('hidden');
    try { await ensureLib('cropper'); }
    catch (_) {
      cropModal.classList.add('hidden');
      toast('Could not load the photo editor. Check your connection and try again.', 'error');
      return;
    }
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
  setBusy(btn, 'Saving');
  
  try {
    // Scale down drastically to keep the base64 string tiny
    const canvas = cropper.getCroppedCanvas({ width: 120, height: 120 });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    // Bypass Firebase Storage and Auth Limits and save directly to Firestore
    const userRef = doc(db, 'users', currentUser.uid);
    backgroundWrite(setDoc(userRef, { avatar: dataUrl }, { merge: true }), 'save your photo');
    
    toast('Profile picture updated', 'success');
    
    cropModal.classList.add('hidden');
    cropper.destroy();
  } catch (err) {
    toast('Upload failed: ' + err.message, 'error');
  } finally {
    setBusy(btn, null);
    document.getElementById('ava-upload-input').value = '';
  }
});


// ── Firestore CRUD ────────────────────────────────────────
function addHabit(name, category, frequency) {
  if (!currentUser) return Promise.resolve();
  return addDoc(collection(db, 'habits'), {
    userId:         currentUser.uid,
    name,
    category,
    frequency:      frequency || 'daily',
    completedDates: [],
    createdAt:      new Date().toISOString(),
    order:          Date.now()
  });
}

function deleteHabit(id) {
  return updateDoc(doc(db, 'habits', id), { deletedAt: Date.now() });
}

function restoreHabit(id) {
  return updateDoc(doc(db, 'habits', id), { deletedAt: null });
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
        toast('Locked: a completed habit can only be unchecked within 1 hour.', 'warning');
        return false;
      }
      if (!completionTime && d !== todayStr()) {
        toast('Locked: past completions cannot be unchecked.', 'warning');
        return false;
      }
    }

    const updatePayload = {
      completedDates: arrayRemove(d)
    };
    if (h && h.completedTimestamps && h.completedTimestamps[d]) {
      updatePayload[`completedTimestamps.${d}`] = deleteField();
    }
    backgroundWrite(updateDoc(habitRef, updatePayload), 'update your habit');
  } else {
    // Checking the habit
    backgroundWrite(updateDoc(habitRef, {
      completedDates: arrayUnion(d),
      [`completedTimestamps.${d}`]: now
    }), 'save your check-in');
  }
  return true;
}

let deletedHabits = []; // Stores soft-deleted habits

// Accounts from before XP existed get credit for their history, once. This runs only after the server has
// confirmed that the profile has no XP. (It used to run whenever the local value was 0, which is also what
// it is before the profile has loaded, so a slow profile read replaced the saved total with a guess.)
function seedXPFromHistory() {
  if (!currentUser || deletingAccount || !userDocLoaded || !habitsLoaded || profileHasXP) return;
  profileHasXP = true;
  const historicalXP = allHabits.reduce((acc, h) => acc + ((h.completedDates || []).length * XP_PER_HABIT), 0);
  if (historicalXP <= 0) return;
  currentUserXP = historicalXP;
  updateXPUI();
  backgroundWrite(setDoc(doc(db, 'users', currentUser.uid), { xp: historicalXP }, { merge: true }), 'save your XP', true);
}

let landingDemoChecked = false;

function subscribeToHabits() {
  if (unsubHabits) unsubHabits();
  landingDemoChecked = false;
  const q = query(collection(db, 'habits'), where('userId', '==', currentUser.uid));
  unsubHabits = onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // First authoritative snapshot only: brand-new account => adopt the landing demo
    if (!landingDemoChecked && !snap.metadata.fromCache) {
      landingDemoChecked = true;
      if (all.length === 0) seedHabitsFromLandingDemo();
      else { try { localStorage.removeItem(LANDING_DEMO_KEY); } catch (_) {} }
    }
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
    if (userDocLoaded) updateStreak();   // before that, shield data is still defaults
    syncUserStats();

    habitsLoaded = true;
    seedXPFromHistory();
    updateXPUI();
    checkAndApplyStreakShield();
    updateStreakShieldUI();

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

  if (!userSetNewHabit) setNewHabitOpen(!allHabits.length);   // open for an empty list, one tidy row otherwise
  list.innerHTML = '';

  if (!allHabits.length) {
    empty.classList.remove('hidden');
    renderStarterPacks();
    updateProgress(0, 0);
    updateStreakRisk();
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
  const animateRows = !habitsEntered;
  sorted.forEach((h, rowIdx) => {
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
    li.className = 'habit-item' + (animateRows ? ' enter' : '') + (h.id === justCompletedId ? ' just-done' : '');
    li.dataset.id = h.id;
    li.style.setProperty('--cat', catColor(cat));
    li.style.setProperty('--i', rowIdx);
    li.innerHTML = `
      <div class="habit-label">
        <input type="checkbox" class="habit-check" data-id="${h.id}" data-date="${completedDateForToggle}" aria-label="Mark ${escHtml(h.name)} complete" ${isDone ? 'checked' : ''} ${isLocked ? 'data-locked="1"' : ''} />
        <div class="habit-meta" data-action="details" data-id="${h.id}" style="cursor: pointer;">
          <span class="habit-name ${isDone ? 'done' : ''}">${escHtml(h.name)}</span>
          <div class="badges-row">
            <span class="cat-badge"><span class="cat-ico">${cat.icon}</span>${cat.label}</span>
            ${freq !== 'daily' ? '<span class="freq-badge">' + freq + '</span>' : ''}
            ${habitStreak > 0 ? '<span class="streak-pill" title="Current streak: ' + habitStreak + ' ' + streakUnit(h, habitStreak) + '"><svg class="icon" aria-hidden="true"><use href="#i-flame"/></svg>' + streakShort(h, habitStreak) + '</span>' : ''}
            ${isLocked ? '<span class="locked-badge" title="Completed and locked (cannot be unchecked after 1 hour)"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg><span class="sr-only">Locked</span></span>' : ''}
          </div>
        </div>
      </div>
      <div class="habit-actions">
        <button class="btn-icon" data-id="${h.id}" data-action="timer" title="Start Focus Timer" aria-label="Start focus timer for ${escHtml(h.name)}">
          <svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>
        </button>
        ${isEditable ?
        '<button class="btn-icon" data-id="' + h.id + '" data-action="edit" title="Edit habit" aria-label="Edit ' + escHtml(h.name) + '">' +
          '<svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg>' +
        '</button>'
        : ''}
        <button class="btn-icon" data-id="${h.id}" data-action="delete" title="Remove habit" aria-label="Remove ${escHtml(h.name)}">
          <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
        </button>
      </div>`;
    list.appendChild(li);
  });

  habitsEntered = true;
  if (nudgeFirstHabit && done === 0) {
    const first = list.querySelector('.habit-check:not(:checked)');
    if (first) first.classList.add('nudge');
  }
  updateProgress(done, allHabits.length);
  updateStreakRisk();
}

// Loss aversion: late in the day, say exactly which streak is about to end and how long is left.
let riskTimer = null;
function updateStreakRisk() {
  const el = document.getElementById('streak-risk');
  if (!el) return;
  const now = new Date();
  const t = todayStr();
  const atRisk = allHabits
    .filter(h => (!h.frequency || h.frequency === 'daily') && !(h.completedDates || []).includes(t) && calcHabitStreak(h) > 0)
    .sort((x, y) => calcHabitStreak(y) - calcHabitStreak(x));
  if (!atRisk.length || now.getHours() < 16) { el.classList.add('hidden'); return; }

  const top = atRisk[0];
  const mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const mins = Math.max(1, Math.round((mid - now) / 60000));
  const left = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  document.getElementById('risk-title').textContent = `${top.name}: ${calcHabitStreak(top)}-day streak ends in ${left}`;
  document.getElementById('risk-sub').textContent = userStreakShields > 0
    ? 'Complete it today to keep your shield.'
    : 'Complete it before midnight to keep the streak.';
  el.dataset.habit = top.id;
  if (el.classList.contains('hidden')) track('streak_risk_shown', { streak: calcHabitStreak(top) });
  el.classList.remove('hidden');
}
document.getElementById('streak-risk')?.addEventListener('click', e => {
  track('streak_risk_tapped');
  const cb = document.querySelector(`.habit-item[data-id="${CSS.escape(e.currentTarget.dataset.habit || '')}"] .habit-check`);
  if (!cb) return;
  cb.scrollIntoView({ behavior: 'smooth', block: 'center' });
  cb.classList.add('nudge');
  setTimeout(() => cb.classList.remove('nudge'), 4000);
});

function renderStarterPacks() {
  const grid = document.getElementById('starter-packs');
  if (!grid || grid.childElementCount) return;          // render once
  STARTER_PACKS.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pack-card'; b.dataset.pack = p.id;
    b.innerHTML = `<span class="pack-title">${escHtml(p.title)}</span>
      <ul class="pack-list">${p.habits.map(([n]) => `<li>${escHtml(n)}</li>`).join('')}</ul>
      <span class="pack-add">Add these three</span>`;
    grid.appendChild(b);
  });
}

async function addStarterPack(id, btn) {
  const pack = STARTER_PACKS.find(p => p.id === id);
  if (!pack || !currentUser) return;
  document.querySelectorAll('.pack-card').forEach(b => { b.disabled = true; });   // no double-adds
  const base = Date.now();
  try {
    pack.habits.forEach(([name, category], i) => backgroundWrite(addDoc(collection(db, 'habits'), {
      userId: currentUser.uid, name, category, frequency: 'daily',
      completedDates: [], createdAt: new Date().toISOString(), order: base + i
    }), 'add the pack'));
    nudgeFirstHabit = true;
    track('starter_pack_added', { pack: pack.id });
    toast(`${pack.title} added. Complete your first habit to start a streak.`, 'success');
    buzz(25);
  } catch (err) {
    toast('Could not add the pack: ' + err.message, 'error');
    document.querySelectorAll('.pack-card').forEach(b => { b.disabled = false; });
  }
}
document.getElementById('starter-packs')?.addEventListener('click', e => {
  const card = e.target.closest('.pack-card');
  if (card) addStarterPack(card.dataset.pack, card);
});

const RING_LEN = 2 * Math.PI * 44;
function updateProgress(done, total) {
  const ring = document.getElementById('today-ring');
  const fg = document.getElementById('ring-fg');
  const frac = total > 0 ? done / total : 0;
  if (fg) fg.style.strokeDashoffset = String(RING_LEN * (1 - frac));
  if (ring) {
    ring.classList.toggle('complete', total > 0 && done === total);
    ring.setAttribute('aria-label', total ? `${done} of ${total} habits done today` : 'No habits yet');
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('ring-num', done);
  set('ring-of', `of ${total}`);
  set('summary-line', total === 0 ? 'No habits yet' : done === total ? 'All done for today' : `${total - done} left today`);
  renderWeekStrip();
}

// The last 7 days at a glance: filled = every daily habit done, tinted = some done.
function renderWeekStrip() {
  const el = document.getElementById('week-strip');
  if (!el) return;
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const cells = [];
  for (let n = 6; n >= 0; n--) {
    const d = new Date(now); d.setDate(d.getDate() - n);
    const key = dayKey(d);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    const daily = allHabits.filter(h => (!h.frequency || h.frequency === 'daily') && (!h.createdAt || new Date(h.createdAt) <= dayEnd));
    const doneDaily = daily.filter(h => (h.completedDates || []).includes(key)).length;
    const anyDone = allHabits.some(h => (h.completedDates || []).includes(key));
    const state = daily.length && doneDaily === daily.length ? 'full' : anyDone ? 'some' : 'none';
    const label = d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
    const what = state === 'full' ? 'all habits done' : state === 'some' ? 'some habits done' : 'no habits done';
    cells.push(`<div class="wk-day ${state}${n === 0 ? ' is-today' : ''}" role="img" aria-label="${escHtml(label)}: ${what}"><span class="wk-dot">${state === 'full' ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>' : ''}</span><span class="wk-lbl">${d.toLocaleDateString('en', { weekday: 'narrow' })}</span></div>`);
  }
  el.innerHTML = cells.join('');
}

let previousMaxStreak = null;

function updateStreak() {
  const maxStreak = calcStreak(allHabits);
  document.getElementById('greeting-streak').textContent = maxStreak;
  const badge = getUserBadge(maxStreak);

  if (previousMaxStreak !== null && maxStreak > previousMaxStreak) {
    const tile = document.getElementById('open-share-trigger');
    if (tile) { tile.classList.remove('pulse'); void tile.offsetWidth; tile.classList.add('pulse'); setTimeout(() => tile.classList.remove('pulse'), 700); }
    const oldBadge = getUserBadge(previousMaxStreak);
    if (badge.name !== oldBadge.name) {
      toast(`New streak tier: ${badge.name}`, 'success', 5000);
      playChime();
    }
  }
  previousMaxStreak = maxStreak;

  const tag = document.getElementById('header-badge');
  if (tag) { tag.textContent = badge.name; tag.title = `${badge.name} streak tier`; }
  const profileName = document.getElementById('profile-badge-name');
  if (profileName) profileName.textContent = `${badge.name} streak tier`;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Habit Form ────────────────────────────────────────────
// New habit stays a single row once the list has items, so the list is what you see first.
const newHabitToggle = document.getElementById('new-habit-toggle');
const habitFormEl = document.getElementById('habit-form');
let userSetNewHabit = false;
function setNewHabitOpen(open, { focus = false } = {}) {
  if (!newHabitToggle || !habitFormEl) return;
  newHabitToggle.setAttribute('aria-expanded', String(open));
  habitFormEl.hidden = !open;
  if (open && focus) document.getElementById('habit-input').focus();
}
newHabitToggle?.addEventListener('click', () => { userSetNewHabit = true; setNewHabitOpen(habitFormEl.hidden, { focus: true }); });

// Quick add: the top-bar button and the N key take you home and open the form with the cursor in it.
function quickAddHabit() {
  const open = () => {
    userSetNewHabit = true;
    setNewHabitOpen(true, { focus: true });
    document.getElementById('new-habit-toggle')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  if (!location.hash || location.hash === '#home') return open();      // already on Home (no hash means Home)
  location.hash = '#home';
  setTimeout(open, 60);                         // the page is hidden until the route change lands, and hidden fields cannot take focus
}
document.getElementById('topnav-new')?.addEventListener('click', quickAddHabit);
document.addEventListener('keydown', e => {
  if (e.key !== 'n' && e.key !== 'N') return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
  const el = document.activeElement, tag = el && el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
  if (document.getElementById('app')?.classList.contains('hidden')) return;
  if (document.querySelector('.modal:not(.hidden), #coach, .all-done-overlay:not(.hidden)')) return;
  e.preventDefault();
  quickAddHabit();
});

document.getElementById('habit-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name     = document.getElementById('habit-input').value.trim();
  const category = document.getElementById('habit-category').value;
  const freqEl   = document.getElementById('habit-frequency');
  const frequency = freqEl ? freqEl.value : 'daily';
  if (!name) return;
  const btn = e.target.querySelector('button[type="submit"]');
  setBusy(btn, 'Adding');
  
  try {
    backgroundWrite(addHabit(name, category, frequency), 'add the habit');
    track('habit_added', { category, frequency, source: 'form' });
    document.getElementById('habit-input').value = '';
    toast('Habit added', 'success');
    userSetNewHabit = true;
    setNewHabitOpen(allHabits.length + 1 < 3, { focus: true });   // stay open while someone is still building their first few
  } catch (err) {
    toast('Failed to add habit: ' + err.message, 'error');
  } finally {
    setBusy(btn, null);
  }
});

// ── Habit List Events (delegation) ───────────────────────
document.getElementById('habits').addEventListener('click', async e => {
  // Delete
  const del = e.target.closest('[data-action="delete"]');
  if (del) {
    const delId = del.dataset.id;
    backgroundWrite(deleteHabit(delId), 'remove the habit');
    toast('Habit removed', 'warning', 7000, {
      label: 'Undo',
      onClick: () => { backgroundWrite(restoreHabit(delId), 'restore the habit'); toast('Habit restored', 'success'); }
    });
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
});
// ── Habit Check Confirmation Modal Flow ────────────────────
let pendingHabitCheck = null;

function openConfirmCheckModal(habit, dateToRm, checkboxEl) {
  pendingHabitCheck = { id: habit.id, dateToRm, checkboxEl };
  const nameEl = document.getElementById('confirm-habit-name');
  if (nameEl) nameEl.textContent = `"${habit.name}"`;
  const modal = document.getElementById('confirm-check-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.opacity = '1';
  }
}

function closeConfirmCheckModal() {
  if (pendingHabitCheck && pendingHabitCheck.checkboxEl) {
    pendingHabitCheck.checkboxEl.checked = false;
  }
  pendingHabitCheck = null;
  const modal = document.getElementById('confirm-check-modal');
  if (modal) modal.classList.add('hidden');
}

const confirmModal = document.getElementById('confirm-check-modal');
if (confirmModal) {
  const cancelBtn = document.getElementById('confirm-check-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeConfirmCheckModal);
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeConfirmCheckModal();
  });

  const yesBtn = document.getElementById('confirm-check-yes');
  if (yesBtn) {
    yesBtn.addEventListener('click', () => {
      if (!pendingHabitCheck) return;
      const { id, dateToRm, checkboxEl } = pendingHabitCheck;
      pendingHabitCheck = null;
      confirmModal.classList.add('hidden');
      completeHabit(id, dateToRm, checkboxEl);
    });
  }
}

// Complete a habit: after confirmation, or straight away when "Ask before completing" is switched off.
function completeHabit(id, dateToRm, checkboxEl) {
  if (checkboxEl) checkboxEl.checked = true;
  nudgeFirstHabit = false;
  justCompletedId = id;
  setTimeout(() => { if (justCompletedId === id) justCompletedId = null; }, 1600);
  playPop();
  buzz([40, 20, 40]);
  setTimeout(async () => {
    await toggleHabit(id, false, dateToRm);
    await addXP(XP_PER_HABIT, checkboxEl);
    toast('Habit completed. +25 XP', 'success');
    track('habit_completed');
    checkAllDone(id);
    maybeAskForReminders();
  }, 300);
}

// ── Checkbox Click Handler with Confirmation ──────────────
document.getElementById('habits').addEventListener('change', async e => {
  const cb = e.target.closest('.habit-check');
  if (!cb) return;

  const id       = cb.dataset.id;
  const dateToRm = cb.dataset.date;
  const isDone   = cb.checked; // new state after user click

  const h = allHabits.find(x => x.id === id);
  if (!h) return;

  if (isDone) {
    cb.checked = false;
    if (localStorage.getItem('habitly_confirm') === 'off') completeHabit(id, dateToRm, cb);   // the user switched confirmation off
    else openConfirmCheckModal(h, dateToRm, cb);                                               // default: ask first
    return;
  }

  // If user is trying to uncheck a habit, check if it is locked (> 1 hour)
  const completionTime = h?.completedTimestamps?.[dateToRm];
  const nowMs = Date.now();
  const isLocked = completionTime ? (nowMs - completionTime > 3600000) : (dateToRm !== todayStr());

  if (isLocked) {
    cb.checked = true; // Re-check the checkbox immediately
    buzz([60, 40, 60]);
    toast('Locked: a completed habit can only be unchecked within 1 hour.', 'warning');
    return;
  }

  // Unchecking within 1 hour allowed
  playUncheck();
  buzz(30);

  setTimeout(async () => {
    // Refund the XP so ticking/unticking can't be farmed
    if (await toggleHabit(id, true, dateToRm)) await addXP(-XP_PER_HABIT);
  }, 200);
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
  setBusy(btn, 'Saving');
  
  try {
    backgroundWrite(updateDoc(doc(db, 'habits', id), { name, category, frequency }), 'update the habit');
    document.getElementById('edit-modal').classList.add('hidden');
    toast('Habit updated', 'success');
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  } finally {
    setBusy(btn, null);
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
    list.innerHTML = '<div class="deleted-empty">No recently deleted habits.</div>';
    return;
  }
  
  deletedHabits.sort((a, b) => b.deletedAt - a.deletedAt).forEach(h => {
    const minsLeft = Math.max(0, Math.floor((3600000 - (Date.now() - h.deletedAt)) / 60000));
    
    const div = document.createElement('div');
    div.className = 'deleted-habit-item';
    div.innerHTML = `
      <div class="deleted-habit-info">
        <span class="deleted-habit-name">${escHtml(h.name || '')}</span>
        <span class="deleted-habit-time">Permanently deleted in ${minsLeft}m</span>
      </div>
      <button class="btn-link restore-btn" data-id="${h.id}">Restore</button>
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
      backgroundWrite(restoreHabit(id), 'restore the habit');
      toast('Habit restored', 'success');
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

  renderHeatmap();
  renderWeeklyReport();
  renderSuccessRate();
  renderInsights();
  ensureLib('chart').then(() => {
    if (location.hash !== '#stats') return;      // user navigated away while it loaded
    renderChart(labels, counts);
    renderCatBreakdown();
  }).catch(() => {});
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
        // Earlier days in a soft tint, today in the full accent
        backgroundColor: counts.map((_, i) => i === counts.length - 1 ? (isDark ? '#8173EE' : '#4A3AB8') : (isDark ? '#3A3470' : '#CBC6EC')),
        borderWidth: 0,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 36,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: isDark ? '#EDEDF0' : '#1A1A1E', titleColor: isDark ? '#1A1A1E' : '#fff', bodyColor: isDark ? '#1A1A1E' : '#fff', padding: 10, cornerRadius: 8, displayColors: false, titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' } }
      },
      scales: {
        y: {
          beginAtZero: true,
          border: { display: false },
          ticks: { stepSize: 1, precision: 0, color: isDark ? '#8C8C96' : '#6B6B74', font: { family: 'Inter', size: 11 }, padding: 8 },
          grid:  { color: isDark ? '#26262B' : '#EEEEE9' }
        },
        x: {
          border: { display: false },
          ticks: { color: isDark ? '#8C8C96' : '#6B6B74', font: { family: 'Inter', size: 11 } },
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
        backgroundColor: catCounts.map(c => catColor(c.cat)),
        borderColor: isDark ? '#171719' : '#FFFFFF',
        borderWidth: 3,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: isDark ? '#ABABB4' : '#51515A', font: { family: 'Inter', size: 12 }, usePointStyle: true, pointStyle: 'circle' } }
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

// ── Insights: turn raw check-ins into plain-language observations ──
function buildInsights(habits, today = new Date()) {
  const out = [];
  const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const base = new Date(today); base.setHours(12, 0, 0, 0);
  const keyAt = n => { const d = new Date(base); d.setDate(d.getDate() - n); return dayKey(d); };
  const countOn = ds => habits.reduce((s, h) => s + ((h.completedDates || []).includes(ds) ? 1 : 0), 0);

  // 1) Momentum: last 7 days vs the 7 before
  let thisWeek = 0, lastWeek = 0;
  for (let n = 0; n < 7; n++) { thisWeek += countOn(keyAt(n)); lastWeek += countOn(keyAt(n + 7)); }
  if (thisWeek + lastWeek >= 3) {
    if (lastWeek === 0) out.push({ ic: 'trend-up', html: `<strong>${thisWeek} check-ins</strong> this week, up from none last week.` });
    else {
      const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
      if (pct > 0) out.push({ ic: 'trend-up', html: `<strong>Up ${pct}%</strong> on last week (${thisWeek} vs ${lastWeek} check-ins).` });
      else if (pct < 0) out.push({ ic: 'trend-down', html: `<strong>Down ${Math.abs(pct)}%</strong> from last week (${thisWeek} vs ${lastWeek} check-ins).` });
      else out.push({ ic: 'minus', html: `<strong>Steady.</strong> The same ${thisWeek} check-ins as last week.` });
    }
  }

  // 2) Strongest / weakest weekday over the last 8 weeks
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  let total = 0;
  for (let n = 0; n < 56; n++) {
    const c = countOn(keyAt(n));
    if (c) { const d = new Date(base); d.setDate(d.getDate() - n); byDay[d.getDay()] += c; total += c; }
  }
  if (total >= 7) {
    const max = Math.max(...byDay), min = Math.min(...byDay);
    const best = byDay.indexOf(max), worst = byDay.indexOf(min);
    out.push({ ic: 'award', html: `<strong>${WEEKDAYS[best]}</strong> are your strongest day (${max} check-ins in 8 weeks).` });
    if (best !== worst && min <= max * 0.5) out.push({ ic: 'calendar', html: `<strong>${WEEKDAYS[worst]}</strong> are your weakest day. A lighter routine that day may help.` });
  }

  // 3) Longest streak
  let bestStreak = 0, bestName = '';
  habits.filter(h => habitFreq(h) === 'daily').forEach(h => { const s = calcLongestStreak(h); if (s > bestStreak) { bestStreak = s; bestName = h.name; } });
  if (bestStreak >= 3) out.push({ ic: 'flame', html: `Longest streak: <strong>${bestStreak} days</strong> on \u201C${escHtml(bestName)}\u201D.` });

  // 4) Most consistent habit (last 30 days, daily habits only)
  let top = null;
  habits.filter(h => !h.frequency || h.frequency === 'daily').forEach(h => {
    let done = 0; for (let n = 0; n < 30; n++) if ((h.completedDates || []).includes(keyAt(n))) done++;
    if (!top || done > top.done) top = { name: h.name, done };
  });
  if (top && top.done >= 5) out.push({ ic: 'star', html: `Most consistent: <strong>\u201C${escHtml(top.name)}\u201D</strong>, ${top.done} of the last 30 days.` });

  return out;
}

function renderInsights() {
  const card = document.getElementById('insights-card'), list = document.getElementById('insights-list');
  if (!card || !list) return;
  const items = allHabits.length ? buildInsights(allHabits) : [];
  list.innerHTML = items.map(i => `<li><span class="ins-ic" aria-hidden="true"><svg class="icon"><use href="#i-${i.ic}"/></svg></span><span>${i.html}</span></li>`).join('');
  card.classList.toggle('hidden', !items.length);
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
  if (pct30 >= 80) summary = `You completed ${pct30}% of your habits over the last 30 days. Excellent consistency.`;
  else if (pct30 >= 50) summary = `You completed ${pct30}% of your habits over the last 30 days. Solid progress.`;
  else if (pct30 > 0) summary = `You completed ${pct30}% of your habits over the last 30 days. Showing up regularly will raise this.`;
  else summary = 'No completed habits in the last 30 days yet. Complete one today to start your record.';
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
    list.innerHTML = '<p class="empty-note">No daily habits tracked yet.</p>';
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
  updateXPUI();
  updateStreakShieldUI();
}

// Settings events
document.getElementById('notif-toggle').addEventListener('change', async e => {
  setRemindersWanted(e.target.checked);
  if (e.target.checked) await requestNotificationPermission();
  else {
    // Really switch them off: without this the saved token kept receiving reminders
    backgroundWrite(removePushToken(), 'turn off reminders');
    toast('Daily reminders turned off', 'info');
  }
});

const darkModeToggle = document.getElementById('dark-mode-toggle');
if (darkModeToggle) {
  darkModeToggle.checked = isDarkTheme();
  darkModeToggle.addEventListener('change', (e) => {
    localStorage.setItem('theme', e.target.checked ? 'dark' : 'light');
    applyTheme();
    renderHabits();
    if (location.hash === '#stats') renderStats();
  });
}

const soundToggle = document.getElementById('sound-toggle');
if (soundToggle) {
  soundToggle.checked = soundOn();
  soundToggle.addEventListener('change', e => {
    localStorage.setItem('habitly_sound', e.target.checked ? 'on' : 'off');
    if (e.target.checked) playPop();
  });
}
const confirmToggle = document.getElementById('confirm-toggle');
if (confirmToggle) {
  confirmToggle.checked = localStorage.getItem('habitly_confirm') !== 'off';
  confirmToggle.addEventListener('change', e => localStorage.setItem('habitly_confirm', e.target.checked ? 'on' : 'off'));
}
const analyticsToggle = document.getElementById('analytics-toggle');
if (analyticsToggle) {
  analyticsToggle.checked = localStorage.getItem('habitly_analytics') !== 'off';
  analyticsToggle.addEventListener('change', e => {
    localStorage.setItem('habitly_analytics', e.target.checked ? 'on' : 'off');
    toast(e.target.checked ? 'Anonymous usage data is on.' : 'Anonymous usage data is off.', 'info');
  });
}
const hapticsToggle = document.getElementById('haptics-toggle');
if (hapticsToggle) {
  hapticsToggle.checked = hapticsOn();
  hapticsToggle.addEventListener('change', e => {
    localStorage.setItem('habitly_haptics', e.target.checked ? 'on' : 'off');
    if (e.target.checked) buzz(30);
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

// ── Export Data Confirmation Flow ─────────────────────────
const exportDataBtn = document.getElementById('export-data-btn');
const confirmExportModal = document.getElementById('confirm-export-modal');
const confirmExportCancel = document.getElementById('confirm-export-cancel');
const confirmExportYes = document.getElementById('confirm-export-yes');

function openExportConfirmModal() {
  if (!allHabits || allHabits.length === 0) {
    toast('No habits to export', 'warning');
    return;
  }
  const summaryEl = document.getElementById('export-habit-summary');
  if (summaryEl) {
    summaryEl.textContent = `The report covers ${allHabits.length} habit${allHabits.length === 1 ? '' : 's'} and their completion history.`;
  }
  if (confirmExportModal) {
    confirmExportModal.classList.remove('hidden');
    confirmExportModal.style.opacity = '1';
  }
}

function closeExportConfirmModal() {
  if (confirmExportModal) confirmExportModal.classList.add('hidden');
}

async function executeDataExport() {
  closeExportConfirmModal();
  if (!allHabits || allHabits.length === 0) {
    toast('No habits to export', 'warning');
    return;
  }

  try {
    toast('Preparing your report…', 'info', 1500);
    try { await ensureLib('pdf'); }
    catch (_) { toast('Could not load the PDF generator. Check your connection and try again.', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // ── Header Banner ──
    doc.setFillColor(124, 58, 237); // #7C3AED
    doc.rect(0, 0, 210, 36, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Habitly', 14, 20);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Habit & Consistency Progress Report', 14, 28);

    const reportDate = new Date().toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    doc.setFontSize(9);
    doc.text(`Generated: ${reportDate}`, 196, 28, { align: 'right' });

    // ── User Info & Overview ──
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('User Profile & Summary', 14, 46);

    const userName = currentUser?.displayName || 'Habitly User';
    const userEmail = currentUser?.email || 'N/A';
    const totalHabits = allHabits.length;

    let totalCompletions = 0;
    allHabits.forEach(h => {
      totalCompletions += (h.completedDates || []).length;
    });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`User: ${userName} (${userEmail})`, 14, 54);
    doc.text(`Total Habits Tracked: ${totalHabits}    |    Total Check-ins Logged: ${totalCompletions}`, 14, 61);

    // ── Habits Table ──
    const tableRows = allHabits.map((h, idx) => {
      const cat = CATS[h.category] || CATS.health;
      const streak = calcHabitStreak(h);
      const longest = calcLongestStreak(h);
      const completions = (h.completedDates || []).length;
      const freq = (h.frequency || 'daily').toUpperCase();

      return [
        idx + 1,
        h.name || 'Untitled',
        cat.label || h.category,
        freq,
        `${streak} ${streakUnit(h, streak)}`,
        `${longest} ${streakUnit(h, longest)}`,
        completions
      ];
    });

    doc.autoTable({
      startY: 68,
      head: [['#', 'Habit Name', 'Category', 'Frequency', 'Current Streak', 'Best Streak', 'Total Done']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [124, 58, 237],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 65, 85]
      },
      alternateRowStyles: {
        fillColor: [247, 246, 255]
      },
      margin: { left: 14, right: 14 }
    });

    // ── Journal Notes Section (if any) ──
    const habitsWithNotes = allHabits.filter(h => h.notes && h.notes.length > 0);
    if (habitsWithNotes.length > 0) {
      let currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 14 : 140;
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Journal Notes', 14, currentY);
      currentY += 8;

      habitsWithNotes.forEach(h => {
        if (currentY > 265) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(124, 58, 237);
        doc.text(`• ${h.name}:`, 14, currentY);
        currentY += 6;

        h.notes.slice(-5).reverse().forEach(n => {
          if (currentY > 275) {
            doc.addPage();
            currentY = 20;
          }
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(`[${n.date}] ${n.text}`, 20, currentY);
          currentY += 5;
        });
        currentY += 4;
      });
    }

    // ── Footer with Page Numbers ──
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Habitly Report · Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
    }

    const filename = `habitly-report-${dayKey()}.pdf`;
    doc.save(filename);
    toast('Report downloaded', 'success');
  } catch (err) {
    console.error('PDF Export failed:', err);
    toast('Failed to export PDF: ' + err.message, 'error');
  }
}

if (exportDataBtn) {
  exportDataBtn.addEventListener('click', openExportConfirmModal);
}
if (confirmExportCancel) {
  confirmExportCancel.addEventListener('click', closeExportConfirmModal);
}
if (confirmExportModal) {
  confirmExportModal.addEventListener('click', (e) => {
    if (e.target === confirmExportModal) closeExportConfirmModal();
  });
}
if (confirmExportYes) {
  confirmExportYes.addEventListener('click', executeDataExport);
}

const delAccBtn = document.getElementById('delete-account-btn');
if (delAccBtn) {
  delAccBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to completely delete your account and all your habits? This cannot be undone.')) return;
    const user = currentUser;
    delAccBtn.disabled = true;
    let erasing = false;
    try {
      // 1) Check everything that could stop us BEFORE erasing anything. Firebase only deletes a login that
      //    signed in within the last few minutes, and deletes must reach the server, so being offline or
      //    having an old sign-in used to leave people with their data gone and their account still there.
      if (!navigator.onLine) {
        toast('You are offline. Connect to the internet to delete your account.', 'error', 6000);
        return;
      }
      const { authTime } = await user.getIdTokenResult(true);
      if (Date.now() - new Date(authTime).getTime() > 4 * 60000) {
        toast('For security, please sign out and sign back in, then delete your account straight away.', 'error', 8000);
        return;
      }

      // 2) Stop everything that writes to this account, so the profile is not re-created behind us.
      erasing = true;
      deletingAccount = true;
      if (unsubHabits) { unsubHabits(); unsubHabits = null; }
      if (userProfileUnsubscribe) { userProfileUnsubscribe(); userProfileUnsubscribe = null; }

      // 3) Erase every habit this account owns (asked from the server, so "Recently deleted" ones are included).
      const mine = await getDocs(query(collection(db, 'habits'), where('userId', '==', user.uid)));
      await Promise.all(mine.docs.map(d => deleteDoc(doc(db, 'habits', d.id))));
      await deleteDoc(doc(db, 'users', user.uid));

      // 4) Finally the login itself.
      await deleteUser(user);
      toast('Account deleted.', 'info');
    } catch (err) {
      console.warn('Account deletion failed:', err);
      toast(err.code === 'auth/requires-recent-login'
        ? 'For security, please sign out and sign back in, then delete your account straight away.'
        : erasing ? 'Could not finish deleting your account. Check your connection and tap Delete again.'
                  : 'Could not start deleting your account. Check your connection and try again.', 'error', 8000);
      if (erasing && currentUser && currentUser.uid === user.uid) {
        // Still signed in: bring the app back to life so Delete can be retried
        deletingAccount = false;
        updateAvatars(user);
        subscribeToHabits();
      }
    } finally {
      deletingAccount = false;
      delAccBtn.disabled = false;
    }
  });
}

// ── Push Notifications ────────────────────────────────────
const VAPID_KEY = "BE5rwPAdz5SJaPh4ML2Mqb8L-Ecdqj6lBjxpmMEt8T8VCkhvx3IjJuJ2GV5pa_80-YxE2rXXZ4SJbKGLAP-es1k";

// Don't spend the browser's one-shot permission prompt at sign-in, before the user has any reason to say yes.
// Already-granted users silently refresh their push token; everyone else is asked after their first completed
// habit (maybeAskForReminders) or via the Settings toggle.
async function initNotifications() {
  if (!messaging || typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted' && remindersWanted()) await requestNotificationPermission();
  else { const t = document.getElementById('notif-toggle'); if (t) t.checked = false; }
}

// The switch in Settings is remembered per device. (Browser permission alone used to decide, so reminders
// that had been switched off came straight back on the next visit.)
const REMINDERS_KEY = 'habitly_reminders';
function remindersWanted() { try { return localStorage.getItem(REMINDERS_KEY) !== 'off'; } catch (_) { return true; } }
function setRemindersWanted(on) { try { localStorage.setItem(REMINDERS_KEY, on ? 'on' : 'off'); } catch (_) {} }

let devicePushToken = null;    // this browser's push token, once registered in this session
let profilePushToken = null;   // the token saved on the profile (may belong to another device)
const userTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (_) { return null; } };

// Stop reminders to this device. Only removes the saved token if it is this device's own.
function removePushToken() {
  if (!currentUser || !devicePushToken || profilePushToken !== devicePushToken) return Promise.resolve();
  devicePushToken = null;
  return updateDoc(doc(db, 'users', currentUser.uid), { fcmToken: deleteField() });
}

const NOTIF_ASKED_KEY = 'habitly_notif_asked';
function maybeAskForReminders() {
  try {
    if (!messaging || typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    if (Date.now() - (+localStorage.getItem(NOTIF_ASKED_KEY) || 0) < 7 * 864e5) return;   // at most weekly
  } catch (_) { return; }
  setTimeout(() => { document.getElementById('notif-ask')?.classList.remove('hidden'); track('reminder_ask_shown'); }, 1800);
}
function closeReminderAsk() {
  document.getElementById('notif-ask')?.classList.add('hidden');
  try { localStorage.setItem(NOTIF_ASKED_KEY, String(Date.now())); } catch (_) {}
}
document.getElementById('notif-ask-no')?.addEventListener('click', () => { track('reminder_ask_dismissed'); closeReminderAsk(); });
document.getElementById('notif-ask-yes')?.addEventListener('click', async () => {
  track('reminder_ask_accepted');
  setRemindersWanted(true);
  closeReminderAsk();
  await requestNotificationPermission();
});

async function requestNotificationPermission() {
  if (!messaging) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      document.getElementById('notif-toggle').checked = false;
      if (perm === 'denied') toast('Notifications are blocked. Enable them in your browser settings to get reminders.', 'warning', 5000);
      return;
    }
    document.getElementById('notif-toggle').checked = true;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token || !currentUser) return;
    devicePushToken = token;
    // tz lets the reminder job work in the user's own day and send at their morning / evening
    backgroundWrite(setDoc(doc(db, 'users', currentUser.uid),
      { fcmToken: token, email: currentUser.email, tz: userTimeZone() },
      { merge: true }
    ), 'turn on reminders', true);
  } catch (err) {
    console.warn('Notification setup:', err.message);
  }
}

if (messaging) {
  // App is open: show the reminder as a toast. Reminders are data-only (see scripts/reminder-logic.js).
  onMessage(messaging, ({ notification, data }) => {
    const body = (data && data.body) || notification?.body;
    if (body) toast(body, 'info', 6000);
  });
}

// ── Service Worker ────────────────────────────────────────
// ── Social & Leaderboard ─────────────────────────────────
async function syncUserStats() {
  if (!currentUser || deletingAccount) return;
  
  let totalStreak = 0;
  let badgesCount = 0;
  
  allHabits.forEach(h => {
    const habitStreak = calcHabitStreak(h);
    totalStreak += habitStreak;
    const badge = getUserBadge(habitStreak);
    // Map badge name to a numeric level for storage
    const badgeLevels = { 'Starter': 1, 'Rising': 2, 'Bronze': 3, 'Silver': 4, 'Gold': 5, 'Master': 6, 'Diamond': 7, 'Mystic': 8, 'Ascended': 9, 'Legend': 10 };
    badgesCount += badgeLevels[badge.name] || 1;
  });
  
  try {
    await setDoc(doc(db, 'users', currentUser.uid), {
      displayName: currentUser.displayName || 'Anonymous',
      email: currentUser.email,
      totalStreak: totalStreak,
      totalBadges: badgesCount,
      tz: userTimeZone(),
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
  const longest = calcLongestStreak(habit);

  document.getElementById('details-current-streak').textContent = habitFreq(habit) === 'daily' ? streak : streakShort(habit, streak);
  document.getElementById('details-longest-streak').textContent = habitFreq(habit) === 'daily' ? longest : streakShort(habit, longest);
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
  
  backgroundWrite(updateDoc(doc(db, 'habits', h.id), { journals }), 'save your note');
  document.getElementById('details-journal-input').value = '';
});

function renderJournal(habit) {
  const list = document.getElementById('details-journal-list');
  list.innerHTML = '';
  if (!habit.journals || habit.journals.length === 0) {
    list.innerHTML = '<p class="journal-empty">No notes yet.</p>';
    return;
  }
  const sorted = [...habit.journals].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach(j => {
    const div = document.createElement('div');
    div.className = 'journal-entry';
    div.innerHTML = `
      <div class="journal-meta">
        <span>${new Date(j.date).toLocaleString()}</span>
        <button class="delete-journal-btn" data-date="${escHtml(j.date)}" aria-label="Delete note"><svg class="icon" aria-hidden="true" width="14" height="14"><use href="#i-trash"/></svg></button>
      </div>
      <div class="journal-text">${escHtml(j.text)}</div>`;
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
      backgroundWrite(updateDoc(doc(db, 'habits', h.id), { journals: newJournals }), 'delete the note');
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

// Has this habit already been completed for its current period (today / this week / this month)?
function isHabitDoneNow(h) {
  const dates = h.completedDates || [];
  if (h.frequency === 'weekly') return dates.some(isSameWeek);
  if (h.frequency === 'monthly') return dates.some(isSameMonth);
  return dates.includes(todayStr());
}

// The countdown is measured against the clock. Counting ticks drifts, because browsers slow timers down
// in background tabs, which is exactly where a focus timer spends its time.
let timerEndsAt = 0;
function stopTimerTicking() {
  clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById('timer-start').classList.remove('hidden');
  document.getElementById('timer-pause').classList.add('hidden');
}

function finishFocusSession() {
  stopTimerTicking();
  document.getElementById('timer-modal').classList.add('hidden');
  playChime();
  const h = activeTimerHabit && allHabits.find(x => x.id === activeTimerHabit.id);
  // A session completes the habit like a normal tick, for the normal XP, once. It used to add 50 XP every
  // time, even on a habit that was already done, so short sessions could be repeated for unlimited XP.
  if (!h || isHabitDoneNow(h)) { toast('Focus session complete.', 'success'); return; }
  const row = document.querySelector(`.habit-item[data-id="${CSS.escape(h.id)}"] .habit-check`);
  completeHabit(h.id, todayStr(), row);
}

function tickTimer() {
  timeLeft = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
  updateTimerDisplay();
  if (timeLeft <= 0) finishFocusSession();
}

document.getElementById('timer-start')?.addEventListener('click', () => {
  if (timerInterval) return;
  document.getElementById('timer-start').classList.add('hidden');
  document.getElementById('timer-pause').classList.remove('hidden');
  timerEndsAt = Date.now() + timeLeft * 1000;
  timerInterval = setInterval(tickTimer, 1000);
});
document.addEventListener('visibilitychange', () => { if (timerInterval && !document.hidden) tickTimer(); });   // catch up at once on return

document.getElementById('timer-pause')?.addEventListener('click', () => {
  if (timerInterval) timeLeft = Math.max(1, Math.ceil((timerEndsAt - Date.now()) / 1000));
  stopTimerTicking();
  updateTimerDisplay();
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

