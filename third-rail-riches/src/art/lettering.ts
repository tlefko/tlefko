/**
 * Hand-built lettering for Third Rail Riches (docs/ART.md). No font is involved anywhere in here:
 * every letterform (a full A-Z of 1930s deco subway capitals for THIRD RAIL, RICHES and the
 * ALL ABOARD! tagline) and every numeral the game shows (win amounts, multipliers, counters) is
 * constructed in this file from stems, bars, squared superellipse bowls and brush strokes. The parts of a glyph are merged
 * into one clean outline (a small anti-aliased raster union traced back to vectors), so outlines,
 * brass rims and inlines follow the true silhouette.
 *
 * Units: cap height 100, baseline at y = 100, x grows to the right. Outlines use fill-rule evenodd
 * (counters are their own loops). Consumers:
 *   - `logoSvg()`: the whole title lockup as one SVG (Logo.ts, the boot capture, the Stake tile);
 *   - `glyph()` / `NUMERALS`: the outlines text.ts bakes into the numeral bitmap font;
 *   - `wordSvg()`: any word from the glyph set in one of the house treatments.
 */
import { C, mix, rng } from './kit';

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

/** Serif proportions: slab height, bracket length (kept for the few bracketed numeral feet). */
interface SerifK {
  h: number;
  b: number;
}
const SERIF: SerifK = { h: 10, b: 12 };
const NSERIF: SerifK = { h: 9, b: 10 };

/**
 * Deco capital weights: a condensed streamline sans, monoline and chunky, with squared-off
 * superellipse rounds (the 1930s subway enamel sign letter), flat-topped A and M, straight-legged
 * R and K, horizontal terminals on C, G, J and S.
 */
const SW = 27; // stem
const BH = 17; // arm / bar height (thinner than the stems: the deco thick-thin)
const RS = 27; // round side
const RT = 17; // round top / bottom
const OV = 1.5; // overshoot of rounds
const RE = 2.9; // round squareness (outer)
const CE = 3.3; // counter squareness

/** Numeral weights (a touch lighter so the counters stay open at small sizes). */
const NW = 21;
const NRS = 20;
const NRT = 16;
const NE = 2.9;
/** Tabular advance of every digit. */
export const DIGIT_ADV = 78;

interface Def {
  adv: number;
  parts: () => Part[];
}

const below = cut(rect(-60, 100, 400, 60));
const above = cut(rect(-60, -60, 400, 60));
const ring = (cx: number, cy: number, rx: number, ry: number, sx: number, sy: number, e = RE, ce = CE): Part => ({ loops: [oval(cx, cy, rx, ry, e), oval(cx, cy, rx - sx, ry - sy, ce)] });
/** Upper bowl (P, R, B): from the stem at x0 to a squared round on the right, y0..y1 tall. */
function bowl(x0: number, y0: number, y1: number, right: number, t = BH, side = RS - 2): Part[] {
  const h = y1 - y0;
  const r = h / 2;
  const cx = right - r;
  const inL = 8 + SW;
  return [shape(rect(x0, y0, cx - x0, h)), shape(halfOval(cx, y0 + r, r, r, 'right', RE)), cut(rect(inL, y0 + t, cx - inL, h - 2 * t), halfOval(cx, y0 + r, r - side, r - t, 'right', CE))];
}
const vstem = (x: number, y0 = 0, y1 = 100, w = SW) => shape(rect(x, y0, w, y1 - y0));

