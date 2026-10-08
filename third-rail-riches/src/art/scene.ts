/**
 * Powder Keg Cove environment: the deck of a pirate ship moored in a moonlit cove at night.
 *
 * Every piece is original SVG authored in code and rasterised at display size by the renderer
 * (render/scene/Background.ts places and animates it, render/grid/Reels.ts builds the cargo-hatch
 * reel frame). Two light sources, as in the art bible: cool moonlight (rim light from the upper
 * right) and warm lantern light (added as glow sprites). Scenery is kept darker, cooler and
 * softer-edged than the symbols and characters so they always read first; only the foreground
 * ship parts get the full ink + cel treatment.
 */
import { C, composeSymbol, nextId, f } from './kit';

/* ------------------------------------------------------------------ helpers */

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Blend two palette tokens (t = 0 gives a, 1 gives b). Derived tones stay on-palette. */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Deterministic PRNG (mulberry32) so scenery placement is identical on every relayout. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const svg = (w: number, h: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/** Brush ink, weighted on the lower right like the kit: a second pass nudged down-right. */
function ink(lines: string, lw: number, color: string = C.ink): string {
  return `<g fill="none" stroke="${color}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(${f(lw * 0.12)} ${f(lw * 0.16)})">${lines}</g>${lines}</g>`;
}

/**
 * The kit's cel filter for non-square pieces: shade hugging the lower-right rim, a soft cool
 * (moonlit) highlight on the upper-left. `k` scales the offsets relative to a 256 symbol.
 */
function cel(id: string, k: number, shade = 0.3, light = 0.35, lightColor: string = C.moonGlow): string {
  return `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="${f(-15 * k)}" dy="${f(-17 * k)}" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="${f(1.4 * k)}" result="rimb"/>
    <feFlood flood-color="${C.ink}" flood-opacity="${shade}"/>
    <feComposite in2="rimb" operator="in" result="shade"/>
    <feOffset in="SourceAlpha" dx="${f(7 * k)}" dy="${f(9 * k)}" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="rim2"/>
    <feGaussianBlur in="rim2" stdDeviation="${f(3 * k)}" result="rim2b"/>
    <feFlood flood-color="${lightColor}" flood-opacity="${light}"/>
    <feComposite in2="rim2b" operator="in" result="hl"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="hl"/></feMerge>
  </filter>`;
}

const lin = (id: string, stops: [number, string, number?][], x2 = 0, y2 = 1, extra = '') =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}" ${extra}>${stops
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`)
    .join('')}</linearGradient>`;

/** Four-point twinkle star path centred on (x, y). */
function sparkPath(x: number, y: number, r: number): string {
  const k = r * 0.16;
  return `M${f(x)} ${f(y - r)} C${f(x + k)} ${f(y - k)} ${f(x + k)} ${f(y - k)} ${f(x + r)} ${f(y)} C${f(x + k)} ${f(y + k)} ${f(x + k)} ${f(y + k)} ${f(x)} ${f(y + r)} C${f(x - k)} ${f(y + k)} ${f(x - k)} ${f(y + k)} ${f(x - r)} ${f(y)} C${f(x - k)} ${f(y - k)} ${f(x - k)} ${f(y - k)} ${f(x)} ${f(y - r)} Z`;
}

/** Puffy edge through `pts`: each pair joined by an outward bump of `bulge` x segment length. */
function bumps(pts: [number, number][], bulge = 0.4): string {
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;
    d += ` Q${f((x0 + x1) / 2 + nx * len * bulge)} ${f((y0 + y1) / 2 + ny * len * bulge)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ---------------------------------------------------------------------- sky */

export interface SkySpec {
  /** Texture size in CSS px (the renderer passes W and the horizon plus a little). */
  w: number;
  h: number;
  horizon: number;
  moon: { x: number; y: number; r: number };
  /** Areas that must stay calm (logo, win bar, meter, reel frame): no stars there. */
  calm: Box[];
  /** Detail scale, S / 100. */
  u: number;
  clouds?: { x: number; y: number; w: number }[];
  seed?: number;
}

/**
 * The night sky for one layout: skyTop to night to a teal-blue horizon, a cool wash around the
 * moon, a star field (dots and a few four-point twinkles) that thins toward the horizon and the
 * moon, and low cloud banks lit on top by the moon.
 */
export function skyBackdrop(s: SkySpec): string {
  const id = nextId('sky');
  const R = rng(s.seed ?? 11);
  const u = Math.min(1.7, Math.max(0.55, s.u));
  const pad = 8 * u;
  const calm = (x: number, y: number) => s.calm.some((b) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);
  let dots = '';
  let twinkles = '';
  const n = Math.round((s.w * s.horizon) / (2100 * u * u));
  for (let i = 0; i < n; i++) {
    const x = R() * s.w;
    const y = Math.pow(R(), 1.3) * s.horizon * 0.95;
    const r0 = R();
    const r1 = R();
    const r2 = R();
    if (calm(x, y)) continue;
    const dm = Math.hypot(x - s.moon.x, y - s.moon.y) / s.moon.r;
    if (dm < 1.6) continue;
    const fade = Math.min(1, (dm - 1.6) / 3.2) * (1 - Math.pow(y / s.horizon, 2.4) * 0.9);
    const a = (0.22 + r0 * 0.78) * fade;
    if (a < 0.07) continue;
    const col = r1 < 0.16 ? C.goldLight : r1 < 0.55 ? C.moonGlow : C.moon;
    if (r2 < 0.94) dots += `<circle cx="${f(x)}" cy="${f(y)}" r="${f((0.5 + r0 * r0 * 1.15) * u)}" fill="${col}" opacity="${a.toFixed(2)}"/>`;
    else twinkles += `<path d="${sparkPath(x, y, (2.4 + r0 * 3) * u)}" fill="${col}" opacity="${Math.min(1, a * 1.2).toFixed(2)}"/>`;
  }
  const clouds = (s.clouds ?? [])
    .map((c, i) => cloudBank(`${id}c${i}`, c.x, c.y, c.w, s.seed ? s.seed + i * 7 : 30 + i * 7))
    .join('');
  const defs = `
    ${lin(`${id}g`, [[0, C.skyTop], [0.46, C.night], [0.84, mix(C.night, C.skyLow, 0.55)], [1, C.skyLow]], 0, s.horizon, 'gradientUnits="userSpaceOnUse"')}
    <radialGradient id="${id}m" cx="${f(s.moon.x)}" cy="${f(s.moon.y)}" r="${f(s.moon.r * 7.5)}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${C.moonGlow}" stop-opacity=".30"/><stop offset=".3" stop-color="${C.moonGlow}" stop-opacity=".11"/><stop offset="1" stop-color="${C.moonGlow}" stop-opacity="0"/>
    </radialGradient>
    ${lin(`${id}h`, [[0, C.seaLight, 0], [0.7, C.seaLight, 0.05], [1, mix(C.skyLow, C.seaFoam, 0.3), 0.28]], 0, 1)}`;
  const hz = s.horizon;
  return svg(
    s.w,
    s.h,
    `<rect width="${s.w}" height="${s.h}" fill="url(#${id}g)"/>
    <rect width="${s.w}" height="${s.h}" fill="url(#${id}m)"/>
    <rect y="${f(hz * 0.62)}" width="${s.w}" height="${f(hz * 0.38 + 1)}" fill="url(#${id}h)"/>
    <g>${dots}</g><g>${twinkles}</g>
    ${clouds}`,
    defs,
  );
}

/** Low cloud bank: scalloped moonlit top, flat dark underside. Used inside the sky backdrop. */
function cloudBank(id: string, x: number, y: number, w: number, seed: number): string {
  const R = rng(seed);
  const h = w * 0.16;
  const n = 7;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lift = Math.sin(Math.PI * t) * (0.55 + R() * 0.45);
    pts.push([x + t * w, y - h * (0.18 + lift * 0.82)]);
  }
  pts[0][1] = y;
  pts[n][1] = y - h * 0.08;
  const top = `M${f(x)} ${f(y)}${bumps(pts, 0.34)}`;
  const d = `${top} Q${f(x + w * 0.5)} ${f(y + h * 0.16)} ${f(x)} ${f(y)} Z`;
  return `${lin(id, [[0, mix(C.skyLow, C.moonGlow, 0.32)], [0.4, mix(C.navy, C.skyLow, 0.45)], [1, mix(C.night, C.navy, 0.35)]])}
    <path d="${d}" fill="url(#${id})" opacity=".82"/>
    <path d="${top}" fill="none" stroke="${C.moonGlow}" stroke-width="${f(Math.max(1.2, w * 0.006))}" stroke-linecap="round" opacity=".42"/>`;
}

/** A tileable 240 x 240 star-field (kept for tools that still ask for the old wallpaper tile). */
export function starTile(): string {
  const R = rng(5);
  let body = '';
  for (let i = 0; i < 26; i++) {
    const x = R() * 240;
    const y = R() * 240;
    const a = 0.3 + R() * 0.7;
    body += R() < 0.85 ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.8 + R() * 1.6)}" fill="${C.moon}" opacity="${a.toFixed(2)}"/>` : `<path d="${sparkPath(x, y, 4 + R() * 4)}" fill="${C.moonGlow}" opacity="${a.toFixed(2)}"/>`;
  }
  return svg(240, 240, `<rect width="240" height="240" fill="${C.night}"/>${body}`);
}

/* --------------------------------------------------------------------- moon */

/**
 * Full moon, 256 viewBox (disc r = 112 at the centre). `ghost` is the Moonlight Raid moon:
 * ghost-white-green, same shapes so the renderer can crossfade the two.
 */
export function moonDisc(ghost = false): string {
  const id = nextId('mn');
  const p = ghost
    ? { hi: C.white, body: C.greenGlow, edge: mix(C.greenGlow, C.green, 0.55), maria: mix(C.greenGlow, C.greenMid, 0.5), crater: mix(C.greenGlow, C.greenMid, 0.3), rim: C.green, limb: C.greenMid }
    : { hi: C.white, body: C.moon, edge: mix(C.moon, C.moonGlow, 0.55), maria: mix(mix(C.moon, C.g2, 0.42), C.moonGlow, 0.25), crater: mix(C.moon, C.g2, 0.36), rim: mix(C.moonGlow, C.skyLow, 0.35), limb: mix(C.moonGlow, C.sea, 0.3) };
  const craters: [number, number, number][] = [
    [94, 88, 17],
    [158, 72, 10],
    [152, 150, 23],
    [88, 166, 12],
    [124, 204, 9],
    [196, 132, 8],
    [66, 124, 7],
    [184, 186, 6],
  ];
  const crater = ([x, y, r]: [number, number, number]) => `<g>
    <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f(r * 0.86)}" fill="${p.crater}"/>
    <path d="M${f(x - r * 0.86)} ${f(y - r * 0.1)} A${r} ${f(r * 0.86)} 0 0 1 ${f(x + r * 0.5)} ${f(y - r * 0.72)}" fill="none" stroke="${mix(p.crater, C.g3, 0.35)}" stroke-width="${f(Math.max(1.6, r * 0.2))}" stroke-linecap="round" opacity=".7"/>
    <path d="M${f(x + r * 0.9)} ${f(y + r * 0.05)} A${r} ${f(r * 0.86)} 0 0 1 ${f(x - r * 0.4)} ${f(y + r * 0.8)}" fill="none" stroke="${p.hi}" stroke-width="${f(Math.max(1.4, r * 0.16))}" stroke-linecap="round" opacity=".75"/>
  </g>`;
  return svg(
    256,
    256,
    `<circle cx="128" cy="128" r="112" fill="url(#${id}b)"/>
    <path d="M70 96 C84 70 122 62 138 80 C150 94 132 112 112 110 C96 118 92 136 76 132 C60 126 62 108 70 96 Z" fill="${p.maria}" opacity=".5"/>
    <path d="M142 176 C160 160 196 168 198 188 C200 206 176 214 160 206 C146 200 132 190 142 176 Z" fill="${p.maria}" opacity=".42"/>
    <path d="M168 104 C180 98 200 104 202 116 C196 124 178 124 168 104 Z" fill="${p.maria}" opacity=".38"/>
    ${craters.map(crater).join('')}
    <circle cx="128" cy="128" r="112" fill="url(#${id}l)"/>
    <circle cx="128" cy="128" r="110.5" fill="none" stroke="${p.rim}" stroke-width="3.5" opacity=".7"/>`,
    `<radialGradient id="${id}b" cx="40%" cy="36%" r="72%"><stop offset="0" stop-color="${p.hi}"/><stop offset=".5" stop-color="${p.body}"/><stop offset="1" stop-color="${p.edge}"/></radialGradient>
     <radialGradient id="${id}l" cx="36%" cy="32%" r="78%"><stop offset=".62" stop-color="${p.limb}" stop-opacity="0"/><stop offset="1" stop-color="${p.limb}" stop-opacity=".42"/></radialGradient>`,
  );
}

