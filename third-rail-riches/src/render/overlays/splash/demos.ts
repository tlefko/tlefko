/**
 * The splash cards' live demos: each a small looping scene drawn with the game's own art (the map's
 * lines and split-flap stations, the top-down trains, the special symbols, the crash cloud), timed
 * like the real presentation (TrainRunner / MapView) but composed to read at card size.
 *
 *  run       ALL ABOARD      the board flips, the Locomotive lights, the train pulls out of its
 *                            terminal, snakes along the line and every Fare Coin hops into its tally
 *  signal    SIGNALS         a train reaches an interchange showing a Signal: it flips to green, the
 *                            points flash and the train swings onto the crossing line
 *  security  SECURITY CHECK  stopped at the checkpoint: beacon strobe and scanner, then (alternate
 *                            loops) ALL CLEAR + Delay Repay x2, or INCIDENT: held, the stops ahead MISSED
 *  crash     CRASH           two trains head-on: the crash, the wreck sweeps the coins around it into
 *                            a pile and the x2 slams onto it
 *  power     RUSH HOUR       sticky Fare Coins stay while the board flips round them; collected, each is
 *                            a passenger on the POWER meter: x2, x3, x5, x10
 *  boost     EXPRESS PASS    the lever goes on and every spin lands a Locomotive on a terminal
 *  max       MAX WIN         the Golden Locomotive in a burst of gold, and the max win
 */
import { BitmapText, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { t } from '../../../i18n';
import { bitmapNum, displayText, type DisplayText } from '../../text';
import { softDotTexture } from '../../textures';
import { quality } from '../../quality';
import { speed } from '../../timing';
import { MAX_WIN, BOOST_COST, POWER_STEPS, POWER_MULTS, CRASH_MULT, REPAY_MULT } from '../../../math/types';
import { C } from '../../../art/kit';
import { ART } from '../../../art/symbols';
import { LOCO_LAMP } from '../../../art/specials';
import { SYM_K, type MiniSpec } from './art';
import { CAR_K, Demo, MiniMap, MiniTrain, Tally, arcOf, coinKey, drive, flip, hop, lerpColor, makePath, setSize, type DemoKit, type Pt } from './kit';
import { hex, lerp } from './svg';

export type DemoKind = 'run' | 'signal' | 'security' | 'crash' | 'power' | 'boost' | 'max';

/* ------------------------------------------------------------------------------------------
 * Mini maps (demo units: the demo square is 1 x 1, centred on 0)
 * ---------------------------------------------------------------------------------------- */

const R2 = Math.SQRT2;

/** ALL ABOARD: one line, terminal to terminal, with a 45-degree leg in the middle (the real map's diagonals). */
const RUN_U = 0.2955;
const RUN_D = RUN_U / R2;
const RUN_Y = -0.07;
const RUN: MiniSpec = {
  id: 'run',
  S: RUN_U / 1.22,
  stations: [
    { x: -0.4, y: RUN_Y, kind: 'terminal' },
    { x: -0.4 + RUN_U, y: RUN_Y, kind: 'stop' },
    { x: -0.4 + RUN_U + RUN_D, y: RUN_Y + RUN_D, kind: 'stop' },
    { x: 0.4, y: RUN_Y + RUN_D, kind: 'terminal' },
  ],
  lines: [{ key: 'red', stops: [0, 1, 2, 3] }],
};

/** SIGNALS: the Gold and Green lines crossing at Grand Junction; the train comes in off the map. */
const SIG_V = 0.235;
const SIG_Y = 0.02;
const SIG_OUT = 2.7 * SIG_V;
const SIGNAL: MiniSpec = {
  id: 'signal',
  S: (SIG_V * R2) / 1.22,
  stations: [
    { x: SIG_V, y: SIG_Y - SIG_V, kind: 'stop' }, // 0 gold, north-east (the train comes in here)
    { x: 0, y: SIG_Y, kind: 'interchange' }, // 1 Grand Junction (Signal)
    { x: -SIG_V, y: SIG_Y + SIG_V, kind: 'stop' }, // 2 gold, south-west: the way not taken
    { x: -SIG_V, y: SIG_Y - SIG_V, kind: 'stop' }, // 3 green, north-west
    { x: SIG_V, y: SIG_Y + SIG_V, kind: 'stop' }, // 4 green, south-east (the train leaves this way)
  ],
  lines: [
    { key: 'gold', stops: [0, 1, 2], head: [SIG_OUT, SIG_Y - SIG_OUT], tail: [-SIG_OUT, SIG_Y + SIG_OUT] },
    { key: 'green', stops: [3, 1, 4], head: [-SIG_OUT, SIG_Y - SIG_OUT], tail: [SIG_OUT, SIG_Y + SIG_OUT] },
  ],
};

/** SECURITY CHECK: out of the terminal, one stop, the checkpoint, one more stop (room above for the verdict). */
const SEC_Y = 0.14;
const SECURITY: MiniSpec = {
  id: 'security',
  S: 0.26 / 1.2,
  stations: [-0.39, -0.13, 0.13, 0.39].map((x, i) => ({ x, y: SEC_Y, kind: i === 0 ? 'terminal' : 'stop' })),
  lines: [{ key: 'blue', stops: [0, 1, 2, 3], tail: [0.8, SEC_Y] }],
};

/** CRASH: two trains meet on the Green line, where the Gold line crosses it. */
const CR_Y = 0.05;
const CR_U = 0.3;
const CRASH: MiniSpec = {
  id: 'crash',
  S: CR_U / 1.22,
  stations: [
    { x: -CR_U, y: CR_Y, kind: 'stop' }, // 0
    { x: 0, y: CR_Y, kind: 'interchange' }, // 1 where they meet
    { x: CR_U, y: CR_Y, kind: 'stop' }, // 2
    { x: 0, y: CR_Y - CR_U, kind: 'stop' }, // 3 gold, north
    { x: 0, y: CR_Y + CR_U, kind: 'stop' }, // 4 gold, south
  ],
  lines: [
    { key: 'green', stops: [0, 1, 2], head: [-0.8, CR_Y], tail: [0.8, CR_Y] },
    { key: 'gold', stops: [3, 1, 4], head: [0, CR_Y - 0.8], tail: [0, CR_Y + 0.8] },
  ],
};

/** RUSH HOUR: a stretch of the Red line between tunnels, over the POWER meter. */
const PW_Y = -0.07;
const POWER: MiniSpec = {
  id: 'power',
  S: 0.24 / 1.2,
  stations: [-0.36, -0.12, 0.12, 0.36].map((x) => ({ x, y: PW_Y, kind: 'stop' as const })),
  lines: [{ key: 'red', stops: [0, 1, 2, 3], head: [-0.8, PW_Y], tail: [0.8, PW_Y] }],
};

/** EXPRESS PASS: the Gold line, terminal to terminal, beside the lever. */
const BOOST: MiniSpec = {
  id: 'boost',
  S: 0.24 / 1.22,
  stations: [-0.36, -0.12, 0.12, 0.36].map((y, i) => ({ x: 0.25, y, kind: i === 0 || i === 3 ? 'terminal' : 'stop' })),
  lines: [{ key: 'gold', stops: [0, 1, 2, 3] }],
};

export const MINI_SPECS: Partial<Record<DemoKind, MiniSpec>> = { run: RUN, signal: SIGNAL, security: SECURITY, crash: CRASH, power: POWER, boost: BOOST };

/* ------------------------------------------------------------------------------------------
 * Shared pieces
 * ---------------------------------------------------------------------------------------- */

const norm = (a: Pt, b: Pt) => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};
/** A point `k` station-units past `b`, coming from `a` (into the far tunnel). */
const past = (a: Pt, b: Pt, k: number) => {
  const u = norm(a, b);
  return { x: b.x + u.x * k, y: b.y + u.y * k };
};

/** Display lettering fitted to a width (scale down only); returns its resting scale. */
function fitted(d: DisplayText, maxW: number): number {
  const k = Math.min(1, maxW / Math.max(1, d.inkWidth));
  d.scale.set(k);
  return k;
}

