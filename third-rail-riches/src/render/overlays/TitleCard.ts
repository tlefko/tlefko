import { cjkScript, t } from '../../i18n';
import { Container, Graphics, Sprite, Text, BitmapText, TextStyle, RenderTexture, type Renderer, type Texture } from 'pixi.js';
import { hudHeight } from '../layout';
import gsap from 'gsap';
import { bitmapNum, displayText, FONT_UI, type DisplayOptions, type DisplayText, type NumTone } from '../text';
import { svgTexture } from '../textures';
import { conductorHead } from '../../art/conductor';
import { ratHead } from '../../art/rat';
import { ribbon } from '../../art/props';
import { T, done } from '../timing';
import { RollingNumber } from '../winbar/RollingNumber';
import { motion } from '../characters/motion';

export interface CardSpec {
  palette: [number, number]; // ring colours
  kicker: string; // small line on top
  title: string; // big cartoon title
  titleTone: NumTone;
  big?: string; // numerals line (e.g. "10 FREE SPINS" or the win)
  bigTone?: NumTone;
  body?: string; // one sentence, UI font
  cta?: string;
  conductor?: 'laugh' | 'smug' | 'pray' | 'shock';
  rat?: 'happy' | 'squeak' | 'worried';
}

/** Ribbon art: the band runs between the scroll rolls, `RIB_END` units in from each end. */
const RIB_H = 120;
const RIB_END = 75;
/** Vertical centre of the ribbon's band in its art (the band arches up in the middle). */
const RIB_MID = 54;
/** Each ring is this much wider than the next one in: scaling by RING_Q^2 maps the pattern onto itself. */
const RING_Q = 1.2;
/** One full zoom cycle (two bands), seconds. */
const ZOOM_S = 7;
/** How far in from each side the leaning portraits reach (hat brim, beak), in portrait sides. */
const PORTRAIT_REACH = 1.05;
const CAPTAINS = ['laugh', 'smug', 'pray', 'shock'] as const;
const PARROTS = ['happy', 'squeak', 'worried'] as const;

/** Side of the leaning portraits for a W x H screen (the one size every card and prepare() use). */
export function cardPortraitSize(W: number, H: number): number {
  return Math.min(W * 0.28, Math.min(W, H) * 0.42, H * 0.38);
}
const capKey = (e: string) => `card-cap-${e}`;
const parKey = (e: string) => `card-parrot2-${e}`;

/* Lettering is painted once and shared by every card (kickers, titles and calls to action repeat). */
const LETTER_MAX = 32;
const letters = new Map<string, DisplayText>();
const cached = new Set<DisplayText>();
function lettering(text: string, o: DisplayOptions): DisplayText {
  const key = `${text}|${o.size.toFixed(1)}|${o.tone}|${o.treatment}|${o.wrapWidth?.toFixed(0) ?? ''}|${o.res ?? ''}`;
  const hit = letters.get(key);
  if (hit && !hit.destroyed && !hit.parent) {
    letters.delete(key);
    letters.set(key, hit);
    hit.alpha = 1;
    hit.scale.set(1);
    hit.rotation = 0;
    return hit;
  }
  const d = displayText(text, o);
  if (hit && hit.parent) return d; // the shared one is on screen: this one is not cached
  letters.set(key, d);
  cached.add(d);
  for (const [k, v] of letters) {
    if (letters.size <= LETTER_MAX) break;
    if (v.parent) continue;
    letters.delete(k);
    cached.delete(v);
    v.destroy();
  }
  return d;
}

/**
 * 1930s title card for the bonus intro and the final tally. When it first shows, the rings burst
 * out from the middle, the kicker drops in, a parchment scroll unfurls and the title pops onto it,
 * the big numerals punch in, then the body and the call to action; the captain and the parrot lean
 * in from the sides above the HUD, bob and chuckle. The rings keep zooming in, seamlessly (they
 * are spaced in a constant ratio, so a scale loop maps them onto themselves: nothing is redrawn).
 */
