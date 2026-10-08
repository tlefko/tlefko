/**
 * HUD and panel art (track H), drawn in the game's ink + cel style (docs/ART.md): warm ink outlines,
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

/** Smooth closed loop through points (Catmull-Rom). */
function loop(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

/** Deterministic pseudo random (texture layout never shimmers between renders). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/* ------------------------------------------------------------------------------------------- *
 * Control bar
 * ------------------------------------------------------------------------------------------- */

/**
 * Deck planks: a repeating tile of three weathered planks with grain, knots, ink seams and nail
 * heads (the bar reads as part of the ship). w x h tile.
 */
export function deckTile(w = 320, h = 96): string {
  const r = rng(11);
  const rows = 3;
  const ph = h / rows;
  let body = `<rect width="${w}" height="${h}" fill="${C.woodDark}"/>`;
  const tones = [C.woodMid, mix(C.woodMid, C.woodDark, 0.35), mix(C.woodMid, C.wood, 0.25)];
  for (let i = 0; i < rows; i++) {
    const y = i * ph;
    // planks are staggered: one butt joint per row at a different x
    const joint = (0.2 + ((i * 0.37) % 1) * 0.6) * w;
    for (const [x0, x1] of [
      [0, joint],
      [joint, w],
    ]) {
      const tone = tones[(i + (x0 ? 1 : 0)) % tones.length];
      body += `<rect x="${f(x0 + 1)}" y="${f(y + 1)}" width="${f(x1 - x0 - 2)}" height="${f(ph - 2)}" fill="${tone}"/>`;
      // grain: long wavy lines
      for (let g = 0; g < 4; g++) {
        const gy = y + 5 + g * ((ph - 10) / 3) + (r() - 0.5) * 3;
        const amp = 1 + r() * 2;
        body += `<path d="M${f(x0 + 4)} ${f(gy)} Q${f(x0 + (x1 - x0) * 0.3)} ${f(gy - amp)} ${f(x0 + (x1 - x0) * 0.55)} ${f(gy + amp * 0.4)} T${f(x1 - 4)} ${f(gy - amp * 0.3)}" fill="none" stroke="${C.woodDeep}" stroke-width="${f(0.9 + r() * 0.7)}" opacity="${f(0.35 + r() * 0.25)}" stroke-linecap="round"/>`;
      }
      // a knot now and then
      if (r() > 0.45) {
        const kx = x0 + 18 + r() * Math.max(10, x1 - x0 - 36);
        const ky = y + ph * (0.35 + r() * 0.3);
        body += `<ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(4 + r() * 3)}" ry="${f(2 + r() * 1.2)}" fill="${C.woodDeep}" opacity=".55"/><ellipse cx="${f(kx)}" cy="${f(ky)}" rx="${f(8 + r() * 3)}" ry="${f(3.5 + r() * 1.2)}" fill="none" stroke="${C.woodDeep}" stroke-width="1" opacity=".35"/>`;
      }
      // top edge catches the lantern light; bottom edge in shade
      body += `<rect x="${f(x0 + 2)}" y="${f(y + 1.5)}" width="${f(x1 - x0 - 4)}" height="1.6" fill="${C.woodLight}" opacity=".35"/>`;
      body += `<rect x="${f(x0 + 2)}" y="${f(y + ph - 3.5)}" width="${f(x1 - x0 - 4)}" height="2" fill="${C.woodDeep}" opacity=".45"/>`;
      // nails at the butt ends
      for (const nx of [x0 + 7, x1 - 7]) {
        if (nx < 4 || nx > w - 4) continue;
        body += `<circle cx="${f(nx)}" cy="${f(y + ph / 2)}" r="2.3" fill="${C.inkSoft}"/><circle cx="${f(nx - 0.6)}" cy="${f(y + ph / 2 - 0.6)}" r="0.9" fill="${C.woodLight}" opacity=".7"/>`;
      }
    }
    // ink seam under each row
    body += `<rect x="0" y="${f(y + ph - 1)}" width="${w}" height="2" fill="${C.ink}" opacity=".85"/>`;
  }
  return doc(w, h, body);
}

/** Brass rail along the top of the bar: a rolled brass strip with rivets. w x 16 tile. */
export function railTile(w = 64, h = 16): string {
  return doc(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${C.ink}"/>
    <rect x="0" y="2" width="${w}" height="${h - 5}" fill="${C.goldDeep}"/>
    <rect x="0" y="2" width="${w}" height="${f((h - 5) * 0.62)}" fill="${C.gold}"/>
    <rect x="0" y="3.4" width="${w}" height="1.6" fill="${C.goldLight}" opacity=".85"/>
    <circle cx="${w / 2}" cy="${f(2 + (h - 5) / 2)}" r="2.6" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="1"/>
    <circle cx="${f(w / 2 - 0.7)}" cy="${f(2 + (h - 5) / 2 - 0.8)}" r="0.9" fill="${C.goldLight}"/>`,
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Controls
 * ------------------------------------------------------------------------------------------- */

/**
 * The spin button: a ship's helm. Eight turned handles, a wooden rim with brass bands where the
 * spokes cross it, and a dark hub with a brass bezel for the icon. 200 box. `hot` = bonus tint.
 */
export function helmSvg(hot = false): string {
  const cx = 100;
  const cy = 100;
  const rimO = 70;
  const rimI = 55;
  const handle = (deg: number) => {
    const [x0, y0] = pol(cx, cy, rimO - 4, deg);
    const [x1, y1] = pol(cx, cy, 93, deg);
    const [kx, ky] = pol(cx, cy, 90, deg);
    const [nx, ny] = pol(cx, cy, 80, deg);
    return `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${C.ink}" stroke-width="17" stroke-linecap="round"/>
      <path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${C.wood}" stroke-width="10" stroke-linecap="round"/>
      <circle cx="${f(kx)}" cy="${f(ky)}" r="9" fill="${C.woodLight}" stroke="${C.ink}" stroke-width="3.5"/>
      <circle cx="${f(nx)}" cy="${f(ny)}" r="6.2" fill="${C.wood}" stroke="${C.ink}" stroke-width="3"/>
      <circle cx="${f(kx - 2.5)}" cy="${f(ky - 2.5)}" r="2.6" fill="${C.white}" opacity=".7"/>`;
  };
  const spoke = (deg: number) => {
    const [x0, y0] = pol(cx, cy, 28, deg);
    const [x1, y1] = pol(cx, cy, rimI + 2, deg);
    return `<path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${C.ink}" stroke-width="12" stroke-linecap="round"/><path d="M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}" stroke="${C.woodMid}" stroke-width="6" stroke-linecap="round"/>`;
  };
  const band = (deg: number) => {
    const a = pol(cx, cy, rimI - 1, deg - 5.5);
    const b = pol(cx, cy, rimO + 1, deg - 5.5);
    const c2 = pol(cx, cy, rimO + 1, deg + 5.5);
    const d = pol(cx, cy, rimI - 1, deg + 5.5);
    return `<path d="M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])} A${rimO + 1} ${rimO + 1} 0 0 1 ${f(c2[0])} ${f(c2[1])} L${f(d[0])} ${f(d[1])} A${rimI - 1} ${rimI - 1} 0 0 0 ${f(a[0])} ${f(a[1])} Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.5"/>`;
  };
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const ring = (r0: number, r1: number) => `M${cx - r1} ${cy} a${r1} ${r1} 0 1 0 ${2 * r1} 0 a${r1} ${r1} 0 1 0 ${-2 * r1} 0 Z M${cx - r0} ${cy} a${r0} ${r0} 0 1 1 ${2 * r0} 0 a${r0} ${r0} 0 1 1 ${-2 * r0} 0 Z`;
  const glow = hot ? C.fireHot : C.gold;
  return doc(
    200,
    200,
    `<g>
      ${angles.map(handle).join('')}
      <circle cx="${cx + 3}" cy="${cy + 5}" r="${rimO + 3}" fill="#000" opacity=".35"/>
      <path d="${ring(rimI, rimO)}" fill="${C.ink}" fill-rule="evenodd" stroke="${C.ink}" stroke-width="7"/>
      <path d="${ring(rimI, rimO)}" fill="${C.wood}" fill-rule="evenodd"/>
      <path d="M${f(cx - rimO + 5)} ${cy} A${rimO - 5} ${rimO - 5} 0 0 1 ${f(cx + (rimO - 5) * 0.7)} ${f(cy - (rimO - 5) * 0.72)}" fill="none" stroke="${C.woodLight}" stroke-width="4.5" stroke-linecap="round" opacity=".75"/>
      <path d="M${f(cx + rimO - 6)} ${cy} A${rimO - 6} ${rimO - 6} 0 0 1 ${f(cx - (rimO - 6) * 0.6)} ${f(cy + (rimO - 6) * 0.8)}" fill="none" stroke="${C.woodDark}" stroke-width="5" stroke-linecap="round" opacity=".6"/>
      ${angles.map(spoke).join('')}
      ${angles.map(band).join('')}
      <circle cx="${cx}" cy="${cy}" r="37" fill="${C.ink}"/>
      <circle cx="${cx}" cy="${cy}" r="33.5" fill="${glow}"/>
      <path d="M${cx - 30} ${cy + 6} A31 31 0 0 0 ${cx + 22} ${cy + 22}" fill="none" stroke="${C.goldDeep}" stroke-width="6" opacity=".9"/>
      <path d="M${cx - 26} ${cy - 12} A29 29 0 0 1 ${cx + 6} ${cy - 29}" fill="none" stroke="${C.goldLight}" stroke-width="3.5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="26.5" fill="${C.ink}"/>
      <circle cx="${cx}" cy="${cy}" r="24" fill="${mix(C.woodDeep, C.ink, 0.35)}"/>
      ${[0, 60, 120, 180, 240, 300].map((d) => {
        const [x, y] = pol(cx, cy, 30, d + 30);
        return `<circle cx="${f(x)}" cy="${f(y)}" r="2" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="1"/>`;
      }).join('')}
    </g>`,
  );
}

