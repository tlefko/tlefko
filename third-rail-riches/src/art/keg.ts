/**
 * The two special symbols: the Powder Keg (wild) and the Treasure Chest (scatter).
 * 256x256 viewBox. Hand-cel painted (flat fills, cut shadows, hatching, texture); only emitted
 * light (sparks, the moon lock, the hoard) is soft.
 */
import { lens, sparkle, type V } from './geo';
import { C, composeSymbol, nextId, celForm, celTones, GOLD_TONES, shine, cord, mix, softGlow, glowOf } from './kit';
import { skullAndBones } from './captain';

const BARREL =
  'M62 78 C50 112 46 152 54 194 C58 214 90 234 128 234 C166 234 198 214 202 194 C210 152 206 112 194 78 C176 92 80 92 62 78 Z';
const HOOP = (y: number, h: number, bulge: number) =>
  `M${128 - bulge} ${y} Q128 ${y + 20} ${128 + bulge} ${y} L${128 + bulge - 1} ${y + h} Q128 ${y + h + 20} ${129 - bulge} ${y + h} Z`;
/** A stave seam `dx` from the middle, following the barrel's bulge. */
const seam = (dx: number) => `M${128 + dx * 0.86} ${86 + Math.abs(dx) * 0.04} Q${128 + dx * 1.16} 156 ${128 + dx * 0.9} ${226 - Math.abs(dx) * 0.08}`;
const SEAMS = [-64, -40, -14, 14, 40, 64];
/** The fuse cord from the bung, curling up to the right. */
const KEG_FUSE: V[] = [[150, 74], [163, 63], [153, 52], [161, 43], [175, 40], [185, 34]];
/** Where the keg's fuse spark sits, in 256 viewBox units (for sparks placed in the engine). */
export const KEG_FUSE_TIP: V = KEG_FUSE[KEG_FUSE.length - 1];

/**
 * Powder Keg. `lit` = the fuse is burning: the keg glows hot, the skull stencil turns to fire
 * and the fuse tip throws a spark star.
 */
