/**
 * Art sheet for the props (npx tsx tools/art/sheet.ts props 2): every piece on its own plus
 * composites laid out the way the renderers place the sprites (wheel, fuse meter, chest pop).
 */
import {
  coin,
  chip,
  wheelFace,
  wheelRim,
  wheelShadow,
  wheelWinMark,
  wheelHub,
  wheelPointer,
  bulbGlow,
  HELM,
  HUB_BEZEL,
  POINTER_PIVOT,
  POINTER_TIP,
  winBarFrame,
  fuseRailBack,
  fuseRailFront,
  fuseRopeLit,
  fuseFlame,
  waxSeal,
  FUSE,
  ribbon,
  jackBody,
  jackLid,
  jackLidOpen,
  chestLock,
  chestHoard,
  chestRays,
  jester,
  jesterJaw,
  CHEST,
  type FuseLayout,
} from '../../../src/art/props';
import { puff, twinkle, ember, note, spark } from '../../../src/art/fx';

const NIGHT = 'radial-gradient(circle at 50% 35%, #1d3a66, #0b1630)';
const box = (w: number, h: number, inner: string, extra = '') => `<div class="pk" style="position:relative;width:${w}px;height:${h}px;${extra}">${inner}</div>`;
const at = (x: number, y: number, w: number, svg: string, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;${extra}">${svg}</div>`;

/** The Captain's Wheel as Wheel.ts assembles it. */
function helm(D: number, rotDeg = 0, lit = false, win = false): string {
  const u = D / 512;
  const hub = (HELM.hub * u * 256) / HUB_BEZEL;
  const pw = ((HELM.ptrPivot - HELM.ptrTip) * u * 128) / (POINTER_TIP[1] - POINTER_PIVOT[1]);
  const lamps = lit
    ? HELM.lamps
        .map((a, i) => {
          const r = HELM.lampR * u;
          const s = D * 0.085;
          const x = D / 2 + Math.sin(((a + rotDeg) * Math.PI) / 180) * r;
          const y = D / 2 - Math.cos(((a + rotDeg) * Math.PI) / 180) * r;
          return at(x - s / 2, y - s / 2, s, bulbGlow(), `mix-blend-mode:screen;opacity:${i % 2 ? 1 : 0.35}`);
        })
        .join('')
    : '';
  return box(
    D,
    D,
    `${at(D * 0.014, D * 0.04, D, wheelShadow(), `opacity:.6;transform:rotate(${rotDeg}deg)`)}
    ${at(0, 0, D, wheelFace(), `transform:rotate(${rotDeg}deg)`)}
    ${win ? at(0, 0, D, wheelWinMark(), `transform:rotate(${rotDeg}deg);mix-blend-mode:screen`) : ''}
    ${lamps}
    ${at(0, 0, D, wheelRim())}
    ${at(D / 2 - hub / 2, D / 2 - hub / 2, hub, wheelHub())}
    ${at(D / 2 - (pw * POINTER_PIVOT[0]) / 128, D / 2 - HELM.ptrPivot * u - (pw * POINTER_PIVOT[1]) / 128, pw, wheelPointer())}`,
  );
}

const HEAT: [string, string, string][] = [
  ['#dcfff0', '#7dffb2', '#2fd184'],
  ['#fffbe0', '#ffe95c', '#ffc233'],
  ['#fff3b8', '#ffc233', '#ff7a1f'],
  ['#ffd9a8', '#ff6a2a', '#d9340f'],
  ['#ffd0dc', '#ff3a5a', '#b3102f'],
  ['#ffffff', '#e2bcff', '#9b4dff'],
];

/** The Powder Fuse as TantrumMeter.ts assembles it (label and multiplier text are game text). */
function fuse(w: number, h: number, lit: number): string {
  const aspect = w / h;
  const U = 100 * aspect;
  const labelW = 0.2 * U;
  const badgeW = 0.13 * U;
  const n = 10;
  const step = (U - labelW - badgeW) / n;
  const cups = Array.from({ length: n }, (_, i) => labelW + step * (i + 0.5));
  const endX = U - badgeW / 2;
  const L: FuseLayout = { aspect, labelW, cups, endX };
  const k = h / 100;
  const artH = (h * (100 + FUSE.padTop + FUSE.padBottom)) / 100;
  const top = -FUSE.padTop * k;
  const burn = lit === 0 ? labelW - 14 : lit >= n ? endX : cups[lit - 1] + step * 0.38;
  const flames = cups
    .map((x, i) => {
      const pal = HEAT[Math.min(5, Math.floor((i / n) * 6))];
      const fs = Math.min(step * 0.9, 85) * k * (0.8 + 0.45 * (i / (n - 1)));
      const on = i < lit;
      const fsz = on ? fs : fs * 0.72;
      return at(x * k - fsz / 2, (FUSE.cupRim + 1.5) * k - fsz * 0.95, fsz, fuseFlame(pal), on ? '' : 'opacity:.42;filter:brightness(.25) saturate(0)');
    })
    .join('');
  const seal = h * 1.1;
  const sp = h * 0.5;
  return box(
    w,
    h,
    `${at(0, top, w, fuseRailBack(L))}
    <div style="position:absolute;left:0;top:${top}px;width:${burn * k}px;height:${artH}px;overflow:hidden">${at(0, 0, w, fuseRopeLit(L))}</div>
    ${at(0, top, w, fuseRailFront(L))}
    ${flames}
    ${lit > 0 && lit < n ? at(burn * k - sp / 2, FUSE.railY * k - sp / 2, sp, spark(), 'mix-blend-mode:screen') : ''}
    ${at(endX * k - seal / 2, h / 2 - seal / 2, seal, waxSeal())}`,
    'margin:34px 0 14px',
  );
}

/** The chest pop, closed (as the scatter lands) and fully open (after the burst). */
function chest(open: boolean, S = 256): string {
  const k = S / 256;
  const full = (svg: string, extra = '') => at(0, 0, S, svg, extra);
  if (!open) return box(S, S, `${full(jackLid())}${full(jackBody())}${full(chestLock())}`);
  const head = S * 0.8;
  const neckY = (CHEST.mouth + 6) * k - S * 0.92;
  return box(
    S,
    S,
    `${full(jackLidOpen())}
    ${at(S / 2 - S * 0.675, (CHEST.mouth + 4) * k - S * 1.35 * (200 / 256), S * 1.35, chestRays(), 'mix-blend-mode:screen;opacity:.85')}
    ${at(S / 2 - head / 2, neckY - head * (200 / 256), head, jester())}
    ${at(S / 2 - head / 2, neckY - head * (200 / 256) + 6, head, jesterJaw())}
    ${full(chestHoard())}${full(jackBody())}${full(chestLock(), `transform:translateY(${(CHEST.lockOpen - CHEST.lockClosed) * k}px)`)}`,
    `margin-top:${S * 0.95}px`,
  );
}

export default () => [
  {
    label: "Captain's Wheel (assembled), 480px",
    w: 500,
    bg: NIGHT,
    svg: `<style>.pk svg{width:100%;height:auto}</style>${helm(480)}`,
  },
  { label: 'wheel spun 37deg, lamps lit, win mark', w: 500, bg: NIGHT, svg: helm(480, 37, true, true) },
  { label: 'wheel at 306px (1440x900) and 150px (390 portrait)', w: 500, bg: NIGHT, svg: `<div style="display:flex;gap:16px;align-items:center">${helm(306)}${helm(150)}</div>` },
  { label: 'wheel face (the part that turns)', w: 420, bg: NIGHT, svg: box(400, 400, at(0, 0, 400, wheelFace())) },
  { label: 'static light (rim shade, sheen, moon edge)', w: 300, svg: box(280, 280, at(0, 0, 280, wheelRim())) },
  { label: 'cast shadow / win mark', w: 300, svg: `<div style="display:flex;gap:8px">${box(140, 140, at(0, 0, 140, wheelShadow()))}${box(140, 140, at(0, 0, 140, wheelWinMark()))}</div>` },
  { label: 'hub medallion / pointer / lamp glow', w: 420, bg: NIGHT, svg: `<div style="display:flex;gap:12px;align-items:center">${box(180, 180, at(0, 0, 180, wheelHub()))}${box(128, 128, at(0, 0, 128, wheelPointer()))}${box(64, 64, at(0, 0, 64, bulbGlow()))}</div>` },
  { label: 'win nameboard, 8.4:1 (landscape)', w: 900, bg: NIGHT, svg: box(880, 105, at(0, 0, 880, winBarFrame(880 / 105))) },
  { label: 'win nameboard, 6.9:1 (portrait)', w: 560, bg: NIGHT, svg: box(540, 78, at(0, 0, 540, winBarFrame(540 / 78))) },
  { label: 'Powder Fuse, 4 lit (spark at the burn point)', w: 900, bg: NIGHT, svg: fuse(880, 80, 4) },
  { label: 'Powder Fuse, full', w: 900, bg: NIGHT, svg: fuse(880, 80, 10) },
  { label: 'fuse flames (heat ramp) / plunder seal', w: 760, bg: NIGHT, svg: `<div style="display:flex;align-items:center">${HEAT.map((p) => box(96, 96, at(0, 0, 96, fuseFlame(p)))).join('')}${box(120, 120, at(0, 0, 120, waxSeal()))}</div>` },
  { label: 'logo scroll banner', w: 560, bg: NIGHT, svg: box(540, 125, at(0, 0, 540, ribbon(520))) },
  { label: 'chest pop: closed', w: 280, bg: NIGHT, svg: chest(false) },
  { label: 'chest pop: burst open, skull sprung', w: 300, bg: NIGHT, svg: chest(true) },
  { label: 'skull + jaw (jaw drops to laugh)', w: 280, bg: NIGHT, svg: box(256, 256, `${at(0, 0, 256, jester())}${at(0, 10, 256, jesterJaw())}`) },
  { label: 'rays / hoard / open lid / lock', w: 560, bg: NIGHT, svg: `<div style="display:flex;gap:6px">${[chestRays(), chestHoard(), jackLidOpen(), chestLock()].map((s) => box(128, 128, at(0, 0, 128, s))).join('')}</div>` },
  { label: 'doubloons (gold, silver, bronze)', w: 560, bg: NIGHT, svg: `<div style="display:flex;gap:8px">${(['gold', 'silver', 'bronze'] as const).map((m) => box(170, 170, at(0, 0, 170, coin(m)))).join('')}</div>` },
  { label: 'tokens (add, mul, max)', w: 420, bg: NIGHT, svg: `<div style="display:flex;gap:8px">${(['add', 'mul', 'max'] as const).map((m) => box(128, 128, at(0, 0, 128, chip(m)))).join('')}</div>` },
  {
    label: 'fx: smoke puff, gold glint, ember, parrot feather, fuse spark',
    w: 460,
    bg: NIGHT,
    svg: `<div style="display:flex;gap:14px;align-items:center">${box(110, 110, at(0, 0, 110, puff()))}${box(64, 64, at(0, 0, 64, twinkle()))}${box(40, 40, at(0, 0, 40, ember()))}${box(72, 72, at(0, 0, 72, note()))}${box(72, 72, at(0, 0, 72, spark()))}</div>`,
  },
];
