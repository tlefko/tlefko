/**
 * Conductor Casey's body parts for the rig (render/characters/Conductor.ts), painted like his head
 * (art/conductor.ts, cast/paint.ts): three flat cel values per material, a warm rim, bold ink
 * weighted lower right, no hatching or noise.
 *
 * - `caseyTorso()` the navy double-breasted coat to the waist seam over a round belly: lapels,
 *   white wing collar, crimson bow tie, two rows of brass buttons, the gold watch chain, a ticket
 *   in the breast pocket. `caseySkirt()` the coat's flared skirt below the waist seam, a separate
 *   sprite so it swings and flares (follow-through). Both in one 256 box (see CASEY_TORSO).
 * - `caseyBoot()` a chunky polished boot under a trouser cuff.
 * - `caseyGlove(pose)` white cartoon gloves with real fingers (three and a thumb), wrist at
 *   (128, 220), fingers up: open, fist, point, flat, thumb, grip.
 * - `caseyPrayingHands()` two gloves pressed together.
 * - the signal lantern in two layers (`caseyLanternGlass` behind, `caseyLanternBody` in front).
 * - `caseyWhistle()` the brass pea whistle; `caseyWatch()` the gold pocket watch (open face);
 *   `caseyCapHeld()` the cap doffed in his hand.
 */
import { C, composeSymbol, nextId, mix } from '../kit';
import { formLine, form, union, tones, brush, ellipse, circle, glint, inked } from './paint';
import { wingedWheel } from '../conductor';
import type { V } from '../geo';

const NAVY = { ...tones(C.uniform, C.uniformDeep, C.uniformLight, C.amber, 0.62), light: mix(C.uniform, C.uniformLight, 0.5), rim: mix(mix(C.uniform, C.uniformDeep, 0.62), C.volt, 0.24) };
const NAVY_LAPEL = { base: mix(C.uniform, C.uniformLight, 0.22), shade: mix(C.uniform, C.uniformDeep, 0.5), light: mix(C.uniform, C.uniformLight, 0.6) };
const NAVY_DEEP = { base: mix(C.uniform, C.uniformDeep, 0.45), shade: mix(C.uniformDeep, C.ink, 0.3), light: mix(C.uniform, C.uniformLight, 0.3), rim: mix(C.uniformDeep, C.volt, 0.22) };
const SHIRT = { base: C.white, shade: mix(C.steelLight, C.steel, 0.45), light: '#ffffff' };
const GLOVE = { base: mix(C.white, '#ffffff', 0.3), shade: mix(C.steelLight, C.steel, 0.55), light: '#ffffff', rim: mix(C.steelLight, C.amberLight, 0.6) };
const CUFF = { base: mix(C.white, C.steelLight, 0.55), shade: mix(C.steelLight, C.steel, 0.7), light: '#ffffff' };
const GOLD = { base: C.gold, shade: mix(C.gold, C.goldDeep, 0.6), light: mix(C.gold, C.goldLight, 0.75), rim: mix(C.goldDeep, C.amberLight, 0.4) };
const BLACK = { base: mix(C.inkSoft, C.uniformDeep, 0.3), shade: C.ink, light: mix(C.inkSoft, C.uniformLight, 0.45), rim: mix(C.ink, C.volt, 0.3) };
const IRON = { base: mix(C.iron, C.ironDeep, 0.35), shade: C.ironDeep, light: mix(C.iron, C.ironLight, 0.7), rim: mix(C.ironDeep, C.amber, 0.35) };
const CRIMSON = { ...tones(C.crimson, C.crimsonDeep, C.crimsonLight, C.amber, 0.55) };

const TEX = (seed: number) => ({ seed, mottle: 0.28, grain: 0.32 });
const paint = (seed: number) => ({ autoCel: false, contour: 0.8, inkShift: [1, 1.2] as [number, number], texture: TEX(seed) });

