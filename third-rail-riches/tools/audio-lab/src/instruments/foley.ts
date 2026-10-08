/**
 * Physical foley for the cove, all synthesised: creaking timber, rope and hinges, barrels and
 * chests, gunpowder (grains, match, fuse), cannon, splinters, gold doubloons, tankards and grog,
 * and the sea itself.
 */
import type { Dest, Studio } from '../core/studio';
import { additive } from './tuned';
import { block } from './drums';

type Pts = Array<[number, number]>;

/** Piecewise-linear lookup in [x, y] points (x ascending). */
function lerpPts(pts: Pts, x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-9, x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

// ---------------------------------------------------------------- creaks

export interface CreakOptions {
  /** Stick-slip pulse rate over the gesture: [time 0..1, pulses per second]. */
  rate?: Pts;
  /** Amplitude envelope: [time 0..1, 0..1]. */
  env?: Pts;
  /** Resonant modes of the timber: [Hz, Q, gain]. */
  body?: Array<[number, number, number]>;
  /** Timing irregularity (0 = mechanical buzz). */
  jitter?: number;
  /** Pulse-to-pulse amplitude randomness. */
  grit?: number;
  pan?: number;
}

/**
 * Creak: friction stick-slip as an irregular pulse train (its rate glides over the gesture)
 * exciting resonant wood modes. Low rates groan like hull timbers, high rates squeal like a hinge.
 */
export function creak(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: CreakOptions = {}): number {
  const sr = s.sr;
  const n = Math.max(64, Math.floor(dur * sr));
  const data = new Float32Array(n);
  const r = s.rng.fork(Math.floor(t * 997) + n);
  const rate = o.rate ?? [[0, 28], [0.4, 55], [1, 22]];
  const env = o.env ?? [[0, 0], [0.12, 1], [0.75, 0.8], [1, 0]];
  const jitter = o.jitter ?? 0.18;
  const grit = o.grit ?? 0.4;
  let pos = Math.floor(r.next() * 40);
  while (pos < n) {
    const x = pos / n;
    const a = lerpPts(env, x) * (1 - grit * r.next());
    for (let i = 0; i < 28 && pos + i < n; i++) data[pos + i] += a * Math.exp(-i / 3.5);
    const hz = Math.max(4, lerpPts(rate, x));
    pos += Math.max(6, Math.round((sr / hz) * Math.max(0.3, 1 + jitter * r.gauss())));
  }
  const body = o.body ?? [[420, 9, 1], [980, 12, 0.7], [1850, 14, 0.45], [3100, 10, 0.25]];
  const sum = s.gain(vel, s.panner(o.pan ?? 0, dest));
  const input = s.gain(1);
  for (const [fq, q, gg] of body) {
    const bp = s.filter('bandpass', fq, q);
    input.connect(bp);
    bp.connect(s.gain(gg * Math.sqrt(q), sum));
  }
  s.play(s.buffer([data]), Math.max(0, t), input);
  return t + dur + 0.15;
}

/** Hull timbers groaning: a slow, low creak. */
export function timberGroan(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { pitch?: number; pan?: number } = {}): number {
  const p = o.pitch ?? 1;
  return creak(s, dest, t, dur, vel, {
    rate: [[0, 16 * p], [0.35, 34 * p], [0.7, 26 * p], [1, 14 * p]],
    env: [[0, 0], [0.2, 0.8], [0.5, 1], [0.85, 0.5], [1, 0]],
    body: [[260 * p, 7, 1], [610 * p, 9, 0.6], [1250 * p, 11, 0.3]],
    jitter: 0.25,
    grit: 0.5,
    pan: o.pan,
  });
}

/** Hinge squeal (chest lid, door): a rising, resonant creak. */
export function hinge(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { pitch?: number; pan?: number } = {}): number {
  const p = o.pitch ?? 1;
  return creak(s, dest, t, dur, vel, {
    rate: [[0, 70 * p], [0.3, 170 * p], [0.65, 240 * p], [1, 190 * p]],
    env: [[0, 0], [0.1, 0.7], [0.55, 1], [0.9, 0.7], [1, 0]],
    body: [[880 * p, 10, 1], [1750 * p, 13, 0.7], [3200 * p, 9, 0.35]],
    jitter: 0.08,
    grit: 0.25,
    pan: o.pan,
  });
}

// ---------------------------------------------------------------- barrels, chests, wood

/**
 * Wooden barrel / keg landing: hollow body boom with a quick pitch settle, stave knock, a faint
 * iron-hoop ring and a floor thud. `size` scales the weight, `pitch` the body tuning.
 */
export function barrel(s: Studio, dest: Dest, t: number, vel: number, o: { size?: number; pitch?: number; hoop?: number; knock?: number } = {}): number {
  const size = o.size ?? 1;
  const p = o.pitch ?? 1;
  const f = (122 * p) / Math.sqrt(size);
  const g = s.gain(0, dest);
  const e1 = s.perc(g.gain, t, vel * 0.8, 0.0025, 0.3 * size) + 0.05;
  const o1 = s.osc('sine', f * 1.7, t, e1, g);
  o1.frequency.setValueAtTime(f * 1.7, t);
  o1.frequency.exponentialRampToValueAtTime(f, t + 0.028);
  const g2 = s.gain(0, dest);
  s.perc(g2.gain, t, vel * 0.45, 0.0015, 0.16 * size);
  const o2 = s.osc('triangle', f * 2.35 * 1.1, t, e1, g2);
  o2.frequency.setValueAtTime(f * 2.35 * 1.1, t);
  o2.frequency.exponentialRampToValueAtTime(f * 2.35, t + 0.02);
  // the hollow "bonk" of the staves
  const g3 = s.gain(0, dest);
  s.perc(g3.gain, t, vel * 0.32, 0.001, 0.09 * size);
  const o3 = s.osc('sine', f * 3.3 * 1.08, t, t + 0.2 * size, g3);
  o3.frequency.setValueAtTime(f * 3.3 * 1.08, t);
  o3.frequency.exponentialRampToValueAtTime(f * 3.3, t + 0.015);
  // stave knock
  const knock = o.knock ?? 1;
  const modes: Array<[number, number, number, number]> = [[640 * p, 4, 0.6, 0.08], [1380 * p, 6, 0.32, 0.04], [2600 * p, 5, 0.12, 0.02]];
  for (const [fq, q, a, T] of modes) {
    const bp = s.filter('bandpass', fq, q, dest);
    const ng = s.gain(0, bp);
    s.perc(ng.gain, t, vel * a * knock * 3.2, 0.0006, T);
    s.noise('white', t, t + T + 0.03, ng);
  }
  // iron hoops
  const hoop = o.hoop ?? 1;
  if (hoop > 0) additive(s, dest, t + 0.002, 1870 * p, vel * 0.035 * hoop, [[1, 1, 0.22], [1.47, 0.7, 0.16], [2.09, 0.5, 0.12], [2.76, 0.3, 0.08]], 0.0005);
  // floor thud
  const lp = s.filter('lowpass', 220, 0.7, dest);
  const tg = s.gain(0, lp);
  s.perc(tg.gain, t, vel * 0.55, 0.002, 0.09 * size);
  s.noise('brown', t, t + 0.2, tg);
  return Math.max(e1, t + 0.4 * size);
}

/** Wooden crate / chest thud: a boxy, drier knock than a barrel (no hoops, shorter body). */
export function crate(s: Studio, dest: Dest, t: number, vel: number, o: { size?: number; pitch?: number } = {}): number {
  const size = o.size ?? 1;
  const p = o.pitch ?? 1;
  const f = (130 * p) / Math.sqrt(size);
  const g = s.gain(0, dest);
  const e1 = s.perc(g.gain, t, vel * 0.8, 0.002, 0.16 * size) + 0.04;
  const o1 = s.osc('sine', f * 1.5, t, e1, g);
  o1.frequency.setValueAtTime(f * 1.5, t);
  o1.frequency.exponentialRampToValueAtTime(f, t + 0.02);
  const modes: Array<[number, number, number, number]> = [[430 * p, 3.5, 0.55, 0.05], [890 * p, 5, 0.35, 0.03], [1900 * p, 4, 0.15, 0.015]];
  for (const [fq, q, a, T] of modes) {
    const bp = s.filter('bandpass', fq, q, dest);
    const ng = s.gain(0, bp);
    s.perc(ng.gain, t, vel * a * 2, 0.0005, T * size);
    s.noise('white', t, t + T * size + 0.03, ng);
  }
  const lp = s.filter('lowpass', 250, 0.7, dest);
  const tg = s.gain(0, lp);
  s.perc(tg.gain, t, vel * 0.45, 0.0015, 0.06 * size);
  s.noise('brown', t, t + 0.15, tg);
  return Math.max(e1, t + 0.25 * size);
}

/** A burst of tiny grains (gunpowder, grit) settling inside a container. */
export function grainRattle(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { density?: number; center?: number; decay?: number } = {}): number {
  const sr = s.sr;
  const n = Math.max(64, Math.floor(dur * sr));
  const data = new Float32Array(n);
  const r = s.rng.fork(Math.floor(t * 1013) + 7);
  const count = Math.floor((o.density ?? 260) * dur);
  const decay = o.decay ?? 0.35;
  for (let k = 0; k < count; k++) {
    // front-loaded arrivals (truncated exponential over the burst)
    const x = -Math.log(1 - r.next() * (1 - Math.exp(-1 / decay))) * decay;
    const pos = Math.floor(x * n);
    const a = (0.3 + 0.7 * r.next()) * Math.exp(-x * 1.5);
    const len = 6 + Math.floor(r.next() * 18);
    for (let i = 0; i < len && pos + i < n; i++) data[pos + i] += a * (r.next() * 2 - 1) * Math.exp(-i / (len * 0.35));
  }
  const g = s.gain(vel, dest);
  const bp = s.filter('bandpass', o.center ?? 4200, 0.8, g);
  const hp = s.filter('highpass', 1500, 0.7, bp);
  s.play(s.buffer([data]), Math.max(0, t), hp);
  return t + dur;
}

/** Wood splinters: sharp cracks and small wooden pieces knocking down, scattered over `span`. */
export function splinters(s: Studio, dest: Dest, t: number, span: number, count: number, vel: number, o: { center?: number } = {}): number {
  const r = s.rng.fork(Math.round(t * 1000) + count * 13);
  const c = o.center ?? 2400;
  let end = t;
  for (let i = 0; i < count; i++) {
    const tt = t + Math.pow(r.next(), 1.6) * span;
    const pan = s.panner(r.range(-0.6, 0.6), dest);
    if (r.next() < 0.55) {
      const bp = s.filter('bandpass', c * r.range(0.6, 1.7), 1.8, pan);
      const g = s.gain(0, bp);
      const T = r.range(0.005, 0.02);
      s.perc(g.gain, tt, vel * r.range(0.35, 1), 0.0003, T);
      s.noise('white', tt, tt + T + 0.02, g);
      end = Math.max(end, tt + T + 0.02);
    } else {
      end = Math.max(end, block(s, pan, tt, r.range(520, 1500), vel * r.range(0.2, 0.55), { decay: r.range(0.02, 0.05) }));
    }
  }
  return end;
}

// ---------------------------------------------------------------- gunpowder

/** Match strike: a rough scratch across the box, then the head flaring into flame. */
export function matchStrike(s: Studio, dest: Dest, t: number, vel: number): number {
  const r = s.rng.fork(Math.floor(t * 1000) + 99);
  const bp = s.filter('bandpass', 2200, 1.4, dest);
  bp.frequency.setValueAtTime(1700, t);
  bp.frequency.exponentialRampToValueAtTime(5200, t + 0.11);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  let tt = t;
  while (tt < t + 0.11) {
    g.gain.linearRampToValueAtTime(vel * r.range(0.25, 0.8), tt + 0.003);
    tt += r.range(0.006, 0.013);
    g.gain.linearRampToValueAtTime(vel * r.range(0.03, 0.15), tt);
  }
  g.gain.linearRampToValueAtTime(0, tt + 0.02);
  s.noise('white', t, tt + 0.05, g);
  // flare: "fft" of the head catching
  const ft = t + 0.085;
  const fb = s.filter('bandpass', 1500, 0.6, dest);
  fb.frequency.setValueAtTime(900, ft);
  fb.frequency.exponentialRampToValueAtTime(3800, ft + 0.06);
  fb.frequency.exponentialRampToValueAtTime(1500, ft + 0.35);
  const fg = s.gain(0, fb);
  fg.gain.setValueAtTime(0, ft);
  fg.gain.linearRampToValueAtTime(vel * 0.6, ft + 0.03);
  fg.gain.setTargetAtTime(vel * 0.05, ft + 0.045, 0.07);
  fg.gain.setTargetAtTime(0, ft + 0.4, 0.08);
  s.noise('pink', ft, ft + 0.75, fg);
  // the head spits a couple of pops
  for (let i = 0; i < 4; i++) {
    const pt = ft + r.range(0.0, 0.18);
    const pb = s.filter('bandpass', r.range(2500, 6000), 2, dest);
    const pg = s.gain(0, pb);
    s.perc(pg.gain, pt, vel * r.range(0.2, 0.5), 0.0002, r.range(0.004, 0.01));
    s.noise('white', pt, pt + 0.02, pg);
  }
  return ft + 0.75;
}

/**
 * Burning fuse: fizzing hiss with an irregular flutter, sparks spitting and a low breathy burn.
 * `swell` > 0 makes the hiss grow over the duration (a fuse catching and racing).
 */
export function fuse(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { bright?: number; sparks?: number; swell?: number; fadeIn?: number; fadeOut?: number } = {}): number {
  const r = s.rng.fork(Math.floor(t * 1009) + Math.floor(dur * 100));
  const b = o.bright ?? 1;
  const hp = s.filter('highpass', 2600 * b, 0.7, dest);
  const pk = s.filter('peaking', 6200 * b, 1.1, hp, 5);
  const g = s.gain(0, pk);
  const fi = Math.max(0.005, o.fadeIn ?? 0.03);
  const fo = Math.max(0.01, o.fadeOut ?? 0.15);
  const sw = o.swell ?? 0;
  g.gain.setValueAtTime(0, t);
  let tt = t;
  while (tt < t + dur) {
    const x = (tt - t) / dur;
    const env = Math.min(1, (tt - t) / fi) * ((1 + sw * x) / (1 + sw)) * Math.min(1, (t + dur - tt) / fo);
    g.gain.linearRampToValueAtTime(vel * 0.35 * env * r.range(0.45, 1), tt);
    tt += r.range(0.012, 0.03);
  }
  g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
  s.noise('white', t, t + dur + 0.05, g);
  const n = Math.floor((o.sparks ?? 1) * dur * 38);
  for (let i = 0; i < n; i++) {
    const x = r.next();
    const st = t + x * dur;
    const bp = s.filter('bandpass', r.range(2500, 7500) * b, 2, s.panner(r.range(-0.4, 0.4), dest));
    const sg = s.gain(0, bp);
    s.perc(sg.gain, st, vel * r.range(0.1, 0.5) * ((1 + sw * x) / (1 + sw)), 0.0002, r.range(0.003, 0.01));
    s.noise('white', st, st + 0.02, sg);
  }
  const lp = s.filter('lowpass', 700, 0.7, dest);
  const lg = s.gain(0, lp);
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(vel * 0.12, t + Math.min(0.1, dur * 0.3));
  lg.gain.setTargetAtTime(0, t + dur * 0.8, dur * 0.1);
  s.noise('pink', t, t + dur + 0.1, lg);
  return t + dur + 0.1;
}

/**
 * Cannon / gunpowder boom: sharp crack, a pitch-dropping punch, a noise body whose filter sweeps
 * down, a long low rumble and an optional slap-back echo off the cove cliffs.
 */
export function cannon(
  s: Studio,
  dest: Dest,
  t: number,
  vel: number,
  o: { size?: number; pitch?: number; echo?: number; crack?: number; distance?: number; pan?: number; tail?: number } = {},
): number {
  const size = o.size ?? 1;
  const p = o.pitch ?? 1;
  // `tail` shortens the punch, body and rumble decays (a close gunpowder blast vs a rolling cannon)
  const tl = o.tail ?? 1;
  const out = s.panner(o.pan ?? 0, dest);
  const bus = s.gain(1);
  const lpD = s.filter('lowpass', Math.min(16000, 16000 * Math.pow(0.15, o.distance ?? 0)), 0.7, out);
  // gunpowder is all transient: a soft clip rounds the sub punch's peaks (unity gain for small signals)
  const post = s.gain(0.88, lpD);
  const clip = s.shaper(s.softClip(2), post);
  const pre = s.gain(0.55, clip);
  const hp38 = s.filter('highpass', 38, 0.7, pre);
  bus.connect(hp38);
  let end = t + 1.4 * size * tl;
  if (o.echo) {
    const e1 = s.delay(0.3 + 0.08 * size, s.filter('lowpass', 1200, 0.7, s.gain(0.4 * o.echo, out)));
    const e2 = s.delay(0.57 + 0.1 * size, s.filter('lowpass', 750, 0.7, s.gain(0.17 * o.echo, out)));
    bus.connect(e1);
    bus.connect(e2);
    end += 0.7;
  }
  // crack
  const hp = s.filter('highpass', 1100, 0.7, bus);
  const cg = s.gain(0, hp);
  s.perc(cg.gain, t, vel * 0.9 * (o.crack ?? 1), 0.0004, 0.07);
  s.noise('white', t, t + 0.1, cg);
  // punch
  const pg = s.gain(0, bus);
  s.perc(pg.gain, t, vel * 1.0, 0.002, 0.8 * size * tl);
  const po = s.osc('sine', 150 * p, t, t + 0.9 * size * tl + 0.05, pg);
  po.frequency.setValueAtTime(150 * p, t);
  po.frequency.exponentialRampToValueAtTime(40 * p, t + 0.2);
  // body
  const bl = s.filter('lowpass', 2600, 0.8, bus);
  bl.frequency.setValueAtTime(2600 * Math.pow(size, 0.3) * p, t);
  bl.frequency.exponentialRampToValueAtTime(160, t + 0.55 * size);
  const bg = s.gain(0, bl);
  bg.gain.setValueAtTime(0, t);
  bg.gain.linearRampToValueAtTime(vel * 1.4, t + 0.003);
  bg.gain.setTargetAtTime(0, t + 0.01, 0.16 * size * tl);
  s.noise('brown', t, t + 1.2 * size * tl, bg);
  // mid grit
  const mb = s.filter('bandpass', 700 * p, 0.7, bus);
  const mg = s.gain(0, mb);
  mg.gain.setValueAtTime(0, t);
  mg.gain.linearRampToValueAtTime(vel * 0.5, t + 0.002);
  mg.gain.setTargetAtTime(0, t + 0.006, 0.07 * size);
  s.noise('pink', t, t + 0.6 * size, mg);
  // rumble
  const rl = s.filter('lowpass', 140, 0.7, bus);
  const rg = s.gain(0, rl);
  rg.gain.setValueAtTime(0, t);
  rg.gain.linearRampToValueAtTime(vel * 0.6, t + 0.04);
  rg.gain.setTargetAtTime(0, t + 0.06, 0.45 * size * tl);
  s.noise('brown', t, t + 1.4 * size * tl, rg);
  return end;
}

// ---------------------------------------------------------------- treasure and grog

/** Heavy gold doubloon: thick, low coin partials, a soft contact "chk", optional bounce. */
export function doubloon(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number; bounce?: boolean; decay?: number } = {}): number {
  const f = o.f ?? 2600;
  const T = o.decay ?? 0.32;
  const hit = (tt: number, ff: number, v: number) => {
    const e = additive(s, dest, tt, ff, v * 0.35, [[1, 1, T], [1.52, 0.65, T * 0.75], [2.27, 0.45, T * 0.5], [2.94, 0.28, T * 0.35], [3.65, 0.16, T * 0.22]], 0.0004);
    const bp = s.filter('bandpass', ff * 0.45, 1.3, dest);
    const ng = s.gain(0, bp);
    s.perc(ng.gain, tt, v * 0.25, 0.0003, 0.012);
    s.noise('white', tt, tt + 0.02, ng);
    return e;
  };
  let end = hit(t, f, vel);
  if (o.bounce ?? true) end = Math.max(end, hit(t + 0.05 + s.rng.next() * 0.035, f * (1.015 + s.rng.next() * 0.03), vel * 0.4));
  return end;
}

