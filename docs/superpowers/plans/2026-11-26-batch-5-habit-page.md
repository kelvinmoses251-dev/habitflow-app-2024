# Batch 5: Habit Detail and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship roadmap items 41 to 50: every habit gets a full page of its own, with its history (calendar, year, charts, notes, focus sessions), plain-language insights, a share card, a link that works with Back and bookmarks, and a 24-hour window to fill in a missed day.

**Architecture:** The small details dialog becomes a fourth page, `#page-habit`, shown by the existing hash router. Everything the page says is worked out from the habit itself by a new dependency-free module, `habit-history.js` (pure, unit tested), and drawn by `habit-page.js` (DOM only, every person-typed string escaped). `app.js` only wires them: it hands the habit over, and handles the buttons. The one rule change (item 46) lives in `habit-rules.js`, the single source of rules, so the app and the reminder job keep agreeing.

**Tech Stack:** Plain HTML, CSS, ES modules, Firebase. Tests: `node tests/smoke.js`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md`

## Global Constraints

- All constraints from batches 1 to 4 apply (design guardrails, 320 to 1280px, light and dark, 44px touch targets on phones, tokens only, motion once and under 900ms, offline-first writes, one source of rules, nothing between a tap and its result, the crowded-Home rule).
- **Additive data only.** New optional fields: `backfilled` (`{ 'YYYY-MM-DD': true }`, days filled in late) and `sessions` (`[{ at: ms, minutes: n }]`, focus sessions, newest 60 kept). `journals` keeps its shape. `privacy.html` names each new field in the task that adds it.
- **Owner decision recorded 26 November 2026: item 46 approved.** A day that was due and missed can be completed until the end of the following day. Nothing older can be changed. A late completion earns the normal 25 XP once, can be taken back for an hour like any other, never pays the daily bonus, and is marked as filled in late wherever history is shown.
- **Speed.** Every history sum runs once per change of data (memo on the habits array), uses a Set of done days, and is bounded (a year at most). A habit with five years of history opens its page in under 200ms.
- **Ids kept.** The elements that tests and code already use keep their ids when they move into the page (`details-habit-name`, `details-current-streak`, `details-longest-streak`, `details-total-days`, `details-time`, `details-pause`, `details-archive`, `details-life-note`, `details-journal-input`, `details-save-journal`, `details-journal-list`, `details-close`, `timer-display`, `timer-input`, `timer-start`, `timer-pause`, `timer-close`, `timer-habit-name`).
- Each task: failing test first, the change, whole suite green, a row in `IMPROVEMENTS.md` (R45 onward, under `### Roadmap batch 5: habit detail and history`), one commit. Versions bumped once for the batch. Stage files by name.

## Review Focus

1. **The fill-in rule.** Only yesterday, only if it was due and missed, only once; XP once; streak, shield question, perfect week, recap and reminders all agree about the filled day; the day after tomorrow it is locked again; a clock set back, or a second device, cannot widen the window.
2. **Old and odd data on the page.** Habits with no history, five years of history, junk dates, notes with HTML in them, hundreds of notes, `sessions` or `backfilled` holding junk: the page opens, counts sensibly and escapes everything.
3. **Links.** A link to a habit that was deleted, archived, belongs to someone else, or is opened before sign-in; Back from the page, from a dialog opened on the page, and after editing or deleting the habit shown; a reload on the page.
4. **The timer.** Leaving the page while a session runs, finishing in a background tab, finishing on a habit already done, two habits' pages one after the other, sign-out mid-session: one session is recorded once, to the right habit, and XP is never paid twice.
5. **Small screens and assistive tech.** The calendar, charts and heatmap at 320px with no sideways scroll of the page; every chart has a text equivalent; the calendar can be read by a screen reader and walked with the keyboard; headings are in order; focus lands sensibly on arrival and returns on Back.

## File Structure

| File | Responsibility |
|---|---|
| `habit-history.js` (create) | Pure: `monthGrid`, `weeklyRates`, `weekdayRates`, `yearCells`, `habitInsights`, `searchNotes`, `sessionTotals`, `habitSummary` |
| `tests/habit-history.test.js` (create) | Unit tests |
| `habit-page.js` (create) | DOM only: renderers for each section of the page, the single-habit share card |
| `habit-rules.js` (modify, Task 6) | `canFillIn(habit, day, today)` |
| `app.js`, `index.html`, `style.css` (modify) | The page section, routing, wiring |
| `tests/scenarios/39-habit-page.js`, `40-habit-history.js`, `41-fill-in.js` (create) | Browser tests |

---

### Task 1: A full habit page (roadmap 41)

