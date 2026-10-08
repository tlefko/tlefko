import { Container, Sprite, Graphics, Texture } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import {
  wheelFace,
  wheelRim,
  wheelShadow,
  wheelWinMark,
  wheelDim,
  wheelHub,
  wheelPointer,
  wheelIcon,
  wheelIconFit,
  WHEEL_ICON_BOX,
  bulbGlow,
  WHEEL_SEGMENTS,
  HELM,
  HUB_BEZEL,
  POINTER_PIVOT,
  POINTER_TIP,
  type SegKind,
} from '../../art/props';
import { bitmapNum, displayText, type DisplayText, type NumTone } from '../text';
import { t } from '../../i18n';
import { T, done } from '../timing';
import { motion } from '../characters/motion';
import { sound } from '../../game/sound';
import { cast } from '../characters/cast';
import type { WheelOutcome } from '../../math/types';

export interface WheelTextures {
  /** The helm itself (handles, rim, lamps, painted dial): turns as one piece. */
  face: Texture;
  /** Static light over it: rim shading, dial sheen, moonlight edge. */
  rim: Texture;
  /** Blurred silhouette, turned with the face and offset down as its cast shadow. */
  shadow: Texture;
  /** Glowing outline laid over the landed segment. */
  win: Texture;
  /** Shade over the other segments once it lands. */
  dim: Texture;
  hub: Texture;
  pointer: Texture;
  bulb: Texture;
  /** Each segment's icon on its own: it lifts off the dial when that segment lands. */
  icons?: Partial<Record<SegKind, Texture>>;
}

const KINDS: SegKind[] = ['hounds', 'inferno', 'boost', 'cash', 'bomb'];
/** The textures are built for S*2.35 but the wheel is shown at up to S*2.7, so rasterise a bit larger. */
const OVERSAMPLE = 1.18;
/** The landed icon grows to this many times its size on the dial. */
const ICON_POP = 1.9;
const hubSize = (D: number) => ((HELM.hub / 512) * D * 256) / HUB_BEZEL;
const pointerSize = (D: number) => (((HELM.ptrPivot - HELM.ptrTip) / 512) * D * 128) / (POINTER_TIP[1] - POINTER_PIVOT[1]);
/** On-screen width of a segment icon's 128 box, matching the icon painted on a dial of size D. */
const iconSize = (kind: SegKind, D: number) => (128 / WHEEL_ICON_BOX) * 100 * wheelIconFit(kind)[0] * (D / 512);

export async function buildWheelTextures(D: number, res: number): Promise<WheelTextures> {
  const px = Math.round(D * res * OVERSAMPLE);
  const [face, rim, shadow, win, dim, hub, pointer, bulb, ...icons] = await Promise.all([
    svgTexture('wheel-face', wheelFace(), px),
    svgTexture('wheel-light', wheelRim(), px * 0.75),
    svgTexture('wheel-shadow', wheelShadow(), px * 0.4),
    svgTexture('wheel-win', wheelWinMark(), px * 0.75),
    svgTexture('wheel-dim', wheelDim(), px * 0.75),
    svgTexture('wheel-hub', wheelHub(), hubSize(px)),
    svgTexture('wheel-ptr', wheelPointer(), pointerSize(px)),
    svgTexture('wheel-bulb', bulbGlow(), px * 0.1),
    ...KINDS.map((k) => svgTexture(`wheel-icon-${k}`, wheelIcon(k), iconSize(k, px) * ICON_POP)),
  ]);
  return { face, rim, shadow, win, dim, hub, pointer, bulb, icons: Object.fromEntries(KINDS.map((k, i) => [k, icons[i]])) };
}

/** Word labels (KEGS, BROADSIDE) are painted once in the display lettering and shared by every reveal. */
const words = new Map<string, DisplayText>();
const wordSize = (D: number) => D * 0.2;
function wordLabel(text: string, tone: NumTone, D: number): DisplayText {
  const key = `${text}|${tone}|${wordSize(D).toFixed(1)}`;
  let d = words.get(key);
  if (!d || d.destroyed) {
    d = displayText(text, { size: wordSize(D), tone, treatment: 'banner' });
    words.set(key, d);
  }
  return d;
}

