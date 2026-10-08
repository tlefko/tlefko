import { t, num, cjkScript, rtl } from '../../i18n';
import { BitmapText, CanvasTextMetrics, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture, type FederatedPointerEvent, type Renderer } from 'pixi.js';
import gsap from 'gsap';
import { Wheel, type WheelTextures } from '../wheel/Wheel';
import { Logo } from '../Logo';
import { bitmapNum, displayText, FONT_UI, type DisplayText, type NumTone } from '../text';
import type { SymbolTextures } from '../grid/SymbolView';
import type { Layout, Rect } from '../layout';
import { Particles } from '../fx/Particles';
import { quality } from '../quality';
import { speed } from '../timing';
import { svgTexture, softDotTexture, canvasTexture, freeTexture } from '../textures';
import { MAX_WIN, CHARGE_MAX, CHARGE_MAX_BOOST, BOOST_COST, BOMB_FUSE } from '../../math/types';
import { C, composeSymbol, nextId, spikeRing } from '../../art/kit';
import { SYMBOL_ART } from '../../art/symbols';
import { chestRays, WHEEL_SEGMENTS, mix, type SegKind } from '../../art/props';
import { skullAndBones } from '../../art/captain';
import { spark as sparkArt } from '../../art/fx';
import stats from '../../stake/stats.json';
import type { Captain } from '../characters/Captain';
import type { Parrot } from '../characters/Parrot';

/* ============================================================================================
 * Opening sequence (track S): the logo drops in and bounces, a light sweep runs across it, Cap'n
 * Kaboom and Sparks pop up at their posts, and a carousel of plank cards runs live mini-demos of
 * the features (Kaboom Bomb, Powder Kegs, Captain's Wheel, Powder Boost, max win). A big PLAY
 * plaque pulses at the bottom; a tap anywhere (the gesture that unlocks audio) hands over to the
 * game: the cards fall away, the logo flies to its corner and the shade lifts off the live scene.
 * "Don't show again" (per game, localStorage) skips straight to a single PLAY tap over the game.
 * ========================================================================================== */

/** "Don't show again", stored per game. */
const SKIP_KEY = 'powder-keg-cove.intro.skip';

/** True when the player asked not to see the intro again. */
export function introSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

function setIntroSkipped(on: boolean) {
  try {
    if (on) localStorage.setItem(SKIP_KEY, '1');
    else localStorage.removeItem(SKIP_KEY);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

/** Base-game volatility on a 5-skull scale, from the verified standard deviation (stats.json). */
const VOL_PIPS = (() => {
  const sd = stats.BASE?.sd ?? 0;
  return sd >= 30 ? 5 : sd >= 15 ? 4 : sd >= 8 ? 3 : sd >= 4 ? 2 : 1;
})();

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const F = (n: number) => n.toFixed(1);
const hex = (c: string) => parseInt(c.slice(1), 16);
/** Logo.layout draws the lockup into a w x 0.62w box (lettering.LOGO_BOX) and fills its height. */
const LOGO_K = 0.62;
const LOGO_RECT_K = 0.62;
/** The lockup's foot (its squash pivot), per unit of width. */
const LOGO_FOOT = 0.6;
/** Handoff: the lockup's flight into the game's logo spot, then the cross-fade to the game's own. */
export const LOGO_FLY = 0.62;
export const LOGO_SWAP = 0.2;
/** PLAY's largest scale in any animation (entrance overshoot, idle pulse, press pop), with margin. */
const PLAY_MAX_K = 1.22;
const PLAY_W = 400;
const PLAY_H = 150;
const PLAY_ASPECT = PLAY_W / PLAY_H;
/** Plaque art: the rim's centre line (the fuse spark runs round it), in art units. */
const RIM = { x0: 70, x1: 330, cy: 67, r: 51 };

/* ------------------------------------------------------------------------------------------
 * Art (house ink + cel, docs/ART.md): SVG in code, rasterised at display size at build time.
 * ---------------------------------------------------------------------------------------- */

/** kit.composeSymbol's cel + drop filters for art on any viewBox; `s` scales the offsets. */
function celDefs(id: string, s = 1, shade = 0.3, light = 0.45): string {
  return `<filter id="${id}cel" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="${F(-15 * s)}" dy="${F(-17 * s)}" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="${F(1.4 * s)}" result="rimb"/>
    <feFlood flood-color="${C.ink}" flood-opacity="${shade}"/>
    <feComposite in2="rimb" operator="in" result="sh0"/>
    <feComposite in="sh0" in2="SourceAlpha" operator="in" result="shade"/>
    <feOffset in="SourceAlpha" dx="${F(7 * s)}" dy="${F(9 * s)}" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="rim2"/>
    <feGaussianBlur in="rim2" stdDeviation="${F(3 * s)}" result="rim2b"/>
    <feFlood flood-color="#ffffff" flood-opacity="${light}"/>
    <feComposite in2="rim2b" operator="in" result="hl0"/>
    <feComposite in="hl0" in2="SourceAlpha" operator="in" result="hl"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="hl"/></feMerge>
  </filter>
  <filter id="${id}drop" x="-12%" y="-12%" width="124%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${F(4.5 * s)}"/>
    <feOffset dy="${F(6 * s)}" result="d"/>
    <feFlood flood-color="#000" flood-opacity=".5"/>
    <feComposite in2="d" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${F(4 * s)}"/></filter>`;
}

const svgDoc = (w: number, h: number, defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;

function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): string {
  return `M${F(x0 + r)} ${F(y0)} H${F(x1 - r)} Q${F(x1)} ${F(y0)} ${F(x1)} ${F(y0 + r)} V${F(y1 - r)} Q${F(x1)} ${F(y1)} ${F(x1 - r)} ${F(y1)} H${F(x0 + r)} Q${F(x0)} ${F(y1)} ${F(x0)} ${F(y1 - r)} V${F(y0 + r)} Q${F(x0)} ${F(y0)} ${F(x0 + r)} ${F(y0)} Z`;
}

function pill(x: number, y: number, w: number, h: number): string {
  const r = h / 2;
  return `M${F(x + r)} ${F(y)} H${F(x + w - r)} A${F(r)} ${F(r)} 0 0 1 ${F(x + w - r)} ${F(y + h)} H${F(x + r)} A${F(r)} ${F(r)} 0 0 1 ${F(x + r)} ${F(y)} Z`;
}

/** A hand-inked wobbly line (wood grain). */
function wobble(x0: number, y0: number, x1: number, y1: number, amp: number, n: number, seed: number): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${F(x0)} ${F(y0)}`;
  for (let i = 1; i <= n; i++) {
    const tm = (i - 0.5) / n;
    const te = i / n;
    const o = Math.sin(seed * 1.7 + i * 2.3) * amp;
    d += ` Q${F(x0 + dx * tm + nx * o)} ${F(y0 + dy * tm + ny * o)} ${F(x0 + dx * te)} ${F(y0 + dy * te)}`;
  }
  return d;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Feature card: a mitred oak frame with brass corner plates round a night-blue panel. The short
 * side is 300 units (`aspect` = h / w), so the frame keeps its weight on wide, short cards.
 */
function boardSvg(aspect: number): string {
  const W = aspect >= 1 ? 300 : Math.round(300 / aspect);
  const H = aspect >= 1 ? Math.round(300 * aspect) : 300;
  const id = nextId('bd');
  const o = { x0: 7, y0: 5, x1: W - 7, y1: H - 13 };
  const b = 23;
  const i = { x0: o.x0 + b, y0: o.y0 + b, x1: o.x1 - b, y1: o.y1 - b };
  const outer = roundRect(o.x0, o.y0, o.x1, o.y1, 20);
  const inner = roundRect(i.x0, i.y0, i.x1, i.y1, 10);
  const grain: string[] = [];
  const vn = Math.max(4, Math.round((o.y1 - o.y0) / 38));
  const knots = [
    [o.x0 + b * 0.52, o.y0 + (o.y1 - o.y0) * 0.4, 2.6, 5.4],
    [o.x1 - b * 0.48, o.y0 + (o.y1 - o.y0) * 0.68, 2.4, 4.8],
    [o.x0 + (o.x1 - o.x0) * 0.63, o.y0 + b * 0.5, 5.6, 2.5],
    [o.x0 + (o.x1 - o.x0) * 0.31, o.y1 - b * 0.52, 5, 2.3],
  ]
    .map(([x, y, rx, ry]) => `<ellipse cx="${F(x)}" cy="${F(y)}" rx="${F(rx)}" ry="${F(ry)}"/>`)
    .join('');
  const hn = Math.max(7, Math.round((o.x1 - o.x0) / 40));
  [0.3, 0.64].forEach((k, j) => {
    grain.push(wobble(o.x0 + 24, o.y0 + b * k, o.x1 - 24, o.y0 + b * k + 1, 1.3, hn, j + 1));
    grain.push(wobble(o.x0 + 24, o.y1 - b * k, o.x1 - 24, o.y1 - b * k - 1, 1.3, hn, j + 4));
    grain.push(wobble(o.x0 + b * k, o.y0 + 24, o.x0 + b * k + 1, o.y1 - 24, 1.3, vn, j + 7));
    grain.push(wobble(o.x1 - b * k, o.y0 + 24, o.x1 - b * k - 1, o.y1 - 24, 1.3, vn, j + 9));
  });
  const miter = (
    [
      [o.x0, o.y0, i.x0, i.y0],
      [o.x1, o.y0, i.x1, i.y0],
      [o.x0, o.y1, i.x0, i.y1],
      [o.x1, o.y1, i.x1, i.y1],
    ] as const
  )
    .map(([ax, ay, bx, by]) => `M${F(ax + (bx - ax) * 0.3)} ${F(ay + (by - ay) * 0.3)} L${F(bx)} ${F(by)}`)
    .join(' ');
  const q = 2.5;
  const PL = 42;
  const PT = 14;
  const PR = 16;
  const corners = [
    [o.x0, o.y0, 1, 1],
    [o.x1, o.y0, -1, 1],
    [o.x0, o.y1, 1, -1],
    [o.x1, o.y1, -1, -1],
  ] as const;
  const plates = corners
    .map(([cx, cy, sx, sy]) => {
      const p = (u: number, v: number) => `${F(cx + sx * u)} ${F(cy + sy * v)}`;
      return `M${p(q, q + PR)} Q${p(q, q)} ${p(q + PR, q)} L${p(q + PL, q)} L${p(q + PL, q + PT)} L${p(q + PT, q + PT)} L${p(q + PT, q + PL)} L${p(q, q + PL)} Z`;
    })
    .join(' ');
  const rivetAt = corners.flatMap(([cx, cy, sx, sy]) =>
    [
      [q + PL - 8, q + PT / 2],
      [q + PT / 2, q + PL - 8],
      [q + 9, q + 9],
    ].map(([u, v]) => [cx + sx * u, cy + sy * v]),
  );
  const rivets = rivetAt.map(([x, y]) => `<circle cx="${F(x)}" cy="${F(y)}" r="3.4"/>`).join('');
  const glints = rivetAt.map(([x, y]) => `<circle cx="${F(x - 1)}" cy="${F(y - 1.1)}" r="1.2"/>`).join('');
  const panel = roundRect(i.x0 + 2, i.y0 + 2, i.x1 - 2, i.y1 - 2, 9);
  const rnd = seeded(H * 7 + 3);
  let stars = '';
  const nStars = Math.round(((i.x1 - i.x0) * (i.y1 - i.y0)) / 1500);
  for (let k = 0; k < nStars; k++) stars += `<circle cx="${F(i.x0 + 8 + rnd() * (i.x1 - i.x0 - 16))}" cy="${F(i.y0 + 8 + rnd() * (i.y1 - i.y0 - 16))}" r="${F(0.6 + rnd() * 1)}"/>`;
  return svgDoc(
    W,
    H,
    `${celDefs(id, 0.8)}<clipPath id="${id}clip"><path d="${panel}"/></clipPath>`,
    `<g filter="url(#${id}drop)">
    <path d="${outer} ${inner}" fill="${C.wood}" fill-rule="evenodd" filter="url(#${id}cel)"/>
    <g fill="none" stroke="${C.woodMid}" stroke-width="2" stroke-linecap="round" opacity=".75">${grain.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g fill="${C.woodMid}" stroke="${C.woodDark}" stroke-width="1.5">${knots}</g>
    <path d="${roundRect(o.x0 + 4.5, o.y0 + 4.5, o.x1 - 4.5, o.y1 - 4.5, 16)}" fill="none" stroke="${C.woodLight}" stroke-width="2" opacity=".5"/>
    <path d="${miter}" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
    <path d="${panel}" fill="${C.nightDeep}"/>
    <g fill="${C.moonGlow}" opacity=".22">${stars}</g>
    <g clip-path="url(#${id}clip)"><path d="${panel}" fill="none" stroke="#000" stroke-width="16" opacity=".55" filter="url(#${id}soft)"/></g>
    <path d="${panel}" fill="none" stroke="${C.woodDeep}" stroke-width="3"/>
    <path d="${outer} ${inner}" fill="none" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>
    <path d="${plates}" fill="${C.gold}" filter="url(#${id}cel)"/>
    <path d="${plates}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
    <g fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.8">${rivets}</g>
    <g fill="#fff" opacity=".8">${glints}</g>
  </g>`,
  );
}

/** PLAY plaque, the part that presses: a riveted gold rim round a crimson lacquer face. */
function playTopSvg(): string {
  const id = nextId('pt');
  const rim = pill(12, 8, 376, 118);
  const face = pill(30, 24, 340, 86);
  const studs: [number, number][] = [];
  for (let k = 0; k < 6; k++) studs.push([110 + k * 36, 16.5], [110 + k * 36, 117.5]);
  const rivets = studs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.2"/>`).join('');
  const bolt = (x: number) => `<circle cx="${x}" cy="67" r="9.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.5"/><path d="M${x - 5} ${67 - 5} L${x + 5} ${67 + 5}" stroke="${C.goldDeep}" stroke-width="2.6" stroke-linecap="round"/><circle cx="${x - 3}" cy="63.5" r="2" fill="#fff" opacity=".85"/>`;
  return svgDoc(
    PLAY_W,
    PLAY_H,
    celDefs(id, 1, 0.34, 0.5),
    `<path d="${rim}" fill="${C.gold}" filter="url(#${id}cel)"/>
    <path d="${pill(19, 13, 362, 108)}" fill="none" stroke="${C.goldLight}" stroke-width="3" opacity=".55"/>
    <g fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.4">${rivets}</g>
    <path d="${face}" fill="${C.crimson}" filter="url(#${id}cel)"/>
    <path d="M73 27 H327 Q352 28 364 45 Q340 36 200 36 Q60 36 36 45 Q48 28 73 27 Z" fill="${C.crimsonDeep}" opacity=".65"/>
    <path d="M82 40 Q200 31 318 40 Q308 50 200 50 Q92 50 82 40 Z" fill="#fff" opacity=".3"/>
    <path d="M292 101 Q330 99 352 82" stroke="${C.crimsonLight}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="${rim}" fill="none" stroke="${C.ink}" stroke-width="7"/>
    <path d="${face}" fill="none" stroke="${C.ink}" stroke-width="5"/>
    ${bolt(52)}${bolt(348)}`,
  );
}

/** The plaque's lacquered edge below the face (it shows when the face is up) and its cast shadow. */
function playBaseSvg(): string {
  const id = nextId('pb');
  const body = pill(12, 20, 376, 118);
  return svgDoc(PLAY_W, PLAY_H, celDefs(id, 1), `<g filter="url(#${id}drop)"><path d="${body}" fill="${C.crimsonDeep}"/><path d="M40 118 Q200 136 360 118" stroke="${C.ember}" stroke-width="6" fill="none" opacity=".6"/><path d="${body}" fill="none" stroke="${C.ink}" stroke-width="7"/></g>`);
}

function checkBoxSvg(): string {
  const id = nextId('cb');
  const box = roundRect(8, 7, 56, 55, 10);
  return svgDoc(
    64,
    64,
    celDefs(id, 0.35, 0.3, 0.6),
    `<g filter="url(#${id}drop)"><path d="${box}" fill="${C.paperWarm}" filter="url(#${id}cel)"/><path d="${roundRect(13, 12, 51, 50, 7)}" fill="none" stroke="${C.g2}" stroke-width="2" opacity=".7"/><path d="${box}" fill="none" stroke="${C.ink}" stroke-width="4.5"/></g>`,
  );
}

/** A painted tick that overshoots its box (brush stroke, not a glyph). */
function checkMarkSvg(): string {
  const d = 'M16 33 L28 45 L53 13';
  return svgDoc(
    64,
    64,
    '',
    `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${C.fireDeep}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 32 L28 41" stroke="${C.fire}" stroke-width="2.6" stroke-linecap="round"/>`,
  );
}

/** Carousel arrow: a brass-rimmed oak knob with a paper chevron (points right; mirrored for left). */
function arrowSvg(): string {
  const id = nextId('ar');
  return svgDoc(
    96,
    96,
    celDefs(id, 0.5),
    `<g filter="url(#${id}drop)">
    <circle cx="48" cy="45" r="37" fill="${C.gold}" filter="url(#${id}cel)"/>
    <circle cx="48" cy="45" r="28" fill="${C.woodMid}" filter="url(#${id}cel)"/>
    <path d="${wobble(30, 38, 66, 37, 1.2, 4, 3)} ${wobble(28, 50, 68, 51, 1.2, 4, 5)}" stroke="${C.woodDark}" stroke-width="2" fill="none" opacity=".6"/>
    <circle cx="48" cy="45" r="37" fill="none" stroke="${C.ink}" stroke-width="5"/>
    <circle cx="48" cy="45" r="28" fill="none" stroke="${C.ink}" stroke-width="3.5"/>
    <path d="M42 30 L57 45 L42 60" fill="none" stroke="${C.ink}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M42 30 L57 45 L42 60" fill="none" stroke="${C.paper}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 32 Q32 17 48 14" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".6"/>
  </g>`,
  );
}

function dotSvg(on: boolean): string {
  return svgDoc(
    32,
    32,
    '',
    on
      ? `<circle cx="16" cy="16" r="10.5" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="3.2"/><circle cx="16" cy="16" r="5.5" fill="${C.fireCore}"/><circle cx="12.8" cy="12.4" r="2" fill="#fff"/>`
      : `<circle cx="16" cy="16" r="8.5" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="3.2"/><circle cx="13.8" cy="13.4" r="2.2" fill="${C.gold}" opacity=".85"/>`,
  );
}

/** Small dark-oak badge plaque (volatility, max win). `aspect` = w / h. */
function plaqueSvg(aspect: number): string {
  const H = 100;
  const W = Math.round(H * aspect);
  const id = nextId('pq');
  const body = roundRect(5, 4, W - 5, H - 11, 24);
  return svgDoc(
    W,
    H,
    celDefs(id, 0.6),
    `<g filter="url(#${id}drop)">
    <path d="${body}" fill="${C.woodDark}" filter="url(#${id}cel)"/>
    <path d="${wobble(28, 30, W - 28, 31, 1.2, 6, 2)} ${wobble(24, 62, W - 24, 61, 1.2, 6, 6)}" stroke="${C.woodMid}" stroke-width="2.2" fill="none" opacity=".55"/>
    <path d="${roundRect(13, 12, W - 13, H - 19, 16)}" fill="none" stroke="${C.gold}" stroke-width="2.4" opacity=".75"/>
    <path d="${body}" fill="none" stroke="${C.ink}" stroke-width="5"/>
  </g>`,
  );
}

function skullPipSvg(lit: boolean): string {
  return svgDoc(64, 64, '', skullAndBones(32, 30, 50, lit ? C.paper : C.g4, false));
}

/** Kaboom Bomb stand-in until track D's SYMBOL_ART[11] lands: an iron shell, brass collar, lit fuse. */
function bombStandInSvg(hot: boolean): string {
  const g = nextId('bm');
  const iron = hot ? mix(C.inkSoft, C.crimsonDeep, 0.6) : C.inkSoft;
  const fuse = 'M128 66 C126 48 138 36 154 36 C166 36 172 30 172 24';
  const cracks = hot ? `<path d="M100 130 L114 146 L106 162 M150 170 L162 158 L176 166 M126 196 L134 184" stroke="${C.fireHot}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  return composeSymbol({
    shade: 0.36,
    light: 0.35,
    defs: `<radialGradient id="${g}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".9"/><stop offset="1" stop-color="${C.fire}" stop-opacity="0"/></radialGradient>`,
    under: hot ? `<circle cx="128" cy="150" r="120" fill="url(#${g})" opacity=".6"/>` : '',
    layers: [
      { fills: `<circle cx="128" cy="150" r="80" fill="${iron}"/>`, lines: `<circle cx="128" cy="150" r="80"/>` },
      { fills: `<rect x="104" y="60" width="48" height="26" rx="7" fill="${C.gold}"/>`, lines: `<rect x="104" y="60" width="48" height="26" rx="7"/>` },
    ],
    top: `<path d="${fuse}" fill="none" stroke="${C.ink}" stroke-width="13" stroke-linecap="round"/>
      <path d="${fuse}" fill="none" stroke="${C.paperWarm}" stroke-width="6" stroke-linecap="round" stroke-dasharray="7 5"/>
      <path d="M76 124 Q88 96 118 86" stroke="${hot ? C.fireHot : C.steelLight}" stroke-width="10" fill="none" stroke-linecap="round" opacity=".5"/>
      ${cracks}
      <path d="${spikeRing(172, 24, 6, 19, 8, 10)}" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
      <circle cx="172" cy="24" r="6" fill="${C.fireCore}"/>`,
  });
}

