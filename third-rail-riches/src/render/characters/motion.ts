/**
 * Motion budget for track C's animation (characters, wheel, win bar, big moments): reads track P's
 * quality switch (src/render/quality.ts) and prefers-reduced-motion in one place.
 */
import { speed } from '../timing';
import { quality } from '../quality';

export const motion = {
  /** Cut secondary loops, particles and extra fx. */
  get low(): boolean {
    return quality.low;
  },
  /** prefers-reduced-motion: no shakes, flashes or big jumps; keep it calm and readable. */
  get reduced(): boolean {
    return speed.reduced;
  },
  /** Scale for particle counts (1 normally, fewer on low quality or reduced motion). */
  get fx(): number {
    return quality.low ? 0.45 : speed.reduced ? 0.6 : 1;
  },
};
