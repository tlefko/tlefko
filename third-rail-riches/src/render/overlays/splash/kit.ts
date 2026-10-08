/**
 * The splash demos' runtime kit: the Demo base (looping timeline, stop at the end of a loop, settle
 * off screen), and the pieces every map demo is built from: a MiniMap (plate, line glows, current
 * pulses, station faces that flip like the real departure boards), smoothed train paths, top-down
 * trains that snake along them, and the haul tally.
 *
 * Every demo draws its art in `view` and its numbers / words in `labels` (the card text layer, above
 * every particle, at the same place), so no spark ever crosses a glyph. Faces carry their coin value
 * in `labels` and the label follows the face each frame.
 */
import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { bitmapNum } from '../../text';
import { softDotTexture } from '../../textures';
import { quality } from '../../quality';
import { speed } from '../../timing';
import type { SymbolTextures } from '../../grid/SymbolView';
import type { Particles } from '../../fx/Particles';
import { LINE_COLORS } from '../../../art/map';
import { COIN_FACE } from '../../../art/specials';
import { ART } from '../../../art/symbols';
import { MINI_PAD, SYM_K, type DemoArt, type LineKey, type MiniSpec } from './art';
import { clamp, hex, lerp } from './svg';

export type Pt = { x: number; y: number };
export type ReactKind = 'train' | 'loot' | 'boost' | 'power' | 'signal' | 'clear' | 'incident' | 'crash';

export interface DemoKit {
  sym: SymbolTextures;
  art: DemoArt;
  fx: Particles;
  res: number;
  /** A demo hit a big beat: the characters may react (the splash rate-limits it). */
  react(kind: ReactKind): void;
}

export const setSize = (s: Sprite, px: number) => s.scale.set(px / Math.max(1, s.texture.width));

/** A brightness multiplier as a tint (1 = untouched, 0 = black). */
export const shade = (b: number, r = 1, g = 1, bl = 1) => {
  const c = (k: number) => Math.round(clamp(b * k, 0, 1) * 255);
  return (c(r) << 16) | (c(g) << 8) | c(bl);
};

export function lerpColor(a: number, b: number, u: number): number {
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, u)) << s;
  return ch(16) | ch(8) | ch(0);
}

/** Coin values on faces and in tallies: bet multiples, up to two decimals. */
export const fmtX = (v: number) => `${Math.round(v * 100) / 100}x`;

/* ------------------------------------------------------------------------------------------
 * Demo base
 * ---------------------------------------------------------------------------------------- */

