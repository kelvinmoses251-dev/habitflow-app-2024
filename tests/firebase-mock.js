// In-memory stand-in for the Firebase v10 modular SDK, used ONLY by tests/smoke.js.
//
// The test runner intercepts every https://www.gstatic.com/firebasejs/* request in headless
// Edge and serves this file instead, so the real, unmodified app code runs end to end
// (auth, Firestore snapshots, arrayUnion, dotted-path updates...) without touching production.
//
// All state lives on `window` + localStorage because the same source is instantiated once per
// import URL (app / auth / firestore / storage / messaging), and they must share state.

const W = window;
const LS_DB = 'mock_fb_db';
const LS_USER = 'mock_fb_user';

const db = (W.__mockDB ||= (() => {
  try { return JSON.parse(localStorage.getItem(LS_DB) || '{}'); } catch (_) { return {}; }
})());
const dbListeners = (W.__mockDbL ||= new Set());
const authListeners = (W.__mockAuthL ||= new Set());
const writes = (W.__mockWrites ||= []);            // audit log the tests can inspect
let idSeq = (W.__mockSeq ||= { n: 1 });

const persist = () => { try { localStorage.setItem(LS_DB, JSON.stringify(db)); } catch (_) {} };
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const col = name => (db[name] ||= {});

// ── Sentinels ───────────────────────────────────────────
export const arrayUnion = (...v) => ({ __op: 'union', v });
export const arrayRemove = (...v) => ({ __op: 'remove', v });
export const increment = n => ({ __op: 'inc', n });
export const deleteField = () => ({ __op: 'del' });

function applyOp(container, key, val) {
  if (val && val.__op === 'union') {
    const cur = Array.isArray(container[key]) ? container[key] : [];
    val.v.forEach(x => { if (!cur.some(y => JSON.stringify(y) === JSON.stringify(x))) cur.push(x); });
    container[key] = cur;
  } else if (val && val.__op === 'remove') {
    const cur = Array.isArray(container[key]) ? container[key] : [];
    container[key] = cur.filter(y => !val.v.some(x => JSON.stringify(x) === JSON.stringify(y)));
  } else if (val && val.__op === 'inc') {
    container[key] = (typeof container[key] === 'number' ? container[key] : 0) + val.n;
  } else if (val && val.__op === 'del') {
    delete container[key];
  } else {
    container[key] = clone(val);
  }
}
function applyUpdate(target, data) {
  Object.entries(data).forEach(([path, val]) => {
    const parts = path.split('.');
    let c = target;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof c[parts[i]] !== 'object' || c[parts[i]] === null) c[parts[i]] = {};
      c = c[parts[i]];
    }
    applyOp(c, parts[parts.length - 1], val);
  });
}

// ── References / queries ────────────────────────────────
export const getFirestore = () => ({ __db: true });
export const initializeFirestore = () => ({ __db: true });
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
// While "offline", real Firestore applies a write locally at once but the returned promise only resolves on
// server acknowledgement. Tests flip window.__mockOffline to reproduce that (a promise that never settles).
const ack = v => (W.__mockOffline ? new Promise(() => {}) : v);
export const collection = (_db, name) => ({ kind: 'col', name });
export const doc = (_db, name, id) => ({ kind: 'doc', name, id });
export const where = (f, op, v) => ({ f, op, v });
export const orderBy = () => ({});
export const limit = () => ({});
export const query = (c, ...cons) => ({ kind: 'q', name: c.name, cons: cons.filter(x => x.f) });

const mkDocSnap = (name, id) => {
  const d = db[name] && db[name][id];
  return { id, exists: () => d !== undefined, data: () => clone(d), metadata: { fromCache: false } };
};
function runQuery(q) {
  const rows = Object.entries(col(q.name)).filter(([, d]) =>
    (q.cons || []).every(c => (c.op === '==' ? d[c.f] === c.v : true)));
  const docs = rows.map(([id]) => mkDocSnap(q.name, id));
  return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false }, forEach: fn => docs.forEach(fn) };
}
const snapFor = ref => (ref.kind === 'doc' ? mkDocSnap(ref.name, ref.id) : runQuery(ref.kind === 'col' ? { name: ref.name, cons: [] } : ref));

// Tests: a write that arrives from somewhere else (another device). window.__mockRemote('users', 'u-test', { ... })
W.__mockRemote = (name, id, data) => { Object.assign((col(name)[id] ||= {}), data); notify(name); };
// Like real Firestore, only listeners on the collection that changed are re-fired.
function notify(name) {
  persist();
  setTimeout(() => dbListeners.forEach(l => {
    if (name && l.ref.name !== name) return;
    { try { l.cb(snapFor(l.ref)); } catch (e) { console.error('mock onSnapshot cb', e); }
    }
  }), 0);
}

