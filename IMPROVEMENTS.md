# Habitly improvement ledger

Every entry shipped to production (https://habit-tracker-demo-34c0a.web.app) and, where it touches the
logged-in app, is covered by `node tests/smoke.js` (headless browser + in-memory Firebase).
Deploy with `node tools/deploy.js` (add `--rules` for Firestore rules).

| # | Area | What changed | Why |
|---|------|--------------|-----|
| 1 | Conversion | Live "try it before you sign up" landing demo; demo habits/ticks carry into the new account | New visitors hit a sign-in wall with no preview of the product |
| 2 | Trust | Streak shield only protects a *real* streak. New users no longer get a fake 2-day streak with their shield burned on day one | Found by the new test harness: ticking your first habit showed "2" and a "Streak Freeze activated" toast |
| 3 | Retention | Streak shield now actually recharges after 7 days (Profile showed "Recharges Weekly" but nothing did it) and shows "Recharges in N days" | Promise in the UI had no implementation |
| 4 | Correctness | "Today" is now the user's local calendar day, not UTC | Days rolled over at 7pm in New York / 1am in Lagos, silently breaking streaks and mis-dating heatmaps |
| 5 | Integrity | Un-ticking refunds the 25 XP and the +100 Daily Master bonus is once per day | Tick/untick/re-tick farmed unlimited XP and levels |
| 6 | Integrity | Per-account state (XP, shields, frozen days) is reset when the signed-in user changes | Signing into a second account in one tab showed, and could write, the first user's XP |
| 7 | Security | Habit names are HTML-escaped in "Recently Deleted" | A habit named `<img onerror=...>` executed script |
| 8 | Security | Firestore: `users/{uid}` docs (email + push token) are owner-only; a habit's `userId` can't be reassigned | Any signed-in user could read every user's email and FCM token |
| 9 | Speed | HTTP caching: `no-store` on everything became revalidate-with-ETag for code and 1 week for images; deploy ignore-list added | Returning visitors re-downloaded ~200KB on every visit |
| 10 | Speed | Removed ~900KB of JS from first load: dead html2canvas, never-used `Sortable@latest`, unused Firebase Storage; Chart.js / jsPDF / Cropper now load on demand | Render-blocking scripts most sessions never use |
| 11 | Speed | One font request instead of an `@import` chain + an unused family; Firebase SDK `modulepreload`; Chart.js warmed at idle so Stats opens instantly | Shorter critical path on mobile data |
| 12 | Look & feel | Share story card and charts render in the brand font (the old "Inter" was never actually downloaded, so they fell back to a system font) | Shared cards looked inconsistent with the app |
| 13 | Activation | Empty account shows 4 one-tap **starter packs** (Morning Reset, Get Fit, Calm Mind, Learn Daily); the first habit's checkbox pulses until ticked | A new user faced a blank list plus a blank form |
| 14 | Retention | **Forgot password?** flow (there was none: forgetting a password meant being locked out for good) | Account recovery |
| 15 | Conversion | Human-readable auth errors ("That email and password don't match. New here? Tap Sign Up.") instead of `Firebase: Error (auth/invalid-credential).`; show/hide password; autofill hints so password managers work | Raw errors and missing autofill are top reasons people bounce off sign-up |
| 16 | Retention | **Streak-at-risk banner**: from 4pm, if a daily habit has a live streak and isn't ticked, Home says exactly which ("7-day streak on “Evening run” ends in 2h 16m") and tapping it jumps to that habit | Loss aversion at the moment it matters, with zero backend |
| 17 | Conversion | Reminders are asked for **after the first completed habit** (and at most weekly), not the instant you sign in; blocked-permission now explains itself | A cold permission prompt at login burns the browser's one-shot prompt before the user has any reason to say yes |
| 18 | Look & feel | Dark mode follows the **system setting** by default (saved choice still wins), applied before first paint so there's no light flash | Dark-mode users saw a white flash and had to find the toggle |
| 19 | Control | **Sound effects** and **Vibration** toggles in Settings (the app played sounds/buzzed on every tick with no off switch) | Respect for users in quiet places; accessibility |
| 20 | Correctness | When a shield is auto-applied on app open, the streak number now updates immediately (it kept showing the broken value until the next habit write) | Found when the test mock was made faithful to real Firestore behaviour |
| 21 | Growth | **Link previews**: Open Graph + Twitter card tags and a designed 1200×630 `og-image.png` (source: `tools/og-image.html`). Pasting the app link into WhatsApp / X / Slack now shows a rich card instead of a bare URL | The only way people discover the app is someone pasting the link |
| 22 | Growth | The shareable story card now prints the app URL in its footer pill | The 9:16 story was the best growth asset and carried no link back |
| 23 | Growth | Share text includes the streak count and the link in every share path (the file-share path dropped the link), and cancelling the share sheet no longer logs an error | A share with no link can't convert |
| 24 | Accessibility | Every habit control has an accessible name that includes the habit ("Mark Evening Run complete", "Edit Evening Run"…); all 9 modals are real dialogs (`role=dialog`, `aria-modal`, label); toasts are announced; form fields are labelled; nav marks `aria-current` | Screen readers heard unlabeled icon buttons and unnamed checkboxes |
| 25 | Accessibility | **Escape closes** the top-most modal/overlay | Keyboard users were trapped in dialogs |
| 26 | Accessibility | Muted text raised to WCAG AA contrast (2.7:1 → 5:1 light, 3.1:1 → 5.4:1 dark) | Helper text was hard to read, especially outdoors |
| 27 | Accessibility | Visible keyboard focus ring everywhere; global `prefers-reduced-motion` support | Keyboard focus was invisible; motion-sensitive users had no relief |
| 28 | Engagement | **Insights** card on Stats: momentum vs last week ("Up 33%"), strongest and weakest weekday, best streak ever, most consistent habit: all computed locally from the user's own data | The Stats tab was charts with no conclusions |
| 29 | Measurement | **Privacy-first analytics**: anonymous funnel events (landing view → demo tick → sign-up → habit added/completed → share, reminders, streak-risk) with no names, emails or habit text. Honours Do Not Track / Global Privacy Control, plus an in-app "Share anonymous usage data" opt-out. SDK is lazy-imported so it can never block the app | There was no way to tell whether any of these changes helped |
| 30 | Look & feel | **Auto emoji per habit** from its name ("Drink water" , "No phone in bed" , "Learn Spanish" ), falling back to the category icon; word-start matching so "Start" isn't "art" | The list looked identical for every habit; zero user effort needed |
| 31 | UX | **Undo** on removing a habit (7-second toast action) | Deleting was one tap with no obvious way back (it was buried in Profile → Recently Deleted) |
| 32 | PWA | Home-screen **shortcuts** ("Today's habits", "My stats") in the manifest | Long-press the app icon to jump straight in |
| 33 | Polish | Tour copy says 11 life categories (the dropdown has 11); habit names capped at 60 characters | Copy mismatch; very long names broke the layout |
| 34 | Accessibility | Confetti respects `prefers-reduced-motion` | Motion-sensitive users still got full-screen confetti |
| 35 | Reliability | **Offline-first data**: Firestore persistent local cache (IndexedDB, multi-tab). Every UI write is now non-blocking (`backgroundWrite`) because a Firestore write promise only resolves on *server* acknowledgement, which never comes offline. Ticking, XP, add/edit/delete/undo, starter packs, journal and avatar all work with no connection and sync later | Previously several flows would hang on "Adding…/Saving…" until the network returned |
| 36 | Reliability | **Real service worker**: network-first app shell + cached Firebase SDK/CDN libs, so the app opens with no connection after one visit (the old worker was a pass-through that cached nothing). Firestore/Auth traffic is never touched | Habit apps get used on trains, in lifts and on patchy mobile data |
| 37 | UX | **Offline banner** ("Changes are saved on this device and will sync automatically") and a "Back online" toast | People need to know their taps are safe |
| 38 | Bug fix | Tapping a reminder notification now **opens the app** (there was no `notificationclick` handler) and the notification icon path is fixed (`/icons/icon-192.png` didn't exist) | Reminders were a dead end |

_Verified against the real Firestore SDK (not the mock): the offline cache keeps working, via memory fallback, where IndexedDB is unavailable (`tests/scenarios/12-idb-fallback.js`)._

### Design pass: a product, not a demo

| # | Area | What changed | Why |
|---|------|--------------|-----|
| 39 | Design | Stylesheet rebuilt as one system: neutral warm-grey surfaces, a single muted indigo accent, flat fills, 1px borders, 8 to 12px radii. No gradients, glow shadows, backdrop blur, 3D badges or endless animation (27 gradient rules removed) | The previous look was the stock "purple gradient + glow" style that reads as generated |
| 40 | Design | **No emoji anywhere.** 197 emoji replaced by a 30-icon line sprite and plain text; category icons that did not match their category (Mind was a dollar sign) were fixed | Requested; emoji used as icons are the biggest tell |
| 41 | Design | Typeface changed from Plus Jakarta Sans (800 weights) to Inter 400 to 700 with tabular numbers; one consistent type scale | Calmer, more legible, better numerals in stats |
| 42 | Design | Home summary merged from two heavy cards into one quiet block: streak, level, shield and a single progress bar; tier is a text tag instead of a 3D medal | Less visual noise, clearer hierarchy |
| 43 | Copy | Voice rewritten to plain, specific sentence case: no exclamation marks or hype ("You're unstoppable!"); fake level "perks" that unlocked nothing removed; level titles are plain (Starter, Builder, Steady...) | Copy should describe, not cheer |
| 44 | Copy | **Push reminders** no longer insult users ("I dare you not to complete this habit you lazy dude", "Your future self is weeping") and now read as short, useful prompts | Hostile copy sent straight to people's lock screens |
| 45 | Design | Celebrations are quiet: no confetti (library removed), no animated 3D trophy; "All habits done" is a plain dialog. Sound effects are now opt-in | An arpeggio and confetti on every task is the opposite of calm |
| 46 | Brand | Share story card, Open Graph preview and PWA icons redrawn flat and emoji-free, generated reproducibly by `tools/make-assets.js` | Brand assets matched the old gradient style |
| 47 | Quality | `tests/scenarios/13-design.js` fails the build if emoji reappear in any source file or rendered screen/dialog, or if gradients, blur, glow or endless animation return | Keeps the direction from regressing |

### Guided tour and a livelier interface

| # | Area | What changed | Why |
|---|------|--------------|-----|
| 48 | Onboarding | **Interactive spotlight tour** (`coach.js`): dims the screen, cuts out the real button or area, and a card with an arrow says what it is for and what to tap, one stop at a time (7 stops). Adapts to the screen: bottom nav on mobile, top nav on desktop, starter sets instead of a habit row for an empty account. Waits for data to load, is keyboard and screen-reader operable (arrows, Tab trap, Escape), skippable, and ends by opening the New habit form for an empty account | The old tour was a text-only slide deck that never pointed at anything |
| 49 | Discoverability | A **help button** in the header and a "Guided tour" row in Profile replay the tour any time | New users forget; they should be able to ask |
| 50 | UI | **Progress ring** for today plus a **7-day strip** (filled = every daily habit done, tinted = some) on a tinted hero card with streak, level and shield beneath | The old two-card header was dense and static; this shows today and the week at a glance |
| 51 | UI | **Display serif** (Instrument Serif) for headlines and big numerals; Inter stays for everything you read or tap; landing headline gets one italic accent word | Gives the product a voice and hierarchy without decoration |
| 52 | UX | **New habit collapses to one row** once you have habits (open for an empty list, and while you build your first three), so your list is what you see first | The big form pushed the actual habits below the fold |
| 53 | Motion | Short, one-shot motion with a purpose: ring fills, the completed row highlights, the check pops, rows and cards rise in, and the all-done check draws itself. Respects reduced motion and the design guardrails (nothing loops) | The interface should respond to what you do |
| 54 | UX | Category-coloured accent bar on each habit row; warm colour reserved for streaks; active-tab indicator in the bottom nav | Scannability and a little warmth, used sparingly |
| 55 | Control | **Ask before completing** setting (on by default, as before); switch it off to complete in one tap | Kept the confirmation you chose, but made it optional |

### Professional layout pass

| # | Area | What changed | Why |
|---|------|--------------|-----|
| 56 | Layout | **Desktop dashboard.** From 1024px, Home is two columns: today's list on the left, the progress summary pinned on the right. Stats puts Insights and the weekly report side by side and gives the charts the full width. Below 1024px everything stacks as before | A single 600px column on a 1280px screen read as a phone app stretched out |
| 57 | UI | **One dark focal block per screen.** The summary is now a flat ink card (deep indigo in dark theme) with the ring, week strip, serif numerals and level bar on it; the nested white stats box is gone, replaced by hairline dividers | Clear hierarchy: your day first, everything else second. Flat colour, no gradient or glow |
| 58 | UI | **Habit rows are lighter.** Hairline-separated rows instead of a bordered box per habit, round check circles, category shown as a tinted icon chip, streak in the warm accent, "Locked" reduced to an icon (words kept for screen readers). Timer, edit and delete appear on hover or keyboard focus with a mouse and stay visible on touch | Less visual weight per row, so six or twelve habits scan quickly |
| 59 | Navigation | Segmented top navigation (active tab raised), a primary **New habit** button in the top bar and an **N** shortcut (ignored while typing, in dialogs, with modifier keys, or during the tour) | A power-user path to the most common action |
| 60 | Landing | Restructured: top bar with Sign in, full-width serif headline, sign-up card beside the demo on a tinted stage, feature row with icon tiles beneath. On phones the order is unchanged (demo first, account card last) | The old two-column page had misaligned tops and a weak first screen |
| 61 | Charts | Weekly bars are rounded and solid with today in the full accent, quiet grid with no axis lines, readable tooltip; the category chart has separated segments | The outlined pale bars looked like a default chart |
| 62 | Tour | The spotlight cut-out follows each target's own corner radius | The rounder summary card exposed a square cut-out |
| 63 | Quality | `tests/scenarios/16-layout.js`: no horizontal scroll from 320 to 1536px on landing, home, stats and profile; dashboard columns and the stacking breakpoint; ink summary in both themes; quick add by button and key; hover/focus reveal; landing structure | Layout regressions are invisible to the other tests |

### Roadmap batch 1: visual foundation

Roadmap: `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md`.

| # | Area | What changed | Why |
|---|------|--------------|-----|
| R1 | Design system | One scale for type (12 steps on whole pixels), corners and colour. Every font size, radius and colour in the stylesheet is now a named token, and a test fails if a one-off value is added | 31 slightly different text sizes and 8 corner sizes had crept in, which is what makes an interface feel unpolished |
| R2 | Design system | Three levels of depth (cards, floating things, dialogs) built from soft neutral shadows and hairline borders. A new guardrail fails the build if any shadow is coloured or blurrier than 48px | Depth was assigned ad hoc with four overlapping shadow styles; nothing stopped it drifting into glow |
| R3 | Design system | Full colour scales (15 neutrals, 10 accent steps) behind every colour, and a rebuilt dark theme where raised things (dialogs, pop-ups) sit on lighter surfaces. Contrast is tested in both themes: body text at least 7:1, secondary text and buttons at least 4.5:1 | Dark mode was one flat near-black, so dialogs and cards had no sense of height; colours were chosen one at a time |
| R4 | Design system | One icon set: the eleven category icons and the row action icons are drawn from the shared sprite at one stroke weight, with clearer drawings (a dumbbell for Fitness, a lightbulb for Mind, a folder for Project). Each category has a lighter colour for dark mode, tested to at least 3:1 | Category icons were hand-written strings at a heavier stroke than the rest, and several were hard to see in dark mode (2.4:1) |
| R5 | Speed and privacy | Fonts are served from the site itself (four small files, about 175KB, cached for a year) instead of from Google Fonts. Text appears at once, the app shell works offline with its real typeface, and no font request leaves the site. The privacy policy no longer lists Google Fonts | Every first visit made two extra connections to Google before text could render in the brand font |
| R6 | Design system | Buttons and fields have every state designed: three sizes, at least 44px tall on phones, a pressed state, a busy state that says what is happening ("Signing in"), and an error state. A failed sign-in now marks the field that is wrong and gives the reason directly under it, as well as in the toast | Buttons were 39px on phones (below the comfortable touch size), had no pressed feedback, and sign-in errors appeared only in a toast that vanishes |
| R7 | Design system | The four dropdowns (category and frequency, in New habit and Edit) are now a designed list: each category shows its icon in its colour, the current choice is ticked, and it works fully by keyboard (arrows, Home, End, type a letter, Enter, Escape). Leaving a required one empty says "Choose a category." on the field instead of a browser pop-up | Browser-default dropdowns look different on every device and were the least designed thing on the page |
| R8 | Design system | One dialog system for all ten dialogs. On phones they are sheets that rise from the bottom edge, with a handle you can drag down to dismiss and full-width buttons in thumb reach. On desktop they are centred and fade in. Every dialog now moves focus inside, keeps Tab inside, returns focus where it was, stops the page behind scrolling, and closes on a backdrop click by running its own Cancel | Dialogs floated mid-screen on phones with small buttons; six of the ten ignored backdrop clicks, none managed focus, and the page scrolled behind them |
| R9 | Design system | Toasts redesigned: an icon for the kind of message, a thin bar that shows how long it will stay, and it waits while you hover or touch it. Swipe one sideways to dismiss it. At most three show at once. On phones they sit in thumb reach above the navigation, and move to the top while a sheet is open so they never cover its buttons | Toasts were plain dark pills at the top of the screen that could stack without limit and vanished while you were still reading |
| R10 | Speed and feel | Loading shows the shape of the page that is about to appear (top bar, summary, rows) as still blocks instead of a spinner on a blank screen, and Today shows four placeholder rows until your habits arrive. The empty state and the New habit form no longer flash open before the app knows your list is empty | A spinner on an empty page makes loading feel longer, and the endless spin was the last looping animation in the app |
