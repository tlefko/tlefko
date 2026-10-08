import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { t } from '../../i18n';
import { stationCenter, type Layout } from '../layout';
import { T, wait, speed, brisk } from '../timing';
import { quality } from '../quality';
import { svgTexture, softDotTexture } from '../textures';
import { bitmapNum, displayText, type DisplayText } from '../text';
import { crashBoomSvg, trainCarSvg } from '../../art/trainTop';
import { securityCheck } from '../../art/specials';
import { LINES, STATIONS } from '../../math/network';
import { Sym, type Crash, type SpinResult, type Train } from '../../math/types';
import type { Particles } from '../fx/Particles';
import type { MapView, Sfx } from './MapView';
import { SYM_K } from './MapView';
import type { SymbolView } from '../grid/SymbolView';

type Pt = { x: number; y: number };

export interface RunHooks {
  fmt: (multiple: number) => string;
  sfx: Sfx;
  shake: (power: number) => void;
  punch: (x: number, y: number, power: number) => void;
  /** A coin reached its train (the POWER meter takes a passenger in the free spins). */
  onCoin?: (from: Pt) => void;
  /**
   * A train is done (arrived, held) or a crash pile is settled: `label` shows `amount` (bet multiples,
   * before the POWER multiplier) and now belongs to the presenter (fly it, then destroy it).
   */
  onPayout: (amount: number, label: Container) => Promise<void>;
  /** Character beats. */
  onDepart?: () => void;
  onSecurity?: (phase: 'alarm' | 'clear' | 'incident') => void;
  onCrash?: (phase: 'closing' | 'impact' | 'settled') => void;
  onRedirect?: () => void;
}

const hex = (c: string) => parseInt(c.slice(1), 16);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** A node of a train's path: where its lead car's nose sits at clock time `tau` (in beats). */
interface Node {
  tau: number;
  p: Pt;
  /** Arc length from the start (px). */
  s: number;
}

interface Run {
  tr: Train;
  index: number;
  nodes: Node[];
  cars: Sprite[];
  lamp: Sprite;
  /** The haul tally above the train (created on its first coin). */
  tally?: Tally;
  /** The first beat it is gone from the board (crash wreckage takes over, or it exited). */
  gone: number;
  /** Wreck motion after a crash: per car. */
  wreck?: { vx: number; vy: number; spin: number }[];
  grey: number;
  collected: number;
  pending?: number;
  /** The line it is on now (for its glow). */
  line: number;
}

class Tally extends Container {
  bg = new Graphics();
  num: BitmapText;
  chip?: BitmapText;
  value = 0;
  repay = 1;
  constructor(
    private S: number,
    private fmt: (v: number) => string,
    private color: number,
  ) {
    super();
    this.num = bitmapNum(fmt(0), 'gold', S * 0.36);
    this.addChild(this.bg, this.num);
    this.redraw();
  }
  set(v: number, repay: number) {
    this.value = v;
    this.repay = repay;
    this.num.text = this.fmt(v);
    if (repay > 1 && !this.chip) {
      this.chip = bitmapNum(`x${repay}`, 'green', this.S * 0.32);
      this.addChild(this.chip);
    } else if (this.chip) this.chip.text = `x${repay}`;
    this.redraw();
  }
  private redraw() {
    const S = this.S;
    // before the first coin a repaid train shows only its x2
    this.num.visible = !(this.value === 0 && this.chip);
    const numW = this.num.visible ? this.num.width : 0;
    const w = numW + (this.chip ? this.chip.width + (numW ? S * 0.12 : 0) : 0) + S * 0.36;
    const h = S * 0.44;
    this.bg.clear().roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: 0x0b1220, alpha: 0.88 }).stroke({ width: S * 0.035, color: this.color, alpha: 1 });
    const x0 = -w / 2 + S * 0.18;
    this.num.x = x0 + numW / 2;
    this.num.y = S * 0.01;
    if (this.chip) {
      this.chip.x = x0 + numW + (numW ? S * 0.12 : 0) + this.chip.width / 2;
      this.chip.y = S * 0.01;
    }
  }
}

/**
 * The trains, played beat by beat from the engine's record. One clock (`tau`, in beats) drives
 * every train: each train's nose follows its own path of nodes (its terminal, every station it
 * enters, a wait at a cleared security check, the crash point), and its cars follow the nose
 * along the same polyline at a fixed spacing (so a redirected train bends round the corner). Beats
 * run linear (constant speed, so trains glide) except into and out of a big moment, where the
 * whole network eases down and back up; security checks and crashes hold the clock while they
 * play. Coins fly off their stations into the moving trains' tallies.
 */
export class TrainRunner extends Container {
  private tex = new Map<string, Texture>();
  private incidentTex: Texture = Texture.EMPTY;
  private boomTex: Texture = Texture.EMPTY;
  private lamp: Texture = Texture.EMPTY;
  private L!: Layout;
  labels = new Container();
  private scorch = new Container();
  private runs: Run[] = [];
  private tau = { v: 0 };

  constructor(
    private map: MapView,
    private fx: Particles,
  ) {
    super();
    this.addChild(this.scorch);
    this.eventMode = 'none';
  }