/** Re-frame a 256-box drawing to one region of it (the art keeps its coordinates). */
export function caseyCrop(svg: string, [x, y, w, h]: [number, number, number, number]): string {
  return svg.replace(/viewBox="0 0 (\d+) \1" width="\1" height="\1"/, `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);
}

const button = (x: number, y: number, r = 7) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.2"/>
   <path d="M${x - r * 0.62} ${y + r * 0.1} A${r * 0.66} ${r * 0.66} 0 0 0 ${x + r * 0.5} ${y + r * 0.46}" fill="none" stroke="${GOLD.shade}" stroke-width="${r * 0.32}" stroke-linecap="round"/>
   <circle cx="${x - r * 0.3}" cy="${y - r * 0.32}" r="${r * 0.3}" fill="#fff"/>`;

/* ------------------------------------------------------------------ */
/* torso + skirt                                                       */
/* ------------------------------------------------------------------ */
/**
 * Torso layout in its 256 box: the neck (rig anchor) at `neck`, shoulders at `shoulder` (+/- x),
 * the hip centre at `hip`, the skirt's hinge at `waist`. `box` is the painted region of the torso,
 * `skirtBox` the skirt's.
 */
export const CASEY_TORSO = {
  neck: [128, 36] as [number, number],
  shoulder: [72, 80] as [number, number],
  hip: [128, 206] as [number, number],
  waist: [128, 208] as [number, number],
  /** Where the watch chain's watch pocket is (the pocket watch comes out of here). */
  pocket: [50, 160] as [number, number],
  /** The whistle cord's anchor on the collar. */
  cord: [146, 72] as [number, number],
  box: [8, 18, 240, 214] as [number, number, number, number],
  skirtBox: [14, 194, 228, 70] as [number, number, number, number],
};

const COAT = 'M128 30 C158 30 184 38 198 54 C214 72 232 110 236 150 C240 182 228 204 210 210 Q128 224 46 210 C28 204 16 182 20 150 C24 110 42 72 58 54 C72 38 98 30 128 30 Z';
const SKIRT_L = 'M46 202 Q86 212 126 214 L120 238 C118 246 112 252 104 254 Q64 260 28 250 C30 236 36 218 46 202 Z';
const SKIRT_R = 'M210 202 Q170 212 130 214 L136 238 C138 246 144 252 152 254 Q192 260 228 250 C226 236 220 218 210 202 Z';

export function caseyTorso(): string {
  const coat = formLine(COAT, { ...NAVY, cut: [-18, -14], twist: -3, shrink: 0.98, band: [6, 6], rimCut: [-7, -7] });
  // the shirt V, wing collar and bow tie sit just under his chin
  const shirt = formLine('M108 40 L148 40 L128 92 Z', { ...SHIRT, cut: [-3, -3] });
  const lapL = formLine('M106 40 L128 94 L116 102 C104 84 92 64 86 48 Z', { ...NAVY_LAPEL, cut: [-3, -4] });
  const lapR = formLine('M150 40 L128 94 L140 102 C152 84 164 64 170 48 Z', { ...NAVY_LAPEL, cut: [-3, -4] });
  const colL = formLine('M108 42 L124 58 L104 64 Z', { ...SHIRT, cut: [-2, -2] });
  const colR = formLine('M148 42 L132 58 L152 64 Z', { ...SHIRT, cut: [-2, -2] });
  const tie = formLine('M128 66 C118 56 106 56 104 60 C100 66 100 74 104 80 C108 84 118 80 128 70 Z M128 66 C138 56 150 56 152 60 C156 66 156 74 152 80 C148 84 138 80 128 70 Z', { ...CRIMSON, cut: [-3, -3] });
  const knot = formLine(ellipse(128, 68, 7, 8), { ...CRIMSON, base: mix(C.crimson, C.crimsonDeep, 0.25), cut: [-2, -2] });
  const buttons = [
    [106, 116],
    [100, 146],
    [102, 176],
  ]
    .map(([x, y]) => button(x, y) + button(256 - x, y))
    .join('');
  const chain = 'M98 148 C92 176 66 180 50 162';
  const chainArt = `<path d="${chain}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
    <path d="${chain}" fill="none" stroke="${C.gold}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="${chain}" fill="none" stroke="${C.goldLight}" stroke-width="1.8" stroke-dasharray="2.4 4.2" stroke-linecap="round"/>
    <circle cx="75" cy="174" r="4.6" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.4"/>`;
  const ticket = formLine('M168 78 L192 82 L188 108 L164 104 Z', { base: C.cream, shade: C.tileDeep, light: '#ffffff', cut: [-2, -2] });
  const pocketL = `<path d="M36 162 Q50 156 64 160" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  const pocketR = `<path d="M160 102 Q180 98 200 104" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  return composeSymbol({
    ...paint(13),
    noDrop: true,
    layers: [
      { fills: coat.fills, lines: `${coat.line()}<path d="M128 102 L128 214" stroke-width="4" opacity=".55"/><path d="M40 118 Q34 156 42 192" stroke-width="3.5" opacity=".3"/>` },
      { fills: shirt.fills, lines: shirt.line('stroke-width="4.5"') },
      { fills: lapL.fills + lapR.fills, lines: `${lapL.line('stroke-width="5"')}${lapR.line('stroke-width="5"')}` },
      { fills: colL.fills + colR.fills, lines: `${colL.line('stroke-width="4"')}${colR.line('stroke-width="4"')}` },
      { fills: tie.fills, lines: tie.line('stroke-width="4.5"') },
      { fills: knot.fills, lines: knot.line('stroke-width="4"') },
      { fills: ticket.fills, lines: `${ticket.line('stroke-width="3.5"')}<path d="M172 88 L186 90 M171 95 L183 97" stroke-width="2" opacity=".35"/>` },
    ],
    top: `
      ${pocketL}${pocketR}
      ${buttons}
      ${chainArt}
      ${glint([[54, 116], [44, 142], [42, 170]], 4, C.uniformLight, 0.55)}
      ${glint([[86, 52], [72, 64], [62, 80]], 2.6, C.uniformLight, 0.5)}`,
  });
}

/** The coat's skirt below the waist seam (same 256 box as the torso; hinge CASEY_TORSO.waist). */
export function caseySkirt(): string {
  const l = formLine(SKIRT_L, { ...NAVY_DEEP, cut: [-10, -6], band: [4, 3] });
  const r = formLine(SKIRT_R, { ...NAVY_DEEP, cut: [-10, -6], band: [4, 3] });
  return composeSymbol({
    ...paint(14),
    noDrop: true,
    layers: [
      { fills: r.fills, lines: r.line() },
      { fills: l.fills, lines: `${l.line()}<path d="M70 222 Q66 236 64 250" stroke-width="3" opacity=".35"/>` },
    ],
    top: `${glint([[44, 214], [38, 230], [36, 244]], 2.4, C.uniformLight, 0.45)}`,
  });
}

/* ------------------------------------------------------------------ */
/* boots                                                               */
/* ------------------------------------------------------------------ */
/** Painted box of the boot (ink included) in its 256 box. Ankle at (128, 70), sole on y = 211, toe to the right. */
export const CASEY_BOOT_BOX: [number, number, number, number] = [48, 40, 194, 178];
export function caseyBoot(): string {
  const boot = 'M96 64 L160 64 L162 120 C200 120 232 138 234 170 C236 196 210 206 172 206 L90 206 C62 206 52 186 58 160 C62 140 76 126 94 122 Z';
  const sole = 'M56 192 C60 205 72 211 90 211 L174 211 C208 211 232 204 235 186 C228 198 208 202 172 202 L90 202 C72 202 60 200 56 192 Z';
  const cuff = 'M82 44 L174 44 L170 88 Q128 100 86 88 Z';
  const b = formLine(boot, { ...BLACK, cut: [-12, -10], band: [5, 5] });
  const s = formLine(sole, { base: C.woodDark, shade: C.woodDeep, light: C.woodMid, cut: [-2, -2] });
  const c = formLine(cuff, { ...NAVY_DEEP, cut: [-8, -5], band: [3, 3] });
  return composeSymbol({
    ...paint(15),
    noDrop: true,
    layers: [
      { fills: b.fills, lines: `${b.line()}<path d="M162 126 Q150 148 152 172" stroke-width="3.5" opacity=".5"/>` },
      { fills: s.fills, lines: s.line('stroke-width="5"') },
      { fills: c.fills, lines: c.line() },
    ],
    top: `
      ${glint([[172, 136], [198, 142], [218, 158]], 4.6, C.steelLight, 0.8)}
      ${glint([[72, 156], [78, 140], [92, 132]], 3, C.steelLight, 0.5)}
      <circle cx="200" cy="148" r="2.8" fill="#fff"/>`,
  });
}

/* ------------------------------------------------------------------ */
/* gloves                                                              */
/* ------------------------------------------------------------------ */
export type CaseyHand = 'open' | 'fist' | 'point' | 'flat' | 'thumb' | 'grip';
/** The gloves' painted box in their 256 box (every pose fits): crop the textures to it; the wrist stays (128, 220). */
export const CASEY_GLOVE_BOX: [number, number, number, number] = [36, 18, 164, 236];
const cap = (pts: V[], w: number) => brush(pts, () => w, 18);
const CUFF_D = 'M88 194 Q128 182 168 194 L174 230 Q128 246 82 230 Z';

/**
 * White cartoon glove (three fingers and a thumb), wrist at the bottom centre (128, 220), fingers
 * up. `grip` is a fist turned a little so the lantern's bail sits in it (the rig hangs the lantern
 * from the fist centre).
 */
export function caseyGlove(pose: CaseyHand): string {
  let shapes: string[] = [];
  let inner = '';
  let front = '';
  switch (pose) {
    case 'open':
      shapes = [
        'M94 200 C80 178 80 140 90 120 C102 102 154 102 166 120 C178 140 176 178 162 200 Z',
        cap([[104, 126], [97, 88], [92, 56]], 13),
        cap([[128, 120], [128, 78], [128, 44]], 13.5),
        cap([[152, 126], [160, 90], [166, 60]], 13),
        cap([[98, 168], [78, 150], [62, 130]], 12.5),
      ];
      inner = `<path d="M114 112 Q116 124 116 138 M141 112 Q140 124 140 138" stroke-width="4"/><path d="M96 150 Q104 160 108 172" stroke-width="3.5" opacity=".55"/>`;
      break;
    case 'flat':
      shapes = [
        'M96 200 C84 178 84 140 92 120 C104 104 152 104 164 120 C174 140 172 178 160 200 Z',
        cap([[104, 124], [104, 84], [104, 50]], 12.5),
        cap([[128, 120], [128, 80], [128, 44]], 12.5),
        cap([[152, 124], [152, 86], [152, 54]], 12.5),
        cap([[94, 172], [84, 150], [82, 132]], 11.5),
      ];
      inner = `<path d="M116 60 L116 128 M140 62 L140 128" stroke-width="4"/>`;
      break;
    case 'fist':
    case 'grip':
      shapes = ['M86 200 C70 178 70 134 88 114 C104 98 152 98 170 112 C188 128 188 178 170 200 Z', cap([[100, 118], [128, 110], [158, 116]], 15)];
      inner = `<path d="M106 116 Q106 132 110 146 M130 112 Q130 130 134 146 M154 116 Q156 132 160 146" stroke-width="4"/><path d="M98 160 Q130 152 170 160" stroke-width="3.5" opacity=".5"/>`;
      front = union([cap([[82, 172], [104, 158], [128, 152]], 12)], { ...GLOVE, cut: [-3, -4], lw: 5 });
      if (pose === 'grip') inner += `<path d="M120 102 Q128 96 136 102" stroke-width="4" opacity=".7"/>`;
      break;
    case 'point':
      shapes = ['M86 200 C70 180 72 142 88 126 C104 112 152 112 170 126 C186 142 186 180 170 200 Z', cap([[122, 128], [120, 82], [118, 46]], 13.5), cap([[148, 130], [162, 124]], 13)];
      inner = `<path d="M140 132 Q142 146 146 156 M110 150 Q140 144 170 152" stroke-width="4" opacity=".7"/>`;
      front = union([cap([[82, 174], [104, 160], [128, 154]], 12)], { ...GLOVE, cut: [-3, -4], lw: 5 });
      break;
    case 'thumb':
      shapes = ['M86 200 C72 180 74 142 92 126 C110 112 160 114 172 130 C186 150 184 182 168 200 Z', cap([[140, 130], [146, 100], [146, 76]], 16.5)];
      inner = `<path d="M92 144 Q124 136 158 144 M94 166 Q128 158 166 168 M98 186 Q128 180 162 188" stroke-width="4" opacity=".75"/><path d="M128 124 Q134 136 132 146" stroke-width="3.5" opacity=".55"/>`;
      break;
  }
  const body = union(shapes, { ...GLOVE, cut: [-7, -8], band: [3, 3.5], rimCut: [-5, -5.5], lw: 6.5 });
  const cuff = formLine(CUFF_D, { ...CUFF, cut: [-5, -5], band: [3, 3] });
  return composeSymbol({
    ...paint(16),
    contour: 0,
    noDrop: true,
    layers: [{ fills: '' }],
    top: `${body}
      ${inked({ fills: '', lines: inner }, 5)}
      ${front}
      ${inked({ fills: cuff.fills, lines: `${cuff.line('stroke-width="6"')}<path d="M94 206 Q128 194 162 206" stroke-width="3.5" opacity=".55"/>` }, 6)}`,
  });
}

/** Two gloves pressed together in prayer, fingers up, wrists at the bottom (128, 220). */
export function caseyPrayingHands(): string {
  const L = union(['M127 46 C116 46 108 56 106 70 L100 120 C96 150 98 178 104 200 L128 202 Z', cap([[100, 160], [86, 140], [84, 120]], 11)], { ...GLOVE, cut: [-6, -7], band: [3, 3], lw: 6.5 });
  const R = union(['M129 46 C140 46 148 56 150 70 L156 120 C160 150 158 178 152 200 L128 202 Z'], { ...GLOVE, base: mix(GLOVE.base, GLOVE.shade, 0.25), cut: [-6, -7], band: [2, 2], lw: 6.5 });
  const cuffD = 'M92 196 Q128 186 164 196 L170 228 Q128 242 86 228 Z';
  const cuff = formLine(cuffD, { ...CUFF, cut: [-5, -5] });
  return composeSymbol({
    ...paint(17),
    contour: 0,
    noDrop: true,
    layers: [{ fills: '' }],
    top: `${R}${L}
      ${inked({ fills: '', lines: `<path d="M128 50 L128 196" stroke-width="4"/><path d="M114 70 L112 120 M142 70 L144 120" stroke-width="3.5" opacity=".5"/>` }, 4)}
      ${inked({ fills: cuff.fills, lines: `${cuff.line('stroke-width="6"')}<path d="M98 208 Q128 198 158 208" stroke-width="3.5" opacity=".55"/>` }, 6)}`,
  });
}

/* ------------------------------------------------------------------ */
/* the signal lantern                                                  */
/* ------------------------------------------------------------------ */
/**
 * The railway hand lantern, two layers that stack exactly (same 256 box, crop CASEY_LANTERN_BOX):
 * `caseyLanternGlass(lit)` the amber globe with its flame (behind), `caseyLanternBody()` the iron
 * hood and fount, brass rings, guard wires and the bail (in front). grip: where the fist holds
 * the bail (it swings from there); glass: the globe centre (glow); foot: the base.
 */
export const CASEY_LANTERN = { grip: [128, 40] as [number, number], glass: [128, 146] as [number, number], foot: [128, 218] as [number, number], r: 34 };
export const CASEY_LANTERN_BOX: [number, number, number, number] = [74, 22, 108, 204];
const GLOBE = 'M102 108 C84 126 84 168 102 186 L154 186 C172 168 172 126 154 108 Z';

export function caseyLanternGlass(lit = true): string {
  const g = nextId('lg');
  const glass = lit ? { base: C.amber, shade: C.amberDeep, light: C.amberLight } : { base: mix(C.amberDeep, C.inkSoft, 0.5), shade: mix(C.amberDeep, C.ink, 0.7), light: mix(C.amber, C.inkSoft, 0.4) };
  const flame = 'M128 172 C115 170 113 156 119 148 C123 142 123 134 121 128 C131 134 137 142 135 152 C139 148 141 142 140 136 C147 146 147 164 139 170 C136 172 132 172 128 172 Z';
  const core = 'M128 168 C121 167 120 159 123 154 C126 150 127 145 126 141 C132 146 134 152 132 158 C135 156 136 153 136 150 C140 156 139 164 134 167 C132 168 130 168 128 168 Z';
  return composeSymbol({
    autoCel: false,
    inkShift: [1, 1.2],
    noDrop: true,
    defs: `<radialGradient id="${g}" cx="50%" cy="58%" r="55%"><stop offset="0" stop-color="${lit ? C.fireCore : glass.light}" stop-opacity="${lit ? 0.95 : 0.3}"/><stop offset=".55" stop-color="${glass.light}" stop-opacity="${lit ? 0.45 : 0.1}"/><stop offset="1" stop-color="${glass.base}" stop-opacity="0"/></radialGradient>`,
    layers: [{ fills: form(GLOBE, { ...glass, cut: [-9, -6], band: [3, 3] }) }],
    top: `
      <path d="${GLOBE}" fill="url(#${g})"/>
      ${lit ? `<path d="${flame}" fill="${C.fireHot}" stroke="${C.fire}" stroke-width="2.4" stroke-linejoin="round"/><path d="${core}" fill="${C.fireCore}"/>` : ''}
      <rect x="117" y="172" width="22" height="10" rx="2" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="2"/>
      ${glint([[100, 164], [97, 140], [104, 118]], 3.6, lit ? C.amberLight : C.g2, lit ? 0.9 : 0.4)}
      ${glint([[150, 118], [154, 128], [155, 138]], 2, '#fff', 0.65)}`,
  });
}

export function caseyLanternBody(): string {
  const bail = 'M100 104 C90 28 166 28 156 104';
  const hood = 'M96 108 L160 108 L152 86 C144 76 112 76 104 86 Z';
  const chimney = 'M114 84 L142 84 L139 66 Q128 60 117 66 Z';
  const fount = 'M90 186 L166 186 C176 194 176 210 166 218 L90 218 C80 210 80 194 90 186 Z';
  const h = formLine(hood, { ...IRON, cut: [-7, -4], band: [2.5, 2] });
  const ch = formLine(chimney, { ...IRON, cut: [-4, -3], band: [2, 1.5] });
  const f = formLine(fount, { ...IRON, cut: [-9, -5], band: [3, 2] });
  const ringTop = formLine('M92 104 L164 104 L164 114 L92 114 Z', { ...GOLD, cut: [-3, -2], band: [1.5, 1.5] });
  const ringBot = formLine('M90 180 L166 180 L166 190 L90 190 Z', { ...GOLD, cut: [-3, -2], band: [1.5, 1.5] });
  const wires = 'M112 114 C104 132 104 164 112 180 M128 114 L128 180 M144 114 C152 132 152 164 144 180';
  return composeSymbol({
    ...paint(18),
    noDrop: true,
    layers: [
      { fills: '', lines: `<path d="${bail}" stroke-width="12"/>` },
      { fills: '', lines: `<path d="${GLOBE}" stroke-width="6"/>` },
      { fills: f.fills, lines: f.line() },
      { fills: ringBot.fills, lines: ringBot.line('stroke-width="5"') },
      { fills: h.fills, lines: h.line() },
      { fills: ringTop.fills, lines: ringTop.line('stroke-width="5"') },
      { fills: ch.fills, lines: `${ch.line('stroke-width="5"')}<path d="M120 74 L136 74" stroke-width="3"/>` },
    ],
    top: `
      <path d="${bail}" fill="none" stroke="${C.gold}" stroke-width="5" stroke-linecap="round"/>
      <path d="M104 74 C110 48 128 40 142 44" fill="none" stroke="${C.goldLight}" stroke-width="2" stroke-linecap="round" opacity=".9"/>
      <circle cx="100" cy="106" r="5.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.8"/><circle cx="156" cy="106" r="5.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.8"/>
      <path d="${wires}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
      <path d="${wires}" fill="none" stroke="${C.gold}" stroke-width="3" stroke-linecap="round"/>
      ${glint([[96, 202], [102, 194], [116, 191]], 2.4, C.ironLight, 0.9)}
      ${glint([[108, 102], [114, 90], [124, 85]], 1.8, C.ironLight, 0.9)}
      <circle cx="128" cy="60" r="4.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.4"/>`,
  });
}

/** The whole lantern (review sheets): glass + body. */
export function caseyLantern(lit = true): string {
  const inner = (s: string) => /<svg[^>]*>([\s\S]*)<\/svg>/.exec(s)![1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${inner(caseyLanternGlass(lit))}${inner(caseyLanternBody())}</svg>`;
}

/* ------------------------------------------------------------------ */
/* whistle, pocket watch, doffed cap                                   */
/* ------------------------------------------------------------------ */
/**
 * Brass pea whistle, 128 box: mouthpiece tip at CASEY_WHISTLE.lip (left), the round barrel right
 * with its sound slot on top, the cord ring at `ring`.
 */
export const CASEY_WHISTLE = { lip: [14, 68] as [number, number], ring: [106, 44] as [number, number], slot: [78, 48] as [number, number], size: 128 };
export function caseyWhistle(): string {
  const tube = 'M14 61 L58 57 L60 79 L14 75 Q8 68 14 61 Z';
  const barrel = 'M54 52 L92 48 C108 48 118 62 116 76 C114 92 100 100 84 100 C66 100 54 90 54 76 Z';
  const t = formLine(tube, { ...GOLD, cut: [-3, -4], band: [1.5, 1.5] });
  const b = formLine(barrel, { ...GOLD, cut: [-8, -8], band: [2, 2] });
  return composeSymbol({
    ...paint(19),
    size: 128,
    lw: 5,
    noDrop: true,
    layers: [
      { fills: '', lines: `<circle cx="${CASEY_WHISTLE.ring[0]}" cy="${CASEY_WHISTLE.ring[1]}" r="8" stroke-width="7"/>` },
      { fills: t.fills, lines: t.line() },
      { fills: b.fills, lines: b.line() },
    ],
    top: `
      <circle cx="${CASEY_WHISTLE.ring[0]}" cy="${CASEY_WHISTLE.ring[1]}" r="8" fill="none" stroke="${C.gold}" stroke-width="3"/>
      <path d="M68 50 L86 48 L86 58 L68 60 Z" fill="${C.ink}"/>
      <path d="M92 76 A9 9 0 0 0 110 76" fill="none" stroke="${C.goldDeep}" stroke-width="2.4"/>
      ${glint([[62, 66], [76, 60], [92, 58]], 2.4, C.goldLight, 0.95)}
      ${glint([[20, 65], [34, 63], [50, 62]], 1.5, C.goldLight, 0.85)}`,
  });
}

/** The gold pocket watch, 128 box, face toward the viewer: bow (the chain ring) at `bow`, dial centre `c`. */
export const CASEY_WATCH = { bow: [64, 18] as [number, number], c: [64, 74] as [number, number], size: 128 };
export function caseyWatch(): string {
  const [cx, cy] = CASEY_WATCH.c;
  const caseD = circle(cx, cy, 42);
  const k = formLine(caseD, { ...GOLD, cut: [-6, -7], band: [2.5, 2.5] });
  const stem = formLine('M56 22 L72 22 L70 34 L58 34 Z', { ...GOLD, cut: [-2, -2] });
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 === 0 ? 25 : 28;
    return `M${(cx + Math.sin(a) * r0).toFixed(1)} ${(cy - Math.cos(a) * r0).toFixed(1)} L${(cx + Math.sin(a) * 31).toFixed(1)} ${(cy - Math.cos(a) * 31).toFixed(1)}`;
  }).join(' ');
  return composeSymbol({
    ...paint(20),
    size: 128,
    lw: 5.5,
    noDrop: true,
    layers: [
      { fills: '', lines: `<circle cx="${CASEY_WATCH.bow[0]}" cy="${CASEY_WATCH.bow[1]}" r="8" stroke-width="7"/>` },
      { fills: stem.fills, lines: stem.line() },
      { fills: k.fills, lines: k.line() },
    ],
    top: `
      <circle cx="${CASEY_WATCH.bow[0]}" cy="${CASEY_WATCH.bow[1]}" r="8" fill="none" stroke="${C.gold}" stroke-width="3"/>
      <circle cx="${cx}" cy="${cy}" r="34" fill="${C.cream}" stroke="${C.goldDeep}" stroke-width="3"/>
      <path d="M${cx + 20} ${cy - 22} A30 30 0 0 1 ${cx + 22} ${cy + 20} L${cx} ${cy} Z" fill="${C.tile}" opacity=".7"/>
      <path d="${ticks}" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M${cx} ${cy} L${cx - 13} ${cy - 10} M${cx} ${cy} L${cx + 4} ${cy - 24}" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="3.6" fill="${C.crimson}" stroke="${C.ink}" stroke-width="1.6"/>
      <circle cx="${cx}" cy="${cy}" r="34" fill="none" stroke="${C.ink}" stroke-width="3"/>
      ${glint([[cx - 30, cy - 4], [cx - 24, cy - 22], [cx - 8, cy - 31]], 3, '#fff', 0.8)}`,
  });
}

/**
 * His cap held up by the peak and waved (the whoop): seen from below and tilted, the silk lining
 * showing. 256 box; he grips the peak's edge at CASEY_CAP_HELD.grip.
 */
export const CASEY_CAP_HELD = { grip: [128, 196] as [number, number] };
export const CASEY_CAP_HELD_BOX: [number, number, number, number] = [30, 34, 196, 192];
export function caseyCapHeld(): string {
  const crown = 'M46 132 L56 66 C58 52 92 44 128 44 C164 44 198 52 200 66 L210 132 Z';
  const lining = 'M46 132 C46 108 86 98 128 98 C170 98 210 108 210 132 C210 156 170 170 128 170 C86 170 46 156 46 132 Z';
  const inner = 'M66 132 C66 116 94 110 128 110 C162 110 190 116 190 132 C190 150 162 160 128 160 C94 160 66 150 66 132 Z';
  const peak = 'M58 150 Q128 178 198 150 C208 168 192 194 160 200 Q128 206 96 200 C64 194 48 168 58 150 Z';
  const c = formLine(crown, { ...NAVY, cut: [-12, -8], band: [5, 4] });
  const l = formLine(lining, { ...tones(C.cream, C.tileDeep, '#ffffff'), cut: [-6, -6] });
  const i = formLine(inner, { base: mix(C.cream, C.amber, 0.3), shade: mix(C.amberDeep, C.cream, 0.4), light: C.cream, cut: [6, 6] });
  const v = formLine(peak, { ...BLACK, cut: [-6, -8], band: [3, 3] });
  return composeSymbol({
    ...paint(21),
    noDrop: true,
    layers: [
      { fills: c.fills, lines: c.line() },
      { fills: l.fills, lines: l.line() },
      { fills: i.fills, lines: i.line('stroke-width="4"') },
      { fills: v.fills, lines: v.line() },
    ],
    top: `
      <path d="M56 84 Q128 100 200 84" fill="none" stroke="${C.gold}" stroke-width="3.5" stroke-linecap="round"/>
      ${wingedWheel(128, 68, 11)}
      ${glint([[84, 164], [110, 172], [140, 172]], 2.6, mix(C.uniformLight, C.white, 0.5), 0.8)}`,
  });
}

/** A cartoon steam puff from the whistle (128 box, centre (64, 64)): three round lobes, cream white, a cool shadow. */
export function caseySteam(variant = 0): string {
  const lobes = variant
    ? [circle(50, 70, 24), circle(78, 58, 28), circle(70, 84, 20)]
    : [circle(44, 66, 22), circle(70, 54, 26), circle(86, 76, 22), circle(58, 84, 18)];
  const body = union(lobes, { base: C.cream, shade: mix(C.steelLight, C.steel, 0.5), light: '#ffffff', cut: [-6, -7], band: [3, 3], lw: 5 });
  return composeSymbol({ autoCel: false, size: 128, noDrop: true, layers: [{ fills: '' }], top: body });
}

/* ------------------------------------------------------------------ */
/* review                                                              */
/* ------------------------------------------------------------------ */
/** Everything in this file, for review sheets. */
export function caseyBodyItems(): { label: string; svg: string; w?: number }[] {
  const hands: CaseyHand[] = ['open', 'fist', 'point', 'flat', 'thumb', 'grip'];
  return [
    { label: 'torso', svg: caseyTorso(), w: 240 },
    { label: 'skirt', svg: caseySkirt(), w: 240 },
    { label: 'boot', svg: caseyBoot(), w: 160 },
    { label: 'lantern lit', svg: caseyLantern(true), w: 180 },
    { label: 'lantern unlit', svg: caseyLantern(false), w: 180 },
    { label: 'whistle', svg: caseyWhistle(), w: 120 },
    { label: 'watch', svg: caseyWatch(), w: 120 },
    { label: 'cap held', svg: caseyCapHeld(), w: 180 },
    { label: 'praying hands', svg: caseyPrayingHands(), w: 140 },
    { label: 'steam', svg: caseySteam(0), w: 90 },
    { label: 'steam 2', svg: caseySteam(1), w: 90 },
    ...hands.map((h) => ({ label: `glove ${h}`, svg: caseyGlove(h), w: 140 })),
  ];
}
