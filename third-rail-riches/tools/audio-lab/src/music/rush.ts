/**
 * "RUSH HOUR" (free spins): busy, hot jazz at 200 bpm in Bb, 32 bars (38.4 s): a 16-bar riff chorus
 * twice. First time the trumpets play the riff in harmony with the clarinet weaving 8th-note lines
 * over the top and saxes riffing underneath; second time it is a shout: trombones double the riff,
 * the clarinet wails high, crashes on the phrase tops. Stride piano, walking bass, a driving kit
 * (stick backbeat over the brushed "chugga-chugga" shuffle, 4-to-the-floor bass drum, ride), and a
 * rush-hour crowd murmuring and shouting "hey!".
 * Stem "tension" (faded in by audio.intensity): rail clatter in 8ths, hi-hat 16ths, growling trombone
 * and sax stabs on the off-beats, a clarinet trill climbing each 4 bars and an electric crackle.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { chordPcs, hz, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow, voicings } from './common';
import { CLAR, CRASH, HAT, KICK, RAIL, SAX, SNARE, TBN, TPT, noodle, stride, swingKit, walkBass, whistleMotif } from './band';
import { crewHey } from '../instruments/fx';
import { crowdMurmur } from '../instruments/voices';
import { arc } from '../instruments/train';
import { clarinet } from '../instruments/winds';

const BPM = 200;
const BPB = 4;
const BARS = 32;

const CHART_16 = ['Bb6', 'Bb6', 'Eb7', 'Eb7', 'Bb6', 'G7', 'C7', 'F7', 'Bb6', 'Bb6', 'Eb7', 'Edim7', 'Bb6/F', 'G7', 'C7 F7', 'Bb6 F7'];
const CHART = [...CHART_16, ...CHART_16];

const RIFF = `
D5:8 F5:8 G5:8 F5:8' r:8 D5:8 F5:4 | G5:8 F5:8 D5:8 Bb4:8 C5:4 D5:4 | Db5:8 Eb5:8 G5:8 Bb5:8' r:8 G5:8 Bb5:4 | C6:8 Bb5:8 G5:8 Eb5:8 Db5:4 r:4 |
D5:8 F5:8 G5:8 F5:8' r:8 D5:8 F5:4 | G5:8 B5:8 D6:8 B5:8 G5:4 F5:4 | E5:8 G5:8 Bb5:8 C6:8 D6:4 C6:4 | A5:8 G5:8 F5:8 Eb5:8 C5:4 r:4 |
D5:8 F5:8 G5:8 F5:8' r:8 D5:8 F5:4 | G5:8 F5:8 D5:8 F5:8 Bb5:4 C6:4 | Db6:4. Bb5:8 G5:4 Eb5:4 | E5:8 G5:8 Bb5:8 Db6:8 E6:4> r:4 |
D6:4. Bb5:8 F5:4 D5:4 | B5:8 A5:8 G5:8 F5:8 D5:4 B4:4 | C5:8 E5:8 G5:8 C6:8 A5:8 F5:8 Eb5:8 C5:8 | Bb4:4 r:4 r:8 F5:8 A5:8 C6:8 |`;

// a measured clarinet trill (a whole step) with a crescendo
const TRILL = instrument('trill', (s, out, f, v, d) => {
  const n = Math.max(2, Math.floor(d / 0.055));
  for (let i = 0; i < n; i++) clarinet(s, s.gain(0.45 + (0.55 * i) / n, out), i * 0.055, i % 2 ? f * 1.1225 : f, 0.05, v);
}, { len: (_f, d) => d + 0.3, velBuckets: 2, durStep: 0.1 });

export const RUSH: TrackDef = {
  id: 'rush',
  title: 'Rush Hour',
  desc: 'Rush Hour free spins: busy hot jazz in Bb at 200 bpm, riff chorus then a brass shout, crowd energy; tension stem via intensity()',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.6, drive: 1.4, width: 0.8, air: 0.6 },
  stems: [{ id: 'tension', desc: 'rail clatter, hi-hat 16ths, growling off-beat brass and sax stabs, a climbing clarinet trill, electric crackle' }],
  async render(stem) {
    const clock = new Clock(BPM, BPB, 0.6);
    const period = clock.bars(BARS);
    const m = new Mixer(period, 44100, hashString('rush' + (stem ?? '')));
    const a = new Arr(new Rng(stem ? 29 : 13), clock, BARS, 0.004, 0.07);
    const slots = chart(CHART, BPB);
    m.reverb('hall', { seconds: 2.4, rt60: 1.5, predelay: 0.02, dampStart: 8000, dampEnd: 2400, early: 12, earlySpread: 0.05, lowCut: 150 });

    if (!stem) {
      const tpt = m.stem('tpt', { gain: 1.1, pan: 0.12, sends: { hall: 0.22 } });
      const tpt2 = m.stem('tpt2', { gain: 0.6, pan: -0.1, sends: { hall: 0.22 } });
      const tbn = m.stem('tbn', { gain: 0.62, pan: -0.28, sends: { hall: 0.2 } });
      const clar = m.stem('clar', { gain: 0.5, pan: -0.35, wow: true, sends: { hall: 0.25 } });
      const saxes = m.stem('sax', { gain: 0.55, pan: 0.32, lp: 4200, sends: { hall: 0.2 } });
      const pno = m.stem('piano', { gain: 0.8, pan: -0.18, sends: { hall: 0.18 } });
      const bass = m.stem('bass', { gain: 0.24, hp: 40, sends: { hall: 0.05 } });
      const brush = m.stem('brush', { gain: 2.6, pan: 0.15, sends: { hall: 0.1 } });
      const kit = m.stem('kit', { gain: 0.48, hp: 40, sends: { hall: 0.12 } });
      const cym = m.stem('cym', { gain: 1.2, pan: 0.3, sends: { hall: 0.15 } });
      const crowd = m.stem('crowd', { gain: 0.4, hp: 180, lp: 5000, sends: { hall: 0.35 } });
      const whistle = m.stem('whistle', { gain: 0.9, pan: 0.4, hp: 250, sends: { hall: 0.4 } });

      const riff = seq(RIFF, { name: 'rush riff', vel: 0.78 });
      for (const pass of [0, 1]) {
        const off = pass * 16 * BPB;
        a.play(riff, (t, f, d, v, ev, mm) => {
          tpt.note(TPT, t, f, v, d * 0.88);
          const pcs = chordPcs(chordAt(slots, ev.beat + off).chord);
          tpt2.note(TPT, t, mtof(harmonyBelow(mm, pcs)), v * 0.85, d * 0.88);
          if (pass) tbn.note(TBN, t, f / 2, v * 0.95, d * 0.88);
        }, { offset: off, velScale: pass ? 1.1 : 1 });
      }
      // pass 1: trombone "doo-wah" pads; pass 2 the trombones double the riff
      const tbV = voicings(slots, 50, 62, 3);
      slots.forEach((slot, i) => {
        if (slot.beat >= 16 * BPB) return;
        for (const mm of tbV[i]) tbn.note(TBN, a.t(slot.beat + 1, false), mtof(mm), 0.45, a.len(slot.beat + 1, Math.min(slot.len - 1.2, 2.6)));
      });
      // clarinet: 8th-note lines over pass 1, high wails and shakes over the shout
      noodle(a, slots, 0, 16 * BPB - 1, new Rng(515), (t, f, d, v) => clar.note(CLAR, t, f, v * 0.75, d), { lo: 74, hi: 91, density: 0.62, vel: 0.65 });
      const wail = seq(`r:1 | Bb5:2.!s r:4 | r:1 | Db6:2.!s r:4 | r:1 | D6:1!s | E6:1!s | Eb6:2!s r:2 |
        r:1 | F6:2.!s r:4 | r:1 | E6:1!s | F6:1!s | G6:1!s | G6:2 F6:2 | F6:2!s r:2 |`, { name: 'wail', vel: 0.7 });
      a.play(wail, (t, f, d, v, ev) => clar.note(CLAR, t, f, v, d * 0.95, ev.flags || 'b'), { offset: 16 * BPB });
      // saxes: an off-beat riff on chord tones under pass 1, sustained 3rds/7ths under the shout
      slots.forEach((slot) => {
        const pcs = chordPcs(slot.chord);
        const tones = [pcs[1], pcs[3] ?? pcs[2]].map((pc) => 58 + ((pc - 58 + 120) % 12));
        if (slot.beat < 16 * BPB) {
          for (const off of [1.5, 3]) if (off < slot.len) for (const mm of tones) saxes.note(SAX, a.t(slot.beat + off), mtof(mm), a.v(0.55), a.len(slot.beat + off, 0.4));
        } else for (const mm of tones) saxes.note(SAX, a.t(slot.beat, false), mtof(mm), 0.5, a.len(slot.beat, slot.len) * 0.92);
      });

      const walk = walkBass(a, slots, bass, { lo: 34, hi: 50, vel: 0.85 });
      stride(a, slots, walk, pno, { vel: 0.6, rh: true });
      swingKit(a, { brush, kit, cym }, { chug: 1.0, kick: 0.32, foot: 0.4, ride: 0.6 });
      for (let bar = 0; bar < BARS; bar++) {
        const b0 = bar * BPB;
        for (const q of [1, 3]) kit.note(SNARE, a.t(b0 + q), 0, a.v(bar >= 16 ? 0.55 : 0.4));
        // drummer's "bombs" and fills at the phrase ends
        if (bar % 4 === 3) [2.5, 3, 3.5].forEach((b, k) => kit.note(SNARE, a.t(b0 + b), 0, a.v(0.3 + k * 0.12), 0, 'r'));
        if (bar % 8 === 0) cym.note(CRASH, a.t(b0, false), 0, bar % 16 === 0 ? 0.55 : 0.4, 0, bar % 16 === 0 ? '' : 's');
      }
      // the crowd: a steady rush-hour murmur, "hey!"s on the phrase tops of the shout, a whistle
      for (let k = 0; k < 4; k++) {
        const t0 = (k * period) / 4;
        const dur = period / 4 + 0.6;
        crowd.shot(`murmur-${k}`, dur + 0.2, t0 - 0.3, (s, out) => crowdMurmur(s, out, 0, dur, 0.9, { talkers: 7, excite: k >= 2 ? 1.25 : 1 }));
      }
      for (const bar of [16, 24]) crowd.shot(`hey-${bar}`, 0.8, a.t(bar * BPB - 0.5, false), (s, out) => crewHey(s, out, 0, 0.9, { voices: 6, pitch: 1.05 }));
      crowd.shot('hey-top', 0.8, a.t(0 - 0.5, false), (s, out) => crewHey(s, out, 0, 0.75, { voices: 5 }));
      whistleMotif(whistle, 'rush', a.t(14 * BPB + 2, false), [hz('Eb5'), hz('G5'), hz('Bb5')], 0.55, { short: 0.18, long: 0.45, gap: 0.07 });
    } else {
      const rail = m.stem('rail', { gain: 0.5, hp: 60, sends: { hall: 0.06 } });
      const hats = m.stem('hats', { gain: 1.6, pan: 0.25, sends: { hall: 0.08 } });
      const stab = m.stem('stab', { gain: 0.55, pan: -0.2, sends: { hall: 0.2 } });
      const trill = m.stem('trill', { gain: 0.7, pan: -0.35, sends: { hall: 0.3 } });
      const zz = m.stem('zz', { gain: 1.0, pan: 0.1, hp: 300, sends: { hall: 0.2 } });
      const kick = m.stem('kick', { gain: 0.35, hp: 40 });

      for (let b = 0; b < BARS * BPB; b++) {
        // rail clatter: 8ths, the pair accent like wheels over a joint
        rail.note(RAIL, a.t(b), b % 2 ? 960 : 1040, a.v(b % 2 ? 0.55 : 0.75));
        rail.note(RAIL, a.t(b + 0.5), 900, a.v(0.4));
        for (let e = 0; e < 4; e++) hats.note(HAT, a.straight(b + e * 0.25), 0, a.v(e === 0 ? 0.42 : e === 2 ? 0.32 : 0.2));
        kick.note(KICK, a.t(b), 0, a.v(0.5));
      }
      const stV = voicings(slots, 52, 64, 3);
      slots.forEach((slot, i) => {
        for (let off = 0.5; off < slot.len; off += 2) for (const mm of stV[i]) {
          stab.note(TBN, a.t(slot.beat + off), mtof(mm), a.v(0.6), a.len(slot.beat + off, 0.28));
          stab.note(SAX, a.t(slot.beat + off), mtof(mm + 12), a.v(0.5), a.len(slot.beat + off, 0.28), 'g');
        }
      });
      // a clarinet trill that climbs through each 4-bar phrase
      for (let ph = 0; ph < BARS / 4; ph++) {
        const pcs = chordPcs(chordAt(slots, ph * 4 * BPB).chord);
        const base = 79 + ((pcs[0] - 79 + 120) % 12);
        trill.note(TRILL, a.t(ph * 4 * BPB + 8, false), mtof(base + (ph % 2) * 2), 0.6, a.len(ph * 4 * BPB + 8, 7.5));
      }
      for (let k = 0; k < 8; k++) {
        const t0 = a.t(k * 4 * BPB + 2, false);
        zz.shot(`arc-${k}`, 1.2, t0, (s, out) => arc(s, out, 0, 0.8, 0.5, { f0: 90, f1: 140, sweep: [900, 4000] }));
      }
    }
    return m.render(3);
  },
};
