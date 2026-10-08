import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, evalWays, playRound, runTrains } from '../../src/math/engine';
import { RUSH_SPINS, TUNED, COIN_VALUES } from '../../src/math/model';
import { PAYTABLE } from '../../src/math/paytable';
import { createRng } from '../../src/math/rng';
import { CELLS, MAX_WIN, POWER_STEPS, REELS, ROWS, Sym, levelOf, multOfLevel, posOf, type RoundKind, type Train, type WayWin } from '../../src/math/types';

const { L1, L2, L3, L4, H1, TOP, WILD, FS, COIN, LOCO, SWITCH } = { L1: Sym.L1, L2: Sym.L2, L3: Sym.L3, L4: Sym.L4, H1: Sym.H1, TOP: Sym.TOP, WILD: Sym.WILD, FS: Sym.FS, COIN: Sym.COIN, LOCO: Sym.LOCO, SWITCH: Sym.SWITCH };

/** Grid from reels (each reel lists its ROWS symbols top to bottom). */
const grid = (reels: number[][]): Int8Array => {
  const g = new Int8Array(CELLS);
  reels.forEach((r, c) => r.forEach((s, row) => (g[posOf(c, row)] = s)));
  return g;
};

/** A filler grid where no symbol reaches 3 reels: reel c is all of one low symbol, cycling. */
const blank = (): number[][] => Array.from({ length: REELS }, (_, c) => Array(ROWS).fill([L1, L2, L3, L4][c % 4]));