export abstract class Demo {
  /** The demo's art. */
  view = new Container();
  /**
   * Its numbers and words: drawn in the card text layer, above every particle, at the same place as
   * `view`, so no puff or spark ever crosses a glyph.
   */
  labels = new Container();
  featured = false;
  protected tl?: gsap.core.Timeline;
  private running = false;
  private stopAtLoop = false;
  constructor(
    protected k: DemoKit,
    protected D: number,
  ) {}
  /** One loop, in seconds (the carousel lets the featured card finish it before moving on). */
  get loop(): number {
    return this.tl ? this.tl.duration() : 4;
  }
  /**
   * Play while on screen (in low quality only the featured card). A card that must stop while it
   * is still visible finishes its loop first (it ends on a settled board, nothing freezes mid-air);
   * one that has left the screen stops at once and snaps to its settled board.
   */
  run(on: boolean, visible: boolean) {
    if (!this.tl) {
      this.running = on;
      return;
    }
    if (on) {
      this.stopAtLoop = false;
      if (!this.running) {
        this.running = true;
        this.prime();
        this.tl.restart();
      }
      return;
    }
    if (!this.running) return;
    if (visible) {
      this.stopAtLoop = true;
      return;
    }
    this.running = false;
    this.stopAtLoop = false;
    this.tl.pause();
    this.settle();
  }
  /** Timelines call this on every repeat: the place to stop a card that was asked to. */
  protected loopEnd() {
    if (!this.stopAtLoop) return;
    this.stopAtLoop = false;
    this.running = false;
    this.tl?.pause();
  }
  /** The loop's opening state (called right before the timeline restarts, and at its start). */
  protected prime() {}
  /** Snap to the loop's resting board (called when a card stops off screen). */
  protected settle() {}
  /** Hold still where it is (the handoff: the cards fall away as they are). */
  freeze() {
    this.running = false;
    this.stopAtLoop = false;
    this.tl?.pause();
  }
  get on() {
    return this.running;
  }
  update(_dtMs: number) {}
  protected at(o: Container, dx = 0, dy = 0) {
    return o.toGlobal({ x: dx, y: dy });
  }
  /** A global point for a demo-local one. */
  protected g(p: Pt) {
    return this.view.toGlobal(p);
  }
  private shakeTw?: gsap.core.Tween;
  private rest?: Pt;
  /** A short camera shake on the demo (art and numbers together); never with reduced motion. */
  protected shake(power: number, dur = 0.35) {
    if (speed.reduced || quality.low) return;
    this.shakeTw?.kill();
    const rest = (this.rest ??= { x: this.view.x, y: this.view.y });
    const amp = this.D * 0.018 * power;
    const o = { t: 0 };
    const put = (dx: number, dy: number) => {
      this.view.position.set(rest.x + dx, rest.y + dy);
      this.labels.position.set(rest.x + dx, rest.y + dy);
    };
    this.shakeTw = gsap.to(o, {
      t: 1,
      duration: dur,
      ease: 'none',
      onUpdate: () => {
        const a = amp * (1 - o.t) * (1 - o.t);
        put(Math.sin(o.t * 63) * a, Math.cos(o.t * 51) * a * 0.8);
      },
      onComplete: () => put(0, 0),
    });
  }
  destroy() {
    this.tl?.kill();
    this.shakeTw?.kill();
  }
}

/** A fromTo on a proxy that never renders before its slot (safe in repeating timelines). */
export function drive(tl: gsap.core.Timeline, o: Record<string, number>, from: Record<string, number>, to: Record<string, number>, dur: number, ease: string, at: number, onUpdate: () => void) {
  tl.fromTo(o, { ...from }, { ...to, duration: dur, ease, immediateRender: false, onUpdate }, at);
}

/* ------------------------------------------------------------------------------------------
 * Station faces
 * ---------------------------------------------------------------------------------------- */

/** Coin metal (art key) for a value: bronze < 1x, silver 1-5x, gold 10x+. */
export const coinKey = (v: number) => (v < 1 ? ART.COIN_BRONZE : v <= 5 ? ART.COIN_SILVER : ART.COIN_GOLD);

/**
 * One station's split-flap face: the symbol (and a soft aura for the specials), and for a coin its
 * value, which lives in the demo's labels and follows the face.
 */
