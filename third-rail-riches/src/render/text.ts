import { joinedScript, cjkScript, t } from '../i18n';
import {
  AbstractBitmapFont,
  BitmapText,
  Cache,
  CanvasTextMetrics,
  FillGradient,
  ImageSource,
  Rectangle,
  RenderTexture,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type CharData,
  type DestroyOptions,
  type Renderer,
  type TextStyleOptions,
} from 'pixi.js';
import { C } from '../art/kit';
import { glyph, buildGlyph, NUMERALS, type GlyphOutline } from '../art/lettering';

/**
 * Game type (track H). Three families, none of them a stock font shown plain:
 *
 * 1. **Numerals** (win amounts, multipliers, counters): our own woodtype digits and signs from
 *    `art/lettering.ts`, baked per tone into a shared bitmap atlas with the house treatment (inked
 *    outline, carved extrusion, hard cel bands, rim shade, inline, glint). `bitmapNum()` and
 *    `numBaseStyle()` hand them to BitmapText; any character we did not draw (currency codes,
 *    K / M suffixes, other scripts) is drawn from Rye with the same treatment, on demand.
 * 2. **Display text** (`DisplayText` / `displayText()`): localised banners and titles. Every layer
 *    is painted into one canvas: extrusion, ink outline, optional brass keyline, cel-banded face,
 *    rim shade, inline, paper grain and a shine. Use it instead of Text + cartoonStyle for any
 *    new banner.
 * 3. **cartoonStyle / numStyle**: canvas Text styles kept for existing callers, now with hard cel
 *    bands instead of a smooth gradient.
 */

/** Numbers fallback face (characters our numerals do not cover). */
export const FONT_DISPLAY = 'Rye, Georgia, serif';
/** Chunky cartoon banners (long words, every language). */
export const FONT_CARTOON = '"Luckiest Guy", "Arial Black", sans-serif';
/** Kept for older callers; the logo itself is hand-built lettering (art/lettering.ts). */
export const FONT_LOGO = 'Rye, "Luckiest Guy", serif';
export const FONT_UI = '"Inter Variable", Inter, system-ui, sans-serif';

export async function loadFonts() {
  const faces = ['400 64px Rye', '400 64px "Luckiest Guy"', '500 16px "Inter Variable"', '600 16px "Inter Variable"'];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => undefined)));
  // our numerals' outlines are built here, off any animation path (the atlases in warmFonts)
  const t0 = performance.now();
  for (const ch of NUMERALS) glyph(ch);
  timing.numerals = performance.now() - t0;
}

/* ---------------------------------------------------------------------------------------------
 * Tones
 * ------------------------------------------------------------------------------------------- */

export type NumTone = 'white' | 'gold' | 'silver' | 'bronze' | 'green' | 'crimson' | 'fire' | 'sea';

/** An in-between of two palette colours. */
function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Cel colours of a tone: highlight band, face, shade band, extrusion. */
export interface ToneInk {
  light: string;
  base: string;
  shade: string;
  deep: string;
}

export const TONE_INK: Record<NumTone, ToneInk> = {
  white: { light: C.white, base: C.paper, shade: mix(C.paperWarm, C.woodLight, 0.35), deep: mix(C.woodDeep, C.ink, 0.35) },
  gold: { light: C.goldLight, base: C.gold, shade: mix(C.gold, C.goldDeep, 0.45), deep: mix(C.goldDeep, C.ink, 0.55) },
  silver: { light: C.silverLight, base: C.silver, shade: mix(C.silver, C.silverDeep, 0.45), deep: mix(C.silverDeep, C.ink, 0.55) },
  bronze: { light: C.bronzeLight, base: C.bronze, shade: mix(C.bronze, C.bronzeDeep, 0.45), deep: mix(C.bronzeDeep, C.ink, 0.5) },
  green: { light: C.greenGlow, base: C.green, shade: C.greenMid, deep: mix(C.greenDeep, C.ink, 0.45) },
  crimson: { light: C.crimsonLight, base: C.crimson, shade: mix(C.crimson, C.crimsonDeep, 0.5), deep: mix(C.crimsonDeep, C.ink, 0.45) },
  fire: { light: C.fireCore, base: C.fireHot, shade: C.fire, deep: mix(C.ember, C.ink, 0.25) },
  sea: { light: C.seaFoam, base: C.seaLight, shade: C.sea, deep: mix(C.seaDeep, C.ink, 0.45) },
};

/* ---------------------------------------------------------------------------------------------
 * The layered painter (numeral atlas, fallback glyphs, DisplayText)
 * ------------------------------------------------------------------------------------------- */

interface Paintable {
  /** Fill the shape, offset by (dx, dy) px. */
  fill(c: CanvasRenderingContext2D, dx: number, dy: number): void;
  /** Stroke the shape's outline (round joins), `w` px wide, offset by (dx, dy). */
  stroke(c: CanvasRenderingContext2D, w: number, dx: number, dy: number): void;
}

interface Layers {
  /** Ink outline outside the edge (px). */
  ink: number;
  /** Carved extrusion depth (px) and its direction. */
  depth: number;
  dir: [number, number];
  /** Brass keyline between two inks (px); 0 = none. */
  keyline: number;
  /** Cel rim shade offset (px). */
  rim: number;
  /** Inline band [from, to] px inside the edge, or null. */
  inline: [number, number] | null;
  /** Soft drop shadow blur (px); 0 = none. */
  shadow: number;
  /** Fill one hard cel band's region (highlight over the top, shade across the foot) with the
   * current fillStyle; clipped to the face by the caller. */
  band(c: CanvasRenderingContext2D, which: 'light' | 'shade'): void;
  /** Hand-cut highlights with the current stroke / fill style; clipped to the face by the caller. */
  glints?(c: CanvasRenderingContext2D): void;
  grain: boolean;
}

