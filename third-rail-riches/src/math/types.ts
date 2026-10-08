/**
 * Third Rail Riches: engine <-> presentation contract.
 * The engine computes a full RoundResult; the renderer only animates it.
 * Money inside the engine is in BET MULTIPLES (every amount is on the 0.01x grid; the engine adds
 * in integer hundredths and converts once).
 *
 * Rules summary (docs/MATH.md is the reference)
 * - The board is a subway map (src/math/network.ts): 4 lines, 19 stations. Every spin, every
 *   station's departure board flips to a new symbol.
 * - ROUTE WINS: 3+ consecutive stations along a line showing the same symbol (Live Wires
 *   substitute) pay PAYTABLE[symbol][run - 3]. Interchanges count for both lines.
 * - FARE COINS land on any station except where a Locomotive stands, carrying a cash value.
 * - LOCOMOTIVES land on terminals. Each departs along its line, one station per beat, all trains
 *   together, collecting every Fare Coin it reaches; it runs to the far terminal.
 * - SIGNALS land on interchanges: a train entering one is REDIRECTED onto the crossing line (towards
 *   the longer side; once per signal per train).
 * - SECURITY CHECKS land on stops: a train entering one is stopped and searched. ALL CLEAR: it waits
 *   one beat, then carries on with DELAY REPAY (its haul x2, stacking). INCIDENT: the train is held
 *   and misses the rest of its route.
 * - CRASHES: when two trains enter the same station on the same beat, meet head-on, or one runs into
 *   a train waiting at a security check, they CRASH. The wreck scatters every Fare Coin at the crash
 *   and its neighbouring stations into the pile, and the whole pile (both trains' hauls with their
 *   Delay Repay, plus the wreck) pays x2.
 * - GOLDEN TICKETS (FS): 3 / 4 / 5 / 6 on the paid spin award 8 / 10 / 12 / 15 RUSH HOUR free spins.
 * - RUSH HOUR: Fare Coins are STICKY until a train collects them. Every collected coin is a
 *   passenger on the POWER meter; at 5 / 12 / 22 / 35 passengers the train multiplier steps up
 *   x1 -> x2 -> x3 -> x5 -> x10 (from the next spin) and +3 spins are added. The multiplier applies
 *   to train hauls only. 3+ tickets on a free spin add +5 spins.
 * - EXPRESS PASS (mode BOOST, 1.5x the bet): a Locomotive on every spin.
 * - LAST TRAIN (buy, 400x): 10 spins starting at x2 with a GOLDEN LOCOMOTIVE held on one terminal
 *   for the whole bonus.
 * - Max win 10,000x the bet per round.
 */
import { STATION_COUNT } from './network';

export const CELLS = STATION_COUNT; // 19 stations
export const MIN_RUN = 3;
export const MAX_RUN = 7;
export const MAX_WIN = 10_000; // x bet per round, every mode
export const MAX_WIN_H = MAX_WIN * 100;
/** A crash pays its whole pile x this. */
export const CRASH_MULT = 2;
/** A cleared security check multiplies that train's haul by this (stacking). */
export const REPAY_MULT = 2;
/** Safety cap on beats per spin. */
export const MAX_BEATS = 40;

/** Symbol ids. 0..8 pay on routes; 9 wild; 10.. specials. */
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
  LOCO = 12, // Locomotive (terminals only)
  SIGNAL = 13, // Signal (interchanges only): redirects trains
  SECURITY = 14, // Security Check (stops only)
}
export const PAYING_SYMBOLS = 9;
export const SYMBOL_COUNT = 15;

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

/** A station id (0..18). */
export type Pos = number;

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

export interface RouteWin {
  sym: Sym;
  line: number;
  /** Stations of the run, in line order (wilds included). */
  stations: Pos[];
  pay: number;
}

export type StepEvent = 'redirect' | 'clear' | 'held';

/** A train entering a station. A train waiting at a security check skips that beat. */
export interface TrainStep {
  beat: number;
  at: Pos;
  /** The line the train is on as it enters (after a redirect it is on the new line from the next step). */
  line: number;
  event?: StepEvent;
}

export type TrainEnd = 'arrive' | 'held' | 'crash' | 'stall';

export interface Train {
  /** The terminal it departs from (beat 0). */
  start: Pos;
  line: number;
  golden?: boolean;
  steps: TrainStep[];
  /** Coins it collects, in order: station, value, id, beat. */
  coins: { at: Pos; value: number; id: number; beat: number }[];
  /** Delay Repay multiplier (REPAY_MULT per cleared security check). */
  repay: number;
  end: TrainEnd;
  /** Beat the train stops on (its last step's beat, or the crash beat). */
  endBeat: number;
  /** Index into SpinResult.crashes, or -1. */
  crash: number;
  /** Sum of its own coins (bet multiples, before repay). */
  haul: number;
}

export interface Crash {
  beat: number;
  /** One station (both trains entered it, or one ran into a waiting train) or two (head-on, between them). */
  at: Pos[];
  trains: number[];
  /** Coins scattered into the pile from the crash site and its neighbours. */
  wreck: { at: Pos; value: number; id: number }[];
  /** Pile before the crash multiplier: involved trains' haul x repay, plus the wreck. */
  pile: number;
  mult: number;
  /** pile x mult (before the POWER multiplier). */
  pay: number;
}

export interface SpinResult {
  mode: 'base' | BonusKind;
  /** The 19 stations as they stand when the boards stop (held cells included). */
  grid: Cell[];
  /** Stations that did not flip (sticky coins, the Golden Locomotive). */
  held: Pos[];
  routes: RouteWin[];
  routesWin: number;
  trains: Train[];
  crashes: Crash[];
  /** Train payout before the POWER multiplier: trains not in a crash (haul x repay) + crash pays. */
  haul: number;
  /** POWER multiplier this spin (1 in the base game). */
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
  /** Last Train: the held Golden Locomotive's terminal (-1 otherwise). */
  goldenAt: number;
  /** Power the bonus starts with. */
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
  /** Exact 19-symbol board for the paid spin; coins take `values` (by station) or 1x. */
  grid?: Sym[];
  values?: Record<number, number>;
  /** Exact number of locomotives on the terminals. */
  locoCount?: number;
  /** Security outcomes in order (true = all clear); the RNG decides the rest. */
  security?: boolean[];
}
