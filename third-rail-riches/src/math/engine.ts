/**
 * Third Rail Riches math engine. playRound() computes a whole round (paid spin, then any bonus);
 * the renderer only animates the result. Rules: src/math/types.ts and docs/MATH.md.
 *
 * Money is added in integer hundredths of the bet and converted to bet multiples once per result.
 * `record: false` skips building the per-spin presentation arrays the simulator does not need
 * (identical RNG use, parity-tested).
 */
import { PAY_H, TIERS } from './paytable';
import { BUY_RUSH_SCATS, COIN_VALUES, LAST_TRAIN, RETRIGGER_MIN, RETRIGGER_SPINS, RUSH_SPINS, TRIGGER_MIN, TUNED, type Model, type ModelMode, type SetSpec } from './model';
import { createRng, type Rng } from './rng';
import {
  CELLS,
  COST,
  LEVEL_SPINS,
  MAX_WIN,
  MAX_WIN_H,
  MIN_REELS,
  PAYING_SYMBOLS,
  POWER_STEPS,
  REELS,
  ROWS,
  Sym,
  levelOf,
  multOfLevel,
  type BonusKind,
  type BonusResult,
  type Cell,
  type Force,
  type Pos,
  type RoundKind,
  type RoundResult,
  type SpinResult,
  type Train,
  type WayWin,
} from './types';

const COIN_H = COIN_VALUES.map((v) => Math.round(v * 100));

/** A parameter set compiled to cumulative tables. */
export interface CompiledSet {
  minLoco: number;
  /** Reel 1: cumulative over [paying 0..8, LOCO]. */
  reel1: Float64Array;
  /** Reels 2-5: cumulative over [paying 0..8, WILD, COIN, SWITCH]. */
  mid: Float64Array;
  /** Reel 6: as mid without SWITCH. */
  last: Float64Array;
  fsCum: Float64Array;
  coinCum: Float64Array;
}
export type CompiledModel = Record<ModelMode, CompiledSet>;

function cumulative(w: readonly number[]): Float64Array {
  const total = w.reduce((a, b) => a + b, 0);
  const out = new Float64Array(w.length);
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i] / total;
    out[i] = acc;
  }
  out[w.length - 1] = 1;
  return out;
}

function compileSet(s: SetSpec): CompiledSet {
  const payTotal = s.pay.reduce((a, b) => a + b, 0);
  const pay = (share: number) => s.pay.map((w) => (w / payTotal) * share);
  return {
    minLoco: s.minLoco ?? 0,
    reel1: cumulative([...pay(1 - s.loco), s.loco]),
    mid: cumulative([...pay(1 - s.wild - s.coin - s.switch), s.wild, s.coin, s.switch]),
    last: cumulative([...pay(1 - s.wild - s.coin), s.wild, s.coin]),
    fsCum: cumulative(s.fsDist),
    coinCum: cumulative(s.coinWeights),
  };
}

export function compileModel(m: Model): CompiledModel {
  return { base: compileSet(m.base), boost: compileSet(m.boost), rush: compileSet(m.rush), last: compileSet(m.last) };
}

export const DEFAULT_MODEL: CompiledModel = compileModel(TUNED);

function pick(cum: Float64Array, u: number): number {
  let i = 0;
  while (i < cum.length - 1 && u >= cum[i]) i++;
  return i;
}

/** Counters the simulator reads (optional). */
export interface EngineCounters {
  spins: number;
  waysH: number;
  trainH: number;
  locos: number;
  trains: number;
  branches: number;
  coinsLanded: number;
  coinsCollected: number;
  levelUps: number;
}
export const createCounters = (): EngineCounters => ({ spins: 0, waysH: 0, trainH: 0, locos: 0, trains: 0, branches: 0, coinsLanded: 0, coinsCollected: 0, levelUps: 0 });

export interface PlayOptions {
  kind: RoundKind;
  rng?: Rng;
  force?: Force;
  record?: boolean;
  model?: CompiledModel;
  counters?: { base: EngineCounters; free: EngineCounters };
}

