/**
 * The Third Rail Line, synthesised: rail joints and wheels, the third rail's electric hum, zaps and
 * crackles, steam and air (whistles, horns, hiss, brakes), station bells, ticket punches, the fare
 * register and diner china.
 */
import type { Dest, Studio } from '../core/studio';
import { additive } from './tuned';
import { block, kick } from './drums';
import { ironClank } from './foley';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- rails and wheels

/** A wheel crossing a rail joint: a hard steel tick with a short iron ring and a low truck thump. */
export function railClack(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number; thump?: number; ring?: number } = {}): number {
  const p = o.pitch ?? 1;
  let end = ironClank(s, dest, t, vel * 0.7, { f: 760 * p, decay: 0.05 + 0.05 * (o.ring ?? 1) });
  end = Math.max(end, block(s, dest, t, 1650 * p, vel * 0.35, { decay: 0.012 }));
  end = Math.max(end, kick(s, dest, t, vel * 0.32 * (o.thump ?? 1), { tone: 62 * Math.sqrt(p), decay: 0.07 }));
  const hp = s.filter('bandpass', 4200 * p, 1.2, dest);
  const g = s.gain(0, hp);
  s.perc(g.gain, t, vel * 0.25, 0.0002, 0.006);
  s.noise('white', t, t + 0.012, g);
  return end;
}

/** "Clickety-clack": two bogies over a joint, two wheels each (gap = axle spacing). */
export function clickety(s: Studio, dest: Dest, t: number, vel: number, o: { gap?: number; pitch?: number; pair?: number } = {}): number {
  const gap = o.gap ?? 0.085;
  const pair = o.pair ?? 0.26;
  const p = o.pitch ?? 1;
  let end = t;
  [0, gap, pair, pair + gap].forEach((dt, k) => {
    end = Math.max(end, railClack(s, dest, t + dt, vel * [0.8, 0.62, 1, 0.75][k], { pitch: p * [1.04, 1, 0.97, 0.94][k] }));
  });
  return end;
}

/** Train body rumble: low brown-noise roar with a trembling sub (constant level, for a span). */
export function trackRumble(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { lp?: number; fadeIn?: number; fadeOut?: number } = {}): number {
  const lp = s.filter('lowpass', o.lp ?? 320, 0.7, dest);
  const g = s.gain(0, lp);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + (o.fadeIn ?? 0.05));
  g.gain.setValueAtTime(vel, t + dur - (o.fadeOut ?? 0.1));
  g.gain.linearRampToValueAtTime(0, t + dur);
  s.noise('brown', t, t + dur + 0.02, g);
  return t + dur + 0.02;
}

// ---------------------------------------------------------------- electricity

/**
 * Third-rail hum: a mains-style buzz (fundamental + odd harmonics through a resonant filter) that can
 * glide from f0 to f1 (spin-up / spin-down).
 */
export function electricHum(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { f0?: number; f1?: number; bright?: number; fadeIn?: number; fadeOut?: number } = {}): number {
  const f0 = o.f0 ?? 60;
  const f1 = o.f1 ?? f0;
  const g = s.gain(0, dest);
  const fi = o.fadeIn ?? 0.04;
  const fo = o.fadeOut ?? 0.08;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + fi);
  g.gain.setValueAtTime(vel * 0.3, Math.max(t + fi, t + dur - fo));
  g.gain.linearRampToValueAtTime(0, t + dur);
  const lp = s.filter('lowpass', 900 * (o.bright ?? 1), 1.4, g);
  const pk = s.filter('peaking', 1800 * (o.bright ?? 1), 2, lp, 6);
  const sq = s.osc('square', f0, t, t + dur + 0.01, s.gain(0.5, pk));
  const saw = s.osc('sawtooth', f0 * 2, t, t + dur + 0.01, s.gain(0.35, pk));
  const sub = s.osc('sine', f0, t, t + dur + 0.01, s.gain(0.9, g));
  if (f1 !== f0) {
    for (const [o2, m] of [[sq, 1], [saw, 2], [sub, 1]] as const) {
      o2.frequency.setValueAtTime(f0 * m, t);
      o2.frequency.exponentialRampToValueAtTime(f1 * m, t + dur);
    }
    lp.frequency.setValueAtTime(700 * (o.bright ?? 1), t);
    lp.frequency.exponentialRampToValueAtTime(Math.min(6000, 900 * (f1 / f0) * (o.bright ?? 1)), t + dur);
  }
  return t + dur + 0.01;
}

