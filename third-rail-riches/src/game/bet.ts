/**
 * Which bet the game shows when it (re)loads (Stake Engine review, "bet initialization on game
 * refresh"; ported from Lucifer's Lullaby, 455b60f):
 *
 *   - no active round: the operator's default bet level, never a bet remembered from an earlier
 *     session;
 *   - an active round: that round's own amount, shown exactly as authenticate returned it, so the
 *     round carries on at the bet it was placed with. When that amount is not one of today's bet
 *     levels it is carried as `resumeBetApi` (shown and used until the round is over) while the
 *     level index sits on the default, which the game falls back to afterwards.
 *
 * An active round is one the game resumes (src/game/Controller.ts start): `active`, with a bet
 * amount, and with its book in `state` when the RGS sends one.
 */
export interface InitialBet {
  /** Index into the bet levels. */
  index: number;
  /** An active round's amount when it is not one of the levels, else null. */
  resumeBetApi: number | null;
}

export interface AuthRound {
  active?: boolean;
  amount?: number;
  state?: readonly unknown[] | null;
}

/** Index of the default bet level: exact, else the first level above it, else the lowest. */
export function defaultIndex(levels: readonly number[], defaultBetLevel: number): number {
  const exact = levels.indexOf(defaultBetLevel);
  if (exact >= 0) return exact;
  const above = levels.findIndex((l) => l >= defaultBetLevel);
  return above >= 0 ? above : 0;
}

/** Whether authenticate's round is one the game resumes (and so whose bet it shows). */
export function isActiveRound(round?: AuthRound | null): boolean {
  if (!round?.active) return false;
  if (round.state !== undefined && !(round.state && round.state.length > 0)) return false;
  return !!round.amount && round.amount > 0;
}

export function initialBet(levels: readonly number[], defaultBetLevel: number, round?: AuthRound | null): InitialBet {
  const index = defaultIndex(levels, defaultBetLevel);
  if (!isActiveRound(round)) return { index, resumeBetApi: null };
  const amount = round!.amount!;
  const at = levels.indexOf(amount);
  return at >= 0 ? { index: at, resumeBetApi: null } : { index, resumeBetApi: amount };
}
