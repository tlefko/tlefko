/** Keys: a slightly honky-tonk upright piano for stride and comping. */
import type { Dest, Studio } from '../core/studio';
import { additive } from './tuned';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * Upright piano note: stiff-string partials (slight inharmonicity, faster decay up the series), two
 * strings a few cents apart for the bar-room beat, a felt hammer knock and a damper at note-off.
 * `honky` widens the string detune (0 = in tune, 1 = saloon upright).
 */
export function piano(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: { bright?: number; honky?: number; sustain?: boolean } = {}): number {
  const out = s.gain(1, dest);
  const T = clamp(7.5 * Math.pow(110 / f, 0.6), 0.7, 9);
  const B = 0.0003 * Math.pow(Math.max(f, 60) / 110, 0.4);
  const bright = clamp((o.bright ?? 1) * (0.35 + 0.8 * vel), 0.2, 1.3);
  const n = Math.max(3, Math.min(14, Math.floor(9500 / f)));
  const parts: Array<[number, number, number]> = [];
  for (let k = 1; k <= n; k++) {
    const ratio = k * Math.sqrt(1 + B * k * k);
    // hammer strike point near 1/8 of the string: a soft notch around the 8th partial
    const notch = 0.35 + 0.65 * Math.abs(Math.sin((Math.PI * k) / 8.3));
    const amp = Math.pow(k, -1.15) * Math.exp(-(k - 1) * (0.6 - 0.4 * bright)) * notch;
    parts.push([ratio, amp, T / (1 + 0.32 * (k - 1))]);
  }
  const dc = 1.2 + 3.5 * (o.honky ?? 0.5);
  let end = additive(s, out, t, f, vel * 0.075, parts, 0.0018, -dc);
  end = Math.max(end, additive(s, out, t, f, vel * 0.075, parts, 0.0018, dc));
  // the "aftersound": a slower, quieter fundamental pair carries long notes
  end = Math.max(end, additive(s, out, t, f, vel * 0.03, [[1, 1, T * 1.8], [2, 0.3, T * 1.1]], 0.004, dc * 0.3));
  // felt hammer knock + soundboard thump
  const bp = s.filter('bandpass', clamp(f * 2.5, 300, 4200), 1.1, dest);
  const ng = s.gain(0, bp);
  s.perc(ng.gain, t, vel * 0.06, 0.0005, 0.03);
  s.noise('pink', t, t + 0.05, ng);
  const lp = s.filter('lowpass', 220, 0.7, dest);
  const tg = s.gain(0, lp);
  s.perc(tg.gain, t, vel * 0.05, 0.001, 0.05);
  s.noise('brown', t, t + 0.08, tg);
  if (!o.sustain) {
    const off = t + Math.max(0.05, dur);
    out.gain.setValueAtTime(1, off);
    out.gain.setTargetAtTime(0, off, f < 200 ? 0.09 : 0.06);
    end = Math.min(end, off + 0.6);
  }
  return end;
}
