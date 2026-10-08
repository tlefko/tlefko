import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { SymbolView, SymbolTextures } from '../grid/SymbolView';
import { stationCenter, type Layout } from '../layout';
import { T, done, speed } from '../timing';
import { quality } from '../quality';
import { svgTexture, softDotTexture } from '../textures';
import { mapPanelSvg, lineGlowSvg, LINE_COLORS, type MapGeom } from '../../art/map';
import { ART, artKey } from '../../art/symbols';
import { LINES, STATIONS, STATION_COUNT } from '../../math/network';
import { Sym, type Cell, type RouteWin } from '../../math/types';
import type { Particles } from '../fx/Particles';

export type SpecialKind = 'fs' | 'coin' | 'loco' | 'signal' | 'security' | 'wild';

export interface FlipHooks {
  /** A station's board starts rattling (sound). */
  onRattle?: (p: number) => void;
  /** A station's board lands on its final symbol. */
  onSettle?: (p: number, isLast: boolean) => void;
  /** A special symbol landed (tickets count up in landing order). */
  onSpecial?: (view: SymbolView, kind: SpecialKind, index: number) => void;
  /** Ticket anticipation: the stations still rattling while a third ticket can land; ([], false) at the end. */
  onAnticipation?: (stations: number[], on: boolean) => void;
  onHeartbeat?: () => void;
}

/** A one-shot sound request; the presenter decides whether it plays. */
export type Sfx = (id: string, opts?: { index?: number; volume?: number; delay?: number; pan?: number }) => void;

const SPECIAL: Partial<Record<number, SpecialKind>> = {
  [Sym.FS]: 'fs',
  [Sym.COIN]: 'coin',
  [Sym.LOCO]: 'loco',
  [Sym.SIGNAL]: 'signal',
  [Sym.SECURITY]: 'security',
  [Sym.WILD]: 'wild',
};
const hex = (c: string) => parseInt(c.slice(1), 16);
/** Symbol size inside a station's split-flap face (fraction of S). */
export const SYM_K = 0.9;
/** Art keys the flap rattles through. */
const RATTLE_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ART.COIN_BRONZE, ART.COIN_SILVER];

interface Pulse {
  s: Sprite;
  line: number;
  t: number;
  dur: number;
  dir: 1 | -1;
}

/**
 * The live map. Owns the panel art, the line glows, the station symbols and every board motion:
 * - spin: a departure-board wave sweeps west to east: each station's split-flap rattles through a
 *   few symbols (fold down, swap, unfold) and lands on its new symbol with a heavier final flap,
 *   overshoot and settle. Held stations (sticky coins, the Golden Locomotive) stay and glow;
 * - ticket anticipation: once two tickets are down, the stations still to land keep rattling and
 *   land one map column at a time, slower, with heartbeats;
 * - route wins: a neon trace runs along the line through the winning stations, which pop and cheer
 *   as it reaches them; everything else dims;
 * - idle life: current pulses along the lines, breathing line glows, blinks and glints.
 */
export class MapView extends Container {
  views: (SymbolView | null)[] = new Array(STATION_COUNT).fill(null);
  private pool: SymbolView[] = [];
  private made: SymbolView[] = [];
  private panel = new Sprite();
  private glowLayer = new Container();
  private glows: Sprite[] = [];
  private glowLevel: number[] = LINES.map(() => 0);
  private pulseLayer = new Container();
  private pulses: Pulse[] = [];
  routeLayer = new Container();
  private symbols = new Container();
  private flaps = new Container();
  /** Rings, flashes: above the symbols. */
  fxLayer = new Container();
  /** Coin values: above the particle layer (the presenter mounts it), following their views. */
  badgeRoot = new Container();
  private badgeLayer = new Container();
  private traces: Graphics[] = [];
  L!: Layout;
  private t = 0;
  private calm = 0;
  private blinkAt = 1.5;
  private glintAt = 1;
  private actAt = 4;
  private pulseAt = 0.5;
  private stamp = 0;
  sfx: Sfx = () => undefined;

  constructor(
    public tex: SymbolTextures,
    private fx: Particles,
  ) {
    super();
    this.glowLayer.blendMode = 'add';
    this.pulseLayer.blendMode = 'add';
    this.addChild(this.panel, this.glowLayer, this.pulseLayer, this.routeLayer, this.symbols, this.flaps, this.fxLayer, this.badgeRoot);
    this.badgeRoot.addChild(this.badgeLayer);
    this.badgeRoot.onRender = () => this.syncBadges();
    this.eventMode = 'none';
  }

