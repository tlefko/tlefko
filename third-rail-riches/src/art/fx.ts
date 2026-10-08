import { C, nextId } from './kit';

/**
 * Particle art (see docs/ART.md): gunpowder smoke puffs, gold glints, sparks, parrot feathers.
 * Small viewBoxes, rasterised once at particle size.
 */

/** Cartoon gunpowder smoke ("poof"): a lumpy inked cloud, cel-shaded, soft top light. 128 box. */
export function puff(): string {
  const g = nextId('pf');
  const d =
    'M34 96 C18 96 10 82 17 70 C8 58 18 40 35 44 C37 26 58 17 71 28 C82 16 104 22 106 40 C121 42 127 60 116 71 C124 86 110 100 95 95 C88 108 64 110 55 99 C48 104 38 102 34 96 Z';
  const shade = 'M17 70 C12 82 20 96 34 96 C38 102 48 104 55 99 C64 110 88 108 95 95 C110 100 124 86 116 71 C112 80 102 84 92 80 C84 92 64 94 56 86 C46 92 30 88 26 76 C22 76 19 73 17 70 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs><radialGradient id="${g}" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="${C.paper}"/><stop offset="1" stop-color="${C.g1}"/></radialGradient></defs>
  <path d="${d}" fill="url(#${g})"/>
  <path d="${shade}" fill="${C.g2}" opacity=".55"/>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M40 58 C44 50 52 48 58 51 M74 42 C80 36 90 37 94 43" stroke="${C.g2}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M30 60 Q34 50 44 48" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".95"/>
</svg>`;
}

/** Gold glint: a four-point star with a white-hot core. 64 box. */
export function twinkle(color: string = C.gold): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <path d="M32 2 C35 22 42 29 62 32 C42 35 35 42 32 62 C29 42 22 35 2 32 C22 29 29 22 32 2 Z" fill="${color}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M32 14 C33.6 26 38 30.4 50 32 C38 33.6 33.6 38 32 50 C30.4 38 26 33.6 14 32 C26 30.4 30.4 26 32 14 Z" fill="${C.goldLight}"/>
  <circle cx="32" cy="32" r="4" fill="#fff"/>
</svg>`;
}

/** Ember / spark: a soft hot dot (drawn additively). 32 box. */
export function ember(color: string = C.fireHot): string {
  const g = nextId('em');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs><radialGradient id="${g}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".3" stop-color="${color}"/><stop offset=".65" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>
  <circle cx="16" cy="16" r="16" fill="url(#${g})"/>
</svg>`;
}

/** Parrot feather (Sparks' squawks shed these): green vane, red tip, cream quill. 64 box. */
export function note(): string {
  const g = nextId('nt');
  const vane = 'M30 58 C20 50 14 38 16 26 C18 14 26 6 36 4 C44 12 48 24 46 36 C44 46 38 54 30 58 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.parrotRed}"/><stop offset=".3" stop-color="${C.parrotRed}"/><stop offset=".34" stop-color="${C.parrotLight}"/><stop offset=".7" stop-color="${C.parrot}"/><stop offset="1" stop-color="${C.parrotDeep}"/></linearGradient></defs>
  <path d="${vane}" fill="url(#${g})" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
  <path d="M22 26 L27 29 M20 36 L27 38 M23 46 L28 46 M42 22 L36 27 M44 33 L37 36 M40 44 L35 45" stroke="${C.parrotDeep}" stroke-width="2" stroke-linecap="round"/>
  <path d="M35 6 C35 22 33 42 26 62" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M35 6 C35 22 33 42 26 62" stroke="${C.paper}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M22 18 Q24 11 30 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".7"/>
</svg>`;
}

