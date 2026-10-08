/**
 * Rivets the subway rat (docs/ART.md): the H1 paying symbol and every part of the sidekick rig
 * (render/characters/Rat.ts). A scrappy, lovable 1930s rubber-hose rat: grey fur, big round pink
 * ears, buck teeth, pie eyes, whiskers, a red newsboy cap, a patched mustard vest, a long pink tail
 * and white gloves, standing on a stack of two old suitcases.
 *
 * Everything is painted in the house hand-cel style (cut shadows on the lower right, hatching,
 * cut highlights, paper grain). The head is drawn once in a 256 box; the rig cuts it into parts
 * (`RAT_PARTS`) so ears, eyes, mouth, nose, whiskers and cap can move on their own.
 */
import { C, composeSymbol, pieEye, closedEye, nextId, brow, cel, celForm, celTones, shine, mix, GOLD_TONES } from './kit';
import { type V, lens, mirrorX } from './geo';
import { glove } from './characters';

export type RatExpr = 'idle' | 'blink' | 'happy' | 'squeak' | 'worried';
export type RatPose = 'idle' | 'blink' | 'win';

/* ------------------------------------------------------------------ */
/* Tones                                                               */
/* ------------------------------------------------------------------ */
const FUR = celTones(C.rat, C.ratDeep, C.ratLight);
const MUZ = { base: mix(C.ratLight, C.white, 0.35), shade: mix(C.ratLight, C.rat, 0.45), light: C.white, hatch: mix(C.rat, C.ink, 0.3) };
const PINK = { base: C.ratPink, shade: mix(C.ratPink, C.pinkDeep, 0.5), light: mix(C.ratPink, C.pinkLight, 0.8), hatch: mix(C.pinkDeep, C.ink, 0.3) };
const NOSE = { base: mix(C.ratPink, C.pinkDeep, 0.38), shade: mix(C.ratPink, C.pinkDeep, 0.78), light: mix(C.ratPink, C.pinkLight, 0.5), hatch: C.pinkDeep };
const RED = celTones(C.crimson, C.crimsonDeep, C.crimsonLight);
const VEST = celTones(mix(C.amber, C.wood, 0.42), C.woodDark, C.amberLight);
type Tones = { base: string; shade: string; light: string; hatch: string };
const PAPER: Tones = { base: C.paper, shade: C.paperWarm, light: C.white, hatch: C.g3 };

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
const svgDoc = (body: string, size = 256) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
/** Re-frame a 256-box drawing to [x, y, w, h]. */
export const cropBox = (svg: string, [x, y, w, h]: readonly number[]) =>
  svg.replace(/viewBox="0 0 256 256" width="256" height="256"/, `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);

/* ------------------------------------------------------------------ */
/* Head geometry (256 box, neck pivot at (128, 226))                   */
/* ------------------------------------------------------------------ */
const HEAD = 'M128 48 C177 48 209 80 210 122 C211 148 203 164 191 176 C180 204 157 225 128 225 C99 225 76 204 65 176 C53 164 45 148 46 122 C47 80 79 48 128 48 Z';
const MUZZLE = 'M128 136 C164 136 187 158 185 184 C183 208 158 225 128 225 C98 225 73 208 71 184 C69 158 92 136 128 136 Z';
const MUZZLE_TOP = 'M72 190 C69 159 93 136 128 136 C163 136 187 159 184 190';
const TUFT_TOP = 'M108 56 C106 40 114 30 120 40 C122 24 134 22 136 40 C142 30 152 36 150 56 Z';
const cheekTuft = (s: 1 | -1) => {
  const d = 'M58 142 L36 146 L52 156 L34 166 L54 170 L42 182 L70 178 Z';
  return s > 0 ? d : mirrorX(d);
};
const EYE_Y = 120;
const EYE_L = 106;
const EYE_R = 150;
const EYE_RX = 19;
const EYE_RY = 25;
/** Where each pie eye sits in its white (a touch toward the nose: a cute, slightly crossed look). */
const PUP_L = 110;
const PUP_R = 146;
const EAR_C: Record<'L' | 'R', V> = { L: [48, 72], R: [208, 72] };
const EAR_R = 40;
const NOSE_C: V = [128, 154];

/** Big round ear: grey rim, pink inner. */
function earForms(side: 'L' | 'R') {
  const [cx, cy] = EAR_C[side];
  const s = side === 'L' ? 1 : -1;
  const outer = circ(cx, cy, EAR_R);
  const inner = ell(cx + s * 6, cy + 5, 27, 28);
  const o = celForm(outer, { ...FUR, cut: [-8, -10], hatch: FUR.hatch, hatchGap: 5, seed: side === 'L' ? 11 : 12 });
  const i = celForm(inner, { ...PINK, cut: [-6, -7], seed: side === 'L' ? 13 : 14, inner: `<path d="M${cx + s * -6} ${cy + 22} Q${cx + s * 8} ${cy + 8} ${cx + s * 14} ${cy - 14}" stroke="${mix(C.ratPink, C.pinkDeep, 0.45)}" stroke-width="4" fill="none" stroke-linecap="round"/>` });
  return [
    { fills: o.fills, lines: o.line() },
    { fills: i.fills, lines: i.line('stroke-width="4.5"') },
  ];
}

/** The newsboy cap: puffy eight-panel crown, a short visor, a top button. Seat at (128, 92). */
function capLayers() {
  const crown = 'M58 74 C46 44 80 12 132 12 C184 12 216 42 204 74 C200 86 184 92 164 92 L96 92 C76 92 62 86 58 74 Z';
  const visor = 'M80 84 C102 96 158 96 180 84 C182 94 162 104 130 104 C98 104 78 94 80 84 Z';
  const seams = 'M132 18 Q100 36 84 88 M132 18 Q118 46 114 92 M132 18 Q146 46 148 92 M132 18 Q166 38 180 88';
  const cf = celForm(crown, {
    ...RED,
    cut: [-10, -12],
    twist: -2,
    hatch: RED.hatch,
    hatchGap: 5.5,
    seed: 21,
    inner: `<path d="${seams}" stroke="${C.crimsonDeep}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".75"/>`,
  });
  const VIS = celTones(mix(C.crimson, C.crimsonDeep, 0.35), C.crimsonDeep, C.crimson);
  const vf = celForm(visor, { ...VIS, cut: [-4, -7], hatch: VIS.hatch, hatchGap: 4.5, seed: 22 });
  const button = circ(132, 15, 8);
  const bf = celForm(button, { ...RED, cut: [-3, -3], seed: 23 });
  return {
    layers: [
      { fills: cf.fills, lines: `${cf.line()}<path d="${seams}" stroke-width="3" opacity=".5"/>` },
      { fills: vf.fills, lines: `${vf.line()}<path d="M88 91 Q130 100 172 91" stroke-width="3" opacity=".45"/>` },
      { fills: bf.fills, lines: bf.line('stroke-width="5"') },
    ],
    top: `${shine([[70, 58], [84, 34], [108, 22], [124, 20]], 3.4, 0.55)}${shine([[96, 100], [118, 104], [140, 104]], 1.8, 0.35)}`,
  };
}
const CAP_T = 'translate(0 -11) rotate(-7 130 64)';

