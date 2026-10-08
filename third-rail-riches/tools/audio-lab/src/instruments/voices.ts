/**
 * Cartoon voices for the subway regulars (alley cat, pigeon, Officer Bulldog, Rivets the rat,
 * Conductor Casey) and the rush-hour crowd. All synthesised: glottal sources through moving formants.
 */
import type { Dest, Studio } from '../core/studio';
import { formantVoice } from './fx';

/** Alley-cat "mee-ow": nasal onset, rising then falling pitch, formants opening "ee" to "ow". */
export function meow(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number; len?: number } = {}): number {
  const p = o.pitch ?? 1;
  const L = o.len ?? 0.52;
  const hp = s.filter('highpass', 300, 0.7, dest);
  formantVoice(s, hp, t, L,
    [[0, 520 * p], [0.25, 700 * p], [0.55, 760 * p], [1, 470 * p]],
    [[0, 320, 1700], [0.2, 420, 2300], [0.55, 820, 1450], [0.85, 620, 950], [1, 380, 800]],
    vel * 0.42, 0.05, 0.02);
  return t + L + 0.03;
}

/** Pigeon "croo-ROO-coo": a soft, hollow throat warble in three swells. */
export function coo(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number } = {}): number {
  const p = o.pitch ?? 1;
  const g = s.gain(0, dest);
  const sylls: Array<[number, number, number, number]> = [[0, 0.16, 0.6, 1], [0.2, 0.28, 1, 1.18], [0.52, 0.2, 0.7, 0.92]];
  g.gain.setValueAtTime(0, t);
  for (const [st, len, a] of sylls) {
    g.gain.setValueAtTime(0, t + st);
    g.gain.linearRampToValueAtTime(vel * 0.4 * a, t + st + len * 0.35);
    g.gain.linearRampToValueAtTime(0, t + st + len);
  }
  const end = t + 0.78;
  const lp = s.filter('lowpass', 900, 1.2, g);
  const osc = s.osc('triangle', 330 * p, t, end, lp);
  const sub = s.osc('sine', 330 * p, t, end, s.gain(0.8, g));
  for (const node of [osc, sub]) {
    node.frequency.setValueAtTime(300 * p, t);
    for (const [st, len, , r] of sylls) {
      node.frequency.setValueAtTime(300 * p * r * 0.94, t + st);
      node.frequency.linearRampToValueAtTime(300 * p * r * 1.06, t + st + len * 0.4);
      node.frequency.linearRampToValueAtTime(300 * p * r * 0.9, t + st + len);
    }
    // throat flutter
    s.osc('sine', 23, t, end, s.gain(9 * p, node.frequency));
  }
  const am = s.gain(0, g.gain);
  s.osc('sine', 23, t, end, s.gain(vel * 0.08, am));
  return end + 0.02;
}

/** Officer Bulldog "WOOF-woof": gruff barks, a chesty growl source with a rough flutter. */
export function woof(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number; double?: boolean } = {}): number {
  const p = o.pitch ?? 1;
  const bark = (tt: number, v: number, pp: number) => {
    const pre = s.gain(1, dest);
    const clip = s.shaper(s.softClip(2.5), pre);
    const flutter = s.gain(0.65, clip);
    s.osc('square', 42, tt, tt + 0.26, s.filter('lowpass', 200, 0.7, s.gain(0.35, flutter.gain)));
    formantVoice(s, flutter, tt + 0.01, 0.2,
      [[0, 170 * pp], [0.25, 240 * pp], [1, 140 * pp]],
      [[0, 380, 900], [0.3, 680, 1150], [1, 420, 850]],
      v * 0.55, 0.012, 0.01);
    // "w" puff and chest thump
    const bp = s.filter('bandpass', 600, 1, dest);
    const ng = s.gain(0, bp);
    s.perc(ng.gain, tt, v * 0.35, 0.004, 0.05);
    s.noise('pink', tt, tt + 0.08, ng);
    const lp = s.filter('lowpass', 180, 0.7, dest);
    const lg = s.gain(0, lp);
    s.perc(lg.gain, tt + 0.01, v * 0.4, 0.006, 0.08);
    s.noise('brown', tt, tt + 0.12, lg);
    return tt + 0.24;
  };
  let end = bark(t, vel, p);
  if (o.double ?? true) end = bark(t + 0.26, vel * 0.7, p * 0.9);
  return end;
}

