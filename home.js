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