/** The whiskers on one side (ink only): three long curved strokes and the whisker dots. */
function whiskers(side: 'L' | 'R', fan = 0): string {
  const w = [
    `M86 166 Q58 ${154 - fan} 24 ${150 - fan * 2}`,
    'M85 177 Q54 177 18 181',
    `M87 188 Q60 ${197 + fan} 28 ${210 + fan * 2}`,
  ];
  const dots = `<circle cx="96" cy="170" r="2.6" fill="${C.ink}"/><circle cx="92" cy="180" r="2.6" fill="${C.ink}"/><circle cx="100" cy="182" r="2.4" fill="${C.ink}"/>`;
  const art = `<g fill="none" stroke-linecap="round">${w.map((d) => `<path d="${d}" stroke="${C.ink}" stroke-width="6"/>`).join('')}${w.map((d) => `<path d="${d}" stroke="${C.ratLight}" stroke-width="2.2"/>`).join('')}</g>${dots}`;
  return side === 'L' ? art : `<g transform="translate(256 0) scale(-1 1)">${art}</g>`;
}

/** Eye white with a cel crescent. */
function eyeWhiteArt(cx: number, sw = 6.5): string {
  const d = ell(cx, EYE_Y, EYE_RX, EYE_RY);
  return `${cel(d, { base: C.white, shade: C.paperWarm, cut: [-5, -7] })}<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${sw}"/>`;
}

