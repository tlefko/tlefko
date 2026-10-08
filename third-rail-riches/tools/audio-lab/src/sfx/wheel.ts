/** The Captain's Wheel (a ship's helm): appear, spin bed, pawl ticks, landing; Sparks the parrot; the multiplier slam. */
import { hz } from '../core/notes';
import { block, crash, kick, snare, timpani } from '../instruments/drums';
import { additive, celesta, glock, shipBell } from '../instruments/tuned';
import { brass, concertina, tuba } from '../instruments/winds';
import { parrot, ratchet, sample, whoosh } from '../instruments/fx';
import { cannon, creak, crate, fuse, ironClank, timberGroan } from '../instruments/foley';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, tailFade, variants, withRoom } from './common';

/** Brass pawl snapping over a gear tooth on the helm: wooden tick plus a small metallic ring. */
function pawl(s: Studio, d: Dest, t: number, vel: number, f = 3150, body = 1800) {
  ratchet(s, d, t, vel, { body, bright: 0.7 });
  additive(s, d, t, f, vel * 0.18, [[1, 1, 0.05], [1.41, 0.6, 0.035], [2.17, 0.3, 0.02]], 0.0003);
}

export const WHEEL_SFX: SfxDef[] = [
  one('wheelAppear', { kind: 'sfx', seconds: 1.4, level: -17, desc: "whoosh in, the helm seats with a wooden clunk, a creak and brass clicks" }, async (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    const w = await sample(s, 'whoosh');
    s.play(w, 0, s.gain(0.5, s.filter('bandpass', 1300, 0.6, d)), { rate: 1.05 });
    whoosh(s, d, 0, 0.3, 0.25, { f0: 300, f1: 2500, q: 1, peakAt: 0.8, pan0: -0.5, pan1: 0.2 });
    const hit = 0.3;
    crate(s, d, hit, 0.85, { size: 1.2, pitch: 0.75 });
    block(s, d, hit + 0.003, 410, 0.35, { decay: 0.05 });
    pawl(s, d, hit + 0.01, 0.5);
    pawl(s, d, hit + 0.1, 0.35, 3350, 1950);
    timberGroan(s, d, hit + 0.12, 0.55, 0.5, { pitch: 1.2 });
  }),
  {
    id: 'wheelSpin', name: 'wheelSpin', variant: 0, bank: 'core', kind: 'loop', seconds: 1.0, tail: 0.6, level: -23,
    desc: 'loop: brass pawl clicks and a soft wooden creak while the helm spins',
    render: (s, out) => {
      const d = withRoom(s, out, 0.1);
      const n = 12;
      // clicks sit half a step off the loop point so the seam falls in the quiet between clicks
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n + (s.rng.next() - 0.5) * 0.004;
        pawl(s, d, t, 0.4 + (i % 3 === 0 ? 0.08 : 0), 3050 + (i % 4) * 90, 1800 + (i % 4) * 60);
      }
      // the spindle groans: a steady stick-slip creak spanning one period (the fold makes it continuous)
      creak(s, d, 0, 1.0, 0.35, {
        rate: [[0, 34], [0.5, 40], [1, 34]],
        env: [[0, 0.75], [0.5, 1], [1, 0.75]],
        body: [[300, 7, 1], [720, 9, 0.6], [1500, 11, 0.3]],
        jitter: 0.25,
        grit: 0.5,
      });
      // soft whir
      const bp = s.filter('bandpass', 650, 0.8, d);
      const wob = s.gain(0.6, bp);
      s.lfo(wob.gain, 2, 0.3, 0, 1.0);
      s.noise('pink', 0, 1.0, s.gain(0.06, wob));
    },
  },
  ...variants('wheelTick', 4, { kind: 'sfx', seconds: 0.15, level: -24, desc: 'single brass pawl click (slowing helm)' }, (k) => (s, out) => {
    const d = withRoom(s, out, 0.06);
    pawl(s, d, 0, 0.6, [3100, 3300, 2950, 3450][k], [1800, 1950, 1720, 2050][k]);
  }),
  one('wheelLand', { kind: 'sfx', seconds: 1.8, level: -14, desc: "the helm locks with a clack and the ship's bell rings twice" }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    ratchet(s, d, 0, 0.9, { body: 1500 });
    crate(s, d, 0, 0.7, { size: 1.0, pitch: 0.9 });
    block(s, d, 0.004, 640, 0.35, { decay: 0.04 });
    shipBell(s, d, 0.03, hz('A5'), 0.55, { decay: 1.6, double: 0.22 });
  }),
  one('howl', { kind: 'sfx', seconds: 1.6, level: -14, desc: 'Sparks the parrot squawks "rraawk!" with a whistled tail (KEG DROP)' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    parrot(s, d, 0.0, 0.9, { pitch: 1, len: 0.46 });
  }),
  one('multMul', { kind: 'sfx', seconds: 2.2, level: -13, desc: 'multiplier slam: fuse fizz into a cannon thump and a brass/concertina stab' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.85, 2.18), 0.2, 'medium');
    fuse(s, d, 0, 0.42, 0.55, { fadeIn: 0.05, swell: 2, sparks: 1.5, fadeOut: 0.03 });
    whoosh(s, d, 0.05, 0.4, 0.5, { f0: 180, f1: 2600, q: 1.1, peakAt: 0.95, color: 'brown' });
    const hit = 0.45;
    cannon(s, d, hit, 0.75, { size: 0.8, pitch: 1.1, tail: 0.7 });
    const ib = await sample(s, 'impact-bass-1');
    s.play(ib, hit, s.gain(0.3, s.filter('lowpass', 5000, 0.7, d)));
    timpani(s, d, hit, hz('D2'), 0.7, { decay: 1.1 });
    snare(s, d, hit, 0.5, { decay: 0.2 });
    for (const n of ['D4', 'F4', 'A4', 'D5']) brass(s, d, hit, hz(n), 0.45, 0.7, { bright: 0.9 });
    for (const n of ['F4', 'A4', 'D5']) concertina(s, d, hit, hz(n), 0.4, 0.55);
    crash(s, d, hit, 0.35, { decay: 1.3 });
  }),
  one('wheelPullback', { kind: 'sfx', seconds: 1.0, level: -21, desc: 'the helm is hauled back before the spin: slowing brass ratchet clicks and a timber strain' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    [0, 0.08, 0.18, 0.31, 0.47].forEach((t, k) => pawl(s, d, t, 0.55 - k * 0.05, 3100 - k * 60, 1850 - k * 40));
    timberGroan(s, d, 0.02, 0.6, 0.45, { pitch: 1.1 });
  }),
  one('wheelLandClunk', { kind: 'sfx', seconds: 0.8, level: -17, desc: 'the helm lands: a heavy wooden clunk with an iron latch (no bell)' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    crate(s, d, 0, 0.95, { size: 1.5, pitch: 0.7 });
    kick(s, d, 0, 0.6, { tone: 52, decay: 0.25 });
    block(s, d, 0.003, 300, 0.5, { decay: 0.07 });
    ironClank(s, d, 0.012, 0.45, { f: 900, decay: 0.07 });
    ratchet(s, d, 0.015, 0.5, { body: 1600 });
  }),
  one('wheelIconLift', { kind: 'sfx', seconds: 1.4, level: -18, desc: 'the landed icon lifts out of the wheel: a rising glockenspiel/celesta chime with a soft swoosh' }, async (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    whoosh(s, d, 0, 0.35, 0.3, { f0: 600, f1: 4000, q: 1.2, peakAt: 0.8 });
    ['D6', 'F6', 'A6', 'D7'].forEach((n, k) => {
      glock(s, d, 0.06 + k * 0.06, hz(n), 0.3 + k * 0.06, { decay: 1.1 });
      celesta(s, d, 0.06 + k * 0.06, hz(n) / 2, 0.22, { decay: 0.8 });
    });
    const sp = await sample(s, 'sparkle');
    s.play(sp, 0.12, s.gain(0.12, s.filter('lowpass', 9000, 0.7, d)));
  }),
  one('wheelBombReveal', { kind: 'sfx', seconds: 2.0, level: -15, desc: 'a bomb comes up on the wheel: snare roll into a low "dun-DUN!" on brass, tuba and timpani, then a fuse catching' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.7, 1.95), 0.18, 'hall');
    for (let k = 0; k < 8; k++) snare(s, d, k * 0.035, 0.18 + k * 0.04, { decay: 0.07 });
    const h1 = 0.32;
    const h2 = 0.6;
    for (const n of ['D2', 'A2', 'D3']) brass(s, d, h1, hz(n), 0.18, 0.8, { bright: 0.7, vib: false });
    tuba(s, d, h1, hz('D2'), 0.18, 0.8);
    timpani(s, d, h1, hz('D2'), 0.6, { decay: 0.8 });
    for (const n of ['Eb2', 'Bb2', 'Eb3']) brass(s, d, h2, hz(n), 0.55, 0.95, { bright: 0.8, vib: false });
    tuba(s, d, h2, hz('Eb2'), 0.55, 0.9);
    timpani(s, d, h2, hz('Eb2'), 0.85, { decay: 1.2 });
    crash(s, d, h2, 0.35, { decay: 1.4 });
    fuse(s, d, h2 + 0.05, 1.0, 0.45, { fadeIn: 0.15, fadeOut: 0.4, sparks: 1.5 });
  }),
];
