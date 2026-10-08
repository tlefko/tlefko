import { Application } from 'pixi.js';
import gsap from 'gsap';
import { PixiPlugin } from 'gsap/PixiPlugin';
import { CustomEase } from 'gsap/CustomEase';
import * as PIXI from 'pixi.js';
import { quality } from './quality';
import { setTextureUpload } from './textures';

gsap.registerPlugin(PixiPlugin, CustomEase);
PixiPlugin.registerPIXI(PIXI);

// House eases (motion language). Cartoon timing: fast anticipation, snappy settle.
CustomEase.create('drop', 'M0,0 C0.34,0 0.62,0.35 1,1'); // gravity-ish accelerate
CustomEase.create('land', 'M0,0 C0.18,0.9 0.3,1.08 0.55,1.02 0.75,0.98 0.86,1 1,1');
CustomEase.create('swift', 'M0,0 C0.16,1 0.3,1 1,1'); // EASE_SWIFT [0.16,1,0.3,1]
CustomEase.create('ui', 'M0,0 C0.4,0 0.2,1 1,1'); // cubic-bezier(.4,0,.2,1)
CustomEase.create('enter', 'M0,0 C0.165,0.84 0.44,1 1,1');

export type FrameFn = (dtMs: number, t: number) => void;

export class Stage {
  app = new Application();
  private frameFns = new Set<FrameFn>();
  resolution = 1;
  /** Real time of the last rendered frame, and GSAP time accumulated since (lag-smoothed ms). */
  private lastRender = 0;
  private acc = 0;
  /** Frame work of the last rendered frame (ms): update + render submit, for the perf tools. */
  workMs = 0;

  async init(host: HTMLElement) {
    this.resolution = pickResolution();
    const lowAtBoot = quality.lowRes;
    await this.app.init({
      resizeTo: host,
      // MSAA and the discrete GPU only when we can afford them: both are fixed at context creation
      antialias: !lowAtBoot,
      autoDensity: true,
      resolution: this.resolution,
      background: '#0d0b0c',
      preference: 'webgl',
      powerPreference: lowAtBoot ? 'low-power' : 'high-performance',
      autoStart: false,
      sharedTicker: false,
      // Pixi unloads GPU resources unused for a minute by default: the wheel, chest, coin and card art
      // only shows in big moments, minutes apart, and would re-upload right then. Keep them resident for
      // the session (our code frees what it replaces on relayout).
      gcMaxUnusedTime: 30 * 60_000,
      gcFrequency: 60_000,
    });
    setTextureUpload((t) => this.app.renderer.texture.initSource(t.source));
    host.appendChild(this.app.canvas);
    this.app.canvas.setAttribute('aria-label', 'Game board');
    // GSAP owns the clock: tweens update first, then per-frame logic, then one render.
    this.app.ticker.stop();
    gsap.ticker.lagSmoothing(250, 33);
    gsap.ticker.add((time, dt) => {
      const now = performance.now();
      const cap = quality.fpsCap;
      quality.frame(now, cap > 0);
      this.acc += dt;
      // Low mode renders at a steady 30: every 2nd frame at 60 Hz, every 4th at 120 Hz, every frame
      // under iOS Low Power Mode. The 4 ms slack absorbs timer jitter so pacing never stutters to 3.
      if (cap && this.lastRender && now - this.lastRender < 1000 / cap - 4) return;
      this.lastRender = now;
      const step = Math.min(this.acc, 100);
      this.acc = 0;
      for (const fn of this.frameFns) fn(step, time);
      this.app.renderer.render(this.app.stage);
      this.workMs = performance.now() - now;
    });
  }

  onFrame(fn: FrameFn) {
    this.frameFns.add(fn);
    return () => this.frameFns.delete(fn);
  }

  /** Change the render resolution in place (the caller re-rasterises textures for it). */
  setResolution(r: number) {
    if (r === this.resolution) return;
    this.resolution = r;
    this.app.renderer.resize(this.app.screen.width, this.app.screen.height, r);
  }
}

/**
 * Keep fill-rate sane on huge or dense screens while staying sharp on phones. Low quality caps the
 * ratio at 1.5 and the backing store at ~1.3 MP: phones stay crisp at 1.5x, big screens drop to 1x.
 */
export function pickResolution(low = quality.lowRes): number {
  const dpr = window.devicePixelRatio || 1;
  const px = window.innerWidth * window.innerHeight;
  const budget = low ? 1_300_000 : 9_000_000;
  let r = Math.min(dpr, low ? 1.5 : 2);
  while (r > 1 && px * r * r > budget) r -= 0.25;
  return r;
}
