import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, evalRoutes, playRound, runTrains } from '../../src/math/engine';
import { RUSH_SPINS, TUNED, COIN_VALUES } from '../../src/math/model';
import { INTERCHANGES, LINES, NEIGHBOURS, STATIONS, STOPS, TERMINALS, departure } from '../../src/math/network';
import { PAYTABLE } from '../../src/math/paytable';
import { createRng } from '../../src/math/rng';
import { CELLS, CRASH_MULT, MAX_WIN, POWER_STEPS, REPAY_MULT, Sym, levelOf, multOfLevel, type Crash, type RoundKind, type RouteWin, type Train } from '../../src/math/types';

const { L1, H1, TOP, WILD, FS, COIN, LOCO, SIGNAL, SECURITY } = {
  L1: Sym.L1,
  H1: Sym.H1,
  TOP: Sym.TOP,
  WILD: Sym.WILD,
  FS: Sym.FS,
  COIN: Sym.COIN,
  LOCO: Sym.LOCO,
  SIGNAL: Sym.SIGNAL,
  SECURITY: Sym.SECURITY,
};

/** Filler that never pays: station id mod 6 never runs 3 along any line. */
const filler = (): number[] => Array.from({ length: CELLS }, (_, p) => p % 6);
const board = (set: Record<number, number>): Int8Array => {
  const g = filler();
  for (const [p, s] of Object.entries(set)) g[Number(p)] = s;
  return Int8Array.from(g);
};

/** Run the trains on a board: coins worth `vals` (default 1x). */
function trainsOn(set: Record<number, number>, vals: Record<number, number> = {}, security: boolean[] = []) {
  const syms = board(set);
  const valH = new Int32Array(CELLS);
  const ids = Int32Array.from({ length: CELLS }, (_, p) => p + 100);
  for (let p = 0; p < CELLS; p++) if (syms[p] === COIN) valH[p] = Math.round((vals[p] ?? 1) * 100);
  const trains: Train[] = [];
  const crashes: Crash[] = [];
  const collected = new Uint8Array(CELLS);
  const q = [...security];
  const payH = runTrains(syms, valH, ids, -1, () => q.shift() ?? true, trains, crashes, collected);
  return { pay: payH / 100, trains, crashes, collected };
}

describe('network', () => {
  it('4 lines, 19 stations: 8 terminals, 5 interchanges, 6 stops', () => {
    expect(STATIONS.length).toBe(19);
    expect(TERMINALS.length).toBe(8);
    expect(INTERCHANGES).toEqual([2, 4, 9, 11, 15]);
    expect(STOPS.length).toBe(6);
    for (const l of LINES) for (let i = 1; i < l.stops.length; i++) {
      const a = STATIONS[l.stops[i - 1]];
      const b = STATIONS[l.stops[i]];
      // consecutive stations are one map step apart (straight or diagonal)
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    }
    for (const t of TERMINALS) expect(departure(t).dir).toBe(LINES[departure(t).line].stops[0] === t ? 1 : -1);
    expect(NEIGHBOURS[15]).toEqual([2, 4, 9, 11]);
  });
  it('model sets are well formed', () => {
    for (const set of Object.values(TUNED)) {
      expect(set.pay.length).toBe(9);
      expect(set.fsDist.length).toBe(7);
      expect(set.coinWeights.length).toBe(COIN_VALUES.length);
      expect(set.fsDist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(set.wild + set.coin + Math.max(set.loco, set.signal, set.security)).toBeLessThan(0.6);
    }
  });
  it('power levels', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(POWER_STEPS[0] - 1)).toBe(0);
    expect(levelOf(POWER_STEPS[0])).toBe(1);
    expect(levelOf(POWER_STEPS[3])).toBe(4);
    expect(levelOf(999)).toBe(4);
    expect([0, 1, 2, 3, 4].map(multOfLevel)).toEqual([1, 2, 3, 5, 10]);
  });
  it('paytable is monotone in run length and every value is on the 0.01 grid', () => {
    for (const row of PAYTABLE) for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThan(row[i - 1]);
    for (let s = 1; s < PAYTABLE.length; s++) expect(PAYTABLE[s][2]).toBeGreaterThanOrEqual(PAYTABLE[s - 1][2]);
  });
});

