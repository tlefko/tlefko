/**
 * Conductor Casey: the hero. A stout, jolly 1930s rubber-hose subway conductor: big round nose,
 * bushy white walrus moustache, rosy cheeks, two pie eyes, a navy conductor's cap with a gold
 * winged-wheel badge, a glossy black visor and a gold chin cord. His head doubles as the TOP paying
 * symbol. 256x256 viewBox for every part.
 *
 * `conductorHead()` is the whole head (symbol, title cards). `conductorRigPart()` cuts the same
 * drawing into the layers the rig animates (face, cheeks, cap, eyes, lids, brows, mouths,
 * moustache); each is cropped to its own box but keeps the head's 256 coordinates, so the rig
 * stacks them back into exactly this head (see render/characters/Conductor.ts).
 */
import { C, composeSymbol, pieEye, closedEye, nextId, cel, celForm, celTones, shine, mix, scallops, GOLD_TONES } from './kit';
import { sparkle } from './geo';

export type ConductorExpr = 'idle' | 'blink' | 'laugh' | 'pray' | 'shock' | 'smug' | 'whistle';

/* ---------------------------------- shapes ---------------------------------- */
/** Head + face in one form: the bald dome runs up under the cap (seen when he doffs it). */
const FACE =
  'M128 60 C166 60 190 84 193 116 C200 138 210 166 208 194 C205 232 172 254 128 254 C84 254 51 232 48 194 C46 166 56 138 63 116 C66 84 90 60 128 60 Z';
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

/** Cap crown: a stiff cylinder, flaring a touch to the flat top (seen from just above). */
const CROWN = 'M70 94 L55 40 C54 29 86 20 128 20 C170 20 202 29 201 40 L186 94 Z';
const CROWN_TOP = 'M56 42 C84 54 172 54 200 42';
/** The braided band round the base of the crown. */
const BAND = 'M64 72 Q128 84 192 72 L187 96 Q128 108 69 96 Z';
/** Glossy black visor, curving down toward the viewer. */
const VISOR = 'M62 94 Q128 108 194 94 C199 106 188 118 164 122 Q128 128 92 122 C68 118 57 106 62 94 Z';
const CORD = 'M74 98 Q128 111 182 98';

/** Grey fringe peeking out under the cap above each ear (left side; mirrored for the right). */
function fringe(flip: boolean): string {
  const m = (x: number) => (flip ? 256 - x : x);
  const pts: [number, number][] = [
    [m(74), 96],
    [m(62), 102],
    [m(52), 116],
    [m(50), 132],
    [m(56), 146],
  ];
  return `M${m(74)} 96${scallops(pts, 0.32, flip ? 1 : -1)} C${m(66)} 140 ${m(66)} 118 ${m(76)} 104 Z`;
}

/** The walrus moustache: two heavy drooping wings meeting under the nose, a scalloped hem. */
function tachePath(): string {
  // right wing (the left is mirrored): top edge from under the nose up over the cheek to the tip
  const hem: [number, number][] = [
    [214, 218],
    [204, 230],
    [186, 234],
    [166, 232],
    [146, 228],
    [128, 220],
  ];
  const m = ([x, y]: [number, number]): [number, number] => [256 - x, y];
  const hemL = hem.map(m).reverse();
  let d = 'M128 194';
  d += ' C140 184 158 178 178 182 C198 186 212 198 214 218';
  d += scallops(hem, 0.34, -1);
  d += scallops(hemL, 0.34, -1);
  d += ' C44 198 58 186 78 182 C98 178 116 184 128 194 Z';
  return d;
}
const TACHE = tachePath();
/** Combed strands on the moustache. */
const TACHE_STRANDS = `<g fill="none" stroke="${C.g3}" stroke-width="2.6" stroke-linecap="round" opacity=".7">
  <path d="M140 200 Q158 206 166 222"/><path d="M156 194 Q180 200 190 222"/><path d="M178 190 Q198 198 204 214"/>
  <path d="M116 200 Q98 206 90 222"/><path d="M100 194 Q76 200 66 222"/><path d="M78 190 Q58 198 52 214"/>
</g>`;

