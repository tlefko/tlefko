/**
 * Responsive stage layout. Everything is derived from one size S (a station's footprint) so the whole
 * scene scales as a unit. The board is the subway map (src/math/network.ts): stations sit UNIT * S
 * apart, and the win display and the POWER meter live INSIDE the map, in the open space above and
 * below Grand Junction between the diagonal lines' terminals.
 * - landscape (desktop, tablets sideways, phones sideways, the Stake mini-player): logo top-left,
 *   Casey and Rivets in the side zones, the map in the middle;
 * - portrait (phones, tablets): logo, the map at full width, then the crew on the deck below.
 */
import { MAP_H, MAP_W, STATIONS } from '../math/network';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  W: number;
  H: number;
  portrait: boolean;
  S: number; // station footprint (CSS px)
  /** Distance between neighbouring stations (px). */
  unit: number;
  grid: Rect; // the map's station area (station centres are inset S / 2)
  frame: Rect; // the map panel's outer rect
  frameT: number; // panel border thickness
  winBar: Rect; // inside the map, top middle
  meter: Rect; // POWER meter, inside the map, bottom middle
  logo: Rect;
  captain: { x: number; y: number; h: number; flip: boolean }; // feet position
  parrot: { x: number; y: number; h: number; flip: boolean };
  floorY: number;
  hudH: number;
  compact: boolean;
  /** The band the crew stand in: from the top of the taller character to the deck line (full width). */
  deck: Rect;
}

/** Station spacing in S. */
export const UNIT = 1.3;
/** The map's station area in S units. */
export const BOARD_W = MAP_W * UNIT + 1;
export const BOARD_H = MAP_H * UNIT + 1;

/**
 * The rigs' nominal heights in design units: `L.captain.h` and `L.parrot.h` are these heights in px
 * (Captain.build(h) and Parrot.build(h) scale by h / 520 and h / 360).
 */
export const CAPTAIN_UNITS = 520;
export const PARROT_UNITS = 360;
/**
 * Motion envelopes in the same units, feet at the origin: how far any pose reaches up, left and
 * right, jumps included. Measured alpha-exact on track C's rigs (2026-09-29) through every reaction:
 * cheer 610-641 up with the jump, shock 206 left, dance 201 / 205, the parrot's happy hop 395 up,
 * plus a small margin. The throw and the lean that follows the bomb ('watch', ~300 units toward the
 * reels) may cross the frame's edge in landscape (the crew are drawn in front of the hatch); every
 * other pose stays inside these boxes, which the layout keeps clear of the symbols, the logo, the win
 * bar, the HUD and the screen edges. tools/qa/layout.mjs sweeps the reactions to check it. Track C:
 * keep new poses inside, and keep the feet planted (nothing below the deck line), or ask track P.
 */
export const CAPTAIN_EXTENT = { l: 212, r: 210, h: 645 };
export const PARROT_EXTENT = { l: 128, r: 124, h: 400 };

/**
 * Bet replay (Stake's Game Replay; read once, the URL never changes). Stake's review of the Popout S view
 * (Polar Siege, 2026-10-03): the reels must stay clearly readable, and the round's results, the REPLAY tag,
 * the mode and Play / Play again sit beside or below the board, never over it, the whole time. On short
 * landscape screens (the popouts, phones on their side) they take a column at the screen's right and the
 * scene is laid out in the part left of it, with no bar under it (computeLayout); elsewhere they fill the
 * bar under the board.
 */
export const REPLAY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('replay') === 'true';

/** Replay, short landscape: the results column's width at the screen's right, px (0: no column). */
export function replayColumn(W: number, H: number): number {
  if (!REPLAY || W / H < 1.1 || H >= 480) return 0;
  // the five results at 12.5 px, label and value on one line where they fit; more of the width on the shortest screens
  return Math.round(H < 210 ? W * 0.64 : Math.min(300, Math.max(168, W * 0.36)));
}

/**
 * The layout the scene was last laid out with (Scene.relayout). An overlay sized to the scene reads it back
 * (BigWin) instead of recomputing one from L.W x L.H, which in the replay column is the scene's part of the
 * screen, not the screen.
 */
export const sceneLayout: { L: Layout | null } = { L: null };

export function hudHeight(W: number, H: number): number {
  const portrait = W / H < 1.1;
  if (portrait) return W < 520 ? 148 : 164;
  if (H < 480) return replayColumn(W, H) ? 0 : 62;
  return H < 820 ? 80 : 88;
}

/** Panel border in S. */
const frameK = 0.34;
/** Smallest win display height (CSS px) in any layout. */
const WIN_MIN = 24;
const floor2 = (v: number) => Math.floor(v * 100) / 100;

