import { Container, Sprite, Texture } from 'pixi.js';
import { svgTexture } from '../textures';
import { puff, twinkle, ember, note, smoke, spark, streak, shine } from '../../art/fx';
import { fareCoin } from '../../art/specials';
import { C } from '../../art/kit';
import { quality } from '../quality';
import { T } from '../timing';

type Kind =
  | 'puff'
  | 'star'
  | 'ember'
  | 'green'
  | 'note'
  | 'coinB'
  | 'coinS'
  | 'coinG'
  | 'smoke'
  | 'smoke2'
  | 'bolt'
  | 'volt'
  | 'streak'
  | 'shine';

const ALL_KINDS: Kind[] = ['puff', 'star', 'ember', 'green', 'note', 'coinB', 'coinS', 'coinG', 'smoke', 'smoke2', 'bolt', 'volt', 'streak', 'shine'];

interface P {
  s: Sprite;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  age: number;
  spin: number;
  s0: number;
  s1: number;
  a0: number;
  fadeIn: number;
  flip?: boolean;
  /** Rotate along the velocity and stretch with speed (spark streaks). */
  align?: boolean;
  /** Scale swells in and out (sin curve) instead of lerping s0 -> s1 (glints). */
  pulse?: boolean;
}

type SpawnOpts = Partial<Omit<P, 's'>> & { size: number; tint?: number; blend?: 'add' | 'normal'; rot?: number };

/** Particle budget: live sprites at most, and how much of each emitter's count to spawn. */
const BUDGET = { high: { max: 480, k: 1 }, low: { max: 170, k: 0.4 } };

/**
 * Pooled sprite particles: cartoon smoke puffs, twinkles, embers, feathers, coins, and the blast
 * kit (billowing smoke, flying staves and hoops, spark streaks, landing dust, glints).
 * Simple Euler integration. Low quality (render/quality.ts) caps the live count and thins every
 * emitter, so bursts still read but cost a fraction.
 */
export class Particles extends Container {
  private tex = new Map<Kind, Texture>();
  private live: P[] = [];
  private pool: Sprite[] = [];
  private unit = 64;
  max = BUDGET.high.max;

  constructor() {
    super();
    this.eventMode = 'none';
    const apply = (low: boolean) => (this.max = low ? BUDGET.low.max : BUDGET.high.max);
    apply(quality.low);
    quality.onChange(apply);
  }

  async build(S: number, res: number) {
    this.unit = S;
    const px = (k: number) => Math.round(S * k * res);
    const entries: [Kind, Promise<Texture>][] = [
      ['puff', svgTexture('fx-puff', puff(), px(0.55))],
      ['star', svgTexture('fx-star', twinkle(), px(0.3))],
      ['ember', svgTexture('fx-ember', ember(), px(0.18))],
      ['green', svgTexture('fx-green', ember(C.green), px(0.18))],
      ['note', svgTexture('fx-note', note(), px(0.3))],
      ['coinB', svgTexture('fx-coinB', fareCoin('bronze'), px(0.42))],
      ['coinS', svgTexture('fx-coinS', fareCoin('silver'), px(0.42))],
      ['coinG', svgTexture('fx-coinG', fareCoin('gold'), px(0.42))],
      ['smoke', svgTexture('fx-smoke0', smoke(0), px(0.9))],
      ['smoke2', svgTexture('fx-smoke1', smoke(1), px(0.9))],
      ['bolt', svgTexture('fx-bolt', spark(), px(0.4))],
      ['volt', svgTexture('fx-volt', ember(C.volt), px(0.18))],
      ['streak', svgTexture('fx-streak', streak(), px(0.32), px(0.08))],
      ['shine', svgTexture('fx-shine', shine(), px(0.4))],
    ];
    const done = await Promise.all(entries.map(([, p]) => p));
    entries.forEach(([k], i) => this.tex.set(k, done[i]));
  }

  /** Every texture this system draws with (the presenter uploads them to the GPU before play). */
  textures(): Texture[] {
    return ALL_KINDS.map((k) => this.tex.get(k)).filter((t): t is Texture => !!t);
  }