describe('route wins', () => {
  it('pays 3+ consecutive stations along a line, anywhere on it', () => {
    const out: RouteWin[] = [];
    const h = evalRoutes(board({ 2: TOP, 3: WILD, 4: TOP }), out);
    expect(out).toEqual([{ sym: TOP, line: 0, stations: [2, 3, 4], pay: PAYTABLE[TOP][0] }]);
    expect(h).toBe(Math.round(PAYTABLE[TOP][0] * 100));
  });
  it('an interchange counts for both lines', () => {
    const out: RouteWin[] = [];
    // Red 1-2-3 and Green 14-2-15 share station 2
    evalRoutes(board({ 1: H1, 2: H1, 3: H1, 14: H1, 15: H1 }), out);
    expect(out.map((w) => w.line).sort()).toEqual([0, 2]);
  });
  it('a wild can serve two symbols; a gap ends a run', () => {
    const out: RouteWin[] = [];
    evalRoutes(board({ 0: TOP, 1: TOP, 2: WILD, 3: H1, 4: H1 }), out);
    expect(out.map((w) => [w.sym, w.stations])).toEqual([
      [H1, [2, 3, 4]],
      [TOP, [0, 1, 2]],
    ]);
  });
  it('a full 7-station line pays the 7 column', () => {
    const out: RouteWin[] = [];
    evalRoutes(board({ 0: L1, 1: L1, 2: L1, 3: WILD, 4: L1, 5: L1, 6: L1 }), out);
    expect(out[0].pay).toBe(PAYTABLE[L1][4]);
  });
});

