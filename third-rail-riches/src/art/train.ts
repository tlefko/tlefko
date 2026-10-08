/**
 * Side-view train sprites (docs/ART.md): the locomotive and passenger cars that run along a row
 * when a Locomotive departs, plus a separate wheel (so the game can spin wheels) and a tileable
 * rail bed. Same ink + cel technique as the symbols. Every piece faces RIGHT (direction of travel).
 *
 * Compositing: draw the wheels (wheelSprite, at the `wheels` centres) BEHIND the body sprite drawn
 * with `noWheels = true`; the body's skirt overlaps the top of each wheel.
 */
import { lens, sparkle, type V } from './geo';
import { C, nextId, composeSymbol, celForm, celTones, GOLD_TONES, shine, mix, softGlow, rng } from './kit';

const f1 = (n: number) => n.toFixed(1);
const rivet = (x: number, y: number, r = 2.6, fill: string = C.goldLight) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${C.ink}" stroke-width="${(r * 0.5).toFixed(2)}"/>`;

/** composeSymbol in a square box of the sprite's width, cropped to w x h. */
function sprite(w: number, h: number, parts: Parameters<typeof composeSymbol>[0]): string {
  return composeSymbol({ ...parts, size: w }).replace(`viewBox="0 0 ${w} ${w}" width="${w}" height="${w}"`, `viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"`);
}

/** One wheel drawn in place (for the full sprites): steel tyre, maroon spoked centre, crank pin. */
function wheelAt(x: number, y: number, r: number, hub: string = C.maroon, rot = 0): string {
  const k = r / 29;
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${k.toFixed(3)}) rotate(${rot})">${wheelBody(hub)}</g>`;
}

/** Wheel art centred on 0,0 with tyre radius 29. */
function wheelBody(hub: string = C.maroon): string {
  const H = celTones(hub, mix(hub, C.ink, 0.5), mix(hub, C.white, 0.35));
  const spokes = Array.from({ length: 10 }, (_, i) => {
    const a = (i * 36 * Math.PI) / 180;
    return `M${f1(Math.cos(a) * 6)} ${f1(Math.sin(a) * 6)} L${f1(Math.cos(a) * 19)} ${f1(Math.sin(a) * 19)}`;
  }).join(' ');
  return `<circle r="29" fill="${C.steelDeep}" stroke="${C.ink}" stroke-width="3.6"/>
    <circle r="25.5" fill="${C.steel}"/>
    <path d="M-23 -10 A25 25 0 0 1 -6 -24.5" stroke="${C.steelLight}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle r="21" fill="${H.shade}" stroke="${C.ink}" stroke-width="2.6"/>
    <circle cx="-1.5" cy="-1.5" r="18.5" fill="${H.base}"/>
    <path d="${spokes}" stroke="${C.ink}" stroke-width="4.6" stroke-linecap="round"/>
    <path d="${spokes}" stroke="${H.light}" stroke-width="1.6" stroke-linecap="round"/>
    <circle r="7.5" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.6"/>
    <circle r="2.6" fill="${C.goldDeep}"/>
    <circle cx="0" cy="13" r="3.6" fill="${C.steelLight}" stroke="${C.ink}" stroke-width="2"/>`;
}

