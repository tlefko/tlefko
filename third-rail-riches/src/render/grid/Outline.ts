import { Graphics } from 'pixi.js';
import { COLS, ROWS, type Layout } from '../layout';

type Pt = { x: number; y: number };

/** Glow colour per symbol (its identity hue from docs/ART.md), light core first. */
export const HUE: Record<number, [number, number]> = {
  0: [0xbff5ea, 0x23b3a6],
  1: [0xffe0ee, 0xff86b4],
  2: [0xfff3d6, 0xe8563f],
  3: [0xfff0b0, 0xf4b73a],
  4: [0xffd7c2, 0xf0592d],
  5: [0xead6ff, 0x9b5cf0],
  6: [0xe2ecf2, 0x6f93b5],
  7: [0xe4ffc8, 0x4fbf3a],
  8: [0xffe0c8, 0xd42c24],
};

/**
 * Perimeter loops of a set of cells on the 6x5 lattice, as lattice corner points (col 0..6,
 * row 0..5). Loops run clockwise on screen with the cells on their right; two cells touching only
 * at a corner give two loops that meet there.
 */
export function perimeter(positions: number[]): Pt[][] {
  const set = new Set(positions);
  const has = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS && set.has(c * ROWS + r);
  // directed boundary edges keyed by their start corner
  const out = new Map<string, Pt[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const push = (a: Pt, b: Pt) => {
    const k = key(a.x, a.y);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(b);
  };
  for (const p of set) {
    const c = Math.floor(p / ROWS);
    const r = p % ROWS;
    if (!has(c, r - 1)) push({ x: c, y: r }, { x: c + 1, y: r });
    if (!has(c + 1, r)) push({ x: c + 1, y: r }, { x: c + 1, y: r + 1 });
    if (!has(c, r + 1)) push({ x: c + 1, y: r + 1 }, { x: c, y: r + 1 });
    if (!has(c - 1, r)) push({ x: c, y: r + 1 }, { x: c, y: r });
  }
  const loops: Pt[][] = [];
  const take = (from: Pt, dir: Pt | null): Pt | null => {
    const list = out.get(key(from.x, from.y));
    if (!list?.length) return null;
    let i = 0;
    if (list.length > 1 && dir) {
      // at a pinch prefer the right turn, so each lobe closes on itself
      const right = { x: -dir.y, y: dir.x };
      const j = list.findIndex((b) => b.x - from.x === right.x && b.y - from.y === right.y);
      if (j >= 0) i = j;
    }
    return list.splice(i, 1)[0];
  };
  for (const [k, list] of out) {
    while (list.length) {
      const [sx, sy] = k.split(',').map(Number);
      const start = { x: sx, y: sy };
      const loop: Pt[] = [start];
      let cur = start;
      let dir: Pt | null = null;
      for (let guard = 0; guard < 200; guard++) {
        const nxt = take(cur, dir);
        if (!nxt) break;
        dir = { x: nxt.x - cur.x, y: nxt.y - cur.y };
        if (nxt.x === start.x && nxt.y === start.y) break;
        loop.push(nxt);
        cur = nxt;
      }
      loops.push(simplify(loop));
    }
  }
  return loops.filter((l) => l.length >= 4);
}

/** Drop collinear corners. */
function simplify(loop: Pt[]): Pt[] {
  const n = loop.length;
  const res: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n];
    const b = loop[i];
    const c = loop[(i + 1) % n];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) res.push(b);
  }
  return res;
}

/**
 * A lattice loop in screen space: columns are separated by the reel gaps, so each lattice column
 * line sits in the middle of a gap; the loop is inset by `inset` and its corners rounded, then
 * flattened to a polyline with cumulative lengths (for a trace that draws along it).
 */
export function screenLoop(L: Layout, loop: Pt[], inset: number, radius: number): { pts: Pt[]; len: number[]; total: number } {
  const X = (c: number) => L.grid.x + c * (L.S + L.gx) - L.gx / 2;
  const Y = (r: number) => L.grid.y + r * L.S;
  const n = loop.length;
  const corners: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[(i - 1 + n) % n];
    const b = loop[i];
    const c = loop[(i + 1) % n];
    const din = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    const dout = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
    // the cells are on the right of travel (y down): inward normal = (-dy, dx)
    const nx = -din.y - dout.y;
    const ny = din.x + dout.x;
    corners.push({ x: X(b.x) + nx * inset, y: Y(b.y) + ny * inset });
  }
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = corners[(i - 1 + n) % n];
    const b = corners[i];
    const c = corners[(i + 1) % n];
    const la = Math.hypot(b.x - a.x, b.y - a.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, la * 0.45, lc * 0.45);
    const p0 = { x: b.x + ((a.x - b.x) / la) * r, y: b.y + ((a.y - b.y) / la) * r };
    const p2 = { x: b.x + ((c.x - b.x) / lc) * r, y: b.y + ((c.y - b.y) / lc) * r };
    const steps = 5;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      pts.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * b.y + t * t * p2.y });
    }
  }
  pts.push({ ...pts[0] });
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, len, total: len[len.length - 1] };
}

/** Where a trace of progress `p` (0..1) has reached along a loop. */
export function pointAt(loop: { pts: Pt[]; len: number[]; total: number }, p: number): Pt {
  const d = Math.max(0, Math.min(1, p)) * loop.total;
  let i = 1;
  while (i < loop.len.length - 1 && loop.len[i] < d) i++;
  const a = loop.pts[i - 1];
  const b = loop.pts[i];
  const seg = loop.len[i] - loop.len[i - 1] || 1;
  const t = (d - loop.len[i - 1]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The glowing outline that traces a winning cluster: one Graphics per cluster, redrawn while the
 * trace runs (a few dozen points, three strokes), then left standing and pulsing until the pop.
 */
export class ClusterGlow extends Graphics {
  loops: { pts: Pt[]; len: number[]; total: number }[] = [];
  progress = 0;

  constructor(
    L: Layout,
    positions: number[],
    private hue: [number, number],
  ) {
    super();
    this.blendMode = 'add';
    this.eventMode = 'none';
    const S = L.S;
    this.loops = perimeter(positions).map((l) => screenLoop(L, l, S * 0.035, S * 0.2));
    this.width0 = S;
  }
  private width0: number;

  /** Arc-length position (0..1) of the loop point nearest to (x, y): when the trace passes it. */
  paramNear(x: number, y: number): number {
    let best = Infinity;
    let at = 0;
    for (const l of this.loops) {
      for (let i = 0; i < l.pts.length; i++) {
        const d = (l.pts[i].x - x) ** 2 + (l.pts[i].y - y) ** 2;
        if (d < best) {
          best = d;
          at = l.len[i] / (l.total || 1);
        }
      }
    }
    return at;
  }

  draw(p: number) {
    this.progress = p;
    const S = this.width0;
    const [core, hue] = this.hue;
    this.clear();
    const passes: [number, number, number][] = [
      [S * 0.2, hue, 0.16],
      [S * 0.1, hue, 0.42],
      [S * 0.035, core, 0.95],
    ];
    for (const l of this.loops) {
      const d = p * l.total;
      if (d <= 0) continue;
      for (const [w, color, alpha] of passes) {
        this.moveTo(l.pts[0].x, l.pts[0].y);
        let i = 1;
        for (; i < l.pts.length && l.len[i] <= d; i++) this.lineTo(l.pts[i].x, l.pts[i].y);
        if (i < l.pts.length && d < l.total) {
          const e = pointAt(l, p);
          this.lineTo(e.x, e.y);
        }
        this.stroke({ width: w, color, alpha, join: 'round', cap: 'round' });
      }
    }
  }
}