/** A thin wisp of cloud that drifts across the moon. 512 x 140, moonlit top edge. */
export function cloudWisp(): string {
  const id = nextId('cw');
  const pts: [number, number][] = [
    [18, 104],
    [58, 80],
    [104, 70],
    [150, 76],
    [196, 52],
    [250, 46],
    [300, 62],
    [350, 56],
    [398, 72],
    [446, 76],
    [494, 102],
  ];
  const top = `M18 104${bumps(pts, 0.32)}`;
  const d = `${top} C470 118 420 112 380 116 C300 124 220 112 150 118 C100 122 50 118 18 104 Z`;
  return svg(
    512,
    140,
    `<path d="${d}" fill="url(#${id})" opacity=".88"/>
    <path d="${top}" fill="none" stroke="${C.moonGlow}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    <path d="M120 100 C170 96 220 104 270 98 M300 104 C340 100 380 106 420 100" fill="none" stroke="${C.moonGlow}" stroke-width="2.4" stroke-linecap="round" opacity=".18"/>`,
    lin(id, [[0, mix(C.skyLow, C.moonGlow, 0.35)], [0.45, mix(C.navy, C.skyLow, 0.5)], [1, mix(C.night, C.navy, 0.4)]]),
  );
}

/** Four-point twinkle, 64 viewBox, white (tinted in the engine). Stars and treasure glints. */
export function sparkle(): string {
  const id = nextId('sp');
  return svg(
    64,
    64,
    `<circle cx="32" cy="32" r="20" fill="url(#${id})"/>
    <path d="${sparkPath(32, 32, 30)}" fill="${C.white}"/>
    <circle cx="32" cy="32" r="4.5" fill="${C.white}"/>`,
    `<radialGradient id="${id}"><stop offset="0" stop-color="${C.white}" stop-opacity=".55"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient>`,
  );
}

/* -------------------------------------------------------------- the far cove */

function palm(x: number, y: number, h: number, lean: number, fill: string, rim: string): string {
  const cx = x + lean * h;
  const cy = y - h;
  const bx = x + lean * h * 0.05;
  const by = y - h * 0.55;
  const w0 = h * 0.07;
  const w1 = h * 0.035;
  let rings = '';
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * bx + t * t * cx;
    const py = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * by + t * t * cy;
    const ww = w0 + (w1 - w0) * t;
    rings += `M${f(px - ww)} ${f(py)} Q${f(px)} ${f(py + ww * 0.5)} ${f(px + ww)} ${f(py - ww * 0.2)} `;
  }
  const trunk = `M${f(x - w0)} ${f(y)} Q${f(bx - w0 * 0.9)} ${f(by)} ${f(cx - w1)} ${f(cy)} L${f(cx + w1)} ${f(cy)} Q${f(bx + w0 * 0.9)} ${f(by)} ${f(x + w0)} ${f(y)} Z`;
  const fronds = [
    [-172, 0.95, 0.5],
    [-146, 0.8, 0.34],
    [-112, 0.62, 0.2],
    [-70, 0.64, 0.22],
    [-36, 0.82, 0.36],
    [-6, 0.95, 0.5],
    [26, 0.62, 0.52],
    [156, 0.6, 0.55],
  ]
    .map(([a, l, dr]) => frond(cx, cy, a + lean * 30, h * 0.52 * l, h * 0.52 * l * dr, h * 0.1))
    .join(' ');
  return `<g fill="${fill}">
    <path d="${trunk}"/>
    <path d="${fronds}"/>
    <circle cx="${f(cx)}" cy="${f(cy + h * 0.02)}" r="${f(h * 0.06)}"/>
  </g>
  <path d="${rings}" fill="none" stroke="${rim}" stroke-width="${f(h * 0.012)}" opacity=".35"/>`;
}

function frond(cx: number, cy: number, angDeg: number, len: number, droop: number, w: number): string {
  const a = (angDeg * Math.PI) / 180;
  const tx = cx + Math.cos(a) * len;
  const ty = cy + Math.sin(a) * len + droop;
  const qx = cx + Math.cos(a) * len * 0.55;
  const qy = cy + Math.sin(a) * len * 0.55 - len * 0.22;
  const N = 10;
  const pts: [number, number, number, number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const px = (1 - t) * (1 - t) * cx + 2 * (1 - t) * t * qx + t * t * tx;
    const py = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * qy + t * t * ty;
    const dx = 2 * (1 - t) * (qx - cx) + 2 * t * (tx - qx);
    const dy = 2 * (1 - t) * (qy - cy) + 2 * t * (ty - qy);
    const l = Math.hypot(dx, dy) || 1;
    pts.push([px, py, -dy / l, dx / l, t]);
  }
  const wAt = (t: number) => w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7);
  let d = `M${f(cx)} ${f(cy)}`;
  for (const [px, py, nx, ny, t] of pts) d += ` L${f(px + nx * wAt(t) * 0.35)} ${f(py + ny * wAt(t) * 0.35)}`;
  for (let i = pts.length - 1; i >= 0; i--) {
    const [px, py, nx, ny, t] = pts[i];
    const ww = wAt(t) * (i % 2 ? 1.25 : 0.55);
    d += ` L${f(px - nx * ww)} ${f(py - ny * ww)}`;
  }
  return `${d} Z`;
}

/** Lighthouse foot on the right headland, in its 800 x 360 viewBox. */
export const HEADLAND_LIGHT = { x: 590, y: 172 };

/**
 * Cove headlands, 800 x 360 viewBox, sea level at the bottom edge. 'right' is anchored to the
 * right screen edge (a cliff with a plateau for the lighthouse, a sea cave and a sea stack),
 * 'left' to the left edge (a rounded rocky hill with palms). Each has a pale far range behind a
 * darker near rock lit by a cool moonlit rim; distant, so only a thin night-blue ink.
 */
export function headland(side: 'left' | 'right'): string {
  const id = nextId('hd');
  const far = mix(C.skyLow, C.night, 0.5);
  const farRim = C.moonGlow;
  const nearTop = mix(C.night, C.skyLow, 0.2);
  const nearBot = mix(C.nightDeep, C.night, 0.45);
  const line = mix(C.nightDeep, C.night, 0.25);
  const rim = C.moonGlow;
  const palmFill = mix(C.nightDeep, C.night, 0.25);
  const foam = (x0: number, x1: number) => {
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1; x += 24) pts.push([x, 353 + ((x / 24) % 2 ? 2 : -1)]);
    return `<path d="M${pts[0][0]} ${pts[0][1]}${bumps(pts, 0.3)}" fill="none" stroke="${C.seaFoam}" stroke-width="3.4" stroke-linecap="round" opacity=".3"/>`;
  };
  const tufts = (pts: [number, number][]) =>
    pts.map(([x, y]) => `M${x - 8} ${y + 2} l3 -9 l3 7 l3 -11 l3 10 l3 -7 l3 10`).join(' ');
  if (side === 'right') {
    const farD =
      'M0 360 C30 350 60 332 100 322 C150 310 180 286 220 262 C250 244 272 226 302 224 C338 222 356 244 390 248 C428 252 452 212 490 188 C520 170 544 148 584 144 C630 140 662 168 702 166 C742 164 772 150 800 146 L800 360 Z';
    const farRidge = 'M0 360 C30 350 60 332 100 322 C150 310 180 286 220 262 C250 244 272 226 302 224 C338 222 356 244 390 248 C428 252 452 212 490 188 C520 170 544 148 584 144';
    const nearD =
      'M388 360 C396 344 410 334 424 318 C434 306 436 286 440 262 C444 232 452 206 474 194 C492 184 512 180 534 176 C582 168 642 172 700 164 C742 158 780 156 800 156 L800 360 Z';
    const ridge = 'M424 318 C434 306 436 286 440 262 C444 232 452 206 474 194 C492 184 512 180 534 176 C582 168 642 172 700 164';
    const stack = 'M318 360 C314 334 320 304 334 292 C344 284 358 290 362 304 C368 322 366 344 370 360 Z';
    return svg(
      800,
      360,
      `<path d="${farD}" fill="url(#${id}f)"/>
      <path d="${farRidge}" fill="none" stroke="${farRim}" stroke-width="3" opacity=".24"/>
      ${palm(704, 164, 94, -0.22, palmFill, rim)}
      ${palm(756, 158, 74, -0.3, palmFill, rim)}
      <path d="${nearD}" fill="url(#${id}n)"/>
      <path d="M452 332 C452 312 464 298 478 298 C492 298 502 312 502 332 L502 360 L452 360 Z" fill="${C.nightDeep}" opacity=".85"/>
      <path d="M448 250 C470 244 500 250 530 244 C570 236 610 246 650 240 M446 290 C480 284 520 294 560 286 C620 276 680 290 740 280 C770 276 790 280 800 278 M520 326 C580 318 640 330 700 322 C740 318 780 322 800 320" fill="none" stroke="${line}" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>
      <path d="M458 214 L462 240 M486 196 L482 226 M520 186 L524 214 M470 262 L466 284" stroke="${line}" stroke-width="3" stroke-linecap="round" opacity=".65"/>
      <path d="${ridge}" fill="none" stroke="${rim}" stroke-width="4.2" stroke-linecap="round" opacity=".55"/>
      <path d="${nearD}" fill="none" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>
      <path d="${tufts([[548, 174], [616, 168], [668, 168], [734, 160]])}" fill="none" stroke="${line}" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="${stack}" fill="url(#${id}n)"/>
      <path d="M322 334 C320 314 326 298 336 292" fill="none" stroke="${rim}" stroke-width="3.4" stroke-linecap="round" opacity=".5"/>
      <path d="${stack}" fill="none" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M340 310 L344 330" stroke="${line}" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>
      ${foam(300, 800)}`,
      `${lin(`${id}n`, [[0, nearTop], [1, nearBot]])}${lin(`${id}f`, [[0, far], [1, mix(far, C.night, 0.35)]])}`,
    );
  }
  const farD =
    'M0 116 C40 118 76 132 114 146 C160 162 194 190 244 200 C294 210 334 236 384 246 C434 256 468 280 524 290 C584 300 624 322 684 334 C724 342 762 352 800 360 L0 360 Z';
  const farRidge = 'M0 116 C40 118 76 132 114 146 C160 162 194 190 244 200 C294 210 334 236 384 246 C434 256 468 280 524 290';
  const nearD =
    'M0 178 C30 168 60 168 88 178 C116 188 138 178 162 188 C192 202 206 236 234 250 C262 264 298 276 328 298 C352 316 382 330 420 340 C452 348 486 354 524 360 L0 360 Z';
  const ridge = 'M88 178 C116 188 138 178 162 188 C192 202 206 236 234 250 C262 264 298 276 328 298 C352 316 382 330 420 340';
  const rocks = 'M430 360 C432 346 444 338 458 340 C470 342 478 350 480 360 Z M488 360 C490 350 498 346 506 348 C514 350 518 356 518 360 Z';
  return svg(
    800,
    360,
    `<path d="${farD}" fill="url(#${id}f)"/>
    <path d="${farRidge}" fill="none" stroke="${farRim}" stroke-width="3" opacity=".22"/>
    ${palm(64, 172, 128, 0.26, palmFill, rim)}
    ${palm(128, 184, 98, 0.34, palmFill, rim)}
    ${palm(24, 170, 84, 0.1, palmFill, rim)}
    <path d="${nearD}" fill="url(#${id}n)"/>
    <path d="M0 246 C60 240 120 252 180 246 C220 242 250 252 290 262 M0 298 C80 292 160 304 240 298 C280 296 320 306 360 318" fill="none" stroke="${line}" stroke-width="2.6" stroke-linecap="round" opacity=".45"/>
    <path d="M180 212 L186 258 M214 240 L210 284 M120 212 L126 244" stroke="${line}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <path d="${ridge}" fill="none" stroke="${rim}" stroke-width="4.2" stroke-linecap="round" opacity=".5"/>
    <path d="${nearD}" fill="none" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="${tufts([[180, 198], [250, 256], [310, 286]])}" fill="none" stroke="${line}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${rocks}" fill="url(#${id}n)" stroke="${line}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M436 350 C440 342 448 340 456 341" fill="none" stroke="${rim}" stroke-width="2.6" stroke-linecap="round" opacity=".45"/>
    ${foam(0, 530)}`,
    `${lin(`${id}n`, [[0, nearTop], [1, nearBot]])}${lin(`${id}f`, [[0, far], [1, mix(far, C.night, 0.35)]])}`,
  );
}

