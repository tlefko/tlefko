/**
 * Stake Engine math generator.
 *
 *   npx tsx tools/stake/generate.ts --out stake-math/publish --base 400000 --boost 400000 --witching 60000 --inferno 60000 --seed 1 --workers 9
 *
 * Per mode:
 *  1. Simulate N natural rounds (book ids 1..N, one seeded generator per round) and stream their
 *     books, in id order, into books_<MODE>.jsonl.zst.
 *  2. Stratified tail sample (ModeSpec.tail): M more natural rounds on the fast path; those paying at
 *     least the threshold are replayed with recording and appended as books (ids N+1...). The tail
 *     buckets' probabilities are estimated from all N + M rounds, so the top of the distribution is
 *     both better estimated and made of many distinct books.
 *  3. Guarantee max-win books: count the natural 10,000x books and, if fewer than the minimum, search
 *     further rounds (BASE / BOOST: rounds forced to 6 tickets; buys: unforced) on the fast path, replaying hits
 *     with recording; the found books are appended after the tail books.
 *  4. Weights: natural bucket probabilities, then a minimum-KL exponential tilt over fine payout buckets
 *     (tools/stake/tilt.ts) so the RTP is 96.30% with the max-win books pinned at the mode's max-win
 *     probability, the hit-rate bounds respected and every Stake 2-Star dashboard limit met with
 *     headroom (common.ts DASH_TARGET). Integer weights (sum ~1e15), then an exact integer correction
 *     on two books so 10 * costDen * sum(w * pay) == 963 * costNum * sum(w), i.e. RTP == 0.963 exactly
 *     (cost = costNum / costDen; BOOST 1.5 = 3 / 2).
 *  5. lookUpTable_<MODE>_0.csv (id,weight,payoutMultiplier) and index.json.
 * A summary goes to <out>/../generate_report.json.
 */
import { createWriteStream, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { constants, createZstdCompress } from 'node:zlib';
import type { Force } from '../../src/math/types';
import {
  BUCKETS,
  CAP_BUCKET,
  CAP_HUNDREDTHS,
  DASH_TARGET,
  EDGES,
  MODES,
  RTP_DEN,
  RTP_NUM,
  TARGET_RTP,
  TOTAL_WEIGHT,
  bucketLabel,
  bucketOf,
  fileNames,
  isSpinMode,
  streamWord,
  type ModeSpec,
} from './common';
import { tilt, type TiltConstraint } from './tilt';
import { RANGES, riskOf, type ModeRisk } from './verify';
import type { Job, SearchResult, SimResult } from './worker';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'stake-math/publish' },
    base: { type: 'string', default: '400000' },
    boost: { type: 'string', default: '400000' },
    witching: { type: 'string', default: '60000' },
    inferno: { type: 'string', default: '60000' },
    seed: { type: 'string', default: '1' },
    workers: { type: 'string' },
    level: { type: 'string', default: '12' },
    modes: { type: 'string' },
    reweight: { type: 'boolean', default: false },
    'tail-scale': { type: 'string', default: '1' },
  },
});

const OUT = resolve(values.out!);
const SEED = Number(values.seed);
const LEVEL = Number(values.level);
const COUNTS: Record<string, number> = { BASE: Number(values.base), BOOST: Number(values.boost), WITCHING: Number(values.witching), INFERNO: Number(values.inferno) };
const NWORKERS = values.workers ? Number(values.workers) : Math.max(1, Math.min(9, os.availableParallelism() - 1));
const ONLY = values.modes ? values.modes.split(',') : null;
/** Scales every mode's tail-sample size (0 = no tail sample; for quick test runs). */
const TAIL_SCALE = Number(values['tail-scale']);

// ---------------------------------------------------------------------------------------------
// Worker pool (one job per worker at a time)
// ---------------------------------------------------------------------------------------------

