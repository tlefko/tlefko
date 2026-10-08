/**
 * "LAST TRAIN" (the Last Train buy): late-night noir blues building to a golden swing. 120 bpm shuffle,
 * 24 bars (48 s): a 12-bar D minor blues (plunger-muted trumpet, low chalumeau clarinet, sparse
 * piano, a slow two-feel bass, a far-off whistle) then a 12-bar F major blues in full golden swing
 * (open trumpet lead in harmony with the clarinet, trombone pads, stride piano, walking bass, ride,
 * glockenspiel glints and the whistle motif in major), turning back to D minor through A7. Under it
 * all, the steady train: brushed shuffle, rail joints clicking on the beat, the third rail humming.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { bassNote, chordPcs, hz, mtof, pcAtOrAbove } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow, voicings } from './common';
import { CLAR, GLK, MUTE, PIANO, RAIL, TBN, TPT, stride, swingKit, walkBass, whistleMotif } from './band';
import { electricHum } from '../instruments/train';

const BPM = 120;
const BPB = 4;
const BARS = 24;

const NOIR = ['Dm', 'Dm', 'Dm', 'Dm7', 'Gm7', 'Gm7', 'Dm', 'Dm', 'Bb7', 'A7', 'Dm', 'A7'];
const GOLD = ['F6', 'Bb7', 'F6', 'F7', 'Bb7', 'Bdim7', 'F6', 'D7', 'Gm7', 'C7', 'F6 D7', 'Gm7 A7'];
const CHART = [...NOIR, ...GOLD];

const NOIR_TUNE = `
r:4 A4:8 C5:8 D5:4.!w F5:8 | E5:8 D5:8 C5:8 A4:8 D5:2!w | r:4 A4:8 C5:8 D5:8 F5:8 Ab5:8!b G5:8 | F5:8 D5:8 C5:8 A4:8 C5:2!w |
r:4 Bb4:8 D5:8 G5:4.!w F5:8 | Bb5:8 A5:8 G5:8 F5:8 D5:2!w | r:4 A4:8 C5:8 D5:8 F5:8 A5:4 | Ab5:8!b G5:8 F5:8 D5:8 C5:4 r:4 |
r:8 D5:8 F5:8 Ab5:8 Bb5:4.!w Ab5:8 | G5:8 E5:8 C#5:8 E5:8 A4:2!wf | r:8 D5:8 F5:8 A5:8 G5:8 F5:8 D5:4 | E5:4 C#5:4 A4:4 r:4 |`;

const GOLD_TUNE = `
C5:8 D5:8 F5:8 A5:8 C6:4 A5:4 | Ab5:8 G5:8 F5:8 D5:8 Bb4:2 | C5:8 D5:8 F5:8 A5:8 C6:4 D6:4 | C6:8 A5:8 Eb5:8 F5:8 A5:2 |
D6:4. Bb5:8 Ab5:4 F5:4 | B5:8 Ab5:8 F5:8 D5:8 B4:2 | A5:8 C6:8 D6:8 C6:8 A5:4 F5:4 | F#5:8 A5:8 C6:8 A5:8 D6:2 |
Bb5:4. A5:8 G5:4 F5:4 | E5:8 G5:8 Bb5:8 D6:8 C6:2 | A5:8 G5:8 F5:8 D5:8 F#5:4 A5:4 | G5:8 F5:8 E5:8 C#5:8 E5:4 r:4 |`;

export const LAST: TrackDef = {
  id: 'last',
  title: 'Last Train',
  desc: 'Last Train: noir D minor blues on the night train (plunger trumpet, low clarinet) building to a golden F major swing, 120 bpm shuffle',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 4,
  master: { crackle: 0.8, drive: 1.3, width: 0.78, air: 0.7 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.667);
    const period = clock.bars(BARS);
    const m = new Mixer(period, 44100, hashString('last'));
    const a = new Arr(new Rng(31), clock, BARS, 0.005, 0.07);
    const slots = chart(CHART, BPB);
    const goldBeat = 12 * BPB;
    m.reverb('night', { seconds: 3.6, rt60: 2.4, predelay: 0.03, dampStart: 6500, dampEnd: 1800, early: 12, earlySpread: 0.07, lowCut: 120 });
    m.reverb('car', { seconds: 1.2, rt60: 0.7, predelay: 0.008, dampStart: 6000, dampEnd: 2200, early: 8, earlySpread: 0.02, lowCut: 160 });
    m.wow = { rate: 0.25, depth: 0.2 };

    const mute = m.stem('mute', { gain: 1.0, pan: 0.1, wow: true, sends: { night: 0.35 } });
    const tpt = m.stem('tpt', { gain: 1.1, pan: 0.1, sends: { night: 0.3 } });
    const clar = m.stem('clar', { gain: 0.55, pan: -0.25, wow: true, sends: { night: 0.32 } });
    const tbn = m.stem('tbn', { gain: 0.5, pan: -0.3, sends: { night: 0.28 } });
    const pno = m.stem('piano', { gain: 0.9, pan: -0.12, sends: { night: 0.25 } });
    const bass = m.stem('bass', { gain: 0.32, hp: 38, sends: { car: 0.06 } });
    const brush = m.stem('brush', { gain: 3.0, pan: 0.15, sends: { car: 0.15 } });
    const kit = m.stem('kit', { gain: 0.4, hp: 40, sends: { car: 0.1 } });
    const cym = m.stem('cym', { gain: 1.1, pan: 0.35, sends: { night: 0.15 } });
    const rail = m.stem('rail', { gain: 0.6, hp: 70, pan: -0.15, sends: { car: 0.2 } });
    const hum = m.stem('hum', { gain: 0.06, hp: 50, lp: 2500 });
    const glk = m.stem('glk', { gain: 0.8, pan: 0.4, sends: { night: 0.45 } });
    const whistle = m.stem('whistle', { gain: 0.5, pan: -0.4, hp: 250, sends: { night: 0.5 } });

    // chorus 1: noir, plunger-muted trumpet and a low clarinet
    a.play(seq(NOIR_TUNE, { name: 'noir', vel: 0.72 }), (t, f, d, v, ev) => mute.note(MUTE, t, f, v, d * 0.93, ev.flags));
    const chalumeau = seq(`D4:1 | C4:2 A3:2 | D4:1 | C4:1 | Bb3:1 | D4:2 Bb3:2 | A3:1 | Ab3:2 A3:2 | Ab3:1 | G3:1 | F3:1 | E3:2 C#4:2 |`, { name: 'chalumeau', vel: 0.5 });
    a.play(chalumeau, (t, f, d, v) => clar.note(CLAR, t, f, v, d * 0.95));
    // sparse noir piano: low minor chords on 1 (and the and-of-2), a tremolo on the turnaround
    const lowV = voicings(slots, 50, 62, 3);
    for (let bar = 0; bar < 12; bar++) {
      const b0 = bar * BPB;
      const i = slots.indexOf(chordAt(slots, b0));
      lowV[i].forEach((mm, j) => pno.note(PIANO, a.t(b0) + j * 0.012, mtof(mm), a.v(0.42), a.len(b0, 1.6)));
      if (bar % 2 === 1) lowV[i].forEach((mm, j) => pno.note(PIANO, a.t(b0 + 1.5) + j * 0.01, mtof(mm + 12), a.v(0.3), a.len(b0 + 1.5, 0.4)));
      pno.note(PIANO, a.t(b0), mtof(bassNote(slots[i].chord, 26)), a.v(0.5), a.len(b0, 2.5));
    }
    // bass: slow two-feel under the noir chorus, walking in the golden one
    const walk = walkBass(a, slots, bass, { lo: 26, hi: 46, vel: 0.82, two: (bar) => bar < 12 });

    // chorus 2: golden swing
    a.play(seq(GOLD_TUNE, { name: 'gold', vel: 0.8 }), (t, f, d, v, ev, mm) => {
      tpt.note(TPT, t, f, v, d * 0.9);
      const pcs = chordPcs(chordAt(slots, ev.beat + goldBeat).chord);
      clar.note(CLAR, t, mtof(harmonyBelow(mm, pcs)), v * 0.7, d * 0.9);
      if (ev.dur >= 1.5) glk.note(GLK, t, f * 2, v * 0.45);
    }, { offset: goldBeat });
    const tbV = voicings(slots, 50, 63, 3);
    slots.forEach((slot, i) => {
      if (slot.beat < goldBeat) return;
      for (const mm of tbV[i]) tbn.note(TBN, a.t(slot.beat, false), mtof(mm), 0.42, a.len(slot.beat, slot.len) * 0.92);
    });
    stride(a, slots, walk, pno, { from: 12, to: 24, vel: 0.6, rh: true });
    // golden glints climbing into the turnaround
    const glint = new Rng(4242);
    for (let b = goldBeat; b < BARS * BPB; b += 2) {
      if (glint.next() < 0.5) continue;
      const pcs = [...new Set(chordPcs(chordAt(slots, b).chord))];
      glk.note(GLK, a.t(b + 0.5), mtof(pcAtOrAbove(glint.pick(pcs), glint.int(84, 91))), a.v(0.3));
    }

    // the train never stops: brushed shuffle, rail joints on the beat, the third rail humming
    swingKit(a, { brush, kit, cym }, { from: 0, to: 12, chug: 0.95, swish: 0.5, kick: 0.2, foot: 0.25 });
    swingKit(a, { brush, kit, cym }, { from: 12, to: 24, chug: 1.05, swish: 0.35, kick: 0.28, foot: 0.32, ride: 0.62 });
    for (let b = 0; b < BARS * BPB; b++) {
      rail.note(RAIL, a.t(b), b % 2 ? 900 : 980, a.v(b % 4 === 0 ? 0.62 : 0.45));
      if (b % 2 === 1) rail.note(RAIL, a.t(b + 0.5), 860, a.v(0.3));
    }
    for (let k = 0; k < 4; k++) {
      const t0 = (k * period) / 4;
      const L = period / 4 + 0.5;
      hum.shot(`hum-${k}`, L + 0.1, t0 - 0.25, (s, out) => electricHum(s, out, 0, L, 0.9, { f0: 55, fadeIn: 0.25, fadeOut: 0.25, bright: 0.8 }));
    }
    // a far-off minor whistle in the noir chorus, the motif in major in the golden one
    whistleMotif(whistle, 'last-noir', a.t(3 * BPB + 2, false), [hz('D5'), hz('F5'), hz('A5')], 0.4, { short: 0.3, long: 1.1 });
    whistleMotif(whistle, 'last-gold', a.t(21 * BPB + 2, false), [hz('E5'), hz('G5'), hz('C6')], 0.75);
    return m.render(4);
  },
};

