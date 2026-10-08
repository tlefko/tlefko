/** Arrangement helpers shared by the music tracks. */
import type { Rng } from '../core/rng';
import { Clock, type NoteEvent } from '../core/score';
import { chord, chordPcs, pcAtOrAbove, voice, type Chord, mtof } from '../core/notes';
import type { Stem } from '../core/mixer';
import { timberGroan, wave } from '../instruments/foley';

export interface ChordSlot {
  beat: number; // absolute beat where the chord starts
  len: number; // beats
  chord: Chord;
}

/**
 * Chord chart: one entry per bar; "Dm" fills the bar, "Dm A7" splits it evenly, "Dm . . A7" puts the
 * chords on the given beats ('.' = hold previous).
 */
export function chart(bars: string[], beatsPerBar: number): ChordSlot[] {
  const out: ChordSlot[] = [];
  bars.forEach((bar, b) => {
    const toks = bar.trim().split(/\s+/);
    if (toks.length === 1 || toks.length === beatsPerBar) {
      const step = toks.length === 1 ? beatsPerBar : 1;
      toks.forEach((t, i) => {
        if (t === '.') {
          out[out.length - 1].len += step;
          return;
        }
        out.push({ beat: b * beatsPerBar + i * step, len: step, chord: chord(t) });
      });
    } else {
      const step = beatsPerBar / toks.length;
      toks.forEach((t, i) => out.push({ beat: b * beatsPerBar + i * step, len: step, chord: chord(t) }));
    }
  });
  return out;
}

export function chordAt(slots: ChordSlot[], beat: number): ChordSlot {
  let cur = slots[0];
  for (const s of slots) if (s.beat <= beat + 1e-9) cur = s;
  return cur;
}

export class Arr {
  readonly period: number;
  constructor(
    public rng: Rng,
    public clock: Clock,
    public bars: number,
    public humanTime = 0.004,
    public humanVel = 0.07,
  ) {
    this.period = clock.bars(bars);
  }
  get totalBeats(): number {
    return this.bars * this.clock.beatsPerBar;
  }
  wrap(t: number): number {
    const p = this.period;
    return ((t % p) + p) % p;
  }
  /** Seconds for a beat position (swing, humanise, wrapped into the loop). */
  t(beat: number, jitter = true): number {
    return this.wrap(this.clock.t(beat) + (jitter ? this.rng.gauss() * this.humanTime : 0));
  }
  /** Seconds for a beat position ignoring swing (triplets, rolls). */
  straight(beat: number): number {
    return this.wrap(beat * this.clock.spb);
  }
  len(beat: number, dur: number): number {
    return this.clock.len(beat, dur);
  }
  v(vel: number): number {
    return Math.max(0.05, Math.min(1, vel * (1 + this.rng.gauss() * this.humanVel)));
  }
  /** Play parsed notation through a voice callback (one call per note of each event). */
  play(events: NoteEvent[], fn: (t: number, f: number, dur: number, vel: number, ev: NoteEvent, midi: number) => void, o: { offset?: number; transpose?: number; velScale?: number; strum?: number } = {}): void {
    for (const ev of events) {
      const beat = ev.beat + (o.offset ?? 0);
      const t = this.t(beat);
      const dur = this.len(beat, ev.dur);
      const vel = this.v(ev.vel * (o.velScale ?? 1));
      ev.notes.forEach((m, i) => {
        const mm = m + (o.transpose ?? 0);
        fn(this.wrap(t + i * (o.strum ?? 0)), mtof(mm), dur, vel, ev, mm);
      });
    }
  }
}

/** Walking bass: root on 1, chord tones, chromatic approach on 4. Returns MIDI per beat. */
export function walkingBass(slots: ChordSlot[], totalBeats: number, lo = 31, hi = 50): Array<{ beat: number; midi: number }> {
  const out: Array<{ beat: number; midi: number }> = [];
  let prev = lo + 7;
  for (let b = 0; b < totalBeats; b++) {
    const slot = chordAt(slots, b);
    const next = chordAt(slots, (b + 1) % totalBeats);
    const pcs = chordPcs(slot.chord);
    const posInChord = b - slot.beat;
    const lastOfChord = b + 1 >= slot.beat + slot.len;
    let m: number;
    const near = (pc: number) => {
      let best = pcAtOrAbove(pc, lo);
      for (let n = best; n <= hi; n += 12) if (Math.abs(n - prev) < Math.abs(best - prev)) best = n;
      return best;
    };
    if (posInChord === 0) m = near(slot.chord.bass);
    else if (lastOfChord) {
      const target = near(next.chord.bass);
      m = target + (prev > target ? 1 : -1);
      if (m < lo) m += 2;
    } else m = near(pcs[(posInChord % 2) + 1] ?? pcs[0]);
    m = Math.max(lo, Math.min(hi, m));
    out.push({ beat: b, midi: m });
    prev = m;
  }
  return out;
}

/** Voice-led chord voicings for each slot inside [lo, hi]. */
export function voicings(slots: ChordSlot[], lo: number, hi: number, count: number): number[][] {
  const out: number[][] = [];
  let prev: number[] | undefined;
  for (const s of slots) {
    const v = voice(s.chord, lo, hi, count, prev);
    out.push(v);
    prev = v;
  }
  return out;
}

/** A chord tone 3..9 semitones below the melody note (a second voice in thirds and sixths). */
export function harmonyBelow(mel: number, pcs: number[]): number {
  for (let d = 3; d <= 9; d++) if (pcs.includes((((mel - d) % 12) + 12) % 12)) return mel - d;
  return mel - 5;
}

/**
 * Sea bed for a loop: overlapping waves alternating between two stems (left/right) plus a few
 * slow timber creaks. Shots wrap around the loop, so the bed is seamless.
 */
export function seaBed(
  left: Stem,
  right: Stem,
  period: number,
  rng: Rng,
  o: { key: string; waves?: number; creaks?: number; creakVel?: number; vel?: number; bright?: number },
): void {
  const n = o.waves ?? Math.max(2, Math.round(period / 5));
  for (let i = 0; i < n; i++) {
    const t = (i + rng.range(-0.2, 0.2)) * (period / n);
    const dur = rng.range(4.4, 6.4);
    const v = (o.vel ?? 1) * rng.range(0.65, 1);
    const b = (o.bright ?? 1) * rng.range(0.85, 1.15);
    (i % 2 ? right : left).shot(`${o.key}-wave-${i}`, dur + 0.3, t, (s, out) => wave(s, out, 0, dur, v, { bright: b }));
  }
  const c = o.creaks ?? 0;
  for (let i = 0; i < c; i++) {
    const t = ((i + rng.range(0.2, 0.8)) * period) / c;
    const dur = rng.range(1.0, 1.8);
    const p = rng.range(0.8, 1.25);
    (i % 2 ? left : right).shot(`${o.key}-creak-${i}`, dur + 0.4, t, (s, out) => timberGroan(s, out, 0, dur, o.creakVel ?? 0.5, { pitch: p }));
  }
}
