/**
 * Rig parts for the two characters. Cap'n Kaboom (left): red coat, striped shirt, skull buckle,
 * one buckled boot + a peg leg, and a lit linstock. Sparks the parrot (right): perched on a
 * little powder barrel, with separate wings and tail so the rig can flap and sway.
 * All parts are 256x256 boxes; anchors are documented per function.
 */
import { C, composeSymbol, nextId, cel, celForm, celTones, shine, mix, GOLD_TONES } from './kit';
import { bombIdle, bombHot, BOMB_FUSE_TIP } from './bomb';
import { skullAndBones } from './captain';
import { taper, type V } from './geo';

/* ------------------------------------------------------------------ */
/* Cap'n Kaboom                                                        */
/* ------------------------------------------------------------------ */

/** Coat torso. Neck at (128, 36); shoulders ~(61, 79)/(195, 79); hips ~(95, 194)/(160, 194). */
export function captainTorso(): string {
  const g = nextId('ct');
  const coat =
    'M128 30 C170 30 196 50 200 84 C204 112 214 138 214 164 C214 188 212 214 204 232 L158 228 C148 214 138 206 128 206 C118 206 108 214 98 228 L52 232 C44 214 42 188 42 164 C42 138 52 112 56 84 C60 50 86 30 128 30 Z';
  const shirt = 'M106 32 L150 32 C160 66 168 104 166 150 L90 150 C88 104 96 66 106 32 Z';
  const trousers = 'M92 190 L164 190 L166 240 L90 240 Z';
  const belt = 'M60 146 Q128 170 196 146 L200 172 Q128 198 56 172 Z';
  const lapL = 'M106 34 C96 66 88 104 90 148';
  const lapR = 'M150 34 C160 66 168 104 166 148';
  const stripes = Array.from({ length: 8 }, (_, i) => {
    const y = 40 + i * 15;
    return `<path d="M70 ${y} Q128 ${y + 10} 186 ${y} L186 ${y + 7} Q128 ${y + 17} 70 ${y + 7} Z" fill="${C.navy}"/>`;
  }).join('');
  const buttons = [
    [80, 80],
    [74, 106],
    [70, 132],
    [176, 80],
    [182, 106],
    [186, 132],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.8" fill="#fff"/>`)
    .join('');
  const epaulette = (cx: number, s: number) =>
    `<g transform="rotate(${s * 16} ${cx} 64)">
       <path d="M${cx - 16} 74 l-2 12 M${cx - 8} 77 l-1 12 M${cx} 78 l0 12 M${cx + 8} 77 l1 12 M${cx + 16} 74 l2 12" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
       <path d="M${cx - 16} 74 l-2 12 M${cx - 8} 77 l-1 12 M${cx} 78 l0 12 M${cx + 8} 77 l1 12 M${cx + 16} 74 l2 12" stroke="${C.gold}" stroke-width="3.5" stroke-linecap="round"/>
       <ellipse cx="${cx}" cy="66" rx="24" ry="12" fill="url(#${g}g)" stroke="${C.ink}" stroke-width="4.5"/>
       <path d="M${cx - 12} 61 Q${cx} 56 ${cx + 12} 61" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/></g>`;
  const sid = nextId('sh');
  const defs = `
    <linearGradient id="${g}c" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="${C.crimsonLight}"/><stop offset=".4" stop-color="${C.crimson}"/><stop offset="1" stop-color="${C.crimsonDeep}"/></linearGradient>
    <linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
    <linearGradient id="${g}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.woodMid}"/><stop offset="1" stop-color="${C.woodDeep}"/></linearGradient>
    <clipPath id="${sid}"><path d="${shirt}"/></clipPath>`;
  return composeSymbol({
    noDrop: true,
    shade: 0.26,
    light: 0.38,
    defs,
    layers: [
      { fills: `<path d="${trousers}" fill="${C.navy}"/>`, lines: `<path d="${trousers}"/>` },
      {
        fills: `<path d="${coat}" fill="url(#${g}c)"/>`,
        lines: `<path d="${coat}"/><path d="M128 206 L128 214" stroke-width="5"/><path d="M58 188 Q64 208 60 226 M198 188 Q192 208 196 226" stroke-width="4" opacity=".45"/>`,
      },
      {
        fills: `<path d="${shirt}" fill="${C.white}"/><g clip-path="url(#${sid})">${stripes}</g>`,
        lines: `<path d="${shirt}"/>`,
      },
      { fills: `<path d="${belt}" fill="url(#${g}b)"/>`, lines: `<path d="${belt}"/>` },
    ],
    top: `
      <path d="${lapL}" stroke="${C.ink}" stroke-width="14" fill="none" stroke-linecap="round"/><path d="${lapL}" stroke="url(#${g}g)" stroke-width="7.5" fill="none" stroke-linecap="round"/>
      <path d="${lapR}" stroke="${C.ink}" stroke-width="14" fill="none" stroke-linecap="round"/><path d="${lapR}" stroke="url(#${g}g)" stroke-width="7.5" fill="none" stroke-linecap="round"/>
      ${buttons}
      ${epaulette(74, -1)}${epaulette(182, 1)}
      <rect x="104" y="150" width="48" height="36" rx="8" fill="url(#${g}g)" stroke="${C.ink}" stroke-width="5"/>
      <rect x="114" y="159" width="28" height="18" rx="4" fill="${C.goldDeep}" opacity=".45"/>
      ${skullAndBones(128, 168, 16, C.goldLight, false)}
      <path d="M110 156 L124 156" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <path d="M66 96 Q58 124 58 150" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".3"/>`,
  });
}

/**
 * The oak peg leg in three pieces, so the rig can stretch the shaft as the knee bends without
 * squashing the fittings. All in a 64 x 128 box, centred on x = 32:
 * - `shaft`: the tapered peg from the knee (y 0) down to the foot (y PEG.len), hatched cel wood;
 * - `cuff`: the rolled trouser cuff and the brass band at the knee (knee centre at y 64);
 * - `foot`: the iron-shod foot cap (the ground contact at y 64).
 */
export const PEG = { w: 64, h: 128, len: 92 };
/** Each peg piece's painted box [x, y, w, h] (ink included) and its pivot, in the pieces' units. */
export const PEG_BOX: Record<'shaft' | 'cuff' | 'foot', [number, number, number, number]> = { shaft: [16, -3, 32, 98], cuff: [6, 48, 52, 38], foot: [17, 48, 30, 22] };
export const PEG_PIVOT: Record<'shaft' | 'cuff' | 'foot', [number, number]> = { shaft: [32, 0], cuff: [32, 64], foot: [32, 68.5] };
export function pegPart(part: 'shaft' | 'cuff' | 'foot'): string {
  const WOOD = celTones(C.wood, C.woodDark, C.woodLight);
  const NAVY = celTones(C.navy, C.nightDeep, C.navyLight);
  const [bx, by, bw, bh] = PEG_BOX[part];
  const doc = (body: string, layers: { fills: string; lines?: string }[]) =>
    composeSymbol({ autoCel: false, texture: { seed: 17 }, inkShift: [0.8, 1], noDrop: true, layers, top: body }).replace(
      'viewBox="0 0 256 256" width="256" height="256"',
      `viewBox="${bx} ${by} ${bw} ${bh}" width="${bw}" height="${bh}"`,
    );
  if (part === 'shaft') {
    const L = PEG.len;
    const d = `M19 0 L45 0 L40 ${L} L24 ${L} Z`;
    const f = celForm(d, { ...WOOD, cut: [-5, -2], band: [2, 1], hatch: WOOD.hatch, hatchGap: 5, seed: 71 });
    return doc(`${shine([[25, 6], [26, L * 0.5], [27, L - 6]], 1.6, 0.55)}<path d="M36 ${L * 0.3} q3 6 0 12 M31 ${L * 0.62} q-3 5 0 10" stroke="${C.woodDark}" stroke-width="1.8" fill="none" opacity=".6"/>`, [{ fills: f.fills, lines: f.line('stroke-width="5"') }]);
  }
  if (part === 'cuff') {
    const cuff = 'M10 64 A22 12 0 1 0 54 64 A22 12 0 1 0 10 64 Z';
    const band = 'M15 70 L49 70 Q51 70 51 72 L51 79 Q51 81 49 81 L15 81 Q13 81 13 79 L13 72 Q13 70 15 70 Z';
    const b = celForm(band, { ...GOLD_TONES, cut: [-3, -2], band: [1.5, 1], seed: 72 });
    const c = celForm(cuff, { ...NAVY, cut: [-5, -4], band: [2, 1.5], hatch: NAVY.hatch, hatchGap: 4.5, seed: 73 });
    return doc(shine([[18, 60], [26, 56], [36, 55]], 1.4, 0.45, C.navyLight), [
      { fills: b.fills, lines: b.line('stroke-width="5"') },
      { fills: c.fills, lines: c.line('stroke-width="6"') },
    ]);
  }
  const cap = 'M23 52 L41 52 Q43 52 43 54 L43 63 Q43 65 41 65 L23 65 Q21 65 21 63 L21 54 Q21 52 23 52 Z';
  const f = celForm(cap, { base: C.inkSoft, shade: C.ink, light: C.steelDeep, hatch: C.ink, cut: [-2, -2], band: [1, 1], seed: 74 });
  return doc(`<path d="M24 55 L33 55" stroke="${C.steel}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`, [{ fills: f.fills, lines: f.line('stroke-width="4.5"') }]);
}

/**
 * Cross-section of a rubber-hose limb for the rig's rope meshes: a thin vertical strip whose
 * height is the limb's full width. Across it: ink edge, the fill, a lit stripe on the upper side
 * (v = 0 is the left of the direction of travel; the rig orients each rope so that side faces the
 * light), fill, a darker cel band on the shadow side, ink edge. Colours are CSS strings; the rig
 * paints it into a canvas (see Captain.ts).
 */
export function hoseSection(ink: number, fill: string, lit: string, shade: string): { stops: [number, string][] } {
  const e = ink;
  return {
    stops: [
      [0, C.ink],
      [e, C.ink],
      [e + 0.001, fill],
      [0.24, fill],
      [0.241, lit],
      [0.38, lit],
      [0.381, fill],
      [0.7, fill],
      [0.701, shade],
      [1 - e, shade],
      [1 - e + 0.001, C.ink],
      [1, C.ink],
    ],
  };
}


/** Re-frame a 256-box drawing to its painted box (so a sprite carries no empty margins). */
export function cropTo(svg: string, [x, y, w, h]: [number, number, number, number]): string {
  return svg.replace('viewBox="0 0 256 256" width="256" height="256"', `viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"`);
}
/** Painted boxes (ink included) of the parts that stand on the deck, in their 256 boxes. */
export const BOOT_BOX: [number, number, number, number] = [48, 38, 186, 176];
export const COAT_TAIL_BOX: [number, number, number, number] = [84, 12, 90, 236];
export const BARREL_BOX: [number, number, number, number] = [36, 42, 184, 206];
/** Buckled pirate boot, ankle at top centre (128, 70), toe to the right. */
export function pirateBoot(): string {
  const g = nextId('bt');
  const boot = 'M98 60 L158 60 L160 128 C194 132 224 148 226 174 C228 198 202 206 164 206 L90 206 C64 206 54 188 60 162 C64 142 78 132 96 128 Z';
  const cuff = 'M84 44 L172 44 L166 88 Q128 102 90 88 Z';
  const defs = `<linearGradient id="${g}l" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${C.woodMid}"/><stop offset=".5" stop-color="${C.woodDark}"/><stop offset="1" stop-color="${C.woodDeep}"/></linearGradient>
    <linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>`;
  return composeSymbol({
    noDrop: true,
    shade: 0.2,
    light: 0.45,
    defs,
    layers: [
      { fills: `<path d="${boot}" fill="url(#${g}l)"/>`, lines: `<path d="${boot}"/><path d="M62 186 Q140 196 224 182" stroke-width="5"/>` },
      { fills: `<path d="${cuff}" fill="${C.wood}"/>`, lines: `<path d="${cuff}"/>` },
    ],
    top: `
      <path d="M96 112 Q128 122 160 112" stroke="${C.woodDark}" stroke-width="11" fill="none"/>
      <rect x="116" y="104" width="24" height="18" rx="3" fill="url(#${g}g)" stroke="${C.ink}" stroke-width="4"/>
      <path d="M150 150 Q178 146 204 160" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".35"/>
      <path d="M96 54 Q126 50 150 54" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".35"/>`,
  });
}

/**
 * Lit linstock (a gunner's slow-match staff) in a tight 72 x 256 box (x 92..164) so the sprite
 * carries no dead width. Grip at (128, 170) = anchor (0.5, 0.664); the burning match end sits at
 * (128, 20).
 */
export const LINSTOCK_GRIP = 170;
export const LINSTOCK_TIP = 20;
export function linstock(): string {
  const g = nextId('ls');
  const pole = 'M118 78 L138 78 L141 248 L115 248 Z';
  const fork = 'M106 86 C100 60 108 40 120 30 L128 48 L136 30 C148 40 156 60 150 86 Z';
  const coil = 'M114 70 C100 60 110 44 128 48 C146 52 150 38 136 30 C126 24 124 28 128 22';
  const defs = `<linearGradient id="${g}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.woodLight}"/><stop offset=".5" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodDark}"/></linearGradient>
    <linearGradient id="${g}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
    <radialGradient id="${g}e" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".9"/><stop offset="1" stop-color="${C.fire}" stop-opacity="0"/></radialGradient>`;
  const svg = composeSymbol({
    noDrop: true,
    defs,
    under: `<circle cx="128" cy="22" r="22" fill="url(#${g}e)"/>`,
    layers: [
      { fills: `<path d="${pole}" fill="url(#${g}w)"/>`, lines: `<path d="${pole}"/><path d="M118 150 L139 162 M117 164 L140 176 M117 178 L140 190" stroke-width="3.5" opacity=".7"/>` },
      { fills: `<path d="${fork}" fill="url(#${g}g)"/><rect x="110" y="82" width="36" height="14" rx="5" fill="url(#${g}g)"/>`, lines: `<path d="${fork}"/><rect x="110" y="82" width="36" height="14" rx="5"/>` },
    ],
    top: `
      <path d="${coil}" stroke="${C.ink}" stroke-width="11" fill="none" stroke-linecap="round"/>
      <path d="${coil}" stroke="${C.paperWarm}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
      <path d="${coil}" stroke="${C.woodLight}" stroke-width="5.5" fill="none" stroke-dasharray="3 4" stroke-linecap="butt"/>
      <circle cx="128" cy="21" r="6" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="3"/>
      <circle cx="127" cy="20" r="2.5" fill="${C.fireCore}"/>
      <path d="M123 100 L122 240" stroke="#fff" stroke-width="3.5" opacity=".35" stroke-linecap="round"/>`,
  });
  return svg.replace('viewBox="0 0 256 256" width="256" height="256"', 'viewBox="92 0 72 256" width="72" height="256"');
}

/**
 * One frock-coat tail (the left one; the rig mirrors it for the right), hanging from the waist
 * behind the legs so it can swing and flare. Hinge at the top centre (128, 22).
 */
export const COAT_TAIL_HINGE: [number, number] = [128, 22];
export function captainCoatTail(): string {
  const g = nextId('tl');
  const flap = 'M100 18 L156 18 C162 70 166 130 164 176 C163 204 158 226 150 240 L128 222 L104 238 C96 210 92 180 92 150 C92 100 96 56 100 18 Z';
  const trim = 'M156 18 C162 70 166 130 164 176 C163 204 158 226 150 240';
  return composeSymbol({
    noDrop: true,
    shade: 0.3,
    light: 0.35,
    defs: `<linearGradient id="${g}c" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="${C.crimson}"/><stop offset=".55" stop-color="${C.crimsonDeep}"/><stop offset="1" stop-color="#4a0a09"/></linearGradient>`,
    layers: [{ fills: `<path d="${flap}" fill="url(#${g}c)"/>`, lines: `<path d="${flap}"/><path d="M128 222 L126 150" stroke-width="3.5" opacity=".4"/>` }],
    top: `<path d="${trim}" stroke="${C.ink}" stroke-width="11" fill="none" stroke-linecap="round"/>
      <path d="${trim}" stroke="${C.gold}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="116" cy="40" r="7" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="114" cy="38" r="2.2" fill="#fff"/>
      <circle cx="140" cy="40" r="7" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/><circle cx="138" cy="38" r="2.2" fill="#fff"/>
      <path d="M104 70 C102 110 102 150 106 196" stroke="${C.crimsonLight}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>`,
  });
}

/**
 * Cap'n Kaboom's hand bomb is the Kaboom Bomb itself (src/art/bomb.ts, track D), so the bomb in
 * his hand is the one that lands on the reels. Its geometry in the bomb's 256 box: sphere centre
 * and radius, and where the fuse spark sits (lit, and burnt down when hot).
 */
export const CAP_BOMB = { cx: 122, cy: 148, r: 84, tip: BOMB_FUSE_TIP.lit as [number, number], tipHot: BOMB_FUSE_TIP.hot as [number, number] };
export function captainBomb(hot = false): string {
  return hot ? bombHot() : bombIdle();
}

/** Charge lamp centres on the band (bomb box units) for n lamps, and the lamp diameter. */
export function bombLamps(n: number): [number, number][] {
  const xs = n <= 1 ? [116] : n === 2 ? [96, 136] : n === 3 ? [76, 116, 156] : Array.from({ length: n }, (_, i) => 70 + (92 * i) / (n - 1));
  return xs.map((x) => [x, 106 + 8 * (1 - ((x - 116) / 80) ** 2)]);
}
export const BOMB_LAMP = 34;

/**
 * The charge band: a riveted brass strap round the bomb's upper belly, between the fuse cap and
 * the skull, with a socket for each charge lamp. Drawn in the bomb's 256 box and clipped to its
 * sphere, so it overlays bombIdle() / bombHot() exactly.
 */
export function bombBand(n: number): string {
  const { cx, cy, r } = CAP_BOMB;
  const id = nextId('bb');
  const yc = (x: number) => 106 + 8 * (1 - ((x - 116) / 80) ** 2);
  const pts = Array.from({ length: 17 }, (_, i) => 30 + i * 12);
  const top = pts.map((x, i) => `${i ? 'L' : 'M'}${x} ${(yc(x) - 11).toFixed(1)}`).join(' ');
  const bot = [...pts].reverse().map((x) => `L${x} ${(yc(x) + 11).toFixed(1)}`).join(' ');
  const band = `${top} ${bot} Z`;
  const sockets = bombLamps(n)
    .map(([x, y]) => `<circle cx="${x}" cy="${y.toFixed(1)}" r="${BOMB_LAMP / 2 + 3}" fill="${C.ink}" stroke="${C.ink}" stroke-width="4"/>`)
    .join('');
  const rivets = [44, 190].map((x) => `<circle cx="${x}" cy="${yc(x).toFixed(1)}" r="3.6" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.8"/>`).join('');
  return composeSymbol({
    autoCel: false,
    texture: { seed: 21 },
    inkShift: [1, 1.2],
    noDrop: true,
    defs: `<clipPath id="${id}-s"><circle cx="${cx}" cy="${cy}" r="${r - 3}"/></clipPath>`,
    layers: [{ fills: '' }],
    top: `<g clip-path="url(#${id}-s)">
        ${cel(band, { ...GOLD_TONES, cut: [-3, -5], band: [2, 2.5], seed: 84 })}
        <path d="${band}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
        <path d="${pts.map((x, i) => `${i ? 'L' : 'M'}${x} ${(yc(x) - 6).toFixed(1)}`).join(' ')}" fill="none" stroke="${C.goldLight}" stroke-width="2.4" opacity=".8"/>
      </g>
      ${sockets}${rivets}`,
  });
}

/**
 * A charge lamp for the band. Empty: a dark iron socket with cold glass, so it reads as a hole.
 * Lit: a brass bezel round powder fire with a white-hot star. 64 box.
 */
export function chargePip(lit: boolean): string {
  const IRON = { base: mix(C.inkSoft, C.steelDeep, 0.35), shade: C.ink, light: mix(C.steelDeep, C.steel, 0.3), hatch: C.ink };
  const bezel = lit ? GOLD_TONES : IRON;
  const glass = lit ? { base: C.fireHot, shade: C.fire, light: C.fireCore, hatch: C.fireDeep } : { base: mix(C.nightDeep, C.navy, 0.4), shade: C.nightDeep, light: mix(C.navy, C.navyLight, 0.4), hatch: C.ink };
  const ring = 'M5 32 A27 27 0 1 0 59 32 A27 27 0 1 0 5 32 Z M15 32 A17 17 0 1 1 49 32 A17 17 0 1 1 15 32 Z';
  const core = 'M15 32 A17 17 0 1 0 49 32 A17 17 0 1 0 15 32 Z';
  return composeSymbol({
    size: 64,
    lw: 4.5,
    autoCel: false,
    inkShift: [0.6, 0.7],
    noDrop: true,
    layers: [
      { fills: cel(ring, { ...bezel, cut: [-3, -4], band: [1.5, 2], rule: 'evenodd', seed: 85 }), lines: '<circle cx="32" cy="32" r="27"/>' },
      { fills: cel(core, { ...glass, cut: [-4, -5], band: [2, 2.5], seed: 86 }), lines: '<circle cx="32" cy="32" r="17" stroke-width="3.5"/>' },
    ],
    top: lit
      ? `<path d="M32 18 C34.5 28 36 29.5 46 32 C36 34.5 34.5 36 32 46 C29.5 36 28 34.5 18 32 C28 29.5 29.5 28 32 18 Z" fill="${C.fireCore}"/><circle cx="32" cy="32" r="4" fill="#fff"/>${shine([[21, 27], [25, 21], [31, 19]], 1.8, 0.9)}`
      : shine([[22, 28], [25, 23], [30, 21]], 1.4, 0.35, C.navyLight),
  });
}

/* ------------------------------------------------------------------ */
/* Sparks the parrot                                                   */
/* ------------------------------------------------------------------ */

const feather = (pts: V[], w0: number, w1: number) => taper(pts, w0, w1, 24).d;

/** Perched body. Neck anchor (128, 44); feet grip the perch at y ~216. */
export function parrotBody(): string {
  const g = nextId('pb');
  const body = 'M128 36 C168 36 192 62 194 100 C196 142 178 184 150 210 C140 218 116 218 106 210 C78 184 60 142 62 100 C64 62 88 36 128 36 Z';
  const belly = 'M128 70 C156 70 172 98 170 134 C168 170 150 198 128 202 C106 198 88 170 86 134 C84 98 100 70 128 70 Z';
  const scal = [0, 1, 2, 3]
    .map((r) =>
      [0, 1, 2]
        .map((c) => {
          const x = 106 + c * 22 + (r % 2 ? 11 : 0);
          const y = 108 + r * 22;
          return x < 160 ? `M${x - 9} ${y} Q${x} ${y + 9} ${x + 9} ${y}` : '';
        })
        .join(' '),
    )
    .join(' ');
  const foot = (x: number) =>
    `<path d="M${x - 16} 206 C${x - 20} 218 ${x - 16} 230 ${x - 8} 230 M${x} 208 C${x - 2} 220 ${x + 2} 232 ${x + 8} 232 M${x + 14} 206 C${x + 20} 216 ${x + 18} 228 ${x + 12} 232" stroke="${C.ink}" stroke-width="12" fill="none" stroke-linecap="round"/>
     <path d="M${x - 16} 206 C${x - 20} 218 ${x - 16} 230 ${x - 8} 230 M${x} 208 C${x - 2} 220 ${x + 2} 232 ${x + 8} 232 M${x + 14} 206 C${x + 20} 216 ${x + 18} 228 ${x + 12} 232" stroke="${C.g2}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  const defs = `<radialGradient id="${g}h" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="${C.parrotLight}"/><stop offset=".5" stop-color="${C.parrot}"/><stop offset="1" stop-color="${C.parrotDeep}"/></radialGradient>
    <linearGradient id="${g}y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.parrotLight}"/><stop offset="1" stop-color="${C.parrotYellow}"/></linearGradient>`;
  return composeSymbol({
    noDrop: true,
    defs,
    layers: [
      { fills: `<path d="${body}" fill="url(#${g}h)"/>`, lines: `<path d="${body}"/>` },
      { fills: `<path d="${belly}" fill="url(#${g}y)"/>`, lines: `<path d="${belly}" stroke-width="5"/><path d="${scal}" stroke-width="3" opacity=".35"/>` },
    ],
    top: `${foot(110)}${foot(148)}
      <path d="M84 84 Q92 62 114 54" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round" opacity=".4"/>`,
  });
}

