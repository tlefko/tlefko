import { BitmapText, Container, Sprite } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { winBarFrame, winBarWindow } from '../../art/props';
import { numBaseStyle, NUM_BASE } from '../text';
import { T } from '../timing';
import { RollingNumber } from './RollingNumber';
import { motion } from '../characters/motion';
import type { Rect } from '../layout';

/**
 * Total Win Bar: the ship's nameboard above the crib. Its long display window collects every win
 * of the spin on rolling numerals: each rise punches the figure, a glint sweeps across the brass
 * window and the window glows, harder for a bigger rise. The plunder multiplier lives on the fuse's
 * seal, not here.
 */
export class WinBar extends Container {
  private frame = new Sprite();
  private amount: RollingNumber;
  private multText: BitmapText;
  private flash = new Sprite(softDotTexture());
  private multFlash = new Sprite(softDotTexture());
  private glint = new Sprite(softDotTexture());
  value = 0;
  mult: number | null = null;
  private shown = { v: 0 };
  private rect: Rect = { x: 0, y: 0, w: 100, h: 20 };
  /** The nameboard's display window (fractions of the frame). */
  private win = winBarWindow();
  private baseM = 0.36;
  private _format: (v: number) => string = (v) => v.toFixed(2);
  onTick?: () => void;

  constructor() {
    super();
    this.eventMode = 'none';
    this.amount = new RollingNumber('white', NUM_BASE, this._format);
    this.multText = new BitmapText({ text: '', style: numBaseStyle('green') });
    this.multText.anchor.set(0.5);
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;
    this.multFlash.anchor.set(0.5);
    this.multFlash.blendMode = 'add';
    this.multFlash.alpha = 0;
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.tint = 0xfff4d6;
    this.glint.alpha = 0;
    // the glow sprites only exist while they show: hidden, not drawn at alpha 0
    this.flash.visible = this.multFlash.visible = this.glint.visible = false;
    this.addChild(this.frame, this.flash, this.multFlash, this.glint, this.amount, this.multText);
  }

  /** Fade a glow sprite from `a` to nothing, visible only while it shows. */
  private pulse(s: Sprite, a: number, dur: number, extra: gsap.TweenVars = {}) {
    gsap.killTweensOf(s);
    s.visible = true;
    gsap.fromTo(s, { alpha: a }, { alpha: 0, duration: dur, ...extra, onComplete: () => void (s.visible = false) });
  }

  /** How amounts are written (bet multiples to currency). */
  get format(): (v: number) => string {
    return this._format;
  }
  set format(f: (v: number) => string) {
    this._format = f;
    this.amount.format = f;
  }

  async layout(r: Rect, res: number) {
    this.rect = r;
    // the board is drawn at the bar's real aspect, so its ends and nails are never stretched
    const aspect = r.w / r.h;
    this.win = winBarWindow(aspect);
    this.frame.texture = await svgTexture('winbar', winBarFrame(aspect), r.w * res, r.h * res);
    this.frame.position.set(r.x, r.y);
    this.frame.width = r.w;
    this.frame.height = r.h;
    const main = this.mainCenter();
    const slot = this.slotCenter();
    // numerals sized to the window: our digits (plus ink) fill about 85% of its height
    this.amount.size = r.h * this.win.h * 1.02;
    this.amount.maxWidth = r.w * this.win.w * 0.92;
    this.amount.position.set(main.x, main.y);
    this.amount.set(this.shown.v);
    this.multText.position.set(slot.x, slot.y);
    this.baseM = (r.h * 0.36) / NUM_BASE;
    this.flash.position.set(main.x, main.y);
    this.flash.width = r.w * this.win.w * 1.05;
    this.flash.height = r.h * 1.3;
    this.multFlash.position.set(slot.x, slot.y);
    this.multFlash.width = this.multFlash.height = r.h * 1.6;
    this.glint.height = r.h * this.win.h * 1.5;
    this.glint.width = r.h * 0.5;
    this.glint.rotation = 0.35;
    this.glint.position.set(main.x, main.y);
    this.renderMult();
  }

