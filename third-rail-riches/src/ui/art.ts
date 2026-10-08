/**
 * HUD and panel art (track H): the subway car dash and station signage (maroon enamel, brass trim,
 * cream enamel, emerald and electric blue), drawn in the game's ink + cel style (docs/ART.md): warm ink outlines,
 * flat palette fills, a cel shade on the lower right, a hand-cut highlight on the upper left.
 * Everything is SVG from the palette in art/kit.ts: controls are inline images (data URIs), panels
 * and the control bar get tiling textures through CSS custom properties (installUiArt), so the
 * DOM needs almost no CSS gradients.
 */
import { C } from '../art/kit';

const f = (n: number) => (Math.round(n * 100) / 100).toString();
const RAD = Math.PI / 180;
/** Point at radius r, `deg` clockwise from 12 o'clock. */
const pol = (cx: number, cy: number, r: number, deg: number): [number, number] => [cx + Math.sin(deg * RAD) * r, cy - Math.cos(deg * RAD) * r];

/** An in-between of two palette colours. */
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

const doc = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

/** A data URI for an SVG string (for CSS url() and img src). */
export const uri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}`;

/** Deterministic pseudo random (texture layout never shimmers between renders). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}


/** Gradient stops helper: [offset, colour, opacity?]. */
const stops = (s: [number, string, number?][]) => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');
const lg = (id: string, s: [number, string, number?][], x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`;
const rg = (id: string, s: [number, string, number?][], cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`;
/** Polished brass, lit from the upper left. */
const BRASS: [number, string][] = [
  [0, C.goldLight],
  [0.38, C.gold],
  [0.78, mix(C.gold, C.goldDeep, 0.6)],
  [1, C.goldDeep],
];
/** A brass rivet head with its glint. */
const rivet = (x: number, y: number, r: number, ink = 1) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${C.gold}" stroke="${C.ink}" stroke-width="${f(ink)}"/><circle cx="${f(x - r * 0.32)}" cy="${f(y - r * 0.34)}" r="${f(r * 0.38)}" fill="${C.goldLight}"/>`;
/** Ring path (even-odd) between radii r0 < r1. */
const ringD = (cx: number, cy: number, r0: number, r1: number) =>
  `M${f(cx - r1)} ${f(cy)} a${f(r1)} ${f(r1)} 0 1 0 ${f(2 * r1)} 0 a${f(r1)} ${f(r1)} 0 1 0 ${f(-2 * r1)} 0 Z M${f(cx - r0)} ${f(cy)} a${f(r0)} ${f(r0)} 0 1 1 ${f(2 * r0)} 0 a${f(r0)} ${f(r0)} 0 1 1 ${f(-2 * r0)} 0 Z`;
/** Ring slice between radii r0 < r1 and angles a0 < a1 (degrees clockwise from 12 o'clock). */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const big = a1 - a0 > 180 ? 1 : 0;
  const [ax, ay] = pol(cx, cy, r1, a0);
  const [bx, by] = pol(cx, cy, r1, a1);
  const [px, py] = pol(cx, cy, r0, a1);
  const [qx, qy] = pol(cx, cy, r0, a0);
  return `M${f(ax)} ${f(ay)} A${r1} ${r1} 0 ${big} 1 ${f(bx)} ${f(by)} L${f(px)} ${f(py)} A${r0} ${r0} 0 ${big} 0 ${f(qx)} ${f(qy)} Z`;
}
/** An arc along radius r from a0 to a1 (degrees clockwise from 12 o'clock). */
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [ax, ay] = pol(cx, cy, r, a0);
  const [bx, by] = pol(cx, cy, r, a1);
  return `M${f(ax)} ${f(ay)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(bx)} ${f(by)}`;
}

/* ------------------------------------------------------------------------------------------- *
 * Control bar
 * ------------------------------------------------------------------------------------------- */

