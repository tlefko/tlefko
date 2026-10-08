/**
 * Props for Powder Keg Cove (docs/ART.md): the Captain's Wheel (a ship's helm), doubloons and
 * tokens, the win nameboard, the powder-fuse meter parts, the logo scroll and the
 * treasure-chest pop rig. Original SVG in code; no <text> (web fonts are unavailable inside SVG
 * images). Every colour comes from the palette `C` (in-between tones are mixed from it).
 */
import { C, composeSymbol, nextId, f } from './kit';

/* -------------------------------- helpers -------------------------------- */
type Pt = [number, number];
const RAD = Math.PI / 180;

/** Point at radius `r` from (cx, cy), `deg` clockwise from 12 o'clock. */
function pol(cx: number, cy: number, r: number, deg: number): Pt {
  return [cx + Math.sin(deg * RAD) * r, cy - Math.cos(deg * RAD) * r];
}
const P = (p: Pt) => `${f(p[0])} ${f(p[1])}`;

/** An in-between tone of two palette colours, so every colour stays derived from `C`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

type Stop = [number, string, number?];
const st = (s: Stop[]) => s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');
/** Linear gradient in bounding-box units (default top to bottom). */
const lin = (id: string, s: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${st(s)}</linearGradient>`;
/** Linear gradient in user space (follows the transforms of the shape that uses it). */
const linU = (id: string, s: Stop[], x1: number, y1: number, x2: number, y2: number) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}">${st(s)}</linearGradient>`;
const rad = (id: string, s: Stop[], cx = 0.5, cy = 0.5, r = 0.5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${st(s)}</radialGradient>`;
const radU = (id: string, s: Stop[], cx: number, cy: number, r: number) =>
  `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}">${st(s)}</radialGradient>`;
const blur = (id: string, sd: number, pad = 50) =>
  `<filter id="${id}" x="-${pad}%" y="-${pad}%" width="${100 + pad * 2}%" height="${100 + pad * 2}%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const svgDoc = (w: number, h: number, body: string, vb = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${f(w)}" height="${f(h)}">${body}</svg>`;

/** Smooth path through points (Catmull-Rom as cubic Beziers). */
function smooth(pts: Pt[], closed = true): string {
  const n = pts.length;
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    d += ` C${P([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6])} ${P([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6])} ${P(p2)}`;
  }
  return closed ? `${d} Z` : d;
}

/** Ring slice between radii r0 < r1 and angles a0 < a1 (degrees clockwise from 12 o'clock). */
function sector(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${P(pol(cx, cy, r1, a0))} A${r1} ${r1} 0 ${big} 1 ${P(pol(cx, cy, r1, a1))} L${P(pol(cx, cy, r0, a1))} A${r0} ${r0} 0 ${big} 0 ${P(pol(cx, cy, r0, a0))} Z`;
}
/** Pie wedge from the centre. */
const wedge = (cx: number, cy: number, r: number, a0: number, a1: number) =>
  `M${cx} ${cy} L${P(pol(cx, cy, r, a0))} A${r} ${r} 0 0 1 ${P(pol(cx, cy, r, a1))} Z`;
const circ = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)} a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`;
/** Annulus (fill-rule evenodd). */
const annulus = (cx: number, cy: number, r0: number, r1: number) => `${circ(cx, cy, r1)} ${circ(cx, cy, r0)}`;

/** Spiky cartoon burst (blast, spark): n points between radii rIn and rOut. */
function burst(cx: number, cy: number, rIn: number, rOut: number, n: number, rot = 0, jag = 0.18): string {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) pts.push(pol(cx, cy, i % 2 ? rIn : rOut * (1 - jag * (((i / 2) % 3) / 2)), rot + (i * 180) / n));
  return `M${pts.map(P).join(' L')} Z`;
}
/** Four-point glint star. */
const glint = (cx: number, cy: number, r: number) =>
  `M${f(cx)} ${f(cy - r)} C${f(cx + r * 0.12)} ${f(cy - r * 0.12)} ${f(cx + r * 0.12)} ${f(cy - r * 0.12)} ${f(cx + r)} ${f(cy)} C${f(cx + r * 0.12)} ${f(cy + r * 0.12)} ${f(cx + r * 0.12)} ${f(cy + r * 0.12)} ${f(cx)} ${f(cy + r)} C${f(cx - r * 0.12)} ${f(cy + r * 0.12)} ${f(cx - r * 0.12)} ${f(cy + r * 0.12)} ${f(cx - r)} ${f(cy)} C${f(cx - r * 0.12)} ${f(cy - r * 0.12)} ${f(cx - r * 0.12)} ${f(cy - r * 0.12)} ${f(cx)} ${f(cy - r)} Z`;

/** Crescent moon centred on (cx, cy), radius r, horns to the right. */
function crescent(cx: number, cy: number, r: number): string {
  return `M${f(cx + r * 0.2)} ${f(cy - r)} A${f(r)} ${f(r)} 0 1 0 ${f(cx + r * 0.2)} ${f(cy + r)} A${f(r * 0.78)} ${f(r * 0.78)} 0 1 1 ${f(cx + r * 0.2)} ${f(cy - r)} Z`;
}