/** Powder Boost lever plate; the slot glows when it is on. 160 x 100. */
function leverBaseSvg(on: boolean): string {
  const id = nextId('lv');
  const plate = pill(8, 44, 144, 44);
  const slot = pill(34, 58, 92, 16);
  const screw = (x: number) => `<circle cx="${x}" cy="66" r="5.5" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.2"/><path d="M${x - 3} ${66 - 3} L${x + 3} ${66 + 3}" stroke="${C.goldDeep}" stroke-width="1.8"/>`;
  return svgDoc(
    160,
    100,
    celDefs(id, 0.6),
    `<g filter="url(#${id}drop)">
    <path d="${plate}" fill="${C.bronze}" filter="url(#${id}cel)"/>
    <path d="${slot}" fill="${on ? C.fireHot : C.woodDeep}"/>
    ${on ? `<path d="${pill(40, 61.5, 80, 9)}" fill="${C.fireCore}"/>` : ''}
    <path d="${slot}" fill="none" stroke="${C.ink}" stroke-width="3"/>
    ${screw(22)}${screw(138)}
    <path d="${plate}" fill="none" stroke="${C.ink}" stroke-width="4.5"/>
  </g>`,
  );
}

/** Lever handle: steel rod and red knob; pivot at (32, 116). 64 x 128. */
function leverHandleSvg(): string {
  const id = nextId('lh');
  return svgDoc(
    64,
    128,
    celDefs(id, 0.4),
    `<path d="M32 116 L32 34" stroke="${C.ink}" stroke-width="13" stroke-linecap="round"/>
    <path d="M32 116 L32 34" stroke="${C.steel}" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 108 L30 40" stroke="${C.steelLight}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
    <circle cx="32" cy="26" r="19" fill="${C.crimson}" filter="url(#${id}cel)"/>
    <circle cx="32" cy="26" r="19" fill="none" stroke="${C.ink}" stroke-width="4.5"/>
    <path d="M21 21 Q25 12 34 11" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
    <circle cx="32" cy="116" r="8" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.5"/>`,
  );
}

/* ------------------------------------------------------------------------------------------
 * Lettering
 * ---------------------------------------------------------------------------------------- */

/**
 * Display lettering is track H's DisplayText (house treatment painted into one texture, padding
 * built in, so nothing clips). Scale it down (never up) so its ink box fits.
 */
function fitDisplay(d: DisplayText, maxW: number, maxH = Infinity) {
  const k = Math.min(1, maxW / Math.max(1, d.inkWidth), maxH / Math.max(1, d.inkHeight));
  d.scale.set(k);
  return { w: d.inkWidth * k, h: d.inkHeight * k };
}

function bodyStyle(size: number, width: number, align: 'left' | 'center' | 'right'): TextStyle {
  return new TextStyle({
    fontFamily: FONT_UI,
    fontWeight: '500',
    fontSize: size,
    fill: C.paper,
    align,
    wordWrap: true,
    breakWords: cjkScript,
    wordWrapWidth: width,
    lineHeight: size * 1.32,
    padding: 4,
    dropShadow: { color: '#000000', alpha: 0.6, blur: 2, distance: 1.5, angle: Math.PI / 2 },
  });
}

/* ------------------------------------------------------------------------------------------
 * Cards and their live demos
 * ---------------------------------------------------------------------------------------- */

type DemoKind = 'bomb' | 'kegs' | 'wheel' | 'boost' | 'max';

interface CardSpec {
  kind: DemoKind;
  title: string;
  body: string;
  tone: NumTone;
  accent: number;
}

interface CardFit {
  vertical: boolean;
  D: number;
  title: number;
  body: number; // 0 = no body text (too small a card)
}

/** Textures the splash rasterises for itself (all built before the splash shows). */
interface Art {
  board: Texture;
  playTop: Texture;
  playBase: Texture;
  box: Texture;
  tick: Texture;
  arrow: Texture;
  dotOn: Texture;
  dotOff: Texture;
  pipOn: Texture;
  pipOff: Texture;
  bomb: Texture;
  bombHot: Texture;
  leverOff: Texture;
  leverOn: Texture;
  handle: Texture;
  rays: Texture;
  spark: Texture;
  sweep: Texture;
  vignette: Texture;
}

interface DemoKit {
  sym: SymbolTextures;
  art: Art;
  fx: Particles;
  wheelTex: WheelTextures;
  /** A demo hit a big beat: the characters may react (the splash rate-limits it). */
  react(kind: 'blast' | 'loot' | 'boost' | 'wheel'): void;
  /**
   * Cap'n Kaboom throws a bomb at a global point: null when he can't right now (the demo drops its
   * own), else a promise that resolves true once it has landed there (false if the throw failed).
   */
  throwBomb?(target: { x: number; y: number }): Promise<boolean> | null;
}

const setSize = (s: Sprite, px: number) => s.scale.set(px / Math.max(1, s.texture.width));
const PAYING = [0, 1, 2, 3, 4, 5, 6, 7, 8];

abstract class Demo {
  /** The demo's art. */
  view = new Container();
  /**
   * Its numbers (fuse, size, multipliers): drawn in the card text layer, above every particle, at
   * the same place as `view`, so no puff or spark ever crosses a glyph.
   */
  labels = new Container();
  featured = false;
  protected tl?: gsap.core.Timeline;
  private running = false;
  private stopAtLoop = false;
  constructor(
    protected k: DemoKit,
    protected D: number,
  ) {}
  /**
   * Play while on screen (in low quality only the featured card). A card that must stop while it
   * is still visible finishes its loop first (it ends on a settled board, nothing freezes mid-air);
   * one that has left the screen stops at once and snaps to its settled board.
   */
  run(on: boolean, visible: boolean) {
    if (!this.tl) {
      this.running = on;
      return;
    }
    if (on) {
      this.stopAtLoop = false;
      if (!this.running) {
        this.running = true;
        this.tl.restart();
      }
      return;
    }
    if (!this.running) return;
    if (visible) {
      this.stopAtLoop = true;
      return;
    }
    this.running = false;
    this.stopAtLoop = false;
    this.tl.pause();
    this.settle();
  }
  /** Timelines call this on every repeat: the place to stop a card that was asked to. */
  protected loopEnd() {
    if (!this.stopAtLoop) return;
    this.stopAtLoop = false;
    this.running = false;
    this.tl?.pause();
  }
  /** Snap to the loop's resting board (called when a card stops off screen). */
  protected settle() {}
  /** Hold still where it is (the handoff: the cards fall away as they are). */
  freeze() {
    this.running = false;
    this.stopAtLoop = false;
    this.tl?.pause();
  }
  get on() {
    return this.running;
  }
  update(_dtMs: number) {}
  protected at(o: Container, dx = 0, dy = 0) {
    return o.toGlobal({ x: dx, y: dy });
  }
  destroy() {
    this.tl?.kill();
  }
}

/** A 3x3 patch of the board, for the bomb and keg demos. */
class Patch {
  cells: Sprite[] = [];
  home: { x: number; y: number }[] = [];
  readonly p: number;
  readonly size: number;
  constructor(
    parent: Container,
    private sym: SymbolTextures,
    D: number,
  ) {
    this.p = D / 3.08;
    this.size = this.p * 0.94;
    for (let c = 0; c < 3; c++)
      for (let r = 0; r < 3; r++) {
        const s = new Sprite(Texture.EMPTY);
        s.anchor.set(0.5);
        const h = { x: (c - 1) * this.p, y: (r - 1) * this.p };
        s.position.set(h.x, h.y);
        this.cells.push(s);
        this.home.push(h);
        parent.addChild(s);
      }
  }
  /** Cell index for column c, row r. */
  static i(c: number, r: number) {
    return c * 3 + r;
  }
  set(i: number, sym: number, pose: 'idle' | 'win' = 'idle') {
    const set = this.sym.sets.get(sym);
    if (!set) return;
    const s = this.cells[i];
    s.texture = pose === 'win' ? set.win ?? set.idle : set.idle;
    setSize(s, this.size);
  }
  scaleOf(i: number) {
    const s = this.cells[i];
    return this.size / Math.max(1, s.texture.width);
  }
}

/** Kaboom Bomb: the fuse counts down, a keg blast grows it, then it clears its square and adds to the multiplier. */
class BombDemo extends Demo {
  private patch: Patch;
  private bomb: Sprite;
  private halo = new Sprite(softDotTexture());
  private fuseBadge = new Container();
  private fuseNum: BitmapText;
  private sizeNum: BitmapText;
  private plus: BitmapText;
  private ring = new Graphics();
  private flash = new Sprite(softDotTexture());
  private bk = 1;
  private hot = false;
  private tremble = 0;
  constructor(k: DemoKit, D: number) {
    super(k, D);
    this.patch = new Patch(this.view, k.sym, D);
    const p = this.patch.p;
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.halo.tint = hex(C.fire);
    this.halo.alpha = 0;
    this.halo.width = this.halo.height = p * 2.2;
    this.view.addChildAt(this.halo, 0);
    this.bomb = new Sprite(k.art.bomb);
    this.bomb.anchor.set(0.5);
    setSize(this.bomb, p * 1.06);
    this.bk = this.bomb.scale.x;
    this.view.addChild(this.bomb);
    const disc = new Graphics().circle(0, 0, p * 0.2).fill({ color: hex(C.ink) }).stroke({ width: Math.max(1.5, p * 0.045), color: hex(C.gold) });
    this.fuseNum = bitmapNum(String(BOMB_FUSE), 'white', p * 0.26);
    this.fuseBadge.addChild(disc, this.fuseNum);
    this.fuseBadge.position.set(p * 0.33, -p * 0.33);
    this.sizeNum = bitmapNum('x1', 'fire', p * 0.3);
    this.sizeNum.position.set(-p * 0.28, p * 0.34);
    this.labels.addChild(this.fuseBadge, this.sizeNum);
    this.ring.circle(0, 0, p * 0.5).stroke({ width: Math.max(2, p * 0.1), color: hex(C.fireCore) });
    this.ring.alpha = 0;
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.tint = hex(C.fireCore);
    this.flash.alpha = 0;
    this.plus = bitmapNum('+2x', 'fire', p * 0.46);
    this.plus.alpha = 0;
    this.view.addChild(this.ring, this.flash);
    this.labels.addChild(this.plus);
    this.fill();
    this.timeline();
  }

  private kegAt = Patch.i(0, 2);

