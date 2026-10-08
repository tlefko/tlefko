/**
 * "DAVY JONES' WALTZ": the hidden, epic bonus. An ethereal 3/4 waltz from the bottom of the sea,
 * D minor lifting to F major, 90 bpm, 24 bars (48 s). Music box and celesta trade the tune over a
 * soft oom-pah-pah (pizzicato bass, celesta chords), wordless choir that opens from "oo" to "ah"
 * with high strings for the last phrase, and an underwater shimmer: wobbling tape, rising bubbles
 * and a slow dark current.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { bassNote, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, voicings } from './common';
import { celesta, musicBox } from '../instruments/tuned';
import { choir, pizz, strings } from '../instruments/strings';
import type { Dest, Studio } from '../core/studio';

const BPM = 90;
const BPB = 3;
const BARS = 24;

const CHART = [
  'Dm', 'Dm', 'Gm', 'A7', 'Dm', 'Bb', 'Gm6', 'A7',
  'F', 'C', 'Dm', 'Am', 'Bb', 'F', 'Gm', 'C7',
  'F', 'Dm', 'Bb', 'Gm', 'Dm/A', 'A7', 'Dm', 'A7',
];

const MELODY = `
A5:2 D6:4 | C6:4 A5:4 F5:4 | G5:2 Bb5:4 | A5:2. |
F5:2 A5:4 | D6:4 C6:4 Bb5:4 | E5:4 G5:4 Bb5:4 | A5:2. |
C6:2 F6:4 | E6:4 D6:4 C6:4 | D6:2 A5:4 | C6:2. |
D6:2 F6:4 | C6:4 A5:4 F5:4 | G5:4 Bb5:4 D6:4 | C6:2. |
A5:2 C6:4 | D6:4 C6:4 A5:4 | Bb5:2 D6:4 | G5:4 Bb5:4 D6:4 |
F6:2 E6:4 | C#6:4 E6:4 G6:4 | D6:2. | E5:4 C#5:4 A4:4 |`;

/** A bubble rising: a quick upward sine chirp. */
function bubble(s: Studio, out: Dest, f: number, vel: number): void {
  const g = s.gain(0, out);
  s.perc(g.gain, 0, vel * 0.3, 0.002, 0.06);
  const o = s.osc('sine', f, 0, 0.1, g);
  o.frequency.setValueAtTime(f, 0);
  o.frequency.exponentialRampToValueAtTime(f * 1.9, 0.05);
}

/** The deep current: dark noise swelling slowly (one swell per call). */
function current(s: Studio, out: Dest, dur: number, vel: number): void {
  const lp = s.filter('lowpass', 380, 0.6, out);
  lp.frequency.setValueAtTime(260, 0);
  lp.frequency.linearRampToValueAtTime(520, dur * 0.5);
  lp.frequency.linearRampToValueAtTime(240, dur);
  const g = s.gain(0, lp);
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(vel, dur * 0.5);
  g.gain.linearRampToValueAtTime(0, dur);
  s.noise('brown', 0, dur + 0.05, g);
}

const BOX = instrument('box', (s, out, f, v) => musicBox(s, out, 0, f, v, { bright: 1.1 }), { len: (f) => Math.max(1, Math.min(3.7, 3.2 * Math.sqrt(440 / f))) + 0.1, velBuckets: 5, rr: 2 });
const CEL = instrument('cel', (s, out, f, v) => celesta(s, out, 0, f, v, { decay: 2.4 }), { len: 2.7, velBuckets: 5 });
const PAH = instrument('pah', (s, out, f, v) => celesta(s, out, 0, f, v, { decay: 0.9 }), { len: 1.1, velBuckets: 3 });
const PIZZ = instrument('pizz', (s, out, f, v, d) => pizz(s, out, 0, f, v, { decay: 1.6, dur: d }), { len: (_f, d) => Math.min(2, d + 0.6), velBuckets: 3, durStep: 0.05 });
const OO = instrument('oo', (s, out, f, v, d) => choir(s, out, 0, f, d, v, { vowel: 'oo', attack: 0.8, release: 1.4 }), { len: (_f, d) => d + 2, velBuckets: 2, durStep: 0.05 });
const AH = instrument('ah', (s, out, f, v, d) => choir(s, out, 0, f, d, v, { vowel: 'ah', attack: 0.6, release: 1.6 }), { len: (_f, d) => d + 2.2, velBuckets: 2, durStep: 0.05 });
const VLN = instrument('vln', (s, out, f, v, d) => strings(s, out, 0, f, d, v, { attack: 0.9, release: 1.4, bright: 1, tremolo: 5 }), { len: (_f, d) => d + 2, velBuckets: 2, durStep: 0.05 });
const BUB = instrument('bub', (s, out, f, v) => bubble(s, out, f, v), { len: 0.15, velBuckets: 3 });

