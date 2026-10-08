// In-game symbol review: loads the running game with ?debug, dismisses the splash, captures the
// reels at rest, then plays M's bomb scenarios (window.__ll.ctrl.devBomb) and captures a frame
// sequence of the reels so win frames, the bomb (idle / hot) and blasts can be checked on the
// real dark reels.
// Usage: node tools/art/ingame.mjs <url> <outDir> [WxH@dpr] [scenario,scenario...] [frames] [everyMs]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5440/?debug';
const out = process.argv[3] ?? 'tools/qa/out/D';
const [wh, dprS] = (process.argv[4] ?? '1440x900@2').split('@');
const [w, h] = wh.split('x').map(Number);
const dpr = Number(dprS ?? 1);
const scenarios = (process.argv[5] ?? 'natural').split(',').filter(Boolean);
const frames = Number(process.argv[6] ?? 16);
const every = Number(process.argv[7] ?? 300);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-gpu-rasterization'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
// skip the intro carousel (the player's own "Don't show again"), then tap PLAY until the splash hands over
await page.addInitScript(() => {
  try {
    localStorage.setItem('third-rail-riches.intro.skip', '1');
  } catch {
    /* no storage */
  }
});
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => !!window.__ll?.scene?.L, null, { timeout: 180000 });
await page.waitForTimeout(2500);
for (let i = 0; i < 12; i++) {
  const up = await page.evaluate(() => !!window.__ll?.splash?.());
  if (!up) break;
  await page.mouse.click(w / 2, h * 0.8);
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(2500);
const clip = await page.evaluate(() => {
  const g = window.__ll.scene.L.grid;
  const pad = window.__ll.scene.L.S * 0.12;
  return { x: Math.max(0, g.x - pad), y: Math.max(0, g.y - pad), width: g.w + pad * 2, height: g.h + pad * 2 };
});
const tag = `${w}x${h}@${dpr}`;
await page.screenshot({ path: `${out}/ingame-${tag}-full.png`, timeout: 120000 });
await page.screenshot({ path: `${out}/ingame-${tag}-reels.png`, clip, timeout: 120000 });
console.log('reels', clip, errors.length ? `ERRORS: ${errors.join(' | ')}` : 'no errors');
for (const name of scenarios) {
  // devBomb resolves when the round ends: start it without waiting and film the round
  const r = await page.evaluate((n) => {
    const p = window.__ll.ctrl.devBomb?.(n);
    window.__devDone = false;
    Promise.resolve(p).then((v) => ((window.__devInfo = v), (window.__devDone = true)));
    return !!p;
  }, name);
  console.log('scenario', name, r ? 'started' : 'unavailable');
  for (let i = 0; i < frames; i++) {
    await page.waitForTimeout(every);
    await page.screenshot({ path: `${out}/ingame-${tag}-${name}-${String(i).padStart(2, '0')}.png`, clip, timeout: 120000 });
  }
  await page.waitForTimeout(2500);
}
console.log(errors.length ? `ERRORS: ${errors.slice(0, 8).join(' | ')}` : 'no page errors');
await browser.close();