interface Ctx {
  rng: Rng;
  record: boolean;
  nextId: number;
  model: CompiledModel;
}

/** Ways evaluation on a grid of symbol ids. Returns total hundredths; fills `out` when given. */
export function evalWays(syms: Int8Array, out: WayWin[] | null): number {
  let total = 0;
  for (let s = 0; s < PAYING_SYMBOLS; s++) {
    let ways = 1;
    let reels = 0;
    for (let r = 0; r < REELS; r++) {
      let n = 0;
      for (let row = 0; row < ROWS; row++) {
        const v = syms[r * ROWS + row];
        if (v === s || (r > 0 && v === Sym.WILD)) n++;
      }
      if (n === 0) break;
      ways *= n;
      reels++;
    }
    if (reels < MIN_REELS) continue;
    const payH = PAY_H[s * TIERS + reels - MIN_REELS] * ways;
    total += payH;
    if (out) {
      const positions: Pos[] = [];
      for (let p = 0; p < reels * ROWS; p++) {
        const v = syms[p];
        if (v === s || (p >= ROWS && v === Sym.WILD)) positions.push(p);
      }
      out.push({ sym: s as Sym, reels, ways, positions, basePay: PAY_H[s * TIERS + reels - MIN_REELS] / 100, pay: payH / 100 });
    }
  }
  return total;
}

/**
 * Run the trains on a grid. Locomotives (reel 1) leave in row order; all trains advance one column
 * at a time and enter it together; then each Junction a train stands on sends branches into the
 * rows above and below, in its own column, if those cells are not already run. A train stops when
 * the cell ahead was already run. Returns the haul in hundredths and fills `trains`.
 */
export function runTrains(syms: Int8Array, valH: Int32Array, ids: Int32Array, trains: Train[], collected: Uint8Array): number {
  const visited = new Uint8Array(CELLS);
  collected.fill(0);
  let haul = 0;
  const alive: boolean[] = [];
  /** The train moves into (c, row): it runs the cell and collects a coin there. */
  const occupy = (t: Train, c: number) => {
    const p = c * ROWS + t.row;
    visited[p] = 1;
    t.to = c;
    if (syms[p] === Sym.COIN) {
      haul += valH[p];
      collected[p] = 1;
      t.coins.push({ pos: p, value: valH[p] / 100, id: ids[p] });
    }
  };
  /** A train standing on a Junction sends branches into the free cells above and below (recursively). */
  const branch = (ti: number, c: number) => {
    const t = trains[ti];
    const p = c * ROWS + t.row;
    if (syms[p] !== Sym.SWITCH) return;
    t.switches.push(p);
    for (const dr of [-1, 1]) {
      const row = t.row + dr;
      if (row < 0 || row >= ROWS) continue;
      if (visited[c * ROWS + row]) continue;
      const b: Train = { row, from: c, parent: ti, via: p, coins: [], switches: [], to: c };
      trains.push(b);
      alive.push(true);
      occupy(b, c);
      branch(trains.length - 1, c);
    }
  };
  for (let row = 0; row < ROWS; row++) {
    if (syms[row] !== Sym.LOCO) continue;
    trains.push({ row, from: 0, parent: -1, via: -1, coins: [], switches: [], to: 0 });
    alive.push(true);
    visited[row] = 1;
  }
  for (let c = 1; c < REELS; c++) {
    // every running train enters the column first (they arrive together), then the junctions fire
    const n = trains.length;
    const entered: number[] = [];
    for (let ti = 0; ti < n; ti++) {
      if (!alive[ti]) continue;
      if (visited[c * ROWS + trains[ti].row]) {
        alive[ti] = false;
        continue;
      }
      occupy(trains[ti], c);
      entered.push(ti);
    }
    for (const ti of entered) branch(ti, c);
  }
  return haul;
}

interface SpinState {
  /** Bonus only: sticky coins by position (value hundredths, id); -1 = none. */
  stickyVal: Int32Array;
  stickyId: Int32Array;
  goldenRow: number;
  power: number;
}

interface SpinOut {
  result: SpinResult | null;
  winH: number;
  scat: number;
  levelSpins: number;
}

