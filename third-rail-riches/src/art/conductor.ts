/**
 * Conductor Casey: the hero, and his head doubles as the TOP paying symbol. A stocky, jolly 1930s
 * subway conductor: a squat navy pillbox cap with a crisp patent-leather peak, a gold chin cord and
 * a brass winged badge; big pie eyes under bold silver brows; a round ruddy nose; a BIG silver
 * handlebar moustache in two sculpted wings that curl up at the tips; tidy mutton-chop sideburns.
 * 256x256 viewBox for every part.
 *
 * Paint (cast/paint.ts): three flat cel values per material (base, a cut shadow on the lower
 * right, a light band upper left), a thin warm rim light inside the shadow edge, bold ink weighted
 * to the lower right, a light gouache grain. No hatching and no noise anywhere on him: every read
 * comes from shape and value.
 *
 * `conductorHead()` is the whole head (symbol, title cards). `conductorRigPart()` cuts the same
 * drawing into the layers the rig animates (face, cheeks, cap, eyes, lids, brows, the two moustache
 * wings, the nose, mouths); each is cropped to its own box but keeps the head's 256 coordinates, so
 * the rig stacks them back into exactly this head (see render/characters/Conductor.ts).
 */
import { C, composeSymbol, nextId, mix, scallops } from './kit';
import { form, formLine, tones, brush, ellipse, circle, glint, inked, piePupil } from './cast/paint';
import { sparkle, type V } from './geo';

/** Head expressions. The first seven are the originals; cheer, worried and watch were added. */
export type ConductorExpr = 'idle' | 'blink' | 'laugh' | 'pray' | 'shock' | 'smug' | 'whistle' | 'cheer' | 'worried' | 'watch';

/* --------------------------------- palette --------------------------------- */
const SKIN = tones(C.skin, C.skinDeep, C.skinLight, C.amber, 0.5);
const NOSE_T = { ...tones(mix(C.skin, C.crimsonLight, 0.5), mix(C.skinDeep, C.crimson, 0.4), C.skinLight, C.amber, 0.55) };
/** Silver hair: near-white, a clean cool shadow, pure white light, warm rim. */
const SILVER = { base: mix(C.white, C.steelLight, 0.72), shade: mix(C.steelLight, C.steel, 0.62), light: '#ffffff', rim: mix(C.steelLight, C.amberLight, 0.55) };
const NAVY = { ...tones(C.uniform, C.uniformDeep, C.uniformLight, C.amber, 0.62), light: mix(C.uniform, C.uniformLight, 0.55), rim: mix(mix(C.uniform, C.uniformDeep, 0.62), C.volt, 0.24) };
const NAVY_TOP = { base: mix(C.uniform, C.uniformLight, 0.42), shade: C.uniform, light: mix(C.uniformLight, C.white, 0.15) };
const BAND_T = { base: mix(C.uniform, C.uniformDeep, 0.6), shade: mix(C.uniformDeep, C.ink, 0.35), light: mix(C.uniform, C.uniformLight, 0.25), rim: mix(C.uniformDeep, C.volt, 0.3) };
const PEAK_T = { base: mix(C.inkSoft, C.uniformDeep, 0.35), shade: C.ink, light: mix(C.inkSoft, C.uniformLight, 0.5), rim: mix(C.ink, C.volt, 0.32) };
const GOLD = { base: C.gold, shade: mix(C.gold, C.goldDeep, 0.6), light: mix(C.gold, C.goldLight, 0.75), rim: mix(C.goldDeep, C.amberLight, 0.4) };
const MOUTH_IN = mix(C.crimsonDeep, C.ink, 0.45);
const TONGUE = mix(C.crimson, C.crimsonLight, 0.4);

/* ---------------------------------- shapes ---------------------------------- */
/** Head + face in one form: wide jolly jowls, the bald dome runs up under the cap (seen when he doffs it). */
const FACE =
  'M128 64 C170 64 196 84 200 116 C206 142 214 170 210 198 C205 230 172 248 128 248 C84 248 51 230 46 198 C42 170 50 142 56 116 C60 84 86 64 128 64 Z';
/** Cap crown: a squat pillbox, flaring a touch to its flat top (seen from just above). */
const CROWN = 'M62 82 C57 66 52 52 51 42 C50 30 86 23 128 23 C170 23 206 30 205 42 C204 52 199 66 194 82 Z';
const CROWN_TOP = 'M51 42 C50 30 86 23 128 23 C170 23 206 30 205 42 C204 37 170 34 128 34 C86 34 52 37 51 42 Z';
const BAND = 'M56 62 Q128 78 200 62 L197 84 Q128 100 59 84 Z';
/** The patent-leather peak, curving down toward the viewer. */
const PEAK = 'M53 83 Q128 99 203 83 C211 94 199 109 170 113 Q128 119 86 113 C57 109 45 94 53 83 Z';
const CORD = 'M68 90 Q128 104 188 90';
/** The peak's shadow on the forehead (clipped to the face, under the peak). */
const PEAK_SHADOW = 'M48 92 C58 116 88 121 128 125 C168 121 198 116 208 92 L208 80 L48 80 Z';
/** The cap's pivot: the back of the band (also the doff pivot). */
const CAP_PIV: [number, number] = [128, 92];
/** Jaunty tilt of the cap at rest (deg; positive tips it down to screen right). */
const CAP_TILT = 3;

const EYE_Y = 150;
const EYE_L = 104;
const EYE_R = 152;
const ERX = 18;
const ERY = 20.5;
/** The pupils' rest offset inside the whites (a hair low: looking at you). */
const PUP: [number, number] = [0, 3.5];
const PRX = 10.5;
const PRY = 13.5;