/** Fizzing fuse spark: a hot jagged star with a white core. 64 box. */
export function spark(): string {
  const g = nextId('sk');
  const star = 'M32 4 L36 22 L54 12 L42 28 L60 34 L41 38 L48 56 L33 43 L24 60 L24 41 L6 44 L20 31 L8 16 L26 22 Z';
  const core = 'M32 18 L34.6 27 L44 24 L37.5 31 L45 36 L35.5 36.5 L37 46 L31.5 39 L25 45 L27.5 36 L18 34 L26.5 30 L22 22 L29.5 26 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><radialGradient id="${g}" cx="50%" cy="52%" r="50%"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".9"/><stop offset="1" stop-color="${C.fire}" stop-opacity="0"/></radialGradient></defs>
  <circle cx="32" cy="33" r="30" fill="url(#${g})"/>
  <path d="${star}" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="${core}" fill="${C.fireCore}"/>
  <circle cx="32" cy="33" r="3.2" fill="#fff"/>
</svg>`;
}

/* ------------------------------------------------------------------------------------------ */
/* Keg blast and landing art (track G). Everything is inked and cel-shaded like the symbols, so */
/* debris reads as pieces of the same world, not generic particles.                            */
/* ------------------------------------------------------------------------------------------ */

/** Deterministic jitter so hand-shaped outlines stay identical between rasters. */
function jitter(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const STAVES = [
  'M8 25 Q32 20 56 23 L52 29 L58 33 L54 40 Q32 43 10 41 L13 35 L6 31 Z',
  'M12 24 Q32 19 50 22 L47 28 L53 31 L49 38 Q32 42 14 40 L18 33 L10 30 Z',
  'M6 30 Q30 24 58 28 L50 31 L56 34 Q30 38 8 36 L12 33 Z',
];

/** A broken barrel stave flung out of a keg blast. 64 box; `variant` 0..2 changes the break. */
export function stave(variant = 0): string {
  const g = nextId('st');
  const d = STAVES[variant % STAVES.length];
  const hoop = variant === 1 ? `<path d="M27 21 L35 20.5 L36 39.5 L28 40.5 Z" fill="${C.gold}"/><path d="M28.5 22 L31 21.8 L31.5 39 L29.2 39.4 Z" fill="${C.goldLight}" opacity=".8"/><path d="M27 21 L35 20.5 L36 39.5 L28 40.5 Z" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-linejoin="round"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.woodLight}"/><stop offset=".55" stop-color="${C.wood}"/><stop offset="1" stop-color="${C.woodMid}"/></linearGradient>
    <clipPath id="${g}c"><path d="${d}"/></clipPath>
  </defs>
  <path d="${d}" fill="url(#${g})"/>
  <g clip-path="url(#${g}c)">
    <path d="M0 37 Q32 41 64 36 L64 48 L0 48 Z" fill="${C.woodDark}" opacity=".7"/>
    <path d="M12 31 Q30 28 50 30" stroke="${C.woodMid}" stroke-width="1.8" fill="none"/>
    <path d="M16 35 Q28 33 44 34.5" stroke="${C.woodMid}" stroke-width="1.4" fill="none" opacity=".8"/>
    <path d="M14 26.5 Q30 23 46 25" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".55"/>
  </g>
  ${hoop}
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
</svg>`;
}

/** A bent piece of the keg's gold hoop, with one rivet. 64 box. */
export function hoopShard(): string {
  const g = nextId('hp');
  const d = 'M8 36 Q30 20 56 27 L54 35 Q31 29 11 44 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient></defs>
  <path d="${d}" fill="url(#${g})"/>
  <path d="M12 38 Q30 26 52 30" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".75"/>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="3.4" stroke-linejoin="round"/>
  <circle cx="33" cy="30.5" r="3.2" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2"/>
</svg>`;
}

/**
 * Billowing blast smoke: a lumpy neutral-grey cloud with a cel-shaded belly and warm ink, so a
 * tint turns it into soot, gunpowder haze or landing dust. 128 box.
 */
