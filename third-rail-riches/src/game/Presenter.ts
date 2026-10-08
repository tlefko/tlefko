import { t } from '../i18n';
import { BitmapText, Container, RenderTexture, Sprite, type Texture } from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from './Scene';
import { sound } from './sound';
import { T, wait, done, speed } from '../render/timing';
import { mapPoint, stationCenter, type Layout } from '../render/layout';
import { bitmapNum, displayText, type DisplayText, type NumTone } from '../render/text';
import { softDotTexture } from '../render/textures';
import { Iris } from '../render/overlays/Iris';
import { TitleCard, type CardSpec } from '../render/overlays/TitleCard';
import { BigWin, tierFor } from '../render/overlays/BigWin';
import { quality } from '../render/quality';
import { coinLabel, type SymbolView } from '../render/grid/SymbolView';
import { coinTier } from '../art/symbols';
import { RETRIGGER_SPINS } from '../math/model';
import { LEVEL_SPINS, MAX_WIN, Sym, multOfLevel, type BonusKind, type RoundResult, type RouteWin, type SpinResult } from '../math/types';
import type { SpecialKind } from '../render/map/MapView';

export interface HudBridge {
  bonus(on: boolean, kind?: BonusKind): void;
  freeSpins(left: number, total: number): void;
  bonusTotal(multiple: number): void;
  spinWin(multiple: number): void;
}

export interface PresentCtx {
  fmt: (multiple: number) => string;
  auto: boolean;
  hud: HudBridge;
  /** Report the RGS book event index about to play (bonus progress, for resume). */
  progress?: (eventIndex: number) => void;
}

/** Scene mood and music per bonus. */
const MOOD: Record<BonusKind, { mood: 'witching' | 'limbo'; music: string }> = {
  rush: { mood: 'witching', music: 'rush' },
  last: { mood: 'limbo', music: 'last' },
};

export const BONUS_NAME: Record<BonusKind, () => string> = { rush: () => t('rushHourCaps'), last: () => t('lastTrainCaps') };

/** Way-win accents by symbol. */
const SYM_SFX = ['symPretzel', 'symCoffee', 'symNewspaper', 'symUmbrella', 'symPigeon', 'symCat', 'symBulldog', 'symRat', 'symConductor'];

type LoopName = Parameters<typeof sound.loop>[0];
type PlayOpts = Parameters<typeof sound.play>[1];

/**
 * Turns a RoundResult into motion. Every await here is a beat of the choreography; beats that can
 * overlap (labels flying, the meter filling, the board undimming) are started without waiting, so
 * the board is never idle mid-round.
 *
 * A spin: the board drops in (held coins and the Golden Locomotive stay put), way wins trace and
 * pay, then, if any Locomotive landed, Conductor Casey blows his whistle, the headlamps come on and
 * the trains run their rows collecting Fare Coins (Junctions branch them); the haul gathers in the
 * middle, the POWER multiplier slams into it in the free spins, and it flies to the win bar.
 */
export class Presenter {
  private iris = new Iris();
  private waitingCard?: TitleCard;
  /** Running win shown on the bar (labels add to it as they land). */
  private barTotal = 0;
  private prepareGen = 0;
  private inBonus = false;
  private quietSince = 0;
  private loops = new Set<LoopName>();

  /* ------------------------------------------------------------------ */
  /* sound funnel                                                        */
  /* ------------------------------------------------------------------ */

  play(id: string, opts?: PlayOpts) {
    sound.play(id, opts);
  }
  loop(name: LoopName, on: boolean) {
    sound.loop(name, on);
  }
  duck(amount: number, seconds: number) {
    sound.duck(amount, seconds);
  }
  music(track: string, fade?: number) {
    sound.music(track as never, fade);
  }
  intensity(v: number) {
    sound.intensity(v);
  }
  private setLoop(name: LoopName, on: boolean) {
    if (on === this.loops.has(name)) return;
    if (on) this.loops.add(name);
    else this.loops.delete(name);
    this.loop(name, on);
  }
  private loopsOff() {
    for (const l of [...this.loops]) this.setLoop(l, false);
  }

  /** The map's one-beat sounds come through the funnel; coin values ride above the particles. */
  private hookMap() {
    const grid = this.scene.map;
    if (!grid) return;
    grid.sfx = (id, o) => this.play(id, o);
    const sh = this.scene.shake;
    const fx = this.scene.fx;
    if (fx.parent === sh) {
      const b = grid.badgeRoot;
      if (b.parent !== sh || sh.getChildIndex(b) !== sh.getChildIndex(fx) + 1) {
        b.removeFromParent();
        sh.addChildAt(b, sh.getChildIndex(fx) + 1);
      }
    }
  }

  destroy() {
    this.loopsOff();
  }

  /** Coin faces print values at this formatter (the bet changed, or the game just started). */
  setCoinFormat(fmt: (v: number) => string) {
    coinLabel.fmt = fmt;
    this.scene.map?.refreshValues();
  }

  constructor(private scene: Scene) {
    scene.overlay.addChild(this.iris);
    scene.symTex.idleGate = () => !scene.busy && !this.inBonus && performance.now() - this.quietSince > 1500;
    scene.symTex.onLazy = (tx) => this.upload(tx);
  }

