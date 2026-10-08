/**
 * The Third Rail house band: shared instruments and arrangement helpers for the hot-jazz tracks
 * (stride piano, walking upright bass, brushes with the "chugga-chugga" train shuffle, ride, horns,
 * clarinet, saxes, the steam-whistle motif and the tunnel ambience).
 */
import type { Rng } from '../core/rng';
import { chordPcs, mtof, pcAtOrAbove } from '../core/notes';
import { instrument, type Stem } from '../core/mixer';
import { Arr, chordAt, voicings, walkingBass, type ChordSlot } from './common';
import { piano } from '../instruments/keys';
import { pizz } from '../instruments/strings';
import { brass, clarinet, mutedTrumpet, sax } from '../instruments/winds';
import { brushSwish, brushTap, crash, hat, kick, ride, snare } from '../instruments/drums';
import { glock } from '../instruments/tuned';
import { clickety, railClack, steamWhistle, trackRumble } from '../instruments/train';

// ---------------------------------------------------------------- instruments
export const PIANO = instrument('piano', (s, out, f, v, d, fl) => piano(s, out, 0, f, d, v, { honky: 0.55, bright: fl.includes('b') ? 1.2 : 1 }), { len: (_f, d) => Math.min(d, 6) + 0.75, velBuckets: 5, durStep: 0.05, rr: 2 });
export const BASS = instrument('bass', (s, out, f, v, d) => pizz(s, out, 0, f, v, { decay: 1.15, dur: d }), { len: (_f, d) => Math.min(1.8, d + 0.5), velBuckets: 4, durStep: 0.05, rr: 3 });
export const MUTE = instrument('mute', (s, out, f, v, d, fl) => mutedTrumpet(s, out, 0, f, d, v, fl), { len: (_f, d) => d + 0.3, velBuckets: 4, durStep: 0.02, rr: 2 });
export const TPT = instrument('tpt', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { bright: 1.1 }), { len: (_f, d) => d + 0.35, velBuckets: 4, durStep: 0.02, rr: 2 });
export const TBN = instrument('tbn', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { bright: 0.75, vib: false }), { len: (_f, d) => d + 0.3, velBuckets: 3, durStep: 0.02 });
export const CLAR = instrument('clar', (s, out, f, v, d, fl) => clarinet(s, out, 0, f, d, v, fl), { len: (_f, d) => d + 0.25, velBuckets: 4, durStep: 0.02, rr: 2 });
export const SAX = instrument('sax', (s, out, f, v, d, fl) => sax(s, out, 0, f, d, v, fl), { len: (_f, d) => d + 0.25, velBuckets: 3, durStep: 0.02 });
export const TAP = instrument('tap', (s, out, _f, v) => brushTap(s, out, 0, v), { len: 0.25, velBuckets: 6, rr: 4 });
export const SWISH = instrument('swish', (s, out, _f, v, d) => brushSwish(s, out, 0, d, v), { len: (_f, d) => d + 0.1, velBuckets: 3, durStep: 0.05, rr: 2 });
export const KICK = instrument('kick', (s, out, _f, v) => kick(s, out, 0, v, { tone: 52, decay: 0.32 }), { len: 0.45, velBuckets: 4, rr: 2 });
export const SNARE = instrument('snare', (s, out, _f, v, _d, fl) => snare(s, out, 0, v, { decay: fl === 'r' ? 0.08 : 0.15, tone: 200 }), { len: 0.3, velBuckets: 5, rr: 3 });
export const RIDE = instrument('ride', (s, out, _f, v) => ride(s, out, 0, v, { decay: 1.0 }), { len: 1.3, velBuckets: 4, rr: 3 });
export const HAT = instrument('hat', (s, out, _f, v, _d, fl) => hat(s, out, 0, v, fl === 'o'), { len: 0.5, velBuckets: 3, rr: 3 });
export const CRASH = instrument('crash', (s, out, _f, v, _d, fl) => crash(s, out, 0, v, { decay: fl === 's' ? 1.2 : 2.4 }), { len: 2.8, velBuckets: 2 });
export const GLK = instrument('glk', (s, out, f, v) => glock(s, out, 0, f, v, { decay: 1.4 }), { len: 1.6, velBuckets: 3 });
export const RAIL = instrument('rail', (s, out, f, v) => railClack(s, out, 0, v, { pitch: f / 1000, ring: 0.6 }), { len: 0.3, velBuckets: 4, rr: 3 });

// ---------------------------------------------------------------- comping / rhythm section