export function computeLayout(W: number, H: number): Layout {
  // replay, short landscape: the scene in the part left of the results column (its W is that part's), no bar under it
  const col = replayColumn(W, H);
  if (col) return landscapeLayout(W - col, H, 0);
  if (W / H < 1.1) return portraitLayout(W, H);
  return landscapeLayout(W, H);
}

/** Map rects, the in-map win display and meter for a size and the station area's top-left. */
function board(S: number, gx0: number, gy0: number) {
  const gridW = S * BOARD_W;
  const gridH = S * BOARD_H;
  const frameT = S * frameK;
  const U = S * UNIT;
  const cx = gx0 + S / 2 + (MAP_W / 2) * U;
  // the open band between the two north terminals (x = 1 and x = 5): the win display
  const winW = Math.min(U * 2.75, gridW * 0.42);
  const winH = Math.max(WIN_MIN, S * 0.7);
  const winBar = { x: cx - winW / 2, y: gy0 + S / 2 - winH / 2 - U * 0.08, w: winW, h: winH };
  const meterW = U * 2.75;
  const meterH = S * 0.62;
  const meter = { x: cx - meterW / 2, y: gy0 + S / 2 + MAP_H * U - meterH / 2 + U * 0.08, w: meterW, h: meterH };
  return {
    unit: U,
    frameT,
    grid: { x: gx0, y: gy0, w: gridW, h: gridH },
    frame: { x: gx0 - frameT, y: gy0 - frameT, w: gridW + frameT * 2, h: gridH + frameT * 2 },
    winBar,
    meter,
  };
}

/**
 * Captain and parrot heights (their nominal 520 / 360 units in px) whose motion envelopes fit a side
 * zone `zone` wide, with `capRoom` / `parRoom` px of headroom above the deck line (landscape).
 */
function sideCrew(S: number, zone: number, capRoom: number, parRoom: number) {
  const C = CAPTAIN_EXTENT;
  const P = PARROT_EXTENT;
  const kC = Math.min((S * 4.2) / CAPTAIN_UNITS, (capRoom * 0.97) / C.h, zone / (C.l + C.r));
  const charH = kC * CAPTAIN_UNITS;
  const kP = Math.min((charH * 0.78) / PARROT_UNITS, (parRoom * 0.97) / P.h, zone / (P.l + P.r));
  return { charH, pupH: kP * PARROT_UNITS };
}

function landscapeLayout(W: number, H: number, hud?: number): Layout {
  const hudH = hud ?? hudHeight(W, H);
  const compact = H < 480;
  const m = Math.max(compact ? 6 : 10, H * 0.022);
  const availH = H - hudH - m * 2;
  const side = W / H > 1.7 ? 2.3 : W / H > 1.45 ? 2.0 : 1.5;
  const S_w = (W * 0.985) / (BOARD_W + frameK * 2 + side * 2);
  const S_h = availH / (BOARD_H + frameK * 2);
  const S = floor2(Math.min(S_h, S_w));
  const gridW = S * BOARD_W;
  const gridH = S * BOARD_H;
  const top = m + Math.max(0, (availH - gridH - frameK * S * 2) / 2);
  const b = board(S, (W - gridW) / 2, top + frameK * S);
  const sideW = (W - b.frame.w) / 2;
  const floorY = H - hudH;
  const logoW = Math.min(sideW * 0.86, S * 3.1);
  const logo = { x: (sideW - logoW) / 2, y: m + S * 0.05, w: logoW, h: logoW * 0.62 };
  const room = floorY - S * 0.05 - (logo.y + logo.h);
  const { charH, pupH } = sideCrew(S, sideW * 0.97 - 4, room, floorY - S * 0.05 - m);
  return finish(W, H, hudH, S, b, logo, floorY, charH, pupH, sideW, compact);
}

function finish(W: number, H: number, hudH: number, S: number, b: ReturnType<typeof board>, logo: Rect, floorY: number, charH: number, pupH: number, sideW: number, compact: boolean): Layout {
  const C = CAPTAIN_EXTENT;
  const P = PARROT_EXTENT;
  const kL = charH / CAPTAIN_UNITS;
  const kP = pupH / PARROT_UNITS;
  const deckTop = floorY - S * 0.05 - Math.max(C.h * kL, P.h * kP);
  return {
    W,
    H,
    portrait: false,
    S,
    unit: b.unit,
    grid: b.grid,
    frame: b.frame,
    frameT: b.frameT,
    winBar: b.winBar,
    meter: b.meter,
    logo,
    // each envelope centred in its side zone (the parrot is mirrored, so its left reach faces the board)
    captain: { x: sideW * 0.5 - ((C.r - C.l) / 2) * kL, y: floorY - S * 0.05, h: charH, flip: false },
    parrot: { x: W - sideW * 0.5 - ((P.r - P.l) / 2) * kP, y: floorY - S * 0.05, h: pupH, flip: true },
    floorY,
    hudH,
    compact,
    deck: { x: 0, y: deckTop, w: W, h: floorY - deckTop },
  };
}

