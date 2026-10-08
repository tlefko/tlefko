import { t } from '../../i18n';
import { Container, Graphics, Sprite, BitmapText } from 'pixi.js';
import { motion } from '../characters/motion';
import { sound } from '../../game/sound';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { fuseRailBack, fuseRailFront, fuseRopeLit, fuseFlame, waxSeal, FUSE, type FuseLayout } from '../../art/props';
import { C } from '../../art/kit';
import { spark } from '../../art/fx';
import { bitmapNum } from '../text';
import { T, done } from '../timing';
import { TANTRUM_SIZE } from '../../math/types';
import type { Rect } from '../layout';
import type { Particles } from '../fx/Particles';

/**
 * Heat ramp along the fuse: the powder flares ghost green, yellow, orange, red, crimson and
 * finally violet-white, and the flames grow as they go, so a nearly full fuse looks close to
 * blowing. [core, tip, base] colours, glow tint.
 */
const HEAT: { pal: [string, string, string]; glow: number }[] = [
  { pal: [C.greenGlow, C.green, C.greenMid], glow: 0x7dffb2 },
  { pal: ['#fffbe0', '#ffe95c', '#ffc233'], glow: 0xffd54a },
  { pal: [C.fireCore, C.fireHot, C.fire], glow: 0xff9a2a },
  { pal: ['#ffd9a8', '#ff6a2a', C.fireDeep], glow: 0xff5a1f },
  { pal: ['#ffd0dc', '#ff3a5a', '#b3102f'], glow: 0xff2a50 },
  { pal: ['#ffffff', '#e2bcff', '#9b4dff'], glow: 0xc080ff },
];
/** Which HEAT step each of the TANTRUM_SIZE powder cups uses. */
const heatOf = (i: number) => HEAT[Math.min(HEAT.length - 1, Math.floor((i / TANTRUM_SIZE) * HEAT.length))];
/** Size multiplier per cup: the last flames are the biggest. */
const growOf = (i: number) => 0.8 + 0.45 * (i / (TANTRUM_SIZE - 1));
/** Fractions of the meter width taken by the label plank and the plunder seal. */
const LABEL_W = 0.2;
const BADGE_W = 0.13;

interface Cup {
  flame: Sprite;
  ghost: Sprite;
  glow: Sprite;
  lit: boolean;
  x: number;
  y: number;
  grow: number;
}

/**
 * The Powder Fuse: a braided rope fuse running from the FUSE plank to the plunder seal, with
 * TANTRUM_SIZE iron powder cups along it. Each earned flame burns the fuse on to the next cup
 * and flares it; the last few flicker harder, and a full fuse erupts before the wheel.
 */
export class TantrumMeter extends Container {
  private back = new Sprite();
  private litRope = new Sprite();
  private litMask = new Graphics();
  private front = new Sprite();
  private seal = new Sprite();
  private sparkS = new Sprite();
  private sparkGlow = new Sprite(softDotTexture());
  private cups: Cup[] = [];
  private title?: BitmapText;
  private r: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private t = 0;
  value = 0;
  /** Plunder multiplier shown on the seal at the fuse's end. */
  mult = 1;
  private badge?: BitmapText;
  private badgeGlow = new Sprite(softDotTexture());
  private badgeX = 0;
  private sealK = 1;
  /** Where the fuse is burning (x in stage space) and where it starts. */
  private burn = { x: 0 };
  private ropeX0 = 0;
  private emberAcc = 0;
  private layoutToken = 0;
  /** Seal, glow and number move as one when the seal is stamped. */
  private sealGroup = new Container();
  private splash = new Graphics();
  private splashSt = { r: 0, a: 0 };
  private stampTl?: gsap.core.Timeline;
  /** The spark is running along the rope to the next cup (bigger, brighter, trailing embers). */
  private travel = { k: 0 };
  private trailX = 0;
  fx?: Particles;

