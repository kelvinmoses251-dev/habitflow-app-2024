// sounds.js: Habitly's optional sounds, in three themes. Web Audio only: nothing is downloaded.
//
// Soft is round and warm (sine tones that glide). Wood is short, dry and low (a tap on a block). Glass is light and
// bell-like (a high tone with a quiet overtone). Every sound is brief (under 1.2 seconds), quiet (peak gain at or
// below 0.35) and plays once. Sound is off unless the person switches it on in Profile.
// Unit tests: node --test tests/sounds.test.js

export const SOUND_THEMES = ['soft', 'wood', 'glass'];
export const SOUND_THEME_NAMES = { soft: 'Soft', wood: 'Wood', glass: 'Glass' };

// One tone: an oscillator through its own gain, with a short attack and a decay to silence.
// { type, f (start pitch), to (end pitch), at (delay), dur, gain, attack }
function tone(ctx, t0, { type = 'sine', f, to = f, at = 0, dur, gain = 0.3, attack = 0.006 }) {
  const osc = ctx.createOscillator(), g = ctx.createGain(), start = t0 + at;
  osc.type = type;
  osc.frequency.setValueAtTime(f, start);
  if (to !== f) osc.frequency.exponentialRampToValueAtTime(to, start + dur * 0.75);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(Math.min(0.35, gain), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(start); osc.stop(start + dur + 0.02);
}
const seq = (notes, step, each) => notes.map((f, i) => ({ f, at: i * step, ...each }));
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.51, G6 = 1567.98;
const G4 = 392, B4 = 493.88, D5 = 587.33, B5 = 987.77, D6 = 1174.66;
const Gs6 = 1661.22, B6 = 1975.53, E7 = 2637.02;

// Each sound is a list of tones.
const THEMES = {
  soft: {
    tick:    [{ f: 520, to: 920, dur: 0.12, gain: 0.35 }],
    untick:  [{ f: 580, to: 300, dur: 0.09, gain: 0.2 }],
    chime:   seq([C5, E5, G5, C6, E6], 0.09, { dur: 0.6, gain: 0.3, attack: 0.02 }),
    levelUp: seq([C5, E5, G5, C6, E6, G6], 0.1, { type: 'triangle', dur: 0.6, gain: 0.22, attack: 0.03 }),
  },
  wood: {
    tick:    [{ type: 'triangle', f: 310, to: 220, dur: 0.07, gain: 0.35, attack: 0.002 }, { type: 'triangle', f: 640, dur: 0.03, gain: 0.14, attack: 0.001 }],
    untick:  [{ type: 'triangle', f: 230, to: 160, dur: 0.06, gain: 0.22, attack: 0.002 }],
    chime:   seq([G4, B4, D5, G5], 0.085, { type: 'triangle', dur: 0.16, gain: 0.32, attack: 0.002 }),
    levelUp: seq([G4, B4, D5, G5, B5, D6], 0.09, { type: 'triangle', dur: 0.2, gain: 0.3, attack: 0.002 }),
  },
  glass: {
    tick:    [{ f: 1320, dur: 0.26, gain: 0.2, attack: 0.003 }, { f: 2640, dur: 0.12, gain: 0.07, attack: 0.003 }],
    untick:  [{ f: 990, to: 880, dur: 0.14, gain: 0.13, attack: 0.003 }],
    chime:   [...seq([E6, Gs6, B6, E7], 0.1, { dur: 0.7, gain: 0.15, attack: 0.004 }), ...seq([E7, E7 * 1.26], 0.3, { dur: 0.4, gain: 0.04 })],
    levelUp: seq([E6, Gs6, B6, E7, B6, E7], 0.11, { dur: 0.55, gain: 0.15, attack: 0.004 }),
  },
};
THEMES.soft.milestone = THEMES.soft.chime; THEMES.wood.milestone = THEMES.wood.chime; THEMES.glass.milestone = THEMES.glass.chime;

export const soundTheme = name => (SOUND_THEMES.includes(name) ? name : 'soft');

// getCtx() returns an AudioContext, or null when sound is off (then nothing is played and nothing is created).
// getTheme() returns the chosen theme name. A sound can never throw into the app: a failed one is only logged.
export function createSounds(getCtx, getTheme) {
  const play = (name, themeName) => {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      THEMES[soundTheme(themeName || getTheme())][name].forEach(n => tone(ctx, t0, n));
    } catch (e) { console.warn('sound failed:', name, e); }
  };
  return {
    tick: () => play('tick'), untick: () => play('untick'), chime: () => play('chime'),
    levelUp: () => play('levelUp'), milestone: () => play('milestone'),
    preview: themeName => play('tick', themeName),
  };
}