/* ---------------------------- skull motif --------------------------------- */
/** Cartoon skull outline (cranium + jaw), the proportions of the captain's badge: 40k wide. */
function skullD(cx: number, cy: number, k: number): string {
  const p = (x: number, y: number) => `${f(cx + x * k)} ${f(cy + y * k)}`;
  return `M${p(0, -18)} C${p(13, -18)} ${p(20, -9)} ${p(20, 1)} C${p(20, 9)} ${p(14, 12)} ${p(12, 14)} L${p(12, 20)} L${p(-12, 20)} L${p(-12, 14)} C${p(-14, 12)} ${p(-20, 9)} ${p(-20, 1)} C${p(-20, -9)} ${p(-13, -18)} ${p(0, -18)} Z`;
}
/** Sockets, nose and teeth for `skullD`. */
function skullHoles(cx: number, cy: number, k: number, fill: string = C.ink, teeth = true): string {
  const t = teeth
    ? `<path d="M${f(cx - 6 * k)} ${f(cy + 15 * k)} L${f(cx - 6 * k)} ${f(cy + 20 * k)} M${f(cx)} ${f(cy + 15 * k)} L${f(cx)} ${f(cy + 20 * k)} M${f(cx + 6 * k)} ${f(cy + 15 * k)} L${f(cx + 6 * k)} ${f(cy + 20 * k)}" stroke="${fill}" stroke-width="${f(2.4 * k)}" fill="none"/>`
    : '';
  return `<ellipse cx="${f(cx - 7.5 * k)}" cy="${f(cy + k)}" rx="${f(5.8 * k)}" ry="${f(6.6 * k)}" fill="${fill}"/>
    <ellipse cx="${f(cx + 7.5 * k)}" cy="${f(cy + k)}" rx="${f(5.8 * k)}" ry="${f(6.6 * k)}" fill="${fill}"/>
    <path d="M${f(cx)} ${f(cy + 6 * k)} L${f(cx - 3 * k)} ${f(cy + 11 * k)} L${f(cx + 3 * k)} ${f(cy + 11 * k)} Z" fill="${fill}"/>${t}`;
}
/** Crossed bones behind a skull, drawn as round-capped strokes with knuckle ends. */
function crossbones(cx: number, cy: number, len: number, w: number, fill: string, lw = 3.5): string {
  const pass = (grow: number, col: string) =>
    [40, -40]
      .map((deg) => {
        const [dx, dy] = [Math.sin(deg * RAD) * (len / 2), -Math.cos(deg * RAD) * (len / 2)];
        const [nx, ny] = [-dy / (len / 2), dx / (len / 2)];
        const knob = (x: number, y: number) =>
          [1, -1].map((s) => `<circle cx="${f(x + nx * w * 0.42 * s)}" cy="${f(y + ny * w * 0.42 * s)}" r="${f(w * 0.56 + grow)}" fill="${col}"/>`).join('');
        return `<path d="M${f(cx - dx)} ${f(cy - dy)} L${f(cx + dx)} ${f(cy + dy)}" stroke="${col}" stroke-width="${f(w + grow * 2)}" stroke-linecap="round"/>${knob(cx - dx, cy - dy)}${knob(cx + dx, cy + dy)}`;
      })
      .join('');
  return pass(lw, C.ink) + pass(0, fill);
}
/** One cutlass (hilt at the bottom) rotated `deg` about (cx, cy); `s` = overall length. */
function cutlass(deg: number, cx: number, cy: number, s: number, fill: string, edge: string, lw: number): string {
  const w = lw / s;
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${deg}) scale(${f(s)})" stroke="${edge}" stroke-width="${w.toFixed(4)}" stroke-linejoin="round" fill="${fill}">
    <path d="M-.045 .3 C-.05 .02 -.06 -.3 -.03 -.52 L.055 -.43 C.072 -.18 .062 .08 .045 .3 Z"/>
    <path d="M-.15 .29 Q0 .37 .15 .29 L.15 .345 Q0 .43 -.15 .345 Z"/>
    <path d="M-.036 .38 L.036 .38 L.03 .5 L-.03 .5 Z"/>
    <circle cx="0" cy=".535" r=".045"/>
  </g>`;
}

/* ------------------------------- coins ---------------------------------- */
export type Metal = 'bronze' | 'silver' | 'gold';
const METAL: Record<Metal, [string, string, string]> = {
  bronze: [C.bronzeLight, C.bronze, C.bronzeDeep],
  silver: [C.silverLight, C.silver, C.silverDeep],
  gold: [C.goldLight, C.gold, C.goldDeep],
};

/** Hand-struck doubloon: a slightly uneven cob with a skull over crossed cutlasses. 256 box. */
export function coin(metal: Metal): string {
  const [hi, mid, lo] = METAL[metal];
  const g = nextId('cn');
  const edge = smooth(Array.from({ length: 24 }, (_, i) => pol(128, 128, 101 + Math.sin(i * 2.3) * 2 + Math.cos(i * 1.1) * 1.6, i * 15)));
  const beads = Array.from({ length: 30 }, (_, i) => {
    const p = pol(128, 128, 89, i * 12);
    return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="3.3"/>`;
  }).join('');
  const emblem = (dx: number, dy: number, blade: string, bone: string, edgeCol: string) => `<g transform="translate(${dx} ${dy})">
      ${cutlass(-54, 128, 156, 102, blade, edgeCol, 3)}${cutlass(54, 128, 156, 102, blade, edgeCol, 3)}
      <path d="${skullD(128, 110, 1.68)}" fill="${bone}" stroke="${edgeCol}" stroke-width="3" stroke-linejoin="round"/></g>`;
  return composeSymbol({
    shade: 0.26,
    light: 0.3,
    defs: `${lin(`${g}a`, [[0, hi], [0.45, mid], [1, lo]], 0, 0, 1, 1)}
      ${lin(`${g}b`, [[0, lo], [0.5, mid], [1, hi]], 0, 0, 1, 1)}
      ${lin(`${g}e`, [[0, hi], [0.6, mid], [1, mix(mid, lo, 0.4)]], 0, 0, 1, 1)}`,
    layers: [
      { fills: `<path d="${edge}" fill="url(#${g}a)"/>`, lines: `<path d="${edge}"/>` },
      { fills: `<circle cx="128" cy="128" r="80" fill="url(#${g}b)"/>`, lines: `<circle cx="128" cy="128" r="80" stroke-width="3.5" opacity=".6"/>` },
    ],
    top: `<g fill="${hi}" stroke="${lo}" stroke-width="1.6">${beads}</g>
      ${emblem(3, 4, lo, lo, lo)}
      ${emblem(0, 0, `url(#${g}e)`, `url(#${g}e)`, mix(lo, C.ink, 0.35))}
      ${skullHoles(128, 110, 1.68, lo)}
      <path d="M60 96 Q72 62 110 50" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none" opacity=".7"/>
      <path d="${glint(178, 70, 15)}" fill="#fff" opacity=".9"/>`,
  });
}

/** Small round token left on a spent keg: sea "+", crimson "x", or the gold skull (max). */
export function chip(kind: 'add' | 'mul' | 'max'): string {
  const g = nextId('ch');
  const [hi, mid, lo] = kind === 'add' ? [C.tealLight, C.teal, C.tealDeep] : kind === 'mul' ? [C.crimsonLight, C.crimson, C.crimsonDeep] : [C.goldLight, C.gold, C.goldDeep];
  const inserts = Array.from({ length: 8 }, (_, i) => `<path d="${sector(128, 128, 78, 97, i * 45 - 8, i * 45 + 8)}"/>`).join('');
  const plus = 'M98 116 L116 116 L116 98 L140 98 L140 116 L158 116 L158 140 L140 140 L140 158 L116 158 L116 140 L98 140 Z';
  const glyph =
    kind === 'max'
      ? `<circle cx="128" cy="128" r="58" fill="${C.ink}"/>${crossbones(128, 138, 92, 13, C.white, 3)}<path d="${skullD(128, 120, 1.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>${skullHoles(128, 120, 1.6)}`
      : `<path d="${plus}" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round" ${kind === 'mul' ? 'transform="rotate(45 128 128)"' : ''}/>
         <path d="${plus}" fill="none" stroke="${C.gold}" stroke-width="3" transform="translate(2.5 3.5)${kind === 'mul' ? ' rotate(45 125.5 124.5)' : ''}" opacity=".7"/>`;
  return composeSymbol({
    shade: 0.26,
    light: 0.35,
    defs: rad(g, [[0, hi], [0.55, mid], [1, lo]], 0.38, 0.32, 0.75),
    layers: [{ fills: `<circle cx="128" cy="128" r="97" fill="url(#${g})"/>`, lines: `<circle cx="128" cy="128" r="97"/>` }],
    top: `<g fill="${C.paper}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round">${inserts}</g>
      <circle cx="128" cy="128" r="72" fill="none" stroke="${C.ink}" stroke-width="4"/>
      <circle cx="128" cy="128" r="66" fill="none" stroke="${hi}" stroke-width="3" stroke-dasharray="7 5" opacity=".75"/>
      ${glyph}
      <path d="M62 92 Q74 64 104 52" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity=".55"/>`,
  });
}

/* --------------------------- Captain's Wheel ----------------------------- */
export type SegKind = 'hounds' | 'inferno' | 'boost' | 'cash' | 'bomb';
/**
 * Visual layout of the 12 wheel segments, clockwise from the top. The two KABOOM wedges sit
 * opposite each other (4 and 10), each between a grog and a keg-drop wedge.
 */
export const WHEEL_SEGMENTS: SegKind[] = ['inferno', 'cash', 'hounds', 'boost', 'bomb', 'hounds', 'cash', 'boost', 'hounds', 'cash', 'bomb', 'boost'];

/**
 * Helm geometry in the 512 viewBox (centre 256,256); the renderer places its sprites from it.
 * Rotating texture: 8 turned handles, the wooden rim with brass caps and 16 lamps, the painted
 * dial and the brass hub ring. Static on top: rim light + dial sheen, the skull medallion and
 * the pointer.
 */
export const HELM = {
  tip: 252.5,
  rimO: 210,
  rimI: 187,
  dial: 182,
  /** Brass band between the dial and the rim (inner radius). */
  band: 175,
  hub: 50,
  iconR: 123,
  lampR: 198.5,
  /** Lamp angles (degrees clockwise from the top), two between each pair of handles. */
  lamps: Array.from({ length: 16 }, (_, i) => Math.floor(i / 2) * 45 + (i % 2 ? 30 : 15)),
  /** Pointer pivot and tip radii. */
  ptrPivot: 240,
  ptrTip: 170,
};
const WC = 256;

/** Silhouette of one turned handle pointing straight up (its base hides under the rim). */
function handleOutline(): string {
  const prof: [number, number][] = [[194, 9.8], [209, 9.8], [216.5, 7.8], [219.6, 7.4], [223, 11.2], [226.4, 7.4], [230, 8.8], [238, 13.6], [245, 12.6], [250.4, 7.6]];
  const left = prof.map(([r, w]): Pt => [WC - w, WC - r]);
  const right = [...prof].reverse().map(([r, w]): Pt => [WC + w, WC - r]);
  return smooth([...left, [WC, WC - HELM.tip], ...right]);
}

/** Inset outline of a dial wedge (pinstripe), `e` units inside its edges. */
function insetWedge(r: number, a0: number, a1: number, e: number, rIn: number): string {
  const side = (deg: number, s: number, R: number): Pt => {
    const t = Math.sqrt(Math.max(0, R * R - e * e));
    return [WC + Math.sin(deg * RAD) * t + Math.cos(deg * RAD) * e * s, WC - Math.cos(deg * RAD) * t + Math.sin(deg * RAD) * e * s];
  };
  const R = r - e;
  return `M${P(side(a0, 1, R))} A${R} ${R} 0 0 1 ${P(side(a1, -1, R))} L${P(side(a1, -1, rIn))} A${rIn} ${rIn} 0 0 0 ${P(side(a0, 1, rIn))} Z`;
}

/* Segment icons, drawn in a 100-unit box centred on (0,0) with "up" pointing at the rim. */
const ICON_LW = 4.6;

/** KEG DROP: a powder keg with a lit fuse. */
function iconKeg(g: string): string {
  const barrel = 'M-26 -34 C-32 -16 -34 6 -30 26 C-27 36 -15 43 0 43 C15 43 27 36 30 26 C34 6 32 -16 26 -34 C17 -28 -17 -28 -26 -34 Z';
  const hoop = (y0: number, x0: number, y1: number, x1: number) => `M${-x0} ${y0} Q0 ${y0 + 8} ${x0} ${y0} L${x1} ${y1} Q0 ${y1 + 8} ${-x1} ${y1} Z`;
  const hoops = `${hoop(-25, 29.2, -18, 30.8)} ${hoop(18, 31.6, 25, 30.2)}`;
  const fuse = 'M8 -36 C16 -41 7 -46 13 -52';
  return `<path d="${barrel}" fill="url(#${g}kw)" stroke="${C.ink}" stroke-width="${ICON_LW}" stroke-linejoin="round"/>
    <path d="M-11 -27 Q-13 6 -11 40 M11 -27 Q13 6 11 40" stroke="${C.ink}" stroke-width="2" fill="none" opacity=".3"/>
    <path d="${hoops}" fill="url(#${g}kh)" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="${skullD(0, 1, 0.6)}" fill="${C.crimson}"/>${skullHoles(0, 1, 0.6, mix(C.wood, C.woodMid, 0.35), false)}
    <ellipse cx="0" cy="-34" rx="26" ry="7" fill="url(#${g}kl)" stroke="${C.ink}" stroke-width="3.6"/>
    <path d="M-19 -12 Q-22 6 -18 21" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round" opacity=".4"/>
    <path d="${fuse}" stroke="${C.ink}" stroke-width="7.5" fill="none" stroke-linecap="round"/>
    <path d="${fuse}" stroke="${C.paperWarm}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="${burst(14, -55, 5.5, 13, 8, 8)}" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${burst(14, -55, 2.6, 6.5, 8, 8, 0)}" fill="${C.fireCore}"/>`;
}

/** BROADSIDE: a ship's cannon on its carriage, firing. */
function iconCannon(g: string): string {
  const barrel = 'M-22 -11 C-28 -11 -31 -6 -31 0 C-31 6 -28 11 -22 11 L14 7.5 L14 -7.5 Z';
  const muzzle = 'M12 -10 L22 -10 Q25 -10 25 -6.5 L25 6.5 Q25 10 22 10 L12 10 Z';
  const band = 'M-14 -11.4 L-8 -11 L-8 11 L-14 11.4 Z';
  return `<path d="${burst(9, -28, 11, 25, 9, 14, 0.22)}" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="${burst(8, -26, 5.5, 14, 9, 34, 0.1)}" fill="${C.fireCore}"/>
    <g stroke="${C.ink}" stroke-width="${ICON_LW}" stroke-linejoin="round">
      <path d="M-22 22 L14 22 L10 34 L-19 34 Z" fill="url(#${g}cw)"/>
      <circle cx="-12" cy="37" r="6.5" fill="${C.woodDark}"/><circle cx="4" cy="37" r="6.5" fill="${C.woodDark}"/>
      <g transform="translate(-4 13) rotate(-72)">
        <circle cx="-34" cy="0" r="5" fill="${C.inkSoft}"/>
        <path d="${barrel}" fill="url(#${g}ir)"/>
        <path d="${band}" fill="${C.inkSoft}" stroke-width="2.4"/>
        <path d="${muzzle}" fill="url(#${g}ir)"/>
        <path d="M-22 -5.5 L10 -4" stroke="${C.steelLight}" stroke-width="2.6" stroke-linecap="round" opacity=".6"/>
      </g>
    </g>
    <circle cx="-12" cy="37" r="2.4" fill="${C.gold}"/><circle cx="4" cy="37" r="2.4" fill="${C.gold}"/>
    <circle cx="-19" cy="-34" r="6.5" fill="${C.paperWarm}" stroke="${C.ink}" stroke-width="2.8"/>
    <circle cx="33" cy="-12" r="5.5" fill="${C.paperWarm}" stroke="${C.ink}" stroke-width="2.6"/>
    <circle cx="-10" cy="-50" r="2.6" fill="${C.fireCore}"/><circle cx="30" cy="-44" r="2.4" fill="${C.fireCore}"/>`;
}

/** GROG: a pewter tankard, foam running over. */
function iconTankard(g: string): string {
  const handle = 'M12 -2 C31 -3 32 24 13 25';
  const body = 'M-25 -12 L13 -12 L14 34 Q14 40 8 40 L-20 40 Q-26 40 -26 34 Z';
  const foam = smooth([
    [-30, -9], [-33, -21], [-26, -33], [-14, -39], [-4, -45], [8, -40], [18, -33], [22, -20], [17, -9], [9, -6], [0, -9], [-9, -5], [-18, -8], [-25, -5],
  ]);
  return `<path d="${handle}" stroke="${C.ink}" stroke-width="13" fill="none" stroke-linecap="round"/>
    <path d="${handle}" stroke="url(#${g}pw)" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path d="${body}" fill="url(#${g}pw)" stroke="${C.ink}" stroke-width="${ICON_LW}" stroke-linejoin="round"/>
    <path d="M-25.4 -4 L13.3 -4 L13.5 2 L-25.6 2 Z M-26 24 L14 24 L14 30 L-26 30 Z" fill="${C.steelDeep}" stroke="${C.ink}" stroke-width="2.2"/>
    <path d="M-17 7 L-16.4 20" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity=".6"/>
    <path d="${foam}" fill="url(#${g}fo)" stroke="${C.ink}" stroke-width="${ICON_LW}" stroke-linejoin="round"/>
    <path d="M-20 -7 Q-23 5 -19 10 Q-15 5 -16 -7 Z" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
    <circle cx="-10" cy="-24" r="3.6" fill="none" stroke="${C.paperWarm}" stroke-width="2"/><circle cx="6" cy="-28" r="2.6" fill="none" stroke="${C.paperWarm}" stroke-width="1.8"/>
    <path d="M-21 -27 Q-13 -37 -2 -38" stroke="#fff" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
}

/** DOUBLOONS: a gold skull doubloon. */
function iconDoubloon(g: string): string {
  return `<circle cx="0" cy="-4" r="34" fill="url(#${g}co)" stroke="${C.ink}" stroke-width="${ICON_LW}"/>
    <circle cx="0" cy="-4" r="26" fill="none" stroke="${C.goldDeep}" stroke-width="2.6"/>
    <path d="${skullD(1.4, -2.2, 1)}" fill="${C.goldDeep}"/>
    <path d="${skullD(0, -3.6, 1)}" fill="${C.goldLight}" stroke="${C.goldDeep}" stroke-width="1.6"/>${skullHoles(0, -3.6, 1, C.goldDeep)}
    <path d="M-23 -19 Q-15 -32 -2 -35" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="${glint(24, -30, 10)}" fill="#fff"/>`;
}

/** KABOOM: Cap'n Kaboom's round iron bomb, a white skull stencil and a fizzing fuse. */
function iconBomb(g: string): string {
  const fuse = 'M3 -34 C5 -42 14 -42 13 -50 C12 -56 18 -58 21 -56';
  return `<ellipse cx="3" cy="40" rx="26" ry="5" fill="${C.ink}" opacity=".35"/>
    <circle cx="0" cy="8" r="31" fill="url(#${g}bb)" stroke="${C.ink}" stroke-width="${ICON_LW}"/>
    <path d="M22 -12 A31 31 0 0 1 28 22" stroke="${C.moonGlow}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="${skullD(0, 10, 0.62)}" fill="${C.paper}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>${skullHoles(0, 10, 0.62, C.ink, false)}
    <path d="M-20 -8 Q-16 -18 -6 -21" stroke="#fff" stroke-width="4.2" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M-7 -30 L7 -30 L8 -21 Q0 -18 -8 -21 Z" fill="url(#${g}kh)" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/>
    <ellipse cx="0" cy="-30" rx="7" ry="2.6" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="2.4"/>
    <path d="${fuse}" stroke="${C.ink}" stroke-width="7.5" fill="none" stroke-linecap="round"/>
    <path d="${fuse}" stroke="${C.paperWarm}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="${burst(22, -57, 5.5, 13.5, 8, 12)}" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="${burst(22, -57, 2.6, 6.8, 8, 12, 0)}" fill="${C.fireCore}"/>
    <circle cx="33" cy="-44" r="2.4" fill="${C.fireCore}"/><circle cx="10" cy="-64" r="2" fill="${C.fireCore}"/>`;
}

/** Per-kind icon scale and centre radius (icons are fitted to the 30-degree wedge). */
const ICON_FIT: Record<SegKind, [number, number]> = { hounds: [0.78, 122], inferno: [0.8, 124], boost: [0.78, 122], cash: [0.78, 124], bomb: [0.8, 118] };
/** A segment icon's scale and centre radius on the dial (512 box), for the icon that lifts off it. */
export const wheelIconFit = (kind: SegKind): [number, number] => ICON_FIT[kind];
/** wheelIcon() draws the icon's 100-unit box at this size in its 128 box. */
export const WHEEL_ICON_BOX = 102;

function iconArt(kind: SegKind, g: string): string {
  return kind === 'hounds' ? iconKeg(g) : kind === 'inferno' ? iconCannon(g) : kind === 'boost' ? iconTankard(g) : kind === 'bomb' ? iconBomb(g) : iconDoubloon(g);
}

function helmIcon(kind: SegKind, g: string, deg: number): string {
  const [s, r] = ICON_FIT[kind];
  const [cx, cy] = pol(WC, WC, r, deg);
  return `<g transform="translate(${f(cx)} ${f(cy)}) rotate(${deg}) scale(${s})">${iconArt(kind, g)}</g>`;
}

/** Gradients the segment icons use (ids prefixed with `g`). */
function iconDefs(g: string): string {
  return `${lin(`${g}kw`, [[0, C.woodMid], [0.3, C.woodLight], [0.62, C.wood], [1, C.woodDark]], 0, 0, 1, 0)}
    ${lin(`${g}kh`, [[0, C.goldLight], [0.5, C.gold], [1, C.goldDeep]])}
    ${rad(`${g}kl`, [[0, mix(C.woodLight, C.wood, 0.3)], [1, C.woodMid]], 0.45, 0.4, 0.6)}
    ${lin(`${g}ir`, [[0, C.steelDeep], [0.35, mix(C.steelDeep, C.inkSoft, 0.4)], [1, C.ink]])}
    ${lin(`${g}cw`, [[0, C.wood], [1, C.woodDark]])}
    ${lin(`${g}pw`, [[0, C.steelDeep], [0.3, C.steelLight], [0.62, C.steel], [1, C.steelDeep]], 0, 0, 1, 0)}
    ${lin(`${g}fo`, [[0, C.white], [0.7, C.white], [1, C.paperWarm]])}
    ${lin(`${g}co`, [[0, C.goldLight], [0.5, C.gold], [1, C.goldDeep]], 0, 0, 1, 1)}
    ${rad(`${g}bb`, [[0, mix(C.steelDeep, C.navyLight, 0.35)], [0.45, mix(C.navy, C.inkSoft, 0.55)], [1, C.ink]], 0.34, 0.3, 0.8)}`;
}

/**
 * One segment icon on its own (upright, 128 box), for the icon that lifts off the helm when it
 * lands. Same drawing as the painted dial, so the pop starts as the very same icon.
 */
export function wheelIcon(kind: SegKind): string {
  const g = nextId('wi');
  return svgDoc(128, 128, `<defs>${iconDefs(g)}</defs><g transform="translate(64 66) scale(${WHEEL_ICON_BOX / 100})">${iconArt(kind, g)}</g>`);
}

/** Wheel face (rotates): handles, rim, lamps, painted dial, icons, hub ring. 512 viewBox. */
export function wheelFace(): string {
  const g = nextId('wf');
  const n = WHEEL_SEGMENTS.length;
  const seg = 360 / n;
  const tone = (i: number) => (WHEEL_SEGMENTS[i] === 'inferno' ? 'hot' : WHEEL_SEGMENTS[i] === 'bomb' ? 'bomb' : i % 2 ? 'teal' : 'red');
  const out = handleOutline();
  const defs = `
    ${linU(`${g}hd`, [[0, C.woodDark], [0.2, C.wood], [0.4, C.woodLight], [0.62, C.wood], [1, C.woodDeep]], WC - 13.6, 0, WC + 13.6, 0)}
    ${linU(`${g}fe`, [[0, C.goldDeep], [0.3, C.goldLight], [0.6, C.gold], [1, C.goldDeep]], WC - 11.8, 0, WC + 11.8, 0)}
    ${radU(`${g}rm`, [[HELM.rimI / HELM.rimO, C.woodDark], [0.9, C.wood], [0.935, C.woodLight], [0.967, C.wood], [1, C.woodMid]], WC, WC, HELM.rimO)}
    ${radU(`${g}cp`, [[HELM.rimI / HELM.rimO, C.goldDeep], [0.92, C.gold], [0.945, C.goldLight], [0.975, C.gold], [1, C.goldDeep]], WC, WC, HELM.rimO)}
    ${radU(`${g}bd`, [[HELM.band / (HELM.rimI + 1), C.goldDeep], [0.962, C.goldLight], [0.985, C.gold], [1, C.goldDeep]], WC, WC, HELM.rimI + 1)}
    ${radU(`${g}hr`, [[44 / 62, C.goldDeep], [0.84, C.gold], [0.91, C.goldLight], [1, C.goldDeep]], WC, WC, 62)}
    ${rad(`${g}bz`, [[0, C.goldLight], [0.55, C.gold], [1, C.goldDeep]], 0.38, 0.34, 0.7)}
    ${rad(`${g}gl`, [[0, mix(C.fireHot, C.woodDark, 0.25)], [0.65, mix(C.fire, C.woodDeep, 0.45)], [1, mix(C.ember, C.ink, 0.4)]], 0.4, 0.38, 0.65)}
    ${radU(`${g}teal`, [[0, mix(C.tealDeep, C.ink, 0.5)], [0.5, mix(C.tealDeep, C.seaDeep, 0.35)], [1, mix(C.sea, C.tealDeep, 0.3)]], WC, WC, HELM.dial)}
    ${radU(`${g}red`, [[0, mix(C.crimsonDeep, C.ink, 0.55)], [0.5, C.crimsonDeep], [1, mix(C.crimson, C.crimsonDeep, 0.45)]], WC, WC, HELM.dial)}
    ${radU(`${g}hot`, [[0, mix(C.fireDeep, C.ember, 0.25)], [0.4, mix(C.ember, C.crimsonDeep, 0.3)], [1, mix(C.ember, C.ink, 0.6)]], WC, WC - HELM.iconR - 6, 112)}
    ${radU(`${g}bomb`, [[0, C.fireHot], [0.3, mix(C.fireHot, C.fire, 0.55)], [0.62, mix(C.fire, C.fireDeep, 0.5)], [1, mix(C.fireDeep, C.ember, 0.45)]], WC, WC - HELM.iconR + 4, 132)}
    ${rad(`${g}sp_teal`, [[0, C.seaLight, 0.34], [1, C.seaLight, 0]])}
    ${rad(`${g}sp_red`, [[0, C.crimsonLight, 0.3], [1, C.crimsonLight, 0]])}
    ${rad(`${g}sp_hot`, [[0, C.fireHot, 0.55], [1, C.fireHot, 0]])}
    ${rad(`${g}sp_bomb`, [[0, C.fireCore, 0.55], [0.5, C.fireHot, 0.2], [1, C.fireHot, 0]])}
    ${iconDefs(g)}`;

  const handles = Array.from(
    { length: 8 },
    (_, k) => `<g transform="rotate(${k * 45} ${WC} ${WC})">
      <path d="${out}" fill="url(#${g}hd)" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>
      <path d="M${WC - 7.4} ${WC - 219.6} L${WC + 7.4} ${WC - 219.6} M${WC - 7.4} ${WC - 226.4} L${WC + 7.4} ${WC - 226.4}" stroke="${C.ink}" stroke-width="2.2" opacity=".7"/>
      <path d="M${WC - 5} ${WC - 233} L${WC - 5.8} ${WC - 246}" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".5"/></g>`,
  ).join('');
  const collars = Array.from(
    { length: 8 },
    (_, k) => `<path d="M${WC - 11.8} ${WC - 217} L${WC + 11.8} ${WC - 217} L${WC + 11.8} ${WC - 208} L${WC - 11.8} ${WC - 208} Z" transform="rotate(${k * 45} ${WC} ${WC})" fill="url(#${g}fe)" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>`,
  ).join('');

  // wooden rim: rounded by a concentric gradient (so it reads the same at any angle), grain arcs
  const grain = Array.from({ length: 26 }, (_, i) => {
    const r = HELM.rimI + 4.5 + ((i * 7) % 5) * 3.9;
    const a0 = (i * 53) % 360;
    const len = 16 + ((i * 29) % 34);
    return `<path d="M${P(pol(WC, WC, r, a0))} A${r} ${r} 0 0 1 ${P(pol(WC, WC, r, a0 + len))}"/>`;
  }).join('');
  const joints = Array.from({ length: 8 }, (_, k) => `<path d="M${P(pol(WC, WC, HELM.rimI + 1, k * 45 + 22.5))} L${P(pol(WC, WC, HELM.rimO - 1, k * 45 + 22.5))}"/>`).join('');
  const caps = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45;
    const rv = [-3.1, 3.1].map((d) => {
      const p = pol(WC, WC, (HELM.rimI + HELM.rimO) / 2, a + d);
      return `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.5" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.5"/>`;
    });
    return `<path d="${sector(WC, WC, HELM.rimI + 2, HELM.rimO - 2, a - 6, a + 6)}" fill="url(#${g}cp)" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/>${rv.join('')}`;
  }).join('');
  const lamps = HELM.lamps
    .map((a) => {
      const [x, y] = pol(WC, WC, HELM.lampR, a);
      return `<circle cx="${f(x)}" cy="${f(y)}" r="8.4" fill="url(#${g}bz)" stroke="${C.ink}" stroke-width="2.8"/>
        <circle cx="${f(x)}" cy="${f(y)}" r="5.1" fill="url(#${g}gl)" stroke="${C.ink}" stroke-width="1.4"/>
        <circle cx="${f(x - 1.8)}" cy="${f(y - 1.8)}" r="1.5" fill="#fff" opacity=".75"/>`;
    })
    .join('');
  const rim = `<path d="${annulus(WC, WC, HELM.rimI, HELM.rimO)}" fill-rule="evenodd" fill="url(#${g}rm)"/>
    <g fill="none" stroke="${C.woodDeep}" stroke-width="1.7" opacity=".38" stroke-linecap="round">${grain}</g>
    <g stroke="${C.ink}" stroke-width="2.4" opacity=".65">${joints}</g>
    <circle cx="${WC}" cy="${WC}" r="${HELM.rimO}" fill="none" stroke="${C.ink}" stroke-width="6.5"/>
    ${caps}${lamps}`;

  // painted dial
  // each wedge is drawn at 12 o'clock and turned into place, so user-space gradients centred on
  // the top wedge's icon (the hot and bomb tones) follow every wedge of that tone
  const wedges = WHEEL_SEGMENTS.map((_, i) => `<path d="${wedge(WC, WC, HELM.dial, -seg / 2, seg / 2)}" transform="rotate(${f(i * seg)} ${WC} ${WC})" fill="url(#${g}${tone(i)})"/>`).join('');
  const spots = WHEEL_SEGMENTS.map((_, i) => {
    const [x, y] = pol(WC, WC, HELM.iconR + 2, i * seg);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${tone(i) === 'hot' || tone(i) === 'bomb' ? 58 : 46}" fill="url(#${g}sp_${tone(i)})"/>`;
  }).join('');
  const pin = { teal: [C.tealLight, 0.34], red: [C.crimsonLight, 0.32], hot: [C.gold, 1], bomb: [C.goldLight, 1] } as const;
  const stripes = WHEEL_SEGMENTS.map((_, i) => {
    const [col, op] = pin[tone(i)];
    const hot = tone(i) === 'hot' || tone(i) === 'bomb';
    const d = insetWedge(HELM.band - 1, i * seg - seg / 2, i * seg + seg / 2, hot ? 8 : 7.5, 68);
    return hot
      ? `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="6"/><path d="${d}" fill="none" stroke="${col}" stroke-width="3.2"/><path d="${insetWedge(HELM.band - 1, i * seg - seg / 2, i * seg + seg / 2, 14, 74)}" fill="none" stroke="${C.goldLight}" stroke-width="1.4" opacity=".7"/>`
      : `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" opacity="${op}"/>`;
  }).join('');
  const sepD = WHEEL_SEGMENTS.map((_, i) => `M${P(pol(WC, WC, 58, i * seg + seg / 2))} L${P(pol(WC, WC, HELM.dial - 1, i * seg + seg / 2))}`).join(' ');
  const pegs = WHEEL_SEGMENTS.map((_, i) => {
    const [x, y] = pol(WC, WC, HELM.band - 10, i * seg + seg / 2);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="6.3" fill="url(#${g}bz)" stroke="${C.ink}" stroke-width="2.8"/><circle cx="${f(x - 1.6)}" cy="${f(y - 1.8)}" r="1.6" fill="#fff" opacity=".8"/>`;
  }).join('');
  const hotSparks = [-9, 9]
    .map((d) => {
      const [x, y] = pol(WC, WC, HELM.band - 24, d * 1.05);
      return `<path d="${glint(x, y, 6)}" fill="${C.fireCore}" opacity=".9"/>`;
    })
    .join('');
  const icons = WHEEL_SEGMENTS.map((kind, i) => helmIcon(kind, g, i * seg)).join('');
  const hubBolts = Array.from({ length: 8 }, (_, k) => {
    const [x, y] = pol(WC, WC, 55, k * 45);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="3.4" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.6"/>`;
  }).join('');

  return svgDoc(
    512,
    512,
    `<defs>${defs}</defs>
    ${handles}
    ${rim}
    ${collars}
    ${wedges}${spots}${stripes}
    <path d="${sepD}" stroke="${C.ink}" stroke-width="8.5" fill="none"/>
    <path d="${sepD}" stroke="${C.gold}" stroke-width="4.2" fill="none"/>
    <path d="${sepD}" stroke="${C.goldLight}" stroke-width="1.3" fill="none" opacity=".8"/>
    ${hotSparks}
    <path d="${annulus(WC, WC, HELM.band, HELM.rimI + 1)}" fill-rule="evenodd" fill="url(#${g}bd)"/>
    <circle cx="${WC}" cy="${WC}" r="${HELM.band}" fill="none" stroke="${C.ink}" stroke-width="3.2"/>
    <circle cx="${WC}" cy="${WC}" r="${HELM.rimI}" fill="none" stroke="${C.ink}" stroke-width="5"/>
    ${pegs}
    ${icons}
    <path d="${annulus(WC, WC, 44, 62)}" fill-rule="evenodd" fill="url(#${g}hr)"/>
    <circle cx="${WC}" cy="${WC}" r="62" fill="none" stroke="${C.ink}" stroke-width="4.5"/>
    ${hubBolts}`,
  );
}

/**
 * Static light over the turning helm (does not rotate): moonlit rim shading, a lacquer sheen on
 * the dial and a cool rim light, so the lighting stays put while the wood spins. 512 viewBox.
 */
export function wheelRim(): string {
  const g = nextId('wr');
  const glossD = `${sector(WC, WC, 146, 162, 284, 346)}`;
  return svgDoc(
    512,
    512,
    `<defs>
      <clipPath id="${g}c"><circle cx="${WC}" cy="${WC}" r="${HELM.dial - 7}"/></clipPath>
      ${radU(`${g}hl`, [[0, '#ffffff', 0.2], [1, '#ffffff', 0]], 196, 176, 180)}
      ${radU(`${g}vg`, [[0.55, C.ink, 0], [1, C.ink, 0.42]], 232, 226, 200)}
      ${linU(`${g}rl`, [[0, '#ffffff', 0.32], [0.42, '#ffffff', 0], [0.58, C.ink, 0], [1, C.ink, 0.45]], 96, 96, 416, 416)}
      ${blur(`${g}b`, 2.5)}
    </defs>
    <g clip-path="url(#${g}c)">
      <circle cx="${WC}" cy="${WC}" r="${HELM.dial}" fill="url(#${g}vg)"/>
      <ellipse cx="196" cy="176" rx="176" ry="140" fill="url(#${g}hl)"/>
    </g>
    <path d="${glossD}" fill="#fff" opacity=".13" filter="url(#${g}b)"/>
    <path d="${annulus(WC, WC, HELM.rimI, HELM.rimO)}" fill-rule="evenodd" fill="url(#${g}rl)"/>
    <path d="M${P(pol(WC, WC, HELM.rimO - 3.5, 18))} A${HELM.rimO - 3.5} ${HELM.rimO - 3.5} 0 0 1 ${P(pol(WC, WC, HELM.rimO - 3.5, 78))}" stroke="${C.seaFoam}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M${P(pol(WC, WC, HELM.rimI + 4, 290))} A${HELM.rimI + 4} ${HELM.rimI + 4} 0 0 1 ${P(pol(WC, WC, HELM.rimI + 4, 340))}" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".35"/>`,
  );
}

/** Soft cast shadow of the helm's silhouette (rotated with the face, offset down). 512 viewBox. */
export function wheelShadow(): string {
  const g = nextId('wsh');
  const out = handleOutline();
  const hs = Array.from({ length: 8 }, (_, k) => `<path d="${out}" transform="rotate(${k * 45} ${WC} ${WC})"/>`).join('');
  return svgDoc(512, 512, `<defs>${blur(g, 6, 12)}</defs><g filter="url(#${g})" fill="${C.ink}"><g transform="translate(${WC} ${WC}) scale(.95) translate(-${WC} -${WC})">${hs}<circle cx="${WC}" cy="${WC}" r="${HELM.rimO}"/></g></g>`);
}

/** Glowing outline of the landed segment (added over the face at the winning angle). 512 viewBox. */
export function wheelWinMark(): string {
  const g = nextId('ww');
  const d = sector(WC, WC, HELM.hub + 16, HELM.band - 1, -15, 15);
  return svgDoc(
    512,
    512,
    `<defs>${blur(g, 8)}${radU(`${g}f`, [[0.25, C.goldLight, 0.05], [1, C.goldLight, 0.55]], WC, WC, HELM.band)}</defs>
    <path d="${d}" fill="none" stroke="${C.fireHot}" stroke-width="20" filter="url(#${g})"/>
    <path d="${d}" fill="url(#${g}f)"/>
    <path d="${d}" fill="none" stroke="${C.goldLight}" stroke-width="5" stroke-linejoin="round"/>`,
  );
}

/** Shade over every segment but the landed one (turned to the winning angle), so the result pops. */
export function wheelDim(): string {
  const r = HELM.band;
  return svgDoc(512, 512, `<path d="${circ(WC, WC, r)} ${sector(WC, WC, HELM.hub + 12, r + 1, -15, 15)}" fill-rule="evenodd" fill="${C.nightDeep}"/>`);
}

/** Lamp glow (placed over each rim lamp, animated, additive). */
export function bulbGlow(color: string = C.fireHot): string {
  const g = nextId('bg');
  return svgDoc(
    64,
    64,
    `<defs>${rad(g, [[0, C.fireCore], [0.2, color], [0.5, color, 0.32], [1, color, 0]])}</defs>
    <circle cx="32" cy="32" r="32" fill="url(#${g})"/>
    <path d="${glint(32, 32, 17)}" fill="${C.fireCore}" opacity=".8"/>`,
  );
}

/** Radius of the medallion's brass bezel in its 256 box (the renderer maps it onto HELM.hub). */
export const HUB_BEZEL = 116;

/** Hub medallion (stays upright): brass bezel, black enamel, the Jolly Roger. 256 box. */
export function wheelHub(): string {
  const g = nextId('wh');
  const rivets = Array.from({ length: 10 }, (_, i) => {
    const [x, y] = pol(128, 128, 105.5, i * 36 + 18);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="4.4" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.2"/>`;
  }).join('');
  return composeSymbol({
    shade: 0.3,
    light: 0.45,
    defs: `${rad(`${g}b`, [[0, C.goldLight], [0.55, C.gold], [1, C.goldDeep]], 0.36, 0.3, 0.78)}
      ${rad(`${g}e`, [[0, mix(C.night, C.ink, 0.25)], [1, C.ink]], 0.4, 0.34, 0.7)}`,
    layers: [
      { fills: `<circle cx="128" cy="128" r="${HUB_BEZEL}" fill="url(#${g}b)"/>`, lines: `<circle cx="128" cy="128" r="${HUB_BEZEL}"/>` },
      { fills: `<circle cx="128" cy="128" r="93" fill="url(#${g}e)"/>`, lines: `<circle cx="128" cy="128" r="93" stroke-width="6"/>` },
    ],
    top: `${rivets}
      ${crossbones(128, 142, 132, 19, C.white, 4)}
      <path d="${skullD(128, 116, 2.35)}" fill="${C.white}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
      ${skullHoles(128, 116, 2.35)}
      <path d="M90 102 Q96 82 116 76" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>
      <path d="${sector(128, 128, 78, 86, 290, 340)}" fill="#fff" opacity=".22"/>`,
  });
}

/** Pointer pivot in its 128 box (the renderer anchors here). */
export const POINTER_PIVOT: Pt = [64, 21];
/** Pointer tip in its 128 box. */
export const POINTER_TIP: Pt = [64, 116];

/** Pointer: a brass anchor fluke with a crimson inlay, hung from a pivot bolt. 128 box. */
export function wheelPointer(): string {
  const g = nextId('wp');
  const fluke = 'M64 116 L40 74 L47 70 L55 76 L64 66 L73 76 L81 70 L88 74 Z';
  const inlay = 'M64 104 L53.5 83 L64 77.5 L74.5 83 Z';
  const neck = 'M58.5 28 L69.5 28 L68 68 L60 68 Z';
  return composeSymbol({
    size: 128,
    lw: 5,
    shade: 0.3,
    light: 0.5,
    defs: lin(`${g}m`, [[0, C.goldLight], [0.45, C.gold], [1, C.goldDeep]], 0, 0, 1, 1),
    layers: [
      { fills: `<path d="${neck}" fill="url(#${g}m)"/>`, lines: `<path d="${neck}"/>` },
      { fills: `<path d="${fluke}" fill="url(#${g}m)"/>`, lines: `<path d="${fluke}"/>` },
      { fills: `<circle cx="64" cy="21" r="15" fill="url(#${g}m)"/>`, lines: `<circle cx="64" cy="21" r="15"/>` },
    ],
    top: `<path d="${inlay}" fill="${C.goldDeep}" opacity=".55"/>
      <circle cx="64" cy="86" r="7.5" fill="${C.crimson}" stroke="${C.ink}" stroke-width="2.6"/>
      <circle cx="61.8" cy="83.6" r="2.4" fill="${C.crimsonLight}"/>
      <circle cx="64" cy="21" r="6.2" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="2.6"/>
      <path d="M60 21 L68 21" stroke="${C.ink}" stroke-width="2.2"/>
      <path d="M47 78 L57 95" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".6"/>
      <path d="M55 13 Q59 9 64 9" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>`,
  });
}

/* ------------------------------ Win nameboard ----------------------------- */
function boardGeom(aspect: number) {
  const H = 200;
  const W = Math.max(640, Math.round(H * aspect));
  const bx0 = 60;
  const bx1 = W - 60;
  const px0 = bx0 + 74;
  const px1 = bx1 - 74;
  return { H, W, bx0, bx1, by0: 22, by1: 178, px0, px1, py0: 40, py1: 160, rimW: 11 };
}

/** The nameboard's display window as fractions of the frame (centre and inner size), for the text. */
export function winBarWindow(aspect = 5): { cx: number; cy: number; w: number; h: number } {
  const b = boardGeom(aspect);
  return { cx: 0.5, cy: (b.py0 + b.py1) / 2 / b.H, w: (b.px1 - b.px0 - 2 * b.rimW) / b.W, h: (b.py1 - b.py0 - 2 * b.rimW) / b.H };
}

/** Archimedean spiral groove for a carved volute. */
function spiralD(cx: number, cy: number, r: number, turns = 1.6, dir = 1): string {
  const pts: Pt[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = dir * t * turns * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r * (0.12 + 0.88 * t), cy + Math.sin(a) * r * (0.12 + 0.88 * t)]);
  }
  return smooth(pts, false);
}

