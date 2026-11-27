// Export (roadmap batch 6): every check-in as a CSV, and a redesigned PDF report. Both are made on the device.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(Date.now() - n * 864e5);
  const run = (from, to) => { const out = []; for (let n = from; n <= to; n++) out.push(day(n)); return out; };
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, user = {}, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300, streakShields: 0, frozenDates: [], shieldUsedAt: Date.now(), ...user } } } });
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
  const trim = async sel => (await text(sel)).replace(/\s+/g, ' ').trim();
  // Catch what would be downloaded: the file name from the link, and the bytes from the blob behind it.
  const spy = `window.__files = []; window.__blobs = [];
    const _make = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { if (b instanceof Blob) window.__blobs.push(b); return _make(b); };
    const _click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__files.push(this.download); return; } return _click.call(this); };
    const _dispatch = HTMLAnchorElement.prototype.dispatchEvent; HTMLAnchorElement.prototype.dispatchEvent = function (e) { if (this.download && e && e.type === 'click') { window.__files.push(this.download); return true; } return _dispatch.call(this, e); };`;
  const lastBlob = () => ev(`(async () => { const b = window.__blobs[window.__blobs.length - 1]; return b ? await b.text() : ''; })()`);
  const openExport = async () => { await waitFor(`!document.getElementById('app').classList.contains('hidden')`); await ev(`location.hash = '#profile'`); await sleep(400); await ev(`document.getElementById('export-data-btn').click()`); await sleep(400); };
  const habits = () => ({
    a: H('Read, "slowly"', { category: 'reading', completedDates: run(0, 2), moods: { [day(1)]: 4 }, journals: [{ date: new Date(Date.now() - 864e5).toISOString(), text: 'Finished the chapter.' }] }),
    b: H('=SUM(A1)', { order: 2, completedDates: [day(1)] }),
    w: H('Water', { order: 3, completedDates: [day(2)], target: { amount: 8, unit: 'glasses', step: 1 }, progress: { [day(2)]: 8 }, backfilled: { [day(2)]: true } }),
  });

  // ── 59: CSV export and a redesigned PDF report ───────────
  scenario('export: the dialog offers a PDF report or a spreadsheet', async () => {
    await boot({ seed: seed(habits()), initScript: spy }); await openExport();
    check('the export dialog opens, named', (await visible('#confirm-export-modal')) && (await trim('#export-title')) === 'Export your data' && (await ev(`document.getElementById('confirm-export-modal').getAttribute('aria-labelledby')`)) === 'export-title');
    check('it says what is in it and that nothing is sent anywhere', /3 habits and 5 check-ins/.test(await trim('#export-habit-summary')) && /nothing is sent anywhere/.test(await trim('#export-habit-summary')), await trim('#export-habit-summary'));
    check('two choices, each said in words', /PDF report/.test(await trim('#confirm-export-yes')) && /Spreadsheet \(CSV\)/.test(await trim('#export-csv')) && /Excel/.test(await trim('#export-csv')));
    check('with a handle and a way out', await ev(`!!document.querySelector('#confirm-export-modal .dialog > .sheet-handle') && !!document.querySelector('#confirm-export-modal [data-dismiss]')`));
    await ev(`document.getElementById('export-csv').click()`); await sleep(600);
    check('choosing the spreadsheet closes the dialog and says it is done', !(await visible('#confirm-export-modal')) && (await ev(`[...document.querySelectorAll('.toast')].some(t => /Spreadsheet downloaded/.test(t.textContent))`)));
    const files = await ev(`window.__files`);
    check('the file is a dated .csv', files.length === 1 && files[0] === 'habitly-check-ins-' + day(0) + '.csv', JSON.stringify(files));
    const csv = await lastBlob(), rows = csv.replace(/^﻿/, '').split('\r\n');
    check('it starts with a byte order mark and a header', (await ev(`(async () => { const b = new Uint8Array(await window.__blobs[window.__blobs.length - 1].arrayBuffer()); return b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF; })()`)) && rows[0] === 'Date,Habit,Category,Schedule,Count,Filled in late,Mood (1 to 5)', rows[0]);
    check('one row per check-in, oldest first', rows.length === 7 && rows[6] === '' && rows[1].startsWith(day(2)) && rows[5].startsWith(day(0)), String(rows.length));
    check('a name with a comma and quotes is quoted', rows.includes(`${day(1)},"Read, ""slowly""",Reading,Every day,,,4`), rows.join(' | '));
    check('a name that looks like a formula cannot run', rows.includes(`${day(1)},'=SUM(A1),Health,Every day,,,`), rows.join(' | '));
    check('a counted habit carries its count, and a day filled in late says so', rows.includes(`${day(2)},Water,Health,Every day,8 glasses,yes,`), rows.join(' | '));
    check('the PDF library was not loaded for this', (await ev(`typeof window.jspdf`)) === 'undefined');
    noExceptions();
  });

  scenario('export: the PDF report carries the same figures, and no email address', async () => {
    await boot({ seed: seed(habits()), initScript: spy }); await openExport();
    await ev(`document.getElementById('confirm-export-yes').click()`);
    check('the report is made', await waitFor(`document.getElementById('toast-container').textContent.includes('Report downloaded')`, 25000), await text('#toast-container'));
    await sleep(500);
    const files = await ev(`window.__files`), pdf = await lastBlob();
    check('as a dated .pdf', files.some(f => f === 'habitly-report-' + day(0) + '.pdf'), JSON.stringify(files));
    check('it is a PDF', pdf.startsWith('%PDF-'), pdf.slice(0, 12));
    for (const piece of ['Habit report', 'Done of what was', 'Check-ins, last 12 months', 'Your habits', 'Personal records', 'Latest notes', 'Finished the chapter.', 'Water'])
      check(`it has: ${piece}`, pdf.includes(piece));
    check('the account email is not in it', !/@/.test(pdf.replace(/%PDF[^\n]*\n/, '').replace(/<<[^>]*>>/g, '')) || !/[\w.]+@[\w.]+\.\w+/.test(pdf), (pdf.match(/[\w.]+@[\w.]+\.\w+/) || [''])[0]);
    check('the old purple banner is gone', !/0\.486 0\.227 0\.929 rg/.test(pdf));
    noExceptions();
  });

  scenario('export: with no habits there is nothing to export, and the dialog fits a phone', async () => {
    await boot({ seed: seed({}), initScript: spy }); await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`location.hash = '#profile'`); await sleep(400); await ev(`document.getElementById('export-data-btn').click()`); await sleep(400);
    check('an empty account is told so', !(await visible('#confirm-export-modal')) && (await ev(`[...document.querySelectorAll('.toast')].some(t => /No habits to export/.test(t.textContent))`)));
    await size(375, 667);
    await boot({ seed: seed(habits()), initScript: spy }); await openExport();
    check('on a phone every choice is thumb-sized and nothing overflows', (await ev(`[...document.querySelectorAll('#confirm-export-modal button')].every(b => b.getBoundingClientRect().height >= 44)`)) && (await ev(`document.documentElement.scrollWidth <= innerWidth`)));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(350);
    check('Escape closes it', !(await visible('#confirm-export-modal')));
    noExceptions();
  });
};
