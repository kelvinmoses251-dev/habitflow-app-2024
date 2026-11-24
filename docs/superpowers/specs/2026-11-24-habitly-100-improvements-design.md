# Habitly: 100 improvements roadmap

Date: 24 November 2026
Status: awaiting owner approval

## Intent

The owner wants Habitly's experience and interface raised to the level of a premium, "million-dollar" product, through 100 distinct, bold improvements made one at a time. Experience and looks come first. Other changes the app needs are at the builder's discretion.

## Goals

- Every screen looks and feels deliberate, consistent and expensive, in light and dark, on phone, tablet and desktop.
- The core job, ticking off today's habits, gets faster and more satisfying, never slower.
- Each of the 100 changes is visible or felt by a user. No change is only a refactor unless it is what makes the app noticeably faster.
- The app stays correct: the test suite stays green after every change.

## Non-goals

- A rewrite in a framework. The app stays plain HTML, CSS and JavaScript modules with Firebase, with no build step.
- Native mobile apps.
- Payments or a paid tier.

## Anti-goals (these would make it a failure even if it "works")

- A crowded Home screen. The measurable rule, enforced by a test from batch 2 onward: for an account with habits, the first habit row starts within 320px of the top of the screen at 375x667 and 390x844. Section headers, chips, search and the day browser must fit inside that.
- Anything that gets between a tap and its result. New cards, sheets and prompts never block completing a habit, are dismissible, and at most one unprompted one appears per day.
- Decoration in place of design: no emoji, gradients, glow, blur or endlessly looping animation. The existing guardrail tests (`tests/scenarios/13-design.js`) stay and keep passing.
- Anything fake: no invented testimonials, user counts or reviews.
- Losing or corrupting existing users' data. Data model changes are additive, and old habits keep working without migration.

## Constraints

- Live site with real users: https://habit-tracker-demo-34c0a.web.app
- No build step, no npm dependencies in the app. Third-party libraries load on demand from the existing CDNs or are replaced by small in-house code.
- Firestore rules stay owner-only unless an item below explicitly says otherwise, and any such item ships with its rules change and rules tests together.
- Offline-first behaviour must keep working (writes are never awaited for UI).
- When a change makes the app collect or share new information, `privacy.html` is updated in the same change.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A (chosen) | Write the roadmap, then build in ten batches of ten, one change at a time, publishing after each batch | The owner sees changes live ten at a time |
| B | Publish every change the moment it passes | Users see the app shift 100 times; about ten minutes of live checking per change |
| C | One large redesign first, then 99 changes | The riskiest step comes first and cannot be judged piece by piece |

The owner chose A on 24 November 2026. Batch 1 is the visual foundation, so the premium look arrives first and later work builds on it.

## How each change is made

1. Write a failing test for the behaviour or look (browser scenario in `tests/scenarios/`, or `node --test` for pure logic).
2. Make the change.
3. Run the whole suite. It must be green.
4. Add a row to `IMPROVEMENTS.md`.
5. Commit that one change on its own.

After every tenth change: deploy with `node tools/deploy.js`, check the live files match the commit, run the suite against the live site, push to GitHub, and give the owner before-and-after screenshots.

## Decisions that are the owner's

These items change a rule the product currently has, or share data between people. Each is built only after the owner says yes when its batch starts. If the answer is no, a replacement of the same size is proposed.

- 15: completing a habit in one tap with Undo becomes the default (today it asks first).
- 27: habits can be edited at any time (today only in the first hour).
- 46: a missed day can be filled in for 24 hours (today past days are locked).
- 92, 93, 94: opt-in sharing with other people. Needs new database rules and a privacy policy update.

Owner steps (not decisions, but only the owner can do them, in the Firebase console): enabling sign-in by emailed link and editing the email templates for items 65 and 66. The builder gives exact click-by-click steps when batch 7 starts.

Buying a real domain is outside the 100. The site address becomes one setting as part of item 100 so a domain can be connected later.

## The 100

### Batch 1: Visual foundation
1. One set of design tokens: 4px spacing scale, a type scale, radii and line heights, used everywhere.
2. A depth system: three elevation levels built from hairline borders and soft neutral shadows. A new guardrail test caps shadow blur and forbids coloured shadows, so depth cannot drift into glow.
3. Full colour ramps for neutrals and the accent, with a rebuilt dark theme that uses raised surfaces instead of one flat black.
4. One icon set at a single stroke weight and size grid, replacing the mismatched category icons.
5. Self-hosted variable fonts (Inter and the display serif), so text renders instantly and no font request leaves the site.
6. A button and input system with every state designed: hover, pressed, focus, loading, disabled, error.
7. Custom select, switch and checkbox components in place of browser-default controls.
8. One dialog system: bottom sheets on phones, centred dialogs on desktop, drag to dismiss.
9. Redesigned toasts: stacked, with an icon, a countdown bar and swipe to dismiss.
10. Skeleton loading in place of the spinner, with the app frame painted first. Placeholders are static shapes, not a shimmer (a shimmer is a gradient on an endless loop).

