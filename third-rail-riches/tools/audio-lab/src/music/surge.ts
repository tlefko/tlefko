/**
 * "POWER SURGE": a short, tense, electric loop for anticipation moments. D minor pedal, 150 bpm, 8 bars
 * (12.8 s): a creeping pizzicato ostinato, tremolo strings swinging between Dm and Eb/D, then A7b9,
 * growling muted-trumpet stabs on the off-beats, a ticking hi-hat over the brushed shuffle and rail
 * clatter, the third rail humming with arcs crackling every two bars, a clarinet trill at the end.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { hz, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, chordAt, voicings } from './common';
import { BASS, HAT, KICK, MUTE, RAIL, TAP } from './band';
import { strings } from '../instruments/strings';
import { clarinet } from '../instruments/winds';
import { timpani } from '../instruments/drums';
import { arc, electricHum } from '../instruments/train';

const BPM = 150;
const BPB = 4;
const BARS = 8;

const CHART = ['Dm', 'Dm', 'Eb/D', 'Eb/D', 'Dm', 'Dm', 'A7b9', 'A7b9'];

const OSTINATO = `
D2:8 D2:8 D3:8 D2:8 F2:8 D2:8 Ab2:8 G2:8 | D2:8 D2:8 D3:8 D2:8 F2:8 D2:8 Eb2:8 E2:8 |
D2:8 D2:8 D3:8 D2:8 G2:8 D2:8 Bb2:8 A2:8 | D2:8 D2:8 D3:8 D2:8 G2:8 D2:8 Eb2:8 E2:8 |
D2:8 D2:8 D3:8 D2:8 F2:8 D2:8 Ab2:8 G2:8 | D2:8 D2:8 D3:8 D2:8 F2:8 D2:8 Eb2:8 E2:8 |
A1:8 A1:8 A2:8 A1:8 C#2:8 A1:8 Bb1:8 B1:8 | A1:8 A1:8 A2:8 A1:8 C#2:8 E2:8 G2:8 C#2:8 |`;

const STABS = `
r:8 A4:8'!s r:4 r:8 A4:8' r:4 | r:8 A4:8'!s r:4 r:8 Bb4:4!w r:8 | r:8 Bb4:8'!s r:4 r:8 Bb4:8' r:4 | r:8 Bb4:8'!s r:4 r:8 C5:4!w r:8 |
r:8 A4:8'!s r:4 r:8 A4:8' r:4 | r:8 A4:8'!s r:4 r:8 D5:4!w r:8 | r:8 C#5:8'!s r:4 r:8 E5:8' r:4 | r:8 G5:8'!s r:4 r:8 Bb5:4!wf r:8 |`;

const TREM = instrument('trem', (s, out, f, v, d) => strings(s, out, 0, f, d, v, { tremolo: 14, attack: 0.25, release: 0.4, bright: 1.1 }), { len: (_f, d) => d + 0.7, velBuckets: 2, durStep: 0.05 });
const TRILL = instrument('trill', (s, out, f, v, d) => {
  const n = Math.max(2, Math.floor(d / 0.05));
  for (let i = 0; i < n; i++) clarinet(s, s.gain(0.4 + (0.6 * i) / n, out), i * 0.05, i % 2 ? f * 1.0595 : f, 0.045, v);
}, { len: (_f, d) => d + 0.3, velBuckets: 2, durStep: 0.1 });
const TIMP = instrument('timp', (s, out, f, v) => timpani(s, out, 0, f, v, { decay: 1.6 }), { len: 1.8, velBuckets: 3 });

export const SURGE: TrackDef = {
  id: 'surge',
  title: 'Power Surge',
  desc: 'anticipation bed: tense electric loop on a D pedal, 150 bpm, 8 bars: pizzicato ostinato, tremolo strings, growling muted-trumpet stabs, ticking hats, rail clatter and arcing third rail',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.6, drive: 1.35, width: 0.8, air: 0.6 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.58);
    const period = clock.bars(BARS);
    const m = new Mixer(period, 44100, hashString('surge'));
    const a = new Arr(new Rng(61), clock, BARS, 0.004, 0.06);
    const slots = chart(CHART, BPB);
    m.reverb('tunnel', { seconds: 3, rt60: 2, predelay: 0.025, dampStart: 6500, dampEnd: 1800, early: 12, earlySpread: 0.06, lowCut: 130 });

    const bass = m.stem('bass', { gain: 0.22, hp: 38, sends: { tunnel: 0.08 } });
    const trem = m.stem('trem', { gain: 0.8, pan: 0.15, sends: { tunnel: 0.35 } });
    const mute = m.stem('mute', { gain: 1.0, pan: -0.15, sends: { tunnel: 0.3 } });
    const clar = m.stem('clar', { gain: 0.7, pan: -0.3, sends: { tunnel: 0.35 } });
    const brush = m.stem('brush', { gain: 2.4, pan: 0.15, sends: { tunnel: 0.1 } });
    const kit = m.stem('kit', { gain: 0.3, hp: 40, sends: { tunnel: 0.15 } });
    const hats = m.stem('hats', { gain: 1.6, pan: 0.3, sends: { tunnel: 0.08 } });
    const rail = m.stem('rail', { gain: 0.4, hp: 70, sends: { tunnel: 0.15 } });
    const hum = m.stem('hum', { gain: 0.05, hp: 45, lp: 3000 });
    const zz = m.stem('zz', { gain: 0.8, hp: 300, sends: { tunnel: 0.25 } });

    a.play(seq(OSTINATO, { name: 'ostinato', vel: 0.75 }), (t, f, d, v, ev) => bass.note(BASS, t, f, v * (ev.beat % 1 === 0 ? 1 : 0.8), d * 0.85));
    const tv = voicings(slots, 62, 74, 3);
    slots.forEach((slot, i) => {
      for (const mm of tv[i]) trem.note(TREM, a.t(slot.beat, false), mtof(mm), 0.6, a.len(slot.beat, slot.len) * 0.97);
      trem.note(TREM, a.t(slot.beat, false), mtof(tv[i][0] - 12), 0.5, a.len(slot.beat, slot.len) * 0.97);
    });
    a.play(seq(STABS, { name: 'stabs', vel: 0.62 }), (t, f, d, v, ev) => mute.note(MUTE, t, f, v, Math.max(d, 0.12), ev.flags));
    clar.note(TRILL, a.t(6 * BPB, false), hz('C#6'), 0.55, a.len(6 * BPB, 7.6));

    for (let b = 0; b < BARS * BPB; b++) {
      for (let e = 0; e < 2; e++) hats.note(HAT, a.t(b + e * 0.5), 0, a.v(e ? 0.25 : 0.4));
      brush.note(TAP, a.t(b), 0, a.v(b % 2 ? 0.75 : 0.3));
      brush.note(TAP, a.t(b + 0.5), 0, a.v(0.18));
      rail.note(RAIL, a.t(b), b % 2 ? 900 : 1000, a.v(b % 2 ? 0.45 : 0.6));
      kit.note(KICK, a.t(b), 0, a.v(b % 4 === 0 ? 0.55 : 0.32));
    }
    for (let bar = 0; bar < BARS; bar += 2) {
      kit.note(TIMP, a.t(bar * BPB, false), mtof(chordAt(slots, bar * BPB).chord.root + 36), 0.6);
      zz.shot(`arc-${bar}`, 1.1, a.t(bar * BPB + 3, false), (s, out) => arc(s, out, 0, 0.6, 0.55, { f0: 100, f1: 160, sweep: [700, 3500] }));
    }
    for (let k = 0; k < 2; k++) {
      const t0 = (k * period) / 2;
      const L = period / 2 + 0.5;
      hum.shot(`hum-${k}`, L + 0.1, t0 - 0.25, (s, out) => electricHum(s, out, 0, L, 0.9, { f0: 470 / 6.4, fadeIn: 0.25, fadeOut: 0.25, bright: 1.1 }));
    }
    return m.render(3);
  },
};