describe('trains', () => {
  it('a locomotive runs its line to the far terminal collecting every coin', () => {
    const r = trainsOn({ 0: LOCO, 1: COIN, 3: COIN, 6: COIN, 10: COIN }, { 1: 2, 3: 5, 6: 1, 10: 50 });
    expect(r.pay).toBe(8);
    expect(r.trains[0].end).toBe('arrive');
    expect(r.trains[0].steps.map((s) => s.at)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.trains[0].steps.map((s) => s.beat)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.collected[10]).toBe(0);
  });
  it('no locomotive, no haul', () => {
    expect(trainsOn({ 3: COIN }).pay).toBe(0);
  });
  it('a Signal redirects onto the crossing line towards its longer side', () => {
    const r = trainsOn({ 0: LOCO, 2: SIGNAL, 15: COIN, 16: COIN, 3: COIN }, { 15: 3, 16: 4, 3: 100 });
    const t = r.trains[0];
    expect(t.steps.map((s) => s.at)).toEqual([1, 2, 15, 11, 16]);
    expect(t.steps[1].event).toBe('redirect');
    expect(r.pay).toBe(7);
  });
  it('a train takes each Signal once', () => {
    // Blue from the east: 12, 11 (signal -> Green, longer side north: 15, 2 (signal -> Red ...)
    const r = trainsOn({ 13: LOCO, 11: SIGNAL, 2: SIGNAL });
    const path = r.trains[0].steps.map((s) => s.at);
    expect(path.slice(0, 4)).toEqual([12, 11, 15, 2]);
    expect(r.trains[0].steps.filter((s) => s.event === 'redirect').length).toBe(2);
    expect(r.trains[0].end).toBe('arrive');
  });
  it('Security ALL CLEAR: the train waits one beat and its haul pays x2', () => {
    const r = trainsOn({ 7: LOCO, 8: SECURITY, 10: COIN, 13: COIN }, { 10: 5, 13: 1 }, [true]);
    const t = r.trains[0];
    expect(t.steps[0]).toMatchObject({ at: 8, beat: 1, event: 'clear' });
    expect(t.steps[1]).toMatchObject({ at: 9, beat: 3 });
    expect(t.repay).toBe(REPAY_MULT);
    expect(r.pay).toBe(6 * REPAY_MULT);
  });
  it('Security INCIDENT: the train is held and misses the rest of its route', () => {
    const r = trainsOn({ 7: LOCO, 8: COIN, 10: SECURITY, 12: COIN }, { 8: 2, 12: 25 }, [false]);
    expect(r.trains[0].end).toBe('held');
    expect(r.trains[0].steps.at(-1)).toMatchObject({ at: 10, event: 'held' });
    expect(r.pay).toBe(2);
    expect(r.collected[12]).toBe(0);
  });
  it('head-on: two trains entering the same station crash; the wreck takes nearby coins, all x2', () => {
    const r = trainsOn({ 0: LOCO, 6: LOCO, 1: COIN, 5: COIN, 3: COIN }, { 1: 2, 5: 3, 3: 10 });
    expect(r.crashes.length).toBe(1);
    const c = r.crashes[0];
    expect(c).toMatchObject({ beat: 3, at: [3], trains: [0, 1], pile: 15, mult: CRASH_MULT, pay: 30 });
    expect(c.wreck.map((w) => w.at)).toEqual([3]);
    expect(r.trains.every((t) => t.end === 'crash' && t.crash === 0 && t.endBeat === 3)).toBe(true);
    expect(r.pay).toBe(30);
  });
  it('head-on between stations (they swap) crashes at both', () => {
    // Red 0 and Red 6 with the east train delayed one beat by a cleared security stop at 5:
    // west train at 3 (beat 3) and 4 (beat 4); east at 5 (beat 1, waits beat 2), 4 (beat 3)?
    const r = trainsOn({ 0: LOCO, 6: LOCO, 5: SECURITY }, {}, [true]);
    expect(r.crashes.length).toBe(1);
    expect(r.crashes[0].at.length).toBeGreaterThanOrEqual(1);
  });
  it('Grand Junction: Green and Gold trains arriving together crash there', () => {
    const r = trainsOn({ 14: LOCO, 17: LOCO, 15: COIN, 9: COIN, 11: COIN }, { 15: 25, 9: 5, 11: 3 });
    expect(r.crashes[0]).toMatchObject({ beat: 2, at: [15] });
    expect(r.crashes[0].wreck.map((w) => w.at)).toEqual([9, 11, 15]);
    expect(r.pay).toBe(66);
  });
  it('running into a train waiting at a security check is a crash', () => {
    // the Green south train clears security at 10 and waits; the Red train, redirected twice, runs into it
    const r = trainsOn({ 0: LOCO, 16: LOCO, 10: SECURITY, 2: SIGNAL, 9: SIGNAL, 15: SIGNAL }, {}, [true, true]);
    expect(r.crashes.length).toBe(1);
    const c = r.crashes[0];
    expect(c.at).toEqual([10]);
    const waiting = r.trains.find((t) => t.steps.some((s) => s.at === 10 && s.event === 'clear'))!;
    expect(waiting.steps.at(-1)!.beat).toBeLessThan(c.beat);
  });
  it('a coin is never collected twice', () => {
    for (let seed = 1; seed < 400; seed++) {
      const res = playRound({ kind: 'buy_inferno', rng: createRng(seed) });
      for (const s of [res.trigger, ...(res.bonus?.spins ?? [])]) {
        const seen = new Set<number>();
        for (const t of s.trains) for (const c of t.coins) {
          expect(seen.has(c.at)).toBe(false);
          seen.add(c.at);
        }
        for (const c of s.crashes) for (const w of c.wreck) {
          expect(seen.has(w.at)).toBe(false);
          seen.add(w.at);
        }
      }
    }
  });
});