// window.__mockProfileDelay (ms) makes users/{uid} arrive after the habits, as it can on a real network.
export function onSnapshot(ref, ...rest) {
  const cb = typeof rest[0] === 'function' ? rest[0] : rest[1];   // (ref, cb) or (ref, options, cb)
  // window.__mockSnapshotError = 'permission-denied' makes the habits listener fail the way a rules error does
  const onError = rest.filter(x => typeof x === 'function')[1];
  if (W.__mockSnapshotError && ref.name === 'habits') {
    setTimeout(() => onError && onError(Object.assign(new Error('Missing or insufficient permissions.'), { code: W.__mockSnapshotError })), 0);
    return () => {};
  }
  const l = { ref, cb };
  const delay = ref.kind === 'doc' && ref.name === 'users' ? (W.__mockProfileDelay || 0)
    : (ref.name === 'habits' ? (W.__mockSnapshotDelay || 0) : 0);          // __mockSnapshotDelay: habits arrive late, as on a slow connection
  let stopped = false;
  if (!delay) dbListeners.add(l);
  // window.__mockCacheFirst: the first habits snapshot is marked as coming from the device's cache (it may be stale);
  // later ones (after a write, or window.__mockRemote) are server answers, as with real Firestore.
  setTimeout(() => { if (!stopped) { dbListeners.add(l); const snap = snapFor(ref); if (W.__mockCacheFirst && ref.name === 'habits') snap.metadata = { fromCache: true }; cb(snap); } }, delay);
  return () => { stopped = true; dbListeners.delete(l); };
}
export async function addDoc(c, data) {
  const id = 'mock' + (idSeq.n++);
  const d = {}; applyUpdate(d, data);
  col(c.name)[id] = d;
  writes.push({ op: 'add', col: c.name, id, data: clone(d) });
  notify(c.name);
  return ack({ id });
}
function mergeDeep(target, data) {
  Object.entries(data).forEach(([key, val]) => {
    if (val && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype && !val.__op) {
      if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) target[key] = {};
      mergeDeep(target[key], val);
    } else applyOp(target, key, val);
  });
}
export async function setDoc(ref, data, opts) {
  const c = col(ref.name);
  if (opts && Array.isArray(opts.mergeFields)) { c[ref.id] = c[ref.id] || {}; opts.mergeFields.forEach(f => { c[ref.id][f] = clone(data[f]); }); }
  else if (opts && opts.merge) { c[ref.id] = c[ref.id] || {}; mergeDeep(c[ref.id], data); }
  else { c[ref.id] = {}; applyUpdate(c[ref.id], data); }
  writes.push({ op: 'set', col: ref.name, id: ref.id, data: clone(data) });
  notify(ref.name);
  return ack(undefined);
}
export async function updateDoc(ref, data) {
  const d = col(ref.name)[ref.id];
  if (!d) throw Object.assign(new Error('No document to update'), { code: 'not-found' });
  applyUpdate(d, data);
  writes.push({ op: 'update', col: ref.name, id: ref.id, data: clone(data) });
  notify(ref.name);
  return ack(undefined);
}
export async function deleteDoc(ref) { delete col(ref.name)[ref.id]; writes.push({ op: 'delete', col: ref.name, id: ref.id }); notify(ref.name); }
export async function getDoc(ref) { return mkDocSnap(ref.name, ref.id); }
export async function getDocs(q) { return runQuery(q.kind === 'col' ? { name: q.name, cons: [] } : q); }

// ── Auth ────────────────────────────────────────────────
const auth = (W.__mockAuth ||= (() => {
  let u = null;
  try { u = JSON.parse(localStorage.getItem(LS_USER) || 'null'); } catch (_) {}
  return { currentUser: u };
})());
// User objects round-trip through JSON, so methods are attached whenever one is handed to the app.
const live = u => u && Object.defineProperty(u, 'getIdTokenResult', { configurable: true, enumerable: false,
  value: async () => ({ authTime: new Date(Date.now() - (W.__mockAuthAgeMs || 0)).toUTCString() }) });