/** Walking (or two-feel) upright bass over the chart. `two(bar)` selects half notes for that bar. */
export function walkBass(a: Arr, slots: ChordSlot[], st: Stem, o: { lo?: number; hi?: number; vel?: number; two?: (bar: number) => boolean } = {}): Array<{ beat: number; midi: number }> {
  const bpb = a.clock.beatsPerBar;
  const walk = walkingBass(slots, a.totalBeats, o.lo ?? 29, o.hi ?? 50);
  for (const w of walk) {
    const bar = Math.floor(w.beat / bpb);
    const inBar = w.beat - bar * bpb;
    const two = o.two?.(bar) ?? false;
    if (two && inBar % 2 === 1) continue;
    const accent = inBar === 0 ? 1 : inBar === 2 ? 0.92 : 0.84;
    st.note(BASS, a.t(w.beat), mtof(w.midi), a.v((o.vel ?? 0.8) * accent), a.len(w.beat, two ? 1.7 : 0.9));
  }
  return walk;
}

/**
 * Stride piano: left hand bass (following the walk an octave up) on 1 and 3, a mid-register chord
 * "pah" on 2 and 4. `rh` adds a light right-hand chord on the off-beat of 4 (a stride push).
 */
export function stride(a: Arr, slots: ChordSlot[], walk: Array<{ beat: number; midi: number }>, st: Stem, o: { from?: number; to?: number; vel?: number; lo?: number; hi?: number; rh?: boolean } = {}): void {
  const bpb = a.clock.beatsPerBar;
  const v = o.vel ?? 0.6;
  const chordV = voicings(slots, o.lo ?? 53, o.hi ?? 67, 3);
  const rhV = voicings(slots, 65, 79, 3);
  const from = o.from ?? 0;
  const to = o.to ?? a.bars;
  for (let bar = from; bar < to; bar++) {
    for (let k = 0; k < bpb; k++) {
      const b = bar * bpb + k;
      const i = slots.indexOf(chordAt(slots, b));
      if (k % 2 === 0) {
        const m = (walk[b]?.midi ?? 41) + 12;
        st.note(PIANO, a.t(b), mtof(m), a.v(v * (k === 0 ? 0.95 : 0.85)), a.len(b, 0.8));
        if (k === 0) st.note(PIANO, a.t(b), mtof(m - 12), a.v(v * 0.55), a.len(b, 0.8));
      } else {
        chordV[i].forEach((mm, j) => st.note(PIANO, a.t(b) + j * 0.004, mtof(mm), a.v(v * 0.72), a.len(b, 0.42)));
      }
    }
    if (o.rh) {
      const b = bar * bpb + 3.5;
      const i = slots.indexOf(chordAt(slots, Math.min(a.totalBeats - 0.01, b + 0.5) % a.totalBeats));
      rhV[i].forEach((mm, j) => st.note(PIANO, a.t(b) + j * 0.004, mtof(mm), a.v(v * 0.5), a.len(b, 0.3), 'b'));
    }
  }
}

export interface KitStems {
  brush: Stem;
  kit: Stem;
  cym?: Stem;
}

/**
 * Swing kit with brushes: the "chugga-chugga" train shuffle on the snare (8ths, accents on 2 and 4),
 * brush swishes, feathered bass drum, hi-hat foot on 2 and 4 and an optional ride pattern.
 */
export function swingKit(a: Arr, k: KitStems, o: { from?: number; to?: number; chug?: number; swish?: number; kick?: number; foot?: number; ride?: number; sixteenths?: number } = {}): void {
  const bpb = a.clock.beatsPerBar;
  const chugV = [0.3, 0.16, 0.78, 0.2, 0.34, 0.16, 0.8, 0.24];
  for (let bar = o.from ?? 0; bar < (o.to ?? a.bars); bar++) {
    const b0 = bar * bpb;
    if (o.chug) chugV.forEach((v, e) => k.brush.note(TAP, a.t(b0 + e * 0.5), 0, a.v(v * o.chug!)));
    if (o.sixteenths) for (let e = 0; e < 16; e++) if (e % 2 === 1) k.brush.note(TAP, a.straight(b0 + e * 0.25), 0, a.v((e % 4 === 3 ? 0.2 : 0.12) * o.sixteenths));
    if (o.swish) for (const h of [0, 2]) k.brush.note(SWISH, a.t(b0 + h, false), 0, o.swish * 0.6, a.len(b0 + h, 1.9));
    if (o.kick) for (let q = 0; q < bpb; q++) k.kit.note(KICK, a.t(b0 + q), 0, a.v(o.kick * (q === 0 ? 1 : 0.8)));
    if (o.foot) for (const q of [1, 3]) k.kit.note(HAT, a.t(b0 + q), 0, a.v(o.foot));
    if (o.ride && k.cym) {
      const pat: Array<[number, number]> = [[0, 0.55], [1, 0.7], [1.5, 0.38], [2, 0.55], [3, 0.7], [3.5, 0.38]];
      for (const [b, v] of pat) k.cym.note(RIDE, a.t(b0 + b), 0, a.v(v * o.ride));
    }
  }
}

