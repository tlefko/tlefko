/**
 * The network map panel: an Art Deco enamel transit map in a brass frame. Everything here is drawn
 * in layout pixels (the caller passes the panel's geometry), so it rasterises 1:1 per layout.
 *
 * Layers (bottom to top), all in one SVG:
 *  - the brass frame with stepped deco corners, rivets and an inner bevel;
 *  - the enamel field: deep navy with a faint survey grid, a river, two parks, a compass rose and
 *    the network crest in the empty corners;
 *  - the four lines: dark casing, line colour, a bright core;
 *  - station housings: split-flap discs (brass rim, dark face, the flap seam), interchange double
 *    rings, terminal rings in the line colour with the line's roman numeral badge.
 * `lineGlowSvg` is one line's blurred neon, rasterised separately and added on top (lit trains).
 */
import { LINES, STATIONS, MAP_W, MAP_H, type Line } from '../math/network';

export interface MapGeom {
  /** Panel outer size in px. */
  w: number;
  h: number;
  /** Frame thickness. */
  t: number;
  /** Station footprint. */
  S: number;
  /** Station spacing. */
  unit: number;
  /** Portrait: the map is transposed (lines run top to bottom). */
  rot?: boolean;
}

/** Line colours: [main, light core, deep]. */
export const LINE_COLORS: Record<Line['key'], [string, string, string]> = {
  red: ['#e8443a', '#ffb3a6', '#8c1a14'],
  blue: ['#2f86ea', '#b4dcff', '#123f7a'],
  green: ['#20b877', '#a8f5cf', '#0b5c39'],
  gold: ['#f2b632', '#fff0b8', '#8a5a08'],
};
export const LINE_NUMERALS = ['I', 'II', 'III', 'IV'];

const f = (n: number) => n.toFixed(1);

/** Station centre in panel px. */
/** A map point (map units) in panel px (transposed on portrait). */
export function mapPx(g: MapGeom, mx: number, my: number) {
  const [u, v] = g.rot ? [my, mx] : [mx, my];
  return { x: g.t + g.S / 2 + u * g.unit, y: g.t + g.S / 2 + v * g.unit };
}

/** Station centre in panel px. */
export function stationPx(g: MapGeom, id: number) {
  const s = STATIONS[id];
  return mapPx(g, s.x, s.y);
}

function linePath(g: MapGeom, li: number): string {
  return LINES[li].stops
    .map((id, i) => {
      const p = stationPx(g, id);
      return `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`;
    })
    .join(' ');
}

function frame(g: MapGeom): string {
  const { w, h, t } = g;
  const c = t * 1.15; // corner step
  const outer = `M${f(c)} 0 H${f(w - c)} L${f(w)} ${f(c)} V${f(h - c)} L${f(w - c)} ${f(h)} H${f(c)} L0 ${f(h - c)} V${f(c)} Z`;
  const i = t * 0.42;
  const ci = c * 0.75;
  const inner = `M${f(i + ci)} ${f(i)} H${f(w - i - ci)} L${f(w - i)} ${f(i + ci)} V${f(h - i - ci)} L${f(w - i - ci)} ${f(h - i)} H${f(i + ci)} L${f(i)} ${f(h - i - ci)} V${f(i + ci)} Z`;
  const rivets: string[] = [];
  const rr = t * 0.09;
  const n = Math.max(6, Math.round(w / (t * 3.2)));
  for (let k = 1; k < n; k++) {
    const x = (w * k) / n;
    rivets.push(`<circle cx="${f(x)}" cy="${f(t * 0.21)}" r="${f(rr)}"/><circle cx="${f(x)}" cy="${f(h - t * 0.21)}" r="${f(rr)}"/>`);
  }
  const m = Math.max(4, Math.round(h / (t * 3.2)));
  for (let k = 1; k < m; k++) {
    const y = (h * k) / m;
    rivets.push(`<circle cx="${f(t * 0.21)}" cy="${f(y)}" r="${f(rr)}"/><circle cx="${f(w - t * 0.21)}" cy="${f(y)}" r="${f(rr)}"/>`);
  }
  // deco fans in the four corners
  const fan = (x: number, y: number, rot: number) => {
    const r = t * 1.5;
    const rays: string[] = [];
    for (let k = 0; k <= 4; k++) {
      const a = ((rot + 8 + k * 18.5) * Math.PI) / 180;
      rays.push(`M${f(x)} ${f(y)} L${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}`);
    }
    return `<path d="${rays.join(' ')}" stroke="url(#brassLine)" stroke-width="${f(t * 0.07)}" stroke-linecap="round" opacity="0.9"/>
      <circle cx="${f(x)}" cy="${f(y)}" r="${f(t * 0.2)}" fill="url(#brass)" stroke="#3a2408" stroke-width="${f(t * 0.04)}"/>`;
  };
  return `
  <path d="${outer}" fill="url(#brass)"/>
  <path d="${outer}" fill="none" stroke="#2b1a05" stroke-width="${f(t * 0.08)}"/>
  <path d="${inner}" fill="#2a1a07" stroke="url(#brassLine)" stroke-width="${f(t * 0.1)}"/>
  <g fill="url(#rivet)" stroke="#3a2408" stroke-width="${f(t * 0.025)}">${rivets.join('')}</g>
  ${fan(t * 0.62, t * 0.62, 0)}${fan(w - t * 0.62, t * 0.62, 90)}${fan(w - t * 0.62, h - t * 0.62, 180)}${fan(t * 0.62, h - t * 0.62, 270)}`;
}

