/** Total Win Bar, bonus stings (treasure chest, pirate band), big-win fanfares, max-win cannon salute, anticipation. */
import { hz, midi, mtof } from '../core/notes';
import { block, crash, frameDrum, kick, snare, timpani, timpaniRoll } from '../instruments/drums';
import { glock, shipBell, xylophone, celesta } from '../instruments/tuned';
import { accordion, brass, tuba } from '../instruments/winds';
import { choir, strings } from '../instruments/strings';
import { heartbeat, sample, whoosh } from '../instruments/fx';
import { cannon, coinSpill, crate, fuse, hinge, paperRustle, squelch, timberGroan } from '../instruments/foley';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, tailFade, variants, withRoom } from './common';

function brassChord(s: Studio, d: Dest, t: number, notes: string[], dur: number, vel: number, bright = 1) {
  for (const n of notes) brass(s, d, t + s.rng.next() * 0.008, hz(n), dur, vel, { bright });
}

function squeeze(s: Studio, d: Dest, t: number, notes: string[], dur: number, vel: number) {
  for (const n of notes) accordion(s, d, t + s.rng.next() * 0.006, hz(n), dur, vel);
}

/** Snare roll with a crescendo from v0 to v1 (32nd-note strokes). */
function snareRoll(s: Studio, d: Dest, t: number, dur: number, v0: number, v1: number, rate = 26) {
  const n = Math.max(2, Math.floor(dur * rate));
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    snare(s, d, t + i / rate + (s.rng.next() - 0.5) * 0.004, (v0 + (v1 - v0) * x) * (0.85 + s.rng.next() * 0.15), { decay: 0.08 });
  }
}

/** Accordion flourish: a quick run up to `top` (MIDI), for the pirate-band stings. */
function run(s: Studio, d: Dest, t: number, notes: number[], step: number, vel: number) {
  notes.forEach((m, i) => accordion(s, d, t + i * step, mtof(m), step * 0.9, vel * (0.7 + (0.3 * i) / notes.length), { attack: 0.008, release: 0.04 }));
}

/** Shepard-Risset voice: rises `octaves` octaves over octaves*T seconds with a sin^2 window. Folded
 * at period T this becomes an endlessly rising glissando with no seam. */
function shepardVoice(s: Studio, d: Dest, T: number, octaves: number, fmin: number, vel: number) {
  const dur = octaves * T;
  const win = s.gain(0, d);
  const curve = new Float32Array(512);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.pow(Math.sin((Math.PI * i) / (curve.length - 1)), 2) * vel;
  win.gain.setValueCurveAtTime(curve, 0, dur);
  const lp = s.filter('lowpass', 1900, 0.6, win);
  const trem = s.gain(0.55, lp);
  s.osc('triangle', 11.5, 0, dur, s.gain(0.45, trem.gain));
  for (const dc of [-6, 6]) {
    const o = s.osc('sawtooth', fmin, 0, dur, trem, dc);
    o.frequency.setValueAtTime(fmin, 0);
    o.frequency.exponentialRampToValueAtTime(fmin * Math.pow(2, octaves), dur);
  }
}

