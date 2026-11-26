// moments.js: the screens that recognise what a person has done (the level page, and more as batch 4 grows).
//
// It only draws. app.js works out what is true (with motivation.js) and hands it over; nothing here reads habits,
// saves anything, or decides a rule. Every piece of text that came from a person goes through esc().

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const icon = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const num = n => Number(n).toLocaleString('en');

// "Today", "Yesterday", or "Mon 23 Nov" for a day key, given today's key.
export function dayName(day, today) {
  const at = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const diff = Math.round((at(today) - at(day)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(at(day)).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
// "Read", "Read and Run", "Read, Run and 2 more"
export function nameList(names, max = 2) {
  const n = names.map(esc);
  if (n.length <= 1) return n.join('');
  if (n.length <= max) return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  return n.slice(0, max).join(', ') + ` and ${n.length - max} more`;
}

// ── The level page ─────────────────────────────────────────
// info: motivation.levelInfo(xp); levels: motivation.LEVELS; history: motivation.xpHistory(...); today: day key
export function renderLevel(body, { info, levels, history, today }) {
  const meaning = (levels.find(l => l.level === info.level) || {}).meaning || '';
  const ladder = levels.map(l => {
    const state = l.level < info.level ? 'is-passed' : l.level === info.level ? 'is-current' : '';
    const say = l.level < info.level ? 'reached' : l.level === info.level ? 'your level now' : `at ${num(l.minXP)} XP`;
    return `<li class="${state}"${state === 'is-current' ? ' aria-current="true"' : ''}>
      <span class="lv-num" aria-hidden="true">${l.level < info.level ? icon('check') : l.level}</span>
      <span class="lv-text"><strong>${esc(l.title)}</strong><span>${esc(l.meaning)}</span></span>
      <span class="lv-xp" aria-hidden="true">${num(l.minXP)} XP</span><span class="sr-only">Level ${l.level}, ${say}</span></li>`;
  }).join('');
  const rows = history.map(d => `<li><span class="xh-day">${esc(dayName(d.day, today))}</span>
      <span class="xh-what">${nameList(d.names)}${d.bonus ? ' <span class="xh-bonus">Full day bonus</span>' : ''}</span>
      <strong class="xh-xp">+${num(d.xp)}</strong></li>`).join('');
  body.innerHTML = `
    <p class="level-meaning">${esc(meaning)}</p>
    <div class="level-next">
      <div class="level-next-row"><span id="level-to-go">${info.isTop ? 'Top level reached' : `${num(info.toGo)} XP to Level ${info.level + 1} · ${esc(info.nextTitle)}`}</span><span class="level-total">${num(info.totalXP)} XP</span></div>
      <div class="level-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${info.progressPct}" aria-labelledby="level-to-go"><span style="width:${info.progressPct}%"></span></div>
    </div>
    <h3 class="level-h">How XP works</h3>
    <ul class="level-rules">
      <li><strong>+25</strong><span>for each habit you complete</span></li>
      <li><strong>+100</strong><span>on a day when every daily habit is done</span></li>
      <li><strong>&minus;25</strong><span>if you take a completion back</span></li>
    </ul>
    <h3 class="level-h">The ladder</h3>
    <ol class="level-ladder">${ladder}</ol>
    <h3 class="level-h">Recent XP</h3>
    ${rows ? `<ul class="xp-history">${rows}</ul><p class="sheet-note">Worked out from what you completed in the last 14 days.</p>`
           : '<p class="sheet-note" id="xp-history-none">Nothing in the last 14 days. Complete a habit and it shows here.</p>'}`;
}

// ── One celebration at a time ──────────────────────────────
// One tap can reach a milestone, finish the day and reach a new level. Each card waits its turn: the next opens
// when the one before is closed. `open(done)` shows a card and calls done() when it has gone.
const waiting = [];
let showing = false;
function next() {
  const open = waiting.shift();
  if (!open) { showing = false; return; }
  showing = true;
  let finished = false;
  open(() => { if (finished) return; finished = true; setTimeout(next, 250); });
}
export function queueCelebration(open) {
  waiting.push(open);
  if (!showing) next();
}
// A dialog (.modal) as a celebration. prepare() runs just before it shows (set its text, play its sound);
// returning false skips it.
export function queueDialog(modal, prepare) {
  if (!modal) return;
  queueCelebration(done => {
    if (prepare && prepare() === false) return done();
    modal.classList.remove('hidden');
    const watch = new MutationObserver(() => { if (modal.classList.contains('hidden')) { watch.disconnect(); done(); } });
    watch.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });
}
export function resetCelebrations() { waiting.length = 0; }
// A celebration card was left for another dialog (its Share, or the recap). Whatever is queued next waits until
// that dialog has closed too, instead of opening on top of it.
export function holdFor(modal) {
  if (!showing || !modal) return;
  waiting.unshift(done => {
    if (modal.classList.contains('hidden')) return done();
    const watch = new MutationObserver(() => { if (modal.classList.contains('hidden')) { watch.disconnect(); done(); } });
    watch.observe(modal, { attributes: true, attributeFilter: ['class'] });
  });
}

// ── The milestone card ─────────────────────────────────────
let milestone = null;
export const currentMilestone = () => milestone;
export function renderMilestone({ days, habit, line }) {
  milestone = { days, habit };
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('milestone-num', String(days));
  set('milestone-title', `${days} days in a row`);
  set('milestone-habit', habit);
  set('milestone-line', line || '');
}

// The picture that Share sends: 1080 x 1350, flat, the same ink and accent as the streak card.
function fitText(ctx, text, max) {
  let t = String(text);
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > max) t = t.slice(0, -1);
  return t.trimEnd() + '\u2026';
}
export async function drawMilestoneCard(canvas, { days, habit, url }) {
  try { await Promise.all([document.fonts.load('600 40px Inter'), document.fonts.load('400 40px "Instrument Serif"')]); } catch (_) { /* system fonts will do */ }
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, M = 96;
  const INK = '#111113', LINE = '#2C2C31', TEXT = '#F2F2F4', MUTED = '#9A9AA3', ACCENT = '#A79EF5', FONT = 'Inter, system-ui, sans-serif';
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = TEXT; ctx.font = `600 44px ${FONT}`; ctx.fillText('Habitly', M, 140);
  const cx = W / 2, cy = 560, r = 300;
  ctx.lineWidth = 8; ctx.strokeStyle = ACCENT; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT; ctx.font = `400 ${days >= 100 ? 270 : 340}px "Instrument Serif", Georgia, serif`; ctx.fillText(String(days), cx, cy + 12);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 64px ${FONT}`; ctx.fillText('days in a row', cx, 990);
  ctx.fillStyle = ACCENT; ctx.font = `500 46px ${FONT}`; ctx.fillText(fitText(ctx, habit, W - M * 2), cx, 1070);
  ctx.fillStyle = LINE; ctx.fillRect(M, 1206, W - M * 2, 2);
  ctx.fillStyle = MUTED; ctx.font = `400 34px ${FONT}`; ctx.fillText(url, cx, 1272);
}
// Hand a canvas to the device's share sheet as a picture; where that cannot be done, save it instead.
// Resolves with 'shared', 'cancelled', 'failed' or 'saved'.
export function shareCanvas(canvas, { filename, title, text }) {
  return new Promise(resolve => {
    const save = () => { const a = document.createElement('a'); a.download = filename; a.href = canvas.toDataURL('image/png'); a.click(); resolve('saved'); };
    try {
      canvas.toBlob(async blob => {
        const file = blob && typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
        if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ title, text, files: [file] }); resolve('shared'); }
          catch (e) { resolve(e && e.name === 'AbortError' ? 'cancelled' : 'failed'); }
        } else save();
      }, 'image/png');
    } catch (_) { save(); }
  });
}

// ── The achievements gallery ───────────────────────────────
// items: motivation.achievements(...). Earned ones are filled; locked ones are outlines with how far along they are.
export function renderAchievements(body, items) {
  const earned = items.filter(a => a.earned).length;
  body.innerHTML = `<p class="dialog-text" id="ach-count">${earned} of ${items.length} earned</p>
    <ul class="ach-grid">${items.map(a => `<li class="ach ${a.earned ? 'is-earned' : 'is-locked'}" data-id="${esc(a.id)}">
      <span class="ach-medal" aria-hidden="true">${icon(a.icon)}</span>
      <strong class="ach-name">${esc(a.name)}</strong>
      <span class="ach-how">${esc(a.how)}</span>
      ${a.earned ? '<span class="ach-state">Earned</span>'
        : `<span class="ach-state"><span class="sr-only">Locked. </span>${num(a.have)} of ${num(a.goal)}</span><span class="ach-bar" aria-hidden="true"><span style="width:${Math.round((a.have / a.goal) * 100)}%"></span></span>`}
    </li>`).join('')}</ul>`;
}

// ── The moment card ────────────────────────────────────────
// One small card at the foot of the screen for things the app raises on its own: the shield question, a welcome
// back, the evening recap. It is not a dialog: the page behind stays live, and it never takes the focus.
// At most one is raised unasked per day per account (momentAllowed / markMoment); the same card opened by the
// person (from a tile or a button) is not counted.
let moment = null;                                            // { id, onDismiss }
const momentEl = () => document.getElementById('moment');
export const momentShowing = () => (moment ? moment.id : null);
export function showMoment({ id, title, text, actions = [], onDismiss = null }) {
  const el = momentEl();
  if (!el) return;
  moment = { id, onDismiss };
  el.dataset.moment = id;
  el.setAttribute('aria-label', title);
  document.getElementById('moment-title').textContent = title;
  document.getElementById('moment-text').textContent = text;
  const box = document.getElementById('moment-actions');
  box.textContent = '';
  actions.forEach((a, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = i === 0 ? 'btn-primary' : 'btn-secondary'; b.textContent = a.label;
    b.addEventListener('click', () => a.onClick());
    box.appendChild(b);
  });
  if (!el.dataset.bound) { el.dataset.bound = '1'; document.getElementById('moment-dismiss').addEventListener('click', dismissMoment); }
  el.classList.remove('hidden');
  document.documentElement.classList.add('has-moment');
  document.documentElement.style.setProperty('--moment-h', el.offsetHeight + 'px');
}
// Hide the card (only if it is the one named, when a name is given).
export function hideMoment(id = null) {
  if (!moment || (id && moment.id !== id)) return;
  moment = null;
  momentEl()?.classList.add('hidden');
  document.documentElement.classList.remove('has-moment');
  document.documentElement.style.removeProperty('--moment-h');
}
// The person closed it without answering.
export function dismissMoment() {
  const was = moment;
  hideMoment();
  if (was && was.onDismiss) was.onDismiss();
}
const momentKey = uid => `habitly_moment_${uid}`;
export function momentAllowed(uid, today) { try { return localStorage.getItem(momentKey(uid)) !== today; } catch (_) { return true; } }
export function markMoment(uid, today) { try { localStorage.setItem(momentKey(uid), today); } catch (_) {} }

// ── The comeback sheet ─────────────────────────────────────
// items: [{ id, name, sub }]. Every habit starts ticked ("keep"); un-ticking one means "not for now".
export function renderComeback(listEl, items) {
  listEl.innerHTML = items.map(h => `<li><label class="pick-item"><input type="checkbox" class="pick-check" data-id="${esc(h.id)}" checked>
    <span class="pick-text"><span class="pick-name">${esc(h.name)}</span><span class="pick-sub">${esc(h.sub)}</span></span></label></li>`).join('');
}

// ── The mood row ───────────────────────────────────────────
// Five line-drawn faces for the "Completed" toast. One tap notes how it felt; another tap changes it.
// labels: motivation.MOODS. onPick(n) is called with 1..5.
export function moodRow(labels, onPick) {
  const row = document.createElement('div');
  row.className = 'toast-moods';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'How did it feel?');
  row.innerHTML = '<span class="moods-q" aria-hidden="true">How did it feel?</span>' + labels.map((l, i) =>
    `<button type="button" class="mood-btn" data-mood="${i + 1}" aria-label="${esc(l)}" aria-pressed="false" title="${esc(l)}">${icon('mood-' + (i + 1))}</button>`).join('');
  row.addEventListener('click', e => {
    const b = e.target.closest('.mood-btn');
    if (!b) return;
    row.querySelectorAll('.mood-btn').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onPick(Number(b.dataset.mood));
  });
  return row;
}

// ── The day's recap ────────────────────────────────────────
// recap: motivation.dayRecap(...). moodOf(habit) -> 1..5 or null; moods: the five labels; countOf(habit) -> "3 / 8 glasses" or ''.
export function renderRecap(body, { recap, moodOf, moods, countOf }) {
  const n = recap.done.length, total = recap.total;
  const head = total === 0 ? 'Nothing was due today' : `${n} of ${total} done`;
  const line = total === 0 ? 'A free day. Enjoy it.' : recap.open.length === 0 ? 'Everything for today is done.' : `${recap.open.length} still open. There is time.`;
  const doneRows = recap.done.map(h => { const m = moodOf(h); return `<li><span class="rc-tick" aria-hidden="true">${icon('check')}</span><span class="rc-name">${esc(h.name)}</span>${m ? `<span class="rc-mood" title="${esc(moods[m - 1])}">${icon('mood-' + m)}<span class="sr-only">Felt ${esc(moods[m - 1].toLowerCase())}</span></span>` : ''}</li>`; }).join('');
  const openRows = recap.open.map(h => { const count = countOf(h); return `<li><span class="rc-tick is-open" aria-hidden="true"></span><span class="rc-name">${esc(h.name)}${count ? `<span class="rc-count">${esc(count)}</span>` : ''}</span><button type="button" class="btn-link rc-do" data-recap-complete="${esc(h.id)}" aria-label="Complete ${esc(h.name)}">Complete</button></li>`; }).join('');
  body.innerHTML = `
    <div class="recap-head"><strong id="recap-count">${head}</strong><span>${line}</span></div>
    <dl class="recap-stats">
      <div><dt>XP today</dt><dd id="recap-xp">+${num(recap.xp)}</dd></div>
      <div><dt>Streak</dt><dd id="recap-streak">${num(recap.streak)} ${recap.streak === 1 ? 'day' : 'days'}</dd></div>
      <div><dt>Tomorrow</dt><dd id="recap-tomorrow">${num(recap.tomorrowDue)} ${recap.tomorrowDue === 1 ? 'habit' : 'habits'}</dd></div>
    </dl>
    ${recap.bonus ? '<p class="recap-bonus">Full day: every daily habit done, +100 XP.</p>' : ''}
    ${recap.moodAvg !== null ? `<p class="sheet-note" id="recap-mood">How it felt today: ${esc(moods[Math.round(recap.moodAvg) - 1].toLowerCase())} on average.</p>` : ''}
    ${doneRows ? `<h3 class="level-h">Done</h3><ul class="recap-list" id="recap-done">${doneRows}</ul>` : ''}
    ${openRows ? `<h3 class="level-h">Still open</h3><ul class="recap-list" id="recap-open">${openRows}</ul>` : ''}`;
}