const scratchPool: HTMLCanvasElement[] = [];
function scratch(i: number, w: number, h: number): CanvasRenderingContext2D {
  let c = scratchPool[i];
  if (!c) c = scratchPool[i] = document.createElement('canvas');
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  // grow to fit, and shrink back once it is far bigger than needed: one oversized request must not
  // leave a canvas past the browser's limits (it then draws nothing, and every later face is lost)
  if (c.width < W || c.height < H || c.width * c.height > Math.max(4 * W * H, 1 << 22)) {
    c.width = c.width < W || c.width > 2 * W ? W : c.width;
    c.height = c.height < H || c.height > 2 * H ? H : c.height;
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, W, H);
  return ctx;
}

let grainPat: CanvasPattern | null = null;
/** A small tile of paper grain and brush specks (drawn once), for the textured face. */
function grain(c: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainPat) return grainPat;
  const t = document.createElement('canvas');
  t.width = t.height = 64;
  const g = t.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = C.ink;
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.5;
    g.beginPath();
    g.ellipse(rnd() * 64, rnd() * 64, 0.4 + rnd() * 1.1, 0.3 + rnd() * 0.6, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = C.ink;
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = 0.25;
    g.lineWidth = 0.7;
    const x = rnd() * 64;
    const y = rnd() * 64;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 6, y + 1 + rnd() * 2, x + 12 + rnd() * 6, y + rnd() * 3);
    g.stroke();
  }
  grainPat = c.createPattern(t, 'repeat');
  return grainPat;
}

/**
 * Paint a shape with the house treatment into `ctx` (its current transform), inside a w x h px
 * cell whose origin is the ctx origin. Order, back to front: soft shadow, carved extrusion with its
 * ink, ink outline (brass keyline between two inks for banners), then the face: base colour, hard
 * cel bands, rim shade, inline, grain, glints.
 */
function paintLayers(ctx: CanvasRenderingContext2D, w: number, h: number, sh: Paintable, L: Layers, ink: ToneInk) {
  const [ex, ey] = L.dir;
  const outer = L.ink + (L.keyline > 0 ? L.keyline + L.ink * 0.55 : 0);
  // copies of the letters along the depth: the ink's round joins bridge the steps, so a few do
  const steps = Math.max(2, Math.ceil(L.depth / Math.max(1.25, outer * 0.9)));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (L.shadow > 0) {
    // the shadow of a copy drawn far off the cell, thrown back under the letters
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = L.shadow;
    ctx.shadowOffsetX = 10000 + ex * L.depth * 0.6;
    ctx.shadowOffsetY = ey * L.depth + L.shadow * 0.5;
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    sh.stroke(ctx, outer * 2, -10000, 0);
    ctx.restore();
  }
  // carved extrusion: its inked silhouette, then the wood (or tone-deep) body
  ctx.fillStyle = C.ink;
  ctx.strokeStyle = C.ink;
  for (let i = steps; i >= 1; i--) sh.stroke(ctx, outer * 2, (ex * L.depth * i) / steps, (ey * L.depth * i) / steps);
  // the body: the far copies darker, the near ones on top in the tone's deep colour
  const split = Math.max(1, Math.floor(steps / 2));
  ctx.fillStyle = mix(ink.deep, C.ink, 0.45);
  for (let i = steps; i > split; i--) sh.fill(ctx, (ex * L.depth * i) / steps, (ey * L.depth * i) / steps);
  ctx.fillStyle = ink.deep;
  for (let i = split; i >= 1; i--) sh.fill(ctx, (ex * L.depth * i) / steps, (ey * L.depth * i) / steps);
  // outline: ink (or ink | brass | ink)
  ctx.strokeStyle = C.ink;
  sh.stroke(ctx, outer * 2, 0, 0);
  if (L.keyline > 0) {
    ctx.strokeStyle = C.gold;
    sh.stroke(ctx, (L.ink * 0.55 + L.keyline) * 2, 0, 0);
    ctx.strokeStyle = C.goldLight;
    sh.stroke(ctx, (L.ink * 0.55 + L.keyline * 0.35) * 2, -L.keyline * 0.25, -L.keyline * 0.3);
    ctx.strokeStyle = C.ink;
    sh.stroke(ctx, L.ink * 0.55 * 2, 0, 0);
  }
  ctx.fillStyle = C.ink;
  sh.fill(ctx, 0, 0);
  ctx.restore();

  // the face, on its own canvas so every effect stays inside the letters
  const f = scratch(0, w, h);
  f.lineJoin = 'round';
  f.lineCap = 'round';
  f.fillStyle = ink.base;
  sh.fill(f, 0, 0);
  f.globalCompositeOperation = 'source-atop';
  f.fillStyle = ink.light;
  L.band(f, 'light');
  f.fillStyle = ink.shade;
  L.band(f, 'shade');
  // rim shade on the lower right: the face minus itself nudged up-left
  if (L.rim > 0) {
    const t = scratch(1, w, h);
    t.fillStyle = '#fff';
    sh.fill(t, 0, 0);
    t.globalCompositeOperation = 'destination-out';
    sh.fill(t, -L.rim, -L.rim);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = mix(ink.shade, ink.deep, 0.35);
    t.fillRect(0, 0, w, h);
    f.drawImage(t.canvas, 0, 0);
  }
  if (L.inline) {
    const t = scratch(1, w, h);
    t.lineJoin = 'round';
    t.strokeStyle = '#fff';
    sh.stroke(t, L.inline[1] * 2, 0, 0);
    t.globalCompositeOperation = 'destination-out';
    sh.stroke(t, L.inline[0] * 2, 0, 0);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = ink.light;
    t.fillRect(0, 0, w, h);
    f.globalAlpha = 0.85;
    f.drawImage(t.canvas, 0, 0);
    f.globalAlpha = 1;
  }
  if (L.grain) {
    const p = grain(f);
    if (p) {
      f.globalAlpha = 0.16;
      f.fillStyle = p;
      f.fillRect(0, 0, w, h);
      f.globalAlpha = 1;
    }
  }
  f.strokeStyle = C.white;
  f.fillStyle = C.white;
  L.glints?.(f);
  ctx.drawImage(f.canvas, 0, 0, Math.ceil(w), Math.ceil(h), 0, 0, Math.ceil(w), Math.ceil(h));
}

