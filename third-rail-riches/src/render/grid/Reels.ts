import { Container, FillGradient, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, evict, softDotTexture } from '../textures';
import { carFrame, markerLamp, CAR } from '../../art/scene';
import { C } from '../../art/kit';
import type { Layout } from '../layout';

/**
 * Track centre line of a row (stage y): the middle of the two faint rails drawn across that row of
 * the track board. Trains ride on it. The rails sit `CAR.gauge * L.S / 2` above and below.
 */
export function rowTrackY(L: Layout, row: number): number {
  return L.grid.y + (row + CAR.trackY) * L.S;
}

/** Rail gauge in px for this layout (distance between a row's two rails). */
export function trackGauge(L: Layout): number {
  return CAR.gauge * L.S;
}

/**
 * Gradients are created once and never freed: Pixi can free a gradient texture while a cleared
 * Graphics' cached batches still point at it, which throws every frame after a resize.
 */
const once = <T,>(make: () => T) => {
  let v: T | undefined;
  return () => (v ??= make());
};

/** Electric light rising up an anticipating reel (strong at the base, faint at the top). */
const anticipGrad = once(
  () =>
    new FillGradient({
      type: 'linear',
      start: { x: 0, y: 1 },
      end: { x: 0, y: 0 },
      colorStops: [
        { offset: 0, color: `${C.volt}66` },
        { offset: 0.45, color: `${C.volt}22` },
        { offset: 1, color: `${C.voltLight}10` },
      ],
    }),
);

/** A reel's anticipation glow and whether it is lit / which layout it was drawn for. */
type Glow = Container & { lit?: boolean; drawnFor?: Layout; fill?: Graphics; bars?: Graphics };

const hex = (c: string) => parseInt(c.slice(1), 16);
const VOLT = hex(C.volt);
const VOLT_LIGHT = hex(C.voltLight);
const VOLT_CORE = hex(C.voltCore);
const AMBER = hex(C.amber);

/**
 * The reel frame: a riveted streamliner window. Maroon enamel panels with brass beads, rivets,
 * corner fans, a winged-wheel plaque and a vent grille; inside, the dark track board with four
 * rows of track (two faint rails on sleepers each) across all six reels. One SVG (carFrame,
 * S = 100 units) rasterised per layout in `back`, under the symbols. `front` holds two brass
 * marker lamps on the top corners (amber; electric blue while a reel is held).
 */
export class Reels {
  back = new Container();
  front = new Container();
  private frame = new Sprite();
  private anticip = new Container();
  private glows: Glow[] = [];
  private markers: { lamp: Sprite; glow: Sprite }[] = [];
  private markerHot = { v: 0 };
  private stamp = 0;

  constructor() {
    this.back.addChild(this.frame, this.anticip);
    this.anticip.blendMode = 'add';
    this.back.eventMode = 'none';
    this.front.eventMode = 'none';
  }

