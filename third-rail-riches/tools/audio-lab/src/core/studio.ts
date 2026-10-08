/**
 * Studio: a thin toolkit around a Tone.js OfflineContext. Voices are built from nodes created on the
 * offline context (so they render inside Tone.Offline) and scheduled sample-accurately.
 */
import * as Tone from 'tone';
import { Rng } from './rng';
import { makeIR, type IrOptions, type Channels } from './dsp';

export type Node = AudioNode | Tone.ToneAudioNode;
export type Dest = Node | AudioParam;
export type NoiseColor = 'white' | 'pink' | 'brown';

export interface BusOptions {
  gain?: number;
  pan?: number;
  hp?: number;
  lp?: number;
  dest?: Dest;
  sends?: Array<[AudioNode, number]>;
}

export class Studio {
  readonly ctx: Tone.BaseContext;
  readonly sr: number;
  readonly rng: Rng;
  /** Master bus -> offline destination. */
  readonly out: GainNode;
  /** Loop period in seconds when rendering a loop (0 for one-shots). */
  loopLen = 0;
  private noiseCache = new Map<string, AudioBuffer>();
  private reverbs = new Map<string, GainNode>();
  private waves = new Map<string, PeriodicWave>();

  constructor(ctx: Tone.BaseContext, seed: number) {
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    this.rng = new Rng(seed);
    this.out = ctx.createGain();
    this.out.connect(ctx.rawContext.destination as unknown as AudioNode);
  }

  connect(src: Node, dst: Dest): void {
    Tone.connect(src as never, dst as never);
  }