**Interfaces:** `<section id="page-habit" class="page">` with a Back button (`#details-close`), the habit's icon, name, cue and badges, four stat tiles (streak, longest, total, last 30 days as a percentage: `habitSummary(habit, today, frozen) -> { streak, longest, total, rate30, due30, done30 }`), an action row (Edit, Pause/Resume, Archive, time of day), and the notes block as it is today. `openHabitPage(id)` shows it (`navigate('habit')`); the row's name/details action, double-click and the old `openDetailsModal` callers use it. `#details-modal` is removed. The page re-renders when the habit's data changes and leaves (to Home, with a toast) if the habit is deleted or archived. The bottom tab bar shows Home as current while on it.
- [ ] Unit tests: `habitSummary` on an empty habit, a daily, a weekdays-only, a weekly, a paused habit.
- [ ] Browser test (`39-habit-page.js`): opening from a row; the heading is the habit's name (an `h1`); stats match; Edit opens the sheet and the page updates on save; Pause and Archive work from the page; Back returns to Home with focus on the row; a name with HTML is text; 320px has no sideways scroll; dark theme.
- [ ] Update existing scenarios that use `#details-modal` to use the page.
- [ ] Suite; ledger R45; commit.

### Task 2: A link for every habit (roadmap 50)

**Interfaces:** the page's address is `#habit/<id>`. `navigate` accepts `habit/<id>`; `openHabitPage(id)` sets the hash, so Back and Forward work without extra code. On load with such a hash the page waits for the habits, then shows the habit; an id that is not in the account shows a plain "This habit is not here" state with a button to Home. `document.title` is `<habit name> · Habitly` on the page and restored on leaving. A **Copy link** action copies the address (toast confirms; falls back to selecting the text).
- [ ] Browser test: the hash after opening; reload stays on the page; Back goes to where the person was (Home, or Stats when opened from there); an unknown id; a deleted habit while on its page; the title; Copy link (clipboard stubbed).
- [ ] Suite; ledger R46; commit.

### Task 3: A month calendar with streak runs (roadmap 42)

**Interfaces:** `monthGrid(habit, month /* 'YYYY-MM' */, today, frozen) -> { month, label, weeks: Cell[][], prev, next|null }`, `Cell = { day, inMonth, state: 'done'|'missed'|'rest'|'paused'|'shield'|'open'|'future'|'before', late: boolean, run: 'single'|'start'|'mid'|'end'|null, today: boolean }`. Weeks start on Monday. A run is two or more done days next to each other (shield days join runs); it is drawn as one continuous band. Navigation buttons step a month; Next is off in the current month; Prev stops at the habit's first month. The grid is a `table` with weekday headers; each day cell has an `aria-label` ("Tuesday 3 November: done").
- [ ] Unit tests: a month with a run across a week boundary, a run across a month boundary, rest days, a pause, a shield day, days before creation, future days, leap February.
- [ ] Browser test (`40-habit-history.js`): this month shows today ringed; runs are joined (start/mid/end classes); stepping back and forward; labels; 320px.
- [ ] Suite; ledger R47; commit.

### Task 4: Charts: twelve weeks and best weekday (roadmap 43)

**Interfaces:** `weeklyRates(habit, today) -> [{ start, due, done, rate|null }]` (12 entries, oldest first; weekly and monthly habits count periods, not days) and `weekdayRates(habit, today) -> [{ weekday /* 1..7, Monday first */, label, due, done, rate|null }]` over the last 12 weeks, with `best` flagged. Drawn as CSS bars (no chart library): each bar has a text value, each chart a caption sentence ("Best on Tuesdays: 11 of 12").
- [ ] Unit tests: rates with rest days and pauses excluded from `due`; an empty habit gives `null` rates; ties for best weekday pick the earliest.
- [ ] Browser test: twelve bars with heights in proportion; the caption; the best weekday marked; text equivalents present; nothing overflows at 320px.
- [ ] Suite; ledger R48; commit.

### Task 5: A year heatmap for the habit (roadmap 45)

**Interfaces:** `yearCells(habit, today, frozen) -> { weeks: Cell[][] (53 columns, Monday first), months: [{ label, col }], done, due }` with the same cell states as the calendar. Drawn as a grid that scrolls sideways inside its own box on phones (the page itself never scrolls sideways), starting scrolled to today, with a legend and a summary sentence ("214 of 251 days in the last year").
- [ ] Unit tests: 53 columns ending in this week; counts; states.
- [ ] Browser test: cell count; summary; the box scrolls, the page does not; today is in view.
- [ ] Suite; ledger R49; commit.

### Task 6: 24 hours to fill in a missed day (roadmap 46, approved)

