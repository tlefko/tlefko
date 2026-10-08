/**
 * Third Rail Riches: station scenery pieces (docs/ART.md). Each piece is an original SVG string
 * authored in code; scene.ts composes the static ones into one backdrop per layout and
 * render/scene/Background.ts animates the rest (lamps, clock hands, signals, pigeons, crowd).
 *
 * Light: warm amber lamplight from the upper left (cel highlight), cool electric blue from the
 * third rail as a thin rim on the lower right. Scenery is kept darker and softer than the symbols
 * and characters so they always read first. No text anywhere: signs and posters are shapes only.
 */
import { C, nextId, f, mix, rng } from './kit';

/* ------------------------------------------------------------------ helpers */

export const svg = (w: number, h: number, body: string, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/** Brush ink, weighted on the lower right like the kit: a second pass nudged down-right. */
export function ink(lines: string, lw: number, color: string = C.ink): string {
  return `<g fill="none" stroke="${color}" stroke-width="${f(lw)}" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(${f(lw * 0.14)} ${f(lw * 0.18)})">${lines}</g>${lines}</g>`;
}

/**
 * Cel filter for scenery: ink shade hugging the lower-right rim, warm amber highlight on the
 * upper left, and a thin electric-blue rim on the lower-right edge (the third rail's light).
 * `k` scales the offsets relative to a 256 box.
 */
export function celFx(id: string, k: number, shade = 0.32, light = 0.32, volt = 0.22): string {
  return `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="${f(-13 * k)}" dy="${f(-15 * k)}" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="${f(1.3 * k)}" result="rimb"/>
    <feFlood flood-color="${C.ink}" flood-opacity="${shade}"/>
    <feComposite in2="rimb" operator="in" result="shade"/>
    <feOffset in="SourceAlpha" dx="${f(7 * k)}" dy="${f(9 * k)}" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="rim2"/>
    <feGaussianBlur in="rim2" stdDeviation="${f(3 * k)}" result="rim2b"/>
    <feFlood flood-color="${C.amberLight}" flood-opacity="${light}"/>
    <feComposite in2="rim2b" operator="in" result="hl"/>
    <feOffset in="SourceAlpha" dx="${f(-3.2 * k)}" dy="${f(-3.6 * k)}" result="o3"/>
    <feComposite in="SourceAlpha" in2="o3" operator="out" result="rim3"/>
    <feFlood flood-color="${C.voltLight}" flood-opacity="${volt}"/>
    <feComposite in2="rim3" operator="in" result="vr"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="hl"/><feMergeNode in="vr"/></feMerge>
  </filter>`;
}

export const lin = (id: string, stops: [number, string, number?][], x2 = 0, y2 = 1, extra = '') =>
  `<linearGradient id="${id}" ${/\bx2=/.test(extra) ? '' : `x1="0" y1="0" x2="${x2}" y2="${y2}" `}${extra}>${stops
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`)
    .join('')}</linearGradient>`;

export const radial = (id: string, stops: [number, string, number?][], extra = '') =>
  `<radialGradient id="${id}" ${extra}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</radialGradient>`;

/** Brass rivet: dark disc with a lit dot on the upper left. */
export const rivet = (x: number, y: number, r: number, base: string = C.goldDeep, lit: string = C.goldLight) =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${base}"/><circle cx="${f(x - r * 0.32)}" cy="${f(y - r * 0.36)}" r="${f(r * 0.42)}" fill="${lit}" opacity=".9"/>`;

/** Iron rivet (cast-iron columns, girders). */
export const ironRivet = (x: number, y: number, r: number) => rivet(x, y, r, C.ironDeep, C.ironLight);

/**
 * Embed a piece (a full `<svg>` string from this file) into a larger SVG at (x, y), w x h (h
 * defaults to the piece's own aspect).
 */
export function place(piece: string, x: number, y: number, w: number, h?: number, extra = ''): string {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(piece);
  const vw = vb ? Number(vb[1]) : 256;
  const vh = vb ? Number(vb[2]) : 256;
  const hh = h ?? (w * vh) / vw;
  return piece.replace(/^<svg [^>]*>/, `<svg x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(hh)}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none" overflow="visible" ${extra}>`);
}

/* --------------------------------------------------------------- wall tiles */

/**
 * Cream glazed subway tile in brick bond as an SVG pattern (user space, `tw` x `th` per tile):
 * warm grout, a glaze gradient per tile and a cut highlight along the top edge. `tone` shifts the
 * glaze (0 cream field, 1 the deep wainscot tile).
 */
export function tilePattern(id: string, tw: number, th: number, tone = 0): string {
  const g = Math.max(0.6, th * 0.09);
  const top = mix(C.tileLight, C.tileDeep, tone * 0.7);
  const bot = mix(C.tile, C.tileDeep, 0.25 + tone * 0.6);
  const grout = mix(C.tileDeep, C.inkSoft, 0.45 + tone * 0.2);
  const r = Math.min(th * 0.18, 3);
  const tile = (x: number, y: number) =>
    `<rect x="${f(x + g / 2)}" y="${f(y + g / 2)}" width="${f(tw - g)}" height="${f(th - g)}" rx="${f(r)}" fill="url(#${id}g)"/>
     <path d="M${f(x + g + r)} ${f(y + g * 1.3)} H${f(x + tw * 0.62)}" stroke="${C.white}" stroke-width="${f(Math.max(0.5, th * 0.07))}" stroke-linecap="round" opacity=".55"/>
     <path d="M${f(x + tw - g * 1.2)} ${f(y + g + r)} V${f(y + th - g - r)}" stroke="${C.ink}" stroke-width="${f(Math.max(0.4, th * 0.05))}" opacity=".12"/>`;
  return `${lin(`${id}g`, [[0, top], [0.55, mix(top, bot, 0.5)], [1, bot]])}
  <pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(tw)}" height="${f(th * 2)}">
    <rect width="${f(tw)}" height="${f(th * 2)}" fill="${grout}"/>
    ${tile(0, 0)}${tile(-tw / 2, th)}${tile(tw / 2, th)}
  </pattern>`;
}

/**
 * A sparse overlay that varies a few tiles (slightly darker, crazed or greenish), aligned to the
 * brick bond of `tilePattern` with the same tile size. Breaks the wallpaper look.
 */
export function tileVariation(id: string, tw: number, th: number, seed = 7): string {
  const R = rng(seed);
  const cols = 9;
  const rows = 8;
  let s = '';
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const v = R();
      if (v > 0.2) continue;
      const x = i * tw + (j % 2 ? tw / 2 : 0);
      const y = j * th;
      const c = v < 0.07 ? C.tileDeep : v < 0.12 ? C.emeraldDeep : C.inkSoft;
      const a = v < 0.07 ? 0.35 : v < 0.12 ? 0.1 : 0.08;
      s += `<rect x="${f(x + th * 0.06)}" y="${f(y + th * 0.06)}" width="${f(tw - th * 0.12)}" height="${f(th * 0.88)}" fill="${c}" opacity="${a}"/>`;
      if (v < 0.03) s += `<path d="M${f(x + tw * 0.2)} ${f(y + th * 0.2)} l${f(tw * 0.18)} ${f(th * 0.35)} l${f(tw * 0.14)} ${f(-th * 0.1)}" fill="none" stroke="${C.ink}" stroke-width="${f(th * 0.04)}" opacity=".35"/>`;
    }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(cols * tw)}" height="${f(rows * th)}">${s}</pattern>`;
}

/**
 * Deco mosaic border as a pattern (`m` = one tessera): gold and emerald checker rows framing a
 * cream course with maroon diamonds. Height 5 m.
 */
export function mosaicPattern(id: string, m: number): string {
  const cell = (x: number, y: number, c: string, a = 1) => `<rect x="${f(x * m + m * 0.06)}" y="${f(y * m + m * 0.06)}" width="${f(m * 0.88)}" height="${f(m * 0.88)}" fill="${c}" opacity="${a}"/>`;
  let s = `<rect width="${f(m * 8)}" height="${f(m * 5)}" fill="${mix(C.inkSoft, C.emeraldDeep, 0.4)}"/>`;
  for (let i = 0; i < 8; i++) {
    s += cell(i, 0, i % 2 ? C.gold : C.emerald);
    s += cell(i, 4, i % 2 ? C.emerald : C.gold);
    s += cell(i, 1, C.emeraldDeep);
    s += cell(i, 3, C.emeraldDeep);
    s += cell(i, 2, C.tile);
  }
  // a maroon diamond every 4 tesserae, centred on the middle course
  for (const cx of [2, 6]) {
    const x = cx * m;
    const y = 2.5 * m;
    s += `<path d="M${f(x)} ${f(y - m * 1.45)} L${f(x + m * 1.45)} ${f(y)} L${f(x)} ${f(y + m * 1.45)} L${f(x - m * 1.45)} ${f(y)} Z" fill="${C.maroon}"/>`;
    s += `<path d="M${f(x)} ${f(y - m * 0.7)} L${f(x + m * 0.7)} ${f(y)} L${f(x)} ${f(y + m * 0.7)} L${f(x - m * 0.7)} ${f(y)} Z" fill="${C.gold}"/>`;
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(m * 8)}" height="${f(m * 5)}">${s}</pattern>`;
}

