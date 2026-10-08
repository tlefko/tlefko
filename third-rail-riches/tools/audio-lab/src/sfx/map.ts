/**
 * The live subway map: split-flap departure boards flipping, trains stepping station to station,
 * signals and points, security checks (alarm, ALL CLEAR, INCIDENT), two trains crashing (rush, impact,
 * the wreck scattering coins into a pile, the x2 slam) and a route win tracing along a line.
 */
import { hz } from '../core/notes';
import { block, crash, kick, snare } from '../instruments/drums';
import { additive, celesta, glock } from '../instruments/tuned';
import { brass, tuba } from '../instruments/winds';
import { coinClink, impact, sample, whoosh } from '../instruments/fx';
import { coinSpill, doubloon, grainRattle, ironClank, rumble } from '../instruments/foley';
import {
  arc, crackle, electricBell, electricHum, motorWhine, railClack, steamHiss, ticketPunch, trackRumble, zap,
} from '../instruments/train';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, tailFade, variants, withRoom } from './common';

// ---------------------------------------------------------------- local voices

/**
 * One split-flap card snapping over: a crisp, thin plastic-and-tin "tk" (bright noise click through a
 * narrow band), a tiny card-body resonance and a whisper of the drum spindle.
 */
function flapTick(s: Studio, dest: Dest, t: number, vel: number, p = 1): number {
  const bp = s.filter('bandpass', 3600 * p, 2.2, dest);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.9, 0.0002, 0.007);
  s.noise('white', t, t + 0.014, g);
  const hp = s.filter('highpass', 7000, 0.7, dest);
  const hg = s.gain(0, hp);
  s.perc(hg.gain, t, vel * 0.22, 0.0001, 0.003);
  s.noise('white', t, t + 0.006, hg);
  block(s, dest, t + 0.0006, 1450 * p, vel * 0.28, { decay: 0.009 });
  return t + 0.03;
}

/** Glass breaking: a bright noise burst plus a spray of short, inharmonic shards tinkling down. */
function glassShatter(s: Studio, dest: Dest, t: number, span: number, count: number, vel: number): number {
  const r = s.rng.fork(Math.round(t * 1000) + count * 17);
  const hp = s.filter('highpass', 3200, 0.7, dest);
  const g = s.gain(0, hp);
  s.perc(g.gain, t, vel * 0.55, 0.0005, 0.12);
  s.noise('white', t, t + 0.16, g);
  let end = t + 0.16;
  for (let i = 0; i < count; i++) {
    const tt = t + 0.004 + Math.pow(r.next(), 1.7) * span;
    const x = (tt - t) / span;
    const pan = s.panner(r.range(-0.7, 0.7), dest);
    const f = r.range(2600, 7800);
    const T = r.range(0.04, 0.22);
    end = Math.max(end, additive(s, pan, tt, f, vel * r.range(0.25, 0.8) * (1 - 0.6 * x) * 0.6, [[1, 1, T], [1.61, 0.6, T * 0.7], [2.37, 0.35, T * 0.45]], 0.0002));
    const cb = s.filter('bandpass', Math.min(12000, f * 1.6), 2, pan);
    const cg = s.gain(0, cb);
    s.perc(cg.gain, tt, vel * 0.3 * (1 - 0.5 * x), 0.0002, 0.006);
    s.noise('white', tt, tt + 0.012, cg);
  }
  return end;
}

/** Bent metal crunching: dense, gritty grains with a resonant groan sliding down. */
function metalCrunch(s: Studio, dest: Dest, t: number, dur: number, vel: number): number {
  grainRattle(s, dest, t, dur, vel * 1.2, { density: 420, center: 1700, decay: 0.3 });
  grainRattle(s, dest, t + 0.01, dur * 0.8, vel * 0.7, { density: 300, center: 3800, decay: 0.25 });
  const bp = s.filter('bandpass', 820, 6, dest);
  bp.frequency.setValueAtTime(820, t);
  bp.frequency.exponentialRampToValueAtTime(380, t + dur);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 1.4, t + 0.02);
  g.gain.setTargetAtTime(0, t + 0.05, dur / 3);
  const clip = s.shaper(s.softClip(3), g);
  const saw = s.osc('sawtooth', 73, t, t + dur + 0.05, s.gain(0.4, clip));
  s.noise('white', t, t + dur + 0.05, s.gain(0.25, s.filter('lowpass', 400, 0.7, s.gain(30, saw.frequency))));
  s.noise('pink', t, t + dur + 0.05, s.gain(0.6, clip));
  return t + dur + 0.05;
}

