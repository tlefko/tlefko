/**
 * Composed-scene harness for the station (Background + Reels) without the rest of the game.
 *   npx vite --port 5402  ->  /tools/art/scene-harness.html?mood=witching&train=1&antic=2,3&low=1&t=3
 * Grey squares stand in for symbols, outlines for the logo / win bar / meter, translucent boxes for
 * the cast's motion envelopes, and a dark bar for the HUD.
 */
import { Application, Graphics } from 'pixi.js';
import { computeLayout, CAPTAIN_EXTENT, PARROT_EXTENT, CAPTAIN_UNITS, PARROT_UNITS, COLS, ROWS } from '../../src/render/layout';
import { Background } from '../../src/render/scene/Background';
import { Reels, rowTrackY } from '../../src/render/grid/Reels';

const q = new URLSearchParams(location.search);
const app = new Application();
await app.init({ resizeTo: window, background: 0x000000, antialias: true, resolution: Math.min(2, devicePixelRatio), autoDensity: true });
document.getElementById('app')!.appendChild(app.canvas);
const W = app.screen.width;
const H = app.screen.height;
const L = computeLayout(W, H);
const bg = new Background();
const reels = new Reels();
const over = new Graphics();
app.stage.addChild(bg, reels.back, over, reels.front);
bg.setLow(q.get('low') === '1');
await Promise.all([bg.layout(L, app.renderer.resolution), reels.layout(L, app.renderer.resolution)]);
// stand-in symbols
for (let c = 0; c < COLS; c++)
  for (let r = 0; r < ROWS; r++) {
    const x = L.grid.x + c * (L.S + L.gx);
    const y = L.grid.y + r * L.S;
    if (q.get('cells') !== '0') over.roundRect(x + L.S * 0.14, y + L.S * 0.14, L.S * 0.72, L.S * 0.72, L.S * 0.16).fill({ color: 0x8a8a8a, alpha: 0.55 });
  }
if (q.get('track') === '1') for (let r = 0; r < ROWS; r++) over.moveTo(L.grid.x, rowTrackY(L, r)).lineTo(L.grid.x + L.grid.w, rowTrackY(L, r)).stroke({ width: 1, color: 0xff00ff });
for (const b of [L.logo, L.winBar, L.meter]) over.rect(b.x, b.y, b.w, b.h).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });
const env = (c: typeof L.captain, E: typeof CAPTAIN_EXTENT, U: number) => {
  const k = c.h / U;
  const l = c.flip ? E.r : E.l;
  const r = c.flip ? E.l : E.r;
  over.rect(c.x - l * k, c.y - E.h * k, (l + r) * k, E.h * k).fill({ color: 0xff5050, alpha: 0.12 }).stroke({ width: 1, color: 0xff5050, alpha: 0.5 });
  over.roundRect(c.x - c.h * 0.18, c.y - c.h, c.h * 0.36, c.h, c.h * 0.1).fill({ color: 0x302020, alpha: 0.6 });
};
if (q.get('cast') !== '0') {
  env(L.captain, CAPTAIN_EXTENT, CAPTAIN_UNITS);
  env(L.parrot, PARROT_EXTENT, PARROT_UNITS);
}
over.rect(0, H - L.hudH, W, L.hudH).fill({ color: 0x140c08, alpha: q.get('hud') === '0' ? 0 : 0.92 });
const mood = q.get('mood');
if (mood) bg.setBonusLight(mood as 'witching');
if (q.get('antic')) reels.setAnticipation(L, q.get('antic')!.split(',').map(Number));
const B = bg as unknown as { train: { next: number; t: number } };
if (q.get('train')) B.train.next = 0;
// advance time: t seconds of simulated frames
const t = Number(q.get('t') ?? 2.5);
for (let i = 0; i < t * 30; i++) bg.update(1000 / 30);
app.ticker.add((tk) => bg.update(tk.deltaMS));
// let GSAP tweens (anticipation) settle, then freeze for the screenshot
setTimeout(() => {
  if (q.get('still') === '1') {
    app.ticker.stop();
    app.render();
  }
  (window as unknown as { __ready: boolean }).__ready = true;
}, 800);