/** Rivets the rat: two quick high squeaks with a fast nervous vibrato. */
export function squeak(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number; count?: number } = {}): number {
  const p = o.pitch ?? 1;
  const n = o.count ?? 2;
  let end = t;
  for (let i = 0; i < n; i++) {
    const tt = t + i * 0.13;
    const L = i === n - 1 ? 0.12 : 0.08;
    const g = s.gain(0, dest);
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(vel * 0.22, tt + 0.008);
    g.gain.setValueAtTime(vel * 0.22, tt + L * 0.6);
    g.gain.linearRampToValueAtTime(0, tt + L);
    const f0 = (i % 2 ? 3300 : 2900) * p;
    const osc = s.osc('sine', f0, tt, tt + L + 0.01, g);
    const h = s.osc('triangle', f0, tt, tt + L + 0.01, s.gain(0.25, g));
    for (const node of [osc, h]) {
      node.frequency.setValueAtTime(f0 * 0.82, tt);
      node.frequency.exponentialRampToValueAtTime(f0 * 1.08, tt + L * 0.4);
      node.frequency.exponentialRampToValueAtTime(f0 * 0.9, tt + L);
      s.osc('sine', 38, tt, tt + L + 0.01, s.gain(f0 * 0.03, node.frequency));
    }
    end = tt + L + 0.01;
  }
  return end;
}

/** A deep jolly "HO-ho!" (Conductor Casey): breathy "h", a round "oh" vowel, the second one lower. */
export function hoHo(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number } = {}): number {
  const p = o.pitch ?? 1;
  const syl = (tt: number, f: number, L: number, v: number) => {
    const hb = s.filter('bandpass', 900, 0.8, dest);
    const hg = s.gain(0, hb);
    hg.gain.setValueAtTime(0, tt);
    hg.gain.linearRampToValueAtTime(v * 0.12, tt + 0.02);
    hg.gain.linearRampToValueAtTime(0, tt + 0.06);
    s.noise('white', tt, tt + 0.07, hg);
    formantVoice(s, dest, tt + 0.04, L, [[0, f * 1.06], [0.3, f], [1, f * 0.88]], [[0, 520, 900], [0.5, 460, 820], [1, 400, 760]], v * 0.5, 0.025, 0.02);
  };
  syl(t, 165 * p, 0.17, vel);
  syl(t + 0.22, 138 * p, 0.24, vel * 0.85);
  return t + 0.52;
}

/**
 * Crowd murmur bed: a handful of babbling "talkers" (noise and buzz through syllable-rate moving
 * formants) spread across the stereo field. Level-steady over [t, t+dur].
 */
export function crowdMurmur(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { talkers?: number; excite?: number } = {}): number {
  const n = o.talkers ?? 6;
  const r = s.rng.fork(Math.floor(t * 101) + n);
  const ex = o.excite ?? 1;
  for (let k = 0; k < n; k++) {
    const pan = s.panner(-0.8 + (1.6 * k) / Math.max(1, n - 1), dest);
    const g = s.gain(0, pan);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.5 / Math.sqrt(n), t + 0.3);
    g.gain.setValueAtTime(vel * 0.5 / Math.sqrt(n), t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    // syllables: amplitude chops at 3..6 Hz
    const syl = s.gain(0.5, g);
    const sr = r.range(3.2, 5.8) * ex;
    s.osc('sine', sr, t, t + dur, s.gain(0.45, syl.gain));
    s.osc('sine', sr * 1.73, t, t + dur, s.gain(0.2, syl.gain));
    const f1 = s.filter('bandpass', r.range(450, 750), 3, syl);
    const f2 = s.filter('bandpass', r.range(1200, 2000), 4, syl);
    s.lfo(f1.frequency, r.range(2, 4), 180, t, t + dur);
    s.lfo(f2.frequency, r.range(2.5, 5), 450, t, t + dur, 'triangle');
    const src = s.gain(1);
    src.connect(f1);
    src.connect(f2);
    const f0 = r.range(110, 230);
    const buzz = s.osc('sawtooth', f0, t, t + dur, s.gain(0.3, src));
    s.lfo(buzz.frequency, r.range(1.5, 3), f0 * 0.15, t, t + dur);
    s.noise('pink', t, t + dur, s.gain(0.5, src));
  }
  return t + dur;
}