export function powderKeg(lit = false): string {
  const W = lit
    ? { base: mix(C.wood, C.fire, 0.24), shade: mix(C.woodDark, C.ember, 0.4), light: mix(C.woodLight, C.fireHot, 0.5), hatch: mix(C.ember, C.ink, 0.35) }
    : celTones(C.wood, C.woodDark, C.woodLight);
  const staveLight = lit ? mix(W.base, C.fireHot, 0.18) : mix(C.wood, C.woodLight, 0.24);
  // alternate staves painted a shade lighter, with grain and a couple of knots
  const bands = SEAMS.slice(0, -1)
    .map((dx, i) => {
      if (i % 2) return '';
      const a = seam(dx);
      const b = seam(SEAMS[i + 1]);
      const bRev = b.replace(/^M([\d.]+) ([\d.]+) Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)$/, (_m, x0, y0, qx, qy, x1, y1) => `L${x1} ${y1} Q${qx} ${qy} ${x0} ${y0}`);
      return `<path d="${a} ${bRev} Z" fill="${staveLight}"/>`;
    })
    .join('');
  const grain = [-52, -27, 0, 27, 52]
    .map((dx, i) => {
      const x = 128 + dx * 1.05;
      return `<path d="${lens([[x - 2, 104], [x + 3, 132], [x - 1, 160], [x + 2, 184]], 1.3)}" fill="${W.hatch}" opacity=".5"/><path d="${lens([[x + 6, 150 + i * 4], [x + 9, 170 + i * 4], [x + 6, 190 + i * 4]], 1)}" fill="${W.hatch}" opacity=".4"/>`;
    })
    .join('');
  const knots = `<ellipse cx="84" cy="176" rx="5" ry="3.4" fill="none" stroke="${W.hatch}" stroke-width="1.8" opacity=".7"/><circle cx="84" cy="176" r="1.6" fill="${W.hatch}"/>
    <ellipse cx="172" cy="122" rx="4" ry="2.8" fill="none" stroke="${W.hatch}" stroke-width="1.6" opacity=".7"/>`;
  const seams = SEAMS.slice(1, -1).map((dx) => seam(dx)).join(' ');
  const barrel = celForm(BARREL, {
    ...W,
    cut: [-13, -9],
    band: [5, 4],
    hatch: W.hatch,
    seed: 51,
    inner: `${bands}${grain}${knots}${
      lit
        ? `<path d="${seams}" fill="none" stroke="${C.fireHot}" stroke-width="7" opacity=".35"/><path d="${seams}" fill="none" stroke="${C.fireCore}" stroke-width="2.2" opacity=".9"/>`
        : ''
    }`,
  });
  const G = lit ? { base: C.fireHot, shade: C.fire, light: C.fireCore, hatch: C.fireDeep } : GOLD_TONES;
  const hoops = [HOOP(96, 13, 72), HOOP(196, 13, 72)].map((d, i) => celForm(d, { ...G, cut: [-10, -3], band: [4, 1.5], seed: 52 + i }));
  const lid = 'M61 80 A67 19 0 1 0 195 80 A67 19 0 1 0 61 80 Z';
  const lidF = celForm(lid, {
    base: lit ? mix(C.woodLight, C.fireHot, 0.35) : mix(C.woodLight, C.wood, 0.25),
    shade: lit ? mix(C.wood, C.fire, 0.4) : C.woodMid,
    cut: [-6, -5],
    seed: 54,
    inner: `<path d="M84 70 Q128 64 176 72 M72 84 Q128 92 186 86" stroke="${lit ? C.fireDeep : C.woodMid}" stroke-width="2.4" fill="none" opacity=".7"/>
      <ellipse cx="150" cy="77" rx="10.5" ry="5" fill="${C.inkSoft}"/><ellipse cx="150" cy="76" rx="7" ry="3" fill="${lit ? C.ember : C.woodDeep}"/>`,
  });
  const rivets = [70, 110, 146, 186]
    .map((x) => {
      const y = x < 90 || x > 166 ? 104 : 110;
      return `<circle cx="${x}" cy="${y}" r="3.6" fill="${lit ? C.fireCore : C.goldLight}" stroke="${C.ink}" stroke-width="1.8"/><circle cx="${x - 1}" cy="${y - 1}" r="1.2" fill="#fff" opacity=".8"/>`;
    })
    .join('');
  // fuse: twisted cord from the bung, curling up; lit = fire at the tip
  const fuse = cord(KEG_FUSE, 3.2, { core: lit ? C.fire : C.woodLight, lit: lit ? C.fireCore : C.paperWarm, twist: lit ? C.ember : C.woodMid, ink: 6 });
  const spark = lit
    ? `<g transform="translate(${KEG_FUSE_TIP[0] + 1} ${KEG_FUSE_TIP[1]})">
        ${softGlow(0, 0, 26, C.fireHot, 0.75)}
        <path d="M0 -26 L5.5 -8 L24 -11 L10 2 L22 18 L3.5 9 L-2 28 L-6.5 9 L-24 15 L-11 1 L-26 -9 L-6.5 -7.5 Z" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M0 -13 L3 -3.5 L12 -4.5 L5.5 2 L11 10 L1 5.5 L-1 14 L-3.5 4.5 L-12 7.5 L-5.5 1 L-13 -4.5 L-3.5 -3.5 Z" fill="${C.fireCore}"/>
        <circle cx="-28" cy="-16" r="3" fill="${C.fireCore}"/><circle cx="26" cy="-24" r="2.6" fill="${C.fireCore}"/><circle cx="28" cy="22" r="2.2" fill="${C.fireHot}"/>
      </g>`
    : `<circle cx="${KEG_FUSE_TIP[0]}" cy="${KEG_FUSE_TIP[1]}" r="5.5" fill="${C.inkSoft}" stroke="${C.ink}" stroke-width="3"/><circle cx="${KEG_FUSE_TIP[0] - 1}" cy="${KEG_FUSE_TIP[1] - 1}" r="2" fill="${C.ember}"/>
       <path d="M${KEG_FUSE_TIP[0] + 5} ${KEG_FUSE_TIP[1] - 5} q7 -5 3 -11 q-4 -5 3 -10" stroke="${C.g2}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".75"/>`;
  const stencil = lit
    ? `${glowOf(skullAndBones(128, 154, 68, C.fireHot, true), 6, 0.9)}${skullAndBones(128, 154, 62, C.fireHot, true).split(C.ink).join(C.ember)}<path d="${lens([[110, 136], [118, 130], [128, 128]], 2.6)}" fill="${C.fireCore}"/>`
    : skullAndBones(128, 154, 62, C.crimson, true);
  const rim = lit
    ? `${shine([[62, 112], [56, 150], [62, 192]], 4, 0.85, C.fireHot)}${shine([[196, 110], [202, 150], [196, 194]], 3.4, 0.7, C.fireHot)}`
    : `${shine([[70, 116], [65, 150], [71, 186]], 3.4, 0.55)}`;
  return composeSymbol({
    autoCel: false,
    texture: { seed: 15, mottle: 0.6 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [
      { fills: barrel.fills, lines: `${barrel.line()}<path d="${seams}" stroke-width="2.8" opacity=".55"/>` },
      { fills: hoops.map((h) => h.fills).join(''), lines: hoops.map((h) => h.line('stroke-width="5.5"')).join('') },
      { fills: lidF.fills, lines: `${lidF.line()}<path d="M76 82 Q128 94 180 82" stroke-width="3" opacity=".45"/>` },
    ],
    top: `
      ${rivets}
      ${stencil}
      ${lit ? `<g fill="${C.fireCore}"><circle cx="66" cy="140" r="3"/><circle cx="192" cy="128" r="2.6"/><circle cx="78" cy="188" r="2.4"/><circle cx="180" cy="182" r="3"/></g>` : ''}
      ${fuse}
      ${spark}
      ${rim}
      ${shine([[92, 74], [110, 68], [128, 67]], 2.2, 0.5)}`,
  });
}

