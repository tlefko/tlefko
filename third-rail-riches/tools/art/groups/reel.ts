/**
 * Reel review for the symbol set (npx tsx tools/art/sheet.ts reel 2): every symbol on the dark
 * cargo-hold columns at the sizes the game shows them (90 px phone, 128 px desktop), each symbol
 * large, and the win-frame strips with an onion-skin overlay that shows whether the frames share
 * one framing (a frame that jumps shows up as a doubled outline).
 */
import { SYMBOL_ART } from '../../../src/art/symbols';

type Art = { idle: () => string; blink?: () => string; win?: () => string; hot?: () => string; winFrames?: (() => string)[]; idleFrames?: (() => string)[] };
const ART = SYMBOL_ART as Record<number, Art>;
const NAMES = ['anchor', 'shell', 'map', 'compass', 'crab', 'octopus', 'shark', 'parrot', 'captain', 'keg', 'chest', 'bomb'];
const ids = Object.keys(ART)
  .map(Number)
  .sort((a, b) => a - b);

/** The hold behind the reels (scene.ts hatchFrame `col` gradient). */
const HOLD = 'linear-gradient(90deg,#0e1221,#15141f 12%,#091733 50%,#15141f 88%,#0e1221)';
const cell = (svg: string, px: number, extra = '') =>
  `<div style="width:${px}px;height:${px}px;background:${HOLD};display:flex;align-items:center;justify-content:center;${extra}"><div style="width:${px}px">${svg}</div></div>`;
const grid = (svgs: string[], px: number, cols = 6) =>
  `<div style="display:grid;grid-template-columns:repeat(${cols},${px}px);gap:${Math.round(px * 0.07)}px 0;column-gap:${Math.round(px * 0.07)}px;background:#3a2412;padding:${Math.round(px * 0.07)}px">${svgs.map((s) => cell(s, px)).join('')}</div>`;
const winOf = (a: Art) => a.winFrames?.[0]?.() ?? a.hot?.() ?? a.win?.() ?? a.idle();
const framesOf = (a: Art): { label: string; svg: string }[] => {
  if (a.winFrames?.length) return a.winFrames.map((f, i) => ({ label: `win ${i + 1}`, svg: f() }));
  const out = [{ label: 'idle', svg: a.idle() }];
  if (a.blink) out.push({ label: 'blink', svg: a.blink() });
  if (a.win) out.push({ label: 'win', svg: a.win() });
  if (a.hot) out.push({ label: 'hot', svg: a.hot() });
  return out;
};
/** Every frame stacked at low opacity: a clean single image means the frames register. */
const onion = (svgs: string[], px: number) =>
  `<div style="position:relative;width:${px}px;height:${px}px;background:${HOLD}">${svgs
    .map((s) => `<div style="position:absolute;inset:0;opacity:${(1 / Math.max(1, svgs.length)) * 1.6}">${s}</div>`)
    .join('')}</div>`;
const label = (t: string) => `<div style="font:11px/1.2 -apple-system,sans-serif;color:#8d8a86;text-align:center;margin-top:3px">${t}</div>`;

export default () => {
  const idle = ids.map((i) => ART[i].idle());
  const wins = ids.map((i) => winOf(ART[i]));
  const items = [
    { label: 'reel @90 px (phone): idle', w: 90 * 6 + 60, bg: '#211a14', svg: grid(idle, 90) },
    { label: 'reel @90 px: first win frame / lit / open / hot', w: 90 * 6 + 60, bg: '#211a14', svg: grid(wins, 90) },
    { label: 'reel @128 px (1440 x 900 desktop): idle', w: 128 * 6 + 80, bg: '#211a14', svg: grid(idle, 128) },
    { label: 'keg vs bomb @90 / @64 (must read apart at a glance)', w: 460, bg: '#211a14', svg: `<div style="display:flex;gap:8px;align-items:center">${[9, 11, 9, 11]
      .filter((i) => ART[i])
      .map((i, k) => cell(k < 2 ? ART[i].idle() : winOf(ART[i]), 90))
      .join('')}${[9, 11].filter((i) => ART[i]).map((i) => cell(ART[i].idle(), 64)).join('')}</div>` },
  ];
  for (const i of ids) {
    const a = ART[i];
    const fr = framesOf(a);
    const idleExtra = a.idleFrames?.map((f, k) => ({ label: `idle ${k + 1}`, svg: f() })) ?? [];
    const all = [...(a.winFrames?.length ? [{ label: 'idle', svg: a.idle() }] : []), ...fr, ...idleExtra];
    items.push({
      label: `${i} ${NAMES[i] ?? '?'}: ${all.map((f) => f.label).join(' / ')} + onion skin of the win frames`,
      w: Math.min(1400, 176 * (all.length + 1) + 20),
      bg: '#211a14',
      svg: `<div style="display:flex;gap:8px">${all.map((f) => `<div>${cell(f.svg, 168)}${label(f.label)}</div>`).join('')}<div>${onion(fr.map((f) => f.svg), 168)}${label('onion')}</div></div>`,
    });
  }
  return items;
};
