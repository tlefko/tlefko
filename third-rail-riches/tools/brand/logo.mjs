// Psycho Games provider logo: one colour (white), transparent background.
// Outputs a wide lockup and a square badge as PNG + SVG.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = '/Users/tlefko/Desktop/Files/Projects/_brand/psycho-games';
mkdirSync(out, { recursive: true });
const fontDir = resolve('node_modules/@fontsource/luckiest-guy/files');
const interDir = resolve('node_modules/@fontsource-variable/inter/files');

/** Hypnotic spiral eye: almond outline, spiral iris, lash ticks. */
function mark(cx, cy, s) {
  const eye = `M${cx - s} ${cy} Q${cx} ${cy - s * 0.95} ${cx + s} ${cy} Q${cx} ${cy + s * 0.95} ${cx - s} ${cy} Z`;
  let d = '';
  const turns = 2.25;
  const rMax = s * 0.3;
  const n = 220;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2 - Math.PI / 2;
    const r = rMax * t;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)} `;
  }
  const lashes = [-0.55, -0.2, 0.2, 0.55]
    .map((k) => {
      const x = cx + k * s * 0.9;
      const y0 = cy - s * 0.62 * Math.cos(k * 1.4);
      return `<path d="M${x.toFixed(1)} ${(y0 - s * 0.06).toFixed(1)} L${(x + k * s * 0.18).toFixed(1)} ${(y0 - s * 0.3).toFixed(1)}" stroke="#fff" stroke-width="${(s * 0.1).toFixed(1)}" stroke-linecap="round"/>`;
    })
    .join('');
  return `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="${eye}" stroke-width="${(s * 0.13).toFixed(1)}"/>
    <circle cx="${cx}" cy="${cy}" r="${(s * 0.44).toFixed(1)}" stroke-width="${(s * 0.085).toFixed(1)}"/>
    <path d="${d}" stroke-width="${(s * 0.075).toFixed(1)}"/>
  </g>${lashes}`;
}

const b64 = (f) => readFileSync(f).toString('base64');
const fontCss = `@font-face{font-family:LG;src:url(data:font/woff2;base64,${b64(fontDir + '/luckiest-guy-latin-400-normal.woff2')}) format('woff2')}@font-face{font-family:IN;src:url(data:font/woff2;base64,${b64(interDir + '/inter-latin-wght-normal.woff2')}) format('woff2');font-weight:100 900}`;

const wide = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" width="1200" height="360">
  ${mark(180, 178, 150)}
  <text x="370" y="205" font-family="LG" font-size="190" fill="#fff" letter-spacing="6" transform="skewX(-6)">PSYCHO</text>
  <text x="382" y="300" font-family="IN" font-weight="800" font-size="58" fill="#fff" letter-spacing="41">GAMES</text>
</svg>`;

const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${mark(512, 380, 300)}
  <text x="512" y="800" text-anchor="middle" font-family="LG" font-size="200" fill="#fff" letter-spacing="6">PSYCHO</text>
  <text x="522" y="915" text-anchor="middle" font-family="IN" font-weight="800" font-size="72" fill="#fff" letter-spacing="52">GAMES</text>
</svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
for (const [name, svg, w, h] of [
  ['PsychoGames-Logo', wide, 1200, 360],
  ['PsychoGames-Logo-Square', square, 1024, 1024],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(`<html><head><style>${fontCss}html,body{margin:0;background:transparent}</style></head><body>${svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png`, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  // preview on dark
  await page.setContent(`<html><head><style>${fontCss}html,body{margin:0;background:#0e0e10}</style></head><body>${svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-preview-dark.png`, clip: { x: 0, y: 0, width: w, height: h } });
  writeFileSync(`${out}/${name}.svg`, svg);
  await page.close();
}
await browser.close();
console.log(out);