/** A spill of doubloons: a dense, front-loaded cascade of clinks over a few pile "chunks". */
export function coinSpill(s: Studio, dest: Dest, t: number, dur: number, count: number, vel: number, o: { f?: number } = {}): number {
  const r = s.rng.fork(Math.floor(t * 1000) + count * 7);
  let end = t;
  for (let i = 0; i < count; i++) {
    const x = Math.pow(r.next(), 1.8);
    const tt = t + x * dur;
    const pan = s.panner(r.range(-0.5, 0.5), dest);
    end = Math.max(end, doubloon(s, pan, tt, vel * r.range(0.35, 1) * (1 - 0.5 * x), { f: (o.f ?? 2600) * r.range(0.8, 1.3), bounce: r.next() < 0.4, decay: r.range(0.18, 0.34) }));
  }
  for (let i = 0; i < Math.ceil(count / 4); i++) {
    const tt = t + Math.pow(r.next(), 1.5) * dur;
    const bp = s.filter('bandpass', r.range(700, 1300), 1.5, dest);
    const g = s.gain(0, bp);
    s.perc(g.gain, tt, vel * r.range(0.2, 0.5), 0.0005, 0.03);
    s.noise('pink', tt, tt + 0.05, g);
  }
  return end;
}

/** Two pewter tankards knocked together: a dull metal "clonk-tink" and a slosh of grog. */
export function tankard(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number; slosh?: number } = {}): number {
  const f = o.f ?? 1250;
  const parts: Array<[number, number, number]> = [[1, 1, 0.42], [1.58, 0.6, 0.32], [2.33, 0.45, 0.24], [3.19, 0.25, 0.15], [4.4, 0.12, 0.09]];
  let end = additive(s, dest, t, f, vel * 0.3, parts, 0.0006);
  end = Math.max(end, additive(s, dest, t + 0.007, f * 1.13, vel * 0.24, parts, 0.0006));
  const bp = s.filter('bandpass', f * 0.7, 1.2, dest);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.5, 0.0004, 0.025);
  s.noise('pink', t, t + 0.05, g);
  const slosh = o.slosh ?? 1;
  if (slosh > 0) {
    const sb = s.filter('bandpass', 1800, 0.9, dest);
    sb.frequency.setValueAtTime(2400, t + 0.02);
    sb.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    const sg = s.gain(0, sb);
    sg.gain.setValueAtTime(0, t + 0.01);
    sg.gain.linearRampToValueAtTime(vel * 0.2 * slosh, t + 0.05);
    sg.gain.setTargetAtTime(0, t + 0.07, 0.08);
    s.noise('pink', t, t + 0.45, sg);
  }
  return Math.max(end, t + 0.45);
}

