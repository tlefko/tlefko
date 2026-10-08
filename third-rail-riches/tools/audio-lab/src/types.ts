import type { Dest, Studio } from './core/studio';
import type { Channels } from './core/dsp';

export type Bank = 'core' | 'extra';

export interface SfxDef {
  /** Unique asset id, e.g. "reelDrop_2". */
  id: string;
  /** Runtime name (SfxName) or loop name ("anticipation", "trainRun"). */
  name: string;
  /** Variation / step index for the runtime `index` option. */
  variant: number;
  bank: Bank;
  kind: 'sfx' | 'loop';
  /** One-shots: render length (the tail is trimmed automatically). Loops: loop period. */
  seconds: number;
  /** Loops: extra render time folded back onto the start. */
  tail?: number;
  /** Target loudness (max momentary, LUFS) used for normalisation. */
  level: number;
  /**
   * One-shots only: tanh soft-clip drive applied to the rendered hit (peak-normalised first). Lets a
   * transient-heavy slam reach its loudness target under the peak ceiling. Omit for no saturation.
   */
  drive?: number;
  /** Short description for the audition page. */
  desc: string;
  render: (s: Studio, out: Dest) => void | Promise<void>;
}

export interface StemDef {
  id: string; // file id suffix, e.g. "tension"
  desc: string;
}

export interface TrackDef {
  id: 'base' | 'rush' | 'last' | 'bigwin' | 'surge';
  title: string;
  desc: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  /** Seconds of reverb/release tail rendered past the loop and folded back. */
  tail: number;
  /** Master post-processing. */
  master: { crackle: number; drive: number; width: number; air: number };
  stems?: StemDef[];
  /** Render one folded loop period (stereo) of the main mix (stem undefined) or a named stem. */
  render: (stem?: string) => Promise<Channels>;
}
