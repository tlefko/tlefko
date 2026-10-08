// Full-resolution screenshots of the running game at several viewports.
// Usage: node tools/qa/shot.mjs [url] [WxH[@dpr],...] [waitMs] [outPrefix] [evalJs]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5318/';
const sizes = (process.argv[3] ?? '1440x900').split(',');
const waitMs = Number(process.argv[4] ?? 4000);
const prefix = process.argv[5] ?? 'shot';
const evalJs = process.argv[6];
mkdirSync('tools/qa/out', { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-gpu-rasterization'] });
for (const s of sizes) {
  const [wh, dpr] = s.split('@');
  const [w, h] = wh.split('x').map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(dpr ?? 1) });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(waitMs);
  if (process.env.DISMISS) {
    await page.mouse.click(w / 2, h / 2); // dismiss splash
    await page.waitForTimeout(2800);
  }
  if (evalJs) {
    await page.evaluate(evalJs);
    await page.waitForTimeout(Number(process.env.AFTER ?? 1500));
  }
  const path = `tools/qa/out/${prefix}-${w}x${h}${dpr ? '@' + dpr : ''}.png`;
  await page.screenshot({ path, timeout: 120000 });
  console.log(path, errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no errors');
  await page.close();
}
await browser.close();