/** Lamp centre of lighthouse(), as fractions of its 128 x 320 viewBox. */
export const LIGHTHOUSE_LAMP = { x: 64 / 128, y: 84 / 320 };

/** A stubby striped lighthouse on its rock, 128 x 320, foot at the bottom centre. */
export function lighthouse(): string {
  const id = nextId('lh');
  const tower = 'M35 302 C38 240 42 172 44 118 L84 118 C86 172 90 240 93 302 Z';
  const white = mix(C.paper, C.moonGlow, 0.28);
  const band = mix(C.crimson, C.night, 0.3);
  return svg(
    128,
    320,
    `<clipPath id="${id}c"><path d="${tower}"/></clipPath>
    <path d="${tower}" fill="${white}"/>
    <g clip-path="url(#${id}c)">
      <rect x="0" y="136" width="128" height="24" fill="${band}"/>
      <rect x="0" y="188" width="128" height="26" fill="${band}"/>
      <rect x="0" y="244" width="128" height="28" fill="${band}"/>
      <rect x="0" y="100" width="128" height="220" fill="url(#${id}s)"/>
    </g>
    <path d="M56 302 L56 284 C56 274 72 274 72 284 L72 302 Z" fill="${C.inkSoft}"/>
    <rect x="59" y="220" width="10" height="14" rx="2" fill="${C.fireHot}" opacity=".85"/>
    <path d="M47 62 L81 62 L81 108 L47 108 Z" fill="url(#${id}g)"/>
    <path d="M38 122 L90 122 L96 112 L32 112 Z" fill="${C.inkSoft}"/>
    <path d="M42 62 C42 38 86 38 86 62 Z" fill="${mix(C.crimsonDeep, C.night, 0.2)}"/>
    <circle cx="64" cy="34" r="5" fill="${C.goldDeep}"/>
    ${ink(
      `<path d="${tower}"/>
      <path d="M56 302 L56 284 C56 274 72 274 72 284 L72 302"/>
      <path d="M47 62 L47 108 M81 62 L81 108 M58 62 L58 108 M70 62 L70 108 M47 84 L81 84" stroke-width="2.4"/>
      <path d="M32 112 L96 112 L90 122 L38 122 Z"/>
      <path d="M36 112 L36 98 M48 112 L48 98 M64 112 L64 98 M80 112 L80 98 M92 112 L92 98 M33 98 L95 98" stroke-width="2.4"/>
      <path d="M42 62 C42 38 86 38 86 62 Z"/>
      <path d="M64 29 L64 16" stroke-width="2.4"/>
      <circle cx="64" cy="34" r="5" stroke-width="2.4"/>
      <path d="M10 320 C14 304 32 296 48 300 C62 292 84 294 96 300 C110 302 120 310 122 320"/>`,
      3.2,
    )}
    <path d="M10 320 C14 304 32 296 48 300 C62 292 84 294 96 300 C110 302 120 310 122 320 Z" fill="${mix(C.night, C.nightDeep, 0.3)}"/>
    <path d="M48 300 C62 292 84 294 96 300" fill="none" stroke="${C.moonGlow}" stroke-width="2.4" opacity=".4"/>
    <path d="M45 124 C43 170 40 240 37 300" fill="none" stroke="${C.moonGlow}" stroke-width="2.6" opacity=".35"/>`,
    `${lin(`${id}s`, [[0, C.night, 0], [0.55, C.night, 0.08], [1, C.nightDeep, 0.55]], 1, 0)}
     <radialGradient id="${id}g" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${C.fireCore}"/><stop offset=".6" stop-color="${C.goldLight}"/><stop offset="1" stop-color="${C.fireHot}"/></radialGradient>`,
  );
}

/** Lighthouse beam: a soft cone pointing right from its left-centre origin. 512 x 96, white. */
export function lighthouseBeam(): string {
  const id = nextId('lb');
  return svg(
    512,
    96,
    `<path d="M0 44 L512 2 L512 94 L0 52 Z" fill="url(#${id})" filter="url(#${id}b)"/>`,
    `${lin(id, [[0, C.white, 0.75], [0.35, C.white, 0.3], [1, C.white, 0]], 1, 0)}
     <filter id="${id}b" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>`,
  );
}

/** Distant galleon silhouette on the horizon, 256 x 150, waterline at y = 114, bow to the left. */
export function distantShip(): string {
  const id = nextId('ds');
  const fill = mix(C.nightDeep, C.night, 0.45);
  const hull =
    'M24 97 C40 111 82 116 130 116 L206 116 C222 114 232 104 237 92 L242 70 L212 70 L211 84 C198 88 184 90 168 90 L64 91 L60 84 L34 84 L34 92 C30 93 27 95 24 97 Z';
  // billowing square sail between a yard (y0) and its foot (y1)
  const sail = (x0: number, x1: number, y0: number, y1: number) =>
    `M${x0} ${y0} L${x1} ${y0} Q${x1 + 5} ${(y0 + y1) / 2} ${x1 - 2} ${y1} Q${(x0 + x1) / 2} ${y1 + 6} ${x0 + 2} ${y1} Q${x0 - 5} ${(y0 + y1) / 2} ${x0} ${y0} Z`;
  const sails = [
    sail(54, 90, 58, 84),
    sail(59, 85, 32, 52),
    sail(104, 152, 50, 84),
    sail(110, 146, 20, 44),
    sail(176, 198, 42, 60),
    'M188 36 L214 84 L188 84 Z',
    'M70 30 L8 76 L58 82 Z',
  ].join(' ');
  const yards = 'M50 58 H94 M55 32 H89 M100 50 H156 M106 20 H150 M172 42 H202';
  return svg(
    256,
    150,
    `<circle cx="224" cy="80" r="24" fill="url(#${id}g)"/>
    <g stroke="${fill}" stroke-linecap="round">
      <path d="M72 92 L72 22 M128 91 L128 8 M188 89 L188 30" stroke-width="3.6"/>
      <path d="M34 90 L4 72" stroke-width="3.4"/>
      <path d="${yards}" stroke-width="2.6"/>
      <path d="M72 24 L6 74 M128 10 L72 24 M188 32 L128 10 M188 32 L238 70" stroke-width="1.2" opacity=".8"/>
    </g>
    <g fill="${fill}">
      <path d="${hull}"/>
      <path d="${sails}"/>
      <path d="M72 22 L90 18 L72 14 Z M128 8 L150 3 L128 -2 Z M188 30 L204 27 L188 24 Z M240 70 L252 64 L240 60 Z"/>
    </g>
    <path d="M56 58 Q72 56 88 58 M61 32 Q72 30 83 32 M106 50 Q128 48 150 50 M112 20 Q128 18 144 20 M178 42 Q187 40 196 42" fill="none" stroke="${C.moonGlow}" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>
    <path d="M92 60 Q96 70 90 82 M154 52 Q158 66 150 82 M148 22 Q151 32 146 42" fill="none" stroke="${C.moonGlow}" stroke-width="1.8" stroke-linecap="round" opacity=".35"/>
    <path d="M30 104 Q70 114 120 115 L204 115" fill="none" stroke="${C.moonGlow}" stroke-width="1.6" opacity=".3"/>
    <g fill="${C.fireHot}"><rect x="216" y="76" width="6" height="6" rx="1"/><rect x="227" y="76" width="6" height="6" rx="1"/><rect x="150" y="99" width="5" height="4" rx="1" opacity=".75"/><rect x="104" y="100" width="5" height="4" rx="1" opacity=".6"/></g>`,
    `<radialGradient id="${id}g"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".42"/><stop offset="1" stop-color="${C.fireHot}" stop-opacity="0"/></radialGradient>`,
  );
}

/* ---------------------------------------------------------------------- sea */

/**
 * One row of stage-cutout waves (1930s cartoon sea), a horizontal tile 480 x 120 with three
 * crests. `tone` runs 0 (far, moonlit, pale) to 1 (near, deep and dark). Rows overlap in depth
 * order and slide at different speeds for parallax.
 */
export function seaRow(tone: number, variant = 0): string {
  const id = nextId('sr');
  const crest = mix(mix(C.skyLow, C.seaDeep, 0.35), mix(C.seaDeep, C.night, 0.55), tone);
  const body = mix(mix(C.seaDeep, C.night, 0.5), mix(C.night, C.nightDeep, 0.45), tone);
  const deep = mix(mix(C.night, C.nightDeep, 0.3), C.nightDeep, tone);
  const hi = 0.24 + tone * 0.14;
  const foamC = mix(C.seaFoam, C.moonGlow, 0.4);
  // three crests per tile, each its own height and lean (periodic, so the tile is seamless)
  const shape = (k: number) => {
    const m = ((k % 3) + 3) % 3;
    return { px: 78 + ((variant * 37 + m * 53) % 30), top: 7 + ((variant * 29 + m * 41) % 11) };
  };
  let d = 'M-160 42';
  let hl = '';
  let foam = '';
  let curl = '';
  for (let k = -1; k < 4; k++) {
    const x0 = k * 160;
    const { px: pk, top } = shape(k);
    d += ` C${x0 + pk * 0.45} 42 ${x0 + pk * 0.66} ${top + 2} ${x0 + pk} ${top} C${x0 + pk + 26} ${top - 1} ${x0 + 136} 34 ${x0 + 160} 42`;
    hl += `M${f(x0 + pk * 0.4)} 37 C${f(x0 + pk * 0.6)} ${top + 16} ${f(x0 + pk * 0.78)} ${top + 3} ${f(x0 + pk - 2)} ${top + 1} `;
    foam += `M${x0 + pk + 14} ${top + 22} l12 0 M${x0 + 30} ${56 + (k & 1) * 8} l18 0 M${x0 + 110} 66 l14 0 `;
    if (tone > 0.4) curl += `M${f(x0 + pk + 2)} ${top + 1} c7 -2 13 3 10 9 c-2 4 -8 3 -8 -1 `;
  }
  const top = d;
  d += ' L640 120 L-160 120 Z';
  return svg(
    480,
    120,
    `<path d="${d}" fill="url(#${id})"/>
    <path d="${foam}" stroke="${C.seaLight}" stroke-width="2.4" stroke-linecap="round" opacity="${(0.1 + tone * 0.06).toFixed(2)}"/>
    <path d="${top}" fill="none" stroke="${mix(C.nightDeep, C.night, 0.3)}" stroke-width="3" opacity=".8"/>
    <path d="${hl}" fill="none" stroke="${foamC}" stroke-width="3.4" stroke-linecap="round" opacity="${hi.toFixed(2)}"/>
    ${curl ? `<path d="${curl}" fill="none" stroke="${foamC}" stroke-width="2.6" stroke-linecap="round" opacity="${(hi * 0.9).toFixed(2)}"/>` : ''}`,
    lin(id, [[0.08, crest], [0.42, body], [1, deep]]),
  );
}

/** Moon glint on the water: a soft horizontal lozenge, 128 x 24, white (tinted in the engine). */
export function glint(): string {
  const id = nextId('gl');
  return svg(
    128,
    24,
    `<ellipse cx="64" cy="12" rx="62" ry="10" fill="url(#${id})"/>
    <path d="M22 12 L106 12" stroke="${C.white}" stroke-width="3" stroke-linecap="round" opacity=".9"/>`,
    `<radialGradient id="${id}"><stop offset="0" stop-color="${C.white}" stop-opacity=".9"/><stop offset=".6" stop-color="${C.white}" stop-opacity=".35"/><stop offset="1" stop-color="${C.white}" stop-opacity="0"/></radialGradient>`,
  );
}

/**
 * Drifting sea fog for the Moonlight Raid, horizontal tile 512 x 160, white (tinted): long soft
 * streaks with brighter curling tops, and gaps so the sea still shows through.
 */
export function fogTile(): string {
  const id = nextId('fg');
  const R = rng(21);
  let streaks = '';
  let curls = '';
  for (let i = 0; i < 14; i++) {
    const x = R() * 512;
    const y = 58 + R() * 72;
    const rx = 50 + R() * 110;
    const ry = 5 + R() * 10;
    const a = (0.3 + R() * 0.5).toFixed(2);
    const curl = R() < 0.45;
    for (const dx of [-512, 0, 512]) {
      streaks += `<ellipse cx="${f(x + dx)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" opacity="${a}"/>`;
      if (curl) curls += `<path d="M${f(x + dx - rx * 0.5)} ${f(y - ry * 0.2)} C${f(x + dx - rx * 0.2)} ${f(y - ry * 2.4)} ${f(x + dx + rx * 0.25)} ${f(y - ry * 2.2)} ${f(x + dx + rx * 0.45)} ${f(y - ry * 0.4)}" opacity="${(Number(a) * 0.7).toFixed(2)}"/>`;
    }
  }
  return svg(
    512,
    160,
    `<g fill="${C.white}" filter="url(#${id})">${streaks}<rect x="-40" y="116" width="592" height="14" opacity=".3"/></g>
    <g fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round" filter="url(#${id}s)">${curls}</g>`,
    `<filter id="${id}" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
     <filter id="${id}s" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.4"/></filter>`,
  );
}