  async layout(L: Layout, res: number) {
    this.L = L;
    const w = L.S * 1.3;
    const jobs: Promise<void>[] = [];
    for (const l of LINES)
      for (const lead of [true, false]) {
        const key = `${l.key}${lead ? 'L' : 'C'}`;
        jobs.push(svgTexture(`car-${key}`, trainCarSvg(l.key, lead), w * res, ((w * 96) / 240) * res).then((tx) => void this.tex.set(key, tx)));
      }
    for (const lead of [true, false]) jobs.push(svgTexture(`car-gold${lead ? 'L' : 'C'}`, trainCarSvg('gold', lead, true), w * res, ((w * 96) / 240) * res).then((tx) => void this.tex.set(`gold${lead ? 'L' : 'C'}`, tx)));
    jobs.push(svgTexture('sec-incident', securityCheck('incident'), L.S * SYM_K * 1.22 * res).then((tx) => void (this.incidentTex = tx)));
    jobs.push(svgTexture('crash-boom', crashBoomSvg(), L.S * 3 * res).then((tx) => void (this.boomTex = tx)));
    await Promise.all(jobs);
    this.lamp = softDotTexture();
  }

  textures(): Texture[] {
    return [...this.tex.values(), this.incidentTex, this.boomTex];
  }

  /** Clear the scorch marks and leftovers of the last spin (a new spin starts). */
  clear() {
    for (const c of [...this.scorch.children]) {
      gsap.killTweensOf(c);
      c.destroy();
    }
    for (const r of this.runs) this.destroyRun(r);
    this.runs = [];
  }

  private destroyRun(r: Run) {
    for (const c of r.cars) {
      gsap.killTweensOf(c);
      c.destroy();
    }
    gsap.killTweensOf(r.lamp);
    r.lamp.destroy();
    if (r.tally && !r.tally.destroyed && r.tally.parent === this.labels) r.tally.destroy({ children: true });
  }

  /* ------------------------------------------------------------------ geometry */

  private center(p: number): Pt {
    return stationCenter(this.L, p);
  }

  /** The station a crash-bound mover was heading for. */
  /** The station a crash-bound mover was heading for. */
  crashTarget(r: Run, c: Crash): number {
    const cur = r.tr.steps.length ? r.tr.steps[r.tr.steps.length - 1].at : r.tr.start;
    if (c.at.length === 1) return c.at[0];
    return c.at[0] === cur ? c.at[1] : c.at[0];
  }

  private buildPath(tr: Train, crashes: Crash[]): Node[] {
    const S = this.L.S;
    const nodes: { tau: number; p: Pt }[] = [{ tau: 0, p: this.center(tr.start) }];
    let prevBeat = 0;
    for (const st of tr.steps) {
      if (st.beat - prevBeat >= 2) nodes.push({ tau: st.beat - 1, p: nodes[nodes.length - 1].p });
      nodes.push({ tau: st.beat, p: this.center(st.at) });
      prevBeat = st.beat;
    }
    const last = nodes[nodes.length - 1];
    if (tr.end === 'crash' && tr.crash >= 0) {
      const c = crashes[tr.crash];
      const cur = tr.steps.length ? tr.steps[tr.steps.length - 1].at : tr.start;
      const waiting = prevBeat < c.beat - 1;
      if (waiting) {
        // it sat at a security check; the other train runs into it
        nodes.push({ tau: c.beat, p: last.p });
      } else {
        const target = c.at.length === 1 ? c.at[0] : c.at[0] === cur ? c.at[1] : c.at[0];
        const a = this.center(cur);
        const b = this.center(target);
        const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // head-on between stations: meet in the middle; into a station: stop short of its centre
        const ahead = c.at.length === 2 ? d / 2 - S * 0.28 : d - S * (this.waitingAt(c, target, tr) ? 0.62 : 0.3);
        nodes.push({ tau: c.beat, p: { x: a.x + ((b.x - a.x) / d) * ahead, y: a.y + ((b.y - a.y) / d) * ahead } });
      }
    } else if (tr.end === 'arrive') {
      // into the far terminal's tunnel
      const prev = nodes.length > 1 ? nodes[nodes.length - 2].p : last.p;
      const dx = last.p.x - prev.x;
      const dy = last.p.y - prev.y;
      const d = Math.hypot(dx, dy) || 1;
      nodes.push({ tau: last.tau + 1, p: { x: last.p.x + (dx / d) * this.L.unit, y: last.p.y + (dy / d) * this.L.unit } });
    }
    let s = 0;
    return nodes.map((n, i) => {
      if (i > 0) s += Math.hypot(n.p.x - nodes[i - 1].p.x, n.p.y - nodes[i - 1].p.y);
      return { ...n, s };
    });
  }

  /** Is a train already standing (waiting) at `station` when this crash happens? */
  private waitingAt(c: Crash, station: number, self: Train): boolean {
    return this.runs.some((r) => r.tr !== self && c.trains.includes(r.index) && (r.tr.steps.at(-1)?.at === station) && (r.tr.steps.at(-1)?.beat ?? 0) < c.beat - 1);
  }

