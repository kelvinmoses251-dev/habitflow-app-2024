// Run with: node --test tests/sounds.test.js
// The three sound themes: every sound is brief, quiet, plays once, and each theme is told apart from the others.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const load = () => import(pathToFileURL(path.join(__dirname, '..', 'sounds.js')).href);

// A stand-in AudioContext that writes down what was asked of it.
function fakeCtx() {
  const log = { osc: [], peak: 0 };
  const param = onValue => ({ setValueAtTime(v, t) { onValue(v, t); return this; }, linearRampToValueAtTime(v, t) { onValue(v, t); return this; }, exponentialRampToValueAtTime(v, t) { onValue(v, t); return this; } });
  const ctx = {
    currentTime: 3, destination: {},
    createOscillator() {
      const o = { type: 'sine', freqs: [], connect() {}, start(t) { o.t0 = t; }, stop(t) { o.t1 = t; } };
      o.frequency = param(v => o.freqs.push(v));
      log.osc.push(o);
      return o;
    },
    createGain() { return { gain: param(v => { log.peak = Math.max(log.peak, v); }), connect() {} }; },
  };
  return { ctx, log };
}
const SOUNDS = ['tick', 'untick', 'chime', 'levelUp', 'milestone'];

test('three themes, each with a name', async () => {
  const { SOUND_THEMES, SOUND_THEME_NAMES, soundTheme } = await load();
  assert.deepEqual(SOUND_THEMES, ['soft', 'wood', 'glass']);
  for (const t of SOUND_THEMES) assert.ok(SOUND_THEME_NAMES[t]);
  assert.equal(soundTheme('wood'), 'wood');
  for (const bad of [undefined, null, '', 'loud', 7]) assert.equal(soundTheme(bad), 'soft', String(bad));
});

test('every sound in every theme is brief, quiet and made of ordinary tones', async () => {
  const { SOUND_THEMES, createSounds } = await load();
  for (const theme of SOUND_THEMES) for (const name of SOUNDS) {
    const { ctx, log } = fakeCtx();
    createSounds(() => ctx, () => theme)[name]();
    const at = `${theme}.${name}`;
    assert.ok(log.osc.length >= 1 && log.osc.length <= 8, at + ' tones: ' + log.osc.length);
    for (const o of log.osc) {
      assert.ok(['sine', 'triangle'].includes(o.type), at + ' type ' + o.type);
      assert.ok(o.t0 >= 3 && o.t1 > o.t0, at + ' starts and stops');
      assert.ok(o.t1 - 3 <= 1.2, at + ' ends ' + (o.t1 - 3).toFixed(2) + 's in');
      assert.ok(o.freqs.every(f => f >= 120 && f <= 4000), at + ' pitch ' + o.freqs);
    }
    assert.ok(log.peak > 0.02 && log.peak <= 0.35, at + ' peak ' + log.peak);
  }
});

test('the themes do not sound alike: each tick differs in pitch or tone', async () => {
  const { SOUND_THEMES, createSounds } = await load();
  const sig = theme => { const { ctx, log } = fakeCtx(); createSounds(() => ctx, () => theme).tick(); return log.osc.map(o => o.type + ':' + o.freqs.join('>')).join('|'); };
  const sigs = SOUND_THEMES.map(sig);
  assert.equal(new Set(sigs).size, 3, sigs.join('  /  '));
});

test('with sound off nothing is created, and a broken audio device never throws', async () => {
  const { createSounds } = await load();
  let asked = 0;
  const off = createSounds(() => { asked++; return null; }, () => 'soft');
  SOUNDS.forEach(n => off[n]());
  assert.equal(asked, SOUNDS.length);
  const broken = createSounds(() => ({ currentTime: 0, createOscillator() { throw new Error('no audio'); } }), () => 'glass');
  const warn = console.warn; console.warn = () => {};
  try { assert.doesNotThrow(() => SOUNDS.forEach(n => broken[n]())); } finally { console.warn = warn; }
});

test('preview plays the tick of the theme asked for, whatever is selected', async () => {
  const { createSounds } = await load();
  const a = fakeCtx(), b = fakeCtx();
  createSounds(() => a.ctx, () => 'soft').preview('wood');
  createSounds(() => b.ctx, () => 'wood').tick();
  assert.deepEqual(a.log.osc.map(o => o.type + o.freqs), b.log.osc.map(o => o.type + o.freqs));
});

test('an unknown theme falls back to Soft', async () => {
  const { createSounds } = await load();
  const a = fakeCtx(), b = fakeCtx();
  createSounds(() => a.ctx, () => 'banana').tick();
  createSounds(() => b.ctx, () => 'soft').tick();
  assert.deepEqual(a.log.osc.map(o => o.type + o.freqs), b.log.osc.map(o => o.type + o.freqs));
});
