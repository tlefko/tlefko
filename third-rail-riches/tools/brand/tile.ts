/**
 * Stake game-tile assets for Powder Keg Cove, composed from the game's own vector art.
 *   PowderKegCove-BG.jpg        moonlit cove from the ship's deck (no wording)
 *   PowderKegCove-FG.png        Cap'n Kaboom raising his lit linstock in front of a powder blast,
 *                               Sparks squawking on a keg (transparent)
 *   PowderKegCove-FG-16x9.png   the same cast for the 16:9 cover (TILE=wide)
 *   PowderKegCove-FG-focus.png  the captain and one lit keg only (TILE=focus)
 *   tile-preview*.png           BG + FG + the title lockup, at full size and at a real tile size
 *                               (review only; the title is the game's own hand-built lettering)
 *   stake/                      the same BG/FG pairs under the names the Stake tile editor gets
 * Usage: npx tsx tools/brand/tile.ts   (TILE=wide | TILE=focus for the variants;
 *        TILE_OUT=<dir> writes everything there instead of ../_brand, for a review run)
 */
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { C, scallops } from '../../src/art/kit';
import { captainHead } from '../../src/art/captain';
import { captainTorso, pirateBoot, linstock, LINSTOCK_GRIP, LINSTOCK_TIP, parrotBody, parrotWing, parrotTail } from '../../src/art/crew';
import { parrotHead } from '../../src/art/critters';
import { glove, flame } from '../../src/art/characters';
import { powderKeg, treasureChestOpen } from '../../src/art/keg';
import { skyBackdrop, moonDisc, headland, HEADLAND_LIGHT, lighthouse, distantShip, seaRow, bulwarkTile, deckTile, lantern, barrel, cannon, cannonballs, ropeCoil, treasurePile, jollyRoger } from '../../src/art/scene';
import { logoSvg, LOGO_BOX } from '../../src/art/lettering';

const WIDE = process.env.TILE === 'wide';
const FOCUS = process.env.TILE === 'focus';
const W = WIDE ? 1920 : 1200;
const H = WIDE ? 1080 : 1600;
const out = resolve(process.env.TILE_OUT ?? '/Users/tlefko/Desktop/Files/Projects/_brand/powder-keg-cove');
mkdirSync(out, { recursive: true });
const NAME = 'PowderKegCove';

type Pt = { x: number; y: number };

/** Place an SVG string: its box is `w` x `h` (default square), anchored at (ax, ay) of that box. */
function place(svg: string, x: number, y: number, w: number, o: { deg?: number; flip?: boolean; ax?: number; ay?: number; h?: number } = {}): string {
  const h = o.h ?? w;
  const ax = o.ax ?? 0.5;
  const ay = o.ay ?? 0.5;
  const open = svg.match(/<svg[^>]*>/)![0];
  const fixed = open.replace(/ width="[\d.]+"/, '').replace(/ height="[\d.]+"/, '').replace('<svg ', `<svg x="${-ax * w}" y="${-ay * h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" overflow="visible" `);
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${o.deg ?? 0})${o.flip ? ' scale(-1 1)' : ''}">${svg.replace(open, fixed)}</g>`;
}

