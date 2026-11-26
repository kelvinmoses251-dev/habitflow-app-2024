# Batch 4: The Completion Moment and Motivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship roadmap items 31 to 40: completing a habit feels designed, and the app recognises what people have done (milestones, levels, achievements, a recap, perfect weeks) without ever getting in the way of the next tap.

**Architecture:** Everything the app says about a person's record is worked out from the habits they already have, in one new dependency-free module, `motivation.js` (pure functions, unit tested with `node --test`). The screens that show it (milestone card, level page, achievements, recap, comeback, the bottom "moment" card) live in a second new module, `moments.js`, which only draws what `app.js` hands it. Sounds move to `sounds.js`. Two cross-cutting rules are enforced in code, not by convention: celebrations caused by a tap are queued and shown one at a time; cards the app raises on its own are limited to one per day per account.

**Tech Stack:** Plain HTML, CSS, ES modules, Firebase. Tests: `node tests/smoke.js`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md` (anti-goals: nothing between a tap and its result; new cards are dismissible and at most one unprompted one appears per day; no emoji, gradients, glow, blur or looping animation. Builder's call: mood notes use five line-drawn faces from the icon set).

## Global Constraints

- All constraints from batches 1 to 3 apply (design guardrails, 320 to 1280px, light and dark, 44px touch targets on phones, tokens only, the crowded-Home rule, offline-first writes, one source of habit rules in `habit-rules.js`).
- **Nothing between a tap and its result.** No new card, sheet or prompt may delay or cover the saving of a completion. Every one closes with Escape, its Close button, and (for the moment card) a Dismiss button. None is `data-sticky`.
- **One unprompted card a day.** The shield question (33), the comeback card (38) and the evening recap offer (34) share one allowance: `localStorage habitly_moment_<uid>` holds the local day one was last shown. Order when several apply: shield, comeback, recap. Each stays reachable by hand all day (Shield tile, Profile, the ring).
- **One celebration at a time.** Milestone card, all-done card and level-up are queued (`queueCelebration`) and never stacked; the next opens when the one before closes.
- **Motion.** Every new animation runs once, is under 900ms, uses transform, opacity or stroke only, and is switched off under `prefers-reduced-motion` (the end state shows at once).
- **Additive data only.** The one new stored field is `moods` on a habit (`{ 'YYYY-MM-DD': 1..5 }`). Everything else is derived, or kept on the device in `localStorage`. `privacy.html` is updated in the task that adds `moods`.
- **Completion integrity is unchanged.** 25 XP once per completion, 100 XP once per full day, one hour to take a completion back.
- Each task: failing test first, the change, whole suite green, a row in `IMPROVEMENTS.md` (R34 onward, under `### Roadmap batch 4: the completion moment and motivation`), one commit. Bump `?v=` for changed shipped files. Stage files by name.

## Review Focus

1. **A stack of cards on one tap.** The tap that completes the last habit of the day can reach a milestone, the daily bonus and a new level together. The person must see them one after another, each closable, and the completion must already be saved under the first.
2. **Take-backs and repeats.** Undo then redo, or un-tick and re-tick, must not show a milestone twice, announce an achievement twice, pay XP twice, or leave a mood behind on a day that is no longer done.
3. **The shield decision.** Declining, ignoring, answering on a second device, answering after midnight, or having no shield: the streak shown is always the true one, the shield count never goes below zero, and a shield is never spent without a tap.
4. **Old and odd data.** Accounts with no completions, hundreds of habits, habits with broken dates, `moods` holding junk (a string, 9, a date that was never done): every derived screen still opens and counts sensibly.
5. **Small screens and assistive tech.** At 320px every new card fits without horizontal scroll and its buttons are 44px; each dialog has a name, traps focus and returns it; the completion animation and sounds have a text equivalent (the toast) and respect reduced motion and the sound switch.

## File Structure

