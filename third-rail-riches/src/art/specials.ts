/**
 * Third Rail Riches special symbols (docs/ART.md): the Live Wire (wild), the Golden Ticket
 * (scatter), the Fare Coin (subway token, 4 metals), the Locomotive (front 3/4, idle / lit /
 * golden) and the Junction (switch stand, idle / thrown). 256x256 viewBox, hand-cel painted like
 * the reference keg and chest: flat fills, cut shadows, hatching, texture; only emitted light
 * (electricity, the headlamp, the thrown signal) is soft.
 */
import { lens, sparkle, turn, type V } from './geo';
import { C, composeSymbol, nextId, celForm, celTones, GOLD_TONES, shine, mix, softGlow, glowOf, rng } from './kit';

const f1 = (n: number) => n.toFixed(1);
const pts = (p: V[]) => p.map((q) => `${f1(q[0])} ${f1(q[1])}`).join(' L');

/** Polygon with rounded corners (radius r at every vertex). */
function roundPoly(p: V[], r: number): string {
  const n = p.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n];
    const b = p[i];
    const c = p[(i + 1) % n];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const p0: V = [b[0] + ((a[0] - b[0]) / la) * r, b[1] + ((a[1] - b[1]) / la) * r];
    const p1: V = [b[0] + ((c[0] - b[0]) / lc) * r, b[1] + ((c[1] - b[1]) / lc) * r];
    d += `${i ? 'L' : 'M'}${f1(p0[0])} ${f1(p0[1])} Q${f1(b[0])} ${f1(b[1])} ${f1(p1[0])} ${f1(p1[1])} `;
  }
  return `${d}Z`;
}

/** Circle as a path (for celForm). */
const circ = (cx: number, cy: number, r: number) => `M${f1(cx - r)} ${f1(cy)} A${r} ${r} 0 1 0 ${f1(cx + r)} ${f1(cy)} A${r} ${r} 0 1 0 ${f1(cx - r)} ${f1(cy)} Z`;

/** N-point star path centred on (cx, cy). */
function star(cx: number, cy: number, r0: number, r1: number, n = 5, rot = -90): string {
  return `M${pts(
    Array.from({ length: n * 2 }, (_, i) => {
      const a = ((rot + (i * 180) / n) * Math.PI) / 180;
      const r = i % 2 ? r0 : r1;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as V;
    }),
  )} Z`;
}

/** A rivet head: brass dot, inked, with a pin highlight. */
const rivet = (x: number, y: number, r = 3.4, fill: string = C.goldLight) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${C.ink}" stroke-width="${(r * 0.5).toFixed(2)}"/><circle cx="${f1(x - r * 0.3)}" cy="${f1(y - r * 0.3)}" r="${(r * 0.34).toFixed(2)}" fill="#fff" opacity=".8"/>`;

/**
 * A jagged electric arc between a and b: zig-zag points offset alternately from the chord
 * (plus a bulge `bow` along the normal so it can leap out from an edge). Deterministic per seed.
 */
export function zigzag(a: V, b: V, seed: number, n = 6, amp = 7, bow = 0): V[] {
  const r = rng(seed);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const out: V[] = [a];
  // irregular lightning: uneven spacing, kinks that mostly (not always) alternate, varied size
  let sgn = r() < 0.5 ? 1 : -1;
  for (let i = 1; i < n; i++) {
    const t = (i + (r() - 0.5) * 0.7) / n;
    sgn = r() < 0.78 ? -sgn : sgn;
    const off = sgn * amp * (0.25 + r() * 1.05) + Math.sin(Math.PI * t) * bow;
    out.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
  }
  out.push(b);
  return out;
}