/** The wheel segment kind an outcome lands on (the kind itself, including the Kaboom Bomb). */
export function segKindFor(o: WheelOutcome): SegKind {
  return o.kind;
}

const SEG = WHEEL_SEGMENTS.length;
const SEG_ANGLE = (Math.PI * 2) / SEG;
/** Most samples averaged for the motion blur of a fast spin (the face plus up to BLUR-1 ghosts). */
const BLUR = 8;
/** Largest angle between two blur samples (radians): the count adapts to the turn per frame. */
const BLUR_STEP = 0.09;
/** Below this turn per frame (radians) the helm is drawn sharp. */
const BLUR_MIN = 0.012;
const SPARKS = 12;

/**
 * The Captain's Wheel: a ship's helm that bursts out of the crib, swings into place and lights its
 * lamps one by one; the pointer drops onto its pivot. A spin pulls back first, lets go, slows
 * across the last pegs, rides a hair past the winner and settles back onto it. On landing the
 * winning segment glows, the rest dims, sparks fly off the pointer and the segment's icon lifts
 * off the dial into the middle, where it bursts into the value (reveal).
 */
export class Wheel extends Container {
  private ambient = new Sprite(softDotTexture());
  private castShadow: Sprite;
  private glow = new Sprite(softDotTexture());
  private ring = new Graphics();
  private ghosts: Sprite[] = [];
  /** Everything that turns. */
  private spinner = new Container();
  private face: Sprite;
  private winMark: Sprite;
  private dim: Sprite;
  private light: Sprite;
  private hub: Sprite;
  private hubK = 1;
  private pointer: Sprite;
  private pointerY = 0;
  private bulbs: Sprite[] = [];
  private sparks: { s: Sprite; vx: number; vy: number; life: number; age: number }[] = [];
  private iconPop = new Sprite();
  private iconTex: Partial<Record<SegKind, Texture>>;
  private labelGlow = new Sprite(softDotTexture());
  private D: number;
  onTick?: (i: number) => void;
  private lastSeg = 0;
  private prevRot = 0;
  private chase = 0;
  private spinning = false;
  private landed = false;
  private blinkUntil = 0;
  private appearK = 1;
  private t = 0;
  /** Set by appear(): this is the round's wheel (the splash's demo wheel never cues the crew). */
  private live = false;
  /** The segment it last landed on (a bomb reveal gets its own sting). */
  private landedKind: SegKind | null = null;
  private anims: gsap.core.Animation[] = [];

