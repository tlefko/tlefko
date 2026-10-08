import { Settings } from '../game/Settings';

/**
 * Render quality: one switch the whole game reads (track P owns this file).
 *
 *   import { quality } from '../render/quality';
 *   if (quality.low) { ...do less... }            // read it when you spawn or build, it can change at runtime
 *   const off = quality.onChange((low) => ...);   // fires only when `low` flips; call off() in destroy()
 *
 * Modes (persisted in Settings under 'quality'):
 * - 'auto' (default): low when this device looks weak (detection below), else high.
 * - 'high' / 'low': the player's choice from the menu toggle (track H).
 *
 * Auto detection:
 * - prefers-reduced-motion: reduce (live, follows the OS switch both ways);
 * - Save-Data (`navigator.connection.saveData`);
 * - `navigator.deviceMemory` <= 2 GB, or `hardwareConcurrency` <= 2;
 * - a frame-rate probe: the median frame interval over the first ~2 s after the loading screen goes
 *   (the splash animating) is over 22 ms (under ~45 fps), or later play stays under ~40 fps for 5 s.
 *   This catches iOS Low Power Mode, which caps requestAnimationFrame at 30 Hz, and slow GPUs. The
 *   probe only moves auto from high to low, never back, so it can't flap.
 *
 * QA: `?quality=low|high|auto` overrides the mode for one page load without saving it.
 *
 * What low means:
 * - Track P (render core): device pixel ratio capped (1.5 on phones, 1 on large screens), MSAA off
 *   when low at boot, 30 fps render cap when the player chose low or the device measured slow, no
 *   film grain or dust, lighter background (fewer glints and twinkles, a simpler flag, no lamp
 *   spill, still beam), smaller background rasters where the difference can't be seen.
 * - Every other track cuts work in its own files: fewer particles, no secondary motion loops,
 *   simpler fx. Keep motion time-based (GSAP or dt), so it stays smooth at 30 fps.
 *
 * Menu toggle (track H): show `quality.mode` as the control's state and call `quality.set(m)` when
 * the player changes it. `quality.autoLow` and `quality.reason` say what auto picked and why
 * (e.g. to label the Auto option "Auto (low)"); subscribe with `onChange` to refresh that label.
 */
export type QualityMode = 'auto' | 'high' | 'low';
export type LowReason = 'reduced-motion' | 'save-data' | 'memory' | 'cores' | 'fps';

const MODES: readonly QualityMode[] = ['auto', 'high', 'low'];
const isMode = (v: unknown): v is QualityMode => typeof v === 'string' && (MODES as readonly string[]).includes(v);

/** Probe thresholds (ms per frame). */
const PROBE_SKIP = 20; // ticks after the loading screen goes: the splash settling, not the frame rate
const PROBE_N = 90;
const PROBE_SLOW = 22; // median over the probe window: under ~45 fps
const SLUMP_SLOW = 25; // rolling median while playing: under ~40 fps ...
const SLUMP_MS = 4000; // ... held this long once the median turns (about 5 s of slump in all)

interface Signals {
  reducedMotion: boolean;
  saveData: boolean;
  memory: boolean;
  cores: boolean;
  fps: boolean;
}

class Quality {
  private settings = new Settings();
  private chosen: QualityMode;
  private override: QualityMode | null = null;
  private sig: Signals = { reducedMotion: false, saveData: false, memory: false, cores: false, fps: false };
  private listeners = new Set<(low: boolean) => void>();
  private renderListeners = new Set<() => void>();
  private lastLow: boolean;
  private lastRender: string;
  /** Median frame interval measured by the probe (ms); 0 until measured. */
  frameMs = 0;
  private samples: number[] = [];
  private ring = new Float32Array(96);
  private ringN = 0;
  private slowSince = 0;
  private lastT = 0;
  private skip = PROBE_SKIP;
  private capped = false;
  /** The probe waits for the loading screen to go: boot rasterising says nothing about play. */
  private ready = false;