export class TitleCard extends Container {
  private bg = new Graphics();
  private rings = new Graphics();
  private spot = new Graphics();
  private ringT = { z: 0, reveal: 1 };
  private content = new Container();
  /** The lettering, number, blurb and call to action: one group, shrunk as a whole when it would reach the HUD. */
  private stack = new Container();
  private tween?: gsap.core.Tween;
  private bigText?: BitmapText;
  private bigRoll?: RollingNumber;
  private rolled = false;
  private resolveTap?: () => void;
  private W: number;
  private H: number;
  private spec: CardSpec;
  private parts: { kicker?: DisplayText; ribbon?: Sprite; title?: DisplayText; body?: Text; cta?: DisplayText; cap?: Sprite; par?: Sprite } = {};
  private anims: gsap.core.Animation[] = [];
  private started = false;
  private built = false;
  private capX = 0;
  private parX = 0;

  /** `floor` is where the HUD starts: the portraits lean in above it, never behind it. */
  constructor(W: number, H: number, spec: CardSpec, private floor = H) {
    super();
    this.W = W;
    this.H = H;
    this.spec = spec;
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.addChild(this.bg, this.rings, this.spot, this.content);
    this.content.addChild(this.stack);
    this.on('pointertap', () => this.resolveTap?.());
    // the reveal plays when the card is first on screen (the Presenter builds it hidden, behind
    // the closing iris, then shows it)
    this.onRender = () => {
      if (!this.started && this.built && this.visible && this.alpha > 0) {
        this.started = true;
        this.enter();
      }
    };
  }

  /**
   * Build everything a card can need for a W x H screen ahead of time, so a card opens without a
   * single raster: the portraits (every expression), the lettering of every known kicker, title and
   * call to action, the scrolls for the bonus names and TOTAL WIN, and the glyphs of the free spins
   * line. Returns every texture it made (upload them to the GPU); with a renderer it also draws
   * each card once off screen. `floor` defaults to the HUD's top for this screen size.
   */
  static async prepare(W: number, H: number, res: number, floor = H - hudHeight(W, H), renderer?: Renderer): Promise<Texture[]> {
    const side = cardPortraitSize(W, H);
    const out: Texture[] = await Promise.all([
      ...CAPTAINS.map((e) => svgTexture(capKey(e), conductorHead(e), side * res)),
      ...PARROTS.map((e) => svgTexture(parKey(e), ratHead(e, false, 'all'), side * 0.9 * res)),
    ]);
    const specs: CardSpec[] = [
      { palette: [0x123a52, 0x061426], kicker: t('youWon'), title: t('rushHourCaps'), titleTone: 'crimson', big: t('freeSpinsCaps', { n: 10 }), bigTone: 'gold', cta: t('tapToBegin'), conductor: 'smug', rat: 'happy' },
      { palette: [0x5a1a08, 0x2a0b04], kicker: t('youWon'), title: t('lastTrainCaps'), titleTone: 'gold', big: t('freeSpinsCaps', { n: 10 }), bigTone: 'gold', cta: t('tapToBegin'), conductor: 'laugh', rat: 'happy' },
      ...[t('bigWin'), t('megaWin'), t('epicWin'), t('unholyWin'), t('bonusOver', { name: t('rushHourCaps') }), t('bonusOver', { name: t('lastTrainCaps') })].map(
        (kicker): CardSpec => ({ palette: [0x10304a, 0x05101f], kicker, title: t('totalWinCaps'), titleTone: 'white', big: '0', bigTone: 'gold', cta: t('tapToContinue'), conductor: 'laugh', rat: 'happy' }),
      ),
    ];
    for (const spec of specs) {
      const card = new TitleCard(W, H, spec, floor);
      await card.build(res);
      const p = card.parts;
      for (const s of [p.kicker, p.title, p.cta, p.ribbon]) if (s && !out.includes(s.texture)) out.push(s.texture);
      if (renderer) {
        // play the reveal to its end (alpha-0 parts are skipped by the renderer), draw it once
        card.onRender = null;
        card.started = true;
        card.visible = true;
        card.enter();
        for (const a of card.anims) a.progress(1);
        const rt = RenderTexture.create({ width: 8, height: 8 });
        renderer.render({ container: card, target: rt });
        rt.destroy(true);
      }
      card.destroy();
    }
    return out;
  }