  async layout(r: Rect, res: number) {
    // a resize can start a new layout while this one is still rasterising: only the newest applies
    const token = ++this.layoutToken;
    const n = TANTRUM_SIZE;
    const labelW = r.w * LABEL_W;
    const badgeW = r.w * BADGE_W;
    const step = (r.w - labelW - badgeW) / n;
    const badgeX = r.x + r.w - badgeW / 2;
    const u = r.h / 100;
    const xs = Array.from({ length: n }, (_, i) => r.x + labelW + step * (i + 0.5));
    const L: FuseLayout = { aspect: r.w / r.h, labelW: labelW / u, cups: xs.map((x) => (x - r.x) / u), endX: (badgeX - r.x) / u };
    const artH = r.h * ((100 + FUSE.padTop + FUSE.padBottom) / 100);
    const artY = r.y - FUSE.padTop * u;
    const fh = r.h * 0.85;
    const [back, lit, front, seal, sparkT, ghostT, ...fts] = await Promise.all([
      svgTexture('fuse-back', fuseRailBack(L), r.w * res, artH * res),
      svgTexture('fuse-lit', fuseRopeLit(L), r.w * res, artH * res),
      svgTexture('fuse-front', fuseRailFront(L), r.w * res, artH * res),
      svgTexture('fuse-seal', waxSeal(), r.h * 1.1 * res),
      svgTexture('fuse-spark', spark(), r.h * 0.6 * res),
      // the flame still to come: a cool night-blue silhouette in each unlit cup
      svgTexture('fuse-ghost', fuseFlame([C.navyLight, C.navy, C.night]), fh * res),
      ...HEAT.map((h, j) => svgTexture(`fuse-flame-${j}`, fuseFlame(h.pal), fh * res)),
    ]);
    if (token !== this.layoutToken) return;
    this.r = r;
    this.badgeX = badgeX;
    this.ropeX0 = r.x + (L.labelW - 14) * u;
    this.removeChildren();
    // sprites of the previous layout (textures are cached and shared, so they stay)
    for (const c of this.cups) for (const sp of [c.flame, c.ghost, c.glow]) sp.destroy();
    this.title?.destroy();
    this.cups = [];
    for (const [s, tex] of [
      [this.back, back],
      [this.litRope, lit],
      [this.front, front],
    ] as const) {
      s.texture = tex;
      s.position.set(r.x, artY);
      s.width = r.w;
      s.height = artH;
    }
    // the burning stretch of rope is revealed up to the burn point by a unit-wide rect scaled in x
    this.litMask.clear().rect(0, 0, 1, artH).fill({ color: 0xffffff });
    this.litMask.position.set(r.x, artY);
    this.litRope.mask = this.litMask;
    this.addChild(this.back, this.litRope, this.litMask, this.front);
    // label on the plank
    this.title = bitmapNum(t('tantrum'), 'fire', r.h * 0.34, true);
    const room = labelW * 0.78;
    if (this.title.width > room) this.title.scale.set(this.title.scale.x * (room / this.title.width));
    this.title.position.set(r.x + labelW * 0.49, r.y + r.h * 0.47);
    this.addChild(this.title);
    // powder cups: glow, ghost of the flame to come, the flame
    const cupY = r.y + (FUSE.cupRim + 1.5) * u;
    for (let i = 0; i < n; i++) {
      const x = xs[i];
      const heat = heatOf(i);
      const glow = new Sprite(softDotTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = heat.glow;
      glow.width = glow.height = step * 2.2;
      glow.position.set(x, r.y + r.h * 0.34);
      glow.alpha = 0;
      const fl = new Sprite(fts[HEAT.indexOf(heat)]);
      fl.anchor.set(0.5, 0.95);
      fl.position.set(x, cupY);
      fl.scale.set(0);
      const ghost = new Sprite(ghostT);
      ghost.anchor.set(0.5, 0.95);
      ghost.width = ghost.height = Math.min(step * 0.9, fh) * 0.72 * growOf(i);
      ghost.position.set(x, cupY);
      ghost.alpha = 0.5;
      this.addChild(glow, ghost, fl);
      this.cups.push({ flame: fl, ghost, glow, lit: false, x, y: r.y + r.h * 0.3, grow: growOf(i) });
    }
    // the fizzing spark at the burn point
    this.sparkGlow.anchor.set(0.5);
    this.sparkGlow.blendMode = 'add';
    this.sparkGlow.tint = 0xffa53a;
    this.sparkGlow.width = this.sparkGlow.height = r.h * 1.1;
    this.sparkS.texture = sparkT;
    this.sparkS.anchor.set(0.5);
    this.sparkS.blendMode = 'add';
    this.addChild(this.sparkGlow, this.sparkS);
    // plunder seal (seal, glow and number in one group, so a stamp moves them together)
    this.stampTl?.kill();
    this.seal.texture = seal;
    this.seal.anchor.set(0.5);
    this.seal.width = this.seal.height = r.h * 1.1;
    this.sealK = this.seal.scale.x;
    this.seal.position.set(0, 0);
    this.seal.rotation = 0;
    this.badgeGlow.anchor.set(0.5);
    this.badgeGlow.blendMode = 'add';
    this.badgeGlow.tint = 0xff8a2a;
    this.badgeGlow.width = this.badgeGlow.height = r.h * 2.2;
    this.badgeGlow.position.set(0, 0);
    this.sealGroup.removeChildren();
    this.sealGroup.addChild(this.badgeGlow, this.seal);
    this.sealGroup.position.set(this.badgeX, r.y + r.h * 0.5);
    this.sealGroup.scale.set(1);
    this.sealGroup.rotation = 0;
    this.splash.position.set(this.badgeX, r.y + r.h * 0.5);
    this.addChild(this.splash, this.sealGroup);
    this.set(this.value, false);
    this.setMult(this.mult, false);
  }

  /** Where the multiplier badge sits (wheel boosts fly here; cluster multipliers fly from here). */
  badgeCenter() {
    return { x: this.badgeX, y: this.r.y + this.r.h * 0.5 };
  }

  /** Write the multiplier on the seal (dim at x1). */
  private showBadge(m: number) {
    this.badge?.destroy();
    const b = bitmapNum(`x${m}`, m > 1 ? 'fire' : 'white', this.r.h * 0.44, true);
    const room = this.r.h * 0.8;
    if (b.width > room) b.scale.set(b.scale.x * (room / b.width));
    b.position.set(0, 0);
    b.alpha = m > 1 ? 1 : 0.55;
    this.sealGroup.addChild(b);
    this.badge = b;
    this.badgeGlow.alpha = m > 1 ? 0.55 : 0;
    this.seal.tint = m > 1 ? 0xffffff : 0xb9a9a4;
    return b;
  }

  /**
   * Show the plunder multiplier on the seal. When it grows (a grog wheel, a bomb going off) the
   * seal is STAMPED: it lifts and cocks back, slams down onto the rope and squashes, wax splashes
   * out in a ring, the new number is pressed in with the hit, and it springs back.
   */
  setMult(m: number, animate = true) {
    const grew = m > this.mult;
    this.mult = m;
    this.stampTl?.kill();
    const g = this.sealGroup;
    if (!(animate && grew) || !this.cups.length) {
      g.scale.set(1);
      g.rotation = 0;
      g.y = this.r.y + this.r.h * 0.5;
      this.showBadge(m);
      return;
    }
    const y0 = this.r.y + this.r.h * 0.5;
    const red = motion.reduced;
    const lift = red ? 0 : this.r.h * 0.26;
    const tl = gsap
      .timeline()
      .to(g.scale, { x: 1.3, y: 1.3, duration: T(0.1), ease: 'power2.out' }, 0)
      .to(g, { y: y0 - lift, rotation: red ? 0 : -0.24, duration: T(0.1), ease: 'power2.out' }, 0)
      .to(g.scale, { x: red ? 1 : 1.22, y: red ? 1 : 0.8, duration: T(0.07), ease: 'power4.in' }, T(0.1))
      .to(g, { y: y0, rotation: 0, duration: T(0.07), ease: 'power4.in' }, T(0.1))
      .call(
        () => {
          sound.play('sealStamp');
          const b = this.showBadge(m);
          const k = b.scale.x;
          gsap.fromTo(b.scale, { x: k * 1.6, y: k * 1.6 }, { x: k, y: k, duration: T(0.4), ease: 'back.out(2.6)' });
          gsap.fromTo(this.badgeGlow, { alpha: 1 }, { alpha: 0.55, duration: T(0.6) });
          this.splashSt.r = this.r.h * 0.4;
          this.splashSt.a = red ? 0 : 1;
          gsap.to(this.splashSt, { r: this.r.h * 1.15, a: 0, duration: T(0.42), ease: 'power2.out' });
          this.fx?.burst(this.badgeX, y0, Math.round(16 * motion.fx), 'fire', 0.9);
          if (!red) {
            // the rail jolts with the hit
            gsap.fromTo(this, { y: this.r.h * 0.06 }, { y: 0, duration: T(0.3), ease: 'elastic.out(1.2, .35)' });
          }
        },
        [],
        T(0.17),
      )
      .to(g.scale, { x: 1, y: 1, duration: T(0.5), ease: 'elastic.out(1, .4)' }, T(0.17));
    this.stampTl = tl;
  }

  private showCount() {
    for (const c of this.cups) c.ghost.visible = !c.lit;
  }

  private flameScale() {
    const c = this.cups[0];
    // cup spacing: meter width minus the label plank and the plunder seal
    return c ? Math.min(((this.r.w * (1 - LABEL_W - BADGE_W)) / TANTRUM_SIZE) * 0.9, this.r.h * 0.85) / c.flame.texture.width : 1;
  }

  /** Burn point of the fuse for `v` lit cups: a little past the last lit cup, at the seal when full. */
  private burnFor(v: number): number {
    if (v <= 0 || !this.cups.length) return this.ropeX0;
    if (v >= this.cups.length) return this.badgeX;
    const a = this.cups[v - 1].x;
    return a + (this.cups[v].x - a) * 0.38;
  }

  private applyBurn() {
    const w = Math.max(0, this.burn.x - this.r.x);
    this.litMask.scale.x = Math.max(0.001, w);
    const on = this.burn.x > this.ropeX0 + 1 && this.burn.x < this.badgeX - this.r.h * 0.3;
    this.sparkS.visible = this.sparkGlow.visible = on;
    const y = this.r.y + (FUSE.railY / 100) * this.r.h;
    this.sparkS.position.set(this.burn.x, y);
    this.sparkGlow.position.set(this.burn.x, y);
  }

  /** Jump to a value (no fanfare). */
  set(v: number, animate = true) {
    this.value = v;
    const k = this.flameScale();
    this.cups.forEach((c, i) => {
      const on = i < v;
      c.lit = on;
      gsap.killTweensOf(c.flame.scale);
      if (animate) gsap.to(c.flame.scale, { x: on ? k * c.grow : 0, y: on ? k * c.grow : 0, duration: T(0.2) });
      else c.flame.scale.set(on ? k * c.grow : 0);
      c.glow.alpha = on ? 0.55 : 0;
    });
    gsap.killTweensOf(this.burn);
    this.burn.x = this.burnFor(v);
    this.applyBurn();
    this.showCount();
  }

  /**
   * Light flames one by one up to `to` (clamped to the meter size): the spark runs along the rope
   * to each cup, trailing embers, and the powder in the cup flares as it arrives.
   */
  async fill(to: number, onFlame?: (i: number) => void): Promise<void> {
    const k = this.flameScale();
    const target = Math.min(TANTRUM_SIZE, to);
    const tl = gsap.timeline();
    const hop = T(0.11);
    let d = 0;
    if (target > this.value) tl.to(this.travel, { k: 1, duration: T(0.06) }, 0);
    for (let i = this.value; i < target; i++) {
      const c = this.cups[i];
      tl.to(this.burn, { x: c.x, duration: hop, ease: 'power1.inOut', onUpdate: () => this.applyBurn() }, d);
      d += hop;
      tl.call(
        () => {
          c.lit = true;
          c.ghost.visible = false;
          onFlame?.(i + 1);
          this.fx?.embers(c.x, c.y, Math.max(1, Math.round(3 * motion.fx)));
        },
        [],
        d,
      );
      tl.fromTo(c.flame.scale, { x: 0, y: 0 }, { x: k * c.grow * 1.35, y: k * c.grow * 1.6, duration: T(0.12), ease: 'power2.out' }, d);
      tl.to(c.flame.scale, { x: k * c.grow, y: k * c.grow, duration: T(0.2), ease: 'sine.out' }, d + T(0.12));
      tl.fromTo(c.glow, { alpha: 1 }, { alpha: 0.55, duration: T(0.3) }, d);
    }
    this.value = Math.max(this.value, target);
    tl.to(this.burn, { x: this.burnFor(this.value), duration: T(0.12), ease: 'power1.out', onUpdate: () => this.applyBurn() }, d);
    tl.to(this.travel, { k: 0, duration: T(0.2) }, d);
    return done(tl);
  }

  /** The fuse blows: every flame flares, the plank shakes, then it drains to `rest`. */
  async erupt(rest: number): Promise<void> {
    const tl = gsap.timeline();
    const k = this.flameScale();
    this.cups.forEach((c, i) => {
      tl.to(c.flame.scale, { x: k * c.grow * 1.6, y: k * c.grow * 2.2, duration: T(0.18), ease: 'power2.out' }, i * T(0.02));
      tl.to(c.glow, { alpha: 1, duration: T(0.18) }, i * T(0.02));
      tl.call(() => this.fx?.burst(c.x, c.y, 6, 'fire', 0.8), [], i * T(0.02) + T(0.1));
    });
    tl.call(() => this.fx?.burst(this.badgeX, this.r.y + this.r.h * 0.5, 18, 'fire', 1.1), [], T(0.2));
    tl.fromTo(this.seal.scale, { x: this.sealK * 1.25, y: this.sealK * 1.25 }, { x: this.sealK, y: this.sealK, duration: T(0.4), ease: 'back.out(3)' }, T(0.2));
    if (this.title) {
      const lb = this.title;
      tl.to(lb, { rotation: 0.06, duration: 0.05, yoyo: true, repeat: 7 }, 0);
    }
    tl.to({}, { duration: T(0.35) });
    await done(tl);
    this.set(rest);
  }

  update(dtMs: number) {
    this.t += dtMs / 1000;
    const k = this.flameScale();
    const hot = this.value >= TANTRUM_SIZE - 2;
    this.cups.forEach((c, i) => {
      if (!c.lit || gsap.isTweening(c.flame.scale)) return;
      const heat = i / (TANTRUM_SIZE - 1); // 0 at the first cup, 1 at the last
      const n = (Math.sin(this.t * ((hot ? 16 : 9) + heat * 6) + i * 1.7) * 0.5 + Math.sin(this.t * 13.3 + i) * 0.3) * (1 + heat * 0.6);
      c.flame.scale.set(k * c.grow * (1 + n * (hot ? 0.08 : 0.04)), k * c.grow * (1 + n * (hot ? 0.18 : 0.1)));
      c.glow.alpha = 0.5 + n * (hot ? 0.2 : 0.08);
    });
    // the burning fuse fizzes and throws the odd ember; running to a cup it flares and trails
    if (this.sparkS.visible) {
      const run = this.travel.k;
      const s = this.r.h * (0.42 + Math.random() * 0.16) * (1 + run * 0.4);
      this.sparkS.width = this.sparkS.height = s;
      this.sparkS.rotation = Math.random() * Math.PI * 2;
      this.sparkS.alpha = 0.8 + Math.random() * 0.2;
      this.sparkGlow.alpha = 0.45 + Math.random() * 0.2 + run * 0.3;
      this.sparkGlow.width = this.sparkGlow.height = this.r.h * (1.1 + run * 0.5);
      this.emberAcc += dtMs;
      const moved = Math.abs(this.sparkS.x - this.trailX);
      if (this.emberAcc > 140 || (run > 0.5 && moved > this.r.h * 0.3 && !motion.low)) {
        this.emberAcc = 0;
        this.trailX = this.sparkS.x;
        this.fx?.embers(this.sparkS.x, this.sparkS.y - this.r.h * 0.1, 1);
      }
    }
    // wax splash ring from a stamp
    const sp = this.splashSt;
    const sg = this.splash.clear();
    if (sp.a > 0.01) {
      sg.circle(0, 0, sp.r).stroke({ width: this.r.h * 0.14 * sp.a + 1, color: 0xd42c24, alpha: sp.a });
      sg.circle(0, 0, sp.r * 0.9).stroke({ width: this.r.h * 0.04, color: 0xffc233, alpha: sp.a * 0.8 });
    }
  }

  center() {
    return { x: this.r.x + this.r.w * 0.6, y: this.r.y + this.r.h * 0.5 };
  }
}