/* --------------------------------------------------------------------- ship */

/**
 * Bulwark (the ship's rail wall) seen from the deck, a horizontal tile 240 units per bay x 240:
 * a heavy cap rail with a moonlit edge over four planks (seams, grain, nails, knots) and
 * stanchions with iron bolts. `bays` = 2 (480 x 240, the default contract): a belaying-pin rail
 * with a hank of rope and a shut gun port. `bays` = 4 (960 x 240, what the game tiles so repeats
 * are rare) adds a pair of cannon-tackle ring bolts and a patched plank.
 */
export function bulwarkTile(bays: 2 | 4 = 2): string {
  const id = nextId('bw');
  const TW = bays * 240;
  const wide = bays === 4;
  const planks = [36, 83, 130, 177, 224];
  const joints = [
    [150, 610],
    [400, 860],
    [70, 530],
    [300, 770],
  ].map((js) => js.filter((x) => x < TW));
  let body = '';
  let lines = '';
  const g = mix(C.woodDeep, C.woodDark, 0.35);
  for (let i = 0; i < 4; i++) {
    const y0 = planks[i];
    const y1 = planks[i + 1];
    body += `<rect x="-20" y="${y0}" width="${TW + 40}" height="${y1 - y0}" fill="url(#${id}p${i % 2})"/>`;
    body += `<path d="M-20 ${y0 + 2.5} H${TW + 20}" stroke="${mix(C.woodMid, C.woodLight, 0.3)}" stroke-width="1.6" opacity=".35"/>`;
    for (const jx of joints[i]) {
      lines += `<path d="M${jx} ${y0} V${y1}" stroke-width="2.6"/>`;
      body += `<g fill="${C.inkSoft}"><circle cx="${jx - 7}" cy="${y0 + 12}" r="2.6"/><circle cx="${jx - 7}" cy="${y1 - 12}" r="2.6"/><circle cx="${jx + 7}" cy="${y0 + 12}" r="2.6"/><circle cx="${jx + 7}" cy="${y1 - 12}" r="2.6"/></g>`;
    }
    for (let k = 0; k < 2; k++) {
      const gx = ((i * 97 + k * 431) % TW) - 60;
      const gy = y0 + 13 + k * 17 + (i % 2) * 3;
      body += `<path d="M${gx} ${gy} C${gx + 80} ${gy - 4} ${gx + 150} ${gy + 5} ${gx + 240} ${gy} C${gx + 300} ${gy - 3} ${gx + 360} ${gy + 3} ${gx + 420} ${gy}" fill="none" stroke="${g}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`;
    }
    if (i < 3) lines += `<path d="M-20 ${y1} H${TW + 20}" stroke-width="3"/>`;
  }
  const knot = (x: number, y: number, r: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f(r / 2)}" fill="${C.woodDeep}" opacity=".6"/><ellipse cx="${x}" cy="${y}" rx="${f(r * 1.6)}" ry="${f(r * 0.8)}" fill="none" stroke="${C.woodDeep}" stroke-width="1.6" opacity=".5"/>`;
  body += knot(206, 106, 10) + knot(96, 200, 8) + knot(410, 152, 9) + (wide ? knot(830, 60, 8) + knot(690, 204, 7) : '');
  // stanchions every 240 (0/960 wrap)
  const stanchion = (cx: number) => `
    <rect x="${cx + 13}" y="36" width="10" height="188" fill="${C.ink}" opacity=".22"/>
    <rect x="${cx - 14}" y="30" width="28" height="194" fill="url(#${id}st)"/>
    <g fill="${C.inkSoft}"><circle cx="${cx}" cy="66" r="4.4"/><circle cx="${cx}" cy="196" r="4.4"/></g>
    <g fill="${C.steel}" opacity=".6"><circle cx="${cx - 1.4}" cy="64.6" r="1.5"/><circle cx="${cx - 1.4}" cy="194.6" r="1.5"/></g>`;
  const stanchionInk = (cx: number) => `<path d="M${cx - 14} 30 V224 M${cx + 14} 30 V224"/>`;
  const posts = Array.from({ length: bays + 1 }, (_, i) => i * 240);
  // bay 1: belaying-pin rail with a hank of rope
  const pins = [62, 102, 142, 182];
  const rope = mix(C.g2, C.woodMid, 0.35);
  const hank = 'M102 80 C80 94 76 130 88 152 C94 164 110 164 116 152 C124 128 120 94 102 80 Z';
  const pinRail = `
    ${pins.map((x) => `<path d="M${x - 4} 74 L${x - 4} 52 C${x - 8} 48 ${x - 8} 40 ${x} 37 C${x + 8} 40 ${x + 8} 48 ${x + 4} 52 L${x + 4} 74 Z" fill="url(#${id}pin)"/>`).join('')}
    <rect x="40" y="62" width="164" height="13" rx="3" fill="url(#${id}rl)"/>
    <path d="${hank} M102 82 C88 102 90 134 99 148 M102 82 C116 102 116 130 107 148" fill="none" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
    <path d="${hank} M102 82 C88 102 90 134 99 148 M102 82 C116 102 116 130 107 148" fill="none" stroke="${rope}" stroke-width="5" stroke-linecap="round"/>
    <path d="M93 152 C92 162 90 170 89 180 M109 153 C110 162 112 168 112 176" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>
    <path d="M93 152 C92 162 90 170 89 180 M109 153 C110 162 112 168 112 176" fill="none" stroke="${rope}" stroke-width="4.2" stroke-linecap="round"/>
    <rect x="94" y="74" width="16" height="10" rx="3" fill="${rope}" stroke="${C.ink}" stroke-width="2.2"/>`;
  const pinInk = `${pins.map((x) => `<path d="M${x - 4} 62 L${x - 4} 52 C${x - 8} 48 ${x - 8} 40 ${x} 37 C${x + 8} 40 ${x + 8} 48 ${x + 4} 52 L${x + 4} 62"/>`).join('')}<rect x="40" y="62" width="164" height="13" rx="3"/>`;
  // bay 2: ring bolts for the gun tackle
  const ring = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y - 11}" r="5" fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="${C.ink}" stroke-width="7"/><circle cx="${x}" cy="${y}" r="11" fill="none" stroke="${C.g5}" stroke-width="3.6"/><path d="M${x - 7} ${y - 6} A9 9 0 0 1 ${x + 2} ${y - 10}" fill="none" stroke="${C.steel}" stroke-width="1.6" opacity=".55"/>`;
  const rings = wide ? ring(318, 168) + ring(402, 168) : '';
  // bay 3 (bay 2 in the narrow tile): gun port with its lid shut
  const px = wide ? 544 : 304;
  const port = `
    <rect x="${px}" y="72" width="112" height="104" rx="5" fill="${mix(C.woodDark, C.crimsonDeep, 0.4)}"/>
    <rect x="${px + 10}" y="82" width="92" height="84" rx="3" fill="url(#${id}lid)"/>
    <path d="M${px + 41} 82 V166 M${px + 71} 82 V166" stroke="${C.woodDeep}" stroke-width="2" opacity=".8"/>
    <rect x="${px + 12}" y="92" width="80" height="9" rx="2" fill="${C.inkSoft}"/><rect x="${px + 12}" y="146" width="80" height="9" rx="2" fill="${C.inkSoft}"/>
    <path d="M${px + 14} 94 H${px + 90} M${px + 14} 148 H${px + 90}" stroke="${C.steelDeep}" stroke-width="1.6"/>
    <circle cx="${px + 56}" cy="126" r="8" fill="none" stroke="${C.inkSoft}" stroke-width="4"/>
    <path d="M${px + 52} 121 A6 6 0 0 1 ${px + 62} 124" fill="none" stroke="${C.steel}" stroke-width="1.4" opacity=".6"/>`;
  const portInk = `<rect x="${px}" y="72" width="112" height="104" rx="5"/><rect x="${px + 10}" y="82" width="92" height="84" rx="3" stroke-width="2.6"/><rect x="${px + 12}" y="92" width="80" height="9" rx="2" stroke-width="2"/><rect x="${px + 12}" y="146" width="80" height="9" rx="2" stroke-width="2"/>`;
  // bay 4: a patched plank, nailed over a split
  const patch = !wide ? '' : `<rect x="782" y="112" width="88" height="40" rx="2" fill="url(#${id}pt)"/>
    <path d="M790 128 C810 126 830 130 860 127" fill="none" stroke="${g}" stroke-width="1.6" opacity=".7"/>
    <g fill="${C.inkSoft}"><circle cx="789" cy="119" r="2.4"/><circle cx="863" cy="119" r="2.4"/><circle cx="789" cy="145" r="2.4"/><circle cx="863" cy="145" r="2.4"/></g>
    <path d="M770 158 L778 166 L772 172" fill="none" stroke="${C.ink}" stroke-width="2" opacity=".6"/>`;
  const patchInk = wide ? `<rect x="782" y="112" width="88" height="40" rx="2" stroke-width="2.4"/>` : '';
  return svg(
    TW,
    240,
    `${body}
    ${ink(lines, 3)}
    ${posts.map(stanchion).join('')}
    ${pinRail}
    ${rings}
    ${port}
    ${patch}
    ${ink(`${posts.map(stanchionInk).join('')}${pinInk}${portInk}${patchInk}`, 3)}
    <rect x="-20" y="224" width="${TW + 40}" height="16" fill="${C.woodDeep}"/>
    <g fill="${C.ink}">${[120, 360, 600, 840].filter((x) => x < TW).map((x) => `<rect x="${x - 11}" y="229" width="22" height="7" rx="3"/>`).join('')}</g>
    <rect x="-20" y="30" width="${TW + 40}" height="12" fill="url(#${id}sh)"/>
    <rect x="-20" y="36" width="${TW + 40}" height="204" fill="url(#${id}n)"/>
    <rect x="-20" y="4" width="${TW + 40}" height="26" fill="url(#${id}r)"/>
    <path d="M318 4 L330 30${wide ? ' M798 4 L810 30' : ''}" stroke="${C.ink}" stroke-width="2.6"/>
    <g fill="${C.inkSoft}"><circle cx="310" cy="17" r="2.8"/><circle cx="340" cy="17" r="2.8"/>${wide ? '<circle cx="790" cy="17" r="2.8"/><circle cx="820" cy="17" r="2.8"/>' : ''}</g>
    <path d="M-20 7 H${TW + 20}" stroke="${C.moonGlow}" stroke-width="2.4" opacity=".5"/>
    ${ink(`<path d="M-20 4 H${TW + 20} M-20 30 H${TW + 20}"/><path d="M-20 224 H${TW + 20}" stroke-width="2.6"/>`, 3.4)}`,
    `${lin(`${id}p0`, [[0, mix(mix(C.woodDark, C.woodMid, 0.3), C.night, 0.14)], [1, mix(C.woodDeep, C.nightDeep, 0.22)]])}
     ${lin(`${id}p1`, [[0, mix(mix(C.woodDark, C.woodMid, 0.16), C.night, 0.16)], [1, mix(C.woodDeep, C.nightDeep, 0.32)]])}
     ${lin(`${id}pt`, [[0, mix(C.woodMid, C.woodDark, 0.2)], [1, mix(C.woodDark, C.woodDeep, 0.2)]])}
     ${lin(`${id}st`, [[0, mix(C.woodMid, C.woodLight, 0.2)], [0.4, mix(C.woodMid, C.woodDark, 0.35)], [1, C.woodDeep]], 1, 0)}
     ${lin(`${id}r`, [[0, mix(C.woodMid, C.woodLight, 0.45)], [0.35, C.woodMid], [1, mix(C.woodDark, C.woodMid, 0.3)]])}
     ${lin(`${id}rl`, [[0, mix(C.woodMid, C.woodLight, 0.3)], [1, C.woodDark]])}
     ${lin(`${id}pin`, [[0, mix(C.wood, C.woodLight, 0.35)], [0.6, C.woodMid], [1, C.woodDark]], 1, 0)}
     ${lin(`${id}lid`, [[0, mix(C.woodMid, C.woodDark, 0.3)], [1, mix(C.woodDark, C.woodDeep, 0.4)]])}
     ${lin(`${id}sh`, [[0, C.ink, 0.55], [1, C.ink, 0]])}
     ${lin(`${id}n`, [[0, C.nightDeep, 0.06], [0.5, C.nightDeep, 0.22], [1, C.nightDeep, 0.58]])}`,
  );
}