/** Buck teeth hanging from the upper lip at y `y`, `h` long. */
function teeth(y: number, h = 19, w = 9): string {
  const d = `M${128 - w} ${y} L${128 + w} ${y} L${128 + w} ${y + h - 4} Q${128 + w} ${y + h} ${128 + w - 4} ${y + h} L${128 - w + 4} ${y + h} Q${128 - w} ${y + h} ${128 - w} ${y + h - 4} Z`;
  return `<path d="${d}" fill="${C.white}" stroke="${C.ink}" stroke-width="4.2" stroke-linejoin="round"/>
    <path d="M128 ${y + 1} L128 ${y + h - 1}" stroke="${C.ink}" stroke-width="3"/>
    <path d="M${128 - w + 3} ${y + h - 5} L${128 - 3} ${y + h - 5}" stroke="${C.paperWarm}" stroke-width="2.4" stroke-linecap="round"/>`;
}

type MouthKind = 'closed' | 'grin' | 'open' | 'worry';
/** The mouth (and buck teeth) in each shape. */
function mouthArt(kind: MouthKind): string {
  if (kind === 'closed') {
    return `<path d="M128 165 L128 172" stroke="${C.ink}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M106 166 Q117 180 128 171 Q139 180 150 166" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M103 162 q-3 5 1 9 M153 162 q3 5 -1 9" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linecap="round"/>
      ${teeth(173)}`;
  }
  if (kind === 'worry') {
    return `<path d="M106 178 Q111 170 117 177 Q123 184 128 176 Q133 184 139 177 Q145 170 150 178" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M128 165 L128 172" stroke="${C.ink}" stroke-width="4.5" stroke-linecap="round"/>
      ${teeth(171, 16)}`;
  }
  const id = nextId('rm');
  const path =
    kind === 'grin'
      ? 'M100 164 Q128 178 156 164 C157 194 144 213 128 213 C112 213 99 194 100 164 Z'
      : 'M128 166 C141 166 147 180 147 192 C147 206 139 214 128 214 C117 214 109 206 109 192 C109 180 115 166 128 166 Z';
  const tongue = kind === 'grin' ? ell(128, 210, 20, 12) : ell(128, 212, 13, 9);
  return `<clipPath id="${id}"><path d="${path}"/></clipPath>
    <path d="${path}" fill="${C.crimsonDeep}"/>
    <g clip-path="url(#${id})">
      <path d="${tongue}" fill="${C.ratPink}"/>
      <path d="${tongue}" fill="none" stroke="${mix(C.ratPink, C.pinkDeep, 0.6)}" stroke-width="3"/>
    </g>
    <path d="${path}" fill="none" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>
    ${teeth(kind === 'grin' ? 170 : 167, kind === 'grin' ? 17 : 15)}`;
}

function noseArt(): string {
  const d = ell(NOSE_C[0], NOSE_C[1], 17, 12.5);
  return `${cel(d, { ...NOSE, cut: [-4, -5], seed: 31 })}<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5"/>
    <ellipse cx="${NOSE_C[0] - 6}" cy="${NOSE_C[1] - 4}" rx="5" ry="3.2" fill="${C.white}" opacity=".85" transform="rotate(-18 ${NOSE_C[0] - 6} ${NOSE_C[1] - 4})"/>`;
}

const lidShape = (cx: number) => ell(cx, EYE_Y, EYE_RX, EYE_RY);
function lidArt(cx: number): string {
  return `${cel(lidShape(cx), { ...FUR, cut: [-4, -5], seed: 33 })}
    <path d="${lidShape(cx)}" fill="none" stroke="${C.ink}" stroke-width="6.5"/>
    <path d="M${cx - 18} ${EYE_Y + 6} C${cx - 12} ${EYE_Y + 20} ${cx + 12} ${EYE_Y + 20} ${cx + 18} ${EYE_Y + 6}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
    <path d="M${cx - 15} ${EYE_Y + 15} l-6 5 M${cx + 15} ${EYE_Y + 15} l6 5" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round"/>`;
}
const browL = () => brow(86, 90, 122, 84, 3, 3.8);
const browR = () => brow(170, 90, 134, 84, -3, 3.8);
const tearArt = () => `<path d="M200 132 q-9 13 0 20 q9 -7 0 -20 Z" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="3"/><ellipse cx="198" cy="145" rx="2" ry="3" fill="#fff"/>`;
const blush = `<ellipse cx="80" cy="186" rx="12" ry="7" fill="${C.ratPink}" opacity=".7"/><ellipse cx="176" cy="186" rx="12" ry="7" fill="${C.ratPink}" opacity=".7"/>`;

