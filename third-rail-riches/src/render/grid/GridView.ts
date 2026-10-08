import { Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { softDotTexture } from '../textures';
import { SymbolView, SymbolTextures, SIX, FS, BOMB } from './SymbolView';
import { cellCenter, type Layout, COLS, ROWS } from '../layout';
import { T, done, wait, speed } from '../timing';
import { quality } from '../quality';
import { blastArea, type BombGrowth, type BombState, type Cell, type Cluster, type Explosion, type Step } from '../../math/types';
import type { Particles } from '../fx/Particles';
import { ClusterGlow, HUE, pointAt } from './Outline';
import { FxKit } from './FxKit';
import { BlastFx } from './Blast';

export interface DropHooks {
  onColumnLanded?: (reel: number, isLast: boolean) => void;
  onSpecial?: (view: SymbolView, kind: 'six' | 'fs' | 'bomb', fsIndex: number) => void;
  /** The reels still held for a scatter; called as each one lands, and with ([], false) at the end. */
  onAnticipation?: (reels: number[], on: boolean) => void;
  /** A heartbeat while a reel is held (the chests on the board beat at the same moment). */
  onHeartbeat?: () => void;
}

export interface BlastHooks {
  /** A blast goes off (keg or bomb), in the order the booms happen. */
  onBoom?: (ex: Explosion, index: number) => void;
}

/** A one-shot sound request (docs/SOUNDS.md ids); the presenter decides whether it plays. */
export type Sfx = (id: string, opts?: { index?: number; volume?: number; delay?: number }) => void;

const pos = (reel: number, row: number) => reel * ROWS + row;

/**
 * The thrown bomb's flight from p0 to p1. With the hand's velocity (vx, vy): linear air drag k and
 * gravity g are solved so that a projectile leaving p0 at exactly that velocity lands on p1 at `dur`
 * (x(t) = x0 + vx A(t), A(t) = (1 - e^-kt) / k; y adds gravity against the same drag). That needs
 * the hand to be moving toward the target fast enough; otherwise it is a plain lob (no drag) over a
 * sensible apex. `along` is the share of the horizontal distance covered (the spin follows it).
 */
function flightPath(p0: { x: number; y: number }, p1: { x: number; y: number }, vx: number, vy: number, dur: number, S: number) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const need = Math.abs(vx) > 1 ? dx / vx : -1; // A(dur) must equal this
  if (need > 0 && need < dur * 0.92 && vy < 0) {
    // solve (1 - e^-kD) / k = need for k (monotone decreasing in k)
    let lo = 1e-4;
    let hi = 80;
    for (let i = 0; i < 60; i++) {
      const k = (lo + hi) / 2;
      const a = (1 - Math.exp(-k * dur)) / k;
      if (a > need) lo = k;
      else hi = k;
    }
    const k = (lo + hi) / 2;
    const A = (t: number) => (1 - Math.exp(-k * t)) / k;
    const AD = A(dur);
    const g = (k * (dy - vy * AD)) / (dur - AD);
    if (g > S * 2 && g < S * 120) {
      return {
        dur,
        at: (t: number) => {
          const a = A(t);
          return { x: p0.x + vx * a, y: p0.y + (g / k) * t + (vy - g / k) * a, along: a / AD };
        },
      };
    }
  }
  // lob: steady across, gravity down, over an apex above the higher end
  const apex = Math.min(p0.y, p1.y) - S * (1.1 + Math.min(1.1, Math.abs(dx) / (S * 6)));
  const d0 = Math.max(1, p0.y - apex);
  const d1 = Math.max(1, p1.y - apex);
  const sg = (Math.sqrt(2 * d0) + Math.sqrt(2 * d1)) / dur;
  const g = sg * sg;
  const v0 = -Math.sqrt(2 * g * d0);
  return { dur, at: (t: number) => ({ x: p0.x + (dx * t) / dur, y: p0.y + v0 * t + 0.5 * g * t * t, along: t / dur }) };
}
const heavy = (sym: number) => sym === SIX || sym === FS || sym === BOMB;
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/**
 * The 6x5 board. Owns the SymbolViews and every grid motion:
 * - spin in: the old board hops and falls out while the new one drops in behind it (no empty hold);
 * - landings: stretch in the fall, squash on impact, a small rebound, dust (heavier for kegs,
 *   chests and bombs); held reels fall slower under the scatter anticipation;
 * - wins: a glowing outline traces each cluster, winners wake as it passes and cheer, then pop;
 * - kegs: ignite inside a white-hot flare; blasts ripple through chains with overlap;
 * - cascades: gravity with stagger and overshoot;
 * - Kaboom Bombs: landing, growth, fuse ticks, detonation with its blast square;
 * - idle life: breathing, sway, blinks, glints, lit kegs trembling, bomb fuses fizzing.
 */
export class GridView extends Container {
  views: (SymbolView | null)[] = new Array(COLS * ROWS).fill(null);
  private pool: SymbolView[] = [];
  /** Decals under the symbols (scorch marks). */
  private scorchLayer = new Container();
  /** The symbol views (masked to the hold while things drop in or fall out). */
  private symbols = new Container();
  /** Outlines, flashes, rings: above the symbols, never masked. */
  fxLayer = new Container();
  private maskG = new Graphics();
  /**
   * The badge overlay (bomb size and fuse, lit keg x2). It starts as the grid's top child; the
   * presenter mounts it above the particle layer, so sparks, dust and smoke never cover a number.
   * Each view's badge box follows its view every frame (see syncBadges).
   */
  badgeRoot = new Container();
  private badgeLayer = new Container();
  private badgeMask = new Graphics();
  /** Every view this grid ever made (live and pooled): the badge boxes to keep in step. */
  private made: SymbolView[] = [];
  kit = new FxKit();
  blast: BlastFx;
  L!: Layout;
  private t = 0;
  private calm = 0;
  private blinkAt = 1.5;
  private glintAt = 1;
  private actAt = 4;
  private glows: ClusterGlow[] = [];
  /** Trace order of the current winners (pos -> 0..1), so they pop in the order they lit up. */
  private winOrder = new Map<number, number>();
  /** Latest landing impact queued on the timeline being built (see settled()). */
  private lastImpact = 0;
  /** Sounds tied to a single board beat (a fuse tick, a bomb growing, the trace); set by the presenter. */
  sfx: Sfx = () => undefined;

