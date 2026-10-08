/**
 * Seedable PRNG for the math engine: xoshiro128** (Blackman & Vigna, 2018) with its
 * 128-bit state expanded from a seed via splitmix32. Fast (a handful of 32-bit ops per draw),
 * statistically strong for simulation, and identical in the browser and in Node.
 *
 * Not a CSPRNG. This is a demo-credits game; unseeded generators take their state from
 * crypto.getRandomValues so that live play is unpredictable, while seeded generators make
 * every round reproducible for QA, tests and simulation.
 */

export interface Rng {
  /** Uniform float in [0, 1) with 32-bit resolution. */
  next(): number;
  /** Uniform integer in [0, n) for 1 <= n <= 2^31. */
  int(n: number): number;
}

const GOLDEN = 0x9e3779b9 | 0;
const TWO32 = 4294967296;

/** splitmix32 output function (the "mix" applied to the incremented state). */
function mix32(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

export class Xoshiro128 implements Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seedLo = 0, seedHi = 0) {
    this.seed(seedLo, seedHi);
  }

  /**
   * Re-seed from two 32-bit words. Distinct (lo, hi) pairs give unrelated streams, so the
   * simulator seeds every round from (roundIndex, runSeed) and results do not depend on how
   * rounds are split across workers.
   */
  seed(lo: number, hi = 0): this {
    // mix32 is a bijection on 32-bit words, so (s0, s2) determines (x, y) and the state is injective
    // in (lo, hi). Every word depends on lo, and s1..s3 on hi too (xoshiro's first output reads only
    // s1, so s1 must depend on both).
    const x = mix32((lo + GOLDEN) | 0);
    const y = mix32(((hi ^ 0x7f4a7c15) + GOLDEN) | 0);
    return this.setState(
      x,
      mix32(((x ^ y) + 0x6a09e667) | 0),
      y ^ mix32((x + 0x510e527f) | 0),
      mix32((x + y + 0x3c6ef372) | 0),
    );
  }

  /** Set the raw 128-bit state (all-zero is invalid for xoshiro and is replaced). */
  setState(a: number, b: number, c: number, d: number): this {
    this.s0 = a | 0;
    this.s1 = b | 0;
    this.s2 = c | 0;
    this.s3 = d | 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = GOLDEN;
    return this;
  }

  getState(): [number, number, number, number] {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  /** Raw 32-bit output as an unsigned integer. */
  u32(): number {
    const s0 = this.s0;
    const s1 = this.s1;
    let s2 = this.s2;
    let s3 = this.s3;
    const m = Math.imul(s1, 5);
    const r = Math.imul((m << 7) | (m >>> 25), 9);
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    this.s1 = s1 ^ s2;
    this.s0 = s0 ^ s3;
    this.s2 = s2 ^ t;
    this.s3 = (s3 << 11) | (s3 >>> 21);
    return r >>> 0;
  }

  next(): number {
    return this.u32() / TWO32;
  }

  int(n: number): number {
    return (this.next() * n) | 0;
  }
}

/**
 * Create a generator. With a seed (any finite number; integers up to 2^53 are used in full)
 * the stream is reproducible. Without one, the full 128-bit state comes from
 * crypto.getRandomValues.
 */
export function createRng(seed?: number): Xoshiro128 {
  const rng = new Xoshiro128();
  if (seed === undefined) {
    const w = new Uint32Array(4);
    globalThis.crypto.getRandomValues(w);
    rng.setState(w[0], w[1], w[2], w[3]);
    return rng;
  }
  const v = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  const lo = v >>> 0;
  const hi = Math.floor(v / TWO32) >>> 0;
  return rng.seed(lo, hi);
}
