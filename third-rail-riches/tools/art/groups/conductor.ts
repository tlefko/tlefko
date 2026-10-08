import { conductorHead, conductorWinFrames, conductorRigPart, type ConductorExpr, type ConPart } from '../../../src/art/conductor';

const exprs: ConductorExpr[] = ['idle', 'blink', 'laugh', 'pray', 'shock', 'smug', 'whistle'];
const parts: ConPart[] = ['face', 'cheeks', 'cap', 'moustache', 'lidL', 'browL', 'browR', 'mouth-grin', 'mouth-laugh', 'mouth-whistle', 'mouth-grit'];

let bodyItems: () => { label: string; svg: string; w?: number; bg?: string }[] = () => [];
try {
  const u = await import('../../../src/art/uniform');
  bodyItems = () => (u as unknown as { reviewItems?: () => { label: string; svg: string; w?: number }[] }).reviewItems?.() ?? [];
} catch {
  /* uniform.ts not written yet */
}

const all = () => [
  { label: 'symbol idle', svg: conductorHead('idle', true), w: 300 },
  ...exprs.slice(1).map((e) => ({ label: `symbol ${e}`, svg: conductorHead(e, true), w: 220 })),
  ...conductorWinFrames.map((f, i) => ({ label: `win ${i + 1}`, svg: f(), w: 180 })),
  { label: '@90 idle', svg: conductorHead('idle', true), w: 90 },
  { label: '@90 laugh', svg: conductorHead('laugh', true), w: 90 },
  { label: 'rig head (no symbol)', svg: conductorHead('idle'), w: 220 },
  ...parts.map((p) => ({ label: p, svg: conductorRigPart(p).svg, w: 140 })),
  ...bodyItems(),
];

/** ONLY=label,label narrows the sheet (close-up review). */
export default () => {
  const only = process.env.ONLY?.split(',');
  return only ? all().filter((it) => only.some((o) => it.label.includes(o))) : all();
};