/** Emerald glazed trim tiles (square, bevelled) as a pattern `t` units tall. */
export function emeraldPattern(id: string, t: number): string {
  const g = t * 0.07;
  return `${lin(`${id}g`, [[0, C.emeraldLight], [0.25, C.emerald], [1, C.emeraldDeep]])}
  <pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(t * 1.5)}" height="${f(t)}">
    <rect width="${f(t * 1.5)}" height="${f(t)}" fill="${mix(C.emeraldDeep, C.ink, 0.5)}"/>
    <rect x="${f(g)}" y="${f(g)}" width="${f(t * 1.5 - g * 2)}" height="${f(t - g * 2)}" rx="${f(t * 0.08)}" fill="url(#${id}g)"/>
    <path d="M${f(g * 2.5)} ${f(g * 2.2)} H${f(t * 0.9)}" stroke="${C.white}" stroke-width="${f(t * 0.06)}" stroke-linecap="round" opacity=".45"/>
  </pattern>`;
}

/* ---------------------------------------------------------- cast-iron column */

/**
 * Green cast-iron column, `h` units tall in a 100-wide box: flared deco capital with a brass
 * collar, riveted fluted shaft, stepped base. Engaged against the far wall.
 */
export function ironColumn(h = 600): string {
  const id = nextId('col');
  const cap = 86;
  const base = 54;
  const sx0 = 30;
  const sx1 = 70;
  const capD = `M2 4 H98 L94 22 C80 26 72 34 70 52 L70 ${cap} H30 L30 52 C28 34 20 26 6 22 Z`;
  const baseD = `M22 ${h - base} H78 L84 ${h - 26} H92 L96 ${h} H4 L8 ${h - 26} H16 Z`;
  let riv = '';
  for (let y = cap + 30; y < h - base - 16; y += 46) riv += ironRivet(sx0 + 6, y, 2.6) + ironRivet(sx1 - 6, y, 2.6);
  const body = `
    <rect x="${sx0}" y="${cap - 4}" width="${sx1 - sx0}" height="${h - base - cap + 8}" fill="url(#${id}s)"/>
    <path d="M44 ${cap} V${h - base} M56 ${cap} V${h - base}" stroke="${C.emeraldDeep}" stroke-width="3" opacity=".7"/>
    <path d="M38 ${cap + 4} V${h - base - 4}" stroke="${C.emeraldLight}" stroke-width="2.6" opacity=".45"/>
    ${riv}
    <path d="${capD}" fill="url(#${id}c)" filter="url(#${id}f)"/>
    <path d="M14 14 C30 18 40 30 42 50 M86 14 C70 18 60 30 58 50" fill="none" stroke="${C.emeraldDeep}" stroke-width="2.4" opacity=".8"/>
    <rect x="26" y="${cap - 8}" width="48" height="10" rx="3" fill="url(#${id}b)"/>
    <path d="${baseD}" fill="url(#${id}c)" filter="url(#${id}f)"/>
    <rect x="26" y="${h - base - 4}" width="48" height="9" rx="3" fill="url(#${id}b)"/>
    <path d="M10 ${h - 22} H90" stroke="${C.emeraldLight}" stroke-width="2" opacity=".35"/>`;
  const lines = `<path d="M${sx0} ${cap} V${h - base} M${sx1} ${cap} V${h - base}"/><path d="${capD}"/><path d="${baseD}"/>
    <rect x="26" y="${cap - 8}" width="48" height="10" rx="3" stroke-width="2.6"/><rect x="26" y="${h - base - 4}" width="48" height="9" rx="3" stroke-width="2.6"/>`;
  return svg(
    100,
    h,
    `${body}${ink(lines, 4)}`,
    `${celFx(`${id}f`, 0.4, 0.3, 0.3, 0.18)}
     ${lin(`${id}s`, [[0, mix(C.emerald, C.emeraldLight, 0.25)], [0.3, C.emerald], [0.75, C.emeraldDeep], [1, mix(C.emeraldDeep, C.ink, 0.4)]], 1, 0)}
     ${lin(`${id}c`, [[0, mix(C.emerald, C.emeraldLight, 0.3)], [1, C.emeraldDeep]])}
     ${lin(`${id}b`, [[0, C.goldLight], [0.4, C.gold], [1, C.goldDeep]])}`,
  );
}

/* --------------------------------------------------------------- tunnel mouth */

/** Tunnel portal geometry (viewBox units): the box and the vanishing point the headlight sits at. */
export const TUNNEL = { w: 400, h: 520, vpL: { x: 150, y: 352 }, vpR: { x: 250, y: 352 } };

/**
 * A tunnel mouth: an arch of emerald-glazed voussoirs with a brass keystone, around a dark bore
 * whose iron ribs recede toward a vanishing point off toward the screen edge (`side` -1 = the
 * left tunnel, bores to the left). Rails run in along the floor.
 */
export function tunnelPortal(side: -1 | 1 = -1): string {
  const id = nextId('tn');
  const vp = side < 0 ? TUNNEL.vpL : TUNNEL.vpR;
  const W = TUNNEL.w;
  const H = TUNNEL.h;
  const cx = 200;
  const spring = 210;
  const ri = 150; // inner radius
  const ro = 188; // outer radius
  const opening = `M${cx - ri} ${H} V${spring} A${ri} ${ri} 0 0 1 ${cx + ri} ${spring} V${H} Z`;
  const outer = `M${cx - ro} ${H} V${spring} A${ro} ${ro} 0 0 1 ${cx + ro} ${spring} V${H} Z`;
  // receding ribs: the opening scaled toward the vanishing point
  let ribs = '';
  const ribK = [0.8, 0.62, 0.47, 0.35, 0.25, 0.17];
  ribK.forEach((k, i) => {
    const t = `translate(${f(vp.x * (1 - k))} ${f(vp.y * (1 - k))}) scale(${k})`;
    const a = 0.75 - i * 0.1;
    ribs += `<path d="M${cx - ri} ${H} V${spring} A${ri} ${ri} 0 0 1 ${cx + ri} ${spring} V${H}" transform="${t}" fill="none" stroke="${mix(C.iron, C.tunnel, 0.3 + i * 0.1)}" stroke-width="${f(14 / Math.max(0.5, k))}" opacity="${a.toFixed(2)}"/>`;
    ribs += `<path d="M${cx - ri} ${H} V${spring} A${ri} ${ri} 0 0 1 ${cx + ri} ${spring}" transform="${t}" fill="none" stroke="${C.ironLight}" stroke-width="${f(2.5 / Math.max(0.5, k))}" opacity="${(0.16 - i * 0.02).toFixed(2)}"/>`;
  });
  // trackbed and rails converging on the vanishing point, sleepers closing up with depth
  const bx0 = cx - ri * 0.62;
  const bx1 = cx + ri * 0.62;
  const at = (x: number, d: number) => [vp.x + (x - vp.x) * d, vp.y + (H - vp.y) * d] as const;
  const bed = `M${bx0} ${H} L${f(at(bx0, 0.04)[0])} ${f(at(bx0, 0.04)[1])} L${f(at(bx1, 0.04)[0])} ${f(at(bx1, 0.04)[1])} L${bx1} ${H} Z`;
  let sleepers = '';
  for (const d of [1, 0.72, 0.52, 0.38, 0.28, 0.2, 0.14]) {
    const [x0, y0] = at(bx0 + 10, d);
    const [x1] = at(bx1 - 10, d);
    sleepers += `<path d="M${f(x0)} ${f(y0)} H${f(x1)}" stroke="${mix(C.woodDeep, C.ink, 0.3)}" stroke-width="${f(10 * d)}" opacity="${(0.4 + d * 0.5).toFixed(2)}"/>`;
  }
  const rails = [cx - ri * 0.36, cx + ri * 0.36]
    .map((x0) => {
      const [x1, y1] = at(x0, 0.04);
      return `<path d="M${f(x0)} ${H} L${f(x1)} ${f(y1)}" stroke="${C.steelDeep}" stroke-width="8"/><path d="M${f(x0 - 2)} ${H} L${f(x1)} ${f(y1)}" stroke="${C.steelLight}" stroke-width="2.4" opacity=".55"/>`;
    })
    .join('');
  const trackbed = `<path d="${bed}" fill="${mix(C.tunnel, C.iron, 0.3)}" opacity=".8"/>${sleepers}${rails}`;
  // voussoirs: wedge stones round the arch, emerald with cream joints
  let vs = '';
  const n = 13;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const a2 = Math.PI + ((i + 0.5) / n) * Math.PI;
    if (i < n) {
      const pts = [
        [cx + Math.cos(a) * ri, spring + Math.sin(a) * ri],
        [cx + Math.cos(a) * ro, spring + Math.sin(a) * ro],
        [cx + Math.cos(a + Math.PI / n) * ro, spring + Math.sin(a + Math.PI / n) * ro],
        [cx + Math.cos(a + Math.PI / n) * ri, spring + Math.sin(a + Math.PI / n) * ri],
      ];
      vs += `<path d="M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')} Z" fill="url(#${id}v${i % 2})"/>`;
      vs += `<path d="M${f(cx + Math.cos(a2) * (ri + 6))} ${f(spring + Math.sin(a2) * (ri + 6))} L${f(cx + Math.cos(a2) * (ri + 18))} ${f(spring + Math.sin(a2) * (ri + 18))}" stroke="${C.white}" stroke-width="2.4" stroke-linecap="round" opacity=".35"/>`;
    }
    vs += `<path d="M${f(cx + Math.cos(a) * ri)} ${f(spring + Math.sin(a) * ri)} L${f(cx + Math.cos(a) * ro)} ${f(spring + Math.sin(a) * ro)}" stroke="${C.tileDeep}" stroke-width="3.2"/>`;
  }
  // jambs: stacked emerald blocks down both sides
  let jamb = '';
  for (let y = spring; y < H; y += 44) {
    for (const x of [cx - ro, cx + ri]) {
      jamb += `<rect x="${x}" y="${y}" width="${ro - ri}" height="44" fill="url(#${id}v${(y / 44) % 2 | 0})" stroke="${C.tileDeep}" stroke-width="3"/>`;
    }
  }
  const key = `M${cx - 22} ${spring - ro - 14} H${cx + 22} L${cx + 15} ${spring - ri + 6} H${cx - 15} Z`;
  const keyDeco = `<path d="M${cx} ${spring - ro - 4} L${cx + 8} ${spring - ro + 18} L${cx} ${spring - ro + 40} L${cx - 8} ${spring - ro + 18} Z" fill="${C.goldDeep}" opacity=".7"/>`;
  return svg(
    W,
    H,
    `<path d="${outer}" fill="${C.ink}" opacity=".35" transform="translate(8 10)"/>
    <path d="${opening}" fill="url(#${id}in)"/>
    ${ribs}
    ${trackbed}
    <path d="${opening}" fill="url(#${id}sh)"/>
    ${vs}${jamb}
    <path d="${key}" fill="url(#${id}k)"/>${keyDeco}
    ${ink(`<path d="${outer}"/><path d="M${cx - ri} ${H} V${spring} A${ri} ${ri} 0 0 1 ${cx + ri} ${spring} V${H}"/><path d="${key}" stroke-width="4"/>`, 6)}`,
    `${radial(`${id}in`, [[0, C.ink], [0.55, mix(C.tunnel, C.ink, 0.5)], [1, mix(C.tunnel, C.iron, 0.25)]], `cx="${vp.x / W}" cy="${vp.y / H}" r=".75"`)}
     ${lin(`${id}sh`, [[0, C.ink, 0.0], [0.75, C.ink, 0.0], [1, C.ink, 0.55]])}
     ${lin(`${id}v0`, [[0, mix(C.emerald, C.emeraldLight, 0.2)], [1, C.emeraldDeep]])}
     ${lin(`${id}v1`, [[0, C.emerald], [1, mix(C.emeraldDeep, C.ink, 0.25)]])}
     ${lin(`${id}k`, [[0, C.goldLight], [0.45, C.gold], [1, C.goldDeep]])}`,
  );
}