/** Hemp rope lashed round a board end: three slanted turns, centred on x. */
function lashing(x: number, y0: number, y1: number, g: string): string {
  return [-11, 0, 11]
    .map((dx) => {
      const cx = x + dx;
      const w = 10.5;
      const strand = `M${f(cx - w / 2 + 3)} ${y0} L${f(cx + w / 2 + 3)} ${y0} Q${f(cx + w / 2 + 5)} ${y0 + 4} ${f(cx + w / 2 + 3)} ${y0 + 8} L${f(cx + w / 2 - 3)} ${y1 - 8} Q${f(cx + w / 2 - 5)} ${y1 - 4} ${f(cx + w / 2 - 3)} ${y1} L${f(cx - w / 2 - 3)} ${y1} Q${f(cx - w / 2 - 1)} ${y1 - 4} ${f(cx - w / 2 - 3)} ${y1 - 8} L${f(cx - w / 2 + 3)} ${y0 + 8} Q${f(cx - w / 2 + 1)} ${y0 + 4} ${f(cx - w / 2 + 3)} ${y0} Z`;
      let ticks = '';
      for (let y = y0 + 6; y < y1 - 4; y += 7.5) {
        const k = (y - y0) / (y1 - y0);
        const xx = cx + 3 - 6 * k;
        ticks += `M${f(xx - 4.4)} ${f(y)} Q${f(xx)} ${f(y + 1)} ${f(xx + 4.4)} ${f(y + 5)} `;
      }
      return `<path d="${strand}" fill="url(#${g}rp)" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/><path d="${ticks}" stroke="${C.woodMid}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    })
    .join('');
}

/**
 * Win plaque: a ship's carved oak nameboard with gilded volute ends, hemp lashings, brass nails,
 * a moon crest, and one long brass-rimmed display window for the total. viewBox height 200,
 * width 200 * aspect (pass the on-screen aspect so the art is never stretched).
 */
export function winBarFrame(aspect = 5): string {
  const b = boardGeom(aspect);
  const { W, H } = b;
  const g = nextId('wb');
  const spine = 'M44 48 C30 66 14 84 14 100 C14 116 30 134 44 152';
  const end = `<path d="${spine}" stroke="${C.ink}" stroke-width="27" fill="none" stroke-linecap="round"/>
      <path d="${spine}" stroke="url(#${g}gb)" stroke-width="17" fill="none" stroke-linecap="round"/>
      <path d="M38 56 C28 70 20 84 19 96" stroke="${C.goldLight}" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".85"/>
      ${[
        [44, 36, -1],
        [44, 164, 1],
      ]
        .map(
          ([x, y, d]) => `<circle cx="${x}" cy="${y}" r="21" fill="url(#${g}gk)" stroke="${C.ink}" stroke-width="5"/>
        <path d="${spiralD(x, y, 16, 1.55, d)}" stroke="${C.goldDeep}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
        <path d="${spiralD(x, y, 16, 1.55, d)}" stroke="${C.ink}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".6"/>
        <path d="M${x - 14} ${y - 8} Q${x - 10} ${y - 16} ${x - 2} ${y - 18}" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`,
        )
        .join('')}
      <circle cx="13" cy="100" r="12" fill="url(#${g}gk)" stroke="${C.ink}" stroke-width="4.5"/>
      <circle cx="9.5" cy="96" r="3.4" fill="#fff" opacity=".75"/>`;
  const nailXs = [0.05, 0.36, 0.64, 0.95].map((t) => b.px0 + (b.px1 - b.px0) * t);
  const nail = (x: number, y: number) =>
    `<circle cx="${f(x)}" cy="${y}" r="5.4" fill="url(#${g}nl)" stroke="${C.ink}" stroke-width="2.4"/><circle cx="${f(x - 1.6)}" cy="${y - 1.8}" r="1.6" fill="#fff" opacity=".75"/>`;
  const grain = [
    `M${b.bx0 + 18} 29 C${W * 0.3} 26 ${W * 0.55} 34 ${b.bx1 - 22} 29`,
    `M${b.bx0 + 30} 171 C${W * 0.35} 175 ${W * 0.62} 167 ${b.bx1 - 26} 172`,
    `M${b.bx0 + 8} 62 C${b.bx0 + 30} 58 ${b.bx0 + 46} 68 ${b.px0 - 4} 64`,
    `M${b.bx0 + 12} 132 C${b.bx0 + 30} 136 ${b.bx0 + 50} 128 ${b.px0 - 4} 134`,
    `M${b.bx1 - 8} 140 C${b.bx1 - 30} 142 ${b.bx1 - 46} 134 ${b.px1 + 4} 138`,
    `M${b.bx1 - 12} 70 C${b.bx1 - 30} 66 ${b.bx1 - 50} 74 ${b.px1 + 4} 70`,
  ].join(' ');
  const rr = (x0: number, y0: number, x1: number, y1: number, r: number) =>
    `M${x0 + r} ${y0} L${x1 - r} ${y0} Q${x1} ${y0} ${x1} ${y0 + r} L${x1} ${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} L${x0 + r} ${y1} Q${x0} ${y1} ${x0} ${y1 - r} L${x0} ${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
  const i0 = b.px0 + b.rimW;
  const i1 = b.px1 - b.rimW;
  const j0 = b.py0 + b.rimW;
  const j1 = b.py1 - b.rimW;
  const rimRivets = [
    [b.px0 + 14, b.py0 + 14],
    [b.px1 - 14, b.py0 + 14],
    [b.px0 + 14, b.py1 - 14],
    [b.px1 - 14, b.py1 - 14],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="1.6"/>`)
    .join('');
  const cx = W / 2;
  const wing = (d: number) =>
    `<path d="M${cx + d * 14} 24 C${cx + d * 28} 8 ${cx + d * 52} 8 ${cx + d * 64} 22 C${cx + d * 50} 18 ${cx + d * 36} 22 ${cx + d * 24} 32 Z" fill="url(#${g}gb)" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M${cx + d * 24} 22 C${cx + d * 34} 15 ${cx + d * 46} 14 ${cx + d * 56} 18" stroke="${C.goldLight}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".85"/>`;
  const crest = `${wing(-1)}${wing(1)}
    <circle cx="${cx}" cy="22" r="19" fill="url(#${g}gk)" stroke="${C.ink}" stroke-width="4.5"/>
    <circle cx="${cx}" cy="22" r="12.5" fill="${C.night}" stroke="${C.ink}" stroke-width="3"/>
    <path d="${crescent(cx - 2, 22, 8.5)}" fill="${C.tealLight}"/>
    <path d="${glint(cx + 5, 17, 3.6)}" fill="${C.moon}"/>
    <path d="M${cx - 12} 12 Q${cx - 6} 6 ${cx + 2} 5.5" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".7"/>`;
  return svgDoc(
    W,
    H,
    `<defs>
      ${lin(`${g}wd`, [[0, C.woodLight], [0.16, C.wood], [0.6, C.woodMid], [1, C.woodDark]])}
      ${lin(`${g}gb`, [[0, C.goldLight], [0.45, C.gold], [1, C.goldDeep]], 0, 0, 1, 1)}
      ${rad(`${g}gk`, [[0, C.goldLight], [0.55, C.gold], [1, C.goldDeep]], 0.36, 0.32, 0.72)}
      ${rad(`${g}nl`, [[0, C.goldLight], [0.5, C.gold], [1, C.goldDeep]], 0.36, 0.32, 0.72)}
      ${lin(`${g}br`, [[0, C.goldLight], [0.3, C.gold], [0.7, C.goldDeep], [1, mix(C.goldDeep, C.ink, 0.3)]])}
      ${lin(`${g}pn`, [[0, C.nightDeep], [0.55, C.night], [1, mix(C.night, C.seaDeep, 0.35)]])}
      ${lin(`${g}sh`, [[0, C.ink, 0.75], [1, C.ink, 0]])}
      ${lin(`${g}rp`, [[0, C.wood], [0.3, C.woodLight], [0.55, C.paperWarm], [1, C.wood]], 0, 0, 1, 0)}
      <filter id="${g}ds" x="-5%" y="-20%" width="110%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="7"/><feOffset dy="8"/><feComponentTransfer><feFuncA type="linear" slope=".6"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g filter="url(#${g}ds)">
      ${end}
      <g transform="translate(${W} 0) scale(-1 1)">${end}</g>
      <path d="${rr(b.bx0, b.by0, b.bx1, b.by1, 16)}" fill="url(#${g}wd)" stroke="${C.ink}" stroke-width="6.5"/>
      <path d="${grain}" stroke="${C.woodDark}" stroke-width="2.4" fill="none" opacity=".5" stroke-linecap="round"/>
      <ellipse cx="${b.bx0 + 50}" cy="98" rx="8" ry="4" fill="none" stroke="${C.woodDark}" stroke-width="2.2" opacity=".55"/>
      <ellipse cx="${b.bx1 - 52}" cy="104" rx="7" ry="3.5" fill="none" stroke="${C.woodDark}" stroke-width="2.2" opacity=".55"/>
      <path d="${rr(b.bx0 + 8, b.by0 + 8, b.bx1 - 8, b.by1 - 8, 9)}" fill="none" stroke="${C.goldDeep}" stroke-width="5.5"/>
      <path d="${rr(b.bx0 + 8, b.by0 + 8, b.bx1 - 8, b.by1 - 8, 9)}" fill="none" stroke="${C.gold}" stroke-width="2.4"/>
      <path d="M${b.bx0 + 16} ${b.by0 + 3.5} L${b.bx1 - 16} ${b.by0 + 3.5}" stroke="${C.seaFoam}" stroke-width="2.6" opacity=".45" stroke-linecap="round"/>
      ${lashing(b.bx0 + 30, b.by0 - 6, b.by1 + 6, g)}
      ${lashing(b.bx1 - 30, b.by0 - 6, b.by1 + 6, g)}
      ${nailXs.map((x) => nail(x, 30) + nail(x, 170)).join('')}
      <path d="${rr(b.px0, b.py0, b.px1, b.py1, 16)}" fill="url(#${g}br)" stroke="${C.ink}" stroke-width="5"/>
      <path d="M${b.px0 + 16} ${b.py0 + 3.5} L${b.px1 - 16} ${b.py0 + 3.5}" stroke="${C.goldLight}" stroke-width="2.6" opacity=".9" stroke-linecap="round"/>
      ${rimRivets}
      <path d="${rr(i0, j0, i1, j1, 9)}" fill="url(#${g}pn)" stroke="${C.ink}" stroke-width="4"/>
      <path d="M${i0 + 6} ${j0 + 2} L${i1 - 6} ${j0 + 2} L${i1 - 6} ${j0 + 20} L${i0 + 6} ${j0 + 20} Z" fill="url(#${g}sh)" opacity=".7"/>
      <path d="M${i0 + 22} ${j1 - 8} L${i1 - 22} ${j1 - 8}" stroke="${C.seaLight}" stroke-width="2" opacity=".18" stroke-linecap="round"/>
      ${crest}
    </g>`,
  );
}

/* ------------------------------ Powder fuse ------------------------------ */
/** Meter art layout in meter units: height 100, width 100 * aspect. */
export interface FuseLayout {
  aspect: number;
  /** Label plank width. */
  labelW: number;
  /** Powder cup centres. */
  cups: number[];
  /** Where the fuse ends (under the plunder seal). */
  endX: number;
}
/** Rope centre line and the padding (units) the art keeps above/below the meter's rect. */
export const FUSE = { railY: 78, rope: 20, cupRim: 57, padTop: 10, padBottom: 14 };

const fuseVB = (L: FuseLayout) => {
  const W = 100 * L.aspect;
  const H = 100 + FUSE.padTop + FUSE.padBottom;
  return { W, H, vb: `0 ${-FUSE.padTop} ${f(W)} ${H}` };
};
const ropeD = (x0: number, x1: number) => {
  const r = FUSE.rope / 2;
  const y = FUSE.railY;
  return `M${f(x0 + r)} ${f(y - r)} L${f(x1 - r)} ${f(y - r)} A${r} ${r} 0 0 1 ${f(x1 - r)} ${f(y + r)} L${f(x0 + r)} ${f(y + r)} A${r} ${r} 0 0 1 ${f(x0 + r)} ${f(y - r)} Z`;
};
const ropeTwist = (x0: number, x1: number) => {
  const r = FUSE.rope / 2;
  const y = FUSE.railY;
  let d = '';
  for (let x = x0 + 6; x < x1 - 4; x += 7.5) d += `M${f(x)} ${f(y - r + 1)} Q${f(x + 5.5)} ${f(y)} ${f(x + 2.5)} ${f(y + r - 1)} `;
  return d;
};

/**
 * Back layer of the fuse meter: the label plank and the braided rope fuse running from it to the
 * seal. The lit rope overlay goes on top of this and under `fuseRailFront`.
 */
export function fuseRailBack(L: FuseLayout): string {
  const g = nextId('fr');
  const { W, H, vb } = fuseVB(L);
  const x0 = L.labelW - 14;
  const px0 = 3;
  const px1 = L.labelW - 4;
  const plank = `M${px0 + 10} 12 L${px1 - 8} 14 Q${px1} 14.5 ${px1} 23 L${px1 - 1} 74 Q${px1 - 1} 82 ${px1 - 9} 82 L${px0 + 9} 80 Q${px0} 79.5 ${px0} 71 L${px0 + 1} 21 Q${px0 + 1} 12 ${px0 + 10} 12 Z`;
  return svgDoc(
    W,
    H,
    `<defs>
      ${lin(`${g}w`, [[0, C.wood], [0.18, C.woodMid], [0.7, C.woodDark], [1, C.woodDeep]])}
      ${lin(`${g}r`, [[0, C.paper], [0.3, C.paperWarm], [0.65, C.woodLight], [1, C.wood]])}
      <filter id="${g}ds" x="-5%" y="-30%" width="110%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="4"/><feComponentTransfer><feFuncA type="linear" slope=".55"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g filter="url(#${g}ds)">
      <path d="${ropeD(x0, L.endX)}" fill="url(#${g}r)" stroke="${C.ink}" stroke-width="3.6"/>
      <path d="${ropeTwist(x0, L.endX)}" stroke="${C.woodMid}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M${f(x0 + 8)} ${FUSE.railY - 5} L${f(L.endX - 8)} ${FUSE.railY - 5}" stroke="#fff" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>
      <path d="${plank}" fill="url(#${g}w)" stroke="${C.ink}" stroke-width="4"/>
      <path d="M${px0 + 12} 30 C${px1 * 0.4} 27 ${px1 * 0.6} 34 ${px1 - 12} 31 M${px0 + 14} 66 C${px1 * 0.45} 69 ${px1 * 0.65} 63 ${px1 - 10} 66" stroke="${C.woodDeep}" stroke-width="1.8" fill="none" opacity=".6"/>
      <path d="M${px0 + 8} 19 L${px1 - 8} 20.5" stroke="${C.woodLight}" stroke-width="2" opacity=".45" stroke-linecap="round"/>
      <path d="M${px0 + 10} 16.5 L${px1 - 10} 18" stroke="${C.seaFoam}" stroke-width="1.8" opacity=".35" stroke-linecap="round"/>
      ${[px0 + 11, px1 - 11]
        .map((x) => `<circle cx="${f(x)}" cy="22" r="3.6" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="1.8"/><circle cx="${f(x - 1)}" cy="21" r="1.1" fill="${C.goldLight}"/>`)
        .join('')}
      ${[-7, 0, 7]
        .map((dx) => `<path d="M${f(px1 - 9 + dx)} 64 L${f(px1 - 5 + dx)} 64 L${f(px1 - 2 + dx)} 92 L${f(px1 - 6 + dx)} 92 Z" fill="url(#${g}r)" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>`)
        .join('')}
    </g>`,
    vb,
  );
}

/** Burning stretch of the fuse (charred rope with glowing twists), masked to the lit length. */
export function fuseRopeLit(L: FuseLayout): string {
  const g = nextId('fl');
  const { W, H, vb } = fuseVB(L);
  const x0 = L.labelW - 14;
  return svgDoc(
    W,
    H,
    `<defs>${lin(`${g}r`, [[0, mix(C.fire, C.ember, 0.3)], [0.45, C.ember], [1, mix(C.ember, C.ink, 0.55)]])}${blur(`${g}b`, 4, 20)}</defs>
    <path d="${ropeD(x0, L.endX)}" fill="${C.fire}" opacity=".55" filter="url(#${g}b)"/>
    <path d="${ropeD(x0, L.endX)}" fill="url(#${g}r)" stroke="${C.ink}" stroke-width="3.6"/>
    <path d="${ropeTwist(x0, L.endX)}" stroke="${C.fireHot}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M${f(x0 + 8)} ${FUSE.railY - 5} L${f(L.endX - 8)} ${FUSE.railY - 5}" stroke="${C.fireCore}" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>`,
    vb,
  );
}

/** Front layer of the fuse meter: an iron powder cup clamped to the rope at every step. */
export function fuseRailFront(L: FuseLayout): string {
  const g = nextId('fc');
  const { W, H, vb } = fuseVB(L);
  const y = FUSE.railY;
  const r = FUSE.cupRim;
  const cups = L.cups
    .map((x) => {
      const bowl = `M${f(x - 17)} ${r} L${f(x + 17)} ${r} C${f(x + 16.5)} ${r + 10} ${f(x + 11)} ${r + 14.5} ${f(x + 6.5)} ${r + 14.5} L${f(x - 6.5)} ${r + 14.5} C${f(x - 11)} ${r + 14.5} ${f(x - 16.5)} ${r + 10} ${f(x - 17)} ${r} Z`;
      return `<path d="M${f(x - 6)} ${y - 12.5} L${f(x + 6)} ${y - 12.5} L${f(x + 6)} ${y + 12.5} L${f(x - 6)} ${y + 12.5} Z" fill="url(#${g}i)" stroke="${C.ink}" stroke-width="2.8"/>
        <circle cx="${f(x)}" cy="${y + 6}" r="2" fill="${C.steel}"/>
        <path d="${bowl}" fill="url(#${g}c)" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
        <ellipse cx="${f(x)}" cy="${r}" rx="17" ry="4.8" fill="${C.ink}"/>
        <ellipse cx="${f(x)}" cy="${r + 0.6}" rx="11.5" ry="2.5" fill="${C.inkSoft}"/>
        <path d="M${f(x - 17)} ${r} A17 4.8 0 0 0 ${f(x + 17)} ${r}" stroke="${C.steel}" stroke-width="1.7" fill="none"/>
        <path d="M${f(x - 11.5)} ${r + 4} Q${f(x - 10.5)} ${r + 10} ${f(x - 6)} ${r + 12}" stroke="#fff" stroke-width="2" fill="none" opacity=".45" stroke-linecap="round"/>`;
    })
    .join('');
  return svgDoc(
    W,
    H,
    `<defs>
      ${lin(`${g}i`, [[0, C.steelDeep], [0.5, mix(C.steelDeep, C.inkSoft, 0.5)], [1, C.ink]], 0, 0, 1, 0)}
      ${lin(`${g}c`, [[0, C.steel], [0.35, C.steelDeep], [1, mix(C.steelDeep, C.ink, 0.6)]])}
      <filter id="${g}ds" x="-5%" y="-30%" width="110%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/><feOffset dy="3"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g filter="url(#${g}ds)">${cups}</g>`,
    vb,
  );
}

/** Plunder seal at the fuse's end: a crimson wax seal behind the multiplier. 128 box. */
export function waxSeal(): string {
  const g = nextId('ws');
  const edge = smooth(Array.from({ length: 22 }, (_, i) => pol(64, 64, 55 + (i % 2 ? -3.5 : 1.5) + Math.sin(i * 1.9) * 1.8, i * (360 / 22))));
  const dots = Array.from({ length: 24 }, (_, i) => {
    const [x, y] = pol(64, 64, 45, i * 15);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="1.6"/>`;
  }).join('');
  return composeSymbol({
    size: 128,
    lw: 4.5,
    shade: 0.32,
    light: 0.4,
    defs: `${rad(`${g}w`, [[0, C.crimsonLight], [0.45, C.crimson], [1, C.crimsonDeep]], 0.38, 0.32, 0.75)}
      ${rad(`${g}p`, [[0, mix(C.crimson, C.crimsonDeep, 0.55)], [1, mix(C.crimsonDeep, C.ink, 0.3)]], 0.42, 0.36, 0.7)}`,
    layers: [
      { fills: `<path d="${edge}" fill="url(#${g}w)"/>`, lines: `<path d="${edge}"/>` },
      { fills: `<circle cx="64" cy="64" r="39" fill="url(#${g}p)"/>`, lines: `<circle cx="64" cy="64" r="39" stroke-width="2.6" opacity=".7"/>` },
    ],
    top: `<g fill="${C.crimsonLight}" opacity=".55">${dots}</g>
      <path d="M36 48 Q42 34 58 29" stroke="${C.crimsonLight}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"/>
      <path d="M26 40 Q32 26 46 20" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/>`,
  });
}

/**
 * Flame that flares from a powder cup. `pal` = [core, tip, base] (the meter's heat ramp).
 * 128 box, base centred at (64, 121).
 */
export function fuseFlame(pal: [string, string, string]): string {
  const [core, tip, base] = pal;
  const g = nextId('ff');
  const outer = 'M64 122 C41 121 30 104 35 88 C39 76 34 64 29 51 C43 56 51 68 52 79 C53 62 61 43 58 16 C74 33 84 55 80 78 C86 72 90 62 88 51 C101 66 103 92 93 106 C87 116 77 122 64 122 Z';
  const inner = 'M64 116 C51 115 46 104 50 93 C53 85 55 77 53 69 C62 75 66 84 64 93 C70 85 74 75 74 64 C84 76 86 94 80 104 C76 112 70 116 64 116 Z';
  return svgDoc(
    128,
    128,
    `<defs>${lin(g, [[0, tip], [0.55, mix(tip, base, 0.45)], [1, base]])}</defs>
    <path d="${outer}" fill="url(#${g})" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="${inner}" fill="${core}"/>
    <path d="M58 104 Q54 96 58 88" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>
    <circle cx="44" cy="40" r="3.4" fill="${tip}" stroke="${C.ink}" stroke-width="1.8"/>
    <circle cx="96" cy="36" r="2.6" fill="${core}" stroke="${C.ink}" stroke-width="1.6"/>`,
  );
}

/* --------------------------------- logo ---------------------------------- */
/**
 * Pirate scroll banner behind the logo's top word: an arched, sun-aged parchment band whose ends
 * roll up into scrolls, with notched tails folding away behind. viewBox `width` x 120.
 */
export function ribbon(width = 520): string {
  const g = nextId('rb');
  const w = width;
  const m = w / 2;
  const tail = 'M64 44 L4 54 L26 76 L2 102 L64 98 Z';
  const fold = 'M64 44 L46 50 L46 96 L64 98 Z';
  const band = `M50 26 Q${m} 2 ${w - 50} 26 L${w - 50} 94 Q${m} 70 50 94 Z`;
  const edge = `M58 31 Q${m} 9 ${w - 58} 31 M58 89 Q${m} 66 ${w - 58} 89`;
  const roll = (x: number) => `M${x - 13} 24 Q${x - 13} 16 ${x} 16 Q${x + 13} 16 ${x + 13} 24 L${x + 13} 96 Q${x + 13} 104 ${x} 104 Q${x - 13} 104 ${x - 13} 96 Z`;
  const blot = (cx: number, cy: number, r: number, seed: number) =>
    `<path d="${smooth(Array.from({ length: 9 }, (_, i) => pol(cx, cy, r * (0.72 + 0.28 * Math.abs(Math.sin(i * 1.7 + seed))), i * 40)))}" transform="translate(${f(cx)} ${f(cy)}) scale(1 .42) translate(${f(-cx)} ${f(-cy)})"/>`;
  const stains = [
    [m - 0.23 * w, 46, 30, 1],
    [m + 0.18 * w, 70, 34, 2],
    [m + 0.33 * w, 42, 18, 3],
    [m - 0.38 * w, 72, 20, 4],
    [m + 0.02 * w, 36, 14, 5],
  ]
    .filter(([x]) => x > 72 && x < w - 72)
    .map(([x, y, r, sd]) => blot(x, y, r, sd))
    .join('');
  return svgDoc(
    w,
    120,
    `<defs>
      ${lin(`${g}b`, [[0, C.paper], [0.5, C.paperWarm], [1, mix(C.paperWarm, C.woodLight, 0.6)]])}
      ${lin(`${g}t`, [[0, mix(C.paperWarm, C.woodLight, 0.55)], [1, mix(C.wood, C.woodLight, 0.4)]])}
      ${lin(`${g}r`, [[0, C.woodLight], [0.3, C.paper], [0.62, C.paperWarm], [1, C.wood]], 0, 0, 1, 0)}
      ${blur(`${g}s`, 2.4, 30)}
      <filter id="${g}ds" x="-5%" y="-20%" width="110%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="4"/><feOffset dy="5"/><feComponentTransfer><feFuncA type="linear" slope=".5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g filter="url(#${g}ds)" stroke="${C.ink}" stroke-linejoin="round">
      ${[0, 1]
        .map(
          (flip) => `<g ${flip ? `transform="translate(${w} 0) scale(-1 1)"` : ''}>
        <path d="${tail}" fill="url(#${g}t)" stroke-width="5.5"/>
        <path d="${fold}" fill="${C.woodMid}" opacity=".45" stroke="none"/>
        <path d="M60 50 L30 60 M60 92 L28 88" stroke="${C.woodMid}" stroke-width="2.2" opacity=".55" fill="none"/></g>`,
        )
        .join('')}
      <path d="${band}" fill="url(#${g}b)" stroke-width="6"/>
      <g fill="${C.woodLight}" opacity=".26" stroke="none" filter="url(#${g}s)">${stains}</g>
      <path d="${edge}" stroke="${C.woodLight}" stroke-width="5" fill="none" opacity=".45"/>
      <path d="M64 30 Q${m} 8 ${w - 64} 30" stroke="#fff" stroke-width="3" fill="none" opacity=".65" stroke-linecap="round"/>
      <path d="${roll(46)}" fill="url(#${g}r)" stroke-width="5.5"/>
      <path d="${roll(w - 46)}" fill="url(#${g}r)" stroke-width="5.5"/>
      ${[46, w - 46]
        .map(
          (x) => `<ellipse cx="${x}" cy="23" rx="11" ry="5.4" fill="${mix(C.paperWarm, C.woodLight, 0.5)}" stroke-width="3"/>
            <path d="${spiralD(x, 23, 7.5, 1.3)}" transform="translate(${x} 23) scale(1 .5) translate(${-x} -23)" fill="none" stroke="${C.woodMid}" stroke-width="2.4"/>
            <path d="M${x - 6} 36 L${x - 6} 90" stroke="#fff" stroke-width="3" opacity=".5" stroke-linecap="round"/>
            <path d="M${x + 7} 32 L${x + 7} 94" stroke="${C.woodMid}" stroke-width="2.2" opacity=".35" stroke-linecap="round"/>`,
        )
        .join('')}
    </g>`,
  );
}

/* ---------------------- treasure chest pop (FS trigger) ------------------- */
// Same geometry as the scatter symbol (src/art/keg.ts) so the pop starts as the very same chest.
const CHEST_BODY = 'M46 128 L210 128 L206 224 L50 224 Z';
const CHEST_LID = 'M42 130 C42 86 82 64 128 64 C174 64 214 86 214 130 Z';
const CHEST_BAND = 'M36 124 L220 124 L220 138 L36 138 Z';
const CHEST_STRAPS = [86, 170];
/** Rig points in the 256 box: lid hinge line, the open lid's foot, the lock seat, the spring's foot. */
export const CHEST = { seam: 130, lidOpenBase: 126, lockClosed: 132, lockOpen: 160, mouth: 118, bottom: 224 };
/** Spring attachment (bottom of the cranium) in the skull's 256 box. */
export const JESTER_NECK: Pt = [128, 200];

function chestDefs(g: string): string {
  return `${lin(`${g}w`, [[0, C.woodLight], [0.55, C.wood], [1, C.woodMid]])}
    ${lin(`${g}d`, [[0, mix(C.woodLight, C.wood, 0.35)], [1, C.wood]])}
    ${lin(`${g}m`, [[0, C.goldLight], [0.5, C.gold], [1, C.goldDeep]])}
    ${rad(`${g}t`, [[0, C.tealLight, 0.95], [0.45, C.seaLight, 0.55], [1, C.sea, 0]])}
    ${blur(`${g}b`, 8)}`;
}

/** Chest body (front, band, straps, feet): everything below the lid. 256 box. */
export function jackBody(): string {
  const g = nextId('cb');
  const straps = CHEST_STRAPS.map((x) => `<path d="M${x - 9.9} 134 L${x + 9.9} 134 L${x + 11} 224 L${x - 11} 224 Z" fill="url(#${g}m)"/>`).join('');
  const strapLines = CHEST_STRAPS.map((x) => `<path d="M${x - 9.9} 134 L${x - 11} 224 M${x + 9.9} 134 L${x + 11} 224" stroke-width="5"/>`).join('');
  const rivets = CHEST_STRAPS.flatMap((x) => [150, 200].map((y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2"/>`)).join('');
  return composeSymbol({
    shade: 0.22,
    light: 0.4,
    defs: chestDefs(g),
    layers: [
      {
        fills: `<path d="${CHEST_BODY}" fill="url(#${g}w)"/><path d="M50 160 L206 160 M52 192 L204 192" stroke="${C.woodDark}" stroke-width="3" opacity=".6"/>`,
        lines: `<path d="${CHEST_BODY}"/>`,
      },
      { fills: straps, lines: strapLines },
      { fills: `<path d="${CHEST_BAND}" fill="url(#${g}m)"/>`, lines: `<path d="${CHEST_BAND}" stroke-width="5.5"/>` },
    ],
    top: `${rivets}
      <path d="M40 212 L62 212 L62 226 L40 226 Z M194 212 L216 212 L216 226 L194 226 Z" fill="url(#${g}m)" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M44 127 L212 127" stroke="#fff" stroke-width="2.4" opacity=".55" stroke-linecap="round"/>`,
  });
}

/** Closed lid (domed), hinge along its bottom edge (y = CHEST.seam). 256 box. */
export function jackLid(): string {
  const g = nextId('cl');
  const straps = CHEST_STRAPS.map((x) => `<path d="M${x - 9} 68 L${x + 9} 68 L${x + 9.8} 132 L${x - 9.8} 132 Z" fill="url(#${g}m)"/>`).join('');
  const strapLines = CHEST_STRAPS.map((x) => `<path d="M${x - 9} 70 L${x - 9.8} 132 M${x + 9} 70 L${x + 9.8} 132" stroke-width="5"/>`).join('');
  const rivets = CHEST_STRAPS.map((x) => `<circle cx="${x}" cy="96" r="3.6" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2"/>`).join('');
  return composeSymbol({
    noDrop: true,
    shade: 0.22,
    light: 0.4,
    defs: chestDefs(g),
    layers: [
      {
        fills: `<path d="${CHEST_LID}" fill="url(#${g}d)"/><path d="M58 100 C80 84 104 78 128 78 C152 78 176 84 198 100" stroke="${C.woodMid}" stroke-width="3" fill="none" opacity=".6"/>`,
        lines: `<path d="${CHEST_LID}"/>`,
      },
      { fills: straps, lines: strapLines },
    ],
    top: `${rivets}<path d="M64 96 Q86 78 112 74" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".45"/>`,
  });
}

/** Open lid seen from the front (its red-lined inside), standing on CHEST.lidOpenBase. 256 box. */
export function jackLidOpen(): string {
  const g = nextId('co');
  const lid = 'M46 126 L60 50 C92 36 164 36 196 50 L210 126 Z';
  const lining = 'M62 118 L72 60 C98 50 158 50 184 60 L194 118 Z';
  return composeSymbol({
    noDrop: true,
    shade: 0.2,
    light: 0.4,
    defs: chestDefs(g),
    layers: [
      {
        fills: `<path d="${lid}" fill="url(#${g}d)"/><path d="${lining}" fill="${C.crimsonDeep}"/>
          <path d="M72 60 C98 50 158 50 184 60 L186 72 C160 62 96 62 70 72 Z" fill="${C.ink}" opacity=".3"/>
          <path d="M80 70 L76 112 M104 64 L102 114 M128 62 L128 114 M152 64 L154 114 M176 70 L180 112" stroke="${C.ink}" stroke-width="2" opacity=".22"/>`,
        lines: `<path d="${lid}"/><path d="${lining}" stroke-width="4.5"/>`,
      },
    ],
    top: `<path d="M52 118 L62 54 L70 52 L60 118 Z M204 118 L194 54 L186 52 L196 118 Z" fill="url(#${g}m)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M66 56 C96 44 160 44 190 56" stroke="${C.goldLight}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`,
  });
}

/** The lock plate with the glowing teal crescent moon (its own sprite so it can pop). 256 box. */
export function chestLock(cy: number = CHEST.lockClosed): string {
  const g = nextId('lk');
  const cx = 128;
  const plate = `M${cx - 25} ${cy - 23} L${cx + 25} ${cy - 23} L${cx + 25} ${cy + 8} C${cx + 25} ${cy + 22} ${cx + 12} ${cy + 31} ${cx} ${cy + 35} C${cx - 12} ${cy + 31} ${cx - 25} ${cy + 22} ${cx - 25} ${cy + 8} Z`;
  return composeSymbol({
    shade: 0.22,
    light: 0.4,
    defs: chestDefs(g),
    layers: [{ fills: '', lines: '' }],
    top: `<circle cx="${cx}" cy="${cy + 4}" r="42" fill="url(#${g}t)" filter="url(#${g}b)"/>
      <path d="${plate}" fill="url(#${g}m)" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="${cx}" cy="${cy + 2}" r="17" fill="${C.night}" stroke="${C.ink}" stroke-width="4"/>
      <circle cx="${cx}" cy="${cy + 2}" r="14" fill="${C.seaDeep}" opacity=".8"/>
      <path d="${crescent(cx - 3, cy + 2, 11)}" fill="${C.tealLight}"/>
      <path d="M${cx + 8} ${cy - 6} l1.6 3.4 l3.6 .4 l-2.7 2.4 l.8 3.6 l-3.3 -1.8 l-3.3 1.8 l.8 -3.6 l-2.7 -2.4 l3.6 -.4 Z" fill="${C.moon}"/>
      <path d="M${cx - 18} ${cy - 16} L${cx - 7} ${cy - 16}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
  });
}

/** Heaped gold inside the open chest (dark interior wall, coins, two gems). 256 box. */
export function chestHoard(): string {
  const g = nextId('hd');
  const hoard = 'M48 128 C52 108 70 96 90 100 C100 84 122 80 138 90 C152 80 176 86 184 102 C200 100 212 114 208 128 Z';
  const coins = [
    [70, 116, 13],
    [92, 106, 14],
    [118, 97, 15],
    [146, 100, 14],
    [172, 108, 13],
    [190, 118, 12],
    [104, 120, 13],
    [134, 116, 14],
    [160, 122, 12],
    [82, 126, 11],
  ]
    .map(
      ([x, y, r]) =>
        `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${f(r * 0.62)}" fill="url(#${g}m)" stroke="${C.ink}" stroke-width="3"/><ellipse cx="${x}" cy="${y}" rx="${f(r * 0.6)}" ry="${f(r * 0.34)}" fill="none" stroke="${C.goldDeep}" stroke-width="1.6" opacity=".7"/><path d="M${f(x - r * 0.45)} ${f(y - r * 0.12)} Q${x} ${f(y - r * 0.45)} ${f(x + r * 0.45)} ${f(y - r * 0.12)}" stroke="#fff" stroke-width="2" fill="none" opacity=".75"/>`,
    )
    .join('');
  return composeSymbol({
    noDrop: true,
    shade: 0.2,
    light: 0.4,
    defs: chestDefs(g),
    layers: [
      { fills: `<path d="M50 112 L206 112 L210 130 L46 130 Z" fill="${C.woodDeep}"/>`, lines: '' },
      { fills: `<path d="${hoard}" fill="url(#${g}m)"/>`, lines: `<path d="${hoard}" stroke-width="5.5"/>` },
      { fills: coins, lines: '' },
    ],
    top: `<path d="M118 70 L126 84 L142 84 L130 94 L134 110 L120 100 L106 110 L110 94 L98 84 L114 84 Z" fill="${C.crimsonLight}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M150 74 L164 60 L178 74 L164 88 Z" fill="${C.tealLight}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M156 74 L164 66 L170 72" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>
      <path d="${glint(70, 84, 7)}" fill="#fff"/><path d="${glint(196, 96, 6)}" fill="#fff"/>`,
  });
}

/** Fan of gold light that bursts out of the open chest (additive; rays leave from (128, 200)). */
export function chestRays(): string {
  const g = nextId('ry');
  const beams = Array.from({ length: 11 }, (_, i) => {
    const a = -75 + i * 15;
    const w = i % 2 ? 4.5 : 7.5;
    return `<path d="M128 200 L${P(pol(128, 200, 232, a - w))} L${P(pol(128, 200, 232, a + w))} Z" opacity="${i % 2 ? 0.55 : 0.95}"/>`;
  }).join('');
  return svgDoc(256, 256, `<defs>${radU(g, [[0, C.goldLight, 1], [0.3, C.fireHot, 0.7], [1, C.gold, 0]], 128, 200, 214)}${blur(`${g}b`, 3, 10)}</defs><g fill="url(#${g})" filter="url(#${g}b)">${beams}</g>`);
}

/**
 * The pop-up: a grinning golden skull in a tiny tricorn (the jaw is `jesterJaw`, a separate
 * sprite so it can chatter). Spring attaches at JESTER_NECK. 256 box.
 */
export function jester(): string {
  const g = nextId('js');
  // cranium: big round dome narrowing into cheekbones; the upper teeth follow a grin curve
  const cranium = 'M80 172 C62 162 50 142 50 116 C50 70 84 38 128 38 C172 38 206 70 206 116 C206 142 194 162 176 172 Q128 196 80 172 Z';
  const teeth = 'M82 158 Q128 180 174 158 L176 172 Q128 196 80 172 Z';
  // tooth gaps: from the top of the teeth band (Q 82,158 128,180 174,158) to the bite line (Q 80,172 128,196 176,172)
  const toothLines = [0.2, 0.36, 0.5, 0.64, 0.8]
    .map((t) => {
      const x = 82 + 92 * t;
      const u = (x - 80) / 96;
      return `M${f(x)} ${f(158 + 44 * t * (1 - t))} L${f(x + (t - 0.5) * 3)} ${f(172 + 48 * u * (1 - u))}`;
    })
    .join(' ');
  // tricorn: upturned side points higher than the crown, a front point, gold braid on the top edge
  const hat = 'M-82 -40 C-62 -30 -40 -34 -22 -38 C-10 -46 10 -46 22 -38 C40 -34 62 -30 82 -40 C72 -10 40 8 0 26 C-40 8 -72 -10 -82 -40 Z';
  const crown = 'M-22 -38 C-10 -46 10 -46 22 -38 C10 -35 -10 -35 -22 -38 Z';
  const braid = 'M-82 -40 C-62 -30 -40 -34 -22 -38 C-10 -35 10 -35 22 -38 C40 -34 62 -30 82 -40 L76 -30 C58 -22 40 -26 22 -29 C8 -26 -8 -26 -22 -29 C-40 -26 -58 -22 -76 -30 Z';
  const fold = 'M0 -24 L0 18';
  const hatT = 'translate(130 50) rotate(-10) scale(.9)';
  return composeSymbol({
    shade: 0.26,
    light: 0.5,
    defs: `${rad(`${g}s`, [[0, C.goldLight], [0.42, C.gold], [0.85, mix(C.gold, C.goldDeep, 0.6)], [1, C.goldDeep]], 0.36, 0.28, 0.82)}
      ${lin(`${g}h`, [[0, C.navyLight], [0.5, C.navy], [1, mix(C.navy, C.ink, 0.45)]])}
      ${lin(`${g}c`, [[0, mix(C.navyLight, C.navy, 0.4)], [1, C.navy]])}
      ${lin(`${g}t`, [[0, C.goldLight], [0.6, C.gold], [1, C.goldDeep]])}`,
    layers: [
      { fills: `<path d="M84 172 Q128 196 172 172 L166 208 Q128 224 90 208 Z" fill="${C.inkSoft}"/>`, lines: '' },
      { fills: `<path d="${cranium}" fill="url(#${g}s)"/>`, lines: `<path d="${cranium}"/>` },
      {
        fills: `<g transform="${hatT}"><path d="${hat}" fill="url(#${g}h)"/><path d="${crown}" fill="url(#${g}c)"/><path d="${braid}" fill="url(#${g}t)"/></g>`,
        lines: `<g transform="${hatT}" stroke-width="8"><path d="${hat}"/><path d="${crown}" stroke-width="3.5"/><path d="${braid}" stroke-width="3.8"/><path d="${fold}" stroke-width="3.5"/></g>`,
      },
    ],
    top: `<path d="${teeth}" fill="${C.paper}" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
      <path d="${toothLines}" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M129.6 170.4 L140.2 169.4 L140.4 182.6 L130 184 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/><path d="M133 173 L133 179" stroke="${C.goldLight}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M86 161 Q128 181 170 161" stroke="#fff" stroke-width="2.4" fill="none" opacity=".6"/>
      <g transform="rotate(10 96 112)"><ellipse cx="96" cy="112" rx="24" ry="27" fill="${C.ink}"/></g>
      <g transform="rotate(-10 160 112)"><ellipse cx="160" cy="112" rx="24" ry="27" fill="${C.ink}"/></g>
      <circle cx="99" cy="118" r="10" fill="${C.teal}" opacity=".55"/><circle cx="157" cy="118" r="10" fill="${C.teal}" opacity=".55"/>
      <circle cx="99" cy="118" r="7" fill="${C.tealLight}"/><circle cx="157" cy="118" r="7" fill="${C.tealLight}"/>
      <circle cx="95.5" cy="114.5" r="2.6" fill="#fff"/><circle cx="153.5" cy="114.5" r="2.6" fill="#fff"/>
      <circle cx="88" cy="101" r="4.2" fill="#fff" opacity=".9"/><circle cx="150" cy="101" r="4.2" fill="#fff" opacity=".9"/>
      <path d="M128 132 C121 142 115 150 121 155 C124 157 128 155 128 152 C128 155 132 157 135 155 C141 150 135 142 128 132 Z" fill="${C.ink}"/>
      <path d="M72 62 Q66 60 64 66" stroke="${C.goldDeep}" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M186 146 L178 152 L184 158 L178 164" stroke="${C.goldDeep}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M62 130 Q59 106 70 88" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".55"/>
      <ellipse cx="86" cy="86" rx="11" ry="6" transform="rotate(-48 86 86)" fill="#fff" opacity=".6"/>
      <path d="M198 96 Q204 118 196 140" stroke="${C.seaFoam}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".55"/>
      <g transform="${hatT}"><path d="M-66 -24 Q-44 -14 -14 -12" stroke="${C.navyLight}" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".85"/>
        ${crossbones(0, -5, 26, 4.2, C.white, 1.6)}<path d="${skullD(0, -8, 0.42)}" fill="${C.white}" stroke="${C.ink}" stroke-width="1.6"/>${skullHoles(0, -8, 0.42, C.ink, false)}
        <circle cx="-52" cy="-18" r="8.5" fill="${C.crimson}" stroke="${C.ink}" stroke-width="3.2"/><circle cx="-52" cy="-18" r="3.2" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.4"/>
        <path d="M-70 -35 Q-52 -27 -30 -31" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".75"/></g>`,
  });
}

/** The skull's jaw (chatters when it laughs); hinges on the grin line. 256 box. */
export function jesterJaw(): string {
  const g = nextId('jj');
  const jaw = 'M82 171 Q128 195 174 171 C182 186 176 206 154 213 L102 213 C80 206 74 186 82 171 Z';
  const teeth = 'M86 174 Q128 197 170 174 L166 186 Q128 208 90 186 Z';
  // tooth gaps: from the bite line (Q 86,174 128,197 170,174) to the gum line (Q 90,186 128,208 166,186)
  const toothLines = [0.2, 0.36, 0.5, 0.64, 0.8]
    .map((t) => {
      const x = 86 + 84 * t;
      const u = (x - 90) / 76;
      return `M${f(x)} ${f(174 + 46 * t * (1 - t))} L${f(x - (t - 0.5) * 3)} ${f(186 + 44 * u * (1 - u))}`;
    })
    .join(' ');
  return composeSymbol({
    noDrop: true,
    shade: 0.28,
    light: 0.4,
    defs: rad(`${g}s`, [[0, C.goldLight], [0.5, C.gold], [1, C.goldDeep]], 0.4, 0.1, 0.9),
    layers: [{ fills: `<path d="${jaw}" fill="url(#${g}s)"/>`, lines: `<path d="${jaw}"/>` }],
    top: `<path d="${teeth}" fill="${C.paper}" stroke="${C.ink}" stroke-width="3.8" stroke-linejoin="round"/>
      <path d="${toothLines}" stroke="${C.ink}" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M110 204 Q128 209 146 204" stroke="${C.goldDeep}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M84 184 Q88 198 100 205" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`,
  });
}
