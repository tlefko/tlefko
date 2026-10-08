// Regenerates the loading-screen assets in public/boot/ from a running DEV server (the keg and spark
// are imported from src/art, which only a dev server serves), so the loading screen always shows the
// real game: node tools/brand/boot.mjs [devUrl]   (default http://127.0.0.1:5318/?debug)
//   logo.webp        960x595 lockup rendered from the game's own lettering (logoSvg, transparent)
//   scene-land.webp  1600x1000 capture of the cove (no HUD, no logo; dimmed and blurred by CSS)
//   scene-port.webp  700x1517 portrait capture
//   keg.webp         the powder keg symbol at the end of the loading fuse
//   spark.webp       the burning fuse spark that travels along it (the game's own fx spark)
// Re-run it whenever the logo, the cove scene or the keg art changes.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] ?? 'http://127.0.0.1:5318/?debug';
const out = 'public/boot';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

const save = (name, dataUrl) => {
  const b = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(`${out}/${name}`, b);
  console.log(`${out}/${name}`, `${(b.length / 1024).toFixed(0)} KB`);
};

/** Load the game, play through the intro, wait until the game has the stage. */
async function openGame(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  // a returning player: no first-spin coach marks in the capture
  await page.addInitScript(() => {
    try {
      localStorage.setItem('powder-keg-cove.coach.v1', '1');
    } catch {
      /* storage unavailable */
    }
  });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ll?.scene?.L && (!document.getElementById('boot') || document.getElementById('boot').classList.contains('gone')), null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.keyboard.press('Enter'); // the intro's PLAY
  await page.waitForFunction(() => !window.__ll.splash?.() && !window.__ll.ctrl.busy, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return page;
}

/** Screenshot → webp via the browser's own encoder. */
async function webp(page, png, q) {
  return page.evaluate(
    async ({ b64, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', q);
    },
    { b64: png.toString('base64'), q },
  );
}

// scenes: the HUD and the logo hidden, everything else as the player sees it
for (const [name, w, h] of [
  ['scene-land.webp', 1600, 1000],
  ['scene-port.webp', 700, 1517],
]) {
  const page = await openGame(w, h);
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = 'hidden';
    window.__ll.scene.logo.visible = false;
  });
  await page.waitForTimeout(400);
  const png = await page.screenshot({ type: 'png' });
  save(name, await webp(page, png, 0.72));
  await page.close();
}

// logo, keg and spark, rendered in the page from the game's own art code
const page = await openGame(1200, 800);

const svgWebp = (svg, w, h, q = 0.9) =>
  page.evaluate(
    async ({ svg, w, h, q }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/webp', q);
    },
    { svg, w, h, q },
  );

// the lockup straight from the lettering (the same SVG Logo.ts rasterises), tagline included
const LOGO_W = 960;
const LOGO_H = Math.round(LOGO_W * 0.62);
const logoSvg = await page.evaluate(async ({ w, h }) => (await import('/src/art/lettering.ts')).logoSvg({ width: w, height: h }), { w: LOGO_W, h: LOGO_H });
save('logo.webp', await svgWebp(logoSvg, LOGO_W, LOGO_H, 0.92));

const kegSvg = await page.evaluate(async () => (await import('/src/art/keg.ts')).powderKeg(false));
save('keg.webp', await svgWebp(kegSvg, 160, 160));
const sparkSvg = await page.evaluate(async () => (await import('/src/art/fx.ts')).spark());
save('spark.webp', await svgWebp(sparkSvg, 112, 112));
await browser.close();