  constructor(
    public tex: SymbolTextures,
    private fx: Particles,
  ) {
    super();
    this.addChild(this.scorchLayer, this.symbols, this.fxLayer, this.maskG, this.badgeRoot);
    this.sortableChildren = false;
    this.badgeRoot.addChild(this.badgeLayer, this.badgeMask);
    this.badgeRoot.onRender = () => this.syncBadges();
    this.blast = new BlastFx(this.fxLayer, this.scorchLayer, this.kit, fx, () => this.L);
  }

  layout(L: Layout) {
    this.L = L;
    const pad = L.S * 0.3;
    this.maskG.clear().rect(L.grid.x - pad, L.grid.y, L.grid.w + pad * 2, L.grid.h).fill({ color: 0xffffff });
    this.badgeMask.clear().rect(L.grid.x - pad, L.grid.y, L.grid.w + pad * 2, L.grid.h).fill({ color: 0xffffff });
    this.setMasked(!!this.symbols.mask);
    for (let p = 0; p < this.views.length; p++) {
      const v = this.views[p];
      if (!v) continue;
      const c = cellCenter(L, Math.floor(p / ROWS), p % ROWS);
      v.position.set(c.x, c.y);
      v.setCell(v.cell, L.S);
    }
    this.clearGlows();
  }

  setMasked(on: boolean) {
    this.symbols.mask = on ? this.maskG : null;
    this.maskG.visible = on;
    this.badgeLayer.mask = on ? this.badgeMask : null;
    this.badgeMask.visible = on;
  }

  /**
   * Keep every badge box on its view: same transform and alpha, shown only while the view is on
   * the board container (a bomb in flight hides its badges anyway). Runs as the overlay renders,
   * so it is never a frame behind the symbols.
   */
  private syncBadges() {
    const root = this.badgeRoot;
    if (root.parent && root.parent !== this) {
      // mounted beside the grid (same parent): stand where the grid stands
      root.position.copyFrom(this.position);
      root.scale.copyFrom(this.scale);
      root.rotation = this.rotation;
      root.pivot.copyFrom(this.pivot);
      root.visible = this.visible;
    }
    this.badgeLayer.alpha = this.alpha * this.symbols.alpha;
    for (const v of this.made) {
      const b = v.badges;
      if (b.parent !== this.badgeLayer) continue;
      const on = v.visible && !v.destroyed && v.parent === this.symbols && b.children.length > 0;
      b.visible = on;
      if (!on) continue;
      b.position.copyFrom(v.position);
      b.scale.copyFrom(v.scale);
      b.skew.copyFrom(v.skew);
      b.pivot.copyFrom(v.pivot);
      b.rotation = v.rotation;
      b.alpha = v.alpha;
    }
  }

  private take(cell: Cell): SymbolView {
    let v = this.pool.pop();
    if (!v) {
      v = new SymbolView(this.tex);
      this.made.push(v);
      v.badges.visible = false;
      this.badgeLayer.addChild(v.badges);
    }
    v.setCell(cell, this.L.S);
    v.visible = true;
    this.symbols.addChild(v);
    return v;
  }

  private release(v: SymbolView) {
    v.killMotion();
    v.removeFromParent();
    v.visible = false;
    if (!this.pool.includes(v)) this.pool.push(v);
  }

  /** Instantly show a grid (first load / resume). */
  setGrid(cells: Cell[]) {
    for (const v of this.views) if (v) this.release(v);
    this.views = cells.map((cell, p) => {
      const v = this.take(cell);
      const c = cellCenter(this.L, Math.floor(p / ROWS), p % ROWS);
      v.position.set(c.x, c.y);
      return v;
    });
  }

  /**
   * Release any symbol the grid no longer tracks. A board is rebuilt every spin, so this
   * guarantees nothing orphaned (e.g. by overlapping drops) survives past one spin.
   */
  private sweep() {
    const live = new Set(this.views.filter(Boolean));
    for (const c of [...this.symbols.children]) if (c instanceof SymbolView && !live.has(c)) this.release(c);
  }

  /* ================================================================ landings */

  /**
   * Drop a view onto `y`: stretched in the fall, squashed on impact, a small rebound, settled with
   * overshoot, dust from under it when it hits the floor (always for heavy symbols).
   */
  private fallTo(tl: gsap.core.Timeline, v: SymbolView, y: number, at: number, dur: number, o: { floor?: boolean; heavy?: boolean; ease?: string } = {}) {
    const S = this.L.S;
    const hv = o.heavy ?? heavy(v.sym);
    tl.to(v, { y, duration: dur, ease: o.ease ?? 'power2.in' }, at);
    tl.to(v.scale, { x: 0.95, y: 1.07, duration: dur * 0.8, ease: 'power1.in' }, at);
    const land = at + dur;
    this.lastImpact = Math.max(this.lastImpact, land);
    const sq = hv ? 0.74 : 0.82;
    tl.to(v.scale, { x: 1 + (1 - sq) * 0.8, y: sq, duration: T(0.05), ease: 'power2.out' }, land);
    tl.to(v.scale, { x: 1, y: 1, duration: T(hv ? 0.36 : 0.28), ease: 'land' }, land + T(0.05));
    const hop = S * (hv ? 0.03 : 0.05);
    tl.to(v, { y: y - hop, duration: T(0.075), ease: 'power2.out' }, land + T(0.045));
    tl.to(v, { y, duration: T(0.09), ease: 'power2.in' }, land + T(0.12));
    if (o.floor || hv) tl.call(() => this.fx.dust(v.x, y + S * 0.42, hv), [], land);
  }

  /**
   * A drop or cascade is "done" for the choreography once its last symbol has hit and bounced;
   * the settle (a soft overshoot) carries on under whatever comes next instead of holding it.
   */
  private settled(tl: gsap.core.Timeline): Promise<void> {
    const at = this.lastImpact + T(0.17);
    this.lastImpact = 0;
    if (at >= tl.duration()) return done(tl);
    return new Promise((res) => {
      let fired = false;
      const fire = () => {
        if (fired) return;
        fired = true;
        res();
      };
      tl.call(fire, [], at);
      tl.eventCallback('onComplete', fire);
    });
  }

  /** Current symbols fall out of the bottom of the hold (kept for callers that only clear). */
  dropOut(): Promise<void> {
    this.sweep();
    this.clearGlows();
    this.setMasked(true);
    const tl = gsap.timeline();
    this.fallOut(tl);
    return done(tl);
  }

