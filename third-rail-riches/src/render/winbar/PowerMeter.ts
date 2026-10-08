import { t } from '../../i18n';
import { BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { METER, meterBack, meterRailLit, multSeal, stationStop, type MeterLayout } from '../../art/meter';
import { locoSide } from '../../art/train';
import { bitmapNum } from '../text';
import { T, done } from '../timing';
import { POWER_MULTS, POWER_STEPS } from '../../math/types';
import type { Rect } from '../layout';
import type { Particles } from '../fx/Particles';
import { quality } from '../quality';

/** Fractions of the meter width taken by the label plate and the multiplier seal. */
const LABEL_W = 0.19;
const BADGE_W = 0.13;
const FULL = POWER_STEPS[POWER_STEPS.length - 1];

interface Stop {
  off: Sprite;
  on: Sprite;
  glow: Sprite;
  label: BitmapText;
  x: number;
  lit: boolean;
}

/**
 * The POWER meter: a little train runs along a line of track toward four station stops (x2, x3,
 * x5, x10). Every passenger a train collects in the free spins moves it on; the rail behind it
 * lights electric blue; reaching a stop lights the station and stamps the new multiplier on the
 * brass seal at the end. In the base game the sign is dimmed and shows x1.
 */
export class PowerMeter extends Container {
  private back = new Sprite();
  private lit = new Sprite();
  private litMask = new Graphics();
  private train = new Sprite();
  private trainGlow = new Sprite(softDotTexture());
  private seal = new Sprite();
  private sealHot = new Sprite();
  private sealGroup = new Container();
  private sealGlow = new Sprite(softDotTexture());
  private multText?: BitmapText;
  private multK = 1;
  private title?: BitmapText;
  private stops: Stop[] = [];
  private r: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private x0 = 0;
  private x1 = 1;
  private railY = 0;
  private sealX = 0;
  private token = 0;
  private t = 0;
  private pos = { p: 0 };
  value = 0;
  mult = 1;
  active = false;
  fx?: Particles;

  async layout(r: Rect, res: number) {
    const token = ++this.token;
    const u = r.h / 100;
    const labelW = r.w * LABEL_W;
    const badgeW = r.w * BADGE_W;
    const sealX = r.x + r.w - badgeW / 2;
    const L: MeterLayout = { aspect: r.w / r.h, labelW: labelW / u, trackX0: labelW / u + 26, trackX1: (r.w - badgeW) / u - 10, sealX: (sealX - r.x) / u };
    const artH = r.h * ((100 + METER.padTop + METER.padBottom) / 100);
    const artW = r.w + 20 * u;
    const [back, lit, stopOff, stopOn, seal, sealHot, trainT] = await Promise.all([
      svgTexture('meter-back', meterBack(L), artW * res, artH * res),
      svgTexture('meter-lit', meterRailLit(L), artW * res, artH * res),
      svgTexture('meter-stop-off', stationStop(false), r.h * 0.62 * res),
      svgTexture('meter-stop-on', stationStop(true), r.h * 0.62 * res),
      svgTexture('meter-seal', multSeal(false), r.h * 1.15 * res),
      svgTexture('meter-seal-hot', multSeal(true), r.h * 1.15 * res),
      svgTexture('meter-train', locoSide(false, false), r.h * 0.9 * res, r.h * 0.45 * res),
    ]);
    if (token !== this.token) return;
    this.r = r;
    this.x0 = r.x + L.trackX0 * u;
    this.x1 = r.x + L.trackX1 * u;
    this.railY = r.y + METER.railY * u;
    this.sealX = sealX;
    for (const s of this.stops) for (const o of [s.off, s.on, s.glow, s.label]) o.destroy();
    this.stops = [];
    this.title?.destroy();
    this.removeChildren();
    const artY = r.y - METER.padTop * u;
    for (const [s, tex] of [
      [this.back, back],
      [this.lit, lit],
    ] as const) {
      s.texture = tex;
      s.position.set(r.x - 10 * u, artY);
      s.width = artW;
      s.height = artH;
    }
    this.litMask.clear().rect(0, 0, 1, artH).fill({ color: 0xffffff });
    this.litMask.position.set(this.x0, artY);
    this.lit.mask = this.litMask;
    this.addChild(this.back, this.lit, this.litMask);
    // label
    this.title = bitmapNum(t('powerLabel'), 'white', r.h * 0.36, true);
    const room = labelW * 0.8;
    if (this.title.width > room) this.title.scale.set(this.title.scale.x * (room / this.title.width));
    this.title.position.set(r.x + labelW * 0.47, r.y + r.h * 0.55);
    this.addChild(this.title);
    // station stops
    POWER_STEPS.forEach((need, i) => {
      const x = this.xOf(need);
      const y = r.y + r.h * 0.34;
      const mk = (tex: typeof stopOff) => {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.width = s.height = r.h * 0.62;
        s.position.set(x, y);
        return s;
      };
      const glow = new Sprite(softDotTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = 0x5fd3a1;
      glow.width = glow.height = r.h * 1.4;
      glow.position.set(x, y);
      glow.alpha = 0;
      const off = mk(stopOff);
      const on = mk(stopOn);
      on.alpha = 0;
      const label = bitmapNum(`x${POWER_MULTS[i + 1]}`, 'white', r.h * 0.26);
      label.position.set(x, y + r.h * 0.01);
      this.addChild(glow, off, on, label);
      this.stops.push({ off, on, glow, label, x, lit: false });
    });
    // the train
    this.trainGlow.anchor.set(0.5);
    this.trainGlow.blendMode = 'add';
    this.trainGlow.tint = 0x3fc8ff;
    this.trainGlow.width = r.h * 1.4;
    this.trainGlow.height = r.h * 0.8;
    this.train.texture = trainT;
    // the nose leads: at power 0 the train sits on the track, clear of the label
    this.train.anchor.set(0.15, 0.78);
    this.train.height = r.h * 0.45;
    this.train.scale.x = this.train.scale.y;
    this.addChild(this.trainGlow, this.train);
    // seal
    this.seal.texture = seal;
    this.sealHot.texture = sealHot;
    for (const s of [this.seal, this.sealHot]) {
      s.anchor.set(0.5);
      s.width = s.height = r.h * 1.15;
      s.position.set(0, 0);
    }
    this.sealGlow.anchor.set(0.5);
    this.sealGlow.blendMode = 'add';
    this.sealGlow.tint = 0xffb43c;
    this.sealGlow.width = this.sealGlow.height = r.h * 2.3;
    this.sealGlow.alpha = 0.25;
    this.sealGroup.removeChildren();
    this.sealGroup.addChild(this.sealGlow, this.seal, this.sealHot);
    this.sealGroup.position.set(sealX, r.y + r.h * 0.54);
    this.addChild(this.sealGroup);
    this.set(this.value, false);
    this.setMult(this.mult, false);
    this.setActive(this.active, false);
  }

  private xOf(power: number) {
    return this.x0 + (this.x1 - this.x0) * Math.min(1, Math.max(0, power / FULL));
  }

  /** Where the multiplier seal sits. */
  badgeCenter() {
    return { x: this.sealX, y: this.r.y + this.r.h * 0.54 };
  }

  /** Where the little train is (coins fly here). */
  trainPoint() {
    return { x: this.train.x - this.train.width * 0.35, y: this.train.y - this.train.height * 0.4 };
  }

  center() {
    return { x: this.r.x + this.r.w / 2, y: this.r.y + this.r.h / 2 };
  }

  /** Base game: dimmed at x1. Free spins: lit up. */
  setActive(on: boolean, animate = true) {
    this.active = on;
    const a = on ? 1 : 0.62;
    if (animate) gsap.to(this, { alpha: a, duration: T(0.4) });
    else this.alpha = a;
  }

  private place() {
    const x = this.xOf(this.pos.p);
    this.train.position.set(x, this.railY + this.r.h * 0.06);
    this.trainGlow.position.set(x - this.train.width * 0.3, this.railY);
    this.litMask.scale.x = Math.max(0.001, x - this.x0);
  }

  /** Jump to a passenger count (no animation): stops at or below it are lit. */
  set(power: number, animate = true) {
    this.value = power;
    gsap.killTweensOf(this.pos);
    this.pos.p = power;
    this.place();
    POWER_STEPS.forEach((need, i) => this.lightStop(i, power >= need, animate && power >= need));
  }

  private lightStop(i: number, on: boolean, animate: boolean) {
    const s = this.stops[i];
    if (!s || s.lit === on) return;
    s.lit = on;
    gsap.killTweensOf([s.on, s.glow, s.label.scale]);
    if (!animate) {
      s.on.alpha = on ? 1 : 0;
      s.glow.alpha = on ? 0.5 : 0;
      return;
    }
    const k = s.label.scale.x;
    gsap.to(s.on, { alpha: on ? 1 : 0, duration: T(0.18) });
    gsap.fromTo(s.glow, { alpha: 1 }, { alpha: 0.5, duration: T(0.6), ease: 'power2.out' });
    gsap.fromTo(s.label.scale, { x: k * 1.8, y: k * 1.8 }, { x: k, y: k, duration: T(0.45), ease: 'back.out(3)' });
    if (this.fx && !quality.low) this.fx.sparks(s.x, s.on.y, 12, 0.9);
  }

  /**
   * Move the train on to `to` passengers, one passenger at a time (onStep per passenger); a stop it
   * reaches lights up. Resolves when the train has arrived.
   */
  async advance(to: number, onStep?: (i: number) => void): Promise<void> {
    const from = this.value;
    if (to <= from) return;
    this.value = to;
    const n = to - from;
    const per = T(Math.max(0.05, Math.min(0.12, 0.6 / n)));
    const tl = gsap.timeline();
    for (let k = 1; k <= n; k++) {
      const p = from + k;
      tl.to(this.pos, { p, duration: per, ease: 'power1.inOut', onUpdate: () => this.place() }, (k - 1) * per);
      tl.call(
        () => {
          onStep?.(p);
          const i = POWER_STEPS.indexOf(p);
          if (i >= 0) this.lightStop(i, true, true);
          if (this.fx && !quality.low) this.fx.sparks(this.train.x, this.railY + this.r.h * 0.1, 2, 0.4, Math.PI, 0.8);
        },
        [],
        k * per,
      );
    }
    await done(tl);
  }

  /** Stamp a multiplier on the seal (a level-up): a squash, a flip of the number, a glow burst. */
  setMult(m: number, animate = true) {
    this.mult = m;
    const r = this.r;
    this.multText?.destroy();
    const txt = bitmapNum(`x${m}`, m > 1 ? 'gold' : 'white', r.h * (m >= 10 ? 0.38 : 0.46));
    this.multK = txt.scale.x;
    this.sealGroup.addChild(txt);
    this.multText = txt;
    this.sealHot.alpha = m > 1 ? 1 : 0;
    if (!animate) return;
    const g = this.sealGroup;
    gsap.killTweensOf(g.scale);
    gsap
      .timeline()
      .to(g.scale, { x: 1.35, y: 0.75, duration: T(0.08), ease: 'power2.in' })
      .to(g.scale, { x: 1, y: 1, duration: T(0.5), ease: 'elastic.out(1, .4)' });
    gsap.fromTo(this.sealGlow, { alpha: 1 }, { alpha: 0.35, duration: T(0.8), ease: 'power2.out' });
    gsap.fromTo(txt.scale, { x: this.multK * 2, y: this.multK * 2 }, { x: this.multK, y: this.multK, duration: T(0.5), ease: 'back.out(3)' });
    if (this.fx && !quality.low) this.fx.burst(this.sealX, this.r.y + this.r.h * 0.5, 14, 'white', 1);
  }

  update(dtMs: number) {
    this.t += dtMs / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.1);
    this.trainGlow.alpha = this.active ? 0.35 + pulse * 0.3 : 0.15;
    this.lit.alpha = this.active ? 0.75 + pulse * 0.25 : 0.4;
    if (this.mult > 1) this.sealGlow.alpha = Math.max(this.sealGlow.alpha * 0.98, 0.25 + pulse * 0.2);
  }
}
