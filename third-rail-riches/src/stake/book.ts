/**
 * Stake Engine book format for Third Rail Riches.
 *
 * Every game round uploaded to the RGS is one "book": { id, events, payoutMultiplier }.
 * payoutMultiplier is an integer in hundredths of the base bet (1150 = 11.5x), and must equal
 * the CSV lookup-table payout exactly. `events` is what /wallet/play returns as round.state;
 * the frontend rebuilds a RoundResult from it with `bookToRound`.
 *
 * Event order for a round:
 *   {type:'spin', spin}                         the paid spin (base / Express Pass spin or buy trigger spin)
 *   {type:'bonusStart', kind, awarded, ...}     only if free spins were won
 *   {type:'spin', spin, retrigger?}             one per free spin
 *   {type:'final', totalWin, maxWin}            always last; totalWin in bet multiples
 *
 * To keep books small a spin's grid is written as symbol ids (`g`) plus the Fare Coin values by
 * position (`v`); cell ids are not written (bookToRound rebuilds them: a held coin keeps the id it
 * had on the spin before, every other cell gets a fresh one).
 */
import { BOOST_COST, CELLS, COST, Sym, type BonusKind, type Cell, type RoundKind, type RoundResult, type SpinResult, type Train } from '../math/types';

export type StakeMode = 'BASE' | 'BOOST' | 'WITCHING' | 'INFERNO';
export const STAKE_MODES: readonly StakeMode[] = ['BASE', 'BOOST', 'WITCHING', 'INFERNO'];
export const MODE_OF_KIND: Record<RoundKind, StakeMode> = { base: 'BASE', boost: 'BOOST', buy_witching: 'WITCHING', buy_inferno: 'INFERNO' };
export const KIND_OF_MODE: Record<StakeMode, RoundKind> = { BASE: 'base', BOOST: 'boost', WITCHING: 'buy_witching', INFERNO: 'buy_inferno' };
/** Cost of a round in bet multiples (the RGS debits bet x cost). */
export const MODE_COST: Record<StakeMode, number> = { BASE: 1, BOOST: BOOST_COST, WITCHING: COST.buy_witching, INFERNO: COST.buy_inferno };

export type BookTrain = Omit<Train, 'coins'> & { coins: { pos: number; value: number }[] };
export type BookSpin = Omit<SpinResult, 'grid' | 'trains'> & {
  /** Symbol id per position. */
  g: number[];
  /** Fare Coin value by position. */
  v: Record<number, number>;
  trains: BookTrain[];
};

export type BookEvent =
  | { index: number; type: 'spin'; spin: BookSpin; retrigger?: number }
  | { index: number; type: 'bonusStart'; kind: BonusKind; awarded: number; goldenRow: number; powerStart: number }
  | { index: number; type: 'final'; totalWin: number; maxWin: boolean };

export interface Book {
  id: number;
  events: BookEvent[];
  payoutMultiplier: number; // integer hundredths
}

/** Hundredths, exactly as written to the CSV (never float-drifts). */
export const toHundredths = (multiple: number) => Math.round(multiple * 100);

function stripSpin(s: SpinResult): BookSpin {
  const { grid, trains, ...rest } = s;
  const v: Record<number, number> = {};
  grid.forEach((c, p) => {
    if (c.sym === Sym.COIN) v[p] = c.value ?? 0;
  });
  return { ...rest, g: grid.map((c) => c.sym), v, trains: trains.map((t) => ({ ...t, coins: t.coins.map(({ pos, value }) => ({ pos, value })) })) };
}

export function roundToBook(id: number, r: RoundResult): Book {
  const events: BookEvent[] = [];
  let i = 0;
  events.push({ index: i++, type: 'spin', spin: stripSpin(r.trigger) });
  if (r.bonus) {
    const b = r.bonus;
    events.push({ index: i++, type: 'bonusStart', kind: b.kind, awarded: b.awarded, goldenRow: b.goldenRow, powerStart: b.powerStart });
    b.spins.forEach((s, k) => {
      const re = b.retriggers.find((x) => x.afterSpin === k);
      events.push({ index: i++, type: 'spin', spin: stripSpin(s), ...(re ? { retrigger: re.added } : {}) });
    });
  }
  events.push({ index: i++, type: 'final', totalWin: r.totalWin, maxWin: r.maxWin });
  return { id, events, payoutMultiplier: toHundredths(r.totalWin) };
}

/** Rebuild a spin's cells (ids: a held cell keeps the previous spin's id at that position). */
function fullSpin(s: BookSpin, prev: Cell[] | null, nextId: { n: number }, golden: number): SpinResult {
  const held = new Set(s.held);
  const grid: Cell[] = [];
  for (let p = 0; p < CELLS; p++) {
    const sym = s.g[p] as Sym;
    const c: Cell = { sym, id: 0 };
    if (sym === Sym.COIN) c.value = s.v[p] ?? 0;
    if (held.has(p)) {
      c.held = true;
      c.id = p === golden ? 0 : (prev?.[p]?.id ?? nextId.n++);
    } else c.id = nextId.n++;
    if (p === golden && sym === Sym.LOCO) c.golden = true;
    grid.push(c);
  }
  const trains: Train[] = s.trains.map((t) => ({ ...t, coins: t.coins.map((c) => ({ ...c, id: grid[c.pos].id })) }));
  const { g, v, ...rest } = s;
  void g;
  void v;
  return { ...rest, grid, trains };
}

/** Rebuild the presenter's RoundResult from RGS state. */
export function bookToRound(events: BookEvent[], mode: StakeMode, payoutMultiplier?: number): RoundResult {
  const spins = events.filter((e): e is Extract<BookEvent, { type: 'spin' }> => e.type === 'spin');
  const start = events.find((e): e is Extract<BookEvent, { type: 'bonusStart' }> => e.type === 'bonusStart');
  const fin = events.find((e): e is Extract<BookEvent, { type: 'final' }> => e.type === 'final');
  const kind = KIND_OF_MODE[mode] ?? 'base';
  const totalWin = fin ? fin.totalWin : (payoutMultiplier ?? 0) / 100;
  const nextId = { n: 1 };
  const trigger = fullSpin(spins[0].spin, null, nextId, -1);
  const r: RoundResult = { kind, costMultiple: MODE_COST[mode] ?? 1, trigger, totalWin, maxWin: fin?.maxWin ?? false };
  if (start) {
    const bonusSpins = spins.slice(1);
    let total = start.awarded;
    const retriggers = bonusSpins
      .map((e, k) => (e.retrigger ? { afterSpin: k, scatCount: e.spin.scatCount, added: e.retrigger } : null))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    for (const re of retriggers) total += re.added;
    let prev: Cell[] | null = null;
    const full = bonusSpins.map((e) => {
      const s = fullSpin(e.spin, prev, nextId, start.goldenRow);
      prev = s.grid;
      total += s.levelSpins;
      return s;
    });
    r.bonus = {
      kind: start.kind,
      awarded: start.awarded,
      spins: full,
      retriggers,
      totalSpins: r.maxWin ? full.length : total,
      bonusWin: bonusSpins.reduce((a, e) => a + e.spin.spinWin, 0),
      goldenRow: start.goldenRow,
      powerStart: start.powerStart,
    };
  }
  return r;
}
