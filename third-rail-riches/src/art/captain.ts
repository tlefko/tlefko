/**
 * Cap'n Kaboom: the main character. Stout, ginger-bearded, one eye patch, a black tricorn
 * with a skull, red coat, peg leg, and a lit linstock (fuse torch). His head doubles as the
 * top-paying symbol. 256x256 viewBox for every part.
 *
 * `captainHead()` is the whole head (symbol, title cards). `captainRigPart()` cuts the same
 * drawing into the layers the rig animates (face, beard, hat, eye, lid, brows, mouths,
 * moustache), each cropped to its own box so the textures stay small; every part keeps the head's
 * 256 coordinates, so the rig stacks them back into exactly this head.
 */
import { C, composeSymbol, pieEye, closedEye, nextId, brow, scallops, cel, celForm, celTones, shine, mix } from './kit';

export type CaptainExpr = 'idle' | 'blink' | 'laugh' | 'pray' | 'shock' | 'smug';

const FACE = 'M128 86 C168 86 194 114 194 150 C194 186 166 210 128 210 C90 210 62 186 62 150 C62 114 88 86 128 86 Z';
const CROWN = 'M76 100 C70 58 96 18 128 16 C160 18 186 58 180 100 Z';
const BRIM =
  'M6 54 C28 74 54 88 84 94 C104 98 118 98 128 108 C138 98 152 98 172 94 C202 88 228 74 250 54 C254 90 230 112 192 120 C164 125 146 123 128 134 C110 123 92 125 64 120 C26 112 2 90 6 54 Z';
const BRIM_TOP = 'M6 54 C28 74 54 88 84 94 C104 98 118 98 128 108 C138 98 152 98 172 94 C202 88 228 74 250 54';
const BRIM_UNDER = 'M20 92 C40 108 70 116 100 118 C112 119 122 124 128 130 C134 124 144 119 156 118 C186 116 216 108 236 92';

/** The beard: scalloped outer edge from sideburn to sideburn, cut in over the cheeks. */
function beardPath(): string {
  const outer: [number, number][] = [
    [64, 150],
    [58, 176],
    [62, 202],
    [76, 224],
    [96, 240],
    [118, 250],
    [138, 250],
    [160, 240],
    [180, 224],
    [194, 202],
    [198, 176],
    [192, 150],
  ];
  return `M64 150${scallops(outer, 0.3, -1)} C184 176 164 190 128 194 C92 190 72 176 64 150 Z`;
}

const MUSTACHE =
  'M128 190 C114 178 90 178 76 190 C68 198 72 210 82 208 C86 198 100 194 112 198 C120 200 124 204 128 206 C132 204 136 200 144 198 C156 194 170 198 174 208 C184 210 188 198 180 190 C166 178 142 178 128 190 Z';