export class Face {
  holder = new Container();
  aura = new Sprite(softDotTexture());
  sprite = new Sprite(Texture.EMPTY);
  key = -1;
  value = 0;
  label?: BitmapText;
  private labelK = 1;
  /** Brightness of the symbol (1 lit, < 1 folded / dimmed). */
  bright = 1;
  constructor(
    private k: DemoKit,
    parent: Container,
    private labels: Container,
    readonly home: Pt,
    readonly S: number,
  ) {
    this.holder.position.set(home.x, home.y);
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.aura.visible = false;
    this.sprite.anchor.set(0.5);
    this.holder.addChild(this.aura, this.sprite);
    parent.addChild(this.holder);
  }
  /** Texture for an art key and pose: the demos' crisp raster, else the game's. */
  tex(key: number, pose: 'i' | 'w' = 'i'): Texture {
    const own = this.k.art.sym.get(`${key}${pose}`) ?? (pose === 'w' ? this.k.art.sym.get(`${key}i`) : undefined);
    if (own) return own;
    const set = this.k.sym.sets.get(key);
    return (pose === 'w' ? (set?.win ?? set?.idle) : set?.idle) ?? Texture.EMPTY;
  }
  /** Show a symbol (null: an empty face). A coin carries `value`. */
  set(key: number | null, opts: { pose?: 'i' | 'w'; value?: number; texture?: Texture } = {}) {
    this.key = key ?? -1;
    if (key === null) {
      this.sprite.visible = false;
      this.aura.visible = false;
      this.setLabel(null);
      return;
    }
    this.sprite.texture = opts.texture ?? this.tex(key, opts.pose);
    setSize(this.sprite, this.S * SYM_K);
    this.sprite.visible = true;
    const isCoin = key >= ART.COIN_BRONZE && key <= ART.COIN_PLATINUM;
    const special = isCoin || key === ART.LOCO || key === ART.SIGNAL || key === ART.SECURITY || key === ART.LOCO_GOLD;
    this.aura.visible = special && !quality.low;
    if (this.aura.visible) {
      this.aura.tint = isCoin ? 0xffe6a3 : key === ART.SIGNAL ? 0x5fd3a1 : 0xffb43c;
      setSize(this.aura, this.S * (isCoin ? 1.25 : 1.5));
      this.aura.alpha = isCoin ? 0.22 : 0.3;
    }
    this.value = opts.value ?? 0;
    this.setLabel(isCoin ? this.value : null);
  }
  private setLabel(v: number | null) {
    if (v === null) {
      if (this.label) this.label.visible = false;
      return;
    }
    const text = fmtX(v);
    if (!this.label) {
      this.label = bitmapNum(text, 'white', this.S * 0.34);
      this.labels.addChild(this.label);
    } else this.label.text = text;
    this.label.scale.set(1);
    const base = (this.S * 0.34) / 96;
    this.label.scale.set(base);
    const maxW = ((COIN_FACE.r * 2) / 256) * this.S * SYM_K * 0.92;
    const w = this.label.width;
    this.labelK = w > maxW ? base * (maxW / w) : base;
    this.label.visible = true;
    this.sync();
  }
  /** The value follows the face (called each frame, after the tweens). */
  sync() {
    const l = this.label;
    if (!l || !l.visible) return;
    const h = this.holder;
    const off = (((COIN_FACE.cy - 128) / 256) * this.S * SYM_K + this.S * 0.01) * h.scale.y;
    l.position.set(h.x - Math.sin(h.rotation) * off, h.y + Math.cos(h.rotation) * off);
    l.scale.set(this.labelK * h.scale.x, this.labelK * h.scale.y);
    l.rotation = h.rotation;
    l.alpha = h.alpha * (h.visible && this.sprite.visible ? 1 : 0) * clamp((this.bright - 0.55) / 0.45, 0, 1);
  }
  setBright(b: number) {
    this.bright = b;
    this.sprite.tint = shade(b, 1, 1, 1.04);
  }
  /** Back to its resting transform. */
  home0() {
    gsap.killTweensOf(this.holder);
    gsap.killTweensOf(this.holder.scale);
    this.holder.position.set(this.home.x, this.home.y);
    this.holder.scale.set(1);
    this.holder.rotation = 0;
    this.holder.alpha = 1;
    this.holder.visible = true;
    this.setBright(1);
  }
}

/** Rattle frames for a flipping board: the game's own symbols. */
const RATTLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, ART.COIN_SILVER, ART.COIN_BRONZE];

/**
 * A departure-board flip on `face` landing on `key` at time `at`: `rattles` quick flaps through
 * random symbols (each folds to a sliver and opens again, darkening as it folds), then the heavier
 * final flap: it overshoots tall, squashes and settles (MapView.flipStation, in miniature).
 */