/* ---------------------------------------------------------------- signal head */

/** Signal head geometry: lens centres (top red, amber, bottom green) and lens radius. */
export const SIGNAL = {
  w: 72,
  h: 210,
  r: 15,
  lenses: [
    { x: 36, y: 42, color: 'red' as const },
    { x: 36, y: 94, color: 'amber' as const },
    { x: 36, y: 146, color: 'green' as const },
  ],
};

/** Lens glass colours (lit) for the signal's glow sprites. */
export const SIGNAL_COLORS = { red: C.crimsonLight, amber: C.amber, green: C.emeraldLight };

/**
 * A three-aspect signal head on a short bracket: black iron housing, round hooded lenses (dark
 * glass: the lit aspect is a glow sprite laid over it by the renderer).
 */
export function signalHead(): string {
  const id = nextId('sg');
  const lens = SIGNAL.lenses
    .map(({ x, y, color }) => {
      const base = color === 'red' ? mix(C.crimsonDeep, C.ink, 0.25) : color === 'amber' ? mix(C.amberDeep, C.ink, 0.45) : mix(C.emeraldDeep, C.ink, 0.25);
      return `<circle cx="${x}" cy="${y}" r="21" fill="${C.ink}"/>
      <circle cx="${x}" cy="${y}" r="${SIGNAL.r}" fill="${base}"/>
      <path d="M${x - 9} ${y - 5} A10 10 0 0 1 ${x + 2} ${y - 11}" fill="none" stroke="${C.white}" stroke-width="3" stroke-linecap="round" opacity=".45"/>
      <path d="M${x - 24} ${y - 12} C${x - 20} ${y - 30} ${x + 20} ${y - 30} ${x + 24} ${y - 12} L${x + 20} ${y - 10} C${x + 14} ${y - 22} ${x - 14} ${y - 22} ${x - 20} ${y - 10} Z" fill="url(#${id}m)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>`;
    })
    .join('');
  const body = `M8 18 Q8 8 18 8 H54 Q64 8 64 18 V170 Q64 180 54 180 H18 Q8 180 8 170 Z`;
  return svg(
    SIGNAL.w,
    SIGNAL.h,
    `<path d="${body}" fill="${C.ink}" opacity=".35" transform="translate(5 6)"/>
    <rect x="30" y="178" width="12" height="32" fill="url(#${id}m)"/>
    <path d="${body}" fill="url(#${id}b)" filter="url(#${id}f)"/>
    ${ironRivet(16, 16, 2.6)}${ironRivet(56, 16, 2.6)}${ironRivet(16, 172, 2.6)}${ironRivet(56, 172, 2.6)}
    ${lens}
    ${ink(`<path d="${body}"/><path d="M30 180 V210 M42 180 V210"/>`, 4)}`,
    `${celFx(`${id}f`, 0.3, 0.3, 0.25, 0.25)}
     ${lin(`${id}b`, [[0, C.iron], [1, C.ironDeep]], 1, 1)}
     ${lin(`${id}m`, [[0, C.ironLight], [1, C.ironDeep]])}`,
  );
}

/* ------------------------------------------------------------------- clock */

/** Clock geometry in its 256 box: centre and face radius; hands share these units. */
export const CLOCK = { size: 256, cx: 128, cy: 128, face: 94 };
/** Hand sprite boxes (clock units): width, height and the pivot inside the box. */
export const HAND = { w: 24, h: 112, px: 12, py: 96 };

/**
 * The big round station clock: brass bezel, emerald enamel ring, cream face with minute ticks
 * and heavy hour bars (no numerals), a glass glint. The hands are separate sprites.
 */
export function clockFace(): string {
  const id = nextId('ck');
  const { cx, cy, face } = CLOCK;
  let ticks = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const s = Math.sin(a);
    const c = -Math.cos(a);
    if (i % 5 === 0) {
      const r0 = i % 15 === 0 ? 64 : 70;
      ticks += `<path d="M${f(cx + s * r0)} ${f(cy + c * r0)} L${f(cx + s * 86)} ${f(cy + c * 86)}" stroke="${C.ink}" stroke-width="${i % 15 === 0 ? 9 : 6.5}" stroke-linecap="butt"/>`;
    } else ticks += `<path d="M${f(cx + s * 81)} ${f(cy + c * 81)} L${f(cx + s * 87)} ${f(cy + c * 87)}" stroke="${C.inkSoft}" stroke-width="2.2"/>`;
  }
  // deco sunburst faintly printed in the face
  let rays = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    rays += `<path d="M${cx} ${cy} L${f(cx + Math.sin(a - 0.06) * 60)} ${f(cy - Math.cos(a - 0.06) * 60)} L${f(cx + Math.sin(a + 0.06) * 60)} ${f(cy - Math.cos(a + 0.06) * 60)} Z" fill="${C.tileDeep}" opacity=".22"/>`;
  }
  return svg(
    256,
    256,
    `<circle cx="${cx + 6}" cy="${cy + 9}" r="122" fill="${C.ink}" opacity=".45"/>
    <circle cx="${cx}" cy="${cy}" r="120" fill="url(#${id}br)" filter="url(#${id}f)"/>
    <circle cx="${cx}" cy="${cy}" r="108" fill="none" stroke="${C.goldDeep}" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="103" fill="url(#${id}em)"/>
    <circle cx="${cx}" cy="${cy}" r="${face}" fill="url(#${id}fc)"/>
    ${rays}
    <circle cx="${cx}" cy="${cy}" r="40" fill="none" stroke="${C.tileDeep}" stroke-width="2" opacity=".6"/>
    ${ticks}
    ${[0, 1, 2, 3].map((k) => { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; return rivet(cx + Math.sin(a) * 113.5, cy - Math.cos(a) * 113.5, 3.4); }).join('')}
    <path d="M${cx - 76} ${cy - 30} A82 82 0 0 1 ${cx - 22} ${cy - 80}" fill="none" stroke="${C.white}" stroke-width="9" stroke-linecap="round" opacity=".32"/>
    <path d="M${cx - 80} ${cy - 6} A82 82 0 0 1 ${cx - 78} ${cy - 20}" fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round" opacity=".25"/>
    ${ink(`<circle cx="${cx}" cy="${cy}" r="120"/><circle cx="${cx}" cy="${cy}" r="${face}" stroke-width="4"/>`, 6)}`,
    `${celFx(`${id}f`, 1, 0.3, 0.35, 0.25)}
     ${lin(`${id}br`, [[0, C.goldLight], [0.35, C.gold], [1, C.goldDeep]], 1, 1)}
     ${lin(`${id}em`, [[0, C.emeraldLight], [0.4, C.emerald], [1, C.emeraldDeep]], 1, 1)}
     ${radial(`${id}fc`, [[0, C.tileLight], [0.7, C.tile], [1, mix(C.tile, C.tileDeep, 0.7)]], 'cx=".42" cy=".38" r=".7"')}`,
  );
}

