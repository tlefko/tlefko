import { BitmapText, Container, Sprite, Texture } from 'pixi.js';
import { bitmapNum, numBaseStyle, type NumTone } from '../text';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { SYMBOL_ART } from '../../art/symbols';
import { KEG_FUSE_TIP } from '../../art/keg';
import { BOMB_FUSE_TIP } from '../../art/bomb';
import { CAP_BOMB } from '../../art/crew';
import { bombStandIn, fusePlate, sizeSeal } from '../../art/fx';
import type { Cell } from '../../math/types';
import { quality } from '../quality';
import { T, speed } from '../timing';

/** The bomb art's iron ball in its 256 box: the same ball track C holds in the captain's hand. */
const BALL = CAP_BOMB;
/** A lit keg trembles a little while it waits to blow. */
const LIT_HEAT = 0.16;

export const SIX = 9;
export const FS = 10;
export const BOMB = 11;

export interface SymbolSet {
  idle: Texture;
  blink?: Texture;
  win?: Texture;
  /** Kaboom Bomb about to blow (fuse 0). */
  hot?: Texture;
  /** Looped during the win highlight (track D, optional). */
  winFrames?: Texture[];
  /** Idle loop (the bomb's fuse flicker) or an occasional idle act (creatures); track D, optional. */
  idleFrames?: Texture[];
  /** Kaboom Bomb hot loop (heat pulse). */
  hotFrames?: Texture[];
}

/** What a SYMBOL_ART entry may carry (track D adds the optional frames as they are drawn). */
interface ArtEntry {
  idle: () => string;
  blink?: () => string;
  win?: () => string;
  hot?: () => string;
  winFrames?: (() => string)[];
  idleFrames?: (() => string)[];
  hotFrames?: (() => string)[];
}

/** Bomb badge plates, rasterised with the symbols. */
export interface BadgeTextures {
  seal: Texture;
  plate: Texture;
  plateHot: Texture;
}

type FrameKey = 'winFrames' | 'idleFrames' | 'hotFrames';

/**
 * All symbol textures rasterised for the current cell size, in two passes:
 * - `build()` (on the layout's critical path): one texture per pose (idle, blink, the single win
 *   pose, the bomb's hot art) and the bomb badges. Enough to play everything.
 * - then, off the critical path, the frame loops (track D's win, idle and hot frames): one frame
 *   per idle callback, only while `idleGate()` says the board is at rest, each uploaded to the GPU
 *   at once (`onLazy`), and a symbol's loop is installed only when all its frames are ready. Until
 *   then views use the single pose. quality.low never builds or plays the loops.
 * A new build (resize) cancels the queue of the previous one (generation counter).
 */
export class SymbolTextures {
  sets = new Map<number, SymbolSet>();
  badges?: BadgeTextures;
  size = 0;
  private gen = 0;
  private px = 0;
  private lazyTimer = 0;
  /** May the frame loops be rasterised now? (the presenter answers: only while the board is idle) */
  idleGate: () => boolean = () => true;
  /** Textures made off the critical path, to upload them to the GPU right away. */
  onLazy?: (t: Texture[]) => void;

  constructor() {
    quality.onChange((low) => {
      if (!low && this.px) this.scheduleFrames(this.gen);
    });
  }

  private art(): Record<number, ArtEntry | undefined> {
    const art = SYMBOL_ART as unknown as Record<number, ArtEntry | undefined>;
    // the bomb uses a stand-in until track D's art exists
    if (!art[BOMB]) return { ...art, [BOMB]: { idle: () => bombStandIn(false), hot: () => bombStandIn(true) } };
    return art;
  }

