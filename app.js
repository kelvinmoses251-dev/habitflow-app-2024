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
import * as rules from "./habit-rules.js?v=7";
import { timeSlot, currentSlot, slotOrder, SLOT_LABEL, weekDots, attachSwipe, attachReorder, planReorder, habitsOnDay, shiftDay, matchesFilter } from "./home.js?v=7";
import { setBusy, setFieldError, clearFieldError, enhanceSelect, watchDialogs, toast } from "./ui.js?v=8";
import { LEVELS, levelInfo, xpHistory, milestoneCrossed, MILESTONE_LINES, achievements, daysAway, daysMissed, lastDoneDay, MOODS, moodInsights, moodOf, dayRecap, perfectStretch } from "./motivation.js?v=2";
import * as moments from "./moments.js?v=1";
import { habitSummary, monthGrid, weeklyRates, weekdayRates, yearCells, searchNotes, habitInsights, sessionTotals, withSession } from "./habit-history.js?v=1";
import * as habitPage from "./habit-page.js?v=1";
import { createSounds, SOUND_THEMES, soundTheme } from "./sounds.js?v=1";
watchDialogs();   // one behaviour for every dialog: focus, scroll lock, backdrop and drag dismissal

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
    // The page title and address are pinned: a habit's page has the habit's id in its address, and could have its
    // name in the tab title. Neither may leave the device.
    analyticsReady.then(x => { if (x) x.m.logEvent(x.a, name, { ...params, page_title: 'Habitly', page_location: location.origin + location.pathname }); });
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

// The sounds themselves live in sounds.js, in three themes (Soft, Wood, Glass). These names are what the rest of
// the app calls; each plays the chosen theme's version, or nothing at all when sound is off.
const chosenSoundTheme = () => { try { return soundTheme(localStorage.getItem('habitly_sound_theme')); } catch (_) { return 'soft'; } };
const sounds = createSounds(getAudioContext, chosenSoundTheme);
const playPop = () => sounds.tick();
const playUncheck = () => sounds.untick();
const playChime = () => sounds.chime();
const playLevelUpSound = () => sounds.levelUp();

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

// A habit may carry its own icon and colour. Both are optional and validated against these lists, so anything
// unexpected in the data simply falls back to the category's look.
const HABIT_COLORS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'slate'];
const HABIT_ICONS = [...Object.keys(CATS).map(k => 'cat-' + k), 'drop', 'bed', 'heart', 'leaf', 'coffee', 'pen', 'music', 'flame', 'star', 'target', 'clock',
  'sun', 'sunrise', 'moon', 'home', 'phone', 'calendar', 'bell', 'award'];
const ICON_NAME = k => (k.startsWith('cat-') ? CATS[k.slice(4)].label : k.charAt(0).toUpperCase() + k.slice(1));
const iconSvg = key => `<svg class="icon" aria-hidden="true"><use href="#i-${key}"/></svg>`;
function habitLook(h) {
  const cat = CATS[h.category] || CATS.health;
  return {
    cat,
    icon: HABIT_ICONS.includes(h.icon) ? iconSvg(h.icon) : cat.icon,
    color: HABIT_COLORS.includes(h.color) ? `var(--hc-${h.color})` : catColor(cat),     // the token follows the theme by itself
  };
}

// The four dropdowns become designed lists (ui.js). Category ones show each category's icon in its colour.
const catChip = value => (CATS[value] ? `<span class="cat-ico" style="--cat:${catColor(CATS[value])}">${CATS[value].icon}</span>` : '');
enhanceSelect(document.getElementById('habit-category'), { iconFor: catChip });
['habit-frequency', 'habit-time', 'habit-times', 'habit-reminder', 'details-time'].forEach(id => enhanceSelect(document.getElementById(id)));
// A habit may have its own reminder hour (0 to 23, local time). Anything else is "no reminder".
const hasReminder = h => Number.isInteger(h?.reminderHour) && h.reminderHour >= 0 && h.reminderHour <= 23;
const hourLabel = hour => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;

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
let justCompletedAt = 0;        // when that happened (performance.now), so a redrawn row carries its effect on instead of restarting it
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
  document.getElementById('focus-view')?.classList.add('hidden');
  focusQueue = []; focusAt = 0;
  revealedId = null;
  pendingComplete.forEach(clearTimeout); pendingComplete.clear();
  pendingUncomplete.forEach(clearTimeout); pendingUncomplete.clear();
  moments.resetCelebrations();
  moments.hideMoment();
  ['milestone-modal', 'level-modal', 'achievements-modal', 'comeback-modal', 'recap-modal'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  homeFilter = { category: 'all', text: '' };
  { const box = document.getElementById('habit-search'); if (box) box.value = ''; }
  viewDay = null;
  renderDayHeader();
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
  currentDetailsHabitId = null; habitRouteId = null; document.title = BASE_TITLE;    // nothing of this account's is left on show
  habitsFresh = false; clearTimeout(freshTimer); freshTimer = 0;
  achievementsMemo = null; stretchMemo = null;
  previousMaxStreak = null;
}

// A streak is counted in the habit's own period: days for daily habits, weeks for weekly, months for monthly.
// (Weekly and monthly habits used to be counted in days, so four weeks in a row showed as a 1-day streak.)
const habitFreq = h => (h.frequency === 'weekly' || h.frequency === 'monthly') ? h.frequency : 'daily';
const streakUnit = (habit, n) => ({ daily: 'day', weekly: 'week', monthly: 'month' })[habitFreq(habit)] + (n === 1 ? '' : 's');
const streakShort = (habit, n) => ({ daily: String(n), weekly: n + ' wk', monthly: n + ' mo' })[habitFreq(habit)];

// The headline streak on Home, the share card and the tiers are in DAYS, so only daily habits count towards it.
function calcStreak(habits) {
  const today = todayStr();
  const daily = (habits || []).filter(h => habitFreq(h) === 'daily' && inPlay(h, today));
  if (!daily.length) return 0;
  return Math.max(...daily.map(calcHabitStreak));
}

// The rules themselves (what is due, what is done, what counts as a streak) live in habit-rules.js, which the
// reminder job uses too. These two only supply today's date and the account's shield days.
// Archived habits, and ones whose run has ended, keep their history but are no longer "in play".
const inPlay = (h, today) => !h.archivedAt && !rules.hasEndedOn(h, today);
function calcHabitStreak(habit) {
  return rules.habitStreak(habit, todayStr(), userFrozenDates || []);
}

function calcLongestStreak(habit) {
  return rules.habitLongestStreak(habit, todayStr(), userFrozenDates || []);
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
// The ladder itself (ten levels, what each means) lives in motivation.js, with the rest of what is worked out
// from a person's record.
let currentUserXP = 0;
const getLevelInfo = levelInfo;

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
  document.getElementById('open-level')?.setAttribute('aria-label', `Level ${info.level}, ${info.title}. Open your level page`);
  if (levelPageOpen()) renderLevelPage();
  updateAchievements();
}

// ── Achievements: worked out from the record, announced once ──
// This device remembers which ones it has already announced (habitly_achievements_<uid>). The first time it looks,
// it notes what is already earned without a word: nobody wants eight toasts for things they did last year.
const achievementsOpen = () => { const m = document.getElementById('achievements-modal'); return !!m && !m.classList.contains('hidden'); };
// Summing a long record is real work and this is asked several times per tap, so the answer is kept until the
// habits, the day, the level or the shield days change. (allHabits is a new array after every change of data.)
let habitsFresh = false, freshTimer = 0;      // has the server (not just this device's cache) said what the habits are?
const mayRaiseCards = () => habitsFresh || navigator.onLine === false;   // offline, the cache is all there is
let stretchMemo = null;
let achievementsMemo = null;
function derivedAchievements() {
  const today = todayStr(), level = getLevelInfo(currentUserXP).level, frozen = userFrozenDates || [], m = achievementsMemo;
  if (!m || m.habits !== allHabits || m.today !== today || m.level !== level || m.frozen !== frozen) {
    achievementsMemo = { habits: allHabits, today, level, frozen, items: achievements(allHabits, { today, xp: currentUserXP, frozen }) };
  }
  return achievementsMemo.items;
}
function knownAchievements() {
  try { const v = JSON.parse(localStorage.getItem(`habitly_achievements_${currentUser.uid}`) || 'null'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : null; } catch (_) { return null; }
}
// What the gallery shows: what the record says, plus anything this device has already seen earned. Deleting or
// archiving a habit later does not take an achievement back.
function myAchievements() {
  const kept = new Set(knownAchievements() || []);
  return derivedAchievements().map(a => (!a.earned && kept.has(a.id) ? { ...a, earned: true, have: a.goal } : a));
}
function updateAchievements() {
  if (!currentUser || !habitsLoaded || !userDocLoaded) return;
  const items = myAchievements(), earned = items.filter(a => a.earned);
  const row = document.getElementById('s-achievements');
  if (row) row.textContent = `${earned.length} of ${items.length}`;
  if (achievementsOpen()) moments.renderAchievements(document.getElementById('achievements-body'), items);
  const key = `habitly_achievements_${currentUser.uid}`;
  const known = knownAchievements();
  const fresh = known ? earned.filter(a => !known.includes(a.id)) : [];
  if (known && !fresh.length) return;
  try { localStorage.setItem(key, JSON.stringify([...new Set([...(known || []), ...earned.map(a => a.id)])])); } catch (_) {}
  if (!fresh.length) return;
  // Said a moment later, so it follows the "Completed" toast (and its Undo) instead of jumping ahead of it
  const uid = currentUser.uid;
  setTimeout(() => {
    if (!currentUser || currentUser.uid !== uid) return;
    toast(fresh.length === 1 ? `Achievement earned: ${fresh[0].name}` : `${fresh.length} achievements earned`, 'success', 6000, { label: 'View', onClick: openAchievements });
  }, 1500);
  track('achievement_earned', { count: fresh.length });
}
function openAchievements() {
  moments.renderAchievements(document.getElementById('achievements-body'), myAchievements());
  document.getElementById('achievements-modal').classList.remove('hidden');
  track('achievements_opened');
}
document.getElementById('open-achievements')?.addEventListener('click', openAchievements);
document.getElementById('achievements-close')?.addEventListener('click', () => document.getElementById('achievements-modal').classList.add('hidden'));

// ── The level page: what the level means, what is next, where the XP came from ──
const levelPageOpen = () => { const m = document.getElementById('level-modal'); return !!m && !m.classList.contains('hidden'); };
function renderLevelPage() {
  const info = getLevelInfo(currentUserXP);
  document.getElementById('level-title').textContent = `Level ${info.level} · ${info.title}`;
  moments.renderLevel(document.getElementById('level-body'), { info, levels: LEVELS, history: xpHistory(allHabits, todayStr()), today: todayStr() });
}
function openLevelPage() {
  renderLevelPage();
  document.getElementById('level-modal').classList.remove('hidden');
  track('level_page_opened');
}
['open-level', 'open-level-profile'].forEach(id => document.getElementById(id)?.addEventListener('click', openLevelPage));
document.getElementById('level-close')?.addEventListener('click', () => document.getElementById('level-modal').classList.add('hidden'));

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
  const modal = document.getElementById('level-up-modal');
  if (!modal) return;
  moments.queueDialog(modal, () => {                  // one celebration at a time: it waits for any card already up
    if (!currentUser) return false;
    playLevelUpSound();
    buzz([60, 40, 60]);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('level-up-new-level', `Level ${info.level}`);
    set('level-up-new-title', info.title);
    set('level-up-perk-text', `You reached level ${info.level}. Next level at ${info.levelTargetXP.toLocaleString()} XP.`);
    modal.style.opacity = '1';
  });
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
  refreshShieldOffer(true);
}

// 2) The shield is a choice. When a day was missed and a shield could save a streak, the app asks; it never spends
//    one on its own. A shield guards an existing streak: it is not offered to a brand-new account, for a streak
//    that already ended, or for a day when nothing was due.
const shieldNoKey = () => `habitly_shield_no_${currentUser.uid}`;
function shieldOffer() {
  if (!currentUser || !userDocLoaded || !allHabits.length || userStreakShields <= 0) return null;
  const yesterdayStr = dayKeyOffset(-1), today = todayStr();
  if (userFrozenDates.includes(yesterdayStr) || allHabits.some(h => (h.completedDates || []).includes(yesterdayStr))) return null;   // nothing was missed
  const owed = allHabits.filter(h => habitFreq(h) === 'daily' && rules.isDueOn(h, yesterdayStr));
  if (!owed.length) return null;                // nothing was due yesterday (a rest day, everything paused): no shield needed
  // Covering yesterday must join today to a streak that was running (worth at least the day itself plus one more)
  const saved = owed.map(h => ({ h, kept: rules.habitStreak(h, today, [...userFrozenDates, yesterdayStr]), now: rules.habitStreak(h, today, userFrozenDates) }))
    .filter(x => x.kept - x.now >= 2).sort((a, b) => b.kept - a.kept);
  if (!saved.length) return null;               // no streak running into yesterday
  try { if (localStorage.getItem(shieldNoKey()) === yesterdayStr) return null; } catch (_) {}   // they said no
  return { day: yesterdayStr, streak: saved[0].kept, habitName: saved[0].h.name };
}
function useShield(day) {
  if (userStreakShields <= 0 || userFrozenDates.includes(day)) return;
  userStreakShields = Math.max(0, userStreakShields - 1);
  userFrozenDates = [...userFrozenDates, day];
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
  toast('Streak shield used. Yesterday is covered.', 'success', 5000);
  track('shield_used');
}
function showShieldQuestion(offer) {
  moments.showMoment({ id: 'shield', title: 'You missed yesterday',
    text: `Use your shield to keep your ${offer.streak}-day streak on ${offer.habitName}?`,
    actions: [{ label: 'Use shield', onClick: () => answerShield(true) }, { label: 'Let it go', onClick: () => answerShield(false) }] });
}
function answerShield(use) {
  const offer = shieldOffer();                  // judged again at the moment of the tap: midnight may have passed
  moments.hideMoment('shield');
  if (!offer) toast('That day can no longer be covered.', 'info');
  else if (use) useShield(offer.day);
  else {
    try { localStorage.setItem(shieldNoKey(), offer.day); } catch (_) {}
    toast('Shield kept. Your streak starts again today.', 'info', 4500);
    track('shield_declined');
  }
  refreshShieldOffer();
}
// Keep the Shield tile and the card in step with what is true now. mayRaise: the app may put the question up
// itself (once a day at most, shared with the other unprompted cards). Otherwise it waits behind the Shield tile.
function refreshShieldOffer(mayRaise = false) {
  if (!currentUser) return;
  const offer = shieldOffer();
  const tile = document.getElementById('greeting-shield-badge');
  if (tile) {
    tile.classList.toggle('has-offer', !!offer);
    tile.setAttribute('aria-label', offer ? 'Streak shield. You missed yesterday: use your shield?' : `Streak shields: ${userStreakShields}. What a shield does`);
    const sub = document.getElementById('greeting-shield-sub');
    if (sub) sub.textContent = offer ? 'Use it?' : 'Safety net';
  }
  if (!offer) { moments.hideMoment('shield'); return; }
  if (moments.momentShowing() === 'shield') { showShieldQuestion(offer); return; }      // keep its words current
  if (mayRaise && mayRaiseCards() && !moments.momentShowing() && moments.momentAllowed(currentUser.uid, todayStr())) {
    moments.markMoment(currentUser.uid, todayStr());
    showShieldQuestion(offer);
    track('shield_offer_shown');
  }
}
// ── The day's recap: what got done, what is open, the XP, the streak, tomorrow ──
// Opened from the ring on Home and from the all-done card. In the evening the app may offer it once, through the
// moment card (and only if no other card has been raised today).
const RECAP_FROM_HOUR = 20;
const recapOfferOn = () => prefOn('habitly_recap');         // Profile: "Evening recap". The recap itself is always a tap away.
const recapOpen = () => { const m = document.getElementById('recap-modal'); return !!m && !m.classList.contains('hidden'); };
function renderRecapSheet() {
  const today = todayStr();
  const now = new Date(), part = o => now.toLocaleDateString('en', o);
  document.getElementById('recap-title').textContent = `${part({ weekday: 'long' })} ${now.getDate()} ${part({ month: 'long' })}`;   // "Thursday 26 November", as the rest of the app writes dates
  moments.renderRecap(document.getElementById('recap-body'), {
    recap: dayRecap(allHabits, today, { frozen: userFrozenDates || [] }), moods: MOODS,
    moodOf: h => moodOf(h, today),
    countOf: h => { const goal = rules.targetOf(h); return goal ? countLabel(rules.progressOn(h, today), goal) : ''; },
  });
}
function openRecap() {
  moments.hideMoment('recap');
  renderRecapSheet();
  moments.holdFor(document.getElementById('recap-modal'));     // anything queued behind the all-done card waits for the recap to close
  document.getElementById('recap-modal').classList.remove('hidden');
  document.getElementById('all-done-overlay')?.classList.add('hidden');
  track('recap_opened');
}
function maybeOfferRecap() {
  if (!currentUser || !habitsLoaded || !userDocLoaded || !mayRaiseCards() || moments.momentShowing() || recapOpen()) return;
  if (!recapOfferOn() || new Date().getHours() < RECAP_FROM_HOUR) return;
  const today = todayStr(), r = dayRecap(allHabits, today, { frozen: userFrozenDates || [] });
  if (!r.total || !moments.momentAllowed(currentUser.uid, today)) return;
  moments.markMoment(currentUser.uid, today);
  moments.showMoment({ id: 'recap', title: 'Your day in review',
    text: r.open.length ? `${r.done.length} of ${r.total} done today, ${r.open.length} still open.` : `All ${r.total} done today. See how it went.`,
    actions: [{ label: 'See recap', onClick: openRecap }] });
  track('recap_offered');
}
document.getElementById('today-ring')?.addEventListener('click', openRecap);
document.getElementById('all-done-recap')?.addEventListener('click', openRecap);
document.getElementById('recap-close')?.addEventListener('click', () => document.getElementById('recap-modal').classList.add('hidden'));
document.getElementById('recap-body')?.addEventListener('click', e => {
  const b = e.target.closest('[data-recap-complete]');
  if (b) completeHabit(b.dataset.recapComplete, todayStr(), null);
});
setInterval(maybeOfferRecap, 60000);                  // the evening arrives while the app is open

