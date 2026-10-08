// Layout gate: geometry checks at every viewport against the production preview.
// Usage: node tools/qa/layout.mjs [url] [--selftest] [--quality=auto|high|low] [--shots=dir] [--quick]
//          [--only=390x844,1440x900]
//  - HUD: controls inside the viewport, no overlaps, no clipped or tiny text, tap targets
//  - scene: reels, win bar, fuse and logo inside the viewport and above the HUD, no overlaps
//  - crew: idle and through every reaction (sampled every frame-ish, alpha-exact bounds), the captain
//    and Sparks never reach the symbols, the logo or the win bar, never leave the screen and never
//    sink under the HUD (--quick checks idle only)
//  - portrait deck: the crew stand on the deck line right above the HUD (no empty deck under them)
//    and fill the band under the reels
//  - legibility: win bar at least 22 px tall, logo at least 90 px wide (18% of the width in the
//    mini-player)
//  - worst-case HUD: long amounts pushed through the real Hud setters (a 50,000,000.00 win and a
//    1,000.00 bet; IDR-sized strings; a win with all six decimals): the win and bet meters never
//    intersect, no HUD text overflows its box, no control leaves the screen or overlaps another
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5319/?debug';
const selftest = args.includes('--selftest');
const quick = args.includes('--quick');
const quality = args.find((a) => a.startsWith('--quality='))?.split('=')[1];
const shots = args.find((a) => a.startsWith('--shots='))?.split('=')[1];
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
if (shots) mkdirSync(shots, { recursive: true });
const VIEWPORTS = selftest
  ? [[1440, 900, 1]]
  : [
      // iPhone SE: the device the Stake review found the win / play amount overlap on
      [375, 667, 2],
      [390, 844, 3],
      [360, 740, 3],
      [360, 640, 2],
      [430, 932, 3],
      [844, 390, 3],
      [768, 1024, 2],
      [1024, 768, 2],
      [1280, 800, 1],
      [1440, 900, 2],
      [1920, 1080, 1],
      [2560, 1440, 1],
      // Stake mini-player popout
      [480, 270, 2],
      [400, 300, 2],
    ];

