/**
 * The Kaboom Bomb: it lands on the reels with its fuse lit, the fuse counter ticks down, it swells
 * with every keg blast, goes red-hot and blows (bigger than a keg, with a low-end whump), sets off
 * other bombs, and the deck rumbles before the last ones go.
 */
import { hz, semi } from '../core/notes';
import type { Dest, Studio } from '../core/studio';
import { block, clockTick, crash, kick, timpani, timpaniRoll } from '../instruments/drums';
import { glock, marimba } from '../instruments/tuned';
import { concertina, slideWhistle } from '../instruments/winds';
import { boing, impact, sample } from '../instruments/fx';
import { cannon, crate, fuse, fuseBed, grainRattle, ironClank, rumble, sizzleBed, splinters, timberGroan } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, tailFade, variants, withRoom } from './common';

/** Iron shrapnel: short metallic tinks flying out of a blast. */
function shrapnel(s: Studio, d: Dest, t: number, count: number, vel: number) {
  const r = s.rng.fork(Math.floor(t * 1000) + count * 11);
  for (let i = 0; i < count; i++) {
    const tt = t + 0.02 + Math.pow(r.next(), 1.3) * 0.5;
    ironClank(s, s.panner(r.range(-0.7, 0.7), d), tt, vel * r.range(0.3, 0.8), { f: r.range(1500, 3200), decay: r.range(0.05, 0.12) });
  }
}

/** A cast-iron ball rolling to a stop on deck planks: low rumble, iron grind, plank clicks slowing. */
function ironRoll(s: Studio, d: Dest, t: number, dur: number, vel: number) {
  const bp = s.filter('bandpass', 170, 0.9, d);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.8, t + 0.03);
  g.gain.setTargetAtTime(0, t + dur * 0.4, dur * 0.25);
  s.noise('brown', t, t + dur + 0.1, g);
  const gb = s.filter('bandpass', 950, 3, d);
  const gg = s.gain(0, gb);
  gg.gain.setValueAtTime(0, t);
  gg.gain.linearRampToValueAtTime(vel * 0.12, t + 0.03);
  gg.gain.setTargetAtTime(0, t + dur * 0.3, dur * 0.2);
  s.noise('white', t, t + dur + 0.1, gg);
  const r = s.rng.fork(Math.floor(t * 1000) + 21);
  let tt = t + 0.04;
  let gap = 0.06;
  while (tt < t + dur) {
    block(s, d, tt, r.range(300, 420), vel * 0.3 * Math.max(0.15, 1 - (tt - t) / dur), { decay: 0.03 });
    tt += gap;
    gap *= 1.25;
  }
}

const GROW = [0, 3, 5, 7, 10]; // D minor pentatonic steps for bombGrow 1..5

