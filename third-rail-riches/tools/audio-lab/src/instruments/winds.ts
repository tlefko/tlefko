/** Brass, free reeds (concertina, accordion), organ and the glide instruments (slide whistle, bosun's call). */
import type { Dest, Studio } from '../core/studio';

/** Oom-pah tuba: saw+square, brassy filter bloom, gentle vibrato on long notes. */
export function tuba(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number): number {
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, 0.035, 0.12, 0.75, 0.09, vel * 0.3);
  const lp = s.filter('lowpass', f * 3, 1.4, g);
  lp.frequency.setValueAtTime(f * 1.5, t);
  lp.frequency.linearRampToValueAtTime(Math.min(1800, f * 7), t + 0.04);
  lp.frequency.setTargetAtTime(Math.min(1200, f * 3.5), t + 0.05, 0.1);
  const a = s.osc('sawtooth', f, t, end, lp);
  const sq = s.gain(0.4, lp);
  const b = s.osc('square', f, t, end, sq, -4);
  for (const o of [a, b]) {
    o.detune.setValueAtTime(-35, t);
    o.detune.linearRampToValueAtTime(0, t + 0.05);
  }
  if (dur > 0.35) {
    const vib = s.gain(0, a.detune);
    vib.gain.setValueAtTime(0, t + 0.25);
    vib.gain.linearRampToValueAtTime(10, t + 0.6);
    s.osc('sine', 5.2, t, end, vib);
  }
  return end;
}

/** Brass section note (trumpets/trombones): detuned saws, filter "blat", slight grit. */
export function brass(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: { bright?: number; attack?: number; vib?: boolean } = {}): number {
  const bright = o.bright ?? 1;
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, o.attack ?? 0.03, 0.15, 0.7, 0.14, vel * 0.16);
  const drive = s.shaper(s.softClip(1.8), g);
  const lp = s.filter('lowpass', f * 4, 1.1, drive);
  const top = Math.min(9000, f * 9 * bright * (0.6 + vel * 0.6));
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.linearRampToValueAtTime(top, t + 0.045);
  lp.frequency.setTargetAtTime(top * 0.55, t + 0.05, 0.15);
  lp.frequency.setTargetAtTime(f * 1.5, t + dur, 0.06);
  const oscs: OscillatorNode[] = [];
  for (const dc of [-7, 0, 6]) oscs.push(s.osc('sawtooth', f, t, end, lp, dc + (s.rng.next() - 0.5) * 4));
  for (const osc of oscs) {
    const base = osc.detune.value;
    osc.detune.setValueAtTime(base - 30, t);
    osc.detune.linearRampToValueAtTime(base, t + 0.04);
  }
  if ((o.vib ?? true) && dur > 0.4) {
    for (const osc of oscs) {
      const vib = s.gain(0, osc.detune);
      vib.gain.setValueAtTime(0, t + 0.2);
      vib.gain.linearRampToValueAtTime(12, t + 0.5);
      s.osc('sine', 5.5, t, end, vib);
    }
  }
  return end;
}

/**
 * Muted trumpet (Harmon/plunger): nasal band-passed saw with scoops and optional "wah" (flag w),
 * fall-off (flag f) and shake (flag s).
 */
