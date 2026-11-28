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
