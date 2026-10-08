/** Plucked and bowed strings plus a formant choir. */
import type { Dest, Studio } from '../core/studio';

/** Upright bass pizzicato: triangle + sine body, closing lowpass, finger noise. */
export function pizz(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number; dur?: number } = {}): number {
  const t60 = o.decay ?? 1.5;
  const g = s.gain(0, dest);
  let end = s.perc(g.gain, t, vel * 0.45, 0.005, t60) + 0.05;
  if (o.dur !== undefined) {
    g.gain.setTargetAtTime(0, t + Math.max(0.06, o.dur), 0.06);
    end = Math.min(end, t + Math.max(0.06, o.dur) + 0.4);
  }
  const lp = s.filter('lowpass', f * 8, 1.6, g);
  lp.frequency.setValueAtTime(Math.min(f * 12, 3200), t);
  lp.frequency.setTargetAtTime(f * 2.2, t, 0.09);
  const o1 = s.osc('triangle', f, t, end, lp);
  o1.detune.setValueAtTime(22, t);
  o1.detune.setTargetAtTime(0, t, 0.035);
  const sub = s.gain(0.55, g);
  const o2 = s.osc('sine', f, t, end, sub);
  o2.detune.setValueAtTime(22, t);
  o2.detune.setTargetAtTime(0, t, 0.035);
  // finger
  const bp = s.filter('bandpass', 700, 1.1, dest);
  const ng = s.gain(0, bp);
  s.perc(ng.gain, t, 0.1 * vel, 0.001, 0.035);
  s.noise('pink', t, t + 0.06, ng);
  return end;
}

/** Concert harp: soft pluck, long ring, gently closing brightness. */
export function harp(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const t60 = o.decay ?? Math.max(0.9, Math.min(4, 3.2 * Math.sqrt(220 / f)));
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.3, 0.003, t60) + 0.05;
  const lp = s.filter('lowpass', f * 6, 0.9, g);
  lp.frequency.setValueAtTime(Math.min(9000, f * 12), t);
  lp.frequency.setTargetAtTime(Math.min(6000, f * 3.5), t, 0.12);
  s.osc('triangle', f, t, end, lp);
  s.osc('sine', f * 2, t, end, s.gain(0.18, lp));
  s.osc('sine', f, t, end, s.gain(0.5, g));
  const hp = s.filter('bandpass', Math.min(6000, f * 4), 1.5, dest);
  const ng = s.gain(0, hp);
  s.perc(ng.gain, t, 0.04 * vel, 0.001, 0.02);
  s.noise('white', t, t + 0.03, ng);
  return end;
}

/** Banjo string: bright saw through a fast-closing filter, twangy and short. */
export function banjo(s: Studio, dest: Dest, t: number, f: number, vel: number, o: { decay?: number } = {}): number {
  const t60 = o.decay ?? 0.45;
  const g = s.gain(0, dest);
  const end = s.perc(g.gain, t, vel * 0.16, 0.001, t60) + 0.03;
  const lp = s.filter('lowpass', 5000, 2, g);
  lp.frequency.setValueAtTime(Math.min(7000, f * 14), t);
  lp.frequency.setTargetAtTime(Math.max(900, f * 3), t, 0.06);
  s.osc('sawtooth', f, t, end, lp, (s.rng.next() - 0.5) * 8);
  const hp = s.filter('highpass', 2500, 0.7, dest);
  const ng = s.gain(0, hp);
  s.perc(ng.gain, t, 0.05 * vel, 0.0005, 0.01);
  s.noise('white', t, t + 0.02, ng);
  return end;
}

/** Bowed string section note: detuned saws, soft lowpass, optional tremolo bowing. */
export function strings(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: { tremolo?: number; attack?: number; release?: number; bright?: number } = {}): number {
  const a = o.attack ?? 0.18;
  const r = o.release ?? 0.4;
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, a, 0.3, 0.85, r, vel * 0.09);
  const lp = s.filter('lowpass', Math.min(9000, (o.bright ?? 1) * Math.max(1400, f * 5)), 0.6);
  let node: AudioNode = lp;
  if (o.tremolo) {
    const tg = s.gain(0.55);
    lp.connect(tg);
    const lg = s.gain(0.45, tg.gain);
    s.osc('triangle', o.tremolo * (1 + (s.rng.next() - 0.5) * 0.06), t, end, lg);
    node = tg;
  }
  s.connect(node, g);
  for (const dc of [-9, 0, 8]) s.osc('sawtooth', f, t, end, lp, dc + (s.rng.next() - 0.5) * 3);
  // slow vibrato
  return end;
}

const VOWELS: Record<string, [number, number, number][]> = {
  // [freq, gain, Q]
  oo: [[320, 1, 7], [800, 0.35, 9], [2300, 0.08, 11]],
  oh: [[450, 1, 7], [850, 0.45, 9], [2500, 0.1, 11]],
  ah: [[700, 1, 6], [1150, 0.55, 8], [2700, 0.15, 10]],
  ee: [[290, 1, 7], [2200, 0.3, 11], [3000, 0.14, 12]],
};

