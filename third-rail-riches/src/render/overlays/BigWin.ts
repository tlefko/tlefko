import { t } from '../../i18n';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { displayText, type DisplayText, type NumTone } from '../text';
import { svgTexture, softDotTexture, canvasTexture, freeTexture } from '../textures';
import { fareCoin } from '../../art/specials';
import { computeLayout, sceneLayout } from '../layout';

/** The scene's own layout when this is its size (in the replay column, W is the scene's part of the screen). */
const layoutFor = (W: number, H: number) => {
  const S = sceneLayout.L;
  return S && S.W === W && S.H === H ? S : computeLayout(W, H);
};
import { T, done } from '../timing';
import { RollingNumber } from '../winbar/RollingNumber';
import { motion } from '../characters/motion';
import { cast } from '../characters/cast';
import { sound } from '../../game/sound';
import type { Particles } from '../fx/Particles';

export interface Tier {
  min: number;
  label: () => string;
  tone: NumTone;
  secs: number;
}
export const TIERS: Tier[] = [
  { min: 20, label: () => t('bigWin'), tone: 'fire', secs: 3.2 },
  { min: 50, label: () => t('megaWin'), tone: 'fire', secs: 4.4 },
  { min: 100, label: () => t('epicWin'), tone: 'crimson', secs: 5.6 },
  { min: 500, label: () => t('unholyWin'), tone: 'gold', secs: 7.2 },
];
/** Sunburst tint per tier: gold, fire, crimson, then white gold for the King's Ransom. */
const RAY_TINT = [0xffc233, 0xff8a2a, 0xff5a44, 0xfff0b0];

export function tierFor(multiple: number): number {
  let t = -1;
  TIERS.forEach((x, i) => multiple >= x.min && (t = i));
  return t;
}

interface Coin {
  s: Sprite;
  vx: number;
  vy: number;
  spin: number;
  age: number;
  life: number;
  k: number;
}

/**
 * Big win celebration. The board dims except for two warm spotlights on the crew (they dance and
 * whoop on every tier); a sunburst turns behind the tier title. Each new tier SLAMS in: the title
 * drops from big onto the screen, squashes on impact and settles, the screen jolts and flashes, a
 * shock ring runs out and doubloons burst from the title while fountains pour from the bottom
 * corners, harder every tier. The amount counts up on rolling numerals. Tap to skip to the end.
 */
export class BigWin extends Container {
  private shade = new Sprite();
  private spots: Sprite[] = [];
  private rays = new Container();
  private rayG = new Graphics();
  private flash = new Graphics();
  private ring = new Graphics();
  private titles: DisplayText[] = [];
  private titleK: number[] = [];
  private title?: DisplayText;
  /** The amount (rolling numerals). Its `text` is the formatted amount on screen. */
  amount!: RollingNumber;
  /** Holds the amount so it can punch and scale without fighting the numerals' own fit. */
  private amountBox = new Container();
  private coinLayer = new Container();
  private coinTex: Texture[] = [];
  private coins: Coin[] = [];
  private pool: Sprite[] = [];
  private skip?: () => void;
  private live = true;
  private anims: gsap.core.Animation[] = [];
  private ringSt = { r: 0, a: 0 };
  private lastT = 0;
  private U: number;

