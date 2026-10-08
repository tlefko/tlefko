import { BitmapText, Container, Sprite, Texture } from 'pixi.js';
import { bitmapNum, numBaseStyle, type NumTone } from '../text';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { ART, ART_KEYS, SYMBOL_ART, artKey } from '../../art/symbols';
import { COIN_FACE } from '../../art/specials';
import { Sym, type Cell } from '../../math/types';
import { quality } from '../quality';
import { T, speed } from '../timing';

export interface SymbolSet {
  idle: Texture;
  blink?: Texture;
  win?: Texture;
  /** Looped during the win highlight (optional). */
  winFrames?: Texture[];
  /** Idle loop or an occasional idle act (optional). */
  idleFrames?: Texture[];
}

type FrameKey = 'winFrames' | 'idleFrames';

/**
 * Formats a Fare Coin's value (bet multiples) for its face; the presenter installs the currency
 * formatter for the current bet. Kept module-wide so every coin on the board reads the same way.
 */
export const coinLabel = { fmt: (v: number) => `${v}x` };

/**
 * All symbol textures rasterised for the current cell size, in two passes:
 * - `build()` (on the layout's critical path): one texture per pose (idle, blink, win). Enough to
 *   play everything.
 * - then, off the critical path, the frame loops (win and idle frames): one frame per idle
 *   callback, only while `idleGate()` says the board is at rest, each uploaded to the GPU at once
 *   (`onLazy`); a symbol's loop is installed only when all its frames are ready. quality.low never
 *   builds or plays the loops.
 * A new build (resize) cancels the queue of the previous one (generation counter).
 */
export class SymbolTextures {
  sets = new Map<number, SymbolSet>();
  size = 0;
  private gen = 0;
  private px = 0;
  private lazyTimer = 0;
  idleGate: () => boolean = () => true;
  onLazy?: (t: Texture[]) => void;

  constructor() {
    quality.onChange((low) => {
      if (!low && this.px) this.scheduleFrames(this.gen);
    });
  }

  async build(cellPx: number) {
    const gen = ++this.gen;
    const px = Math.round(cellPx * 1.22);
    const prevPx = this.px;
    this.size = cellPx;
    this.px = px;
    clearTimeout(this.lazyTimer);
    const sets = new Map<number, SymbolSet>();
    const jobs: (() => Promise<void>)[] = [];
    for (let s = 0; s < ART_KEYS; s++) {
      const a = SYMBOL_ART[s];
      if (!a) continue;
      const old = prevPx === px ? this.sets.get(s) : undefined;
      const set: SymbolSet = { idle: Texture.EMPTY, winFrames: old?.winFrames, idleFrames: old?.idleFrames };
      sets.set(s, set);
      jobs.push(() => svgTexture(`sym${s}i`, a.idle(), px).then((t) => void (set.idle = t)));
      const blink = a.blink;
      const win = a.win;
      if (blink) jobs.push(() => svgTexture(`sym${s}b`, blink(), px).then((t) => void (set.blink = t)));
      if (win) jobs.push(() => svgTexture(`sym${s}w`, win(), px).then((t) => void (set.win = t)));
    }
    for (let i = 0; i < jobs.length; i += 2) {
      if (gen !== this.gen) return;
      await Promise.all(jobs.slice(i, i + 2).map((j) => j()));
      if (i + 2 < jobs.length) await yieldTask();
    }
    if (gen !== this.gen) return;
    this.sets = sets;
    this.scheduleFrames(gen);
  }

  /** Queue the frame loops of every symbol for idle-time rasterising. */
  private scheduleFrames(gen: number) {
    if (quality.low) return;
    const px = this.px;
    const queue: { s: number; key: FrameKey; fs: (() => string)[] }[] = [];
    for (const key of ['winFrames', 'idleFrames'] as const) {
      for (let s = 0; s < ART_KEYS; s++) {
        const fs = SYMBOL_ART[s]?.[key];
        if (fs?.length && !this.sets.get(s)?.[key]) queue.push({ s, key, fs });
      }
    }
    if (!queue.length) return;
    let q = 0;
    let made: Texture[] = [];
    const next = () => {
      if (gen !== this.gen || quality.low) return;
      if (q >= queue.length) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (hidden || !this.idleGate()) {
        this.lazyTimer = window.setTimeout(next, 250);
        return;
      }
      const job = queue[q];
      const i = made.length;
      void svgTexture(`sym${job.s}${job.key === 'winFrames' ? 'wf' : 'if'}${i}`, job.fs[i](), px).then((t) => {
        if (gen !== this.gen) return;
        made.push(t);
        this.onLazy?.([t]);
        if (made.length === job.fs.length) {
          const set = this.sets.get(job.s);
          if (set) set[job.key] = made;
          made = [];
          q++;
        }
        idle(next);
      });
    };
    idle(next);
  }