export function mutedTrumpet(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, flags = ''): number {
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, 0.018, 0.1, 0.8, 0.07, vel * 0.3);
  const hp = s.filter('highpass', 420, 0.7);
  const bp = s.filter('bandpass', 1500, 2.2);
  const lp = s.filter('lowpass', 4200, 0.7);
  const bpGain = s.gain(1.6, g);
  const lpGain = s.gain(0.28, g);
  hp.connect(bp); bp.connect(bpGain);
  hp.connect(lp); lp.connect(lpGain);
  if (flags.includes('w')) {
    bp.frequency.setValueAtTime(650, t);
    bp.frequency.linearRampToValueAtTime(1700, t + Math.min(0.28, dur * 0.8));
  } else {
    bp.frequency.setValueAtTime(1100, t);
    bp.frequency.linearRampToValueAtTime(1600, t + 0.05);
  }
  const osc = s.osc('sawtooth', f, t, end, hp);
  const sq = s.gain(0.3, hp);
  const osc2 = s.osc('square', f, t, end, sq, 5);
  for (const o of [osc, osc2]) {
    const base = o.detune.value;
    o.detune.setValueAtTime(base - (flags.includes('b') ? 150 : 40), t);
    o.detune.linearRampToValueAtTime(base, t + (flags.includes('b') ? 0.09 : 0.045));
    if (flags.includes('f')) {
      o.detune.setValueAtTime(base, t + dur * 0.6);
      o.detune.linearRampToValueAtTime(base - 500, t + dur + 0.05);
    }
  }
  if (dur > 0.3 || flags.includes('s')) {
    const vib = s.gain(0, osc.detune);
    const depth = flags.includes('s') ? 60 : 14;
    vib.gain.setValueAtTime(0, t + 0.12);
    vib.gain.linearRampToValueAtTime(depth, t + 0.35);
    s.osc('sine', flags.includes('s') ? 7.5 : 5.6, t, end, vib);
  }
  // breath
  const nb = s.filter('bandpass', 2400, 1.2, g);
  const ng = s.gain(0, nb);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.05, t + 0.015);
  ng.gain.setTargetAtTime(0.012, t + 0.02, 0.05);
  ng.gain.setTargetAtTime(0, t + dur, 0.03);
  s.noise('white', t, end, ng);
  return end;
}

/** Hot jazz clarinet: square-ish reed, scoops (flag b), vibrato. */
export function clarinet(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, flags = ''): number {
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, 0.025, 0.1, 0.85, 0.06, vel * 0.22);
  const lp = s.filter('lowpass', Math.min(5000, f * 5), 0.8, g);
  const pk = s.filter('peaking', 1300, 1.5, lp, 4);
  const osc = s.osc('square', f, t, end, pk);
  const tri = s.gain(0.5, pk);
  const osc2 = s.osc('triangle', f, t, end, tri, 3);
  for (const o of [osc, osc2]) {
    const base = o.detune.value;
    if (flags.includes('b')) {
      o.detune.setValueAtTime(base - 120, t);
      o.detune.linearRampToValueAtTime(base, t + 0.08);
    }
  }
  if (dur > 0.25) {
    const vib = s.gain(0, osc.detune);
    vib.gain.setValueAtTime(0, t + 0.1);
    vib.gain.linearRampToValueAtTime(flags.includes('s') ? 45 : 16, t + 0.3);
    s.osc('sine', flags.includes('s') ? 7 : 5.4, t, end, vib);
  }
  const nb = s.filter('highpass', 3000, 0.7, g);
  const ng = s.gain(0, nb);
  s.perc(ng.gain, t, 0.03 * vel, 0.01, 0.12);
  s.noise('white', t, t + 0.2, ng);
  return end;
}

/** Pipe organ: principal + octave ranks, pipe chiff, slow speech. */
export function organ(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: { sub?: boolean; reed?: boolean; attack?: number } = {}): number {
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, o.attack ?? 0.06, 0.1, 1, 0.3, vel * 0.13);
  const principal = s.wave([1, 0.5, 0.28, 0.32, 0.1, 0.16, 0.04, 0.1, 0.02, 0.04]);
  s.osc(principal, f, t, end, g, -2.5);
  s.osc(principal, f * 2, t, end, s.gain(0.35, g), 2);
  if (o.reed) s.osc(s.wave([1, 0.8, 0.6, 0.5, 0.4, 0.32, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08]), f, t, end, s.gain(0.3, g), 1);
  if (o.sub) s.osc('sine', f / 2, t, end, s.gain(0.8, g));
  // chiff
  const bp = s.filter('bandpass', Math.min(8000, f * 3), 3, g);
  const ng = s.gain(0, bp);
  s.perc(ng.gain, t, 0.6, 0.008, 0.07);
  s.noise('white', t, t + 0.1, ng);
  return end;
}

