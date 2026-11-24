# Batch 1: Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship roadmap items 1 to 10: one coherent visual system (tokens, depth, colour, icons, fonts, controls, dialogs, toasts, loading) so every screen reads as a premium product.

**Architecture:** `style.css` already has tokens and a flat style; this batch completes and enforces that system rather than replacing it. Behaviour that several screens share (dialogs, toasts, custom select, busy buttons) moves out of `app.js` into one new top-level module, `ui.js`. Existing markup, ids and the `.hidden` class stay the source of truth, so the 471 existing checks keep working.

**Tech Stack:** Plain HTML, CSS, ES modules. No build step, no npm dependencies. Tests: `node tests/smoke.js` (headless browser, in-memory Firebase) and `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-24-habitly-100-improvements-design.md`

## Global Constraints

- No emoji, gradients, glow, blur (`filter`, `backdrop-filter`), `text-shadow`, or animation with `infinite` iteration, anywhere. `tests/scenarios/13-design.js` must keep passing.
- Every change works in light and dark, at 320px, 390px, 768px and 1280px wide, with no horizontal scroll (`tests/scenarios/16-layout.js`).
- Motion is one-shot and at most 240ms, and is removed under `prefers-reduced-motion: reduce`.
- Text contrast: body text at least 7:1, secondary and muted text at least 4.5:1, in both themes.
- Touch targets are at least 44 by 44 CSS pixels on coarse pointers.
- New shipped files sit at the project root or in `fonts/`. `tools/deploy.js` publishes nothing else.
- Each task: failing test first, then the change, then the whole suite green, then one row in `IMPROVEMENTS.md` under a new heading `### Roadmap batch 1: visual foundation` numbered R1 to R10, then one commit.
- When `style.css`, `app.js` or `ui.js` changes, bump its `?v=` query in `index.html`, `privacy.html` and `terms.html` wherever it is referenced.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. **A font file fails to load** (first visit offline, blocked request): text must render at once in the system fallback with no overflow at 320px. Pinned in Task 5.
2. **Very long text in the new components** (a 60-character habit name in the select, a long toast): it wraps and never causes horizontal scroll. Pinned in Tasks 7 and 9.
3. **Keyboard-only and screen-reader use** of the custom select and dialogs: full operation with Tab, arrows, Enter, Escape, and correct roles. Pinned in Tasks 7 and 8.
4. **Reduced motion**: sheets, toasts and buttons show no animation or transition. Pinned in Tasks 8 and 9.
5. **Dark theme parity**: every new component is checked in dark as well as light, including contrast. Pinned in Tasks 3, 7, 8, 9 and 10.

## File Structure

| File | Responsibility |
|---|---|
| `style.css` (modify) | All tokens and component styles |
| `ui.js` (create) | Shared UI behaviour: `toast`, `setBusy`, `enhanceSelect`, `watchDialogs` |
| `app.js` (modify) | Imports from `ui.js`; category icons become sprite references |
| `index.html` (modify) | Icon sprite, font preload, skeleton markup, `data-dismiss` attributes |
| `privacy.html`, `terms.html` (modify) | Font links, version bumps, one privacy sentence |
| `fonts/*.woff2` (create) | Self-hosted fonts |
| `firebase-messaging-sw.js` (modify) | Precache fonts and `ui.js` |
| `tools/deploy.js`, `firebase.json` (modify) | Publish `fonts/`, long cache for fonts |
| `tests/scenarios/21-foundation.js` (create) | Tasks 1 to 6 and 10 |
| `tests/scenarios/22-components.js` (create) | Tasks 7 to 9 |
| `tests/scenarios/13-design.js` (modify) | Shadow guardrail |

Shared test helpers used below, defined once at the top of each new scenario file:

```js
const css = () => fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const rules = () => css().split(/\/\* ── Base/)[1];          // everything after the token blocks
const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
```

---

### Task 0: Keep the "before" pictures

**Files:** Modify `.gitignore`

- [ ] **Step 1:** Add `.gallery/` to `.gitignore`.
- [ ] **Step 2:** Run `GALLERY=1 node tests/smoke.js --only gallery --shots .gallery/before`. Expected: 43 PNG files in `.gallery/before`.
- [ ] **Step 3:** Commit `.gitignore` ("chore: ignore local screenshot galleries").

### Task 1: One set of design tokens (roadmap 1)

**Files:** Modify `style.css`; Create `tests/scenarios/21-foundation.js`

**Interfaces:**
- Produces (CSS custom properties on `:root`):
  - Type: `--fs-xs: .75rem; --fs-sm: .85rem; --fs-base: .95rem; --fs-md: 1.05rem; --fs-lg: 1.25rem; --fs-xl: 1.6rem; --fs-2xl: 2.2rem; --fs-3xl: 3rem`
  - Line height: `--lh-tight: 1.1; --lh-snug: 1.3; --lh-body: 1.55`
  - Spacing additions: `--sp-10: 2.5rem; --sp-16: 4rem` (existing `--sp-1` to `--sp-12` unchanged)
  - Radius addition: `--r-2xl: 20px` (existing `--r-sm` 6, `--r-md` 8, `--r-lg` 12, `--r-xl` 14, `--r-full` unchanged)
  - Motion: `--t-fast: .12s ease; --t-base: .2s ease; --t-sheet: .22s cubic-bezier(.2,.8,.2,1)`

- [ ] **Step 1: Write the failing test** in `21-foundation.js`:

```js
scenario('foundation: the stylesheet uses tokens, not one-off values', async () => {
  const body = rules();
  const sizes = [...body.matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^(var\(|clamp\(|inherit|1em|100%)/.test(v));
  check('every font size is a token', sizes.length === 0, [...new Set(sizes)].slice(0, 6).join(' '));
  const radii = [...body.matchAll(/border-radius:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => /\d+px/.test(v) && !/^var\(/.test(v));
  check('every radius is a token', radii.length === 0, [...new Set(radii)].slice(0, 6).join(' '));
  const hex = [...body.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map(m => m[0]);
  check('no colour is written outside the token blocks', hex.length === 0, [...new Set(hex)].slice(0, 6).join(' '));
});
```

- [ ] **Step 2:** Run `node tests/smoke.js --only "foundation: the stylesheet"`. Expected: 3 failures listing raw values (31 distinct font sizes, 8 radii, 10 hex colours today).
- [ ] **Step 3: Implement.** Add the tokens above. Replace every raw `font-size` with the nearest `--fs-*` step (two sizes within 0.05rem of each other collapse to one token; `clamp()` headline sizes stay). Replace raw radii with the nearest `--r-*` (2 to 5px become `--r-sm`; 10px becomes `--r-lg`; 24px becomes `--r-2xl`). Move the ten raw hex colours into named tokens in `:root` with dark counterparts (for example the share canvas `#111113` becomes `--canvas-bg`).
- [ ] **Step 4:** Run the whole suite, `node tests/smoke.js`. Expected: all pass. Then `GALLERY=1 node tests/smoke.js --only gallery --shots .gallery/t1` and compare `home_light`, `landing_light`, `stats_light`, `profile_light` and `modal_details` with `.gallery/before` by eye: sizes may shift by a pixel or two, nothing may break or reflow badly.
- [ ] **Step 5:** Add ledger row R1; commit ("Design tokens: one type, radius and colour scale").

### Task 2: Depth system (roadmap 2)

**Files:** Modify `style.css`, `tests/scenarios/13-design.js`

**Interfaces:**
- Produces: `--elev-1` (cards), `--elev-2` (popovers, toasts, sticky bars), `--elev-3` (dialogs, sheets). Light values: `--elev-1: 0 1px 2px rgba(20,20,24,.05), 0 1px 1px rgba(20,20,24,.03)`; `--elev-2: 0 2px 4px rgba(20,20,24,.05), 0 8px 20px rgba(20,20,24,.07)`; `--elev-3: 0 4px 8px rgba(20,20,24,.06), 0 24px 48px rgba(20,20,24,.14)`. Dark: same offsets with `rgba(0,0,0,.35)`, `.45`, `.6`.
- The old names `--sh-sm`, `--sh-md`, `--sh-card`, `--sh-lg` are removed and every use is mapped to one of the three levels.

- [ ] **Step 1: Write the failing test.** In the audit function of the "flat surfaces" scenario in `13-design.js`, add a shadow check, so it runs on every screen that scenario already visits:

```js
if (s.boxShadow && s.boxShadow !== 'none') {
  for (const layer of s.boxShadow.split(/,(?![^(]*\))/)) {
    const c = (layer.match(/rgba?\([^)]+\)/) || ['rgb(0,0,0)'])[0].match(/[\d.]+/g).map(Number);
    const px = layer.replace(/rgba?\([^)]+\)/, '').match(/-?[\d.]+px/g).map(parseFloat);   // x, y, blur, spread
    const ring = px[2] === 0;                                    // focus rings: no blur, may be accent-coloured
    if (!ring && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 12) bad.push('coloured shadow: ' + id);
    if (px[2] > 48) bad.push('shadow blur over 48px: ' + id);
  }
}
```

Also add to `21-foundation.js`:

```js
scenario('foundation: three elevation levels and nothing else', async () => {
  const shadows = [...rules().matchAll(/box-shadow:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^(none|var\(--elev-[123]\)|0 0 0 \d+px var\()/.test(v));
  check('every shadow is an elevation token or a focus ring', shadows.length === 0, shadows.slice(0, 4).join(' | '));
});
```

- [ ] **Step 2:** Run both. Expected: the new scenario fails (old `--sh-*` names in use); the guardrail passes or fails depending on current values, either is fine.
- [ ] **Step 3: Implement.** Define the three tokens, map cards to `--elev-1`, `.notif-ask`, `.toast`, sticky landing bar and the tour card to `--elev-2`, `.dialog` to `--elev-3`. Every card keeps its 1px `var(--border)` hairline.
- [ ] **Step 4:** Whole suite green; gallery to `.gallery/t2`, compare `home_light`, `home_dark`, `modal_confirm`.
- [ ] **Step 5:** Ledger R2; commit ("Depth: three elevation levels, with a shadow guardrail").

### Task 3: Colour ramps and a rebuilt dark theme (roadmap 3)

**Files:** Modify `style.css`, `tests/scenarios/21-foundation.js`