const NOSE: [number, number, number, number] = [128, 179, 21, 17];
const BROW_L = { x: 100, y: 120 };
const BROW_R = { x: 156, y: 120 };
/** Where each moustache wing hinges (its round root, under the nose). */
const TACHE_L: [number, number] = [115, 198];
const TACHE_R: [number, number] = [141, 198];
const MOUTH: [number, number] = [128, 220];

const mirrorPts = (pts: V[]): V[] => pts.map(([x, y]) => [256 - x, y] as V);
const rotPts = (pts: V[], deg: number, c: V): V[] => {
  const a = (deg * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  return pts.map(([x, y]) => [c[0] + (x - c[0]) * cs - (y - c[1]) * sn, c[1] + (x - c[0]) * sn + (y - c[1]) * cs] as V);
};

type Lay = { fills: string; lines: string };

/* ---------------------------------- badge ---------------------------------- */
/**
 * The cap badge: a brass medallion (navy enamel, a gold lightning bolt for the Third Rail Line)
 * with a swept gold wing either side. Centre (cx, cy), medallion radius r; the wings reach ~3.4r.
 */
export function wingedWheel(cx: number, cy: number, r: number): string {
  const k = r / 12;
  const X = (s: number, x: number) => (cx + s * x * r).toFixed(1);
  const Y = (y: number) => (cy + y * r).toFixed(1);
  const wing = (s: 1 | -1) => {
    const lobes: [number, number][] = [
      [3.35, -1.02],
      [2.72, -0.42],
      [2.02, 0.02],
      [1.3, 0.38],
      [0.78, 0.46],
    ].map(([x, y]) => [cx + s * x * r, cy + y * r]);
    return `M${X(s, 0.72)} ${Y(-0.58)} C${X(s, 1.4)} ${Y(-1.12)} ${X(s, 2.55)} ${Y(-1.3)} ${X(s, 3.35)} ${Y(-1.02)}${scallops(lobes, 0.3, s)} Z`;
  };
  const feathers = (s: 1 | -1) =>
    `M${X(s, 2.72)} ${Y(-0.42)} Q${X(s, 2.2)} ${Y(-0.62)} ${X(s, 1.7)} ${Y(-0.66)} M${X(s, 2.02)} ${Y(0.02)} Q${X(s, 1.55)} ${Y(-0.18)} ${X(s, 1.12)} ${Y(-0.22)}`;
  const bolt = [
    [-0.12, -0.56],
    [0.3, -0.56],
    [0.08, -0.12],
    [0.34, -0.12],
    [-0.22, 0.62],
    [-0.04, 0.08],
    [-0.32, 0.08],
  ]
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`)
    .join(' ');
  const wl = formLine(wing(-1), { ...GOLD, cut: [1.2 * k, -2.2 * k], band: [0.8 * k, 1 * k], rimCut: [-1.6 * k, -1.8 * k] });
  const wr = formLine(wing(1), { ...GOLD, cut: [-1.6 * k, -2.2 * k], band: [0.8 * k, 1 * k], rimCut: [-1.6 * k, -1.8 * k] });
  const med = formLine(circle(cx, cy, r), { ...GOLD, cut: [-2.4 * k, -2.8 * k], band: [1 * k, 1.2 * k], rimCut: [-2 * k, -2.2 * k] });
  return `<g>
    ${wl.fills}${wr.fills}
    <g fill="none" stroke="${C.ink}" stroke-width="${(2.8 * k).toFixed(2)}" stroke-linejoin="round" stroke-linecap="round">${wl.line()}${wr.line()}</g>
    <path d="${feathers(-1)} ${feathers(1)}" fill="none" stroke="${C.goldDeep}" stroke-width="${(1.5 * k).toFixed(2)}" stroke-linecap="round"/>
    ${med.fills}
    <circle cx="${cx}" cy="${cy}" r="${(r * 0.6).toFixed(2)}" fill="${mix(C.uniform, C.uniformLight, 0.35)}" stroke="${C.goldDeep}" stroke-width="${(1.4 * k).toFixed(2)}"/>
    <path d="${bolt} Z" fill="${C.goldLight}" stroke="${C.goldDeep}" stroke-width="${(0.9 * k).toFixed(2)}" stroke-linejoin="round"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.ink}" stroke-width="${(2.8 * k).toFixed(2)}"/>
    <path d="M${(cx - r * 0.72).toFixed(1)} ${(cy - r * 0.32).toFixed(1)} A${(r * 0.8).toFixed(1)} ${(r * 0.8).toFixed(1)} 0 0 1 ${(cx - r * 0.2).toFixed(1)} ${(cy - r * 0.78).toFixed(1)}" fill="none" stroke="#fff" stroke-width="${(1.5 * k).toFixed(2)}" stroke-linecap="round" opacity=".9"/>
  </g>`;
}

/* ---------------------------------- the cap ---------------------------------- */
function capBody(): string {
  const crown = formLine(CROWN, { ...NAVY, cut: [-11, -6], shrink: 0.97, band: [5, 4] });
  const top = formLine(CROWN_TOP, { ...NAVY_TOP, cut: [-6, -1], band: [3, 2] });
  const band = formLine(BAND, { ...BAND_T, cut: [-8, -5], band: [3, 2.5], rimCut: [-4, -4] });
  const peak = formLine(PEAK, { ...PEAK_T, cut: [-9, -7], band: [4, 4], rimCut: [-4, -5] });
  const trim = `
      ${glint([[58, 64], [54, 50], [56, 40], [66, 33]], 2.6, C.uniformLight, 0.7)}
      <path d="M58 63 Q128 79 198 63" fill="none" stroke="${C.goldDeep}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M58 62 Q128 78 198 62" fill="none" stroke="${C.gold}" stroke-width="2.2" stroke-linecap="round"/>
      ${glint([[72, 93], [98, 100], [128, 102]], 2.8, mix(C.uniformLight, C.white, 0.55), 0.8)}
      ${glint([[150, 102], [162, 101]], 1.4, mix(C.uniformLight, C.white, 0.4), 0.6)}
      <path d="${CORD}" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>
      <path d="${CORD}" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linecap="round"/>
      <path d="M74 90.5 Q100 97 124 98.5" fill="none" stroke="${C.goldLight}" stroke-width="1.5" stroke-linecap="round"/>
      ${[68, 188].map((x) => `<circle cx="${x}" cy="90" r="6" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x - 1.6}" cy="88.4" r="1.8" fill="#fff"/>`).join('')}
      ${wingedWheel(128, 54, 12)}`;
  return inked({ fills: crown.fills, lines: crown.line() }) + inked({ fills: top.fills, lines: '' }) + inked({ fills: band.fills, lines: band.line('stroke-width="6"') }) + inked({ fills: peak.fills, lines: peak.line() }) + trim;
}

/* ----------------------------------- face ----------------------------------- */
const EARS = (): Lay => {
  const l = formLine(circle(43, 140, 14), { ...SKIN, cut: [-5, -5] });
  const r = formLine(circle(213, 140, 14), { ...SKIN, cut: [-5, -5] });
  return { fills: l.fills + r.fills, lines: `${l.line()}${r.line()}<path d="M38 134 q8 3 6 13 M218 134 q-8 3 -6 13" stroke-width="3.5" opacity=".7"/>` };
};
const FACE_LAYER = (): Lay => {
  const f = formLine(FACE, { ...SKIN, cut: [-13, -12], twist: -3, band: [5, 6], rimCut: [-6, -6] });
  return { fills: f.fills, lines: f.line() };
};
/** Tidy silver tufts above the ears, poking out from under the cap (behind the face's edge). */
function tuftPath(flip: boolean): string {
  const m = (x: number) => (flip ? 256 - x : x);
  const pts: [number, number][] = [
    [64, 84],
    [50, 90],
    [43, 103],
    [44, 117],
    [52, 128],
  ].map(([x, y]) => [m(x), y]);
  return `M${pts[0][0]} ${pts[0][1]}${scallops(pts, 0.3, flip ? 1 : -1)} C${m(58)} 132 ${m(64)} 124 ${m(66)} 114 Z`;
}
const TUFTS = (): Lay => {
  const l = formLine(tuftPath(false), { ...SILVER, cut: [-4, -5], band: [2.5, 3], rimCut: [-4, -4] });
  const r = formLine(tuftPath(true), { ...SILVER, cut: [-4, -5], band: [2.5, 3], rimCut: [-4, -4] });
  return { fills: l.fills + r.fills, lines: `${l.line('stroke-width="6"')}${r.line('stroke-width="6"')}` };
};
const DOME_SHINE = glint([[92, 82], [108, 72], [128, 70]], 3.2, C.skinLight, 0.75);
const BLUSH = `<ellipse cx="80" cy="177" rx="15" ry="9" fill="${C.crimsonLight}" opacity=".48"/><ellipse cx="176" cy="177" rx="15" ry="9" fill="${C.crimsonLight}" opacity=".48"/>
  <circle cx="74" cy="173" r="2.6" fill="#fff" opacity=".75"/><circle cx="170" cy="173" r="2.6" fill="#fff" opacity=".75"/>`;
const SHADOW_UNDER_PEAK = (clip: string) => `<clipPath id="${clip}"><path d="${FACE}"/></clipPath><path d="${PEAK_SHADOW}" fill="${SKIN.shade}" opacity=".75" clip-path="url(#${clip})"/>`;

/** Puffed cheeks (blowing the whistle): two balloons over the face's sides. */
const PUFF_L = circle(72, 190, 27);
const PUFF_R = circle(184, 190, 27);
const CHEEKS = (): Lay => {
  const l = formLine(PUFF_L, { ...SKIN, cut: [-7, -7] });
  const r = formLine(PUFF_R, { ...SKIN, cut: [-7, -7] });
  return { fills: l.fills + r.fills, lines: l.line('stroke-width="6.5"') + r.line('stroke-width="6.5"') };
};
const CHEEK_TOP = `<ellipse cx="72" cy="186" rx="16" ry="10" fill="${C.crimsonLight}" opacity=".55"/><ellipse cx="184" cy="186" rx="16" ry="10" fill="${C.crimsonLight}" opacity=".55"/>
  ${glint([[54, 184], [58, 174], [68, 169]], 2.6, C.skinLight, 0.9)}${glint([[166, 182], [170, 172], [180, 168]], 2.6, C.skinLight, 0.9)}`;

/* ----------------------------------- eyes ----------------------------------- */
type EyeMode = 'open' | 'closed' | 'happy' | 'squeeze';
interface EyePose {
  mode: EyeMode;
  /** Pupil offset from the rest position (box units). */
  look?: [number, number];
  /** Eye size scale (shock widens). */
  size?: number;
  /** Pupil size scale. */
  pupil?: number;
  /** Upper lid: 0 open .. 1 shut, and its slant (deg; positive drops the inner corner, negative the outer). */
  lid?: number;
  slant?: number;
}
/** One eye. `x` its centre; `inner` +1 if the nose is to its right (the left eye), -1 otherwise. */
function eyeArt(x: number, inner: 1 | -1, p: EyePose): string {
  const y = EYE_Y;
  switch (p.mode) {
    case 'closed':
      return `<path d="M${x - 16} ${y + 2} Q${x} ${y + 13} ${x + 16} ${y + 2}" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round"/>
        <path d="M${x - inner * 16} ${y + 2} l${-inner * 5} -3" stroke="${C.ink}" stroke-width="4.5" stroke-linecap="round"/>`;
    case 'happy':
      // squeezed shut in a laugh: a fat upturned arc, the cheek pushing up beneath
      return `<path d="M${x - 16} ${y + 6} Q${x} ${y - 14} ${x + 16} ${y + 6}" fill="none" stroke="${C.ink}" stroke-width="7.5" stroke-linecap="round"/>
        <path d="M${x - 11} ${y + 17} Q${x} ${y + 12} ${x + 11} ${y + 17}" fill="none" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>`;
    case 'squeeze': {
      const s = inner;
      return `<path d="M${x - s * 14} ${y - 9} L${x + s * 10} ${y + 1} L${x - s * 14} ${y + 11}" fill="none" stroke="${C.ink}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'open': {
      const k = p.size ?? 1;
      const rx = ERX * k;
      const ry = ERY * k;
      const [lx, ly] = p.look ?? [0, 0];
      const pk = p.pupil ?? 1;
      const px = x + PUP[0] + lx;
      const py = y + PUP[1] + ly;
      const id = nextId('ce');
      const lid = p.lid ?? 0;
      let lidArt = '';
      if (lid > 0.01) {
        // a skin lid down to `lid` of the eye, its edge slanted; the lash line along its edge
        const ey = y - ry + lid * 2 * ry;
        const sl = Math.tan(((p.slant ?? 0) * Math.PI) / 180) * rx * inner;
        const a: V = [x - rx - 6, ey - sl];
        const b: V = [x + rx + 6, ey + sl];
        lidArt = `<path d="M${a[0]} ${a[1]} Q${x} ${ey - 5 * (1 - lid)} ${b[0]} ${b[1]} L${b[0]} ${y - ry - 8} L${a[0]} ${y - ry - 8} Z" fill="${SKIN.base}"/>
          <path d="M${a[0]} ${a[1]} Q${x} ${ey - 5 * (1 - lid)} ${b[0]} ${b[1]}" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round"/>`;
      }
      return `<clipPath id="${id}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/></clipPath>
        <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${C.white}"/>
        <g clip-path="url(#${id})">
          <path d="M${x - rx} ${y + ry * 0.45} Q${x} ${y + ry * 1.25} ${x + rx} ${y + ry * 0.45} L${x + rx} ${y + ry} L${x - rx} ${y + ry} Z" fill="${mix(C.white, C.steelLight, 0.7)}"/>
          ${pupilArt(px, py, pk)}
          ${lidArt}
        </g>
        <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${C.ink}" stroke-width="5.5"/>`;
    }
  }
}
/** A big pie-eye pupil (cast/paint.ts piePupil). */
function pupilArt(px: number, py: number, k = 1): string {
  return piePupil(px, py, PRX * k, PRY * k);
}