  /** Every texture (for a GPU warm-up pass before play). */
  all(): Texture[] {
    const out: Texture[] = [];
    for (const s of this.sets.values()) for (const t of [s.idle, s.blink, s.win, ...(s.winFrames ?? []), ...(s.idleFrames ?? [])]) if (t) out.push(t);
    return out;
  }
}

/** Yield to the browser for one task (a frame can render in between), without waiting a whole frame. */
const channel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
const waiting: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => waiting.shift()?.();
function yieldTask(): Promise<void> {
  return new Promise((r) => {
    if (!channel) return void window.setTimeout(r, 0);
    waiting.push(r);
    channel.port2.postMessage(0);
  });
}

/** Run `fn` when the main thread has room (requestIdleCallback where it exists). */
function idle(fn: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 1500 });
  else window.setTimeout(fn, 60);
}

/** Idle personality per symbol: breathing depth, sway, and whether it blinks or glints. */
const CREATURE = (s: number) => s >= Sym.H4 && s <= Sym.TOP;
const SHINY = (s: number) => s <= Sym.L4 || s === Sym.FS || s === Sym.COIN || s === Sym.WILD;
/** Symbols with a soft glow behind them, and its colour. */
const AURA: Partial<Record<number, number>> = { [Sym.WILD]: 0x3fc8ff, [Sym.FS]: 0xf4b73a, [Sym.COIN]: 0xffe6a3, [Sym.LOCO]: 0xffb43c, [Sym.SWITCH]: 0x5fd3a1 };
/** Coin value text tone per metal (bronze, silver, gold, platinum). */
const COIN_TONE: NumTone[] = ['white', 'white', 'white', 'gold'];

interface Frames {
  list: Texture[];
  fps: number;
  t: number;
  loop: boolean;
}

/**
 * One symbol on the board.
 * - The view itself carries the choreography (drops, landings, pops): position, scale, alpha.
 * - `idle` carries idle life (breathing, sway, heartbeat): driven per frame.
 * - `body` is the illustration; the win motion turns it and swaps its frames.
 * - `aura` is the soft glow of the specials; `flash` a white-hot copy of the body used to hide a
 *   texture swap (a headlamp coming on, a Junction thrown) inside a flare.
 * - A Fare Coin carries its value as a bitmap number on its face, in `badges` (outside the idle
 *   motion, so numbers never wobble).
 */
export class SymbolView extends Container {
  cell!: Cell;
  idle = new Container();
  body = new Sprite();
  aura = new Sprite(softDotTexture());
  flash = new Sprite();
  /** The art key (Sym id, or a coin metal / locomotive / junction variant). */
  key = 0;
  private S = 100;
  private breathe?: gsap.core.Tween;
  blinking = false;
  private phase = Math.random() * Math.PI * 2;
  pulse = { k: 1 };
  /** 0..1: trembling (a waiting coin about to be collected, a locomotive revving). */
  heat = 0;
  private winT = -1;
  private frames?: Frames;
  /** Lit state: headlamp on (Locomotive), lever thrown (Junction). */
  lit = false;
  badges = new Container();
  private valueText?: BitmapText;
  private valueK = 1;
  baseK = 1;

  constructor(private tex: SymbolTextures) {
    super();
    this.body.anchor.set(0.5);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.visible = false;
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.aura.visible = false;
    this.idle.addChild(this.aura, this.body, this.flash);
    this.addChild(this.idle, this.badges);
  }

  get sym() {
    return this.cell.sym as number;
  }

  get isWinning() {
    return this.winT >= 0;
  }

