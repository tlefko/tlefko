import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture } from '../textures';
import { cellCenter, type Layout, COLS, ROWS } from '../layout';
import { T, done, speed } from '../timing';
import { quality } from '../quality';
import { bitmapNum } from '../text';
import { locoSide, carriage, wheelSprite, LOCO_SIDE, CARRIAGE_SIDE } from '../../art/train';
import { headlightBeam } from '../../art/fx';
import { Sym, type SpinResult, type Train } from '../../math/types';
import type { Particles } from '../fx/Particles';
import type { GridView } from './GridView';
import { rowTrackY, trackGauge } from './Reels';
import type { SymbolView } from './SymbolView';

interface TrainTextures {
  loco: Texture;
  locoGold: Texture;
  cars: Texture[];
  wheel: Texture;
  beam: Texture;
}

/** One train on screen. */
interface Rig {
  root: Container;
  body: Container;
  beam: Sprite;
  wheels: Sprite[];
  tally: BitmapText;
  tallyK: number;
  sum: number;
  /** Nose offset from the root origin (the root sits on the nose). */
  len: number;
}

export interface TrainHooks {
  /** A train starts out of the station (locomotives only; branches use onBranch). */
  onDepart?: (train: Train, index: number) => void;
  /** A coin was picked up: the view has been lifted off the board (the layer releases it). */
  onCollect?: (coin: { pos: number; value: number }, train: Train, index: number, running: number) => void;
  /** A Junction fires (before its branches leave). */
  onSwitch?: (pos: number) => void;
  /** A branch train switches tracks. */
  onBranch?: (train: Train, index: number) => void;
  /** Formats a tally (bet multiples -> currency). */
  fmt: (v: number) => string;
}

/**
 * Trains running along the rows. Every locomotive on reel 1 pulls out of the station and drives
 * its row left to right at one column per beat; each Fare Coin it reaches hops up into the train
 * and the train's tally above the cab counts up. A Junction it passes throws its lever and sends a
 * branch train switching across into the row above / below, which carries on along that row. A
 * train whose track ahead was already run brakes and stops; the others leave the board on the
 * right. The whole run is one timeline built from the engine's Train records, so it is exact.
 */
export class TrainLayer extends Container {
  private tex?: TrainTextures;
  private L!: Layout;
  private maskG = new Graphics();
  private layer = new Container();
  private gen = 0;
  /** Seconds per column at normal speed. */
  static BEAT = 0.3;

  constructor(
    private grid: GridView,
    private fx: Particles,
  ) {
    super();
    this.addChild(this.layer, this.maskG);
    this.layer.mask = this.maskG;
  }

  async layout(L: Layout, res: number) {
    const gen = ++this.gen;
    this.L = L;
    const h = Math.round(L.S * 0.62 * res);
    const w = (vw: number) => Math.round((h * vw) / LOCO_SIDE.h);
    const [loco, locoGold, c0, c1, wheel, beam] = await Promise.all([
      svgTexture('train-loco', locoSide(false, true), w(LOCO_SIDE.w), h),
      svgTexture('train-loco-gold', locoSide(true, true), w(LOCO_SIDE.w), h),
      svgTexture('train-car0', carriage(0, true), w(320), h),
      svgTexture('train-car1', carriage(1, true), w(320), h),
      svgTexture('train-wheel', wheelSprite(), Math.round(L.S * 0.22 * res)),
      svgTexture('train-beam', headlightBeam(), Math.round(L.S * 2.2 * res), Math.round(L.S * 0.55 * res)),
    ]);
    if (gen !== this.gen) return;
    this.tex = { loco, locoGold, cars: [c0, c1], wheel, beam };
    const pad = L.S * 0.04;
    this.maskG.clear().rect(L.grid.x - pad, L.grid.y - L.S * 0.6, L.grid.w + pad * 2, L.grid.h + L.S * 0.65).fill({ color: 0xffffff });
  }