  /**
   * Keep the text group clear of the HUD: when its bottom (with the entrance overshoot) would pass
   * the floor, shrink the whole group about its top edge. Short landscape screens (800x600, 400x300)
   * need this; tall ones never do.
   */
  private fitStack(top: DisplayText, U: number) {
    const y0 = top.y - top.height / 2;
    const limit = this.floor - U * 0.035;
    const need = () => {
      const b = this.stack.getLocalBounds().maxY;
      return b <= limit || b <= y0 ? 1 : (limit - y0) / (b - y0);
    };
    let k = need();
    // too short for everything at a readable size: the blurb is the optional part (the rules
    // explain the bonus), so it goes first and the call to action moves up into its place
    const body = this.parts.body;
    if (k < 0.8 && body) {
      const gap = body.height + U * 0.04;
      body.destroy();
      this.parts.body = undefined;
      if (this.parts.cta) this.parts.cta.y -= gap;
      k = need();
    }
    if (k >= 1) return;
    k = Math.max(0.6, k);
    this.stack.pivot.set(this.W / 2, y0);
    this.stack.position.set(this.W / 2, y0);
    this.stack.scale.set(k);
  }

  private track<A extends gsap.core.Animation>(a: A): A {
    this.anims.push(a);
    return a;
  }

  /** Concentric rings in a constant ratio, from past the corners down to a few pixels, built once. */
  private buildRings() {
    const { W, H } = this;
    const [c0, c1] = this.spec.palette;
    this.bg.clear().rect(0, 0, W, H).fill({ color: c1 });
    const g = this.rings.clear();
    let r = Math.hypot(W, H) * 0.62;
    let i = 0;
    while (r > 3) {
      g.circle(0, 0, r).fill({ color: i % 2 ? c1 : c0 });
      r /= RING_Q;
      i++;
    }
    this.rings.position.set(W / 2, H * 0.46);
    this.spot.clear().circle(W / 2, H * 0.46, Math.min(W, H) * 0.3).fill({ color: 0x000000, alpha: 0.18 });
    this.applyRings();
  }

  private applyRings() {
    this.rings.scale.set(this.ringT.reveal * Math.pow(RING_Q, 2 * (this.ringT.z % 1)));
  }

