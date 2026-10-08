/**
 * Hand-built lettering for Powder Keg Cove (docs/ART.md). No font is involved anywhere in here:
 * every letterform (the logo words POWDER KEG, COVE, the LIGHT THE FUSE tagline) and every numeral
 * the game shows (win amounts, multipliers, counters) is constructed in this file from stems,
 * bracketed slab serifs, bowls, brush strokes and ball terminals. The parts of a glyph are merged
 * into one clean outline (a small anti-aliased raster union traced back to vectors), so outlines,
 * brass rims and inlines follow the true silhouette.
 *
 * Units: cap height 100, baseline at y = 100, x grows to the right. Outlines use fill-rule evenodd
 * (counters are their own loops). Consumers:
 *   - `logoSvg()`: the whole title lockup as one SVG (Logo.ts, the boot capture, the Stake tile);
 *   - `glyph()` / `NUMERALS`: the outlines text.ts bakes into the numeral bitmap font;
 *   - `wordSvg()`: any word from the glyph set in one of the house treatments.
 */
import { C } from './kit';
import { ribbon } from './props';

export type Pt = [number, number];
type Loop = Pt[];
interface Part {
  loops: Loop[];
  cut?: boolean;
  /** Loops union (nonzero, any orientation); without it the loops are evenodd (rings, counters). */
  nonzero?: boolean;
  /** Rasterise every loop on its own and union them (brush quads, which can fold into bow ties). */
  each?: boolean;
}

/* ================================ geometry kit ================================ */

const TAU = Math.PI * 2;
const segs = (len: number) => Math.max(4, Math.min(48, Math.ceil(len / 1.6)));

/** Path builder that flattens curves straight into polygon loops. */
class Pen {
  loops: Loop[] = [];
  private cur: Loop = [];
  private x = 0;
  private y = 0;
  M(x: number, y: number) {
    this.cur = [[x, y]];
    this.loops.push(this.cur);
    this.x = x;
    this.y = y;
    return this;
  }
  L(x: number, y: number) {
    this.cur.push([x, y]);
    this.x = x;
    this.y = y;
    return this;
  }
  Q(cx: number, cy: number, x: number, y: number) {
    const x0 = this.x;
    const y0 = this.y;
    const n = segs(Math.hypot(cx - x0, cy - y0) + Math.hypot(x - cx, y - cy));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      this.cur.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
    }
    this.x = x;
    this.y = y;
    return this;
  }
  C(ax: number, ay: number, bx: number, by: number, x: number, y: number) {
    const x0 = this.x;
    const y0 = this.y;
    const n = segs(Math.hypot(ax - x0, ay - y0) + Math.hypot(bx - ax, by - ay) + Math.hypot(x - bx, y - by));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      this.cur.push([a * x0 + b * ax + c * bx + d * x, a * y0 + b * ay + c * by + d * y]);
    }
    this.x = x;
    this.y = y;
    return this;
  }
  get part(): Part {
    return { loops: this.loops };
  }
}

/** Filled shapes: several loops union (nonzero, orientation-independent). */
const shape = (...loops: Loop[]): Part => ({ loops, nonzero: true });
const cut = (...loops: Loop[]): Part => ({ loops, cut: true, nonzero: true });
const rect = (x: number, y: number, w: number, h: number): Loop => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Superellipse (e = 2 is an ellipse; higher is squarer, like a hand-cut woodtype bowl). */
function oval(cx: number, cy: number, rx: number, ry: number, e = 2, n = 96): Loop {
  const out: Loop = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / e), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  return out;
}