### Batch 2: Home
11. The progress summary collapses to a slim bar on phones so today's list is on the first screen, and expands on tap.
12. Today grouped by time of day: Morning, Afternoon, Evening, Anytime.
13. Drag to reorder habits, by touch, mouse and keyboard.
14. Swipe a row to complete it or to reveal more actions.
15. One-tap completion with Undo as the default (owner decision).
16. A day browser: step back through previous days to see what was done, read-only.
17. Weekly and monthly habits move to their own "This week" and "This month" sections with progress.
18. Category filter chips and a search box once there are more than eight habits.
19. A seven-day dot history on every row.
20. Focus view: one habit at a time, large, for working through the day.

### Batch 3: Creating and editing habits
21. New habit becomes a full sheet with a live preview of the row.
22. Schedules: chosen weekdays, or a number of times per week.
23. Measurable habits: a target amount (8 glasses, 20 minutes) with tap-to-add progress.
24. An icon and colour picker for each habit.
25. A reminder time per habit, wired into the reminder job.
26. A template library of about 50 habits, searchable by goal, replacing the four starter packs.
27. Edit a habit at any time, keeping its history (owner decision).
28. Pause or archive a habit without losing its streak, with an archive list.
29. A cue for each habit ("After I pour coffee, I will…") shown on its row.
30. Start and end dates, for 30-day challenges, with a countdown.

### Batch 4: The completion moment and motivation
31. A designed completion animation: the check draws, the ring fills, the row settles, with a matching vibration.
32. Milestone moments at 7, 30, 100 and 365 days: a full-screen card that can be shared.
33. Streak shield becomes a choice ("You missed yesterday. Use your shield?") instead of being applied silently.
34. An end-of-day recap sheet.
35. A level page: what each level means, what is next, and an XP history.
36. An achievements gallery, with locked ones shown as outlines.
37. An optional one-tap mood note on completion, which feeds insights.
38. A comeback flow after three or more days away.
39. Perfect week and perfect month recognition on the week strip.
40. A refined optional sound set with three themes.

### Batch 5: Habit detail and history
41. A full habit page in place of the small dialog.
42. A month calendar on the habit page, with streak runs highlighted.
43. Per-habit charts: completion rate over twelve weeks, and best weekday.
44. A notes timeline with search.
45. A year heatmap per habit.
46. A 24-hour grace period to fill in a missed day (owner decision).
47. A share card for a single habit.
48. Plain-language insights per habit.
49. The focus timer moves into the habit page and keeps a session history.
50. A link for every habit, so the back button and bookmarks work.

### Batch 6: Stats and insights
51. Stats rebuilt as a dashboard with a period switcher: week, month, year, all time.
52. Charts drawn in-house as SVG, with hover and tap detail, replacing Chart.js.
53. A full-width year heatmap with month labels and day detail.
54. A completion-rate trend line compared with the previous period.
55. A category balance view.
56. A guided weekly review.
57. A monthly and yearly review told as a short story.
58. Suggestions drawn from the data ("Meditation is slipping. Try mornings?").
59. CSV export and a redesigned PDF report.
60. A personal records wall.

### Batch 7: Landing page and onboarding
61. A hero with real product imagery in device frames.
62. Feature sections that demonstrate themselves as you scroll.
63. A "How it works", pricing ("free") and questions section. No invented testimonials.
64. An onboarding goal picker that suggests first habits.
65. A redesigned sign-up flow, with sign-in by emailed link as an option.
66. Email verification, with a friendly in-app banner until it is done.
67. A site footer and a "What's new" page.
68. The landing demo becomes a full mini-app with a week of sample history, so visitors can try Stats and streaks before signing up. (Search-engine basics ship alongside it but do not count as the change.)
69. A designed install experience, with instructions for iPhone.
70. App screenshots in the install dialog, and a dark link-preview image.

