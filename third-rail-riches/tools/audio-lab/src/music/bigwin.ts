/**
 * "PLUNDER FANFARE": the big-win celebration loop. A triumphant cartoon brass march in Bb major,
 * 120 bpm, 8 bars (16 s). Trumpets in thirds, oom-pah tuba with trombone and accordion pumps,
 * accordion flourishes in the gaps, glockenspiel doubling, snare march, a cheeky Ebm (minor iv) in
 * bar 6 and a timpani roll across the loop seam into the downbeat.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { chordPcs, hz, mtof, bassNote } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow, voicings } from './common';
import { glock, xylophone } from '../instruments/tuned';
import { accordion, brass, tuba } from '../instruments/winds';
import { crash, kick, snare, timpani } from '../instruments/drums';

const BPM = 120;
const BPB = 4;
const BARS = 8;

const CHART = ['Bb', 'Eb', 'Bb', 'F7', 'Bb', 'Eb Ebm', 'Bb/F F7', 'Bb F7'];

const MELODY = `
F4:8 Bb4:8 D5:8 F5:8 Bb5:4 F5:4 | G5:4. F5:8 Eb5:4 Bb4:4 | D5:8 F5:8 Bb5:8 D6:8 F6:4 D6:4 | Eb6:4 C6:4 A5:4 F5:4 |
Bb5:4. A5:8 Bb5:4 D6:4 | Eb6:4 Bb5:4 Gb5:4 Bb5:4 | D6:4 Bb5:8 D6:8 C6:4 A5:4 | Bb5:4 F5:8 F5:8 A5:4 r:4 |`;

// accordion flourishes filling the held notes and the last beat (16ths)
const FLOURISH = `
r:1 | r:2. Bb4:16 C5:16 D5:16 Eb5:16 | r:1 | r:2. F5:16 G5:16 A5:16 Bb5:16 |
r:1 | r:2. Gb5:16 F5:16 Eb5:16 Db5:16 | r:1 | r:2. Eb5:16 D5:16 C5:16 A4:16 |`;

const TPT = instrument('tpt', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { bright: 1.15 }), { len: (_f, d) => d + 0.35, velBuckets: 4, durStep: 0.02 });
const TBN = instrument('tbn', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { bright: 0.8, vib: false }), { len: (_f, d) => d + 0.3, velBuckets: 3, durStep: 0.02 });
const ACC = instrument('acc', (s, out, f, v, d) => accordion(s, out, 0, f, d, v, { attack: 0.01, bright: 0.95 }), { len: (_f, d) => d + 0.2, velBuckets: 4, durStep: 0.02 });
const TUBA = instrument('tuba', (s, out, f, v, d) => tuba(s, out, 0, f, d, v), { len: (_f, d) => d + 0.3, velBuckets: 3, durStep: 0.02 });
const GLK = instrument('glk', (s, out, f, v) => glock(s, out, 0, f, v, { decay: 1.2 }), { len: 1.4, velBuckets: 3 });
const XYL = instrument('xyl', (s, out, f, v) => xylophone(s, out, 0, f, v), { len: 0.9, velBuckets: 4 });
const SN = instrument('sn', (s, out, _f, v, _d, fl) => snare(s, out, 0, v, { decay: fl === 'r' ? 0.09 : 0.16 }), { len: 0.3, velBuckets: 5, rr: 3 });
const BD = instrument('bd', (s, out, _f, v) => kick(s, out, 0, v, { tone: 50, decay: 0.45 }), { len: 0.6, velBuckets: 3, rr: 2 });
const CRASH = instrument('crash', (s, out, _f, v, _d, fl) => crash(s, out, 0, v, { decay: fl === 's' ? 1.1 : 2.4 }), { len: 2.8, velBuckets: 2 });
const TIMP = instrument('timp', (s, out, f, v) => timpani(s, out, 0, f, v, { decay: 1.4 }), { len: 1.6, velBuckets: 5, rr: 2 });

export const BIGWIN: TrackDef = {
  id: 'bigwin',
  title: 'Plunder Fanfare',
  desc: 'big-win celebration: triumphant cartoon brass march with accordion flourishes, Bb major, 120 bpm, 8 bars',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.5, drive: 1.5, width: 0.8, air: 0.7 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.5);
    const m = new Mixer(clock.bars(BARS), 44100, hashString('bigwin'));
    const a = new Arr(new Rng(41), clock, BARS, 0.004, 0.06);
    const slots = chart(CHART, BPB);
    m.reverb('hall', { seconds: 2.8, rt60: 2, predelay: 0.02, dampStart: 8000, dampEnd: 2400, early: 12, earlySpread: 0.05, lowCut: 140 });

    const tpt = m.stem('tpt', { gain: 0.9, pan: 0.1, sends: { hall: 0.25 } });
    const tpt2 = m.stem('tpt2', { gain: 0.6, pan: -0.15, sends: { hall: 0.25 } });
    const tbn = m.stem('tbn', { gain: 0.6, pan: -0.25, sends: { hall: 0.2 } });
    const acc = m.stem('acc', { gain: 0.4, pan: 0.3, sends: { hall: 0.2 } });
    const tb = m.stem('tuba', { gain: 0.42, sends: { hall: 0.1 } });
    const glk = m.stem('glk', { gain: 0.45, pan: 0.3, sends: { hall: 0.3 } });
    const drums = m.stem('drums', { gain: 0.38, sends: { hall: 0.15 } });
    const cym = m.stem('cym', { gain: 0.9, pan: 0.15, sends: { hall: 0.15 } });
    const tim = m.stem('timp', { gain: 0.6, sends: { hall: 0.2 } });

    const mel = seq(MELODY, { name: 'plunder fanfare', vel: 0.85 });
    a.play(mel, (t, f, d, v, ev, midi) => {
      tpt.note(TPT, t, f, v, d * 0.9);
      glk.note(GLK, t, f * 2, v * 0.4);
      const pcs = chordPcs(chordAt(slots, ev.beat).chord);
      tpt2.note(TPT, t, mtof(harmonyBelow(midi, pcs)), v * 0.85, d * 0.9);
    });
    a.play(seq(FLOURISH, { name: 'flourish', vel: 0.7 }), (t, f, d, v) => acc.note(ACC, t, f, v, d * 0.95));

    // oom-pah: tuba on 1 and 3, trombones and accordion on 2 and 4
    const tbV = voicings(slots, 50, 65, 3);
    const acV = voicings(slots, 58, 70, 3);
    for (let b = 0; b < BARS * BPB; b++) {
      const i = slots.indexOf(chordAt(slots, b));
      const slot = slots[i];
      if (b % 2 === 0) {
        const root = bassNote(slot.chord, 34);
        const fifth = root + 7 > 50 ? root - 5 : root + 7;
        tb.note(TUBA, a.t(b), mtof(b % 4 === 0 || slot.beat === b ? root : fifth), a.v(0.8), a.len(b, 0.7));
      } else {
        for (const mm of tbV[i]) tbn.note(TBN, a.t(b), mtof(mm), a.v(0.62), a.len(b, 0.35));
        for (const mm of acV[i]) acc.note(ACC, a.t(b), mtof(mm), a.v(0.45), a.len(b, 0.3));
      }
    }

    // march snare, bass drum, cymbals
    for (let bar = 0; bar < BARS; bar++) {
      const b0 = bar * BPB;
      drums.note(BD, a.t(b0), 0, a.v(0.8));
      drums.note(BD, a.t(b0 + 2), 0, a.v(0.7));
      const pat = [0.62, 0.28, 0.42, 0.28, 0.58, 0.28, 0.42, 0.3];
      const roll = bar === 3 || bar === 7;
      pat.forEach((v, k) => {
        if (roll && k >= 4) return;
        drums.note(SN, a.t(b0 + k * 0.5), 0, a.v(v));
      });
      if (roll) for (let k = 0; k < 16; k++) drums.note(SN, a.straight(b0 + 2 + k * 0.125), 0, a.v(0.2 + k * 0.035), 0, 'r');
      if (bar === 0 || bar === 4) cym.note(CRASH, a.t(b0, false), 0, 0.6);
      else if (bar % 2 === 0) cym.note(CRASH, a.t(b0, false), 0, 0.35, 0, 's');
    }

    // timpani: hits on the big downbeats, roll across the loop seam
    tim.note(TIMP, a.t(0, false), hz('Bb1'), 0.9);
    tim.note(TIMP, a.t(16, false), hz('Bb1'), 0.8);
    for (let k = 0; k < 16; k++) tim.note(TIMP, a.straight(30 + k * 0.125), hz('F2'), 0.25 + k * 0.035);

    // xylophone sparkle up to the top of bar 3
    ['F5', 'G5', 'A5', 'Bb5', 'C6', 'D6', 'Eb6', 'F6'].forEach((n, k) => glk.note(XYL, a.t(10 + k * 0.25), hz(n), a.v(0.35 + k * 0.05)));

    return m.render(3);
  },
};
