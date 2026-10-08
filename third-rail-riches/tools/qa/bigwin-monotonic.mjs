// Checks the Big Win counter only ever counts up and ends exactly on the round win.
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://127.0.0.1:5319/?debug';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ll, null, { timeout: 120000 });
await page.waitForTimeout(1000);
await page.mouse.click(720, 450);
await page.waitForTimeout(2600);
// the biggest base-game book without a bonus: it ends on the Big Win counter
await page.evaluate(async () => {
  const pack = await (await fetch('demo-books/BASE.json')).json();
  const best = pack.books.filter(({ b }) => !b.events.some((e) => e.type === 'bonusStart') && b.payoutMultiplier < 5_000_000).sort((x, y) => y.b.payoutMultiplier - x.b.payoutMultiplier)[0].b;
  window.__ll.forceBook(best.id);
  window.__samples = [];
  const sample = () => {
    const ov = window.__ll.scene.overlay.children.find((c) => c.constructor.name && c.amount);
    const t = ov?.amount?.text;
    if (t) window.__samples.push(t);
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  document.querySelector('.spin-btn').click();
});
await page.waitForFunction(() => window.__ll.ctrl.rounds > 0 && !window.__ll.ctrl.busy, null, { timeout: 120000 });
const { samples, win } = await page.evaluate(() => ({ samples: window.__samples, win: window.__ll.ctrl.lastRound.winApi / 1e4 }));
const vals = samples.map((s) => Math.round(Number(s.replace(/[^0-9.]/g, '')) * 100));
let dips = 0;
for (let i = 1; i < vals.length; i++) if (vals[i] < vals[i - 1]) dips++;
console.log(`samples ${vals.length}, first ${samples[0]}, last ${samples[samples.length - 1]}, expected ${(Math.round(win) / 100).toFixed(2)}, backward steps ${dips}`);
await browser.close();
process.exit(dips === 0 && vals.length > 10 && vals[vals.length - 1] === Math.round(win) ? 0 : 1);
