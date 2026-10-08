/**
 * Rivets the subway rat (docs/ART.md): the H1 paying symbol and every part of the sidekick rig
 * (render/characters/Rat.ts). A scrappy, lovable 1930s rubber-hose rat: a round grey head on a
 * tapering snout with a big pink nose, two buck teeth, huge round pink ears, big pie eyes under
 * bold little brows, a few clean whiskers, a red newsboy cap cocked on the back of his head, a
 * patched mustard vest, a long pink tail and white gloves, standing on a stack of two suitcases.
 *
 * Painted like Conductor Casey (cast/paint.ts): three flat cel values per material, a thin warm
 * rim, bold ink weighted lower right, a light grain; no hatching on him. The head is drawn once in
 * a 256 box; the rig cuts it into parts (`RAT_PARTS`) so ears, eyes, brows, mouth, nose, whiskers
 * and cap move on their own.
 */
import { C, composeSymbol, nextId, cel, celForm, celTones, shine, mix, GOLD_TONES } from './kit';
import { type V, lens, mirrorX } from './geo';
import { form, formLine, tones, brush, glint, inked, piePupil } from './cast/paint';
import { caseyGlove } from './cast/casey';

export type RatExpr = 'idle' | 'blink' | 'happy' | 'squeak' | 'worried';
export type RatPose = 'idle' | 'blink' | 'win';

/* ------------------------------------------------------------------ */
/* Tones                                                               */
/* ------------------------------------------------------------------ */
const FUR = celTones(C.rat, C.ratDeep, C.ratLight);
const MUZ = { base: mix(C.ratLight, C.white, 0.35), shade: mix(C.ratLight, C.rat, 0.45), light: C.white, hatch: mix(C.rat, C.ink, 0.3) };
const PINK = { base: C.ratPink, shade: mix(C.ratPink, C.pinkDeep, 0.5), light: mix(C.ratPink, C.pinkLight, 0.8), hatch: mix(C.pinkDeep, C.ink, 0.3) };
const VEST = celTones(mix(C.amber, C.wood, 0.42), C.woodDark, C.amberLight);
type Tones = { base: string; shade: string; light: string; hatch: string };
const PAPER: Tones = { base: C.paper, shade: C.paperWarm, light: C.white, hatch: C.g3 };
/** Clean cel tones for the new head (no hatching): fur, muzzle, pink, nose, cap red. */
const FURc = { ...tones(C.rat, C.ratDeep, C.ratLight, C.amber, 0.55), light: mix(C.rat, C.ratLight, 0.6), rim: mix(mix(C.rat, C.ratDeep, 0.55), C.amberLight, 0.32) };
const MUZc = { base: mix(C.ratLight, C.white, 0.45), shade: mix(C.ratLight, C.rat, 0.5), light: mix(C.white, '#ffffff', 0.5), rim: mix(C.ratLight, C.amberLight, 0.5) };
const PINKc = { ...tones(C.ratPink, C.pinkDeep, C.pinkLight, C.amber, 0.45), rim: mix(mix(C.ratPink, C.pinkDeep, 0.45), C.amberLight, 0.4) };
const NOSEc = { ...tones(mix(C.ratPink, C.pinkDeep, 0.35), C.pinkDeep, C.pinkLight, C.amber, 0.6) };
const REDc = { ...tones(C.crimson, C.crimsonDeep, C.crimsonLight, C.amber, 0.55) };

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
const svgDoc = (body: string, size = 256) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
/** Re-frame a 256-box drawing to [x, y, w, h]. */
export const cropBox = (svg: string, [x, y, w, h]: readonly number[]) =>
  svg.replace(/viewBox="0 0 256 256" width="256" height="256"/, `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);

/* ------------------------------------------------------------------ */
/* Head geometry (256 box, neck pivot at (128, 226))                   */
/* ------------------------------------------------------------------ */
/** A round cranium tapering to the snout (a rat, not a mouse): the chin is the snout's tip. */
const HEAD = 'M128 46 C178 46 210 78 210 120 C210 148 198 166 184 180 C168 200 152 226 128 230 C104 226 88 200 72 180 C58 166 46 148 46 120 C46 78 78 46 128 46 Z';
const MUZZLE = 'M128 134 C156 134 178 152 178 174 C178 198 154 224 128 228 C102 224 78 198 78 174 C78 152 100 134 128 134 Z';
const EYE_Y = 114;
const EYE_L = 104;
const EYE_R = 152;
const EYE_RX = 20;
const EYE_RY = 24;
/** Where each pie eye sits in its white (a touch toward the nose: a cute, slightly crossed look). */
const PUP_L = 108;
const PUP_R = 148;
const PRX = 10.5;
const PRY = 14;
const EAR_C: Record<'L' | 'R', V> = { L: [50, 70], R: [206, 70] };
const EAR_R = 41;
const NOSE_C: V = [128, 172];
/** The eyes' layout for the rig: left eye centre, the right eye's offset, the pupils' offsets. */
export const RAT_EYES = { x: EYE_L, y: EYE_Y, dx: EYE_R - EYE_L, pupil: PUP_L, pupilDx: PUP_R - PUP_L };
/** The mouth (squeaks, nibbles) in the head box. */
export const RAT_MOUTH: V = [128, 196];

/** Big round ear: grey rim, pink inner. */
function earForms(side: 'L' | 'R') {
  const [cx, cy] = EAR_C[side];
  const s = side === 'L' ? 1 : -1;
  const outer = circ(cx, cy, EAR_R);
  const inner = ell(cx + s * 6, cy + 6, 27, 28);
  const o = formLine(outer, { ...FURc, cut: [-8, -9], band: [3, 3.5] });
  const i = formLine(inner, { ...PINKc, cut: [-6, -7], band: [3, 3], inner: `<path d="M${cx + s * -4} ${cy + 24} Q${cx + s * 10} ${cy + 10} ${cx + s * 14} ${cy - 12}" stroke="${PINKc.shade}" stroke-width="4" fill="none" stroke-linecap="round"/>` });
  return [
    { fills: o.fills, lines: o.line() },
    { fills: i.fills, lines: i.line('stroke-width="4.5"') },
  ];
}

/** The newsboy cap: a puffy crown in panels, a short visor, a top button. Cocked on the back of his head (CAP_T). */
function capLayers() {
  const crown = 'M66 72 C56 42 90 16 134 16 C178 16 208 42 198 72 C194 84 178 88 160 88 L98 88 C80 88 70 84 66 72 Z';
  const visor = 'M84 82 C104 94 158 94 180 82 C182 92 162 102 132 102 C102 102 82 92 84 82 Z';
  const seams = 'M134 20 Q106 40 98 86 M134 20 Q132 50 130 88 M134 20 Q160 40 166 86';
  const cf = formLine(crown, { ...REDc, cut: [-11, -10], twist: -2, band: [4, 4], inner: `<path d="${seams}" stroke="${REDc.shade}" stroke-width="3.4" fill="none" stroke-linecap="round"/>` });
  const VIS = tones(mix(C.crimson, C.crimsonDeep, 0.4), C.crimsonDeep, C.crimson, C.amber, 0.6);
  const vf = formLine(visor, { ...VIS, cut: [-4, -6], band: [2, 2] });
  const bf = formLine(circ(134, 18, 8), { ...REDc, cut: [-3, -3] });
  return {
    layers: [
      { fills: cf.fills, lines: `${cf.line()}<path d="${seams}" stroke-width="3" opacity=".45"/>` },
      { fills: vf.fills, lines: vf.line() },
      { fills: bf.fills, lines: bf.line('stroke-width="5"') },
    ],
    top: `${glint([[74, 62], [80, 40], [100, 26], [122, 21]], 3.4, C.crimsonLight, 0.75)}${glint([[100, 96], [120, 99], [140, 99]], 1.8, C.crimsonLight, 0.6)}`,
  };
}
/** The cap's seat on his head: lifted and cocked back so his brows and eyes stay clear. */
const CAP_T = 'translate(2 -23) rotate(7 130 70) translate(130 60) scale(.86) translate(-130 -60)';

/** The whiskers on one side: two long clean strokes and three whisker dots. */
function whiskers(side: 'L' | 'R', fan = 0): string {
  const w = [`M92 180 Q62 ${168 - fan} 30 ${164 - fan * 2}`, `M92 190 Q64 ${196 + fan} 36 ${208 + fan * 2}`];
  const dots = `<circle cx="102" cy="182" r="2.4" fill="${C.ink}"/><circle cx="98" cy="190" r="2.4" fill="${C.ink}"/><circle cx="106" cy="190" r="2.2" fill="${C.ink}"/>`;
  const art = `<g fill="none" stroke-linecap="round">${w.map((d) => `<path d="${d}" stroke="${C.ink}" stroke-width="3.6"/>`).join('')}</g>${dots}`;
  return side === 'L' ? art : `<g transform="translate(256 0) scale(-1 1)">${art}</g>`;
}

/** Eye white with a cool lower crescent. */
function eyeWhiteArt(cx: number, sw = 6): string {
  const d = ell(cx, EYE_Y, EYE_RX, EYE_RY);
  const id = nextId('rw');
  return `<path d="${d}" fill="${C.white}"/><clipPath id="${id}"><path d="${d}"/></clipPath>
    <path clip-path="url(#${id})" d="M${cx - EYE_RX} ${EYE_Y + EYE_RY * 0.45} Q${cx} ${EYE_Y + EYE_RY * 1.25} ${cx + EYE_RX} ${EYE_Y + EYE_RY * 0.45} L${cx + EYE_RX} ${EYE_Y + EYE_RY} L${cx - EYE_RX} ${EYE_Y + EYE_RY} Z" fill="${mix(C.white, C.steelLight, 0.7)}"/>
    <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${sw}"/>`;
}
/** A big pie pupil with a second glint (Casey's style, cast/paint.ts). */
function pupilArt(px: number, py: number, k = 1): string {
  return piePupil(px, py, PRX * k, PRY * k);
}

