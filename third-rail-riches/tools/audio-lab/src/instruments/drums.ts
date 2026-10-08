/** Drums and percussion: 1930s kit, brushes, frame drum, shaker, tambourine, blocks, timpani, cymbals, gong. */
import type { Dest, Studio } from '../core/studio';

/** Felt-beater kick: soft boom with a pitch drop. */
export function kick(s: Studio, dest: Dest, t: number, vel: number, o: { tone?: number; decay?: number } = {}): number {
  const f = o.tone ?? 58;
  const T = o.decay ?? 0.45;
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.9, 0.003, T) + 0.02;
  const osc = s.osc('sine', f * 2, t, end, g);
  osc.frequency.setValueAtTime(f * 2.2, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const lp = s.filter('lowpass', 900, 0.7, dest);
  const ng = s.gain(0, lp);
  s.perc(ng.gain, t, vel * 0.12, 0.001, 0.02);
  s.noise('pink', t, t + 0.04, ng);
  return end;
}

/** Stick snare: noise through a bandpass plus a short drum-head tone. */
export function snare(s: Studio, dest: Dest, t: number, vel: number, o: { decay?: number; tone?: number } = {}): number {
  const T = o.decay ?? 0.18;
  const bp = s.filter('bandpass', 2200, 0.8, dest);
  const g = s.gain(0, bp);
  const end = s.perc(g.gain, t, vel * 0.9, 0.001, T) + 0.02;
  s.noise('white', t, end, g);
  const tg = s.gain(0, dest);
  s.perc(tg.gain, t, vel * 0.3, 0.001, 0.07);
  const osc = s.osc('triangle', (o.tone ?? 190) * 1.3, t, t + 0.1, tg);
  osc.frequency.setValueAtTime((o.tone ?? 190) * 1.3, t);
  osc.frequency.exponentialRampToValueAtTime(o.tone ?? 190, t + 0.03);
  return end;
}

/** Brush tap on snare. */
export function brushTap(s: Studio, dest: Dest, t: number, vel: number): number {
  const bp = s.filter('bandpass', 3200, 0.7, dest);
  const g = s.gain(0, bp);
  const end = s.perc(g.gain, t, vel * 0.35, 0.004, 0.16) + 0.02;
  s.noise('white', t, end, g);
  return end;
}

/** Brush swish: slow swell and fade of band-passed noise over `dur` seconds. */
export function brushSwish(s: Studio, dest: Dest, t: number, dur: number, vel: number): number {
  const bp = s.filter('bandpass', 3800, 0.6, dest);
  bp.frequency.setValueAtTime(3000, t);
  bp.frequency.linearRampToValueAtTime(4600, t + dur * 0.6);
  bp.frequency.linearRampToValueAtTime(3400, t + dur);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.1, t + dur * 0.45);
  g.gain.linearRampToValueAtTime(vel * 0.02, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.05);
  s.noise('pink', t, t + dur + 0.06, g);
  return t + dur + 0.06;
}

/** Inharmonic square partials (classic cymbal recipe). */
export function metal(s: Studio, dest: Dest, t: number, base: number, t60: number, vel: number, hp = 6000, attack = 0.001): number {
  const f = s.filter('highpass', hp, 0.8, dest);
  const bp = s.filter('peaking', hp * 1.6, 1.2, f, 5);
  const g = s.gain(0, bp);
  const end = s.perc(g.gain, t, vel * 0.12, attack, t60) + 0.02;
  for (const r of [1, 1.483, 1.932, 2.546, 2.63, 3.897]) s.osc('square', base * r, t, end, g);
  return end;
}

export function hat(s: Studio, dest: Dest, t: number, vel: number, open = false): number {
  const T = open ? 0.45 : 0.06;
  const end = metal(s, dest, t, 320, T, vel * 0.8, 7000);
  const hp = s.filter('highpass', 8000, 0.7, dest);
  const g = s.gain(0, hp);
  s.perc(g.gain, t, vel * 0.25, 0.001, T * 0.8);
  s.noise('white', t, end, g);
  return end;
}