/* ---------------------------------- brows ---------------------------------- */
/** The left brow's spine (inner end first) round its centre; the right one is the mirror. */
const BROW_SPINE: V[] = [
  [121, 122],
  [111, 116.5],
  [99, 114.5],
  [88, 116],
  [79, 120.5],
];
/** Brow width: a soft inner end, fullest a third of the way out, tapering to a flicked tuft. */
const BROW_W = (t: number) => (t < 0.42 ? 5.2 + 3.2 * Math.sin(((t / 0.42) * Math.PI) / 2) : 2.2 + 6.2 * Math.pow(Math.max(0, Math.cos((((t - 0.42) / 0.58) * Math.PI) / 2)), 1.2));
/** A bold silver brow. `lift` (units, negative = up), `rot` (deg, positive drops the inner end), `arch` (scale of the arch). */
function browArt(side: 'L' | 'R', lift = 0, rot = 0, arch = 1): string {
  const c = BROW_L;
  // arch: scale the spine's offsets from the chord between its ends
  const [a, b] = [BROW_SPINE[0], BROW_SPINE[BROW_SPINE.length - 1]];
  let pts: V[] = BROW_SPINE.map(([x, y], i) => {
    const t = i / (BROW_SPINE.length - 1);
    const cy = a[1] + (b[1] - a[1]) * t;
    return [x, cy + (y - cy) * arch] as V;
  });
  // rotation: positive drops the inner end (clockwise for the left brow)
  pts = rotPts(pts, rot, [c.x, c.y]).map(([x, y]) => [x, y + lift] as V);
  if (side === 'R') pts = mirrorPts(pts);
  const d = brush(pts, BROW_W, 30);
  const f = formLine(d, { ...SILVER, cut: [-2.5, -3.5], band: [1.6, 2], rimCut: [-2.6, -3] });
  return inked({ fills: f.fills, lines: f.line('stroke-width="5"') }, 5);
}