abstract class MapDemo extends Demo {
  protected map: MiniMap;
  constructor(k: DemoKit, D: number, spec: MiniSpec) {
    super(k, D);
    this.map = new MiniMap(k, spec, D, this.view, this.labels);
  }
  protected P(i: number): Pt {
    return this.map.pts[i];
  }
  /** Global point of a station (for particles). */
  protected G(i: number) {
    return this.g(this.P(i));
  }
  /** A train path through stations (plus extra points), corners rounded. */
  protected path(stations: number[], extra: Pt[] = []) {
    return makePath([...stations.map((i) => this.P(i)), ...extra], this.map.S * 0.5);
  }
  /** The departure-board wave: every listed station flips onto its symbol, west to east. */
  protected wave(tl: gsap.core.Timeline, at: number, lands: [number, () => void][], stagger = 0.07, rattles = 2) {
    const order = [...lands].sort((a, b) => this.P(a[0]).x - this.P(b[0]).x || this.P(a[0]).y - this.P(b[0]).y);
    order.forEach(([i, land], n) =>
      flip(
        tl,
        this.map.faces[i],
        at + n * stagger,
        () => {
          this.map.faces[i].holder.alpha = 1;
          land();
        },
        rattles,
      ),
    );
  }
  /** A Locomotive's headlamp comes on (lit art inside a pop, a glint on the lamp). */
  protected lightLoco(tl: gsap.core.Timeline, i: number, at: number, golden = false) {
    const f = this.map.faces[i];
    tl.call(
      () => {
        f.set(golden ? ART.LOCO_GOLD : ART.LOCO, { pose: 'w' });
        const sz = this.map.S * SYM_K;
        const g = this.g({ x: f.home.x + ((LOCO_LAMP.x - 128) / 256) * sz, y: f.home.y + ((LOCO_LAMP.y - 128) / 256) * sz });
        this.k.fx.glint(g.x, g.y, 0.42);
      },
      [],
      at,
    );
    tl.fromTo(f.holder.scale, { x: 1.24, y: 1.24 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, at);
  }
  /** Run the train's nose to arc length `to` (from wherever the previous segment left it). */
  protected roll(tl: gsap.core.Timeline, tr: MiniTrain, from: number, to: number, dur: number, ease: string, at: number) {
    const o = { s: from };
    drive(tl, o, { s: from }, { s: to }, dur, ease, at, () => {
      tr.s = o.s;
      tr.place();
    });
  }
  /** Coin `i` hops into `tally` (over `tr`), which counts it up with a pop. */
  protected collect(tl: gsap.core.Timeline, i: number, tr: MiniTrain, tally: () => Tally, at: number) {
    const f = this.map.faces[i];
    hop(
      tl,
      f,
      () => tr.tallyAt,
      at,
      () => {
        const tt = tally();
        tt.set(tt.value + f.value);
        gsap.fromTo(tt.scale, { x: 1.32, y: 1.32 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
      },
      {
        onStart: () => {
          const g = this.G(i);
          this.k.fx.sparks(g.x, g.y, quality.low ? 3 : 7, 0.55);
          this.k.fx.glint(g.x, g.y, 0.36);
        },
      },
    );
  }
  /** A finished haul floats up off its train, swells with a glint, then fades. */
  protected cashIn(tl: gsap.core.Timeline, tally: () => Tally, at: number, to: Pt, hold = 0.8, value?: () => number) {
    const o = { u: 0 };
    let from: Pt = { x: 0, y: 0 };
    tl.call(
      () => {
        const tt = tally();
        gsap.killTweensOf(tt.scale);
        from = { x: tt.x, y: tt.y };
        if (value) tt.set(value(), 1);
      },
      [],
      at,
    );
    drive(tl, o, { u: 0 }, { u: 1 }, 0.5, 'back.out(1.6)', at, () => {
      const tt = tally();
      tt.position.set(lerp(from.x, to.x, Math.min(1, o.u)), lerp(from.y, to.y, o.u));
      tt.scale.set(1 + 0.4 * o.u);
      tt.alpha = 1;
    });
    tl.call(
      () => {
        const g = this.g(to);
        this.k.fx.glint(g.x + this.map.S * 0.4, g.y - this.map.S * 0.1, 0.5);
        this.k.fx.burst(g.x, g.y, quality.low ? 6 : 12, 'fire', 0.7);
        if (this.featured) this.k.react('loot');
      },
      [],
      at + 0.32,
    );
    const f = { a: 1 };
    drive(tl, f, { a: 1 }, { a: 0 }, 0.4, 'power1.in', at + 0.5 + hold, () => {
      const tt = tally();
      tt.alpha = f.a;
      tt.y = to.y - (1 - f.a) * this.map.S * 0.5;
    });
  }
  override update(dtMs: number) {
    this.map.update(dtMs, this.on);
  }
  override destroy() {
    this.map.destroy();
    super.destroy();
  }
}

/* ------------------------------------------------------------------------------------------
 * ALL ABOARD
 * ---------------------------------------------------------------------------------------- */

class RunDemo extends MapDemo {
  private train: MiniTrain;
  private tally: Tally;
  private coins: [number, number][] = [
    [1, 2],
    [2, 0.5],
    [3, 10],
  ];
  constructor(k: DemoKit, D: number) {
    super(k, D, RUN);
    const S = this.map.S;
    const tunnel = past(this.P(2), this.P(3), S * 1.35);
    this.train = new MiniTrain(this.map, k, this.path([0, 1, 2, 3], [tunnel]), 'red', this.labels);
    this.train.exit = S * 1.15;
    this.tally = new Tally(S, this.map.lineColor(0));
    this.tally.visible = false;
    this.settle();
    // (over the coin values)
    this.labels.addChild(this.tally);
    this.timeline();
  }
  private land(i: number) {
    const f = this.map.faces[i];
    if (i === 0) f.set(ART.LOCO);
    else {
      const v = this.coins.find((c) => c[0] === i)![1];
      f.set(coinKey(v), { value: v });
    }
  }
  protected override prime() {
    this.train.hide();
    this.train.tally = this.tally;
    this.tally.visible = false;
    this.map.unlight();
  }
  protected override settle() {
    this.prime();
    for (const f of this.map.faces) f.home0();
    this.map.faces.forEach((_, i) => this.land(i));
  }
  private timeline() {
    const tr = this.train;
    const f = this.map.faces;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => this.prime(), [], 0);
    this.wave(
      tl,
      0.32,
      f.map((_, i): [number, () => void] => [i, () => this.land(i)]),
      0.08,
    );
    this.lightLoco(tl, 0, 0.9);
    tl.call(
      () => {
        this.map.light(0, 0.8, 0.5);
        this.map.surge(0);
      },
      [],
      0.95,
    );
    // departure: the lamp comes up, the terminal's board dims as the train pulls out
    const t0 = 1.15;
    tl.call(
      () => {
        tr.s = 0;
        tr.place();
        gsap.to(tr.lamp, { alpha: 0.55, duration: 0.3 });
        gsap.to(f[0].holder, { alpha: 0.3, duration: 0.5, delay: 0.1 });
        if (this.featured) this.k.react('train');
      },
      [],
      t0,
    );
    const p = tr.path;
    const st = [1, 2, 3].map((i) => arcOf(p, this.P(i)));
    const beat = 0.5;
    this.roll(tl, tr, 0, st[0], beat * 2, 'power1.in', t0);
    this.roll(tl, tr, st[0], st[2], beat * 2, 'none', t0 + beat * 2);
    this.roll(tl, tr, st[2], p.length, 1.05, 'power1.out', t0 + beat * 4);
    tl.call(() => void gsap.to(tr.lamp, { alpha: 0, duration: 0.4 }), [], t0 + beat * 4 + 0.5);
    // every coin hops into the tally as the nose reaches its station
    this.coins.forEach(([i], n) => {
      const at = t0 + beat * (2 + n);
      if (n === 0)
        tl.call(
          () => {
            this.tally.visible = true;
            tr.showTally();
          },
          [],
          at,
        );
      this.collect(tl, i, tr, () => this.tally, at);
    });
    // the haul pulls in and is won
    const pay = t0 + beat * 4 + 0.6;
    tl.call(() => void (tr.tally = undefined), [], pay);
    this.cashIn(tl, () => this.tally, pay, { x: 0, y: -this.D * 0.33 }, 0.75);
    tl.call(() => this.map.light(0, 0, 0.6), [], pay + 0.3);
    tl.to({}, { duration: 0.01 }, pay + 1.75);
    this.tl = tl;
  }
}

/* ------------------------------------------------------------------------------------------
 * SIGNALS
 * ---------------------------------------------------------------------------------------- */

class SignalDemo extends MapDemo {
  private train: MiniTrain;
  private tally: Tally;
  private arc = new Graphics();
  private coins: [number, number][] = [
    [0, 2],
    [2, 5],
    [4, 10],
  ];
  constructor(k: DemoKit, D: number) {
    super(k, D, SIGNAL);
    const X = this.P(1);
    const v = SIG_V * D;
    // in off the map from the north-east, out to the south-east
    const path = makePath([{ x: X.x + v * 2.3, y: X.y - v * 2.3 }, this.P(0), X, this.P(4), { x: X.x + v * 2.6, y: X.y + v * 2.6 }], this.map.S * 0.55);
    this.train = new MiniTrain(this.map, k, path, 'gold', this.labels);
    this.tally = new Tally(this.map.S, this.map.lineColor(0));
    this.tally.visible = false;
    this.arc.blendMode = 'add';
    this.map.over.addChild(this.arc);
    this.settle();
    this.labels.addChild(this.tally);
    this.timeline();
  }
  private land(i: number) {
    const f = this.map.faces;
    if (i === 1) f[1].set(ART.SIGNAL);
    else if (i === 3) f[3].set(5);
    else {
      const c = this.coins.find((x) => x[0] === i);
      if (c) f[i].set(coinKey(c[1]), { value: c[1] });
    }
  }
  protected override prime() {
    this.train.hide();
    this.train.tally = this.tally;
    this.tally.visible = false;
    this.tally.setColor(this.map.lineColor(0));
    this.map.unlight();
    gsap.killTweensOf(this.arc);
    this.arc.alpha = 0;
  }
  protected override settle() {
    this.prime();
    for (const f of this.map.faces) f.home0();
    for (let i = 0; i < this.map.faces.length; i++) this.land(i);
  }
  /** The points: a bright arc from the old heading into the new one. */
  private drawArc() {
    const S = this.map.S;
    const c = this.P(1);
    const a = this.P(0);
    const b = this.P(4);
    const ax = lerp(c.x, a.x, 0.55);
    const ay = lerp(c.y, a.y, 0.55);
    const bx = lerp(c.x, b.x, 0.55);
    const by = lerp(c.y, b.y, 0.55);
    const col = this.map.lineColor(1);
    this.arc
      .clear()
      .moveTo(ax, ay)
      .quadraticCurveTo(c.x, c.y, bx, by)
      .stroke({ width: S * 0.26, color: col, alpha: 0.9, cap: 'round' })
      .moveTo(ax, ay)
      .quadraticCurveTo(c.x, c.y, bx, by)
      .stroke({ width: S * 0.09, color: 0xffffff, alpha: 0.95, cap: 'round' });
  }
  private timeline() {
    const tr = this.train;
    const f = this.map.faces;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => this.prime(), [], 0);
    this.wave(
      tl,
      0.3,
      f.map((_, i): [number, () => void] => [i, () => this.land(i)]),
      0.07,
    );
    // the train comes in on the Gold line, cruising
    const t0 = 0.95;
    tl.call(
      () => {
        tr.s = 0;
        tr.place();
        tr.lamp.alpha = 0.55;
        this.map.light(0, 0.8, 0.5);
        this.map.surge(0);
      },
      [],
      t0,
    );
    const p = tr.path;
    const [s0, sx, s4] = [0, 1, 4].map((i) => arcOf(p, this.P(i)));
    const beat = 0.5;
    const unit = sx - s0;
    const inDur = (s0 / unit) * beat;
    this.roll(tl, tr, 0, s0, inDur, 'none', t0);
    const tc = t0 + inDur;
    tl.call(
      () => {
        this.tally.visible = true;
        tr.showTally();
      },
      [],
      tc,
    );
    this.collect(tl, 0, tr, () => this.tally, tc);
    // into the junction, easing down: the Signal throws
    this.roll(tl, tr, s0, sx, beat * 1.5, 'power2.out', tc);
    const thrown = tc + beat * 1.5;
    tl.call(
      () => {
        f[1].set(ART.SIGNAL, { pose: 'w' });
        const g = this.G(1);
        this.k.fx.glint(g.x - this.map.S * 0.12, g.y - this.map.S * 0.18, 0.4);
        if (this.featured) this.k.react('signal');
      },
      [],
      thrown,
    );
    tl.fromTo(f[1].holder.scale, { x: 1.38, y: 1.38 }, { x: 1, y: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)', immediateRender: false }, thrown);
    // the points swing: the arc flashes, the Gold line goes dark and the Green line lights
    const pts = thrown + 0.18;
    tl.call(
      () => {
        this.drawArc();
        const g = this.G(1);
        this.k.fx.sparks(g.x, g.y, quality.low ? 4 : 10, 0.7);
        this.map.light(0, 0.12, 0.4);
        this.map.light(1, 0.85, 0.3);
        this.map.surge(1);
        this.tally.setColor(this.map.lineColor(1));
      },
      [],
      pts,
    );
    const a = { v: 0 };
    drive(tl, a, { v: 0 }, { v: 1 }, 0.08, 'none', pts, () => void (this.arc.alpha = a.v));
    const a2 = { v: 1 };
    drive(tl, a2, { v: 1 }, { v: 0 }, 0.6, 'power2.in', pts + 0.45, () => void (this.arc.alpha = a2.v));
    // and the train swings onto the crossing line
    const t1 = pts + 0.26;
    this.roll(tl, tr, sx, s4, beat * 1.6, 'power1.in', t1);
    this.collect(tl, 4, tr, () => this.tally, t1 + beat * 1.6);
    const outDur = ((p.length - s4) / unit) * beat;
    this.roll(tl, tr, s4, p.length, outDur, 'none', t1 + beat * 1.6);
    const pay = t1 + beat * 1.6 + 0.5;
    tl.call(() => void (tr.tally = undefined), [], pay);
    this.cashIn(tl, () => this.tally, pay, { x: -this.D * 0.28, y: this.P(1).y }, 0.75);
    tl.call(() => this.map.light(1, 0, 0.6), [], pay + 0.3);
    tl.to({}, { duration: 0.01 }, Math.max(pay + 1.75, t1 + beat * 1.6 + outDur));
    this.tl = tl;
  }
}

/* ------------------------------------------------------------------------------------------
 * SECURITY CHECK
 * ---------------------------------------------------------------------------------------- */

class SecurityDemo extends MapDemo {
  private train: MiniTrain;
  private tally: Tally;
  private strobe = new Sprite(softDotTexture());
  private ring = new Graphics();
  private clear: DisplayText;
  private incident: DisplayText;
  private repay: DisplayText;
  private missed: DisplayText;
  private kStamp = { clear: 1, incident: 1, repay: 1, missed: 1 };
  /** This loop's verdict: they alternate (ALL CLEAR first). */
  private mode: 'clear' | 'incident' = 'incident';
  private sub?: gsap.core.Timeline;
  private coins: [number, number][] = [
    [1, 2],
    [3, 5],
  ];
  constructor(k: DemoKit, D: number) {
    super(k, D, SECURITY);
    const S = this.map.S;
    this.train = new MiniTrain(this.map, k, this.path([0, 1, 2, 3], [{ x: D * 0.85, y: this.P(3).y }]), 'blue', this.labels);
    this.tally = new Tally(S, this.map.lineColor(0));
    this.tally.visible = false;
    this.strobe.anchor.set(0.5);
    this.strobe.blendMode = 'add';
    this.strobe.width = this.strobe.height = S * 3.2;
    const c = this.P(2);
    this.strobe.position.set(c.x, c.y - S * 0.32);
    this.strobe.alpha = 0;
    this.ring.blendMode = 'add';
    this.map.under.addChild(this.strobe);
    this.map.over.addChild(this.ring);
    // the verdicts
    const res = k.res;
    this.clear = displayText(t('allClear'), { size: D * 0.14, tone: 'green', treatment: 'banner', res });
    this.incident = displayText(t('incident'), { size: D * 0.14, tone: 'crimson', treatment: 'banner', res });
    this.repay = displayText(t('delayRepay'), { size: D * 0.08, tone: 'gold', treatment: 'label', res });
    this.missed = displayText(t('missed'), { size: S * 0.32, tone: 'crimson', treatment: 'label', res });
    this.kStamp.clear = fitted(this.clear, D * 0.9);
    this.kStamp.incident = fitted(this.incident, D * 0.9);
    this.kStamp.repay = fitted(this.repay, D * 0.84);
    this.kStamp.missed = fitted(this.missed, S * 1.25);
    const s3 = this.P(3);
    this.missed.position.set(s3.x - S * 0.05, s3.y - S * 0.78);
    for (const d of [this.clear, this.incident]) d.position.set(0, -D * 0.27);
    this.repay.position.set(0, -D * 0.135);
    this.settle();
    this.labels.addChild(this.tally, this.clear, this.incident, this.repay, this.missed);
    this.timeline();
  }
  private land(i: number) {
    const f = this.map.faces[i];
    if (i === 0) f.set(ART.LOCO);
    else if (i === 2) f.set(ART.SECURITY);
    else {
      const v = this.coins.find((x) => x[0] === i)![1];
      f.set(coinKey(v), { value: v });
    }
  }
  private hideWords() {
    for (const d of [this.clear, this.incident, this.repay, this.missed]) {
      gsap.killTweensOf(d);
      gsap.killTweensOf(d.scale);
      d.visible = false;
      d.alpha = 1;
    }
    this.clear.y = this.incident.y = -this.D * 0.27;
    this.repay.y = -this.D * 0.135;
    this.missed.y = this.P(3).y - this.map.S * 0.78;
  }
  protected override prime() {
    this.sub?.kill();
    this.sub = undefined;
    this.train.hide();
    this.train.tally = this.tally;
    this.tally.visible = false;
    this.map.unlight();
    this.hideWords();
    gsap.killTweensOf(this.strobe);
    this.strobe.alpha = 0;
    this.ring.clear();
    for (const f of this.map.faces) f.holder.rotation = 0;
  }
  protected override settle() {
    this.prime();
    for (const f of this.map.faces) f.home0();
    this.map.faces.forEach((_, i) => this.land(i));
  }
  override freeze() {
    super.freeze();
    this.sub?.pause();
  }
  override destroy() {
    this.sub?.kill();
    super.destroy();
  }
  /** A word slams down onto the board (big, turned, then home). */
  private slam(tl: gsap.core.Timeline, d: DisplayText, k: number, at: number, rot: number) {
    tl.call(
      () => {
        d.visible = true;
        d.alpha = 1;
        d.rotation = rot;
      },
      [],
      at,
    );
    tl.fromTo(d.scale, { x: k * 2.3, y: k * 2.3 }, { x: k, y: k, duration: 0.18, ease: 'power3.in', immediateRender: false }, at);
  }
  private timeline() {
    const tr = this.train;
    const f = this.map.faces;
    const S = this.map.S;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(
      () => {
        this.prime();
        this.mode = this.mode === 'clear' ? 'incident' : 'clear';
      },
      [],
      0,
    );
    this.wave(
      tl,
      0.3,
      f.map((_, i): [number, () => void] => [i, () => this.land(i)]),
      0.08,
    );
    this.lightLoco(tl, 0, 0.8);
    tl.call(
      () => {
        this.map.light(0, 0.8, 0.5);
        this.map.surge(0);
      },
      [],
      0.85,
    );
    const t0 = 1.05;
    tl.call(
      () => {
        tr.s = 0;
        tr.place();
        gsap.to(tr.lamp, { alpha: 0.55, duration: 0.3 });
        gsap.to(f[0].holder, { alpha: 0.3, duration: 0.5, delay: 0.1 });
      },
      [],
      t0,
    );
    const p = tr.path;
    const [s1, s2] = [1, 2].map((i) => arcOf(p, this.P(i)));
    const beat = 0.5;
    this.roll(tl, tr, 0, s1, beat * 2, 'power1.in', t0);
    tl.call(
      () => {
        this.tally.visible = true;
        tr.showTally();
      },
      [],
      t0 + beat * 2,
    );
    this.collect(tl, 1, tr, () => this.tally, t0 + beat * 2);
    // into the checkpoint: stopped
    const t1 = t0 + beat * 2;
    this.roll(tl, tr, s1, s2, beat * 1.3, 'power2.out', t1);
    const alarm = t1 + beat * 1.3;
    // the alarm: the beacon strobes, the scanner sweeps the train twice, the checkpoint thumps
    tl.call(
      () => {
        this.strobe.tint = 0xffb43c;
        f[2].holder.parent?.addChild(f[2].holder);
        if (this.featured) this.k.react('train');
      },
      [],
      alarm,
    );
    const sb = { a: 0 };
    tl.fromTo(sb, { a: 0 }, { a: 0.9, duration: 0.09, yoyo: true, repeat: 7, ease: 'sine.inOut', immediateRender: false, onUpdate: () => void (this.strobe.alpha = sb.a) }, alarm);
    const scan = { u: 0 };
    drive(tl, scan, { u: 0 }, { u: 2 }, 0.84, 'none', alarm, () => {
      const fr = scan.u >= 2 ? 1 : scan.u % 1;
      const h = tr.head;
      this.ring
        .clear()
        .circle(h.x, h.y, S * (0.3 + fr * 0.95))
        .stroke({ width: Math.max(1.5, S * 0.07), color: 0x6ff0ff, alpha: 0.9 * (1 - fr) });
    });
    for (const d of [0.12, 0.5]) tl.fromTo(f[2].holder.scale, { x: 1.18, y: 1.18 }, { x: 1, y: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, alarm + d);
    // the verdict (alternates loop to loop)
    const verdict = alarm + 0.9;
    tl.call(() => this.verdict(), [], verdict);
    tl.to({}, { duration: 0.01 }, verdict + 3.9);
    this.tl = tl;
  }
  private verdict() {
    this.ring.clear();
    const tr = this.train;
    const f = this.map.faces;
    const S = this.map.S;
    const D = this.D;
    const tl = gsap.timeline();
    this.sub = tl;
    const hit = 0.18;
    const g = this.G(2);
    if (this.mode === 'clear') {
      this.slam(tl, this.clear, this.kStamp.clear, 0, -0.07);
      tl.call(
        () => {
          f[2].set(ART.SECURITY, { pose: 'w' });
          this.strobe.tint = 0x5dff9a;
          this.k.fx.burst(g.x, g.y, quality.low ? 6 : 14, 'green', 0.8);
          this.shake(0.5);
          // Delay Repay: the haul is worth x2
          this.tally.set(this.tally.value, REPAY_MULT);
          if (this.featured) this.k.react('clear');
        },
        [],
        hit,
      );
      tl.fromTo(f[2].holder.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, hit);
      tl.fromTo(this.strobe, { alpha: 0.95 }, { alpha: 0, duration: 0.6, immediateRender: false }, hit);
      tl.fromTo(this.tally.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.42, ease: 'back.out(3)', immediateRender: false }, hit);
      tl.call(() => void (this.repay.visible = true), [], hit + 0.12);
      tl.fromTo(this.repay, { alpha: 0, y: -D * 0.09 }, { alpha: 1, y: -D * 0.135, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, hit + 0.12);
      tl.fromTo(this.repay.scale, { x: this.kStamp.repay * 0.6, y: this.kStamp.repay * 0.6 }, { x: this.kStamp.repay, y: this.kStamp.repay, duration: 0.3, ease: 'back.out(2.5)', immediateRender: false }, hit + 0.12);
      // the train waits a beat, then carries on with its haul doubled
      const p = tr.path;
      const [s2, s3] = [2, 3].map((i) => arcOf(p, this.P(i)));
      const beat = 0.5;
      const go = hit + 0.7;
      this.roll(tl, tr, s2, s3, beat * 1.6, 'power1.in', go);
      this.collect(tl, 3, tr, () => this.tally, go + beat * 1.6);
      this.roll(tl, tr, s3, p.length, ((p.length - s3) / (s3 - s2)) * beat, 'none', go + beat * 1.6);
      for (const d of [this.clear, this.repay]) tl.to(d, { alpha: 0, y: d.y - S * 0.3, duration: 0.35, ease: 'power1.in' }, go + 0.5);
      const pay = go + beat * 1.6 + 0.48;
      tl.call(() => void (tr.tally = undefined), [], pay);
      this.cashIn(tl, () => this.tally, pay, { x: D * 0.08, y: -D * 0.2 }, 0.75, () => this.tally.value * REPAY_MULT);
      tl.call(() => this.map.light(0, 0, 0.6), [], pay + 0.3);
    } else {
      this.slam(tl, this.incident, this.kStamp.incident, 0, 0.07);
      tl.call(
        () => {
          f[2].set(ART.SECURITY, { texture: this.k.art.incident });
          this.strobe.tint = 0xff3b30;
          this.shake(0.7);
          tr.lamp.alpha = 0;
          this.map.light(0, 0.05, 0.5);
          if (this.featured) this.k.react('incident');
        },
        [],
        hit,
      );
      tl.fromTo(f[2].holder.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, hit);
      tl.fromTo(this.strobe, { alpha: 1 }, { alpha: 0, duration: 0.9, ease: 'power1.in', immediateRender: false }, hit);
      // the train is held: it greys out where it stands
      const gr = { v: 0 };
      tl.fromTo(
        gr,
        { v: 0 },
        {
          v: 1,
          duration: 0.45,
          immediateRender: false,
          onUpdate: () => {
            tr.grey = gr.v;
            tr.dim = 1 - gr.v * 0.35;
            tr.place();
          },
        },
        hit,
      );
      // the stop it will now miss
      const m = this.missed;
      const at = hit + 0.3;
      const fc = f[3];
      tl.call(
        () => {
          m.visible = true;
          m.alpha = 1;
          m.rotation = -0.12;
          const q = this.g({ x: m.x, y: m.y });
          this.k.fx.sparks(q.x, q.y, quality.low ? 2 : 6, 0.45);
        },
        [],
        at,
      );
      tl.fromTo(m.scale, { x: this.kStamp.missed * 1.8, y: this.kStamp.missed * 1.8 }, { x: this.kStamp.missed, y: this.kStamp.missed, duration: 0.15, ease: 'power3.in', immediateRender: false }, at);
      const dim = { b: 1 };
      tl.fromTo(dim, { b: 1 }, { b: 0.45, duration: 0.35, immediateRender: false, onUpdate: () => fc.setBright(dim.b) }, at + 0.12);
      tl.fromTo(fc.holder, { rotation: -0.16 }, { rotation: 0, duration: 0.55, ease: 'elastic.out(1.2, 0.3)', immediateRender: false }, at + 0.12);
      // the held train keeps what it carried; then the words lift and the board settles
      const end = hit + 1.45;
      tl.call(() => void (tr.tally = undefined), [], end);
      this.cashIn(tl, () => this.tally, end, { x: tr.tallyAt.x, y: -D * 0.04 }, 0.4);
      for (const d of [this.incident, m]) tl.to(d, { alpha: 0, y: d.y - S * 0.3, duration: 0.35, ease: 'power1.in' }, end + 0.55);
      const fade = { a: 1 };
      drive(tl, fade, { a: 1 }, { a: 0 }, 0.45, 'power1.in', end + 0.95, () => {
        tr.dim = 0.65 * fade.a;
        tr.place();
      });
      const un = { b: 0.45 };
      drive(tl, un, { b: 0.45 }, { b: 1 }, 0.4, 'power1.out', end + 0.95, () => fc.setBright(un.b));
    }
  }
}

/* ------------------------------------------------------------------------------------------
 * CRASH
 * ---------------------------------------------------------------------------------------- */

class CrashDemo extends MapDemo {
  private a: MiniTrain;
  private b: MiniTrain;
  private ta: Tally;
  private tb: Tally;
  private pile: Tally;
  private boom = new Sprite();
  private flash = new Sprite(softDotTexture());
  private shock = new Graphics();
  private scorch = new Sprite(softDotTexture());
  private word: DisplayText;
  private kWord = 1;
  private x2: BitmapText;
  private kx2 = 1;
  private fling: { vx: number; vy: number; spin: number; x0: number; y0: number; r0: number }[] = [];
  private coins: [number, number][] = [
    [0, 2],
    [2, 1],
    [1, 3],
    [3, 5],
    [4, 0.5],
  ];
  constructor(k: DemoKit, D: number) {
    super(k, D, CRASH);
    const S = this.map.S;
    const X = this.P(1);
    // they come in off the map from both ends and meet in the junction, each nose short of its centre
    this.a = new MiniTrain(this.map, k, makePath([{ x: -D * 0.66, y: X.y }, this.P(0), { x: X.x - S * 0.1, y: X.y }], 0), 'green', this.labels);
    this.b = new MiniTrain(this.map, k, makePath([{ x: D * 0.66, y: X.y }, this.P(2), { x: X.x + S * 0.1, y: X.y }], 0), 'green', this.labels);
    const col = this.map.lineColor(0);
    this.ta = new Tally(S, col);
    this.tb = new Tally(S, col);
    this.pile = new Tally(S * 1.15, hex(C.fire));
    this.boom.texture = k.art.boom;
    this.boom.anchor.set(0.5);
    this.boom.visible = false;
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.width = this.flash.height = S * 5;
    this.flash.position.set(X.x, X.y);
    this.flash.alpha = 0;
    this.shock.blendMode = 'add';
    this.scorch.anchor.set(0.5);
    this.scorch.tint = 0x000000;
    this.scorch.width = S * 1.9;
    this.scorch.height = S * 1.35;
    this.scorch.position.set(X.x, X.y);
    this.scorch.alpha = 0;
    this.map.under.addChild(this.scorch);
    this.map.over.addChild(this.flash, this.shock);
    this.word = displayText(t('crashCaps'), { size: D * 0.2, tone: 'fire', treatment: 'banner', res: k.res });
    this.kWord = fitted(this.word, D * 0.86);
    this.word.position.set(X.x, X.y - S * 0.15);
    this.word.visible = false;
    this.x2 = bitmapNum(`x${CRASH_MULT}`, 'fire', S * 0.95);
    this.kx2 = this.x2.scale.x;
    this.x2.visible = false;
    this.settle();
    // the cloud over the coin values, under the words and numbers
    this.labels.addChild(this.boom, this.ta, this.tb, this.pile, this.word, this.x2);
    this.timeline();
  }
  private land(i: number) {
    const v = this.coins.find((c) => c[0] === i)![1];
    this.map.faces[i].set(coinKey(v), { value: v });
  }
  protected override prime() {
    for (const tr of [this.a, this.b]) tr.hide();
    this.a.tally = this.ta;
    this.b.tally = this.tb;
    for (const x of [this.ta, this.tb, this.pile]) {
      gsap.killTweensOf(x);
      gsap.killTweensOf(x.scale);
      x.visible = false;
      x.alpha = 1;
      x.set(0, 1);
    }
    this.map.unlight();
    for (const o of [this.boom, this.word, this.x2]) {
      gsap.killTweensOf(o);
      gsap.killTweensOf(o.scale);
      o.visible = false;
      o.alpha = 1;
    }
    this.flash.alpha = 0;
    this.shock.clear();
    gsap.killTweensOf(this.scorch);
    this.scorch.alpha = 0;
  }
  protected override settle() {
    this.prime();
    for (const f of this.map.faces) f.home0();
    this.map.faces.forEach((_, i) => this.land(i));
  }
  private timeline() {
    const f = this.map.faces;
    const S = this.map.S;
    const X = this.P(1);
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => this.prime(), [], 0);
    this.wave(
      tl,
      0.3,
      f.map((_, i): [number, () => void] => [i, () => this.land(i)]),
      0.07,
    );
    const t0 = 0.9;
    const beat = 0.5;
    tl.call(
      () => {
        this.map.light(0, 0.8, 0.5);
        this.map.surge(0);
      },
      [],
      t0,
    );
    let meet = 0;
    for (const [tr, ti, tally] of [
      [this.a, 0, this.ta],
      [this.b, 2, this.tb],
    ] as const) {
      tl.call(
        () => {
          tr.s = 0;
          tr.place();
          tr.lamp.alpha = 0.55;
        },
        [],
        t0,
      );
      const s1 = arcOf(tr.path, this.P(ti));
      const inDur = (s1 / (CR_U * this.D)) * beat;
      this.roll(tl, tr, 0, s1, inDur, 'none', t0);
      tl.call(
        () => {
          tally.visible = true;
          tr.showTally();
        },
        [],
        t0 + inDur,
      );
      this.collect(tl, ti, tr, () => tally, t0 + inDur);
      // closing: they run at each other, faster and faster, sparks off the rails
      const o = { s: s1 };
      meet = t0 + inDur + 0.62;
      drive(tl, o, { s: s1 }, { s: tr.path.length }, 0.62, 'power1.in', t0 + inDur, () => {
        tr.s = o.s;
        tr.place();
        if (!quality.low && Math.random() < 0.3) {
          const g = this.g(tr.head);
          this.k.fx.sparks(g.x, g.y + S * 0.15, 1, 0.45);
        }
      });
    }
    const impact = meet;
    tl.call(() => this.impact(), [], impact);
    // the cars fly apart, spinning and scorched
    const fl = { u: 0 };
    drive(tl, fl, { u: 0 }, { u: 1 }, 0.9, 'power3.out', impact, () => {
      const cars = [...this.a.cars, ...this.b.cars];
      cars.forEach((c, n) => {
        const w = this.fling[n];
        if (!w) return;
        c.position.set(w.x0 + w.vx * fl.u, w.y0 + w.vy * fl.u);
        c.rotation = w.r0 + w.spin * fl.u;
        const hopK = 1 + Math.sin(Math.min(1, fl.u * 1.6) * Math.PI) * 0.25;
        c.width = S * CAR_K * hopK;
        c.height = S * CAR_K * (96 / 240) * hopK;
        c.tint = lerpColor(0xffd2a0, 0x5a3d2e, Math.min(1, fl.u * 1.5));
        if (!quality.low && Math.random() < 0.12) {
          const g = this.g(c.position);
          this.k.fx.smoke(g.x, g.y, 1, 0.3, 0x4a4440);
        }
      });
    });
    const cf = { a: 1 };
    drive(tl, cf, { a: 1 }, { a: 0 }, 0.4, 'power1.in', impact + 1.0, () => {
      for (const c of [...this.a.cars, ...this.b.cars]) c.alpha = cf.a;
    });
    // the cloud punches out, wobbles, holds, then breaks into smoke
    const kb = (S * 2.7) / Math.max(1, this.k.art.boom.width);
    tl.call(
      () => {
        this.boom.visible = true;
        this.boom.alpha = 1;
        this.boom.rotation = (Math.random() - 0.5) * 0.4;
        this.boom.position.set(X.x, X.y);
      },
      [],
      impact,
    );
    tl.fromTo(this.boom.scale, { x: kb * 0.15, y: kb * 0.15 }, { x: kb * 1.2, y: kb * 1.2, duration: 0.12, ease: 'power3.out', immediateRender: false }, impact);
    tl.fromTo(this.boom.scale, { x: kb * 1.2, y: kb * 1.2 }, { x: kb, y: kb, duration: 0.24, ease: 'sine.inOut', immediateRender: false }, impact + 0.12);
    tl.fromTo(this.boom.scale, { x: kb, y: kb }, { x: kb * 1.3, y: kb * 1.3, duration: 0.35, ease: 'power1.in', immediateRender: false }, impact + 0.95);
    tl.fromTo(this.boom, { alpha: 1 }, { alpha: 0, duration: 0.35, ease: 'power1.in', immediateRender: false }, impact + 0.95);
    tl.call(
      () => {
        const g = this.g(X);
        this.k.fx.smoke(g.x, g.y, quality.low ? 4 : 8, 1.1);
      },
      [],
      impact + 0.95,
    );
    // CRASH!
    tl.call(
      () => {
        this.word.visible = true;
        this.word.alpha = 1;
        this.word.rotation = -0.1;
        this.word.y = X.y - S * 0.15;
      },
      [],
      impact,
    );
    tl.fromTo(this.word.scale, { x: this.kWord * 2.6, y: this.kWord * 2.6 }, { x: this.kWord, y: this.kWord, duration: 0.16, ease: 'power4.in', immediateRender: false }, impact);
    tl.fromTo(this.word, { rotation: -0.1 }, { rotation: 0.04, duration: 0.6, ease: 'elastic.out(1, 0.35)', immediateRender: false }, impact + 0.16);
    tl.fromTo(this.word, { y: X.y - S * 0.15, alpha: 1 }, { y: X.y - S * 1.4, alpha: 0, duration: 0.4, ease: 'power2.in', immediateRender: false }, impact + 1.05);
    // the pile: both hauls pour in, then every coin at and around the crash
    const pileAt = { x: X.x, y: X.y + S * 0.1 };
    const pt = impact + 0.62;
    tl.call(
      () => {
        this.pile.visible = true;
        this.pile.position.set(pileAt.x, pileAt.y);
        this.pile.set(0, 1);
      },
      [],
      pt,
    );
    tl.fromTo(this.pile.scale, { x: 0, y: 0 }, { x: 1.1, y: 1.1, duration: 0.25, ease: 'back.out(2)', immediateRender: false }, pt);
    const add = (v: number) => {
      this.pile.set(this.pile.value + v, 1);
      gsap.fromTo(this.pile.scale, { x: 1.32, y: 1.32 }, { x: 1.1, y: 1.1, duration: 0.22, ease: 'back.out(3)' });
    };
    [this.ta, this.tb].forEach((tt, n) => {
      const o = { u: 0 };
      let from: Pt = { x: 0, y: 0 };
      tl.call(() => void (from = { x: tt.x, y: tt.y }), [], pt + 0.1 + n * 0.06);
      drive(tl, o, { u: 0 }, { u: 1 }, 0.32, 'power2.in', pt + 0.1 + n * 0.06, () => {
        tt.position.set(lerp(from.x, pileAt.x, o.u), lerp(from.y, pileAt.y, o.u));
        tt.scale.set(lerp(1, 0.5, o.u));
      });
      tl.call(
        () => {
          tt.visible = false;
          add(tt.value);
        },
        [],
        pt + 0.42 + n * 0.06,
      );
    });
    // the wreck sweeps in every coin at and around the crash
    [1, 3, 4].forEach((i, n) => {
      const at = pt + 0.45 + n * 0.09;
      hop(
        tl,
        f[i],
        () => pileAt,
        at,
        () => add(this.coins.find((c) => c[0] === i)![1]),
        { dur: 0.42, lift: 1.0, spin: 6, k1: 0.3 },
      );
    });
    // the x2 slams onto the pile
    const xs = pt + 1.25;
    const x2 = this.x2;
    const from = { x: pileAt.x + S * 1.5, y: pileAt.y - S * 1.25 };
    tl.call(
      () => {
        x2.visible = true;
        x2.position.set(from.x, from.y);
        x2.rotation = 0.15;
      },
      [],
      xs,
    );
    tl.fromTo(x2.scale, { x: 0, y: 0 }, { x: this.kx2, y: this.kx2, duration: 0.16, ease: 'back.out(3)', immediateRender: false }, xs);
    tl.fromTo(x2, { x: from.x, y: from.y, rotation: 0.15 }, { x: pileAt.x, y: pileAt.y, rotation: 0, duration: 0.22, ease: 'power3.in', immediateRender: false }, xs + 0.24);
    tl.fromTo(x2.scale, { x: this.kx2, y: this.kx2 }, { x: this.kx2 * 0.8, y: this.kx2 * 1.25, duration: 0.12, ease: 'power2.in', immediateRender: false }, xs + 0.34);
    const slam = xs + 0.46;
    tl.call(
      () => {
        x2.visible = false;
        const total = this.coins.reduce((a, c) => a + c[1], 0);
        this.pile.set(total * CRASH_MULT, 1);
        const g = this.g(pileAt);
        this.k.fx.burst(g.x, g.y, quality.low ? 8 : 16, 'fire', 0.9);
        this.k.fx.glint(g.x + S * 0.5, g.y - S * 0.2, 0.45);
        this.shake(0.7);
        if (this.featured) this.k.react('loot');
      },
      [],
      slam,
    );
    tl.fromTo(this.pile.scale, { x: 1.75, y: 1.75 }, { x: 1.15, y: 1.15, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, slam);
    const pf = { a: 1 };
    drive(tl, pf, { a: 1 }, { a: 0 }, 0.4, 'power1.in', slam + 1.0, () => {
      this.pile.alpha = pf.a;
      this.pile.y = pileAt.y - (1 - pf.a) * S * 0.6;
    });
    tl.to(this.scorch, { alpha: 0, duration: 0.5 }, slam + 1.0);
    tl.call(() => this.map.light(0, 0, 0.6), [], slam + 0.8);
    tl.to({}, { duration: 0.01 }, slam + 1.6);
    this.tl = tl;
  }
  /** Both trains meet: white flash, shock ring, sparks, debris; the cars are flung. */
  private impact() {
    const S = this.map.S;
    const X = this.P(1);
    const g = this.g(X);
    const fx = this.k.fx;
    if (!speed.reduced) {
      this.flash.alpha = 1;
      gsap.to(this.flash, { alpha: 0, duration: 0.45, ease: 'power2.out' });
    }
    const rr = { r: S * 0.3, a: 1 };
    gsap.to(rr, {
      r: S * 2.6,
      a: 0,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => void this.shock.clear().circle(X.x, X.y, rr.r).stroke({ width: S * 0.14 * rr.a + 1, color: 0xfff1c8, alpha: rr.a }),
      onComplete: () => void this.shock.clear(),
    });
    fx.burst(g.x, g.y, quality.low ? 10 : 24, 'fire', 1.2);
    fx.sparks(g.x, g.y, quality.low ? 8 : 20, 1.2);
    fx.debris(g.x, g.y, quality.low ? 4 : 9, 1);
    gsap.to(this.scorch, { alpha: 0.6, duration: 0.3 });
    this.shake(1.6, 0.45);
    for (const tr of [this.a, this.b]) {
      tr.wrecked = true;
      gsap.to(tr.lamp, { alpha: 0, duration: 0.1 });
    }
    this.fling = [...this.a.cars, ...this.b.cars].map((c) => {
      const dx = c.x - X.x + (Math.random() - 0.5) * S * 0.3;
      const dy = c.y - X.y + (Math.random() - 0.5) * S * 0.6 - S * 0.15;
      const d = Math.hypot(dx, dy) || 1;
      const sp = S * (0.7 + Math.random() * 0.4);
      return { vx: (dx / d) * sp, vy: (dy / d) * sp, spin: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.1), x0: c.x, y0: c.y, r0: c.rotation };
    });
    if (this.featured) this.k.react('crash');
  }
}

/* ------------------------------------------------------------------------------------------
 * RUSH HOUR
 * ---------------------------------------------------------------------------------------- */

class PowerDemo extends MapDemo {
  private train: MiniTrain;
  private track = new Graphics();
  private stops: { x: number; g: Graphics }[] = [];
  private stopLabels: BitmapText[] = [];
  private loco = new Sprite();
  private big: BitmapText;
  private bigK = 1;
  private meter = { p: 0 };
  private x0: number;
  private x1: number;
  private ty: number;
  /** Coins that stay (sticky) and the ones the second spin lands; the symbols the first spin shows. */
  private sticky: [number, number][] = [
    [0, 1],
    [2, 2],
  ];
  private fresh: [number, number][] = [
    [1, 5],
    [3, 0.5],
  ];
  private first: Record<number, number> = { 1: 6, 3: 2 };
  constructor(k: DemoKit, D: number) {
    super(k, D, POWER);
    const S = this.map.S;
    this.x0 = -D * 0.4;
    this.x1 = D * 0.4;
    this.ty = D * 0.31;
    const y = this.P(0).y;
    this.train = new MiniTrain(this.map, k, makePath([{ x: -D * 0.68, y }, ...[0, 1, 2, 3].map((i) => this.P(i)), { x: D * 0.72, y }], 0), 'red', this.labels);
    void S;
    this.view.addChild(this.track);
    POWER_STEPS.forEach((need, i) => {
      const x = this.x0 + (this.x1 - this.x0) * (need / POWER_STEPS[POWER_STEPS.length - 1]);
      const g = new Graphics();
      g.position.set(x, this.ty - D * 0.11);
      this.view.addChild(g);
      const lab = bitmapNum(`x${POWER_MULTS[i + 1]}`, 'white', D * 0.068);
      lab.position.set(x, this.ty - D * 0.11);
      this.labels.addChild(lab);
      this.stopLabels.push(lab);
      this.stops.push({ x, g });
    });
    this.loco.texture = k.art.side;
    this.loco.anchor.set(0.9, 0.85);
    this.loco.height = D * 0.1;
    this.loco.scale.x = this.loco.scale.y;
    this.view.addChild(this.loco);
    this.big = bitmapNum('x1', 'gold', D * 0.2);
    this.bigK = this.big.scale.x;
    this.big.position.set(0, -D * 0.33);
    this.labels.addChild(this.big);
    this.settle();
    this.timeline();
  }
  private drawTrack(lit: number) {
    const D = this.D;
    const g = this.track;
    const y = this.ty;
    g.clear();
    g.roundRect(this.x0 - D * 0.04, y - D * 0.028, this.x1 - this.x0 + D * 0.08, D * 0.056, D * 0.02).fill({ color: hex(C.ironDeep) }).stroke({ width: Math.max(1.5, D * 0.008), color: hex(C.ink) });
    g.rect(this.x0, y - D * 0.012, this.x1 - this.x0, D * 0.007).fill({ color: hex(C.steel) });
    g.rect(this.x0, y + D * 0.006, this.x1 - this.x0, D * 0.007).fill({ color: hex(C.steel) });
    if (lit > this.x0) g.rect(this.x0, y - D * 0.015, lit - this.x0, D * 0.03).fill({ color: hex(C.volt), alpha: 0.85 });
  }
  private drawStop(i: number, on: boolean) {
    const s = this.stops[i];
    const r = this.D * 0.06;
    s.g.clear();
    s.g.circle(0, 0, r).fill({ color: hex(on ? C.gold : C.steelDeep) }).stroke({ width: Math.max(1.5, this.D * 0.012), color: hex(C.ink) });
    s.g.circle(0, 0, r * 0.76).fill({ color: hex(on ? C.emerald : C.iron) });
    this.stopLabels[i].tint = on ? 0xffffff : 0xb8c0c8;
  }
  private place() {
    const x = this.x0 + (this.x1 - this.x0) * this.meter.p;
    this.loco.position.set(x, this.ty + this.D * 0.015);
    this.drawTrack(x);
  }
  private landFirst(i: number) {
    const c = this.sticky.find((x) => x[0] === i);
    if (c) this.map.faces[i].set(coinKey(c[1]), { value: c[1] });
    else this.map.faces[i].set(this.first[i]);
  }
  protected override prime() {
    this.train.hide();
    this.map.unlight();
    for (const f of this.map.faces) {
      f.holder.rotation = 0;
      f.aura.alpha = 0.22;
    }
  }
  protected override settle() {
    this.prime();
    for (const f of this.map.faces) f.home0();
    this.map.faces.forEach((_, i) => this.landFirst(i));
    this.meter.p = 0;
    this.place();
    this.stops.forEach((_, i) => this.drawStop(i, false));
    this.big.text = 'x1';
    this.big.scale.set(this.bigK);
    this.big.alpha = 1;
  }
  private timeline() {
    const f = this.map.faces;
    const S = this.map.S;
    const D = this.D;
    const tr = this.train;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => this.prime(), [], 0);
    // spin 1: the board lands two Fare Coins
    this.wave(
      tl,
      0.3,
      f.map((_, i): [number, () => void] => [i, () => this.landFirst(i)]),
      0.08,
    );
    // spin 2: the coins stick (they hold and glow) while the board flips round them; two more land
    const s2 = 1.15;
    for (const [i] of this.sticky) {
      const fc = f[i];
      tl.fromTo(fc.holder, { rotation: 0 }, { rotation: 0.09, duration: 0.05, yoyo: true, repeat: 5, ease: 'sine.inOut', immediateRender: false }, s2 - 0.05);
      tl.fromTo(fc.aura, { alpha: 0.22 }, { alpha: 0.85, duration: 0.22, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, s2 - 0.05);
      tl.fromTo(fc.holder.scale, { x: 1, y: 1 }, { x: 1.1, y: 1.1, duration: 0.22, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, s2 - 0.05);
      tl.call(
        () => {
          const g = this.G(i);
          this.k.fx.glint(g.x + S * 0.22, g.y - S * 0.22, 0.32);
        },
        [],
        s2 + 0.08 * i,
      );
    }
    for (const [i, v] of this.fresh) flip(tl, f[i], s2 + 0.22 + i * 0.05, () => f[i].set(coinKey(v), { value: v }), 3);
    // the train sweeps the row; every coin it collects is a passenger on the POWER meter
    const t0 = 2.0;
    const p = tr.path;
    const beat = 0.42; // s per station
    const unit = this.P(1).x - this.P(0).x;
    const tAt = (s: number) => t0 + (s / unit) * beat;
    tl.call(
      () => {
        tr.s = 0;
        tr.place();
        tr.lamp.alpha = 0.55;
        this.map.light(0, 0.8, 0.4);
        this.map.surge(0);
      },
      [],
      t0,
    );
    this.roll(tl, tr, 0, p.length, (p.length / unit) * beat, 'none', t0);
    const order = [...this.sticky, ...this.fresh].sort((a, b) => a[0] - b[0]);
    const full = POWER_STEPS[POWER_STEPS.length - 1];
    let done = 0;
    order.forEach(([i], n) => {
      const at = tAt(arcOf(p, this.P(i)));
      const fc = f[i];
      const dest = () => ({ x: this.loco.x - D * 0.03, y: this.ty - D * 0.05 });
      hop(
        tl,
        fc,
        dest,
        at,
        () => {
          const g = this.g({ x: this.loco.x, y: this.ty });
          this.k.fx.sparks(g.x, g.y, quality.low ? 3 : 6, 0.5);
        },
        {
          dur: 0.4,
          lift: 0.5,
          onStart: () => {
            const g = this.G(i);
            this.k.fx.glint(g.x, g.y, 0.34);
          },
        },
      );
      // the meter runs on to the next level
      const arrive = at + 0.49;
      const prev = n === 0 ? 0 : POWER_STEPS[n - 1] / full;
      const next = POWER_STEPS[n] / full;
      drive(tl, this.meter, { p: prev }, { p: next }, 0.34, 'power2.inOut', arrive, () => this.place());
      const lv = arrive + 0.34;
      done = lv;
      tl.call(
        () => {
          this.drawStop(n, true);
          this.big.text = `x${POWER_MULTS[n + 1]}`;
          const g = this.g({ x: this.stops[n].x, y: this.ty - D * 0.11 });
          this.k.fx.sparks(g.x, g.y, quality.low ? 4 : 8, 0.6);
          if (n === POWER_STEPS.length - 1) {
            this.k.fx.burst(g.x, g.y, quality.low ? 6 : 12, 'volt', 0.8);
            if (this.featured) this.k.react('power');
          }
        },
        [],
        lv,
      );
      tl.fromTo(this.big.scale, { x: this.bigK * 1.55, y: this.bigK * 1.55 }, { x: this.bigK, y: this.bigK, duration: 0.42, ease: 'back.out(3)', immediateRender: false }, lv);
      tl.fromTo(this.stops[n].g.scale, { x: 1.45, y: 1.45 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, lv);
    });
    tl.call(() => void gsap.to(tr.lamp, { alpha: 0, duration: 0.3 }), [], tAt(p.length) - 0.3);
    tl.call(() => this.map.light(0, 0, 0.5), [], done);
    tl.fromTo(this.big.scale, { x: this.bigK, y: this.bigK }, { x: this.bigK * 1.12, y: this.bigK * 1.12, duration: 0.3, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, done + 0.45);
    // the meter runs home for the next loop (x10 fades to x1 on the way)
    const back = done + 1.3;
    drive(tl, this.meter, { p: 1 }, { p: 0 }, 0.6, 'power2.inOut', back, () => this.place());
    const bf = { a: 1 };
    drive(tl, bf, { a: 1 }, { a: 0 }, 0.25, 'power1.in', back, () => void (this.big.alpha = bf.a));
    POWER_STEPS.forEach((_, i) => tl.call(() => this.drawStop(POWER_STEPS.length - 1 - i, false), [], back + 0.1 + i * 0.1));
    tl.call(() => void (this.big.text = 'x1'), [], back + 0.25);
    const bi = { a: 0 };
    drive(tl, bi, { a: 0 }, { a: 1 }, 0.3, 'power1.out', back + 0.3, () => void (this.big.alpha = bi.a));
    tl.to({}, { duration: 0.01 }, back + 0.75);
    this.tl = tl;
  }
}

/* ------------------------------------------------------------------------------------------
 * EXPRESS PASS
 * ---------------------------------------------------------------------------------------- */

class BoostDemo extends MapDemo {
  private base: Sprite;
  private handle: Sprite;
  private cost: BitmapText;
  private costK = 1;
  constructor(k: DemoKit, D: number) {
    super(k, D, BOOST);
    const leverW = D * 0.46;
    this.base = new Sprite(k.art.leverOff);
    this.base.anchor.set(0.5, 0.66);
    setSize(this.base, leverW);
    this.base.position.set(-D * 0.2, D * 0.08);
    this.handle = new Sprite(k.art.handle);
    this.handle.anchor.set(0.5, 116 / 128);
    this.handle.scale.set(this.base.scale.x * 1.05);
    this.handle.position.set(-D * 0.2, D * 0.08);
    this.handle.rotation = -0.62;
    this.cost = bitmapNum(`${BOOST_COST}x`, 'gold', D * 0.17);
    this.costK = this.cost.scale.x;
    this.cost.position.set(-D * 0.2, -D * 0.32);
    this.view.addChild(this.base, this.handle);
    this.labels.addChild(this.cost);
    this.settle();
    this.timeline();
  }
  protected override prime() {
    this.base.texture = this.k.art.leverOff;
    this.handle.rotation = -0.62;
    this.cost.alpha = 0.45;
    this.cost.scale.set(this.costK);
    this.map.unlight();
  }
  protected override settle() {
    this.prime();
    const f = this.map.faces;
    for (const fc of f) fc.home0();
    f[0].set(ART.LOCO);
    f[1].set(4);
    f[2].set(ART.COIN_SILVER, { value: 2 });
    f[3].set(7);
  }
  private timeline() {
    const D = this.D;
    const f = this.map.faces;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => this.prime(), [], 0);
    tl.fromTo(this.handle, { rotation: -0.62 }, { rotation: 0.62, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 0.5);
    tl.call(
      () => {
        this.base.texture = this.k.art.leverOn;
        const g = this.at(this.handle);
        this.k.fx.sparks(g.x, g.y - D * 0.05, 8, 0.6);
        if (this.featured) this.k.react('boost');
      },
      [],
      0.65,
    );
    tl.fromTo(this.cost, { alpha: 0.45 }, { alpha: 1, duration: 0.2, immediateRender: false }, 0.65);
    tl.fromTo(this.cost.scale, { x: this.costK * 1.4, y: this.costK * 1.4 }, { x: this.costK, y: this.costK, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, 0.65);
    // three spins: the boards flip and every one lands a Locomotive on a terminal
    const spins: number[][] = [
      [ART.LOCO, 3, ART.COIN_SILVER, 5],
      [ART.COIN_BRONZE, 1, 8, ART.LOCO],
      [ART.LOCO, ART.COIN_GOLD, 6, 0],
    ];
    const vals: Record<number, number> = { [ART.COIN_BRONZE]: 0.5, [ART.COIN_SILVER]: 2, [ART.COIN_GOLD]: 10 };
    spins.forEach((board, n) => {
      const at = 1.05 + n * 0.95;
      const loco = board.indexOf(ART.LOCO);
      board.forEach((key, i) =>
        flip(tl, f[i], at + i * 0.07, () => {
          if (vals[key]) f[i].set(key, { value: vals[key] });
          else f[i].set(key);
        }),
      );
      const lit = at + loco * 0.07 + 0.45;
      this.lightLoco(tl, loco, lit);
      tl.call(
        () => {
          this.map.light(0, 0.7, 0.2);
          this.map.surge(0);
        },
        [],
        lit,
      );
      tl.call(() => this.map.light(0, 0, 0.4), [], lit + 0.3);
    });
    tl.fromTo(this.handle, { rotation: 0.62 }, { rotation: -0.62, duration: 0.3, ease: 'back.out(2.5)', immediateRender: false }, 4.1);
    tl.call(() => void (this.base.texture = this.k.art.leverOff), [], 4.2);
    tl.fromTo(this.cost, { alpha: 1 }, { alpha: 0.45, duration: 0.3, immediateRender: false }, 4.1);
    tl.to({}, { duration: 0.01 }, 4.7);
    this.tl = tl;
  }
}

/* ------------------------------------------------------------------------------------------
 * MAX WIN
 * ---------------------------------------------------------------------------------------- */

class MaxDemo extends Demo {
  private rays: Sprite;
  private loco = new Sprite(Texture.EMPTY);
  private big: BitmapText;
  private ck = 1;
  constructor(k: DemoKit, D: number) {
    super(k, D);
    this.rays = new Sprite(k.art.rays);
    this.rays.anchor.set(0.5);
    setSize(this.rays, D * 1.1);
    this.rays.blendMode = 'add';
    this.rays.position.set(0, -D * 0.08);
    this.rays.alpha = 0.15;
    this.loco.texture = this.tex('i');
    this.loco.anchor.set(0.5);
    setSize(this.loco, D * 0.66);
    this.ck = this.loco.scale.x;
    this.loco.position.set(0, -D * 0.08);
    this.big = bitmapNum(`${MAX_WIN.toLocaleString('en-US')}x`, 'gold', D * 0.25);
    const maxW = D * 0.9;
    if (this.big.width > maxW) this.big.scale.set(this.big.scale.x * (maxW / this.big.width));
    this.big.position.set(0, D * 0.36);
    this.view.addChild(this.rays, this.loco);
    this.labels.addChild(this.big);
    this.timeline();
  }
  private tex(pose: 'i' | 'w'): Texture {
    const own = this.k.art.sym.get(`${ART.LOCO_GOLD}${pose}`);
    if (own) return own;
    const set = this.k.sym.sets.get(ART.LOCO_GOLD);
    return (pose === 'w' ? set?.win : set?.idle) ?? set?.idle ?? Texture.EMPTY;
  }
  private timeline() {
    const D = this.D;
    const bk = this.big.scale.x;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => void (this.loco.texture = this.tex('i')), [], 0);
    tl.set(this.big, { alpha: 0.55 }, 0);
    tl.set(this.big.scale, { x: bk * 0.86, y: bk * 0.86 }, 0);
    tl.to(this.loco, { rotation: 0.05, duration: 0.06, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0.45);
    tl.call(
      () => {
        this.loco.texture = this.tex('w');
        const g = this.at(this.loco, 0, -D * 0.12);
        this.k.fx.coins(g.x, g.y, 9, 2, 0.8);
        this.k.fx.glint(g.x + D * 0.15, g.y - D * 0.05, 0.4);
        if (this.featured) this.k.react('loot');
      },
      [],
      1.0,
    );
    tl.set(this.loco, { rotation: 0 }, 1.0);
    tl.fromTo(this.loco.scale, { x: this.ck * 1.16, y: this.ck * 0.9 }, { x: this.ck, y: this.ck, duration: 0.45, ease: 'elastic.out(1, .45)', immediateRender: false }, 1.0);
    tl.to(this.rays, { alpha: 0.95, duration: 0.25 }, 1.0);
    tl.to(this.big, { alpha: 1, duration: 0.15 }, 1.05);
    tl.fromTo(this.big.scale, { x: bk * 1.18, y: bk * 1.18 }, { x: bk, y: bk, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, 1.05);
    tl.to(this.big.scale, { x: bk * 1.05, y: bk * 1.05, duration: 0.35, yoyo: true, repeat: 2, ease: 'sine.inOut' }, 1.6);
    tl.to(this.rays, { alpha: 0.15, duration: 0.4 }, 2.9);
    tl.call(() => void (this.loco.texture = this.tex('i')), [], 3.05);
    tl.to(this.big, { alpha: 0.55, duration: 0.3 }, 3.05);
    tl.to({}, { duration: 0.01 }, 3.7);
    this.tl = tl;
  }
  protected override settle() {
    this.loco.texture = this.tex('i');
    this.loco.rotation = 0;
    this.loco.scale.set(this.ck);
    this.rays.alpha = 0.15;
    this.big.alpha = 0.55;
  }
  override update(dtMs: number) {
    if (this.on) this.rays.rotation += dtMs * 0.00018;
  }
}

export function makeDemo(kind: DemoKind, kit: DemoKit, D: number): Demo {
  switch (kind) {
    case 'run':
      return new RunDemo(kit, D);
    case 'signal':
      return new SignalDemo(kit, D);
    case 'security':
      return new SecurityDemo(kit, D);
    case 'crash':
      return new CrashDemo(kit, D);
    case 'power':
      return new PowerDemo(kit, D);
    case 'boost':
      return new BoostDemo(kit, D);
    default:
      return new MaxDemo(kit, D);
  }
}

export { Demo, type DemoKit };