  /**
   * Queue the fall-out of every symbol on the board: the whole board crouches and hops at once (the
   * press answers on the very next frame), then it drops out column by column, stretching as it falls.
   */
  private fallOut(tl: gsap.core.Timeline): number {
    const { S, grid } = this.L;
    const hop = T(0.065);
    const fall = T(0.27);
    const dist = grid.h + S * 1.3;
    let last = 0;
    this.views.forEach((v, p) => {
      if (!v) return;
      const r = Math.floor(p / ROWS);
      const row = p % ROWS;
      gsap.killTweensOf(v);
      gsap.killTweensOf(v.scale);
      v.stopWin();
      v.heat = 0;
      const y0 = cellCenter(this.L, r, row).y;
      const d = hop + r * T(0.028) + (ROWS - 1 - row) * T(0.008);
      tl.to(v, { y: y0 - S * 0.09, duration: hop, ease: 'power2.out' }, 0);
      tl.to(v.scale, { x: 1.07, y: 0.9, duration: hop * 0.6, ease: 'power2.out' }, 0);
      tl.to(v.scale, { x: 0.97, y: 1.05, duration: hop * 0.4, ease: 'sine.inOut' }, hop * 0.6);
      tl.to(v, { y: y0 + dist, duration: fall, ease: 'power2.in' }, d);
      tl.to(v.scale, { x: 0.93, y: 1.12, duration: fall * 0.6, ease: 'power1.in' }, d);
      tl.call(() => this.release(v), [], d + fall);
      last = Math.max(last, d);
    });
    this.views = new Array(COLS * ROWS).fill(null);
    return last;
  }

  /** New symbols drop in column by column (used alone for the attract board). */
  dropIn(cells: Cell[], hooks: DropHooks = {}, allowAnticipation = true): Promise<void> {
    return this.spinIn(cells, hooks, allowAnticipation);
  }

  /**
   * A spin: the standing board hops and falls out and the new one drops in right behind it,
   * column by column. When two scatters are down, the remaining reels are held: they glow, the
   * chests beat like hearts, and each held reel falls slower and lands heavier.
   */
  spinIn(cells: Cell[], hooks: DropHooks = {}, allowAnticipation = true): Promise<void> {
    this.sweep();
    this.clearGlows();
    this.setMasked(true);
    const { S, grid } = this.L;
    const tl = gsap.timeline();
    this.lastImpact = 0;
    const hadBoard = this.views.some(Boolean);
    if (hadBoard) this.fallOut(tl);
    const fsInReel = (r: number) => cells.slice(r * ROWS, r * ROWS + ROWS).some((c) => c.sym === FS);
    let fsSeen = 0;
    let anticipating = false;
    let colAt = hadBoard ? T(0.17) : 0;
    let fsIndex = 0;
    const waiting: number[] = [];
    let end = 0;
    for (let r = 0; r < COLS; r++) {
      let slow = false;
      if (allowAnticipation && !anticipating && fsSeen >= 2) {
        anticipating = true;
        waiting.push(...range(r, COLS));
        const reels = [...waiting];
        tl.call(() => hooks.onAnticipation?.(reels, true), [], colAt);
      }
      if (anticipating) {
        // the held reel: the chests already down beat while it waits
        const hold = T(0.72);
        for (let b = 0; b < 2; b++)
          tl.call(() => {
            this.heartbeat();
            hooks.onHeartbeat?.();
          }, [], colAt + b * hold * 0.5);
        colAt += hold;
        slow = true;
      }
      const fall = slow ? T(0.5) : T(0.32);
      const rowStag = slow ? T(0.045) : T(0.03);
      for (let row = ROWS - 1; row >= 0; row--) {
        const p = pos(r, row);
        const cell = cells[p];
        const v = this.take(cell);
        this.views[p] = v;
        const c = cellCenter(this.L, r, row);
        v.position.set(c.x, c.y - (grid.h + S * 0.15));
        const d = colAt + (ROWS - 1 - row) * rowStag;
        this.fallTo(tl, v, c.y, d, fall, { floor: row === ROWS - 1, ease: slow ? 'power2.in' : undefined });
        if (cell.sym === SIX || cell.sym === FS || cell.sym === BOMB) {
          const kind = cell.sym === SIX ? 'six' : cell.sym === FS ? 'fs' : 'bomb';
          const idx = kind === 'fs' ? ++fsIndex : 0;
          tl.call(() => hooks.onSpecial?.(v, kind, idx), [], d + fall);
        }
        end = Math.max(end, d + fall);
      }
      const landT = colAt + fall;
      const reel = r;
      tl.call(() => {
        hooks.onColumnLanded?.(reel, reel === COLS - 1);
        if (slow) {
          const i = waiting.indexOf(reel);
          if (i >= 0) waiting.splice(i, 1);
          if (waiting.length) hooks.onAnticipation?.([...waiting], true);
        }
      }, [], landT);
      if (fsInReel(r)) fsSeen++;
      colAt += T(0.075);
    }
    if (anticipating) tl.call(() => hooks.onAnticipation?.([], false), [], end + T(0.05));
    return this.settled(tl);
  }

  /** Every chest on the board beats once (scatter anticipation). */
  heartbeat() {
    for (const v of this.views) if (v?.sym === FS) v.heartbeat(1);
  }

  /* ================================================================ wins */