/* -------------------------------- moustache -------------------------------- */
/** The right wing's spine (root under the nose, sweeping out and curling up at the tip). */
const WING_SPINE: V[] = [
  [141, 198],
  [160, 204],
  [182, 204],
  [200, 197],
  [213, 185],
  [218, 171],
  [214, 160],
  [205, 156],
  [198, 160],
];
const WING_W = (t: number) => 1.8 + 13.4 * Math.max(0, Math.cos((t * Math.PI) / 2));
/** One moustache wing, `up` degrees flipped up at the tip (negative droops). */
function wingArt(side: 'L' | 'R', up = 0): string {
  let pts = rotPts(WING_SPINE, -up, TACHE_R);
  if (side === 'L') pts = mirrorPts(pts);
  const d = brush(pts, WING_W, 44);
  const f = formLine(d, { ...SILVER, cut: [-4, -7.5], band: [2.6, 3.4], rimCut: [-4, -4.5] });
  // the cut highlight along the wing's top
  const sp = pts;
  const hl = glint([
    [sp[0][0] + (side === 'L' ? 4 : -4), sp[0][1] - 8],
    [sp[1][0], sp[1][1] - 8],
    [sp[2][0] + (side === 'L' ? 3 : -3), sp[2][1] - 7],
  ], 2.4, '#ffffff', 0.95);
  return inked({ fills: f.fills, lines: f.line('stroke-width="6"') }, 6.5) + hl;
}
function noseArt(): string {
  const [x, y, rx, ry] = NOSE;
  const f = formLine(ellipse(x, y, rx, ry), { ...NOSE_T, cut: [-6, -7], band: [2.5, 3], rimCut: [-4, -4] });
  return inked({ fills: f.fills, lines: f.line('stroke-width="6"') }, 6) + `<ellipse cx="${x - 7}" cy="${y - 6}" rx="6" ry="4" fill="#fff" opacity=".85" transform="rotate(-22 ${x - 7} ${y - 6})"/>`;
}