  async prepare() {
    const gen = ++this.prepareGen;
    const L = this.scene.L;
    const res = this.scene.stage.resolution;
    this.hookMap();
    this.iris.resize(L.W, L.H);
    if (gen !== this.prepareGen) return;
    for (const b of this.banners.values()) b.d.destroy();
    this.banners.clear();
    const d = this.banner(t('plusFreeSpins', { n: RETRIGGER_SPINS }), 'sea');
    this.warmGpu([d.d.texture]);
    await this.prepareOverlays(gen, L, res);
  }

  /** Title cards and the big win rasterise everything they need now (never mid-round). */
  private prepareOverlays(gen: number, L: Layout, res: number): Promise<void> {
    const run = async () => {
      if (gen !== this.prepareGen) return;
      const coins = await BigWin.prepare(L.W, L.H);
      if (gen !== this.prepareGen) return;
      const floor = L.H - L.hudH;
      const cards = await TitleCard.prepare(L.W, L.H, res, floor, this.scene.stage.app.renderer);
      if (gen !== this.prepareGen) return;
      this.upload([...coins, ...cards]);
    };
    this.overlays = (this.scene.busy ? this.untilQuiet() : Promise.resolve()).then(run).catch(() => undefined);
    return this.overlays;
  }
  private overlays: Promise<void> = Promise.resolve();

  private untilQuiet(): Promise<void> {
    return new Promise((res) => {
      const check = () => (this.scene.busy ? window.setTimeout(check, 250) : res());
      check();
    });
  }

  private warmGpu(extra: Texture[] = []) {
    const sc = this.scene;
    this.upload([...sc.symTex.all(), ...sc.trains.textures(), ...sc.fx.textures(), ...extra]);
  }

  private upload(texs: Texture[]) {
    const sc = this.scene;
    if (!texs.length || !sc.stage.app.renderer) return;
    const tmp = new Container();
    for (const tx of texs) {
      const s = new Sprite(tx);
      s.width = s.height = 4;
      tmp.addChild(s);
    }
    const rt = RenderTexture.create({ width: 8, height: 8 });
    try {
      sc.stage.app.renderer.render({ container: tmp, target: rt });
    } catch {
      /* a lost context re-uploads on first use anyway */
    }
    rt.destroy(true);
    tmp.destroy({ children: true });
  }

  /* ------------------------------------------------------------------ */
  /**
   * Present a round. `from` is the book event index the RGS saved for an unfinished round (a resumed
   * bonus): the free spins already shown are skipped and the bonus picks up at that free spin.
   */
  async round(r: RoundResult, ctx: PresentCtx, from?: number): Promise<void> {
    coinLabel.fmt = (v) => ctx.fmt(v);
    try {
      const trig = r.trigger;
      const resumeAt = r.bonus && typeof from === 'number' && from >= 2 ? Math.min(from - 2, r.bonus.spins.length) : -1;
      if (resumeAt >= 0) {
        await this.bonus(r, ctx, resumeAt);
        return;
      }
      await this.spin(trig, ctx, false);
      if (trig.maxWin) {
        await this.maxWin(ctx);
        return;
      }
      if (r.bonus) {
        await this.fsTrigger(trig);
        await this.bonus(r, ctx);
      }
    } finally {
      this.loopsOff();
    }
  }

  /* ------------------------------------------------------------------ */
  async spin(s: SpinResult, ctx: PresentCtx, inBonus: boolean): Promise<void> {
    const sc = this.scene;
    const { map, winBar, meter } = sc;
    sc.busy = true;
    this.unslam();
    this.hookMap();
    sc.trains.clear();
    winBar.format = ctx.fmt;
    winBar.reset(0, null);
    this.barTotal = 0;
    if (inBonus) {
      meter.set(s.powerBefore, false);
      if (meter.mult !== s.mult) meter.setMult(s.mult, false);
    }
    sc.conductor.react('idle');
    sc.rat.react('idle');
    sc.conductor.lanternGlow?.(inBonus);
    // a held Golden Locomotive switches its headlamp off for the new spin
    for (const p of s.held) void map.views[p]?.setLit(false, false);

    let anticipating = false;
    let settled = 0;
    const W = sc.L.W;
    await map.spinIn(
      s.grid,
      new Set(s.held),
      {
        onRattle: (p) => {
          const c = map.stationPoint(p);
          this.play('flapRattle', { index: p, volume: 0.55, pan: (c.x / W) * 1.2 - 0.6 });
        },
        onSettle: (p) => {
          const c = map.stationPoint(p);
          settled++;
          this.play('flapSettle', { index: settled, volume: 0.7, pan: (c.x / W) * 1.2 - 0.6 });
        },
        onSpecial: (v, kind, idx) => this.landed(v, kind, idx),
        onAnticipation: (_st, on) => {
          if (on === anticipating) return;
          anticipating = on;
          this.setLoop('anticipation', on);
          this.play(on ? 'anticipationStart' : 'anticipationEnd');
          this.intensity(on ? 1 : 0);
          sc.conductor.react(on ? 'pray' : 'idle');
          sc.rat.react(on ? 'worried' : 'idle');
        },
      },
      true,
    );

    const flights: Promise<void>[] = [];
    // route wins
    if (s.routes.length) {
      this.play('win');
      s.routes.slice(0, 4).forEach((w, k) => this.play(SYM_SFX[w.sym] ?? 'win', k ? { delay: 0.07 * k } : undefined));
      sc.rat.react('happy', 0.8);
      if (s.routes.some((w) => w.sym === Sym.TOP)) sc.conductor.react('laugh', 0.9);
      await map.celebrate(s.routes);
      flights.push(...this.routeLabels(s.routes, ctx));
      await wait(T(0.3));
      await map.undim();
    }
    // trains
    if (s.trains.length) await this.runTrains(s, ctx, inBonus, flights);
    else if (!inBonus && s.grid.some((c) => c.sym === Sym.COIN && (c.value ?? 0) >= 10)) {
      // big coins and no train to collect them: Rivets is gutted
      sc.rat.react('worried', 0.8);
    }
    await Promise.all(flights);
    if (Math.abs(this.barTotal - s.spinWin) > 1e-9) await winBar.setValue(s.spinWin, 0.4);
    this.barTotal = s.spinWin;
    if (s.maxWin) winBar.reset(MAX_WIN, winBar.mult);
    ctx.hud.spinWin(s.spinWin);
    sc.busy = false;
    this.quietSince = performance.now();
  }

