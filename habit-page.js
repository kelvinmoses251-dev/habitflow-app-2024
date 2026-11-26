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
