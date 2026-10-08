/**
 * Scratch review for one symbol while it is being drawn: npx tsx tools/art/sheet.ts dev 2
 * DEV=<symbol id> picks the symbol (default 4). Shows idle / blink / win frames large, the
 * same at 128 and 90 px on the hold colours, and the onion skin of the win frames.
 */
import { SYMBOL_ART } from '../../../src/art/symbols';

type Art = { idle: () => string; blink?: () => string; win?: () => string; hot?: () => string; winFrames?: (() => string)[]; idleFrames?: (() => string)[] };
const HOLD = 'linear-gradient(90deg,#0e1221,#15141f 12%,#091733 50%,#15141f 88%,#0e1221)';

export default () => {
  const ids = (process.env.DEV ?? '4').split(',').map(Number);
  const out: { label: string; svg: string; w?: number; bg?: string }[] = [{ label: '', svg: '<style>.big svg,.fr svg{width:100%!important;height:auto}</style>', w: 1, bg: 'none' }];
  for (const id of ids) {
    const a = (SYMBOL_ART as Record<number, Art>)[id];
    const frames: [string, string][] = [['idle', a.idle()]];
    if (a.blink) frames.push(['blink', a.blink()]);
    if (a.win) frames.push(['win', a.win()]);
    if (a.hot) frames.push(['hot', a.hot()]);
    a.winFrames?.forEach((f, i) => frames.push([`win ${i + 1}`, f()]));
    a.idleFrames?.forEach((f, i) => frames.push([`idle ${i + 1}`, f()]));
    for (const [l, s] of frames.slice(0, 2)) out.push({ label: `${id} ${l} @512`, svg: `<div class="big" style="width:512px">${s}</div>`, w: 512, bg: HOLD });
    out.push({
      label: `${id} all @200`,
      w: 1400,
      bg: HOLD,
      svg: `<div style="display:flex;flex-wrap:wrap;gap:6px">${frames.map(([, s]) => `<div class="fr" style="width:200px">${s}</div>`).join('')}</div>`,
    });
    out.push({
      label: `${id} @128 / @90`,
      w: 1400,
      bg: HOLD,
      svg: `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">${frames.map(([, s]) => `<div class="fr" style="width:128px">${s}</div>`).join('')}${frames.map(([, s]) => `<div class="fr" style="width:90px">${s}</div>`).join('')}</div>`,
    });
    if (a.winFrames?.length) {
      out.push({
        label: `${id} onion`,
        w: 300,
        bg: HOLD,
        svg: `<div style="position:relative;width:280px;height:280px">${a.winFrames.map((f) => `<div class="fr" style="position:absolute;inset:0;opacity:${1.6 / a.winFrames!.length}">${f()}</div>`).join('')}</div>`,
      });
    }
  }
  return out;
};
