// ui.js: behaviour shared by every screen (busy buttons, field errors, and later dialogs, toasts and selects).
// Nothing here touches the page when the module loads, so the pure helpers can be unit-tested in Node.

// ── Busy buttons ──────────────────────────────────────────
// setBusy(button, 'Saving') shows the label, disables the button and marks it busy for assistive tech.
// setBusy(button, null) puts everything back. There is deliberately no spinner: the label says what is happening.
export function setBusy(button, busyLabel) {
  if (!button) return;
  if (busyLabel == null) {
    if (button.dataset.label === undefined) return;            // was never busy
    button.textContent = button.dataset.label;
    delete button.dataset.label;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    return;
  }
  if (button.dataset.label === undefined) button.dataset.label = button.textContent;   // keep the first, real label
  button.textContent = busyLabel;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
}

// ── Field errors ──────────────────────────────────────────
// Marks a field invalid and puts the reason directly under it, linked for screen readers.
// The message clears itself as soon as the person edits the field.
let fieldMsgSeq = 0;
export function setFieldError(input, message) {
  if (!input) return;
  clearFieldError(input);
  const anchor = input.closest('.pw-wrap, .form-row') || input;   // under the whole field or row, never squeezed inside it
  const msg = document.createElement('p');
  msg.className = 'field-msg';
  msg.id = `field-msg-${++fieldMsgSeq}`;
  msg.textContent = message;
  anchor.insertAdjacentElement('afterend', msg);
  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', msg.id);
  input.addEventListener('input', () => clearFieldError(input), { once: true });
}

export function clearFieldError(input) {
  if (!input) return;
  const id = input.getAttribute('aria-describedby');
  if (id && id.startsWith('field-msg-')) {
    document.getElementById(id)?.remove();
    input.removeAttribute('aria-describedby');
  }
  input.removeAttribute('aria-invalid');
}

