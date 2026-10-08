/**
 * Dev scenarios: real engine rounds (a forced paid spin or a deterministic seed search), converted
 * to books exactly like the published ones. DemoRgs queues one for the next play
 * (window.__ll.rgs.scenario(name)); Controller.devScenario(name) queues it and plays it in its mode.
 * The same name always gives the same round.
 */
import { playRound } from '../math/engine';
import { Xoshiro128 } from '../math/rng';
import { CELLS, Sym, type Force, type RoundKind, type RoundResult } from '../math/types';
import { MODE_OF_KIND, roundToBook, type Book, type StakeMode } from './book';

/** Filler that never pays: station id mod 6 never runs 3 along any line. */
function grid(set: Record<number, number> = {}): Sym[] {
  const g: number[] = [];
  for (let p = 0; p < CELLS; p++) g.push(p % 6);
  for (const [p, s] of Object.entries(set)) g[Number(p)] = s;
  return g as Sym[];
}

type Pred = (r: RoundResult) => boolean;

interface Spec {
  note: string;
  kind: RoundKind;
  force?: Force;
  want?: Pred;
  seed?: number;
}

const spins = (r: RoundResult) => [r.trigger, ...(r.bonus?.spins ?? [])];

/*
 * Station ids (src/math/network.ts): Red 0-6 (west to east), Blue 7-13, Green 14 / 2 / 15 / 11 / 16,
 * Gold 17 / 4 / 15 / 9 / 18; 15 is Grand Junction.
 */
export const DEV_SCENARIOS: Readonly<Record<string, Spec>> = {
  train: {
    note: 'One Red Line train collects three Fare Coins.',
    kind: 'base',
    force: { grid: grid({ 0: Sym.LOCO, 1: Sym.COIN, 3: Sym.COIN, 5: Sym.COIN, 10: Sym.COIN }), values: { 1: 2, 3: 5, 5: 1, 10: 10 } },
  },
  redirect: {
    note: 'A Signal at an interchange redirects the Red train down the Green Line.',
    kind: 'base',
    force: { grid: grid({ 0: Sym.LOCO, 1: Sym.COIN, 2: Sym.SIGNAL, 15: Sym.COIN, 11: Sym.COIN, 16: Sym.COIN, 5: Sym.COIN }), values: { 1: 1, 15: 3, 11: 2, 16: 15, 5: 50 } },
  },
  security: {
    note: 'A Security Check: ALL CLEAR, the train waits a beat and earns Delay Repay x2.',
    kind: 'base',
    force: { grid: grid({ 7: Sym.LOCO, 8: Sym.SECURITY, 10: Sym.COIN, 12: Sym.COIN, 13: Sym.COIN }), values: { 10: 5, 12: 3, 13: 10 }, security: [true] },
  },
  missed: {
    note: 'A Security Check: INCIDENT, the train is held and misses its coins.',
    kind: 'base',
    force: { grid: grid({ 7: Sym.LOCO, 8: Sym.COIN, 10: Sym.SECURITY, 12: Sym.COIN, 13: Sym.COIN }), values: { 8: 2, 12: 25, 13: 10 }, security: [false] },
  },
  crash: {
    note: 'Two Red trains meet head-on: CRASH, the wreck scatters the coins around it and pays x2.',
    kind: 'base',
    force: { grid: grid({ 0: Sym.LOCO, 6: Sym.LOCO, 1: Sym.COIN, 5: Sym.COIN, 3: Sym.COIN, 4: Sym.COIN, 10: Sym.COIN }), values: { 1: 2, 5: 3, 3: 10, 4: 5, 10: 1 } },
  },
  junction: {
    note: 'Green and Gold trains reach Grand Junction on the same beat: a crash at the crossing.',
    kind: 'base',
    force: { grid: grid({ 14: Sym.LOCO, 17: Sym.LOCO, 2: Sym.COIN, 15: Sym.COIN, 9: Sym.COIN, 11: Sym.COIN, 4: Sym.COIN }), values: { 2: 2, 15: 25, 9: 5, 11: 3, 4: 1 } },
  },
  multi: {
    note: 'Three trains, a redirect, a security check and a crash in one spin.',
    kind: 'base',
    want: (r) => r.trigger.trains.length >= 3 && r.trigger.crashes.some((c) => c.pay > 0) && r.trigger.trains.some((t) => t.steps.some((s) => s.event)) && r.trigger.haul >= 5,
    force: { locoCount: 3 },
    seed: 1,
  },
  ways: {
    note: 'A 7-station Conductor route win along the Red Line with Live Wires.',
    kind: 'base',
    force: { grid: grid({ 0: Sym.TOP, 1: Sym.TOP, 2: Sym.WILD, 3: Sym.TOP, 4: Sym.TOP, 5: Sym.WILD, 6: Sym.TOP, 8: Sym.H1, 9: Sym.H1, 10: Sym.H1 }) },
  },
  tease: {
    note: 'Coins land but no locomotive: nothing collects them.',
    kind: 'base',
    force: { grid: grid({ 3: Sym.COIN, 10: Sym.COIN, 15: Sym.COIN }), values: { 3: 50, 10: 5, 15: 2 } },
  },
  bonus: {
    note: 'Four Golden Tickets trigger Rush Hour (natural bonus with a level-up).',
    kind: 'base',
    force: { scatCount: 4 },
    want: (r) => (r.bonus?.spins ?? []).some((s) => s.levelAfter > s.levelBefore) && (r.bonus?.spins ?? []).some((s) => s.crashes.length > 0),
    seed: 1,
  },
  rushBig: {
    note: 'A Rush Hour buy that reaches x5 power or more.',
    kind: 'buy_witching',
    want: (r) => (r.bonus?.spins ?? []).some((s) => s.levelAfter >= 3) && r.totalWin > 200,
    seed: 1,
  },
  lastTrain: {
    note: 'Last Train: the Golden Locomotive runs every spin, with a crash along the way.',
    kind: 'buy_inferno',
    want: (r) => (r.bonus?.spins ?? []).some((s) => s.crashes.length > 0) && r.totalWin > 300,
    seed: 1,
  },
  express: {
    note: 'An Express Pass spin (1.5x): a locomotive every spin.',
    kind: 'boost',
    want: (r) => r.trigger.trainWin > 0,
    seed: 1,
  },
  maxWin: {
    note: 'A Last Train round that reaches the 10,000x max win.',
    kind: 'buy_inferno',
    want: (r) => r.maxWin,
    seed: 1,
  },
};