/* ---- logo capitals (A-Z, !) ---- */
const LETTERS: Record<string, Def> = {
  A: {
    adv: 86,
    parts: () => [shape(bar([14, 100], [36, 0], SW, 16)), shape(bar([72, 100], [50, 0], SW, 16)), shape(rect(30, 0, 26, 16)), shape(rect(18, 62, 50, 17)), below, above],
  },
  B: {
    adv: 84,
    parts: () => [vstem(8), ...bowl(20, 0, 50, 71, 17, 21), ...bowl(20, 35, 100, 78, 17)],
  },
  C: {
    adv: 82,
    parts: () => [ring(43, 50, 40, 50 + OV, RS, RT), cut(rect(56, 37, 40, 26))],
  },
  D: {
    adv: 86,
    parts: () => [vstem(8), shape(rect(20, 0, 26, 100)), shape(halfOval(42, 50, 38, 50, 'right', RE)), cut(rect(35, RT, 7, 100 - 2 * RT), halfOval(42, 50, 38 - RS, 50 - RT, 'right', CE))],
  },
  E: {
    adv: 74,
    parts: () => [vstem(8), shape(rect(20, 0, 50, BH)), shape(rect(20, 40, 38, BH)), shape(rect(20, 100 - BH, 52, BH))],
  },
  F: {
    adv: 70,
    parts: () => [vstem(8), shape(rect(20, 0, 50, BH)), shape(rect(20, 42, 38, BH))],
  },
  G: {
    adv: 86,
    parts: () => [ring(44, 50, 41, 50 + OV, RS, RT), cut(rect(57, 30, 40, 22)), shape(rect(46, 50, 39, 17)), shape(rect(60, 50, 25, 40))],
  },
  H: {
    adv: 86,
    parts: () => [vstem(8), vstem(53), shape(rect(20, 40, 40, BH))],
  },
  I: {
    adv: 43,
    parts: () => [vstem(8)],
  },
  J: {
    adv: 70,
    parts: () => [shape(rect(38, 0, SW, 62)), { loops: [halfOval(37, 60, 28, 40 + OV, 'bottom', RE), halfOval(37, 60, 28 - SW + 2, 40 + OV - RT, 'bottom', CE)] }, cut(rect(-10, 0, 37, 74)), shape(rect(26, 0, 37, BH))],
  },
  K: {
    adv: 84,
    parts: () => [vstem(8), shape(bar([28, 64], [70, 0], 23, 16)), shape(bar([38, 44], [72, 100], SW, 16)), below, above],
  },
  L: {
    adv: 68,
    parts: () => [vstem(8), shape(rect(20, 100 - BH, 48, BH))],
  },
  M: {
    adv: 106,
    parts: () => [vstem(8, 0, 100, 23), vstem(75, 0, 100, 23), shape(bar([22, -4], [53, 74], 22, 0)), shape(bar([84, -4], [53, 74], 22, 0)), shape(rect(8, 0, 26, 10)), shape(rect(72, 0, 26, 10)), above],
  },
  N: {
    adv: 88,
    parts: () => [vstem(8, 0, 100, 23), vstem(57, 0, 100, 23), shape(bar([21, 0], [67, 100], 25, 16)), cut(rect(-40, 0, 48, 100), rect(80, 0, 48, 100)), below, above],
  },
  O: {
    adv: 88,
    parts: () => [ring(44, 50, 40, 50 + OV, RS, RT)],
  },
  P: {
    adv: 82,
    parts: () => [vstem(8), ...bowl(20, 0, 62, 79, BH, 23)],
  },
  Q: {
    adv: 90,
    parts: () => [ring(44, 50, 40, 50 + OV, RS, RT), shape(bar([52, 68], [84, 106], 21, 0))],
  },
  R: {
    adv: 86,
    parts: () => [vstem(8), ...bowl(20, 0, 58, 79, BH, 23), shape(bar([50, 56], [77, 106], SW + 1, 0)), below],
  },
  S: {
    adv: 76,
    parts: () => sShape(0, 0, 1, { w: 26, thin: 22 }),
  },
  T: {
    adv: 76,
    parts: () => [shape(rect(2, 0, 72, BH)), vstem(25.5)],
  },
  U: {
    adv: 86,
    parts: () => [vstem(8, 0, 60), vstem(53, 0, 60), { loops: [halfOval(44, 58, 36, 42 + OV, 'bottom', RE), halfOval(44, 58, 36 - SW, 42 + OV - RT, 'bottom', CE)] }],
  },
  V: {
    adv: 84,
    parts: () => [shape(bar([16, 0], [42, 100], SW + 1, 16)), shape(bar([68, 0], [42, 100], SW - 2, 16)), below, above],
  },
  W: {
    adv: 120,
    parts: () => [shape(bar([12, 0], [32, 100], 24, 16)), shape(bar([58, 8], [32, 100], 20, 16)), shape(bar([62, 8], [88, 100], 24, 16)), shape(bar([108, 0], [88, 100], 20, 16)), below, above],
  },
  X: {
    adv: 84,
    parts: () => [shape(bar([14, 0], [70, 100], SW + 1, 16)), shape(bar([70, 0], [14, 100], SW - 3, 16)), below, above],
  },
  Y: {
    adv: 84,
    parts: () => [shape(bar([14, 0], [42, 54], SW + 1, 16)), shape(bar([70, 0], [42, 54], SW - 3, 16)), vstem(29.5, 46, 100), above],
  },
  Z: {
    adv: 76,
    parts: () => [shape(rect(4, 0, 66, BH)), shape(rect(4, 100 - BH, 68, BH)), shape(bar([62, 12], [14, 88], SW + 2, 0))],
  },
  '!': {
    adv: 41,
    parts: () => [new Pen().M(8, 0).L(33, 0).L(28, 70).L(13, 70).part, shape(oval(20.5, 89, 12, 11, 3))],
  },
  '&': {
    adv: 88,
    parts: () => [
      brush(
        [
          [78, 100],
          [30, 48],
          [24, 24],
          [40, 6],
          [56, 22],
          [48, 42],
          [18, 62],
          [16, 86],
          [38, 98],
          [62, 86],
          [76, 60],
        ],
        20,
        true,
        120,
      ),
      below,
    ],
  },
  "'": {
    adv: 34,
    parts: () => [new Pen().M(7, 0).L(27, 0).L(22, 34).L(12, 34).part],
  },
};

/**
 * The S (and the $): one brush stroke along an S spine, a touch heavier through the diagonal than
 * in the arcs, both ends sheared to a flat horizontal terminal (the deco S). Drawn in a 76 x 100
 * box, placed at (x, y) and scaled by k.
 */
function sShape(x: number, y: number, k: number, o: { w: number; thin: number }): Part[] {
  const P = (px: number, py: number): Pt => [x + px * k, y + py * k];
  const spine: Pt[] = [P(66, 30), P(63, 14), P(40, 9.5), P(18, 13), P(14, 30), P(26, 44), P(40, 49), P(54, 55), P(64, 70), P(60, 87), P(38, 90.5), P(14, 86), P(10, 68)];
  const w = (t: number) => (o.thin + (o.w - o.thin) * Math.exp(-(((t - 0.5) / 0.2) ** 2))) * k;
  const R = (a: number, b: number, c: number, d: number) => rect(x + a * k, y + b * k, c * k, d * k);
  return [brush(spine, w, false, 110), cut(R(46, 30, 40, 11)), cut(R(-12, 58, 34, 12))];
}