/** Traction-motor whine gliding f0 -> f1 (a sine/triangle pair, slightly beating). */
export function motorWhine(s: Studio, dest: Dest, t: number, dur: number, vel: number, f0: number, f1: number, o: { fadeOut?: number } = {}): number {
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.12, t + dur * 0.3);
  g.gain.setValueAtTime(vel * 0.12, t + dur - (o.fadeOut ?? 0.15));
  g.gain.linearRampToValueAtTime(0, t + dur);
  for (const [type, m, a, dc] of [['triangle', 1, 1, 0], ['sine', 2, 0.35, 7], ['sine', 3.01, 0.12, 0]] as const) {
    const osc = s.osc(type, f0 * m, t, t + dur + 0.01, s.gain(a, g), dc);
    osc.frequency.setValueAtTime(f0 * m, t);
    osc.frequency.exponentialRampToValueAtTime(f1 * m, t + dur);
  }
  return t + dur + 0.01;
}

/** Tiny electric crackles: sharp band-passed clicks scattered over [t, t+dur]. */
export function crackle(s: Studio, dest: Dest, t: number, dur: number, count: number, vel: number, o: { lo?: number; hi?: number; spread?: number } = {}): number {
  const r = s.rng.fork(Math.floor(t * 997) + count * 31);
  for (let i = 0; i < count; i++) {
    const tt = t + r.next() * dur;
    const bp = s.filter('bandpass', r.range(o.lo ?? 2200, o.hi ?? 8000), r.range(1.5, 3.5), s.panner(r.range(-(o.spread ?? 0.4), o.spread ?? 0.4), dest));
    const g = s.gain(0, bp);
    s.perc(g.gain, tt, vel * (0.25 + 0.75 * Math.pow(r.next(), 2)), 0.0002, r.range(0.002, 0.008));
    s.noise('white', tt, tt + 0.014, g);
  }
  return t + dur + 0.015;
}

/**
 * Electric zap: a jittery buzz (noise-modulated pitch through a hard clip), a falling "pew", and a
 * spray of crackles. `size` scales length and weight.
 */
export function zap(s: Studio, dest: Dest, t: number, vel: number, o: { size?: number; f0?: number; f1?: number; buzz?: number; pitch?: number } = {}): number {
  const size = o.size ?? 1;
  const p = o.pitch ?? 1;
  const L = 0.22 * size;
  // buzz
  const g = s.gain(0, dest);
  s.perc(g.gain, t, vel * 0.5 * (o.buzz ?? 1), 0.002, L);
  const hp = s.filter('highpass', 380, 0.7, g);
  const pk = s.filter('peaking', 2400, 1.2, hp, 6);
  const clip = s.shaper(s.softClip(4), pk);
  const buzz = s.osc('sawtooth', 96 * p, t, t + L + 0.05, clip);
  const jit = s.gain(70 * p, buzz.frequency);
  s.noise('white', t, t + L + 0.05, s.filter('lowpass', 300, 0.7, jit));
  s.osc('square', 192 * p, t, t + L + 0.05, s.gain(0.4, clip));
  // pew
  const pg = s.gain(0, dest);
  s.perc(pg.gain, t, vel * 0.16, 0.001, L * 0.9);
  const pew = s.osc('triangle', (o.f0 ?? 3800) * p, t, t + L + 0.05, pg);
  pew.frequency.setValueAtTime((o.f0 ?? 3800) * p, t);
  pew.frequency.exponentialRampToValueAtTime((o.f1 ?? 420) * p, t + L * 0.7);
  // crack
  const cb = s.filter('highpass', 2500, 0.7, dest);
  const cg = s.gain(0, cb);
  s.perc(cg.gain, t, vel * 0.6, 0.0002, 0.012);
  s.noise('white', t, t + 0.02, cg);
  crackle(s, dest, t + 0.005, L * 1.3, Math.round(10 * size), vel * 0.7);
  return t + L * 1.4 + 0.05;
}