/** Glugging grog: a train of low bubbles (rising chirps) with a hollow bottle-neck "gl". */
export function glug(s: Studio, dest: Dest, t: number, count: number, vel: number, o: { f?: number; rate?: number } = {}): number {
  const f = o.f ?? 260;
  const rate = o.rate ?? 8.5;
  const r = s.rng.fork(Math.floor(t * 1000) + count * 31);
  let end = t;
  for (let i = 0; i < count; i++) {
    const tt = t + i / rate + r.range(-0.008, 0.008);
    const ff = f * r.range(0.92, 1.1) * (1 + i * 0.05);
    const v = vel * Math.max(0.3, 1 - i * 0.12);
    const g = s.gain(0, dest);
    const e = s.perc(g.gain, tt, v * 0.6, 0.004, 0.08) + 0.02;
    const osc = s.osc('sine', ff, tt, e, g);
    osc.frequency.setValueAtTime(ff, tt);
    osc.frequency.exponentialRampToValueAtTime(ff * 1.7, tt + 0.045);
    const bp = s.filter('bandpass', ff * 2.2, 3, dest);
    const ng = s.gain(0, bp);
    s.perc(ng.gain, tt, v * 0.35, 0.003, 0.04);
    s.noise('pink', tt, tt + 0.06, ng);
    const sb = tt + 0.03;
    const f2 = ff * r.range(3, 4.5);
    const g2 = s.gain(0, dest);
    s.perc(g2.gain, sb, v * 0.16, 0.001, 0.03);
    const o2 = s.osc('sine', f2, sb, sb + 0.05, g2);
    o2.frequency.setValueAtTime(f2, sb);
    o2.frequency.exponentialRampToValueAtTime(f2 * 1.5, sb + 0.02);
    end = Math.max(end, e);
  }
  return end;
}

