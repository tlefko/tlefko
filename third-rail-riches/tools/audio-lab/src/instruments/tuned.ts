/** Struck/plucked tuned percussion: music box, celesta, marimba, xylophone, glockenspiel, bells, ship's bell. */
import type { Dest, Studio } from '../core/studio';

type Partial = [ratio: number, amp: number, t60: number];

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Sum of decaying sine partials. Returns the time the voice ends. */
export function additive(s: Studio, dest: Dest, t: number, f: number, amp: number, parts: Partial[], attack = 0.002, detuneCents = 0): number {
  let end = t;
  const g = s.gain(1, dest);
  for (const [r, a, t60] of parts) {
    const fr = f * r;
    if (fr > 15000 || a <= 0) continue;
    const pg = s.gain(0, g);
    const stop = s.perc(pg.gain, t, a * amp, attack, t60) + 0.02;
    s.osc('sine', fr, t, stop, pg, detuneCents);
    end = Math.max(end, stop);
  }
  return end;
}

function tick(s: Studio, dest: Dest, t: number, level: number, hp = 3500, t60 = 0.012) {
  const f = s.filter('highpass', hp, 0.7, dest);
  const g = s.gain(0, f);
  s.perc(g.gain, t, level, 0.0005, t60);
  s.noise('white', t, t + t60 + 0.01, g);
}

/** Comb-tine music box: cantilever partials (1 : 6.27 : 17.55) plus a slow beating pair. */
export function musicBox(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number; bright?: number } = {}): number {
  const decay = o.decay ?? clamp(3.2 * Math.sqrt(440 / f), 0.9, 3.6);
  const b = o.bright ?? 1;
  const end = additive(s, dest, t, f, vel * 0.3, [
    [1, 1, decay],
    [1.0016, 0.35, decay * 0.85],
    [2, 0.05, decay * 0.3],
    [6.27, 0.2 * b, 0.2],
    [17.55, 0.06 * b, 0.05],
  ], 0.0012);
  tick(s, dest, t, 0.035 * vel * b, 4000, 0.01);
  return end;
}

/** Celesta: soft felt hammer on steel bars over wooden resonators. */
export function celesta(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? clamp(2.4 * Math.sqrt(440 / f), 0.8, 3.2);
  const end = additive(s, dest, t, f, vel * 0.3, [
    [1, 1, T],
    [2, 0.22, T * 0.35],
    [3, 0.07, T * 0.18],
    [4.18, 0.04, 0.12],
  ], 0.0035);
  // hammer thud
  const lp = s.filter('lowpass', 700, 0.7, dest);
  const g = s.gain(0, lp);
  s.perc(g.gain, t, 0.05 * vel, 0.001, 0.03);
  s.noise('pink', t, t + 0.05, g);
  return end;
}

export function marimba(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? clamp(0.9 * Math.sqrt(262 / f), 0.25, 1.3);
  const end = additive(s, dest, t, f, vel * 0.32, [
    [1, 1, T],
    [3.93, 0.28, T * 0.2],
    [9.2, 0.07, 0.03],
  ], 0.0012);
  const lp = s.filter('bandpass', f * 2.5, 1, dest);
  const g = s.gain(0, lp);
  s.perc(g.gain, t, 0.1 * vel, 0.0005, 0.012);
  s.noise('pink', t, t + 0.02, g);
  return end;
}

export function xylophone(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? clamp(0.55 * Math.sqrt(523 / f), 0.18, 0.8);
  const end = additive(s, dest, t, f, vel * 0.3, [
    [1, 1, T],
    [3.0, 0.3, T * 0.35],
    [6.1, 0.1, 0.06],
    [10.3, 0.04, 0.02],
  ], 0.0008);
  tick(s, dest, t, 0.09 * vel, 2500, 0.01);
  return end;
}

export function glock(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? clamp(2.2 * Math.sqrt(1047 / f), 0.8, 3);
  const end = additive(s, dest, t, f, vel * 0.22, [
    [1, 1, T],
    [2.76, 0.3, T * 0.35],
    [5.4, 0.16, T * 0.15],
    [8.93, 0.06, 0.08],
  ], 0.0006);
  tick(s, dest, t, 0.05 * vel, 5000, 0.006);
  return end;
}

/** Church/clock bell: hum, prime, minor-third tierce, quint, nominal... slightly detuned for beating. */
export function bell(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number; bright?: number } = {}): number {
  const T = o.decay ?? 4;
  const b = o.bright ?? 1;
  const end = additive(s, dest, t, f, vel * 0.2, [
    [0.5, 0.45, T * 1.3],
    [1.0, 1, T],
    [1.003, 0.4, T * 0.9],
    [1.19, 0.55, T * 0.7],
    [1.5, 0.28, T * 0.5],
    [2.0, 0.7 * b, T * 0.45],
    [2.52, 0.25 * b, T * 0.3],
    [3.01, 0.22 * b, T * 0.22],
    [4.07, 0.12 * b, T * 0.12],
    [5.43, 0.07 * b, T * 0.08],
  ], 0.0015);
  tick(s, dest, t, 0.05 * vel * b, 1800, 0.02);
  return end;
}

/** Dark FM bell (inharmonic ratio) with decaying modulation index. */
export function fmBell(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number; ratio?: number; index?: number } = {}): number {
  const T = o.decay ?? 3;
  const ratio = o.ratio ?? 1.41;
  const index = o.index ?? 3.5;
  const g = s.gain(0, dest);
  const stop = s.perc(g.gain, t, vel * 0.3, 0.002, T) + 0.05;
  const car = s.osc('sine', f, t, stop, g);
  const modGain = s.gain(0, car.frequency);
  modGain.gain.setValueAtTime(index * f * ratio, t);
  modGain.gain.setTargetAtTime(index * f * ratio * 0.08, t, T / 5);
  s.osc('sine', f * ratio, t, stop, modGain);
  return stop;
}

/**
 * Brass ship's bell: a small, bright bell (weak hum, strong nominal) with the clapper's metallic
 * tick. `double` rings the traditional pair ("ding-ding") with the second stroke a little softer.
 */
export function shipBell(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number; bright?: number; double?: number } = {}): number {
  const T = o.decay ?? 2.8;
  const b = o.bright ?? 1.15;
  const strike = (tt: number, v: number) => {
    const e = additive(s, dest, tt, f, v * 0.2, [
      [0.5, 0.18, T * 1.1],
      [1.0, 1, T],
      [1.004, 0.45, T * 0.9],
      [1.2, 0.5, T * 0.65],
      [1.5, 0.3, T * 0.45],
      [2.0, 0.75 * b, T * 0.5],
      [2.51, 0.3 * b, T * 0.3],
      [3.03, 0.25 * b, T * 0.2],
      [4.1, 0.14 * b, T * 0.1],
      [5.4, 0.08 * b, T * 0.06],
    ], 0.0008);
    const bp = s.filter('bandpass', Math.min(9000, f * 3.3), 2.5, dest);
    const g = s.gain(0, bp);
    s.perc(g.gain, tt, v * 0.3, 0.0003, 0.012);
    s.noise('white', tt, tt + 0.02, g);
    return e;
  };
  let end = strike(t, vel);
  if (o.double) end = Math.max(end, strike(t + o.double, vel * 0.78));
  return end;
}