// ── Welcome back: after three or more days with nothing ticked ──
// Said once per absence (this device remembers the last completion day it spoke for). The card offers to ease back
// in: keep the habits that matter now and pause the rest, which loses nothing and is undone with Resume.
const comebackKey = () => `habitly_comeback_${currentUser.uid}`;
const comebackHabits = () => { const t = todayStr(); return allHabits.filter(h => inPlay(h, t) && !rules.isPausedOn(h, t) && !rules.notStartedOn(h, t)); };
function maybeWelcomeBack() {
  if (!currentUser || !habitsLoaded || !userDocLoaded) return;
  const today = todayStr(), away = daysAway(allHabits, today);
  // "Away" is three or more days on which something was owed and left: a weekly habit, or rest days, are not absence
  if (away < 3 || daysMissed(allHabits, today) < 3) { moments.hideMoment('comeback'); return; }
  if (!mayRaiseCards() || moments.momentShowing() || !comebackHabits().length) return;
  const last = lastDoneDay(allHabits, today);
  try { if (localStorage.getItem(comebackKey()) === last) return; } catch (_) {}
  if (!moments.momentAllowed(currentUser.uid, today)) return;
  moments.markMoment(currentUser.uid, today);
  try { localStorage.setItem(comebackKey(), last); } catch (_) {}
  moments.showMoment({ id: 'comeback', title: 'Welcome back',
    text: `It has been ${away} days. Nothing is lost. Carry on as you were, or ease back in with fewer habits.`,
    actions: [{ label: 'Ease back in', onClick: openComeback }] });
  track('comeback_shown', { days: away });
}
function openComeback() {
  moments.hideMoment('comeback');
  const total = calcTotalDone(allHabits);
  const best = Math.max(0, ...allHabits.filter(h => habitFreq(h) === 'daily').map(calcLongestStreak));
  document.getElementById('comeback-kept').textContent = `Still yours: ${total.toLocaleString('en')} check-in${total === 1 ? '' : 's'}${best > 1 ? ` and a best streak of ${best} days` : ''}.`;
  moments.renderComeback(document.getElementById('comeback-list'), comebackHabits().map(h => {
    const n = (h.completedDates || []).length;
    return { id: h.id, name: h.name || 'Habit', sub: `${(CATS[h.category] || CATS.health).label} · ${n} check-in${n === 1 ? '' : 's'}` };
  }));
  syncComebackButton();
  document.getElementById('comeback-modal').classList.remove('hidden');
  track('comeback_opened');
}
function syncComebackButton() {
  const boxes = [...document.querySelectorAll('#comeback-list .pick-check')], kept = boxes.filter(b => b.checked).length;
  const go = document.getElementById('comeback-go');
  go.disabled = kept === 0;
  go.textContent = kept === boxes.length ? `Start again with all ${kept}` : `Start again with ${kept}`;
  document.getElementById('comeback-none').classList.toggle('hidden', kept > 0);
}
document.getElementById('comeback-list')?.addEventListener('change', syncComebackButton);
document.getElementById('comeback-cancel')?.addEventListener('click', () => document.getElementById('comeback-modal').classList.add('hidden'));
document.getElementById('comeback-go')?.addEventListener('click', () => {
  const today = todayStr();
  const rest = [...document.querySelectorAll('#comeback-list .pick-check')].filter(b => !b.checked).map(b => allHabits.find(h => h.id === b.dataset.id)).filter(Boolean);
  rest.forEach(h => backgroundWrite(updateDoc(doc(db, 'habits', h.id), { pauses: rules.withPause(h, today) }), 'pause the habit'));
  document.getElementById('comeback-modal').classList.add('hidden');
  toast(rest.length ? `${rest.length} habit${rest.length === 1 ? '' : 's'} paused. Resume ${rest.length === 1 ? 'it' : 'them'} from Today when you are ready.` : 'Welcome back. Everything is as you left it.', 'success', 5000);
  track('comeback_restart', { paused: rest.length });
});