// ---------------------------------------------------------------- rope and sea

/** Rope running through a wooden block: gritty fibrous friction plus a pulley squeal. */
export function ropeRun(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { f0?: number; f1?: number; squeak?: number } = {}): number {
  const r = s.rng.fork(Math.floor(t * 1000) + Math.floor(dur * 1000));
  const bp = s.filter('bandpass', o.f0 ?? 900, 1.1, dest);
  bp.frequency.setValueAtTime(o.f0 ?? 900, t);
  bp.frequency.exponentialRampToValueAtTime(o.f1 ?? 2200, t + dur);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  let tt = t;
  while (tt < t + dur) {
    const x = (tt - t) / dur;
    const env = Math.sin(Math.PI * Math.min(1, x * 1.05));
    g.gain.linearRampToValueAtTime(vel * 0.5 * env * r.range(0.4, 1), tt);
    tt += r.range(0.004, 0.011);
  }
  g.gain.linearRampToValueAtTime(0, t + dur + 0.01);
  s.noise('white', t, t + dur + 0.05, g);
  const sq = o.squeak ?? 1;
  if (sq > 0) {
    creak(s, dest, t + dur * 0.1, dur * 0.8, vel * 0.6 * sq, {
      rate: [[0, 380], [0.5, 520], [1, 430]],
      env: [[0, 0], [0.2, 1], [0.8, 0.7], [1, 0]],
      body: [[1650, 14, 1], [3300, 16, 0.4]],
      jitter: 0.05,
      grit: 0.2,
    });
  }
  return t + dur + 0.15;
}