/**
 * A station klaxon: a rasping reed horn (saw + square through a throaty formant and a soft clip),
 * gliding up into each note the way an electric "ah-OO-gah" does.
 */
function klaxon(s: Studio, dest: Dest, t: number, dur: number, f: number, vel: number): number {
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.32, t + 0.018);
  g.gain.setValueAtTime(vel * 0.32, t + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = s.filter('lowpass', 2400, 0.8, g);
  const pk = s.filter('peaking', 1150, 2.5, lp, 7);
  const clip = s.shaper(s.softClip(2.4), s.filter('highpass', 220, 0.7, pk));
  for (const [type, m, a] of [['sawtooth', 1, 0.45], ['square', 1.003, 0.3], ['sawtooth', 2, 0.12]] as const) {
    const o = s.osc(type, f * m * 0.9, t, t + dur + 0.02, s.gain(a, clip));
    o.frequency.setValueAtTime(f * m * 0.9, t);
    o.frequency.exponentialRampToValueAtTime(f * m, t + 0.035);
    s.osc('sine', 33, t, t + dur + 0.02, s.gain(f * m * 0.006, o.frequency));
  }
  return t + dur + 0.02;
}

/** A low "denied" buzzer: two detuned square tones beating through a boxy speaker. */
function buzzer(s: Studio, dest: Dest, t: number, dur: number, f: number, vel: number): number {
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.012);
  g.gain.setValueAtTime(vel * 0.3, t + dur - 0.05);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = s.filter('lowpass', 1500, 1, g);
  const pk = s.filter('peaking', 600, 2, lp, 5);
  const hp = s.filter('highpass', 90, 0.7, pk);
  s.osc('square', f, t, t + dur + 0.02, s.gain(0.5, hp));
  s.osc('square', f * 1.012, t, t + dur + 0.02, s.gain(0.4, hp));
  s.osc('sawtooth', f * 0.5, t, t + dur + 0.02, s.gain(0.35, hp));
  return t + dur + 0.02;
}

/** A rubber stamp landing on the ticket: a dull felt-and-wood thud with a paper slap. */
function stamp(s: Studio, dest: Dest, t: number, vel: number, o: { bright?: number } = {}): number {
  const b = o.bright ?? 1;
  kick(s, dest, t, vel * 0.8, { tone: 70, decay: 0.12 });
  block(s, dest, t, 520 * b, vel * 0.55, { decay: 0.035 });
  block(s, dest, t + 0.001, 260 * b, vel * 0.4, { decay: 0.05 });
  const bp = s.filter('bandpass', 1800 * b, 0.9, dest);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.6, 0.0006, 0.04);
  s.noise('pink', t, t + 0.06, g);
  return t + 0.15;
}

/** A bolt or rivet pinging off the rails: a small, bright, quickly damped clank, sometimes bouncing. */
function bolt(s: Studio, dest: Dest, t: number, vel: number, f: number, bounce: boolean): number {
  let end = ironClank(s, dest, t, vel * 0.5, { f, decay: 0.06 });
  if (bounce) end = Math.max(end, ironClank(s, dest, t + 0.07, vel * 0.25, { f: f * 1.04, decay: 0.04 }));
  return end;
}

// ---------------------------------------------------------------- definitions