/** Ride / sizzle cymbal "ting". */
export function ride(s: Studio, dest: Dest, t: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? 1.1;
  const end = metal(s, dest, t, 410, T, vel * 0.5, 5200);
  // bell ping
  const g = s.gain(0, dest);
  s.perc(g.gain, t, vel * 0.03, 0.001, T * 0.5);
  s.osc('sine', 3150, t, end, g);
  s.osc('sine', 4720, t, end, s.gain(0.5, g));
  const hp = s.filter('highpass', 6500, 0.7, dest);
  const ng = s.gain(0, hp);
  s.perc(ng.gain, t, vel * 0.07, 0.001, 0.12);
  s.noise('white', t, t + 0.2, ng);
  return end;
}

export function crash(s: Studio, dest: Dest, t: number, vel: number, o: { decay?: number; hp?: number } = {}): number {
  const T = o.decay ?? 2.6;
  const end = metal(s, dest, t, 340, T, vel * 0.5, o.hp ?? 3800, 0.002);
  const hp = s.filter('highpass', (o.hp ?? 3800) * 0.9, 0.6, dest);
  const g = s.gain(0, hp);
  s.perc(g.gain, t, vel * 0.5, 0.003, T * 0.85);
  s.noise('white', t, end, g);
  const lp = s.filter('bandpass', 1400, 0.8, dest);
  const g2 = s.gain(0, lp);
  s.perc(g2.gain, t, vel * 0.18, 0.002, 0.25);
  s.noise('pink', t, t + 0.4, g2);
  return end;
}

/** Woodblock / temple block: hollow resonant tok. */
export function block(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? 0.09;
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.5, 0.0008, T) + 0.02;
  const osc = s.osc('sine', f * 1.08, t, end, g);
  osc.frequency.setValueAtTime(f * 1.08, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.012);
  s.osc('sine', f * 2.41, t, t + T * 0.5, s.gain(0.25, g));
  const bp = s.filter('bandpass', f * 1.8, 2.5, dest);
  const ng = s.gain(0, bp);
  s.perc(ng.gain, t, vel * 0.3, 0.0005, 0.012);
  s.noise('white', t, t + 0.02, ng);
  return end;
}

/** Clock escapement tick (hi) / tock (lo). */
export function clockTick(s: Studio, dest: Dest, t: number, vel: number, tock = false): number {
  const f = tock ? 1650 : 2350;
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.3, 0.0004, 0.035) + 0.01;
  s.osc('sine', f, t, end, g);
  s.osc('sine', f * 1.73, t, end, s.gain(0.5, g));
  s.osc('sine', f * 0.52, t, end, s.gain(0.35, g));
  const hp = s.filter('bandpass', f * 1.5, 1.5, dest);
  const ng = s.gain(0, hp);
  s.perc(ng.gain, t, vel * 0.4, 0.0003, 0.008);
  s.noise('white', t, t + 0.012, ng);
  return end;
}

/** Timpani: tuned membrane modes with a small pitch settle and mallet thump. */
export function timpani(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? 2.2;
  const g = s.gain(1, dest);
  let end = t;
  const modes: [number, number, number][] = [[1, 1, T], [1.504, 0.5, T * 0.7], [1.742, 0.25, T * 0.5], [2.0, 0.28, T * 0.45], [2.245, 0.12, T * 0.3]];
  for (const [r, a, t60] of modes) {
    const pg = s.gain(0, g);
    const e = s.perc(pg.gain, t, a * vel * 0.4, 0.004, t60) + 0.02;
    const osc = s.osc('sine', f * r * 1.03, t, e, pg);
    osc.frequency.setTargetAtTime(f * r, t, 0.05);
    end = Math.max(end, e);
  }
  const lp = s.filter('lowpass', 400, 0.8, dest);
  const ng = s.gain(0, lp);
  s.perc(ng.gain, t, vel * 0.5, 0.002, 0.06);
  s.noise('brown', t, t + 0.1, ng);
  return end;
}

/** Timpani roll with crescendo from v0 to v1. */
export function timpaniRoll(s: Studio, dest: Dest, t: number, dur: number, f: number, v0: number, v1: number, rate = 18): number {
  let end = t;
  const n = Math.max(2, Math.floor(dur * rate));
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const jitter = (s.rng.next() - 0.5) * 0.008;
    end = Math.max(end, timpani(s, dest, Math.max(0, t + (i / rate) + jitter), f, (v0 + (v1 - v0) * x) * (0.85 + s.rng.next() * 0.15), { decay: 1.2 }));
  }
  return end;
}

