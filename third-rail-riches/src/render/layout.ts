/**
 * Responsive stage layout. Everything is derived from one cell size S so the whole scene scales as
 * a unit. Three compositions:
 * - landscape (desktop, tablets sideways): logo, captain and Sparks in the side zones, win bar and
 *   fuse stacked over the reels;
 * - compact landscape (phones sideways, the Stake mini-player, H < 480): the win bar moves into the
 *   right side zone (logo left, win bar right), so the reels get the height it took;
 * - portrait (phones, tablets): logo, win bar, fuse, reels, then the crew on the lower deck. The
 *   reels take the full width (or all the height the stack allows); the space left over goes to
 *   the crew first (standing right under the reels, the captain throws bombs onto them), then to
 *   the logo, and only then to breathing room.
 */
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
  S: number; // cell size (CSS px)
  gx: number; // gap between columns
  grid: Rect; // symbol area (6 cols x 4 rows)
  frame: Rect; // crib frame outer rect
  frameT: number; // frame thickness
  winBar: Rect;
  meter: Rect; // Tantrum meter (10 flames) between win bar and crib
  logo: Rect;
  captain: { x: number; y: number; h: number; flip: boolean }; // feet position
  parrot: { x: number; y: number; h: number; flip: boolean };
  floorY: number;
  hudH: number;
  /** Short landscape: the win bar sits in the right side zone instead of over the reels. */
  compact: boolean;
  /** The band the crew stand in: from the top of the taller character to the deck line (full width). */
  deck: Rect;
}

export const COLS = 6;
export const ROWS = 4;

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

const colGap = 0.07;
/** Smallest win bar height (CSS px) in any layout. */
const WIN_MIN = 22;
const frameK = 0.2;
const gridWk = COLS + (COLS - 1) * colGap; // in S units
const floor2 = (v: number) => Math.floor(v * 100) / 100;

export function computeLayout(W: number, H: number): Layout {
  // replay, short landscape: the scene in the part left of the results column (its W is that part's), no bar under it
  const col = replayColumn(W, H);
  if (col) return compactLayout(W - col, H, 0) || landscapeLayout(W - col, H, 0);
  if (W / H < 1.1) return portraitLayout(W, H);
  return (H < 480 && compactLayout(W, H)) || landscapeLayout(W, H);
}

/** Grid, frame and derived sizes for a cell size and the grid's top-left. */
function board(S: number, gx0: number, gy0: number) {
  const gridW = S * gridWk;
  const gridH = S * ROWS;
  const frameT = S * frameK;
  return {
    gx: S * colGap,
    frameT,
    grid: { x: gx0, y: gy0, w: gridW, h: gridH },
    frame: { x: gx0 - frameT, y: gy0 - frameT, w: gridW + frameT * 2, h: gridH + frameT * 2 },
  };
}

/**
 * Captain and parrot heights (their nominal 520 / 360 units in px) whose motion envelopes fit a side
 * zone `zone` wide, with `capRoom` / `parRoom` px of headroom above the deck line (landscape).
 */
function sideCrew(S: number, zone: number, capRoom: number, parRoom: number) {
  const C = CAPTAIN_EXTENT;
  const P = PARROT_EXTENT;
  const kC = Math.min((S * 3.9) / CAPTAIN_UNITS, (capRoom * 0.97) / C.h, zone / (C.l + C.r));
  const charH = kC * CAPTAIN_UNITS;
  const kP = Math.min((charH * 0.78) / PARROT_UNITS, (parRoom * 0.97) / P.h, zone / (P.l + P.r));
  return { charH, pupH: kP * PARROT_UNITS };
}

