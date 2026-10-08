import { C, nextId, mix, rng } from './kit';

/**
 * Particle and effect art for Third Rail Riches (docs/ART.md): steam puffs, electric sparks and
 * arcs, gold glints, punched-ticket confetti, signal lamps, the headlight beam. Small viewBoxes,
 * rasterised once at particle size. Inked like the symbols where the sprite is a "thing" (puff,
 * spark, star); un-inked and soft where it is light (ember, streak, shine, beam).
 */

const f1 = (n: number) => n.toFixed(1);
const svg = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

/** Lumpy scalloped cloud outline around (cx, cy). */
function cloud(seed: number, cx: number, cy: number, R: number, n = 9): string {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const rr = R * (0.8 + r() * 0.3);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.84]);
  }
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = mx - cx;
    const dy = my - cy;
    const len = Math.hypot(dx, dy) || 1;
    const bulge = R * (0.36 + r() * 0.2);
    d += ` Q${f1(mx + (dx / len) * bulge)} ${f1(my + (dy / len) * bulge)} ${f1(b[0])} ${f1(b[1])}`;
  }
  return `${d} Z`;
}

/** Jagged polyline from a to b (electric arc). */
function zig(a: [number, number], b: [number, number], seed: number, n: number, amp: number): string {
  const r = rng(seed);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${f1(a[0])} ${f1(a[1])}`;
  let sgn = 1;
  for (let i = 1; i < n; i++) {
    const t = (i + (r() - 0.5) * 0.75) / n;
    sgn = r() < 0.75 ? -sgn : sgn;
    const o = sgn * amp * (0.2 + r() * 1.0);
    d += ` L${f1(a[0] + dx * t + nx * o)} ${f1(a[1] + dy * t + ny * o)}`;
  }
  return `${d} L${f1(b[0])} ${f1(b[1])}`;
}

/** Blur filter def + id. */
function blurDef(sd: number, pad = 60): [string, string] {
  const id = nextId('fb');
  return [`<filter id="${id}" x="-${pad}%" y="-${pad}%" width="${100 + pad * 2}%" height="${100 + pad * 2}%"><feGaussianBlur stdDeviation="${sd}"/></filter>`, id];
}

/** Cartoon steam puff: a lumpy white cloud with a cool cel belly and a warm top light. 128 box. */
export function puff(): string {
  const id = nextId('pf');
  const d = cloud(4, 64, 66, 38, 8);
  return svg(
    128,
    128,
    `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>
  <path d="${d}" fill="${C.white}"/>
  <g clip-path="url(#${id})">
    <path d="${d}" fill="${mix(C.g1, C.steel, 0.35)}" transform="translate(7 9)"/>
    <path d="${d}" fill="${C.white}" transform="translate(-4 -6)"/>
    <ellipse cx="74" cy="112" rx="58" ry="22" fill="${mix(C.steel, C.g2, 0.4)}" opacity=".75"/>
    <path d="M36 62 Q42 46 58 44" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>
  </g>
  <path d="M46 72 Q52 64 62 66 M76 52 Q84 46 92 52" stroke="${mix(C.g2, C.steel, 0.3)}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>`,
  );
}

/**
 * Billowing smoke / steam cloud: neutral-grey so a tint turns it into tunnel soot, brake dust or
 * steam. `variant` changes the outline. 128 box.
 */
export function smoke(variant = 0): string {
  const id = nextId('sm');
  const d = cloud(variant + 3, 64, 66, 40, 9);
  return svg(
    128,
    128,
    `<defs><clipPath id="${id}"><path d="${d}"/></clipPath></defs>
  <path d="${d}" fill="${mix(C.g1, C.white, 0.5)}"/>
  <g clip-path="url(#${id})">
    <ellipse cx="74" cy="106" rx="64" ry="28" fill="${C.g2}" opacity=".85"/>
    <ellipse cx="50" cy="44" rx="34" ry="20" fill="#fff" opacity=".9"/>
    <path d="M34 60 Q44 46 60 50 M70 40 Q84 32 96 42" stroke="${C.g2}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  </g>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>`,
  );
}