class Pool {
  private idle: Worker[] = [];
  private waiting: (() => void)[] = [];
  private nextId = 1;
  private all: Worker[] = [];
  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./boot.mjs', import.meta.url));
      this.all.push(w);
      this.idle.push(w);
    }
  }
  private async acquire(): Promise<Worker> {
    while (this.idle.length === 0) await new Promise<void>((r) => this.waiting.push(r));
    return this.idle.pop()!;
  }
  private release(w: Worker) {
    this.idle.push(w);
    this.waiting.shift()?.();
  }
  async run<T>(job: Job): Promise<T> {
    const w = await this.acquire();
    const id = this.nextId++;
    try {
      return await new Promise<T>((res, rej) => {
        const onMsg = (msg: { id: number; res?: T; error?: string }) => {
          if (msg.id !== id) return;
          w.off('message', onMsg);
          w.off('error', rej);
          if (msg.error) rej(new Error(msg.error));
          else res(msg.res as T);
        };
        w.on('message', onMsg);
        w.once('error', rej);
        w.postMessage({ id, job });
      });
    } finally {
      this.release(w);
    }
  }
  async close() {
    await Promise.all(this.all.map((w) => w.terminate()));
  }
}

// ---------------------------------------------------------------------------------------------
// Exact integer RTP correction
// ---------------------------------------------------------------------------------------------

function egcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  let [or, r] = [a, b];
  let [os_, s] = [1n, 0n];
  let [ot, t] = [0n, 1n];
  while (r !== 0n) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os_, s] = [s, os_ - q * s];
    [ot, t] = [t, ot - q * t];
  }
  return [or, os_, ot]; // a*os + b*ot = or
}

const babs = (x: bigint) => (x < 0n ? -x : x);
function bdivRound(a: bigint, b: bigint): bigint {
  // round(a / b) for b > 0
  const q = a / b;
  const r = a - q * b;
  if (2n * babs(r) >= b) return q + (r > 0n ? 1n : -1n);
  return q;
}

/**
 * Make RTP_DEN * costDen * sum(w * pay) == RTP_NUM * costNum * sum(w) exactly by adding `a` to one book j and
 * `b` to another book k. Changing book i's weight by 1 changes the imbalance by
 * c_i = RTP_NUM * costNum - RTP_DEN * costDen * pay_i, so we solve c_j * a + c_k * b = -E (E = current
 * imbalance), which needs gcd(c_j, c_k) | E. j is the heaviest zero-pay book (c_j = RTP_NUM * costNum),
 * or the heaviest book when a mode has no zero-pay book; k is the heaviest other book (below the
 * cap) that makes the equation solvable. Both adjustments are tiny next to the ~1e9+ weights.
 */
function exactRtp(w: bigint[], pay: Int32Array, m: ModeSpec): { zero: number; k: number; a: bigint; b: bigint } {
  const D = RTP_DEN * m.costDen;
  const coef = (i: number) => RTP_NUM * m.costNum - D * BigInt(pay[i]);
  let T = 0n;
  let S = 0n;
  for (let i = 0; i < w.length; i++) {
    T += w[i];
    S += w[i] * BigInt(pay[i]);
  }
  const E = RTP_NUM * m.costNum * T - D * S;
  let zero = -1;
  for (let i = 0; i < w.length; i++) if (pay[i] === 0 && (zero < 0 || w[i] > w[zero])) zero = i;
  if (zero < 0) for (let i = 0; i < w.length; i++) if (pay[i] < CAP_HUNDREDTHS && coef(i) !== 0n && (zero < 0 || w[i] > w[zero])) zero = i;
  if (zero < 0) throw new Error('exactRtp: no book for the first adjustment');
  const A = coef(zero);
  let k = -1;
  for (let i = 0; i < w.length; i++) {
    if (i === zero || pay[i] >= CAP_HUNDREDTHS || pay[i] === pay[zero]) continue;
    const B = coef(i);
    if (B === 0n || E % egcd(babs(A), babs(B))[0] !== 0n) continue;
    if (k < 0 || w[i] > w[k]) k = i;
  }
  if (k < 0) throw new Error('exactRtp: no suitable books');
  const B = coef(k);
  const [g, x, y] = egcd(A, B);
  const gg = babs(g);
  if (E % gg !== 0n) throw new Error(`exactRtp: ${E} not divisible by ${gg}`);
  const mul = -E / g; // A*x*mul + B*y*mul = -E
  let a = x * mul;
  let b = y * mul;
  // general solution: a + t*B/g, b - t*A/g ; pick t making b small
  const Ag = A / g;
  const Bg = B / g;
  const t = Ag > 0n ? bdivRound(b, Ag) : bdivRound(-b, -Ag);
  a += t * Bg;
  b -= t * Ag;
  if (A * a + B * b !== -E) throw new Error('exactRtp: algebra');
  if (w[zero] + a < 1n || w[k] + b < 1n) throw new Error('exactRtp: adjustment too large');
  w[zero] += a;
  w[k] += b;
  return { zero, k, a, b };
}

