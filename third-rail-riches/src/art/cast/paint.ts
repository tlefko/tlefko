/**
 * Paint helpers for the cast (Conductor Casey, Rivets): the house ink + cel look (kit.ts) with two
 * additions the characters need to read as polished mascots at any size:
 *
 * - `form()`: a hand-cut cel in three flat values (base, cut shadow on the lower right, a light band
 *   on the upper left) plus a thin WARM RIM LIGHT inside the shadow edge (the amber lamplight
 *   wrapping round from behind). No hatching, no noise: the read comes from shape and value.
 * - `brush()`: a clean closed outline round a spine with a width profile and round caps (brows,
 *   moustache wings, curls, cords), so organic shapes are sculpted, never scribbled.
 */
import { C, nextId, pathBox, mix } from '../kit';
import { sample, smooth, P, type V } from '../geo';

export interface Tones {
  base: string;
  shade: string;
  light?: string;
  /** Warm rim light along the lower-right edge, inside the shadow. */
  rim?: string;
}

export interface FormOpts extends Tones {
  /** Shift of the lit copy toward the key light (upper left); the crescent it uncovers is the shadow. */
  cut?: [number, number];
  /** Rotation (deg) / scale of the lit copy about `at` (swells the shadow on one side). */
  twist?: number;
  shrink?: number;
  at?: [number, number];
  /** Width of the light band (shift of the base copy away from the light). */
  band?: [number, number];
  /** Shift of the shadow copy uncovering the rim light (default [-6, -7]: past the ink line). */
  rimCut?: [number, number];
  /** A hand-drawn lit region instead of the shifted copy. */
  lit?: string;
  /** Transform for the whole form. */
  t?: string;
  /** Extra paint clipped inside the form, over the cel. */
  inner?: string;
  rule?: 'evenodd';
}

/** A hand-cut cel form (fills only; pair it with an ink line, or use `formLine`). */
export function form(d: string, o: FormOpts): string {
  const id = nextId('cf');
  const ft = o.t ?? '';
  const box = pathBox(d);
  const at = o.at ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const [cx, cy] = o.cut ?? [-8, -9];
  const tr = (s: string) => (s.trim() ? ` transform="${s.trim()}"` : '');
  const ref = (key: string, extra = '') => `<use href="#${id}-${key}"${extra}/>`;
  const rule = o.rule ? ` fill-rule="${o.rule}" clip-rule="${o.rule}"` : '';
  const defs = `<defs><path id="${id}-f" d="${d}"${rule}/>${o.lit ? `<path id="${id}-p" d="${o.lit}"${rule}/>` : ''}</defs>`;
  const litT = o.lit ? ft : `translate(${cx} ${cy}) translate(${at[0]} ${at[1]}) rotate(${o.twist ?? 0}) scale(${o.shrink ?? 1}) translate(${-at[0]} ${-at[1]}) ${ft}`;
  const litKey = o.lit ? 'p' : 'f';
  const band = o.band ?? [4, 5];
  const [rx, ry] = o.rimCut ?? [-6, -7];
  // rim: the whole form in the rim colour, then the shadow copy shifted up-left so only a sliver
  // of rim stays on the lower-right edge (just inside the ink line)
  const under = o.rim ? `${ref('f', `${tr(ft)} fill="${o.rim}"`)}${ref('f', `${tr(`translate(${rx} ${ry}) ${ft}`)} fill="${o.shade}"`)}` : ref('f', `${tr(ft)} fill="${o.shade}"`);
  const lit = o.light
    ? `${ref(litKey, `${tr(litT)} fill="${o.light}"`)}
      <clipPath id="${id}-l">${ref(litKey, tr(litT))}</clipPath>
      <g clip-path="url(#${id}-l)">${ref(litKey, `${tr(`translate(${band[0]} ${band[1]}) ${litT}`)} fill="${o.base}"`)}</g>`
    : ref(litKey, `${tr(litT)} fill="${o.base}"`);
  return `${defs}<clipPath id="${id}">${ref('f', tr(ft))}</clipPath>
    <g clip-path="url(#${id})">${under}${lit}${o.inner ?? ''}</g>`;
}

/** `form()` plus an ink line reusing its outline. */
export function formLine(d: string, o: FormOpts): { fills: string; line: (attrs?: string) => string } {
  const fills = form(d, o);
  const ref = /<path id="([^"]+)"/.exec(fills)![1];
  return { fills, line: (attrs = '') => `<use href="#${ref}"${o.t ? ` transform="${o.t}"` : ''} ${attrs}/>` };
}

/**
 * Fills plus their ink, inked the house way: a second pass of the lines nudged down-right so every
 * stroke is a touch heavier on the shadow side (like composeSymbol's layers, for parts drawn in `top`).
 */
export function inked(l: { fills: string; lines: string }, lw = 7.5, shift: [number, number] = [1, 1.2]): string {
  return `${l.fills}<g fill="none" stroke="${C.ink}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(${shift[0]} ${shift[1]})">${l.lines}</g>${l.lines}</g>`;
}

/**
 * A cel form made of several overlapping shapes painted as ONE silhouette (a glove: palm, fingers,
 * thumb): the ink goes on behind at double width so only the union's outer contour shows, then the
 * shapes are cel-painted together (the shadow, light band and rim follow the union). Returns the
 * whole thing inked; add inner lines (finger splits) on top.
 */
