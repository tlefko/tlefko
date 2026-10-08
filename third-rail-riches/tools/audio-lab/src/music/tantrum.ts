/**
 * "LIGHT THE FUSE": the hot one. A fast hornpipe in G minor, 150 bpm, 4/4, 32 bars (51.2 s) in
 * the dance form AA'BB' (each strain ends on the hornpipe's three stamped crotchets).
 * Fiddle lead with 16th-note runs on the repeat, concertina doubling and harmonising, stabbing
 * brass, oom-pah tuba and accordion, a driving snare with rolls, tambourine and crashes.
 */
import type { TrackDef } from '../types';
import { Clock, seq } from '../core/score';
import { bassNote, chordPcs, mtof } from '../core/notes';
import { Rng, hashString } from '../core/rng';
import { Mixer, instrument } from '../core/mixer';
import { Arr, chart, chordAt, harmonyBelow, voicings } from './common';
import { fiddle } from '../instruments/strings';
import { accordion, brass, concertina, tuba } from '../instruments/winds';
import { crash, kick, snare, tambourine } from '../instruments/drums';

const BPM = 150;
const BPB = 4;
const BARS = 32;

const A = ['Gm', 'Gm', 'Cm', 'D7', 'Gm', 'Eb', 'Cm D7', 'Gm'];
const B = ['Bb', 'F7', 'Gm', 'D', 'Eb', 'Bb', 'Cm D7', 'Gm'];
const CHART = [...A, ...A, ...B, ...B];

const STRAIN_A = `
G4:8 Bb4:8 D5:8 G5:8 F#5:8 G5:8 A5:8 G5:8 | Bb5:8 G5:8 D5:8 Bb4:8 A4:8 Bb4:8 C5:8 D5:8 |
Eb5:8 C5:8 G4:8 C5:8 Eb5:8 G5:8 C6:8 Bb5:8 | A5:8 F#5:8 D5:8 F#5:8 A5:8 C6:8 Bb5:8 A5:8 |
G5:8 D5:8 Bb4:8 D5:8 G5:8 Bb5:8 D6:8 Bb5:8 | C6:8 Bb5:8 G5:8 Eb5:8 Bb4:8 Eb5:8 G5:8 Bb5:8 |
C6:8 Eb6:8 D6:8 C6:8 Bb5:8 A5:8 G5:8 F#5:8 | G5:4 D5:4 G4:4 r:4 |`;
// the repeat: same strain with fiddle runs in bars 4 and 7
const STRAIN_A2 = `
G4:8 Bb4:8 D5:8 G5:8 F#5:8 G5:8 A5:8 G5:8 | Bb5:8 G5:8 D5:8 Bb4:8 A4:8 Bb4:8 C5:8 D5:8 |
Eb5:8 C5:8 G4:8 C5:8 Eb5:8 G5:8 C6:8 Bb5:8 | A5:16 Bb5:16 A5:16 G5:16 F#5:8 D5:8 A5:8 C6:8 Bb5:8 A5:8 |
G5:8 D5:8 Bb4:8 D5:8 G5:8 Bb5:8 D6:8 Bb5:8 | C6:8 Bb5:8 G5:8 Eb5:8 Bb4:8 Eb5:8 G5:8 Bb5:8 |
C6:16 D6:16 Eb6:16 D6:16 C6:8 Bb5:8 A5:16 Bb5:16 A5:16 G5:16 F#5:8 D5:8 | G5:4 D5:4 G4:4 r:4 |`;
const STRAIN_B = `
F5:8 Bb5:8 D6:8 Bb5:8 F5:8 D5:8 Bb4:8 D5:8 | C5:8 F5:8 A5:8 F5:8 C6:8 A5:8 F5:8 Eb5:8 |
D5:8 G5:8 Bb5:8 G5:8 D6:8 Bb5:8 G5:8 Bb5:8 | A5:4 F#5:4 D5:4 r:4 |
G5:8 Bb5:8 Eb6:8 Bb5:8 G5:8 Eb5:8 Bb4:8 Eb5:8 | F5:8 Bb5:8 D6:8 F6:8 D6:8 Bb5:8 F5:8 D5:8 |
Eb5:8 G5:8 C6:8 Eb6:8 D6:8 C6:8 Bb5:8 A5:8 | G5:4 Bb5:4 G5:4 r:4 |`;
const STRAIN_B2 = `
F5:8 Bb5:8 D6:8 Bb5:8 F5:8 D5:8 Bb4:8 D5:8 | C5:8 F5:8 A5:8 F5:8 C6:8 A5:8 F5:8 Eb5:8 |
D5:8 G5:8 Bb5:8 G5:8 D6:8 Bb5:8 G5:8 Bb5:8 | A5:4 F#5:4 D5:16 E5:16 F#5:16 G5:16 A5:16 Bb5:16 C6:16 D6:16 |
G5:8 Bb5:8 Eb6:8 Bb5:8 G5:8 Eb5:8 Bb4:8 Eb5:8 | F5:8 Bb5:8 D6:8 F6:8 D6:8 Bb5:8 F5:8 D5:8 |
Eb5:8 G5:8 C6:8 Eb6:8 D6:16 Eb6:16 D6:16 C6:16 Bb5:8 A5:8 | G5:4 Bb5:4 G5:4 r:4 |`;
// trumpet fill in the gap of the B strain's half cadence
const FILL = `r:1 | r:1 | r:1 | r:2. D5:16 F#5:16 A5:16 C6:16 |`;