  async build(cellPx: number) {
    const gen = ++this.gen;
    const px = Math.round(cellPx * 1.22);
    const prevPx = this.px;
    this.size = cellPx;
    this.px = px;
    clearTimeout(this.lazyTimer);
    const art = this.art();
    const sets = new Map<number, SymbolSet>();
    const bp = Math.round(cellPx * 0.46);
    let badges: BadgeTextures | undefined;
    // one raster job per texture, run a few per frame: the SVG strings are made and drawn in small
    // batches, so a rebuild (boot, resize) never blocks one frame with the whole symbol set
    const jobs: (() => Promise<void>)[] = [];
    for (let s = 0; s <= BOMB; s++) {
      const a = art[s];
      if (!a) continue;
      const old = prevPx === px ? this.sets.get(s) : undefined;
      const set: SymbolSet = { idle: Texture.EMPTY, winFrames: old?.winFrames, idleFrames: old?.idleFrames, hotFrames: old?.hotFrames };
      sets.set(s, set);
      jobs.push(() => svgTexture(`sym${s}i`, a.idle(), px).then((t) => void (set.idle = t)));
      const blink = a.blink;
      const win = a.win;
      const hot = a.hot;
      if (blink) jobs.push(() => svgTexture(`sym${s}b`, blink(), px).then((t) => void (set.blink = t)));
      if (win) jobs.push(() => svgTexture(`sym${s}w`, win(), px).then((t) => void (set.win = t)));
      if (hot) jobs.push(() => svgTexture(`sym${s}h`, hot(), px).then((t) => void (set.hot = t)));
    }
    jobs.push(() =>
      Promise.all([svgTexture('badge-seal', sizeSeal(), bp), svgTexture('badge-plate', fusePlate(false), bp), svgTexture('badge-plate-hot', fusePlate(true), bp)]).then(([seal, plate, plateHot]) => {
        badges = { seal, plate, plateHot };
      }),
    );
    for (let i = 0; i < jobs.length; i += 2) {
      if (gen !== this.gen) return;
      await Promise.all(jobs.slice(i, i + 2).map((j) => j()));
      if (i + 2 < jobs.length) await yieldTask();
    }
    if (gen !== this.gen) return;
    this.sets = sets;
    this.badges = badges;
    this.scheduleFrames(gen);
  }

