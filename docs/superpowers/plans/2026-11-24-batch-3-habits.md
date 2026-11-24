# Batch 3: Creating and Editing Habits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship roadmap items 21 to 30: a proper sheet for creating and editing habits, and habits that can have a schedule, a target, their own look, a cue, dates, a reminder time, and can be paused or archived.

**Architecture:** Several items change what "due" and "done" mean. Those rules move into one new module, `habit-rules.js`, a dependency-free ES module used by the app (streaks, Today, counts) and by the reminder job (`scripts/send-reminders.js`, via `import()`), so the two can never disagree. Every new habit field is optional and absent means today's behaviour. History is never re-judged: a change of schedule or target is recorded with the day it took effect, and a streak is worked out with the rule that was in force on each day. The inline New habit form and the Edit dialog become one sheet.

**Tech Stack:** Plain HTML, CSS, ES modules, Firebase. Tests: `node tests/smoke.js`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md` (see "Builder's calls": history is never re-judged; partial progress is not "done"; paused days are skipped; reminders stay an hourly digest).

## Global Constraints

- All constraints from batches 1 and 2 apply (design guardrails, 320 to 1280px, light and dark, 44px touch targets, tokens only, motion rules, the crowded-Home rule, nothing between a tap and its result).
- **Additive data only.** New fields: `schedule`, `scheduleHistory`, `target`, `progress`, `icon`, `color`, `cue`, `startDate`, `endDate`, `reminderHour`, `pauses`, `archivedAt`. A habit with none of them behaves exactly as before. `frequency` stays and remains the coarse bucket (`daily`, `weekly`, `monthly`) that decides which Home section a habit is in.
- **One source of rules.** Whether a habit is due on a day, done on a day, and what its streak is, is decided only in `habit-rules.js`. `app.js`, `home.js` and `scripts/reminder-logic.js` call it; none re-implements it.
- **Completion integrity is unchanged.** A completion can be undone for one hour; past days are read-only; XP is counted once.
- **Privacy.** Each new stored field is named in `privacy.html` in the same commit that adds it.
- **Firestore rules** stay owner-only; no rules change in this batch.
- Each task: failing test first, the change, whole suite green, a row in `IMPROVEMENTS.md` (R23 onward, under `### Roadmap batch 3: creating and editing habits`), one commit. Bump `?v=` for changed shipped files.
- Owner decision recorded 24 November 2026: item 27 approved (habits can be edited at any time; a change to how often a habit repeats applies from that day forward).

## Review Focus

1. **Old data.** An account whose habits have none of the new fields must look and count exactly as it did: same streaks, same Today, same reminders.
2. **Rule changes mid-streak.** Changing a schedule or target, pausing, or setting dates must never raise or wipe a streak retroactively, and "today" must be judged by the new rule from the moment of the change.
3. **The reminder job and the app agree.** For every habit shape (weekday schedule, times per week, target, paused, archived, not started, ended), "still open today" is the same answer in both.
4. **Text and numbers typed by people.** Long names and cues, a target of 0 or 100000, a unit with HTML in it, an end date before the start date, a reminder hour of 24: each is rejected or handled, never stored broken.
5. **The sheet on a phone.** With the keyboard open on a 320px screen, the fields, the preview and the Save button are all reachable, and nothing is lost when the sheet is closed by accident (it is sticky).

## File Structure

| File | Responsibility |
|---|---|
| `habit-rules.js` (create) | Pure rules: `scheduleOn`, `isDueOn`, `isDoneOn`, `progressOn`, `isPausedOn`, `isActiveOn`, `habitStreak`, `habitLongestStreak`, `periodProgress`, `dayNumber` helpers |
| `tests/habit-rules.test.js` (create) | Unit tests, including "old habits behave as before" cases copied from current behaviour |
| `habit-sheet.js` (create) | The create/edit sheet: fields, validation, live preview; returns the habit fields to save |
| `templates.js` (create) | The template library data and search |
| `app.js` (modify) | Uses the rules module; opens the sheet; archive and pause; row rendering for new shapes |
| `scripts/reminder-logic.js` (modify) | Delegates due/done to the rules module; per-habit reminder hour |
| `scripts/send-reminders.js`, `.github/workflows/daily-reminders.yml` (modify) | Load the rules module; Node 22 |
| `tests/scenarios/28-habit-sheet.js`, `29-habit-shapes.js`, `30-habit-life.js` (create) | Browser scenarios |

---

### Task 1: Edit a habit at any time (roadmap 27)

- [ ] Test: a habit created a year ago has an Edit action (desktop hover actions and phone More); editing its name and category saves and keeps `completedDates`; the "one hour" wording is gone from the Recently deleted and details copy where it referred to editing; `27-batch2-review.js`'s "old habit has no Edit button" assertion is replaced by its opposite.
- [ ] Implement: remove the `isEditable` gate. Frequency stays editable only where it is today (the Edit form) and, until Task 5, a frequency change on a habit with history asks nothing and re-buckets it; Task 5 makes that change dated.
- [ ] Suite; ledger R23; commit.