export const LIMBO: TrackDef = {
  id: 'limbo',
  title: "Davy Jones' Waltz",
  desc: 'hidden bonus: ethereal underwater waltz, music box + celesta + choir, D minor to F major, 90 bpm 3/4',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 6,
  master: { crackle: 0.5, drive: 1.2, width: 0.9, air: 0.35 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.5);
    const m = new Mixer(clock.bars(BARS), 44100, hashString('limbo'));
    const a = new Arr(new Rng(31), clock, BARS, 0.006, 0.07);
    const slots = chart(CHART, BPB);
    m.reverb('deep', { seconds: 5.5, rt60: 4.2, predelay: 0.04, dampStart: 7000, dampEnd: 1800, early: 14, earlySpread: 0.09, lowCut: 110 });
    m.wow = { rate: 0.22, depth: 0.5 };

    const box = m.stem('box', { gain: 1, pan: 0.08, wow: true, sends: { deep: 0.55 } });
    const cel = m.stem('cel', { gain: 0.6, pan: -0.25, wow: true, sends: { deep: 0.55 } });
    const lead = m.stem('celLead', { gain: 1.15, pan: -0.1, wow: true, sends: { deep: 0.55 } });
    const pah = m.stem('pah', { gain: 0.6, pan: 0.2, wow: true, sends: { deep: 0.5 } });
    const bass = m.stem('bass', { gain: 0.3, hp: 40, sends: { deep: 0.3 } });
    const ch = m.stem('choir', { gain: 0.12, sends: { deep: 0.65 } });
    const vln = m.stem('vln', { gain: 0.7, pan: 0.15, lp: 6500, sends: { deep: 0.6 } });
    const bub = m.stem('bub', { gain: 0.3, pan: -0.3, hp: 600, sends: { deep: 0.5 } });
    const cur = m.stem('current', { gain: 0.2, hp: 60 });

    const mel = seq(MELODY, { name: 'waltz', beatsPerBar: BPB, vel: 0.72 });
    // A (bars 1-8): music box, celesta an octave down; B (9-16): celesta leads, box an octave up; C (17-24): both
    a.play(mel, (t, f, _d, v, ev) => {
      const bar = Math.floor(ev.beat / BPB);
      if (bar < 8) {
        box.note(BOX, t, f, v);
        cel.note(CEL, t, f / 2, v * 0.55);
      } else if (bar < 16) {
        lead.note(CEL, t, f, v);
        box.note(BOX, t, f * 2, v * 0.45);
      } else {
        box.note(BOX, t, f, v);
        cel.note(CEL, t, f, v * 0.7);
      }
    });

    // oom-pah-pah
    const pahV = voicings(slots, 60, 72, 2);
    slots.forEach((slot, i) => {
      bass.note(PIZZ, a.t(slot.beat), mtof(bassNote(slot.chord, 38)), a.v(0.7), a.len(slot.beat, 1.5));
      for (const k of [1, 2]) for (const mm of pahV[i]) pah.note(PAH, a.t(slot.beat + k), mtof(mm), a.v(k === 1 ? 0.36 : 0.3));
    });

    // choir: "oo" for two phrases, then "ah" with high strings for the lift
    const ooV = voicings(slots.slice(0, 16), 57, 72, 3);
    slots.slice(0, 16).forEach((slot, i) => {
      for (const mm of ooV[i]) ch.note(OO, a.t(slot.beat, false), mtof(mm), 0.42, a.len(slot.beat, slot.len) * 0.98);
    });
    const lift = slots.slice(16);
    const ahV = voicings(lift, 57, 74, 4);
    const vlV = voicings(lift, 69, 86, 3);
    lift.forEach((slot, i) => {
      const d = a.len(slot.beat, slot.len) * 0.98;
      for (const mm of ahV[i]) ch.note(AH, a.t(slot.beat, false), mtof(mm), 0.55, d);
      for (const mm of vlV[i]) vln.note(VLN, a.t(slot.beat, false), mtof(mm), 0.45, d);
    });

    // underwater: bubbles drifting up in little clusters, and the slow current
    const r = new Rng(808);
    for (let k = 0; k < 26; k++) {
      const t0 = r.next() * a.period;
      const n = r.int(2, 5);
      let f = r.range(900, 1600);
      for (let j = 0; j < n; j++) {
        bub.note(BUB, a.wrap(t0 + j * r.range(0.05, 0.12)), f, r.range(0.3, 0.8));
        f *= r.range(1.1, 1.35);
      }
    }
    for (let k = 0; k < 6; k++) {
      const dur = r.range(6, 9);
      const t = (k * a.period) / 6 + r.range(-0.5, 0.5);
      const v = r.range(0.6, 1);
      cur.shot(`current-${k}`, dur + 0.2, t, (s, out) => current(s, out, dur, v));
    }

    return m.render(6);
  },
};
