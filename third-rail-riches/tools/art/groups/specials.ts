/**
 * Specials review (npx tsx tools/art/sheet.ts specials 2): Live Wire, Golden Ticket, Fare Coins,
 * Locomotive, Junction (every state / tier / frame), on the default and the dark board bg, at
 * reel sizes; then the train pieces and the effect sprites.
 */
import { liveWire, liveWireFrames, liveWireIdleFrames, goldenTicket, goldenTicketWin, goldenTicketFrames, fareCoin, fareCoinShine, locoFront, junction, COIN_FACE, LOCO_LAMP, type CoinTier } from '../../../src/art/specials';

import { locoSide, carriage, wheelSprite, railBed, LOCO_SIDE, CARRIAGE_SIDE } from '../../../src/art/train';
import * as fx from '../../../src/art/fx';
import { C } from '../../../src/art/kit';

const DARK = '#151b1f';
const TIERS: CoinTier[] = ['bronze', 'silver', 'gold', 'platinum'];
const row = (svgs: string[], px: number, bg = DARK) =>
  `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${svgs.map((s) => `<div style="width:${px}px;height:${px}px;background:${bg}">${s.replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>`).join('')}</div>`;

/** Coin with the face circle marked and a sample value, to check the text fits. */
const coinWithValue = (tier: CoinTier) =>
  `<div style="position:relative">${fareCoin(tier)}<div style="position:absolute;left:${((COIN_FACE.cx - COIN_FACE.r) / 256) * 100}%;top:${((COIN_FACE.cy - COIN_FACE.r) / 256) * 100}%;width:${((COIN_FACE.r * 2) / 256) * 100}%;height:${((COIN_FACE.r * 2) / 256) * 100}%;border-radius:50%;outline:1px dashed rgba(255,0,255,.6);display:flex;align-items:center;justify-content:center;font:700 40px Georgia,serif;color:#fff;-webkit-text-stroke:2px #1b1311">25.00</div></div>`;

const lampMark = (svg: string) => `<div style="position:relative">${svg}<div style="position:absolute;left:${(LOCO_LAMP.x / 256) * 100}%;top:${(LOCO_LAMP.y / 256) * 100}%;width:8px;height:8px;margin:-4px;border-radius:50%;background:magenta"></div></div>`;

export default () => {
  const items: { label: string; svg: string; w?: number; bg?: string }[] = [];
  const sym = (label: string, svg: string) => {
    items.push({ label, svg });
  };
  sym('live wire', liveWire());
  sym('live wire lit', liveWire(true));
  sym('golden ticket', goldenTicket());
  sym('golden ticket win', goldenTicketWin());
  TIERS.forEach((t) => sym(`coin ${t}`, fareCoin(t)));
  TIERS.forEach((t) => sym(`coin ${t} shine`, fareCoinShine(t)));
  sym('loco', locoFront());
  sym('loco lit', locoFront(true));
  sym('loco golden', locoFront(false, true));
  sym('loco golden lit', locoFront(true, true));
  sym('junction', junction());
  sym('junction thrown', junction(true));
  items.push({ label: 'coin face fit (COIN_FACE) + LOCO_LAMP marker', w: 900, bg: DARK, svg: `<div style="display:flex;gap:8px">${TIERS.map((t) => `<div style="width:200px">${coinWithValue(t)}</div>`).join('')}<div style="width:200px">${lampMark(locoFront())}</div></div>` });
  items.push({ label: 'live wire lit frames / idle frames', w: 1300, bg: DARK, svg: row([...liveWireFrames, ...liveWireIdleFrames].map((f) => f()), 150) });
  items.push({ label: 'golden ticket win frames', w: 700, bg: DARK, svg: row(goldenTicketFrames.map((f) => f()), 150) });
  const all = () => [liveWire(), goldenTicket(), ...TIERS.map((t) => fareCoin(t)), locoFront(), junction(), liveWire(true), goldenTicketWin(), locoFront(true), locoFront(false, true), junction(true)];
  items.push({ label: 'on the dark board @128', w: 1450, bg: DARK, svg: row(all(), 128) });
  items.push({ label: '@90', w: 1300, bg: DARK, svg: row(all(), 90) });
  items.push({ label: '@90 on cream tile', w: 1300, bg: '#efe2c0', svg: row(all(), 90, '#efe2c0') });
  // train pieces at their native widths
  items.push({ label: 'locoSide', svg: locoSide(), w: 384, bg: DARK });
  items.push({ label: 'locoSide golden', svg: locoSide(true), w: 384, bg: DARK });
  items.push({ label: 'carriage 0', svg: carriage(0), w: 320, bg: DARK });
  items.push({ label: 'carriage 1', svg: carriage(1), w: 320, bg: DARK });
  items.push({ label: 'locoSide noWheels', svg: locoSide(false, true), w: 384, bg: DARK });
  items.push({ label: 'carriage noWheels', svg: carriage(0, true), w: 320, bg: DARK });
  items.push({ label: 'wheelSprite @64 / @128', svg: `<div style="display:flex;gap:8px;align-items:center"><div style="width:64px">${wheelSprite()}</div><div style="width:128px">${wheelSprite()}</div></div>`, w: 220, bg: DARK });
  items.push({ label: 'railBed x4 (tiling)', svg: `<div style="display:flex">${[0, 1, 2, 3].map(() => `<div style="width:256px">${railBed()}</div>`).join('')}</div>`, w: 1024, bg: DARK });
  // the composited train on its track: rail bed, wheels behind bodies drawn noWheels (as the game does)
  const U = 0.6;
  const piece = (x: number, w: number, svg: string, wheels: [number, number, number][]) =>
    `${wheels.map(([wx, wy, wr]) => `<div style="position:absolute;left:${(x + wx - wr * (32 / 29)) * U}px;top:${(wy - wr * (32 / 29)) * U}px;width:${wr * (64 / 29) * U}px">${wheelSprite()}</div>`).join('')}<div style="position:absolute;left:${x * U}px;top:0;width:${w * U}px">${svg}</div>`;
  const train = `<div style="position:relative;width:${1536 * U}px;height:${200 * U}px">
    <div style="position:absolute;left:0;top:${150 * U}px;display:flex">${[0, 1, 2, 3, 4, 5].map(() => `<div style="width:${256 * U}px">${railBed()}</div>`).join('')}</div>
    ${piece(20, 320, carriage(1, true), CARRIAGE_SIDE.wheels)}${piece(340, 320, carriage(0, true), CARRIAGE_SIDE.wheels)}${piece(660, 384, locoSide(false, true), LOCO_SIDE.wheels)}
    <div style="position:absolute;left:${(660 + LOCO_SIDE.lamp[0]) * U}px;top:${(LOCO_SIDE.lamp[1] - 64) * U}px;width:${512 * U}px;mix-blend-mode:screen">${fx.headlightBeam()}</div>
  </div>`;
  items.push({ label: 'composited train on a 6-cell row (wheels behind, beam at LOCO_SIDE.lamp)', svg: train, w: 1300, bg: DARK });
  // effects
  const fxRow = (svgs: [string, string, number][]) =>
    `<div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">${svgs.map(([n, s, w]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:${w}px">${s}</div><span style="font:10px sans-serif;color:#888">${n}</span></div>`).join('')}</div>`;
  items.push({
    label: 'fx sprites',
    w: 1400,
    bg: DARK,
    svg: fxRow([
      ['puff', fx.puff(), 96],
      ['smoke 0', fx.smoke(0), 96],
      ['smoke 1', fx.smoke(1), 96],
      ['twinkle', fx.twinkle(), 64],
      ['twinkle volt', fx.twinkle(C.volt), 64],
      ['ember', fx.ember(), 48],
      ['ember amber', fx.ember('#ffb43c'), 48],
      ['note', fx.note(), 64],
      ['spark', fx.spark(), 64],
      ['streak', fx.streak(), 96],
      ['shine', fx.shine(), 64],
      ['coinSpark', fx.coinSpark(), 64],
      ['chainMedal', fx.chainMedal(), 110],
      ['signal red', fx.signalLight('red'), 64],
      ['signal green', fx.signalLight('green'), 64],
      ['signal amber', fx.signalLight('amber'), 64],
    ]),
  });
  items.push({
    label: 'fx sprites (large)',
    w: 1400,
    bg: DARK,
    svg: fxRow([
      ['blastStar', fx.blastStar(), 200],
      ['shockRing', fx.shockRing(), 200],
      ['arc 1', fx.arc(1), 256],
      ['arc 2', fx.arc(2), 256],
      ['headlightBeam', fx.headlightBeam(), 400],
      ...[0, 1, 2, 3, 4, 5].map((v) => [`confetti ${v}`, fx.ticketConfetti(v), 40] as [string, string, number]),
    ]),
  });
  return items;
};