/** A clock hand pointing up, pivot at HAND.px/py. Spade-tipped deco hands in ink; the minute hand carries the brass boss. */
export function clockHand(kind: 'hour' | 'minute'): string {
  const { w, h, px, py } = HAND;
  const tip = kind === 'minute' ? 12 : 40;
  const hw = kind === 'minute' ? 3.4 : 4.6;
  const sp = kind === 'minute' ? 7 : 9;
  const d = `M${px - hw} ${py + 12} L${px - hw} ${tip + 22} L${px - sp} ${tip + 14} L${px} ${tip} L${px + sp} ${tip + 14} L${px + hw} ${tip + 22} L${px + hw} ${py + 12} Z`;
  const boss = kind === 'minute' ? `<circle cx="${px}" cy="${py}" r="8" fill="${C.ink}"/><circle cx="${px}" cy="${py}" r="5.2" fill="${C.gold}"/><circle cx="${px - 1.6}" cy="${py - 1.8}" r="1.8" fill="${C.goldLight}"/>` : `<circle cx="${px}" cy="${py}" r="9" fill="${C.ink}"/>`;
  return svg(w, h, `<path d="${d}" fill="${C.ink}" opacity=".3" transform="translate(2 3)"/><path d="${d}" fill="${C.ink}"/>${boss}`);
}

/* ------------------------------------------------------------- pendant lamp */

/** Pendant lamp geometry (viewBox units): the rod attaches at (cx, 0); globe centre and radius. */
export const PENDANT = { w: 128, h: 188, cx: 64, gy: 108, r: 52 };

/**
 * Hanging amber pendant globe: brass ceiling fitter, ribbed opal glass globe glowing amber, brass
 * finial. The renderer adds the glow and pools of light.
 */
export function pendantLamp(): string {
  const id = nextId('pl');
  const { cx, gy, r } = PENDANT;
  const fitter = `M${cx - 6} 0 H${cx + 6} V14 C${cx + 14} 16 ${cx + 28} 30 ${cx + 30} 54 H${cx - 30} C${cx - 28} 30 ${cx - 14} 16 ${cx - 6} 14 Z`;
  const fin = `M${cx - 10} ${gy + r - 3} H${cx + 10} L${cx + 6} ${gy + r + 10} Q${cx} ${gy + r + 22} ${cx - 6} ${gy + r + 10} Z`;
  const ribs = [-0.62, -0.25, 0.25, 0.62]
    .map((k) => `<path d="M${f(cx + k * r * 0.55)} ${gy - r + 6} Q${f(cx + k * r * 1.2)} ${gy} ${f(cx + k * r * 0.55)} ${gy + r - 4}" fill="none" stroke="${C.amberDeep}" stroke-width="2.4" opacity=".35"/>`)
    .join('');
  return svg(
    PENDANT.w,
    PENDANT.h,
    `<circle cx="${cx}" cy="${gy}" r="${r}" fill="url(#${id}g)"/>
    ${ribs}
    <circle cx="${cx}" cy="${gy}" r="${r * 0.42}" fill="${C.amberLight}" opacity=".55"/>
    <path d="M${cx - r * 0.62} ${gy - r * 0.28} A${r * 0.66} ${r * 0.66} 0 0 1 ${cx - r * 0.12} ${gy - r * 0.66}" fill="none" stroke="${C.white}" stroke-width="7" stroke-linecap="round" opacity=".7"/>
    <path d="M${cx - r} ${gy + 2} H${cx + r}" stroke="${C.goldDeep}" stroke-width="3" opacity=".5"/>
    <path d="${fitter}" fill="url(#${id}b)"/>
    <rect x="${cx - 32}" y="50" width="64" height="9" rx="3" fill="url(#${id}b)"/>
    <path d="M${cx - 22} 30 H${cx + 22}" stroke="${C.goldLight}" stroke-width="2" opacity=".6"/>
    <path d="${fin}" fill="url(#${id}b)"/>
    ${ink(`<circle cx="${cx}" cy="${gy}" r="${r}"/><path d="${fitter}"/><rect x="${cx - 32}" y="50" width="64" height="9" rx="3" stroke-width="3"/><path d="${fin}" stroke-width="3"/>`, 4.5)}`,
    `${radial(`${id}g`, [[0, C.cream], [0.35, C.amberLight], [0.75, C.amber], [1, C.amberDeep]], 'cx=".44" cy=".48" r=".6"')}
     ${lin(`${id}b`, [[0, C.goldLight], [0.4, C.gold], [1, C.goldDeep]], 1, 1)}`,
  );
}

/* ---------------------------------------------------- enamel signs, posters */

/**
 * Enamel sign plates (shapes only, never text): 0 an emerald direction plate with an arrow, 1 a
 * maroon lozenge medallion, 2 a navy banded plate with a deco chevron.
 */
export function enamelSign(kind: 0 | 1 | 2 = 0): string {
  const id = nextId('es');
  const W = 300;
  const H = 96;
  let plate = '';
  let deco = '';
  let line = '';
  if (kind === 0) {
    plate = `<rect x="6" y="8" width="${W - 12}" height="${H - 16}" rx="14" fill="${C.emeraldDeep}"/><rect x="14" y="16" width="${W - 28}" height="${H - 32}" rx="9" fill="url(#${id}g)"/>`;
    deco = `<rect x="14" y="16" width="${W - 28}" height="${H - 32}" rx="9" fill="none" stroke="${C.cream}" stroke-width="4"/>
      <path d="M${W - 78} 30 L${W - 40} 48 L${W - 78} 66 V56 H${W - 120} V40 H${W - 78} Z" fill="${C.cream}"/>
      <rect x="34" y="38" width="120" height="8" rx="4" fill="${C.cream}" opacity=".85"/><rect x="34" y="52" width="86" height="8" rx="4" fill="${C.cream}" opacity=".6"/>`;
    line = `<rect x="6" y="8" width="${W - 12}" height="${H - 16}" rx="14"/>`;
  } else if (kind === 1) {
    plate = `<rect x="6" y="18" width="${W - 12}" height="${H - 36}" rx="${(H - 36) / 2}" fill="url(#${id}m)"/>`;
    deco = `<rect x="16" y="26" width="${W - 32}" height="${H - 52}" rx="${(H - 52) / 2}" fill="none" stroke="${C.cream}" stroke-width="3.5"/>
      <path d="M${W / 2} 4 L${W / 2 + 46} ${H / 2} L${W / 2} ${H - 4} L${W / 2 - 46} ${H / 2} Z" fill="${C.cream}"/>
      <path d="M${W / 2} 18 L${W / 2 + 32} ${H / 2} L${W / 2} ${H - 18} L${W / 2 - 32} ${H / 2} Z" fill="${C.maroon}"/>
      <circle cx="${W / 2}" cy="${H / 2}" r="10" fill="${C.gold}"/>
      <rect x="34" y="${H / 2 - 4}" width="70" height="8" rx="4" fill="${C.cream}" opacity=".7"/><rect x="${W - 104}" y="${H / 2 - 4}" width="70" height="8" rx="4" fill="${C.cream}" opacity=".7"/>`;
    line = `<rect x="6" y="18" width="${W - 12}" height="${H - 36}" rx="${(H - 36) / 2}"/><path d="M${W / 2} 4 L${W / 2 + 46} ${H / 2} L${W / 2} ${H - 4} L${W / 2 - 46} ${H / 2} Z" stroke-width="3"/>`;
  } else {
    plate = `<rect x="6" y="8" width="${W - 12}" height="${H - 16}" rx="6" fill="url(#${id}n)"/>`;
    deco = `<rect x="6" y="20" width="${W - 12}" height="8" fill="${C.cream}" opacity=".85"/><rect x="6" y="${H - 28}" width="${W - 12}" height="8" fill="${C.cream}" opacity=".85"/>
      <path d="M${W / 2 - 50} 36 L${W / 2} 62 L${W / 2 + 50} 36" fill="none" stroke="${C.gold}" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="40" cy="${H / 2}" r="9" fill="${C.gold}"/><circle cx="${W - 40}" cy="${H / 2}" r="9" fill="${C.gold}"/>`;
    line = `<rect x="6" y="8" width="${W - 12}" height="${H - 16}" rx="6"/>`;
  }
  const screws = kind === 1 ? '' : rivet(18, 18, 3.2, C.g4, C.g1) + rivet(W - 18, 18, 3.2, C.g4, C.g1) + rivet(18, H - 18, 3.2, C.g4, C.g1) + rivet(W - 18, H - 18, 3.2, C.g4, C.g1);
  return svg(
    W,
    H,
    `<g transform="translate(5 6)" opacity=".35">${plate.replace(/fill="[^"]+"/g, `fill="${C.ink}"`)}</g>
    <g filter="url(#${id}f)">${plate}</g>${deco}${screws}
    <path d="M30 22 H120" stroke="${C.white}" stroke-width="4" stroke-linecap="round" opacity=".35"/>
    ${ink(line, 4.5)}`,
    `${celFx(`${id}f`, 0.5, 0.3, 0.3, 0.2)}
     ${lin(`${id}g`, [[0, C.emerald], [1, C.emeraldDeep]])}
     ${lin(`${id}m`, [[0, C.maroonLight], [0.3, C.maroon], [1, C.maroonDeep]])}
     ${lin(`${id}n`, [[0, C.uniformLight], [0.35, C.uniform], [1, C.uniformDeep]])}`,
  );
}