/** One wave: a low surf swell rising and falling, with a foamy wash at the crest. */
export function wave(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { pan?: number; bright?: number } = {}): number {
  const b = o.bright ?? 1;
  const out = s.panner(o.pan ?? 0, dest);
  const lp = s.filter('lowpass', 300, 0.6, out);
  lp.frequency.setValueAtTime(240, t);
  lp.frequency.linearRampToValueAtTime(700 * b, t + dur * 0.45);
  lp.frequency.linearRampToValueAtTime(220, t + dur);
  const g = s.gain(0, lp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.8, t + dur * 0.45);
  g.gain.linearRampToValueAtTime(vel * 0.25, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  s.noise('brown', t, t + dur + 0.05, g);
  const wb = s.filter('bandpass', 2600 * b, 0.5, out);
  const wg = s.gain(0, wb);
  wg.gain.setValueAtTime(0, t + dur * 0.3);
  wg.gain.linearRampToValueAtTime(vel * 0.22, t + dur * 0.5);
  wg.gain.setTargetAtTime(0, t + dur * 0.52, dur * 0.18);
  s.noise('pink', t, t + dur + 0.05, wg);
  return t + dur + 0.1;
}

// ---------------------------------------------------------------- iron, feathers, wax, paper, corks

/** Solid cast iron meeting wood or iron: a dense, heavily damped clank with a bright contact click. */
export function ironClank(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number; decay?: number } = {}): number {
  const f = o.f ?? 640;
  const T = o.decay ?? 0.12;
  const end = additive(s, dest, t, f, vel * 0.3, [[1, 1, T], [1.73, 0.85, T * 0.8], [2.62, 0.6, T * 0.6], [3.91, 0.38, T * 0.45], [5.28, 0.22, T * 0.3]], 0.0004);
  const bp = s.filter('bandpass', Math.min(9000, f * 3), 1.5, dest);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.5, 0.0003, 0.012);
  s.noise('white', t, t + 0.02, g);
  return end;
}