/** Folded wing, shoulder anchor at (64, 40); hangs down and back. */
export function parrotWing(): string {
  const g = nextId('pw');
  const wing = 'M64 34 C106 34 130 72 130 120 C130 160 114 190 92 208 C78 186 60 160 54 124 C48 86 50 50 64 34 Z';
  const tips = [
    feather([[72, 150], [74, 200], [78, 244]], 14, 4),
    feather([[88, 150], [96, 198], [102, 238]], 14, 4),
    feather([[104, 146], [116, 190], [124, 226]], 13, 4),
    feather([[118, 134], [132, 172], [142, 204]], 12, 4),
  ];
  const band = 'M56 64 C80 58 112 68 128 94 C116 106 82 104 54 94 Z';
  const rows = 'M60 118 Q72 128 84 118 Q96 128 108 118 Q118 126 126 118 M64 146 Q76 156 88 146 Q100 156 112 146 Q118 152 122 146';
  const defs = `<linearGradient id="${g}h" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${C.parrotLight}"/><stop offset=".5" stop-color="${C.parrot}"/><stop offset="1" stop-color="${C.parrotDeep}"/></linearGradient>
    <linearGradient id="${g}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.parrotBlue}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>`;
  return composeSymbol({
    noDrop: true,
    defs,
    layers: [
      { fills: tips.map((d) => `<path d="${d}" fill="url(#${g}b)"/>`).join(''), lines: tips.map((d) => `<path d="${d}" stroke-width="5.5"/>`).join('') },
      { fills: `<path d="${wing}" fill="url(#${g}h)"/><path d="${band}" fill="${C.parrotRed}"/>`, lines: `<path d="${wing}"/><path d="${rows}" stroke-width="3.5" opacity=".45"/>` },
    ],
    top: `<path d="M68 48 Q88 42 106 54" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>`,
  });
}