function playSpin(ctx: Ctx, set: ModelMode, mode: SpinResult['mode'], st: SpinState | null, force: Force | null, totalBeforeH: number, ctr?: EngineCounters): SpinOut {
  const { rng, record } = ctx;
  const cm = ctx.model[set];
  const syms = new Int8Array(CELLS).fill(-1);
  const valH = new Int32Array(CELLS);
  const ids = new Int32Array(CELLS);
  const heldMask = new Uint8Array(CELLS);
  // held cells first: sticky coins, then the Golden Locomotive
  if (st) {
    for (let p = 0; p < CELLS; p++) {
      if (st.stickyVal[p] >= 0) {
        syms[p] = Sym.COIN;
        valH[p] = st.stickyVal[p];
        ids[p] = st.stickyId[p];
        heldMask[p] = 1;
      }
    }
    if (st.goldenRow >= 0) {
      const p = st.goldenRow;
      syms[p] = Sym.LOCO;
      ids[p] = -2; // fixed id below
      heldMask[p] = 1;
    }
  }
  if (force?.grid) {
    for (let p = 0; p < CELLS; p++) {
      syms[p] = force.grid[p];
      if (syms[p] === Sym.COIN) valH[p] = Math.round((force.values?.[p] ?? 1) * 100);
    }
  } else {
    // tickets: k distinct reels, a random free row on each
    let k = force?.scatCount ?? pick(cm.fsCum, rng.next());
    if (k > 0) {
      const reels = [0, 1, 2, 3, 4, 5];
      for (let i = 0; i < 6 && k > 0; i++) {
        const j = i + rng.int(6 - i);
        const r = reels[j];
        reels[j] = reels[i];
        reels[i] = r;
        const free: number[] = [];
        for (let row = 0; row < ROWS; row++) if (syms[r * ROWS + row] < 0) free.push(r * ROWS + row);
        if (!free.length) continue;
        syms[free[rng.int(free.length)]] = Sym.FS;
        k--;
      }
    }
    let locoLeft = force?.locoCount;
    if (locoLeft !== undefined) {
      const rows: number[] = [];
      for (let row = 0; row < ROWS; row++) if (syms[row] < 0) rows.push(row);
      while (locoLeft > 0 && rows.length) {
        const j = rng.int(rows.length);
        syms[rows[j]] = Sym.LOCO;
        rows.splice(j, 1);
        locoLeft--;
      }
    }
    for (let p = 0; p < CELLS; p++) {
      if (syms[p] >= 0) continue;
      const r = (p / ROWS) | 0;
      const u = rng.next();
      if (r === 0) {
        const i = pick(cm.reel1, u);
        syms[p] = i === PAYING_SYMBOLS ? (force?.locoCount !== undefined ? pickPaying(cm.reel1, rng) : Sym.LOCO) : i;
      } else {
        const i = pick(r === REELS - 1 ? cm.last : cm.mid, u);
        if (i < PAYING_SYMBOLS) syms[p] = i;
        else if (i === PAYING_SYMBOLS) syms[p] = Sym.WILD;
        else if (i === PAYING_SYMBOLS + 1) {
          syms[p] = Sym.COIN;
          valH[p] = COIN_H[pick(cm.coinCum, rng.next())];
        } else syms[p] = Sym.SWITCH;
      }
    }
  }
  if (!force?.grid && cm.minLoco > 0) {
    // Express Pass: a Locomotive on a random reel-1 row that holds a paying symbol, if none landed
    let n = 0;
    const rows: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      if (syms[row] === Sym.LOCO) n++;
      else if (syms[row] < PAYING_SYMBOLS && !heldMask[row]) rows.push(row);
    }
    if (n < cm.minLoco && rows.length) syms[rows[ctx.rng.int(rows.length)]] = Sym.LOCO;
  }
  for (let p = 0; p < CELLS; p++) if (!heldMask[p] || force?.grid) ids[p] = ctx.nextId++;
  if (st && st.goldenRow >= 0 && !force?.grid) ids[st.goldenRow] = 0; // the Golden Locomotive keeps id 0 all bonus

  const ways: WayWin[] | null = record ? [] : null;
  const waysH = evalWays(syms, ways);
  const trains: Train[] = [];
  const collected = new Uint8Array(CELLS);
  const haulH = runTrains(syms, valH, ids, trains, collected);
  const levelBefore = st ? levelOf(st.power) : 0;
  const mult = st ? multOfLevel(levelBefore) : 1;
  const trainH = haulH * mult;
  let scat = 0;
  const scatPositions: Pos[] = [];
  let coinsCollected = 0;
  for (let p = 0; p < CELLS; p++) {
    if (syms[p] === Sym.FS) {
      scat++;
      scatPositions.push(p);
    }
    if (collected[p]) coinsCollected++;
  }
  // bonus bookkeeping: sticky coins, power meter
  let powerBefore = 0;
  let powerAfter = 0;
  let levelAfter = levelBefore;
  let levelSpins = 0;
  if (st) {
    powerBefore = st.power;
    st.power += coinsCollected;
    powerAfter = st.power;
    levelAfter = levelOf(st.power);
    levelSpins = (levelAfter - levelBefore) * LEVEL_SPINS;
    for (let p = 0; p < CELLS; p++) {
      if (syms[p] === Sym.COIN && !collected[p]) {
        st.stickyVal[p] = valH[p];
        st.stickyId[p] = ids[p];
      } else {
        st.stickyVal[p] = -1;
        st.stickyId[p] = -1;
      }
    }
  }
  let winH = waysH + trainH;
  let maxWin = false;
  if (totalBeforeH + winH >= MAX_WIN_H) {
    winH = MAX_WIN_H - totalBeforeH;
    maxWin = true;
  }
  if (ctr) {
    ctr.spins++;
    ctr.waysH += waysH;
    ctr.trainH += trainH;
    for (let row = 0; row < ROWS; row++) if (syms[row] === Sym.LOCO) ctr.locos++;
    ctr.trains += trains.length;
    for (const t of trains) if (t.parent >= 0) ctr.branches++;
    for (let p = 0; p < CELLS; p++) if (syms[p] === Sym.COIN && !heldMask[p]) ctr.coinsLanded++;
    ctr.coinsCollected += coinsCollected;
    ctr.levelUps += levelAfter - levelBefore;
  }
  let result: SpinResult | null = null;
  if (record) {
    const grid: Cell[] = [];
    const held: Pos[] = [];
    for (let p = 0; p < CELLS; p++) {
      const c: Cell = { sym: syms[p] as Sym, id: ids[p] };
      if (syms[p] === Sym.COIN) c.value = valH[p] / 100;
      if (heldMask[p] && !force?.grid) {
        c.held = true;
        held.push(p);
      }
      if (st && p === st.goldenRow && !force?.grid) c.golden = true;
      grid.push(c);
    }
    result = {
      mode,
      grid,
      held,
      ways: ways!,
      waysWin: waysH / 100,
      trains,
      haul: haulH / 100,
      mult,
      trainWin: trainH / 100,
      spinWin: winH / 100,
      scatCount: scat,
      scatPositions,
      powerBefore,
      powerAfter,
      levelBefore,
      levelAfter,
      levelSpins,
      maxWin,
    };
  }
  return { result, winH, scat, levelSpins };
}

