import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { SymbolView, SymbolTextures } from './SymbolView';
import { cellCenter, type Layout, COLS, ROWS } from '../layout';
import { T, done, speed } from '../timing';
import { quality } from '../quality';
import { Sym, type Cell, type WayWin } from '../../math/types';
import type { Particles } from '../fx/Particles';
import { ClusterGlow, HUE, pointAt } from './Outline';

export type SpecialKind = 'fs' | 'coin' | 'loco' | 'switch' | 'wild';

export interface DropHooks {
  onColumnLanded?: (reel: number, isLast: boolean) => void;
  /** A special symbol landed (tickets count up in landing order). */
  onSpecial?: (view: SymbolView, kind: SpecialKind, index: number) => void;
  /** The reels still held for a ticket; called as each one lands, and with ([], false) at the end. */
  onAnticipation?: (reels: number[], on: boolean) => void;
  /** A heartbeat while a reel is held. */
  onHeartbeat?: () => void;
}

/** A one-shot sound request; the presenter decides whether it plays. */
export type Sfx = (id: string, opts?: { index?: number; volume?: number; delay?: number }) => void;

const pos = (reel: number, row: number) => reel * ROWS + row;
const heavy = (sym: number) => sym === Sym.FS || sym === Sym.LOCO || sym === Sym.WILD;
const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const SPECIAL: Partial<Record<number, SpecialKind>> = { [Sym.FS]: 'fs', [Sym.COIN]: 'coin', [Sym.LOCO]: 'loco', [Sym.SWITCH]: 'switch', [Sym.WILD]: 'wild' };

/**
 * The 6x4 board. Owns the SymbolViews and every board motion:
 * - spin: the standing board hops and falls out while the new one drops in behind it, column by
 *   column; HELD cells (sticky Fare Coins, the Golden Locomotive) stay put and glow while the rest
 *   of their column falls past them;
 * - landings: stretch in the fall, squash on impact, a small rebound, dust (heavier for specials);
 *   when two Golden Tickets are down, the remaining reels are held and land heavier;
 * - wins: a glowing outline traces each way win's cells, winners wake and cheer, the rest dims;
 * - idle life: breathing, sway, blinks, glints, idle acts.
 */
export class GridView extends Container {
  views: (SymbolView | null)[] = new Array(COLS * ROWS).fill(null);
  private pool: SymbolView[] = [];
  /** The symbol views (masked to the window while things drop in or fall out). */
  private symbols = new Container();
  /** Outlines, flashes, rings: above the symbols, never masked. */
  fxLayer = new Container();
  private maskG = new Graphics();
  /** Coin values: above the particle layer (the presenter mounts it), following their views. */
  badgeRoot = new Container();
  private badgeLayer = new Container();
  private badgeMask = new Graphics();
  private made: SymbolView[] = [];
  L!: Layout;
  private t = 0;
  private calm = 0;
  private blinkAt = 1.5;
  private glintAt = 1;
  private actAt = 4;
  private glows: ClusterGlow[] = [];
  private lastImpact = 0;
  sfx: Sfx = () => undefined;