  textures(): Texture[] {
    const t = this.tex;
    return t ? [t.loco, t.locoGold, ...t.cars, t.wheel, t.beam] : [];
  }

  /** The y a train rides at on a row (its wheels on the row's track). */
  private rowY(row: number) {
    // the wheels (bottom at ~0.45 of the train's height below its centre) sit on the lower rail
    return rowTrackY(this.L, row) + trackGauge(this.L) / 2 - this.L.S * 0.62 * 0.45;
  }
  private colX(c: number) {
    return cellCenter(this.L, c, 0).x;
  }

  private makeRig(golden: boolean, variant: number, fmt: (v: number) => string): Rig {
    const t = this.tex!;
    const S = this.L.S;
    const h = S * 0.62;
    const root = new Container();
    const body = new Container();
    const loco = new Sprite(golden ? t.locoGold : t.loco);
    loco.anchor.set(1, 0.5);
    loco.height = h;
    loco.scale.x = loco.scale.y;
    const car = new Sprite(t.cars[variant % t.cars.length]);
    car.anchor.set(1, 0.5);
    car.height = h;
    car.scale.x = car.scale.y;
    car.x = -loco.width + S * 0.03;
    const wheels: Sprite[] = [];
    // wheels sit BEHIND the bodies (drawn without wheels): the skirts overlap their tops; the art's
    // wheel sprite has a tyre radius of 29 in its 64 box
    const ky = h / LOCO_SIDE.h;
    const addWheels = (list: readonly (readonly number[])[], left: number, kx: number) => {
      for (const [wx, wy, wr] of list) {
        const s = new Sprite(t.wheel);
        s.anchor.set(0.5);
        s.width = s.height = 64 * (wr / 29) * ky;
        s.position.set(left + wx * kx, -h / 2 + wy * ky);
        wheels.push(s);
      }
    };
    addWheels(LOCO_SIDE.wheels, -loco.width, loco.width / LOCO_SIDE.w);
    addWheels(CARRIAGE_SIDE.wheels, car.x - car.width, car.width / CARRIAGE_SIDE.w);
    const beam = new Sprite(t.beam);
    beam.anchor.set(0, 0.5);
    beam.blendMode = 'add';
    beam.width = S * 2.2;
    beam.height = S * 0.55;
    beam.position.set(-S * 0.02, -h / 2 + LOCO_SIDE.lamp[1] * ky);
    beam.alpha = 0.85;
    body.addChild(...wheels, car, loco);
    if (!quality.low) body.addChildAt(beam, 0);
    root.addChild(body);
    const tally = bitmapNum(fmt(0), golden ? 'gold' : 'white', S * 0.34);
    tally.position.set(-loco.width * 0.55, -h * 0.95);
    tally.visible = false;
    root.addChild(tally);
    return { root, body, beam, wheels, tally, tallyK: tally.scale.x, sum: 0, len: loco.width + car.width };
  }

  private bumpTally(r: Rig, v: number, fmt: (v: number) => string) {
    r.sum = Math.round((r.sum + v) * 100) / 100;
    r.tally.text = fmt(r.sum);
    r.tally.visible = true;
    gsap.killTweensOf(r.tally.scale);
    gsap.fromTo(r.tally.scale, { x: r.tallyK * 1.5, y: r.tallyK * 1.5 }, { x: r.tallyK, y: r.tallyK, duration: T(0.3), ease: 'back.out(3)' });
  }

