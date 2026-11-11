// Guided tour: a spotlight on the REAL interface plus a card that says what it is for and what to tap.
//
//   const { completed, step } = await startTour();
//
// Design rules: it always points at an element that is actually on screen (steps whose target is missing are
// skipped), it adapts to mobile vs desktop navigation, it is fully keyboard operable, and it can be skipped.

const $ = (sel, root = document) => root.querySelector(sel);
const isVisible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const pick = (...sels) => { for (const s of sels) { const el = $(s); if (isVisible(el)) return el; } return null; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Each step: a target (function returning the element, or none for a centred message), a title and text.
// `title` / `text` may be functions so a step can describe the screen the person is actually looking at.
const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Habitly',
    text: 'This short tour shows where everything is and what it does. You can skip it at any time and replay it from the help button.',
    next: 'Show me around',
  },
  {
    id: 'progress',
    target: () => pick('.summary'),
    title: 'Your progress at a glance',
    text: 'The ring fills as you complete today\'s habits, and the strip shows your last 7 days. Below it: your streak (days in a row), your level (earned with XP) and a shield that covers one missed day. Tap the streak to make a shareable image.',
  },
  {
    id: 'add',
    target: () => pick('#new-habit-toggle'),
    title: 'Add a habit',
    text: 'Tap New habit, give it a name, then pick a category and how often it repeats. Start small: a habit you can finish in two minutes is the easiest one to keep.',
  },
  {
    id: 'list',
    target: () => pick('#habits .habit-item', '#starter-packs'),
    title: () => $('#habits .habit-item') ? 'Complete habits here' : 'Start with a ready-made set',
    text: () => $('#habits .habit-item')
      ? 'Tick the box when you have done a habit to earn 25 XP. Tap its name for notes and history, the clock starts a focus timer, and the bin removes it (you can undo).'
      : 'You have no habits yet. Pick one of these sets to add three habits in one tap, or use New habit above to write your own.',
  },
  {
    id: 'stats',
    target: () => pick('.bottomnav [data-page="stats"]', '.topnav-links [data-page="stats"]'),
    title: 'Stats',
    text: 'Open Stats to see your consistency heatmap, weekly charts and plain-language insights about what is working.',
  },
  {
    id: 'profile',
    target: () => pick('.bottomnav [data-page="profile"]', '.topnav-links [data-page="profile"]'),
    title: 'Profile and settings',
    text: 'Turn on daily reminders, switch to dark mode, export your data, or replay this tour. Your account details live here too.',
  },
  {
    id: 'ready',
    title: 'You are ready',
    text: () => $('#habits .habit-item')
      ? 'Complete a habit today to start your streak. Your progress saves automatically, even offline.'
      : 'Add your first habit to start a streak. Your progress saves automatically, even offline.',
    next: 'Get started',
  },
];

let active = null;