/** A paying symbol from reel 1's table, redrawn until it is not a Locomotive (forced loco counts). */
function pickPaying(cum: Float64Array, rng: Rng): number {
  for (;;) {
    const i = pick(cum, rng.next());
    if (i < PAYING_SYMBOLS) return i;
  }
}

function playBonus(ctx: Ctx, kind: BonusKind, awarded: number, totalBeforeH: number, ctr?: EngineCounters): { bonus: BonusResult | null; winH: number; maxWin: boolean; spins: number; retriggers: number } {
  const st: SpinState = { stickyVal: new Int32Array(CELLS).fill(-1), stickyId: new Int32Array(CELLS).fill(-1), goldenRow: -1, power: 0 };
  const set: ModelMode = kind === 'last' ? 'last' : 'rush';
  if (kind === 'last') {
    st.goldenRow = ctx.rng.int(ROWS);
    st.power = POWER_STEPS[LAST_TRAIN.level - 1];
  }
  const powerStart = st.power;
  const spins: SpinResult[] = [];
  const retriggers: BonusResult['retriggers'] = [];
  let total = awarded;
  let winH = 0;
  let maxWin = false;
  let played = 0;
  let nRe = 0;
  for (let i = 0; i < total; i++) {
    const out = playSpin(ctx, set, kind, st, null, totalBeforeH + winH, ctr);
    played++;
    winH += out.winH;
    if (out.result) spins.push(out.result);
    if (out.result?.maxWin || totalBeforeH + winH >= MAX_WIN_H) {
      maxWin = true;
      break;
    }
    total += out.levelSpins;
    if (out.scat >= RETRIGGER_MIN) {
      total += RETRIGGER_SPINS;
      nRe++;
      retriggers.push({ afterSpin: i, scatCount: out.scat, added: RETRIGGER_SPINS });
    }
  }
  const bonus: BonusResult | null = ctx.record
    ? { kind, awarded, spins, retriggers, totalSpins: maxWin ? played : total, bonusWin: winH / 100, goldenRow: st.goldenRow, powerStart }
    : null;
  return { bonus, winH, maxWin, spins: played, retriggers: nRe };
}

