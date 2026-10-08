/**
 * Third Rail Riches: engine <-> presentation contract.
 * The engine computes a full RoundResult; the renderer only animates it.
 * Money inside the engine is in BET MULTIPLES (every amount is on the 0.01x grid; the engine adds
 * in integer hundredths and converts once).
 *
 * Rules summary (docs/MATH.md is the reference)
 * - 6 reels x 5 rows, no cascades. WAYS pays: 3+ adjacent reels from the leftmost, any row;
 *   pay = paytable(symbol, reels) x ways (product of matching cells per reel).
 * - LIVE WIRE (WILD) lands on reels 2-6 and substitutes for every paying symbol.
 * - FARE COINS (COIN) land on reels 2-6 carrying a cash value (bet multiples). On their own they
 *   pay nothing.
 * - LOCOMOTIVES (LOCO) land on reel 1 only. Each one departs along its row and collects the value
 *   of every Fare Coin in its path.
 * - JUNCTIONS (SWITCH) land on reels 2-5. A train passing a Junction keeps going and also sends a
 *   branch train into the row above and the row below, starting in the Junction's column. A branch
 *   that reaches another Junction branches again. Every cell is run by at most one train, so every
 *   coin is collected at most once.
 * - GOLDEN TICKETS (FS): 3 / 4 / 5 / 6 on the paid spin award 8 / 10 / 12 / 15 RUSH HOUR free spins.
 * - RUSH HOUR: Fare Coins are STICKY until a train collects them. Every collected coin is a
 *   passenger on the POWER meter; at 5 / 12 / 22 / 35 passengers the train multiplier steps up
 *   x1 -> x2 -> x3 -> x5 -> x10 (from the next spin) and +3 spins are added. The multiplier applies
 *   to train hauls only. 3+ tickets on a free spin add +5 spins.
 * - EXPRESS PASS (mode BOOST, 1.5x the bet): locomotives land about twice as often.
 * - LAST TRAIN (buy, 400x): 10 spins starting at x2 with a GOLDEN LOCOMOTIVE held on reel 1 (one
 *   random row) for the whole bonus.
 * - Max win 10,000x the bet per round.
 */

export const REELS = 6;
export const ROWS = 4;
export const CELLS = REELS * ROWS; // 30
export const MIN_REELS = 3;
export const MAX_WIN = 10_000; // x bet per round, every mode
export const MAX_WIN_H = MAX_WIN * 100;

/** Symbol ids. 0..8 pay by ways; 9 wild; 10..13 specials. */
export const enum Sym {
  L1 = 0, // pretzel
  L2 = 1, // coffee cup
  L3 = 2, // newspaper
  L4 = 3, // umbrella
  H4 = 4, // pigeon
  H3 = 5, // alley cat
  H2 = 6, // bulldog cop
  H1 = 7, // Rivets the rat
  TOP = 8, // Conductor Casey
  WILD = 9, // Live Wire
  FS = 10, // Golden Ticket
  COIN = 11, // Fare Coin (value)
  LOCO = 12, // Locomotive (reel 1 only)
  SWITCH = 13, // Junction (reels 2-5)
}
export const PAYING_SYMBOLS = 9;
export const SYMBOL_COUNT = 14;

/** Power meter thresholds (cumulative passengers) and the multiplier each level gives. */
export const POWER_STEPS: readonly number[] = [5, 12, 22, 35];
export const POWER_MULTS: readonly number[] = [1, 2, 3, 5, 10];
/** Spins added each time the power level goes up. */
export const LEVEL_SPINS = 3;
/** Multiplier for a power level (0..4). */
export const multOfLevel = (lvl: number) => POWER_MULTS[Math.min(lvl, POWER_MULTS.length - 1)];
/** Power level for a passenger count. */
export function levelOf(passengers: number): number {
  let l = 0;
  while (l < POWER_STEPS.length && passengers >= POWER_STEPS[l]) l++;
  return l;
}

/** Cost of an Express Pass spin in bet multiples. */
export const BOOST_COST = 1.5;