/* ---------------------------------------------------------------- captain */
/** Cap'n Kaboom in his cheer pose: linstock raised high, left fist on his hip. Rig units (520 tall). */
function captain(X0: number, baseY: number, k: number): { svg: string; tip: Pt } {
  const P = (x: number, y: number): Pt => ({ x: X0 + x * k, y: baseY + y * k });
  const neck = { x: 0, y: -262 };
  const shL = { x: -62, y: neck.y + 40 };
  const shR = { x: 62, y: neck.y + 40 };
  const hipL = { x: -108, y: -138 };
  const hr = { x: 132, y: shR.y - 118 };
  const hose = (a: Pt, b: Pt, bend: number, w: number, fill: string, hi: string) => {
    const A = P(a.x, a.y);
    const B = P(b.x, b.y);
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (-dy / len) * bend * k;
    const cy = my + (dx / len) * bend * k;
    const d = `M${A.x.toFixed(1)} ${A.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${B.x.toFixed(1)} ${B.y.toFixed(1)}`;
    return `<path d="${d}" stroke="${C.ink}" stroke-width="${(w + 8) * k}" fill="none" stroke-linecap="round"/>
      <path d="${d}" stroke="${fill}" stroke-width="${w * k}" fill="none" stroke-linecap="round"/>
      <path d="${d}" transform="translate(${-3 * k} ${-3 * k})" stroke="${hi}" stroke-opacity=".6" stroke-width="${w * 0.24 * k}" fill="none" stroke-linecap="round"/>`;
  };
  // peg leg from the rolled trouser cuff to the deck
  const knee = P(38, -92);
  const foot = P(40, 0);
  const peg = `<path d="M${knee.x - 13 * k} ${knee.y} L${foot.x - 8 * k} ${foot.y} L${foot.x + 8 * k} ${foot.y} L${knee.x + 13 * k} ${knee.y} Z" fill="${C.wood}" stroke="${C.ink}" stroke-width="${6 * k}" stroke-linejoin="round"/>
    <rect x="${foot.x - 11 * k}" y="${foot.y - 12 * k}" width="${22 * k}" height="${13 * k}" rx="${5 * k}" fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="${5 * k}"/>
    <rect x="${knee.x - 17 * k}" y="${knee.y + 8 * k}" width="${34 * k}" height="${11 * k}" rx="${4 * k}" fill="${C.gold}" stroke="${C.ink}" stroke-width="${5 * k}"/>
    <ellipse cx="${knee.x}" cy="${knee.y + 2 * k}" rx="${22 * k}" ry="${12 * k}" fill="${C.navy}" stroke="${C.ink}" stroke-width="${6 * k}"/>`;
  // linstock in the raised right fist
  const pr = 0.42;
  const grip = { x: hr.x + 2 * Math.cos(pr) + 58 * Math.sin(pr), y: hr.y + 2 * Math.sin(pr) - 58 * Math.cos(pr) };
  const G = P(grip.x, grip.y);
  const reach = (LINSTOCK_GRIP - LINSTOCK_TIP) * (230 / 256);
  const tip = { x: G.x + Math.sin(pr) * reach * k, y: G.y - Math.cos(pr) * reach * k };
  const B = P(-42, 0);
  const T = P(neck.x, neck.y + 4);
  const Hd = P(neck.x, neck.y + 8);
  const svg = `
    ${hose({ x: -32, y: -112 }, { x: -42, y: -64 }, -6, 28, C.navy, C.navyLight)}
    ${hose({ x: 32, y: -112 }, { x: 38, y: -92 }, 5, 28, C.navy, C.navyLight)}
    ${peg}
    ${place(pirateBoot(), B.x, B.y, 110 * k, { ay: 0.8, flip: true })}
    ${place(captainTorso(), T.x, T.y, 236 * k, { ay: 0.14 })}
    ${hose(shL, { x: hipL.x, y: hipL.y }, 34, 22, C.crimson, C.crimsonLight)}
    ${hose(shR, { x: hr.x, y: hr.y + 6 }, 18, 22, C.crimson, C.crimsonLight)}
    ${place(linstock(), G.x, G.y, 230 * k, { ay: LINSTOCK_GRIP / 256, deg: (pr * 180) / Math.PI })}
    ${place(glove('fist'), P(hr.x, hr.y).x, P(hr.x, hr.y).y, 96 * k, { ay: 0.86, deg: 14 })}
    ${place(captainHead('laugh'), Hd.x, Hd.y, 300 * k, { ay: 0.8, deg: -4 })}
    ${place(glove('fist'), P(hipL.x, hipL.y).x, P(hipL.x, hipL.y).y, 96 * k, { ay: 0.86, deg: 115, flip: true })}
    ${place(flame('fire'), tip.x, tip.y + 4 * k, 86 * k, { ay: 0.92, deg: -10 })}`;
  return { svg, tip };
}