// ---------------------------------------------------------------- lines

/**
 * Improvised-sounding 8th-note line (clarinet obbligato, sax fills): chord tones on the beats,
 * scale/passing tones between, mostly stepwise, with breaths. Calls fn per note.
 */
export function noodle(
  a: Arr,
  slots: ChordSlot[],
  from: number,
  to: number,
  rng: Rng,
  fn: (t: number, f: number, dur: number, vel: number, midi: number) => void,
  o: { lo?: number; hi?: number; density?: number; scale?: number[]; vel?: number; step?: number } = {},
): void {
  const lo = o.lo ?? 67;
  const hi = o.hi ?? 86;
  const scale = o.scale ?? [0, 2, 4, 5, 7, 9, 10];
  const step = o.step ?? 0.5;
  let prev = Math.round((lo + hi) / 2);
  let dir = 1;
  for (let b = from; b < to - 1e-9; b += step) {
    if (rng.next() > (o.density ?? 0.8)) continue;
    const slot = chordAt(slots, b);
    const pcs = chordPcs(slot.chord);
    const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
    const pool = onBeat ? pcs : [...new Set([...pcs, ...scale.map((x) => (x + slot.chord.root) % 12)])];
    if (prev > hi - 3) dir = -1;
    else if (prev < lo + 3) dir = 1;
    else if (rng.next() < 0.22) dir = -dir;
    let best = prev;
    let bestCost = Infinity;
    for (const pc of pool) {
      for (let m = pcAtOrAbove(pc, lo); m <= hi; m += 12) {
        const d = m - prev;
        if (d === 0) continue;
        const cost = Math.abs(d - dir * 2) + (Math.sign(d) !== dir ? 3 : 0) + rng.next() * 1.5;
        if (cost < bestCost) {
          bestCost = cost;
          best = m;
        }
      }
    }
    prev = best;
    const v = (o.vel ?? 0.7) * (onBeat ? 0.85 : 1);
    fn(a.t(b), mtof(best), a.len(b, step * 0.92), a.v(v), best);
  }
}

// ---------------------------------------------------------------- train colour

/** The train-whistle motif ("woo-WOOO"): a short and a long blow of a chime whistle chord. */
export function whistleMotif(st: Stem, key: string, t: number, freqs: number[], vel: number, o: { short?: number; long?: number; gap?: number } = {}): void {
  const s1 = o.short ?? 0.28;
  const s2 = o.long ?? 0.8;
  const gap = o.gap ?? 0.1;
  st.shot(`${key}-w1`, s1 + 0.5, t, (s, out) => steamWhistle(s, out, 0, s1, freqs, vel, { attack: 0.05 }));
  st.shot(`${key}-w2`, s2 + 0.5, t + s1 + gap, (s, out) => steamWhistle(s, out, 0, s2, freqs, vel * 1.05, { attack: 0.06, release: 0.2 }));
}

/**
 * Tunnel ambience: distant trains rumbling past (muffled clickety-clacks over a low roar), wrapping
 * around the loop so the bed is seamless.
 */
export function tunnelBed(left: Stem, right: Stem, period: number, rng: Rng, o: { key: string; passes?: number; vel?: number }): void {
  const n = o.passes ?? 2;
  for (let i = 0; i < n; i++) {
    const t0 = (i + rng.range(0.1, 0.4)) * (period / n);
    const dur = rng.range(5.5, 7.5);
    const v = (o.vel ?? 1) * rng.range(0.75, 1);
    const st = i % 2 ? right : left;
    st.shot(`${o.key}-pass-${i}`, dur + 0.5, t0, (s, out) => {
      const g = s.gain(1, out);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, dur * 0.45);
      g.gain.linearRampToValueAtTime(0, dur);
      trackRumble(s, g, 0, dur, v * 0.6, { lp: 260, fadeIn: 0.1, fadeOut: 0.1 });
      const muffle = s.filter('lowpass', 900, 0.7, g);
      for (let tt = 0.3; tt < dur - 0.6; tt += 0.62) clickety(s, muffle, tt, v * 0.5, { pitch: 0.8, pair: 0.22, gap: 0.07 });
    });
  }
}