/** Glint: an inked four-point star with a white-hot core (gold by default). 64 box. */
export function twinkle(color: string = C.gold): string {
  return svg(
    64,
    64,
    `<path d="M32 2 C35 22 42 29 62 32 C42 35 35 42 32 62 C29 42 22 35 2 32 C22 29 29 22 32 2 Z" fill="${color}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M32 14 C33.6 26 38 30.4 50 32 C38 33.6 33.6 38 32 50 C30.4 38 26 33.6 14 32 C26 30.4 30.4 26 32 14 Z" fill="${mix(color, '#ffffff', 0.6)}"/>
  <circle cx="32" cy="32" r="4" fill="#fff"/>`,
  );
}

/** Ember / glow dot (drawn additively): electric blue by default. 32 box. */
export function ember(color: string = C.volt): string {
  const g = nextId('em');
  return svg(
    32,
    32,
    `<defs><radialGradient id="${g}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="${color}"/><stop offset=".65" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
  <circle cx="16" cy="16" r="16" fill="url(#${g})"/>`,
  );
}

/** Music note (Casey's whistle, the station band): an inked brass eighth-note pair. 64 box. */
export function note(): string {
  return svg(
    64,
    64,
    `<path d="M22 46 L22 12 L52 6 L52 40" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 12 L52 6 L52 14 L22 20 Z" fill="${C.ink}"/>
  <path d="M22 46 L22 12 L52 6 L52 40" fill="none" stroke="${C.gold}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="15" cy="48" rx="10" ry="7.5" transform="rotate(-22 15 48)" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.2"/>
  <ellipse cx="45" cy="42" rx="10" ry="7.5" transform="rotate(-22 45 42)" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.2"/>
  <path d="M9 46 Q12 42 17 42 M39 40 Q42 36 47 36" stroke="${C.goldLight}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M10 52 Q16 55 22 51 M40 46 Q46 49 52 45" stroke="${C.goldDeep}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`,
  );
}

/** Electric spark: a jagged volt-blue star with a white-hot core and a soft blue halo. 64 box. */
export function spark(): string {
  const g = nextId('sk');
  const starD = 'M32 4 L36 22 L54 12 L42 28 L60 34 L41 38 L48 56 L33 43 L24 60 L24 41 L6 44 L20 31 L8 16 L26 22 Z';
  const core = 'M32 18 L34.6 27 L44 24 L37.5 31 L45 36 L35.5 36.5 L37 46 L31.5 39 L25 45 L27.5 36 L18 34 L26.5 30 L22 22 L29.5 26 Z';
  return svg(
    64,
    64,
    `<defs><radialGradient id="${g}" cx="50%" cy="52%" r="50%"><stop offset="0" stop-color="${C.voltLight}" stop-opacity=".9"/><stop offset="1" stop-color="${C.volt}" stop-opacity="0"/></radialGradient></defs>
  <circle cx="32" cy="33" r="30" fill="url(#${g})"/>
  <path d="${starD}" fill="${C.volt}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="${core}" fill="${C.voltLight}"/>
  <circle cx="32" cy="33" r="4.2" fill="${C.voltCore}"/>`,
  );
}

/**
 * A jagged lightning arc segment, horizontal, end to end across the box (stretch it between two
 * points). Blue glow, ink casing, volt body, white-hot core. `seed` changes the zig-zag. 256x64.
 */