  mainCenter() {
    const r = this.rect;
    return { x: r.x + r.w * this.win.cx, y: r.y + r.h * this.win.cy };
  }
  slotCenter() {
    const r = this.rect;
    return { x: r.x + r.w * 0.88, y: r.y + r.h * 0.5 };
  }

  private renderMult() {
    // the plunder multiplier is shown on the meter's seal (it multiplies clusters, not this total)
    this.multText.text = '';
    this.multText.scale.set(this.baseM);
  }

  reset(value = 0, mult: number | null = null) {
    gsap.killTweensOf(this.shown);
    this.value = value;
    this.shown.v = value;
    this.mult = mult;
    this.amount.set(value);
    this.renderMult();
  }

  /** Count up to a new total on the rolling numerals. */
  setValue(v: number, dur = 0.45): Promise<void> {
    const from = this.shown.v;
    this.value = v;
    gsap.killTweensOf(this.shown);
    let last = 0;
    return new Promise((res) => {
      gsap.to(this.shown, {
        v,
        duration: T(dur),
        ease: 'power2.out',
        onUpdate: () => {
          this.amount.value = this.shown.v;
          const now = performance.now();
          if (now - last > 55) {
            last = now;
            this.onTick?.();
          }
        },
        onComplete: () => {
          this.amount.value = v;
          res();
        },
      });
      // a bigger rise hits harder
      const rise = from > 0 ? v / from : 2;
      this.bump(v > from ? Math.min(1.6, 0.8 + Math.log2(Math.max(1, rise)) * 0.4) : 0.5);
    });
  }

  bump(strength = 1) {
    this.amount.punch(motion.reduced ? 0.04 : 0.14 * strength, T(0.34));
    this.pulse(this.flash, Math.min(0.6, 0.32 * strength), T(0.5));
    if (!motion.reduced && !motion.low) {
      // a glint sweeps across the brass window
      const r = this.rect;
      const w = r.w * this.win.w;
      const c = this.mainCenter();
      this.glint.x = c.x - w * 0.5;
      this.pulse(this.glint, 0.55, T(0.5), { x: c.x + w * 0.5, ease: 'power2.inOut' });
    }
  }

  setMult(m: number | null) {
    this.mult = m;
    this.renderMult();
    if (m !== null) {
      const sx = this.multText.scale.x;
      gsap.fromTo(this.multText.scale, { x: sx * 1.8, y: sx * 1.8 }, { x: sx, y: sx, duration: T(0.4), ease: 'back.out(2.5)' });
      this.pulse(this.multFlash, 0.9, T(0.6));
    }
  }

  /** Multiplier slams into the total: text flies over, total counts up to the product. */
  async applyMultiplier(finalValue: number) {
    if (this.mult === null) return;
    const from = this.multText.position.clone();
    const to = this.mainCenter();
    const ghost = new BitmapText({ text: this.multText.text, style: numBaseStyle('green') });
    ghost.anchor.set(0.5);
    ghost.position.copyFrom(from);
    ghost.scale.copyFrom(this.multText.scale);
    this.addChild(ghost);
    await gsap
      .timeline()
      .to(ghost, { y: from.y - this.rect.h * 0.9, duration: T(0.22), ease: 'power2.out' })
      .to(ghost.scale, { x: ghost.scale.x * 1.6, y: ghost.scale.y * 1.6, duration: T(0.22) }, 0)
      .to(ghost, { x: to.x + this.rect.w * 0.12, y: to.y, duration: T(0.24), ease: 'power3.in' })
      .to(ghost, { alpha: 0, duration: T(0.08) });
    ghost.destroy();
    this.bump(2);
    await this.setValue(finalValue, 1.1);
  }

  get displayBounds() {
    return this.rect;
  }
}

export function fmtMult(m: number): string {
  if (m >= 1_000_000) return `${(m / 1_000_000).toFixed(m >= 10_000_000 ? 0 : 1)}M`;
  if (m >= 10_000) return `${Math.round(m / 1000)}K`;
  return Number.isInteger(m) ? String(m) : m.toFixed(1);
}
