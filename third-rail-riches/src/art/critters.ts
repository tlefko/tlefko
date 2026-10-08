/**
 * High-pay symbols for Third Rail Riches (docs/ART.md): the regulars of the Third Rail Line.
 * A city pigeon (purple-grey, iridescent neck), a scruffy orange alley cat (bent ear, bandage) and
 * Officer Bulldog (tan, navy police cap with a gold badge). Each head has idle, blink and win
 * poses plus a 4-frame cheering win loop; every frame shares the 256 viewBox and anchor.
 */
import { C, composeSymbol, pieEye, closedEye, nextId, brow, cel, celForm, celTones, GOLD_TONES, shine, mix } from './kit';
import { type V, P, add, dir, taper, sparkle, lens, mirrorX } from './geo';

export type Pose = 'idle' | 'blink' | 'win';

/* ------------------------------------------------------------------ */
/* Shared face parts                                                   */
/* ------------------------------------------------------------------ */
const tones = celTones;
const PAINT = { autoCel: false, contour: 0.8, inkShift: [1, 1.2] as [number, number] };
const FIT = 'translate(128 132) scale(.92) translate(-128 -132)';

const ell = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;

/** Toothy open mouth: dark inside, a white teeth band on top and a tongue, all clipped. */
function mouth(path: string, teethY: number, tongue: [number, number, number, number], sw = 7) {
  const id = nextId('mo');
  return `<clipPath id="${id}"><path d="${path}"/></clipPath>
    <path d="${path}" fill="${C.crimsonDeep}"/>
    <g clip-path="url(#${id})">
      <ellipse cx="${tongue[0]}" cy="${tongue[1]}" rx="${tongue[2]}" ry="${tongue[3]}" fill="${C.crimson}"/>
      <ellipse cx="${tongue[0] - tongue[2] * 0.3}" cy="${tongue[1] - tongue[3] * 0.35}" rx="${tongue[2] * 0.3}" ry="${tongue[3] * 0.22}" fill="${C.crimsonLight}" opacity=".7"/>
      ${teethY > 0 ? `<rect x="0" y="0" width="256" height="${teethY}" fill="${C.white}"/><path d="M0 ${teethY} L256 ${teethY}" stroke="${C.ink}" stroke-width="3.5"/>` : ''}
    </g>
    <path d="${path}" fill="none" stroke="${C.ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** An eye white with a cel crescent and its ink ring. */
function eyeWhite(cx: number, cy: number, rx: number, ry: number, sw = 6.5): string {
  const d = ell(cx, cy, rx, ry);
  return `${cel(d, { base: C.white, shade: C.paperWarm, cut: [-rx * 0.28, -ry * 0.3] })}<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${sw}"/>`;
}

/** A heavy lid over the top of an eye: skin-coloured, clipped to the eye, with an ink lid line (y0 left, y1 right). */
function lid(cx: number, cy: number, rx: number, ry: number, y0: number, y1: number, skin: string): string {
  const id = nextId('ld');
  return `<clipPath id="${id}"><path d="${ell(cx, cy, rx, ry)}"/></clipPath>
    <g clip-path="url(#${id})"><path d="M${cx - rx - 4} ${cy - ry - 4} L${cx + rx + 4} ${cy - ry - 4} L${cx + rx + 4} ${y1} L${cx - rx - 4} ${y0} Z" fill="${skin}"/></g>
    <path d="M${cx - rx + 1} ${y0 + (y1 - y0) * 0.02} L${cx + rx - 1} ${y1 - (y1 - y0) * 0.02}" stroke="${C.ink}" stroke-width="5.5" stroke-linecap="round"/>`;
}

type Eyes = 'open' | 'blink' | 'happy' | 'wide' | 'wink';

/** Pie eyes in a pair of whites, or closed / happy arcs, or a wink (left happy, right open). */
function eyePair(L: V, R: V, rx: number, ry: number, e: Eyes, skin: string, o: { look?: number; sw?: number; lidL?: number; lidR?: number } = {}): string {
  const look = o.look ?? 3;
  const sw = o.sw ?? 6.5;
  const open = (c: V, k = 1, lidD = 0) =>
    `${eyeWhite(c[0], c[1], rx * k, ry * k, sw)}${pieEye(c[0] + look, c[1] + ry * 0.24, rx * 0.46 * (e === 'wide' ? 0.9 : 1), ry * 0.56 * (e === 'wide' ? 0.9 : 1))}${
      lidD ? lid(c[0], c[1], rx * k, ry * k, c[1] - ry + lidD, c[1] - ry + lidD * 0.7, skin) : ''
    }`;
  const shutLid = (c: V) => `${cel(ell(c[0], c[1], rx, ry), { base: skin, shade: mix(skin, C.ink, 0.25), cut: [-rx * 0.3, -ry * 0.3] })}<path d="${ell(c[0], c[1], rx, ry)}" fill="none" stroke="${C.ink}" stroke-width="${sw}"/>`;
  if (e === 'open') return open(L, 1, o.lidL ?? 0) + open(R, 1, o.lidR ?? 0);
  if (e === 'wide') return open([L[0], L[1] - 3], 1.08) + open([R[0], R[1] - 3], 1.08);
  if (e === 'blink') return `${shutLid(L)}${shutLid(R)}${closedEye(L[0], L[1] + ry * 0.2, rx * 1.4, false)}${closedEye(R[0], R[1] + ry * 0.2, rx * 1.4, false)}`;
  if (e === 'happy') return closedEye(L[0], L[1] + 2, rx * 1.55, true) + closedEye(R[0], R[1] + 2, rx * 1.55, true);
  return closedEye(L[0], L[1] + 2, rx * 1.55, true) + open(R, 1.04);
}

