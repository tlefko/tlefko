/** Plain-JS DSP used before/after the Tone.js render: folding loops, IRs, crackle, EQ, WAV. */
import { Rng } from './rng';

export type Channels = Float32Array[];

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => 20 * Math.log10(Math.max(1e-12, g));

export function peak(chs: Channels): number {
  let p = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

export function rms(chs: Channels, from = 0, to?: number): number {
  let s = 0;
  let n = 0;
  for (const c of chs) {
    const end = Math.min(to ?? c.length, c.length);
    for (let i = Math.max(0, from); i < end; i++) {
      s += c[i] * c[i];
      n++;
    }
  }
  return Math.sqrt(s / Math.max(1, n));
}

export function scale(chs: Channels, g: number): void {
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g;
}

/**
 * Loop folding: everything rendered past `n` samples (release tails, reverb) is added back onto the
 * start, so the n-sample result is exactly one period of the infinitely repeated render.
 */
export function fold(chs: Channels, n: number): Channels {
  return chs.map((c) => {
    const out = new Float32Array(n);
    for (let i = 0; i < c.length; i++) out[i % n] += c[i];
    return out;
  });
}

export function fadeOut(chs: Channels, samples: number): void {
  for (const c of chs) {
    const n = Math.min(samples, c.length);
    for (let i = 0; i < n; i++) {
      const g = Math.cos((i / n) * Math.PI * 0.5);
      c[c.length - n + i] *= g * g;
    }
  }
}

export function fadeIn(chs: Channels, samples: number): void {
  for (const c of chs) {
    const n = Math.min(samples, c.length);
    for (let i = 0; i < n; i++) {
      const g = Math.sin((i / n) * Math.PI * 0.5);
      c[i] *= g * g;
    }
  }
}

/** Trim trailing audio below `thresholdDb` relative to the peak, keep a short pad and fade. */
export function trimTail(chs: Channels, sr: number, thresholdDb = -66, minDur = 0.03): Channels {
  const p = peak(chs);
  if (p <= 0) return chs.map((c) => c.slice(0, Math.floor(sr * minDur)));
  const thr = p * dbToGain(thresholdDb);
  let last = 0;
  for (const c of chs) for (let i = c.length - 1; i > last; i--) if (Math.abs(c[i]) > thr) { last = i; break; }
  const end = Math.min(chs[0].length, Math.max(Math.floor(sr * minDur), last + Math.floor(sr * 0.012)));
  const out = chs.map((c) => c.slice(0, end));
  fadeOut(out, Math.min(Math.floor(sr * 0.012), end));
  return out;
}

/** Remove leading silence below threshold (relative to peak). Returns samples removed. */
export function trimHead(chs: Channels, thresholdDb = -60): { chs: Channels; removed: number } {
  const p = peak(chs);
  const thr = p * dbToGain(thresholdDb);
  let first = chs[0].length;
  for (const c of chs) for (let i = 0; i < first; i++) if (Math.abs(c[i]) > thr) { first = i; break; }
  first = Math.max(0, first - 8);
  return { chs: chs.map((c) => c.slice(first)), removed: first };
}

// ---------------------------------------------------------------- biquads (RBJ cookbook)
export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'lowshelf' | 'highshelf';
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function biquad(type: BiquadType, f: number, q: number, sr: number, gainDb = 0): Biquad {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.49)) / sr;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A;
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
      a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s;
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
      a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s;
      break;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Apply a biquad in place. `circular` runs one warm-up pass over the (periodic) signal first so the
 * output is the steady state of the looped signal and the seam stays continuous.
 */
export function applyBiquad(c: Float32Array, q: Biquad, circular = false): void {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const run = (write: boolean) => {
    for (let i = 0; i < c.length; i++) {
      const x = c[i];
      const y = q.b0 * x + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      if (write) c[i] = y;
    }
  };
  if (circular) run(false);
  run(true);
}

export function eq(chs: Channels, sr: number, bands: [BiquadType, number, number, number?][], circular = false): void {
  for (const [type, f, q, g] of bands) {
    const co = biquad(type, f, q, sr, g ?? 0);
    for (const c of chs) applyBiquad(c, co, circular);
  }
}

/** Gentle tape-style soft clip, unity gain for small signals. */
export function saturate(chs: Channels, drive: number): void {
  const k = Math.max(0.01, drive);
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] = Math.tanh(k * c[i]) / k;
}

/** Mid/side width: 0 = mono, 1 = unchanged. */
export function width(chs: Channels, w: number): void {
  if (chs.length < 2) return;
  const [l, r] = chs;
  for (let i = 0; i < l.length; i++) {
    const m = (l[i] + r[i]) * 0.5;
    const s = (l[i] - r[i]) * 0.5 * w;
    l[i] = m + s;
    r[i] = m - s;
  }
}

export function mixInto(dst: Channels, src: Channels, gain = 1, offset = 0, wrap = false): void {
  for (let ch = 0; ch < dst.length; ch++) {
    const d = dst[ch];
    const s = src[Math.min(ch, src.length - 1)];
    for (let i = 0; i < s.length; i++) {
      let j = i + offset;
      if (wrap) j = ((j % d.length) + d.length) % d.length;
      else if (j < 0 || j >= d.length) continue;
      d[j] += s[i] * gain;
    }
  }
}