/**
 * Framed poster with abstract deco artwork (no lettering): 0 a streamliner nose bursting out of a
 * sunburst, 1 a night skyline under a big moon, 2 a lightning bolt over concentric rings.
 */
export function poster(kind: 0 | 1 | 2 = 0): string {
  const id = nextId('ps');
  const W = 200;
  const H = 280;
  const ix = 20;
  const iy = 20;
  const iw = W - 40;
  const ih = H - 40;
  let art = '';
  if (kind === 0) {
    let rays = '';
    for (let i = 0; i < 14; i++) {
      const a = Math.PI + (i / 13) * Math.PI;
      rays += `<path d="M100 150 L${f(100 + Math.cos(a - 0.08) * 200)} ${f(150 + Math.sin(a - 0.08) * 200)} L${f(100 + Math.cos(a + 0.08) * 200)} ${f(150 + Math.sin(a + 0.08) * 200)} Z" fill="${C.amber}" opacity=".55"/>`;
    }
    art = `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${C.maroonDeep}"/>${rays}
      <circle cx="100" cy="150" r="46" fill="${C.amberLight}"/>
      <path d="M48 250 C50 180 70 140 100 132 C130 140 150 180 152 250 Z" fill="${C.maroon}"/>
      <path d="M70 250 C72 200 84 172 100 166 C116 172 128 200 130 250 Z" fill="${C.cream}"/>
      <circle cx="100" cy="186" r="15" fill="${C.amberLight}" stroke="${C.goldDeep}" stroke-width="4"/>
      <path d="M80 222 H120 M78 232 H122 M76 242 H124" stroke="${C.goldDeep}" stroke-width="4"/>
      <rect x="40" y="36" width="120" height="12" rx="3" fill="${C.cream}" opacity=".9"/><rect x="60" y="54" width="80" height="8" rx="3" fill="${C.cream}" opacity=".6"/>`;
  } else if (kind === 1) {
    const R = rng(12);
    let win = '';
    const blds = [
      [22, 150, 34],
      [52, 112, 30],
      [80, 70, 40],
      [118, 128, 26],
      [142, 96, 38],
    ];
    for (const [x, y, w] of blds) for (let wy = y + 10; wy < 250; wy += 14) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (R() < 0.35) win += `<rect x="${wx}" y="${wy}" width="4" height="6" fill="${C.amberLight}"/>`;
    art = `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#${id}sky)"/>
      <circle cx="132" cy="72" r="30" fill="${C.cream}"/><circle cx="142" cy="66" r="26" fill="${C.voltNight}" opacity=".55"/>
      ${blds.map(([x, y, w]) => `<path d="M${x} 260 V${y + 8} L${x + w / 2} ${y} L${x + w} ${y + 8} V260 Z" fill="${C.uniformDeep}"/>`).join('')}
      <path d="M100 70 V40" stroke="${C.uniformDeep}" stroke-width="3"/>${win}
      <path d="M${ix} 236 H${ix + iw}" stroke="${C.maroon}" stroke-width="10"/><path d="M${ix} 248 H${ix + iw}" stroke="${C.gold}" stroke-width="4"/>`;
  } else {
    art = `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="${C.emeraldDeep}"/>
      ${[86, 66, 46, 26].map((r, i) => `<circle cx="100" cy="140" r="${r}" fill="${i % 2 ? C.emerald : C.cream}" opacity="${i % 2 ? 1 : 0.9}"/>`).join('')}
      <path d="M112 64 L74 150 H100 L84 218 L132 120 H104 Z" fill="${C.volt}" stroke="${C.voltNight}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M108 78 L84 140" stroke="${C.voltCore}" stroke-width="4" stroke-linecap="round"/>
      <rect x="40" y="236" width="120" height="10" rx="3" fill="${C.cream}" opacity=".8"/>`;
  }
  return svg(
    W,
    H,
    `<rect x="9" y="11" width="${W - 6}" height="${H - 6}" rx="6" fill="${C.ink}" opacity=".35"/>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="6" fill="url(#${id}fr)" filter="url(#${id}f)"/>
    <clipPath id="${id}c"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}"/></clipPath>
    <g clip-path="url(#${id}c)">${art}<path d="M${ix} ${iy} L${ix + iw} ${iy + ih * 0.6} V${iy} Z" fill="${C.white}" opacity=".07"/>
    <path d="M${ix + iw * 0.15} ${iy + ih} L${ix + iw * 0.3} ${iy + ih * 0.82} L${ix + iw * 0.4} ${iy + ih}" fill="${C.paperWarm}" opacity=".5"/></g>
    ${rivet(12, 12, 3)}${rivet(W - 12, 12, 3)}${rivet(12, H - 12, 3)}${rivet(W - 12, H - 12, 3)}
    ${ink(`<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="6"/><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" stroke-width="3"/>`, 4.5)}`,
    `${celFx(`${id}f`, 0.6)}
     ${lin(`${id}fr`, [[0, C.goldLight], [0.3, C.gold], [1, C.goldDeep]], 1, 1)}
     ${lin(`${id}sky`, [[0, C.voltNight], [1, C.uniform]])}`,
  );
}

/* --------------------------------------------------------- platform furniture */

/** Station bench: three oak slats on emerald cast-iron ends with deco scroll legs. Feet at y 172 of 180. */
export function bench(): string {
  const id = nextId('bn');
  const W = 360;
  const end = (x: number, flip: number) => {
    const d = `M${x} 40 C${x - 6 * flip} 70 ${x - 4 * flip} 92 ${x + 4 * flip} 110 L${x - 14 * flip} 172 H${x - 2 * flip} L${x + 12 * flip} 122 L${x + 26 * flip} 172 H${x + 38 * flip} L${x + 20 * flip} 110 C${x + 18 * flip} 96 ${x + 14 * flip} 70 ${x + 16 * flip} 40 Z`;
    return { d, scroll: `M${x + 6 * flip} 128 C${x - 10 * flip} 140 ${x - 2 * flip} 158 ${x + 10 * flip} 150` };
  };
  const ends = [end(40, 1), end(W - 40, -1)];
  const slat = (y: number, h: number) => `<rect x="14" y="${y}" width="${W - 28}" height="${h}" rx="5" fill="url(#${id}w)"/><path d="M24 ${y + 3} H${W - 30}" stroke="${C.woodLight}" stroke-width="2" opacity=".5"/>`;
  const slatLine = (y: number, h: number) => `<rect x="14" y="${y}" width="${W - 28}" height="${h}" rx="5"/>`;
  return svg(
    W,
    180,
    `<ellipse cx="${W / 2}" cy="174" rx="${W * 0.48}" ry="8" fill="${C.ink}" opacity=".45"/>
    ${slat(30, 18)}${slat(54, 18)}
    <g filter="url(#${id}f)">${ends.map((e) => `<path d="${e.d}" fill="url(#${id}i)"/>`).join('')}</g>
    ${slat(100, 20)}
    <path d="M14 122 H${W - 14}" stroke="${C.ink}" stroke-width="5" opacity=".4"/>
    ${ends.map((e) => `<path d="${e.scroll}" fill="none" stroke="${C.emeraldLight}" stroke-width="3" opacity=".5"/>`).join('')}
    ${ink(`${slatLine(30, 18)}${slatLine(54, 18)}${slatLine(100, 20)}${ends.map((e) => `<path d="${e.d}"/>`).join('')}`, 4)}`,
    `${celFx(`${id}f`, 0.5)}
     ${lin(`${id}w`, [[0, mix(C.wood, C.woodLight, 0.3)], [1, C.woodMid]])}
     ${lin(`${id}i`, [[0, C.emerald], [1, C.emeraldDeep]], 1, 1)}`,
  );
}

/**
 * Penny vending machine: a tall maroon cabinet with a deco crest, a mirror, four brass plunger
 * pulls and coin slot, on stubby legs. Feet at y 326 of 330.
 */