export async function startTour() {
  if (active) return active.promise;

  // The tour explains the Home screen, so make sure that is where we are.
  if (location.hash && location.hash !== '#home') {
    location.hash = '#home';
    await new Promise(r => setTimeout(r, 200));
  }

  // On sign-in the tour can start before the habit list has loaded. Wait (briefly) until Home shows either
  // habits or the empty state, otherwise the "your habits" stop would have nothing to point at.
  for (let waited = 0; waited < 5000 && !($('#habits .habit-item') || isVisible($('#empty-state'))); waited += 100) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (active) return active.promise;

  let resolveDone;
  const promise = new Promise(r => { resolveDone = r; });

  const previousFocus = document.activeElement;
  const root = document.createElement('div');
  root.id = 'coach';
  root.className = 'coach';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'coach-title');
  root.setAttribute('aria-describedby', 'coach-text');
  root.innerHTML = `
    <div class="coach-shield"></div>
    <div class="coach-spot"></div>
    <div class="coach-card" tabindex="-1">
      <span class="coach-arrow"></span>
      <div class="coach-progress" aria-hidden="true"></div>
      <p class="coach-step" id="coach-step"></p>
      <h2 class="coach-title" id="coach-title"></h2>
      <p class="coach-text" id="coach-text"></p>
      <div class="coach-actions">
        <button type="button" class="btn-ghost" id="coach-skip">Skip tour</button>
        <span class="coach-nav">
          <button type="button" class="btn-secondary" id="coach-back">Back</button>
          <button type="button" class="btn-primary" id="coach-next">Next</button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(root);
  const spot = $('.coach-spot', root), card = $('.coach-card', root), arrow = $('.coach-arrow', root);
  const progress = $('.coach-progress', root);
  const btnNext = $('#coach-next', root), btnBack = $('#coach-back', root), btnSkip = $('#coach-skip', root);
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';   // keep the page still behind the spotlight

  let index = 0, dir = 1, raf = 0, settleTimer = 0;
  const live = () => STEPS.filter(s => !s.target || s.target());           // steps that can be shown right now
  const val = v => (typeof v === 'function' ? v() : v);

  function place(target) {
    const vw = innerWidth, vh = innerHeight, gap = 14, margin = 12;
    const cardW = Math.min(360, vw - margin * 2);
    card.style.width = cardW + 'px';

    if (!target) {                                              // centred message: dim everything, card in the middle
      spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;border-radius:0;`;
      spot.classList.add('is-empty');
      arrow.style.display = 'none';
      card.style.left = Math.round((vw - cardW) / 2) + 'px';
      card.style.top = Math.max(margin, Math.round((vh - card.offsetHeight) / 2)) + 'px';
      return;
    }

    spot.classList.remove('is-empty');
    const r = target.getBoundingClientRect();
    // Targets inside the fixed bars get a tight cut-out so the page scrolling behind them isn't revealed
    const pad = target.closest('.bottomnav, .topnav') ? 2 : 8;
    const s = { l: r.left - pad, t: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    spot.style.cssText = `left:${s.l}px;top:${s.t}px;width:${s.w}px;height:${s.h}px;`;

    const ch = card.offsetHeight;
    const below = vh - (s.t + s.h) - margin, above = s.t - margin;
    let top, side;
    if (below >= ch + gap) { top = s.t + s.h + gap; side = 'top'; }
    else if (above >= ch + gap) { top = s.t - gap - ch; side = 'bottom'; }
    else { top = Math.max(margin, vh - ch - margin); side = null; }  // target fills the screen: dock the card at the bottom
    const left = Math.min(Math.max(s.l + s.w / 2 - cardW / 2, margin), vw - cardW - margin);
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';

    if (side) {
      arrow.style.display = '';
      arrow.dataset.side = side;
      const cx = s.l + s.w / 2 - left;
      arrow.style.left = Math.min(Math.max(cx - 8, 18), cardW - 34) + 'px';
    } else arrow.style.display = 'none';
  }

  function render() {
    const steps = live();
    let step = STEPS[index];
    if (step.target && !step.target()) {                         // target disappeared: use the nearest step that can be shown
      const idx = s => STEPS.indexOf(s);
      step = dir > 0
        ? (steps.find(s => idx(s) >= index) || steps[steps.length - 1])
        : ([...steps].reverse().find(s => idx(s) <= index) || steps[0]);
    }
    index = STEPS.indexOf(step);
    const pos = steps.indexOf(step);

    $('#coach-step', root).textContent = `${pos + 1} of ${steps.length}`;
    $('#coach-title', root).textContent = val(step.title);
    $('#coach-text', root).textContent = val(step.text);
    progress.innerHTML = steps.map((s, i) => `<span class="${i <= pos ? 'on' : ''}"></span>`).join('');
    btnBack.hidden = pos === 0;
    btnNext.textContent = step.next || 'Next';
    const target = step.target ? step.target() : null;
    btnNext.dataset.last = pos === steps.length - 1 ? '1' : '';

    if (target) {
      const r = target.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 70) target.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    place(target);
    btnNext.focus({ preventScroll: true });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(reflow, 450);                      // page entry animations finish; re-measure once
  }

  function reflow() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const step = STEPS[index];
      place(step.target ? step.target() : null);
    });
  }

  function go(delta) {
    dir = delta;
    const steps = live();
    const pos = steps.indexOf(STEPS[index]) + delta;
    if (pos < 0) return;
    if (pos >= steps.length) return close(true);
    index = STEPS.indexOf(steps[pos]);
    render();
  }

  function close(completed) {
    const step = STEPS[index].id;
    cancelAnimationFrame(raf); clearTimeout(settleTimer);
    removeEventListener('resize', reflow);
    removeEventListener('scroll', reflow, true);
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = prevOverflow;
    root.remove();
    active = null;
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    resolveDone({ completed, step });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {                                 // keep focus inside the card
      const f = [...root.querySelectorAll('button')].filter(b => !b.hidden);
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }

  btnNext.addEventListener('click', () => go(1));
  btnBack.addEventListener('click', () => go(-1));
  btnSkip.addEventListener('click', () => close(false));
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', reflow);
  addEventListener('scroll', reflow, true);

  if (reduced()) root.classList.add('no-motion');
  render();
  active = { promise };
  return promise;
}