  /**
   * Winners: a glowing outline traces each cluster; each winner wakes as the trace reaches it (a
   * springy pop up, then its win frames and cheer); everything else dims. Resolves after the hold.
   */
  celebrate(wins: Cluster[]): Promise<void> {
    this.setMasked(false);
    this.clearGlows();
    if (wins.length) this.sfx('clusterTrace');
    const winSet = new Set(wins.flatMap((w) => w.positions));
    const tl = gsap.timeline();
    const trace = T(0.34);
    this.views.forEach((v, p) => {
      if (v && !winSet.has(p)) tl.to(v, { alpha: 0.3, duration: T(0.2), ease: 'power1.out' }, 0);
    });
    this.winOrder.clear();
    for (const cl of wins) {
      const g = new ClusterGlow(this.L, cl.positions, HUE[cl.sym] ?? [0xfff0b0, 0xf4b73a]);
      this.fxLayer.addChild(g);
      this.glows.push(g);
      const prog = { p: 0 };
      let lastSpark = 0;
      tl.to(
        prog,
        {
          p: 1,
          duration: trace,
          ease: 'power1.inOut',
          onUpdate: () => {
            g.draw(prog.p);
            // sparkle trail at the trace head
            if (!quality.low && prog.p - lastSpark > 0.07 && prog.p < 1) {
              lastSpark = prog.p;
              for (const l of g.loops) {
                const h = pointAt(l, prog.p);
                this.fx.glint(h.x, h.y, 0.3);
              }
            }
          },
        },
        0,
      );
      for (const p of cl.positions) {
        const v = this.views[p];
        if (!v) continue;
        const k = g.paramNear(v.x, v.y);
        const prev = this.winOrder.get(p);
        if (prev === undefined || k < prev) this.winOrder.set(p, k);
      }
    }
    for (const [p, k] of this.winOrder) {
      const v = this.views[p];
      if (!v) continue;
      const at = trace * k * 0.9;
      tl.call(() => {
        this.symbols.addChild(v);
        v.startWin();
      }, [], at);
      tl.fromTo(v.scale, { x: 1, y: 1 }, { x: 1.14, y: 1.14, duration: T(0.18), ease: 'back.out(3.2)' }, at);
    }
    // hold: the outline breathes while the winners cheer
    for (const g of this.glows) tl.to(g, { alpha: 0.72, duration: T(0.12), yoyo: true, repeat: 1, ease: 'sine.inOut' }, trace);
    tl.to({}, { duration: T(0.34) }, trace);
    return done(tl);
  }

  private clearGlows() {
    for (const g of this.glows) {
      gsap.killTweensOf(g);
      g.destroy();
    }
    this.glows = [];
  }

  undim(): Promise<void> {
    const tl = gsap.timeline();
    for (const v of this.views)
      if (v) {
        v.stopWin();
        if (v.alpha < 1) tl.to(v, { alpha: 1, duration: T(0.18) }, 0);
        if (Math.abs(v.scale.x - 1) > 0.001 || Math.abs(v.scale.y - 1) > 0.001) tl.to(v.scale, { x: 1, y: 1, duration: T(0.2), ease: 'power2.out' }, 0);
      }
    for (const g of this.glows) tl.to(g, { alpha: 0, duration: T(0.14) }, 0);
    tl.call(() => this.clearGlows(), [], T(0.15));
    return done(tl);
  }

  /** Winning symbols pop in the order the trace lit them: a squash, a swell, a cartoon poof. */
  pop(positions: number[]): Promise<void> {
    const tl = gsap.timeline();
    const order = [...positions].sort((a, b) => (this.winOrder.get(a) ?? 0) - (this.winOrder.get(b) ?? 0));
    const span = T(Math.min(0.16, 0.02 * order.length));
    order.forEach((p, i) => {
      const v = this.views[p];
      if (!v) return;
      const d = order.length > 1 ? (i / (order.length - 1)) * span : 0;
      tl.to(v.scale, { x: 1.3, y: 0.76, duration: T(0.06), ease: 'power2.in' }, d);
      tl.to(v.scale, { x: 1.28, y: 1.34, duration: T(0.07), ease: 'power2.out' }, d + T(0.06));
      tl.to(v, { alpha: 0, duration: T(0.06), ease: 'power1.in' }, d + T(0.08));
      tl.call(() => this.fx.poof(v.x, v.y), [], d + T(0.07));
      tl.call(() => {
        this.release(v);
        if (this.views[p] === v) this.views[p] = null;
      }, [], d + T(0.15));
    });
    const glows = this.glows;
    this.glows = [];
    for (const g of glows) {
      gsap
        .timeline({ onComplete: () => g.destroy() })
        .to(g, { alpha: 1, duration: T(0.04) })
        .to(g, { alpha: 0, duration: T(0.18), ease: 'power1.in' }, T(0.05) + span * 0.5);
    }
    return done(tl);
  }

  /* ================================================================ powder kegs */

  /** Cold kegs in a winning cluster catch: a squash as the spark runs up the fuse, then a white-hot flare. */
  ignite(ids: number[]): Promise<void> {
    const tl = gsap.timeline();
    ids.forEach((id, i) => {
      const v = this.viewById(id);
      if (!v) return;
      this.igniteInto(tl, v, i * T(0.07));
    });
    tl.to({}, { duration: T(0.04) });
    return done(tl);
  }

  private igniteInto(tl: gsap.core.Timeline, v: SymbolView, d: number) {
    const S = this.L.S;
    tl.to(v.scale, { x: 1.14, y: 0.86, duration: T(0.08), ease: 'power2.out' }, d);
    tl.call(() => {
      const tip = v.fuseTip();
      this.fx.sparks(v.x + tip.x * v.scale.x, v.y + tip.y * v.scale.y, 6, 0.6, -Math.PI / 2, 1.8);
    }, [], d + T(0.03));
    tl.add(v.flareTl(T(0.06), T(0.26), 0xfff0c8, () => v.ignite()), d + T(0.05));
    tl.to(v.scale, { x: 0.9, y: 1.22, duration: T(0.08), ease: 'power2.out' }, d + T(0.1));
    tl.to(v.scale, { x: 1, y: 1, duration: T(0.36), ease: 'elastic.out(1, .45)' }, d + T(0.18));
    tl.call(() => {
      this.fx.burst(v.x, v.y, 14, 'fire', 0.9);
      this.fx.embers(v.x, v.y, 5);
      this.blast.glow(v.x, v.y, S * 1.6, 0xffa040, 0.7, 0.3);
    }, [], d + T(0.11));
  }

  /**
   * Every blast of a step (Powder Kegs and Kaboom Bombs, in blast order). Roots start one after
   * another with overlap; a blast caught by another goes off just after its parent's boom, so a
   * chain ripples. Resolves when the debris has cleared enough for the refill.
   */
  async blasts(list: Explosion[], hooks: BlastHooks = {}): Promise<void> {
    if (!list.length) return;
    this.setMasked(false);
    const index = new Map<number, number>();
    list.forEach((ex, i) => index.set(ex.id, i));
    const parent = new Map<number, number>();
    list.forEach((ex, i) =>
      ex.chain.forEach((id) => {
        const j = index.get(id);
        if (j !== undefined && j > i && !parent.has(j)) parent.set(j, i);
      }),
    );
    const booms: Promise<void>[] = [];
    const settled: Promise<void>[] = [];
    let roots = 0;
    for (let i = 0; i < list.length; i++) {
      const ex = list[i];
      const pi = parent.get(i);
      const start = pi === undefined ? wait(T(0.3) * roots++) : booms[pi].then(() => wait(T(0.06)));
      const { boom, clear } = this.blastOne(ex, i, start, pi !== undefined, hooks);
      booms.push(boom);
      settled.push(clear);
    }
    await Promise.all(settled);
  }