/*
 * The bitmap fonts paint the same glyph in several tones, so the tone-independent work (every
 * path fill and wide stroke) is done once per glyph into a strip of white masks, and each tone is
 * then only a stack of tinted blits.
 */
const MASKS = ['inkBack', 'bodyFar', 'bodyNear', 'inkFront', 'face', 'light', 'shade', 'rim', 'inline', 'glint'] as const;

function buildMasks(sh: Paintable, L: Layers, w: number, h: number): HTMLCanvasElement {
  const n = MASKS.length;
  const cv = document.createElement('canvas');
  cv.width = w * n;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  const [ex, ey] = L.dir;
  const outer = L.ink;
  const steps = Math.max(2, Math.ceil(L.depth / Math.max(1.25, outer * 0.9)));
  const split = Math.max(1, Math.floor(steps / 2));
  const off = (i: number): [number, number] => [(ex * L.depth * i) / steps, (ey * L.depth * i) / steps];
  /** Work inside mask slot i only (composite ops never touch the other slots). */
  const slot = (i: number, draw: () => void) => {
    c.save();
    c.beginPath();
    c.rect(i * w, 0, w, h);
    c.clip();
    c.translate(i * w, 0);
    draw();
    c.restore();
  };
  slot(0, () => {
    for (let i = steps; i >= 1; i--) sh.stroke(c, outer * 2, ...off(i));
  });
  slot(1, () => {
    for (let i = steps; i > split; i--) sh.fill(c, ...off(i));
  });
  slot(2, () => {
    for (let i = split; i >= 1; i--) sh.fill(c, ...off(i));
  });
  slot(3, () => {
    sh.stroke(c, outer * 2, 0, 0);
    sh.fill(c, 0, 0);
  });
  slot(4, () => sh.fill(c, 0, 0));
  for (const [i, which] of [
    [5, 'light'],
    [6, 'shade'],
  ] as const) {
    slot(i, () => {
      sh.fill(c, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      L.band(c, which);
    });
  }
  slot(7, () => {
    if (L.rim <= 0) return;
    sh.fill(c, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    sh.fill(c, -L.rim, -L.rim);
  });
  slot(8, () => {
    if (!L.inline) return;
    sh.stroke(c, L.inline[1] * 2, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    sh.stroke(c, L.inline[0] * 2, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    sh.fill(c, 0, 0);
  });
  slot(9, () => {
    if (!L.glints) return;
    L.glints(c);
    c.globalCompositeOperation = 'destination-in';
    sh.fill(c, 0, 0);
  });
  return cv;
}

/** Stack a glyph's masks into `ctx` (at its origin) in one tone. */
function compositeMasks(ctx: CanvasRenderingContext2D, masks: HTMLCanvasElement, w: number, h: number, ink: ToneInk) {
  const t = scratch(3, w, h);
  const put = (i: number, color: string, alpha = 1) => {
    t.globalCompositeOperation = 'copy';
    t.drawImage(masks, i * w, 0, w, h, 0, 0, w, h);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = color;
    t.fillRect(0, 0, w, h);
    ctx.globalAlpha = alpha;
    ctx.drawImage(t.canvas, 0, 0, w, h, 0, 0, w, h);
  };
  put(0, C.ink);
  put(1, mix(ink.deep, C.ink, 0.45));
  put(2, ink.deep);
  put(3, C.ink);
  put(4, ink.base);
  put(5, ink.light);
  put(6, ink.shade);
  put(7, mix(ink.shade, ink.deep, 0.35));
  put(8, ink.light, 0.85);
  put(9, C.white, 0.9);
  ctx.globalAlpha = 1;
}

/** The masks of the last few glyphs (a glyph is warmed in every tone back to back). */
const maskCache = new Map<string, HTMLCanvasElement>();
function masksFor(key: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
  let m = maskCache.get(key);
  if (m) return m;
  m = build();
  maskCache.set(key, m);
  if (maskCache.size > 3) maskCache.delete(maskCache.keys().next().value!);
  return m;
}

/* ---------------------------------------------------------------------------------------------
 * Numeral bitmap fonts
 * ------------------------------------------------------------------------------------------- */

/** Glyph units (cap height 100) to layout units at the 100 px measurement size: our digits stand
 * exactly as tall as the Rye digits they replace, so every existing size still fits. */
const NUM_K = 0.757;
/** Treatment of the numerals, in glyph units. */
const NUM_TREAT = { ink: 7.5, depth: 7, dir: [0.16, 1] as [number, number], rim: 3.2, inline: [2.6, 4.4] as [number, number] };

/** Shared glyph atlas: 1024 px pages, shelf packed, created as needed. */
class Atlas {
  pages: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: Texture; dirty: boolean }[] = [];
  private x = 0;
  private y = 0;
  private row = 0;
  constructor(readonly px: number) {}
  alloc(w: number, h: number) {
    const gap = 4;
    const S = 1024;
    if (!this.pages.length || this.x + w + gap > S) {
      this.x = 0;
      this.y += this.row + gap;
      this.row = 0;
    }
    if (!this.pages.length || this.y + h + gap > S) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = S;
      const ctx = canvas.getContext('2d')!;
      const tex = new Texture({ source: new ImageSource({ resource: canvas, resolution: this.px, autoGenerateMipmaps: true, alphaMode: 'premultiply-alpha-on-upload' }) });
      tex.source.label = `pkc-glyphs-${this.pages.length}`;
      this.pages.push({ canvas, ctx, tex, dirty: false });
      this.x = 0;
      this.y = 0;
      this.row = 0;
    }
    const page = this.pages[this.pages.length - 1];
    const cell = { page, x: this.x + gap / 2, y: this.y + gap / 2 };
    this.x += w + gap;
    this.row = Math.max(this.row, h);
    page.dirty = true;
    return cell;
  }
  flush() {
    for (const p of this.pages) {
      if (!p.dirty) continue;
      p.dirty = false;
      p.tex.source.update();
    }
  }
}

let atlas: Atlas | null = null;
const getAtlas = () => (atlas ??= new Atlas(Math.min(2, Math.max(1, window.devicePixelRatio || 1)) * 0.85));

/**
 * One bitmap font per (family, tone): our own glyphs where we drew them, the fallback face for
 * anything else, all with the same treatment, generated on demand into the shared atlas.
 */
class TreatedFont extends AbstractBitmapFont<TreatedFont> {
  private capH: number;
  constructor(
    key: string,
    private tone: NumTone,
    private face: string,
    private custom: boolean,
  ) {
    super();
    const m = CanvasTextMetrics.measureFont(`100px ${face}`);
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = `100px ${face}`;
    this.capH = probe.measureText('H').actualBoundingBoxAscent || m.ascent * 0.75;
    const self = this as unknown as { fontMetrics: typeof m; lineHeight: number; fontFamily: string; baseLineOffset: number };
    self.fontMetrics = m;
    self.lineHeight = m.fontSize;
    self.fontFamily = key;
    self.baseLineOffset = 0;
    this.applyFillAsTint = false;
  }

  ensureCharacters(text: string) {
    let added = false;
    for (const ch of CanvasTextMetrics.graphemeSegmenter(text)) {
      if (this.chars[ch]) continue;
      this.addChar(ch);
      added = true;
    }
    if (added) getAtlas().flush();
  }

  private addChar(ch: string) {
    const id = ch.codePointAt(0) ?? 32;
    if (/^\s$/.test(ch)) {
      const probe = scratch(2, 4, 4);
      probe.font = `100px ${this.face}`;
      const g = this.custom ? glyph('0') : null;
      this.chars[ch] = { id, xOffset: 0, yOffset: 0, xAdvance: g ? g.adv * NUM_K * 0.42 : probe.measureText(ch).width, kerning: {} };
      return;
    }
    const g = this.custom ? glyph(ch) : null;
    this.chars[ch] = g ? this.drawGlyph(g) : this.drawFallback(ch);
  }

  /** One of our outlines. Everything in glyph units until the atlas scale. */
  private drawGlyph(g: GlyphOutline): CharData {
    const T = NUM_TREAT;
    const A = getAtlas();
    const pad = { l: T.ink + 2, t: T.ink + 2, r: T.ink + T.depth * T.dir[0] + 2.5, b: T.ink + T.depth + 2.5 };
    const s = A.px * NUM_K; // atlas px per glyph unit
    const cw = Math.ceil((g.box.w + pad.l + pad.r) * s);
    const chh = Math.ceil((g.box.h + pad.t + pad.b) * s);
    const cell = A.alloc(cw, chh);
    const ox = g.box.x - pad.l;
    const oy = g.box.y - pad.t;
    const path = pathOfGlyph(g);
    const shape: Paintable = {
      fill(c, dx, dy) {
        c.save();
        c.translate(dx, dy);
        c.scale(s, s);
        c.translate(-ox, -oy);
        c.fill(path, 'evenodd');
        c.restore();
      },
      stroke(c, w, dx, dy) {
        c.save();
        c.translate(dx, dy);
        c.scale(s, s);
        c.translate(-ox, -oy);
        c.lineWidth = w / s;
        c.stroke(path);
        c.restore();
      },
    };
    const Y = (gy: number) => (gy - oy) * s;
    const X = (gx: number) => (gx - ox) * s;
    const layers: Layers = {
      ink: T.ink * s,
      depth: T.depth * s,
      dir: T.dir,
      keyline: 0,
      rim: T.rim * s,
      inline: [T.inline[0] * s, T.inline[1] * s],
      shadow: 0,
      grain: false,
      band(c, which) {
        // hot highlight across the top, shade across the foot; gently curved hand-cut edges
        c.beginPath();
        if (which === 'light') {
          c.moveTo(0, 0);
          c.lineTo(cw, 0);
          c.lineTo(cw, Y(36));
          c.quadraticCurveTo(X(g.box.x + g.box.w * 0.5), Y(44), 0, Y(38));
        } else {
          c.moveTo(0, Y(78));
          c.quadraticCurveTo(X(g.box.x + g.box.w * 0.55), Y(71), cw, Y(76));
          c.lineTo(cw, chh);
          c.lineTo(0, chh);
        }
        c.fill();
      },
      glints(c) {
        c.lineCap = 'round';
        c.lineWidth = 4.2 * s;
        c.globalAlpha = 0.9;
        c.beginPath();
        const x0 = g.box.x + Math.min(12, g.box.w * 0.22);
        c.moveTo(X(x0), Y(g.box.y + Math.min(30, g.box.h * 0.36)));
        c.quadraticCurveTo(X(x0 + 1), Y(g.box.y + 9), X(x0 + Math.min(12, g.box.w * 0.2)), Y(g.box.y + 7));
        c.stroke();
        c.globalAlpha = 1;
      },
    };
    const masks = masksFor(`g|${g.ch}|${cw}x${chh}`, () => buildMasks(shape, layers, cw, chh));
    const ctx = cell.page.ctx;
    ctx.save();
    ctx.translate(cell.x, cell.y);
    compositeMasks(ctx, masks, cw, chh, TONE_INK[this.tone]);
    ctx.restore();
    return {
      id: g.ch.codePointAt(0)!,
      xOffset: ox * NUM_K,
      yOffset: this.fontMetrics.ascent - 100 * NUM_K + oy * NUM_K,
      xAdvance: g.adv * NUM_K,
      kerning: {},
      texture: new Texture({ source: cell.page.tex.source, frame: new Rectangle(cell.x / A.px, cell.y / A.px, cw / A.px, chh / A.px) }),
    };
  }

  /** A character we did not draw: the fallback face, same treatment. */
  private drawFallback(ch: string): CharData {
    const A = getAtlas();
    const F = 100 * A.px; // atlas font size in px
    const k = F / 100;
    const probe = scratch(2, 4, 4);
    const font = `${F}px ${this.face}`;
    probe.font = font;
    const m = probe.measureText(ch);
    const T = { ink: 5.8 * k, depth: 5.3 * k, rim: 2.4 * k, inline: [2, 3.4].map((v) => v * k) as [number, number] };
    const padL = T.ink + 2 * k;
    const padT = T.ink + 2 * k;
    const padR = T.ink + T.depth * 0.16 + 2.5 * k;
    const padB = T.ink + T.depth + 2.5 * k;
    const left = Math.max(m.actualBoundingBoxLeft, 0);
    const right = Math.max(m.actualBoundingBoxRight, m.width * 0.5);
    const asc = Math.max(m.actualBoundingBoxAscent, this.capH * k * 0.3);
    const desc = Math.max(m.actualBoundingBoxDescent, 0);
    const cw = Math.ceil(left + right + padL + padR);
    const chh = Math.ceil(asc + desc + padT + padB);
    const cell = A.alloc(cw, chh);
    const bx = padL + left; // pen x in the cell
    const by = padT + asc; // baseline y in the cell
    const capTop = by - this.capH * k;
    const shape: Paintable = {
      fill(c, dx, dy) {
        c.font = font;
        c.textBaseline = 'alphabetic';
        c.fillText(ch, bx + dx, by + dy);
      },
      stroke(c, w, dx, dy) {
        c.font = font;
        c.textBaseline = 'alphabetic';
        c.lineWidth = w;
        c.strokeText(ch, bx + dx, by + dy);
      },
    };
    const layers: Layers = {
      ink: T.ink,
      depth: T.depth,
      dir: [0.16, 1],
      keyline: 0,
      rim: T.rim,
      inline: T.inline,
      shadow: 0,
      grain: false,
      band(c, which) {
        const capH = by - capTop;
        if (which === 'light') c.fillRect(0, 0, cw, capTop + capH * 0.38);
        else c.fillRect(0, capTop + capH * 0.76, cw, chh);
      },
    };
    const masks = masksFor(`t|${this.face}|${ch}|${cw}x${chh}`, () => buildMasks(shape, layers, cw, chh));
    const ctx = cell.page.ctx;
    ctx.save();
    ctx.translate(cell.x, cell.y);
    compositeMasks(ctx, masks, cw, chh, TONE_INK[this.tone]);
    ctx.restore();
    // layout units = atlas px / A.px
    return {
      id: ch.codePointAt(0) ?? 0,
      xOffset: -bx / A.px,
      yOffset: this.fontMetrics.ascent - by / A.px,
      xAdvance: m.width / A.px,
      kerning: {},
      texture: new Texture({ source: cell.page.tex.source, frame: new Rectangle(cell.x / A.px, cell.y / A.px, cw / A.px, chh / A.px) }),
    };
  }
}

const paths = new Map<string, Path2D>();
/** One Path2D per glyph, shared by every tone. */
const pathOfGlyph = (g: GlyphOutline) => {
  let p = paths.get(g.ch);
  if (!p) paths.set(g.ch, (p = new Path2D(g.d)));
  return p;
};

const NUM_FAMILY = (tone: NumTone) => `pkc-num-${tone}`;
const CART_FAMILY = (tone: NumTone) => `pkc-cartoon-${tone}`;
/** The canvas-Text family string numStyle() uses; a BitmapText given numStyle() gets our numerals too. */
const numCss = (tone: NumTone) => `${NUM_FAMILY(tone)}, Rye, Georgia, serif`;

function ensureFont(family: string, tone: NumTone, face: string, custom: boolean, aliases: string[] = []) {
  const key = `${family}-bitmap`;
  if (Cache.has(key)) return;
  const font = new TreatedFont(family, tone, face, custom);
  Cache.set(key, font);
  for (const a of aliases) Cache.set(`${a}-bitmap`, font);
}

/* ---------------------------------------------------------------------------------------------
 * Canvas Text styles (kept for existing callers)
 * ------------------------------------------------------------------------------------------- */

/** One fill per tone and face, created once and never freed (see Reels.ts). Hard cel bands laid on
 * the cap height of the face (Pixi maps a vertical fill per line box), not a smooth gradient. */
const gradCache = new Map<string, FillGradient>();
function celFill(tone: NumTone, face: 'display' | 'cartoon'): FillGradient {
  const key = `${tone}:${face}`;
  const hit = gradCache.get(key);
  if (hit) return hit;
  const ink = TONE_INK[tone];
  // cap top and baseline as fractions of the line box (Rye: 22.9..98.6 of 123.5; Luckiest Guy: 27..97 of 106)
  const [top, base] = face === 'display' ? [0.185, 0.8] : [0.255, 0.915];
  const cap = base - top;
  const a = top + cap * 0.4;
  const b = top + cap * 0.74;
  const g = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: ink.light },
      { offset: a, color: ink.light },
      { offset: a + 0.004, color: ink.base },
      { offset: b, color: ink.base },
      { offset: b + 0.004, color: ink.shade },
      { offset: 1, color: ink.shade },
    ],
  });
  gradCache.set(key, g);
  return g;
}