/** One wing flap: a feathery "fwup" (a band of noise that opens and closes) with a low push of air. */
export function flap(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number } = {}): number {
  const f = o.f ?? 950;
  const bp = s.filter('bandpass', f, 0.9, dest);
  bp.frequency.setValueAtTime(f * 0.7, t);
  bp.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.03);
  bp.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.08);
  const g = s.gain(0, bp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.012);
  g.gain.setTargetAtTime(0, t + 0.02, 0.025);
  s.noise('pink', t, t + 0.14, g);
  const lp = s.filter('lowpass', 280, 0.7, dest);
  const lg = s.gain(0, lp);
  s.perc(lg.gain, t + 0.004, vel * 0.5, 0.008, 0.07);
  s.noise('brown', t, t + 0.12, lg);
  return t + 0.14;
}

/** Wet squelch (octopus, warm wax): a resonant band sweeping down with a bubbly flutter, then a "blup". */
export function squelch(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { f0?: number; f1?: number } = {}): number {
  const f0 = o.f0 ?? 1500;
  const f1 = o.f1 ?? 380;
  const bp = s.filter('bandpass', f0, 4, dest);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const fl = s.gain(0.6, bp);
  s.osc('square', 28, t, t + dur + 0.05, s.gain(0.4, fl.gain));
  const g = s.gain(0, fl);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 1.2, t + 0.01);
  g.gain.setTargetAtTime(0, t + dur * 0.5, dur * 0.25);
  s.noise('pink', t, t + dur + 0.05, g);
  const bt = t + dur * 0.35;
  const bg = s.gain(0, dest);
  s.perc(bg.gain, bt, vel * 0.35, 0.003, 0.05);
  const o2 = s.osc('sine', 170, bt, bt + 0.08, bg);
  o2.frequency.setValueAtTime(170, bt);
  o2.frequency.exponentialRampToValueAtTime(330, bt + 0.05);
  return t + dur + 0.05;
}

