/**
 * Shared constants for the Stake Engine math pipeline (generate.ts, scenarios.ts, demo.ts).
 * verify.ts deliberately does NOT import this file: it re-derives everything from the published files.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createZstdDecompress } from 'node:zlib';
import type { RoundKind } from '../../src/math/types';
import type { Book, StakeMode } from '../../src/stake/book';

export type ModeName = StakeMode;

export interface ModeSpec {
  name: ModeName;
  kind: RoundKind;
  /** Cost in bet multiples; costNum / costDen as an exact fraction (BOOST 1.5 = 3 / 2). */
  cost: number;
  costNum: bigint;
  costDen: bigint;
  index: number;
  /** Probability pinned on the 10,000x (max-win) books, shared evenly between them. */
  maxWinProb: number;
  /** Minimum number of distinct max-win books in the published mode. */
  minMaxWinBooks: number;
  /** Published hit-rate bounds (tilt constraint). */
  hit: [number, number];
  /** Upper bound on the standard deviation in bet multiples (Stake's base volatility check; BASE only). */
  sdMax?: number;
  /**
   * Stratified tail sample: `rounds` extra natural rounds whose win is at least `minPay` (bet multiples,
   * a tilt bucket edge) become books too. The tail buckets' probabilities are then estimated from the
   * main sample plus these rounds, and the top of the distribution holds many distinct books.
   */
  tail?: { rounds: number; minPay: number };
}

export const MODES: readonly ModeSpec[] = [
  { name: 'BASE', kind: 'base', cost: 1, costNum: 1n, costDen: 1n, index: 0, maxWinProb: 1 / 20_000_000, minMaxWinBooks: 12, hit: [0.4, 0.55], sdMax: 44, tail: { rounds: 12_000_000, minPay: 500 } },
  { name: 'BOOST', kind: 'boost', cost: 1.5, costNum: 3n, costDen: 2n, index: 3, maxWinProb: 1 / 20_000_000, minMaxWinBooks: 12, hit: [0.5, 0.75], tail: { rounds: 12_000_000, minPay: 500 } },
  { name: 'WITCHING', kind: 'buy_witching', cost: 100, costNum: 100n, costDen: 1n, index: 1, maxWinProb: 1 / 300_000, minMaxWinBooks: 12, hit: [1 / 50, 1], tail: { rounds: 600_000, minPay: 2000 } },
  { name: 'INFERNO', kind: 'buy_inferno', cost: 400, costNum: 400n, costDen: 1n, index: 2, maxWinProb: 1 / 20_000, minMaxWinBooks: 12, hit: [1 / 50, 1], tail: { rounds: 600_000, minPay: 5000 } },
];

/**
 * Stake "Math Distribution & Summary" 2-Star limits with about 12% headroom, enforced by the tilt
 * (verify.ts requires 10%). Tails and CVaR are in raw bet multiples; CVaR per-stake is CVaR / cost.
 */
export const DASH_TARGET = {
  tail: [
    [5000, 0.0088],
  ] as readonly (readonly [number, number])[],
  cvarAbs: 17_600,
  cvarPerStake: 616,
  cvarAlpha: 0.001,
  etl40: 0.7,
  etl10k: 0.52,
  etlSum: 1.14,
};
for (const m of MODES) if (Number(m.costNum) / Number(m.costDen) !== m.cost) throw new Error(`${m.name}: cost fraction mismatch`);

/** Paid-spin-like modes (base game rules, no bonus buy): BASE and BOOST. */
export const isSpinMode = (m: ModeSpec) => m.kind === 'base' || m.kind === 'boost';

export const modeByName = (n: string): ModeSpec => {
  const m = MODES.find((x) => x.name === n);
  if (!m) throw new Error(`unknown mode ${n}`);
  return m;
};

export const TARGET_RTP = 0.963;
/** RTP == 0.963 exactly  <=>  10 * costDen * sum(w * pay) == 963 * costNum * sum(w)  (pay in hundredths). */
export const RTP_NUM = 963n;
export const RTP_DEN = 10n;
/** Sum of the integer weights per mode (~1e15; uint64 holds 1.8e19). */
export const TOTAL_WEIGHT = 1e15;
/** Max win in hundredths of the bet (10,000x). */
export const CAP_HUNDREDTHS = 1_000_000;

/**
 * Tilt buckets in bet multiples (payout / 100): 0 | (0, e1) | [e1, e2) | ... | [7500, 10000) | cap.
 * Fine and roughly log-spaced so a per-bucket tilt is smooth in the payout; every Stake hit-rate
 * range edge and every dashboard tail threshold (5,000 / 10,000) is a bucket edge.
 */
export const EDGES = [
  0, 0.1, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 7500, 8500, 10000,
] as const;
export const CAP_BUCKET = EDGES.length - 1 + 1; // after the last range
export const BUCKETS = CAP_BUCKET + 1;

/** Bucket of a payout in hundredths. */
export function bucketOf(payH: number): number {
  if (payH <= 0) return 0;
  if (payH >= CAP_HUNDREDTHS) return CAP_BUCKET;
  const x = payH / 100;
  let b = 1;
  while (b < EDGES.length - 1 && x >= EDGES[b]) b++;
  return b;
}

export function bucketLabel(b: number): string {
  if (b === 0) return '0';
  if (b === CAP_BUCKET) return '10000 (cap)';
  if (b === 1) return `(0,${EDGES[1]})`;
  return `[${EDGES[b - 1]},${EDGES[b]})`;
}

export const fileNames = (m: ModeName) => ({ events: `books_${m}.jsonl.zst`, weights: `lookUpTable_${m}_0.csv` });

/** 32-bit stream word for (seed, mode, purpose). purpose 0 = natural sample, 1 = max-win search, 2 = tail sample. */
export function streamWord(seed: number, mode: number, purpose: number): number {
  let z = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(mode + 1, 0x85ebca6b) ^ Math.imul(purpose + 1, 0xc2b2ae35)) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** Stream the books of a published .jsonl.zst file. */
export async function* readBooks(path: string): AsyncGenerator<{ book: Book; line: string }> {
  const rl = createInterface({ input: createReadStream(path).pipe(createZstdDecompress()), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    yield { book: JSON.parse(line) as Book, line };
  }
}

/** Parse a lookUpTable CSV into (id -> [weight, payout]) arrays indexed by id - 1. */
export function parseCsv(text: string): { weight: bigint[]; pay: number[] } {
  const weight: bigint[] = [];
  const pay: number[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const [id, w, p] = line.split(',');
    const i = Number(id) - 1;
    weight[i] = BigInt(w);
    pay[i] = Number(p);
  }
  return { weight, pay };
}