/** Skull and crossbones stencil, centred on (cx, cy), `s` = skull width. */
export function skullAndBones(cx: number, cy: number, s: number, fill: string = C.white, bones = true): string {
  const k = s / 40;
  const skull = `M${cx} ${cy - 18 * k} C${cx + 13 * k} ${cy - 18 * k} ${cx + 20 * k} ${cy - 9 * k} ${cx + 20 * k} ${cy + 1 * k} C${cx + 20 * k} ${cy + 9 * k} ${cx + 14 * k} ${cy + 12 * k} ${cx + 12 * k} ${cy + 14 * k} L${cx + 12 * k} ${cy + 20 * k} L${cx - 12 * k} ${cy + 20 * k} L${cx - 12 * k} ${cy + 14 * k} C${cx - 14 * k} ${cy + 12 * k} ${cx - 20 * k} ${cy + 9 * k} ${cx - 20 * k} ${cy + 1 * k} C${cx - 20 * k} ${cy - 9 * k} ${cx - 13 * k} ${cy - 18 * k} ${cx} ${cy - 18 * k} Z`;
  const bone = (a: number) => {
    const r = 30 * k;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const nub = (x: number, y: number) =>
      `<circle cx="${(x + Math.cos(a + 1.2) * 3.4 * k).toFixed(1)}" cy="${(y + Math.sin(a + 1.2) * 3.4 * k).toFixed(1)}" r="${(4.6 * k).toFixed(1)}"/><circle cx="${(x + Math.cos(a - 1.2) * 3.4 * k).toFixed(1)}" cy="${(y + Math.sin(a - 1.2) * 3.4 * k).toFixed(1)}" r="${(4.6 * k).toFixed(1)}"/>`;
    return `<path d="M${(cx - dx).toFixed(1)} ${(cy + 6 * k - dy).toFixed(1)} L${(cx + dx).toFixed(1)} ${(cy + 6 * k + dy).toFixed(1)}" stroke-width="${(7 * k).toFixed(1)}"/>${nub(cx - dx, cy + 6 * k - dy)}${nub(cx + dx, cy + 6 * k + dy)}`;
  };
  return `<g>
    ${bones ? `<g stroke="${C.ink}" stroke-width="${(12 * k).toFixed(1)}" stroke-linecap="round" fill="${C.ink}">${bone(0.62).replace(/stroke-width="[^"]*"/, `stroke-width="${(13 * k).toFixed(1)}"`)}${bone(-0.62).replace(/stroke-width="[^"]*"/, `stroke-width="${(13 * k).toFixed(1)}"`)}</g>
    <g stroke="${fill}" fill="${fill}" stroke-linecap="round">${bone(0.62)}${bone(-0.62)}</g>` : ''}
    <path d="${skull}" fill="${fill}" stroke="${C.ink}" stroke-width="${(3.5 * k).toFixed(1)}" stroke-linejoin="round"/>
    <ellipse cx="${cx - 7.5 * k}" cy="${cy + 1 * k}" rx="${5.8 * k}" ry="${6.6 * k}" fill="${C.ink}"/>
    <ellipse cx="${cx + 7.5 * k}" cy="${cy + 1 * k}" rx="${5.8 * k}" ry="${6.6 * k}" fill="${C.ink}"/>
    <path d="M${cx} ${cy + 6 * k} L${cx - 3 * k} ${cy + 11 * k} L${cx + 3 * k} ${cy + 11 * k} Z" fill="${C.ink}"/>
    <path d="M${cx - 6 * k} ${cy + 15 * k} L${cx - 6 * k} ${cy + 20 * k} M${cx} ${cy + 15 * k} L${cx} ${cy + 20 * k} M${cx + 6 * k} ${cy + 15 * k} L${cx + 6 * k} ${cy + 20 * k}" stroke="${C.ink}" stroke-width="${(2.4 * k).toFixed(1)}"/>
  </g>`;
}

/* ---------------------------------- mouths ---------------------------------- */
const GRIN = 'M92 206 Q128 220 164 206 Q158 242 128 244 Q98 242 92 206 Z';
const LAUGH = 'M86 202 Q128 216 170 202 Q164 252 128 254 Q92 252 86 202 Z';
const GRIT = 'M88 208 Q128 216 168 208 Q166 232 128 234 Q90 232 88 208 Z';

/** Open mouth: dark inside, tongue, the top teeth band with the gold tooth, all clipped to `d`. */
function withTongue(d: string, ty: number, tr: number, tooth: boolean, mid: string): string {
  return `
    <path d="${d}" fill="${C.ink}"/>
    <clipPath id="${mid}"><path d="${d}"/></clipPath>
    <g clip-path="url(#${mid})">
      <ellipse cx="128" cy="${ty}" rx="${tr}" ry="${tr * 0.55}" fill="${C.crimson}"/>
      ${tooth ? `<path d="M84 200 L172 200 L172 218 Q128 230 84 218 Z" fill="${C.white}"/>
        <path d="M104 204 L104 222 M118 206 L118 226 M138 206 L138 226 M152 204 L152 222" stroke="${C.ink}" stroke-width="2.5"/>
        <path d="M84 216 Q128 230 172 216" stroke="${C.ink}" stroke-width="3" fill="none"/>
        <rect x="119.5" y="203" width="17" height="21" rx="3" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.5"/>
        <path d="M123 207 L123 218" stroke="${C.goldLight}" stroke-width="3" stroke-linecap="round"/>` : ''}
    </g>
    <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linejoin="round"/>`;
}

/** Rig mouth shapes. The first five are the head's own expressions; grit and ooh are rig-only. */
export type CapMouth = 'grin' | 'laugh' | 'pray' | 'shock' | 'smug' | 'grit' | 'ooh';