/** Numerals for canvas Text (Rye with our cel bands and ink). With BitmapText it resolves to our own
 * numerals; prefer bitmapNum() for any number. */
export function numStyle(size: number, tone: NumTone = 'white', extra: Partial<TextStyleOptions> = {}): TextStyle {
  ensureFont(NUM_FAMILY(tone), tone, FONT_DISPLAY, true, [numCss(tone)]);
  return new TextStyle({
    fontFamily: numCss(tone),
    fontWeight: '400',
    fontSize: size,
    fill: celFill(tone, 'display'),
    stroke: { color: C.ink, width: Math.max(3, size * 0.12), join: 'round' },
    dropShadow: { color: TONE_INK[tone].deep, alpha: 1, blur: 0, distance: size * 0.07, angle: Math.PI / 2 },
    letterSpacing: size * 0.02,
    padding: size * 0.24,
    ...extra,
    ...scriptSafe(extra),
  });
}

/** Chunky cartoon lettering for canvas Text (existing banners). New banners: use DisplayText. */
export function cartoonStyle(size: number, tone: NumTone = 'white', extra: Partial<TextStyleOptions> = {}): TextStyle {
  return new TextStyle({
    fontFamily: FONT_CARTOON,
    fontSize: size,
    fill: celFill(tone, 'cartoon'),
    stroke: { color: C.ink, width: Math.max(3, size * 0.14), join: 'round' },
    dropShadow: { color: TONE_INK[tone].deep, alpha: 1, blur: 0, distance: size * 0.08, angle: Math.PI / 2 },
    letterSpacing: size * 0.03,
    padding: size * 0.24,
    align: 'center',
    ...extra,
    ...scriptSafe(extra),
  });
}