  /**
   * One blast. Its views leave the board at once (a later blast never grabs them twice) but stay on
   * screen until the boom. Returns when it booms and when its debris has cleared.
   */
  private blastOne(ex: Explosion, i: number, start: Promise<void>, chained: boolean, hooks: BlastHooks): { boom: Promise<void>; clear: Promise<void> } {
    const own = this.viewById(ex.id);
    const debris: SymbolView[] = [];
    for (const p of ex.cleared) {
      const cv = this.views[p];
      if (!cv) continue;
      this.views[p] = null;
      if (cv !== own) debris.push(cv);
    }
    if (own) {
      const at = this.views.indexOf(own);
      if (at >= 0) this.views[at] = null;
    }
    let boomRes!: () => void;
    const boom = new Promise<void>((r) => (boomRes = r));
    const clear = start.then(async () => {
      const bomb = ex.bomb;
      const S = this.L.S;
      const c = own ? { x: own.x, y: own.y } : cellCenter(this.L, Math.floor(ex.pos / ROWS), ex.pos % ROWS);
      const pre = bomb ? T(chained ? 0.2 : 0.5) : T(chained ? 0.13 : 0.34);
      let area: (() => void) | null = null;
      if (bomb) area = this.blast.area(blastArea(ex.pos, bomb.radius), pre / Math.max(0.01, T(1)));
      if (own) {
        this.symbols.addChild(own);
        await this.windUp(own, pre, !!bomb, chained);
      } else await wait(pre);
      // --- boom
      area?.();
      if (own) this.release(own);
      if (bomb) this.blast.bomb(c.x, c.y, bomb.radius);
      else this.blast.keg(c.x, c.y);
      hooks.onBoom?.(ex, i);
      boomRes();
      this.fling(debris, c, S, bomb ? 1.3 : 1);
      // cold kegs caught in the blast catch
      const igniteTl = gsap.timeline();
      ex.ignited.forEach((id, k) => {
        const iv = this.viewById(id);
        if (iv) this.igniteInto(igniteTl, iv, T(0.06) + k * T(0.05));
      });
      // bombs / kegs still standing near it get knocked (a hop), so the blast visibly reaches them
      this.knock(c, S * (bomb ? (bomb.radius === 2 ? 3.2 : 2.2) : 2), ex);
      await wait(T(bomb ? 0.4 : 0.3));
    });
    return { boom, clear };
  }

  /**
   * Anticipation before a blast: tremble building up, swelling in beats, fuse sparks spitting,
   * the body heating towards white. Chained blasts (caught by a boom) get a short, hard version.
   */
  private windUp(v: SymbolView, dur: number, bomb: boolean, chained: boolean): Promise<void> {
    const tl = gsap.timeline();
    const S = this.L.S;
    const beats = chained ? 1 : bomb ? 4 : 2;
    const peak = bomb ? 1.34 : 1.3;
    tl.to(v, { heat: 1, duration: dur, ease: 'power1.in' }, 0);
    for (let b = 0; b < beats; b++) {
      const t0 = (dur / beats) * b;
      const k = 1 + ((peak - 1) * (b + 1)) / beats;
      tl.to(v.scale, { x: k * 1.04, y: k * 0.96, duration: (dur / beats) * 0.55, ease: 'power2.out' }, t0);
      tl.to(v.scale, { x: k * 0.97, y: k * 1.03, duration: (dur / beats) * 0.45, ease: 'sine.inOut' }, t0 + (dur / beats) * 0.55);
    }
    tl.to(v.body, { pixi: { tint: bomb ? 0xffc0a0 : 0xfff0c0 }, duration: dur, ease: 'power2.in' }, 0);
    tl.to(v.aura, { alpha: 1, duration: dur * 0.8 }, 0);
    const spits = chained ? 1 : bomb ? 5 : 3;
    for (let s = 0; s < spits; s++) {
      tl.call(() => {
        const tip = v.fuseTip();
        this.fx.sparks(v.x + tip.x * v.scale.x, v.y + tip.y * v.scale.y, bomb ? 5 : 4, 0.7, -Math.PI / 2 + 0.3, 2);
      }, [], (dur / spits) * s);
    }
    if (bomb) tl.call(() => this.blast.glow(v.x, v.y, S * 2.4, 0xff4a1a, 0.6, dur * 0.8, 1.4), [], 0);
    return done(tl);
  }

  /** Cleared symbols fly out of a blast: away from the centre, tumbling, shrinking into puffs. */
  private fling(views: SymbolView[], c: { x: number; y: number }, S: number, power: number) {
    for (const cv of views) {
      const dx = cv.x - c.x || (Math.random() - 0.5) * 0.1;
      const dy = cv.y - c.y || -1;
      const len = Math.hypot(dx, dy) || 1;
      const dist = S * (1.3 + Math.random() * 0.8) * power;
      const dur = T(0.46);
      const tl = gsap.timeline({ onComplete: () => this.release(cv) });
      this.symbols.addChild(cv);
      tl.to(cv, { x: cv.x + (dx / len) * dist, duration: dur, ease: 'power2.out' }, 0);
      tl.to(cv, { y: cv.y + (dy / len) * dist - S * 0.45, duration: dur * 0.5, ease: 'power2.out' }, 0);
      tl.to(cv, { y: cv.y + (dy / len) * dist + S * 0.1, duration: dur * 0.5, ease: 'power1.in' }, dur * 0.5);
      tl.to(cv, { rotation: (Math.random() - 0.5) * 5, duration: dur, ease: 'power1.out' }, 0);
      tl.to(cv.scale, { x: 0.35, y: 0.35, duration: dur, ease: 'power1.in' }, 0);
      tl.to(cv, { alpha: 0, duration: dur * 0.4, ease: 'power1.in' }, dur * 0.6);
      tl.call(() => this.fx.poof(cv.x, cv.y), [], dur * 0.75);
    }
  }

