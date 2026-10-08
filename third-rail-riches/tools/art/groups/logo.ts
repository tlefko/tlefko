/**
 * Logo review sheet (npx tsx tools/art/sheet.ts logo 2): the title lockup at the sizes the game
 * draws it (1440x900 side zone, intro splash, phone portrait HUD), the tagline, the glyph set and a
 * numerals specimen in the house treatment.
 */
import { logoSvg, LOGO_BOX, wordSvg, specimenSvg, NUMERALS } from '../../../src/art/lettering';

type Item = { label: string; svg: string; w?: number; bg?: string };

const STATION = 'radial-gradient(ellipse at 50% 30%, #2a3a3a, #0d1418 75%)';
const TILE = 'linear-gradient(#efe2c0, #c9b48a)';

export default function logo(): Item[] {
  const r = LOGO_BOX.h / LOGO_BOX.w;
  const at = (w: number) => ({ label: `logo ${w}x${Math.round(w * r)}`, svg: logoSvg({ width: w, height: w * r }), w: w + 16, bg: STATION });
  return [
    at(820),
    at(440),
    { ...at(440), label: 'logo 440 on tile', bg: TILE },
    at(300),
    at(220),
    at(160),
    { label: 'no tagline 300', svg: logoSvg({ width: 300, tagline: false }), w: 316, bg: STATION },
    { label: 'tagline', svg: wordSvg('ALL ABOARD!', 60, 'tagline'), w: 560, bg: STATION },
    { label: 'carved word', svg: wordSvg('THIRD RAIL', 90, 'carved'), w: 900, bg: STATION },
    { label: 'burned word', svg: wordSvg('RICHES', 90, 'burned'), w: 640, bg: STATION },
    { label: 'numerals gold (big win)', svg: wordSvg('1234567890', 90, 'burned'), w: 1000, bg: STATION },
    { label: 'numerals enamel', svg: wordSvg('1234567890', 90, 'carved'), w: 1000, bg: STATION },
    { label: 'numerals gold small', svg: wordSvg('$12,345.67 x5', 40, 'burned'), w: 520, bg: STATION },
    { label: 'numerals carved small', svg: wordSvg('$12,345.67 x5', 40, 'carved'), w: 520, bg: STATION },
    { label: 'signs', svg: wordSvg('€9.50 £3 ¥80 +-%', 60, 'burned'), w: 820, bg: STATION },
    { label: 'glyph specimen', svg: specimenSvg("ABCDEFGHIJKLMNOPQRSTUVWXYZ!&'", 60, 10), w: 1000 },
    { label: 'alphabet enamel', svg: wordSvg('THE QUICK BROWN FOX JUMPS', 60, 'carved'), w: 1300, bg: STATION },
    { label: 'numerals specimen', svg: specimenSvg(NUMERALS, 60, 10), w: 1000 },
  ];
}
