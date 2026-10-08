/**
 * Bonus and big moments: anticipation (the train approaching), the Golden Ticket trigger and Rush Hour
 * title card, retrigger, the POWER meter steps and level-ups, the Golden Locomotive, and the big-band
 * big-win stings (Bb major, like the big-win loop) with the max-win blowout.
 */
import { hz, midi, mtof } from '../core/notes';
import { brushSwish, crash, kick, snare, timpani, timpaniRoll } from '../instruments/drums';
import { celesta, glock, shipBell, xylophone } from '../instruments/tuned';
import { brass, clarinet, mutedTrumpet, sax, tuba } from '../instruments/winds';
import { choir, strings } from '../instruments/strings';
import { piano } from '../instruments/keys';
import { sample, whoosh } from '../instruments/fx';
import { clearOfSeam, ironClank, seamDip } from '../instruments/foley';
import {
  airHorn, arc, brakeSqueal, clickety, electricBell, electricHum, motorWhine, railClack, register, steamHiss, steamWhistle, ticketPunch, trackRumble, zap,
} from '../instruments/train';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, tailFade, variants, withRoom } from './common';

function brassChord(s: Studio, d: Dest, t: number, notes: string[], dur: number, vel: number, bright = 1) {
  for (const n of notes) brass(s, d, t + s.rng.next() * 0.008, hz(n), dur, vel, { bright });
}

/** Sax section doubling a chord. */
function reeds(s: Studio, d: Dest, t: number, notes: string[], dur: number, vel: number) {
  for (const n of notes) sax(s, d, t + s.rng.next() * 0.006, hz(n), dur, vel);
}

function pianoChord(s: Studio, d: Dest, t: number, notes: string[], dur: number, vel: number) {
  notes.forEach((n, k) => piano(s, d, t + k * 0.006, hz(n), dur, vel, { sustain: true }));
}

/** Snare roll with a crescendo from v0 to v1 (32nd-note strokes). */
function snareRoll(s: Studio, d: Dest, t: number, dur: number, v0: number, v1: number, rate = 26) {
  const n = Math.max(2, Math.floor(dur * rate));
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    snare(s, d, t + i / rate + (s.rng.next() - 0.5) * 0.004, (v0 + (v1 - v0) * x) * (0.85 + s.rng.next() * 0.15), { decay: 0.08 });
  }
}

/** A quick clarinet run (MIDI notes), for the band stings. */
function run(s: Studio, d: Dest, t: number, notes: number[], step: number, vel: number) {
  notes.forEach((m, i) => clarinet(s, d, t + i * step, mtof(m), step * 0.95, vel * (0.7 + (0.3 * i) / notes.length), i === 0 ? 'b' : ''));
}

/** Piano glissando (white keys) from MIDI lo to hi over dur. */
function gliss(s: Studio, d: Dest, t: number, lo: number, hi: number, dur: number, vel: number) {
  const white = [0, 2, 4, 5, 7, 9, 11];
  const notes: number[] = [];
  for (let m = lo; m <= hi; m++) if (white.includes(m % 12)) notes.push(m);
  notes.forEach((m, i) => piano(s, d, t + (i / notes.length) * dur, mtof(m), 0.15, vel * (0.5 + (0.5 * i) / notes.length), { bright: 1.1 }));
}

/** Shepard-Risset voice: rises `octaves` octaves over octaves*T seconds with a sin^2 window. Folded
 * at period T this becomes an endlessly rising glissando with no seam. */
function shepardVoice(s: Studio, d: Dest, T: number, octaves: number, fmin: number, vel: number) {
  const dur = octaves * T;
  const win = s.gain(0, d);
  const curve = new Float32Array(512);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.pow(Math.sin((Math.PI * i) / (curve.length - 1)), 2) * vel;
  win.gain.setValueCurveAtTime(curve, 0, dur);
  const lp = s.filter('lowpass', 1900, 0.6, win);
  const trem = s.gain(0.55, lp);
  s.osc('triangle', 11.5, 0, dur, s.gain(0.45, trem.gain));
  for (const dc of [-6, 6]) {
    const o = s.osc('sawtooth', fmin, 0, dur, trem, dc);
    o.frequency.setValueAtTime(fmin, 0);
    o.frequency.exponentialRampToValueAtTime(fmin * Math.pow(2, octaves), dur);
  }
}