  /** Survivors inside a blast radius get jolted (kegs, chests, bombs stay put but feel it). */
  private knock(c: { x: number; y: number }, r: number, ex: Explosion) {
    const S = this.L.S;
    this.views.forEach((v, p) => {
      if (!v || v.cell.id === ex.id) return;
      // survivors rest on their cells; a second knock never drifts them
      const home = cellCenter(this.L, Math.floor(p / ROWS), p % ROWS);
      const d = Math.hypot(home.x - c.x, home.y - c.y);
      if (d > r || d < 1) return;
      const k = 1 - d / r;
      const ang = Math.atan2(home.y - c.y, home.x - c.x);
      const x0 = home.x;
      const y0 = home.y;
      gsap.killTweensOf(v, 'x,y');
      gsap
        .timeline()
        .to(v, { x: x0 + Math.cos(ang) * S * 0.09 * k, y: y0 + Math.sin(ang) * S * 0.09 * k, duration: T(0.06), ease: 'power2.out' })
        .to(v, { x: x0, y: y0, duration: T(0.3), ease: 'elastic.out(1, .4)' });
    });
  }

  /* ================================================================ cascade */

  /** Survivors fall into the gaps and new symbols drop in from above, with gravity, stagger and overshoot. */
  cascade(step: Pick<Step, 'moves' | 'added'>, hooks: DropHooks = {}): Promise<void> {
    this.setMasked(true);
    const { S } = this.L;
    const byId = new Map<number, SymbolView>();
    for (const v of this.views) if (v) byId.set(v.cell.id, v);
    const next: (SymbolView | null)[] = [...this.views];
    const tl = gsap.timeline();
    this.lastImpact = 0;
    const fallDur = (rows: number) => T(0.16 + 0.085 * Math.sqrt(Math.max(0.3, rows)));
    for (const m of step.moves) {
      const v = byId.get(m.id);
      if (!v) continue;
      // the fall owns the view from here (an undim, a win pose or a blast knock may still be easing it)
      gsap.killTweensOf(v.scale);
      gsap.killTweensOf(v, 'x,y');
      if (next[m.from] === v) next[m.from] = null;
      next[m.to] = v;
      const c = cellCenter(this.L, Math.floor(m.to / ROWS), m.to % ROWS);
      v.x = c.x;
      const rows = (m.to % ROWS) - (m.from % ROWS);
      const r = Math.floor(m.to / ROWS);
      const d = r * T(0.025) + (ROWS - 1 - (m.to % ROWS)) * T(0.018);
      this.fallTo(tl, v, c.y, d, fallDur(rows), { floor: m.to % ROWS === ROWS - 1 });
    }
    const addsByReel = new Map<number, typeof step.added>();
    for (const a of step.added) {
      const r = Math.floor(a.to / ROWS);
      if (!addsByReel.has(r)) addsByReel.set(r, []);
      addsByReel.get(r)!.push(a);
    }
    for (const [r, adds] of addsByReel) {
      adds.sort((a, b) => (b.to % ROWS) - (a.to % ROWS));
      let land = 0;
      adds.forEach((a, i) => {
        const v = this.take(a.cell);
        next[a.to] = v;
        const c = cellCenter(this.L, r, a.to % ROWS);
        const startY = this.L.grid.y + (a.spawnRow + 0.5) * S - S * 0.3;
        v.position.set(c.x, startY);
        const dist = (c.y - startY) / S;
        const dur = fallDur(dist);
        const d = T(0.07) + r * T(0.03) + i * T(0.035);
        this.fallTo(tl, v, c.y, d, dur, { floor: a.to % ROWS === ROWS - 1 });
        if (a.cell.sym === SIX) tl.call(() => hooks.onSpecial?.(v, 'six', 0), [], d + dur);
        land = Math.max(land, d + dur);
      });
      tl.call(() => hooks.onColumnLanded?.(r, false), [], land);
    }
    this.views = next;
    return this.settled(tl);
  }

  /* ================================================================ wheel kegs */

  /**
   * Wheel kegs. Keg drop: each target symbol shrinks away under a growing shadow while a keg drops in
   * from above the hold and lands hard. Broadside: a cannon flash runs along the row and kegs slam
   * into each cell.
   */
  placeWilds(placed: { cell: Cell; pos: number; replacedId: number }[], style: 'drop' | 'sweep', onLand?: () => void): Promise<void> {
    const S = this.L.S;
    const tl = gsap.timeline();
    const order = style === 'sweep' ? [...placed].sort((a, b) => a.pos - b.pos) : placed;
    if (style === 'drop') this.setMasked(true);
    else this.setMasked(false);
    order.forEach((pl, i) => {
      const old = this.views[pl.pos];
      const c = cellCenter(this.L, Math.floor(pl.pos / ROWS), pl.pos % ROWS);
      const d = i * T(style === 'sweep' ? 0.07 : 0.18);
      if (style === 'drop') {
        // the shadow of the falling keg grows on the cell
        const sh = new Sprite(softDotTexture());
        sh.anchor.set(0.5);
        sh.tint = 0x000000;
        sh.position.set(c.x, c.y + S * 0.32);
        sh.width = S * 0.4;
        sh.height = S * 0.14;
        sh.alpha = 0;
        this.fxLayer.addChild(sh);
        tl.to(sh, { alpha: 0.4, width: S * 1.05, height: S * 0.34, duration: T(0.36), ease: 'power1.in' }, d);
        tl.to(sh, { alpha: 0, duration: T(0.12), onComplete: () => sh.destroy() }, d + T(0.38));
        if (old) {
          tl.to(old.scale, { x: 1.12, y: 0.9, duration: T(0.08), ease: 'power2.out' }, d + T(0.12));
          tl.to(old.scale, { x: 0, y: 0, duration: T(0.14), ease: 'back.in(2)' }, d + T(0.2));
          tl.call(() => {
            this.fx.poof(c.x, c.y);
            this.release(old);
          }, [], d + T(0.34));
        }
        tl.call(() => {
          const nv = this.take(pl.cell);
          this.views[pl.pos] = nv;
          nv.position.set(c.x, this.L.grid.y - S * 0.7);
          const kt = gsap.timeline();
          this.fallTo(kt, nv, c.y, 0, T(0.28), { heavy: true, floor: true });
          kt.call(() => {
            this.fx.embers(c.x, c.y, 4);
            onLand?.();
          }, [], T(0.28));
        }, [], d + T(0.1));
      } else {
        tl.call(() => {
          this.blast.glow(c.x, c.y, S * 2, 0xffd08a, 0.9, 0.3);
          this.fx.sparks(c.x, c.y, 8, 1, 0, Math.PI * 0.6);
          this.fx.smoke(c.x, c.y, 2, 0.6, 0xa89c90);
          if (old) {
            this.fling([old], { x: c.x - S * 0.6, y: c.y }, S, 0.6);
            if (this.views[pl.pos] === old) this.views[pl.pos] = null;
          }
          const nv = this.take(pl.cell);
          this.views[pl.pos] = nv;
          nv.position.set(c.x, c.y);
          nv.scale.set(0.2);
          gsap
            .timeline()
            .to(nv.scale, { x: 1.28, y: 1.18, duration: T(0.12), ease: 'power3.out' })
            .to(nv.scale, { x: 1, y: 1, duration: T(0.34), ease: 'elastic.out(1, .5)' });
          this.fx.dust(c.x, c.y + S * 0.42, true);
          onLand?.();
        }, [], d);
      }
    });
    // done once the last keg has landed and bounced (drop: it lands 0.38 after its start)
    const lastD = (order.length - 1) * T(style === 'sweep' ? 0.07 : 0.18);
    tl.to({}, { duration: T(0.01) }, lastD + T(style === 'drop' ? 0.38 + 0.2 : 0.3));
    return done(tl);
  }

