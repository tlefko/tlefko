/**
 * Environment review group: every Powder Keg Cove scenery piece on one contact sheet.
 * npx tsx tools/art/sheet.ts scene 2
 */
import {
  skyBackdrop,
  moonDisc,
  cloudWisp,
  sparkle,
  headland,
  lighthouse,
  lighthouseBeam,
  distantShip,
  seaRow,
  glint,
  fogTile,
  bulwarkTile,
  deckTile,
  mastTile,
  mastFoot,
  poleTile,
  poleCap,
  lanternBracket,
  lantern,
  LANTERN_WICK,
  sailCorner,
  jollyRoger,
  pennant,
  barrel,
  cannon,
  cannonballs,
  ropeCoil,
  treasurePile,
  hatchFrame,
  skullFinial,
  HATCH,
} from '../../../src/art/scene';
import { C } from '../../../src/art/kit';
import { flame } from '../../../src/art/characters';

const night = `linear-gradient(${C.skyTop},${C.night} 60%,${C.skyLow})`;
const sea = `linear-gradient(${C.seaDeep},${C.nightDeep})`;
const row = (svg: string, n: number) => `<div style="display:flex">${Array.from({ length: n }, () => `<div style="flex:1">${svg}</div>`).join('')}</div>`;
const col = (svg: string, n: number) => `<div style="display:flex;flex-direction:column;width:64px">${Array.from({ length: n }, () => svg).join('')}</div>`;

/** Lantern assembled the way the renderer layers it: glow, tinted interior, flame, cage. */
const lanternAssembled = (tint: string, fl: 'fire' | 'green') => `<div style="position:relative;width:128px;height:224px">
  <div style="position:absolute;left:-60px;top:20px;width:248px;height:248px;border-radius:50%;background:radial-gradient(${tint}66,transparent 65%)"></div>
  <div style="position:absolute;inset:0;opacity:.9;filter:drop-shadow(0 0 0 ${tint})">${lantern('back').replace('<svg ', `<svg style="filter:sepia(1) saturate(4) hue-rotate(${fl === 'fire' ? '-10deg' : '90deg'})" `)}</div>
  <div style="position:absolute;left:${128 * LANTERN_WICK.x - (128 * LANTERN_WICK.flameW) / 2}px;top:${224 * LANTERN_WICK.y - 128 * LANTERN_WICK.flameW * 0.95}px;width:${128 * LANTERN_WICK.flameW}px">${flame(fl)}</div>
  <div style="position:absolute;inset:0">${lantern('front')}</div></div>`;

export default () => [
  {
    label: 'sky backdrop (1200 x 520 sample)',
    w: 1200,
    bg: C.nightDeep,
    svg: skyBackdrop({
      w: 1200,
      h: 520,
      horizon: 500,
      moon: { x: 1010, y: 120, r: 62 },
      calm: [
        { x: 30, y: 30, w: 260, h: 160 },
        { x: 380, y: 24, w: 440, h: 130 },
      ],
      u: 1.1,
      clouds: [
        { x: 40, y: 450, w: 300 },
        { x: 880, y: 430, w: 260 },
      ],
    }),
  },
  { label: 'moon', svg: moonDisc(), bg: night },
  { label: 'moon (Moonlight Raid)', svg: moonDisc(true), bg: night },
  { label: 'cloud wisp', svg: cloudWisp(), w: 512, bg: night },
  { label: 'sparkle', svg: sparkle(), w: 96, bg: C.night },
  { label: 'headland left', svg: headland('left'), w: 600, bg: night },
  { label: 'headland right', svg: headland('right'), w: 600, bg: night },
  { label: 'lighthouse', svg: lighthouse(), w: 128, bg: night },
  { label: 'lighthouse beam', svg: lighthouseBeam(), w: 512, bg: C.night },
  { label: 'distant ship', svg: distantShip(), bg: night },
  { label: 'sea rows 0-4 (far to near)', w: 1200, bg: C.skyLow, svg: `<div style="width:100%">${[0, 1, 2, 3, 4].map((i) => row(seaRow(i / 4, i), 2)).join('')}</div>` },
  { label: 'glint', svg: glint(), w: 128, bg: C.seaDeep },
  { label: 'fog tile x2', svg: row(fogTile(), 2), w: 720, bg: sea },
  { label: 'bulwark tile, 4 bays (game)', svg: bulwarkTile(4), w: 1400 },
  { label: 'bulwark tile, 2 bays (default)', svg: bulwarkTile(), w: 720 },
  { label: 'deck tile x2', svg: row(deckTile(), 2), w: 960 },
  { label: 'mast tile x2', svg: col(mastTile(), 2), w: 80, bg: night },
  { label: 'mast foot', svg: mastFoot() },
  { label: 'pole + cap', w: 64, bg: night, svg: `<div style="width:32px;margin:auto">${poleCap().replace('<svg ', '<svg style="width:32px" ')}${col(poleTile(), 3).replace('width:64px', 'width:32px')}</div>` },
  { label: 'lantern bracket', svg: lanternBracket(), w: 160, bg: night },
  { label: 'lantern back / front', w: 280, bg: night, svg: `<div style="display:flex;gap:8px">${lantern('back')}${lantern('front')}</div>` },
  { label: 'lantern lit (fire / green)', w: 300, bg: night, svg: `<div style="display:flex;gap:30px;padding:10px 20px">${lanternAssembled(C.fireHot, 'fire')}${lanternAssembled(C.green, 'green')}</div>` },
  { label: 'sail corner', svg: sailCorner(), w: 360, bg: night },
  { label: 'jolly roger', svg: jollyRoger(), w: 320, bg: night },
  { label: 'pennants', w: 360, bg: night, svg: `<div style="display:flex;gap:6px">${[C.crimson, C.gold, C.navyLight, C.paperWarm, C.teal].map((c) => pennant(c)).join('')}</div>` },
  { label: 'barrel', svg: barrel() },
  { label: 'cannon', svg: cannon() },
  { label: 'cannonballs', svg: cannonballs() },
  { label: 'rope coil', svg: ropeCoil() },
  { label: 'treasure pile', svg: treasurePile() },
  { label: 'skull finial', svg: skullFinial(), w: 128 },
  { label: `hatch frame (S = 100 units, ${HATCH.vw} x ${HATCH.vh})`, svg: hatchFrame(), w: 740, bg: night },
];