/** Sustained arc: a sizzling, sputtering buzz (for a sweep along cells, or a live wire humming). */
export function arc(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { f0?: number; f1?: number; sweep?: [number, number] } = {}): number {
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.25, t + 0.03);
  g.gain.setValueAtTime(vel * 0.25, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const bp = s.filter('bandpass', 1800, 1.1, g);
  if (o.sweep) {
    bp.frequency.setValueAtTime(o.sweep[0], t);
    bp.frequency.exponentialRampToValueAtTime(o.sweep[1], t + dur);
  }
  const clip = s.shaper(s.softClip(3.5), bp);
  const f0 = o.f0 ?? 110;
  const saw = s.osc('sawtooth', f0, t, t + dur + 0.02, clip);
  if (o.f1) {
    saw.frequency.setValueAtTime(f0, t);
    saw.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  }
  s.noise('white', t, t + dur + 0.02, s.filter('lowpass', 400, 0.7, s.gain(f0 * 0.8, saw.frequency)));
  const am = s.gain(0.6, clip);
  s.noise('white', t, t + dur + 0.02, s.filter('lowpass', 60, 0.7, s.gain(2.5, am.gain)));
  crackle(s, dest, t, dur, Math.round(dur * 40), vel * 0.6, { spread: 0.6 });
  return t + dur + 0.02;
}

// ---------------------------------------------------------------- steam and air

/**
 * Steam chime whistle: a few pipes sounding a chord, breathy, with the pitch climbing as the steam
 * pressure builds and drooping when the valve closes.
 */
export function steamWhistle(s: Studio, dest: Dest, t: number, dur: number, freqs: number[], vel: number, o: { attack?: number; release?: number; breath?: number } = {}): number {
  const a = o.attack ?? 0.07;
  const r = o.release ?? 0.14;
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.22 / Math.sqrt(freqs.length), t + a);
  g.gain.setValueAtTime(vel * 0.22 / Math.sqrt(freqs.length), t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + r);
  const lp = s.filter('lowpass', 7000, 0.6, g);
  const end = t + dur + r + 0.02;
  freqs.forEach((f, i) => {
    const osc = s.osc('sine', f, t, end, lp, (i - 1) * 3);
    const h2 = s.osc('sine', f * 2, t, end, s.gain(0.12, lp));
    const h3 = s.osc('triangle', f, t, end, s.gain(0.25, lp));
    for (const [node, m] of [[osc, 1], [h2, 2], [h3, 1]] as const) {
      node.frequency.setValueAtTime(f * m * 0.955, t);
      node.frequency.exponentialRampToValueAtTime(f * m, t + a * 1.6);
      node.frequency.setValueAtTime(f * m, t + dur);
      node.frequency.exponentialRampToValueAtTime(f * m * 0.97, t + dur + r);
    }
    // steam irregularity
    s.osc('sine', 4.3 + i * 0.7, t, end, s.gain(f * 0.004, osc.frequency));
    // breath around each pipe
    const bp = s.filter('bandpass', f, 6, g);
    s.noise('white', t, end, s.gain(0.5 * (o.breath ?? 1), bp));
  });
  // valve hiss
  const hp = s.filter('highpass', 3500, 0.7, g);
  s.noise('white', t, end, s.gain(0.08 * (o.breath ?? 1), hp));
  return end;
}

/**
 * Streamliner air horn: reedy saw/pulse pipes through horn formants with a soft clip. `doppler`
 * bends the pitch down by `ratio` around `at` (seconds into the note) and sweeps the pan.
 */
