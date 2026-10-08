/**
 * BASE GAME: "The Midnight Local". An easy, toe-tapping hot-swing tune in F major, 144 bpm, 32 bars
 * (AABA, 53.3 s). Muted trumpet sings the A sections (the clarinet harmonises the second A and
 * weaves an obbligato through the last), the clarinet takes the bridge over "doo-wah" muted-trumpet
 * backgrounds and the train-whistle motif. Stride piano, walking upright bass (two-feel in the first
 * A), brushes playing the "chugga-chugga" train shuffle with accents on 2 and 4, a ride in the second
 * half, warm sax pads, and distant trains rumbling through the tunnel.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { chordPcs, hz, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow } from './common';
import { CLAR, MUTE, PIANO, SAX, noodle, stride, swingKit, tunnelBed, walkBass, whistleMotif } from './band';

const BPM = 144;
const BPB = 4;
const BARS = 32;

const A1 = ['F6 D7', 'Gm7 C7', 'F6 D7', 'Gm7 C7', 'F6 F7', 'Bb6 Bdim7', 'F6/C D7', 'Gm7 C7'];
const A2 = ['F6 D7', 'Gm7 C7', 'F6 D7', 'Gm7 C7', 'F6 F7', 'Bb6 Bdim7', 'Gm7 C7', 'F6'];
const BR = ['A7', 'A7', 'D7', 'D7', 'G7', 'G7', 'C7', 'C7'];
const CHART = [...A1, ...A2, ...BR, ...A1];

const A_HEAD = `
r:8 C5:8 D5:8 F5:8 A5:4 F5:4 | G5:8 F5:8 D5:8 F5:8' r:8 E5:8 r:4 | r:8 C5:8 D5:8 F5:8 A5:4 C6:4 | Bb5:8 A5:8 G5:8 E5:8 C5:2!w |
A5:4. F5:8 Eb5:4!b C5:4 | D5:8 F5:8 Bb5:8 D6:8 B5:4 Ab5:4 |`;
const A1_END = `A5:8 F5:8 C5:8 A4:8 F#5:4 D5:4 | G5:8 F5:8 E5:8 D5:8 C5:4 r:4 |`;
const A2_END = `G5:8 A5:8 Bb5:8 C6:8 E5:4 G5:4 | F5:2.!w r:4 |`;
const BRIDGE = `
E5:4 C#5:8 E5:8 A5:4.!s G5:8 | r:8 A5:8 G5:8 E5:8 C#5:4 A4:4 | F#5:4 D5:8 F#5:8 A5:4.!s C6:8 | r:8 C6:8 A5:8 F#5:8 D5:4 C5:4 |
B4:8 D5:8 F5:8 G5:8 B5:4 G5:4 | A5:8 G5:8 F5:8 D5:8 B4:4 r:4 | C5:8 E5:8 G5:8 Bb5:8 C6:2!s | r:1 |`;
// muted-trumpet "doo-wah" backgrounds in the bridge (guide tones, wah on each)
const BACKS = `
r:4 C#5:2.!w | r:4 C#5:2.!w | r:4 C5:2.!w | r:4 C5:2.!w | r:4 B4:2.!w | r:4 B4:2.!w | r:4 Bb4:2.!w | r:1 |`;
// right-hand piano pickups into the A sections
const FILL = `r:2 G5:8 A5:8 Bb5:8 B5:8 |`;

export const BASE: TrackDef = {
  id: 'base',
  title: 'The Midnight Local',
  desc: 'base game: toe-tapping hot swing in F, 144 bpm, AABA: muted trumpet and clarinet, stride piano, walking bass, brushed train shuffle, the whistle motif',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.7, drive: 1.3, width: 0.75, air: 0.3 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.63);
    const m = new Mixer(clock.bars(BARS), 44100, hashString('base'));
    const a = new Arr(new Rng(7), clock, BARS, 0.005, 0.07);
    const slots = chart(CHART, BPB);
    m.reverb('club', { seconds: 2.2, rt60: 1.3, predelay: 0.018, dampStart: 7500, dampEnd: 2200, early: 12, earlySpread: 0.045, lowCut: 160 });
    m.wow = { rate: 0.3, depth: 0.12 };

    const mute = m.stem('mute', { gain: 1.0, pan: 0.1, wow: true, sends: { club: 0.24 } });
    const clar = m.stem('clar', { gain: 0.95, pan: -0.25, wow: true, sends: { club: 0.28 } });
    const saxes = m.stem('sax', { gain: 0.42, pan: 0.3, lp: 3800, wow: true, sends: { club: 0.25 } });
    const pno = m.stem('piano', { gain: 0.95, pan: -0.12, sends: { club: 0.2 } });
    const bass = m.stem('bass', { gain: 0.3, hp: 40, sends: { club: 0.06 } });
    const brush = m.stem('brush', { gain: 4.5, pan: 0.18, sends: { club: 0.12 } });
    const kit = m.stem('kit', { gain: 0.42, hp: 45, sends: { club: 0.1 } });
    const cym = m.stem('cym', { gain: 1.8, pan: 0.35, sends: { club: 0.12 } });
    const whistle = m.stem('whistle', { gain: 0.5, pan: -0.35, hp: 250, sends: { club: 0.45 } });
    const tunL = m.stem('tunL', { gain: 0.42, pan: -0.6, hp: 40 });
    const tunR = m.stem('tunR', { gain: 0.42, pan: 0.6, hp: 40 });

    // the head: A1, A2, (bridge), A3 on muted trumpet
    const a1 = seq(`${A_HEAD} ${A1_END}`, { name: 'A1', vel: 0.7 });
    const a2 = seq(`${A_HEAD} ${A2_END}`, { name: 'A2', vel: 0.74 });
    a.play(a1, (t, f, d, v) => mute.note(MUTE, t, f, v, d * 0.92));
    a.play(a2, (t, f, d, v) => mute.note(MUTE, t, f, v, d * 0.92), { offset: 8 * BPB });
    a.play(a1, (t, f, d, v) => mute.note(MUTE, t, f, v, d * 0.92), { offset: 24 * BPB, velScale: 1.06 });
    // A2: the clarinet harmonises in thirds and sixths below
    a.play(a2, (t, f, d, v, ev, mm) => {
      const pcs = chordPcs(chordAt(slots, ev.beat + 8 * BPB).chord);
      clar.note(CLAR, t, mtof(harmonyBelow(mm, pcs)), v * 0.6, d * 0.9);
    }, { offset: 8 * BPB });
    // bridge: clarinet lead over muted-trumpet backgrounds
    a.play(seq(BRIDGE, { name: 'bridge', vel: 0.74 }), (t, f, d, v) => clar.note(CLAR, t, f, v, d * 0.93), { offset: 16 * BPB });
    a.play(seq(BACKS, { name: 'backs', vel: 0.42 }), (t, f, d, v, ev) => mute.note(MUTE, t, f, v, d * 0.9, ev.flags), { offset: 16 * BPB });
    // A3: a soft clarinet obbligato up high, in the gaps of the tune
    noodle(a, slots, 24 * BPB + 2, 32 * BPB - 2, new Rng(919), (t, f, d, v) => clar.note(CLAR, t, f, v * 0.5, d), { lo: 77, hi: 89, density: 0.42, vel: 0.55 });
    // sax pads (3rd and 7th of each chord) from A2 on
    slots.forEach((slot) => {
      if (slot.beat < 8 * BPB) return;
      const pcs = chordPcs(slot.chord);
      const tones = [pcs[1], pcs[3] ?? pcs[2]].map((pc) => 58 + ((pc - 58 + 120) % 12));
      for (const mm of tones) saxes.note(SAX, a.t(slot.beat, false), mtof(mm), 0.4, a.len(slot.beat, slot.len) * 0.94);
    });

    // rhythm section
    const walk = walkBass(a, slots, bass, { lo: 29, hi: 48, vel: 0.8, two: (bar) => bar < 8 });
    stride(a, slots, walk, pno, { from: 0, to: 8, vel: 0.5 });
    stride(a, slots, walk, pno, { from: 8, to: 32, vel: 0.58, rh: true });
    const fill = seq(FILL, { name: 'fill', vel: 0.5 });
    for (const bar of [7, 31]) a.play(fill, (t, f, d, v) => pno.note(PIANO, t, f, v, d * 0.9, 'b'), { offset: bar * BPB });

    swingKit(a, { brush, kit, cym }, { from: 0, to: 8, chug: 0.85, swish: 0.7, kick: 0.22, foot: 0.3 });
    swingKit(a, { brush, kit, cym }, { from: 8, to: 16, chug: 0.95, swish: 0.6, kick: 0.25, foot: 0.32 });
    swingKit(a, { brush, kit, cym }, { from: 16, to: 24, chug: 1.05, swish: 0.4, kick: 0.28, foot: 0.32, ride: 0.55 });
    swingKit(a, { brush, kit, cym }, { from: 24, to: 32, chug: 0.95, swish: 0.4, kick: 0.26, foot: 0.32, ride: 0.6 });

    // the train-whistle motif: at the end of the bridge, and a distant answer at the turnaround
    whistleMotif(whistle, 'base-bridge', a.t(23 * BPB, false), [hz('E5'), hz('G5'), hz('Bb5')], 0.8);
    whistleMotif(whistle, 'base-turn', a.t(31 * BPB + 2, false), [hz('E5'), hz('G5'), hz('Bb5')], 0.38, { short: 0.22, long: 0.55 });

    tunnelBed(tunL, tunR, a.period, new Rng(77), { key: 'base', passes: 3, vel: 0.8 });
    return m.render(3);
  },
};