const FID = instrument('fid', (s, out, f, v, d, fl) => fiddle(s, out, 0, f, d, v, fl), { len: (_f, d) => d + 0.35, velBuckets: 4, durStep: 0.02, rr: 3 });
const CONC = instrument('conc', (s, out, f, v, d) => concertina(s, out, 0, f, d, v, { attack: 0.012 }), { len: (_f, d) => d + 0.25, velBuckets: 4, durStep: 0.02, rr: 2 });
const ACC = instrument('acc', (s, out, f, v, d) => accordion(s, out, 0, f, d, v, { breath: 0.5, bright: 0.8, attack: 0.012 }), { len: (_f, d) => d + 0.2, velBuckets: 3, durStep: 0.02 });
const TPT = instrument('tpt', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { bright: 1.2, attack: 0.02 }), { len: (_f, d) => d + 0.3, velBuckets: 4, durStep: 0.02 });
const TBN = instrument('tbn', (s, out, f, v, d) => brass(s, out, 0, f, d, v, { bright: 0.85, vib: false, attack: 0.02 }), { len: (_f, d) => d + 0.3, velBuckets: 3, durStep: 0.02 });
const TUBA = instrument('tuba', (s, out, f, v, d) => tuba(s, out, 0, f, d, v), { len: (_f, d) => d + 0.3, velBuckets: 3, durStep: 0.02, rr: 2 });
const SN = instrument('sn', (s, out, _f, v, _d, fl) => snare(s, out, 0, v, { decay: fl === 'g' ? 0.08 : 0.15 }), { len: 0.3, velBuckets: 6, rr: 3 });
const BD = instrument('bd', (s, out, _f, v) => kick(s, out, 0, v, { tone: 54, decay: 0.3 }), { len: 0.45, velBuckets: 3, rr: 2 });
const TAMB = instrument('tamb', (s, out, _f, v) => tambourine(s, out, 0, v, { decay: 0.16 }), { len: 0.3, velBuckets: 3, rr: 3 });
const CRASH = instrument('crash', (s, out, _f, v) => crash(s, out, 0, v, { decay: 2.0 }), { len: 2.4, velBuckets: 2 });

