/** Tiny 2D helpers for authoring SVG paths from computed geometry. */
export type V = [number, number];

export const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const lerp = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const rad = (d: number) => (d * Math.PI) / 180;
/** Unit vector at `deg` degrees (0 = right, 90 = down: SVG screen space). */
export const dir = (deg: number): V => [Math.cos(rad(deg)), Math.sin(rad(deg))];
export const P = (v: V) => `${v[0].toFixed(1)} ${v[1].toFixed(1)}`;
export const mirror = (v: V, cx = 128): V => [2 * cx - v[0], v[1]];

/** Smooth Catmull-Rom curve through the points, as an open path ("M.. C.."). */
export function smooth(pts: V[]): string {
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: V = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: V = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d;
}

/** Sample a Catmull-Rom spline through `pts` into `n` points. */
export function sample(pts: V[], n: number): V[] {
  const out: V[] = [];
  const segs = pts.length - 1;
  for (let s = 0; s <= n; s++) {
    const u = (s / n) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const t = u - i;
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t2 = t * t;
    const t3 = t2 * t;
    const f = (a: number, b: number, c: number, e: number) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t2 + (-a + 3 * b - 3 * c + e) * t3);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/**
 * A tapered stroke (tentacle, feather, flame lick) as a closed filled outline: the spine is a
 * Catmull-Rom curve through `pts`, half-width runs from w0 at the root to w1 at the tip, and
 * the tip is rounded. Returns the outline path and the sampled spine with its normals.
 */
export function taper(pts: V[], w0: number, w1: number, n = 36) {
  const s = sample(pts, n);
  const left: V[] = [];
  const right: V[] = [];
  const norms: V[] = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nrm: V = [-dy / len, dx / len];
    norms.push(nrm);
    const t = i / (s.length - 1);
    const w = w0 + (w1 - w0) * Math.pow(t, 0.9);
    left.push(add(s[i], nrm, w));
    right.push(add(s[i], nrm, -w));
  }
  const tip = s[s.length - 1];
  const tn = norms[norms.length - 1];
  const tipDir: V = [tn[1], -tn[0]];
  const cap = add(tip, tipDir, w1 * 1.2);
  const d = `${smooth(left)} Q${P(cap)} ${P(right[right.length - 1])} ${smooth([...right].reverse()).replace(/^M[^C]*/, '')} Z`;
  return { d, spine: s, norms };
}

/** Four-point sparkle star. */
export function sparkle(cx: number, cy: number, r: number, fill: string, opacity = 1): string {
  const k = r * 0.16;
  return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z" fill="${fill}" opacity="${opacity}"/>`;
}

/** Ring (annulus) as one even-odd path. */
export function annulus(cx: number, cy: number, r0: number, r1: number): string {
  return `M${cx - r0} ${cy} A${r0} ${r0} 0 1 0 ${cx + r0} ${cy} A${r0} ${r0} 0 1 0 ${cx - r0} ${cy} Z M${cx - r1} ${cy} A${r1} ${r1} 0 1 1 ${cx + r1} ${cy} A${r1} ${r1} 0 1 1 ${cx - r1} ${cy} Z`;
}

/** Rotate `v` by `deg` degrees about `c`. */
export function turn(v: V, deg: number, c: V = [128, 128]): V {
  const a = rad(deg);
  const x = v[0] - c[0];
  const y = v[1] - c[1];
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
}

/** Closed smooth Catmull-Rom loop through the points ("M.. C.. Z"). */
export function loop(pts: V[]): string {
  const n = pts.length;
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: V = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: V = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return `${d} Z`;
}

/**
 * A brush stroke that swells and tapers to a point at both ends (hand-cut highlights, hatch
 * strokes, cracks, speed lines). `w` is the half-width at the fattest point, which sits at
 * `peak` (0..1) along the spline through `pts`. Returns a closed outline to fill.
 */
export function lens(pts: V[], w: number, peak = 0.5, n = 22): string {
  const s = sample(pts, n);
  const left: V[] = [];
  const right: V[] = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nrm: V = [-dy / len, dx / len];
    const t = i / (s.length - 1);
    const u = t < peak ? (t / peak) * 0.5 : 0.5 + ((t - peak) / (1 - peak)) * 0.5;
    const hw = w * Math.pow(Math.sin(Math.PI * u), 0.7);
    left.push(add(s[i], nrm, hw));
    right.push(add(s[i], nrm, -hw));
  }
  return `${smooth(left)} ${smooth([...right].reverse()).replace(/^M/, 'L')} Z`;
}

/**
 * Mirror path data left-right about x = cx (absolute and relative commands, arcs included), so
 * a part can be flipped without a scale(-1 1) transform that would also flip its lighting.
 */
export function mirrorX(d: string, cx = 128): string {
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: string[] = [];
  let cmd = '';
  let i = 0;
  // arity per command and which argument slots are x coordinates
  const spec: Record<string, { n: number; xs: number[]; flag?: number }> = {
    M: { n: 2, xs: [0] },
    L: { n: 2, xs: [0] },
    T: { n: 2, xs: [0] },
    H: { n: 1, xs: [0] },
    V: { n: 1, xs: [] },
    C: { n: 6, xs: [0, 2, 4] },
    S: { n: 4, xs: [0, 2] },
    Q: { n: 4, xs: [0, 2] },
    A: { n: 7, xs: [5], flag: 4 },
    Z: { n: 0, xs: [] },
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) {
      cmd = tok[i++];
      out.push(cmd);
      if (cmd.toUpperCase() === 'Z') continue;
    }
    const s = spec[cmd.toUpperCase()];
    if (!s || s.n === 0) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const args = tok.slice(i, i + s.n).map(Number);
    i += s.n;
    s.xs.forEach((k) => (args[k] = rel ? -args[k] : 2 * cx - args[k]));
    if (s.flag !== undefined) args[s.flag] = args[s.flag] ? 0 : 1;
    if (cmd.toUpperCase() === 'A') args[2] = -args[2];
    out.push(args.map((v) => +v.toFixed(2)).join(' '));
  }
  return out.join(' ');
}

/** Points on an ellipse arc from a0 to a1 degrees (SVG screen angles), inclusive. */
export function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 6): V[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = rad(a0 + ((a1 - a0) * i) / n);
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as V;
  });
}