/** Paper (a treasure map) crinkling: a flurry of short, bright noise grains. */
export function paperRustle(s: Studio, dest: Dest, t: number, dur: number, vel: number): number {
  const r = s.rng.fork(Math.floor(t * 1000) + 77);
  const n = Math.max(2, Math.floor(dur * 70));
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(r.next(), 0.8) * dur;
    const bp = s.filter('bandpass', r.range(1800, 6500), r.range(0.8, 2), dest);
    const g = s.gain(0, bp);
    const T = r.range(0.004, 0.02);
    s.perc(g.gain, tt, vel * r.range(0.2, 0.8), 0.001, T);
    s.noise('white', tt, tt + T + 0.01, g);
  }
  return t + dur + 0.03;
}

/** Cork pulled from a grog bottle: a hollow "thwop" with a little puff of air. */
export function cork(s: Studio, dest: Dest, t: number, f: number, vel: number): number {
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.5, 0.001, 0.07) + 0.02;
  const o = s.osc('sine', f * 1.6, t, end, g);
  o.frequency.setValueAtTime(f * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.045);
  const bp = s.filter('bandpass', f * 2.2, 2.5, dest);
  const ng = s.gain(0, bp);
  s.perc(ng.gain, t, vel * 0.4, 0.0005, 0.02);
  s.noise('white', t, t + 0.04, ng);
  return end;
}

/** A compass needle spinning: a fine whirr whose flutter slows as it settles, then a tiny tick. */
export function whirr(s: Studio, dest: Dest, t: number, dur: number, vel: number): number {
  const bp = s.filter('bandpass', 1400, 4, dest);
  const am = s.gain(0.5, bp);
  const lfo = s.osc('square', 42, t, t + dur, s.filter('lowpass', 200, 0.7, s.gain(0.5, am.gain)));
  lfo.frequency.setValueAtTime(42, t);
  lfo.frequency.exponentialRampToValueAtTime(9, t + dur);
  const g = s.gain(0, am);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.9, t + 0.03);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  s.noise('white', t, t + dur + 0.02, g);
  const wg = s.gain(0, dest);
  wg.gain.setValueAtTime(0, t);
  wg.gain.linearRampToValueAtTime(vel * 0.05, t + 0.03);
  wg.gain.linearRampToValueAtTime(0, t + dur);
  const w = s.osc('triangle', 1250, t, t + dur, wg);
  w.frequency.setValueAtTime(1250, t);
  w.frequency.exponentialRampToValueAtTime(880, t + dur);
  block(s, dest, t + dur, 3100, vel * 0.35, { decay: 0.012 });
  return t + dur + 0.05;
}

/** A low rumble building from nothing: deep noise, a trembling sub and deck boards rattling harder. */
export function rumble(s: Studio, dest: Dest, t: number, dur: number, vel: number): number {
  const lp = s.filter('lowpass', 180, 0.8, dest);
  lp.frequency.setValueAtTime(120, t);
  lp.frequency.exponentialRampToValueAtTime(420, t + dur);
  const g = s.gain(0, lp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 1.1, t + dur * 0.95);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
  s.noise('brown', t, t + dur + 0.1, g);
  const sg = s.gain(0, dest);
  sg.gain.setValueAtTime(0, t);
  sg.gain.linearRampToValueAtTime(vel * 0.35, t + dur * 0.95);
  sg.gain.linearRampToValueAtTime(0, t + dur + 0.06);
  const o = s.osc('sine', 46, t, t + dur + 0.1, sg);
  s.osc('sine', 7, t, t + dur + 0.1, s.gain(4, o.frequency));
  const r = s.rng.fork(Math.floor(t * 1000) + 3);
  let tt = t + 0.1;
  while (tt < t + dur) {
    const x = (tt - t) / dur;
    block(s, s.panner(r.range(-0.6, 0.6), dest), tt, r.range(280, 520), vel * 0.25 * x, { decay: 0.03 });
    tt += 0.11 - 0.07 * x + r.range(-0.01, 0.01);
  }
  return t + dur + 0.1;
}

// ---------------------------------------------------------------- loop beds (periodic in T; render with loopLen = T)

/**
 * Gain stage with a short dip centred on the loop point: a sputter in the hiss. MP3 codes noise
 * loosely but steady tones accurately, so letting a quiet tone carry the seam keeps the decoded
 * post-roll matching the loop start (what qa.mjs checks) without touching the rest of the loop.
 */
