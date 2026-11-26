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
const pad2 = n => String(n).padStart(2, '0');
// These sums ask "was this habit done on that day?" thousands of times (every day of a long record, for every
// habit), and they run on every tap. So each habit's done days are put in a Set once, and its creation day is
// worked out once. The app makes fresh habit objects whenever the data changes, so nothing here goes stale.
const doneCache = new WeakMap(), createdCache = new WeakMap();
function doneSet(h) {
  let set = doneCache.get(h);
  if (!set) { set = new Set(Array.isArray(h.completedDates) ? h.completedDates.filter(isDay) : []); doneCache.set(h, set); }
  return set;
}
const doneDays = h => [...doneSet(h)];
const isDone = (h, day) => doneSet(h).has(day);
// The local day a habit was created (a habit owes nothing before it existed). Unknown: it always existed.
function createdDay(h) {
  if (createdCache.has(h)) return createdCache.get(h);
  const d = h.createdAt ? new Date(h.createdAt) : null;
  const day = d && !isNaN(d) ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
  createdCache.set(h, day);
  return day;
}
// Was this a day-by-day habit on `day`? Judged by the schedule in force that day, never by what the habit is now:
// a habit that was weekly last month and is daily today owed nothing daily last month. (History is never re-judged.)
const isDailyOn = (h, day) => { const t = rules.scheduleOn(h, day).type; return t === 'daily' || t === 'days'; };
// The daily habits that were owed on `day`: due by their schedule, not paused or archived, and already created.
const owedOn = (habits, day) => habits.filter(h => createdDay(h) <= day && isDailyOn(h, day) && rules.isDueOn(h, day));

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
    const done = all.filter(h => isDone(h, day));
    if (!done.length) continue;
    const owed = owedOn(all, day);
    const bonus = owed.length > 0 && owed.every(h => isDone(h, day));
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

// ── Achievements ───────────────────────────────────────────
// Each is measured from the record itself, so the gallery is the same on every device and cannot be "lost".
// A perfect day: at least one daily habit was owed and every one of them was done.
export function perfectDays(habits) {
  const all = list(habits), days = new Set();
  all.forEach(h => doneSet(h).forEach(d => days.add(d)));
  let n = 0;
  days.forEach(day => { const owed = owedOn(all, day); if (owed.length && owed.every(h => isDone(h, day))) n++; });
  return n;
}
const measures = {
  checkins: ({ habits }) => habits.reduce((sum, h) => sum + doneSet(h).size, 0),
  streak: ({ habits, today, frozen }) => habits.filter(h => rules.baseFreq(h) === 'daily').reduce((best, h) => Math.max(best, rules.habitLongestStreak(h, today, frozen)), 0),
  perfect: ({ habits }) => perfectDays(habits),
  kept: ({ habits, today }) => habits.filter(h => !h.archivedAt && !rules.hasEndedOn(h, today)).length,
  level: ({ xp }) => levelInfo(xp).level,
};
const A = (id, name, icon, measure, goal, how) => ({ id, name, icon, measure, goal, how });
export const ACHIEVEMENTS = [
  A('checkins-1', 'First step', 'check', 'checkins', 1, 'Complete a habit'),
  A('checkins-10', 'Getting going', 'check', 'checkins', 10, 'Complete habits 10 times'),
  A('checkins-50', 'Fifty up', 'check-circle', 'checkins', 50, 'Complete habits 50 times'),
  A('checkins-100', 'Century', 'check-circle', 'checkins', 100, 'Complete habits 100 times'),
  A('checkins-500', 'Five hundred', 'activity', 'checkins', 500, 'Complete habits 500 times'),
  A('checkins-1000', 'One thousand', 'activity', 'checkins', 1000, 'Complete habits 1,000 times'),
  A('streak-3', 'Three in a row', 'flame', 'streak', 3, 'Keep one habit going 3 days in a row'),
  A('streak-7', 'One week', 'flame', 'streak', 7, 'Keep one habit going 7 days in a row'),
  A('streak-30', 'One month', 'calendar', 'streak', 30, 'Keep one habit going 30 days in a row'),
  A('streak-100', 'Hundred days', 'trend-up', 'streak', 100, 'Keep one habit going 100 days in a row'),
  A('streak-365', 'One year', 'award', 'streak', 365, 'Keep one habit going 365 days in a row'),
  A('perfect-1', 'Clean sweep', 'star', 'perfect', 1, 'Finish every daily habit in one day'),
  A('perfect-7', 'Seven clean days', 'star', 'perfect', 7, 'Finish every daily habit on 7 days'),
  A('perfect-30', 'Thirty clean days', 'sun', 'perfect', 30, 'Finish every daily habit on 30 days'),
  A('kept-3', 'Three on the go', 'list', 'kept', 3, 'Have 3 habits at once'),
  A('kept-5', 'Full plate', 'target', 'kept', 5, 'Have 5 habits at once'),
  A('level-5', 'Halfway up', 'bar-chart', 'level', 5, 'Reach level 5'),
  A('level-10', 'Top of the ladder', 'award', 'level', 10, 'Reach level 10'),
];
// Every achievement with where the person stands: { id, name, icon, how, goal, have (never above goal), earned }
export function achievements(habits, { today, xp = 0, frozen = [] } = {}) {
  const ctx = { habits: list(habits), today, xp, frozen: Array.isArray(frozen) ? frozen : [] }, got = {};
  return ACHIEVEMENTS.map(a => {
    if (!(a.measure in got)) { let v = 0; try { v = Number(measures[a.measure](ctx)) || 0; } catch (_) { v = 0; } got[a.measure] = Math.max(0, Math.floor(v)); }
    const have = Math.min(a.goal, got[a.measure]);
    return { id: a.id, name: a.name, icon: a.icon, how: a.how, goal: a.goal, have, earned: have >= a.goal };
  });
}

