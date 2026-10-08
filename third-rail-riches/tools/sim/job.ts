/**
 * One simulation job: rounds start..start+count-1 of a kind on the fast path, merged statistics.
 * Every round is seeded from (round index, seed), so totals do not depend on the split.
 */
import { compileModel, createCounters, lastRoundInfo, playRound, type EngineCounters } from '../../src/math/engine';
import { TUNED, withKnobs, type Model } from '../../src/math/model';
import { Xoshiro128 } from '../../src/math/rng';
import type { Force, RoundKind } from '../../src/math/types';

export const EDGES = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 25000] as const;

export function bucketOf(winH: number): number {
  if (winH <= 0) return 0;
  const x = winH / 100;
  let b = 1;
  while (b < EDGES.length && x >= EDGES[b]) b++;
  return b;
}

export interface Job {
  kind: RoundKind;
  start: number;
  count: number;
  seed: number;
  knobs?: Partial<Record<keyof Model, object>>;
  force?: Force;
}

export interface Stats {
  rounds: number;
  sumH: number;
  sumH2: number;
  hits: number;
  capped: number;
  bonuses: number;
  bonusH: number;
  freeSpins: number;
  retriggers: number;
  hist: number[];
  histH: number[];
  maxH: number;
  /** wins >= x (bet multiples) */
  over: Record<number, number>;
  base: EngineCounters;
  free: EngineCounters;
}

export const OVER = [100, 1000, 5000, 10000];

export function runJob(job: Job): Stats {
  const model = compileModel(withKnobs(TUNED, job.knobs as never));
  const rng = new Xoshiro128();
  const counters = { base: createCounters(), free: createCounters() };
  const s: Stats = {
    rounds: 0,
    sumH: 0,
    sumH2: 0,
    hits: 0,
    capped: 0,
    bonuses: 0,
    bonusH: 0,
    freeSpins: 0,
    retriggers: 0,
    hist: new Array(EDGES.length + 1).fill(0),
    histH: new Array(EDGES.length + 1).fill(0),
    maxH: 0,
    over: Object.fromEntries(OVER.map((x) => [x, 0])),
    base: counters.base,
    free: counters.free,
  };
  for (let k = 0; k < job.count; k++) {
    rng.seed(job.start + k, job.seed);
    const r = playRound({ kind: job.kind, rng, record: false, model, counters, force: job.force });
    const h = Math.round(r.totalWin * 100);
    s.rounds++;
    s.sumH += h;
    s.sumH2 += h * h;
    if (h > 0) s.hits++;
    if (r.maxWin) s.capped++;
    if (lastRoundInfo.bonus) {
      s.bonuses++;
      s.bonusH += lastRoundInfo.bonusH;
      s.freeSpins += lastRoundInfo.freeSpins;
      s.retriggers += lastRoundInfo.retriggers;
    }
    const b = bucketOf(h);
    s.hist[b]++;
    s.histH[b] += h;
    if (h > s.maxH) s.maxH = h;
    for (const x of OVER) if (h >= x * 100) s.over[x]++;
  }
  return s;
}

export function merge(a: Stats, b: Stats): Stats {
  const addC = (x: EngineCounters, y: EngineCounters) => {
    for (const k of Object.keys(x) as (keyof EngineCounters)[]) x[k] += y[k];
  };
  a.rounds += b.rounds;
  a.sumH += b.sumH;
  a.sumH2 += b.sumH2;
  a.hits += b.hits;
  a.capped += b.capped;
  a.bonuses += b.bonuses;
  a.bonusH += b.bonusH;
  a.freeSpins += b.freeSpins;
  a.retriggers += b.retriggers;
  a.hist = a.hist.map((v, i) => v + b.hist[i]);
  a.histH = a.histH.map((v, i) => v + b.histH[i]);
  a.maxH = Math.max(a.maxH, b.maxH);
  for (const x of OVER) a.over[x] += b.over[x];
  addC(a.base, b.base);
  addC(a.free, b.free);
  return a;
}
