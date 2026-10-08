import { describe, expect, it } from 'vitest';
import { playRound } from '../../src/math/engine';
import { createRng } from '../../src/math/rng';
import type { RoundKind, SpinResult } from '../../src/math/types';
import { bookToRound, MODE_OF_KIND, roundToBook } from '../../src/stake/book';
import { makeScenario, DEV_SCENARIOS } from '../../src/stake/devScenarios';

/** A spin without cell / coin ids (ids are rebuilt by bookToRound with their own numbering). */
const noIds = (s: SpinResult) => ({
  ...s,
  grid: s.grid.map(({ id, ...c }) => (void id, c)),
  trains: s.trains.map((t) => ({ ...t, coins: t.coins.map(({ id, ...c }) => (void id, c)) })),
});

describe('books', () => {
  it('roundToBook -> JSON -> bookToRound keeps everything the presenter reads', () => {
    const kinds: RoundKind[] = ['base', 'boost', 'buy_witching', 'buy_inferno'];
    for (const kind of kinds) {
      for (let seed = 1; seed < 120; seed++) {
        const r = playRound({ kind, rng: createRng(seed * 13) });
        const book = JSON.parse(JSON.stringify(roundToBook(seed, r)));
        expect(book.payoutMultiplier).toBe(Math.round(r.totalWin * 100));
        const back = bookToRound(book.events, MODE_OF_KIND[kind]);
        expect(back.totalWin).toBe(r.totalWin);
        expect(back.maxWin).toBe(r.maxWin);
        expect(noIds(back.trigger)).toEqual(noIds(r.trigger));
        expect(!!back.bonus).toBe(!!r.bonus);
        if (r.bonus) {
          const b = back.bonus!;
          expect(b.kind).toBe(r.bonus.kind);
          expect(b.awarded).toBe(r.bonus.awarded);
          expect(b.totalSpins).toBe(r.bonus.totalSpins);
          expect(b.goldenRow).toBe(r.bonus.goldenRow);
          expect(b.powerStart).toBe(r.bonus.powerStart);
          expect(b.retriggers).toEqual(r.bonus.retriggers);
          expect(b.bonusWin).toBeCloseTo(r.bonus.bonusWin, 6);
          b.spins.forEach((s, i) => expect(noIds(s)).toEqual(noIds(r.bonus!.spins[i])));
          // a held coin keeps the id it had on the spin before; coin ids in trains match the grid
          for (let i = 1; i < b.spins.length; i++) {
            for (const p of b.spins[i].held) expect(b.spins[i].grid[p].id).toBe(b.spins[i - 1].grid[p].id);
          }
          for (const s of b.spins) for (const t of s.trains) for (const c of t.coins) expect(c.id).toBe(s.grid[c.pos].id);
        }
      }
    }
  });
  it('every dev scenario builds', () => {
    for (const name of Object.keys(DEV_SCENARIOS)) {
      if (name === 'maxWin') continue; // slow search; covered by tools/stake/generate.ts
      const sc = makeScenario(name);
      expect(sc.book.events.length).toBeGreaterThan(1);
    }
  });
});