// ---------------------------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------------------------

interface WeightReport {
  naturalBooks: number;
  tailBooks: number;
  gapBooks: number;
  tailRounds: number;
  tailMinPay: number;
  searchedBooks: number;
  maxWinBooks: number;
  naturalRtp: number;
  naturalRtpExCap: number;
  naturalHit: number;
  naturalCap: number;
  targetExCap: number;
  theta: Record<string, number>;
  active: string[];
  kl: number;
  cvarT: number;
  exact: { zeroId: number; bookId: number; a: string; b: string };
  buckets: { label: string; books: number; natural: number; published: number }[];
  dashboard: Omit<ModeRisk, 'ranges'> & { ranges: { label: string; books: number; prob: number }[] };
}

/** Which books are which: the main natural sample, the stratified tail sample, then searched max wins. */
interface Layout {
  /** Books [0, nMain) are the main natural sample. */
  nMain: number;
  /** Books [nMain, tailEnd) are the rounds of `tailRounds` extra natural rounds that paid >= tailMinPay. */
  tailEnd: number;
  tailRounds: number;
  /** Bet multiples; a bucket edge. */
  tailMinPay: number;
  /** Books [tailEnd, gapEnd) were searched to fill Stake hit-rate ranges no natural book reached. */
  gapEnd: number;
}

/**
 * Published weights for one mode.
 *
 * Bucket probabilities come from the natural samples: buckets at or above the tail threshold use the
 * main sample plus the tail sample (nMain + tailRounds rounds), the rest the main sample. Max-win
 * books are pinned to maxWinProb. The remaining mass is the minimum-KL tilt of those probabilities
 * that meets: RTP 96.30% (equality), the hit-rate bounds, and Stake's 2-Star dashboard limits with
 * headroom (DASH_TARGET): tail probabilities at 5k / 10k / 25k, CVaR (absolute and per stake, as a
 * Rockafellar-Uryasev bound iterated to the solution's VaR), expected tail liability, and the BASE
 * standard deviation (sdMax). Books in a bucket keep equal weights, so every feature is exact.
 */
