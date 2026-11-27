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

// ── Picking a point on a chart ─────────────────────────────
// One line under each chart says the chart in words. Hovering, tapping or walking with the arrow keys puts one
// item's figures there instead; leaving with the mouse, or Escape, brings the summary back. The listeners are
// attached once to the chart's box and outlive every redraw.
function picker(box, items, say, rest, moveBy = null) {
  box._pick = { items, say, rest, at: -1, moveBy };
  const show = i => {
    const p = box._pick, n = p.items.length;
    p.at = i >= 0 && i < n ? i : -1;
    box.querySelectorAll('.is-on').forEach(x => x.classList.remove('is-on'));
    if (p.at >= 0) box.querySelector(`[data-i="${p.at}"]`)?.classList.add('is-on');
    const line = box.querySelector('.chart-detail');
    if (line) line.textContent = p.at >= 0 ? p.say(p.items[p.at], p.at) : p.rest;
  };
  box._show = show;
  if (box.dataset.wired) return;
  box.dataset.wired = '1';
  const hit = e => { const t = e.target instanceof Element ? e.target.closest('[data-i]') : null; if (t && box.contains(t)) box._show(Number(t.dataset.i)); };
  box.addEventListener('pointermove', hit);
  box.addEventListener('pointerdown', hit);
  box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') box._show(-1); });
  box.addEventListener('keydown', e => {
    const p = box._pick, n = p.items.length;
    if (!n || !(e.target instanceof Element) || !e.target.closest('.chart-plot')) return;
    let to = null;
    if (e.key === 'Escape') { if (p.at < 0) return; to = -1; }
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    else if (p.moveBy) to = p.moveBy(p.at, e.key, p.items);
    else if (e.key === 'ArrowLeft') to = p.at < 0 ? n - 1 : Math.max(0, p.at - 1);
    else if (e.key === 'ArrowRight') to = p.at < 0 ? n - 1 : Math.min(n - 1, p.at + 1);
    if (to === null || to === undefined) return;
    e.preventDefault(); e.stopPropagation();
    box._show(to);
  });
}
// Redraw a chart's box, keeping the keyboard where it was if it was on the plot.
function draw(box, html) {
  const had = box.contains(document.activeElement) && document.activeElement.classList.contains('chart-plot');
  box.innerHTML = html;
  if (had) box.querySelector('.chart-plot')?.focus({ preventScroll: true });
}

// A round top for an axis, and the steps up to it: at most five lines, on whole numbers.
function axis(max) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
  const step = steps.find(s => max / s <= 4) || steps[steps.length - 1];
  const top = Math.max(step, Math.ceil(max / step) * step), ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}
const widthOf = el => Math.max(260, Math.round(el.clientWidth || 320));