export function flip(tl: gsap.core.Timeline, face: Face, at: number, land: () => void, rattles = 2) {
  const fold = 0.045;
  const fin = 0.075;
  const h = face.holder;
  const o = { y: 1, b: 1 };
  const apply = () => {
    h.scale.y = o.y;
    face.setBright(o.b);
  };
  const shut = { y: 0.06, b: 0.35 };
  const open = { y: 1, b: 1 };
  const start = at - fin - rattles * fold * 2;
  // (an empty face folds invisibly; its first frame opens out of the seam)
  tl.call(() => void (h.visible = true), [], Math.max(0, start - 0.001));
  for (let i = 0; i < rattles; i++) {
    const t0 = start + i * fold * 2;
    tl.fromTo(o, { ...open }, { ...shut, duration: fold, ease: 'power2.in', immediateRender: false, onUpdate: apply }, t0);
    tl.call(
      () => {
        face.set(RATTLE[(Math.random() * RATTLE.length) | 0]);
        if (face.label) face.label.visible = false;
        apply();
      },
      [],
      t0 + fold,
    );
    tl.fromTo(o, { ...shut }, { ...open, duration: fold, ease: 'power2.out', immediateRender: false, onUpdate: apply }, t0 + fold);
  }
  tl.fromTo(o, { ...open }, { y: 0.05, b: 0.3, duration: fin, ease: 'power2.in', immediateRender: false, onUpdate: apply }, at - fin);
  tl.call(
    () => {
      land();
      face.setBright(1);
      h.scale.set(1.06, 0.05);
      gsap
        .timeline()
        .to(h.scale, { x: 0.96, y: 1.12, duration: 0.09, ease: 'power2.out' })
        .to(h.scale, { x: 1.03, y: 0.94, duration: 0.08, ease: 'sine.inOut' })
        .to(h.scale, { x: 1, y: 1, duration: 0.24, ease: 'elastic.out(1.1, 0.45)' });
    },
    [],
    at,
  );
}

/* ------------------------------------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------------------------------- */

export interface Path {
  pts: Pt[];
  /** Arc length at each point. */
  acc: number[];
  length: number;
}

/**
 * A train path through `pts` with its corners rounded (a quadratic fillet of radius `r` at each
 * bend), so the cars swing round a bend instead of pivoting on it.
 */
export function makePath(pts: Pt[], r: number): Path {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const u1 = { x: (b.x - a.x) / l1, y: (b.y - a.y) / l1 };
    const u2 = { x: (c.x - b.x) / l2, y: (c.y - b.y) / l2 };
    const turn = Math.abs(u1.x * u2.y - u1.y * u2.x);
    if (turn < 0.05) {
      out.push(b);
      continue;
    }
    const rr = Math.min(r, l1 * 0.45, l2 * 0.45);
    const p0 = { x: b.x - u1.x * rr, y: b.y - u1.y * rr };
    const p2 = { x: b.x + u2.x * rr, y: b.y + u2.y * rr };
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const m = 1 - t;
      out.push({ x: m * m * p0.x + 2 * m * t * b.x + t * t * p2.x, y: m * m * p0.y + 2 * m * t * b.y + t * t * p2.y });
    }
  }
  out.push(pts[pts.length - 1]);
  const acc = [0];
  for (let i = 1; i < out.length; i++) acc.push(acc[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y));
  return { pts: out, acc, length: acc[acc.length - 1] };
}

/** Point at arc length `s` (before the start / past the end it runs on along the first / last leg). */
export function pointAt(p: Path, s: number): Pt {
  const { pts, acc } = p;
  if (s <= 0) {
    const a = pts[0];
    const b = pts[1];
    const d = acc[1] || 1;
    return { x: a.x + ((b.x - a.x) / d) * s, y: a.y + ((b.y - a.y) / d) * s };
  }
  if (s >= p.length) {
    const n = pts.length - 1;
    const a = pts[n - 1];
    const b = pts[n];
    const d = acc[n] - acc[n - 1] || 1;
    const e = s - p.length;
    return { x: b.x + ((b.x - a.x) / d) * e, y: b.y + ((b.y - a.y) / d) * e };
  }
  let lo = 0;
  let hi = acc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (acc[mid] <= s) lo = mid;
    else hi = mid;
  }
  const u = (s - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]);
  return { x: lerp(pts[lo].x, pts[hi].x, u), y: lerp(pts[lo].y, pts[hi].y, u) };
}

