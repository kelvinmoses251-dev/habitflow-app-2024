// ═══════════════════════════════════════════════════════════
// Habitly — "Try it before you sign up" landing demo
//
// Lives entirely on the auth screen. It never touches Firebase:
//   • visitors tick / add habits in a sandbox and watch XP, streak,
//     level-ups and confetti happen live;
//   • the three starting habits come with six earlier days of SAMPLE history
//     (clearly labelled), so the Stats tab and the streak have something to
//     show. That sample never leaves this file: it is not stored and is never
//     written to an account;
//   • whatever they did is parked in localStorage under `habitly_demo`;
//   • app.js reads that key after a brand-new account signs in and seeds
//     those habits (and today's ticks) into Firestore, so the demo
//     progress is genuinely theirs.
// Returning users (who have signed in before) never see the hero.
// ═══════════════════════════════════════════════════════════

const DEMO_KEY      = 'habitly_demo';
const RETURNING_KEY = 'habitly_returning';
const MAX_HABITS    = 5;
const XP_PER_HABIT  = 25;   // mirrors the real app
const XP_ALL_DONE   = 100;  // mirrors the real app

const LEVELS = [   // titles mirror LEVEL_TITLES in app.js
  { level: 1, min: 0,   title: 'Starter'    },
  { level: 2, min: 100, title: 'Builder'    },
  { level: 3, min: 250, title: 'Steady'     },
  { level: 4, min: 450, title: 'Consistent' },
];

// `category` values are real keys of CATS in app.js so seeding is lossless.
// `past`: the six days before today, oldest first (1 = done). Sample data, for the demo only.
const DEFAULT_HABITS = [
  { name: 'Drink water',      category: 'health',  past: [1, 1, 1, 1, 1, 1] },
  { name: 'Read 10 pages',    category: 'reading', past: [1, 0, 1, 1, 1, 1] },
  { name: '5-min stretch',    category: 'fitness', past: [0, 1, 0, 0, 0, 1] },
];
const SAMPLE = new Map(DEFAULT_HABITS.map(h => [h.name.toLowerCase(), h.past]));
const NO_PAST = [0, 0, 0, 0, 0, 0];
// The sample week behind a habit: only the three starting habits have one.
const pastOf = h => SAMPLE.get(String(h.name).toLowerCase()) || NO_PAST;
// How many days in a row, ending today if it is done, else yesterday (the run is still alive until the day ends).
const runOf = h => { const p = pastOf(h); let n = 0; for (let i = p.length - 1; i >= 0 && p[i]; i--) n++; return n + (h.done ? 1 : 0); };
const SUGGESTIONS = [
  { name: 'Meditate 5 min',      category: 'relaxation' },
  { name: 'Walk 20 minutes',     category: 'fitness'    },
  { name: 'Journal one thing',   category: 'growth'     },
  { name: 'No phone before bed', category: 'mind'       },
];
const CATEGORIES = new Set(['health', 'reading', 'fitness', 'relaxation', 'growth', 'mind', 'productive']);

// Analytics hand-off: app.js owns the (consent-aware) tracker; we queue events and poke it.
function emit(name, params) {
  window.__habitlyQ = window.__habitlyQ || [];
  window.__habitlyQ.push({ name, params });
  window.dispatchEvent(new CustomEvent('habitly:track'));
}

const $ = id => document.getElementById(id);
const screenEl = $('auth-screen');
const heroEl   = $('landing-hero');
if (screenEl && heroEl) init();