| File | Responsibility |
|---|---|
| `motivation.js` (create) | Pure: `LEVELS`, `levelInfo`, `xpHistory`, `MILESTONES`, `milestoneCrossed`, `ACHIEVEMENTS`, `achievements`, `daysAway`, `perfectRun`, `moodOf`, `moodInsights`, `dayRecap` |
| `tests/motivation.test.js` (create) | Unit tests for all of the above |
| `moments.js` (create) | DOM only: `queueCelebration`, `showMoment`/`hideMoment`, `momentAllowed`/`markMoment`, renderers for the milestone card, level page, achievements, recap and comeback sheet |
| `sounds.js` (create, Task 10) | Three sound themes over Web Audio |
| `app.js`, `index.html`, `style.css` (modify) | Wiring, markup, styles |
| `tests/scenarios/33-completion.js` … `36-…` (create) | Browser tests |

---

### Task 1: A designed completion animation (roadmap 31)

**Interfaces:** `completeHabit` adds the class `completing` to the tapped row at once (no wait for the save) and stores `justCompletedAt = performance.now()`. A re-rendered row within 900ms gets `just-done` plus an inline `--fx-skip: -<elapsed>ms` used as `animation-delay`, so the sequence continues instead of restarting. The tick box gets a sibling `<svg class="tick-fx" viewBox="0 0 36 36" aria-hidden="true"><circle class="fx-ring" …/><path class="fx-mark" …/></svg>` on rows that are completing. Keyframes: `fxRing` (ring draws round the box, 0 to 260ms), `fxMark` (check draws, 160 to 460ms), `fxSettle` (row tint fades, name settles, 300 to 800ms). Counting rows use the same ring on the + button when the goal is reached. Vibration `[14, 50, 26]` on completion (ring, then mark); take-back stays `30`.
- [ ] Test (`33-completion.js`): within 60ms of the click the row has `completing` and a `.tick-fx` whose ring and mark have named, finite animations of at most 900ms; the toast and the saved completion still arrive on time; after the snapshot re-render the row's animation delay is negative (it did not restart); under reduced motion no animation runs and the box is simply checked; `navigator.vibrate` received `[14, 50, 26]`; a counting habit's last step shows the same effect; un-ticking plays no completion effect; design guardrails still pass.
- [ ] Suite; ledger R34; commit.

### Task 2: A level page (roadmap 35)

**Interfaces:** `motivation.js` exports `LEVELS` (the ten existing levels, moved from `app.js`, each with a one-line `meaning`), `levelInfo(xp)` (same shape as today's `getLevelInfo`, which becomes a re-export), `xpHistory(habits, today, days = 14) -> [{ day, done, bonus, xp }]` newest first (25 per completion that day; `bonus` true and +100 when every daily habit due that day was done; days with nothing are left out). The Level tile on Home and the Level row in Profile become buttons opening `#level-modal`: level and title, bar to the next level with "N XP to go", "How XP works" (25 a habit, 100 for a full day, taking a completion back returns it), the ladder of ten with the current one marked and passed ones ticked, and "Recent XP" from `xpHistory` with an honest footnote that it is worked out from completions.
- [ ] Unit tests: `levelInfo` at 0, 99, 100, 3200 and beyond level 10; `xpHistory` counts, bonus rule (rest days and paused habits are not owed), empty history, junk dates.
- [ ] Browser test (`34-recognition.js`): both entry points open the page; the ladder marks the right level for 300 XP; history lists today after a completion; Escape closes and focus returns; 320px fits.
- [ ] Suite; ledger R35; commit.

### Task 3: Milestone moments (roadmap 32)

**Interfaces:** `MILESTONES = [7, 30, 100, 365]`; `milestoneCrossed(before, after) -> number|null` (the highest milestone with `before < m <= after`). After a completion is saved, `app.js` compares the daily habit's streak before and after; a crossed milestone not already in `localStorage habitly_milestones_<uid>` (`{ [habitId]: number[] }`) is recorded and queued with `queueCelebration`. `#milestone-modal`: full-screen card (`.dialog.is-full`), the number, "days in a row", the habit name, one line per milestone, **Share** and **Continue**. Share draws a 1080x1350 PNG (flat, tokens' colours) and uses `navigator.share({ files })` where available, otherwise downloads it. `queueCelebration(open: (done) => void)` in `moments.js`; the all-done card and level-up use it too.
- [ ] Unit tests: `milestoneCrossed` for 6→7, 7→8, 0→400, 29→30, equal and falling values.
- [ ] Browser test: a 6-day streak ticked today shows the card with 7 and the habit name; un-tick and re-tick does not show it again; when the same tap also finishes the day, the all-done card opens only after the milestone card closes; Share produces an image (download fallback observed); weekly habits show none; 320px and dark fit.
- [ ] Suite; ledger R36; commit.