function field(g: MapGeom): string {
  const { w, h, t, unit, S } = g;
  const x0 = t * 0.62;
  const y0 = t * 0.62;
  const fw = w - x0 * 2;
  const fh = h - y0 * 2;
  const grid: string[] = [];
  const step = unit / 2;
  const ox = t + S / 2;
  const oy = t + S / 2;
  for (let x = ox - step * Math.ceil((ox - x0) / step); x < x0 + fw; x += step) grid.push(`M${f(x)} ${f(y0)} V${f(y0 + fh)}`);
  for (let y = oy - step * Math.ceil((oy - y0) / step); y < y0 + fh; y += step) grid.push(`M${f(x0)} ${f(y)} H${f(x0 + fw)}`);
  const P = (mx: number, my: number) => mapPx(g, mx, my);
  // the river: in from the west under the Blue line's west end, bending north-east between the lines, out east
  const a = P(-0.8, 2.55);
  const b = P(1.6, 1.9);
  const c = P(2.6, 2.85);
  const d = P(4.2, 1.6);
  const e = P(5.6, 2.35);
  const z = P(6.9, 1.95);
  const river = `M${f(a.x)} ${f(a.y)} C${f(b.x)} ${f(b.y)} ${f(c.x)} ${f(c.y)} ${f((c.x + d.x) / 2)} ${f((c.y + d.y) / 2)} S${f(e.x)} ${f(e.y)} ${f(z.x)} ${f(z.y)}`;
  const rw = unit * 0.42;
  const park = (mx: number, my: number, rx: number, ry: number, rot: number) => {
    const p = P(mx, my);
    return `<ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(rx * unit)}" ry="${f(ry * unit)}" transform="rotate(${rot} ${f(p.x)} ${f(p.y)})" fill="#163a2c" opacity="0.55"/>
      <ellipse cx="${f(p.x)}" cy="${f(p.y)}" rx="${f(rx * unit)}" ry="${f(ry * unit)}" transform="rotate(${rot} ${f(p.x)} ${f(p.y)})" fill="none" stroke="#2c6b4f" stroke-width="${f(S * 0.02)}" stroke-dasharray="${f(S * 0.05)} ${f(S * 0.05)}" opacity="0.6"/>`;
  };
  // compass rose (north-west corner) and the network crest (north-east corner)
  const cp = P(0, 0);
  const cr = S * 0.42;
  const star = [0, 90, 180, 270]
    .map((deg) => {
      const r = (deg * Math.PI) / 180;
      const tip = { x: cp.x + Math.sin(r) * cr, y: cp.y - Math.cos(r) * cr };
      const l = { x: cp.x + Math.sin(r - 0.5) * cr * 0.22, y: cp.y - Math.cos(r - 0.5) * cr * 0.22 };
      const rr = { x: cp.x + Math.sin(r + 0.5) * cr * 0.22, y: cp.y - Math.cos(r + 0.5) * cr * 0.22 };
      return `<path d="M${f(cp.x)} ${f(cp.y)} L${f(l.x)} ${f(l.y)} L${f(tip.x)} ${f(tip.y)} Z" fill="#e9d9a8"/><path d="M${f(cp.x)} ${f(cp.y)} L${f(rr.x)} ${f(rr.y)} L${f(tip.x)} ${f(tip.y)} Z" fill="#a8925a"/>`;
    })
    .join('');
  const kp = P(6, 0);
  const kr = S * 0.36;
  const crest = `<g opacity="0.85">
      <circle cx="${f(kp.x)}" cy="${f(kp.y)}" r="${f(kr)}" fill="none" stroke="#c9a85a" stroke-width="${f(S * 0.035)}"/>
      <circle cx="${f(kp.x)}" cy="${f(kp.y)}" r="${f(kr * 0.62)}" fill="none" stroke="#c9a85a" stroke-width="${f(S * 0.02)}"/>
      <path d="M${f(kp.x - kr * 1.55)} ${f(kp.y)} H${f(kp.x - kr * 0.75)} M${f(kp.x + kr * 0.75)} ${f(kp.y)} H${f(kp.x + kr * 1.55)}" stroke="#c9a85a" stroke-width="${f(S * 0.03)}" stroke-linecap="round"/>
      <path d="M${f(kp.x - kr * 1.45)} ${f(kp.y - kr * 0.32)} H${f(kp.x - kr * 0.85)} M${f(kp.x + kr * 0.85)} ${f(kp.y - kr * 0.32)} H${f(kp.x + kr * 1.45)} M${f(kp.x - kr * 1.3)} ${f(kp.y + kr * 0.32)} H${f(kp.x - kr * 0.85)} M${f(kp.x + kr * 0.85)} ${f(kp.y + kr * 0.32)} H${f(kp.x + kr * 1.3)}" stroke="#c9a85a" stroke-width="${f(S * 0.018)}" stroke-linecap="round"/>
      <path d="M${f(kp.x)} ${f(kp.y - kr * 0.45)} L${f(kp.x + kr * 0.2)} ${f(kp.y + kr * 0.05)} L${f(kp.x + kr * 0.04)} ${f(kp.y + kr * 0.05)} L${f(kp.x + kr * 0.12)} ${f(kp.y + kr * 0.45)} L${f(kp.x - kr * 0.2)} ${f(kp.y - kr * 0.05)} L${f(kp.x - kr * 0.04)} ${f(kp.y - kr * 0.05)} Z" fill="#ffd36a"/>
    </g>`;
  // city blocks: a faint street grid of rounded blocks (seeded, deterministic)
  const blocks: string[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bs = unit * 0.5;
  for (let by = y0 + bs * 0.12; by < y0 + fh - bs * 0.5; by += bs) {
    for (let bx = x0 + bs * 0.12; bx < x0 + fw - bs * 0.5; bx += bs) {
      if (rnd() < 0.18) continue;
      const bw = bs * (0.72 + rnd() * 0.12);
      const bh = bs * (0.72 + rnd() * 0.12);
      blocks.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" rx="${f(bs * 0.08)}"/>`);
    }
  }
  return `
  <clipPath id="fieldClip"><rect x="${f(x0)}" y="${f(y0)}" width="${f(fw)}" height="${f(fh)}" rx="${f(t * 0.35)}"/></clipPath>
  <rect x="${f(x0)}" y="${f(y0)}" width="${f(fw)}" height="${f(fh)}" rx="${f(t * 0.35)}" fill="url(#field)"/>
  <g clip-path="url(#fieldClip)">
  <g fill="#1f3a60" opacity="0.2">${blocks.join('')}</g>
  <rect x="${f(x0)}" y="${f(y0)}" width="${f(fw)}" height="${f(fh)}" rx="${f(t * 0.35)}" fill="url(#vignette)"/>
  <path d="${grid.join(' ')}" stroke="#7fb2d8" stroke-width="${f(Math.max(0.6, S * 0.008))}" opacity="0.07"/>
  ${park(0.55, 2.0, 0.42, 0.3, -20)}${park(5.5, 2.95, 0.4, 0.26, 15)}
  <path d="${river}" fill="none" stroke="#102c4a" stroke-width="${f(rw * 1.35)}" stroke-linecap="round" opacity="0.9"/>
  <path d="${river}" fill="none" stroke="#1a4774" stroke-width="${f(rw)}" stroke-linecap="round"/>
  <path d="${river}" fill="none" stroke="#3f7fb5" stroke-width="${f(S * 0.016)}" stroke-dasharray="${f(S * 0.12)} ${f(S * 0.2)}" opacity="0.55" transform="translate(0 ${f(-rw * 0.18)})"/>
  <path d="${river}" fill="none" stroke="#3f7fb5" stroke-width="${f(S * 0.016)}" stroke-dasharray="${f(S * 0.09)} ${f(S * 0.24)}" opacity="0.4" transform="translate(0 ${f(rw * 0.2)})"/>
  <g>${star}<circle cx="${f(cp.x)}" cy="${f(cp.y)}" r="${f(cr * 0.62)}" fill="none" stroke="#c9a85a" stroke-width="${f(S * 0.018)}" opacity="0.7"/><circle cx="${f(cp.x)}" cy="${f(cp.y)}" r="${f(S * 0.04)}" fill="#ffd36a"/></g>
  ${crest}
  </g>`;
}

function lines(g: MapGeom): string {
  const { S } = g;
  const out: string[] = [];
  // casings first (so crossings read as one network), then colours, then cores
  for (let li = 0; li < LINES.length; li++) out.push(`<path d="${linePath(g, li)}" fill="none" stroke="#04070d" stroke-width="${f(S * 0.46)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`);
  for (let li = 0; li < LINES.length; li++) {
    const [main, light, deep] = LINE_COLORS[LINES[li].key];
    const d = linePath(g, li);
    out.push(`<path d="${d}" fill="none" stroke="${deep}" stroke-width="${f(S * 0.34)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${main}" stroke-width="${f(S * 0.26)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${light}" stroke-width="${f(S * 0.06)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>`);
    // sleepers: tiny ties across the line every quarter unit
    out.push(`<path d="${d}" fill="none" stroke="${deep}" stroke-width="${f(S * 0.26)}" stroke-dasharray="${f(S * 0.025)} ${f(g.unit * 0.25 - S * 0.025)}" opacity="0.45"/>`);
  }
  return out.join('');
}

function housings(g: MapGeom): string {
  const { S } = g;
  const out: string[] = [];
  STATIONS.forEach((st, id) => {
    const p = stationPx(g, id);
    const r = S * 0.46;
    if (st.kind === 'interchange') {
      out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 1.16)}" fill="#04070d"/>`);
      out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 1.1)}" fill="none" stroke="#f4ecd8" stroke-width="${f(S * 0.07)}"/>`);
      // a quarter of each crossing line's colour on the ring
      st.lines.forEach((li, k) => {
        const [main] = LINE_COLORS[LINES[li].key];
        const a0 = (k * 180 + 200) * (Math.PI / 180);
        const a1 = a0 + Math.PI * 0.45;
        const R = r * 1.1;
        out.push(
          `<path d="M${f(p.x + Math.cos(a0) * R)} ${f(p.y + Math.sin(a0) * R)} A${f(R)} ${f(R)} 0 0 1 ${f(p.x + Math.cos(a1) * R)} ${f(p.y + Math.sin(a1) * R)}" fill="none" stroke="${main}" stroke-width="${f(S * 0.07)}" stroke-linecap="round"/>`,
        );
      });
    } else if (st.kind === 'terminal') {
      const [main, , deep] = LINE_COLORS[LINES[st.lines[0]].key];
      out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 1.16)}" fill="#04070d"/>`);
      out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 1.1)}" fill="none" stroke="${main}" stroke-width="${f(S * 0.09)}"/>`);
      out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 1.1)}" fill="none" stroke="${deep}" stroke-width="${f(S * 0.02)}" stroke-dasharray="${f(S * 0.04)} ${f(S * 0.06)}"/>`);
    } else {
      out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r * 1.08)}" fill="#04070d"/>`);
    }
    // the split-flap face: brass rim, dark face, the seam across the middle
    out.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(r)}" fill="url(#face)" stroke="url(#brassLine)" stroke-width="${f(S * 0.045)}"/>`);
    out.push(`<path d="M${f(p.x - r * 0.93)} ${f(p.y)} H${f(p.x + r * 0.93)}" stroke="#000" stroke-width="${f(S * 0.018)}" opacity="0.8"/>`);
    out.push(`<path d="M${f(p.x - r * 0.9)} ${f(p.y + S * 0.016)} H${f(p.x + r * 0.9)}" stroke="#5a6a80" stroke-width="${f(S * 0.008)}" opacity="0.6"/>`);
    out.push(`<circle cx="${f(p.x - r * 0.93)}" cy="${f(p.y)}" r="${f(S * 0.022)}" fill="#c9a85a"/><circle cx="${f(p.x + r * 0.93)}" cy="${f(p.y)}" r="${f(S * 0.022)}" fill="#c9a85a"/>`);
  });
  // line badges: roman numerals outside each line's first terminal
  LINES.forEach((l, li) => {
    const [main, , deep] = LINE_COLORS[l.key];
    for (const end of [0, l.stops.length - 1]) {
      const id = l.stops[end];
      const nb = l.stops[end === 0 ? 1 : end - 1];
      const a = stationPx(g, id);
      const b = stationPx(g, nb);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const n = Math.hypot(dx, dy) || 1;
      const off = S * 0.66;
      // tuck the badge to the side of the terminal, off the line's axis
      const px = a.x + (dx / n) * off * 0.25 + (-dy / n) * off * (end === 0 ? 1 : -1);
      const py = a.y + (dy / n) * off * 0.25 + (dx / n) * off * (end === 0 ? 1 : -1);
      const bw = S * 0.32;
      out.push(`<g><rect x="${f(px - bw / 2)}" y="${f(py - bw / 2)}" width="${f(bw)}" height="${f(bw)}" rx="${f(bw * 0.22)}" transform="rotate(45 ${f(px)} ${f(py)})" fill="${main}" stroke="${deep}" stroke-width="${f(S * 0.02)}"/>
        <text x="${f(px)}" y="${f(py + S * 0.055)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${f(S * 0.15)}" fill="#fffaf0">${LINE_NUMERALS[li]}</text></g>`);
    }
  });
  return out.join('');
}

