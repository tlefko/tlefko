/**
 * Symbol raster QA: rasterises every symbol frame exactly the way the game does
 * (render/textures.ts: SVG blob -> img.decode -> drawImage on a canvas) and reports, per frame,
 * the painted bounding box (alpha above the drop shadow), whether paint touches the canvas edge
 * (it would be clipped on the reels) or only the soft shadow does, how far the frame's box drifts from the idle frame (frames must share one framing)
 * and the raster time.
 *
 *   npx tsx tools/art/bounds.ts [px=160]      (REPEAT=n rasterises each frame n times and keeps
 *   the fastest, which filters out noise from a busy machine)
 */
import { chromium } from '@playwright/test';
import { SYMBOL_ART } from '../../src/art/symbols';

type Art = { idle: () => string; blink?: () => string; win?: () => string; hot?: () => string; winFrames?: (() => string)[]; idleFrames?: (() => string)[] };
const px = Number(process.argv[2] ?? 160);
const repeat = Math.max(1, Number(process.env.REPEAT ?? 1));
const NAMES = ['anchor', 'shell', 'map', 'compass', 'crab', 'octopus', 'shark', 'parrot', 'captain', 'keg', 'chest', 'bomb'];

const jobs: { id: number; label: string; svg: string }[] = [];
for (const [k, a] of Object.entries(SYMBOL_ART as Record<number, Art>)) {
  const id = Number(k);
  const add = (label: string, f?: () => string) => f && jobs.push({ id, label, svg: f() });
  add('idle', a.idle);
  add('blink', a.blink);
  add('win', a.win);
  add('hot', a.hot);
  a.winFrames?.forEach((f, i) => add(`win${i + 1}`, f));
  a.idleFrames?.forEach((f, i) => add(`idle${i + 1}`, f));
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
// tsx keeps function names with a __name() helper that doesn't exist in the page
await page.evaluate('window.__name = (f) => f');
const res = await page.evaluate(
  async ({ jobs, px, repeat }) => {
    const out: { id: number; label: string; ms: number; box: number[]; edge: boolean; soft: boolean; kb: number }[] = [];
    for (const j of jobs) {
      let ms = Infinity;
      let d: Uint8ClampedArray = new Uint8ClampedArray(0);
      for (let r = 0; r < repeat; r++) {
        const t0 = performance.now();
        const url = URL.createObjectURL(new Blob([j.svg], { type: 'image/svg+xml' }));
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = c.height = px;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, px, px);
        d = ctx.getImageData(0, 0, px, px).data;
        ms = Math.min(ms, performance.now() - t0);
        URL.revokeObjectURL(url);
      }
      // paint = alpha above the drop shadow's ceiling (.55); soft = anything visible
      const bbox = (th: number) => {
        let x0 = px, y0 = px, x1 = -1, y1 = -1;
        for (let y = 0; y < px; y++)
          for (let x = 0; x < px; x++)
            if (d[(y * px + x) * 4 + 3] > th) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
        return [x0, y0, x1, y1];
      };
      const k = 256 / px;
      const [x0, y0, x1, y1] = bbox(150);
      const soft = bbox(24);
      out.push({
        id: j.id,
        label: j.label,
        ms,
        box: [x0 * k, y0 * k, (x1 + 1) * k, (y1 + 1) * k].map((v) => Math.round(v)),
        edge: x0 <= 0 || y0 <= 0 || x1 >= px - 1 || y1 >= px - 1,
        soft: soft[0] <= 0 || soft[1] <= 0 || soft[2] >= px - 1 || soft[3] >= px - 1,
        kb: j.svg.length / 1024,
      });
    }
    return out;
  },
  { jobs, px, repeat },
);
await browser.close();

let total = 0;
let worst = 0;
let bad = 0;
const idleBox = new Map<number, number[]>();
for (const r of res) {
  if (r.label === 'idle') idleBox.set(r.id, r.box);
  total += r.ms;
  worst = Math.max(worst, r.ms);
  const ib = idleBox.get(r.id)!;
  const drift = Math.max(...r.box.map((v, i) => Math.abs(v - ib[i])));
  if (r.edge) bad++;
  console.log(
    `${String(r.id).padStart(2)} ${(NAMES[r.id] ?? '?').padEnd(8)} ${r.label.padEnd(6)} box ${r.box.map((v) => String(v).padStart(3)).join(' ')}  drift ${String(drift).padStart(3)}  ${r.edge ? 'PAINT AT EDGE' : r.soft ? 'shadow at edge' : '              '}  ${r.ms.toFixed(1).padStart(6)} ms  ${r.kb.toFixed(0).padStart(4)} KB`,
  );
}
console.log(`\n${res.length} frames at ${px}px: total ${total.toFixed(0)} ms, worst ${worst.toFixed(1)} ms, ${bad} with paint at the edge`);
