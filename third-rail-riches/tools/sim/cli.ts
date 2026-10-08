/**
 * Monte Carlo simulator.
 *   npx tsx tools/sim/cli.ts --kind all --rounds 2e6 [--workers 4] [--seed 7] [--knobs JSON] [--force JSON]
 * Buys play rounds / 40 (at least 1,000).
 */
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { COST, type RoundKind } from '../../src/math/types';
import { EDGES, merge, OVER, type Job, type Stats } from './job';

const { values } = parseArgs({
  options: { kind: { type: 'string', default: 'all' }, rounds: { type: 'string', default: '1e6' }, workers: { type: 'string' }, seed: { type: 'string', default: '7' }, knobs: { type: 'string' }, force: { type: 'string' }, buys: { type: 'string' } },
});
const kinds: RoundKind[] = values.kind === 'all' ? ['base', 'boost', 'buy_witching', 'buy_inferno'] : (values.kind!.split(',') as RoundKind[]);
const N = Number(values.rounds);
const W = values.workers ? Number(values.workers) : os.availableParallelism();
const knobs = values.knobs ? JSON.parse(values.knobs) : undefined;
const force = values.force ? JSON.parse(values.force) : undefined;

async function run(kind: RoundKind, n: number): Promise<Stats> {
  const per = Math.ceil(n / W);
  const parts = await Promise.all(
    Array.from({ length: W }, (_, i) => {
      const job: Job = { kind, start: i * per, count: Math.max(0, Math.min(per, n - i * per)), seed: Number(values.seed), knobs, force };
      return new Promise<Stats>((res, rej) => {
        const w = new Worker(new URL('./boot.mjs', import.meta.url));
        w.once('message', (s: Stats) => {
          res(s);
          void w.terminate();
        });
        w.once('error', rej);
        w.postMessage(job);
      });
    }),
  );
  return parts.reduce((a, b) => merge(a, b));
}

const pct = (x: number) => (x * 100).toFixed(2) + '%';
for (const kind of kinds) {
  const n = kind.startsWith('buy') ? (values.buys ? Number(values.buys) : Math.max(1000, Math.round(N / 40))) : N;
  const t0 = Date.now();
  const s = await run(kind, n);
  const cost = COST[kind];
  const mean = s.sumH / 100 / s.rounds;
  const sd = Math.sqrt(Math.max(0, s.sumH2 / 1e4 / s.rounds - mean * mean));
  const rtp = mean / cost;
  const ci = (1.96 * sd) / Math.sqrt(s.rounds) / cost;
  const b = s.base;
  const f = s.free;
  console.log(`\n== ${kind} (${s.rounds} rounds, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log(`RTP ${pct(rtp)} +- ${pct(ci)}  mean ${mean.toFixed(3)}x  sd ${sd.toFixed(1)}x  hit ${pct(s.hits / s.rounds)}  max ${(s.maxH / 100).toFixed(0)}x  capped ${s.capped}`);
  console.log(
    `paid spin: ways ${(b.waysH / 100 / s.rounds).toFixed(4)}x  trains ${(b.trainH / 100 / s.rounds).toFixed(4)}x  locos/spin ${(b.locos / b.spins).toFixed(3)}  branches/spin ${(b.branches / b.spins).toFixed(3)}  coins landed ${(b.coinsLanded / b.spins).toFixed(2)} collected ${(b.coinsCollected / b.spins).toFixed(3)}`,
  );
  if (s.bonuses) {
    console.log(`bonus: 1 in ${(s.rounds / s.bonuses).toFixed(1)}  avg ${(s.bonusH / 100 / s.bonuses).toFixed(1)}x  (${pct(s.bonusH / 100 / s.rounds / cost)} of cost)  spins ${(s.freeSpins / s.bonuses).toFixed(2)}  retrig ${(s.retriggers / s.bonuses).toFixed(3)}`);
    console.log(
      `free spin: ways ${(f.waysH / 100 / f.spins).toFixed(3)}x  trains ${(f.trainH / 100 / f.spins).toFixed(3)}x  locos ${(f.locos / f.spins).toFixed(3)}  branches ${(f.branches / f.spins).toFixed(3)}  coins landed ${(f.coinsLanded / f.spins).toFixed(2)} collected ${(f.coinsCollected / f.spins).toFixed(2)}  level-ups/bonus ${(f.levelUps / s.bonuses).toFixed(2)}`,
    );
  }
  console.log('over: ' + OVER.map((x) => `>=${x}x 1 in ${s.over[x] ? (s.rounds / s.over[x]).toFixed(0) : '-'}`).join('  '));
  console.log(
    'hist: ' +
      s.hist
        .map((c, i) => (c ? `${i === 0 ? '0' : '[' + EDGES[i - 1] + ',' + (EDGES[i] ?? 'cap') + ')'} ${pct(c / s.rounds)} rtp ${pct(s.histH[i] / 100 / s.rounds / cost)}` : ''))
        .filter(Boolean)
        .join(' | '),
  );
}