function landscapeLayout(W: number, H: number, hud?: number): Layout {
  const hudH = hud ?? hudHeight(W, H);
  const m = Math.max(10, H * 0.028);
  const availH = H - hudH - m * 2;
  const winK = 0.62;
  const meterK = 0.5;
  const side = W / H > 1.6 ? 2.45 : 1.6;
  const S_w = (W * 0.985) / (gridWk + frameK * 2 + side * 2);
  // the nameboard never drops under 22 px (its numerals stay readable in the mini-player)
  let S_h = availH / (ROWS + frameK * 2 + winK + meterK + 0.2);
  if (S_h * winK < WIN_MIN) S_h = (availH - WIN_MIN) / (ROWS + frameK * 2 + meterK + 0.2);
  const S = floor2(Math.min(S_h, S_w));
  const winH = Math.max(WIN_MIN, S * winK);
  const meterH = S * meterK;
  const stackH = winH + S * 0.06 + meterH + S * 0.08 + frameK * S * 2 + S * ROWS;
  const top = m + Math.max(0, (availH - stackH) / 2);
  const gridW = S * gridWk;
  const b = board(S, (W - gridW) / 2, top + winH + S * 0.06 + meterH + S * 0.08 + frameK * S);
  const winW = Math.min(gridW * 0.78, S * 5.2);
  const winBar = { x: (W - winW) / 2, y: top, w: winW, h: winH };
  const meterW = Math.min(gridW * 0.9, S * 5.6);
  const meter = { x: (W - meterW) / 2, y: top + winH + S * 0.06, w: meterW, h: meterH };
  const sideW = (W - b.frame.w) / 2;
  const floorY = H - hudH;
  const logoW = Math.min(sideW * 0.82, S * 2.9);
  const logo = { x: (sideW - logoW) / 2, y: m + S * 0.1, w: logoW, h: logoW * 0.62 };
  const room = floorY - S * 0.05 - (logo.y + logo.h);
  const { charH, pupH } = sideCrew(S, sideW * 0.97 - 4, room, room);
  return finish(W, H, hudH, S, b, winBar, meter, logo, floorY, charH, pupH, sideW, false);
}

/**
 * Phones sideways and the Stake mini-player: logo top-left, win bar top-right, fuse over the reels.
 * Needs side zones wide enough for a legible win bar; returns null otherwise (stacked landscape).
 */
function compactLayout(W: number, H: number, hud?: number): Layout | null {
  const hudH = hud ?? hudHeight(W, H);
  const m = Math.max(8, H * 0.026);
  const availH = H - hudH - m * 2;
  const meterK = 0.5;
  const S_h = availH / (ROWS + frameK * 2 + meterK + 0.08 + 0.06);
  const side = W / H > 1.6 ? 2.45 : 1.6;
  const S_w = (W * 0.985) / (gridWk + frameK * 2 + side * 2);
  const S = floor2(Math.min(S_h, S_w));
  const gridW = S * gridWk;
  const frameW = gridW + frameK * S * 2;
  const sideW = (W - frameW) / 2;
  if (sideW < Math.max(110, S * 3.2)) return null;
  const meterH = S * meterK;
  const stackH = meterH + S * 0.08 + frameK * S * 2 + S * ROWS;
  const top = m + Math.max(0, (availH - stackH) / 2);
  const b = board(S, (W - gridW) / 2, top + meterH + S * 0.08 + frameK * S);
  const meterW = Math.min(gridW * 0.9, S * 5.6);
  const meter = { x: (W - meterW) / 2, y: top, w: meterW, h: meterH };
  const floorY = H - hudH;
  const logoW = Math.min(sideW * 0.8, S * 3.1);
  const logo = { x: (sideW - logoW) / 2, y: m, w: logoW, h: logoW * 0.62 };
  // the nameboard keeps a readable window: at least 24 px tall, never longer than 7:1
  const winW = sideW * 0.86;
  const winH = Math.max(WIN_MIN + 2, S * 0.68, winW / 6.4);
  const winBar = { x: W - sideW + (sideW - winW) / 2, y: Math.max(m, logo.y + logo.h * 0.42 - winH / 2), w: winW, h: winH };
  const { charH, pupH } = sideCrew(S, sideW * 0.97 - 4, floorY - S * 0.05 - (logo.y + logo.h), floorY - S * 0.05 - (winBar.y + winBar.h + S * 0.1));
  return finish(W, H, hudH, S, b, winBar, meter, logo, floorY, charH, pupH, sideW, true);
}

function finish(
  W: number,
  H: number,
  hudH: number,
  S: number,
  b: ReturnType<typeof board>,
  winBar: Rect,
  meter: Rect,
  logo: Rect,
  floorY: number,
  charH: number,
  pupH: number,
  sideW: number,
  compact: boolean,
): Layout {
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
    gx: b.gx,
    grid: b.grid,
    frame: b.frame,
    frameT: b.frameT,
    winBar,
    meter,
    logo,
    // each envelope centred in its side zone (the parrot is mirrored, so its left reach faces the reels)
    captain: { x: sideW * 0.5 - ((C.r - C.l) / 2) * kL, y: floorY - S * 0.05, h: charH, flip: false },
    parrot: { x: W - sideW * 0.5 - ((P.r - P.l) / 2) * kP, y: floorY - S * 0.05, h: pupH, flip: true },
    floorY,
    hudH,
    compact,
    deck: { x: 0, y: deckTop, w: W, h: floorY - deckTop },
  };
}