**Interfaces:** `habit-rules.js` `canFillIn(habit, day, today) -> boolean`: `day` is yesterday, the habit was due and active that day, existed by then, and is not done for it. `fillIn(id)` in `app.js`: writes `completedDates += yesterday`, `completedTimestamps.<yesterday> = now`, `backfilled.<yesterday> = true`, pays 25 XP (never the daily bonus), toasts with Undo (the normal one-hour take-back, which also clears `backfilled`). Offered in two places: a "Fill in yesterday" button on the habit page when it applies, and on Home's past-day view for yesterday, where open rows get a Complete button. History marks late days (`late: true` cells get a small corner mark and "filled in late" in their label). `privacy.html` names `backfilled`.
- [ ] Unit tests (`habit-rules.test.js`): yesterday due and missed is fillable; today, two days ago, a rest day, a paused day, a done day, a day before the habit existed, an archived habit are not; weekly habits are not (their week is still open or already judged).
- [ ] Browser test (`41-fill-in.js`): the button appears only when it applies; filling in saves the three fields and 25 XP; the streak joins up; the shield question goes; no all-done card or bonus; Undo restores everything; two days ago stays locked; the calendar marks the day as late.
- [ ] Suite; ledger R50; commit.

### Task 7: A notes timeline with search (roadmap 44)

**Interfaces:** `searchNotes(journals, query) -> [{ date, day, text, parts: [{ text, hit }] }]` newest first, folding case and accents, every word required; junk entries dropped. The page's notes block becomes a timeline grouped by month, with a search box (shown once there are more than three notes), a count ("3 of 41 notes"), matches marked with `<mark>`, and an empty-result line. Adding and deleting notes work as before.
- [ ] Unit tests: folding, multi-word, parts never lose characters, HTML in a note stays text, junk.
- [ ] Browser test: grouping; search narrows and marks; clearing restores; a note with `<img onerror>` renders as text; delete still works while filtered.
- [ ] Suite; ledger R51; commit.

### Task 8: Plain-language insights for the habit (roadmap 48)

**Interfaces:** `habitInsights(habit, today, frozen) -> [{ icon, text }]`, at most four, each a complete sentence with numbers from the record: the last 30 days against the 30 before; the best and the hardest weekday (when they differ enough); the usual time of day it gets done (from `completedTimestamps`, at least five); the longest run and when; how it has felt (mood notes, at least three). Nothing is said without enough data; an empty habit gets one line saying what will appear here.
- [ ] Unit tests: each sentence with fixed data; thresholds; an empty habit.
- [ ] Browser test: sentences appear on the page as a list; none for a new habit beyond the placeholder; no HTML injection through anything stored.
- [ ] Suite; ledger R52; commit.

### Task 9: The focus timer lives on the habit page, with a session history (roadmap 49)

**Interfaces:** the timer's controls move from `#timer-modal` into a Focus section of the page (ids kept). The row's timer action opens the habit page at that section. While a session runs, leaving the page keeps it running and a slim bar (`#timer-bar`, a button: "Read · 12:41") on other pages returns to it. Finishing records `{ at, minutes }` in `sessions` (newest 60 kept) and completes the habit as before. `sessionTotals(sessions) -> { count, minutes, recent: [{ at, minutes }] }` feeds a short history list ("25 min · Tue 24 Nov") and a total. `privacy.html` names `sessions`.
- [ ] Unit tests: totals; junk entries; the cap.
- [ ] Browser test: start, pause, resume, finish from the page; the session is recorded once and listed; the habit is completed for 25 XP once; a second session on a done habit records a session but pays nothing; leaving the page shows the bar and it returns; the existing timer scenarios updated.
- [ ] Suite; ledger R53; commit.

### Task 10: A share card for one habit (roadmap 47)

**Interfaces:** `habit-page.js` `drawHabitCard(canvas, { name, streak, longest, total, rate30, weeks /* last 12 weeks of cells */, url })` (1080x1350, the same ink and accent as the other cards) and a **Share** action on the page using `moments.shareCanvas`. The card shows the name, the current streak large, three small figures, a 12-week grid, and the site address. Nothing but the one habit's own numbers is on it.
- [ ] Browser test: Share makes a PNG (download fallback observed) named after the habit; a long name is cut with an ellipsis, not overflowing; the card is not blank.
- [ ] Suite; ledger R54; commit.

### Task 11: Publish the batch

- [ ] Whole suite and all `node --test` files (add `tests/habit-history.test.js` to the CI list); gallery before/after; independent whole-branch review with the Review Focus list; one fix pass.
- [ ] Merge to `main`, dry-run then deploy, verify live hashes, live-site suite, push, confirm the GitHub runs.
- [ ] Before-and-after pictures and a plain-language list to the owner.