export function smoke(variant = 0): string {
  const g = nextId('sm');
  const r = jitter(variant + 3);
  const bumps = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 + r() * 0.3;
    const rr = 34 + r() * 12;
    pts.push([64 + Math.cos(a) * rr, 66 + Math.sin(a) * rr * 0.86]);
  }
  // scalloped outline: an arc bulging outward between neighbouring points
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < bumps; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % bumps];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = mx - 64;
    const dy = my - 66;
    const len = Math.hypot(dx, dy) || 1;
    const bulge = 14 + r() * 8;
    d += ` Q${(mx + (dx / len) * bulge).toFixed(1)} ${(my + (dy / len) * bulge).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  }
  d += ' Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <radialGradient id="${g}" cx="40%" cy="34%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#e4e0da"/><stop offset="1" stop-color="#a9a39b"/></radialGradient>
    <clipPath id="${g}c"><path d="${d}"/></clipPath>
  </defs>
  <path d="${d}" fill="url(#${g})"/>
  <g clip-path="url(#${g}c)">
    <ellipse cx="72" cy="104" rx="62" ry="26" fill="#8f877e" opacity=".7"/>
    <path d="M34 60 Q44 46 60 50 M70 40 Q84 32 96 42" stroke="#9c958c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M30 56 Q36 42 50 40" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".9"/>
  </g>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>
</svg>`;
}