function mouthArt(m: CapMouth, mid: string): string {
  switch (m) {
    case 'grin':
      return withTongue(GRIN, 244, 20, true, mid);
    case 'laugh':
      return withTongue(LAUGH, 252, 28, true, mid);
    case 'pray':
      return `<path d="M110 218 Q119 210 128 218 Q137 226 146 218" stroke="${C.ink}" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'shock':
      return `<ellipse cx="128" cy="222" rx="16" ry="20" fill="${C.ink}"/><ellipse cx="128" cy="232" rx="10" ry="6" fill="${C.crimson}"/>`;
    case 'smug':
      return `<path d="M100 210 Q126 224 158 204" stroke="${C.ink}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <rect x="140" y="206" width="11" height="10" rx="2" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.5" transform="rotate(-18 145 211)"/>`;
    case 'grit':
      // clenched: both rows of teeth showing, the gold tooth up top
      return `<path d="${GRIT}" fill="${C.ink}"/>
        <clipPath id="${mid}"><path d="${GRIT}"/></clipPath>
        <g clip-path="url(#${mid})">
          <path d="M84 204 L172 204 L172 219 Q128 227 84 219 Z" fill="${C.white}"/>
          <path d="M84 223 Q128 231 172 223 L172 240 L84 240 Z" fill="${C.paperWarm}"/>
          <path d="M104 206 L104 232 M116 208 L116 234 M140 208 L140 234 M152 206 L152 232" stroke="${C.ink}" stroke-width="2.5"/>
          <path d="M86 221 Q128 229 170 221" stroke="${C.ink}" stroke-width="3" fill="none"/>
          <rect x="120" y="206" width="16" height="14" rx="3" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.4"/>
        </g>
        <path d="${GRIT}" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linejoin="round"/>`;
    case 'ooh':
      return `<ellipse cx="128" cy="220" rx="10" ry="12" fill="${C.ink}"/><ellipse cx="128" cy="226" rx="6" ry="3.6" fill="${C.crimson}"/>`;
  }
}

/* ----------------------------------- face ----------------------------------- */
const EYE_X = 160;
const EYE_Y = 154;

function faceParts(expr: CaptainExpr, mid: string) {
  const eyeX = EYE_X;
  const eyeY = EYE_Y;
  const white = `<ellipse cx="${eyeX}" cy="${eyeY}" rx="16" ry="20" fill="${C.white}" stroke="${C.ink}" stroke-width="6"/>`;
  let eye = '';
  let browR = brow(141, 128, 181, 132, -7, 5.5, C.ginger);
  let browL = brow(76, 132, 116, 128, -7, 5.5, C.ginger);
  let mouth = '';
  switch (expr) {
    case 'idle':
      eye = white + pieEye(eyeX + 3, eyeY + 4, 8.5, 12.5);
      mouth = mouthArt('grin', mid);
      break;
    case 'blink':
      eye = closedEye(eyeX, eyeY + 2, 30, false);
      mouth = mouthArt('grin', mid);
      break;
    case 'laugh':
      eye = closedEye(eyeX, eyeY - 2, 32, true);
      browR = brow(141, 122, 181, 124, -8, 5.5, C.ginger);
      browL = brow(76, 124, 116, 122, -8, 5.5, C.ginger);
      mouth = mouthArt('laugh', mid);
      break;
    case 'pray':
      eye = white + pieEye(eyeX + 1, eyeY - 6, 8.5, 11.5);
      browR = brow(142, 124, 180, 134, 6, 5, C.ginger);
      browL = brow(76, 134, 114, 124, -6, 5, C.ginger);
      mouth = mouthArt('pray', mid);
      break;
    case 'shock':
      eye = `<ellipse cx="${eyeX}" cy="${eyeY - 2}" rx="18" ry="23" fill="${C.white}" stroke="${C.ink}" stroke-width="6"/><ellipse cx="${eyeX}" cy="${eyeY}" rx="6" ry="8" fill="${C.ink}"/>`;
      browR = brow(142, 118, 182, 124, 5, 5, C.ginger);
      browL = brow(76, 124, 114, 118, -5, 5, C.ginger);
      mouth = mouthArt('shock', mid);
      break;
    case 'smug':
      eye =
        white +
        pieEye(eyeX + 4, eyeY + 6, 8, 10.5) +
        `<path d="M${eyeX - 17} ${eyeY - 2} Q${eyeX} ${eyeY - 12} ${eyeX + 17} ${eyeY - 2} L${eyeX + 17} ${eyeY - 22} L${eyeX - 17} ${eyeY - 22} Z" fill="${C.skin}"/>
         <path d="M${eyeX - 17} ${eyeY - 2} Q${eyeX} ${eyeY - 10} ${eyeX + 17} ${eyeY - 2}" stroke="${C.ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
      browR = brow(141, 134, 181, 130, -3, 5.5, C.ginger);
      mouth = mouthArt('smug', mid);
      break;
  }
  return { eye, brows: browL + browR, mouth };
}