export interface GlidePoint {
  t: number; // time to arrive at the pitch
  f: number; // Hz
  a?: number; // amplitude 0..1 at that time
}

/** Theremin phrase: one sine voice gliding through points with vibrato and amplitude swells. */
export function theremin(s: Studio, dest: Dest, pts: GlidePoint[], vel: number, glide = 0.25): number {
  const t0 = pts[0].t;
  const tEnd = pts[pts.length - 1].t;
  const g = s.gain(0, dest);
  const shape = s.shaper(s.softClip(1.3));
  shape.connect(g);
  const osc = s.osc('sine', pts[0].f, t0, tEnd + 0.1, shape);
  const h2 = s.gain(0.08, shape);
  const osc2 = s.osc('triangle', pts[0].f, t0, tEnd + 0.1, h2);
  for (const o of [osc, osc2]) {
    o.frequency.setValueAtTime(pts[0].f, t0);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      o.frequency.setValueAtTime(pts[i - 1].f, Math.max(pts[i - 1].t, p.t - glide));
      o.frequency.exponentialRampToValueAtTime(p.f, p.t);
    }
  }
  g.gain.setValueAtTime(0, t0);
  for (const p of pts) g.gain.linearRampToValueAtTime((p.a ?? 1) * vel * 0.22, p.t);
  g.gain.linearRampToValueAtTime(0, tEnd + 0.08);
  for (const o of [osc, osc2]) {
    const vib = s.gain(0, o.frequency);
    vib.gain.setValueAtTime(0, t0);
    vib.gain.linearRampToValueAtTime(pts[0].f * 0.012, t0 + 0.5);
    s.osc('sine', 5.8, t0, tEnd + 0.1, vib);
  }
  return tEnd + 0.1;
}

/** Slide whistle: breathy sine glide through points. */
export function slideWhistle(s: Studio, dest: Dest, pts: GlidePoint[], vel: number): number {
  const t0 = pts[0].t;
  const tEnd = pts[pts.length - 1].t;
  const g = s.gain(0, dest);
  const osc = s.osc('sine', pts[0].f, t0, tEnd + 0.25, g);
  const tri = s.gain(0.15, g);
  const osc2 = s.osc('triangle', pts[0].f * 2, t0, tEnd + 0.25, tri);
  osc.frequency.setValueAtTime(pts[0].f, t0);
  osc2.frequency.setValueAtTime(pts[0].f * 2, t0);
  for (let i = 1; i < pts.length; i++) {
    osc.frequency.exponentialRampToValueAtTime(pts[i].f, pts[i].t);
    osc2.frequency.exponentialRampToValueAtTime(pts[i].f * 2, pts[i].t);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vel * 0.3, t0 + 0.03);
  for (const p of pts.slice(1)) if (p.a !== undefined) g.gain.linearRampToValueAtTime(p.a * vel * 0.3, p.t);
  // release after the last point (a ramp scheduled later would override an earlier setTarget)
  g.gain.setTargetAtTime(0, tEnd, 0.02);
  const vib = s.gain(pts[0].f * 0.006, osc.frequency);
  s.osc('sine', 6.5, t0, tEnd + 0.25, vib);
  // breath follows the pitch
  const bp = s.filter('bandpass', pts[0].f * 1.5, 2, g);
  bp.frequency.setValueAtTime(pts[0].f * 1.5, t0);
  for (let i = 1; i < pts.length; i++) bp.frequency.exponentialRampToValueAtTime(pts[i].f * 1.5, pts[i].t);
  const ng = s.gain(0.12, bp);
  s.noise('white', t0, tEnd + 0.25, ng);
  return tEnd + 0.25;
}

// ---------------------------------------------------------------- free reeds

