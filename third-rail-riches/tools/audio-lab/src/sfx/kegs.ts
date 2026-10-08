/**
 * Original-rules sounds: Powder Keg blasts and debris, the powder fuse meter, the Captain's Wheel
 * outcomes (KEG DROP, BROADSIDE, GROG) and cold keg landings.
 */
import { hz, semi } from '../core/notes';
import type { Dest, Studio } from '../core/studio';
import { block, crash, kick, snare, timpani } from '../instruments/drums';
import { glock, shipBell } from '../instruments/tuned';
import { slideWhistle } from '../instruments/winds';
import { crewHey } from '../instruments/fx';
import { barrel, cannon, fuse, glug, grainRattle, splinters, tankard } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, variants, withRoom } from './common';

/** A keg rolling to a stop: low wooden rumble with the hoops clacking as the staves turn. */
function roll(s: Studio, d: Dest, t: number, dur: number, vel: number, pan = 0) {
  const p = s.panner(pan, d);
  const bp = s.filter('bandpass', 180, 0.8, p);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.9, t + 0.04);
  g.gain.setTargetAtTime(0, t + dur * 0.5, dur * 0.25);
  s.noise('brown', t, t + dur + 0.1, g);
  const r = s.rng.fork(Math.floor(t * 1000) + 5);
  let tt = t + 0.03;
  let gap = 0.05;
  while (tt < t + dur) {
    block(s, p, tt, r.range(330, 460), vel * 0.35 * Math.max(0.2, 1 - (tt - t) / dur), { decay: 0.03 });
    tt += gap;
    gap *= 1.22;
  }
}

const CHAIN = [0, 2, 4, 7, 9, 12]; // pentatonic climb for the chain position
const METER = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15]; // D dorian climb over 10 sparks
const BOOST_LEVELS = [2, 3, 4, 5, 7, 10, 15, 20];

