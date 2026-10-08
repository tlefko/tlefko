import { BitmapText, Container } from 'pixi.js';
import gsap from 'gsap';
import { numBaseStyle, NUM_BASE, type NumTone } from '../text';
import { motion } from '../characters/motion';

/** Row spacing of a rolling digit, as a multiple of the font size: more than a glyph is tall. */
const ROW = 1.3;

interface Slot {
  ch: string;
  digit: boolean;
  /** Two glyphs for a digit (the one leaving, the one arriving); one for a separator. */
  a: BitmapText;
  b?: BitmapText;
  /** Rolling position (unbounded, always counts forward) and where it is heading. */
  pos: number;
  target: number;
  /** How often the digit changes (per second, smoothed): a fast digit flips instead of rolling. */
  rate: number;
  changedAt: number;
  x: number;
  tx: number;
  w: number;
  born: number;
}

/**
 * An odometer for money in our numerals. Every digit rolls up to its next value, a column of
 * glyphs spaced wider than a glyph is tall; a digit leaving and the next arriving fade as they
 * move, so the roll reads without any mask cutting a glyph (a mask would shave the tops). Digits
 * sit in fixed-width cells (the widest numeral), so the figure never jitters sideways; separators
 * and currency marks are plain glyphs. New leading digits fade and pop in, and the whole figure
 * glides wider and scales down to `maxWidth` as it grows.
 *
 * Drive it with `value` (then it rolls) or `set()` (jumps). `text` is the formatted value shown.
 */
export class RollingNumber extends Container {
  private slots: Slot[] = [];
  private cell = 0;
  private sizeK: number;
  private _value = 0;
  private shownText = '';
  private fit = 1;
  private ticking = false;
  private lastT = 0;
  /** The figure never gets wider than this (it scales down); 0 = no limit. */
  maxWidth = 0;
  format: (v: number) => string;

  constructor(
    private tone: NumTone,
    size: number,
    format: (v: number) => string = (v) => v.toFixed(2),
  ) {
    super();
    this.eventMode = 'none';
    this.format = format;
    this.sizeK = size / NUM_BASE;
    // the widest numeral sets the digit cell
    for (let d = 0; d < 10; d++) {
      const t = new BitmapText({ text: String(d), style: numBaseStyle(tone) });
      this.cell = Math.max(this.cell, t.width);
      t.destroy();
    }
  }

  /** On-screen font size. */
  set size(px: number) {
    this.sizeK = px / NUM_BASE;
    this.relayout(true);
  }

  get text(): string {
    return this.shownText;
  }

  get value(): number {
    return this._value;
  }
  /** Set the value; digits that change roll to it. */
  set value(v: number) {
    this._value = v;
    this.apply(this.format(v), true);
  }

  /** Jump to a value with no roll. */
  set(v: number) {
    this._value = v;
    this.apply(this.format(v), false);
  }

  /**
   * Show a ready-made string (an amount formatted elsewhere): its digits roll forward from what is
   * on screen, or jump there with `roll` false.
   */
  showText(str: string, roll = true) {
    this.dirUp = true;
    this.apply(str, roll);
  }
  private dirUp: boolean | null = null;

  /** A punch on top of the fit scale (1 = none), e.g. when the figure jumps up. */
  private boost = { k: 1 };
  punch(strength = 0.14, dur = 0.34) {
    gsap.killTweensOf(this.boost);
    gsap.fromTo(this.boost, { k: 1 + strength }, { k: 1, duration: dur, ease: 'back.out(2.4)' });
    this.startTicking();
  }

  /** Width of the figure as laid out (before the fit scale). */
  get naturalWidth(): number {
    return this.slots.reduce((s, x) => s + x.w, 0);
  }

  private glyph(ch: string): BitmapText {
    const t = new BitmapText({ text: ch, style: numBaseStyle(this.tone) });
    t.anchor.set(0.5);
    this.addChild(t);
    return t;
  }