/* Hand-cel tones (docs/ART.md; kit.ts celTones): flat base, cut shadow, light band, hatch ink. */
const SKIN = celTones(C.skin, C.skinDeep, C.skinLight);
const GINGER = celTones(C.ginger, C.gingerDeep, C.gingerLight);
const HAT = { base: mix(C.navy, C.inkSoft, 0.45), shade: mix(C.ink, C.navy, 0.28), light: mix(C.navyLight, C.navy, 0.35), hatch: mix(C.ink, C.navy, 0.12) };
const NOSE = celTones(mix(C.skin, C.crimsonLight, 0.3), C.skinDeep, C.skinLight);
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

const CURLS = `<g fill="none" stroke="${C.gingerDeep}" stroke-width="4" stroke-linecap="round" opacity=".75">
      <path d="M80 214 q8 -8 16 0"/><path d="M104 232 q8 -8 16 0"/><path d="M136 232 q8 -8 16 0"/><path d="M160 214 q8 -8 16 0"/><path d="M70 184 q7 -8 14 0"/><path d="M172 184 q7 -8 14 0"/>
    </g>`;
type Lay = { fills: string; lines: string };
const EARS = (): Lay => {
  const l = celForm(circle(64, 158, 15), { ...SKIN, cut: [-5, -6], seed: 30 });
  const r = celForm(circle(192, 158, 15), { ...SKIN, cut: [-5, -6], seed: 31 });
  return { fills: l.fills + r.fills, lines: l.line() + r.line() };
};
const FACE_LAYER = (): Lay => {
  const f = celForm(FACE, { ...SKIN, cut: [-13, -15], twist: -3, seed: 32 });
  return { fills: f.fills, lines: f.line() };
};
const BEARD_LAYER = (): Lay => {
  const b = celForm(beardPath(), { ...GINGER, cut: [-11, -13], twist: -2, hatch: GINGER.hatch, hatchGap: 5.5, seed: 33 });
  return { fills: b.fills, lines: b.line() };
};
const CROWN_LAYER = (): Lay => {
  const c = celForm(CROWN, { ...HAT, cut: [-13, -12], shrink: 0.97, hatch: HAT.hatch, hatchGap: 5.5, seed: 34 });
  return { fills: c.fills, lines: c.line() };
};
const BRIM_LAYER = (): Lay => {
  const b = celForm(BRIM, { ...HAT, cut: [-7, -10], hatch: HAT.hatch, hatchGap: 5.5, seed: 35 });
  return { fills: b.fills, lines: b.line() };
};
const HAT_TRIM = `
      <path d="${BRIM_UNDER}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" opacity=".6"/>
      <path d="${BRIM_TOP}" fill="none" stroke="${C.goldDeep}" stroke-width="8" stroke-linecap="round" transform="translate(0 4.5)"/>
      <path d="${BRIM_TOP}" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linecap="round" transform="translate(0 3.5)"/>
      ${shine([[30, 77], [52, 90], [76, 98], [100, 102]], 1.6, 0.9, C.goldLight)}
      ${shine([[170, 34], [182, 50], [186, 72], [182, 98]], 3, 0.6, C.moonGlow)}
      ${shine([[214, 84], [230, 76], [242, 66], [248, 58]], 2.4, 0.55, C.moonGlow)}`;
const HAT_BADGE = `${skullAndBones(128, 62, 32)}
      ${shine([[92, 42], [100, 30], [118, 22]], 3.4, 0.5)}`;
const BLUSH = `<ellipse cx="86" cy="186" rx="13" ry="8" fill="${C.crimsonLight}" opacity=".45"/>
      <ellipse cx="172" cy="186" rx="13" ry="8" fill="${C.crimsonLight}" opacity=".45"/>`;
const PATCH = `<path d="M116 146 Q150 128 190 126" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M80 146 Q70 140 62 134" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="98" cy="156" rx="21" ry="18" fill="${C.ink}" transform="rotate(-8 98 156)"/>
      ${shine([[86, 149], [94, 143], [104, 144]], 1.8, 0.8, C.g3)}`;
const MOUSTACHE = () => `${cel(MUSTACHE, { ...GINGER, cut: [-5, -6], seed: 36 })}<path d="${MUSTACHE}" fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
      ${shine([[96, 187], [108, 182], [120, 188]], 1.8, 0.85, C.gingerLight)}${shine([[136, 188], [148, 182], [160, 187]], 1.8, 0.85, C.gingerLight)}`;