/** Buck teeth hanging from the upper lip at y `y`, `h` long. */
function teeth(y: number, h = 18, w = 10): string {
  const d = `M${128 - w} ${y} L${128 + w} ${y} L${128 + w} ${y + h - 4} Q${128 + w} ${y + h} ${128 + w - 4} ${y + h} L${128 - w + 4} ${y + h} Q${128 - w} ${y + h} ${128 - w} ${y + h - 4} Z`;
  return `<path d="${d}" fill="${C.white}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M128 ${y + 1} L128 ${y + h - 1}" stroke="${C.ink}" stroke-width="2.8"/>
    <path d="M${128 - w + 3} ${y + h - 5} L${128 + w - 3} ${y + h - 5}" stroke="${mix(C.white, C.steelLight, 0.8)}" stroke-width="2.4" stroke-linecap="round"/>`;
}

type MouthKind = 'closed' | 'grin' | 'open' | 'worry';
const MOUTH_IN = mix(C.crimsonDeep, C.ink, 0.4);
/** The mouth (and buck teeth) in each shape. */
function mouthArt(kind: MouthKind): string {
  if (kind === 'closed') {
    return `<path d="M128 182 L128 190" stroke="${C.ink}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M104 186 Q116 200 128 190 Q140 200 152 186" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M101 182 q-4 5 0 9 M155 182 q4 5 0 9" fill="none" stroke="${C.ink}" stroke-width="3.2" stroke-linecap="round"/>
      ${teeth(192)}`;
  }
  if (kind === 'worry') {
    return `<path d="M106 198 Q111 190 117 197 Q123 204 128 196 Q133 204 139 197 Q145 190 150 198" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M128 182 L128 192" stroke="${C.ink}" stroke-width="4.2" stroke-linecap="round"/>
      ${teeth(192, 15)}`;
  }
  const id = nextId('rm');
  const path = kind === 'grin' ? 'M100 182 Q128 196 156 182 C157 208 145 224 128 224 C111 224 99 208 100 182 Z' : 'M128 184 C140 184 146 196 146 206 C146 218 138 226 128 226 C118 226 110 218 110 206 C110 196 116 184 128 184 Z';
  const tongue = kind === 'grin' ? ell(128, 222, 20, 11) : ell(128, 224, 13, 8);
  return `<clipPath id="${id}"><path d="${path}"/></clipPath>
    <path d="${path}" fill="${MOUTH_IN}"/>
    <g clip-path="url(#${id})">
      <path d="${tongue}" fill="${C.ratPink}"/>
      <path d="${tongue}" fill="none" stroke="${mix(C.ratPink, C.pinkDeep, 0.6)}" stroke-width="3"/>
    </g>
    <path d="${path}" fill="none" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>
    ${teeth(kind === 'grin' ? 187 : 186, kind === 'grin' ? 17 : 15)}`;
}