export function vendingMachine(): string {
  const id = nextId('vm');
  const W = 150;
  const body = `M16 64 Q16 40 40 34 L75 24 L110 34 Q134 40 134 64 V300 H16 Z`;
  const pulls = [180, 206, 232, 258]
    .map((y) => `<rect x="34" y="${y}" width="82" height="16" rx="4" fill="${C.maroonDeep}"/><rect x="62" y="${y + 3}" width="26" height="10" rx="5" fill="url(#${id}b)" stroke="${C.ink}" stroke-width="2"/>`)
    .join('');
  return svg(
    W,
    330,
    `<ellipse cx="${W / 2}" cy="326" rx="68" ry="6" fill="${C.ink}" opacity=".45"/>
    <rect x="24" y="296" width="14" height="30" fill="${C.ironDeep}"/><rect x="112" y="296" width="14" height="30" fill="${C.ironDeep}"/>
    <path d="${body}" fill="url(#${id}m)" filter="url(#${id}f)"/>
    <path d="M40 34 L75 24 L110 34 L106 44 L75 36 L44 44 Z" fill="url(#${id}b)"/>
    <path d="M75 44 L88 60 L75 76 L62 60 Z" fill="${C.gold}"/>
    <rect x="30" y="86" width="90" height="78" rx="6" fill="url(#${id}g)"/>
    <path d="M38 150 L98 92 M60 156 L112 104" stroke="${C.white}" stroke-width="5" opacity=".35" stroke-linecap="round"/>
    ${pulls}
    <rect x="100" y="282" width="20" height="8" rx="2" fill="${C.ink}"/>
    ${ink(`<path d="${body}"/><rect x="30" y="86" width="90" height="78" rx="6" stroke-width="3"/><path d="M24 300 V326 M38 300 V326 M112 300 V326 M126 300 V326"/>`, 4)}`,
    `${celFx(`${id}f`, 0.6)}
     ${lin(`${id}m`, [[0, C.maroonLight], [0.25, C.maroon], [1, C.maroonDeep]], 1, 0.4)}
     ${lin(`${id}b`, [[0, C.goldLight], [0.4, C.gold], [1, C.goldDeep]], 1, 1)}
     ${lin(`${id}g`, [[0, C.steelLight], [0.5, C.steel], [1, C.steelDeep]], 1, 1)}`,
  );
}

/** Litter bin: an emerald iron basket on a stem. Base at y 200 of 204. */
export function litterBin(): string {
  const id = nextId('lb');
  const d = `M14 20 H106 L96 150 H24 Z`;
  let bars = '';
  for (let x = 30; x < 100; x += 14) bars += `<path d="M${x} 28 L${x + (60 - x) * 0.1} 142" stroke="${C.emeraldDeep}" stroke-width="5"/>`;
  return svg(
    120,
    204,
    `<ellipse cx="60" cy="200" rx="44" ry="5" fill="${C.ink}" opacity=".45"/>
    <rect x="54" y="150" width="12" height="46" fill="${C.ironDeep}"/><rect x="36" y="192" width="48" height="8" rx="3" fill="${C.iron}"/>
    <path d="${d}" fill="url(#${id}g)" filter="url(#${id}f)"/>${bars}
    <path d="M28 30 C40 14 54 22 62 10 C72 18 84 12 94 26" fill="${C.paperWarm}" opacity=".8"/>
    <rect x="10" y="16" width="100" height="12" rx="4" fill="url(#${id}g)"/>
    ${ink(`<path d="${d}"/><rect x="10" y="16" width="100" height="12" rx="4" stroke-width="3"/><path d="M54 150 V196 M66 150 V196"/>`, 4)}`,
    `${celFx(`${id}f`, 0.4)}${lin(`${id}g`, [[0, C.emerald], [1, C.emeraldDeep]], 1, 1)}`,
  );
}

/** Floor vent grate (seen from above, foreshortened). */
export function floorGrate(): string {
  let slots = '';
  for (let x = 18; x < 230; x += 16) slots += `<rect x="${x}" y="12" width="8" height="28" rx="2" fill="${C.ink}"/>`;
  return svg(248, 52, `<rect x="4" y="4" width="240" height="44" rx="6" fill="${C.iron}" stroke="${C.ink}" stroke-width="4"/>${slots}<path d="M10 9 H238" stroke="${C.ironLight}" stroke-width="2" opacity=".5"/>`);
}

/* ------------------------------------------------------------------ pigeons */

/**
 * A plump subway pigeon perched side-on (facing right): slate body, iridescent neck, dot eye.
 * `peck` lowers the head. Feet at y 116 of 128.
 */
export function pigeonPerch(pose: 'sit' | 'peck' = 'sit'): string {
  const id = nextId('pg');
  const body = `M18 86 C14 62 34 44 60 44 C82 44 98 56 100 76 C102 96 88 110 64 112 C42 114 26 106 18 86 Z`;
  const tail = `M24 80 L2 92 L6 102 L30 98 Z`;
  const wing = `M34 66 C50 58 74 60 84 76 C76 92 54 98 36 90 C30 84 30 74 34 66 Z`;
  const head = pose === 'sit' ? { x: 92, y: 40 } : { x: 108, y: 82 };
  const neck = pose === 'sit' ? `M74 52 C80 40 88 34 96 36 C104 40 104 54 98 64 C92 70 80 70 74 52 Z` : `M78 60 C88 58 100 66 108 76 C112 88 102 94 92 90 C84 84 78 74 78 60 Z`;
  const headD = `M${head.x - 13} ${head.y} A13 13 0 1 1 ${head.x + 13} ${head.y} A13 13 0 1 1 ${head.x - 13} ${head.y} Z`;
  const beak = `M${head.x + 11} ${head.y - 2} L${head.x + 22} ${head.y + 2} L${head.x + 11} ${head.y + 5} Z`;
  return svg(
    128,
    128,
    `<path d="${tail}" fill="${C.pigeonDeep}"/>
    <g filter="url(#${id}f)"><path d="${body}" fill="url(#${id}b)"/></g>
    <path d="${neck}" fill="url(#${id}n)"/>
    <path d="${wing}" fill="${C.pigeon}"/>
    <path d="M44 74 H64 M48 82 H70" stroke="${C.pigeonDeep}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="${headD}" fill="${C.pigeonLight}"/>
    <path d="${beak}" fill="${C.amber}"/>
    <circle cx="${head.x + 4}" cy="${head.y - 3}" r="4" fill="${C.amber}"/><circle cx="${head.x + 5}" cy="${head.y - 3}" r="2" fill="${C.ink}"/>
    <path d="M56 110 V120 M70 110 V120" stroke="${C.coffeeRed}" stroke-width="4" stroke-linecap="round"/>
    ${ink(`<path d="${body}"/><path d="${tail}"/><path d="${wing}" stroke-width="3"/><path d="${headD}"/><path d="${beak}" stroke-width="2.5"/>`, 4.5)}`,
    `${celFx(`${id}f`, 0.5)}
     ${lin(`${id}b`, [[0, C.pigeonLight], [0.4, C.pigeon], [1, C.pigeonDeep]], 0.3, 1)}
     ${lin(`${id}n`, [[0, C.pigeonNeck], [1, mix(C.pigeonNeck, C.octo, 0.5)]], 1, 1)}`,
  );
}

/* ------------------------------------------------------------ rush-hour crowd */

/**
 * A tileable row of commuter silhouettes (fedoras, bowlers, cloche hats, a raised newspaper, an
 * umbrella, a briefcase) in flat night ink with a warm rim from the lamps. Feet on y = 420.
 */