// ── Custom select ─────────────────────────────────────────
// enhanceSelect(select, { iconFor }) draws a designed button + list over a native <select>.
// The native select stays in the page as the single source of truth: code and tests keep reading and
// setting select.value, form validation and reset keep working, and the button simply follows it.
// Focus never leaves the button (aria-activedescendant), so it works inside dialogs without fighting their focus trap.
let selectSeq = 0;
export function enhanceSelect(select, opts = {}) {
  if (!select || select.dataset.enhanced) return;
  select.dataset.enhanced = '1';
  const uid = `sel-${++selectSeq}`;
  const name = select.getAttribute('aria-label') || select.name || 'Choose';
  const iconFor = opts.iconFor || (() => '');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const choices = () => [...select.options].filter(o => !o.disabled && o.value !== '');
  const placeholder = () => { const o = [...select.options].find(x => x.value === ''); return o ? o.textContent : name; };

  select.classList.add('sr-only');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', `${uid}-list`);
  const list = document.createElement('ul');
  list.className = 'select-list';
  list.id = `${uid}-list`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', name);
  list.hidden = true;
  select.insertAdjacentElement('afterend', btn);
  // The list lives at the end of <body>, not beside the button: cards and dialogs use transforms, and a
  // transformed ancestor would shift a position:fixed list away from where it was placed.
  document.body.appendChild(list);

  let active = -1;                                    // index of the highlighted option
  const isOpen = () => !list.hidden;

  function sync() {                                   // make the button show the select's current value
    const cur = choices().find(o => o.value === select.value);
    btn.classList.toggle('is-placeholder', !cur);
    btn.innerHTML = `${cur ? iconFor(cur.value) : ''}<span class="select-label">${esc(cur ? cur.textContent : placeholder())}</span>`
      + `<svg class="icon select-chev" aria-hidden="true"><use href="#i-chevron-down"/></svg>`;
    btn.setAttribute('aria-label', `${name}: ${cur ? cur.textContent : 'not chosen'}`);
  }

  function highlight(i) {
    const items = [...list.children];
    if (!items.length) return;
    active = (i + items.length) % items.length;
    items.forEach((li, n) => li.classList.toggle('is-active', n === active));
    btn.setAttribute('aria-activedescendant', items[active].id);
    // Keep the highlighted option in view by scrolling the list only. (scrollIntoView would also scroll
    // whatever card or dialog the list sits in.)
    const li = items[active];
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
  }

  function place() {                                  // under the button, flipped above when there is no room, always inside the screen
    const r = btn.getBoundingClientRect(), gap = 4, margin = 8;
    const below = innerHeight - r.bottom - gap - margin, above = r.top - gap - margin;
    const up = below < 200 && above > below;
    const width = Math.min(Math.max(r.width, 200), innerWidth - margin * 2);
    list.style.maxHeight = Math.max(120, Math.min(260, up ? above : below)) + 'px';
    list.style.width = width + 'px';
    list.style.left = Math.max(margin, Math.min(r.left, innerWidth - width - margin)) + 'px';
    if (up) { list.style.top = ''; list.style.bottom = (innerHeight - r.top + gap) + 'px'; }
    else { list.style.bottom = ''; list.style.top = (r.bottom + gap) + 'px'; }
  }

  function open() {
    if (isOpen() || select.disabled) return;
    const items = choices();
    list.innerHTML = items.map((o, i) => `<li role="option" id="${uid}-o${i}" data-value="${esc(o.value)}" aria-selected="${o.value === select.value}">`
      + `${iconFor(o.value)}<span class="select-label">${esc(o.textContent)}</span>`
      + `<svg class="icon select-tick" aria-hidden="true"><use href="#i-check"/></svg></li>`).join('');
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
    highlight(Math.max(0, items.findIndex(o => o.value === select.value)));
    document.addEventListener('pointerdown', onOutside, true);
    addEventListener('resize', close);
    addEventListener('scroll', onScroll, true);
  }

  function close() {
    if (!isOpen()) return;
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onOutside, true);
    removeEventListener('resize', close);
    removeEventListener('scroll', onScroll, true);
  }

  function choose(value) {
    close();
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearFieldError(btn);
    btn.focus();
  }

  const onOutside = e => { if (!btn.contains(e.target) && !list.contains(e.target)) close(); };
  // Close when the button itself moves (the page or a container holding it scrolls). Scrolling the list, or some
  // unrelated container that the app scrolls on its own, must not close it.
  const onScroll = e => { if (e.target === document || (e.target.contains && e.target !== list && e.target.contains(btn))) close(); };

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  list.addEventListener('click', e => { const li = e.target.closest('[role=option]'); if (li) choose(li.dataset.value); });
  list.addEventListener('pointermove', e => { const li = e.target.closest('[role=option]'); if (li) highlight([...list.children].indexOf(li)); });
  btn.addEventListener('keydown', e => {
    if (!isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    const n = list.children.length;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }   // must not also close the dialog it sits in
    else if (e.key === 'Tab') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
    else if (e.key === 'End') { e.preventDefault(); highlight(n - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (active >= 0) choose(list.children[active].dataset.value); }
    else if (e.key.length === 1) {                    // type a letter: jump to the next option that starts with it
      const labels = choices().map(o => o.textContent.trim().toLowerCase());
      for (let k = 1; k <= n; k++) { const i = (active + k) % n; if (labels[i].startsWith(e.key.toLowerCase())) { highlight(i); break; } }
    }
  });

  // Follow the select when code sets its value, when it changes, and when its form is reset.
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return proto.get.call(select); },
    set(v) { proto.set.call(select, v); sync(); },
  });
  select.addEventListener('change', sync);
  if (select.form) select.form.addEventListener('reset', () => setTimeout(sync, 0));

  // A required select with nothing chosen: say so on the button, instead of a browser bubble on a hidden control.
  select.addEventListener('invalid', e => {
    e.preventDefault();
    setFieldError(btn, `Choose a ${name.toLowerCase()}.`);
    if (!document.activeElement || !document.activeElement.matches('.select-btn[aria-invalid="true"]')) btn.focus();
  });

  sync();
}

