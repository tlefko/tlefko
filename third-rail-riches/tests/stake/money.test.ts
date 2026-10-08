/**
 * Stake Engine review: "the balance is shown with 2 decimal places, the win amount supports enough
 * decimal places to display the full win, and bet levels are displayed at 2 decimals" (sub-cent
 * payouts). Ported from Lucifer's Lullaby (af41949).
 */
import { describe, expect, it } from 'vitest';
import { fmtBalance, fmtBet, fmtWin } from '../../src/stake/money';

const M = 1_000_000; // API amounts carry six decimals

describe('balance and bet: exactly 2 decimals', () => {
  it('pads to 2 decimals', () => {
    expect(fmtBalance(575 * M, 'XGC')).toBe('575.00 GC');
    expect(fmtBet(70_000 * M, 'XGC')).toBe('70,000.00 GC');
    expect(fmtBet(0.1 * M, 'USD')).toBe('$0.10');
    expect(fmtBalance(1_234_567.89 * M, 'USD')).toBe('$1,234,567.89');
  });

  it('two decimals even where the currency table would show none', () => {
    expect(fmtBalance(1_500 * M, 'JPY')).toBe('¥1,500.00');
  });

  it('never shows a balance larger than it is (extra digits dropped, not rounded up)', () => {
    expect(fmtBalance(Math.round(10.009 * M), 'USD')).toBe('$10.00');
    expect(fmtBet(Math.round(0.129 * M), 'USD')).toBe('$0.12');
  });

  it('keeps the sign and the currency placement', () => {
    expect(fmtBalance(-12.5 * M, 'USD')).toBe('-$12.50');
    expect(fmtBalance(-12.5 * M, 'XSC')).toBe('-12.50 SC');
  });
});

describe('win: the full win, never rounded', () => {
  it('at least 2 decimals', () => {
    expect(fmtWin(75 * M, 'XGC')).toBe('75.00 GC');
    expect(fmtWin(0.1 * M, 'USD')).toBe('$0.10');
  });

  it('as many decimals as the win carries, up to the API\'s six', () => {
    expect(fmtWin(4_000, 'USD')).toBe('$0.004'); // a 0.004 win reads 0.004, not 0.00
    expect(fmtWin(0.015 * M, 'USD')).toBe('$0.015'); // a 0.15x win on a $0.10 bet
    expect(fmtWin(1.2345 * M, 'USD')).toBe('$1.2345');
    expect(fmtWin(1, 'USD')).toBe('$0.000001');
  });

  it('large wins group thousands', () => {
    expect(fmtWin(35_000_000 * M, 'XGC')).toBe('35,000,000.00 GC');
  });

  it('is exact on the integer (no float drift)', () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004; the API integer is exact
    expect(fmtWin(300_000, 'USD')).toBe('$0.30');
    expect(fmtWin(123_456_789, 'USD')).toBe('$123.456789');
  });
});
