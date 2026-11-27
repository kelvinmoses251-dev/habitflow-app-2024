# Batch 6: Stats and insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the Statistics page into a dashboard that answers "how am I doing, compared with before, and what should I change", without any third-party chart library.

**Architecture:** All figures are worked out by pure modules (`stats.js`, `stats-review.js`, `stats-export.js`) from the habits list, a day key and the shield days; `stats-page.js` only draws (inline SVG, no canvas, no library). `app.js` wires events and storage. History is never re-judged: a day is owed by the schedule in force that day (`habit-history.js` `owedOn`).

**Tech stack:** Plain ES modules, inline SVG, existing CSS tokens. jsPDF stays (loaded on demand) for the PDF only. Chart.js is removed.

**Spec:** `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md` (Batch 6, items 51-60)

## Global Constraints

- No emoji, gradients, glow, blur, text-shadow or infinite animation. Every border-radius is a token. 44px touch targets on phones. Every `.modal` has `.dialog > .sheet-handle` and a `[data-dismiss]` button.
- Home is not touched: nothing new appears there, no unprompted card or prompt is added by this batch.
- Nothing a person typed (habit names, notes) reaches analytics. `track()` events carry counts and kinds only.
- Data model changes are additive. New stored information is named in `privacy.html` in the same change.
- No build step, no npm dependency. New modules import `./habit-rules.js?v=7` and `./habit-history.js?v=1` with exactly those specifiers (shared caches).
- Each change: failing test first, full suite green, a row in `IMPROVEMENTS.md` (from R56), one commit in its own command.
- Text equivalents: every chart also says its numbers in words; colour is never the only signal.

## Definitions (used by every task)

- **Check-in:** one habit done on one day (any schedule).
- **Owed:** a day-by-day habit that was due that day (`owedOn`). Weekly and monthly habits are never owed on a day; they count as check-ins only.
- **Rate:** done-and-owed / owed, as a whole percent; `null` when nothing was owed.
- **Perfect day:** owed > 0 and all of it done.
- **Periods** (`periodRange(period, today, habits)`): `week` = today and the 6 days before (previous: the 7 days before that); `month` = 30 days (previous: the 30 before); `year` = the first of the month eleven months back, to today (previous: the twelve calendar months before that); `all` = from the earliest created or done day, to today (no previous). Chosen period is kept per device in `habitly_stats_period`.

## Review Focus

1. An account with years of history and thirty habits: the Stats page must draw in well under half a second on every period, and switching period must not recompute what did not change.
2. A habit whose schedule changed (daily to weekly, rest days added), was paused, archived, or created mid-period: past days keep the judgement of their day; a habit never counts as owed before it existed.
3. Habit names with HTML, commas, quotes, newlines or a leading `=`: shown as text everywhere, and safe in the CSV (quoted, formula-guarded).
4. An empty account, a one-day-old account, and an account with only weekly habits: every card says something true and useful, never "NaN%", "0 of 0" or a comparison with a period that has no data.
5. Keyboard and screen reader: the period switcher, each chart, the heatmap, the review and the story are all operable without a pointer, and say their figures in words.

---

## Tasks (build order)

### Task 1 (item 51): Dashboard with a period switcher
**Files:** create `stats.js`, `stats-page.js`, `tests/stats.test.js`, `tests/scenarios/43-stats-dashboard.js`; modify `index.html`, `app.js`, `style.css`, older Stats tests.
**Produces:** `PERIODS`, `firstDay(habits, today)`, `periodRange(period, today, habits)` -> `{period, from, to, days, prev:{from,to,days}|null, label, prevLabel, span}`, `dayTotals(habits, day)` -> `{day, owed, doneOwed, done}`, `periodSummary(habits, range)` -> `{owed, doneOwed, rate, checkins, perfect, active, days}`, `habitRates(habits, range)` -> `[{id, name, owed, done, rate, unit}]`.
**Page:** `#stats-period` radio group (Week, Month, Year, All); range line `#stats-range`; four figures `#stat-rate`, `#stat-done`, `#stat-perfect`, `#stat-streak`; "By habit" list follows the period. The old Weekly report card goes (its figures are the headline now).
**Tests:** range arithmetic incl. year boundaries and leap day; a habit created mid-period is not owed earlier; weekly-only account has rate `null` shown as a dash with a sentence; switching period redraws and is remembered after reload; arrow keys move the choice.

### Task 2 (item 52): In-house SVG charts, Chart.js removed
**Produces:** `barSeries(habits, range)` -> `[{from, to, label, long, owed, doneOwed, done, rate}]` (week 7 days; month 30 days; year 12 months; all: months up to 24, else years); `stats-page.js` `renderBars(el, series, range)` and a shared picker (hover, tap, arrow keys) writing to an `aria-live` detail line.
**Removes:** `LAZY_LIBS.chart`, the idle warm-up, both canvases, the Chart.js colour constants.
**Tests:** no request for chart.js on Stats; bars equal the series; tap and arrow keys change the detail line; bar colours follow the theme without a redraw (CSS variables); a period with nothing done draws an honest empty state.