/**
 * Script-aware overrides: joined scripts (Arabic, Devanagari) break under letter spacing, and
 * CJK has no spaces, so wrapped text must be allowed to break inside words.
 */
function scriptSafe(extra: Partial<TextStyleOptions>): Partial<TextStyleOptions> {
  const o: Partial<TextStyleOptions> = {};
  if (joinedScript) o.letterSpacing = 0;
  if (extra.wordWrap && cjkScript) o.breakWords = true;
  return o;
}

export function makeText(text: string, style: TextStyle, anchor = 0.5): Text {
  const t = new Text({ text, style, resolution: Math.min(2, window.devicePixelRatio || 1) });
  t.anchor.set(anchor);
  return t;
}

/* ---------------------------------------------------------------------------------------------
 * Bitmap numerals API (unchanged for callers)
 * ------------------------------------------------------------------------------------------- */

/**
 * Bitmap numerals are laid out at one base size per tone (a single glyph set per colour, built
 * once at boot) and scaled to the size needed.
 */
export const NUM_BASE = 96;
const numStyles = new Map<NumTone, TextStyle>();
/** Style for BitmapText showing our numerals in `tone` (font size NUM_BASE; scale by size / NUM_BASE). */
export function numBaseStyle(tone: NumTone): TextStyle {
  let s = numStyles.get(tone);
  if (!s) {
    ensureFont(NUM_FAMILY(tone), tone, FONT_DISPLAY, true, [numCss(tone)]);
    s = new TextStyle({ fontFamily: NUM_FAMILY(tone), fontSize: NUM_BASE, fill: 0xffffff, letterSpacing: NUM_BASE * 0.01, padding: 0 });
    numStyles.set(tone, s);
  }
  return s;
}
const cartoonStyles = new Map<NumTone, TextStyle>();
/** Style for BitmapText cartoon lettering (Luckiest Guy with the treatment baked in). */
export function cartoonBaseStyle(tone: NumTone): TextStyle {
  let s = cartoonStyles.get(tone);
  if (!s) {
    ensureFont(CART_FAMILY(tone), tone, FONT_CARTOON, false);
    s = new TextStyle({ fontFamily: CART_FAMILY(tone), fontSize: NUM_BASE, fill: 0xffffff, letterSpacing: joinedScript ? 0 : NUM_BASE * 0.03, padding: 0 });
    cartoonStyles.set(tone, s);
  }
  return s;
}

