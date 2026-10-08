// Performance gates and jank hunt on the production preview.
//  - boot: time to playable + bytes over a throttled 4G link
//  - frames during the heaviest rounds in the demo pack: page frame pacing (main-thread jank) and the
//    game's own render pacing (low quality renders at a steady 30), long tasks, textures rasterised
//    mid-round
//  - --trace: a Chrome trace + CPU profile per run, summarised (GC pauses, what fills long tasks,
//    hottest functions)
//
// Usage: node tools/qa/perf.mjs [url] [--profiles=desktop,phone] [--quality=auto|high|low,...]
//          [--scenarios=heavy,bigwin,bonus] [--trace] [--counters] [--out=tools/qa/out/P/perf] [--no-gate]
//  --counters: load-independent work counters per recorded window (WebGL draw calls per rendered
//    frame, Pixi render-list rebuilds per second and their total time, texture uploads, buffer bytes)
//  --idle-before=75: sit idle that long before the rounds (Pixi's GPU GC unloads textures unused for
//    60 s by default; a big moment after a quiet minute then re-uploads them mid-round)
// Profiles: desktop (1440x900@1), desktop4x, desktop6x (1440x900@2 with CPU slowed), phone
// (390x844@3, CPU 4x, 4G), phone6x (CPU 6x). Defaults reproduce the original gate: desktop + phone,
// quality auto, heavy base round.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5319/?debug';
const opt = (k, d) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const flag = (k) => args.includes(`--${k}`);
const PROFILES = {
  desktop: { vp: { width: 1440, height: 900 }, dpr: 1, mobile: false, net: { down: 30, up: 10, rtt: 40 }, gate: { avg: 55, p95: 20, janky: 3 } },
  desktop4x: { vp: { width: 1440, height: 900 }, dpr: 2, mobile: false, cpu: 4, gate: { avg: 40, p95: 40, janky: 12 } },
  desktop6x: { vp: { width: 1440, height: 900 }, dpr: 2, mobile: false, cpu: 6, gate: null },
  phone: { vp: { width: 390, height: 844 }, dpr: 3, mobile: true, cpu: 4, net: { down: 9, up: 3, rtt: 170 }, gate: { avg: 40, p95: 40, janky: 12 } },
  phone6x: { vp: { width: 390, height: 844 }, dpr: 3, mobile: true, cpu: 6, gate: null },
};
const profiles = opt('profiles', 'desktop,phone').split(',');
const qualities = opt('quality', 'auto').split(',');
const scenarios = opt('scenarios', 'heavy').split(',');
const trace = flag('trace');
const counters = flag('counters');
const idleBefore = Number(opt('idle-before', '0')); // seconds idle before the scenarios (GPU GC check)
const gate = !flag('no-gate');
const out = opt('out', 'tools/qa/out/P/perf');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
const report = [];

async function boot(profile, q) {
  const ctx = await browser.newContext({ viewport: profile.vp, deviceScaleFactor: profile.dpr, isMobile: profile.mobile, hasTouch: profile.mobile });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profile.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.net.rtt, downloadThroughput: (profile.net.down * 1024 * 1024) / 8, uploadThroughput: (profile.net.up * 1024 * 1024) / 8 });
  if (profile.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  let bytes = 0;
  cdp.on('Network.loadingFinished', (e) => (bytes += e.encodedDataLength));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // long tasks from the very first script
  await page.addInitScript(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      /* no long task API */
    }
  });
  const u = new URL(url);
  if (q !== 'auto') u.searchParams.set('quality', q);
  const t0 = Date.now();
  await page.goto(u.toString(), { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__ll && document.getElementById('boot')?.classList.contains('gone') !== false, null, { timeout: 300000 });
  const tSplash = Date.now() - t0;
  return { ctx, page, cdp, tSplash, bytesAtSplash: bytes, bytes: () => bytes, errors };
}

