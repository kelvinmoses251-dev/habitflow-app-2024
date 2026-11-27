// habit-page.js: draws the sections of a habit's own page (the calendar, and more as batch 5 grows).
//
// It only draws. app.js hands over what habit-history.js worked out; nothing here reads habits, saves anything or
// decides a rule. Every piece of text that came from a person goes through esc().

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const icon = (name, cls = '') => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const at = day => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const longDay = day => at(day).toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' }) + ' ' + at(day).getUTCDate() + ' ' + at(day).toLocaleDateString('en', { month: 'long', timeZone: 'UTC' });

// What each kind of day is called, for screen readers and the legend
export const STATE_WORDS = { done: 'done', shield: 'covered by a streak shield', open: 'not done yet', missed: 'missed', paused: 'paused', rest: 'nothing due', before: 'before this habit began', future: '' };
const WEEKDAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];

// ── The month calendar ─────────────────────────────────────
// grid: habitHistory.monthGrid(...). A real table, so screen readers can walk it by row and column; each day's
// cell says in words what happened. Done days next to each other are joined into one band (run-start/mid/end).
export function renderCalendar(el, grid) {
  const say = c => `${longDay(c.day)}${STATE_WORDS[c.state] ? ': ' + STATE_WORDS[c.state] : ''}${c.late ? ', filled in late' : ''}${c.today ? ' (today)' : ''}`;
  const td = c => (!c.inMonth ? `<td class="cal-out${c.run && c.run !== 'single' ? ' run-' + c.run : ''}" aria-hidden="true"></td>`
    : `<td class="cal-day is-${c.state}${c.run ? ' run-' + c.run : ''}${c.today ? ' is-today' : ''}${c.late ? ' is-late' : ''}" data-day="${c.day}" aria-label="${esc(say(c))}"><span class="cal-num" aria-hidden="true">${Number(c.day.slice(8))}</span></td>`);
  el.innerHTML = `
    <div class="cal-head">
      <button type="button" class="btn-icon cal-nav" data-cal="${grid.prev || ''}" ${grid.prev ? '' : 'disabled'} aria-label="Previous month">${icon('chevron-left')}</button>
      <strong class="cal-label" id="cal-label" aria-live="polite">${esc(grid.label)}</strong>
      <button type="button" class="btn-icon cal-nav" data-cal="${grid.next || ''}" ${grid.next ? '' : 'disabled'} aria-label="Next month">${icon('chevron-right')}</button>
    </div>
    <table class="cal" aria-labelledby="cal-label">
      <thead><tr>${WEEKDAYS.map(([a, full]) => `<th scope="col"><abbr title="${full}">${a[0]}</abbr><span class="sr-only">${full}</span></th>`).join('')}</tr></thead>
      <tbody>${grid.weeks.map(w => `<tr>${w.map(td).join('')}</tr>`).join('')}</tbody>
    </table>
    <p class="cal-sum" id="cal-sum">${grid.owed ? `${grid.done} of ${grid.owed} days done this month` : grid.done ? `${grid.done} ${grid.done === 1 ? 'day' : 'days'} done this month` : 'Nothing was due this month'}</p>
    <ul class="cal-legend" aria-hidden="true">
      <li><i class="lg is-done"></i>Done</li><li><i class="lg is-shield"></i>Shield</li><li><i class="lg is-missed"></i>Missed</li><li><i class="lg is-rest"></i>Rest or paused</li>
    </ul>`;
}

// ── Charts ─────────────────────────────────────────────────
// Bars are plain boxes sized by a custom property; each chart also says its numbers in a sentence and carries the
// full figures in its label, so nothing depends on seeing the bars.
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export function renderWeeksChart(el, weeks) {
  const any = weeks.some(w => w.rate !== null);
  if (!any) { el.innerHTML = '<p class="sheet-note" id="weeks-none">A monthly habit has no week-by-week chart. Its calendar and year show the whole story.</p>'; return; }
  const known = weeks.filter(w => w.rate !== null), avg = Math.round(known.reduce((s, w) => s + w.rate, 0) / known.length), now = weeks[weeks.length - 1];
  const label = 'Completion over the last twelve weeks, oldest first: ' + weeks.map(w => (w.rate === null ? 'nothing due' : w.rate + '%')).join(', ');
  el.innerHTML = `
    <div class="chart" role="img" aria-label="${esc(label)}">
      <div class="bars bars-12">${weeks.map(w => `<span class="bar${w.current ? ' is-now' : ''}${w.rate === null ? ' is-none' : ''}" style="--h:${w.rate === null ? 0 : Math.max(4, w.rate)}%" data-rate="${w.rate === null ? '' : w.rate}"></span>`).join('')}</div>
      <div class="bars-axis"><span>12 weeks ago</span><span>This week</span></div>
    </div>
    <p class="chart-cap" id="weeks-cap">${now.rate === null ? 'Nothing due this week.' : `This week: ${now.done} of ${now.due}.`} Twelve-week average: ${avg}%.</p>`;
}
export function renderWeekdayChart(el, days) {
  const counted = days.some(d => d.rate !== null), max = Math.max(1, ...days.map(d => d.done)), best = days.find(d => d.best);
  if (!days.some(d => d.done > 0)) { el.innerHTML = '<p class="sheet-note" id="weekday-none">Complete this habit a few times and its best days show here.</p>'; return; }
  const height = d => (counted ? (d.rate === null ? 0 : Math.max(4, d.rate)) : Math.max(d.done ? 6 : 0, Math.round((d.done / max) * 100)));
  const label = 'By day of the week, over twelve weeks: ' + days.map(d => `${d.label} ${counted ? (d.rate === null ? 'not due' : `${d.done} of ${d.due}`) : plural(d.done, 'time')}`).join(', ');
  const cap = !best ? 'Not enough days yet to name a best day.'
    : counted ? `Best on ${best.label}s: ${best.done} of ${best.due}.` : `Most often done on ${best.label}s (${plural(best.done, 'time')}).`;
  el.innerHTML = `
    <div class="chart" role="img" aria-label="${esc(label)}">
      <div class="bars bars-7">${days.map(d => `<span class="bar-col"><span class="bar${d.best ? ' is-best' : ''}${counted && d.rate === null ? ' is-none' : ''}" style="--h:${height(d)}%"></span><span class="bar-lbl">${d.label[0]}</span></span>`).join('')}</div>
    </div>
    <p class="chart-cap" id="weekday-cap">${cap}</p>`;
}