  /** How many of `n` to spawn at the current quality (never rounds a requested burst down to nothing). */
  private n(n: number): number {
    if (n <= 0) return 0;
    const k = quality.low ? BUDGET.low.k : BUDGET.high.k;
    return Math.max(1, Math.round(n * k));
  }

  private spawn(kind: Kind, x: number, y: number, o: SpawnOpts) {
    if (this.live.length >= this.max) return;
    const s = this.pool.pop() ?? new Sprite();
    s.texture = this.tex.get(kind) ?? Texture.WHITE;
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = o.rot ?? Math.random() * Math.PI * 2 * (kind === 'puff' || kind === 'smoke' || kind === 'smoke2' ? 0.2 : 1);
    s.tint = o.tint ?? 0xffffff;
    s.blendMode = o.blend ?? 'normal';
    const base = o.size / Math.max(1, s.texture.width);
    s.scale.set(base * (o.pulse ? 0 : (o.s0 ?? 1)));
    s.alpha = o.fadeIn ? 0 : (o.a0 ?? 1);
    this.addChild(s);
    // turbo / slam: the air clears faster too (never below about half the normal life)
    const k = Math.max(0.55, Math.min(1, T(1)));
    this.live.push({
      s,
      vx: (o.vx ?? 0) / k,
      vy: (o.vy ?? 0) / k,
      g: (o.g ?? 0) / (k * k),
      drag: (o.drag ?? 0) / k,
      life: (o.life ?? 1) * k,
      age: 0,
      spin: o.spin ?? 0,
      s0: base * (o.s0 ?? 1),
      s1: base * (o.s1 ?? 1),
      a0: o.a0 ?? 1,
      fadeIn: o.fadeIn ?? 0,
      flip: o.flip,
      align: o.align,
      pulse: o.pulse,
    });
  }