  async layout(L: Layout, res: number) {
    const stamp = ++this.stamp;
    const { S, frame } = L;
    const k = S / 100;
    const w = CAR.vw * k;
    const h = CAR.vh * k;
    const mw = Math.max(10, S * 0.24);
    const [tex, mk] = await Promise.all([svgTexture('car-frame', carFrame(), w * res, h * res), svgTexture('car-marker', markerLamp(), mw * res)]);
    if (stamp !== this.stamp) return;
    this.frame.texture = tex;
    this.frame.position.set(frame.x + CAR.vx * k, frame.y + CAR.vy * k);
    this.frame.width = w;
    this.frame.height = h;

    // marker lamps on the two top corner fans
    for (const m of this.markers) {
      m.lamp.destroy();
      m.glow.destroy();
    }
    const inset = S * 0.06;
    this.markers = [frame.x + inset, frame.x + frame.w - inset].map((x) => {
      const glow = new Sprite(softDotTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = AMBER;
      glow.width = glow.height = mw * 2.6;
      glow.alpha = 0.45;
      glow.position.set(x, frame.y + inset);
      const lamp = new Sprite(mk);
      lamp.anchor.set(0.5);
      lamp.width = lamp.height = mw;
      lamp.position.set(x, frame.y + inset);
      this.front.addChild(glow, lamp);
      return { lamp, glow };
    });
    this.paintMarkers();
    for (const g of this.glows) g.drawnFor = undefined;
    for (const g of this.glows) if (g.lit) this.glowFor(L, this.glows.indexOf(g));
    evict('car-', new Set([tex, mk].filter((t) => t !== Texture.EMPTY).map((t) => t.source.label)));
  }

  /**
   * Electric-blue anticipation on the given reels (0..5); an empty array clears. Each glow fades
   * in, pulses with `beat()`, and fades out when its reel is no longer held.
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
    const any = this.glows.some((g) => g.lit);
    gsap.to(this.markerHot, { v: any ? 1 : 0, duration: 0.3, ease: 'power2.out', onUpdate: () => this.paintMarkers() });
  }

  /** A pulse: every lit glow crackles up twice; the marker lamps blink with it. */
  beat() {
    for (const g of this.glows) {
      if (!g.lit) continue;
      gsap.killTweensOf(g);
      gsap
        .timeline()
        .to(g, { alpha: 1, duration: 0.06, ease: 'power2.out' })
        .to(g, { alpha: 0.6, duration: 0.1, ease: 'power1.in' })
        .to(g, { alpha: 0.92, duration: 0.06, ease: 'power2.out' })
        .to(g, { alpha: 0.72, duration: 0.2, ease: 'sine.inOut' });
    }
    for (const m of this.markers) {
      gsap.killTweensOf(m.glow.scale);
      const s = m.glow.scale.x;
      gsap.fromTo(m.glow.scale, { x: s * 1.25, y: s * 1.25 }, { x: s, y: s, duration: 0.35, ease: 'power2.out' });
    }
  }

  private paintMarkers() {
    const v = this.markerHot.v;
    for (const m of this.markers) {
      m.glow.tint = v > 0.5 ? VOLT_LIGHT : AMBER;
      m.glow.alpha = 0.4 + v * 0.35;
      m.lamp.tint = v > 0.5 ? 0xcfefff : 0xffffff;
    }
  }

  private glowFor(L: Layout, r: number) {
    let g = this.glows[r];
    if (!g) {
      g = new Container() as Glow;
      g.fill = new Graphics();
      g.bars = new Graphics();
      g.addChild(g.fill, g.bars);
      g.visible = false;
      g.alpha = 0;
      this.glows[r] = g;
      this.anticip.addChild(g);
    }
    if (g.drawnFor !== L) {
      g.drawnFor = L;
      const S = L.S;
      const x = L.grid.x + r * (S + L.gx);
      const f = g.fill!.clear();
      f.roundRect(x, L.grid.y, S, L.grid.h, S * 0.07).fill({ fill: anticipGrad() });
      f.roundRect(x - S * 0.035, L.grid.y - S * 0.03, S * 1.07, L.grid.h + S * 0.06, S * 0.09).stroke({ width: S * 0.05, color: VOLT, alpha: 0.75 });
      f.roundRect(x - S * 0.01, L.grid.y - S * 0.005, S * 1.02, L.grid.h + S * 0.01, S * 0.08).stroke({ width: Math.max(1, S * 0.014), color: VOLT_CORE, alpha: 0.7 });
      // the frame's top and bottom beams light up over the held reel
      const b = g.bars!.clear();
      const T = L.frameT;
      for (const y of [L.frame.y, L.grid.y + L.grid.h]) {
        b.roundRect(x - S * 0.06, y + T * 0.12, S * 1.12, T * 0.76, T * 0.3).fill({ color: VOLT, alpha: 0.4 });
        b.roundRect(x + S * 0.08, y + T * 0.38, S * 0.84, T * 0.24, T * 0.12).fill({ color: VOLT_LIGHT, alpha: 0.55 });
      }
    }
    return g;
  }
}