/** Arc length of the path point nearest to `q` (where a station sits along a rounded path). */
export function arcOf(p: Path, q: Pt): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < p.pts.length - 1; i++) {
    const a = p.pts[i];
    const b = p.pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const u = clamp(((q.x - a.x) * dx + (q.y - a.y) * dy) / l2, 0, 1);
    const x = a.x + dx * u;
    const y = a.y + dy * u;
    const d = (x - q.x) ** 2 + (y - q.y) ** 2;
    if (d < bd) {
      bd = d;
      best = p.acc[i] + u * (p.acc[i + 1] - p.acc[i]);
    }
  }
  return best;
}

/* ------------------------------------------------------------------------------------------
 * The haul tally
 * ---------------------------------------------------------------------------------------- */

/** The floating haul tally (TrainRunner's): a dark pill ringed in the line colour, gold figures, a green x2 chip. */
export class Tally extends Container {
  bg = new Graphics();
  num: BitmapText;
  chip?: BitmapText;
  value = 0;
  repay = 1;
  constructor(
    private S: number,
    private color: number,
  ) {
    super();
    this.num = bitmapNum(fmtX(0), 'gold', S * 0.4);
    this.addChild(this.bg, this.num);
    this.redraw();
  }
  set(v: number, repay = this.repay) {
    this.value = Math.round(v * 100) / 100;
    this.repay = repay;
    this.num.text = fmtX(this.value);
    if (repay > 1) {
      if (!this.chip) {
        this.chip = bitmapNum(`x${repay}`, 'green', this.S * 0.36);
        this.addChild(this.chip);
      }
      this.chip.text = `x${repay}`;
      this.chip.visible = true;
    } else if (this.chip) this.chip.visible = false;
    this.redraw();
  }
  setColor(c: number) {
    this.color = c;
    this.redraw();
  }
  private redraw() {
    const S = this.S;
    const chip = this.chip?.visible ? this.chip : undefined;
    this.num.visible = !(this.value === 0 && chip);
    const numW = this.num.visible ? this.num.width : 0;
    const gap = chip && numW ? S * 0.12 : 0;
    const w = numW + (chip ? chip.width + gap : 0) + S * 0.4;
    const h = S * 0.5;
    this.bg
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill({ color: 0x0b1220, alpha: 0.9 })
      .stroke({ width: Math.max(1.2, S * 0.045), color: this.color, alpha: 1 });
    const x0 = -w / 2 + S * 0.2;
    this.num.position.set(x0 + numW / 2, S * 0.01);
    if (chip) chip.position.set(x0 + numW + gap + chip.width / 2, S * 0.01);
  }
}

/* ------------------------------------------------------------------------------------------
 * The mini map
 * ---------------------------------------------------------------------------------------- */

interface Pulse {
  s: Sprite;
  path: Path;
  t: number;
  dur: number;
  dir: 1 | -1;
}

/**
 * A stretch of the network for a demo: the plate, a neon glow per line (lit while a train runs it),
 * current pulses, a face per station, and layers for scorch marks (under the faces), the trains
 * (over them) and flashes (over the trains).
 */