  /**
   * Run every train of a spin. Resolves when the last train has left (or stopped) with the tallies
   * gathered at `gather` (stage coords) — the caller then shows the haul.
   */
  async run(spin: SpinResult, hooks: TrainHooks, gather: { x: number; y: number }): Promise<void> {
    if (!this.tex || !spin.trains.length) return;
    const S = this.L.S;
    const beat = T(TrainLayer.BEAT) * (spin.trains.length > 3 ? 0.85 : 1);
    const switchDur = T(0.22);
    const tl = gsap.timeline();
    const rigs: Rig[] = [];
    /** Start delay (lag) of each train behind the global column clock. */
    const lag: number[] = [];
    const lead = T(0.25); // the locomotive revs before it pulls out
    spin.trains.forEach((tr, i) => {
      const golden = tr.parent < 0 && !!spin.grid[tr.row]?.golden;
      const rig = this.makeRig(golden, i, hooks.fmt);
      rigs.push(rig);
      lag[i] = tr.parent < 0 ? 0 : lag[tr.parent] + switchDur;
      const y = this.rowY(tr.row);
      const t0 = lead + tr.from * beat + lag[i];
      // start: a locomotive's nose sits on reel 1's cell, its body in the station (masked off);
      // a branch starts on the Junction's row and switches across into its own row
      const x0 = this.colX(tr.from);
      if (tr.parent < 0) {
        rig.root.position.set(x0 - S * 0.25, y);
        rig.root.alpha = 0;
        tl.call(() => hooks.onDepart?.(tr, i), [], 0);
        tl.to(rig.root, { alpha: 1, duration: T(0.12) }, 0);
        tl.to(rig.root, { x: x0, duration: lead, ease: 'power2.in' }, 0);
        // the locomotive symbol on reel 1 bows out under the train
        const v = this.grid.views[tr.row];
        if (v) tl.to(v, { alpha: 0.25, duration: T(0.2) }, lead * 0.5);
      } else {
        const from = spin.trains[tr.parent];
        const yFrom = this.rowY(from.row);
        rig.root.position.set(x0, yFrom);
        rig.root.alpha = 0;
        rig.root.scale.set(0.6);
        tl.call(() => hooks.onBranch?.(tr, i), [], t0 - switchDur);
        tl.to(rig.root, { alpha: 1, duration: switchDur * 0.4 }, t0 - switchDur);
        tl.to(rig.root, { y, duration: switchDur, ease: 'power2.inOut' }, t0 - switchDur);
        tl.to(rig.root.scale, { x: 1, y: 1, duration: switchDur, ease: 'back.out(2)' }, t0 - switchDur);
        tl.to(rig.body, { rotation: (tr.row > from.row ? 1 : -1) * 0.18, duration: switchDur * 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t0 - switchDur);
      }
      this.layer.addChild(rig.root);
      // drive: one column per beat
      const cols = tr.to - tr.from;
      if (cols > 0) tl.to(rig.root, { x: this.colX(tr.to), duration: cols * beat, ease: 'none' }, t0);
      // wheels roll and the body bobs over the rail joints while it moves
      const runEnd = t0 + cols * beat;
      const ends = tr.to === COLS - 1;
      const exitDur = ends ? beat * 2.2 : T(0.3);
      for (const w of rig.wheels) tl.to(w, { rotation: `+=${Math.PI * 2 * (cols + (ends ? 4 : 0.3))}`, duration: runEnd - t0 + exitDur, ease: 'none' }, t0);
      tl.to(rig.body, { y: -S * 0.02, duration: beat / 2, yoyo: true, repeat: Math.max(1, cols * 2 + 1), ease: 'sine.inOut' }, t0);
      // coins: collected as the nose reaches each one
      for (const coin of tr.coins) {
        const c = Math.floor(coin.pos / ROWS);
        const at = t0 + (c - tr.from) * beat + (tr.parent >= 0 && c === tr.from ? 0 : -beat * 0.15);
        tl.call(() => this.collect(coin, rig, tr, i, hooks), [], Math.max(0, at));
      }
      // junctions: the lever throws as the nose arrives
      for (const sw of tr.switches) {
        const c = Math.floor(sw / ROWS);
        tl.call(() => this.throwSwitch(sw, hooks), [], t0 + (c - tr.from) * beat - T(0.05));
      }
      if (ends) {
        tl.to(rig.root, { x: this.colX(COLS - 1) + S * 0.6 + rig.len, duration: exitDur, ease: 'power1.in' }, runEnd);
      } else {
        // brakes: the cell ahead is already run; a jolt, a puff of steam, then it fades into the tally
        tl.to(rig.body, { x: S * 0.06, duration: T(0.08), yoyo: true, repeat: 1, ease: 'power2.out' }, runEnd);
        tl.call(() => this.fx.smoke(rig.root.x - S * 0.2, rig.root.y - S * 0.3, quality.low ? 2 : 5, 0.6, 0xdfe7ea), [], runEnd);
        tl.to(rig.body, { alpha: 0, duration: T(0.35) }, runEnd + T(0.2));
      }
      // sparks off the rails while running (not at low quality)
      if (!quality.low && !speed.reduced) {
        for (let k = 0; k <= cols; k++) tl.call(() => this.fx.sparks(rig.root.x - rig.len * 0.15, rig.root.y + S * 0.26, 2, 0.35, Math.PI, 0.9), [], t0 + k * beat);
      }
    });
    const end = tl.duration();
    // tallies fly to the gathering point
    rigs.forEach((r, i) => {
      const tr = spin.trains[i];
      if (!tr.coins.length) return;
      tl.call(
        () => {
          const g = r.tally.getGlobalPosition();
          const local = this.toLocal(g);
          r.tally.removeFromParent();
          this.addChild(r.tally);
          r.tally.position.copyFrom(local);
          gsap.to(r.tally, { x: gather.x, y: gather.y, duration: T(0.35), ease: 'power2.in' });
          gsap.to(r.tally, { alpha: 0, duration: T(0.12), delay: T(0.3) });
        },
        [],
        Math.min(end, (lag[i] ?? 0) + lead + tr.to * beat + T(0.35)),
      );
    });
    tl.to({}, { duration: T(0.42) }, end);
    await done(tl);
    for (const r of rigs) {
      gsap.killTweensOf(r.tally);
      r.root.destroy({ children: true });
      if (!r.tally.destroyed) r.tally.destroy();
    }
  }

  private collect(coin: { pos: number; value: number }, rig: Rig, tr: Train, i: number, hooks: TrainHooks) {
    const v = this.grid.lift(coin.pos);
    const S = this.L.S;
    this.bumpTally(rig, coin.value, hooks.fmt);
    hooks.onCollect?.(coin, tr, i, rig.sum);
    if (!v) return;
    // the coin hops up into the car with a spin and a sparkle
    v.stopWin();
    const tx = rig.root.x - rig.len * 0.45;
    const ty = rig.root.y - S * 0.15;
    v.showValueText(false);
    this.fx.coins(v.x, v.y, quality.low ? 2 : 5, 2, 0.6);
    this.fx.glint(v.x, v.y, 0.45);
    gsap
      .timeline({ onComplete: () => this.grid.release(v as SymbolView) })
      .to(v, { y: v.y - S * 0.45, duration: T(0.14), ease: 'power2.out' })
      .to(v.scale, { x: 0.25, y: 0.25, duration: T(0.24), ease: 'power2.in' }, 0)
      .to(v, { x: tx + S * 0.3, y: ty, duration: T(0.18), ease: 'power2.in' }, T(0.1))
      .to(v, { alpha: 0, duration: T(0.08) }, T(0.22));
  }

  private throwSwitch(pos: number, hooks: TrainHooks) {
    const v = this.grid.views[pos];
    hooks.onSwitch?.(pos);
    if (!v || v.sym !== Sym.SWITCH) return;
    void v.setLit(true);
    v.heartbeat(1.2);
    if (!quality.low) this.fx.sparks(v.x, v.y, 10, 0.8);
  }

  clear() {
    this.gen++;
    for (const c of [...this.layer.children]) c.destroy({ children: true });
  }
}