document.getElementById('greeting-shield-badge')?.addEventListener('click', () => {
  const offer = shieldOffer();
  if (offer) { showShieldQuestion(offer); return; }
  toast(userStreakShields > 0
    ? 'A streak shield covers one missed day. If you miss a day, you choose whether to use it.'
    : 'Your shield has been used. A new one arrives a week after the last one was spent.', 'info', 6000);
});

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
  moments.holdFor(document.getElementById('share-card-modal'));   // a queued card waits for the share sheet to close
  openShareCardModal();
  if (overlay) overlay.classList.add('hidden');
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
// toast() lives in ui.js

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
    summaryForcedOpen = true; applySummaryState();       // the tour's second stop explains the whole summary
    let completed, step;
    try { ({ completed, step } = await startTour()); } finally { summaryForcedOpen = false; applySummaryState(); }
    try { localStorage.setItem(userKey, '1'); } catch (_) { /* storage unavailable */ }
    track(completed ? 'tour_completed' : 'tour_skipped', { step });
    if (completed && !allHabits.length) openHabitSheet();   // the tour ends on the first action to take
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
  const dailyHabits = allHabits.filter(h => (!h.frequency || h.frequency === 'daily') && rules.isDueOn(h, today));
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
    // Signed out in the half second since the last tick: there is no one to celebrate with or to save a bonus for
    if (!currentUser) { isCelebrating = false; return; }
    moments.queueDialog(document.getElementById('all-done-overlay'), () => {   // the card waits its turn; the bonus below does not
      if (!currentUser) return false;
      playChime();
      const n = Math.max(calcStreak(allHabits), 1);
      const line = document.getElementById('all-done-text');
      if (line) line.textContent = `You completed every daily habit. Your streak is ${n} day${n === 1 ? '' : 's'}.`;
    });
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

  function navigate(route) {
    const [name, ...rest] = String(route || 'home').split('/');
    const page = name || 'home', arg = rest.join('/');   // "habit/<id>": the page, and which habit
    pages.forEach(p => {
      const active = p.id === `page-${page}`;
      p.classList.toggle('active', active);
    });
    const tab = page === 'habit' ? 'home' : page;       // a habit's page belongs to Home
    links.forEach(l    => { const on = l.dataset.page === tab; l.classList.toggle('active', on); on ? l.setAttribute('aria-current', 'page') : l.removeAttribute('aria-current'); });
    bnItems.forEach(b  => { const on = b.dataset.page === tab; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    habitPageRouted(page === 'habit', arg);
    if (page === 'stats')   renderStats();
    if (page === 'profile') renderProfile();
  }

  window.addEventListener('hashchange', () => navigate(location.hash.replace('#', '')));
  navigate(location.hash.replace('#', '') || 'home');
}

// ── Escape closes the top-most dialog (keyboard users were trapped in modals) ──
const ESC_CLOSERS = [   // ordered top of the stack first
  ['share-card-modal', 'share-card-close'], ['milestone-modal', 'milestone-close'], ['level-up-modal', 'level-up-claim-btn'], ['level-modal', 'level-close'], ['achievements-modal', 'achievements-close'], ['comeback-modal', 'comeback-cancel'], ['recap-modal', 'recap-close'],
  ['confirm-export-modal', 'confirm-export-cancel'], ['confirm-check-modal', 'confirm-check-cancel'],
  ['crop-modal', 'crop-cancel'], ['recovery-modal', 'recovery-close'], ['archive-modal', 'archive-close'], ['library-modal', 'library-close'],
  ['habit-sheet', 'habit-cancel'], ['timer-modal', 'timer-close'], ['all-done-overlay', 'all-done-close'],
  ['focus-view', 'focus-exit'],
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
  if (moments.momentShowing()) { moments.dismissMoment(); e.preventDefault(); }   // no dialog open: Escape puts the card away
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

// Until the first habits arrive, Today shows four still placeholder rows instead of an empty list.
function showHabitPlaceholders() {
  if (habitsLoaded) return;
  const list = document.getElementById('habits');
  list.setAttribute('aria-busy', 'true');
  list.innerHTML = Array.from({ length: 4 }, () =>
    '<li class="skel-row" aria-hidden="true"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line"></span><span class="skel skel-line short"></span></span></li>').join('');
  document.getElementById('empty-state').classList.add('hidden');
}

function showApp() {
  updateOnlineStatus();
  showHabitPlaceholders();
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
      if (userDocLoaded) refreshShieldOffer();        // answered on another device: the question here goes too
    }
    // Only a server answer can tell us the account has no XP: a cache miss looks the same as "no profile".
    if (!docSnap.metadata.fromCache && !docSnap.metadata.hasPendingWrites) {
      profileHasXP = docSnap.exists() && typeof docSnap.data().xp === 'number';
    }
    if (!userDocLoaded) {
      userDocLoaded = true;
      if (allHabits.length) { checkAndApplyStreakShield(); renderHabits(); updateStreak(); maybeWelcomeBack(); }
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
// `extra` holds the optional fields (timeOfDay, icon, color, …). Only fields that have a value are stored:
// an absent field means "the default", which is what keeps old habits working unchanged.
function addHabit(name, category, frequency, extra = {}) {
  if (!currentUser) return Promise.resolve();
  const optional = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'any'));
  return addDoc(collection(db, 'habits'), {
    userId:         currentUser.uid,
    name,
    category,
    frequency:      frequency || 'daily',
    completedDates: [],
    createdAt:      new Date().toISOString(),
    order:          Date.now(),
    ...optional
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
    const goal = h && rules.targetOf(h);
    if (goal) {                                          // a counting habit goes back one step, to where it was before the last tap
      const fallback = Math.max(0, Math.round((goal.amount - goal.step) * 1000) / 1000);
      const was = stepBack.has(id) && stepBack.get(id) < goal.amount ? stepBack.get(id) : fallback;
      stepBack.delete(id);
      updatePayload[`progress.${d}`] = was > 0 ? was : deleteField();
    }
    if (h && h.completedTimestamps && h.completedTimestamps[d]) {
      updatePayload[`completedTimestamps.${d}`] = deleteField();
    }
    if (h && h.moods && typeof h.moods === 'object' && d in h.moods) updatePayload[`moods.${d}`] = deleteField();   // how it felt goes with it
    if (h && h.backfilled && typeof h.backfilled === 'object' && d in h.backfilled) updatePayload[`backfilled.${d}`] = deleteField();
    backgroundWrite(updateDoc(habitRef, updatePayload), 'update your habit');
  } else {
    // Checking the habit. A counting habit completed by any route (the last +, focus view, a swipe) has its count filled.
    const h = allHabits.find(x => x.id === id);
    const goal = h && rules.targetOf(h);
    backgroundWrite(updateDoc(habitRef, {
      completedDates: arrayUnion(d),
      [`completedTimestamps.${d}`]: now,
      ...(goal ? { [`progress.${d}`]: Math.max(goal.amount, rules.progressOn(h, d)) } : {})
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
    // The first snapshot can come from this device's cache and be days out of date. Cards the app raises itself
    // wait for the server (or, when the cache was already right and no second snapshot comes, a few seconds).
    if (!snap.metadata.fromCache) habitsFresh = true;
    else if (!habitsFresh && !freshTimer) freshTimer = setTimeout(() => { freshTimer = 0; if (!currentUser || habitsFresh) return; habitsFresh = true; checkAndApplyStreakShield(); maybeWelcomeBack(); maybeOfferRecap(); }, 3500);

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

    habitsLoaded = true;
    renderHabits();
    if (!document.getElementById('archive-modal')?.classList.contains('hidden')) renderArchive();   // keep an open archive current
    if (!document.getElementById('library-modal')?.classList.contains('hidden')) renderLibrary();   // and "Added" in an open library
    if (levelPageOpen()) renderLevelPage();
    updateAchievements();
    if (userDocLoaded) updateStreak();   // before that, shield data is still defaults
    syncUserStats();

    seedXPFromHistory();
    updateXPUI();
    checkAndApplyStreakShield();
    updateStreakShieldUI();
    maybeWelcomeBack();
    maybeOfferRecap();
    if (recapOpen()) renderRecapSheet();

    if (location.hash === '#stats') renderStats();
    if (location.hash === '#profile') renderProfile();
    if (!document.getElementById('recovery-modal').classList.contains('hidden')) {
      renderDeletedHabits();
    }
  }, err => {
    // The list could not be read (signed out elsewhere, a rules change, no access). Say so: placeholder rows
    // that never resolve look like the app is still loading.
    console.warn('Could not load habits:', err);
    const list = document.getElementById('habits');
    list.removeAttribute('aria-busy');
    list.innerHTML = '<li class="load-error"><span>Could not load your habits. Check your connection, then try again.</span><button type="button" class="btn-secondary" id="habits-retry">Try again</button></li>';
    document.getElementById('habits-retry').addEventListener('click', () => { showHabitPlaceholders(); subscribeToHabits(); });
  });
}

// ── Render: Home ──────────────────────────────────────────
function renderHabits() {
  const list  = document.getElementById('habits');
  const empty = document.getElementById('empty-state');
  const t     = todayStr();

  // Nothing is known yet: keep the placeholders, and do not show the empty state or open the form on a guess.
  if (!habitsLoaded) return;
  // The list is rebuilt on every change. Remember which control in which row had keyboard focus, and give it back.
  const act = document.activeElement, actRow = act?.closest?.('#page-home .habit-item');
  const focusSel = !actRow ? null : act.classList.contains('row-grip') ? '.row-grip' : act.classList.contains('habit-check') ? '.habit-check' : act.classList.contains('habit-step') ? '.habit-step'
    : act.dataset.action ? `[data-action="${act.dataset.action}"]` : null;
  const focusRowId = focusSel ? actRow.dataset.id : null;
  document.getElementById('page-home').classList.toggle('has-habits', allHabits.length > 0);
  list.removeAttribute('aria-busy');
  list.innerHTML = '';

  if (!allHabits.length) {
    ['week-card', 'month-card', 'no-daily'].forEach(id => document.getElementById(id).classList.add('hidden'));
    ['habits-week', 'habits-month'].forEach(id => { document.getElementById(id).innerHTML = ''; });
    viewDay = null;
    renderDayHeader();
    renderFilterBar(false);
    renderAsides();
    document.getElementById('no-match').classList.add('hidden');
    document.getElementById('focus-open')?.classList.add('hidden');
    empty.classList.remove('hidden');
    renderStarterPacks();
    updateProgress(0, 0);
    updateStreakRisk();
    return;
  }
  empty.classList.add('hidden');

  renderDayHeader();
  const pastDay = viewingPast();
  if (pastDay) {                                        // a past day: read-only, and today's progress above stays as it is
    document.getElementById('home-filter')?.classList.add('hidden');
    document.getElementById('no-match')?.classList.add('hidden');
    document.getElementById('focus-open')?.classList.add('hidden');
    renderAsides();
    renderPastDay(pastDay);
    return;
  }
  renderFilterBar(allHabits.length >= FILTER_FROM);
  const filtering = filterActive();
  let shownRows = 0;

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

  // Daily habits whose schedule skips today (a Mon/Wed/Fri habit on a Tuesday) are not in today's list or counts.
  // Habits that are archived or past their end date are out of the list (their history stays in the stats).
  // Ones whose start date is still ahead wait in a quiet line at the foot of Today.
  const upcoming = sorted.filter(h => !h.archivedAt && rules.notStartedOn(h, t));
  const active = sorted.filter(h => rules.isActiveOn(h, t));
  const paused = active.filter(h => rules.isPausedOn(h, t));
  const inPlay = active.filter(h => !paused.includes(h));
  const resting = inPlay.filter(h => rules.baseFreq(h) === 'daily' && !rules.isDueOn(h, t));
  sorted.splice(0, sorted.length, ...inPlay.filter(h => !resting.includes(h)));
  renderAsides({ resting, upcoming, paused });

  // Today is grouped by time of day as soon as one daily habit has a time. The part of the day it is now
  // comes first. (A stable sort keeps the order above inside each group.)
  const isDaily = h => !h.frequency || h.frequency === 'daily';
  const grouped = sorted.some(h => isDaily(h) && timeSlot(h) !== 'any');
  const slotRank = slotOrder(currentSlot(new Date().getHours()));
  if (grouped) {
    // Sort the daily habits on their own. (Sorting the mixed list with "leave weekly ones where they are" is not
    // a consistent ordering, and split a group in two whenever a weekly habit sat between its members.)
    const daily = sorted.filter(isDaily).map((h, i) => ({ h, i }))
      .sort((a, b) => slotRank.indexOf(timeSlot(a.h)) - slotRank.indexOf(timeSlot(b.h)) || a.i - b.i).map(x => x.h);
    sorted.splice(0, sorted.length, ...daily, ...sorted.filter(h => !isDaily(h)));
  }
  const SLOT_ICON = { morning: 'i-sunrise', afternoon: 'i-sun', evening: 'i-moon', any: 'i-clock' };
  let lastSlot = null;

  // Daily habits go in Today; weekly and monthly ones each get their own section with a count for the period.
  const sections = {
    daily:   { list, done: 0, total: 0 },
    weekly:  { list: document.getElementById('habits-week'),  card: document.getElementById('week-card'),  count: document.getElementById('week-count'),  done: 0, total: 0 },
    monthly: { list: document.getElementById('habits-month'), card: document.getElementById('month-card'), count: document.getElementById('month-count'), done: 0, total: 0 },
  };
  sections.weekly.list.innerHTML = '';
  sections.monthly.list.innerHTML = '';

  let done = 0;
  const animateRows = !habitsEntered;
  sorted.forEach((h, rowIdx) => {
    let isDone = false;
    let completedDateForToggle = t;
    const freq = h.frequency || 'daily';
    
    // A weekly habit may be wanted several times in the week: it shows as done for today once ticked today,
    // and as done for the week once the number is reached.
    const prog = freq === 'weekly' ? rules.periodProgress(h, t) : null;
    let periodDone = null;
    if (freq === 'weekly') {
      const doneToday = (h.completedDates || []).includes(t);
      periodDone = prog.done >= prog.target;
      isDone = periodDone || doneToday;
      completedDateForToggle = doneToday || !periodDone ? t : ((h.completedDates || []).find(isSameWeek) || t);
    } else if (freq === 'monthly') {
      isDone = (h.completedDates || []).some(isSameMonth);
      completedDateForToggle = (h.completedDates || []).find(isSameMonth) || t;
    } else {
      isDone = (h.completedDates || []).includes(t);
    }
    
    if (isDone) done++;
    const section = sections[freq] || sections.daily;
    section.total++;
    if (periodDone === null ? isDone : periodDone) section.done++;
    if (filtering && !matchesFilter(h, homeFilter)) return;      // counted above, just not shown
    shownRows++;
    section.shown = (section.shown || 0) + 1;
    if (grouped && section === sections.daily && timeSlot(h) !== lastSlot) {
      lastSlot = timeSlot(h);
      const head = document.createElement('li');
      head.className = 'group-head';
      head.setAttribute('role', 'presentation');
      head.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${SLOT_ICON[lastSlot]}"/></svg><span>${SLOT_LABEL[lastSlot]}</span>`;
      section.list.appendChild(head);
    }
    const cat = CATS[h.category] || CATS.health;

    // A habit can be edited at any time (it used to be only in its first hour). Its history is never rewritten.
    const nowMs = Date.now();

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
    const goal = rules.targetOf(h);                       // a counting habit: "5 / 8 glasses"
    const counted = goal ? rules.progressOn(h, isDone ? completedDateForToggle : t) : 0;   // counts are per day; a finished one shows the day it was finished
    const goalText = goal ? countLabel(counted, goal) : '';
    const goalSay = goal ? `${fmtCount(counted)} of ${fmtCount(goal.amount)}${goal.unit ? ' ' + goal.unit : ''}` : '';

    // The last seven days at a glance (daily habits only). Days before the habit existed are left blank.
    let dotsHTML = '';
    if (freq === 'daily') {
      const week = weekDots(h, t);
      week.forEach(d => { if (d.state === 'off' && !rules.isDueOn(h, d.day)) d.state = 'na'; });   // a rest day is not a miss
      const counted = week.filter(d => d.state !== 'na');
      dotsHTML = `<span class="dots" role="img" aria-label="Last 7 days: ${counted.filter(d => d.state === 'on').length} of ${counted.length} done">`
        + week.map(d => `<i class="${d.state}${d.today ? ' today' : ''}"></i>`).join('') + '</span>';
    }

    const li = document.createElement('li');
    const fxAge = h.id === justCompletedId ? performance.now() - justCompletedAt : Infinity;   // the completion effect, still running?
    li.className = 'habit-item' + (animateRows ? ' enter' : '') + (h.id === justCompletedId ? ' just-done' : '');
    li.dataset.id = h.id;
    li.dataset.group = `${grouped && freq === 'daily' ? timeSlot(h) : 'all'}|${smartSortEnabled && isDone ? 'done' : 'open'}`;
    const look = habitLook(h);
    li.style.setProperty('--cat', look.color);
    li.style.setProperty('--i', rowIdx);
    li.innerHTML = `
      <button class="row-grip" type="button" aria-label="Reorder ${escHtml(h.name)}" title="Drag to reorder, or use the arrow keys"><svg class="icon" aria-hidden="true"><use href="#i-grip"/></svg></button>
      <div class="habit-label">
        ${goal ? `<button type="button" class="habit-step${isDone ? ' is-done' : ''}" data-action="step" data-id="${h.id}" ${isDone ? 'aria-disabled="true"' : ''} aria-label="${escHtml(isDone ? `${h.name}: goal reached, ${goalSay}` : `Add ${fmtCount(goal.step)}${goal.unit ? ' ' + goal.unit : ''} to ${h.name}: ${goalSay}`)}"><svg class="step-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15"/><circle class="fill" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - Math.round(Math.min(1, counted / goal.amount) * 100)}"/></svg><svg class="icon" aria-hidden="true"><use href="#i-${isDone ? 'check' : 'plus'}"/></svg></button>` : ''}
        <input type="checkbox" class="habit-check" data-id="${h.id}" data-date="${completedDateForToggle}" aria-label="Mark ${escHtml(h.name)} complete" ${isDone ? 'checked' : ''} ${isLocked ? 'data-locked="1"' : ''} ${goal ? 'hidden tabindex="-1"' : ''} />
        <div class="habit-meta" data-action="details" data-id="${h.id}" style="cursor: pointer;">
          <span class="habit-name ${isDone ? 'done' : ''}">${escHtml(h.name)}</span>
          ${(typeof h.cue === 'string' && h.cue.trim() ? `<span class="habit-cue">${escHtml(h.cue.trim().slice(0, 80))}</span>` : '')}
          <div class="badges-row">
            <span class="cat-badge"><span class="cat-ico">${look.icon}</span>${goal ? `<span class="target-count">${escHtml(goalText)}</span>` : cat.label}</span>
            ${freq !== 'daily' ? '<span class="freq-badge">' + (prog && prog.target > 1 ? prog.done + ' of ' + prog.target + ' this week' : freq) + '</span>' : ''}
            ${freq === 'daily' && rules.scheduleOn(h, t).type === 'days' ? '<span class="freq-badge">' + scheduleLabel(rules.scheduleOn(h, t)) + '</span>' : ''}
            ${rules.runDay(h, t) ? `<span class="freq-badge run-badge">Day ${rules.runDay(h, t).day} of ${rules.runDay(h, t).of}</span>` : ''}
            ${hasReminder(h) ? `<span class="remind-badge" title="Reminder at ${hourLabel(h.reminderHour)}">${iconSvg('bell')}<span class="sr-only">Reminder at </span>${hourLabel(h.reminderHour)}</span>` : ''}
            ${habitStreak > 0 ? '<span class="streak-pill" title="Current streak: ' + habitStreak + ' ' + streakUnit(h, habitStreak) + '"><svg class="icon" aria-hidden="true"><use href="#i-flame"/></svg>' + streakShort(h, habitStreak) + '</span>' : ''}
            ${isLocked ? '<span class="locked-badge" title="Completed and locked (cannot be unchecked after 1 hour)"><svg class="icon" aria-hidden="true"><use href="#i-lock"/></svg><span class="sr-only">Locked</span></span>' : ''}
            ${dotsHTML}
          </div>
        </div>
      </div>
      <div class="habit-actions">
        ${goal && counted > 0 ? `<button class="btn-icon" data-id="${h.id}" data-action="step-down" title="Take one step back" aria-label="Take ${escHtml(fmtCount(goal.step) + (goal.unit ? ' ' + goal.unit : ''))} off ${escHtml(h.name)}"><svg class="icon" aria-hidden="true"><use href="#i-minus"/></svg></button>` : ''}
        <button class="btn-icon row-move" data-id="${h.id}" data-action="move-up" aria-label="Move ${escHtml(h.name)} up"><svg class="icon" aria-hidden="true"><use href="#i-arrow-up"/></svg></button>
        <button class="btn-icon row-move" data-id="${h.id}" data-action="move-down" aria-label="Move ${escHtml(h.name)} down"><svg class="icon" aria-hidden="true"><use href="#i-arrow-down"/></svg></button>
        <button class="btn-icon" data-id="${h.id}" data-action="timer" title="Start Focus Timer" aria-label="Start focus timer for ${escHtml(h.name)}">
          <svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>
        </button>
        <button class="btn-icon" data-id="${h.id}" data-action="edit" title="Edit habit" aria-label="Edit ${escHtml(h.name)}">
          <svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg>
        </button>
        <button class="btn-icon" data-id="${h.id}" data-action="delete" title="Remove habit" aria-label="Remove ${escHtml(h.name)}">
          <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
        </button>
      </div>
      <button class="btn-icon row-more" type="button" data-action="more" data-id="${h.id}" aria-label="More actions for ${escHtml(h.name)}" aria-expanded="false">
        <svg class="icon" aria-hidden="true"><use href="#i-more"/></svg>
      </button>`;
    if (fxAge < FX_MS) startTickFx(li, fxAge);
    section.list.appendChild(li);
  });

  for (const key of ['weekly', 'monthly']) {
    const sec = sections[key];
    sec.card.classList.toggle('hidden', sec.total === 0 || !sec.shown);
    sec.count.textContent = `${sec.done} of ${sec.total}`;
  }
  document.getElementById('no-daily').classList.toggle('hidden', sections.daily.total > 0 || filtering);
  document.getElementById('no-match').classList.toggle('hidden', !(filtering && shownRows === 0));

  applyRevealed();
  if (focusRowId) document.querySelector(`#page-home .habit-item[data-id="${CSS.escape(focusRowId)}"] ${focusSel}`)?.focus({ preventScroll: true });
  habitsEntered = true;
  if (nudgeFirstHabit && done === 0) {
    const first = list.querySelector('.habit-check:not(:checked)');
    if (first) first.classList.add('nudge');
  }
  updateFocusButton();
  if (!document.getElementById('focus-view').classList.contains('hidden')) renderFocus();   // keep an open focus view in step with the data
  updateProgress(done, sorted.length);                  // habits resting today are not part of today's count
  updateStreakRisk();
}

// "3 days a week", "Weekdays", "3 times a week": a schedule in a few words
function scheduleLabel(schedule) {
  if (schedule.type === 'times') return schedule.times === 1 ? 'weekly' : `${schedule.times} times a week`;
  if (schedule.type !== 'days') return '';
  const d = schedule.days;
  if (d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x))) return 'Weekdays';
  if (d.length === 2 && d.includes(0) && d.includes(6)) return 'Weekends';
  if (d.length === 1) return ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][d[0]];
  return `${d.length} days a week`;
}

// The quiet line under Today for daily habits that are not due today, and the read-only list it unfolds.
// Habits that are not expected today sit in quiet, closed lines at the foot of Today: ones whose schedule skips
// today, and ones whose start date is still ahead. They can be opened and edited, never ticked.
const startsLabel = start => {
  const gap = rules.dayNumber(start) - rules.dayNumber(todayStr());
  const d = new Date(start + 'T12:00:00');
  if (gap === 1) return 'Starts tomorrow';
  return 'Starts ' + (gap > 1 && gap < 7 ? d.toLocaleDateString('en', { weekday: 'long' }) : d.toLocaleDateString('en', { day: 'numeric', month: 'short' }));
};
const ASIDES = {
  rest: { icon: 'i-moon', say: n => `${n} habit${n === 1 ? ' rests' : 's rest'} today`, why: 'not due today', badge: h => scheduleLabel(rules.scheduleOn(h, todayStr())) },
  paused: { icon: 'i-pause', say: n => `${n} habit${n === 1 ? '' : 's'} paused`, why: 'paused', badge: h => 'Paused since ' + shortDate(rules.pausedSince(h, todayStr()) || todayStr()),
    action: h => `<button class="btn-link" type="button" data-id="${h.id}" data-action="resume" aria-label="Resume ${escHtml(h.name)}">Resume</button>` },
  soon: { icon: 'i-calendar', say: n => `${n} habit${n === 1 ? ' starts' : 's start'} later`, why: 'not started yet', badge: h => startsLabel(h.startDate) },
};
function renderAsides(groups = {}) {
  const habitsFor = { rest: groups.resting || [], soon: groups.upcoming || [], paused: groups.paused || [] };
  for (const [key, cfg] of Object.entries(ASIDES)) {
    const note = document.getElementById(key + '-note'), list = document.getElementById('habits-' + key), habits = habitsFor[key];
    if (!note || !list) continue;
    note.classList.toggle('hidden', habits.length === 0);
    if (!habits.length) { list.classList.add('hidden'); list.innerHTML = ''; note.setAttribute('aria-expanded', 'false'); continue; }
    note.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${cfg.icon}"/></svg><span>${cfg.say(habits.length)}</span>`;
    list.classList.toggle('hidden', note.getAttribute('aria-expanded') !== 'true');
    list.innerHTML = habits.map(h => {
      const look = habitLook(h);
      return `<li class="habit-item is-readonly" data-id="${h.id}" style="--cat:${look.color}">
      <div class="habit-label">
        <input type="checkbox" class="habit-check" disabled aria-label="${escHtml(h.name)}: ${cfg.why}" />
        <div class="habit-meta" data-action="details" data-id="${h.id}" style="cursor: pointer;">
          <span class="habit-name">${escHtml(h.name)}</span>
          <div class="badges-row"><span class="cat-badge"><span class="cat-ico">${look.icon}</span>${look.cat.label}</span><span class="freq-badge run-badge">${escHtml(cfg.badge(h))}</span></div>
        </div>
      </div>
      <div class="habit-actions">
        ${cfg.action ? cfg.action(h) : ''}
        <button class="btn-icon" data-id="${h.id}" data-action="edit" title="Edit habit" aria-label="Edit ${escHtml(h.name)}">${iconSvg('edit')}</button>
      </div>
    </li>`;
    }).join('');
  }
}
document.querySelectorAll('#page-home .rest-note').forEach(note => note.addEventListener('click', () => {
  const open = note.getAttribute('aria-expanded') !== 'true';
  note.setAttribute('aria-expanded', String(open));
  document.getElementById(note.getAttribute('aria-controls')).classList.toggle('hidden', !open);
}));

// Loss aversion: late in the day, say exactly which streak is about to end and how long is left.
let riskTimer = null;
function updateStreakRisk() {
  const el = document.getElementById('streak-risk');
  if (!el) return;
  const now = new Date();
  const t = todayStr();
  const atRisk = allHabits
    .filter(h => (!h.frequency || h.frequency === 'daily') && rules.isDueOn(h, t) && !(h.completedDates || []).includes(t) && calcHabitStreak(h) > 0)
    .sort((x, y) => calcHabitStreak(y) - calcHabitStreak(x));
  if (!atRisk.length || now.getHours() < 16) { el.classList.add('hidden'); barRiskLine = ''; renderBarLine(); return; }

  const top = atRisk[0];
  const mid = new Date(now); mid.setHours(24, 0, 0, 0);
  const mins = Math.max(1, Math.round((mid - now) / 60000));
  const left = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  document.getElementById('risk-title').textContent = `${top.name}: ${calcHabitStreak(top)}-day streak ends in ${left}`;
  barRiskLine = `${top.name}: ${calcHabitStreak(top)}-day streak ends in ${left}`;
  renderBarLine();
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
// ── Focus view: today's open daily habits, one at a time ──
// The queue is fixed when the view opens (the open daily habits, in list order). Done completes the habit by
// the normal one-tap path and moves on; Skip just moves on.
let focusQueue = [];
let focusAt = 0;
const openDailyIds = () => [...document.querySelectorAll('#habits .habit-item:not(.is-readonly) .habit-check:not(:checked)')].map(cb => cb.dataset.id);
function updateFocusButton() {
  const b = document.getElementById('focus-open');
  if (b) b.classList.toggle('hidden', !!viewingPast() || filterActive() || openDailyIds().length < 2);
}
function renderFocus() {
  const today = todayStr();
  const isOpen = id => { const h = allHabits.find(x => x.id === id); return h && !(h.completedDates || []).includes(today); };
  while (focusAt < focusQueue.length && !isOpen(focusQueue[focusAt]) && !pendingUncomplete.has(focusQueue[focusAt])) focusAt++;   // completed meanwhile, here or on another device
  const h = allHabits.find(x => x.id === focusQueue[focusAt]);
  const finished = !h;
  const set = (id, v) => { document.getElementById(id).textContent = v; };
  set('focus-progress', finished ? 'Finished' : `${focusAt + 1} of ${focusQueue.length}`);
  set('focus-name', finished ? 'That is everything for today.' : h.name);
  const streak = finished ? 0 : calcHabitStreak(h);
  set('focus-cue', finished || typeof h.cue !== 'string' ? '' : h.cue.trim().slice(0, 80));
  set('focus-streak', finished ? '' : streak > 0 ? `${streak}-day streak` : 'No streak yet. Today can be day one.');
  const cat = finished ? null : (CATS[h.category] || CATS.health);
  const chip = document.getElementById('focus-cat');
  chip.classList.toggle('hidden', finished);
  chip.innerHTML = cat ? `<span class="cat-ico" style="--cat:${habitLook(h).color}">${habitLook(h).icon}</span>${cat.label}` : '';
  document.getElementById('focus-skip').classList.toggle('hidden', finished);
  document.getElementById('focus-timer').classList.toggle('hidden', finished);
  set('focus-done', finished ? 'Finish' : 'Done');
}
const closeFocus = () => document.getElementById('focus-view').classList.add('hidden');
document.getElementById('focus-open')?.addEventListener('click', () => {
  focusQueue = openDailyIds();
  focusAt = 0;
  if (!focusQueue.length) return;
  renderFocus();
  document.getElementById('focus-view').classList.remove('hidden');
  track('focus_opened');
});
document.getElementById('focus-done')?.addEventListener('click', e => {
  const id = focusQueue[focusAt];
  const h = allHabits.find(x => x.id === id);
  if (!h) { closeFocus(); return; }                    // "Finish", or the habit is gone
  // Hold the button for a moment: a double tap must not complete the next habit before it has been read
  const btn = e.currentTarget;
  btn.disabled = true;
  setTimeout(() => { btn.disabled = false; if (!document.getElementById('focus-view').classList.contains('hidden') && document.activeElement === document.body) btn.focus(); }, 450);
  completeHabit(id, todayStr(), null);                 // does nothing if it was completed meanwhile, here or elsewhere
  focusAt++;
  renderFocus();
});
const focusSkip = () => { if (focusAt < focusQueue.length) { focusAt++; renderFocus(); } };
document.getElementById('focus-skip')?.addEventListener('click', focusSkip);
document.getElementById('focus-exit')?.addEventListener('click', closeFocus);
document.getElementById('focus-timer')?.addEventListener('click', () => {
  const h = allHabits.find(x => x.id === focusQueue[focusAt]);
  if (h) openTimerModal(h);
});
document.getElementById('focus-view')?.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' && !document.getElementById('focus-skip').classList.contains('hidden')) { e.preventDefault(); focusSkip(); }
});

// ── Filter: search and category chips, once the list is long ──
const FILTER_FROM = 9;                                // shown when there are more than eight habits
let homeFilter = { category: 'all', text: '' };
const filterActive = () => homeFilter.category !== 'all' || !!homeFilter.text.trim();
function renderFilterBar(show) {
  const bar = document.getElementById('home-filter'), chips = document.getElementById('filter-chips');
  if (!bar || !chips) return;
  if (!show) {                                                      // a short list has nothing to filter
    homeFilter = { category: 'all', text: '' };
    const box = document.getElementById('habit-search');
    if (box) box.value = '';
  }
  bar.classList.toggle('hidden', !show);
  if (!show) return;
  const focusedChip = document.activeElement?.classList?.contains('chip') ? document.activeElement.dataset.cat : null;
  const inUse = Object.keys(CATS).filter(k => allHabits.some(h => (CATS[h.category] ? h.category : 'health') === k));
  if (homeFilter.category !== 'all' && !inUse.includes(homeFilter.category)) homeFilter.category = 'all';
  chips.innerHTML = ['all', ...inUse].map(k =>
    `<button type="button" class="chip" data-cat="${k}" aria-pressed="${homeFilter.category === k}">${k === 'all' ? 'All' : CATS[k].label}</button>`).join('');
  if (focusedChip) chips.querySelector(`.chip[data-cat="${CSS.escape(focusedChip)}"]`)?.focus({ preventScroll: true });   // rebuilt: keep keyboard focus
}
document.getElementById('filter-chips')?.addEventListener('click', e => {
  const chip = e.target instanceof Element ? e.target.closest('.chip') : null;
  if (!chip) return;
  homeFilter.category = chip.dataset.cat;
  renderHabits();
});
document.getElementById('habit-search')?.addEventListener('input', e => { homeFilter.text = e.target.value; renderHabits(); });
document.getElementById('filter-clear')?.addEventListener('click', () => {
  homeFilter = { category: 'all', text: '' };
  const box = document.getElementById('habit-search');
  if (box) { box.value = ''; box.focus(); }
  renderHabits();
});

document.getElementById('details-time')?.addEventListener('change', e => {
  const h = allHabits.find(x => x.id === currentDetailsHabitId);
  if (!h) return;
  const v = e.target.value;
  backgroundWrite(updateDoc(doc(db, 'habits', h.id), { timeOfDay: v === 'any' ? deleteField() : v }), 'save the time of day');
});

// ── Midnight ──────────────────────────────────────────────
// The list is drawn for one day. If the app is left open past midnight, redraw it for the new day when the tab
// is looked at again (and on a slow timer), so a tick is never saved against yesterday.
let renderedDay = todayStr();
function checkDayRollover() {
  if (!currentUser || todayStr() === renderedDay) return;
  renderedDay = todayStr();
  renderHabits();
  updateStreak();
  refreshShieldOffer(true);
  if (location.hash === '#stats') renderStats();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayRollover(); });
