/**
 * Art review sheet: renders every illustration to a PNG contact sheet so it can be
 * inspected at full resolution.
 *
 *   npx tsx tools/art/sheet.ts [group] [scale] [outName]
 *
 * Groups: symbols (every symbol with its blink / win / hot frames and win-frame strips),
 * reel (the set on the dark hold at 90 and 128 px, win-frame strips + onion skin),
 * bomb (Kaboom Bomb states and frames beside the keg), sea, critters, crew, rig, scene, props,
 * dev (scratch view of the symbols in $DEV, e.g. DEV=4,11); `all` = symbols + an `all` group file.
 * Frame QA (bounds, edge clipping, raster time): npx tsx tools/art/bounds.ts [px].
 * Output: tools/art/out/<outName ?? group>.png, or under $SHEET_OUT when set
 * (e.g. SHEET_OUT=tools/qa/out/D).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { SYMBOL_ART } from '../../src/art/symbols';

const group = process.argv[2] ?? 'symbols';
const scale = Number(process.argv[3] ?? 1);
const outName = process.argv[4] ?? group;
const outDir = resolve(process.env.SHEET_OUT ?? 'tools/art/out');
mkdirSync(outDir, { recursive: true });

type Item = { label: string; svg: string; w?: number; bg?: string };
const items: Item[] = [];

/** Symbol ids (math/types Sym): 0-3 lows, 4-7 critters, 8 captain, 9 keg wild, 10 chest scatter, 11 Kaboom Bomb. */
const SYMBOL_NAMES = ['anchor', 'shell', 'map', 'compass', 'crab', 'octopus', 'shark', 'parrot', 'captain', 'keg', 'chest', 'bomb'];

type Art = { idle: () => string; blink?: () => string; win?: () => string; hot?: () => string; winFrames?: (() => string)[]; idleFrames?: (() => string)[]; hotFrames?: (() => string)[] };

if (group === 'symbols' || group === 'all') {
  const art = SYMBOL_ART as Record<number, Art>;
  const ids = Object.keys(art)
    .map(Number)
    .sort((a, b) => a - b);
  for (const i of ids) {
    const a = art[i];
    const n = SYMBOL_NAMES[i] ?? `sym ${i}`;
    items.push({ label: `${i} ${n} idle`, svg: a.idle() });
    if (a.blink) items.push({ label: `${n} blink`, svg: a.blink() });
    if (a.win) items.push({ label: `${n} win/alt`, svg: a.win() });
    if (a.hot) items.push({ label: `${n} hot`, svg: a.hot() });
    a.winFrames?.forEach((f, k) => items.push({ label: `${n} win frame ${k + 1}`, svg: f(), w: 180 }));
    a.idleFrames?.forEach((f, k) => items.push({ label: `${n} idle frame ${k + 1}`, svg: f(), w: 180 }));
    a.hotFrames?.forEach((f, k) => items.push({ label: `${n} hot frame ${k + 1}`, svg: f(), w: 180 }));
  }
}

const extra = await (async () => {
  try {
    const m = await import(`./groups/${group}.ts`);
    return (m.default as () => Item[])();
  } catch (e) {
    if ((e as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw e;
    return [] as Item[];
  }
})();
items.push(...extra);

const cell = (it: Item) => `
  <figure style="margin:0;display:flex;flex-direction:column;align-items:center;gap:6px">
    <div style="width:${it.w ?? 256}px;background:${it.bg ?? 'linear-gradient(#1d1a1b,#121011)'};border-radius:10px;display:flex;align-items:center;justify-content:center;padding:8px">${it.svg}</div>
    <figcaption style="font:12px/1.2 -apple-system,sans-serif;color:#aaa">${it.label}</figcaption>
  </figure>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#2b2829;padding:20px}
.grid{display:flex;flex-wrap:wrap;gap:18px}
svg{display:block;max-width:100%;height:auto}
</style></head><body><div class="grid">${items.map(cell).join('')}</div></body></html>`;

const htmlPath = resolve(outDir, `${outName}.html`);
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1480, height: 900 }, deviceScaleFactor: scale });
await page.goto('file://' + htmlPath, { timeout: 240000 });
await page.waitForTimeout(300);
const png = resolve(outDir, `${outName}.png`);
await page.screenshot({ path: png, fullPage: true, timeout: 240000 });
await browser.close();
console.log(png);
