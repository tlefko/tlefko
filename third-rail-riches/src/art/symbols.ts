/**
 * The symbol set, keyed by symbol id (see math/types Sym). Powder Keg Cove: four sea lows, four
 * crew highs, the captain, the powder keg wild, the treasure chest scatter and the Kaboom Bomb
 * (docs/ART.md, docs/POLISH.md). `win` is the keg's lit state and the chest's open state;
 * creatures blink and cheer.
 *
 * Every frame of a symbol shares the 256 viewBox and anchor, so frames swap without jumping.
 */
import { anchor, anchorWinFrames, shell, shellWinFrames, treasureMap, mapWinFrames, compass, compassWinFrames } from './sea';
import { crabHead, crabWinFrames, octoHead, octoWinFrames, sharkHead, sharkWinFrames, parrotSymbol, parrotWinFrames, type Pose } from './critters';
import { captainHead } from './captain';
import { powderKeg, treasureChest, treasureChestOpen } from './keg';
import { bombIdle, bombHot, bombIdleFrames, bombHotFrames } from './bomb';

export type { Pose };

export interface SymbolArt {
  idle: () => string;
  blink?: () => string;
  /** A single win pose (keg: lit, chest: open, creatures: cheer). */
  win?: () => string;
  /** 3-4 frames looped during the win highlight (paying symbols). */
  winFrames?: (() => string)[];
  /** Optional frames looped while the symbol sits idle (the bomb's fuse flicker). */
  idleFrames?: (() => string)[];
  /** Kaboom Bomb only: about to blow (red-hot iron, glowing cracks), and its optional pulse. */
  hot?: () => string;
  hotFrames?: (() => string)[];
}

const poses = (fn: (p: Pose) => string) => ({ idle: () => fn('idle'), blink: () => fn('blink'), win: () => fn('win') });

export const SYMBOL_ART: Record<number, SymbolArt> = {
  0: { idle: anchor, winFrames: anchorWinFrames },
  1: { idle: shell, winFrames: shellWinFrames },
  2: { idle: treasureMap, winFrames: mapWinFrames },
  3: { idle: compass, winFrames: compassWinFrames },
  4: { ...poses(crabHead), winFrames: crabWinFrames },
  5: { ...poses(octoHead), winFrames: octoWinFrames },
  6: { ...poses(sharkHead), winFrames: sharkWinFrames },
  7: { ...poses(parrotSymbol), winFrames: parrotWinFrames },
  8: { idle: () => captainHead('idle', true), blink: () => captainHead('blink', true), win: () => captainHead('laugh', true) },
  9: { idle: () => powderKeg(false), win: () => powderKeg(true) },
  10: { idle: treasureChest, win: treasureChestOpen },
  11: { idle: bombIdle, hot: bombHot, idleFrames: bombIdleFrames, hotFrames: bombHotFrames },
};