  /** Panel geometry in panel px (the frame's top-left is the origin). */
  geom(L: Layout): MapGeom {
    return { w: L.frame.w, h: L.frame.h, t: L.frameT, S: L.S, unit: L.unit };
  }

  async layout(L: Layout, res: number) {
    const stamp = ++this.stamp;
    const g = this.geom(L);
    const [panel, ...glows] = await Promise.all([
      svgTexture(`map-panel-${Math.round(g.w)}x${Math.round(g.h)}`, mapPanelSvg(g), g.w * res, g.h * res),
      // the glows are blurred: half resolution is plenty
      ...LINES.map((_, li) => svgTexture(`map-glow${li}-${Math.round(g.w)}`, lineGlowSvg(g, li), (g.w * res) / 2, (g.h * res) / 2)),
    ]);
    if (stamp !== this.stamp) return;
    this.L = L;
    this.panel.texture = panel;
    this.panel.position.set(L.frame.x, L.frame.y);
    this.panel.width = L.frame.w;
    this.panel.height = L.frame.h;
    this.glowLayer.removeChildren();
    this.glows = glows.map((tx, li) => {
      const s = new Sprite(tx);
      s.position.set(L.frame.x, L.frame.y);
      s.width = L.frame.w;
      s.height = L.frame.h;
      s.alpha = 0.12 + this.glowLevel[li] * 0.5;
      this.glowLayer.addChild(s);
      return s;
    });
    for (let p = 0; p < this.views.length; p++) {
      const v = this.views[p];
      if (!v) continue;
      const c = stationCenter(L, p);
      v.position.set(c.x, c.y);
      v.setCell(v.cell, L.S * SYM_K);
    }
    for (const pl of this.pulses) pl.s.destroy();
    this.pulses = [];
    this.clearTraces();
  }