/** Half of a superellipse, closed along its centre line. */
function halfOval(cx: number, cy: number, rx: number, ry: number, side: 'left' | 'right' | 'top' | 'bottom', e = 2, n = 64): Loop {
  const a0 = { right: -90, bottom: 0, left: 90, top: 180 }[side];
  const out: Loop = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (i / n) * 180) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push([cx + rx * Math.sign(c) * Math.abs(c) ** (2 / e), cy + ry * Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  return out;
}

/** Straight bar between two points, `w` wide, flat ends pushed out by `ext`. */
function bar(a: Pt, b: Pt, w: number, ext = 0): Loop {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = (-uy * w) / 2;
  const ny = (ux * w) / 2;
  const A: Pt = [a[0] - ux * ext, a[1] - uy * ext];
  const B: Pt = [b[0] + ux * ext, b[1] + uy * ext];
  return [
    [A[0] + nx, A[1] + ny],
    [B[0] + nx, B[1] + ny],
    [B[0] - nx, B[1] - ny],
    [A[0] - nx, A[1] - ny],
  ];
}

/** Catmull-Rom spline through `pts`, sampled into n + 1 points. */
function spline(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  const m = pts.length - 1;
  for (let s = 0; s <= n; s++) {
    const u = (s / n) * m;
    const i = Math.min(m - 1, Math.floor(u));
    const t = u - i;
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t2 = t * t;
    const t3 = t2 * t;
    const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/**
 * A pen stroke along a smooth spine: `w` is the full width (a number, or a function of 0..1
 * along the stroke). Round caps unless `flat`.
 */
function brush(spine: Pt[], w: number | ((t: number) => number), flat = false, n = 72): Part {
  const s = spline(spine, n);
  const W = typeof w === 'number' ? () => w : w;
  const L: Pt[] = [];
  const R: Pt[] = [];
  const norm: Pt[] = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = W(i / (s.length - 1)) / 2;
    norm.push([nx, ny]);
    L.push([s[i][0] + nx * hw, s[i][1] + ny * hw]);
    R.push([s[i][0] - nx * hw, s[i][1] - ny * hw]);
  }
  const cap = (c: Pt, n0: Pt, hw: number, forward: boolean): Pt[] => {
    // half circle from +normal to -normal through the stroke direction (or its reverse)
    const out: Pt[] = [];
    const dir: Pt = forward ? [n0[1], -n0[0]] : [-n0[1], n0[0]];
    for (let k = 1; k < 12; k++) {
      const a = (k / 12) * Math.PI;
      const cs = Math.cos(a);
      const sn = Math.sin(a);
      const side = forward ? 1 : -1;
      out.push([c[0] + (n0[0] * cs * side + dir[0] * sn) * hw, c[1] + (n0[1] * cs * side + dir[1] * sn) * hw]);
    }
    return out;
  };
  // the stroke as a chain of quads (their union is exact even where a tight curve folds the
  // inner edge over itself), plus half-disc caps
  const last = s.length - 1;
  const loops: Loop[] = [];
  // neighbours overlap a little so no seam is left between them
  const e = 0.35;
  const push = (p: Pt, t: Pt, k: number): Pt => [p[0] + t[0] * k, p[1] + t[1] * k];
  for (let i = 0; i < last; i++) {
    const dx = s[i + 1][0] - s[i][0];
    const dy = s[i + 1][1] - s[i][1];
    const len = Math.hypot(dx, dy) || 1;
    const t: Pt = [dx / len, dy / len];
    loops.push([push(L[i], t, i ? -e : 0), push(L[i + 1], t, i + 1 < last ? e : 0), push(R[i + 1], t, i + 1 < last ? e : 0), push(R[i], t, i ? -e : 0)]);
  }
  if (!flat) {
    loops.push([L[last], ...cap(s[last], norm[last], W(1) / 2, true), R[last]]);
    loops.push([R[0], ...cap(s[0], norm[0], W(0) / 2, false), L[0]]);
  }
  return { loops, nonzero: true, each: true };
}

/**
 * Vertical stem between x0 and x1 (y0 top, y1 bottom) with bracketed slab serifs: each corner's
 * value is how far that serif reaches past the stem (0 = none).
 */
function stem(x0: number, x1: number, y0: number, y1: number, s: { tl?: number; tr?: number; bl?: number; br?: number } = {}, k = SERIF): Part {
  const { tl = 0, tr = 0, bl = 0, br = 0 } = s;
  const p = new Pen().M(x0 - tl, y0);
  if (tr) p.L(x1 + tr, y0).L(x1 + tr, y0 + k.h).Q(x1, y0 + k.h, x1, y0 + k.h + k.b);
  else p.L(x1, y0);
  if (br) p.L(x1, y1 - k.h - k.b).Q(x1, y1 - k.h, x1 + br, y1 - k.h).L(x1 + br, y1);
  else p.L(x1, y1);
  if (bl) p.L(x0 - bl, y1).L(x0 - bl, y1 - k.h).Q(x0, y1 - k.h, x0, y1 - k.h - k.b);
  else p.L(x0, y1);
  if (tl) p.L(x0, y0 + k.h + k.b).Q(x0, y0 + k.h, x0 - tl, y0 + k.h);
  return p.part;
}

/** Concave fillet that fills the inside corner at (x, y); (sx, sy) points into the open quadrant. */
function fillet(x: number, y: number, sx: number, sy: number, r: number): Part {
  return new Pen().M(x, y).L(x + sx * r, y).Q(x, y, x, y + sy * r).part;
}

/** Slab serif on the end of a diagonal stroke: a flat plate centred on x at the top or bottom. */
function plate(cx: number, halfW: number, top: boolean, k = SERIF): Part {
  return shape(rect(cx - halfW, top ? 0 : 100 - k.h, halfW * 2, k.h));
}

/** x of a straight line from a to b at height y. */
const xAt = (a: Pt, b: Pt, y: number) => a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);

/* ------------------------------ raster union ------------------------------ */

const SUB = 4; // sub-scanlines per pixel row (vertical anti-aliasing)

interface Edge {
  ya: number;
  yb: number;
  x: number;
  k: number;
  w: number;
}

/** Scan-convert one part into `out` (pixel coverage 0..1), with exact horizontal coverage. */
function rasterize(p: Part, ox: number, oy: number, nx: number, ny: number, R: number, out: Float32Array, j0 = 0, j1 = ny - 1) {
  const edges: Edge[] = [];
  for (const l of p.loops) {
    // nonzero parts are unions: every loop counts positive whichever way it was drawn
    const flip = p.nonzero && area(l) < 0 ? -1 : 1;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      const b = l[(i + 1) % l.length];
      let ax = (a[0] - ox) * R;
      let ay = (a[1] - oy) * R;
      let bx = (b[0] - ox) * R;
      let by = (b[1] - oy) * R;
      if (ay === by) continue;
      let w = flip;
      if (ay > by) {
        [ax, bx] = [bx, ax];
        [ay, by] = [by, ay];
        w = -flip;
      }
      edges.push({ ya: ay, yb: by, x: ax, k: (bx - ax) / (by - ay), w });
    }
  }
  if (!edges.length) return;
  edges.sort((a, b) => a.ya - b.ya);
  const n = edges.length;
  const act = new Int32Array(n);
  let na = 0;
  const xs = new Float64Array(n);
  const ws = new Int8Array(n);
  let ei = 0;
  const wgt = 1 / SUB;
  const nonzero = !!p.nonzero;
  for (let s = j0 * SUB; s < (j1 + 1) * SUB; s++) {
    const y = (s + 0.5) / SUB;
    while (ei < n && edges[ei].ya <= y) act[na++] = ei++;
    // drop finished edges, collect crossings
    let m = 0;
    let keep = 0;
    for (let q = 0; q < na; q++) {
      const e = edges[act[q]];
      if (e.yb <= y) continue;
      act[keep++] = act[q];
      // insertion sort by x as we go (a handful of crossings per row)
      const x = e.x + (y - e.ya) * e.k;
      let z = m++;
      while (z > 0 && xs[z - 1] > x) {
        xs[z] = xs[z - 1];
        ws[z] = ws[z - 1];
        z--;
      }
      xs[z] = x;
      ws[z] = e.w;
    }
    na = keep;
    if (m < 2) continue;
    const base = Math.floor(s / SUB) * nx;
    let wind = 0;
    let start = 0;
    for (let q = 0; q < m; q++) {
      let xa: number;
      let xb: number;
      if (nonzero) {
        const was = wind;
        wind += ws[q];
        if (was === 0 && wind !== 0) {
          start = xs[q];
          continue;
        }
        if (was === 0 || wind !== 0) continue;
        xa = start;
        xb = xs[q];
      } else {
        if (q % 2 === 0) continue;
        xa = xs[q - 1];
        xb = xs[q];
      }
      if (xb <= 0 || xa >= nx) continue;
      if (xa < 0) xa = 0;
      if (xb > nx - 1e-6) xb = nx - 1e-6;
      if (xb <= xa) continue;
      const ia = Math.floor(xa);
      const ib = Math.floor(xb);
      if (ia === ib) {
        out[base + ia] += (xb - xa) * wgt;
        continue;
      }
      out[base + ia] += (ia + 1 - xa) * wgt;
      for (let i = base + ia + 1; i < base + ib; i++) out[i] += wgt;
      out[base + ib] += (xb - ib) * wgt;
    }
  }
}

/** Marching-squares segments per corner code (TL 8, TR 4, BR 2, BL 1): pairs of edges 0 T, 1 R, 2 B, 3 L. */
const MS: Record<number, number[]> = { 1: [3, 2], 2: [2, 1], 3: [3, 1], 4: [0, 1], 6: [0, 2], 7: [3, 0], 8: [3, 0], 9: [0, 2], 11: [0, 1], 12: [3, 1], 13: [2, 1], 14: [3, 2] };
/** Saddles, resolved by the cell centre: [centre outside, centre inside]. */
const SADDLE: Record<number, [number[], number[]]> = {
  5: [
    [0, 1, 3, 2],
    [3, 0, 2, 1],
  ],
  10: [
    [3, 0, 2, 1],
    [0, 1, 3, 2],
  ],
};