/**
 * The bar is the dash of a 1930s subway car: maroon enamel panels, each with a raised bevel, a
 * brass pinstripe and a rivet in every corner, butted together on dark seams. w x h tile (the bar
 * repeats it; a portrait bar shows two rows).
 */
export function deckTile(w = 320, h = 96): string {
  const r = rng(11);
  const n = 2;
  const pw = w / n;
  let body = `<defs>${lg('p', [
    [0, mix(C.maroon, C.maroonLight, 0.12)],
    [0.16, mix(C.maroon, C.maroonDeep, 0.18)],
    [0.7, mix(C.maroon, C.maroonDeep, 0.5)],
    [1, mix(C.maroon, C.maroonDeep, 0.72)],
  ])}${lg('s', [
    [0, '#fff', 0],
    [0.5, '#fff', 0.06],
    [1, '#fff', 0],
  ], 0, 0, 1, 0)}</defs><rect width="${w}" height="${h}" fill="${mix(C.maroonDeep, C.ink, 0.25)}"/>`;
  for (let i = 0; i < n; i++) {
    const x0 = i * pw + 3;
    const x1 = (i + 1) * pw - 3;
    const y0 = 4;
    const y1 = h - 4;
    body += `<rect x="${f(x0)}" y="${y0}" width="${f(x1 - x0)}" height="${y1 - y0}" rx="7" fill="url(#p)"/>`;
    // a soft enamel sheen sweeping across the panel
    const sx = x0 + (0.2 + r() * 0.4) * (x1 - x0);
    body += `<path d="M${f(sx)} ${y0} L${f(sx + 34)} ${y0} L${f(sx + 12)} ${y1} L${f(sx - 22)} ${y1} Z" fill="url(#s)"/>`;
    // raised bevel: lit top edge, shaded foot
    body += `<path d="M${f(x0 + 7)} ${y0 + 1.6} H${f(x1 - 7)}" stroke="${C.maroonLight}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
    body += `<path d="M${f(x0 + 6)} ${y1 - 1.6} H${f(x1 - 6)}" stroke="${C.ink}" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>`;
    // brass pinstripe inset
    body += `<rect x="${f(x0 + 9)}" y="${y0 + 9}" width="${f(x1 - x0 - 18)}" height="${y1 - y0 - 18}" rx="4" fill="none" stroke="${C.goldDeep}" stroke-width="1.6" opacity=".75"/>`;
    body += `<rect x="${f(x0 + 9)}" y="${y0 + 9}" width="${f(x1 - x0 - 18)}" height="${y1 - y0 - 18}" rx="4" fill="none" stroke="${C.gold}" stroke-width=".7" opacity=".55" transform="translate(-.5 -.5)"/>`;
    // a few enamel specks
    for (let k = 0; k < 6; k++) body += `<circle cx="${f(x0 + 12 + r() * (x1 - x0 - 24))}" cy="${f(y0 + 12 + r() * (y1 - y0 - 24))}" r="${f(0.5 + r() * 0.7)}" fill="${C.maroonDeep}" opacity=".5"/>`;
    for (const [x, y] of [
      [x0 + 5, y0 + 5],
      [x1 - 5, y0 + 5],
      [x0 + 5, y1 - 5],
      [x1 - 5, y1 - 5],
    ])
      body += rivet(x, y, 2.3, 0.9);
    body += `<rect x="${f(x0)}" y="${y0}" width="${f(x1 - x0)}" height="${y1 - y0}" rx="7" fill="none" stroke="${C.ink}" stroke-width="1.6" opacity=".9"/>`;
  }
  return doc(w, h, body);
}

/**
 * The trim along the top of the bar: a rolled brass rail with rivets over a thin emerald enamel
 * band (the station's trim colour). w x h tile.
 */
export function railTile(w = 64, h = 16): string {
  const b0 = 1.6;
  const b1 = h * 0.58;
  const e0 = b1 + 1.4;
  const e1 = h - 2.2;
  return doc(
    w,
    h,
    `<defs>${lg('b', [
      [0, C.goldLight],
      [0.35, C.gold],
      [1, C.goldDeep],
    ])}</defs>
    <rect width="${w}" height="${h}" fill="${C.ink}"/>
    <rect x="0" y="${f(b0)}" width="${w}" height="${f(b1 - b0)}" fill="url(#b)"/>
    <rect x="0" y="${f(b0 + 1)}" width="${w}" height="1.2" fill="#fff" opacity=".5"/>
    <rect x="0" y="${f(e0)}" width="${w}" height="${f(e1 - e0)}" fill="${C.emerald}"/>
    <rect x="0" y="${f(e0)}" width="${w}" height="1" fill="${C.emeraldLight}" opacity=".7"/>
    ${rivet(w / 2, (b0 + b1) / 2, Math.min(2.6, (b1 - b0) / 2 - 0.4), 0.9)}`,
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Controls
 * ------------------------------------------------------------------------------------------- */

/**
 * The spin button: a locomotive's driving wheel in a riveted brass bezel, round a dark dispatch hub
 * that glows electric blue (the icon sits on the hub). The wheel turns while a round plays, so it
 * has a counterweight and crank pin that show it going round. 200 box. `hot` = bonus: a gilded
 * wheel and an amber hub.
 */
export function helmSvg(hot = false): string {
  const cx = 100;
  const cy = 100;
  const glow = hot ? C.amber : C.volt;
  const spokeFill = hot ? C.gold : C.maroon;
  const spokeLight = hot ? C.goldLight : C.maroonLight;
  const webFill = hot ? mix(C.gold, C.goldDeep, 0.35) : mix(C.maroon, C.maroonDeep, 0.25);
  const spokes = Array.from({ length: 14 }, (_, i) => {
    const deg = i * (360 / 14);
    const [x0, y0] = pol(cx, cy, 36, deg);
    const [x1, y1] = pol(cx, cy, 60, deg);
    return `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${C.ink}" stroke-width="10.5" stroke-linecap="round"/><path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${spokeFill}" stroke-width="5.6" stroke-linecap="round"/>`;
  }).join('');
  const spokeGlints = Array.from({ length: 14 }, (_, i) => {
    const deg = i * (360 / 14);
    if (deg > 200 && deg < 340) return '';
    const [x0, y0] = pol(cx - 1, cy - 1, 40, deg);
    const [x1, y1] = pol(cx - 1, cy - 1, 55, deg);
    return `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${spokeLight}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
  }).join('');
  const bezelRivets = Array.from({ length: 16 }, (_, i) => {
    const [x, y] = pol(cx, cy, 81.5, i * 22.5 + 11.25);
    return rivet(x, y, 2.7, 1.1);
  }).join('');
  const [pinX, pinY] = pol(cx, cy, 47, 0);
  return doc(
    200,
    200,
    `<defs>
      ${rg('halo', [
        [0.62, glow, 0.55],
        [0.8, glow, 0.2],
        [1, glow, 0],
      ])}
      ${lg('brass', BRASS, 0, 0, 1, 1)}
      ${lg('iron', [
        [0, C.steelLight],
        [0.3, C.ironLight],
        [0.7, C.iron],
        [1, C.ironDeep],
      ], 0, 0, 1, 1)}
      ${rg('hub', hot ? [
        [0, C.amberLight],
        [0.45, C.amber],
        [1, C.amberDeep],
      ] : [
        [0, C.voltDeep],
        [0.6, C.voltNight],
        [1, mix(C.voltNight, C.ink, 0.5)],
      ], 0.42, 0.38, 0.65)}
    </defs>
    <circle cx="${cx}" cy="${cy}" r="99" fill="url(#halo)"/>
    <circle cx="${cx + 2.5}" cy="${cy + 5}" r="90" fill="#000" opacity=".4"/>
    <circle cx="${cx}" cy="${cy}" r="90" fill="${C.ink}"/>
    <circle cx="${cx}" cy="${cy}" r="87" fill="url(#brass)"/>
    <path d="${arc(cx, cy, 84.5, 95, 245)}" fill="none" stroke="${C.goldDeep}" stroke-width="4" stroke-linecap="round" opacity=".8"/>
    <path d="${arc(cx, cy, 84, 285, 400)}" fill="none" stroke="${C.goldLight}" stroke-width="2.6" stroke-linecap="round" opacity=".95"/>
    ${bezelRivets}
    <circle cx="${cx}" cy="${cy}" r="76" fill="${C.ink}"/>
    <circle cx="${cx}" cy="${cy}" r="73" fill="url(#iron)"/>
    <circle cx="${cx}" cy="${cy}" r="66.5" fill="none" stroke="${C.ironDeep}" stroke-width="2"/>
    <path d="${arc(cx, cy, 70, 290, 380)}" fill="none" stroke="${C.steelLight}" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>
    <circle cx="${cx}" cy="${cy}" r="64" fill="${C.ink}"/>
    <circle cx="${cx}" cy="${cy}" r="61.5" fill="${C.tunnel}"/>
    ${spokes}
    <path d="${sector(cx, cy, 36, 59, 138, 222)}" fill="${webFill}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="${arc(cx, cy, 55, 150, 210)}" fill="none" stroke="${spokeLight}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    ${spokeGlints}
    <path d="${ringD(cx, cy, 56, 62)}" fill="${spokeFill}" fill-rule="evenodd" stroke="${C.ink}" stroke-width="2.6"/>
    <path d="${arc(cx, cy, 59, 290, 390)}" fill="none" stroke="${spokeLight}" stroke-width="2" stroke-linecap="round" opacity=".75"/>
    <circle cx="${f(pinX)}" cy="${f(pinY)}" r="8.5" fill="${C.ink}"/>
    <circle cx="${f(pinX)}" cy="${f(pinY)}" r="6" fill="url(#brass)"/>
    <circle cx="${f(pinX - 1.8)}" cy="${f(pinY - 2)}" r="1.8" fill="#fff" opacity=".8"/>
    <circle cx="${cx}" cy="${cy}" r="39" fill="${C.ink}"/>
    <circle cx="${cx}" cy="${cy}" r="36" fill="url(#brass)"/>
    <path d="${arc(cx, cy, 33.5, 100, 250)}" fill="none" stroke="${C.goldDeep}" stroke-width="3.4" opacity=".85"/>
    <circle cx="${cx}" cy="${cy}" r="31" fill="${C.ink}"/>
    <circle cx="${cx}" cy="${cy}" r="28.5" fill="url(#hub)"/>
    <circle cx="${cx}" cy="${cy}" r="27" fill="none" stroke="${hot ? C.amberLight : C.volt}" stroke-width="1.6" opacity=".55"/>
    <path d="${arc(cx, cy, 23, 300, 350)}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".35"/>`,
  );
}

