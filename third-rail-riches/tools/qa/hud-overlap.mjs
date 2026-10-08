// HUD overlap gate (track H; Stake: "it is possible to overlap the win and play amounts").
// Pushes worst-case amount strings (every currency format) into the real HUD at every viewport
// and asserts: the win and bet readings never intersect or touch (2 px clear), no reading's text
// leaves its plate, no control leaves the screen or overlaps another. Then the Stake review's own
// case (Stake.us, iPhone SE: balance 575.00 GC, win 75.00 GC, play amount 70,000.00 GC) must also
// read: every value's numerals at least as big as 12.5px text (legible), not merely squeezed in.
// Muted: the browser runs with --mute-audio and the URL carries &mute.
// Usage: node tools/qa/hud-overlap.mjs [url] [--only=375x667,1440x900] [--social]
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5319/?debug';
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
const social = args.includes('--social');
const VIEWPORTS = [
  // iPhone SE: the device the Stake review found the win / play amount overlap on
  [375, 667, 2],
  [360, 640, 2],
  [360, 740, 3],
  [390, 844, 3],
  [430, 932, 3],
  [768, 1024, 2],
  [844, 390, 3],
  [1024, 768, 2],
  [1280, 800, 1],
  [1440, 900, 2],
  [1920, 1080, 1],
  [2560, 1440, 1],
  [480, 270, 2],
  [400, 300, 2],
];
// worst cases, the Stake review's Stake.us values (GC) and their maximum forms
const WINS = ['$50,000,000.00', '$12,345.123456', 'Rp1,234,567,890.123456', '12,345,678.123456 CLP', '75.00 GC', '3,500,000,000.00 GC'];
const BETS = ['$1,000.00', 'Rp100,000.00', '10,000.00 SC', '70,000.00 GC'];
const BALANCES = ['$99,999,999.99', 'Rp98,765,432,100.00', '1,234,567.89 SC', '575.00 GC', '99,999,999.99 GC'];
/** The review's case: each of these must read at full legibility, not just fit. */
const REVIEW = { balance: '575.00 GC', win: '75.00 GC', bet: '70,000.00 GC' };
/** Numerals are 1.2em tall at their natural size: 15px tall reads like 12.5px text (tools/qa/layout.mjs's floor). */
const LEGIBLE_PX = 12.5 * 1.2;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failures = 0;
for (const [w, h, dpr] of VIEWPORTS) {
  if (only && !only.includes(`${w}x${h}`)) continue;
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 900 && h > w, hasTouch: w < 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const u = new URL(url);
  if (social) u.searchParams.set('social', 'true');
  u.searchParams.set('mute', '');
  await page.goto(u.toString(), { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__ll && document.getElementById('boot')?.classList.contains('gone') !== false, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  await page.mouse.click(w / 2, h / 2);
  await page.waitForTimeout(2400);
  const problems = await page.evaluate(
    async ({ WINS, BETS, BALANCES, REVIEW, LEGIBLE_PX }) => {
      const hud = window.__ll?.ctrl?.hud;
      if (!hud?.showAmounts) return ['Hud.showAmounts not reachable (window.__ll.ctrl.hud)'];
      const out = [];
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el || el.offsetParent === null) return null;
        return el.getBoundingClientRect();
      };
      const hit = (a, b, gap = 0) => a.left - gap < b.right && b.left - gap < a.right && a.top - gap < b.bottom && b.top - gap < a.bottom;
      const ctl = ['.buy-btn', '.menu-btn', '.meter.bal', '.meter.win', '.meter.bet', '.boost-btn', '.spin-btn', '.auto-btn', '.turbo-btn'];
      for (let i = 0; i < WINS.length; i++) {
        for (const bet of BETS) {
          const win = WINS[i];
          hud.showAmounts({ win, bet, balance: BALANCES[i % BALANCES.length] });
          await frame();
          const tag = `win "${win}" / bet "${bet}"`;
          const wb = box('.meter.win');
          const bb = box('.meter.bet');
          if (wb && bb && hit(wb, bb, 2)) out.push(`${tag}: win and bet readings meet`);
          // each reading's value and label stay inside its plate
          for (const m of ['.meter.bal', '.meter.win', '.meter.bet']) {
            const plate = box(m);
            if (!plate) continue;
            for (const part of document.querySelectorAll(`${m} .val, ${m} .lbl, ${m} .numsvg`)) {
              if (part.offsetParent === null && part.tagName !== 'svg') continue;
              const r = part.getBoundingClientRect();
              if (r.width === 0) continue;
              if (r.left < plate.left - 0.5 || r.right > plate.right + 0.5 || r.top < plate.top - 0.5 || r.bottom > plate.bottom + 0.5) out.push(`${tag}: ${m} ${part.classList[0] ?? part.tagName} leaves its plate`);
            }
          }
          const rects = ctl.map((s) => [s, box(s)]).filter(([, r]) => r);
          for (let a = 0; a < rects.length; a++) {
            const [sa, ra] = rects[a];
            if (ra.left < -0.5 || ra.top < -0.5 || ra.right > innerWidth + 0.5 || ra.bottom > innerHeight + 0.5) out.push(`${tag}: ${sa} leaves the screen`);
            for (let b = a + 1; b < rects.length; b++) {
              const [sb, rb] = rects[b];
              if (hit(ra, rb, -2)) out.push(`${tag}: ${sa} overlaps ${sb}`);
            }
          }
        }
      }
      // the review's case reads at full size (each value's numerals at least LEGIBLE_PX tall)
      hud.showAmounts(REVIEW);
      await frame();
      for (const [k, text] of Object.entries(REVIEW)) {
        const svg = document.querySelector(`[data-k="${k}"] .numsvg`);
        const h = svg?.getBoundingClientRect().height ?? 0;
        if (h < LEGIBLE_PX - 0.25) out.push(`review case: ${k} "${text}" renders only ${h.toFixed(1)}px tall (needs ${LEGIBLE_PX}px)`);
      }
      return [...new Set(out)];
    },
    { WINS, BETS, BALANCES, REVIEW, LEGIBLE_PX },
  );
  if (errors.length) problems.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  const tag = `${w}x${h}@${dpr}`.padEnd(14);
  if (problems.length) {
    failures++;
    console.log(`FAIL ${tag} ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? ` (+${problems.length - 6})` : ''}`);
  } else console.log(`ok   ${tag}`);
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