export function airHorn(s: Studio, dest: Dest, t: number, dur: number, freqs: number[], vel: number, o: { doppler?: { at: number; ratio: number; pan0?: number; pan1?: number; width?: number }; bright?: number } = {}): number {
  const pan = s.panner(o.doppler?.pan0 ?? 0, dest);
  const g = s.gain(0, pan);
  const lvl = (vel * 0.2) / Math.sqrt(freqs.length);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(lvl, t + 0.04);
  g.gain.setValueAtTime(lvl, t + dur - 0.06);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const b = o.bright ?? 1;
  const lp = s.filter('lowpass', 4200 * b, 0.7, g);
  const clip = s.shaper(s.softClip(2.2), lp);
  const f2 = s.filter('peaking', 1500 * b, 1.6, clip, 7);
  const f1 = s.filter('peaking', 620, 1.3, f2, 6);
  const hp = s.filter('highpass', 180, 0.7, f1);
  const end = t + dur + 0.02;
  const d = o.doppler;
  if (d) {
    pan.pan.setValueAtTime(d.pan0 ?? -0.7, t);
    pan.pan.linearRampToValueAtTime(d.pan1 ?? 0.7, t + dur);
    lp.frequency.setValueAtTime(2500 * b, t);
    lp.frequency.linearRampToValueAtTime(5200 * b, t + d.at);
    lp.frequency.linearRampToValueAtTime(1600 * b, t + dur);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl * 0.45, t + 0.04);
    g.gain.linearRampToValueAtTime(lvl, t + d.at);
    g.gain.linearRampToValueAtTime(lvl * 0.3, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
  }
  freqs.forEach((f, i) => {
    for (const [type, a, dc] of [['sawtooth', 1, -4], ['square', 0.45, 5]] as const) {
      const osc = s.osc(type, f, t, end, s.gain(a, hp), dc + i);
      osc.frequency.setValueAtTime(f * 0.97, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      if (d) {
        const w = d.width ?? 0.25;
        osc.frequency.setValueAtTime(f, Math.max(t + 0.05, t + d.at - w));
        osc.frequency.exponentialRampToValueAtTime(f * d.ratio, t + d.at + w);
      }
    }
  });
  return end;
}

/** Steam hiss / air-brake release: bright noise that bursts and thins out. */
export function steamHiss(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { bright?: number; attack?: number } = {}): number {
  const b = o.bright ?? 1;
  const hp = s.filter('highpass', 1800 * b, 0.7, dest);
  const pk = s.filter('peaking', 5200 * b, 1, hp, 5);
  const g = s.gain(0, pk);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + (o.attack ?? 0.02));
  g.gain.setTargetAtTime(vel * 0.2, t + (o.attack ?? 0.02), dur * 0.25);
  g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.12);
  s.noise('white', t, t + dur + 0.05, g);
  const lp = s.filter('bandpass', 900, 0.8, dest);
  const lg = s.gain(0, lp);
  s.perc(lg.gain, t, vel * 0.35, 0.01, dur * 0.4);
  s.noise('pink', t, t + dur, lg);
  return t + dur + 0.05;
}

/** Brake squeal: steel on steel, two singing partials with stick-slip flutter and a grinding bed. */
export function brakeSqueal(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { f?: number; drop?: number } = {}): number {
  const f = o.f ?? 2350;
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.16, t + 0.07);
  g.gain.linearRampToValueAtTime(vel * 0.12, t + dur * 0.6);
  g.gain.linearRampToValueAtTime(vel * 0.16, t + dur * 0.85);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const am = s.gain(0.75, g);
  s.osc('triangle', 13, t, t + dur, s.gain(0.25, am.gain));
  const end = t + dur + 0.02;
  for (const [m, a] of [[1, 1], [1.43, 0.45], [2.01, 0.18]] as const) {
    const osc = s.osc('sine', f * m, t, end, s.gain(a, am));
    osc.frequency.setValueAtTime(f * m * 1.03, t);
    osc.frequency.linearRampToValueAtTime(f * m * (o.drop ?? 0.93), t + dur);
    s.osc('sine', 6.5, t, end, s.gain(f * m * 0.008, osc.frequency));
  }
  const bp = s.filter('bandpass', f, 5, g);
  s.noise('white', t, end, s.gain(0.6, bp));
  const lp = s.filter('lowpass', 500, 0.7, dest);
  const lg = s.gain(0, lp);
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(vel * 0.4, t + 0.05);
  lg.gain.linearRampToValueAtTime(0, t + dur);
  s.noise('brown', t, end, lg);
  return end;
}

/**
 * Two-tone guard's whistle (the conductor's brass whistle): two small chambers sounding together,
 * a pea fluttering in the bore, breath on top.
 */
export function guardWhistle(s: Studio, dest: Dest, t: number, dur: number, vel: number, o: { f?: number; ratio?: number; trill?: number } = {}): number {
  const f = o.f ?? 2300;
  const g = s.gain(0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.2, t + 0.018);
  g.gain.setValueAtTime(vel * 0.2, t + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, t + dur);
  const am = s.gain(0.7, g);
  s.osc('triangle', o.trill ?? 31, t, t + dur, s.gain(0.3, am.gain));
  const end = t + dur + 0.01;
  for (const [m, a] of [[1, 1], [o.ratio ?? 1.26, 0.8]] as const) {
    const osc = s.osc('sine', f * m, t, end, s.gain(a, am));
    osc.frequency.setValueAtTime(f * m * 0.97, t);
    osc.frequency.exponentialRampToValueAtTime(f * m, t + 0.03);
    s.osc('triangle', o.trill ?? 31, t, end, s.gain(f * m * 0.012, osc.frequency));
  }
  const bp = s.filter('bandpass', f * 1.1, 3, g);
  s.noise('white', t, end, s.gain(0.5, bp));
  return end;
}

// ---------------------------------------------------------------- bells, punches, register, china