export const BOMB_SFX: SfxDef[] = [
  one('bombLand', { kind: 'sfx', seconds: 1.2, level: -17, desc: 'the Kaboom Bomb lands: a cast-iron thunk on the deck, one bounce, a short roll, its fuse spitting' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    crate(s, d, 0, 0.9, { size: 1.5, pitch: 0.7 });
    kick(s, d, 0, 0.75, { tone: 46, decay: 0.32 });
    ironClank(s, d, 0.002, 0.8, { f: 560, decay: 0.14 });
    crate(s, d, 0.11, 0.3, { size: 1.1, pitch: 0.8 });
    ironClank(s, d, 0.112, 0.3, { f: 590, decay: 0.08 });
    ironRoll(s, d, 0.15, 0.4, 0.45);
    fuse(s, d, 0.02, 0.55, 0.4, { fadeIn: 0.01, fadeOut: 0.35, sparks: 1.3 });
  }),
  {
    id: 'bombFuseLoop', name: 'bombFuseLoop', variant: 0, bank: 'core', kind: 'loop', seconds: 3.0, tail: 0.5, level: -24,
    desc: 'loop: a lit bomb fuse hissing and spitting sparks, with a little sputter',
    render: (s, out) => {
      // dry: a room tail would smear hiss into the sputter at the loop point
      fuseBed(s, out, 3.0, 0.8);
    },
  },
  one('bombTick', { kind: 'sfx', seconds: 0.45, level: -21, desc: 'the fuse counter drops: a clockwork tock, a spark and a low marimba "dunk"' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    clockTick(s, d, 0, 0.8, true);
    marimba(s, d, 0.01, hz('D4'), 0.45, { decay: 0.25 });
    fuse(s, d, 0.005, 0.09, 0.35, { fadeIn: 0.003, fadeOut: 0.05, sparks: 2 });
  }),
  {
    id: 'bombHotLoop', name: 'bombHotLoop', variant: 0, bank: 'core', kind: 'loop', seconds: 3.2, tail: 0.8, level: -23,
    desc: 'loop: the bomb glowing red-hot, a frying sizzle that breathes, iron ticks and a low shiver',
    render: (s, out) => {
      const d = withRoom(s, out, 0.08);
      sizzleBed(s, d, 3.2, 0.8);
    },
  },
  ...variants('bombGrow', 5, { kind: 'sfx', seconds: 1.2, level: -17, desc: 'the bomb swells after a keg blast: an inflating whistle and squeezebox swell into a springy "pop"; index 1..5 rises' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    const r = semi(GROW[i]);
    slideWhistle(s, d, [{ t: 0, f: 330 * r }, { t: 0.32, f: 780 * r, a: 1 }], 0.4);
    for (const n of ['D4', 'F4', 'A4']) concertina(s, d, 0, hz(n) * r, 0.36, 0.55 + i * 0.05, { attack: 0.3, release: 0.05 });
    const hit = 0.34;
    boing(s, d, hit, 0.45, { f0: 140 * r, f1: 300 * r, wobble: 14, decay: 0.45 });
    kick(s, d, hit, 0.55, { tone: 58, decay: 0.2 });
    glock(s, d, hit, hz('D6') * r, 0.25 + i * 0.04, { decay: 0.8 });
    if (i >= 3) crash(s, d, hit, 0.12 + (i - 3) * 0.08, { decay: 0.9, hp: 5000 });
  }, (i) => ({ id: `bombGrow_${i + 1}`, variant: i + 1, level: -17 + i * 0.6 })),
  ...variants('bombBlast', 5, { kind: 'sfx', seconds: 3.4, level: -15, desc: 'the Kaboom Bomb detonates: bigger than a keg, with a low-end whump; index 1..5 = blast size (5 = the 5x5 monster)' }, (i) => async (s, out) => {
    const size = 1 + i * 0.25;
    const d = withRoom(s, tailFade(s, out, 1.2 + i * 0.45, 1.35 + i * 0.5), 0.12 + i * 0.03, i >= 3 ? 'hall' : 'medium');
    cannon(s, d, 0, 0.95, { size, pitch: 1.05 - i * 0.07, crack: 1.2, echo: i >= 2 ? 0.4 + i * 0.15 : 0, tail: 0.65 + i * 0.08 });
    impact(s, d, 0.004, 0.9, { f: 44 - i * 2, decay: 0.8 + i * 0.3 });
    timpani(s, d, 0.004, hz('D2') * semi(-i), 0.6 + i * 0.06, { decay: 1 + i * 0.2 });
    splinters(s, d, 0.03, 0.4 + i * 0.2, 8 + i * 4, 0.55);
    shrapnel(s, d, 0.02, 2 + i, 0.4);
    if (i >= 2) crash(s, d, 0.01, 0.3 + i * 0.07, { decay: 1.4 + i * 0.3 });
    if (i >= 3) {
      const ib = await sample(s, i === 4 ? 'impact-bass-2' : 'impact-bass-1');
      s.play(ib, 0, s.gain(0.25 + (i - 3) * 0.1, s.filter('lowpass', 4000, 0.7, d)));
    }
    if (i === 4) {
      // the 5x5: a second rolling detonation and debris raining down
      cannon(s, d, 0.28, 0.75, { size: 1.6, pitch: 0.8, echo: 1, tail: 0.9, pan: 0.2 });
      splinters(s, d, 0.5, 1.4, 22, 0.35);
      grainRattle(s, d, 0.4, 1.2, 0.2, { density: 150, center: 3000, decay: 0.5 });
    }
  }, (i) => ({ id: `bombBlast_${i + 1}`, variant: i + 1, level: -15 + i * 0.75 })),
  ...variants('bombChain', 3, { kind: 'sfx', seconds: 1.6, level: -14.5, desc: 'a chained bomb goes off: a spit of fuse and a punchy blast (variations for chains)' }, (i) => (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.3, 1.55), 0.14, 'medium');
    fuse(s, d, 0, 0.09, 0.5, { fadeIn: 0.005, fadeOut: 0.02, sparks: 2, swell: 2 });
    const hit = 0.08;
    cannon(s, d, hit, 0.9, { size: 1.1, pitch: [1.0, 1.12, 0.92][i], crack: 1.2, tail: 0.6 });
    impact(s, d, hit, 0.45, { f: 50, decay: 0.7 });
    splinters(s, d, hit + 0.03, 0.5, 10, 0.55);
    shrapnel(s, d, hit, 3, 0.35);
  }),
  one('endRumble', { kind: 'sfx', seconds: 2.4, level: -15, desc: 'the deck starts to shake: a rumble and timpani roll building before the remaining bombs blow' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.95, 2.35), 0.14, 'medium');
    rumble(s, d, 0, 1.9, 0.9);
    timpaniRoll(s, d, 0.2, 1.65, hz('D2'), 0.1, 0.75, 16);
    timberGroan(s, d, 0.3, 1.2, 0.5, { pitch: 0.8 });
    fuse(s, d, 0.9, 1.0, 0.35, { fadeIn: 0.6, fadeOut: 0.05, swell: 3 });
  }),
];