// ── Time away ──────────────────────────────────────────────
// The last day anything was completed (on or before today), or '' when nothing ever was.
export function lastDoneDay(habits, today) {
  let last = '';
  list(habits).forEach(h => doneDays(h).forEach(d => { if (d <= today && d > last) last = d; }));
  return last;
}
// How many whole days since then had something owed and left undone (today is not counted: it is not over).
// This is what "away" means: someone whose only habit is weekly, or who rests on those days, never left.
export function daysMissed(habits, today) {
  const all = list(habits), last = lastDoneDay(all, today);
  if (!last) return 0;
  let n = 0;
  for (let day = rules.shiftDay(last, 1), i = 0; day < today && i < 400; day = rules.shiftDay(day, 1), i++) if (owedOn(all, day).length) n++;
  return n;
}
// Whole days since then: 0 for today (or never), 1 for yesterday, and so on.
export function daysAway(habits, today) {
  const last = lastDoneDay(habits, today);
  return last ? rules.dayNumber(today) - rules.dayNumber(last) : 0;
}

// ── Mood notes ─────────────────────────────────────────────
// An optional one-tap note of how a completion felt: habit.moods = { 'YYYY-MM-DD': 1..5 }. A note only counts on
// a day the habit is still marked done.
export const MOODS = ['Awful', 'Hard', 'Okay', 'Good', 'Great'];        // 1 … 5
export function moodOf(habit, day) {
  const v = habit && habit.moods && typeof habit.moods === 'object' ? habit.moods[day] : null;
  return Number.isInteger(v) && v >= 1 && v <= 5 && isDone(habit, day) ? v : null;
}
// What the notes say, once a habit has at least three: the one that feels best (average 4 or more) and one that
// has felt hard (average 2 or less). Names are returned as typed: the caller escapes them.
export function moodInsights(habits) {
  const scored = list(habits).map(h => {
    const notes = doneDays(h).map(d => moodOf(h, d)).filter(v => v !== null);
    return { name: String(h.name || 'Habit'), count: notes.length, avg: notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : 0 };
  }).filter(x => x.count >= 3);
  const out = [];
  const best = [...scored].sort((a, b) => b.avg - a.avg || b.count - a.count)[0];
  if (best && best.avg >= 4) out.push({ kind: 'best', name: best.name, avg: Math.round(best.avg * 10) / 10, count: best.count });
  const hard = [...scored].sort((a, b) => a.avg - b.avg || b.count - a.count)[0];
  if (hard && hard.avg <= 2 && !(out.length && hard === best)) out.push({ kind: 'hard', name: hard.name, avg: Math.round(hard.avg * 10) / 10, count: hard.count });
  return out;
}