// ── Dialogs ───────────────────────────────────────────────
// watchDialogs() gives every .modal the same behaviour without changing how they are opened: the app still
// shows and hides a dialog by removing and adding the `hidden` class, and this watches for that.
//   opening: remembers where focus was, stops the page behind from scrolling, moves focus into the dialog
//   closing: lets the page scroll again and puts focus back
//   Tab stays inside the top-most dialog
//   a click on the backdrop, or dragging a phone sheet down, presses that dialog's own [data-dismiss] button,
//   so each dialog's cancel logic runs exactly as if the person had tapped Cancel
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
export function watchDialogs(root = document) {
  const stack = [];                                   // open modals, top-most last
  const isOpen = m => !m.classList.contains('hidden');
  const focusables = m => [...m.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
  const dismiss = m => { const b = m.querySelector('[data-dismiss]'); if (b && isOpen(m)) b.click(); };

  function opened(m) {
    if (stack.some(e => e.modal === m)) return;
    stack.push({ modal: m, returnTo: document.activeElement });
    document.documentElement.classList.add('dialog-open');
    // The code that opened the dialog may focus a field itself straight afterwards: only step in if it did not.
    requestAnimationFrame(() => {
      if (!isOpen(m) || m.contains(document.activeElement)) return;
      const dlg = m.querySelector('.dialog') || m;
      const target = dlg.querySelector('[autofocus]') || focusables(dlg)[0];
      if (target) target.focus({ preventScroll: true });
    });
  }

  function closed(m) {
    const i = stack.findIndex(e => e.modal === m);
    if (i < 0) return;
    const [{ returnTo }] = stack.splice(i, 1);
    const dlg = m.querySelector('.dialog');
    if (dlg) { dlg.style.transform = ''; dlg.style.transition = ''; dlg.style.animation = ''; }    // undo any drag
    if (!stack.length) document.documentElement.classList.remove('dialog-open');
    if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus({ preventScroll: true });
  }

  const watcher = new MutationObserver(records => records.forEach(r => (isOpen(r.target) ? opened(r.target) : closed(r.target))));
  root.querySelectorAll('.modal').forEach(m => {
    watcher.observe(m, { attributes: true, attributeFilter: ['class'] });
    if (isOpen(m)) opened(m);
  });

  // Keep Tab inside the top-most dialog
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !stack.length) return;
    const dlg = stack[stack.length - 1].modal;
    const f = focusables(dlg);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], inside = dlg.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
  }, true);

  // A click on the dimmed backdrop itself (not on the dialog). Dialogs with their own backdrop handler have
  // already closed by the time this runs, so nothing is pressed twice.
  document.addEventListener('click', e => {
    if (e.target instanceof Element && e.target.classList.contains('modal')) dismiss(e.target);
  });

  // Phone sheets: drag down from the handle (or the top edge) to dismiss; a short drag springs back.
  let drag = null;
  document.addEventListener('pointerdown', e => {
    if (!stack.length || !matchMedia('(max-width: 640px)').matches || !(e.target instanceof Element)) return;
    const m = stack[stack.length - 1].modal, dlg = m.querySelector('.dialog');
    if (!dlg || !dlg.contains(e.target) || !m.querySelector('[data-dismiss]')) return;
    const onHandle = !!e.target.closest('.sheet-handle');
    const nearTop = e.clientY - dlg.getBoundingClientRect().top <= 48 && !e.target.closest('button, a, input, textarea, select');
    if (!onHandle && !nearTop) return;
    drag = { m, dlg, startY: e.clientY, dy: 0 };
    dlg.style.animation = 'none';                     // a running or finished entrance animation would override the transform
    dlg.style.transition = 'none';
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.startY);
    drag.dlg.style.transform = `translateY(${drag.dy}px)`;
  });
  const endDrag = () => {
    if (!drag) return;
    const { m, dlg, dy } = drag;
    drag = null;
    if (dy > 80) { dismiss(m); return; }              // closed() clears the inline styles
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    dlg.style.transition = still ? 'none' : 'transform .16s ease';
    dlg.style.transform = '';
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
}
