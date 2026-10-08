/**
 * Demo pack for the static site (DemoRgs in src/stake/rgs.ts): a small weighted subset of the
 * published books per mode.
 *
 *   npx tsx tools/stake/demo.ts [--dir stake-math/publish] [--scenarios stake-math/scenarios.json]
 *                               [--out public/demo-books] [--base 1500] [--buys 150] [--budget 9000000]
 *
 * Per mode: payout buckets get books in proportion to their published probability (at least one per
 * non-empty bucket), picked deterministically, preferring books no larger than the bucket's size
 * quantile (keeps the pack small); every scenario book is included. A book in bucket b weighs
 * P(b) / (books picked in b); a final one-parameter exponential tilt in the payout puts the pack RTP
 * on 96.30% (within 0.3% after integer rounding). Output: <out>/<MODE>.json =
 * {"mode","cost","books":[{"w":int,"b":<book>}]}. Stale files in <out> are deleted first.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BUCKETS, MODES, TARGET_RTP, bucketOf, fileNames, isSpinMode, parseCsv, readBooks, type ModeSpec } from './common';
import type { ScenarioFile } from './scenarios';

const { values } = parseArgs({
  options: {
    dir: { type: 'string', default: 'stake-math/publish' },
    scenarios: { type: 'string' },
    out: { type: 'string', default: 'public/demo-books' },
    base: { type: 'string', default: '1500' },
    buys: { type: 'string', default: '150' },
    budget: { type: 'string', default: '9000000' },
  },
});
const DIR = resolve(values.dir!);
const OUT = resolve(values.out!);
const SCEN = resolve(values.scenarios ?? join(dirname(DIR), 'scenarios.json'));
const BUDGET = Number(values.budget);
const PACK_TOTAL = 1e12;

/** Deterministic hash for ordering candidates. */
function h32(x: number): number {
  let z = Math.imul(x ^ 0x5bd1e995, 0x9e3779b1);
  z = Math.imul(z ^ (z >>> 15), 0x85ebca6b);
  return (z ^ (z >>> 13)) >>> 0;
}

interface ModeData {
  m: ModeSpec;
  prob: Float64Array;
  pay: number[];
  bucket: Int32Array;
  bytes: Int32Array;
}

async function load(m: ModeSpec): Promise<ModeData> {
  const f = fileNames(m.name);
  const { weight, pay } = parseCsv(readFileSync(join(DIR, f.weights), 'utf8'));
  let T = 0n;
  for (const w of weight) T += w;
  const n = weight.length;
  const prob = new Float64Array(n);
  const bucket = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    prob[i] = Number((weight[i] * 10n ** 18n) / T) / 1e18;
    bucket[i] = bucketOf(pay[i]);
  }
  const bytes = new Int32Array(n);
  for await (const { book, line } of readBooks(join(DIR, f.events))) bytes[book.id - 1] = line.length;
  return { m, prob, pay, bucket, bytes };
}

function select(d: ModeData, target: number, quantile: number, forced: Set<number>): Map<number, number[]> {
  const n = d.pay.length;
  const pb = new Float64Array(BUCKETS);
  const members: number[][] = Array.from({ length: BUCKETS }, () => []);
  for (let i = 0; i < n; i++) {
    pb[d.bucket[i]] += d.prob[i];
    members[d.bucket[i]].push(i);
  }
  const chosen = new Map<number, number[]>();
  for (let b = 0; b < BUCKETS; b++) {
    const mem = members[b];
    if (!mem.length || pb[b] <= 0) continue;
    const want = Math.min(mem.length, Math.max(1, Math.round(target * pb[b])));
    const sizes = mem.map((i) => d.bytes[i]).sort((x, y) => x - y);
    const limit = sizes[Math.min(sizes.length - 1, Math.floor(quantile * (sizes.length - 1)))];
    const order = mem.slice().sort((x, y) => h32(x + 1) - h32(y + 1) || x - y);
    const pick: number[] = mem.filter((i) => forced.has(i + 1));
    let extra = 0;
    for (const i of order) {
      if (extra >= want) break;
      if (forced.has(i + 1) || d.bytes[i] > limit || d.prob[i] <= 0) continue;
      pick.push(i);
      extra++;
    }
    if (pick.length === 0) pick.push(order.find((i) => d.prob[i] > 0) ?? order[0]);
    chosen.set(b, pick);
  }
  return chosen;
}

