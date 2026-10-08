import type { SfxDef, TrackDef } from './types';
import { UI_SFX } from './sfx/ui';
import { REEL_SFX } from './sfx/reels';
import { WIN_SFX } from './sfx/wins';
import { SYMBOL_SFX } from './sfx/symbols';
import { TRAIN_SFX } from './sfx/trains';
import { EVENT_SFX } from './sfx/events';
import { SPLASH_SFX } from './sfx/splash';
import { BASE } from './music/base';
import { RUSH } from './music/rush';
import { LAST } from './music/last';
import { BIGWIN } from './music/bigwin';
import { SURGE } from './music/surge';

/** Big, rare stings live in the "extra" bank so the core bank decodes quickly. */
const EXTRA = new Set(['bonusIntro', 'bonusEnd', 'retrigger', 'goldenArrive', 'bigWinStart', 'bigWinTier', 'bigWinEnd', 'maxWin', 'tierSlam']);

export const SFX: SfxDef[] = [
  ...UI_SFX, ...REEL_SFX, ...WIN_SFX, ...SYMBOL_SFX, ...TRAIN_SFX, ...EVENT_SFX, ...SPLASH_SFX,
].map((d) =>
  EXTRA.has(d.name) ? { ...d, bank: 'extra' as const } : d,
);

export const TRACKS: TrackDef[] = [BASE, RUSH, LAST, BIGWIN, SURGE];

// sanity: unique ids
{
  const seen = new Set<string>();
  for (const d of SFX) {
    if (seen.has(d.id)) throw new Error(`duplicate sfx id ${d.id}`);
    seen.add(d.id);
  }
}
