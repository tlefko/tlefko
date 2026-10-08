import { Texture } from 'pixi.js';

/**
 * Rasterises SVG art to GPU textures at the exact device-pixel size they are shown at,
 * so every illustration stays crisp at any window size and density.
 */
const cache = new Map<string, Texture>();
/** Raster counters; `log` keeps the most recent rasters (id, ms, page time) for the perf tools. */
export const rasterStats = { count: 0, ms: 0, maxMs: 0, slowest: '', log: [] as { id: string; ms: number; at: number }[] };
if (typeof location !== 'undefined' && /[?&]debug\b/.test(location.search)) (window as unknown as { __pkcRaster?: typeof rasterStats }).__pkcRaster = rasterStats;
const pending = new Map<string, Promise<Texture>>();
/** Rasters started and finished so far (the loading screen follows them during the scene build). */
export const rasterCount = { started: 0, done: 0 };

/**
 * GPU upload hook (the Stage sets it once the renderer exists): every raster goes to the GPU the
 * moment it is made, at layout or prepare time, so its first draw mid-round never stalls on an upload.
 */
let upload: ((t: Texture) => void) | null = null;
export function setTextureUpload(fn: ((t: Texture) => void) | null) {
  upload = fn;
}
function uploadNow(t: Texture) {
  try {
    upload?.(t);
  } catch {
    /* the draw uploads it instead */
  }
}

export async function svgTexture(key: string, svg: string, widthPx: number, heightPx?: number): Promise<Texture> {
  const w = Math.max(8, Math.round(widthPx));
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  const aspect = vb ? vb[3] / vb[2] : 1;
  const h = Math.max(8, Math.round(heightPx ?? w * aspect));
  const id = `${key}@${w}x${h}`;
  const hit = cache.get(id);
  if (hit) return hit;
  const inflight = pending.get(id);
  if (inflight) return inflight;
  rasterCount.started++;
  const p = (async () => {
    const t0 = performance.now();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      // a software canvas: the vector art is rasterised here in the page, not in the GPU process
      // that also composites the page, so rasterising never stalls on-screen animation (the
      // loading screen's fuse, a round in play); the finished bitmap is then one plain upload
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const tex = Texture.from(canvas);
      tex.source.label = id;
      cache.set(id, tex);
      uploadNow(tex);
      const dt = performance.now() - t0;
      rasterStats.count++;
      rasterStats.ms += dt;
      rasterStats.log.push({ id, ms: dt, at: t0 });
      if (rasterStats.log.length > 600) rasterStats.log.splice(0, 200);
      if (dt > rasterStats.maxMs) {
        rasterStats.maxMs = dt;
        rasterStats.slowest = id;
      }
      return tex;
    } finally {
      URL.revokeObjectURL(url);
      pending.delete(id);
      rasterCount.done++;
    }
  })();
  pending.set(id, p);
  return p;
}

/**
 * Destroy a texture this code created. Never Pixi's shared Texture.EMPTY / WHITE: a fresh Sprite
 * holds EMPTY until its real texture arrives, and destroying it breaks every sprite in that state
 * (null texture source on render, which blacked the screen on resize).
 */
export function freeTexture(tex: Texture | null | undefined) {
  if (!tex || tex === Texture.EMPTY || tex === Texture.WHITE || tex.destroyed) return;
  tex.destroy(true);
}

/** Drop cached rasters for a key prefix (after a resize re-raster). */
export function evict(prefix: string, keepIds: Set<string>) {
  for (const [id, tex] of cache) {
    if (id.startsWith(prefix) && !keepIds.has(id)) {
      tex.destroy(true);
      cache.delete(id);
    }
  }
}

/** Procedural canvas texture helper. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  draw(c.getContext('2d')!);
  const t = Texture.from(c);
  uploadNow(t);
  return t;
}

/** Soft round particle / glow sprite texture. */
let softDot: Texture | null = null;
export function softDotTexture(): Texture {
  if (softDot) return softDot;
  softDot = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  return softDot;
}
