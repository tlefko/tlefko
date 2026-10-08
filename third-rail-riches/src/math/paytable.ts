/**
 * Ways paytable for Third Rail Riches.
 *
 * A way win is 3 or more adjacent reels from the leftmost reel, each holding the symbol or a Live
 * Wire (wild; reels 2-6). It pays PAYTABLE[sym][reels - 3] per way, in bet multiples, times the
 * number of ways (product of matching cells per reel). Every value is a whole number of hundredths,
 * so the engine adds in integer hundredths and results match the Stake payoutMultiplier exactly.
 */
import { PAYING_SYMBOLS } from './types';

export const REEL_LABELS = ['3', '4', '5', '6'] as const;
export const TIERS = REEL_LABELS.length;

/** PAYTABLE[sym][reels - 3] in bet multiples per way. */
export const PAYTABLE: readonly (readonly number[])[] = [
  [0.05, 0.1, 0.2, 0.4], // L1 pretzel
  [0.05, 0.1, 0.25, 0.5], // L2 coffee cup
  [0.05, 0.15, 0.3, 0.6], // L3 newspaper
  [0.1, 0.15, 0.4, 0.8], // L4 umbrella
  [0.1, 0.25, 0.6, 1.5], // H4 pigeon
  [0.15, 0.3, 0.8, 2], // H3 alley cat
  [0.2, 0.4, 1, 3], // H2 bulldog cop
  [0.25, 0.6, 1.5, 5], // H1 Rivets the rat
  [0.4, 1, 3, 10], // TOP Conductor Casey
].map((row) => Object.freeze(row));

/** Pay per way in bet multiples (0 below 3 reels). */
export function payFor(sym: number, reels: number): number {
  return reels < 3 ? 0 : PAYTABLE[sym][Math.min(reels, 6) - 3];
}

/** Integer hundredths: PAY_H[sym * TIERS + reels - 3]. */
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