/** Electric station bell: a small brass gong hammered ~20 times a second ("trrring"). */
export function electricBell(s: Studio, dest: Dest, t: number, dur: number, f: number, vel: number, o: { rate?: number } = {}): number {
  const rate = o.rate ?? 21;
  const g = s.gain(0, dest);
  const n = Math.max(1, Math.floor(dur * rate));
  for (let i = 0; i < n; i++) {
    const tt = t + i / rate;
    const v = vel * (i === 0 ? 1 : 0.62 + 0.1 * Math.sin(i * 1.7));
    g.gain.setValueAtTime(v * 0.6, tt);
    g.gain.linearRampToValueAtTime(v, tt + 0.002);
    g.gain.setTargetAtTime(v * 0.45, tt + 0.003, 0.012);
  }
  g.gain.setTargetAtTime(0, t + n / rate, 0.18);
  const end = t + n / rate + 1.2;
  const parts: Array<[number, number]> = [[1, 1], [2.32, 0.55], [4.16, 0.32], [5.43, 0.18], [6.79, 0.1]];
  for (const [r, a] of parts) s.osc('sine', f * r, t, end, s.gain(a * 0.16, g), (r - 1) * 2);
  // clapper ticks
  const bp = s.filter('bandpass', f * 3.1, 2, dest);
  const cg = s.gain(0, bp);
  for (let i = 0; i < n; i++) s.perc(cg.gain, t + i / rate, vel * 0.15, 0.0003, 0.008);
  s.noise('white', t, t + n / rate + 0.02, cg);
  return end;
}

/** Ticket punch: a steel jaw "chk" through card stock, a spring tick and the chad popping out. */
export function ticketPunch(s: Studio, dest: Dest, t: number, vel: number, o: { pitch?: number } = {}): number {
  const p = o.pitch ?? 1;
  block(s, dest, t, 2900 * p, vel * 0.6, { decay: 0.01 });
  block(s, dest, t + 0.002, 1150 * p, vel * 0.35, { decay: 0.018 });
  const hp = s.filter('bandpass', 5200 * p, 1.4, dest);
  const g = s.gain(0, hp);
  s.perc(g.gain, t + 0.001, vel * 0.7, 0.0003, 0.014);
  s.noise('white', t, t + 0.03, g);
  // card stock gives way
  const pb = s.filter('bandpass', 2400 * p, 0.9, dest);
  const pg = s.gain(0, pb);
  s.perc(pg.gain, t + 0.006, vel * 0.35, 0.002, 0.03);
  s.noise('pink', t, t + 0.06, pg);
  additive(s, dest, t + 0.004, 4700 * p, vel * 0.05, [[1, 1, 0.09], [1.47, 0.5, 0.06]], 0.0003);
  return t + 0.12;
}

/** Ceramic diner cup on its saucer: bright, short, slightly inharmonic. */
export function chinaClink(s: Studio, dest: Dest, t: number, f: number, vel: number): number {
  const end = additive(s, dest, t, f, vel * 0.18, [[1, 1, 0.38], [2.32, 0.6, 0.22], [3.86, 0.35, 0.14], [5.61, 0.18, 0.08]], 0.0003);
  const bp = s.filter('bandpass', f * 2.5, 2, dest);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.25, 0.0002, 0.006);
  s.noise('white', t, t + 0.012, g);
  return end;
}

/** Fare register "ka-ching": the key and drawer lever clunk, then the bright bell. */
export function register(s: Studio, dest: Dest, t: number, vel: number, o: { bell?: number } = {}): number {
  ironClank(s, dest, t, vel * 0.5, { f: 520, decay: 0.08 });
  block(s, dest, t, 1400, vel * 0.4, { decay: 0.015 });
  kick(s, dest, t + 0.004, vel * 0.25, { tone: 90, decay: 0.06 });
  const bt = t + 0.075;
  const bf = o.bell ?? 2093;
  const end = additive(s, dest, bt, bf, vel * 0.2, [[1, 1, 1.4], [1.003, 0.5, 1.2], [2.0, 0.55, 0.7], [2.76, 0.3, 0.4], [3.5, 0.2, 0.25], [5.1, 0.1, 0.12]], 0.0005);
  const cb = s.filter('bandpass', bf * 3, 2, dest);
  const cg = s.gain(0, cb);
  s.perc(cg.gain, bt, vel * 0.3, 0.0002, 0.01);
  s.noise('white', bt, bt + 0.02, cg);
  return Math.max(end, clamp(bt + 1.4, 0, 99));
}