/* ---------------------------------- mouths ---------------------------------- */
/** Rig mouth shapes. Under the moustache: their top edge tucks under the wings. */
export type ConMouth = 'grin' | 'laugh' | 'pray' | 'shock' | 'smug' | 'whistle' | 'grit' | 'ooh';

const GRIN = 'M96 202 Q128 212 160 202 C160 226 148 240 128 240 C108 240 96 226 96 202 Z';
const LAUGH = 'M92 202 Q128 212 164 202 C165 230 150 246 128 246 C106 246 91 230 92 202 Z';
const GRIT = 'M100 206 Q128 212 156 206 L154 230 Q128 236 102 230 Z';

function openMouth(d: string, tongue: [number, number, number, number], teethTo: number, mid: string): string {
  const [tx, ty, trx, tryy] = tongue;
  return `
    <path d="${d}" fill="${MOUTH_IN}"/>
    <clipPath id="${mid}"><path d="${d}"/></clipPath>
    <g clip-path="url(#${mid})">
      <ellipse cx="${tx}" cy="${ty}" rx="${trx}" ry="${tryy}" fill="${TONGUE}"/>
      <path d="M${tx - trx * 0.5} ${ty - tryy * 0.45} Q${tx - 2} ${ty - tryy * 0.75} ${tx + trx * 0.2} ${ty - tryy * 0.5}" stroke="${C.crimsonLight}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M86 196 L170 196 L170 ${teethTo} Q128 ${teethTo + 7} 86 ${teethTo} Z" fill="${C.white}"/>
    </g>
    <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>`;
}

function mouthArt(m: ConMouth, mid: string): string {
  switch (m) {
    case 'grin':
      return openMouth(GRIN, [128, 240, 19, 10], 218, mid);
    case 'laugh':
      return openMouth(LAUGH, [128, 246, 24, 13], 214, mid);
    case 'pray':
      return `<path d="M110 228 Q119 220 128 228 Q137 236 146 228" stroke="${C.ink}" stroke-width="5.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'shock':
      return `<ellipse cx="128" cy="224" rx="13" ry="17" fill="${MOUTH_IN}" stroke="${C.ink}" stroke-width="5.5"/><path d="M119 236 Q128 230 137 236 Q133 240 128 240 Q123 240 119 236 Z" fill="${TONGUE}"/>`;
    case 'smug':
      return `<path d="M106 222 Q130 234 156 216" stroke="${C.ink}" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="M153 210 Q160 215 157 222" stroke="${C.ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    case 'whistle':
      // lips pursed round the whistle's mouthpiece
      return `<ellipse cx="128" cy="219" rx="11" ry="9.5" fill="${mix(C.skin, C.crimson, 0.38)}" stroke="${C.ink}" stroke-width="4.5"/><ellipse cx="128" cy="219" rx="4.5" ry="3.8" fill="${MOUTH_IN}"/>`;
    case 'grit':
      return `<path d="${GRIT}" fill="${MOUTH_IN}"/>
        <clipPath id="${mid}"><path d="${GRIT}"/></clipPath>
        <g clip-path="url(#${mid})">
          <path d="M90 200 L166 200 L166 219 Q128 224 90 219 Z" fill="${C.white}"/>
          <path d="M90 222 Q128 227 166 222 L166 240 L90 240 Z" fill="${mix(C.white, C.paperWarm, 0.6)}"/>
          <path d="M115 206 L115 232 M141 206 L141 232" stroke="${C.ink}" stroke-width="2.4" opacity=".6"/>
        </g>
        <path d="${GRIT}" fill="none" stroke="${C.ink}" stroke-width="5.5" stroke-linejoin="round"/>`;
    case 'ooh':
      return `<ellipse cx="128" cy="221" rx="8" ry="10" fill="${MOUTH_IN}" stroke="${C.ink}" stroke-width="4.5"/><ellipse cx="128" cy="226" rx="4.5" ry="2.6" fill="${TONGUE}"/>`;
  }
}