export const KEG_SFX: SfxDef[] = [
  ...variants('explode', 6, { kind: 'sfx', seconds: 0.95, level: -15, desc: 'Powder Keg blows: cartoon gunpowder BOOM with wooden debris; index 1..6 = chain position (climbs)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.12, 'medium');
    const size = 0.8 + i * 0.06;
    cannon(s, d, 0, 0.9, { size, pitch: semi(CHAIN[i] * 0.5) * 1.1, crack: 1.1, tail: 0.42 });
    timpani(s, d, 0.004, hz('D2') * semi(CHAIN[i]), 0.5 + i * 0.05, { decay: 0.7 });
    splinters(s, d, 0.03, 0.4 * size, 7 + i, 0.5);
    if (i >= 3) glock(s, d, 0.01, hz('D6') * semi(CHAIN[i]), 0.1 + (i - 3) * 0.05, { decay: 0.6 });
  }, (i) => ({ id: `explode_${i + 1}`, variant: i + 1, level: -18.8 + i * 0.6 })),

  ...variants('blastDebris', 4, { kind: 'sfx', seconds: 0.35, level: -25, desc: 'wood splinters landing with a short fuse sizzle' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.06);
    splinters(s, d, 0, 0.14, 4 + i, 0.8, { center: 2200 + i * 350 });
    fuse(s, d, 0.01, 0.16, 0.3, { fadeIn: 0.01, fadeOut: 0.1, sparks: 0.6 });
  }),

  ...variants('meterFlame', 10, { kind: 'sfx', seconds: 0.4, level: -24, desc: 'one spark catches on the powder fuse: crackle, tick and ping; index 1..10 rises' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    const r = semi(METER[i]);
    fuse(s, d, 0, 0.12, 0.45, { fadeIn: 0.005, fadeOut: 0.07, sparks: 2, bright: 0.85 + i * 0.03 });
    block(s, d, 0.012, 1200 * r, 0.35, { decay: 0.025 });
    glock(s, d, 0.02, hz('D6') * r, 0.12 + i * 0.012, { decay: 0.35 });
  }, (i) => ({ id: `meterFlame_${i + 1}`, variant: i + 1, level: -24.5 + i * 0.25 })),

  one('meterFull', { kind: 'sfx', seconds: 2.4, level: -13, desc: "fuse fully lit: the hiss swells into a ship's bell and a cannon thump" }, (s, out) => {
    const d = withRoom(s, out, 0.22, 'hall');
    fuse(s, d, 0, 0.8, 0.8, { fadeIn: 0.1, swell: 3, sparks: 1.8, fadeOut: 0.02 });
    snare(s, d, 0.55, 0.2, { decay: 0.06 });
    snare(s, d, 0.65, 0.3, { decay: 0.06 });
    snare(s, d, 0.73, 0.4, { decay: 0.06 });
    const hit = 0.82;
    shipBell(s, d, hit, hz('D5'), 0.6, { decay: 2.4, double: 0.26 });
    cannon(s, d, hit, 0.75, { size: 1, echo: 0.8 });
    crash(s, d, hit, 0.4, { decay: 1.6 });
    // the lit fuse keeps fizzing under the bell
    fuse(s, d, hit + 0.02, 0.9, 0.35, { fadeIn: 0.01, fadeOut: 0.6, sparks: 0.8 });
  }),

  ...variants('hounds', 5, { kind: 'sfx', seconds: 1.2, level: -16, desc: 'KEG DROP: kegs thump onto the board one after another, the last one rolls; index = count' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    const count = i + 1;
    for (let k = 0; k < count; k++) {
      const t = k * 0.11;
      const pan = count === 1 ? 0 : -0.5 + k / (count - 1);
      const p = s.panner(pan, d);
      barrel(s, p, t, 0.8, { size: 1.05, pitch: 0.92 + k * 0.05, hoop: 0.7 });
      kick(s, p, t, 0.4, { tone: 60 + k * 3, decay: 0.12 });
      grainRattle(s, p, t + 0.01, 0.2, 0.12);
    }
    const last = (count - 1) * 0.11;
    roll(s, d, last + 0.08, 0.45, 0.5, count === 1 ? 0 : 0.5);
  }, (i) => ({ id: `hounds_${i + 1}`, variant: i + 1, level: -17 + i * 0.5 })),

  one('inferno', { kind: 'sfx', seconds: 1.5, level: -14, desc: 'BROADSIDE: a rolling volley of cannon fire sweeping left to right' }, (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    for (let k = 0; k < 6; k++) {
      const t = k * 0.13 + (s.rng.next() - 0.5) * 0.02;
      cannon(s, d, t, 0.62 + (k % 2) * 0.1, { size: 0.75 + (k % 3) * 0.08, pitch: 1 + (k % 2) * 0.12, pan: -0.85 + k * 0.34, echo: k === 5 ? 0.5 : 0, tail: 0.55 });
    }
  }),

  ...variants('boost', BOOST_LEVELS.length, { kind: 'sfx', seconds: 1.4, level: -15, desc: 'GROG: tankards clink, a glug, the crew whoops "hey!"; index = new level 2..20 (brighter)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    const base = semi(i * 1.5);
    tankard(s, d, 0, 0.85, { f: 1150 * Math.pow(base, 0.5) });
    glug(s, d, 0.13, 3, 0.55, { f: 250 * Math.pow(base, 0.3) });
    crewHey(s, d, 0.45, 0.8, { pitch: 1 + i * 0.03, voices: 3 + Math.min(3, Math.floor(i / 2)) });
    slideWhistle(s, d, [{ t: 0.42, f: 520 * base }, { t: 0.7, f: 1400 * base, a: 1 }], 0.35);
    const run = ['D5', 'F5', 'A5', 'D6'];
    run.forEach((n, k) => glock(s, d, 0.5 + k * 0.045, hz(n) * base, 0.25 + k * 0.06, { decay: 0.9 }));
    if (i >= 4) glock(s, d, 0.635, hz('A6') * base, 0.18 + (i - 4) * 0.05, { decay: 1.1 });
  }, (i) => ({ id: `boost_${BOOST_LEVELS[i]}`, variant: BOOST_LEVELS[i], level: -15.5 + i * 0.35 })),

  ...variants('wildLand', 3, { kind: 'sfx', seconds: 1.1, level: -18, desc: 'cold Powder Keg lands: heavy wooden barrel thunk with a faint gunpowder rattle' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    barrel(s, d, 0, 0.9, { size: 1.2, pitch: 0.86 + i * 0.06 });
    kick(s, d, 0, 0.6, { tone: 46 + i * 3, decay: 0.28 });
    grainRattle(s, d, 0.01, 0.35, 0.28, { density: 260, center: 3600 + i * 300 });
    // it rocks on its rim and settles
    barrel(s, d, 0.17 + i * 0.01, 0.2, { size: 0.8, pitch: 1.1 + i * 0.05, hoop: 0.5, knock: 0.7 });
    barrel(s, d, 0.3 + i * 0.015, 0.09, { size: 0.7, pitch: 1.15 + i * 0.05, hoop: 0.4, knock: 0.6 });
  }),
];