function noseArt(): string {
  const [x, y] = NOSE_C;
  const d = 'M128 160 C142 160 148 166 147 172 C146 180 136 185 128 185 C120 185 110 180 109 172 C108 166 114 160 128 160 Z';
  const f = formLine(d, { ...NOSEc, cut: [-4, -5], band: [2, 2.5], rimCut: [-3.5, -3.5] });
  return inked({ fills: f.fills, lines: f.line('stroke-width="5"') }, 5) + `<ellipse cx="${x - 7}" cy="${y - 5}" rx="5.5" ry="3.4" fill="#fff" opacity=".85" transform="rotate(-14 ${x - 7} ${y - 5})"/>`;
}

const lidShape = (cx: number) => ell(cx, EYE_Y, EYE_RX + 2, EYE_RY + 2);
function lidArt(cx: number): string {
  return `${form(lidShape(cx), { ...FURc, cut: [-4, -5] })}
    <path d="${lidShape(cx)}" fill="none" stroke="${C.ink}" stroke-width="5"/>
    <path d="M${cx - 19} ${EYE_Y + 6} C${cx - 12} ${EYE_Y + 20} ${cx + 12} ${EYE_Y + 20} ${cx + 19} ${EYE_Y + 6}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>`;
}
/** Bold little brows (ink-dark grey), always on: they carry the acting. Left brow spine, inner end last. */
const BROW_SPINE: V[] = [
  [84, 88],
  [96, 83],
  [110, 83],
  [121, 88],
];
function browArt(side: 'L' | 'R', lift = 0, rot = 0): string {
  const c: V = [103, 85];
  const a = (rot * Math.PI) / 180;
  let pts: V[] = BROW_SPINE.map(([x, y]) => {
    const dx = x - c[0];
    const dy = y - c[1];
    return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a) + lift] as V;
  });
  if (side === 'R') pts = pts.map(([x, y]) => [256 - x, y] as V);
  const d = brush(pts, (t) => 2.6 + 3.2 * Math.sin(Math.PI * Math.min(1, t * 1.05)), 20);
  return `<path d="${d}" fill="${mix(C.ratDeep, C.ink, 0.45)}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`;
}
const browL = (lift = 0, rot = 0) => browArt('L', lift, rot);
const browR = (lift = 0, rot = 0) => browArt('R', lift, rot);
const tearArt = () => `<path d="M202 116 q-9 13 0 20 q9 -7 0 -20 Z" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="3"/><ellipse cx="200" cy="129" rx="2" ry="3" fill="#fff"/>`;
const blush = `<ellipse cx="78" cy="150" rx="13" ry="7.5" fill="${C.ratPink}" opacity=".75"/><ellipse cx="178" cy="150" rx="13" ry="7.5" fill="${C.ratPink}" opacity=".75"/>
  <circle cx="73" cy="147" r="2.2" fill="#fff" opacity=".7"/><circle cx="173" cy="147" r="2.2" fill="#fff" opacity=".7"/>`;

/** Head base forms (no ears, no cap): the head with its muzzle. */
function headLayers() {
  const muzzle = form(MUZZLE, { ...MUZc, cut: [-9, -10], twist: -2, band: [3, 3] });
  const headF = formLine(HEAD, { ...FURc, cut: [-13, -14], twist: -3, band: [5, 5], rimCut: [-6, -6], inner: muzzle });
  return [
    { fills: headF.fills, lines: `${headF.line()}<path d="M80 184 C76 156 100 134 128 134 C156 134 180 156 176 184" stroke-width="3.8" opacity=".55"/>` },
  ];
}
const headShine = glint([[62, 118], [70, 92], [88, 70], [108, 60]], 3.2, C.ratLight, 0.8);

export interface CapPlace {
  dx?: number;
  dy?: number;
  rot?: number;
}

/** Per-expression brows: [lift, rot] (rot positive drops the inner end). */
const BROWS: Record<RatExpr, [number, number]> = { idle: [0, -7], blink: [4, -5], happy: [-2, -6], squeak: [-6, -4], worried: [-1, -20] };

