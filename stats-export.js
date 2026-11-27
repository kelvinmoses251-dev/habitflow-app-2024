// stats-export.js: what leaves the app as a file. The CSV of every check-in, and the figures the PDF report is
// drawn from (app.js draws the PDF itself with jsPDF, loaded only when asked for).
//
// Pure: worked out from the list of habits and a day. Unit tests: node --test tests/stats-export.test.js
import * as rules from './habit-rules.js?v=7';
import { periodRange, periodSummary, barSeries, records, habitRates, longDay } from './stats.js?v=1';

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const real = habits => (Array.isArray(habits) ? habits.filter(h => h && typeof h === 'object') : []);
const nameOf = h => String(h.name == null || h.name === '' ? 'Habit' : h.name);
const DASH = '–';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A schedule in words: "Every day", "Mon, Wed, Fri", "3 times a week", "Once a month".
export function scheduleWords(s) {
  if (s.type === 'days') return [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAYS[d]).join(', ');
  if (s.type === 'times') return s.times === 1 ? 'Once a week' : `${s.times} times a week`;
  return s.type === 'monthly' ? 'Once a month' : 'Every day';
}

// ── CSV ────────────────────────────────────────────────────
// One cell, safe for a spreadsheet: a value that begins with = + - @ or a tab would be run as a formula, so it
// gets a leading apostrophe; commas, quotes and line breaks are quoted the RFC 4180 way.
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// Every check-in as a row, oldest first. catLabel(key) names a category. Starts with a byte order mark and uses
// CRLF line ends, which is what Excel expects of a UTF-8 CSV.
export function toCsv(habits, catLabel = k => k) {
  const rows = [];
  for (const h of real(habits)) {
    const done = Array.isArray(h.completedDates) ? [...new Set(h.completedDates.filter(isDay))] : [];
    const target = rules.targetOf(h);
    for (const day of done) {
      const count = target ? rules.progressOn(h, day) || target.amount : '';
      const mood = h.moods && typeof h.moods === 'object' && Number.isInteger(h.moods[day]) && h.moods[day] >= 1 && h.moods[day] <= 5 ? h.moods[day] : '';
      rows.push([day, nameOf(h), catLabel(h.category), scheduleWords(rules.scheduleOn(h, day)), target ? `${count}${target.unit ? ' ' + target.unit : ''}` : '', h.backfilled && h.backfilled[day] === true ? 'yes' : '', mood]);
    }
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1].localeCompare(b[1])));
  return '﻿' + [['Date', 'Habit', 'Category', 'Schedule', 'Count', 'Filled in late', 'Mood (1 to 5)'], ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ── The report ─────────────────────────────────────────────
// Everything the PDF says, as plain values: four figures for the last thirty days, twelve months of check-ins,
// a row per habit, the personal records and the newest notes. opts: { frozen, name, catLabel }.
const UNIT = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'] };
const span = (n, kind) => `${n} ${UNIT[kind][n === 1 ? 0 : 1]}`;
export const NOTES_IN_REPORT = 12;
export function reportModel(habits, today, opts = {}) {
  const list = real(habits), frozen = Array.isArray(opts.frozen) ? opts.frozen.filter(isDay) : [], catLabel = typeof opts.catLabel === 'function' ? opts.catLabel : k => k;
  const month = periodRange('month', today, list), sum = periodSummary(list, month), recs = records(list, today, frozen);
  const rates = new Map(habitRates(list, month).map(r => [r.id, r]));
  const streakOf = (h, fn) => { try { return fn(h, today, frozen); } catch (_) { return 0; } };
  const best = recs.find(r => r.id === 'streak');
  const rows = [...list].sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0)).map(h => {
    const kind = rules.baseFreq(h), r = rates.get(h.id);
    return [nameOf(h) + (h.archivedAt ? ' (archived)' : ''), catLabel(h.category), scheduleWords(rules.scheduleOn(h, today)),
      h.archivedAt ? DASH : span(streakOf(h, rules.habitStreak), kind), span(streakOf(h, rules.habitLongestStreak), kind),
      r && r.rate !== null ? r.rate + '%' : DASH, String(Array.isArray(h.completedDates) ? new Set(h.completedDates.filter(isDay)).size : 0)];
  });
  const notes = [];
  for (const h of list) for (const j of (Array.isArray(h.journals) ? h.journals : [])) {
    const at = j && typeof j.text === 'string' && j.text.trim() ? new Date(j.date) : null;
    if (at && !isNaN(at)) notes.push({ at: at.getTime(), when: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`, habit: nameOf(h), text: j.text.trim() });
  }
  notes.sort((a, b) => b.at - a.at);
  return {
    title: 'Habit report', name: typeof opts.name === 'string' ? opts.name : '', made: `${longDay(today)} ${today.slice(0, 4)}`,
    figures: [
      { label: 'Done of what was due, last 30 days', value: sum.rate === null ? DASH : sum.rate + '%' },
      { label: 'Check-ins, last 30 days', value: String(sum.checkins) },
      { label: 'Perfect days, last 30 days', value: String(sum.perfect) },
      { label: 'Longest streak', value: best ? `${best.value} days` : DASH },
    ],
    months: barSeries(list, periodRange('year', today, list)).map(b => ({ label: b.label, long: b.long, done: b.done, rate: b.rate })),
    rows, records: recs.map(r => [r.label, `${r.value}${r.unit ? ' ' + r.unit : ''}`, r.detail]),
    notes: notes.slice(0, NOTES_IN_REPORT).map(n => ({ when: n.when, habit: n.habit, text: n.text })),
  };
}