  private apply(str: string, roll: boolean) {
    if (str === this.shownText && roll) return;
    const prev = this.slots;
    const chars = [...str];
    const next: Slot[] = [];
    // align from the right: the decimals stay put while the figure grows on the left
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[chars.length - 1 - i];
      const old = prev[prev.length - 1 - i];
      const digit = ch >= '0' && ch <= '9';
      if (old && old.digit && digit) {
        const d = Number(ch);
        const cur = ((old.target % 10) + 10) % 10;
        if (!roll || motion.reduced) {
          old.pos = old.target = d;
        } else if (d !== cur) {
          // always roll forward (9 -> 0 goes round), unless the figure went down
          const up = this.dirUp ?? this._value >= this.lastValue;
          const now = performance.now();
          const since = Math.max(1, now - old.changedAt);
          old.rate = old.rate * 0.6 + (1000 / since) * 0.4;
          old.changedAt = now;
          old.target = up ? old.target + ((d - cur + 10) % 10) : d;
          if (!up) old.pos = old.target;
        }
        old.ch = ch;
        next.unshift(old);
      } else if (old && !old.digit && !digit && old.ch === ch) {
        next.unshift(old);
      } else {
        if (old) this.drop(old);
        const s: Slot = { ch, digit, a: this.glyph(ch), pos: digit ? Number(ch) : 0, target: digit ? Number(ch) : 0, rate: 0, changedAt: 0, x: 0, tx: 0, w: 0, born: roll && prev.length ? performance.now() : 0 };
        if (digit) {
          s.b = this.glyph(String((Number(ch) + 1) % 10));
          s.b.alpha = 0;
        }
        next.unshift(s);
      }
    }
    for (let i = 0; i < prev.length - chars.length; i++) this.drop(prev[i]);
    this.slots = next;
    this.shownText = str;
    this.lastValue = this._value;
    this.dirUp = null;
    this.relayout(!roll);
    if (roll) this.startTicking();
    else this.draw(0);
  }
  private lastValue = 0;

  private drop(s: Slot) {
    s.a.destroy();
    s.b?.destroy();
  }

  private relayout(snap: boolean) {
    const k = this.sizeK;
    let total = 0;
    for (const s of this.slots) {
      s.w = (s.digit ? this.cell : baseWidth(s.a)) * k;
      total += s.w;
    }
    let x = -total / 2;
    for (const s of this.slots) {
      s.tx = x + s.w / 2;
      if (snap || s.born) s.x = s.tx;
      x += s.w;
    }
    const want = this.maxWidth > 0 && total > this.maxWidth ? this.maxWidth / total : 1;
    if (snap) this.fit = want;
    this.fitTarget = want;
  }
  private fitTarget = 1;

  private startTicking() {
    if (this.ticking || this.destroyed) return;
    this.ticking = true;
    this.lastT = performance.now();
    gsap.ticker.add(this.tick);
  }

  private tick = () => {
    if (this.destroyed) {
      gsap.ticker.remove(this.tick);
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    if (!this.draw(dt)) {
      this.ticking = false;
      gsap.ticker.remove(this.tick);
    }
  };

  /** Lay the glyphs out for this frame; returns true while anything is still moving. */
  private draw(dt: number): boolean {
    const k = this.sizeK;
    const row = NUM_BASE * ROW * k;
    let moving = false;
    const ease = dt > 0 ? 1 - Math.exp(-dt * 26) : 1;
    const now = performance.now();
    for (const s of this.slots) {
      s.x += (s.tx - s.x) * (dt > 0 ? 1 - Math.exp(-dt * 12) : 1);
      if (Math.abs(s.tx - s.x) > 0.3) moving = true;
      let pop = 1;
      if (s.born) {
        const age = (now - s.born) / 1000;
        pop = age >= 0.3 ? 1 : 1 + 0.35 * Math.sin((age / 0.3) * Math.PI) * (1 - age / 0.3);
        if (age < 0.3) moving = true;
        else s.born = 0;
      }
      if (!s.digit) {
        s.a.position.set(s.x, 0);
        s.a.scale.set(k * pop);
        s.a.alpha = 1;
        continue;
      }
      // a digit changing faster than a roll can show just flips (the low digits of a fast count,
      // read as a spinning reel); a slower one rolls up to its next value
      const idle = now - s.changedAt;
      if (s.rate > 7 && idle < 160) {
        s.pos = s.target;
        const dd = ((s.target % 10) + 10) % 10;
        if (s.a.text !== String(dd)) s.a.text = String(dd);
        s.a.position.set(s.x, 0);
        s.a.alpha = 1;
        s.a.scale.set(k * pop, k * pop);
        if (s.b) s.b.alpha = 0;
        moving = true;
        continue;
      }
      if (idle >= 160) s.rate = 0;
      const gap = s.target - s.pos;
      if (gap > 0.0005) {
        s.pos += Math.max(gap * ease, Math.min(gap, dt * 6));
        moving = true;
      } else s.pos = s.target;
      if (s.pos > 1e4) {
        const cut = Math.floor(s.pos / 10) * 10 - 10;
        s.pos -= cut;
        s.target -= cut;
      }
      const base = Math.floor(s.pos + 1e-6);
      const frac = s.pos - base;
      const da = ((base % 10) + 10) % 10;
      const db = (da + 1) % 10;
      if (s.a.text !== String(da)) s.a.text = String(da);
      if (s.b && s.b.text !== String(db)) s.b.text = String(db);
      // the leaving digit rises and fades; the next rises in from below and fades up
      const ya = -frac * row;
      const yb = (1 - frac) * row;
      const fade = (y: number) => Math.max(0, 1 - Math.abs(y) / (row * 0.55)) ** 1.6;
      s.a.position.set(s.x, ya);
      s.a.alpha = fade(ya);
      s.a.scale.set(k * pop);
      if (s.b) {
        s.b.position.set(s.x, yb);
        s.b.alpha = frac > 0.001 ? fade(yb) : 0;
        s.b.scale.set(k * pop);
      }
    }
    // glide to the fit scale (times any punch)
    this.fit += (this.fitTarget - this.fit) * (dt > 0 ? 1 - Math.exp(-dt * 10) : 1);
    if (Math.abs(this.fitTarget - this.fit) > 0.002 || gsap.isTweening(this.boost)) moving = true;
    this.scale.set(this.fit * this.boost.k);
    return moving;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    gsap.ticker.remove(this.tick);
    gsap.killTweensOf(this.boost);
    this.slots = [];
    super.destroy(options ?? { children: true });
  }
}

/** Width of a glyph at the base size (its BitmapText width at scale 1). */
function baseWidth(t: BitmapText): number {
  const sx = t.scale.x;
  const sy = t.scale.y;
  t.scale.set(1);
  const w = t.width;
  t.scale.set(sx, sy);
  return w;
}
