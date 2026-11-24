// home.js: the logic behind the Home screen that does not need the page or Firebase, so it can be unit-tested
// (node --test tests/home.test.js).

// ── Time of day ───────────────────────────────────────────
// A habit may carry an optional timeOfDay. Anything else, including no value, means "any time".
export const SLOTS = ['morning', 'afternoon', 'evening'];
export const SLOT_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };

export function timeSlot(habit) {
  const v = habit && habit.timeOfDay;
  return SLOTS.includes(v) ? v : 'any';
}

// Morning until noon, afternoon until 5pm, evening after.
export function currentSlot(hour) {
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

// The order groups are shown in: the part of the day it is now comes first (that is what you are about to do),
// then the rest in day order, then habits with no set time.
export function slotOrder(now) {
  const i = Math.max(0, SLOTS.indexOf(now));
  return [...SLOTS.slice(i), ...SLOTS.slice(0, i), 'any'];
}

// ── Days ──────────────────────────────────────────────────
// Day keys are local calendar days, "YYYY-MM-DD". Arithmetic on them is done as plain calendar dates (in UTC,
// with no time of day), so daylight-saving changes can never skip or repeat a day.
const pad2 = n => String(n).padStart(2, '0');
const toNum = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const toKey = num => { const d = new Date(num * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };

// The last n days ending on `today`, oldest first.
export function dayList(n, today) {
  const end = toNum(today);
  return Array.from({ length: n }, (_, i) => toKey(end - (n - 1 - i)));
}

// The local day a timestamp falls on (habits store createdAt as an ISO string).
export function localDay(iso) {
  const d = new Date(iso);
  return isNaN(d) ? null : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// A day key moved by a number of days.
export function shiftDay(day, by) { return toKey(toNum(day) + by); }

// The daily habits that existed on `day`, in the order given, each with whether it was done that day.
// Weekly and monthly habits, and removed habits, are left out. A habit with no creation date counts for every day.
export function habitsOnDay(habits, day) {
  return (habits || [])
    .filter(h => !h.deletedAt && (!h.frequency || h.frequency === 'daily'))
    .filter(h => { const born = h.createdAt ? localDay(h.createdAt) : null; return !born || born <= day; })
    .map(habit => ({ habit, done: (habit.completedDates || []).includes(day) }));
}

// ── Filtering ─────────────────────────────────────────────
// Lower-case, with accents removed, so "cafe" finds "Café".
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Does a habit match the filter? `category` may be a category key or 'all'; `text` is matched against the
// habit's name and its category.
export function matchesFilter(habit, { category, text } = {}) {
  if (category && category !== 'all' && habit.category !== category) return false;
  const q = fold(text);
  return !q || fold(habit.name).includes(q) || fold(habit.category).includes(q);
}

// ── Reordering ────────────────────────────────────────────
// A copy of `ids` with the item at `from` moved to `to` (positions outside the list clamp to its ends).
export function moveItem(ids, from, to) {
  const out = [...ids];
  if (from < 0 || from >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

// What to save so that the habit `id` ends up at position `toIndex` of `items` (which are in display order,
// each { id, order }). Normally that is one write: an order between its new neighbours. When the neighbours
// leave no room (equal or missing orders), the whole list is renumbered with gaps and only changed rows are returned.
export function planReorder(items, id, toIndex) {
  const from = items.findIndex(x => x.id === id);
  if (from < 0) return [];
  const ids = moveItem(items.map(x => x.id), from, toIndex);
  const at = ids.indexOf(id);
  if (at === from) return [];
  const orderOf = Object.fromEntries(items.map(x => [x.id, x.order]));
  const prev = at > 0 ? orderOf[ids[at - 1]] : undefined;
  const next = at < ids.length - 1 ? orderOf[ids[at + 1]] : undefined;
  const ok = v => typeof v === 'number' && Number.isFinite(v);
  let order;
  if (prev === undefined && ok(next)) order = next - 1;
  else if (next === undefined && ok(prev)) order = prev + 1;
  else if (ok(prev) && ok(next) && next - prev > 1e-6) order = (prev + next) / 2;
  if (order !== undefined) return [{ id, order }];
  // No room: renumber everything in its new order, 1000 apart.
  return ids.map((x, i) => ({ id: x, order: (i + 1) * 1000 })).filter(w => orderOf[w.id] !== w.order);
}

// ── Swiping a row ─────────────────────────────────────────
// A touch starts out undecided. Once it has moved 12px it is either a sideways swipe (ours) or a scroll (the
// page's). Diagonal movement counts as a scroll, so scrolling the list can never complete a habit by accident.
export function swipeIntent(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < 12 && ay < 12) return 'pending';
  return ax > ay * 1.5 ? 'swipe' : 'scroll';
}

// What a finished swipe means: more than 72px to the right or left, otherwise nothing.
export function swipeResult(dx) {
  return dx > 72 ? 'right' : dx < -72 ? 'left' : null;
}

// attachSwipe(root, { enabled, onRight(id, row), onLeft(id, row) }) listens for swipes on .habit-item rows inside
// `root`. While a swipe is in progress the row gets --swipe (px) and the class is-swiping so CSS can follow the
// finger. `enabled()` lets the caller switch swiping off (desktop, read-only views).
export function attachSwipe(root, { enabled = () => true, onRight, onLeft }) {
  let s = null;                                       // the touch in progress
  const end = cancelled => {
    if (!s) return;
    const { row, dx, mode } = s;
    s = null;
    row.classList.remove('is-swiping', 'swipe-right', 'swipe-left');
    row.style.removeProperty('--swipe');
    // Once the finger has really moved (a swipe or a scroll, not a tap), any click that follows the lift is not
    // a tap on the row: swallow it so a drag never opens the details dialog or ticks the box.
    if (mode !== 'pending') {
      const stop = e => { e.stopPropagation(); e.preventDefault(); };
      root.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => root.removeEventListener('click', stop, true), 350);
    }
    if (cancelled || mode !== 'swipe') return;
    const result = swipeResult(dx);
    if (!result) return;
    (result === 'right' ? onRight : onLeft)?.(row.dataset.id, row);
  };
  root.addEventListener('pointerdown', e => {
    if (!enabled() || e.pointerType === 'mouse' && e.button !== 0) return;
    const row = e.target instanceof Element ? e.target.closest('.habit-item') : null;
    if (!row || !row.dataset.id || e.target.closest('.habit-actions, .row-grip')) return;
    s = { row, x: e.clientX, y: e.clientY, dx: 0, mode: 'pending' };
  });
  addEventListener('pointermove', e => {
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (s.mode === 'pending') s.mode = swipeIntent(dx, dy);
    if (s.mode === 'scroll') { end(true); return; }
    if (s.mode !== 'swipe') return;
    s.dx = dx;
    s.row.classList.add('is-swiping');
    s.row.classList.toggle('swipe-right', dx > 0);
    s.row.classList.toggle('swipe-left', dx < 0);
    s.row.style.setProperty('--swipe', `${Math.max(-120, Math.min(120, dx))}px`);
  });
  addEventListener('pointerup', () => end(false));
  addEventListener('pointercancel', () => end(true));
}

// attachReorder(root, { enabled, onDrop(id, groupIds, toIndex) }) lets rows be dragged by their .row-grip handle,
// or moved with the arrow keys while the grip has focus. A row only moves among the rows of its own group
// (same list and same data-group), because the app sorts groups itself: done habits sink, times of day stay together.
// `groupIds` is the group's order before the move and `toIndex` the row's new position in it.
export function attachReorder(root, { enabled = () => true, onDrop }) {
  const groupOf = row => [...row.parentNode.querySelectorAll(':scope > .habit-item')].filter(r => r.dataset.group === row.dataset.group);
  let d = null;                                       // the drag in progress
  let raf = 0;

  const finish = commit => {
    if (!d) return;
    const { row, before } = d;
    d = null;
    cancelAnimationFrame(raf);
    row.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-reordering');
    const toIndex = groupOf(row).indexOf(row);
    if (commit && toIndex !== before.indexOf(row.dataset.id)) onDrop?.(row.dataset.id, before, toIndex);
  };

  root.addEventListener('pointerdown', e => {
    const grip = e.target instanceof Element ? e.target.closest('.row-grip') : null;
    if (!grip || !enabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = grip.closest('.habit-item');
    if (!row) return;
    e.preventDefault();                               // no text selection while dragging
    d = { row, before: groupOf(row).map(r => r.dataset.id), y: e.clientY };
    row.classList.add('is-dragging');
    document.documentElement.classList.add('is-reordering');
  });
  addEventListener('pointermove', e => {
    if (!d) return;
    d.y = e.clientY;
    // Step the row past each neighbour of its group whose middle the pointer has crossed
    for (const other of groupOf(d.row)) {
      if (other === d.row) continue;
      const r = other.getBoundingClientRect(), mid = r.top + r.height / 2;
      const above = other.compareDocumentPosition(d.row) & Node.DOCUMENT_POSITION_FOLLOWING;   // other comes before the dragged row
      if (above && e.clientY < mid) { other.parentNode.insertBefore(d.row, other); break; }
      if (!above && e.clientY > mid) { other.parentNode.insertBefore(d.row, other.nextSibling); break; }
    }
    // Near the top or bottom edge, scroll the page so a long list can be crossed
    cancelAnimationFrame(raf);
    const edge = 64, step = () => {
      if (!d) return;
      const dy = d.y < edge ? -8 : d.y > innerHeight - edge ? 8 : 0;
      if (dy) { scrollBy(0, dy); raf = requestAnimationFrame(step); }
    };
    raf = requestAnimationFrame(step);
  });
  addEventListener('pointerup', () => finish(true));
  addEventListener('pointercancel', () => finish(false));

  // Keyboard: with the grip focused, the arrow keys move the row one place within its group.
  root.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const grip = e.target instanceof Element ? e.target.closest('.row-grip') : null;
    if (!grip || !enabled()) return;
    const row = grip.closest('.habit-item');
    const group = groupOf(row), i = group.indexOf(row), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    e.preventDefault();
    if (j < 0 || j >= group.length) return;
    onDrop?.(row.dataset.id, group.map(r => r.dataset.id), j);
  });
}

// One entry per day for the last seven days: 'on' (done), 'off' (missed) or 'na' (the habit did not exist yet).
export function weekDots(habit, today) {
  const done = new Set(habit.completedDates || []);
  const born = habit.createdAt ? localDay(habit.createdAt) : null;
  return dayList(7, today).map(day => ({
    day,
    today: day === today,
    state: done.has(day) ? 'on' : (born && day < born ? 'na' : 'off'),
  }));
}