  // ------------------------------------------------------------------ node factories
  gain(v = 1, dest?: Dest): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    if (dest) this.connect(g, dest);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.707, dest?: Dest, gainDb = 0): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, this.sr * 0.45);
    f.Q.value = q;
    f.gain.value = gainDb;
    if (dest) this.connect(f, dest);
    return f;
  }

  panner(p: number, dest?: Dest): StereoPannerNode {
    const n = this.ctx.createStereoPanner();
    n.pan.value = Math.max(-1, Math.min(1, p));
    if (dest) this.connect(n, dest);
    return n;
  }

  shaper(curve: Float32Array, dest?: Dest, oversample: OverSampleType = '2x'): WaveShaperNode {
    const w = this.ctx.createWaveShaper();
    w.curve = curve as Float32Array<ArrayBuffer>;
    w.oversample = oversample;
    if (dest) this.connect(w, dest);
    return w;
  }

  /** tanh soft-clip curve. */
  softClip(drive: number, n = 2048): Float32Array {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(drive * x) / Math.tanh(drive);
    }
    return c;
  }

  delay(time: number, dest?: Dest, max = 2): DelayNode {
    const d = this.ctx.createDelay(max);
    d.delayTime.value = time;
    if (dest) this.connect(d, dest);
    return d;
  }

  osc(type: OscillatorType | PeriodicWave, freq: number, t0: number, t1: number, dest: Dest, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type as OscillatorType;
    else o.setPeriodicWave(type);
    o.frequency.value = freq;
    o.detune.value = detune;
    this.connect(o, dest);
    o.start(Math.max(0, t0));
    o.stop(Math.max(t0 + 0.001, t1));
    return o;
  }

  /** Additive periodic wave from harmonic amplitudes [h1, h2, ...]. Cached. */
  wave(harmonics: number[]): PeriodicWave {
    const key = harmonics.join(',');
    let w = this.waves.get(key);
    if (!w) {
      const real = new Float32Array(harmonics.length + 1);
      const imag = new Float32Array(harmonics.length + 1);
      harmonics.forEach((a, i) => (imag[i + 1] = a));
      w = this.ctx.createPeriodicWave(real, imag);
      this.waves.set(key, w);
    }
    return w;
  }

  noiseBuffer(color: NoiseColor, seconds = 6): AudioBuffer {
    const key = `${color}:${seconds}`;
    let b = this.noiseCache.get(key);
    if (b) return b;
    const n = Math.floor(seconds * this.sr);
    b = this.ctx.createBuffer(2, n, this.sr);
    const r = this.rng.fork(color.length * 97 + seconds);
    for (let ch = 0; ch < 2; ch++) {
      const d = new Float32Array(n);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = r.next() * 2 - 1;
        if (color === 'white') d[i] = w * 0.5;
        else if (color === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.08;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
      b.copyToChannel(d, ch);
    }
    this.noiseCache.set(key, b);
    return b;
  }

  noise(color: NoiseColor, t0: number, t1: number, dest: Dest, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    const buf = this.noiseBuffer(color);
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    this.connect(src, dest);
    src.start(Math.max(0, t0), this.rng.range(0, buf.duration - 0.5));
    src.stop(Math.max(t0 + 0.001, t1));
    return src;
  }

  buffer(chs: Channels): AudioBuffer {
    const b = this.ctx.createBuffer(chs.length, chs[0].length, this.sr);
    chs.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return b;
  }

  play(buf: AudioBuffer, t0: number, dest: Dest, o: { rate?: number; offset?: number; duration?: number } = {}): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    this.connect(src, dest);
    if (o.duration !== undefined) src.start(Math.max(0, t0), o.offset ?? 0, o.duration);
    else src.start(Math.max(0, t0), o.offset ?? 0);
    return src;
  }

  constant(value: number, t0: number, t1: number, dest: Dest): ConstantSourceNode {
    const c = this.ctx.createConstantSource();
    c.offset.value = value;
    this.connect(c, dest);
    c.start(t0);
    c.stop(t1);
    return c;
  }

  /** LFO into an AudioParam. When rendering a loop the rate snaps to whole cycles per loop. */
  lfo(param: AudioParam, rate: number, depth: number, t0: number, t1: number, type: OscillatorType = 'sine', phaseDelay = 0): OscillatorNode {
    const g = this.gain(depth, param);
    const o = this.osc(type, this.periodic(rate), t0 - phaseDelay, t1, g);
    return o;
  }

  periodic(rate: number): number {
    if (!this.loopLen) return rate;
    return Math.max(1, Math.round(rate * this.loopLen)) / this.loopLen;
  }

  /** Mixer channel: input -> [hp] -> [lp] -> pan -> fader -> dest, with post-fader sends. */
  bus(o: BusOptions = {}): GainNode {
    const input = this.gain(1);
    let node: AudioNode = input;
    if (o.hp) { const f = this.filter('highpass', o.hp, 0.7); node.connect(f); node = f; }
    if (o.lp) { const f = this.filter('lowpass', o.lp, 0.7); node.connect(f); node = f; }
    const pan = this.panner(o.pan ?? 0);
    node.connect(pan);
    const fader = this.gain(o.gain ?? 1, o.dest ?? this.out);
    pan.connect(fader);
    for (const [send, amt] of o.sends ?? []) {
      const s = this.gain(amt, send);
      fader.connect(s);
    }
    return input;
  }

  /** Convolution reverb bus (cached per key). Returns its input; output goes to `dest`. */
  reverb(key: string, ir: IrOptions, returnGain = 1, dest: Dest = this.out): GainNode {
    const existing = this.reverbs.get(key);
    if (existing) return existing;
    const input = this.gain(1);
    const conv = this.ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = this.buffer(makeIR(this.sr, ir, this.rng.fork(key.length * 131)));
    input.connect(conv);
    const ret = this.gain(returnGain, dest);
    conv.connect(ret);
    this.reverbs.set(key, input);
    return input;
  }

  // ------------------------------------------------------------------ envelopes
  /** Percussive envelope: linear attack to `peakV`, exponential decay reaching -60 dB after t60. */
  perc(p: AudioParam, t: number, peakV: number, attack: number, t60: number, base = 0): number {
    t = Math.max(0, t);
    p.setValueAtTime(base, t);
    p.linearRampToValueAtTime(peakV, t + attack);
    p.setTargetAtTime(base, t + attack, Math.max(0.0005, t60 / 6.9));
    return t + attack + t60;
  }

  /** ADSR on a gain param; returns the time the release finishes. */
  adsr(p: AudioParam, t: number, dur: number, a: number, d: number, s: number, r: number, peakV = 1): number {
    t = Math.max(0, t);
    const off = t + Math.max(dur, 0.005);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peakV, t + a);
    if (off > t + a) p.setTargetAtTime(peakV * s, t + a, Math.max(0.001, d / 3));
    p.setTargetAtTime(0, Math.max(off, t + a), Math.max(0.001, r / 5));
    return Math.max(off, t + a) + r * 1.4;
  }

  /** Piecewise-linear automation [[time, value], ...]. */
  ramp(p: AudioParam, pts: Array<[number, number]>, exp = false): void {
    p.setValueAtTime(pts[0][1], pts[0][0]);
    for (let i = 1; i < pts.length; i++) {
      const [tt, v] = pts[i];
      if (exp) p.exponentialRampToValueAtTime(Math.max(1e-4, v), tt);
      else p.linearRampToValueAtTime(v, tt);
    }
  }
}

/** Render helper: run `build` inside Tone.Offline and return channel data. */
export async function renderOffline(
  seconds: number,
  seed: number,
  build: (s: Studio) => void | Promise<void>,
  opts: { channels?: number; sampleRate?: number; loopLen?: number } = {},
): Promise<Channels> {
  const sr = opts.sampleRate ?? 44100;
  const t0 = performance.now();
  let tBuilt = 0;
  const buf = await Tone.Offline(
    async (ctx) => {
      const s = new Studio(ctx, seed);
      s.loopLen = opts.loopLen ?? 0;
      await build(s);
      tBuilt = performance.now();
    },
    seconds,
    opts.channels ?? 2,
    sr,
  );
  const tDone = performance.now();
  if (seconds > 8) console.info(`[render] ${seconds.toFixed(1)} s: build ${(tBuilt - t0).toFixed(0)} ms, render ${(tDone - tBuilt).toFixed(0)} ms`);
  const raw = buf.get();
  if (!raw) throw new Error('offline render produced no buffer');
  const out: Channels = [];
  for (let ch = 0; ch < raw.numberOfChannels; ch++) out.push(new Float32Array(raw.getChannelData(ch)));
  return out;
}