export class MiniMap {
  readonly S: number;
  readonly pts: Pt[];
  readonly faces: Face[] = [];
  readonly plate = new Sprite(Texture.EMPTY);
  readonly glowLayer = new Container();
  readonly pulseLayer = new Container();
  readonly under = new Container();
  readonly faceLayer = new Container();
  readonly trainLayer = new Container();
  readonly over = new Container();
  private glows: Sprite[] = [];
  private level: number[] = [];
  private pulses: Pulse[] = [];
  private linePaths: Path[];
  private t = Math.random() * 10;
  private pulseAt = 0.6;
  constructor(
    k: DemoKit,
    readonly spec: MiniSpec,
    readonly D: number,
    view: Container,
    labels: Container,
  ) {
    this.S = spec.S * D;
    this.pts = spec.stations.map((s) => ({ x: s.x * D, y: s.y * D }));
    this.plate.texture = k.art.plates.get(spec.id) ?? Texture.EMPTY;
    this.plate.anchor.set(0.5);
    this.plate.width = this.plate.height = D * (1 + MINI_PAD * 2);
    this.glowLayer.blendMode = 'add';
    this.pulseLayer.blendMode = 'add';
    this.over.blendMode = 'normal';
    view.addChild(this.plate, this.glowLayer, this.pulseLayer, this.under, this.faceLayer, this.trainLayer, this.over);
    spec.lines.forEach((_, li) => {
      const s = new Sprite(k.art.glows.get(`${spec.id}:${li}`) ?? Texture.EMPTY);
      s.anchor.set(0.5);
      s.width = s.height = D * (1 + MINI_PAD * 2);
      s.alpha = 0.1;
      this.glowLayer.addChild(s);
      this.glows.push(s);
      this.level.push(0);
    });
    this.linePaths = spec.lines.map((l) => {
      const p = l.stops.map((i) => this.pts[i]);
      if (l.head) p.unshift({ x: l.head[0] * D, y: l.head[1] * D });
      if (l.tail) p.push({ x: l.tail[0] * D, y: l.tail[1] * D });
      return makePath(p, 0);
    });
    this.pts.forEach((p) => this.faces.push(new Face(k, this.faceLayer, labels, p, this.S)));
  }
  lineIndex(key: LineKey) {
    return this.spec.lines.findIndex((l) => l.key === key);
  }
  lineColor(li: number) {
    return hex(LINE_COLORS[this.spec.lines[li].key][0]);
  }
  /** Light a line (0 idle, 1 fully lit). */
  light(li: number, level: number, dur = 0.35) {
    this.level[li] = level;
    const s = this.glows[li];
    if (!s) return;
    gsap.to(s, { alpha: 0.1 + level * 0.55, duration: dur, ease: 'sine.inOut', overwrite: true });
  }
  /** Lines back to their idle glow at once (a loop restarts). */
  unlight() {
    this.glows.forEach((s, li) => {
      gsap.killTweensOf(s);
      this.level[li] = 0;
      s.alpha = 0.1;
    });
  }
  /** Two strong pulses race along a line (a train lit it). */
  surge(li: number) {
    if (quality.low) return;
    for (let i = 0; i < 2; i++) gsap.delayedCall(i * 0.16, () => this.spawn(li, true));
  }
  private spawn(li: number, strong = false, dir?: 1 | -1) {
    if (!this.linePaths[li] || this.pulses.length > 8) return;
    const s = new Sprite(softDotTexture());
    s.anchor.set(0.5);
    s.tint = hex(LINE_COLORS[this.spec.lines[li].key][1]);
    s.width = s.height = this.S * (strong ? 0.8 : 0.5);
    s.alpha = 0;
    this.pulseLayer.addChild(s);
    const n = this.spec.lines[li].stops.length;
    this.pulses.push({ s, path: this.linePaths[li], t: 0, dur: (strong ? 0.7 : 1.8) + n * (strong ? 0.06 : 0.2), dir: dir ?? (Math.random() < 0.5 ? 1 : -1) });
  }
  update(dtMs: number, live: boolean) {
    const dt = dtMs / 1000;
    this.t += dt;
    for (const f of this.faces) f.sync();
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pl = this.pulses[i];
      pl.t += dt / pl.dur;
      if (pl.t >= 1) {
        pl.s.destroy();
        this.pulses.splice(i, 1);
        continue;
      }
      const u = pl.dir > 0 ? pl.t : 1 - pl.t;
      const p = pointAt(pl.path, u * pl.path.length);
      pl.s.position.set(p.x, p.y);
      pl.s.alpha = Math.sin(pl.t * Math.PI) * 0.6;
    }
    if (!live || quality.low || speed.reduced) return;
    // the lines breathe a little, each on its own phase, and idle current runs along them
    this.glows.forEach((s, li) => {
      if (this.level[li] > 0 || gsap.isTweening(s)) return;
      s.alpha = 0.1 + 0.05 * Math.sin(this.t * 1.3 + li * 1.7);
    });
    if (this.t > this.pulseAt) {
      this.pulseAt = this.t + 0.9 + Math.random() * 1.2;
      this.spawn((Math.random() * this.spec.lines.length) | 0);
    }
  }
  destroy() {
    for (const p of this.pulses) p.s.destroy();
    this.pulses = [];
    for (const f of this.faces) {
      gsap.killTweensOf(f.holder);
      gsap.killTweensOf(f.holder.scale);
    }
    for (const s of this.glows) gsap.killTweensOf(s);
  }
}