/** Ink-cased electric arc: blue glow, ink casing, volt body, white-hot core. */
function arcStroke(p: V[], w = 4, hot = false, inked = true): string {
  const d = `M${pts(p)}`;
  const id = nextId('ag');
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="296" height="296"><feGaussianBlur stdDeviation="${(w * 1.3).toFixed(1)}"/></filter><path d="${d}" fill="none" stroke="${hot ? C.voltLight : C.volt}" stroke-width="${w * 3.2}" stroke-linecap="round" stroke-linejoin="round" filter="url(#${id})" opacity="${hot ? 0.95 : 0.7}"/>
    ${inked ? `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w + 3.4}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    <path d="${d}" fill="none" stroke="${hot ? C.voltLight : C.volt}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${C.voltCore}" stroke-width="${(w * 0.4).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/* ------------------------------------------------------------------ */
/* WILD: Live Wire                                                     */
/* ------------------------------------------------------------------ */
const HX = 128;
const HY = 132;
const hex = (r: number): V[] => Array.from({ length: 6 }, (_, i) => [HX + Math.cos(((-90 + i * 60) * Math.PI) / 180) * r, HY + Math.sin(((-90 + i * 60) * Math.PI) / 180) * r] as V);
const PLATE = roundPoly(hex(98), 16);
const FIELD = roundPoly(hex(72), 10);
/** The big jagged bolt, breaking out of the plate top and bottom. */
const BOLT: V[] = [
  [146, 18],
  [196, 18],
  [158, 100],
  [190, 100],
  [92, 240],
  [116, 140],
  [78, 140],
];
const BOLT_D = `M${pts(BOLT)} Z`;
/** Inner white-hot core of the bolt (a thinner zig through its middle). */
const BOLT_CORE: V[] = [
  [170, 26],
  [138, 108],
  [168, 108],
  [102, 222],
];

/** Arc sets per frame: [edge point a, edge point b, bow (outward), seed]. */
function wireArcs(frame: number, lit: boolean): string {
  const H = hex(98);
  const on = (i: number, t: number): V => {
    const a = H[i];
    const b = H[(i + 1) % 6];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  // edges: 0 top-right, 1 right, 2 bottom-right, 3 bottom-left, 4 left, 5 top-left
  const sets: [number, number, number, number][][] = [
    [[4, 0.2, 0.75, 20], [1, 0.35, 0.8, 16], [2, 0.5, 0.85, 14]],
    [[5, 0.15, 0.6, 18], [1, 0.1, 0.55, 20], [3, 0.3, 0.75, 16]],
    [[4, 0.4, 0.95, 22], [0, 0.45, 0.9, 14], [2, 0.15, 0.55, 18]],
    [[3, 0.15, 0.55, 18], [5, 0.45, 0.95, 16], [1, 0.5, 0.95, 22]],
  ];
  const set = sets[frame % sets.length];
  const extra: [number, number, number, number][] = lit ? sets[(frame + 2) % sets.length] : [];
  return [...set, ...extra]
    .map(([e, t0, t1, bow], k) => {
      const a = on(e, t0);
      const b = on(e, t1);
      // bow outward: the hex is traversed clockwise, so the outward normal is negative
      const p = zigzag(a, b, 31 + frame * 7 + k * 3 + e, 5, lit ? 9 : 7, -(lit ? bow * 1.35 : bow));
      // a short fork off the arc's highest kink
      const m = p[2];
      const fork = zigzag(m, [m[0] + (m[0] - HX) * 0.16, m[1] + (m[1] - HY) * 0.16], 77 + k + frame, 3, 3);
      return `${arcStroke(fork, lit ? 2.6 : 2.2, lit)}${arcStroke(p, lit ? 4.4 : 3.6, lit)}`;
    })
    .join('');
}

function liveWireArt(lit: boolean, frame: number): string {
  const B = lit ? { base: mix(C.gold, C.goldLight, 0.25), shade: mix(C.gold, C.goldDeep, 0.5), light: C.goldLight, hatch: mix(C.goldDeep, C.ink, 0.3) } : GOLD_TONES;
  // brass hex plate: an engraved groove and a ring of rivets at the corners
  const plate = celForm(PLATE, {
    ...B,
    cut: [-12, -12],
    band: [5, 5],
    hatch: B.hatch,
    seed: 91,
    inner: `<path d="${roundPoly(hex(86), 12)}" fill="none" stroke="${C.goldDeep}" stroke-width="2.6" opacity=".7"/>
      <path d="${roundPoly(hex(84), 12)}" fill="none" stroke="${C.goldLight}" stroke-width="1.4" opacity=".55" transform="translate(1.4 1.6)"/>`,
  });
  // dark recessed enamel field, lit from inside by the bolt
  const fieldTones = lit
    ? { base: mix(C.voltDeep, C.voltNight, 0.35), shade: C.voltNight, light: mix(C.voltDeep, C.volt, 0.4) }
    : { base: mix(C.voltNight, C.tunnel, 0.35), shade: mix(C.tunnel, C.ink, 0.4), light: mix(C.voltNight, C.voltDeep, 0.35) };
  const crackle = [
    zigzag([86, 104], [112, 92], 3, 4, 3),
    zigzag([150, 176], [176, 162], 5, 4, 3),
    zigzag([88, 176], [104, 196], 7, 3, 3),
  ]
    .map((p) => `<path d="M${pts(p)}" fill="none" stroke="${lit ? C.voltLight : C.volt}" stroke-width="1.6" opacity="${lit ? 0.8 : 0.45}"/>`)
    .join('');
  const field = celForm(FIELD, {
    ...fieldTones,
    // recessed: the rim casts the shadow on the upper left inside the field
    cut: [7, 8],
    band: [-3, -3],
    seed: 92,
    inner: `${softGlow(130, 132, lit ? 70 : 52, lit ? C.volt : C.voltDeep, lit ? 0.85 : 0.7)}${crackle}`,
  });
  const bolt = celForm(BOLT_D, {
    base: lit ? C.voltCore : C.voltLight,
    shade: lit ? C.voltLight : C.volt,
    light: lit ? '#ffffff' : C.voltCore,
    cut: [-7, -5],
    band: [3, 2.5],
    seed: 93,
  });
  const core = `<path d="M${pts(BOLT_CORE)}" fill="none" stroke="${lit ? '#ffffff' : C.voltCore}" stroke-width="${lit ? 5 : 3.4}" stroke-linecap="round" stroke-linejoin="round" opacity="${lit ? 1 : 0.85}"/>`;
  const rivets = hex(86)
    .map((q) => rivet(q[0], q[1], 4.4))
    .join('');
  const boltGlow = glowOf(`<path d="${BOLT_D}" fill="${lit ? C.voltLight : C.volt}" stroke="${lit ? C.voltLight : C.volt}" stroke-width="${lit ? 16 : 10}" stroke-linejoin="round"/>`, lit ? 9 : 6, lit ? 0.95 : 0.75);
  return composeSymbol({
    autoCel: false,
    texture: { seed: 24, mottle: 0.55 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: lit ? `${softGlow(128, 130, 82, C.volt, 0.8)}${softGlow(128, 130, 50, C.voltLight, 0.7)}` : softGlow(128, 132, 74, C.voltDeep, 0.35),
    layers: [
      { fills: plate.fills, lines: plate.line() },
      { fills: field.fills, lines: field.line('stroke-width="5"') },
    ],
    top: `${rivets}
      ${boltGlow}
      ${bolt.fills}
      <g fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round">${bolt.line()}</g>
      ${core}
      ${wireArcs(frame, lit)}
      ${shine([[50, 96], [74, 66], [104, 50]], 3.6, lit ? 0.85 : 0.65, C.goldLight)}
      ${shine([[206, 180], [184, 204], [156, 220]], 2.6, 0.5, C.voltLight)}
      ${shine([[160, 26], [178, 24], [188, 23]], 2, 0.85, '#fff')}
      ${lit ? `${sparkle(30, 58, 10, C.voltCore)}${sparkle(226, 210, 9, C.voltCore)}${sparkle(214, 44, 7, C.voltLight)}` : sparkle(214, 48, 6, C.voltLight, 0.8)}`,
  });
}

/** Live Wire (wild). `lit` = the arcs flare white-hot with a blue glow (win). */
export const liveWire = (lit = false, frame = 0): string => liveWireArt(lit, frame);
/** Crackling arc loop for the lit Live Wire (4 frames; the arcs jump to new edges each frame). */
export const liveWireFrames: (() => string)[] = [0, 1, 2, 3].map((k) => () => liveWireArt(true, k));
/** Optional idle crackle (the arcs wander while the wild sits on the board). */
export const liveWireIdleFrames: (() => string)[] = [0, 1, 2, 3].map((k) => () => liveWireArt(false, k));

/* ------------------------------------------------------------------ */
/* SCATTER: Golden Ticket                                              */
/* ------------------------------------------------------------------ */
const TW = 100;
const TH = 62;
/** Ticket outline in local coords (centre 0,0): bitten corners, perforated short ends, star hole. */
function ticketPath(): string {
  const rc = 14;
  const rb = 5.2;
  const ys = [-30, -15, 0, 15, 30];
  let d = `M${-TW + rc} ${-TH} L${TW - rc} ${-TH} A${rc} ${rc} 0 0 0 ${TW} ${-TH + rc}`;
  for (const y of ys) d += ` L${TW} ${y - rb} A${rb} ${rb} 0 0 0 ${TW} ${y + rb}`;
  d += ` L${TW} ${TH - rc} A${rc} ${rc} 0 0 0 ${TW - rc} ${TH} L${-TW + rc} ${TH} A${rc} ${rc} 0 0 0 ${-TW} ${TH - rc}`;
  for (const y of [...ys].reverse()) d += ` L${-TW} ${y + rb} A${rb} ${rb} 0 0 0 ${-TW} ${y - rb}`;
  d += ` L${-TW} ${-TH + rc} A${rc} ${rc} 0 0 0 ${-TW + rc} ${-TH} Z`;
  return d;
}
const TICKET = ticketPath();
const STAR_HOLE = star(70, 0, 7, 17, 5);

/** The deco winged wheel (railway emblem), embossed, centred on (cx, cy). */
function wingedWheel(cx: number, cy: number, fill: string, edge: string): string {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `M${f1(cx + Math.cos(a) * 5)} ${f1(cy + Math.sin(a) * 5)} L${f1(cx + Math.cos(a) * 13)} ${f1(cy + Math.sin(a) * 13)}`;
  }).join(' ');
  const wing = (s: number) =>
    [0, 1, 2]
      .map((k) => {
        const y0 = cy - 9 + k * 7;
        const x0 = cx + s * 17;
        const x1 = cx + s * (46 - k * 9);
        return `<path d="M${x0} ${y0 + 3} Q${f1((x0 + x1) / 2)} ${y0 - 7 + k * 2} ${x1} ${y0 - 4 + k * 3} Q${f1((x0 + x1) / 2)} ${y0 + 2 + k} ${x0} ${y0 + 6} Z" fill="${fill}" stroke="${edge}" stroke-width="1.8" stroke-linejoin="round"/>`;
      })
      .join('');
  return `${wing(-1)}${wing(1)}
    <circle cx="${cx}" cy="${cy}" r="16" fill="${fill}" stroke="${edge}" stroke-width="2.2"/>
    <circle cx="${cx}" cy="${cy}" r="12.5" fill="none" stroke="${edge}" stroke-width="1.4"/>
    <path d="${spokes}" stroke="${edge}" stroke-width="2" fill="none"/>
    <circle cx="${cx}" cy="${cy}" r="4.2" fill="${edge}"/>`;
}

interface TicketPose {
  tilt: number;
  scale: number;
  win: boolean;
  /** Glint band position across the ticket (0..1), or undefined for none. */
  sweep?: number;
  rays?: number;
}

function ticketArt(p: TicketPose): string {
  const t = `translate(128 ${p.win ? 124 : 130}) rotate(${p.tilt}) scale(${p.scale})`;
  const local = (x: number, y: number): V => {
    const q = turn([x * p.scale, y * p.scale], p.tilt, [0, 0]);
    return [128 + q[0], (p.win ? 124 : 130) + q[1]];
  };
  const G = p.win ? { base: mix(C.gold, C.goldLight, 0.2), shade: mix(C.gold, C.goldDeep, 0.5), light: C.goldLight, hatch: mix(C.goldDeep, C.ink, 0.3) } : GOLD_TONES;
  const eng = mix(C.goldDeep, C.gold, 0.15);
  const engL = C.goldLight;
  const corner = (sx: number, sy: number) => {
    const x = sx < 0 ? -88 : 34;
    const y = sy < 0 ? -50 : 50;
    return [6, 11, 16].map((r) => `<path d="M${x + (sx < 0 ? r : -r)} ${y} A${r} ${r} 0 0 ${sx * sy > 0 ? 0 : 1} ${x} ${y + (sy < 0 ? r : -r)}" fill="none" stroke="${eng}" stroke-width="1.6"/>`).join('');
  };
  const diamonds = [-62, -46, -30, -14, 2, 18]
    .map((x) => `<path d="M${x} 36 l5 -5 l5 5 l-5 5 Z" fill="${engL}" stroke="${eng}" stroke-width="1.4"/>`)
    .join('');
  const perfs = Array.from({ length: 9 }, (_, i) => `<circle cx="46" cy="${-48 + i * 12}" r="2.3" fill="${mix(C.goldDeep, C.ink, 0.45)}"/>`).join('');
  const sweep =
    p.sweep !== undefined
      ? (() => {
          const x = -TW - 40 + p.sweep * (TW * 2 + 80);
          return `<path d="M${x} ${-TH - 4} L${x + 26} ${-TH - 4} L${x + 2} ${TH + 4} L${x - 24} ${TH + 4} Z" fill="#fff" opacity=".55"/><path d="M${x + 34} ${-TH - 4} L${x + 42} ${-TH - 4} L${x + 18} ${TH + 4} L${x + 10} ${TH + 4} Z" fill="#fff" opacity=".45"/>`;
        })()
      : '';
  const inner = `<g transform="${t}">
      <rect x="-90" y="-52" width="126" height="104" rx="9" fill="none" stroke="${eng}" stroke-width="2.6"/>
      <rect x="-84" y="-46" width="114" height="92" rx="6" fill="none" stroke="${eng}" stroke-width="1.3"/>
      <rect x="-89" y="-51" width="126" height="104" rx="9" fill="none" stroke="${engL}" stroke-width="1.1" opacity=".7" transform="translate(1.2 1.4)"/>
      ${corner(-1, -1)}${corner(1, -1)}${corner(-1, 1)}${corner(1, 1)}
      <path d="M-70 -30 L-46 -30 M-8 -30 L16 -30" stroke="${eng}" stroke-width="2.2" stroke-linecap="round"/>
      ${wingedWheel(-27, -10, engL, eng)}
      ${diamonds}
      ${perfs}
      <path d="M70 -46 l5 6 l-5 6 l-5 -6 Z M70 46 l5 -6 l-5 -6 l-5 6 Z" fill="${engL}" stroke="${eng}" stroke-width="1.4"/>
      <circle cx="70" cy="0" r="24" fill="none" stroke="${eng}" stroke-width="1.8"/>
      ${sweep}
    </g>`;
  const ticket = celForm(`${TICKET} ${STAR_HOLE}`, { ...G, rule: 'evenodd', t, cut: [-8, -9], band: [3.5, 3.5], hatch: G.hatch, seed: 101, inner });
  // card thickness: a deeper gold edge peeking out on the lower right
  const edge = celForm(`${TICKET} ${STAR_HOLE}`, { base: mix(C.goldDeep, C.gold, 0.25), shade: mix(C.goldDeep, C.ink, 0.25), rule: 'evenodd', t: `${t} translate(3 5)`, seed: 102 });
  // the punched star's paper edge (rim inside the hole, lower right)
  const rays = p.win
    ? Array.from({ length: 12 }, (_, i) => {
        const a = ((i * 30 + (p.rays ?? 0)) * Math.PI) / 180;
        const w = 0.11;
        const R = 116;
        const q = (ang: number, r: number) => `${f1(128 + Math.cos(ang) * r)} ${f1(124 + Math.sin(ang) * r)}`;
        return `<path d="M128 124 L${q(a - w, R)} L${q(a + w, R)} Z" fill="${i % 2 ? C.goldLight : C.fireCore}" opacity="${i % 2 ? 0.55 : 0.75}"/>`;
      }).join('')
    : '';
  const sparks = p.win
    ? `${sparkle(30, 46, 14, C.white)}${sparkle(224, 200, 12, C.goldLight)}${sparkle(214, 40, 9, C.goldLight)}${sparkle(42, 212, 8, C.white, 0.9)}${sparkle(local(70, -40)[0], local(70, -40)[1], 6, '#fff')}`
    : `${sparkle(local(92, -56)[0], local(92, -56)[1], 8, '#fff', 0.9)}`;
  const topEdge = [local(-80, -57), local(-20, -58), local(40, -57)];
  const leftEdge = [local(-95, -40), local(-95, 0), local(-95, 30)];
  return composeSymbol({
    autoCel: false,
    texture: { seed: 26, mottle: 0.5 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: p.win ? `${rays}${softGlow(128, 124, 76, C.gold, 0.7)}` : softGlow(128, 130, 70, C.gold, 0.25),
    layers: [
      { fills: edge.fills, lines: edge.line() },
      { fills: ticket.fills, lines: ticket.line() },
    ],
    top: `${shine(topEdge, 2.6, 0.75)}${shine(leftEdge, 2, 0.5, C.goldLight)}
      ${sparks}`,
  });
}

/** Golden Ticket (scatter), idle: tilted on the reel. */
export const goldenTicket = (): string => ticketArt({ tilt: -11, scale: 1.06, win: false });
/** Golden Ticket win pose: flipped square to the viewer, a touch bigger, rays and sparkles. */
export const goldenTicketWin = (): string => ticketArt({ tilt: -3, scale: 1.06, win: true, rays: 0 });
/** Win loop: a glint sweeps across the ticket while the rays turn (seamless: rays step 7.5 deg). */
export const goldenTicketFrames: (() => string)[] = [0, 1, 2, 3].map((k) => () => ticketArt({ tilt: -3, scale: 1.06, win: true, rays: k * 7.5, sweep: 0.1 + k * 0.3 }));

/* ------------------------------------------------------------------ */
/* COIN: Fare Coin (subway token)                                      */
/* ------------------------------------------------------------------ */
export type CoinTier = 'bronze' | 'silver' | 'gold' | 'platinum';
/** The plain face disc in the 256 box: the game fits the cash value inside it. */
export const COIN_FACE = { cx: 128, cy: 130, r: 62 } as const;
const CX = COIN_FACE.cx;
const CY = COIN_FACE.cy;
const TIER: Record<CoinTier, [string, string, string]> = {
  bronze: [C.bronzeLight, C.bronze, C.bronzeDeep],
  silver: [C.silverLight, C.silver, C.silverDeep],
  gold: [C.goldLight, C.gold, C.goldDeep],
  platinum: [C.platinumLight, C.platinum, C.platinumDeep],
};

/** Milled (reeded) outer edge: many small square teeth. */
function milled(r0: number, r1: number, n: number): string {
  const p: V[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    p.push([CX + Math.cos(a0) * r1, CY + Math.sin(a0) * r1], [CX + Math.cos(a0 + 0.012) * r0, CY + Math.sin(a0 + 0.012) * r0]);
    p.push([CX + Math.cos(a1) * r0, CY + Math.sin(a1) * r0], [CX + Math.cos(a1 + 0.012) * r1, CY + Math.sin(a1 + 0.012) * r1]);
  }
  return `M${pts(p)} Z`;
}

/** Small lightning "Y" cut into the rim at angle `deg` (screen degrees), pointing outward. */
function rimBolt(deg: number, fill: string, lip: string): string {
  const d = 'M-3 -12 L6 -12 L1 -2 L7 -2 L-4 13 L-1 3 L-7 3 Z';
  const r = 82;
  const a = (deg * Math.PI) / 180;
  const x = CX + Math.cos(a) * r;
  const y = CY + Math.sin(a) * r;
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${deg + 90}) scale(1.45)"><path d="${d}" fill="${lip}" transform="translate(1.4 1.6)"/><path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"/></g>`;
}

function coinArt(tier: CoinTier, glint: boolean): string {
  const [hi, mid, lo] = TIER[tier];
  const T = celTones(mid, lo, hi);
  const edgeT = { base: mix(mid, lo, 0.3), shade: mix(lo, C.ink, 0.15), light: mix(mid, hi, 0.4), hatch: T.hatch };
  const edge = celForm(milled(100, 106, 64), { ...edgeT, cut: [-10, -11], band: [3, 3], seed: 111 });
  const rimInner = `<circle cx="${CX}" cy="${CY}" r="91" fill="none" stroke="${lo}" stroke-width="2.2" opacity=".6"/>
    <circle cx="${CX}" cy="${CY}" r="72" fill="none" stroke="${lo}" stroke-width="2.2" opacity=".6"/>
    <circle cx="${CX + 1.2}" cy="${CY + 1.4}" r="90" fill="none" stroke="${hi}" stroke-width="1.2" opacity=".6"/>`;
  const rim = celForm(circ(CX, CY, 99), { ...T, cut: [-11, -12], band: [4, 4.5], hatch: T.hatch, hatchGap: 5.5, seed: 112, inner: rimInner });
  // the plain face: recessed, so the rim's shadow falls on its upper left; flat and calm in the middle
  const faceBase = mix(mid, hi, 0.18);
  const face = celForm(circ(CX, CY, COIN_FACE.r), { base: faceBase, shade: mix(mid, lo, 0.32), light: mix(faceBase, hi, 0.5), cut: [6, 7], band: [-2.5, -3], seed: 113 });
  // the step down into the face: a deep ring that reads as the token's thickness
  const step = celForm(`${circ(CX, CY, 68)} ${circ(CX, CY, COIN_FACE.r)}`, { base: mix(mid, lo, 0.55), shade: mix(lo, C.ink, 0.2), light: mid, rule: 'evenodd', cut: [-5, -6], band: [-2, -2], seed: 114 });
  const bolts = [-135, -45, 45, 135].map((a) => rimBolt(a, mix(lo, C.ink, 0.25), hi)).join('');
  const dots = [0, 90, 180, 270]
    .filter((a) => !(tier === 'platinum' && a === 0))
    .map((a) => {
      const r = (a - 90) * (Math.PI / 180);
      return `<circle cx="${f1(CX + Math.cos(r) * 82)}" cy="${f1(CY + Math.sin(r) * 82)}" r="4.2" fill="${hi}" stroke="${C.ink}" stroke-width="1.8"/>`;
    })
    .join('');
  const arcPts = (r: number, a0: number, a1: number, n = 4): V[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as V;
    });
  const gem =
    tier === 'platinum'
      ? (() => {
          const gx = CX;
          const gy = CY - 98;
          const out = 'M-17 -2 L-9 -12 L9 -12 L17 -2 L0 17 Z';
          return `<g transform="translate(${gx} ${gy})">
            ${softGlow(0, 0, 26, C.voltLight, 0.8)}
            <path d="M-20 4 Q0 14 20 4 L16 12 Q0 20 -16 12 Z" fill="${C.platinumDeep}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
            <path d="${out}" fill="${C.voltLight}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
            <path d="M-17 -2 L17 -2 L0 17 Z" fill="${C.volt}"/>
            <path d="M-9 -12 L-4 -2 L4 -2 L9 -12 M-4 -2 L0 17 M4 -2 L0 17 M-17 -2 L-9 -12" fill="none" stroke="${C.voltDeep}" stroke-width="1.4" opacity=".7"/>
            <path d="M-4 -2 L4 -2 L0 17 Z" fill="${C.voltLight}" opacity=".8"/>
            <path d="M-9 -12 L-4 -2 L-17 -2 Z" fill="${C.voltCore}"/>
            <path d="${out}" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
            <circle cx="-14" cy="-2" r="3" fill="${C.platinumLight}" stroke="${C.ink}" stroke-width="1.5"/><circle cx="14" cy="-2" r="3" fill="${C.platinumLight}" stroke="${C.ink}" stroke-width="1.5"/>
            ${sparkle(-4, -8, 6, '#fff')}
          </g>`;
        })()
      : '';
  const sheen =
    tier === 'platinum'
      ? `${shine(arcPts(86, 150, 200), 4.5, 0.7, C.voltLight)}${shine(arcPts(80, 10, 60), 3, 0.5, C.voltLight)}`
      : '';
  const glintArt = glint
    ? `${softGlow(CX + 60, CY - 66, 26, '#fff', 0.8)}
       <path d="M${CX + 60} ${CY - 106} Q${CX + 63} ${CY - 69} ${CX + 100} ${CY - 66} Q${CX + 63} ${CY - 63} ${CX + 60} ${CY - 26} Q${CX + 57} ${CY - 63} ${CX + 20} ${CY - 66} Q${CX + 57} ${CY - 69} ${CX + 60} ${CY - 106} Z" fill="#fff"/>
       ${sparkle(CX - 74, CY + 58, 9, '#fff', 0.9)}`
    : '';
  const sweepId = nextId('cs');
  const sweep = glint
    ? `<clipPath id="${sweepId}"><path d="${circ(CX, CY, 99)}"/></clipPath><g clip-path="url(#${sweepId})" opacity=".42"><path d="M${CX + 6} ${CY - 120} L${CX + 40} ${CY - 120} L${CX - 50} ${CY + 120} L${CX - 84} ${CY + 120} Z" fill="#fff"/><path d="M${CX + 52} ${CY - 120} L${CX + 62} ${CY - 120} L${CX - 28} ${CY + 120} L${CX - 38} ${CY + 120} Z" fill="#fff"/></g>`
    : '';
  return composeSymbol({
    autoCel: false,
    texture: { seed: 28 + tier.length, mottle: 0.1, grain: 0.25 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: tier === 'platinum' ? softGlow(CX, CY, 80, C.voltLight, 0.35) : tier === 'gold' ? softGlow(CX, CY, 80, C.gold, 0.25) : '',
    layers: [
      { fills: edge.fills, lines: edge.line('stroke-width="4"') },
      { fills: rim.fills, lines: rim.line('stroke-width="4.5"') },
      { fills: step.fills, lines: step.line('stroke-width="3.6"') },
      { fills: face.fills, lines: '' },
    ],
    top: `${bolts}${dots}
      ${shine(arcPts(86, 195, 250), 4.2, 0.75, hi === C.silverLight ? '#fff' : mix(hi, '#ffffff', 0.5))}
      ${shine(arcPts(86, 20, 55, 3), 2.4, 0.45, mix(hi, '#ffffff', 0.4))}
      ${shine(arcPts(57, 205, 240, 3), 2, 0.4, mix(hi, '#ffffff', 0.4))}
      ${sheen}${sweep}${gem}${glintArt}`,
  });
}

/** Fare Coin (subway token) in its value metal. Keep the face (COIN_FACE) plain: the game prints the value there. */
export const fareCoin = (tier: CoinTier): string => coinArt(tier, false);
/** Glint frame for a Fare Coin: a sweep across the metal and a star flare on the rim. */
export const fareCoinShine = (tier: CoinTier): string => coinArt(tier, true);

/* ------------------------------------------------------------------ */
/* LOCO: Locomotive (front 3/4)                                        */
/* ------------------------------------------------------------------ */
/** Headlamp centre in the 256 box. */
export const LOCO_LAMP = { x: 104, y: 112 } as const;
const FRONT = 'M34 198 L34 114 C34 66 64 36 104 36 C144 36 174 66 174 114 L174 198 C140 208 68 208 34 198 Z';
const SIDE = 'M146 46 C178 40 212 46 244 62 L244 188 L172 204 L146 204 Z';
const PILOT = 'M30 200 L178 200 L198 238 L10 238 Z';
const WIN_L = 'M50 74 C56 62 72 56 96 54 L98 88 L48 92 Z';
const WIN_R = 'M110 54 C134 56 150 62 156 74 L158 92 L108 88 Z';

function locoArt(lit: boolean, golden: boolean): string {
  const BODY = golden ? GOLD_TONES : celTones(C.maroon, C.maroonDeep, C.maroonLight);
  const TRIM = golden ? { base: C.platinumLight, shade: C.platinum, light: '#ffffff' } : { base: C.cream, shade: mix(C.cream, C.tileDeep, 0.6), light: '#ffffff' };
  const BRASS = golden ? celTones(C.platinum, C.platinumDeep, C.platinumLight) : GOLD_TONES;
  const IRON = celTones(C.iron, C.ironDeep, C.ironLight);
  const L = LOCO_LAMP;
  // side body receding to the right: windows, livery stripe, rivets
  const side = celForm(SIDE, {
    base: mix(BODY.base, BODY.shade, 0.35),
    shade: mix(BODY.shade, C.ink, 0.25),
    light: BODY.base,
    cut: [-6, -10],
    band: [3, 4],
    hatch: BODY.hatch,
    seed: 121,
    inner: `<path d="M146 142 L244 136 L244 150 L146 158 Z" fill="${TRIM.shade}"/>
      <path d="M146 166 L244 158 L244 163 L146 171 Z" fill="${TRIM.shade}" opacity=".9"/>
      <path d="M150 196 L244 182 L244 190 L150 206 Z" fill="${mix(BODY.shade, C.ink, 0.4)}"/>`,
  });
  const sideWins = [
    'M184 72 L210 76 L210 102 L184 100 Z',
    'M220 78 L238 82 L238 106 L220 104 Z',
  ]
    .map((d) => `<path d="${d}" fill="${lit ? C.amber : mix(C.voltNight, C.tunnel, 0.3)}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`)
    .join('');
  const wheels = [
    [196, 206, 15],
    [232, 198, 13],
  ]
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r * 0.8}" ry="${r}" fill="${C.ironDeep}" stroke="${C.ink}" stroke-width="4"/><ellipse cx="${x - 2}" cy="${y - 2}" rx="${r * 0.35}" ry="${r * 0.45}" fill="${golden ? C.goldDeep : C.maroonDeep}"/>`)
    .join('');
  // the front: a rounded streamliner nose, cream stripe wrapping round, whiskers to the grille
  const front = celForm(FRONT, {
    ...BODY,
    cut: [-12, -10],
    shrink: 0.98,
    band: [4.5, 4.5],
    hatch: BODY.hatch,
    seed: 122,
    inner: `<path d="M34 142 Q104 152 174 142 L174 158 Q104 168 34 158 Z" fill="${TRIM.base}"/>
      <path d="M34 156 Q104 166 174 156 L174 158 Q104 168 34 158 Z" fill="${TRIM.shade}"/>
      <path d="M34 174 Q60 178 76 178 L76 184 Q58 184 34 180 Z M174 174 Q148 178 132 178 L132 184 Q150 184 174 180 Z" fill="${TRIM.base}"/>
      <path d="M38 190 Q104 202 170 190" fill="none" stroke="${BODY.shade}" stroke-width="3"/>
      <path d="M150 50 Q168 68 172 96" fill="none" stroke="${BODY.light}" stroke-width="3" opacity=".6"/>`,
  });
  const frontLines = `<path d="M34 142 Q104 152 174 142 M34 158 Q104 168 34 158 M174 158 Q104 168 34 158" stroke-width="3"/>
    <path d="M34 174 Q60 178 76 178 L76 184 Q58 184 34 180 M174 174 Q148 178 132 178 L132 184 Q150 184 174 180" stroke-width="2.6"/>`;
  // windshield (two panes) with a brass number board above
  const glassT = lit ? { base: mix(C.amber, C.amberDeep, 0.3), shade: C.amberDeep, light: C.amberLight } : { base: mix(C.voltNight, C.voltDeep, 0.35), shade: mix(C.voltNight, C.tunnel, 0.4), light: mix(C.voltDeep, C.volt, 0.35) };
  const winL = celForm(WIN_L, { ...glassT, cut: [6, 7], band: [-2, -2], seed: 123, inner: `<path d="M58 84 L84 58 L92 58 L64 86 Z" fill="#fff" opacity=".35"/>` });
  const winR = celForm(WIN_R, { ...glassT, cut: [6, 7], band: [-2, -2], seed: 124, inner: `<path d="M118 84 L140 60 L146 62 L124 86 Z" fill="#fff" opacity=".3"/>` });
  const board = celForm('M82 40 C92 38 116 38 126 40 L124 50 L84 50 Z', { ...BRASS, cut: [-4, -3], seed: 125 });
  // brass grille under the lamp
  const grille = celForm('M78 172 C78 166 82 164 90 164 L118 164 C126 164 130 166 130 172 L130 196 C118 199 90 199 78 196 Z', {
    ...BRASS,
    cut: [-5, -4],
    band: [2, 2],
    seed: 126,
    inner: [88, 98, 108, 118].map((x) => `<path d="M${x} 168 L${x} 195" stroke="${mix(BRASS.shade, C.ink, 0.45)}" stroke-width="5" stroke-linecap="round"/><path d="M${x - 2.5} 169 L${x - 2.5} 193" stroke="${BRASS.light}" stroke-width="1.4"/>`).join(''),
  });
  // headlamp: brass bezel, glass; lit = blazing with a beam
  const bezel = celForm(circ(L.x, L.y, 27), { ...BRASS, cut: [-6, -7], band: [3, 3], seed: 127 });
  const lens0 = lit
    ? `${softGlow(L.x, L.y, 20, C.fireHot, 0.9)}<circle cx="${L.x}" cy="${L.y}" r="19" fill="${C.fireCore}"/><circle cx="${L.x}" cy="${L.y}" r="11" fill="#fff"/>`
    : `<circle cx="${L.x}" cy="${L.y}" r="19" fill="${mix(C.amberLight, C.cream, 0.4)}"/><path d="M${L.x + 19} ${L.y} A19 19 0 0 1 ${L.x - 13} ${L.y + 14} A22 22 0 0 0 ${L.x + 19} ${L.y} Z" fill="${C.amber}" opacity=".7"/>
       <circle cx="${L.x}" cy="${L.y}" r="7" fill="${C.amber}" opacity=".5"/>`;
  const lamp = `${lens0}<circle cx="${L.x}" cy="${L.y}" r="19" fill="none" stroke="${C.ink}" stroke-width="3.4"/>
    <path d="${lens([[L.x - 12, L.y - 4], [L.x - 8, L.y - 11], [L.x - 1, L.y - 14]], 2.6)}" fill="#fff" opacity=".9"/>`;
  const beamId = nextId('bm');
  const beam = lit
    ? `<linearGradient id="${beamId}" gradientUnits="userSpaceOnUse" x1="${L.x}" y1="${L.y}" x2="0" y2="${L.y + 20}"><stop offset="0" stop-color="${C.fireCore}" stop-opacity=".85"/><stop offset=".55" stop-color="${C.amberLight}" stop-opacity=".35"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
       <filter id="${beamId}b" filterUnits="userSpaceOnUse" x="-20" y="0" width="276" height="256"><feGaussianBlur stdDeviation="5"/></filter>
       <path d="M${L.x} ${L.y - 12} L4 ${L.y - 44} L4 ${L.y + 72} L${L.x} ${L.y + 12} Z" fill="url(#${beamId})" filter="url(#${beamId}b)"/>
       ${softGlow(L.x, L.y, 40, C.amber, 0.75)}
       <path d="${star(L.x, L.y, 9, 44, 8, -90)}" fill="${C.fireCore}" opacity=".9"/>
       <path d="${star(L.x, L.y, 6, 28, 8, -67.5)}" fill="#fff" opacity=".85"/>`
    : '';
  // cowcatcher: iron slats spreading to the rails, a bumper beam on top
  const slats = [-62, -40, -18, 4, 26, 48, 70].map((dx) => `M${104 + dx} 204 L${104 + dx * 1.27} 236`).join(' ');
  const pilot = celForm(PILOT, {
    ...IRON,
    cut: [-8, -6],
    band: [3, 2],
    hatch: IRON.hatch,
    seed: 128,
    inner: `<path d="${slats}" stroke="${mix(C.ironDeep, C.ink, 0.4)}" stroke-width="5"/><path d="${slats}" stroke="${C.ironLight}" stroke-width="1.6" transform="translate(-2.4 0)"/>`,
  });
  const bumper = celForm('M24 194 L184 194 L186 206 L22 206 Z', { ...BRASS, cut: [-6, -3], band: [2, 1.5], seed: 129 });
  // roof horns
  const horn = (x: number, flip: number) => `<path d="M${x} 44 L${x + flip * 24} 34 L${x + flip * 26} 44 L${x + flip * 4} 50 Z" fill="${BRASS.base}" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/><ellipse cx="${x + flip * 25}" cy="39" rx="3" ry="6" fill="${BRASS.shade}" stroke="${C.ink}" stroke-width="2.6"/>`;
  const rivets = [
    ...[46, 62, 146, 162].map((x) => [x, 132] as V),
    ...[52, 70, 138, 156].map((x) => [x, 102] as V),
    ...[160, 184, 208, 232].map((x, i) => [x, 124 - i * 1.4] as V),
  ]
    .map(([x, y]) => rivet(x, y, 3, BRASS.light))
    .join('');
  const sparks = golden ? `${sparkle(40, 40, 13, '#fff')}${sparkle(226, 36, 9, C.goldLight)}${sparkle(214, 226, 8, '#fff', 0.9)}${sparkle(160, 88, 6, '#fff')}` : '';
  return composeSymbol({
    autoCel: false,
    texture: { seed: 34 + (golden ? 1 : 0), mottle: 0.55 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: golden ? softGlow(128, 128, 84, C.gold, 0.55) : lit ? softGlow(L.x, L.y, 70, C.amber, 0.45) : '',
    layers: [
      { fills: wheels, lines: '' },
      { fills: side.fills, lines: `${side.line()}<path d="M146 142 L244 136 M146 158 L244 150" stroke-width="2.6"/>` },
      { fills: `${front.fills}`, lines: `${front.line()}${frontLines}` },
      { fills: winL.fills + winR.fills + board.fills, lines: `${winL.line('stroke-width="5"')}${winR.line('stroke-width="5"')}${board.line('stroke-width="3.6"')}` },
      { fills: grille.fills + bezel.fills, lines: `${grille.line('stroke-width="5"')}${bezel.line('stroke-width="5.5"')}` },
      { fills: pilot.fills, lines: `${pilot.line('stroke-width="6"')}` },
      { fills: bumper.fills, lines: bumper.line('stroke-width="5"') },
    ],
    top: `${sideWins}${horn(92, -1)}${horn(116, 1)}
      ${rivets}
      ${lamp}
      ${shine([[42, 116], [48, 82], [70, 52], [96, 42]], 4.4, golden ? 0.85 : 0.6)}
      ${shine([[150, 50], [196, 52], [236, 66]], 2.4, 0.5)}
      ${shine([[30, 197], [100, 196], [170, 196]], 1.6, 0.6, '#fff')}
      ${beam}${sparks}`,
  });
}

/** Locomotive (reel 1 only). `lit` = headlamp blazing with a short beam; `golden` = the Last Train's Golden Locomotive. */
export const locoFront = (lit = false, golden = false): string => locoArt(lit, golden);

/* ------------------------------------------------------------------ */
/* SWITCH: Junction (switch stand)                                     */
/* ------------------------------------------------------------------ */
const DISC: V = [128, 78];
const DISC_R = 56;
const PIVOT: V = [168, 200];

function junctionArt(thrown: boolean): string {
  const IRON = celTones(C.iron, C.ironDeep, C.ironLight);
  const face = thrown ? celTones(C.emerald, C.emeraldDeep, C.emeraldLight) : celTones(C.crimson, C.crimsonDeep, C.crimsonLight);
  const base = celForm('M44 204 L212 204 L220 236 L36 236 Z', {
    ...IRON,
    cut: [-10, -6],
    band: [3, 2.5],
    hatch: IRON.hatch,
    seed: 131,
    inner: `<path d="M40 222 L216 222" stroke="${IRON.shade}" stroke-width="3"/><path d="M48 208 L208 208" stroke="${C.ironLight}" stroke-width="2" opacity=".7"/>`,
  });
  const post = celForm('M114 212 L142 212 L137 120 L119 120 Z', {
    ...IRON,
    cut: [-6, -2],
    band: [2.5, 0.5],
    hatch: IRON.hatch,
    seed: 132,
    inner: `<path d="M121 128 L118 206" stroke="${C.ironLight}" stroke-width="2.4" opacity=".8"/>`,
  });
  const collar = celForm('M108 124 L148 124 L148 138 L108 138 Z M110 196 L146 196 L150 212 L106 212 Z', { ...GOLD_TONES, cut: [-6, -3], band: [2, 1.5], seed: 133 });
  // quadrant: the notched brass sector the lever locks into
  const quad = celForm('M168 200 L150 176 A30 30 0 0 1 198 184 Z', {
    ...GOLD_TONES,
    cut: [-5, -4],
    seed: 134,
    inner: [0, 1, 2, 3].map((k) => { const a = ((-128 + k * 20) * Math.PI) / 180; return `<circle cx="${f1(168 + Math.cos(a) * 25)}" cy="${f1(200 + Math.sin(a) * 25)}" r="2.6" fill="${C.goldDeep}"/>`; }).join(''),
  });
  // lever: upright (idle) or pulled over to the right (thrown)
  const ang = thrown ? 62 : 14;
  const lt = `translate(${PIVOT[0]} ${PIVOT[1]}) rotate(${ang})`;
  const lever = celForm('M-8 4 L8 4 L6 -82 L-6 -82 Z', { ...IRON, t: lt, cut: [-3, -1], seed: 135 });
  const tipQ = turn([PIVOT[0], PIVOT[1] - 88], ang, PIVOT);
  const grip = celForm(circ(tipQ[0], tipQ[1], 13), { ...celTones(C.crimson, C.crimsonDeep, C.crimsonLight), cut: [-4, -4], band: [2, 2], seed: 136 });
  // target disc: brass bezel ring, coloured enamel face with a double-headed arrow
  const ring = celForm(circ(DISC[0], DISC[1], DISC_R), { ...GOLD_TONES, cut: [-8, -9], band: [3, 3], hatch: GOLD_TONES.hatch, seed: 137 });
  const discFace = celForm(circ(DISC[0], DISC[1], DISC_R - 10), {
    ...face,
    cut: [-9, -10],
    band: [3.5, 3.5],
    hatch: thrown ? undefined : face.hatch,
    seed: 138,
    inner: thrown ? softGlow(DISC[0] - 6, DISC[1] - 6, 34, C.emeraldLight, 0.9) : '',
  });
  const [ax, ay] = DISC;
  const arrow = `M${ax} ${ay - 36} L${ax + 19} ${ay - 15} L${ax + 8} ${ay - 15} L${ax + 8} ${ay + 15} L${ax + 19} ${ay + 15} L${ax} ${ay + 36} L${ax - 19} ${ay + 15} L${ax - 8} ${ay + 15} L${ax - 8} ${ay - 15} L${ax - 19} ${ay - 15} Z`;
  const arrowArt = `<path d="${arrow}" fill="${thrown ? C.white : C.cream}" stroke="${C.ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M${ax + 8} ${ay - 13} L${ax + 8} ${ay + 15} L${ax + 17} ${ay + 15} L${ax} ${ay + 33} L${ax + 2} ${ay + 17} L${ax + 4} ${ay - 13} Z" fill="${thrown ? C.emeraldLight : C.tileDeep}" opacity=".55"/>`;
  const boltHeads = [0, 90, 180, 270]
    .map((a) => {
      const r = (a * Math.PI) / 180 + Math.PI / 4;
      return rivet(DISC[0] + Math.cos(r) * (DISC_R - 5), DISC[1] + Math.sin(r) * (DISC_R - 5), 3.2);
    })
    .join('');
  const baseBolts = [58, 92, 164, 198].map((x) => rivet(x, 215, 3.6, C.ironLight)).join('');
  const rays = thrown
    ? Array.from({ length: 10 }, (_, i) => {
        const a = ((i * 36 + 9) * Math.PI) / 180;
        const q = (ang2: number, r: number) => `${f1(DISC[0] + Math.cos(ang2) * r)} ${f1(DISC[1] + Math.sin(ang2) * r)}`;
        return `<path d="M${q(a - 0.06, 62)} L${q(a, 94)} L${q(a + 0.06, 62)} Z" fill="${C.emeraldLight}" opacity=".7"/>`;
      }).join('')
    : '';
  return composeSymbol({
    autoCel: false,
    texture: { seed: 38, mottle: 0.55 },
    contour: 0.8,
    inkShift: [1, 1.2],
    under: thrown ? `${softGlow(DISC[0], DISC[1], 80, C.emeraldLight, 0.75)}${rays}` : '',
    layers: [
      { fills: base.fills, lines: base.line() },
      { fills: post.fills + quad.fills, lines: `${post.line('stroke-width="6"')}${quad.line('stroke-width="4.5"')}` },
      { fills: collar.fills, lines: collar.line('stroke-width="4.5"') },
      { fills: lever.fills + grip.fills, lines: `${lever.line('stroke-width="5"')}${grip.line('stroke-width="5"')}` },
      { fills: ring.fills, lines: ring.line() },
      { fills: discFace.fills, lines: discFace.line('stroke-width="4.5"') },
    ],
    top: `${baseBolts}
      ${rivet(PIVOT[0], PIVOT[1], 6, C.goldLight)}
      ${boltHeads}
      ${thrown ? glowOf(`<path d="${arrow}" fill="${C.emeraldLight}"/>`, 5, 0.9) : ''}
      ${arrowArt}
      ${shine([[80, 60], [92, 40], [112, 28]], 3.6, thrown ? 0.85 : 0.65)}
      ${shine([[84, 90], [88, 70], [100, 54]], 2.4, 0.4)}
      ${thrown ? `${sparkle(196, 30, 10, C.white)}${sparkle(56, 136, 7, C.emeraldLight)}` : ''}`,
  });
}

/** Junction (switch stand). `thrown` = lever pulled over, the target turns green and glows. */
export const junction = (thrown = false): string => junctionArt(thrown);