/** Portrait sizes in S units: [min, max] for the parts that flex. */
const P_LOGO: [number, number] = [1.1, 2.1];
/** The crew band under the map: from the panel's bottom edge down to the deck line. */
const P_BAND: [number, number] = [2.4, 4.6];
/** Gap between the logo and the panel. */
const P_GAP = 0.12;

function portraitLayout(W: number, H: number): Layout {
  const hudH = hudHeight(W, H);
  const m = Math.max(8, H * 0.012);
  const floorY = H - hudH - Math.max(3, H * 0.004);
  const availH = floorY - m;
  const restK = P_GAP + frameK * 2 + BOARD_H + P_BAND[0];
  const S_w = (W * 0.975) / (BOARD_W + frameK * 2);
  const logoMin = Math.min(Math.max(W * 0.22, 100), 260) * 0.62;
  let S = Math.min(S_w, availH / (restK + P_LOGO[0]));
  if (P_LOGO[0] * S < logoMin) S = Math.min(S_w, (availH - logoMin) / restK);
  S = floor2(S);
  const logoMax = Math.max(logoMin, Math.min(P_LOGO[1] * S, W * 0.5 * 0.62));
  let logoH = Math.min(logoMax, Math.max(P_LOGO[0] * S, logoMin));
  let bandH = P_BAND[0] * S;
  let spare = Math.max(0, availH - (restK - P_BAND[0]) * S - bandH - logoH);
  const grow = (want: number, cap: number) => Math.max(0, Math.min(want, cap));
  const c1 = grow(spare * 0.6, P_BAND[1] * S - bandH);
  const l1 = grow(spare * 0.4, logoMax - logoH);
  bandH += c1;
  logoH += l1;
  spare -= c1 + l1;
  const c2 = grow(spare, P_BAND[1] * S - bandH);
  bandH += c2;
  spare -= c2;
  const l2 = grow(spare, logoMax - logoH);
  logoH += l2;
  spare -= l2;
  const padTop = spare * 0.5;
  const gridW = S * BOARD_W;
  const logoW = logoH / 0.62;
  const logo = { x: (W - logoW) / 2, y: m + padTop, w: logoW, h: logoH };
  const b = board(S, (W - gridW) / 2, logo.y + logoH + S * P_GAP + spare * 0.5 + frameK * S);
  // the crew's reach: from just under the panel down to the deck line
  const reach = floorY - (b.frame.y + b.frame.h) - 4;
  const C = CAPTAIN_EXTENT;
  const P = PARROT_EXTENT;
  const kC = Math.min(reach / C.h, (W * 0.46) / (C.l + C.r));
  const capH = kC * CAPTAIN_UNITS;
  const kP = Math.min((capH * 0.8) / PARROT_UNITS, reach / P.h, (W * 0.4) / (P.l + P.r));
  const parH = kP * PARROT_UNITS;
  const capX = Math.max(W * 0.2, C.l * kC + W * 0.025);
  const parX = Math.min(W * 0.8, W - P.r * kP - W * 0.025);
  const deckTop = floorY - Math.max(C.h * kC, P.h * kP);
  return {
    W,
    H,
    portrait: true,
    S,
    unit: b.unit,
    grid: b.grid,
    frame: b.frame,
    frameT: b.frameT,
    winBar: b.winBar,
    meter: b.meter,
    logo,
    captain: { x: capX, y: floorY, h: capH, flip: false },
    parrot: { x: parX, y: floorY, h: parH, flip: true },
    floorY,
    hudH,
    compact: false,
    deck: { x: 0, y: deckTop, w: W, h: floorY - deckTop },
  };
}

/** A map point (map units) in stage px. */
export function mapPoint(L: Layout, x: number, y: number) {
  return { x: L.grid.x + L.S / 2 + x * L.unit, y: L.grid.y + L.S / 2 + y * L.unit };
}

/** Centre of a station. */
export function stationCenter(L: Layout, id: number) {
  const s = STATIONS[id];
  return mapPoint(L, s.x, s.y);
}