  setCell(cell: Cell, S: number) {
    this.cell = { ...cell };
    this.key = artKey(cell);
    this.S = S;
    this.alpha = 1;
    this.rotation = 0;
    this.scale.set(1);
    this.idle.position.set(0, 0);
    this.idle.rotation = 0;
    this.idle.scale.set(1);
    this.pulse.k = 1;
    this.heat = 0;
    this.winT = -1;
    this.frames = undefined;
    this.lit = false;
    this.body.rotation = 0;
    this.body.tint = 0xffffff;
    this.flash.visible = false;
    this.blinking = false;
    this.applyTexture();
    this.clearValue();
    if (cell.sym === Sym.COIN) this.showValue();
    this.breathe?.kill();
    this.breathe = undefined;
    const tint = AURA[cell.sym];
    if (tint !== undefined) {
      this.aura.visible = true;
      this.aura.tint = cell.golden ? 0xffd75a : tint;
      this.aura.scale.set((S * (cell.sym === Sym.COIN ? 1.25 : 1.5)) / this.aura.texture.width);
      this.aura.alpha = cell.sym === Sym.COIN ? (cell.held ? 0.36 : 0.22) : 0.3;
      this.startAuraBreath();
    } else this.aura.visible = false;
  }

  private startAuraBreath() {
    this.breathe?.kill();
    this.breathe = undefined;
    if (quality.low || !this.aura.visible) return;
    const hi = this.aura.alpha + 0.22;
    this.breathe = gsap.to(this.aura, { alpha: hi, duration: 0.9 + Math.random() * 0.3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  private setTexture(t: Texture) {
    this.body.texture = t;
    const k = this.S / Math.max(1, t.width);
    this.body.scale.set(k);
    this.baseK = k;
    if (this.flash.visible) {
      this.flash.texture = t;
      this.flash.scale.copyFrom(this.body.scale);
    }
  }

  private applyTexture(pose: 'idle' | 'blink' | 'win' = 'idle') {
    const set = this.tex.sets.get(this.key);
    if (!set) return;
    let t = set.idle;
    if (this.lit && set.win) t = set.win;
    else if (pose === 'win' && set.win) t = set.win;
    else if (pose === 'blink' && set.blink) t = set.blink;
    this.setTexture(t);
  }

  pose(p: 'idle' | 'blink' | 'win') {
    this.applyTexture(p);
  }

  /* ---------------------------------------------------------------- coin value */

  /** The coin's value on its face, fitted inside the plain centre disc of the art. */
  private showValue() {
    const v = this.cell.value ?? 0;
    const tier = this.key - ART.COIN_BRONZE;
    const S = this.S;
    const t = bitmapNum(coinLabel.fmt(v), COIN_TONE[tier] ?? 'white', S * 0.3);
    const face = COIN_FACE;
    const maxW = ((face.r * 2) / 256) * S * 0.9;
    if (t.width > maxW) t.scale.set(t.scale.x * (maxW / t.width));
    t.position.set(((face.cx - 128) / 256) * S, ((face.cy - 128) / 256) * S + S * 0.01);
    this.valueK = t.scale.x;
    this.badges.addChild(t);
    this.valueText = t;
  }

  private clearValue() {
    if (this.valueText) {
      gsap.killTweensOf(this.valueText.scale);
      this.valueText.destroy();
    }
    this.valueText = undefined;
  }

  /** Re-print the value (the bet or the currency format changed). */
  refreshValue() {
    if (this.sym !== Sym.COIN) return;
    this.clearValue();
    this.showValue();
  }

  /** The value number pops (it is being counted, or it just landed). */
  punchValue(k = 1.35) {
    const t = this.valueText;
    if (!t) return;
    gsap.killTweensOf(t.scale);
    gsap.fromTo(t.scale, { x: this.valueK * k, y: this.valueK * k }, { x: this.valueK, y: this.valueK, duration: T(0.32), ease: 'back.out(3)' });
  }

  /** Hide or show the value (a coin flying into a train keeps its own number). */
  showValueText(on: boolean) {
    if (this.valueText) this.valueText.visible = on;
  }

  /* ---------------------------------------------------------------- lit states */

  /** Headlamp on / Junction thrown, swapped inside a white-hot flare. */
  setLit(on: boolean, animate = true): Promise<void> {
    if (this.lit === on) return Promise.resolve();
    if (!animate || speed.reduced) {
      this.lit = on;
      this.applyTexture();
      return Promise.resolve();
    }
    const tl = this.flareTl(T(0.08), T(0.26), this.sym === Sym.SWITCH ? 0xc8ffe6 : 0xfff0c8, () => {
      this.lit = on;
      this.applyTexture();
    });
    if (on && this.aura.visible) tl.fromTo(this.aura, { alpha: 1 }, { alpha: 0.45, duration: T(0.5), ease: 'power2.out' }, 0);
    return done(tl);
  }

  /* ---------------------------------------------------------------- idle life */

  /**
   * Per-frame idle life: breathing, a creature's sway, a coin's tremble, frame playback and the win
   * motion. `calm` = the board is at rest (idle loops run); quality.low keeps only what carries
   * information (win motion, heat) and drops the decorative loops.
   */
  tick(dtMs: number, t: number, calm: number) {
    const dt = dtMs / 1000;
    const s = this.sym;
    const low = quality.low || speed.reduced;
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let ox = 0;
    let oy = 0;
    if (calm > 0.001 && !low) {
      const b = Math.sin(t * (s === Sym.COIN ? 2.2 : 1.7) + this.phase);
      const depth = (CREATURE(s) ? 0.02 : s === Sym.LOCO ? 0.008 : 0.012) * calm;
      sy += b * depth;
      sx -= b * depth * 0.45;
      if (CREATURE(s)) rot = Math.sin(t * 1.1 + this.phase * 1.3) * 0.035 * calm;
      else if (s === Sym.FS || s === Sym.COIN) rot = Math.sin(t * 0.9 + this.phase) * 0.025 * calm;
      oy = -Math.max(0, b) * this.S * (s === Sym.COIN && this.cell.held ? 0.018 : 0.008) * calm;
    }
    if (this.heat > 0) {
      const h = this.heat * this.S;
      ox += (Math.random() - 0.5) * h * 0.035;
      oy += (Math.random() - 0.5) * h * 0.025;
      rot += (Math.random() - 0.5) * this.heat * 0.06;
    }
    if (this.winT >= 0) {
      this.winT += dt;
      const w = this.winT;
      const env = Math.min(1, w / 0.12);
      const beat = Math.sin(w * 9.5);
      sy *= 1 + beat * 0.06 * env;
      sx *= 1 - beat * 0.035 * env;
      oy -= Math.max(0, beat) * this.S * 0.04 * env;
      this.body.rotation = Math.sin(w * 6.3 + this.phase) * 0.085 * env;
    }
    this.idle.scale.set(sx * this.pulse.k, sy * this.pulse.k);
    this.idle.rotation = rot;
    this.idle.position.set(ox, oy);
    const f = this.frames;
    if (f) {
      f.t += dt;
      let i = Math.floor(f.t * f.fps);
      if (i >= f.list.length) {
        if (f.loop) i %= f.list.length;
        else {
          this.frames = undefined;
          this.applyTexture(this.winT >= 0 ? 'win' : 'idle');
          return;
        }
      }
      const tx = f.list[i];
      if (this.body.texture !== tx) this.setTexture(tx);
    }
  }

  /** Quick cartoon blink (characters with a blink frame). */
  blink(double = false) {
    const set = this.tex.sets.get(this.key);
    if (!set?.blink || this.blinking || this.winT >= 0 || this.frames) return;
    this.blinking = true;
    this.applyTexture('blink');
    const open = () => {
      if (this.destroyed || this.winT >= 0) return;
      this.applyTexture('idle');
    };
    gsap.fromTo(this.pulse, { k: 0.975 }, { k: 1, duration: 0.2, ease: 'sine.out' });
    gsap.delayedCall(0.11, () => {
      open();
      if (!double) {
        this.blinking = false;
        return;
      }
      gsap.delayedCall(0.1, () => {
        if (this.destroyed || this.winT >= 0) return (this.blinking = false);
        this.applyTexture('blink');
        gsap.delayedCall(0.09, () => {
          open();
          this.blinking = false;
        });
      });
    });
  }

  playIdleFrames(): boolean {
    const set = this.tex.sets.get(this.key);
    if (quality.low || !set?.idleFrames?.length || this.frames || this.winT >= 0) return false;
    this.frames = { list: set.idleFrames, fps: 8, t: 0, loop: false };
    return true;
  }

  /** Where a glint catches this symbol (upper-left highlight), in view space. */
  glintPoint(): { x: number; y: number } | null {
    if (!SHINY(this.sym)) return null;
    const S = this.S;
    return { x: -S * (0.12 + Math.random() * 0.16), y: -S * (0.14 + Math.random() * 0.16) };
  }

  /* ---------------------------------------------------------------- win */

  startWin() {
    if (this.winT >= 0) return;
    this.winT = 0;
    this.blinking = false;
    const set = this.tex.sets.get(this.key);
    if (set?.winFrames?.length && !quality.low) this.frames = { list: set.winFrames, fps: 9, t: 0, loop: true };
    else {
      this.frames = undefined;
      this.applyTexture('win');
    }
  }

  stopWin() {
    if (this.winT < 0) return;
    this.winT = -1;
    this.frames = undefined;
    this.body.rotation = 0;
    this.applyTexture('idle');
  }

  /** Two quick beats of a heart (ticket anticipation). */
  heartbeat(strength = 1) {
    if (speed.reduced) return;
    gsap.killTweensOf(this.pulse);
    const a = 1 + 0.13 * strength;
    const b = 1 + 0.07 * strength;
    gsap
      .timeline()
      .to(this.pulse, { k: a, duration: T(0.07), ease: 'power2.out' })
      .to(this.pulse, { k: 1, duration: T(0.12), ease: 'power1.in' })
      .to(this.pulse, { k: b, duration: T(0.07), ease: 'power2.out' })
      .to(this.pulse, { k: 1, duration: T(0.2), ease: 'sine.inOut' });
    if (this.aura.visible) gsap.fromTo(this.aura, { alpha: 0.9 }, { alpha: 0.4, duration: T(0.45), ease: 'power2.out' });
  }

  /**
   * White-hot flare over the body (0 -> peak over `up`, back over `down`) as a timeline; `swap`
   * runs at the peak, so a texture change happens inside the flash instead of popping.
   */
  flareTl(up: number, down: number, tint = 0xfff0c8, swap?: () => void, peak = 0.95): gsap.core.Timeline {
    const tl = gsap.timeline({ onComplete: () => void (this.flash.visible = false) });
    tl.call(() => {
      gsap.killTweensOf(this.flash);
      this.flash.texture = this.body.texture;
      this.flash.scale.copyFrom(this.body.scale);
      this.flash.tint = tint;
      this.flash.alpha = 0;
      this.flash.visible = true;
    });
    tl.to(this.flash, { alpha: peak, duration: up, ease: 'power2.in' });
    tl.call(() => {
      swap?.();
      this.flash.texture = this.body.texture;
      this.flash.scale.copyFrom(this.body.scale);
    });
    tl.to(this.flash, { alpha: 0, duration: down, ease: 'power2.out' });
    return tl;
  }

  stopBreathing() {
    this.breathe?.kill();
    this.breathe = undefined;
  }

  /** Stop every tween this view owns (before it goes back to the pool). */
  killMotion() {
    this.breathe?.kill();
    this.breathe = undefined;
    for (const o of [this, this.scale, this.body, this.body.scale, this.idle, this.idle.scale, this.pulse, this.aura, this.flash]) gsap.killTweensOf(o);
    if (this.valueText) gsap.killTweensOf(this.valueText.scale);
    this.winT = -1;
    this.frames = undefined;
    this.heat = 0;
    this.flash.visible = false;
  }

  override destroy() {
    this.killMotion();
    this.clearValue();
    if (this.badges.parent !== this) this.badges.destroy({ children: true });
    super.destroy({ children: true });
  }
}

/** Re-export for the train layer (coin value bitmaps in the same style). */
export { numBaseStyle };

function done(tl: gsap.core.Timeline): Promise<void> {
  return new Promise((r) => {
    tl.eventCallback('onComplete', () => r());
  });
}