/** Marching squares at the 0.5 level; returns closed loops in pixel-centre coordinates. */
function trace(f: Float32Array, nx: number, ny: number): Loop[] {
  const iso = 0.5;
  // inside/outside bytes with a one-cell zero border, so the scan needs no bounds checks
  const MW = nx + 2;
  const mask = new Uint8Array(MW * (ny + 2));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (f[j * nx + i] > iso) mask[(j + 1) * MW + i + 1] = 1;
  const v = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : Math.min(1, f[j * nx + i]));
  const W = nx + 3;
  const keyH = (i: number, j: number) => ((j + 1) * W + (i + 1)) * 2;
  const keyV = (i: number, j: number) => ((j + 1) * W + (i + 1)) * 2 + 1;
  const pts = new Map<number, Pt>();
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  let ci = 0;
  let cj = 0;
  // edge 0 top, 1 right, 2 bottom, 3 left of the current cell: its key, and its point on first use
  const edge = (e: number): number => {
    const i = ci;
    const j = cj;
    let k: number;
    if (e === 0) {
      k = keyH(i, j);
      if (!pts.has(k)) pts.set(k, [i + (iso - a) / (b - a), j]);
    } else if (e === 1) {
      k = keyV(i + 1, j);
      if (!pts.has(k)) pts.set(k, [i + 1, j + (iso - b) / (c - b)]);
    } else if (e === 2) {
      k = keyH(i, j + 1);
      if (!pts.has(k)) pts.set(k, [i + (iso - d) / (c - d), j + 1]);
    } else {
      k = keyV(i, j);
      if (!pts.has(k)) pts.set(k, [i, j + (iso - a) / (d - a)]);
    }
    return k;
  };
  for (let j = -1; j < ny; j++) {
    const r0 = (j + 1) * MW;
    const r1 = r0 + MW;
    for (let i = -1; i < nx; i++) {
      const code = (mask[r0 + i + 1] << 3) | (mask[r0 + i + 2] << 2) | (mask[r1 + i + 2] << 1) | mask[r1 + i + 1];
      if (code === 0 || code === 15) continue;
      a = v(i, j);
      b = v(i + 1, j);
      c = v(i + 1, j + 1);
      d = v(i, j + 1);
      ci = i;
      cj = j;
      const segsOf = code === 5 || code === 10 ? SADDLE[code][(a + b + c + d) / 4 > iso ? 1 : 0] : MS[code];
      for (let s = 0; s < segsOf.length; s += 2) link(edge(segsOf[s]), edge(segsOf[s + 1]));
    }
  }
  const loops: Loop[] = [];
  const seen = new Set<number>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop: Loop = [];
    let prev = -1;
    let cur = start;
    for (let guard = 0; guard < 200000; guard++) {
      seen.add(cur);
      loop.push(pts.get(cur)!);
      const nb = adj.get(cur)!;
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
      if (cur === start || cur === undefined) break;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/** Ramer-Douglas-Peucker on an open polyline. */
function rdp(pts: Pt[], eps: number): Pt[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let far = -1;
    let fd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > fd) {
        fd = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function simplifyLoop(l: Loop, eps: number): Loop {
  if (l.length < 8) return l;
  let far = 0;
  let fd = 0;
  for (let i = 1; i < l.length; i++) {
    const d = (l[i][0] - l[0][0]) ** 2 + (l[i][1] - l[0][1]) ** 2;
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const a = rdp(l.slice(0, far + 1), eps);
  const b = rdp([...l.slice(far), l[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/** Union of the parts (in order; cut parts subtract) as clean outline loops. */
function unite(parts: Part[], R = 3): Loop[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of parts) {
    if (p.cut) continue;
    for (const l of p.loops) {
      for (const [x, y] of l) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  const ox = x0 - 2 / R;
  const oy = y0 - 2 / R;
  const nx = Math.ceil((x1 - x0) * R) + 4;
  const ny = Math.ceil((y1 - y0) * R) + 4;
  const acc = new Float32Array(nx * ny);
  const tmp = new Float32Array(nx * ny);
  const flat: Part[] = [];
  for (const p of parts) {
    if (p.each) for (const l of p.loops) flat.push({ loops: [l], nonzero: true, cut: p.cut });
    else flat.push(p);
  }
  for (const p of flat) {
    // work only inside the part's own pixel box
    let px0 = Infinity;
    let py0 = Infinity;
    let px1 = -Infinity;
    let py1 = -Infinity;
    for (const l of p.loops) {
      for (const [x, y] of l) {
        px0 = Math.min(px0, x);
        py0 = Math.min(py0, y);
        px1 = Math.max(px1, x);
        py1 = Math.max(py1, y);
      }
    }
    const i0 = Math.max(0, Math.floor((px0 - ox) * R) - 1);
    const i1 = Math.min(nx - 1, Math.ceil((px1 - ox) * R) + 1);
    const j0 = Math.max(0, Math.floor((py0 - oy) * R) - 1);
    const j1 = Math.min(ny - 1, Math.ceil((py1 - oy) * R) + 1);
    if (i1 < i0 || j1 < j0) continue;
    rasterize(p, ox, oy, nx, ny, R, tmp, j0, j1);
    for (let j = j0; j <= j1; j++) {
      const row = j * nx;
      for (let i = row + i0; i <= row + i1; i++) {
        // saturating add / subtract: abutting parts close their seam exactly (0.5 + 0.5), overlaps clamp
        const c = tmp[i] > 1 ? 1 : tmp[i];
        const v = p.cut ? acc[i] - c : acc[i] + c;
        acc[i] = v < 0 ? 0 : v > 1 ? 1 : v;
        tmp[i] = 0;
      }
    }
  }
  return trace(acc, nx, ny)
    .map((l) => simplifyLoop(l.map(([px, py]) => [ox + (px + 0.5) / R, oy + (py + 0.5) / R] as Pt), 0.045))
    .filter((l) => Math.abs(area(l)) > 1);
}

function area(l: Loop): number {
  let a = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i];
    const q = l[(i + 1) % l.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const n2 = (v: number) => {
  const s = v.toFixed(2);
  return s.endsWith('00') ? s.slice(0, -3) : s.endsWith('0') ? s.slice(0, -1) : s;
};
const pathOf = (loops: Loop[]) => loops.map((l) => `M${l.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L')}Z`).join('');

/* ================================== glyphs ================================== */

/** Serif proportions: slab height, bracket length. */
interface SerifK {
  h: number;
  b: number;
}
const SERIF: SerifK = { h: 10, b: 12 };
const NSERIF: SerifK = { h: 9, b: 10 };

/** Logo letter weights. */
const SW = 25; // stem
const SR = 9; // serif reach
const RS = 27; // round side
const RT = 18; // round top / bottom
const OV = 2.5; // overshoot of rounds

/** Numeral weights (a touch lighter so the counters stay open at small sizes). */
const NW = 21;
const NRS = 19.5;
const NRT = 14.5;
/** Tabular advance of every digit. */
export const DIGIT_ADV = 78;

interface Def {
  adv: number;
  parts: () => Part[];
}

const below = cut(rect(-60, 100, 400, 60));
const above = cut(rect(-60, -60, 400, 60));

/* ---- logo capitals ---- */
const LETTERS: Record<string, Def> = {
  P: {
    adv: 86,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, bl: SR, br: SR }),
      shape(rect(22, 0, 34, 62)),
      shape(halfOval(56, 31, 27, 31, 'right', 2.3)),
      fillet(10 + SW, 62, 1, 1, 9),
      cut(rect(10 + SW, 18, 18, 26), halfOval(53, 31, 4, 13, 'right', 2)),
    ],
  },
  O: {
    adv: 92,
    parts: () => [{ loops: [oval(46, 50, 43, 50 + OV, 2.35), oval(46, 50, 43 - RS, 50 + OV - RT, 2.7)] }],
  },
  W: {
    adv: 124,
    parts: () => {
      const t = 25;
      const h = 15;
      const s1: [Pt, Pt] = [[20, 0], [41, 100]];
      const s2: [Pt, Pt] = [[41, 100], [61, 0]];
      const s3: [Pt, Pt] = [[64, 0], [85, 100]];
      const s4: [Pt, Pt] = [[85, 100], [105, 0]];
      return [
        shape(bar(s1[0], s1[1], t, 14)),
        shape(bar(s2[0], s2[1], h, 14)),
        shape(bar(s3[0], s3[1], t, 14)),
        shape(bar(s4[0], s4[1], h, 14)),
        shape(rect(1, 0, 38, SERIF.h)),
        shape(rect(46, 0, 37, SERIF.h)),
        shape(rect(91, 0, 29, SERIF.h)),
        below,
        above,
      ];
    },
  },
  D: {
    adv: 92,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, bl: SR }),
      shape(rect(22, 0, 26, 100)),
      shape(halfOval(48, 50, 38, 50, 'right', 2.3)),
      cut(rect(10 + SW, RT, 13, 100 - 2 * RT), halfOval(48, 50, 11, 50 - RT, 'right', 2.5)),
    ],
  },
  E: {
    adv: 80,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, bl: SR }),
      shape(rect(30, 0, 38, 20)),
      shape(rect(58, 0, 11, 35)),
      fillet(58, 20, -1, 1, 8),
      fillet(10 + SW, 20, 1, 1, 9),
      shape(rect(30, 42, 25, 17)),
      shape(rect(49, 37, 8, 27)),
      fillet(49, 42, -1, -1, 4),
      fillet(49, 59, -1, 1, 4),
      fillet(10 + SW, 42, 1, -1, 6),
      fillet(10 + SW, 59, 1, 1, 6),
      shape(rect(30, 80, 40, 20)),
      shape(rect(60, 63, 11, 37)),
      fillet(60, 80, -1, -1, 8),
      fillet(10 + SW, 80, 1, -1, 9),
    ],
  },
  R: {
    adv: 92,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, bl: SR, br: 6 }),
      shape(rect(22, 0, 32, 58)),
      shape(halfOval(54, 29, 27, 29, 'right', 2.3)),
      cut(rect(10 + SW, 17, 18, 24), halfOval(53, 29, 4, 12, 'right', 2)),
      brush(
        [
          [46, 50],
          [58, 62],
          [66, 80],
          [72, 104],
        ],
        (t) => 22 + 5 * t,
        true,
      ),
      shape(rect(62, 90, 29, 10)),
      fillet(62, 90, -1, -1, 5),
      below,
    ],
  },
  K: {
    adv: 94,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, bl: SR, tr: 5, br: 5 }),
      shape(bar([34, 64], [80, 0], 19, 12)),
      shape(rect(62, 0, 31, SERIF.h)),
      shape(bar([44, 44], [82, 100], 25, 12)),
      shape(rect(66, 90, 28, 10)),
      fillet(66, 90, -1, -1, 5),
      below,
      above,
    ],
  },
  G: {
    adv: 94,
    parts: () => [
      { loops: [oval(47, 50, 43, 50 + OV, 2.35), oval(47, 50, 43 - RS, 50 + OV - RT, 2.7)] },
      cut(rect(60, 27, 50, 26)),
      shape(rect(76, 4, 11, 30)),
      shape(rect(50, 53, 42, 15)),
      shape(rect(64, 53, 24, 41)),
    ],
  },
  C: {
    adv: 88,
    parts: () => [
      { loops: [oval(46, 50, 42, 50 + OV, 2.35), oval(46, 50, 42 - RS, 50 + OV - RT, 2.7)] },
      cut(rect(60, 29, 50, 42)),
      shape(rect(74, 4, 11, 30)),
      shape(rect(74, 66, 11, 30)),
    ],
  },
  V: {
    adv: 94,
    parts: () => {
      const a: [Pt, Pt] = [[22, 0], [46, 100]];
      const b: [Pt, Pt] = [[46, 100], [72, 0]];
      return [shape(bar(a[0], a[1], 26, 14)), shape(bar(b[0], b[1], 16, 14)), plate(22, 22, true), plate(72, 17, true), below, above];
    },
  },
  L: {
    adv: 74,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, tr: SR, bl: SR }),
      shape(rect(30, 80, 38, 20)),
      shape(rect(58, 62, 11, 38)),
      fillet(58, 80, -1, -1, 8),
      fillet(10 + SW, 80, 1, -1, 9),
    ],
  },
  I: {
    adv: 45,
    parts: () => [stem(10, 10 + SW, 0, 100, { tl: SR, tr: SR, bl: SR, br: SR })],
  },
  H: {
    adv: 100,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, tr: 6, bl: SR, br: 6 }),
      stem(65, 65 + SW, 0, 100, { tl: 6, tr: SR, bl: 6, br: SR }),
      shape(rect(30, 41, 40, 18)),
    ],
  },
  T: {
    adv: 84,
    parts: () => [
      shape(rect(4, 0, 76, 20)),
      shape(rect(4, 0, 11, 34)),
      shape(rect(69, 0, 11, 34)),
      fillet(15, 20, 1, 1, 7),
      fillet(69, 20, -1, 1, 7),
      stem(29.5, 29.5 + SW, 0, 100, { bl: SR, br: SR }),
      fillet(29.5, 20, -1, 1, 8),
      fillet(29.5 + SW, 20, 1, 1, 8),
    ],
  },
  F: {
    adv: 76,
    parts: () => [
      stem(10, 10 + SW, 0, 100, { tl: SR, bl: SR, br: SR }),
      shape(rect(30, 0, 38, 20)),
      shape(rect(58, 0, 11, 35)),
      fillet(58, 20, -1, 1, 8),
      fillet(10 + SW, 20, 1, 1, 9),
      shape(rect(30, 43, 25, 17)),
      shape(rect(49, 38, 8, 27)),
      fillet(49, 43, -1, -1, 4),
      fillet(49, 60, -1, 1, 4),
      fillet(10 + SW, 43, 1, -1, 6),
      fillet(10 + SW, 60, 1, 1, 6),
    ],
  },
  U: {
    adv: 96,
    parts: () => [
      stem(10, 10 + SW, 0, 64, { tl: SR, tr: 6 }),
      stem(64, 64 + 22, 0, 64, { tl: 6, tr: SR }),
      shape(halfOval(48, 58, 38, 42 + OV, 'bottom', 2.3)),
      cut(halfOval(49.5, 58, 14.5, 42 + OV - RT, 'bottom', 2.5), rect(35, -10, 29, 68.2)),
    ],
  },
  S: {
    adv: 80,
    parts: () => sShape(0, 0, 1, { w: 27, thin: 17 }),
  },
};

