/**
 * The trains: Casey's whistle, departure, the running loop, exit and brakes; collecting Fare Coins
 * along the row (a rising chime arpeggio), Junction switches and branches; the haul counter and the
 * Total Win Bar.
 */
import { hz, midi, mtof } from '../core/notes';
import { block, crash, kick, snare, timpani } from '../instruments/drums';
import { celesta, glock } from '../instruments/tuned';
import { brass, tuba } from '../instruments/winds';
import { coinClink, ratchet, whoosh } from '../instruments/fx';
import { clearOfSeam, doubloon, ironClank, seamDip } from '../instruments/foley';
import {
  airHorn, brakeSqueal, clickety, electricHum, guardWhistle, motorWhine, railClack, register, steamHiss, trackRumble, zap,
} from '../instruments/train';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, tailFade, variants, withRoom } from './common';

/** F major scale steps for the coin-collect arpeggio (index 1..12). */
const COLLECT = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6', 'D6', 'E6', 'F6', 'G6'].map(midi);

function brassChord(s: Studio, d: Dest, t: number, notes: string[], dur: number, vel: number, bright = 1) {
  for (const n of notes) brass(s, d, t + s.rng.next() * 0.008, hz(n), dur, vel, { bright });
}

/** The running train loop (period T): two clickety-clack groups, hum, motor and a low roar. */
function trainRunBed(s: Studio, out: Dest, T: number) {
  const d = withRoom(s, out, 0.12);
  // low roar, dipped at the seam so the decoded loop point stays clean
  const dip = seamDip(s, T, 0.35, 0.05, 0.06);
  dip.connect(s.filter('lowpass', 300, 0.7, d));
  const rg = s.gain(0.35, dip);
  s.lfo(rg.gain, 2 / T, 0.12, 0, T);
  s.noise('brown', 0, T, rg);
  // steady tones (sources run exactly one period so the fold adds no second copy): third-rail hum
  // and motor, pitched to whole cycles per loop
  const hum = s.gain(0.05, d);
  s.osc('sine', s.periodic(60), 0, T, hum);
  s.osc('square', s.periodic(120), 0, T, s.gain(0.15, s.filter('lowpass', 700, 1, hum)));
  const mg = s.gain(0.012, d);
  s.osc('triangle', s.periodic(640), 0, T, mg);
  s.osc('sine', s.periodic(1280), 0, T, s.gain(0.3, mg));
  // the wheels: two bogie groups per period, clear of the seam
  for (const [t0, v] of [[0.2, 1], [0.95, 0.85]] as const) {
    if (clearOfSeam(t0, T)) clickety(s, d, t0, v * 0.9, { gap: 0.075, pair: 0.24 });
  }
}