  constructor(tex: WheelTextures, D: number) {
    super();
    this.D = D;
    this.iconTex = tex.icons ?? {};
    this.eventMode = 'none';
    const u = D / 512;
    this.ambient.anchor.set(0.5);
    this.ambient.tint = 0x000000;
    this.ambient.alpha = 0.5;
    this.ambient.width = this.ambient.height = D * 1.18;
    this.ambient.y = D * 0.05;
    this.castShadow = new Sprite(tex.shadow);
    this.castShadow.anchor.set(0.5);
    this.castShadow.width = this.castShadow.height = D;
    this.castShadow.position.set(D * 0.014, D * 0.04);
    this.castShadow.alpha = 0.6;
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = 0xffb347;
    this.glow.width = this.glow.height = D * 1.6;
    this.glow.alpha = 0;
    for (let i = 1; i < BLUR; i++) {
      const g = new Sprite(tex.face);
      g.anchor.set(0.5);
      g.width = g.height = D;
      g.visible = false;
      this.ghosts.push(g);
    }
    this.face = new Sprite(tex.face);
    this.face.anchor.set(0.5);
    this.face.width = this.face.height = D;
    this.winMark = new Sprite(tex.win);
    this.winMark.anchor.set(0.5);
    this.winMark.width = this.winMark.height = D;
    this.winMark.blendMode = 'add';
    this.winMark.alpha = 0;
    this.dim = new Sprite(tex.dim);
    this.dim.anchor.set(0.5);
    this.dim.width = this.dim.height = D;
    this.dim.alpha = 0;
    this.spinner.addChild(this.face, this.dim, this.winMark);
    for (const a of HELM.lamps) {
      const b = new Sprite(tex.bulb);
      b.anchor.set(0.5);
      const r = HELM.lampR * u;
      b.position.set(Math.sin((a * Math.PI) / 180) * r, -Math.cos((a * Math.PI) / 180) * r);
      b.width = b.height = D * 0.085;
      b.blendMode = 'add';
      b.alpha = 0.3;
      this.bulbs.push(b);
      this.spinner.addChild(b);
    }
    this.light = new Sprite(tex.rim);
    this.light.anchor.set(0.5);
    this.light.width = this.light.height = D;
    this.hub = new Sprite(tex.hub);
    this.hub.anchor.set(0.5);
    this.hub.width = this.hub.height = hubSize(D);
    this.hubK = this.hub.scale.x;
    this.pointer = new Sprite(tex.pointer);
    this.pointer.anchor.set(POINTER_PIVOT[0] / 128, POINTER_PIVOT[1] / 128);
    this.pointer.width = this.pointer.height = pointerSize(D);
    this.pointerY = -HELM.ptrPivot * u;
    this.pointer.y = this.pointerY;
    this.iconPop.anchor.set(0.5, 66 / 128);
    this.iconPop.visible = false;
    this.labelGlow.anchor.set(0.5);
    this.labelGlow.blendMode = 'add';
    this.labelGlow.alpha = 0;
    for (let i = 0; i < SPARKS; i++) {
      const s = new Sprite(tex.bulb);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.sparks.push({ s, vx: 0, vy: 0, life: 0, age: 1 });
    }
    this.addChild(this.ambient, this.castShadow, this.glow, this.ring, ...this.ghosts, this.spinner, this.light, this.hub, this.pointer, this.labelGlow, this.iconPop, ...this.sparks.map((p) => p.s));
  }

  private track<A extends gsap.core.Animation>(a: A): A {
    this.anims.push(a);
    if (this.anims.length > 40) this.anims = this.anims.filter((x) => x.isActive());
    return a;
  }

  /** An expanding ink-and-gold shock ring from the centre (appear, landing). */
  private shock(r0: number, r1: number, color: number, dur: number) {
    if (motion.reduced) return;
    const st = { r: r0, a: 0.9 };
    this.track(
      gsap.to(st, {
        r: r1,
        a: 0,
        duration: T(dur),
        ease: 'power2.out',
        onUpdate: () => {
          const g = this.ring.clear();
          if (st.a <= 0.01) return;
          g.circle(0, 0, st.r).stroke({ width: this.D * 0.035 * st.a + 1, color, alpha: st.a });
          g.circle(0, 0, st.r * 0.94).stroke({ width: this.D * 0.012, color: 0xfff0b0, alpha: st.a * 0.7 });
        },
        onComplete: () => void this.ring.clear(),
      }),
    );
  }