/** The cartoon blast: a ragged fire star with a white-hot heart, inked. 256 box. */
export function blastStar(): string {
  const g = nextId('bs');
  const r = jitter(11);
  const n = 13;
  const ring = (ro: number, ri: number, jo: number, ji: number, rot: number) => {
    const p: string[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2;
      const a1 = a0 + Math.PI / n;
      const R = ro + (r() - 0.5) * jo;
      const Ri = ri + (r() - 0.5) * ji;
      p.push(`${(128 + Math.cos(a0) * R).toFixed(1)} ${(128 + Math.sin(a0) * R).toFixed(1)}`);
      p.push(`${(128 + Math.cos(a1) * Ri).toFixed(1)} ${(128 + Math.sin(a1) * Ri).toFixed(1)}`);
    }
    return `M${p.join(' L')} Z`;
  };
  const outer = ring(118, 72, 18, 12, -0.2);
  const mid = ring(88, 54, 14, 10, 0.05);
  const inner = ring(56, 36, 10, 8, -0.1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="${g}" cx="44%" cy="40%" r="62%"><stop offset="0" stop-color="${C.fireHot}"/><stop offset=".6" stop-color="${C.fire}"/><stop offset="1" stop-color="${C.fireDeep}"/></radialGradient>
    <clipPath id="${g}c"><path d="${outer}"/></clipPath>
  </defs>
  <path d="${outer}" fill="url(#${g})"/>
  <g clip-path="url(#${g}c)"><path d="M40 190 Q150 230 236 120 L256 256 L0 256 Z" fill="${C.fireDeep}" opacity=".55"/></g>
  <path d="${outer}" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linejoin="round"/>
  <path d="${mid}" fill="${C.fireHot}"/>
  <path d="${inner}" fill="${C.fireCore}"/>
  <circle cx="122" cy="122" r="22" fill="#fffdf2"/>
  <path d="M84 98 Q96 78 118 74" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".85"/>
</svg>`;
}

/** Shockwave: a broken ring of hot speed-strokes, inked, that grows out of a blast. 256 box. */
export function shockRing(): string {
  const arcs: string[] = [];
  const r = jitter(5);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2 + r() * 0.08;
    const a1 = a0 + ((Math.PI * 2) / n) * (0.62 + r() * 0.22);
    const R = 108 + (r() - 0.5) * 6;
    const x0 = 128 + Math.cos(a0) * R;
    const y0 = 128 + Math.sin(a0) * R;
    const x1 = 128 + Math.cos(a1) * R;
    const y1 = 128 + Math.sin(a1) * R;
    arcs.push(`M${x0.toFixed(1)} ${y0.toFixed(1)} A${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`);
  }
  const d = arcs.join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="17" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${C.fireHot}" stroke-width="10" stroke-linecap="round"/>
  <path d="${d}" fill="none" stroke="${C.fireCore}" stroke-width="4" stroke-linecap="round"/>
</svg>`;
}

/**
 * Scorch mark left on the hold floor after a blast: a soot splat with streaks and a cooling ember
 * heart (the hold is dark, so the embers carry the read while the soot deepens it). 256 box.
 */
export function scorch(seed = 1): string {
  const g = nextId('sc');
  const r = jitter(seed + 20);
  const blob = (R: number, J: number, n: number) => {
    const p: string[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = R + (r() - 0.5) * J;
      p.push(`${(128 + Math.cos(a) * rr).toFixed(1)} ${(128 + Math.sin(a) * rr * 0.92).toFixed(1)}`);
    }
    return `M${p.join(' L')} Z`;
  };
  const streaks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.3;
    const w = 0.07 + r() * 0.05;
    const r0 = 54;
    const r1 = 98 + r() * 24;
    const p = (ang: number, rr: number) => `${(128 + Math.cos(ang) * rr).toFixed(1)} ${(128 + Math.sin(ang) * rr).toFixed(1)}`;
    streaks.push(`M${p(a - w, r0)} L${p(a, r1)} L${p(a + w, r0)} Z`);
  }
  const embers = Array.from({ length: 16 }, () => {
    const a = r() * Math.PI * 2;
    const rr = 14 + r() * 70;
    const hot = rr < 40 || r() > 0.6;
    return `<circle cx="${(128 + Math.cos(a) * rr).toFixed(1)}" cy="${(128 + Math.sin(a) * rr).toFixed(1)}" r="${(1.6 + r() * 2.6).toFixed(1)}" fill="${hot ? C.fireHot : C.fire}" opacity="${(0.6 + r() * 0.4).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <filter id="${g}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <radialGradient id="${g}e"><stop offset="0" stop-color="${C.fireHot}" stop-opacity=".55"/><stop offset=".45" stop-color="${C.fire}" stop-opacity=".28"/><stop offset="1" stop-color="${C.fireDeep}" stop-opacity="0"/></radialGradient>
  </defs>
  <g filter="url(#${g})" fill="${C.ink}">
    <path d="${blob(92, 30, 18)}" opacity=".5"/>
    ${streaks.map((s) => `<path d="${s}" opacity=".5"/>`).join('')}
    <path d="${blob(58, 18, 14)}" opacity=".55"/>
  </g>
  <circle cx="128" cy="128" r="62" fill="url(#${g}e)"/>
  ${embers}
</svg>`;
}

/** Hot spark streak (drawn additively, stretched along its velocity). 64x16 box. */
export function streak(): string {
  const g = nextId('sk');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 16" width="64" height="16">
  <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.fire}" stop-opacity="0"/><stop offset=".55" stop-color="${C.fireHot}"/><stop offset="1" stop-color="#fffbe8"/></linearGradient></defs>
  <path d="M2 8 Q40 3 62 8 Q40 13 2 8 Z" fill="url(#${g})"/>
  <path d="M30 8 Q48 6.4 60 8 Q48 9.6 30 8 Z" fill="#fff"/>
</svg>`;
}

/** Glint on a shiny object: a thin white four-point flare with a soft core (drawn additively). 64 box. */
export function shine(): string {
  const g = nextId('sh');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><radialGradient id="${g}"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#fff6d6" stop-opacity=".5"/><stop offset="1" stop-color="#fff6d6" stop-opacity="0"/></radialGradient></defs>
  <circle cx="32" cy="32" r="16" fill="url(#${g})"/>
  <path d="M32 1 Q33.6 30.4 63 32 Q33.6 33.6 32 63 Q30.4 33.6 1 32 Q30.4 30.4 32 1 Z" fill="#fff"/>
  <path d="M32 18 Q32.8 31.2 46 32 Q32.8 32.8 32 46 Q31.2 32.8 18 32 Q31.2 31.2 32 18 Z" fill="#fff" transform="rotate(45 32 32)" opacity=".7"/>
</svg>`;
}

/* ------------------------------------------------------------------------------------------ */
/* Kaboom Bomb badges (track G draws these over track D's bomb art)                            */
/* ------------------------------------------------------------------------------------------ */

/** Size badge backing: a crimson wax seal with a scalloped rim (the "+N" it will add sits on it). 64 box. */
export function sizeSeal(): string {
  const g = nextId('ss');
  const r = jitter(31);
  const n = 11;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const R = 27 + (r() - 0.5) * 2.4;
    const x = 32 + Math.cos(a) * R;
    const y = 32 + Math.sin(a) * R;
    if (i === 0) d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    else {
      const am = a - Math.PI / n;
      const Rm = R + 4.2;
      d += ` Q${(32 + Math.cos(am) * Rm).toFixed(1)} ${(32 + Math.sin(am) * Rm).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
  }
  d += ' Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="${g}" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="${C.crimsonLight}"/><stop offset=".55" stop-color="${C.crimson}"/><stop offset="1" stop-color="${C.crimsonDeep}"/></radialGradient>
    <clipPath id="${g}c"><path d="${d}"/></clipPath>
  </defs>
  <path d="${d}" fill="url(#${g})"/>
  <g clip-path="url(#${g}c)"><circle cx="40" cy="42" r="30" fill="none" stroke="${C.crimsonDeep}" stroke-width="10" opacity=".55"/></g>
  <circle cx="32" cy="32" r="18.5" fill="none" stroke="${C.crimsonDeep}" stroke-width="2.4" opacity=".8"/>
  <path d="M15 24 Q20 13 32 11" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" opacity=".55"/>
  <path d="${d}" fill="none" stroke="${C.ink}" stroke-width="3.2" stroke-linejoin="round"/>
</svg>`;
}

/** Fuse counter backing: a riveted iron plate with a brass rim. `hot` glows red (about to blow). 64 box. */
export function fusePlate(hot = false): string {
  const g = nextId('fp');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="${g}" cx="40%" cy="36%" r="68%"><stop offset="0" stop-color="${hot ? C.fireHot : C.steel}"/><stop offset=".6" stop-color="${hot ? C.fireDeep : C.steelDeep}"/><stop offset="1" stop-color="${hot ? C.ember : C.inkSoft}"/></radialGradient>
    <linearGradient id="${g}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
  </defs>
  <circle cx="32" cy="32" r="27" fill="url(#${g}r)" stroke="${C.ink}" stroke-width="3.2"/>
  <circle cx="32" cy="32" r="20.5" fill="url(#${g})" stroke="${C.ink}" stroke-width="2.6"/>
  ${[45, 135, 225, 315].map((a) => `<circle cx="${(32 + Math.cos((a * Math.PI) / 180) * 23.8).toFixed(1)}" cy="${(32 + Math.sin((a * Math.PI) / 180) * 23.8).toFixed(1)}" r="1.9" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="1.2"/>`).join('')}
  <path d="M17 26 Q21 16 32 14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity="${hot ? 0.7 : 0.45}"/>
</svg>`;
}

/**
 * Stand-in Kaboom Bomb, drawn only while track D's SYMBOL_ART[11] is missing: an iron ball with a
 * brass fuse collar, a curled lit fuse and a skull stencil; `hot` = red-hot rim and glowing cracks.
 * 256 box, same anchor as the symbols.
 */
export function bombStandIn(hot = false): string {
  const g = nextId('bb');
  const fuse = 'M150 70 C166 56 146 46 162 34 C172 26 184 34 190 24';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="${g}" cx="38%" cy="34%" r="72%"><stop offset="0" stop-color="${hot ? '#6a2a22' : '#4d5566'}"/><stop offset=".55" stop-color="${hot ? '#3a1410' : '#262b36'}"/><stop offset="1" stop-color="#0e0f14"/></radialGradient>
    <radialGradient id="${g}h" cx="50%" cy="55%" r="55%"><stop offset=".55" stop-color="${C.fireDeep}" stop-opacity="0"/><stop offset=".9" stop-color="${C.fire}" stop-opacity=".75"/><stop offset="1" stop-color="${C.fireHot}" stop-opacity=".9"/></radialGradient>
    <linearGradient id="${g}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".5" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
    <filter id="${g}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="${g}d" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="7" result="o"/><feFlood flood-color="#000" flood-opacity=".55"/><feComposite in2="o" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g filter="url(#${g}d)">
    ${hot ? `<circle cx="128" cy="150" r="96" fill="${C.fire}" opacity=".55" filter="url(#${g}b)"/>` : ''}
    <circle cx="128" cy="150" r="80" fill="url(#${g})"/>
    ${hot ? `<circle cx="128" cy="150" r="80" fill="url(#${g}h)"/>` : ''}
    <path d="M150 226 A80 80 0 0 0 206 150 A82 82 0 0 1 142 228 Z" fill="#000" opacity=".35"/>
    ${hot ? `<path d="M96 110 L112 128 L104 146 L120 160 M176 132 L160 150 L170 170 M110 196 L126 184 L140 196" stroke="${C.fireHot}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    <g opacity="${hot ? 0.95 : 0.9}" fill="${hot ? C.fireCore : '#e8dcc4'}">
      <path d="M128 128 C108 128 98 142 100 156 C101 164 106 168 108 172 L108 182 L148 182 L148 172 C150 168 155 164 156 156 C158 142 148 128 128 128 Z"/>
    </g>
    <g fill="${hot ? '#5a1208' : '#1d2028'}"><ellipse cx="116" cy="156" rx="8" ry="9"/><ellipse cx="140" cy="156" rx="8" ry="9"/><path d="M128 164 L123 172 L133 172 Z"/></g>
    <circle cx="128" cy="150" r="80" fill="none" stroke="${C.ink}" stroke-width="7.5"/>
    <path d="M78 116 Q88 90 116 80" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" opacity=".4"/>
    <rect x="130" y="62" width="40" height="24" rx="6" transform="rotate(28 150 74)" fill="url(#${g}c)" stroke="${C.ink}" stroke-width="5.5"/>
    <path d="${fuse}" stroke="${C.ink}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <path d="${fuse}" stroke="${C.paperWarm}" stroke-width="5.5" fill="none" stroke-linecap="round"/>
    <g transform="translate(191 23) scale(${hot ? 1.1 : 0.85})">
      <circle r="24" fill="${C.fireHot}" opacity=".4" filter="url(#${g}b)"/>
      <path d="M0 -22 L5 -7 L20 -10 L8 2 L18 15 L3 8 L-2 24 L-6 8 L-20 13 L-9 1 L-22 -7 L-6 -6 Z" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M0 -11 L3 -3 L10 -4 L5 2 L9 8 L1 5 L-1 12 L-3 4 L-10 6 L-5 1 L-11 -4 L-3 -3 Z" fill="${C.fireCore}"/>
    </g>
  </g>
</svg>`;
}

/**
 * Cascade chain medallion: a brass disc with a teal enamel face and a chain link across its top;
 * the running count of winning cascades sits on it in bitmap numerals. 128 box.
 */
export function chainMedal(): string {
  const g = nextId('cm');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="${g}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".45" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></linearGradient>
    <radialGradient id="${g}f" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="${C.seaLight}"/><stop offset=".6" stop-color="${C.sea}"/><stop offset="1" stop-color="${C.seaDeep}"/></radialGradient>
    <filter id="${g}d" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="4" result="o"/><feFlood flood-color="#000" flood-opacity=".5"/><feComposite in2="o" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g filter="url(#${g}d)">
    <circle cx="64" cy="68" r="50" fill="url(#${g}r)" stroke="${C.ink}" stroke-width="5"/>
    ${Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return `<circle cx="${(64 + Math.cos(a) * 44).toFixed(1)}" cy="${(68 + Math.sin(a) * 44).toFixed(1)}" r="2.2" fill="${C.goldDeep}"/>`;
    }).join('')}
    <circle cx="64" cy="68" r="37" fill="url(#${g}f)" stroke="${C.ink}" stroke-width="4"/>
    <path d="M36 56 Q44 38 64 34" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".45"/>
    <g transform="translate(64 16)">
      <rect x="-26" y="-9" width="30" height="18" rx="9" fill="none" stroke="${C.ink}" stroke-width="10"/>
      <rect x="-4" y="-9" width="30" height="18" rx="9" fill="none" stroke="${C.ink}" stroke-width="10"/>
      <rect x="-26" y="-9" width="30" height="18" rx="9" fill="none" stroke="${C.steelLight}" stroke-width="5"/>
      <rect x="-4" y="-9" width="30" height="18" rx="9" fill="none" stroke="${C.steel}" stroke-width="5"/>
    </g>
  </g>
</svg>`;
}