/** Head base forms (no ears, no cap): fur tufts, the head with its muzzle. */
function headLayers() {
  const tufts = [cheekTuft(1), cheekTuft(-1), TUFT_TOP].map((d, i) => celForm(d, { ...FUR, cut: [-5, -6], seed: 40 + i }));
  const muzzle = cel(MUZZLE, { ...MUZ, cut: [-10, -12], twist: -2, hatch: MUZ.hatch, hatchGap: 5, seed: 44 });
  const headF = celForm(HEAD, {
    ...FUR,
    cut: [-13, -15],
    twist: -3,
    hatch: FUR.hatch,
    hatchGap: 5.5,
    seed: 45,
    inner: `${muzzle}<path d="M58 132 q8 6 16 4 M60 148 q8 6 16 4 M198 132 q-8 6 -16 4 M196 148 q-8 6 -16 4" stroke="${FUR.light}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".8"/>`,
  });
  return [
    { fills: tufts.map((t) => t.fills).join(''), lines: tufts.map((t) => t.line('stroke-width="6"')).join('') },
    { fills: headF.fills, lines: `${headF.line()}<path d="${MUZZLE_TOP}" stroke-width="4.5"/>` },
  ];
}
const headShine = shine([[62, 112], [74, 84], [94, 66], [112, 58]], 3.2, 0.45);

export interface CapPlace {
  dx?: number;
  dy?: number;
  rot?: number;
}

/** Everything drawn over the head base for one expression: eyes, nose, mouth, whiskers, brows. */
function face(expr: RatExpr): string {
  const up = expr === 'worried' ? -5 : 0;
  const er: [number, number] = expr === 'squeak' ? [7.5, 11] : [9, 13.5];
  const eyes =
    expr === 'idle' || expr === 'squeak' || expr === 'worried'
      ? `${eyeWhiteArt(EYE_L)}${eyeWhiteArt(EYE_R)}${pieEye(PUP_L, EYE_Y + 5 + up, er[0], er[1])}${pieEye(PUP_R, EYE_Y + 5 + up, er[0], er[1])}`
      : expr === 'blink'
        ? `${lidArt(EYE_L)}${lidArt(EYE_R)}`
        : `${closedEye(EYE_L, EYE_Y + 4, 30, true)}${closedEye(EYE_R, EYE_Y + 4, 30, true)}`;
  const mouth: MouthKind = expr === 'happy' ? 'grin' : expr === 'squeak' ? 'open' : expr === 'worried' ? 'worry' : 'closed';
  return `${blush}${mouthArt(mouth)}${noseArt()}${eyes}${whiskers('L', expr === 'squeak' ? 6 : 0)}${whiskers('R', expr === 'squeak' ? 6 : 0)}`;
}

/** Rig parts: their crop box and pivot in the head's 256 box. */
export const RAT_PARTS = {
  base: { box: [26, 18, 204, 216], pivot: [128, 226] },
  earL: { box: [2, 26, 92, 92], pivot: [76, 100] },
  earR: { box: [162, 26, 92, 92], pivot: [180, 100] },
  cap: { box: [40, -12, 180, 122], pivot: [128, 80] },
  eyeWhite: { box: [83, 91, 46, 58], pivot: [106, 120] },
  pupil: { box: [97, 104, 26, 34], pivot: [110, 125] },
  lid: { box: [83, 91, 46, 58], pivot: [106, 94] },
  lidHappy: { box: [87, 108, 38, 24], pivot: [106, 120] },
  nose: { box: [106, 137, 44, 34], pivot: [128, 160] },
  mouth: { box: [96, 158, 64, 40], pivot: [128, 172] },
  grin: { box: [94, 158, 68, 60], pivot: [128, 170] },
  open: { box: [104, 160, 48, 58], pivot: [128, 168] },
  worry: { box: [100, 160, 56, 32], pivot: [128, 174] },
  whiskerL: { box: [12, 144, 94, 74], pivot: [88, 177] },
  whiskerR: { box: [150, 144, 94, 74], pivot: [168, 177] },
  browL: { box: [80, 74, 48, 24], pivot: [104, 87] },
  browR: { box: [128, 74, 48, 24], pivot: [152, 87] },
  tear: { box: [188, 128, 24, 30], pivot: [200, 142] },
} as const;
export type RatPart = keyof typeof RAT_PARTS;

const paintDoc = (o: { layers?: { fills: string; lines?: string }[]; top?: string; seed?: number; contour?: boolean }) =>
  composeSymbol({ autoCel: false, texture: { seed: o.seed ?? 14 }, ...(o.contour ? { contour: 0.8 } : {}), inkShift: [1, 1.2], noDrop: true, layers: o.layers ?? [{ fills: '' }], top: o.top ?? '' });