/**
 * Wing spread wide at the top of a flap: same shoulder anchor (64, 40) as the folded wing, the
 * covert fanning out and up with the blue flight feathers splayed. Swapped in at the top of each
 * beat so a flap reads as open-shut, not a folded wing waving.
 */
export function parrotWingSpread(): string {
  const g = nextId('ps');
  const wing = 'M64 34 C98 22 136 26 164 44 C176 54 176 70 164 80 C136 98 98 104 70 92 C54 84 50 50 64 34 Z';
  const tips = [
    feather([[120, 58], [170, 40], [226, 30]], 14, 4),
    feather([[122, 70], [178, 62], [236, 64]], 14, 4),
    feather([[120, 82], [172, 88], [228, 100]], 13, 4),
    feather([[112, 90], [156, 108], [204, 128]], 12, 4),
    feather([[100, 94], [132, 122], [164, 150]], 11, 4),
  ];
  const band = 'M62 44 C78 34 100 32 116 40 C112 56 88 62 60 60 Z';
  const rows = 'M78 62 Q88 70 98 62 Q108 70 118 62 Q126 68 134 62 M84 80 Q94 88 104 80 Q114 88 124 80';
  const defs = `<linearGradient id="${g}h" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="${C.parrotLight}"/><stop offset=".5" stop-color="${C.parrot}"/><stop offset="1" stop-color="${C.parrotDeep}"/></linearGradient>
    <linearGradient id="${g}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.parrotBlue}"/><stop offset="1" stop-color="${C.navy}"/></linearGradient>`;
  return composeSymbol({
    noDrop: true,
    defs,
    layers: [
      { fills: tips.map((d) => `<path d="${d}" fill="url(#${g}b)"/>`).join(''), lines: tips.map((d) => `<path d="${d}" stroke-width="5.5"/>`).join('') },
      { fills: `<path d="${wing}" fill="url(#${g}h)"/><path d="${band}" fill="${C.parrotRed}"/>`, lines: `<path d="${wing}"/><path d="${rows}" stroke-width="3.5" opacity=".45"/>` },
    ],
    top: `<path d="M72 44 Q96 34 120 40" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".45"/>`,
  });
}