  constructor() {
    const saved = this.settings.get<unknown>('quality', 'auto');
    this.chosen = isMode(saved) ? saved : 'auto';
    // a write to the setting from anywhere (not only set()) takes effect too
    this.settings.onChange('quality', (v) => {
      if (!isMode(v) || v === this.chosen) return;
      this.override = null;
      this.chosen = v;
      this.emit();
    });
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    this.sig.saveData = !!nav.connection?.saveData;
    this.sig.memory = typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 2;
    this.sig.cores = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 2;
    if (typeof matchMedia !== 'undefined') {
      const mq = matchMedia('(prefers-reduced-motion: reduce)');
      this.sig.reducedMotion = mq.matches;
      mq.addEventListener?.('change', (e) => {
        this.sig.reducedMotion = e.matches;
        this.emit();
      });
    }
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search);
      const o = q.get('quality');
      if (isMode(o)) this.override = o;
      if (q.has('debug')) (window as unknown as { __quality?: Quality }).__quality = this;
    }
    this.lastLow = this.low;
    this.lastRender = this.renderKey();
  }

  /** The active mode: the player's choice, or the QA override for this page load. */
  get mode(): QualityMode {
    return this.override ?? this.chosen;
  }
  set mode(m: QualityMode) {
    this.set(m);
  }

  /** True when the game should do less work (see the header for what that means per track). */
  get low(): boolean {
    const m = this.mode;
    return m === 'low' || (m === 'auto' && this.autoLow);
  }

  /** What 'auto' resolves to on this device right now. */
  get autoLow(): boolean {
    const s = this.sig;
    return s.reducedMotion || s.saveData || s.memory || s.cores || s.fps;
  }

  /** Why the game is in low mode ('manual' = the player picked it), or null when it isn't. */
  get reason(): LowReason | 'manual' | null {
    if (this.mode === 'low') return 'manual';
    if (this.mode === 'high') return null;
    const s = this.sig;
    return s.fps ? 'fps' : s.memory ? 'memory' : s.cores ? 'cores' : s.saveData ? 'save-data' : s.reducedMotion ? 'reduced-motion' : null;
  }

  /**
   * Render at 30 fps: when the player picked low (battery), or the device measured slow (steady
   * 30 beats an uneven 40). Low for reduced motion, memory or cores alone keeps the full rate.
   */
  get fpsCap(): number {
    if (!this.low) return 0;
    return this.mode === 'low' || this.sig.fps ? 30 : 0;
  }

  /** Low for fill-rate reasons (caps the pixel ratio); reduced motion alone keeps full sharpness. */
  get lowRes(): boolean {
    if (!this.low) return false;
    const s = this.sig;
    return this.mode === 'low' || s.fps || s.memory || s.cores || s.saveData;
  }

  set(m: QualityMode) {
    if (!isMode(m)) return;
    this.override = null; // the player's choice beats the QA override
    this.chosen = m;
    this.settings.set('quality', m);
    this.emit();
  }

  onChange(fn: (low: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /**
   * For the render core (Scene): fires when anything the renderer depends on changes, including
   * `lowRes` or `fpsCap` while `low` itself stays the same (reduced motion, then a slow probe).
   */
  onRenderChange(fn: () => void): () => void {
    this.renderListeners.add(fn);
    return () => void this.renderListeners.delete(fn);
  }

  private renderKey() {
    return `${this.low}|${this.lowRes}|${this.fpsCap}`;
  }

  /**
   * Feed one rendered frame (Stage calls this every tick). `capped` = a render cap is active, so
   * intervals say nothing about the device.
   */
  frame(now: number, capped = false) {
    const dt = this.lastT ? now - this.lastT : 0;
    this.lastT = now;
    this.capped = capped;
    if (this.mode !== 'auto' || this.sig.fps || capped) return;
    if (!this.ready) {
      const boot = typeof document !== 'undefined' ? document.getElementById('boot') : null;
      if (boot && !boot.classList.contains('gone')) return;
      this.ready = true;
    }
    if (!dt || dt > 200 || (typeof document !== 'undefined' && document.hidden)) return;
    if (this.skip > 0) {
      this.skip--;
      return;
    }
    if (this.samples.length < PROBE_N) {
      this.samples.push(dt);
      if (this.samples.length === PROBE_N) {
        this.frameMs = median(this.samples);
        if (this.frameMs > PROBE_SLOW) this.markSlow();
      }
      return;
    }
    // after the probe: watch for a sustained slump (Low Power Mode switched on, thermal throttling)
    this.ring[this.ringN++ % this.ring.length] = dt;
    if (this.ringN % 12 !== 0 || this.ringN < this.ring.length) return;
    const m = median(Array.from(this.ring));
    this.frameMs = m;
    if (m <= SLUMP_SLOW) this.slowSince = 0;
    else if (!this.slowSince) this.slowSince = now;
    else if (now - this.slowSince > SLUMP_MS) this.markSlow();
  }

  private markSlow() {
    this.sig.fps = true;
    this.emit();
  }

  private emit() {
    const low = this.low;
    const key = this.renderKey();
    const lowChanged = low !== this.lastLow;
    const renderChanged = key !== this.lastRender;
    this.lastLow = low;
    this.lastRender = key;
    if (lowChanged) for (const fn of [...this.listeners]) fn(low);
    if (renderChanged) for (const fn of [...this.renderListeners]) fn();
  }

  /** Debug summary (for the perf tools). */
  describe() {
    return { mode: this.mode, low: this.low, reason: this.reason, frameMs: +this.frameMs.toFixed(2), fpsCap: this.fpsCap, lowRes: this.lowRes, capped: this.capped, signals: { ...this.sig } };
  }
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
}

export const quality = new Quality();
