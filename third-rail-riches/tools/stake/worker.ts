/**
 * Worker thread for tools/stake/generate.ts. Two job types:
 *  - sim:    play rounds start..start+count-1 of a mode and return their books as JSONL text plus the
 *            payout (hundredths) of every book.
 *  - search: play candidate rounds (optionally forced) on the fast path and return, as full books,
 *            only the ones that reach the 50,000x cap (max-win search), or with `minPay`, every
 *            natural round paying at least minPay hundredths (the stratified tail sample).
 *
 * Every round gets its own generator seeded from (round index, stream word), so the output does not
 * depend on how the work is split across workers.
 */
import { parentPort } from 'node:worker_threads';
import { playRound } from '../../src/math/engine';
import { Xoshiro128 } from '../../src/math/rng';
import type { Force, RoundKind } from '../../src/math/types';
import { roundToBook } from '../../src/stake/book';

export interface SimJob {
  type: 'sim';
  kind: RoundKind;
  start: number; // first round index (book id = index + 1)
  count: number;
  stream: number;
}

export interface SearchJob {
  type: 'search';
  kind: RoundKind;
  start: number;
  count: number;
  stream: number;
  force: Force | null;
  /** Keep every round paying at least this (hundredths) instead of max wins only. */
  minPay?: number;
  /** With minPay: and below this (hundredths). */
  maxPay?: number;
}

export type Job = SimJob | SearchJob;

export interface SimResult {
  text: string;
  pay: Int32Array;
}

export interface SearchHit {
  index: number;
  text: string; // book JSON with id 0 (the caller assigns the id)
  pay: number;
}

export interface SearchResult {
  hits: SearchHit[];
  played: number;
}

export function runSim(job: SimJob): SimResult {
  const rng = new Xoshiro128();
  const lines: string[] = new Array(job.count);
  const pay = new Int32Array(job.count);
  for (let k = 0; k < job.count; k++) {
    const idx = job.start + k;
    rng.seed(idx, job.stream);
    const r = playRound({ kind: job.kind, rng, record: true });
    const book = roundToBook(idx + 1, r);
    if (book.payoutMultiplier !== Math.round(r.totalWin * 100)) throw new Error('payout mismatch');
    lines[k] = JSON.stringify(book);
    pay[k] = book.payoutMultiplier;
  }
  return { text: lines.join('\n') + '\n', pay };
}

export function runSearch(job: SearchJob): SearchResult {
  const rng = new Xoshiro128();
  const hits: SearchHit[] = [];
  const force = job.force ?? undefined;
  for (let k = 0; k < job.count; k++) {
    const idx = job.start + k;
    rng.seed(idx, job.stream);
    // Fast path first (identical RNG use), replay with recording only for the hits.
    const fast = playRound({ kind: job.kind, rng, force, record: false });
    const payH = Math.round(fast.totalWin * 100);
    const keep = job.minPay !== undefined ? payH >= job.minPay && (job.maxPay === undefined || payH < job.maxPay) : fast.maxWin;
    if (!keep) continue;
    rng.seed(idx, job.stream);
    const r = playRound({ kind: job.kind, rng, force, record: true });
    if (r.maxWin !== fast.maxWin || r.totalWin !== fast.totalWin) throw new Error(`search replay mismatch at ${idx}`);
    const book = roundToBook(0, r);
    hits.push({ index: idx, text: JSON.stringify(book), pay: book.payoutMultiplier });
  }
  return { hits, played: job.count };
}

if (parentPort) {
  const port = parentPort;
  port.on('message', (msg: { id: number; job: Job }) => {
    try {
      if (msg.job.type === 'sim') {
        const res = runSim(msg.job);
        port.postMessage({ id: msg.id, res }, [res.pay.buffer as ArrayBuffer]);
      } else {
        port.postMessage({ id: msg.id, res: runSearch(msg.job) });
      }
    } catch (e) {
      port.postMessage({ id: msg.id, error: String((e as Error)?.stack ?? e) });
    }
  });
}