/**
 * The buy button: a crimson wax seal pressed onto two ribbon tails, with an embossed rope ring.
 * The localised label is set on top in the DOM. 160 box.
 */
export function sealSvg(): string {
  const cx = 80;
  const cy = 74;
  const edge = loop(Array.from({ length: 26 }, (_, i) => pol(cx, cy, 58 + (i % 2 ? -4 : 2) + Math.sin(i * 2.1) * 1.8, i * (360 / 26))));
  const tail = (s: 1 | -1) =>
    `<path d="M${cx + s * 10} ${cy + 30} L${cx + s * 30} ${cy + 80} L${cx + s * 20} ${cy + 72} L${cx + s * 12} ${cy + 84} L${cx - s * 4} ${cy + 36} Z" fill="${s > 0 ? C.navy : C.navyLight}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`;
  const dots = Array.from({ length: 28 }, (_, i) => {
    const [x, y] = pol(cx, cy, 46, i * (360 / 28));
    return `<circle cx="${f(x)}" cy="${f(y)}" r="1.9"/>`;
  }).join('');
  return doc(
    160,
    160,
    `${tail(1)}${tail(-1)}
    <path d="${edge}" fill="#000" opacity=".35" transform="translate(3 6)"/>
    <path d="${edge}" fill="${C.crimson}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
    <path d="${edge}" fill="${C.crimsonDeep}" opacity=".55" transform="translate(${cx} ${cy}) scale(.97) translate(${-cx + 5} ${-cy + 6})" clip-path="none"/>
    <path d="${edge}" fill="${C.crimson}" transform="translate(${cx} ${cy}) scale(.93) translate(${-cx - 2} ${-cy - 3})"/>
    <circle cx="${cx}" cy="${cy}" r="43" fill="none" stroke="${C.crimsonDeep}" stroke-width="5"/>
    <circle cx="${cx}" cy="${cy}" r="43" fill="none" stroke="${C.crimsonLight}" stroke-width="1.6" opacity=".6" transform="translate(-1.2 -1.4)"/>
    <g fill="${C.crimsonLight}" opacity=".55">${dots}</g>
    <path d="M${cx - 40} ${cy - 22} Q${cx - 32} ${cy - 44} ${cx - 8} ${cy - 50}" fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round" opacity=".55"/>`,
  );
}