/** Everything drawn over the head base for one expression: eyes, nose, mouth, whiskers, brows. */
function face(expr: RatExpr): string {
  const up = expr === 'worried' ? -7 : 0;
  const k = expr === 'squeak' ? 0.78 : 1;
  const eyes =
    expr === 'idle' || expr === 'squeak' || expr === 'worried'
      ? `${eyeWhiteArt(EYE_L)}${eyeWhiteArt(EYE_R)}${pupilArt(PUP_L, EYE_Y + 4 + up, k)}${pupilArt(PUP_R, EYE_Y + 4 + up, k)}`
      : expr === 'blink'
        ? `${lidArt(EYE_L)}${lidArt(EYE_R)}`
        : `${happyEye(EYE_L)}${happyEye(EYE_R)}`;
  const mouth: MouthKind = expr === 'happy' ? 'grin' : expr === 'squeak' ? 'open' : expr === 'worried' ? 'worry' : 'closed';
  const [bl, br] = BROWS[expr];
  return `${blush}${mouthArt(mouth)}${noseArt()}${eyes}${browL(bl, br)}${browR(bl, br)}${whiskers('L', expr === 'squeak' ? 6 : 0)}${whiskers('R', expr === 'squeak' ? 6 : 0)}`;
}
/** Squeezed shut in a laugh: a fat upturned arc with the cheek pushing up. */
const happyEye = (x: number) =>
  `<path d="M${x - 17} ${EYE_Y + 6} Q${x} ${EYE_Y - 14} ${x + 17} ${EYE_Y + 6}" fill="none" stroke="${C.ink}" stroke-width="7.5" stroke-linecap="round"/>
   <path d="M${x - 11} ${EYE_Y + 17} Q${x} ${EYE_Y + 12} ${x + 11} ${EYE_Y + 17}" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linecap="round" opacity=".5"/>`;

/** Rig parts: their crop box and pivot in the head's 256 box. */
export const RAT_PARTS = {
  base: { box: [26, 20, 204, 216], pivot: [128, 226] },
  earL: { box: [2, 22, 96, 96], pivot: [78, 98] },
  earR: { box: [158, 22, 96, 96], pivot: [178, 98] },
  cap: { box: [44, -14, 176, 122], pivot: [128, 80] },
  eyeWhite: { box: [80, 86, 48, 56], pivot: [104, 114] },
  pupil: { box: [94, 100, 28, 36], pivot: [108, 118] },
  lid: { box: [78, 84, 52, 60], pivot: [104, 88] },
  lidHappy: { box: [82, 98, 44, 40], pivot: [104, 114] },
  nose: { box: [102, 154, 52, 38], pivot: [128, 178] },
  mouth: { box: [96, 176, 64, 40], pivot: [128, 190] },
  grin: { box: [94, 176, 68, 54], pivot: [128, 190] },
  open: { box: [104, 178, 48, 52], pivot: [128, 190] },
  worry: { box: [100, 178, 56, 34], pivot: [128, 192] },
  whiskerL: { box: [22, 154, 90, 64], pivot: [94, 184] },
  whiskerR: { box: [144, 154, 90, 64], pivot: [162, 184] },
  browL: { box: [74, 66, 58, 38], pivot: [103, 85] },
  browR: { box: [124, 66, 58, 38], pivot: [153, 85] },
  tear: { box: [190, 112, 24, 30], pivot: [202, 126] },
} as const;
export type RatPart = keyof typeof RAT_PARTS;

const TEX = { seed: 14, mottle: 0.28, grain: 0.32 };
const paintDoc = (o: { layers?: { fills: string; lines?: string }[]; top?: string; seed?: number; contour?: boolean }) =>
  composeSymbol({ autoCel: false, texture: { ...TEX, seed: o.seed ?? 14 }, ...(o.contour ? { contour: 0.8 } : {}), inkShift: [1, 1.2], noDrop: true, layers: o.layers ?? [{ fills: '' }], top: o.top ?? '' });

/**
 * Rivets' head. `symbol` = standalone symbol art (paint + contour). `part` cuts one rig layer,
 * cropped to its box in `RAT_PARTS` (the base has no ears, cap or face: they are separate parts).
 * `cap` moves the cap (symbol win frames) or, null, leaves it off.
 */
export function ratHead(expr: RatExpr = 'idle', symbol = true, part: 'all' | RatPart = 'all', cap: CapPlace | null = {}): string {
  if (part !== 'all') return cropBox(ratHeadPart(part), RAT_PARTS[part].box);
  const ears = [...earForms('L'), ...earForms('R')];
  const cp = capLayers();
  const capT = cap ? `translate(${cap.dx ?? 0} ${cap.dy ?? 0}) rotate(${cap.rot ?? 0} 128 90) ${CAP_T}` : '';
  const capArt = cap
    ? `<g transform="${capT}">${composeSymbol({ autoCel: false, inkShift: [1, 1.2], noDrop: true, layers: cp.layers, top: cp.top }).replace(/^<svg /, '<svg x="0" y="0" overflow="visible" ')}</g>`
    : '';
  const worry = expr === 'worried' ? tearArt() : '';
  return composeSymbol({
    autoCel: false,
    inkShift: [1, 1.2],
    ...(symbol ? { texture: TEX, contour: 0.8 } : {}),
    noDrop: !symbol,
    // seated a little low in its box so the cap clears the top edge (title cards raster the whole box)
    transform: 'translate(0 8)',
    layers: [...ears, ...headLayers()],
    top: `${headShine}${face(expr)}${capArt}${worry}`,
  });
}

function ratHeadPart(part: RatPart): string {
  switch (part) {
    case 'base':
      return paintDoc({ layers: headLayers(), top: `${headShine}${blush}`, contour: true });
    case 'earL':
      return paintDoc({ layers: earForms('L'), contour: true });
    case 'earR':
      return paintDoc({ layers: earForms('R'), contour: true });
    case 'cap': {
      const cp = capLayers();
      return composeSymbol({ autoCel: false, texture: { ...TEX, seed: 15 }, contour: 0.8, inkShift: [1, 1.2], noDrop: true, layers: cp.layers, top: cp.top, transform: CAP_T });
    }
    case 'eyeWhite':
      return svgDoc(eyeWhiteArt(EYE_L));
    case 'pupil':
      return svgDoc(pupilArt(PUP_L, EYE_Y + 4));
    case 'lid':
      return paintDoc({ top: lidArt(EYE_L) });
    case 'lidHappy':
      return svgDoc(happyEye(EYE_L));
    case 'nose':
      return paintDoc({ top: noseArt() });
    case 'mouth':
      return paintDoc({ top: mouthArt('closed') });
    case 'grin':
      return paintDoc({ top: mouthArt('grin') });
    case 'open':
      return paintDoc({ top: mouthArt('open') });
    case 'worry':
      return paintDoc({ top: mouthArt('worry') });
    case 'whiskerL':
      return svgDoc(whiskers('L'));
    case 'whiskerR':
      return svgDoc(whiskers('R'));
    case 'browL':
      return svgDoc(browL());
    case 'browR':
      return svgDoc(browR());
    case 'tear':
      return svgDoc(tearArt());
  }
}