export function commuterCrowd(seed = 3): string {
  const W = 1000;
  const H = 420;
  const R = rng(seed);
  const fill = mix(C.uniformDeep, C.ink, 0.45);
  const rimC = C.amberLight;
  let s = '';
  let rim = '';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * (W / n) + (R() - 0.5) * 40;
    const h = 300 + R() * 90;
    const top = H - h;
    const sw = 40 + R() * 16; // half shoulder width
    const headR = 21 + R() * 4;
    const hy = top + headR + 18;
    const hat = R();
    const coat = `M${f(cx - sw)} ${H} L${f(cx - sw - 6)} ${f(hy + 70)} C${f(cx - sw)} ${f(hy + 34)} ${f(cx - sw * 0.5)} ${f(hy + 26)} ${f(cx)} ${f(hy + 26)} C${f(cx + sw * 0.5)} ${f(hy + 26)} ${f(cx + sw)} ${f(hy + 34)} ${f(cx + sw + 6)} ${f(hy + 70)} L${f(cx + sw)} ${H} Z`;
    let hatD = '';
    if (hat < 0.4) hatD = `M${f(cx - 34)} ${f(hy - 8)} H${f(cx + 34)} L${f(cx + 20)} ${f(hy - 14)} L${f(cx + 18)} ${f(hy - 36)} Q${f(cx)} ${f(hy - 30)} ${f(cx - 18)} ${f(hy - 36)} L${f(cx - 20)} ${f(hy - 14)} Z`;
    else if (hat < 0.65) hatD = `M${f(cx - 28)} ${f(hy - 8)} H${f(cx + 28)} L${f(cx + 20)} ${f(hy - 12)} C${f(cx + 22)} ${f(hy - 40)} ${f(cx - 22)} ${f(hy - 40)} ${f(cx - 20)} ${f(hy - 12)} Z`;
    else if (hat < 0.85) hatD = `M${f(cx - 26)} ${f(hy + 4)} C${f(cx - 30)} ${f(hy - 34)} ${f(cx + 30)} ${f(hy - 34)} ${f(cx + 26)} ${f(hy + 4)} Q${f(cx)} ${f(hy - 4)} ${f(cx - 26)} ${f(hy + 4)} Z`;
    s += `<path d="${coat}" fill="${fill}"/><circle cx="${f(cx)}" cy="${f(hy)}" r="${f(headR)}" fill="${fill}"/>${hatD ? `<path d="${hatD}" fill="${fill}"/>` : ''}`;
    rim += `<path d="M${f(cx - sw - 4)} ${f(hy + 66)} C${f(cx - sw)} ${f(hy + 36)} ${f(cx - sw * 0.5)} ${f(hy + 28)} ${f(cx - 4)} ${f(hy + 28)}" fill="none" stroke="${rimC}" stroke-width="3" stroke-linecap="round"/>`;
    rim += `<path d="M${f(cx - headR * 0.9)} ${f(hy + 4)} A${f(headR)} ${f(headR)} 0 0 1 ${f(cx - 4)} ${f(hy - headR + 1)}" fill="none" stroke="${rimC}" stroke-width="2.5" stroke-linecap="round"/>`;
    const prop = R();
    if (prop < 0.2) {
      // raised newspaper
      s += `<path d="M${f(cx - 10)} ${f(hy + 6)} L${f(cx + 62)} ${f(hy - 6)} L${f(cx + 70)} ${f(hy + 58)} L${f(cx - 2)} ${f(hy + 70)} Z" fill="${fill}"/>`;
      rim += `<path d="M${f(cx - 8)} ${f(hy + 8)} L${f(cx + 60)} ${f(hy - 4)}" stroke="${rimC}" stroke-width="2.5"/>`;
    } else if (prop < 0.4) {
      // briefcase
      s += `<rect x="${f(cx + sw - 6)}" y="${H - 120}" width="56" height="42" rx="5" fill="${fill}"/><path d="M${f(cx + sw + 10)} ${H - 120} V${H - 132} H${f(cx + sw + 34)} V${H - 120}" fill="none" stroke="${fill}" stroke-width="6"/>`;
    } else if (prop < 0.55) {
      // furled umbrella
      s += `<path d="M${f(cx - sw - 10)} ${H - 6} L${f(cx - sw - 2)} ${H - 170} Q${f(cx - sw + 14)} ${H - 186} ${f(cx - sw + 18)} ${H - 170}" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>`;
    }
  }
  return svg(W, H, `${s}<g opacity=".55">${rim}</g>`);
}

/* -------------------------------------------------------------- electricity */

/**
 * A crackle of electricity for the third rail: a jagged bolt (white-hot core over volt) with
 * small forks, on a soft glow. Box 160 x 80, the bolt runs left to right through the middle.
 */
export function sparkArc(seed = 1): string {
  const id = nextId('sp');
  const R = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) pts.push([12 + i * 17, 40 + (i === 0 || i === 8 ? 0 : (R() - 0.5) * 34)]);
  const d = `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}`;
  let forks = '';
  for (let k = 0; k < 3; k++) {
    const p = pts[2 + k * 2];
    forks += `M${f(p[0])} ${f(p[1])} l${f((R() - 0.3) * 18)} ${f((R() < 0.5 ? -1 : 1) * (10 + R() * 14))} l${f(R() * 12)} ${f((R() - 0.5) * 10)}`;
  }
  return svg(
    160,
    80,
    `<g filter="url(#${id}b)"><path d="${d}" stroke="${C.volt}" stroke-width="14" fill="none" stroke-linejoin="round"/></g>
    <path d="${d} ${forks}" stroke="${C.volt}" stroke-width="6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${d}" stroke="${C.voltCore}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<filter id="${id}b" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>`,
  );
}

/** Four-point star glint (white; tinted per use). */
export function starGlint(): string {
  return svg(64, 64, `<path d="M32 2 C34 24 40 30 62 32 C40 34 34 40 32 62 C30 40 24 34 2 32 C24 30 30 24 32 2 Z" fill="${C.white}"/>`);
}

/* ------------------------------------------------------- reel frame (car window) */

/**
 * Reel frame geometry in S = 100 units (one reel cell = 100). The frame's outer rect is
 * (0, 0, W, H), the symbol grid (T, T, W - 2T, H - 2T); the art's viewBox starts at (vx, vy).
 */
export const CAR = {
  vx: -20,
  vy: -20,
  vw: 675 + 40,
  vh: 440 + 40,
  W: 675,
  H: 440,
  T: 20,
  gap: 7,
  cols: 6,
  rows: 4,
  /** Track centre line inside each row (fraction of a cell from the row top) and rail gauge (cell units). */
  trackY: 0.6,
  gauge: 0.26,
};

/**
 * The reel frame: a riveted streamliner window. Maroon enamel panels with a brass bead on both
 * edges, rows of rivets, rounded corners with deco brass fans, a small winged-wheel plaque top
 * centre and a vent grille at the bottom. Inside, the dark track board: four rows of track
 * (two faint steel rails on sleepers each) running across all six reels, with thin iron column
 * separators. One SVG in S = 100 units (see CAR).
 */