/** Light-weight stats from the last fast-path round (simulator). */
export const lastRoundInfo = { bonus: false, bonusH: 0, freeSpins: 0, retriggers: 0, triggerScat: 0 };

export function playRound(opts: PlayOptions): RoundResult {
  const kind = opts.kind;
  const ctx: Ctx = { rng: opts.rng ?? createRng(), record: opts.record ?? true, nextId: 1, model: opts.model ?? DEFAULT_MODEL };
  const force = opts.force ?? null;
  const set: ModelMode = kind === 'boost' ? 'boost' : 'base';
  let trigForce: Force | null = force;
  if (kind === 'buy_witching' || kind === 'buy_inferno') {
    let sc = force?.scatCount;
    if (sc === undefined) sc = kind === 'buy_inferno' ? LAST_TRAIN.scatters : pick(cumulative(BUY_RUSH_SCATS), ctx.rng.next());
    if (sc < TRIGGER_MIN) throw new Error('a buy needs 3+ tickets');
    trigForce = { ...(force ?? {}), scatCount: sc };
  }
  const trig = playSpin(ctx, set, 'base', null, trigForce, 0, opts.counters?.base);
  let totalH = trig.winH;
  let maxWin = trig.winH >= MAX_WIN_H;
  let bonus: BonusResult | undefined;
  lastRoundInfo.bonus = false;
  lastRoundInfo.bonusH = 0;
  lastRoundInfo.freeSpins = 0;
  lastRoundInfo.retriggers = 0;
  lastRoundInfo.triggerScat = trig.scat;
  if (!maxWin) {
    let bkind: BonusKind | null = null;
    let awarded = 0;
    if (kind === 'buy_inferno') {
      bkind = 'last';
      awarded = LAST_TRAIN.spins;
    } else if (trig.scat >= TRIGGER_MIN) {
      bkind = 'rush';
      awarded = RUSH_SPINS[Math.min(trig.scat, 6)];
    }
    if (bkind) {
      const b = playBonus(ctx, bkind, awarded, totalH, opts.counters?.free);
      totalH += b.winH;
      maxWin = b.maxWin;
      if (b.bonus) bonus = b.bonus;
      lastRoundInfo.bonus = true;
      lastRoundInfo.bonusH = b.winH;
      lastRoundInfo.freeSpins = b.spins;
      lastRoundInfo.retriggers = b.retriggers;
    }
  }
  if (totalH >= MAX_WIN_H) {
    totalH = MAX_WIN_H;
    maxWin = true;
  }
  const trigger = trig.result ?? (null as unknown as SpinResult);
  return { kind, costMultiple: COST[kind], trigger, bonus, totalWin: totalH / 100, maxWin };
}

export { MAX_WIN };