// ── The day's recap ────────────────────────────────────────
// What happened today, for the end-of-day sheet: what got done, what is still open, the XP it earned, the streak,
// how it felt, and how many daily habits are due tomorrow.
export function dayRecap(habits, today, { frozen = [] } = {}) {
  const all = list(habits), frozenDays = Array.isArray(frozen) ? frozen : [];
  const done = all.filter(h => !h.archivedAt && isDone(h, today));
  const open = all.filter(h => rules.isOpenOn(h, today));
  const owed = owedOn(all, today);
  const bonus = owed.length > 0 && owed.every(h => isDone(h, today));
  const notes = done.map(h => moodOf(h, today)).filter(v => v !== null);
  const tomorrow = rules.shiftDay(today, 1);
  return {
    day: today, done, open, total: done.length + open.length, bonus,
    xp: done.length * XP_PER_HABIT + (bonus ? XP_DAILY_BONUS : 0),
    streak: all.filter(h => rules.baseFreq(h) === 'daily' && !h.archivedAt && !rules.hasEndedOn(h, today)).reduce((best, h) => Math.max(best, rules.habitStreak(h, today, frozenDays)), 0),
    moodAvg: notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : null,
    tomorrowDue: all.filter(h => isDailyOn(h, tomorrow) && rules.isDueOn(h, tomorrow)).length,
  };
}

// ── Perfect weeks and months ───────────────────────────────
// Each day is 'perfect' (something was owed and all of it was done), 'missed' (something owed was not done) or
// 'none' (nothing was owed: a rest day, everything paused, before the first habit). Today only counts once it is
// perfect; until then the stretch is judged up to yesterday, so the recognition does not flicker off each morning.
// A perfect week: the last 7 days have no missed day and at least 5 perfect ones. A perfect month: the last 30
// have no missed day and at least 20 perfect ones. Days before the record began (before the first habit existed)
// are not part of any stretch, so a week needs seven real days. `days` is how long the unbroken stretch is and
// `start` its first day: the day after the last miss, or the day the record began. It stays the same as the
// stretch grows, which is how the app knows it has already spoken about it. Past STRETCH_CAP days the walk stops
// (`capped`); by then the stretch has long been a perfect month and its start no longer matters.
const STRETCH_CAP = 120;
export function perfectStretch(habits, today) {
  const all = list(habits);
  const stateOf = day => { const owed = owedOn(all, day); return !owed.length ? 'none' : owed.every(h => isDone(h, day)) ? 'perfect' : 'missed'; };
  let first = today;                                            // the day the record began
  all.forEach(h => { const began = createdDay(h) || doneDays(h).sort()[0] || ''; if (began < first) first = began; });
  const end = stateOf(today) === 'perfect' ? today : rules.shiftDay(today, -1);
  const states = [];
  let capped = false;
  for (let n = 0; ; n++) {
    if (n >= STRETCH_CAP) { capped = true; break; }
    const day = rules.shiftDay(end, -n);
    if (day < first) break;
    const s = stateOf(day);
    if (s === 'missed') break;
    states.push(s);
  }
  const perfectIn = n => states.slice(0, n).filter(s => s === 'perfect').length;
  const week = states.length >= 7 && perfectIn(7) >= 5, month = states.length >= 30 && perfectIn(30) >= 20;
  return { week, month, days: states.length, end, start: states.length ? rules.shiftDay(end, -(states.length - 1)) : end, capped };
}