// ── The last year ──────────────────────────────────────────
// year: habitHistory.yearCells(...). The grid scrolls sideways inside its own box on a narrow screen; the page never
// does. The sentence under it is the text equivalent.
export function renderYear(el, year, keepScroll = false) {
  const was = keepScroll && el.querySelector('.year-scroll') ? el.querySelector('.year-scroll').scrollLeft : null;
  el.innerHTML = `
    <div class="year-scroll" id="year-scroll" tabindex="0" role="group" aria-label="The last year, day by day. ${year.due ? `${year.done} of ${year.due} days done.` : ''}">
      <div class="year-inner">
        <div class="year-months" aria-hidden="true">${year.months.map(m => `<span style="grid-column:${m.col + 1}">${m.label}</span>`).join('')}</div>
        <div class="year-grid" aria-hidden="true">${year.weeks.map(col => `<span class="year-col">${col.map(c => `<i class="yc is-${c.state}${c.today ? ' is-today' : ''}" data-day="${c.day}"></i>`).join('')}</span>`).join('')}</div>
      </div>
    </div>
    <p class="chart-cap" id="year-sum">${year.due ? `${year.done} of ${plural(year.due, 'day')} in the last year.` : year.done ? `${plural(year.done, 'day')} done in the last year.` : 'Nothing was due in the last year.'}</p>`;
  const box = el.querySelector('.year-scroll');
  box.scrollLeft = was === null ? box.scrollWidth : was;      // start at today (the right-hand end); a redraw stays where the person scrolled to
}

// ── Notes: a timeline by month ─────────────────────────────
// items: habitHistory.searchNotes(...). total: how many notes there are before searching. The delete button keeps
// the class and data attribute the app's handler already listens for.
const noteWhen = iso => { const d = new Date(iso); return d.toLocaleDateString('en', { weekday: 'short' }) + ' ' + d.getDate() + ' ' + d.toLocaleDateString('en', { month: 'short' }) + ', ' + d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }).toLowerCase(); };
const monthOf = iso => { const d = new Date(iso); return d.toLocaleDateString('en', { month: 'long' }) + ' ' + d.getFullYear(); };
export function renderNotes(el, items, { total, query }) {
  if (!total) { el.innerHTML = '<p class="journal-empty">No notes yet.</p>'; return; }
  if (!items.length) { el.innerHTML = `<p class="journal-empty" id="notes-none">No notes match “${esc(query)}”.</p>`; return; }
  let html = '', month = '';
  for (const n of items) {
    const m = monthOf(n.date);
    if (m !== month) { html += `${month ? '</ol>' : ''}<h3 class="notes-month">${esc(m)}</h3><ol class="notes-list">`; month = m; }
    html += `<li class="journal-entry">
      <div class="journal-meta"><time datetime="${esc(n.date)}">${esc(noteWhen(n.date))}</time>
        <button class="delete-journal-btn" type="button" data-date="${esc(n.date)}" aria-label="Delete the note from ${esc(noteWhen(n.date))}">${icon('trash')}</button></div>
      <div class="journal-text">${n.parts.map(p => (p.hit ? `<mark>${esc(p.text)}</mark>` : esc(p.text))).join('')}</div></li>`;
  }
  el.innerHTML = html + '</ol>';
}

// ── Insights ───────────────────────────────────────────────
// items: habitHistory.habitInsights(...). Sentences are built from numbers and fixed words, but are escaped anyway.
export function renderInsights(el, items) {
  el.innerHTML = items.map(i => `<li${i.placeholder ? ' class="is-waiting"' : ''}><span class="ins-ic" aria-hidden="true">${icon(i.icon)}</span><span>${esc(i.text)}</span></li>`).join('');
}

// ── Focus sessions ─────────────────────────────────────────
// totals: habitHistory.sessionTotals(...)
const duration = min => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}`);
export function renderSessions(listEl, totalEl, totals) {
  totalEl.textContent = totals.count ? `${plural(totals.count, 'session')}, ${duration(totals.minutes)} in all.` : 'No sessions yet. A finished session also completes the habit for today.';
  listEl.innerHTML = totals.recent.map(s => `<li><strong>${duration(s.minutes)}</strong><time datetime="${new Date(s.at).toISOString()}">${esc(noteWhen(new Date(s.at).toISOString()))}</time></li>`).join('');
}