/** Carved round button: a turned wooden disc in a brass bezel (menu, autoplay, speed). 96 box. */
export function knobSvg(lit = false): string {
  const c = 48;
  return doc(
    96,
    96,
    `<circle cx="${c + 2}" cy="${c + 4}" r="44" fill="#000" opacity=".35"/>
    <circle cx="${c}" cy="${c}" r="44" fill="${C.ink}"/>
    <circle cx="${c}" cy="${c}" r="40.5" fill="${lit ? C.fireHot : C.gold}"/>
    <path d="M${c - 37} ${c + 10} A38 38 0 0 0 ${c + 28} ${c + 26}" fill="none" stroke="${lit ? C.fire : C.goldDeep}" stroke-width="6"/>
    <path d="M${c - 33} ${c - 14} A36 36 0 0 1 ${c + 8} ${c - 35}" fill="none" stroke="${lit ? C.fireCore : C.goldLight}" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${c}" cy="${c}" r="33" fill="${C.ink}"/>
    <circle cx="${c}" cy="${c}" r="30.5" fill="${C.woodMid}"/>
    <path d="M${c - 22} ${c - 14} Q${c} ${c - 20} ${c + 24} ${c - 10} M${c - 26} ${c + 2} Q${c} ${c - 4} ${c + 27} ${c + 6} M${c - 20} ${c + 17} Q${c} ${c + 12} ${c + 21} ${c + 20}" fill="none" stroke="${C.woodDark}" stroke-width="1.6" opacity=".55"/>
    <path d="M${c + 30} ${c} A30 30 0 0 1 ${c - 10} ${c + 28}" fill="none" stroke="${C.woodDark}" stroke-width="5" opacity=".6"/>
    <path d="M${c - 26} ${c - 8} A27 27 0 0 1 ${c - 4} ${c - 27}" fill="none" stroke="${C.woodLight}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
  );
}

/** Small brass stud for the stake steps (+ / -). 64 box. */
export function studSvg(): string {
  const c = 32;
  return doc(
    64,
    64,
    `<circle cx="${c + 1.5}" cy="${c + 3}" r="28" fill="#000" opacity=".35"/>
    <circle cx="${c}" cy="${c}" r="28" fill="${C.ink}"/>
    <circle cx="${c}" cy="${c}" r="24.5" fill="${C.gold}"/>
    <path d="M${c - 22} ${c + 7} A23 23 0 0 0 ${c + 18} ${c + 15}" fill="none" stroke="${C.goldDeep}" stroke-width="5"/>
    <path d="M${c - 19} ${c - 9} A21 21 0 0 1 ${c + 4} ${c - 21}" fill="none" stroke="${C.goldLight}" stroke-width="3" stroke-linecap="round"/>`,
  );
}

/**
 * Express Pass toggle art: a little punched travel pass with a lightning bolt; off it is plain
 * paper, on it is gold and the bolt crackles electric blue. 96 box.
 */
export function passSvg(on: boolean): string {
  const card = 'M18 26 Q18 20 24 20 H74 Q80 20 80 26 V44 Q73 48 73 55 Q73 62 80 66 V80 Q80 86 74 86 H24 Q18 86 18 80 V66 Q25 62 25 55 Q25 48 18 44 Z';
  const face = on ? C.gold : C.paperWarm;
  const bolt = 'M52 30 L38 56 H48 L42 78 L62 48 H51 L58 30 Z';
  return doc(
    96,
    96,
    `<ellipse cx="49" cy="90" rx="28" ry="5" fill="#000" opacity=".35"/>
    ${on ? `<circle cx="49" cy="53" r="40" fill="${C.volt}" opacity=".25"/>` : ''}
    <g transform="rotate(-8 49 53)">
      <path d="${card}" fill="${face}" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M24 28 H72" stroke="${on ? C.goldLight : C.white}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
      <path d="M26 79 H72" stroke="${on ? C.goldDeep : C.g2}" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 4"/>
      <path d="${bolt}" fill="${on ? C.voltLight : C.g3}" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round"/>
      ${on ? `<path d="${bolt}" fill="${C.voltCore}" opacity=".55" transform="translate(50 54) scale(.55) translate(-50 -54)"/>` : ''}
    </g>
    ${on ? `<path d="M80 10 L83 18 L91 21 L83 24 L80 32 L77 24 L69 21 L77 18 Z" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>` : ''}`,
  );
}

/* ------------------------------------------------------------------------------------------- *
 * Panels
 * ------------------------------------------------------------------------------------------- */

/** Parchment: warm paper with fibres, blotches and foxing. Tiling w x w. */
export function parchmentTile(w = 256): string {
  const r = rng(5);
  let body = `<rect width="${w}" height="${w}" fill="${C.paper}"/>`;
  for (let i = 0; i < 14; i++) {
    const x = r() * w;
    const y = r() * w;
    const rr = 10 + r() * 34;
    body += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rr)}" ry="${f(rr * (0.5 + r() * 0.4))}" fill="${r() > 0.5 ? C.paperWarm : mix(C.paperWarm, C.woodLight, 0.3)}" opacity="${f(0.25 + r() * 0.3)}"/>`;
  }
  for (let i = 0; i < 60; i++) {
    const x = r() * w;
    const y = r() * w;
    const len = 4 + r() * 12;
    const a = r() * Math.PI;
    body += `<path d="M${f(x)} ${f(y)} l${f(Math.cos(a) * len)} ${f(Math.sin(a) * len)}" stroke="${C.woodLight}" stroke-width="${f(0.4 + r() * 0.5)}" opacity="${f(0.2 + r() * 0.3)}"/>`;
  }
  for (let i = 0; i < 26; i++) body += `<circle cx="${f(r() * w)}" cy="${f(r() * w)}" r="${f(0.4 + r() * 1.1)}" fill="${C.woodMid}" opacity="${f(0.15 + r() * 0.2)}"/>`;
  return doc(w, w, body);
}