/** The whistle in his lips, for the head's own 'whistle' expression (the rig holds a separate one). */
const MOUTH_WHISTLE = `<g transform="translate(128 219) rotate(14)">
    <path d="M2 -4.5 L22 -5 L22 5 L2 4.5 Q-2 0 2 -4.5 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M18 -11 L42 -12 C52 -12 58 -4 57 4 C56 14 47 19 38 19 C28 19 20 12 19 3 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M24 -6 L44 -7" stroke="${C.goldLight}" stroke-width="3" stroke-linecap="round"/>
    <path d="M28 -12 L38 -12 L38 -6 L28 -6 Z" fill="${C.ink}"/>
    <path d="M38 6 A7 7 0 0 0 51 6" fill="none" stroke="${C.goldDeep}" stroke-width="2.4"/>
  </g>`;

/* --------------------------------- painting --------------------------------- */
/** The paint shared by every head raster: a light gouache grain (no mottled blotches on the silver), an outer contour, ink weighted lower right. */
const TEXTURE = { seed: 11, mottle: 0.28, grain: 0.32 };
const PAINT = { autoCel: false, texture: TEXTURE, contour: 0.8, inkShift: [1, 1.2] as [number, number] };
const grain = (body: string) => composeSymbol({ autoCel: false, texture: TEXTURE, inkShift: [1, 1.2], noDrop: true, layers: [{ fills: '' }], top: body });
/** Symbol framing: pulled in so the cap and moustache stay clear of the reel cell's edge. */
const SYMBOL_INSET = 'translate(128 129) scale(.94) translate(-128 -136)';

interface HeadPose {
  eyes: EyePose;
  /** Optional different right eye (asymmetric looks). */
  eyesR?: Partial<EyePose>;
  mouth: ConMouth;
  /** Brows per side: [lift, rot, arch]. */
  browL: [number, number, number];
  browR: [number, number, number];
  /** Moustache wing flip (deg up) per side. */
  tache: [number, number];
  puff?: boolean;
  /** Cap lift (units up) and extra tilt (deg). */
  capUp?: number;
  capTilt?: number;
  /** Whole head squash (y scale about the chin). */
  squash?: number;
  /** The cap off (doffed: the bald dome shows). */
  doff?: boolean;
}
const POSES: Record<ConductorExpr, HeadPose> = {
  idle: { eyes: { mode: 'open' }, mouth: 'grin', browL: [0, 0, 1], browR: [-3, -3, 1.1], tache: [0, 2] },
  blink: { eyes: { mode: 'closed' }, mouth: 'grin', browL: [2, 0, 1], browR: [2, 0, 1], tache: [0, 0] },
  laugh: { eyes: { mode: 'happy' }, mouth: 'laugh', browL: [-6, -4, 1.2], browR: [-6, -4, 1.2], tache: [12, 12] },
  cheer: { eyes: { mode: 'open', size: 1.06, look: [0, -3] }, mouth: 'laugh', browL: [-10, -6, 1.3], browR: [-10, -6, 1.3], tache: [16, 16], capUp: 4 },
  pray: { eyes: { mode: 'open', look: [0, -8], lid: 0.2, slant: -18 }, mouth: 'pray', browL: [-7, -24, 0.6], browR: [-7, -24, 0.6], tache: [-12, -12] },
  worried: { eyes: { mode: 'open', look: [6, 1], lid: 0.16, slant: -16, pupil: 0.9 }, mouth: 'pray', browL: [-6, -20, 0.7], browR: [-6, -20, 0.7], tache: [-9, -9] },
  shock: { eyes: { mode: 'open', size: 1.16, pupil: 0.62, look: [0, -2] }, mouth: 'shock', browL: [-15, -5, 1.3], browR: [-15, -5, 1.3], tache: [24, 24], capUp: 9, capTilt: -3 },
  smug: { eyes: { mode: 'open', look: [6, 3], lid: 0.46, slant: 4 }, eyesR: { lid: 0.4 }, mouth: 'smug', browL: [4, 6, 0.8], browR: [-7, -4, 1.15], tache: [-2, 14] },
  whistle: { eyes: { mode: 'squeeze' }, mouth: 'whistle', browL: [-4, -6, 1.1], browR: [-4, -6, 1.1], tache: [10, 10], puff: true },
  watch: { eyes: { mode: 'open', look: [7, -1], pupil: 0.95 }, eyesR: { lid: 0.12 }, mouth: 'ooh', browL: [-8, -3, 1.2], browR: [2, 6, 1], tache: [4, 4] },
};

function capPlaced(p: HeadPose): string {
  if (p.doff) return '';
  return `<g transform="translate(0 ${-(p.capUp ?? 0)}) rotate(${CAP_TILT + (p.capTilt ?? 0)} ${CAP_PIV[0]} ${CAP_PIV[1]})">${capBody()}</g>`;
}

