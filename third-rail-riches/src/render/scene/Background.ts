import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { svgTexture, canvasTexture, freeTexture, evict } from '../textures';
import {
  stationBackdrop,
  pendantLamp,
  PENDANT,
  clockFace,
  clockHand,
  CLOCK,
  HAND,
  pigeonPerch,
  commuterCrowd,
  sparkArc,
  starGlint,
  SIGNAL,
  SIGNAL_COLORS,
  TUNNEL,
  PIT,
  mix,
  type BackdropSpec,
} from '../../art/scene';
import { C } from '../../art/kit';
import { PARROT_EXTENT, PARROT_UNITS, type Layout } from '../layout';

type BonusKind = 'tantrum' | 'witching' | 'limbo';

const hex = (c: string) => parseInt(c.slice(1), 16);
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t;
  const g = ag + (((b >> 8) & 255) - ag) * t;
  const bl = ab + ((b & 255) - ab) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Soft round light (white, tinted per use). Created once, shared, never freed. */
let softLight: Texture | null = null;
function softLightTexture(): Texture {
  return (softLight ??= canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,.6)');
    g.addColorStop(0.55, 'rgba(255,255,255,.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }));
}

/** Horizontal band of light, soft top and bottom (the third rail's glow). Created once. */
let bandTex: Texture | null = null;
function bandTexture(): Texture {
  return (bandTex ??= canvasTexture(4, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,255,255,.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 64);
  }));
}