// ---------------------------------------------------------------- reverb impulse responses
export interface IrOptions {
  seconds: number; // IR length
  rt60: number; // decay time
  predelay?: number; // seconds
  dampStart?: number; // Hz lowpass at t=0
  dampEnd?: number; // Hz lowpass at the end (darker tail)
  early?: number; // number of early reflections
  earlySpread?: number; // seconds over which early reflections arrive
  stereo?: number; // 0..1 decorrelation
  lowCut?: number; // Hz
}

/** Synthetic room: early reflection taps + decorrelated noise tail with progressive damping. */
export function makeIR(sr: number, o: IrOptions, rng: Rng): Channels {
  const n = Math.floor(o.seconds * sr);
  const pre = Math.floor((o.predelay ?? 0.012) * sr);
  const chs: Channels = [new Float32Array(n), new Float32Array(n)];
  const decay = 6.907755 / (o.rt60 * sr);
  const dStart = o.dampStart ?? 9000;
  const dEnd = o.dampEnd ?? 2000;
  const stereo = o.stereo ?? 0.9;
  const shared = new Float32Array(n);
  for (let i = 0; i < n; i++) shared[i] = rng.gauss();
  for (let ch = 0; ch < 2; ch++) {
    const c = chs[ch];
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const fc = dStart * Math.pow(dEnd / dStart, t);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      const x = shared[i] * (1 - stereo) + rng.gauss() * stereo;
      lp += a * (x - lp);
      const env = Math.exp(-decay * (i - pre));
      const fadeInS = Math.min(1, (i - pre) / (0.02 * sr));
      c[i] = lp * env * fadeInS;
    }
    // early reflections
    const count = o.early ?? 10;
    const spread = o.earlySpread ?? 0.05;
    for (let k = 0; k < count; k++) {
      const t = pre + Math.floor(rng.range(0.002, spread) * sr);
      const g = rng.range(0.35, 0.9) * Math.exp(-k * 0.18) * rng.sign() * 2.2;
      if (t + 2 < n) {
        c[t] += g;
        c[t + 1] += g * 0.5;
        c[t + 2] += g * 0.2;
      }
    }
  }
  if (o.lowCut) eq(chs, sr, [['highpass', o.lowCut, 0.7]]);
  // normalise energy so wet levels are comparable between rooms
  const e = rms(chs) * Math.sqrt(n);
  scale(chs, 1 / Math.max(1e-9, e));
  return chs;
}

// ---------------------------------------------------------------- vinyl / film crackle bed
export interface CrackleOptions {
  clicksPerSec: number;
  clickLevel: number; // linear peak of typical clicks
  popsPerSec: number;
  popLevel: number;
  hissLevel: number; // linear RMS
}

/** Periodic (wraps at n) crackle + hiss bed, so it loops seamlessly with the music. */
export function crackleBed(n: number, sr: number, rng: Rng, o: CrackleOptions): Channels {
  const out: Channels = [new Float32Array(n), new Float32Array(n)];
  const dur = n / sr;
  const put = (pos: number, amp: number, freq: number, decayMs: number, pan: number) => {
    const len = Math.floor((decayMs / 1000) * sr * 5);
    const w = (2 * Math.PI * freq) / sr;
    const d = Math.exp(-1 / ((decayMs / 1000) * sr));
    let e = amp;
    for (let i = 0; i < len; i++) {
      const v = e * Math.sin(w * i + 0.3) * (i === 0 ? 1.4 : 1);
      const j = (pos + i) % n;
      out[0][j] += v * (1 - pan * 0.35);
      out[1][j] += v * (1 + pan * 0.35);
      e *= d;
    }
  };
  const clicks = Math.round(o.clicksPerSec * dur);
  for (let k = 0; k < clicks; k++) {
    const amp = o.clickLevel * Math.pow(rng.next(), 2.2) * rng.sign();
    put(Math.floor(rng.next() * n), amp, rng.range(1800, 6500), rng.range(0.25, 0.9), rng.range(-1, 1));
  }
  const pops = Math.round(o.popsPerSec * dur);
  for (let k = 0; k < pops; k++) {
    const amp = o.popLevel * rng.range(0.5, 1) * rng.sign();
    put(Math.floor(rng.next() * n), amp, rng.range(300, 900), rng.range(1.5, 3.5), rng.range(-0.5, 0.5));
  }
  // hiss: band-limited noise, filtered circularly so it wraps cleanly
  const hiss: Channels = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const s = rng.gauss();
    hiss[0][i] = s * 0.7 + rng.gauss() * 0.3;
    hiss[1][i] = s * 0.7 + rng.gauss() * 0.3;
  }
  eq(hiss, sr, [['highpass', 900, 0.7], ['lowpass', 7000, 0.7], ['peaking', 3000, 0.8, 3]], true);
  const hr = rms(hiss);
  mixInto(out, hiss, o.hissLevel / Math.max(1e-9, hr));
  return out;
}

// ---------------------------------------------------------------- WAV (32-bit float)
export function encodeWav(chs: Channels, sr: number): ArrayBuffer {
  const nch = chs.length;
  const len = chs[0].length;
  const dataBytes = len * nch * 4;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, nch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 4, true); v.setUint16(32, nch * 4, true); v.setUint16(34, 32, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  const f = new Float32Array(buf, 44, len * nch);
  for (let i = 0; i < len; i++) for (let ch = 0; ch < nch; ch++) f[i * nch + ch] = chs[ch][i];
  return buf;
}