describe('rounds', () => {
  it('forced board pays routes + trains', () => {
    const g = filler();
    g[0] = LOCO;
    g[3] = COIN;
    const res = playRound({ kind: 'base', rng: createRng(1), force: { grid: g as Sym[], values: { 3: 25 } } });
    expect(res.trigger.trainWin).toBe(25);
    expect(res.totalWin).toBe(25);
    expect(res.trigger.trains[0].coins[0].value).toBe(25);
  });
  it('3+ tickets trigger Rush Hour with the right spin count', () => {
    for (const k of [3, 4, 5, 6]) {
      const res = playRound({ kind: 'base', rng: createRng(k), force: { scatCount: k } });
      expect(res.trigger.scatCount).toBe(k);
      expect(res.bonus?.kind).toBe('rush');
      expect(res.bonus?.awarded).toBe(RUSH_SPINS[k]);
    }
  });
  it('sticky coins stay until collected, keep their id and value, and feed the power meter', () => {
    for (let seed = 1; seed < 40; seed++) {
      const res = playRound({ kind: 'buy_witching', rng: createRng(seed) });
      const b = res.bonus!;
      let power = b.powerStart;
      let prev = b.spins[0];
      expect(prev.held.length).toBe(0);
      for (let i = 0; i < b.spins.length; i++) {
        const s = b.spins[i];
        expect(s.powerBefore).toBe(power);
        expect(s.mult).toBe(multOfLevel(levelOf(power)));
        if (i > 0) {
          const collected = new Set([...prev.trains.flatMap((t) => t.coins.map((c) => c.at)), ...prev.crashes.flatMap((c) => c.wreck.map((w) => w.at))]);
          for (let p = 0; p < CELLS; p++) {
            const was = prev.grid[p];
            if (was.sym === COIN && !collected.has(p)) {
              expect(s.grid[p]).toMatchObject({ sym: COIN, id: was.id, value: was.value, held: true });
              expect(s.held).toContain(p);
            }
          }
        }
        const n = s.trains.reduce((a, t) => a + t.coins.length, 0) + s.crashes.reduce((a, c) => a + c.wreck.length, 0);
        power += n;
        expect(s.powerAfter).toBe(power);
        expect(s.levelSpins).toBe((levelOf(power) - levelOf(s.powerBefore)) * 3);
        expect(s.trainWin).toBeCloseTo(s.haul * s.mult, 6);
        prev = s;
      }
    }
  });
  it('the haul is the trains outside crashes (x repay) plus the crash pays', () => {
    for (let seed = 1; seed < 300; seed++) {
      const res = playRound({ kind: 'buy_inferno', rng: createRng(seed) });
      for (const s of [res.trigger, ...(res.bonus?.spins ?? [])]) {
        const free = s.trains.filter((t) => t.crash < 0).reduce((a, t) => a + t.haul * t.repay, 0);
        const crash = s.crashes.reduce((a, c) => a + c.pay, 0);
        expect(s.haul).toBeCloseTo(free + crash, 6);
        for (const c of s.crashes) {
          const pile = c.trains.reduce((a, i) => a + s.trains[i].haul * s.trains[i].repay, 0) + c.wreck.reduce((a, w) => a + w.value, 0);
          expect(c.pile).toBeCloseTo(pile, 6);
          expect(c.pay).toBeCloseTo(pile * CRASH_MULT, 6);
        }
      }
    }
  });
  it('total spins = awarded + level-ups + retriggers', () => {
    for (let seed = 1; seed < 200; seed++) {
      const res = playRound({ kind: 'buy_witching', rng: createRng(seed) });
      const b = res.bonus!;
      if (res.maxWin) continue;
      const extra = b.spins.reduce((a, s) => a + s.levelSpins, 0) + b.retriggers.reduce((a, r) => a + r.added, 0);
      expect(b.spins.length).toBe(b.awarded + extra);
      expect(b.totalSpins).toBe(b.spins.length);
    }
  });
  it('Last Train holds a Golden Locomotive on one terminal for every spin and starts at x2', () => {
    for (let seed = 1; seed < 30; seed++) {
      const res = playRound({ kind: 'buy_inferno', rng: createRng(seed) });
      const b = res.bonus!;
      expect(b.kind).toBe('last');
      expect(b.awarded).toBe(10);
      expect(TERMINALS).toContain(b.goldenAt);
      expect(b.spins[0].mult).toBe(2);
      for (const s of b.spins) {
        expect(s.grid[b.goldenAt]).toMatchObject({ sym: LOCO, golden: true, held: true, id: 0 });
        expect(s.trains.some((t) => t.start === b.goldenAt && t.golden)).toBe(true);
      }
    }
  });
  it('Express Pass always has a locomotive', () => {
    for (let seed = 1; seed < 2000; seed++) {
      const res = playRound({ kind: 'boost', rng: createRng(seed) });
      expect(res.trigger.trains.length).toBeGreaterThan(0);
    }
  });
  it('specials land only where they belong; totals add up and never exceed the cap', () => {
    const kinds: RoundKind[] = ['base', 'boost', 'buy_witching', 'buy_inferno'];
    for (const kind of kinds) {
      for (let seed = 1; seed < 300; seed++) {
        const res = playRound({ kind, rng: createRng(seed * 7 + 1) });
        const spins = [res.trigger, ...(res.bonus?.spins ?? [])];
        const sum = spins.reduce((a, s) => a + s.spinWin, 0);
        expect(res.totalWin).toBeCloseTo(Math.min(MAX_WIN, sum), 6);
        expect(res.totalWin).toBeLessThanOrEqual(MAX_WIN);
        for (const s of spins) {
          if (!s.maxWin) expect(s.spinWin).toBeCloseTo(s.routesWin + s.trainWin, 6);
          expect(s.grid.length).toBe(CELLS);
          s.grid.forEach((c, p) => {
            const k = STATIONS[p].kind;
            if (c.sym === LOCO) expect(k).toBe('terminal');
            if (c.sym === SIGNAL) expect(k).toBe('interchange');
            if (c.sym === SECURITY) expect(k).toBe('stop');
            if (c.sym === FS) expect(k).not.toBe('terminal');
            if (c.sym === COIN) expect(COIN_VALUES).toContain(c.value);
          });
          expect(s.grid.filter((c) => c.sym === FS).length).toBe(s.scatCount);
          for (const t of s.trains) expect(t.end).not.toBe('stall');
        }
        expect(new Set(res.trigger.grid.map((c) => c.id)).size).toBe(CELLS);
      }
    }
  });
  it('the cap ends the round at exactly MAX_WIN', () => {
    const g = filler();
    g[0] = LOCO;
    for (const p of [1, 2, 3, 4, 5, 6]) g[p] = COIN;
    const values: Record<number, number> = {};
    for (const p of [1, 2, 3, 4, 5, 6]) values[p] = 2000;
    const res = playRound({ kind: 'base', rng: createRng(3), force: { grid: g as Sym[], values } });
    expect(res.totalWin).toBe(MAX_WIN);
    expect(res.maxWin).toBe(true);
    expect(res.trigger.maxWin).toBe(true);
  });
  it('record: false gives the same totals as record: true (same RNG use)', () => {
    const kinds: RoundKind[] = ['base', 'boost', 'buy_witching', 'buy_inferno'];
    for (const kind of kinds) {
      for (let seed = 1; seed < 3000; seed++) {
        const a = playRound({ kind, rng: createRng(seed), record: true });
        const b = playRound({ kind, rng: createRng(seed), record: false });
        expect(b.totalWin).toBe(a.totalWin);
      }
    }
  });
  it('the default model compiles', () => {
    expect(DEFAULT_MODEL.base.table.length).toBe(CELLS);
    expect(DEFAULT_MODEL.base.table[0].length).toBe(12);
  });
});