/**
 * The buy button: a Golden Ticket (the bonus symbol) with a punched star at each end and a maroon
 * enamel panel for the localised label set on top in the DOM. Tilted like the label. 160 box.
 */
export function sealSvg(): string {
  const cx = 80;
  const cy = 74;
  const x0 = 13;
  const x1 = 147;
  const y0 = 27;
  const y1 = 121;
  const nr = 9;
  const my = (y0 + y1) / 2;
  const r = 9;
  const ticket = `M${x0 + r} ${y0} H${x1 - r} Q${x1} ${y0} ${x1} ${y0 + r} V${my - nr} A${nr} ${nr} 0 0 0 ${x1} ${my + nr} V${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${my + nr} A${nr} ${nr} 0 0 0 ${x0} ${my - nr} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
  const star = (sx: number, sy: number, s: number) =>
    `M${f(sx)} ${f(sy - s)} L${f(sx + s * 0.3)} ${f(sy - s * 0.3)} L${f(sx + s)} ${f(sy)} L${f(sx + s * 0.3)} ${f(sy + s * 0.3)} L${f(sx)} ${f(sy + s)} L${f(sx - s * 0.3)} ${f(sy + s * 0.3)} L${f(sx - s)} ${f(sy)} L${f(sx - s * 0.3)} ${f(sy - s * 0.3)} Z`;
  const perf = (x: number) => Array.from({ length: 8 }, (_, i) => `<circle cx="${x}" cy="${f(y0 + 10 + i * ((y1 - y0 - 20) / 7))}" r="1.5"/>`).join('');
  return doc(
    160,
    160,
    `<defs>
      ${lg('t', [
        [0, C.goldLight],
        [0.3, C.gold],
        [1, C.goldDeep],
      ], 0, 0, 0.4, 1)}
      ${lg('m', [
        [0, C.maroonLight],
        [0.25, C.maroon],
        [1, C.maroonDeep],
      ])}
    </defs>
    <g transform="rotate(-7 ${cx} ${cy})">
      <path d="${ticket}" fill="#000" opacity=".38" transform="translate(3 6)"/>
      <path d="${ticket}" fill="url(#t)" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M${x0 + 12} ${y0 + 5} H${x1 - 12}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>
      <g fill="${C.goldDeep}">${perf(x0 + 19)}${perf(x1 - 19)}</g>
      <rect x="${x0 + 27}" y="${y0 + 11}" width="${x1 - x0 - 54}" height="${y1 - y0 - 22}" rx="7" fill="url(#m)" stroke="${C.ink}" stroke-width="3.5"/>
      <rect x="${x0 + 32}" y="${y0 + 16}" width="${x1 - x0 - 64}" height="${y1 - y0 - 32}" rx="4" fill="none" stroke="${C.gold}" stroke-width="1.8" opacity=".85"/>
      <path d="${star(x0 + 10, y0 + 13, 5)} ${star(x1 - 10, y1 - 13, 5)}" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="1.2"/>
    </g>
    <path d="${star(140, 22, 11)}" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="140" cy="22" r="3" fill="${C.voltCore}"/>`,
  );
}

/**
 * Round control (menu, autoplay, speed, close): an emerald enamel button in a riveted brass bezel.
 * `lit` = on: the face lights up electric blue. 96 box.
 */
export function knobSvg(lit = false): string {
  const c = 48;
  const rivets = Array.from({ length: 8 }, (_, i) => {
    const [x, y] = pol(c, c, 38, i * 45 + 22.5);
    return rivet(x, y, 1.9, 0.9);
  }).join('');
  return doc(
    96,
    96,
    `<defs>
      ${lg('b', BRASS, 0, 0, 1, 1)}
      ${rg('e', lit ? [
        [0, C.voltLight],
        [0.35, C.volt],
        [0.75, C.voltDeep],
        [1, C.voltNight],
      ] : [
        [0, C.emeraldLight],
        [0.45, C.emerald],
        [1, C.emeraldDeep],
      ], 0.38, 0.32, 0.72)}
    </defs>
    ${lit ? `<circle cx="${c}" cy="${c}" r="47" fill="${C.volt}" opacity=".35"/>` : ''}
    <circle cx="${c + 1.5}" cy="${c + 3.5}" r="44" fill="#000" opacity=".38"/>
    <circle cx="${c}" cy="${c}" r="44" fill="${C.ink}"/>
    <circle cx="${c}" cy="${c}" r="41" fill="url(#b)"/>
    <path d="${arc(c, c, 39, 100, 250)}" fill="none" stroke="${C.goldDeep}" stroke-width="3.6" stroke-linecap="round" opacity=".85"/>
    <path d="${arc(c, c, 39, 290, 395)}" fill="none" stroke="${C.goldLight}" stroke-width="2.2" stroke-linecap="round"/>
    ${rivets}
    <circle cx="${c}" cy="${c}" r="34" fill="${C.ink}"/>
    <circle cx="${c}" cy="${c}" r="31.5" fill="url(#e)"/>
    <path d="${arc(c, c, 28, 110, 240)}" fill="none" stroke="${lit ? C.voltNight : C.emeraldDeep}" stroke-width="4" stroke-linecap="round" opacity=".6"/>
    <path d="M${c - 22} ${c - 11} A25 25 0 0 1 ${c - 3} ${c - 26}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="${lit ? 0.6 : 0.4}"/>`,
  );
}

