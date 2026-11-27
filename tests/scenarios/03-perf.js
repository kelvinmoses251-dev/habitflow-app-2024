// Load-time regressions: heavy libraries must stay out of the critical path yet keep working on demand.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, text, sleep, signedIn, noExceptions } = c;
  const habit = (name, dates) => ({ userId: 'u-test', name, category: 'fitness', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 9 * 864e5).toISOString(), order: 1 });

  scenario('perf: no heavy or dead scripts in the initial HTML', async () => {
    await boot({ seed: signedIn() });
    const html = (await ev(`fetch('/index.html').then(r => r.text())`)).toLowerCase();
    for (const dead of ['html2canvas', 'sortablejs', 'jspdf', 'chart.umd', 'cropper']) {
      check(`index.html has no <script>/<link> for ${dead}`, !new RegExp(`<(script|link)[^>]*${dead}`).test(html));
    }
    check('jsPDF not loaded yet', (await ev(`typeof window.jspdf`)) === 'undefined');
    check('no Firebase Storage import', !(await ev(`fetch('/app.js').then(r=>r.text()).then(t=>/firebase-storage/.test(t))`)));
  });

  scenario('perf: the Stats page draws its charts with no chart library', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Run', [new Date().toLocaleDateString('en-CA')]) } } } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`location.hash = '#stats'`);
    check('the check-ins chart is drawn at once', await waitFor(`!!document.querySelector('#bars svg .bar-rect')`, 3000));
    check('the categories are listed', await waitFor(`!!document.querySelector('#cat-list .cat-row')`, 3000));
    await sleep(1500);
    check('Chart.js is not loaded', (await ev(`typeof window.Chart`)) === 'undefined');
    check('the year renders', (await ev(`document.querySelectorAll('#heat .hc[data-day]').length`)) > 360);
    noExceptions();
  });

  scenario('perf: PDF export lazy-loads jsPDF and completes', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Run', []) } } } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`location.hash = '#profile'`);
    await ev(`document.getElementById('export-data-btn').click()`);
    check('confirm dialog opens', await waitFor(`!document.getElementById('confirm-export-modal').classList.contains('hidden')`));
    await ev(`document.getElementById('confirm-export-yes').click()`);
    check('PDF reports success', await waitFor(`document.getElementById('toast-container').textContent.includes('Report downloaded')`, 25000),
      await text('#toast-container'));
    noExceptions();
  });

  scenario('share card: story canvas renders with the brand font', async () => {
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit('Run', [new Date().toLocaleDateString('en-CA')]) } } } });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`document.getElementById('open-share-trigger').click()`);
    check('share modal opens', await waitFor(`!document.getElementById('share-card-modal').classList.contains('hidden')`));
    await sleep(1500);
    check('canvas has painted pixels', (await ev(`(()=>{const x=document.getElementById('share-story-canvas').getContext('2d'); return x.getImageData(540,900,1,1).data[3] > 0})()`)) === true);
    check('brand font is loaded', (await ev(`document.fonts.check('600 28px Inter')`)) === true);
    noExceptions();
  });
};