  async build(res: number) {
    const { W, H, spec } = this;
    const U = Math.min(W, H);
    this.buildRings();
    this.tween = gsap.to(this.ringT, { z: 1, duration: ZOOM_S, repeat: -1, ease: 'none', onUpdate: () => this.applyRings() });
    // portraits first: the text is fitted to stay clear of them
    const side = cardPortraitSize(W, H);
    const [capT, parT] = await Promise.all([
      spec.conductor ? svgTexture(capKey(spec.conductor), conductorHead(spec.conductor), side * res) : Promise.resolve(undefined),
      spec.rat ? svgTexture(parKey(spec.rat), ratHead(spec.rat, false, 'all'), side * 0.9 * res) : Promise.resolve(undefined),
    ]);
    if (this.destroyed) return;
    const portraitTop = this.floor - side * 0.84;
    /** Widest a line may be whose bottom is at `y1`, keeping clear of the portraits. */
    const clearW = (y1: number) => {
      const full = W * 0.9;
      if ((!capT && !parT) || y1 < portraitTop) return full;
      return Math.min(full, W - 2 * side * PORTRAIT_REACH);
    };
    // kicker
    const kicker = lettering(spec.kicker, { size: U * 0.042, tone: 'white', treatment: 'label', res });
    const kfit = Math.min(1, clearW(H * 0.25) / Math.max(1, kicker.width));
    kicker.scale.set(kfit);
    kicker.position.set(W / 2, H * 0.19);
    this.parts.kicker = kicker;
    // title on its scroll: one line when it fits well, else two
    const titleY = Math.max(H * 0.34, kicker.y + (kicker.height * kfit) / 2 + U * 0.1);
    let title = lettering(spec.title, { size: U * 0.115, tone: spec.titleTone, treatment: 'title', res });
    const room = Math.min(W * 0.86, clearW(titleY + U * 0.1));
    let k = Math.min(1, (room * 0.84) / Math.max(1, title.width));
    if (k < 0.62 && /\s|-/.test(spec.title)) {
      title = lettering(spec.title, { size: U * 0.115, tone: spec.titleTone, treatment: 'title', res, wrapWidth: (room * 0.84) / 0.8 });
      k = Math.min(1, (room * 0.84) / Math.max(1, title.width), (U * 0.3) / Math.max(1, title.height));
    }
    title.scale.set(k);
    title.position.set(W / 2, titleY);
    this.parts.title = title;
    // the scroll: sized so the title fills the straight part of its band
    const tw = title.inkWidth * k;
    const th = title.inkHeight * k;
    const q = Math.max(th / 46, (U * 0.1) / RIB_H);
    const artW = Math.round(Math.max(360, tw / q + RIB_END * 2 + 24));
    const rw = Math.min(W * 0.97, artW * q);
    const rTex = await svgTexture(`card-ribbon-${artW}`, ribbon(artW), rw * res);
    if (this.destroyed) return;
    const rib = new Sprite(rTex);
    rib.anchor.set(0.5, RIB_MID / RIB_H);
    // uniform scale; a clamped (narrower) scroll is stretched upright so the title still fits its band
    const qx = rw / artW;
    const sy = Math.max(1, th / 46 / qx);
    rib.scale.set(rw / rTex.width, (rw / rTex.width) * sy);
    rib.position.set(W / 2, titleY);
    this.parts.ribbon = rib;
    this.stack.addChild(kicker, rib, title);
    let y = titleY + (RIB_H - RIB_MID) * qx * sy + U * 0.035;
    if (spec.big) {
      const big = bitmapNum(spec.big, spec.bigTone ?? 'gold', U * 0.11);
      const by = y + U * 0.06;
      const bw = clearW(by + U * 0.06) * 0.95;
      big.position.set(W / 2, by);
      this.bigBase = big.scale.x;
      if (big.width > bw) big.scale.set(this.bigBase * (bw / big.width));
      this.bigMax = bw;
      this.stack.addChild(big);
      this.bigText = big;
      // the rolling twin for a counted total (setBig), built now so nothing is made mid-count
      const roll = new RollingNumber(spec.bigTone ?? 'gold', U * 0.11);
      roll.maxWidth = bw;
      roll.showText(spec.big, false);
      roll.position.set(W / 2, by);
      roll.visible = false;
      this.stack.addChild(roll);
      this.bigRoll = roll;
      y += U * 0.16;
    }
    if (spec.body) {
      const bodyW = Math.min(W * 0.8, 640, clearW(y + U * 0.12));
      const body = new Text({
        text: spec.body,
        style: new TextStyle({ fontFamily: FONT_UI, fontWeight: '500', fontSize: Math.max(14, U * 0.026), fill: 0xf4efe3, align: 'center', wordWrap: true, breakWords: cjkScript, wordWrapWidth: bodyW, lineHeight: Math.max(14, U * 0.026) * 1.4, dropShadow: { color: 0x000000, alpha: 0.8, blur: 4, distance: 2, angle: Math.PI / 2 }, padding: 6 }),
        resolution: res,
      });
      body.anchor.set(0.5, 0);
      body.position.set(W / 2, y);
      this.stack.addChild(body);
      this.parts.body = body;
      y += body.height + U * 0.04;
    }
    if (spec.cta) {
      const cta = lettering(spec.cta, { size: U * 0.036, tone: 'fire', treatment: 'label', res });
      const cy = y + U * 0.05;
      const cw = clearW(cy + U * 0.03) * 0.95;
      cta.scale.set(Math.min(1, cw / Math.max(1, cta.width)));
      cta.position.set(W / 2, cy);
      this.stack.addChild(cta);
      this.parts.cta = cta;
    }
    this.fitStack(kicker, U);
    // characters leaning in over the floor, the whole face above the HUD
    if (capT) {
      const s = new Sprite(capT);
      s.anchor.set(0.5, 0.8);
      s.width = s.height = side;
      this.capX = side * 0.42;
      s.position.set(-side, this.floor - side * 0.1);
      s.rotation = 0.6;
      this.content.addChild(s);
      this.parts.cap = s;
    }
    if (parT) {
      const s = new Sprite(parT);
      s.anchor.set(0.5, 0.8);
      s.width = s.height = side * 0.9;
      this.parX = W - side * 0.4;
      s.position.set(W + side, this.floor - side * 0.06);
      s.rotation = -0.6;
      this.content.addChild(s);
      this.parts.par = s;
    }
    // everything waits hidden for the reveal
    for (const c of [kicker, title, this.parts.body, this.parts.cta, this.bigText]) if (c) c.alpha = 0;
    rib.scale.x *= 0.06;
    rib.alpha = 0;
    this.ringT.reveal = motion.reduced ? 1 : 0.08;
    this.applyRings();
    this.built = true;
  }