  /** A special symbol lands on its station. */
  private landed(v: SymbolView, kind: SpecialKind, idx: number) {
    const sc = this.scene;
    const S = sc.L.S;
    switch (kind) {
      case 'fs':
        this.play('ticketLand', { index: Math.min(6, idx) });
        gsap.fromTo(v, { rotation: -0.16 }, { rotation: 0, duration: T(0.5), ease: 'elastic.out(1.2, .3)' });
        sc.fx.burst(v.x, v.y, 8, 'white', 0.7);
        for (let i = 0; i < 3; i++) gsap.delayedCall(T(0.05 + i * 0.07), () => sc.fx.glint(v.x + (Math.random() - 0.5) * S * 0.6, v.y - S * (0.1 + Math.random() * 0.25), 0.36));
        this.shake(0.2);
        if (idx >= 2) sc.rat.react('watch', 1);
        break;
      case 'coin': {
        const tier = coinTier(v.cell.value ?? 0);
        this.play('coinLand', { index: tier });
        v.punchValue(1.4);
        if (tier >= 2) sc.fx.coins(v.x, v.y, tier === 3 ? 6 : 3, 2, 0.4);
        if (tier === 3) {
          this.shake(0.3);
          sc.rat.react('happy', 0.8);
        }
        break;
      }
      case 'loco':
        this.play(v.cell.golden ? 'goldenArrive' : 'locoLand');
        sc.fx.dust(v.x, v.y + S * 0.3, true);
        this.shake(v.cell.golden ? 0.6 : 0.25);
        sc.conductor.react('watch', 0.8);
        break;
      case 'signal':
        this.play('switchLand');
        break;
      case 'security':
        this.play('switchLand', { volume: 0.7 });
        sc.rat.react('watch', 0.6);
        break;
      case 'wild':
        this.play('wildLand');
        sc.fx.sparks(v.x, v.y, quality.low ? 4 : 10, 0.8);
        break;
    }
  }

  /** One label per route win over its stations; each flies to the bar and adds its pay there. */
  private routeLabels(routes: RouteWin[], ctx: PresentCtx): Promise<void>[] {
    const sc = this.scene;
    return routes.map((w, k) => {
      const p = this.centroid(w.stations);
      const tone: NumTone = w.sym >= Sym.H4 ? 'gold' : 'white';
      const lbl = this.popLabel(ctx.fmt(w.pay), p.x, p.y - sc.L.S * 0.55 + (k % 2) * sc.L.S * 0.3, tone, 0.5);
      return wait(T(0.18 + k * 0.06))
        .then(() => this.flyTo(lbl, sc.winBar.mainCenter(), 0.38, 0.06))
        .then(() => {
          this.play('barTick');
          this.barTotal += w.pay;
          void sc.winBar.setValue(this.barTotal, 0.3);
        });
    });
  }

