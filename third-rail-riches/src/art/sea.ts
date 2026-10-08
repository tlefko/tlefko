/**
 * Low-pay symbols: anchor, scallop shell with pearl, treasure map, brass compass.
 * Each owns one hue (docs/ART.md) and reads as a silhouette at 90 px.
 */
import { C, composeSymbol, nextId, scallops, celForm, celTones, GOLD_TONES, shine, cord, mix } from './kit';
import { type V, add, dir, rad, P, sparkle, lens, annulus } from './geo';

/* ------------------------------------------------------------------ */
/* Shared paint for the lows                                           */
/* ------------------------------------------------------------------ */
const tones = celTones;
const GOLD = GOLD_TONES;
/** Twisted rope along a spline (see kit `cord`). */
const rope = (pts: V[], w = 6, from = 0, to = 1) => cord(pts, w, { from, to });

/* ------------------------------------------------------------------ */
/* Anchor with a coiled rope (teal)                                    */
/* ------------------------------------------------------------------ */
interface AnchorPose {
  /** Swing in degrees about the ring (0 = hanging at rest). */
  swing: number;
  /** Rope end lag (secondary motion), in units. */
  lag?: number;
  /** Motion arcs on the trailing side: -1 left, 1 right. */
  arcs?: -1 | 1;
}