  /** Keep every badge box on its view (same transform and alpha). */
  private syncBadges() {
    const root = this.badgeRoot;
    if (root.parent && root.parent !== this) {
      root.position.copyFrom(this.position);
      root.scale.copyFrom(this.scale);
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
    v.setCell(cell, this.L.S * SYM_K);
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

  /** Instantly show a board (first load / resume / back from a bonus). */
  setGrid(cells: Cell[]) {
    for (const v of this.views) if (v) this.release(v);
    this.views = cells.map((cell, p) => {
      const v = this.take(cell);
      const c = stationCenter(this.L, p);
      v.position.set(c.x, c.y);
      return v;
    });
  }

  /** Release any symbol the board no longer tracks. */
  private sweep() {
    const live = new Set(this.views.filter(Boolean));
    for (const c of [...this.symbols.children]) if (c instanceof SymbolView && !live.has(c)) this.release(c);
  }

  stationPoint(p: number) {
    return stationCenter(this.L, p);
  }

  /* ================================================================ the flip wave */

  /** A rattle frame: a random symbol's idle texture. */
  private rattleTexture(): Texture {
    const k = RATTLE_KEYS[(Math.random() * RATTLE_KEYS.length) | 0];
    return this.tex.sets.get(k)?.idle ?? Texture.EMPTY;
  }

  /**
   * A spin: the departure-board wave. Every station that is not held rattles (2-4 quick flaps through
   * random symbols, each folding down to a sliver and opening again, the lower half darkening as it
   * folds) and lands on its new symbol with a heavier flap: it overshoots tall, squashes, settles.
   * The wave runs west to east (a little north to south), so the board reads like a departures
   * board updating. Once two tickets are down and a third can still land, the stations left keep
   * rattling and land column by column, slower, with heartbeats.
   */
  spinIn(cells: Cell[], held: Set<number> = new Set(), hooks: FlipHooks = {}, allowAnticipation = true): Promise<void> {
    this.sweep();
    this.clearTraces();
    const S = this.L.S;
    const symS = S * SYM_K;
    const tl = gsap.timeline();
    const keep = new Set([...held].filter((p) => this.views[p] && this.views[p]!.cell.id === cells[p].id));
    // the held ones shiver and glow as the board flips around them
    for (const p of keep) {
      const v = this.views[p]!;
      v.stopWin();
      v.cell = { ...cells[p] };
      if (v.alpha < 1) tl.to(v, { alpha: 1, duration: T(0.15) }, 0);
      tl.fromTo(v.scale, { x: 1.08, y: 1.08 }, { x: 1, y: 1, duration: T(0.35), ease: 'back.out(3)' }, 0);
    }
    // order: by map x, then y (the wave), with a touch of jitter
    const order = cells.map((_, p) => p).filter((p) => !keep.has(p));
    const base = (p: number) => STATIONS[p].x * 0.085 + STATIONS[p].y * 0.03;
    order.sort((a, b) => base(a) - base(b));
    const ticketOK = (p: number) => STATIONS[p].kind !== 'terminal';
    let fsSeen = 0;
    let fsIndex = 0;
    let antic = false;
    let anticCol = -1;
    let extra = 0;
    const waiting: number[] = [];
    let last = 0;
    const lands: { p: number; at: number }[] = [];
    for (const p of order) {
      const st = STATIONS[p];
      let at = T(0.3 + base(p) + Math.random() * 0.03);
      if (allowAnticipation && !antic && fsSeen >= 2 && ticketOK(p)) {
        antic = true;
        anticCol = st.x;
        const rest = order.slice(order.indexOf(p)).filter(ticketOK);
        waiting.push(...rest);
        const t0 = lands.length ? lands[lands.length - 1].at : at;
        tl.call(() => hooks.onAnticipation?.([...waiting], true), [], t0 + T(0.05));
      }
      if (antic) {
        // each new map column waits a heartbeat longer
        if (st.x !== anticCol) {
          anticCol = st.x;
          extra += T(0.55);
        }
        at += extra + T(0.5);
      }
      lands.push({ p, at });
      if (cells[p].sym === Sym.FS) fsSeen++;
      last = Math.max(last, at);
    }
    if (antic) {
      // heartbeats while the remaining stations rattle
      const t0 = lands.find((l) => waiting.includes(l.p))?.at ?? 0;
      for (let t = t0 - T(0.5); t < last; t += T(0.55))
        tl.call(
          () => {
            this.heartbeat();
            hooks.onHeartbeat?.();
          },
          [],
          Math.max(0, t),
        );
    }
    for (const { p, at } of lands) this.flipStation(tl, p, cells[p], at, symS, hooks, p === lands[lands.length - 1].p, () => {
      if (cells[p].sym === Sym.FS) fsIndex++;
      return fsIndex;
    }, waiting, antic);
    if (antic) tl.call(() => hooks.onAnticipation?.([], false), [], last + T(0.2));
    tl.to({}, { duration: T(0.12) }, last + T(0.14));
    return done(tl);
  }

  /** One station: the rattle, then the final flap onto `cell`, landing at `at`. */
  private flipStation(
    tl: gsap.core.Timeline,
    p: number,
    cell: Cell,
    at: number,
    symS: number,
    hooks: FlipHooks,
    isLast: boolean,
    nextFs: () => number,
    waiting: number[],
    antic: boolean,
  ) {
    const c = stationCenter(this.L, p);
    const old = this.views[p];
    const flap = new Sprite(old ? old.body.texture : this.rattleTexture());
    flap.anchor.set(0.5);
    flap.position.set(c.x, c.y);
    const fit = (s: Sprite) => {
      const k = symS / Math.max(1, s.texture.width);
      s.scale.set(k, k);
      return k;
    };
    let k = fit(flap);
    flap.visible = false;
    this.flaps.addChild(flap);
    const fold = T(0.045);
    const fin = T(0.075);
    // as many rattle flaps as fit before the final one (the anticipating stations rattle all the way)
    const room = Math.floor((at - fin - T(0.01)) / (fold * 2));
    const want = waiting.includes(p) && antic ? room : 2 + ((Math.random() * 2) | 0);
    const rattleN = Math.max(0, Math.min(want, room));
    const start = at - fin - rattleN * fold * 2;
    tl.call(
      () => {
        if (old) {
          this.release(old);
          if (this.views[p] === old) this.views[p] = null;
        }
        flap.visible = true;
        hooks.onRattle?.(p);
      },
      [],
      start,
    );
    for (let i = 0; i < rattleN; i++) {
      const t0 = start + i * fold * 2;
      tl.to(flap.scale, { y: k * 0.06, duration: fold, ease: 'power2.in' }, t0);
      tl.to(flap, { tint: 0x55606e, duration: fold, ease: 'power1.in' }, t0);
      tl.call(
        () => {
          if (flap.destroyed) return;
          flap.texture = this.rattleTexture();
          k = fit(flap);
          flap.scale.y = k * 0.06;
        },
        [],
        t0 + fold,
      );
      tl.to(flap.scale, { y: k, duration: fold, ease: 'power2.out' }, t0 + fold);
      tl.to(flap, { tint: 0xffffff, duration: fold, ease: 'power1.out' }, t0 + fold);
    }
    // the final flap: the old frame folds away, the new symbol drops open heavier, overshoots, settles
    tl.to(flap.scale, { y: k * 0.05, duration: fin, ease: 'power2.in' }, at - fin);
    tl.to(flap, { tint: 0x4a5462, duration: fin }, at - fin);
    tl.call(
      () => {
        flap.destroy();
        const v = this.take(cell);
        this.views[p] = v;
        v.position.set(c.x, c.y);
        v.scale.set(1.06, 0.05);
        gsap
          .timeline()
          .to(v.scale, { x: 0.96, y: 1.12, duration: T(0.09), ease: 'power2.out' })
          .to(v.scale, { x: 1.03, y: 0.94, duration: T(0.08), ease: 'sine.inOut' })
          .to(v.scale, { x: 1, y: 1, duration: T(0.22), ease: 'elastic.out(1.1, 0.45)' });
        hooks.onSettle?.(p, isLast);
        const kind = SPECIAL[cell.sym];
        if (kind) hooks.onSpecial?.(v, kind, kind === 'fs' ? nextFs() : 0);
        const wi = waiting.indexOf(p);
        if (wi >= 0) {
          waiting.splice(wi, 1);
          if (waiting.length) hooks.onAnticipation?.([...waiting], true);
        }
      },
      [],
      at,
    );
  }

  /** Every ticket on the board beats once (anticipation). */
  heartbeat() {
    for (const v of this.views) if (v?.sym === Sym.FS) v.heartbeat(1);
  }

  /* ================================================================ line glows + pulses */

  /** Light a line (0 = idle glow, 1 = fully lit), eased. */
  lightLine(li: number, level: number, dur = 0.35) {
    this.glowLevel[li] = level;
    const s = this.glows[li];
    if (!s) return;
    gsap.to(s, { alpha: 0.12 + level * 0.5, duration: T(dur), ease: "sine.inOut" });
  }

  /** Points along a line (stage px), in stop order. */
  linePoints(li: number): { x: number; y: number }[] {
    return LINES[li].stops.map((id) => stationCenter(this.L, id));
  }

  /** Spawn one current pulse running the length of a line. */
  private spawnPulse(li: number, strong = false) {
    const s = new Sprite(softDotTexture());
    s.anchor.set(0.5);
    s.tint = hex(LINE_COLORS[LINES[li].key][1]);
    const S = this.L.S;
    s.width = s.height = S * (strong ? 0.75 : 0.42);
    s.alpha = 0;
    this.pulseLayer.addChild(s);
    const n = LINES[li].stops.length;
    this.pulses.push({ s, line: li, t: 0, dur: (strong ? 0.9 : 2.2) + n * (strong ? 0.08 : 0.25), dir: Math.random() < 0.5 ? 1 : -1 });
  }

  /** A burst of strong pulses along a line (a train lit it, a route won on it). */
  surge(li: number) {
    if (quality.low) return;
    for (let i = 0; i < 2; i++) gsap.delayedCall(i * 0.18, () => this.spawnPulse(li, true));
  }

  private tickPulses(dt: number) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pl = this.pulses[i];
      pl.t += dt / pl.dur;
      if (pl.t >= 1) {
        pl.s.destroy();
        this.pulses.splice(i, 1);
        continue;
      }
      const pts = this.linePoints(pl.line);
      const u = pl.dir > 0 ? pl.t : 1 - pl.t;
      const f = u * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const r = f - k;
      pl.s.position.set(pts[k].x + (pts[k + 1].x - pts[k].x) * r, pts[k].y + (pts[k + 1].y - pts[k].y) * r);
      pl.s.alpha = Math.sin(pl.t * Math.PI) * 0.55;
    }
  }