/* ---------------------------------- badge ---------------------------------- */
/** The cap badge: a spoked wheel with a wing either side (no text). Centre (cx, cy), wheel radius r. */
export function wingedWheel(cx: number, cy: number, r: number): string {
  const k = r / 12;
  const wing = (s: 1 | -1) => {
    const X = (x: number) => (cx + s * x * k).toFixed(1);
    const Y = (y: number) => (cy + y * k).toFixed(1);
    const tips: [number, number][] = [
      [44, -16],
      [40, -6],
      [34, 2],
      [26, 8],
      [14, 8],
    ];
    let hem = '';
    for (let i = 1; i < tips.length; i++) {
      const [x0, y0] = tips[i - 1];
      const [x1, y1] = tips[i];
      hem += ` Q${X((x0 + x1) / 2 + 2)} ${Y((y0 + y1) / 2 + 5)} ${X(x1)} ${Y(y1)}`;
    }
    return `M${X(10)} ${Y(-6)} C${X(18)} ${Y(-16)} ${X(32)} ${Y(-22)} ${X(44)} ${Y(-16)}${hem} Z`;
  };
  const spokes = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    return `M${(cx + Math.cos(a) * 3.5 * k).toFixed(1)} ${(cy + Math.sin(a) * 3.5 * k).toFixed(1)} L${(cx + Math.cos(a) * 9 * k).toFixed(1)} ${(cy + Math.sin(a) * 9 * k).toFixed(1)}`;
  }).join(' ');
  const wl = wing(-1);
  const wr = wing(1);
  const lines = (s: 1 | -1) =>
    [0.45, 0.7].map((t) => `M${(cx + s * (12 + 22 * t) * k).toFixed(1)} ${(cy - (12 * t + 2) * k).toFixed(1)} Q${(cx + s * (16 + 22 * t) * k).toFixed(1)} ${(cy + 0 * k).toFixed(1)} ${(cx + s * (12 + 20 * t) * k).toFixed(1)} ${(cy + 6 * k).toFixed(1)}`).join(' ');
  return `<g>
    ${cel(wl, { ...GOLD_TONES, cut: [-2.5, -3], band: [1.4, 1.6], seed: 61 })}${cel(wr, { ...GOLD_TONES, cut: [-2.5, -3], band: [1.4, 1.6], seed: 62 })}
    <path d="${wl}" fill="none" stroke="${C.ink}" stroke-width="${(2.6 * k).toFixed(1)}" stroke-linejoin="round"/>
    <path d="${wr}" fill="none" stroke="${C.ink}" stroke-width="${(2.6 * k).toFixed(1)}" stroke-linejoin="round"/>
    <path d="${lines(-1)} ${lines(1)}" fill="none" stroke="${C.goldDeep}" stroke-width="${(1.6 * k).toFixed(1)}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${(12 * k).toFixed(1)}" fill="${C.gold}" stroke="${C.ink}" stroke-width="${(2.8 * k).toFixed(1)}"/>
    <circle cx="${cx}" cy="${cy}" r="${(8.6 * k).toFixed(1)}" fill="${GOLD_TONES.shade}" stroke="${C.goldDeep}" stroke-width="${(1.2 * k).toFixed(1)}"/>
    <path d="${spokes}" stroke="${C.goldLight}" stroke-width="${(2.2 * k).toFixed(1)}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${(3.4 * k).toFixed(1)}" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="${(1.6 * k).toFixed(1)}"/>
    <path d="M${(cx - 9 * k).toFixed(1)} ${(cy - 5 * k).toFixed(1)} A${(10.5 * k).toFixed(1)} ${(10.5 * k).toFixed(1)} 0 0 1 ${(cx - 2 * k).toFixed(1)} ${(cy - 10.5 * k).toFixed(1)}" fill="none" stroke="#fff" stroke-width="${(1.8 * k).toFixed(1)}" stroke-linecap="round" opacity=".85"/>
  </g>`;
}

/* ---------------------------------- mouths ---------------------------------- */
/** Mouths sit under the moustache: their top edge tucks under its hem. */
const GRIN = 'M94 216 Q128 226 162 216 Q158 246 128 248 Q98 246 94 216 Z';
const LAUGH = 'M88 212 Q128 222 168 212 Q164 254 128 254 Q92 254 88 212 Z';
const GRIT = 'M94 218 Q128 224 162 218 Q160 242 128 244 Q96 242 94 218 Z';