export function arc(seed = 1): string {
  const d = zig([8, 32], [248, 32], seed + 9, 10, 12);
  const d2 = zig([70, 30], [120, 12], seed + 21, 4, 5);
  const d3 = zig([160, 34], [200, 54], seed + 33, 3, 4);
  const [bd, bid] = blurDef(5);
  return svg(
    256,
    64,
    `<defs>${bd}</defs>
  <g filter="url(#${bid})" opacity=".85"><path d="${d}" fill="none" stroke="${C.volt}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></g>
  <path d="${d2} ${d3}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d2} ${d3}" fill="none" stroke="${C.voltLight}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${C.volt}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${C.voltCore}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

/** Hot electric streak (drawn additively, stretched along its velocity). 64x16. */
export function streak(): string {
  const g = nextId('st');
  return svg(
    64,
    16,
    `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.voltDeep}" stop-opacity="0"/><stop offset=".55" stop-color="${C.volt}"/><stop offset="1" stop-color="${C.voltCore}"/></linearGradient></defs>
  <path d="M2 8 Q40 3 62 8 Q40 13 2 8 Z" fill="url(#${g})"/>
  <path d="M30 8 Q48 6.4 60 8 Q48 9.6 30 8 Z" fill="#fff"/>`,
  );
}

/** Glint on a shiny object: a thin white four-point flare with a soft core (drawn additively). 64 box. */
export function shine(): string {
  const g = nextId('sh');
  return svg(
    64,
    64,
    `<defs><radialGradient id="${g}"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${C.amberLight}" stop-opacity=".5"/><stop offset="1" stop-color="${C.amberLight}" stop-opacity="0"/></radialGradient></defs>
  <circle cx="32" cy="32" r="16" fill="url(#${g})"/>
  <path d="M32 1 Q33.6 30.4 63 32 Q33.6 33.6 32 63 Q30.4 33.6 1 32 Q30.4 30.4 32 1 Z" fill="#fff"/>
  <path d="M32 18 Q32.8 31.2 46 32 Q32.8 32.8 32 46 Q31.2 32.8 18 32 Q31.2 31.2 32 18 Z" fill="#fff" transform="rotate(45 32 32)" opacity=".7"/>`,
  );
}

/** Gold coin glint: a warm four-point star with a tiny ring of sparks (collecting a Fare Coin). 64 box. */
export function coinSpark(): string {
  const [bd, bid] = blurDef(4);
  return svg(
    64,
    64,
    `<defs>${bd}</defs>
  <circle cx="32" cy="32" r="14" fill="${C.gold}" opacity=".8" filter="url(#${bid})"/>
  <path d="M32 3 C34 24 40 30 61 32 C40 34 34 40 32 61 C30 40 24 34 3 32 C24 30 30 24 32 3 Z" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M32 15 C33 27 37 31 49 32 C37 33 33 37 32 49 C31 37 27 33 15 32 C27 31 31 27 32 15 Z" fill="#fff"/>
  <path d="M14 14 l2 4 l4 2 l-4 2 l-2 4 l-2 -4 l-4 -2 l4 -2 Z M50 46 l1.6 3 l3 1.6 l-3 1.6 l-1.6 3 l-1.6 -3 l-3 -1.6 l3 -1.6 Z" fill="${C.goldLight}"/>`,
  );
}

/**
 * Electric burst star (a big win pop, a train smash): a ragged volt star with a white-hot heart,
 * inked. 256 box.
 */
export function blastStar(): string {
  const id = nextId('bs');
  const r = rng(11);
  const n = 13;
  const ring = (ro: number, ri: number, jo: number, ji: number, rot: number) => {
    const p: string[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = a0 + Math.PI / n;
      const R = ro + (r() - 0.5) * jo;
      const Ri = ri + (r() - 0.5) * ji;
      p.push(`${f1(128 + Math.cos(a0) * R)} ${f1(128 + Math.sin(a0) * R)}`);
      p.push(`${f1(128 + Math.cos(a1) * Ri)} ${f1(128 + Math.sin(a1) * Ri)}`);
    }
    return `M${p.join(' L')} Z`;
  };
  const outer = ring(118, 72, 18, 12, -0.2);
  const mid = ring(88, 54, 14, 10, 0.05);
  const inner = ring(56, 36, 10, 8, -0.1);
  return svg(
    256,
    256,
    `<defs><clipPath id="${id}"><path d="${outer}"/></clipPath></defs>
  <path d="${outer}" fill="${C.volt}"/>
  <g clip-path="url(#${id})"><path d="M40 190 Q150 230 236 120 L256 256 L0 256 Z" fill="${C.voltDeep}" opacity=".7"/></g>
  <path d="${outer}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>
  <path d="${mid}" fill="${C.voltLight}"/>
  <path d="${inner}" fill="${C.voltCore}"/>
  <circle cx="122" cy="122" r="22" fill="#fff"/>
  <path d="M84 98 Q96 78 118 74" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>`,
  );
}

/** Shockwave: a broken ring of electric speed-strokes, inked, growing out of a hit. 256 box. */
export function shockRing(): string {
  const r = rng(5);
  const n = 11;
  const arcs: string[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + r() * 0.08;
    const a1 = a0 + ((Math.PI * 2) / n) * (0.62 + r() * 0.22);
    const R = 108 + (r() - 0.5) * 6;
    arcs.push(`M${f1(128 + Math.cos(a0) * R)} ${f1(128 + Math.sin(a0) * R)} A${f1(R)} ${f1(R)} 0 0 1 ${f1(128 + Math.cos(a1) * R)} ${f1(128 + Math.sin(a1) * R)}`);
  }
  const d = arcs.join(' ');
  return svg(
    256,
    256,
    `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="17" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${C.volt}" stroke-width="10" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${C.voltCore}" stroke-width="4" stroke-linecap="round"/>`,
  );
}

/**
 * Punched-paper confetti: little ticket clippings (gold, cream, crimson, emerald), some with a
 * punched hole. `variant` 0..5 picks shape and colour. 32 box.
 */
export function ticketConfetti(variant = 0): string {
  const cols: [string, string][] = [
    [C.gold, C.goldDeep],
    [C.cream, C.tileDeep],
    [C.crimson, C.crimsonDeep],
    [C.emeraldLight, C.emerald],
    [C.goldLight, C.gold],
    [C.amber, C.amberDeep],
  ];
  const [fill, edge] = cols[variant % cols.length];
  const shapes = [
    'M5 9 L27 6 L28 22 L6 25 Z',
    'M16 3 A13 13 0 1 1 15.9 3 Z',
    'M4 12 L28 8 L28 20 L4 24 Z',
    'M16 4 L19 12 L28 12 L21 18 L24 27 L16 21 L8 27 L11 18 L4 12 L13 12 Z',
    'M6 6 L26 6 L26 26 L6 26 Z',
    'M5 10 Q16 4 27 10 L27 22 Q16 16 5 22 Z',
  ];
  const d = shapes[variant % shapes.length];
  const hole = variant % 3 === 0 ? `<circle cx="16" cy="16" r="3.2" fill="${C.ink}" opacity=".8"/>` : variant % 3 === 1 ? `<path d="M10 16 L22 15" stroke="${edge}" stroke-width="1.6" stroke-dasharray="2 2"/>` : '';
  return svg(
    32,
    32,
    `<path d="${d}" fill="${fill}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="${d}" fill="${edge}" opacity=".5" transform="translate(16 16) scale(.62) translate(-13 -13)"/>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>
  ${hole}`,
  );
}

/**
 * Headlight beam: a soft, wide, warm cone. The source is at the left middle (0, 64), it opens to
 * the right. Draw additively in front of the locomotive's lamp. 512x128.
 */
export function headlightBeam(): string {
  const g = nextId('hb');
  const [bd, bid] = blurDef(7, 20);
  return svg(
    512,
    128,
    `<defs>${bd}
    <linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.fireCore}" stop-opacity=".95"/><stop offset=".25" stop-color="${C.amberLight}" stop-opacity=".55"/><stop offset=".7" stop-color="${C.amber}" stop-opacity=".18"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${g}c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="${C.amberLight}" stop-opacity=".25"/><stop offset="1" stop-color="${C.amberLight}" stop-opacity="0"/></linearGradient></defs>
  <g filter="url(#${bid})">
    <path d="M8 56 L500 12 L500 116 L8 72 Z" fill="url(#${g})"/>
    <path d="M8 60 L420 40 L420 88 L8 68 Z" fill="url(#${g}c)"/>
  </g>`,
  );
}

/** A glowing round signal lamp (red / green / amber): hooded iron rim, glass, halo. 64 box. */
export function signalLight(color: 'red' | 'green' | 'amber' = 'red'): string {
  const [hi, mid, lo] = color === 'red' ? [C.crimsonLight, C.crimson, C.crimsonDeep] : color === 'green' ? [C.emeraldLight, C.emerald, C.emeraldDeep] : [C.amberLight, C.amber, C.amberDeep];
  const [bd, bid] = blurDef(6, 40);
  return svg(
    64,
    64,
    `<defs>${bd}</defs>
  <circle cx="32" cy="32" r="22" fill="${hi}" opacity=".85" filter="url(#${bid})"/>
  <circle cx="32" cy="32" r="17" fill="${C.iron}" stroke="${C.ink}" stroke-width="3"/>
  <circle cx="32" cy="32" r="12.5" fill="${mid}" stroke="${C.ink}" stroke-width="2.2"/>
  <circle cx="33.5" cy="33.5" r="9" fill="${lo}" opacity=".35"/>
  <circle cx="30" cy="30" r="7" fill="${hi}"/>
  <circle cx="28" cy="28" r="3" fill="#fff"/>
  <path d="M16 26 Q20 15 32 13 Q44 15 48 26" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/>
  <path d="M16 26 Q20 15 32 13 Q44 15 48 26" fill="none" stroke="${C.ironLight}" stroke-width="3" stroke-linecap="round"/>`,
  );
}

/**
 * Level-up medal (POWER level: Local, Express, Limited, Bullet, Lightning): a brass medallion with
 * an emerald enamel face (the game prints the multiplier on it), a winged-wheel crest across the
 * top. 128 box.
 */
export function chainMedal(): string {
  const g = nextId('cm');
  const beads = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `<circle cx="${f1(64 + Math.cos(a) * 44)}" cy="${f1(70 + Math.sin(a) * 44)}" r="2.2" fill="${C.goldDeep}"/>`;
  }).join('');
  const wing = (s: number) =>
    [0, 1, 2]
      .map((k) => `<path d="M${64 + s * 10} ${18 + k * 5} Q${64 + s * (26 - k * 2)} ${10 + k * 5} ${64 + s * (44 - k * 8)} ${12 + k * 6} Q${64 + s * 26} ${20 + k * 5} ${64 + s * 10} ${24 + k * 5} Z" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>`)
      .join('');
  return svg(
    128,
    128,
    `<defs>
    <linearGradient id="${g}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".45" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
    <radialGradient id="${g}f" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="${C.emeraldLight}"/><stop offset=".6" stop-color="${C.emerald}"/><stop offset="1" stop-color="${C.emeraldDeep}"/></radialGradient>
    <filter id="${g}d" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="4" result="o"/><feFlood flood-color="#000" flood-opacity=".5"/><feComposite in2="o" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g filter="url(#${g}d)">
    <circle cx="64" cy="70" r="50" fill="url(#${g}r)" stroke="${C.ink}" stroke-width="5"/>
    ${beads}
    <circle cx="64" cy="70" r="37" fill="url(#${g}f)" stroke="${C.ink}" stroke-width="4"/>
    <path d="M36 58 Q44 40 64 36" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".45"/>
    ${wing(-1)}${wing(1)}
    <circle cx="64" cy="20" r="11" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/>
    <path d="M64 11 L64 29 M55 20 L73 20 M57.6 13.6 L70.4 26.4 M70.4 13.6 L57.6 26.4" stroke="${C.goldDeep}" stroke-width="2"/>
    <circle cx="64" cy="20" r="3.6" fill="${C.maroon}" stroke="${C.ink}" stroke-width="1.6"/>
  </g>`,
  );
}