/**
 * Deck planks running across the screen, horizontal tile 480 x 120. Eight rows that widen toward
 * the viewer for a touch of perspective; dark caulked seams, staggered butt joints with
 * treenails, faint grain, and a shadow along the foot of the bulwark.
 */
export function deckTile(): string {
  const id = nextId('dk');
  const rows = [6, 13, 21, 30, 40, 51, 63, 76, 90, 105, 120];
  let body = '';
  let lines = '';
  for (let i = 0; i < rows.length - 1; i++) {
    const y0 = rows[i];
    const y1 = rows[i + 1];
    const h = y1 - y0;
    body += `<rect x="-20" y="${y0}" width="520" height="${h}" fill="url(#${id}p${i % 3})"/>`;
    body += `<path d="M-20 ${f(y0 + Math.max(1, h * 0.12))} H500" stroke="${mix(C.woodMid, C.woodLight, 0.35)}" stroke-width="${f(Math.max(0.8, h * 0.08))}" opacity=".32"/>`;
    for (const jx of [(i * 173 + 60) % 480, (i * 173 + 300) % 480]) {
      lines += `<path d="M${jx} ${y0} V${y1}" stroke-width="${f(1.2 + h * 0.07)}"/>`;
      const r = f(Math.max(1, h * 0.09));
      body += `<g fill="${mix(C.woodDeep, C.woodDark, 0.4)}"><circle cx="${f(jx - 3 - h * 0.25)}" cy="${f(y0 + h * 0.5)}" r="${r}"/><circle cx="${f(jx + 3 + h * 0.25)}" cy="${f(y0 + h * 0.5)}" r="${r}"/></g>`;
    }
    const gx = (i * 71) % 480;
    body += `<path d="M${gx - 40} ${f(y0 + h * 0.45)} C${gx + 60} ${f(y0 + h * 0.3)} ${gx + 140} ${f(y0 + h * 0.6)} ${gx + 240} ${f(y0 + h * 0.42)}" fill="none" stroke="${C.woodDeep}" stroke-width="${f(0.6 + h * 0.06)}" opacity=".45"/>`;
    lines += `<path d="M-20 ${y1} H500" stroke-width="${f(1.1 + h * 0.07)}"/>`;
  }
  return svg(
    480,
    120,
    `<rect x="-20" y="0" width="520" height="8" fill="${C.woodDeep}"/>
    ${body}
    ${ink(lines, 2)}
    <rect x="-20" y="0" width="520" height="26" fill="url(#${id}s)"/>
    <rect x="-20" y="0" width="520" height="120" fill="url(#${id}n)"/>
    ${ink('<path d="M-20 6 H500"/>', 2.6)}`,
    `${lin(`${id}p0`, [[0, mix(C.woodMid, C.woodDark, 0.25)], [1, mix(C.woodDark, C.woodMid, 0.2)]])}
     ${lin(`${id}p1`, [[0, mix(C.woodMid, C.woodDark, 0.4)], [1, mix(C.woodDark, C.woodDeep, 0.2)]])}
     ${lin(`${id}p2`, [[0, mix(C.woodMid, C.woodDark, 0.32)], [1, mix(C.woodDark, C.woodMid, 0.1)]])}
     ${lin(`${id}s`, [[0, C.ink, 0.6], [1, C.ink, 0]])}
     ${lin(`${id}n`, [[0, C.nightDeep, 0.1], [1, C.nightDeep, 0.55]])}`,
  );
}

/** Mast section, vertical tile 128 x 640: a round spar with grain and one iron hoop. */
export function mastTile(): string {
  const id = nextId('ms');
  return svg(
    128,
    640,
    `<rect x="22" y="-4" width="84" height="648" fill="url(#${id})"/>
    <path d="M40 -4 C43 140 37 330 41 644 M58 -4 C55 200 61 420 57 644 M84 -4 C87 170 81 380 85 644" fill="none" stroke="${C.woodDeep}" stroke-width="1.8" opacity=".55"/>
    <path d="M70 120 l0 30 M48 380 l0 24 M90 470 l0 18" stroke="${C.woodDeep}" stroke-width="3" stroke-linecap="round" opacity=".5"/>
    <path d="M98 -4 V644" stroke="${C.moonGlow}" stroke-width="2.4" opacity=".35"/>
    <path d="M30 -4 V644" stroke="${mix(C.woodMid, C.woodLight, 0.4)}" stroke-width="2" opacity=".25"/>
    <rect x="17" y="582" width="94" height="26" rx="3" fill="url(#${id}h)"/>
    <path d="M20 587 H108" stroke="${C.steel}" stroke-width="1.8" opacity=".5"/>
    <g fill="${C.steelDeep}"><circle cx="32" cy="598" r="2.8"/><circle cx="64" cy="598" r="2.8"/><circle cx="96" cy="598" r="2.8"/></g>
    <rect x="22" y="608" width="84" height="10" fill="${C.ink}" opacity=".3"/>
    ${ink('<path d="M22 -4 V582 M22 608 V644 M106 -4 V582 M106 608 V644"/><rect x="17" y="582" width="94" height="26" rx="3"/>', 4)}`,
    `${lin(id, [[0, C.woodDeep], [0.14, C.woodDark], [0.45, C.woodMid], [0.72, mix(C.woodMid, C.wood, 0.55)], [0.9, C.woodMid], [1, C.woodDark]], 1, 0)}
     ${lin(`${id}h`, [[0, C.steelDeep], [1, C.inkSoft]])}`,
  );
}

/** Mast foot: iron-banded collar where the mast meets the deck, 256 x 128, mast 84 wide. */
export function mastFoot(): string {
  const id = nextId('mf');
  return composeSymbol({
    size: 256,
    noDrop: true,
    lw: 6,
    shade: 0.32,
    light: 0.22,
    defs: `${lin(`${id}a`, [[0, mix(C.woodMid, C.woodLight, 0.3)], [0.5, C.woodMid], [1, C.woodDeep]], 1, 0)}${lin(`${id}b`, [[0, C.steelDeep], [1, C.inkSoft]])}`,
    layers: [
      {
        fills: `<path d="M86 150 L170 150 L196 214 C196 226 60 226 60 214 Z" fill="url(#${id}a)"/>
          <path d="M76 176 L180 176 L184 188 L72 188 Z" fill="url(#${id}b)"/>`,
        lines: `<path d="M86 150 L170 150 L196 214 C196 226 60 226 60 214 Z"/><path d="M76 176 L180 176 L184 188 L72 188 Z" stroke-width="4"/>`,
      },
    ],
    top: `<g fill="${C.steel}" opacity=".6"><circle cx="96" cy="182" r="2.6"/><circle cx="128" cy="182" r="2.6"/><circle cx="160" cy="182" r="2.6"/></g>`,
  });
}

/** Thin flag staff, vertical tile 32 x 128. */
export function poleTile(): string {
  const id = nextId('pl');
  return svg(
    32,
    128,
    `<rect x="8" y="-4" width="16" height="136" fill="url(#${id})"/>${ink('<path d="M8 -4 V132 M24 -4 V132"/>', 3)}`,
    lin(id, [[0, C.woodDark], [0.55, mix(C.woodMid, C.wood, 0.5)], [1, C.woodDark]], 1, 0),
  );
}

/** Gilded ball cap for the top of the flag staff, 64 viewBox, staff joins at the bottom. */
export function poleCap(): string {
  return composeSymbol({
    size: 64,
    lw: 3.5,
    noDrop: true,
    light: 0.55,
    layers: [
      {
        fills: `<rect x="24" y="40" width="16" height="22" rx="3" fill="${C.goldDeep}"/><circle cx="32" cy="26" r="16" fill="${C.gold}"/>`,
        lines: `<rect x="24" y="40" width="16" height="22" rx="3"/><circle cx="32" cy="26" r="16"/>`,
      },
    ],
    top: `<circle cx="26" cy="20" r="4" fill="${C.goldLight}"/>`,
  });
}

/**
 * Wrought-iron lantern bracket, 160 x 110: wall plate on the left, arm to the right with a
 * scroll brace. The lantern hangs from the hook tip at (136, 46).
 */
export function lanternBracket(): string {
  const id = nextId('lb');
  const iron = C.inkSoft;
  return svg(
    160,
    110,
    `<g filter="url(#${id}c)">
      <rect x="4" y="10" width="18" height="92" rx="4" fill="${iron}"/>
      <path d="M20 28 H140" stroke="${iron}" stroke-width="10" stroke-linecap="round"/>
      <path d="M22 90 C60 88 96 60 108 32" fill="none" stroke="${iron}" stroke-width="7" stroke-linecap="round"/>
      <path d="M22 90 C34 90 40 80 34 74 C28 68 20 76 26 80" fill="none" stroke="${iron}" stroke-width="6" stroke-linecap="round"/>
      <path d="M136 30 L136 40 C136 48 144 48 144 42" fill="none" stroke="${iron}" stroke-width="5" stroke-linecap="round"/>
    </g>
    ${ink('<rect x="4" y="10" width="18" height="92" rx="4"/><path d="M22 22.5 H140 C146 22.5 146 33.5 140 33.5 H22"/>', 2.4)}
    <path d="M26 24 H138" stroke="${C.steel}" stroke-width="1.6" opacity=".45"/>
    <g fill="${C.steelDeep}"><circle cx="13" cy="22" r="3"/><circle cx="13" cy="90" r="3"/></g>`,
    cel(`${id}c`, 0.35, 0.3, 0.3, C.steel),
  );
}

/** Where the flame sits inside lantern(): wick point and flame width, as fractions of 128 x 224. */
export const LANTERN_WICK = { x: 64 / 128, y: 160 / 224, flameW: 74 / 128 };

/**
 * Hurricane-style ship lantern, 128 x 224, hanging ring at the top (64, 12). Two layers so the
 * engine can put the animated flame between them: 'back' is the lit glass globe in white (tinted
 * to the flame colour), 'front' is the iron cap and guard wires, brass collar and base, and the
 * reflections on the glass.
 */
export function lantern(part: 'back' | 'front'): string {
  const id = nextId('ln');
  const globe = 'M40 68 C24 88 24 146 40 166 L88 166 C104 146 104 88 88 68 Z';
  if (part === 'back') {
    return svg(
      128,
      224,
      `<path d="${globe}" fill="url(#${id})"/>`,
      `<radialGradient id="${id}" cx="50%" cy="66%" r="60%"><stop offset="0" stop-color="${C.white}"/><stop offset=".5" stop-color="${C.white}" stop-opacity=".8"/><stop offset="1" stop-color="${C.white}" stop-opacity=".42"/></radialGradient>`,
    );
  }
  const cap = 'M34 62 C34 42 48 32 64 32 C80 32 94 42 94 62 Z';
  const base = 'M30 166 L98 166 L106 180 L92 194 L36 194 L22 180 Z';
  const guards = 'M47 68 C33 92 33 142 47 166 M81 68 C95 92 95 142 81 166';
  return svg(
    128,
    224,
    `<path d="${globe}" fill="none" stroke="${C.white}" stroke-width="2.2" opacity=".35"/>
    <path d="M35 90 C31 108 31 128 35 146" stroke="${C.white}" stroke-width="4.5" stroke-linecap="round" fill="none" opacity=".42"/>
    <path d="M93 98 C95 108 95 118 93 126" stroke="${C.white}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".25"/>
    <g filter="url(#${id}c)">
      <path d="M54 34 L54 22 L74 22 L74 34 Z" fill="${C.inkSoft}"/>
      <path d="${cap}" fill="url(#${id}i)"/>
      <rect x="28" y="58" width="72" height="11" rx="4" fill="url(#${id}b)"/>
      <path d="${base}" fill="url(#${id}b)"/>
      <circle cx="64" cy="201" r="6" fill="${C.goldDeep}"/>
    </g>
    <path d="${guards}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/>
    <path d="${guards}" fill="none" stroke="${C.g5}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="64" cy="12" r="8.5" fill="none" stroke="${C.inkSoft}" stroke-width="5"/>
    <g fill="${C.ink}"><ellipse cx="52" cy="47" rx="3" ry="2.2"/><ellipse cx="64" cy="44" rx="3" ry="2.2"/><ellipse cx="76" cy="47" rx="3" ry="2.2"/></g>
    <path d="M46 40 C52 35 58 34 64 34" stroke="${C.steel}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".5"/>
    <path d="M32 61 H96" stroke="${C.goldLight}" stroke-width="2" opacity=".75"/>
    <path d="M30 169 H98" stroke="${C.goldLight}" stroke-width="2" opacity=".6"/>
    ${ink(
      `<path d="M54 34 L54 22 L74 22 L74 34"/><path d="${cap}"/><rect x="28" y="58" width="72" height="11" rx="4"/><path d="${base}"/><circle cx="64" cy="201" r="6"/>
      <circle cx="64" cy="12" r="11.5" stroke-width="2"/>`,
      3.6,
    )}`,
    `${cel(`${id}c`, 0.45, 0.35, 0.35, C.white)}
     ${lin(`${id}i`, [[0, C.g5], [1, C.inkSoft]], 1, 1)}
     ${lin(`${id}b`, [[0, C.goldLight], [0.35, C.gold], [1, C.goldDeep]])}`,
  );
}