export function union(shapes: string[], o: FormOpts & { lw?: number }): string {
  const id = nextId('un');
  const g = shapes.map((d) => `<path d="${d}"/>`).join('');
  const lw = o.lw ?? 7;
  const [cx, cy] = o.cut ?? [-8, -9];
  const band = o.band ?? [4, 5];
  const [rx, ry] = o.rimCut ?? [-5, -6];
  return `<defs><g id="${id}">${g}</g><clipPath id="${id}-c">${g}</clipPath></defs>
    <g fill="${C.ink}" stroke="${C.ink}" stroke-width="${lw * 2}" stroke-linejoin="round" stroke-linecap="round"><use href="#${id}" transform="translate(1 1.2)"/><use href="#${id}"/></g>
    <g clip-path="url(#${id}-c)">
      <use href="#${id}" fill="${o.rim ?? o.shade}"/>
      ${o.rim ? `<use href="#${id}" fill="${o.shade}" transform="translate(${rx} ${ry})"/>` : ''}
      ${o.light ? `<use href="#${id}" fill="${o.light}" transform="translate(${cx} ${cy})"/><use href="#${id}" fill="${o.base}" transform="translate(${cx + band[0]} ${cy + band[1]})"/>` : `<use href="#${id}" fill="${o.base}" transform="translate(${cx} ${cy})"/>`}
      ${o.inner ?? ''}
    </g>`;
}

/** Tones for one hue: base, cut shadow, light band and a warm rim. */
export function tones(base: string, deep: string, light: string, rim: string = C.amberLight, k = 0.55): Required<Tones> {
  return { base, shade: mix(base, deep, k), light: mix(base, light, 0.7), rim: mix(mix(base, deep, k), rim, 0.55) };
}

/**
 * A closed outline round a spine (Catmull-Rom through `pts`) with half-width `w(t)` (t 0..1 from
 * the first point) and round caps at both ends. Clean sculpted shapes: brows, moustache wings,
 * curls, tails.
 */
export function brush(pts: V[], w: (t: number) => number, n = 40): string {
  const s = sample(pts, n);
  const L: V[] = [];
  const R: V[] = [];
  const T: V[] = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;
    T.push([tx, ty]);
    const ww = Math.max(0.05, w(i / (s.length - 1)));
    L.push([s[i][0] - ty * ww, s[i][1] + tx * ww]);
    R.push([s[i][0] + ty * ww, s[i][1] - tx * ww]);
  }
  const k = 1.33;
  const e = s.length - 1;
  const we = Math.max(0.05, w(1));
  const w0 = Math.max(0.05, w(0));
  const capEnd = `C${P([L[e][0] + T[e][0] * we * k, L[e][1] + T[e][1] * we * k])} ${P([R[e][0] + T[e][0] * we * k, R[e][1] + T[e][1] * we * k])} ${P(R[e])}`;
  const capStart = `C${P([R[0][0] - T[0][0] * w0 * k, R[0][1] - T[0][1] * w0 * k])} ${P([L[0][0] - T[0][0] * w0 * k, L[0][1] - T[0][1] * w0 * k])} ${P(L[0])}`;
  return `${smooth(L)} ${capEnd} ${smooth([...R].reverse()).replace(/^M[^C]*/, '')} ${capStart} Z`;
}

/** Ellipse / circle as path data. */
export const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
export const circle = (cx: number, cy: number, r: number) => ellipse(cx, cy, r, r);

/** Smooth width profiles for `brush`. */
export const W = {
  /** Fat at the root, tapering to `tip` (power p: higher keeps it fat for longer). */
  taper: (w0: number, tip: number, p = 1.4) => (t: number) => tip + (w0 - tip) * Math.pow(Math.max(0, Math.cos((t * Math.PI) / 2)), p),
  /** Swelling in the middle (peak at `at`), `end` at both ends. */
  swell: (mid: number, end: number, at = 0.45) => (t: number) => end + (mid - end) * Math.max(0, Math.sin(Math.PI * Math.pow(Math.max(0, t), Math.log(0.5) / Math.log(at)))),
};

/** A cut highlight stroke (pointed at both ends), as a filled path. */
export function glint(pts: V[], w: number, fill: string = C.white, o = 0.85): string {
  return `<path d="${brush(pts, W.swell(w, 0.15, 0.45), 24)}" fill="${fill}" opacity="${o}"/>`;
}

/**
 * The cast's pie-eye pupil: a black oval with a slim wedge cut toward the upper right (the shine)
 * and one small glint opposite.
 */
export function piePupil(px: number, py: number, rx: number, ry: number): string {
  const a0 = (-68 * Math.PI) / 180;
  const a1 = (-38 * Math.PI) / 180;
  const R = 1.6;
  const pt = (a: number, k: number) => `${(px + Math.cos(a) * rx * k).toFixed(1)} ${(py + Math.sin(a) * ry * k).toFixed(1)}`;
  const cut = `M${pt(a0, 0.18)} L${pt(a0, R)} L${pt(a1, R)} L${pt(a1, 0.18)} Z`;
  const mid = nextId('pp');
  return `<mask id="${mid}"><rect x="${px - rx * 2}" y="${py - ry * 2}" width="${rx * 4}" height="${ry * 4}" fill="#fff"/><path d="${cut}" fill="#000"/></mask>
    <ellipse cx="${px}" cy="${py}" rx="${rx}" ry="${ry}" fill="${C.ink}" mask="url(#${mid})"/>
    <circle cx="${(px - rx * 0.36).toFixed(1)}" cy="${(py + ry * 0.42).toFixed(1)}" r="${(Math.min(rx, ry) * 0.17).toFixed(1)}" fill="#fff" opacity=".82"/>`;
}