setInterval(checkDayRollover, 30000);

// ── Day browser: look back at previous days (read-only) ───
// viewDay is null for today. Past days can be looked at but never changed, in line with the rule that a
// completion can only be undone for an hour.
const DAY_BROWSER_LIMIT = 60;
let viewDay = null;
let viewDaySetOn = null;                             // the real day viewDay was chosen on: a view never outlives midnight
function viewingPast() {
  if (viewDay && viewDaySetOn !== todayStr()) viewDay = null;
  return viewDay && viewDay !== todayStr() ? viewDay : null;
}
function setViewDay(day) {
  const today = todayStr(), earliest = shiftDay(today, -DAY_BROWSER_LIMIT);
  const clamped = day > today ? today : day < earliest ? earliest : day;
  viewDay = clamped === today ? null : clamped;
  viewDaySetOn = today;
  setRevealed(null);
  renderHabits();
}
function renderDayHeader() {
  const past = viewingPast(), today = todayStr();
  const shown = past ? new Date(past + 'T12:00:00') : new Date();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('today-title', past ? shown.toLocaleDateString('en-GB', { weekday: 'long' }) : 'Today');
  // Phones have room for a short date only
  set('today-date', shown.toLocaleDateString('en-GB', phoneLayout.matches ? { weekday: past ? undefined : 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }));
  const prev = document.getElementById('day-prev'), next = document.getElementById('day-next');
  if (prev) prev.disabled = (past || today) <= shiftDay(today, -DAY_BROWSER_LIMIT);
  if (next) next.disabled = !past;
  document.getElementById('past-note')?.classList.toggle('hidden', !past);
  // Yesterday is the one past day that can still be changed: what was missed can be filled in until midnight
  const noteText = document.getElementById('past-note-text');
  if (noteText) noteText.textContent = past && past === shiftDay(today, -1)
    ? 'You are looking at a past day. Anything missed yesterday can still be filled in until midnight.'
    : 'You are looking at a past day. It cannot be changed.';
  document.getElementById('page-home')?.classList.toggle('is-past', !!past);
}
// What the Today card shows for a past day: the daily habits that existed then, ticked or not, and nothing to press.
function renderPastDay(day) {
  const list = document.getElementById('habits');
  const items = habitsOnDay([...allHabits].sort((a, b) => (a.order || 0) - (b.order || 0)), day).filter(x => x.done || rules.isDueOn(x.habit, day));
  ['week-card', 'month-card', 'no-daily'].forEach(id => document.getElementById(id).classList.add('hidden'));
  const today = todayStr();
  list.innerHTML = items.length ? items.map(({ habit: h, done }) => {
    const cat = CATS[h.category] || CATS.health;
    const look = habitLook(h);
    const fill = !done && rules.canFillIn(h, day, today), undoFill = done && day === shiftDay(today, -1) && canTakeBackFill(h, day);
    return `<li class="habit-item is-readonly" data-id="${h.id}" style="--cat:${look.color}">
      <div class="habit-label">
        <input type="checkbox" class="habit-check" disabled ${done ? 'checked' : ''} aria-label="${escHtml(h.name)}: ${done ? 'done' : 'not done'} that day" />
        <div class="habit-meta">
          <span class="habit-name ${done ? 'done' : ''}">${escHtml(h.name)}</span>
          <div class="badges-row"><span class="cat-badge"><span class="cat-ico">${look.icon}</span>${cat.label}</span>${h.backfilled && h.backfilled[day] === true && done ? '<span class="freq-badge late-badge">Filled in late</span>' : ''}</div>
        </div>
      </div>
      ${fill ? `<div class="habit-actions"><button type="button" class="btn-link fill-btn" data-action="fill-in" data-id="${h.id}" data-day="${day}" aria-label="Fill in ${escHtml(h.name)} for yesterday">Fill in</button></div>` : ''}
      ${undoFill ? `<div class="habit-actions"><button type="button" class="btn-link fill-btn" data-action="fill-undo" data-id="${h.id}" data-day="${day}" aria-label="Take back filling in ${escHtml(h.name)} for yesterday">Take back</button></div>` : ''}
    </li>`;
  }).join('') : '<li class="empty-note">You had no daily habits on this day.</li>';
}
document.getElementById('day-prev')?.addEventListener('click', () => setViewDay(shiftDay(viewingPast() || todayStr(), -1)));
document.getElementById('day-next')?.addEventListener('click', () => setViewDay(shiftDay(viewingPast() || todayStr(), 1)));
document.getElementById('back-to-today')?.addEventListener('click', () => { setViewDay(todayStr()); document.getElementById('day-prev')?.focus(); });
document.querySelector('.day-header')?.addEventListener('keydown', e => {
  if (!(e.target instanceof Element) || !e.target.closest('.day-nav')) return;
  const by = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
  if (!by) return;
  e.preventDefault();
  setViewDay(shiftDay(viewingPast() || todayStr(), by));
  // The pressed arrow may have just become disabled (today has no "next"): keep focus on one that works
  const prev = document.getElementById('day-prev'), next = document.getElementById('day-next');
  (by > 0 && !next.disabled ? next : !prev.disabled ? prev : next).focus();
});
document.getElementById('week-strip')?.addEventListener('click', e => {
  const cell = e.target instanceof Element ? e.target.closest('.wk-day[data-day]') : null;
  if (cell) setViewDay(cell.dataset.day);
});

// ── Summary: folded to a slim bar on phones ───────────────
// Saved choice wins. Otherwise it is folded once there are habits (so the list is on the first screen) and open
// for an empty account. Desktop always shows the whole summary; the fold is purely a phone layout.
const SUMMARY_KEY = 'habitly_summary';
let barBaseLine = 'No habits yet';                   // "4 left today"
let barRiskLine = '';                                // "Read: 3-day streak ends in 5h", while a streak is at risk
function renderBarLine() {
  const el = document.getElementById('bar-line');
  if (el) el.textContent = barRiskLine || barBaseLine;
  document.getElementById('summary')?.classList.toggle('at-risk', !!barRiskLine);
}
const phoneLayout = window.matchMedia ? matchMedia('(max-width: 640px)') : { matches: false };
let summaryForcedOpen = false;                       // the guided tour unfolds it while it explains it
function summaryCollapsed() {
  if (summaryForcedOpen) return false;
  let saved = null;
  try { saved = localStorage.getItem(SUMMARY_KEY); } catch (_) {}
  return saved ? saved === 'closed' : allHabits.length > 0;
}
function applySummaryState() {
  const box = document.getElementById('summary'), more = document.getElementById('summary-more'), btn = document.getElementById('summary-toggle');
  if (!box || !more || !btn) return;
  const collapsed = summaryCollapsed();
  box.classList.toggle('is-collapsed', collapsed);
  btn.setAttribute('aria-expanded', String(!collapsed));
  more.inert = collapsed && phoneLayout.matches;     // folded content must not be reachable by Tab or a screen reader
}
document.getElementById('summary-toggle')?.addEventListener('click', () => {
  try { localStorage.setItem(SUMMARY_KEY, summaryCollapsed() ? 'open' : 'closed'); } catch (_) {}
  applySummaryState();
});
if (phoneLayout.addEventListener) phoneLayout.addEventListener('change', () => { applySummaryState(); renderDayHeader(); });

document.getElementById('today-add')?.addEventListener('click', () => quickAddHabit());

