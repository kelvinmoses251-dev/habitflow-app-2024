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
