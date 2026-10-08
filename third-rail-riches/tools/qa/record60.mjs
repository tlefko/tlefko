// Frame-accurate recorder (track G): plays a scenario on a virtual clock and screenshots every
// frame, so the result is a true 60 fps (or any fps) capture however loaded the machine is, then
// tiles labelled contact sheets. (record.mjs uses Playwright's video, which is fixed at 25 fps.)
//
// The page's clock is virtualised from the moment the action runs: performance.now, Date.now,
// requestAnimationFrame and setTimeout advance 1/fps per captured frame, so GSAP, the game loop
// and every timer step exactly one frame between screenshots.
//
// Usage:
//   node tools/qa/record60.mjs <name> <WxH> <maxSeconds> '<js action>' [options]
//   URL=http://127.0.0.1:5420/?debug node tools/qa/record60.mjs chain 1440x900 12 \
//     "window.__ll.forceBook(7120); window.__ll.ctrl.spinPressed()" --sheet-fps 20 --crop board
// Options:
//   --fps 60              capture rate (frames per virtual second)
//   --speed normal|turbo|super
//   --quality low|high    adds ?quality=... for this load
//   --lang xx             adds &lang=xx
//   --dpr 1               device scale factor
//   --capw 1100           screenshot width (px) of the full frame
//   --wait round|time     stop when the round is over (+ --tail s), or after maxSeconds
//   --tail 0.6            seconds kept after the round ends
//   --slam-at ms          press spin again this long after the action (slam test)
//   --sheet-fps 20        contact-sheet sampling rate (0 = no sheets)
//   --from ms --to ms     sheet window (ms after the action)
//   --crop board|frame|full|x,y,w,h   sheet crop (CSS px of the page)
//   --cols 6 --rows 6 --thumb 260     sheet grid and thumbnail width
//   --keep-raw            keep every captured frame (raw/*.jpg); deleted by default to save disk
// Output: tools/qa/out/<name>/ sheet-NN.png, meta.json (frames, beats, errors). Beat labels
// (grid.*, pres.*, meter.*) are printed under the thumbnail of the frame they started in.
import { chromium } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pos = [];
const opt = { fps: '60', speed: 'normal', quality: '', lang: '', dpr: '1', capw: '1100', wait: 'round', tail: '0.6', 'slam-at': '', 'sheet-fps': '20', from: '', to: '', crop: 'board', cols: '6', rows: '6', thumb: '260', 'keep-raw': '', q: '72' };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1';
    opt[k] = v;
  } else pos.push(a);
}
const [name = 'rec60', size = '1440x900', maxS = '20', action = ''] = pos;
const [W, H] = size.split('x').map(Number);
let url = process.env.URL ?? 'http://127.0.0.1:5318/?debug';
if (opt.lang) url += `${url.includes('?') ? '&' : '?'}lang=${opt.lang}`;
if (opt.quality) url += `${url.includes('?') ? '&' : '?'}quality=${opt.quality}`;
const dir = resolve(`tools/qa/out/${name}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(`${dir}/raw`, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(opt.dpr) });
await ctx.addInitScript(() => {
  const realNow = performance.now.bind(performance);
  const realDate = Date.now.bind(Date);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCaf = window.cancelAnimationFrame.bind(window);
  const realST = window.setTimeout.bind(window);
  const realCT = window.clearTimeout.bind(window);
  let on = false;
  let vNow = 0;
  let dOff = 0;
  const raf = new Map();
  let rafId = 1e7;
  const timers = new Map();
  let tid = 1e7;
  performance.now = () => (on ? vNow : realNow());
  Date.now = () => (on ? vNow + dOff : realDate());
  window.requestAnimationFrame = (cb) => {
    if (!on) return realRaf(cb);
    const id = rafId++;
    raf.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => (raf.has(id) ? raf.delete(id) : realCaf(id));
  window.setTimeout = (fn, ms = 0, ...args) => {
    if (!on || typeof fn !== 'function') return realST(fn, ms, ...args);
    const id = tid++;
    timers.set(id, { at: vNow + Math.max(0, Number(ms) || 0), fn, args });
    return id;
  };
  window.clearTimeout = (id) => (timers.has(id) ? timers.delete(id) : realCT(id));
  window.__vt = {
    start() {
      vNow = realNow();
      dOff = realDate() - vNow;
      on = true;
    },
    step(ms) {
      const end = vNow + ms;
      for (;;) {
        let best = null;
        for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best[1].at)) best = [id, t];
        if (!best) break;
        timers.delete(best[0]);
        vNow = Math.max(vNow, best[1].at);
        try {
          best[1].fn(...best[1].args);
        } catch (e) {
          console.error(String(e));
        }
      }
      vNow = end;
      const q = [...raf];
      raf.clear();
      for (const [, cb] of q) {
        try {
          cb(vNow);
        } catch (e) {
          console.error(String(e));
        }
      }
    },
    stop() {
      on = false;
      const q = [...raf];
      raf.clear();
      for (const [, cb] of q) realRaf(cb);
      for (const [, t] of timers) realST(t.fn, 0, ...t.args);
      timers.clear();
    },
  };
});
const page = await ctx.newPage();
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : logs.push(`${m.type()}: ${m.text()}`)));
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__ll && (!document.getElementById('boot') || document.getElementById('boot').classList.contains('gone')), null, { timeout: 180000 });
await page.waitForTimeout(800);
await page.mouse.click(W / 2, H / 2);
await page.waitForFunction(() => !window.__ll.ctrl.busy, null, { timeout: 60000 });
await page.evaluate((mode) => {
  const { ctrl, scene } = window.__ll;
  ctrl.qaAuto = true;
  let guard = 0;
  while (document.querySelector('.turbo-btn')?.dataset.mode !== mode && guard++ < 5) ctrl.cycleTurbo();
  // the crew bounces on the audio clock: put them on the (virtual) page clock
  const beat = () => ({ phase: (performance.now() / 1000 / (60 / 90)) % 1, bpm: 90 });
  scene.captain.getBeat = beat;
  scene.parrot.getBeat = beat;
}, opt.speed);
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const w = window;
  w.__beats = [];
  const now = () => performance.now();
  const wrap = (obj, label, keys) => {
    for (const k of keys) {
      const f = obj?.[k];
      if (typeof f !== 'function') continue;
      obj[k] = function (...a) {
        w.__beats.push([`${label}.${k}`, now()]);
        const r = f.apply(this, a);
        if (r && typeof r.then === 'function') r.then(() => w.__beats.push([`${label}.${k}:end`, now()]));
        return r;
      };
    }
  };
  const { scene, ctrl } = w.__ll;
  wrap(scene.grid, 'grid', ['spinIn', 'celebrate', 'undim', 'ignite', 'blasts', 'pop', 'cascade', 'placeWilds', 'throwBomb', 'growBombs', 'tickFuses']);
  wrap(ctrl.presenter, 'pres', ['spin', 'wheel', 'fsTrigger', 'bonus', 'bigWin', 'retrigger', 'maxWin', 'bombBoom', 'kegBoom']);
  wrap(scene.meter, 'meter', ['fill', 'erupt']);
  wrap(scene.captain, 'cap', ['throwBomb']);
});
const cdp = await ctx.newCDPSession(page);
const capw = Number(opt.capw);
const fps = Number(opt.fps);
const dt = 1000 / fps;
await page.evaluate(() => window.__vt.start());
const t0 = await page.evaluate(() => performance.now());
const info = await page.evaluate((action) => {
  const w = window;
  const L = w.__ll.scene.L;
  const r = { rounds: w.__ll.ctrl.rounds, frame: L.frame, grid: L.grid, winBar: L.winBar, W: L.W, H: L.H, S: L.S };
  (0, eval)(action);
  return r;
}, action);
const frames = [];
let doneAt = -1;
const slamAt = opt['slam-at'] ? Number(opt['slam-at']) : -1;
for (let f = 0; f < Math.round(Number(maxS) * fps); f++) {
  await page.evaluate((ms) => window.__vt.step(ms), dt);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Number(opt.q), clip: { x: 0, y: 0, width: W, height: H, scale: capw / W } });
  writeFileSync(`${dir}/raw/${String(f).padStart(6, '0')}.jpg`, Buffer.from(shot.data, 'base64'));
  frames.push({ i: f, rel: Math.round((f + 1) * dt) });
  if (slamAt >= 0 && Math.abs((f + 1) * dt - slamAt) < dt / 2) await page.evaluate(() => window.__ll.ctrl.spinPressed());
  if (opt.wait === 'round' && doneAt < 0 && f % 6 === 0) {
    if (await page.evaluate((n) => window.__ll.ctrl.rounds > n && !window.__ll.ctrl.busy, info.rounds)) doneAt = f;
  }
  if (doneAt >= 0 && f - doneAt > Number(opt.tail) * fps) break;
}
const beats = (await page.evaluate(() => window.__beats)).map(([k, t]) => [k, Math.round(t - t0)]);
await page.evaluate(() => window.__vt.stop());
const last = await page.evaluate(() => window.__ll.ctrl.lastRound ?? null);
writeFileSync(`${dir}/meta.json`, JSON.stringify({ name, url, W, H, fps, capw, info, frames, beats, errors, logs, last }));

// contact sheets: an HTML page of labelled, cropped thumbnails, screenshotted
const sheets = [];
const sfps = Number(opt['sheet-fps']);
if (sfps > 0 && frames.length) {
  const S = info.S;
  const F = info.frame;
  let crop;
  if (opt.crop === 'full') crop = [0, 0, W, H];
  else if (opt.crop === 'frame') crop = [F.x - S * 0.35, F.y - S * 0.35, F.w + S * 0.7, F.h + S * 0.7];
  else if (opt.crop === 'board') {
    const top = Math.max(0, Math.min(F.y - S * 1.45, info.winBar.y - S * 0.1));
    crop = [F.x - S * 0.5, top, F.w + S, F.y + F.h + S * 0.3 - top];
  } else crop = opt.crop.split(',').map(Number);
  const [cx, cy, cw, ch] = crop.map((v) => Math.max(0, v));
  const thumb = Number(opt.thumb);
  const th = Math.round((thumb * ch) / cw);
  const k = capw / W; // raw frame px per CSS px
  const from = opt.from ? Number(opt.from) : 0;
  const to = opt.to ? Number(opt.to) : frames[frames.length - 1].rel;
  const picks = [];
  for (let t = from; t <= to; t += 1000 / sfps) {
    const f = frames.reduce((best, fr) => (fr.rel <= t + 0.5 ? fr : best), frames[0]);
    const tags = beats.filter(([, bt]) => bt > t - 1000 / sfps && bt <= t).map(([bk]) => bk.replace(/^grid\.|^pres\./, ''));
    picks.push({ t: Math.round(t), i: f.i, tags });
  }
  const cols = Number(opt.cols);
  const per = cols * Number(opt.rows);
  const sp = await ctx.newPage();
  for (let s = 0; s * per < picks.length; s++) {
    const cells = picks
      .slice(s * per, (s + 1) * per)
      .map(
        (p) => `<div class="c" style="width:${thumb}px;height:${th}px"><img src="raw/${String(p.i).padStart(6, '0')}.jpg" style="width:${(capw / (cw * k)) * thumb}px;left:${-(cx * k) * (thumb / (cw * k))}px;top:${-(cy * k) * (thumb / (cw * k))}px"><b>${p.t}</b>${p.tags.length ? `<i>${p.tags.join(' ').slice(0, 44)}</i>` : ''}</div>`,
      )
      .join('');
    const html = `<html><head><style>body{margin:0;background:#202020;font:bold 12px Arial,sans-serif;width:${cols * (thumb + 3) + 3}px}.g{display:flex;flex-wrap:wrap;gap:3px;padding:3px}.c{position:relative;overflow:hidden;background:#000}.c img{position:absolute}.c b{position:absolute;left:0;top:0;background:#000;color:#fff;padding:1px 4px}.c i{position:absolute;left:0;bottom:0;background:#7a1414;color:#ffffc8;padding:1px 3px;font:11px Arial,sans-serif}</style></head><body><div class="g">${cells}</div></body></html>`;
    const file = `${dir}/sheet-${String(s).padStart(2, '0')}.html`;
    writeFileSync(file, html);
    await sp.setViewportSize({ width: cols * (thumb + 3) + 3, height: 400 });
    await sp.goto(`file://${file}`);
    await sp.waitForLoadState('load');
    await sp.screenshot({ path: file.replace('.html', '.png'), fullPage: true });
    rmSync(file);
    sheets.push(file.replace('.html', '.png'));
  }
}
await ctx.close();
await browser.close();
if (!opt['keep-raw']) rmSync(`${dir}/raw`, { recursive: true, force: true });
const spin = beats.filter(([k]) => k === 'pres.spin' || k === 'pres.spin:end');
console.log(`${name}: ${frames.length} frames at ${fps} fps (virtual ${(frames.length / fps).toFixed(1)} s) | first spin ${spin.length >= 2 ? spin[1][1] - spin[0][1] : '-'} ms | round over at ${doneAt >= 0 ? Math.round((doneAt + 1) * dt) : '-'} ms | errors ${errors.length} console ${logs.length}`);
for (const s of sheets) console.log(s);
if (errors.length) console.log('ERRORS:', errors.slice(0, 5).join(' | '));
if (logs.length) console.log('CONSOLE:', logs.slice(0, 5).join(' | '));
process.exit(errors.length ? 1 : 0);