/**
 * A big square sail hanging into the top-left corner, 512 x 512, in moon shadow: its roped foot
 * sweeps from the top edge down to the left edge in a quarter ellipse. It gives the logo a calm,
 * dark backdrop and frames the corner. Faint cloth seams, a reef band with ties, moonlit rim.
 */
export function sailCorner(): string {
  const id = nextId('sl');
  const foot = 'M512 -4 C512 272 283 500 -4 500';
  const d = `M-4 -4 L512 -4 C512 272 283 500 -4 500 Z`;
  const footY = (x: number) => 500 * Math.sqrt(Math.max(0, 1 - Math.pow(x / 512, 2)));
  const seams = [58, 132, 206, 280, 354, 428]
    .map((x) => {
      const y = footY(x + 8);
      return `M${x} -4 C${f(x + 5)} ${f(y * 0.35)} ${f(x + 9)} ${f(y * 0.7)} ${x + 8} ${f(y)}`;
    })
    .join(' ');
  let ties = '';
  for (let th = 0.16; th < 1.5; th += 0.13) {
    const x = 462 * Math.cos(th);
    const y = 452 * Math.sin(th);
    ties += `M${f(x - 3)} ${f(y - 3)} l-2 15 M${f(x + 3)} ${f(y - 3)} l2 14 `;
  }
  const wrinkles = 'M420 250 C404 290 380 318 352 340 M330 300 C318 340 296 372 270 392 M220 380 C206 412 184 432 160 448 M462 150 C454 184 444 210 428 232';
  // a pirate's sail is patched: squares of darker cloth with running stitches
  const patch = (x: number, y: number, w: number, h: number, r: number) =>
    `<g transform="rotate(${r} ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${mix(C.paperWarm, C.nightDeep, 0.84)}"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="2" fill="none" stroke="${mix(C.g2, C.night, 0.45)}" stroke-width="2.2" stroke-dasharray="6 6"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="${C.nightDeep}" stroke-width="2.4"/></g>`;
  const patches = patch(292, 8, 54, 44, 4) + patch(46, 372, 62, 50, -5) + patch(262, 404, 40, 34, 7);
  return svg(
    512,
    512,
    `<path d="${d}" fill="url(#${id}f)"/>
    <g clip-path="url(#${id}k)">
      <path d="${seams}" fill="none" stroke="${C.nightDeep}" stroke-width="3" opacity=".55"/>
      <path d="${seams}" fill="none" stroke="${C.moonGlow}" stroke-width="1.4" opacity=".08" transform="translate(4 0)"/>
      <path d="M466 -4 C466 248 258 454 -4 454" fill="none" stroke="${C.nightDeep}" stroke-width="12" opacity=".28"/>
      <path d="${wrinkles}" fill="none" stroke="${C.nightDeep}" stroke-width="5" stroke-linecap="round" opacity=".35"/>
      <path d="${wrinkles}" fill="none" stroke="${C.moonGlow}" stroke-width="2" stroke-linecap="round" opacity=".12" transform="translate(5 2)"/>
      ${patches}
    </g>
    <path d="${ties}" stroke="${mix(C.g3, C.night, 0.4)}" stroke-width="3" stroke-linecap="round"/>
    <path d="${foot}" fill="none" stroke="${C.ink}" stroke-width="17" stroke-linecap="round"/>
    <path d="${foot}" fill="none" stroke="${mix(C.g2, C.night, 0.55)}" stroke-width="9" stroke-linecap="round"/>
    <path d="${foot}" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-dasharray="3 9" opacity=".55"/>
    <path d="M500 60 C496 290 282 488 -4 490" fill="none" stroke="${C.moonGlow}" stroke-width="3" opacity=".32"/>`,
    `<radialGradient id="${id}f" cx="100%" cy="100%" r="120%" fx="92%" fy="92%">
      <stop offset="0" stop-color="${mix(mix(C.paperWarm, C.g3, 0.25), C.night, 0.64)}"/><stop offset=".42" stop-color="${mix(mix(C.paperWarm, C.g3, 0.3), C.night, 0.77)}"/><stop offset="1" stop-color="${mix(C.paperWarm, C.nightDeep, 0.88)}"/>
    </radialGradient>
    <clipPath id="${id}k"><path d="${d}"/></clipPath>`,
  );
}

/**
 * The Jolly Roger, 320 x 210, hoist on the left. Black cloth with baked folds, tattered fly,
 * bone-white skull and crossbones, brass grommets. Used as a waving mesh texture.
 */
export function jollyRoger(): string {
  const id = nextId('jr');
  const cloth = 'M14 10 C80 5 160 14 232 8 L306 10 L290 42 L308 74 L288 106 L310 140 L290 172 L304 202 C220 196 120 206 14 200 Z';
  const bone = C.paper;
  const boneLine = (x0: number, y0: number, x1: number, y1: number) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const nub = (x: number, y: number, s: number) =>
      `<circle cx="${f(x + Math.cos(a + (s * Math.PI) / 2) * 7)}" cy="${f(y + Math.sin(a + (s * Math.PI) / 2) * 7)}" r="10"/><circle cx="${f(x - Math.cos(a + (s * Math.PI) / 2) * 7)}" cy="${f(y - Math.sin(a + (s * Math.PI) / 2) * 7)}" r="10"/>`;
    return `<path d="M${x0} ${y0} L${x1} ${y1}" stroke-width="14"/>${nub(x0, y0, 1)}${nub(x1, y1, 1)}`;
  };
  const bones = `${boneLine(96, 60, 204, 164)}${boneLine(96, 164, 204, 60)}`;
  const skull =
    'M150 38 C184 38 202 60 202 88 C202 106 194 116 184 122 L184 138 L116 138 L116 122 C106 116 98 106 98 88 C98 60 116 38 150 38 Z';
  return svg(
    320,
    210,
    `<path d="${cloth}" fill="url(#${id}c)"/>
    <g clip-path="url(#${id}k)">
      <path d="M86 0 C92 70 80 140 88 210 L120 210 C112 140 124 70 118 0 Z" fill="${C.white}" opacity=".05"/>
      <path d="M180 0 C186 70 174 140 182 210 L206 210 C200 140 210 70 204 0 Z" fill="${C.ink}" opacity=".5"/>
      <path d="M250 0 C256 70 246 140 252 210 L272 210 C266 140 276 70 270 0 Z" fill="${C.white}" opacity=".05"/>
    </g>
    <rect x="6" y="6" width="18" height="198" rx="4" fill="${C.inkSoft}"/>
    <circle cx="15" cy="30" r="6" fill="none" stroke="${C.gold}" stroke-width="3.4"/><circle cx="15" cy="180" r="6" fill="none" stroke="${C.gold}" stroke-width="3.4"/>
    <g stroke="${C.ink}" fill="${C.ink}" stroke-linecap="round">${bones.replace(/stroke-width="14"/g, 'stroke-width="21"').replace(/r="10"/g, 'r="13.5"')}</g>
    <g stroke="${bone}" fill="${bone}" stroke-linecap="round">${bones}</g>
    <path d="${skull}" fill="${bone}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M110 70 C114 54 128 46 142 44" fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="130" cy="90" rx="15" ry="17" fill="${C.ink}"/><ellipse cx="170" cy="90" rx="15" ry="17" fill="${C.ink}"/>
    <path d="M150 104 L143 118 L157 118 Z" fill="${C.ink}"/>
    <path d="M132 124 V138 M144 126 V138 M156 126 V138 M168 124 V138" stroke="${C.ink}" stroke-width="3.2"/>
    <path d="M186 60 L178 72 L186 80" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="258" cy="46" r="6" fill="${mix(C.night, C.skyLow, 0.4)}" stroke="${C.inkSoft}" stroke-width="2"/>
    <path d="M14 10 C80 5 160 14 232 8 L306 10" fill="none" stroke="${C.moonGlow}" stroke-width="3" opacity=".35"/>
    <path d="${cloth}" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`,
    `${lin(`${id}c`, [[0, mix(C.inkSoft, C.navy, 0.3)], [0.6, C.ink], [1, C.ink]], 1, 1)}
     <clipPath id="${id}k"><path d="${cloth}"/></clipPath>`,
  );
}

/** Bunting pennant, 64 x 100, rope sleeve at the top. */
export function pennant(color: string): string {
  const d = 'M6 8 L58 8 L32 94 Z';
  return svg(
    64,
    100,
    `<path d="${d}" fill="${mix(color, C.night, 0.28)}"/>
    <path d="M12 12 L30 76" stroke="${C.white}" stroke-width="4" stroke-linecap="round" opacity=".14"/>
    <path d="M36 12 L50 12 L33 70 Z" fill="${C.ink}" opacity=".16"/>
    ${ink(`<path d="${d}"/>`, 3.4)}
    <rect x="3" y="2" width="58" height="10" rx="4" fill="${mix(C.g3, C.night, 0.3)}" stroke="${C.ink}" stroke-width="2.4"/>`,
  );
}

/* -------------------------------------------------------------------- props */

/** Iron-hooped deck barrel (plain, so it never reads as the Powder Keg wild). 256 viewBox. */
export function barrel(): string {
  const id = nextId('br');
  const hw = (y: number) => 52 + 16 * Math.sin((Math.PI * (y - 42)) / 180);
  const body = 'M76 42 C60 90 58 170 76 222 C100 236 156 236 180 222 C198 170 196 90 180 42 C156 32 100 32 76 42 Z';
  const hoop = (y: number) => {
    const w = hw(y);
    return `M${f(128 - w)} ${y - 6} Q128 ${y + 6} ${f(128 + w)} ${y - 6} L${f(128 + w)} ${y + 6} Q128 ${y + 18} ${f(128 - w)} ${y + 6} Z`;
  };
  const staves = [-0.66, -0.3, 0.06, 0.42, 0.76]
    .map((k) => {
      const x0 = 128 + k * 52;
      const xm = 128 + k * 68;
      return `M${f(x0)} ${46} Q${f(xm + k * 4)} 132 ${f(x0)} ${226}`;
    })
    .join(' ');
  return composeSymbol({
    lw: 7,
    shade: 0.34,
    light: 0.3,
    defs: `${lin(`${id}w`, [[0, mix(C.wood, C.woodMid, 0.3)], [0.55, C.woodMid], [1, C.woodDark]], 1, 0)}${lin(`${id}i`, [[0, C.steelDeep], [1, C.inkSoft]])}`,
    layers: [
      {
        fills: `<path d="${body}" fill="url(#${id}w)"/>`,
        lines: `<path d="${body}"/><path d="${staves}" stroke-width="3.2"/>`,
      },
      {
        fills: `<path d="${hoop(66)} ${hoop(104)} ${hoop(160)} ${hoop(198)}" fill="url(#${id}i)"/><ellipse cx="128" cy="42" rx="52" ry="13" fill="${mix(C.wood, C.woodLight, 0.2)}"/>`,
        lines: `<path d="${hoop(66)} ${hoop(104)} ${hoop(160)} ${hoop(198)}" stroke-width="4.5"/><ellipse cx="128" cy="42" rx="52" ry="13"/><path d="M96 40 Q128 48 160 40 M108 34 Q128 38 150 34" stroke-width="2.6"/>`,
      },
    ],
    top: `<path d="M86 64 Q90 130 88 196" stroke="${C.white}" stroke-width="5" stroke-linecap="round" fill="none" opacity=".18"/>`,
  });
}