  /**
   * The trains: Casey checks his watch and blows the whistle, the headlamps come on, the trains roll
   * out of their terminals and run the network (TrainRunner plays every beat: coins, signals,
   * security checks, crashes). Each finished train (or settled crash pile) hands its tally over:
   * in the base game it flies straight to the bar; in the free spins the tallies gather at Grand
   * Junction, the POWER multiplier slams into the total and it flies to the bar.
   */
  private async runTrains(s: SpinResult, ctx: PresentCtx, inBonus: boolean, flights: Promise<void>[]) {
    const sc = this.scene;
    const { map, L, meter } = sc;
    sc.rat.react('watch', 1.2);
    this.play('whistle');
    const disp = sc.conductor.dispatch?.() ?? Promise.resolve();
    await Promise.all(s.trains.map((tr, i) => wait(T(0.06 * i)).then(() => map.views[tr.start]?.setLit(true))));
    await Promise.race([disp, wait(T(0.45))]);
    this.play('trainDepart');
    this.setLoop('trainRun', true);
    const multiplied = inBonus && s.mult > 1;
    const gather = mapPoint(L, 3, 2);
    let gathered = 0;
    let gatherLbl: BitmapText | null = null;
    let power = s.powerBefore;
    let meterQ: Promise<void> = Promise.resolve();
    await sc.trains.run(s, {
      fmt: ctx.fmt,
      sfx: (id, o) => this.play(id, o),
      shake: (p) => this.shake(p),
      punch: (x, y, p) => this.punch(x, y, p),
      onCoin: (from) => {
        if (!inBonus) return;
        power++;
        const to = power;
        this.spark(from, meter.trainPoint());
        meterQ = meterQ.then(() => meter.advance(to, (p) => this.play('powerStep', { index: ((p - 1) % 12) + 1 })));
      },
      onDepart: () => sc.conductor.react('watch', 1.5),
      onRedirect: () => sc.rat.react('watch', 0.6),
      onSecurity: (phase) => {
        if (phase === 'alarm') {
          sc.conductor.react('pray', 1.2);
          sc.rat.react('worried', 1.2);
        } else if (phase === 'clear') {
          sc.conductor.react('laugh', 0.9);
          sc.rat.react('happy', 0.9);
        } else {
          sc.conductor.react('shock', 1.1);
          sc.rat.react('worried', 1.1);
        }
      },
      onCrash: (phase) => {
        if (phase === 'closing') {
          sc.conductor.react('shock', 1.6);
          sc.rat.react('duck', 1.6);
        } else if (phase === 'settled') {
          sc.conductor.react('cheer', 1.2);
          sc.rat.react('happy', 1.2);
        }
      },
      onPayout: async (amount, label) => {
        sc.labelLayer.addChild(label);
        if (!multiplied) {
          await this.flyTo(label, sc.winBar.mainCenter(), 0.42, 0.12);
          this.play('barApply');
          this.barTotal += amount;
          void sc.winBar.setValue(this.barTotal, 0.4);
          return;
        }
        await this.flyTo(label, gather, 0.36, 0.1);
        gathered = Math.round((gathered + amount) * 100) / 100;
        this.play('barTick');
        if (!gatherLbl) gatherLbl = this.popLabel(ctx.fmt(gathered), gather.x, gather.y, 'gold', 0.8);
        else {
          gatherLbl.text = ctx.fmt(gathered);
          const k = gatherLbl.scale.x;
          gsap.fromTo(gatherLbl.scale, { x: k * 1.25, y: k * 1.25 }, { x: k, y: k, duration: T(0.25), ease: 'back.out(3)' });
        }
      },
    });
    this.setLoop('trainRun', false);
    if (s.haul > 0) {
      const big = s.trainWin >= 20;
      if (big) {
        sc.conductor.react('cheer', 1);
        sc.rat.react('happy', 1);
      }
      if (multiplied && gatherLbl) {
        const lbl: BitmapText = gatherLbl;
        await wait(T(0.2));
        await this.multSlam(lbl, s.mult, gather, ctx.fmt(s.trainWin));
        flights.push(
          this.flyTo(lbl, sc.winBar.mainCenter(), 0.42, 0.1).then(() => {
            this.play('barApply');
            this.barTotal += s.trainWin;
            void sc.winBar.setValue(this.barTotal, 0.4);
          }),
        );
      }
    } else {
      this.play('trainBrake');
      sc.rat.react('worried', 0.8);
    }
    await meterQ;
    for (const tr of s.trains) {
      const v = map.views[tr.start];
      if (v) gsap.to(v, { alpha: 1, duration: T(0.3) });
    }
  }

  /** The POWER multiplier flies out of the meter seal and slams into the haul label. */
  private async multSlam(lbl: BitmapText, mult: number, at: { x: number; y: number }, after: string) {
    const sc = this.scene;
    const S = sc.L.S;
    const m = bitmapNum(`x${mult}`, 'fire', S * 0.7);
    const o = sc.meter.badgeCenter();
    m.position.set(o.x, o.y);
    sc.labelLayer.addChild(m);
    this.play('haulMult');
    const km = m.scale.x;
    const back = { x: o.x, y: o.y - S * 0.2 };
    await done(
      gsap
        .timeline()
        .from(m.scale, { x: 0, y: 0, duration: T(0.15), ease: 'back.out(3)' })
        .to(m, { x: back.x, y: back.y, duration: T(0.1), ease: 'power2.out' })
        .to(m, { x: at.x, y: at.y, duration: T(0.26), ease: 'power3.in' })
        .to(m.scale, { x: km * 0.8, y: km * 1.2, duration: T(0.1), ease: 'power2.in' }, '<'),
    );
    m.destroy();
    sc.fx.burst(at.x, at.y, 18, 'white', 1.1);
    lbl.text = after;
    const k = lbl.scale.x;
    gsap.fromTo(lbl.scale, { x: k * 1.6, y: k * 1.6 }, { x: k, y: k, duration: T(0.34), ease: 'back.out(3)' });
    this.shake(0.5);
    this.punch(at.x, at.y, 1);
    await wait(T(0.25));
  }