### Task 2: One sheet for creating and editing, with a live preview (roadmap 21)

**Interfaces:** `habit-sheet.js` exports `openHabitSheet({ habit?, onSave(fields), categories, catColor })` and `readHabitFields(): object` (validated). A dialog `#habit-sheet` (`role="dialog"`, `data-sticky`) replaces both the inline `#habit-form` and `#edit-modal`. Field ids keep their meaning: `#habit-input` (name), `#habit-category`, `#habit-frequency`, `#habit-time`. `#new-habit-toggle`, the top-bar New habit button, the `N` key and the `+` in the Today header all open the sheet. A preview block `#habit-preview` renders the row exactly as Today will show it and updates on every input. Save is disabled until the name and category are valid; errors show under their field.
- An empty account no longer shows an open form: it shows the starter sets (Task 10 turns these into the library) and a **Create your own** button.

- [ ] Test (`28-habit-sheet.js`): opening by each of the four routes; the preview mirrors name, category icon and time of day as typed; Save creates the habit; Edit opens the same sheet filled in, and Save updates; Escape/Cancel discard, a tap outside does not close it; at 320x568 the Save button is visible without scrolling the page and the sheet scrolls inside; the old inline form is gone from Home (the list starts higher).
- [ ] Update existing scenarios that drive `#habit-form` inline or `#edit-modal` to use the sheet (helper `openNewHabit()` in each file that needs it).
- [ ] Suite; ledger R24; commit.

### Task 3: Icon and colour for each habit (roadmap 24)

**Interfaces:** optional `icon` (one of a fixed set of sprite ids, about 30: the 11 category icons plus general ones) and `color` (one of 8 palette keys: `red`, `orange`, `amber`, `green`, `teal`, `blue`, `violet`, `slate`, each with a light and dark value at 3:1 or better). `habitLook(h) -> { iconHTML, color }` in `app.js` falls back to the category. The sheet gets two pickers (radio groups, arrow-key navigable, 44px swatches).
- [ ] Test: defaults follow the category; choosing an icon and colour shows in the preview, on the row (icon chip, accent bar, dots) and in the stats category chart legend unchanged; both themes meet 3:1; unknown stored values fall back safely; privacy text mentions icon and colour.
- [ ] Suite; ledger R25; commit.

### Task 4: A cue for each habit (roadmap 29)

**Interfaces:** optional `cue` (string, trimmed, at most 80 characters). Sheet field `#habit-cue` with placeholder "After I pour my coffee". Shown on the row under the name as one muted line, truncated with an ellipsis, and in focus view under the name.
- [ ] Test: saved, shown, escaped (a cue of `<img onerror>` renders as text), truncated at 320px with no horizontal scroll, absent cue adds no height; privacy text mentions it.
- [ ] Suite; ledger R26; commit.

### Task 5: Schedules (roadmap 22)

**Interfaces (`habit-rules.js`):**
- `schedule` is `{ type: 'daily' }` (default), `{ type: 'days', days: number[] }` (0 = Sunday … 6 = Saturday, at least one), or `{ type: 'times', times: n }` (n times per week, 1 to 7). `type: 'days'` keeps `frequency: 'daily'`; `type: 'times'` sets `frequency: 'weekly'`. Monthly habits have no schedule options.
- `scheduleHistory: [{ from: 'YYYY-MM-DD', schedule }]`, appended whenever the schedule changes (including a plain frequency change). `scheduleOn(habit, day)` returns the schedule in force on that day (the last entry with `from <= day`, else the first known shape, else daily/weekly/monthly from `frequency`).
- `isDueOn(habit, day)`: daily → true; days → weekday in `days`; weekly/times/monthly → true (due any day of the period).
- `habitStreak(habit, today, frozenDays)`: daily and days count consecutive **due** days done, skipping days that were not due; times counts consecutive weeks in which completions reached the number in force that week; plain weekly and monthly as today. `habitLongestStreak` likewise.
- `periodProgress(habit, today) -> { done, target }` for weekly "times" habits (2 of 3).
- Home: a days-habit not due today is not in Today; it appears in a quiet "Not today" line count at the foot of the Today card ("2 habits rest today") that expands to show them read-only. A times-habit sits in This week with "2 of 3" and can be ticked once per day until the target is met, then shows done.
- Reminder job: a habit not due today is never "open".
- [ ] Unit tests first, including: an old daily habit's streak equals the current implementation's for 20 generated histories; Mon/Wed/Fri habit streak across weeks; schedule changed from daily to Mon/Wed/Fri on a Wednesday keeps the streak earned under daily; 3-times-a-week met, exceeded, missed; week boundary Sunday/Monday.
- [ ] Browser tests (`29-habit-shapes.js`): creating each schedule from the sheet (weekday chips, a stepper for times); Today and This week render as specified; the week strip and "N left today" count only what is due; editing a schedule appends to history and does not change yesterday's streak.
- [ ] Wire `scripts/reminder-logic.js` to the rules module (`await import('../habit-rules.js')`), update its tests, set the reminders workflow to Node 22.
- [ ] Suite; ledger R27; commit.

