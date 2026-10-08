/**
 * The symbol set, keyed by ART KEY: 0..10 are the Sym ids (docs/ART.md), the variants of the
 * special symbols follow (Fare Coin metals, the Locomotive and the Golden Locomotive, the Signal,
 * the Security Check). `win` is the lit / thrown / flipped / all-clear state; creatures blink and cheer.
 * The Security Check's INCIDENT look is not a frame here: `securityCheck('incident')` /
 * `securityIncidentFrames` in ./specials.
 *
 * Every frame of a symbol shares the 256 viewBox and anchor, so frames swap without jumping.
 */
import { pretzel, pretzelWinFrames, coffee, coffeeWinFrames, newspaper, newspaperWinFrames, umbrella, umbrellaWinFrames } from './lows';
import { pigeonHead, pigeonWinFrames, catHead, catWinFrames, bulldogHead, bulldogWinFrames, type Pose } from './critters';
import { ratSymbol, ratWinFrames } from './rat';
import { conductorHead, conductorWinFrames } from './conductor';
import { liveWire, liveWireFrames, goldenTicket, goldenTicketWin, goldenTicketFrames, fareCoin, fareCoinShine, locoFront, signalHead, signalFrames, securityCheck, securityIdleFrames, securityClearFrames, type CoinTier } from './specials';
import { Sym, type Cell } from '../math/types';

export type { Pose };

export interface SymbolArt {
  idle: () => string;
  blink?: () => string;
  /** A single win pose (Live Wire lit, ticket flipped, Locomotive headlamp on, Signal thrown, Security all clear). */
  win?: () => string;
  /** 3-4 frames looped during the win highlight. */
  winFrames?: (() => string)[];
  /** Optional frames looped while the symbol sits idle. */
  idleFrames?: (() => string)[];
}

/** Art keys beyond the Sym ids. */
export const ART = {
  COIN_BRONZE: 11,
  COIN_SILVER: 12,
  COIN_GOLD: 13,
  COIN_PLATINUM: 14,
  LOCO: 15,
  LOCO_GOLD: 16,
  SIGNAL: 17,
  SECURITY: 18,
} as const;
export const ART_KEYS = 19;

export const COIN_TIERS: readonly CoinTier[] = ['bronze', 'silver', 'gold', 'platinum'];

/** Coin metal for a value in bet multiples: bronze < 1x, silver 1-5x, gold 10-50x, platinum 100x+. */
export function coinTier(value: number): number {
  return value < 1 ? 0 : value <= 5 ? 1 : value <= 50 ? 2 : 3;
}

/** The art key a cell draws with. */
export function artKey(cell: Pick<Cell, 'sym' | 'value' | 'golden'>): number {
  switch (cell.sym) {
    case Sym.COIN:
      return ART.COIN_BRONZE + coinTier(cell.value ?? 0);
    case Sym.LOCO:
      return cell.golden ? ART.LOCO_GOLD : ART.LOCO;
    case Sym.SIGNAL:
      return ART.SIGNAL;
    case Sym.SECURITY:
      return ART.SECURITY;
    default:
      return cell.sym;
  }
}

const poses = (fn: (p: Pose) => string) => ({ idle: () => fn('idle'), blink: () => fn('blink'), win: () => fn('win') });
const coinArt = (tier: CoinTier): SymbolArt => ({ idle: () => fareCoin(tier), win: () => fareCoinShine(tier) });

export const SYMBOL_ART: Record<number, SymbolArt> = {
  0: { idle: pretzel, winFrames: pretzelWinFrames },
  1: { idle: coffee, winFrames: coffeeWinFrames },
  2: { idle: newspaper, winFrames: newspaperWinFrames },
  3: { idle: umbrella, winFrames: umbrellaWinFrames },
  4: { ...poses(pigeonHead), winFrames: pigeonWinFrames },
  5: { ...poses(catHead), winFrames: catWinFrames },
  6: { ...poses(bulldogHead), winFrames: bulldogWinFrames },
  7: { ...poses(ratSymbol), winFrames: ratWinFrames },
  8: { idle: () => conductorHead('idle', true), blink: () => conductorHead('blink', true), win: () => conductorHead('laugh', true), winFrames: conductorWinFrames },
  9: { idle: () => liveWire(false), win: () => liveWire(true), winFrames: liveWireFrames },
  10: { idle: goldenTicket, win: goldenTicketWin, winFrames: goldenTicketFrames },
  [ART.COIN_BRONZE]: coinArt('bronze'),
  [ART.COIN_SILVER]: coinArt('silver'),
  [ART.COIN_GOLD]: coinArt('gold'),
  [ART.COIN_PLATINUM]: coinArt('platinum'),
  [ART.LOCO]: { idle: () => locoFront(false, false), win: () => locoFront(true, false) },
  [ART.LOCO_GOLD]: { idle: () => locoFront(false, true), win: () => locoFront(true, true) },
  [ART.SIGNAL]: { idle: () => signalHead(false), win: () => signalHead(true), winFrames: signalFrames },
  [ART.SECURITY]: { idle: () => securityCheck('idle'), win: () => securityCheck('clear'), winFrames: securityClearFrames, idleFrames: securityIdleFrames },
};
