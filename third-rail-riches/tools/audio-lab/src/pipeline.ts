/** Page-side render pipeline: Tone.Offline render -> fold/trim -> master post -> WAV. */
import { renderOffline } from './core/studio';
import {
  type Channels, crackleBed, eq, fadeIn, fadeOut, fold, peak, rms, saturate, scale, trimHead, trimTail, width, dbToGain,
} from './core/dsp';
import { Rng, hashString } from './core/rng';
import type { SfxDef, TrackDef } from './types';

export const SR = 44100;

export interface RenderResult {
  chs: Channels;
  meta: Record<string, unknown>;
}

/** Loop period in samples; every track is chosen so this is an integer at 44.1k and 48k. */
export function trackPeriod(def: TrackDef): number {
  const seconds = (def.bars * def.beatsPerBar * 60) / def.bpm;
  return Math.round(seconds * SR);
}

export async function renderSfx(def: SfxDef): Promise<RenderResult> {
  const seed = hashString(def.id);
  if (def.kind === 'loop') {
    const n = Math.round(def.seconds * SR);
    const raw = await renderOffline(def.seconds + (def.tail ?? 1), seed, (s) => def.render(s, s.out), { sampleRate: SR, loopLen: def.seconds });
    const chs = fold(raw, n);
    eq(chs, SR, [['highpass', 30, 0.7]], true);
    scale(chs, dbToGain(-3) / Math.max(1e-9, peak(chs)));
    return { chs, meta: { id: def.id, kind: 'loop', samples: n } };
  }
  const raw = await renderOffline(def.seconds, seed, (s) => def.render(s, s.out), { sampleRate: SR });
  eq(raw, SR, [['highpass', 28, 0.7]]);
  const head = trimHead(raw, -58);
  let chs = trimTail(head.chs, SR, -56);
  fadeIn(chs, 16);
  // a sound still ringing at the end of its render window must not stop with a click
  fadeOut(chs, Math.min(Math.round(0.03 * SR), Math.floor(chs[0].length / 4)));
  if (def.drive) {
    scale(chs, 1 / Math.max(1e-9, peak(chs)));
    saturate(chs, def.drive);
  }
  scale(chs, dbToGain(-3) / Math.max(1e-9, peak(chs)));
  chs = chs.map((c) => c.slice());
  return { chs, meta: { id: def.id, kind: 'sfx', samples: chs[0].length, trimmedHead: head.removed } };
}

/**
 * Render a track's main mix plus its stems. Stems go through exactly the same gain/EQ/saturation
 * as the main mix so their designed balance is preserved (the runtime mixes them at unity).
 */
export async function renderTrack(def: TrackDef): Promise<RenderResult[]> {
  const n = trackPeriod(def);
  const period = n / SR;
  const parts: Array<{ stem?: string; chs: Channels }> = [];
  for (const stem of [undefined, ...(def.stems ?? []).map((x) => x.id)]) {
    const chs = await def.render(stem);
    if (chs[0].length !== n) throw new Error(`${def.id}${stem ? '/' + stem : ''}: rendered ${chs[0].length} samples, expected ${n} (period ${period.toFixed(3)} s)`);
    parts.push({ stem, chs });
  }
  const main = parts[0].chs;
  const all = (fn: (c: Channels) => void) => parts.forEach((p) => fn(p.chs));
  const g1 = dbToGain(-20) / Math.max(1e-9, rms(main));
  all((c) => scale(c, g1));
  if (def.master.crackle > 0) {
    const bed = crackleBed(n, SR, new Rng(hashString(def.id) ^ 0x51f15e), {
      clicksPerSec: 7 * def.master.crackle,
      clickLevel: dbToGain(-33),
      popsPerSec: 0.25 * def.master.crackle,
      popLevel: dbToGain(-37),
      hissLevel: dbToGain(-54) * def.master.crackle,
    });
    for (let ch = 0; ch < 2; ch++) for (let i = 0; i < n; i++) main[ch][i] += bed[ch][i];
  }
  // vintage master: low cut, gentle air roll-off, a little warmth; all circular so the seam holds
  all((c) =>
    eq(c, SR, [
      ['highpass', 32, 0.7],
      ['lowshelf', 180, 0.7, 1.2],
      ['peaking', 3200, 0.8, -1.2],
      ['highshelf', 8500, 0.7, -2.5 * def.master.air],
      ['lowpass', 15500, 0.6],
    ], true),
  );
  // tape-style saturation on peaks (driven by the main mix level)
  const p = peak(main);
  all((c) => {
    scale(c, 0.9 / p);
    saturate(c, def.master.drive);
    scale(c, p / 0.9);
    width(c, def.master.width);
  });
  const g2 = dbToGain(-20) / Math.max(1e-9, rms(main));
  all((c) => scale(c, g2));
  return parts.map((p) => ({
    chs: p.chs,
    meta: {
      id: def.id + (p.stem ? `-${p.stem}` : ''),
      kind: p.stem ? 'stem' : 'track',
      parent: p.stem ? def.id : undefined,
      samples: n,
      bpm: def.bpm,
      beatsPerBar: def.beatsPerBar,
      bars: def.bars,
    },
  }));
}