const mkUser = (over = {}) => ({
  uid: 'u-test', displayName: 'Test User', email: 'test@example.com', photoURL: null,
  metadata: { creationTime: new Date().toISOString() }, emailVerified: true, providerData: [{ providerId: 'google.com' }], ...over,
});
const PASSWORD = [{ providerId: 'password' }];
function setUser(u) {
  auth.currentUser = u;
  try { u ? localStorage.setItem(LS_USER, JSON.stringify(u)) : localStorage.removeItem(LS_USER); } catch (_) {}
  setTimeout(() => authListeners.forEach(cb => cb(live(u))), 0);
}
export const initializeApp = () => ({});
export const getAuth = () => auth;
export class GoogleAuthProvider {}
export const onAuthStateChanged = (_a, cb) => { authListeners.add(cb); setTimeout(() => cb(live(auth.currentUser)), 0); return () => authListeners.delete(cb); };
const fail = code => { throw Object.assign(new Error('Firebase: Error (' + code + ').'), { code }); };
// window.__mockPopupError = an auth error code makes the popup fail that way (closed, blocked...).
const googleSignIn = () => { const u = mkUser(); setUser(u); return { user: u, __new: !localStorage.getItem('mock_seen_google') }; };
export async function signInWithPopup() { if (W.__mockPopupError) fail(W.__mockPopupError); return googleSignIn(); }
export async function signInWithRedirect() { W.__mockRedirects = (W.__mockRedirects || 0) + 1; return googleSignIn(); }
export const getRedirectResult = async () => null;
export async function sendPasswordResetEmail(_a, email) { (W.__mockResets ||= []).push(email); }
export async function signInWithEmailAndPassword(_a, email) { if (email.startsWith('wrong@')) fail('auth/invalid-credential'); const u = mkUser({ email, displayName: email.split('@')[0] }); setUser(u); return { user: u }; }
export async function createUserWithEmailAndPassword(_a, email) { if (email.startsWith('taken@')) fail('auth/email-already-in-use'); const u = mkUser({ email, displayName: null, emailVerified: false, providerData: PASSWORD }); setUser(u); return { user: u, __new: true }; }
export async function sendEmailVerification(u) { if (W.__mockVerifyFails) fail(W.__mockVerifyFails); (W.__mockEmails ||= []).push({ type: 'verify', email: u.email }); }
// Like Firebase, reload refreshes the user in place and does not announce a new sign-in.
export async function reload(u) {
  if (W.__mockVerified) u.emailVerified = true;
  try { localStorage.setItem(LS_USER, JSON.stringify(u)); } catch (_) {}
}
export async function updateProfile(u, p) { Object.assign(u, p); setUser(u); }
export async function sendSignInLinkToEmail(_a, email, settings) {
  if (W.__mockLinkOff) fail('auth/operation-not-allowed');
  if (email.startsWith('bad@')) fail('auth/invalid-email');
  (W.__mockEmails ||= []).push({ type: 'link', email, settings });
}
export const isSignInWithEmailLink = (_a, href) => /[?&]mode=signIn(&|$)/.test(String(href)) && /[?&]oobCode=/.test(String(href));
export async function signInWithEmailLink(_a, email, href) {
  if (/oobCode=expired/.test(String(href))) fail('auth/invalid-action-code');
  if (email !== (W.__mockLinkFor || 'ada@example.com')) fail('auth/invalid-email');
  const u = mkUser({ email, displayName: null, emailVerified: true, providerData: [{ providerId: 'emailLink' }] });
  setUser(u);
  return { user: u, __new: !localStorage.getItem('mock_seen_link') };
}
export async function signOut() { setUser(null); }
// Like real Firebase, deleting an account needs a sign-in from the last 5 minutes (window.__mockAuthAgeMs = age).
export async function deleteUser() {
  if ((W.__mockAuthAgeMs || 0) > 5 * 60000) fail('auth/requires-recent-login');
  if (W.__mockDeleteUserFails) fail('auth/network-request-failed');
  setUser(null);
}
export const getAdditionalUserInfo = cred => ({ isNewUser: !!(cred && cred.__new) });

// ── Analytics: record events so tests can assert on them ──
export const isSupported = async () => true;
export const getAnalytics = () => ({});
export const logEvent = (_a, name, params) => { (W.__mockEvents ||= []).push({ name, params: params || {} }); };

// ── Storage / Messaging (inert) ─────────────────────────
export const getStorage = () => ({});
export const ref = () => ({});
export const uploadString = async () => ({});
export const getDownloadURL = async () => '';
export const getMessaging = () => ({});
export const getToken = async () => W.__mockFcmToken || null;   // tests set window.__mockFcmToken to act as an opted-in device
export const onMessage = () => {};