/* ------------------------------------------------------------------ */
/* Treasure chest scatter                                             */
/* ------------------------------------------------------------------ */
const CHEST_BODY = 'M46 128 L210 128 L206 224 L50 224 Z';
const CHEST_LID = 'M42 130 C42 86 82 64 128 64 C174 64 214 86 214 130 Z';

/** Crescent moon, centred on (cx, cy), radius r. */
export function crescent(cx: number, cy: number, r: number): string {
  return `M${cx + r * 0.2} ${cy - r} A${r} ${r} 0 1 0 ${cx + r * 0.2} ${cy + r} A${r * 0.78} ${r * 0.78} 0 1 1 ${cx + r * 0.2} ${cy - r} Z`;
}

const WOOD = celTones(C.wood, C.woodDark, C.woodLight);

/** Plank lines, grain and nail heads on the chest body (clipped inside it). */
const bodyDetail = () => `
  <path d="M48 160 L208 160 M50 192 L206 192" stroke="${C.woodDark}" stroke-width="3" opacity=".75"/>
  ${[144, 176, 208]
    .map((y, i) => `<path d="${lens([[58 + i * 9, y - 1], [96 + i * 6, y + 1], [132 + i * 4, y - 1]], 1.2)}" fill="${WOOD.hatch}" opacity=".45"/><path d="${lens([[150 - i * 5, y + 2], [178, y], [200, y + 2]], 1)}" fill="${WOOD.hatch}" opacity=".4"/>`)
    .join('')}`;

/** The lock plate: brass shield with the glowing teal crescent moon. */
function lockPlate(cx = 128, cy = 132) {
  const plate = `M${cx - 25} ${cy - 23} L${cx + 25} ${cy - 23} L${cx + 25} ${cy + 8} C${cx + 25} ${cy + 22} ${cx + 12} ${cy + 31} ${cx} ${cy + 35} C${cx - 12} ${cy + 31} ${cx - 25} ${cy + 22} ${cx - 25} ${cy + 8} Z`;
  const plateF = celForm(plate, { ...GOLD_TONES, cut: [-6, -7], band: [3, 3.5], seed: 61 });
  return `${softGlow(cx, cy + 3, 50, C.tealLight, 0.8)}${softGlow(cx, cy + 2, 30, C.seaFoam, 0.7)}
    ${plateF.fills}<g fill="none" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round">${plateF.line()}</g>
    <circle cx="${cx}" cy="${cy + 2}" r="17" fill="${C.night}" stroke="${C.ink}" stroke-width="4"/>
    <circle cx="${cx + 2}" cy="${cy + 4}" r="13" fill="${C.seaDeep}"/>
    <path d="${crescent(cx - 3, cy + 2, 11)}" fill="${C.tealLight}"/>
    <path d="${crescent(cx - 3, cy + 2, 11)}" fill="none" stroke="${C.seaFoam}" stroke-width="1.4" opacity=".8"/>
    <path d="M${cx + 8} ${cy - 6} l1.6 3.4 l3.6 .4 l-2.7 2.4 l.8 3.6 l-3.3 -1.8 l-3.3 1.8 l.8 -3.6 l-2.7 -2.4 l3.6 -.4 Z" fill="${C.moon}"/>
    ${shine([[cx - 19, cy - 16], [cx - 12, cy - 17], [cx - 5, cy - 16]], 1.8, 0.8)}
    <circle cx="${cx - 18}" cy="${cy + 2}" r="2.4" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.4"/><circle cx="${cx + 18}" cy="${cy + 2}" r="2.4" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.4"/>`;
}

