/**
 * Probability model for Third Rail Riches. docs/MATH.md has the derivation and verified figures.
 *
 * Four parameter sets share one shape:
 *  - base   the paid spin (base game, and the trigger spin of both buys)
 *  - boost  the Express Pass paid spin (1.5x): at least one Locomotive on every spin
 *  - rush   every Rush Hour free spin
 *  - last   every Last Train free spin (10 spins, x2, a held Golden Locomotive)
 *
 * Per set, every station that flips is drawn independently by its kind (src/math/network.ts):
 *  - terminal: a Locomotive with probability `loco`, else as below without the special
 *  - interchange: a Signal with probability `signal`
 *  - stop: a Security Check with probability `security`
 *  - then Live Wire `wild`, Fare Coin `coin`, else a paying symbol from `pay`
 *  - Golden Tickets first: k from `fsDist` (0..6) on k distinct non-terminal stations
 *  - a Fare Coin's value from `coinValues` / `coinWeights`
 *  - a Security Check gives ALL CLEAR with probability `clear`, else INCIDENT
 */
import { PAYING_SYMBOLS } from './types';

export type ModelMode = 'base' | 'boost' | 'rush' | 'last';
export const MODEL_MODES: readonly ModelMode[] = ['base', 'boost', 'rush', 'last'];

/** Rush Hour free spins for 3 / 4 / 5 / 6 tickets on a paid (or buy trigger) spin. */
export const RUSH_SPINS: readonly number[] = [0, 0, 0, 8, 10, 12, 15];
export const TRIGGER_MIN = 3;
/** 3+ tickets on a free spin add this many spins. */
export const RETRIGGER_MIN = 3;
export const RETRIGGER_SPINS = 5;
/** Buy Rush Hour: trigger-spin ticket count weights over 0..6. */
export const BUY_RUSH_SCATS: readonly number[] = [0, 0, 0, 80, 16, 4, 0];
/** Last Train (400x): 10 spins, power starts at level 1 (x2), a Golden Locomotive held on a terminal. */
export const LAST_TRAIN = Object.freeze({ spins: 10, level: 1, scatters: 3 });

/** Every Fare Coin value (bet multiples), smallest first. */
export const COIN_VALUES: readonly number[] = [0.2, 0.5, 1, 2, 3, 5, 10, 15, 25, 50, 100, 250, 500, 1000];

export interface SetSpec {
  /** Paying-symbol weights L1..TOP (relative). */
  pay: readonly number[];
  /** P(Locomotive) per terminal. */
  loco: number;
  /** At least this many Locomotives on the terminals (Express Pass: 1). */
  minLoco?: number;
  wild: number;
  coin: number;
  /** P(Signal) per interchange. */
  signal: number;
  /** P(Security Check) per stop. */
  security: number;
  /** P(ALL CLEAR) at a Security Check. */
  clear: number;
  /** P(k tickets), k = 0..6. */
  fsDist: readonly number[];
  /** Relative weights over COIN_VALUES. */
  coinWeights: readonly number[];
}

export type Model = Record<ModelMode, SetSpec>;

/** Paying weights from a low share and two geometric ratios (lows L1..L4, highs H4..TOP). */
export function payWeights(lowShare: number, lowRatio: number, highRatio: number): number[] {
  const lows = [0, 1, 2, 3].map((i) => Math.pow(lowRatio, i));
  const highs = [0, 1, 2, 3, 4].map((i) => Math.pow(highRatio, i));
  const ls = lows.reduce((a, b) => a + b, 0);
  const hs = highs.reduce((a, b) => a + b, 0);
  const w = [...lows.map((x) => (x / ls) * lowShare), ...highs.map((x) => (x / hs) * (1 - lowShare))];
  if (w.length !== PAYING_SYMBOLS) throw new Error('pay weights');
  return w;
}

/** Ticket distribution: reference rates for 1..6 tickets scaled by `scale`; the rest is 0. */
export function fsDist(scale: number, p3: number): number[] {
  const ref = [0, 0.1, 0.02, p3, p3 * 0.1, p3 * 0.01, p3 * 0.0008];
  const d = ref.map((x) => x * scale);
  d[0] = 1 - d.slice(1).reduce((a, b) => a + b, 0);
  return d;
}

export const TUNED: Model = {
  base: {
    pay: [0.25, 0.18, 0.13, 0.09, 0.12, 0.09, 0.07, 0.04, 0.03],
    loco: 0.05,
    wild: 0.04,
    coin: 0.095,
    signal: 0.12,
    security: 0.08,
    clear: 0.5,
    fsDist: fsDist(1, 0.0041),
    coinWeights: [30, 26, 18, 10, 6, 4, 2.4, 1.2, 0.6, 0.2, 0.05, 0.01, 0, 0],
  },
  boost: {
    pay: [0.25, 0.18, 0.13, 0.09, 0.12, 0.09, 0.07, 0.04, 0.03],
    loco: 0.06,
    minLoco: 1,
    wild: 0.04,
    coin: 0.1,
    signal: 0.12,
    security: 0.08,
    clear: 0.5,
    fsDist: fsDist(1, 0.0041),
    coinWeights: [36, 28, 17, 8, 4.5, 3, 1.8, 0.9, 0.45, 0.15, 0.04, 0.008, 0, 0],
  },
  rush: {
    pay: payWeights(0.6, 0.85, 0.75),
    loco: 0.165,
    wild: 0.03,
    coin: 0.127,
    signal: 0.15,
    security: 0.1,
    clear: 0.55,
    fsDist: fsDist(1.4, 0.006),
    coinWeights: [10, 20, 20, 16, 10, 8, 5, 2.5, 1.2, 0.5, 0.12, 0.04, 0.01, 0.003],
  },
  last: {
    pay: payWeights(0.6, 0.85, 0.75),
    loco: 0.122,
    wild: 0.03,
    coin: 0.12,
    signal: 0.15,
    security: 0.1,
    clear: 0.55,
    fsDist: fsDist(1.4, 0.006),
    coinWeights: [6, 13, 17, 18, 13, 11, 8.5, 4.6, 2.3, 1.1, 0.28, 0.09, 0.018, 0.005],
  },
};

/** Deep-merge knob overrides (tools/sim --knobs) into a model. */
export function withKnobs(base: Model, knobs?: Partial<Record<ModelMode, Partial<SetSpec>>>): Model {
  if (!knobs) return base;
  const out = { ...base } as Model;
  for (const m of MODEL_MODES) if (knobs[m]) out[m] = { ...base[m], ...knobs[m] };
  return out;
}
