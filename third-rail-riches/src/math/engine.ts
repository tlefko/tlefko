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
import { LINES, NEIGHBOURS, STATIONS, TERMINALS, TICKET_STATIONS, departure } from './network';
import { createRng, type Rng } from './rng';
import {
  CELLS,
  COST,
  CRASH_MULT,
  LEVEL_SPINS,
  MAX_BEATS,
  MAX_WIN,
  MAX_WIN_H,
  MIN_RUN,
  PAYING_SYMBOLS,
  POWER_STEPS,
  REPAY_MULT,
  Sym,
  levelOf,
  multOfLevel,
  type BonusKind,
  type BonusResult,
  type Cell,
  type Crash,
  type Force,
  type Pos,
  type RoundKind,
  type RoundResult,
  type RouteWin,
  type SpinResult,
  type Train,
} from './types';

const COIN_H = COIN_VALUES.map((v) => Math.round(v * 100));
/** The special each station kind can land. */
const KIND_SPECIAL = { terminal: Sym.LOCO, interchange: Sym.SIGNAL, stop: Sym.SECURITY } as const;

/** A parameter set compiled to cumulative tables. */
export interface CompiledSet {
  minLoco: number;
  /** Per station: cumulative over [paying 0..8, WILD, COIN, the station kind's special]. */
  table: Float64Array[];
  /** Terminals when the Locomotive count is forced: the same table without LOCO. */
  noLoco: Float64Array;
  fsCum: Float64Array;
  coinCum: Float64Array;
  clear: number;
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
  const row = (special: number) => cumulative([...pay(1 - s.wild - s.coin - special), s.wild, s.coin, special]);
  const byKind = { terminal: row(s.loco), interchange: row(s.signal), stop: row(s.security) };
  return {
    minLoco: s.minLoco ?? 0,
    table: STATIONS.map((st) => byKind[st.kind]),
    noLoco: row(0),
    fsCum: cumulative(s.fsDist),
    coinCum: cumulative(s.coinWeights),
    clear: s.clear,
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
  routesH: number;
  trainH: number;
  crashH: number;
  locos: number;
  crashes: number;
  redirects: number;
  clears: number;
  helds: number;
  coinsLanded: number;
  coinsCollected: number;
  levelUps: number;
}
export const createCounters = (): EngineCounters => ({
  spins: 0,
  routesH: 0,
  trainH: 0,
  crashH: 0,
  locos: 0,
  crashes: 0,
  redirects: 0,
  clears: 0,
  helds: 0,
  coinsLanded: 0,
  coinsCollected: 0,
  levelUps: 0,
});

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

const matches = (v: number, s: number) => v === s || v === Sym.WILD;

/**
 * Route wins on a board of symbol ids: for every line and paying symbol, every maximal run of 3+
 * consecutive stations holding the symbol or a Live Wire (with at least one of the symbol) pays.
 * Returns total hundredths; fills `out` when given.
 */
export function evalRoutes(syms: Int8Array, out: RouteWin[] | null): number {
  let total = 0;
  for (let li = 0; li < LINES.length; li++) {
    const st = LINES[li].stops;
    const n = st.length;
    for (let s = 0; s < PAYING_SYMBOLS; s++) {
      let i = 0;
      while (i < n) {
        if (!matches(syms[st[i]], s)) {
          i++;
          continue;
        }
        let j = i;
        let has = false;
        while (j < n && matches(syms[st[j]], s)) {
          if (syms[st[j]] === s) has = true;
          j++;
        }
        const len = j - i;
        if (len >= MIN_RUN && has) {
          const payH = PAY_H[s * TIERS + len - MIN_RUN];
          total += payH;
          if (out) out.push({ sym: s as Sym, line: li, stations: st.slice(i, j), pay: payH / 100 });
        }
        i = j;
      }
    }
  }
  return total;
}

interface Run {
  line: number;
  idx: number;
  dir: 1 | -1;
  at: Pos;
  wait: number;
  used: number; // bitmask of signals already taken
  alive: boolean;
  haulH: number;
}

/**
 * Run the trains. Every Locomotive departs its terminal at beat 0; each beat every running train
 * moves one station along its line (a train waiting at a security check stays). Collisions are
 * found before anyone moves: two trains entering the same station, two trains swapping stations
 * (head-on), or a train entering the station a waiting train stands at. Then every other train
 * enters its station: it collects a coin there, a Signal redirects it onto the crossing line, a
 * Security Check stops it (ALL CLEAR: wait a beat, Delay Repay x2; INCIDENT: held). Crashes take the
 * coins at and around the crash into the pile and pay pile x CRASH_MULT.
 * Returns the train payout in hundredths (before the POWER multiplier).
 */
export function runTrains(
  syms: Int8Array,
  valH: Int32Array,
  ids: Int32Array,
  golden: number,
  secure: () => boolean,
  trains: Train[],
  crashes: Crash[],
  collected: Uint8Array,
  ctr?: EngineCounters,
): number {
  collected.fill(0);
  const runs: Run[] = [];
  for (const t of TERMINALS) {
    if (syms[t] !== Sym.LOCO) continue;
    const d = departure(t);
    runs.push({ line: d.line, idx: d.idx, dir: d.dir, at: t, wait: 0, used: 0, alive: true, haulH: 0 });
    const tr: Train = { start: t, line: d.line, steps: [], coins: [], repay: 1, end: 'arrive', endBeat: 0, crash: -1, haul: 0 };
    if (t === golden) tr.golden = true;
    trains.push(tr);
  }
  if (!runs.length) return 0;
  const n = runs.length;
  const target = new Int32Array(n);
  const parent = new Int32Array(n);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const crashedAt: Pos[][] = Array.from({ length: n }, () => []);
  let payH = 0;
  for (let beat = 1; beat <= MAX_BEATS; beat++) {
    let active = 0;
    for (let i = 0; i < n; i++) {
      parent[i] = i;
      crashedAt[i].length = 0;
      target[i] = -1;
      const r = runs[i];
      if (!r.alive) continue;
      active++;
      if (r.wait > 0) continue;
      const ni = r.idx + r.dir;
      const stops = LINES[r.line].stops;
      if (ni < 0 || ni >= stops.length) {
        r.alive = false;
        trains[i].end = 'arrive';
        active--;
        continue;
      }
      target[i] = stops[ni];
    }
    if (!active) break;
    // collisions
    const hit = new Uint8Array(n);
    const join = (a: number, b: number, at: Pos[]) => {
      hit[a] = hit[b] = 1;
      crashedAt[a].push(...at);
      crashedAt[b].push(...at);
      parent[find(a)] = find(b);
    };
    for (let a = 0; a < n; a++) {
      if (!runs[a].alive || target[a] < 0) continue;
      for (let b = 0; b < n; b++) {
        if (a === b || !runs[b].alive) continue;
        if (target[b] < 0) {
          if (target[a] === runs[b].at) join(a, b, [runs[b].at]); // ran into a waiting train
        } else if (b > a) {
          if (target[a] === target[b]) join(a, b, [target[a]]);
          else if (target[a] === runs[b].at && target[b] === runs[a].at) join(a, b, [runs[a].at, runs[b].at]);
        }
      }
    }
    // everyone not crashing moves (or waits)
    for (let i = 0; i < n; i++) {
      const r = runs[i];
      if (!r.alive || hit[i]) continue;
      if (target[i] < 0) {
        r.wait--;
        continue;
      }
      const t = trains[i];
      const at = target[i];
      r.idx += r.dir;
      r.at = at;
      t.endBeat = beat;
      const step: Train['steps'][number] = { beat, at, line: r.line };
      t.steps.push(step);
      if (syms[at] === Sym.COIN && !collected[at]) {
        collected[at] = 1;
        r.haulH += valH[at];
        t.coins.push({ at, value: valH[at] / 100, id: ids[at], beat });
      }
      const sym = syms[at];
      if (sym === Sym.SIGNAL && !(r.used & (1 << at))) {
        r.used |= 1 << at;
        const other = STATIONS[at].lines.find((l) => l !== r.line)!;
        const stops = LINES[other].stops;
        const k = stops.indexOf(at);
        r.line = other;
        r.idx = k;
        r.dir = stops.length - 1 - k >= k ? 1 : -1;
        step.event = 'redirect';
        if (ctr) ctr.redirects++;
      } else if (sym === Sym.SECURITY) {
        if (secure()) {
          r.wait = 1;
          t.repay *= REPAY_MULT;
          step.event = 'clear';
          if (ctr) ctr.clears++;
        } else {
          r.alive = false;
          t.end = 'held';
          step.event = 'held';
          if (ctr) ctr.helds++;
        }
      }
    }
    // crashes, one per connected group
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      if (!hit[i]) continue;
      const g = find(i);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(i);
    }
    for (const members of groups.values()) {
      const sites = [...new Set(members.flatMap((i) => crashedAt[i]))].sort((a, b) => a - b);
      const area = new Set<Pos>(sites);
      for (const s of sites) for (const nb of NEIGHBOURS[s]) area.add(nb);
      let pileH = 0;
      for (const i of members) {
        const r = runs[i];
        r.alive = false;
        trains[i].end = 'crash';
        trains[i].endBeat = beat;
        trains[i].crash = crashes.length;
        pileH += r.haulH * trains[i].repay;
      }
      const wreck: Crash['wreck'] = [];
      for (const s of [...area].sort((a, b) => a - b)) {
        if (syms[s] !== Sym.COIN || collected[s]) continue;
        collected[s] = 1;
        pileH += valH[s];
        wreck.push({ at: s, value: valH[s] / 100, id: ids[s] });
      }
      const pay = pileH * CRASH_MULT;
      payH += pay;
      crashes.push({ beat, at: sites, trains: members, wreck, pile: pileH / 100, mult: CRASH_MULT, pay: pay / 100 });
      if (ctr) {
        ctr.crashes++;
        ctr.crashH += pay;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const t = trains[i];
    t.haul = runs[i].haulH / 100;
    if (runs[i].alive) t.end = 'stall';
    if (t.crash < 0) payH += runs[i].haulH * t.repay;
  }
  return payH;
}

interface SpinState {
  /** Bonus only: sticky coins by station (value hundredths, id); -1 = none. */
  stickyVal: Int32Array;
  stickyId: Int32Array;
  goldenAt: number;
  power: number;
}

interface SpinOut {
  result: SpinResult | null;
  winH: number;
  scat: number;
  levelSpins: number;
}

function shuffleTake(rng: Rng, from: readonly number[], k: number, ok: (p: number) => boolean): number[] {
  const pool = from.filter(ok);
  const out: number[] = [];
  while (k > 0 && pool.length) {
    const j = rng.int(pool.length);
    out.push(pool[j]);
    pool.splice(j, 1);
    k--;
  }
  return out;
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
    if (st.goldenAt >= 0) {
      syms[st.goldenAt] = Sym.LOCO;
      heldMask[st.goldenAt] = 1;
    }
  }
  if (force?.grid) {
    for (let p = 0; p < CELLS; p++) {
      syms[p] = force.grid[p];
      if (syms[p] === Sym.COIN) valH[p] = Math.round((force.values?.[p] ?? 1) * 100);
    }
  } else {
    // tickets: k distinct non-terminal stations
    const k = force?.scatCount ?? pick(cm.fsCum, rng.next());
    if (k > 0) for (const p of shuffleTake(rng, TICKET_STATIONS, k, (p) => syms[p] < 0)) syms[p] = Sym.FS;
    const forcedLocos = force?.locoCount;
    if (forcedLocos !== undefined) for (const p of shuffleTake(rng, TERMINALS, forcedLocos, (p) => syms[p] < 0)) syms[p] = Sym.LOCO;
    for (let p = 0; p < CELLS; p++) {
      if (syms[p] >= 0) continue;
      const kind = STATIONS[p].kind;
      const table = forcedLocos !== undefined && kind === 'terminal' ? cm.noLoco : cm.table[p];
      const i = pick(table, rng.next());
      if (i < PAYING_SYMBOLS) syms[p] = i;
      else if (i === PAYING_SYMBOLS) syms[p] = Sym.WILD;
      else if (i === PAYING_SYMBOLS + 1) {
        syms[p] = Sym.COIN;
        valH[p] = COIN_H[pick(cm.coinCum, rng.next())];
      } else syms[p] = KIND_SPECIAL[kind];
    }
    if (cm.minLoco > 0) {
      // Express Pass: a Locomotive on a random terminal that holds a paying symbol, if none landed
      let have = 0;
      const free: number[] = [];
      for (const t of TERMINALS) {
        if (syms[t] === Sym.LOCO) have++;
        else if (syms[t] < PAYING_SYMBOLS && !heldMask[t]) free.push(t);
      }
      for (const p of shuffleTake(rng, free, cm.minLoco - have, () => true)) syms[p] = Sym.LOCO;
    }
  }
  for (let p = 0; p < CELLS; p++) if (!heldMask[p] || force?.grid) ids[p] = ctx.nextId++;
  const golden = st && st.goldenAt >= 0 && !force?.grid ? st.goldenAt : -1;
  if (golden >= 0) ids[golden] = 0; // the Golden Locomotive keeps id 0 all bonus

  const routes: RouteWin[] | null = record ? [] : null;
  const routesH = evalRoutes(syms, routes);
  const trains: Train[] = [];
  const crashes: Crash[] = [];
  const collected = new Uint8Array(CELLS);
  const queue = force?.security ? [...force.security] : [];
  const secure = () => (queue.length ? queue.shift()! : rng.next() < cm.clear);
  const haulH = runTrains(syms, valH, ids, golden, secure, trains, crashes, collected, ctr);
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
  let winH = routesH + trainH;
  let maxWin = false;
  if (totalBeforeH + winH >= MAX_WIN_H) {
    winH = MAX_WIN_H - totalBeforeH;
    maxWin = true;
  }
  if (ctr) {
    ctr.spins++;
    ctr.routesH += routesH;
    ctr.trainH += trainH;
    ctr.locos += trains.length;
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
      if (p === golden) c.golden = true;
      grid.push(c);
    }
    result = {
      mode,
      grid,
      held,
      routes: routes!,
      routesWin: routesH / 100,
      trains,
      crashes,
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

function playBonus(ctx: Ctx, kind: BonusKind, awarded: number, totalBeforeH: number, ctr?: EngineCounters): { bonus: BonusResult | null; winH: number; maxWin: boolean; spins: number; retriggers: number } {
  const st: SpinState = { stickyVal: new Int32Array(CELLS).fill(-1), stickyId: new Int32Array(CELLS).fill(-1), goldenAt: -1, power: 0 };
  const set: ModelMode = kind === 'last' ? 'last' : 'rush';
  if (kind === 'last') {
    st.goldenAt = TERMINALS[ctx.rng.int(TERMINALS.length)];
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
    if (totalBeforeH + winH >= MAX_WIN_H) {
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
    ? { kind, awarded, spins, retriggers, totalSpins: maxWin ? played : total, bonusWin: winH / 100, goldenAt: st.goldenAt, powerStart }
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
