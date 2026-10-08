/** Pitch helpers: note names, MIDI numbers, frequencies and chord symbols. */

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb2" / "E5" -> MIDI number (C4 = 60). */
export function midi(name: string): number {
  const m = /^([A-Ga-g])([#b]{0,2})(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name: ${name}`);
  let pc = PC[m[1].toUpperCase()];
  for (const ch of m[2]) pc += ch === '#' ? 1 : -1;
  return pc + (parseInt(m[3], 10) + 1) * 12;
}

export function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function hz(name: string | number): number {
  return typeof name === 'number' ? mtof(name) : mtof(midi(name));
}

/** Semitone ratio. */
export function semi(n: number): number {
  return Math.pow(2, n / 12);
}

const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mmaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '7sus4': [0, 5, 7, 10],
  'maj7#11': [0, 4, 7, 11, 18],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '7b9': [0, 4, 7, 10, 13],
  '7#5': [0, 4, 8, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '6/9': [0, 4, 7, 9, 14],
};

export interface Chord {
  root: number; // pitch class 0..11
  bass: number; // pitch class of the bass note
  intervals: number[]; // semitones above root
  symbol: string;
}

/** Parse "Dm", "A7b9", "Bb7", "Dm/C#", "Gm6", "Ebmaj7". */
export function chord(symbol: string): Chord {
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(symbol.trim());
  if (!m) throw new Error(`bad chord: ${symbol}`);
  let root = PC[m[1]];
  if (m[2] === '#') root += 1;
  if (m[2] === 'b') root -= 1;
  root = (root + 12) % 12;
  const q = m[3];
  const intervals = QUALITIES[q];
  if (!intervals) throw new Error(`unknown chord quality "${q}" in ${symbol}`);
  let bass = root;
  if (m[4]) {
    let b = PC[m[4][0]];
    if (m[4][1] === '#') b += 1;
    if (m[4][1] === 'b') b -= 1;
    bass = (b + 12) % 12;
  }
  return { root, bass, intervals, symbol };
}

/** Lowest MIDI note >= lo with the given pitch class. */
export function pcAtOrAbove(pc: number, lo: number): number {
  let n = lo;
  while (((n % 12) + 12) % 12 !== pc) n++;
  return n;
}

/** Chord tones (as pitch classes) in the chord's order. */
export function chordPcs(c: Chord): number[] {
  return c.intervals.map((i) => (c.root + i) % 12);
}

/**
 * Close voicing of `count` chord tones inside [lo, hi], choosing the inversion whose notes are
 * nearest to `prev` (simple voice leading). Tensions (>= 12) fold into the octave.
 */
const PRIORITY = [3, 4, 10, 11, 9, 6, 1, 13, 14, 15, 0, 7, 8, 5, 2];

/** Pick the most characteristic `count` chord tones (3rd, 7th, 6th, tensions before root/5th). */
export function chordTones(c: Chord, count: number): number[] {
  const ints = [...new Set(c.intervals)];
  if (ints.length <= count) {
    const pcs = ints.map((i) => (c.root + i) % 12);
    let k = 0;
    while (pcs.length < count) pcs.push(pcs[k++ % ints.length]);
    return pcs;
  }
  const chosen = [...ints].sort((a, b) => PRIORITY.indexOf(a % 24) - PRIORITY.indexOf(b % 24)).slice(0, count);
  return ints.filter((i) => chosen.includes(i)).map((i) => (c.root + i) % 12);
}

export function voice(c: Chord, lo: number, hi: number, count: number, prev?: number[]): number[] {
  const pcs = chordTones(c, Math.max(count, 1));
  const candidates: number[][] = [];
  for (let start = lo; start < lo + 12; start++) {
    for (let inv = 0; inv < pcs.length; inv++) {
      const order = pcs.slice(inv).concat(pcs.slice(0, inv));
      const notes: number[] = [];
      let cur = start - 1;
      for (const pc of order) {
        cur = pcAtOrAbove(pc, cur + 1);
        notes.push(cur);
      }
      if (notes[0] !== start) continue;
      if (notes[notes.length - 1] > hi) continue;
      candidates.push(notes);
    }
  }
  if (!candidates.length) {
    // fall back: stack upward from lo regardless of range
    const notes: number[] = [];
    let cur = lo - 1;
    for (const pc of pcs) {
      cur = pcAtOrAbove(pc, cur + 1);
      notes.push(cur);
    }
    return notes;
  }
  if (!prev || !prev.length) {
    const mid = (lo + hi) / 2;
    candidates.sort((a, b) => Math.abs(avg(a) - mid) - Math.abs(avg(b) - mid));
    return candidates[0];
  }
  const cost = (v: number[]) => {
    let s = 0;
    for (const n of v) {
      let best = 99;
      for (const p of prev) best = Math.min(best, Math.abs(n - p));
      s += best;
    }
    return s + Math.abs(avg(v) - avg(prev)) * 0.5;
  };
  candidates.sort((a, b) => cost(a) - cost(b));
  return candidates[0];
}

function avg(a: number[]): number {
  return a.reduce((x, y) => x + y, 0) / a.length;
}

/** Bass note (MIDI) of a chord in the given octave range starting at `lo`. */
export function bassNote(c: Chord, lo: number): number {
  return pcAtOrAbove(c.bass, lo);
}