/**
 * The S (and the $): one brush stroke along an S spine, thick through the diagonal and thin in
 * the arcs. Both terminals are cut to a vertical face that grows into a beak serif (the logo S), or
 * end in balls (the numeral $). Drawn in a 80 x 100 box, placed at (x, y) and scaled by k.
 */
function sShape(x: number, y: number, k: number, o: { w: number; thin: number; balls?: boolean }): Part[] {
  const P = (px: number, py: number): Pt => [x + px * k, y + py * k];
  const spine: Pt[] = [P(61, 27), P(54, 13), P(40, 8.5), P(25, 12.5), P(18, 27), P(26, 41), P(40, 49), P(55, 57), P(63, 72), P(57, 87), P(41, 91.5), P(25, 88), P(16, 74)];
  const w = (t: number) => (o.thin + (o.w - o.thin) * Math.exp(-(((t - 0.5) / 0.17) ** 2))) * k;
  const R = (a: number, b: number, c: number, d: number) => rect(x + a * k, y + b * k, c * k, d * k);
  if (o.balls) {
    return [brush(spine, w, false, 96), shape(oval(x + 60 * k, y + 25 * k, 10.5 * k, 10.5 * k)), shape(oval(x + 17 * k, y + 75 * k, 11 * k, 11 * k))];
  }
  return [
    brush(spine, w, true, 96),
    // square the terminals off vertically, then grow the beaks from those faces
    cut(R(64, 12, 30, 30)),
    cut(R(-20, 60, 34, 30)),
    shape(R(53, 1, 11, 33)),
    shape(R(14, 66, 11, 33)),
    fillet(x + 53 * k, y + 16 * k, -1, 1, 4 * k),
    fillet(x + 25 * k, y + 84 * k, 1, -1, 4 * k),
  ];
}

/* ---- numerals and signs (tabular digits) ---- */
const D0 = (DIGIT_ADV - 64) / 2; // left edge of a 64-wide digit body