/** Start recording page frames (rAF) and the game's rendered frames; returns a stop() that summarises. */
async function record(page) {
  await page.evaluate((counters) => {
    window.__ft = [];
    window.__rf = [];
    window.__ftOn = true;
    let last = performance.now();
    const loop = (t) => {
      window.__ft.push(t - last);
      last = t;
      if (window.__ftOn) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const st = window.__ll.scene.stage;
    let lr = 0;
    window.__rfOff?.();
    window.__rfOff = st.onFrame(() => {
      const n = performance.now();
      if (lr && window.__ftOn) window.__rf.push({ dt: n - lr, work: st.workMs ?? 0 });
      lr = n;
    });
    // load-independent counters: wrap the WebGL context and Pixi's render-list rebuild once
    const r = window.__ll.scene.stage.app.renderer;
    if (counters && !window.__ctr) {
      const c = (window.__ctr = { draws: 0, texUploads: 0, bufBytes: 0, rebuilds: 0, rebuildMs: 0, frames: 0 });
      const gl = r.gl;
      if (gl) {
        for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
          const orig = gl[fn]?.bind(gl);
          if (orig) gl[fn] = (...a) => (c.draws++, orig(...a));
        }
        for (const fn of ['texImage2D', 'texSubImage2D']) {
          const orig = gl[fn]?.bind(gl);
          if (orig) gl[fn] = (...a) => (c.texUploads++, orig(...a));
        }
        for (const fn of ['bufferData', 'bufferSubData']) {
          const orig = gl[fn]?.bind(gl);
          if (orig) gl[fn] = (...a) => ((c.bufBytes += a[1]?.byteLength ?? (typeof a[1] === 'number' ? a[1] : 0)), orig(...a));
        }
      }
      const rg = r.renderGroup;
      const build = rg?._buildInstructions?.bind(rg);
      if (build)
        rg._buildInstructions = (...a) => {
          const t = performance.now();
          const out = build(...a);
          c.rebuilds++;
          c.rebuildMs += performance.now() - t;
          return out;
        };
      window.__ll.scene.stage.onFrame(() => c.frames++);
    }
    window.__ctr0 = window.__ctr ? { ...window.__ctr } : null;
    window.__lt0 = window.__lt.length;
    window.__rs0 = window.__pkcRaster ? { count: window.__pkcRaster.count, ms: window.__pkcRaster.ms, n: window.__pkcRaster.log.length } : null;
    window.__t0 = performance.now();
  }, counters);
  return async () => {
    const d = await page.evaluate(() => {
      window.__ftOn = false;
      const rs = window.__pkcRaster;
      const r0 = window.__rs0;
      return {
        ft: window.__ft.slice(2),
        rf: window.__rf.slice(1),
        lt: window.__lt.slice(window.__lt0).map((e) => ({ t: e.t - window.__t0, d: e.d })),
        raster: rs && r0 ? { count: rs.count - r0.count, ms: rs.ms - r0.ms, items: rs.log.filter((e) => e.at >= window.__t0).map((e) => `${e.id} ${e.ms.toFixed(0)}ms`) } : null,
        quality: window.__quality?.describe?.() ?? null,
        res: window.__ll.scene.stage.resolution,
        ctr: window.__ctr ? Object.fromEntries(Object.entries(window.__ctr).map(([k, v]) => [k, v - (window.__ctr0?.[k] ?? 0)])) : null,
        secs: (performance.now() - window.__t0) / 1000,
      };
    });
    const stats = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
      return { avg: arr.length ? 1000 / (arr.reduce((a, b) => a + b, 0) / arr.length) : 0, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] ?? 0, n: arr.length };
    };
    const pg = stats(d.ft);
    pg.janky = d.ft.filter((x) => x > 50).length;
    const render = stats(d.rf.map((r) => r.dt));
    render.hitches = d.rf.filter((r) => r.dt > 50).length;
    const works = d.rf.map((r) => r.work).sort((a, b) => a - b);
    render.workP50 = works[Math.floor(works.length * 0.5)] ?? 0;
    render.workP95 = works[Math.floor(works.length * 0.95)] ?? 0;
    const ctr = d.ctr && d.ctr.frames ? { drawsPerFrame: +(d.ctr.draws / d.ctr.frames).toFixed(1), rebuildsPerSec: +(d.ctr.rebuilds / d.secs).toFixed(1), rebuildMsPerSec: +(d.ctr.rebuildMs / d.secs).toFixed(2), texUploads: d.ctr.texUploads, bufKBPerFrame: +(d.ctr.bufBytes / 1024 / d.ctr.frames).toFixed(1), frames: d.ctr.frames } : null;
    return { page: pg, render, lt: d.lt, raster: d.raster, quality: d.quality, res: d.res, ctr };
  };
}