### Task 3 (item 54): Rate trend against the previous period
**Produces:** `trend(habits, range)` -> `{now:[{label,long,rate,owed,doneOwed}], before:[...]|null, rate, prevRate, delta}` (week 7x1 day, month 6x5 days, year 12 months, all = bar buckets); `renderTrend`.
**Tests:** delta in points with the right sign; no previous data -> no dashed line and the sentence says so; gaps (nothing owed) break the line instead of drawing zero.

### Task 4 (item 53): Year heatmap with month labels and day detail
**Produces:** `heatYear(habits, today)` -> `{weeks:[[{day, level, owed, doneOwed, done, future}]], months:[{col,label}], active, perfect}`; `dayDetail(habits, day)` -> `{day, owed, doneOwed, done, doneNames, missedNames}`; `renderHeat`.
**Levels:** 0 nothing done; 1 under a third of what was owed; 2 under two thirds; 3 under all; 4 all (or something done on a day nothing was owed).
**Tests:** 53 columns, starts on a Monday, ends today, scrolled to today on a phone; tap a day -> names done and missed (escaped); arrow keys walk days; legend present.

### Task 5 (item 55): Category balance
**Produces:** `categoryBalance(habits, range)` -> `[{key, habits, checkins, share, owed, doneOwed, rate}]` (categories with a habit in play, most check-ins first); `renderBalance` (one stacked bar plus a row per category, and a sentence naming the largest and any with none).
**Tests:** shares sum to 100 (largest remainder); a category with habits but no check-ins is listed as quiet; unknown category falls back to Health.

### Task 6 (item 56): Guided weekly review
**Files:** create `stats-review.js`, `tests/stats-review.test.js`, `tests/scenarios/45-reviews.js`.
**Produces:** `weekReview(habits, today)` -> `{from, to, label, now, before, delta, wins:[{id,name,done,owed}], slipped:[...], quiet:[...]}` for the last finished Monday-to-Sunday week; dialog `#review-modal` in four steps (the week; what went well; what slipped, each with Keep or Pause; one focus for the coming week); saved to the user document as `reviews.<mondayKey> = {at, focus}` (newest 26 kept).
**Page:** a Reviews card on Stats with "Review last week" and, once done, the focus habit with its progress this week.
**Privacy:** `privacy.html` names the saved review (the date and the chosen habit; no typed text).
**Tests:** week boundaries on a Monday and a Sunday; Pause chosen is applied on Finish only; Back and Escape lose nothing saved; focus line shows this week's count; the review can be redone.

### Task 7 (item 57): Month and year told as a short story
**Produces:** `story(habits, kind, today, frozen)` -> `{kind, title, from, to, slides:[{id, kicker, big, line}]}|null`; dialog `#story-modal`: one slide at a time, Next/Back buttons, progress marks, arrow keys, no auto-advance, last slide offers "Save picture" (canvas, via `moments.shareCanvas`).
**Rules:** month = the last finished calendar month when it has check-ins, else this month so far; year = this calendar year so far (in January, last year). Slides without data are left out; fewer than three slides -> the button says there is not enough yet.
**Tests:** slide figures against a seeded history; nothing invented for an empty month; keyboard walk; the picture is drawn without habit text being sent anywhere.

### Task 8 (item 58): Suggestions from the data
**Produces:** `suggestions(habits, today, frozen)` -> up to three `{id, habitId, kind, title, text, action}`; kinds `slipping`, `weekday`, `overload`, `raise`; card `#suggest-card`; each can be acted on (opens the habit's edit sheet or page) or dismissed for four weeks (device only, `habitly_suggest_<uid>`).
**Rules:** thresholds are explicit constants; every sentence carries its numbers; "Try mornings?" appears only when the completion times show most successes before noon.
**Tests:** each kind fires on its data and not below threshold; dismissed stays away after reload and returns after four weeks; names are escaped.

### Task 9 (item 60): Personal records wall
**Produces:** `records(habits, today, frozen)` -> `[{id, value, unit, label, detail, fresh}]`: longest streak, most in one day, best week, best month, longest run of perfect days, most-done habit, total check-ins, days active, total focus time (when any). `fresh` = set in the last seven days.
**Tests:** each record against a seeded history; ties go to the most recent; an empty account shows an invitation, not zeros.

### Task 10 (item 59): CSV export and a redesigned PDF report
**Files:** create `stats-export.js`, `tests/stats-export.test.js`, `tests/scenarios/46-export.js`.
**Produces:** `toCsv(habits)` (one row per check-in: Date, Habit, Category, Schedule, Count, Filled in late, Mood; CRLF, BOM, RFC 4180 quoting, cells starting `= + - @` or tab guarded with `'`); `reportModel(habits, today, frozen, name)` -> `{title, made, figures, months, rows, records, notes}`; the export dialog offers "PDF report" and "Spreadsheet (CSV)".
**PDF:** brand ink header (no purple banner), four figures, twelve months as bars, the habits table (schedule, streak, best, 30-day rate, total), records, newest notes. The account email is left out.
**Tests:** CSV round-trips awkward names; the model's figures equal the dashboard's; both downloads report success; jsPDF still loads only on demand.

### After the tenth change
Gallery scenarios `b6-*`, independent review, one fix pass, merge, deploy, live check, push, pictures, report.