/** A spoked wheel on its own (64x64, tyre radius 29 around 32,32) so the game can rotate it. */
export function wheelSprite(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><g transform="translate(32 32)">${wheelBody()}</g></svg>`;
}

/* ------------------------------------------------------------------ */
/* Locomotive (side)                                                   */
/* ------------------------------------------------------------------ */
const LOCO_BODY = 'M22 62 Q22 40 46 40 L266 40 C318 40 350 58 366 94 C374 112 374 132 368 150 L22 150 Z';
const LOCO_WHEELS: [number, number, number][] = [
  [78, 160, 22],
  [128, 160, 22],
  [248, 160, 22],
  [298, 160, 22],
];
/** Locomotive side geometry (384x192 box): headlamp centre and wheel centres + radius. */
export const LOCO_SIDE = { w: 384, h: 192, lamp: [362, 98] as V, wheels: LOCO_WHEELS };

/** Side rods tying a wheel pair (crank pins at the bottom of each wheel at rest). */
const rod = (x0: number, x1: number, y: number) =>
  `<path d="M${x0} ${y} L${x1} ${y}" stroke="${C.ink}" stroke-width="9" stroke-linecap="round"/><path d="M${x0} ${y} L${x1} ${y}" stroke="${C.steel}" stroke-width="4.4" stroke-linecap="round"/><path d="M${x0} ${y - 1.2} L${x1} ${y - 1.2}" stroke="${C.steelLight}" stroke-width="1.4" stroke-linecap="round"/>`;

/** A chunky 1930s electric streamliner in profile, facing right. 384x192. */
export function locoSide(golden = false, noWheels = false): string {
  const B = golden ? GOLD_TONES : celTones(C.maroon, C.maroonDeep, C.maroonLight);
  const TRIM = golden ? C.platinumLight : C.cream;
  const TRIM_S = golden ? C.platinum : mix(C.cream, C.tileDeep, 0.6);
  const BR = golden ? celTones(C.platinum, C.platinumDeep, C.platinumLight) : GOLD_TONES;
  const IRON = celTones(C.iron, C.ironDeep, C.ironLight);
  const [lx, ly] = LOCO_SIDE.lamp;
  const body = celForm(LOCO_BODY, {
    ...B,
    cut: [-8, -12],
    band: [3.5, 4.5],
    hatch: B.hatch,
    seed: 141,
    inner: `<path d="M22 102 L322 102 Q352 104 372 118 L372 126 Q350 114 322 114 L22 114 Z" fill="${TRIM}"/>
      <path d="M22 111 L322 111 Q350 112 372 124 L372 126 Q350 114 322 114 L22 114 Z" fill="${TRIM_S}"/>
      <path d="M300 122 Q340 122 370 132 L370 136 Q340 127 300 127 Z M306 132 Q340 132 368 142 L368 145 Q340 137 306 137 Z" fill="${TRIM}"/>
      <path d="M22 138 L372 138 L372 152 L22 152 Z" fill="${mix(B.shade, C.ink, 0.3)}"/>
      <path d="M40 44 L262 44" stroke="${B.light}" stroke-width="3" opacity=".8"/>`,
  });
  const bodyLines = `<path d="M22 102 L322 102 Q352 104 372 118 M22 114 L322 114 Q350 114 371 126" stroke-width="3"/>
    <path d="M22 138 L370 138" stroke-width="3"/>
    <path d="M232 52 L232 136 M262 52 L262 136 M232 52 L262 52" stroke-width="3"/>`;
  const glass = { base: mix(C.voltNight, C.voltDeep, 0.35), shade: mix(C.voltNight, C.tunnel, 0.4), light: mix(C.voltDeep, C.volt, 0.35) };
  const shield = celForm('M318 52 C336 58 350 70 356 84 L320 86 Z', { ...glass, cut: [5, 6], band: [-2, -2], seed: 142, inner: `<path d="M326 80 L340 62 L345 64 L332 82 Z" fill="#fff" opacity=".35"/>` });
  const cabWin = celForm('M282 54 L306 54 L306 86 L282 86 Z', { ...glass, cut: [5, 6], band: [-2, -2], seed: 143, inner: `<path d="M286 80 L298 58 L302 58 L290 82 Z" fill="#fff" opacity=".3"/>` });
  const doorWin = celForm('M238 58 L256 58 L256 80 L238 80 Z', { ...glass, cut: [4, 5], seed: 144 });
  // engine room portholes with brass rings
  const ports = [70, 116, 162, 208]
    .map((x) => `<circle cx="${x}" cy="74" r="13" fill="${BR.base}" stroke="${C.ink}" stroke-width="3.4"/><circle cx="${x}" cy="74" r="8.5" fill="${glass.base}" stroke="${C.ink}" stroke-width="2.4"/><path d="M${x - 5} ${74 + 1} A6 6 0 0 1 ${x + 1} ${74 - 5}" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>`)
    .join('');
  // louvres over the motors
  const louvres = [56, 102, 148, 194].map((x) => `<path d="M${x} 124 L${x + 28} 124 M${x} 129 L${x + 28} 129 M${x} 134 L${x + 28} 134" stroke="${mix(B.shade, C.ink, 0.35)}" stroke-width="2.4"/>`).join('');
  const rivets = Array.from({ length: 16 }, (_, i) => rivet(36 + i * 20, 145, 2.2, BR.light)).join('');
  // headlamp in the nose, with its brass bezel
  const lamp = `<circle cx="${lx}" cy="${ly}" r="12" fill="${BR.base}" stroke="${C.ink}" stroke-width="3.4"/>
    <circle cx="${lx}" cy="${ly}" r="7.5" fill="${C.amberLight}" stroke="${C.ink}" stroke-width="2.2"/>
    <circle cx="${lx - 2}" cy="${ly - 2}" r="2.4" fill="#fff"/>`;
  // pantograph: a folding diamond to the overhead wire
  const panto = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M140 40 L156 22 L196 22 L212 40 M156 22 L176 6 L196 22" stroke="${C.ink}" stroke-width="6.5"/>
      <path d="M140 40 L156 22 L196 22 L212 40 M156 22 L176 6 L196 22" stroke="${C.steel}" stroke-width="2.8"/>
      <path d="M158 6 L194 6" stroke="${C.ink}" stroke-width="7"/><path d="M158 6 L194 6" stroke="${BR.base}" stroke-width="3.4"/>
    </g>
    <rect x="134" y="34" width="84" height="8" rx="3" fill="${IRON.base}" stroke="${C.ink}" stroke-width="3"/>
    <circle cx="140" cy="38" r="3" fill="${C.cream}" stroke="${C.ink}" stroke-width="1.6"/><circle cx="212" cy="38" r="3" fill="${C.cream}" stroke="${C.ink}" stroke-width="1.6"/>`;
  const pilot = celForm('M326 150 L370 150 L382 178 L322 178 Z', {
    ...IRON,
    cut: [-6, -4],
    seed: 145,
    inner: `<path d="M334 152 L332 178 M346 152 L346 178 M358 152 L362 178 M368 152 L374 176" stroke="${C.ironDeep}" stroke-width="3.4"/>`,
  });
  const coupler = celForm('M4 122 L24 122 L24 136 L4 136 Z', { ...IRON, cut: [-3, -3], seed: 146 });
  const chassis = `<path d="M40 146 L340 146 L336 168 L44 168 Z" fill="${C.ironDeep}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>`;
  const wheels = noWheels ? '' : `${LOCO_WHEELS.map(([x, y, r]) => wheelAt(x, y, r, golden ? C.gold : C.maroon)).join('')}${rod(78, 128, 172)}${rod(248, 298, 172)}`;
  return sprite(384, 192, {
    autoCel: false,
    texture: { seed: 44 + (golden ? 1 : 0), mottle: 0.5 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: golden ? softGlow(196, 100, 120, C.gold, 0.4) : '',
    layers: [
      { fills: chassis + wheels, lines: '' },
      { fills: coupler.fills + pilot.fills, lines: `${coupler.line('stroke-width="4"')}${pilot.line('stroke-width="5"')}` },
      { fills: body.fills, lines: `${body.line()}${bodyLines}` },
      { fills: shield.fills + cabWin.fills + doorWin.fills, lines: `${shield.line('stroke-width="4.5"')}${cabWin.line('stroke-width="4.5"')}${doorWin.line('stroke-width="3.6"')}` },
    ],
    top: `${ports}${louvres}${rivets}${panto}${lamp}
      <path d="M268 60 L268 128" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/><path d="M268 60 L268 128" stroke="${BR.light}" stroke-width="2" stroke-linecap="round"/>
      ${shine([[30, 92], [32, 60], [48, 46]], 3.4, 0.6)}
      ${shine([[290, 44], [330, 50], [356, 72]], 2.6, 0.6)}
      ${golden ? `${sparkle(60, 28, 10, '#fff')}${sparkle(330, 30, 8, C.goldLight)}${sparkle(240, 122, 6, '#fff')}` : ''}`,
  });
}

/* ------------------------------------------------------------------ */
/* Passenger car                                                       */
/* ------------------------------------------------------------------ */
const CAR_BODY = 'M14 66 Q14 42 40 42 L280 42 Q306 42 306 66 L306 150 L14 150 Z';
const CAR_WHEELS: [number, number, number][] = [
  [62, 162, 20],
  [106, 162, 20],
  [214, 162, 20],
  [258, 162, 20],
];
/** Passenger car geometry (320x192 box): wheel centres + radius. */
export const CARRIAGE_SIDE = { w: 320, h: 192, wheels: CAR_WHEELS };

/** A cartoon passenger silhouette in a window (head + shoulders + hat), bottom at y. */
function passenger(x: number, y: number, kind: number, col: string): string {
  const hats = [
    // bowler
    `<path d="M${x - 11} ${y - 30} L${x + 11} ${y - 30} M${x - 7} ${y - 31} Q${x - 7} ${y - 42} ${x} ${y - 42} Q${x + 7} ${y - 42} ${x + 7} ${y - 31} Z" fill="${col}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`,
    // cloche with a feather
    `<path d="M${x - 10} ${y - 27} Q${x - 10} ${y - 41} ${x} ${y - 41} Q${x + 10} ${y - 41} ${x + 11} ${y - 27} Z" fill="${col}"/><path d="M${x + 6} ${y - 38} Q${x + 14} ${y - 46} ${x + 18} ${y - 44}" stroke="${col}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    // newsboy cap
    `<path d="M${x - 9} ${y - 30} Q${x - 8} ${y - 40} ${x + 2} ${y - 39} Q${x + 10} ${y - 38} ${x + 9} ${y - 31} L${x + 15} ${y - 29} Z" fill="${col}"/>`,
    // no hat: hair bun
    `<circle cx="${x - 7}" cy="${y - 37}" r="5" fill="${col}"/>`,
    // reading a newspaper (no hat)
    '',
  ];
  const paper = kind === 4 ? `<path d="M${x - 14} ${y - 20} L${x + 14} ${y - 22} L${x + 14} ${y - 2} L${x - 14} ${y}Z" fill="${C.paper}" opacity=".85"/><path d="M${x - 10} ${y - 15} L${x + 10} ${y - 16} M${x - 10} ${y - 10} L${x + 6} ${y - 11}" stroke="${col}" stroke-width="1.6"/>` : '';
  return `<g>
    <path d="M${x - 16} ${y} Q${x - 15} ${y - 16} ${x} ${y - 17} Q${x + 15} ${y - 16} ${x + 16} ${y} Z" fill="${col}"/>
    <circle cx="${x}" cy="${y - 27}" r="${kind === 4 ? 8 : 9}" fill="${col}"/>
    <path d="M${x + 7} ${y - 30} l5 2 l-5 2 Z" fill="${col}"/>
    ${hats[kind % hats.length]}${paper}
  </g>`;
}

/** A matching passenger car facing right: lit amber windows with passengers. `variant` 0 or 1. 320x192. */
export function carriage(variant = 0, noWheels = false): string {
  const v = variant % 2;
  const B = celTones(C.maroon, C.maroonDeep, C.maroonLight);
  const IRON = celTones(C.iron, C.ironDeep, C.ironLight);
  const winY = 56;
  const winH = 40;
  const xs = v === 0 ? [32, 84, 136, 188, 240] : [30, 78, 194, 242];
  const r = rng(51 + v * 7);
  const body = celForm(CAR_BODY, {
    ...B,
    cut: [-8, -12],
    band: [3.5, 4.5],
    hatch: B.hatch,
    seed: 151 + v,
    inner: `${
      v === 1
        ? `<path d="M14 50 L306 50 L306 104 L14 104 Z" fill="${C.cream}"/><path d="M14 100 L306 100 L306 104 L14 104 Z" fill="${mix(C.cream, C.tileDeep, 0.6)}"/>`
        : `<path d="M14 104 L306 104 L306 116 L14 116 Z" fill="${C.cream}"/><path d="M14 113 L306 113 L306 116 L14 116 Z" fill="${mix(C.cream, C.tileDeep, 0.6)}"/>`
    }
      <path d="M14 138 L306 138 L306 152 L14 152 Z" fill="${mix(B.shade, C.ink, 0.3)}"/>
      <path d="M36 46 L284 46" stroke="${B.light}" stroke-width="3" opacity=".8"/>`,
  });
  const lines = v === 1 ? `<path d="M14 50 L306 50 M14 104 L306 104" stroke-width="3"/>` : `<path d="M14 104 L306 104 M14 116 L306 116" stroke-width="3"/>`;
  // clerestory roof strip with vents
  const roof = celForm('M44 42 L52 30 L268 30 L276 42 Z', { ...celTones(C.iron, C.ironDeep, C.ironLight), cut: [-4, -3], seed: 155, inner: [80, 130, 180, 230].map((x) => `<rect x="${x}" y="33" width="14" height="5" rx="2" fill="${C.ironDeep}"/>`).join('') });
  const win = (x: number, k: number) => {
    const sil = mix(C.amberDeep, C.ink, 0.55);
    const who = r() < 0.85 ? passenger(x + 20 + (r() - 0.5) * 6, winY + winH, Math.floor(r() * 5), sil) : '';
    const who2 = k % 2 === 1 && r() < 0.6 ? passenger(x + 30, winY + winH + 2, Math.floor(r() * 5), mix(C.amberDeep, C.ink, 0.35)) : '';
    const d = `M${x} ${winY + 8} Q${x} ${winY} ${x + 8} ${winY} L${x + 32} ${winY} Q${x + 40} ${winY} ${x + 40} ${winY + 8} L${x + 40} ${winY + winH} L${x} ${winY + winH} Z`;
    const id = nextId('cw');
    return `<clipPath id="${id}"><path d="${d}"/></clipPath>
      <path d="${d}" fill="${C.amber}"/>
      <g clip-path="url(#${id})">
        <path d="M${x} ${winY} L${x + 40} ${winY} L${x + 40} ${winY + winH} Z" fill="${C.amberLight}" opacity=".7"/>
        ${who2}${who}
        <rect x="${x}" y="${winY}" width="40" height="7" fill="${C.crimsonDeep}" opacity=".8"/>
        <path d="M${x + 4} ${winY + winH - 4} L${x + 16} ${winY + 10}" stroke="#fff" stroke-width="2.4" opacity=".35"/>
      </g>
      <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M${x - 2} ${winY + winH + 3} L${x + 42} ${winY + winH + 3}" stroke="${C.goldDeep}" stroke-width="3" stroke-linecap="round"/>`;
  };
  const door =
    v === 1
      ? `<path d="M138 52 L182 52 L182 138 L138 138 Z" fill="${B.shade}" stroke="${C.ink}" stroke-width="3.6"/>
         <path d="M160 52 L160 138" stroke="${C.ink}" stroke-width="3"/>
         <path d="M143 60 L156 60 L156 94 L143 94 Z M164 60 L177 60 L177 94 L164 94 Z" fill="${C.amber}" stroke="${C.ink}" stroke-width="3"/>
         <path d="M146 90 L152 64 M167 90 L173 64" stroke="#fff" stroke-width="2" opacity=".4"/>`
      : '';
  const glow = xs.map((x) => softGlow(x + 20, winY + 22, 22, C.amber, 0.35)).join('');
  const rivets = Array.from({ length: 15 }, (_, i) => rivet(24 + i * 20, 145, 2.2)).join('');
  const coupler = celForm('M0 122 L16 122 L16 136 L0 136 Z M304 122 L320 122 L320 136 L304 136 Z', { ...IRON, cut: [-3, -3], seed: 156 });
  const chassis = `<path d="M30 146 L290 146 L286 168 L34 168 Z" fill="${C.ironDeep}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>`;
  const wheels = noWheels ? '' : CAR_WHEELS.map(([x, y, rr]) => wheelAt(x, y, rr)).join('');
  return sprite(320, 192, {
    autoCel: false,
    texture: { seed: 47 + v, mottle: 0.5 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [
      { fills: chassis + wheels, lines: '' },
      { fills: coupler.fills, lines: coupler.line('stroke-width="3.6"') },
      { fills: roof.fills, lines: roof.line('stroke-width="4"') },
      { fills: body.fills, lines: `${body.line()}${lines}` },
    ],
    top: `${glow}${xs.map((x, k) => win(x, k)).join('')}${door}${rivets}
      ${shine([[22, 96], [22, 64], [36, 48]], 3, 0.6)}
      ${shine([[60, 45], [160, 44], [260, 45]], 1.8, 0.5)}`,
  });
}

/* ------------------------------------------------------------------ */
/* Rail bed                                                            */
/* ------------------------------------------------------------------ */
/** Seamless horizontal strip: two steel rails on wooden sleepers over ballast. 256x64. */
export function railBed(): string {
  const r = rng(77);
  const W = celTones(C.wood, C.woodDark, C.woodLight);
  // ballast: deterministic pebbles, wrapped across the tile edge so the strip tiles
  let stones = '';
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    const y = 10 + r() * 50;
    const rr = 1.6 + r() * 2.6;
    const col = [C.g4, C.g3, C.g5][Math.floor(r() * 3)];
    for (const dx of [0, -256, 256]) if (x + dx > -6 && x + dx < 262) stones += `<ellipse cx="${f1(x + dx)}" cy="${f1(y)}" rx="${f1(rr * 1.3)}" ry="${f1(rr)}" fill="${col}"/>`;
  }
  const sleepers = Array.from({ length: 8 }, (_, i) => {
    const x = 7 + i * 32;
    const d = `M${x} 14 L${x + 18} 14 L${x + 19} 58 L${x - 1} 58 Z`;
    const s = celForm(d, { ...W, cut: [-4, -3], seed: 160 + i, inner: `<path d="${lens([[x + 5, 18], [x + 6, 36], [x + 5, 54]], 1)}" fill="${W.hatch}" opacity=".6"/><path d="${lens([[x + 12, 22], [x + 13, 40]], 0.9)}" fill="${W.hatch}" opacity=".5"/>` });
    return `${s.fills}<g fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round">${s.line()}</g>
      <rect x="${x + 2}" y="20" width="4" height="4" fill="${C.ironDeep}"/><rect x="${x + 12}" y="20" width="4" height="4" fill="${C.ironDeep}"/>
      <rect x="${x + 2}" y="44" width="4" height="4" fill="${C.ironDeep}"/><rect x="${x + 12}" y="44" width="4" height="4" fill="${C.ironDeep}"/>`;
  }).join('');
  const rail = (y: number, h: number) => `<rect x="-2" y="${y + h}" width="260" height="${(h * 0.6).toFixed(1)}" fill="${C.ink}" opacity=".45"/>
    <rect x="-2" y="${y}" width="260" height="${h}" fill="${C.steelDeep}" stroke="${C.ink}" stroke-width="2.4"/>
    <rect x="-2" y="${y + 1.2}" width="260" height="${(h * 0.42).toFixed(1)}" fill="${C.steelLight}"/>
    <rect x="-2" y="${y + 1.2 + h * 0.42}" width="260" height="${(h * 0.22).toFixed(1)}" fill="${C.steel}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 64" width="256" height="64">
    <rect x="0" y="8" width="256" height="54" fill="${C.ironDeep}" opacity=".55"/>
    ${stones}${sleepers}
    ${rail(16, 8)}${rail(39, 10)}
  </svg>`;
}