/** Paint `d` inside a cel form so it takes the form's cut shadow (for bands and patches in `inner`). */
function painted(formD: string, cut: V, d: string, base: string, shade: string, t = ''): string {
  const id = nextId('pm');
  const tt = t ? ` transform="${t}"` : '';
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="656" height="656"><path d="${formD}"${tt} fill="#fff"/><path d="${formD}" transform="translate(${cut[0]} ${cut[1]}) ${t}" fill="#000"/></mask>
    <path d="${d}"${tt} fill="${base}"/><path d="${d}"${tt} fill="${shade}" mask="url(#${id})"/>`;
}

/** Cheer dashes (white with ink) fanning out from `c`. */
const cheer = (c: V, angs: number[], r0: number, r1: number, w = 3.6) =>
  angs.map((a) => `<path d="${lens([add(c, dir(a), r0), add(c, dir(a), r1)], w)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`).join('');

/** A raised light-catching bump (feather tips, fur tufts). */
const bump = (x: number, y: number, r: number, light: string, shade: string) =>
  `<circle cx="${x + 1}" cy="${y + 1.3}" r="${r}" fill="${shade}"/><circle cx="${x}" cy="${y}" r="${r * 0.85}" fill="${light}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.28}" fill="${C.white}" opacity=".8"/>`;

/* ------------------------------------------------------------------ */
/* H4: the city pigeon (purple-grey, iridescent green neck)            */
/* ------------------------------------------------------------------ */
interface PigeonPose {
  eyes: Eyes;
  beak: 'shut' | 'open' | 'coo';
  /** Wing raise in degrees, or null with the wings tucked away. */
  wing: number | null;
  /** Head bob: squash down (units). */
  bob?: number;
  /** Chest puff (1 = rest). */
  puff?: number;
  burst?: boolean;
  twinkle?: V;
}

const PIGEON_BODY =
  'M128 36 C174 36 202 68 202 108 C202 130 196 144 188 156 C212 170 230 196 230 232 C202 244 160 248 128 248 C96 248 54 244 26 232 C26 196 44 170 68 156 C60 144 54 130 54 108 C54 68 82 36 128 36 Z';
/** Left wing, local space: shoulder at the origin, reaching up and left. */
const PIGEON_WING = 'M10 -4 C-14 -30 -58 -44 -86 -38 Q-98 -34 -92 -24 Q-100 -14 -88 -8 Q-94 4 -78 6 Q-80 18 -62 16 C-40 22 -12 18 10 10 Z';
const PIGEON_WING_BARS = ['M-70 -30 Q-60 -12 -44 4', 'M-50 -36 Q-38 -16 -22 0'];

function pigeonArt(p: PigeonPose): string {
  const T = tones(C.pigeon, C.pigeonDeep, C.pigeonLight);
  const NECK = tones(C.pigeonNeck, C.emeraldDeep, C.emeraldLight);
  const CHEST = { base: mix(C.pigeon, C.pigeonLight, 0.55), shade: mix(C.pigeon, C.pigeonDeep, 0.2) };
  const ORANGE = mix(C.fire, C.amber, 0.3);
  const bob = p.bob ?? 0;
  const puff = p.puff ?? 1;
  const bt = `translate(128 248) scale(${(puff + bob * 0.006).toFixed(3)} ${(1 - bob * 0.008).toFixed(3)}) translate(-128 -248)`;
  const cut: V = [-13, -15];

  const band = 'M20 150 Q128 196 236 150 L240 196 Q128 236 16 196 Z';
  const chest = `M10 186 Q32 194 48 192 Q60 206 76 202 Q90 214 106 208 Q118 218 128 212 Q138 218 150 208 Q166 214 180 202 Q196 206 208 192 Q224 194 246 186 L250 256 L6 256 Z`;
  const sheen = `${lens([[50, 170], [88, 184], [124, 188]], 4.5)} ${lens([[136, 186], [174, 180], [206, 166]], 3.6)}`;
  const featherMarks = [
    [[74, 222], [84, 228], [94, 224]],
    [[112, 230], [122, 236], [132, 232]],
    [[150, 226], [160, 232], [170, 226]],
    [[92, 240], [102, 245], [112, 242]],
    [[140, 242], [150, 246], [160, 242]],
  ]
    .map((pts) => `<path d="M${(pts as V[]).map(P).join(' Q')}" fill="none" stroke="${CHEST.shade}" stroke-width="3" stroke-linecap="round"/>`)
    .join('');
  const bodyF = celForm(PIGEON_BODY, {
    ...T,
    t: bt,
    cut,
    twist: -3,
    hatch: T.hatch,
    seed: 101,
    inner:
      painted(PIGEON_BODY, cut, band, NECK.base, NECK.shade, bt) +
      `<g transform="${bt}"><path d="${sheen}" fill="${mix(C.pink, C.pigeon, 0.25)}" opacity=".85"/></g>` +
      painted(PIGEON_BODY, cut, chest, CHEST.base, CHEST.shade, bt) +
      `<g transform="${bt}">${featherMarks}</g>`,
  });
  // a little cowlick of head feathers
  const tufts = [
    taper([[122, 42], [114, 24], [100, 14]], 7, 2.6, 12),
    taper([[132, 42], [136, 22], [148, 10]], 7.5, 2.6, 12),
  ].map((tt, i) => celForm(tt.d, { ...T, t: bt, cut: [-3, -4], seed: 102 + i }));
  // wings: raised in the cheer, pigeon-grey with the two black wing bars
  const wingT = (side: 0 | 1) => `translate(${side ? 200 : 56} 176) rotate(${side ? -(p.wing ?? 0) : p.wing ?? 0})`;
  const m0 = (d: string, side: 0 | 1) => (side ? mirrorX(d, 0) : d);
  const wings =
    p.wing === null
      ? []
      : ([0, 1] as const).map((side) =>
          celForm(m0(PIGEON_WING, side), {
            ...T,
            base: mix(C.pigeon, C.pigeonLight, 0.25),
            t: wingT(side),
            cut: [-6, -7],
            hatch: T.hatch,
            seed: 104 + side,
            inner: PIGEON_WING_BARS.map((d) => `<path d="${m0(d, side)}" transform="${wingT(side)}" stroke="${C.ink}" stroke-width="7" fill="none" stroke-linecap="round"/>`).join(''),
          }),
        );

  // eyes: orange rings round pie eyes
  const L: V = [94, 104];
  const R: V = [162, 104];
  const ring = (c: V) =>
    `${cel(ell(c[0], c[1], 25, 28), { base: ORANGE, shade: mix(ORANGE, C.fireDeep, 0.55), light: mix(ORANGE, C.amberLight, 0.6), cut: [-6, -7] })}<path d="${ell(c[0], c[1], 25, 28)}" fill="none" stroke="${C.ink}" stroke-width="6"/>`;
  const eyes = `${ring(L)}${ring(R)}${eyePair(L, R, 17, 20, p.eyes, ORANGE, { sw: 4.5, lidR: 0 })}`;
  const browArt = p.eyes === 'wide' ? brow(72, 66, 108, 70, -5, 4) + brow(146, 68, 184, 62, 5, 4) : brow(74, 72, 110, 76, -4, 3.8) + brow(144, 70, 184, 60, 6, 4);

  // beak: dark grey with the white cere on top; open for the coo
  const BEAK = { base: mix(C.g4, C.pigeonDeep, 0.35), shade: mix(C.g5, C.ink, 0.3), light: C.g3 };
  const upper = p.beak === 'shut' ? 'M114 122 C116 114 140 114 142 122 L134 152 Q128 160 122 152 Z' : 'M114 122 C116 114 140 114 142 122 L136 142 Q128 148 120 142 Z';
  const cere = 'M111 121 C110 108 146 108 145 121 C138 128 118 128 111 121 Z';
  const beakF = cel(upper, { ...BEAK, cut: [-5, -6] });
  const cereF = cel(cere, { base: C.g1, shade: C.g2, light: C.white, cut: [-4, -4] });
  const open = p.beak !== 'shut';
  const jaw = p.beak === 'open' ? 'M116 140 Q128 150 140 140 Q142 170 128 176 Q114 170 116 140 Z' : 'M120 142 Q128 148 136 142 Q137 160 128 164 Q119 160 120 142 Z';
  const lower = p.beak === 'open' ? 'M114 160 Q128 186 142 160 Q140 178 128 182 Q116 178 114 160 Z' : 'M119 154 Q128 170 137 154 Q136 166 128 168 Q120 166 119 154 Z';
  const beakArt = `${open ? mouth(jaw, 0, [128, p.beak === 'open' ? 170 : 162, 12, 7], 5) : ''}
    ${open ? `${cel(lower, { ...BEAK, cut: [-3, -3] })}<path d="${lower}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>` : ''}
    ${beakF}<path d="${upper}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
    ${cereF}<path d="${cere}" fill="none" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
    ${shine([[119, 130], [121, 138], [124, 146]], 1.8, 0.6)}`;
  const notes = p.beak === 'coo' ? cheer([128, 160], [-10, 10, 170, 190], 40, 58, 3) : '';
  const burst = p.burst ? cheer([128, 112], [-150, -120, -60, -30], 104, 122) : '';
  const tw = p.twinkle ?? [214, 40];

  return composeSymbol({
    ...PAINT,
    texture: { seed: 31 },
    transform: FIT,
    layers: [
      ...(wings.length ? [{ fills: wings.map((w) => w.fills).join(''), lines: wings.map((w) => w.line('stroke-width="6.5"')).join('') }] : []),
      { fills: tufts.map((f) => f.fills).join(''), lines: tufts.map((f) => f.line('stroke-width="5.5"')).join('') },
      { fills: bodyF.fills, lines: bodyF.line() },
    ],
    top: `<g transform="${bt}">
      ${shine([[66, 102], [74, 74], [96, 54], [122, 46]], 3.4, 0.6)}
      ${shine([[48, 196], [64, 178], [86, 172]], 2.4, 0.55)}
      <ellipse cx="68" cy="146" rx="13" ry="7" fill="${C.pinkLight}" opacity=".45"/><ellipse cx="188" cy="146" rx="13" ry="7" fill="${C.pinkLight}" opacity=".45"/>
      ${eyes}${browArt}${beakArt}</g>${notes}${burst}${sparkle(tw[0], tw[1], 11, C.white, 0.9)}`,
  });
}

const PIGEON: Record<Pose, PigeonPose> = {
  idle: { eyes: 'open', beak: 'shut', wing: null },
  blink: { eyes: 'blink', beak: 'shut', wing: null },
  win: { eyes: 'happy', beak: 'open', wing: 40 },
};

export function pigeonHead(pose: Pose = 'idle'): string {
  return pigeonArt(PIGEON[pose]);
}

/** Pigeon win loop: wings up with a coo, a head-bob, a winking flap, and a proud puffed chest. */
export const pigeonWinFrames: (() => string)[] = [
  () => pigeonArt({ eyes: 'happy', beak: 'open', wing: 46, puff: 1.03, burst: true, twinkle: [36, 44] }),
  () => pigeonArt({ eyes: 'wide', beak: 'coo', wing: 6, bob: 8, twinkle: [214, 52] }),
  () => pigeonArt({ eyes: 'wink', beak: 'open', wing: 58, puff: 1.05, burst: true, twinkle: [40, 60] }),
  () => pigeonArt({ eyes: 'happy', beak: 'coo', wing: 22, puff: 1.02, twinkle: [212, 40] }),
];

/* ------------------------------------------------------------------ */
/* H3: the alley cat (orange tabby, bent ear, bandage)                 */
/* ------------------------------------------------------------------ */
interface CatPose {
  eyes: Eyes;
  mouth: 'grin' | 'laugh' | 'tongue';
  /** The bent ear springs straight up (the cheer). */
  earUp?: boolean;
  /** Head tilt (degrees). */
  tilt?: number;
  burst?: boolean;
  twinkle?: V;
}

const CAT_HEAD =
  'M128 70 C168 70 198 88 208 118 L224 126 L212 138 L232 148 L214 158 L228 174 L206 180 C196 214 166 234 128 234 C90 234 60 214 50 180 L28 174 L42 158 L24 148 L44 138 L32 126 L48 118 C58 88 88 70 128 70 Z';
const CAT_EAR_L = 'M46 130 L50 82 L62 76 L52 66 L56 30 Q58 22 66 26 L122 78 Z';
const CAT_EAR_L_IN = 'M64 112 L64 46 L104 84 Z';
const CAT_EAR_R_UP = mirrorX('M46 130 L56 30 Q58 22 66 26 L122 78 Z');
const CAT_EAR_R_IN_UP = mirrorX(CAT_EAR_L_IN);
/** The bent ear: it stands to a crease, then the tip flops over to the side. */
const CAT_EAR_R = 'M134 78 L184 46 Q190 44 194 48 L212 130 Z';
const CAT_EAR_R_IN = 'M150 84 L186 58 L198 112 Z';
const CAT_EAR_FLAP = 'M180 50 Q190 40 200 48 L238 82 Q240 92 230 92 L196 80 Z';
const CAT_TUFT = 'M104 80 L108 60 L118 72 L126 52 L134 70 L146 58 L150 80 Z';

function catArt(p: CatPose): string {
  const T = tones(C.cat, C.catDeep, C.catLight);
  const PINK = { base: C.ratPink, shade: mix(C.ratPink, C.pinkDeep, 0.45) };
  const CREAM = { base: C.cream, shade: mix(C.cream, C.catLight, 0.7), light: C.white };
  const stripe = mix(C.catDeep, C.ink, 0.15);
  const cut: V = [-12, -14];
  const ht = `rotate(${p.tilt ?? 0} 128 234)`;

  const earL = celForm(CAT_EAR_L, { ...T, t: ht, cut: [-7, -9], hatch: T.hatch, seed: 111, inner: painted(CAT_EAR_L, [-7, -9], CAT_EAR_L_IN, PINK.base, PINK.shade, ht) });
  const earR = p.earUp
    ? celForm(CAT_EAR_R_UP, { ...T, t: ht, cut: [-7, -9], hatch: T.hatch, seed: 112, inner: painted(CAT_EAR_R_UP, [-7, -9], CAT_EAR_R_IN_UP, PINK.base, PINK.shade, ht) })
    : celForm(CAT_EAR_R, { ...T, t: ht, cut: [-7, -9], hatch: T.hatch, seed: 112, inner: painted(CAT_EAR_R, [-7, -9], CAT_EAR_R_IN, PINK.base, PINK.shade, ht) });
  const flap = celForm(CAT_EAR_FLAP, { ...T, base: mix(C.cat, C.catDeep, 0.2), t: ht, cut: [-4, -5], seed: 113, inner: `<path d="M196 56 L230 84" transform="${ht}" stroke="${T.light}" stroke-width="3" stroke-linecap="round"/>` });
  const tuft = celForm(CAT_TUFT, { ...T, t: ht, cut: [-4, -5], seed: 114 });

  // tabby stripes: an M on the brow, bars on the cheeks
  const st = (pts: V[], w: number) => `<path d="${lens(pts, w)}" fill="${stripe}"/>`;
  const stripes = `<g transform="${ht}">
      ${st([[128, 74], [129, 90], [127, 106]], 5)}${st([[108, 78], [111, 92], [116, 102]], 4)}${st([[148, 78], [145, 92], [140, 102]], 4)}
      ${st([[88, 88], [94, 96], [98, 104]], 3)}${st([[168, 88], [162, 96], [158, 104]], 3)}
      ${st([[34, 150], [50, 152], [66, 158]], 3.6)}${st([[40, 166], [54, 168], [68, 172]], 3)}
      ${st([[222, 150], [206, 152], [192, 158]], 3.6)}
      ${st([[196, 104], [204, 114], [208, 124]], 3.2)}${st([[60, 104], [52, 114], [48, 124]], 3.2)}
    </g>`;
  const muzzle = 'M128 170 C114 156 82 158 82 180 C82 202 108 208 128 196 C148 208 174 202 174 180 C174 158 142 156 128 170 Z';
  const chin = 'M104 206 Q128 226 152 206 Q146 228 128 230 Q110 228 104 206 Z';
  const headF = celForm(CAT_HEAD, {
    ...T,
    t: ht,
    cut,
    twist: -3,
    hatch: T.hatch,
    seed: 115,
    inner: painted(CAT_HEAD, cut, chin, CREAM.base, CREAM.shade, ht),
  });
  const muzzleF = celForm(muzzle, { ...CREAM, t: ht, cut: [-7, -8], band: [3, 3], seed: 116 });

  const L: V = [96, 128];
  const R: V = [160, 128];
  const eyes = eyePair(L, R, 18, 21, p.eyes, C.cat, { lidL: 14, lidR: 9, look: 4 });
  const nose = 'M116 160 Q128 152 140 160 Q136 170 128 173 Q120 170 116 160 Z';
  const m =
    p.mouth === 'laugh'
      ? mouth('M98 184 Q128 200 158 184 Q154 226 128 228 Q102 226 98 184 Z', 195, [128, 222, 18, 10])
      : p.mouth === 'tongue'
        ? `${mouth('M102 186 Q128 200 154 184 Q150 210 128 212 Q106 210 102 186 Z', 194, [128, 212, 14, 6])}
           <path d="M120 206 Q118 228 132 230 Q146 228 142 204 Z" fill="${C.pink}" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/><path d="M131 210 L131 222" stroke="${C.pinkDeep}" stroke-width="2.4" stroke-linecap="round"/>`
        : `${mouth('M98 184 Q128 198 160 180 Q154 212 128 214 Q104 212 98 184 Z', 194, [128, 214, 16, 7])}
           <path d="M138 194 L141 206 L145 193 Z" fill="${C.white}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const whisk = (side: -1 | 1) =>
    ([
      [[100, 182], [68, 174], [30, 178]],
      [[102, 190], [68, 192], [34, 202]],
    ] as V[][])
      .map((pts) => pts.map(([x, y]): V => [side < 0 ? x : 256 - x, y]))
      .map(([a, b, c]) => `<path d="M${P(a)} Q${P(b)} ${P(c)}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`)
      .join('');
  // bandage cross on the right cheek
  const strip = (rot: number) =>
    `<g transform="rotate(${rot} 186 148)"><rect x="166" y="141" width="40" height="14" rx="4" fill="${C.paperWarm}" stroke="${C.ink}" stroke-width="3.6"/><rect x="180" y="142.5" width="12" height="11" fill="${mix(C.paperWarm, C.tileDeep, 0.45)}"/>
      <circle cx="172" cy="145.5" r="1.1" fill="${C.tileDeep}"/><circle cx="172" cy="150.5" r="1.1" fill="${C.tileDeep}"/><circle cx="200" cy="145.5" r="1.1" fill="${C.tileDeep}"/><circle cx="200" cy="150.5" r="1.1" fill="${C.tileDeep}"/></g>`;
  const bandage = `${strip(38)}${strip(-38)}`;
  const browArt = p.eyes === 'wide' ? brow(76, 96, 112, 100, -5, 4.2) + brow(144, 100, 180, 94, -5, 4.2) : brow(78, 104, 114, 108, -2, 4.2) + brow(142, 106, 178, 98, -6, 4.2);
  const burst = p.burst ? cheer([128, 128], [-160, -130, -50, -20], 108, 126) : '';
  const tw = p.twinkle ?? [40, 40];

  return composeSymbol({
    ...PAINT,
    texture: { seed: 32 },
    transform: FIT,
    layers: [
      { fills: earL.fills + earR.fills, lines: earL.line() + earR.line() },
      ...(p.earUp ? [] : [{ fills: flap.fills, lines: flap.line('stroke-width="6.5"') }]),
      { fills: tuft.fills, lines: tuft.line('stroke-width="6"') },
      { fills: headF.fills, lines: headF.line() },
    ],
    top: `${stripes}<g transform="${ht}">
      ${shine([[60, 120], [72, 98], [94, 82], [116, 76]], 3.2, 0.6)}
      ${muzzleF.fills}<path d="${muzzle}" fill="none" stroke="${C.ink}" stroke-width="5.5"/>
      ${bump(104, 176, 2.2, C.white, CREAM.shade)}${bump(96, 184, 2, C.white, CREAM.shade)}${bump(152, 176, 2.2, C.white, CREAM.shade)}${bump(160, 184, 2, C.white, CREAM.shade)}
      ${whisk(-1)}${whisk(1)}
      ${m}
      ${cel(nose, { ...PINK, cut: [-4, -4] })}<path d="${nose}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
      <path d="${lens([[122, 158], [128, 156], [134, 158]], 1.6)}" fill="${C.white}" opacity=".8"/>
      ${eyes}${browArt}${bandage}
      <ellipse cx="70" cy="174" rx="11" ry="6" fill="${C.crimson}" opacity=".25"/></g>${burst}${sparkle(tw[0], tw[1], 11, C.white, 0.9)}`,
  });
}

const CAT: Record<Pose, CatPose> = {
  idle: { eyes: 'open', mouth: 'grin' },
  blink: { eyes: 'blink', mouth: 'grin' },
  win: { eyes: 'happy', mouth: 'laugh', earUp: true },
};

export function catHead(pose: Pose = 'idle'): string {
  return catArt(CAT[pose]);
}

/** Cat win loop: a belly laugh as the bent ear springs up, a cheeky wink with the tongue out, laugh, grin. */
export const catWinFrames: (() => string)[] = [
  () => catArt({ eyes: 'happy', mouth: 'laugh', earUp: true, tilt: -5, burst: true, twinkle: [218, 44] }),
  () => catArt({ eyes: 'wink', mouth: 'tongue', tilt: 4, twinkle: [36, 52] }),
  () => catArt({ eyes: 'wide', mouth: 'laugh', earUp: true, tilt: -3, burst: true, twinkle: [214, 60] }),
  () => catArt({ eyes: 'happy', mouth: 'grin', tilt: 5, twinkle: [40, 40] }),
];

/* ------------------------------------------------------------------ */
/* H2: Officer Bulldog (tan, navy police cap with a gold badge)        */
/* ------------------------------------------------------------------ */
interface DogPose {
  eyes: Eyes;
  mouth: 'grump' | 'laugh' | 'whistle';
  /** Cap lift (units) and extra tilt (degrees): the hat-tip cheer. */
  cap?: number;
  capTilt?: number;
  burst?: boolean;
  twinkle?: V;
}

const DOG_FACE =
  'M128 84 C178 84 216 106 222 148 C228 176 222 202 208 218 C194 234 168 240 128 240 C88 240 62 234 48 218 C34 202 28 176 34 148 C40 106 78 84 128 84 Z';
const DOG_EAR = 'M46 126 C28 112 10 120 6 142 C18 140 30 146 38 160 Z';
const DOG_MUZZLE = 'M64 172 C64 148 192 148 192 172 C196 216 172 242 128 242 C84 242 60 216 64 172 Z';
const DOG_JOWL = 'M128 172 C106 166 72 168 64 192 C58 212 80 224 102 218 C116 214 124 202 128 192 Z';
const DOG_JAW = 'M78 204 C72 242 184 242 178 204 C160 218 96 218 78 204 Z';
const DOG_FANG = 'M90 214 L96 186 L106 212 Z';
const DOG_NOSE = 'M104 160 C104 146 152 146 152 160 C152 174 140 182 128 182 C116 182 104 174 104 160 Z';
const CAP_CROWN = 'M40 98 C30 58 76 22 128 20 C180 22 226 58 216 98 Q128 84 40 98 Z';
const CAP_BAND = 'M44 94 Q128 80 212 94 L210 114 Q128 100 46 114 Z';
const CAP_VISOR = 'M46 110 Q128 96 210 110 C212 124 184 134 128 134 C72 134 44 124 46 110 Z';
const BADGE = 'M128 40 L148 47 Q149 72 128 84 Q107 72 108 47 Z';

function dogArt(p: DogPose): string {
  const T = tones(C.dog, C.dogDeep, C.dogLight);
  const LITE = { base: C.dogLight, shade: mix(C.dogLight, C.dog, 0.75) };
  const COP = tones(C.cop, C.copDeep, C.copLight);
  const cut: V = [-12, -14];
  const capT = `translate(0 ${-(p.cap ?? 0)}) rotate(${-6 + (p.capTilt ?? 0)} 128 110)`;
  const laugh = p.mouth === 'laugh';
  const jawT = laugh ? 'translate(0 9)' : '';

  const ears = [DOG_EAR, mirrorX(DOG_EAR)].map((d, i) => celForm(d, { base: mix(C.dog, C.dogDeep, 0.35), shade: T.shade, cut: [-5, -6], seed: 121 + i }));
  const faceF = celForm(DOG_FACE, {
    ...T,
    cut,
    twist: -3,
    hatch: T.hatch,
    seed: 123,
    inner: painted(DOG_FACE, cut, `${DOG_MUZZLE} M114 96 Q128 92 142 96 L146 152 Q128 158 110 152 Z`, LITE.base, LITE.shade),
  });
  const jawF = celForm(DOG_JAW, { ...T, base: mix(C.dog, C.dogLight, 0.35), t: jawT || undefined, cut: [-7, -8], hatch: T.hatch, seed: 124 });
  const jowls = [DOG_JOWL, mirrorX(DOG_JOWL)].map((d, i) => celForm(d, { base: C.dogLight, shade: LITE.shade, light: C.cream, cut: [-7, -8], band: [3, 3], seed: 125 + i }));
  const fangs = [DOG_FANG, mirrorX(DOG_FANG)].map((d) => `<path d="${d}" ${jawT ? `transform="${jawT}"` : ''} fill="${C.white}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`).join('');
  const crownF = celForm(CAP_CROWN, { ...COP, t: capT, cut: [-11, -12], hatch: COP.hatch, seed: 127 });
  const bandF = celForm(CAP_BAND, { base: C.copDeep, shade: mix(C.copDeep, C.ink, 0.4), t: capT, cut: [-6, -5], seed: 128, inner: `<path d="M46 98 Q128 84 210 98" transform="${capT}" stroke="${C.gold}" stroke-width="3" fill="none"/>` });
  const visorF = celForm(CAP_VISOR, { base: C.iron, shade: C.ironDeep, light: C.ironLight, t: capT, cut: [-8, -7], band: [3, 3], seed: 129 });
  const badgeF = celForm(BADGE, {
    ...GOLD_TONES,
    t: capT,
    cut: [-5, -6],
    seed: 130,
    inner: `<path d="M128 50 L131.5 59 L141 59 L133.5 65 L136.5 74 L128 68.5 L119.5 74 L122.5 65 L115 59 L124.5 59 Z" transform="${capT}" fill="${C.goldDeep}"/>`,
  });

  const L: V = [96, 146];
  const R: V = [160, 146];
  const eyes = eyePair(L, R, 15, 17, p.eyes, C.dog, { lidL: 7, lidR: 7, sw: 6 });
  const bags = p.eyes === 'open' || p.eyes === 'wide' ? `<path d="M82 164 Q96 172 110 164 M146 164 Q160 172 174 164" stroke="${T.hatch}" stroke-width="3" fill="none" stroke-linecap="round"/>` : '';
  const brows = p.eyes === 'wide' ? brow(74, 124, 112, 126, -5, 4.6) + brow(144, 126, 182, 124, -5, 4.6) : brow(76, 126, 114, 134, -2, 4.8) + brow(180, 126, 142, 134, 2, 4.8);
  const mouthIn = laugh ? mouth('M70 192 Q128 214 186 192 L184 216 Q128 236 72 216 Z', 0, [128, 222, 34, 12]) : '';
  const whistle = p.mouth === 'whistle';
  const whistleArt = whistle
    ? `<g transform="rotate(-14 160 206)">
        <path d="M148 200 L184 200 L184 214 L148 214 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
        <circle cx="192" cy="212" r="13" fill="${C.gold}" stroke="${C.ink}" stroke-width="4.5"/>
        <circle cx="194" cy="214" r="5" fill="${C.goldDeep}"/>
        <path d="M152 203 L180 203" stroke="${C.goldLight}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M184 206 Q188 201 194 201" stroke="${C.goldLight}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      </g>${cheer([214, 196], [-60, -20, 20], 18, 36)}`
    : '';
  const burst = p.burst ? cheer([128, 70 - (p.cap ?? 0)], [-160, -130, -50, -20], 96, 114) : '';
  const tw = p.twinkle ?? [218, 52];

  return composeSymbol({
    ...PAINT,
    texture: { seed: 33 },
    transform: FIT,
    layers: [
      { fills: ears.map((e) => e.fills).join(''), lines: ears.map((e) => e.line('stroke-width="6.5"')).join('') },
      { fills: faceF.fills, lines: faceF.line() },
      { fills: mouthIn, lines: '' },
      { fills: jawF.fills, lines: jawF.line() },
      { fills: fangs + jowls.map((j) => j.fills).join(''), lines: jowls.map((j) => j.line('stroke-width="6.5"')).join('') },
      { fills: crownF.fills + bandF.fills, lines: crownF.line() + bandF.line('stroke-width="5"') },
      { fills: visorF.fills + badgeF.fills, lines: visorF.line() + badgeF.line('stroke-width="4.5"') },
    ],
    top: `
      ${fangs.replace(/fill="[^"]+" stroke/g, `fill="${C.white}" stroke`)}
      <path d="M100 140 Q96 132 100 126" stroke="none"/>
      ${eyes}${bags}${brows}
      <path d="M108 142 Q128 134 148 142" stroke="${T.hatch}" stroke-width="3" fill="none" stroke-linecap="round"/>
      ${cel(DOG_NOSE, { base: C.inkSoft, shade: C.ink, light: C.g4, cut: [-5, -6] })}<path d="${DOG_NOSE}" fill="none" stroke="${C.ink}" stroke-width="5"/>
      <ellipse cx="117" cy="168" rx="5" ry="3.4" fill="${C.ink}"/><ellipse cx="139" cy="168" rx="5" ry="3.4" fill="${C.ink}"/>
      ${shine([[114, 156], [124, 151], [136, 151]], 3, 0.7)}
      ${[[84, 196], [92, 204], [80, 206], [172, 196], [164, 204], [176, 206]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="${T.hatch}"/>`).join('')}
      ${whistleArt}
      <g transform="${capT}">
        ${shine([[56, 82], [64, 56], [90, 36], [116, 28]], 3.4, 0.55)}
        ${shine([[66, 120], [100, 114], [140, 112]], 2.6, 0.55)}
        <circle cx="122" cy="52" r="2.6" fill="${C.white}" opacity=".9"/>
      </g>
      ${burst}${sparkle(tw[0], tw[1], 11, C.white, 0.9)}`,
  });
}

const DOG: Record<Pose, DogPose> = {
  idle: { eyes: 'open', mouth: 'grump' },
  blink: { eyes: 'blink', mouth: 'grump' },
  win: { eyes: 'happy', mouth: 'laugh', cap: 8, capTilt: -6 },
};

export function bulldogHead(pose: Pose = 'idle'): string {
  return dogArt(DOG[pose]);
}

/** Bulldog win loop: a jowly laugh, a blast on the whistle, the cap tipped up off his head, a wink. */
export const bulldogWinFrames: (() => string)[] = [
  () => dogArt({ eyes: 'happy', mouth: 'laugh', cap: 4, twinkle: [36, 48] }),
  () => dogArt({ eyes: 'happy', mouth: 'whistle', twinkle: [40, 60] }),
  () => dogArt({ eyes: 'wide', mouth: 'laugh', cap: 18, capTilt: -12, burst: true, twinkle: [222, 40] }),
  () => dogArt({ eyes: 'wink', mouth: 'grump', cap: 6, capTilt: 4, twinkle: [218, 52] }),
];
