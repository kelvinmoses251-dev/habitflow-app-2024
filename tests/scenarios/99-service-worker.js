// Real service worker, real offline. Runs LAST because it registers/unregisters a worker and needs the real network once.
module.exports = (scenario, c) => {
  const { ev, send, waitFor, boot, check, visible, sleep } = c;
  const net = off => send('Network.emulateNetworkConditions', { offline: off, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  scenario('service worker: after one visit the app shell and landing demo load with NO network', async () => {
    await send('Fetch.disable');                                        // use the real Firebase SDK; the worker fetches it itself
    await send('Network.setBypassServiceWorker', { bypass: false });
    try {
      await boot({ seed: {} });
      check('service worker activates', await waitFor(`navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))`, 20000));
      check('app shell is cached', await waitFor(`caches.open('habitly-shell-v1').then(ch => ch.keys()).then(k => k.some(r => r.url.includes('/app.js')) && k.some(r => r.url.includes('/style.css')))`, 20000));
      check('Firebase SDK is cached', await waitFor(`caches.open('habitly-cdn-v1').then(ch => ch.keys()).then(k => k.some(r => r.url.includes('firebase-auth.js')) && k.some(r => r.url.includes('firebase-app.js')))`, 20000));

      await ev(`location.reload()`);
      await sleep(2500);
      check('page is controlled by the worker', await waitFor(`!!navigator.serviceWorker.controller`, 10000));

      await net(true);                                                  // airplane mode
      await send('Page.navigate', { url: (await ev('location.origin')) + '/index.html' });
      check('landing page renders offline', await waitFor(`!!document.getElementById('auth-screen') && !document.getElementById('auth-screen').classList.contains('hidden') && !document.getElementById('loading-screen')`, 25000));
      check('hero is visible', await visible('#landing-hero'));
      check('demo is interactive offline', (await ev(`document.querySelectorAll('.demo-habit').length`)) === 3);
      await ev(`document.querySelector('.demo-habit').click()`); await sleep(300);
      check('ticking works offline', (await ev(`document.getElementById('demo-streak-n').textContent`)) === '1');
    } finally {
      await net(false);
      await ev(`navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))).then(() => caches.keys()).then(ks => Promise.all(ks.map(k => caches.delete(k))))`).catch(() => {});
      await send('Network.setBypassServiceWorker', { bypass: true });
      await send('Fetch.enable', { patterns: [{ urlPattern: 'https://www.gstatic.com/firebasejs/*' }] });
    }
  });
};
