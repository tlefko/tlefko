import type { Dest, Studio } from '../core/studio';
import type { IrOptions } from '../core/dsp';
import type { Bank, SfxDef } from '../types';

export const ROOMS: Record<'small' | 'medium' | 'hall' | 'cathedral', IrOptions> = {
  small: { seconds: 0.9, rt60: 0.55, predelay: 0.006, dampStart: 8000, dampEnd: 2500, early: 8, earlySpread: 0.025, lowCut: 120 },
  medium: { seconds: 1.8, rt60: 1.2, predelay: 0.012, dampStart: 8000, dampEnd: 2200, early: 10, earlySpread: 0.04, lowCut: 100 },
  hall: { seconds: 3.4, rt60: 2.6, predelay: 0.022, dampStart: 9000, dampEnd: 2600, early: 12, earlySpread: 0.06, lowCut: 90 },
  cathedral: { seconds: 5, rt60: 4.2, predelay: 0.035, dampStart: 7000, dampEnd: 1800, early: 14, earlySpread: 0.09, lowCut: 70 },
};

/** Dry + reverb send into `out`; returns the input node to feed. */
export function withRoom(s: Studio, out: Dest, wet = 0.15, room: keyof typeof ROOMS = 'small'): GainNode {
  const input = s.gain(1);
  s.connect(input, out);
  const rv = s.reverb(`sfx-${room}`, ROOMS[room], 1, out);
  input.connect(s.gain(wet, rv));
  return input;
}

/** Output stage that fades everything out between t0 and t1 (for stings whose tail outlasts the render window). */
export function tailFade(s: Studio, out: Dest, t0: number, t1: number): GainNode {
  const g = s.gain(1, out);
  g.gain.setValueAtTime(1, t0);
  g.gain.linearRampToValueAtTime(0, t1);
  return g;
}

type Partial<T> = { [K in keyof T]?: T[K] };

/** Build a list of variants of one runtime sound. */
export function variants(
  name: string,
  count: number,
  base: Omit<SfxDef, 'id' | 'name' | 'variant' | 'render' | 'bank'> & { bank?: Bank },
  render: (i: number) => SfxDef['render'],
  over: (i: number) => Partial<SfxDef> = () => ({}),
): SfxDef[] {
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    bank: base.bank ?? 'core',
    id: `${name}_${i}`,
    name,
    variant: i,
    render: render(i),
    ...over(i),
  }));
}

export function one(name: string, base: Omit<SfxDef, 'id' | 'name' | 'variant' | 'render' | 'bank'> & { bank?: Bank }, render: SfxDef['render']): SfxDef {
  return { ...base, bank: base.bank ?? 'core', id: name, name, variant: 0, render };
}
