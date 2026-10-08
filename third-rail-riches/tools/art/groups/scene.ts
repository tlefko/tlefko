/**
 * Environment review group: every Third Rail Riches station piece on one contact sheet.
 * npx tsx tools/art/sheet.ts scene 1
 */
import {
  stationBackdrop,
  tunnelPortal,
  signalHead,
  clockFace,
  clockHand,
  pendantLamp,
  enamelSign,
  poster,
  bench,
  vendingMachine,
  litterBin,
  floorGrate,
  pigeonPerch,
  commuterCrowd,
  sparkArc,
  starGlint,
  ironColumn,
  carFrame,
  markerLamp,
  CLOCK,
  HAND,
  CAR,
  SIGNAL,
  SIGNAL_COLORS,
} from '../../../src/art/scene';
import { C } from '../../../src/art/kit';

const wall = `linear-gradient(${C.iron},${C.tunnel})`;
const S = 110;
/** Nested SVGs must not inherit the sheet's `svg{height:auto}` CSS: show composites as images, like the game rasterises them. */
const asImg = (svg: string) => `<img style="display:block;width:100%" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;

/** Clock with its hands placed the way the renderer does (11:58). */
const clockAssembled = () => {
  const k = 220 / 256;
  const hand = (kind: 'hour' | 'minute', deg: number) =>
    `<div style="position:absolute;left:${CLOCK.cx * k - HAND.px * k}px;top:${CLOCK.cy * k - HAND.py * k}px;width:${HAND.w * k}px;height:${HAND.h * k}px;transform-origin:${HAND.px * k}px ${HAND.py * k}px;transform:rotate(${deg}deg)">${clockHand(kind)}</div>`;
  return `<div style="position:relative;width:220px;height:220px">${clockFace()}${hand('hour', -1)}${hand('minute', -12)}<div style="position:absolute;left:52px;top:-44px;width:64px">${pigeonPerch('sit')}</div><div style="position:absolute;left:104px;top:-44px;width:64px;transform:scaleX(-1)">${pigeonPerch('peck')}</div></div>`;
};

/** Signal head with its red aspect lit. */
const signalLit = () => {
  const L = SIGNAL.lenses[0];
  return `<div style="position:relative;width:72px;height:210px">${signalHead()}<div style="position:absolute;left:${L.x - 30}px;top:${L.y - 30}px;width:60px;height:60px;border-radius:50%;background:radial-gradient(${SIGNAL_COLORS.red},transparent 65%);mix-blend-mode:screen"></div></div>`;
};

export default () => [
  {
    label: 'station backdrop (1200 x 700 sample, S = 110)',
    w: 1200,
    bg: C.ink,
    svg: asImg(stationBackdrop({
      w: 1200,
      h: 700,
      S,
      ceilY: 34,
      bandY: 430,
      baseY: 520,
      lipY: 590,
      floorY: 650,
      tunnels: [
        { x: 10, w: 200, side: -1 },
        { x: 990, w: 200, side: 1 },
      ],
      signals: [
        { x: 240, y: 330, h: 100 },
        { x: 960, y: 330, h: 100 },
      ],
      columns: [
        { x: 340, w: 48 },
        { x: 860, w: 48 },
      ],
      posters: [{ x: 420, y: 190, w: 110, kind: 0 }, { x: 680, y: 190, w: 110, kind: 1 }],
      signs: [{ x: 520, y: 340, w: 170, kind: 0 }],
      props: [
        { kind: 'vending', x: 300, w: 64, y: 640 },
        { kind: 'bench', x: 600, w: 220, y: 640 },
        { kind: 'bin', x: 880, w: 52, y: 640 },
      ],
      grates: [{ x: 760, y: 655, w: 110 }],
      lamps: [
        { x: 300, y: 140 },
        { x: 900, y: 140 },
      ],
    })),
  },
  { label: 'tunnel mouth (left / right)', w: 520, bg: wall, svg: `<div style="display:flex;gap:10px">${tunnelPortal(-1)}${tunnelPortal(1)}</div>` },
  { label: 'signal head (dark / red lit)', w: 200, bg: wall, svg: `<div style="display:flex;gap:20px">${signalHead()}${signalLit()}</div>` },
  { label: 'clock + hands + pigeons (11:58)', w: 260, bg: wall, svg: `<div style="padding-top:40px">${clockAssembled()}</div>` },
  { label: 'clock hands', w: 120, bg: C.tile, svg: `<div style="display:flex;gap:10px">${clockHand('hour')}${clockHand('minute')}</div>` },
  { label: 'pendant lamp', w: 160, bg: wall, svg: pendantLamp() },
  { label: 'enamel signs', w: 320, bg: wall, svg: `<div style="display:flex;flex-direction:column;gap:8px">${enamelSign(0)}${enamelSign(1)}${enamelSign(2)}</div>` },
  { label: 'posters', w: 520, bg: wall, svg: `<div style="display:flex;gap:8px">${poster(0)}${poster(1)}${poster(2)}</div>` },
  { label: 'bench', w: 360, bg: wall, svg: bench() },
  { label: 'vending machine / bin', w: 300, bg: wall, svg: `<div style="display:flex;gap:16px;align-items:flex-end">${vendingMachine()}${litterBin()}</div>` },
  { label: 'floor grate', w: 260, bg: C.g4, svg: floorGrate() },
  { label: 'pigeons', w: 280, bg: wall, svg: `<div style="display:flex;gap:8px">${pigeonPerch('sit')}${pigeonPerch('peck')}</div>` },
  { label: 'iron column', w: 120, bg: wall, svg: `<div style="width:60px;margin:auto">${ironColumn(480)}</div>` },
  { label: 'Rush Hour crowd tile', w: 700, bg: C.tile, svg: commuterCrowd() },
  { label: 'spark arcs / glint', w: 420, bg: C.ink, svg: `<div style="display:flex;gap:8px;align-items:center">${sparkArc(1)}${sparkArc(2)}<div style="width:48px">${starGlint()}</div></div>` },
  { label: `car-window reel frame (S = 100 units, ${CAR.vw} x ${CAR.vh})`, w: 760, bg: C.ink, svg: carFrame() },
  { label: 'marker lamp', w: 100, bg: C.maroon, svg: markerLamp() },
];