export const MAP_SFX: SfxDef[] = [
  // the departure boards
  ...variants('flapRattle', 4, { kind: 'sfx', seconds: 0.4, level: -26, desc: 'a station departure board flips: a light, crisp burst of split-flap cards clattering (4 takes; plays per station)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.06);
    const r = s.rng.fork(101 + i * 7);
    const p = [1, 1.06, 0.95, 1.1][i];
    const n = [10, 9, 11, 10][i];
    let t = 0.003;
    for (let k = 0; k < n; k++) {
      const x = k / (n - 1);
      // flaps run fast then ease off as the drum slows
      const vel = (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, x * 1.3))) * r.range(0.75, 1);
      flapTick(s, s.panner(r.range(-0.25, 0.25), d), t, vel, p * r.range(0.93, 1.08));
      t += 0.019 + 0.012 * x * x + r.range(-0.003, 0.004);
    }
    // a soft whirr of the spindle under the flaps
    const bp = s.filter('bandpass', 2600 * p, 0.8, d);
    const g = s.gain(0, bp);
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.05, 0.03);
    g.gain.linearRampToValueAtTime(0, t);
    s.noise('pink', 0, t + 0.02, g);
  }),
  ...variants('flapSettle', 3, { kind: 'sfx', seconds: 0.17, level: -23, desc: 'the last flap lands on the new symbol: a satisfying wood-and-tin clack with a tiny rebound (3 takes)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    const p = [1, 1.08, 0.93][i];
    flapTick(s, d, 0, 0.9, p * 1.05);
    block(s, d, 0.001, 980 * p, 0.85, { decay: 0.035 });
    ironClank(s, d, 0.0015, 0.4, { f: 1500 * p, decay: 0.045 });
    kick(s, d, 0.001, 0.22, { tone: 110 * p, decay: 0.04 });
    // the card rebounds once against its stop
    flapTick(s, d, 0.021 + i * 0.002, 0.3, p * 1.12);
    block(s, d, 0.022 + i * 0.002, 1160 * p, 0.22, { decay: 0.02 });
  }),

  // trains stepping along the line
  ...variants('trainStep', 3, { kind: 'sfx', seconds: 0.2, level: -27, desc: 'a train moves one station: a quick, quiet clickety-clack (3 takes)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    const p = [1, 1.05, 0.96][i];
    const gap = [0.062, 0.058, 0.066][i];
    railClack(s, s.panner(-0.12, d), 0.004, 0.75, { pitch: p * 1.03, ring: 0.6, thump: 0.7 });
    railClack(s, s.panner(-0.05, d), 0.004 + gap, 0.55, { pitch: p, ring: 0.5, thump: 0.6 });
    railClack(s, s.panner(0.08, d), 0.004 + gap + 0.045, 0.85, { pitch: p * 0.97, ring: 0.7, thump: 0.8 });
    trackRumble(s, d, 0, 0.17, 0.12, { fadeIn: 0.02, fadeOut: 0.08 });
  }),

  // signals and points
  one('signalSwitch', { kind: 'sfx', seconds: 0.8, level: -19, desc: 'a Signal changes aspect: relay click, the lamp humming up, then the heavy points sliding over and locking with a clunk' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    // relay
    block(s, d, 0, 3100, 0.5, { decay: 0.01 });
    ironClank(s, d, 0.002, 0.35, { f: 1900, decay: 0.03 });
    block(s, d, 0.016, 2500, 0.3, { decay: 0.01 });
    // the lamp: a soft electric swell and a little glint
    electricHum(s, d, 0.01, 0.3, 0.55, { f0: 100, f1: 120, bright: 1.3, fadeIn: 0.12, fadeOut: 0.14 });
    crackle(s, d, 0.02, 0.12, 4, 0.25, { lo: 3000, hi: 7000 });
    glock(s, d, 0.06, hz('A6'), 0.16, { decay: 0.5 });
    // the points: blades sliding over the chairs (grinding metal band), then locking home
    const sb = s.filter('bandpass', 900, 3, d);
    sb.frequency.setValueAtTime(700, 0.2);
    sb.frequency.exponentialRampToValueAtTime(1300, 0.4);
    const sg = s.gain(0, sb);
    sg.gain.setValueAtTime(0, 0.2);
    sg.gain.linearRampToValueAtTime(0.45, 0.25);
    sg.gain.linearRampToValueAtTime(0.3, 0.38);
    sg.gain.linearRampToValueAtTime(0, 0.42);
    s.noise('white', 0.2, 0.43, sg);
    grainRattle(s, d, 0.21, 0.2, 0.25, { density: 220, center: 2600, decay: 0.4 });
    ironClank(s, d, 0.2, 0.4, { f: 520, decay: 0.08 });
    ironClank(s, d, 0.42, 0.95, { f: 330, decay: 0.16 });
    ironClank(s, d, 0.423, 0.45, { f: 860, decay: 0.07 });
    railClack(s, d, 0.421, 0.6, { pitch: 0.82 });
    kick(s, d, 0.42, 0.55, { tone: 58, decay: 0.16 });
  }),

  // security checks
  one('securityAlarm', { kind: 'sfx', seconds: 1.05, level: -17, desc: 'a Security Check: a two-tone station klaxon (hi-lo, hi-lo) and a scanner sweeping the train, a tick of the alarm bell' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.85, 1.02), 0.14, 'medium');
    // two-tone klaxon on A4 / D5 (agrees with D minor), slightly narrowed so it is tense, not shrill
    const tones = [hz('D5'), hz('A4'), hz('D5'), hz('A4')];
    tones.forEach((f, k) => klaxon(s, s.panner(k % 2 ? 0.1 : -0.1, d), k * 0.19, 0.17, f, k === 3 ? 0.85 : 1));
    // a short trill of the alarm bell under the first blast
    electricBell(s, s.gain(0.5, d), 0, 0.14, hz('A5'), 0.35);
    // scanner: a soft electronic sweep up and back, with a gentle tremolo
    const sg = s.gain(0, d);
    sg.gain.setValueAtTime(0, 0.05);
    sg.gain.linearRampToValueAtTime(0.06, 0.15);
    sg.gain.setValueAtTime(0.06, 0.72);
    sg.gain.linearRampToValueAtTime(0, 0.88);
    const am = s.gain(0.6, sg);
    s.osc('sine', 18, 0.05, 0.9, s.gain(0.4, am.gain));
    const sw = s.osc('triangle', 700, 0.05, 0.9, s.filter('lowpass', 3000, 0.7, am));
    s.ramp(sw.frequency, [[0.05, 700], [0.45, 1900], [0.85, 800]], true);
    const sb = s.filter('bandpass', 1200, 4, d);
    s.ramp(sb.frequency, [[0.05, 1200], [0.45, 4200], [0.85, 1500]], true);
    const ng = s.gain(0, sb);
    ng.gain.setValueAtTime(0, 0.05);
    ng.gain.linearRampToValueAtTime(0.18, 0.2);
    ng.gain.setValueAtTime(0.18, 0.7);
    ng.gain.linearRampToValueAtTime(0, 0.88);
    s.noise('white', 0.05, 0.9, ng);
  }),
  one('allClear', { kind: 'sfx', seconds: 0.95, level: -17, desc: 'ALL CLEAR, Delay Repay x2: a bright three-note chime climbing F, A, C and a rubber-stamp thump' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.75, 0.93), 0.18, 'medium');
    const notes = [hz('F5'), hz('A5'), hz('C6')];
    notes.forEach((f, k) => {
      const t = k * 0.085;
      glock(s, d, t, f * 2, 0.45 + k * 0.08, { decay: 0.7 });
      celesta(s, d, t, f, 0.45 + k * 0.05, { decay: 0.6 });
      additive(s, d, t, f, 0.18, [[1, 1, 0.9], [2.76, 0.3, 0.4], [5.4, 0.12, 0.2]], 0.001);
    });
    // the stamp lands on the last note, with a ticket punch "chk" and a brass blip
    const ts = 0.17;
    stamp(s, d, ts, 1, { bright: 1.15 });
    ticketPunch(s, d, ts + 0.002, 0.5);
    brass(s, d, ts, hz('F4'), 0.14, 0.45, { bright: 1.1 });
    brass(s, d, ts, hz('C5'), 0.14, 0.4, { bright: 1.1 });
    glock(s, d, ts + 0.01, hz('F7'), 0.18, { decay: 0.6 });
  }),
  one('incident', { kind: 'sfx', seconds: 1.05, level: -17, desc: 'INCIDENT, train held: a low "denied" buzzer, a heavy air-brake hiss and a dull stamp' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.85, 1.02), 0.14, 'medium');
    buzzer(s, d, 0, 0.17, hz('A2'), 0.9);
    buzzer(s, d, 0.21, 0.32, hz('A2') * 0.94, 1);
    stamp(s, d, 0.21, 0.95, { bright: 0.8 });
    tuba(s, d, 0.21, hz('D1'), 0.25, 0.5);
    // the brakes go on: a clunk and a heavy hiss sighing out
    ironClank(s, d, 0.24, 0.4, { f: 380, decay: 0.12 });
    steamHiss(s, d, 0.26, 0.6, 0.75, { bright: 0.85, attack: 0.02 });
    trackRumble(s, d, 0.2, 0.4, 0.3, { fadeIn: 0.01, fadeOut: 0.3 });
  }),

  // the crash
  one('crashRumble', { kind: 'sfx', seconds: 0.7, level: -18, desc: 'two trains closing in: a rising rush from both sides, motors screaming up, wheels hammering faster (0.6 s, plays right before crashImpact)' }, (s, out) => {
    const d = withRoom(s, out, 0.12, 'medium');
    whoosh(s, d, 0, 0.6, 0.6, { f0: 220, f1: 3200, q: 0.9, peakAt: 0.97, pan0: -0.8, pan1: -0.1, color: 'pink' });
    whoosh(s, d, 0.02, 0.58, 0.6, { f0: 260, f1: 3600, q: 0.9, peakAt: 0.97, pan0: 0.8, pan1: 0.1, color: 'pink' });
    rumble(s, d, 0, 0.55, 0.7);
    motorWhine(s, s.panner(-0.4, d), 0, 0.6, 0.9, 260, 820, { fadeOut: 0.04 });
    motorWhine(s, s.panner(0.4, d), 0, 0.6, 0.8, 310, 980, { fadeOut: 0.04 });
    let t = 0.03;
    let gap = 0.11;
    let k = 0;
    while (t < 0.56) {
      railClack(s, s.panner(k % 2 ? 0.45 : -0.45, d), t, 0.25 + t * 0.7, { pitch: 1 + t * 0.15, ring: 0.6 });
      t += gap;
      gap = Math.max(0.035, gap * 0.8);
      k++;
    }
  }),
  one('crashImpact', { kind: 'sfx', seconds: 1.75, level: -12, drive: 2.4, desc: 'two trains collide: heavy iron impact, crunching metal, glass shattering, a deep boom with a sub thump, then bolts and debris bouncing down' }, async (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.35, 1.72), 0.2, 'hall');
    // the hit
    ironClank(s, d, 0, 1, { f: 210, decay: 0.45 });
    ironClank(s, d, 0.002, 0.8, { f: 390, decay: 0.3 });
    ironClank(s, d, 0.004, 0.55, { f: 690, decay: 0.2 });
    ironClank(s, d, 0.007, 0.4, { f: 1180, decay: 0.12 });
    railClack(s, d, 0, 1, { pitch: 0.7 });
    kick(s, d, 0, 1, { tone: 48, decay: 0.45 });
    impact(s, d, 0, 0.9, { f: 42, decay: 1.2 });
    snare(s, d, 0, 0.9, { decay: 0.3 });
    crash(s, d, 0.004, 0.6, { decay: 1.3, hp: 3000 });
    const ib = await sample(s, 'impact-bass-1');
    // the sampled boom sustains for 2 s: shape it into a thump that blooms and dies with the debris
    const sub = s.gain(0.2, s.filter('lowpass', 4000, 0.7, s.filter('highpass', 35, 0.7, d)));
    sub.gain.setValueAtTime(0.2, 0.25);
    sub.gain.setTargetAtTime(0, 0.25, 0.22);
    s.play(ib, 0, sub);
    // crunching and glass
    metalCrunch(s, d, 0.01, 0.42, 0.55);
    glassShatter(s, d, 0.02, 0.55, 26, 0.75);
    // second crumple as the carriages concertina
    ironClank(s, d, 0.16, 0.55, { f: 300, decay: 0.2 });
    kick(s, d, 0.16, 0.4, { tone: 60, decay: 0.15 });
    railClack(s, d, 0.17, 0.5, { pitch: 0.85 });
    steamHiss(s, d, 0.12, 0.7, 0.35, { bright: 0.9, attack: 0.03 });
    // debris tail: bolts pinging, bits of wood and metal bouncing, a last cartoon "tink"
    const r = s.rng.fork(555);
    for (let k = 0; k < 16; k++) {
      const t = 0.25 + Math.pow(r.next(), 1.4) * 0.95;
      const x = (t - 0.25) / 0.95;
      const pan = s.panner(r.range(-0.7, 0.7), d);
      if (r.next() < 0.6) bolt(s, pan, t, (0.55 - 0.35 * x) * r.range(0.6, 1), r.range(1400, 3200), r.next() < 0.5);
      else block(s, pan, t, r.range(380, 900), (0.4 - 0.25 * x) * r.range(0.6, 1), { decay: 0.04 });
    }
    coinClink(s, s.panner(0.3, d), 1.22, 0.35, { f: 3300, bounce: true, decay: 0.25 });
  }),
  one('wreckScatter', { kind: 'sfx', seconds: 0.95, level: -18, desc: 'the wreck scatters coins and bolts: a spray of clinks flying out, jingling and tumbling into a pile' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    whoosh(s, d, 0, 0.3, 0.25, { f0: 900, f1: 3800, q: 1, peakAt: 0.3, pan0: 0, pan1: 0.4 });
    whoosh(s, d, 0.02, 0.3, 0.2, { f0: 800, f1: 3400, q: 1, peakAt: 0.3, pan0: 0, pan1: -0.4 });
    // coins flying out (spread wide), then gathering in the pile (centre)
    const r = s.rng.fork(77);
    for (let k = 0; k < 14; k++) {
      const t = 0.02 + Math.pow(r.next(), 1.3) * 0.4;
      coinClink(s, s.panner(r.range(-0.8, 0.8), d), t, r.range(0.25, 0.55), { f: r.range(2700, 4300), bounce: r.next() < 0.6, decay: r.range(0.15, 0.3) });
    }
    for (let k = 0; k < 5; k++) bolt(s, s.panner(r.range(-0.6, 0.6), d), 0.05 + r.next() * 0.35, r.range(0.3, 0.5), r.range(1600, 2800), true);
    coinSpill(s, d, 0.4, 0.3, 16, 0.6, { f: 2700 });
    // the pile settles
    kick(s, d, 0.58, 0.18, { tone: 90, decay: 0.06 });
    doubloon(s, d, 0.6, 0.45, { f: 2900, bounce: true, decay: 0.3 });
    glock(s, d, 0.6, hz('C7'), 0.12, { decay: 0.5 });
  }),
  one('crashMult', { kind: 'sfx', seconds: 0.65, level: -14, drive: 2.4, desc: 'the x2 crash multiplier slams onto the coin pile: a heavy iron-and-brass stamp with kick, snare and a coin jump' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.48, 0.63), 0.16, 'medium');
    ironClank(s, d, 0, 1, { f: 280, decay: 0.22 });
    ironClank(s, d, 0.003, 0.5, { f: 760, decay: 0.1 });
    stamp(s, d, 0, 1, { bright: 0.9 });
    kick(s, d, 0, 0.9, { tone: 50, decay: 0.3 });
    impact(s, d, 0, 0.5, { f: 46, decay: 0.45 });
    snare(s, d, 0, 0.85, { decay: 0.18 });
    for (const n of ['F3', 'C4', 'F4', 'A4']) brass(s, d, s.rng.next() * 0.006, hz(n), 0.16, 0.8, { bright: 1.25 });
    tuba(s, d, 0, hz('F1'), 0.18, 0.7);
    crash(s, d, 0.004, 0.35, { decay: 0.5 });
    // the coins jump on the pile
    coinSpill(s, d, 0.03, 0.18, 7, 0.4, { f: 2900 });
  }),

  // a route win
  one('routeTrace', { kind: 'sfx', seconds: 0.6, level: -22, desc: 'a route win lights up: a light electric zip running along the glowing line, a glint at the end' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    arc(s, s.panner(0, d), 0, 0.38, 0.35, { f0: 120, f1: 240, sweep: [700, 5200] });
    const g = s.gain(0, s.panner(0, d));
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.05, 0.04);
    g.gain.setValueAtTime(0.05, 0.3);
    g.gain.linearRampToValueAtTime(0, 0.4);
    const z = s.osc('sine', 600, 0, 0.42, g);
    s.ramp(z.frequency, [[0, 600], [0.38, 2400]], true);
    s.osc('sine', 40, 0, 0.42, s.gain(60, z.frequency));
    crackle(s, d, 0.02, 0.34, 9, 0.3, { lo: 3000, hi: 9000, spread: 0.6 });
    zap(s, s.gain(0.35, d), 0.36, 0.25, { size: 0.25, pitch: 1.6 });
    glock(s, d, 0.37, hz('C7'), 0.18, { decay: 0.4 });
  }),
];