function updateProgress(done, total) {
  const ring = document.getElementById('today-ring');
  const fg = document.getElementById('ring-fg');
  const frac = total > 0 ? done / total : 0;
  if (fg) fg.style.strokeDashoffset = String(RING_LEN * (1 - frac));
  if (ring) {
    ring.classList.toggle('complete', total > 0 && done === total);
    ring.setAttribute('aria-label', (total ? `${done} of ${total} habits done today` : 'No habits yet') + ". Open today's recap");
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('ring-num', done);
  set('ring-of', `of ${total}`);
  const line = total === 0 ? 'No habits yet' : done === total ? 'All done for today' : `${total - done} left today`;
  set('summary-line', line);
  // The slim bar phones show in place of the full summary
  set('bar-count', `${done} of ${total}`);
  barBaseLine = line;
  renderBarLine();
  const barFg = document.getElementById('bar-ring-fg');
  if (barFg) barFg.style.strokeDashoffset = String(100.53 * (1 - frac));
  document.getElementById('summary')?.classList.toggle('all-done', total > 0 && done === total);
  applySummaryState();
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
    const daily = allHabits.filter(h => (!h.frequency || h.frequency === 'daily') && (!h.createdAt || new Date(h.createdAt) <= dayEnd) && rules.isDueOn(h, key));
    const doneDaily = daily.filter(h => (h.completedDates || []).includes(key)).length;
    const anyDone = allHabits.some(h => (h.completedDates || []).includes(key));
    const state = daily.length && doneDaily === daily.length ? 'full' : anyDone ? 'some' : 'none';
    const label = d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'short' });
    const what = state === 'full' ? 'all habits done' : state === 'some' ? 'some habits done' : 'no habits done';
    cells.push(`<div class="wk-day ${state}${n === 0 ? ' is-today' : ''}" data-day="${key}" role="img" aria-label="${escHtml(label)}: ${what}"><span class="wk-dot">${state === 'full' ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>' : ''}</span><span class="wk-lbl">${d.toLocaleDateString('en', { weekday: 'narrow' })}</span></div>`);
  }
  el.innerHTML = cells.join('');

  // A perfect week (or month) is recognised on the strip itself: the dots are joined and a line says so.
  if (!stretchMemo || stretchMemo.habits !== allHabits || stretchMemo.today !== todayStr()) stretchMemo = { habits: allHabits, today: todayStr(), value: perfectStretch(allHabits, todayStr()) };
  const stretch = stretchMemo.value;
  const label = stretch.month ? 'Perfect month' : stretch.week ? 'Perfect week' : '';
  el.classList.toggle('is-perfect', !!label);
  el.setAttribute('aria-label', label ? `Last 7 days. ${label}` : 'Last 7 days');
  const note = document.getElementById('week-note');
  if (note) {
    note.classList.toggle('hidden', !label);
    document.getElementById('week-note-text').textContent = label ? `${label}: ${stretch.month ? 30 : 7} days, nothing missed` : '';
  }
  announcePerfect(stretch);
}

// Said once per stretch (this device remembers which stretch it spoke for). The first look only takes note, so
// nobody is greeted with news of a week that was already perfect before this existed.
function announcePerfect(stretch) {
  if (!currentUser || !habitsLoaded || !userDocLoaded) return;
  const key = `habitly_perfect_${currentUser.uid}`;
  let seen = null;
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (v && typeof v === 'object' && !Array.isArray(v)) seen = v; } catch (_) {}
  // A stretch is known by its first day, which stays put as the stretch grows. One too long to walk back (capped)
  // was a perfect month long ago: there is nothing new to say about it, and what was noted before is kept.
  const start = stretch.capped ? '' : stretch.start;
  const next = { week: stretch.week && start ? start : (seen && seen.week) || '', month: stretch.month && start ? start : (seen && seen.month) || '' };
  const say = !seen || !start ? '' : stretch.month && seen.month !== start ? 'Perfect month. Thirty days, nothing missed.' : stretch.week && seen.week !== start ? 'Perfect week. Seven days, nothing missed.' : '';
  if (!seen || next.week !== seen.week || next.month !== seen.month) { try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) {} }
  if (!say) return;
  const uid = currentUser.uid;
  setTimeout(() => { if (currentUser && currentUser.uid === uid) toast(say, 'success', 6000); }, 1800);
  track('perfect_stretch', { month: stretch.month });
}

let previousMaxStreak = null;

function updateStreak() {
  const maxStreak = calcStreak(allHabits);
  document.getElementById('greeting-streak').textContent = maxStreak;
  const barStreak = document.getElementById('bar-streak');
  if (barStreak) barStreak.textContent = maxStreak;
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
// ── The habit sheet: create and edit in one place ─────────
// openHabitSheet() starts a new habit; openHabitSheet(habit) edits one. The dialog system (ui.js) puts the
// cursor in the name field and gives focus back afterwards. It is "sticky": only Cancel, Save or Escape close it.
const habitSheet = document.getElementById('habit-sheet');
const sheetField = id => document.getElementById(id);
function openHabitSheet(habit = null, { asNew = false } = {}) {
  const editing = !!habit && !asNew;                    // asNew: filled in from an idea, but saved as a new habit
  if (!habitSheet || !habitFormEl) return;
  habitFormEl.reset();
  ['habit-input', 'habit-category', 'habit-frequency'].forEach(id => clearFieldError(sheetField(id)));
  habitSheet.querySelectorAll('.select-btn').forEach(clearFieldError);
  sheetField('habit-edit-id').value = editing ? habit.id : '';
  sheetField('habit-sheet-title').textContent = editing ? 'Edit habit' : 'New habit';
  sheetField('habit-save').textContent = editing ? 'Save changes' : 'Add habit';
  sheetField('browse-ideas')?.classList.toggle('hidden', editing);
  sheetField('habit-input').value = habit ? habit.name : '';
  sheetField('habit-category').value = habit ? (CATS[habit.category] ? habit.category : 'health') : '';
  sheetField('habit-frequency').value = habit ? (habit.frequency || 'daily') : 'daily';
  sheetField('habit-time').value = habit ? timeSlot(habit) : 'any';
  sheetField('habit-cue').value = habit && typeof habit.cue === 'string' ? habit.cue : '';
  const goal = habit ? rules.targetOf(habit) : null;
  sheetField('habit-target-amount').value = goal ? goal.amount : '';
  sheetField('habit-target-unit').value = goal ? goal.unit : '';
  sheetField('habit-target-step').value = goal && goal.step !== 1 ? goal.step : '';
  ['habit-target-amount', 'habit-target-unit', 'habit-target-step'].forEach(id => clearFieldError(sheetField(id)));
  sheetField('habit-reminder').value = hasReminder(habit) ? String(habit.reminderHour) : '';
  sheetField('habit-reminder-note').hidden = !!profilePushToken;      // reminders are on somewhere: nothing to explain
  sheetField('habit-start').value = habit && isDay(habit.startDate) ? habit.startDate : '';
  sheetField('habit-end').value = habit && isDay(habit.endDate) ? habit.endDate : '';
  clearFieldError(sheetField('habit-end'));
  setScheduleFields(habit);
  clearFieldError(sheetField('schedule-days'));
  setHabitLook(habit);
  habitSheet.querySelectorAll('details.sheet-more').forEach(d => { d.open = false; });
  habitFormEl.hidden = false;
  newHabitToggle?.setAttribute('aria-expanded', 'true');
  renderHabitPreview();
  habitSheet.classList.remove('hidden');
}
function closeHabitSheet() {
  if (!habitSheet) return;
  habitSheet.classList.add('hidden');
  habitFormEl.hidden = true;
  newHabitToggle?.setAttribute('aria-expanded', 'false');
}
// Icon and colour pickers: plain radio groups, so the arrow keys and screen readers work without extra code.
(function buildLookPickers() {
  const colors = sheetField('habit-color-grid'), icons = sheetField('habit-icon-grid');
  if (!colors || !icons) return;
  const opt = (name, value, face, label, checked) =>
    `<label class="pick-opt" title="${label}"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''} /><span class="pick-face">${face}</span><span class="sr-only">${label}</span></label>`;
  colors.innerHTML = opt('habit-color', '', 'Auto', 'Automatic colour', true)
    + HABIT_COLORS.map(k => opt('habit-color', k, `<span class="pick-swatch" style="--sw:var(--hc-${k})"></span>`, k.charAt(0).toUpperCase() + k.slice(1))).join('');
  icons.innerHTML = opt('habit-icon', '', 'Auto', 'Automatic icon', true)
    + HABIT_ICONS.map(k => opt('habit-icon', k, iconSvg(k), ICON_NAME(k) + ' icon')).join('');
})();
// Schedule controls: weekday chips for a daily habit, a count for a weekly one. All seven days on, or once a
// week, is the plain habit and stores no schedule at all.
function syncScheduleFields() {
  const freq = sheetField('habit-frequency').value || 'daily';
  sheetField('schedule-days').classList.toggle('hidden', freq !== 'daily');
  sheetField('schedule-times').classList.toggle('hidden', freq !== 'weekly');
}
// Returns { schedule } (null for the plain habit) or { error }.
function readSchedule() {
  const freq = sheetField('habit-frequency').value || 'daily';
  if (freq === 'daily') {
    const days = [...sheetField('schedule-days').querySelectorAll('input:checked')].map(i => +i.value).sort((a, b) => a - b);
    if (!days.length) return { error: 'Choose at least one day.' };
    return { schedule: days.length === 7 ? null : { type: 'days', days } };
  }
  if (freq === 'weekly') { const times = +sheetField('habit-times').value || 1; return { schedule: times > 1 ? { type: 'times', times } : null }; }
  return { schedule: null };
}
function setScheduleFields(habit) {
  const s = habit ? rules.scheduleOn(habit, todayStr()) : { type: 'daily' };
  sheetField('schedule-days').querySelectorAll('input').forEach(i => { i.checked = s.type === 'days' ? s.days.includes(+i.value) : true; });
  sheetField('habit-times').value = String(s.type === 'times' ? s.times : 1);
}

function readHabitLook() {
  const val = name => habitFormEl?.querySelector(`input[name="${name}"]:checked`)?.value || '';
  return { icon: val('habit-icon'), color: val('habit-color') };
}
function setHabitLook(habit) {
  const set = (name, value) => { const r = [...habitFormEl.querySelectorAll(`input[name="${name}"]`)].find(x => x.value === value); if (r) r.checked = true; };
  set('habit-icon', habit && HABIT_ICONS.includes(habit.icon) ? habit.icon : '');
  set('habit-color', habit && HABIT_COLORS.includes(habit.color) ? habit.color : '');
}

// Kept for callers that think of it as "the New habit form" (the tour, the quick-add key)
function setNewHabitOpen(open) { if (open) openHabitSheet(); else closeHabitSheet(); }

// The preview is the row Today will show, built from what is in the fields right now. It is a picture, not a control.
// Start and end dates: { startDate, endDate } ('' for none) or { error: [field, message] }.
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
function readDates() {
  const st = sheetField('habit-start'), en = sheetField('habit-end');
  const startDate = isDay(st.value) ? st.value : '', endDate = isDay(en.value) ? en.value : '';
  if (st.validity.badInput) return { error: [st, 'Choose a full date, or clear it.'] };
  if (en.validity.badInput) return { error: [en, 'Choose a full date, or clear it.'] };
  if (endDate && endDate < (startDate || '')) return { error: [en, 'The end date cannot be before the start date.'] };
  return { startDate, endDate };
}
const shortDate = key => new Date(key + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' });
function datesLabel(startDate, endDate) {
  if (startDate && endDate) { const n = rules.dayNumber(endDate) - rules.dayNumber(startDate) + 1; return n > 0 ? `${n} day${n === 1 ? '' : 's'}` : 'Check the dates'; }
  if (startDate) return 'From ' + shortDate(startDate);
  if (endDate) return 'Until ' + shortDate(endDate);
  return 'Always';
}
// Quick lengths: 30 days, 66 days (about how long a habit takes to stick), or no end. The run starts today unless a start is set.
document.getElementById('habit-dates')?.addEventListener('click', e => {
  const chip = e.target.closest('[data-run]');
  if (!chip) return;
  const st = sheetField('habit-start'), en = sheetField('habit-end'), days = +chip.dataset.run;
  if (!isDay(st.value)) st.value = todayStr();
  en.value = days ? rules.shiftDay(st.value, days - 1) : '';
  clearFieldError(en);
  renderHabitPreview();
});

// The goal fields: { target } (an object, or '' for none) or { error: [field, message] }.
function readTarget() {
  const a = sheetField('habit-target-amount'), u = sheetField('habit-target-unit'), st = sheetField('habit-target-step');
  const raw = a.value.trim(), unit = u.value.trim(), stepRaw = st.value.trim();
  if (a.validity.badInput) return { error: [a, 'Use a number from 1 to 100,000.'] };
  if (!raw) return unit || stepRaw ? { error: [a, 'Add a number for the goal, or clear the other goal boxes.'] } : { target: '' };
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return { error: [a, 'Use a number from 1 to 100,000.'] };
  if (unit.length > 12) return { error: [u, 'Keep the unit to 12 characters or fewer.'] };
  let step = 1;
  if (stepRaw || st.validity.badInput) {
    step = Number(stepRaw);
    if (st.validity.badInput || !(step >= 0.001) || step > amount) return { error: [st, 'Count by a number from 0.001 up to the goal.'] };
  }
  return { target: { amount, unit, step } };
}
function renderHabitPreview() {
  const box = sheetField('habit-preview');
  if (!box) return;
  const name = sheetField('habit-input').value.trim();
  const catKey = sheetField('habit-category').value, cat = CATS[catKey];
  const freq = sheetField('habit-frequency').value || 'daily';
  const slot = sheetField('habit-time').value;
  const cue = sheetField('habit-cue').value.trim();
  syncScheduleFields();
  const sched = readSchedule().schedule;
  const chosen = readHabitLook();
  const goal = rules.targetOf({ target: readTarget().target });     // shown only when the goal boxes make sense
  const remindAt = sheetField('habit-reminder').value;
  sheetField('habit-remind-val').textContent = remindAt === '' ? 'None' : hourLabel(+remindAt);
  const dates = readDates();
  sheetField('habit-dates-val').textContent = dates.error ? 'Check the dates' : datesLabel(dates.startDate, dates.endDate);
  const runNow = dates.error ? null : rules.runDay(dates, todayStr());
  const runText = dates.error ? '' : runNow ? `Day ${runNow.day} of ${runNow.of}` : dates.startDate > todayStr() ? startsLabel(dates.startDate) : '';
  const look = habitLook({ category: catKey, ...chosen });
  const custom = [chosen.icon && ICON_NAME(chosen.icon), chosen.color && chosen.color.charAt(0).toUpperCase() + chosen.color.slice(1)].filter(Boolean);
  sheetField('habit-look-val').textContent = custom.length ? custom.join(', ') : 'Automatic';
  box.innerHTML = `<div class="habit-item is-preview" style="--cat:${cat || chosen.color ? look.color : 'var(--muted)'}">
    <div class="habit-label">
      <span class="preview-check"></span>
      <div class="habit-meta">
        <span class="habit-name${name ? '' : ' is-empty'}">${name ? escHtml(name) : 'Your habit'}</span>
        ${cue ? `<span class="habit-cue">${escHtml(cue)}</span>` : ''}
        <div class="badges-row">
          ${cat ? `<span class="cat-badge"><span class="cat-ico">${look.icon}</span>${goal ? `<span class="target-count">${escHtml(countLabel(0, goal))}</span>` : cat.label}</span>` : `<span class="cat-badge">${chosen.icon ? `<span class="cat-ico">${look.icon}</span>` : ''}Category</span>`}
          ${sched ? `<span class="freq-badge">${scheduleLabel(sched)}</span>` : freq !== 'daily' ? `<span class="freq-badge">${freq}</span>` : ''}
          ${slot && slot !== 'any' ? `<span class="freq-badge">${SLOT_LABEL[slot]}</span>` : ''}
          ${runText ? `<span class="freq-badge run-badge">${runText}</span>` : ''}
          ${remindAt !== '' ? `<span class="remind-badge">${iconSvg('bell')}${hourLabel(+remindAt)}</span>` : ''}
        </div>
      </div>
    </div>
  </div>`;
}
habitFormEl?.addEventListener('input', renderHabitPreview);
habitFormEl?.addEventListener('change', renderHabitPreview);
newHabitToggle?.addEventListener('click', () => openHabitSheet());
document.getElementById('habit-cancel')?.addEventListener('click', closeHabitSheet);
document.getElementById('empty-create')?.addEventListener('click', () => openHabitSheet());

// Quick add: the top-bar button and the N key take you home and open the form with the cursor in it.
function quickAddHabit() {
  const open = () => openHabitSheet();
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
  const form = e.target;
  const nameEl = sheetField('habit-input');
  const name = nameEl.value.trim();
  if (!name) { setFieldError(nameEl, 'Give the habit a name.'); nameEl.focus(); return; }
  // A required dropdown is empty: its own handler says so under the field. (Only the dropdowns are checked here.
  // form.checkValidity() also fails on a half-typed number or date, and returning on that left Save doing nothing;
  // those are explained by readTarget() and readDates() below.)
  if ([...form.querySelectorAll('select')].filter(sel => !sel.checkValidity()).length) return;
  const category = sheetField('habit-category').value;
  const frequency = sheetField('habit-frequency').value || 'daily';
  const read = readSchedule();
  if (read.error) { setFieldError(sheetField('schedule-days'), read.error); return; }
  clearFieldError(sheetField('schedule-days'));
  ['habit-target-amount', 'habit-target-unit', 'habit-target-step'].forEach(id => clearFieldError(sheetField(id)));
  const goalRead = readTarget();
  if (goalRead.error) { setFieldError(goalRead.error[0], goalRead.error[1]); goalRead.error[0].focus(); return; }
  clearFieldError(sheetField('habit-start')); clearFieldError(sheetField('habit-end'));
  const dates = readDates();
  if (dates.error) { sheetField('habit-dates').open = true; setFieldError(dates.error[0], dates.error[1]); dates.error[0].focus(); return; }
  const timeOfDay = sheetField('habit-time').value || 'any';
  const editId = sheetField('habit-edit-id').value;
  const extra = { timeOfDay, cue: sheetField('habit-cue').value.trim().slice(0, 80), schedule: read.schedule || '', target: goalRead.target, startDate: dates.startDate, endDate: dates.endDate,
    reminderHour: sheetField('habit-reminder').value === '' ? '' : +sheetField('habit-reminder').value, ...readHabitLook() };     // the optional fields, as the sheet has them now
  if (editId) {
    // Editing changes what the habit is called, how it is filed and how it looks. Its completions are never touched.
    // An optional field that has been cleared is removed from the habit, not stored empty.
    const cleared = v => v === undefined || v === null || v === '' || v === 'any';
    const changes = Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, cleared(v) ? deleteField() : v]));
    // History is never re-judged: when the schedule (or how often it repeats) changes, record the rule and the
    // day it takes effect, so every earlier day keeps being judged by the rule that applied then.
    const before = allHabits.find(h => h.id === editId);
    if (before) {
      const today = todayStr();
      const was = rules.scheduleOn(before, today);
      const now = rules.normalizeSchedule(read.schedule, frequency);
      if (JSON.stringify(was) !== JSON.stringify(now)) {
        const history = Array.isArray(before.scheduleHistory) && before.scheduleHistory.length ? before.scheduleHistory : [{ from: '0000-00-00', schedule: was }];
        changes.scheduleHistory = [...history.filter(e => e.from !== today), { from: today, schedule: now }];
      }
    }
    backgroundWrite(updateDoc(doc(db, 'habits', editId), { name, category, frequency, ...changes }), 'update the habit');
    toast('Habit updated', 'success');
    track('habit_edited');
  } else {
    backgroundWrite(addHabit(name, category, frequency, extra), 'add the habit');
    toast('Habit added', 'success');
    track('habit_added', { category, frequency, source: 'form' });
  }
  closeHabitSheet();
});