const NOSE_ART = () => `${cel(circle(128, 176, 15), { ...NOSE, cut: [-6, -7], seed: 37 })}<circle cx="128" cy="176" r="15" fill="none" stroke="${C.ink}" stroke-width="6"/>
      <ellipse cx="123" cy="170" rx="5" ry="3.5" fill="#fff" opacity=".8"/>`;
const EARRING = `<circle cx="196" cy="176" r="8" fill="none" stroke="${C.ink}" stroke-width="7"/>
      <circle cx="196" cy="176" r="8" fill="none" stroke="${C.gold}" stroke-width="3.5"/>
      <path d="M190 171 A8 8 0 0 1 197 168" fill="none" stroke="${C.goldLight}" stroke-width="1.6" stroke-linecap="round"/>`;
/** The paint shared by every captain head raster (kit.ts opt-ins, the house look). */
const PAINT = { autoCel: false, texture: { seed: 9 }, contour: 0.8, inkShift: [1, 1.2] as [number, number] };
/** Grain only (inner parts of the rig head: no outer contour of their own). */
const grain = (body: string) => composeSymbol({ autoCel: false, texture: { seed: 9 }, inkShift: [1, 1.2], noDrop: true, layers: [{ fills: '' }], top: body });
/** Symbol framing: pulled in so the brim and beard stay clear of the reel cell's edge. */
const SYMBOL_INSET = 'translate(128 128) scale(.96) translate(-128 -128)';

/**
 * Cap'n Kaboom's head. `symbol` adds the parchment sticker outline + drop shadow used on the
 * reels; the rig version has neither.
 */
export function captainHead(expr: CaptainExpr = 'idle', symbol = false): string {
  const mid = nextId('cm');
  const { eye, brows, mouth } = faceParts(expr, mid);
  return composeSymbol({
    ...PAINT,
    noDrop: !symbol,
    transform: symbol ? SYMBOL_INSET : undefined,
    layers: [EARS(), FACE_LAYER(), BEARD_LAYER(), CROWN_LAYER(), BRIM_LAYER()],
    top: `
      ${CURLS}
      ${HAT_TRIM}
      ${HAT_BADGE}
      ${BLUSH}
      ${PATCH}
      ${eye}
      ${brows}
      ${mouth}
      ${MOUSTACHE()}
      ${NOSE_ART()}
      ${EARRING}`,
  });
}

/* --------------------------------- rig parts --------------------------------- */
/** Crop box [x, y, w, h] in the 256 head box, and the part's pivot in the same coordinates. */
export interface RigPart {
  svg: string;
  box: [number, number, number, number];
  pivot: [number, number];
}