const NUMS: Record<string, Def> = {
  '0': {
    adv: DIGIT_ADV,
    parts: () => [{ loops: [oval(39, 50, 32, 50 + OV, 2.3), oval(39, 50, 32 - NRS, 50 + OV - NRT, 2.7)] }],
  },
  '1': {
    adv: DIGIT_ADV,
    parts: () => [
      stem(31, 31 + NW, 0, 100, { bl: 15, br: 15 }, NSERIF),
      brush(
        [
          [14, 27],
          [24, 19],
          [34, 6],
        ],
        (t) => 13 + 5 * t,
      ),
      shape(rect(31, 0, NW, 12)),
    ],
  },
  '2': {
    adv: DIGIT_ADV,
    parts: () => [
      brush(
        [
          [16, 28],
          [22, 11],
          [39, 4],
          [57, 12],
          [62, 29],
          [53, 48],
          [34, 66],
          [19, 90],
        ],
        (t) => (t < 0.35 ? NRT + 1 : NRT + 1 + (NW - NRT) * Math.min(1, (t - 0.35) * 3)),
        true,
      ),
      shape(oval(18, 29, 11.5, 11.5)),
      shape(rect(D0 + 2, 83, 60, 17)),
      shape(rect(D0 + 53, 70, 10, 30)),
      fillet(D0 + 53, 83, -1, -1, 6),
    ],
  },
  '3': {
    adv: DIGIT_ADV,
    parts: () => [
      brush(
        [
          [17, 22],
          [26, 8],
          [42, 4],
          [58, 11],
          [61, 27],
          [52, 41],
          [30, 46.5],
        ],
        (t) => NRT + 1 + 6 * Math.sin(Math.PI * Math.min(1, t * 1.25)),
      ),
      brush(
        [
          [30, 45.5],
          [55, 51],
          [64, 69],
          [57, 88],
          [39, 96],
          [21, 91],
          [13, 78],
        ],
        (t) => NRT + 1 + 7 * Math.sin(Math.PI * Math.max(0, t * 1.2 - 0.1)),
      ),
      shape(oval(17, 23, 11, 11)),
      shape(oval(15, 77, 11.5, 11.5)),
    ],
  },
  '4': {
    adv: DIGIT_ADV,
    parts: () => [
      stem(44, 44 + NW, 0, 100, { bl: 11, br: 11 }, NSERIF),
      shape(bar([54, -2], [9, 70], 17, 0)),
      shape(rect(6, 64, 68, 16)),
      cut(new Pen().M(-10, 64).L(4, 64).L(-10, 90).part.loops[0]),
      shape(rect(64, 58, 10, 28)),
      above,
    ],
  },
  '5': {
    adv: DIGIT_ADV,
    parts: () => [
      shape(rect(21, 0, 42, 16)),
      shape(rect(55, 0, 10, 24)),
      shape(rect(17, 2, 19, 45)),
      brush(
        [
          [24, 45],
          [42, 37],
          [58, 45],
          [65, 65],
          [58, 86],
          [40, 96],
          [22, 91],
          [13, 78],
        ],
        (t) => NRT + 1 + 7 * Math.sin(Math.PI * Math.min(1, t * 1.15)),
      ),
      shape(oval(15, 77, 11.5, 11.5)),
      shape(rect(17, 30, 19, 24)),
    ],
  },
  '6': {
    adv: DIGIT_ADV,
    parts: () => six(),
  },
  '7': {
    adv: DIGIT_ADV,
    parts: () => [
      shape(rect(10, 0, 56, 17)),
      shape(rect(9, 0, 10, 30)),
      fillet(19, 17, 1, 1, 6),
      brush(
        [
          [58, 8],
          [50, 30],
          [39, 58],
          [33, 84],
          [33, 104],
        ],
        (t) => NW - 1 + 3 * t,
        true,
      ),
      below,
    ],
  },
  '8': {
    adv: DIGIT_ADV,
    parts: () => [
      { loops: [oval(39, 27, 25, 27 + OV, 2.2), oval(39, 27.5, 25 - NRS + 2, 27 + OV - NRT, 2.4)] },
      { loops: [oval(39, 71, 29, 29 + OV, 2.2), oval(39, 71, 29 - NRS, 29 + OV - NRT, 2.4)] },
    ],
  },
  '9': {
    adv: DIGIT_ADV,
    parts: () => six().map((p) => ({ ...p, loops: p.loops.map((l) => l.map(([x, y]) => [DIGIT_ADV - x, 100 - y] as Pt)) })),
  },
  $: {
    adv: 72,
    parts: () => [...sShape(0, 5, 0.9, { w: 24, thin: 15, balls: true }), shape(rect(31, -12, 10, 26)), shape(rect(31, 86, 10, 26))],
  },
  '€': {
    adv: 80,
    parts: () => [
      { loops: [oval(46, 50, 34, 50 + OV, 2.3), oval(46, 50, 34 - NRS, 50 + OV - NRT, 2.6)] },
      cut(rect(58, 30, 40, 40)),
      shape(rect(68, 5, 10, 27)),
      shape(rect(68, 68, 10, 27)),
      shape(rect(3, 33, 50, 11)),
      shape(rect(3, 54, 46, 11)),
    ],
  },
  '£': {
    adv: 78,
    parts: () => [
      brush(
        [
          [58, 22],
          [52, 7],
          [38, 3],
          [26, 11],
          [22, 30],
          [22, 60],
          [20, 84],
        ],
        (t) => (t < 0.3 ? NRT : NRT + (NW - NRT) * Math.min(1, (t - 0.3) * 4)),
      ),
      shape(oval(58, 23, 10.5, 10.5)),
      shape(rect(7, 44, 46, 13)),
      new Pen().M(6, 84).Q(20, 76, 40, 86).Q(56, 93, 72, 82).L(72, 100).L(6, 100).part,
    ],
  },
  '¥': {
    adv: 80,
    parts: () => [
      shape(bar([15, 0], [40, 52], 19, 10)),
      shape(bar([65, 0], [40, 52], 16, 10)),
      shape(rect(1, 0, 31, NSERIF.h)),
      shape(rect(50, 0, 29, NSERIF.h)),
      stem(29.5, 29.5 + NW, 46, 100, { bl: 12, br: 12 }, NSERIF),
      shape(rect(10, 57, 60, 10)),
      shape(rect(10, 73, 60, 10)),
      above,
    ],
  },
  '.': {
    adv: 32,
    parts: () => [shape(oval(16, 88, 12, 12))],
  },
  ',': {
    adv: 32,
    parts: () => [
      shape(oval(16, 86, 12, 12)),
      brush(
        [
          [22, 88],
          [20, 102],
          [9, 113],
        ],
        (t) => 13 - 8 * t,
      ),
    ],
  },
  x: {
    adv: 64,
    parts: () => {
      const top = 38;
      return [
        shape(bar([12, top], [52, 100], 18, 8)),
        shape(bar([52, top], [12, 100], 13, 8)),
        shape(rect(3, top, 24, 8)),
        shape(rect(40, top, 22, 8)),
        shape(rect(2, 92, 22, 8)),
        shape(rect(38, 92, 25, 8)),
        cut(rect(-40, top - 40, 200, 40)),
        below,
      ];
    },
  },
  '+': {
    adv: 70,
    parts: () => [shape(rect(28, 26, 14, 58)), shape(rect(6, 48, 58, 14))],
  },
  '-': {
    adv: 56,
    parts: () => [shape(rect(7, 48, 42, 14))],
  },
  '%': {
    adv: 92,
    parts: () => [
      { loops: [oval(22, 25, 17, 25, 2.2), oval(22, 25, 6.5, 13, 2.4)] },
      { loops: [oval(70, 75, 17, 25, 2.2), oval(70, 75, 6.5, 13, 2.4)] },
      shape(bar([72, -2], [20, 102], 11, 0)),
    ],
  },
};