function init() {
  const el = {
    card: $('demo-card'), banner: $('demo-banner'), streak: $('demo-streak'),
    streakN: $('demo-streak-n'), level: $('demo-level'), xpNow: $('demo-xp-now'),
    xpNext: $('demo-xp-next'), xpFill: $('demo-xp-fill'), hint: $('demo-hint'),
    list: $('demo-list'), suggest: $('demo-suggest'), addWrap: $('demo-add-wrap'),
    tabs: $('demo-tabs'), today: $('demo-today'), stats: $('demo-stats'), week: $('demo-week'),
    rate: $('demo-rate'), rateSub: $('demo-rate-sub'), habitsWeek: $('demo-habits-week'),
    addForm: $('demo-add-form'), addInput: $('demo-add-input'),
    authCard: $('auth-card'), heading: $('auth-heading'), sub: $('auth-sub'),
    fine: $('auth-fine'), sticky: $('landing-sticky'), stickyTitle: $('ls-title'),
    stickySub: $('ls-sub'), stickyBtn: $('ls-btn'), loginBtn: $('login-btn'),
  };

  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // local day, same basis as app.js
  let uid = 0;
  const newId = () => 'd' + Date.now().toString(36) + (uid++);

  // ── State ────────────────────────────────────────────────
  let state = load();
  let shownXP = deriveXP(state);          // what the counter currently displays
  let lastLevel = levelFor(shownXP).level;
  let authCardVisible = false;
  let bannerTimer = null;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(DEMO_KEY));
      if (raw && Array.isArray(raw.habits) && raw.habits.length) {
        const sameDay = raw.day === today();
        return {
          // A new day means a clean slate of ticks but we keep their habits.
          habits: raw.habits.slice(0, MAX_HABITS).map(h => ({
            id: String(h.id || newId()),
            name: String(h.name || '').slice(0, 48),
            category: CATEGORIES.has(h.category) ? h.category : 'productive',
            done: sameDay && !!h.done,
          })).filter(h => h.name),
          bonus: sameDay && !!raw.bonus,
          touched: true,
        };
      }
    } catch (_) { /* private mode / bad JSON — fall through */ }
    return {
      habits: DEFAULT_HABITS.map(({ name, category }) => ({ id: newId(), name, category, done: false })),
      bonus: false,
      touched: false,
    };
  }

  function save() {
    // Only persist once the visitor has actually played, so an untouched
    // page view can never seed habits they didn't choose.
    if (!state.touched) return;
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify({
        v: 1, day: today(), bonus: state.bonus,
        habits: state.habits.map(({ id, name, category, done }) => ({ id, name, category, done })),
      }));
    } catch (_) { /* storage unavailable — demo still works, just won't carry over */ }
  }

  // ── Derived values ───────────────────────────────────────
  function deriveXP(s) {
    return s.habits.filter(h => h.done).length * XP_PER_HABIT + (s.bonus ? XP_ALL_DONE : 0);
  }
  function levelFor(xp) {
    let cur = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.min) cur = l;
    const next = LEVELS[LEVELS.indexOf(cur) + 1] || { min: cur.min + 400 };
    return { ...cur, next: next.min };
  }
  const doneCount = () => state.habits.filter(h => h.done).length;

  // ── Mode: returning users skip the hero entirely ─────
  function isReturning() {
    try {
      if (localStorage.getItem(RETURNING_KEY)) return true;
      for (let i = 0; i < localStorage.length; i++) {
        if ((localStorage.key(i) || '').startsWith('habitly_seen_')) return true;
      }
    } catch (_) { /* ignore */ }
    return false;
  }
  function applyMode() {
    screenEl.classList.toggle('is-returning', isReturning());
    syncAuthCopy();
    syncSticky();
  }

  // ── Rendering ────────────────────────────────────────────
  function renderList(justToggledId) {
    el.list.textContent = '';
    state.habits.forEach(h => {
      const li = document.createElement('li');
      li.className = 'demo-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'demo-habit' + (h.done ? ' done' : '') + (h.id === justToggledId ? ' just-ticked' : '');
      btn.setAttribute('aria-pressed', h.done ? 'true' : 'false');
      btn.dataset.id = h.id;

      const name = document.createElement('span');
      name.className = 'demo-name';
      name.textContent = h.name;

      const chip = document.createElement('span');
      chip.className = 'demo-xpchip';
      chip.textContent = '+' + XP_PER_HABIT + ' XP';

      const check = document.createElement('span');
      check.className = 'demo-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

      btn.append(name, chip, check);   // the check box is moved to the front with CSS order
      li.appendChild(btn);
      el.list.appendChild(li);
    });
  }

  function renderSuggestions() {
    el.suggest.textContent = '';
    const taken = new Set(state.habits.map(h => h.name.toLowerCase()));
    const full = state.habits.length >= MAX_HABITS;
    el.addWrap.classList.toggle('hidden', full);
    if (full) return;
    SUGGESTIONS.filter(s => !taken.has(s.name.toLowerCase())).slice(0, 3).forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'demo-chip';
      b.textContent = 'Add ' + s.name;
      b.addEventListener('click', () => addHabit(s.name, s.category));
      el.suggest.appendChild(b);
    });
  }

  function renderMeter(animate = true) {
    const xp = deriveXP(state);
    const lvl = levelFor(xp);
    const span = lvl.next - lvl.min;
    el.level.textContent = `Level ${lvl.level} · ${lvl.title}`;
    el.xpNext.textContent = String(lvl.next - lvl.min);
    el.xpFill.style.width = Math.min(100, Math.round(((xp - lvl.min) / span) * 100)) + '%';

    // Tween the XP number (relative to the current level, like the real app)
    const from = shownXP - levelFor(shownXP).min;
    const to = xp - lvl.min;
    shownXP = xp;
    if (!animate || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.xpNow.textContent = String(to);
    } else {
      const t0 = performance.now(), dur = 520;
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        el.xpNow.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    // Streak flame: the longest run among the habits; lit once something is ticked today
    const d = doneCount();
    el.streakN.textContent = String(Math.max(0, ...state.habits.map(runOf)));
    el.streak.classList.toggle('lit', d > 0);
    renderStats();

    // Hint copy follows progress
    if (d === 0) el.hint.textContent = 'Select a habit to mark it done.';
    else if (!state.bonus) el.hint.textContent = `${d} of ${state.habits.length} done. Complete all of them for a +${XP_ALL_DONE} XP bonus.`;
    else el.hint.textContent = 'All done. Create an account to keep this progress.';

    el.card.classList.toggle('engaged', state.touched);
    return lvl;
  }

  // ── The Stats tab: the sample week plus whatever is ticked today ─────────
  const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'], DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekdayAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getDay(); };
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function renderStats() {
    if (!el.week) return;
    const n = state.habits.length;
    // done per day, oldest first; the last is today
    const perDay = [0, 1, 2, 3, 4, 5].map(i => state.habits.reduce((s, h) => s + (pastOf(h)[i] ? 1 : 0), 0)).concat(doneCount());
    const total = perDay.reduce((a, b) => a + b, 0), due = n * 7;
    el.rate.textContent = due ? Math.round((total / due) * 100) + '%' : '0%';
    el.rateSub.textContent = `${total} of ${due} done in these seven days`;
    el.week.textContent = '';
    perDay.forEach((count, i) => {
      const ago = 6 - i, col = mk('div', 'dw-day' + (ago === 0 ? ' is-today' : ''));
      col.setAttribute('role', 'img');
      col.setAttribute('aria-label', `${ago === 0 ? 'Today' : DAY_NAMES[weekdayAgo(ago)]}: ${count} of ${n} done`);
      const bar = mk('span', 'dw-bar'), fill = mk('span', 'dw-fill');
      fill.style.height = (n ? Math.round((count / n) * 100) : 0) + '%';
      bar.appendChild(fill);
      col.append(bar, mk('span', 'dw-lbl', DAY_LETTERS[weekdayAgo(ago)]));
      el.week.appendChild(col);
    });
    el.habitsWeek.textContent = '';
    state.habits.forEach(h => {
      const row = mk('li', 'dh-row'), dots = mk('span', 'dh-dots'), run = runOf(h), fresh = !SAMPLE.has(h.name.toLowerCase());
      dots.setAttribute('aria-hidden', 'true');
      [...pastOf(h), h.done ? 1 : 0].forEach((on, i) => dots.appendChild(mk('i', 'dh-dot' + (on ? ' is-done' : '') + (i === 6 ? ' is-today' : ''))));
      row.append(mk('span', 'dh-name', h.name), dots, mk('span', 'dh-run', fresh && !h.done ? 'New' : `${run} ${run === 1 ? 'day' : 'days'}`));
      el.habitsWeek.appendChild(row);
    });
  }
  function showTab(name, focus = false) {
    const stats = name === 'stats';
    el.tabs.querySelectorAll('[role="tab"]').forEach(t => {
      const on = t.dataset.tab === (stats ? 'stats' : 'today');
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    el.today.hidden = stats;
    el.stats.hidden = !stats;
    if (stats) emit('demo_stats_viewed');
  }

  function syncAuthCopy() {
    if (isReturning()) {
      el.heading.textContent = 'Sign in';
      el.sub.textContent = 'Pick up where you left off.';
      el.fine.textContent = '';
      el.fine.classList.add('hidden');
      return;
    }
    el.fine.classList.remove('hidden');
    const d = doneCount();
    const xp = deriveXP(state);
    if (d > 0) {
      el.heading.textContent = 'Save your progress';
      el.sub.textContent = `${d} habit${d === 1 ? '' : 's'} completed, ${xp} XP. Create an account to keep ${d === 1 ? 'it' : 'them'}.`;
      el.fine.textContent = 'Your demo habits are added to your account automatically';
    } else {
      el.heading.textContent = 'Create your account';
      el.sub.textContent = 'It takes about 10 seconds. Already registered? Sign in below.';
      el.fine.textContent = 'No credit card needed';
    }
  }

  function syncSticky() {
    const d = doneCount();
    const show = !isReturning() && d > 0 && !authCardVisible;
    el.sticky.classList.toggle('show', show);
    if (d > 0) {
      el.stickyTitle.textContent = 'Progress not saved';
      el.stickySub.textContent = `${deriveXP(state)} XP earned in the demo`;
    }
  }

  // ── Juice ────────────────────────────────────────────────
  let audioCtx = null;
  function tone(freqs, { type = 'sine', gap = 0.09, len = 0.5, vol = 0.25 } = {}) {
    try {
      if (localStorage.getItem('habitly_sound') !== 'on') return;   // sound is opt-in
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;
      freqs.forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = t0 + i * gap;
        o.type = type; o.frequency.setValueAtTime(f, t);
        if (freqs.length === 1) o.frequency.exponentialRampToValueAtTime(f * 1.75, t + 0.09);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t); o.stop(t + len + 0.05);
      });
    } catch (_) { /* audio is garnish */ }
  }
  const pop = () => tone([520], { len: 0.12, vol: 0.3 });
  const chime = () => tone([523.25, 659.25, 783.99, 1046.5, 1318.51], { len: 0.65, vol: 0.28 });

  function floatXP(fromEl, text) {
    const cardBox = el.card.getBoundingClientRect();
    const box = fromEl.getBoundingClientRect();
    const f = document.createElement('span');
    f.className = 'demo-float';
    f.textContent = text;
    f.style.left = (box.right - cardBox.left - 70) + 'px';
    f.style.top = (box.top - cardBox.top + 2) + 'px';
    el.card.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  }

  function showBanner(text) {
    el.banner.textContent = text;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2800);
  }

  // ── Actions ──────────────────────────────────────────────
  function toggle(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    state.touched = true;
    h.done = !h.done;
    const firstTickEver = h.done && doneCount() === 1;

    const allDone = state.habits.length > 0 && state.habits.every(x => x.done);
    const hadBonus = state.bonus;
    if (allDone) state.bonus = true;
    if (!h.done) state.bonus = false; // un-ticking revokes the perfect-day bonus
    save();

    renderList(h.done ? id : null);
    const lvl = renderMeter();
    syncAuthCopy();
    syncSticky();

    if (navigator.vibrate && localStorage.getItem('habitly_haptics') !== 'off') navigator.vibrate(h.done ? 18 : 8);

    if (h.done) {
      pop();
      const rowBtn = el.list.querySelector(`[data-id="${id}"]`);
      if (rowBtn) floatXP(rowBtn, '+' + XP_PER_HABIT + ' XP');
      if (firstTickEver) emit('demo_first_tick');
      if (state.bonus && !hadBonus) {
        chime(); emit('demo_perfect_day');
        setTimeout(() => floatXP(el.xpFill.parentElement, '+' + XP_ALL_DONE + ' XP bonus!'), 250);
      }
      if (lvl.level > lastLevel) showBanner(`Level ${lvl.level} reached: ${lvl.title}`);
    }
    lastLevel = lvl.level;
  }

  function addHabit(name, category) {
    name = name.trim().replace(/\s+/g, ' ').slice(0, 48);
    if (!name || state.habits.length >= MAX_HABITS) return;
    if (state.habits.some(h => h.name.toLowerCase() === name.toLowerCase())) return;
    state.touched = true;
    emit('demo_habit_added', { custom: category === 'productive' });
    // A new habit means the day isn't "perfect" anymore, but XP already earned stays.
    state.habits.push({ id: newId(), name, category: category || 'productive', done: false });
    save();
    renderList();
    renderSuggestions();
    renderMeter(false);
    syncAuthCopy();
    pop();
  }

  // ── Wire up ──────────────────────────────────────────────
  el.list.addEventListener('click', e => {
    const b = e.target.closest('.demo-habit');
    if (b) toggle(b.dataset.id);
  });
  el.tabs?.addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) showTab(t.dataset.tab); });
  el.tabs?.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const now = el.tabs.querySelector('[aria-selected="true"]').dataset.tab;
    showTab(e.key === 'Home' ? 'today' : e.key === 'End' ? 'stats' : now === 'today' ? 'stats' : 'today', true);
  });
  el.addForm.addEventListener('submit', e => {
    e.preventDefault();
    addHabit(el.addInput.value, 'productive');
    el.addInput.value = '';
  });
  el.stickyBtn.addEventListener('click', () => {
    el.authCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  // Top-bar "Sign in": bring the account card into view and put the cursor in the email field
  document.getElementById('landing-signin')?.addEventListener('click', () => {
    el.authCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('auth-email')?.focus({ preventScroll: true }), 350);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      authCardVisible = entries[0].isIntersecting;
      syncSticky();
    }, { threshold: 0.35 }).observe(el.authCard);
  }

  // app.js asks for the heading to be put back when the card returns to "Create account"
  window.addEventListener('habitly:auth-copy', syncAuthCopy);
  // app.js fires this whenever the auth screen is shown (e.g. after sign-out)
  window.addEventListener('habitly:auth-shown', () => { state = load(); lastLevel = levelFor(deriveXP(state)).level; renderList(); renderSuggestions(); renderMeter(false); applyMode(); });

  renderList();
  renderSuggestions();
  renderMeter(false);
  applyMode();
  if (!isReturning()) emit('landing_view');
}