/* ------------------------------------------------------------------------------------------
 * Trains
 * ---------------------------------------------------------------------------------------- */

/** Car length, coupling pitch and nose-to-centre, in station sizes (a touch shorter than the board's, for small maps). */
export const CAR_K = 1.15;
export const CAR_GAP = 1.0;
export const CAR_NOSE = 0.5;

/**
 * A top-down two-car set on a path (TrainRunner's look): the lead car's nose sits at
 * arc length `s`, the cars follow along the same path (so they swing round bends), fade in as they
 * pull out of the starting terminal and out as they dive into the far tunnel. A warm headlamp glow
 * leads the nose; the tally floats over the lead car.
 */
export class MiniTrain {
  cars: Sprite[] = [];
  lamp = new Sprite(softDotTexture());
  tally?: Tally;
  s = 0;
  grey = 0;
  /** Extra alpha (a held train dims). */
  dim = 1;
  /** Fade into the far end over this distance (0: no fade, the train stops in view). */
  exit = 0;
  /** The cars are flung (crash): placement stops. */
  wrecked = false;
  readonly gap: number;
  constructor(
    private map: MiniMap,
    k: DemoKit,
    public path: Path,
    readonly line: LineKey,
    private labels: Container,
    golden = false,
  ) {
    const S = map.S;
    this.gap = S * CAR_GAP;
    for (let i = 0; i < 2; i++) {
      const c = new Sprite(k.art.cars.get(`${golden ? 'gold' : line}${i === 0 ? 'L' : 'C'}`) ?? Texture.EMPTY);
      c.anchor.set(0.5);
      c.width = S * CAR_K;
      c.height = S * CAR_K * (96 / 240);
      c.alpha = 0;
      this.cars.push(c);
    }
    this.lamp.anchor.set(0.5);
    this.lamp.blendMode = 'add';
    this.lamp.tint = golden ? 0xffe08a : 0xfff1c8;
    this.lamp.width = S * 1.15;
    this.lamp.height = S * 0.72;
    this.lamp.alpha = 0;
    map.trainLayer.addChild(this.lamp, this.cars[1], this.cars[0]);
  }
  get head(): Pt {
    return { x: this.cars[0].x, y: this.cars[0].y };
  }
  /** Where the tally floats (over the lead car). */
  get tallyAt(): Pt {
    return { x: this.cars[0].x, y: this.cars[0].y - this.map.S * 0.66 };
  }
  showTally(color?: number): Tally {
    if (!this.tally) {
      this.tally = new Tally(this.map.S, color ?? this.map.lineColor(Math.max(0, this.map.lineIndex(this.line))));
      this.labels.addChild(this.tally);
    }
    const t = this.tally;
    t.visible = true;
    t.alpha = 1;
    t.set(0, 1);
    t.scale.set(0);
    gsap.to(t.scale, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2.5)' });
    this.place();
    return t;
  }
  place() {
    if (this.wrecked) return;
    const S = this.map.S;
    const p = this.path;
    const exitFade = this.exit > 0 ? clamp((p.length - this.s) / this.exit, 0, 1) : 1;
    let lead = 1;
    this.cars.forEach((c, k) => {
      const s = this.s - k * this.gap - S * CAR_NOSE;
      const q = pointAt(p, s);
      const a = pointAt(p, s - S * 0.24);
      const b = pointAt(p, s + S * 0.24);
      c.position.set(q.x, q.y);
      if (Math.hypot(b.x - a.x, b.y - a.y) > 0.3) c.rotation = Math.atan2(b.y - a.y, b.x - a.x);
      const inFade = clamp((s + S * CAR_NOSE) / (S * 0.6), 0, 1);
      // and they fade with the map window's edge (a train never shows off the map)
      const D = this.map.D;
      const edge = clamp((D * 0.5 - Math.max(Math.abs(q.x), Math.abs(q.y))) / (D * 0.12), 0, 1);
      c.alpha = inFade * edge * (k === 0 ? exitFade : Math.min(1, exitFade * 1.6)) * this.dim;
      if (k === 0) lead = inFade * edge;
      c.tint = this.grey > 0 ? lerpColor(0xffffff, 0x7d828c, this.grey) : 0xffffff;
    });
    const nose = pointAt(p, this.s);
    const back = pointAt(p, this.s - S * 0.3);
    const ang = Math.atan2(nose.y - back.y, nose.x - back.x);
    this.lamp.position.set(nose.x + Math.cos(ang) * S * 0.3, nose.y + Math.sin(ang) * S * 0.3);
    this.lamp.rotation = ang;
    if (this.tally && this.tally.visible) {
      const t = this.tallyAt;
      this.tally.position.set(t.x, t.y);
      // (it shows as the train comes into view, and stays while the train dives into a tunnel)
      this.tally.alpha = Math.min(1, lead * 1.5);
    }
  }
  /** Off the board (loop start). */
  hide() {
    this.wrecked = false;
    this.grey = 0;
    this.dim = 1;
    for (const c of this.cars) {
      gsap.killTweensOf(c);
      c.alpha = 0;
      c.tint = 0xffffff;
      c.scale.set(Math.abs(c.scale.x), Math.abs(c.scale.y));
      c.width = this.map.S * CAR_K;
      c.height = this.map.S * CAR_K * (96 / 240);
    }
    gsap.killTweensOf(this.lamp);
    this.lamp.alpha = 0;
    if (this.tally) {
      gsap.killTweensOf(this.tally);
      gsap.killTweensOf(this.tally.scale);
      this.tally.visible = false;
      this.tally.set(0, 1);
    }
  }
}