/** Deck cannon on a red-painted carriage, profile, muzzle to the left. 256 viewBox. */
export function cannon(): string {
  const id = nextId('cn');
  const barrelD = 'M26 116 L40 112 L198 106 C216 106 228 118 228 133 C228 148 216 160 198 160 L40 154 L26 150 Z';
  const carriage = 'M84 152 L214 152 L214 186 L192 186 L192 198 L100 198 L100 186 L84 186 Z';
  return composeSymbol({
    lw: 7,
    shade: 0.34,
    light: 0.28,
    defs: `${lin(`${id}b`, [[0, mix(C.inkSoft, C.steelDeep, 0.55)], [0.45, C.inkSoft], [1, C.ink]])}${lin(`${id}c`, [[0, mix(C.crimsonDeep, C.crimson, 0.25)], [1, mix(C.crimsonDeep, C.woodDeep, 0.5)]])}`,
    layers: [
      {
        fills: `<path d="${carriage}" fill="url(#${id}c)"/>`,
        lines: `<path d="${carriage}"/><path d="M92 170 H206" stroke-width="3"/>`,
      },
      {
        fills: `<circle cx="114" cy="204" r="24" fill="${C.woodDark}"/><circle cx="192" cy="204" r="24" fill="${C.woodDark}"/>`,
        lines: `<circle cx="114" cy="204" r="24"/><circle cx="192" cy="204" r="24"/><circle cx="114" cy="204" r="7" stroke-width="4"/><circle cx="192" cy="204" r="7" stroke-width="4"/>`,
      },
      {
        fills: `<path d="${barrelD}" fill="url(#${id}b)"/>
          <rect x="54" y="106" width="12" height="54" rx="4" fill="${C.inkSoft}"/><rect x="118" y="103" width="12" height="60" rx="4" fill="${C.inkSoft}"/><rect x="174" y="101" width="12" height="64" rx="4" fill="${C.inkSoft}"/>
          <circle cx="238" cy="133" r="10" fill="${C.inkSoft}"/>`,
        lines: `<path d="${barrelD}"/><rect x="54" y="106" width="12" height="54" rx="4" stroke-width="4"/><rect x="118" y="103" width="12" height="60" rx="4" stroke-width="4"/><rect x="174" y="101" width="12" height="64" rx="4" stroke-width="4"/><circle cx="238" cy="133" r="10"/><path d="M228 133 H230" />`,
      },
    ],
    top: `<ellipse cx="29" cy="133" rx="5" ry="15" fill="${C.ink}"/>
      <path d="M48 118 L196 112" stroke="${C.steel}" stroke-width="5" stroke-linecap="round" opacity=".5"/>
      <path d="M150 126 C156 122 164 122 170 126" stroke="${C.steelLight}" stroke-width="3" stroke-linecap="round" fill="none" opacity=".35"/>`,
  });
}

/** Neat pyramid of cannonballs, 256 viewBox. */
export function cannonballs(): string {
  const balls: [number, number, number][] = [
    [76, 196, 30],
    [134, 198, 30],
    [192, 196, 30],
    [105, 150, 30],
    [163, 150, 30],
    [134, 104, 30],
  ];
  return composeSymbol({
    lw: 6.5,
    shade: 0.38,
    light: 0.25,
    layers: balls.map(([x, y, r]) => ({ fills: `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.inkSoft}"/>`, lines: `<circle cx="${x}" cy="${y}" r="${r}"/>` })),
    top: balls.map(([x, y]) => `<circle cx="${x - 10}" cy="${y - 11}" r="6" fill="${C.steel}" opacity=".45"/>`).join(''),
  });
}

/** Coil of hemp rope lying on the deck, loose end trailing right. 256 viewBox. */
export function ropeCoil(): string {
  const rope = mix(C.g2, C.woodLight, 0.25);
  const ring = (rx: number, cy: number) => `M${128 - rx} ${cy} A${rx} ${f(rx * 0.42)} 0 1 0 ${128 + rx} ${cy} A${rx} ${f(rx * 0.42)} 0 1 0 ${128 - rx} ${cy}`;
  const rings = [100, 80, 60, 40].map((rx, i) => ring(rx, 168 - i * 7)).join(' ');
  const tail = 'M222 172 C236 190 222 212 196 218 C170 224 150 222 136 232';
  const twist = (d: string, dash: string) => `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="12" stroke-dasharray="${dash}" opacity=".28"/>`;
  return svg(
    256,
    256,
    `<path d="${rings}" fill="none" stroke="${C.ink}" stroke-width="22"/>
    <path d="${tail}" fill="none" stroke="${C.ink}" stroke-width="22" stroke-linecap="round"/>
    <path d="${rings}" fill="none" stroke="${rope}" stroke-width="14"/>
    <path d="${tail}" fill="none" stroke="${rope}" stroke-width="14" stroke-linecap="round"/>
    ${twist(rings, '2 7')}${twist(tail, '2 7')}
    <ellipse cx="128" cy="147" rx="24" ry="9" fill="${C.ink}" opacity=".8"/>
    <path d="M40 150 A100 42 0 0 1 128 124" fill="none" stroke="${C.white}" stroke-width="3" opacity=".22"/>`,
  );
}

/** Heap of plunder: doubloons, a jewelled goblet, pearls and a ruby. 256 viewBox. */
export function treasurePile(): string {
  const id = nextId('tp');
  const heap = 'M22 214 C34 176 64 156 96 146 C112 118 146 112 168 134 C200 140 228 174 236 214 C180 226 80 226 22 214 Z';
  const R = rng(3);
  let coins = '';
  for (let i = 0; i < 26; i++) {
    const x = 44 + R() * 172;
    const top = x < 96 ? 214 - (x - 22) * 0.9 : x > 168 ? 214 - (236 - x) * 1.05 : 132;
    const y = top + 10 + R() * (208 - top - 12);
    if (y > 212) continue;
    const r = 9 + R() * 5;
    coins += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.45)}" fill="${R() < 0.5 ? C.gold : mix(C.gold, C.goldLight, 0.35)}" stroke="${C.goldDeep}" stroke-width="2.2"/>`;
  }
  const goblet = 'M138 62 L184 62 C184 92 172 104 161 106 C150 104 138 92 138 62 Z';
  return composeSymbol({
    lw: 6.5,
    shade: 0.3,
    light: 0.4,
    defs: `${lin(`${id}g`, [[0, C.goldLight], [0.35, C.gold], [1, C.goldDeep]])}`,
    layers: [
      {
        fills: `<path d="${goblet}" fill="url(#${id}g)"/><rect x="156" y="104" width="10" height="26" fill="${C.goldDeep}"/><ellipse cx="161" cy="132" rx="18" ry="6" fill="${C.gold}"/>`,
        lines: `<path d="${goblet}"/><path d="M156 106 V128 M166 106 V128" stroke-width="4"/><ellipse cx="161" cy="132" rx="18" ry="6" stroke-width="4.5"/>`,
      },
      {
        fills: `<path d="${heap}" fill="url(#${id}g)"/>`,
        lines: `<path d="${heap}"/>`,
      },
      {
        fills: `<ellipse cx="62" cy="206" rx="16" ry="7" fill="${C.gold}"/><ellipse cx="206" cy="210" rx="15" ry="6.5" fill="${C.gold}"/>
          <path d="M92 150 L110 138 L128 150 L110 172 Z" fill="${C.crimson}"/>
          <ellipse cx="200" cy="170" rx="9" ry="12" fill="${C.parrotBlue}"/>`,
        lines: `<ellipse cx="62" cy="206" rx="16" ry="7" stroke-width="4"/><ellipse cx="206" cy="210" rx="15" ry="6.5" stroke-width="4"/>
          <path d="M92 150 L110 138 L128 150 L110 172 Z" stroke-width="4.5"/><path d="M92 150 H128 M110 138 L104 150 L110 172 L116 150 Z" stroke-width="2.4"/>
          <ellipse cx="200" cy="170" rx="9" ry="12" stroke-width="4"/>`,
      },
    ],
    top: `${coins}
      <circle cx="161" cy="80" r="6" fill="${C.crimson}" stroke="${C.ink}" stroke-width="2.4"/>
      <path d="M60 190 C80 178 110 184 124 196 C136 206 160 204 172 192" fill="none" stroke="${C.ink}" stroke-width="10" stroke-linecap="round" stroke-dasharray="0.1 11"/>
      <path d="M60 190 C80 178 110 184 124 196 C136 206 160 204 172 192" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round" stroke-dasharray="0.1 11"/>
      <path d="M100 146 L108 142" stroke="${C.crimsonLight}" stroke-width="3" stroke-linecap="round"/>
      <path d="M146 70 C146 84 150 92 156 96" stroke="${C.white}" stroke-width="4" stroke-linecap="round" fill="none" opacity=".6"/>`,
  });
}

/* ------------------------------------------------------- cargo-hatch frame */

/** Geometry of hatchFrame() in S = 100 units (one reel cell = 100), shared with Reels.ts. */
export const HATCH = {
  /** viewBox origin relative to the frame's outer top-left, and size. */
  vx: -26,
  vy: -44,
  vw: 740,
  vh: 636,
  frameT: 20,
  gap: 7,
  postW: 25,
  postTop: -34,
};

/**
 * The reel frame: a ship's cargo hatch. Heavy dark-oak coaming, lashed posts with rope wraps,
 * brass corner brackets and rivets, and the dark hold behind the six reels (faint cool planks)
 * with thin oak battens between the reels. One SVG in S = 100 units: the frame's outer rect is
 * (0, 0, 675, 540), the symbol grid (20, 20, 635, 500).
 */
