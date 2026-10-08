/**
 * Conductor Casey's body parts for the rig (render/characters/Conductor.ts): the uniform torso
 * (navy double-breasted jacket, brass buttons, gold watch chain, collar and bow tie), polished black
 * boots, the brass signal lantern (frame and glowing glass painted separately so the glass can
 * pulse), the railway whistle, and the cap held in the hand (doffed). Gloves come from
 * characters.ts; arms and legs are drawn live as rubber hoses by the rig.
 *
 * Same paint as the head (conductor.ts): hand-cut cel (`cel` / `celForm`), gouache texture, an ink
 * contour, ink weighted to the lower right. Every part's anchor is documented on its export.
 */
import { C, composeSymbol, nextId, cel, celForm, celTones, shine, mix, GOLD_TONES, softGlow } from './kit';
import { glove } from './characters';
import { wingedWheel } from './conductor';

const NAVY = { ...celTones(C.uniform, C.uniformDeep, C.uniformLight), hatch: mix(C.uniformDeep, C.ink, 0.4) };
const NAVY_DEEP = { base: mix(C.uniform, C.uniformDeep, 0.55), shade: mix(C.uniformDeep, C.ink, 0.35), light: C.uniform, hatch: C.ink };
const SHIRT = celTones(C.white, C.g2, '#ffffff');
const BLACK = { base: C.inkSoft, shade: C.ink, light: mix(C.inkSoft, C.uniformLight, 0.4), hatch: C.ink };
const BRASS = GOLD_TONES;
const PAINT = { autoCel: false, contour: 0.8, inkShift: [1, 1.2] as [number, number] };
const paint = (seed: number) => ({ ...PAINT, texture: { seed } });

