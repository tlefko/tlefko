/**
 * Independent verifier for the published Stake Engine math. Reads ONLY the published files
 * (index.json, lookUpTable_<MODE>_0.csv, books_<MODE>.jsonl.zst) and re-derives everything; it does
 * not import the engine or the generator.
 *
 *   npx tsx tools/stake/verify.ts [--dir stake-math/publish] [--json out.json] [--stats src/stake/stats.json]
 *                                 [--csv-only] [--selftest]
 *
 * Besides the file checks it recomputes Stake's "Math Distribution & Summary" dashboard (tail
 * probabilities, CVaR, expected tail liability, base volatility, max payout, cost) at the 2-Star and
 * 3-Star tiers, and requires every 2-Star check to pass with a 10% margin (the max payout, 10,000x by
 * design, only needs to be within its limit). It also prints Stake's hit-rate range table per mode and
 * fails on an empty range between a mode's smallest payout and its max win.
 *
 * --csv-only skips decoding the books (fast; for iterating on weights). --selftest copies the
 * published files (hard links where untouched), corrupts one thing per case and requires every case
 * to FAIL.
 */
import { createReadStream, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { createZstdDecompress } from 'node:zlib';

const EXPECTED: Record<string, number> = { BASE: 1, BOOST: 1.5, WITCHING: 100, INFERNO: 400 };
/** Paid-spin modes (base game rules): hit-rate, sd and max-win ranges differ from the bonus buys. */
const SPIN_MODES = new Set(['BASE', 'BOOST']);

/** Exact fraction num / den for a mode cost (1.5 -> 3 / 2). */
function costFraction(cost: number): [bigint, bigint] {
  for (let den = 1; den <= 1000; den++) {
    const num = cost * den;
    if (Math.abs(num - Math.round(num)) < 1e-9) return [BigInt(Math.round(num)), BigInt(den)];
  }
  throw new Error(`cost ${cost} is not a simple fraction`);
}
const CAP = 1_000_000; // 10,000x in hundredths
const TARGET = 0.963;
const U64 = (1n << 64n) - 1n;

interface Check {
  mode: string;
  name: string;
  value: string;
  limit: string;
  pass: boolean;
  /** Non-blocking check: a miss prints WARN and does not fail the run. */
  warn?: boolean;
}

export interface ModeStats {
  books: number;
  rtp: number;
  rtpExact: boolean;
  hitRate: number;
  sd: number;
  maxWinProb: number;
  maxWinBooks: number;
  p5000: number;
  p10000: number;
  maxShare: number;
  zeroBooks: number;
  eventsBytes: number;
  weightsBytes: number;
  avgPayout: number;
}

/** One mode's published distribution: CSV weights and payouts (hundredths), in id order. */
export interface Dist {
  name: string;
  cost: number;
  weight: bigint[];
  pay: number[];
}

async function verifyMode(dir: string, name: string, cost: number, eventsFile: string, weightsFile: string, checks: Check[], books = true, dists?: Record<string, Dist>): Promise<ModeStats | null> {
  const add = (n: string, value: string, limit: string, pass: boolean, warn = false) => checks.push({ mode: name, name: n, value, limit, pass, warn });
  const csvPath = join(dir, weightsFile);
  const evPath = join(dir, eventsFile);
  let csvText: string;
  try {
    csvText = readFileSync(csvPath, 'utf8');
  } catch (e) {
    add('weights file readable', String(e), 'exists', false);
    return null;
  }
  // CSV: id,weight,payoutMultiplier, uint64, ids contiguous from 1
  const weight: bigint[] = [];
  const csvPay: number[] = [];
  let csvOk = true;
  let csvErr = '';
  const rows = csvText.split('\n').filter((l) => l.length > 0);
  for (let i = 0; i < rows.length; i++) {
    const parts = rows[i].split(',');
    if (parts.length !== 3 || !parts.every((x) => /^\d+$/.test(x))) {
      csvOk = false;
      csvErr = `row ${i + 1}: ${rows[i].slice(0, 60)}`;
      break;
    }
    const [id, w, p] = parts.map((x) => BigInt(x));
    if (id !== BigInt(i + 1)) {
      csvOk = false;
      csvErr = `row ${i + 1} has id ${id}`;
      break;
    }
    if (w > U64 || p > U64 || w === 0n) {
      csvOk = false;
      csvErr = `row ${i + 1}: weight/payout out of uint64 range or zero weight`;
      break;
    }
    weight.push(w);
    csvPay.push(Number(p));
  }
  add('CSV rows are uint64 id,weight,payout; ids 1..N', csvOk ? `${rows.length.toLocaleString()} rows` : csvErr, 'contiguous', csvOk);
  if (!csvOk) return null;
  const n = weight.length;
  add('books per mode', n.toLocaleString(), '<= 10,000,000', n <= 10_000_000 && n > 0);
  if (dists) dists[name] = { name, cost, weight, pay: csvPay };
  // books
  let count = 0;
  let idsOk = true;
  let payMatch = true;
  let finalOk = true;
  let schemaOk = true;
  let capOk = true;
  let firstErr = '';
  try {
    if (!books) throw new Error('skip');
    const rl = createInterface({ input: createReadStream(evPath).pipe(createZstdDecompress()), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      count++;
      let b: { id: unknown; events: unknown; payoutMultiplier: unknown };
      try {
        b = JSON.parse(line);
      } catch {
        schemaOk = false;
        firstErr ||= `line ${count}: invalid JSON`;
        continue;
      }
      if (!Number.isInteger(b.id) || !Array.isArray(b.events) || !Number.isInteger(b.payoutMultiplier) || (b.payoutMultiplier as number) < 0) {
        schemaOk = false;
        firstErr ||= `line ${count}: missing id/events/payoutMultiplier`;
        continue;
      }
      const id = b.id as number;
      const pay = b.payoutMultiplier as number;
      if (id !== count) {
        idsOk = false;
        firstErr ||= `line ${count}: id ${id}`;
      }
      if (csvPay[id - 1] !== pay) {
        payMatch = false;
        firstErr ||= `book ${id}: book payout ${pay} != CSV ${csvPay[id - 1]}`;
      }
      const ev = b.events as { type?: string; totalWin?: number; index?: number }[];
      const fin = ev[ev.length - 1];
      if (!fin || fin.type !== 'final' || typeof fin.totalWin !== 'number' || Math.round(fin.totalWin * 100) !== pay || ev[0]?.type !== 'spin' || !ev.every((e, k) => e.index === k)) {
        finalOk = false;
        firstErr ||= `book ${id}: events do not end in a matching final event`;
      }
      if (pay > CAP) {
        capOk = false;
        firstErr ||= `book ${id}: payout ${pay} above the cap`;
      }
    }
  } catch (e) {
    if (books) {
      schemaOk = false;
      firstErr ||= `decode: ${String(e).slice(0, 120)}`;
    }
  }
  if (books) {
    add('books decode; id, events, payoutMultiplier present', schemaOk ? 'ok' : firstErr, 'every line', schemaOk);
    add('book ids contiguous from 1, count == CSV rows', `${count.toLocaleString()} books`, `${n.toLocaleString()}`, idsOk && count === n);
    add('CSV payout == book payoutMultiplier (every id)', payMatch ? 'all match' : firstErr, 'exact', payMatch && count === n);
    add('payout == round(final.totalWin * 100)', finalOk ? 'all match' : firstErr, 'exact', finalOk);
  } else add('books (skipped: --csv-only)', 'not decoded', 'every line', true, true);
  const maxPay = csvPay.reduce((a, b) => (b > a ? b : a), 0);
  add('payout <= 1,000,000 (10,000x)', capOk ? `max ${maxPay}` : firstErr, '<= 1000000', capOk && maxPay <= CAP);
  // statistics from the CSV (now known to match the books)
  let T = 0n;
  let S = 0n;
  let S2 = 0n;
  let hitW = 0n;
  let capW = 0n;
  let w5000 = 0n;
  let w10000 = 0n;
  let maxW = 0n;
  let zeroBooks = 0;
  let capBooks = 0;
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    const p = BigInt(csvPay[i]);
    T += w;
    S += w * p;
    S2 += w * p * p;
    if (p > 0n) hitW += w;
    else zeroBooks++;
    if (p >= BigInt(CAP)) {
      capW += w;
      capBooks++;
    }
    if (p >= 500_000n) w5000 += w; // 5,000x
    if (p >= 1_000_000n) w10000 += w; // 10,000x
    if (w > maxW) maxW = w;
  }
  const f = (x: bigint) => Number(x) / Number(T);
  const [cNum, cDen] = costFraction(cost);
  const rtpExact = 10n * cDen * S === 963n * cNum * T;
  // RTP to ~1e-15 using BigInt scaling
  const rtp = Number((S * cDen * 10n ** 15n) / (T * 100n * cNum)) / 1e15;
  const meanH = Number((S * 10n ** 6n) / T) / 1e6; // hundredths
  const ex2 = Number((S2 * 10n ** 3n) / T) / 1e3; // hundredths^2
  const sd = Math.sqrt(Math.max(0, ex2 - meanH * meanH)) / 100; // bet multiples
  const hit = f(hitW);
  const pMax = f(capW);
  const p5000 = f(w5000);
  const p10000 = f(w10000);
  const maxShare = f(maxW);
  add('RTP', `${(rtp * 100).toFixed(6)}%${rtpExact ? ' (exact)' : ''}`, '96.3000% exactly', rtpExact);
  const hitRange = name === 'BASE' ? [0.4, 0.55] : name === 'BOOST' ? [0.5, 0.75] : [1 / 50, 1];
  add('hit rate (P(win > 0))', `${(hit * 100).toFixed(3)}%`, SPIN_MODES.has(name) ? `${hitRange[0] * 100}%..${hitRange[1] * 100}%` : '>= 2%', hit >= hitRange[0] && hit <= hitRange[1]);
  if (name === 'BASE') add('standard deviation (x bet)', sd.toFixed(3), '0.6..50', sd >= 0.6 && sd <= 50);
  else if (name === 'BOOST') add('standard deviation (x bet) [non-critical]', sd.toFixed(3), '0.6..75', sd >= 0.6 && sd <= 75, true);
  else add('standard deviation (x bet)', sd.toFixed(3), 'info', true);
  const maxRange = name === 'BASE' || name === 'BOOST' ? [1 / 30_000_000, 1 / 10_000_000] : name === 'WITCHING' ? [1 / 1_000_000, 1 / 100_000] : [1 / 100_000, 1 / 10_000];
  add('max win (10,000x) probability', `1 in ${(1 / pMax).toFixed(0)} (${capBooks} books)`, `1 in ${(1 / maxRange[1]).toFixed(0)}..${(1 / maxRange[0]).toFixed(0)}`, capBooks > 0 && pMax >= maxRange[0] * 0.999 && pMax <= maxRange[1] * 1.001);
  add('P(>= 5,000x) [non-critical]', p5000.toExponential(3), '<= 0.010', p5000 <= 0.01, true);
  add('P(>= 10,000x) [non-critical]', p10000.toExponential(3), '<= 0.005', p10000 <= 0.005, true);
  add('most likely book share', `${(maxShare * 100).toExponential(3)}%`, '<= 1%', maxShare <= 0.01);
  const eventsBytes = statSync(evPath).size;
  const weightsBytes = statSync(csvPath).size;
  return {
    books: n,
    rtp,
    rtpExact,
    hitRate: hit,
    sd,
    maxWinProb: pMax,
    maxWinBooks: capBooks,
    p5000,
    p10000,
    maxShare,
    zeroBooks,
    eventsBytes,
    weightsBytes,
    avgPayout: meanH / 100,
  };
}


// ---------------------------------------------------------------------------------------------
// Stake "Math Distribution & Summary" dashboard
// ---------------------------------------------------------------------------------------------

/** Raw tail thresholds (base-bet multiples, not scaled by cost). */
export const TAIL_T = [5000, 10000, 25000, 50000, 100000] as const;
/** CVaR level: the worst (highest-paying) 0.1% of the probability mass. */
export const CVAR_ALPHA = 0.001;
/** Stake's hit-rate ranges (base-bet multiples): (0, 0.1) then [lo, hi). */
export const RANGES: readonly [number, number][] = [
  [0, 0.1], [0.1, 1], [1, 2], [2, 5], [5, 10], [10, 20], [20, 50], [50, 100], [100, 200], [200, 500], [500, 1000],
  [1000, 2000], [2000, 5000], [5000, 10000], [10000, 20000], [20000, 50000], [50000, 100000],
];
export const rangeOf = (x: number): number => {
  if (!(x > 0)) return -1;
  for (let i = 0; i < RANGES.length; i++) if (x < RANGES[i][1]) return i;
  return RANGES.length; // beyond the table
};
export const rangeLabel = (i: number) => `(${RANGES[i][0]},${RANGES[i][1]})`;

export interface RangeRow {
  label: string;
  books: number;
  prob: number;
  rtp: number;
}

export interface ModeRisk {
  name: string;
  cost: number;
  rtp: number;
  hit: number;
  sd: number;
  maxPay: number;
  tail: Record<number, number>;
  /** Mean payout (base-bet multiples) of the worst CVAR_ALPHA of the probability mass. */
  cvar: number;
  cvarPerStake: number;
  /** Share of RTP from wins above 40x / 10,000x the mode cost, their sum, and the >40x-cost tail in base-bet multiples. */
  etl40: number;
  etl10k: number;
  etlSum: number;
  etlAbs: number;
  ranges: RangeRow[];
  /** Ranges between the smallest payout's range and the max win's range that hold no weighted outcome. */
  gaps: string[];
}

/** Every dashboard metric of one mode, from its published weights and payouts. */
export function riskOf(d: Dist): ModeRisk {
  const n = d.weight.length;
  let T = 0n;
  for (const w of d.weight) T += w;
  const tot = Number(T);
  const p = new Float64Array(n);
  const x = new Float64Array(n);
  let m1 = 0;
  let m2 = 0;
  let hit = 0;
  let maxPay = 0;
  const tail: Record<number, number> = {};
  for (const t of TAIL_T) tail[t] = 0;
  const rows: RangeRow[] = RANGES.map((_, i) => ({ label: rangeLabel(i), books: 0, prob: 0, rtp: 0 }));
  let etl40 = 0;
  let etl10k = 0;
  for (let i = 0; i < n; i++) {
    const pi = Number(d.weight[i]) / tot;
    const xi = d.pay[i] / 100;
    p[i] = pi;
    x[i] = xi;
    if (pi <= 0) continue;
    m1 += pi * xi;
    m2 += pi * xi * xi;
    if (xi > 0) hit += pi;
    if (xi > maxPay) maxPay = xi;
    for (const t of TAIL_T) if (xi >= t) tail[t] += pi;
    if (xi > 40 * d.cost) etl40 += pi * xi;
    if (xi > 10000 * d.cost) etl10k += pi * xi;
    const r = rangeOf(xi);
    if (r >= 0 && r < rows.length) {
      rows[r].books++;
      rows[r].prob += pi;
      rows[r].rtp += (pi * xi) / d.cost;
    }
  }
  // CVaR: highest payouts first until CVAR_ALPHA of the mass is covered (the boundary book counts in part)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => x[b] - x[a]);
  let cum = 0;
  let acc = 0;
  for (const i of order) {
    if (p[i] <= 0) continue;
    const take = Math.min(p[i], CVAR_ALPHA - cum);
    acc += take * x[i];
    cum += take;
    if (cum >= CVAR_ALPHA - 1e-18) break;
  }
  const cvar = acc / CVAR_ALPHA;
  // gaps: every range from the smallest payout's up to the max win's must hold weighted outcomes
  const occupied = rows.map((r) => r.prob > 0);
  const lo = occupied.indexOf(true);
  const hi = rangeOf(maxPay);
  const gaps: string[] = [];
  for (let r = lo; r >= 0 && r <= Math.min(hi, rows.length - 1); r++) if (!occupied[r]) gaps.push(rows[r].label);
  return {
    name: d.name,
    cost: d.cost,
    rtp: m1 / d.cost,
    hit,
    sd: Math.sqrt(Math.max(0, m2 - m1 * m1)),
    maxPay,
    tail,
    cvar,
    cvarPerStake: cvar / d.cost,
    etl40: m1 > 0 ? etl40 / m1 : 0,
    etl10k: m1 > 0 ? etl10k / m1 : 0,
    etlSum: m1 > 0 ? (etl40 + etl10k) / m1 : 0,
    etlAbs: etl40,
    ranges: rows,
    gaps,
  };
}

export const TIER_NAMES = ['2-Star', '3-Star'] as const;
/** Required headroom against the 2-Star limits. */
export const MARGIN = 0.1;

export interface DashRow {
  check: string;
  cls: string;
  /** Worst mode's value and which mode it is. */
  value: number;
  mode: string;
  limits: [number, number];
  pass: [boolean, boolean];
  /** Headroom against the 2-Star limit: 1 - value / limit. */
  margin: number;
  /** false where the margin rule does not apply (the max payout is 10,000x by design). */
  needsMargin: boolean;
}

export interface Dashboard {
  rows: DashRow[];
  critical: { check: string; value: string; pass: boolean }[];
  failing: [string[], string[]];
  /** Every 2-Star check passes and every margin rule holds. */
  pass2Margin: boolean;
}

export function dashboard(risks: ModeRisk[]): Dashboard {
  const rows: DashRow[] = [];
  const worst = (f: (r: ModeRisk) => number) => {
    let best = risks[0];
    for (const r of risks) if (f(r) > f(best)) best = r;
    return { value: f(best), mode: best.name };
  };
  const add = (check: string, cls: string, w: { value: number; mode: string }, limits: [number, number], needsMargin = true) =>
    rows.push({ check, cls, value: w.value, mode: w.mode, limits, pass: [w.value <= limits[0], w.value <= limits[1]], margin: 1 - w.value / limits[0], needsMargin });
  add('Max Payout Multiplier', 'Max Payout', worst((r) => r.maxPay), [50000, 100000], false);
  add('Cost Multiplier', 'Cost Multiplier', worst((r) => r.cost), [1000, 2000]);
  const base = risks.find((r) => r.name === 'BASE') ?? risks.find((r) => r.cost === 1)!;
  add('Base Std Dev', 'Base Volatility', { value: base.sd, mode: base.name }, [50, 60]);
  const tailLim: Record<number, [number, number]> = { 5000: [0.01, 0.05], 10000: [0.005, 0.01], 25000: [0.002, 0.005], 50000: [0.001, 0.001], 100000: [0.0005, 0.0005] };
  for (const t of TAIL_T) add(`P(>=${t.toLocaleString('en-US')}x)`, 'Tail Probability', worst((r) => r.tail[t]), tailLim[t]);
  add('CVaR per-stake (CVaR / cost)', 'Risk Limit', worst((r) => r.cvarPerStake), [700, 700]);
  add('CVaR absolute (x base bet)', 'Risk Limit', worst((r) => r.cvar), [20000, 50000]);
  add('ETL > 40x cost (share of RTP)', 'Expected Tail Liability', worst((r) => r.etl40), [0.8, 0.9]);
  add('ETL > 10,000x cost (share of RTP)', 'Expected Tail Liability', worst((r) => r.etl10k), [0.6, 0.8]);
  add('ETL sum', 'Expected Tail Liability', worst((r) => r.etlSum), [1.3, 1.5]);
  add('ETL absolute (x base bet)', 'Expected Tail Liability', worst((r) => r.etlAbs), [3000, 10000]);
  const rtps = risks.map((r) => r.rtp);
  const spread = Math.max(...rtps) - Math.min(...rtps);
  const minCost = Math.min(...risks.map((r) => r.cost));
  const critical = [
    { check: 'base mode (cost 1.0) is the cheapest', value: `base cost ${base.cost}, cheapest ${minCost}`, pass: base.cost === 1 && minCost === 1 },
    { check: 'base std dev >= 0.6', value: base.sd.toFixed(3), pass: base.sd >= 0.6 },
    { check: 'RTP 90%..96.7% in every mode', value: risks.map((r) => `${r.name} ${(r.rtp * 100).toFixed(4)}%`).join(', '), pass: risks.every((r) => r.rtp >= 0.9 && r.rtp <= 0.967) },
    { check: 'cross-mode RTP spread <= 0.5%', value: `${(spread * 100).toFixed(6)}%`, pass: spread <= 0.005 },
    { check: 'a non-zero win at least once in 50 spins', value: risks.map((r) => `${r.name} 1 in ${(1 / r.hit).toFixed(2)}`).join(', '), pass: risks.every((r) => r.hit >= 1 / 50) },
  ];
  const failing: [string[], string[]] = [[], []];
  for (const t of [0, 1] as const) failing[t] = [...new Set(rows.filter((r) => !r.pass[t]).map((r) => r.cls))];
  const pass2Margin = rows.every((r) => r.pass[0] && (!r.needsMargin || r.margin >= MARGIN - 1e-12)) && critical.every((c) => c.pass);
  return { rows, critical, failing, pass2Margin };
}

const fmtV = (v: number) => (Math.abs(v) >= 100 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : Math.abs(v) >= 1 ? v.toFixed(3) : v === 0 ? '0' : v.toExponential(3));

export function printDashboard(d: Dashboard, risks: ModeRisk[]) {
  const w = [34, 26, 11, 10, 9, 9, 9, 24];
  const line = (a: string[]) => a.map((x, i) => x.padEnd(w[i])).join(' ');
  console.log('\nStake Math Distribution & Summary: dashboard (worst mode per check)');
  console.log(line(['check', 'value (mode)', '2-Star', '3-Star', '2-Star', '3-Star', 'margin', 'class']));
  console.log('-'.repeat(140));
  for (const r of d.rows) {
    const m = `${(r.margin * 100).toFixed(1)}%${r.needsMargin && r.margin < MARGIN ? ' LOW' : ''}`;
    console.log(line([r.check, `${fmtV(r.value)} (${r.mode})`, fmtV(r.limits[0]), fmtV(r.limits[1]), r.pass[0] ? 'PASS' : 'FAIL', r.pass[1] ? 'PASS' : 'FAIL', r.needsMargin ? m : 'n/a', r.cls]));
  }
  for (const c of d.critical) console.log(line([`[critical] ${c.check}`.slice(0, 34), c.value.slice(0, 26), '', '', c.pass ? 'PASS' : 'FAIL', c.pass ? 'PASS' : 'FAIL', '', 'critical']));
  for (const t of [0, 1] as const) console.log(`${TIER_NAMES[t]} failing classes: ${d.failing[t].length} ${d.failing[t].length ? `(${d.failing[t].join(', ')})` : ''}`);
  console.log(`2-Star with ${MARGIN * 100}% margin: ${d.pass2Margin ? 'PASS' : 'FAIL'}`);
  console.log('\nper mode:');
  console.log(['mode', 'cost', 'RTP', 'hit', 'sd', 'max', ...TAIL_T.map((t) => `P>=${t / 1000}k`), 'CVaR', 'CVaR/c', 'ETL40', 'ETL10k', 'ETLabs'].map((x, i) => x.padEnd(i === 0 ? 9 : 10)).join(''));
  for (const r of risks) {
    console.log(
      [r.name, String(r.cost), `${(r.rtp * 100).toFixed(4)}%`, `${(r.hit * 100).toFixed(2)}%`, r.sd.toFixed(2), fmtV(r.maxPay), ...TAIL_T.map((t) => fmtV(r.tail[t])), fmtV(r.cvar), fmtV(r.cvarPerStake), r.etl40.toFixed(4), r.etl10k.toFixed(4), fmtV(r.etlAbs)]
        .map((x, i) => x.padEnd(i === 0 ? 9 : 10))
        .join(''),
    );
  }
  for (const r of risks) {
    console.log(`\n${r.name} hit-rate ranges (x base bet)${r.gaps.length ? `  GAPS: ${r.gaps.join(' ')}` : '  no gaps'}`);
    console.log(`${'range'.padEnd(16)}${'books'.padStart(9)}${'probability'.padStart(14)}${'1 in'.padStart(14)}${'RTP share'.padStart(12)}`);
    for (const row of r.ranges) {
      console.log(`${row.label.padEnd(16)}${String(row.books).padStart(9)}${(row.prob ? row.prob.toExponential(4) : '0').padStart(14)}${(row.prob ? (1 / row.prob).toLocaleString('en-US', { maximumFractionDigits: row.prob > 0.01 ? 2 : 0 }) : '-').padStart(14)}${`${(row.rtp * 100).toFixed(3)}%`.padStart(12)}`);
    }
  }
}

export async function verify(dir: string, onlyModes?: string[], books = true): Promise<{ pass: boolean; checks: Check[]; stats: Record<string, ModeStats>; totalBytes: number; dashboard?: Dashboard; risks: ModeRisk[] }> {
  const checks: Check[] = [];
  const stats: Record<string, ModeStats> = {};
  const dists: Record<string, Dist> = {};
  let index: { modes?: { name?: unknown; cost?: unknown; events?: unknown; weights?: unknown }[] };
  try {
    index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  } catch (e) {
    checks.push({ mode: '-', name: 'index.json parses', value: String(e).slice(0, 80), limit: 'valid JSON', pass: false });
    return { pass: false, checks, stats, totalBytes: 0, risks: [] };
  }
  const modes = Array.isArray(index.modes) ? index.modes : [];
  const schema =
    modes.length === Object.keys(EXPECTED).length &&
    modes.every((m) => typeof m.name === 'string' && typeof m.cost === 'number' && typeof m.events === 'string' && typeof m.weights === 'string') &&
    modes.every((m) => EXPECTED[m.name as string] === m.cost && m.events === `books_${m.name}.jsonl.zst` && m.weights === `lookUpTable_${m.name}_0.csv`);
  checks.push({ mode: '-', name: 'index.json schema (name, cost, events, weights)', value: modes.map((m) => `${m.name}:${m.cost}`).join(' '), limit: 'BASE:1 BOOST:1.5 WITCHING:100 INFERNO:400', pass: schema && Object.keys(EXPECTED).every((k) => modes.some((m) => m.name === k)) });
  for (const m of modes) {
    if (typeof m.name !== 'string' || typeof m.cost !== 'number') continue;
    if (onlyModes && !onlyModes.includes(m.name)) continue;
    const s = await verifyMode(dir, m.name, m.cost, String(m.events), String(m.weights), checks, books, dists);
    if (s) stats[m.name] = s;
  }
  const rtps = Object.values(stats).map((s) => s.rtp);
  if (rtps.length > 1) {
    const spread = Math.max(...rtps) - Math.min(...rtps);
    checks.push({ mode: '-', name: 'cross-mode RTP spread', value: `${(spread * 100).toFixed(6)}%`, limit: '<= 0.5%', pass: spread <= 0.005 });
  }
  let totalBytes = 0;
  for (const f of readdirSync(dir)) totalBytes += statSync(join(dir, f)).size;
  checks.push({ mode: '-', name: 'total upload size', value: `${(totalBytes / 1e6).toFixed(1)} MB`, limit: '<= 4.2 GB', pass: totalBytes <= 4.2e9 });
  const rtpOk = Object.values(stats).every((s) => Math.abs(s.rtp - TARGET) < 1e-9);
  checks.push({ mode: '-', name: 'every mode RTP == 96.30%', value: Object.entries(stats).map(([k, s]) => `${k} ${(s.rtp * 100).toFixed(4)}%`).join(', '), limit: '96.30%', pass: rtpOk && Object.keys(stats).length > 0 });
  // Stake dashboard (needs every mode)
  const risks = Object.values(dists).map(riskOf);
  let dash: Dashboard | undefined;
  if (!onlyModes && risks.length === Object.keys(EXPECTED).length) {
    dash = dashboard(risks);
    const r2 = dash.rows.filter((r) => !r.pass[0] || (r.needsMargin && r.margin < MARGIN));
    checks.push({ mode: '-', name: `Stake dashboard: every 2-Star check with ${MARGIN * 100}% margin`, value: r2.length ? r2.map((r) => `${r.check} ${fmtV(r.value)}`).join('; ') : `0 failing classes`, limit: '2-Star, margin >= 10%', pass: dash.pass2Margin });
    checks.push({ mode: '-', name: 'Stake dashboard: 3-Star [non-critical]', value: dash.failing[1].length ? dash.failing[1].join(', ') : '0 failing classes', limit: '0 failing classes', pass: dash.failing[1].length === 0, warn: true });
    for (const r of risks) checks.push({ mode: r.name, name: 'hit-rate ranges: none empty up to the max win', value: r.gaps.length ? `empty ${r.gaps.join(' ')}` : 'no gaps', limit: 'smallest payout .. max win', pass: r.gaps.length === 0 });
  }
  return { pass: checks.every((c) => c.pass || c.warn), checks, stats, totalBytes, dashboard: dash, risks };
}

function printTable(checks: Check[]) {
  const w = [9, 50, 44, 34];
  const line = (a: string[]) => a.map((x, i) => x.padEnd(w[i])).join(' ') ;
  console.log(line(['mode', 'check', 'value', 'limit']) + ' result');
  console.log('-'.repeat(140));
  for (const c of checks) console.log(line([c.mode, c.name.slice(0, 50), c.value.slice(0, 44), c.limit.slice(0, 34)]) + ' ' + (c.pass ? 'PASS' : c.warn ? 'WARN' : 'FAIL'));
}

async function selftest(dir: string) {
  const base = mkdtempSync(join(dir, '..', '.verify-selftest-'));
  const clone = (name: string) => {
    const d = join(base, name);
    mkdirSync(d);
    for (const f of readdirSync(dir)) linkSync(join(dir, f), join(d, f));
    return d;
  };
  const replace = (d: string, f: string, data: string | Buffer) => {
    rmSync(join(d, f));
    writeFileSync(join(d, f), data);
  };
  const csv = readFileSync(join(dir, 'lookUpTable_WITCHING_0.csv'), 'utf8').split('\n');
  const cases: { name: string; mode: string; make: (d: string) => void }[] = [
    {
      name: 'CSV payout differs from the book',
      mode: 'WITCHING',
      make: (d) => {
        const c = csv.slice();
        const [id, w, p] = c[10].split(',');
        c[10] = `${id},${w},${Number(p) + 5}`;
        replace(d, 'lookUpTable_WITCHING_0.csv', c.join('\n'));
      },
    },
    {
      name: 'one weight changed (RTP no longer exact)',
      mode: 'WITCHING',
      make: (d) => {
        const c = csv.slice();
        const i = c.findIndex((l) => l && !l.endsWith(',0'));
        const [id, w, p] = c[i].split(',');
        c[i] = `${id},${BigInt(w) + 1n},${p}`;
        replace(d, 'lookUpTable_WITCHING_0.csv', c.join('\n'));
      },
    },
    {
      name: 'CSV row missing (ids not contiguous)',
      mode: 'WITCHING',
      make: (d) => {
        const c = csv.slice();
        c.splice(5, 1);
        replace(d, 'lookUpTable_WITCHING_0.csv', c.join('\n'));
      },
    },
    {
      name: 'truncated books file',
      mode: 'WITCHING',
      make: (d) => {
        const buf = readFileSync(join(dir, 'books_WITCHING.jsonl.zst'));
        replace(d, 'books_WITCHING.jsonl.zst', buf.subarray(0, Math.floor(buf.length / 3)));
      },
    },
    {
      name: 'index.json wrong cost',
      mode: 'NONE',
      make: (d) => {
        const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
        idx.modes[1].cost = 99;
        replace(d, 'index.json', JSON.stringify(idx));
      },
    },
  ];
  let ok = true;
  for (const [k, c] of cases.entries()) {
    const d = clone(`case${k}`);
    c.make(d);
    const res = await verify(d, [c.mode]);
    const failed = res.checks.filter((x) => !x.pass && !x.warn).map((x) => `${x.mode} ${x.name}`);
    console.log(`selftest: ${c.name.padEnd(45)} -> ${res.pass ? 'PASS (BAD: corruption not detected)' : `FAIL as expected [${failed.join('; ')}]`}`);
    if (res.pass) ok = false;
  }
  rmSync(base, { recursive: true, force: true });
  console.log(ok ? 'SELFTEST PASS: every corruption was detected' : 'SELFTEST FAIL');
  if (!ok) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith('verify.ts');
if (isMain) {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'stake-math/publish' }, json: { type: 'string' }, stats: { type: 'string' }, selftest: { type: 'boolean', default: false }, 'csv-only': { type: 'boolean', default: false } } });
  const dir = resolve(values.dir!);
  if (values.selftest) {
    await selftest(dir);
  } else {
    const t0 = performance.now();
    const res = await verify(dir, undefined, !values['csv-only']);
    printTable(res.checks);
    if (res.dashboard) printDashboard(res.dashboard, res.risks);
    console.log('');
    for (const [m, s] of Object.entries(res.stats)) {
      console.log(
        `${m.padEnd(9)} books ${s.books.toLocaleString().padStart(9)}  RTP ${(s.rtp * 100).toFixed(4)}%  hit ${(s.hitRate * 100).toFixed(2)}%  sd ${s.sd.toFixed(2)}x  ` +
          `max win 1 in ${(1 / s.maxWinProb).toFixed(0)}  P(>=5000x) ${s.p5000.toExponential(2)}  P(>=10000x) ${s.p10000.toExponential(2)}  ` +
          `events ${(s.eventsBytes / 1e6).toFixed(1)} MB  csv ${(s.weightsBytes / 1e6).toFixed(1)} MB`,
      );
    }
    console.log(`\n${res.pass ? 'PASS' : 'FAIL'}  (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
    if (values.json) writeFileSync(values.json, JSON.stringify(res, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
    if (values['csv-only']) console.log('(--csv-only: books were not decoded; run without it before publishing)');
    if (values.stats && res.pass) {
      // Player-facing summary for the UI (src/stake/stats.json), written atomically.
      const out: Record<string, unknown> = {};
      for (const [m, s] of Object.entries(res.stats)) {
        out[m] = {
          rtp: Math.round(s.rtp * 1e6) / 1e6,
          maxWin: CAP / 100,
          cost: EXPECTED[m],
          hitRate: Math.round(s.hitRate * 1e5) / 1e5,
          maxWinOdds: Math.round(1 / s.maxWinProb),
          sd: Math.round(s.sd * 100) / 100,
          books: s.books,
        };
      }
      const tmp = `${values.stats}.tmp`;
      writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
      renameSync(tmp, values.stats);
      console.log(`wrote ${values.stats}`);
    }
    if (!res.pass) process.exitCode = 1;
  }
}