/** Soft contact shadow (black ellipse falloff). Created once. */
let shadowTex: Texture | null = null;
function shadowTexture(): Texture {
  return (shadowTex ??= canvasTexture(128, 32, (ctx) => {
    ctx.setTransform(1, 0, 0, 0.25, 0, 0);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.7)');
    g.addColorStop(0.55, 'rgba(0,0,0,.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }));
}

/** Rising light for the bonus moods (white, tinted). Created once. */
let riseGrad: Texture | null = null;
function riseTexture(): Texture {
  return (riseGrad ??= canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,.55)');
    g.addColorStop(0.35, 'rgba(255,255,255,.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }));
}

/** Rasterise a one-off SVG at an exact size. Not cached: the caller frees it when replaced. */
async function rasterOnce(svg: string, w: number, h: number): Promise<Texture> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return canvasTexture(w, h, (ctx) => {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Lamp {
  root: Container;
  globe: Sprite;
  core: Sprite;
  glow: Sprite;
  spill: Sprite;
  seed: number;
  h: number;
}

interface Tunnel {
  /** Vanishing point (headlight origin) and portal size. */
  vx: number;
  vy: number;
  w: number;
  side: -1 | 1;
  core: Sprite;
  halo: Sprite;
  spill: Sprite;
  /** Mood glow (Last Train gold). */
  gold: Sprite;
}

interface Signal {
  glows: Sprite[];
  tunnel: number;
  /** Current aspect 0 red, 1 amber, 2 green, and the time it changed. */
  aspect: number;
  blink: number;
}

interface Plan {
  P: boolean;
  W: number;
  H: number;
  S: number;
  spec: BackdropSpec;
  lamps: { x: number; top: number; y: number; h: number }[];
  clock: { x: number; y: number; r: number } | null;
  railY: number;
  crowdY: number;
  moteBoxes: { x: number; y: number; w: number; h: number }[];
}

/**
 * Third Rail Riches: an art-deco subway station at midnight.
 *
 * One backdrop raster per layout holds everything static (scene.ts stationBackdrop: vault and
 * girder, mosaic frieze, cream tile wall, emerald band, columns, posters, signs, the track pit
 * with the third rail, tunnel mouths and signal heads, the near platform with its furniture).
 * Over it, the living parts: pendant lamps that glow and breathe, signal aspects that change for
 * passing trains, the station clock whose minute hand jumps every few seconds, pigeons on the
 * clock, sparks crackling along the third rail, dust motes in the lamplight, steam from a grate,
 * and every 20-40 s a distant train's headlight swelling and sweeping past inside a tunnel mouth.
 *
 * Moods (setBonusLight): 'witching' = RUSH HOUR (warmer, lamps up and flickering, a crowd of
 * commuter silhouettes on the platform, trains every few seconds, signals green), 'limbo' = LAST
 * TRAIN (midnight blue, lamps dimmed, golden light breathing out of both tunnels), 'tantrum' = a
 * short electric surge (lamps flicker blue, the third rail flares and sparks).
 *
 * Low quality (setLow): no lamp spill, a third of the motes, two steam puffs, sparks half as
 * often, the crowd holds still, and the backdrop raster is capped at 1.5x.
 */
export class Background extends Container {
  private backdrop = new Sprite();
  private frameGlow = new Sprite();
  private tunnelLayer = new Container();
  private tunnels: Tunnel[] = [];
  private rail = new Sprite();
  private railHot = new Sprite();
  private sparkLayer = new Container();
  private sparks: { s: Sprite; flash: Sprite; t: number; dur: number; on: boolean }[] = [];
  private sparkTex: Texture[] = [];
  private sparkNext = 2;
  private signalLayer = new Container();
  private signals: Signal[] = [];
  private crowdLayer = new Container();
  private crowd: TilingSprite[] = [];
  private steamLayer = new Container();
  private steam: { s: Sprite; t: number; dur: number; x: number; y: number; size: number }[] = [];
  private lampLayer = new Container();
  private rods = new Graphics();
  private lamps: Lamp[] = [];
  private clockLayer = new Container();
  private clockFaceS = new Sprite();
  private hourHand = new Sprite();
  private minuteHand = new Sprite();
  private pigeons: { s: Sprite; x: number; y: number; w: number; t: number; next: number; peck: boolean }[] = [];
  private pigeonTex: { sit: Texture; peck: Texture } | null = null;
  private moteLayer = new Container();
  private motes: { s: Sprite; box: number; x: number; y: number; vx: number; vy: number; phase: number; size: number }[] = [];
  private shadows = [new Sprite(), new Sprite()];
  private moodTint = new Sprite(Texture.WHITE);
  private floorGlow = new Sprite();
  private plan: Plan | null = null;
  private stamp = 0;
  private t = 0;
  /** Bonus light blend 0..1 and its target; `kind` is kept through the fade-out. */
  private moodK = 0;
  private moodTarget = 0;
  private kind: BonusKind = 'witching';
  private low = false;
  /** Clock: whole minutes since 11:00 and the displayed (sprung) minute angle. */
  private clockMin = 57;
  private clockShown = 57;
  private clockVel = 0;
  private clockNext = 8;
  /** The passing train: which tunnel, time into the run, and when the next one comes. */
  private train = { on: false, i: 0, t: 0, dur: 4.2, next: 9 };
  /** Electric surge flicker state (tantrum) and lamp flicker drop-outs (rush hour). */
  private flick = { v: 1, t: 0 };

  constructor() {
    super();
    this.eventMode = 'none';
    this.frameGlow.anchor.set(0.5);
    this.frameGlow.blendMode = 'add';
    this.rail.blendMode = 'add';
    this.railHot.blendMode = 'add';
    this.sparkLayer.blendMode = 'add';
    this.moodTint.alpha = 0;
    this.moodTint.blendMode = 'multiply';
    this.floorGlow.alpha = 0;
    this.floorGlow.blendMode = 'add';
    for (const sh of this.shadows) sh.anchor.set(0.5);
    this.clockFaceS.anchor.set(0.5);
    this.hourHand.anchor.set(HAND.px / HAND.w, HAND.py / HAND.h);
    this.minuteHand.anchor.set(HAND.px / HAND.w, HAND.py / HAND.h);
    this.clockLayer.addChild(this.clockFaceS, this.hourHand, this.minuteHand);
    this.lampLayer.addChild(this.rods);
    this.addChild(
      this.backdrop,
      this.frameGlow,
      this.tunnelLayer,
      this.rail,
      this.railHot,
      this.signalLayer,
      this.crowdLayer,
      this.steamLayer,
      this.clockLayer,
      this.lampLayer,
      this.sparkLayer,
      this.moteLayer,
      ...this.shadows,
      this.moodTint,
      this.floorGlow,
    );
  }

  /** Where everything goes for this viewport. */
  private makePlan(L: Layout): Plan {
    const { W, H, S, frame, logo, winBar, floorY } = L;
    const P = L.portrait;
    const sideW = (W - frame.w) / 2;
    const right = frame.x + frame.w;
    const fb = frame.y + frame.h;
    const ceilY = Math.max(7, S * 0.28);
    const lipY = floorY - S * (P ? 0.34 : 0.4);
    const pitH = S * (P ? 0.5 : 0.6);
    const baseY = lipY - pitH;
    const bandY = baseY - S * (P ? 0.92 : 1.1);
    const tunnels: BackdropSpec['tunnels'] = [];
    const signals: BackdropSpec['signals'] = [];
    const columns: BackdropSpec['columns'] = [];
    const posters: BackdropSpec['posters'] = [];
    const signs: BackdropSpec['signs'] = [];
    const props: BackdropSpec['props'] = [];
    const grates: BackdropSpec['grates'] = [];
    const pools: { x: number; y: number }[] = [];
    const lamps: Plan['lamps'] = [];
    let clock: Plan['clock'] = null;
    const lampH = S * 0.62;
    const tunnelAt = (tw: number, side: -1 | 1, x: number) => {
      const th = (tw * TUNNEL.h) / TUNNEL.w;
      tunnels.push({ x, w: tw, side });
      return { th, top: lipY - th };
    };
    if (P) {
      const room = lipY - fb - S * 0.12;
      const tw = Math.min(W * 0.27, (room * TUNNEL.w) / TUNNEL.h);
      if (tw > S * 0.8) {
        const a = tunnelAt(tw, -1, -tw * 0.14);
        tunnelAt(tw, 1, W - tw * 0.86);
        const sh = Math.min(S * 0.7, a.th * 0.42);
        signals.push({ x: tw * 0.86 + S * 0.24, y: a.top + a.th * 0.18, h: sh }, { x: W - tw * 0.86 - S * 0.24, y: a.top + a.th * 0.18, h: sh });
      }
      props.push({ kind: 'bench', x: W / 2, w: Math.min(S * 1.5, W * 0.32), y: floorY - S * 0.12 });
      // lamp top-left, clock top-right (the logo holds the middle)
      const lx = Math.min(S * 0.8, logo.x * 0.5 + S * 0.1);
      lamps.push({ x: lx, top: 0, y: Math.min(logo.y + logo.h * 0.55, S * 1.5), h: Math.min(lampH, S * 0.62) });
      const r = Math.max(S * 0.3, Math.min(S * 0.5, (W - (logo.x + logo.w)) * 0.36));
      clock = { x: W - r - S * 0.22, y: ceilY + S * 0.2 + r + S * 0.25, r };
      pools.push({ x: lx, y: lamps[0].y }, { x: W / 2, y: bandY - S * 1.1 });
      // a medallion sign on the wall between the cast, where the wall under the reels has room
      const sw = Math.min(S * 1.9, W * 0.38);
      const sgY = bandY - S * 0.55 - sw * 0.32;
      if (sgY > fb + S * 0.25) signs.push({ x: W / 2 - sw / 2, y: sgY, w: sw, kind: 1 });
    } else {
      // tunnel mouths at the screen edges, a little cut off (they bore away sideways), behind the cast
      const tw = Math.min(sideW * 0.86, S * 2.3, ((lipY - ceilY - S * 0.7) * TUNNEL.w) / TUNNEL.h);
      const tx = -tw * 0.16;
      const a = tunnelAt(tw, -1, tx);
      tunnelAt(tw, 1, W - tx - tw);
      // engaged columns flank the reels; the signal heads are bolted to them, clear of the cast
      const colW = S * 0.38;
      columns.push({ x: frame.x - S * 0.26, w: colW }, { x: right + S * 0.26, w: colW });
      const sh = Math.min(S * 0.8, (bandY - ceilY) * 0.3);
      const sy = Math.max(a.top - sh * 0.2, bandY - sh * 1.15);
      signals.push({ x: frame.x - S * 0.26, y: sy, h: sh }, { x: right + S * 0.26, y: sy, h: sh });
      const logoBottom = logo.y + logo.h;
      const ly = clamp(logoBottom + S * 0.55, S * 1.4, bandY - S * 0.9);
      const lx = S * 0.68;
      lamps.push({ x: frame.x - lx, top: 0, y: ly, h: lampH }, { x: right + lx, top: 0, y: ly, h: lampH });
      // the clock in the right zone, between the lamp and the edge: under the win bar in compact,
      // and only where the rat's reach leaves room
      const ratTop = L.parrot.y - (L.parrot.h * PARROT_EXTENT.h) / PARROT_UNITS;
      const top = L.compact ? winBar.y + winBar.h + S * 0.12 : ceilY + S * 0.3;
      const ca = right + lx + lampH * 0.36 + S * 0.14;
      const cb = W - S * 0.12;
      const r = Math.min(S * 0.6, (cb - ca) / 2, (ratTop - top + S * 0.6) * 0.42);
      if (r > S * 0.28) clock = { x: (ca + cb) / 2, y: top + r + S * 0.12, r };
      // enamel signs over the tunnel mouths, where the wall above has room and nothing else is
      const sw = Math.min(tw * 0.78, S * 1.5);
      const sgY = a.top - sw * 0.32 - S * 0.16;
      if (sgY > ceilY + S * 0.5) {
        const lsx = Math.max(S * 0.1, tx + tw * 0.5 - sw / 2);
        if (lsx + sw < frame.x - S * 0.55 && sgY > logoBottom + S * 0.1) signs.push({ x: lsx, y: sgY, w: sw, kind: 0 });
        const rsx = Math.min(W - S * 0.1 - sw, W - tx - tw * 0.5 - sw / 2);
        if (rsx > right + S * 0.55 && (!clock || sgY > clock.y + clock.r + S * 0.12)) signs.push({ x: rsx, y: sgY, w: sw, kind: 2 });
      }
      props.push({ kind: 'vending', x: Math.max(S * 0.42, sideW * 0.12), w: S * 0.6, y: floorY - S * 0.12 });
      props.push({ kind: 'bench', x: W - Math.max(S * 0.95, sideW * 0.28), w: S * 1.5, y: floorY - S * 0.12 });
      props.push({ kind: 'bin', x: frame.x - S * 0.5, w: S * 0.34, y: floorY - S * 0.1 });
      grates.push({ x: W / 2 + S * 1.2, y: floorY - S * 0.16, w: S * 0.95 });
      for (const l of lamps) pools.push({ x: l.x, y: l.y });
    }
    const spec: BackdropSpec = { w: W, h: H, S, ceilY, bandY, baseY, lipY, floorY, tunnels, signals, columns, posters, signs, props, grates, lamps: pools };
    const moteBoxes = lamps.map((l) => ({ x: l.x - S * 1.1, y: l.y - S * 0.3, w: S * 2.2, h: S * 1.8 }));
    return { P, W, H, S, spec, lamps, clock, railY: baseY + pitH * PIT.third, crowdY: lipY + S * 0.2, moteBoxes };
  }

  async layout(L: Layout, res: number) {
    const stamp = ++this.stamp;
    const p = this.makePlan(L);
    const { W, H, S } = p;
    const px = (v: number) => Math.max(8, Math.round(v * res));
    // cap the backdrop raster at a safe GPU texture size (and 1.5x in low quality); the sprite scales it back
    const bs = Math.min(this.low ? Math.min(res, 1.5) : res, 4096 / Math.max(1, W), 4096 / Math.max(1, H));
    const tex = (key: string, svg: string, w: number, h?: number) => svgTexture(`stn-${key}`, svg, px(w), h === undefined ? undefined : px(h));
    const lampW = Math.max(...p.lamps.map((l) => l.h), 8) * (PENDANT.w / PENDANT.h);
    // the bezel's radius is 120 of the face's 256 units
    const clockPx = p.clock ? (p.clock.r * CLOCK.size) / 120 : 8;
    const pigeonW = p.clock ? p.clock.r * 0.62 : 8;
    const crowdH = S * 3.0;
    const [bdT, lampT, faceT, hourT, minT, sitT, peckT, crowdA, crowdB, spark1, spark2, spark3, glintT] = await Promise.all([
      rasterOnce(stationBackdrop(p.spec), W * bs, H * bs),
      tex('lamp', pendantLamp(), lampW),
      tex('clock', clockFace(), clockPx),
      tex('hand-h', clockHand('hour'), (clockPx * HAND.w) / CLOCK.size),
      tex('hand-m', clockHand('minute'), (clockPx * HAND.w) / CLOCK.size),
      tex('pigeon-sit', pigeonPerch('sit'), pigeonW),
      tex('pigeon-peck', pigeonPerch('peck'), pigeonW),
      tex('crowd-a', commuterCrowd(3), (crowdH * 1000) / 420),
      tex('crowd-b', commuterCrowd(8), (crowdH * 0.86 * 1000) / 420),
      tex('spark1', sparkArc(1), S * 0.9),
      tex('spark2', sparkArc(2), S * 0.9),
      tex('spark3', sparkArc(5), S * 0.9),
      tex('glint', starGlint(), S * 0.3),
    ]);
    if (stamp !== this.stamp) {
      freeTexture(bdT);
      return;
    }
    this.plan = p;
    const sp = p.spec;

    const old = this.backdrop.texture;
    this.backdrop.texture = bdT;
    freeTexture(old);
    this.backdrop.width = W;
    this.backdrop.height = H;

    // warm light pooled behind the reels (the board is the lit subject)
    this.frameGlow.texture = softLightTexture();
    this.frameGlow.tint = hex(C.amber);
    this.frameGlow.position.set(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h * 0.55);
    this.frameGlow.width = L.frame.w * 1.6;
    this.frameGlow.height = L.frame.h * 1.5;

    // tunnels: headlight core, halo and spill (the passing train), and the Last Train's gold
    this.tunnelLayer.removeChildren().forEach((c) => c.destroy());
    this.tunnels = sp.tunnels.map((t) => {
      const k = t.w / TUNNEL.w;
      const th = TUNNEL.h * k;
      const vp = t.side < 0 ? TUNNEL.vpL : TUNNEL.vpR;
      const vx = t.x + vp.x * k;
      const vy = sp.lipY - th + vp.y * k;
      const mk = (tint: string) => {
        const s = new Sprite(softLightTexture());
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.tint = hex(tint);
        s.alpha = 0;
        s.visible = false;
        this.tunnelLayer.addChild(s);
        return s;
      };
      const tn: Tunnel = { vx, vy, w: t.w, side: t.side, gold: mk(C.gold), halo: mk(C.amberLight), spill: mk(C.amber), core: mk(C.cream) };
      tn.gold.position.set(vx, vy);
      tn.gold.width = t.w * 1.5;
      tn.gold.height = th * 1.3;
      return tn;
    });

    // the third rail's glow strip and its surge layer
    for (const r of [this.rail, this.railHot]) {
      r.texture = bandTexture();
      r.tint = hex(C.volt);
      r.width = W;
      r.height = S * 0.32;
      r.position.set(0, p.railY - S * 0.16);
    }
    this.railHot.tint = hex(C.voltLight);
    this.railHot.height = S * 0.16;
    this.railHot.y = p.railY - S * 0.08;

    // sparks along the third rail
    this.sparkTex = [spark1, spark2, spark3];
    this.sparkLayer.removeChildren().forEach((c) => c.destroy());
    this.sparks = [0, 1, 2].map(() => {
      const s = new Sprite(spark1);
      s.anchor.set(0.5);
      s.visible = false;
      const flash = new Sprite(softLightTexture());
      flash.anchor.set(0.5);
      flash.tint = hex(C.voltLight);
      flash.visible = false;
      this.sparkLayer.addChild(flash, s);
      return { s, flash, t: 0, dur: 0.2, on: false };
    });

    // signal aspects: three glow sprites per head
    this.signalLayer.removeChildren().forEach((c) => c.destroy());
    this.signals = sp.signals.map((g, i) => {
      const k = g.h / SIGNAL.h;
      const x0 = g.x - (SIGNAL.w * k) / 2;
      const glows = SIGNAL.lenses.map((ln) => {
        const s = new Sprite(softLightTexture());
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.tint = hex(SIGNAL_COLORS[ln.color]);
        s.position.set(x0 + ln.x * k, g.y + ln.y * k);
        s.width = s.height = SIGNAL.r * k * 4.2;
        s.alpha = 0;
        this.signalLayer.addChild(s);
        return s;
      });
      return { glows, tunnel: i, aspect: 0, blink: 0 };
    });

    // Rush Hour crowd: two rows of silhouettes on the platform, hidden until the mood fades them in
    for (const c of this.crowd) c.destroy();
    this.crowd = [crowdB, crowdA].map((t, i) => {
      const h = crowdH * (i ? 1 : 0.86);
      const ts = new TilingSprite({ texture: t, width: W, height: h });
      ts.tileScale.set(1 / res);
      ts.position.set(0, p.crowdY - h - S * (i ? 0 : 0.18));
      ts.tilePosition.x = i ? 0 : S * 1.3;
      ts.alpha = i ? 1 : 0.7;
      this.crowdLayer.addChild(ts);
      return ts;
    });
    this.crowdLayer.alpha = 0;
    this.crowdLayer.visible = false;

    // steam from the platform grate
    this.steamLayer.removeChildren().forEach((c) => c.destroy());
    this.steam = [];
    const gr = sp.grates[0];
    if (gr) {
      for (let i = 0; i < 5; i++) {
        const s = new Sprite(softLightTexture());
        s.anchor.set(0.5);
        s.tint = hex(C.paperWarm);
        this.steamLayer.addChild(s);
        this.steam.push({ s, t: i * 0.9, dur: 4.5, x: gr.x, y: gr.y, size: gr.w });
      }
    }

    // pendant lamps: rod from the vault, globe, core, glow and spill
    this.lampLayer.removeChildren().forEach((c) => c !== this.rods && c.destroy({ children: true }));
    this.lamps = [];
    const rods = this.rods.clear();
    p.lamps.forEach((lp, i) => {
      const k = lp.h / PENDANT.h;
      const fitTop = lp.y - PENDANT.gy * k;
      const rw = Math.max(1.5, S * 0.028);
      rods.moveTo(lp.x, lp.top).lineTo(lp.x, fitTop + 2).stroke({ width: rw + 2, color: hex(C.ink) });
      rods.moveTo(lp.x, lp.top).lineTo(lp.x, fitTop + 2).stroke({ width: rw, color: hex(C.goldDeep) });
      rods.moveTo(lp.x - rw * 0.25, lp.top).lineTo(lp.x - rw * 0.25, fitTop + 2).stroke({ width: Math.max(0.6, rw * 0.3), color: hex(C.goldLight), alpha: 0.6 });
      const root = new Container();
      root.position.set(lp.x, fitTop);
      const spill = new Sprite(softLightTexture());
      const glow = new Sprite(softLightTexture());
      const core = new Sprite(softLightTexture());
      for (const s of [spill, glow, core]) {
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.position.set(0, PENDANT.gy * k);
      }
      spill.width = spill.height = lp.h * 8;
      glow.width = glow.height = lp.h * 4.6;
      core.width = core.height = PENDANT.r * 2 * k * 1.25;
      const globe = new Sprite(lampT);
      globe.anchor.set(PENDANT.cx / PENDANT.w, 0);
      globe.width = PENDANT.w * k;
      globe.height = PENDANT.h * k;
      root.addChild(spill, glow, globe, core);
      this.lampLayer.addChild(root);
      this.lamps.push({ root, globe, core, glow, spill, seed: i * 2.3 + 0.7, h: lp.h });
    });

    // station clock + pigeons on top
    this.clockLayer.visible = !!p.clock;
    for (const pg of this.pigeons) pg.s.destroy();
    this.pigeons = [];
    this.pigeonTex = { sit: sitT, peck: peckT };
    if (p.clock) {
      const c = p.clock;
      this.clockFaceS.texture = faceT;
      this.clockFaceS.width = this.clockFaceS.height = clockPx;
      this.clockFaceS.position.set(c.x, c.y);
      const k = clockPx / CLOCK.size;
      for (const hnd of [this.hourHand, this.minuteHand]) {
        hnd.width = HAND.w * k;
        hnd.height = HAND.h * k;
        hnd.position.set(c.x, c.y);
      }
      this.hourHand.texture = hourT;
      this.minuteHand.texture = minT;
      const top = c.y - c.r; // the bezel's top
      [
        { dx: -0.32, flip: false },
        { dx: 0.3, flip: true },
      ].forEach((d, i) => {
        const s = new Sprite(sitT);
        s.anchor.set(0.5, 116 / 128);
        s.width = s.height = pigeonW;
        if (d.flip) s.scale.x *= -1;
        const x = c.x + c.r * d.dx;
        const y = top + c.r * 0.05 + Math.abs(d.dx) * c.r * 0.22;
        s.position.set(x, y);
        this.clockLayer.addChild(s);
        this.pigeons.push({ s, x, y, w: pigeonW, t: 0, next: 2 + i * 3.1, peck: false });
      });
    } else {
      this.clockFaceS.texture = this.hourHand.texture = this.minuteHand.texture = Texture.EMPTY;
    }

    // dust motes drifting in the lamplight
    this.moteLayer.removeChildren().forEach((c) => c.destroy());
    this.motes = [];
    const nPer = 7;
    p.moteBoxes.forEach((b, bi) => {
      for (let i = 0; i < nPer; i++) {
        const s = new Sprite(softLightTexture());
        s.anchor.set(0.5);
        s.blendMode = 'add';
        s.tint = hex(C.amberLight);
        const size = S * (0.03 + Math.random() * 0.04);
        this.moteLayer.addChild(s);
        this.motes.push({ s, box: bi, x: b.x + Math.random() * b.w, y: b.y + Math.random() * b.h, vx: (Math.random() - 0.5) * S * 0.05, vy: (Math.random() * 0.6 - 0.15) * S * 0.04, phase: Math.random() * 6, size });
      }
    });

    // soft contact shadows where the cast stands
    [
      { c: L.captain, w: 0.46 },
      { c: L.parrot, w: 0.55 },
    ].forEach(({ c, w }, i) => {
      const sh = this.shadows[i];
      sh.texture = shadowTexture();
      sh.width = c.h * w;
      sh.height = c.h * w * 0.14;
      sh.position.set(c.x, c.y + S * 0.02);
      sh.alpha = 0.55;
    });

    // bonus lighting overlays
    this.moodTint.width = W;
    this.moodTint.height = H;
    this.floorGlow.texture = riseTexture();
    this.floorGlow.width = W;
    this.floorGlow.height = H * 0.62;
    this.floorGlow.y = H - H * 0.62;
    void glintT;

    this.applyMood();
    this.applyLow();
    this.update(0);

    // drop rasters from earlier viewport sizes (everything above now points at this layout's)
    const keep = new Set<string>();
    for (const t of [lampT, faceT, hourT, minT, sitT, peckT, crowdA, crowdB, spark1, spark2, spark3, glintT]) if (t && t !== Texture.EMPTY && t.source?.label) keep.add(t.source.label);
    evict('stn-', keep);
  }

  /** Low quality on or off at runtime: no re-raster, only what animates and what draws changes. */
  setLow(low: boolean) {
    if (low === this.low) return;
    this.low = low;
    this.applyLow();
    this.update(0);
  }

  private applyLow() {
    const low = this.low;
    for (const l of this.lamps) l.spill.visible = !low;
    this.motes.forEach((m, i) => (m.s.visible = !low || i % 3 === 0));
    this.steam.forEach((s, i) => (s.s.visible = !low || i < 2));
  }

  /** Per-bonus lighting. null = the normal midnight station. */
  setBonusLight(kind: BonusKind | null) {
    if (kind) this.kind = kind;
    this.moodTarget = kind ? 1 : 0;
    // a mood starting brings a train sooner (Rush Hour's busy line, the Last Train arriving)
    if (kind && kind !== 'tantrum' && !this.train.on) this.train.next = Math.min(this.train.next, this.train.t + 1.5);
  }

  /** Bonus lighting: tint the scenery (colour, strength 0..1). */
  setMood(color: number, alpha: number) {
    this.moodTint.tint = color;
    this.moodTint.alpha = alpha;
  }

  private moodSpec() {
    return {
      witching: { tint: MOOD.rush, a: 0.28, glow: hex(C.amber), ga: 0.3, lamp: hex(C.amberLight), lampK: 1.3 },
      tantrum: { tint: MOOD.surge, a: 0.38, glow: hex(C.volt), ga: 0.34, lamp: hex(C.volt), lampK: 1.1 },
      limbo: { tint: MOOD.midnight, a: 0.78, glow: hex(C.gold), ga: 0.22, lamp: hex(C.amber), lampK: 0.5 },
    }[this.kind];
  }

  /** Push the current mood blend into every mood-driven sprite. */
  private applyMood() {
    const k = this.moodK;
    const spec = this.moodSpec();
    this.setMood(spec.tint, spec.a * k);
    this.floorGlow.tint = spec.glow;
    this.floorGlow.alpha = spec.ga * k;
    const warm = hex(C.amber);
    for (const l of this.lamps) {
      l.glow.tint = lerpColor(warm, spec.lamp, k);
      l.spill.tint = lerpColor(hex(C.amberDeep), spec.lamp, k * 0.7);
      l.core.tint = lerpColor(hex(C.amberLight), this.kind === 'tantrum' ? hex(C.voltCore) : spec.lamp, k);
    }
    this.frameGlow.tint = lerpColor(warm, spec.glow, k * 0.6);
    const rush = this.kind === 'witching' ? k : 0;
    this.crowdLayer.alpha = rush * 0.62;
    this.crowdLayer.visible = this.crowdLayer.alpha > 0.002;
    const last = this.kind === 'limbo' ? k : 0;
    for (const tn of this.tunnels) tn.gold.visible = last > 0.002;
    this.moodTint.renderable = this.moodTint.alpha > 0.002;
    this.floorGlow.renderable = this.floorGlow.alpha > 0.002;
  }

  update(dtMs: number) {
    const dt = Math.min(0.1, dtMs / 1000);
    this.t += dt;
    const t = this.t;
    const p = this.plan;
    if (!p) return;
    const S = p.S;
    const low = this.low;

    if (this.moodK !== this.moodTarget) {
      const d = this.moodTarget - this.moodK;
      this.moodK = Math.abs(d) < 0.004 ? this.moodTarget : this.moodK + d * (1 - Math.exp(-dt * 3.2));
      this.applyMood();
    }
    const k = this.moodK;
    const kind = this.kind;
    const rush = kind === 'witching' ? k : 0;
    const last = kind === 'limbo' ? k : 0;
    const surge = kind === 'tantrum' ? k : 0;
    const spec = this.moodSpec();

    // flicker: a held value that drops out now and then (rush hour), or stutters (surge)
    const fl = this.flick;
    fl.t -= dt;
    if (fl.t <= 0) {
      const busy = surge > 0.05 ? 1 : rush > 0.05 ? 0.25 : 0.03;
      if (Math.random() < busy) {
        fl.v = surge > 0.05 ? 0.25 + Math.random() * 0.6 : 0.55 + Math.random() * 0.3;
        fl.t = 0.04 + Math.random() * 0.08;
      } else {
        fl.v = 1;
        fl.t = 0.12 + Math.random() * 0.5;
      }
    }
    const flicker = fl.v;

    // lamps breathe, sway a hair, and flicker with the mood
    const lampK = 1 + (spec.lampK - 1) * k;
    for (const l of this.lamps) {
      const n = Math.sin(t * 1.7 + l.seed) * 0.5 + Math.sin(t * 2.9 + l.seed * 2) * 0.3;
      const f = flicker * lampK;
      l.glow.alpha = (0.5 + n * 0.04) * f;
      l.spill.alpha = (0.075 + n * 0.008) * f;
      l.core.alpha = (0.55 + n * 0.05) * Math.min(1.2, f);
      // the surge drains the amber out of the glass: a cool grey globe lit blue-white by the core
      l.globe.tint = lerpColor(0xffffff, MOOD.drained, surge * (flicker < 0.9 ? 1 : 0.6));
      if (surge > 0.05) l.core.alpha = (0.75 + n * 0.05) * f;
      l.root.rotation = Math.sin(t * 0.9 + l.seed) * 0.012;
    }
    this.frameGlow.alpha = (0.17 + Math.sin(t * 1.3) * 0.012) * (0.7 + 0.3 * flicker);

    // third rail: a low hum with a slow pulse, surging white-blue in the tantrum
    const hum = 0.2 + Math.sin(t * 2.3) * 0.03 + Math.sin(t * 7.1) * 0.015;
    this.rail.alpha = hum * (1 - last * 0.4) + surge * 0.25 * flicker;
    this.railHot.alpha = surge * (0.3 + 0.4 * (1 - flicker));
    this.railHot.renderable = this.railHot.alpha > 0.002;

    // sparks crackle along the rail
    this.sparkNext -= dt;
    if (this.sparkNext <= 0) {
      const sp = this.sparks.find((s) => !s.on);
      if (sp) {
        sp.on = true;
        sp.t = 0;
        sp.dur = 0.16 + Math.random() * 0.14;
        const x = S * 0.5 + Math.random() * (p.W - S);
        sp.s.position.set(x, p.railY - S * 0.03);
        sp.flash.position.set(x, p.railY);
        sp.s.visible = sp.flash.visible = true;
        sp.s.rotation = (Math.random() - 0.5) * 0.5;
      }
      const base = surge > 0.05 ? 0.25 + Math.random() * 0.5 : 2.5 + Math.random() * 4.5;
      this.sparkNext = base * (low ? 2 : 1);
    }
    for (const sp of this.sparks) {
      if (!sp.on) continue;
      sp.t += dt;
      const q = sp.t / sp.dur;
      if (q >= 1) {
        sp.on = false;
        sp.s.visible = sp.flash.visible = false;
        continue;
      }
      // the bolt re-strikes a couple of times: swap shapes and flip
      const step = Math.floor(q * 3);
      sp.s.texture = this.sparkTex[(step + Math.floor(sp.t * 97)) % this.sparkTex.length];
      sp.s.scale.y = (step % 2 ? -1 : 1) * Math.abs(sp.s.scale.y || 1);
      sp.s.width = S * (0.55 + 0.35 * Math.sin(Math.PI * q));
      sp.s.height = sp.s.width * 0.5 * (step % 2 ? -1 : 1);
      sp.s.alpha = (1 - q * 0.6) * (step === 1 ? 0.7 : 1);
      sp.flash.width = sp.flash.height = S * (0.6 + 0.4 * (1 - q));
      sp.flash.alpha = 0.55 * (1 - q);
    }

    // the passing train: the headlight swells deep in a tunnel, sweeps past and fades
    const tr = this.train;
    tr.t += dt;
    if (!tr.on && tr.t >= tr.next && this.tunnels.length) {
      tr.on = true;
      tr.t = 0;
      tr.i = Math.random() < 0.5 ? 0 : this.tunnels.length - 1;
      tr.dur = 4 + Math.random() * 1.2;
    }
    for (const tn of this.tunnels) tn.core.visible = tn.halo.visible = tn.spill.visible = false;
    let approach = -1;
    if (tr.on) {
      const q = tr.t / tr.dur;
      if (q >= 1) {
        tr.on = false;
        tr.t = 0;
        tr.next = rush > 0.5 ? 6 + Math.random() * 6 : last > 0.5 ? 12 + Math.random() * 8 : 20 + Math.random() * 20;
      } else {
        const tn = this.tunnels[tr.i];
        approach = tr.i;
        // 0..0.55 grows toward us, 0.55..0.75 sweeps sideways past the mouth, then fades
        const grow = smooth(clamp(q / 0.55, 0, 1));
        const pass = smooth(clamp((q - 0.5) / 0.3, 0, 1));
        const fade = 1 - smooth(clamp((q - 0.7) / 0.3, 0, 1));
        const a = grow * fade;
        const sx = tn.vx - tn.side * tn.w * 0.5 * pass;
        tn.core.visible = tn.halo.visible = tn.spill.visible = true;
        tn.core.position.set(sx, tn.vy);
        tn.core.width = tn.core.height = tn.w * (0.08 + 0.22 * grow);
        tn.core.alpha = 0.9 * a;
        tn.halo.position.set(sx, tn.vy);
        tn.halo.width = tn.w * (0.4 + 1.1 * grow);
        tn.halo.height = tn.w * (0.3 + 0.8 * grow);
        tn.halo.alpha = 0.42 * a;
        // light sweeping over the pit and floor in front of the mouth
        tn.spill.position.set(sx + tn.side * tn.w * 0.3 * (1 - pass), p.spec.lipY - S * 0.05);
        tn.spill.width = tn.w * (0.9 + 1.4 * grow);
        tn.spill.height = S * 0.9;
        tn.spill.alpha = 0.3 * a;
      }
    }
    // Last Train: gold breathes out of both mouths
    for (const tn of this.tunnels) if (tn.gold.visible) tn.gold.alpha = last * (0.6 + Math.sin(t * 1.4) * 0.1);

    // signals: red at rest; amber, then green, for a train coming out of its tunnel; green for Rush Hour
    for (const sg of this.signals) {
      let aspect = 0;
      if (rush > 0.5 || last > 0.5) aspect = 2;
      if (approach === sg.tunnel) {
        const q = tr.t / tr.dur;
        aspect = q < 0.18 ? 1 : 2;
      }
      if (aspect !== sg.aspect) {
        sg.aspect = aspect;
        sg.blink = 0;
      }
      sg.blink += dt;
      const shimmer = 0.92 + Math.sin(t * 5 + sg.tunnel) * 0.04;
      sg.glows.forEach((g, i) => {
        let a = i === aspect ? 0.85 * shimmer : 0;
        // amber blinks
        if (i === 1 && aspect === 1) a *= Math.sin(sg.blink * 12) > -0.2 ? 1 : 0.15;
        // the surge stutters every lens
        if (surge > 0.05) a = (i === Math.floor(t * 9 + sg.tunnel) % 3 ? 0.9 : 0.1) * flicker;
        g.alpha = a;
        g.renderable = a > 0.002;
      });
    }

    // the crowd shuffles
    if (this.crowdLayer.visible && !low) {
      this.crowd.forEach((c, i) => {
        c.tilePosition.x = (i ? S * 0 : S * 1.3) + Math.sin(t * (0.35 + i * 0.12) + i) * S * 0.12;
        c.tilePosition.y = Math.abs(Math.sin(t * (1.9 + i * 0.4))) * S * -0.02;
      });
    }

    // steam rising from the grate
    for (const st of this.steam) {
      if (!st.s.visible) continue;
      st.t += dt;
      const q = (st.t % st.dur) / st.dur;
      st.s.position.set(st.x + Math.sin(q * 5 + st.dur) * st.size * 0.15, st.y - q * S * 1.4);
      st.s.width = st.size * (0.5 + q * 1.1);
      st.s.height = st.s.width * 0.8;
      st.s.alpha = Math.sin(Math.PI * q) * 0.13 * (1 + rush * 0.3);
    }

    // the clock: the minute hand jumps every 8 s with a little overshoot, the hour hand follows
    if (this.clockLayer.visible) {
      this.clockNext -= dt;
      if (this.clockNext <= 0) {
        this.clockNext = 8;
        this.clockMin += 1;
      }
      const dd = this.clockMin - this.clockShown;
      this.clockVel += (dd * 260 - this.clockVel * 18) * dt;
      this.clockShown += this.clockVel * dt;
      const m = this.clockShown;
      this.minuteHand.rotation = (m / 60) * Math.PI * 2;
      this.hourHand.rotation = ((11 + m / 60) / 12) * Math.PI * 2;
      // pigeons peck and hop now and then
      for (const pg of this.pigeons) {
        pg.t += dt;
        if (pg.t > pg.next) {
          pg.t = 0;
          pg.peck = !pg.peck;
          pg.next = pg.peck ? 0.35 + Math.random() * 0.3 : 2.5 + Math.random() * 5;
          if (this.pigeonTex) pg.s.texture = pg.peck ? this.pigeonTex.peck : this.pigeonTex.sit;
        }
        pg.s.y = pg.y - (pg.peck ? 0 : Math.max(0, Math.sin(pg.t * 9)) * (pg.t < 0.35 ? pg.w * 0.06 : 0));
      }
    }

    // dust motes drift and twinkle in the lamplight
    for (const m of this.motes) {
      if (!m.s.visible) continue;
      const b = p.moteBoxes[m.box];
      m.x += (m.vx + Math.sin(t * 0.6 + m.phase) * S * 0.02) * dt;
      m.y += m.vy * dt;
      if (m.x < b.x) m.x += b.w;
      if (m.x > b.x + b.w) m.x -= b.w;
      if (m.y < b.y) m.y += b.h;
      if (m.y > b.y + b.h) m.y -= b.h;
      m.s.position.set(m.x, m.y);
      // fade toward the box edges so wrapping never pops
      const ex = Math.min(m.x - b.x, b.x + b.w - m.x) / (b.w * 0.25);
      const ey = Math.min(m.y - b.y, b.y + b.h - m.y) / (b.h * 0.25);
      const edge = clamp(Math.min(ex, ey), 0, 1);
      m.s.alpha = edge * (0.25 + 0.25 * Math.sin(t * 1.3 + m.phase)) * flicker * (1 - last * 0.5);
      m.s.width = m.s.height = m.size * 3;
    }

    if (this.floorGlow.renderable) this.floorGlow.alpha = spec.ga * k * (surge > 0 ? 0.6 + 0.4 * flicker : 1 + Math.sin(t * 1.3) * 0.05);
  }
}

/** Mood tints derived from the palette (pale mixes toward white for multiply blending). */
const MOOD = {
  drained: hex(mix(C.voltLight, C.g1, 0.5)),
  rush: hex(mix(C.amber, C.white, 0.45)),
  surge: hex(mix(C.volt, C.white, 0.45)),
  midnight: hex(mix(C.voltNight, C.white, 0.32)),
};
