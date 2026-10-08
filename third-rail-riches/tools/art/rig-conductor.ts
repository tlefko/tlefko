/**
 * Standalone motion harness for Conductor Casey (src/render/characters/Conductor.ts).
 *   npx vite --port 5400   then open http://localhost:5400/tools/art/rig-conductor.html?quality=high
 * Buttons cycle every react() state, accent() and dispatch(); the dashed box is the layout's
 * motion envelope (CAPTAIN_EXTENT, design units) and the green line the platform. The page records
 * the rig's extremes in design units on window.ext (for playwright QA).
 */
import { Application, Container, Graphics } from 'pixi.js';
import gsap from 'gsap';
import { Conductor, type ConductorState } from '../../src/render/characters/Conductor';
import { CAPTAIN_EXTENT } from '../../src/render/layout';

const W = 1000;
const H = 760;
const app = new Application();
await app.init({ width: W, height: H, background: new URLSearchParams(location.search).get('bg') ?? '#e9dcbc', antialias: true, resolution: window.devicePixelRatio, autoDensity: true });
document.body.appendChild(app.canvas);
gsap.ticker.lagSmoothing(0);

const k = 1; // px per design unit (h = 520)
const X0 = 330;
const Y0 = 700;
const guides = new Graphics();
const E = CAPTAIN_EXTENT;
guides.rect(X0 - E.l * k, Y0 - E.h * k, (E.l + E.r) * k, E.h * k).stroke({ width: 2, color: 0xd04040, alpha: 0.7 });
guides.moveTo(0, Y0).lineTo(W, Y0).stroke({ width: 2, color: 0x2a9a60 });
app.stage.addChild(guides);

const stage = new Container();
app.stage.addChild(stage);
const casey = new Conductor();
casey.position.set(X0, Y0);
stage.addChild(casey);
await casey.build(520 * k, window.devicePixelRatio);

let fxUpdate: ((ms: number) => void) | null = null;
// particles are optional: Particles depends on modules other tracks are rewriting
try {
  const { Particles } = await import('../../src/render/fx/Particles');
  const fx = new Particles();
  await fx.build(90, window.devicePixelRatio);
  app.stage.addChild(fx);
  casey.fx = fx;
  fxUpdate = (ms) => fx.update(ms);
} catch (e) {
  console.warn('no particles', e);
}

const ext = { l: 0, r: 0, h: 0, foot: 0 };
(window as unknown as { ext: typeof ext }).ext = ext;
const alpha = new URLSearchParams(location.search).has('alpha');
const measure = () => {
  // the soft additive glows don't count toward the envelope
  const c = casey as unknown as Record<string, { visible: boolean }>;
  const glows = [c.lanGlow, c.lanHalo];
  const vis = glows.map((g) => g.visible);
  for (const g of glows) g.visible = false;
  const b = casey.getBounds();
  let [minX, maxX, minY, maxY] = [b.minX, b.maxX, b.minY, b.maxY];
  if (alpha) {
    // alpha-exact (like layout.ts measured CAPTAIN_EXTENT): scan the rig's own pixels
    const res = 1;
    const px = app.renderer.extract.pixels({ target: casey, resolution: res });
    const { pixels, width, height } = px;
    let x0 = width;
    let x1 = -1;
    let y0 = height;
    let y1 = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (pixels[(y * width + x) * 4 + 3] > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 >= 0) {
      minX = b.minX + x0 / res;
      maxX = b.minX + (x1 + 1) / res;
      minY = b.minY + y0 / res;
      maxY = b.minY + (y1 + 1) / res;
    }
  }
  glows.forEach((g, i) => (g.visible = vis[i]));
  ext.l = Math.max(ext.l, (X0 - minX) / k);
  ext.r = Math.max(ext.r, (maxX - X0) / k);
  ext.h = Math.max(ext.h, (Y0 - minY) / k);
  ext.foot = Math.max(ext.foot, (maxY - Y0) / k);
};
/** Manual clock (?manual): GSAP and the rig advance only through step(), so captures are exact. */
const manual = new URLSearchParams(location.search).has('manual');
let clock = gsap.ticker.time;
if (manual) gsap.ticker.remove(gsap.updateRoot);
const tick = (ms: number) => {
  casey.update(ms);
  fxUpdate?.(ms);
  measure();
};
app.ticker.add((t) => {
  if (!manual) tick(t.deltaMS);
});
function step(ms: number) {
  const n = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < n; i++) {
    clock += 1 / 60;
    gsap.updateRoot(clock);
    tick(1000 / 60);
  }
  app.render();
}
/** Which rig child reaches furthest left / right / up right now (design units). */
function who() {
  const rig = (casey.children[0] as Container).children;
  const c = casey as unknown as Record<string, unknown>;
  const names = new Map<unknown, string>();
  for (const key of Object.keys(c)) if (rig.includes(c[key] as never)) names.set(c[key], key);
  return rig
    .filter((ch) => ch.visible)
    .map((ch) => {
      const b = ch.getBounds();
      return { n: names.get(ch) ?? '?', l: Math.round((X0 - b.minX) / k), r: Math.round((b.maxX - X0) / k), h: Math.round((Y0 - b.minY) / k), f: Math.round((b.maxY - Y0) / k) };
    });
}
Object.assign(window, { step, who });

const states: ConductorState[] = ['idle', 'cheer', 'pray', 'dance', 'shock', 'laugh', 'duck', 'watch'];
const ui = document.getElementById('ui')!;
const btn = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  ui.appendChild(b);
};
for (const s of states) btn(s, () => casey.react(s));
btn('whoop', () => casey.accent('whoop'));
btn('nod', () => casey.accent('nod'));
btn('flinch', () => casey.accent('flinch'));
btn('dispatch', () => void casey.dispatch());
btn('glow on', () => casey.lanternGlow(true));
btn('glow off', () => casey.lanternGlow(false));
btn('look board', () => casey.lookAt(900, 300));
btn('look free', () => casey.lookAt(null));
btn('reset ext', () => Object.assign(ext, { l: 0, r: 0, h: 0, foot: 0 }));
Object.assign(window, { casey, gsap });