/** Numerals (or cartoon lettering) at a given on-screen font size, centred. */
export function bitmapNum(text: string, tone: NumTone, size: number, cartoon = false): BitmapText {
  const t = new BitmapText({ text, style: cartoon ? cartoonBaseStyle(tone) : numBaseStyle(tone) });
  t.anchor.set(0.5);
  t.scale.set(size / NUM_BASE);
  return t;
}

const WARM_CHARS = NUMERALS + ' KM';
/** The cartoon bitmap banners in the player's language, plus digits and signs. */
const warmCartoon = () => [t('tantrum'), t('hounds', { n: 4 }), t('inferno'), t('plusFreeSpins', { n: 5 }), t('freeSpinsCaps', { n: 10 }), '0123456789x+!'].join(' ');
/** Build every glyph atlas up front so no glyph generation happens mid-animation. */
/**
 * Paint every numeral and cartoon glyph into the bitmap atlases and upload them, a slice at a time:
 * `pause` (one frame at boot) runs between slices, so the loading screen keeps animating and no
 * single frame carries all the uploads.
 */
export async function warmFonts(renderer: Renderer, pause: () => Promise<void> = () => Promise.resolve()) {
  const t0 = performance.now();
  let sliceT = t0;
  const slice = async () => {
    if (performance.now() - sliceT < 12) return;
    await pause();
    sliceT = performance.now();
  };
  const rt = RenderTexture.create({ width: 4, height: 4 });
  const numTones: NumTone[] = ['white', 'gold', 'green', 'crimson', 'fire', 'sea'];
  const cartoonTones: NumTone[] = ['fire', 'white', 'sea'];
  const cartoon = warmCartoon();
  // glyph by glyph across the tones, so each glyph's masks are built once (see buildMasks)
  const fontOf = (style: TextStyle) => Cache.get(`${style.fontFamily as string}-bitmap`) as TreatedFont;
  const numFonts = numTones.map((tn) => fontOf(numBaseStyle(tn)));
  const cartoonFonts = cartoonTones.map((tn) => fontOf(cartoonBaseStyle(tn)));
  for (const ch of new Set(CanvasTextMetrics.graphemeSegmenter(WARM_CHARS))) {
    for (const f of numFonts) f.ensureCharacters(ch);
    await slice();
  }
  for (const ch of new Set(CanvasTextMetrics.graphemeSegmenter(cartoon))) {
    for (const f of cartoonFonts) f.ensureCharacters(ch);
    await slice();
  }
  // the Captain's Wheel reveals words in the numeral faces (KEG DROP in sea, BROADSIDE in crimson),
  // in the player's language: their letters are drawn now, not mid-reveal
  fontOf(numBaseStyle('sea')).ensureCharacters(t('hounds', { n: 4 }));
  fontOf(numBaseStyle('crimson')).ensureCharacters(t('inferno'));
  const made: BitmapText[] = [];
  for (const tone of numTones) made.push(new BitmapText({ text: WARM_CHARS, style: numBaseStyle(tone) }));
  for (const tone of cartoonTones) made.push(new BitmapText({ text: cartoon, style: cartoonBaseStyle(tone) }));
  for (const m of made) {
    void m.width; // lays out glyphs -> draws them into the atlas
    renderer.render({ container: m, target: rt }); // uploads the pages to the GPU now, not mid-spin
    m.destroy();
    await pause(); // one atlas upload per frame
  }
  rt.destroy(true);
  timing.warmFonts = performance.now() - t0;
}

