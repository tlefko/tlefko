import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { softDotTexture } from '../textures';
import { T } from '../timing';
import { quality } from '../quality';
import type { Layout } from '../layout';
import type { Particles } from '../fx/Particles';
import type { FxKit } from './FxKit';

/**
 * The visual pieces of a blast, spawned into the board's fx layer (above the symbols) and scorch
 * layer (under them): the inked blast star, a soft flash, the inked shockwave with a heat ring
 * behind it, smoke, debris, sparks, and the scorch decal the refill lands on. Everything is
 * time-based (T), self-cleaning, and thinned at low quality.
 */
export class BlastFx {
  constructor(
    private layer: Container,
    private scorchLayer: Container,
    private kit: FxKit,
    private fx: Particles,
    private getL: () => Layout,
  ) {}

  private get S() {
    return this.getL().S;
  }

  /** A soft additive glow that swells and fades (flashes, fuse flares, the board light of a boom). */
  glow(x: number, y: number, size: number, tint: number, alpha = 0.8, dur = 0.35, grow = 1.25): void {
    const f = new Sprite(softDotTexture());
    f.anchor.set(0.5);
    f.blendMode = 'add';
    f.tint = tint;
    f.position.set(x, y);
    f.width = f.height = size;
    f.alpha = alpha;
    this.layer.addChild(f);
    const k = f.scale.x;
    gsap.to(f.scale, { x: k * grow, y: k * grow, duration: T(dur), ease: 'power2.out' });
    gsap.to(f, { alpha: 0, duration: T(dur), ease: 'power2.out', onComplete: () => f.destroy() });
  }

  /** The cartoon blast star: punches out, turns a little, burns off. */
  star(x: number, y: number, size: number, dur = 0.3): void {
    const tex = this.kit.star;
    if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = Math.random() * Math.PI * 2;
    const k = size / tex.width;
    s.scale.set(k * 0.25);
    this.layer.addChild(s);
    gsap
      .timeline({ onComplete: () => s.destroy() })
      .to(s.scale, { x: k * 1.08, y: k * 1.08, duration: T(0.07), ease: 'power3.out' })
      .to(s.scale, { x: k * 1.2, y: k * 1.2, duration: T(dur * 0.75), ease: 'sine.out' })
      .to(s, { rotation: s.rotation + 0.35, duration: T(dur * 0.75 + 0.07), ease: 'none' }, 0)
      .to(s, { alpha: 0, duration: T(dur * 0.55), ease: 'power2.in' }, T(0.07 + dur * 0.2));
  }