  /** Queue the frame loops of every symbol for idle-time rasterising. */
  private scheduleFrames(gen: number) {
    if (quality.low) return;
    const art = this.art();
    const px = this.px;
    const queue: { s: number; key: FrameKey; fs: (() => string)[] }[] = [];
    // win frames first (the most visible), then the bomb's loops, then idle acts
    for (const key of ['winFrames', 'hotFrames', 'idleFrames'] as const) {
      for (let s = 0; s <= BOMB; s++) {
        const fs = art[s]?.[key];
        if (fs?.length && !this.sets.get(s)?.[key]) queue.push({ s, key, fs });
      }
    }
    if (!queue.length) return;
    const tag = { win: 'wf', idle: 'if', hot: 'hf' } as const;
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
      const k = tag[job.key.replace('Frames', '') as 'win' | 'idle' | 'hot'];
      void svgTexture(`sym${job.s}${k}${i}`, job.fs[i](), px).then((t) => {
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
    for (const s of this.sets.values()) {
      for (const t of [s.idle, s.blink, s.win, s.hot, ...(s.winFrames ?? []), ...(s.idleFrames ?? []), ...(s.hotFrames ?? [])]) if (t) out.push(t);
    }
    if (this.badges) out.push(this.badges.seal, this.badges.plate, this.badges.plateHot);
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
const CREATURE = (s: number) => s >= 4 && s <= 8;
const SHINY = (s: number) => s <= 3 || s === FS;

interface Frames {
  list: Texture[];
  fps: number;
  t: number;
  loop: boolean;
}

interface BombBadges {
  seal: Sprite;
  size: BitmapText;
  plate: Sprite;
  fuse: BitmapText;
  sizeK: number;
  fuseK: number;
}

/**
 * One symbol on the grid.
 * - The view itself carries the choreography (drops, landings, pops): position, scale, alpha.
 * - `idle` carries idle life (breathing, sway, lit-keg tremble, heartbeat): driven per frame.
 * - `body` is the illustration; the win motion turns it and swaps its frames.
 * - `aura` is the soft glow of kegs, chests and bombs; `flash` a white-hot copy of the body used
 *   to hide a texture swap (a keg catching, a bomb going hot) inside a flare.
 * - Badges (lit keg x2, bomb size and fuse) sit on the view, outside the idle motion, so numbers
 *   never wobble.
 */
export class SymbolView extends Container {
  cell!: Cell;
  idle = new Container();
  body = new Sprite();
  aura = new Sprite(softDotTexture());
  flash = new Sprite();
  private S = 100;
  private breathe?: gsap.core.Tween;
  blinking = false;
  /** Idle motion phase (so neighbours never breathe in sync). */
  private phase = Math.random() * Math.PI * 2;
  /** Heartbeat / swell multiplier on the idle scale (tweened). */
  pulse = { k: 1 };
  /** 0..1: shaking with heat (lit keg waiting to blow, a bomb about to go). */
  heat = 0;
  private winT = -1;
  private frames?: Frames;
  private litBadge?: BitmapText;
  private bomb?: BombBadges;
  /**
   * The badges (lit keg x2, bomb size and fuse). They start on the view; GridView lifts the box into
   * its badge overlay (above the particle layer) and makes it follow the view every frame.
   */
  badges = new Container();
  /** The bomb sprite's size factor (tweened when it grows). */
  private bombK = { k: 1 };

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
    this.body.rotation = 0;
    this.body.tint = 0xffffff;
    this.flash.visible = false;
    this.blinking = false;
    this.clearLitBadge();
    this.clearBomb();
    gsap.killTweensOf(this.bombK);
    this.bombK.k = bombScale(cell.size ?? 1);
    this.applyTexture();
    if (this.sym === SIX && cell.lit) {
      this.showLitBadge(false);
      this.heat = LIT_HEAT;
    }
    if (this.sym === BOMB) {
      this.showBomb(cell.size ?? 1, cell.fuse ?? 3, false);
      this.bombLoop();
    }
    this.breathe?.kill();
    this.breathe = undefined;
    const sym = this.sym;
    if (sym === SIX || sym === FS || sym === BOMB) {
      this.aura.visible = true;
      this.aura.tint = sym === SIX ? (cell.lit ? 0xff7a1f : 0xf4b73a) : sym === FS ? 0x5fd6cc : 0xff5a1f;
      const a = (S * (sym === BOMB ? 1.35 : 1.5)) / this.aura.texture.width;
      this.aura.scale.set(a);
      this.aura.alpha = sym === BOMB ? 0.22 : 0.32;
      this.startAuraBreath();
    } else this.aura.visible = false;
  }

  private startAuraBreath() {
    this.breathe?.kill();
    this.breathe = undefined;
    if (quality.low || !this.aura.visible) return;
    const hi = this.sym === BOMB ? 0.42 : 0.55;
    this.breathe = gsap.to(this.aura, { alpha: hi, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  private setTexture(t: Texture) {
    this.body.texture = t;
    const k = (this.S * 1.0) / t.width;
    const grow = this.sym === BOMB ? this.bombK.k : 1;
    this.body.scale.set(k * grow);
    this.baseK = k * grow;
    if (this.flash.visible) {
      this.flash.texture = t;
      this.flash.scale.copyFrom(this.body.scale);
    }
  }

  private applyTexture(pose: 'idle' | 'blink' | 'win' = 'idle') {
    const set = this.tex.sets.get(this.sym);
    if (!set) return;
    let t = set.idle;
    if (this.sym === SIX) t = this.cell.lit ? (set.win ?? set.idle) : set.idle;
    else if (this.sym === BOMB) t = (this.cell.fuse ?? 1) <= 0 ? (set.hot ?? set.idle) : set.idle;
    else if (pose === 'win' && set.win) t = set.win;
    else if (pose === 'blink' && set.blink) t = set.blink;
    this.setTexture(t);
  }
  baseK = 1;

  pose(p: 'idle' | 'blink' | 'win') {
    this.applyTexture(p);
  }

  /* ---------------------------------------------------------------- idle life */

  /**
   * Per-frame idle life: breathing, a creature's sway, a lit keg's tremble, frame playback and
   * the win motion. `calm` = the board is at rest (idle loops run); quality.low keeps only what
   * carries information (win motion, heat) and drops the decorative loops.
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
      const b = Math.sin(t * (s === BOMB ? 2.6 : 1.7) + this.phase);
      const depth = (s === SIX ? 0.014 : s === BOMB ? 0.022 : CREATURE(s) ? 0.02 : 0.012) * calm;
      sy += b * depth;
      sx -= b * depth * 0.45;
      if (CREATURE(s)) rot = Math.sin(t * 1.1 + this.phase * 1.3) * 0.035 * calm;
      else if (s === FS || s === BOMB) rot = Math.sin(t * 0.9 + this.phase) * 0.02 * calm;
      oy = -Math.max(0, b) * this.S * 0.008 * calm;
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
      // a springy cheer: bob on a beat, squash on the down, wiggle on the up
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

  /** Quick cartoon blink (characters with a blink frame): the head dips a touch as the lids close. */
  blink(double = false) {
    const set = this.tex.sets.get(this.sym);
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

  /** Play track D's idle frames once (a creature's little idle act), if it has any. */
  playIdleFrames(): boolean {
    const set = this.tex.sets.get(this.sym);
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

  /** Start the win motion: track D's win frames when drawn, else the win pose, plus the procedural cheer. */
  startWin() {
    if (this.winT >= 0) return;
    this.winT = 0;
    this.blinking = false;
    const set = this.tex.sets.get(this.sym);
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

  /** Two quick beats of a heart (scatter anticipation): swell, settle, smaller swell, settle. */
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
   * White-hot flare over the body (0 -> peak over `up`, back over `down`) as a timeline to place in
   * a choreography; `swap` runs at the peak, so a texture change happens inside the flash instead
   * of popping.
   */
  flareTl(up: number, down: number, tint = 0xfff0c8, swap?: () => void, peak = 0.95): gsap.core.Timeline {
    const tl = gsap.timeline({ onComplete: () => (this.flash.visible = false) });
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

  /* ---------------------------------------------------------------- powder keg */

  /** A cold powder keg's fuse catches (the caller wraps this in a flare so the swap never pops). */
  ignite() {
    this.cell.lit = true;
    this.heat = Math.max(this.heat, LIT_HEAT);
    this.applyTexture();
    this.aura.tint = 0xff7a1f;
    gsap.fromTo(this.aura, { alpha: 1 }, { alpha: 0.5, duration: 0.5, ease: 'power2.out' });
    this.showLitBadge(true);
  }

  showLitBadge(animate = true) {
    if (this.litBadge) return;
    const b = bitmapNum('x2', 'fire', this.S * 0.34);
    const k = b.scale.x;
    b.position.set(this.S * 0.3, -this.S * 0.33);
    this.badges.addChild(b);
    this.litBadge = b;
    if (animate) {
      gsap.fromTo(b.scale, { x: 0, y: 0 }, { x: k, y: k, duration: T(0.34), ease: 'back.out(3)' });
      gsap.fromTo(b, { rotation: -0.5 }, { rotation: 0, duration: T(0.45), ease: 'elastic.out(1, .45)' });
    }
  }
  clearLitBadge() {
    if (this.litBadge) gsap.killTweensOf(this.litBadge.scale);
    this.litBadge?.destroy();
    this.litBadge = undefined;
  }

  /* ---------------------------------------------------------------- Kaboom Bomb */

  /** Size and fuse badges: a crimson seal with the "+N" it will add, an iron plate counting cascades. */
  private showBomb(size: number, fuse: number, animate: boolean) {
    const bt = this.tex.badges;
    if (!bt) return;
    const S = this.S;
    const seal = new Sprite(bt.seal);
    seal.anchor.set(0.5);
    seal.width = seal.height = S * 0.4;
    seal.position.set(-S * 0.3, -S * 0.3);
    const sizeT = bitmapNum(`+${size}`, 'gold', S * 0.24);
    const sizeK = sizeT.scale.x;
    fitNum(sizeT, S * 0.3);
    sizeT.position.copyFrom(seal.position);
    const plate = new Sprite(fuse <= 0 ? bt.plateHot : bt.plate);
    plate.anchor.set(0.5);
    plate.width = plate.height = S * 0.36;
    plate.position.set(S * 0.31, S * 0.3);
    const fuseT = bitmapNum(`${Math.max(0, fuse)}`, fuse <= 0 ? 'fire' : 'white', S * 0.24);
    const fuseK = fuseT.scale.x;
    fuseT.position.copyFrom(plate.position);
    this.badges.addChild(seal, sizeT, plate, fuseT);
    this.bomb = { seal, size: sizeT, plate, fuse: fuseT, sizeK, fuseK };
    if (animate) {
      for (const o of [seal, plate]) {
        const k = o.scale.x;
        gsap.fromTo(o.scale, { x: 0, y: 0 }, { x: k, y: k, duration: T(0.3), ease: 'back.out(2.6)' });
      }
      for (const o of [sizeT, fuseT]) {
        const k = o.scale.x;
        gsap.fromTo(o.scale, { x: 0, y: 0 }, { x: k, y: k, duration: T(0.34), ease: 'back.out(3)', delay: T(0.05) });
      }
    }
  }

  private clearBomb() {
    const b = this.bomb;
    if (!b) return;
    for (const o of [b.seal, b.size, b.plate, b.fuse]) {
      gsap.killTweensOf(o);
      gsap.killTweensOf(o.scale);
      o.destroy();
    }
    this.bomb = undefined;
  }

  /** Hide the bomb badges (in flight) or pop them in (on landing). */
  showBadges(on: boolean, animate = false) {
    const b = this.bomb;
    if (!b) return;
    const items: [Sprite | BitmapText, number][] = [
      [b.seal, b.seal.scale.x || 1],
      [b.size, b.size.scale.x || 1],
      [b.plate, b.plate.scale.x || 1],
      [b.fuse, b.fuse.scale.x || 1],
    ];
    for (const [o] of items) {
      gsap.killTweensOf(o.scale);
      o.visible = on;
    }
    if (!on || !animate) return;
    const S = this.S;
    // reset to the badge sizes, then pop them in
    b.seal.width = b.seal.height = S * 0.4;
    b.plate.width = b.plate.height = S * 0.36;
    b.size.scale.set(b.sizeK);
    fitNum(b.size, S * 0.3);
    b.fuse.scale.set(b.fuseK);
    items.forEach(([o], i) => {
      const k = o.scale.x;
      gsap.fromTo(o.scale, { x: 0, y: 0 }, { x: k, y: k, duration: T(0.3), ease: 'back.out(2.8)', delay: T(0.04 * (i >> 1)) });
    });
  }

  /** The bomb's fuse flicker (idle) or heat pulse (hot), looped; still art at low quality. */
  private bombLoop() {
    const set = this.tex.sets.get(BOMB);
    const hot = (this.cell.fuse ?? 1) <= 0;
    const list = hot ? set?.hotFrames : set?.idleFrames;
    this.frames = list?.length && !quality.low ? { list, fps: hot ? 7 : 10, t: Math.random() * 0.3, loop: true } : undefined;
  }

  /** The bomb's iron ball centre in view space (the art puts it below and left of the box centre). */
  ballCenter(): { x: number; y: number } {
    const k = (this.sym === BOMB ? this.bombK.k : 1) * this.S;
    return { x: (BALL.cx / 256 - 0.5) * k, y: (BALL.cy / 256 - 0.5) * k };
  }

  /** On-screen diameter of the bomb's ball at view scale 1. */
  ballDiameter(): number {
    return ((2 * BALL.r) / 256) * (this.sym === BOMB ? this.bombK.k : 1) * this.S;
  }

  /** Where the fuse spark sits (view space): the fuse tip of the keg or bomb art (track D's constants). */
  fuseTip(): { x: number; y: number } {
    const tip = this.sym === BOMB ? ((this.cell.fuse ?? 1) <= 0 ? BOMB_FUSE_TIP.hot : BOMB_FUSE_TIP.lit) : KEG_FUSE_TIP;
    const k = (this.sym === BOMB ? this.bombK.k : 1) * this.S;
    return { x: (tip[0] / 256 - 0.5) * k, y: (tip[1] / 256 - 0.5) * k };
  }

  /**
   * The bomb grew (a keg blew somewhere): it swells with a glow flash and the size number flips
   * over to the new value with a punch.
   */
  growBomb(to: number): Promise<void> {
    if (this.sym !== BOMB || !this.bomb) return Promise.resolve();
    this.cell.size = to;
    const b = this.bomb;
    const tl = gsap.timeline();
    tl.to(this.pulse, { k: 1.28, duration: T(0.12), ease: 'power2.out' }, 0);
    tl.to(this.pulse, { k: 1, duration: T(0.5), ease: 'elastic.out(1, .38)' }, T(0.12));
    tl.fromTo(this.aura, { alpha: 1 }, { alpha: 0.3, duration: T(0.6), ease: 'power2.out' }, 0);
    // the sprite itself grows a notch with each size, under the swell
    tl.to(this.bombK, { k: bombScale(to), duration: T(0.24), ease: 'power2.out', onUpdate: () => this.setTexture(this.body.texture) }, 0.02);
    this.flipNum(tl, b.size, `+${to}`, 'gold', b.sizeK, this.S * 0.3, T(0.04));
    return done(tl);
  }

  /** The fuse burned down one cascade: the counter flips; at 0 the bomb goes red hot. */
  tickFuse(to: number): Promise<void> {
    if (this.sym !== BOMB || !this.bomb) return Promise.resolve();
    this.cell.fuse = to;
    const b = this.bomb;
    const tl = gsap.timeline();
    const hot = to <= 0;
    this.flipNum(tl, b.fuse, `${Math.max(0, to)}`, hot ? 'fire' : 'white', b.fuseK, this.S * 0.3, 0);
    tl.fromTo(b.plate.scale, { x: b.plate.scale.x * 1.25, y: b.plate.scale.y * 1.25 }, { x: b.plate.scale.x, y: b.plate.scale.y, duration: T(0.35), ease: 'back.out(3)' }, 0);
    if (hot) {
      tl.call(() => {
        const bt = this.tex.badges;
        if (bt && this.bomb) this.bomb.plate.texture = bt.plateHot;
      }, [], T(0.1));
      tl.add(
        this.flareTl(T(0.1), T(0.3), 0xffb080, () => {
          this.applyTexture();
          this.bombLoop();
        }),
        0,
      );
      tl.call(() => {
        this.heat = 0.55;
        this.aura.tint = 0xff3a1a;
      }, [], T(0.1));
    }
    return done(tl);
  }

  /** Flip a bitmap number over (squash to a line, swap the text, spring back with a punch). */
  private flipNum(tl: gsap.core.Timeline, t: BitmapText, text: string, tone: NumTone, k: number, maxW: number, at: number) {
    tl.to(t.scale, { y: 0, duration: T(0.07), ease: 'power2.in' }, at);
    tl.call(() => {
      t.style = numBaseStyle(tone);
      t.text = text;
      t.scale.set(k);
      fitNum(t, maxW);
      const kk = t.scale.x;
      t.scale.set(kk * 1.45, 0);
      gsap.to(t.scale, { y: kk * 1.45, duration: T(0.07), ease: 'power2.out' });
      gsap.to(t.scale, { x: kk, y: kk, duration: T(0.3), ease: 'back.out(3)', delay: T(0.07) });
    }, [], at + T(0.07));
  }

  stopBreathing() {
    this.breathe?.kill();
    this.breathe = undefined;
  }

  /** Stop every tween this view owns (before it goes back to the pool). */
  killMotion() {
    this.breathe?.kill();
    this.breathe = undefined;
    for (const o of [this, this.scale, this.body, this.body.scale, this.idle, this.idle.scale, this.pulse, this.aura, this.flash, this.bombK]) gsap.killTweensOf(o);
    if (this.litBadge) gsap.killTweensOf(this.litBadge.scale);
    this.winT = -1;
    this.frames = undefined;
    this.heat = 0;
    this.flash.visible = false;
  }

  override destroy() {
    this.killMotion();
    this.clearBomb();
    this.clearLitBadge();
    if (this.badges.parent !== this) this.badges.destroy({ children: true });
    super.destroy({ children: true });
  }
}

/** A bomb's sprite grows with its size: from 0.9 of the cell at +1 to 1.14 at +5. */
export function bombScale(size: number): number {
  return 0.9 + 0.06 * (Math.max(1, Math.min(5, size)) - 1);
}

/** Shrink a bitmap number to fit a width (never grows it). */
function fitNum(t: BitmapText, maxW: number) {
  if (t.width > maxW) t.scale.set(t.scale.x * (maxW / t.width));
}

function done(tl: gsap.core.Timeline): Promise<void> {
  return new Promise((r) => {
    tl.eventCallback('onComplete', () => r());
  });
}