// ── Habit List Events (delegation) ───────────────────────
// ── Row actions on phones: tucked behind a More button, or a swipe to the left ──
// One row at a time. Tapping anywhere else, or Escape, closes it.
let revealedId = null;
function applyRevealed() {
  document.querySelectorAll('#page-home .habit-item').forEach(row => {
    const on = !!revealedId && row.dataset.id === revealedId;
    row.classList.toggle('is-revealed', on);
    row.querySelector('.row-more')?.setAttribute('aria-expanded', String(on));
  });
}
function setRevealed(id) { revealedId = id || null; applyRevealed(); }
document.addEventListener('click', e => {
  if (revealedId && !(e.target instanceof Element && e.target.closest('.habit-item.is-revealed'))) setRevealed(null);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && revealedId) setRevealed(null); });

// ── Reordering ────────────────────────────────────────────
// A row moves within its own group (the app keeps done habits at the bottom and times of day together).
// Normally one habit's `order` is saved; see planReorder in home.js.
function reorderHabit(id, groupIds, toIndex) {
  const items = groupIds.map(x => ({ id: x, order: allHabits.find(h => h.id === x)?.order }));
  const writes = planReorder(items, id, toIndex);
  if (!writes.length) return;
  writes.forEach(w => {
    const h = allHabits.find(x => x.id === w.id);
    if (h) h.order = w.order;                            // show the new order at once; the snapshot will confirm it
    backgroundWrite(updateDoc(doc(db, 'habits', w.id), { order: w.order }), 'save the new order');
  });
  renderHabits();
  const name = allHabits.find(h => h.id === id)?.name || 'Habit';
  const status = document.getElementById('reorder-status');
  if (status) status.textContent = `${name} moved to position ${toIndex + 1} of ${groupIds.length}`;
  track('habit_reordered');
}
attachReorder(document.getElementById('page-home'), {
  enabled: () => !phoneLayout.matches && !viewingPast(),
  onDrop: reorderHabit,
});

// Swipe right to complete (or take back a recent completion), left to reveal the actions. Phones only.
attachSwipe(document.getElementById('page-home'), {
  enabled: () => phoneLayout.matches && !viewingPast(),
  onLeft: id => setRevealed(id),
  onRight: (id, row) => {
    const cb = row.querySelector('.habit-check');
    const h = allHabits.find(x => x.id === id);
    if (!cb || !h || cb.disabled) return;
    setRevealed(null);
    if (rules.targetOf(h)) { stepHabit(id, 1); return; }   // a counting habit: a swipe is one step
    if (cb.checked) { if (uncompleteHabit(id, cb.dataset.date)) cb.checked = false; }
    else if (confirmFirst()) openConfirmCheckModal(h, cb.dataset.date, cb);
    else completeHabit(id, cb.dataset.date, cb);
  },
});