/** Small brass stud for the stake steps (+ / -): a domed brass button with a turned ring. 64 box. */
export function studSvg(): string {
  const c = 32;
  return doc(
    64,
    64,
    `<defs>${rg('s', [
      [0, C.goldLight],
      [0.45, C.gold],
      [1, C.goldDeep],
    ], 0.38, 0.34, 0.7)}</defs>
    <circle cx="${c + 1.2}" cy="${c + 2.6}" r="28" fill="#000" opacity=".38"/>
    <circle cx="${c}" cy="${c}" r="28" fill="${C.ink}"/>
    <circle cx="${c}" cy="${c}" r="25" fill="url(#s)"/>
    <circle cx="${c}" cy="${c}" r="19.5" fill="none" stroke="${C.goldDeep}" stroke-width="1.6" opacity=".65"/>
    <path d="${arc(c, c, 22.5, 110, 240)}" fill="none" stroke="${C.goldDeep}" stroke-width="3.4" stroke-linecap="round" opacity=".8"/>
    <path d="M${c - 18} ${c - 9} A20 20 0 0 1 ${c - 2} ${c - 20}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".7"/>`,
  );
}

/**
 * Express Pass toggle art: a little punched travel pass with a lightning bolt; off it is plain
 * cream card, on it is gold and the bolt crackles electric blue. 96 box.
 */