  /** Cartoon "poof" where a winning symbol vanishes: a quick ring of small puffs + two twinkles. */
  poof(x: number, y: number) {
    const U = this.unit;
    const n = quality.low ? 3 : 4;
    const rot = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const sp = U * (0.75 + Math.random() * 0.35);
      this.spawn('puff', x + Math.cos(a) * U * 0.1, y + Math.sin(a) * U * 0.1, {
        size: U * (0.2 + Math.random() * 0.06),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - U * 0.15,
        drag: 5.5,
        life: 0.34 + Math.random() * 0.08,
        s0: 0.45,
        s1: 1.35,
        a0: 0.9,
        spin: (Math.random() - 0.5) * 2.5,
        tint: 0xe6e0d4,
      });
    }
    for (let i = 0; i < this.n(2); i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn('star', x, y, {
        size: U * (0.13 + Math.random() * 0.06),
        vx: Math.cos(a) * U * 1.8,
        vy: Math.sin(a) * U * 1.8,
        drag: 3.2,
        life: 0.36,
        s0: 1,
        s1: 0.2,
        spin: 7,
      });
    }
  }

  /** Rising embers from an ignited keg (call repeatedly for a continuous effect). */
  embers(x: number, y: number, n = 3, green = false) {
    const U = this.unit;
    for (let i = 0; i < this.n(n); i++) {
      this.spawn(green ? 'green' : 'ember', x + (Math.random() - 0.5) * U * 0.6, y + (Math.random() - 0.2) * U * 0.3, {
        size: U * (0.08 + Math.random() * 0.1),
        vx: (Math.random() - 0.5) * U * 0.4,
        vy: -U * (0.9 + Math.random() * 1.1),
        g: -U * 0.4,
        drag: 0.6,
        life: 0.6 + Math.random() * 0.6,
        s0: 1,
        s1: 0.2,
        blend: 'add',
      });
    }
  }

  /** Radial burst of sparks (ignition, wheel landing, multiplier hits). */
  burst(x: number, y: number, n: number, color: 'fire' | 'green' | 'white' | 'volt' = 'fire', power = 1) {
    const U = this.unit;
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = U * (1.5 + Math.random() * 2.5) * power;
      const kind: Kind = color === 'green' ? 'green' : color === 'white' ? 'star' : color === 'volt' ? 'volt' : 'ember';
      this.spawn(kind, x, y, {
        size: U * (kind === 'star' ? 0.14 : 0.12) * (0.7 + Math.random() * 0.8),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: U * 2.2,
        drag: 2.2,
        life: 0.5 + Math.random() * 0.4,
        s0: 1.1,
        s1: 0.1,
        spin: kind === 'star' ? 8 : 0,
        blend: kind === 'star' ? 'normal' : 'add',
      });
    }
  }

  /** Feathers floating up from the squawking parrot. */
  notes(x: number, y: number, n = 3) {
    const U = this.unit;
    for (let i = 0; i < this.n(n); i++) {
      this.spawn('note', x + (Math.random() - 0.5) * U * 0.4, y, {
        size: U * (0.22 + Math.random() * 0.1),
        vx: (Math.random() - 0.3) * U * 0.8,
        vy: -U * (1 + Math.random() * 0.6),
        drag: 0.8,
        life: 1.1 + Math.random() * 0.4,
        s0: 0.4,
        s1: 1,
        spin: (Math.random() - 0.5) * 1.5,
        fadeIn: 0.15,
      });
    }
  }

  /** Coin fountain for big wins. */
  coins(x: number, y: number, n: number, tier: 0 | 1 | 2 = 2, spread = 1) {
    const U = this.unit;
    const kinds: Kind[] = tier === 2 ? ['coinG', 'coinG', 'coinS'] : tier === 1 ? ['coinS', 'coinG', 'coinB'] : ['coinB', 'coinS'];
    const count = quality.low ? Math.max(1, Math.round(n * 0.6)) : n;
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4 * spread;
      const sp = U * (5 + Math.random() * 5);
      this.spawn(kinds[i % kinds.length], x + (Math.random() - 0.5) * U, y, {
        size: U * (0.34 + Math.random() * 0.16),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: U * 9,
        drag: 0.3,
        life: 1.6 + Math.random() * 0.8,
        s0: 1,
        s1: 1,
        spin: (Math.random() - 0.5) * 10,
        flip: true,
      });
    }
  }

  /**
   * Landing dust: puffs kicked out sideways from under a symbol that just hit the floor of its cell.
   * `heavy` (kegs, chests, bombs) kicks up more, bigger and further.
   */
  dust(x: number, y: number, heavy = false) {
    const U = this.unit;
    const n = heavy ? 4 : 2;
    const count = quality.low ? Math.max(1, n >> 1) : n;
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const sp = U * (heavy ? 1.5 + Math.random() * 0.9 : 0.9 + Math.random() * 0.5);
      this.spawn(i % 3 === 2 ? 'smoke2' : 'puff', x + side * U * 0.12, y, {
        size: U * (heavy ? 0.26 + Math.random() * 0.14 : 0.16 + Math.random() * 0.06),
        vx: side * sp,
        vy: -U * (heavy ? 0.35 + Math.random() * 0.35 : 0.15 + Math.random() * 0.15),
        g: -U * 0.2,
        drag: 5,
        life: heavy ? 0.55 + Math.random() * 0.2 : 0.38 + Math.random() * 0.1,
        s0: 0.5,
        s1: heavy ? 1.6 : 1.35,
        a0: heavy ? 0.85 : 0.7,
        spin: side * (0.6 + Math.random()),
        tint: 0xe6d2ab,
        rot: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  /** Billowing blast smoke: big puffs that roll outward, rise and darken to soot. */
  smoke(x: number, y: number, n: number, spread = 1, tint = 0x8f8277) {
    const U = this.unit;
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = U * 0.35 * spread * Math.random();
      const sp = U * (0.5 + Math.random() * 0.9) * spread;
      this.spawn(Math.random() < 0.5 ? 'smoke' : 'smoke2', x + Math.cos(a) * r, y + Math.sin(a) * r, {
        size: U * (0.5 + Math.random() * 0.35),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.6 - U * (0.25 + Math.random() * 0.4),
        g: -U * 0.5,
        drag: 2.2,
        life: 0.7 + Math.random() * 0.4,
        s0: 0.45,
        s1: 1.4,
        a0: 0.78,
        spin: (Math.random() - 0.5) * 0.9,
        fadeIn: 0.06,
        tint,
        rot: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  /** Electric debris: spark stars flung out of a surge, tumbling under gravity. */
  debris(x: number, y: number, n: number, power = 1) {
    const U = this.unit;
    for (let i = 0; i < this.n(n); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const sp = U * (3 + Math.random() * 3.5) * power;
      const kind: Kind = 'bolt';
      this.spawn(kind, x + (Math.random() - 0.5) * U * 0.3, y + (Math.random() - 0.5) * U * 0.3, {
        size: U * (0.26 + Math.random() * 0.14),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: U * 10,
        drag: 0.7,
        life: 0.75 + Math.random() * 0.35,
        s0: 1,
        s1: 0.75,
        spin: (Math.random() - 0.5) * 16,
      });
    }
  }

  /**
   * Hot spark streaks: along `angle` (radians, spread either side) or all round when omitted.
   * Fuse fizz, blast sparks, bomb growth flares.
   */
  sparks(x: number, y: number, n: number, power = 1, angle?: number, spread = Math.PI) {
    const U = this.unit;
    for (let i = 0; i < this.n(n); i++) {
      const a = angle === undefined ? Math.random() * Math.PI * 2 : angle + (Math.random() - 0.5) * spread;
      const sp = U * (2.2 + Math.random() * 3.2) * power;
      this.spawn('streak', x, y, {
        size: U * (0.2 + Math.random() * 0.14) * Math.min(1.6, 0.7 + power * 0.4),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: U * 3.5,
        drag: 2.6,
        life: 0.22 + Math.random() * 0.22,
        s0: 1,
        s1: 0.35,
        align: true,
        blend: 'add',
        tint: 0xd8f6ff,
      });
    }
  }

  /** A glint catching the moonlight on a shiny object: swells, turns, gone. */
  glint(x: number, y: number, size = 0.34) {
    const U = this.unit;
    this.spawn('shine', x, y, { size: U * size, life: 0.55, pulse: true, spin: 1.8, blend: 'add', rot: Math.random() * 0.6 });
  }

  /** Smoke trail puff behind a flying projectile (the thrown bomb). */
  trail(x: number, y: number, size = 0.2) {
    const U = this.unit;
    this.spawn(Math.random() < 0.5 ? 'puff' : 'smoke2', x + (Math.random() - 0.5) * U * 0.06, y + (Math.random() - 0.5) * U * 0.06, {
      size: U * size * (0.8 + Math.random() * 0.4),
      vy: -U * 0.25,
      drag: 3,
      life: 0.45 + Math.random() * 0.15,
      s0: 0.55,
      s1: 1.5,
      a0: 0.75,
      spin: (Math.random() - 0.5) * 2,
      tint: 0xcfc4b6,
    });
  }

  get count() {
    return this.live.length;
  }

  update(dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.s.removeFromParent();
        this.pool.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.g * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      const sc = p.pulse ? p.s0 * Math.sin(Math.PI * k) : p.s0 + (p.s1 - p.s0) * k;
      if (p.align) {
        const sp = Math.hypot(p.vx, p.vy);
        p.s.rotation = Math.atan2(p.vy, p.vx);
        p.s.scale.set(sc * Math.min(1.8, 0.5 + sp / (this.unit * 3)), sc);
      } else {
        p.s.rotation += p.spin * dt;
        p.s.scale.y = sc;
        p.s.scale.x = p.flip ? sc * Math.cos(p.age * 9) : sc;
      }
      const fin = p.fadeIn ? Math.min(1, p.age / p.fadeIn) : 1;
      p.s.alpha = p.a0 * fin * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
  }
}