document.getElementById('page-home').addEventListener('click', async e => {
  // Move up / Move down (phones, inside More)
  const move = e.target.closest('[data-action="move-up"], [data-action="move-down"]');
  if (move) {
    const row = move.closest('.habit-item');
    const group = [...row.parentNode.querySelectorAll(':scope > .habit-item')].filter(r => r.dataset.group === row.dataset.group).map(r => r.dataset.id);
    const to = group.indexOf(move.dataset.id) + (move.dataset.action === 'move-up' ? -1 : 1);
    if (to >= 0 && to < group.length) reorderHabit(move.dataset.id, group, to);
    return;
  }
  // More (phones): show or hide this row's actions
  const stepBtn = e.target.closest('[data-action="step"], [data-action="step-down"]');
  if (stepBtn) { stepHabit(stepBtn.dataset.id, stepBtn.dataset.action === 'step' ? 1 : -1); return; }

  const resumeBtn = e.target.closest('[data-action="resume"]');
  if (resumeBtn) { setPaused(resumeBtn.dataset.id, false); return; }

  const more = e.target.closest('[data-action="more"]');
  if (more) { setRevealed(revealedId === more.dataset.id ? null : more.dataset.id); return; }
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
    setRevealed(null);
    openHabitSheet(h);
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
    openHabitPage(h.id);
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
// One tap completes by default. The question "Mark as complete?" is opt-in (Profile → Ask before completing).
const confirmFirst = () => { try { return localStorage.getItem('habitly_confirm') === 'on'; } catch (_) { return false; } };

// Take a completion back. Shared by un-ticking the box and by Undo, so both follow the same rules:
// only within an hour of completing, and the 25 XP is refunded so ticking cannot be farmed.
// Returns false (and says why) when the completion is locked.
// A completion is saved 300ms after the tap and a take-back 200ms after, so quick taps can overlap. These two
// maps hold what is still on its way, so that the second tap cancels the first instead of racing it.
const pendingComplete = new Map();                    // habit id -> timer
const pendingUncomplete = new Map();                  // habit id -> timer
const stepBack = new Map();                           // counting habits: habit id -> the count before the step that completed it
// The completion moment: a ring draws round the box, the box fills, the check draws, the row settles (about 0.8s, once).
// It starts on the tapped row at once, without waiting for the save. When the save redraws the list, the new row is
// given the same effect moved on by the time already spent (--fx-skip), so it carries on instead of starting again.
const FX_MS = 900;
function startTickFx(row, skipMs = 0) {
  const label = row && row.querySelector('.habit-label');
  if (!label) return;
  row.classList.add('completing');
  row.style.setProperty('--fx-skip', `-${Math.round(skipMs)}ms`);
  if (label.querySelector('.tick-fx')) return;
  const big = !!label.querySelector('.habit-step');   // counting rows have a slightly larger button
  label.insertAdjacentHTML('beforeend', `<svg class="tick-fx" viewBox="0 0 36 36" aria-hidden="true"><circle class="fx-fill" cx="18" cy="18" r="${big ? 14 : 12}"/><circle class="fx-ring" cx="18" cy="18" r="16" pathLength="100"/><path class="fx-mark" d="M11.6 18.6l4.3 4.3 8.5-9.3" pathLength="100"/></svg>`);
}
function stopTickFx(id) {
  if (justCompletedId === id) justCompletedId = null;
  const row = document.querySelector(`.habit-item[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  row.classList.remove('completing', 'just-done');
  row.querySelector('.tick-fx')?.remove();
}

function uncompleteHabit(id, date) {
  const h = allHabits.find(x => x.id === id);
  if (!h) return false;
  stopTickFx(id);
  if (pendingComplete.has(id)) {                      // ticked a moment ago and not saved yet: just call it off
    clearTimeout(pendingComplete.get(id));
    pendingComplete.delete(id);
    playUncheck();
    buzz(30);
    return true;
  }
  // Already open, or already being taken back (for example Undo pressed after un-ticking by hand): nothing to do,
  // and above all nothing to refund a second time.
  if (pendingUncomplete.has(id) || !(h.completedDates || []).includes(date)) return true;
  const completedAt = h.completedTimestamps?.[date];
  const locked = completedAt ? (Date.now() - completedAt > 3600000) : (date !== todayStr());
  if (locked) {
    buzz([60, 40, 60]);
    toast('Locked: a completed habit can only be unchecked within 1 hour.', 'warning');
    return false;
  }
  playUncheck();
  buzz(30);
  pendingUncomplete.set(id, setTimeout(async () => {
    pendingUncomplete.delete(id);
    if (await toggleHabit(id, true, date)) await addXP(-XP_PER_HABIT);
  }, 200));
  return true;
}

// ── Mood notes: an optional tap on a face after completing ──
// Saved on the habit as moods.<day> = 1..5, only while that day is still marked done. Profile has the switch.
const moodOn = () => prefOn('habitly_mood');
function saveMood(id, day, n) {
  const h = allHabits.find(x => x.id === id);
  if (!h || !Number.isInteger(n) || n < 1 || n > 5) return;
  if (!(h.completedDates || []).includes(day) && !pendingComplete.has(id)) return;   // taken back in the meantime
  backgroundWrite(updateDoc(doc(db, 'habits', id), { [`moods.${day}`]: n }), 'save how it felt', true);
  track('mood_noted');                                // that a note was made, never what it said
}

// ── Milestone moments: 7, 30, 100 and 365 days in a row on one habit ──
// Shown once per run of days: this device remembers the day each was shown, and a card already shown for the
// run that is still going (un-tick, tick again) is not shown twice. A new run that gets there again earns it again.
const milestonesKey = () => `habitly_milestones_${currentUser.uid}`;
function offerMilestone(habit, before, after) {
  const m = milestoneCrossed(before, after);
  if (!m || !currentUser) return;
  const today = todayStr();
  let seen = {};
  try { const v = JSON.parse(localStorage.getItem(milestonesKey()) || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) seen = v; } catch (_) {}
  const mine = seen[habit.id] && typeof seen[habit.id] === 'object' ? seen[habit.id] : {};
  if (typeof mine[m] === 'string' && mine[m] >= rules.shiftDay(today, -(m - 1))) return;   // already shown for this run
  seen[habit.id] = { ...mine, [m]: today };
  try { localStorage.setItem(milestonesKey(), JSON.stringify(seen)); } catch (_) {}
  track('milestone_reached', { days: m });
  moments.queueDialog(document.getElementById('milestone-modal'), () => {
    if (!currentUser) return false;
    moments.renderMilestone({ days: m, habit: habit.name, line: MILESTONE_LINES[m] });
    playChime();
    buzz([30, 60, 30, 60, 60]);
  });
}
document.getElementById('milestone-close')?.addEventListener('click', () => document.getElementById('milestone-modal').classList.add('hidden'));
document.getElementById('milestone-share')?.addEventListener('click', async () => {
  const m = moments.currentMilestone();
  if (!m) return;
  track('milestone_share_clicked', { days: m.days });
  const canvas = document.getElementById('milestone-canvas');
  try {
    await moments.drawMilestoneCard(canvas, { ...m, url: SHARE_URL.replace(/^https?:\/\//, '') });
    const how = await moments.shareCanvas(canvas, { filename: `habitly-${m.days}-days.png`, title: `${m.days} days in a row`, text: `${m.days} days in a row on Habitly. ${SHARE_URL}` });
    if (how === 'saved') toast('Image saved', 'success');
    if (how === 'failed') toast('Could not share the picture. Try again.', 'error');
  } catch (err) {
    console.warn('Milestone share failed:', err);
    toast('Could not make the picture. Try again.', 'error');
  }
});

function completeHabit(id, dateToRm, checkboxEl) {
  const habit = allHabits.find(x => x.id === id);
  if (!habit) return;
  if (pendingUncomplete.has(id)) {                    // un-ticked a moment ago and not saved yet: call that off, it stays completed
    clearTimeout(pendingUncomplete.get(id));
    pendingUncomplete.delete(id);
    if (checkboxEl) checkboxEl.checked = true;
    return;
  }
  if (pendingComplete.has(id) || isHabitDoneNow(habit)) return;   // already completed or on its way: never count it twice
  if (checkboxEl) checkboxEl.checked = true;
  if (rules.targetOf(habit)) stepBack.set(id, rules.progressOn(habit, dateToRm || todayStr()));   // so Undo removes exactly this step
  nudgeFirstHabit = false;
  justCompletedId = id;
  justCompletedAt = performance.now();
  setTimeout(() => { if (justCompletedId === id) justCompletedId = null; }, 1600);
  startTickFx(document.querySelector(`.habit-item[data-id="${CSS.escape(id)}"]`));
  playPop();
  buzz([14, 50, 26]);                                 // in step with the effect: the ring, then the check
  pendingComplete.set(id, setTimeout(async () => {
    pendingComplete.delete(id);
    const was = allHabits.find(x => x.id === id) || habit, day = dateToRm || todayStr();
    const streakBefore = habitFreq(was) === 'daily' ? calcHabitStreak(was) : 0;
    await toggleHabit(id, false, dateToRm);
    if (habitFreq(was) === 'daily' && day === todayStr()) {
      offerMilestone(was, streakBefore, rules.habitStreak({ ...was, completedDates: [...new Set([...(was.completedDates || []), day])] }, day, userFrozenDates || []));
    }
    await addXP(XP_PER_HABIT, checkboxEl);
    // Undo stays for six seconds. It finds the date the habit is ticked for now (weekly and monthly habits
    // are ticked for the day they were done), then follows the normal un-tick rules.
    toast('Completed. +25 XP', 'success', 6000, { label: 'Undo', onClick: () => { track('habit_undo'); uncompleteHabit(id, dateToRm || todayStr()); } },
      moodOn() ? moments.moodRow(MOODS, n => saveMood(id, day, n)) : null);
    track('habit_completed');
    checkAllDone(id);
    maybeAskForReminders();
  }, 300));
}

// Counting habits ("5 / 8 glasses"): each tap of + adds one step. Steps on the way are saved at once and earn
// nothing; the step that reaches the target is an ordinary completion (25 XP once, Undo, locked after an hour).
// Minus takes a step back: from a finished count that is the normal take-back, with the normal one-hour rule.
function stepHabit(id, dir) {
  const h = allHabits.find(x => x.id === id), goal = h && rules.targetOf(h);
  if (!h || !goal) return;
  const day = todayStr(), next = rules.stepProgress(h, day, dir);
  if (dir > 0) {
    if (pendingUncomplete.has(id)) { completeHabit(id, day, null); return; }      // taken back a moment ago: call that off
    if (pendingComplete.has(id) || isHabitDoneNow(h)) return;
    if (next >= goal.amount) { completeHabit(id, day, null); return; }
    playPop();
    buzz(20);
    backgroundWrite(updateDoc(doc(db, 'habits', id), { [`progress.${day}`]: next }), 'save your progress');
    track('habit_step');
    return;
  }
  if (pendingComplete.has(id) || (h.completedDates || []).includes(day)) { uncompleteHabit(id, day); return; }
  if (rules.progressOn(h, day) <= 0) return;
  playUncheck();
  buzz(20);
  backgroundWrite(updateDoc(doc(db, 'habits', id), { [`progress.${day}`]: next > 0 ? next : deleteField() }), 'save your progress');
}
const fmtCount = n => Number(n).toLocaleString('en', { maximumFractionDigits: 2 });
const countLabel = (count, goal) => `${fmtCount(count)} / ${fmtCount(goal.amount)}${goal.unit ? ' ' + goal.unit : ''}`;

// ── Checkbox Click Handler with Confirmation ──────────────
document.getElementById('page-home').addEventListener('change', async e => {
  const cb = e.target.closest('.habit-check');
  if (!cb) return;

  const id       = cb.dataset.id;
  const dateToRm = cb.dataset.date;
  const isDone   = cb.checked; // new state after user click

  const h = allHabits.find(x => x.id === id);
  if (!h) return;

  if (isDone) {
    cb.checked = false;
    if (confirmFirst()) openConfirmCheckModal(h, dateToRm, cb);   // only for people who switched "Ask before completing" on
    else completeHabit(id, dateToRm, cb);                         // default: one tap, with Undo
    return;
  }

  if (!uncompleteHabit(id, dateToRm)) cb.checked = true;          // locked: put the tick back
});

// ── Double-click to Open Details ────────────────────────
document.getElementById('page-home').addEventListener('dblclick', async e => {
  const item = e.target.closest('.habit-item');
  if (item) {
    const h = allHabits.find(x => x.id === item.dataset.id);
    if (!h) return;
    openHabitPage(h.id);
  }
});


// ── Habit ideas library ───────────────────────────────────
// About fifty ready-made habits grouped by goal (templates.js, fetched the first time the library is opened).
// Add creates the habit in one tap, with Undo. Adjust opens the habit sheet filled in, to change before saving.
let tpl = null, libraryGoal = '';
const libraryEl = id => document.getElementById(id);
const templateAsHabit = t => ({ name: t.name, category: t.category, frequency: tpl.templateFrequency(t), schedule: t.schedule, target: t.target, cue: t.cue, timeOfDay: t.timeOfDay, icon: t.icon });
function templateSummary(t) {
  const freq = tpl.templateFrequency(t), parts = [];
  if (t.target) parts.push(`${fmtCount(t.target.amount)} ${t.target.unit}`);
  const how = freq === 'monthly' ? 'monthly' : t.schedule ? scheduleLabel(t.schedule) : 'every day';
  parts.push(how.charAt(0).toUpperCase() + how.slice(1));
  if (t.timeOfDay) parts.push(SLOT_LABEL[t.timeOfDay]);
  return parts.join(' · ');
}
function renderLibrary() {
  if (!tpl) return;
  // The list is rebuilt on every change: remember which row had the keyboard, and give it back afterwards
  const held = document.activeElement?.closest?.('#library-list [data-i]'), heldI = held ? held.dataset.i : null, heldAction = held ? held.dataset.action : null;
  const chips = libraryEl('library-goals');
  chips.innerHTML = ['', ...tpl.TEMPLATE_GOALS].map(g => `<button type="button" class="chip" data-goal="${g}" aria-pressed="${g === libraryGoal}">${g || 'All'}</button>`).join('');
  const found = tpl.searchTemplates(libraryEl('library-search').value, libraryGoal);
  const have = new Set(allHabits.filter(h => !h.archivedAt).map(h => String(h.name || '').trim().toLowerCase()));
  libraryEl('library-count').textContent = `${found.length} idea${found.length === 1 ? '' : 's'}`;
  libraryEl('library-none').classList.toggle('hidden', found.length > 0);
  libraryEl('library-list').innerHTML = found.map(t => {
    const look = habitLook(t), added = have.has(t.name.toLowerCase()), i = tpl.TEMPLATES.indexOf(t);
    return `<li class="library-item" style="--cat:${look.color}">
      <span class="cat-ico">${look.icon}</span>
      <div class="library-meta">
        <span class="library-name">${escHtml(t.name)}</span>
        <span class="library-sub">${escHtml(templateSummary(t))}</span>
        ${t.cue ? `<span class="library-cue">${escHtml(t.cue)}</span>` : ''}
      </div>
      <div class="library-actions">
        <button type="button" class="btn-link" data-action="tpl-edit" data-i="${i}" aria-label="Adjust ${escHtml(t.name)} before adding">Adjust</button>
        <button type="button" class="btn-secondary library-add" data-action="tpl-add" data-i="${i}" aria-label="Add ${escHtml(t.name)}" ${added ? 'disabled' : ''}>${added ? 'Added' : 'Add'}</button>
      </div>
    </li>`;
  }).join('');
  if (heldI !== null) {
    const row = [...libraryEl('library-list').querySelectorAll(`[data-i="${heldI}"]`)].filter(b => !b.disabled);
    (row.find(b => b.dataset.action === heldAction) || row[0])?.focus();
  }
}
async function openLibrary() {
  if (!currentUser) return;
  closeHabitSheet();
  if (!tpl) {
    try { tpl = await import('./templates.js?v=1'); }
    catch (_) { toast('Could not load the ideas. Check your connection and try again.', 'error'); return; }
  }
  libraryGoal = '';
  libraryEl('library-search').value = '';
  renderLibrary();
  libraryEl('library-modal').classList.remove('hidden');
  track('library_opened');
}
const closeLibrary = () => libraryEl('library-modal').classList.add('hidden');
function addTemplate(t) {
  const before = new Set(allHabits.map(h => h.id));
  backgroundWrite(addHabit(t.name, t.category, tpl.templateFrequency(t), { timeOfDay: t.timeOfDay || 'any', cue: t.cue || '', schedule: t.schedule || '', target: t.target || '', icon: t.icon || '' }), 'add the habit');
  // Undo removes the habit this tap created (found as the new one with this name; it has no history to lose)
  toast(`${t.name} added`, 'success', 6000, { label: 'Undo', onClick: () => {
    const made = allHabits.find(h => !before.has(h.id) && h.name === t.name);
    if (made) backgroundWrite(deleteDoc(doc(db, 'habits', made.id)), 'remove the habit');
  } });
  track('habit_added', { category: t.category, frequency: tpl.templateFrequency(t), source: 'library' });
}
libraryEl('empty-browse')?.addEventListener('click', openLibrary);
libraryEl('browse-ideas')?.addEventListener('click', openLibrary);
libraryEl('library-close')?.addEventListener('click', closeLibrary);
libraryEl('library-search')?.addEventListener('input', renderLibrary);
libraryEl('library-clear')?.addEventListener('click', () => { libraryEl('library-search').value = ''; libraryGoal = ''; renderLibrary(); libraryEl('library-search').focus(); });
libraryEl('library-goals')?.addEventListener('click', e => {
  const chip = e.target.closest('[data-goal]');
  if (!chip) return;
  libraryGoal = chip.dataset.goal;
  renderLibrary();
  libraryEl('library-goals').querySelector(`[data-goal="${libraryGoal}"]`)?.focus();     // the row was rebuilt: keep the keyboard where it was
});
libraryEl('library-list')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  const t = btn && tpl && tpl.TEMPLATES[+btn.dataset.i];
  if (!t || btn.disabled) return;
  if (btn.dataset.action === 'tpl-add') {
    btn.previousElementSibling?.focus();                // Add is about to become "Added" (disabled): keep the keyboard on this row
    btn.disabled = true;
    addTemplate(t);
    return;
  }
  closeLibrary();
  openHabitSheet(templateAsHabit(t), { asNew: true });
});

// ── Pause and archive ─────────────────────────────────────
// Pausing is for a holiday or an injury: the habit steps out of Today, the ring and reminders, and the paused
// days are skipped by its streak (never counted as misses, never counted as done). Archiving puts a habit away
// for good without deleting anything; it comes back from Profile, Archive.
function setPaused(id, paused) {
  const h = allHabits.find(x => x.id === id);
  if (!h) return;
  const today = todayStr();
  backgroundWrite(updateDoc(doc(db, 'habits', id), { pauses: paused ? rules.withPause(h, today) : rules.withResume(h, today) }), paused ? 'pause the habit' : 'resume the habit');
  toast(paused ? 'Paused. Its streak is safe until you resume.' : 'Resumed. Welcome back.', 'success');
  track(paused ? 'habit_paused' : 'habit_resumed');
}
function setArchived(id, archived) {
  const h = allHabits.find(x => x.id === id);
  if (!h) return;
  const today = todayStr();
  const changes = archived
    ? { archivedAt: Date.now(), archivedOn: today }
    : { archivedAt: deleteField(), archivedOn: deleteField(), pauses: rules.withRestore(h, today) };
  if (!archived && rules.hasEndedOn(h, today)) changes.endDate = deleteField();   // a finished run comes back without its end date, so it runs on
  return backgroundWrite(updateDoc(doc(db, 'habits', id), changes), archived ? 'archive the habit' : 'restore the habit');
}
document.getElementById('details-pause')?.addEventListener('click', () => {
  const h = allHabits.find(x => x.id === currentDetailsHabitId);
  if (!h) return;
  setPaused(h.id, !rules.isPausedOn(h, todayStr()));          // the page stays and shows the new state
});
document.getElementById('details-archive')?.addEventListener('click', () => {
  const id = currentDetailsHabitId;
  if (!id || !allHabits.some(x => x.id === id)) return;
  setArchived(id, true);
  leaveHabitPage();
  toast('Archived. You can bring it back from Profile, under Archive.', 'success', 6000, { label: 'Undo', onClick: () => setArchived(id, false) });
  track('habit_archived');
});
const archivedHabits = () => {
  const today = todayStr();
  return allHabits.filter(h => h.archivedAt || rules.hasEndedOn(h, today))
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0) || String(b.endDate || '').localeCompare(String(a.endDate || '')));
};
function renderArchive() {
  const list = document.getElementById('archive-list');
  if (!list) return;
  const items = archivedHabits();
  if (!items.length) { list.innerHTML = '<div class="deleted-empty">Nothing in the archive.</div>'; return; }
  list.innerHTML = items.map(h => {
    const n = (h.completedDates || []).length;
    const when = h.archivedAt ? 'Archived ' + new Date(h.archivedAt).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : 'Finished ' + shortDate(h.endDate);
    return `<div class="deleted-habit-item archive-item" data-id="${h.id}">
      <div class="deleted-habit-info">
        <span class="deleted-habit-name">${escHtml(h.name || '')}</span>
        <span class="deleted-habit-time">${when} · ${n} check-in${n === 1 ? '' : 's'}</span>
      </div>
      <div class="archive-actions">
        <button class="btn-link" type="button" data-action="unarchive" data-id="${h.id}" aria-label="Restore ${escHtml(h.name || '')}">Restore</button>
        <button class="btn-link danger" type="button" data-action="archive-delete" data-id="${h.id}" aria-label="Delete ${escHtml(h.name || '')}">Delete</button>
      </div>
    </div>`;
  }).join('');
}
document.getElementById('open-archive-btn')?.addEventListener('click', () => {
  renderArchive();
  document.getElementById('archive-modal').classList.remove('hidden');
});
document.getElementById('archive-close')?.addEventListener('click', () => document.getElementById('archive-modal').classList.add('hidden'));
document.getElementById('archive-list')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  const h = btn && allHabits.find(x => x.id === btn.dataset.id);
  if (!h) return;
  if (btn.dataset.action === 'unarchive') {
    // An archived habit comes back as it was. One whose run ended comes back without its end date, so it runs on.
    setArchived(h.id, false);
    toast('Habit restored', 'success');
    track('habit_unarchived');
  } else if (btn.dataset.action === 'archive-delete') {
    backgroundWrite(deleteHabit(h.id), 'remove the habit');
    toast('Removed. It stays in Recently deleted for 1 hour.', 'success');
  }
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
  let maxPossible = 0;                                   // what was due over the same seven days (not "every habit, every day")
  for (let i = 0; i < 7; i++) { const ds = dayKeyOffset(-i); maxPossible += allHabits.filter(h => rules.isDueOn(h, ds)).length; }
  const weeklySum   = counts.reduce((a, b) => a + b, 0);
  const rate        = maxPossible > 0 ? Math.min(100, Math.round((weeklySum / maxPossible) * 100)) : 0;

  document.getElementById('stat-today').textContent  = `${doneToday}/${allHabits.filter(h => (h.completedDates || []).includes(t) || rules.isDueOn(h, t)).length}`;
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

  // 5) How it felt (from the optional mood notes)
  moodInsights(habits).forEach(m => out.push(m.kind === 'best'
    ? { ic: 'mood-5', html: `<strong>\u201C${escHtml(m.name)}\u201D</strong> feels best: ${m.avg} out of 5 over ${m.count} notes.` }
    : { ic: 'mood-2', html: `<strong>\u201C${escHtml(m.name)}\u201D</strong> has felt hard (${m.avg} out of 5). A smaller version may be easier to keep.` }));

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
    const dueThatDay = dailyHabits.filter(h => rules.isDueOn(h, ds));           // rest days, pauses and archived habits are not owed
    if (dueThatDay.length > 0 && dueThatDay.every(h => (h.completedDates||[]).includes(ds))) perfectDays++;
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
  const possible30 = days30.reduce((sum, { ds }) => sum + dailyHabits.filter(h => rules.isDueOn(h, ds)).length, 0);
  const pct30 = possible30 > 0 ? Math.min(100, Math.round((total30 / possible30) * 100)) : 0;
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
  const themeRow = document.getElementById('sound-theme-row');
  const themeRadios = [...document.querySelectorAll('input[name="sound-theme"]')];
  const syncThemeRow = () => {
    if (themeRow) themeRow.hidden = !soundToggle.checked;
    themeRadios.forEach(r => { r.checked = r.value === chosenSoundTheme(); });
  };
  syncThemeRow();
  soundToggle.addEventListener('change', e => {
    localStorage.setItem('habitly_sound', e.target.checked ? 'on' : 'off');
    syncThemeRow();
    if (e.target.checked) playPop();
  });
  // Choosing a theme plays its tick once, so it can be heard before it is kept
  themeRadios.forEach(r => r.addEventListener('change', () => {
    if (!r.checked || !SOUND_THEMES.includes(r.value)) return;
    try { localStorage.setItem('habitly_sound_theme', r.value); } catch (_) {}
    sounds.preview(r.value);
    track('sound_theme', { theme: r.value });
  }));
}
const confirmToggle = document.getElementById('confirm-toggle');
if (confirmToggle) {
  confirmToggle.checked = confirmFirst();
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
const recapToggle = document.getElementById('recap-toggle');
if (recapToggle) {
  recapToggle.checked = recapOfferOn();
  recapToggle.addEventListener('change', e => { try { localStorage.setItem('habitly_recap', e.target.checked ? 'on' : 'off'); } catch (_) {} if (!e.target.checked) moments.hideMoment('recap'); });
}
const moodToggle = document.getElementById('mood-toggle');
if (moodToggle) {
  moodToggle.checked = moodOn();
  moodToggle.addEventListener('change', e => { try { localStorage.setItem('habitly_mood', e.target.checked ? 'on' : 'off'); } catch (_) {} });
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
  setTimeout(() => {
    if (moments.momentShowing()) return;              // one card at the foot of the screen at a time; it asks again another day
    document.getElementById('notif-ask')?.classList.remove('hidden'); track('reminder_ask_shown');
  }, 1800);
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
  
  allHabits.filter(h => inPlay(h, todayStr())).forEach(h => {
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
      reminderHours: [...new Set(allHabits.filter(h => !h.archivedAt && hasReminder(h)).map(h => h.reminderHour))].sort((a, b) => a - b),
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

// ── The habit page ─────────────────────────────────────────
// Each habit has a page of its own (it used to be a small dialog). currentDetailsHabitId is the habit shown.
const habitPageActive = () => document.getElementById('page-habit').classList.contains('active');
function renderHabitPage(habit) {
  const today = todayStr(), look = habitLook(habit), sum = habitSummary(habit, today, userFrozenDates || []);
  document.getElementById('details-habit-name').textContent = habit.name;
  const ico = document.getElementById('hp-ico');
  ico.innerHTML = look.icon; ico.style.setProperty('--cat', look.color);
  const cue = typeof habit.cue === 'string' ? habit.cue.trim().slice(0, 80) : '';
  document.getElementById('hp-sub').textContent = [look.cat.label, habitFreq(habit) === 'daily' ? '' : habitFreq(habit) === 'weekly' ? 'Weekly' : 'Monthly', cue].filter(Boolean).join(' · ');
  const inUnit = n => (habitFreq(habit) === 'daily' ? String(n) : streakShort(habit, n));
  document.getElementById('details-current-streak').textContent = inUnit(sum.streak);
  document.getElementById('details-longest-streak').textContent = inUnit(sum.longest);
  document.getElementById('details-total-days').textContent = sum.total;
  document.getElementById('hp-rate').textContent = sum.rate30 === null ? '\u2013' : sum.rate30 + '%';
  // Time of day can be changed here at any age of the habit (it only affects how Today is grouped)
  document.getElementById('details-time-row').classList.toggle('hidden', habitFreq(habit) !== 'daily');
  document.getElementById('details-time').value = timeSlot(habit);
  const pausedFrom = rules.pausedSince(habit, today);
  document.getElementById('details-pause').innerHTML = iconSvg(pausedFrom ? 'play' : 'pause') + `<span>${pausedFrom ? 'Resume' : 'Pause'}</span>`;
  document.getElementById('details-life-note').textContent = pausedFrom ? `Paused since ${shortDate(pausedFrom)}. Paused days never break a streak.` : '';
  habitPage.renderInsights(document.getElementById('hp-insights'), habitInsights(habit, today, userFrozenDates || []));
  {
    const yesterday = dayKeyOffset(-1), fill = rules.canFillIn(habit, yesterday, today), undo = !fill && canTakeBackFill(habit, yesterday);
    const box = document.getElementById('hp-fill');
    box.classList.toggle('hidden', !fill && !undo);
    box.dataset.mode = undo ? 'undo' : 'fill';
    document.getElementById('hp-fill-title').textContent = undo ? 'Yesterday was filled in' : 'Missed yesterday?';
    document.getElementById('hp-fill-text').textContent = undo ? 'Filled in by mistake? You can take it back for an hour.' : 'You have until midnight tonight to fill it in.';
    document.getElementById('hp-fill-btn').textContent = undo ? 'Take it back' : 'Fill in yesterday';
  }
  habitPage.renderCalendar(document.getElementById('hp-calendar'), monthGrid(habit, calendarMonth, today, userFrozenDates || []));
  habitPage.renderYear(document.getElementById('hp-year'), yearCells(habit, today, userFrozenDates || []), yearShownFor === habit.id);
  yearShownFor = habit.id;
  habitPage.renderWeeksChart(document.getElementById('hp-weeks'), weeklyRates(habit, today));
  habitPage.renderWeekdayChart(document.getElementById('hp-weekdays'), weekdayRates(habit, today));
  habitPage.renderSessions(document.getElementById('focus-sessions'), document.getElementById('focus-total'), sessionTotals(habit.sessions, { count: habit.focusCount, minutes: habit.focusMinutes }));
  renderJournal(habit);
}
document.getElementById('hp-focus')?.addEventListener('click', e => {
  const b = e.target instanceof Element ? e.target.closest('[data-focus]') : null;
  const habit = allHabits.find(x => x.id === currentDetailsHabitId);
  if (b && habit) openTimerModal(habit, Number(b.dataset.focus), true);      // one tap: the session starts
});
let yearShownFor = null;                       // the habit whose year is on screen (a redraw keeps its sideways scroll)
// ── Filling in yesterday ──────────────────────────────────
// A day that was due and missed can be completed until the end of the day after (habit-rules canFillIn). It earns
// the normal 25 XP once, never the daily bonus, is marked as filled in late, and can be taken back for an hour
// like any completion. Nothing older than yesterday can be changed.
// Was yesterday filled in late within the last hour? Then it can still be taken back (the normal one-hour rule).
function canTakeBackFill(h, day) {
  const at = h && h.completedTimestamps && h.completedTimestamps[day];
  return !!h && !!h.backfilled && h.backfilled[day] === true && (h.completedDates || []).includes(day) && Number.isFinite(at) && Date.now() - at < 3600000;
}
const fillingIn = new Set();                   // habits being filled in right now, so a double tap cannot pay twice
function fillIn(id) {
  const h = allHabits.find(x => x.id === id), today = todayStr(), day = dayKeyOffset(-1);
  if (!h || fillingIn.has(id)) return;
  if (!rules.canFillIn(h, day, today)) { toast('That day can no longer be filled in.', 'info'); return; }
  fillingIn.add(id); setTimeout(() => fillingIn.delete(id), 1500);
  const goal = rules.targetOf(h);
  backgroundWrite(updateDoc(doc(db, 'habits', id), {
    completedDates: arrayUnion(day), [`completedTimestamps.${day}`]: Date.now(), [`backfilled.${day}`]: true,
    ...(goal ? { [`progress.${day}`]: Math.max(goal.amount, rules.progressOn(h, day)) } : {}),
  }), 'fill in yesterday');
  addXP(XP_PER_HABIT);
  toast('Yesterday filled in. +25 XP', 'success', 6000, { label: 'Undo', onClick: () => { track('fill_in_undo'); uncompleteHabit(id, day); } });
  track('habit_filled_in');
}
document.getElementById('hp-fill-btn')?.addEventListener('click', () => {
  if (!currentDetailsHabitId) return;
  if (document.getElementById('hp-fill').dataset.mode === 'undo') uncompleteHabit(currentDetailsHabitId, dayKeyOffset(-1));
  else fillIn(currentDetailsHabitId);
});
document.getElementById('page-home').addEventListener('click', e => {
  const b = e.target instanceof Element ? e.target.closest('[data-action="fill-in"], [data-action="fill-undo"]') : null;
  if (!b) return;
  if (b.dataset.day !== dayKeyOffset(-1)) { toast('That day can no longer be changed.', 'info'); renderHabits(); return; }   // the view was drawn before midnight
  if (b.dataset.action === 'fill-undo') uncompleteHabit(b.dataset.id, b.dataset.day); else fillIn(b.dataset.id);
});

// The month the calendar shows (null: this month). It goes back to this month whenever another habit is opened.
let calendarMonth = null;
document.getElementById('hp-calendar')?.addEventListener('click', e => {
  const nav = e.target.closest('.cal-nav');
  const habit = allHabits.find(x => x.id === currentDetailsHabitId);
  if (!nav || nav.disabled || !nav.dataset.cal || !habit) return;
  calendarMonth = nav.dataset.cal;
  const which = nav.getAttribute('aria-label');
  habitPage.renderCalendar(document.getElementById('hp-calendar'), monthGrid(habit, calendarMonth, todayStr(), userFrozenDates || []));
  const again = document.querySelector(`#hp-calendar .cal-nav[aria-label="${which}"]`);     // the calendar was redrawn: keep the focus where it was
  (again && !again.disabled ? again : document.querySelector('#hp-calendar .cal-nav:not([disabled])'))?.focus();
});
// Every habit has an address, #habit/<id>, so Back, Forward, reload and bookmarks all work. The router calls
// habitPageRouted whenever the address changes; the page is then shown from the address, never from memory.
const BASE_TITLE = document.title;
let habitPageCameFrom = '';                    // set when the page was opened from inside the app: Back can go back
let habitRouteId = null;                       // the habit the address names (it may not have loaded yet)
let habitLeaving = false;                      // Back was pressed: do not redraw (or declare it missing) on the way out
function openHabitPage(id) {
  if (!allHabits.some(x => x.id === id)) return;
  habitPageCameFrom = location.hash || '#home';
  location.hash = '#habit/' + encodeURIComponent(id);
  track('habit_page_opened');
}
function habitPageRouted(showing, arg = '') {
  habitLeaving = false;
  if (!showing) { currentDetailsHabitId = null; habitRouteId = null; document.title = BASE_TITLE; return; }
  try { habitRouteId = decodeURIComponent(arg) || null; } catch (_) { habitRouteId = null; }
  showHabitRoute(true);
}
// Show whatever the address names. arrived: the address has just changed (so move to the top and take the focus).
function showHabitRoute(arrived) {
  if (habitLeaving && !arrived) return;
  const body = document.getElementById('habit-body'), missing = document.getElementById('habit-missing');
  if (!habitsLoaded) { body.hidden = true; missing.hidden = true; return; }      // shown as soon as the habits arrive
  const habit = habitRouteId ? allHabits.find(x => x.id === habitRouteId && !x.archivedAt) : null;
  if (!habit) {
    if (currentDetailsHabitId && !arrived) {             // it was on screen and has gone (deleted, or archived elsewhere)
      if (!allHabits.some(x => x.id === currentDetailsHabitId)) toast('That habit has been removed.', 'info');
      currentDetailsHabitId = null; habitPageCameFrom = '';
      location.hash = '#home';
      return;
    }
    currentDetailsHabitId = null;
    body.hidden = true; missing.hidden = false;
    document.title = BASE_TITLE;
    if (arrived) { window.scrollTo(0, 0); document.getElementById('habit-missing-title').focus({ preventScroll: true }); }
    return;
  }
  missing.hidden = true; body.hidden = false;
  const fresh = arrived || currentDetailsHabitId !== habit.id;
  if (currentDetailsHabitId !== habit.id) { document.getElementById('details-journal-input').value = ''; document.getElementById('notes-search').value = ''; calendarMonth = null; }
  currentDetailsHabitId = habit.id;
  renderHabitPage(habit);
  // Analytics reads the tab title. While usage data is shared, the title says only that this is a habit's page.
  document.title = analyticsAllowed() ? 'Habit \u00b7 Habitly' : `${habit.name} \u00b7 Habitly`;
  if (fresh) { window.scrollTo(0, 0); document.getElementById('details-habit-name').focus({ preventScroll: true }); }
}
// Share: a picture of this one habit (its streak, three figures, the last twelve weeks). Nothing else is on it.
document.getElementById('hp-share')?.addEventListener('click', async () => {
  const habit = allHabits.find(x => x.id === currentDetailsHabitId);
  if (!habit) return;
  track('habit_share_clicked');
  const today = todayStr(), frozen = userFrozenDates || [], sum = habitSummary(habit, today, frozen);
  const canvas = document.getElementById('habit-card-canvas');
  const slug = String(habit.name || 'habit').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'habit';
  try {
    await habitPage.drawHabitCard(canvas, { name: habit.name, streak: sum.streak, unit: streakUnit(habit, sum.streak), longest: sum.longest, total: sum.total, rate30: sum.rate30,
      weeks: yearCells(habit, today, frozen).weeks.slice(-12), url: SHARE_URL.replace(/^https?:\/\//, '') });
    const how = await moments.shareCanvas(canvas, { filename: `habitly-${slug}.png`, title: habit.name, text: `${sum.streak} ${streakUnit(habit, sum.streak)} in a row on Habitly. ${SHARE_URL}` });
    if (how === 'saved') toast('Image saved', 'success');
    if (how === 'failed') toast('Could not share the picture. Try again.', 'error');
  } catch (err) {
    console.warn('Habit share failed:', err);
    toast('Could not make the picture. Try again.', 'error');
  }
});
document.getElementById('hp-link')?.addEventListener('click', async () => {
  if (!currentDetailsHabitId) return;
  const url = location.origin + location.pathname + '#habit/' + encodeURIComponent(currentDetailsHabitId);
  try { await navigator.clipboard.writeText(url); toast('Link copied', 'success'); }
  catch (_) { toast('Copy this address from the address bar to share the habit.', 'info', 6000); }
  track('habit_link_copied');
});
function leaveHabitPage() {
  const id = currentDetailsHabitId, cameFromApp = !!habitPageCameFrom;
  habitLeaving = true;
  const back = habitPageCameFrom || '#home';
  habitPageCameFrom = '';
  if (cameFromApp && history.length > 1) history.back(); else location.hash = back;
  // Put the focus back on the habit's row, so a keyboard or screen-reader user is where they left off
  setTimeout(() => {
    const row = id && document.querySelector(`.habit-item[data-id="${CSS.escape(id)}"]`);
    const target = row && (row.querySelector('.habit-step:not([hidden])') || row.querySelector('.habit-check:not([hidden]):not([disabled])') || row.querySelector('button'));
    if (target) target.focus({ preventScroll: true });
  }, 120);
}
document.getElementById('details-close').addEventListener('click', leaveHabitPage);
document.getElementById('hp-edit')?.addEventListener('click', () => {
  const h = allHabits.find(x => x.id === currentDetailsHabitId);
  if (h) openHabitSheet(h);
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

// The notes are a timeline by month. Once there are more than three, a search box narrows them (case and accents
// do not matter; every word must be there) and marks what matched.
function renderJournal(habit) {
  const all = searchNotes(habit.journals, ''), box = document.getElementById('notes-search'), count = document.getElementById('notes-count');
  box.classList.toggle('hidden', all.length <= 3 && !box.value);
  const query = box.classList.contains('hidden') ? '' : box.value.trim();
  const items = query ? searchNotes(habit.journals, query) : all;
  habitPage.renderNotes(document.getElementById('details-journal-list'), items, { total: all.length, query });
  count.classList.toggle('hidden', !query);
  count.textContent = query ? `${items.length} of ${all.length} notes` : '';
}
let notesSearchTimer = 0;
document.getElementById('notes-search')?.addEventListener('input', () => {
  clearTimeout(notesSearchTimer);                      // wait for a pause in typing: one redraw, not one per key
  notesSearchTimer = setTimeout(() => {
    const h = allHabits.find(x => x.id === currentDetailsHabitId);
    if (h) renderJournal(h);
  }, 140);
});

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
// Keep an open habit page in step with the data; if its habit has gone (deleted, or archived elsewhere), leave.
const originalRenderHabits = renderHabits;
renderHabits = function() {
  originalRenderHabits();
  if (habitPageActive()) showHabitRoute(false);
};

// ── Timer Logic ───────────────────────────────────────────
let timerInterval = null;
let timeLeft = 25 * 60; // 25 minutes in seconds
let activeTimerHabit = null;

let timerMinutes = 25;                          // how long the session in the dialog is meant to be
function openTimerModal(habit, minutes = 25, startNow = false) {
  activeTimerHabit = habit;
  timerMinutes = Math.min(120, Math.max(1, Math.round(minutes) || 25));
  const inputEl = document.getElementById('timer-input');
  if (inputEl) inputEl.value = String(timerMinutes);
  timeLeft = timerMinutes * 60;
  updateTimerDisplay();
  document.getElementById('timer-habit-name').textContent = habit.name;
  document.getElementById('timer-modal').classList.remove('hidden');
  if (startNow) document.getElementById('timer-start').click();
}

document.getElementById('timer-input')?.addEventListener('input', (e) => {
  if (timerInterval) return; // Cannot edit while running
  let mins = parseInt(e.target.value);
  if (isNaN(mins) || mins < 1) mins = 1;
  if (mins > 120) mins = 120;
  timerMinutes = mins;
  timeLeft = mins * 60;
  updateTimerDisplay();
});

function updateTimerDisplay() {
  const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s = (timeLeft % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;
}

// Has this habit already been completed for its current period (today / this week / this month)?
// Nothing left to do for this habit right now: done today, done for its period, or simply not due.
function isHabitDoneNow(h) {
  return !rules.isOpenOn(h, todayStr());
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
  // Every finished session is kept on the habit (when, and how long), for the history on its page
  if (h) {
    const so = sessionTotals(h.sessions, { count: h.focusCount, minutes: h.focusMinutes });   // totals so far (counters, or what is stored)
    backgroundWrite(updateDoc(doc(db, 'habits', h.id), { sessions: withSession(h.sessions, Date.now(), timerMinutes), focusCount: so.count + 1, focusMinutes: so.minutes + timerMinutes }), 'save the focus session', true);
    track('focus_session_finished', { minutes: timerMinutes });
  }
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