// ── Check-ins as bars ──────────────────────────────────────
// series: stats.barSeries(...). The SVG is drawn at the pixel width of its box (app.js redraws when that changes),
// so text stays its real size; colours come from CSS variables and follow the theme by themselves.
export function renderBars(box, series, range) {
  const total = series.reduce((s, b) => s + b.done, 0);
  if (!total) { draw(box, '<p class="empty-note chart-detail" id="bars-none">No check-ins in this period yet.</p>'); picker(box, [], () => '', 'No check-ins in this period yet.'); return; }
  const W = widthOf(box), H = 200, L = 30, R = 4, T = 10, B = 24;
  const n = series.length, plotW = W - L - R, plotH = H - T - B, slot = plotW / n, bw = Math.max(2, Math.min(36, slot * 0.68));
  const { top, ticks } = axis(Math.max(...series.map(b => b.done)));
  const y = v => T + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 44))));
  const best = series.reduce((a, b) => (b.done >= a.done ? b : a));
  const daily = series[0].unit === 'day';
  const say = b => `${b.long}: ${plural(b.done, 'check-in')}${b.owed ? `, ${b.doneOwed} of ${b.owed} due done` : ''}${b.now ? ' so far' : ''}.`;
  const rest = `${plural(total, 'check-in')}, ${range.label.toLowerCase()}. Most ${daily ? 'on' : 'in'} ${best.long} (${best.done}).`;
  const grid = ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="y-label" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const slots = series.map((b, i) => {
    const x = L + i * slot, h = b.done ? Math.max(2, (b.done / top) * plotH) : 0;
    const label = (n - 1 - i) % every === 0 ? `<text class="x-label" x="${x + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(b.label)}</text>` : '';
    return `<g class="bar-slot${b.now ? ' is-now' : ''}" data-i="${i}" data-v="${b.done}"><rect class="bar-hit" x="${x}" y="${T}" width="${slot}" height="${plotH}"/><rect class="bar-rect" x="${x + (slot - bw) / 2}" y="${T + plotH - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 2, h / 2)}"/>${label}</g>`;
  }).join('');
  draw(box, `
    <div class="chart-plot" tabindex="0" role="group" aria-label="Check-ins, ${esc(range.label.toLowerCase())}: ${n} bars. Use the left and right arrow keys to read each one.">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">${grid}${slots}</svg>
    </div>
    <p class="chart-detail" aria-live="polite">${esc(rest)}</p>
    <div class="sr-only"><table><caption>Check-ins, ${esc(range.label.toLowerCase())}</caption><thead><tr><th scope="col">When</th><th scope="col">Check-ins</th><th scope="col">Done of what was due</th></tr></thead>
      <tbody>${series.map(b => `<tr><th scope="row">${esc(b.long)}</th><td>${b.done}</td><td>${b.owed ? `${b.doneOwed} of ${b.owed}` : 'nothing due'}</td></tr>`).join('')}</tbody></table></div>`);
  picker(box, series, say, rest);
}

// ── Categories ─────────────────────────────────────────────
// rows: [{ key, checkins }]. look(key) gives { label, color } for a category.
export function renderCategories(el, rows, look) {
  if (!rows.length) { el.innerHTML = '<p class="empty-note">No check-ins in this period yet.</p>'; return; }
  const max = Math.max(...rows.map(r => r.checkins));
  el.innerHTML = rows.map(r => {
    const { label, color } = look(r.key);
    return `<div class="cat-row" data-cat="${esc(r.key)}" style="--cat:${esc(color)}">
      <span class="cat-name"><i class="cat-dot" aria-hidden="true"></i>${esc(label)}</span>
      <span class="cat-bar" aria-hidden="true"><span class="cat-fill" style="width:${Math.max(2, Math.round((r.checkins / max) * 100))}%"></span></span>
      <span class="cat-n">${r.checkins}</span>
    </div>`;
  }).join('');
}

