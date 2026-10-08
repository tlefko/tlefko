import { describe, expect, it } from 'vitest';
import { createRng, Xoshiro128 } from '../../src/math/rng';

describe('rng', () => {
  it('is reproducible and in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBe(b.next());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const k = a.int(7);
      expect(k).toBe(b.int(7));
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(7);
    }
  });

  it('seed(lo, hi) streams differ', () => {
    const a = new Xoshiro128(1, 0);
    const b = new Xoshiro128(1, 1);
    const c = new Xoshiro128(2, 0);
    const x = [a.u32(), b.u32(), c.u32()];
    expect(new Set(x).size).toBe(3);
  });

  it('is roughly uniform', () => {
    const r = createRng(7);
    const bins = new Array(10).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) bins[r.int(10)]++;
    for (const v of bins) expect(Math.abs(v / n - 0.1)).toBeLessThan(0.005);
  });
});