/** Re-frame a 256-box drawing to one region of it (the art keeps its coordinates). */
export function cropBox(svg: string, [x, y, w, h]: [number, number, number, number]): string {
  return svg.replace('viewBox="0 0 256 256" width="256" height="256"', `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);
}

const brassButton = (x: number, y: number, r = 6.5) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x + r * 0.15}" cy="${y + r * 0.15}" r="${r * 0.5}" fill="none" stroke="${C.goldDeep}" stroke-width="1.4"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.28}" fill="#fff"/>`;

/* ------------------------------------------------------------------ */
/* torso                                                               */
/* ------------------------------------------------------------------ */
/**
 * The uniform torso, 256 box. Neck at (128, 36) (the rig hangs it there, anchor (.5, .14));
 * shoulders ~(61, 79) / (195, 79); hips ~(96, 196) / (160, 196). A big round belly.
 */
export function conductorTorso(): string {
  const jacket =
    'M128 30 C166 30 192 44 199 72 C214 96 232 128 232 162 C232 198 214 224 188 234 C168 241 148 243 128 243 C108 243 88 241 68 234 C42 224 24 198 24 162 C24 128 42 96 57 72 C64 44 90 30 128 30 Z';
  const trousers = 'M86 200 L170 200 L174 252 L82 252 Z';
  const shirt = 'M104 30 L152 30 L128 96 Z';
  const lapL = 'M104 30 L128 96 L116 104 C104 82 92 58 86 40 Z';
  const lapR = 'M152 30 L128 96 L140 104 C152 82 164 58 170 40 Z';
  const collarL = 'M106 30 L126 52 L110 58 Z';
  const collarR = 'M150 30 L130 52 L146 58 Z';
  const hemSplit = 'M128 214 L128 242';
  const j = celForm(jacket, { ...NAVY, cut: [-16, -14], twist: -3, shrink: 0.98, hatch: NAVY.hatch, hatchGap: 6, seed: 51 });
  const t = celForm(trousers, { ...NAVY_DEEP, cut: [-8, -4], seed: 52 });
  const sh = celForm(shirt, { ...SHIRT, cut: [-4, -4], seed: 53 });
  const lL = celForm(lapL, { ...NAVY, base: mix(C.uniform, C.uniformLight, 0.25), cut: [-4, -4], seed: 54 });
  const lR = celForm(lapR, { ...NAVY, base: mix(C.uniform, C.uniformLight, 0.25), cut: [-4, -4], seed: 55 });
  const cL = celForm(collarL, { ...SHIRT, cut: [-2, -2], seed: 56 });
  const cR = celForm(collarR, { ...SHIRT, cut: [-2, -2], seed: 57 });
  // bow tie
  const tie = 'M128 50 L108 40 C102 44 102 58 108 62 Z M128 50 L148 40 C154 44 154 58 148 62 Z';
  const knot = 'M122 44 L134 44 L134 56 L122 56 Z';
  const ti = celForm(tie, { ...celTones(C.crimson, C.crimsonDeep, C.crimsonLight), cut: [-3, -3], seed: 58 });
  // double-breasted: two rows splaying over the belly
  const rows: [number, number][] = [
    [108, 112],
    [101, 138],
    [98, 166],
    [100, 194],
  ];
  const buttons = rows.map(([x, y]) => brassButton(x, y) + brassButton(256 - x, y)).join('');
  // the watch chain: from the right row's second button, a droop to the watch pocket
  const chain = 'M155 138 C166 168 186 172 202 156';
  const chainLinks = `<path d="${chain}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
    <path d="${chain}" fill="none" stroke="${C.gold}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="${chain}" fill="none" stroke="${C.goldLight}" stroke-width="2" stroke-dasharray="2.5 4" stroke-linecap="round"/>
    <circle cx="180" cy="168" r="4" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.2"/>`;
  // welt pockets (watch pocket where the chain ends) and a breast pocket with a ticket peeking out
  const pockets = `<path d="M188 158 Q204 152 216 154" stroke="${C.ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M44 186 Q62 192 80 190" stroke="${C.ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M176 192 Q194 192 212 186" stroke="${C.ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  const ticket = 'M60 74 L84 68 L90 96 L66 102 Z';
  const tk = celForm(ticket, { base: C.cream, shade: C.tileLight, light: '#ffffff', cut: [-1.5, -1.5], seed: 59 });
  const breast = `<path d="M56 98 Q74 92 92 94" stroke="${C.ink}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="80" cy="76" r="2.6" fill="${C.ink}" opacity=".85"/>`;
  return composeSymbol({
    ...paint(13),
    noDrop: true,
    layers: [
      { fills: t.fills, lines: `${t.line()}<path d="M128 214 L128 252" stroke-width="4" opacity=".55"/>` },
      { fills: j.fills, lines: `${j.line()}<path d="${hemSplit}" stroke-width="5"/><path d="M46 112 Q40 150 46 190" stroke-width="3.5" opacity=".35"/>` },
      { fills: sh.fills, lines: sh.line('stroke-width="5"') },
      { fills: lL.fills + lR.fills, lines: `${lL.line('stroke-width="5.5"')}${lR.line('stroke-width="5.5"')}` },
      { fills: cL.fills + cR.fills, lines: `${cL.line('stroke-width="4.5"')}${cR.line('stroke-width="4.5"')}` },
      { fills: ti.fills, lines: ti.line('stroke-width="4.5"') },
      { fills: tk.fills, lines: `${tk.line('stroke-width="3.5"')}<path d="M67 84 L82 80 M69 91 L80 88" stroke-width="2" opacity=".4"/>` },
    ],
    top: `
      <path d="${knot}" fill="${C.crimsonDeep}" stroke="${C.ink}" stroke-width="3.5" stroke-linejoin="round"/>
      ${breast}
      ${pockets}
      ${buttons}
      ${chainLinks}
      ${shine([[60, 104], [50, 130], [46, 160]], 3.4, 0.4, C.uniformLight)}
      ${shine([[90, 46], [74, 58], [64, 76]], 2.4, 0.4, C.uniformLight)}
      ${shine([[112, 40], [116, 54], [120, 68]], 1.6, 0.6)}`,
  });
}

/* ------------------------------------------------------------------ */
/* boots                                                               */
/* ------------------------------------------------------------------ */
/** Painted box of the boot (ink included) in its 256 box. */
export const CON_BOOT_BOX: [number, number, number, number] = [50, 40, 190, 178];
/** Polished black boot under a navy trouser cuff: ankle at (128, 70), sole on y = 211, toe to the right. */
export function conductorBoot(): string {
  const boot = 'M98 62 L158 62 L160 124 C196 126 228 142 231 172 C233 196 208 206 170 206 L92 206 C64 206 54 188 60 162 C64 142 78 130 96 126 Z';
  const sole = 'M58 194 C62 206 74 211 92 211 L172 211 C206 211 230 204 232 186 C226 198 206 202 170 202 L92 202 C74 202 62 200 58 194 Z';
  const cuff = 'M84 46 L172 46 L168 86 Q128 98 88 86 Z';
  const b = celForm(boot, { ...BLACK, cut: [-12, -10], seed: 81 });
  const s = celForm(sole, { base: C.woodDark, shade: C.woodDeep, light: C.woodMid, cut: [-2, -2], seed: 82 });
  const c = celForm(cuff, { ...NAVY_DEEP, cut: [-6, -5], hatch: C.ink, hatchGap: 5, seed: 83 });
  return composeSymbol({
    ...paint(14),
    noDrop: true,
    layers: [
      { fills: b.fills, lines: `${b.line()}<path d="M160 130 Q150 150 152 170" stroke-width="3.5" opacity=".6"/>` },
      { fills: s.fills, lines: s.line('stroke-width="5"') },
      { fills: c.fills, lines: `${c.line()}<path d="M128 52 L128 92" stroke-width="3" opacity=".4"/>` },
    ],
    top: `
      ${shine([[170, 140], [196, 146], [216, 162]], 4.5, 0.75, C.steelLight)}
      ${shine([[74, 156], [80, 140], [94, 132]], 3, 0.45, C.steelLight)}
      ${shine([[104, 100], [104, 112], [106, 122]], 2.2, 0.4, C.steel)}
      <circle cx="198" cy="152" r="2.6" fill="#fff"/>`,
  });
}

/* ------------------------------------------------------------------ */
/* the signal lantern                                                  */
/* ------------------------------------------------------------------ */
/**
 * The brass signal lantern, in two layers that stack exactly (same 256 box, crop LANTERN_BOX):
 * `lanternGlass(lit)` is the amber glass globe with its flame (behind), `lanternBody()` is the
 * brass frame, bail, guard wires and fount (in front; the globe shows between the wires).
 * LANTERN.grip: where the fist holds the bail (the pivot it swings from); LANTERN.glass: the globe
 * centre (for the glow); LANTERN.foot: the fount's base (standing on the ground).
 */
export const LANTERN = { grip: [128, 46] as [number, number], glass: [128, 140] as [number, number], foot: [128, 216] as [number, number], r: 34 };
export const LANTERN_BOX: [number, number, number, number] = [78, 22, 100, 202];

const GLOBE = 'M102 100 C86 118 86 162 102 180 L154 180 C170 162 170 118 154 100 Z';

export function lanternGlass(lit = true): string {
  const g = nextId('lg');
  const glass = lit ? { base: C.amber, shade: C.amberDeep, light: C.amberLight } : { base: mix(C.amberDeep, C.inkSoft, 0.5), shade: mix(C.amberDeep, C.ink, 0.7), light: mix(C.amber, C.inkSoft, 0.4) };
  const flame = 'M128 168 C114 166 112 152 118 144 C122 138 122 130 120 124 C130 130 136 138 134 148 C138 144 140 138 139 132 C146 142 146 160 138 166 C135 168 131 168 128 168 Z';
  const inner = 'M128 164 C120 163 119 155 122 150 C125 146 126 141 125 137 C131 142 133 148 131 154 C134 152 135 149 135 146 C139 152 138 160 133 163 C131 164 130 164 128 164 Z';
  return composeSymbol({
    autoCel: false,
    inkShift: [1, 1.2],
    noDrop: true,
    defs: `<radialGradient id="${g}" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="${lit ? C.fireCore : glass.light}" stop-opacity="${lit ? 0.95 : 0.3}"/><stop offset=".55" stop-color="${glass.light}" stop-opacity="${lit ? 0.5 : 0.1}"/><stop offset="1" stop-color="${glass.base}" stop-opacity="0"/></radialGradient>`,
    layers: [{ fills: cel(GLOBE, { ...glass, cut: [-8, -6], band: [3, 3], seed: 91 }) }],
    top: `
      <path d="${GLOBE}" fill="url(#${g})"/>
      ${lit ? `<path d="${flame}" fill="${C.fireHot}" stroke="${C.fire}" stroke-width="2.4" stroke-linejoin="round"/><path d="${inner}" fill="${C.fireCore}"/>` : `<path d="M124 168 L132 168 L130 156 L126 156 Z" fill="${C.inkSoft}"/>`}
      <rect x="118" y="168" width="20" height="10" rx="2" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="2"/>
      ${shine([[100, 156], [98, 132], [106, 110]], 3.2, lit ? 0.85 : 0.4, lit ? C.amberLight : C.g2)}
      ${shine([[148, 110], [152, 118], [154, 128]], 1.8, 0.6, '#fff')}`,
  });
}

export function lanternBody(): string {
  const bail = 'M98 104 C92 30 164 30 158 104';
  const hood = 'M98 102 L158 102 L150 82 C142 74 114 74 106 82 Z';
  const chimney = 'M116 82 L140 82 L138 66 Q128 60 118 66 Z';
  const fount = 'M90 178 L166 178 C176 186 176 206 164 214 L92 214 C80 206 80 186 90 178 Z';
  const rim = 'M94 176 L162 176 L162 186 L94 186 Z';
  const h = celForm(hood, { ...BRASS, cut: [-6, -4], band: [2, 2], seed: 92 });
  const ch = celForm(chimney, { ...BRASS, cut: [-4, -3], band: [1.5, 1.5], seed: 93 });
  const f = celForm(fount, { ...BRASS, cut: [-8, -5], band: [2.5, 2], hatch: BRASS.hatch, hatchGap: 4.5, seed: 94 });
  const r = celForm(rim, { ...BRASS, base: mix(C.gold, C.goldDeep, 0.25), cut: [-3, -2], seed: 95 });
  // guard wires over the globe: three bowed bars and a band round the waist
  const wires = 'M112 102 C104 120 104 160 112 180 M128 102 L128 180 M144 102 C152 120 152 160 144 180 M90 140 Q128 150 166 140';
  return composeSymbol({
    ...paint(15),
    noDrop: true,
    layers: [
      { fills: '', lines: `<path d="${bail}" stroke-width="11"/>` },
      { fills: '', lines: `<path d="${GLOBE}" stroke-width="6"/>` },
      { fills: f.fills, lines: f.line() },
      { fills: r.fills, lines: r.line('stroke-width="4.5"') },
      { fills: h.fills, lines: h.line() },
      { fills: ch.fills, lines: `${ch.line('stroke-width="5"')}<path d="M120 74 L136 74" stroke-width="3"/>` },
    ],
    top: `
      <path d="${bail}" fill="none" stroke="${C.gold}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M104 72 C110 46 128 40 140 44" fill="none" stroke="${C.goldLight}" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>
      <circle cx="98" cy="104" r="5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.6"/><circle cx="158" cy="104" r="5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.6"/>
      <path d="${wires}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
      <path d="${wires}" fill="none" stroke="${C.gold}" stroke-width="3" stroke-linecap="round"/>
      ${shine([[96, 192], [104, 184], [118, 182]], 2.2, 0.85, C.goldLight)}
      ${shine([[110, 96], [116, 86], [126, 82]], 1.6, 0.8, C.goldLight)}
      <circle cx="128" cy="62" r="4.5" fill="${C.gold}" stroke="${C.ink}" stroke-width="2.4"/>`,
  });
}

/** The whole lantern (review sheets, title cards): glass, frame and a soft halo. */
export function lantern(lit = true): string {
  const glass = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(lanternGlass(lit))![1];
  const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(lanternBody())![1];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${lit ? softGlow(128, 140, 70, C.amber, 0.5) : ''}${glass}${body}</svg>`;
}

/* ------------------------------------------------------------------ */
/* the whistle                                                         */
/* ------------------------------------------------------------------ */
/**
 * Brass railway (pea) whistle, 128 box: the mouthpiece tip at WHISTLE.lip (left), the barrel to
 * the right with its sound slot on top, the cord ring at WHISTLE.ring.
 */
export const WHISTLE = { lip: [14, 68] as [number, number], ring: [104, 50] as [number, number], slot: [76, 44] as [number, number], size: 128 };
export function whistle(): string {
  const tube = 'M14 60 L56 56 L58 80 L14 76 Q8 68 14 60 Z';
  const barrel = 'M52 50 L92 46 C108 46 118 60 116 74 C114 90 100 98 84 98 C66 98 54 88 52 74 Z';
  const t = celForm(tube, { ...BRASS, cut: [-3, -4], band: [1.5, 1.5], seed: 96 });
  const b = celForm(barrel, { ...BRASS, cut: [-7, -7], band: [2, 2], hatch: BRASS.hatch, hatchGap: 4, seed: 97 });
  return composeSymbol({
    ...paint(16),
    size: 128,
    lw: 5,
    noDrop: true,
    layers: [
      { fills: '', lines: `<circle cx="${WHISTLE.ring[0]}" cy="${WHISTLE.ring[1] - 8}" r="8" stroke-width="7"/>` },
      { fills: t.fills, lines: t.line() },
      { fills: b.fills, lines: b.line() },
    ],
    top: `
      <circle cx="${WHISTLE.ring[0]}" cy="${WHISTLE.ring[1] - 8}" r="8" fill="none" stroke="${C.gold}" stroke-width="3"/>
      <path d="M66 48 L84 46 L84 56 L66 58 Z" fill="${C.ink}"/>
      <path d="M90 74 A9 9 0 0 0 108 74" fill="none" stroke="${C.goldDeep}" stroke-width="2.4"/>
      ${shine([[60, 64], [74, 58], [90, 56]], 2.2, 0.9, C.goldLight)}
      ${shine([[20, 64], [34, 62], [48, 61]], 1.4, 0.8, C.goldLight)}`,
  });
}

/* ------------------------------------------------------------------ */
/* the cap, doffed                                                     */
/* ------------------------------------------------------------------ */
/**
 * His cap held up by the visor and waved (the whoop): seen from below and tilted, the cream silk
 * lining showing. 256 box; the visor edge he grips at CAP_HELD.grip.
 */
export const CAP_HELD = { grip: [128, 196] as [number, number] };
export const CAP_HELD_BOX: [number, number, number, number] = [36, 40, 184, 186];
export function capHeld(): string {
  const crown = 'M48 132 L60 64 C62 52 92 44 128 44 C164 44 194 52 196 64 L208 132 Z';
  const lining = 'M48 132 C48 108 86 98 128 98 C170 98 208 108 208 132 C208 156 170 170 128 170 C86 170 48 156 48 132 Z';
  const inner = 'M66 132 C66 116 94 110 128 110 C162 110 190 116 190 132 C190 150 162 160 128 160 C94 160 66 150 66 132 Z';
  const visor = 'M60 150 Q128 176 196 150 C204 168 190 192 160 198 Q128 204 96 198 C66 192 52 168 60 150 Z';
  const c = celForm(crown, { ...NAVY, cut: [-12, -8], hatch: NAVY.hatch, hatchGap: 5.5, seed: 98 });
  const l = celForm(lining, { ...celTones(C.cream, C.tileDeep, '#ffffff'), cut: [-6, -6], seed: 99 });
  const i = celForm(inner, { ...celTones(C.amberLight, C.amberDeep, C.cream), base: mix(C.cream, C.amber, 0.3), cut: [6, 6], seed: 100 });
  const v = celForm(visor, { ...BLACK, cut: [-6, -8], seed: 101 });
  return composeSymbol({
    ...paint(17),
    noDrop: true,
    layers: [
      { fills: c.fills, lines: c.line() },
      { fills: l.fills, lines: l.line() },
      { fills: i.fills, lines: i.line('stroke-width="4"') },
      { fills: v.fills, lines: v.line() },
    ],
    top: `
      <path d="M58 82 Q128 98 198 82" fill="none" stroke="${C.gold}" stroke-width="3" stroke-linecap="round"/>
      ${wingedWheel(128, 70, 11)}
      ${shine([[84, 160], [110, 168], [140, 168]], 2.4, 0.7, mix(C.uniformLight, C.white, 0.4))}
      <path d="M86 136 Q128 146 170 136" fill="none" stroke="${C.tileDeep}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`,
  });
}

/** Everything in this file, for the review sheet (tools/art/groups/conductor.ts). */
export function reviewItems(): { label: string; svg: string; w?: number; bg?: string }[] {
  return [
    { label: 'torso', svg: conductorTorso(), w: 240 },
    { label: 'boot', svg: conductorBoot(), w: 200 },
    { label: 'lantern lit', svg: lantern(true), w: 200 },
    { label: 'lantern unlit', svg: lantern(false), w: 200 },
    { label: 'lantern glass', svg: lanternGlass(true), w: 140 },
    { label: 'lantern body', svg: lanternBody(), w: 140 },
    { label: 'whistle', svg: whistle(), w: 140 },
    { label: 'cap held', svg: capHeld(), w: 200 },
    { label: 'glove fist', svg: glove('fist'), w: 120 },
  ];
}
