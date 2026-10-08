/**
 * The Third Rail Riches network: the board is a subway map, not a reel grid.
 *
 *            G0                 Y0
 *              \               /
 *   R0 -- R1 -- R2 -- R3 -- R4 -- R5 -- R6      Red line (Crimson)
 *                 \         /
 *                    \   /
 *                     C15                       Grand Junction (Green x Gold)
 *                    /   \
 *                 /         \
 *   B7 -- B8 -- B9 -- B10 - B11 - B12 - B13     Blue line (Cobalt)
 *              /               \
 *            Y4                 G4
 *
 * Four lines, 19 stations: 8 TERMINALS (line ends, where Locomotives land), 5 INTERCHANGES (where
 * two lines cross; Signals land here and redirect trains onto the crossing line) and 6 STOPS (plain
 * stations; Security Checks land here). Coordinates are map units (x 0..6, y 0..4), row-major.
 */

export type StationKind = 'terminal' | 'interchange' | 'stop';

export interface Station {
  x: number;
  y: number;
  kind: StationKind;
  /** Lines through this station (one, or two at an interchange). */
  lines: number[];
}

export interface Line {
  key: 'red' | 'blue' | 'green' | 'gold';
  /** Station ids in order, from the line's first terminal to its last. */
  stops: number[];
}

/** Station coordinates by id (map units). */
const XY: readonly [number, number][] = [
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], // 0-6   Red
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], // 7-13  Blue
  [1, 0], // 14 Green north terminal
  [3, 2], // 15 Grand Junction
  [5, 4], // 16 Green south terminal
  [5, 0], // 17 Gold north terminal
  [1, 4], // 18 Gold south terminal
];

export const LINES: readonly Line[] = [
  { key: 'red', stops: [0, 1, 2, 3, 4, 5, 6] },
  { key: 'blue', stops: [7, 8, 9, 10, 11, 12, 13] },
  { key: 'green', stops: [14, 2, 15, 11, 16] },
  { key: 'gold', stops: [17, 4, 15, 9, 18] },
];

export const STATION_COUNT = XY.length; // 19
export const MAP_W = 6;
export const MAP_H = 4;

export const STATIONS: readonly Station[] = XY.map(([x, y], id) => {
  const lines = LINES.map((l, i) => (l.stops.includes(id) ? i : -1)).filter((i) => i >= 0);
  const ends = LINES.some((l) => l.stops[0] === id || l.stops[l.stops.length - 1] === id);
  const kind: StationKind = ends ? 'terminal' : lines.length > 1 ? 'interchange' : 'stop';
  return { x, y, kind, lines };
});

export const TERMINALS: readonly number[] = STATIONS.map((s, i) => (s.kind === 'terminal' ? i : -1)).filter((i) => i >= 0);
export const INTERCHANGES: readonly number[] = STATIONS.map((s, i) => (s.kind === 'interchange' ? i : -1)).filter((i) => i >= 0);
export const STOPS: readonly number[] = STATIONS.map((s, i) => (s.kind === 'stop' ? i : -1)).filter((i) => i >= 0);
/** Stations a Golden Ticket can land on (everything but the terminals). */
export const TICKET_STATIONS: readonly number[] = STATIONS.map((s, i) => (s.kind !== 'terminal' ? i : -1)).filter((i) => i >= 0);

/** Neighbours of every station along any line. */
export const NEIGHBOURS: readonly (readonly number[])[] = STATIONS.map((_, id) => {
  const out = new Set<number>();
  for (const l of LINES) {
    const i = l.stops.indexOf(id);
    if (i < 0) continue;
    if (i > 0) out.add(l.stops[i - 1]);
    if (i < l.stops.length - 1) out.add(l.stops[i + 1]);
  }
  return [...out].sort((a, b) => a - b);
});

/** The line a terminal starts, and the direction a train leaving it runs (+1 along `stops`, -1 back). */
export function departure(terminal: number): { line: number; idx: number; dir: 1 | -1 } {
  for (let li = 0; li < LINES.length; li++) {
    const s = LINES[li].stops;
    if (s[0] === terminal) return { line: li, idx: 0, dir: 1 };
    if (s[s.length - 1] === terminal) return { line: li, idx: s.length - 1, dir: -1 };
  }
  throw new Error(`station ${terminal} is not a terminal`);
}