/** Harmonic amplitudes of a free reed: a narrow air pulse (duty ~0.3) with a gentle tilt. */
function reedHarmonics(duty: number, tilt: number, count = 24): number[] {
  const out: number[] = [];
  for (let n = 1; n <= count; n++) out.push(Math.max(0.012, Math.abs(Math.sin(Math.PI * n * duty))) / Math.pow(n, tilt));
  return out;
}

export interface ReedOptions {
  /** Detune of each reed in cents (two close reeds = concertina, three wide = accordion musette). */
  reeds?: number[];
  bright?: number;
  attack?: number;
  release?: number;
  /** Bellows air noise at the attack. */
  breath?: number;
  /** Pulse duty of the reed wave (0.2 nasal .. 0.45 hollow). */
  duty?: number;
}

/**
 * Free-reed voice (concertina / accordion): pulse-like reed wave, a bank of slightly detuned reeds,
 * reed-chamber formants, bellows "chuff" and a quick valve stop. Very stable pitch, no vibrato.
 */
export function freeReed(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: ReedOptions = {}): number {
  const bright = o.bright ?? 1;
  const reeds = o.reeds ?? [-3, 3];
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, o.attack ?? 0.016, 0.1, 0.8, o.release ?? 0.06, vel * 0.3 / Math.sqrt(reeds.length));
  const hp = s.filter('highpass', 110, 0.7, g);
  const pk2 = s.filter('peaking', 2900, 1.4, hp, 2.5 * bright);
  const pk1 = s.filter('peaking', 1250, 1.1, pk2, 4);
  const lp = s.filter('lowpass', Math.min(7000, Math.max(1600, f * 9 * bright)), 0.6, pk1);
  // velocity opens the tone a little, like more bellows pressure
  lp.frequency.setValueAtTime(Math.min(7000, Math.max(1400, f * (6 + 4 * vel) * bright)), t);
  const wave = s.wave(reedHarmonics(o.duty ?? 0.3, 0.85));
  for (const dc of reeds) {
    const base = dc + (s.rng.next() - 0.5) * 1.5;
    const osc = s.osc(wave, f, t, end, lp, base);
    // reeds speak a hair flat, then settle
    osc.detune.setValueAtTime(base - 9, t);
    osc.detune.linearRampToValueAtTime(base, t + 0.03);
  }
  // bellows chuff
  const b = o.breath ?? 1;
  if (b > 0) {
    const bp = s.filter('bandpass', 1700, 0.8, lp);
    const ng = s.gain(0, bp);
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.05 * b * vel, t + 0.008);
    ng.gain.setTargetAtTime(0.006 * b * vel, t + 0.012, 0.03);
    ng.gain.setTargetAtTime(0, t + dur, 0.02);
    s.noise('white', t, end, ng);
  }
  return end;
}

/** English-style concertina: two nearly unison reeds, bright and dry. */
export function concertina(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: ReedOptions = {}): number {
  return freeReed(s, dest, t, f, dur, vel, { reeds: [-1.5, 1.5], duty: 0.28, ...o });
}

/** Accordion: three reeds with a mild musette beat, rounder than the concertina. */
export function accordion(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, o: ReedOptions = {}): number {
  return freeReed(s, dest, t, f, dur, vel, { reeds: [-9, 0, 8], duty: 0.36, bright: 0.85, attack: 0.022, ...o });
}

/**
 * Bosun's call (boatswain's pipe): a pure, breathy whistle gliding through points, with an optional
 * warble (the piper's finger trill) between `warble` = [from, to] seconds.
 */