/* ----------------------------------------------------------------- parrot */
/** Sparks squawking with his wings up, feet on (x, y). Rig units (360 tall). */
function parrot(x: number, y: number, k: number): string {
  const neckY = y - ((220 - 50) / 256) * 150 * k;
  const sh = { x: 27 * k, y: neckY + 34 * k };
  return `
    ${place(parrotTail(), x + 10 * k, y - 26 * k, 136 * k, { ay: 24 / 256, deg: -12 })}
    ${place(parrotBody(), x, y, 150 * k, { ay: 220 / 256 })}
    ${place(parrotWing(), x - sh.x, sh.y, 100 * k, { ax: 64 / 256, ay: 40 / 256, flip: true, deg: 138 })}
    ${place(parrotWing(), x + sh.x, sh.y, 100 * k, { ax: 64 / 256, ay: 40 / 256, deg: -138 })}
    ${place(parrotHead('squawk', false), x, neckY + 8 * k, 196 * k, { ay: 0.8, deg: -14 })}`;
}

/* ------------------------------------------------------------------ blast */
/** Big cartoon powder blast: layered spike bursts, a ring of smoke puffs and flying debris. */
function blast(cx: number, cy: number, r: number): string {
  const spikes = (n: number, r0: number, r1: number, rot: number) => {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
      const a = ((i / (n * 2)) * 360 + rot) * (Math.PI / 180);
      const rr = i % 2 ? r0 : r1 * (0.86 + ((i * 37) % 11) / 55);
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `;
    }
    return d + 'Z';
  };
  // smoke: one scalloped cloud mass around the fireball (a single outline, like a cel), then
  // a lighter inner cloud for volume
  const cloud = (rr: number, n: number, bulge: number, seed: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 + seed;
      const wob = 1 + 0.09 * Math.sin(i * 2.7 + seed * 5) + 0.05 * Math.cos(i * 5.3);
      pts.push([cx + Math.cos(a) * rr * wob, cy + Math.sin(a) * rr * wob * 0.9]);
    }
    return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}${scallops(pts, bulge, 1)} Z`;
  };
  const debris = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 + 0.5;
    const rr = r * (1.12 + (i % 3) * 0.08);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    return i % 2
      ? `<rect x="${(x - 34).toFixed(1)}" y="${(y - 10).toFixed(1)}" width="68" height="20" rx="5" fill="${C.wood}" stroke="${C.ink}" stroke-width="6" transform="rotate(${(a * 180) / Math.PI + 30} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
      : `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="22" ry="14" fill="${C.gold}" stroke="${C.ink}" stroke-width="5" transform="rotate(${(a * 180) / Math.PI} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r * 1.35}" fill="url(#bGlow)"/>
    <path d="${cloud(r * 1.0, 15, 0.42, 0.3)}" fill="url(#smoke)" stroke="${C.ink}" stroke-width="12" stroke-linejoin="round"/>
    <path d="${cloud(r * 0.86, 13, 0.4, 0.9)}" fill="${C.paper}" opacity=".55"/>
    <path d="${spikes(12, r * 0.62, r * 1.02, 4)}" fill="url(#bDeep)" stroke="${C.ink}" stroke-width="12" stroke-linejoin="round"/>
    <path d="${spikes(12, r * 0.5, r * 0.8, 18)}" fill="url(#bMid)"/>
    <path d="${spikes(10, r * 0.36, r * 0.56, 2)}" fill="url(#bCore)"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.26}" fill="${C.fireCore}"/>
    ${debris}`;
}

const fgDefs = `<defs>
  <radialGradient id="bGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".75"/><stop offset=".55" stop-color="${C.fire}" stop-opacity=".25"/><stop offset="1" stop-color="${C.fireDeep}" stop-opacity="0"/></radialGradient>
  <radialGradient id="bDeep" cx="50%" cy="50%" r="50%"><stop offset=".3" stop-color="${C.fire}"/><stop offset="1" stop-color="${C.fireDeep}"/></radialGradient>
  <radialGradient id="bMid" cx="50%" cy="50%" r="50%"><stop offset=".2" stop-color="${C.fireHot}"/><stop offset="1" stop-color="${C.fire}"/></radialGradient>
  <radialGradient id="bCore" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.fireCore}"/><stop offset="1" stop-color="${C.fireHot}"/></radialGradient>
  <radialGradient id="smoke" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="${C.white}"/><stop offset=".6" stop-color="${C.paperWarm}"/><stop offset="1" stop-color="${C.g2}"/></radialGradient>
  <radialGradient id="kGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".8"/><stop offset="1" stop-color="${C.fire}" stop-opacity="0"/></radialGradient>