function computeWeights(m: ModeSpec, pay: Int32Array, lay: Layout): { w: bigint[]; rep: WeightReport } {
  const n = pay.length;
  const cost = m.cost;
  const CAPX = CAP_HUNDREDTHS / 100;
  const members: number[][] = Array.from({ length: BUCKETS }, () => []);
  const cntMain = new Float64Array(BUCKETS);
  const cntTail = new Float64Array(BUCKETS);
  const cntGap = new Float64Array(BUCKETS);
  let natSum = 0;
  let natHit = 0;
  let natCapSum = 0;
  for (let i = 0; i < n; i++) {
    const b = bucketOf(pay[i]);
    members[b].push(i);
    if (i < lay.nMain) {
      cntMain[b]++;
      natSum += pay[i];
      if (pay[i] > 0) natHit++;
      if (b === CAP_BUCKET) natCapSum += pay[i];
    } else if (i < lay.tailEnd) cntTail[b]++;
    else if (i < lay.gapEnd) cntGap[b]++;
    else if (b !== CAP_BUCKET) throw new Error('searched book below the cap');
  }
  const capBooks = members[CAP_BUCKET];
  if (capBooks.length === 0) throw new Error(`${m.name}: no max-win books`);
  const tailB = lay.tailRounds > 0 ? bucketOf(Math.round(lay.tailMinPay * 100)) : CAP_BUCKET;
  if (lay.tailRounds > 0 && bucketLowerEdge(tailB) !== lay.tailMinPay) throw new Error(`${m.name}: tail threshold ${lay.tailMinPay} is not a bucket edge`);
  for (let b = 0; b < tailB; b++) if (cntTail[b]) throw new Error(`${m.name}: tail book below the tail threshold`);
  const NB = CAP_BUCKET; // non-cap buckets 0..CAP_BUCKET-1
  const q = new Float64Array(NB);
  for (let b = 0; b < NB; b++) q[b] = b >= tailB ? (cntMain[b] + cntTail[b]) / (lay.nMain + lay.tailRounds) : cntMain[b] / lay.nMain;
  // a bucket only gap-fill books reach gets a token probability (2x the pinned max win), so the
  // range is not empty and the books carry weight
  for (let b = 0; b < NB; b++) if (q[b] === 0 && cntGap[b] > 0) q[b] = 2 * m.maxWinProb;
  const qs = q.reduce((a, x) => a + x, 0);
  for (let b = 0; b < NB; b++) q[b] /= qs;
  const naturalCap = (cntMain[CAP_BUCKET] + cntTail[CAP_BUCKET]) / (lay.nMain + lay.tailRounds);
  // bucket features: equal-weight means over the bucket's books (x in bet multiples)
  const feat = (fn: (x: number) => number) => {
    const out = new Float64Array(NB);
    for (let b = 0; b < NB; b++) {
      const mem = members[b];
      if (!mem.length) continue;
      let s = 0;
      for (const i of mem) s += fn(pay[i] / 100);
      out[b] = s / mem.length;
    }
    return out;
  };
  const pCap = m.maxWinProb;
  const sc = (v: number) => (v - pCap) / (1 - pCap);
  const target = (TARGET_RTP - (pCap * CAPX) / cost) / (1 - pCap);
  const cons: TiltConstraint[] = [
    { name: 'rtp', feature: feat((x) => x / cost), eq: target },
    { name: 'hit', feature: feat((x) => (x > 0 ? 1 : 0)), lo: sc(m.hit[0]), hi: m.hit[1] < 1 ? sc(m.hit[1]) : undefined },
  ];
  if (m.sdMax !== undefined) {
    // E[(X/cost)^2] <= (sdMax/cost)^2 + RTP^2, with the pinned max win taken out
    const ex2 = ((m.sdMax / cost) ** 2 + TARGET_RTP ** 2 - pCap * (CAPX / cost) ** 2) / (1 - pCap);
    cons.push({ name: 'sd', feature: feat((x) => (x / cost) ** 2), hi: ex2 });
  }
  for (const [T, lim] of DASH_TARGET.tail) cons.push({ name: `P>=${T}`, feature: feat((x) => (x >= T ? 1 : 0)), hi: sc(lim) });
  // expected tail liability: share of RTP from wins above 40x and 10,000x the cost (the pinned max win counts)
  const EX = TARGET_RTP * cost;
  const etl = (name: string, thr: number[], lim: number) => {
    const capPart = thr.filter((t) => CAPX > t).length * pCap * CAPX;
    cons.push({ name, feature: feat((x) => thr.reduce((a, t) => a + (x > t ? x : 0), 0) / cost), hi: (lim * EX - capPart) / ((1 - pCap) * cost) });
  };
  etl('etl40', [40 * cost], DASH_TARGET.etl40);
  if (10000 * cost < CAPX) etl('etl10k', [10000 * cost], DASH_TARGET.etl10k);
  etl('etlSum', [40 * cost, 10000 * cost], DASH_TARGET.etlSum);
  // CVaR: for any t, CVaR <= t + E[(X - t)^+] / alpha (Rockafellar-Uryasev), tight at t = VaR
  const C = Math.min(DASH_TARGET.cvarAbs, DASH_TARGET.cvarPerStake * cost);
  const alpha = DASH_TARGET.cvarAlpha;
  const byPay = Array.from({ length: n }, (_, i) => i).sort((a, b) => pay[b] - pay[a]);
  const bucketOfBook = new Int32Array(n);
  for (let b = 0; b < BUCKETS; b++) for (const i of members[b]) bucketOfBook[i] = b;
  const varOf = (p: Float64Array) => {
    let cum = 0;
    for (const i of byPay) {
      const b = bucketOfBook[i];
      cum += b === CAP_BUCKET ? pCap / capBooks.length : (p[b] * (1 - pCap)) / members[b].length;
      if (cum >= alpha) return pay[i] / 100;
    }
    return 0;
  };
  let t = varOf(q);
  let res = tilt(q, cons);
  for (let it = 0; it < 10; it++) {
    const hi = (alpha * (C - t) - pCap * (CAPX - t)) / ((1 - pCap) * cost);
    if (!(hi > 0)) throw new Error(`${m.name}: CVaR target ${C} is infeasible at t = ${t}`);
    const tt = t;
    res = tilt(q, [...cons, { name: 'cvar', feature: feat((x) => Math.max(0, x - tt) / cost), hi }]);
    const v = varOf(res.p);
    if (Math.abs(v - t) < 0.5) break;
    t = v;
  }
  const W = TOTAL_WEIGHT;
  const w: bigint[] = new Array(n);
  for (let b = 0; b < BUCKETS; b++) {
    for (const i of members[b]) {
      const x = b === CAP_BUCKET ? (pCap * W) / capBooks.length : (res.p[b] * (1 - pCap) * W) / members[b].length;
      w[i] = BigInt(Math.max(1, Math.round(x)));
    }
  }
  const ex = exactRtp(w, pay, m);
  const bucketsRep: WeightReport['buckets'] = [];
  for (let b = 0; b < BUCKETS; b++) {
    const books = members[b].length;
    if (!books) continue;
    bucketsRep.push({ label: bucketLabel(b), books, natural: b === CAP_BUCKET ? naturalCap : q[b] * (1 - naturalCap), published: b === CAP_BUCKET ? pCap : res.p[b] * (1 - pCap) });
  }
  const risk = riskOf({ name: m.name, cost, weight: w, pay: Array.from(pay) });
  return {
    w,
    rep: {
      naturalBooks: lay.nMain,
      tailBooks: lay.tailEnd - lay.nMain,
      gapBooks: lay.gapEnd - lay.tailEnd,
      tailRounds: lay.tailRounds,
      tailMinPay: lay.tailMinPay,
      searchedBooks: n - lay.gapEnd,
      maxWinBooks: capBooks.length,
      naturalRtp: natSum / 100 / cost / lay.nMain,
      naturalRtpExCap: (natSum - natCapSum) / 100 / cost / lay.nMain,
      naturalHit: natHit / lay.nMain,
      naturalCap,
      targetExCap: target,
      theta: res.theta,
      active: res.active,
      kl: res.kl,
      cvarT: t,
      exact: { zeroId: ex.zero + 1, bookId: ex.k + 1, a: ex.a.toString(), b: ex.b.toString() },
      buckets: bucketsRep,
      dashboard: { ...risk, ranges: risk.ranges.map((r) => ({ label: r.label, books: r.books, prob: r.prob })) },
    },
  };
}

