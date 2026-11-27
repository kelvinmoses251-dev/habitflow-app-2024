# Batch 7: Landing page and onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A visitor understands Habitly in one scroll, can try a real slice of it, signs up with less friction, and lands in an app that helps them pick a first habit.

**Architecture:** The landing page stays the signed-out state of `index.html`. Everything new on it lives in one block (`#landing-more`) below the existing top (headline, demo, sign-in card), drawn by a new module `landing.js` (scroll reveals, questions, install help) so `app.js` only grows where it must (sign-in, verification, goal picker). Pure logic that can be tested without a browser goes in `onboarding.js` (goals and first habits, install-platform detection, email-link state). Screenshots are real: taken from the app by the gallery tool and stored as top-level `.webp` files.

**Tech stack:** Plain ES modules and CSS. Firebase Auth email-link and email-verification calls. No new library.

**Spec:** `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md` (Batch 7, items 61-70)

## Global Constraints

- No emoji, gradients, glow, blur, text-shadow or infinite animation; every border-radius a token; 44px touch targets on phones; every dialog has a handle, a `[data-dismiss]` button and closes on Escape.
- Nothing fake: no invented testimonials, user counts, ratings or reviews. Pricing says what is true: free, no ads, no card.
- Returning visitors (who have signed in on this device before) still see only the sign-in card.
- The landing page must not slow the app: pictures are lazy-loaded with fixed sizes (no layout shift), and nothing new loads for a signed-in user.
- Reveal-on-scroll is an enhancement: with reduced motion, or without JavaScript observers, every section is simply visible.
- Sign-in by emailed link and verification must fail soft: if the owner has not switched the provider on, the person is told plainly and can still use a password or Google.
- The account email is private: the published contact address is info.habitly@gmail.com; the operator is named only as "Habitly".
- New stored information is named in `privacy.html` in the same change. `track()` events carry counts and kinds only.
- Each change: failing test first, its own scenarios plus neighbours and logic tests green, a row in `IMPROVEMENTS.md` (from R67), one commit in its own command. Full suite on a snapshot after tasks 3, 7 and 10 and on the real tree before merge.

## Review Focus

1. Sign-in by link opened on a different device or browser than the one that asked for it (no saved email), an expired or reused link, and a link opened while already signed in as someone else.
2. An unverified account: nothing is locked, the banner never blocks ticking a habit, "Send again" cannot be hammered, and a Google account (always verified) never sees it.
3. The goal picker for an account that already has habits (from the demo, from another device, from a starter pack): it must not appear, and must never add duplicates.
4. Narrow phones (320px), dark theme, reduced motion and slow connections on the landing page: no sideways scroll, no layout shift from pictures, no content hidden forever because an observer never fired.
5. The mini-app demo's sample history: it must never be written to a real account as if it happened (only what the visitor did today carries over, as before).

---

## Tasks (build order)

### Task 1 (item 68): The demo becomes a mini-app with a week of history
**Files:** `landing-demo.js`, `index.html`, `style.css`, `tests/scenarios/49-landing-demo.js`. Plus search basics: `robots.txt`, `sitemap.xml`, structured data, `tools/deploy.js` (publish `.txt`/`.xml`).
The demo gets two tabs, Today and Stats. Sample habits arrive with six earlier days of history, so the streak, the week strip, a small year-style grid and a completion figure all have something to show and move when a habit is ticked. Only today's ticks and the visitor's own habits are carried into a new account.

### Task 2 (item 61): Real product pictures in device frames
**Files:** `tests/scenarios/98-gallery.js` (shot scenarios), `shot-*.webp`, `index.html`, `style.css`, `tests/scenarios/50-landing-page.js`.
Three pictures taken from the app (Today on a phone, Stats on a phone, a habit's page in a browser frame), light and dark, each in a CSS-drawn frame, lazy-loaded with width and height set.

### Task 3 (item 62): Feature sections that demonstrate themselves
**Files:** create `landing.js`; `index.html`, `style.css`.
Four sections (tick and the ring fills; a streak with a shield; the year filling in; the weekly review), each a small built piece that plays once when scrolled into view.

### Task 4 (item 63): How it works, pricing and questions
Three steps; one honest pricing box; six questions as native disclosure widgets, with matching structured data.

### Task 5 (item 67): Footer and a "What's new" page
**Files:** `whats-new.html`, footer in `index.html`, link in Profile, `tests/scenarios/20-legal.js` additions.

### Task 6 (item 65): Redesigned sign-in, with a link by email
**Files:** create `onboarding.js` + `tests/onboarding.test.js`; `app.js`, `index.html`, `tests/firebase-mock.js`, `privacy.html`.
**Produces:** `linkEmailKey`, `rememberLinkEmail(store, email)`, `takeLinkEmail(store)`, `authStep(state, event)`.
One card: Google, or email. After the email: "Email me a sign-in link" (primary) or "Use a password". The link returns to the app and signs in; on another device it asks for the email again.

### Task 7 (item 66): Email verification with a friendly banner
A password sign-up sends a verification email. A slim banner in the app says where it went, with "Send again" (once a minute) and "I have confirmed"; it never blocks anything and goes when the address is verified.

### Task 8 (item 64): A goal picker that suggests first habits
**Produces:** `GOALS`, `habitsForGoals(goalIds)` (three to five first habits, no duplicates, from `templates.js`).
Shown once to an account with no habits: pick what you want more of, see the suggested habits, untick any, add them.

### Task 9 (item 69): A designed install experience
**Produces:** `installPlatform(ua, standalone, canPrompt)` -> `'installed' | 'prompt' | 'ios' | 'ios-other' | 'manual'`.
An Install dialog with the right steps for the device: one button where the browser offers it, drawn steps for iPhone Safari, a note for other iPhone browsers. Reachable from the landing page and Profile (always visible now).

### Task 10 (item 70): Screenshots in the install dialog, and a dark link preview
`manifest.json` gains `screenshots` (narrow and wide, from Task 2's pictures as PNG); `tools/make-assets.js` draws a dark `og-image.png`.

### After the tenth change
Gallery `b7-*`, independent review, one fix pass, merge, deploy, live check, push, pictures, report with the owner's console steps.
