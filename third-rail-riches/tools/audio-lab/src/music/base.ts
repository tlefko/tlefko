/**
 * BASE GAME: "Powder Keg Cove". An easy-going, jaunty sea shanty in 6/8, D dorian, dotted quarter
 * = 96 (quarter = 144), 32 bars (40 s): the 16-bar tune twice. Concertina lead with fiddle answers
 * at the phrase ends (second pass: the fiddle also harmonises in thirds and sixths), pizzicato bass
 * (the tuba takes over on the second pass), accordion off-beat chords, a light frame drum and
 * shaker, and a low bed of waves and creaking timbers.
 * The metadata counts the dotted-quarter pulse (96 bpm, 2 beats per bar): the game bounces on it.
 */
import type { TrackDef } from '../types';
import { CompoundClock, seq } from '../core/score';
import { bassNote, chordPcs, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow, seaBed, voicings } from './common';
import { fiddle, pizz } from '../instruments/strings';
import { accordion, concertina, tuba } from '../instruments/winds';
import { frameDrum, shaker } from '../instruments/drums';

const PULSE_BPM = 96; // dotted quarter
const QBPM = PULSE_BPM * 1.5; // notation counts quarter notes
const QPB = 3; // quarter beats per 6/8 bar
const BARS = 32;

const CHART_16 = ['Dm', 'Dm C', 'C', 'C', 'Dm', 'Dm F', 'G', 'Dm', 'F', 'C', 'Dm', 'Am', 'F', 'G', 'C', 'Dm'];
const CHART = [...CHART_16, ...CHART_16];

// the tune: 8 bars "verse" (A) + 8 bars "chorus" (B), phrase ends left open for the fiddle
const TUNE = `
D5:4 A4:8 D5:4 E5:8 | F5:4 E5:8 D5:4 C5:8 | E5:4 C5:8 G4:4 C5:8 | E5:4. r:4. |
D5:4 A4:8 D5:4 E5:8 | F5:4 G5:8 A5:4 C6:8 | B5:4 G5:8 D5:4 E5:8 | D5:4. r:4. |
A5:4 F5:8 C5:4 F5:8 | G5:4 E5:8 C5:4 E5:8 | F5:4 D5:8 A4:4 D5:8 | C5:4 A4:8 E5:4. |
A5:4 F5:8 C6:4 A5:8 | B5:4 G5:8 D6:4 B5:8 | C6:4 G5:8 E5:4 C5:8 | D5:4. r:4. |`;

// fiddle answers, first and second time round
const ANSWERS_1 = `
r:2. | r:2. | r:2. | r:4. G5:8 F5:8 E5:8 | r:2. | r:2. | r:2. | r:4. A5:8 C6:8 B5:8 |
r:2. | r:2. | r:2. | r:4. A5:16 B5:16 C6:8 A5:8 | r:2. | r:2. | r:2. | r:4. F5:8 E5:8 C5:8 |`;
const ANSWERS_2 = `
r:2. | r:2. | r:2. | r:4. G5:16 A5:16 G5:8 E5:8 | r:2. | r:2. | r:2. | r:4. D6:8 C6:8 B5:8 |
r:2. | r:2. | r:2. | r:4. E6:8 D6:8 C6:8 | r:2. | r:2. | r:2. | r:4. A5:16 G5:16 F5:8 E5:8 |`;

const CONC = instrument('conc', (s, out, f, v, d) => concertina(s, out, 0, f, d, v), { len: (_f, d) => d + 0.3, velBuckets: 4, durStep: 0.03, rr: 2 });
const FID = instrument('fid', (s, out, f, v, d, fl) => fiddle(s, out, 0, f, d, v, fl), { len: (_f, d) => d + 0.4, velBuckets: 4, durStep: 0.03, rr: 2 });
const ACC = instrument('acc', (s, out, f, v, d) => accordion(s, out, 0, f, d, v, { breath: 0.6, bright: 0.75 }), { len: (_f, d) => d + 0.25, velBuckets: 3, durStep: 0.03 });
const PIZZ = instrument('pizz', (s, out, f, v, d) => pizz(s, out, 0, f, v, { decay: 1.3, dur: d }), { len: (_f, d) => Math.min(1.8, d + 0.5), velBuckets: 3, durStep: 0.05, rr: 2 });
const TUBA = instrument('tuba', (s, out, f, v, d) => tuba(s, out, 0, f, d, v), { len: (_f, d) => d + 0.3, velBuckets: 3, durStep: 0.03, rr: 2 });
const DRUM = instrument('drum', (s, out, _f, v, _d, fl) => frameDrum(s, out, 0, v, { muted: fl === 'm', tone: fl === 'm' ? 160 : 92, decay: fl === 'm' ? 0.12 : 0.3 }), { len: 0.45, velBuckets: 5, rr: 3 });
const SHK = instrument('shk', (s, out, _f, v) => shaker(s, out, 0, v, { len: 0.075 }), { len: 0.2, velBuckets: 3, rr: 3 });