export function passSvg(on: boolean): string {
  const card = 'M18 26 Q18 20 24 20 H74 Q80 20 80 26 V44 Q73 48 73 55 Q73 62 80 66 V80 Q80 86 74 86 H24 Q18 86 18 80 V66 Q25 62 25 55 Q25 48 18 44 Z';
  const face = on ? C.gold : C.tile;
  const bolt = 'M52 30 L38 56 H48 L42 78 L62 48 H51 L58 30 Z';
  return doc(
    96,
    96,
    `<ellipse cx="49" cy="90" rx="28" ry="5" fill="#000" opacity=".35"/>
    ${on ? `<circle cx="49" cy="53" r="42" fill="${C.volt}" opacity=".3"/>` : ''}
    <g transform="rotate(-8 49 53)">
      <path d="${card}" fill="${face}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M24 28 H72" stroke="${on ? C.goldLight : C.white}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      <path d="M26 79 H72" stroke="${on ? C.goldDeep : C.tileDeep}" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/>
      <path d="${bolt}" fill="${on ? C.voltLight : C.ironLight}" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round"/>
      ${on ? `<path d="${bolt}" fill="${C.voltCore}" opacity=".6" transform="translate(50 54) scale(.55) translate(-50 -54)"/>` : ''}
    </g>
    ${on ? `<path d="M80 10 L83 18 L91 21 L83 24 L80 32 L77 24 L69 21 L77 18 Z" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>` : ''}`,
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Panels
 * ------------------------------------------------------------------------------------------- */

/**
 * Cream vitreous enamel (station signage): a warm cream glaze with faint mottling, the odd
 * pinhole and a soft glaze sheen. Tiling w x w.
 */
export function parchmentTile(w = 256): string {
  const r = rng(5);
  let body = `<rect width="${w}" height="${w}" fill="${mix(C.cream, C.tile, 0.45)}"/>`;
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = r() * w;
    const rr = 18 + r() * 40;
    body += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rr)}" ry="${f(rr * (0.6 + r() * 0.4))}" fill="${r() > 0.5 ? C.tileLight : C.tile}" opacity="${f(0.35 + r() * 0.3)}"/>`;
  }
  for (let i = 0; i < 30; i++) body += `<circle cx="${f(r() * w)}" cy="${f(r() * w)}" r="${f(0.35 + r() * 0.75)}" fill="${C.tileDeep}" opacity="${f(0.25 + r() * 0.25)}"/>`;
  return doc(w, w, body);
}

