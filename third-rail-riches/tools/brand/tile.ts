/**
 * Stake game-tile assets for Third Rail Riches, composed from the game's own vector art.
 *   ThirdRailRiches-BG.jpg        the midnight station (no wording)
 *   ThirdRailRiches-FG.png        Conductor Casey and Rivets with the Golden Locomotive and a spray
 *                                 of Fare Coins (transparent)
 *   tile-preview.png              BG + FG + the title lockup (review only)
 *   stake/                        the same BG/FG pair under the names the Stake tile editor gets
 * Usage: npx tsx tools/brand/tile.ts   (TILE=wide for 16:9; TILE_OUT=<dir> to choose the folder,
 * default tools/brand/out)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { stationBackdrop } from '../../src/art/scene';
import { conductorHead } from '../../src/art/conductor';
import { ratHead } from '../../src/art/rat';
import { locoFront, fareCoin, goldenTicketWin } from '../../src/art/specials';
import { logoSvg, LOGO_BOX } from '../../src/art/lettering';

const WIDE = process.env.TILE === 'wide';
const W = WIDE ? 1920 : 1200;
const H = WIDE ? 1080 : 1600;
const out = resolve(process.env.TILE_OUT ?? 'tools/brand/out');
mkdirSync(resolve(out, 'stake'), { recursive: true });
const NAME = 'ThirdRailRiches';

/** Place an SVG string in a w x h box centred at (x, y), rotated. */
function place(svg: string, x: number, y: number, w: number, o: { deg?: number; h?: number; flip?: boolean } = {}): string {
  const h = o.h ?? w;
  const open = svg.match(/<svg[^>]*>/)![0];
  const fixed = open.replace(/ width="[\d.]+"/, '').replace(/ height="[\d.]+"/, '').replace('<svg ', `<svg x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" overflow="visible" `);
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${o.deg ?? 0})${o.flip ? ' scale(-1 1)' : ''}">${svg.replace(open, fixed)}</g>`;
}

const doc = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;

// background: the station at a generous cell size
const S = WIDE ? 150 : 170;
const floorY = H * 0.86;
const bg = stationBackdrop({
  w: W,
  h: H,
  S,
  ceilY: H * 0.05,
  bandY: H * 0.44,
  baseY: H * 0.62,
  lipY: H * 0.76,
  floorY,
  tunnels: [
    { x: -W * 0.04, w: W * 0.26, side: -1 },
    { x: W * 0.78, w: W * 0.26, side: 1 },
  ],
  signals: [
    { x: W * 0.25, y: H * 0.36, h: S * 0.9 },
    { x: W * 0.75, y: H * 0.36, h: S * 0.9 },
  ],
  columns: [
    { x: W * 0.33, w: S * 0.32 },
    { x: W * 0.67, w: S * 0.32 },
  ],
  posters: [{ x: W * 0.42, y: H * 0.2, w: S * 1.3, kind: 1 }],
  signs: [{ x: W * 0.58, y: H * 0.22, w: S * 1.4, kind: 0 }],
  props: [],
  grates: [{ x: W * 0.5, y: floorY, w: S * 1.1 }],
  lamps: [
    { x: W * 0.2, y: H * 0.18 },
    { x: W * 0.8, y: H * 0.18 },
  ],
});

// foreground: the Golden Locomotive in the middle, Casey left, Rivets right, coins flying
const cx = W / 2;
const coins: string[] = [];
const spray: [number, number, number, number, 'gold' | 'silver' | 'platinum' | 'bronze'][] = [
  [-0.33, 0.47, 0.11, -18, 'gold'],
  [0.31, 0.44, 0.1, 22, 'silver'],
  [-0.2, 0.36, 0.08, 10, 'platinum'],
  [0.22, 0.34, 0.085, -12, 'gold'],
  [0.0, 0.31, 0.07, 6, 'bronze'],
  [-0.42, 0.62, 0.075, 30, 'silver'],
  [0.42, 0.6, 0.08, -26, 'gold'],
];
for (const [dx, y, s, deg, m] of spray) coins.push(place(fareCoin(m), cx + dx * W, y * H, s * Math.min(W, H) * 1.6, { deg }));
const fg = [
  ...coins,
  place(goldenTicketWin(), cx + W * 0.27, H * 0.73, Math.min(W, H) * 0.24, { deg: 14 }),
  place(locoFront(true, true), cx, H * 0.6, Math.min(W, H) * 0.62),
  place(conductorHead('laugh'), cx - W * 0.25, H * 0.78, Math.min(W, H) * 0.5, { deg: -6 }),
  place(ratHead('happy', false, 'all'), cx + W * 0.27, H * 0.86, Math.min(W, H) * 0.36, { deg: 8, flip: true }),
].join('');

const logoW = W * (WIDE ? 0.5 : 0.84);
const logoH = logoW * (LOGO_BOX.h / LOGO_BOX.w);
const logo = place(logoSvg({ width: logoW, height: logoH } as never), cx, H * 0.17, logoW, { h: logoH });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
async function shot(svg: string, file: string, type: 'png' | 'jpeg', transparent = false) {
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#000'}">${svg}</body></html>`);
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ type, omitBackground: transparent, ...(type === 'jpeg' ? { quality: 92 } : {}), clip: { x: 0, y: 0, width: W, height: H } });
  writeFileSync(resolve(out, file), buf);
  return buf;
}
const sfx = WIDE ? '-16x9' : '';
const bgBuf = await shot(doc(bg), `${NAME}-BG${sfx}.jpg`, 'jpeg');
const fgBuf = await shot(doc(fg), `${NAME}-FG${sfx}.png`, 'png', true);
writeFileSync(resolve(out, 'stake', `background${sfx}.jpg`), bgBuf);
writeFileSync(resolve(out, 'stake', `foreground${sfx}.png`), fgBuf);
await shot(doc(bg + fg + logo), `tile-preview${sfx}.png`, 'png');
await browser.close();
console.log(`wrote ${out}`);