/** Dark wood for panel frames and headers: vertical boards with grain. Tiling w x w. */
export function woodTile(w = 192): string {
  const r = rng(23);
  let body = `<rect width="${w}" height="${w}" fill="${C.woodDark}"/>`;
  const boards = 3;
  for (let i = 0; i < boards; i++) {
    const x = (i * w) / boards;
    body += `<rect x="${f(x + 1)}" y="0" width="${f(w / boards - 2)}" height="${w}" fill="${[C.woodMid, mix(C.woodMid, C.woodDark, 0.4), mix(C.woodMid, C.wood, 0.2)][i]}"/>`;
    for (let g = 0; g < 5; g++) {
      const gx = x + 6 + g * ((w / boards - 12) / 4) + (r() - 0.5) * 3;
      body += `<path d="M${f(gx)} 0 Q${f(gx + (r() - 0.5) * 6)} ${f(w * 0.35)} ${f(gx + (r() - 0.5) * 4)} ${f(w * 0.6)} T${f(gx + (r() - 0.5) * 3)} ${w}" fill="none" stroke="${C.woodDeep}" stroke-width="${f(0.8 + r() * 0.8)}" opacity="${f(0.3 + r() * 0.25)}"/>`;
    }
    body += `<rect x="${f(x + 1)}" y="0" width="1.4" height="${w}" fill="${C.woodLight}" opacity=".3"/><rect x="${f(x + w / boards - 1)}" y="0" width="2" height="${w}" fill="${C.ink}" opacity=".8"/>`;
  }
  return doc(w, w, body);
}

