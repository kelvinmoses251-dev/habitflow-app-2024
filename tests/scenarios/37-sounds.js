// Sound themes (roadmap batch 4, item 40): off by default, three themes, chosen in Profile.
module.exports = (scenario, c) => {
  const { boot, ev, send, sleep, waitFor, signedIn, check, visible, noExceptions } = c;
  const H = (name, o = {}) => ({ userId: 'u-test', name, category: 'health', frequency: 'daily', completedDates: [], createdAt: '2025-01-05T10:00:00Z', order: 1, ...o });
  const seed = (habits, extra = {}) => signedIn({ habitly_confirm: null, ...extra, mock_fb_db: { habits, users: { 'u-test': { xp: 300 } } } });
  const rows = () => waitFor(`!!document.querySelector('#page-home .habit-item')`);
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  // A stand-in AudioContext that writes down every tone asked of it
  const audioSpy = `window.__audio = { ctx: 0, osc: [] };
    (() => { const P = on => ({ setValueAtTime(v) { on(v); return this; }, linearRampToValueAtTime(v) { on(v); return this; }, exponentialRampToValueAtTime(v) { on(v); return this; } });
      class FakeCtx { constructor() { window.__audio.ctx++; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
        createOscillator() { const o = { type: 'sine', freqs: [], connect() {}, start() {}, stop() {} }; o.frequency = P(v => o.freqs.push(v)); window.__audio.osc.push(o); return o; }
        createGain() { return { gain: P(() => {}), connect() {} }; } resume() {} }
      window.AudioContext = FakeCtx; window.webkitAudioContext = FakeCtx; })();`;
  const heard = () => ev(`(() => { const s = window.__audio.osc.map(o => o.type + ':' + o.freqs.join('>')).join('|'); window.__audio.osc = []; return s; })()`);
  const pick = v => ev(`document.querySelector('input[name="sound-theme"][value="${v}"]').click()`);
  const chosen = () => ev(`(document.querySelector('input[name="sound-theme"]:checked') || {}).value`);
  const tick = id => ev(`document.querySelector('.habit-item[data-id="${id}"] .habit-check').click()`);
  const key = k => send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: k === 'ArrowLeft' ? 37 : 39 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k }));

  scenario('sounds: off by default; switched on, three themes can be heard and chosen', async () => {
    await boot({ seed: seed({ a: H('Read'), b: H('Run', { order: 2 }) }), initScript: audioSpy }); await rows(); await sleep(300);
    await tick('a'); await sleep(700);
    check('with sound off, completing a habit creates no audio at all', (await ev(`window.__audio.ctx`)) === 0 && (await heard()) === '');
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('the theme choice is hidden while sound is off', !(await visible('#sound-theme-row')));
    await ev(`document.getElementById('sound-toggle').click()`); await sleep(300);
    check('switching sound on shows the themes', await visible('#sound-theme-row'));
    const soft = await heard();
    check('and plays a tick so it can be heard', soft.length > 0, soft);
    const group = JSON.parse(await ev(`(() => { const g = document.querySelector('#sound-theme-row [role="radiogroup"]'); const r = [...g.querySelectorAll('input[type="radio"]')];
      return JSON.stringify({ labelled: !!document.getElementById(g.getAttribute('aria-labelledby')), values: r.map(x => x.value), names: r.map(x => x.closest('label').textContent.trim()), oneName: new Set(r.map(x => x.name)).size === 1,
        sizes: r.map(x => Math.round(x.closest('label').getBoundingClientRect().height)), focusable: r.every(x => !x.disabled && x.tabIndex >= 0) }); })()`));
    check('they are a labelled radio group of three: Soft, Wood, Glass', group.labelled && group.oneName && group.values.join(',') === 'soft,wood,glass' && group.names.join(',') === 'Soft,Wood,Glass', JSON.stringify(group));
    check('each is a 44px target that the keyboard can reach', group.sizes.every(h => h >= 44) && group.focusable, JSON.stringify(group.sizes));
    check('Soft is chosen to begin with', (await chosen()) === 'soft');
    await pick('wood'); await sleep(300);
    const wood = await heard();
    check('choosing Wood plays it once and remembers it', wood.length > 0 && (await ev(`localStorage.getItem('habitly_sound_theme')`)) === 'wood', wood);
    await pick('glass'); await sleep(300);
    const glass = await heard();
    check('choosing Glass plays it', glass.length > 0 && (await ev(`localStorage.getItem('habitly_sound_theme')`)) === 'glass', glass);
    check('the three do not sound alike', new Set([soft, wood, glass]).size === 3, [soft, wood, glass].join('  /  '));
    await ev(`document.querySelector('input[name="sound-theme"]:checked').focus()`); await key('ArrowLeft'); await sleep(300);
    check('the arrow keys move between themes', (await chosen()) === 'wood' && (await heard()) === wood, await chosen());
    await size(320, 568); await sleep(200);
    check('320px: the row fits', await ev(`document.documentElement.scrollWidth <= innerWidth && document.getElementById('sound-theme-row').getBoundingClientRect().right <= innerWidth`));
    await ev(`location.hash = '#home'`); await sleep(400);
    await tick('b'); await sleep(200);
    check('completing a habit now plays the chosen theme', (await heard()) === wood);
    await sleep(900); await heard();
    await tick('b'); await sleep(300);
    const back = await heard();
    check('taking it back plays only the quieter, falling un-tick', back.length > 0 && back !== wood && !back.includes('|') && (() => { const f = back.split(':')[1].split('>').map(Number); return f[f.length - 1] < f[0]; })(), back);
    await ev(`location.reload()`); await sleep(500); await rows(); await sleep(400);
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('after a reload the choice is still Wood and sound is still on', (await chosen()) === 'wood' && await ev(`document.getElementById('sound-toggle').checked`) && await visible('#sound-theme-row'));
    noExceptions();
  });

  scenario('sounds: a stored theme that makes no sense falls back to Soft', async () => {
    await boot({ seed: seed({ a: H('Read') }, { habitly_sound: 'on', habitly_sound_theme: 'banana' }), initScript: audioSpy }); await rows(); await sleep(300);
    await tick('a'); await sleep(300);
    const first = await heard();
    check('a tick still plays', first.length > 0, first);
    check('it is the Soft one', /^sine:520>920$/.test(first), first);
    await ev(`location.hash = '#profile'`); await sleep(400);
    check('and Profile shows Soft', (await chosen()) === 'soft');
    noExceptions();
  });
};