export function carFrame(): string {
  const id = nextId('cf');
  const { W, H, T, gap, cols, rows, trackY, gauge } = CAR;
  const gx0 = T;
  const gy0 = T;
  const gw = W - 2 * T;
  const gh = H - 2 * T;
  // board: dark panel
  let board = `<rect x="${gx0 - 2}" y="${gy0 - 2}" width="${gw + 4}" height="${gh + 4}" fill="url(#${id}bd)"/>`;
  // faint cross-hatch of the board's riveted plates per row
  for (let r = 0; r < rows; r++) {
    const y0 = gy0 + r * 100;
    if (r > 0) board += `<path d="M${gx0} ${y0} H${gx0 + gw}" stroke="${C.ink}" stroke-width="2" opacity=".55"/><path d="M${gx0} ${y0 + 1.6} H${gx0 + gw}" stroke="${C.ironLight}" stroke-width="1" opacity=".08"/>`;
    const cy = y0 + trackY * 100;
    const half = (gauge * 100) / 2;
    // ballast bed
    board += `<rect x="${gx0}" y="${f(cy - half - 9)}" width="${gw}" height="${f(half * 2 + 18)}" fill="${C.ink}" opacity=".28"/>`;
    // sleepers
    let sl = '';
    for (let x = gx0 + 6; x < gx0 + gw; x += 21) sl += `<rect x="${x}" y="${f(cy - half - 7)}" width="9" height="${f(half * 2 + 14)}" rx="1.5"/>`;
    board += `<g fill="${mix(C.woodDeep, C.iron, 0.45)}" opacity=".6">${sl}</g>`;
    // two rails with a lit top edge
    for (const ry of [cy - half, cy + half]) {
      board += `<path d="M${gx0} ${f(ry)} H${gx0 + gw}" stroke="${C.ink}" stroke-width="5.4" opacity=".8"/>`;
      board += `<path d="M${gx0} ${f(ry - 0.6)} H${gx0 + gw}" stroke="${mix(C.steelDeep, C.iron, 0.3)}" stroke-width="3.2"/>`;
      board += `<path d="M${gx0} ${f(ry - 1.6)} H${gx0 + gw}" stroke="${C.steel}" stroke-width="1.1" opacity=".55"/>`;
    }
  }
  // column separators (the reel gaps): a thin iron strip with a lit edge
  for (let i = 1; i < cols; i++) {
    const x = gx0 + i * (100 + gap) - gap;
    board += `<rect x="${x}" y="${gy0}" width="${gap}" height="${gh}" fill="${C.ink}" opacity=".35"/>`;
    board += `<path d="M${x + 1.2} ${gy0} V${gy0 + gh}" stroke="${C.ironLight}" stroke-width="1" opacity=".22"/>`;
  }
  // cool vignette: darker toward the board's edges, soft volt bloom from the bottom
  board += `<rect x="${gx0}" y="${gy0}" width="${gw}" height="${gh}" fill="url(#${id}vg)"/>`;
  board += `<rect x="${gx0}" y="${gy0}" width="${gw}" height="${gh}" fill="url(#${id}vb)"/>`;
  // inner shadow under the frame lip
  board += `<rect x="${gx0}" y="${gy0}" width="${gw}" height="${gh}" fill="none" stroke="${C.ink}" stroke-width="10" opacity=".55"/>`;

  // frame ring
  const ro = 22;
  const ri = 9;
  // the outer edge stands 6 units proud of the layout frame, so the panel reads heavier than frameT
  const e = 6;
  const outerD = `M${ro - e} ${-e} H${W - ro + e} A${ro} ${ro} 0 0 1 ${W + e} ${ro - e} V${H - ro + e} A${ro} ${ro} 0 0 1 ${W - ro + e} ${H + e} H${ro - e} A${ro} ${ro} 0 0 1 ${-e} ${H - ro + e} V${ro - e} A${ro} ${ro} 0 0 1 ${ro - e} ${-e} Z`;
  const ringD = `${outerD}
    M${T + ri} ${T} A${ri} ${ri} 0 0 0 ${T} ${T + ri} V${H - T - ri} A${ri} ${ri} 0 0 0 ${T + ri} ${H - T} H${W - T - ri} A${ri} ${ri} 0 0 0 ${W - T} ${H - T - ri} V${T + ri} A${ri} ${ri} 0 0 0 ${W - T - ri} ${T} Z`;
  const innerD = `M${T + ri} ${T} H${W - T - ri} A${ri} ${ri} 0 0 1 ${W - T} ${T + ri} V${H - T - ri} A${ri} ${ri} 0 0 1 ${W - T - ri} ${H - T} H${T + ri} A${ri} ${ri} 0 0 1 ${T} ${H - T - ri} V${T + ri} A${ri} ${ri} 0 0 1 ${T + ri} ${T} Z`;
  // rivets along the panels (between the two brass beads)
  let riv = '';
  const mid = (T - e) / 2;
  for (let x = 46; x < W - 40; x += 26.6) {
    if (Math.abs(x - W / 2) < 52) continue;
    riv += rivet(x, mid, 2.1) + rivet(x, H - mid, 2.1);
  }
  for (let y = 46; y < H - 40; y += 26) riv += rivet(mid, y, 2.1) + rivet(W - mid, y, 2.1);
  // deco brass fans in the corners
  const fan = (cx: number, cy: number, sx: number, sy: number) => {
    const r = 30;
    let rays = '';
    for (let k = 0; k <= 4; k++) {
      const a = (k / 4) * (Math.PI / 2);
      rays += `<path d="M${cx} ${cy} L${f(cx + sx * Math.cos(a) * r)} ${f(cy + sy * Math.sin(a) * r)}" stroke="${C.goldDeep}" stroke-width="2.2"/>`;
    }
    const arc = `M${cx + sx * r} ${cy} A${r} ${r} 0 0 ${sx * sy > 0 ? 1 : 0} ${cx} ${cy + sy * r} L${cx} ${cy} Z`;
    const arc2 = `M${cx + sx * r * 0.45} ${cy} A${r * 0.45} ${r * 0.45} 0 0 ${sx * sy > 0 ? 1 : 0} ${cx} ${cy + sy * r * 0.45} L${cx} ${cy} Z`;
    return {
      fill: `<path d="${arc}" fill="url(#${id}br)"/>${rays}<path d="${arc2}" fill="${C.maroonDeep}"/>${rivet(cx + sx * 5, cy + sy * 5, 2.8)}`,
      line: `<path d="${arc}"/>`,
    };
  };
  const fans = [fan(-e - 3, -e - 3, 1, 1), fan(W + e + 3, -e - 3, -1, 1), fan(-e - 3, H + e + 3, 1, -1), fan(W + e + 3, H + e + 3, -1, -1)];
  // winged-wheel plaque, top centre
  const pc = W / 2;
  const wing = (s: number) => `M${pc + s * 14} ${T / 2 - 6} C${pc + s * 30} ${T / 2 - 12} ${pc + s * 44} ${T / 2 - 9} ${pc + s * 58} ${T / 2 - 3} L${pc + s * 50} ${T / 2 + 1} L${pc + s * 54} ${T / 2 + 3} L${pc + s * 42} ${T / 2 + 6} L${pc + s * 44} ${T / 2 + 8} L${pc + s * 14} ${T / 2 + 8} Z`;
  const plaque = `<path d="${wing(-1)}" fill="url(#${id}br)"/><path d="${wing(1)}" fill="url(#${id}br)"/>
    <path d="M${pc - 50} ${T / 2 - 2} H${pc - 18} M${pc - 46} ${T / 2 + 3} H${pc - 18} M${pc + 18} ${T / 2 - 2} H${pc + 50} M${pc + 18} ${T / 2 + 3} H${pc + 46}" stroke="${C.goldDeep}" stroke-width="1.4"/>
    <circle cx="${pc}" cy="${T / 2}" r="15" fill="url(#${id}br)"/><circle cx="${pc}" cy="${T / 2}" r="9.5" fill="${C.maroonDeep}"/>
    ${[0, 1, 2, 3, 4, 5].map((k) => `<path d="M${pc} ${T / 2} L${f(pc + Math.cos((k * Math.PI) / 3) * 9)} ${f(T / 2 + Math.sin((k * Math.PI) / 3) * 9)}" stroke="${C.gold}" stroke-width="2"/>`).join('')}
    <circle cx="${pc}" cy="${T / 2}" r="3.4" fill="${C.goldLight}"/>`;
  const plaqueLine = `<path d="${wing(-1)}"/><path d="${wing(1)}"/><circle cx="${pc}" cy="${T / 2}" r="15"/>`;
  // bottom vent grille
  let vent = `<rect x="${pc - 48}" y="${H - T / 2 - 5}" width="96" height="10" rx="5" fill="${C.maroonDeep}"/>`;
  for (let x = pc - 40; x <= pc + 40; x += 8) vent += `<path d="M${x} ${H - T / 2 - 3} V${H - T / 2 + 3}" stroke="${C.gold}" stroke-width="2.4" stroke-linecap="round"/>`;
  const ventLine = `<rect x="${pc - 48}" y="${H - T / 2 - 5}" width="96" height="10" rx="5"/>`;

  return svg(
    CAR.vw,
    CAR.vh,
    `<g transform="translate(${-CAR.vx} ${-CAR.vy})">
    <path d="${outerD}" fill="${C.ink}" opacity=".5" transform="translate(3 6)"/>
    ${board}
    <path d="${ringD}" fill-rule="evenodd" fill="url(#${id}mr)"/>
    <path d="M${ro} ${-e + 3.5} H${W - ro}" stroke="${C.maroonLight}" stroke-width="2" opacity=".45"/>
    <path d="${outerD}" fill="none" stroke="url(#${id}br)" stroke-width="5"/>
    <path d="${innerD}" fill="none" stroke="url(#${id}br)" stroke-width="4"/>
    <path d="M${ro} ${-e + 1.6} H${W - ro}" stroke="${C.goldLight}" stroke-width="1.2" opacity=".8"/>
    <path d="M${T + ri} ${T - 0.8} H${W - T - ri}" stroke="${C.goldLight}" stroke-width="1" opacity=".5"/>
    ${riv}
    ${fans.map((x) => x.fill).join('')}
    ${plaque}${vent}
    ${ink(`<path d="${outerD}"/><path d="${innerD}" stroke-width="2.4"/>${fans.map((x) => x.line).join('')}${plaqueLine}${ventLine}`, 3)}
    </g>`,
    `${lin(`${id}bd`, [[0, mix(C.tunnel, C.voltNight, 0.32)], [0.6, mix(C.tunnel, C.iron, 0.18)], [1, mix(C.tunnel, C.voltNight, 0.2)]])}
     ${radial(`${id}vg`, [[0, C.ink, 0], [0.7, C.ink, 0.08], [1, C.ink, 0.4]], 'cx=".5" cy=".5" r=".72"')}
     ${lin(`${id}vb`, [[0, C.volt, 0], [0.8, C.volt, 0.02], [1, C.volt, 0.08]])}
     ${lin(`${id}mr`, [[0, mix(C.maroon, C.maroonLight, 0.2)], [0.014, mix(C.maroon, C.maroonDeep, 0.38)], [0.95, mix(C.maroon, C.maroonDeep, 0.6)], [1, C.maroonDeep]], 0, 1, `gradientUnits="userSpaceOnUse" x1="0" y1="-6" x2="0" y2="${H + 6}"`)}
     ${lin(`${id}br`, [[0, C.goldLight], [0.4, C.gold], [1, C.goldDeep]], 1, 1)}`,
  );
}

/** Brass marker lamp for the frame's top corners: a round bezel with an amber lens (lit by glow sprites). */
export function markerLamp(): string {
  const id = nextId('mk');
  return svg(
    64,
    64,
    `<circle cx="35" cy="36" r="27" fill="${C.ink}" opacity=".45"/>
    <circle cx="32" cy="32" r="26" fill="url(#${id}b)"/>
    <circle cx="32" cy="32" r="17" fill="url(#${id}l)"/>
    <path d="M22 27 A11 11 0 0 1 30 20" fill="none" stroke="${C.white}" stroke-width="3.4" stroke-linecap="round" opacity=".8"/>
    ${rivet(32, 9.5, 2.2)}${rivet(32, 54.5, 2.2)}${rivet(9.5, 32, 2.2)}${rivet(54.5, 32, 2.2)}
    ${ink(`<circle cx="32" cy="32" r="26"/><circle cx="32" cy="32" r="17" stroke-width="2.4"/>`, 3.4)}`,
    `${lin(`${id}b`, [[0, C.goldLight], [0.4, C.gold], [1, C.goldDeep]], 1, 1)}
     ${radial(`${id}l`, [[0, C.cream], [0.45, C.amberLight], [1, C.amber]], 'cx=".4" cy=".4" r=".7"')}`,
  );
}