export const TRAIN_SFX: SfxDef[] = [
  one('whistle', { kind: 'sfx', seconds: 1.4, level: -16, desc: "Conductor Casey's brass guard's whistle, two-tone: a short and a long blast" }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    guardWhistle(s, d, 0, 0.15, 0.85, { f: 2250 });
    guardWhistle(s, d, 0.24, 0.6, 1.0, { f: 2250, trill: 27 });
  }),
  one('trainDepart', { kind: 'sfx', seconds: 2.4, level: -15, desc: 'a train pulls out: brakes release with a hiss, the motor hums up, the horn sounds and the wheels start clacking' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 2.0, 2.38), 0.15, 'medium');
    steamHiss(s, d, 0, 0.45, 0.6, { bright: 1.1 });
    electricHum(s, d, 0.05, 2.2, 0.8, { f0: 40, f1: 110, fadeIn: 0.3, fadeOut: 0.3 });
    motorWhine(s, d, 0.1, 2.1, 0.9, 180, 900, { fadeOut: 0.4 });
    airHorn(s, d, 0.2, 0.55, [hz('A3'), hz('C4'), hz('F4')], 0.9);
    trackRumble(s, d, 0.3, 1.9, 0.5, { fadeIn: 0.8, fadeOut: 0.4 });
    // wheels accelerating
    let t = 0.55;
    let gap = 0.5;
    while (t < 2.1) {
      railClack(s, d, t, 0.45 + (t - 0.55) * 0.25, { pitch: 1 + (t - 0.55) * 0.05 });
      t += gap;
      gap = Math.max(0.12, gap * 0.78);
    }
  }),
  {
    id: 'trainRun', name: 'trainRun', variant: 0, bank: 'core', kind: 'loop', seconds: 1.5, tail: 1.2, level: -21,
    desc: 'loop: the train running a row, rhythmic clickety-clack over the third-rail hum, motor whine and a low roar',
    render: (s, out) => trainRunBed(s, out, 1.5),
  },
  one('trainExit', { kind: 'sfx', seconds: 2.2, level: -16, desc: 'the train leaves the board: a whoosh past and a Doppler horn fading off' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.8, 2.18), 0.2, 'medium');
    whoosh(s, d, 0, 0.9, 0.7, { f0: 250, f1: 2400, q: 0.8, peakAt: 0.55, pan0: -0.6, pan1: 0.8, color: 'pink' });
    airHorn(s, d, 0.05, 1.3, [hz('A3'), hz('C4'), hz('F4')], 1, { doppler: { at: 0.45, ratio: 0.84, pan0: -0.5, pan1: 0.9, width: 0.2 } });
    const muffle = s.filter('lowpass', 1200, 0.7, d);
    const fade = s.gain(1, muffle);
    fade.gain.setValueAtTime(1, 0.4);
    fade.gain.linearRampToValueAtTime(0, 1.8);
    for (let t = 0.15; t < 1.7; t += 0.33) clickety(s, s.panner(0.6, fade), t, 0.6, { gap: 0.06, pair: 0.15 });
    trackRumble(s, fade, 0, 1.8, 0.5, { fadeIn: 0.1, fadeOut: 0.8 });
  }),
  one('trainBrake', { kind: 'sfx', seconds: 2.2, level: -16, desc: 'the train stops: wheels slowing, a long brake squeal, a final clunk and a big steam hiss' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.9, 2.18), 0.18, 'medium');
    brakeSqueal(s, d, 0, 1.15, 0.85, { f: 2350, drop: 0.9 });
    brakeSqueal(s, d, 0.05, 1.0, 0.4, { f: 3150, drop: 0.92 });
    trackRumble(s, d, 0, 1.2, 0.5, { fadeIn: 0.02, fadeOut: 0.5 });
    let t = 0;
    let gap = 0.12;
    while (t < 1.05) {
      railClack(s, d, t, 0.45 - t * 0.2, { pitch: 1 - t * 0.08 });
      t += gap;
      gap *= 1.3;
    }
    ironClank(s, d, 1.12, 0.6, { f: 420, decay: 0.15 });
    kick(s, d, 1.12, 0.45, { tone: 50, decay: 0.2 });
    steamHiss(s, d, 1.18, 0.8, 0.8, { bright: 1, attack: 0.03 });
  }),

  // collecting Fare Coins along the row: a rising chime, one scale step per coin (index 1..12)
  ...variants('coinCollect', 12, { kind: 'sfx', seconds: 0.8, level: -21, desc: 'the train picks up a Fare Coin: token clink + chime, one F major scale step higher per coin (index 1..12)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.12, 'medium');
    const m = COLLECT[i];
    coinClink(s, d, 0, 0.55, { f: 2800 + i * 90, bounce: false, decay: 0.2 });
    doubloon(s, d, 0.004, 0.25, { f: 2400 + i * 70, bounce: false, decay: 0.2 });
    glock(s, d, 0.01, mtof(m + 12), 0.5 + i * 0.02, { decay: 0.8 });
    celesta(s, d, 0.01, mtof(m), 0.4, { decay: 0.7 });
    if (i >= 7) glock(s, d, 0.06, mtof(m + 19), 0.15 + (i - 7) * 0.03, { decay: 0.6 });
  }, (i) => ({ variant: i + 1, id: `coinCollect_${i + 1}`, level: -21 + i * 0.25 })),

  one('switchThrow', { kind: 'sfx', seconds: 1.0, level: -17, desc: 'a Junction is thrown: the lever hauled over with a ratchet and clank, an electric snap and the signal lighting' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    for (let k = 0; k < 4; k++) ratchet(s, d, k * 0.03, 0.3 + k * 0.05, { body: 1700 + k * 110 });
    ironClank(s, d, 0.13, 0.8, { f: 430, decay: 0.16 });
    ironClank(s, d, 0.133, 0.4, { f: 1050, decay: 0.07 });
    kick(s, d, 0.13, 0.4, { tone: 62, decay: 0.12 });
    zap(s, d, 0.15, 0.55, { size: 0.55, pitch: 1.25 });
    glock(s, d, 0.2, hz('A6'), 0.3, { decay: 0.8 });
    celesta(s, d, 0.2, hz('D6'), 0.3, { decay: 0.7 });
  }),
  one('branch', { kind: 'sfx', seconds: 0.6, level: -20, desc: 'a train branches onto the next track: a quick whoosh and the points clacking over' }, (s, out) => {
    const d = withRoom(s, out, 0.12);
    whoosh(s, d, 0, 0.22, 0.4, { f0: 600, f1: 2600, q: 1.1, peakAt: 0.6, pan0: -0.3, pan1: 0.3 });
    railClack(s, d, 0.12, 0.8, { pitch: 1.08 });
    railClack(s, d, 0.18, 0.6, { pitch: 1.0 });
    ironClank(s, d, 0.125, 0.35, { f: 900, decay: 0.05 });
  }),

  // counting the haul and the Total Win Bar
  ...variants('haulCount', 3, { kind: 'sfx', seconds: 0.12, level: -27, desc: 'soft counting tick for the haul (called rapidly)' }, (k) => (s, out) => {
    block(s, out, 0, [2150, 2370, 2600][k], 0.45, { decay: 0.016 });
    block(s, out, 0.0005, [4300, 4740, 5200][k], 0.08, { decay: 0.006 });
  }),
  one('haulMult', { kind: 'sfx', seconds: 1.8, level: -14, drive: 2.2, desc: 'the haul multiplier slams in: a punchy brass "BWAP!", timpani, kick, snare and crash' }, (s, out) => {
    const d = withRoom(s, out, 0.18, 'medium');
    brassChord(s, d, 0, ['F3', 'C4', 'F4', 'A4', 'C5', 'F5'], 0.32, 1, 1.25);
    tuba(s, d, 0, hz('F1'), 0.3, 0.9);
    timpani(s, d, 0, hz('F2'), 0.85, { decay: 1.2 });
    kick(s, d, 0, 0.8, { tone: 52, decay: 0.3 });
    snare(s, d, 0, 0.85, { decay: 0.2 });
    crash(s, d, 0.004, 0.45, { decay: 1.4 });
    glock(s, d, 0.01, hz('F6'), 0.3, { decay: 1.0 });
  }),
  ...variants('barTick', 3, { kind: 'sfx', seconds: 0.12, level: -27, desc: 'tiny counting tick for the Total Win Bar (called rapidly)' }, (k) => (s, out) => {
    block(s, out, 0, [2300, 2520, 2760][k], 0.45, { decay: 0.018 });
  }),
  one('barApply', { kind: 'sfx', seconds: 2.0, level: -14, desc: 'the Total Win Bar applies: register "ka-ching" into a brass hit with snare and crash' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    register(s, d, 0, 0.7, { bell: hz('F6') });
    const t = 0.1;
    brassChord(s, d, t, ['F4', 'A4', 'C5', 'F5'], 0.5, 0.9, 1.1);
    tuba(s, d, t, hz('F2'), 0.45, 0.8);
    kick(s, d, t, 0.7, { tone: 55, decay: 0.3 });
    snare(s, d, t, 0.75, { decay: 0.2 });
    crash(s, d, t, 0.35, { decay: 1.4 });
    glock(s, d, t + 0.01, hz('C7'), 0.3, { decay: 1.1 });
  }),
];