/**
 * A coin hops off its face into a moving target (a train's tally, the crash pile, the POWER meter):
 * it swells, arcs up and shrinks into it. Added to `tl` at `at`; `arrive` runs as it lands.
 */
export function hop(tl: gsap.core.Timeline, face: Face, target: () => Pt, at: number, arrive: () => void, o: { dur?: number; lift?: number; spin?: number; k1?: number; onStart?: () => void } = {}) {
  const dur = o.dur ?? 0.36;
  const h = face.holder;
  const p = { u: 0 };
  tl.call(
    () => {
      face.holder.parent?.addChild(face.holder); // over the other faces
      o.onStart?.();
    },
    [],
    at,
  );
  tl.to(h.scale, { x: 1.28, y: 1.28, duration: 0.09, ease: 'power2.out', immediateRender: false }, at);
  tl.fromTo(
    p,
    { u: 0 },
    {
      u: 1,
      duration: dur,
      ease: 'power2.in',
      immediateRender: false,
      onUpdate: () => {
        const q = target();
        const lift = Math.sin(p.u * Math.PI) * face.S * (o.lift ?? 0.6);
        h.position.set(lerp(face.home.x, q.x, p.u), lerp(face.home.y, q.y, p.u) - lift);
        const k = lerp(1.28, o.k1 ?? 0.35, p.u);
        h.scale.set(k);
        if (o.spin) h.rotation = o.spin * p.u;
      },
    },
    at + 0.09,
  );
  tl.call(
    () => {
      h.visible = false;
      h.position.set(face.home.x, face.home.y);
      h.scale.set(1);
      h.rotation = 0;
      face.set(null);
      arrive();
    },
    [],
    at + 0.09 + dur,
  );
}
