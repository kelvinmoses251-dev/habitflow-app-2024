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
