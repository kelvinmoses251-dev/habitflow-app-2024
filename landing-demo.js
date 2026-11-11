// ═══════════════════════════════════════════════════════════
// Habitly — "Try it before you sign up" landing demo
//
// Lives entirely on the auth screen. It never touches Firebase:
//   • visitors tick / add habits in a sandbox and watch XP, streak,
//     level-ups and confetti happen live;
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

const LEVELS = [
  { level: 1, min: 0,   title: 'Novice',      icon: '🌱' },
  { level: 2, min: 100, title: 'Apprentice',  icon: '⚡' },
  { level: 3, min: 250, title: 'Disciplined', icon: '🛡️' },
  { level: 4, min: 450, title: 'Consistent',  icon: '🔥' },
];

// `category` values are real keys of CATS in app.js so seeding is lossless.
const DEFAULT_HABITS = [
  { name: 'Drink water',      category: 'health'  },
  { name: 'Read 10 pages',    category: 'reading' },
  { name: '5-min stretch',    category: 'fitness' },
];
const SUGGESTIONS = [
  { name: 'Meditate 5 min',      category: 'relaxation' },
  { name: 'Walk 20 minutes',     category: 'fitness'    },
  { name: 'Journal one thing',   category: 'growth'     },
  { name: 'No phone before bed', category: 'mind'       },
];
const EMOJI = {
  health: '💧', reading: '📖', fitness: '🤸', relaxation: '🧘',
  growth: '✍️', mind: '🧠', productive: '⚡',
};

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
            category: EMOJI[h.category] ? h.category : 'productive',
            done: sameDay && !!h.done,
          })).filter(h => h.name),
          bonus: sameDay && !!raw.bonus,
          touched: true,
        };
      }
    } catch (_) { /* private mode / bad JSON — fall through */ }
    return {
      habits: DEFAULT_HABITS.map(h => ({ id: newId(), ...h, done: false })),
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

      const ico = document.createElement('span');
      ico.className = 'demo-ico';
      ico.textContent = EMOJI[h.category] || '⚡';
      ico.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'demo-name';
      name.textContent = h.name;

      const chip = document.createElement('span');
      chip.className = 'demo-xpchip';
      chip.textContent = h.done ? '✓ +' + XP_PER_HABIT : '+' + XP_PER_HABIT + ' XP';

      const check = document.createElement('span');
      check.className = 'demo-check';
      check.setAttribute('aria-hidden', 'true');
      check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

      btn.append(ico, name, chip, check);
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
      b.textContent = '+ ' + s.name;
      b.addEventListener('click', () => addHabit(s.name, s.category));
      el.suggest.appendChild(b);
    });
  }

  function renderMeter(animate = true) {
    const xp = deriveXP(state);
    const lvl = levelFor(xp);
    const span = lvl.next - lvl.min;
    el.level.textContent = `Lv. ${lvl.level} · ${lvl.title} ${lvl.icon}`;
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

    // Streak flame
    const d = doneCount();
    el.streakN.textContent = d > 0 ? '1' : '0';
    el.streak.classList.toggle('lit', d > 0);

    // Hint copy follows progress
    if (d === 0) el.hint.textContent = '👆 Tap a habit to tick it off';
    else if (!state.bonus) el.hint.textContent = `${d} of ${state.habits.length} done. Finish them all for a +${XP_ALL_DONE} XP bonus!`;
    else el.hint.textContent = '🏆 Perfect day! Save it before it’s gone.';

    el.card.classList.toggle('engaged', state.touched);
    return lvl;
  }

  function syncAuthCopy() {
    if (isReturning()) {
      el.heading.textContent = 'Welcome back';
      el.sub.textContent = 'Sign in to pick up right where you left off';
      el.fine.textContent = '';
      el.fine.classList.add('hidden');
      return;
    }
    el.fine.classList.remove('hidden');
    const d = doneCount();
    const xp = deriveXP(state);
    if (d > 0) {
      el.heading.textContent = 'Save your 🔥 streak';
      el.sub.textContent = `${d} habit${d === 1 ? '' : 's'} ticked · ${xp} XP earned. Sign in and it all comes with you.`;
      el.fine.textContent = 'Your demo habits move into your account automatically';
    } else {
      el.heading.textContent = 'Start your streak';
      el.sub.textContent = 'Create your account in 10 seconds, or sign in';
      el.fine.textContent = 'Takes 10 seconds · No credit card needed';
    }
  }

  function syncSticky() {
    const d = doneCount();
    const show = !isReturning() && d > 0 && !authCardVisible;
    el.sticky.classList.toggle('show', show);
    if (d > 0) {
      const xp = deriveXP(state);
      el.stickyTitle.textContent = state.bonus ? '🏆 Perfect day!' : '🔥 Streak started!';
      el.stickySub.textContent = `${xp} XP earned. Save it before it's gone`;
    }
  }

  // ── Juice ────────────────────────────────────────────────
  let audioCtx = null;
  function tone(freqs, { type = 'sine', gap = 0.09, len = 0.5, vol = 0.25 } = {}) {
    try {
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

  function burst(big) {
    if (!window.confetti) return;
    const r = el.card.getBoundingClientRect();
    window.confetti({
      particleCount: big ? 140 : 40,
      spread: big ? 80 : 55,
      startVelocity: big ? 38 : 28,
      origin: {
        x: (r.left + r.width / 2) / window.innerWidth,
        y: (r.top + r.height * (big ? 0.35 : 0.5)) / window.innerHeight,
      },
      colors: ['#8b5cf6', '#a78bfa', '#6366F1', '#f97316', '#fbbf24'],
      disableForReducedMotion: true,
      zIndex: 20000,
    });
  }

  function pulseCTA() {
    el.loginBtn.classList.remove('cta-pulse');
    void el.loginBtn.offsetWidth; // restart animation
    el.loginBtn.classList.add('cta-pulse');
  }

  // ── Actions ──────────────────────────────────────────────
  function toggle(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    state.touched = true;
    h.done = !h.done;

    const allDone = state.habits.length > 0 && state.habits.every(x => x.done);
    const hadBonus = state.bonus;
    if (allDone) state.bonus = true;
    if (!h.done) state.bonus = false; // un-ticking revokes the perfect-day bonus
    save();

    renderList(h.done ? id : null);
    const lvl = renderMeter();
    syncAuthCopy();
    syncSticky();

    if (navigator.vibrate) navigator.vibrate(h.done ? 18 : 8);

    if (h.done) {
      pop();
      const rowBtn = el.list.querySelector(`[data-id="${id}"]`);
      if (rowBtn) floatXP(rowBtn, '+' + XP_PER_HABIT + ' XP');
      if (doneCount() === 1) { burst(false); pulseCTA(); }
      if (state.bonus && !hadBonus) {
        chime(); burst(true);
        setTimeout(() => floatXP(el.xpFill.parentElement, '+' + XP_ALL_DONE + ' XP bonus!'), 250);
      }
      if (lvl.level > lastLevel) showBanner(`${lvl.icon} Level ${lvl.level} unlocked: ${lvl.title}!`);
    }
    lastLevel = lvl.level;
  }

  function addHabit(name, category) {
    name = name.trim().replace(/\s+/g, ' ').slice(0, 48);
    if (!name || state.habits.length >= MAX_HABITS) return;
    if (state.habits.some(h => h.name.toLowerCase() === name.toLowerCase())) return;
    state.touched = true;
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
  el.addForm.addEventListener('submit', e => {
    e.preventDefault();
    addHabit(el.addInput.value, 'productive');
    el.addInput.value = '';
  });
  el.stickyBtn.addEventListener('click', () => {
    el.authCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pulseCTA();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      authCardVisible = entries[0].isIntersecting;
      syncSticky();
    }, { threshold: 0.35 }).observe(el.authCard);
  }

  // app.js fires this whenever the auth screen is shown (e.g. after sign-out)
  window.addEventListener('habitly:auth-shown', () => { state = load(); lastLevel = levelFor(deriveXP(state)).level; renderList(); renderSuggestions(); renderMeter(false); applyMode(); });

  renderList();
  renderSuggestions();
  renderMeter(false);
  applyMode();
}
