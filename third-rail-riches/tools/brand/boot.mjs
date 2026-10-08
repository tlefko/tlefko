// Regenerates public/boot/logo.webp (the loading screen's lockup) from the game's own lettering, using
// a running DEV server (src/art is only served by it):
//   node tools/brand/boot.mjs [devUrl]   (default http://127.0.0.1:5318/)
// The rest of the loading screen (station wall, train, track) is inline CSS/SVG in index.html.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5318/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
const LOGO_W = 960;
const LOGO_H = Math.round(LOGO_W * 0.62);
const dataUrl = await page.evaluate(
  async ({ w, h }) => {
    const svg = (await import('/src/art/lettering.ts')).logoSvg({ width: w, height: h });
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/webp', 0.92);
  },
  { w: LOGO_W, h: LOGO_H },
);
const b = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync('public/boot/logo.webp', b);
console.log('public/boot/logo.webp', `${(b.length / 1024).toFixed(0)} KB`);
await browser.close();