function seamDip(s: Studio, T: number, depth = 0.02, hold = 0.065, ramp = 0.06): GainNode {
  const g = s.gain(depth);
  g.gain.setValueAtTime(depth, 0);
  g.gain.setValueAtTime(depth, hold);
  g.gain.linearRampToValueAtTime(1, hold + ramp);
  g.gain.setValueAtTime(1, T - 0.02 - ramp);
  g.gain.linearRampToValueAtTime(depth, T - 0.02);
  return g;
}

/** True when time x (0..T) is clear of the seam sputter. */
const clearOfSeam = (x: number, T: number) => x > 0.15 && x < T - 0.12;

/**
 * Burning-fuse bed: hiss with a flutter made of LFOs snapped to whole cycles per loop, sparks,
 * a low burn and a faint steady burn tone that carries the sputter at the loop point.
 */
export function fuseBed(s: Studio, dest: Dest, T: number, vel: number, o: { bright?: number; sparks?: number } = {}): void {
  const b = o.bright ?? 1;
  const hp = s.filter('highpass', 2600 * b, 0.7, dest);
  const pk = s.filter('peaking', 6200 * b, 1.1, hp, 5);
  const dip = seamDip(s, T);
  dip.connect(pk);
  const g = s.gain(vel * 0.25, dip);
  s.lfo(g.gain, 9, vel * 0.07, 0, T);
  s.lfo(g.gain, 23, vel * 0.06, 0, T, 'triangle');
  s.lfo(g.gain, 37, vel * 0.05, 0, T);
  s.noise('white', 0, T, g);
  const r = s.rng.fork(313);
  const n = Math.floor((o.sparks ?? 1) * T * 36);
  for (let i = 0; i < n; i++) {
    const st = r.range(0.15, T - 0.12);
    const bp = s.filter('bandpass', r.range(2500, 7500) * b, 2, s.panner(r.range(-0.35, 0.35), dest));
    const sg = s.gain(0, bp);
    s.perc(sg.gain, st, vel * r.range(0.1, 0.45), 0.0002, r.range(0.003, 0.01));
    s.noise('white', st, st + 0.02, sg);
  }
  const lp = s.filter('lowpass', 650, 0.7, dest);
  const dip2 = seamDip(s, T);
  dip2.connect(lp);
  s.noise('pink', 0, T, s.gain(vel * 0.08, dip2));
  // steady burn tone (D3 + octave), pitched to whole cycles per loop
  const tg = s.gain(vel * 0.032, dest);
  s.osc('sine', s.periodic(146.83), 0, T, tg);
  s.osc('sine', s.periodic(293.66), 0, T, s.gain(0.4, tg));
}

/**
 * Red-hot iron bed: a frying crackle, a hiss that breathes, heat roar, the iron ticking as it heats
 * and a low D that shivers (pitched to whole cycles per loop); the hiss sputters at the loop point.
 */
export function sizzleBed(s: Studio, dest: Dest, T: number, vel: number): void {
  const hp = s.filter('highpass', 3400, 0.7, dest);
  const dip = seamDip(s, T);
  dip.connect(hp);
  const g = s.gain(vel * 0.14, dip);
  s.lfo(g.gain, 0.8, vel * 0.05, 0, T);
  s.lfo(g.gain, 13, vel * 0.03, 0, T);
  s.noise('white', 0, T, g);
  const r = s.rng.fork(919);
  const n = Math.floor(T * 110);
  for (let i = 0; i < n; i++) {
    const st = r.range(0.15, T - 0.12);
    const bp = s.filter('bandpass', r.range(1800, 7000), r.range(1.5, 3), s.panner(r.range(-0.5, 0.5), dest));
    const cg = s.gain(0, bp);
    s.perc(cg.gain, st, vel * Math.pow(r.next(), 2) * 0.6, 0.0002, r.range(0.002, 0.008));
    s.noise('white', st, st + 0.012, cg);
  }
  const lp = s.filter('lowpass', 320, 0.7, dest);
  const dip2 = seamDip(s, T);
  dip2.connect(lp);
  const rg = s.gain(vel * 0.2, dip2);
  s.lfo(rg.gain, 1.6, vel * 0.06, 0, T);
  s.noise('brown', 0, T, rg);
  for (let k = 0; k < 3; k++) {
    const tt = (k + 0.3 + r.next() * 0.4) * (T / 3);
    if (clearOfSeam(tt, T)) additive(s, dest, tt, r.range(2300, 3600), vel * 0.08, [[1, 1, 0.25], [1.51, 0.5, 0.18], [2.23, 0.3, 0.12]], 0.0004);
  }
  const hg = s.gain(vel * 0.06, dest);
  s.lfo(hg.gain, 6, vel * 0.025, 0, T);
  s.osc('sine', s.periodic(73.42), 0, T, hg);
  s.osc('sine', s.periodic(146.83), 0, T, s.gain(0.35, hg));
}