function packWeights(d: ModeData, chosen: Map<number, number[]>): { ids: number[]; w: number[]; rtp: number } {
  const pb = new Float64Array(BUCKETS);
  for (let i = 0; i < d.pay.length; i++) pb[d.bucket[i]] += d.prob[i];
  const ids: number[] = [];
  const base: number[] = [];
  const x: number[] = [];
  for (const [b, pick] of chosen) {
    for (const i of pick) {
      ids.push(i);
      base.push(pb[b] / pick.length);
      x.push(d.pay[i] / 100 / d.m.cost);
    }
  }
  const rtpAt = (theta: number) => {
    let s = 0;
    let t = 0;
    for (let k = 0; k < ids.length; k++) {
      const w = base[k] * Math.exp(theta * x[k]);
      s += w * x[k];
      t += w;
    }
    return s / t;
  };
  const xmax = Math.max(...x);
  let lo = -20 / xmax;
  let hi = 20 / xmax;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (rtpAt(mid) < TARGET_RTP) lo = mid;
    else hi = mid;
  }
  const theta = (lo + hi) / 2;
  const raw = base.map((b, k) => b * Math.exp(theta * x[k]));
  const tot = raw.reduce((a, b) => a + b, 0);
  const w = raw.map((r) => Math.max(1, Math.round((r / tot) * PACK_TOTAL)));
  let s = 0;
  let t = 0;
  for (let k = 0; k < w.length; k++) {
    s += w[k] * x[k];
    t += w[k];
  }
  return { ids, w, rtp: s / t };
}

async function main() {
  const scen: ScenarioFile = existsSync(SCEN) ? JSON.parse(readFileSync(SCEN, 'utf8')) : {};
  const data: ModeData[] = [];
  for (const m of MODES) data.push(await load(m));
  // choose per-mode picks, shrinking the buy packs' size quantile until the total fits the budget
  let quantile = 0.6;
  let buyTarget = Number(values.buys);
  let plan: { d: ModeData; ids: number[]; w: number[]; rtp: number; bytes: number }[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    plan = [];
    for (const d of data) {
      const forced = new Set<number>();
      for (const [k, v] of Object.entries(scen[d.m.name] ?? {})) if (k !== 'missing' && v && typeof v === 'object' && 'id' in v) forced.add((v as { id: number }).id);
      const target = isSpinMode(d.m) ? Number(values.base) : buyTarget;
      const q = isSpinMode(d.m) ? Math.min(0.8, quantile + 0.2) : quantile;
      const chosen = select(d, target, q, forced);
      const pw = packWeights(d, chosen);
      const bytes = pw.ids.reduce((a, i) => a + d.bytes[i] + 30, 0);
      plan.push({ d, ...pw, bytes });
    }
    const total = plan.reduce((a, p) => a + p.bytes, 0);
    if (total <= BUDGET) break;
    // shrink the size quantile first, then the number of buy books
    if (quantile > 0.15) quantile *= 0.8;
    else buyTarget = Math.max(60, Math.floor(buyTarget * 0.92));
  }
  // write
  mkdirSync(OUT, { recursive: true });
  const stale = new Set(readdirSync(OUT));
  const want = new Map<string, Map<number, number>>(); // mode -> id -> weight
  for (const p of plan) want.set(p.d.m.name, new Map(p.ids.map((i, k) => [i + 1, p.w[k]])));
  let total = 0;
  for (const p of plan) {
    const m = p.d.m;
    const ws = want.get(m.name)!;
    const parts: string[] = [];
    for await (const { book, line } of readBooks(join(DIR, fileNames(m.name).events))) {
      const w = ws.get(book.id);
      if (w !== undefined) parts.push(`{"w":${w},"b":${line}}`);
    }
    if (parts.length !== ws.size) throw new Error(`${m.name}: missing books in pack`);
    const text = `{"mode":"${m.name}","cost":${m.cost},"books":[\n${parts.join(',\n')}\n]}\n`;
    const dest = join(OUT, `${m.name}.json`);
    writeFileSync(`${dest}.tmp`, text);
    renameSync(`${dest}.tmp`, dest);
    stale.delete(`${m.name}.json`);
    total += text.length;
    const dev = p.rtp / TARGET_RTP - 1;
    if (Math.abs(dev) > 0.003) throw new Error(`${m.name}: pack RTP ${p.rtp} off by ${(dev * 100).toFixed(3)}%`);
    console.log(`${m.name}: ${parts.length} books, RTP ${(p.rtp * 100).toFixed(3)}% (${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(3)}%), ${(text.length / 1e6).toFixed(2)} MB`);
  }
  for (const f of stale) rmSync(join(OUT, f), { force: true, recursive: true });
  console.log(`total ${(total / 1e6).toFixed(2)} MB in ${OUT}${stale.size ? ` (removed stale: ${[...stale].join(', ')})` : ''}`);
}

await main();