  /**
   * Inked shockwave: a broken ring of hot speed-strokes that races out, thinning as it grows (so a
   * big ring never turns into a fat band), with a soft heat ring just ahead of it. `r1` = final radius.
   */
  ring(x: number, y: number, r1: number, dur = 0.42, delay = 0, tint = 0xffc233): void {
    const S = this.S;
    const r0 = S * 0.35;
    const g = new Graphics();
    g.position.set(x, y);
    g.rotation = Math.random() * Math.PI * 2;
    const heat = new Sprite(this.kit.glow);
    heat.anchor.set(0.5);
    heat.blendMode = 'add';
    heat.tint = 0xffc070;
    heat.position.set(x, y);
    heat.alpha = 0;
    const gk = (r: number) => (r * 2) / (this.kit.glow.width * 0.86);
    heat.scale.set(gk(r0));
    this.layer.addChild(heat, g);
    const n = quality.low ? 7 : 11;
    const gaps = Array.from({ length: n }, () => 0.55 + Math.random() * 0.25);
    const st = { p: 0 };
    const draw = () => {
      const p = st.p;
      const e = 1 - Math.pow(1 - p, 2.2);
      const r = r0 + (r1 - r0) * e;
      const w = S * 0.13 * (1 - 0.72 * e);
      const a = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
      g.clear();
      if (a <= 0) return;
      for (const [width, color, alpha] of [
        [w + S * 0.05, 0x1b1311, 0.9],
        [w, tint, 1],
        [w * 0.35, 0xfff3b8, 1],
      ] as const) {
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = a0 + ((Math.PI * 2) / n) * gaps[i];
          g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r).arc(0, 0, r, a0, a1);
        }
        g.stroke({ width, color, alpha: alpha * a, cap: 'round' });
      }
      heat.scale.set(gk(r * 1.08));
      heat.alpha = 0.8 * a * (1 - e * 0.6);
    };
    gsap
      .timeline({ delay: T(delay), onComplete: () => (g.destroy(), heat.destroy()) })
      .to(st, { p: 1, duration: T(dur), ease: 'none', onUpdate: draw })
      .to(g, { rotation: g.rotation + 0.3, duration: T(dur), ease: 'none' }, 0);
  }

  /** Scorch decal under the symbols: flashes in hot, then cools and fades while the refill lands on it. */
  scorch(x: number, y: number, size: number, hold = 0.5): void {
    const list = this.kit.scorch;
    if (!list.length) return;
    const s = new Sprite(list[(Math.random() * list.length) | 0]);
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = Math.random() * Math.PI * 2;
    s.width = s.height = size;
    s.alpha = 0;
    s.tint = 0xffffff;
    this.scorchLayer.addChild(s);
    gsap
      .timeline({ onComplete: () => s.destroy() })
      .to(s, { alpha: 1, duration: T(0.06) })
      .to(s, { pixi: { tint: 0x9a8a80 }, duration: T(1.1), ease: 'power1.out' }, T(0.1))
      .to(s, { alpha: 0, duration: T(1.2), ease: 'power1.in' }, T(0.1 + hold));
  }

  /**
   * One Powder Keg blast at (x, y): flash, star, shockwave, staves and hoops, sparks, smoke and a
   * scorch. `power` scales it (bomb detonations call `bomb()` instead).
   */
  keg(x: number, y: number, power = 1): void {
    const S = this.S;
    const low = quality.low;
    const L = this.getL();
    this.glow(x, y, S * 5.2 * power, 0xff9a3a, 0.55, 0.4, 1.15);
    this.glow(x, y, S * 2.2 * power, 0xfff0c0, 0.95, 0.22, 1.3);
    this.star(x, y, S * 2.7 * power, 0.28);
    this.ring(x, y, S * 2.2 * power, 0.4);
    // light thrown across the whole hold
    this.glow(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h / 2, Math.max(L.frame.w, L.frame.h) * 1.3, 0xff7a2a, low ? 0.18 : 0.26, 0.4, 1);
    this.fx.debris(x, y, 10 * power, power);
    this.fx.sparks(x, y, 16 * power, 1.3 * power);
    this.fx.embers(x, y, 8);
    gsap.delayedCall(T(0.05), () => this.fx.smoke(x, y, 4 * power, 1.1 * power));
    this.scorch(x, y, S * 1.9 * power);
  }

  /**
   * A Kaboom Bomb detonation: everything a keg does, bigger and longer, plus a second shockwave
   * and a white-hot core. `radius` 1 = 3x3, 2 = 5x5.
   */
  bomb(x: number, y: number, radius: 1 | 2): void {
    const S = this.S;
    const L = this.getL();
    const k = radius === 2 ? 1.75 : 1.25;
    this.glow(x, y, S * 6.5 * k, 0xff8a2a, 0.65, 0.55, 1.12);
    this.glow(x, y, S * 2.8 * k, 0xffffff, 1, 0.26, 1.35);
    this.star(x, y, S * 3 * k, 0.4);
    this.ring(x, y, S * (radius === 2 ? 3.4 : 2.3) * 1.05, 0.46, 0, 0xffc233);
    this.ring(x, y, S * (radius === 2 ? 4.6 : 3.1), 0.56, 0.1, 0xff7a1f);
    this.glow(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h / 2, Math.max(L.frame.w, L.frame.h) * 1.5, 0xff6a1a, quality.low ? 0.24 : 0.38, 0.55, 1);
    this.fx.debris(x, y, 14 * k, 1.2 * k);
    this.fx.sparks(x, y, 24 * k, 1.6 * k);
    this.fx.embers(x, y, 12);
    gsap.delayedCall(T(0.04), () => this.fx.smoke(x, y, 6 * k, 1.35 * k, 0x7d7068));
    gsap.delayedCall(T(0.2), () => this.fx.smoke(x, y, 2 * k, 1.8 * k, 0x93867c));
    this.scorch(x, y, S * 2.4 * k, 0.7);
  }

  /**
   * The square a bomb is about to clear: a fiery frame and a hot wash over the cells, pulsing
   * faster as the fuse runs out; returns a function that flashes it white and removes it.
   */
  area(cells: number[], dur: number): () => void {
    const L = this.getL();
    const S = L.S;
    const ROWS = 5;
    let c0 = 99;
    let c1 = -1;
    let r0 = 99;
    let r1 = -1;
    for (const p of cells) {
      const c = Math.floor(p / ROWS);
      const r = p % ROWS;
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
    }
    const x0 = L.grid.x + c0 * (S + L.gx) - L.gx * 0.3;
    const x1 = L.grid.x + c1 * (S + L.gx) + S + L.gx * 0.3;
    const y0 = L.grid.y + r0 * S + S * 0.02;
    const y1 = L.grid.y + (r1 + 1) * S - S * 0.02;
    const g = new Graphics();
    g.blendMode = 'add';
    const rr = S * 0.16;
    g.roundRect(x0, y0, x1 - x0, y1 - y0, rr).fill({ color: 0xff5a1a, alpha: 0.16 });
    g.roundRect(x0, y0, x1 - x0, y1 - y0, rr).stroke({ width: S * 0.16, color: 0xff5a1a, alpha: 0.3 });
    g.roundRect(x0, y0, x1 - x0, y1 - y0, rr).stroke({ width: S * 0.06, color: 0xffb040, alpha: 0.8 });
    g.roundRect(x0, y0, x1 - x0, y1 - y0, rr).stroke({ width: S * 0.02, color: 0xfff0c0, alpha: 1 });
    g.alpha = 0;
    this.layer.addChild(g);
    const beats = Math.max(2, Math.round(dur / 0.16));
    const tl = gsap.timeline();
    tl.to(g, { alpha: 1, duration: T(0.08) });
    for (let i = 0; i < beats; i++) tl.to(g, { alpha: i % 2 ? 1 : 0.45, duration: T(Math.max(0.05, (dur / beats) * (1 - i / (beats * 1.6)))), ease: 'sine.inOut' });
    return () => {
      tl.kill();
      gsap
        .timeline({ onComplete: () => g.destroy() })
        .to(g, { alpha: 1, duration: T(0.03) })
        .to(g, { pixi: { tint: 0xffffff }, duration: T(0.03) }, 0)
        .to(g, { alpha: 0, duration: T(0.25), ease: 'power2.out' });
    };
  }
}