/** Lower edge (bet multiples) of payout bucket b (bucket b >= 1 covers [EDGES[b-1], EDGES[b])). */
function bucketLowerEdge(b: number): number {
  return b >= 1 ? EDGES[b - 1] : 0;
}

/** One line of dashboard figures for the log. */
function dashLine(d: WeightReport['dashboard']): string {
  return (
    `RTP ${(d.rtp * 100).toFixed(4)}% hit ${(d.hit * 100).toFixed(2)}% sd ${d.sd.toFixed(2)} P5k ${d.tail[5000].toExponential(2)} P10k ${d.tail[10000].toExponential(2)} ` +
    `P25k ${d.tail[25000].toExponential(2)} CVaR ${d.cvar.toFixed(0)} (/cost ${d.cvarPerStake.toFixed(1)}) ETL40 ${d.etl40.toFixed(3)} ETL10k ${d.etl10k.toFixed(3)}${d.gaps.length ? ` GAPS ${d.gaps.join(' ')}` : ''}`
  );
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

function writeAll(stream: NodeJS.WritableStream, data: string): Promise<void> {
  return new Promise((res) => {
    if (stream.write(data)) res();
    else stream.once('drain', () => res());
  });
}

async function generateMode(pool: Pool, m: ModeSpec) {
  const N = COUNTS[m.name];
  const t0 = performance.now();
  const files = fileNames(m.name);
  const tmpEvents = join(OUT, `.${files.events}.tmp`);
  const zs = createZstdCompress({ params: { [constants.ZSTD_c_compressionLevel]: LEVEL, [constants.ZSTD_c_enableLongDistanceMatching]: 1, [constants.ZSTD_c_windowLog]: 27 } });
  const fileOut = createWriteStream(tmpEvents);
  zs.pipe(fileOut);
  const pay: number[] = [];
  const natPay = new Int32Array(N);
  const chunk = isSpinMode(m) ? 4000 : 120;
  const stream = streamWord(SEED, m.index, 0);
  const nChunks = Math.ceil(N / chunk);
  const pending = new Map<number, SimResult>();
  let nextWrite = 0;
  let nextSubmit = 0;
  let writing: Promise<void> = Promise.resolve();
  let rawBytes = 0;
  const flush = async () => {
    while (pending.has(nextWrite)) {
      const r = pending.get(nextWrite)!;
      pending.delete(nextWrite);
      natPay.set(r.pay, nextWrite * chunk);
      rawBytes += Buffer.byteLength(r.text);
      await writeAll(zs, r.text);
      nextWrite++;
    }
  };
  const maxAhead = NWORKERS * 3;
  await new Promise<void>((resolveAll, rejectAll) => {
    let inFlight = 0;
    const pump = () => {
      while (inFlight < NWORKERS && nextSubmit < nChunks && nextSubmit - nextWrite < maxAhead) {
        const c = nextSubmit++;
        inFlight++;
        const start = c * chunk;
        pool
          .run<SimResult>({ type: 'sim', kind: m.kind, start, count: Math.min(chunk, N - start), stream })
          .then((r) => {
            inFlight--;
            pending.set(c, r);
            writing = writing.then(flush);
            writing.then(() => {
              if (nextWrite >= nChunks) resolveAll();
              else pump();
            }, rejectAll);
            pump();
          }, rejectAll);
      }
    };
    pump();
  });
  await writing;
  for (let i = 0; i < N; i++) pay.push(natPay[i]);
  const tSim = performance.now();
  // stratified tail sample: more natural rounds, keeping those that pay at least the threshold
  let tailRounds = 0;
  let tailBooks = 0;
  const tail = m.tail && TAIL_SCALE > 0 ? { rounds: Math.round(m.tail.rounds * TAIL_SCALE), minPay: m.tail.minPay } : null;
  if (tail && tail.rounds > 0) {
    const tStream = streamWord(SEED, m.index, 2);
    const per = isSpinMode(m) ? 250_000 : 2_500;
    const minPay = Math.round(tail.minPay * 100);
    const jobs: Promise<SearchResult>[] = [];
    for (let start = 0; start < tail.rounds; start += per) jobs.push(pool.run<SearchResult>({ type: 'search', kind: m.kind, start, count: Math.min(per, tail.rounds - start), stream: tStream, force: null, minPay }));
    const hits = (await Promise.all(jobs)).flatMap((r) => r.hits).sort((a, b) => a.index - b.index);
    for (const h of hits) {
      const book = JSON.parse(h.text);
      book.id = pay.length + 1;
      if (book.payoutMultiplier < minPay) throw new Error('tail hit below the threshold');
      pay.push(book.payoutMultiplier);
      const line = JSON.stringify(book) + '\n';
      rawBytes += Buffer.byteLength(line);
      await writeAll(zs, line);
    }
    tailRounds = tail.rounds;
    tailBooks = hits.length;
  }
  // gap fill: a Stake hit-rate range below the cap that no book reached gets up to 3 searched books
  // (BASE / BOOST: rounds forced to 6 tickets, a legitimate 15-spin bonus; buys: unforced)
  let gapBooks = 0;
  {
    const CAPX = CAP_HUNDREDTHS / 100;
    const minPos = pay.reduce((a, x) => (x > 0 && x < a ? x : a), Infinity) / 100;
    const gStream = streamWord(SEED, m.index, 3);
    let start = 0;
    for (const [lo, hi] of RANGES) {
      if (hi <= minPos || lo >= CAPX) continue;
      const top = Math.min(hi, CAPX);
      if (pay.some((x) => x >= lo * 100 && x < top * 100)) continue;
      const found: SearchResult['hits'] = [];
      let played = 0;
      while (found.length < 3 && played < 40_000_000) {
        const batch: Promise<SearchResult>[] = [];
        const per = isSpinMode(m) ? 2000 : 500;
        for (let j = 0; j < NWORKERS * 2; j++) {
          batch.push(pool.run<SearchResult>({ type: 'search', kind: m.kind, start, count: per, stream: gStream, force: isSpinMode(m) ? { scatCount: 6 } : null, minPay: lo * 100, maxPay: top * 100 }));
          start += per;
        }
        for (const r of await Promise.all(batch)) {
          played += r.played;
          found.push(...r.hits);
        }
      }
      found.sort((a, b) => a.index - b.index);
      for (const h of found.slice(0, 3)) {
        const book = JSON.parse(h.text);
        book.id = pay.length + 1;
        pay.push(book.payoutMultiplier);
        const line = JSON.stringify(book) + '\n';
        rawBytes += Buffer.byteLength(line);
        await writeAll(zs, line);
        gapBooks++;
      }
      console.log(`  ${m.name}: gap [${lo},${top}) filled with ${Math.min(3, found.length)} searched books (${played.toLocaleString()} rounds)`);
    }
  }
  const tTail = performance.now();
  // max-win books (natural ones from both samples count)
  let natural = 0;
  for (const x of pay) if (x >= CAP_HUNDREDTHS) natural++;
  const need = Math.max(0, m.minMaxWinBooks - natural);
  let searched = 0;
  let played = 0;
  if (need > 0) {
    const force: Force | null = isSpinMode(m) ? { scatCount: 6 } : null;
    const sStream = streamWord(SEED, m.index, 1);
    const per = isSpinMode(m) ? 400 : 200;
    const hits: { index: number; text: string }[] = [];
    let start = 0;
    while (hits.length < need) {
      const batch: Promise<SearchResult>[] = [];
      for (let j = 0; j < NWORKERS * 2; j++) {
        batch.push(pool.run<SearchResult>({ type: 'search', kind: m.kind, start, count: per, stream: sStream, force }));
        start += per;
      }
      for (const r of await Promise.all(batch)) {
        played += r.played;
        hits.push(...r.hits);
      }
      if (played > 200_000_000) throw new Error(`${m.name}: max-win search exhausted`);
    }
    hits.sort((a, b) => a.index - b.index);
    for (const h of hits.slice(0, need)) {
      const book = JSON.parse(h.text);
      book.id = pay.length + 1;
      if (book.payoutMultiplier !== CAP_HUNDREDTHS) throw new Error('search hit is not a max win');
      pay.push(book.payoutMultiplier);
      const line = JSON.stringify(book) + '\n';
      rawBytes += Buffer.byteLength(line);
      await writeAll(zs, line);
      searched++;
    }
  }
  await new Promise<void>((res, rej) => {
    fileOut.once('finish', () => res());
    fileOut.once('error', rej);
    zs.end();
  });
  renameSync(tmpEvents, join(OUT, files.events));
  // weights
  const payArr = Int32Array.from(pay);
  const { w, rep } = computeWeights(m, payArr, { nMain: N, tailEnd: N + tailBooks, gapEnd: N + tailBooks + gapBooks, tailRounds, tailMinPay: tail?.minPay ?? 0 });
  const tmpCsv = join(OUT, `.${files.weights}.tmp`);
  const lines: string[] = [];
  for (let i = 0; i < payArr.length; i++) lines.push(`${i + 1},${w[i]},${payArr[i]}`);
  writeFileSync(tmpCsv, lines.join('\n') + '\n');
  renameSync(tmpCsv, join(OUT, files.weights));
  const t1 = performance.now();
  console.log(
    `${m.name}: ${N.toLocaleString()} natural + ${tailBooks.toLocaleString()} tail (>= ${tail?.minPay ?? '-'}x of ${tailRounds.toLocaleString()} more rounds) + ${searched} searched max-win books ` +
      `(${natural} natural max wins, ${played.toLocaleString()} search rounds); natural RTP ${(rep.naturalRtp * 100).toFixed(2)}% (ex-cap ${(rep.naturalRtpExCap * 100).toFixed(2)}%), ` +
      `tilt KL ${rep.kl.toExponential(3)}, active [${rep.active.join(', ')}]; raw ${(rawBytes / 1e6).toFixed(0)} MB; sim ${((tSim - t0) / 1000).toFixed(1)}s, tail ${((tTail - tSim) / 1000).toFixed(1)}s, total ${((t1 - t0) / 1000).toFixed(1)}s`,
  );
  console.log(`  published: ${dashLine(rep.dashboard)}`);
  return { ...rep, rawBytes };
}

/** --reweight: recompute only the CSV weights from the published payouts (books untouched). */
function reweight() {
  const repPath = join(dirname(OUT), 'generate_report.json');
  const report = JSON.parse(readFileSync(repPath, 'utf8'));
  for (const m of MODES) {
    if (ONLY && !ONLY.includes(m.name)) continue;
    const f = fileNames(m.name);
    const rows = readFileSync(join(OUT, f.weights), 'utf8').split('\n').filter(Boolean);
    const pay = Int32Array.from(rows.map((r) => Number(r.split(',')[2])));
    const r = report[m.name];
    const nMain = r.naturalBooks as number;
    const tailEnd = nMain + ((r.tailBooks as number) ?? 0);
    const { w, rep } = computeWeights(m, pay, { nMain, tailEnd, gapEnd: tailEnd + ((r.gapBooks as number) ?? 0), tailRounds: (r.tailRounds as number) ?? 0, tailMinPay: (r.tailMinPay as number) ?? 0 });
    const tmp = join(OUT, `.${f.weights}.tmp`);
    writeFileSync(tmp, Array.from(pay, (p, i) => `${i + 1},${w[i]},${p}`).join('\n') + '\n');
    renameSync(tmp, join(OUT, f.weights));
    report[m.name] = { ...report[m.name], ...rep };
    console.log(`${m.name}: reweighted; tilt KL ${rep.kl.toExponential(3)}, active [${rep.active.join(', ')}], theta ${JSON.stringify(rep.theta)}`);
    console.log(`  published: ${dashLine(rep.dashboard)}`);
  }
  writeFileSync(repPath, JSON.stringify(report, null, 1) + '\n');
}

async function main() {
  if (values.reweight) return reweight();
  mkdirSync(OUT, { recursive: true });
  const pool = new Pool(NWORKERS);
  const report: Record<string, unknown> = { seed: SEED, counts: COUNTS, level: LEVEL, generatedAt: new Date().toISOString() };
  try {
    for (const m of MODES) {
      if (ONLY && !ONLY.includes(m.name)) continue;
      report[m.name] = await generateMode(pool, m);
    }
  } finally {
    await pool.close();
  }
  const index = { modes: MODES.map((m) => ({ name: m.name, cost: m.cost, events: fileNames(m.name).events, weights: fileNames(m.name).weights })) };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  const repPath = join(dirname(OUT), 'generate_report.json');
  writeFileSync(repPath, JSON.stringify(report, null, 1) + '\n');
  console.log(`wrote ${OUT} and ${repPath}`);
}

await main();