  /** Arc length of the nose at clock time tau. */
  private arcAt(nodes: Node[], tau: number): number {
    if (tau <= nodes[0].tau) return 0;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      if (tau <= b.tau) return lerp(a.s, b.s, (tau - a.tau) / Math.max(1e-6, b.tau - a.tau));
    }
    return nodes[nodes.length - 1].s;
  }

  /** Point at arc length `s` along the path (before the start it runs back along the first leg). */
  private pointAt(nodes: Node[], s: number): Pt {
    if (nodes.length < 2) return nodes[0].p;
    if (s <= 0) {
      let k = 1;
      while (k < nodes.length - 1 && nodes[k].s === 0) k++;
      const a = nodes[0].p;
      const b = nodes[k].p;
      const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: a.x + ((b.x - a.x) / d) * s, y: a.y + ((b.y - a.y) / d) * s };
    }
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1];
      const b = nodes[i];
      if (s <= b.s && b.s > a.s) {
        const u = (s - a.s) / (b.s - a.s);
        return { x: lerp(a.p.x, b.p.x, u), y: lerp(a.p.y, b.p.y, u) };
      }
    }
    return nodes[nodes.length - 1].p;
  }

  /* ------------------------------------------------------------------ the run */

  /**
   * Play every train of a spin. Resolves when the last train is done and every payout label has
   * been handed to the presenter (and those hand-offs resolved).
   */
  async run(spin: SpinResult, hooks: RunHooks): Promise<void> {
    this.clear();
    const S = this.L.S;
    const gap = S * 1.12;
    this.runs = spin.trains.map((tr, index) => ({ tr, index, nodes: [], cars: [], lamp: new Sprite(this.lamp), gone: Infinity, grey: 0, collected: 0, line: tr.line }));
    for (const r of this.runs) {
      r.nodes = this.buildPath(r.tr, spin.crashes);
      const key = r.tr.golden ? 'gold' : LINES[r.tr.line].key;
      for (let k = 0; k < 2; k++) {
        const c = new Sprite(this.tex.get(`${key}${k === 0 ? 'L' : 'C'}`) ?? Texture.EMPTY);
        c.anchor.set(0.5);
        c.alpha = 0;
        this.addChild(c);
        r.cars.push(c);
      }
      // the headlamp beam: a soft warm glow ahead of the nose
      r.lamp.anchor.set(0.5);
      r.lamp.blendMode = 'add';
      r.lamp.tint = r.tr.golden ? 0xffe08a : 0xfff1c8;
      r.lamp.width = S * 1.1;
      r.lamp.height = S * 0.7;
      r.lamp.alpha = 0;
      this.addChildAt(r.lamp, 1);
    }
    const payouts: Promise<void>[] = [];
    const maxBeat = Math.max(1, ...this.runs.map((r) => r.nodes[r.nodes.length - 1].tau));
    const blockAt = new Set<number>();
    for (const r of this.runs) for (const st of r.tr.steps) if (st.event === 'clear' || st.event === 'held') blockAt.add(st.beat);
    for (const c of spin.crashes) blockAt.add(c.beat);
    const redirectAt = new Set<number>();
    for (const r of this.runs) for (const st of r.tr.steps) if (st.event === 'redirect') redirectAt.add(st.beat);

    // departure: lamps on, the trains roll out of their terminals
    hooks.onDepart?.();
    for (const r of this.runs) {
      const v = this.map.views[r.tr.start];
      if (v) gsap.to(v, { alpha: 0.28, duration: T(0.5), delay: T(0.15) });
      gsap.to(r.lamp, { alpha: 0.55, duration: T(0.3) });
      this.map.lightLine(r.tr.line, 0.75, 0.5);
      this.map.surge(r.tr.line);
    }
    this.tau.v = -0.25;
    this.place(gap);
    const beatDur = brisk() ? T(0.3) : T(0.38);
    await this.clock(0, gap, beatDur * 0.9, 'power1.in');
    for (let b = 1; b <= Math.ceil(maxBeat); b++) {
      const intoBlock = blockAt.has(b);
      const fromBlock = blockAt.has(b - 1);
      const crashNow = spin.crashes.filter((c) => c.beat === b);
      let ease = 'none';
      if (crashNow.length) ease = 'power2.in';
      else if (intoBlock) ease = fromBlock ? 'power1.inOut' : 'power1.out';
      else if (fromBlock) ease = 'power1.in';
      else if (redirectAt.has(b)) ease = 'sine.inOut';
      let dur = beatDur * (intoBlock || fromBlock ? 1.25 : 1);
      if (crashNow.length) {
        dur = beatDur * 1.5;
        hooks.sfx('crashRumble');
        hooks.onCrash?.('closing');
        for (const c of crashNow) this.closing(c, spin, dur);
      }
      hooks.sfx('trainStep', { index: b, volume: 0.6 });
      await this.clock(b, gap, dur, ease);
      // arrivals at this beat: coins, signals, checks
      for (const r of this.runs) {
        for (const coin of r.tr.coins) if (coin.beat === b) this.collect(r, coin.at, coin.value, hooks);
        const st = r.tr.steps.find((x) => x.beat === b);
        if (st?.event === 'redirect') this.redirect(r, st.at, hooks);
      }
      const checks = this.runs.flatMap((r) => r.tr.steps.filter((x) => x.beat === b && (x.event === 'clear' || x.event === 'held')).map((st) => ({ r, st })));
      if (checks.length) await Promise.all(checks.map(({ r, st }) => this.security(r, st.at, st.event === 'clear', spin, hooks, payouts)));
      if (crashNow.length) await Promise.all(crashNow.map((c) => this.crash(c, spin, hooks, payouts)));
      // trains that reached their far terminal: their tallies pay as they pull in
      for (const r of this.runs) if (r.tr.end === 'arrive' && r.tr.endBeat === b) payouts.push(this.arrive(r, hooks));
    }
    // let the last arrivals pull into their tunnels
    await this.clock(Math.ceil(maxBeat) + 1, gap, beatDur * 1.1, 'power1.out');
    for (const r of this.runs) gsap.to(r.lamp, { alpha: 0, duration: T(0.3) });
    await Promise.all(payouts);
    LINES.forEach((_, li) => this.map.lightLine(li, 0, 0.6));
  }

  /** Run the clock to `to` (beats) and move every train. */
  private clock(to: number, gap: number, dur: number, ease: string): Promise<void> {
    return new Promise((res) => {
      gsap.to(this.tau, { v: to, duration: dur, ease, onUpdate: () => this.place(gap), onComplete: () => (this.place(gap), res()) });
    });
  }

  /** Put every train where the clock says. */
  private place(gap: number) {
    const tau = this.tau.v;
    const S = this.L.S;
    for (const r of this.runs) {
      if (r.wreck) continue;
      const nodes = r.nodes;
      const s0 = this.arcAt(nodes, tau);
      const end = nodes[nodes.length - 1];
      const exitFade = r.tr.end === 'arrive' ? Math.max(0, Math.min(1, (end.s - s0) / (this.L.unit * 0.9))) : 1;
      r.cars.forEach((c, k) => {
        const s = s0 - k * gap - S * 0.55;
        const p = this.pointAt(nodes, s);
        const a = this.pointAt(nodes, s - S * 0.22);
        const b = this.pointAt(nodes, s + S * 0.22);
        c.position.set(p.x, p.y);
        if (Math.hypot(b.x - a.x, b.y - a.y) > 0.5) c.rotation = Math.atan2(b.y - a.y, b.x - a.x);
        // cars fade in as they leave the terminal and out as they enter the far one
        const inFade = Math.max(0, Math.min(1, (s + S * 0.55) / (S * 0.6)));
        c.alpha = inFade * (k === 0 ? exitFade : Math.min(exitFade * 1.6, 1));
        c.tint = r.grey > 0 ? lerpColor(0xffffff, 0x8a8f99, r.grey) : 0xffffff;
      });
      const nose = this.pointAt(nodes, s0);
      const back = this.pointAt(nodes, s0 - S * 0.3);
      const ang = Math.atan2(nose.y - back.y, nose.x - back.x);
      r.lamp.position.set(nose.x + Math.cos(ang) * S * 0.28, nose.y + Math.sin(ang) * S * 0.28);
      r.lamp.rotation = ang;
      if (r.tally) {
        const head = r.cars[0];
        r.tally.position.set(head.x, head.y - S * 0.62);
        r.tally.alpha = Math.min(1, head.alpha * 1.5);
      }
    }
  }

  private headPoint(r: Run): Pt {
    return { x: r.cars[0].x, y: r.cars[0].y };
  }

  /* ------------------------------------------------------------------ beats */

  private tally(r: Run, hooks: RunHooks): Tally {
    if (!r.tally) {
      const color = r.tr.golden ? 0xffd75a : hex(LINES_COLOR(r.tr.line));
      r.tally = new Tally(this.L.S, hooks.fmt, color);
      this.labels.addChild(r.tally);
      r.tally.scale.set(0);
      gsap.to(r.tally.scale, { x: 1, y: 1, duration: T(0.25), ease: 'back.out(2.5)' });
      this.place(this.L.S * 1.12);
    }
    return r.tally;
  }

  /** A coin hops off its station and flies into the train (its tally pops up with the first one). */
  private collect(r: Run, at: number, value: number, hooks: RunHooks) {
    const S = this.L.S;
    const v = this.map.lift(at);
    const from = this.center(at);
    r.collected++;
    hooks.sfx('coinCollect', { index: Math.min(12, r.collected) });
    hooks.onCoin?.(from);
    this.fx.sparks(from.x, from.y, quality.low ? 3 : 7, 0.6);
    this.fx.glint(from.x, from.y, 0.4);
    r.pending = (r.pending ?? 0) + value;
    const done = () => {
      const tally = this.tally(r, hooks);
      tally.set(Math.round((tally.value + value) * 100) / 100, tally.repay);
      gsap.fromTo(tally.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: T(0.3), ease: 'back.out(3)' });
      if (value >= 25) hooks.shake(0.3);
    };
    if (!v) return done();
    v.parent?.addChild(v); // on top of the other symbols
    v.stopWin();
    const p = { u: 0 };
    const x0 = v.x;
    const y0 = v.y;
    const k0 = v.scale.x;
    gsap
      .timeline()
      .to(v.scale, { x: k0 * 1.3, y: k0 * 1.3, duration: T(0.1), ease: 'power2.out' })
      .to(p, {
        u: 1,
        duration: T(0.34),
        ease: 'power2.in',
        onUpdate: () => {
          // home in on the spot above the lead car, wherever the train has got to
          const head = r.cars[0];
          const tx = head ? head.x : x0;
          const ty = head ? head.y - S * 0.62 : y0;
          const lift = Math.sin(p.u * Math.PI) * S * 0.5;
          v.x = lerp(x0, tx, p.u);
          v.y = lerp(y0, ty, p.u) - lift;
          v.scale.set(k0 * lerp(1.3, 0.35, p.u));
          if (!quality.low && Math.random() < 0.5) this.fx.trail(v.x, v.y, 0.16);
        },
        onComplete: () => {
          this.map.release(v);
          done();
        },
      });
  }

  /** A Signal throws: the lamp goes green, the points swing, the train bends onto the new line. */
  private redirect(r: Run, at: number, hooks: RunHooks) {
    const S = this.L.S;
    hooks.sfx('signalSwitch');
    hooks.onRedirect?.();
    const v = this.map.views[at];
    if (v) {
      v.startWin();
      gsap.fromTo(v.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: T(0.4), ease: 'elastic.out(1, 0.5)' });
    }
    const st = r.tr.steps.find((x) => x.at === at && x.event === 'redirect');
    const next = r.tr.steps[r.tr.steps.indexOf(st!) + 1];
    const newLine = STATIONS[at].lines.find((l) => l !== st!.line) ?? st!.line;
    r.line = newLine;
    this.map.lightLine(newLine, 0.85, 0.3);
    this.map.surge(newLine);
    // the points: a bright arc from the old heading into the new one
    const c = this.center(at);
    const prev = r.tr.steps[r.tr.steps.indexOf(st!) - 1];
    const a = prev ? this.center(prev.at) : this.center(r.tr.start);
    const b = next ? this.center(next.at) : c;
    const g = new Graphics();
    g.blendMode = 'add';
    const col = hex(LINES_COLOR(newLine));
    const ax = lerp(c.x, a.x, 0.45);
    const ay = lerp(c.y, a.y, 0.45);
    const bx = lerp(c.x, b.x, 0.45);
    const by = lerp(c.y, b.y, 0.45);
    g.moveTo(ax, ay).quadraticCurveTo(c.x, c.y, bx, by).stroke({ width: S * 0.2, color: col, alpha: 0.9, cap: 'round' });
    g.moveTo(ax, ay).quadraticCurveTo(c.x, c.y, bx, by).stroke({ width: S * 0.07, color: 0xffffff, alpha: 0.95, cap: 'round' });
    this.map.fxLayer.addChild(g);
    g.alpha = 0;
    gsap
      .timeline({ onComplete: () => g.destroy() })
      .to(g, { alpha: 1, duration: T(0.08) })
      .to(g, { alpha: 0, duration: T(0.6), ease: 'power2.in' }, T(0.35));
    this.fx.sparks(c.x, c.y, quality.low ? 4 : 10, 0.7);
  }

  /**
   * A Security Check stops the train: the beacon strobes, a scanner ring sweeps the train twice,
   * then the stamp: ALL CLEAR (green: the train waits a beat and its haul pays x2) or INCIDENT (red:
   * the train is held; the stops it will now miss flash MISSED).
   */
  private async security(r: Run, at: number, clear: boolean, spin: SpinResult, hooks: RunHooks, payouts: Promise<void>[]) {
    const S = this.L.S;
    const c = this.center(at);
    const v = this.map.views[at];
    hooks.sfx('securityAlarm');
    hooks.onSecurity?.('alarm');
    // strobe + scanner
    const strobe = new Sprite(softDotTexture());
    strobe.anchor.set(0.5);
    strobe.blendMode = 'add';
    strobe.tint = 0xffb43c;
    strobe.width = strobe.height = S * 2.4;
    strobe.position.set(c.x, c.y - S * 0.25);
    strobe.alpha = 0;
    this.map.fxLayer.addChild(strobe);
    const ring = new Graphics();
    ring.blendMode = 'add';
    this.map.fxLayer.addChild(ring);
    const scan = { u: 0 };
    const head = this.headPoint(r);
    await new Promise<void>((res) =>
      gsap
        .timeline({ onComplete: res })
        .to(strobe, { alpha: 0.85, duration: T(0.08), yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0)
        .to(
          scan,
          {
            u: 2,
            duration: T(0.8),
            ease: 'none',
            onUpdate: () => {
              const f = scan.u % 1;
              ring.clear().circle(head.x, head.y, S * (0.25 + f * 0.9)).stroke({ width: S * 0.06, color: 0x6ff0ff, alpha: 0.9 * (1 - f) });
            },
          },
          0,
        )
        .call(() => v?.heartbeat(1.2), [], T(0.2))
        .call(() => v?.heartbeat(1.2), [], T(0.55)),
    );
    ring.destroy();
    // the verdict
    const stamp = displayText(clear ? t('allClear') : t('incident'), { size: S * 0.42, tone: clear ? 'green' : 'crimson', treatment: 'label' });
    stamp.position.set(c.x, c.y - S * 0.85);
    this.labels.addChild(stamp);
    const k = Math.min(1, (S * 2.6) / Math.max(1, stamp.inkWidth));
    stamp.scale.set(k * 2.2);
    stamp.rotation = clear ? -0.08 : 0.08;
    gsap.to(stamp.scale, { x: k, y: k, duration: T(0.2), ease: 'power3.in' });
    await wait(T(0.18));
    hooks.shake(0.35);
    hooks.punch(c.x, c.y, 0.6);
    if (clear) {
      hooks.sfx('allClear');
      hooks.onSecurity?.('clear');
      strobe.tint = 0x5dff9a;
      gsap.fromTo(strobe, { alpha: 0.9 }, { alpha: 0, duration: T(0.6) });
      v?.startWin();
      this.fx.burst(c.x, c.y, 14, 'green', 0.9);
      const tally = this.tally(r, hooks);
      tally.set(tally.value, r.tr.repay);
      gsap.fromTo(tally.scale, { x: 1.5, y: 1.5 }, { x: 1, y: 1, duration: T(0.4), ease: 'back.out(3)' });
      const sub = displayText(t('delayRepay'), { size: S * 0.26, tone: 'gold', treatment: 'label' });
      sub.position.set(c.x, c.y - S * 0.48);
      sub.scale.set(Math.min(1, (S * 2.4) / Math.max(1, sub.inkWidth)));
      this.labels.addChild(sub);
      gsap.from(sub, { alpha: 0, y: sub.y + S * 0.2, duration: T(0.25) });
      await wait(T(0.55));
      for (const d of [stamp, sub]) gsap.to(d, { alpha: 0, y: d.y - S * 0.3, duration: T(0.3), onComplete: () => d.destroy() });
    } else {
      hooks.sfx('incident');
      hooks.onSecurity?.('incident');
      strobe.tint = 0xff3b30;
      gsap.fromTo(strobe, { alpha: 1 }, { alpha: 0, duration: T(0.9), ease: 'power1.in' });
      if (v) {
        const red = new Sprite(this.incidentTex);
        red.anchor.set(0.5);
        red.scale.set((S * SYM_K) / Math.max(1, this.incidentTex.width));
        red.position.set(v.x, v.y);
        this.map.fxLayer.addChild(red);
        gsap.from(red, { alpha: 0, duration: T(0.12) });
        gsap.to(red, { alpha: 0, duration: T(0.4), delay: T(1.6), onComplete: () => red.destroy() });
      }
      gsap.to(r, { grey: 1, duration: T(0.4), onUpdate: () => this.place(this.L.S * 1.12) });
      // the stops this train now misses: every station ahead on its line, coins flagged
      const missed = this.missedAhead(r, at);
      for (const [i, p] of missed.entries()) {
        const mv = this.map.views[p];
        if (!mv || mv.sym !== Sym.COIN) continue;
        const pc = this.center(p);
        gsap.delayedCall(T(0.12 + i * 0.09), () => {
          const tag = displayText(t('missed'), { size: S * 0.22, tone: 'crimson', treatment: 'label' });
          tag.position.set(pc.x, pc.y - S * 0.46);
          tag.scale.set(Math.min(1, (S * 1.1) / Math.max(1, tag.inkWidth)) * 1.6);
          tag.rotation = -0.12;
          this.labels.addChild(tag);
          gsap
            .timeline({ onComplete: () => tag.destroy() })
            .to(tag.scale, { x: tag.scale.x / 1.6, y: tag.scale.y / 1.6, duration: T(0.14), ease: 'power3.in' })
            .to(tag, { alpha: 0, duration: T(0.3) }, T(1.1));
          mv.heat = 0.6;
          gsap.to(mv, { heat: 0, duration: T(0.6), delay: T(0.2) });
          hooks.sfx('trainBrake', { volume: 0.4 });
        });
      }
      await wait(T(0.7 + missed.length * 0.05));
      gsap.to(stamp, { alpha: 0, duration: T(0.3), delay: T(0.3), onComplete: () => stamp.destroy() });
      // the held train's passengers still pay what it carried
      payouts.push(this.finish(r, hooks, 'held'));
      void spin;
    }
    strobe.destroy();
  }

  /** Stations still ahead of a held train on its line, in order. */
  private missedAhead(r: Run, at: number): number[] {
    const st = r.tr.steps.find((x) => x.at === at && x.event === 'held');
    const prev = r.tr.steps[r.tr.steps.indexOf(st!) - 1];
    const from = prev ? prev.at : r.tr.start;
    const stops = LINES[st!.line].stops;
    const i = stops.indexOf(at);
    const dir = stops.indexOf(from) < i ? 1 : -1;
    const out: number[] = [];
    for (let k = i + dir; k >= 0 && k < stops.length; k += dir) out.push(stops[k]);
    return out;
  }

  /** The beat before a crash: the trains shake, sparks fly off the rails, the camera leans in. */
  private closing(c: Crash, spin: SpinResult, dur: number) {
    void spin;
    const members = c.trains.map((i) => this.runs[i]);
    for (const r of members) {
      for (const car of r.cars)
        gsap.to(car, {
          duration: dur,
          onUpdate: () => {
            if (!quality.low && Math.random() < 0.25) this.fx.sparks(car.x, car.y, 1, 0.4);
          },
        });
    }
  }

  /**
   * CRASH: the trains meet; a white flash and a shock ring, the cars fly apart spinning and smoking,
   * the tallies and every coin around the wreck pour into one pile, and the x2 slams onto it.
   */
  private async crash(c: Crash, _spin: SpinResult, hooks: RunHooks, payouts: Promise<void>[]) {
    const S = this.L.S;
    const members = c.trains.map((i) => this.runs[i]);
    const pts = members.map((r) => this.headPoint(r));
    const at = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    hooks.sfx('crashImpact');
    hooks.onCrash?.('impact');
    hooks.shake(1.8);
    hooks.punch(at.x, at.y, 2.2);
    // hit-stop: the whole world drops to slow motion for a heartbeat, then snaps back
    if (!speed.reduced && !brisk()) {
      const g = gsap.globalTimeline;
      gsap.killTweensOf(g);
      g.timeScale(0.3);
      gsap.to(g, { timeScale: 1, duration: 0.35, delay: 0.09, ease: 'power2.in' });
    }
    // white flash + shock ring
    const flash = new Sprite(softDotTexture());
    flash.anchor.set(0.5);
    flash.blendMode = 'add';
    flash.position.set(at.x, at.y);
    flash.width = flash.height = S * 6;
    this.map.fxLayer.addChild(flash);
    gsap.fromTo(flash, { alpha: 1 }, { alpha: 0, duration: T(0.45), ease: 'power2.out', onComplete: () => flash.destroy() });
    const ring = new Graphics();
    ring.blendMode = 'add';
    this.map.fxLayer.addChild(ring);
    const rr = { r: S * 0.3, a: 1 };
    gsap.to(rr, {
      r: S * 3,
      a: 0,
      duration: T(0.6),
      ease: 'power2.out',
      onUpdate: () => void ring.clear().circle(at.x, at.y, rr.r).stroke({ width: S * 0.14 * rr.a + 1, color: 0xfff1c8, alpha: rr.a }),
      onComplete: () => ring.destroy(),
    });
    // the explosion cloud: punches out, wobbles, holds, then breaks into smoke
    const boom = new Sprite(this.boomTex);
    boom.anchor.set(0.5);
    boom.position.set(at.x, at.y);
    const kb = (S * 2.6) / Math.max(1, this.boomTex.width);
    boom.scale.set(kb * 0.15);
    boom.rotation = (Math.random() - 0.5) * 0.4;
    this.labels.addChildAt(boom, 0);
    gsap
      .timeline({ onComplete: () => boom.destroy() })
      .to(boom.scale, { x: kb * 1.18, y: kb * 1.18, duration: T(0.12), ease: 'power3.out' })
      .to(boom.scale, { x: kb, y: kb, duration: T(0.22), ease: 'sine.inOut' })
      .to(boom, { rotation: boom.rotation + 0.12, duration: T(0.7), ease: 'sine.inOut' }, T(0.1))
      .to(boom.scale, { x: kb * 1.3, y: kb * 1.3, duration: T(0.35), ease: 'power1.in' }, T(0.95))
      .to(boom, { alpha: 0, duration: T(0.35), ease: 'power1.in' }, T(0.95));
    gsap.delayedCall(T(0.95), () => this.fx.smoke(at.x, at.y, quality.low ? 4 : 9, 1.4));
    this.fx.burst(at.x, at.y, quality.low ? 12 : 30, 'fire', 1.5);
    this.fx.sparks(at.x, at.y, quality.low ? 10 : 26, 1.5);
    this.fx.debris(at.x, at.y, quality.low ? 5 : 12, 1.3);
    // the cars are flung apart, spinning, scorched
    for (const r of members) {
      r.wreck = r.cars.map((car) => {
        const dx = car.x - at.x + (Math.random() - 0.5) * S * 0.3;
        const dy = car.y - at.y + (Math.random() - 0.5) * S * 0.3;
        const d = Math.hypot(dx, dy) || 1;
        const sp = S * (0.9 + Math.random() * 0.6);
        return { vx: (dx / d) * sp, vy: (dy / d) * sp, spin: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.2) };
      });
      gsap.to(r.lamp, { alpha: 0, duration: T(0.1) });
      r.cars.forEach((car, k) => {
        const w = r.wreck![k];
        const x0 = car.x;
        const y0 = car.y;
        const r0 = car.rotation;
        const sx = car.scale.x;
        const o = { t: 0 };
        gsap.to(o, {
          t: 1,
          duration: T(0.9),
          ease: 'power3.out',
          onUpdate: () => {
            car.x = x0 + w.vx * o.t;
            car.y = y0 + w.vy * o.t;
            car.rotation = r0 + w.spin * o.t;
            // a hop: up and down again (seen from above, a scale bump)
            const hop = Math.sin(Math.min(1, o.t * 1.6) * Math.PI);
            car.scale.set(sx * (1 + hop * 0.22));
            car.tint = lerpColor(0xffd2a0, 0x5a3d2e, Math.min(1, o.t * 1.5));
            if (!quality.low && Math.random() < 0.25) this.fx.smoke(car.x, car.y, 1, 0.35, 0x4a4440);
          },
        });
        gsap.to(car, { alpha: 0, duration: T(0.4), delay: T(1.05), onComplete: () => car.destroy() });
      });
      r.cars = [];
    }
    // a scorch mark stays where they met (until the next spin)
    const scorch = new Sprite(softDotTexture());
    scorch.anchor.set(0.5);
    scorch.tint = 0x000000;
    scorch.position.set(at.x, at.y);
    scorch.width = S * 1.8;
    scorch.height = S * 1.3;
    scorch.alpha = 0;
    this.scorch.addChild(scorch);
    gsap.to(scorch, { alpha: 0.6, duration: T(0.3) });
    // CRASH! on the cloud
    const word = displayText(t('crashCaps'), { size: S * 0.85, tone: 'fire', treatment: 'banner' });
    const kw = Math.min(1, (S * 3.6) / Math.max(1, word.inkWidth));
    word.position.set(at.x, at.y - S * 0.1);
    word.rotation = -0.1;
    this.labels.addChild(word);
    gsap
      .timeline({ onComplete: () => word.destroy() })
      .fromTo(word.scale, { x: kw * 2.6, y: kw * 2.6 }, { x: kw, y: kw, duration: T(0.16), ease: 'power4.in' })
      .to(word, { rotation: 0.05, duration: T(0.6), ease: 'elastic.out(1, 0.35)' })
      .to(word, { y: word.y - S * 0.9, duration: T(0.45), ease: 'power2.in' }, T(1.15))
      .to(word, { alpha: 0, duration: T(0.3) }, T(1.3));
    await wait(T(0.6));
    // the pile
    const pile = new Tally(S, hooks.fmt, 0xff7a1f);
    pile.position.set(at.x, at.y + S * 0.2);
    pile.scale.set(0);
    this.labels.addChild(pile);
    let pileV = 0;
    // the pile appears with the first thing poured into it
    const add = (v: number) => {
      pileV = Math.round((pileV + v) * 100) / 100;
      pile.set(pileV, 1);
      gsap.killTweensOf(pile.scale);
      gsap.fromTo(pile.scale, { x: pile.scale.x < 0.5 ? 0.4 : 1.3, y: pile.scale.x < 0.5 ? 0.4 : 1.3 }, { x: 1.1, y: 1.1, duration: T(0.22), ease: 'back.out(3)' });
    };
    // the trains' tallies pour in
    for (const r of members) {
      const tl = r.tally;
      if (!tl) continue;
      r.tally = undefined;
      const amount = tl.value * r.tr.repay;
      gsap.to(tl, { x: pile.x, y: pile.y, duration: T(0.3), ease: 'power2.in', onComplete: () => (tl.destroy({ children: true }), add(amount)) });
    }
    // the wreck scatters the coins around it into the pile
    if (c.wreck.length) {
      await wait(T(0.2));
      hooks.sfx('wreckScatter');
      c.wreck.forEach((w, i) => {
        const v = this.map.lift(w.at);
        const from = this.center(w.at);
        hooks.onCoin?.(from);
        if (!v) return void gsap.delayedCall(T(0.3 + i * 0.06), () => add(w.value));
        const o = { u: 0 };
        const x0 = v.x;
        const y0 = v.y;
        const k0 = v.scale.x;
        gsap.to(o, {
          u: 1,
          delay: T(i * 0.06),
          duration: T(0.45),
          ease: 'power2.in',
          onUpdate: () => {
            v.x = lerp(x0, pile.x, o.u);
            v.y = lerp(y0, pile.y, o.u) - Math.sin(o.u * Math.PI) * S * 0.8;
            v.rotation = o.u * 6;
            v.scale.set(k0 * lerp(1.15, 0.3, o.u));
          },
          onComplete: () => {
            this.map.release(v);
            add(w.value);
          },
        });
      });
      await wait(T(0.6 + c.wreck.length * 0.06));
    } else await wait(T(0.45));
    if (Math.abs(pileV - c.pile) > 1e-9 || pile.scale.x < 0.5) {
      pileV = c.pile;
      pile.set(pileV, 1);
      gsap.to(pile.scale, { x: 1.1, y: 1.1, duration: T(0.2), ease: 'back.out(2)' });
    }
    // the x2 slam
    const m = bitmapNum(`x${c.mult}`, 'fire', S * 0.8);
    m.position.set(pile.x + S * 1.4, pile.y - S * 1.2);
    this.labels.addChild(m);
    const km = m.scale.x;
    await new Promise<void>((res) =>
      gsap
        .timeline({ onComplete: res })
        .from(m.scale, { x: 0, y: 0, duration: T(0.14), ease: 'back.out(3)' })
        .to(m, { x: pile.x, y: pile.y, duration: T(0.22), ease: 'power3.in' }, T(0.18))
        .to(m.scale, { x: km * 0.8, y: km * 1.2, duration: T(0.1), ease: 'power2.in' }, '<'),
    );
    m.destroy();
    hooks.sfx('crashMult');
    hooks.shake(0.6);
    hooks.punch(pile.x, pile.y, 1);
    this.fx.burst(pile.x, pile.y, 16, 'fire', 1);
    pile.set(c.pay, 1);
    gsap.fromTo(pile.scale, { x: 1.7, y: 1.7 }, { x: 1.1, y: 1.1, duration: T(0.35), ease: 'back.out(3)' });
    hooks.onCrash?.('settled');
    await wait(T(0.35));
    pile.removeFromParent();
    payouts.push(c.pay > 0 ? hooks.onPayout(c.pay, pile) : (pile.destroy({ children: true }), Promise.resolve()));
  }

  /** A train pulls into its far terminal: its tally pays. */
  private arrive(r: Run, hooks: RunHooks): Promise<void> {
    hooks.sfx('trainExit', { volume: 0.7 });
    return this.finish(r, hooks, 'arrive');
  }

  private finish(r: Run, hooks: RunHooks, why: 'arrive' | 'held'): Promise<void> {
    const tl = r.tally;
    r.tally = undefined;
    if (why === 'held') {
      gsap.to(r.lamp, { alpha: 0, duration: T(0.3) });
      for (const car of r.cars) gsap.to(car, { alpha: 0.35, duration: T(0.5) });
    }
    if (!tl) return Promise.resolve();
    const amount = Math.round(tl.value * r.tr.repay * 100) / 100;
    if (r.tr.repay > 1) tl.set(amount, 1);
    tl.removeFromParent();
    if (amount <= 0) {
      tl.destroy({ children: true });
      return Promise.resolve();
    }
    return hooks.onPayout(amount, tl);
  }
}

function LINES_COLOR(li: number): string {
  return LINE_HEX[LINES[li].key];
}
const LINE_HEX: Record<string, string> = { red: '#e8443a', blue: '#2f86ea', green: '#20b877', gold: '#f2b632' };

function lerpColor(a: number, b: number, u: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (Math.round(lerp(ar, br, u)) << 16) | (Math.round(lerp(ag, bg, u)) << 8) | Math.round(lerp(ab, bb, u));
}

export type { SymbolView, DisplayText };
void speed;