export type DevScenario = keyof typeof DEV_SCENARIOS;

export interface ScenarioBook {
  name: string;
  mode: StakeMode;
  note: string;
  seed: number;
  book: Book;
}

/** Build a scenario's book (deterministic). Book ids are 900001+ so they never collide with published ids. */
export function makeScenario(name: string): ScenarioBook {
  const spec = DEV_SCENARIOS[name];
  if (!spec) throw new Error(`unknown scenario "${name}" (${Object.keys(DEV_SCENARIOS).join(', ')})`);
  const rng = new Xoshiro128();
  let seed = spec.seed ?? 1;
  let r: RoundResult | null = null;
  const tries = name === 'maxWin' ? 400_000 : 20_000;
  for (let i = 0; i < tries; i++, seed++) {
    rng.seed(seed, 0x5eed);
    if (spec.want && name === 'maxWin') {
      // fast path first: a max win is rare
      const fast = playRound({ kind: spec.kind, rng, force: spec.force, record: false });
      if (!fast.maxWin) continue;
      rng.seed(seed, 0x5eed);
    }
    const cand = playRound({ kind: spec.kind, rng, force: spec.force });
    if (!spec.want || spec.want(cand)) {
      r = cand;
      break;
    }
  }
  if (!r) throw new Error(`scenario "${name}" not found`);
  void spins;
  const id = 900_001 + Object.keys(DEV_SCENARIOS).indexOf(name);
  return { name, mode: MODE_OF_KIND[spec.kind], note: spec.note, seed, book: roundToBook(id, r) };
}