### Batch 8: Navigation, speed and power use
71. A command palette (Ctrl or Cmd + K).
72. Keyboard shortcuts throughout, with a cheat sheet on "?".
73. Animated transitions between Home, Stats and Profile.
74. A sync indicator showing unsent changes and when the app last synced, with a retry button.
75. Search across habits and notes.
76. `app.js` split into modules that load per screen, for a faster first load.
77. Instant start from cache, with a "new version available" prompt.
78. A desktop layout with a left sidebar and a three-column dashboard on wide screens.
79. A tablet layout.
80. An in-app notification centre for reminders, milestones and shield use.

### Batch 9: Profile, settings and trust
81. A redesigned Profile with an identity header and summary.
82. Settings grouped into sections, with search.
83. Personalisation: six accent colours, compact or comfortable density, text size.
84. Reminder settings: choose the times, quiet days, and reminders on more than one device.
85. Account management: change name, email and password, and confirm identity in place when deleting the account.
86. Import from CSV, and a full data export.
87. Regional settings: first day of the week, date and time format.
88. A second accessibility pass: screen-reader audit, a high-contrast theme, an in-app reduce-motion switch.
89. A privacy dashboard showing everything stored, with controls.
90. An in-app help centre with searchable guides and a contact link.

### Batch 10: Sharing and brand finish
91. Share cards in several designs and sizes: story, square and wide.
92. An opt-in public progress page with its own link (owner decision).
93. An accountability partner: two people who can see each other's streaks (owner decision).
94. Challenges that can be joined from a shared link (owner decision).
95. A badge on the app icon showing habits left today, and richer home-screen shortcuts.
96. Add reminders to a calendar, by file or Google Calendar link.
97. A brand pass: refined logo, full icon set, splash screens, line-art empty states.
98. A voice and tone guide, applied to every piece of text.
99. Designed error states: a branded "page not found", an offline page, and friendly screens for every failure the app can hit.
100. A final finish: screen-by-screen visual check and fixes, with a performance budget and screenshot comparison enforced by the GitHub tests (baseline images are generated on the GitHub runner, since Windows renders text differently).

## Builder's calls (made here so the plan does not have to guess)

- **History is never re-judged.** When a habit's schedule or target changes (22, 23, 27, 30), the change applies from that day forward. Each habit keeps a short dated list of its past schedules, and a streak is worked out using the schedule that was in force on each day. Old habits with no list behave exactly as today.
- **Partial progress is not "done".** For measurable habits (23), 5 of 8 shows as progress and counts toward a streak only when the target is reached.
- **Paused days are skipped** (28): they neither break nor extend a streak.
- **Reminders stay a digest** (25, 84). A reminder time is chosen to the hour. The job stays hourly and sends at most one notification per person per hour, naming the habits due. No more frequent schedule.
- **Start-up stays network-first** (77), with the cache used after 1.5 seconds on a slow connection and a "new version available" prompt. New habit fields are optional, so a one-version-old copy of the app still reads new data safely.
- **The notification centre is built on the device** (80): milestones, level-ups and shield use are known to the app, and received reminders are logged by the service worker. Nothing new is stored on the server.
- **The icon badge** (95) works only once the app is installed and updates when the app is open or a reminder arrives. It is weak on iPhone; that limit is accepted.
- **Mood notes** (37) use five line-drawn faces from the icon set, no emoji.
- **Sharing with others** (92 to 94) can only show a copy that the sharer's own app writes, so it updates when they open the app, and by default shows numbers only, never habit names. Rules for it are tested with the Firestore emulator on GitHub only, so the local suite keeps having no dependencies.
- **Splitting app.js** (76) puts modules in a `js/` folder, and `tools/deploy.js` is changed to publish that folder.
- **No Cloud Function is involved.** `functions/index.js` cannot be deployed as it stands (it has no package.json), and reminders are designed to come only from the GitHub job. Whether an old copy is still running in Firebase could not be confirmed from here, so it is checked before item 25.

## Left to the builder

- The exact visual values in batch 1 (sizes, colours, shadows), within the anti-goals above.
- Test design for each item.
- Data field names for new habit properties, provided they are additive and optional.
- The order inside a batch, and swapping an item for one of equal size if it turns out to be impossible, with the swap reported to the owner.

## Known risks

- Batch 1 touches every screen. It is done one token group at a time, each with screenshot review, to avoid a big-bang restyle.
- Items 22, 23 and 25 change what "done today" means. The reminder job (`scripts/reminder-logic.js`) and streak logic must change with them in the same commit.
- Item 76 (splitting `app.js`) is the largest structural change. It is scheduled after the UI work that would otherwise conflict with it, and before batch 9.
- The project's Git history is currently stored inside the owner's Windows user-folder repository. This should be untangled before long, and is tracked separately from this roadmap.