/** The 6 (and, turned, the 9): a round bowl below and a hooked stroke with a ball terminal. */
function six(): Part[] {
  return [
    { loops: [oval(39, 66, 29, 34 + OV, 2.2), oval(39, 67, 29 - NRS, 34 + OV - NRT, 2.4)] },
    brush(
      [
        [19.75, 68],
        [19.5, 44],
        [25, 20],
        [39, 7.5],
        [55, 10],
      ],
      (t) => NRS - 6.5 * t,
      true,
    ),
    shape(oval(55.5, 18, 9.5, 9.5)),
  ];
}

const DEFS: Record<string, Def> = { ...LETTERS, ...NUMS };

export interface GlyphOutline {
  ch: string;
  /** Advance width (units, cap height 100). */
  adv: number;
  loops: Pt[][];
  /** SVG path data (fill-rule evenodd). */
  d: string;
  /** Ink bounds. */
  box: { x: number; y: number; w: number; h: number };
}

const cache = new Map<string, GlyphOutline>();

/** The outline of one glyph (letters of the logo set, digits, signs), or null if not drawn here. */
export function glyph(ch: string): GlyphOutline | null {
  const hit = cache.get(ch);
  if (hit) return hit;
  const g = buildGlyph(ch);
  if (g) cache.set(ch, g);
  return g;
}