</defs>`;

function sparkles(pts: [number, number, number][]): string {
  return pts
    .map(([x, y, r]) => `<path d="M${x} ${y - r} Q${x + r * 0.16} ${y - r * 0.16} ${x + r} ${y} Q${x + r * 0.16} ${y + r * 0.16} ${x} ${y + r} Q${x - r * 0.16} ${y + r * 0.16} ${x - r} ${y} Q${x - r * 0.16} ${y - r * 0.16} ${x} ${y - r} Z" fill="${C.fireCore}"/>`)
    .join('');
}

function foreground(): string {
  if (WIDE) {
    const k = 1.55;
    const cap = captain(620, H - 34, k);
    return `${fgDefs}
      ${blast(900, 470, 400)}
      <circle cx="1480" cy="760" r="230" fill="url(#kGlow)"/>
      ${place(powderKeg(true), 1480, 800, 330)}
      ${place(powderKeg(false), 1250, 960, 240, { deg: -8 })}
      ${place(treasureChestOpen(), 1720, 930, 300, { deg: 6 })}
      ${parrot(1480, 690, 1.5)}
      ${cap.svg}
      ${sparkles([[cap.tip.x + 60, cap.tip.y - 30, 26], [cap.tip.x - 70, cap.tip.y + 20, 18], [cap.tip.x + 20, cap.tip.y - 90, 16], [1600, 560, 20], [1340, 640, 14]])}`;
  }
  if (FOCUS) {
    const k = 2.35;
    const cap = captain(560, H - 44, k);
    return `${fgDefs}
      <circle cx="930" cy="1340" r="260" fill="url(#kGlow)"/>
      ${place(powderKeg(true), 930, 1380, 380, { deg: 6 })}
      ${cap.svg}
      ${sparkles([[cap.tip.x + 70, cap.tip.y - 40, 30], [cap.tip.x - 80, cap.tip.y + 20, 22], [cap.tip.x + 20, cap.tip.y - 110, 18]])}`;
  }
  const k = 2.2;
  const cap = captain(470, H - 44, k);
  return `${fgDefs}
    ${blast(560, 640, 440)}
    <circle cx="1010" cy="1340" r="240" fill="url(#kGlow)"/>
    ${place(powderKeg(false), 190, 1470, 250, { deg: -10 })}
    ${place(powderKeg(true), 1000, 1420, 330, { deg: 5 })}
    ${parrot(1000, 1300, 1.55)}
    ${cap.svg}
    ${sparkles([[cap.tip.x + 70, cap.tip.y - 40, 30], [cap.tip.x - 80, cap.tip.y + 20, 22], [cap.tip.x + 20, cap.tip.y - 110, 18], [1120, 1060, 22], [880, 1120, 16]])}`;
}

/* ------------------------------------------------------------- background */
/** Jolly Roger on a gilded staff that stands on the bulwark. */
function flagStaff(x: number, top: number, railY: number): string {
  const fw = 250;
  return `<rect x="${x - 9}" y="${top}" width="18" height="${railY - top + 20}" rx="6" fill="${C.woodMid}" stroke="${C.ink}" stroke-width="5"/>
    <rect x="${x - 4}" y="${top + 10}" width="5" height="${railY - top}" fill="${C.woodLight}" opacity=".5"/>
    <circle cx="${x}" cy="${top - 6}" r="15" fill="${C.gold}" stroke="${C.ink}" stroke-width="5"/>
    ${place(jollyRoger(), x + 8, top + 12, fw, { ax: 0, ay: 0.12, deg: 2 })}`;
}
/** Ship lantern standing on the rail cap: glass globe, a live flame, iron cap, warm glow. */
function railLantern(x: number, footY: number): string {
  const w = 110;
  const h = w * (224 / 128);
  const top = footY - h;
  return `<circle cx="${x}" cy="${top + h * 0.62}" r="${w * 1.3}" fill="url(#lg)"/>
    ${place(lantern('back'), x, top, w, { h, ay: 0 })}
    ${place(flame('fire'), x, top + h * (160 / 224), w * (74 / 128), { ay: 0.94 })}
    ${place(lantern('front'), x, top, w, { h, ay: 0 })}`;
}

function background(): string {
  const horizon = Math.round(H * (WIDE ? 0.6 : 0.58));
  const moon = WIDE ? { x: 1520, y: 250, r: 150 } : { x: 860, y: 330, r: 170 };
  const sky = skyBackdrop({ w: W, h: horizon + 40, horizon, moon, calm: [], u: WIDE ? 1.5 : 1.7, clouds: [{ x: W * 0.18, y: horizon * 0.5, w: W * 0.45 }, { x: W * 0.72, y: horizon * 0.7, w: W * 0.4 }], seed: 7 });
  const rows = [0, 0.35, 0.7, 1]
    .map((tone, i) => {
      const th = 120 * (1 + i * 0.25);
      const tw = 480 * (1 + i * 0.25);
      const y = horizon - 30 + i * th * 0.55;
      return `<pattern id="sea${i}" width="${tw}" height="${th}" patternUnits="userSpaceOnUse" x="${-i * 90}" y="${y}">${place(seaRow(tone, i), tw / 2, th / 2, tw, { h: th })}</pattern><rect y="${y}" width="${W}" height="${th}" fill="url(#sea${i})"/>`;
    })
    .join('');
  const railY = Math.round(H * (WIDE ? 0.74 : 0.72));
  const deckY = Math.round(H * (WIDE ? 0.9 : 0.86));
  const bw = WIDE ? 300 : 280;
  const bulwark = `<pattern id="bw" width="${bw}" height="${deckY - railY}" patternUnits="userSpaceOnUse" y="${railY}">${place(bulwarkTile(), bw / 2, (deckY - railY) / 2, bw, { h: deckY - railY })}</pattern>`;
  const deck = `<pattern id="dk" width="400" height="${H - deckY}" patternUnits="userSpaceOnUse" y="${deckY}">${place(deckTile(), 200, (H - deckY) / 2, 400, { h: H - deckY })}</pattern>`;
  const hr = WIDE ? { x: W - 560, w: 800 } : { x: W - 480, w: 700 };
  const hh = hr.w * (360 / 800);
  const lh = { x: hr.x - hr.w / 2 + (HEADLAND_LIGHT.x / 800) * hr.w, y: horizon - hh + (HEADLAND_LIGHT.y / 360) * hh };
  return `
  <defs>
    ${bulwark}${deck}
    <radialGradient id="warm" cx="45%" cy="62%" r="55%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".35"/><stop offset=".5" stop-color="${C.fire}" stop-opacity=".12"/><stop offset="1" stop-color="${C.fire}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vig" cx="50%" cy="50%" r="75%"><stop offset=".66" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
    <radialGradient id="mw" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.moonGlow}" stop-opacity=".42"/><stop offset=".5" stop-color="${C.moonGlow}" stop-opacity=".14"/><stop offset="1" stop-color="${C.moonGlow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="lg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".55"/><stop offset="1" stop-color="${C.fireHot}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${C.skyTop}"/>
  ${place(sky, W / 2, (horizon + 40) / 2, W, { h: horizon + 40 })}
  <circle cx="${moon.x}" cy="${moon.y}" r="${moon.r * 4.2}" fill="url(#mw)"/>
  ${place(moonDisc(), moon.x, moon.y, (moon.r / 112) * 256)}
  ${place(headland('left'), (WIDE ? 420 : 300), horizon - (WIDE ? 170 : 140), WIDE ? 760 : 620, { h: (WIDE ? 760 : 620) * 0.45, ay: 0.5 })}
  ${place(headland('right'), hr.x, horizon - hh / 2, hr.w, { h: hh })}
  ${place(lighthouse(), lh.x, lh.y, 110, { h: 275, ay: 1 })}
  ${place(distantShip(), WIDE ? 760 : 420, horizon - 26, WIDE ? 240 : 200, { h: (WIDE ? 240 : 200) * 0.6, ay: 0.9 })}
  ${rows}
  <rect y="${railY}" width="${W}" height="${deckY - railY}" fill="url(#bw)"/>
  <rect y="${deckY}" width="${W}" height="${H - deckY}" fill="url(#dk)"/>
  <rect width="${W}" height="${H}" fill="url(#warm)"/>
  ${flagStaff(WIDE ? 90 : 70, WIDE ? 120 : 150, railY)}
  ${railLantern(WIDE ? 250 : 200, railY + 14)}${WIDE ? railLantern(W - 250, railY + 14) : ''}
  ${place(barrel(), WIDE ? 120 : 110, deckY + 40, 240)}
  ${place(cannon(), WIDE ? 1760 : 1060, deckY + 30, 300, { flip: true })}
  ${place(cannonballs(), WIDE ? 1560 : 880, deckY + 90, 160)}
  ${place(ropeCoil(), WIDE ? 420 : 330, deckY + 110, 220)}
  ${place(treasurePile(), W / 2, deckY + 120, WIDE ? 300 : 260)}
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`;
}

const svgDoc = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;
const fgSvg = svgDoc(foreground());
const bgSvg = svgDoc(background());
const tag = WIDE ? '-16x9' : FOCUS ? '-focus' : '';
writeFileSync(`${out}/fg${tag}.svg`, fgSvg);
writeFileSync(`${out}/bg${WIDE ? '-16x9' : ''}.svg`, bgSvg);

const b64 = (f: string) => readFileSync(f).toString('base64');
// review-only title: the game's own lettering (src/art/lettering.ts), where Stake letters the tile
const titleW = WIDE ? 860 : 1040;
const titleH = titleW * (LOGO_BOX.h / LOGO_BOX.w);
const title = `<div style="position:absolute;left:${(W - titleW) / 2}px;top:${H - titleH - (WIDE ? 10 : 30)}px;width:${titleW}px;height:${titleH}px">${logoSvg({ width: titleW, tagline: true })}</div>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const shoot = async (html: string, path: string, opts: { omitBackground?: boolean; type?: 'png' | 'jpeg'; quality?: number } = {}) => {
  await page.setContent(`<html><head><style>html,body{margin:0;background:transparent}body>svg,body>div.fg{position:absolute;left:0;top:0}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path, omitBackground: opts.omitBackground, type: opts.type ?? 'png', quality: opts.quality, clip: { x: 0, y: 0, width: W, height: H } });
};
const fgPath = `${out}/${NAME}-FG${tag}.png`;
const bgPath = `${out}/${NAME}-BG${WIDE ? '-16x9' : ''}.jpg`;
await shoot(fgSvg, fgPath, { omitBackground: true });
if (!FOCUS) {
  await shoot(bgSvg, bgPath, { type: 'jpeg', quality: 88 });
  const prev = `${out}/tile-preview${tag}.png`;
  await shoot(`${bgSvg}<div class="fg">${fgSvg}</div>${title}`, prev);
  if (!WIDE) {
    await page.setViewportSize({ width: 300, height: 400 });
    await page.setContent(`<html><body style="margin:0;background:#0f1923"><img src="data:image/png;base64,${b64(prev)}" style="width:300px;height:400px;border-radius:12px"></body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/tile-preview-small.png` });
  }
}
await browser.close();
// Stake-ready names for the tile editor (studio.engine.io > game > Media): BG + FG per ratio
mkdirSync(`${out}/stake`, { recursive: true });
if (!FOCUS) {
  const ratio = WIDE ? '16x9' : '3x4';
  writeFileSync(`${out}/stake/${NAME}-BG-${ratio}.jpg`, readFileSync(bgPath));
  writeFileSync(`${out}/stake/${NAME}-FG-${ratio}.png`, readFileSync(fgPath));
}
const sz = (f: string) => (statSync(f).size / 1e6).toFixed(2);
console.log(out, `FG${tag} ${sz(fgPath)}MB`, FOCUS ? '' : `BG ${sz(bgPath)}MB`);