### Task 6: Measurable targets (roadmap 23)

**Interfaces:** optional `target: { amount: number (1 to 100000), unit: string (at most 12 chars), step: number (default 1) }` and `progress: { [day]: number }`. `progressOn(habit, day)`; `isDoneOn` stays "day in `completedDates`". The row shows a stepper in place of the checkbox: a round **+** button with a ring that fills (`5 / 8 glasses`), and a small **−** in More. Reaching the target runs the normal completion (date into `completedDates`, XP once, Undo toast). Going back below the target within the hour un-completes by the normal rule; after the hour the count is locked. Undo on the toast removes the last step.
- [ ] Unit tests: progress arithmetic, clamping, target changed mid-day (done stays done; progress is judged against the target in force), history of targets not re-judged.
- [ ] Browser tests: + adds a step and saves `progress`; the ring and label update; the final step completes with XP once; − within the hour un-completes and refunds; offline; a 60-character unit is rejected; rows stay one line at 320px.
- [ ] Suite; ledger R28; commit.

### Task 7: Start and end dates (roadmap 30)

**Interfaces:** optional `startDate`, `endDate` (day keys; `endDate >= startDate`). `isActiveOn(habit, day)`. Before the start a habit is listed under a quiet "Starts Monday" line; after the end it moves to the archive as "Finished" with its final tally. While running, the row shows "Day 12 of 30". Sheet: two date fields and quick chips "30 days", "66 days", "No end".
- [ ] Unit tests: active window edges; streak ignores days outside the window. Browser tests: countdown text, not-started and finished states, invalid range rejected with a message under the field.
- [ ] Suite; ledger R29; commit.

### Task 8: Pause and archive (roadmap 28)

**Interfaces:** `pauses: [{ from, to? }]` (open-ended while paused) and `archivedAt`. `isPausedOn(habit, day)`: paused days are skipped by streaks, the ring, the week strip and reminders. Actions **Pause** / **Resume** and **Archive** in the row's actions and in details. Paused habits show in a collapsed "Paused" line at the foot of Today. An **Archive** list in Profile (like Recently deleted, but permanent until restored) with Restore and Delete.
- [ ] Unit tests: a 5-day streak, paused 3 days, resumed and done → streak 6; pause does not extend a streak. Browser tests: pause, resume, archive, restore; counts and reminders exclude them; nothing is deleted by archiving.
- [ ] Suite; ledger R30; commit.

### Task 9: A reminder time for each habit (roadmap 25)

**Interfaces:** optional `reminderHour` (integer 0 to 23, local time). Sheet: a time select ("No reminder", then hours). `scripts/reminder-logic.js`: `dueReminders(user, habits, now) -> { key, habitNames }`: each hour, the habits whose `reminderHour` is the user's local hour and which are due, active, not paused and not done; one notification naming up to three ("Stretch, Read and 2 more"). Users with no timed habits keep the morning and evening windows unchanged. `lastReminder` keeps preventing repeats within the hour key. Shown only when the device has reminders on, with a line explaining that otherwise.
- [ ] Unit tests in `scripts/reminder-logic.test.js`: hour matching across time zones; excluded shapes; message wording; no duplicate in the same hour; untimed users unchanged.
- [ ] Browser tests: the field saves and shows on the row as a small bell with the time; privacy text updated.
- [ ] Suite; ledger R31; commit.

### Task 10: Template library (roadmap 26)

**Interfaces:** `templates.js` exports about 50 templates `{ name, category, icon?, schedule?, target?, cue?, timeOfDay?, goals: string[] }` grouped by goal (Energy, Fitness, Focus, Calm, Learning, Money, Home, Relationships), and `searchTemplates(query)`. A **Browse ideas** entry in the sheet and on the empty state opens the library: goal chips, a search box, and cards that add a habit in one tap (toast with Undo) or open it in the sheet to adjust. The four starter sets remain as the first row ("Starter sets") so existing behaviour and tests keep working.
- [ ] Tests: every template validates against the sheet's rules; search folds case and accents; adding one creates the habit with all its fields; Undo removes it; the library is keyboard navigable and fits 320px.
- [ ] Suite; ledger R32; commit.

### Task 11: Publish the batch

- [ ] Whole suite and all `node --test` files; gallery before/after; independent whole-branch review with the Review Focus list; one fix pass.
- [ ] Merge to `main`, dry-run then deploy, verify live hashes, live-site suite, push, confirm the GitHub runs (tests, and the reminder workflow file still valid).
- [ ] Before-and-after pictures and a plain-language list to the owner.