/** Long tail feathers, attachment at top centre (128, 24), hanging down. */
export function parrotTail(): string {
  const f = [
    { d: feather([[114, 22], [98, 120], [86, 226]], 22, 6), c: C.parrotRed },
    { d: feather([[142, 22], [158, 118], [170, 216]], 21, 6), c: C.parrotRed },
    { d: feather([[128, 22], [128, 130], [124, 244]], 23, 6), c: C.parrotBlue },
  ];
  return composeSymbol({
    noDrop: true,
    layers: f.map(({ d, c }) => ({ fills: `<path d="${d}" fill="${c}"/>`, lines: `<path d="${d}" stroke-width="6"/>` })),
    top: `<path d="M126 44 L126 220" stroke="#fff" stroke-width="2.5" opacity=".4" stroke-linecap="round"/>`,
  });
}

/** Little powder barrel the parrot sits on. Lid rim at y ~64, ground at y ~236. */
export function perchBarrel(): string {
  const g = nextId('pk');
  const body = 'M54 70 C44 110 42 170 52 212 C58 230 92 240 128 240 C164 240 198 230 204 212 C214 170 212 110 202 70 Z';
  const hoop = (y: number) => `M${48 - (y > 150 ? 2 : 0)} ${y} Q128 ${y + 18} ${208 + (y > 150 ? 2 : 0)} ${y} L${207} ${y + 13} Q128 ${y + 31} ${49} ${y + 13} Z`;
  const staves = [82, 104, 128, 152, 174].map((x) => `M${x} 84 Q${x + (x - 128) * 0.12} 160 ${x} 232`).join(' ');
  const defs = `<linearGradient id="${g}w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.woodLight}"/><stop offset=".45" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodDark}"/></linearGradient>
    <linearGradient id="${g}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>`;
  return composeSymbol({
    noDrop: true,
    defs,
    layers: [
      { fills: `<path d="${body}" fill="url(#${g}w)"/>`, lines: `<path d="${body}"/><path d="${staves}" stroke-width="3.5" opacity=".55"/>` },
      { fills: `<path d="${hoop(96)}" fill="url(#${g}g)"/><path d="${hoop(186)}" fill="url(#${g}g)"/>`, lines: `<path d="${hoop(96)}" stroke-width="5"/><path d="${hoop(186)}" stroke-width="5"/>` },
      { fills: `<ellipse cx="128" cy="68" rx="76" ry="20" fill="${C.woodMid}"/>`, lines: `<ellipse cx="128" cy="68" rx="76" ry="20"/><ellipse cx="128" cy="68" rx="60" ry="13" stroke-width="3.5" opacity=".5"/>` },
    ],
    top: `<g opacity=".85">${skullAndBones(128, 150, 32, C.woodDeep)}</g>
      <path d="M66 100 C62 140 64 180 70 206" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".3"/>`,
  });
}
