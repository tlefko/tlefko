/**
 * DAW-style renderer for the music loops.
 *
 * 1. Every unique note (instrument, pitch, velocity bucket, duration bucket, flags, round-robin take)
 *    is rendered once with Tone.Offline using the normal voice code.
 * 2. Notes are sequenced sample-accurately into mono stems in JS, wrapping at the loop period.
 * 3. A final Tone.Offline mixdown plays the stems through buses (gain/pan/filters), convolution
 *    reverbs and tape wow; the reverb tail past the period is folded back so the loop is seamless.
 *
 * This keeps the Web Audio node count tiny, which matters on a busy machine where each live node
 * is expensive to render.
 */
import * as Tone from 'tone';
import { renderOffline, type Dest, type Studio } from './studio';
import { fold, type Channels, type IrOptions } from './dsp';
import { Rng } from './rng';

export type VoiceFn = (s: Studio, out: Dest, f: number, vel: number, dur: number, flags: string) => unknown;

export interface Instrument {
  name: string;
  voice: VoiceFn;
  /** Seconds to render for a note of frequency f and duration dur. */
  len: (f: number, dur: number) => number;
  velBuckets: number;
  /** Duration quantum (seconds) used in the cache key; 0 = duration does not affect the sound. */
  durStep: number;
  /** Round-robin takes (different random seeds) for natural repetition. */
  rr: number;
}

export function instrument(name: string, voice: VoiceFn, o: { len: number | ((f: number, dur: number) => number); velBuckets?: number; durStep?: number; rr?: number }): Instrument {
  const len = typeof o.len === 'number' ? (() => o.len as number) : o.len;
  return { name, voice, len, velBuckets: o.velBuckets ?? 4, durStep: o.durStep ?? 0, rr: o.rr ?? 1 };
}

export interface StemOptions {
  gain?: number;
  pan?: number;
  hp?: number;
  lp?: number;
  /** reverb name -> send level */
  sends?: Record<string, number>;
  /** route through the shared tape-wow (Tone.Vibrato) */
  wow?: boolean;
}

interface Req {
  key: string;
  inst: Instrument;
  f: number;
  vel: number;
  dur: number;
  flags: string;
  take: number;
  len: number;
}

interface Placement {
  stem: Stem;
  key: string;
  t: number;
  gain: number;
}

export class Stem {
  data: Float32Array;
  constructor(
    public name: string,
    public opts: StemOptions,
    private mixer: Mixer,
  ) {
    this.data = new Float32Array(mixer.n);
  }
  /** Queue a note. `vel` 0..1, `dur` in seconds (used by sustained voices). */
  note(inst: Instrument, t: number, f: number, vel: number, dur = 0, flags = ''): void {
    this.mixer.queue(this, inst, t, f, vel, dur, flags);
  }
  /** Queue a one-off rendered event (e.g. a theremin phrase) at time t. */
  shot(key: string, len: number, t: number, fn: (s: Studio, out: Dest) => unknown, gain = 1): void {
    this.mixer.queueShot(this, key, len, t, fn, gain);
  }
}

export class Mixer {
  readonly n: number;
  private stems: Stem[] = [];
  private reverbs = new Map<string, { ir: IrOptions; ret: number }>();
  private reqs = new Map<string, Req>();
  private shots = new Map<string, { len: number; fn: (s: Studio, out: Dest) => unknown }>();
  private placements: Placement[] = [];
  private rendered = new Map<string, Float32Array>();
  private rng: Rng;
  wow = { rate: 0.375, depth: 0.3 };

  constructor(
    public period: number,
    public sr = 44100,
    public seed = 1,
  ) {
    this.n = Math.round(period * sr);
    this.rng = new Rng(seed ^ 0x2f6b);
  }

  reverb(name: string, ir: IrOptions, ret = 1): void {
    this.reverbs.set(name, { ir, ret });
  }

  stem(name: string, opts: StemOptions = {}): Stem {
    const s = new Stem(name, opts, this);
    this.stems.push(s);
    return s;
  }

  queue(stem: Stem, inst: Instrument, t: number, f: number, vel: number, dur: number, flags: string): void {
    const vb = Math.max(1, Math.round(vel * inst.velBuckets)) / inst.velBuckets;
    const dq = inst.durStep > 0 ? Math.max(inst.durStep, Math.round(dur / inst.durStep) * inst.durStep) : 0;
    const take = inst.rr > 1 ? Math.floor(this.rng.next() * inst.rr) : 0;
    const key = `${inst.name}|${f.toFixed(2)}|${vb.toFixed(3)}|${dq.toFixed(3)}|${flags}|${take}`;
    if (!this.reqs.has(key)) this.reqs.set(key, { key, inst, f, vel: vb, dur: dq, flags, take, len: inst.len(f, dq) });
    this.placements.push({ stem, key, t, gain: vel / vb });
  }

  queueShot(stem: Stem, key: string, len: number, t: number, fn: (s: Studio, out: Dest) => unknown, gain: number): void {
    const k = `shot|${key}`;
    if (!this.shots.has(k)) this.shots.set(k, { len, fn });
    this.placements.push({ stem, key: k, t, gain });
  }

  get uniqueNotes(): number {
    return this.reqs.size + this.shots.size;
  }