  constructor(
    public tex: SymbolTextures,
    private fx: Particles,
  ) {
    super();
    this.addChild(this.symbols, this.fxLayer, this.maskG, this.badgeRoot);
    this.badgeRoot.addChild(this.badgeLayer, this.badgeMask);
    this.badgeRoot.onRender = () => this.syncBadges();
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

  /** Keep every badge box on its view (same transform and alpha). */
  private syncBadges() {
    const root = this.badgeRoot;
    if (root.parent && root.parent !== this) {
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

  release(v: SymbolView) {
    v.killMotion();
    v.removeFromParent();
    v.visible = false;
    if (!this.pool.includes(v)) this.pool.push(v);
  }

  /** Take a view off the board (it is flying somewhere); the caller releases it when done. */
  lift(p: number): SymbolView | null {
    const v = this.views[p];
    this.views[p] = null;
    return v;
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

  /** Release any symbol the grid no longer tracks (nothing orphaned survives past one spin). */
  private sweep() {
    const live = new Set(this.views.filter(Boolean));
    for (const c of [...this.symbols.children]) if (c instanceof SymbolView && !live.has(c)) this.release(c);
  }

  /* ================================================================ landings */

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

  /** "Done" once the last symbol has hit and bounced; the settle carries on under what comes next. */
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

  /**
   * Queue the fall-out of every symbol on the board except the held positions: the board crouches
   * and hops at once, then drops out column by column.
   */
  private fallOut(tl: gsap.core.Timeline, held: Set<number>) {
    const { S, grid } = this.L;
    const hop = T(0.065);
    const fall = T(0.27);
    const dist = grid.h + S * 1.3;
    const keep: (SymbolView | null)[] = new Array(COLS * ROWS).fill(null);
    this.views.forEach((v, p) => {
      if (!v) return;
      if (held.has(p)) {
        keep[p] = v;
        v.stopWin();
        if (v.alpha < 1) tl.to(v, { alpha: 1, duration: T(0.15) }, 0);
        // a held cell gives a little shiver as the board around it drops away
        tl.fromTo(v.scale, { x: 1.06, y: 0.94 }, { x: 1, y: 1, duration: T(0.3), ease: 'back.out(3)' }, 0);
        return;
      }
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
    });
    this.views = keep;
  }

  /**
   * A spin: the standing board falls out (held cells stay) and the new one drops in right behind
   * it, column by column. When two tickets are down and a third can still land, the remaining reels
   * are held: they glow, the tickets beat like hearts, and each held reel falls slower and lands
   * heavier. `held` cells are already on the board and are not dropped again.
   */
  spinIn(cells: Cell[], held: Set<number> = new Set(), hooks: DropHooks = {}, allowAnticipation = true): Promise<void> {
    this.sweep();
    this.clearGlows();
    this.setMasked(true);
    const { S, grid } = this.L;
    const tl = gsap.timeline();
    this.lastImpact = 0;
    // a held cell stays only if the board already shows it (same id); otherwise it drops in with
    // its column like any other (the Golden Locomotive's first arrival, a resumed bonus)
    const keep = new Set([...held].filter((p) => this.views[p] && this.views[p]!.cell.id === cells[p].id));
    const hadBoard = this.views.some(Boolean);
    if (hadBoard) this.fallOut(tl, keep);
    for (const p of keep) this.views[p]!.cell = { ...cells[p] };
    const fsInReel = (r: number) => cells.slice(r * ROWS, r * ROWS + ROWS).some((c) => c.sym === Sym.FS);
    let fsSeen = 0;
    let anticipating = false;
    let colAt = hadBoard ? T(0.17) : 0;
    let fsIndex = 0;
    const waiting: number[] = [];
    let end = 0;
    for (let r = 0; r < COLS; r++) {
      let slow = false;
      if (allowAnticipation && !anticipating && fsSeen >= 2 && r < COLS) {
        anticipating = true;
        waiting.push(...range(r, COLS));
        const reels = [...waiting];
        tl.call(() => hooks.onAnticipation?.(reels, true), [], colAt);
      }
      if (anticipating) {
        const hold = T(0.62);
        for (let b = 0; b < 2; b++)
          tl.call(
            () => {
              this.heartbeat();
              hooks.onHeartbeat?.();
            },
            [],
            colAt + b * hold * 0.5,
          );
        colAt += hold;
        slow = true;
      }
      const fall = slow ? T(0.5) : T(0.32);
      const rowStag = slow ? T(0.045) : T(0.03);
      for (let row = ROWS - 1; row >= 0; row--) {
        const p = pos(r, row);
        if (keep.has(p)) continue;
        const cell = cells[p];
        const v = this.take(cell);
        this.views[p] = v;
        const c = cellCenter(this.L, r, row);
        v.position.set(c.x, c.y - (grid.h + S * 0.15));
        const d = colAt + (ROWS - 1 - row) * rowStag;
        this.fallTo(tl, v, c.y, d, fall, { floor: row === ROWS - 1, ease: slow ? 'power2.in' : undefined });
        const kind = SPECIAL[cell.sym];
        if (kind) {
          const idx = kind === 'fs' ? ++fsIndex : 0;
          tl.call(() => hooks.onSpecial?.(v, kind, idx), [], d + fall);
        }
        end = Math.max(end, d + fall);
      }
      const landT = colAt + fall;
      const reel = r;
      tl.call(
        () => {
          hooks.onColumnLanded?.(reel, reel === COLS - 1);
          if (slow) {
            const i = waiting.indexOf(reel);
            if (i >= 0) waiting.splice(i, 1);
            if (waiting.length) hooks.onAnticipation?.([...waiting], true);
          }
        },
        [],
        landT,
      );
      if (fsInReel(r)) fsSeen++;
      colAt += T(0.075);
    }
    if (anticipating) tl.call(() => hooks.onAnticipation?.([], false), [], end + T(0.05));
    return this.settled(tl);
  }

  /** Every ticket on the board beats once (anticipation). */
  heartbeat() {
    for (const v of this.views) if (v?.sym === Sym.FS) v.heartbeat(1);
  }

  /* ================================================================ wins */

  /**
   * Way wins: a glowing outline traces each win's cells left to right; each winner wakes as the
   * trace reaches it (a springy pop up, then its win frames and cheer); everything else dims.
   */
  celebrate(wins: WayWin[]): Promise<void> {
    this.setMasked(false);
    this.clearGlows();
    if (wins.length) this.sfx('clusterTrace');
    const winSet = new Set(wins.flatMap((w) => w.positions));
    const tl = gsap.timeline();
    const trace = T(0.38);
    this.views.forEach((v, p) => {
      if (v && !winSet.has(p)) tl.to(v, { alpha: 0.3, duration: T(0.2), ease: 'power1.out' }, 0);
    });
    const order = new Map<number, number>();
    for (const w of wins) {
      const g = new ClusterGlow(this.L, w.positions, HUE[w.sym] ?? [0xfff0b0, 0xf4b73a]);
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
      // winners wake left to right with the trace
      for (const p of w.positions) {
        const k = Math.floor(p / ROWS) / Math.max(1, w.reels - 1);
        const prev = order.get(p);
        if (prev === undefined || k < prev) order.set(p, k);
      }
    }
    for (const [p, k] of order) {
      const v = this.views[p];
      if (!v) continue;
      const at = trace * k * 0.9;
      tl.call(
        () => {
          this.symbols.addChild(v);
          v.startWin();
        },
        [],
        at,
      );
      tl.fromTo(v.scale, { x: 1, y: 1 }, { x: 1.14, y: 1.14, duration: T(0.18), ease: 'back.out(3.2)' }, at);
    }
    for (const g of this.glows) tl.to(g, { alpha: 0.72, duration: T(0.12), yoyo: true, repeat: 1, ease: 'sine.inOut' }, trace);
    tl.to({}, { duration: T(0.3) }, trace);
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
    tl.to({}, { duration: T(0.01) });
    return done(tl);
  }

  /* ================================================================ misc */

  /** Dim everything except the given positions (null: undim). */
  focus(keep: number[] | null, dimTo = 0.3) {
    const keepSet = new Set(keep ?? []);
    this.views.forEach((v, p) => {
      if (!v) return;
      gsap.to(v, { alpha: keep === null || keepSet.has(p) ? 1 : dimTo, duration: T(0.2) });
    });
  }

  viewById(id: number): SymbolView | undefined {
    return this.views.find((v) => v?.cell.id === id) ?? undefined;
  }

  /** Re-print every coin value (the bet changed). */
  refreshValues() {
    for (const v of this.views) v?.refreshValue();
  }

  /**
   * Idle life. At rest: breathing and sway (eased in, so nothing jumps when the board settles),
   * blinks and the odd double blink, idle acts, glints on shiny things; held coins and the Golden
   * Locomotive give off the odd spark.
   */
  update(dtMs: number, busy: boolean) {
    if (!this.L) return;
    const dt = dtMs / 1000;
    this.t += dt;
    const target = busy ? 0 : 1;
    this.calm += (target - this.calm) * Math.min(1, dt * (busy ? 12 : 2.5));
    const low = quality.low || speed.reduced;
    for (const c of this.symbols.children) if (c instanceof SymbolView) c.tick(dtMs, this.t, this.calm);
    if (!low) {
      for (const v of this.views) {
        if (!v) continue;
        if (v.sym === Sym.WILD && Math.random() < dtMs / 900) this.fx.sparks(v.x + (Math.random() - 0.5) * this.L.S * 0.6, v.y + (Math.random() - 0.5) * this.L.S * 0.6, 1, 0.3);
        if (v.cell.golden && Math.random() < dtMs / 260) this.fx.glint(v.x + (Math.random() - 0.5) * this.L.S * 0.7, v.y + (Math.random() - 0.5) * this.L.S * 0.6, 0.28);
      }
    }
    if (busy) return;
    if (this.t > this.blinkAt) {
      this.blinkAt = this.t + 0.45 + Math.random() * 0.9;
      const c = this.views.filter((v) => v && v.sym >= Sym.H4 && v.sym <= Sym.TOP) as SymbolView[];
      if (c.length) c[(Math.random() * c.length) | 0].blink(Math.random() < 0.2);
    }
    if (!low && this.t > this.glintAt) {
      this.glintAt = this.t + 0.5 + Math.random() * 1.1;
      const c = this.views.filter((v) => v && (v.sym <= Sym.L4 || v.sym === Sym.FS || v.sym === Sym.COIN)) as SymbolView[];
      const v = c.length ? c[(Math.random() * c.length) | 0] : null;
      const gp = v?.glintPoint();
      if (v && gp) this.fx.glint(v.x + gp.x, v.y + gp.y, 0.3 + Math.random() * 0.12);
    }
    if (!low && this.t > this.actAt) {
      this.actAt = this.t + 2.5 + Math.random() * 3.5;
      const c = this.views.filter((v) => v && v.sym >= Sym.H4 && v.sym <= Sym.TOP) as SymbolView[];
      for (let n = 0; n < 3 && c.length; n++) {
        const v = c.splice((Math.random() * c.length) | 0, 1)[0];
        if (v.playIdleFrames()) break;
      }
    }
  }
}