// Each scenario picks its book first (the harness parses the demo pack before recording starts),
// then GO[scenario] starts the round inside the recorded window.
const PICK = {
  heavy: `(async () => {
    const pack = await (await fetch('demo-books/BASE.json')).json();
    let best = null, score = -1;
    for (const { b } of pack.books) {
      const steps = b.events.find((e) => e.type === 'spin')?.spin.steps ?? [];
      const sc = steps.reduce((a, s) => a + (s.explosions?.length ?? 0) + (s.wheel ? 4 : 0) + (s.detonations?.length ?? 0) * 2, 0);
      if (!b.events.some((e) => e.type === 'bonusStart') && sc > score) (score = sc), (best = b.id);
    }
    return best;
  })()`,
  bigwin: `(async () => {
    const pack = await (await fetch('demo-books/BASE.json')).json();
    let best = null, pm = -1;
    for (const { b } of pack.books) {
      if (b.events.some((e) => e.type === 'bonusStart')) continue;
      if (b.payoutMultiplier > pm && b.payoutMultiplier < 100 * 2000) (pm = b.payoutMultiplier), (best = b.id);
    }
    return best;
  })()`,
  bonus: `(async () => {
    const pack = await (await fetch('demo-books/WITCHING.json')).json();
    const scored = pack.books.map(({ b }) => ({ id: b.id, n: b.events.length })).sort((a, b) => a.n - b.n);
    return scored[Math.floor(scored.length * 0.6)].id;
  })()`,
};
const GO = {
  heavy: (id) => `(window.__ll.forceBook(${id}), document.querySelector('.spin-btn').click())`,
  bigwin: (id) => `(window.__ll.forceBook(${id}), document.querySelector('.spin-btn').click())`,
  bonus: (id) => `(window.__ll.forceBook(${id}), window.__ll.ctrl.buy('WITCHING'))`,
};
/** Warm the game's own demo pack for a mode (the demo RGS parses it on the first round of that mode). */
const WARM = { heavy: 'BASE', bigwin: 'BASE', bonus: 'WITCHING' };
const SECS = { heavy: 16, bigwin: 24, bonus: 32 };

function summariseTrace(json) {
  const ev = json.traceEvents ?? json;
  const main = new Map();
  for (const e of ev) if (e.name === 'thread_name' && e.args?.name === 'CrRendererMain') main.set(`${e.pid}:${e.tid}`, true);
  const onMain = (e) => main.has(`${e.pid}:${e.tid}`);
  const gc = { minor: 0, major: 0, maxMs: 0, count: 0 };
  const tasks = [];
  for (const e of ev) {
    if (e.ph !== 'X' || !onMain(e)) continue;
    const ms = (e.dur ?? 0) / 1000;
    if (/^(MinorGC|MajorGC|V8\.GC_SCAVENGER|V8\.GC_MARK_COMPACTOR|V8\.GCScavenger|V8\.GCFinalizeMC)$/.test(e.name)) {
      if (/Minor|SCAVENGER|Scavenger/.test(e.name)) gc.minor += ms;
      else gc.major += ms;
      gc.count++;
      gc.maxMs = Math.max(gc.maxMs, ms);
    }
    if (e.name === 'RunTask' && ms > 50) tasks.push({ ts: e.ts, end: e.ts + e.dur, ms });
  }
  // what fills the long tasks: direct child events by name
  const inside = new Map();
  for (const e of ev) {
    if (e.ph !== 'X' || !onMain(e) || e.name === 'RunTask') continue;
    const t = tasks.find((k) => e.ts >= k.ts && e.ts < k.end);
    if (!t) continue;
    inside.set(e.name, (inside.get(e.name) ?? 0) + (e.dur ?? 0) / 1000);
  }
  const top = [...inside.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v.toFixed(0)}ms`);
  return { gc: { count: gc.count, minorMs: +gc.minor.toFixed(1), majorMs: +gc.major.toFixed(1), maxMs: +gc.maxMs.toFixed(1) }, longTasks: tasks.length, longTaskMs: +tasks.reduce((a, t) => a + t.ms, 0).toFixed(0), inside: top };
}

/**
 * Long stretches of main-thread work in a CPU profile (runs of non-idle samples over 50 ms), with
 * the functions that fill them: self time, and inclusive time for the game's own code.
 */
function longRuns(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const name = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  const runs = [];
  let cur = null;
  let t = p.startTime;
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i] ?? 0;
    const n = byId.get(p.samples[i]);
    const idle = !n || /^\((idle|program)\)$/.test(n.callFrame.functionName);
    if (idle) {
      if (cur && (cur.end - cur.start) / 1000 > 50) runs.push(cur);
      cur = null;
      continue;
    }
    const dt = (p.timeDeltas[i + 1] ?? p.timeDeltas[i] ?? 0) / 1000;
    cur ??= { start: t, end: t, self: new Map(), incl: new Map() };
    cur.end = t;
    cur.self.set(name(n), (cur.self.get(name(n)) ?? 0) + dt);
    const seen = new Set();
    for (let id = n.id; id !== undefined; id = parent.get(id)) {
      const m = byId.get(id);
      if (!m) break;
      const k = name(m);
      if (seen.has(k) || !/index-|\.ts/.test(m.callFrame.url || '')) continue;
      seen.add(k);
      cur.incl.set(k, (cur.incl.get(k) ?? 0) + dt);
    }
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([f, v]) => `${v.toFixed(0)}ms ${f}`);
  return runs.map((r) => ({ at: +((r.start - p.startTime) / 1e6).toFixed(2), ms: +((r.end - r.start) / 1000).toFixed(0), self: top(r.self, 6), incl: top(r.incl, 10) }));
}

function summariseProfile(p) {
  const self = new Map();
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const dts = p.timeDeltas;
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]);
    if (!n) continue;
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return [...self.entries()].filter(([k]) => !/^\((idle|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${v.toFixed(0)}ms ${((v / total) * 100).toFixed(1)}% ${k}`);
}