### Task 4: Achievements gallery (roadmap 36)

**Interfaces:** `ACHIEVEMENTS`: about 18 entries `{ id, name, how, icon, goal, measure }`; `achievements(habits, { today, xp, frozen }) -> [{ id, name, how, icon, earned, have, goal }]`. Families: check-ins (1, 10, 50, 100, 500, 1000), longest streak (3, 7, 30, 100, 365), perfect days (1, 7, 30), habits kept at once (3, 5), level (5, 10). Profile gets a row "Achievements · 6 of 18" opening `#achievements-modal`: a grid of medallions, earned ones filled, locked ones as dashed outlines with their progress ("12 of 30"). Newly earned ones are announced by a toast, compared against `localStorage habitly_achievements_<uid>`; the first run records silently.
- [ ] Unit tests: each family at, below and above its goal; nothing earned on an empty account; `have` never exceeds `goal`.
- [ ] Browser test: counts on the Profile row; locked and earned look different (dashed border vs filled) and say so to a screen reader; earning one by a tap shows one toast, once; grid fits 320px with no horizontal scroll.
- [ ] Suite; ledger R37; commit.

### Task 5: The streak shield becomes a choice (roadmap 33)

**Interfaces:** `checkAndApplyStreakShield` is split: `shieldOffer() -> { day, streak, habitName } | null` (the existing rules, unchanged: a shield is in hand, a daily habit was due yesterday, covering it rescues a real streak, and it was not declined: `localStorage habitly_shield_no_<uid>` equals yesterday) and `useShield(day)` (the existing write). The moment card `#moment` (non-modal, fixed above the tab bar, `role="region"` `aria-label`, title, text, up to two buttons and a Dismiss): "You missed yesterday. Use your shield to keep your 12-day streak on Read?" with **Use shield** and **Let it go**. Until answered the streak shows its true (broken) value. The Shield tile on Home becomes a button: with an offer open it shows the card again, otherwise it says what a shield is and when the next one arrives. `showMoment({ id, title, text, actions, unprompted })` honours the one-a-day allowance only when `unprompted` is true.
- [ ] Update the existing shield scenarios (02, 32): the shield is consumed after **Use shield**, not on load.
- [ ] Browser test (`35-moments.js`): the card appears with the right number and name and does not cover or disable the habit rows; ticking a habit while it is open works; Use shield restores the streak and writes shield, frozen day and time; Let it go keeps the shield, and the card does not return on reload; Dismiss leaves the offer reachable from the Shield tile; nothing is written before a tap; no shield in hand, or nothing to rescue, shows no card.
- [ ] Suite; ledger R38; commit.

### Task 6: A comeback flow (roadmap 38)

**Interfaces:** `daysAway(habits, today) -> number` (whole days since the last completion of any habit; 0 when there is none). At 3 or more, and once per absence (`localStorage habitly_comeback_<uid>` holds the last completion day it was shown for), the moment card says "Welcome back. It has been N days." with **Ease back in** and Dismiss. Ease back in opens `#comeback-modal`: what is still theirs (total check-ins, longest streak), then their habits as a checklist, all ticked; un-ticking one means "not for now" and **Start again with N** pauses the rest (the batch 3 pause, so nothing is lost and Resume brings each back).
- [ ] Unit tests: `daysAway` for today, yesterday, three days, never, junk dates.
- [ ] Browser test: after four days away the card shows; the sheet lists habits; un-ticking two and confirming pauses exactly those; it is not offered again on reload, nor to a brand-new account, nor after one day away; it yields to the shield question on the same day.
- [ ] Suite; ledger R39; commit.

### Task 7: A one-tap mood note (roadmap 37)