  constructor(
    private W: number,
    private H: number,
    private fx: Particles,
  ) {
    super();
    this.U = Math.min(W, H);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => this.skip?.());
  }

  /** What prepare() made for one screen size: coin art, every tier's lettering, the spotlit dim. */
  private static kit: { key: string; coins: Texture[]; titles: DisplayText[]; shade: Texture } | null = null;

  /**
   * Build everything a big win needs for a W x H screen ahead of time (coin art, the lettering of
   * all four tiers, the spotlit dim), so a big win opens without painting or rasterising anything.
   * Cheap to call again: it only rebuilds when the size or resolution changed.
   */
  static async prepare(W: number, H: number, res = Math.min(2, window.devicePixelRatio || 1)): Promise<Texture[]> {
    const key = `${W}x${H}@${res}`;
    const own = () => (BigWin.kit ? [...BigWin.kit.coins, BigWin.kit.shade, ...BigWin.kit.titles.map((d) => d.texture)] : []);
    if (BigWin.kit?.key === key) return own();
    const U = Math.min(W, H);
    const px = Math.round(U * 0.085 * res);
    const coins = await Promise.all((['gold', 'silver', 'bronze'] as const).map((m) => svgTexture(`bw-coin-${m}`, fareCoin(m), px)));
    if (BigWin.kit?.key === key) return own();
    const titles = TIERS.map((tier) => displayText(tier.label(), { size: U * 0.13, tone: tier.tone, treatment: 'banner', res }));
    const shade = BigWin.paintShade(W, H);
    const old = BigWin.kit;
    BigWin.kit = { key, coins, titles, shade };
    if (old) {
      for (const d of old.titles) if (!d.parent) d.destroy();
      if (old.shade !== shade) freeTexture(old.shade);
    }
    return own();
  }

  /** The dim over the board, with soft warm holes where the captain and the parrot stand. */
  private static paintShade(W: number, H: number): Texture {
    const L = layoutFor(W, H);
    const q = 4; // quarter resolution: the shade is all soft edges
    const holes = [L.captain, L.parrot].map((c) => ({ x: c.x, y: c.y - c.h * 0.5, r: c.h * 0.78 }));
    return canvasTexture(W / q, H / q, (ctx) => {
      ctx.fillStyle = 'rgba(4,3,6,0.76)';
      ctx.fillRect(0, 0, W / q, H / q);
      ctx.globalCompositeOperation = 'destination-out';
      for (const h of holes) {
        const g = ctx.createRadialGradient(h.x / q, h.y / q, 0, h.x / q, h.y / q, h.r / q);
        g.addColorStop(0, 'rgba(0,0,0,0.78)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W / q, H / q);
      }
    });
  }

  private track<A extends gsap.core.Animation>(a: A): A {
    this.anims.push(a);
    return a;
  }

  /** Lay the prepared dim over the screen and put warm spotlights on the crew. */
  private buildShade(shade: Texture) {
    const { W, H } = this;
    const L = layoutFor(W, H);
    const holes = [L.captain, L.parrot].map((c) => ({ x: c.x, y: c.y - c.h * 0.5, r: c.h * 0.78 }));
    this.shade.texture = shade;
    this.shade.width = W;
    this.shade.height = H;
    for (const h of holes) {
      const s = new Sprite(softDotTexture());
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = 0xffb24a;
      s.alpha = 0;
      s.width = s.height = h.r * 1.7;
      s.position.set(h.x, h.y);
      this.spots.push(s);
    }
  }

  /** Sunburst drawn once (white wedges, tinted per tier) and turned as a whole. */
  private buildRays() {
    const R = Math.hypot(this.W, this.H);
    const g = this.rayG.clear();
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI / n) * 0.9;
      g.moveTo(0, 0)
        .lineTo(Math.cos(a0) * R, Math.sin(a0) * R)
        .lineTo(Math.cos(a1) * R, Math.sin(a1) * R)
        .closePath()
        .fill({ color: 0xffffff, alpha: 0.085 });
    }
    g.circle(0, 0, this.U * 0.34).fill({ color: 0xffffff, alpha: 0.07 });
    this.rays.addChild(this.rayG);
    this.rays.position.set(this.W / 2, this.H * 0.4);
  }

  /**
   * @param multiple win in bet multiples; @param fmt formats a multiple as currency
   * @returns resolves after the celebration closes
   */
  async run(multiple: number, fmt: (m: number) => string, hooks: { onTier?: (i: number) => void; onTick?: () => void; auto?: boolean } = {}) {
    const { W, H, U } = this;
    const red = motion.reduced;
    await BigWin.prepare(W, H);
    const kit = BigWin.kit;
    if (this.destroyed || !kit) return;
    this.coinTex = kit.coins;
    this.buildShade(kit.shade);
    this.buildRays();
    this.flash.rect(0, 0, W, H).fill({ color: 0xfff4d6 });
    this.flash.alpha = 0;
    // doubloons fly behind the lettering, never across it
    this.addChild(this.shade, ...this.spots, this.rays, this.ring, this.coinLayer, this.flash);
    const top = tierFor(multiple);
    const tiers = TIERS.slice(0, Math.max(0, top) + 1);
    // every title that can show is lettered now (no painting mid-animation), fitted with room for
    // the slam's squash so no glyph ever meets the screen edge
    const titleY = H * 0.36;
    for (let i = 0; i < tiers.length; i++) {
      const d = kit.titles[i];
        d.rotation = 0;
      d.alpha = 1;
      const kw = (W * 0.78) / Math.max(1, d.width);
      const kh = (H * 0.2) / Math.max(1, d.height);
      const k = Math.min(1, kw, kh);
      d.scale.set(k);
      d.position.set(W / 2, titleY);
      d.visible = false;
      this.titles.push(d);
      this.titleK.push(k);
      this.addChildAt(d, this.getChildIndex(this.flash));
    }
    this.amount = new RollingNumber('gold', U * 0.12, fmt);
    this.amount.maxWidth = W * 0.84;
    this.amount.set(0);
    this.amountBox.addChild(this.amount);
    this.amountBox.position.set(W / 2, H * 0.555);
    this.addChildAt(this.amountBox, this.getChildIndex(this.flash));
    this.lastT = performance.now();
    gsap.ticker.add(this.tick);

    // entrance: the dim and spotlights fade up, the burst grows, the first tier slams in
    this.track(gsap.from(this.shade, { alpha: 0, duration: T(0.3) }));
    for (const s of this.spots) this.track(gsap.to(s, { alpha: 0.28, duration: T(0.5), delay: T(0.1) }));
    this.rays.scale.set(0.5);
    this.rays.alpha = 0;
    this.rayG.tint = RAY_TINT[0];
    this.track(gsap.to(this.rays, { alpha: 1, duration: T(0.35) }));
    this.track(gsap.to(this.rays.scale, { x: 1, y: 1, duration: T(0.6), ease: 'back.out(1.6)' }));
    this.track(gsap.to(this.rays, { rotation: Math.PI * 2, duration: 30, repeat: -1, ease: 'none' }));
    this.amountBox.scale.set(0);
    this.track(gsap.to(this.amountBox.scale, { x: 1, y: 1, duration: T(0.4), ease: 'back.out(2.2)', delay: T(0.2) }));
    let tierIdx = 0;
    this.slam(0, hooks, true);

    const secs = tiers[tiers.length - 1].secs * (hooks.auto ? 0.8 : 1);
    const counter = { v: 0 };
    let lastTick = 0;
    let fountainAcc = 0;
    const count = this.track(
      gsap.to(counter, {
        v: multiple,
        duration: T(secs),
        ease: 'power1.inOut',
        onUpdate: () => {
          this.amount.value = counter.v;
          // a skip can jump several tiers at once: slam straight to the highest one reached
          let next = tierIdx;
          while (next + 1 < tiers.length && counter.v >= tiers[next + 1].min) next++;
          if (next !== tierIdx) {
            tierIdx = next;
            this.slam(tierIdx, hooks);
          }
          // fountains from the bottom corners, harder every tier
          fountainAcc += 1;
          const every = Math.max(2, 4 - tierIdx);
          if (fountainAcc % every === 0 && this.live) {
            const n = Math.max(1, Math.round((0.7 + tierIdx * 0.35) * motion.fx));
            this.fountain(W * 0.1, H * 1.02, n, tierIdx, 1);
            this.fountain(W * 0.9, H * 1.02, n, tierIdx, -1);
          }
          const now = performance.now();
          if (now - lastTick > 70) {
            lastTick = now;
            hooks.onTick?.();
          }
        },
      }),
    );
    await new Promise<void>((res) => {
      this.skip = () => {
        count.progress(1);
        res();
      };
      count.eventCallback('onComplete', () => res());
    });
    this.skip = undefined;
    this.amount.value = multiple;
    // the landing: the amount punches (never past the screen edge), a flash, a shower of doubloons
    const pop = Math.min(red ? 1.06 : 1.25, (W * 0.97) / Math.max(1, this.amount.width));
    this.track(gsap.fromTo(this.amountBox.scale, { x: pop, y: pop }, { x: 1, y: 1, duration: T(0.45), ease: 'back.out(3)' }));
    this.impact(W / 2, H * 0.555, 0.6);
    this.burst(W / 2, H * 0.56, Math.round(22 * motion.fx), Math.min(2, tierIdx + 1));
    cast.conductor?.accent('whoop');
    cast.rat?.accent('hop');
    await new Promise<void>((res) => {
      this.skip = res;
      this.track(gsap.delayedCall(hooks.auto ? 1.2 : 2.2, res));
    });
    this.skip = undefined;
    this.live = false;
    // exit: the letters lift and fade, the burst folds away, the dim lifts
    const exit = gsap.timeline();
    if (this.title) exit.to(this.title.scale, { x: this.title.scale.x * 1.08, y: this.title.scale.y * 1.08, duration: T(0.3), ease: 'power2.in' }, 0);
    exit
      .to(this.amountBox.scale, { x: 1.05, y: 1.05, duration: T(0.3), ease: 'power2.in' }, 0)
      .to(this.rays.scale, { x: 0.6, y: 0.6, duration: T(0.35), ease: 'power2.in' }, 0)
      .to(this, { alpha: 0, duration: T(0.32), ease: 'power1.in' }, 0.04);
    await done(this.track(exit));
    this.destroy({ children: true });
  }

  /** A tier title slams in: dropped from big onto the screen, squashed on impact, settled. */
  private slam(i: number, hooks: { onTier?: (i: number) => void }, first = false) {
    const d = this.titles[i];
    if (!d) return;
    const prev = this.title;
    this.title = d;
    const k = this.titleK[i];
    const red = motion.reduced;
    const { W, H } = this;
    // start big, but never past the screen: the full lettering box (padding included) stays inside
    const over = red ? 1.15 : Math.max(1.05, Math.min(first ? 2 : 2.4, (W * 0.97) / Math.max(1, d.width), (H * 0.42) / Math.max(1, d.height)));
    const squashX = Math.min(1.12, (W * 0.97) / Math.max(1, d.width));
    const y = H * 0.36;
    d.visible = true;
    d.alpha = 0;
    d.scale.set(k * over);
    d.y = y - H * 0.025;
    gsap.killTweensOf([d, d.scale]);
    const tl = gsap
      .timeline()
      .to(d, { alpha: 1, duration: T(0.06) }, 0)
      .to(d, { y, duration: T(0.16), ease: 'power3.in' }, 0)
      .to(d.scale, { x: k * squashX, y: k * 0.86, duration: T(0.16), ease: 'power3.in' }, 0)
      .call(() => {
        if (this.destroyed) return;
        // every tier lands with the slam sting (the first too: onTier only reports the later ones)
        sound.play('tierSlam', { volume: first ? 0.85 : 1 });
        sound.duck(0.35, 1.2);
        this.impact(W / 2, y, first ? 0.7 : 1);
        this.burst(W / 2, y, Math.round((first ? 8 : 12 + i * 3) * motion.fx), Math.min(2, i + 1));
        this.fx.burst(W / 2, y, Math.round(20 * motion.fx), 'fire', 1.4);
        this.rayG.tint = RAY_TINT[Math.min(RAY_TINT.length - 1, i)];
        this.track(gsap.fromTo(this.rays.scale, { x: 1.18, y: 1.18 }, { x: 1, y: 1, duration: T(0.5), ease: 'power2.out' }));
        for (const s of this.spots) this.track(gsap.fromTo(s, { alpha: 0.6 }, { alpha: 0.28, duration: T(0.6) }));
        if (!first) {
          cast.conductor?.accent('whoop');
          cast.rat?.accent(i % 2 ? 'squeak' : 'hop');
          hooks.onTier?.(i);
        }
      }, [], T(0.16))
      .to(d.scale, { x: k, y: k, duration: T(0.55), ease: 'elastic.out(1, .42)' }, T(0.16))
      .fromTo(d, { rotation: first ? 0 : -0.06 }, { rotation: 0, duration: T(0.6), ease: 'elastic.out(1, .4)' }, T(0.16));
    this.track(tl);
    if (prev && prev !== d) {
      gsap.killTweensOf([prev, prev.scale]);
      this.track(
        gsap
          .timeline()
          .to(prev.scale, { x: prev.scale.x * 1.12, y: prev.scale.y * 1.12, duration: T(0.12), ease: 'power2.out' }, 0)
          .to(prev, { alpha: 0, duration: T(0.12), ease: 'power1.in', onComplete: () => void (prev.visible = false) }, 0),
      );
    }
  }

  /** The hit of a slam: the overlay jolts, a flash, a shock ring from the point. */
  private impact(x: number, y: number, power: number) {
    if (motion.reduced) return;
    this.track(gsap.fromTo(this.flash, { alpha: 0.32 * power }, { alpha: 0, duration: T(0.32), ease: 'power2.out' }));
    const j = this.U * 0.018 * power;
    const tl = gsap.timeline({ onComplete: () => void this.position.set(0, 0) });
    for (let i = 0; i < 6; i++) tl.to(this, { x: (Math.random() - 0.5) * j * 2, y: (Math.random() - 0.5) * j * 2, duration: 0.035 });
    tl.to(this, { x: 0, y: 0, duration: 0.06 });
    this.track(tl);
    this.ring.position.set(x, y);
    this.ringSt.r = this.U * 0.08;
    this.ringSt.a = 0.9;
    this.track(gsap.to(this.ringSt, { r: this.U * 0.62, a: 0, duration: T(0.5), ease: 'power2.out' }));
  }

  /* ------------------------------ doubloons ------------------------------ */

  private spawn(x: number, y: number, vx: number, vy: number, tier: number, size: number) {
    if (this.coins.length > (motion.low ? 45 : 100)) return;
    const s = this.pool.pop() ?? new Sprite();
    const pick = tier >= 2 ? [0, 0, 1] : tier === 1 ? [1, 0, 2] : [2, 1];
    s.texture = this.coinTex[pick[(Math.random() * pick.length) | 0]] ?? this.coinTex[0];
    s.anchor.set(0.5);
    s.position.set(x, y);
    s.rotation = (Math.random() - 0.5) * 0.8;
    s.alpha = 1;
    const k = size / Math.max(1, s.texture.width);
    s.scale.set(k);
    this.coinLayer.addChild(s);
    this.coins.push({ s, vx, vy, spin: 6 + Math.random() * 8, age: 0, life: 1.5 + Math.random() * 0.8, k });
  }

  /** A fountain from a bottom corner, arcing in toward the middle. */
  private fountain(x: number, y: number, n: number, tier: number, dir: 1 | -1) {
    const U = this.U;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + dir * (0.1 + Math.random() * 0.45);
      const sp = U * (1.25 + Math.random() * 0.75);
      this.spawn(x + (Math.random() - 0.5) * U * 0.06, y, Math.cos(a) * sp, Math.sin(a) * sp, tier, U * (0.06 + Math.random() * 0.035));
    }
  }

  /** A ring of doubloons bursting from a point. */
  private burst(x: number, y: number, n: number, tier: number) {
    const U = this.U;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.7;
      const sp = U * (0.55 + Math.random() * 0.9);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp - U * 0.25, tier, U * (0.055 + Math.random() * 0.04));
    }
  }

  private tick = () => {
    if (this.destroyed) {
      gsap.ticker.remove(this.tick);
      return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const g = this.U * 2.3;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      if (c.age >= c.life || c.s.y > this.H + this.U * 0.2) {
        c.s.removeFromParent();
        this.pool.push(c.s);
        this.coins.splice(i, 1);
        continue;
      }
      c.vy += g * dt;
      c.vx *= Math.exp(-0.35 * dt);
      c.s.x += c.vx * dt;
      c.s.y += c.vy * dt;
      c.s.rotation += c.vx * 0.0006 * dt * 60;
      c.s.scale.set(c.k * Math.cos(c.age * c.spin), c.k);
      c.s.alpha = c.age > c.life - 0.3 ? (c.life - c.age) / 0.3 : 1;
    }
    const r = this.ringSt;
    const rg = this.ring.clear();
    if (r.a > 0.01) {
      rg.circle(0, 0, r.r).stroke({ width: this.U * 0.022 * r.a + 1, color: 0xffc233, alpha: r.a });
      rg.circle(0, 0, r.r * 0.93).stroke({ width: this.U * 0.008, color: 0xfff4d6, alpha: r.a * 0.8 });
    }
  };

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    gsap.ticker.remove(this.tick);
    for (const a of this.anims) a.kill();
    this.anims = [];
    gsap.killTweensOf([this, this.rays, this.rays.scale, this.flash, this.ringSt, ...this.spots, ...this.titles.flatMap((d) => [d, d.scale])]);
    gsap.killTweensOf(this.amountBox.scale);
    for (const s of this.pool) s.destroy();
    this.pool = [];
    // the lettering and the dim belong to the prepared kit: they outlive this celebration
    for (const d of this.titles) d.removeFromParent();
    this.shade.texture = Texture.EMPTY;
    super.destroy(options ?? { children: true });
  }
}