/* ------------------------------------------------------------------ */
/* H1 symbol                                                           */
/* ------------------------------------------------------------------ */
interface SymPose {
  expr: RatExpr;
  cap?: CapPlace;
  /** Glove poses and raise (degrees, + = outward) for the cheering hands; omitted = no hands. */
  hands?: { pose: 'open' | 'fist'; rot: number; y?: number; x?: number }[];
  squeak?: boolean;
}

function ratArt(p: SymPose): string {
  const head = ratHead(p.expr, false, 'all', p.cap ?? {}).replace(/^<svg /, '<svg x="0" y="0" ');
  const hand = (side: 0 | 1) => {
    const h = p.hands?.[side];
    if (!h) return '';
    const s = side ? 1 : -1;
    const x = 128 + s * (h.x ?? 98);
    const y = h.y ?? 204;
    const g = caseyGlove(h.pose).replace(/^<svg /, '<svg x="0" y="0" ');
    return `<g transform="translate(${x} ${y}) rotate(${s * h.rot}) scale(${side ? 0.36 : -0.36} .36) translate(-128 -220)">${g}</g>`;
  };
  const lines = p.squeak
    ? ([
        [[36, 64], [16, 48]],
        [[30, 88], [6, 86]],
        [[220, 64], [240, 48]],
        [[226, 88], [250, 86]],
      ] as V[][])
        .map((pp) => `<path d="${lens(pp, 3.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`)
        .join('')
    : '';
  // the head fills the box: scaled to leave a margin for the drop shadow and the hands
  return composeSymbol({
    autoCel: false,
    texture: { ...TEX, seed: 9 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [{ fills: '' }],
    top: `<g transform="translate(128 134) scale(.9) translate(-128 -128)">${head}</g>${hand(0)}${hand(1)}${lines}${sparkleStar(222, 34)}`,
  });
}
/** The symbol set's twinkle (top right), as on every other symbol. */
const sparkleStar = (cx: number, cy: number, r = 10) => {
  const k = r * 0.16;
  return `<path d="M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z" fill="#fff" opacity=".92"/>`;
};

const RAT_POSES: Record<RatPose, SymPose> = {
  idle: { expr: 'idle' },
  blink: { expr: 'blink' },
  win: { expr: 'happy', cap: { dx: -3, dy: -4, rot: -6 }, hands: [{ pose: 'open', rot: 18 }, { pose: 'open', rot: 18 }] },
};

/** H1 symbol frames: idle / blink / win (cap popped, hands up). */
export const ratSymbol = (pose: RatPose) => ratArt(RAT_POSES[pose]);

/** Win loop: Rivets cheers, his cap popping off his head while he squeaks and waves. */
export const ratWinFrames: (() => string)[] = [
  () => ratArt({ expr: 'happy', cap: { dy: -4, rot: -6 }, hands: [{ pose: 'open', rot: 12 }, { pose: 'open', rot: 22 }] }),
  () => ratArt({ expr: 'squeak', cap: { dy: -11, rot: 10 }, hands: [{ pose: 'fist', rot: 30, y: 192 }, { pose: 'fist', rot: 30, y: 192 }], squeak: true }),
  () => ratArt({ expr: 'happy', cap: { dy: -5, rot: -8 }, hands: [{ pose: 'open', rot: 22 }, { pose: 'open', rot: 10 }] }),
  () => ratArt({ expr: 'squeak', cap: { dy: -4, rot: 4 }, hands: [{ pose: 'fist', rot: 24, y: 198 }, { pose: 'fist', rot: 24, y: 198 }], squeak: true }),
];

/* ------------------------------------------------------------------ */
/* Rig body parts                                                      */
/* ------------------------------------------------------------------ */

/** Torso box and anchors (256 box): neck (128, 34), hips (128, 204), shoulders (±40 from centre, y 62). */
export const TORSO_BOX: [number, number, number, number] = [52, 14, 152, 222];
export const TORSO_NECK: V = [128, 34];
export const TORSO_HIP: V = [128, 204];

/** Rivets' torso: grey fur, a pale belly, the patched mustard vest with a golden ticket in its pocket. */
export function ratTorso(): string {
  const body = 'M128 26 C158 26 174 46 178 76 C184 112 198 150 194 184 C190 214 162 230 128 230 C94 230 66 214 62 184 C58 150 72 112 78 76 C82 46 98 26 128 26 Z';
  const belly = 'M128 70 C152 70 166 110 168 150 C170 190 154 220 128 220 C102 220 86 190 88 150 C90 110 104 70 128 70 Z';
  const vestL = 'M96 34 C82 46 74 76 70 112 C64 150 62 176 68 194 C88 202 104 206 118 206 L120 150 C110 118 104 84 112 40 Z';
  const vestR = mirrorX(vestL);
  const patch = 'M78 132 L104 128 L106 156 L80 160 Z';
  const pocket = 'M144 120 L172 117 L174 140 Q160 144 146 142 Z';
  const ticket = 'M150 120 L148 98 L164 96 L166 119 Z';
  const bodyF = celForm(body, { ...FUR, cut: [-12, -14], twist: -3, seed: 51, inner: cel(belly, { ...MUZ, cut: [-9, -11], seed: 52 }) });
  const vl = celForm(vestL, { ...VEST, cut: [-9, -10], seed: 53 });
  const vr = celForm(vestR, { ...VEST, cut: [-9, -10], seed: 54 });
  const pf = celForm(patch, { base: mix(C.emerald, C.paper, 0.35), shade: C.emerald, light: mix(C.emeraldLight, C.paper, 0.5), hatch: C.emeraldDeep, cut: [-3, -4], seed: 55 });
  const tf = celForm(ticket, { ...GOLD_TONES, cut: [-3, -3], seed: 56 });
  const pk = celForm(pocket, { ...VEST, cut: [-4, -5], seed: 57 });
  const stitches = 'M80 136 l-5 -2 M80 146 l-6 0 M82 156 l-5 3 M104 130 l5 -2 M105 141 l6 0 M106 152 l5 2';
  const buttons = [
    [145, 92],
    [143, 128],
    [143, 164],
  ]
    .map(([x, y]) => `${cel(circ(x, y, 6), { ...GOLD_TONES, cut: [-2, -2] })}<circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${C.ink}" stroke-width="3.2"/>`)
    .join('');
  return composeSymbol({
    autoCel: false,
    texture: { seed: 19 },
    contour: 0.8,
    inkShift: [1, 1.2],
    noDrop: true,
    layers: [
      { fills: bodyF.fills, lines: bodyF.line() },
      { fills: tf.fills, lines: `${tf.line('stroke-width="4"')}<path d="M152 104 L162 103 M152 111 L162 110" stroke="${C.goldDeep}" stroke-width="2.4"/>` },
      { fills: `${vl.fills}${vr.fills}`, lines: `${vl.line()}${vr.line()}` },
      { fills: pk.fills, lines: pk.line('stroke-width="4.5"') },
      { fills: pf.fills, lines: `${pf.line('stroke-width="4.5"')}<path d="${stitches}" stroke-width="2.6"/>` },
    ],
    top: `${buttons}
      ${shine([[84, 70], [80, 96], [78, 122]], 2.6, 0.45, C.amberLight)}
      ${shine([[100, 44], [114, 34], [128, 32]], 2.4, 0.4)}`,
  });
}

/** Foot box (256 box) and ankle: a big pink rat foot seen from the front, toes out. */
export const FOOT_BOX: [number, number, number, number] = [48, 84, 168, 104];
export const FOOT_ANKLE: V = [118, 100];
/** Ground contact line of the foot (its sole) in the 256 box. */
export const FOOT_SOLE = 180;
export function ratFoot(side: 'L' | 'R'): string {
  const foot = 'M104 94 C104 116 92 126 76 134 C56 144 54 172 76 176 C96 180 150 180 176 176 C206 172 210 148 192 138 C170 128 140 120 134 94 Z';
  const toes = 'M90 176 Q92 160 100 154 M120 178 Q122 162 128 156 M150 178 Q154 162 160 156';
  const d = side === 'L' ? mirrorX(foot) : foot;
  const t = side === 'L' ? mirrorX(toes) : toes;
  const ff = celForm(d, { ...PINK, cut: [-8, -9], seed: side === 'L' ? 61 : 62 });
  return cropBox(
    composeSymbol({
      autoCel: false,
      texture: { seed: 23 },
      contour: 0.8,
      inkShift: [1, 1.2],
      noDrop: true,
      layers: [{ fills: ff.fills, lines: `${ff.line()}<path d="${t}" stroke-width="4"/>` }],
      top: shine(side === 'L' ? [[170, 146], [152, 136], [136, 134]] : [[86, 146], [104, 136], [120, 134]], 2.2, 0.55),
    }),
    side === 'L' ? [256 - FOOT_BOX[0] - FOOT_BOX[2], FOOT_BOX[1], FOOT_BOX[2], FOOT_BOX[3]] : FOOT_BOX,
  );
}

/**
 * The tail's skin for the rig's rope mesh: a long pink strip, root on the left (full height),
 * tapering to a rounded tip on the right, with faint rings, a lit stripe on top and a shadow band
 * underneath. 512 x 48; the rope stretches it along the tail.
 */
export function ratTailStrip(): string {
  const d = 'M0 4 C160 7 330 15 490 21 Q510 24 490 27 C330 33 160 41 0 44 Z';
  const rings = Array.from({ length: 17 }, (_, i) => {
    const x = 26 + i * 28;
    const hw = 20 - (x / 512) * 15;
    return `M${x} ${24 - hw + 2} Q${x + 4} 24 ${x} ${24 + hw - 2}`;
  }).join(' ');
  const id = nextId('rt');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 48" width="512" height="48">
  <defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>
  <path d="${d}" fill="${PINK.base}"/>
  <g clip-path="url(#${id})">
    <path d="M0 30 C160 32 330 28 512 25 L512 48 L0 48 Z" fill="${PINK.shade}"/>
    <path d="M0 11 C160 13 330 19 512 22 L512 20 C330 17 160 9 0 8 Z" fill="${PINK.light}"/>
    <path d="${rings}" fill="none" stroke="${mix(C.ratPink, C.pinkDeep, 0.55)}" stroke-width="2.2" stroke-linecap="round" opacity=".8"/>
  </g>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
</svg>`;
}

/** A little wedge of cheese for nibbling (64 box, held at its centre). */
export function ratCrumb(): string {
  const wedge = 'M10 40 L50 22 L56 44 Q34 54 12 50 Z';
  const top = 'M10 40 L50 22 L52 28 L14 44 Z';
  const CH = celTones(C.gold, C.goldDeep, C.goldLight);
  const wf = celForm(wedge, { ...CH, cut: [-4, -5], seed: 71, inner: `<circle cx="30" cy="44" r="3.4" fill="${C.goldDeep}"/><circle cx="44" cy="40" r="2.4" fill="${C.goldDeep}"/><circle cx="20" cy="47" r="2" fill="${C.goldDeep}"/>` });
  return composeSymbol({
    size: 64,
    lw: 3.6,
    autoCel: false,
    inkShift: [0.5, 0.6],
    noDrop: true,
    layers: [{ fills: `${wf.fills}<path d="${top}" fill="${C.goldLight}"/>`, lines: wf.line() }],
  });
}

/** Squeak burst: three little white lines fanning out beside the mouth (64 box, root at left centre). */
export function ratSqueakLines(): string {
  const l = ([
    [[8, 22], [30, 6]],
    [[10, 32], [40, 30]],
    [[8, 42], [30, 58]],
  ] as V[][])
    .map((pp) => `<path d="${lens(pp, 3.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${l}</svg>`;
}

/* ------------------------------------------------------------------ */
/* The suitcase stack                                                  */
/* ------------------------------------------------------------------ */
/** Painted box (ink included) of the luggage, the ground line and where Rivets stands. */
export const LUGGAGE_BOX: [number, number, number, number] = [12, 70, 232, 184];
export const LUGGAGE_FOOT = 249;
export const LUGGAGE_TOP = 92;

/** A travel sticker shape (no text): round, label, oval or diamond. */
function sticker(kind: 'round' | 'label' | 'oval' | 'diamond', x: number, y: number, rot: number): { fills: string; lines: string } {
  let d = '';
  let deco = '';
  let tone = PAPER;
  switch (kind) {
    case 'round':
      d = circ(x, y, 17);
      tone = celTones(C.emerald, C.emeraldDeep, C.emeraldLight);
      deco = `<path d="M${x} ${y - 10} L${x + 3} ${y - 3} L${x + 10} ${y - 3} L${x + 4.5} ${y + 2} L${x + 6.5} ${y + 9} L${x} ${y + 5} L${x - 6.5} ${y + 9} L${x - 4.5} ${y + 2} L${x - 10} ${y - 3} L${x - 3} ${y - 3} Z" fill="${C.cream}"/>
        <circle cx="${x}" cy="${y}" r="13.5" fill="none" stroke="${C.cream}" stroke-width="1.6" stroke-dasharray="3 2.4"/>`;
      break;
    case 'label':
      d = `M${x - 22} ${y - 14} L${x + 22} ${y - 14} L${x + 22} ${y + 14} L${x - 22} ${y + 14} Z`;
      tone = { base: C.cream, shade: C.paperWarm, light: C.white, hatch: C.g3 };
      deco = `<path d="M${x - 22} ${y - 6} L${x + 22} ${y - 6} L${x + 22} ${y - 2} L${x - 22} ${y - 2} Z M${x - 22} ${y + 3} L${x + 22} ${y + 3} L${x + 22} ${y + 7} L${x - 22} ${y + 7} Z" fill="${C.maroon}"/>
        <circle cx="${x - 10}" cy="${y - 9.5}" r="2.4" fill="${C.maroonDeep}"/><circle cx="${x + 10}" cy="${y + 10.5}" r="2.4" fill="${C.maroonDeep}"/>`;
      break;
    case 'oval':
      d = ell(x, y, 22, 14);
      tone = celTones(C.voltDeep, C.voltNight, C.volt);
      deco = `<path d="M${x + 3} ${y - 10} L${x - 7} ${y + 1} L${x - 1} ${y + 1} L${x - 4} ${y + 10} L${x + 7} ${y - 2} L${x + 1} ${y - 2} Z" fill="${C.amberLight}"/>`;
      break;
    case 'diamond':
      d = `M${x} ${y - 16} L${x + 18} ${y} L${x} ${y + 16} L${x - 18} ${y} Z`;
      tone = celTones(C.amber, C.amberDeep, C.amberLight);
      deco = `<circle cx="${x}" cy="${y}" r="6" fill="${C.maroon}"/><circle cx="${x}" cy="${y}" r="2.4" fill="${C.cream}"/>`;
      break;
  }
  const t = `rotate(${rot} ${x} ${y})`;
  const f = celForm(d, { ...tone, cut: [-3, -4], t, seed: Math.round(x + y), inner: `<g transform="${t}">${deco}</g>` });
  return { fills: f.fills, lines: f.line('stroke-width="3.6"') };
}

/** Brass corner cap for a case corner (`c` = the corner point, sx/sy = which way the case extends). */
const corner = (cx: number, cy: number, sx: number, sy: number, r = 16) =>
  `M${cx} ${cy + sy * 6} Q${cx} ${cy} ${cx + sx * 6} ${cy} L${cx + sx * r} ${cy} Q${cx + sx * r * 0.55} ${cy + sy * r * 0.55} ${cx} ${cy + sy * r} Z`;

/**
 * Two old suitcases stacked flat (no text): a big dark-brown case below, a smaller tan one on top,
 * brass corners, leather straps, handles on their front spines and travel stickers. 256 box,
 * standing on its painted bottom at y = LUGGAGE_FOOT; Rivets stands on the top case at LUGGAGE_TOP.
 */
export function ratLuggage(): string {
  const DARK = celTones(C.woodMid, C.woodDeep, C.wood);
  const TAN = celTones(C.wood, C.woodDark, C.woodLight);
  const STRAP = celTones(C.woodDark, C.woodDeep, C.woodMid);
  const lowCase = 'M28 156 Q18 156 18 166 L18 236 Q18 246 28 246 L228 246 Q238 246 238 236 L238 166 Q238 156 228 156 Z';
  const lowTop = 'M30 148 L226 148 L236 158 L20 158 Z';
  const topT = 'rotate(-2.5 128 124)';
  const hiCase = 'M48 96 Q40 96 40 104 L40 150 Q40 158 48 158 L208 158 Q216 158 216 150 L216 104 Q216 96 208 96 Z';
  const hiTop = 'M50 86 L206 86 L216 98 L40 98 Z';
  const straps = [62, 194].map((x) => `M${x - 8} 156 L${x + 8} 156 L${x + 8} 246 L${x - 8} 246 Z`);
  const low = celForm(lowCase, {
    ...DARK,
    cut: [-12, -12],
    hatch: DARK.hatch,
    hatchGap: 5.5,
    seed: 81,
    inner: `<path d="M18 190 L238 190" stroke="${C.woodDeep}" stroke-width="3"/><path d="M24 196 L232 196" stroke="${DARK.light}" stroke-width="2" opacity=".6"/>`,
  });
  const lowT = celForm(lowTop, { ...celTones(C.wood, C.woodMid, C.woodLight), cut: [-4, -3], seed: 82 });
  const hi = celForm(hiCase, {
    ...TAN,
    t: topT,
    cut: [-10, -10],
    hatch: TAN.hatch,
    hatchGap: 5.5,
    seed: 83,
    inner: `<g transform="${topT}"><path d="M40 128 L216 128" stroke="${C.woodDark}" stroke-width="3"/><path d="M44 133 L212 133" stroke="${TAN.light}" stroke-width="2" opacity=".7"/></g>`,
  });
  const hiT = celForm(hiTop, { ...celTones(C.woodLight, C.wood, C.paperWarm), t: topT, cut: [-4, -3], seed: 84 });
  const strapF = straps.map((d, i) => celForm(d, { ...STRAP, cut: [-3, -2], seed: 85 + i }));
  const buckles = [62, 194].map((x) => `M${x - 11} 200 L${x + 11} 200 L${x + 11} 216 L${x - 11} 216 Z M${x - 6} 205 L${x + 6} 205 L${x + 6} 211 L${x - 6} 211 Z`);
  const buckleF = buckles.map((d, i) => celForm(d, { ...GOLD_TONES, cut: [-2, -2], rule: 'evenodd', seed: 87 + i }));
  const corners = [
    corner(18, 156, 1, 1),
    corner(238, 156, -1, 1),
    corner(18, 246, 1, -1),
    corner(238, 246, -1, -1),
  ];
  const cornersHi = [corner(40, 98, 1, 1, 14), corner(216, 98, -1, 1, 14), corner(40, 158, 1, -1, 14), corner(216, 158, -1, -1, 14)];
  const cornF = celForm(corners.join(' '), { ...GOLD_TONES, cut: [-3, -3], seed: 89 });
  const cornHiF = celForm(cornersHi.join(' '), { ...GOLD_TONES, t: topT, cut: [-3, -3], seed: 90 });
  // handles on the front spines, with brass mounts; latches either side of the seam
  const handle = (x: number, y: number, w: number, t = '') => {
    const d = `M${x - w} ${y} C${x - w} ${y - 14} ${x + w} ${y - 14} ${x + w} ${y}`;
    return `<g${t ? ` transform="${t}"` : ''}><path d="${d}" fill="none" stroke="${C.ink}" stroke-width="13" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${C.woodDark}" stroke-width="6.5" stroke-linecap="round"/>
      <path d="M${x - w + 3} ${y - 8} C${x - w / 2} ${y - 13} ${x + w / 2} ${y - 13} ${x + w - 4} ${y - 9}" fill="none" stroke="${C.wood}" stroke-width="2" stroke-linecap="round"/>
      <rect x="${x - w - 6}" y="${y - 3}" width="12" height="9" rx="2" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><rect x="${x + w - 6}" y="${y - 3}" width="12" height="9" rx="2" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/></g>`;
  };
  const latch = (x: number, y: number, t = '') =>
    `<g${t ? ` transform="${t}"` : ''}><rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="3" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.2"/><rect x="${x - 3}" y="${y - 3}" width="6" height="6" rx="1" fill="${C.goldDeep}"/></g>`;
  const st = [sticker('round', 104, 222, -8), sticker('label', 152, 214, 7), sticker('oval', 170, 140, 6), sticker('diamond', 84, 141, -4)];
  return composeSymbol({
    autoCel: false,
    texture: { seed: 27 },
    contour: 0.8,
    inkShift: [1, 1.2],
    noDrop: true,
    layers: [
      { fills: lowT.fills, lines: lowT.line('stroke-width="5"') },
      { fills: low.fills, lines: low.line() },
      { fills: strapF.map((s) => s.fills).join(''), lines: strapF.map((s) => s.line('stroke-width="4.5"')).join('') },
      { fills: buckleF.map((s) => s.fills).join(''), lines: buckleF.map((s) => s.line('stroke-width="3.2"')).join('') },
      { fills: cornF.fills, lines: cornF.line('stroke-width="4"') },
      { fills: st.slice(0, 2).map((s) => s.fills).join(''), lines: st.slice(0, 2).map((s) => s.lines).join('') },
      { fills: hiT.fills, lines: hiT.line('stroke-width="5"') },
      { fills: hi.fills, lines: hi.line() },
      { fills: cornHiF.fills, lines: cornHiF.line('stroke-width="4"') },
      { fills: st.slice(2).map((s) => s.fills).join(''), lines: st.slice(2).map((s) => s.lines).join('') },
    ],
    top: `${handle(128, 164, 20)}${latch(96, 190)}${latch(160, 190)}${handle(128, 108, 18, topT)}${latch(108, 128, topT)}${latch(148, 128, topT)}
      ${shine([[26, 172], [26, 204], [28, 232]], 2.6, 0.35, C.woodLight)}
      ${shine([[48, 108], [48, 128], [50, 148]], 2.4, 0.4, C.paperWarm)}
      ${shine([[60, 89], [120, 88], [180, 88]], 1.6, 0.4, C.white)}`,
  });
}