describe('rules constants', () => {
  it('grid is 6x4 and model sets are well formed', () => {
    expect(REELS).toBe(6);
    expect(ROWS).toBe(4);
    for (const set of Object.values(TUNED)) {
      expect(set.pay.length).toBe(9);
      expect(set.fsDist.length).toBe(7);
      expect(set.coinWeights.length).toBe(COIN_VALUES.length);
      expect(set.fsDist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(set.wild + set.coin + set.switch).toBeLessThan(0.5);
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
  it('paytable is monotone in reels and every value is on the 0.01 grid', () => {
    for (const row of PAYTABLE) for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThan(row[i - 1]);
    for (let s = 1; s < PAYTABLE.length; s++) expect(PAYTABLE[s][3]).toBeGreaterThanOrEqual(PAYTABLE[s - 1][3]);
  });
});

describe('ways', () => {
  it('pays 3+ adjacent reels from the left, ways = product of matches', () => {
    const r = blank();
    r[0][0] = TOP;
    r[1][1] = TOP;
    r[1][2] = WILD;
    r[2][3] = TOP;
    const out: WayWin[] = [];
    const h = evalWays(grid(r), out);
    const top = out.find((w) => w.sym === TOP)!;
    expect(top.reels).toBe(3);
    expect(top.ways).toBe(2);
    expect(top.pay).toBeCloseTo(PAYTABLE[TOP][0] * 2, 9);
    expect(top.positions).toEqual([posOf(0, 0), posOf(1, 1), posOf(1, 2), posOf(2, 3)]);
    expect(h).toBe(Math.round(PAYTABLE[TOP][0] * 2 * 100));
  });
  it('a wild never starts a way (no wild on reel 1) and a gap ends it', () => {
    const r = blank();
    r[0] = [WILD, WILD, WILD, WILD];
    r[1][0] = TOP;
    r[2][0] = TOP;
    expect(evalWays(grid(r), [])).toBe(0);
    const s = blank();
    s[0][0] = H1;
    s[1][0] = H1;
    s[3][0] = H1; // reel 3 missing
    expect(evalWays(grid(s), [])).toBe(0);
  });
  it('six reels pay the 6 column', () => {
    const r = blank();
    for (let c = 0; c < 6; c++) r[c][0] = H1;
    const out: WayWin[] = [];
    evalWays(grid(r), out);
    expect(out.find((w) => w.sym === H1)!.reels).toBe(6);
  });
});

function trains(reels: number[][], values: Record<number, number> = {}) {
  const g = grid(reels);
  const val = new Int32Array(CELLS);
  const ids = new Int32Array(CELLS);
  for (let p = 0; p < CELLS; p++) {
    ids[p] = p + 100;
    if (g[p] === COIN) val[p] = Math.round((values[p] ?? 1) * 100);
  }
  const out: Train[] = [];
  const col = new Uint8Array(CELLS);
  const h = runTrains(g, val, ids, out, col);
  return { h, out, col };
}

describe('trains', () => {
  it('a locomotive collects every coin in its row only', () => {
    const r = blank();
    r[0][1] = LOCO;
    r[2][1] = COIN;
    r[5][1] = COIN;
    r[3][2] = COIN; // other row: left behind
    const { h, out } = trains(r, { [posOf(2, 1)]: 2, [posOf(5, 1)]: 5, [posOf(3, 2)]: 50 });
    expect(h).toBe(700);
    expect(out.length).toBe(1);
    expect(out[0].coins.map((c) => c.value)).toEqual([2, 5]);
    expect(out[0].to).toBe(5);
  });
  it('no locomotive, no haul', () => {
    const r = blank();
    r[2][1] = COIN;
    expect(trains(r).h).toBe(0);
  });
  it('a junction branches up and down from its own column', () => {
    const r = blank();
    r[0][1] = LOCO;
    r[2][1] = SWITCH;
    r[2][0] = COIN; // collected by the up-branch in the junction column
    r[4][2] = COIN; // collected by the down-branch later
    r[1][0] = COIN; // left of the junction: never reached
    const { h, out } = trains(r, { [posOf(2, 0)]: 3, [posOf(4, 2)]: 4, [posOf(1, 0)]: 9 });
    expect(h).toBe(700);
    expect(out.length).toBe(3);
    expect(out[1]).toMatchObject({ row: 0, from: 2, parent: 0, via: posOf(2, 1) });
    expect(out[2]).toMatchObject({ row: 2, from: 2, parent: 0, via: posOf(2, 1) });
  });
  it('a branch reaching another junction branches again; a cell is run once', () => {
    const r = blank();
    r[0][0] = LOCO;
    r[1][0] = SWITCH; // -> row 1 from col 1
    r[1][1] = SWITCH; // the branch lands on a junction: -> row 2 from col 1
    r[3][2] = COIN;
    const { h, out } = trains(r, { [posOf(3, 2)]: 10 });
    expect(out.map((t) => t.row)).toEqual([0, 1, 2]);
    expect(h).toBe(1000);
  });
  it('two locomotives in neighbouring rows: trains enter a column together, so no branch into a running row', () => {
    const r = blank();
    r[0][0] = LOCO;
    r[0][1] = LOCO;
    r[2][0] = SWITCH; // would branch into row 1 at col 2, but loco 2 is running it
    r[4][1] = COIN;
    const { out, h } = trains(r, { [posOf(4, 1)]: 1 });
    expect(out.length).toBe(2);
    expect(h).toBe(100);
  });
  it('a coin is never collected twice', () => {
    const r = blank();
    r[0][0] = LOCO;
    r[0][2] = LOCO;
    r[1][0] = SWITCH;
    r[1][2] = SWITCH;
    r[1][1] = COIN; // both junctions branch into row 1 at col 1
    const { h, col } = trains(r);
    expect(h).toBe(100);
    expect(col[posOf(1, 1)]).toBe(1);
  });
});

describe('rounds', () => {
  it('forced grid pays ways + trains', () => {
    const r = blank();
    r[0][0] = LOCO;
    r[3][0] = COIN;
    const g: Sym[] = [];
    r.forEach((reel) => reel.forEach((s) => g.push(s)));
    const res = playRound({ kind: 'base', rng: createRng(1), force: { grid: g, values: { [posOf(3, 0)]: 25 } } });
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
          const collected = new Set(prev.trains.flatMap((t) => t.coins.map((c) => c.pos)));
          for (let p = 0; p < CELLS; p++) {
            const was = prev.grid[p];
            if (was.sym === COIN && !collected.has(p)) {
              expect(s.grid[p]).toMatchObject({ sym: COIN, id: was.id, value: was.value, held: true });
              expect(s.held).toContain(p);
            }
          }
        }
        const n = s.trains.reduce((a, t) => a + t.coins.length, 0);
        power += n;
        expect(s.powerAfter).toBe(power);
        expect(s.levelSpins).toBe((levelOf(power) - levelOf(s.powerBefore)) * 3);
        expect(s.trainWin).toBeCloseTo(s.haul * s.mult, 6);
        prev = s;
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
  it('Last Train holds a Golden Locomotive on one row for every spin and starts at x2', () => {
    for (let seed = 1; seed < 30; seed++) {
      const res = playRound({ kind: 'buy_inferno', rng: createRng(seed) });
      const b = res.bonus!;
      expect(b.kind).toBe('last');
      expect(b.awarded).toBe(10);
      expect(b.spins[0].mult).toBe(2);
      for (const s of b.spins) {
        expect(s.grid[b.goldenRow]).toMatchObject({ sym: LOCO, golden: true, held: true, id: 0 });
        expect(s.trains.some((t) => t.row === b.goldenRow && t.parent === -1)).toBe(true);
      }
    }
  });
  it('Express Pass always has a locomotive (unless reel 1 is all tickets)', () => {
    for (let seed = 1; seed < 2000; seed++) {
      const res = playRound({ kind: 'boost', rng: createRng(seed) });
      const reel1 = res.trigger.grid.slice(0, ROWS).map((c) => c.sym);
      expect(reel1.includes(LOCO)).toBe(true);
    }
  });
  it('totals add up and never exceed the cap', () => {
    const kinds: RoundKind[] = ['base', 'boost', 'buy_witching', 'buy_inferno'];
    for (const kind of kinds) {
      for (let seed = 1; seed < 300; seed++) {
        const res = playRound({ kind, rng: createRng(seed * 7 + 1) });
        const spins = [res.trigger, ...(res.bonus?.spins ?? [])];
        const sum = spins.reduce((a, s) => a + s.spinWin, 0);
        expect(res.totalWin).toBeCloseTo(Math.min(MAX_WIN, sum), 6);
        expect(res.totalWin).toBeLessThanOrEqual(MAX_WIN);
        for (const s of spins) {
          if (!s.maxWin) expect(s.spinWin).toBeCloseTo(s.waysWin + s.trainWin, 6);
          expect(s.grid.length).toBe(CELLS);
          for (let row = 0; row < ROWS; row++) expect([WILD, COIN, SWITCH]).not.toContain(s.grid[row].sym);
          for (let row = 0; row < ROWS; row++) expect(s.grid[posOf(5, row)].sym).not.toBe(SWITCH);
          for (let p = ROWS; p < CELLS; p++) expect(s.grid[p].sym).not.toBe(LOCO);
          for (const c of s.grid) if (c.sym === COIN) expect(COIN_VALUES).toContain(c.value);
          const tickets = s.grid.filter((c) => c.sym === FS).length;
          expect(tickets).toBe(s.scatCount);
        }
        const ids = res.trigger.grid.map((c) => c.id);
        expect(new Set(ids).size).toBe(CELLS);
      }
    }
  });
  it('the cap ends the round at exactly MAX_WIN', () => {
    const r = blank();
    for (let row = 0; row < ROWS; row++) r[0][row] = LOCO;
    for (let c = 1; c < 6; c++) r[c] = [COIN, COIN, COIN, COIN];
    const g: Sym[] = [];
    r.forEach((reel) => reel.forEach((s) => g.push(s)));
    const values: Record<number, number> = {};
    for (let p = ROWS; p < CELLS; p++) values[p] = 2000;
    const res = playRound({ kind: 'base', rng: createRng(3), force: { grid: g, values } });
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
    expect(DEFAULT_MODEL.base.reel1.length).toBe(10);
    expect(DEFAULT_MODEL.base.mid.length).toBe(12);
    expect(DEFAULT_MODEL.base.last.length).toBe(11);
  });
});