  /** A spark from a collected coin to the POWER meter's train. */
  private spark(from: { x: number; y: number }, to: { x: number; y: number }) {
    const sc = this.scene;
    if (quality.low || speed.reduced) return;
    const g = new Sprite(softDotTexture());
    g.anchor.set(0.5);
    g.blendMode = 'add';
    g.tint = 0x3fc8ff;
    g.width = g.height = sc.L.S * 0.35;
    g.position.set(from.x, from.y);
    sc.labelLayer.addChild(g);
    const p = { t: 0 };
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - sc.L.S };
    gsap.to(p, {
      t: 1,
      duration: T(0.42),
      ease: 'power1.in',
      onUpdate: () => {
        const u = 1 - p.t;
        g.x = u * u * from.x + 2 * u * p.t * ctrl.x + p.t * p.t * to.x;
        g.y = u * u * from.y + 2 * u * p.t * ctrl.y + p.t * p.t * to.y;
        if (Math.random() < 0.4) sc.fx.trail(g.x, g.y, 0.15);
      },
      onComplete: () => g.destroy(),
    });
  }

  private centroid(positions: number[]) {
    const L = this.scene.L;
    let x = 0;
    let y = 0;
    for (const p of positions) {
      const c = stationCenter(L, p);
      x += c.x;
      y += c.y;
    }
    const n = Math.max(1, positions.length);
    return { x: x / n, y: y / n };
  }

  /** A soft additive glow flash at a point. */
  private glowAt(x: number, y: number, size: number, tint: number, alpha = 0.55, dur = 0.35) {
    if (quality.low) return;
    const g = new Sprite(softDotTexture());
    g.anchor.set(0.5);
    g.blendMode = 'add';
    g.tint = tint;
    g.width = g.height = size;
    g.position.set(x, y);
    g.alpha = alpha;
    this.scene.labelLayer.addChildAt(g, 0);
    gsap.to(g, { alpha: 0, duration: T(dur), ease: 'power2.out', onComplete: () => g.destroy() });
  }

  /** A win label pops: springs up out of a flash, overshoots, settles. */
  private popLabel(text: string, x: number, y: number, tone: NumTone, size = 0.62): BitmapText {
    const sc = this.scene;
    const S = sc.L.S;
    const lbl = bitmapNum(text, tone, S * size);
    const k = lbl.scale.x;
    const half = lbl.width * 0.62;
    const gx0 = sc.L.frame.x + half;
    const gx1 = sc.L.frame.x + sc.L.frame.w - half;
    lbl.position.set(gx0 < gx1 ? Math.max(gx0, Math.min(gx1, x)) : x, y + S * 0.12);
    sc.labelLayer.addChild(lbl);
    lbl.scale.set(0);
    this.glowAt(x, y, S * 1.8, tone === 'fire' ? 0xff9a3a : 0xfff0b0);
    gsap
      .timeline()
      .to(lbl.scale, { x: k * 1.22, y: k * 1.22, duration: T(0.17), ease: 'back.out(2.6)' })
      .to(lbl, { y: y - S * 0.04, duration: T(0.24), ease: 'power2.out' }, 0)
      .to(lbl.scale, { x: k, y: k, duration: T(0.16), ease: 'sine.inOut' });
    return lbl;
  }

  /** Arc a label into a target point: a small dip, then it whips along a curve, shrinking, trailing sparks. */
  private flyTo(obj: Container, to: { x: number; y: number }, dur: number, hold = 0.14): Promise<void> {
    const from = { x: obj.x, y: obj.y };
    const S = this.scene.L.S;
    const ctrl = { x: (from.x + to.x) / 2 + (from.x < to.x ? -1 : 1) * S * 0.35, y: Math.min(from.y, to.y) - S * 1.2 };
    const p = { t: 0 };
    const s0 = obj.scale.x;
    let last = 0;
    return done(
      gsap
        .timeline()
        .to(obj, { y: from.y + S * 0.06, duration: T(hold), ease: 'sine.inOut' })
        .to(obj.scale, { x: s0 * 1.08, y: s0 * 0.92, duration: T(hold), ease: 'sine.inOut' }, 0)
        .call(() => {
          from.y = obj.y;
        })
        .to(p, {
          t: 1,
          duration: T(dur),
          ease: 'power1.in',
          onUpdate: () => {
            const tt = p.t;
            const u = 1 - tt;
            obj.x = u * u * from.x + 2 * u * tt * ctrl.x + tt * tt * to.x;
            obj.y = u * u * from.y + 2 * u * tt * ctrl.y + tt * tt * to.y;
            obj.scale.set(s0 * (1 - 0.55 * tt) * (1 + 0.08 * Math.sin(tt * Math.PI)), s0 * (1 - 0.55 * tt));
            if (tt - last > 0.08) {
              last = tt;
              this.scene.fx.trail(obj.x, obj.y, 0.18);
            }
          },
          onComplete: () => {
            this.scene.fx.burst(to.x, to.y, 10, 'white', 0.6);
            obj.destroy();
          },
        }),
    );
  }

  /* ------------------------------------------------------------------ */
  /* camera                                                              */
  /* ------------------------------------------------------------------ */

  /** Screen shake, bounded so no canvas text is ever pushed off the screen. */
  shake(power = 1) {
    if (speed.reduced) return;
    const s = this.scene.shake;
    const L = this.scene.L;
    const amp = Math.min(L.S * 0.06 * power, this.margin(L) * 0.8);
    if (amp < 0.5) return;
    gsap.killTweensOf(s.position);
    const tl = gsap.timeline({ onComplete: () => s.position.set(0, 0) });
    const n = quality.low ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const k = 1 - i / (n + 1);
      tl.to(s.position, { x: (Math.random() - 0.5) * amp * 2 * k, y: (Math.random() - 0.5) * amp * 2 * k, duration: 0.035 });
    }
    tl.to(s.position, { x: 0, y: 0, duration: 0.06 });
  }

  /** Camera punch toward (x, y), capped so canvas text and the board stay on screen. */
  punch(x: number, y: number, power = 1) {
    if (speed.reduced) return;
    const L = this.scene.L;
    let k = 1 + 0.022 * power;
    const m = 3 + L.S * 0.06 * 1.6;
    for (const r of [L.logo, L.winBar, L.meter, L.frame]) {
      if (r.x < x) k = Math.min(k, (x - m) / Math.max(1, x - r.x));
      if (r.x + r.w > x) k = Math.min(k, (L.W - m - x) / Math.max(1, r.x + r.w - x));
      if (r.y < y) k = Math.min(k, (y - m) / Math.max(1, y - r.y));
      if (r.y + r.h > y) k = Math.min(k, (L.H - m - y) / Math.max(1, r.y + r.h - y));
    }
    if (k <= 1.002) return;
    const z = this.zoom;
    z.x = x;
    z.y = y;
    gsap.killTweensOf(z);
    gsap
      .timeline({ onUpdate: () => this.applyZoom(), onComplete: () => this.applyZoom() })
      .to(z, { k: Math.max(k, z.k), duration: T(0.06), ease: 'power2.out' })
      .to(z, { k: 1, duration: T(0.36), ease: 'elastic.out(1, .5)' });
  }
  private zoom = { k: 1, x: 0, y: 0 };

  private applyZoom() {
    const s = this.scene.shake;
    const z = this.zoom;
    if (Math.abs(z.k - 1) < 1e-4) {
      s.scale.set(1);
      s.pivot.set(0, 0);
      return;
    }
    s.scale.set(z.k);
    s.pivot.set(z.x * (1 - 1 / z.k), z.y * (1 - 1 / z.k));
  }

  private margin(L: Layout): number {
    let m = Infinity;
    for (const r of [L.logo, L.winBar, L.meter]) m = Math.min(m, r.x, L.W - (r.x + r.w), r.y);
    return Math.max(0, m);
  }

  /* ------------------------------------------------------------------ */
  /* free spins                                                          */
  /* ------------------------------------------------------------------ */

  /** 3+ Golden Tickets: they take the stage, flip and shine, the station cheers. */
  private async fsTrigger(s: SpinResult) {
    const sc = this.scene;
    this.play('bonusTrigger');
    sc.conductor.react('cheer', 1.6);
    sc.rat.react('happy', 1.6);
    const tickets = new Set(s.scatPositions);
    sc.map.views.forEach((v, p) => v && !tickets.has(p) && gsap.to(v, { alpha: 0.3, duration: T(0.3) }));
    sc.map.heartbeat();
    await wait(T(0.3));
    s.scatPositions.forEach((p, i) => {
      const v = sc.map.views[p];
      if (!v) return;
      gsap.delayedCall(T(i * 0.12), () => {
        v.startWin();
        gsap.fromTo(v.scale, { x: 1.4, y: 1.4 }, { x: 1.12, y: 1.12, duration: T(0.4), ease: 'back.out(3)' });
        sc.fx.burst(v.x, v.y, 16, 'white', 1);
        sc.fx.coins(v.x, v.y, 4, 2, 0.6);
        this.glowAt(v.x, v.y, sc.L.S * 2.2, 0xffe08a, 0.8, 0.6);
      });
    });
    this.shake(0.6);
    await wait(T(1.1 + s.scatPositions.length * 0.12));
  }

  /** Build a title card off screen; show it once the iris has closed. */
  private card(spec: CardSpec): Promise<TitleCard> {
    const L = this.scene.L;
    const card = new TitleCard(L.W, L.H, spec, L.H - L.hudH);
    card.visible = false;
    this.scene.overlay.addChildAt(card, 0);
    return card.build(this.scene.stage.resolution).then(() => card);
  }

  private async bonus(r: RoundResult, ctx: PresentCtx, start = 0) {
    this.inBonus = true;
    try {
      await this.bonusFlow(r, ctx, start);
    } finally {
      this.inBonus = false;
      this.quietSince = performance.now();
    }
  }

  private async bonusFlow(r: RoundResult, ctx: PresentCtx, start = 0) {
    const sc = this.scene;
    const b = r.bonus!;
    const kind = b.kind;
    const mood = MOOD[kind];
    const last = kind === 'last';
    const gc = { x: sc.L.frame.x + sc.L.frame.w / 2, y: sc.L.frame.y + sc.L.frame.h / 2 };
    this.play('iris');
    if (start > 0) {
      await this.iris.close(gc.x, gc.y, 0.5);
      this.music(mood.music, 1.2);
    } else {
      const closing = this.iris.close(gc.x, gc.y, 0.8);
      const building = this.overlays.then(() =>
        this.card({
          palette: last ? [0x6a4a0a, 0x1a1204] : [0x5a1420, 0x1e070b],
          kicker: t('youWon'),
          title: BONUS_NAME[kind](),
          titleTone: last ? 'gold' : 'crimson',
          big: t('freeSpinsCaps', { n: b.awarded }),
          bigTone: 'gold',
          body: last ? t('bonusBlurbLast') : t('bonusBlurbRush'),
          cta: ctx.auto ? '' : t('tapToBegin'),
          conductor: last ? 'smug' : 'laugh',
          rat: 'happy',
        }),
      );
      const [card] = await Promise.all([building, closing]);
      card.visible = true;
      this.play('bonusIntro');
      this.music(mood.music, 1.2);
      await this.iris.open(gc.x, gc.y, 0.7);
      this.waitingCard = card;
      await card.waitTap(ctx.auto ? 3 : 0);
      this.waitingCard = undefined;
      this.unslam();
      this.play('uiClick');
      this.play('iris');
      await this.iris.close(gc.x, gc.y, 0.6);
      card.destroy();
    }
    for (const v of sc.map.views)
      if (v) {
        v.stopWin();
        v.alpha = 1;
        v.scale.set(1);
      }
    sc.setMood(mood.mood);
    ctx.hud.bonus(true, kind);
    // the POWER meter wakes up at the bonus's starting power
    const first = b.spins[start];
    const p0 = first ? first.powerBefore : b.powerStart;
    sc.meter.setActive(true, false);
    sc.meter.set(p0, false);
    sc.meter.setMult(first ? first.mult : multOfLevel(0), false);
    // spins left before free spin `start` (a resume skips the ones shown)
    let total = b.awarded;
    const shown = b.spins.slice(0, start);
    total += shown.reduce((a, x) => a + x.levelSpins, 0) + b.retriggers.filter((x) => x.afterSpin < start).reduce((a, x) => a + x.added, 0);
    let played = start;
    let win = r.trigger.spinWin + shown.reduce((a, x) => a + x.spinWin, 0);
    ctx.hud.freeSpins(total - played, total);
    ctx.hud.bonusTotal(win);
    sc.winBar.reset(0, null);
    await this.iris.open(gc.x, gc.y, 0.7);
    if (last && start === 0) {
      await this.banner(t('goldenLocoBanner'), 'gold').show(1.1);
    }
    for (let i = start; i < b.spins.length; i++) {
      const s = b.spins[i];
      played++;
      ctx.hud.freeSpins(total - played, total);
      ctx.progress?.(2 + i);
      await this.spin(s, ctx, true);
      win += s.spinWin;
      ctx.hud.bonusTotal(win);
      if (s.maxWin) break;
      if (s.levelAfter > s.levelBefore) {
        total += s.levelSpins;
        await this.levelUp(s);
        ctx.hud.freeSpins(total - played, total);
      }
      const re = b.retriggers.find((x) => x.afterSpin === i);
      if (re) {
        total += re.added;
        await this.retrigger(re.added);
        ctx.hud.freeSpins(total - played, total);
      }
      await wait(T(0.3));
    }
    if (r.maxWin) await this.maxWin(ctx);
    const final = r.totalWin;
    ctx.hud.bonusTotal(final);
    await wait(T(0.5));
    this.play('iris');
    const closing2 = this.iris.close(gc.x, gc.y, 0.7);
    const tier = tierFor(final);
    const building2 = this.card({
      palette: last ? [0x5a3e08, 0x1a1204] : [0x4a101a, 0x1a0509],
      kicker: tier >= 0 ? [t('bigWin'), t('megaWin'), t('epicWin'), t('unholyWin')][tier] : t('bonusOver', { name: BONUS_NAME[kind]() }),
      title: t('totalWinCaps'),
      titleTone: 'white',
      big: ctx.fmt(0),
      bigTone: 'gold',
      body: played === 1 ? t('spinsPlayedOne') : t('spinsPlayed', { n: played }),
      cta: ctx.auto ? '' : t('tapToContinue'),
      conductor: final > 0 ? 'laugh' : 'shock',
      rat: final > 0 ? 'happy' : 'worried',
    });
    const [end] = await Promise.all([building2, closing2]);
    end.visible = true;
    this.play('bonusEnd');
    await this.iris.open(gc.x, gc.y, 0.6);
    const cnt = { v: 0 };
    await done(
      gsap.to(cnt, {
        v: final,
        duration: T(Math.min(4, 1 + Math.log10(1 + final))),
        ease: 'power2.out',
        onUpdate: () => {
          end.setBig(ctx.fmt(cnt.v));
          if (Math.random() < 0.3) this.play('barTick');
        },
      }),
    );
    end.setBig(ctx.fmt(final));
    if (final >= 20) sc.fx.coins(sc.L.W / 2, sc.L.H * 1.02, 40, 2, 1.2);
    this.waitingCard = end;
    await end.waitTap(ctx.auto ? 2.5 : 0);
    this.waitingCard = undefined;
    this.unslam();
    this.play('uiClick');
    this.play('iris');
    await this.iris.close(gc.x, gc.y, 0.6);
    end.destroy();
    sc.setMood(null);
    ctx.hud.bonus(false);
    sc.winBar.reset(0, null);
    sc.meter.setActive(false, false);
    sc.meter.set(0, false);
    sc.meter.setMult(1, false);
    // the free-spin board (held coins, the Golden Locomotive) gives way to the last paid board
    sc.map.setGrid(r.trigger.grid.map((c) => ({ ...c, held: false })));
    this.loopsOff();
    this.music('base', 1.2);
    await this.iris.open(gc.x, gc.y, 0.7);
  }

  /** The POWER train reached a stop: the multiplier steps up and spins are added. */
  private async levelUp(s: SpinResult) {
    const sc = this.scene;
    const m = multOfLevel(s.levelAfter);
    this.play('levelUp');
    sc.meter.setMult(m, true);
    sc.conductor.react('cheer', 1.2);
    sc.rat.react('happy', 1.2);
    this.shake(0.6);
    const names = [t('levelLocal'), t('levelExpress'), t('levelLimited'), t('levelBullet'), t('levelLightning')];
    await this.banner(t('levelUpBanner', { name: names[s.levelAfter] ?? '', mult: m }), 'gold').show(0.7);
    await this.banner(t('plusFreeSpins', { n: s.levelSpins || LEVEL_SPINS }), 'sea').show(0.6);
  }

  private async retrigger(added: number) {
    this.play('retrigger');
    await this.banner(t('plusFreeSpins', { n: added }), 'sea').show(0.62);
  }

  /** A painted display banner over the board (cached per text). */
  private banner(text: string, tone: NumTone): { d: DisplayText; show: (hold: number) => Promise<void> } {
    const sc = this.scene;
    const L = sc.L;
    let b = this.banners.get(`${tone}|${text}`);
    if (!b || b.d.destroyed) {
      const d = displayText(text, { size: L.S * 0.62, tone, treatment: 'banner', res: sc.stage.resolution });
      const maxW = L.frame.w * 0.86;
      d.scale.set(Math.min(1, maxW / (Math.max(1, d.inkWidth) * 1.12)));
      d.visible = false;
      b = { d, k: d.scale.x };
      this.banners.set(`${tone}|${text}`, b);
    }
    const { d, k } = b;
    return {
      d,
      show: async (hold: number) => {
        d.visible = true;
        d.alpha = 1;
        d.rotation = 0;
        d.position.set(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h / 2);
        sc.labelLayer.addChild(d);
        sc.fx.burst(d.x, d.y, 18, 'white', 1.1);
        await done(
          gsap
            .timeline()
            .fromTo(d.scale, { x: 0, y: 0 }, { x: k * 1.12, y: k * 1.12, duration: T(0.3), ease: 'back.out(2.4)' })
            .fromTo(d, { rotation: -0.12 }, { rotation: 0, duration: T(0.5), ease: 'elastic.out(1, .5)' }, 0)
            .to(d.scale, { x: k, y: k, duration: T(0.18), ease: 'sine.out' }, T(0.3))
            .to(d, { alpha: 0, y: d.y - L.S, duration: T(0.4) }, T(0.48 + hold)),
        );
        d.visible = false;
        d.removeFromParent();
        d.scale.set(k);
      },
    };
  }
  private banners = new Map<string, { d: DisplayText; k: number }>();

  /** Big win overlay for a finished base round. */
  async bigWin(multiple: number, ctx: PresentCtx) {
    if (tierFor(multiple) < 0) return;
    const sc = this.scene;
    const bw = new BigWin(sc.L.W, sc.L.H, sc.fx);
    sc.overlay.addChild(bw);
    sc.conductor.react('dance');
    sc.rat.react('happy');
    this.play('bigWinStart');
    this.music('bigwin', 0.3);
    await bw.run(multiple, ctx.fmt, {
      onTier: () => this.play('bigWinTier'),
      onTick: () => this.play('barTick', { volume: 0.5 }),
      auto: ctx.auto,
    });
    this.play('bigWinEnd');
    this.music('base', 1);
    sc.conductor.react('idle');
    sc.rat.react('idle');
  }

  private async maxWin(ctx: PresentCtx) {
    const sc = this.scene;
    this.shake(2);
    sc.fx.coins(sc.L.W / 2, sc.L.H * 1.02, 60, 2, 1.6);
    const bw = new BigWin(sc.L.W, sc.L.H, sc.fx);
    sc.overlay.addChild(bw);
    sc.conductor.react('dance');
    this.play('maxWin');
    await bw.run(MAX_WIN, ctx.fmt, { onTier: () => this.play('bigWinTier'), auto: ctx.auto });
    sc.conductor.react('idle');
  }

  /** Spin pressed while a title card waits: dismiss it (no speed-up). */
  skipCard(): boolean {
    return this.waitingCard?.tap() ?? false;
  }

  /**
   * Speed up whatever is animating (player tapped spin again). Lasts for the current spin only.
   */
  slam() {
    speed.slam = 0.35;
    const now = gsap.globalTimeline.time();
    for (const a of gsap.globalTimeline.getChildren(false, true, true)) {
      if (a.repeat() === -1 || a.totalDuration() > 30 || a.paused()) continue;
      if (a.isActive()) {
        a.timeScale(3);
        this.slammed.push(a);
      } else if (a.startTime() > now) {
        a.startTime(now + (a.startTime() - now) / 3);
        a.timeScale(3);
        this.slammed.push(a);
      }
    }
  }

  unslam() {
    speed.slam = 1;
    for (const a of this.slammed) a.timeScale(1);
    this.slammed = [];
  }
  private slammed: gsap.core.Animation[] = [];
}

export type { SymbolView, Sprite };