/** Cell index = reel * ROWS + row. Row 0 is the TOP row. */
export type Pos = number;
export const posOf = (reel: number, row: number): Pos => reel * ROWS + row;
export const reelOf = (p: Pos) => Math.floor(p / ROWS);
export const rowOf = (p: Pos) => p % ROWS;

export type BonusKind = 'rush' | 'last';
/** base = paid spin at 1x; boost = Express Pass at 1.5x; the buys start a bonus. */
export type RoundKind = 'base' | 'boost' | 'buy_witching' | 'buy_inferno';
export const COST: Record<RoundKind, number> = { base: 1, boost: BOOST_COST, buy_witching: 100, buy_inferno: 400 };

export interface Cell {
  sym: Sym;
  id: number; // unique within a round (a sticky coin keeps its id from spin to spin)
  /** COIN only: cash value in bet multiples. */
  value?: number;
  /** COIN: it was already on the board when this spin started (sticky). LOCO: the held Golden Locomotive. */
  held?: boolean;
  /** LOCO only: the Golden Locomotive of Last Train. */
  golden?: boolean;
}

export interface WayWin {
  sym: Sym;
  /** Consecutive reels from the left (3..6). */
  reels: number;
  /** Product of matching cells per reel. */
  ways: number;
  /** Every matching cell (wilds included), reel order. */
  positions: Pos[];
  /** Paytable value per way. */
  basePay: number;
  pay: number; // basePay * ways
}

/**
 * One train. Trains move right one column at a time, all at the same speed; train 0.. are the
 * locomotives in row order, then branches in the order they leave their Junctions.
 */
export interface Train {
  row: number;
  /** Column the train starts in: 0 for a locomotive, the Junction's column for a branch. */
  from: number;
  /** Index of the train it branched from (-1 for a locomotive). */
  parent: number;
  /** The Junction it branched at (-1 for a locomotive). */
  via: Pos;
  /** Coins this train collects, left to right: position, value, id. */
  coins: { pos: Pos; value: number; id: number }[];
  /** Junctions this train passes (in order), each sends branches up and/or down. */
  switches: Pos[];
  /** Last column this train runs through (it stops early when the cell ahead is already run). */
  to: number;
}

export interface SpinResult {
  mode: 'base' | BonusKind;
  /** The 30 cells as they stand when the reels stop (held cells included). */
  grid: Cell[];
  /** Positions that did not spin (sticky coins, the Golden Locomotive). */
  held: Pos[];
  ways: WayWin[];
  waysWin: number;
  trains: Train[];
  /** Sum of collected coin values (before the multiplier). */
  haul: number;
  /** Train multiplier this spin (1 in the base game). */
  mult: number;
  trainWin: number; // haul * mult
  spinWin: number; // bet multiples, after the cap
  scatCount: number;
  scatPositions: Pos[];
  /** Power meter (passengers) before and after this spin's collections; 0 in the base game. */
  powerBefore: number;
  powerAfter: number;
  levelBefore: number;
  levelAfter: number;
  /** Spins added by level-ups this spin. */
  levelSpins: number;
  maxWin: boolean;
}

export interface BonusResult {
  kind: BonusKind;
  awarded: number;
  spins: SpinResult[];
  retriggers: { afterSpin: number; scatCount: number; added: number }[];
  totalSpins: number;
  bonusWin: number;
  /** Last Train: the held Golden Locomotive's row (-1 otherwise). */
  goldenRow: number;
  /** Power / multiplier the bonus starts with. */
  powerStart: number;
}

export interface RoundResult {
  kind: RoundKind;
  costMultiple: number;
  trigger: SpinResult;
  bonus?: BonusResult;
  totalWin: number; // capped
  maxWin: boolean;
}

/** QA forcing. Every field applies to the PAID spin only (the base / boost spin, or a buy's trigger spin). */
export interface Force {
  scatCount?: number;
  /** Exact 30-symbol grid for the paid spin; coins take `values` (by position) or 1x. */
  grid?: Sym[];
  values?: Record<number, number>;
  /** Exact number of locomotives on reel 1. */
  locoCount?: number;
}
