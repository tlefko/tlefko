/** Cartoon sound-effect voices: whooshes, boings, fire, heartbeat, ratchets, coins, the parrot and the crew. */
import type { Dest, Studio } from '../core/studio';

const sampleBytes = new Map<string, Promise<ArrayBuffer>>();

/** Decode a source sample from tools/audio-lab/samples into the current offline context. */
export async function sample(s: Studio, name: string): Promise<AudioBuffer> {
  let p = sampleBytes.get(name);
  if (!p) {
    p = fetch(new URL(`../../samples/${name}.mp3`, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`sample ${name}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    sampleBytes.set(name, p);
  }
  const bytes = await p;
  return s.ctx.decodeAudioData(bytes.slice(0));
}

/** Band-passed noise sweep with a swell envelope and optional pan travel. */
export function whoosh(
  s: Studio,
  dest: Dest,
  t: number,
  dur: number,
  vel: number,
  o: { f0?: number; f1?: number; q?: number; peakAt?: number; pan0?: number; pan1?: number; color?: 'white' | 'pink' | 'brown' } = {},
): number {
  const pan = s.panner(o.pan0 ?? 0, dest);
  if (o.pan1 !== undefined) {
    pan.pan.setValueAtTime(o.pan0 ?? 0, t);
    pan.pan.linearRampToValueAtTime(o.pan1, t + dur);
  }
  const bp = s.filter('bandpass', o.f0 ?? 400, o.q ?? 1.2, pan);
  bp.frequency.setValueAtTime(o.f0 ?? 400, t);
  bp.frequency.exponentialRampToValueAtTime(o.f1 ?? 2400, t + dur);
  const g = s.gain(0, bp);
  const pk = t + dur * (o.peakAt ?? 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, pk);
  g.gain.setTargetAtTime(0, pk, (t + dur - pk) / 3.5);
  s.noise(o.color ?? 'pink', t, t + dur + 0.1, g);
  return t + dur + 0.1;
}

/** Cartoon spring "boing": rising pitch with a decaying wobble and a vowel-ish filter. */
export function boing(s: Studio, dest: Dest, t: number, vel: number, o: { f0?: number; f1?: number; wobble?: number; decay?: number } = {}): number {
  const f0 = o.f0 ?? 170;
  const f1 = o.f1 ?? 330;
  const T = o.decay ?? 1.0;
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.5, 0.004, T) + 0.05;
  const lp = s.filter('lowpass', 1200, 5, g);
  const osc = s.osc('triangle', f0, t, end, lp);
  const saw = s.gain(0.25, lp);
  const osc2 = s.osc('sawtooth', f0, t, end, saw);
  for (const o2 of [osc, osc2]) {
    o2.frequency.setValueAtTime(f0, t);
    o2.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
  }
  const wob = o.wobble ?? 13;
  const depth = s.gain(0);
  depth.gain.setValueAtTime(f1 * 0.35, t + 0.05);
  depth.gain.setTargetAtTime(0, t + 0.08, T / 3);
  const lfo = s.osc('sine', wob, t, end, depth);
  depth.connect(osc.frequency);
  depth.connect(osc2.frequency);
  const fDepth = s.gain(0, lp.frequency);
  fDepth.gain.setValueAtTime(900, t);
  fDepth.gain.setTargetAtTime(0, t + 0.1, T / 3);
  lfo.connect(fDepth);
  lp.frequency.setValueAtTime(700, t);
  lp.frequency.linearRampToValueAtTime(1600, t + 0.08);
  lp.frequency.setTargetAtTime(900, t + 0.1, 0.3);
  return end;
}

/** Fire catching: low whoomp swell, filter bloom, crackles. */
export function fireWhoomp(s: Studio, dest: Dest, t: number, vel: number, o: { size?: number } = {}): number {
  const size = o.size ?? 1;
  const lp = s.filter('lowpass', 200, 0.9, dest);
  lp.frequency.setValueAtTime(160, t);
  lp.frequency.exponentialRampToValueAtTime(2600 * size, t + 0.13);
  lp.frequency.exponentialRampToValueAtTime(420, t + 0.75 * size);
  const g = s.gain(0, lp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 1.1, t + 0.07);
  g.gain.setTargetAtTime(0, t + 0.12, 0.2 * size);
  s.noise('brown', t, t + 1.3 * size, g);
  const g2 = s.gain(0, lp);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(vel * 0.35, t + 0.09);
  g2.gain.setTargetAtTime(0, t + 0.14, 0.16 * size);
  s.noise('pink', t, t + 1.1 * size, g2);
  // thump
  const tg = s.gain(0, dest);
  s.perc(tg.gain, t + 0.02, vel * 0.55, 0.02, 0.35);
  const osc = s.osc('sine', 95, t, t + 0.5, tg);
  osc.frequency.setValueAtTime(95, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.3);
  // crackles
  const bp = s.filter('bandpass', 3200, 1.4, dest);
  const r = s.rng.fork(33);
  const n = Math.floor(9 * size);
  for (let i = 0; i < n; i++) {
    const tt = t + 0.08 + r.next() * 0.7 * size;
    const cg = s.gain(0, bp);
    s.perc(cg.gain, tt, vel * r.range(0.1, 0.35), 0.0005, r.range(0.005, 0.02));
    s.noise('white', tt, tt + 0.03, cg);
  }
  return t + 1.3 * size;
}

/** Heartbeat lub-dub. */
export function heartbeat(s: Studio, dest: Dest, t: number, vel: number): number {
  const beat = (tt: number, f: number, v: number) => {
    const g = s.gain(0, dest);
    s.perc(g.gain, tt, v, 0.006, 0.22);
    const o = s.osc('sine', f * 1.4, tt, tt + 0.3, g);
    o.frequency.setValueAtTime(f * 1.4, tt);
    o.frequency.exponentialRampToValueAtTime(f, tt + 0.05);
    const lp = s.filter('lowpass', 180, 0.8, dest);
    const ng = s.gain(0, lp);
    s.perc(ng.gain, tt, v * 0.8, 0.004, 0.08);
    s.noise('brown', tt, tt + 0.12, ng);
  };
  beat(t, 52, vel);
  beat(t + 0.2, 60, vel * 0.62);
  return t + 0.55;
}

/** Wooden ratchet click (wheel pawl). */
export function ratchet(s: Studio, dest: Dest, t: number, vel: number, o: { body?: number; bright?: number } = {}): number {
  const body = o.body ?? 1900;
  const bp = s.filter('bandpass', body, 7, dest);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 1.6, 0.0003, 0.03);
  s.noise('white', t, t + 0.04, g);
  const hp = s.filter('highpass', 5000, 0.7, dest);
  const hg = s.gain(0, hp);
  s.perc(hg.gain, t, vel * 0.25 * (o.bright ?? 1), 0.0002, 0.006);
  s.noise('white', t, t + 0.012, hg);
  const tg = s.gain(0, dest);
  s.perc(tg.gain, t, vel * 0.18, 0.0004, 0.025);
  s.osc('sine', body * 0.42, t, t + 0.05, tg);
  return t + 0.05;
}

/** Single coin clink: inharmonic metal partials plus an optional bounce. */
export function coinClink(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number; bounce?: boolean; decay?: number } = {}): number {
  const f = o.f ?? 3600;
  const T = o.decay ?? 0.4;
  const hit = (tt: number, ff: number, v: number) => {
    const g = s.gain(1, dest);
    const parts: [number, number, number][] = [[1, 1, T], [1.34, 0.55, T * 0.7], [1.87, 0.4, T * 0.5], [2.41, 0.22, T * 0.35], [2.93, 0.14, T * 0.25]];
    let end = tt;
    for (const [r, a, t60] of parts) {
      if (ff * r > 16000) continue;
      const pg = s.gain(0, g);
      end = Math.max(end, s.perc(pg.gain, tt, a * v * 0.12, 0.0004, t60) + 0.02);
      s.osc('sine', ff * r, tt, end, pg);
    }
    const hp = s.filter('highpass', 6000, 0.7, dest);
    const ng = s.gain(0, hp);
    s.perc(ng.gain, tt, v * 0.12, 0.0002, 0.006);
    s.noise('white', tt, tt + 0.012, ng);
    return end;
  };
  let end = hit(t, f, vel);
  if (o.bounce ?? true) end = Math.max(end, hit(t + 0.055 + s.rng.next() * 0.03, f * (1.02 + s.rng.next() * 0.04), vel * 0.45));
  return end;
}

/** Soft cartoon smoke puff. */
export function poof(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number } = {}): number {
  const f = o.f ?? 1300;
  const bp = s.filter('bandpass', f, 0.9, dest);
  bp.frequency.setValueAtTime(f * 1.4, t);
  bp.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.22);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.9, 0.012, 0.28);
  s.noise('pink', t, t + 0.35, g);
  const pg = s.gain(0, dest);
  s.perc(pg.gain, t, vel * 0.18, 0.002, 0.06);
  const o2 = s.osc('sine', f * 0.45, t, t + 0.09, pg);
  o2.frequency.setValueAtTime(f * 0.45, t);
  o2.frequency.exponentialRampToValueAtTime(f * 0.18, t + 0.06);
  return t + 0.35;
}

/** Sub impact: pitch-dropping sine + low noise thump. */
export function impact(s: Studio, dest: Dest, t: number, vel: number, o: { f?: number; decay?: number } = {}): number {
  const f = o.f ?? 55;
  const T = o.decay ?? 0.9;
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.9, 0.003, T) + 0.05;
  const osc = s.osc('sine', f * 2.2, t, end, g);
  osc.frequency.setValueAtTime(f * 2.2, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + T);
  const lp = s.filter('lowpass', 500, 0.7, dest);
  const ng = s.gain(0, lp);
  s.perc(ng.gain, t, vel * 0.6, 0.002, 0.18);
  s.noise('brown', t, t + 0.3, ng);
  return end;
}

/**
 * Cartoon parrot squawk "rraawk!": a pressed, rough voice (saw + pulse + sub-octave growl with a
 * fast amplitude flutter for the rolled "rr") through gliding "r-aa-wk" formants, cut off with a
 * "k" click; then an optional two-note whistle tail ("wheet-whew").
 */
export function parrot(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number; len?: number; whistle?: boolean } = {}): number {
  const p = o.pitch ?? 1;
  const L = o.len ?? 0.46;
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.018);
  g.gain.setValueAtTime(vel * 0.5, t + L * 0.3);
  g.gain.linearRampToValueAtTime(vel * 0.62, t + L * 0.6);
  g.gain.linearRampToValueAtTime(vel * 0.4, t + L * 0.92);
  g.gain.linearRampToValueAtTime(0, t + L);
  // a parrot has no chest: keep the growl's sub-bass out, lift the beak's rasp
  const hp = s.filter('highpass', 340, 0.8, s.filter('peaking', 2800, 1, g, 4));
  const shape = s.shaper(s.softClip(2.6), hp);
  const pre = s.gain(0.9, shape);
  // formants over the call: [time frac, F1, F2, F3]
  const F: Array<[number, number, number, number]> = [
    [0, 420, 1180, 1650],
    [0.18, 520, 1250, 1900],
    [0.3, 820, 1350, 2550],
    [0.7, 860, 1300, 2650],
    [0.88, 560, 950, 2400],
    [1, 380, 760, 2300],
  ];
  const src = s.gain(1);
  const Q = [6, 9, 11];
  const G = [2.6, 1.6, 0.9];
  for (let k = 0; k < 3; k++) {
    const bp = s.filter('bandpass', F[0][k + 1], Q[k]);
    src.connect(bp);
    bp.connect(s.gain(G[k], pre));
    bp.frequency.setValueAtTime(F[0][k + 1], t);
    for (const row of F) bp.frequency.linearRampToValueAtTime(row[k + 1], t + L * row[0]);
  }
  // roughness: a softened square flutter on the source (strong "rr", pressed "aa")
  const am = s.gain(0.6, src);
  const amDepth = s.gain(0, am.gain);
  amDepth.gain.setValueAtTime(0.55, t);
  amDepth.gain.linearRampToValueAtTime(0.5, t + L * 0.22);
  amDepth.gain.linearRampToValueAtTime(0.22, t + L * 0.35);
  amDepth.gain.linearRampToValueAtTime(0.35, t + L);
  s.osc('square', 48, t, t + L + 0.02, s.filter('lowpass', 300, 0.7, amDepth));
  const f0: Array<[number, number]> = [[0, 540 * p], [0.12, 610 * p], [0.4, 760 * p], [0.75, 720 * p], [1, 500 * p]];
  const voiceOsc = (type: OscillatorType, mul: number, level: number, dc: number) => {
    const osc = s.osc(type, f0[0][1] * mul, t, t + L + 0.02, s.gain(level, am), dc);
    osc.frequency.setValueAtTime(f0[0][1] * mul, t);
    for (const [x, f] of f0.slice(1)) osc.frequency.exponentialRampToValueAtTime(f * mul, t + L * x);
    s.osc('sine', 23, t, t + L + 0.02, s.gain(f0[0][1] * mul * 0.03, osc.frequency));
  };
  voiceOsc('sawtooth', 1, 1, 0);
  voiceOsc('square', 1, 0.5, 7);
  voiceOsc('square', 0.5, 0.22, 0);
  s.noise('white', t, t + L + 0.02, s.gain(0.3, am));
  // "k" release
  const kb = s.filter('bandpass', 2300, 2, dest);
  const kg = s.gain(0, kb);
  s.perc(kg.gain, t + L - 0.004, vel * 0.3, 0.001, 0.02);
  s.noise('white', t + L - 0.01, t + L + 0.04, kg);
  let end = t + L + 0.05;
  if (o.whistle ?? true) {
    const w0 = t + L + 0.11;
    whistleNote(s, dest, w0, 0.16, [[0, 1750 * p], [0.7, 2550 * p], [1, 2450 * p]], vel * 0.9);
    end = whistleNote(s, dest, w0 + 0.22, 0.26, [[0, 2350 * p], [0.3, 2450 * p], [1, 1550 * p]], vel * 0.8);
  }
  return end;
}

/** One whistled note gliding through [time frac, Hz] points, with a widening vibrato and breath. */
export function whistleNote(s: Studio, dest: Dest, t: number, dur: number, pts: Array<[number, number]>, vel: number): number {
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.02);
  g.gain.setValueAtTime(vel * 0.3, t + dur * 0.75);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const osc = s.osc('sine', pts[0][1], t, t + dur + 0.02, g);
  const h = s.osc('sine', pts[0][1] * 2, t, t + dur + 0.02, s.gain(0.08, g));
  for (const [node, m] of [[osc, 1], [h, 2]] as const) {
    node.frequency.setValueAtTime(pts[0][1] * m, t);
    for (const [x, f] of pts.slice(1)) node.frequency.exponentialRampToValueAtTime(f * m, t + dur * x);
  }
  const v = s.gain(0);
  v.connect(osc.detune);
  v.connect(h.detune);
  v.gain.setValueAtTime(0, t);
  v.gain.linearRampToValueAtTime(40, t + dur);
  s.osc('sine', 9, t, t + dur + 0.02, v);
  const bp = s.filter('bandpass', pts[0][1], 4, g);
  bp.frequency.setValueAtTime(pts[0][1], t);
  for (const [x, f] of pts.slice(1)) bp.frequency.exponentialRampToValueAtTime(f, t + dur * x);
  s.noise('white', t, t + dur + 0.02, s.gain(0.05, bp));
  return t + dur + 0.02;
}

/**
 * A few of the crew shouting "hey!": pressed voices with a breathy "h" onset gliding "eh" to "ee",
 * spread across the stereo field with slightly ragged timing.
 */
export function crewHey(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number; voices?: number; len?: number } = {}): number {
  const p = o.pitch ?? 1;
  const n = o.voices ?? 4;
  const L = o.len ?? 0.28;
  const base = [148, 176, 206, 238, 268, 300];
  let end = t;
  for (let i = 0; i < n; i++) {
    const tt = t + s.rng.next() * 0.028;
    const f0 = base[i % base.length] * p * (0.97 + s.rng.next() * 0.06);
    const pan = s.panner(n === 1 ? 0 : -0.55 + (1.1 * i) / (n - 1), dest);
    // "h"
    const hb = s.filter('bandpass', 1700, 1.2, pan);
    const hg = s.gain(0, hb);
    hg.gain.setValueAtTime(0, tt);
    hg.gain.linearRampToValueAtTime(vel * 0.12, tt + 0.025);
    hg.gain.linearRampToValueAtTime(0, tt + 0.05);
    s.noise('white', tt, tt + 0.06, hg);
    formantVoice(s, pan, tt + 0.035, L, [[0, f0], [0.3, f0 * 1.2], [1, f0 * 1.32]], [[0, 580, 1750], [0.45, 520, 1950], [1, 330, 2250]], (vel * 0.45) / Math.sqrt(n), 0.018, 0.008);
    end = Math.max(end, tt + 0.035 + L);
  }
  return end;
}

/**
 * Glottal saw/pulse source with vibrato through two moving formants (vow: [time frac, F1, F2]).
 * `vib` is the vibrato depth as a fraction of the starting pitch.
 */
export function formantVoice(s: Studio, dest: Dest, t0: number, dur: number, fpts: Array<[number, number]>, vow: Array<[number, number, number]>, amp: number, attack: number, vib = 0.035): void {
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(amp, t0 + attack);
  g.gain.setValueAtTime(amp, t0 + dur * 0.7);
  g.gain.linearRampToValueAtTime(amp * 0.6, t0 + dur * 0.9);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  const src = s.gain(1);
  const f1 = s.filter('bandpass', vow[0][1], 5);
  const f2 = s.filter('bandpass', vow[0][2], 7);
  const f3 = s.filter('bandpass', 3200, 6);
  src.connect(f1); src.connect(f2); src.connect(f3);
  f1.frequency.setValueAtTime(vow[0][1], t0);
  f2.frequency.setValueAtTime(vow[0][2], t0);
  f1.connect(s.gain(2.4, g)); f2.connect(s.gain(1.3, g)); f3.connect(s.gain(0.35, g));
  for (const [frac, F1, F2] of vow) {
    f1.frequency.linearRampToValueAtTime(F1, t0 + dur * frac);
    f2.frequency.linearRampToValueAtTime(F2, t0 + dur * frac);
  }
  const saw = s.osc('sawtooth', fpts[0][1], t0, t0 + dur + 0.02, src);
  const pulse = s.osc('square', fpts[0][1], t0, t0 + dur + 0.02, s.gain(0.5, src), 3);
  for (const osc of [saw, pulse]) {
    osc.frequency.setValueAtTime(fpts[0][1], t0);
    for (const [frac, f] of fpts.slice(1)) osc.frequency.exponentialRampToValueAtTime(f, t0 + dur * frac);
    const vg = s.gain(0, osc.frequency);
    vg.gain.setValueAtTime(0, t0);
    vg.gain.linearRampToValueAtTime(fpts[0][1] * vib, t0 + dur * 0.45);
    vg.gain.linearRampToValueAtTime(fpts[0][1] * vib * 0.6, t0 + dur);
    s.osc('sine', 6.2, t0, t0 + dur + 0.02, vg);
  }
  s.noise('white', t0, t0 + dur + 0.02, s.gain(0.08, src));
}
