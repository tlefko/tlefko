/**
 * Stake Engine review: "Please verify the bet initialization logic on game refresh. If there are no
 * active or pending rounds, the system should reset the bet to the default bet level. If the round
 * is active, it should use the bet from the authentication round and display it exactly as it is,
 * and the round must continue." (Ported from Lucifer's Lullaby, 455b60f.)
 */
import { describe, expect, it } from 'vitest';
import { defaultIndex, initialBet, isActiveRound } from '../../src/game/bet';

const M = 1_000_000;
const LEVELS = [0.1, 0.2, 0.5, 1, 2, 5, 10].map((v) => Math.round(v * M));
const DEFAULT = 1 * M; // index 3
const BOOK = [{ index: 0, type: 'spin' }];

describe('bet on (re)load', () => {
  it('no round at all: the default bet level', () => {
    expect(initialBet(LEVELS, DEFAULT, null)).toEqual({ index: 3, resumeBetApi: null });
    expect(initialBet(LEVELS, DEFAULT, undefined)).toEqual({ index: 3, resumeBetApi: null });
  });

  it("a finished (inactive) round: the default, not that round's bet", () => {
    expect(initialBet(LEVELS, DEFAULT, { active: false, amount: 5 * M, state: BOOK })).toEqual({ index: 3, resumeBetApi: null });
  });

  it('never a bet remembered from an earlier session (there is no input for one)', () => {
    // the rule takes only the levels, the default and authenticate's round
    expect(initialBet.length).toBe(3);
  });

  it("an active round: exactly that round's bet", () => {
    expect(initialBet(LEVELS, DEFAULT, { active: true, amount: 5 * M, state: BOOK })).toEqual({ index: 5, resumeBetApi: null });
    expect(initialBet(LEVELS, DEFAULT, { active: true, amount: 0.1 * M })).toEqual({ index: 0, resumeBetApi: null });
  });

  it("an active round at a bet that is not one of today's levels: that exact bet, kept for the round", () => {
    // shown and used as-is (resumeBetApi) until the round is over; the level index waits on the default
    expect(initialBet(LEVELS, DEFAULT, { active: true, amount: 3 * M, state: BOOK })).toEqual({ index: 3, resumeBetApi: 3 * M });
    expect(initialBet(LEVELS, DEFAULT, { active: true, amount: 70_000 * M, state: BOOK })).toEqual({ index: 3, resumeBetApi: 70_000 * M });
  });

  it('an active round without an amount, or without its book, falls back to the default', () => {
    expect(initialBet(LEVELS, DEFAULT, { active: true })).toEqual({ index: 3, resumeBetApi: null });
    expect(initialBet(LEVELS, DEFAULT, { active: true, amount: 0 })).toEqual({ index: 3, resumeBetApi: null });
    // the game does not resume a round that comes without its book, so it does not take its bet either
    expect(initialBet(LEVELS, DEFAULT, { active: true, amount: 5 * M, state: [] })).toEqual({ index: 3, resumeBetApi: null });
    expect(isActiveRound({ active: true, amount: 5 * M, state: null })).toBe(false);
  });

  it('a default that is not itself a level: the first level above it, else the lowest', () => {
    expect(defaultIndex(LEVELS, 0.75 * M)).toBe(3);
    expect(defaultIndex(LEVELS, 50 * M)).toBe(0);
    expect(defaultIndex(LEVELS, 0.2 * M)).toBe(1);
  });
});
