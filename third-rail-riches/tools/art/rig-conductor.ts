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

// particles are optional: Particles depends on modules other tracks are rewriting
try {
  const { Particles } = await import('../../src/render/fx/Particles');
  const fx = new Particles();
  await fx.build(90, window.devicePixelRatio);
  app.stage.addChild(fx);
  casey.fx = fx;
  app.ticker.add((t) => fx.update(t.deltaMS));
} catch (e) {
  console.warn('no particles', e);
}

const ext = { l: 0, r: 0, h: 0, foot: 0 };
(window as unknown as { ext: typeof ext }).ext = ext;
app.ticker.add((t) => {
  casey.update(t.deltaMS);
  const b = casey.getBounds();
  ext.l = Math.max(ext.l, (X0 - b.minX) / k);
  ext.r = Math.max(ext.r, (b.maxX - X0) / k);
  ext.h = Math.max(ext.h, (Y0 - b.minY) / k);
  ext.foot = Math.max(ext.foot, (b.maxY - Y0) / k);
});

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