/**
 * Maroon enamel (panel frames, header bands, buttons, cards): the train livery's maroon with a
 * faint brushed grain and a few specks. Tiling w x w.
 */
export function woodTile(w = 192): string {
  const r = rng(23);
  let body = `<rect width="${w}" height="${w}" fill="${mix(C.maroon, C.maroonDeep, 0.22)}"/>`;
  for (let i = 0; i < 26; i++) {
    const y = r() * w;
    body += `<rect x="0" y="${f(y)}" width="${w}" height="${f(0.6 + r() * 1.4)}" fill="${r() > 0.5 ? C.maroonLight : C.maroonDeep}" opacity="${f(0.05 + r() * 0.08)}"/>`;
  }
  for (let i = 0; i < 18; i++) body += `<circle cx="${f(r() * w)}" cy="${f(r() * w)}" r="${f(0.4 + r() * 0.8)}" fill="${C.maroonDeep}" opacity="${f(0.3 + r() * 0.3)}"/>`;
  return doc(w, w, body);
}

/** Art-deco brass corner for panel frames (top-left orientation): stepped bracket, rivet, enamel inlay. 48 box. */
export function cornerSvg(): string {
  const outline = 'M4 4 H44 V13 H24 V18 H18 V24 H13 V44 H4 Z';
  return doc(
    48,
    48,
    `<defs>${lg('b', BRASS, 0, 0, 1, 1)}</defs>
    <path d="${outline}" fill="#000" opacity=".35" transform="translate(1.5 2.5)"/>
    <path d="${outline}" fill="url(#b)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M8 8 L40 8 M8 8 L8 40" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>
    <path d="M10 13 L19 13 L13 19 Z" fill="${C.emerald}" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>
    ${rivet(31, 8.6, 2.2, 1)}${rivet(8.6, 31, 2.2, 1)}`,
  );
}