function defs(g: MapGeom): string {
  const { w, h } = g;
  return `<defs>
    <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe7a3"/><stop offset="0.18" stop-color="#d9a441"/><stop offset="0.5" stop-color="#9c6a1c"/>
      <stop offset="0.82" stop-color="#d9a441"/><stop offset="1" stop-color="#6a440f"/>
    </linearGradient>
    <linearGradient id="brassLine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1c2"/><stop offset="0.5" stop-color="#c9922e"/><stop offset="1" stop-color="#7d5313"/>
    </linearGradient>
    <radialGradient id="rivet" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff4d0"/><stop offset="0.5" stop-color="#c4912f"/><stop offset="1" stop-color="#5a3a0c"/></radialGradient>
    <radialGradient id="field" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0" stop-color="#173052"/><stop offset="0.6" stop-color="#0f2140"/><stop offset="1" stop-color="#081327"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.72" gradientTransform="scale(1 ${f(w / Math.max(1, h))})" gradientUnits="objectBoundingBox">
      <stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#fff" stop-opacity="0.07"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.025"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="face" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#2a3446"/><stop offset="0.7" stop-color="#121822"/><stop offset="1" stop-color="#07090e"/></radialGradient>
  </defs>`;
}

/** The whole panel (frame, field, lines, housings) at layout size. */
export function mapPanelSvg(g: MapGeom): string {
  const x0 = g.t * 0.62;
  const sheen = `<path d="M${f(x0)} ${f(x0)} H${f(g.w * 0.46)} L${f(g.w * 0.3)} ${f(g.h - x0)} H${f(x0)} Z" fill="url(#sheen)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(g.w)} ${f(g.h)}" width="${f(g.w)}" height="${f(g.h)}">${defs(g)}${frame(g)}${field(g)}${lines(g)}${housings(g)}${sheen}</svg>`;
}

/** One line's neon glow (blurred), for the lit-line overlay. */
export function lineGlowSvg(g: MapGeom, li: number): string {
  const [main, light] = LINE_COLORS[LINES[li].key];
  const blur = g.S * 0.16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(g.w)} ${f(g.h)}" width="${f(g.w)}" height="${f(g.h)}">
    <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(blur)}"/></filter></defs>
    <path d="${linePath(g, li)}" fill="none" stroke="${main}" stroke-width="${f(g.S * 0.55)}" stroke-linejoin="round" stroke-linecap="round" filter="url(#b)"/>
    <path d="${linePath(g, li)}" fill="none" stroke="${light}" stroke-width="${f(g.S * 0.08)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>
  </svg>`;
}

/** Unused-grid guard: the map must fit the declared extent. */
export const MAP_EXTENT = { w: MAP_W, h: MAP_H };