function openMouth(d: string, ty: number, tr: number, teeth: boolean, mid: string): string {
  return `
    <path d="${d}" fill="${C.ink}"/>
    <clipPath id="${mid}"><path d="${d}"/></clipPath>
    <g clip-path="url(#${mid})">
      <ellipse cx="128" cy="${ty}" rx="${tr}" ry="${tr * 0.6}" fill="${C.crimson}"/>
      <ellipse cx="122" cy="${ty - tr * 0.18}" rx="${tr * 0.4}" ry="${tr * 0.18}" fill="${C.crimsonLight}" opacity=".7"/>
      ${teeth ? `<path d="M86 210 L170 210 L170 228 Q128 236 86 228 Z" fill="${C.white}"/><path d="M114 220 L114 232 M142 220 L142 232" stroke="${C.ink}" stroke-width="2.5" opacity=".7"/>` : ''}
    </g>
    <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>`;
}

/** Rig mouth shapes. The first six are the head's own expressions; grit and ooh are rig-only. */
export type ConMouth = 'grin' | 'laugh' | 'pray' | 'shock' | 'smug' | 'whistle' | 'grit' | 'ooh';

function mouthArt(m: ConMouth, mid: string): string {
  switch (m) {
    case 'grin':
      return openMouth(GRIN, 246, 18, true, mid);
    case 'laugh':
      return openMouth(LAUGH, 252, 26, true, mid);
    case 'pray':
      return `<path d="M112 234 Q120 226 128 234 Q136 242 144 234" stroke="${C.ink}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'shock':
      return `<ellipse cx="128" cy="234" rx="14" ry="17" fill="${C.ink}"/><ellipse cx="128" cy="243" rx="9" ry="5" fill="${C.crimson}"/>`;
    case 'smug':
      return `<path d="M104 232 Q128 244 154 228" stroke="${C.ink}" stroke-width="6.5" fill="none" stroke-linecap="round"/><path d="M150 222 Q156 228 154 234" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'whistle':
      // lips pursed round the whistle's mouthpiece
      return `<ellipse cx="128" cy="234" rx="13" ry="11" fill="${mix(C.skin, C.crimson, 0.35)}" stroke="${C.ink}" stroke-width="5"/><ellipse cx="128" cy="234" rx="5.5" ry="4.5" fill="${C.ink}"/>`;
    case 'grit':
      return `<path d="${GRIT}" fill="${C.ink}"/>
        <clipPath id="${mid}"><path d="${GRIT}"/></clipPath>
        <g clip-path="url(#${mid})">
          <path d="M88 214 L168 214 L168 228 Q128 234 88 228 Z" fill="${C.white}"/>
          <path d="M88 232 Q128 238 168 232 L168 248 L88 248 Z" fill="${C.paperWarm}"/>
          <path d="M108 216 L108 244 M128 218 L128 246 M148 216 L148 244" stroke="${C.ink}" stroke-width="2.5"/>
        </g>
        <path d="${GRIT}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>`;
    case 'ooh':
      return `<ellipse cx="128" cy="234" rx="9" ry="11" fill="${C.ink}"/><ellipse cx="128" cy="239" rx="5.5" ry="3.4" fill="${C.crimson}"/>`;
  }
}

/* ----------------------------------- eyes ----------------------------------- */
const EYE_Y = 153;
const EYE_L = 104;
const EYE_R = 152;
const ERX = 14;
const ERY = 18;
/** The pupils' rest offset inside the whites (a touch toward the board, on his left = screen right). */
const PUP: [number, number] = [3, 3];

