/**
 * Motion harness for Rivets (render/characters/Rat.ts). `npx vite --port 5401`, open
 * /tools/art/rig-rat.html. Six rats, one per reaction, at h = 300 px, each with the
 * PARROT_EXTENT envelope drawn round it; ?solo=1 shows one rat at h = 360 cycling everything.
 * window.rig exposes the rats, a measure() of the alpha bounds in design units, and step(ms).
 */
import { Application, Container, Graphics } from 'pixi.js';
import { Rat, type RatState } from '../../src/render/characters/Rat';
import { PARROT_EXTENT } from '../../src/render/layout';

const solo = new URLSearchParams(location.search).has('solo');
const H = solo ? 360 : 300;
const states: RatState[] = ['idle', 'happy', 'squeak', 'worried', 'duck', 'watch'];
const W = solo ? 700 : 6 * 300;
const app = new Application();
await app.init({ width: W, height: H * 1.35, background: '#3a3130', antialias: true, resolution: 1 });
document.body.appendChild(app.canvas);
let fx: unknown;
try {
  const { Particles } = await import('../../src/render/fx/Particles');
  const p = new Particles();
  await p.build(H * 0.25, 1);
  fx = p;
} catch (e) {
  console.warn('no particles', e);
}
const stage = new Container();
app.stage.addChild(stage);
const k = H / 360;
const rats: Rat[] = [];
const n = solo ? 1 : states.length;
for (let i = 0; i < n; i++) {
  const x = solo ? W / 2 : 150 + i * 300;
  const y = H * 1.3;
  const env = new Graphics();
  const E = PARROT_EXTENT;
  env.rect(x - E.l * k, y - E.h * k, (E.l + E.r) * k, E.h * k).stroke({ color: 0x66ccff, width: 1, alpha: 0.6 });
  env.moveTo(x - 140 * k, y).lineTo(x + 140 * k, y).stroke({ color: 0x999999, width: 1 });
  stage.addChild(env);
  const r = new Rat();
  r.position.set(x, y);
  if (fx) (r as { fx?: unknown }).fx = fx;
  stage.addChild(r);
  await r.build(H, 1);
  rats.push(r);
  if (!solo) r.react(states[i]);
}
if (fx) stage.addChild(fx as Container);
let manual = false;
app.ticker.add((t) => {
  if (manual) return;
  for (const r of rats) r.update(t.deltaMS);
  (fx as { update?: (d: number) => void } | undefined)?.update?.(t.deltaMS);
});
const measure = () =>
  rats.map((r) => {
    const b = r.getLocalBounds();
    return { l: Math.round(-b.x / k), r: Math.round((b.x + b.width) / k), h: Math.round(-b.y / k) };
  });
(window as unknown as Record<string, unknown>).rig = {
  rats,
  measure,
  states,
  manual: (on: boolean) => (manual = on),
  step: (ms: number) => {
    for (let i = 0; i < ms / 16; i++) {
      for (const r of rats) r.update(16);
    }
  },
};
document.getElementById('lab')!.textContent = solo ? 'solo' : states.join(' | ');
(window as unknown as Record<string, unknown>).ready = true;

/** Running max of rat 0's alpha bounds (design units), sampled every frame; reset with rig.resetMax(). */
const maxExt = { l: 0, r: 0, h: 0 };
app.ticker.add(() => {
  const b = rats[0].getLocalBounds();
  maxExt.l = Math.max(maxExt.l, Math.round(-b.x / k));
  maxExt.r = Math.max(maxExt.r, Math.round((b.x + b.width) / k));
  maxExt.h = Math.max(maxExt.h, Math.round(-b.y / k));
});
Object.assign((window as unknown as { rig: object }).rig, {
  max: () => ({ ...maxExt }),
  resetMax: () => Object.assign(maxExt, { l: 0, r: 0, h: 0 }),
});