/** Gong / tam-tam: many inharmonic partials with a slow bloom. */
export function gong(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? 5;
  const g = s.gain(1, dest);
  let end = t;
  const rng = s.rng.fork(7);
  for (let i = 0; i < 18; i++) {
    const r = 1 + i * 0.73 + rng.next() * 0.4;
    const pg = s.gain(0, g);
    const a = 1 / (1 + i * 0.5);
    const attack = 0.01 + i * 0.03;
    const e = s.perc(pg.gain, t, a * vel * 0.12, attack, T * (1 - i * 0.03)) + 0.05;
    s.osc('sine', f * r, t, e, pg, (rng.next() - 0.5) * 20);
    end = Math.max(end, e);
  }
  const lp = s.filter('lowpass', 600, 0.7, dest);
  const ng = s.gain(0, lp);
  s.perc(ng.gain, t, vel * 0.4, 0.003, 0.2);
  s.noise('brown', t, t + 0.3, ng);
  return end;
}

/**
 * Frame drum / bodhran: goatskin boom with a pitch drop plus the tipper's click. Muted strokes
 * (hand pressed on the skin) are higher, drier and clickier.
 */
export function frameDrum(s: Studio, dest: Dest, t: number, vel: number, o: { tone?: number; decay?: number; muted?: boolean; click?: number } = {}): number {
  const muted = o.muted ?? false;
  const f = o.tone ?? (muted ? 150 : 84);
  const T = o.decay ?? (muted ? 0.13 : 0.45);
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.8, 0.002, T) + 0.03;
  const osc = s.osc('sine', f * 1.35, t, end, g);
  osc.frequency.setValueAtTime(f * 1.35, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.035);
  // second membrane mode
  const g2 = s.gain(0, dest);
  s.perc(g2.gain, t, vel * 0.2, 0.002, T * 0.4);
  const o2 = s.osc('sine', f * 1.59 * 1.15, t, end, g2);
  o2.frequency.setValueAtTime(f * 1.59 * 1.15, t);
  o2.frequency.exponentialRampToValueAtTime(f * 1.59, t + 0.03);
  // tipper on skin
  const bp = s.filter('bandpass', muted ? 1700 : 1150, 0.9, dest);
  const ng = s.gain(0, bp);
  s.perc(ng.gain, t, vel * (o.click ?? 0.3), 0.0008, muted ? 0.03 : 0.045);
  s.noise('pink', t, t + 0.08, ng);
  // low air thump
  const lp = s.filter('lowpass', 260, 0.7, dest);
  const tg = s.gain(0, lp);
  s.perc(tg.gain, t, vel * 0.3, 0.001, 0.06);
  s.noise('brown', t, t + 0.1, tg);
  return end;
}

/** Shaker: a short swell of bright noise (seeds hitting the shell). */
export function shaker(s: Studio, dest: Dest, t: number, vel: number, o: { len?: number; bright?: number } = {}): number {
  const L = o.len ?? 0.07;
  const b = o.bright ?? 1;
  const hp = s.filter('highpass', 4000 * b, 0.7, dest);
  const pk = s.filter('peaking', 7200 * b, 1, hp, 4);
  const g = s.gain(0, pk);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + L * 0.35);
  g.gain.setTargetAtTime(0, t + L * 0.4, L * 0.22);
  s.noise('white', t, t + L * 1.8, g);
  return t + L * 1.8;
}

/** Tambourine: a jingle of small zils plus a light skin tap. */
export function tambourine(s: Studio, dest: Dest, t: number, vel: number, o: { decay?: number } = {}): number {
  const T = o.decay ?? 0.2;
  let end = t;
  for (let k = 0; k < 3; k++) {
    const tt = t + k * 0.005 + s.rng.next() * 0.004;
    end = Math.max(end, metal(s, dest, tt, 1180 + k * 97, T, vel * (1 - k * 0.2), 5600));
  }
  const hp = s.filter('highpass', 7000, 0.7, dest);
  const g = s.gain(0, hp);
  s.perc(g.gain, t, vel * 0.35, 0.001, T * 0.7);
  s.noise('white', t, t + T, g);
  const bp = s.filter('bandpass', 900, 1.2, dest);
  const sg = s.gain(0, bp);
  s.perc(sg.gain, t, vel * 0.15, 0.001, 0.03);
  s.noise('pink', t, t + 0.05, sg);
  return end;
}