/** Brass corner bracket for panel frames (top-left orientation). 48 box. */
export function cornerSvg(): string {
  return doc(
    48,
    48,
    `<path d="M4 4 L44 4 L44 14 Q26 14 20 20 Q14 26 14 44 L4 44 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M8 8 L40 8 M8 8 L8 40" stroke="${C.goldLight}" stroke-width="2" stroke-linecap="round"/>
    <path d="M44 14 Q26 14 20 20 Q14 26 14 44" fill="none" stroke="${C.goldDeep}" stroke-width="3"/>
    <circle cx="12" cy="12" r="3" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="1.2"/>
    <circle cx="11.2" cy="11.2" r="1" fill="${C.goldLight}"/>`,
  );
}

/** Painted wooden plaque behind a panel's title. 9-slice friendly: 240 x 64. */
export function plaqueSvg(): string {
  return doc(
    240,
    64,
    `<path d="M10 6 L230 6 Q236 32 230 58 L10 58 Q4 32 10 6 Z" fill="${C.ink}"/>
    <path d="M13 9 L227 9 Q232 32 227 55 L13 55 Q8 32 13 9 Z" fill="${C.woodMid}"/>
    <path d="M16 12 L224 12 L224 16 L16 16 Z" fill="${C.woodLight}" opacity=".35"/>
    <path d="M16 49 L224 49 L224 53 L16 53 Z" fill="${C.woodDeep}" opacity=".5"/>
    <circle cx="20" cy="32" r="3" fill="${C.gold}" stroke="${C.ink}" stroke-width="1.4"/><circle cx="220" cy="32" r="3" fill="${C.gold}" stroke="${C.ink}" stroke-width="1.4"/>`,
  );
}

/**
 * Install the tiling art as CSS custom properties on the document root, once:
 * --pk-deck, --pk-rail, --pk-parchment, --pk-wood, --pk-corner, --pk-plaque, --pk-stud, --pk-knob.
 */
let installed = false;
export function installUiArt() {
  if (installed) return;
  installed = true;
  const s = document.documentElement.style;
  const set = (k: string, svg: string) => s.setProperty(k, `url("${uri(svg)}")`);
  set('--pk-deck', deckTile());
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