function anchorArt(p: AnchorPose): string {
  const T = tones(C.teal, C.tealDeep, C.tealLight);
  const O: V = [128, 114];
  const R = 84;
  const Th = 24;
  const L = 156;
  const Rt = 24;
  const at = (r: number, a: number) => add(O, dir(a), r);
  const ro = R + Th / 2;
  const ri = R - Th / 2;
  const arms = `M${P(at(ro, L))} A${ro} ${ro} 0 0 0 ${P(at(ro, Rt))} L${P(at(ri, Rt))} A${ri} ${ri} 0 0 1 ${P(at(ri, L))} Z`;
  const fluke = (a: number, side: -1 | 1) => {
    const q = at(R, a);
    const dd = side < 0 ? dir(a + 90) : dir(a - 90);
    const out = dir(a);
    const tip = add(q, dd, 44);
    const b1 = add(add(q, out, 27), dd, -7);
    const b2 = add(add(q, out, -27), dd, -7);
    return `M${P(b1)} Q${P(add(add(q, out, 25), dd, 24))} ${P(tip)} Q${P(add(add(q, out, -25), dd, 24))} ${P(b2)} Q${P(add(q, dd, 9))} ${P(b1)} Z`;
  };
  const shank = 'M114 62 Q114 52 128 52 Q142 52 142 62 L146 204 L110 204 Z';
  const stock = 'M66 78 Q128 70 190 78 L190 98 Q128 106 66 98 Z';
  const crown = 'M106 194 L150 194 Q154 214 128 230 Q102 214 106 194 Z';
  const ball = (x: number) => `M${x - 15} 88 A15 15 0 1 0 ${x + 15} 88 A15 15 0 1 0 ${x - 15} 88 Z`;
  // rest pose: tilted -9 degrees about the centre; the swing pivots on the ring
  const t = `rotate(${p.swing} 113 33.2) rotate(-9 128 128)`;
  const lag = p.lag ?? 0;
  const ropePts: V[] = [[134, 46], [154, 58], [162, 80], [156, 102], [128, 120], [100, 134], [88, 148], [104, 158], [134, 158], [162 + lag * 0.3, 162], [174 + lag * 0.6, 180], [170 + lag, 200], [160 + lag * 1.2, 212]];
  const end = ropePts[ropePts.length - 1];
  const ropeEnd = `<path d="M${end[0]} ${end[1]} l-8 12 M${end[0]} ${end[1]} l0 15 M${end[0]} ${end[1]} l8 11" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
    <path d="M${end[0] - 8} ${end[1] - 8} L${end[0] + 6} ${end[1] + 2}" stroke="${C.ink}" stroke-width="19" stroke-linecap="butt"/><path d="M${end[0] - 8} ${end[1] - 8} L${end[0] + 6} ${end[1] + 2}" stroke="${C.crimson}" stroke-width="12" stroke-linecap="butt"/>
    <path d="M${end[0] - 9} ${end[1] - 5.5} L${end[0] - 1} ${end[1]}" stroke="${C.crimsonLight}" stroke-width="3" stroke-linecap="round"/>`;
  const ring = annulus(128, 31, 23.5, 9.5);
  const ringF = celForm(ring, { ...GOLD, t, rule: 'evenodd', cut: [-4, -5], seed: 3 });
  const armF = celForm(arms, {
    ...T,
    t,
    cut: [-8, -10],
    hatch: T.hatch,
    seed: 1,
    inner: `<g transform="${t}"><path d="M72 150 l6 -3 l3 5 l-5 3 Z M186 172 l7 -2 l1 6 l-6 1 Z" fill="${T.shade}"/></g>`,
  });
  const flukeF = celForm(`${fluke(L, -1)} ${fluke(Rt, 1)}`, { ...T, t, cut: [-7, -9], hatch: T.hatch, seed: 2 });
  const shankF = celForm(shank, { ...T, t, cut: [-9, -6], hatch: T.hatch, seed: 4, inner: `<path d="M136 120 l5 -2 l2 6 l-5 1 Z" transform="${t}" fill="${T.shade}"/>` });
  const crownF = celForm(crown, { ...GOLD, t, cut: [-7, -7], hatch: GOLD.hatch, seed: 5 });
  const stockF = celForm(stock, { ...T, t, cut: [-6, -8], hatch: T.hatch, seed: 6 });
  const ballsF = celForm(`${ball(62)} ${ball(194)}`, { ...GOLD, t, cut: [-6, -7], seed: 7 });
  // barnacles: little off-white cones crusted on the arm
  const barnacle = (x: number, y: number, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.paperWarm}" stroke="${C.ink}" stroke-width="2.4"/><circle cx="${x + r * 0.15}" cy="${y + r * 0.2}" r="${r * 0.42}" fill="${C.inkSoft}"/><path d="M${x - r * 0.7} ${y - r * 0.3} Q${x - r * 0.3} ${y - r * 0.8} ${x + r * 0.2} ${y - r * 0.75}" stroke="${C.white}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  const arcs = p.arcs
    ? (p.arcs < 0 ? [[[58, 214], [72, 234], [96, 244]], [[74, 206], [86, 222], [104, 230]]] : [[[198, 214], [184, 234], [160, 244]], [[182, 206], [170, 222], [152, 230]]])
        .map((pts) => `<path d="${lens(pts as V[], 2.6)}" fill="${C.moonGlow}" opacity=".75"/>`)
        .join('')
    : '';
  return composeSymbol({
    autoCel: false,
    texture: { seed: 11 },
    contour: 0.8,
    inkShift: [1, 1.2],
    transform: 'translate(128 128) scale(.94) translate(-128 -128)',
    layers: [
      { fills: ringF.fills, lines: ringF.line('stroke-width="6.5"') },
      { fills: armF.fills, lines: armF.line() },
      { fills: flukeF.fills, lines: flukeF.line() },
      { fills: '', lines: `<g transform="${t}">${rope(ropePts, 5.8)}${ropeEnd}</g>` },
      { fills: shankF.fills, lines: shankF.line() },
      { fills: crownF.fills, lines: crownF.line() },
      { fills: stockF.fills + ballsF.fills, lines: stockF.line() + ballsF.line() },
      { fills: '', lines: `<g transform="${t}">${rope(ropePts, 5.8, 0, 0.47)}</g>` },
    ],
    top: `<g transform="${t}">
      ${barnacle(90, 176, 5)}${barnacle(99, 184, 3.4)}${barnacle(168, 186, 4)}
      ${shine([[121, 66], [121, 120], [122, 186]], 2.6, 0.55)}
      ${shine([[82, 84], [100, 80], [116, 79]], 2.4, 0.6)}
      ${shine([[56, 150], [66, 170], [84, 188]], 2.4, 0.45)}
      ${shine([[114, 201], [117, 212], [124, 220]], 2, 0.6)}
      <circle cx="57" cy="83" r="3.6" fill="${C.white}" opacity=".85"/><circle cx="189" cy="83" r="3.6" fill="${C.white}" opacity=".85"/>
      ${shine([[110, 24], [116, 15], [126, 12]], 2.4, 0.85)}
      <circle cx="128" cy="88" r="4" fill="${C.goldDeep}" stroke="${C.ink}" stroke-width="2"/><circle cx="127" cy="87" r="1.5" fill="${C.goldLight}"/>
    </g>${arcs}${sparkle(214, 44 + (p.swing > 0 ? 6 : 0), 12, C.white, 0.9)}`,
  });
}