export const BASE: TrackDef = {
  id: 'base',
  title: 'Powder Keg Cove',
  desc: 'base game: jaunty 6/8 sea shanty, concertina lead with fiddle answers, D dorian, 96 bpm (dotted quarter)',
  bpm: PULSE_BPM,
  beatsPerBar: 2,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.7, drive: 1.3, width: 0.75, air: 0.5 },
  async render() {
    const clock = new CompoundClock(QBPM, QPB, 0.03);
    const m = new Mixer(clock.bars(BARS), 44100, hashString('base'));
    const a = new Arr(new Rng(7), clock, BARS, 0.005, 0.07);
    const slots = chart(CHART, QPB);
    m.reverb('cove', { seconds: 2.4, rt60: 1.4, predelay: 0.02, dampStart: 7500, dampEnd: 2000, early: 12, earlySpread: 0.05, lowCut: 150 });
    m.wow = { rate: 0.3, depth: 0.12 };

    const conc = m.stem('conc', { gain: 0.9, pan: 0.12, wow: true, sends: { cove: 0.25 } });
    const fid = m.stem('fid', { gain: 1.5, pan: -0.28, wow: true, sends: { cove: 0.3 } });
    const acc = m.stem('acc', { gain: 0.4, pan: 0.25, lp: 3200, wow: true, sends: { cove: 0.2 } });
    const bass = m.stem('bass', { gain: 0.38, hp: 45, sends: { cove: 0.08 } });
    const tb = m.stem('tuba', { gain: 0.34, hp: 35, sends: { cove: 0.08 } });
    const drum = m.stem('drum', { gain: 0.45, hp: 55, sends: { cove: 0.12 } });
    const shk = m.stem('shk', { gain: 1.3, pan: -0.35, sends: { cove: 0.1 } });
    const seaL = m.stem('seaL', { gain: 0.32, pan: -0.6, hp: 110 });
    const seaR = m.stem('seaR', { gain: 0.32, pan: 0.6, hp: 110 });

    // concertina: the tune twice, a touch more pushed the second time
    const tune = seq(TUNE, { name: 'base tune', beatsPerBar: QPB, vel: 0.74 });
    for (const pass of [0, 1]) a.play(tune, (t, f, d, v) => conc.note(CONC, t, f, v, d * 0.9), { offset: pass * 16 * QPB, velScale: pass ? 1.06 : 1 });
    // fiddle answers
    a.play(seq(ANSWERS_1, { name: 'answers 1', beatsPerBar: QPB, vel: 0.68 }), (t, f, d, v) => fid.note(FID, t, f, v, d * 0.9));
    a.play(seq(ANSWERS_2, { name: 'answers 2', beatsPerBar: QPB, vel: 0.72, startBeat: 16 * QPB }), (t, f, d, v) => fid.note(FID, t, f, v, d * 0.9));
    // second pass: the fiddle harmonises the tune in thirds and sixths below
    a.play(tune, (t, f, d, v, ev, mm) => {
      const pcs = chordPcs(chordAt(slots, ev.beat + 16 * QPB).chord);
      fid.note(FID, t, mtof(harmonyBelow(mm, pcs)), v * 0.55, d * 0.88);
    }, { offset: 16 * QPB });

    // oom (bass on 1 and 4) - pah (accordion on 3 and 6)
    const accV = voicings(slots, 53, 65, 3);
    for (let bar = 0; bar < BARS; bar++) {
      const second = bar >= 16;
      for (const half of [0, 1]) {
        const beat = bar * QPB + half * 1.5;
        const i = slots.indexOf(chordAt(slots, beat));
        const slot = slots[i];
        const root = bassNote(slot.chord, 38);
        const note = half === 0 || slot.beat === beat ? root : root + 7 > 50 ? root - 5 : root + 7;
        if (second) tb.note(TUBA, a.t(beat), mtof(note), a.v(half ? 0.62 : 0.74), a.len(beat, 0.8));
        else bass.note(PIZZ, a.t(beat), mtof(note), a.v(half ? 0.66 : 0.8), a.len(beat, 1.2));
        for (const mm of accV[i]) acc.note(ACC, a.t(beat + 1), mtof(mm), a.v(second ? 0.5 : 0.42), a.len(beat + 1, 0.42));
      }
    }

    // frame drum and shaker
    for (let bar = 0; bar < BARS; bar++) {
      const b0 = bar * QPB;
      const full = bar >= 8;
      const lift = bar >= 16 ? 1.12 : 1;
      drum.note(DRUM, a.t(b0), 0, a.v(0.55 * lift));
      drum.note(DRUM, a.t(b0 + 1.5), 0, a.v(0.34 * lift), 0, 'm');
      if (full) {
        drum.note(DRUM, a.t(b0 + 1), 0, a.v(0.2 * lift), 0, 'm');
        drum.note(DRUM, a.t(b0 + 2.5), 0, a.v(0.24 * lift), 0, 'm');
        if (bar >= 16) {
          drum.note(DRUM, a.t(b0 + 0.5), 0, a.v(0.1), 0, 'm');
          drum.note(DRUM, a.t(b0 + 2), 0, a.v(0.12), 0, 'm');
        }
      }
      if (bar % 16 === 15) [2, 2.5].forEach((b, k) => drum.note(DRUM, a.t(b0 + b), 0, a.v(0.3 + k * 0.12), 0, 'm'));
      const sv = [0.36, 0.15, 0.22, 0.3, 0.15, 0.22];
      for (let e = 0; e < 6; e++) shk.note(SHK, a.t(b0 + e * 0.5), 0, a.v(sv[e] * (full ? 1 : 0.7) * lift));
    }

    // the cove: waves and the odd creak of timber, very low
    seaBed(seaL, seaR, a.period, new Rng(77), { key: 'base', waves: 8, creaks: 3, creakVel: 0.45 });

    return m.render(3);
  },
};
