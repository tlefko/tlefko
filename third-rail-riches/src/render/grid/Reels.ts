import { Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, evict } from '../textures';
import { hatchFrame, skullFinial, HATCH } from '../../art/scene';
import { C } from '../../art/kit';
import type { Layout } from '../layout';

/**
 * Gradients are created once and never freed: Pixi can free a gradient texture while a cleared
 * Graphics' cached batches still point at it, which throws every frame after a resize.
 */
const once = <T,>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};

/** Treasure-gold light rising up an anticipating reel (strong at the base, gone at the top). */
const anticipGrad = once(
  () =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 1 },
      end: { x: 0, y: 0 },
      colorStops: [
        { offset: 0, color: `${C.gold}58` },
        { offset: 0.45, color: `${C.gold}1c` },
        { offset: 1, color: `${C.goldLight}0c` },
      ],
    }),
);

/** A reel's anticipation glow and whether it is lit / which layout it was drawn for. */
type Glow = Graphics & { lit?: boolean; drawnFor?: Layout };

const GOLD = parseInt(C.gold.slice(1), 16);
const GOLD_LIGHT = parseInt(C.goldLight.slice(1), 16);

/**
 * The reel frame: a ship's cargo hatch. Heavy dark-oak coaming with brass corner brackets and
 * rivets, rope-lashed posts capped with carved skulls, and the dark hold behind the six reels.
 * The whole frame is one SVG rasterised per layout (`back`, under the symbols); the skull
 * finials sit in `front`, above them.
 */
export class Reels {
  back = new Container();
  front = new Container();
  private frame = new Sprite();
  private anticip = new Container();
  /** One glow per reel, so each fades on its own as its held reel lands. */
  private glows: Glow[] = [];
  private finials: Sprite[] = [];
  private stamp = 0;

  constructor() {
    this.back.addChild(this.frame, this.anticip);
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
  }

  async layout(L: Layout, res: number) {
    const stamp = ++this.stamp;
    const { S, frame } = L;
    const k = S / 100;
    const w = HATCH.vw * k;
    const h = HATCH.vh * k;
    const postW = HATCH.postW * k;
    // skulls sit centred on the posts; when the frame hugs the screen edge (portrait phones) they
    // nudge inward a touch and shrink just enough to stay whole on screen
    const xs = [frame.x - postW * 0.35 + postW / 2, frame.x + frame.w - postW * 0.65 + postW / 2];
    // the skull spans ~72% of its box, so its visible half-width is 0.36 x the box
    const full = postW * 1.7;
    const room = Math.min(xs[0], L.W - xs[1]);
    const nudge = Math.max(0, Math.min(postW * 0.3, full * 0.36 + 1.5 - room));
    const fs = Math.max(postW * 0.8, Math.min(full, (room + nudge - 1.5) / 0.36));
    xs[0] += nudge;
    xs[1] -= nudge;
    const [tex, fin] = await Promise.all([svgTexture('hatch-frame', hatchFrame(), w * res, h * res), svgTexture('hatch-finial', skullFinial(), fs * res)]);
    if (stamp !== this.stamp) return;
    this.frame.texture = tex;
    this.frame.position.set(frame.x + HATCH.vx * k, frame.y + HATCH.vy * k);
    this.frame.width = w;
    this.frame.height = h;

    // carved skulls capping the two posts
    for (const f of this.finials) f.destroy();
    this.finials = xs.map((x, i) => {
      const s = new Sprite(fin);
      s.anchor.set(0.5, 0.92);
      s.width = s.height = fs;
      if (i === 1) s.scale.x *= -1;
      s.position.set(x, frame.y + (HATCH.postTop + 4) * k);
      this.front.addChild(s);
      return s;
    });
    for (const g of this.glows) g.drawnFor = undefined;
    // drop hatch rasters from earlier viewport sizes (the sprites above now use this layout's)
    evict('hatch-', new Set([tex, fin].filter((t) => t !== Texture.EMPTY).map((t) => t.source.label)));
  }

  /**
   * Gold anticipation glow on the given reels (0..5); an empty array clears. Each glow fades in,
   * beats with the chests (`beat()`), and fades out when its reel is no longer held.
   */
  setAnticipation(L: Layout, reels: number[], strength = 1) {
    for (let r = 0; r < 6; r++) {
      const on = strength > 0 && reels.includes(r);
      const g = this.glowFor(L, r);
      if (on && !g.lit) {
        g.lit = true;
        gsap.killTweensOf(g);
        g.visible = true;
        gsap.fromTo(g, { alpha: 0 }, { alpha: strength, duration: 0.28, ease: 'power2.out' });
      } else if (!on && g.lit) {
        g.lit = false;
        gsap.killTweensOf(g);
        gsap.to(g, { alpha: 0, duration: 0.24, ease: 'power1.in', onComplete: () => void (g.visible = false) });
      }
    }
  }

  /** A heartbeat through every lit glow: two quick flares (in time with the chests). */
  beat() {
    for (const g of this.glows) {
      if (!g.lit) continue;
      gsap.killTweensOf(g);
      gsap
        .timeline()
        .to(g, { alpha: 1, duration: 0.07, ease: 'power2.out' })
        .to(g, { alpha: 0.62, duration: 0.12, ease: 'power1.in' })
        .to(g, { alpha: 0.9, duration: 0.07, ease: 'power2.out' })
        .to(g, { alpha: 0.7, duration: 0.2, ease: 'sine.inOut' });
    }
  }

  private glowFor(L: Layout, r: number) {
    let g = this.glows[r];
    if (!g) {
      g = new Graphics() as Glow;
      g.visible = false;
      g.alpha = 0;
      this.glows[r] = g;
      this.anticip.addChild(g);
    }
    if (g.drawnFor !== L) {
      g.drawnFor = L;
      const x = L.grid.x + r * (L.S + L.gx);
      g.clear();
      g.roundRect(x, L.grid.y, L.S, L.grid.h, L.S * 0.07).fill({ fill: anticipGrad() });
      g.roundRect(x - L.S * 0.04, L.grid.y - L.S * 0.04, L.S * 1.08, L.grid.h + L.S * 0.08, L.S * 0.1).stroke({ width: L.S * 0.05, color: GOLD, alpha: 0.8 });
      g.roundRect(x - L.S * 0.01, L.grid.y - L.S * 0.01, L.S * 1.02, L.grid.h + L.S * 0.02, L.S * 0.08).stroke({ width: L.S * 0.014, color: GOLD_LIGHT, alpha: 0.7 });
    }
    return g;
  }
}
