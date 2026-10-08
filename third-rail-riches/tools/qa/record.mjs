// Record a real video of a scenario, then tile frames into contact sheets for review.
// Usage: node tools/qa/record.mjs <name> <WxH> <seconds> '<js action>' [fps=8] [cols=8]
// Also samples in-page frame times (rAF) during the recording and reports fps stats.
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [name = 'rec', size = '1440x900', secsS = '8', action = '', fpsS = '8', colsS = '8'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const secs = Number(secsS);
const url = process.env.URL ?? 'http://127.0.0.1:5318/?debug';
const dir = `tools/qa/out/${name}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: w, height: h } } });
const tCtx = Date.now();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('gone'), null, { timeout: 180000 });
if (!process.env.KEEP_SPLASH) {
  await page.waitForTimeout(800);
  await page.mouse.click(w / 2, h / 2); // dismiss splash
}
await page.waitForTimeout(Number(process.env.SETTLE ?? 2500));
const tStart = Date.now();
const actionOffset = (tStart - tCtx) / 1000;
await page.evaluate(() => {
  const w = window;
  w.__ft = [];
  let last = performance.now();
  const loop = (t) => {
    w.__ft.push(t - last);
    last = t;
    if (w.__ftOn) requestAnimationFrame(loop);
  };
  w.__ftOn = true;
  requestAnimationFrame(loop);
  w.__loaf = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 60) continue;
        w.__loaf.push({
          t: Math.round(e.startTime),
          d: Math.round(e.duration),
          scripts: (e.scripts || []).slice(0, 4).map((s) => `${s.invoker || ''} ${Math.round(s.duration)}ms ${(s.sourceFunctionName || '')} ${(s.sourceURL || '').split('/').slice(-2).join('/')}:${s.sourceCharPosition ?? ''}`),
          render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0),
          style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (err) {
    w.__loaf.push({ err: String(err) });
  }
});
if (action) await page.evaluate(action);
const clicks = (process.env.CLICKS ?? '').split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
let waited = 0;
for (const at of clicks) {
  if (at > waited) await page.waitForTimeout(at - waited);
  waited = at;
  await page.mouse.click(w / 2, h * 0.5);
}
await page.waitForTimeout(Math.max(0, secs * 1000 - waited));
const ft = await page.evaluate(() => {
  window.__ftOn = false;
  return window.__ft;
});
const loaf = (await page.evaluate(() => window.__loaf)) ?? [];
if (loaf.length) console.log('LONG FRAMES:', JSON.stringify(loaf.sort((a, b) => b.d - a.d).slice(0, 6), null, 1));
await ctx.close();
await browser.close();
const vid = readdirSync(dir).find((f) => f.endsWith('.webm'));
renameSync(`${dir}/${vid}`, `${dir}/video.webm`);
// the video starts when the page is created; skip to the action
const startAt = Math.max(0, actionOffset - 0.2);
const fps = Number(fpsS);
const cols = Number(colsS);
const perSheet = cols * Math.ceil((fps * 2) / cols) * 2; // ~4 s per sheet at 8fps
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(startAt), '-i', `${dir}/video.webm`, '-vf', `fps=${fps},scale=${Math.round(w / 3.2)}:-1`, `${dir}/fr%04d.png`]);
const frames = readdirSync(dir).filter((f) => f.startsWith('fr')).length;
let sheetIdx = 0;
for (let i = 0; i < frames; i += perSheet) {
  const rows = Math.ceil(Math.min(perSheet, frames - i) / cols);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-start_number', String(i + 1), '-i', `${dir}/fr%04d.png`, '-frames:v', '1', '-vf', `tile=${cols}x${rows}:padding=4:color=0x222222`, `${dir}/sheet${sheetIdx++}.png`]);
}
const sorted = [...ft].sort((a, b) => a - b);
const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]?.toFixed(1);
const avgFps = ft.length ? (1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1) : 'n/a';
const long = ft.filter((x) => x > 34).length;
console.log(`${dir}: ${frames} frames, ${sheetIdx} sheets | rAF avg ${avgFps}fps p50 ${p(0.5)}ms p95 ${p(0.95)}ms max ${p(1)}ms, >34ms frames ${long}/${ft.length}`, errors.length ? `ERRORS: ${errors.slice(0, 4).join(' | ')}` : 'no errors');