**Interfaces:** five sprite symbols `i-mood-1` … `i-mood-5` (line-drawn faces). The "Completed. +25 XP" toast carries a row of five 44px face buttons (`.toast-moods`, labelled "Awful", "Hard", "Okay", "Good", "Great"); one tap saves `moods.<day> = n` on the habit and closes the toast; ignoring it saves nothing. `toast()` gains an optional `extra: HTMLElement`. Taking a completion back deletes that day's mood. Profile has a switch "Ask how it felt" (`habitly_mood`, on by default). `moodOf(habit, day)` (1..5 or null, only on a done day), `moodInsights(habits) -> [{ ic, html-safe parts }]`: the habit that feels best (average of at least 3 notes), and one that has felt hard (average 2 or less over at least 3). `buildInsights` appends them. `privacy.html` names the new field.
- [ ] Unit tests: `moodOf` ignores junk and undone days; insights need three notes; names are returned raw and escaped by the caller.
- [ ] Browser test: faces appear on the toast, are buttons with names, 44px on phones; a tap saves and closes; Undo still works and removes the mood; the switch hides them; an insight appears with enough notes; a name with HTML in it renders as text; privacy text updated.
- [ ] Suite; ledger R40; commit.

### Task 8: An end-of-day recap (roadmap 34)

**Interfaces:** `dayRecap(habits, today, { frozen }) -> { done: Habit[], open: Habit[], xp, bonus, streak, moodAvg, tomorrowDue }`. `#recap-modal` (a sheet): the date, "5 of 6 done", the done list with their faces, what is still open (each with a Complete button while it is still today), XP earned today, the streak, and "Tomorrow: N habits". Opened by tapping the ring on Home, by **See recap** on the all-done card, and offered once in the evening (20:00 or later, at least one habit due, allowance free) by the moment card: "Your day in review is ready."
- [ ] Unit tests: `dayRecap` with rest days, paused habits, counting habits part-done (open), nothing due.
- [ ] Browser test: the ring opens it and it matches the day; completing from the recap updates it; in an evening timezone the offer appears once and not in a morning one; the all-done card links to it; 320px fits.
- [ ] Suite; ledger R41; commit.

### Task 9: Perfect weeks and months on the week strip (roadmap 39)

**Interfaces:** `perfectRun(habits, today) -> number`: consecutive perfect days ending today, or ending yesterday while today is still open (a perfect day has at least one daily habit due and all of them done; days with nothing due are stepped over). At 7 or more the strip gets `is-perfect`, its dots are joined by a line, and a label "Perfect week" appears beside it; at 30 or more the label is "Perfect month". The first time each is reached (per account, `localStorage`), one toast says so. The strip's `aria-label` carries the same words.
- [ ] Unit tests: 6, 7, 30 days; today open; a rest day inside the run; a missed day ends it; paused habits are not owed.
- [ ] Browser test: seven full days show the joined strip and label; six do not; thirty say month; the summary still fits the crowded-Home rule; light and dark.
- [ ] Suite; ledger R42; commit.

### Task 10: Three sound themes (roadmap 40)

**Interfaces:** `sounds.js` exports `SOUND_THEMES = ['soft', 'wood', 'glass']` and `createSounds(getCtx, getTheme) -> { tick(), untick(), chime(), levelUp(), milestone() }`. Soft is today's set; Wood is short, dry and low (triangle, fast decay); Glass is bell-like (sine with a high partial). Every sound is under 1.2 seconds and peaks at or below 0.35 gain. Profile: under the Sound switch, three radio chips (`habitly_sound_theme`); choosing one plays its tick as a preview. Sound stays off by default.
- [ ] Browser test (with a recording `AudioContext` stub): off creates no context; each theme's tick differs in oscillator type or pitch; the chips are a radio group, keyboard reachable, remembered across reloads; previewing plays once; nothing sounds on a take-back except `untick`.
- [ ] Suite; ledger R43; commit.

### Task 11: Publish the batch

- [ ] Whole suite and all `node --test` files (add `tests/motivation.test.js` to the CI list); gallery before/after; independent whole-branch review with the Review Focus list; one fix pass.
- [ ] Merge to `main`, dry-run then deploy, verify live hashes, live-site suite, push, confirm the GitHub runs.
- [ ] Before-and-after pictures and a plain-language list to the owner.