export function anchor(): string {
  return anchorArt({ swing: 0 });
}

/** Anchor win loop: a pendulum swing on its ring, the rope end trailing a beat behind. */
export const anchorWinFrames: (() => string)[] = [
  () => anchorArt({ swing: -9, lag: 5, arcs: 1 }),
  () => anchorArt({ swing: 0, lag: 3 }),
  () => anchorArt({ swing: 9, lag: -5, arcs: -1 }),
  () => anchorArt({ swing: 0, lag: -3 }),
];

/* ------------------------------------------------------------------ */
/* Open scallop shell with a pearl (pink)                              */
/* ------------------------------------------------------------------ */
interface ShellPose {
  /** Upper valve: 1 = open upright, lower values fold it forward; 0 = snapped shut over the pearl. */
  open: number;
  /** Pearl glint size (0 = none). */
  glint?: number;
}

function shellArt(p: ShellPose): string {
  const T = tones(C.pink, C.pinkDeep, C.pinkLight);
  const O: V = [128, 166];
  const R = 104;
  const n = 9;
  const a0 = 194;
  const a1 = 346;
  const edge: V[] = [];
  for (let i = 0; i <= n; i++) edge.push(add(O, dir(a0 + ((a1 - a0) * i) / n), R));
  const fan = `M${P(O)} L${P(edge[0])}${scallops(edge, 0.3, 1)} Z`;
  const bands = edge
    .slice(0, -1)
    .map((e, i) => (i % 2 ? `<path d="M${P(O)} L${P(e)}${scallops([e, edge[i + 1]], 0.3, 1)} Z" fill="${T.light}" opacity=".7"/>` : ''))
    .join('');
  const ribs = edge
    .slice(1, -1)
    .map((e) => `M${P(add(O, [e[0] - O[0], e[1] - O[1]], 0.34))} L${P(add(O, [e[0] - O[0], e[1] - O[1]], 0.97))}`)
    .join(' ');
  // lower valve: the bowl, seen from the front and a little above
  const cx = 128;
  const cy = 160;
  const rx = 94;
  const ry = 26;
  const bot: V[] = [];
  const m = 8;
  for (let i = 0; i <= m; i++) {
    const a = (i / m) * 180;
    bot.push([cx + rx * Math.cos(rad(a)), cy + 64 * Math.sin(rad(a))]);
  }
  const front = `M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}${scallops(bot, 0.22, 1)} Z`;
  const fribs = bot
    .slice(1, -1)
    .map((q) => `M${P(q)} L${P([cx + (q[0] - cx) * 0.45, cy + 30])}`)
    .join(' ');
  const inner = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
  const pearl = 'M95 140 A33 33 0 1 0 161 140 A33 33 0 1 0 95 140 Z';

  const shut = p.open <= 0.05;
  // the upright valve folds toward the viewer: its height shrinks about the hinge line
  const sy = Math.max(0.3, p.open);
  const fanT = `translate(0 ${O[1]}) scale(1 ${sy.toFixed(3)}) translate(0 ${-O[1]})`;
  const fanF = celForm(fan, { ...T, t: fanT, cut: [-10, -12], hatch: T.hatch, seed: 21, inner: `<g transform="${fanT}">${bands}</g>` });
  // snapped shut: the valve's convex back comes down over the bowl, lip meeting lip
  const lid = `M${cx - rx - 2} ${cy + 2} C${cx - rx} ${cy - 60} ${cx + rx} ${cy - 60} ${cx + rx + 2} ${cy + 2}${scallops(
    Array.from({ length: 9 }, (_, i) => [cx + rx + 2 - ((2 * rx + 4) * i) / 8, cy + 2 + Math.sin((i / 8) * Math.PI) * 10] as V),
    0.28,
    -1,
  )} Z`;
  const lidRibs = Array.from({ length: 7 }, (_, i) => {
    const x = cx - rx + ((2 * rx) * (i + 1)) / 8;
    return `M${(128 + (x - 128) * 0.25).toFixed(1)} ${cy - 40} Q${((128 + x) / 2).toFixed(1)} ${cy - 30} ${x.toFixed(1)} ${cy + 4}`;
  }).join(' ');
  const lidF = celForm(lid, { ...T, cut: [-9, -11], hatch: T.hatch, seed: 22 });
  const bowlF = celForm(front, { base: mix(C.pink, C.pinkDeep, 0.18), shade: T.shade, light: T.light, cut: [-8, -10], band: [3, 4], hatch: T.hatch, seed: 23 });
  const nacreF = celForm(inner, { base: C.white, shade: mix(C.pinkLight, C.pink, 0.25), cut: [-10, -8], seed: 24 });
  const pearlF = celForm(pearl, { base: C.white, shade: mix(C.white, C.octoLight, 0.5), light: '#ffffff', cut: [-10, -12], band: [5, 6], seed: 25 });
  const g = p.glint ?? 0;
  const glint = g
    ? `<g transform="translate(112 122) scale(${g})"><path d="M0 -22 Q2.4 -2.4 22 0 Q2.4 2.4 0 22 Q-2.4 2.4 -22 0 Q-2.4 -2.4 0 -22 Z" fill="${C.white}" stroke="${C.ink}" stroke-width="${(2.2 / g).toFixed(2)}" stroke-linejoin="round"/></g>
       ${sparkle(158, 112, 6 * g, C.white, 0.9)}`
    : '';
  const pearlTop = `${shine([[104, 128], [110, 118], [120, 112]], 3.4, 0.95)}<circle cx="138" cy="120" r="3.2" fill="#fff" opacity=".9"/>
      <path d="${lens([[146, 160], [155, 150], [158, 136]], 2.4)}" fill="${C.moonGlow}" opacity=".8"/>
      <path d="${lens([[104, 152], [116, 164], [134, 168]], 1.8)}" fill="${C.pinkLight}" opacity=".9"/>`;
  return composeSymbol({
    autoCel: false,
    texture: { seed: 12 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: shut
      ? [
          { fills: nacreF.fills, lines: nacreF.line() },
          { fills: bowlF.fills, lines: `${bowlF.line()}<path d="${fribs}" stroke-width="3"/>` },
          { fills: lidF.fills, lines: `${lidF.line()}<path d="${lidRibs}" stroke-width="3"/>` },
        ]
      : [
          { fills: fanF.fills, lines: `${fanF.line()}<path d="${ribs}" transform="${fanT}" stroke-width="3.2"/>` },
          { fills: nacreF.fills, lines: nacreF.line() },
          { fills: `<ellipse cx="128" cy="172" rx="34" ry="8" fill="${C.pinkDeep}" opacity=".4"/>${pearlF.fills}`, lines: pearlF.line('stroke-width="6.5"') },
          { fills: bowlF.fills, lines: `${bowlF.line()}<path d="${fribs}" stroke-width="3"/>` },
        ],
    top: shut
      ? `${shine([[62, 150], [80, 128], [106, 118]], 3, 0.6)}<path d="${lens([[100, 164], [128, 168], [156, 164]], 2)}" fill="${C.white}" opacity=".9"/>`
      : `${pearlTop}${glint}
      ${shine([[56, 150], [70, 118], [96, 94], [120, 86]].map(([x, y]): V => [x, O[1] + (y - O[1]) * sy]), 3, 0.5)}
      ${sparkle(76, 132, 7, C.white, 0.8)}`,
  });
}

export function shell(): string {
  return shellArt({ open: 1, glint: 0.55 });
}

/** Shell win loop: open with a glint, the pearl flares, the valve dips, SNAP shut, and open again. */
export const shellWinFrames: (() => string)[] = [
  () => shellArt({ open: 1, glint: 0.8 }),
  () => shellArt({ open: 1.06, glint: 1.25 }),
  () => shellArt({ open: 0.55, glint: 0.45 }),
  () => shellArt({ open: 0 }),
];

/* ------------------------------------------------------------------ */
/* Treasure map scroll with a red X (parchment + red)                  */
/* ------------------------------------------------------------------ */
interface MapPose {
  /** Half the distance between the two rolls (76 = fully open). */
  w: number;
  /** Size of the X (1 = rest) and its glow (0..1). */
  x?: number;
  glow?: number;
}

function mapArt(p: MapPose): string {
  const PAPER = { base: C.paper, shade: mix(C.paperWarm, C.woodLight, 0.35), light: C.white, hatch: mix(C.woodLight, C.woodMid, 0.5) };
  const t = 'rotate(-8 128 128)';
  const w = p.w;
  const l = 128 - w + 6;
  const r = 128 + w - 6;
  const sheet = `M${l} 58 Q${(l + 128) / 2} 50 128 58 Q${(r + 128) / 2} 66 ${r} 56 L${r} 198 Q${(r + 128) / 2} 208 128 200 Q${(l + 128) / 2} 192 ${l} 202 Z`;
  const roll = (x: number) =>
    `M${x - 13} 50 Q${x - 13} 40 ${x} 40 Q${x + 13} 40 ${x + 13} 50 L${x + 13} 206 Q${x + 13} 216 ${x} 216 Q${x - 13} 216 ${x - 13} 206 Z`;
  const island = 'M100 122 C94 98 118 84 140 90 C160 82 184 96 180 118 C188 140 166 158 144 152 C122 162 98 148 100 122 Z';
  const palm = `<path d="M120 126 Q112 106 122 86" stroke="${C.ink}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M120 126 Q112 106 122 86" stroke="${C.woodMid}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <g fill="${C.parrot}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round">
      <path d="M122 86 Q106 70 88 80 Q100 78 110 86 Q116 84 122 90 Z"/><path d="M122 86 Q138 68 156 78 Q144 78 134 86 Q128 84 122 90 Z"/>
      <path d="M122 86 Q104 90 98 106 Q108 96 122 92 Z"/><path d="M122 86 Q140 90 146 106 Q136 96 122 92 Z"/>
    </g>
    <path d="M110 80 Q116 78 120 82 M132 80 Q140 76 146 79" stroke="${C.parrotLight}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="118" cy="90" r="3.5" fill="${C.woodDark}"/><circle cx="126" cy="91" r="3.5" fill="${C.woodDark}"/>`;
  const trail = 'M74 184 C92 180 90 158 106 150 C122 142 136 152 150 130';
  const xs = p.x ?? 1;
  const X = (cx: number, cy: number, rr: number) => `M${cx - rr} ${cy - rr} L${cx + rr} ${cy + rr} M${cx + rr} ${cy - rr} L${cx - rr} ${cy + rr}`;
  const xd = X(158, 120, 14 * xs);
  const glow = p.glow ?? 0;
  const waves = `<g stroke="${C.seaDeep}" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".8">
      <path d="M72 80 q6 -6 12 0 t12 0"/><path d="M80 94 q6 -6 12 0 t12 0"/><path d="M160 174 q6 -6 12 0 t12 0"/><path d="M168 76 q5 -5 10 0 t10 0"/></g>`;
  const rose = `<g transform="translate(88 150)"><path d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z" fill="${C.woodMid}" opacity=".85"/><path d="M0 -16 L4 -4 L0 0 Z M16 0 L4 4 L0 0 Z M0 16 L-4 4 L0 0 Z M-16 0 L-4 -4 L0 0 Z" fill="${C.woodDark}" opacity=".7"/><circle r="3" fill="${C.crimson}"/></g>`;
  const clip = nextId('mc');
  const content = `<clipPath id="${clip}"><path d="${sheet}"/></clipPath><g clip-path="url(#${clip})">
      <ellipse cx="170" cy="80" rx="18" ry="10" fill="${C.woodLight}" opacity=".22"/><ellipse cx="86" cy="186" rx="14" ry="7" fill="${C.woodLight}" opacity=".22"/>
      <path d="${island}" fill="${mix(C.paperWarm, C.woodLight, 0.55)}"/>
      <path d="${island}" fill="none" stroke="${C.woodMid}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M104 138 Q98 150 108 156 M168 104 Q176 116 172 128" stroke="${C.woodMid}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".6"/>
      ${waves}${rose}${palm}
      <path d="${trail}" fill="none" stroke="${C.ink}" stroke-width="4.5" stroke-dasharray="8 8" stroke-linecap="round"/>
      ${glow ? `<circle cx="158" cy="120" r="${20 + glow * 10}" fill="${C.fireHot}" opacity="${0.28 * glow}"/><circle cx="158" cy="120" r="${14 + glow * 6}" fill="${C.fireCore}" opacity="${0.35 * glow}"/>` : ''}
      <path d="${xd}" stroke="${C.ink}" stroke-width="${17 * Math.sqrt(xs)}" stroke-linecap="round"/>
      <path d="${xd}" stroke="${C.crimson}" stroke-width="${9 * Math.sqrt(xs)}" stroke-linecap="round"/>
      <path d="M${158 - 9 * xs} ${120 - 10 * xs} L${158 - 4 * xs} ${120 - 5 * xs}" stroke="${C.crimsonLight}" stroke-width="3" stroke-linecap="round"/>
    </g>`;
  const sheetF = celForm(sheet, {
    ...PAPER,
    t,
    cut: [-10, -12],
    band: [4, 5],
    hatch: PAPER.hatch,
    seed: 31,
    // aged, slightly scorched rim
    inner: `<path d="${sheet}" transform="${t}" fill="none" stroke="${C.woodLight}" stroke-width="16" opacity=".45"/><path d="${sheet}" transform="${t}" fill="none" stroke="${C.woodMid}" stroke-width="5" opacity=".35"/>`,
  });
  const rolls = [roll(128 - w), roll(128 + w)].map((d, i) => celForm(d, { ...PAPER, t, cut: [-6, -4], band: [3, 2], hatch: PAPER.hatch, seed: 32 + i }));
  const cap = (x: number, y: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="11" ry="6" fill="${C.woodLight}" stroke="${C.ink}" stroke-width="4"/><ellipse cx="${x + 1.5}" cy="${y + 1.5}" rx="6" ry="2.6" fill="${C.woodMid}"/><path d="M${x - 5} ${y - 1} Q${x} ${y - 4} ${x + 4} ${y - 1}" stroke="${C.goldLight}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity=".7"/>`;
  return composeSymbol({
    autoCel: false,
    texture: { seed: 13, mottle: 0.7 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [
      { fills: sheetF.fills, lines: sheetF.line() },
      { fills: `<g transform="${t}">${content}</g>`, lines: '' },
      { fills: rolls.map((f) => f.fills).join(''), lines: rolls.map((f) => f.line()).join('') },
    ],
    top: `<g transform="${t}">${cap(128 - w, 46)}${cap(128 + w, 46)}
      ${shine([[128 - w - 7, 62], [128 - w - 8, 130], [128 - w - 7, 196]], 2.2, 0.7)}
      ${shine([[128 + w - 7, 62], [128 + w - 8, 130], [128 + w - 7, 196]], 2, 0.5)}</g>
      ${glow ? sparkle(196, 88, 8 + glow * 6, C.fireCore, 0.95) : ''}`,
  });
}

export function treasureMap(): string {
  return mapArt({ w: 76 });
}

/** Map win loop: the scroll snaps open (rolls overshoot and settle) while the X pulses and glows. */
export const mapWinFrames: (() => string)[] = [
  () => mapArt({ w: 64, x: 0.9 }),
  () => mapArt({ w: 76, x: 1.2, glow: 0.7 }),
  () => mapArt({ w: 81, x: 1.35, glow: 1 }),
  () => mapArt({ w: 76, x: 1.1, glow: 0.4 }),
];

/* ------------------------------------------------------------------ */
/* Brass pocket compass (gold case, deep blue face)                    */
/* ------------------------------------------------------------------ */
interface CompassPose {
  /** Needle heading in degrees (-90 = north up). */
  needle: number;
  /** Degrees of blur sweep trailing the red tip (0 = still). */
  sweep?: number;
  /** Sparkle position round the rim (degrees). */
  twinkle?: number;
}

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

function compassArt(p: CompassPose): string {
  const cx = 128;
  const cy = 142;
  const c: V = [cx, cy];
  const ticks = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * 360;
    const r0 = i % 8 === 0 ? 60 : i % 4 === 0 ? 63 : 66;
    return `M${P(add(c, dir(a), r0))} L${P(add(c, dir(a), 70))}`;
  }).join(' ');
  // knurled rim: short notches round the outer case
  const knurl = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * 360;
    return `M${P(add(c, dir(a), 84))} L${P(add(c, dir(a), 88.5))}`;
  }).join(' ');
  const pt = (a: number, r: number, rb: number, c1: string, c2: string) => {
    const tip = add(c, dir(a), r);
    const bl = add(c, dir(a - 45), rb);
    const br = add(c, dir(a + 45), rb);
    return `<path d="M${P(c)} L${P(bl)} L${P(tip)} Z" fill="${c1}"/><path d="M${P(c)} L${P(tip)} L${P(br)} Z" fill="${c2}"/>
      <path d="M${P(bl)} L${P(tip)} L${P(br)}" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>`;
  };
  const rose = [45, 135, 225, 315].map((a) => pt(a, 34, 9, C.steelLight, C.steel)).join('') + [-90, 0, 90, 180].map((a) => pt(a, 54, 12, C.goldLight, GOLD.shade)).join('');
  const na = p.needle;
  const n0 = add(c, dir(na), 50);
  const s0 = add(c, dir(na + 180), 42);
  const w0 = add(c, dir(na + 90), 9);
  const w1 = add(c, dir(na - 90), 9);
  const needle = `<path d="M${P(n0)} L${P(w0)} L${P(c)} Z" fill="${C.crimsonLight}"/><path d="M${P(n0)} L${P(c)} L${P(w1)} Z" fill="${C.crimson}"/>
    <path d="M${P(s0)} L${P(w0)} L${P(c)} Z" fill="${C.white}"/><path d="M${P(s0)} L${P(c)} L${P(w1)} Z" fill="${C.steelLight}"/>
    <path d="M${P(n0)} L${P(w0)} L${P(s0)} L${P(w1)} Z" fill="none" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`;
  const sweep = p.sweep ?? 0;
  const blur = sweep
    ? [0.5, 1]
        .map((k) => {
          const a0 = na - sweep * k;
          const pts = Array.from({ length: 9 }, (_, i) => add(c, dir(a0 + ((na - a0) * i) / 8), 50));
          return `<path d="M${P(c)} L${pts.map(P).join(' L')} Z" fill="${C.crimsonLight}" opacity="${0.22 / k}"/>`;
        })
        .join('') +
      `<path d="M${P(c)} L${Array.from({ length: 9 }, (_, i) => P(add(c, dir(na + 180 - sweep + (sweep * i) / 8), 42))).join(' L')} Z" fill="${C.white}" opacity=".16"/>`
    : '';
  const north = add(c, dir(-90), 76);
  const caseF = celForm(circle(cx, cy, 88), { ...GOLD, cut: [-10, -12], band: [4, 5], hatch: GOLD.hatch, seed: 41 });
  const bezelF = celForm(circle(cx, cy, 74), { base: GOLD.shade, shade: mix(C.goldDeep, C.ink, 0.25), light: C.gold, cut: [9, 11], band: [-3.5, -4], seed: 42 });
  const ringF = celForm(annulus(128, 34, 20.5, 9.5), { ...GOLD, rule: 'evenodd', cut: [-4, -5], seed: 43 });
  const stem = 'M114 52 L142 52 L140 66 L116 66 Z';
  const stemF = celForm(stem, { ...GOLD, cut: [-5, -5], seed: 44 });
  const crownD = 'M114 58 L142 58 Q148 58 148 64 Q148 70 142 70 L114 70 Q108 70 108 64 Q108 58 114 58 Z';
  const crownF = celForm(crownD, { ...GOLD, cut: [-5, -4], seed: 45, inner: `<path d="M116 60 L116 69 M122 60 L122 69 M128 60 L128 69 M134 60 L134 69 M140 60 L140 69" stroke="${C.goldDeep}" stroke-width="2"/>` });
  const faceClip = nextId('cf');
  const tw = p.twinkle ?? -30;
  const twP = add(c, dir(tw), 92);
  return composeSymbol({
    autoCel: false,
    texture: { seed: 14, mottle: 0.4 },
    contour: 0.8,
    inkShift: [1, 1.2],
    layers: [
      { fills: ringF.fills, lines: ringF.line('stroke-width="6"') },
      { fills: stemF.fills + crownF.fills, lines: stemF.line() + crownF.line() },
      { fills: caseF.fills + bezelF.fills, lines: `${caseF.line()}${bezelF.line('stroke-width="5"')}<path d="${knurl}" stroke-width="2.4" opacity=".7"/>` },
    ],
    top: `
      <clipPath id="${faceClip}"><circle cx="${cx}" cy="${cy}" r="70"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="70" fill="${C.navy}"/>
      <g clip-path="url(#${faceClip})">
        <circle cx="${cx + 8}" cy="${cy + 9}" r="70" fill="${mix(C.navy, C.navyLight, 0.35)}"/>
        <circle cx="${cx + 13}" cy="${cy + 15}" r="70" fill="${C.navy}"/>
        <path d="${circle(cx, cy, 70)} ${circle(cx + 6, cy + 7, 70)}" fill="${C.nightDeep}" fill-rule="evenodd" opacity=".75"/>
      </g>
      <circle cx="${cx}" cy="${cy}" r="70" fill="none" stroke="${C.ink}" stroke-width="5"/>
      <path d="${ticks}" stroke="${C.goldLight}" stroke-width="3" stroke-linecap="round" opacity=".85"/>
      <circle cx="${cx}" cy="${cy}" r="56" fill="none" stroke="${C.navyLight}" stroke-width="2.5" opacity=".7"/>
      ${rose}
      <path d="M${P(add(north, [0, 4]))} l-7 -10 l14 0 Z" fill="${C.crimson}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
      ${blur}${needle}
      <circle cx="${cx}" cy="${cy}" r="9" fill="${C.gold}" stroke="${C.ink}" stroke-width="4"/>
      <circle cx="${cx - 2.5}" cy="${cy - 2.5}" r="2.6" fill="#fff"/>
      <g clip-path="url(#${faceClip})">
        <path d="${lens([[74, 128], [86, 96], [116, 78]], 5)}" fill="#fff" opacity=".28"/>
        <path d="${lens([[90, 130], [98, 112], [110, 102]], 2.6)}" fill="#fff" opacity=".24"/>
      </g>
      ${shine([[56, 124], [64, 92], [86, 68], [110, 58]], 3.2, 0.7)}
      ${shine([[112, 24], [118, 17], [127, 16]], 2.2, 0.8)}
      ${sparkle(twP[0], twP[1], 12, C.white, 0.9)}`,
  });
}

export function compass(): string {
  return compassArt({ needle: -62, twinkle: -34 });
}

/** Compass win loop: the needle whirls round (blur sweeps trail its tip) as a glint runs round the rim. */
export const compassWinFrames: (() => string)[] = [
  () => compassArt({ needle: 28, sweep: 80, twinkle: -34 }),
  () => compassArt({ needle: 118, sweep: 80, twinkle: 10 }),
  () => compassArt({ needle: 208, sweep: 80, twinkle: -80 }),
  () => compassArt({ needle: 298, sweep: 80, twinkle: -34 }),
];
