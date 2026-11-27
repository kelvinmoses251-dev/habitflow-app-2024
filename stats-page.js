// stats-page.js: draws the Statistics page (roadmap batch 6).
//
// It only draws. app.js hands over what stats.js worked out; nothing here reads habits, saves anything or decides
// a rule. Every piece of text that came from a person goes through esc(). Charts are inline SVG coloured by CSS
// variables, so they follow the theme without being redrawn.

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const DASH = '–';

// ── The period switcher ────────────────────────────────────
// A radio group with one tab stop: the chosen period.
export function renderPeriod(group, period) {
  group.querySelectorAll('[role="radio"]').forEach(b => {
    const on = b.dataset.period === period;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}
// Which period an arrow key moves to (null: not a key for this group).
export function periodForKey(key, periods, current) {
  const i = periods.indexOf(current);
  if (key === 'ArrowRight' || key === 'ArrowDown') return periods[(i + 1) % periods.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return periods[(i - 1 + periods.length) % periods.length];
  if (key === 'Home') return periods[0];
  if (key === 'End') return periods[periods.length - 1];
  return null;
}

// ── The headline figures ───────────────────────────────────
// sum: stats.periodSummary(...). range: stats.periodRange(...). streak: the account's streak in days.
export function renderHeadline(root, sum, range, streak) {
  const set = (id, value) => { const el = root.querySelector('#' + id); if (el) el.textContent = value; };
  set('stats-range', `${range.label} · ${range.span}`);
  set('stat-rate', sum.rate === null ? DASH : sum.rate + '%');
  set('stat-rate-sub', sum.rate === null ? (sum.checkins ? 'Weekly and monthly habits have no daily rate' : 'Nothing was due yet') : `${sum.doneOwed} of ${sum.owed} due`);
  set('stat-done', String(sum.checkins));
  set('stat-done-sub', sum.checkins ? `on ${sum.active} of ${plural(sum.days, 'day')}` : 'none yet');
  set('stat-perfect', String(sum.perfect));
  set('stat-perfect-sub', sum.perfect === 1 ? 'day with everything done' : 'days with everything done');
  set('stat-streak', String(streak));
  set('stat-streak-sub', streak === 1 ? 'day in a row' : 'days in a row');
}

// ── Each habit over the period ─────────────────────────────
// rows: stats.habitRates(...). Each row is a link to the habit's own page.
export function renderByHabit(el, rows) {
  if (!rows.length) { el.innerHTML = '<p class="empty-note">Nothing was due or done in this period.</p>'; return; }
  el.innerHTML = rows.map(r => {
    const daily = r.kind === 'daily';
    const figure = daily ? (r.rate === null ? DASH : r.rate + '%') : plural(r.done, 'time');
    const meta = daily ? `${r.done} of ${plural(r.owed, 'day')}${r.extra ? `, and ${r.extra} extra` : ''}` : r.kind === 'weekly' ? 'Weekly habit' : 'Monthly habit';
    const tone = r.rate === null ? 'none' : r.rate >= 70 ? 'high' : r.rate >= 40 ? 'mid' : 'low';
    const tag = r.archived ? 'div' : 'a';                    // an archived habit has no page to open
    return `<${tag} class="rate-row"${r.archived ? '' : ` href="#habit/${encodeURIComponent(r.id)}"`} data-id="${esc(r.id)}">
      <span class="rate-top"><span class="rate-name">${esc(r.name)}</span><span class="rate-pct">${figure}</span></span>
      <span class="rate-bar" aria-hidden="true"><span class="rate-fill is-${tone}" style="width:${daily && r.rate !== null ? r.rate : 0}%"></span></span>
      <span class="rate-meta">${meta}${r.archived ? ' \u00b7 archived' : ''}</span>
    </${tag}>`;
  }).join('');
}
