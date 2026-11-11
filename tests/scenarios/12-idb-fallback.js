// Real Firestore SDK (not the mock): the persistent cache we enable for offline support must degrade gracefully
// where IndexedDB is unavailable (some WebViews, locked-down browsers). Needs the real network once (SDK from the CDN).
module.exports = (scenario, c) => {
  const { ev, send, waitFor, boot, check } = c;
  const probe = async initScript => {
    let id = null;
    if (initScript) id = (await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript })).result.identifier;
    await send('Page.navigate', { url: (await ev('location.origin')) + '/tests/idb-probe.html' });
    await waitFor(`!!window.__out`, 20000);
    const out = await ev(`window.__out`);
    if (id) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id });
    return out || {};
  };

  scenario('idb: persistent cache works with IndexedDB and degrades gracefully without it (real SDK)', async () => {
    await boot();
    // The probe page lives in tests/ and is never deployed, so this only runs against the local server.
    if (!/^http://localhost/.test(await ev('location.origin'))) { console.log('   (skipped: probe page is only served locally)'); return; }
    await send('Fetch.disable');
    try {
      const withIdb = await probe();
      check('IndexedDB present: init ok', withIdb.init === 'ok', JSON.stringify(withIdb));
      check('IndexedDB present: a write is applied locally before any server ack', withIdb.localWrite === 'applied-locally', JSON.stringify(withIdb));

      const noIdb = await probe(`Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });`);
      check('IndexedDB missing: init does not throw', noIdb.init === 'ok' && noIdb.idb === 'undefined', JSON.stringify(noIdb));
      check('IndexedDB missing: writes still apply locally (memory fallback)', noIdb.localWrite === 'applied-locally', JSON.stringify(noIdb));
    } finally {
      await send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.gstatic.com/firebasejs/*' }] });
    }
  });
};