const u = new URL(url);
if (quality) u.searchParams.set('quality', quality);
// muted: this runs beside the owner (the browser also starts with --mute-audio)
u.searchParams.set('mute', '');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const [w, h, dpr] of VIEWPORTS) {
  if (only && !only.includes(`${w}x${h}`)) continue;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 900 && h > w, hasTouch: w < 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(u.toString(), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ll && document.getElementById('boot')?.classList.contains('gone') !== false, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.mouse.click(w / 2, h / 2); // dismiss the splash
  await page.waitForTimeout(2600);
  await page.evaluate(() => (window.__ll.scene.conductor.react('idle'), window.__ll.scene.rat.react('idle')));
  await page.waitForTimeout(400);
  if (selftest) await page.addStyleTag({ content: '.meter.bal{min-width:1200px !important}' });
  await page.waitForTimeout(200);
  if (shots) await page.screenshot({ path: `${shots}/layout-${w}x${h}@${dpr}.png` });
  const g = await page.evaluate(async (quick) => {
    const { scene } = window.__ll;
    const L = scene.L;
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, sel };
    };
    const hudSel = ['.buy-btn', '.menu-btn', '.meter.bal', '.meter.win', '.meter.bet', '.spin-btn', '.auto-btn', '.turbo-btn'];
    const hud = hudSel.map(r).filter(Boolean);
    const clipped = [...document.querySelectorAll('.hud .val, .hud .lbl')]
      .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
      .map((el) => `${el.className}:"${el.textContent}"`);
    const small = [...document.querySelectorAll('.hud .lbl, .hud .val')]
      .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 12.5)
      .map((el) => el.className);
    const bnd = (o) => {
      const b = o.getBounds();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    // alpha-exact bounds: render the object and scan its pixels (bounding boxes include texture padding)
    const blowups = [];
    const tight = (o, tag = '') => {
      const b = o.getBounds();
      // a rig part flung to NaN or far off screen would make a giant readback: report it instead
      if (![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width > innerWidth * 3 || b.height > innerHeight * 3) {
        blowups.push(`${tag} bounds ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}`);
        return null;
      }
      const { pixels, width, height } = scene.stage.app.renderer.extract.pixels({ target: o });
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (pixels[(y * width + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      if (x1 < 0) return null;
      const k = b.width / width;
      return { x: b.x + x0 * k, y: b.y + y0 * k, w: (x1 - x0 + 1) * k, h: (y1 - y0 + 1) * k };
    };
    const union = (a, b) => {
      if (!a) return b;
      if (!b) return a;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
    };
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    // every reaction the rigs know (unknown ones are skipped), sampled through the whole move
    // reach moves (the throw, following the bomb) may lean across the frame's edge: kept apart
    const REACH = ['throw', 'watch'];
    const sweep = async (who, states, ms) => {
      let env = tight(who);
      let reach = null;
      const seen = [];
      for (const st of states) {
        try {
          who.react(st);
        } catch {
          continue;
        }
        seen.push(st);
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          await sleep(34);
          const b = tight(who, `${who === scene.conductor ? 'Conductor' : 'Rat'} ${st}:`);
          if (REACH.includes(st)) reach = union(reach, b);
          else env = union(env, b);
        }
        who.react('idle');
        await sleep(350);
      }
      return { env, reach, seen };
    };
    const capIdle = tight(scene.conductor);
    const parIdle = tight(scene.rat);
    const cap = quick ? { env: capIdle, reach: null, seen: [] } : await sweep(scene.conductor, ['cheer', 'shock', 'dance', 'laugh', 'pray', 'duck', 'watch'], 950);
    // the charged bomb in his hand, then the throw (wind-up to release and follow-through)
    const c = scene.conductor;
    if (!quick && typeof c.setCharge === 'function' && typeof c.throwBomb === 'function') {
      try {
        c.setCharge(3, 3);
        await sleep(500);
        cap.env = union(cap.env, tight(c));
        let done = false;
        c.throwBomb().then(() => (done = true), () => (done = true));
        const t0 = performance.now();
        while (performance.now() - t0 < 1400) {
          await sleep(34);
          cap.reach = union(cap.reach, tight(c, 'Captain throw:'));
          if (done && performance.now() - t0 > 900) break;
        }
        c.setCharge(0, 3);
        cap.seen.push('charged', 'throw');
        await sleep(400);
      } catch {
        /* rig without a throw yet */
      }
    }
    const par = quick ? { env: parIdle, reach: null, seen: [] } : await sweep(scene.rat, ['happy', 'squeak', 'worried', 'watch', 'duck'], 850);
    return {
      W: innerWidth,
      H: innerHeight,
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
      L: { grid: L.grid, frame: L.frame, winBar: L.winBar, meter: L.meter, logo: L.logo, hudH: L.hudH, portrait: L.portrait, compact: !!L.compact, S: L.S, floorY: L.floorY, capH: L.captain.h, parH: L.parrot.h },
      hudTop: document.querySelector('.hud').getBoundingClientRect().top,
      hud,
      clipped,
      small,
      captain: bnd(scene.conductor),
      parrot: bnd(scene.rat),
      capIdle,
      parIdle,
      capEnv: cap.env,
      parEnv: par.env,
      capReach: cap.reach,
      parReach: par.reach,
      capStates: cap.seen,
      parStates: par.seen,
      blowups: [...new Set(blowups)].slice(0, 4),
      logo: bnd(scene.logo),
    };
  }, quick);
  // worst-case HUD values, through the Hud's own setters (API amounts: 1,000,000 = 1.00)
  const M = 1_000_000;
  const PASSES = [
    { name: '50M win / 1,000 bet', win: 50_000_000 * M, bet: 1_000 * M, bal: 1_234_567.89 * M },
    { name: 'IDR-sized', win: 5_000_000_000 * M, bet: 1_000_000 * M, bal: 987_654_321 * M },
    { name: 'six-decimal win', win: 9_876_543_210_987, bet: 12_345.67 * M, bal: 99_999_999.99 * M },
  ];
  const hudWorst = [];
  for (const ps of PASSES) {
    const hw = await page.evaluate(async (ps) => {
      const hud = window.__ll?.ctrl?.hud;
      if (!hud) return { skipped: true };
      hud.setBalance(Math.round(ps.bal), false);
      hud.setBet(Math.round(ps.bet));
      hud.setWin(Math.round(ps.win), false);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const r = (sel) => {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, sel };
      };
      const sels = ['.buy-btn', '.menu-btn', '.meter.bal', '.meter.win', '.meter.bet', '.spin-btn', '.auto-btn', '.turbo-btn'];
      return {
        hud: sels.map(r).filter(Boolean),
        // the HUD draws numerals as art, so the string lives in aria-label
        texts: { win: document.querySelector('[data-k="win"]')?.getAttribute('aria-label') ?? '', bet: document.querySelector('[data-k="bet"]')?.getAttribute('aria-label') ?? '' },
        clipped: [...document.querySelectorAll('.hud .val, .hud .lbl')]
          .filter((el) => el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
          .map((el) => `${el.className}:"${el.textContent}"`),
      };
    }, ps);
    hudWorst.push({ ...hw, name: ps.name });
  }
  await page.evaluate(() => {
    const hud = window.__ll?.ctrl?.hud;
    hud?.setWin(0);
  });

  const problems = [];
  const S = g.L.S;
  const inside = (b, name, pad = 0.5) => {
    if (b.x < -pad || b.y < -pad || b.x + b.w > g.W + pad || b.y + b.h > g.H + pad) problems.push(`${name} outside viewport (${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)})`);
  };
  const overlap = (a, b, tol = 2) => a.x + tol < b.x + b.w && b.x + tol < a.x + a.w && a.y + tol < b.y + b.h && b.y + tol < a.y + a.h;
  const above = (b, name, tol = 1) => b.y + b.h > g.hudTop + tol && problems.push(`${name} runs under the HUD by ${Math.round(b.y + b.h - g.hudTop)}px`);
  if (g.sw > g.W + 0.5 || g.sh > g.H + 0.5) problems.push(`page overflow ${g.sw}x${g.sh}`);
  for (let i = 0; i < g.hud.length; i++) {
    inside(g.hud[i], g.hud[i].sel);
    for (let j = i + 1; j < g.hud.length; j++) if (overlap(g.hud[i], g.hud[j])) problems.push(`HUD overlap ${g.hud[i].sel} x ${g.hud[j].sel}`);
  }
  if (g.clipped.length) problems.push(`clipped text: ${g.clipped.join(', ')}`);
  // worst-case HUD: report what the long values break beyond what already fails at defaults
  const seen = new Set(problems.map((p) => p.replace(/ \(.*$/, '')));
  for (const hw of hudWorst) {
    if (hw.skipped) {
      problems.push('worst-case HUD check could not reach the Hud (window.__ll.ctrl.hud)');
      break;
    }
    const at = `[${hw.name}: win "${hw.texts.win}", bet "${hw.texts.bet}"]`;
    const found = [];
    const win = hw.hud.find((b) => b.sel === '.meter.win');
    const bet = hw.hud.find((b) => b.sel === '.meter.bet');
    if (win && bet && overlap(win, bet, 0)) found.push('win meter x bet meter');
    for (let i = 0; i < hw.hud.length; i++) {
      const b = hw.hud[i];
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > g.W + 0.5 || b.y + b.h > g.H + 0.5) found.push(`${b.sel} outside viewport`);
      for (let j = i + 1; j < hw.hud.length; j++) if (overlap(b, hw.hud[j])) found.push(`HUD overlap ${b.sel} x ${hw.hud[j].sel}`);
    }
    if (hw.clipped.length) found.push(`HUD text overflows: ${hw.clipped.join(', ')}`);
    const fresh = found.filter((f) => !seen.has(f));
    if (fresh.length) problems.push(`worst-case HUD ${at}: ${fresh.join('; ')}`);
  }
  if (g.small.length) problems.push(`text under 12.5px: ${[...new Set(g.small)].join(', ')}`);
  if (w < 900) for (const b of g.hud) if (['.spin-btn', '.buy-btn', '.menu-btn', '.auto-btn', '.turbo-btn'].includes(b.sel) && (b.w < 40 || b.h < 40)) problems.push(`small tap target ${b.sel} ${Math.round(b.w)}x${Math.round(b.h)}`);
  inside(g.L.frame, 'crib frame');
  above(g.L.frame, 'crib frame');
  inside(g.L.winBar, 'win bar');
  above(g.L.winBar, 'win bar');
  if (overlap(g.L.winBar, g.logo, 1)) problems.push('win bar overlaps logo');
  if (g.L.winBar.h < 22) problems.push(`win bar only ${g.L.winBar.h.toFixed(1)}px tall`);
  inside(g.logo, 'logo', 2);
  above(g.L.logo, 'logo');
  if (g.L.logo.w < Math.min(90, g.W * 0.18)) problems.push(`logo only ${g.L.logo.w.toFixed(0)}px wide`);
  inside(g.L.meter, 'tantrum meter');
  above(g.L.meter, 'tantrum meter');
  if (overlap(g.L.meter, g.logo, 1)) problems.push('tantrum meter overlaps logo');
  if (overlap(g.L.meter, g.L.winBar, 1)) problems.push('tantrum meter overlaps win bar');
  if (g.L.meter.y + g.L.meter.h > g.L.grid.y + 1) problems.push('tantrum meter runs into the reels');
  if (overlap(g.L.winBar, g.L.frame, 1)) problems.push('win bar overlaps the crib');
  for (const [name, c, idle, env, reach, states] of [
    ['Captain', g.captain, g.capIdle, g.capEnv, g.capReach, g.capStates],
    ['Parrot', g.parrot, g.parIdle, g.parEnv, g.parReach, g.parStates],
  ]) {
    // sprite textures carry transparent padding and baked drop shadows, so bounding boxes overstate
    // reach by ~0.3 S (measured at 1024 and 1440 against screenshots); real overlap beyond that is a defect
    if (overlap(c, g.L.frame, Math.max(6, S * 0.32))) problems.push(`${name} overlaps the crib`);
    if (c.x < -4 || c.x + c.w > g.W + 4) problems.push(`${name} cut off at the side`);
    if (c.y + c.h > g.hudTop + S * 0.12) problems.push(`${name} sinks under the HUD by ${Math.round(c.y + c.h - g.hudTop)}px`);
    if (!env || !idle) {
      problems.push(`${name} renders nothing`);
      continue;
    }
    // alpha-exact, idle and through every reaction: never on the symbols, the logo or the win bar
    const moves = states.length ? ` (idle + ${states.filter((s) => !['throw', 'watch'].includes(s)).join('/')})` : ' (idle)';
    if (reach) {
      // the throw and the lean that follows the bomb may cross the frame's edge (the crew are drawn in
      // front of the hatch) but reach at most 0.4 S over the outer reel, and never in portrait
      const deep = g.L.portrait ? 1 : S * 0.4;
      if (overlap(reach, g.L.grid, deep)) problems.push(`${name} throw/watch reaches ${Math.round(Math.min(reach.x + reach.w - g.L.grid.x, g.L.grid.x + g.L.grid.w - reach.x))}px over the reels`);
      if (reach.x < -2 || reach.x + reach.w > g.W + 2) problems.push(`${name} throw/watch leaves the screen: x ${Math.round(reach.x)}-${Math.round(reach.x + reach.w)}`);
      if (reach.y + reach.h > g.hudTop + 3) problems.push(`${name} throw/watch sinks under the HUD by ${Math.round(reach.y + reach.h - g.hudTop)}px`);
      if (overlap(reach, g.L.logo, Math.max(2, g.L.logo.h * 0.08)) || overlap(reach, g.L.winBar, 2)) problems.push(`${name} throw/watch reaches the logo or win bar`);
    }
    if (overlap(env, g.L.grid, 1)) problems.push(`${name} reaches the symbols${moves}: ${Math.round(env.y)} vs reels bottom ${Math.round(g.L.grid.y + g.L.grid.h)}, x ${Math.round(env.x)}-${Math.round(env.x + env.w)} vs ${Math.round(g.L.grid.x)}-${Math.round(g.L.grid.x + g.L.grid.w)}`);
    if (!g.L.portrait && overlap(env, g.L.frame, 2)) problems.push(`${name} reaches the crib frame${moves}`);
    if (overlap(env, g.L.logo, Math.max(2, g.L.logo.h * 0.08))) problems.push(`${name} reaches the logo${moves}`);
    if (overlap(env, g.L.winBar, 2)) problems.push(`${name} reaches the win bar${moves}`);
    if (env.x < -2 || env.x + env.w > g.W + 2) problems.push(`${name} leaves the screen${moves}: x ${Math.round(env.x)}-${Math.round(env.x + env.w)}`);
    if (env.y + env.h > g.hudTop + 3) problems.push(`${name} sinks under the HUD${moves} by ${Math.round(env.y + env.h - g.hudTop)}px`);
  }
  if (g.L.portrait) {
    // no empty deck: the crew stand on the deck line right above the HUD ...
    const feet = Math.max(g.capIdle ? g.capIdle.y + g.capIdle.h : 0, g.parIdle ? g.parIdle.y + g.parIdle.h : 0);
    if (g.hudTop - feet > S * 0.3) problems.push(`empty deck under the crew: feet at ${Math.round(feet)}, HUD at ${Math.round(g.hudTop)}`);
    // ... and fill the band under the reels (their highest reach comes close to the symbols)
    const reach = Math.min(g.capEnv?.y ?? 1e9, g.parEnv?.y ?? 1e9);
    if (!quick && reach - (g.L.grid.y + g.L.grid.h) > S * 0.9) problems.push(`crew leave ${Math.round(reach - (g.L.grid.y + g.L.grid.h))}px empty under the reels`);
  }
  if (g.blowups.length) problems.push(`rig bounds blew up: ${g.blowups.join(' | ')}`);
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  const tag = `${w}x${h}@${dpr}`.padEnd(14);
  const kind = g.L.portrait ? 'portrait' : g.L.compact ? 'compact' : 'landscape';
  const reelShare = ((g.L.grid.w * g.L.grid.h) / (g.W * g.H)) * 100;
  const info = `S=${S.toFixed(0)} ${kind} reels ${reelShare.toFixed(1)}% of screen, captain ${Math.round(g.L.capH)}px parrot ${Math.round(g.L.parH)}px`;
  if (problems.length) {
    failures++;
    console.log(`FAIL ${tag} ${info}\n     ${problems.join('\n     ')}`);
  } else console.log(`ok   ${tag} ${info}`);
  await page.close();
}
await browser.close();
if (selftest) {
  console.log(failures ? 'selftest OK: the planted overlap was detected' : 'SELFTEST FAILED: planted overlap not detected');
  process.exit(failures ? 0 : 1);
}
process.exit(failures ? 1 : 0);