  /* ================================================================ Kaboom Bomb */

  /** A bomb view by id. */
  bombView(id: number): SymbolView | undefined {
    return this.views.find((v) => v?.cell.id === id && v.sym === BOMB) ?? undefined;
  }

  /** Bombs swell after keg blasts: +N badge flips, a flare, sparks spraying off the fuse. */
  growBombs(growth: BombGrowth[]): Promise<void> {
    return Promise.all(growth.map((g, i) => wait(i * T(0.06)).then(() => this.growBomb(g.id, g.to)))).then(() => undefined);
  }

  /** One bomb swells to `to` (a keg blast just hit it): sparks off the fuse, a glow, the badge flips. */
  growBomb(id: number, to: number): Promise<void> {
    const v = this.bombView(id);
    if (!v || (v.cell.size ?? 1) >= to) return Promise.resolve();
    this.sfx('bombGrow', { index: Math.min(5, Math.max(1, to)) });
    const tip = v.fuseTip();
    this.fx.sparks(v.x + tip.x, v.y + tip.y, 10, 0.9);
    this.blast.glow(v.x, v.y, this.L.S * 2.2, 0xffa040, 0.8, 0.4);
    return v.growBomb(to);
  }

  /**
   * The end-of-sequence build-up: every bomb left on the board heats up, trembles harder and its
   * glow swells over `dur` (the blasts that follow take it from there).
   */
  heatBombs(dur: number) {
    for (const v of this.views) {
      if (!v || v.sym !== BOMB) continue;
      gsap.to(v, { heat: 0.75, duration: dur, ease: 'power1.in' });
      gsap.to(v.aura, { alpha: 0.9, duration: dur, ease: 'power1.in' });
      gsap.to(v.pulse, { k: 1.12, duration: dur, ease: 'power1.in' });
    }
  }

  /** Fuse ticks after a step's blasts: every surviving bomb's counter flips down (compare with `bombs`). */
  tickFuses(bombs: BombState[]): Promise<void> {
    const jobs: Promise<void>[] = [];
    let i = 0;
    for (const b of bombs) {
      const v = this.bombView(b.id);
      if (!v || (v.cell.fuse ?? 0) <= b.fuse) continue;
      const k = i++;
      jobs.push(
        wait(k * T(0.05)).then(() => {
          this.sfx('bombTick');
          const tip = v.fuseTip();
          this.fx.sparks(v.x + tip.x, v.y + tip.y, b.fuse <= 0 ? 12 : 6, b.fuse <= 0 ? 1.1 : 0.7, -Math.PI / 2, 2.2);
          this.blast.glow(v.x + tip.x, v.y + tip.y, this.L.S * (b.fuse <= 0 ? 1.4 : 0.8), 0xffb040, 0.9, 0.3);
          return v.tickFuse(b.fuse);
        }),
      );
    }
    return Promise.all(jobs).then(() => undefined);
  }