/** Soft choir voice: detuned saws with vibrato into a vowel formant bank. */
export function choir(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: { vowel?: keyof typeof VOWELS; attack?: number; release?: number } = {}): number {
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, o.attack ?? 0.5, 0.4, 0.9, o.release ?? 1.0, vel * 0.5);
  const sum = s.gain(1);
  for (const [fq, gain, q] of VOWELS[o.vowel ?? 'oo']) {
    const bp = s.filter('bandpass', fq, q);
    sum.connect(bp);
    const bg = s.gain(gain * 2.2, g);
    bp.connect(bg);
  }
  for (const dc of [-10, -2, 7]) {
    const osc = s.osc('sawtooth', f, t, end, sum, dc);
    const vib = s.gain(9 + s.rng.next() * 6, osc.detune);
    s.osc('sine', 4.6 + s.rng.next() * 1.2, t - s.rng.next() * 0.3, end, vib);
  }
  return end;
}

// body resonance banks: [freq, Q, gain dB]
const BODIES: Record<'violin' | 'cello', { modes: [number, number, number][]; hp: number; lp: number }> = {
  violin: { modes: [[285, 2.6, 5], [470, 3, 4], [1500, 1, -4], [2750, 1.3, 5], [4300, 2.2, 1.5]], hp: 190, lp: 7200 },
  cello: { modes: [[105, 2.4, 4], [195, 3, 4], [620, 1.6, -3], [1250, 1.5, 3], [2300, 2, 1]], hp: 58, lp: 4600 },
};

/**
 * Bowed solo string (fiddle or cello): sawtooth Helmholtz motion through a body-resonance bank,
 * delayed vibrato, bow noise and a scratchy "catch" on the attack.
 * Flags: g = slide up from a semitone below, v = wide vibrato, t = tremolo bowing, a = accented bite.
 */
export function bowed(
  s: Studio,
  dest: Dest,
  t: number,
  f: number,
  dur: number,
  vel: number,
  o: { body?: 'violin' | 'cello'; vib?: number; attack?: number; release?: number; flags?: string; bright?: number; tremolo?: number } = {},
): number {
  const body = BODIES[o.body ?? 'violin'];
  const flags = o.flags ?? '';
  const g = s.gain(0, dest);
  const a = o.attack ?? (dur < 0.25 ? 0.012 : 0.05);
  const end = s.adsr(g.gain, t, dur, a, 0.12, 0.82, o.release ?? 0.09, vel * 0.16);
  // body
  let node: AudioNode = s.filter('lowpass', Math.min(body.lp, Math.max(1800, f * 14)) * (o.bright ?? 1), 0.6, g);
  for (const [fq, q, gdb] of body.modes) node = s.filter('peaking', fq, q, node, gdb);
  const input = s.filter('highpass', body.hp, 0.7, node);
  let src: AudioNode = input;
  const trem = o.tremolo ?? (flags.includes('t') ? 12 : 0);
  if (trem) {
    const tg = s.gain(0.5, input);
    s.osc('triangle', trem * (1 + (s.rng.next() - 0.5) * 0.08), t, end, s.gain(0.5, tg.gain));
    src = tg;
  }
  const oscs: OscillatorNode[] = [];
  const main = s.osc('sawtooth', f, t, end, src, (s.rng.next() - 0.5) * 3);
  oscs.push(main);
  oscs.push(s.osc('sawtooth', f, t, end, s.gain(0.22, src), 6 + (s.rng.next() - 0.5) * 2));
  for (const osc of oscs) {
    const base = osc.detune.value;
    if (flags.includes('g')) {
      osc.detune.setValueAtTime(base - 100, t);
      osc.detune.linearRampToValueAtTime(base, t + Math.min(0.09, dur * 0.4));
    } else {
      osc.detune.setValueAtTime(base - 12, t);
      osc.detune.linearRampToValueAtTime(base, t + 0.04);
    }
  }
  // vibrato: delayed onset, only on notes long enough to carry it
  const depth = o.vib ?? (flags.includes('v') ? 24 : 13);
  if (dur > 0.24 && depth > 0) {
    const vg = s.gain(0);
    for (const osc of oscs) vg.connect(osc.detune);
    vg.gain.setValueAtTime(0, t + 0.1);
    vg.gain.linearRampToValueAtTime(depth, t + Math.min(0.45, dur * 0.7));
    s.osc('sine', 5.6 + s.rng.next() * 0.6, t, end, vg);
  }
  // bow noise: scratchy catch, then a faint hair noise under the note
  const bp = s.filter('bandpass', 3200, 0.8, input);
  const ng = s.gain(0, bp);
  const bite = flags.includes('a') ? 1.8 : 1;
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.09 * bite, t + 0.006);
  ng.gain.setTargetAtTime(0.014, t + 0.012, 0.025);
  ng.gain.setTargetAtTime(0, t + dur, 0.03);
  s.noise('white', t, end, ng);
  return end;
}

/** Fiddle: the bowed violin voice. */
export function fiddle(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, flags = ''): number {
  return bowed(s, dest, t, f, dur, vel, { body: 'violin', flags });
}