// ── The rate as a line, against the period before ──────────
// t: stats.trend(...). The solid line is this period, the dashed one the period before; each is broken where
// nothing was due. The sentence under it carries the comparison in words.
const linePath = (pts, x, y) => { let d = '', pen = false; pts.forEach((p, i) => { if (p.rate === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.rate).toFixed(1)}`; pen = true; }); return d; };
export function trendSentence(t, range) {
  if (t.rate === null) return 'Nothing was due day by day in this period, so there is no rate to draw.';
  const head = `${t.rate}% done (${t.doneOwed} of ${t.owed})`;
  if (!range.prev) return `${head} since the start.`;
  if (t.delta === null) return `${head}. Nothing was due in ${range.prevLabel}, so there is nothing to compare with yet.`;
  if (t.delta === 0) return `${head}, the same as ${range.prevLabel}.`;
  return `${head}, ${t.delta > 0 ? 'up' : 'down'} ${plural(Math.abs(t.delta), 'point')} on ${range.prevLabel} (${t.prevRate}%).`;
}
export function renderTrend(box, t, range) {
  const rest = trendSentence(t, range);
  if (t.rate === null) { draw(box, `<p class="empty-note chart-detail" id="trend-none">${esc(rest)}</p>`); picker(box, [], () => '', rest); return; }
  const W = widthOf(box), H = 180, L = 38, R = 10, T = 12, B = 24;
  const n = t.now.length, plotW = W - L - R, plotH = H - T - B;
  const x = i => (n === 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW), y = v => T + plotH - (v / 100) * plotH;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 52))));
  const grid = [0, 50, 100].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="y-label" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const slotW = n === 1 ? plotW : plotW / (n - 1);
  const pts = t.now.map((p, i) => {
    const label = (n - 1 - i) % every === 0 ? `<text class="x-label" x="${x(i)}" y="${H - 6}" text-anchor="${n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle'}">${esc(p.label)}</text>` : '';
    const was = t.before && t.before[i] && t.before[i].rate !== null ? `<circle class="dot dot-before" cx="${x(i)}" cy="${y(t.before[i].rate)}" r="3"/>` : '';
    return `<g class="trend-pt" data-i="${i}"><rect class="bar-hit" x="${x(i) - slotW / 2}" y="${T}" width="${slotW}" height="${plotH}"/><line class="pt-rule" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + plotH}"/>${was}${p.rate === null ? '' : `<circle class="dot dot-now" cx="${x(i)}" cy="${y(p.rate)}" r="${n > 16 ? 2.5 : 3.5}"/>`}${label}</g>`;
  }).join('');
  const say = (p, i) => {
    const was = t.before && t.before[i];
    return `${p.long}: ${p.rate === null ? 'nothing was due' : `${p.rate}% (${p.doneOwed} of ${p.owed})`}.${was ? ` ${was.long}: ${was.rate === null ? 'nothing was due' : was.rate + '%'}.` : ''}`;
  };
  const mark = t.delta === null ? '' : `<span class="delta is-${t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : 'flat'}" id="trend-delta"><svg class="icon" aria-hidden="true"><use href="#i-${t.delta > 0 ? 'trend-up' : t.delta < 0 ? 'trend-down' : 'minus'}"/></svg>${t.delta === 0 ? 'No change' : `${Math.abs(t.delta)} ${Math.abs(t.delta) === 1 ? 'point' : 'points'} ${t.delta > 0 ? 'up' : 'down'}`}</span>`;
  draw(box, `
    <div class="trend-head"><strong class="trend-rate" id="trend-rate">${t.rate}%</strong>${mark}</div>
    <div class="chart-plot" tabindex="0" role="group" aria-label="Completion rate, ${esc(range.label.toLowerCase())}: ${n} points. Use the left and right arrow keys to read each one.">
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">${grid}
        ${t.before ? `<path class="trend-line trend-before" d="${linePath(t.before, x, y)}"/>` : ''}
        <path class="trend-line trend-now" d="${linePath(t.now, x, y)}"/>${pts}</svg>
    </div>
    ${t.before ? `<ul class="chart-legend" aria-hidden="true"><li><i class="lg-line"></i>${esc(range.label)}</li><li><i class="lg-line is-before"></i>${esc(range.prevLabel[0].toUpperCase() + range.prevLabel.slice(1))}</li></ul>` : ''}
    <p class="chart-detail" aria-live="polite">${esc(rest)}</p>
    <div class="sr-only"><table><caption>Completion rate, ${esc(range.label.toLowerCase())}</caption><thead><tr><th scope="col">When</th><th scope="col">Rate</th>${t.before ? '<th scope="col">The period before</th>' : ''}</tr></thead>
      <tbody>${t.now.map((p, i) => `<tr><th scope="row">${esc(p.long)}</th><td>${p.rate === null ? 'nothing due' : p.rate + '%'}</td>${t.before ? `<td>${t.before[i] && t.before[i].rate !== null ? t.before[i].rate + '%' : 'nothing due'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`);
  picker(box, t.now, say, rest);
}
