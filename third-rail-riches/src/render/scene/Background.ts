import { Container, Graphics, Mesh, MeshGeometry, Sprite, Texture, TilingSprite } from 'pixi.js';
import { svgTexture, canvasTexture, freeTexture, evict } from '../textures';
import {
  skyBackdrop,
  moonDisc,
  cloudWisp,
  sparkle,
  headland,
  HEADLAND_LIGHT,
  lighthouse,
  LIGHTHOUSE_LAMP,
  lighthouseBeam,
  distantShip,
  seaRow,
  glint,
  fogTile,
  bulwarkTile,
  deckTile,
  mastTile,
  mastFoot,
  poleTile,
  poleCap,
  lanternBracket,
  lantern,
  LANTERN_WICK,
  sailCorner,
  jollyRoger,
  barrel,
  cannon,
  cannonballs,
  ropeCoil,
  treasurePile,
  mix,
  rng,
  type Box,
} from '../../art/scene';
import { flame } from '../../art/characters';
import { C } from '../../art/kit';
import { quality } from '../quality';
import type { Layout } from '../layout';

type BonusKind = 'tantrum' | 'witching' | 'limbo';
type PropKind = 'barrel' | 'cannon' | 'balls' | 'rope' | 'treasure';

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

/** Night sea under the wave rows: bright at the horizon, deep toward the ship. Created once. */
let seaGrad: Texture | null = null;
function seaGradTexture(): Texture {
  return (seaGrad ??= canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, mix(C.skyLow, C.seaFoam, 0.25));
    g.addColorStop(0.05, mix(C.skyLow, C.seaDeep, 0.5));
    g.addColorStop(0.45, mix(C.seaDeep, C.night, 0.55));
    g.addColorStop(1, C.nightDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
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

/** Shooting-star streak: a fading tail with a bright head at the right end (white). Created once. */
let streakTex: Texture | null = null;
function streakTexture(): Texture {
  return (streakTex ??= canvasTexture(256, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.8, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(247, 4);
    ctx.arc(247, 8, 4, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    const h = ctx.createRadialGradient(248, 8, 0, 248, 8, 8);
    h.addColorStop(0, 'rgba(255,255,255,1)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = h;
    ctx.fillRect(232, 0, 24, 16);
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
  spill: Sprite;
  glow: Sprite;
  back: Sprite;
  fire: Sprite;
  ghost: Sprite;
  front: Sprite;
  seed: number;
  swing: number;
  flameW: number;
}

interface Plan {
  P: boolean;
  W: number;
  H: number;
  S: number;
  sideW: number;
  floorY: number;
  bulTop: number;
  horizon: number;
  moon: { x: number; y: number; r: number };
  calm: Box[];
  mast: { x: number; w: number } | null;
  pole: { x: number; top: number; w: number } | null;
  flag: { x: number; y: number; w: number; dir: 1 | -1 };
  headL: { k: number } | null;
  headR: { k: number } | null;
  light: { x: number; y: number; h: number } | null;
  ship: { x: number; w: number } | null;
  sail: { w: number; h: number } | null;
  rig: { top: number; x: number[]; ratFrom: number } | null;
  lamps: { x: number; y: number; h: number; hang: boolean; bracket?: { x: number; y: number; w: number; flip: boolean } }[];
  props: { kind: PropKind; x: number; w: number; flip?: boolean }[];
  clouds: { x: number; y: number; w: number }[];
}

/**
 * Powder Keg Cove: the deck of a pirate ship moored in a moonlit cove.
 *
 * Back to front: a baked night sky (stars, cloud banks) with a few twinkling stars, the moon and
 * its halo with a wisp of cloud drifting across it, the cove's headlands with a lighthouse whose
 * beam sweeps, a distant galleon, a stage-cutout sea of sliding wave rows with a shimmering moon
 * path, then the ship: mast and tarred rigging, a sail corner, the Jolly Roger waving on its
 * staff, the bulwark and deck, props, and ship lanterns with flickering flames and warm glow.
 * Bonus moods crossfade the moon, flames and fog (Moonlight Raid = ghost green).
 *
 * Big static layers are rasterised once per layout; per frame only sprite transforms, alphas,
 * tints, TilingSprite offsets and the flag's small vertex grid change. Layers that fade to zero
 * stop rendering (Pixi 8 still draws a batched sprite at alpha 0).
 *
 * Low quality (setLow): half the moon glints and a handful of twinkles, the back wave rows hold
 * still and the rest roll slower without bobbing, the cloud wisp parks over the moon, the
 * lighthouse keeps its lamp but loses the sweeping beam, the flag waves on a coarser grid, and the
 * lantern spill light is dropped. Soft distant layers are rasterised at 3/4 size.
 */
export class Background extends Container {
  private sky = new Sprite();
  private twinkleLayer = new Container();
  private twinkles: { s: Sprite; phase: number; speed: number; base: number; size: number }[] = [];
  private halo = new Sprite();
  private moon = new Sprite();
  private moonGhost = new Sprite();
  private wisp = new Sprite();
  private cove = new Container();
  private headL = new Sprite();
  private headR = new Sprite();
  private light = new Sprite();
  private ship = new Sprite();
  private beam = new Sprite();
  private flash = new Sprite();
  private sea = new Container();
  private seaBase = new Sprite();
  private rows: { t: TilingSprite; speed: number; sway: number; phase: number; y0: number; bob: number; off: number }[] = [];
  private glintLayer = new Container();
  private glints: { s: Sprite; w: number; x0: number; phase: number; speed: number; a: number }[] = [];
  private moonPath = new Sprite();
  private fog: TilingSprite[] = [];
  private shipLayer = new Container();
  private sail = new Sprite();
  private sailBase = { x: 1, y: 1 };
  private shadows = [new Sprite(), new Sprite()];
  private star = new Sprite();
  private starRun = { t: 0, next: 6, dur: 0.8, x: 0, y: 0, dx: 0, dy: 0, len: 0, on: false };
  private starZones: Box[] = [];
  private rigG = new Graphics();
  private pole = new TilingSprite({ texture: Texture.EMPTY });
  private poleCapS = new Sprite();
  private flagMesh: Mesh | null = null;
  private flagGeo: MeshGeometry | null = null;
  private flagBase: Float32Array | null = null;
  private flagDims = { w: 1, h: 1, dir: 1 };
  private bulwark = new TilingSprite({ texture: Texture.EMPTY });
  private mast = new TilingSprite({ texture: Texture.EMPTY });
  private mastFootS = new Sprite();
  private deck = new TilingSprite({ texture: Texture.EMPTY });
  private propLayer = new Container();
  private glint = new Sprite();
  private glintSpot = { x: 0, y: 0, w: 0, next: 2, t: 0 };
  private frameGlow = new Sprite();
  private lampLayer = new Container();
  private lamps: Lamp[] = [];
  private moodTint = new Sprite(Texture.WHITE);
  private floorGlow = new Sprite();
  private plan: Plan | null = null;
  private stamp = 0;
  private t = 0;
  /** Bonus light blend 0..1 and its target; `kind` is kept through the fade-out. */
  private moodK = 0;
  private moodTarget = 0;
  private kind: BonusKind = 'witching';
  /** Low quality: lighter animation (see setLow); `lowK` eases 0..1 so a switch never jumps. */
  private low = false;
  private lowK = 0;
  private flagPhase = 0;
  private flagArgs: { tex: Texture; x: number; y: number; w: number; h: number; dir: 1 | -1 } | null = null;
  private flagN = { nx: 12, ny: 4 };

  constructor() {
    super();
    this.eventMode = 'none';
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.moon.anchor.set(0.5);
    this.moonGhost.anchor.set(0.5);
    this.moonGhost.alpha = 0;
    this.wisp.anchor.set(0.5);
    this.beam.anchor.set(0, 0.5);
    this.beam.blendMode = 'add';
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.glintLayer.blendMode = 'add';
    this.frameGlow.anchor.set(0.5);
    this.frameGlow.blendMode = 'add';
    this.glint.anchor.set(0.5);
    this.glint.blendMode = 'add';
    this.glint.alpha = 0;
    this.moodTint.alpha = 0;
    this.moodTint.blendMode = 'multiply';
    this.floorGlow.alpha = 0;
    this.floorGlow.blendMode = 'add';
    this.cove.addChild(this.headL, this.headR, this.ship, this.beam, this.light, this.flash);
    this.sea.addChild(this.seaBase);
    for (const sh of this.shadows) sh.anchor.set(0.5);
    this.star.anchor.set(1, 0.5);
    this.star.blendMode = 'add';
    this.star.visible = false;
    this.shipLayer.addChild(this.rigG, this.sail, this.pole, this.poleCapS, this.bulwark, this.mast, this.mastFootS, this.deck, ...this.shadows, this.frameGlow, this.propLayer, this.glint, this.lampLayer);
    this.addChild(this.sky, this.twinkleLayer, this.star, this.halo, this.moon, this.moonGhost, this.wisp, this.cove, this.sea, this.glintLayer, this.shipLayer, this.moodTint, this.floorGlow);
  }

  /** Where everything goes for this viewport. */
  private makePlan(L: Layout): Plan {
    const { W, H, S, frame, logo, winBar, meter, floorY } = L;
    const P = L.portrait;
    const sideW = (W - frame.w) / 2;
    const frameBottom = frame.y + frame.h;
    const calm: Box[] = [logo, winBar, meter, { x: frame.x - S * 0.2, y: frame.y - S * 0.45, w: frame.w + S * 0.4, h: frame.h + S * 0.5 }];
    if (P) {
      const band = floorY - frameBottom;
      const bulH = Math.max(S * 0.75, band * 0.34);
      const bulTop = floorY - bulH;
      const horizon = frameBottom + band * 0.3;
      const moon = { x: W - S * 0.98, y: S * 0.98, r: S * 0.5 };
      const mast = { x: S * 0.3, w: S * 0.34 };
      const flagW = Math.min(S * 1.5, logo.x - mast.x - S * 0.35);
      const lightH = Math.min(S * 0.78, horizon - frameBottom - S * 0.02);
      return {
        P,
        W,
        H,
        S,
        sideW,
        floorY,
        bulTop,
        horizon,
        moon,
        calm,
        mast,
        pole: null,
        flag: { x: mast.x + mast.w * 0.3, y: S * 0.42, w: flagW, dir: 1 },
        headL: { k: (S * 0.85) / 360 },
        headR: { k: (S * 0.85) / 360 },
        light: lightH > S * 0.4 ? { x: W * 0.53, y: horizon + S * 0.02, h: lightH } : null,
        ship: { x: W * 0.36, w: S * 0.62 },
        sail: null,
        rig: null,
        lamps: [
          { x: W * 0.355, y: bulTop + S * 0.06, h: S * 0.55, hang: false },
          { x: W * 0.665, y: bulTop + S * 0.06, h: S * 0.55, hang: false },
        ],
        props: [
          { kind: 'cannon', x: W * 0.5, w: S * 1.05 },
          { kind: 'balls', x: W * 0.5 + S * 0.72, w: S * 0.42 },
        ],
        clouds: [
          { x: -S * 0.2, y: S * 1.9, w: S * 2.2 },
          { x: W - S * 2.1, y: S * 1.85, w: S * 2.3 },
        ],
      };
    }
    const bulH = Math.min(S * 1.75, H * 0.24);
    const bulTop = floorY - bulH;
    const horizon = bulTop - S * 1.6;
    const right = frame.x + frame.w;
    const r = Math.min(S * 0.55, sideW * 0.26);
    // compact landscape: the win bar holds the top of the right zone, so the moon (and the flag
    // staff's top) sit under it and the lighthouse, which would crowd the flag, stays dark
    const skyTop = L.compact ? winBar.y + winBar.h + S * 0.12 : 0;
    const moon = L.compact ? { x: right + sideW * 0.34, y: skyTop + r * 1.45, r } : { x: right + sideW * 0.42, y: Math.max(r * 1.3, S * 1.05), r };
    const pole = { x: W - Math.max(S * 0.24, 8), top: Math.max(skyTop + S * 0.28, moon.y - r * 0.95), w: Math.max(3, S * 0.085) };
    const flagW = Math.min(S * 1.3, sideW * 0.46);
    const roomy = sideW > S * 2.2;
    const kR = (S * 1.5) / 360;
    const mast = { x: S * 0.3, w: S * 0.46 };
    const logoBottom = logo.y + logo.h;
    const charTop = L.captain.y - L.captain.h;
    return {
      P,
      W,
      H,
      S,
      sideW,
      floorY,
      bulTop,
      horizon,
      moon,
      calm,
      mast,
      pole,
      flag: { x: pole.x - pole.w * 0.4, y: pole.top + S * 0.1, w: flagW, dir: -1 },
      headL: { k: (S * 1.55) / 360 },
      headR: { k: kR },
      light: roomy && !L.compact ? { x: W - (800 - HEADLAND_LIGHT.x) * kR, y: horizon - (360 - HEADLAND_LIGHT.y) * kR, h: S * 1.25 } : null,
      ship: roomy ? { x: right + sideW * 0.33, w: S * 0.9 } : null,
      sail: { w: (logo.x + logo.w) * 1.36, h: (logo.y + logo.h) * 1.56 },
      rig: sideW > S * 1.3 ? { top: -S * 2, x: [S * 1.05, S * 1.6, S * 2.15].map((x) => Math.min(x, sideW - S * 0.3)), ratFrom: logoBottom + S * 0.3 } : null,
      lamps: [hangFrom({ x: mast.x + mast.w / 2 - S * 0.02, y: clamp(logoBottom + S * 0.2, logoBottom, charTop - S * 0.9), w: S * 0.8, flip: false }, S * 0.62), { x: right + S * 0.36, y: bulTop + S * 0.08, h: S * 0.55, hang: false }],
      props: [
        { kind: 'barrel', x: S * 0.5, w: S * 0.85 },
        { kind: 'balls', x: frame.x - S * 0.36, w: S * 0.5 },
        { kind: 'rope', x: right + S * 0.45, w: S * 0.78 },
        { kind: 'treasure', x: W - S * 0.62, w: S * 0.95 },
      ],
      clouds: [
        { x: sideW * 0.02, y: horizon - S * 0.3, w: sideW * 0.8 },
        { x: W - sideW * 0.9, y: horizon - S * 0.12, w: sideW * 0.62 },
        { x: sideW * 0.12, y: logoBottom + Math.max(S * 0.5, (charTop - logoBottom) * 0.42), w: sideW * 0.55 },
      ],
    };
  }

  async layout(L: Layout, res: number) {
    const stamp = ++this.stamp;
    const p = this.makePlan(L);
    const { W, S } = p;
    const u = S / 100;
    const px = (v: number) => Math.max(8, Math.round(v * res));
    const skyH = Math.ceil(p.horizon + 6);
    // cap the sky raster at a safe GPU texture width; the sprite scales it back up
    const skyScale = Math.min(res, 4096 / Math.max(1, W));
    const flagH = p.flag.w * (210 / 320);
    const moonBox = p.moon.r * 2 * (256 / 224);
    const headW = (k: number) => 800 * k;
    const lampH = Math.max(...p.lamps.map((l) => l.h), 8);
    const lampW = lampH * (128 / 224);
    const flameW = lampW * LANTERN_WICK.flameW * 1.12;
    const bulH = p.floorY - p.bulTop;
    const deckH = Math.max(S * 0.6, p.H - p.floorY);
    const seaH = p.bulTop - p.horizon;
    const rowHs = [0.14, 0.19, 0.25, 0.33, 0.44].map((k) => Math.max(4, seaH * k));
    const tex = (key: string, svg: string, w: number, h?: number) => svgTexture(`cove-${key}`, svg, px(w), h === undefined ? undefined : px(h));
    // soft, distant layers (headlands, ship, beam, fog, sea rows) at 3/4 size in low quality: they are
    // blurred or tiny on screen, so the smaller raster can't be seen
    const soft = quality.low ? 0.75 : 1;
    const softTex = (key: string, svg: string, w: number) => svgTexture(`cove-${key}`, svg, Math.max(8, Math.round(w * res * soft)));

    const [
      skyT,
      moonT,
      ghostT,
      wispT,
      sparkT,
      headLT,
      headRT,
      lightT,
      beamT,
      shipT,
      glintT,
      fogT,
      bulT,
      deckT,
      mastT,
      footT,
      poleT,
      capT,
      bracketT,
      backT,
      frontT,
      fireT,
      greenT,
      spiritT,
      sailT,
      flagT,
      rowTs,
      propTs,
    ] = await Promise.all([
      rasterOnce(
        skyBackdrop({ w: W, h: skyH, horizon: p.horizon, moon: p.moon, calm: p.calm, u, clouds: p.clouds, seed: 17 }),
        W * skyScale,
        skyH * skyScale,
      ),
      tex('moon', moonDisc(false), moonBox),
      tex('moon-ghost', moonDisc(true), moonBox),
      tex('wisp', cloudWisp(), p.moon.r * 3.4),
      tex('spark', sparkle(), S * 0.34),
      p.headL ? softTex('head-l', headland('left'), headW(p.headL.k)) : Promise.resolve(Texture.EMPTY),
      p.headR ? softTex('head-r', headland('right'), headW(p.headR.k)) : Promise.resolve(Texture.EMPTY),
      p.light ? tex('light', lighthouse(), p.light.h * (128 / 320)) : Promise.resolve(Texture.EMPTY),
      softTex('beam', lighthouseBeam(), S * 3),
      p.ship ? softTex('ship', distantShip(), p.ship.w) : Promise.resolve(Texture.EMPTY),
      tex('glint', glint(), p.moon.r * 2),
      softTex('fog', fogTile(), S * 5.2),
      tex('bulwark', bulwarkTile(4), bulH * 4),
      tex('deck', deckTile(), deckH * 4),
      p.mast ? tex('mast', mastTile(), p.mast.w * (128 / 84)) : Promise.resolve(Texture.EMPTY),
      p.mast ? tex('mast-foot', mastFoot(), p.mast.w * (256 / 84)) : Promise.resolve(Texture.EMPTY),
      p.pole ? tex('pole', poleTile(), p.pole.w * 2) : Promise.resolve(Texture.EMPTY),
      p.pole ? tex('pole-cap', poleCap(), p.pole.w * 2.6) : Promise.resolve(Texture.EMPTY),
      tex('bracket', lanternBracket(), S * 0.8),
      tex('lamp-back', lantern('back'), lampW),
      tex('lamp-front', lantern('front'), lampW),
      tex('flame-fire', flame('fire'), flameW),
      tex('flame-green', flame('green'), flameW),
      tex('flame-spirit', flame('spirit'), flameW),
      p.sail ? tex('sail', sailCorner(), p.sail.w) : Promise.resolve(Texture.EMPTY),
      tex('flag', jollyRoger(), p.flag.w),
      Promise.all(rowHs.map((h, i) => softTex(`sea${i}`, seaRow(i / (rowHs.length - 1), i), h * 4))),
      Promise.all(p.props.map((pr) => tex(`prop-${pr.kind}`, PROP_ART[pr.kind](), pr.w))),
    ]);
    if (stamp !== this.stamp) {
      freeTexture(skyT);
      return;
    }
    this.plan = p;

    // sky: swap in the new raster and free the old one in the same tick
    const oldSky = this.sky.texture;
    this.sky.texture = skyT;
    freeTexture(oldSky);
    this.sky.width = W;
    this.sky.height = skyH;

    // twinkling stars (a handful; the rest are baked into the sky)
    this.twinkleLayer.removeChildren().forEach((c) => c.destroy());
    this.twinkles = [];
    const R = rng(29);
    const inCalm = (x: number, y: number) => p.calm.some((b) => x > b.x - S * 0.2 && x < b.x + b.w + S * 0.2 && y > b.y - S * 0.2 && y < b.y + b.h + S * 0.2);
    for (let i = 0, tries = 0; i < (p.P ? 7 : 12) && tries < 200; tries++) {
      const x = R() * W;
      const y = R() * p.horizon * 0.8;
      if (inCalm(x, y) || Math.hypot(x - p.moon.x, y - p.moon.y) < p.moon.r * 2.4) continue;
      const s = new Sprite(sparkT);
      s.anchor.set(0.5);
      s.position.set(x, y);
      s.tint = R() < 0.3 ? hex(C.goldLight) : hex(C.moon);
      const size = S * (0.12 + R() * 0.16);
      this.twinkleLayer.addChild(s);
      this.twinkles.push({ s, phase: R() * 10, speed: 0.6 + R() * 1.4, base: 0.55 + R() * 0.45, size });
      i++;
    }

    // moon, ghost moon, halo, drifting wisp
    for (const m of [this.moon, this.moonGhost]) {
      m.position.set(p.moon.x, p.moon.y);
      m.width = m.height = moonBox;
    }
    this.moon.texture = moonT;
    this.moonGhost.texture = ghostT;
    this.halo.texture = softLightTexture();
    this.halo.position.set(p.moon.x, p.moon.y);
    this.halo.width = this.halo.height = p.moon.r * 7;
    this.wisp.texture = wispT;
    this.wisp.width = p.moon.r * 3.4;
    this.wisp.height = this.wisp.width * (140 / 512);

    // cove
    this.headL.visible = !!p.headL;
    if (p.headL) {
      this.headL.texture = headLT;
      this.headL.anchor.set(0, 1);
      this.headL.width = headW(p.headL.k);
      this.headL.height = 360 * p.headL.k;
      this.headL.position.set(0, p.horizon + 1);
    }
    this.headR.visible = !!p.headR;
    if (p.headR) {
      this.headR.texture = headRT;
      this.headR.anchor.set(1, 1);
      this.headR.width = headW(p.headR.k);
      this.headR.height = 360 * p.headR.k;
      this.headR.position.set(W, p.horizon + 1);
    }
    this.light.visible = this.beam.visible = this.flash.visible = !!p.light;
    // hidden pieces drop their raster too, so nothing ever points at a texture evicted below
    this.beam.texture = beamT;
    if (!p.light) this.light.texture = Texture.EMPTY;
    if (!p.ship) this.ship.texture = Texture.EMPTY;
    if (!p.sail) this.sail.texture = Texture.EMPTY;
    if (!p.pole) this.pole.texture = this.poleCapS.texture = Texture.EMPTY;
    if (!p.headL) this.headL.texture = Texture.EMPTY;
    if (!p.headR) this.headR.texture = Texture.EMPTY;
    if (!p.mast) this.mast.texture = this.mastFootS.texture = Texture.EMPTY;
    if (p.light) {
      this.light.texture = lightT;
      this.light.anchor.set(0.5, 1);
      this.light.height = p.light.h;
      this.light.width = p.light.h * (128 / 320);
      this.light.position.set(p.light.x, p.light.y);
      const lx = p.light.x;
      const ly = p.light.y - p.light.h * (1 - LIGHTHOUSE_LAMP.y);
      this.beam.position.set(lx, ly);
      this.beam.height = p.light.h * 0.42;
      this.flash.texture = softLightTexture();
      this.flash.tint = hex(C.goldLight);
      this.flash.position.set(lx, ly);
      this.flash.width = this.flash.height = p.light.h * 0.9;
    }
    this.ship.visible = !!p.ship;
    if (p.ship) {
      this.ship.texture = shipT;
      this.ship.anchor.set(0.5, 114 / 150);
      this.ship.width = p.ship.w;
      this.ship.height = p.ship.w * (150 / 256);
      this.ship.position.set(p.ship.x, p.horizon + seaH * 0.05);
    }

    // sea: base gradient + wave rows + moon path
    this.seaBase.texture = seaGradTexture();
    this.seaBase.position.set(0, p.horizon);
    this.seaBase.width = W;
    this.seaBase.height = seaH + S * 0.2;
    for (const r of this.rows) r.t.destroy();
    this.rows = [];
    const rowTops = [0.0, 0.08, 0.21, 0.38, 0.6];
    rowHs.forEach((h, i) => {
      const t = new TilingSprite({ texture: rowTs[i], width: W, height: h });
      t.tileScale.set(1 / (res * soft));
      const y0 = p.horizon + seaH * rowTops[i] - h * 0.06;
      t.position.set(0, y0);
      this.sea.addChild(t);
      this.rows.push({ t, speed: (i % 2 ? -1 : 1) * (3 + i * 5) * u, sway: (2 + i * 3) * u, phase: i * 1.7, y0, bob: 0.3 + i * 0.35, off: this.t * (i % 2 ? -1 : 1) * (3 + i * 5) * u });
    });
    this.glintLayer.removeChildren().forEach((c) => c !== this.moonPath && c.destroy());
    this.glints = [];
    // soft column of moonlight on the water under the moon
    this.moonPath.texture = softLightTexture();
    this.moonPath.anchor.set(0.5, 0.5);
    this.moonPath.position.set(p.moon.x, p.horizon + seaH * 0.55);
    this.moonPath.width = p.moon.r * 2.6;
    this.moonPath.height = seaH * 1.25;
    this.glintLayer.addChild(this.moonPath);
    const GR = rng(41);
    const nG = p.P ? 9 : 16;
    for (let i = 0; i < nG; i++) {
      const d = (i + 0.5) / nG;
      const y = p.horizon + seaH * (0.03 + 0.95 * Math.pow(d, 1.35));
      const w = p.moon.r * (0.28 + 1.5 * d) * (0.6 + GR() * 0.6);
      const s = new Sprite(glintT);
      s.anchor.set(0.5);
      s.tint = hex(C.moon);
      const x0 = p.moon.x + (GR() - 0.5) * p.moon.r * (0.3 + d * 0.8);
      s.position.set(x0, y);
      s.width = w;
      s.height = Math.max(1.5, w * 0.16);
      this.glintLayer.addChild(s);
      this.glints.push({ s, w, x0, phase: GR() * 6, speed: 1.2 + GR() * 2.2, a: 0.35 + (1 - d) * 0.25 + GR() * 0.3 });
    }
    // fog for the Moonlight Raid (hidden until the mood fades it in)
    for (const fg of this.fog) fg.destroy();
    const fh = S * 5.2 * (160 / 512);
    this.fog = [0, 1].map((i) => {
      const t = new TilingSprite({ texture: fogT, width: W, height: fh });
      t.tileScale.set(1 / (res * soft));
      t.position.set(0, i ? p.bulTop - fh * 0.7 : p.horizon - fh * 0.5);
      t.tint = hex(C.greenGlow);
      t.alpha = 0;
      return t;
    });
    this.sea.addChild(this.fog[0]);
    this.addChildAt(this.fog[1], this.getChildIndex(this.shipLayer) + 1);

    // sail corner (top-left, behind the logo)
    this.sail.visible = !!p.sail;
    if (p.sail) {
      this.sail.texture = sailT;
      this.sail.position.set(0, 0);
      this.sail.width = p.sail.w;
      this.sail.height = p.sail.h * (512 / 500);
      this.sailBase = { x: this.sail.scale.x, y: this.sail.scale.y };
    }

    // flag staff (landscape) + cap
    this.pole.visible = this.poleCapS.visible = !!p.pole;
    if (p.pole) {
      this.pole.texture = poleT;
      this.pole.tileScale.set(1 / res);
      this.pole.width = p.pole.w * 2;
      this.pole.height = p.bulTop + S * 0.5 - p.pole.top;
      this.pole.position.set(p.pole.x - p.pole.w, p.pole.top);
      this.poleCapS.texture = capT;
      this.poleCapS.anchor.set(0.5, 0.92);
      this.poleCapS.width = this.poleCapS.height = p.pole.w * 2.6;
      this.poleCapS.position.set(p.pole.x, p.pole.top + p.pole.w * 0.3);
    }

    // rigging: tarred shrouds from the masthead to the rail, ratlines across them
    const g = this.rigG.clear();
    if (p.rig && p.mast) {
      const top = { x: p.mast.x, y: p.rig.top };
      const rail = p.bulTop + S * 0.06;
      const lw = Math.max(1.5, S * 0.034);
      const tar = hex(mix(C.inkSoft, C.night, 0.35));
      const at = (x: number, y: number) => top.x + ((x - top.x) * (y - top.y)) / (rail - top.y);
      for (let y = rail - S * 0.34; y > p.rig.ratFrom; y -= S * 0.3) {
        const xs = p.rig.x.map((x) => at(x, y));
        g.moveTo(xs[0], y).quadraticCurveTo((xs[0] + xs[2]) / 2, y + S * 0.03, xs[2], y).stroke({ width: lw * 0.75 + 1.4, color: hex(C.ink), alpha: 0.9 });
        g.moveTo(xs[0], y).quadraticCurveTo((xs[0] + xs[2]) / 2, y + S * 0.03, xs[2], y).stroke({ width: lw * 0.75, color: tar });
      }
      for (const x of p.rig.x) {
        g.moveTo(top.x, top.y).lineTo(x, rail).stroke({ width: lw + 1.6, color: hex(C.ink) });
        g.moveTo(top.x, top.y).lineTo(x, rail).stroke({ width: lw, color: tar });
        g.moveTo(top.x + lw * 0.35, top.y).lineTo(x + lw * 0.35, rail).stroke({ width: Math.max(0.8, lw * 0.25), color: hex(C.moonGlow), alpha: 0.28 });
      }
    }

    // the Jolly Roger: a small vertex grid waved in update()
    this.flagArgs = { tex: flagT, x: p.flag.x, y: p.flag.y, w: p.flag.w, h: flagH, dir: p.flag.dir };
    this.flagN = this.low ? { nx: 6, ny: 2 } : { nx: 12, ny: 4 };
    this.buildFlag(flagT, p.flag.x, p.flag.y, p.flag.w, flagH, p.flag.dir);

    // bulwark, mast, deck
    this.bulwark.texture = bulT;
    this.bulwark.tileScale.set(1 / res);
    this.bulwark.position.set(0, p.bulTop);
    this.bulwark.width = W;
    this.bulwark.height = bulH;
    // the gun-port bay (centre 600 of 960) sits left of centre in portrait, near the hatch in landscape
    this.bulwark.tilePosition.x = (p.P ? W * 0.3 : p.W - p.sideW * 0.2) - bulH * 4 * (600 / 960);
    this.mast.visible = this.mastFootS.visible = !!p.mast;
    if (p.mast) {
      const mw = p.mast.w * (128 / 84);
      this.mast.texture = mastT;
      this.mast.tileScale.set(1 / res);
      this.mast.width = mw;
      this.mast.height = p.floorY + S * 0.05;
      this.mast.position.set(p.mast.x - mw / 2, 0);
      this.mast.tilePosition.y = -mw * 5 * (560 / 640) + p.bulTop * 0.5;
      this.mastFootS.texture = footT;
      this.mastFootS.anchor.set(0.5, 214 / 256);
      this.mastFootS.width = this.mastFootS.height = p.mast.w * (256 / 84);
      this.mastFootS.position.set(p.mast.x, p.floorY + S * 0.04);
    }
    this.deck.texture = deckT;
    this.deck.tileScale.set(1 / res);
    this.deck.position.set(0, p.floorY);
    this.deck.width = W;
    this.deck.height = deckH;

    // soft contact shadows where the crew stand on the deck (the character rigs draw none)
    const crew = [
      { c: L.captain, w: 0.46 },
      { c: L.parrot, w: 0.5 },
    ];
    crew.forEach(({ c, w }, i) => {
      const sh = this.shadows[i];
      sh.texture = shadowTexture();
      sh.width = c.h * w;
      sh.height = c.h * w * 0.14;
      sh.position.set(c.x, c.y + S * 0.02);
      sh.alpha = 0.55;
    });
    // shooting stars cross open sky in the side zones only, never behind the logo, bar or meter
    const starTop = L.compact ? L.winBar.y + L.winBar.h + S * 0.2 : S * 0.25;
    this.starZones = p.P
      ? [{ x: L.logo.x + L.logo.w + S * 0.3, y: S * 0.2, w: W - (L.logo.x + L.logo.w) - S * 0.5, h: Math.max(S * 0.6, L.winBar.y - S * 0.6) }]
      : [{ x: L.frame.x + L.frame.w + S * 0.35, y: starTop, w: p.sideW - S * 0.7, h: Math.max(S * 0.5, p.horizon * 0.45 - starTop + S * 0.25) }];
    this.star.texture = streakTexture();
    this.star.tint = hex(C.moon);
    this.star.visible = false;
    this.starRun.on = false;

    // warm light pooled behind the hatch (the reels are the lit subject)
    this.frameGlow.texture = softLightTexture();
    this.frameGlow.tint = hex(C.fireHot);
    this.frameGlow.position.set(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h * 0.55);
    this.frameGlow.width = L.frame.w * 1.7;
    this.frameGlow.height = L.frame.h * 1.45;
    this.frameGlowBase = { w: this.frameGlow.width, h: this.frameGlow.height };

    // props on the deck
    this.propLayer.removeChildren().forEach((c) => c.destroy());
    p.props.forEach((pr, i) => {
      const s = new Sprite(propTs[i]);
      s.anchor.set(0.5, PROP_FOOT[pr.kind]);
      s.width = s.height = pr.w;
      if (pr.flip) s.scale.x *= -1;
      s.position.set(pr.x, p.floorY + S * 0.05);
      this.propLayer.addChild(s);
      if (pr.kind === 'treasure') this.glintSpot = { x: pr.x, y: p.floorY - pr.w * 0.28, w: pr.w, next: 1.5, t: 0 };
    });
    this.glint.texture = sparkT;
    this.glint.visible = p.props.some((pr) => pr.kind === 'treasure');

    // lanterns: glow, tinted glass, crossfading flames, cage
    this.lampLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.lamps = [];
    p.lamps.forEach((lp, i) => {
      if (lp.bracket) {
        const b = new Sprite(bracketT);
        b.anchor.set(4 / 160, 10 / 110);
        b.width = lp.bracket.w;
        b.height = lp.bracket.w * (110 / 160);
        if (lp.bracket.flip) b.scale.x *= -1;
        b.position.set(lp.bracket.x, lp.bracket.y);
        this.lampLayer.addChild(b);
      }
      const k = lp.h / 224;
      const root = new Container();
      root.position.set(lp.x, lp.y);
      const glow = new Sprite(softLightTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = hex(C.fireHot);
      glow.width = glow.height = lp.h * 4.4;
      // wide, faint spill of warm light onto the rail, rigging and crew
      const spill = new Sprite(softLightTexture());
      spill.anchor.set(0.5);
      spill.blendMode = 'add';
      spill.tint = hex(C.fire);
      spill.width = spill.height = lp.h * 10;
      const back = new Sprite(backT);
      const front = new Sprite(frontT);
      for (const s of [back, front]) {
        s.anchor.set(0.5, lp.hang ? LAMP_RING / 224 : LAMP_FOOT / 224);
        s.width = 128 * k;
        s.height = 224 * k;
      }
      back.tint = hex(C.fireHot);
      const wickY = (lp.hang ? 224 * LANTERN_WICK.y - LAMP_RING : 224 * LANTERN_WICK.y - LAMP_FOOT) * k;
      glow.position.set(0, wickY - lp.h * 0.12);
      spill.position.set(0, wickY);
      const fire = new Sprite(fireT);
      const ghost = new Sprite(this.kind === 'limbo' ? spiritT : this.kind === 'tantrum' ? fireT : greenT);
      const fw = 128 * k * LANTERN_WICK.flameW * 1.12;
      for (const s of [fire, ghost]) {
        s.anchor.set(0.5, 0.94);
        s.width = s.height = fw;
        s.position.set(0, wickY);
      }
      ghost.alpha = 0;
      root.addChild(spill, glow, back, fire, ghost, front);
      this.lampLayer.addChild(root);
      this.lamps.push({ root, spill, glow, back, fire, ghost, front, seed: i * 2.3 + 0.7, swing: lp.hang ? 0.045 : 0, flameW: fw });
    });
    this.flameTex = { fire: fireT, green: greenT, spirit: spiritT };

    // bonus lighting overlays
    this.moodTint.width = W;
    this.moodTint.height = p.H;
    this.floorGlow.texture = riseTexture();
    this.floorGlow.width = W;
    this.floorGlow.height = p.H * 0.62;
    this.floorGlow.y = p.H - p.H * 0.62;

    this.applyMood();
    this.applyLow();
    this.update(0);

    // drop rasters from earlier viewport sizes (everything above now points at this layout's)
    const keep = new Set<string>();
    for (const t of [moonT, ghostT, wispT, sparkT, headLT, headRT, lightT, beamT, shipT, glintT, fogT, bulT, deckT, mastT, footT, poleT, capT, bracketT, backT, frontT, fireT, greenT, spiritT, sailT, flagT, ...rowTs, ...propTs])
      if (t && t !== Texture.EMPTY && t.source?.label) keep.add(t.source.label);
    evict('cove-', keep);
  }

  private flameTex: Record<'fire' | 'green' | 'spirit', Texture | null> = { fire: null, green: null, spirit: null };

  private buildFlag(tex: Texture, x: number, y: number, w: number, h: number, dir: 1 | -1) {
    const { nx, ny } = this.flagN;
    const pos = new Float32Array((nx + 1) * (ny + 1) * 2);
    const uvs = new Float32Array((nx + 1) * (ny + 1) * 2);
    const idx: number[] = [];
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const k = (j * (nx + 1) + i) * 2;
        pos[k] = (i / nx) * w * dir;
        pos[k + 1] = (j / ny) * h;
        uvs[k] = i / nx;
        uvs[k + 1] = j / ny;
        if (i < nx && j < ny) {
          const a = j * (nx + 1) + i;
          idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
        }
      }
    if (this.flagMesh) {
      this.flagMesh.destroy();
      this.flagMesh = null;
    }
    this.flagGeo?.destroy();
    this.flagGeo = new MeshGeometry({ positions: pos, uvs, indices: new Uint32Array(idx) });
    this.flagBase = pos.slice();
    this.flagDims = { w, h, dir };
    this.flagMesh = new Mesh({ geometry: this.flagGeo, texture: tex });
    this.flagMesh.position.set(x, y);
    this.shipLayer.addChildAt(this.flagMesh, this.shipLayer.getChildIndex(this.poleCapS));
  }

  /** Low quality on or off at runtime: no re-raster, only what animates and what draws changes. */
  setLow(low: boolean) {
    if (low === this.low) return;
    this.low = low;
    if (!this.plan) this.lowK = low ? 1 : 0;
    this.flagN = low ? { nx: 6, ny: 2 } : { nx: 12, ny: 4 };
    const f = this.flagArgs;
    if (f) this.buildFlag(f.tex, f.x, f.y, f.w, f.h, f.dir);
    this.applyLow();
    this.update(0);
  }

  private applyLow() {
    const low = this.low;
    // every other moon glint and five twinkling stars stay; the rest are baked sky or simply gone
    this.glints.forEach((g, i) => (g.s.visible = !low || i % 2 === 0));
    this.twinkles.forEach((tw, i) => (tw.s.visible = !low || i < 5));
    for (const l of this.lamps) l.spill.visible = !low;
    // the beam's sweep is a big additive quad: low keeps the lamp's pulse and drops the beam
    this.beam.visible = !!this.plan?.light && !low;
    // warm pool behind the hatch, smaller in low (it is mostly hidden behind the frame anyway)
    const L = this.frameGlowBase;
    this.frameGlow.width = L.w * (low ? 0.8 : 1);
    this.frameGlow.height = L.h * (low ? 0.85 : 1);
  }
  private frameGlowBase = { w: 1, h: 1 };

  /** Per-bonus lighting. null = the normal moonlit night. */
  setBonusLight(kind: BonusKind | null) {
    if (kind) this.kind = kind;
    this.moodTarget = kind ? 1 : 0;
    const ft = this.flameTex[this.kind === 'witching' ? 'green' : this.kind === 'limbo' ? 'spirit' : 'fire'];
    if (ft) for (const l of this.lamps) l.ghost.texture = ft;
  }

  /** Bonus lighting: tint the scenery (colour, strength 0..1). */
  setMood(color: number, alpha: number) {
    this.moodTint.tint = color;
    this.moodTint.alpha = alpha;
  }

  /** Push the current mood blend into every mood-driven sprite. */
  private applyMood() {
    const k = this.moodK;
    const spec = {
      // multiply tints are pale mixes of the mood hue; white is the neutral (no tint)
      witching: { tint: MOOD.greenTint, a: 0.3, glow: hex(C.greenMid), ga: 0.34, halo: hex(C.green), moonTint: 0xffffff, lamp: hex(C.green), fog: 0.42, rim: hex(C.greenGlow) },
      tantrum: { tint: MOOD.emberTint, a: 0.42, glow: hex(C.fire), ga: 0.5, halo: hex(C.fire), moonTint: MOOD.emberMoon, lamp: hex(C.fire), fog: 0, rim: hex(C.fireHot) },
      limbo: { tint: MOOD.spiritTint, a: 0.45, glow: hex(C.octo), ga: 0.42, halo: hex(C.octoLight), moonTint: MOOD.spiritMoon, lamp: hex(C.octoLight), fog: 0.3, rim: MOOD.spiritMoon },
    }[this.kind];
    this.setMood(spec.tint, spec.a * k);
    this.floorGlow.tint = spec.glow;
    this.floorGlow.alpha = spec.ga * k;
    const ghost = this.kind === 'witching' ? k : 0;
    this.moonGhost.alpha = ghost;
    this.moon.alpha = 1 - ghost;
    this.moon.tint = lerpColor(0xffffff, spec.moonTint, k);
    this.halo.tint = lerpColor(hex(C.moonGlow), spec.halo, k);
    for (const fg of this.fog) fg.alpha = spec.fog * k;
    const warm = hex(C.fireHot);
    for (const l of this.lamps) {
      const lit = lerpColor(warm, spec.lamp, this.kind === 'tantrum' ? 0 : k);
      l.glow.tint = lit;
      l.spill.tint = lerpColor(hex(C.fire), spec.lamp, this.kind === 'tantrum' ? 0 : k);
      l.back.tint = lit;
      l.ghost.alpha = this.kind === 'tantrum' ? 0 : k;
      l.fire.alpha = this.kind === 'tantrum' ? 1 : 1 - k;
    }
    this.frameGlow.tint = lerpColor(warm, spec.lamp, k);
    const gl = lerpColor(hex(C.moon), spec.rim, k);
    for (const g of this.glints) g.s.tint = gl;
    this.moonPath.tint = lerpColor(hex(C.moonGlow), spec.rim, k);
    // faded-out layers leave the render (the mood tint and floor glow cover most of the screen)
    this.moodTint.renderable = this.moodTint.alpha > 0.002;
    this.floorGlow.renderable = this.floorGlow.alpha > 0.002;
    this.moonGhost.renderable = this.moonGhost.alpha > 0.002;
    this.moon.renderable = this.moon.alpha > 0.002;
    for (const fg of this.fog) fg.renderable = fg.alpha > 0.002;
    for (const l of this.lamps) {
      l.ghost.renderable = l.ghost.alpha > 0.002;
      l.fire.renderable = l.fire.alpha > 0.002;
    }
  }

  update(dtMs: number) {
    const dt = Math.min(0.1, dtMs / 1000);
    this.t += dt;
    const t = this.t;
    const p = this.plan;
    if (!p) return;
    const S = p.S;

    // bonus light blend eases in/out over ~1 s
    if (this.moodK !== this.moodTarget) {
      const d = this.moodTarget - this.moodK;
      this.moodK = Math.abs(d) < 0.004 ? this.moodTarget : this.moodK + d * (1 - Math.exp(-dt * 3.2));
      this.applyMood();
    }

    const low = this.low;
    const lowTarget = low ? 1 : 0;
    if (this.lowK !== lowTarget) {
      const d = lowTarget - this.lowK;
      this.lowK = Math.abs(d) < 0.01 ? lowTarget : this.lowK + d * (1 - Math.exp(-dt * 3));
    }
    const lk = this.lowK;
    for (const tw of this.twinkles) {
      if (!tw.s.visible) continue;
      const w = Math.sin(t * tw.speed + tw.phase);
      const pop = Math.pow(Math.max(0, Math.sin(t * tw.speed * 0.37 + tw.phase * 2)), 12);
      tw.s.alpha = tw.base * (0.35 + 0.45 * (w * 0.5 + 0.5)) + pop * 0.4;
      tw.s.width = tw.s.height = tw.size * (0.75 + 0.25 * w + pop * 0.5);
    }

    const m = p.moon;
    this.halo.alpha = (0.34 + this.moodK * 0.22) * (1 + Math.sin(t * 0.7) * 0.06);
    this.moonPath.alpha = 0.16 + Math.sin(t * 1.3) * 0.02;
    // the wisp drifts right to left across the moon and loops, fading at the ends of its run
    // (low quality parks it across the moon's lower edge)
    const run = m.r * 5.5;
    const drift = ((t * S * 0.055 + run * 0.3) % run) / run;
    const ph = drift + (0.42 - drift) * lk;
    this.wisp.position.set(m.x + run * (0.5 - ph), m.y + m.r * 0.38);
    this.wisp.alpha = Math.min(1, Math.sin(Math.PI * ph) * 2.2) * 0.9;
    this.wisp.renderable = this.wisp.alpha > 0.002;

    if (p.light) {
      const th = t * ((Math.PI * 2) / 11);
      const c = Math.cos(th);
      const s = Math.sin(th);
      // apparent length follows the cosine of the rotation; negative flips it to point left
      if (this.beam.visible) {
        this.beam.scale.x = (c * S * 3.1) / Math.max(1, this.beam.texture.orig.width);
        this.beam.alpha = 0.16 + 0.26 * Math.max(0, s) + 0.06;
      }
      this.flash.alpha = 0.35 + 0.65 * Math.pow(Math.max(0, s), 6);
    }
    if (p.ship) this.ship.y = p.horizon + (p.bulTop - p.horizon) * 0.05 + Math.sin(t * 0.8) * S * 0.012;

    // low quality: the two far rows hold still, the near ones roll slower and stop swaying and bobbing
    const calm = 1 - lk;
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      r.off += r.speed * dt * (1 - lk * (i < 2 ? 1 : 0.4));
      r.t.tilePosition.x = r.off + Math.sin(t * 0.45 + r.phase) * r.sway * calm;
      r.t.y = r.y0 + Math.sin(t * 0.9 + r.phase) * r.bob * (S / 100) * calm;
    }
    for (const g of this.glints) {
      if (!g.s.visible) continue;
      const k = Math.sin(t * g.speed + g.phase);
      g.s.width = g.w * (0.72 + 0.28 * k);
      g.s.alpha = g.a * (0.55 + 0.45 * Math.sin(t * g.speed * 1.7 + g.phase * 2));
      g.s.x = g.x0 + Math.sin(t * 0.6 + g.phase) * S * 0.03;
    }
    for (let i = 0; i < this.fog.length; i++) {
      const fg = this.fog[i];
      if (fg.alpha > 0.001) fg.tilePosition.x = t * S * (i ? -0.12 : 0.08);
    }

    this.flagPhase += dt * (4.2 - 1.6 * lk);
    this.waveFlag();

    if (this.sail.visible) {
      this.sail.scale.set(this.sailBase.x * (1 + Math.sin(t * 0.55 + 0.8) * 0.004), this.sailBase.y * (1 + Math.sin(t * 0.55) * 0.007));
    }

    // an occasional shooting star
    const sr = this.starRun;
    sr.t += dt;
    if (!sr.on && sr.t > sr.next && this.starZones.length) {
      const z = this.starZones[0];
      if (z.w > S * 0.8 && z.h > S * 0.4) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        const ang = (0.35 + Math.random() * 0.3) * (dir < 0 ? -1 : 1);
        sr.len = Math.min(z.w * 0.8, S * (1.3 + Math.random()));
        sr.dx = Math.cos(ang) * dir;
        sr.dy = Math.abs(Math.sin(ang));
        sr.x = z.x + (dir > 0 ? Math.random() * z.w * 0.3 : z.w - Math.random() * z.w * 0.3);
        sr.y = z.y + Math.random() * z.h * 0.4;
        sr.dur = 0.65 + Math.random() * 0.3;
        sr.on = true;
        this.star.visible = true;
        this.star.rotation = Math.atan2(sr.dy, sr.dx);
      }
      sr.t = 0;
      sr.next = 9 + Math.random() * 10;
    }
    if (sr.on) {
      const k = sr.t / sr.dur;
      if (k >= 1) {
        sr.on = false;
        this.star.visible = false;
      } else {
        const e = 1 - Math.pow(1 - k, 2);
        this.star.position.set(sr.x + sr.dx * sr.len * e, sr.y + sr.dy * sr.len * e);
        this.star.width = sr.len * 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.2));
        this.star.height = Math.max(3, S * 0.075);
        this.star.alpha = Math.sin(Math.PI * k) * 0.9;
      }
    }

    for (const l of this.lamps) {
      const n = Math.sin(t * 9 + l.seed) * 0.5 + Math.sin(t * 13.7 + l.seed * 2) * 0.3 + Math.sin(t * 23 + l.seed) * 0.2;
      const fw = l.flameW * (1 + n * 0.06);
      const fh = l.flameW * (1 + n * 0.14);
      const sk = Math.sin(t * 3 + l.seed) * 0.08;
      l.fire.width = l.ghost.width = fw;
      l.fire.height = l.ghost.height = fh;
      l.fire.skew.x = l.ghost.skew.x = sk;
      l.glow.alpha = 0.4 + n * 0.05;
      l.spill.alpha = 0.13 + n * 0.015;
      l.back.alpha = 0.78 + n * 0.08;
      if (l.swing) l.root.rotation = Math.sin(t * 1.1 + l.seed) * l.swing;
    }
    this.frameGlow.alpha = 0.2 + Math.sin(t * 7.3) * 0.012 + Math.sin(t * 11.1) * 0.008;

    // a glint pops on the treasure every couple of seconds
    const gs = this.glintSpot;
    if (this.glint.visible) {
      gs.t += dt;
      if (gs.t > gs.next) {
        gs.t = 0;
        gs.next = 1.6 + Math.random() * 2.2;
        this.glint.position.set(gs.x + (Math.random() - 0.5) * gs.w * 0.5, gs.y + (Math.random() - 0.3) * gs.w * 0.2);
      }
      const k = gs.t / 0.55;
      const a = k < 1 ? Math.sin(Math.PI * k) : 0;
      this.glint.alpha = a;
      this.glint.renderable = a > 0.002;
      this.glint.width = this.glint.height = gs.w * 0.42 * (0.4 + a * 0.6);
      this.glint.rotation = k * 0.8;
    }

    if (this.floorGlow.alpha > 0) this.floorGlow.scale.y = Math.abs(this.floorGlow.scale.y) * (1 + Math.sin(t * 1.3) * 0.0025);
  }

  /** Travelling sine wave along the flag, growing toward the fly end. */
  private waveFlag() {
    const geo = this.flagGeo;
    const base = this.flagBase;
    if (!geo || !base) return;
    const pos = geo.positions;
    const { w, h, dir } = this.flagDims;
    const { nx, ny } = this.flagN;
    // low quality: a slower (flagPhase), softer wave on the coarse grid
    const amp = 1 - 0.3 * this.lowK;
    const fp = this.flagPhase;
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) {
        const k = (j * (nx + 1) + i) * 2;
        const u = i / nx;
        const v = j / ny;
        const ph = u * 5.2 - fp + v * 0.5;
        const a = Math.pow(u, 1.15) * amp;
        pos[k] = base[k] + dir * (Math.cos(ph) - 1) * w * 0.035 * a;
        pos[k + 1] = base[k + 1] + Math.sin(ph) * h * 0.1 * a + u * u * h * 0.04;
      }
    geo.getBuffer('aPosition').update();
  }
}

/** Mood tints derived from the palette (pale mixes toward white for multiply blending). */
const MOOD = {
  greenTint: hex(mix(C.green, C.white, 0.3)),
  emberTint: hex(mix(C.fire, C.white, 0.3)),
  emberMoon: hex(mix(C.fire, C.white, 0.45)),
  spiritTint: hex(mix(C.octoLight, C.white, 0.35)),
  spiritMoon: hex(mix(C.octoLight, C.white, 0.5)),
};

/** Lantern ring top and base (y in its 224-unit box). */
const LAMP_RING = 3.5;
const LAMP_FOOT = 210;

/** A lantern hung from a wall bracket: the bracket's plate sits at (x, y), the ring on its hook. */
function hangFrom(b: { x: number; y: number; w: number; flip: boolean }, h: number) {
  const k = b.w / 160;
  return { x: b.x + (b.flip ? -1 : 1) * (136 - 4) * k, y: b.y + (46 - 10) * k, h, hang: true, bracket: b };
}

const PROP_ART: Record<PropKind, () => string> = { barrel, cannon, balls: cannonballs, rope: ropeCoil, treasure: treasurePile };
/** Where each prop's base sits in its 256 box (anchor y). */
const PROP_FOOT: Record<PropKind, number> = { barrel: 232 / 256, cannon: 226 / 256, balls: 224 / 256, rope: 214 / 256, treasure: 222 / 256 };
