import type { SfxDef, TrackDef } from './types';
import { REEL_SFX } from './sfx/reels';
import { UI_SFX } from './sfx/ui';
import { WIN_SFX } from './sfx/wins';
import { WHEEL_SFX } from './sfx/wheel';
import { EVENT_SFX } from './sfx/events';
import { KEG_SFX } from './sfx/kegs';
import { BOMB_SFX } from './sfx/bomb';
import { CREW_SFX } from './sfx/crew';
import { SYMBOL_SFX } from './sfx/symbols';
import { SPLASH_SFX } from './sfx/splash';
import { BASE } from './music/base';
import { TANTRUM } from './music/tantrum';
import { WITCHING } from './music/witching';
import { LIMBO } from './music/limbo';
import { BIGWIN } from './music/bigwin';

/** Big, rare stings live in the "extra" bank so the core bank decodes quickly. */
const EXTRA = new Set(['bonusIntro', 'bonusEnd', 'retrigger', 'bigWinStart', 'bigWinTier', 'bigWinEnd', 'maxWin', 'tierSlam']);

export const SFX: SfxDef[] = [
  ...UI_SFX, ...REEL_SFX, ...WIN_SFX, ...WHEEL_SFX, ...EVENT_SFX, ...KEG_SFX,
  ...BOMB_SFX, ...CREW_SFX, ...SYMBOL_SFX, ...SPLASH_SFX,
].map((d) =>
  EXTRA.has(d.name) ? { ...d, bank: 'extra' as const } : d,
);

export const TRACKS: TrackDef[] = [BASE, TANTRUM, WITCHING, LIMBO, BIGWIN];

// sanity: unique ids
{
  const seen = new Set<string>();
  for (const d of SFX) {
    if (seen.has(d.id)) throw new Error(`duplicate sfx id ${d.id}`);
    seen.add(d.id);
  }
}