  private async renderNotes(concurrency = 6): Promise<void> {
    const jobs: Array<() => Promise<void>> = [];
    for (const r of this.reqs.values()) {
      jobs.push(async () => {
        const seed = (this.seed * 31 + hashKey(r.key)) >>> 0;
        const chs = await renderOffline(r.len, seed, (s) => void r.inst.voice(s, s.out, r.f, r.vel, r.dur, r.flags), { channels: 1, sampleRate: this.sr });
        this.rendered.set(r.key, trimSilence(chs[0]));
      });
    }
    for (const [k, sh] of this.shots) {
      jobs.push(async () => {
        const chs = await renderOffline(sh.len, (this.seed * 17 + hashKey(k)) >>> 0, (s) => void sh.fn(s, s.out), { channels: 1, sampleRate: this.sr });
        this.rendered.set(k, trimSilence(chs[0]));
      });
    }
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        await j();
      }
    };
    const main = Tone.getContext();
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
    Tone.setContext(main);
  }

  private mixStems(): void {
    const n = this.n;
    for (const p of this.placements) {
      const buf = this.rendered.get(p.key);
      if (!buf) continue;
      const d = p.stem.data;
      const start = Math.round(p.t * this.sr);
      const g = p.gain;
      for (let i = 0; i < buf.length; i++) {
        let j = start + i;
        if (j >= n) j %= n;
        else if (j < 0) j = ((j % n) + n) % n;
        d[j] += buf[i] * g;
      }
    }
  }

  /** Render everything and return one folded period (stereo). */
  async render(tail: number): Promise<Channels> {
    const t0 = performance.now();
    await this.renderNotes();
    const t1 = performance.now();
    this.mixStems();
    const stems = this.stems.filter((st) => st.data.some((v) => v !== 0));
    // level report (post-fader, pre-reverb): helps balancing without ears
    const report = stems.map((st) => {
      let sq = 0;
      let pk = 0;
      for (let i = 0; i < st.data.length; i++) {
        const v = st.data[i] * (st.opts.gain ?? 1);
        sq += v * v;
        pk = Math.max(pk, Math.abs(v));
      }
      return `${st.name} ${(10 * Math.log10(sq / st.data.length + 1e-20)).toFixed(1)}/${(20 * Math.log10(pk + 1e-10)).toFixed(1)}`;
    });
    console.info(`[mixer] stems rms/peak dB: ${report.join(', ')}`);
    const chs = await renderOffline(this.period + tail, this.seed, (s) => {
      const returns = new Map<string, AudioNode>();
      for (const [name, rv] of this.reverbs) returns.set(name, s.reverb(`mix-${name}`, rv.ir, rv.ret));
      let wowIn: AudioNode | null = null;
      if (stems.some((st) => st.opts.wow)) {
        const wowOut = s.gain(1, s.out);
        const vib = new Tone.Vibrato({ frequency: s.periodic(this.wow.rate), depth: this.wow.depth, maxDelay: 0.005, wet: 1 });
        vib.connect(wowOut as unknown as Tone.InputNode);
        wowIn = s.gain(1);
        s.connect(wowIn, vib);
        // reverb sends of wow stems are taken after the wow
        for (const [name, amt] of Object.entries(wowSends(stems))) {
          const r = returns.get(name);
          if (r) wowOut.connect(s.gain(amt, r));
        }
      }
      for (const st of stems) {
        const o = st.opts;
        const sends: Array<[AudioNode, number]> = [];
        if (!o.wow) for (const [name, amt] of Object.entries(o.sends ?? {})) {
          const r = returns.get(name);
          if (r) sends.push([r, amt]);
        }
        const bus = s.bus({ gain: o.gain ?? 1, pan: o.pan ?? 0, hp: o.hp, lp: o.lp, sends, dest: o.wow && wowIn ? wowIn : s.out });
        const b = s.buffer([st.data]);
        s.play(b, 0, bus);
      }
    }, { channels: 2, sampleRate: this.sr, loopLen: this.period });
    const t2 = performance.now();
    console.info(`[mixer] ${this.uniqueNotes} unique notes in ${(t1 - t0).toFixed(0)} ms, ${this.placements.length} placements, mixdown ${(t2 - t1).toFixed(0)} ms`);
    return fold(chs, this.n);
  }
}

/** Wow stems share one post-wow send per reverb: use the gain-weighted average send level. */
function wowSends(stems: Stem[]): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const st of stems) if (st.opts.wow) total += st.opts.gain ?? 1;
  for (const st of stems) {
    if (!st.opts.wow) continue;
    for (const [name, amt] of Object.entries(st.opts.sends ?? {})) out[name] = (out[name] ?? 0) + (amt * (st.opts.gain ?? 1)) / Math.max(1e-9, total);
  }
  return out;
}

function trimSilence(c: Float32Array): Float32Array {
  let p = 0;
  for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  const thr = p * 1e-4; // -80 dB
  let end = c.length;
  while (end > 1 && Math.abs(c[end - 1]) <= thr) end--;
  const out = c.slice(0, Math.min(c.length, end + 64));
  // short fade so a note rendered slightly too short can never click
  const f = Math.min(256, out.length);
  for (let i = 0; i < f; i++) out[out.length - f + i] *= Math.cos(((i + 1) / f) * Math.PI * 0.5);
  return out;
}

function hashKey(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) {
    h ^= k.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
