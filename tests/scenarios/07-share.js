// Growth loop: link previews and shared stories must point back to the app.
module.exports = (scenario, c) => {
  const { ev, waitFor, boot, check, sleep, signedIn, noExceptions } = c;
  const key = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const habit = dates => ({ userId: 'u-test', name: 'Run', category: 'fitness', frequency: 'daily', completedDates: dates, createdAt: new Date(Date.now() - 9 * 864e5).toISOString(), order: 1 });

  scenario('share: link-preview metadata and a correctly sized OG image', async () => {
    await boot();
    const meta = await ev(`(()=>{const g=p=>(document.querySelector('meta[property="'+p+'"]')||document.querySelector('meta[name="'+p+'"]')||{}).content; return {t:g('og:title'),i:g('og:image'),c:g('twitter:card'),u:g('og:url')}})()`);
    check('og:title present', !!meta.t, JSON.stringify(meta));
    check('twitter:card is large image', meta.c === 'summary_large_image');
    check('og:image is an absolute https URL', /^https:\/\/.+\/og-image\.png$/.test(meta.i), meta.i);
    const dims = await ev(`fetch('/og-image.png').then(r => r.arrayBuffer()).then(b => { const v = new DataView(b); return [v.getUint32(16), v.getUint32(20), v.getUint8(1)] })`);
    check('og-image.png is a 1200x630 PNG', dims[0] === 1200 && dims[1] === 630 && dims[2] === 0x50, JSON.stringify(dims));
  });

  scenario('share: sharing the story includes a streak count and the app link', async () => {
    const stub = `(()=>{ window.__shared=[]; navigator.canShare=()=>true; navigator.share=async d=>{window.__shared.push({text:d.text,url:d.url,files:(d.files||[]).length}); }; })();`;
    await boot({ seed: { ...signedIn(), mock_fb_db: { habits: { h1: habit([key(0), key(-1), key(-2), key(-3)]) } } }, initScript: stub });
    await waitFor(`!document.getElementById('app').classList.contains('hidden')`);
    await ev(`document.getElementById('open-share-trigger').click()`);
    await waitFor(`!document.getElementById('share-card-modal').classList.contains('hidden')`);
    await sleep(1200);
    await ev(`document.getElementById('share-card-share').click()`);
    check('share sheet invoked', await waitFor(`window.__shared.length === 1`));
    const s = await ev(`window.__shared[0]`);
    check('message names the 4-day streak', /4-day streak/.test(s.text), s.text);
    check('message includes the app link', /habit-tracker-demo-34c0a\.web\.app/.test(s.text), s.text);
    check('story image attached', s.files === 1, s.files);
    noExceptions();
  });
};