function headArt(p: HeadPose, symbol: boolean): string {
  const mid = nextId('cm');
  const sq = p.squash ?? 1;
  const cheeks = p.puff ? CHEEKS() : null;
  const eR = { ...p.eyes, ...(p.eyesR ?? {}) };
  return composeSymbol({
    ...PAINT,
    noDrop: !symbol,
    transform: `${symbol ? SYMBOL_INSET : ''} translate(128 248) scale(${1 / Math.sqrt(sq)} ${sq}) translate(-128 -248)`,
    layers: [EARS(), TUFTS(), FACE_LAYER(), ...(cheeks ? [cheeks] : [])],
    top: `
      ${p.doff ? DOME_SHINE : SHADOW_UNDER_PEAK(nextId('cs'))}
      ${p.puff ? CHEEK_TOP : BLUSH}
      ${eyeArt(EYE_L, 1, p.eyes)}${eyeArt(EYE_R, -1, eR)}
      ${mouthArt(p.mouth, mid)}
      ${p.mouth === 'whistle' ? MOUTH_WHISTLE : ''}
      ${wingArt('L', p.tache[0])}${wingArt('R', p.tache[1])}
      ${noseArt()}
      ${capPlaced(p)}
      ${browArt('L', ...p.browL)}${browArt('R', ...p.browR)}
      ${symbol ? sparkle(214, 30, 9, '#fff', 0.92) : ''}`,
  });
}

/**
 * Conductor Casey's head. `symbol` adds the drop shadow and the reel framing (the TOP symbol);
 * the rig/title-card version has neither.
 */
export function conductorHead(expr: ConductorExpr = 'idle', symbol = false): string {
  return headArt(POSES[expr], symbol);
}

/** The win highlight: he laughs, the cap hops off his head and back, the moustache bouncing (loop of 4). */
export const conductorWinFrames: (() => string)[] = [
  () => headArt({ ...POSES.laugh, capUp: 11, capTilt: -7, tache: [20, 20], squash: 1.03 }, true),
  () => headArt({ ...POSES.laugh, mouth: 'grin', capUp: 3, capTilt: -2, tache: [4, 4], squash: 0.97 }, true),
  () => headArt({ ...POSES.cheer, capUp: 12, capTilt: 6, tache: [22, 22], squash: 1.03 }, true),
  () => headArt({ ...POSES.laugh, eyes: { mode: 'open', look: [0, -2] }, capUp: 4, capTilt: 1, tache: [8, 8], squash: 0.98 }, true),
];

/* --------------------------------- rig parts --------------------------------- */
export interface RigPart {
  svg: string;
  box: [number, number, number, number];
  pivot: [number, number];
}