type EyeMode = 'open' | 'closed' | 'happy' | 'shock' | 'smug' | 'up' | 'squeeze';
function eyeArt(x: number, mode: EyeMode): string {
  const white = (rx = ERX, ry = ERY, dy = 0) => `<ellipse cx="${x}" cy="${EYE_Y + dy}" rx="${rx}" ry="${ry}" fill="${C.white}" stroke="${C.ink}" stroke-width="5.5"/>`;
  switch (mode) {
    case 'open':
      return white() + pieEye(x + PUP[0], EYE_Y + PUP[1], 7.5, 11);
    case 'closed':
      return closedEye(x, EYE_Y + 3, 26, false);
    case 'happy':
      return closedEye(x, EYE_Y, 28, true);
    case 'squeeze':
      return `<path d="M${x - 13} ${EYE_Y - 6} L${x + 9} ${EYE_Y + 1} L${x - 13} ${EYE_Y + 8}" transform="${x < 128 ? '' : `translate(${2 * x} 0) scale(-1 1)`}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'shock':
      return white(16, 21, -2) + `<ellipse cx="${x}" cy="${EYE_Y}" rx="5" ry="7" fill="${C.ink}"/>`;
    case 'up':
      return white() + pieEye(x + 1, EYE_Y - 6, 7.5, 10.5);
    case 'smug':
      return (
        white() +
        pieEye(x + 4, EYE_Y + 6, 7, 9.5) +
        `<path d="M${x - 15} ${EYE_Y - 1} Q${x} ${EYE_Y - 8} ${x + 15} ${EYE_Y - 1} L${x + 15} ${EYE_Y - 21} L${x - 15} ${EYE_Y - 21} Z" fill="${C.skin}"/>
         <path d="M${x - 15} ${EYE_Y - 1} Q${x} ${EYE_Y - 8} ${x + 15} ${EYE_Y - 1}" stroke="${C.ink}" stroke-width="5.5" fill="none" stroke-linecap="round"/>`
      );
  }
}

/* ---------------------------------- brows ---------------------------------- */
/** A bushy white brow: a tufted cloud along a gentle arch. Centre (cx, cy), `lift` raises the arch, `tilt` in degrees. */
const BROW_TONES = celTones(C.white, C.g2, C.white);
function bushyBrow(cx: number, cy: number, flip: boolean, arch = 1, tilt = 0): string {
  const s = flip ? -1 : 1;
  const top: [number, number][] = [
    [-24, 8],
    [-16, -4 * arch],
    [-4, -9 * arch],
    [9, -8 * arch],
    [20, -2 * arch],
    [25, 7],
  ];
  const d = `M-24 8${scallops(top, 0.42, 1)} C14 ${12 - 3 * arch} -6 ${14 - 3 * arch} -24 8 Z`;
  // the brows are drawn as the left one; the right is mirrored
  return `<g transform="translate(${cx} ${cy}) scale(${s} 1) rotate(${tilt})">
    ${cel(d, { ...BROW_TONES, cut: [-2, -3], band: [1.2, 1.5], seed: 41 })}
    <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
  </g>`;
}
const BROW_L = { x: 101, y: 128 };
const BROW_R = { x: 155, y: 128 };

/* --------------------------------- painting --------------------------------- */
const SKIN = celTones(C.skin, C.skinDeep, C.skinLight);
const HAIR = celTones(C.g1, C.g3, C.white);
const TACHE_TONES = { base: C.white, shade: mix(C.g1, C.g2, 0.45), light: '#ffffff', hatch: mix(C.g3, C.ink, 0.2) };
const CAP = { ...celTones(C.uniform, C.uniformDeep, C.uniformLight), hatch: mix(C.uniformDeep, C.ink, 0.4) };
const VISOR_T = { base: C.inkSoft, shade: C.ink, light: mix(C.inkSoft, C.uniformLight, 0.45), hatch: C.ink };
const BAND_T = { base: C.uniformDeep, shade: mix(C.uniformDeep, C.ink, 0.5), light: mix(C.uniformDeep, C.uniform, 0.7), hatch: C.ink };
const NOSE = celTones(mix(C.skin, C.crimsonLight, 0.42), mix(C.skinDeep, C.crimson, 0.25), C.skinLight);

type Lay = { fills: string; lines: string };
const EARS = (): Lay => {
  const l = celForm(circle(58, 150, 15), { ...SKIN, cut: [-5, -6], seed: 30 });
  const r = celForm(circle(198, 150, 15), { ...SKIN, cut: [-5, -6], seed: 31 });
  return {
    fills: l.fills + r.fills,
    lines: `${l.line()}${r.line()}<path d="M54 144 q6 4 4 12 M202 144 q-6 4 -4 12" stroke-width="3.5" opacity=".7"/>`,
  };
};
const FACE_LAYER = (): Lay => {
  const f = celForm(FACE, { ...SKIN, cut: [-13, -14], twist: -3, seed: 32 });
  return { fills: f.fills, lines: `${f.line()}<path d="M104 246 Q128 252 152 246" stroke-width="3.5" opacity=".5"/>` };
};
const FRINGE = (): Lay => {
  const a = celForm(fringe(false), { ...HAIR, cut: [-3, -4], band: [1.5, 2], seed: 42 });
  const b = celForm(fringe(true), { ...HAIR, cut: [-3, -4], band: [1.5, 2], seed: 43 });
  return { fills: a.fills + b.fills, lines: `${a.line('stroke-width="5"')}${b.line('stroke-width="5"')}` };
};
const DOME_SHINE = `${shine([[96, 72], [112, 64], [130, 62]], 3.2, 0.7, C.skinLight)}`;
const BLUSH = `<ellipse cx="74" cy="176" rx="16" ry="10" fill="${C.crimsonLight}" opacity=".5"/>
      <ellipse cx="182" cy="176" rx="16" ry="10" fill="${C.crimsonLight}" opacity=".5"/>
      <path d="M66 175 l4 -3 M75 176 l4 -3 M178 176 l4 -3 M187 175 l4 -3" stroke="${C.crimson}" stroke-width="2" stroke-linecap="round" opacity=".45"/>`;
const CHEEK_L = circle(68, 190, 27);
const CHEEK_R = circle(188, 190, 27);
/** Puffed cheeks (blowing the whistle): two round balloons over the face's sides. */
const CHEEKS = (): Lay => {
  const l = celForm(CHEEK_L, { ...SKIN, cut: [-6, -7], seed: 44 });
  const r = celForm(CHEEK_R, { ...SKIN, cut: [-6, -7], seed: 45 });
  return { fills: l.fills + r.fills, lines: l.line('stroke-width="6"') + r.line('stroke-width="6"') };
};
const CHEEK_TOP = `<ellipse cx="70" cy="186" rx="16" ry="11" fill="${C.crimsonLight}" opacity=".62"/><ellipse cx="186" cy="186" rx="16" ry="11" fill="${C.crimsonLight}" opacity=".62"/>
  ${shine([[52, 182], [58, 172], [68, 168]], 2.4, 0.8, C.skinLight)}${shine([[172, 180], [178, 170], [188, 167]], 2.4, 0.8, C.skinLight)}`;
const CROWN_LAYER = (): Lay => {
  const c = celForm(CROWN, { ...CAP, cut: [-12, -8], shrink: 0.97, hatch: CAP.hatch, hatchGap: 5.5, seed: 34 });
  return { fills: c.fills, lines: `${c.line()}<path d="${CROWN_TOP}" stroke-width="4.5"/>` };
};
const BAND_LAYER = (): Lay => {
  const b = celForm(BAND, { ...BAND_T, cut: [-6, -6], seed: 35 });
  return { fills: b.fills, lines: b.line('stroke-width="5.5"') };
};
const VISOR_LAYER = (): Lay => {
  const v = celForm(VISOR, { ...VISOR_T, cut: [-6, -8], seed: 36 });
  return { fills: v.fills, lines: v.line() };
};
const CAP_TRIM = `
      <path d="M66 76 Q128 88 190 76" fill="none" stroke="${C.goldDeep}" stroke-width="5" stroke-linecap="round"/>
      <path d="M66 75 Q128 87 190 75" fill="none" stroke="${C.gold}" stroke-width="2.6" stroke-linecap="round"/>
      ${shine([[70, 38], [96, 28], [128, 25]], 2.4, 0.5, C.uniformLight)}
      ${shine([[182, 48], [186, 60], [186, 70]], 2.4, 0.45, C.uniformLight)}
      ${shine([[80, 106], [106, 113], [134, 115]], 2.4, 0.75, mix(C.uniformLight, C.white, 0.4))}
      <path d="${CORD}" fill="none" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/>
      <path d="${CORD}" fill="none" stroke="${C.gold}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="${CORD}" fill="none" stroke="${C.goldLight}" stroke-width="1.6" stroke-dasharray="3 5" stroke-linecap="round"/>
      <circle cx="74" cy="98" r="6.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="72.5" cy="96.5" r="2" fill="#fff"/>
      <circle cx="182" cy="98" r="6.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="180.5" cy="96.5" r="2" fill="#fff"/>`;
const CAP_BADGE = `${wingedWheel(128, 56, 13)}${sparkle(154, 40, 5, C.goldLight, 0.9)}`;
const TACHE_ART = () => `${cel(TACHE, { ...TACHE_TONES, cut: [-6, -7], hatch: TACHE_TONES.hatch, hatchGap: 5, seed: 46 })}
      ${TACHE_STRANDS}
      <path d="${TACHE}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
      ${shine([[90, 198], [104, 192], [118, 196]], 2, 0.9)}${shine([[138, 196], [152, 192], [166, 198]], 2, 0.9)}`;
const NOSE_ART = () => `${cel(circle(128, 178, 21), { ...NOSE, cut: [-7, -8], seed: 37 })}<circle cx="128" cy="178" r="21" fill="none" stroke="${C.ink}" stroke-width="6"/>
      <ellipse cx="120" cy="170" rx="6.5" ry="4.5" fill="#fff" opacity=".85" transform="rotate(-25 120 170)"/>`;

/** The whistle in his lips, for the head's own 'whistle' expression (the rig holds a separate one). */
const MOUTH_WHISTLE = `<g transform="translate(128 234) rotate(-14) scale(1.25)">
    <rect x="4" y="-5" width="22" height="10" rx="3" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.5"/>
    <path d="M22 -14 L52 -14 C60 -14 64 -8 64 0 C64 10 56 16 46 16 C34 16 26 10 24 2 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M30 -9 L50 -9" stroke="${C.goldLight}" stroke-width="3" stroke-linecap="round"/>
    <rect x="34" y="-14" width="10" height="6" fill="${C.ink}"/>
    <path d="M44 2 A6 6 0 0 0 56 2" fill="none" stroke="${C.goldDeep}" stroke-width="2.4"/>
  </g>`;

/** The paint shared by every head raster (kit.ts opt-ins, the house look). */
const PAINT = { autoCel: false, texture: { seed: 11 }, contour: 0.8, inkShift: [1, 1.2] as [number, number] };
const grain = (body: string) => composeSymbol({ autoCel: false, texture: { seed: 11 }, inkShift: [1, 1.2], noDrop: true, layers: [{ fills: '' }], top: body });
/** Symbol framing: pulled in so the cap and moustache stay clear of the reel cell's edge. */
const SYMBOL_INSET = 'translate(128 128) scale(.93) translate(-128 -134)';

interface HeadPose {
  eyes: EyeMode;
  mouth: ConMouth;
  /** Brow lift (units, negative = up), arch scale, tilt (deg; positive = inner ends down / cross). */
  brow: [number, number, number];
  puff?: boolean;
  /** Cap lift (units up) and tilt (deg). */
  capUp?: number;
  capTilt?: number;
  /** Moustache bounce (units down). */
  tache?: number;
  /** Whole head squash (y scale about the chin). */
  squash?: number;
}
const POSES: Record<ConductorExpr, HeadPose> = {
  idle: { eyes: 'open', mouth: 'grin', brow: [0, 1, 0] },
  blink: { eyes: 'closed', mouth: 'grin', brow: [1, 1, 0] },
  laugh: { eyes: 'happy', mouth: 'laugh', brow: [-6, 1.15, -4], tache: -3 },
  pray: { eyes: 'up', mouth: 'pray', brow: [-2, -0.7, -14] },
  shock: { eyes: 'shock', mouth: 'shock', brow: [-12, 1.3, -6], capUp: 6, tache: -2 },
  smug: { eyes: 'smug', mouth: 'smug', brow: [2, 0.6, 8] },
  whistle: { eyes: 'squeeze', mouth: 'whistle', brow: [-5, 1.1, -6], puff: true, tache: -4 },
};

function headArt(p: HeadPose, symbol: boolean): string {
  const mid = nextId('cm');
  const [by, ba, bt] = p.brow;
  const capT = `translate(0 ${-(p.capUp ?? 0)}) rotate(${p.capTilt ?? 0} 128 100)`;
  const tacheY = p.tache ?? 0;
  const sq = p.squash ?? 1;
  const cheeks = p.puff ? CHEEKS() : null;
  const body = composeSymbol({
    ...PAINT,
    noDrop: !symbol,
    transform: `${symbol ? SYMBOL_INSET : ''} translate(128 250) scale(${1 / Math.sqrt(sq)} ${sq}) translate(-128 -250)`,
    layers: [EARS(), FACE_LAYER(), FRINGE(), ...(cheeks ? [cheeks] : [])],
    top: `
      ${DOME_SHINE}
      ${p.puff ? CHEEK_TOP : BLUSH}
      ${eyeArt(EYE_L, p.eyes)}${eyeArt(EYE_R, p.eyes)}
      ${mouthArt(p.mouth, mid)}
      ${p.mouth === 'whistle' ? MOUTH_WHISTLE : ''}
      <g transform="translate(0 ${tacheY})">${TACHE_ART()}</g>
      ${NOSE_ART()}
      <g transform="${capT}">${capSvgBody()}</g>
      ${bushyBrow(BROW_L.x, BROW_L.y + by, false, ba, bt)}${bushyBrow(BROW_R.x, BROW_R.y + by, true, ba, bt)}`,
  });
  return body;
}

/** The cap drawn inline (its own cel layers, inked), for placing over the head. */
function capSvgBody(): string {
  const c = CROWN_LAYER();
  const b = BAND_LAYER();
  const v = VISOR_LAYER();
  const ink = (l: string) => `<g fill="none" stroke="${C.ink}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(1 1.2)">${l}</g>${l}</g>`;
  return `${c.fills}${ink(c.lines)}${b.fills}${ink(b.lines)}${v.fills}${ink(v.lines)}${CAP_TRIM}${CAP_BADGE}`;
}

/**
 * Conductor Casey's head. `symbol` adds the drop shadow and the reel framing (the TOP symbol);
 * the rig version has neither.
 */
export function conductorHead(expr: ConductorExpr = 'idle', symbol = false): string {
  return headArt(POSES[expr], symbol);
}

/** The win highlight: he laughs and doffs the cap a little, the moustache bouncing (loop of 4). */
export const conductorWinFrames: (() => string)[] = [
  () => headArt({ ...POSES.laugh, capUp: 14, capTilt: -8, tache: -5, squash: 1.02 }, true),
  () => headArt({ ...POSES.laugh, mouth: 'grin', capUp: 4, capTilt: -3, tache: 1, squash: 0.97 }, true),
  () => headArt({ ...POSES.laugh, capUp: 16, capTilt: 7, tache: -6, squash: 1.03 }, true),
  () => headArt({ eyes: 'open', mouth: 'laugh', brow: [-4, 1.1, -3], capUp: 5, capTilt: 2, tache: 0, squash: 0.98 }, true),
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
  | 'browL'
  | 'browR'
  | 'moustache'
  | `mouth-${ConMouth}`;

/** Where the head hangs from the neck (256 box). */
export const CON_HEAD_PIVOT: [number, number] = [128, 236];
/** Eye centres (both share y, rx, ry) and the pupils' resting offset. */
export const CON_EYES = { L: EYE_L, R: EYE_R, y: EYE_Y, rx: ERX, ry: ERY, pupil: PUP };
export const CON_BROWS = { L: BROW_L, R: BROW_R };
/** Mouth centre (the whistle's mouthpiece goes here), in the head box. */
export const CON_MOUTH: [number, number] = [128, 234];
/** The cap's pivot (back of the band) and where its crown top sits (for a doff), head box. */
export const CON_CAP_PIVOT: [number, number] = [128, 96];

export function conductorRigPart(part: ConPart): RigPart {
  const r = rigPartFull(part);
  return { ...r, svg: cropSvg(r.svg, r.box) };
}

function rigPartFull(part: ConPart): RigPart {
  const eyeSide = (p: string) => (p.endsWith('L') ? EYE_L : EYE_R);
  switch (part) {
    case 'face':
      return { svg: composeSymbol({ ...PAINT, noDrop: true, layers: [EARS(), FACE_LAYER(), FRINGE()], top: `${DOME_SHINE}${BLUSH}` }), box: [36, 50, 184, 212], pivot: [128, 160] };
    case 'cheeks':
      return { svg: composeSymbol({ ...PAINT, noDrop: true, layers: [CHEEKS()], top: CHEEK_TOP }), box: [34, 156, 188, 68], pivot: [128, 190] };
    case 'cap':
      return { svg: grain(capSvgBody()), box: [46, 12, 164, 122], pivot: CON_CAP_PIVOT };
    case 'eyeWhiteL':
    case 'eyeWhiteR': {
      const x = eyeSide(part);
      return { svg: plain(`<ellipse cx="${x}" cy="${EYE_Y}" rx="${ERX}" ry="${ERY}" fill="${C.white}"/>`), box: [x - 17, EYE_Y - 21, 34, 42], pivot: [x, EYE_Y] };
    }
    case 'eyeRingL':
    case 'eyeRingR': {
      const x = eyeSide(part);
      return { svg: plain(`<ellipse cx="${x}" cy="${EYE_Y}" rx="${ERX}" ry="${ERY}" fill="none" stroke="${C.ink}" stroke-width="5.5"/>`), box: [x - 19, EYE_Y - 23, 38, 46], pivot: [x, EYE_Y] };
    }
    case 'pupilL':
    case 'pupilR': {
      const x = eyeSide(part) + PUP[0];
      const y = EYE_Y + PUP[1];
      return { svg: plain(pieEye(x, y, 7.5, 11)), box: [x - 10, y - 13, 20, 26], pivot: [x, y] };
    }
    case 'lidL':
    case 'lidR': {
      // a lid the size of the whole eye hinged at its top: scaled from the top it closes the eye by
      // any amount (0 open, .45 smug, 1 shut); its lower edge is the lash line
      const x = eyeSide(part);
      const top = EYE_Y - ERY - 3;
      const bot = EYE_Y + ERY + 3;
      const w = ERX + 3;
      const lid = `M${x - w} ${EYE_Y - 2} C${x - w} ${top + 2} ${x - 8} ${top} ${x} ${top} C${x + 8} ${top} ${x + w} ${top + 2} ${x + w} ${EYE_Y - 2} C${x + w} ${EYE_Y + 12} ${x + 9} ${bot} ${x} ${bot} C${x - 9} ${bot} ${x - w} ${EYE_Y + 12} ${x - w} ${EYE_Y - 2} Z`;
      const lash = `M${x - w + 1} ${EYE_Y + 6} C${x - 12} ${EYE_Y + 17} ${x - 6} ${bot - 1} ${x} ${bot - 1} C${x + 6} ${bot - 1} ${x + 12} ${EYE_Y + 17} ${x + w - 1} ${EYE_Y + 6}`;
      return {
        svg: grain(`${cel(lid, { ...SKIN, cut: [-4, -5], seed: 38 })}<path d="${lash}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>`),
        box: [x - w - 4, top - 4, 2 * w + 8, bot - top + 8],
        pivot: [x, top],
      };
    }
    case 'lidLaughL':
    case 'lidLaughR': {
      const x = eyeSide(part);
      return { svg: plain(closedEye(x, EYE_Y, 28, true)), box: [x - 20, EYE_Y - 20, 40, 30], pivot: [x, EYE_Y - 6] };
    }
    case 'browL':
      return { svg: plain(bushyBrow(BROW_L.x, BROW_L.y, false)), box: [BROW_L.x - 30, BROW_L.y - 17, 60, 34], pivot: [BROW_L.x, BROW_L.y] };
    case 'browR':
      return { svg: plain(bushyBrow(BROW_R.x, BROW_R.y, true)), box: [BROW_R.x - 30, BROW_R.y - 17, 60, 34], pivot: [BROW_R.x, BROW_R.y] };
    case 'moustache':
      return { svg: grain(`${TACHE_ART()}${NOSE_ART()}`), box: [36, 150, 184, 92], pivot: [128, 206] };
    default: {
      const m = part.slice(6) as ConMouth;
      const box: Record<ConMouth, [number, number, number, number]> = {
        grin: [88, 210, 80, 44],
        laugh: [82, 206, 92, 54],
        pray: [106, 220, 44, 28],
        shock: [110, 213, 36, 40],
        smug: [98, 216, 64, 32],
        whistle: [110, 218, 36, 32],
        grit: [88, 212, 80, 38],
        ooh: [116, 220, 24, 28],
      };
      return { svg: plain(mouthArt(m, nextId('cm'))), box: box[m], pivot: CON_MOUTH };
    }
  }
}