**Interfaces:**
- Produces primitives: neutrals `--n-0, --n-50, --n-100, --n-200, --n-300, --n-400, --n-500, --n-600, --n-700, --n-800, --n-900, --n-950` and accent `--a-50, --a-100, --a-200, --a-300, --a-400, --a-500, --a-600, --a-700, --a-800, --a-900`, with `--a-600: #4A3AB8` (the current brand colour, unchanged).
- Produces a new semantic token `--surface-3` (raised surface: popovers, dialogs in dark).
- Existing semantic names (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--primary`, and so on) keep their names and now point at primitives.
- Dark theme surfaces: `--bg: #0E0E10; --surface: #17171A; --surface-2: #1F1F23; --surface-3: #28282D`. In dark, `.dialog`, `.toast` and popovers use `--surface-3`, so height is shown by a lighter surface.

- [ ] **Step 1: Write the failing test:**

```js
scenario('foundation: colour ramps drive both themes, with readable contrast', async () => {
  const root = css().split(/\/\* ── Base/)[0];
  check('neutral ramp has 12 steps', (root.match(/--n-\d+:/g) || []).length >= 12);
  check('accent ramp has 10 steps', (root.match(/--a-\d+:/g) || []).length >= 10);
  for (const theme of ['light', 'dark']) {
    await boot({ seed: { ...signedIn(), ...(theme === 'dark' ? { theme: 'dark' } : {}) } });
    const v = JSON.parse(await ev(`JSON.stringify((() => { const s = getComputedStyle(document.documentElement), g = n => { const d = document.createElement('i'); d.style.color = 'var(' + n + ')'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      return { bg: g('--bg'), surface: g('--surface'), s3: g('--surface-3'), text: g('--text'), text2: g('--text-2'), muted: g('--muted'), primary: g('--primary'), on: g('--on-primary') }; })())`));
    check(`${theme}: text on surface is at least 7:1`, ratio(v.text, v.surface) >= 7, ratio(v.text, v.surface).toFixed(2));
    check(`${theme}: secondary text is at least 4.5:1`, ratio(v.text2, v.surface) >= 4.5);
    check(`${theme}: muted text is at least 4.5:1 on the page`, ratio(v.muted, v.bg) >= 4.5);
    check(`${theme}: button text is at least 4.5:1`, ratio(v.on, v.primary) >= 4.5);
    if (theme === 'dark') check('dark: raised surfaces are lighter than the page', lum(v.s3) > lum(v.surface) && lum(v.surface) > lum(v.bg));
  }
});
```

- [ ] **Step 2:** Run it. Expected: fails on the ramp counts and `--surface-3`.
- [ ] **Step 3: Implement** the primitives and remap the semantic tokens. Derive ramp steps so the existing light values stay within a few points of where they are today (this task must not visibly recolour the light theme); the visible change is the dark theme's layered surfaces.
- [ ] **Step 4:** Whole suite green (the existing muted-contrast test in `08-a11y.js` must still pass); gallery to `.gallery/t3`, compare every `*_dark` picture.
- [ ] **Step 5:** Ledger R3; commit ("Colour: full ramps and a layered dark theme").

### Task 4: One icon set (roadmap 4)

**Files:** Modify `index.html` (sprite), `app.js` (the `icons` object, `_icon`, `CATS`, and each place that renders `cat.emoji`), `landing-demo.js` if it renders category icons; Test in `21-foundation.js`

**Interfaces:**
- Produces: sprite symbols `i-cat-health`, `i-cat-mind`, `i-cat-social`, `i-cat-growth`, `i-cat-productive`, `i-cat-nutrition`, `i-cat-fitness`, `i-cat-reading`, `i-cat-saving`, `i-cat-relaxation`, `i-cat-project`, all `viewBox="0 0 24 24"`, drawn as strokes only so the shared `.icon` rule (stroke 1.75, round caps) applies.
- `CATS[key].icon` is the string `<svg class="icon" aria-hidden="true"><use href="#i-cat-KEY"/></svg>`. The property `emoji` and the inline `icons` object are deleted.

- [ ] **Step 1: Write the failing test:**

```js
scenario('foundation: category icons come from the one icon set', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  for (const k of ['health', 'mind', 'social', 'growth', 'productive', 'nutrition', 'fitness', 'reading', 'saving', 'relaxation', 'project'])
    check(`sprite has i-cat-${k}`, html.includes(`id="i-cat-${k}"`));
  check('no hand-written icon strings left in app.js', !/stroke-width="2"/.test(js));
  await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { a: { userId: 'u-test', name: 'Run', category: 'fitness', frequency: 'daily', completedDates: [], createdAt: '2026-01-05T10:00:00Z', order: 1 } }, users: {} } } });
  await waitFor(`!!document.querySelector('.habit-item')`);
  check('a habit row draws its category from the sprite', await ev(`!!document.querySelector('.habit-item .cat-ico use[href="#i-cat-fitness"]')`));
  check('the icon is 1.75 stroke', (await ev(`getComputedStyle(document.querySelector('.habit-item .cat-ico svg')).strokeWidth`)) === '1.75px');
});
```

- [ ] **Step 2:** Run it. Expected: all checks fail.
- [ ] **Step 3: Implement.** Draw the eleven symbols (fitness becomes a dumbbell, social two figures, growth a rising line; each must be recognisable at 16px). Replace every `cat.emoji` use. Remove `icons`, `_icon`, and the three overrides.
- [ ] **Step 4:** Whole suite green; gallery to `.gallery/t4`, check `home_list_light` and `stats_lower_light` at full zoom for icon clarity.
- [ ] **Step 5:** Ledger R4; commit ("Icons: categories drawn from one consistent set").

### Task 5: Self-hosted fonts (roadmap 5)

**Files:** Create `fonts/inter-var-latin.woff2`, `fonts/instrument-serif-latin.woff2`, `fonts/instrument-serif-italic-latin.woff2`; Modify `style.css`, `index.html`, `privacy.html`, `terms.html`, `firebase-messaging-sw.js`, `tools/deploy.js`, `firebase.json`

**Owner permission needed:** this task downloads three font files (Inter variable, Instrument Serif regular and italic, Latin subsets, about 150KB in total, SIL Open Font License) from `fonts.gstatic.com`, the same files the site loads today. The URLs are taken from the CSS at the Google Fonts link already in `index.html`.

**Interfaces:**
- Produces: `@font-face` rules for `'Inter'` (weight range 400 to 700) and `'Instrument Serif'` (400 normal and italic), each `font-display: swap`. `--font` and `--font-display` keep their values.
- `tools/deploy.js` stages tracked files matching `fonts/*.woff2` into `public/fonts/` in addition to top-level files.
- `firebase.json` adds a header rule: `**/*.woff2` gets `Cache-Control: public, max-age=31536000, immutable`.

- [ ] **Step 1: Write the failing test:**

```js
scenario('foundation: fonts are served from the site itself', async () => {
  for (const f of ['index.html', 'privacy.html', 'terms.html'])
    check(`${f} makes no Google Fonts request`, !/fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  await boot();
  await ev(`document.fonts.ready`);
  check('Inter is loaded', await ev(`document.fonts.check('500 16px Inter')`));
  check('the display serif is loaded', await ev(`document.fonts.check('italic 40px "Instrument Serif"')`));
  check('font files came from this origin', await ev(`performance.getEntriesByType('resource').filter(r => /\\.woff2/.test(r.name)).every(r => r.name.startsWith(location.origin)) && performance.getEntriesByType('resource').some(r => /\\.woff2/.test(r.name))`));
  check('the privacy policy no longer lists Google Fonts', !/Google Fonts/.test(fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8')));
});
scenario('foundation: text still renders and fits when the fonts cannot load', async () => {
  await send('Network.setBlockedURLs', { urls: ['*.woff2'] });
  try {
    await boot(); await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
    await sleep(400);
    check('headline is visible', await visible('.landing-title'));
    check('no horizontal scroll at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
  } finally { await send('Network.setBlockedURLs', { urls: [] }); }
});
```

Add to the dry-run check at the end of the task: `node tools/deploy.js --dry` lists three `fonts/…woff2` files.

- [ ] **Step 2:** Run both. Expected: the first fails on every check; the second passes or fails, either is fine.
- [ ] **Step 3: Implement.** Download the three files (after the owner's yes). Add the `@font-face` rules; add `<link rel="preload" as="font" type="font/woff2" crossorigin href="fonts/inter-var-latin.woff2">`; delete the three Google Fonts tags from each HTML file; add the font paths to the service worker's local precache set; change `deploy.js` and `firebase.json` as specified; in `privacy.html` change the processors bullet to name only jsDelivr and cdnjs.
- [ ] **Step 4:** Whole suite green, including `99-service-worker.js` and `20-legal.js`; `node tools/deploy.js --dry` shows the fonts.
- [ ] **Step 5:** Ledger R5; commit ("Fonts: self-hosted, no third-party font request").

### Task 6: Buttons and inputs with every state (roadmap 6)

**Files:** Create `ui.js`; Modify `style.css`, `app.js` (sign-in, sign-up, add-habit, save-note, crop-save handlers use `setBusy`), `index.html` (`<link rel="modulepreload" href="ui.js?v=1">`); Test in `21-foundation.js`

**Interfaces:**
- Produces in `ui.js`: `export function setBusy(button: HTMLButtonElement, busyLabel: string | null): void`. With a label it stores the current text in `button.dataset.label`, sets the text, `disabled = true` and `aria-busy="true"`. With `null` it restores all three. No spinner: a spinner is endless motion.
- CSS: heights `.btn-sm` 32px, default 40px, `.btn-lg` 48px; under `@media (pointer: coarse)` every button and input is at least 44px high. States: `:hover`, `:active` (one step darker and `transform: translateY(1px)`), `:focus-visible` (`outline: 2px solid var(--primary); outline-offset: 2px`), `:disabled` and `[aria-busy="true"]` (55% opacity, `cursor: progress` when busy). Inputs: `[aria-invalid="true"]` gets `border-color: var(--danger)` and a `0 0 0 3px var(--danger-soft)` ring; `.field-msg` is the small message line under a field.
- Auth form: on a failed sign-in or sign-up, the email or password field named by the error gets `aria-invalid="true"` and the existing human-readable message appears in a `.field-msg` under it as well as in the toast. Typing in the field clears both.

- [ ] **Step 1: Write the failing test:**

```js
scenario('foundation: buttons and fields have designed states', async () => {
  await boot();
  const h = sel => ev(`document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().height`);
  check('primary button is at least 44px tall on a phone', (await h('#email-signin-btn')) >= 44);
  check('fields are at least 44px tall on a phone', (await h('#auth-email')) >= 44);
  await ev(`document.getElementById('email-signin-btn').focus()`);
  check('keyboard focus draws a 2px outline', await ev(`(() => { const b = document.getElementById('email-signin-btn'); return b.matches(':focus-visible') ? getComputedStyle(b).outlineWidth === '2px' : true; })()`));
  await ev(`(() => { document.getElementById('auth-email').value = 'wrong@example.com'; document.getElementById('auth-password').value = 'secret1'; document.getElementById('email-auth-form').requestSubmit(); })()`);
  await sleep(600);
  check('the failing field is marked invalid', (await ev(`document.getElementById('auth-password').getAttribute('aria-invalid')`)) === 'true');
  check('the reason is shown under the field', /match/i.test(await ev(`(document.querySelector('#email-auth-form .field-msg') || {}).textContent || ''`)));
  await ev(`(() => { const p = document.getElementById('auth-password'); p.value = 'x'; p.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  check('typing clears the error', (await ev(`document.getElementById('auth-password').getAttribute('aria-invalid')`)) !== 'true');
  noExceptions();
});
```

Unit test for the helper, new file `tests/ui.test.js` run with `node --test`: `setBusy(btn, 'Saving')` sets text `Saving`, `disabled`, `aria-busy="true"`; `setBusy(btn, null)` restores the original text and removes both; calling busy twice keeps the first original label. (Use a plain object with `textContent`, `disabled`, `dataset`, `setAttribute`, `removeAttribute`.)

- [ ] **Step 2:** Run. Expected: fails on heights (40px today), invalid marking and the missing module.
- [ ] **Step 3: Implement** as specified. Add `tests/ui.test.js` to the "Logic tests" step in `.github/workflows/tests.yml`.
- [ ] **Step 4:** Whole suite green (`05-auth.js` must still pass unchanged); gallery to `.gallery/t6`, compare `landing_light`, `empty_home`.
- [ ] **Step 5:** Ledger R6; commit ("Buttons and fields: sizes, focus, busy and error states").

### Task 7: Custom select, and consistent switch and checkbox (roadmap 7)

**Files:** Modify `ui.js`, `style.css`, `app.js` (call `enhanceSelect` for the four selects once at start-up); Create `tests/scenarios/22-components.js`

**Interfaces:**
- Produces: `export function enhanceSelect(select: HTMLSelectElement, opts?: { iconFor?: (value: string) => string }): void`.
  - The native `<select>` stays in the page as the source of truth (existing code and tests read and set `.value`), visually hidden with `.sr-only` and `tabindex="-1"`.
  - Renders after it: `<button type="button" class="select-btn" aria-haspopup="listbox" aria-expanded="false">` showing the selected option's icon and label, and `<ul class="select-list" role="listbox" hidden>` with one `<li role="option" data-value aria-selected>` per option.
  - Choosing an option sets `select.value`, dispatches a bubbling `change` event on the select, closes the list and returns focus to the button.
  - If code sets `select.value` and dispatches `change` (as the edit dialog and `form.reset()` do), the button label follows. Listen for `change` on the select and `reset` on its form.
  - Keyboard on the button: Enter, Space, ArrowDown open. In the list: ArrowUp, ArrowDown, Home, End move; typing a letter jumps to the next option starting with it; Enter or Space choose; Escape or Tab close without choosing. Escape must not also close the dialog the select sits in (`stopPropagation`).
  - The list is positioned under the button, flips above when there is less than 240px below, has `max-height: 240px` with scrolling, and uses `--elev-2`.
  - Category selects pass `iconFor: v => CATS[v]?.icon || ''`.
- CSS: `.toggle` and `.habit-check` get a 44px hit area on coarse pointers without changing their drawn size.

- [ ] **Step 1: Write the failing test** in `22-components.js`:

```js
scenario('components: the category select is a designed, keyboard-friendly list', async () => {
  await boot({ seed: signedIn() });
  await waitFor(`!!document.querySelector('#habit-form .select-btn')`, 5000);
  check('all four selects are enhanced', (await ev(`document.querySelectorAll('.select-btn').length`)) === 4);
  const open = () => ev(`document.querySelector('#habit-category + .select-btn, #habit-category ~ .select-btn').click()`);
  await open();
  check('opens a listbox with 11 categories', (await ev(`document.querySelectorAll('.select-list:not([hidden]) [role=option]').length`)) >= 11);
  check('options show the category icon', await ev(`!!document.querySelector('.select-list:not([hidden]) [role=option] use[href^="#i-cat-"]')`));
  await ev(`[...document.querySelectorAll('.select-list:not([hidden]) [role=option]')].find(o => o.dataset.value === 'reading').click()`);
  check('choosing sets the real select', (await ev(`document.getElementById('habit-category').value`)) === 'reading');
  check('the button shows the choice', /Reading/.test(await ev(`document.querySelector('#habit-category ~ .select-btn').textContent`)));
  check('the list closed and focus returned', await ev(`!document.querySelector('.select-list:not([hidden])') && document.activeElement.classList.contains('select-btn')`));
  const key = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }));
  await key('ArrowDown'); await key('ArrowDown'); await key('Enter');
  check('arrow keys and Enter choose the next option', (await ev(`document.getElementById('habit-category').value`)) !== 'reading');
  await key('ArrowDown'); await key('Escape');
  check('Escape closes without changing', await ev(`!document.querySelector('.select-list:not([hidden])')`));
  await ev(`(() => { const s = document.getElementById('habit-category'); s.value = 'fitness'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  check('the button follows a value set by code', /Fitness/.test(await ev(`document.querySelector('#habit-category ~ .select-btn').textContent`)));
  noExceptions();
});
scenario('components: selects fit a small phone and dark mode', async () => {
  await boot({ seed: signedIn({ theme: 'dark' }) });
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  await waitFor(`!!document.querySelector('.select-btn')`); await ev(`document.querySelector('.select-btn').click()`); await sleep(200);
  check('no horizontal scroll with the list open at 320px', await ev(`document.documentElement.scrollWidth <= innerWidth`));
  check('the open list sits inside the screen', await ev(`(() => { const r = document.querySelector('.select-list:not([hidden])').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`));
  check('list text is readable in dark', await ev(`(() => { const o = document.querySelector('.select-list [role=option]'); return getComputedStyle(o).color !== getComputedStyle(document.querySelector('.select-list')).backgroundColor; })()`));
});
```

- [ ] **Step 2:** Run. Expected: fails waiting for `.select-btn`.
- [ ] **Step 3: Implement** `enhanceSelect` and its styles as specified.
- [ ] **Step 4:** Whole suite green: `01-core.js`, `04-activation.js`, `08-a11y.js` and `15-ui.js` drive the add and edit forms through the native selects and must pass unchanged. Gallery to `.gallery/t7`, compare `empty_home`.
- [ ] **Step 5:** Ledger R7; commit ("Custom select with icons and full keyboard support").

### Task 8: One dialog system (roadmap 8)

**Files:** Modify `ui.js`, `style.css`, `index.html` (add `data-dismiss` to each dialog's cancel or close button; add `<span class="sheet-handle" aria-hidden="true"></span>` as the first child of every `.dialog`), `app.js` (call `watchDialogs()` once; remove the existing Escape handler it replaces)

**Interfaces:**
- Produces: `export function watchDialogs(root?: ParentNode): void`. It observes the `class` attribute of every `.modal`, so the ten existing call sites that add and remove `.hidden` do not change.
  - When a `.modal` loses `.hidden`: remember `document.activeElement`; add `dialog-open` to `<html>` (CSS: `overflow: hidden`); move focus to the first element with `[autofocus]`, else the first focusable inside `.dialog`; add `is-open` to the modal on the next frame to run the entrance.
  - When it gains `.hidden`: remove `is-open`; if no other modal is open, remove `dialog-open`; restore focus to the remembered element if it is still in the page.
  - Tab and Shift+Tab cycle inside the top-most open dialog.
  - Dismissal (Escape, a click on the backdrop itself, or a downward drag on a phone) clicks that dialog's `[data-dismiss]` button, so each dialog's own cancel logic runs (the confirm dialog un-ticks its checkbox, the timer stops, and so on). A dialog with no `[data-dismiss]` cannot be dismissed that way.
  - Drag: on `pointer: coarse` and width at most 640px, a pointer drag that starts on `.sheet-handle` or in the top 48px of `.dialog` moves the sheet with the finger; released more than 80px down it dismisses, otherwise it springs back.
- CSS: at `max-width: 640px`, `.modal` aligns its `.dialog` to the bottom with no side padding; `.dialog` gets `border-radius: var(--r-2xl) var(--r-2xl) 0 0`, full width, `max-height: 92dvh`, bottom padding including `env(safe-area-inset-bottom)`, and enters with `transform: translateY(100%)` to `none` over `--t-sheet`. `.sheet-handle` is a 36 by 4px bar, shown only at that width. Above 640px, `.dialog` stays centred and enters with opacity 0 to 1 and `scale(.98)` to `1` over 160ms. In dark, `.dialog` uses `--surface-3`. Under reduced motion there is no transition at all.

- [ ] **Step 1: Write the failing test** in `22-components.js`. One helper opens the confirm dialog by ticking a habit with confirmation on; another opens the timer dialog.

```js
scenario('components: dialogs are bottom sheets on phones and centred on desktop', async () => {
  await boot({ seed: withHabit() }); await openConfirm();
  const r = JSON.parse(await ev(`JSON.stringify((() => { const d = document.querySelector('#confirm-check-modal .dialog').getBoundingClientRect(); return { bottom: Math.round(d.bottom), width: Math.round(d.width), vh: innerHeight, vw: innerWidth }; })())`));
  check('phone: the sheet sits on the bottom edge', r.bottom === r.vh, `${r.bottom} vs ${r.vh}`);
  check('phone: the sheet is full width', r.width === r.vw);
  check('phone: it shows a drag handle', await visible('#confirm-check-modal .sheet-handle'));
  check('the page behind cannot scroll', (await ev(`getComputedStyle(document.documentElement).overflow`)) === 'hidden');
  await boot({ seed: withHabit(), mobile: false }); await openConfirm();
  check('desktop: the dialog is centred', await ev(`(() => { const d = document.querySelector('#confirm-check-modal .dialog').getBoundingClientRect(); return Math.abs((d.left + d.right) / 2 - innerWidth / 2) < 2 && d.bottom < innerHeight - 40; })()`));
  check('desktop: no drag handle', !(await visible('#confirm-check-modal .sheet-handle')));
});
scenario('components: dialogs trap focus, restore it, and dismiss through their own cancel', async () => {
  await boot({ seed: withHabit(), mobile: false }); await openConfirm();
  check('focus moved into the dialog', await ev(`document.querySelector('#confirm-check-modal .dialog').contains(document.activeElement)`));
  for (let i = 0; i < 6; i++) await tab();
  check('Tab stays inside', await ev(`document.querySelector('#confirm-check-modal .dialog').contains(document.activeElement)`));
  await key('Escape'); await sleep(250);
  check('Escape closed it', !(await visible('#confirm-check-modal')));
  check('its cancel logic ran (habit not completed, box un-ticked)', await ev(`!document.querySelector('.habit-check').checked && __mockDB.habits.a.completedDates.length === 0`));
  check('focus went back to where it was', await ev(`document.activeElement.classList.contains('habit-check')`));
  check('the page scrolls again', (await ev(`getComputedStyle(document.documentElement).overflow`)) !== 'hidden');
});
scenario('components: a sheet can be dragged down to dismiss, and respects reduced motion', async () => {
  await boot({ seed: withHabit() }); await openConfirm();
  await drag('#confirm-check-modal .sheet-handle', 0, 40); await sleep(300);
  check('a short drag springs back', await visible('#confirm-check-modal'));
  await drag('#confirm-check-modal .sheet-handle', 0, 140); await sleep(300);
  check('a long drag dismisses', !(await visible('#confirm-check-modal')));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await openConfirm();
  check('reduced motion: no transition', (await ev(`getComputedStyle(document.querySelector('#confirm-check-modal .dialog')).transitionDuration`)).split(',').every(d => parseFloat(d) === 0));
  await send('Emulation.setEmulatedMedia', { features: [] });
});
```

`drag(selector, dx, dy)` dispatches `pointerdown`, three `pointermove` steps and `pointerup` with `pointerType: 'touch'` on the element via `ev`. `tab()` and `key(k)` use `Input.dispatchKeyEvent`.

- [ ] **Step 2:** Run. Expected: fails on sheet position, handle, scroll lock, focus return and drag.
- [ ] **Step 3: Implement** as specified. Every one of the ten dialogs gets a handle; nine get `data-dismiss` on their existing cancel or close button (`all-done-close`, `crop-cancel`, the edit cancel, the recovery close, `timer-close`, the details close, `confirm-check-cancel`, `confirm-export-cancel`, the share close); the level-up dialog's button is its only action and also carries `data-dismiss`.
- [ ] **Step 4:** Whole suite green (`08-a11y.js` "Escape closes the top-most one" must pass unchanged); gallery to `.gallery/t8`, compare every `modal_*` picture and `share_card`.
- [ ] **Step 5:** Ledger R8; commit ("Dialogs: bottom sheets on phones, focus handling, drag to dismiss").

### Task 9: Redesigned toasts (roadmap 9)

**Files:** Modify `ui.js` (move `toast` here), `app.js` (delete its `toast`, import it), `style.css`, `index.html` (sprite: add `i-info` if missing)

**Interfaces:**
- Produces: `export function toast(msg: string, type?: 'info' | 'success' | 'warning' | 'error', ms?: number, action?: { label: string, onClick: () => void } | null): void`. Same signature and defaults as today (`'info'`, `3500`, `null`), so no call site changes.
  - Structure: `<div class="toast TYPE"><svg class="icon toast-ic">…</svg><span class="toast-msg">…</span>[<button class="toast-action">]<span class="toast-bar"></span></div>`. Icon: success `#i-check`, warning and error `#i-alert`, info `#i-info`. The icon is tinted with the status colour; the toast surface stays neutral.
  - `.toast-bar` is a 2px bar that shrinks from full width to zero once, over `ms` (`animation-iteration-count: 1`). Hovering, focusing inside, or touching the toast pauses both the bar and the timer; leaving resumes.
  - At most three toasts are in the page; adding a fourth removes the oldest at once.
  - A horizontal pointer drag of more than 60px dismisses the toast.
  - Position: at width up to 640px, bottom centre, `bottom: calc(var(--bottomnav-h) + 12px + env(safe-area-inset-bottom))`, stacked upward; wider, top right as today. Elevation `--elev-2`; in dark the surface is `--surface-3`.
  - Long text wraps (`overflow-wrap: anywhere`); max width `min(360px, 100vw - 24px)`.
  - The existing `#toast-container` keeps its live-region attributes.

- [ ] **Step 1: Write the failing test** in `22-components.js`. Toasts are raised by `ev("import('./ui.js').then(m => m.toast(...))")`.

```js
scenario('components: toasts have an icon, a countdown, a limit and can be swiped away', async () => {
  await boot({ seed: signedIn() }); await sleep(500);
  const raise = (msg, type = 'info', ms = 3500) => ev(`import('./ui.js').then(m => { m.toast(${JSON.stringify(msg)}, ${JSON.stringify(type)}, ${ms}); return 1; })`);
  await raise('Saved', 'success', 60000);
  check('shows a tick for success', await ev(`!!document.querySelector('.toast.success use[href="#i-check"]')`));
  check('countdown bar runs once', (await ev(`getComputedStyle(document.querySelector('.toast .toast-bar')).animationIterationCount`)) === '1');
  check('phone: toasts sit above the bottom navigation', await ev(`(() => { const t = document.querySelector('.toast').getBoundingClientRect(), n = document.querySelector('.bottomnav').getBoundingClientRect(); return t.bottom <= n.top; })()`));
  for (let i = 0; i < 4; i++) await raise('Message ' + i, 'info', 60000);
  check('never more than three at once', (await ev(`document.querySelectorAll('.toast').length`)) === 3);
  await raise('A'.repeat(200), 'error', 60000);
  check('a very long toast does not widen the page', await ev(`document.documentElement.scrollWidth <= innerWidth`));
  const before = await ev(`document.querySelectorAll('.toast').length`);
  await drag('.toast:last-child', 120, 0); await sleep(400);
  check('swiping removes one', (await ev(`document.querySelectorAll('.toast').length`)) === before - 1);
  noExceptions();
});
scenario('components: a toast waits while you are reading it', async () => {
  await boot({ seed: signedIn(), mobile: false }); await sleep(500);
  await ev(`import('./ui.js').then(m => { m.toast('Hold on', 'info', 600); return 1; })`);
  await ev(`document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerenter'))`); await sleep(1200);
  check('still there while hovered', (await ev(`document.querySelectorAll('.toast').length`)) === 1);
  check('the bar is paused', (await ev(`getComputedStyle(document.querySelector('.toast .toast-bar')).animationPlayState`)) === 'paused');
  await ev(`document.querySelector('.toast').dispatchEvent(new PointerEvent('pointerleave'))`); await sleep(1300);
  check('gone after you leave', (await ev(`document.querySelectorAll('.toast').length`)) === 0);
  await ev(`import('./ui.js').then(m => { m.toast('Where am I', 'info', 60000); return 1; })`);
  check('desktop: toasts are top right', await ev(`(() => { const t = document.querySelector('.toast').getBoundingClientRect(), n = document.querySelector('.topnav').getBoundingClientRect(); return innerWidth - t.right <= 16 && t.top >= n.bottom; })()`));
});
```

- [ ] **Step 2:** Run. Expected: fails because `ui.js` exports no `toast`.
- [ ] **Step 3: Implement** as specified.
- [ ] **Step 4:** Whole suite green (`10-wave3.js` Undo and every scenario that reads toast text must pass unchanged); gallery to `.gallery/t9`, compare `toast`.
- [ ] **Step 5:** Ledger R9; commit ("Toasts: icons, countdown, stacking limit, swipe to dismiss").

### Task 10: Skeleton loading (roadmap 10)

**Files:** Modify `index.html` (the `#loading-screen` block), `style.css` (remove `.loading-spinner` and `@keyframes spin`; add `.skel`), `app.js` (`showApp`, `renderHabits`, `subscribeToHabits`)

**Interfaces:**
- `#loading-screen` keeps its id and its removal timing (the test runner waits for it to disappear). Its content becomes a static frame: a top bar with the logo, and below it either the app skeleton (a 180px summary block and four row placeholders) when `localStorage.habitly_returning` is set, or the landing skeleton (a headline block and a card block) when not. The choice is made by the existing inline head script setting `data-returning` on `<html>`, so it is right on first paint.
- `.skel` is a static block: `background: var(--surface-2)`, radius from tokens, no animation.
- In the app, `#habits` shows four `<li class="habit-item skel-row" aria-hidden="true">` from `showApp()` until the first habits snapshot arrives. `#habits` has `aria-busy="true"` during that time. The empty state must not flash before the first snapshot.

- [ ] **Step 1: Write the failing test** in `21-foundation.js`:

```js
scenario('foundation: loading shows the shape of the page, with no spinner', async () => {
  check('the stylesheet has no endless animation at all', !/infinite/.test(css()));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const block = html.slice(html.indexOf('id="loading-screen"'), html.indexOf('<!-- All habits done -->'));
  check('the loading screen is built from skeleton blocks', (block.match(/class="[^"]*\bskel\b/g) || []).length >= 5 && !/loading-spinner/.test(html));
  await boot({ seed: signedIn(), initScript: 'window.__mockSnapshotDelay = 900;' });
  check('rows are placeholders while habits load', (await ev(`document.querySelectorAll('#habits .skel-row').length`)) === 4);
  check('the list is marked busy', (await ev(`document.getElementById('habits').getAttribute('aria-busy')`)) === 'true');
  check('the empty state is not shown yet', !(await visible('#empty-state')));
  await sleep(1300);
  check('placeholders are gone once data arrives', (await ev(`document.querySelectorAll('#habits .skel-row').length`)) === 0);
  check('the list is no longer busy', (await ev(`document.getElementById('habits').getAttribute('aria-busy')`)) !== 'true');
  check('an empty account then shows its empty state', await visible('#empty-state'));
  noExceptions();
});
```

This needs one addition to `tests/firebase-mock.js`: in `onSnapshot`, a query on `habits` waits `window.__mockSnapshotDelay` milliseconds (default 0) before its first callback, in the same way `__mockProfileDelay` already delays the profile.

- [ ] **Step 2:** Run. Expected: fails on `infinite`, the missing skeleton and placeholder rows.
- [ ] **Step 3: Implement** as specified. Check the guided tour still starts correctly for a new account (it waits for a habit row or the empty state; skeleton rows must not satisfy that wait, so its selector becomes `#habits .habit-item:not(.skel-row)`).
- [ ] **Step 4:** Whole suite green (`14-tour.js` and `99-service-worker.js` are the ones at risk); gallery to `.gallery/t10`.
- [ ] **Step 5:** Ledger R10; commit ("Loading: page-shaped placeholders in place of the spinner").

### Task 11: Publish the batch

- [ ] **Step 1:** `GALLERY=1 node tests/smoke.js --only gallery --shots .gallery/after`. Review all 43 pictures against `.gallery/before`, in light and dark. Fix anything that looks worse, each fix as its own small commit with the suite green.
- [ ] **Step 2:** Whole suite and logic tests: `node tests/smoke.js` and `node --test scripts/reminder-logic.test.js tests/sw-push.test.js tests/ui.test.js`. Expected: all pass.
- [ ] **Step 3:** `node tools/deploy.js --dry`. Expected: the app files, `ui.js`, the two legal pages and three fonts, and nothing else. Then `node tools/deploy.js`.
- [ ] **Step 4:** Confirm each published file matches `HEAD` (hash comparison over `curl`), then `node tests/smoke.js --origin https://habit-tracker-demo-34c0a.web.app` in the background with no time limit shorter than 20 minutes. Expected: all pass.
- [ ] **Step 5:** `git push origin main`, and confirm the "Tests" run on GitHub passes.
- [ ] **Step 6:** Give the owner six before-and-after pairs (landing, Home, Home dark, a dialog on a phone, Stats, Profile) and a list of the ten changes in plain words.
