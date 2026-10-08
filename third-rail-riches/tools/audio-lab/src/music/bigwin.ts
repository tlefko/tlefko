/**
 * "FULL STEAM SHOUT": the big-win loop. A big-band shout chorus on a 12-bar Bb blues, 180 bpm (16 s):
 * screaming lead trumpet with a second trumpet in harmony, trombones and saxes punching the
 * off-beats and doubling the riff, stride piano, walking bass, a hard-swinging kit (ride, backbeat,
 * kicks on the "bombs", crash on the tops), glockenspiel sparkle and a whistle "woo-woo" into the
 * turnaround; a snare pickup across the loop seam.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { chordPcs, hz, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow, voicings } from './common';
import { CRASH, GLK, KICK, SAX, SNARE, TBN, TPT, stride, swingKit, walkBass, whistleMotif } from './band';

const BPM = 180;
const BPB = 4;
const BARS = 12;

const CHART = ['Bb7', 'Eb7', 'Bb7', 'Bb7', 'Eb7', 'Edim7', 'Bb7/F', 'G7', 'Cm7', 'F7', 'Bb7 G7', 'Cm7 F7'];

const SHOUT = `
F5:8 Bb5:8 D6:8 F6:8' r:8 D6:8 F6:4> | G6:4. F6:8 Db6:4 Bb5:4 | F5:8 Bb5:8 D6:8 F6:8' r:8 D6:8 Ab6:4> | F6:8 D6:8 Bb5:8 Ab5:8 F5:2 |
G5:8 Bb5:8 Db6:8 Eb6:8' r:8 Db6:8 G6:4> | E6:4. Db6:8 Bb5:4 G5:4 | F6:2. D6:8 F6:8 | G6:4> F6:8 D6:8 B5:4 G5:4 |
Eb6:8 D6:8 C6:8 Bb5:8 G5:4 Eb6:4 | Eb6:8 C6:8 A5:8 F5:8 Eb6:4. D6:8 | D6:4> Bb5:4 B5:4 D6:4 | C6:8 Eb6:8 G6:8 F6:8 Eb6:8 C6:8 A5:8 F5:8 |`;

export const BIGWIN: TrackDef = {
  id: 'bigwin',
  title: 'Full Steam Shout',
  desc: 'big-win loop: big-band shout chorus on a 12-bar Bb blues, 180 bpm, screaming trumpets, punching trombones and saxes, hard-swinging kit',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.5, drive: 1.5, width: 0.8, air: 0.7 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.6);
    const m = new Mixer(clock.bars(BARS), 44100, hashString('bigwin'));
    const a = new Arr(new Rng(41), clock, BARS, 0.004, 0.06);
    const slots = chart(CHART, BPB);
    m.reverb('hall', { seconds: 2.8, rt60: 1.9, predelay: 0.02, dampStart: 8000, dampEnd: 2400, early: 12, earlySpread: 0.05, lowCut: 140 });

    const tpt = m.stem('tpt', { gain: 0.9, pan: 0.1, sends: { hall: 0.25 } });
    const tpt2 = m.stem('tpt2', { gain: 0.62, pan: -0.15, sends: { hall: 0.25 } });
    const tbn = m.stem('tbn', { gain: 0.66, pan: -0.28, sends: { hall: 0.2 } });
    const saxes = m.stem('sax', { gain: 0.45, pan: 0.32, lp: 4200, sends: { hall: 0.2 } });
    const pno = m.stem('piano', { gain: 0.75, pan: -0.15, sends: { hall: 0.18 } });
    const bass = m.stem('bass', { gain: 0.24, hp: 40, sends: { hall: 0.05 } });
    const brush = m.stem('brush', { gain: 2.2, pan: 0.15, sends: { hall: 0.1 } });
    const kit = m.stem('kit', { gain: 0.5, hp: 40, sends: { hall: 0.12 } });
    const cym = m.stem('cym', { gain: 1.25, pan: 0.3, sends: { hall: 0.15 } });
    const glk = m.stem('glk', { gain: 0.42, pan: 0.35, sends: { hall: 0.3 } });
    const whistle = m.stem('whistle', { gain: 0.42, pan: -0.4, hp: 250, sends: { hall: 0.4 } });

    const mel = seq(SHOUT, { name: 'shout', vel: 0.86 });
    a.play(mel, (t, f, d, v, ev, mm) => {
      tpt.note(TPT, t, f, v, d * 0.88);
      const pcs = chordPcs(chordAt(slots, ev.beat).chord);
      tpt2.note(TPT, t, mtof(harmonyBelow(mm, pcs)), v * 0.85, d * 0.88);
      saxes.note(SAX, t, f / 2, v * 0.75, d * 0.88);
      if (ev.accent || ev.dur >= 1.5) glk.note(GLK, t, f, v * 0.45);
    });
    // trombones: punches on the and-of-2 and on 4, voiced close under the trumpets
    const tbV = voicings(slots, 50, 63, 3);
    for (let b = 0; b < BARS * BPB; b++) {
      const i = slots.indexOf(chordAt(slots, b));
      if (b % 4 === 1) for (const mm of tbV[i]) tbn.note(TBN, a.t(b + 0.5), mtof(mm), a.v(0.7), a.len(b + 0.5, 0.35));
      if (b % 4 === 3) for (const mm of tbV[i]) tbn.note(TBN, a.t(b), mtof(mm), a.v(0.78), a.len(b, 0.5));
    }

    const walk = walkBass(a, slots, bass, { lo: 34, hi: 50, vel: 0.9 });
    stride(a, slots, walk, pno, { vel: 0.62, rh: true });
    swingKit(a, { brush, kit, cym }, { chug: 0.9, kick: 0.35, foot: 0.4, ride: 0.75 });
    for (let bar = 0; bar < BARS; bar++) {
      const b0 = bar * BPB;
      for (const q of [1, 3]) kit.note(SNARE, a.t(b0 + q), 0, a.v(0.58));
      // "bombs": kick + snare under the riff accents
      if (bar % 2 === 0) {
        kit.note(KICK, a.t(b0 + 2.5), 0, a.v(0.75));
        kit.note(SNARE, a.t(b0 + 2.5), 0, a.v(0.5));
      }
      if (bar % 4 === 0) cym.note(CRASH, a.t(b0, false), 0, bar === 0 ? 0.62 : 0.45, 0, bar === 0 ? '' : 's');
    }
    // snare pickup across the seam into the top
    for (let k = 0; k < 8; k++) kit.note(SNARE, a.straight(BARS * BPB - 2 + k * 0.25), 0, 0.3 + k * 0.06, 0, 'r');
    whistleMotif(whistle, 'shout', a.t(9 * BPB + 2, false), [hz('Eb5'), hz('G5'), hz('Bb5')], 0.6, { short: 0.16, long: 0.42, gap: 0.06 });
    return m.render(3);
  },
};