  /** The reveal (first frame on screen). */
  private enter() {
    const U = Math.min(this.W, this.H);
    const red = motion.reduced;
    const p = this.parts;
    const tl = gsap.timeline();
    if (!red) tl.to(this.ringT, { reveal: 1, duration: T(0.7), ease: 'back.out(1.3)', onUpdate: () => this.applyRings() }, 0);
    if (p.kicker) {
      const k = p.kicker;
      tl.fromTo(k, { alpha: 0, y: k.y - U * 0.03 }, { alpha: 1, y: k.y, duration: T(0.32), ease: 'back.out(2)' }, T(0.08));
    }
    if (p.ribbon) {
      const r = p.ribbon;
      const sx = r.scale.x / 0.06;
      tl.to(r, { alpha: 1, duration: T(0.08) }, T(0.16))
        .to(r.scale, { x: sx * 1.05, duration: T(0.34), ease: 'power3.out' }, T(0.16))
        .to(r.scale, { x: sx, duration: T(0.22), ease: 'sine.inOut' }, T(0.5))
        .fromTo(r, { rotation: red ? 0 : -0.05 }, { rotation: 0, duration: T(0.6), ease: 'elastic.out(1, .5)' }, T(0.16));
    }
    if (p.title) {
      const t0 = p.title;
      const k = t0.scale.x;
      tl.to(t0, { alpha: 1, duration: T(0.1) }, T(0.34))
        .fromTo(t0.scale, { x: k * 0.55, y: k * 0.55 }, { x: k * 1.08, y: k * 1.08, duration: T(0.24), ease: 'back.out(2.2)' }, T(0.34))
        .to(t0.scale, { x: k, y: k, duration: T(0.2), ease: 'sine.out' }, T(0.58));
    }
    if (this.bigText) {
      const b = this.bigText;
      const k = b.scale.x;
      tl.to(b, { alpha: 1, duration: T(0.08) }, T(0.52)).fromTo(b.scale, { x: 0, y: 0 }, { x: k, y: k, duration: T(0.4), ease: 'back.out(2.6)' }, T(0.52));
    }
    if (p.body) tl.fromTo(p.body, { alpha: 0, y: p.body.y + U * 0.02 }, { alpha: 1, y: p.body.y, duration: T(0.4), ease: 'power2.out' }, T(0.66));
    if (p.cta) {
      const c = p.cta;
      tl.to(c, { alpha: 1, duration: T(0.3) }, T(0.8));
      this.track(gsap.to(c, { y: c.y - U * 0.008, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: T(0.8) }));
      const ck = c.scale.x;
      this.track(gsap.to(c.scale, { x: ck * 1.04, y: ck * 1.04, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: T(1.1) }));
    }
    if (p.cap) {
      const s = p.cap;
      tl.to(s, { x: this.capX, rotation: 0.28, duration: T(0.62), ease: 'back.out(1.7)' }, T(0.22));
      this.idleHead(s, 0.28, 0.2, 1.1, T(0.9));
    }
    if (p.par) {
      const s = p.par;
      tl.to(s, { x: this.parX, rotation: -0.26, duration: T(0.62), ease: 'back.out(1.7)' }, T(0.32));
      this.idleHead(s, -0.26, -0.18, 1.3, T(1));
    }
    this.track(tl);
  }