/** Portrait sizes in S units: [min, max] for the parts that flex. */
const P_LOGO: [number, number] = [0.95, 1.7];
const P_WIN: [number, number] = [0.68, 0.78];
const P_METER = 0.5;
/**
 * The crew band: from the bottom row of symbols down to the deck line. It holds the frame's bottom
 * beam, which a raised glove may pass in front of (the crew stand in front of the hatch), but no
 * pose may reach the symbols.
 */
const P_BAND: [number, number] = [2.3, 4.1];
const P_BAND_TOP = 0.03; // margin between the symbols and the highest reach of any pose
/** Gaps: logo to bar, bar to fuse, fuse to frame. */
const P_GAPS = [0.1, 0.04, 0.08];

function portraitLayout(W: number, H: number): Layout {
  const hudH = hudHeight(W, H);
  const m = Math.max(8, H * 0.012);
  // the crew stand on the deck line just above the HUD, so no deck is left empty under their feet
  const floorY = H - hudH - Math.max(3, H * 0.004);
  const availH = floorY - m;
  const gapsK = P_GAPS.reduce((a, v) => a + v, 0);
  // everything but the logo, at minimum size: bar, fuse, gaps, top beam, symbols, crew band
  const restK = P_WIN[0] + P_METER + gapsK + frameK + ROWS + P_BAND[0];
  const S_w = (W * 0.965) / (gridWk + frameK * 2);
  // the title stays readable on small phones and keeps its presence on tablets
  const logoMin = Math.min(Math.max(W * 0.2, 94), 240) * 0.62;
  let S = Math.min(S_w, availH / (restK + P_LOGO[0]));
  if (P_LOGO[0] * S < logoMin) S = Math.min(S_w, (availH - logoMin) / restK);
  S = floor2(S);
  const logoMax = Math.max(logoMin, Math.min(P_LOGO[1] * S, W * 0.46 * 0.62));
  let logoH = Math.min(logoMax, Math.max(P_LOGO[0] * S, logoMin));
  let bandH = P_BAND[0] * S;
  let winH = P_WIN[0] * S;
  // share out what is left: the win bar to full height, then the crew band (60%) and the logo,
  // each taking the other's share once it is full; anything left becomes air above and under the logo
  let spare = Math.max(0, availH - (restK - P_BAND[0] - P_WIN[0]) * S - bandH - winH - logoH);
  const grow = (want: number, cap: number) => Math.max(0, Math.min(want, cap));
  const w1 = grow(spare, P_WIN[1] * S - winH);
  winH += w1;
  spare -= w1;
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
  const padMid = spare * 0.5;

  const gridW = S * gridWk;
  const logoW = logoH / 0.62;
  const logo = { x: (W - logoW) / 2, y: m + padTop, w: logoW, h: logoH };
  const winW = Math.min(gridW * 0.9, S * 5.4);
  const winBar = { x: (W - winW) / 2, y: logo.y + logoH + S * P_GAPS[0] + padMid, w: winW, h: winH };
  const meterH = S * P_METER;
  const meterW = Math.min(gridW * 0.96, S * 5.8);
  const meter = { x: (W - meterW) / 2, y: winBar.y + winH + S * P_GAPS[1], w: meterW, h: meterH };
  const b = board(S, (W - gridW) / 2, meter.y + meterH + S * P_GAPS[2] + frameK * S);
  // the crew's reach: from just under the symbols down to the deck line (3 px spare for antialiasing)
  const reach = floorY - (b.grid.y + b.grid.h) - S * P_BAND_TOP - 3;
  const C = CAPTAIN_EXTENT;
  const P = PARROT_EXTENT;
  // side by side under the reels, each envelope inside its part of the screen
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
    gx: b.gx,
    grid: b.grid,
    frame: b.frame,
    frameT: b.frameT,
    winBar,
    meter,
    logo,
    captain: { x: capX, y: floorY, h: capH, flip: false },
    parrot: { x: parX, y: floorY, h: parH, flip: true },
    floorY,
    hudH,
    compact: false,
    deck: { x: 0, y: deckTop, w: W, h: floorY - deckTop },
  };
}

/** Centre of a grid cell. */
export function cellCenter(L: Layout, reel: number, row: number) {
  return {
    x: L.grid.x + reel * (L.S + L.gx) + L.S / 2,
    y: L.grid.y + row * L.S + L.S / 2,
  };
}
