/**
 * Minimum-KL reweighting ("exponential tilting").
 *
 * Given categories c with natural probabilities q_c and feature vectors F[k][c], find the distribution
 * p closest to q in Kullback-Leibler divergence KL(p || q) subject to E_p[F_k] = t_k for the equality
 * set, and lo_k <= E_p[F_k] <= hi_k for the inequality set. The solution has the form
 *   p_c = q_c exp(sum_k theta_k F[k][c]) / Z(theta)
 * with theta_k = 0 for every inactive inequality. theta minimises the convex dual
 *   g(theta) = log Z(theta) - theta . t, gradient E_theta[F] - t, Hessian Cov_theta(F),
 * solved by damped Newton. Inequalities use an active set: solve, add the most violated bound as an
 * equality at that bound, drop an active bound whose multiplier has the wrong sign (an upper bound
 * needs theta <= 0, a lower bound theta >= 0), repeat until nothing changes.
 */

export interface TiltConstraint {
  name: string;
  feature: Float64Array | number[]; // one value per category
  eq?: number;
  lo?: number;
  hi?: number;
}

export interface TiltResult {
  p: Float64Array;
  theta: Record<string, number>;
  active: string[];
  kl: number;
  iterations: number;
}

function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    [M[i], M[piv]] = [M[piv], M[i]];
    const d = M[i][i];
    if (Math.abs(d) < 1e-300) throw new Error('singular Hessian in tilt solver');
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i] / d;
      if (f === 0) continue;
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function tiltWith(q: ArrayLike<number>, feats: ArrayLike<number>[], theta: number[]): { p: Float64Array; logZ: number } {
  const n = q.length;
  const e = new Float64Array(n);
  let mx = -Infinity;
  for (let c = 0; c < n; c++) {
    if (!(q[c] > 0)) {
      e[c] = -Infinity;
      continue;
    }
    let s = Math.log(q[c]);
    for (let k = 0; k < theta.length; k++) s += theta[k] * feats[k][c];
    e[c] = s;
    if (s > mx) mx = s;
  }
  let z = 0;
  for (let c = 0; c < n; c++) z += e[c] === -Infinity ? 0 : Math.exp(e[c] - mx);
  const p = new Float64Array(n);
  for (let c = 0; c < n; c++) p[c] = e[c] === -Infinity ? 0 : Math.exp(e[c] - mx) / z;
  return { p, logZ: mx + Math.log(z) };
}

function solveEq(q: ArrayLike<number>, feats: ArrayLike<number>[], t: number[]): { theta: number[]; p: Float64Array; it: number } {
  const K = t.length;
  let theta = new Array(K).fill(0);
  const dual = (th: number[]) => tiltWith(q, feats, th).logZ - th.reduce((a, x, k) => a + x * t[k], 0);
  let it = 0;
  for (; it < 200; it++) {
    const { p } = tiltWith(q, feats, theta);
    const mean = feats.map((f) => {
      let s = 0;
      for (let c = 0; c < p.length; c++) s += p[c] * f[c];
      return s;
    });
    const grad = mean.map((m, k) => m - t[k]);
    const scale = t.map((x) => Math.max(1e-9, Math.abs(x)));
    if (grad.every((g, k) => Math.abs(g) / scale[k] < 1e-14)) return { theta, p, it };
    const H: number[][] = [];
    for (let a = 0; a < K; a++) {
      H.push([]);
      for (let b = 0; b < K; b++) {
        let s = 0;
        for (let c = 0; c < p.length; c++) s += p[c] * (feats[a][c] - mean[a]) * (feats[b][c] - mean[b]);
        H[a].push(s);
      }
    }
    // tiny ridge relative to each diagonal keeps near-collinear constraint sets solvable
    for (let a = 0; a < K; a++) H[a][a] += Math.max(1e-300, H[a][a] * 1e-12);
    const step = solveLinear(H, grad.map((g) => -g));
    const g0 = dual(theta);
    let lr = 1;
    let next = theta;
    for (let ls = 0; ls < 60; ls++) {
      next = theta.map((x, k) => x + lr * step[k]);
      if (dual(next) <= g0 + 1e-15 * Math.abs(g0)) break;
      lr /= 2;
    }
    if (next.every((x, k) => x === theta[k])) return { theta, p, it };
    theta = next;
  }
  const { p } = tiltWith(q, feats, theta);
  return { theta, p, it };
}

export function tilt(q: ArrayLike<number>, constraints: TiltConstraint[]): TiltResult {
  const active = new Map<string, number>(); // name -> target
  for (const c of constraints) if (c.eq !== undefined) active.set(c.name, c.eq);
  let totalIt = 0;
  const seen = new Set<string>();
  for (let round = 0; round < 8 * constraints.length + 8; round++) {
    const list = constraints.filter((c) => active.has(c.name));
    const res = solveEq(
      q,
      list.map((c) => c.feature),
      list.map((c) => active.get(c.name)!),
    );
    totalIt += res.it;
    // drop an active bound whose multiplier says it is not binding
    let drop: TiltConstraint | undefined;
    let dropScore = 0;
    list.forEach((c, k) => {
      if (c.eq !== undefined) return;
      const th = res.theta[k];
      const atHi = c.hi !== undefined && active.get(c.name) === c.hi;
      const wrong = atHi ? th > 0 : th < 0;
      if (wrong && Math.abs(th) > dropScore) {
        drop = c;
        dropScore = Math.abs(th);
      }
    });
    // add the most violated inactive bound (relative violation)
    let add: { c: TiltConstraint; target: number; v: number } | undefined;
    for (const c of constraints) {
      if (active.has(c.name)) continue;
      let v = 0;
      for (let i = 0; i < res.p.length; i++) v += res.p[i] * c.feature[i];
      const scale = (x: number) => Math.max(1e-12, Math.abs(x));
      if (c.lo !== undefined && v < c.lo - 1e-15) {
        const viol = (c.lo - v) / scale(c.lo);
        if (!add || viol > add.v) add = { c, target: c.lo, v: viol };
      } else if (c.hi !== undefined && v > c.hi + 1e-15) {
        const viol = (v - c.hi) / scale(c.hi);
        if (!add || viol > add.v) add = { c, target: c.hi, v: viol };
      }
    }
    if (add) {
      active.set(add.c.name, add.target);
      continue;
    }
    if (drop) {
      const key = [...active.keys()].sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        active.delete(drop.name);
        continue;
      }
    }
    let kl = 0;
    for (let i = 0; i < res.p.length; i++) if (res.p[i] > 0) kl += res.p[i] * Math.log(res.p[i] / q[i]);
    const theta: Record<string, number> = {};
    list.forEach((c, k) => (theta[c.name] = res.theta[k]));
    return { p: res.p, theta, active: list.map((c) => c.name), kl, iterations: totalIt };
  }
  throw new Error('tilt: active set did not settle');
}
