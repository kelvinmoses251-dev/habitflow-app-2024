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
| 30 | Look & feel | **Auto emoji per habit** from its name ("Drink water" 💧, "No phone in bed" 📵, "Learn Spanish" 🎓), falling back to the category icon; word-start matching so "Start" isn't "art" | The list looked identical for every habit; zero user effort needed |
| 31 | UX | **Undo** on removing a habit (7-second toast action) | Deleting was one tap with no obvious way back (it was buried in Profile → Recently Deleted) |
| 32 | PWA | Home-screen **shortcuts** ("Today's habits", "My stats") in the manifest | Long-press the app icon to jump straight in |
| 33 | Polish | Tour copy says 11 life categories (the dropdown has 11); habit names capped at 60 characters | Copy mismatch; very long names broke the layout |
| 34 | Accessibility | Confetti respects `prefers-reduced-motion` | Motion-sensitive users still got full-screen confetti |
