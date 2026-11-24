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
