/**
 * "MOONLIGHT RAID" (free spins): a spooky nocturnal shanty. D minor, 80 bpm, 16 bars (48 s).
 * Main: a solo cello sings the shanty over low bowed drones, the ghost choir takes the tune on the
 * second half over wordless "oo" pads, glockenspiel and celesta glint like moonlight on the water,
 * slow ship's-bell accents, muffled oar strokes on a frame drum, waves lapping the hull.
 * Stem "tension" (faded in by audio.intensity): tremolo strings, the oars pulling hard, creaking
 * rigging, low brass swells and a ghostly glass whistle.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { bassNote, chordPcs, hz, mtof, pcAtOrAbove } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, chordAt, seaBed, voicings } from './common';
import { celesta, glock, shipBell } from '../instruments/tuned';
import { bowed, choir, strings } from '../instruments/strings';
import { brass, theremin } from '../instruments/winds';
import { frameDrum } from '../instruments/drums';
import { timberGroan } from '../instruments/foley';

const BPM = 80;
const BPB = 4;
const BARS = 16;

const CHART = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A7', 'Dm', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A7', 'Dm'];

const SHANTY = `
D5:2 A4:4 D5:4 | F5:4. E5:8 D5:2 | D5:4 F5:4 Bb5:4. A5:8 | G5:2 E5:2 |
A5:2 F5:4 D5:4 | E5:4. F5:8 D5:2 | Bb4:4 D5:4 G5:4 F5:4 | E5:1 |
D5:2 A4:4 D5:4 | F5:4. G5:8 A5:2 | G5:4 E5:4 C5:4 E5:4 | D5:2. r:4 |
F5:2 D5:4 Bb4:4 | G5:4. F5:8 E5:4 D5:4 | C#5:2 E5:2 | D5:1 |`;

const CELLO = instrument('cello', (s, out, f, v, d) => bowed(s, out, 0, f, d, v, { body: 'cello', attack: 0.16, release: 0.35, vib: 16 }), { len: (_f, d) => d + 0.8, velBuckets: 3, durStep: 0.05 });
const DRONE = instrument('drone', (s, out, f, v, d) => bowed(s, out, 0, f, d, v, { body: 'cello', attack: 1.2, release: 1.2, vib: 6, bright: 0.7 }), { len: (_f, d) => d + 1.8, velBuckets: 2, durStep: 0.1 });
const GHOST = instrument('ghost', (s, out, f, v, d) => choir(s, out, 0, f, d, v, { vowel: 'oo', attack: 0.35, release: 0.9 }), { len: (_f, d) => d + 1.4, velBuckets: 2, durStep: 0.05 });
const PAD = instrument('pad', (s, out, f, v, d) => choir(s, out, 0, f, d, v, { vowel: 'oo', attack: 1.0, release: 1.4 }), { len: (_f, d) => d + 2, velBuckets: 2, durStep: 0.05 });
const GLK = instrument('glk', (s, out, f, v) => glock(s, out, 0, f, v, { decay: 2.2 }), { len: 2.4, velBuckets: 3, rr: 2 });
const CEL = instrument('cel', (s, out, f, v) => celesta(s, out, 0, f, v, { decay: 2 }), { len: 2.2, velBuckets: 3 });
const BELL = instrument('bell', (s, out, f, v, _d, fl) => shipBell(s, out, 0, f, v, { decay: 3.2, bright: 1, double: fl === 'd' ? 0.3 : 0 }), { len: 4.2, velBuckets: 2 });
const OAR = instrument('oar', (s, out, _f, v, _d, fl) => frameDrum(s, out, 0, v, { muted: fl === 'm', tone: fl === 'm' ? 120 : 70, decay: fl === 'm' ? 0.14 : 0.55, click: 0.15 }), { len: 0.7, velBuckets: 4, rr: 2 });
const TREM = instrument('trem', (s, out, f, v, d) => strings(s, out, 0, f, d, v, { tremolo: 13, attack: 0.3, release: 0.5, bright: 1.05 }), { len: (_f, d) => d + 0.9, velBuckets: 2, durStep: 0.05 });
const SWELL = instrument('swell', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { attack: d * 0.8, bright: 0.7, vib: false }), { len: (_f, d) => d + 0.4, velBuckets: 2, durStep: 0.05 });

export const WITCHING: TrackDef = {
  id: 'witching',
  title: 'Moonlight Raid',
  desc: 'free spins: spooky nocturnal shanty, solo cello and ghost choir over drones, moonlit glock, ship\'s bell, D minor, 80 bpm; tension stem via intensity()',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 5,
  master: { crackle: 0.8, drive: 1.25, width: 0.8, air: 0.9 },
  stems: [{ id: 'tension', desc: 'tremolo strings, hard-pulling oars, creaking rigging, low brass swells, a glass whistle' }],
  async render(stem) {
    const clock = new Clock(BPM, BPB, 0.5);
    const period = clock.bars(BARS);
    const m = new Mixer(period, 44100, hashString('witching' + (stem ?? '')));
    const a = new Arr(new Rng(stem ? 23 : 11), clock, BARS, 0.004, 0.06);
    const slots = chart(CHART, BPB);
    m.reverb('night', { seconds: 4.6, rt60: 3.4, predelay: 0.03, dampStart: 6500, dampEnd: 1600, early: 14, earlySpread: 0.08, lowCut: 90 });
    m.reverb('hull', { seconds: 1.4, rt60: 0.8, predelay: 0.008, dampStart: 6000, dampEnd: 2000, early: 8, earlySpread: 0.025, lowCut: 150 });

    if (!stem) {
      const cello = m.stem('cello', { gain: 1.0, pan: -0.12, sends: { night: 0.32 } });
      const ghost = m.stem('ghost', { gain: 0.62, pan: 0.1, sends: { night: 0.6 } });
      const pad = m.stem('pad', { gain: 0.09, sends: { night: 0.6 } });
      const drone = m.stem('drone', { gain: 0.4, lp: 1600, hp: 50, sends: { night: 0.3 } });
      const glk = m.stem('glk', { gain: 0.55, pan: 0.35, wow: true, sends: { night: 0.6 } });
      const cel = m.stem('cel', { gain: 0.6, pan: -0.3, wow: true, sends: { night: 0.55 } });
      const bell = m.stem('bell', { gain: 0.45, pan: -0.2, sends: { night: 0.55 } });
      const oar = m.stem('oar', { gain: 0.45, hp: 50, sends: { hull: 0.3, night: 0.1 } });
      const seaL = m.stem('seaL', { gain: 0.26, pan: -0.6, hp: 110 });
      const seaR = m.stem('seaR', { gain: 0.26, pan: 0.6, hp: 110 });
      m.wow = { rate: 0.25, depth: 0.3 };

      const tune = seq(SHANTY, { name: 'moonlight shanty', vel: 0.72 });
      // first half: the cello sings it an octave down; second half: the ghost choir, cello drops to a counter-line
      a.play(tune.filter((e) => e.beat < 32), (t, f, d, v) => cello.note(CELLO, t, f / 2, v, d * 0.97));
      a.play(tune.filter((e) => e.beat >= 32), (t, f, d, v) => ghost.note(GHOST, t, f, v * 0.9, d * 0.98));
      const counter = seq(`r:1 | r:1 | r:1 | r:1 | r:1 | r:1 | r:1 | r:1 |
        A3:1 | C4:2 F4:2 | E4:2 C4:2 | A3:2 F3:2 | D4:1 | Bb3:2 G3:2 | A3:1 | A3:2 D4:2 |`, { name: 'cello counter', vel: 0.55 });
      a.play(counter, (t, f, d, v) => cello.note(CELLO, t, f, v, d * 0.97));

      // low drones: D and A, re-bowed every two bars with a slow swell
      for (let bar = 0; bar < BARS; bar += 2) {
        const t = a.t(bar * BPB, false);
        const d = a.len(bar * BPB, 2 * BPB) * 0.98;
        drone.note(DRONE, t, hz('D2'), 0.62, d);
        drone.note(DRONE, t, hz('A2'), 0.5, d);
      }
      // ghostly "oo" pads
      const padV = voicings(slots, 57, 69, 3);
      slots.forEach((slot, i) => {
        for (const mm of padV[i]) pad.note(PAD, a.t(slot.beat, false), mtof(mm), 0.5, a.len(slot.beat, slot.len) * 0.98);
      });
      // moonlight on the water: sparse glock / celesta glints on chord tones up high
      const glint = new Rng(313);
      for (let b = 0; b < BARS * BPB; b += 1) {
        if (glint.next() > (b % 4 === 2 ? 0.75 : 0.35)) continue;
        const pcs = [...new Set(chordPcs(chordAt(slots, b).chord))];
        const note = pcAtOrAbove(glint.pick(pcs), glint.int(84, 91));
        const off = glint.pick([0, 0.5, 0.25]);
        (glint.next() < 0.6 ? glk : cel).note(glint.next() < 0.6 ? GLK : CEL, a.t(b + off), mtof(note), a.v(glint.range(0.22, 0.4)));
        if (glint.next() < 0.3) glk.note(GLK, a.t(b + off + 0.25), mtof(note + glint.pick([-3, -4, -5])), a.v(0.2));
      }
      // ship's bell: two bells at the top of each half, single strokes in between
      bell.note(BELL, a.t(0, false), hz('A5'), 0.55, 0, 'd');
      bell.note(BELL, a.t(32, false), hz('A5'), 0.5, 0, 'd');
      bell.note(BELL, a.t(16, false), hz('A5'), 0.3);
      bell.note(BELL, a.t(48, false), hz('A5'), 0.3);
      // muffled oars: deep stroke on 1, a knock on 3
      for (let bar = 0; bar < BARS; bar++) {
        oar.note(OAR, a.t(bar * BPB), 0, a.v(0.5));
        oar.note(OAR, a.t(bar * BPB + 2), 0, a.v(0.3), 0, 'm');
      }
      seaBed(seaL, seaR, period, new Rng(4141), { key: 'witch', waves: 10, creaks: 4, creakVel: 0.4, vel: 0.9, bright: 0.85 });
    } else {
      const trem = m.stem('trem', { gain: 0.5, pan: 0.1, sends: { night: 0.4 } });
      const low = m.stem('low', { gain: 0.52, pan: -0.15, lp: 2500, sends: { night: 0.3 } });
      const row = m.stem('row', { gain: 0.44, hp: 50, sends: { hull: 0.3 } });
      const rig = m.stem('rig', { gain: 1.6, pan: -0.3, sends: { night: 0.3 } });
      const swell = m.stem('swell', { gain: 0.48, sends: { night: 0.4 } });
      const glass = m.stem('glass', { gain: 0.4, pan: 0.3, sends: { night: 0.6 } });

      const hiV = voicings(slots, 69, 81, 3);
      slots.forEach((slot, i) => {
        const d = a.len(slot.beat, slot.len) * 0.98;
        for (const mm of hiV[i]) trem.note(TREM, a.t(slot.beat, false), mtof(mm), 0.55, d);
        low.note(TREM, a.t(slot.beat, false), mtof(bassNote(slot.chord, 38)), 0.6, d);
      });
      // the oars pull hard: 8th-note strokes, heavier on the beat, pushing in the second half
      for (let b = 0; b < BARS * BPB; b++) {
        row.note(OAR, a.t(b, false), 0, a.v(b % 2 ? 0.42 : 0.55));
        row.note(OAR, a.t(b + 0.5, false), 0, a.v(b >= 32 ? 0.3 : 0.2), 0, 'm');
        if (b >= 48) row.note(OAR, a.t(b + 0.75, false), 0, a.v(0.16), 0, 'm');
      }
      // rigging strains
      const cr = new Rng(99);
      for (let k = 0; k < 8; k++) {
        const t = clock.t(k * 8 + cr.range(0.5, 5));
        const dur = cr.range(0.9, 1.6);
        const p = cr.range(0.8, 1.3);
        rig.shot(`rig-${k}`, dur + 0.4, t, (s, out) => timberGroan(s, out, 0, dur, 0.6, { pitch: p }));
      }
      // low brass swells into the half cadences
      for (const bar of [7, 15]) {
        for (const n of ['A2', 'E3', 'G3', 'C#4']) swell.note(SWELL, a.t(bar * BPB, false), hz(n), 0.6, clock.bars(0.9));
      }
      // a ghostly glass whistle drifting over bars 5-8 and 13-16
      for (const bar of [4, 12]) {
        const t0 = clock.t(bar * BPB);
        const t1 = clock.t((bar + 4) * BPB);
        const L = t1 - t0;
        glass.shot(`glass-${bar}`, L + 0.4, t0, (s, out) =>
          theremin(s, out, [
            { t: 0, f: hz('A5'), a: 0 },
            { t: L * 0.25, f: hz('A5'), a: 0.7 },
            { t: L * 0.55, f: hz('Bb5'), a: 0.9 },
            { t: L * 0.8, f: hz('A5'), a: 0.6 },
            { t: L * 0.95, f: hz('G#5'), a: 0.2 },
            { t: L, f: hz('A5'), a: 0 },
          ], 0.7, 0.8),
        );
      }
    }
    return m.render(5);
  },
};
