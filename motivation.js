// motivation.js: what Habitly says about a person's record. Levels, XP history, milestones, achievements,
// perfect runs, time away, the day's recap.
//
// Everything here is worked out from the habits a person already has. Nothing is stored, nothing touches the page
// or Firebase. The screens that show it are drawn by moments.js. Unit tests: node --test tests/motivation.test.js
//
// Days are local calendar days as "YYYY-MM-DD" keys, as in habit-rules.js (which decides what was due and done).
import * as rules from './habit-rules.js?v=6';

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const list = habits => (Array.isArray(habits) ? habits.filter(h => h && typeof h === 'object') : []);
const doneDays = h => (Array.isArray(h.completedDates) ? h.completedDates.filter(isDay) : []);
const pad2 = n => String(n).padStart(2, '0');
// The local day a habit was created (a habit owes nothing before it existed). Unknown: it always existed.
function createdDay(h) {
  const d = h.createdAt ? new Date(h.createdAt) : null;
  return d && !isNaN(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
}
// The daily habits that were owed on `day`: due by their schedule, not paused or archived, and already created.
const owedOn = (habits, day) => habits.filter(h => rules.baseFreq(h) === 'daily' && createdDay(h) <= day && rules.isDueOn(h, day));

export const XP_PER_HABIT = 25;
export const XP_DAILY_BONUS = 100;

// ── Levels ─────────────────────────────────────────────────
export const LEVELS = [
  { level: 1,  minXP: 0,    title: 'Starter',     meaning: 'You have begun. The first tick is the hardest one.' },
  { level: 2,  minXP: 100,  title: 'Builder',     meaning: 'A few days of showing up.' },
  { level: 3,  minXP: 250,  title: 'Steady',      meaning: 'The routine is starting to hold.' },
  { level: 4,  minXP: 450,  title: 'Consistent',  meaning: 'Most days, you do what you said you would.' },
  { level: 5,  minXP: 700,  title: 'Dedicated',   meaning: 'Weeks of practice are behind you.' },
  { level: 6,  minXP: 1000, title: 'Committed',   meaning: 'You keep going after it stops being new.' },
  { level: 7,  minXP: 1400, title: 'Disciplined', meaning: 'Your habits run without a pep talk.' },
  { level: 8,  minXP: 1900, title: 'Expert',      meaning: 'You know what works for you, and you do it.' },
  { level: 9,  minXP: 2500, title: 'Master',      meaning: 'Rarely missed, quickly recovered.' },
  { level: 10, minXP: 3200, title: 'Grandmaster', meaning: 'The top of the ladder.' },
];

export function levelInfo(totalXP) {
  const xp = Number.isFinite(totalXP) ? Math.max(0, totalXP) : 0;
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].minXP) i++;
  const cur = LEVELS[i], isTop = i === LEVELS.length - 1;
  const next = LEVELS[i + 1] || { level: cur.level + 1, minXP: cur.minXP + 800, title: cur.title };
  const xpInCurrentLevel = xp - cur.minXP, xpRequiredForNext = next.minXP - cur.minXP;
  return {
    level: cur.level, title: cur.title, totalXP: xp, xpInCurrentLevel, xpRequiredForNext, levelTargetXP: next.minXP,
    progressPct: Math.min(100, Math.max(0, Math.round((xpInCurrentLevel / xpRequiredForNext) * 100))),
    nextTitle: next.title, toGo: Math.max(0, next.minXP - xp), isTop,
  };
}

// ── XP history ─────────────────────────────────────────────
// Worked out from completions, so it is the same on every device and needs no log: 25 for each habit completed
// that day, plus the 100 bonus on a day when every daily habit that was due got done. Newest day first.
export function xpHistory(habits, today, days = 14) {
  const all = list(habits), out = [];
  for (let n = 0; n < days; n++) {
    const day = rules.shiftDay(today, -n);
    const done = all.filter(h => doneDays(h).includes(day));
    if (!done.length) continue;
    const owed = owedOn(all, day);
    const bonus = owed.length > 0 && owed.every(h => doneDays(h).includes(day));
    out.push({ day, done: done.length, bonus, xp: done.length * XP_PER_HABIT + (bonus ? XP_DAILY_BONUS : 0), names: done.map(h => String(h.name || 'Habit')) });
  }
  return out;
}

// ── Milestones ─────────────────────────────────────────────
// Day streaks worth stopping for. One line each, said on the card.
export const MILESTONES = [7, 30, 100, 365];
export const MILESTONE_LINES = {
  7: 'A full week. The habit is taking root.',
  30: 'Thirty days. This is part of your routine now.',
  100: 'One hundred days. Very few people get this far.',
  365: 'A whole year, one day at a time.',
};
// The highest milestone a streak passed going from `before` to `after` (null when it passed none).
export function milestoneCrossed(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  let hit = null;
  for (const m of MILESTONES) if (before < m && after >= m) hit = m;
  return hit;
}