  private fill() {
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      if (i === this.kegAt) this.patch.set(i, 9, 'win');
      else this.patch.set(i, PAYING[(Math.random() * PAYING.length) | 0]);
      this.patch.cells[i].scale.set(this.patch.scaleOf(i));
    }
    this.patch.cells[4].visible = false;
  }

  private setHot(on: boolean) {
    this.hot = on;
    this.bomb.texture = on ? this.k.art.bombHot : this.k.art.bomb;
  }

  private timeline() {
    const { p } = this.patch;
    const bk = this.bk;
    const keg = this.patch.cells[this.kegAt];
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => {
      this.fuseNum.text = String(BOMB_FUSE);
      this.sizeNum.text = 'x1';
      this.setHot(false);
    }, [], 0);
    tl.call(() => (this.fuseNum.text = String(BOMB_FUSE - 1)), [], 0.6);
    tl.fromTo(this.fuseBadge.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' }, 0.6);
    // a keg blows next to it: the bomb grows (size 1 -> 2)
    tl.call(() => {
      const g = this.at(keg);
      this.k.fx.burst(g.x, g.y, 10, 'fire', 0.8);
      this.k.fx.poof(g.x, g.y);
    }, [], 1.15);
    tl.to(keg.scale, { x: () => this.patch.scaleOf(this.kegAt) * 1.3, y: () => this.patch.scaleOf(this.kegAt) * 1.3, duration: 0.08, ease: 'power2.out' }, 1.15);
    tl.to(keg.scale, { x: 0, y: 0, duration: 0.18, ease: 'back.in(2)' }, 1.23);
    tl.call(() => {
      this.sizeNum.text = 'x2';
      const g = this.at(this.bomb);
      this.k.fx.sparks(g.x, g.y, 8, 0.7);
    }, [], 1.4);
    tl.fromTo(this.bomb.scale, { x: bk * 1.34, y: bk * 1.34 }, { x: bk * 1.12, y: bk * 1.12, duration: 0.4, ease: 'back.out(2.6)' }, 1.4);
    tl.fromTo(this.sizeNum.scale, { x: 0, y: 0 }, { x: this.sizeNum.scale.x, y: this.sizeNum.scale.y, duration: 0.35, ease: 'back.out(3)' }, 1.4);
    // last tick: hot, trembling
    tl.call(() => {
      this.fuseNum.text = '1';
      this.setHot(true);
    }, [], 1.95);
    tl.fromTo(this.fuseBadge.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' }, 1.95);
    tl.to(this, { tremble: 1, duration: 0.6, ease: 'power1.in' }, 1.95);
    tl.to(this.halo, { alpha: 0.75, duration: 0.6, ease: 'power1.in' }, 1.95);
    // KABOOM
    tl.call(() => {
      const g = this.at(this.bomb);
      this.k.fx.burst(g.x, g.y, 18, 'fire', 1.3);
      this.k.fx.sparks(g.x, g.y, 12, 1.2);
      this.k.fx.smoke(g.x, g.y, 5, 1.2);
      if (this.featured) this.k.react('blast');
    }, [], 2.6);
    tl.set(this, { tremble: 0 }, 2.6);
    tl.set([this.fuseBadge, this.sizeNum], { visible: false }, 2.6);
    tl.to(this.bomb.scale, { x: bk * 1.7, y: bk * 1.7, duration: 0.07, ease: 'power2.out' }, 2.6);
    tl.to(this.bomb.scale, { x: 0, y: 0, duration: 0.1, ease: 'power2.in' }, 2.67);
    tl.to(this.halo, { alpha: 0, duration: 0.3 }, 2.62);
    tl.fromTo(this.flash, { alpha: 1, width: p * 1.2, height: p * 1.2 }, { alpha: 0, width: p * 4.4, height: p * 4.4, duration: 0.5, ease: 'power2.out' }, 2.6);
    tl.fromTo(this.ring.scale, { x: 0.3, y: 0.3 }, { x: 3.3, y: 3.3, duration: 0.5, ease: 'power2.out' }, 2.6);
    tl.fromTo(this.ring, { alpha: 1 }, { alpha: 0, duration: 0.5, ease: 'power1.in' }, 2.6);
    for (let i = 0; i < 9; i++) {
      if (i === 4 || i === this.kegAt) continue;
      const c = this.patch.cells[i];
      const d = Math.hypot(this.patch.home[i].x, this.patch.home[i].y) / p;
      tl.to(c.scale, { x: 0, y: 0, duration: 0.22, ease: 'back.in(2.2)' }, 2.62 + d * 0.035);
      tl.call(() => {
        const g = this.at(c);
        this.k.fx.poof(g.x, g.y);
      }, [], 2.8 + d * 0.035);
    }
    tl.fromTo(this.plus, { alpha: 0, y: 0 }, { alpha: 1, y: -p * 0.35, duration: 0.3, ease: 'back.out(2)' }, 2.68);
    const pk = this.plus.scale.x;
    tl.fromTo(this.plus.scale, { x: pk * 0.3, y: pk * 0.3 }, { x: pk, y: pk, duration: 0.35, ease: 'back.out(3)' }, 2.68);
    tl.to(this.plus, { alpha: 0, y: -p * 0.9, duration: 0.35, ease: 'power1.in' }, 3.1);
    // the captain throws the next one in (when this card is centre stage), else it drops in; the
    // bomb flies once the "+2x" has gone, and the badges wait for it to land
    tl.call(() => this.requestThrow(), [], 3.2);
    // refill: fresh symbols tumble in, a new bomb lands in the middle
    tl.call(() => {
      this.fill();
      this.setHot(false);
      this.fuseNum.text = String(BOMB_FUSE);
      this.sizeNum.text = 'x1';
    }, [], 3.45);
    tl.set(this.bomb, { alpha: 0 }, 3.45);
    for (let i = 0; i < 9; i++) {
      if (i === 4) continue;
      const c = this.patch.cells[i];
      const h = this.patch.home[i];
      const col = Math.floor(i / 3);
      tl.fromTo(c, { y: h.y - this.D * 0.55, alpha: 0 }, { y: h.y, alpha: 1, duration: 0.42, ease: 'land', immediateRender: false }, 3.45 + col * 0.06 + (2 - (i % 3)) * 0.03);
    }
    tl.set(this.bomb.scale, { x: bk, y: bk }, 3.5);
    tl.call(() => {
      if (!this.thrown) this.dropBomb();
    }, [], 3.55);
    tl.call(() => {
      if (!this.flying) this.showBadges();
    }, [], 3.95);
    // a slow throw holds the loop until it lands
    tl.call(() => {
      if (this.flying) this.tl?.pause();
    }, [], 4.5);
    tl.to({}, { duration: 0.01 }, 4.9);
    // a new loop always starts with the bomb in place (a late throw just lands on it again)
    tl.set(this.bomb, { alpha: 1, y: 0 }, 0);
    this.tl = tl;
  }

  private thrown = false;
  private flying = false;

  private showBadges() {
    if (this.fuseBadge.visible) return;
    this.fuseBadge.visible = this.sizeNum.visible = true;
    gsap.fromTo(this.fuseBadge.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  protected override settle() {
    gsap.killTweensOf([this.bomb, this.bomb.scale]);
    this.fill();
    this.patch.cells.forEach((c, i) => {
      c.position.set(this.patch.home[i].x, this.patch.home[i].y);
      c.alpha = 1;
      c.scale.set(this.patch.scaleOf(i));
    });
    this.patch.cells[4].visible = false;
    this.setHot(false);
    this.tremble = 0;
    this.thrown = false;
    this.flying = false;
    this.bomb.alpha = 1;
    this.bomb.position.set(0, 0);
    this.bomb.rotation = 0;
    this.bomb.scale.set(this.bk);
    this.fuseNum.text = String(BOMB_FUSE);
    this.sizeNum.text = 'x1';
    this.fuseBadge.visible = this.sizeNum.visible = true;
    this.fuseBadge.scale.set(1);
    this.halo.alpha = this.flash.alpha = this.ring.alpha = this.plus.alpha = 0;
  }

  private requestThrow() {
    this.thrown = false;
    this.flying = false;
    if (!this.featured || !this.k.throwBomb) return;
    const flight = this.k.throwBomb(this.at(this.view));
    if (!flight) return;
    this.thrown = true;
    this.flying = true;
    void flight.then((ok) => {
      if (this.view.destroyed) return;
      this.flying = false;
      if (ok) this.landBomb();
      else this.dropBomb();
      if (this.tl && this.tl.time() >= 3.95) this.showBadges();
      if (this.on && this.tl?.paused()) this.tl.resume();
    });
  }

  /** The new bomb tumbles in from above. */
  private dropBomb() {
    const b = this.bomb;
    gsap.killTweensOf(b);
    gsap.fromTo(b, { y: -this.D * 0.6, alpha: 0 }, { y: 0, alpha: 1, duration: 0.5, ease: 'land', onComplete: () => this.thud() });
  }

  /** The thrown bomb hits its cell: squash, dust, fizz. */
  private landBomb() {
    const b = this.bomb;
    gsap.killTweensOf([b, b.scale]);
    b.alpha = 1;
    b.y = 0;
    gsap.fromTo(b.scale, { x: this.bk * 1.3, y: this.bk * 0.72 }, { x: this.bk, y: this.bk, duration: 0.45, ease: 'elastic.out(1, .4)' });
    this.thud();
  }

  private thud() {
    if (this.view.destroyed) return;
    const g = this.at(this.bomb, 0, this.patch.p * 0.4);
    this.k.fx.dust(g.x, g.y, true);
  }

  override update(dtMs: number) {
    if (!this.on) return;
    const k = this.tremble;
    this.bomb.rotation = k ? Math.sin(performance.now() / 22) * 0.09 * k : 0;
    this.bomb.x = k ? Math.sin(performance.now() / 17) * this.patch.p * 0.03 * k : 0;
    if (this.hot && Math.random() < dtMs / 160) {
      const g = this.at(this.bomb, this.patch.p * 0.2, -this.patch.p * 0.42);
      this.k.fx.embers(g.x, g.y, 1);
    }
  }
}

/** Powder Kegs: a cluster lights the keg (x2), then it blows its 3x3 square. */
class KegDemo extends Demo {
  private patch: Patch;
  private aura = new Sprite(softDotTexture());
  private badge: BitmapText;
  private ring = new Graphics();
  private flash = new Sprite(softDotTexture());
  private crabs = [Patch.i(0, 0), Patch.i(0, 1), Patch.i(0, 2), Patch.i(1, 0)];
  constructor(k: DemoKit, D: number) {
    super(k, D);
    this.patch = new Patch(this.view, k.sym, D);
    const p = this.patch.p;
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.aura.width = this.aura.height = p * 1.6;
    this.view.addChildAt(this.aura, 0);
    this.aura.position.set(0, 0);
    this.badge = bitmapNum('x2', 'fire', p * 0.34);
    this.badge.position.set(p * 0.3, -p * 0.32);
    this.ring.circle(0, 0, p * 0.5).stroke({ width: Math.max(2, p * 0.1), color: hex(C.fireHot) });
    this.ring.alpha = 0;
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.tint = hex(C.fireCore);
    this.flash.alpha = 0;
    this.view.addChild(this.ring, this.flash);
    this.labels.addChild(this.badge);
    this.fill();
    this.timeline();
  }

  private fill() {
    const others = PAYING.filter((s) => s !== 4);
    for (let i = 0; i < 9; i++) {
      if (i === 4) this.patch.set(i, 9);
      else if (this.crabs.includes(i)) this.patch.set(i, 4);
      else this.patch.set(i, others[(Math.random() * others.length) | 0]);
    }
    this.aura.tint = hex(C.gold);
    this.aura.alpha = 0.35;
    this.badge.visible = false;
  }

  protected override settle() {
    this.fill();
    this.patch.cells.forEach((c, i) => {
      c.position.set(this.patch.home[i].x, this.patch.home[i].y);
      c.alpha = 1;
      c.scale.set(this.patch.scaleOf(i));
    });
    this.ring.alpha = this.flash.alpha = 0;
  }

  private timeline() {
    const { p } = this.patch;
    const keg = this.patch.cells[4];
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    // the cluster lands a win: crabs cheer, the keg joins
    tl.call(() => this.crabs.forEach((i) => this.patch.set(i, 4, 'win')), [], 0.5);
    for (const i of [...this.crabs, 4]) {
      const c = this.patch.cells[i];
      tl.to(c.scale, { x: () => this.patch.scaleOf(i) * 1.14, y: () => this.patch.scaleOf(i) * 1.14, duration: 0.14, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.5);
    }
    // it lights: x2
    tl.call(() => {
      this.patch.set(4, 9, 'win');
      this.aura.tint = hex(C.fire);
      this.badge.visible = true;
      const g = this.at(keg);
      this.k.fx.burst(g.x, g.y, 10, 'fire', 0.7);
    }, [], 0.95);
    tl.fromTo(this.aura, { alpha: 1 }, { alpha: 0.55, duration: 0.5, ease: 'power2.out' }, 0.95);
    const bs = this.badge.scale.x;
    tl.fromTo(this.badge.scale, { x: 0, y: 0 }, { x: bs, y: bs, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 0.95);
    // the winners pop
    this.crabs.forEach((i, j) => {
      const c = this.patch.cells[i];
      tl.to(c.scale, { x: 0, y: 0, duration: 0.2, ease: 'back.in(2)' }, 1.45 + j * 0.05);
      tl.call(() => {
        const g = this.at(c);
        this.k.fx.poof(g.x, g.y);
      }, [], 1.6 + j * 0.05);
    });
    // next cascade: the lit keg explodes and clears its square
    tl.to(keg.scale, { x: () => this.patch.scaleOf(4) * 1.28, y: () => this.patch.scaleOf(4) * 1.28, duration: 0.2, ease: 'power1.in' }, 1.95);
    tl.call(() => {
      const g = this.at(keg);
      this.k.fx.burst(g.x, g.y, 16, 'fire', 1.2);
      this.k.fx.debris(g.x, g.y, 6, 0.7);
      this.k.fx.smoke(g.x, g.y, 4, 1);
      if (this.featured) this.k.react('blast');
    }, [], 2.15);
    tl.set(this.badge, { visible: false }, 2.15);
    tl.to(keg.scale, { x: 0, y: 0, duration: 0.1 }, 2.15);
    tl.to(this.aura, { alpha: 0, duration: 0.2 }, 2.15);
    tl.fromTo(this.flash, { alpha: 1, width: p, height: p }, { alpha: 0, width: p * 4.2, height: p * 4.2, duration: 0.45, ease: 'power2.out' }, 2.15);
    tl.fromTo(this.ring.scale, { x: 0.3, y: 0.3 }, { x: 3.2, y: 3.2, duration: 0.45, ease: 'power2.out' }, 2.15);
    tl.fromTo(this.ring, { alpha: 1 }, { alpha: 0, duration: 0.45, ease: 'power1.in' }, 2.15);
    for (let i = 0; i < 9; i++) {
      if (i === 4 || this.crabs.includes(i)) continue;
      const c = this.patch.cells[i];
      tl.to(c.scale, { x: 0, y: 0, duration: 0.2, ease: 'back.in(2)' }, 2.2);
      tl.call(() => {
        const g = this.at(c);
        this.k.fx.poof(g.x, g.y);
      }, [], 2.35);
    }
    // refill
    tl.call(() => this.fill(), [], 2.9);
    for (let i = 0; i < 9; i++) {
      const c = this.patch.cells[i];
      const h = this.patch.home[i];
      tl.set(c.scale, { x: () => this.patch.scaleOf(i), y: () => this.patch.scaleOf(i) }, 2.9);
      tl.fromTo(c, { y: h.y - this.D * 0.55, alpha: 0 }, { y: h.y, alpha: 1, duration: 0.42, ease: 'land', immediateRender: false }, 2.9 + Math.floor(i / 3) * 0.06 + (2 - (i % 3)) * 0.03);
    }
    tl.to({}, { duration: 0.01 }, 4.3);
    this.tl = tl;
  }
}

/** Captain's Wheel: the helm spins and lands, over and over, while on screen. */
class WheelDemo extends Demo {
  private wheel: Wheel;
  private wait = 0.5;
  private spinning = false;
  private kinds: SegKind[];
  private i = 0;
  constructor(k: DemoKit, D: number) {
    super(k, D);
    this.wheel = new Wheel(k.wheelTex, D * 0.94);
    this.view.addChild(this.wheel);
    const seen = new Set<SegKind>();
    for (const s of WHEEL_SEGMENTS) seen.add(s);
    // lead with the bomb wedge when the wheel has one
    this.kinds = ['bomb', 'cash', 'boost', 'hounds', 'inferno'].filter((s) => seen.has(s as SegKind)) as SegKind[];
  }
  override update(dtMs: number) {
    if (this.wheel.destroyed) return;
    this.wheel.update(dtMs);
    if (!this.on || this.spinning) return;
    this.wait -= dtMs / 1000;
    if (this.wait > 0 || !this.kinds.length) return;
    this.spinning = true;
    void this.wheel.spin(this.kinds[this.i++ % this.kinds.length]).then(() => {
      this.spinning = false;
      this.wait = 1.5;
      if (this.featured && !this.view.destroyed) this.k.react('wheel');
    });
  }
}

/** Powder Boost: the lever goes on, the captain's charge needs one keg blast less, a bomb flies. */
class BoostDemo extends Demo {
  private base: Sprite;
  private handle: Sprite;
  private cost: BitmapText;
  private pips: Sprite[] = [];
  private flyer: Sprite;
  private pipK = 1;
  private slots3: number[];
  private slots2: number[];
  constructor(k: DemoKit, D: number) {
    super(k, D);
    const leverW = D * 0.66;
    this.base = new Sprite(k.art.leverOff);
    this.base.anchor.set(0.5, 0.66);
    setSize(this.base, leverW);
    this.base.position.set(0, -D * 0.02);
    this.handle = new Sprite(k.art.handle);
    this.handle.anchor.set(0.5, 116 / 128);
    this.handle.scale.set(this.base.scale.x * 1.05);
    this.handle.position.set(0, -D * 0.02);
    this.handle.rotation = -0.62;
    this.cost = bitmapNum(`${BOOST_COST}x`, 'gold', D * 0.2);
    this.cost.position.set(0, -D * 0.4);
    const pip = D * 0.2;
    const gap = D * 0.25;
    // charge pips: CHARGE_MAX in a normal spin, CHARGE_MAX_BOOST with the boost on (centred rows)
    this.slots2 = Array.from({ length: CHARGE_MAX_BOOST }, (_, i) => (i - (CHARGE_MAX_BOOST - 1) / 2) * gap);
    for (let i = 0; i < CHARGE_MAX; i++) {
      const s = new Sprite(k.art.bomb);
      s.anchor.set(0.5);
      setSize(s, pip);
      this.pipK = s.scale.x;
      s.position.set((i - (CHARGE_MAX - 1) / 2) * gap, D * 0.33);
      this.pips.push(s);
    }
    this.slots3 = this.pips.map((s) => s.x);
    this.flyer = new Sprite(k.art.bomb);
    this.flyer.anchor.set(0.5);
    setSize(this.flyer, pip * 1.1);
    this.flyer.alpha = 0;
    this.view.addChild(this.base, this.handle, ...this.pips, this.flyer);
    this.labels.addChild(this.cost);
    this.reset();
    this.timeline();
  }

  protected override settle() {
    this.reset();
    this.flyer.alpha = 0;
  }

  private reset() {
    this.base.texture = this.k.art.leverOff;
    this.handle.rotation = -0.62;
    this.cost.alpha = 0.4;
    this.pips.forEach((s, i) => {
      s.visible = true;
      s.tint = 0x5a5a66;
      s.alpha = 0.8;
      s.scale.set(this.pipK);
      s.x = this.slots3[i];
    });
  }

  private timeline() {
    const D = this.D;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => this.reset(), [], 0);
    tl.to(this.handle, { rotation: 0.62, duration: 0.3, ease: 'back.out(3)' }, 0.6);
    tl.call(() => {
      this.base.texture = this.k.art.leverOn;
      const g = this.at(this.handle);
      this.k.fx.sparks(g.x, g.y - D * 0.05, 8, 0.6);
      if (this.featured) this.k.react('boost');
    }, [], 0.75);
    const ck = this.cost.scale.x;
    tl.to(this.cost, { alpha: 1, duration: 0.2 }, 0.75);
    tl.fromTo(this.cost.scale, { x: ck * 1.35, y: ck * 1.35 }, { x: ck, y: ck, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, 0.75);
    // one charge pip less: the captain throws sooner
    const extra = this.pips.slice(CHARGE_MAX_BOOST);
    extra.forEach((s) => {
      tl.to(s.scale, { x: 0, y: 0, duration: 0.22, ease: 'back.in(2)' }, 1.0);
      tl.call(() => {
        const g = this.at(s);
        this.k.fx.poof(g.x, g.y);
      }, [], 1.15);
    });
    this.pips.slice(0, CHARGE_MAX_BOOST).forEach((s, i) => tl.to(s, { x: this.slots2[i], duration: 0.35, ease: 'power2.inOut' }, 1.1));
    // keg blasts fill the charge
    this.pips.slice(0, CHARGE_MAX_BOOST).forEach((s, i) => {
      const at = 1.6 + i * 0.45;
      tl.set(s, { tint: 0xffffff, alpha: 1 }, at);
      tl.fromTo(s.scale, { x: this.pipK * 1.5, y: this.pipK * 1.5 }, { x: this.pipK, y: this.pipK, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, at);
      tl.call(() => {
        const g = this.at(s, 0, -s.height * 0.4);
        this.k.fx.sparks(g.x, g.y, 5, 0.5);
      }, [], at);
    });
    // full: a bomb is thrown
    const throwAt = 1.6 + CHARGE_MAX_BOOST * 0.45 + 0.2;
    tl.fromTo(this.flyer, { x: 0, y: D * 0.3, alpha: 1, rotation: 0 }, { x: D * 0.34, y: -D * 0.46, rotation: 4, duration: 0.55, ease: 'power1.out', immediateRender: false }, throwAt);
    tl.to(this.flyer, { alpha: 0, duration: 0.15 }, throwAt + 0.45);
    tl.call(() => {
      const g = this.at(this.flyer);
      this.k.fx.burst(g.x, g.y, 10, 'fire', 0.8);
    }, [], throwAt + 0.55);
    this.pips.slice(0, CHARGE_MAX_BOOST).forEach((s) => tl.to(s, { alpha: 0.8, duration: 0.2, onStart: () => void (s.tint = 0x5a5a66) }, throwAt + 0.1));
    // back off, the third pip returns
    const offAt = throwAt + 0.9;
    tl.to(this.handle, { rotation: -0.62, duration: 0.3, ease: 'back.out(2.5)' }, offAt);
    tl.call(() => void (this.base.texture = this.k.art.leverOff), [], offAt + 0.1);
    tl.to(this.cost, { alpha: 0.4, duration: 0.3 }, offAt);
    this.pips.forEach((s, i) => tl.to(s, { x: this.slots3[i], duration: 0.3, ease: 'power2.inOut' }, offAt));
    extra.forEach((s) => tl.to(s.scale, { x: this.pipK, y: this.pipK, duration: 0.3, ease: 'back.out(2.5)' }, offAt + 0.15));
    tl.to({}, { duration: 0.01 }, offAt + 1.0);
    this.tl = tl;
  }
}

/** Max win: the chest shakes, bursts open in a gold fountain and the 50,000x pops. */
class MaxDemo extends Demo {
  private rays: Sprite;
  private chest = new Sprite(Texture.EMPTY);
  private big: BitmapText;
  private ck = 1;
  constructor(k: DemoKit, D: number) {
    super(k, D);
    this.rays = new Sprite(k.art.rays);
    this.rays.anchor.set(0.5, 200 / 256);
    setSize(this.rays, D * 1.1);
    this.rays.blendMode = 'add';
    this.rays.position.set(0, D * 0.06);
    this.rays.alpha = 0.15;
    const set = k.sym.sets.get(10);
    this.chest.texture = set?.idle ?? Texture.EMPTY;
    this.chest.anchor.set(0.5);
    setSize(this.chest, D * 0.66);
    this.ck = this.chest.scale.x;
    this.chest.position.set(0, -D * 0.08);
    this.big = bitmapNum(`${MAX_WIN.toLocaleString('en-US')}x`, 'gold', D * 0.25);
    const maxW = D * 0.9;
    if (this.big.width > maxW) this.big.scale.set(this.big.scale.x * (maxW / this.big.width));
    this.big.position.set(0, D * 0.36);
    this.view.addChild(this.rays, this.chest);
    this.labels.addChild(this.big);
    this.timeline();
  }
  private timeline() {
    const D = this.D;
    const set = this.k.sym.sets.get(10);
    const bk = this.big.scale.x;
    const tl = gsap.timeline({ repeat: -1, paused: true, onRepeat: () => this.loopEnd() });
    tl.call(() => {
      if (set) this.chest.texture = set.idle;
    }, [], 0);
    tl.set(this.big, { alpha: 0.55 }, 0);
    tl.set(this.big.scale, { x: bk * 0.86, y: bk * 0.86 }, 0);
    tl.to(this.chest, { rotation: 0.07, duration: 0.06, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0.45);
    tl.call(() => {
      if (set?.win) this.chest.texture = set.win;
      const g = this.at(this.chest, 0, -D * 0.12);
      this.k.fx.coins(g.x, g.y, 9, 2, 0.8);
      this.k.fx.glint(g.x + D * 0.15, g.y - D * 0.05, 0.4);
      if (this.featured) this.k.react('loot');
    }, [], 1.0);
    tl.set(this.chest, { rotation: 0 }, 1.0);
    tl.fromTo(this.chest.scale, { x: this.ck * 1.16, y: this.ck * 0.9 }, { x: this.ck, y: this.ck, duration: 0.45, ease: 'elastic.out(1, .45)', immediateRender: false }, 1.0);
    tl.to(this.rays, { alpha: 0.95, duration: 0.25 }, 1.0);
    tl.to(this.big, { alpha: 1, duration: 0.15 }, 1.05);
    tl.fromTo(this.big.scale, { x: bk * 1.18, y: bk * 1.18 }, { x: bk, y: bk, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, 1.05);
    tl.to(this.big.scale, { x: bk * 1.05, y: bk * 1.05, duration: 0.35, yoyo: true, repeat: 2, ease: 'sine.inOut' }, 1.6);
    tl.to(this.rays, { alpha: 0.15, duration: 0.4 }, 2.9);
    tl.call(() => {
      if (set) this.chest.texture = set.idle;
    }, [], 3.05);
    tl.fromTo(this.chest.scale, { x: this.ck * 0.94, y: this.ck * 1.06 }, { x: this.ck, y: this.ck, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 3.05);
    tl.to(this.big, { alpha: 0.55, duration: 0.3 }, 3.05);
    tl.to({}, { duration: 0.01 }, 3.7);
    this.tl = tl;
  }
  protected override settle() {
    const set = this.k.sym.sets.get(10);
    if (set) this.chest.texture = set.idle;
    this.chest.rotation = 0;
    this.chest.scale.set(this.ck);
    this.rays.alpha = 0.15;
    this.big.alpha = 0.55;
  }

  override update(dtMs: number) {
    if (this.on) this.rays.rotation += dtMs * 0.00018;
  }
}

/** Optional rig extras (track C): a glance toward a global point, null to look ahead again. */
interface Glance {
  lookAt?: (gx: number | null, gy?: number) => void;
}

interface Card {
  spec: CardSpec;
  view: Container; // placed by the carousel (the card's art)
  swing: Container; // entrance / exit motion
  /** The card's text (title, blurb, demo numbers) in the text layer, mirroring view / swing. */
  tview: Container;
  tswing: Container;
  demo: Demo;
  glow: Sprite;
}

/* ------------------------------------------------------------------------------------------
 * The splash
 * ---------------------------------------------------------------------------------------- */

export interface SplashOptions {
  L: Layout;
  wheelTex: WheelTextures;
  symTex: SymbolTextures;
  renderer: Renderer;
  /** "Don't show again" is set: only the PLAY tap (it unlocks audio), over the game. */
  quick: boolean;
  /** Powder Boost is offered here (hidden where the jurisdiction disables buy features). */
  boost: boolean;
  /** Carousel position to resume (the splash is rebuilt on every resize). */
  index?: number;
  /** Play the entrance (first build only; rebuilds appear settled). */
  intro?: boolean;
  /** The scene's Cap'n Kaboom and Sparks: presented above the shade while the intro shows. */
  cast?: { captain: Captain; parrot: Parrot };
  /**
   * First mouse press on the splash (an activation-triggering event): the caller can unlock audio
   * there, so creating the AudioContext (slow on some machines) happens while the button is held,
   * not in the frame the handoff starts. Touch has to wait for the tap itself.
   */
  onArm?: () => void;
  /** UI sounds for the splash's own controls (existing sound ids; silent until audio unlocks). */
  sfx?: (id: string) => void;
}

interface Plan {
  W: number;
  H: number;
  U: number;
  m: number;
  logo: { x: number; y: number; w: number } | null;
  car: { cx: number; cy: number; w: number; h: number } | null;
  n: number;
  cw: number;
  ch: number;
  gap: number;
  fit: CardFit | null;
  arrow: number;
  dotsY: number;
  dotR: number;
  play: { cx: number; cy: number; h: number };
  toggle: { x: number; cy: number; h: number; maxW: number; center: boolean };
  badges: { mode: 'corners' | 'stack' | 'row'; x0: number; x1: number; y: number; h: number } | null;
}

/**
 * Particle systems shared by every splash build (Particles subscribes to quality and never lets
 * go): `sharedFx` draws under the cards (dust, embers, the PLAY burst), `sharedDemoFx` over the
 * cards' art but under all text (the demos' blasts, the thrown bomb's trail).
 */
let sharedFx: Particles | undefined;
let sharedDemoFx: Particles | undefined;

export class IntroSplash extends Container {
  private o: SplashOptions;
  private art!: Art;
  private res = 1;
  private P!: Plan;
  private fx!: Particles;
  private demoFx!: Particles;
  private anim = gsap.context(() => {});
  private backdrop = new Container();
  private shade = new Graphics();
  private vignette = new Sprite();
  private glow = new Sprite(softDotTexture());
  private charLayer = new Container();
  private capWrap = new Container();
  private parWrap = new Container();
  private cardLayer = new Container();
  private ui = new Container();
  private logoLayer = new Container();
  private fxLayer = new Container();
  private demoFxLayer = new Container();
  private flyLayer = new Container();
  /** The carousel arrows: over the cards' art, under their text (a sliding card never goes under one). */
  private navLayer = new Container();
  private cardTextLayer = new Container();
  private logoHolder = new Container();
  private logo?: Logo;
  private logoSil?: Texture;
  private sweep?: Sprite;
  private cards: Card[] = [];
  private car = { offset: 0 };
  private carTween?: gsap.core.Tween;
  private dots: Sprite[] = [];
  private arrows: Container[] = [];
  private badges: Container[] = [];
  private play = new Container();
  private playFace = new Container();
  private playHalo = new Sprite(softDotTexture());
  private spark = new Sprite();
  private sparkD = 0;
  private toggle = new Container();
  private tick = new Sprite();
  private checked = false;
  private resolveTap?: () => void;
  private closing = false;
  private autoT = 0;
  private pausedUntil = 0;
  private t = 0;
  private reactAt = 0;
  private featured = -1;
  private drag: { x: number; y: number; t: number; start: number; on: boolean; carousel: boolean } | null = null;
  private swallow = false;
  private sweepAt = 0;
  private offQuality?: () => void;
  private flyer = new Sprite();
  private throwing = false;

  constructor(o: SplashOptions) {
    super();
    this.o = o;
    this.checked = introSkipped();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', (e) => this.pointerDown(e));
    this.on('globalpointermove', (e) => this.pointerMove(e));
    this.on('pointerup', (e) => this.pointerUp(e));
    this.on('pointerupoutside', (e) => this.pointerUp(e));
    this.on('pointertap', () => {
      if (this.swallow) {
        this.swallow = false;
        return;
      }
      this.fire();
    });
  }

  /** The full intro (logo, characters, cards) rather than the quick PLAY tap. */
  get full() {
    return !this.o.quick;
  }

  /** Carousel position, handed to the next build on resize. */
  get index() {
    return Math.round(this.car.offset);
  }

  /* ---------------------------------------------------------------------------------------- */

  async build(res: number) {
    this.res = res;
    const { W, H } = this.o.L;
    this.hitArea = new Rectangle(0, 0, W, H);
    this.fx = sharedFx ??= new Particles();
    this.demoFx = sharedDemoFx ??= new Particles();
    const specs = this.specs();
    this.P = this.plan(specs);
    const P = this.P;
    const unit = clamp((P.fit?.D ?? P.play.h * 1.6) / 3.1, 18, 96);
    await Promise.all([this.buildArt(), this.fx.build(unit, res), this.demoFx.build(unit, res)]);
    // Text is never under a particle or a moving sprite: every layer that carries lettering (card
    // text, badges, PLAY, the toggle, the lockup) sits above both particle systems and the flyer.
    for (const l of [this.cardLayer, this.cardTextLayer, this.demoFxLayer, this.flyLayer, this.fxLayer, this.charLayer, this.backdrop]) l.eventMode = 'none';
    this.addChild(this.backdrop, this.charLayer, this.fxLayer, this.cardLayer, this.demoFxLayer, this.flyLayer, this.navLayer, this.cardTextLayer, this.ui, this.logoLayer);
    this.buildBackdrop();
    if (this.full) {
      await this.buildLogo();
      this.buildCards(specs);
      this.buildDots();
      await this.buildBadges();
      this.charLayer.addChild(this.capWrap, this.parWrap);
    }
    this.buildPlay();
    this.buildToggle();
    this.car.offset = this.o.index ?? (P.n === 3 ? -1 : 0);
    if (this.full) this.placeCards();
    this.autoT = 5;
    this.offQuality = quality.onChange(() => this.applyQuality());
    if (this.o.intro) this.prepareIntro();
    else this.idle();
  }

  private specs(): CardSpec[] {
    const list: CardSpec[] = [
      { kind: 'bomb', title: t('splashBombTitle'), body: t('splashBomb'), tone: 'fire', accent: hex(C.fire) },
      { kind: 'kegs', title: t('splashBrimTitle'), body: t('splashBrim'), tone: 'gold', accent: hex(C.fireHot) },
      { kind: 'wheel', title: t('splashWheelTitle'), body: t('splashWheel'), tone: 'sea', accent: hex(C.seaLight) },
      { kind: 'boost', title: t('splashBoostTitle'), body: t('splashBoost', { cost: num(BOOST_COST), boost: CHARGE_MAX_BOOST, base: CHARGE_MAX }), tone: 'silver', accent: hex(C.fireHot) },
      { kind: 'max', title: t('splashMaxTitle'), body: t('splashMax', { max: num(MAX_WIN) }), tone: 'gold', accent: hex(C.gold) },
    ];
    return list.filter((s) => s.kind !== 'boost' || this.o.boost);
  }

  private async buildArt() {
    const P = this.P;
    const r = this.res;
    const cw = Math.max(40, P.cw);
    const bombArt = SYMBOL_ART[11] as { idle: () => string; hot?: () => string; win?: () => string } | undefined;
    const bombSet = this.o.symTex.sets.get(11) as ({ idle: Texture; hot?: Texture; win?: Texture } | undefined);
    const bombPx = Math.round(Math.max(64, (P.fit?.D ?? 120) * 0.5) * r);
    const arrowPx = Math.max(24, P.arrow) * r;
    const badgeH = P.badges?.h ?? 40;
    const pip = badgeH * 0.42 * r;
    const [board, playTop, playBase, box, tick, arrow, dotOn, dotOff, pipOn, pipOff, bomb, bombHot, leverOff, leverOn, handle, rays, spark] = await Promise.all([
      this.full && P.fit ? svgTexture(`splash-board-${Math.round((P.ch / cw) * 100)}`, boardSvg(P.ch / cw), cw * r, P.ch * r) : Promise.resolve(Texture.EMPTY),
      svgTexture('splash-play-top', playTopSvg(), P.play.h * PLAY_ASPECT * r),
      svgTexture('splash-play-base', playBaseSvg(), P.play.h * PLAY_ASPECT * r),
      svgTexture('splash-box', checkBoxSvg(), P.toggle.h * 0.8 * r),
      svgTexture('splash-tick', checkMarkSvg(), P.toggle.h * 0.8 * r),
      svgTexture('splash-arrow', arrowSvg(), arrowPx),
      svgTexture('splash-dot-on', dotSvg(true), Math.max(12, P.dotR * 3.2) * r),
      svgTexture('splash-dot-off', dotSvg(false), Math.max(12, P.dotR * 3.2) * r),
      svgTexture('splash-pip-on', skullPipSvg(true), pip),
      svgTexture('splash-pip-off', skullPipSvg(false), pip),
      bombSet ? Promise.resolve(bombSet.idle) : svgTexture('splash-bomb', bombArt ? bombArt.idle() : bombStandInSvg(false), bombPx),
      bombSet ? Promise.resolve(bombSet.hot ?? bombSet.win ?? bombSet.idle) : svgTexture('splash-bomb-hot', bombArt ? (bombArt.hot ?? bombArt.win ?? bombArt.idle)() : bombStandInSvg(true), bombPx),
      svgTexture('splash-lever-off', leverBaseSvg(false), (P.fit?.D ?? 100) * 0.7 * r),
      svgTexture('splash-lever-on', leverBaseSvg(true), (P.fit?.D ?? 100) * 0.7 * r),
      svgTexture('splash-lever-handle', leverHandleSvg(), (P.fit?.D ?? 100) * 0.3 * r),
      svgTexture('splash-rays', chestRays(), (P.fit?.D ?? 100) * 1.1 * r),
      svgTexture('splash-spark', sparkArt(), P.play.h * 0.5 * r),
    ]);
    this.art = {
      board,
      playTop,
      playBase,
      box,
      tick,
      arrow,
      dotOn,
      dotOff,
      pipOn,
      pipOff,
      bomb,
      bombHot,
      leverOff,
      leverOn,
      handle,
      rays,
      spark,
      sweep: sweepTexture(),
      vignette: vignetteTexture(),
    };
  }

  /* --------------------------------------- layout --------------------------------------- */

  private plan(specs: CardSpec[]): Plan {
    const L = this.o.L;
    const { W, H } = L;
    const U = Math.min(W, H);
    if (!this.full) {
      const ph = clamp(U * 0.14, 46, 112);
      const th = clamp(U * 0.07, 28, 44);
      const cy = L.portrait ? L.frame.y + L.frame.h * 0.5 : L.frame.y + L.frame.h * 0.48;
      return {
        W,
        H,
        U,
        m: clamp(U * 0.03, 8, 26),
        logo: null,
        car: null,
        n: 0,
        cw: 0,
        ch: 0,
        gap: 0,
        fit: null,
        arrow: 0,
        dotsY: 0,
        dotR: 0,
        play: { cx: W / 2, cy, h: ph },
        toggle: { x: W / 2, cy: Math.min(H - th, cy + ph * 0.5 + th * 1.1), h: th, maxW: W * 0.8, center: true },
        badges: null,
      };
    }
    const m = clamp(U * 0.028, 8, 26);
    // the rigs keep their in-game posts; their reach includes the cheer pose and the hop
    const box = (c: { x: number; y: number; h: number }, l: number, r: number, hu: number) => {
      const k = c.h / hu;
      return { x0: c.x - l * k, x1: c.x + r * k, y0: c.y - c.h * 1.08, y1: c.y };
    };
    const cap = box(L.captain, 182, 182, 520);
    const par = box(L.parrot, 120, 120, 360);
    const [left, right] = L.captain.x <= L.parrot.x ? [cap, par] : [par, cap];
    const floor = Math.max(left.y1, right.y1);
    const charTop = Math.min(left.y0, right.y0);
    const dotR = clamp(U * 0.011, 4, 9);
    const dotsH = dotR * 2 + m * 0.7;
    let logoW: number;
    // room above the lockup, so its drop is on screen from the first visible frame
    let logoY = Math.max(m * 0.8, H * 0.04);
    let carTop: number;
    let carBot: number;
    let colL: number;
    let colR: number;
    let play: Plan['play'];
    let toggle: Plan['toggle'];
    let badges: Plan['badges'] = null;
    let bh = clamp(U * 0.07, 38, 62);
    if (!L.portrait) {
      // a column centred on the screen, clear of both rigs
      const half = Math.min(W / 2 - left.x1, right.x0 - W / 2) - m * 0.5;
      colL = W / 2 - half;
      colR = W / 2 + half;
      const colW = colR - colL;
      const band = H - floor;
      const ph = clamp(Math.max(H * 0.095, Math.min(band * 0.86, H * 0.15)), 38, 112);
      const pcy = band >= ph + m * 0.4 ? floor + band / 2 : H - m * 0.6 - ph / 2;
      play = { cx: (colL + colR) / 2, cy: pcy, h: ph };
      const th = clamp(U * 0.055, 26, 44);
      const pw = ph * PLAY_ASPECT;
      const cornerW = play.cx - pw / 2 - m * 2;
      toggle = cornerW >= th * 3.4 ? { x: m, cy: pcy, h: th, maxW: cornerW, center: false } : { x: play.cx, cy: Math.min(H - th * 0.6, pcy + ph / 2 + th * 0.6), h: th, maxW: colW, center: true };
      if (toggle.center) play.cy -= th * 0.8;
      logoW = Math.min(colW * 0.95, W * 0.34, (H * 0.27) / LOGO_K);
      carBot = play.cy - ph / 2 - dotsH - m * 0.3;
      carTop = logoY + logoW * LOGO_K + m * 0.3;
      const minCar = Math.min(U * 0.36, 170);
      if (carBot - carTop < minCar) {
        logoW = Math.max(U * 0.32, logoW - (minCar - (carBot - carTop)) / LOGO_K);
        carTop = logoY + logoW * LOGO_K + m * 0.3;
      }
      const cornerRoom = (W - logoW) / 2 - m * 1.6;
      if (cornerRoom >= bh * 2 && m + bh < charTop - m * 0.3) badges = { mode: 'corners', x0: m, x1: W - m, y: m, h: bh };
      else {
        badges = { mode: 'row', x0: colL, x1: colR, y: carTop, h: bh * 0.8 };
        carTop += bh * 0.8 + m * 0.4;
      }
    } else {
      colL = m;
      colR = W - m;
      const band = H - floor;
      const th = clamp(U * 0.08, 28, 44);
      const ph = clamp(Math.min(H * 0.09, (band - th - m) * 0.92), 40, 100);
      const pcy = floor + (band - th - m * 0.5) / 2;
      play = { cx: W / 2, cy: pcy, h: ph };
      toggle = { x: W / 2, cy: Math.min(H - m * 0.4 - th / 2, pcy + ph / 2 + m * 0.35 + th / 2), h: th, maxW: W - m * 2, center: true };
      logoW = Math.min(W * 0.74, (H * 0.165) / LOGO_K);
      carTop = logoY + logoW * LOGO_K + m * 0.35;
      carBot = charTop - dotsH - m * 0.2;
      // the badges stand between the rigs, or in a row under the logo
      const gx0 = left.x1 + m * 0.3;
      const gx1 = right.x0 - m * 0.3;
      bh = clamp(U * 0.12, 30, 54);
      // (clear of PLAY at its biggest: the press pop and the entrance overshoot)
      const stackBot = Math.min(floor, pcy - (ph / 2) * PLAY_MAX_K - m * 0.3);
      if (gx1 - gx0 >= bh * 2.3 && bh * 2 + m * 0.4 <= stackBot - charTop) badges = { mode: 'stack', x0: gx0, x1: gx1, y: charTop + (stackBot - charTop - bh * 2 - m * 0.3) / 2, h: bh };
      else {
        bh = clamp(U * 0.08, 28, 44);
        badges = { mode: 'row', x0: m, x1: W - m, y: carTop, h: bh };
        carTop += bh + m * 0.4;
      }
    }
    const carH = Math.max(80, carBot - carTop);
    const colW = colR - colL;
    let best: Omit<Plan, 'W' | 'H' | 'U' | 'm' | 'logo' | 'play' | 'toggle' | 'badges' | 'dotsY' | 'dotR'> | null = null;
    for (const n of [3, 2, 1]) {
      if (n > specs.length) continue;
      const gap = clamp(colW * 0.03, 8, 30);
      const arrow = n === 1 ? clamp(U * 0.085, 28, 52) : 0;
      // arrows sit over the frame's outer edge, not beside it
      const availW = colW - (n === 1 ? 2 * arrow * 0.72 : 0);
      let cw = (availW - (n - 1) * gap) / n;
      let ch = Math.min(carH, cw * 1.62);
      cw = Math.min(cw, ch * 2.2);
      ch = Math.min(ch, cw * 1.62);
      // several cards only when each stays big enough to read
      if (n === 3 && cw < Math.max(270, U * 0.28)) continue;
      if (n === 2 && cw < 215) continue;
      if (n > 1 && ch < 150) continue;
      const fit = this.fitCard(cw, ch, specs);
      if (n > 1 && !fit.body) continue;
      let a = arrow;
      if (n === 1 && availW < 150) {
        // too narrow for arrows: swipe and the dots drive it
        a = 0;
        cw = Math.min(colW, ch * 1.9);
      }
      best = { car: { cx: (colL + colR) / 2, cy: carTop + carH / 2, w: colW, h: carH }, n, cw, ch, gap, fit: n === 1 && a !== arrow ? this.fitCard(cw, ch, specs) : fit, arrow: a };
      break;
    }
    const b = best!;
    return {
      W,
      H,
      U,
      m,
      logo: { x: W / 2 - logoW / 2, y: logoY, w: logoW },
      ...b,
      dotsY: b.car!.cy + b.ch / 2 + m * 0.35 + dotR,
      dotR,
      play,
      toggle,
      badges,
    };
  }

  /** Card inner layout: demo over title over blurb (or demo beside the text on short cards). */
  private fitCard(cw: number, ch: number, specs: CardSpec[]): CardFit {
    const pk = Math.min(cw, ch) / 300;
    const pw = cw - 64 * pk;
    const phH = ch - 68 * pk;
    const pp = Math.max(5, 9 * pk);
    const aw = pw - pp * 2;
    const ah = phH - pp * 2;
    const U = Math.min(this.o.L.W, this.o.L.H);
    const title = clamp(Math.min(cw, ch * 1.2) * 0.082, 12.5, 40);
    const titleH = title * 1.3;
    const measure = (size: number, width: number) => Math.max(...specs.map((s) => CanvasTextMetrics.measureText(s.body, bodyStyle(size, width, 'center')).height));
    const tryV = (): CardFit | null => {
      // blurbs scale with the screen too (big screens), then step down until they fit
      for (let bs = clamp(Math.max(cw * 0.048, U * 0.0155), 12.5, 19); bs >= 12; bs -= 0.5) {
        const bodyH = measure(bs, aw * 0.94);
        const rest = ah - titleH - title * 0.55 - bodyH;
        if (rest >= Math.min(aw, ah) * 0.34) return { vertical: true, D: Math.min(aw * 0.86, rest), title, body: bs };
      }
      return null;
    };
    const tryH = (): CardFit | null => {
      const D = Math.min(ah * 0.92, aw * 0.42);
      const tw = aw - D - pp;
      // the title leads the blurb: clearly bigger than it
      const th = clamp(Math.min(ah * 0.2, tw * 0.11), 13, 30);
      for (let bs = clamp(Math.min(cw * 0.04, th * 0.72), 12.5, 17); bs >= 12; bs -= 0.5) {
        const bodyH = measure(bs, tw);
        if (th * 1.3 + th * 0.25 + bodyH <= ah) return { vertical: false, D, title: th, body: bs };
      }
      return null;
    };
    const vertical = ch / cw >= 0.8;
    const fit = vertical ? tryV() ?? tryH() : tryH() ?? tryV();
    if (fit) return fit;
    // no room for the blurb: art and title only
    return vertical || ch / cw >= 0.62 ? { vertical: true, D: Math.min(aw * 0.86, ah - titleH - title * 0.3), title, body: 0 } : { vertical: false, D: Math.min(ah * 0.92, aw * 0.42), title, body: 0 };
  }

  /* --------------------------------------- pieces --------------------------------------- */

  private buildBackdrop() {
    const { W, H } = this.P;
    this.shade.rect(0, 0, W, H).fill({ color: hex(C.nightDeep), alpha: this.full ? 0.74 : 0.46 });
    this.vignette.texture = this.art.vignette;
    this.vignette.width = W;
    this.vignette.height = H;
    this.vignette.alpha = this.full ? 1 : 0.7;
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = hex(C.fireHot);
    this.glow.alpha = 0.16;
    this.backdrop.addChild(this.shade, this.vignette, this.glow);
    if (this.P.logo) {
      const L = this.P.logo;
      this.glow.position.set(L.x + L.w / 2, L.y + L.w * 0.3);
      this.glow.width = L.w * 1.7;
      this.glow.height = L.w * 1.0;
    } else {
      this.glow.position.set(this.P.play.cx, this.P.play.cy);
      this.glow.width = this.P.play.h * PLAY_ASPECT * 1.8;
      this.glow.height = this.P.play.h * 2.4;
    }
  }

  private async buildLogo() {
    const L = this.P.logo!;
    const logo = new Logo();
    const h = L.w * LOGO_RECT_K;
    await logo.layout({ x: 0, y: 0, w: L.w, h }, this.res);
    this.logo = logo;
    // pivot at the foot of the lockup so the landing squashes onto it
    this.logoHolder.pivot.set(L.w / 2, L.w * LOGO_FOOT);
    this.logoHolder.position.set(L.x + L.w / 2, L.y + L.w * LOGO_FOOT);
    this.logoHolder.addChild(logo);
    this.logoLayer.addChild(this.logoHolder);
    if (quality.low || speed.reduced) return;
    // light sweep: a bright band masked to the lettering's own silhouette
    const pad = L.w * 0.08;
    try {
      this.logoSil = this.o.renderer.generateTexture({ target: logo, frame: new Rectangle(-pad, -pad, L.w + pad * 2, h + pad * 2), resolution: Math.min(this.res, 1.5) });
    } catch {
      return;
    }
    const sil = new Sprite(this.logoSil);
    sil.position.set(-pad, -pad);
    sil.width = L.w + pad * 2;
    sil.height = h + pad * 2;
    const sweep = new Sprite(this.art.sweep);
    sweep.anchor.set(0.5);
    sweep.blendMode = 'add';
    sweep.width = L.w * 0.3;
    sweep.height = h * 2;
    sweep.rotation = 0.35;
    sweep.alpha = 0.85;
    sweep.visible = false;
    sweep.mask = sil;
    this.logoHolder.addChild(sil, sweep);
    this.sweep = sweep;
  }

  private buildCards(specs: CardSpec[]) {
    const P = this.P;
    const fit = P.fit!;
    const res = this.res;
    const kit: DemoKit = {
      sym: this.o.symTex,
      art: this.art,
      fx: this.demoFx,
      wheelTex: this.o.wheelTex,
      react: (k) => this.react(k),
      throwBomb: (g) => this.throwInto(g, fit.D / 3.08),
    };
    this.flyer.texture = this.art.bomb;
    this.flyer.anchor.set(0.5);
    this.flyer.visible = false;
    this.flyLayer.addChild(this.flyer);
    const pk = Math.min(P.cw, P.ch) / 300;
    const panel = { x0: -P.cw / 2 + 32 * pk, x1: P.cw / 2 - 32 * pk, y0: -P.ch / 2 + 30 * pk, y1: P.ch / 2 - 38 * pk };
    const pp = Math.max(5, 9 * pk);
    const aw = panel.x1 - panel.x0 - pp * 2;
    const ah = panel.y1 - panel.y0 - pp * 2;
    for (const spec of specs) {
      const view = new Container();
      const swing = new Container();
      view.addChild(swing);
      const frame = new Sprite(this.art.board);
      frame.anchor.set(0.5);
      frame.width = P.cw;
      frame.height = P.ch;
      const glow = new Sprite(softDotTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = spec.accent;
      glow.alpha = 0.3;
      glow.width = glow.height = fit.D * 1.55;
      const demo = this.makeDemo(spec.kind, kit, fit.D);
      swing.addChild(frame, glow, demo.view);
      const tview = new Container();
      const tswing = new Container();
      tview.addChild(tswing);
      tswing.addChild(demo.labels);
      const titleW = fit.vertical ? aw * 0.96 : aw - fit.D - pp;
      const title = displayText(spec.title, { size: fit.title, tone: spec.tone, treatment: 'title', res });
      const tsz = fitDisplay(title, titleW);
      let body: Text | null = null;
      if (fit.body) {
        body = new Text({ text: spec.body, style: bodyStyle(fit.body, fit.vertical ? aw * 0.94 : titleW, fit.vertical ? 'center' : rtl ? 'right' : 'left'), resolution: res });
      }
      const bodyH = body ? body.height : 0;
      if (fit.vertical) {
        const gap1 = fit.title * 0.35;
        const gap2 = fit.title * 0.2;
        const total = fit.D + gap1 + tsz.h + (body ? gap2 + bodyH : 0);
        let y = panel.y0 + pp + Math.max(0, (ah - total) / 2);
        demo.view.position.set(0, y + fit.D / 2);
        glow.position.copyFrom(demo.view.position);
        y += fit.D + gap1;
        title.position.set(0, y + tsz.h / 2);
        y += tsz.h + gap2;
        if (body) {
          body.anchor.set(0.5, 0);
          body.position.set(0, y);
        }
      } else {
        const dx = rtl ? panel.x1 - pp - fit.D / 2 : panel.x0 + pp + fit.D / 2;
        demo.view.position.set(dx, (panel.y0 + panel.y1) / 2);
        glow.position.copyFrom(demo.view.position);
        const tx0 = rtl ? panel.x0 + pp : panel.x0 + pp + fit.D + pp;
        const total = tsz.h + (body ? fit.title * 0.2 + bodyH : 0);
        let y = (panel.y0 + panel.y1) / 2 - total / 2;
        // flush with the blurb's edge
        title.position.set(rtl ? tx0 + titleW - tsz.w / 2 : tx0 + tsz.w / 2, y + tsz.h / 2);
        y += tsz.h + fit.title * 0.2;
        if (body) {
          body.anchor.set(rtl ? 1 : 0, 0);
          body.position.set(rtl ? tx0 + titleW : tx0, y);
        }
      }
      demo.labels.position.copyFrom(demo.view.position);
      tswing.addChild(title);
      if (body) tswing.addChild(body);
      view.position.set(P.car!.cx, P.car!.cy);
      this.cardLayer.addChild(view);
      this.cardTextLayer.addChild(tview);
      this.cards.push({ spec, view, swing, tview, tswing, demo, glow });
    }
  }

  private makeDemo(kind: DemoKind, kit: DemoKit, D: number): Demo {
    switch (kind) {
      case 'bomb':
        return new BombDemo(kit, D);
      case 'kegs':
        return new KegDemo(kit, D);
      case 'wheel':
        return new WheelDemo(kit, D);
      case 'boost':
        return new BoostDemo(kit, D);
      default:
        return new MaxDemo(kit, D);
    }
  }

  private buildDots() {
    const P = this.P;
    const N = this.cards.length;
    const step = P.dotR * 3.6;
    const x0 = P.car!.cx - ((N - 1) * step) / 2;
    for (let i = 0; i < N; i++) {
      const d = new Sprite(this.art.dotOff);
      d.anchor.set(0.5);
      setSize(d, P.dotR * 3.2);
      d.position.set(x0 + i * step, P.dotsY);
      d.eventMode = 'static';
      d.cursor = 'pointer';
      const hit = Math.max(22, step) / 2 / Math.max(0.001, d.scale.x);
      d.hitArea = new Rectangle(-hit, -hit * 1.2, hit * 2, hit * 2.4);
      d.on('pointertap', (e) => {
        e.stopPropagation();
        this.uiTap(null);
        this.goTo(i);
      });
      this.dots.push(d);
      this.ui.addChild(d);
    }
    if (P.arrow > 0 && P.car) {
      for (const dir of [-1, 1] as const) {
        const a = new Container();
        const s = new Sprite(this.art.arrow);
        s.anchor.set(0.5);
        setSize(s, P.arrow);
        if (dir < 0) s.scale.x *= -1;
        a.addChild(s);
        const x = P.car.cx + dir * (P.cw / 2 + P.arrow * 0.22);
        a.position.set(x, P.car.cy);
        a.eventMode = 'static';
        a.cursor = 'pointer';
        a.hitArea = new Rectangle(-P.arrow * 0.62, -P.arrow * 0.8, P.arrow * 1.24, P.arrow * 1.6);
        a.on('pointertap', (e) => {
          e.stopPropagation();
          this.uiTap(null);
          this.userStep(dir);
          gsap.fromTo(s.scale, { x: s.scale.x * 0.82, y: s.scale.y * 0.82 }, { x: s.scale.x, y: s.scale.y, duration: 0.3, ease: 'back.out(3)' });
        });
        a.on('pointerover', () => gsap.to(a.scale, { x: 1.08, y: 1.08, duration: 0.15 }));
        a.on('pointerout', () => gsap.to(a.scale, { x: 1, y: 1, duration: 0.15 }));
        this.arrows.push(a);
        this.navLayer.addChild(a);
      }
    }
  }

  private async buildBadges() {
    const P = this.P;
    const slot = P.badges;
    if (!slot) return;
    const pending: Promise<void>[] = [];
    const make = (label: string, value: Container, valueW: number, valueH: number) => {
      const c = new Container();
      const fs = Math.max(10.5, slot.h * 0.28);
      const lab = displayText(label, { size: fs, tone: 'white', treatment: 'label', res: this.res });
      const padX = slot.h * 0.34;
      const w = Math.max(lab.inkWidth + fs * 0.3, valueW) + padX * 2;
      const h = slot.h;
      const plaque = new Sprite(Texture.EMPTY);
      plaque.anchor.set(0.5);
      c.addChild(plaque, lab, value);
      lab.position.set(0, -h * 0.2);
      value.position.set(0, h * 0.2);
      pending.push(
        svgTexture(`splash-plaque-${Math.round((w / h) * 20)}`, plaqueSvg(w / h), w * this.res).then((tx) => {
          if (plaque.destroyed) return;
          plaque.texture = tx;
          plaque.width = w;
          plaque.height = h;
        }),
      );
      plaque.width = w;
      plaque.height = h;
      void valueH;
      return { c, w, h };
    };
    // volatility: five skulls, lit to the level
    const pips = new Container();
    const ps = slot.h * 0.34;
    for (let i = 0; i < 5; i++) {
      const s = new Sprite(i < VOL_PIPS ? this.art.pipOn : this.art.pipOff);
      s.anchor.set(0.5);
      setSize(s, ps * 1.2);
      s.x = (i - 2) * ps * 1.12;
      pips.addChild(s);
    }
    const vol = make(t('splashVolatility'), pips, ps * 5.8, ps);
    const big = bitmapNum(`${MAX_WIN.toLocaleString('en-US')}x`, 'gold', slot.h * 0.36);
    const max = make(t('maxWinCaps'), big, big.width, big.height);
    const items = [vol, max];
    if (slot.mode === 'corners') {
      const room = (P.W - (P.logo?.w ?? 0)) / 2 - P.m * 1.6;
      items.forEach((it, i) => {
        const k = Math.min(1, room / it.w);
        it.c.scale.set(k);
        const x = i === 0 ? slot.x0 + (it.w * k) / 2 : slot.x1 - (it.w * k) / 2;
        it.c.position.set(x, slot.y + (it.h * k) / 2);
      });
    } else if (slot.mode === 'stack') {
      const room = slot.x1 - slot.x0;
      items.forEach((it, i) => {
        const k = Math.min(1, room / it.w);
        it.c.scale.set(k);
        it.c.position.set((slot.x0 + slot.x1) / 2, slot.y + it.h * k * (i + 0.5) + i * P.m * 0.3);
      });
    } else {
      const gap = P.m * 0.6;
      const total = items.reduce((a, it) => a + it.w, 0) + gap;
      const k = Math.min(1, (slot.x1 - slot.x0) / total);
      let x = (slot.x0 + slot.x1) / 2 - (total * k) / 2;
      for (const it of items) {
        it.c.scale.set(k);
        it.c.position.set(x + (it.w * k) / 2, slot.y + (it.h * k) / 2);
        x += (it.w + gap) * k;
      }
    }
    for (const it of items) {
      this.badges.push(it.c);
      this.ui.addChild(it.c);
    }
    await Promise.all(pending);
  }

  private buildPlay() {
    const P = this.P;
    const ph = P.play.h;
    const pw = ph * PLAY_ASPECT;
    const base = new Sprite(this.art.playBase);
    base.anchor.set(0.5);
    base.width = pw;
    base.height = ph;
    const top = new Sprite(this.art.playTop);
    top.anchor.set(0.5);
    top.width = pw;
    top.height = ph;
    const label = displayText(t('splashPlay'), { size: ph * 0.5, tone: 'white', treatment: 'banner', res: this.res });
    fitDisplay(label, pw * 0.66, ph * 0.62);
    label.position.set(0, -ph * 0.07);
    // the fuse spark runs round the rim over the plaque art but under the lettering
    this.playFace.addChild(top, this.spark, label);
    this.playHalo.anchor.set(0.5);
    this.playHalo.blendMode = 'add';
    this.playHalo.tint = hex(C.fire);
    this.playHalo.width = pw * 1.5;
    this.playHalo.height = ph * 2.1;
    this.playHalo.alpha = 0.32;
    this.spark.texture = this.art.spark;
    this.spark.anchor.set(0.5);
    setSize(this.spark, ph * 0.46);
    this.spark.blendMode = 'normal';
    this.play.addChild(base, this.playFace);
    // its glow lights the backdrop behind everything (never over any lettering near it)
    this.playHalo.position.set(P.play.cx, P.play.cy);
    this.backdrop.addChild(this.playHalo);
    this.play.position.set(P.play.cx, P.play.cy);
    this.play.eventMode = 'static';
    this.play.cursor = 'pointer';
    this.play.hitArea = new Rectangle(-pw / 2, -ph / 2, pw, ph);
    const depth = ph * 0.075;
    this.play.on('pointerdown', () => {
      if (this.closing) return;
      gsap.to(this.playFace, { y: depth, duration: 0.06, ease: 'power2.out' });
    });
    const up = () => {
      if (this.closing) return;
      gsap.to(this.playFace, { y: 0, duration: 0.3, ease: 'back.out(3)' });
    };
    this.play.on('pointerupoutside', up);
    this.play.on('pointerout', up);
    this.play.on('pointerover', () => {
      if (this.closing) return;
      gsap.to(this.playHalo, { alpha: 0.55, duration: 0.2 });
      this.glance(this.play.x, this.play.y, 2);
    });
    this.ui.addChild(this.play);
    this.placeSpark();
  }

  private buildToggle() {
    const P = this.P;
    const T = P.toggle;
    const bs = T.h * 0.72;
    const box = new Sprite(this.art.box);
    box.anchor.set(0.5);
    setSize(box, bs);
    this.tick.texture = this.art.tick;
    this.tick.anchor.set(0.42, 0.58);
    setSize(this.tick, bs * 1.05);
    this.tick.visible = this.checked;
    const fs = clamp(T.h * 0.44, 12, 19);
    const maxLabel = Math.max(40, T.maxW - bs - T.h * 0.3);
    const label = new Text({
      text: t('splashDontShow'),
      style: new TextStyle({
        fontFamily: FONT_UI,
        fontWeight: '600',
        fontSize: fs,
        fill: C.paper,
        wordWrap: true,
        breakWords: cjkScript,
        wordWrapWidth: maxLabel,
        lineHeight: fs * 1.18,
        padding: 4,
        dropShadow: { color: '#000000', alpha: 0.75, blur: 2, distance: 1.5, angle: Math.PI / 2 },
      }),
      resolution: this.res,
    });
    label.anchor.set(rtl ? 1 : 0, 0.5);
    const gap = T.h * 0.28;
    const w = bs + gap + label.width;
    const left = T.center ? -w / 2 : 0;
    if (rtl) {
      box.position.set(left + w - bs / 2, 0);
      label.position.set(left + w - bs - gap, 0);
    } else {
      box.position.set(left + bs / 2, 0);
      label.position.set(left + bs + gap, 0);
    }
    this.tick.position.copyFrom(box.position);
    this.toggle.addChild(box, this.tick, label);
    this.toggle.position.set(T.center ? T.x : T.x, T.cy);
    this.toggle.eventMode = 'static';
    this.toggle.cursor = 'pointer';
    const hh = Math.max(T.h, label.height + 8, 40) / 2;
    this.toggle.hitArea = new Rectangle(left - 8, -hh, w + 16, hh * 2);
    this.toggle.on('pointertap', (e) => {
      e.stopPropagation();
      this.uiTap('uiToggle');
      this.checked = !this.checked;
      setIntroSkipped(this.checked);
      this.tick.visible = this.checked;
      const k = this.tick.scale.x;
      if (this.checked) gsap.fromTo(this.tick.scale, { x: k * 0.2, y: k * 0.2 }, { x: k, y: k, duration: 0.35, ease: 'back.out(3.2)' });
      const bk = box.scale.x;
      gsap.fromTo(box.scale, { x: bk * 0.82, y: bk * 0.82 }, { x: bk, y: bk, duration: 0.3, ease: 'back.out(3)' });
    });
    this.ui.addChild(this.toggle);
  }

  /**
   * This build is the one on screen now: it takes over the shared particles and Cap'n Kaboom and
   * Sparks (they step above the shade at their in-game posts) from the previous splash.
   */
  activate() {
    this.fxLayer.addChildAt(this.fx, 0);
    this.demoFxLayer.addChildAt(this.demoFx, 0);
    const cast = this.o.cast;
    if (!cast || !this.full) return;
    const L = this.o.L;
    for (const [w, c] of [
      [this.capWrap, L.captain],
      [this.parWrap, L.parrot],
    ] as const) {
      const dx = w.x - w.pivot.x;
      const dy = w.y - w.pivot.y;
      w.pivot.set(c.x, c.y);
      w.position.set(c.x + dx, c.y + dy);
    }
    this.capWrap.addChild(cast.captain);
    this.parWrap.addChild(cast.parrot);
    cast.captain.fx = this.fx;
    cast.parrot.fx = this.fx;
  }

  /** Hand the rigs back (never destroyed with the splash); the caller re-parents them. */
  releaseCast() {
    this.capWrap.removeChildren();
    this.parWrap.removeChildren();
  }

  /* -------------------------------------- carousel -------------------------------------- */

  private placeCards() {
    const P = this.P;
    const N = this.cards.length;
    if (!N || !P.car) return;
    const n = P.n;
    const c = (n - 1) / 2;
    const pitch = P.cw + P.gap;
    const out = this.outPitch();
    let feat = -1;
    let best = 9;
    let bestS = 9;
    for (let k = 0; k < N; k++) {
      const card = this.cards[k];
      let s = k - this.car.offset;
      s = ((((s - c + N / 2) % N) + N) % N) - N / 2 + c;
      const d = Math.max(0, Math.abs(s - c) - (n - 1) / 2);
      const a = clamp(1 - d / 0.42, 0, 1);
      // past the resting slots a card fades out over a shorter slide, so its text never reaches
      // the screen edge while it is still visible
      const e = s - c;
      const rest = (n - 1) / 2;
      card.view.x = P.car.cx + (Math.abs(e) <= rest ? e * pitch : Math.sign(e) * (rest * pitch + (Math.abs(e) - rest) * out));
      card.view.alpha = speed.reduced ? (a > 0.5 ? 1 : 0) : a;
      card.view.visible = card.view.alpha > 0.01;
      const k3 = n === 3 ? 1 - 0.06 * Math.min(1, Math.abs(s - c)) : 1;
      card.view.scale.set(k3 * (1 - 0.08 * Math.min(1, d)));
      // the most central card; of two equally central ones (two on screen), the left one
      const dc = Math.abs(s - c);
      if (dc < best - 1e-3 || (Math.abs(dc - best) <= 1e-3 && s < bestS)) {
        best = dc;
        bestS = s;
        feat = k;
      }
      if (this.dots[k]) {
        const lit = a > 0.5;
        const tx = lit ? this.art.dotOn : this.art.dotOff;
        if (this.dots[k].texture !== tx) {
          this.dots[k].texture = tx;
          setSize(this.dots[k], P.dotR * (lit ? 3.3 : 3.0));
        }
      }
    }
    for (let k = 0; k < N; k++) this.cards[k].demo.featured = k === feat;
    this.syncCardText();
    if (feat !== this.featured) {
      const first = this.featured < 0;
      this.featured = feat;
      if (!first && !this.closing && feat >= 0) {
        const c = this.cards[feat].view;
        this.glance(c.x, c.y);
        if (Math.random() < 0.35) this.react('card');
      }
    }
  }

  step(dir: number) {
    this.userStep(dir);
  }

  /** The text layer follows each card exactly (called every frame, after the tweens ran). */
  private syncCardText() {
    for (const c of this.cards) {
      const v = c.view;
      const t = c.tview;
      t.position.copyFrom(v.position);
      t.scale.copyFrom(v.scale);
      t.rotation = v.rotation;
      t.alpha = v.alpha;
      t.visible = v.visible;
      const s = c.swing;
      const ts = c.tswing;
      ts.position.copyFrom(s.position);
      ts.scale.copyFrom(s.scale);
      ts.rotation = s.rotation;
      ts.alpha = s.alpha;
    }
  }

  /** Slide per slot beyond the resting cards: the fading card's text stays clear of the screen edge. */
  private outPitch(): number {
    const P = this.P;
    const pitch = P.cw + P.gap;
    const rest = ((P.n - 1) / 2) * pitch;
    const inset = (32 + 12) * (Math.min(P.cw, P.ch) / 300);
    const room = P.W / 2 - Math.max(4, P.m * 0.4) - rest - (P.cw / 2 - inset);
    return clamp(room / 0.42, P.cw * 0.25, pitch);
  }

  /** Pixels of drag per slot: the resting pitch, or the fading slide when only one card shows. */
  private dragPitch(): number {
    return this.P.n === 1 ? this.outPitch() : this.P.cw + this.P.gap;
  }

  private userStep(dir: number) {
    if (!this.full || this.closing || !this.cards.length) return;
    this.pausedUntil = this.t + 8;
    this.slideTo(Math.round(this.car.offset) + dir);
  }

  private goTo(i: number) {
    if (this.closing) return;
    const N = this.cards.length;
    const c = (this.P.n - 1) / 2;
    // the dot's card becomes the featured one, by the shortest way round
    const cur = Math.round(this.car.offset);
    let target = i - c;
    const diff = ((((target - cur) % N) + N * 1.5) % N) - N / 2;
    target = cur + Math.round(diff);
    this.pausedUntil = this.t + 8;
    this.slideTo(target);
  }

  private slideTo(target: number) {
    this.carTween?.kill();
    this.autoT = 5;
    // one whoosh per card change, whatever moved it (arrows, dots, swipe, keys, auto-advance);
    // silent until audio unlocks
    if (target !== Math.round(this.car.offset) || Math.abs(target - this.car.offset) > 0.2) this.o.sfx?.('carouselWhoosh');
    if (speed.reduced) {
      this.car.offset = target;
      this.placeCards();
      for (const c of this.cards) if (c.view.visible) gsap.fromTo(c.swing, { alpha: 0 }, { alpha: 1, duration: 0.3 });
      return;
    }
    this.carTween = gsap.to(this.car, { offset: target, duration: 0.62, ease: 'power3.inOut', onUpdate: () => this.placeCards() });
  }

  /* ------------------------------------- interaction ------------------------------------ */

  private inCarousel(x: number, y: number) {
    const c = this.P.car;
    if (!c) return false;
    return Math.abs(x - c.cx) <= c.w / 2 && Math.abs(y - c.cy) <= this.P.ch / 2;
  }

  private pointerDown(e: FederatedPointerEvent) {
    if (this.closing) return;
    if (e.pointerType === 'mouse' && this.o.onArm) {
      const arm = this.o.onArm;
      this.o.onArm = undefined;
      arm();
    }
    this.swallow = false;
    this.drag = { x: e.global.x, y: e.global.y, t: performance.now(), start: this.car.offset, on: false, carousel: this.full && this.inCarousel(e.global.x, e.global.y) };
  }

  private pointerMove(e: FederatedPointerEvent) {
    const d = this.drag;
    if (!d || this.closing) {
      if (this.full && this.P.car && !this.closing) {
        // desktop hover over the cards holds the auto-advance
        if (this.inCarousel(e.global.x, e.global.y)) this.pausedUntil = Math.max(this.pausedUntil, this.t + 1.2);
      }
      return;
    }
    if (!d.carousel) return;
    const dx = e.global.x - d.x;
    const dy = e.global.y - d.y;
    if (!d.on && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      d.on = true;
      this.carTween?.kill();
    }
    if (d.on) {
      this.car.offset = d.start - dx / this.dragPitch();
      this.placeCards();
    }
  }

  private pointerUp(e: FederatedPointerEvent) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.on || this.closing) return;
    const dx = e.global.x - d.x;
    const v = dx / Math.max(16, performance.now() - d.t);
    const pitch = this.dragPitch();
    let target = Math.round(d.start);
    if (dx < -pitch * 0.16 || v < -0.45) target += 1;
    else if (dx > pitch * 0.16 || v > 0.45) target -= 1;
    this.swallow = true;
    this.pausedUntil = this.t + 8;
    this.slideTo(target);
  }

  private fire() {
    if (this.closing) return;
    this.resolveTap?.();
  }

  /** A tap on one of the splash's own controls: a user gesture, so audio may unlock here. */
  private uiTap(id: string | null) {
    const arm = this.o.onArm;
    if (arm) {
      this.o.onArm = undefined;
      arm();
    }
    if (id) this.o.sfx?.(id);
  }

  waitTap(): Promise<void> {
    return new Promise((res) => (this.resolveTap = res));
  }

  /* -------------------------------------- motion ---------------------------------------- */

  private tw<T>(make: () => T): T {
    let out!: T;
    this.anim.add(() => {
      out = make();
    });
    return out;
  }

  /** Characters react to what the featured card just did (rate-limited, never in low quality). */
  private react(kind: 'blast' | 'loot' | 'boost' | 'wheel' | 'card') {
    const cast = this.o.cast;
    if (!cast || this.closing || quality.low || this.t < this.reactAt) return;
    this.reactAt = this.t + 2.6;
    if (kind === 'blast') {
      cast.captain.react('cheer', 0.9);
      cast.parrot.react('squawk', 0.7);
    } else if (kind === 'loot') {
      cast.captain.react('cheer', 1);
      cast.parrot.react('happy', 0.9);
    } else if (kind === 'boost') cast.captain.react('cheer', 0.7);
    else if (kind === 'wheel') cast.parrot.react('happy', 0.6);
    else cast.parrot.react('squawk', 0.45);
  }

  /** Cap'n Kaboom winds up and throws a bomb onto a demo board (C's throwBomb), flown by the splash. */
  private throwInto(target: { x: number; y: number }, cell: number): Promise<boolean> | null {
    const cast = this.o.cast;
    if (!cast || this.closing || this.throwing || quality.low || speed.reduced || this.t < this.reactAt) return null;
    if (typeof cast.captain.throwBomb !== 'function') return null;
    return this.throwFlight(target, cell);
  }

  private async throwFlight(target: { x: number; y: number }, cell: number): Promise<boolean> {
    const cast = this.o.cast!;
    const cap = cast.captain;
    this.throwing = true;
    this.reactAt = this.t + 3;
    const look = cap as unknown as Glance;
    look.lookAt?.(target.x, target.y);
    let r: { x: number; y: number; vx?: number; vy?: number; size?: number };
    try {
      r = await cap.throwBomb();
    } catch {
      this.throwing = false;
      return false;
    }
    if (this.destroyed || this.closing) {
      this.throwing = false;
      return false;
    }
    const f = this.flyer;
    const size = cell * 1.06;
    const s0 = r.size && r.size > 4 ? r.size : size * 0.8;
    // a ballistic arc that leaves the hand the way it was moving
    const T = 0.5;
    const cx = r.x + clamp((r.vx ?? 0) * T * 0.35, -this.P.W * 0.3, this.P.W * 0.3);
    const cy = Math.min(r.y, target.y) - Math.abs(target.x - r.x) * 0.35 + clamp((r.vy ?? 0) * T * 0.2, -this.P.H * 0.2, 0);
    const q = { t: 0 };
    f.visible = true;
    f.alpha = 1;
    f.position.set(r.x, r.y);
    setSize(f, s0);
    let last = 0;
    await new Promise<void>((done) => {
      this.tw(() =>
        gsap.to(q, {
          t: 1,
          duration: T,
          ease: 'none',
          onUpdate: () => {
            const k = q.t;
            const u = 1 - k;
            f.x = u * u * r.x + 2 * u * k * cx + k * k * target.x;
            f.y = u * u * r.y + 2 * u * k * cy + k * k * target.y;
            f.rotation = k * Math.PI * 3;
            setSize(f, s0 + (size - s0) * k);
            if (k - last > 0.07) {
              last = k;
              this.demoFx.trail(f.x, f.y, 0.22);
            }
          },
          onComplete: () => done(),
        }),
      );
    });
    f.visible = false;
    this.throwing = false;
    look.lookAt?.(null);
    if (this.destroyed || this.closing) return false;
    this.demoFx.sparks(target.x, target.y, 8, 0.8);
    cast.parrot.react('squawk', 0.5);
    return true;
  }

  /** Both rigs glance at a point for a moment (C's lookAt, when the rigs have it). */
  private glance(x: number, y: number, hold = 1.4) {
    const cast = this.o.cast;
    if (!cast || this.closing || quality.low || this.throwing) return;
    const rigs = [cast.captain, cast.parrot] as unknown as Glance[];
    for (const r of rigs) r.lookAt?.(x, y);
    this.glanceOff?.kill();
    this.glanceOff = this.tw(() =>
      gsap.delayedCall(hold, () => {
        if (!this.throwing) for (const r of rigs) r.lookAt?.(null);
      }),
    );
  }
  private glanceOff?: gsap.core.Tween;

  /** Initial state for the entrance: everything off stage, then intro() plays it. */
  private prepareIntro() {
    for (const c of [this.logoHolder, this.capWrap, this.parWrap, this.play, this.toggle, ...this.badges, ...this.dots, ...this.arrows]) c.alpha = 0;
    for (const c of this.cards) c.swing.alpha = 0;
  }

  /** Play the entrance (call as the loading screen goes). */
  intro() {
    if (!this.o.intro || this.closing) return;
    const P = this.P;
    const reduced = speed.reduced;
    if (!this.full) {
      this.popPlay(0.1);
      this.tw(() => gsap.to(this.toggle, { alpha: 1, duration: 0.3, delay: 0.35 }));
      this.tw(() => gsap.delayedCall(0.5, () => this.idle()));
      return;
    }
    const lh = this.logoHolder;
    const L = P.logo!;
    const y0 = lh.y;
    if (reduced) {
      this.tw(() => gsap.to(lh, { alpha: 1, duration: 0.4 }));
    } else {
      // drop, squash on landing, bounce back, settle; dust at the landing line. It falls from above
      // the screen but only shows once all of it is on screen (never a lockup cut by the top edge),
      // arriving at speed for the last stretch.
      const top0 = L.y;
      const fade = Math.max(6, top0 * 0.6);
      const gate = () => {
        const top = lh.y - y0 + top0;
        lh.alpha = clamp((top - 1) / fade, 0, 1);
      };
      this.tw(() =>
        gsap
          .timeline()
          .set(lh, { alpha: 0, y: y0 - L.w * 0.5 })
          .to(lh, { y: y0, duration: 0.4, ease: 'power2.in', onUpdate: gate })
          .set(lh, { alpha: 1 })
          .call(() => {
            // landing dust kicks out from behind the lockup (the particles draw under all lettering)
            for (const k of [-0.42, -0.2, 0.2, 0.42]) this.fx.dust(lh.x + L.w * k, y0 - L.w * 0.02, true);
            this.tw(() => gsap.fromTo(this.glow, { alpha: 0.5 }, { alpha: 0.16, duration: 0.7, ease: 'power2.out' }));
          })
          .to(lh.scale, { x: 1.14, y: 0.8, duration: 0.07, ease: 'power2.out' })
          .to(lh.scale, { x: 0.95, y: 1.07, duration: 0.14, ease: 'power2.inOut' })
          .to(lh.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, .4)' })
          .fromTo(lh, { rotation: -0.035 }, { rotation: 0, duration: 0.9, ease: 'elastic.out(1, .3)' }, '<-0.4'),
      );
      this.tw(() => gsap.delayedCall(0.95, () => this.runSweep()));
    }
    // the crew pops up at their posts
    const cast = this.o.cast;
    [this.capWrap, this.parWrap].forEach((w, i) => {
      const hgt = i === 0 ? this.o.L.captain.h : this.o.L.parrot.h;
      const yEnd = w.y;
      if (reduced) {
        this.tw(() => gsap.to(w, { alpha: 1, duration: 0.4, delay: 0.3 }));
        return;
      }
      this.tw(() =>
        gsap
          .timeline({ delay: 0.5 + i * 0.14 })
          .set(w, { alpha: 1, y: yEnd + hgt * 1.15 })
          .to(w, { y: yEnd, duration: 0.42, ease: 'back.out(1.5)' })
          .fromTo(w.scale, { x: 0.9, y: 1.12 }, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, .45)' }, '-=0.12')
          .call(() => {
            if (!cast) return;
            if (i === 0) cast.captain.react('cheer', 1);
            else cast.parrot.react('squawk', 0.8);
          }),
      );
    });
    // the cards swing down on their nails, left to right
    const vis = this.cards.filter((c) => c.view.visible).sort((a, b) => a.view.x - b.view.x);
    vis.forEach((c, i) => {
      const d = 0.62 + i * 0.1;
      if (reduced) {
        this.tw(() => gsap.to(c.swing, { alpha: 1, duration: 0.35, delay: d }));
        return;
      }
      this.tw(() =>
        gsap
          .timeline({ delay: d })
          .set(c.swing, { alpha: 0, y: -P.ch * 0.35, rotation: (i % 2 ? 1 : -1) * 0.12 })
          .to(c.swing, { alpha: 1, duration: 0.18 }, 0)
          .to(c.swing, { y: 0, duration: 0.45, ease: 'back.out(1.6)' }, 0)
          .to(c.swing, { rotation: 0, duration: 1.1, ease: 'elastic.out(1, .35)' }, 0),
      );
    });
    for (const c of this.cards) if (!c.view.visible) c.swing.alpha = 1;
    this.tw(() => gsap.to([...this.dots, ...this.arrows], { alpha: 1, duration: 0.35, delay: 1.0, stagger: 0.04 }));
    this.badges.forEach((b, i) => {
      const x = b.x;
      void x;
      const k = b.scale.x;
      this.tw(() => gsap.to(b, { alpha: 1, duration: 0.2, delay: 0.9 + i * 0.1 }));
      this.tw(() => gsap.fromTo(b.scale, { x: k * 0.6, y: k * 0.6 }, { x: k, y: k, duration: 0.45, delay: 0.9 + i * 0.1, ease: 'back.out(1.7)' }));
    });
    this.popPlay(1.05);
    this.tw(() => gsap.to(this.toggle, { alpha: 1, duration: 0.35, delay: 1.35 }));
    this.tw(() => gsap.delayedCall(1.6, () => this.idle()));
  }

  private popPlay(delay: number) {
    const p = this.play;
    this.tw(() =>
      gsap
        .timeline({ delay })
        .set(p, { alpha: 1 })
        .fromTo(p.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.55, ease: 'back.out(2.2)' })
        .call(
          () => {
            this.fx.sparks(p.x, p.y - this.P.play.h * 0.3, 10, 0.9);
          },
          [],
          0.12,
        ),
    );
  }

  private runSweep() {
    const s = this.sweep;
    const L = this.P.logo;
    if (!s || !L || this.closing || s.destroyed) return;
    s.visible = true;
    this.tw(() =>
      gsap.fromTo(
        s,
        { x: -L.w * 0.25, y: L.w * 0.3 },
        {
          x: L.w * 1.25,
          duration: 0.85,
          ease: 'power2.inOut',
          onComplete: () => {
            if (!s.destroyed) s.visible = false;
          },
        },
      ),
    );
    this.sweepAt = this.t + 6.5;
  }

  /** Settled loops: logo bob, PLAY pulse, halo breath (skipped in low quality / reduced motion). */
  private idle() {
    if (this.closing) return;
    for (const c of [this.logoHolder, this.capWrap, this.parWrap, this.play, this.toggle, this.backdrop, ...this.badges, ...this.dots, ...this.arrows]) c.alpha = 1;
    for (const c of this.cards) c.swing.alpha = 1;
    this.applyQuality();
  }

  private loops: gsap.core.Animation[] = [];

  private applyQuality() {
    for (const l of this.loops) l.kill();
    this.loops = [];
    if (this.closing) return;
    const calm = quality.low || speed.reduced;
    if (!calm) {
      const lh = this.logoHolder;
      if (this.logo) this.loops.push(this.tw(() => gsap.to(lh, { y: lh.y - this.P.U * 0.006, duration: 1.7, yoyo: true, repeat: -1, ease: 'sine.inOut' })));
      this.loops.push(this.tw(() => gsap.to(this.play.scale, { x: 1.045, y: 1.045, duration: 0.62, yoyo: true, repeat: -1, ease: 'sine.inOut' })));
      this.loops.push(this.tw(() => gsap.to(this.playHalo, { alpha: 0.6, duration: 0.62, yoyo: true, repeat: -1, ease: 'sine.inOut' })));
    }
    for (const c of this.cards) c.demo.run(c.view.visible && (!quality.low || c.demo.featured), c.view.visible);
  }

  /** Run the fuse spark round the PLAY plaque's rim. */
  private placeSpark() {
    const ph = this.P.play.h;
    const k = (ph * PLAY_ASPECT) / PLAY_W;
    const straight = RIM.x1 - RIM.x0;
    const arc = Math.PI * RIM.r;
    const per = straight * 2 + arc * 2;
    let d = ((this.sparkD % per) + per) % per;
    let x: number;
    let y: number;
    if (d < straight) {
      x = RIM.x0 + d;
      y = RIM.cy - RIM.r;
    } else if ((d -= straight) < arc) {
      const a = -Math.PI / 2 + d / RIM.r;
      x = RIM.x1 + Math.cos(a) * RIM.r;
      y = RIM.cy + Math.sin(a) * RIM.r;
    } else if ((d -= arc) < straight) {
      x = RIM.x1 - d;
      y = RIM.cy + RIM.r;
    } else {
      d -= straight;
      const a = Math.PI / 2 + d / RIM.r;
      x = RIM.x0 + Math.cos(a) * RIM.r;
      y = RIM.cy + Math.sin(a) * RIM.r;
    }
    this.spark.position.set((x - PLAY_W / 2) * k, (y - PLAY_H / 2) * k);
  }

  update(dtMs: number) {
    if (this.destroyed) return;
    const dt = dtMs / 1000;
    this.t += dt;
    this.fx.update(dtMs);
    this.demoFx.update(dtMs);
    this.syncCardText();
    if (this.closing) return;
    // fuse spark round the plaque
    const calm = quality.low || speed.reduced;
    if (!calm) {
      this.sparkD += dt * 260;
      this.placeSpark();
      this.spark.rotation += dt * 6;
      const s = 1 + Math.sin(this.t * 31) * 0.12;
      setSize(this.spark, this.P.play.h * 0.46 * s);
      if (Math.random() < dtMs / 70) {
        const g = this.spark.getGlobalPosition();
        this.fx.embers(g.x, g.y, 1);
      }
    }
    if (!this.full) return;
    // logo glow flicker, periodic sweep
    if (!calm) this.glow.alpha = 0.15 + Math.sin(this.t * 2.3) * 0.03 + Math.sin(this.t * 7.1) * 0.015;
    if (this.sweep && this.sweepAt && this.t > this.sweepAt) this.runSweep();
    // auto-advance (off for reduced motion, held while dragging or hovering)
    if (!speed.reduced && !this.drag?.on && this.t > this.pausedUntil && this.cards.length > this.P.n) {
      this.autoT -= dt;
      if (this.autoT <= 0) this.slideTo(Math.round(this.car.offset) + 1);
    }
    for (const c of this.cards) {
      c.demo.run(c.view.visible && (!quality.low || c.demo.featured), c.view.visible);
      c.demo.update(dtMs);
    }
  }

  /* -------------------------------------- handoff --------------------------------------- */

  /**
   * Hand over to the game: PLAY pops, the cards fall away, the logo flies to `logo` (the game's
   * own lockup rect; `onLogoHome` fires as it lands so the real one can take over) and the shade
   * lifts off the live scene. Resolves when the splash is clear; the caller releases the cast and
   * destroys it.
   */
  close(o: { logo?: Rect; onLogoHome?: () => void } = {}): Promise<void> {
    this.closing = true;
    this.eventMode = 'none';
    this.carTween?.kill();
    this.anim.kill();
    this.anim = gsap.context(() => {});
    for (const c of this.cards) c.demo.freeze();
    const P = this.P;
    const reduced = speed.reduced;
    const dur = reduced ? 0.35 : 0.75;
    // PLAY: pressed, pops, bursts
    const p = this.play;
    this.tw(() =>
      gsap
        .timeline()
        .to(this.playFace, { y: P.play.h * 0.075, duration: 0.05 })
        .to(this.playFace, { y: 0, duration: 0.12, ease: 'back.out(3)' })
        .to(p.scale, { x: 1.16, y: 1.16, duration: 0.12, ease: 'back.out(3)' }, 0.04)
        .to(p.scale, { x: 0.5, y: 0.5, duration: 0.3, ease: 'back.in(1.6)' }, 0.2)
        .to(p, { alpha: 0, duration: 0.22 }, 0.26),
    );
    this.spark.visible = false;
    this.flyer.visible = false;
    for (const r of this.o.cast ? ([this.o.cast.captain, this.o.cast.parrot] as unknown as Glance[]) : []) r.lookAt?.(null);
    if (!reduced) {
      this.fx.burst(p.x, p.y, 16, 'fire', 1.1);
      this.fx.sparks(p.x, p.y, 12, 1.1);
    }
    // cards fall away
    this.cards.forEach((c, i) => {
      if (!c.view.visible) return;
      if (reduced) this.tw(() => gsap.to(c.swing, { alpha: 0, duration: 0.25 }));
      else {
        // they tip off their nails and fade where they hang (never out through a screen edge)
        this.tw(() => gsap.to(c.swing, { y: -P.ch * 0.03, rotation: (i % 2 ? 1 : -1) * 0.05, alpha: 0, duration: 0.3, delay: 0.02 + i * 0.03, ease: 'power2.in' }));
        this.tw(() => gsap.to(c.swing.scale, { x: 0.94, y: 0.94, duration: 0.32, delay: 0.03 + i * 0.03, ease: 'power2.in' }));
      }
    });
    this.tw(() => gsap.to([...this.dots, ...this.arrows, ...this.badges, this.toggle], { alpha: 0, duration: 0.22, ease: 'power1.out' }));
    // logo home
    const lh = this.logoHolder;
    const L = P.logo;
    if (this.logo && L) {
      if (this.sweep) this.sweep.visible = false;
      if (o.logo && o.logo.w > 0) {
        const k = o.logo.w / L.w;
        const tx = o.logo.x + (L.w / 2) * k;
        const ty = o.logo.y + L.w * LOGO_FOOT * k;
        // it lands exactly on the game's own lockup, then the two cross-fade in place (the game's
        // is drawn for its size, without the tagline when small), so there is never a double image
        this.tw(() =>
          gsap
            .timeline({ delay: 0.06 })
            .to(lh, { x: tx, y: ty, rotation: 0, duration: LOGO_FLY, ease: 'power3.inOut' }, 0)
            .to(lh.scale, { x: k, y: k, duration: LOGO_FLY, ease: 'power3.inOut' }, 0)
            .call(() => o.onLogoHome?.(), [], LOGO_FLY)
            .to(lh, { alpha: 0, duration: LOGO_SWAP, ease: 'power1.inOut' }, LOGO_FLY),
        );
      } else this.tw(() => gsap.to(lh, { alpha: 0, y: lh.y - P.U * 0.1, duration: 0.4, ease: 'power2.in' }));
    }
    // the crew settles at their posts (in case the entrance was cut short)
    for (const w of [this.capWrap, this.parWrap]) this.tw(() => gsap.to(w, { x: w.pivot.x, y: w.pivot.y, alpha: 1, duration: 0.3, ease: 'power2.out' }));
    for (const w of [this.capWrap, this.parWrap]) this.tw(() => gsap.to(w.scale, { x: 1, y: 1, duration: 0.3 }));
    // the shade lifts
    this.tw(() => gsap.to(this.backdrop, { alpha: 0, duration: dur * 0.75, delay: 0.08, ease: 'power1.inOut' }));
    const end = this.logo && L && o.logo ? Math.max(dur, 0.06 + LOGO_FLY + LOGO_SWAP) : dur;
    return new Promise((res) => {
      this.tw(() => gsap.delayedCall(end + 0.05, res));
    });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.releaseCast();
    this.offQuality?.();
    this.carTween?.kill();
    this.anim.kill();
    for (const l of this.loops) l.kill();
    for (const c of this.cards) c.demo.destroy();
    const all: object[] = [];
    const walk = (c: Container) => {
      all.push(c, c.scale);
      for (const k of c.children) walk(k as Container);
    };
    walk(this);
    gsap.killTweensOf(all);
    // the particles are shared: leave them where a newer splash has already taken them
    if (this.fx?.parent === this.fxLayer) this.fx.removeFromParent();
    if (this.demoFx?.parent === this.demoFxLayer) this.demoFx.removeFromParent();
    if (this.sweep) this.sweep.mask = null;
    freeTexture(this.logoSil);
    this.logoSil = undefined;
    this.cards = [];
    super.destroy(options);
  }
}

/** A soft white band for the logo's light sweep (made once). */
let sweepTex: Texture | undefined;
function sweepTexture(): Texture {
  return (sweepTex ??= canvasTexture(128, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,244,214,.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.58, 'rgba(255,244,214,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 16);
  }));
}

/** Night vignette over the dimmed scene (made once, stretched to the screen). */
let vignetteTex: Texture | undefined;
function vignetteTexture(): Texture {
  return (vignetteTex ??= canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 118, 30, 128, 128, 182);
    g.addColorStop(0, 'rgba(2,5,14,0)');
    g.addColorStop(0.55, 'rgba(2,5,14,.25)');
    g.addColorStop(1, 'rgba(2,5,14,.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }));
}

/* ------------------------------------------------------------------------------------------
 * First-spin coach marks
 * ---------------------------------------------------------------------------------------- */

const COACH_KEY = 'powder-keg-cove.coach.v1';

/** True once the player has seen the first-spin coach marks (stored per game). */
export function coachSeen(): boolean {
  try {
    return localStorage.getItem(COACH_KEY) === '1';
  } catch {
    return false;
  }
}

/** Parchment callout: a rounded note, ink outline, cel shade. `aspect` = w / h. */
function noteSvg(aspect: number): string {
  const H = 100;
  const W = Math.max(120, Math.round(H * aspect));
  const id = nextId('nt');
  const body = roundRect(5, 4, W - 5, H - 11, 18);
  return svgDoc(
    W,
    H,
    celDefs(id, 0.5, 0.22, 0.5),
    `<g filter="url(#${id}drop)"><path d="${body}" fill="${C.paperWarm}" filter="url(#${id}cel)"/><path d="${roundRect(11, 10, W - 11, H - 17, 13)}" fill="none" stroke="${C.g2}" stroke-width="2" opacity=".6"/><path d="${body}" fill="none" stroke="${C.ink}" stroke-width="4.5"/></g>`,
  );
}

interface CoachTarget {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** Callout under the target (the fuse meter) or over it (the HUD's Powder Boost switch). */
  below: boolean;
  /** A canvas target gets a pulsing ring; a DOM one (drawn over the canvas) only the pointer. */
  ring: boolean;
}

/**
 * First-spin coach marks (canvas only): on a player's first visit, right after the intro,
 * parchment callouts point at the powder fuse and at the Powder Boost switch. They go at the first
 * spin, a tap, a resize or after a few seconds, and are marked seen once they have shown.
 */
export class CoachMarks extends Container {
  private anim = gsap.context(() => {});
  private notes: { box: Container; ring?: Graphics; tip: Graphics; below: boolean }[] = [];
  private gone = false;

  constructor(
    private L: Layout,
    private targets: CoachTarget[],
  ) {
    super();
    this.eventMode = 'none';
  }

  /** What to point at: the fuse meter, and the Powder Boost switch when it is on screen. */
  static targets(L: Layout, canvas: HTMLCanvasElement, boost: boolean): CoachTarget[] {
    const out: CoachTarget[] = [{ ...L.meter, text: t('coachFuse'), below: true, ring: true }];
    const el = boost ? document.querySelector<HTMLElement>('.boost-btn') : null;
    // (offsetParent is null for fixed-position HUD parts, so test the boxes instead)
    if (el && !el.hidden && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') {
      const r = el.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      // the HUD is DOM over the canvas: point at its top edge, where the canvas still shows
      const hud = el.closest<HTMLElement>('.hud')?.getBoundingClientRect();
      const top = hud && hud.height > 0 ? Math.min(r.top, hud.top) : r.top;
      if (r.width > 4 && r.height > 4) out.push({ x: r.left - c.left, y: top - c.top, w: r.width, h: Math.max(4, r.bottom - top), text: t('coachBoost', { cost: num(BOOST_COST) }), below: false, ring: false });
    }
    return out;
  }

  get active() {
    return !this.gone && !this.destroyed;
  }

  /** How many notes pop up (main.ts cues one coachPop per note, 0.15 s + 0.35 s apart). */
  get count() {
    return this.targets.length;
  }

  async build(res: number) {
    const { W, H } = this.L;
    const U = Math.min(W, H);
    const m = clamp(U * 0.025, 8, 20);
    const fs = clamp(U * 0.024, 13, 17);
    for (const tg of this.targets) {
      const maxW = Math.min(W - m * 2, 380);
      const text = new Text({
        text: tg.text,
        style: new TextStyle({ fontFamily: FONT_UI, fontWeight: '600', fontSize: fs, fill: C.ink, align: 'center', wordWrap: true, breakWords: cjkScript, wordWrapWidth: maxW - fs * 2.4, lineHeight: fs * 1.3, padding: 4 }),
        resolution: res,
      });
      text.anchor.set(0.5);
      const bw = Math.min(maxW, text.width + fs * 2.4);
      const bh = text.height + fs * 1.6;
      const note = new Sprite(await svgTexture(`coach-note-${Math.round((bw / bh) * 10)}`, noteSvg(bw / bh), bw * res));
      if (this.destroyed) return;
      note.anchor.set(0.5, 0.47);
      note.width = bw;
      note.height = bh;
      const arrow = fs * 0.9;
      const tx = tg.x + tg.w / 2;
      const cx = clamp(tx, m + bw / 2, W - m - bw / 2);
      const gap = fs * 0.35;
      const cy = tg.below ? tg.y + tg.h + gap + arrow + bh / 2 : tg.y - gap - arrow - bh / 2;
      const box = new Container();
      box.position.set(cx, clamp(cy, m + bh / 2, H - m - bh / 2));
      text.position.set(0, -bh * 0.02);
      // the pointer: an inked paper wedge from the note's edge toward the target
      const tip = new Graphics();
      const ex = clamp(tx - box.x, -bw / 2 + arrow * 1.5, bw / 2 - arrow * 1.5);
      const edge = tg.below ? -bh / 2 + 3 : bh / 2 - bh * 0.1;
      const point = tg.below ? tg.y + tg.h + gap * 0.5 - box.y : tg.y - gap * 0.5 - box.y;
      tip.poly([ex - arrow * 0.75, edge, ex + arrow * 0.75, edge, tx - box.x, point]).fill({ color: hex(C.paperWarm) }).stroke({ width: Math.max(2, fs * 0.2), color: hex(C.ink), join: 'round' });
      box.addChild(tip, note, text);
      let ring: Graphics | undefined;
      if (tg.ring) {
        const pad = fs * 0.35;
        ring = new Graphics().roundRect(tg.x - pad, tg.y - pad, tg.w + pad * 2, tg.h + pad * 2, Math.min(tg.h, 24)).stroke({ width: Math.max(2.5, fs * 0.22), color: hex(C.fireHot) });
        ring.pivot.set(tg.x + tg.w / 2, tg.y + tg.h / 2);
        ring.position.copyFrom(ring.pivot);
        ring.alpha = 0;
        this.addChild(ring);
      }
      box.alpha = 0;
      this.addChild(box);
      this.notes.push({ box, ring, tip, below: tg.below });
    }
  }

  show() {
    const calm = quality.low || speed.reduced;
    this.notes.forEach((n, i) => {
      const d = 0.15 + i * 0.35;
      this.anim.add(() => {
        gsap.to(n.box, { alpha: 1, duration: 0.25, delay: d });
        if (!calm) gsap.fromTo(n.box.scale, { x: 0.6, y: 0.6 }, { x: 1, y: 1, duration: 0.45, delay: d, ease: 'back.out(2.4)' });
        if (n.ring) {
          gsap.to(n.ring, { alpha: 1, duration: 0.3, delay: d });
          if (!calm) gsap.to(n.ring.scale, { x: 1.06, y: 1.18, duration: 0.6, delay: d, yoyo: true, repeat: -1, ease: 'sine.inOut' });
        }
        // the pointer nudges toward its target
        if (!calm) gsap.to(n.tip, { y: n.below ? -4 : 4, duration: 0.5, delay: d + 0.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      });
    });
  }

  /** Fade out, mark seen, then destroy. */
  dismiss() {
    if (this.gone || this.destroyed) return;
    this.gone = true;
    try {
      localStorage.setItem(COACH_KEY, '1');
    } catch {
      /* storage unavailable */
    }
    this.anim.kill();
    this.anim = gsap.context(() => {});
    this.anim.add(() => {
      gsap.to(this, { alpha: 0, duration: 0.25, ease: 'power1.in', onComplete: () => this.destroy({ children: true }) });
    });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.anim.kill();
    gsap.killTweensOf(this);
    super.destroy(options);
  }
}