  /* ================================================================ route wins */

  /**
   * Route wins: a neon trace runs along the line through each run's stations; each winner pops and
   * cheers as the trace reaches it; everything else dims; the line surges.
   */
  celebrate(routes: RouteWin[]): Promise<void> {
    this.clearTraces();
    const S = this.L.S;
    const winSet = new Set(routes.flatMap((w) => w.stations));
    const tl = gsap.timeline();
    const trace = T(0.42);
    this.views.forEach((v, p) => {
      if (v && !winSet.has(p)) tl.to(v, { alpha: 0.32, duration: T(0.2), ease: 'power1.out' }, 0);
    });
    routes.forEach((w, k) => {
      const at = k * T(0.12);
      const pts = w.stations.map((p) => stationCenter(this.L, p));
      const [main, light] = LINE_COLORS[LINES[w.line].key];
      const g = new Graphics();
      g.blendMode = 'add';
      this.routeLayer.addChild(g);
      this.traces.push(g);
      const prog = { u: 0 };
      const draw = () => {
        g.clear();
        const f = prog.u * (pts.length - 1);
        const n = Math.floor(f);
        const head = n >= pts.length - 1 ? pts[pts.length - 1] : { x: pts[n].x + (pts[n + 1].x - pts[n].x) * (f - n), y: pts[n].y + (pts[n + 1].y - pts[n].y) * (f - n) };
        const path = (w2: number, color: number, a: number) => {
          g.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i <= n && i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
          g.lineTo(head.x, head.y);
          g.stroke({ width: w2, color, alpha: a, cap: 'round', join: 'round' });
        };
        path(S * 0.62, hex(main), 0.35);
        path(S * 0.22, hex(light), 0.9);
        g.circle(head.x, head.y, S * 0.2).fill({ color: 0xffffff, alpha: 0.8 * (1 - Math.max(0, prog.u - 0.95) * 20) });
      };
      let lastSpark = 0;
      tl.call(() => {
        this.sfx('routeTrace');
        this.lightLine(w.line, 1, 0.2);
        this.surge(w.line);
      }, [], at);
      tl.to(
        prog,
        {
          u: 1,
          duration: trace,
          ease: 'power1.inOut',
          onUpdate: () => {
            draw();
            if (!quality.low && prog.u - lastSpark > 0.12 && prog.u < 1) {
              lastSpark = prog.u;
              const f = prog.u * (pts.length - 1);
              const i = Math.min(pts.length - 2, Math.floor(f));
              this.fx.glint(pts[i].x + (pts[i + 1].x - pts[i].x) * (f - i), pts[i].y + (pts[i + 1].y - pts[i].y) * (f - i), 0.3);
            }
          },
        },
        at,
      );
      // winners wake as the trace reaches them
      w.stations.forEach((p, i) => {
        const v = this.views[p];
        if (!v) return;
        const t = at + trace * (i / Math.max(1, w.stations.length - 1)) * 0.92;
        tl.call(
          () => {
            this.symbols.addChild(v);
            v.startWin();
          },
          [],
          t,
        );
        tl.fromTo(v.scale, { x: 1, y: 1 }, { x: 1.16, y: 1.16, duration: T(0.18), ease: 'back.out(3.2)' }, t);
      });
      tl.to(g, { alpha: 0.65, duration: T(0.14), yoyo: true, repeat: 1, ease: 'sine.inOut' }, at + trace);
    });
    tl.to({}, { duration: T(0.25) }, routes.length * T(0.12) + trace);
    return done(tl);
  }