const POWER = ['F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6', 'C7', 'D7', 'F7', 'G7'].map(midi);

export const EVENT_SFX: SfxDef[] = [
  // ---------------------------------------------------------------- anticipation
  one('anticipationStart', { kind: 'sfx', seconds: 1.8, level: -16, desc: 'a train approaching: far-off whistle, the rails starting to sing, a tremolo swell and a crackle' }, (s, out) => {
    const d = withRoom(s, out, 0.22, 'medium');
    const far = s.filter('lowpass', 2600, 0.7, d);
    steamWhistle(s, far, 0, 0.55, [hz('D5'), hz('F5'), hz('A5')], 0.5, { attack: 0.12, release: 0.25 });
    trackRumble(s, d, 0, 1.2, 0.55, { fadeIn: 1.0, fadeOut: 0.2 });
    whoosh(s, d, 0.1, 0.9, 0.3, { f0: 200, f1: 3000, q: 0.9, peakAt: 0.95 });
    for (const n of ['D3', 'A3', 'D4', 'Eb4']) {
      const g = s.gain(0, d);
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(1, 0.9);
      g.gain.linearRampToValueAtTime(0.0, 1.3);
      strings(s, g, 0, hz(n), 1.1, 0.8, { tremolo: 12, attack: 0.5, release: 0.3 });
    }
    zap(s, d, 0.95, 0.35, { size: 0.6 });
  }),
  one('anticipationEnd', { kind: 'sfx', seconds: 1.5, level: -19, desc: 'release: a soft down-whoosh, the air brakes sighing, a brush settle' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    whoosh(s, d, 0, 0.5, 0.3, { f0: 2400, f1: 250, q: 0.9, peakAt: 0.25 });
    steamHiss(s, d, 0.05, 0.6, 0.35, { bright: 0.9 });
    kick(s, d, 0.02, 0.35, { tone: 50, decay: 0.4 });
    brushSwish(s, d, 0, 0.4, 1.2);
    for (const n of ['D3', 'A3', 'D4']) strings(s, d, 0, hz(n), 0.25, 0.6, { tremolo: 0, attack: 0.02, release: 0.6 });
  }),
  {
    id: 'anticipation', name: 'anticipation', variant: 0, bank: 'core', kind: 'loop', seconds: 4.8, tail: 21, level: -20,
    desc: 'loop: an endlessly rising (Shepard) tremolo string bed over the rumble of an approaching train, the rails clacking and the third rail humming',
    render: (s, out) => {
      const d = withRoom(s, out, 0.2, 'medium');
      const T = 4.8;
      shepardVoice(s, d, T, 5, 55, 0.42);
      // the train: a steady roar (dipped at the seam), a hum and wheels clacking twice a beat-ish
      const dip = seamDip(s, T, 0.3, 0.05, 0.08);
      dip.connect(s.filter('lowpass', 260, 0.7, d));
      s.noise('brown', 0, T, s.gain(0.6, dip));
      const hum = s.gain(0.04, d);
      s.osc('sine', s.periodic(55), 0, T, hum);
      s.osc('square', s.periodic(110), 0, T, s.gain(0.12, s.filter('lowpass', 600, 1, hum)));
      for (let k = 0; k < 4; k++) {
        const t0 = 0.25 + k * 1.2;
        if (clearOfSeam(t0, T)) clickety(s, s.filter('lowpass', 2400, 0.7, d), t0, 0.7, { gap: 0.07, pair: 0.2 });
      }
    },
  },

  // ---------------------------------------------------------------- bonus flow
  one('bonusTrigger', { kind: 'sfx', seconds: 2.6, level: -13, desc: 'Golden Tickets punched (chk-chk-chk), the register rings, and a brass fanfare with the train whistle' }, async (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    [0, 0.12, 0.24].forEach((t, k) => ticketPunch(s, d, t, 0.85, { pitch: 1 + k * 0.06 }));
    register(s, d, 0.3, 0.7, { bell: hz('C7') });
    const t = 0.42;
    [0, 0.09, 0.18].forEach((dt) => brassChord(s, d, t + dt, ['C5', 'F5'], 0.07, 0.75));
    const hit = t + 0.27;
    brassChord(s, d, hit, ['F4', 'A4', 'C5', 'F5', 'A5'], 1.0, 0.95, 1.15);
    reeds(s, d, hit, ['A3', 'C4', 'F4'], 0.9, 0.6);
    tuba(s, d, hit, hz('F2'), 0.9, 0.8);
    crash(s, d, hit, 0.5, { decay: 1.8, hp: 4500 });
    snare(s, d, hit, 0.6);
    kick(s, d, hit, 0.6, { tone: 52, decay: 0.3 });
    steamWhistle(s, d, hit + 0.15, 0.7, [hz('A5'), hz('C6'), hz('F6')], 0.6, { attack: 0.05, release: 0.2 });
    for (let i = 0; i < 6; i++) glock(s, d, hit + 0.05 + i * 0.05, hz(['F6', 'A6', 'C7', 'F7', 'A7', 'C8'][i]), 0.22, { decay: 1.0 });
    const sp = await sample(s, 'sparkle');
    s.play(sp, hit, s.gain(0.15, s.filter('lowpass', 9000, 0.7, d)));
  }),
  one('bonusIntro', { kind: 'sfx', seconds: 3.0, level: -14, desc: 'title-card fanfare: snare roll and piano glissando into a big-band "ta-da" with the whistle motif on top' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 2.6, 2.98), 0.22, 'hall');
    snareRoll(s, d, 0, 0.6, 0.18, 0.7);
    gliss(s, d, 0.15, 53, 84, 0.45, 0.5);
    timpaniRoll(s, d, 0.2, 0.42, hz('C2'), 0.2, 0.55, 18);
    const t = 0.66;
    [0, 0.09, 0.18].forEach((dt) => {
      brassChord(s, d, t + dt, ['C5', 'G5'], 0.07, 0.7);
      reeds(s, d, t + dt, ['E4', 'C5'], 0.07, 0.5);
    });
    const hit = t + 0.28;
    brassChord(s, d, hit, ['F4', 'C5', 'F5', 'A5', 'D6'], 1.1, 0.95, 1.15);
    reeds(s, d, hit, ['A3', 'D4', 'F4', 'C5'], 1.0, 0.6);
    pianoChord(s, d, hit, ['F2', 'C3', 'F3', 'A3', 'D4'], 1.2, 0.7);
    tuba(s, d, hit, hz('F1'), 1.0, 0.8);
    timpani(s, d, hit, hz('F2'), 0.9);
    crash(s, d, hit, 0.55, { decay: 2.2 });
    snare(s, d, hit, 0.6);
    kick(s, d, hit, 0.6, { tone: 50, decay: 0.3 });
    steamWhistle(s, d, hit + 0.2, 0.22, [hz('A5'), hz('C6'), hz('F6')], 0.6);
    steamWhistle(s, d, hit + 0.5, 0.75, [hz('A5'), hz('C6'), hz('F6')], 0.65, { release: 0.25 });
    for (let i = 0; i < 6; i++) glock(s, d, hit + 0.04 + i * 0.05, hz(['F6', 'A6', 'C7', 'F7', 'A7', 'C8'][i]), 0.24, { decay: 1.1 });
  }),
  one('bonusEnd', { kind: 'sfx', seconds: 3.4, level: -14, desc: 'end of the line: "shave and a haircut" cadence (trad.) on piano, clarinet and muted trumpet, the station bell ding-ding, a band "ta-da"' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 3.0, 3.38), 0.2, 'hall');
    const spb = 60 / 176;
    // traditional "shave and a haircut, two bits", in F
    const mel: Array<[string, number, number]> = [['F5', 0, 1], ['C5', 1, 0.5], ['C5', 1.5, 0.5], ['D5', 2, 1], ['C5', 3, 1], ['E5', 5, 1], ['F5', 6, 1.8]];
    for (const [n, b, len] of mel) {
      const t = b * spb;
      xylophone(s, d, t, hz(n) * 2, 0.45);
      mutedTrumpet(s, d, t, hz(n), len * spb * (b >= 5 ? 0.9 : 0.55), 0.7);
      clarinet(s, d, t, hz(n) / 2, len * spb * (b >= 5 ? 0.9 : 0.55), 0.45);
    }
    const bass: Array<[string, number]> = [['F2', 0], ['C2', 1], ['F2', 2], ['C2', 3], ['C2', 5], ['F2', 6]];
    for (const [n, b] of bass) tuba(s, d, b * spb, hz(n), spb * 0.6, 0.7);
    for (const b of [0, 2, 3]) snare(s, d, b * spb, 0.35, { decay: 0.1 });
    snare(s, d, 5 * spb, 0.7);
    snare(s, d, 6 * spb, 0.8);
    const hit = 6 * spb;
    brassChord(s, d, hit, ['F4', 'A4', 'C5', 'F5'], 1.0, 0.85);
    pianoChord(s, d, hit, ['F2', 'F3', 'A3', 'C4', 'F4'], 1.1, 0.6);
    shipBell(s, d, hit + 0.02, hz('F6'), 0.28, { decay: 1.1, double: 0.24 });
    crash(s, d, hit, 0.5, { decay: 1.6 });
    timpani(s, d, hit, hz('F2'), 0.7, { decay: 1.6 });
  }),
  one('retrigger', { kind: 'sfx', seconds: 2.0, level: -14, desc: 'more spins: the electric station bell rings, a clarinet run up, a glockenspiel and a whistle toot' }, async (s, out) => {
    const d = withRoom(s, out, 0.22, 'medium');
    electricBell(s, d, 0, 0.45, hz('A6'), 0.55);
    run(s, d, 0.05, [65, 69, 72, 77, 81, 84], 0.045, 0.5);
    ['F5', 'A5', 'C6', 'F6', 'A6', 'C7', 'F7'].forEach((n, i) => glock(s, d, 0.05 + i * 0.045, hz(n), 0.3 + i * 0.05, { decay: 1.0 }));
    steamWhistle(s, d, 0.42, 0.35, [hz('A5'), hz('C6'), hz('F6')], 0.55);
    const sp = await sample(s, 'sparkle');
    s.play(sp, 0.15, s.gain(0.18, s.filter('lowpass', 9000, 0.7, d)));
  }),

  // ---------------------------------------------------------------- POWER meter
  ...variants('powerStep', 12, { kind: 'sfx', seconds: 0.9, level: -22, desc: 'a passenger boards the POWER meter: a little electric bell blip, one pentatonic step higher per index (1..12; 13+ cycles back to 1)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.12);
    const f = mtof(POWER[i]);
    electricBell(s, d, 0, 0.07, f, 0.4 + i * 0.02, { rate: 28 });
    glock(s, d, 0, f, 0.45, { decay: 0.6 });
    zap(s, d, 0, 0.12, { size: 0.25, pitch: 1.4 + i * 0.05, buzz: 0.4 });
  }, (i) => ({ variant: i + 1, id: `powerStep_${i + 1}`, level: -22 + i * 0.15 })),
  one('levelUp', { kind: 'sfx', seconds: 2.4, level: -14, desc: 'POWER level up: the station bell rings, a power surge whines up, and a brass hit lands' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    electricBell(s, d, 0, 0.5, hz('C7'), 0.55);
    electricHum(s, d, 0, 0.6, 0.7, { f0: 50, f1: 150, fadeIn: 0.05, fadeOut: 0.1 });
    motorWhine(s, d, 0, 0.6, 0.9, 300, 1600, { fadeOut: 0.08 });
    zap(s, d, 0.58, 0.8, { size: 1.2 });
    const hit = 0.6;
    brassChord(s, d, hit, ['F4', 'A4', 'C5', 'F5', 'A5'], 0.7, 0.95, 1.2);
    reeds(s, d, hit, ['C4', 'F4', 'A4'], 0.6, 0.55);
    tuba(s, d, hit, hz('F2'), 0.6, 0.8);
    kick(s, d, hit, 0.7, { tone: 52, decay: 0.3 });
    snare(s, d, hit, 0.7);
    crash(s, d, hit, 0.5, { decay: 1.8 });
    for (let i = 0; i < 5; i++) glock(s, d, hit + 0.04 + i * 0.05, hz(['F6', 'A6', 'C7', 'F7', 'A7'][i]), 0.24, { decay: 1.0 });
  }),
  one('goldenArrive', { kind: 'sfx', seconds: 3.4, level: -13, desc: 'the Golden Locomotive arrives: a majestic horn chord over a brass swell and timpani roll, golden shimmer' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 3.0, 3.38), 0.26, 'hall');
    timpaniRoll(s, d, 0, 0.9, hz('F2'), 0.15, 0.6, 20);
    trackRumble(s, d, 0, 1.0, 0.45, { fadeIn: 0.8, fadeOut: 0.15 });
    brakeSqueal(s, d, 0.35, 0.55, 0.25, { f: 2650 });
    steamHiss(s, d, 0.85, 0.7, 0.45);
    const hit = 0.9;
    airHorn(s, d, hit, 1.5, [hz('F3'), hz('A3'), hz('C4'), hz('F4')], 1, { bright: 1.1 });
    brassChord(s, d, hit + 0.02, ['F3', 'C4', 'F4', 'A4', 'C5', 'F5'], 1.6, 0.85, 1.2);
    for (const n of ['A4', 'C5', 'F5']) choir(s, d, hit, hz(n), 1.8, 0.4, { vowel: 'ah', attack: 0.15, release: 1.0 });
    tuba(s, d, hit, hz('F1'), 1.5, 0.9);
    timpani(s, d, hit, hz('F2'), 1);
    crash(s, d, hit, 0.6, { decay: 2.6 });
    ['F6', 'A6', 'C7', 'F7', 'A7', 'C8', 'F7', 'C7'].forEach((n, i) => glock(s, d, hit + 0.1 + i * 0.06, hz(n), 0.26, { decay: 1.3 }));
    ['C6', 'F6', 'A6', 'C7'].forEach((n, i) => celesta(s, d, hit + 0.3 + i * 0.08, hz(n), 0.3, { decay: 1.4 }));
    const sp = await sample(s, 'sparkle');
    s.play(sp, hit, s.gain(0.22, s.filter('lowpass', 10000, 0.7, d)));
  }),

  // ---------------------------------------------------------------- big wins (Bb major, like the big-win loop)
  one('bigWinStart', { kind: 'sfx', seconds: 3.0, level: -12, desc: 'big-band hit: a clarinet run into a full-band Bb stab, crash, timpani and a whistle toot' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 2.65, 2.98), 0.22, 'hall');
    run(s, d, 0, [58, 62, 65, 70, 74], 0.035, 0.5);
    const hit = 0.18;
    brassChord(s, d, hit, ['Bb3', 'F4', 'Bb4', 'D5', 'F5', 'C6'], 0.9, 1, 1.2);
    reeds(s, d, hit, ['D4', 'F4', 'G4', 'Bb4'], 0.8, 0.6);
    pianoChord(s, d, hit, ['Bb1', 'Bb2', 'F3', 'D4', 'G4'], 1.0, 0.7);
    tuba(s, d, hit, hz('Bb1'), 0.9, 0.9);
    timpani(s, d, hit, hz('Bb1'), 1);
    kick(s, d, hit, 0.75, { tone: 48, decay: 0.35 });
    crash(s, d, hit, 0.7, { decay: 2.4 });
    steamWhistle(s, d, hit + 0.3, 0.45, [hz('D5'), hz('F5'), hz('Bb5')], 0.5);
    for (let i = 0; i < 6; i++) glock(s, d, hit + 0.06 + i * 0.045, hz(['Bb5', 'D6', 'F6', 'Bb6', 'D7', 'F7'][i]), 0.28, { decay: 1.2 });
  }),
  ...variants('bigWinTier', 4, { kind: 'sfx', seconds: 2.4, level: -12, desc: 'tier step-up: brass pickup into a full-band stab (index 0..3, the top note climbs Bb, D, F, Bb; whistle from tier 2)' }, (k) => (s, out) => {
    const d = withRoom(s, tailFade(s, out, 2.05, 2.38), 0.22, 'hall');
    const tops = ['Bb4', 'D5', 'F5', 'Bb5'];
    const top = midi(tops[k]);
    [top - 7, top - 5, top - 3].forEach((m, i) => {
      brass(s, d, i * 0.075, mtof(m), 0.06, 0.65);
      sax(s, d, i * 0.075, mtof(m - 12), 0.06, 0.5);
      snare(s, d, i * 0.075, 0.3 + i * 0.05, { decay: 0.08 });
    });
    const hit = 0.225;
    const chord = [top - 12, top - 8, top - 5, top];
    for (const m of chord) brass(s, d, hit, mtof(m), 0.7, 0.95, { bright: 1.1 + k * 0.1 });
    for (const m of chord.slice(1)) sax(s, d, hit, mtof(m - 12), 0.6, 0.55);
    tuba(s, d, hit, hz('Bb1'), 0.7, 0.85);
    timpani(s, d, hit, hz('Bb1') * (k % 2 ? 1.335 : 1), 0.9);
    kick(s, d, hit, 0.55 + k * 0.08, { tone: 50, decay: 0.3 });
    if (k >= 2) steamWhistle(s, d, hit + 0.15, 0.4, [mtof(top - 12), mtof(top - 8), mtof(top - 5)], 0.4 + (k - 2) * 0.15);
    crash(s, d, hit, 0.55 + k * 0.05, { decay: 2 });
    glock(s, d, hit + 0.02, mtof(top + 12), 0.35, { decay: 1.2 });
  }),
  one('bigWinEnd', { kind: 'sfx', seconds: 3.6, level: -12, drive: 1.8, desc: 'closing big-band "ta-da": F7 into Bb6/9 with a drum roll, crash and the whistle' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 3.2, 3.58), 0.24, 'hall');
    brassChord(s, d, 0, ['F4', 'A4', 'C5', 'Eb5'], 0.28, 0.85);
    reeds(s, d, 0, ['A3', 'C4', 'Eb4'], 0.28, 0.55);
    tuba(s, d, 0, hz('F1'), 0.28, 0.8);
    snareRoll(s, d, 0, 0.36, 0.3, 0.7);
    const hit = 0.4;
    brassChord(s, d, hit, ['Bb3', 'F4', 'Bb4', 'D5', 'G5', 'C6'], 1.6, 1, 1.25);
    reeds(s, d, hit, ['D4', 'F4', 'G4', 'Bb4'], 1.4, 0.6);
    pianoChord(s, d, hit, ['Bb1', 'Bb2', 'F3', 'D4', 'G4'], 1.6, 0.7);
    tuba(s, d, hit, hz('Bb1'), 1.5, 0.95);
    timpani(s, d, hit, hz('Bb1'), 0.9);
    kick(s, d, hit, 0.8, { tone: 48, decay: 0.4 });
    crash(s, d, hit, 0.75, { decay: 3 });
    steamWhistle(s, d, hit + 0.3, 0.9, [hz('D5'), hz('F5'), hz('Bb5')], 0.55, { release: 0.3 });
    for (let i = 0; i < 8; i++) glock(s, d, hit + 0.05 + i * 0.04, hz(['Bb5', 'D6', 'F6', 'Bb6', 'D7', 'F7', 'Bb7', 'F7'][i]), 0.26, { decay: 1.2 });
  }),
  one('maxWin', { kind: 'sfx', seconds: 5.0, level: -12, desc: 'MAX WIN: drum roll and piano glissando, the horn and whistle blasting, the full band and choir on Bb, station bell, golden cascade' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 4.4, 4.97), 0.28, 'hall');
    whoosh(s, d, 0, 0.7, 0.45, { f0: 200, f1: 6000, q: 0.8, peakAt: 0.97, color: 'white' });
    snareRoll(s, d, 0, 0.68, 0.15, 0.75, 28);
    timpaniRoll(s, d, 0.1, 0.58, hz('F2'), 0.2, 0.7, 22);
    gliss(s, d, 0.1, 50, 86, 0.55, 0.55);
    const hit = 0.72;
    const ib = await sample(s, 'impact-bass-2');
    s.play(ib, hit, s.gain(0.28, s.filter('lowpass', 4000, 0.7, d)));
    airHorn(s, d, hit, 1.6, [hz('D3'), hz('F3'), hz('Bb3')], 0.9);
    steamWhistle(s, d, hit + 0.05, 1.4, [hz('D5'), hz('F5'), hz('Bb5'), hz('D6')], 0.6, { release: 0.4 });
    brassChord(s, d, hit, ['Bb2', 'F3', 'Bb3', 'D4', 'F4', 'Bb4', 'D5', 'F5'], 2.4, 1, 1.3);
    reeds(s, d, hit, ['D4', 'F4', 'G4', 'Bb4', 'D5'], 2.3, 0.6);
    pianoChord(s, d, hit, ['Bb0', 'Bb1', 'F2', 'Bb2', 'D3', 'F3', 'Bb3'], 2.5, 0.8);
    for (const n of ['Bb4', 'D5', 'F5', 'Bb5']) choir(s, d, hit, hz(n), 2.6, 0.55, { vowel: 'ah', attack: 0.08, release: 1.2 });
    tuba(s, d, hit, hz('Bb1'), 2.2, 1);
    timpani(s, d, hit, hz('Bb1'), 1);
    kick(s, d, hit, 0.9, { tone: 45, decay: 0.5 });
    crash(s, d, hit, 0.8, { decay: 3.5 });
    crash(s, d, hit + 0.01, 0.5, { decay: 3, hp: 2500 });
    electricBell(s, d, hit + 0.1, 0.8, hz('F6'), 0.35);
    for (let i = 0; i < 10; i++) glock(s, d, hit + 0.1 + i * 0.05, hz(['Bb5', 'D6', 'F6', 'Bb6', 'D7', 'F7', 'Bb7', 'F7', 'D7', 'Bb6'][i]), 0.28, { decay: 1.4 });
    // a second band hit to drive it home
    const h2 = hit + 1.5;
    brassChord(s, d, h2, ['F4', 'Bb4', 'D5', 'F5', 'Bb5'], 1.6, 0.85, 1.3);
    snare(s, d, h2, 0.8);
    kick(s, d, h2, 0.7, { tone: 48, decay: 0.4 });
    crash(s, d, h2, 0.6, { decay: 2.4 });
  }),
  one('tierSlam', { kind: 'sfx', seconds: 2.0, level: -12, drive: 2.6, desc: 'a big-win tier title slams in: a heavy iron coupling slam, doubled snare and crash, an electric crack (unpitched)' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.6, 1.95), 0.2, 'hall');
    ironClank(s, d, 0, 1, { f: 300, decay: 0.3 });
    ironClank(s, d, 0.003, 0.7, { f: 740, decay: 0.15 });
    railClack(s, d, 0.002, 0.9, { pitch: 0.8 });
    kick(s, d, 0, 0.9, { tone: 55, decay: 0.3 });
    snare(s, d, 0, 1, { decay: 0.26 });
    snare(s, d, 0.012, 0.6, { decay: 0.2 });
    crash(s, d, 0.004, 0.75, { decay: 1.8 });
    crash(s, d, 0.02, 0.4, { decay: 1.4, hp: 2600 });
    zap(s, d, 0.01, 0.45, { size: 0.9 });
    arc(s, d, 0.05, 0.25, 0.3);
    const ib = await sample(s, 'impact-bass-1');
    s.play(ib, 0, s.gain(0.12, s.filter('lowpass', 5000, 0.7, s.filter('highpass', 70, 0.7, d))));
  }),
];