  /** A leaning portrait bobs, and every couple of seconds chuckles (a squash and a hop). */
  private idleHead(s: Sprite, r0: number, r1: number, period: number, delay: number) {
    this.track(gsap.fromTo(s, { rotation: r0 }, { rotation: r1, duration: period, yoyo: true, repeat: -1, ease: 'sine.inOut', delay }));
    if (motion.low) return;
    const k = s.scale.x;
    const y0 = s.y;
    this.track(
      gsap
        .timeline({ repeat: -1, repeatDelay: 1.6 + Math.random() * 0.8, delay: delay + 0.6 })
        .to(s.scale, { x: k * 1.06, y: k * 0.92, duration: 0.08, ease: 'power2.out' })
        .to(s, { y: y0 - s.height * 0.05, duration: 0.14, ease: 'power2.out' }, 0.08)
        .to(s.scale, { x: k * 0.97, y: k * 1.04, duration: 0.14, ease: 'power2.out' }, 0.08)
        .to(s, { y: y0, duration: 0.16, ease: 'power2.in' }, 0.22)
        .to(s.scale, { x: k, y: k, duration: 0.3, ease: 'elastic.out(1, .4)' }, 0.38),
    );
  }

  private bigBase = 1;
  private bigMax = 0;
  /** Change the numerals line (a counted total rolls its digits). */
  setBig(text: string) {
    if (this.bigRoll) {
      if (!this.rolled) {
        this.rolled = true;
        this.bigRoll.visible = true;
        this.bigRoll.alpha = this.bigText?.alpha ?? 1;
        if (this.bigText) this.bigText.visible = false;
      }
      this.bigRoll.showText(text);
      return;
    }
    if (!this.bigText) return;
    this.bigText.text = text;
    this.bigText.scale.set(this.bigBase);
    const maxW = this.bigMax || this.W * 0.86;
    if (this.bigText.width > maxW) this.bigText.scale.set(this.bigBase * (maxW / this.bigText.width));
  }

  /** Dismiss as if tapped (spacebar / spin button). Returns false if the card is not waiting. */
  tap(): boolean {
    if (!this.resolveTap) return false;
    this.resolveTap();
    return true;
  }

  /** Resolve on tap (or after `auto` seconds when autoplaying). */
  waitTap(auto = 0): Promise<void> {
    return new Promise((res) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.resolveTap = undefined;
        res();
      };
      this.resolveTap = finish;
      if (auto > 0) this.track(gsap.delayedCall(auto, finish));
    });
  }

  fadeOut(): Promise<void> {
    return done(this.track(gsap.to(this, { alpha: 0, duration: T(0.25) })));
  }

  override destroy() {
    this.onRender = null;
    this.tween?.kill();
    for (const a of this.anims) a.kill();
    this.anims = [];
    gsap.killTweensOf(this.ringT);
    for (const c of [...this.stack.children, ...this.content.children]) {
      gsap.killTweensOf(c);
      gsap.killTweensOf(c.scale);
      // shared lettering goes back to the cache, it is not destroyed with the card
      if (cached.has(c as DisplayText)) c.removeFromParent();
    }
    super.destroy({ children: true });
  }
}