  private clearTraces() {
    for (const g of this.traces) {
      gsap.killTweensOf(g);
      g.destroy();
    }
    this.traces = [];
  }

  undim(): Promise<void> {
    const tl = gsap.timeline();
    for (const v of this.views)
      if (v) {
        v.stopWin();
        if (v.alpha < 1) tl.to(v, { alpha: 1, duration: T(0.18) }, 0);
        if (Math.abs(v.scale.x - 1) > 0.001 || Math.abs(v.scale.y - 1) > 0.001) tl.to(v.scale, { x: 1, y: 1, duration: T(0.2), ease: 'power2.out' }, 0);
      }
    for (const g of this.traces) tl.to(g, { alpha: 0, duration: T(0.18) }, 0);
    tl.call(() => this.clearTraces(), [], T(0.2));
    LINES.forEach((_, li) => this.glowLevel[li] > 0 && this.lightLine(li, 0, 0.4));
    tl.to({}, { duration: T(0.01) });
    return done(tl);
  }

  /* ================================================================ misc */

  /** Dim everything except the given stations (null: undim). */
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

  /** A station's symbol changes in place (a collected coin leaves an empty face). */
  clearStation(p: number) {
    const v = this.views[p];
    if (v) this.release(v);
    this.views[p] = null;
  }

  /** Idle life: pulses, breathing glows, blinks, glints, idle acts. */
  update(dtMs: number, busy: boolean) {
    if (!this.L) return;
    const dt = dtMs / 1000;
    this.t += dt;
    const target = busy ? 0 : 1;
    this.calm += (target - this.calm) * Math.min(1, dt * (busy ? 12 : 2.5));
    const low = quality.low || speed.reduced;
    for (const c of this.symbols.children) if (c instanceof SymbolView) c.tick(dtMs, this.t, this.calm);
    this.tickPulses(dt);
    if (!low) {
      // the lines breathe a little, each on its own phase
      this.glows.forEach((s, li) => {
        if (this.glowLevel[li] > 0 || gsap.isTweening(s)) return;
        s.alpha = 0.12 + 0.05 * Math.sin(this.t * 1.3 + li * 1.7);
      });
      if (this.t > this.pulseAt) {
        this.pulseAt = this.t + 0.7 + Math.random() * 1.1;
        this.spawnPulse((Math.random() * LINES.length) | 0);
      }
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

export { artKey };