/* ---- numerals and signs (tabular digits, the same deco family) ---- */
const D0 = (DIGIT_ADV - 64) / 2; // left edge of a 64-wide digit body
const nring = (cx: number, cy: number, rx: number, ry: number, sx = NW, sy = NRT) => ring(cx, cy, rx, ry, sx, sy, NE, 3.2);

const NUMS: Record<string, Def> = {
  '0': {
    adv: DIGIT_ADV,
    parts: () => [nring(39, 50, 32, 50 + OV, NRS + 1)],
  },
  '1': {
    adv: DIGIT_ADV,
    parts: () => [shape(rect(36, 0, NW + 1, 100)), shape(bar([40, 5], [14, 26], 17, 0)), shape(rect(15, 84, 50, 16))],
  },
  '2': {
    adv: DIGIT_ADV,
    parts: () => [
      brush(
        [
          [11, 30],
          [16, 10],
          [39, 2.5],
          [60, 9],
          [66, 28],
          [56, 48],
          [32, 66],
          [15, 88],
        ],
        (t) => (t < 0.45 ? NW - 2 : NW - 2 + 4 * Math.min(1, (t - 0.45) * 3)),
        true,
        96,
      ),
      cut(rect(-10, 30, 18, 30)),
      shape(rect(D0 + 2, 84, 61, 16)),
    ],
  },
  '3': {
    adv: DIGIT_ADV,
    parts: () => [
      shape(rect(D0 + 3, 0, 57, NRT + 1)),
      shape(bar([62, 6], [30, 46], NW - 1, 0)),
      brush(
        [
          [28, 40],
          [52, 43],
          [67, 62],
          [62, 86],
          [40, 97.5],
          [18, 93],
          [9, 78],
        ],
        (t) => NW - 1 + 3 * Math.sin(Math.PI * t),
        true,
        96,
      ),
      cut(rect(-10, 60, 16.5, 16)),
    ],
  },
  '4': {
    adv: DIGIT_ADV,
    parts: () => [shape(rect(45, 0, NW + 1, 100)), shape(bar([50, -4], [8, 72], 19, 0)), shape(rect(5, 63, 68, NRT + 1)), cut(rect(-20, 0, 25, 100)), above],
  },
  '5': {
    adv: DIGIT_ADV,
    parts: () => [
      shape(rect(15, 0, 52, NRT + 1)),
      shape(rect(14, 0, NW, 50)),
      brush(
        [
          [22, 46],
          [44, 37],
          [62, 46],
          [68, 68],
          [60, 88],
          [39, 97.5],
          [18, 93],
          [9, 78],
        ],
        (t) => NW - 1 + 3 * Math.sin(Math.PI * t),
        true,
        96,
      ),
      cut(rect(-10, 60, 16.5, 16)),
    ],
  },
  '6': {
    adv: DIGIT_ADV,
    parts: () => six(),
  },
  '7': {
    adv: DIGIT_ADV,
    parts: () => [shape(rect(8, 0, 62, NRT + 1)), shape(bar([64, 6], [32, 104], NW + 2, 0)), shape(rect(52, 0, 18, 20)), below],
  },
  '8': {
    adv: DIGIT_ADV,
    parts: () => [nring(39, 25.5, 26, 25.5 + OV, NW - 2, NRT - 1), nring(39, 71, 31, 29 + OV, NW, NRT)],
  },
  '9': {
    adv: DIGIT_ADV,
    parts: () => six().map((p) => ({ ...p, loops: p.loops.map((l) => l.map(([x, y]) => [DIGIT_ADV - x, 100 - y] as Pt)) })),
  },
  $: {
    adv: 72,
    parts: () => [...sShape(1, 6, 0.88, { w: 23, thin: 19 }), shape(rect(31, -12, 10, 26)), shape(rect(31, 86, 10, 26))],
  },
  '€': {
    adv: 80,
    parts: () => [nring(46, 50, 34, 50 + OV), cut(rect(58, 32, 40, 36)), shape(rect(3, 33, 50, 11)), shape(rect(3, 54, 46, 11))],
  },
  '£': {
    adv: 78,
    parts: () => [
      brush(
        [
          [62, 26],
          [56, 7],
          [40, 2],
          [26, 10],
          [22, 30],
          [22, 60],
          [20, 84],
        ],
        (t) => (t < 0.3 ? NRT + 1 : NRT + 1 + (NW - NRT) * Math.min(1, (t - 0.3) * 4)),
        true,
      ),
      cut(rect(52, 26, 30, 20)),
      shape(rect(7, 44, 46, 13)),
      shape(rect(6, 84, 66, 16)),
    ],
  },
  '¥': {
    adv: 80,
    parts: () => [shape(bar([12, 0], [40, 52], 20, 12)), shape(bar([68, 0], [40, 52], 17, 12)), shape(rect(29.5, 46, NW, 54)), shape(rect(10, 57, 60, 10)), shape(rect(10, 73, 60, 10)), above],
  },
  '.': {
    adv: 32,
    parts: () => [shape(oval(16, 88, 11.5, 11.5, 3))],
  },
  ',': {
    adv: 32,
    parts: () => [shape(oval(16, 86, 11.5, 11.5, 3)), new Pen().M(16, 86).L(27.5, 86).L(18, 114).L(8, 114).part],
  },
  x: {
    adv: 64,
    parts: () => {
      const top = 38;
      return [shape(bar([12, top], [52, 100], 18, 10)), shape(bar([52, top], [12, 100], 15, 10)), cut(rect(-40, top - 40, 200, 40)), below];
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
    parts: () => [nring(22, 25, 17, 25, 10, 9), nring(70, 75, 17, 25, 10, 9), shape(bar([72, -2], [20, 102], 11, 0))],
  },
};

/** The 6 (and, turned, the 9): a squared bowl below and a straight-shouldered stroke above. */
function six(): Part[] {
  return [
    nring(39, 65, 30, 35 + OV, NW, NRT),
    brush(
      [
        [19.5, 66],
        [19, 40],
        [27, 16],
        [44, 3.5],
        [64, 4],
      ],
      (t) => NW - 4 * t,
      true,
    ),
    cut(rect(60, -10, 30, 30)),
    shape(rect(42, 0, 18, NRT - 1)),
  ];
}

void SERIF;
void NSERIF;
void fillet;
void plate;
void stem;

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

/** The outline of one glyph (letters A-Z, digits, signs), or null if not drawn here. */
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

/** Pair kerning (units). */
const KERN: Record<string, number> = {
  TH: -2,
  RD: 0,
  RA: -4,
  AI: -2,
  AL: -2,
  LL: -6,
  'L ': -6,
  AB: -3,
  BO: -2,
  OA: -6,
  AR: -3,
  'D!': 0,
  CH: -1,
  ES: -2,
  LT: -10,
  LA: -8,
  TA: -8,
  AT: -8,
  AV: -10,
  VA: -10,
  AY: -8,
  YA: -8,
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

/** Face finishes: maroon + cream train-livery enamel, polished gold, cream enamel. */
export type Face = 'enamel' | 'gold' | 'cream';

export interface Treat {
  /** Ink outline width, in glyph units (cap 100). */
  ink: number;
  /** Extrusion depth (glyph units) and direction. */
  depth: number;
  dir?: Pt;
  /** Brass bevel inside the glyph edge (0 = none). */
  rim: number;
  /** Fine detail: pinstripe, glints (off for tiny sizes). */
  detail: boolean;
  /** Face finish (default 'enamel'). */
  face?: Face;
  /** Small-size face: fewer, bigger bands (default false). */
  small?: boolean;
  /** Extrusion body colours [near, far] (default polished brass). */
  body?: [string, string];
}

/** Per-letter face bands (glyph units), back to front, for each finish. */
function faceBands(face: Face, w: number, detail: boolean, small = false): string {
  const band = (y0: number, y1: number, fill: string, extra = '') => `<rect x="-20" y="${y0}" width="${w + 40}" height="${y1 - y0}" fill="${fill}" ${extra}/>`;
  if (face === 'gold') {
    return `${band(-20, 36, C.goldLight)}${band(36, 40, mix(C.goldLight, C.gold, 0.5))}${band(76, 130, mix(C.gold, C.goldDeep, 0.5))}${detail ? band(-20, 9, C.white, 'opacity=".55"') : ''}`;
  }
  if (face === 'cream') {
    return `${band(-20, 44, C.white)}${band(74, 130, C.tileDeep)}`;
  }
  // enamel: the train livery: a cream window band over the maroon body, a brass pinstripe between
  if (small) return `${band(-20, 60, C.cream)}${band(60, 67, C.goldDeep)}${band(88, 130, C.maroonDeep)}`;
  return `${band(-20, 47, C.cream)}${band(-20, 12, C.white, 'opacity=".8"')}${band(47, 54, detail ? C.gold : C.goldDeep)}${detail ? band(52, 54, C.goldDeep) : ''}${band(80, 130, C.maroonDeep)}${detail ? band(54, 59, C.maroonLight, 'opacity=".55"') : ''}`;
}

const FACE_BASE: Record<Face, string> = { enamel: C.maroon, gold: C.gold, cream: C.tile };

/**
 * Enamel sign letters on a brass block: the THIRD RAIL treatment. The extrusion is polished brass
 * (two tones, inked), a brass bevel runs round the face (cel-shaded, lit from the upper left), and
 * the face is hard-banded enamel: cream over maroon with a brass pinstripe (the train livery),
 * or polished gold, or cream. Every layer follows the true glyph outline.
 */
export function carvedSvg(placed: Placed[], t: Treat): string {
  const id = nid('cv');
  const k = placed[0]?.scale ?? 1;
  const ink = t.ink * k;
  const rim = t.rim * k;
  const face = t.face ?? 'enamel';
  const [near, far] = t.body ?? [mix(C.gold, C.goldDeep, 0.55), mix(C.goldDeep, C.ink, 0.35)];
  const [dx, dy] = t.dir ?? [0.18, 1];
  const depth = t.depth * k;
  const word = placed.map((p) => `<path transform="${tf(p)}" d="${p.g.d}"/>`).join('');
  const steps = Math.max(3, Math.round(depth / Math.max(0.5, k * 1.4)));
  const ext = (from: number, to: number) => {
    let s = '';
    for (let i = from; i <= to; i++) s += `<use href="#${id}w" transform="translate(${n2((dx * depth * i) / steps)} ${n2((dy * depth * i) / steps)})"/>`;
    return s;
  };
  const bands = placed.map((p) => `<g transform="${tf(p)}">${faceBands(face, p.g.adv, t.detail, t.small)}</g>`).join('');
  // glint: a short enamel-gloss slash on each letter's upper left, clipped to the face
  const glints = t.detail
    ? placed.map((p) => `<g transform="${tf(p)}"><path d="M${n2(p.g.box.x + 7)} 32 L${n2(p.g.box.x + 7)} 20 Q${n2(p.g.box.x + 8)} 9 ${n2(p.g.box.x + 20)} 8" fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round" opacity=".9"/></g>`).join('')
    : '';
  const sh = Math.max(1.4, 2.4 * k);
  const faceIn = rim > 0 ? rim + 1.2 * k : 0;
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
  <g fill="${far}">${ext(Math.ceil(steps * 0.55), steps)}</g>
  <g fill="${near}">${ext(1, Math.ceil(steps * 0.55) - 1)}</g>
  ${t.detail && depth > 3 ? `<g fill="${C.goldLight}" opacity=".5">${ext(1, 1)}</g><use href="#${id}w" transform="translate(${n2(dx * depth * 0.3)} ${n2(dy * depth * 0.3)})" fill="${near}"/>` : ''}
  <use href="#${id}w" fill="${C.ink}" stroke="${C.ink}" stroke-width="${n2(ink * 2)}" stroke-linejoin="round"/>
  ${
    rim > 0
      ? `<use href="#${id}w" fill="${C.goldDeep}"/>
  <g clip-path="url(#${id}c)"><use href="#${id}w" fill="${C.gold}" transform="translate(${n2(-sh)} ${n2(-sh)})"/></g>
  <rect ${BIG} fill="${C.goldLight}" mask="url(#${id}h)"/>
  <g mask="url(#${id}d)"><rect ${BIG} fill="${C.inkSoft}"/></g>`
      : ''
  }
  <g mask="url(#${id}f)"><rect ${BIG} fill="${FACE_BASE[face]}"/>${bands}${rim > 0 ? '' : `<rect ${BIG} fill="${face === 'enamel' ? C.white : C.goldLight}" mask="url(#${id}h)" opacity=".7"/>`}<g clip-path="url(#${id}c)">${glints}</g></g>
</g>`;
}

/**
 * Gilded letters (RICHES on its plate): polished gold faces in hard bands, a short dark-brass
 * extrusion, a heavy ink outline and a gloss glint. (The name is the engine's; the finish is gold.)
 */
export function burnedSvg(placed: Placed[], t: { ink: number; detail: boolean }): string {
  return carvedSvg(placed, { ink: t.ink, depth: 9, rim: 0, detail: t.detail, face: 'gold', body: [C.goldDeep, mix(C.goldDeep, C.ink, 0.5)] });
}

/** The tagline: small cream enamel letters with a shallow maroon extrusion (for the sign strip). */
export function taglineSvg(placed: Placed[], t: { ink: number }): string {
  return carvedSvg(placed, { ink: t.ink, depth: 6, rim: 0, detail: false, face: 'cream', body: [C.maroonDeep, mix(C.maroonDeep, C.ink, 0.5)] });
}

/* ================================= the logo ================================= */

export interface LogoOptions {
  /** Output size in CSS px (the lockup is drawn in a 1000 x 620 design box scaled to fit). */
  width: number;
  height?: number;
  /** Include the ALL ABOARD! tagline (default: only when the logo is big enough to read it). */
  tagline?: boolean;
}

/** Design box of the lockup (Layout gives the logo a w x 0.62w rect). */
export const LOGO_BOX = { w: 1000, h: 620 };

/** Four-point spark star. */
function star(cx: number, cy: number, r: number, fill: string, extra = ''): string {
  const q = r * 0.22;
  return `<path d="M${n2(cx)} ${n2(cy - r)} Q${n2(cx + q)} ${n2(cy - q)} ${n2(cx + r)} ${n2(cy)} Q${n2(cx + q)} ${n2(cy + q)} ${n2(cx)} ${n2(cy + r)} Q${n2(cx - q)} ${n2(cy + q)} ${n2(cx - r)} ${n2(cy)} Q${n2(cx - q)} ${n2(cy - q)} ${n2(cx)} ${n2(cy - r)} Z" fill="${fill}" ${extra}/>`;
}

/** A sparkle: inked star with a light core. */
function sparkle(cx: number, cy: number, r: number, ink: number): string {
  return `${star(cx, cy, r, C.goldLight, `stroke="${C.ink}" stroke-width="${n2(ink)}" stroke-linejoin="round"`)}${star(cx, cy, r * 0.55, C.white)}`;
}

/** Jagged lightning polyline from x0 to x1 around y (deterministic). */
function zigzag(x0: number, x1: number, y: number, amp: number, seed: number, step = 46): Pt[] {
  const r = rng(seed);
  const pts: Pt[] = [[x0, y]];
  let x = x0;
  let s = r() < 0.5 ? 1 : -1;
  while (x < x1 - step * 0.8) {
    // irregular strokes: mostly long leaps, now and then a short kink back
    const kink = r() < 0.3;
    x += kink ? step * (0.25 + 0.2 * r()) : step * (0.7 + 0.9 * r());
    pts.push([Math.min(x, x1), y + s * amp * (kink ? 0.3 + 0.3 * r() : 0.6 + 0.4 * r())]);
    s = -s;
  }
  pts.push([x1, y]);
  return pts;
}
const poly = (p: Pt[]) => `M${p.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L')}`;

/**
 * The third rail: a cast-iron conductor rail on brass insulators, glowing electric blue, with a
 * jagged bolt crackling along it and arcs jumping off it, a spark burst at the leading end.
 */
function thirdRail(x0: number, x1: number, y: number, o: { detail: boolean; ink: number; id: string }): string {
  const h = 18;
  const ink = o.ink;
  const bolt = zigzag(x0 + 18, x1 - 26, y, o.detail ? 22 : 20, 7, o.detail ? 58 : 120);
  const arcs = o.detail ? [zigzag(x0 + 150, x0 + 250, y + 22, 9, 5, 26), zigzag(x1 - 330, x1 - 240, y + 24, 8, 9, 24), zigzag(x0 + 40, x0 + 110, y - 18, 7, 2, 22)] : [];
  const posts = o.detail ? [0.16, 0.5, 0.84].map((u) => x0 + (x1 - x0) * u) : [];
  const post = (x: number) =>
    `<path d="M${n2(x - 13)} ${n2(y + h / 2 - 2)} L${n2(x + 13)} ${n2(y + h / 2 - 2)} L${n2(x + 9)} ${n2(y + h / 2 + 16)} L${n2(x - 9)} ${n2(y + h / 2 + 16)} Z" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="${n2(ink * 0.8)}" stroke-linejoin="round"/><rect x="${n2(x - 9)}" y="${n2(y + h / 2)}" width="7" height="12" fill="${C.gold}"/>`;
  return `<g>
    <defs><filter id="${o.id}g" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="${o.detail ? 9 : 6}"/></filter></defs>
    <rect x="${x0}" y="${y - 22}" width="${x1 - x0}" height="44" rx="22" fill="${C.volt}" opacity=".55" filter="url(#${o.id}g)"/>
    ${posts.map(post).join('')}
    <rect x="${x0}" y="${n2(y - h / 2)}" width="${x1 - x0}" height="${h}" rx="${h / 2}" fill="${C.voltDeep}" stroke="${C.ink}" stroke-width="${n2(ink)}"/>
    <rect x="${x0 + 8}" y="${n2(y - h / 2 + 3)}" width="${x1 - x0 - 16}" height="${n2(h * 0.38)}" rx="3" fill="${C.voltLight}"/>
    <path d="${poly(bolt)}" fill="none" stroke="${C.ink}" stroke-width="${n2(ink + 11)}" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>
    <path d="${poly(bolt)}" fill="none" stroke="${C.volt}" stroke-width="11" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>
    <path d="${poly(bolt)}" fill="none" stroke="${C.voltCore}" stroke-width="4.5" stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>
    ${arcs.map((a) => `<path d="${poly(a)}" fill="none" stroke="${C.volt}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><path d="${poly(a)}" fill="none" stroke="${C.voltCore}" stroke-width="2" stroke-linejoin="round"/>`).join('')}
  </g>`;
}

/** Spark burst at the rail's end. */
function burst(cx: number, cy: number, r: number, ink: number, detail: boolean): string {
  return `${star(cx, cy, r, C.voltLight, `stroke="${C.ink}" stroke-width="${n2(ink)}" stroke-linejoin="round"`)}${star(cx, cy, r * 0.55, C.voltCore)}${
    detail ? `${star(cx - r * 0.1, cy, r * 0.75, C.voltCore, `transform="rotate(45 ${n2(cx)} ${n2(cy)})" opacity=".7"`)}<circle cx="${n2(cx + r * 0.9)}" cy="${n2(cy - r * 0.7)}" r="4" fill="${C.voltCore}"/><circle cx="${n2(cx + r * 1.1)}" cy="${n2(cy + r * 0.5)}" r="3" fill="${C.voltLight}"/>` : ''
  }`;
}

/** Deco plate outline: notched corners and chevron points at both ends. */
function platePath(x0: number, y0: number, x1: number, y1: number, n: number, tip: number): string {
  const m = (y0 + y1) / 2;
  return `M${n2(x0 + n)} ${n2(y0)} L${n2(x1 - n)} ${n2(y0)} L${n2(x1 - n)} ${n2(y0 + n)} L${n2(x1)} ${n2(y0 + n)} L${n2(x1 + tip)} ${n2(m)} L${n2(x1)} ${n2(y1 - n)} L${n2(x1 - n)} ${n2(y1 - n)} L${n2(x1 - n)} ${n2(y1)} L${n2(x0 + n)} ${n2(y1)} L${n2(x0 + n)} ${n2(y1 - n)} L${n2(x0)} ${n2(y1 - n)} L${n2(x0 - tip)} ${n2(m)} L${n2(x0)} ${n2(y0 + n)} L${n2(x0 + n)} ${n2(y0 + n)} Z`;
}

/** The RICHES banner plate: brass frame, emerald enamel panel, brass pinline and rivets. */
function richesPlate(cx: number, cy: number, w: number, h: number, o: { detail: boolean; ink: number; id: string }): string {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const n = h * 0.16;
  const tip = h * 0.24;
  const f = h * 0.085; // brass frame width
  const outer = platePath(x0, y0, x1, y1, n, tip);
  const inner = platePath(x0 + f, y0 + f, x1 - f, y1 - f, n * 0.75, tip * 0.75);
  const pin = platePath(x0 + f * 1.9, y0 + f * 1.9, x1 - f * 1.9, y1 - f * 1.9, n * 0.6, tip * 0.6);
  const rivet = (x: number, y: number) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(h * 0.03)}" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="${n2(o.ink * 0.5)}"/>`;
  const rivets = o.detail ? [rivet(x0 + n * 0.55, y0 + n * 0.6), rivet(x1 - n * 0.55, y0 + n * 0.6), rivet(x0 + n * 0.55, y1 - n * 0.6), rivet(x1 - n * 0.55, y1 - n * 0.6)].join('') : '';
  return `<g>
    <defs>
      <filter id="${o.id}s" x="-10%" y="-20%" width="120%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
      <clipPath id="${o.id}c"><path d="${inner}"/></clipPath>
      <clipPath id="${o.id}o"><path d="${outer}"/></clipPath>
    </defs>
    <path d="${outer}" transform="translate(6 14)" fill="#000" opacity=".5" filter="url(#${o.id}s)"/>
    <path d="${outer}" transform="translate(0 ${n2(h * 0.07)})" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="${n2(o.ink * 2)}" stroke-linejoin="round"/>
    <path d="${outer}" fill="${C.gold}" stroke="${C.ink}" stroke-width="${n2(o.ink * 2)}" stroke-linejoin="round"/>
    <g clip-path="url(#${o.id}o)">
      <rect x="${n2(x0 - tip)}" y="${n2(cy)}" width="${n2(w + tip * 2)}" height="${n2(h / 2)}" fill="${mix(C.gold, C.goldDeep, 0.45)}"/>
      ${o.detail ? `<rect x="${n2(x0 - tip)}" y="${n2(y0)}" width="${n2(w + tip * 2)}" height="${n2(f * 0.45)}" fill="${C.goldLight}"/>` : ''}
    </g>
    <path d="${inner}" fill="${C.emerald}" stroke="${C.ink}" stroke-width="${n2(o.ink * 1.1)}" stroke-linejoin="round"/>
    <g clip-path="url(#${o.id}c)">
      <rect x="${n2(x0)}" y="${n2(cy + h * 0.12)}" width="${n2(w)}" height="${n2(h)}" fill="${C.emeraldDeep}"/>
      <rect x="${n2(x0)}" y="${n2(y0)}" width="${n2(w)}" height="${n2(f * 2.2)}" fill="${C.emeraldLight}" opacity=".35"/>
      ${o.detail ? `<path d="${pin}" fill="none" stroke="${C.gold}" stroke-width="3"/>` : ''}
    </g>
    ${rivets}
  </g>`;
}

/** Deco speed lines: three rounded brass bars, the longest nearest the plate. */
function speedLines(x: number, y: number, dir: 1 | -1, len: number, gap: number, ink: number): string {
  return [0, 1, 2]
    .map((i) => {
      const l = len * (1 - i * 0.28);
      const yy = y + (i - 1) * gap;
      const xa = dir > 0 ? x : x - l;
      return `<rect x="${n2(xa)}" y="${n2(yy - 5.5)}" width="${n2(l)}" height="11" rx="5.5" fill="${i === 1 ? C.goldLight : C.gold}" stroke="${C.ink}" stroke-width="${n2(ink)}"/>`;
    })
    .join('');
}

/** The tagline's enamel sign strip: maroon, brass border, cream pinline, rivets at the ends. */
function signStrip(cx: number, cy: number, w: number, h: number, ink: number): string {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const r = h * 0.22;
  return `<g>
    <rect x="${n2(x + 4)}" y="${n2(y + 9)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(r)}" fill="#000" opacity=".4"/>
    <rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(r)}" fill="${C.gold}" stroke="${C.ink}" stroke-width="${n2(ink * 2)}"/>
    <rect x="${n2(x)}" y="${n2(cy)}" width="${n2(w)}" height="${n2(h / 2)}" rx="${n2(r)}" fill="${C.goldDeep}" opacity=".6"/>
    <rect x="${n2(x + 7)}" y="${n2(y + 7)}" width="${n2(w - 14)}" height="${n2(h - 14)}" rx="${n2(r * 0.7)}" fill="${C.maroon}" stroke="${C.ink}" stroke-width="${n2(ink)}"/>
    <rect x="${n2(x + 8)}" y="${n2(cy + h * 0.12)}" width="${n2(w - 16)}" height="${n2(h / 2 - h * 0.12 - 8)}" rx="${n2(r * 0.6)}" fill="${C.maroonDeep}"/>
    <rect x="${n2(x + 14)}" y="${n2(y + 13)}" width="${n2(w - 28)}" height="${n2(h - 26)}" rx="${n2(r * 0.5)}" fill="none" stroke="${C.cream}" stroke-width="2" opacity=".75"/>
    ${[x + 26, x + w - 26].map((rx) => `<circle cx="${n2(rx)}" cy="${n2(cy)}" r="5" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2"/>`).join('')}
  </g>`;
}

/**
 * The title lockup: THIRD RAIL in chunky deco capitals leaning forward like a streamliner (cream
 * over maroon enamel faces, brass bevel and extrusion, ink outline), the glowing third rail with a
 * bolt crackling along it underneath, RICHES in gold on an emerald and brass deco plate flanked by
 * speed lines and sparkles, and ALL ABOARD! on a small enamel sign strip. Small sizes get heavier
 * outlines relative to the letters and lose the bevel, the tagline and the fine detail, so the
 * words stay readable down to the ~160 px portrait logo.
 */
export function logoSvg(o: LogoOptions): string {
  const W = LOGO_BOX.w;
  const H = LOGO_BOX.h;
  const small = o.width < 250;
  const tiny = o.width < 170;
  const tagline = o.tagline ?? o.width >= 320;
  const detail = !small;
  const ink = tiny ? 9.5 : small ? 7.5 : 5.5;
  const treat: Treat = { ink, depth: tiny ? 10 : 13, rim: tiny ? 0 : small ? 3.5 : 4.2, detail, small };
  const id = nid('lg');
  // vertical plan (design units); without the tagline everything grows into its room
  const P = tagline
    ? { top: 58, rail: 238, pc: 352, ph: 180, rc: 120, tag: 512 }
    : { top: small ? 52 : 64, rail: small ? 252 : 256, pc: small ? 420 : 410, ph: small ? 236 : 214, rc: small ? 158 : 142, tag: 0 };
  // THIRD RAIL as big as the width allows (it leans forward, so keep room for the lean)
  const track = small ? 4 : 3;
  const cap = Math.min(140, (900 / setLine('THIRD RAIL', 0, 0, { cap: 100, track }).width) * 100);
  const base = P.top + cap;
  const skew = -9;
  const top = setLine('THIRD RAIL', W / 2 - 8, base, { cap, track });
  const rich = setLine('RICHES', W / 2, P.pc + P.rc / 2 - 2, { cap: P.rc, track: small ? 10 : 8 });
  const pw = rich.width + P.rc * (small ? 0.75 : 0.95);
  const rx0 = W / 2 - Math.min(470, top.width / 2 + 10);
  const rx1 = W / 2 + Math.min(470, top.width / 2 + 10);
  const sparks = detail
    ? `${sparkle(W / 2 - pw / 2 + 10, P.pc - P.ph / 2 + 4, 24, 4)}${sparkle(W / 2 + pw / 2 - 26, P.pc + P.ph / 2 - 8, 18, 3.5)}${sparkle(W / 2 + pw / 2 + 30, P.pc - P.ph / 2 + 24, 12, 3)}${star(W / 2 - pw / 2 - 26, P.pc + P.ph / 2 - 20, 9, C.goldLight)}`
    : sparkle(W / 2 + pw / 2 - 20, P.pc - P.ph / 2 + 8, small ? 30 : 22, ink * 0.7);
  const lines = detail ? `${speedLines(W / 2 - pw / 2 - P.ph * 0.3, P.pc, -1, 130, 26, 3.5)}${speedLines(W / 2 + pw / 2 + P.ph * 0.3, P.pc, 1, 130, 26, 3.5)}` : '';
  let tag = '';
  if (tagline) {
    const t = setLine('ALL ABOARD!', W / 2, P.tag + 19, { cap: 40, track: 9 });
    tag = `${signStrip(W / 2, P.tag, t.width + 96, 74, 4)}${taglineSvg(t.placed, { ink: 8 })}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${n2(o.width)}" height="${n2(o.height ?? o.width * (H / W))}">
  ${lines}
  ${richesPlate(W / 2, P.pc, pw, P.ph, { detail, ink, id: `${id}p` })}
  ${burnedSvg(rich.placed, { ink: ink + 1, detail })}
  ${sparks}
  ${tag}
  ${thirdRail(rx0, rx1, P.rail, { detail, ink: ink * 0.9, id: `${id}r` })}
  ${burst(rx1 + 6, P.rail, detail ? 34 : 40, ink * 0.8, detail)}
  <g transform="translate(0 ${base}) skewX(${skew}) translate(0 ${-base})">${carvedSvg(top.placed, treat)}</g>
</svg>`;
}

/** A word in one of the treatments as a standalone SVG (tile titles, review sheets). */
export function wordSvg(text: string, cap: number, style: 'carved' | 'burned' | 'tagline' = 'carved', pad = 0.5): string {
  const probe = setLine(text, 0, 0, { cap });
  const w = probe.width + cap * pad * 2;
  const h = cap * (1 + pad * 2) + cap * 0.2;
  const line = setLine(text, w / 2, cap * pad + cap, { cap });
  const body = style === 'carved' ? carvedSvg(line.placed, { ink: 6, depth: 10, rim: 5.5, detail: cap > 60 }) : style === 'burned' ? burnedSvg(line.placed, { ink: 5, detail: cap > 40 }) : taglineSvg(line.placed, { ink: 7 });
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
    body += `<g transform="translate(${n2(x)} ${n2(y)}) scale(${k})"><rect x="0" y="0" width="${g.adv}" height="100" fill="none" stroke="${C.volt}" stroke-width="1" opacity=".5"/><path d="${g.d}" fill="${C.cream}" fill-rule="evenodd" stroke="${C.ink}" stroke-width="1"/></g>`;
  });
  const w = perRow * cell * 1.1 + cap * 0.4;
  const h = rows * cell + cap * 0.3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n2(w)} ${n2(h)}" width="${n2(w)}" height="${n2(h)}"><rect width="100%" height="100%" fill="${C.ironDeep}"/>${body}</svg>`;
}

void xAt;
