/**
 * A tiny text notation for writing parts, validated bar by bar.
 *
 *   "A5:4 F5:8 D5:8 | [D4,F4,A4]:2 r:2 | Bb4:4.@0.6 C5:8' ..."
 *
 * token   := pitch[:dur][@vel][flags]  |  r[:dur]  |  '|'
 * pitch   := C4, F#3, Bb5 ... or a chord [D4,F4,A4]
 * dur     := 1 2 4 8 16 32 with optional '.', '..' or 't' (triplet); join with '+' to tie (2+8)
 * flags   := "'" staccato (half length), '>' accent, '!x' custom instrument flag letters
 * Durations carry over to the next token when omitted. Beat unit = quarter note.
 */
import { midi } from './notes';

export interface NoteEvent {
  beat: number; // start, in quarter-note beats from the part start
  dur: number; // length in beats (articulation already applied)
  notes: number[]; // MIDI numbers (empty never happens; rests are dropped)
  vel: number; // 0..1
  accent: boolean;
  flags: string;
}

export interface SeqOptions {
  beatsPerBar?: number;
  startBeat?: number;
  vel?: number;
  name?: string;
}

function parseDur(s: string): number {
  let total = 0;
  for (const part of s.split('+')) {
    const m = /^(1|2|4|8|16|32)(\.{0,2})(t?)$/.exec(part);
    if (!m) throw new Error(`bad duration "${s}"`);
    let d = 4 / parseInt(m[1], 10);
    if (m[2] === '.') d *= 1.5;
    if (m[2] === '..') d *= 1.75;
    if (m[3] === 't') d *= 2 / 3;
    total += d;
  }
  return total;
}

export function seq(src: string, opts: SeqOptions = {}): NoteEvent[] {
  const bpb = opts.beatsPerBar ?? 4;
  const start = opts.startBeat ?? 0;
  const baseVel = opts.vel ?? 0.8;
  const out: NoteEvent[] = [];
  let pos = 0;
  let lastDur = 1;
  let bar = 0;
  const tokens = src.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok === '|') {
      bar++;
      const expected = bar * bpb;
      if (Math.abs(pos - expected) > 1e-6) {
        throw new Error(
          `${opts.name ?? 'seq'}: bar ${bar} has ${(pos - (bar - 1) * bpb).toFixed(3)} beats, expected ${bpb}`,
        );
      }
      continue;
    }
    const m = /^(r|\[[^\]]+\]|[A-G][#b]{0,2}-?\d)(?::([0-9.t+]+))?(?:@([0-9.]+))?(.*)$/.exec(tok);
    if (!m) throw new Error(`${opts.name ?? 'seq'}: bad token "${tok}"`);
    const dur = m[2] ? parseDur(m[2]) : lastDur;
    lastDur = dur;
    const flagsRaw = m[4] ?? '';
    if (m[1] !== 'r') {
      const names = m[1].startsWith('[') ? m[1].slice(1, -1).split(',') : [m[1]];
      const staccato = flagsRaw.includes("'");
      const accent = flagsRaw.includes('>');
      const custom = (flagsRaw.match(/!([a-z]+)/g) ?? []).map((f) => f.slice(1)).join('');
      let vel = m[3] ? parseFloat(m[3]) : baseVel;
      if (accent) vel = Math.min(1, vel * 1.2);
      out.push({
        beat: start + pos,
        dur: staccato ? dur * 0.45 : dur,
        notes: names.map((n) => midi(n)),
        vel,
        accent,
        flags: custom,
      });
    }
    pos += dur;
  }
  return out;
}

/** Total length in beats of a notation string (ignores bar checks). */
export function seqLength(src: string): number {
  let pos = 0;
  let lastDur = 1;
  for (const tok of src.split(/\s+/).filter(Boolean)) {
    if (tok === '|') continue;
    const m = /:([0-9.t+]+)/.exec(tok);
    const d = m ? parseDur(m[1]) : lastDur;
    lastDur = d;
    pos += d;
  }
  return pos;
}

/**
 * Swing: warp the position inside each beat so the off-beat 8th lands at `ratio` (0.5 = straight,
 * 0.667 = triplet swing). Piecewise linear, so 16ths and durations warp consistently.
 */
export function swingBeat(beat: number, ratio: number): number {
  if (ratio === 0.5) return beat;
  const b = Math.floor(beat + 1e-9);
  const p = beat - b;
  const w = p <= 0.5 ? (p / 0.5) * ratio : ratio + ((p - 0.5) / 0.5) * (1 - ratio);
  return b + w;
}

export class Clock {
  constructor(
    public bpm: number,
    public beatsPerBar: number,
    public swing = 0.5,
  ) {}
  get spb(): number {
    return 60 / this.bpm;
  }
  /** Seconds of a (possibly fractional) beat position, swing applied. */
  t(beat: number): number {
    return swingBeat(beat, this.swing) * this.spb;
  }
  /** Seconds for bar (0-based) + beat within bar. */
  at(bar: number, beat = 0): number {
    return this.t(bar * this.beatsPerBar + beat);
  }
  /** Duration in seconds of a note starting at `beat` lasting `dur` beats (swing aware). */
  len(beat: number, dur: number): number {
    return this.t(beat + dur) - this.t(beat);
  }
  bars(n: number): number {
    return n * this.beatsPerBar * this.spb;
  }
}

/**
 * Clock for compound meters (6/8, 12/8) counted in quarter-note beats: every dotted-quarter group
 * of three eighths gets a jig "lilt" (the first eighth a touch long, the middle one short).
 * Group boundaries are untouched, so bar and loop lengths stay exact.
 */
export class CompoundClock extends Clock {
  constructor(
    bpm: number,
    beatsPerBar: number,
    public lilt = 0.03,
  ) {
    super(bpm, beatsPerBar, 0.5);
  }
  override t(beat: number): number {
    const g = beat / 1.5;
    const k = Math.floor(g + 1e-9);
    const p = g - k;
    const a = 1 / 3 + this.lilt;
    const b = 2 / 3 + this.lilt * 0.5;
    const w = p < 1 / 3 ? p * 3 * a : p < 2 / 3 ? a + (p - 1 / 3) * 3 * (b - a) : b + (p - 2 / 3) * 3 * (1 - b);
    return (k + w) * 1.5 * this.spb;
  }
}
