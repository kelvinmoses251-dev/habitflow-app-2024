// onboarding.js: getting in and getting started. The small decisions behind sign-in by emailed link (and, as
// batch 7 grows, the goal picker and the install guide), kept apart from the page so they can be tested alone.
//
// Pure: nothing here touches the page or Firebase. Storage is passed in. Unit tests: node --test tests/onboarding.test.js

// ── Sign-in by emailed link ────────────────────────────────
// Firebase needs the address again when the link is opened. On the device that asked for the link it is kept
// here until then (for a day at most), so the person does not have to type it twice. It is removed once used.
export const LINK_EMAIL_KEY = 'habitly_link_email';
export const LINK_EMAIL_TTL = 24 * 60 * 60 * 1000;

export const isEmail = value => typeof value === 'string' && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim());

export function rememberLinkEmail(store, email, now = Date.now()) {
  try { store.setItem(LINK_EMAIL_KEY, JSON.stringify({ email: String(email).trim(), at: now })); return true; } catch (_) { return false; }
}
// The remembered address, or '' when there is none, it is stale, or storage is unreadable. Reading it clears it.
export function takeLinkEmail(store, now = Date.now()) {
  try {
    const raw = store.getItem(LINK_EMAIL_KEY);
    if (raw === null) return '';
    store.removeItem(LINK_EMAIL_KEY);
    const kept = JSON.parse(raw);
    return kept && typeof kept.email === 'string' && isEmail(kept.email) && Number.isFinite(kept.at) && now - kept.at >= 0 && now - kept.at <= LINK_EMAIL_TTL ? kept.email : '';
  } catch (_) { return ''; }
}

// Why a link did not work, in plain words.
export function linkProblem(code) {
  return ({
    'auth/invalid-action-code': 'That link has expired or was already used. Ask for a new one.',
    'auth/expired-action-code': 'That link has expired or was already used. Ask for a new one.',
    'auth/invalid-email': 'That is not the address the link was sent to. Check it and try again.',
    'auth/operation-not-allowed': 'Sign-in by link is not switched on yet. Please use a password or Google.',
    'auth/network-request-failed': 'You seem to be offline. Check your connection and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
    'auth/user-disabled': 'This account has been disabled.',
  })[code] || 'Something went wrong. Please try again.';
}

// ── First habits for a goal ────────────────────────────────
// The goal picker shown to an account with no habits: from the goals someone picks, a short list of first habits
// out of the library (templates.js). One goal gives three, two give four, more give five; the goals take turns so
// each is represented, no habit appears twice, and names the person already has are skipped.
export function habitsForGoals(templates, goals, have = []) {
  const list = Array.isArray(templates) ? templates.filter(t => t && typeof t.name === 'string' && Array.isArray(t.goals)) : [];
  const picked = Array.isArray(goals) ? goals.filter(g => list.some(t => t.goals.includes(g))) : [];
  if (!picked.length) return [];
  const want = picked.length === 1 ? 3 : picked.length === 2 ? 4 : 5;
  const used = new Set((Array.isArray(have) ? have : []).map(n => String(n).toLowerCase()));
  const queues = picked.map(g => list.filter(t => t.goals.includes(g)));
  const out = [];
  for (let turn = 0, idle = 0; out.length < want && idle < queues.length; turn++) {
    const q = queues[turn % queues.length];
    let next = null;
    while (q.length && !next) { const t = q.shift(); if (!used.has(t.name.toLowerCase())) next = t; }
    if (next) { out.push(next); used.add(next.name.toLowerCase()); idle = 0; } else idle++;
  }
  return out;
}

// ── Which install help to show ─────────────────────────────
//   installed   already running as an installed app
//   prompt      the browser has offered to install (one button does it)
//   ios         iPhone or iPad in Safari: Share, then Add to Home Screen
//   ios-other   another browser on iPhone: it has to be done from Safari
//   manual      anything else: the browser's own menu
// An iPad reports itself as a Mac, so a "Mac" with a touch screen is treated as one.
export function installPlatform({ ua = '', standalone = false, canPrompt = false, touchPoints = 0 } = {}) {
  if (standalone) return 'installed';
  if (canPrompt) return 'prompt';
  const agent = String(ua);
  const ios = /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1);
  if (!ios) return 'manual';
  return /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA\/|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger/.test(agent) ? 'ios-other' : 'ios';
}

// Housekeeping, run when the app opens: a remembered address older than a day (or unreadable) is removed, so it
// cannot sit on the device for ever if the link is never opened. A fresh one is left for the link to use.
export function dropStaleLinkEmail(store, now = Date.now()) {
  try {
    const raw = store.getItem(LINK_EMAIL_KEY);
    if (raw === null) return;
    let kept = null;
    try { kept = JSON.parse(raw); } catch (_) { /* unreadable: drop it */ }
    const fresh = kept && typeof kept.email === 'string' && Number.isFinite(kept.at) && now - kept.at >= 0 && now - kept.at <= LINK_EMAIL_TTL;
    if (!fresh) store.removeItem(LINK_EMAIL_KEY);
  } catch (_) { /* storage blocked: nothing to clean */ }
}
export const forgetLinkEmail = store => { try { store.removeItem(LINK_EMAIL_KEY); } catch (_) { /* ignore */ } };