export const EVENT_SFX: SfxDef[] = [
  // ---------------------------------------------------------------- Total Win Bar
  ...variants('barTick', 3, { kind: 'sfx', seconds: 0.12, level: -27, desc: 'tiny counting tick (called rapidly)' }, (k) => (s, out) => {
    block(s, out, 0, [2300, 2520, 2760][k], 0.45, { decay: 0.018 });
  }),
  one('barApply', { kind: 'sfx', seconds: 2.0, level: -14, desc: 'multiplier slam: cannon thump, snare, brass and accordion chord' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    cannon(s, d, 0, 0.7, { size: 0.75, pitch: 1.15, crack: 0.6 });
    snare(s, d, 0, 0.8, { decay: 0.2 });
    kick(s, d, 0, 0.7, { tone: 55, decay: 0.35 });
    timpani(s, d, 0, hz('D2'), 0.7, { decay: 1.4 });
    crash(s, d, 0, 0.35, { decay: 1.4 });
    brassChord(s, d, 0.005, ['D4', 'F#4', 'A4', 'D5'], 0.5, 0.85, 1.1);
    squeeze(s, d, 0.005, ['F#4', 'A4', 'D5'], 0.45, 0.6);
    glock(s, d, 0.01, hz('A6'), 0.35, { decay: 1.2 });
    glock(s, d, 0.01, hz('D7'), 0.25, { decay: 1.0 });
  }),

  // ---------------------------------------------------------------- bonus flow
  one('bonusTrigger', { kind: 'sfx', seconds: 2.4, level: -13, desc: 'treasure chest lid creaks open, doubloons spill, cymbal and a choir "aah"' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    crate(s, d, 0, 0.55, { size: 1.2, pitch: 0.7 });
    hinge(s, d, 0.03, 0.55, 2.2, { pitch: 0.62 });
    timberGroan(s, d, 0.05, 0.45, 0.8, { pitch: 1.4 });
    const open = 0.56;
    crate(s, d, open, 0.8, { size: 1.4, pitch: 0.65 });
    kick(s, d, open, 0.45, { tone: 55, decay: 0.25 });
    coinSpill(s, d, open + 0.04, 0.7, 26, 0.75);
    crash(s, d, open + 0.02, 0.5, { decay: 1.8, hp: 4500 });
    for (const n of ['D4', 'A4', 'D5', 'F#5']) choir(s, d, open + 0.02, hz(n), 0.8, 0.3, { vowel: 'ah', attack: 0.06, release: 0.7 });
    for (let i = 0; i < 6; i++) glock(s, d, open + 0.06 + i * 0.05, hz(['D6', 'F#6', 'A6', 'D7', 'F#7', 'A7'][i]), 0.24, { decay: 1.1 });
  }),
  one('bonusIntro', { kind: 'sfx', seconds: 3.0, level: -14, desc: 'pirate-band sting: snare roll, brass and accordion "ta-da" with a cannon' }, (s, out) => {
    const d = withRoom(s, out, 0.22, 'hall');
    snareRoll(s, d, 0, 0.6, 0.18, 0.7);
    timpaniRoll(s, d, 0.2, 0.42, hz('A2'), 0.2, 0.55, 18);
    const t = 0.66;
    [0, 0.09, 0.18].forEach((dt) => {
      brassChord(s, d, t + dt, ['A4', 'E5'], 0.07, 0.7);
      squeeze(s, d, t + dt, ['C#5', 'A5'], 0.07, 0.55);
    });
    const hit = t + 0.28;
    brassChord(s, d, hit, ['D4', 'A4', 'D5', 'F#5', 'A5'], 1.1, 0.95, 1.15);
    squeeze(s, d, hit, ['F#4', 'A4', 'D5', 'F#5'], 1.0, 0.7);
    tuba(s, d, hit, hz('D2'), 1.0, 0.8);
    cannon(s, d, hit, 0.6, { size: 0.9, echo: 0.8 });
    crash(s, d, hit, 0.55, { decay: 2.2 });
    snare(s, d, hit, 0.6);
    for (let i = 0; i < 6; i++) glock(s, d, hit + 0.04 + i * 0.05, hz(['D6', 'F#6', 'A6', 'D7', 'F#7', 'A7'][i]), 0.26, { decay: 1.1 });
  }),
  one('bonusEnd', { kind: 'sfx', seconds: 3.4, level: -14, desc: 'shave-and-a-haircut cadence (trad.) on accordion, xylophone and tuba to close a bonus' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 3.0, 3.38), 0.2, 'hall');
    const spb = 60 / 176;
    // traditional "shave and a haircut, two bits", in D
    const mel: Array<[string, number, number]> = [['D5', 0, 1], ['A4', 1, 0.5], ['A4', 1.5, 0.5], ['B4', 2, 1], ['A4', 3, 1], ['C#5', 5, 1], ['D5', 6, 1.8]];
    for (const [n, b, len] of mel) {
      const t = b * spb;
      xylophone(s, d, t, hz(n) * 2, 0.55);
      accordion(s, d, t, hz(n), len * spb * (b >= 5 ? 0.9 : 0.55), 0.75, { attack: 0.01 });
    }
    const bass: Array<[string, number]> = [['D2', 0], ['A1', 1], ['D2', 2], ['A1', 3], ['A1', 5], ['D2', 6]];
    for (const [n, b] of bass) tuba(s, d, b * spb, hz(n), spb * 0.6, 0.7);
    for (const b of [0, 2, 3]) snare(s, d, b * spb, 0.35, { decay: 0.1 });
    snare(s, d, 5 * spb, 0.7);
    snare(s, d, 6 * spb, 0.8);
    const hit = 6 * spb;
    brassChord(s, d, hit, ['D4', 'F#4', 'A4', 'D5'], 1.0, 0.85);
    squeeze(s, d, hit, ['F#4', 'A4', 'D5'], 0.9, 0.6);
    shipBell(s, d, hit + 0.02, hz('D6'), 0.28, { decay: 1.1, double: 0.24 });
    crash(s, d, hit, 0.5, { decay: 1.6 });
    timpani(s, d, hit, hz('D2'), 0.7, { decay: 1.6 });
  }),
  one('retrigger', { kind: 'sfx', seconds: 2.0, level: -14, desc: "more spins: ship's bell ding-ding over a glockenspiel and concertina run" }, async (s, out) => {
    const d = withRoom(s, out, 0.22, 'medium');
    const notes = ['D5', 'F#5', 'A5', 'D6', 'F#6', 'A6', 'D7'];
    notes.forEach((n, i) => {
      glock(s, d, i * 0.045, hz(n), 0.33 + i * 0.05, { decay: 1.0 });
      celesta(s, d, i * 0.045, hz(n) / 2, 0.28, { decay: 0.8 });
    });
    run(s, d, 0, [62, 66, 69, 74, 78, 81].map((m) => m - 12), 0.045, 0.45);
    shipBell(s, d, 0.3, hz('A5'), 0.45, { decay: 1.5, double: 0.22 });
    const sp = await sample(s, 'sparkle');
    s.play(sp, 0.15, s.gain(0.18, s.filter('lowpass', 9000, 0.7, d)));
  }),

  // ---------------------------------------------------------------- big wins (Bb major, like the big-win loop)
  one('bigWinStart', { kind: 'sfx', seconds: 3.0, level: -12, desc: 'fanfare hit: brass and accordion stab, cannon, crash, timpani' }, (s, out) => {
    const d = withRoom(s, out, 0.22, 'hall');
    run(s, d, 0, [58, 62, 65, 70, 74].map((m) => m - 12), 0.035, 0.5);
    const hit = 0.18;
    brassChord(s, d, hit, ['Bb3', 'F4', 'Bb4', 'D5', 'F5'], 0.9, 1, 1.2);
    squeeze(s, d, hit, ['D4', 'F4', 'Bb4', 'D5'], 0.8, 0.7);
    tuba(s, d, hit, hz('Bb1'), 0.9, 0.9);
    timpani(s, d, hit, hz('Bb1'), 1);
    cannon(s, d, hit, 0.55, { size: 0.8, pitch: 1.1 });
    crash(s, d, hit, 0.7, { decay: 2.4 });
    for (let i = 0; i < 6; i++) glock(s, d, hit + 0.06 + i * 0.045, hz(['Bb5', 'D6', 'F6', 'Bb6', 'D7', 'F7'][i]), 0.28, { decay: 1.2 });
  }),
  ...variants('bigWinTier', 4, { kind: 'sfx', seconds: 2.4, level: -12, desc: 'tier step-up: pickup into a brass/accordion stab (index 0..3 climbs)' }, (k) => (s, out) => {
    const d = withRoom(s, out, 0.22, 'hall');
    const tops = ['Bb4', 'D5', 'F5', 'Bb5'];
    const top = midi(tops[k]);
    const pick = [top - 7, top - 5, top - 3];
    pick.forEach((m, i) => {
      brass(s, d, i * 0.075, mtof(m), 0.06, 0.65);
      accordion(s, d, i * 0.075, mtof(m), 0.06, 0.5, { attack: 0.008 });
    });
    snare(s, d, 0, 0.3, { decay: 0.08 });
    snare(s, d, 0.075, 0.35, { decay: 0.08 });
    snare(s, d, 0.15, 0.4, { decay: 0.08 });
    const hit = 0.225;
    const chord = [top - 12, top - 8, top - 5, top].map((m) => mtof(m));
    for (const f of chord) brass(s, d, hit, f, 0.7, 0.95, { bright: 1.1 + k * 0.1 });
    for (const f of chord.slice(1)) accordion(s, d, hit, f, 0.6, 0.6);
    tuba(s, d, hit, hz('Bb1'), 0.7, 0.85);
    timpani(s, d, hit, hz('Bb1') * (k % 2 ? 1.335 : 1), 0.9);
    if (k >= 2) cannon(s, d, hit, 0.35 + (k - 2) * 0.1, { size: 0.7, pitch: 1.2, tail: 0.7 });
    crash(s, d, hit, 0.55 + k * 0.05, { decay: 2 });
    glock(s, d, hit + 0.02, mtof(top + 12), 0.35, { decay: 1.2 });
  }),
  one('bigWinEnd', { kind: 'sfx', seconds: 3.6, level: -12, desc: 'closing fanfare: V-I brass and accordion "ta-da" with a drum roll and cannon' }, (s, out) => {
    const d = withRoom(s, out, 0.24, 'hall');
    brassChord(s, d, 0, ['F4', 'A4', 'C5', 'Eb5'], 0.28, 0.85);
    squeeze(s, d, 0, ['A4', 'C5', 'Eb5'], 0.28, 0.6);
    tuba(s, d, 0, hz('F1'), 0.28, 0.8);
    snareRoll(s, d, 0, 0.36, 0.3, 0.7);
    const hit = 0.4;
    brassChord(s, d, hit, ['Bb3', 'F4', 'Bb4', 'D5', 'F5', 'Bb5'], 1.6, 1, 1.25);
    squeeze(s, d, hit, ['D4', 'F4', 'Bb4', 'D5'], 1.4, 0.7);
    tuba(s, d, hit, hz('Bb1'), 1.5, 0.95);
    timpani(s, d, hit, hz('Bb1'), 0.9);
    cannon(s, d, hit, 0.45, { size: 1, echo: 0.8 });
    crash(s, d, hit, 0.75, { decay: 3 });
    for (let i = 0; i < 8; i++) glock(s, d, hit + 0.05 + i * 0.04, hz(['Bb5', 'D6', 'F6', 'Bb6', 'D7', 'F7', 'Bb7', 'F7'][i]), 0.26, { decay: 1.2 });
  }),
  one('maxWin', { kind: 'sfx', seconds: 5.0, level: -12, desc: 'MAX WIN: drum roll, a three-gun cannon salute, full brass, accordion and choir' }, async (s, out) => {
    const d = withRoom(s, out, 0.28, 'hall');
    whoosh(s, d, 0, 0.7, 0.45, { f0: 200, f1: 6000, q: 0.8, peakAt: 0.97, color: 'white' });
    snareRoll(s, d, 0, 0.68, 0.15, 0.75, 28);
    timpaniRoll(s, d, 0.1, 0.58, hz('F2'), 0.2, 0.7, 22);
    const hit = 0.72;
    // salute: three guns left, centre, right
    cannon(s, d, hit, 0.8, { size: 1.2, echo: 1, pan: -0.5 });
    cannon(s, d, hit + 0.3, 0.7, { size: 1.1, pitch: 0.95, echo: 0.8, pan: 0.5 });
    cannon(s, d, hit + 0.62, 0.75, { size: 1.3, pitch: 0.9, echo: 1, pan: 0 });
    const ib = await sample(s, 'impact-bass-2');
    s.play(ib, hit, s.gain(0.28, s.filter('lowpass', 4000, 0.7, d)));
    brassChord(s, d, hit, ['Bb2', 'F3', 'Bb3', 'D4', 'F4', 'Bb4', 'D5', 'F5'], 2.4, 1, 1.3);
    squeeze(s, d, hit, ['D4', 'F4', 'Bb4', 'D5', 'F5'], 2.3, 0.7);
    for (const n of ['Bb4', 'D5', 'F5', 'Bb5']) choir(s, d, hit, hz(n), 2.6, 0.55, { vowel: 'ah', attack: 0.08, release: 1.2 });
    tuba(s, d, hit, hz('Bb1'), 2.2, 1);
    timpani(s, d, hit, hz('Bb1'), 1);
    crash(s, d, hit, 0.8, { decay: 3.5 });
    crash(s, d, hit + 0.01, 0.5, { decay: 3, hp: 2500 });
    shipBell(s, d, hit + 0.1, hz('F5'), 0.3, { decay: 2.4, double: 0.25 });
    for (let i = 0; i < 10; i++) glock(s, d, hit + 0.1 + i * 0.05, hz(['Bb5', 'D6', 'F6', 'Bb6', 'D7', 'F7', 'Bb7', 'F7', 'D7', 'Bb6'][i]), 0.28, { decay: 1.4 });
  }),

  // ---------------------------------------------------------------- big moments (unpitched or D pentatonic, so they sit on any track)
  one('tierSlam', { kind: 'sfx', seconds: 2.0, level: -12, drive: 2.6, desc: 'a big-win tier title slams in: cannon crack, a wooden slam, doubled snare and crash (unpitched)' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.6, 1.95), 0.2, 'hall');
    // weight lives in the mids (crack, wood, snare, crash) so the slam reads loud without a sub peak
    cannon(s, d, 0, 0.6, { size: 1.1, crack: 1.5, tail: 0.5 });
    crate(s, d, 0, 0.9, { size: 1.6, pitch: 0.75 });
    crate(s, d, 0.006, 0.6, { size: 1.1, pitch: 1.2 });
    snare(s, d, 0, 1, { decay: 0.26 });
    snare(s, d, 0.012, 0.6, { decay: 0.2 });
    crash(s, d, 0.004, 0.75, { decay: 1.8 });
    crash(s, d, 0.02, 0.4, { decay: 1.4, hp: 2600 });
    const ib = await sample(s, 'impact-bass-1');
    s.play(ib, 0, s.gain(0.12, s.filter('lowpass', 5000, 0.7, s.filter('highpass', 70, 0.7, d))));
  }),
  one('sealStamp', { kind: 'sfx', seconds: 1.0, level: -15, drive: 2.2, desc: 'a wax seal stamped down: a padded thud, a wet wax splat and a tiny sizzle' }, (s, out) => {
    const d = withRoom(s, out, 0.12, 'medium');
    kick(s, d, 0, 0.35, { tone: 90, decay: 0.1 });
    crate(s, d, 0, 0.8, { size: 0.9, pitch: 0.9 });
    crate(s, d, 0.004, 0.4, { size: 0.6, pitch: 1.3 });
    squelch(s, d, 0.01, 0.16, 0.9, { f0: 2400, f1: 520 });
    paperRustle(s, d, 0, 0.05, 0.25);
    fuse(s, d, 0.06, 0.2, 0.18, { fadeIn: 0.01, fadeOut: 0.15, sparks: 0.5, bright: 1.2 });
  }),
  one('clusterTrace', { kind: 'sfx', seconds: 1.2, level: -24, desc: 'a winning cluster is traced: a soft pentatonic glockenspiel shimmer' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.9, 1.17), 0.22, 'medium');
    ['A5', 'C6', 'D6', 'F6', 'G6', 'A6'].forEach((n, k) => glock(s, d, k * 0.045, hz(n), 0.18 + k * 0.03, { decay: 0.9 }));
    whoosh(s, d, 0, 0.4, 0.12, { f0: 3000, f1: 8000, q: 0.8, peakAt: 0.5, color: 'white' });
    const sp = await sample(s, 'sparkle');
    s.play(sp, 0.05, s.gain(0.08, s.filter('lowpass', 9000, 0.7, d)));
  }),

  // ---------------------------------------------------------------- anticipation
  one('anticipationStart', { kind: 'sfx', seconds: 1.8, level: -16, desc: 'heartbeat thump, a straining rope creak and a rising tremolo swell' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    heartbeat(s, d, 0, 0.9);
    whoosh(s, d, 0.05, 0.9, 0.35, { f0: 200, f1: 3000, q: 0.9, peakAt: 0.95 });
    timberGroan(s, d, 0.1, 0.8, 0.3, { pitch: 0.9 });
    for (const n of ['D3', 'A3', 'D4', 'Eb4']) {
      const g = s.gain(0, d);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, 0.9);
      g.gain.linearRampToValueAtTime(0.0, 1.3);
      strings(s, g, 0, hz(n), 1.1, 0.8, { tremolo: 12, attack: 0.5, release: 0.3 });
    }
  }),
  one('anticipationEnd', { kind: 'sfx', seconds: 1.5, level: -19, desc: 'release: soft down-whoosh, a frame-drum settle' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    whoosh(s, d, 0, 0.5, 0.3, { f0: 2400, f1: 250, q: 0.9, peakAt: 0.25 });
    frameDrum(s, d, 0.02, 0.6, { decay: 0.5 });
    kick(s, d, 0.02, 0.35, { tone: 50, decay: 0.4 });
    for (const n of ['D3', 'A3', 'D4']) strings(s, d, 0, hz(n), 0.25, 0.6, { tremolo: 0, attack: 0.02, release: 0.6 });
  }),
  {
    id: 'anticipation', name: 'anticipation', variant: 0, bank: 'core', kind: 'loop', seconds: 4.8, tail: 21, level: -20,
    desc: 'loop: heartbeat and creaking rigging over an endlessly rising (Shepard) tremolo string bed',
    render: (s, out) => {
      const d = withRoom(s, out, 0.2, 'medium');
      const T = 4.8;
      shepardVoice(s, d, T, 5, 55, 0.42);
      for (let k = 0; k < 8; k++) heartbeat(s, d, k * 0.6, k % 2 ? 1.1 : 1.3);
      // rigging strains twice per loop (placed so their tails fold back seamlessly)
      timberGroan(s, d, 0.35, 1.3, 0.22, { pitch: 0.85, pan: -0.3 });
      timberGroan(s, d, 2.75, 1.2, 0.18, { pitch: 1.1, pan: 0.3 });
    },
  },
];