/** Build a glyph's outline from its parts (no cache; `glyph()` is the cached entry point). */
export function buildGlyph(ch: string): GlyphOutline | null {
  const def = DEFS[ch];
  if (!def) return null;
  const loops = unite(def.parts());
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of loops) {
    for (const [x, y] of l) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { ch, adv: def.adv, loops, d: pathOf(loops), box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

export const hasGlyph = (ch: string) => ch in DEFS;

/** Every numeral-font glyph, in atlas order. */
export const NUMERALS = '0123456789$€£¥.,x+-%';

/** Space advance (units). */
export const SPACE_ADV = 34;

/** Pair kerning for the logo words (units). */
const KERN: Record<string, number> = {
  PO: -6,
  OW: -10,
  WD: -8,
  DE: -2,
  ER: -2,
  KE: -4,
  EG: -2,
  CO: -4,
  OV: -12,
  VE: -8,
  LI: -2,
  IG: -2,
  GH: -2,
  HT: -6,
  TH: -6,
  HE: -2,
  FU: -4,
  US: -2,
  SE: -2,
  x1: -2,
  '1,': -4,
};

/* ================================ typesetting ================================ */

export interface Placed {
  ch: string;
  g: GlyphOutline;
  /** Glyph origin (top-left of the cap box) after layout, before rotation. */
  x: number;
  y: number;
  /** Rotation in degrees about the glyph's baseline centre. */
  rot: number;
  scale: number;
}

export interface LineSpec {
  /** Cap height in output units. */
  cap: number;
  /** Extra tracking between letters (units of the glyph scale). */
  track?: number;
  /** Arch: the baseline rises by this much (output units) at the middle of the line. */
  arch?: number;
  /** Hand-set bounce: per-letter [dy (units), degrees], cycled. */
  bounce?: [number, number][];
}

/** Lay a line of glyphs out on a (possibly arched) baseline centred on cx. */
export function setLine(text: string, cx: number, baseY: number, spec: LineSpec): { placed: Placed[]; width: number } {
  const k = spec.cap / 100;
  const track = spec.track ?? 0;
  const items: { ch: string; g: GlyphOutline | null; x: number }[] = [];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const g = glyph(ch);
    if (i > 0) x += (KERN[text[i - 1] + ch] ?? 0) + track;
    items.push({ ch, g, x });
    x += g ? g.adv : SPACE_ADV;
  }
  const width = x * k;
  const left = cx - width / 2;
  const placed: Placed[] = [];
  const half = width / 2 || 1;
  const arch = spec.arch ?? 0;
  let n = 0;
  for (const it of items) {
    if (!it.g) continue;
    const mid = left + (it.x + it.g.adv / 2) * k;
    const u = (mid - cx) / half; // -1..1 across the line
    const lift = arch * (1 - u * u);
    // the baseline's screen slope (y grows down): letters lean with the arch
    const slope = (2 * arch * u) / half;
    const b = spec.bounce?.[n++ % (spec.bounce?.length || 1)] ?? [0, 0];
    placed.push({
      ch: it.ch,
      g: it.g,
      x: left + it.x * k,
      y: baseY - lift - 100 * k + b[0] * k,
      rot: (Math.atan(slope) * 180) / Math.PI + b[1],
      scale: k,
    });
  }
  return { placed, width };
}

/** SVG transform that puts a placed glyph (glyph units) on the page. */
function tf(p: Placed): string {
  const cx = p.x + (p.g.adv / 2) * p.scale;
  const by = p.y + 100 * p.scale;
  return `translate(${n2(cx)} ${n2(by)}) rotate(${n2(p.rot)}) scale(${n2(p.scale)}) translate(${n2(-p.g.adv / 2)} -100)`;
}

/** The glyphs themselves as clip geometry (a clipPath may not <use> a group). */
const clipOf = (placed: Placed[]) => placed.map((p) => `<path transform="${tf(p)}" d="${p.g.d}" clip-rule="evenodd"/>`).join('');

/* ================================ treatments ================================ */

let uid = 0;
const nid = (p: string) => `${p}${(uid++).toString(36)}`;
const BIG = 'x="-9000" y="-9000" width="18000" height="18000"';

export interface Treat {
  /** Ink outline width, in glyph units (cap 100). */
  ink: number;
  /** Extrusion depth (glyph units) and direction. */
  depth: number;
  dir?: Pt;
  /** Brass rim inside the glyph edge (0 = none). */
  rim: number;
  /** Fine detail: flame licks, embers, glints (off for tiny sizes). */
  detail: boolean;
}

/**
 * Carved wooden block letters with a brass rim and a fire face: the POWDER KEG treatment.
 * The extrusion is the wood block (two tones, inked), the rim is cel-shaded brass inlaid round the
 * face, and the face burns in hard bands: hot yellow on top, orange, red flames licking up from
 * the foot, embers and a hand-cut glint. Every layer follows the true glyph outline.
 */
export function carvedSvg(placed: Placed[], t: Treat): string {
  const id = nid('cv');
  const k = placed[0]?.scale ?? 1;
  const ink = t.ink * k;
  const rim = t.rim * k;
  const [dx, dy] = t.dir ?? [0.22, 1];
  const depth = t.depth * k;
  const word = placed.map((p) => `<path transform="${tf(p)}" d="${p.g.d}"/>`).join('');
  const steps = Math.max(3, Math.round(depth / Math.max(0.5, k * 1.4)));
  const ext = (from: number, to: number) => {
    let s = '';
    for (let i = from; i <= to; i++) s += `<use href="#${id}w" transform="translate(${n2((dx * depth * i) / steps)} ${n2((dy * depth * i) / steps)})"/>`;
    return s;
  };
  // per-letter face bands, in glyph units
  const bands = placed
    .map((p) => {
      const w = p.g.adv;
      const seed = p.ch.charCodeAt(0);
      const hot = `M-20 -20 L${w + 20} -20 L${w + 20} 35 Q${n2(w * 0.72)} 42 ${n2(w * 0.48)} 37 Q${n2(w * 0.22)} 32 -20 39 Z`;
      if (!t.detail) return `<g transform="${tf(p)}"><path d="${hot}" fill="${C.fireHot}"/><path d="M-20 72 Q${n2(w * 0.5)} 66 ${w + 20} 72 L${w + 20} 130 L-20 130 Z" fill="${C.fireDeep}"/></g>`;
      let lick = `M-20 130 L-20 80`;
      const n = Math.max(3, Math.round(w / 17));
      for (let i = 0; i < n; i++) {
        const x0 = -20 + ((w + 40) * i) / n;
        const x1 = -20 + ((w + 40) * (i + 1)) / n;
        const peak = 58 + ((i * 37 + seed) % 11);
        lick += ` Q${n2(x0 + (x1 - x0) * 0.22)} ${n2(peak + 17)} ${n2(x0 + (x1 - x0) * 0.46)} ${n2(peak)} Q${n2(x0 + (x1 - x0) * 0.62)} ${n2(peak + 15)} ${n2(x1)} 80`;
      }
      lick += ` L${w + 20} 130 Z`;
      let embers = '';
      for (let i = 0; i < 4; i++) {
        const x = ((i * 53 + seed * 7) % Math.max(20, w - 20)) + 10;
        const y = 44 + ((i * 29 + seed * 3) % 22);
        embers += `<circle cx="${x}" cy="${y}" r="${n2(1.6 + (i % 2) * 0.9)}"/>`;
      }
      return `<g transform="${tf(p)}">
        <path d="${hot}" fill="${C.fireHot}"/>
        <path d="M-20 -20 L${w + 20} -20 L${w + 20} 15 Q${n2(w * 0.5)} 21 -20 17 Z" fill="${C.fireCore}" opacity=".75"/>
        <path d="${lick}" fill="${C.fireDeep}"/>
        <path d="${lick}" transform="translate(0 14)" fill="${C.ember}" opacity=".6"/>
        <g fill="${C.fireCore}" opacity=".7">${embers}</g>
      </g>`;
    })
    .join('');
  // glint: a hand-cut highlight slash on each letter's upper left, clipped to the face
  const glints = t.detail
    ? placed.map((p) => `<g transform="${tf(p)}"><path d="M${n2(p.g.box.x + 9)} 30 Q${n2(p.g.box.x + 10)} 13 ${n2(p.g.box.x + 24)} 10" fill="none" stroke="${C.white}" stroke-width="5.5" stroke-linecap="round" opacity=".8"/></g>`).join('')
    : '';
  const sh = Math.max(1.6, 2.6 * k);
  const faceIn = rim > 0 ? rim + 1.4 * k : 0;
  const mask = (mid: string, inset: number) =>
    `<mask id="${mid}" maskUnits="userSpaceOnUse" ${BIG}><use href="#${id}w" fill="#fff"/>${inset > 0 ? `<use href="#${id}w" fill="none" stroke="#000" stroke-width="${n2(2 * inset)}" stroke-linejoin="round"/>` : ''}</mask>`;
  return `<g>
  <defs>
    <g id="${id}w" fill-rule="evenodd">${word}</g>
    ${mask(`${id}f`, faceIn)}
    ${rim > 0 ? mask(`${id}d`, rim) : ''}
    <mask id="${id}h" maskUnits="userSpaceOnUse" ${BIG}><use href="#${id}w" fill="#fff"/><use href="#${id}w" fill="#000" transform="translate(${n2(sh)} ${n2(sh)})"/></mask>
    <clipPath id="${id}c">${clipOf(placed)}</clipPath>
    <filter id="${id}s" x="-10%" y="-10%" width="120%" height="140%"><feGaussianBlur stdDeviation="${n2(4 * k)}"/></filter>
  </defs>
  <use href="#${id}w" transform="translate(${n2(dx * depth + 4 * k)} ${n2(dy * depth + 7 * k)})" fill="#000" opacity=".45" filter="url(#${id}s)"/>
  <g fill="${C.ink}" stroke="${C.ink}" stroke-width="${n2(ink * 2)}" stroke-linejoin="round">${ext(1, steps)}</g>
  <g fill="${C.woodDeep}">${ext(Math.ceil(steps * 0.6), steps)}</g>
  <g fill="${C.woodDark}">${ext(1, Math.ceil(steps * 0.6) - 1)}</g>
  <use href="#${id}w" fill="${C.ink}" stroke="${C.ink}" stroke-width="${n2(ink * 2)}" stroke-linejoin="round"/>
  ${
    rim > 0
      ? `<use href="#${id}w" fill="${C.goldDeep}"/>
  <g clip-path="url(#${id}c)"><use href="#${id}w" fill="${C.gold}" transform="translate(${n2(-sh)} ${n2(-sh)})"/></g>
  <rect ${BIG} fill="${C.goldLight}" mask="url(#${id}h)"/>
  <g mask="url(#${id}d)"><rect ${BIG} fill="${C.inkSoft}"/></g>`
      : ''
  }
  <g mask="url(#${id}f)"><rect ${BIG} fill="${C.fire}"/>${bands}${rim > 0 ? '' : `<rect ${BIG} fill="${C.fireCore}" mask="url(#${id}h)" opacity=".85"/>`}<g clip-path="url(#${id}c)">${glints}</g></g>
</g>`;
}

/**
 * Wood-burned letters for the parchment scroll (COVE): deep brown faces with a scorched halo, a
 * soft inner edge and a thin parchment inline, pressed into the paper with a slight ink edge.
 */
export function burnedSvg(placed: Placed[], t: { ink: number; detail: boolean }): string {
  const id = nid('bn');
  const k = placed[0]?.scale ?? 1;
  const word = placed.map((p) => `<path transform="${tf(p)}" d="${p.g.d}"/>`).join('');
  const inl = 4.5 * k;
  return `<g>
  <defs>
    <g id="${id}w" fill-rule="evenodd">${word}</g>
    <mask id="${id}i" maskUnits="userSpaceOnUse" ${BIG}><use href="#${id}w" fill="none" stroke="#fff" stroke-width="${n2(inl * 2 + 3 * k)}"/><use href="#${id}w" fill="none" stroke="#000" stroke-width="${n2(inl * 2)}"/></mask>
    <clipPath id="${id}c">${clipOf(placed)}</clipPath>
    <filter id="${id}b" x="-15%" y="-25%" width="130%" height="150%"><feGaussianBlur stdDeviation="${n2(3 * k)}"/></filter>
  </defs>
  <use href="#${id}w" fill="none" stroke="${C.woodMid}" stroke-width="${n2(12 * k)}" stroke-linejoin="round" opacity=".4" filter="url(#${id}b)"/>
  <use href="#${id}w" fill="${C.woodDeep}" stroke="${C.ink}" stroke-width="${n2(t.ink * k)}" stroke-linejoin="round"/>
  <g clip-path="url(#${id}c)"><use href="#${id}w" fill="${C.woodDark}" transform="translate(${n2(-3 * k)} ${n2(-3 * k)})"/></g>
  ${t.detail ? `<g clip-path="url(#${id}c)"><rect ${BIG} fill="${C.paperWarm}" mask="url(#${id}i)" opacity=".7"/></g>` : ''}
</g>`;
}

/** The tagline: small carved letters, no rim, a two-band fire face. */
export function taglineSvg(placed: Placed[], t: { ink: number }): string {
  return carvedSvg(placed, { ink: t.ink, depth: 9, rim: 0, detail: false });
}

/* ================================= the logo ================================= */

export interface LogoOptions {
  /** Output size in CSS px (the lockup is drawn in a 1000 x 620 design box scaled to fit). */
  width: number;
  height?: number;
  /** Include the LIGHT THE FUSE tagline (default: only when the logo is big enough to read it). */
  tagline?: boolean;
}

/** Design box of the lockup (Layout gives the logo a w x 0.62w rect). */
export const LOGO_BOX = { w: 1000, h: 620 };

/** Four-point spark star. */
function star(cx: number, cy: number, r: number, fill: string, extra = ''): string {
  const q = r * 0.24;
  return `<path d="M${n2(cx)} ${n2(cy - r)} L${n2(cx + q)} ${n2(cy - q)} L${n2(cx + r)} ${n2(cy)} L${n2(cx + q)} ${n2(cy + q)} L${n2(cx)} ${n2(cy + r)} L${n2(cx - q)} ${n2(cy + q)} L${n2(cx - r)} ${n2(cy)} L${n2(cx - q)} ${n2(cy - q)} Z" fill="${fill}" ${extra}/>`;
}

/**
 * The title lockup: POWDER arched over a bigger KEG (carved wood, brass rim, fire face) with a
 * lit fuse curling off the G, COVE burned into the parchment scroll below, and the tagline.
 * Small sizes get heavier outlines relative to the letters, lose the rim, the tagline and the fine
 * detail, and give COVE a bigger scroll, so the words stay readable down to the portrait logo.
 */
export function logoSvg(o: LogoOptions): string {
  const W = LOGO_BOX.w;
  const H = LOGO_BOX.h;
  const small = o.width < 250;
  const tiny = o.width < 160;
  const tagline = o.tagline ?? o.width >= 320;
  const detail = !small;
  const treat: Treat = { ink: tiny ? 8.5 : small ? 7 : 5.5, depth: tiny ? 11 : 13, rim: tiny ? 0 : small ? 4.5 : 5.5, detail };

  const top = setLine('POWDER', W / 2, tagline ? 178 : 194, {
    cap: tagline ? 132 : 146,
    arch: 26,
    track: 2,
    bounce: [
      [0, -2],
      [-2, 1.5],
      [1.5, -1],
      [-1.5, 1.5],
      [1, -1.5],
      [-1, 1],
    ],
  });
  const keg = setLine('KEG', W / 2 - 40, tagline ? 370 : 404, {
    cap: tagline ? 164 : 186,
    track: 4,
    bounce: [
      [1, -2.5],
      [-1.5, 1],
      [1, 2.5],
    ],
  });
  // the fuse: out of the G's shoulder, one curl, and a spark in the open space on the right
  const g = keg.placed[keg.placed.length - 1];
  const gx = g.x + g.g.adv * g.scale * 0.9;
  const gy = g.y + 26 * g.scale;
  const fuse = `M${n2(gx - 6)} ${n2(gy + 4)} C${n2(gx + 50)} ${n2(gy - 30)} ${n2(gx + 104)} ${n2(gy + 4)} ${n2(gx + 88)} ${n2(gy + 50)} C${n2(gx + 76)} ${n2(gy + 84)} ${n2(gx + 118)} ${n2(gy + 104)} ${n2(gx + 146)} ${n2(gy + 72)}`;
  const sx = gx + 150;
  const sy = gy + 66;
  const fw = tiny ? 20 : 15;
  const fuseSvg = `<g>
    <path d="${fuse}" fill="none" stroke="${C.ink}" stroke-width="${fw}" stroke-linecap="round"/>
    <path d="${fuse}" fill="none" stroke="${C.paperWarm}" stroke-width="${fw - 7}" stroke-linecap="round"/>
    ${detail ? `<path d="${fuse}" fill="none" stroke="${C.woodLight}" stroke-width="${fw - 7}" stroke-dasharray="4 7"/>` : ''}
    ${star(sx, sy, 36, C.fireHot, `stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"`)}
    ${star(sx, sy, 21, C.fireCore)}
    <circle cx="${n2(sx)}" cy="${n2(sy)}" r="6" fill="${C.white}"/>
    ${detail ? `${star(sx - 40, sy - 34, 10, C.fireCore)}${star(sx + 36, sy + 34, 8, C.fireHot)}${star(sx + 40, sy - 30, 6.5, C.fireCore)}` : ''}
  </g>`;

  // parchment scroll with COVE, lettered on the scroll's own arch
  const rw = tagline ? 620 : 700;
  const rh = rw * (120 / 440);
  const ry = tagline ? 478 : 520;
  const scroll = embed(ribbon(440), W / 2, ry, rw, rh);
  const bandMid = ry - rh * 0.1; // the scroll band's centre line at its middle (it arches up)
  const coveCap = tagline ? 74 : 88;
  const cove = setLine('COVE', W / 2, bandMid + coveCap * 0.5, {
    cap: coveCap,
    track: tagline ? 18 : 12,
    arch: -rh * 0.05,
    bounce: [
      [0, -1.5],
      [-1, 1],
      [1, -1],
      [0, 1.5],
    ],
  });
  const tag = tagline ? setLine('LIGHT THE FUSE', W / 2, 604, { cap: 36, track: 9 }) : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${n2(o.width)}" height="${n2(o.height ?? o.width * (H / W))}">
  ${scroll}
  ${burnedSvg(cove.placed, { ink: tiny ? 7 : small ? 5 : 4, detail })}
  ${carvedSvg(top.placed, treat)}
  ${fuseSvg}
  ${carvedSvg(keg.placed, treat)}
  ${tag ? taglineSvg(tag.placed, { ink: 8 }) : ''}
</svg>`;
}

/** Inline a standalone SVG string into another SVG, centred on (cx, cy) at w x h. */
function embed(svg: string, cx: number, cy: number, w: number, h: number): string {
  const open = svg.match(/<svg[^>]*>/)![0];
  const fixed = open
    .replace(/ width="[\d.]+"/, '')
    .replace(/ height="[\d.]+"/, '')
    .replace('<svg ', `<svg x="${n2(cx - w / 2)}" y="${n2(cy - h / 2)}" width="${n2(w)}" height="${n2(h)}" preserveAspectRatio="none" overflow="visible" `);
  return svg.replace(open, fixed);
}

/** A word in one of the treatments as a standalone SVG (tile titles, review sheets). */
export function wordSvg(text: string, cap: number, style: 'carved' | 'burned' | 'tagline' = 'carved', pad = 0.5): string {
  const probe = setLine(text, 0, 0, { cap });
  const w = probe.width + cap * pad * 2;
  const h = cap * (1 + pad * 2) + cap * 0.2;
  const line = setLine(text, w / 2, cap * pad + cap, { cap });
  const body = style === 'carved' ? carvedSvg(line.placed, { ink: 6, depth: 10, rim: 5.5, detail: cap > 60 }) : style === 'burned' ? burnedSvg(line.placed, { ink: 4, detail: cap > 40 }) : taglineSvg(line.placed, { ink: 7 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(w)} ${n2(h)}" width="${n2(w)}" height="${n2(h)}">${body}</svg>`;
}

/** Review helper: every glyph outline on one sheet. */
export function specimenSvg(chars: string, cap = 100, perRow = 10): string {
  const cell = cap * 1.5;
  const rows = Math.ceil(chars.length / perRow);
  let body = '';
  [...chars].forEach((ch, i) => {
    const g = glyph(ch);
    if (!g) return;
    const x = (i % perRow) * cell * 1.1 + cap * 0.2;
    const y = Math.floor(i / perRow) * cell + cap * 0.3;
    const k = cap / 100;
    body += `<g transform="translate(${n2(x)} ${n2(y)}) scale(${k})"><rect x="0" y="0" width="${g.adv}" height="100" fill="none" stroke="#5fd6cc" stroke-width="1" opacity=".5"/><path d="${g.d}" fill="${C.paper}" fill-rule="evenodd" stroke="${C.ink}" stroke-width="1"/></g>`;
  });
  const w = perRow * cell * 1.1 + cap * 0.4;
  const h = rows * cell + cap * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(w)} ${n2(h)}" width="${n2(w)}" height="${n2(h)}"><rect width="100%" height="100%" fill="${C.night}"/>${body}</svg>`;
}

void xAt;