/** Enamel sign plaque behind a title: emerald with a cream rule and brass screws. 240 x 64. */
export function plaqueSvg(): string {
  return doc(
    240,
    64,
    `<rect x="6" y="6" width="228" height="52" rx="10" fill="${C.ink}"/>
    <rect x="9" y="9" width="222" height="46" rx="8" fill="${C.emerald}"/>
    <rect x="15" y="14" width="210" height="36" rx="5" fill="none" stroke="${C.cream}" stroke-width="2.4"/>
    <rect x="12" y="11" width="216" height="3" rx="1.5" fill="${C.emeraldLight}" opacity=".6"/>
    ${rivet(22, 32, 3.2, 1.3)}${rivet(218, 32, 3.2, 1.3)}`,
  );
}

/**
 * Install the tiling art as CSS custom properties on the document root, once:
 * --pk-deck, --pk-rail, --pk-parchment, --pk-wood, --pk-corner, --pk-plaque, --pk-stud, --pk-knob.
 * (The names are the engine's; the art is the subway's: maroon enamel, brass, cream enamel.)
 */
let installed = false;
export function installUiArt() {
  if (installed) return;
  installed = true;
  const s = document.documentElement.style;
  const set = (k: string, svg: string) => s.setProperty(k, `url("${uri(svg)}")`);
  set('--pk-deck', deckTile(480, 72));
  set('--pk-rail', railTile());
  set('--pk-parchment', parchmentTile());
  set('--pk-wood', woodTile());
  set('--pk-corner', cornerSvg());
  set('--pk-plaque', plaqueSvg());
  set('--pk-stud', studSvg());
  set('--pk-knob', knobSvg());
  set('--pk-knob-lit', knobSvg(true));
  set('--pk-helm', helmSvg());
  set('--pk-helm-hot', helmSvg(true));
  set('--pk-seal', sealSvg());
}