for (const pname of profiles) {
  const p = PROFILES[pname];
  if (!p) throw new Error(`unknown profile ${pname}`);
  for (const q of qualities) {
    const b = await boot(p, q);
    const tag = `${pname} q=${q}`;
    await b.page.waitForTimeout(800);
    await b.page.mouse.click(p.vp.width / 2, p.vp.height / 2);
    await b.page.waitForTimeout(3500);
    const idleStop = await record(b.page);
    await b.page.waitForTimeout(3000);
    const idle = await idleStop();
    const bootLine = `${tag}: splash ready ${(b.tSplash / 1000).toFixed(1)}s, ${(b.bytesAtSplash / 1024 / 1024).toFixed(2)}MB before play | res ${idle.res} | quality ${idle.quality ? `${idle.quality.mode}${idle.quality.low ? ' LOW' : ' high'}${idle.quality.reason ? ` (${idle.quality.reason})` : ''} probe ${idle.quality.frameMs}ms` : 'n/a'} | idle page ${idle.page.avg.toFixed(1)}fps render ${idle.render.avg.toFixed(1)}fps work p50 ${idle.render.workP50.toFixed(1)}ms`;
    console.log(bootLine);
    if (idleBefore > 0) await b.page.waitForTimeout(idleBefore * 1000);
    for (const sc of scenarios) {
      await b.page.waitForFunction(() => !window.__ll.ctrl.busy, null, { timeout: 120000 }).catch(() => undefined);
      const book = await b.page.evaluate(PICK[sc]);
      // the demo RGS loads a mode's 2 MB pack on its first round: do it now, outside the window
      await b.page.evaluate((m) => window.__ll.rgs.pack?.(m), WARM[sc]).catch(() => undefined);
      await b.page.waitForTimeout(400);
      if (trace) {
        await browser.startTracing(b.page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.gc', 'blink.user_timing', 'toplevel'] });
        await b.cdp.send('Profiler.enable');
        await b.cdp.send('Profiler.setSamplingInterval', { interval: 500 });
        await b.cdp.send('Profiler.start');
        await b.page.waitForTimeout(300); // the profiler's own start-up stall stays out of the window
      }
      const stop = await record(b.page);
      await b.page.evaluate(GO[sc](book));
      const tEnd = Date.now() + SECS[sc] * 1000;
      while (Date.now() < tEnd) {
        await b.page.waitForTimeout(sc === 'bonus' ? 2500 : 1000);
        // title cards wait for a tap; a tap on the board otherwise does nothing
        if (sc === 'bonus') await b.page.mouse.click(p.vp.width / 2, p.vp.height * 0.35);
      }
      const fr = await stop();
      let tr = null;
      let prof = null;
      let runs = [];
      if (trace) {
        const { profile } = await b.cdp.send('Profiler.stop');
        prof = summariseProfile(profile);
        runs = longRuns(profile);
        const buf = await browser.stopTracing();
        tr = summariseTrace(JSON.parse(buf.toString()));
      }
      const problems = [];
      const g = p.gate && sc === 'heavy' && gate ? p.gate : null;
      if (g) {
        if (fr.page.avg < g.avg) problems.push(`avg ${fr.page.avg.toFixed(1)}fps < ${g.avg}`);
        if (fr.page.p95 > g.p95) problems.push(`p95 ${fr.page.p95.toFixed(1)}ms > ${g.p95}`);
        if (fr.page.janky > g.janky) problems.push(`${fr.page.janky} frames over 50ms > ${g.janky}`);
      }
      if (b.errors.length) problems.push(`errors: ${b.errors.slice(0, 2).join(' | ')}`);
      const ltMs = fr.lt.reduce((a, e) => a + e.d, 0);
      const line = `${tag} ${sc} (book ${book}): page avg ${fr.page.avg.toFixed(1)}fps p50 ${fr.page.p50.toFixed(1)} p95 ${fr.page.p95.toFixed(1)} p99 ${fr.page.p99.toFixed(1)} max ${fr.page.max.toFixed(0)}ms >50ms ${fr.page.janky}/${fr.page.n} | render ${fr.render.avg.toFixed(1)}fps p95 ${fr.render.p95.toFixed(1)} max ${fr.render.max.toFixed(0)}ms hitches ${fr.render.hitches} work p50 ${fr.render.workP50.toFixed(1)} p95 ${fr.render.workP95.toFixed(1)}ms | long tasks ${fr.lt.length} (${ltMs.toFixed(0)}ms, max ${Math.max(0, ...fr.lt.map((e) => e.d)).toFixed(0)}) | rasters mid-round ${fr.raster ? `${fr.raster.count} (${fr.raster.ms.toFixed(0)}ms)` : 'n/a'}`;
      if (problems.length) {
        failures++;
        console.log(`FAIL ${line}\n     ${problems.join('; ')}`);
      } else console.log(`ok   ${line}`);
      if (fr.raster?.items.length) console.log(`     rasters: ${fr.raster.items.slice(0, 12).join(', ')}${fr.raster.items.length > 12 ? ' ...' : ''}`);
      if (counters && fr.ctr) console.log(`     counters: ${fr.ctr.drawsPerFrame} draw calls/frame, ${fr.ctr.rebuildsPerSec} render-list rebuilds/s (${fr.ctr.rebuildMsPerSec} ms/s), ${fr.ctr.texUploads} texture uploads, ${fr.ctr.bufKBPerFrame} KB buffer upload/frame over ${fr.ctr.frames} frames`);
      if (tr) console.log(`     trace: GC ${tr.gc.count}x minor ${tr.gc.minorMs}ms major ${tr.gc.majorMs}ms max ${tr.gc.maxMs}ms | long tasks ${tr.longTasks} ${tr.longTaskMs}ms: ${tr.inside.join(', ')}`);
      if (prof) console.log(`     hot: ${prof.slice(0, 12).join('\n          ')}`);
      for (const r of runs.filter((x) => x.ms > 60).slice(0, 8)) console.log(`     long run @${r.at}s ${r.ms}ms\n        self: ${r.self.join(' | ')}\n        incl: ${r.incl.join(' | ')}`);
      report.push({ profile: pname, quality: q, scenario: sc, book, boot: { splashS: b.tSplash / 1000, mb: b.bytesAtSplash / 1048576 }, idle, frames: fr, trace: tr, profile_top: prof, runs, problems });
    }
    await b.ctx.close();
  }
}
await browser.close();
writeFileSync(`${out}/perf-${Date.now()}.json`, JSON.stringify(report, null, 1));
process.exit(failures ? 1 : 0);