export function hatchFrame(): string {
  const id = nextId('hf');
  const { frameT: t, gap, postW } = HATCH;
  const W = 675;
  const H = 540;
  const cols = 6;
  const cw = 100;
  const post = (x: number) => ({ x, y: HATCH.postTop, w: postW, h: H + 8 - HATCH.postTop });
  const posts = [post(-postW * 0.35), post(W - postW * 0.65)];
  // hold: dark columns with faint cool planking
  let hold = '';
  for (let i = 0; i < cols; i++) {
    const x = t + i * (cw + gap);
    hold += `<rect x="${x}" y="${t}" width="${cw}" height="${H - 2 * t}" fill="url(#${id}col)"/>`;
    hold += `<path d="M${x + 50} ${t} V${H - t}" stroke="${C.ink}" stroke-width="1.4" opacity=".5"/>`;
    hold += `<path d="M${x + 51.2} ${t} V${H - t}" stroke="${C.moonGlow}" stroke-width=".8" opacity=".06"/>`;
    hold += `<path d="M${x + 18} ${t + 20} C${x + 22} 200 ${x + 14} 340 ${x + 20} ${H - t - 20} M${x + 74} ${t + 30} C${x + 70} 180 ${x + 78} 360 ${x + 72} ${H - t - 30}" fill="none" stroke="${C.nightDeep}" stroke-width="1.2" opacity=".5"/>`;
    if (i < cols - 1) {
      const bx = x + cw;
      hold += `<rect x="${bx}" y="${t - 3}" width="${gap}" height="${H - 2 * t + 6}" fill="url(#${id}bat)"/>`;
      hold += `<path d="M${bx + 1.6} ${t} V${H - t}" stroke="${mix(C.woodMid, C.woodLight, 0.2)}" stroke-width="1.2" opacity=".55"/>`;
    }
  }
  const bat = Array.from({ length: cols - 1 }, (_, i) => t + i * (cw + gap) + cw);
  // coaming (the frame body) as a ring
  const ring = `M0 8 Q0 0 8 0 L${W - 8} 0 Q${W} 0 ${W} 8 L${W} ${H - 8} Q${W} ${H} ${W - 8} ${H} L8 ${H} Q0 ${H} 0 ${H - 8} Z M${t - 2} ${t - 2} L${t - 2} ${H - t + 2} L${W - t + 2} ${H - t + 2} L${W - t + 2} ${t - 2} Z`;
  const rivet = (x: number, y: number, r = 2.6) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${C.goldDeep}"/><circle cx="${f(x - r * 0.3)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.45)}" fill="${C.goldLight}"/>`;
  let rivets = '';
  for (const bx of bat) {
    rivets += rivet(bx + gap / 2, t / 2);
    rivets += rivet(bx + gap / 2, H - t / 2);
  }
  // brass corner brackets (L plates) over the post/rail joints
  const bracket = (sx: number, sy: number) => {
    // sx/sy: +1 grows right/down from the corner, -1 left/up
    const cx = sx > 0 ? 0 : W;
    const cy = sy > 0 ? 0 : H;
    const L = 52;
    const b = 15;
    const x0 = cx - sx * 4;
    const y0 = cy - sy * 4;
    const pts = [
      [x0, y0],
      [x0 + sx * L, y0],
      [x0 + sx * L, y0 + sy * b],
      [x0 + sx * b, y0 + sy * b],
      [x0 + sx * b, y0 + sy * L],
      [x0, y0 + sy * L],
    ];
    const d = `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`;
    const bevel = `M${f(x0 + sx * 2)} ${f(y0 + sy * (L - 3))} L${f(x0 + sx * 2)} ${f(y0 + sy * 2)} L${f(x0 + sx * (L - 3))} ${f(y0 + sy * 2)}`;
    return {
      fill: `<path d="${d}" fill="url(#${id}br)"/><path d="${bevel}" fill="none" stroke="${C.goldLight}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`,
      line: `<path d="${d}"/>`,
      riv: rivet(x0 + sx * (L - 8), y0 + sy * (b / 2), 2.8) + rivet(x0 + sx * (b / 2), y0 + sy * (L - 8), 2.8) + rivet(x0 + sx * (b / 2), y0 + sy * (b / 2), 3),
    };
  };
  const brs = [bracket(1, 1), bracket(-1, 1), bracket(1, -1), bracket(-1, -1)];
  // hemp lashing wound round each post at mid-height, two loose ends hanging below
  const lash = (px: number) => {
    const n = 8;
    const pitch = 7.4;
    const th = 9;
    const y0 = 226;
    const x0 = px - 3.5;
    const x1 = px + postW + 3.5;
    let s = '';
    for (let k = 0; k < n; k++) {
      const y = y0 + k * pitch;
      const d = `M${x0} ${y} C${x0 + 7} ${y - 1} ${x1 - 7} ${y + 4} ${x1} ${y + 5} C${x1 + 3.5} ${y + 5} ${x1 + 3.5} ${y + 5 + th} ${x1} ${y + 5 + th} C${x1 - 7} ${y + 4 + th} ${x0 + 7} ${y - 1 + th} ${x0} ${y + th} C${x0 - 3.5} ${y + th} ${x0 - 3.5} ${y} ${x0} ${y} Z`;
      s += `<path d="${d}" fill="url(#${id}rope)" stroke="${C.ink}" stroke-width="2.1" stroke-linejoin="round"/>`;
      for (let j = 1; j < 4; j++) {
        const tx = x0 + (x1 - x0) * (j / 4);
        const ty = y + (5 * j) / 4;
        s += `<path d="M${f(tx - 2.4)} ${f(ty + 1.6)} L${f(tx + 2)} ${f(ty + th - 1.4)}" stroke="${C.ink}" stroke-width="1.3" stroke-linecap="round" opacity=".42"/>`;
      }
      s += `<path d="M${x0 + 3} ${y + 2.6} C${x0 + 8} ${y + 2} ${x1 - 8} ${y + 6} ${x1 - 3} ${y + 7.2}" stroke="${C.white}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".3"/>`;
    }
    const yb = y0 + (n - 1) * pitch + th + 3;
    const ends = `M${px + 7} ${yb} C${px + 5} ${yb + 10} ${px + 9} ${yb + 18} ${px + 6} ${yb + 27} M${px + 17} ${yb + 2} C${px + 19} ${yb + 9} ${px + 16} ${yb + 15} ${px + 19} ${yb + 21}`;
    s += `<path d="${ends}" fill="none" stroke="${C.ink}" stroke-width="7.4" stroke-linecap="round"/><path d="${ends}" fill="none" stroke="${mix(C.g2, C.woodLight, 0.3)}" stroke-width="4" stroke-linecap="round"/>`;
    s += `<path d="M${px + 4} ${yb + 29} l2 -4 l2 4 M${px + 17} ${yb + 23} l2 -4 l2 4" fill="none" stroke="${mix(C.g2, C.woodLight, 0.3)}" stroke-width="1.6" stroke-linecap="round"/>`;
    return s;
  };
  const postFill = posts
    .map(
      (p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="url(#${id}post)"/>
      <path d="M${p.x + 6} ${p.y + 12} V${p.y + p.h - 10}" stroke="${mix(C.woodMid, C.woodLight, 0.35)}" stroke-width="2.4" opacity=".4"/>
      <path d="M${p.x + p.w - 4} ${p.y + 10} V${p.y + p.h - 8}" stroke="${C.moonGlow}" stroke-width="1.6" opacity=".22"/>
      <path d="M${p.x + 12} ${p.y + 40} C${p.x + 15} ${p.y + 160} ${p.x + 10} ${p.y + 300} ${p.x + 13} ${p.y + p.h - 20} M${p.x + 18} ${p.y + 90} l0 26 M${p.x + 8} ${p.y + 380} l0 20" stroke="${C.woodDeep}" stroke-width="1.4" fill="none" opacity=".6"/>
      <rect x="${p.x - 2}" y="${p.y - 2}" width="${p.w + 4}" height="12" rx="3" fill="url(#${id}br)"/>
      <rect x="${p.x - 1}" y="${p.y + p.h - 26}" width="${p.w + 2}" height="9" rx="2" fill="${C.inkSoft}"/>
      <path d="M${p.x + 1} ${p.y + p.h - 24} H${p.x + p.w - 1}" stroke="${C.steelDeep}" stroke-width="1.4"/>`,
    )
    .join('');
  const postInk = posts
    .map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4"/><rect x="${p.x - 2}" y="${p.y - 2}" width="${p.w + 4}" height="12" rx="3" stroke-width="2.4"/><rect x="${p.x - 1}" y="${p.y + p.h - 26}" width="${p.w + 2}" height="9" rx="2" stroke-width="2"/>`)
    .join('');
  // plank joints, nails and grain along the coaming rails
  let rails = '';
  for (const [jx, y0, y1] of [
    [236, 0, t],
    [468, 0, t],
    [124, H - t, H],
    [352, H - t, H],
    [566, H - t, H],
  ] as [number, number, number][]) {
    rails += `<path d="M${jx} ${y0 + 1} V${y1 - 1}" stroke="${C.ink}" stroke-width="2.2"/>`;
    rails += `<circle cx="${jx - 5}" cy="${(y0 + y1) / 2}" r="1.7" fill="${C.inkSoft}"/><circle cx="${jx + 5}" cy="${(y0 + y1) / 2}" r="1.7" fill="${C.inkSoft}"/>`;
  }
  rails += `<path d="M30 7 C120 5 200 9 300 6 M320 13 C420 15 520 11 640 14 M40 ${H - 13} C160 ${H - 15} 260 ${H - 11} 380 ${H - 14} M420 ${H - 7} C520 ${H - 5} 580 ${H - 8} 650 ${H - 6}" fill="none" stroke="${C.woodDeep}" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>`;
  rails += `<path d="M${t - 1} ${t - 1.5} H${W - t + 1} M${t - 1} ${H - 2.5} H${W - t + 1}" stroke="${mix(C.woodMid, C.woodLight, 0.25)}" stroke-width="1.6" opacity=".5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${HATCH.vx} ${HATCH.vy} ${HATCH.vw} ${HATCH.vh}" width="${HATCH.vw}" height="${HATCH.vh}">
  <defs>
    <filter id="${id}sh" x="-10%" y="-10%" width="120%" height="125%"><feGaussianBlur stdDeviation="7"/></filter>
    ${lin(`${id}col`, [[0, mix(C.nightDeep, C.ink, 0.35)], [0.12, mix(C.nightDeep, C.woodDeep, 0.35)], [0.5, mix(C.nightDeep, C.night, 0.3)], [0.88, mix(C.nightDeep, C.woodDeep, 0.35)], [1, mix(C.nightDeep, C.ink, 0.45)]])}
    ${lin(`${id}bat`, [[0, mix(C.woodDark, C.woodMid, 0.3)], [0.5, C.woodDark], [1, C.woodDeep]], 1, 0)}
    ${lin(`${id}oak`, [[0, mix(C.woodMid, C.woodDark, 0.25)], [0.2, C.woodDark], [1, mix(C.woodDeep, C.woodDark, 0.3)]])}
    ${lin(`${id}post`, [[0, mix(C.woodMid, C.woodDark, 0.2)], [0.45, C.woodDark], [1, C.woodDeep]], 1, 0)}
    ${lin(`${id}br`, [[0, mix(C.goldLight, C.gold, 0.45)], [0.28, C.gold], [0.62, mix(C.gold, C.goldDeep, 0.5)], [1, C.goldDeep]], 1, 1)}
    ${lin(`${id}rope`, [[0, mix(C.g2, C.woodLight, 0.35)], [0.55, mix(C.g2, C.woodMid, 0.35)], [1, mix(C.g3, C.woodMid, 0.5)]])}
    ${lin(`${id}lip`, [[0, C.ink, 0.7], [1, C.ink, 0]])}
    ${cel(`${id}c`, 0.28, 0.3, 0.28)}
  </defs>
  <rect x="8" y="16" width="${W}" height="${H}" rx="10" fill="${C.ink}" opacity=".6" filter="url(#${id}sh)"/>
  <rect x="${t - 3}" y="${t - 3}" width="${W - 2 * t + 6}" height="${H - 2 * t + 6}" fill="${C.ink}"/>
  ${hold}
  <rect x="${t}" y="${t}" width="${W - 2 * t}" height="26" fill="url(#${id}lip)"/>
  <g filter="url(#${id}c)">
    <path d="${ring}" fill="url(#${id}oak)" fill-rule="evenodd"/>
  </g>
  ${rails}
  <path d="M10 4 H${W - 10}" stroke="${C.moonGlow}" stroke-width="2" opacity=".3"/>
  ${rivets}
  ${ink(`<path d="${ring}"/>`, 3.2)}
  ${postFill}
  ${posts.map((p) => lash(p.x)).join('')}
  ${brs.map((b) => b.fill).join('')}
  ${ink(`${postInk}${brs.map((b) => b.line).join('')}`, 3)}
  ${brs.map((b) => b.riv).join('')}
</svg>`;
}

/**
 * Carved skull finial that caps each hatch post, on a brass collar. 128 viewBox; the post joins
 * at the bottom centre (anchor 0.5, 0.92 as before).
 */
export function skullFinial(): string {
  const id = nextId('sk');
  const skull = 'M64 16 C98 16 110 42 108 64 C107 78 100 86 94 90 L94 102 L34 102 L34 90 C28 86 21 78 20 64 C18 42 30 16 64 16 Z';
  return composeSymbol({
    size: 128,
    lw: 5,
    noDrop: true,
    shade: 0.32,
    light: 0.42,
    defs: lin(`${id}b`, [[0, C.goldLight], [0.35, C.gold], [1, C.goldDeep]]),
    layers: [
      {
        fills: `<rect x="26" y="100" width="76" height="12" rx="4" fill="url(#${id}b)"/><rect x="34" y="110" width="60" height="16" rx="4" fill="${C.goldDeep}"/>`,
        lines: `<rect x="26" y="100" width="76" height="12" rx="4"/><rect x="34" y="110" width="60" height="16" rx="4"/>`,
      },
      {
        fills: `<path d="${skull}" fill="${C.paperWarm}"/>`,
        lines: `<path d="${skull}"/><path d="M78 22 L72 34 L80 42" stroke-width="3"/>`,
      },
    ],
    top: `<ellipse cx="46" cy="64" rx="12" ry="14" fill="${C.ink}"/><ellipse cx="82" cy="64" rx="12" ry="14" fill="${C.ink}"/>
      <circle cx="49" cy="60" r="2.6" fill="${C.goldLight}" opacity=".7"/><circle cx="85" cy="60" r="2.6" fill="${C.goldLight}" opacity=".7"/>
      <path d="M64 76 L58 87 L70 87 Z" fill="${C.ink}"/>
      <path d="M48 92 V102 M56 93 V102 M64 93 V102 M72 93 V102 M80 92 V102" stroke="${C.ink}" stroke-width="2.6"/>
      <rect x="65.5" y="94" width="5" height="7" fill="${C.gold}"/>
      <path d="M32 50 C36 32 48 24 62 22" stroke="${C.white}" stroke-width="4" stroke-linecap="round" fill="none" opacity=".55"/>`,
  });
}

/* ----------------------------------------------------------- legacy names */
// Older tools (tools/brand, tools/art/groups/props.ts) still import the nursery names. They now
// return the pirate pieces so nothing breaks; remove once those tools are reskinned.

/** @deprecated use starTile(). */
export const wallpaperTile = starTile;
/** @deprecated use bulwarkTile(). */
export const wainscotTile = bulwarkTile;
/** @deprecated use deckTile(). */
export const floorTile = deckTile;
/** @deprecated use lighthouse(). */
export const nurseryWindow = lighthouse;
/** @deprecated use lantern('front'). */
export const candle = () => lantern('front');
/** @deprecated use sailCorner(). */
export const mobileBar = sailCorner;
/** @deprecated use barrel() / cannonballs() / ropeCoil() / treasurePile(). */
export function mobileItem(kind: 'bat' | 'moon' | 'star' | 'skull'): string {
  return kind === 'bat' ? barrel() : kind === 'moon' ? moonDisc() : kind === 'star' ? sparkle() : skullFinial();
}
/** @deprecated the nursery doodles are gone; returns scenery pieces under the old keys. */
export function doodles(): { key: string; svg: string }[] {
  const pieces = [cannon(), pennant(C.crimson), sparkle(), moonDisc(), cannonballs(), lighthouseBeam(), ropeCoil()];
  return ['d-devil', 'd-zzz', 'd-star', 'd-sun', 'd-tally', 'd-flames', 'd-luci'].map((key, i) => ({ key, svg: pieces[i] }));
}
/** @deprecated use skullFinial(). */
export const finial = skullFinial;