  /**
   * A thrown bomb lands on `at`. The flight starts where the bomb left the captain's hand, at the
   * size, speed and direction it had there (track C's `throwBomb()` release), so the bomb in his
   * hand and the flying bomb read as one object. Air drag bleeds that speed off and gravity drops
   * it onto its cell: both are solved so the arc lands exactly on the cell at the end of the
   * flight (a plain lob from the release point when the hand's motion can't get there). It spins
   * about its own centre, a whole number of turns so it lands upright, trails smoke and fuse
   * sparks, lands with a squash, a clang flash and heavy dust, and its badges pop in. A wheel bomb
   * (`replacedId` >= 0) knocks the symbol it replaces out of the cell on impact.
   */
  throwBomb(cell: Cell, at: number, from: { x: number; y: number; vx?: number; vy?: number; size?: number }, replacedId: number, layer: Container, onLand?: () => void): Promise<void> {
    const S = this.L.S;
    const c = cellCenter(this.L, Math.floor(at / ROWS), at % ROWS);
    const v = this.take(cell);
    v.showBadges(false);
    layer.addChild(v);
    // the flight is laid out around the ball's centre (it is off the art box centre), so it spins
    // about itself and starts exactly where the bomb in his hand was
    const ball = v.ballCenter();
    v.pivot.set(ball.x, ball.y);
    const p0 = layer.toLocal(from);
    const p1g = this.toGlobal({ x: c.x + ball.x, y: c.y + ball.y });
    const p1 = layer.toLocal(p1g);
    const s0 = from.size ? Math.max(0.3, Math.min(1.2, from.size / v.ballDiameter())) : 0.55;
    v.position.set(p0.x, p0.y);
    v.scale.set(s0);
    const path = flightPath(p0, p1, from.vx ?? 0, from.vy ?? 0, T(0.55), S);
    const dur = path.dur;
    const turns = Math.max(1, Math.round(Math.abs(p1.x - p0.x) / (S * 3.2))) * (p1.x >= p0.x ? 1 : -1);
    const st = { t: 0 };
    let trailAt = 0;
    return new Promise((res) => {
      const tl = gsap.timeline();
      // explicit positions: the flight starts now, whatever else is on this timeline
      tl.call(() => res(), [], dur + T(0.16));
      tl.to(st, {
        t: dur,
        duration: dur,
        ease: 'none',
        onUpdate: () => {
          const q = path.at(st.t);
          v.position.set(q.x, q.y);
          v.rotation = Math.PI * 2 * turns * q.along;
          v.scale.set(s0 + (1 - s0) * Math.min(1, st.t / (dur * 0.7)));
          if (st.t / dur - trailAt > 0.05) {
            trailAt = st.t / dur;
            const gp = layer.toGlobal(v.position);
            const fp = this.fx.parent ? this.fx.toLocal(gp) : gp;
            this.fx.trail(fp.x, fp.y, 0.16);
            const tip = v.fuseTip();
            const cs = Math.cos(v.rotation);
            const sn = Math.sin(v.rotation);
            const tx = (tip.x - ball.x) * v.scale.x;
            const ty = (tip.y - ball.y) * v.scale.y;
            this.fx.sparks(fp.x + tx * cs - ty * sn, fp.y + tx * sn + ty * cs, 1, 0.4);
          }
        },
      }, 0);
      tl.call(() => {
        v.rotation = 0;
        v.pivot.set(0, 0);
        v.position.set(c.x, c.y);
        this.symbols.addChild(v);
        const old = replacedId >= 0 ? this.viewById(replacedId) : undefined;
        if (old) {
          const i = this.views.indexOf(old);
          if (i >= 0) this.views[i] = null;
          this.fling([old], { x: c.x, y: c.y - S * 0.6 }, S, 0.7);
        }
        this.views[at] = v;
        v.showBadges(true, true);
        this.fx.dust(c.x, c.y + S * 0.42, true);
        this.fx.sparks(c.x, c.y + S * 0.3, 10, 0.9, -Math.PI / 2, Math.PI * 0.9);
        this.blast.glow(c.x, c.y, S * 1.8, 0xfff0c8, 0.7, 0.25);
        onLand?.();
      }, [], dur);
      tl.to(v.scale, { x: 1.3, y: 0.7, duration: T(0.06), ease: 'power2.out' }, dur);
      tl.to(v.scale, { x: 0.9, y: 1.14, duration: T(0.09), ease: 'power2.out' }, dur + T(0.06));
      tl.to(v.scale, { x: 1, y: 1, duration: T(0.3), ease: 'elastic.out(1, .45)' }, dur + T(0.15));
    });
  }

  /* ================================================================ misc */

  /** Dim everything except the given positions (wheel focus). */
  focus(keep: number[] | null) {
    const keepSet = new Set(keep ?? []);
    // the badges sit above the dimmer and the wheel: they bow out while the board is dimmed
    gsap.to(this.badgeRoot, { alpha: keep === null ? 1 : 0, duration: T(0.2) });
    this.views.forEach((v, p) => {
      if (!v) return;
      gsap.to(v, { alpha: keep === null || keepSet.has(p) ? 1 : 0.3, duration: T(0.2) });
    });
  }

  sixViews(): { view: SymbolView; pos: number }[] {
    const out: { view: SymbolView; pos: number }[] = [];
    this.views.forEach((v, p) => v && v.sym === SIX && out.push({ view: v, pos: p }));
    return out;
  }

  viewById(id: number): SymbolView | undefined {
    return this.views.find((v) => v?.cell.id === id) ?? undefined;
  }

  /**
   * Idle life. At rest: breathing and sway (eased in, so nothing jumps when the board settles),
   * blinks and the odd double blink, idle acts (track D's idle frames), glints on shiny things.
   * Always: lit kegs tremble and spit embers, bomb fuses fizz.
   */
  update(dtMs: number, busy: boolean) {
    if (!this.L) return;
    const dt = dtMs / 1000;
    this.t += dt;
    const target = busy ? 0 : 1;
    this.calm += (target - this.calm) * Math.min(1, dt * (busy ? 12 : 2.5));
    const low = quality.low || speed.reduced;
    // every view on screen ticks, including ones that already left the board (a keg winding up
    // to blow, debris, a board falling out), so their tremble and frames never freeze
    for (const c of this.symbols.children) if (c instanceof SymbolView) c.tick(dtMs, this.t, this.calm);
    for (const v of this.views) {
      if (!v) continue;
      if (v.sym === SIX && v.cell.lit && Math.random() < dtMs / (low ? 220 : 110)) this.fx.embers(v.x, v.y - this.L.S * 0.25, 1);
      if (v.sym === BOMB && !low && Math.random() < dtMs / ((v.cell.fuse ?? 1) <= 0 ? 70 : 160)) {
        const tip = v.fuseTip();
        this.fx.sparks(v.x + tip.x, v.y + tip.y, 1, 0.35, -Math.PI / 2, 2.4);
      }
    }
    if (busy) return;
    if (this.t > this.blinkAt) {
      this.blinkAt = this.t + 0.45 + Math.random() * 0.9;
      const c = this.views.filter((v) => v && v.sym >= 4 && v.sym <= 8) as SymbolView[];
      if (c.length) c[(Math.random() * c.length) | 0].blink(Math.random() < 0.2);
    }
    if (!low && this.t > this.glintAt) {
      this.glintAt = this.t + 0.5 + Math.random() * 1.1;
      const c = this.views.filter((v) => v && (v.sym <= 3 || v.sym === FS)) as SymbolView[];
      const v = c.length ? c[(Math.random() * c.length) | 0] : null;
      const gp = v?.glintPoint();
      if (v && gp) this.fx.glint(v.x + gp.x, v.y + gp.y, 0.3 + Math.random() * 0.12);
    }
    if (!low && this.t > this.actAt) {
      this.actAt = this.t + 2.5 + Math.random() * 3.5;
      const c = this.views.filter((v) => v && v.sym >= 4 && v.sym <= 8) as SymbolView[];
      for (let n = 0; n < 3 && c.length; n++) {
        const v = c.splice((Math.random() * c.length) | 0, 1)[0];
        if (v.playIdleFrames()) break;
      }
    }
  }
}