/** Closed treasure chest (scatter idle). */
export function treasureChest(): string {
  const body = celForm(CHEST_BODY, { ...WOOD, cut: [-12, -8], band: [4, 3], hatch: WOOD.hatch, seed: 62, inner: bodyDetail() });
  const lid = celForm(CHEST_LID, {
    base: mix(C.wood, C.woodLight, 0.2),
    shade: WOOD.shade,
    light: WOOD.light,
    cut: [-12, -10],
    band: [4, 4],
    hatch: WOOD.hatch,
    seed: 63,
    inner: `<path d="M58 100 C80 84 104 78 128 78 C152 78 176 84 198 100 M50 118 C76 104 102 98 128 98 C154 98 180 104 206 118" stroke="${C.woodMid}" stroke-width="3" fill="none" opacity=".7"/>`,
  });
  const straps = [86, 170].map((x, i) => celForm(`M${x - 9} 68 L${x + 9} 68 L${x + 11} 224 L${x - 11} 224 Z`, { ...GOLD_TONES, cut: [-4, -2], band: [2.5, 1], seed: 64 + i }));
  const rimBand = celForm('M36 124 L220 124 L220 138 L36 138 Z', { ...GOLD_TONES, cut: [-8, -4], band: [3, 2], seed: 66 });
  const feet = celForm('M40 212 L62 212 L62 226 L40 226 Z M194 212 L216 212 L216 226 L194 226 Z', { ...GOLD_TONES, cut: [-4, -4], seed: 67 });
  const rivets = [86, 170]
    .flatMap((x) => [96, 150, 200].map((y) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2"/><circle cx="${x - 1}" cy="${y - 1}" r="1.2" fill="#fff" opacity=".8"/>`))
    .join('');
  return composeSymbol({
    autoCel: false,
    texture: { seed: 16, mottle: 0.6 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [
      { fills: body.fills, lines: body.line() },
      { fills: lid.fills, lines: lid.line() },
      { fills: straps.map((s) => s.fills).join(''), lines: straps.map((s) => s.line('stroke-width="5"')).join('') },
      { fills: rimBand.fills, lines: rimBand.line('stroke-width="5.5"') },
      { fills: feet.fills, lines: feet.line('stroke-width="4"') },
    ],
    top: `${rivets}
      ${lockPlate()}
      ${shine([[64, 98], [84, 82], [110, 75]], 3, 0.55)}
      ${shine([[40, 127], [80, 126], [120, 126]], 1.6, 0.55, C.goldLight)}`,
  });
}

/** Open treasure chest bursting with gold (scatter win pose). */
export function treasureChestOpen(): string {
  const lidOpen = 'M46 126 L60 50 C92 36 164 36 196 50 L210 126 Z';
  const lining = 'M62 118 L72 60 C98 50 158 50 184 60 L194 118 Z';
  const hoard = 'M48 128 C52 108 70 96 90 100 C100 84 122 80 138 90 C152 80 176 86 184 102 C200 100 212 114 208 128 Z';
  const coin = (x: number, y: number, r: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.62}" fill="${GOLD_TONES.shade}" stroke="${C.ink}" stroke-width="3"/>
     <ellipse cx="${x - r * 0.12}" cy="${y - r * 0.1}" rx="${r * 0.82}" ry="${r * 0.46}" fill="${C.gold}"/>
     <ellipse cx="${x - r * 0.1}" cy="${y - r * 0.08}" rx="${r * 0.5}" ry="${r * 0.26}" fill="none" stroke="${C.goldDeep}" stroke-width="1.6" opacity=".7"/>
     <path d="M${x - r * 0.5} ${y - r * 0.16} Q${x} ${y - r * 0.5} ${x + r * 0.45} ${y - r * 0.18}" stroke="#fff" stroke-width="2" fill="none" opacity=".75"/>`;
  const coins = (
    [
      [70, 116, 13],
      [92, 106, 14],
      [118, 98, 15],
      [146, 100, 14],
      [172, 108, 13],
      [190, 118, 12],
      [104, 120, 13],
      [134, 116, 14],
      [160, 122, 12],
      [82, 126, 11],
    ] as const
  )
    .map(([x, y, r]) => coin(x, y, r))
    .join('');
  // light rays: flat, banded wedges fanning up from the hoard
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = (-150 + i * 15) * (Math.PI / 180);
    const x = 128 + Math.cos(a) * 102;
    const y = 112 + Math.sin(a) * 102;
    const n = [-Math.sin(a) * 12, Math.cos(a) * 12];
    const mx = 128 + Math.cos(a) * 70;
    const my = 112 + Math.sin(a) * 70;
    const n2 = [n[0] * 0.66, n[1] * 0.66];
    return `<path d="M128 112 L${(x - n[0]).toFixed(1)} ${(y - n[1]).toFixed(1)} L${(x + n[0]).toFixed(1)} ${(y + n[1]).toFixed(1)} Z" fill="${C.gold}" opacity="${i % 2 ? 0.22 : 0.34}"/>
      <path d="M128 112 L${(mx - n2[0]).toFixed(1)} ${(my - n2[1]).toFixed(1)} L${(mx + n2[0]).toFixed(1)} ${(my + n2[1]).toFixed(1)} Z" fill="${C.goldLight}" opacity="${i % 2 ? 0.3 : 0.42}"/>`;
  }).join('');
  const lidF = celForm(lidOpen, { ...WOOD, cut: [-10, -6], hatch: WOOD.hatch, seed: 71 });
  const liningF = celForm(lining, { base: C.crimsonDeep, shade: mix(C.crimsonDeep, C.ink, 0.45), light: C.crimson, cut: [8, 10], band: [-3, -4], seed: 72 });
  const hoardF = celForm(hoard, { ...GOLD_TONES, cut: [-8, -8], band: [3, 3], hatch: GOLD_TONES.hatch, seed: 73 });
  const body = celForm(CHEST_BODY, { ...WOOD, cut: [-12, -8], band: [4, 3], hatch: WOOD.hatch, seed: 74, inner: bodyDetail() });
  const rimBand = celForm('M36 124 L220 124 L220 138 L36 138 Z', { ...GOLD_TONES, cut: [-8, -4], band: [3, 2], seed: 75 });
  const straps = celForm('M77 138 L95 138 L97 224 L75 224 Z M161 138 L179 138 L181 224 L159 224 Z', { ...GOLD_TONES, cut: [-4, -2], band: [2.5, 1], seed: 76 });
  const gid = nextId('gem');
  return composeSymbol({
    autoCel: false,
    texture: { seed: 17, mottle: 0.6 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: `${rays}${softGlow(128, 116, 62, C.gold, 0.55)}`,
    layers: [
      { fills: lidF.fills + liningF.fills, lines: `${lidF.line()}${liningF.line('stroke-width="4.5"')}` },
      { fills: hoardF.fills, lines: hoardF.line('stroke-width="5.5"') },
      { fills: coins, lines: '' },
      { fills: body.fills, lines: body.line() },
      { fills: rimBand.fills + straps.fills, lines: `${rimBand.line('stroke-width="5.5"')}${straps.line('stroke-width="5"')}` },
    ],
    top: `
      <g id="${gid}">
        <path d="M118 70 L126 84 L142 84 L130 94 L134 110 L120 100 L106 110 L110 94 L98 84 L114 84 Z" fill="${C.crimsonLight}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M118 70 L126 84 L120 100 L110 94 L98 84 L114 84 Z" fill="${C.crimson}"/>
        <path d="M118 70 L126 84 L142 84 L130 94 L134 110 L120 100 L106 110 L110 94 L98 84 L114 84 Z" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M150 74 L164 60 L178 74 L164 88 Z" fill="${C.tealLight}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M164 60 L178 74 L164 88 Z" fill="${C.teal}"/><path d="M150 74 L164 60 L178 74 L164 88 Z" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M156 74 L164 66 L170 72" stroke="#fff" stroke-width="2" fill="none" opacity=".85"/>
      </g>
      ${lockPlate(128, 160)}
      ${sparkle(64, 70, 13, C.goldLight)}${sparkle(204, 58, 11, C.white)}${sparkle(112, 28, 9, C.goldLight, 0.9)}${sparkle(222, 110, 7, C.white, 0.85)}
      <g transform="translate(34 52) rotate(-24)">${coin(0, 0, 12)}</g>
      <g transform="translate(160 22) rotate(18)">${coin(0, 0, 10)}</g>
      ${shine([[40, 127], [80, 126], [120, 126]], 1.6, 0.55, C.goldLight)}`,
  });
}