/**
 * Draw the glyphs of `text` into every warmed numeral atlas now (not in the middle of a win):
 * the HUD calls this with the first formatted amount, once the currency is known, so a currency
 * code or symbol we did not draw ("Rp", "zł", "CA$") is ready before the first spin.
 */
export function warmGlyphs(text: string) {
  for (const tone of ['white', 'gold', 'green', 'crimson', 'fire', 'sea'] as NumTone[]) {
    const f = Cache.get(`${numBaseStyle(tone).fontFamily as string}-bitmap`) as TreatedFont | undefined;
    f?.ensureCharacters(text);
  }
}

/** Boot timings of the lettering work (read by QA through the debug hook). */
const timing: Record<string, number> = {};

/* ---------------------------------------------------------------------------------------------
 * Display text: layered banner treatments for localised words
 * ------------------------------------------------------------------------------------------- */

/**
 * - `banner`: the heaviest: carved extrusion, ink | brass keyline | ink, cel-banded face, rim
 *   shade, inline, grain and a shine (big wins, bonus titles).
 * - `title`: extrusion, ink, cel bands, rim shade, inline (card titles, feature names).
 * - `label`: small words (kickers, CTAs, badges): thicker ink relative to size, two bands, no inline.
 * - `ink`: plain ink outline, flat face and an offset ink shadow (tiny text).
 */
export type Treatment = 'banner' | 'title' | 'label' | 'ink';

export interface DisplayOptions {
  /** Font size in CSS px. */
  size: number;
  tone?: NumTone;
  treatment?: Treatment;
  /** cartoon = Luckiest Guy (default, every language); display = Rye. */
  face?: 'cartoon' | 'display';
  /** Wrap to this width (CSS px). CJK breaks inside words. */
  wrapWidth?: number;
  align?: 'left' | 'center' | 'right';
  /** Letter spacing in px (default by treatment; always 0 for joined scripts). */
  letterSpacing?: number;
  /** Line height as a multiple of the size (default 1.08). */
  lineHeight?: number;
  /** Texture resolution (default: device pixel ratio, max 2). */
  res?: number;
}

const TREATMENTS: Record<Treatment, { ink: number; depth: number; keyline: number; rim: number; inline: [number, number] | null; grain: boolean; shine: boolean; shadow: number; track: number }> = {
  banner: { ink: 0.085, depth: 0.085, keyline: 0.035, rim: 0.035, inline: [0.028, 0.048], grain: true, shine: true, shadow: 0.06, track: 0.035 },
  title: { ink: 0.08, depth: 0.07, keyline: 0, rim: 0.032, inline: [0.026, 0.044], grain: true, shine: true, shadow: 0.05, track: 0.03 },
  label: { ink: 0.1, depth: 0.055, keyline: 0, rim: 0.03, inline: null, grain: false, shine: false, shadow: 0, track: 0.03 },
  ink: { ink: 0.11, depth: 0.05, keyline: 0, rim: 0, inline: null, grain: false, shine: false, shadow: 0, track: 0.02 },
};

/**
 * Localised display lettering with a layered treatment, rendered into one texture (a Sprite,
 * anchor 0.5). The texture carries padding for the extrusion, outlines and glyph overhang, so
 * nothing is ever clipped; `inkWidth` / `inkHeight` are the lettering's own box for fitting.
 * Changing `text` or `tone` repaints; destroy() frees the texture.
 */
export class DisplayText extends Sprite {
  private _text: string;
  private o: Required<Omit<DisplayOptions, 'wrapWidth' | 'letterSpacing'>> & Pick<DisplayOptions, 'wrapWidth' | 'letterSpacing'>;
  private canvas = document.createElement('canvas');
  private own: Texture | null = null;
  /** Width and height of the lettering itself (no padding), CSS px. */
  inkWidth = 0;
  inkHeight = 0;

  constructor(text: string, opts: DisplayOptions) {
    super();
    this.anchor.set(0.5);
    this._text = text;
    this.o = { tone: 'white', treatment: 'title', face: 'cartoon', align: 'center', lineHeight: 1.08, res: Math.min(2, window.devicePixelRatio || 1), ...opts };
    this.paint();
  }

  get text() {
    return this._text;
  }
  set text(v: string) {
    if (v === this._text) return;
    this._text = v;
    this.paint();
  }
  get tone() {
    return this.o.tone;
  }
  set tone(t: NumTone) {
    if (t === this.o.tone) return;
    this.o.tone = t;
    this.paint();
  }
  /** Change several options at once (one repaint). */
  restyle(o: Partial<DisplayOptions>) {
    this.o = { ...this.o, ...o };
    this.paint();
  }