  /**
   * Burst out of the crib: a flash and a shock ring, the helm swings round into place with an
   * overshoot, the hub pops, lamps light round the rim one by one and the pointer drops on.
   */
  appear(): Promise<void> {
    this.live = true;
    cast.parrot?.accent('squawk');
    const D = this.D;
    const red = motion.reduced;
    this.scale.set(red ? 0.6 : 0.12);
    this.alpha = 0;
    const rot = Math.random() * Math.PI * 2;
    this.spinner.rotation = rot - (red ? 0.3 : 1.4);
    this.prevRot = this.spinner.rotation;
    this.lastSeg = this.segAtPointer();
    this.appearK = 0;
    this.pointer.alpha = 0;
    this.pointer.y = this.pointerY - D * 0.12;
    this.shock(D * 0.1, D * 0.78, 0xffc233, 0.5);
    const tl = gsap
      .timeline()
      .fromTo(this.glow, { alpha: red ? 0.3 : 0.95 }, { alpha: 0.2, duration: T(0.6), ease: 'power2.out' }, 0)
      .to(this, { alpha: 1, duration: T(0.1) }, 0)
      .to(this.scale, { x: 1.07, y: 1.07, duration: T(0.3), ease: 'power3.out' }, 0)
      .to(this.scale, { x: 1, y: 1, duration: T(0.28), ease: 'back.out(2.2)' }, T(0.3))
      .to(this.spinner, { rotation: rot, duration: T(0.62), ease: 'power3.out' }, 0)
      .fromTo(this, { rotation: red ? 0 : -0.28 }, { rotation: 0, duration: T(0.6), ease: 'elastic.out(1, .5)' }, 0)
      .fromTo(this.hub.scale, { x: 0, y: 0 }, { x: this.hubK, y: this.hubK, duration: T(0.4), ease: 'back.out(2.6)' }, T(0.1))
      .to(this, { appearK: 1, duration: T(0.45), ease: 'none' }, T(0.12))
      .to(this.pointer, { alpha: 1, duration: T(0.08) }, T(0.34))
      .to(this.pointer, { y: this.pointerY, duration: T(0.34), ease: 'bounce.out' }, T(0.34));
    return done(this.track(tl));
  }

