// Film strip: perform an action, capture N frames at a fixed interval, tile into a contact sheet.
// Usage: node tools/qa/film.mjs <name> <WxH> <frames> <intervalMs> '<js action>' [preJs]
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name = 'film', size = '1440x900', framesS = '12', intervalS = '350', action = '', pre = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const frames = Number(framesS);
const interval = Number(intervalS);
const url = process.env.URL ?? 'http://127.0.0.1:5318/?debug';
const dir = `tools/qa/out/${name}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.text().startsWith('[boot]')) console.log(m.text());
});
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => document.getElementById('boot') === null || document.getElementById('boot')?.classList.contains('gone'), null, { timeout: 180000 });
if (!process.env.KEEP_SPLASH) {
  await page.waitForTimeout(800);
  await page.mouse.click(w / 2, h / 2); // dismiss splash
}
await page.waitForTimeout(Number(process.env.SETTLE ?? 2500));
if (pre) await page.evaluate(pre);
if (action) await page.evaluate(action);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  const target = t0 + i * interval;
  const d = target - Date.now();
  if (d > 0) await page.waitForTimeout(d);
  await page.screenshot({ path: `${dir}/f${String(i).padStart(3, '0')}.png`, timeout: 60000 });
}
const cols = Number(process.env.COLS ?? 4);
const rows = Math.ceil(frames / cols);
const scaleW = Number(process.env.TILEW ?? 720);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', `${dir}/f%03d.png`, '-vf', `scale=${scaleW}:-1,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', `${dir}/sheet.png`]);
console.log(`${dir}/sheet.png`, errors.length ? `ERRORS: ${errors.slice(0, 5).join(' | ')}` : 'no errors');
await browser.close();
