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
  const anchor = input.closest('.pw-wrap') || input;           // the message goes under the whole field, toggle included
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