  private segAtPointer(): number {
    // segment i is centred at angle i*SEG_ANGLE clockwise from the top in face space
    const a = ((-this.spinner.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(a / SEG_ANGLE) % SEG;
  }

  /**
   * Spin and land on a random segment of `kind`: a pull back against the ratchet, the launch, a
   * long slow-down over the last pegs, a hair past the winner, and back onto it.
   */
  spin(kind: SegKind): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const options = WHEEL_SEGMENTS.map((k, i) => (k === kind ? i : -1)).filter((i) => i >= 0);
    const target = options.length ? options[(Math.random() * options.length) | 0] : 0;
    const jitter = (Math.random() - 0.5) * SEG_ANGLE * 0.56;
    const turns = 3 + Math.floor(Math.random() * 2);
    gsap.killTweensOf(this.spinner);
    this.clearLanding();
    const cur = this.spinner.rotation;
    // final rotation: -target*SEG_ANGLE (mod 2pi) + jitter, always turning clockwise (increasing angle)
    let final = -target * SEG_ANGLE + jitter;
    while (final < cur + turns * Math.PI * 2) final += Math.PI * 2;
    this.lastSeg = this.segAtPointer();
    this.spinning = true;
    this.landed = false;
    const red = motion.reduced;
    const back = red ? 0 : 0.22;
    const over = red ? 0.015 : SEG_ANGLE * 0.2;
    return new Promise((res) => {
      const tick = () => {
        if (this.destroyed) return;
        const s = this.segAtPointer();
        if (s !== this.lastSeg) {
          this.lastSeg = s;
          this.flick(this.spinner.rotation < this.prevRot ? -1 : 1);
          this.onTick?.(s);
        }
      };
      const tl = gsap.timeline({
        onComplete: () => {
          this.spinning = false;
          if (!this.destroyed) this.celebrateLanding(target, jitter);
          res();
        },
      });
      if (back) {
        if (this.live) sound.play('wheelPullback');
        tl.to(this.spinner, { rotation: cur - back, duration: T(0.22), ease: 'power2.out', onUpdate: tick });
      }
      tl.to(this.spinner, { rotation: final + over, duration: T(1.85), ease: 'power4.out', onUpdate: tick }).to(this.spinner, { rotation: final, duration: T(0.3), ease: 'power2.inOut', onUpdate: tick });
      this.track(tl);
    });
  }

  /** Pointer flicks off each peg (the other way when the helm turns back). */
  private flick(dir = 1) {
    gsap.killTweensOf(this.pointer, 'rotation');
    this.pointer.rotation = -0.32 * dir;
    gsap.to(this.pointer, { rotation: 0, duration: T(0.18), ease: 'elastic.out(1.2, .35)' });
  }

  private clearLanding() {
    gsap.killTweensOf([this.winMark, this.dim, this.iconPop, this.iconPop.scale, this.labelGlow]);
    gsap.to([this.winMark, this.dim], { alpha: 0, duration: T(0.18), ease: 'power1.out' });
    this.iconPop.visible = false;
    this.labelGlow.alpha = 0;
  }

  private celebrateLanding(target: number, jitter: number) {
    const D = this.D;
    const u = D / 512;
    this.landed = true;
    this.blinkUntil = this.t + T(0.5);
    const red = motion.reduced;
    this.track(gsap.fromTo(this.glow, { alpha: red ? 0.4 : 0.9 }, { alpha: 0.25, duration: T(0.8), ease: 'power2.out' }));
    this.track(gsap.fromTo(this.scale, { x: red ? 1.02 : 1.07, y: red ? 1.02 : 1.07 }, { x: 1, y: 1, duration: T(0.38), ease: 'back.out(3)' }));
    const hk = this.hubK;
    this.track(gsap.fromTo(this.hub.scale, { x: hk * 1.25, y: hk * 1.25 }, { x: hk, y: hk, duration: T(0.4), ease: 'back.out(3)' }));
    // the pointer drops into the winning notch
    if (this.live) sound.play('wheelLandClunk');
    this.track(
      gsap
        .timeline()
        .to(this.pointer, { y: this.pointerY + D * 0.02, duration: T(0.06), ease: 'power2.in' })
        .to(this.pointer, { y: this.pointerY, duration: T(0.3), ease: 'elastic.out(1.2, .4)' }),
    );
    this.winMark.rotation = target * SEG_ANGLE;
    this.dim.rotation = target * SEG_ANGLE;
    this.track(gsap.to(this.dim, { alpha: 0.5, duration: T(0.3), ease: 'power2.out', delay: T(0.08) }));
    this.track(
      gsap
        .timeline()
        .fromTo(this.winMark, { alpha: 0 }, { alpha: 1, duration: T(0.1) })
        .to(this.winMark, { alpha: 0.45, duration: T(0.16), yoyo: true, repeat: 3, ease: 'sine.inOut' })
        .to(this.winMark, { alpha: 0.85, duration: T(0.2) }),
    );
    this.shock(D * 0.18, D * 0.72, 0xfff0b0, 0.45);
    // sparks off the pointer tip
    const tipY = -HELM.ptrTip * u;
    const n = Math.round(SPARKS * (motion.low ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const p = this.sparks[i];
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const sp = D * (0.9 + Math.random() * 1.2);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = 0.35 + Math.random() * 0.3;
      p.age = 0;
      p.s.position.set(0, tipY);
      p.s.width = p.s.height = D * (0.05 + Math.random() * 0.04);
      p.s.visible = true;
    }
    // the winning icon lifts off its wedge (now under the pointer) and flies to the middle
    const kind = WHEEL_SEGMENTS[target];
    this.landedKind = kind;
    const tex = this.iconTex[kind];
    if (tex) {
      const r = wheelIconFit(kind)[1];
      const size = iconSize(kind, D);
      const k0 = size / tex.width;
      const ang = jitter; // the landed wedge sits at the top, off by the landing jitter
      this.iconPop.texture = tex;
      this.iconPop.visible = true;
      this.iconPop.alpha = 1;
      this.iconPop.position.set(Math.sin(ang) * r * u, -Math.cos(ang) * r * u);
      this.iconPop.rotation = ang;
      this.iconPop.scale.set(k0);
      this.track(
        gsap
          .timeline()
          .call(() => void (this.live && sound.play('wheelIconLift')))
          .to(this.iconPop.scale, { x: k0 * 1.25, y: k0 * 1.25, duration: T(0.1), ease: 'power2.out' })
          .to(this.iconPop, { x: 0, y: -D * 0.02, rotation: 0, duration: T(0.34), ease: 'back.out(1.6)' }, T(0.06))
          .to(this.iconPop.scale, { x: k0 * ICON_POP, y: k0 * ICON_POP, duration: T(0.34), ease: 'back.out(2)' }, T(0.06)),
      );
    }
    if (this.live) {
      cast.parrot?.accent('hop');
      if (kind === 'bomb') cast.parrot?.accent('squawk');
    }
  }

  /**
   * Paint the word labels a reveal can show (BROADSIDE, 2 to 4 KEGS) for a wheel of size D ahead of
   * time. Returns their textures (upload them to the GPU).
   */
  static prepare(D: number): Texture[] {
    const keep = wordSize(D).toFixed(1);
    for (const [k, d] of words) {
      if (k.endsWith(`|${keep}`)) continue;
      words.delete(k);
      d.destroy();
    }
    return [wordLabel(t('inferno'), 'crimson', D), ...[2, 3, 4].map((n) => wordLabel(t('hounds', { n }), 'sea', D))].map((d) => d.texture);
  }

  /**
   * The value pops out over the hub; the lifted icon bursts into it. Amounts and multipliers are
   * numerals; words (KEGS, BROADSIDE) use the banner lettering, shared from a cache (the label this
   * returns is a plain sprite on it, so the caller may destroy it).
   */
  reveal(label: string, tone: NumTone): Promise<Container> {
    const D = this.D;
    let t: Container;
    if (/\p{L}{4,}/u.test(label)) {
      const d = wordLabel(label, tone, D);
      const s = new Sprite(d.texture);
      s.anchor.copyFrom(d.anchor);
      t = s;
    } else {
      t = bitmapNum(label, tone, D * 0.3);
    }
    const base = t.scale.x;
    const maxW = D * 1.05;
    const k = base * (t.width > maxW ? maxW / t.width : 1);
    this.addChild(t);
    t.scale.set(0);
    const tint: Record<NumTone, number> = { gold: 0xffd66b, fire: 0xff9a2a, crimson: 0xff5a4a, sea: 0x7fe6dc, white: 0xfff4dc, silver: 0xe8eef2, bronze: 0xf0a060, green: 0x9dffc6 };
    this.labelGlow.tint = tint[tone];
    this.labelGlow.width = Math.max(D * 0.6, Math.min(D * 1.3, t.width * (k / Math.max(1e-6, base)) * 1.4));
    this.labelGlow.height = D * 0.5;
    const iconOn = this.iconPop.visible;
    const at = iconOn ? T(0.24) : 0;
    if (this.live && this.landedKind === 'bomb') {
      sound.play('wheelBombReveal', { delay: at });
      sound.duck(0.3, 1.5);
    }
    const tl = gsap.timeline();
    if (iconOn) {
      const ik = this.iconPop.scale.x;
      tl.to(this.iconPop.scale, { x: ik * 1.35, y: ik * 1.35, duration: T(0.16), ease: 'power2.out' }, at).to(this.iconPop, { alpha: 0, duration: T(0.16), ease: 'power1.in' }, at);
    }
    tl.fromTo(this.labelGlow, { alpha: 0 }, { alpha: 0.75, duration: T(0.14) }, at)
      .to(this.labelGlow, { alpha: 0.35, duration: T(0.5) }, at + T(0.14))
      .to(t.scale, { x: k * 1.25, y: k * 1.25, duration: T(0.22), ease: 'back.out(2.2)' }, at)
      .fromTo(t, { rotation: -0.12 }, { rotation: 0, duration: T(0.45), ease: 'elastic.out(1, .45)' }, at)
      .to(t.scale, { x: k, y: k, duration: T(0.18), ease: 'sine.out' }, at + T(0.22));
    return done(this.track(tl)).then(() => t);
  }

  /** Spins away as it shrinks back into the crib. */
  collapse(): Promise<void> {
    const red = motion.reduced;
    return done(
      this.track(
        gsap
          .timeline()
          .to(this.spinner, { rotation: this.spinner.rotation + (red ? 0 : 0.9), duration: T(0.3), ease: 'power2.in' }, 0)
          .to(this.scale, { x: 0.1, y: 0.1, duration: T(0.28), ease: 'back.in(1.6)' }, 0)
          .to([this.iconPop, this.labelGlow], { alpha: 0, duration: T(0.12) }, 0)
          .to(this, { alpha: 0, duration: T(0.12) }, T(0.16)),
      ),
    ).then(() => {
      if (!this.destroyed) this.destroy({ children: true });
    });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    for (const a of this.anims) a.kill();
    this.anims = [];
    gsap.killTweensOf([this, this.scale, this.spinner, this.pointer, this.glow, this.winMark, this.dim, this.hub.scale, this.iconPop, this.iconPop.scale, this.labelGlow, ...this.bulbs]);
    this.onTick = undefined;
    super.destroy(options);
  }

  update(dtMs: number) {
    if (this.destroyed) return;
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dt;
    const rot = this.spinner.rotation;
    const d = rot - this.prevRot;
    this.prevRot = rot;
    this.castShadow.rotation = rot;
    // motion blur: average n samples across this frame's turn (oldest first at alpha 1, the k-th
    // at 1/(k+1), the face last), so a 45-degree-per-frame start reads as a smear, not a strobe;
    // n shrinks as the helm slows, down to a sharp single draw (low quality: always sharp)
    const ad = Math.abs(d);
    const n = !motion.low && ad > BLUR_MIN && ad < Math.PI ? Math.min(BLUR, Math.max(2, Math.ceil(ad / BLUR_STEP) + 1)) : 1;
    for (let k = 0; k < this.ghosts.length; k++) {
      const g = this.ghosts[k];
      g.visible = k < n - 1;
      if (g.visible) {
        g.rotation = rot - (d * (n - 1 - k)) / n;
        g.alpha = 1 / (k + 1);
      }
    }
    this.face.alpha = 1 / n;
    // lamps: light one by one as it appears, chase faster the faster it turns, blink on landing,
    // then glow and shimmer
    const perFrame = (Math.abs(d) * 16.7) / Math.max(1, dtMs);
    const lit = Math.floor(this.appearK * this.bulbs.length + 0.001);
    if (this.appearK < 1) {
      this.bulbs.forEach((b, i) => (b.alpha = i < lit ? 0.85 : 0.12));
    } else if (this.spinning) {
      this.chase += perFrame * 1.6 + dtMs / 110;
      const phase = Math.floor(this.chase) % 2;
      this.bulbs.forEach((b, i) => (b.alpha = i % 2 === phase ? 1 : 0.16));
    } else if (this.landed && this.t < this.blinkUntil) {
      const on = Math.floor((this.blinkUntil - this.t) / T(0.08)) % 2 === 0;
      for (const b of this.bulbs) b.alpha = on ? 1 : 0.15;
    } else if (this.landed) {
      this.chase += dt * 9;
      const head = Math.floor(this.chase) % this.bulbs.length;
      this.bulbs.forEach((b, i) => {
        const dist = (head - i + this.bulbs.length) % this.bulbs.length;
        b.alpha = 0.55 + 0.45 * Math.max(0, 1 - dist / 4);
      });
    } else {
      const phase = Math.floor(this.t * 2.4) % 2;
      this.bulbs.forEach((b, i) => (b.alpha = i % 2 === phase ? 0.75 : 0.22));
    }
    // landing sparks
    const g = this.D * 2.4;
    for (const p of this.sparks) {
      if (!p.s.visible) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.s.visible = false;
        continue;
      }
      p.vy += g * dt;
      p.vx *= Math.exp(-2.5 * dt);
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.alpha = 1 - p.age / p.life;
    }
  }
}
