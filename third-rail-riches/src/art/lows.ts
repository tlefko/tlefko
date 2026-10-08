/**
 * Low-pay symbols for Third Rail Riches (docs/ART.md): the salted pretzel, the diner coffee mug,
 * the folded newspaper and the hook-handle umbrella. Each owns one hue, reads as a silhouette at
 * 90 px and has a 4-frame win loop; every frame shares the 256 viewBox and anchor.
 */
import { C, composeSymbol, nextId, celForm, celTones, GOLD_TONES, shine, mix, scallops } from './kit';
import { type V, P, add, dir, sample, smooth, lens, sparkle, taper } from './geo';

/* ------------------------------------------------------------------ */
/* Shared paint                                                        */
/* ------------------------------------------------------------------ */
const tones = celTones;
/** The key light comes from the upper left. */
const LIGHT: V = [-0.6, -0.8];

/** Common paint settings for the lows (same hand as the reference symbols). */
const PAINT = { autoCel: false, contour: 0.8, inkShift: [1, 1.2] as [number, number] };

/** Normals along a sampled spine. */
function normals(s: V[]): V[] {
  return s.map((_, i) => {
    const a = s[Math.max(0, i - 1)];
    const b = s[Math.min(s.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l] as V;
  });
}

/** A round-capped tube of half-width `w` along a sampled spine (dough rope, umbrella crook). */
function tubeD(s: V[], w: number): string {
  const n = normals(s);
  const left = s.map((p, i) => add(p, n[i], w));
  const right = s.map((p, i) => add(p, n[i], -w));
  return `${smooth(left)} A${w} ${w} 0 0 0 ${P(right[right.length - 1])} ${smooth([...right].reverse()).replace(/^M[^C]*/, '')} A${w} ${w} 0 0 0 ${P(left[0])} Z`;
}

/** Point offset from the spine toward the light by `k` (in units of the normal). */
function lit(s: V[], i: number, k: number): V {
  const n = normals(s)[i];
  const sgn = n[0] * LIGHT[0] + n[1] * LIGHT[1] >= 0 ? 1 : -1;
  return add(s[i], n, k * sgn);
}

/**
 * Paint `d` (a band, a panel) inside a cel form so it takes the form's cut shadow: the part of
 * `d` inside the form's shadow crescent is painted `shade`. Use in a celForm's `inner`.
 */
function painted(formD: string, cut: V, d: string, base: string, shade: string, t = ''): string {
  const id = nextId('pm');
  const tt = t ? ` transform="${t}"` : '';
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="656" height="656"><path d="${formD}"${tt} fill="#fff"/><path d="${formD}" transform="translate(${cut[0]} ${cut[1]}) ${t}" fill="#000"/></mask>
    <path d="${d}"${tt} fill="${base}"/><path d="${d}"${tt} fill="${shade}" mask="url(#${id})"/>`;
}

/** Little motion / impact dashes (white with ink), as in the reference win frames. */
const dash = (a: V, b: V, w = 3.4) => `<path d="${lens([a, b], w)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>`;

/** Radial burst of dashes round `c` at angles `angs` (degrees), from r0 to r1. */
const burst = (c: V, angs: number[], r0: number, r1: number, w = 3.4) => angs.map((a) => dash(add(c, dir(a), r0), add(c, dir(a), r1), w)).join('');

/* ------------------------------------------------------------------ */
/* L1: salted pretzel (warm brown, white salt)                         */
/* ------------------------------------------------------------------ */
interface PretzelPose {
  /** Whole-body transform (tilt / hop / squash), about the base. */
  t?: string;
  /** Salt grains flying off (-1 to the left, 1 to the right, 0 none). */
  fling?: -1 | 0 | 1;
  /** Sparkle positions. */
  twinkle?: V[];
}

/** The rope runs from the left end (resting on the belly) up through the twist, round both lobes and the belly, back through the twist to the right end. */
const PRETZEL_ROPE: V[] = [
  [78, 216], [98, 176], [128, 134], [150, 104], [158, 80], [178, 58], [206, 64], [220, 96], [216, 138], [196, 180], [162, 206],
  [128, 214], [94, 206], [60, 180], [40, 138], [36, 96], [50, 64], [78, 58], [98, 80], [106, 104], [128, 134], [158, 176], [178, 216],
];
const PRETZEL_W = 15.5;

function pretzelArt(p: PretzelPose): string {
  const T = tones(C.pretzel, C.pretzelDeep, C.pretzelLight);
  const s = sample(PRETZEL_ROPE, 220);
  const W = PRETZEL_W;
  const rope = tubeD(s, W);
  const cut: V = [-6, -7.5];
  // the full rope: its own crossings are repainted on top below
  const ropeF = celForm(rope, { ...T, cut, band: [3.5, 4], hatch: T.hatch, hatchGap: 5.5, seed: 51 });

  /** A stretch of rope repainted over what it crosses, clipped to the half-plane past spine point `k` (toward `forward`). */
  const over = (from: number, to: number, k: number, forward: 1 | -1, seed: number) => {
    const piece = tubeD(s.slice(from, to + 1), W);
    const a = s[k - 1];
    const b = s[k + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V = [((b[0] - a[0]) / l) * forward, ((b[1] - a[1]) / l) * forward];
    const nn: V = [-u[1], u[0]];
    const o = s[k];
    const R = 400;
    const q = [add(add(o, nn, R), u, 0), add(add(o, nn, R), u, R), add(add(o, nn, -R), u, R), add(add(o, nn, -R), u, 0)];
    const clip = nextId('pc');
    const f = celForm(piece, { ...T, cut, band: [3.5, 4], hatch: T.hatch, hatchGap: 5.5, seed });
    const g = (x: string) => `<g clip-path="url(#${clip})">${x}</g>`;
    return {
      fills: `<clipPath id="${clip}"><path d="M${q.map(P).join(' L')} Z"/></clipPath>
        ${g(`<clipPath id="${clip}r"><path d="${rope}"/></clipPath><g clip-path="url(#${clip}r)"><path d="${piece}" transform="translate(2.5 4)" fill="${C.ink}" opacity=".2"/></g>${f.fills}`)}`,
      lines: g(f.line()),
    };
  };
  // the left end lies over the belly; the right arm crosses over the left one and its end lies on the belly
  const endL = over(0, 19, 11, -1, 52);
  const twist = over(178, 220, 189, 1, 53);

  // the split along the belly where the crust opened in the oven
  const crack = (() => {
    const pts = [103, 108, 113, 118].map((i) => lit(s, i, W * 0.36));
    return `<path d="${lens(pts, 4.2)}" fill="${mix(C.pretzelLight, C.paper, 0.45)}"/>
      <path d="${lens(pts.map(([x, y]) => [x + 0.8, y + 2.6] as V), 1.4)}" fill="${C.pretzelDeep}" opacity=".7"/>`;
  })();
  // glossy cut highlights on the upper-left of each strand
  const gloss = (i0: number, i1: number, w: number, o: number) => shine([i0, (i0 + i1) / 2, i1].map((i) => lit(s, Math.round(i), W * 0.5)), w, o);
  const shines = [gloss(150, 172, 3, 0.75), gloss(56, 66, 2.4, 0.6), gloss(132, 146, 2.6, 0.55), gloss(3, 12, 2.4, 0.65), gloss(194, 210, 2.6, 0.65), gloss(66, 78, 2.2, 0.5)].join('');

  // coarse salt: chunky white crystals, each with a little cast shadow
  const grain = (c: V, r: number, rot: number) => {
    const pts = [0, 1, 2, 3].map((k) => add(c, dir(rot + k * 90 + (k % 2 ? 12 : -6)), r * (k % 2 ? 0.8 : 1.05)));
    const d = `M${pts.map(P).join(' L')} Z`;
    return `<path d="${d}" transform="translate(1.6 2)" fill="${T.hatch}" opacity=".55"/><path d="${d}" fill="${C.white}" stroke="${C.ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M${P(add(pts[0], pts[1], 0))}" fill="none"/>`;
  };
  const SALT: [number, number, number, number][] = [
    [6, 0.2, 4.6, 10], [30, 0.5, 4, 40], [48, 0.1, 5, 20], [62, 0.55, 4.2, 70], [80, 0.2, 4.8, 5], [96, 0.4, 4, 33], [116, -0.35, 4.6, 60],
    [140, 0.3, 4.4, 15], [158, 0.1, 5, 50], [168, 0.6, 4, 25], [186, 0.3, 4.4, 75], [204, 0.15, 4.8, 30], [214, 0.5, 3.8, 8], [72, -0.45, 3.6, 44],
    [176, -0.4, 3.8, 66], [124, 0.55, 3.6, 12],
  ];
  const salt = SALT.map(([i, k, r, rot]) => grain(lit(s, i, W * k), r, rot)).join('');

  const fl = p.fling ?? 0;
  const flying = fl
    ? [
        [[128 + fl * 66, 40], 5, 20],
        [[128 + fl * 94, 30], 4, 50],
        [[128 + fl * 106, 58], 4.4, 5],
        [[128 + fl * 48, 22], 3.6, 35],
      ]
        .map(([c, r, rot]) => grain(c as V, r as number, rot as number))
        .join('') + dash([128 + fl * 78, 52], [128 + fl * 92, 38], 2.6) + dash([128 + fl * 58, 40], [128 + fl * 66, 24], 2.6)
    : '';
  const tw = (p.twinkle ?? [[212, 40]]).map(([x, y], i) => sparkle(x, y, i ? 8 : 12, C.white, 0.9)).join('');
  const t = p.t ?? '';
  return composeSymbol({
    ...PAINT,
    texture: { seed: 21, mottle: 0.6 },
    transform: `translate(128 128) scale(.9) translate(-128 -128) ${t}`,
    layers: [
      { fills: ropeF.fills, lines: ropeF.line() },
      endL,
      twist,
    ],
    top: `${crack}${shines}${salt}${flying}${tw}`,
  });
}

export function pretzel(): string {
  return pretzelArt({});
}

/** Pretzel win loop: it hops and rocks, flinging salt off one side then the other, and lands with a squash. */
export const pretzelWinFrames: (() => string)[] = [
  () => pretzelArt({ t: 'translate(0 -8) rotate(-8 128 214)', fling: 1, twinkle: [[40, 46]] }),
  () => pretzelArt({ t: 'translate(128 222) scale(1.06 .93) translate(-128 -222)', twinkle: [[214, 52], [36, 70]] }),
  () => pretzelArt({ t: 'translate(0 -8) rotate(8 128 214)', fling: -1, twinkle: [[216, 46]] }),
  () => pretzelArt({ t: 'translate(0 -3)', twinkle: [[212, 40], [44, 196]] }),
];

/* ------------------------------------------------------------------ */
/* L2: diner coffee mug on a saucer (cream with a red band)            */
/* ------------------------------------------------------------------ */
interface CoffeePose {
  /** Mug lift off the saucer (units) and tilt (degrees). */
  lift?: number;
  tilt?: number;
  /** Mug squash on landing (1 = rest). */
  squash?: number;
  /** Steam wave phase (degrees) and height (1 = rest). */
  phase?: number;
  steam?: number;
  /** A drop of coffee hopping out of the mug. */
  splash?: boolean;
  /** Clink marks where the mug lands. */
  clink?: boolean;
  twinkle?: V;
}

const MX = 122;
/** Mug body (front), its rim ellipse and the handle (a C-shape tucked behind the body). */
const MUG_BODY = `M64 92 C60 130 64 172 76 192 Q${MX} 214 168 192 C180 172 184 130 180 92 A58 15 0 0 1 64 92 Z`;
const MUG_HANDLE = 'M168 104 C214 92 232 130 220 160 C210 186 184 194 164 184 L166 164 C182 172 196 164 200 150 C206 128 192 118 168 126 Z';
const SAUCER_TOP = `M24 200 A98 24 0 1 0 220 200 A98 24 0 1 0 24 200 Z`;
const SAUCER_UNDER = `M34 204 Q36 224 ${MX} 228 Q208 224 210 204 Z`;

function coffeeArt(p: CoffeePose): string {
  const CREAM = { base: C.cream, shade: mix(C.cream, C.tileDeep, 0.62), light: C.white, hatch: mix(C.tileDeep, C.pretzelDeep, 0.3) };
  const RED = tones(C.coffeeRed, C.maroonDeep, C.crimsonLight);
  const lift = p.lift ?? 0;
  const sq = p.squash ?? 1;
  const mt = `translate(0 ${-lift}) rotate(${p.tilt ?? 0} ${MX} 200) translate(${MX} 200) scale(${(2 - sq).toFixed(3)} ${sq.toFixed(3)}) translate(${-MX} -200)`;
  const cut: V = [-10, -9];

  const band = `M40 112 Q${MX} 142 204 112 L204 132 Q${MX} 162 40 132 Z`;
  const pin = `M40 140 Q${MX} 170 204 140 L204 146 Q${MX} 176 40 146 Z`;
  const pinTop = `M40 104 Q${MX} 134 204 104 L204 108 Q${MX} 138 40 108 Z`;
  const bodyF = celForm(MUG_BODY, {
    ...CREAM,
    t: mt,
    cut,
    band: [4, 4],
    hatch: CREAM.hatch,
    hatchGap: 6,
    seed: 61,
    inner: painted(MUG_BODY, cut, band, RED.base, RED.shade, mt) + painted(MUG_BODY, cut, pin + pinTop, RED.base, RED.shade, mt),
  });
  const handleF = celForm(MUG_HANDLE, { ...CREAM, t: mt, cut: [-7, -7], hatch: CREAM.hatch, seed: 62 });
  // the mouth of the mug: a cream lip round a pool of coffee
  const lip = `<g transform="${mt}">
      <ellipse cx="${MX}" cy="92" rx="58" ry="15" fill="${C.cream}" stroke="${C.ink}" stroke-width="6.5"/>
      <ellipse cx="${MX}" cy="93.5" rx="47" ry="10.5" fill="${mix(C.woodDark, C.woodDeep, 0.4)}" stroke="${C.ink}" stroke-width="3.5"/>
      <path d="M${MX - 44} 96 Q${MX} 106 ${MX + 44} 96 L${MX + 44} 100 Q${MX} 108 ${MX - 44} 100 Z" fill="${C.woodMid}" opacity=".0"/>
      <path d="M${MX - 40} 96 Q${MX - 8} 104 ${MX + 30} 100" stroke="${C.pretzel}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>
      <path d="${lens([[MX - 28, 90], [MX - 10, 87], [MX + 8, 88]], 2.2)}" fill="${C.cream}" opacity=".8"/>
      <path d="${lens([[MX - 52, 86], [MX - 36, 80], [MX - 12, 78]], 2.4)}" fill="${C.white}"/>
    </g>`;
  const saucerUF = celForm(SAUCER_UNDER, { base: CREAM.shade, shade: mix(CREAM.shade, C.pretzelDeep, 0.35), cut: [-12, -6], seed: 63 });
  const saucerF = celForm(SAUCER_TOP, {
    ...CREAM,
    cut: [-14, -7],
    band: [4, 2.5],
    seed: 64,
    inner: `<ellipse cx="${MX}" cy="200" rx="88" ry="19" fill="none" stroke="${C.coffeeRed}" stroke-width="5"/>
      <ellipse cx="${MX}" cy="202" rx="56" ry="12" fill="${mix(C.cream, C.tileDeep, 0.35)}"/>
      <ellipse cx="${MX + 4}" cy="205" rx="${56 + lift * 0.3}" ry="${10 - lift * 0.2}" fill="${C.pretzelDeep}" opacity="${(0.42 - lift * 0.012).toFixed(2)}"/>`,
  });

  // steam: three calligraphic wisps that wave and curl
  const ph = ((p.phase ?? 0) * Math.PI) / 180;
  const h = p.steam ?? 1;
  const wisp = (x0: number, y0: number, len: number, amp: number, k: number, w: number) => {
    const pts: V[] = Array.from({ length: 7 }, (_, i) => {
      const u = i / 6;
      return [x0 + amp * Math.sin(ph + k + u * 5.2) * (0.4 + u), y0 - len * h * u] as V;
    });
    // curl the tip
    const tip = pts[6];
    const prev = pts[5];
    const side = tip[0] >= prev[0] ? 1 : -1;
    pts.push([tip[0] + side * 9, tip[1] - 6], [tip[0] + side * 14, tip[1] + 4]);
    return `<path d="${lens(pts, w, 0.42)}" fill="${C.white}" stroke="${C.ink}" stroke-width="3.6" stroke-linejoin="round"/>`;
  };
  const steam = `<g transform="translate(0 ${(-lift * 0.6).toFixed(1)})" opacity=".97">
      ${wisp(98, 74, 52, 10, 0, 5.2)}${wisp(126, 72, 64, 12, 1.9, 6.4)}${wisp(152, 76, 46, 9, 3.6, 4.6)}</g>`;
  const splash = p.splash
    ? `<g transform="translate(${MX + 30} ${44 - lift})"><path d="M0 -12 Q9 2 0 9 Q-9 2 0 -12 Z" fill="${mix(C.woodDark, C.woodMid, 0.4)}" stroke="${C.ink}" stroke-width="3"/><circle cx="-2" cy="1" r="2" fill="${C.pretzelLight}"/></g>
       <circle cx="${MX + 46}" cy="${60 - lift}" r="4" fill="${mix(C.woodDark, C.woodMid, 0.4)}" stroke="${C.ink}" stroke-width="2.4"/>`
    : '';
  const clink = p.clink ? burst([MX - 68, 196], [200, 230], 24, 40) + burst([MX + 70, 196], [-20, -50], 24, 40) : '';
  const tw = p.twinkle ?? [206, 64];
  return composeSymbol({
    ...PAINT,
    texture: { seed: 22, mottle: 0.5 },
    transform: 'translate(128 128) scale(.94) translate(-128 -128)',
    layers: [
      { fills: saucerUF.fills, lines: saucerUF.line() },
      { fills: saucerF.fills, lines: saucerF.line() },
      { fills: handleF.fills, lines: handleF.line() },
      { fills: bodyF.fills, lines: bodyF.line() },
    ],
    top: `${lip}
      <g transform="${mt}">
        ${shine([[72, 112], [70, 146], [80, 182]], 3.4, 0.75)}
        ${shine([[90, 160], [92, 176], [100, 188]], 1.8, 0.45)}
        ${shine([[206, 120], [214, 136], [212, 152]], 2.2, 0.6)}
      </g>
      ${shine([[40, 194], [64, 186], [92, 183]], 2.4, 0.8)}
      ${steam}${splash}${clink}${sparkle(tw[0], tw[1], 11, C.white, 0.9)}`,
  });
}

export function coffee(): string {
  return coffeeArt({});
}

/** Coffee win loop: the mug hops off its saucer (a drop jumps out), lands with a clink, while the steam curls. */
export const coffeeWinFrames: (() => string)[] = [
  () => coffeeArt({ lift: 12, tilt: -6, phase: 90, steam: 1.05, splash: true, twinkle: [42, 70] }),
  () => coffeeArt({ lift: 0, squash: 0.95, phase: 180, steam: 0.92, clink: true, twinkle: [210, 58] }),
  () => coffeeArt({ lift: 9, tilt: 6, phase: 270, steam: 1.08, twinkle: [44, 60] }),
  () => coffeeArt({ lift: 0, phase: 360, steam: 1, twinkle: [206, 64] }),
];

/* ------------------------------------------------------------------ */
/* L3: folded newspaper (paper + uniform-navy ink, no letters)         */
/* ------------------------------------------------------------------ */
interface PaperPose {
  /** Front page swing about the fold, in degrees (0 = shut, 90 = edge on). */
  open: number;
  /** Whoosh marks on the swinging edge. */
  whoosh?: boolean;
  twinkle?: V;
}

const PX0 = 70;
const PX1 = 196;
const PY0 = 40;
const PY1 = 214;

function paperArt(p: PaperPose): string {
  const PAPER = { base: C.paper, shade: mix(C.paper, C.tileDeep, 0.6), light: C.white, hatch: mix(C.tileDeep, C.uniform, 0.25) };
  const INK = C.uniform;
  const th = (p.open * Math.PI) / 180;
  const c = Math.cos(th);
  const sk = -0.1 * Math.sin(th);
  const W = PX1 - PX0;
  const dx = Math.max(0, -c) * W * 0.45 + Math.max(0, 1 - c) * 6;
  const tilt = `translate(${dx.toFixed(1)} 0) rotate(-7 128 128)`;
  /** Project a point of the front page as it swings about the fold (x = PX0). */
  const pr = (x: number, y: number): V => [PX0 + (x - PX0) * c, y + (x - PX0) * sk];
  const poly = (pts: V[]) => `M${pts.map(([x, y]) => P(pr(x, y))).join(' L')} Z`;
  const rect = (x: number, y: number, w: number, h: number) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const back = c < 0;

  // the stack under the front page: two back sheets and the inside page
  const sheet = (ox: number, oy: number) => `M${PX0 + ox} ${PY0 + oy} L${PX1 + ox} ${PY0 + oy} L${PX1 + ox} ${PY1 + oy} L${PX0 + ox} ${PY1 + oy} Q${PX0 + ox - 7} ${(PY0 + PY1) / 2 + oy} ${PX0 + ox} ${PY0 + oy} Z`;
  const stack = [sheet(9, 8), sheet(4.5, 4)].map((d, i) => celForm(d, { base: mix(C.paper, C.tileDeep, 0.3 - i * 0.12), shade: mix(C.paper, C.tileDeep, 0.6), t: tilt, cut: [-2, -2], seed: 71 + i }));
  // inside page: columns, a crossword grid and a boxed notice
  const col = (x: number, y0: number, y1: number, w: number, o = 0.55) => {
    let d = '';
    for (let y = y0, k = 0; y < y1; y += 8, k++) d += `M${x} ${y} h${w - ((k * 7) % 3) * 5} v3.6 h${-(w - ((k * 7) % 3) * 5)} Z `;
    return `<path d="${d}" fill="${INK}" opacity="${o}"/>`;
  };
  const grid = (x: number, y: number, n: number, s: number) => {
    let cells = '';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i * 3 + j * 5) % 7 === 2) cells += `<rect x="${x + i * s}" y="${y + j * s}" width="${s}" height="${s}" fill="${INK}"/>`;
    const lines = Array.from({ length: n + 1 }, (_, k) => `M${x + k * s} ${y} v${n * s} M${x} ${y + k * s} h${n * s}`).join(' ');
    return `${cells}<path d="${lines}" stroke="${INK}" stroke-width="1.6" fill="none"/>`;
  };
  const insideD = sheet(0, 0);
  const insideF = celForm(insideD, {
    ...PAPER,
    t: tilt,
    cut: [-8, -8],
    hatch: PAPER.hatch,
    seed: 73,
    inner: `<g transform="${tilt}">
      <rect x="${PX0 + 12}" y="${PY0 + 12}" width="${W - 24}" height="9" fill="${INK}"/>
      ${col(PX0 + 12, PY0 + 30, PY0 + 100, 48)}${col(PX0 + 66, PY0 + 30, PY0 + 60, 48)}
      ${grid(PX0 + 70, PY0 + 66, 5, 9)}
      <rect x="${PX0 + 12}" y="${PY0 + 108}" width="${W - 24}" height="46" fill="none" stroke="${INK}" stroke-width="3"/>
      <rect x="${PX0 + 20}" y="${PY0 + 116}" width="${W - 64}" height="8" fill="${C.coffeeRed}"/>
      ${col(PX0 + 20, PY0 + 130, PY0 + 152, 70, 0.45)}
      <circle cx="${PX1 - 30}" cy="${PY0 + 133}" r="11" fill="${INK}" opacity=".8"/>
    </g>`,
  });

  // the front page, with a dog-eared bottom corner, swinging about the fold
  const ear = 22;
  const coverPts: V[] = [[PX0, PY0], [PX1, PY0], [PX1, PY1 - ear], [PX1 - ear, PY1], [PX0, PY1]];
  const cover = `M${P(pr(PX0, PY0))} L${P(pr(PX1, PY0))} L${P(pr(PX1, PY1 - ear))} L${P(pr(PX1 - ear, PY1))} L${P(pr(PX0, PY1))} Q${P(pr(PX0 - 8, (PY0 + PY1) / 2))} ${P(pr(PX0, PY0))} Z`;
  void coverPts;
  const earD = poly([[PX1, PY1 - ear], [PX1 - ear, PY1], [PX1 - ear - 1, PY1 - ear - 1]]);
  // the front: masthead bar with double rules, two bold headline bars, a photo of a train, columns
  const front = () => {
    const bars = [
      rect(PX0 + 10, PY0 + 10, W - 20, 17),
      rect(PX0 + 10, PY0 + 32, W - 20, 2.6),
      rect(PX0 + 10, PY0 + 37, W - 20, 1.6),
      rect(PX0 + 10, PY0 + 45, W - 20, 13),
      rect(PX0 + 10, PY0 + 63, W - 46, 10),
    ].join(' ');
    let cols = '';
    for (let y = PY0 + 84, k = 0; y < PY0 + 132; y += 8, k++) cols += rect(PX0 + 78, y, 38 - ((k * 5) % 3) * 6, 3.6) + ' ';
    for (let y = PY0 + 138, k = 0; y < PY1 - 10; y += 8, k++) cols += rect(PX0 + 10, y, W - 20 - ((k * 5) % 3) * 9 - (y > PY1 - 30 ? 22 : 0), 3.6) + ' ';
    // photo block: a loco nose with its headlamp blazing, in the tunnel
    const ph = rect(PX0 + 10, PY0 + 82, 60, 48);
    const loco = poly([[PX0 + 22, PY0 + 130], [PX0 + 22, PY0 + 104], [PX0 + 30, PY0 + 92], [PX0 + 50, PY0 + 92], [PX0 + 58, PY0 + 104], [PX0 + 58, PY0 + 130]]);
    const lampC = pr(PX0 + 40, PY0 + 106);
    const pane = rect(PX0 + 28, PY0 + 96, 24, 6);
    return `<path d="${bars}" fill="${INK}"/>
      <path d="${ph}" fill="${C.uniformDeep}"/>
      <path d="${rect(PX0 + 10, PY0 + 116, 60, 14)}" fill="${C.uniformLight}" opacity=".5"/>
      <path d="${loco}" fill="${C.uniformLight}"/>
      <path d="${pane}" fill="${C.uniformDeep}"/>
      <ellipse cx="${lampC[0].toFixed(1)}" cy="${lampC[1].toFixed(1)}" rx="${(7 * Math.abs(c)).toFixed(1)}" ry="7" fill="${C.amberLight}"/>
      <path d="${ph}" fill="none" stroke="${C.ink}" stroke-width="2.4"/>
      <path d="${cols}" fill="${INK}" opacity=".55"/>`;
  };
  const backSide = () => {
    let cols = '';
    for (let y = PY0 + 14, k = 0; y < PY1 - 12; y += 8, k++) cols += rect(PX0 + 12, y, W - 24 - ((k * 3) % 4) * 8, 3.6) + ' ';
    return `<path d="${cols}" fill="${INK}" opacity=".4"/><path d="${rect(PX0 + 12, PY0 + 60, 50, 40)}" fill="${INK}" opacity=".55"/>`;
  };
  const coverF = celForm(cover, {
    ...PAPER,
    base: back ? mix(C.paper, C.tileDeep, 0.2) : PAPER.base,
    t: tilt,
    cut: [-9 * Math.max(0.35, Math.abs(c)), -10],
    hatch: PAPER.hatch,
    seed: 74,
    inner: `<g transform="${tilt}">${back ? backSide() : front()}<path d="${cover}" fill="none" stroke="${C.tileDeep}" stroke-width="8" opacity=".35"/></g>`,
  });
  const earF = celForm(earD, { base: C.paperWarm, shade: mix(C.paperWarm, C.tileDeep, 0.6), t: tilt, cut: [-3, -3], seed: 75 });
  // a crease across the middle of the front page
  const crease = `<path d="M${P(pr(PX0 + 4, 124))} L${P(pr(PX1 - 4, 128))}" stroke="${C.tileDeep}" stroke-width="2.4" opacity=".7"/><path d="M${P(pr(PX0 + 4, 126.5))} L${P(pr(PX1 - 4, 130.5))}" stroke="${C.white}" stroke-width="1.6" opacity=".8"/>`;
  const edge = pr(PX1, (PY0 + PY1) / 2);
  const whoosh = p.whoosh
    ? `<g transform="${tilt}">${[-46, 0, 46]
        .map((oy, i) => {
          const a = pr(PX1 + 10 * Math.sign(c || 1), (PY0 + PY1) / 2 + oy);
          const s2 = c >= 0 ? 1 : -1;
          return `<path d="${lens([[a[0] + s2 * 4, a[1]], [a[0] + s2 * 16, a[1] + 2 - i * 2], [a[0] + s2 * 28, a[1] + 8 - i * 4]], 2.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.2"/>`;
        })
        .join('')}</g>`
    : '';
  void edge;
  const tw = p.twinkle ?? [212, 38];
  return composeSymbol({
    ...PAINT,
    texture: { seed: 23, mottle: 0.55 },
    transform: 'translate(128 128) scale(.96) translate(-128 -128)',
    layers: [
      { fills: stack.map((s) => s.fills).join(''), lines: stack.map((s) => s.line('stroke-width="4.5"')).join('') },
      { fills: insideF.fills, lines: insideF.line() },
      { fills: coverF.fills + earF.fills, lines: `${coverF.line()}${earF.line('stroke-width="4.5"')}` },
    ],
    top: `<g transform="${tilt}">${back ? '' : crease}
      ${shine([pr(PX0 + 6, PY0 + 4), pr(PX0 + 50, PY0 + 2), pr(PX0 + 96, PY0 + 4)], 2.4, 0.9)}
      ${shine([pr(PX0 - 2, PY0 + 30), pr(PX0 - 4, 128), pr(PX0 - 2, PY1 - 30)], 2.2, 0.7)}</g>
      ${whoosh}${sparkle(tw[0], tw[1], 11, C.white, 0.9)}`,
  });
}

export function newspaper(): string {
  return paperArt({ open: 0 });
}

/** Newspaper win loop: the front page flaps open (past edge-on, showing the inside), and swings back. */
export const newspaperWinFrames: (() => string)[] = [
  () => paperArt({ open: 38, whoosh: true, twinkle: [36, 50] }),
  () => paperArt({ open: 78, whoosh: true, twinkle: [214, 46] }),
  () => paperArt({ open: 112, twinkle: [222, 70] }),
  () => paperArt({ open: 56, whoosh: true, twinkle: [212, 38] }),
];

/* ------------------------------------------------------------------ */
/* L4: hook-handle umbrella (blue)                                     */
/* ------------------------------------------------------------------ */
interface BrollyPose {
  /** Canopy half-width (rest 92), rim height, rim depth and tip height. */
  R?: number;
  rimY?: number;
  ry?: number;
  tipY?: number;
  /** Panel twirl phase (0..1 of a panel). */
  spin?: number;
  /** Whole-umbrella tilt (degrees) about the handle. */
  tilt?: number;
  /** Drops: on the rim, flung, or none. */
  drops?: 'rim' | 'fling' | 'none';
  /** Pop marks round the canopy. */
  pop?: boolean;
  /** Spin marks under the rim. */
  swirl?: boolean;
  twinkle?: V;
}

function brollyArt(p: BrollyPose): string {
  const B = tones(C.umbrella, C.umbrellaDeep, C.umbrellaLight);
  const ALT = { base: mix(C.umbrella, C.umbrellaLight, 0.42), shade: mix(C.umbrella, C.umbrellaDeep, 0.25) };
  const WOOD = tones(C.woodLight, C.woodMid, C.paperWarm);
  const R = p.R ?? 94;
  const rimY = p.rimY ?? 122;
  const ry = p.ry ?? 22;
  const tipY = p.tipY ?? 40;
  const cx = 128;
  const t = `rotate(${p.tilt ?? -12} 128 150)`;
  const n = 6;
  const spin = p.spin ?? 0;
  const at = (a: number): V => [cx + R * Math.cos((a * Math.PI) / 180), rimY + ry * Math.sin((a * Math.PI) / 180)];
  // rib ends round the front of the rim (a = 0 right .. 180 left)
  const ribAs: number[] = [];
  for (let i = -1; i <= n + 1; i++) {
    const a = (180 * (i + spin)) / n;
    if (a > 0.5 && a < 179.5) ribAs.push(a);
  }
  const rim = [0, ...ribAs, 180].map(at);
  const tip: V = [cx, tipY];
  const h = rimY - tipY;
  const dome = `M${P(at(180))} C${cx - R} ${rimY - h * 0.62} ${cx - R * 0.56} ${tipY} ${cx} ${tipY} C${cx + R * 0.56} ${tipY} ${cx + R} ${rimY - h * 0.62} ${P(at(0))}`;
  const canopy = `${dome}${scallops(rim, 0.2, -1)} Z`;
  // a rib: from the tip, bowing out like the dome, down to its end on the rim
  const rib = (a: number) => {
    const e = at(a);
    const k = (e[0] - cx) / R;
    return `M${P(tip)} C${(cx + R * 0.56 * k).toFixed(1)} ${tipY} ${(cx + R * k * 1.0).toFixed(1)} ${(rimY - h * 0.62 + ry * 0.3).toFixed(1)} ${P(e)}`;
  };
  const ribPt = (a: number, u: number): V => {
    const e = at(a);
    const k = (e[0] - cx) / R;
    const p0 = tip;
    const p1: V = [cx + R * 0.56 * k, tipY];
    const p2: V = [cx + R * k, rimY - h * 0.62 + ry * 0.3];
    const m = 1 - u;
    return [m * m * m * p0[0] + 3 * m * m * u * p1[0] + 3 * m * u * u * p2[0] + u * u * u * e[0], m * m * m * p0[1] + 3 * m * m * u * p1[1] + 3 * m * u * u * p2[1] + u * u * u * e[1]];
  };
  // alternate panels in the lighter blue (the panel between ribs i and i+1)
  const allA = [0, ...ribAs, 180];
  let panels = '';
  for (let i = 0; i < allA.length - 1; i++) {
    const a0 = allA[i];
    const a1 = allA[i + 1];
    const idx = Math.floor((a0 / 180) * n - spin + 1e-6);
    if (((idx % 2) + 2) % 2 !== 0) continue;
    const e0 = at(a0);
    const e1 = at(a1);
    const s0 = Array.from({ length: 7 }, (_, k) => ribPt(a0, k / 6));
    const s1 = Array.from({ length: 7 }, (_, k) => ribPt(a1, 1 - k / 6));
    panels += `M${P(tip)} L${s0.map(P).join(' L')} L${P(e0)}${scallops([e0, e1], 0.2, -1)} L${s1.map(P).join(' L')} Z `;
  }
  const cut: V = [-11, -12];
  const canopyF = celForm(canopy, { ...B, t, cut, band: [4, 5], hatch: B.hatch, hatchGap: 5.5, seed: 81, inner: painted(canopy, cut, panels, ALT.base, ALT.shade, t) });
  const ribs = ribAs.map(rib).join(' ');

  // shaft and crook handle
  const shaftS = sample([[cx, rimY - 10], [cx, 196], [cx - 1, 210]], 12);
  const hook = sample([[cx, 194], [cx, 214], [cx - 8, 230], [cx - 24, 236], [cx - 38, 228], [cx - 41, 212]], 40);
  const shaftF = celForm(tubeD(shaftS, 4.4), { base: C.steel, shade: C.steelDeep, light: C.steelLight, t, cut: [-2, -2], seed: 82 });
  const hookF = celForm(tubeD(hook, 10), { ...WOOD, base: C.wood, shade: WOOD.shade, t, cut: [-4.5, -5], band: [2, 2.5], seed: 83 });
  const ferrule = `M${cx - 5} ${tipY + 4} L${cx - 2.5} ${tipY - 20} Q${cx} ${tipY - 25} ${cx + 2.5} ${tipY - 20} L${cx + 5} ${tipY + 4} Z`;
  const ferruleF = celForm(ferrule, { ...GOLD_TONES, t, cut: [-3, -2], seed: 84 });
  const collar = `M${cx - 9} 192 L${cx + 9} 192 L${cx + 9} 202 L${cx - 9} 202 Z`;
  const collarF = celForm(collar, { ...GOLD_TONES, t, cut: [-4, -3], seed: 85 });
  // tips on the rib ends
  const tips = ribAs.map((a) => {
    const e = at(a);
    return `<circle cx="${e[0].toFixed(1)}" cy="${(e[1] + 2).toFixed(1)}" r="4" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.6"/>`;
  });
  // rain drops: hanging from the rim, or flung off by the twirl
  const drop = (x: number, y: number, s = 1, rot = 0) =>
    `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot}) scale(${s})"><path d="M0 -11 Q8 2 0 8 Q-8 2 0 -11 Z" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/><path d="M-2.4 -1 Q-3 3 0 5" stroke="${C.white}" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
  const dr = p.drops ?? 'rim';
  const drops =
    dr === 'rim'
      ? (() => {
          const a = at(Math.min(...ribAs.filter((x) => x > 120)));
          const b = at(Math.max(...ribAs.filter((x) => x < 60)));
          return `<g transform="${t}">${drop(a[0], a[1] + 16, 0.95)}${drop(b[0], b[1] + 14, 0.8)}</g>`;
        })()
      : dr === 'fling'
        ? `${drop(28, 112, 0.9, 60)}${drop(40, 84, 0.7, 50)}${drop(226, 150, 0.85, -60)}${drop(214, 178, 0.65, -50)}
           ${dash([46, 118], [60, 124], 2.4)}${dash([210, 146], [196, 144], 2.4)}`
        : '';
  const pop = p.pop ? `<g transform="${t}">${burst([cx, rimY], [-172, -152, -28, -8], R + 8, R + 26)}${burst(tip, [-140, -90, -40], 14, 30)}</g>` : '';
  const swirl = p.swirl
    ? `<g transform="${t}"><path d="${lens([[cx - R * 0.8, rimY + ry + 10], [cx, rimY + ry + 20], [cx + R * 0.8, rimY + ry + 10]], 2.6)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2.2"/></g>`
    : '';
  const tw = p.twinkle ?? [206, 44];
  return composeSymbol({
    ...PAINT,
    texture: { seed: 24, mottle: 0.5 },
    transform: 'translate(128 128) scale(.95) translate(-128 -128)',
    layers: [
      { fills: shaftF.fills, lines: shaftF.line('stroke-width="5"') },
      { fills: collarF.fills + hookF.fills, lines: collarF.line('stroke-width="5"') + hookF.line() },
      { fills: ferruleF.fills, lines: ferruleF.line('stroke-width="5"') },
      { fills: canopyF.fills, lines: `${canopyF.line()}<path d="${ribs}" transform="${t}" stroke-width="3.6"/>` },
    ],
    top: `<g transform="${t}">${tips.join('')}
      ${shine([[cx - R * 0.78, rimY - h * 0.28], [cx - R * 0.56, rimY - h * 0.7], [cx - R * 0.2, tipY + 6]], 3.6, 0.7)}
      ${shine([[cx - R * 0.42, rimY - h * 0.3], [cx - R * 0.3, rimY - h * 0.62]], 2, 0.5)}
      ${shine([[cx - 3.5, 206], [cx - 6, 222], [cx - 16, 230]], 2.4, 0.7)}
      </g>${drops}${pop}${swirl}${sparkle(tw[0], tw[1], 11, C.white, 0.9)}`,
  });
}

export function umbrella(): string {
  return brollyArt({});
}

/** Umbrella win loop: half furled, POP wide open (overshoot), then a twirl one way and the other, flinging drops. */
export const umbrellaWinFrames: (() => string)[] = [
  () => brollyArt({ R: 62, rimY: 138, ry: 14, tipY: 34, tilt: -6, drops: 'none', twinkle: [204, 60] }),
  () => brollyArt({ R: 102, rimY: 118, ry: 24, tipY: 44, tilt: -10, pop: true, drops: 'none', twinkle: [40, 186] }),
  () => brollyArt({ spin: 0.5, tilt: -18, drops: 'fling', swirl: true, twinkle: [212, 40] }),
  () => brollyArt({ spin: 1, tilt: -6, drops: 'fling', swirl: true, twinkle: [44, 44] }),
];

/** Shared for the review sheet: the taper helper is re-exported nowhere; keep the import used. */
void taper;