/** Re-frame a 256-box SVG to one region of it (the art keeps its coordinates). */
export function cropSvg(svg: string, box: [number, number, number, number]): string {
  const [x, y, w, h] = box;
  return svg.replace(/viewBox="0 0 256 256" width="256" height="256"/, `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);
}

const plain = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs>${defs}</defs>${body}</svg>`;

export type CapPart =
  | 'face'
  | 'beard'
  | 'hat'
  | 'eyeWhite'
  | 'eyeRing'
  | 'pupil'
  | 'lid'
  | 'lidLaugh'
  | 'browR'
  | 'browL'
  | 'moustache'
  | `mouth-${CapMouth}`;

/** Where the head's layers pivot (256 box). The rig hangs the whole head from HEAD_PIVOT. */
export const HEAD_PIVOT: [number, number] = [128, 205];
export const CAP_EYE = { x: EYE_X, y: EYE_Y, rx: 16, ry: 20, pupil: [EYE_X + 3, EYE_Y + 4] as [number, number] };
/** Brow centres and resting angles (the rig moves them per expression). */
export const CAP_BROWS = { R: { x: 161, y: 130, a: Math.atan2(4, 40) }, L: { x: 96, y: 130, a: Math.atan2(-4, 40) } };

export function captainRigPart(part: CapPart): RigPart {
  const r = rigPartFull(part);
  return { ...r, svg: cropSvg(r.svg, r.box) };
}

function rigPartFull(part: CapPart): RigPart {
  switch (part) {
    case 'face':
      return {
        svg: composeSymbol({ ...PAINT, noDrop: true, layers: [EARS(), FACE_LAYER()], top: `${PATCH}${EARRING}` }),
        box: [40, 76, 176, 144],
        pivot: [128, 150],
      };
    case 'beard':
      return {
        svg: composeSymbol({ ...PAINT, noDrop: true, layers: [BEARD_LAYER()], top: `${CURLS}${BLUSH}` }),
        box: [44, 138, 168, 124],
        pivot: [128, 172],
      };
    case 'hat':
      return {
        svg: composeSymbol({ ...PAINT, noDrop: true, layers: [CROWN_LAYER(), BRIM_LAYER()], top: `${HAT_TRIM}${HAT_BADGE}` }),
        box: [0, 4, 256, 140],
        pivot: [128, 116],
      };
    case 'eyeWhite':
      return { svg: plain('', `<ellipse cx="${EYE_X}" cy="${EYE_Y}" rx="16" ry="20" fill="${C.white}"/>`), box: [140, 130, 40, 48], pivot: [EYE_X, EYE_Y] };
    case 'eyeRing':
      return { svg: plain('', `<ellipse cx="${EYE_X}" cy="${EYE_Y}" rx="16" ry="20" fill="none" stroke="${C.ink}" stroke-width="6"/>`), box: [136, 126, 48, 56], pivot: [EYE_X, EYE_Y] };
    case 'pupil': {
      const [px, py] = CAP_EYE.pupil;
      return { svg: plain('', pieEye(px, py, 8.5, 12.5)), box: [px - 11, py - 15, 22, 30], pivot: [px, py] };
    }
    case 'lid': {
      // an eyelid the size of the whole eye, hinged at its top: scaled down from the top it
      // closes the eye by any amount (0 open, 0.45 smug, 1 shut); its lower edge is the lash line
      const top = EYE_Y - 23;
      const lid = `M${EYE_X - 19} ${EYE_Y - 2} C${EYE_X - 19} ${top + 2} ${EYE_X - 10} ${top} ${EYE_X} ${top} C${EYE_X + 10} ${top} ${EYE_X + 19} ${top + 2} ${EYE_X + 19} ${EYE_Y - 2} C${EYE_X + 19} ${EYE_Y + 14} ${EYE_X + 10} ${EYE_Y + 23} ${EYE_X} ${EYE_Y + 23} C${EYE_X - 10} ${EYE_Y + 23} ${EYE_X - 19} ${EYE_Y + 14} ${EYE_X - 19} ${EYE_Y - 2} Z`;
      const lash = `M${EYE_X - 18} ${EYE_Y + 6} C${EYE_X - 14} ${EYE_Y + 19} ${EYE_X - 6} ${EYE_Y + 22} ${EYE_X} ${EYE_Y + 22} C${EYE_X + 6} ${EYE_Y + 22} ${EYE_X + 14} ${EYE_Y + 19} ${EYE_X + 18} ${EYE_Y + 6}`;
      return {
        svg: grain(`${cel(lid, { ...SKIN, cut: [-4, -5], seed: 38 })}<path d="${lash}" fill="none" stroke="${C.ink}" stroke-width="6.5" stroke-linecap="round"/>`),
        box: [EYE_X - 24, top - 4, 48, 54],
        pivot: [EYE_X, top],
      };
    }
    case 'lidLaugh':
      return { svg: plain('', closedEye(EYE_X, EYE_Y - 2, 32, true)), box: [EYE_X - 24, EYE_Y - 24, 48, 34], pivot: [EYE_X, EYE_Y - 8] };
    case 'browR':
      return { svg: plain('', brow(141, 128, 181, 132, -7, 5.5, C.ginger)), box: [134, 112, 54, 28], pivot: [CAP_BROWS.R.x, CAP_BROWS.R.y] };
    case 'browL':
      return { svg: plain('', brow(76, 132, 116, 128, -7, 5.5, C.ginger)), box: [69, 112, 54, 28], pivot: [CAP_BROWS.L.x, CAP_BROWS.L.y] };
    case 'moustache':
      return { svg: grain(`${MOUSTACHE()}${NOSE_ART()}`), box: [66, 154, 124, 62], pivot: [128, 192] };
    default: {
      const m = part.slice(6) as CapMouth;
      const box: Record<CapMouth, [number, number, number, number]> = {
        grin: [86, 198, 84, 52],
        laugh: [80, 196, 96, 64],
        pray: [104, 204, 48, 26],
        shock: [108, 198, 40, 48],
        smug: [94, 196, 70, 30],
        grit: [82, 200, 92, 40],
        ooh: [114, 204, 28, 32],
      };
      return { svg: plain('', mouthArt(m, nextId('cm'))), box: box[m], pivot: [128, 220] };
    }
  }
}
