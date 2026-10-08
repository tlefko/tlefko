/**
 * Kaboom Bomb review (npx tsx tools/art/sheet.ts bomb 2): idle / hot large, the fuse-flicker and
 * heat-pulse frames, and the bomb beside the Powder Keg at the sizes the reels use, where the two
 * must read apart at a glance.
 */
import { bombIdle, bombHot, bombIdleFrames, bombHotFrames } from '../../../src/art/bomb';
import { powderKeg } from '../../../src/art/keg';

const HOLD = 'linear-gradient(90deg,#0e1221,#15141f 12%,#091733 50%,#15141f 88%,#0e1221)';
const row = (svgs: string[], px: number) =>
  `<div style="display:flex;gap:10px;align-items:center">${svgs.map((s) => `<div style="width:${px}px;height:${px}px;background:${HOLD}">${s.replace('<svg ', '<svg style="width:100%;height:auto" ')}</div>`).join('')}</div>`;

export default () => [
  { label: 'bomb idle (fuse lit)', svg: bombIdle(), w: 420, bg: HOLD },
  { label: 'bomb hot (about to blow)', svg: bombHot(), w: 420, bg: HOLD },
  { label: 'idle frames (fuse flicker) / hot frames (heat pulse)', w: 1100, bg: '#211a14', svg: row([...bombIdleFrames.map((f) => f()), ...bombHotFrames.map((f) => f())], 200) },
  { label: 'keg cold / bomb idle / keg lit / bomb hot @128', w: 600, bg: '#211a14', svg: row([powderKeg(false), bombIdle(), powderKeg(true), bombHot()], 128) },
  { label: 'the same @90 and @60', w: 700, bg: '#211a14', svg: `${row([powderKeg(false), bombIdle(), powderKeg(true), bombHot()], 90)}<div style="height:8px"></div>${row([powderKeg(false), bombIdle(), powderKeg(true), bombHot()], 60)}` },
];