export const TANTRUM: TrackDef = {
  id: 'tantrum',
  title: 'Light the Fuse',
  desc: 'fuse/wheel moments: hot G minor hornpipe, fiddle runs, stabbing brass, driving snare, 150 bpm',
  bpm: BPM,
  beatsPerBar: BPB,
  bars: BARS,
  tail: 3,
  master: { crackle: 0.6, drive: 1.5, width: 0.7, air: 0.8 },
  async render() {
    const clock = new Clock(BPM, BPB, 0.58);
    const m = new Mixer(clock.bars(BARS), 44100, hashString('tantrum'));
    const a = new Arr(new Rng(5), clock, BARS, 0.004, 0.07);
    const slots = chart(CHART, BPB);
    m.reverb('deck', { seconds: 2, rt60: 1.1, predelay: 0.012, dampStart: 7500, dampEnd: 2300, early: 10, earlySpread: 0.035, lowCut: 180 });

    const fid = m.stem('fid', { gain: 1.3, pan: -0.15, sends: { deck: 0.2 } });
    const conc = m.stem('conc', { gain: 0.7, pan: 0.2, sends: { deck: 0.2 } });
    const tpt = m.stem('tpt', { gain: 0.9, pan: 0.3, sends: { deck: 0.22 } });
    const tbn = m.stem('tbn', { gain: 0.65, pan: -0.3, sends: { deck: 0.2 } });
    const tb = m.stem('tuba', { gain: 0.45, hp: 35, sends: { deck: 0.06 } });
    const acc = m.stem('acc', { gain: 0.35, pan: 0.1, lp: 3800, sends: { deck: 0.15 } });
    const kit = m.stem('kit', { gain: 0.55, sends: { deck: 0.14 } });
    const tamb = m.stem('tamb', { gain: 1.2, pan: -0.35, sends: { deck: 0.12 } });
    const cym = m.stem('cym', { gain: 0.9, pan: 0.2, sends: { deck: 0.12 } });

    const play = (stem: typeof fid, inst: typeof FID, src: string, startBar: number, name: string, vel: number, o: { harmony?: boolean; flags?: string; durScale?: number } = {}) =>
      a.play(seq(src, { name, startBeat: startBar * BPB, vel }), (t, f, d, v, ev, mm) => {
        const note = o.harmony ? mtof(harmonyBelow(mm, chordPcs(chordAt(slots, ev.beat).chord))) : f;
        stem.note(inst, t, note, v, d * (o.durScale ?? 0.9), ev.flags + (o.flags ?? ''));
      });

    // A: fiddle and concertina in unison
    play(fid, FID, STRAIN_A, 0, 'A', 0.78);
    play(conc, CONC, STRAIN_A, 0, 'A conc', 0.6);
    // A': fiddle runs, concertina harmony
    play(fid, FID, STRAIN_A2, 8, "A'", 0.84);
    play(conc, CONC, STRAIN_A2, 8, "A' conc", 0.55, { harmony: true });
    // B: fiddle lead, concertina an octave down, trumpet fill in the half cadence
    play(fid, FID, STRAIN_B, 16, 'B', 0.8);
    play(conc, CONC, STRAIN_B, 16, 'B conc', 0.55);
    play(tpt, TPT, FILL, 16, 'fill', 0.75, { durScale: 0.8 });
    // B': everyone, trumpets doubling the last half an octave down
    play(fid, FID, STRAIN_B2, 24, "B'", 0.88);
    play(conc, CONC, STRAIN_B2, 24, "B' conc", 0.6, { harmony: true });
    a.play(seq(STRAIN_B2, { name: "B' tpt", startBeat: 24 * BPB, vel: 0.62 }).filter((e) => e.beat >= 28 * BPB), (t, f, d, v) => tpt.note(TPT, t, f / 2, v, d * 0.85));

    // brass stabs: short chords on "2-and" and 4 in A' and B', on "4-and" in B; hits with every hornpipe cadence
    const stabV = voicings(slots, 62, 74, 3);
    const tbnV = voicings(slots, 50, 62, 3);
    for (let bar = 0; bar < BARS; bar++) {
      const b0 = bar * BPB;
      const sec = Math.floor(bar / 8);
      const cadence = bar % 8 === 7;
      const offs = cadence ? [0, 1, 2] : sec === 1 || sec === 3 ? [1.5, 3] : sec === 2 ? [3.5] : [];
      for (const off of offs) {
        const beat = b0 + off;
        const i = slots.indexOf(chordAt(slots, off === 3.5 ? beat + 0.5 : beat));
        const v = cadence ? 0.8 : 0.6;
        for (const mm of stabV[i]) tpt.note(TPT, a.t(beat), mtof(mm), a.v(v), a.len(beat, cadence ? 0.7 : 0.3));
        for (const mm of tbnV[i]) tbn.note(TBN, a.t(beat), mtof(mm), a.v(v * 0.9), a.len(beat, cadence ? 0.7 : 0.3));
      }
    }

    // oom-pah: tuba on 1 and 3, accordion on 2 and 4
    const accV = voicings(slots, 55, 67, 3);
    for (let b = 0; b < BARS * BPB; b++) {
      const bar = Math.floor(b / BPB);
      if (bar % 8 === 7 && b % BPB === 3) continue; // the cadence's rest
      const i = slots.indexOf(chordAt(slots, b));
      const slot = slots[i];
      if (b % 2 === 0) {
        const root = bassNote(slot.chord, 31);
        const note = b % 4 === 0 || slot.beat === b ? root : root + 7 > 45 ? root - 5 : root + 7;
        tb.note(TUBA, a.t(b), mtof(note), a.v(0.8), a.len(b, 0.55));
      } else {
        for (const mm of accV[i]) acc.note(ACC, a.t(b), mtof(mm), a.v(0.55), a.len(b, 0.4));
      }
    }

    // drums: kick on 1 and 3, a driving 8th-note snare with the backbeat, tambourine, fills, crashes
    const rnd = new Rng(99);
    for (let bar = 0; bar < BARS; bar++) {
      const b0 = bar * BPB;
      const sec = Math.floor(bar / 8);
      const cadence = bar % 8 === 7;
      kit.note(BD, a.t(b0), 0, a.v(0.7));
      if (!cadence) kit.note(BD, a.t(b0 + 2), 0, a.v(0.6));
      if (cadence) {
        for (const k of [0, 1, 2]) kit.note(SN, a.t(b0 + k), 0, a.v(0.75));
        // fill in the rest: 16ths (a roll in the last strain, back into the top)
        const n = sec === 3 ? 8 : 4;
        for (let k = 0; k < n; k++) kit.note(SN, a.straight(b0 + 3 + k / n), 0, a.v(0.3 + (0.45 * k) / n), 0, k % 2 ? 'g' : '');
      } else {
        const lvl = sec === 0 ? 0.75 : 1;
        const pat = [0.22, 0.12, 0.55, 0.14, 0.22, 0.12, 0.6, 0.18];
        pat.forEach((v, k) => {
          if (sec === 0 && k % 2 === 1 && rnd.next() < 0.5) return;
          kit.note(SN, a.t(b0 + k * 0.5), 0, a.v(v * lvl), 0, v < 0.3 ? 'g' : '');
        });
        if (sec >= 2) {
          tamb.note(TAMB, a.t(b0 + 1), 0, a.v(0.55));
          tamb.note(TAMB, a.t(b0 + 3), 0, a.v(0.6));
        }
      }
      if (bar % 8 === 0) cym.note(CRASH, a.t(b0, false), 0, bar === 0 ? 0.4 : 0.5);
    }
    // a little extra spark on the half cadences
    for (const bar of [19, 27]) cym.note(CRASH, a.t(bar * BPB + 3, false), 0, 0.3);

    return m.render(3);
  },
};
