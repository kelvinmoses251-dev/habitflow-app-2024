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
