/**
 * Route paytable for Third Rail Riches.
 *
 * A route win is a run of 3 or more consecutive stations along one line showing the same symbol
 * (Live Wires substitute). It pays PAYTABLE[sym][run - 3] in bet multiples. Every value is a whole
 * number of hundredths, so the engine adds in integer hundredths and results match the Stake
 * payoutMultiplier exactly.
 */
import { MAX_RUN, MIN_RUN, PAYING_SYMBOLS } from './types';

export const RUN_LABELS = ['3', '4', '5', '6', '7'] as const;
export const TIERS = RUN_LABELS.length;

/** PAYTABLE[sym][run - 3] in bet multiples. */
export const PAYTABLE: readonly (readonly number[])[] = [
  [0.4, 1, 3, 8, 20], // L1 pretzel
  [0.4, 1, 3, 8, 20], // L2 coffee cup
  [0.6, 1.5, 4, 10, 30], // L3 newspaper
  [0.6, 1.5, 4, 10, 30], // L4 umbrella
  [1, 2.5, 6, 15, 50], // H4 pigeon
  [1.2, 3, 8, 20, 60], // H3 alley cat
  [1.5, 4, 10, 30, 100], // H2 Officer Bulldog
  [2, 5, 15, 50, 150], // H1 Rivets
  [3, 8, 25, 80, 300], // TOP Conductor Casey
].map((row) => Object.freeze(row));

/** Pay in bet multiples for a run (0 below 3). */
export function payFor(sym: number, run: number): number {
  return run < MIN_RUN ? 0 : PAYTABLE[sym][Math.min(run, MAX_RUN) - MIN_RUN];
}

/** Integer hundredths: PAY_H[sym * TIERS + run - 3]. */
export const PAY_H: Int32Array = (() => {
  const out = new Int32Array(PAYING_SYMBOLS * TIERS);
  for (let s = 0; s < PAYING_SYMBOLS; s++) {
    for (let t = 0; t < TIERS; t++) {
      const h = Math.round(PAYTABLE[s][t] * 100);
      if (Math.abs(h - PAYTABLE[s][t] * 100) > 1e-6) throw new Error('paytable value is not a multiple of 0.01');
      out[s * TIERS + t] = h;
    }
  }
  return out;
})();