function cropSvg(svg: string, box: [number, number, number, number]): string {
  const [x, y, w, h] = box;
  return svg.replace(/viewBox="0 0 256 256" width="256" height="256"/, `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);
}
const plain = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${body}</svg>`;

export type ConPart =
  | 'face'
  | 'cheeks'
  | 'cap'
  | 'eyeWhiteL'
  | 'eyeWhiteR'
  | 'eyeRingL'
  | 'eyeRingR'
  | 'pupilL'
  | 'pupilR'
  | 'lidL'
  | 'lidR'
  | 'lidLaughL'
  | 'lidLaughR'
  /** Eyes squeezed shut (> <: blowing the whistle, wincing). */
  | 'squeezeL'
  | 'squeezeR'
  | 'browL'
  | 'browR'
  /** The whole moustache with the nose (review sheets); the rig uses tacheL / tacheR / nose. */
  | 'moustache'
  | 'tacheL'
  | 'tacheR'
  | 'nose'
  | `mouth-${ConMouth}`;

/** Where the head hangs from the neck (256 box). */
export const CON_HEAD_PIVOT: [number, number] = [128, 236];
/** Eye centres (both share y, rx, ry) and the pupils' resting offset. */
export const CON_EYES = { L: EYE_L, R: EYE_R, y: EYE_Y, rx: ERX, ry: ERY, pupil: PUP };
export const CON_BROWS = { L: BROW_L, R: BROW_R };
/** Mouth centre (the whistle's mouthpiece goes here), in the head box. */
export const CON_MOUTH: [number, number] = MOUTH;
/** The cap's pivot (back of the band) for a doff / pop, head box. */
export const CON_CAP_PIVOT: [number, number] = CAP_PIV;
/** The cap's resting tilt (radians) as drawn on the head. */
export const CON_CAP_TILT = (CAP_TILT * Math.PI) / 180;
/** The moustache wings' hinges (their roots under the nose) and the nose centre, head box. */
export const CON_TACHE = { L: TACHE_L, R: TACHE_R };
export const CON_NOSE: [number, number] = [NOSE[0], NOSE[1]];

export function conductorRigPart(part: ConPart): RigPart {
  const r = rigPartFull(part);
  return { ...r, svg: cropSvg(r.svg, r.box) };
}

function rigPartFull(part: ConPart): RigPart {
  const eyeSide = (p: string) => (p.endsWith('L') ? EYE_L : EYE_R);
  switch (part) {
    case 'face':
      return {
        svg: composeSymbol({ ...PAINT, noDrop: true, layers: [EARS(), TUFTS(), FACE_LAYER()], top: `${DOME_SHINE}${SHADOW_UNDER_PEAK(nextId('cs'))}${BLUSH}` }),
        box: [24, 56, 208, 200],
        pivot: [128, 160],
      };
    case 'cheeks':
      return { svg: composeSymbol({ ...PAINT, noDrop: true, layers: [CHEEKS()], top: CHEEK_TOP }), box: [36, 154, 184, 74], pivot: [128, 190] };
    case 'cap':
      return {
        svg: composeSymbol({ ...PAINT, noDrop: true, layers: [{ fills: '' }], top: `<g transform="rotate(${CAP_TILT} ${CAP_PIV[0]} ${CAP_PIV[1]})">${capBody()}</g>` }),
        box: [40, 6, 176, 130],
        pivot: CAP_PIV,
      };
    case 'eyeWhiteL':
    case 'eyeWhiteR': {
      const x = eyeSide(part);
      const id = nextId('ew');
      return {
        svg: plain(`<clipPath id="${id}"><ellipse cx="${x}" cy="${EYE_Y}" rx="${ERX}" ry="${ERY}"/></clipPath><ellipse cx="${x}" cy="${EYE_Y}" rx="${ERX}" ry="${ERY}" fill="${C.white}"/>
          <path clip-path="url(#${id})" d="M${x - ERX} ${EYE_Y + ERY * 0.45} Q${x} ${EYE_Y + ERY * 1.25} ${x + ERX} ${EYE_Y + ERY * 0.45} L${x + ERX} ${EYE_Y + ERY} L${x - ERX} ${EYE_Y + ERY} Z" fill="${mix(C.white, C.steelLight, 0.7)}"/>`),
        box: [x - ERX - 2, EYE_Y - ERY - 2, 2 * ERX + 4, 2 * ERY + 4],
        pivot: [x, EYE_Y],
      };
    }
    case 'eyeRingL':
    case 'eyeRingR': {
      const x = eyeSide(part);
      return { svg: plain(`<ellipse cx="${x}" cy="${EYE_Y}" rx="${ERX}" ry="${ERY}" fill="none" stroke="${C.ink}" stroke-width="5.5"/>`), box: [x - ERX - 4, EYE_Y - ERY - 4, 2 * ERX + 8, 2 * ERY + 8], pivot: [x, EYE_Y] };
    }
    case 'pupilL':
    case 'pupilR': {
      const x = eyeSide(part) + PUP[0];
      const y = EYE_Y + PUP[1];
      return { svg: plain(pupilArt(x, y)), box: [x - PRX - 3, y - PRY - 3, 2 * PRX + 6, 2 * PRY + 6], pivot: [x, y] };
    }
    case 'lidL':
    case 'lidR': {
      // a lid the size of the whole eye hinged at its top: scaled from the top it closes the eye by
      // any amount (0 open, .45 smug, 1 shut); its lower edge is the lash line
      const x = eyeSide(part);
      const top = EYE_Y - ERY - 3;
      const bot = EYE_Y + ERY + 3;
      const w = ERX + 3;
      const lid = `M${x - w} ${EYE_Y - 2} C${x - w} ${top + 2} ${x - 9} ${top} ${x} ${top} C${x + 9} ${top} ${x + w} ${top + 2} ${x + w} ${EYE_Y - 2} C${x + w} ${EYE_Y + 13} ${x + 10} ${bot} ${x} ${bot} C${x - 10} ${bot} ${x - w} ${EYE_Y + 13} ${x - w} ${EYE_Y - 2} Z`;
      const lash = `M${x - w + 1} ${EYE_Y + 6} C${x - 13} ${EYE_Y + 18} ${x - 6} ${bot - 1} ${x} ${bot - 1} C${x + 6} ${bot - 1} ${x + 13} ${EYE_Y + 18} ${x + w - 1} ${EYE_Y + 6}`;
      return {
        svg: grain(`${form(lid, { ...SKIN, cut: [-4, -5] })}<path d="${lash}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>`),
        box: [x - w - 4, top - 4, 2 * w + 8, bot - top + 8],
        pivot: [x, top],
      };
    }
    case 'lidLaughL':
    case 'lidLaughR': {
      const x = eyeSide(part);
      return { svg: plain(eyeArt(x, part.endsWith('L') ? 1 : -1, { mode: 'happy' })), box: [x - 22, EYE_Y - 14, 44, 38], pivot: [x, EYE_Y] };
    }
    case 'squeezeL':
    case 'squeezeR': {
      const x = eyeSide(part);
      return { svg: plain(eyeArt(x, part.endsWith('L') ? 1 : -1, { mode: 'squeeze' })), box: [x - 22, EYE_Y - 16, 44, 34], pivot: [x, EYE_Y] };
    }
    case 'browL':
      return { svg: grain(browArt('L')), box: [BROW_L.x - 30, BROW_L.y - 18, 60, 34], pivot: [BROW_L.x, BROW_L.y] };
    case 'browR':
      return { svg: grain(browArt('R')), box: [BROW_R.x - 30, BROW_R.y - 18, 60, 34], pivot: [BROW_R.x, BROW_R.y] };
    case 'tacheL':
      return { svg: grain(wingArt('L')), box: [32, 150, 102, 72], pivot: TACHE_L };
    case 'tacheR':
      return { svg: grain(wingArt('R')), box: [122, 150, 102, 72], pivot: TACHE_R };
    case 'nose':
      return { svg: grain(noseArt()), box: [102, 156, 52, 46], pivot: CON_NOSE };
    case 'moustache':
      return { svg: grain(`${wingArt('L')}${wingArt('R')}${noseArt()}`), box: [32, 150, 192, 72], pivot: [128, 201] };
    default: {
      const m = part.slice(6) as ConMouth;
      const box: Record<ConMouth, [number, number, number, number]> = {
        grin: [92, 196, 72, 48],
        laugh: [86, 194, 84, 58],
        pray: [104, 214, 48, 28],
        shock: [110, 202, 36, 44],
        smug: [98, 198, 64, 34],
        whistle: [112, 205, 32, 28],
        grit: [94, 198, 68, 42],
        ooh: [114, 206, 28, 30],
      };
      return { svg: plain(mouthArt(m, nextId('cm'))), box: box[m], pivot: MOUTH };
    }
  }
}
