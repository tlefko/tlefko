/**
 * Dev scenarios: real engine rounds (a forced paid spin or a deterministic seed search), converted
 * to books exactly like the published ones. DemoRgs queues one for the next play
 * (window.__ll.rgs.scenario(name)); Controller.devScenario(name) queues it and plays it in its mode.
 * The same name always gives the same round.
 */
import { playRound } from '../math/engine';
import { Xoshiro128 } from '../math/rng';
import { CELLS, Sym, posOf, reelOf, rowOf, type Force, type RoundKind, type RoundResult } from '../math/types';
import { MODE_OF_KIND, roundToBook, type Book, type StakeMode } from './book';

/** Filler that never pays: each reel a different symbol pattern that never lines up 3 reels. */
function grid(set: Record<number, number> = {}): Sym[] {
  const g: number[] = [];
  for (let p = 0; p < CELLS; p++) g.push([0, 1, 2, 3, 4, 5][(reelOf(p) + (rowOf(p) % 2) * 3) % 6]);
  for (const [p, s] of Object.entries(set)) g[Number(p)] = s;
  return g as Sym[];
}
const P = posOf;

type Pred = (r: RoundResult) => boolean;

interface Spec {
  note: string;
  kind: RoundKind;
  force?: Force;
  want?: Pred;
  seed?: number;
}

const spins = (r: RoundResult) => [r.trigger, ...(r.bonus?.spins ?? [])];

export const DEV_SCENARIOS: Readonly<Record<string, Spec>> = {
  train: {
    note: 'One locomotive collects three Fare Coins in its row.',
    kind: 'base',
    force: { grid: grid({ [P(0, 1)]: Sym.LOCO, [P(2, 1)]: Sym.COIN, [P(4, 1)]: Sym.COIN, [P(5, 1)]: Sym.COIN, [P(3, 2)]: Sym.COIN }), values: { [P(2, 1)]: 2, [P(4, 1)]: 5, [P(5, 1)]: 1, [P(3, 2)]: 10 } },
  },
  junction: {
    note: 'A Junction sends branch trains up and down; the down branch hits a second Junction.',
    kind: 'base',
    force: {
      grid: grid({ [P(0, 1)]: Sym.LOCO, [P(1, 1)]: Sym.COIN, [P(2, 1)]: Sym.SWITCH, [P(3, 0)]: Sym.COIN, [P(2, 2)]: Sym.COIN, [P(4, 2)]: Sym.SWITCH, [P(5, 3)]: Sym.COIN, [P(5, 1)]: Sym.COIN }),
      values: { [P(1, 1)]: 1, [P(3, 0)]: 3, [P(2, 2)]: 2, [P(5, 3)]: 15, [P(5, 1)]: 0.5 },
    },
  },
  multi: {
    note: 'Three locomotives at once, coins in every row, one big coin.',
    kind: 'base',
    force: {
      grid: grid({ [P(0, 0)]: Sym.LOCO, [P(0, 2)]: Sym.LOCO, [P(0, 3)]: Sym.LOCO, [P(1, 0)]: Sym.COIN, [P(3, 0)]: Sym.COIN, [P(2, 2)]: Sym.COIN, [P(5, 2)]: Sym.COIN, [P(4, 3)]: Sym.COIN, [P(4, 1)]: Sym.COIN }),
      values: { [P(1, 0)]: 2, [P(3, 0)]: 1, [P(2, 2)]: 5, [P(5, 2)]: 100, [P(4, 3)]: 3, [P(4, 1)]: 25 },
    },
  },
  ways: {
    note: 'A 6-reel Conductor way win with Live Wires.',
    kind: 'base',
    force: { grid: grid({ [P(0, 0)]: Sym.TOP, [P(1, 1)]: Sym.WILD, [P(2, 0)]: Sym.TOP, [P(2, 3)]: Sym.TOP, [P(3, 2)]: Sym.TOP, [P(4, 0)]: Sym.WILD, [P(5, 3)]: Sym.TOP }) },
  },
  tease: {
    note: 'Coins land but no locomotive: nothing collects them.',
    kind: 'base',
    force: { grid: grid({ [P(2, 1)]: Sym.COIN, [P(4, 2)]: Sym.COIN, [P(5, 0)]: Sym.COIN }), values: { [P(2, 1)]: 50, [P(4, 2)]: 5, [P(5, 0)]: 2 } },
  },
  bonus: {
    note: 'Four Golden Tickets trigger Rush Hour (natural bonus with a level-up).',
    kind: 'base',
    force: { scatCount: 4 },
    want: (r) => (r.bonus?.spins ?? []).some((s) => s.levelAfter > s.levelBefore),
    seed: 1,
  },
  rushBig: {
    note: 'A Rush Hour buy that reaches x5 power or more.',
    kind: 'buy_witching',
    want: (r) => (r.bonus?.spins ?? []).some((s) => s.levelAfter >= 3) && r.totalWin > 200,
    seed: 1,
  },
  lastTrain: {
    note: 'Last Train: the Golden Locomotive collects every spin, with a branch along the way.',
    kind: 'buy_inferno',
    want: (r) => (r.bonus?.spins ?? []).some((s) => s.trains.some((t) => t.parent >= 0)) && r.totalWin > 300,
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