/**
 * Rivets' head. `symbol` = standalone symbol art (drop shadow + paint). `part` cuts one rig layer,
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
  const worry = expr === 'worried' ? `${browL()}${browR()}${tearArt()}` : '';
  return composeSymbol({
    autoCel: false,
    inkShift: [1, 1.2],
    ...(symbol ? { texture: { seed: 14 }, contour: 0.8 } : {}),
    noDrop: !symbol,
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
      return composeSymbol({ autoCel: false, texture: { seed: 15 }, contour: 0.8, inkShift: [1, 1.2], noDrop: true, layers: cp.layers, top: cp.top, transform: CAP_T });
    }
    case 'eyeWhite':
      return svgDoc(eyeWhiteArt(EYE_L));
    case 'pupil':
      return svgDoc(pieEye(PUP_L, EYE_Y + 5, 9, 13.5));
    case 'lid':
      return paintDoc({ top: lidArt(EYE_L) });
    case 'lidHappy':
      return svgDoc(closedEye(EYE_L, EYE_Y + 4, 30, true));
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
    const x = 128 + s * (h.x ?? 100);
    const y = h.y ?? 200;
    const g = glove(h.pose).replace(/^<svg /, '<svg x="0" y="0" ');
    return `<g transform="translate(${x} ${y}) rotate(${s * h.rot}) scale(${side ? 0.34 : -0.34} .34) translate(-128 -220)">${g}</g>`;
  };
  const lines = p.squeak
    ? ([
        [[34, 74], [14, 58]],
        [[30, 98], [6, 96]],
        [[222, 74], [242, 58]],
        [[226, 98], [250, 96]],
      ] as V[][])
        .map((pp) => `<path d="${lens(pp, 3.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`)
        .join('')
    : '';
  // the head fills the box: scaled to leave a margin for the drop shadow and the hands
  return composeSymbol({
    autoCel: false,
    texture: { seed: 9 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [{ fills: '' }],
    top: `<g transform="translate(128 136) scale(.9) translate(-128 -128)">${head}</g>${hand(0)}${hand(1)}${lines}`,
  });
}

const RAT_POSES: Record<RatPose, SymPose> = {
  idle: { expr: 'idle' },
  blink: { expr: 'blink' },
  win: { expr: 'happy', cap: { dx: -3, dy: -2, rot: -6 }, hands: [{ pose: 'open', rot: 18 }, { pose: 'open', rot: 18 }] },
};

/** H1 symbol frames: idle / blink / win (cap popped, hands up). */
export const ratSymbol = (pose: RatPose) => ratArt(RAT_POSES[pose]);

/** Win loop: Rivets cheers, his cap popping off his head while he squeaks and waves. */
export const ratWinFrames: (() => string)[] = [
  () => ratArt({ expr: 'happy', cap: { dy: -3, rot: -6 }, hands: [{ pose: 'open', rot: 12 }, { pose: 'open', rot: 22 }] }),
  () => ratArt({ expr: 'squeak', cap: { dy: -9, rot: 12 }, hands: [{ pose: 'fist', rot: 30, y: 186 }, { pose: 'fist', rot: 30, y: 186 }], squeak: true }),
  () => ratArt({ expr: 'happy', cap: { dy: -4, rot: -8 }, hands: [{ pose: 'open', rot: 22 }, { pose: 'open', rot: 10 }] }),
  () => ratArt({ expr: 'squeak', cap: { dy: -3, rot: 4 }, hands: [{ pose: 'fist', rot: 24, y: 194 }, { pose: 'fist', rot: 24, y: 194 }], squeak: true }),
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
  const bodyF = celForm(body, { ...FUR, cut: [-12, -14], twist: -3, hatch: FUR.hatch, hatchGap: 5.5, seed: 51, inner: cel(belly, { ...MUZ, cut: [-9, -11], seed: 52 }) });
  const vl = celForm(vestL, { ...VEST, cut: [-9, -10], hatch: VEST.hatch, hatchGap: 5, seed: 53 });
  const vr = celForm(vestR, { ...VEST, cut: [-9, -10], hatch: VEST.hatch, hatchGap: 5, seed: 54 });
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
  const ff = celForm(d, { ...PINK, cut: [-8, -9], hatch: PINK.hatch, hatchGap: 4.5, seed: side === 'L' ? 61 : 62 });
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