  private paint() {
    const o = this.o;
    const T = TREATMENTS[o.treatment];
    const size = o.size;
    const family = o.face === 'display' ? FONT_DISPLAY : FONT_CARTOON;
    const track = joinedScript ? 0 : (o.letterSpacing ?? size * T.track);
    const style = new TextStyle({
      fontFamily: family,
      fontSize: size,
      letterSpacing: track,
      lineHeight: size * o.lineHeight * 1.12,
      wordWrap: !!o.wrapWidth,
      wordWrapWidth: o.wrapWidth ?? 0,
      breakWords: cjkScript,
      align: o.align,
    });
    const m = CanvasTextMetrics.measureText(this._text || ' ', style);
    const font = `${size}px ${family}`;
    const probe = scratch(2, 4, 4);
    probe.font = font;
    const capH = probe.measureText('H').actualBoundingBoxAscent || size * 0.7;
    // true ink extents of every line (glyph overhang included)
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    const lines = m.lines.map((line, i) => {
      const lm = probe.measureText(line || ' ');
      const lw = m.lineWidths[i];
      const x = o.align === 'center' ? (m.maxLineWidth - lw) / 2 : o.align === 'right' ? m.maxLineWidth - lw : 0;
      const base = i * m.lineHeight + m.fontProperties.ascent;
      top = Math.min(top, base - Math.max(lm.actualBoundingBoxAscent, capH));
      bottom = Math.max(bottom, base + lm.actualBoundingBoxDescent);
      left = Math.min(left, x - Math.max(0, lm.actualBoundingBoxLeft));
      right = Math.max(right, x + Math.max(lw, lm.actualBoundingBoxRight + track * Math.max(0, line.length - 1)));
      return { text: line, x, base };
    });
    const ink = size * T.ink;
    const depth = size * T.depth;
    const outer = ink + (T.keyline ? size * T.keyline + ink * 0.55 : 0);
    const padL = outer + size * 0.06 + T.shadow * size;
    const padR = outer + depth * 0.2 + size * 0.06 + T.shadow * size;
    const padT = outer + size * 0.06;
    const padB = outer + depth + size * 0.06 + T.shadow * size * 1.5;
    const W = right - left + padL + padR;
    const H = bottom - top + padT + padB;
    // paint in device px: every length times res (an unset or absurd res falls back to the default)
    const r = Number.isFinite(o.res) && o.res > 0 && o.res <= 4 ? o.res : Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(2, Math.ceil(W * r));
    const chh = Math.max(2, Math.ceil(H * r));
    this.canvas.width = cw;
    this.canvas.height = chh;
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, chh);
    const ox = (padL - left) * r;
    const oy = (padT - top) * r;
    const fontPx = `${size * r}px ${family}`;
    const setFont = (c: CanvasRenderingContext2D) => {
      c.font = fontPx;
      c.textBaseline = 'alphabetic';
      (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${track * r}px`;
    };
    const shape: Paintable = {
      fill(c, dx, dy) {
        setFont(c);
        for (const l of lines) c.fillText(l.text, ox + l.x * r + dx, oy + l.base * r + dy);
      },
      stroke(c, w, dx, dy) {
        setFont(c);
        c.lineWidth = w;
        for (const l of lines) c.strokeText(l.text, ox + l.x * r + dx, oy + l.base * r + dy);
      },
    };
    const capR = capH * r;
    const layers: Layers = {
      ink: ink * r,
      depth: depth * r,
      dir: [0.2, 1],
      keyline: T.keyline * size * r,
      rim: T.rim * size * r,
      inline: T.inline ? [T.inline[0] * size * r, T.inline[1] * size * r] : null,
      shadow: T.shadow * size * r,
      grain: T.grain,
      band: (c, which) => {
        // per line: the highlight over the top of the caps, the shade across their foot
        for (let i = 0; i < lines.length; i++) {
          const capTop = oy + lines[i].base * r - capR;
          const lineTop = i === 0 ? 0 : oy + lines[i - 1].base * r;
          if (which === 'light') c.fillRect(0, lineTop, cw, capTop + capR * (o.treatment === 'label' ? 0.5 : 0.4) - lineTop);
          else c.fillRect(0, capTop + capR * 0.74, cw, capR * 0.26 + Math.max(capR * 0.4, 0));
        }
      },
      glints: T.shine
        ? (c) => {
            c.globalAlpha = 0.55;
            for (const l of lines) c.fillRect(0, oy + l.base * r - capR * 0.84, cw, Math.max(1, capR * 0.055));
            c.globalAlpha = 1;
          }
        : undefined,
    };
    paintLayers(ctx, cw, chh, shape, layers, TONE_INK[o.tone]);
    this.inkWidth = right - left;
    this.inkHeight = bottom - top;
    // texture: reuse the source when the size is unchanged, else a fresh one (the old one freed)
    if (this.own && this.own.source.pixelWidth === cw && this.own.source.pixelHeight === chh) {
      this.own.source.update();
    } else {
      const old = this.own;
      this.own = new Texture({ source: new ImageSource({ resource: this.canvas, resolution: r, alphaMode: 'premultiply-alpha-on-upload' }) });
      this.texture = this.own;
      if (old && !old.destroyed) old.destroy(true);
    }
    // the anchor centres the lettering box, not the padded canvas
    this.anchor.set((padL + (right - left) / 2) / W, (padT + (bottom - top) / 2) / H);
  }

  override destroy(options?: DestroyOptions) {
    const t = this.own;
    this.own = null;
    super.destroy(options);
    if (t && !t.destroyed) t.destroy(true);
  }
}

/** A DisplayText (see DisplayOptions for the treatments). */
export function displayText(text: string, opts: DisplayOptions): DisplayText {
  return new DisplayText(text, opts);
}

// QA hook (debug builds only): the lettering helpers, for review sheets and tools/qa scripts
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as Record<string, unknown>).__pkText = { DisplayText, displayText, bitmapNum, TONE_INK, buildGlyph, timing };
}