export function bosunCall(s: Studio, dest: Dest, pts: GlidePoint[], vel: number, o: { warble?: [number, number]; rate?: number } = {}): number {
  const t0 = pts[0].t;
  const tEnd = pts[pts.length - 1].t;
  const g = s.gain(0, dest);
  const lp = s.filter('lowpass', 6500, 0.7, g);
  const osc = s.osc('sine', pts[0].f, t0, tEnd + 0.2, lp);
  const h2 = s.gain(0.06, lp);
  const osc2 = s.osc('sine', pts[0].f * 2, t0, tEnd + 0.2, h2);
  osc.frequency.setValueAtTime(pts[0].f, t0);
  osc2.frequency.setValueAtTime(pts[0].f * 2, t0);
  for (let i = 1; i < pts.length; i++) {
    osc.frequency.exponentialRampToValueAtTime(pts[i].f, pts[i].t);
    osc2.frequency.exponentialRampToValueAtTime(pts[i].f * 2, pts[i].t);
  }
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vel * 0.25, t0 + 0.035);
  for (const p of pts.slice(1)) if (p.a !== undefined) g.gain.linearRampToValueAtTime(p.a * vel * 0.25, p.t);
  g.gain.setTargetAtTime(0, tEnd, 0.02);
  if (o.warble) {
    const [w0, w1] = o.warble;
    const d = s.gain(0, osc.detune);
    d.connect(osc2.detune);
    d.gain.setValueAtTime(0, t0 + w0);
    d.gain.linearRampToValueAtTime(90, t0 + w0 + 0.04);
    d.gain.setValueAtTime(90, t0 + w1 - 0.03);
    d.gain.linearRampToValueAtTime(0, t0 + w1);
    s.osc('square', o.rate ?? 16, t0, tEnd + 0.2, s.filter('lowpass', 60, 0.7, d));
  }
  // breath follows the pitch
  const bp = s.filter('bandpass', pts[0].f, 3, g);
  bp.frequency.setValueAtTime(pts[0].f, t0);
  for (let i = 1; i < pts.length; i++) bp.frequency.exponentialRampToValueAtTime(pts[i].f, pts[i].t);
  s.noise('white', t0, tEnd + 0.2, s.gain(0.05, bp));
  return tEnd + 0.2;
}

/**
 * Saxophone (alto/tenor section voice): conical-bore saw + a little pulse through a vocal formant
 * pair, breathy attack, scoop (flag b), growl (flag g) and a late, lazy vibrato.
 */
export function sax(s: Studio, dest: Dest, t: number, f: number, dur: number, vel: number, flags = ''): number {
  const g = s.gain(0, dest);
  const end = s.adsr(g.gain, t, dur, 0.03, 0.12, 0.82, 0.08, vel * 0.2);
  const lp = s.filter('lowpass', Math.min(6000, f * (5 + 4 * vel)), 0.7, g);
  const f2 = s.filter('peaking', 1450, 1.6, lp, 6);
  const f1 = s.filter('peaking', 560, 1.3, f2, 5);
  const hp = s.filter('highpass', 140, 0.7, f1);
  const src = flags.includes('g') ? s.shaper(s.softClip(3), hp) : hp;
  const osc = s.osc('sawtooth', f, t, end, src);
  const osc2 = s.osc('square', f, t, end, s.gain(0.25, src), 4);
  for (const o of [osc, osc2]) {
    const base = o.detune.value;
    o.detune.setValueAtTime(base - (flags.includes('b') ? 140 : 25), t);
    o.detune.linearRampToValueAtTime(base, t + (flags.includes('b') ? 0.1 : 0.04));
  }
  if (flags.includes('g')) s.osc('sine', 38, t, end, s.gain(f * 0.02, osc.frequency));
  if (dur > 0.3) {
    const vib = s.gain(0);
    vib.connect(osc.detune);
    vib.connect(osc2.detune);
    vib.gain.setValueAtTime(0, t + 0.15);
    vib.gain.linearRampToValueAtTime(18, t + Math.min(0.6, dur));
    s.osc('sine', 5.2, t, end, vib);
  }
  const nb = s.filter('bandpass', 2600, 0.9, g);
  const ng = s.gain(0, nb);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(0.06 * vel, t + 0.012);
  ng.gain.setTargetAtTime(0.012 * vel, t + 0.02, 0.04);
  ng.gain.setTargetAtTime(0, t + dur, 0.03);
  s.noise('white', t, end, ng);
  return end;
}
