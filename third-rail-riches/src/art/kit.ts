/**
 * Shared ink + paint kit for every illustration. Art is authored as SVG strings and
 * rasterised to textures at the exact on-screen size (see render/textures.ts).
 *
 * Look: 1930s rubber-hose cel animation (see docs/ART.md). Warm ink lines weighted on the lower
 * right, parchment whites, cel shade on the lower-right rim, soft highlight upper-left.
 */
import { lens, sample } from './geo';

export const C = {
  // ink + paper
  ink: '#1b1311',
  inkSoft: '#2d221e',
  paper: '#f7ecd6',
  // protected white (eyes, teeth)
  white: '#fbf6ea',
  paperWarm: '#eddcbc',
  g1: '#ddd3c2',
  g2: '#b8ab98',
  g3: '#857866',
  g4: '#574d42',
  g5: '#352e28',
  // ship wood
  woodLight: '#d99b5f',
  wood: '#a8672f',
  woodMid: '#7a4520',
  woodDark: '#4f2a13',
  woodDeep: '#2e170a',
  // sea + night sky
  seaFoam: '#bff5ea',
  seaLight: '#5fd6cc',
  sea: '#1b8f9e',
  seaDeep: '#0d4f6a',
  night: '#0f2447',
  nightDeep: '#07122a',
  skyTop: '#081028',
  skyLow: '#2c5a7c',
  moon: '#fff6d6',
  moonGlow: '#bfe6ff',
  // ghost green (Moonlight Raid, spectral fire)
  green: '#7dffb2',
  greenMid: '#2fd184',
  greenDeep: '#11704a',
  greenGlow: '#dcfff0',
  // powder fire (lit kegs, fuses, blasts)
  fireCore: '#fff3b8',
  fireHot: '#ffc233',
  fire: '#ff7a1f',
  fireDeep: '#d9340f',
  ember: '#7c1206',
  // captain red
  crimson: '#d42c24',
  crimsonDeep: '#7a1210',
  crimsonLight: '#ff6f5e',
  // skin + beard
  skinLight: '#ffdcbf',
  skin: '#f4b48c',
  skinDeep: '#c97b54',
  gingerLight: '#ffab5e',
  ginger: '#e0672a',
  gingerDeep: '#96360f',
  navy: '#1c2f5c',
  navyLight: '#3a5a9a',
  // steel
  steelLight: '#e2ecf2',
  steel: '#9fb3c0',
  steelDeep: '#4e6272',
  // symbol hues
  tealLight: '#9ff0e6',
  teal: '#23b3a6',
  tealDeep: '#0f6158',
  pinkLight: '#ffd6e6',
  pink: '#ff86b4',
  pinkDeep: '#b33a70',
  crabLight: '#ff9a6a',
  crab: '#f0592d',
  crabDeep: '#9c2b10',
  octoLight: '#d8a8ff',
  octo: '#9b5cf0',
  octoDeep: '#5a2aa6',
  sharkLight: '#c4dbee',
  shark: '#6f93b5',
  sharkDeep: '#34506e',
  parrotLight: '#b6f25a',
  parrot: '#4fbf3a',
  parrotDeep: '#1f7a2a',
  parrotRed: '#e8392b',
  parrotBlue: '#2e7fe0',
  parrotYellow: '#ffd23a',
  // metals
  bronze: '#c9793b',
  bronzeDeep: '#6f3a17',
  bronzeLight: '#f6bd86',
  silver: '#cfd6db',
  silverDeep: '#6c767e',
  silverLight: '#ffffff',
  gold: '#f4b73a',
  goldDeep: '#9c5f10',
  goldLight: '#fff0b0',
  // ---- Third Rail Riches (docs/ART.md) ----
  // station tile + trim
  tileLight: '#fbf3dc',
  tile: '#efe2c0',
  tileDeep: '#c9b48a',
  emeraldLight: '#5fd3a1',
  emerald: '#1f8a63',
  emeraldDeep: '#0f5a40',
  // train maroon + cream livery
  maroonLight: '#d8505a',
  maroon: '#9c2232',
  maroonDeep: '#561019',
  cream: '#fff1cf',
  // cast iron / steel tunnel
  ironLight: '#5d6f78',
  iron: '#33424a',
  ironDeep: '#172126',
  tunnel: '#0d1418',
  // electricity (the third rail, Live Wire, sparks)
  voltCore: '#f2fdff',
  voltLight: '#a8f0ff',
  volt: '#3fc8ff',
  voltDeep: '#1a5fd6',
  voltNight: '#0b2a6b',
  // warm lamp light
  amberLight: '#ffe6a3',
  amber: '#ffb43c',
  amberDeep: '#c46a12',
  // uniform navy (Conductor Casey)
  uniform: '#24335e',
  uniformLight: '#4560a3',
  uniformDeep: '#121b38',
  // rat grey (Rivets)
  ratLight: '#c9c3c9',
  rat: '#8e8790',
  ratDeep: '#4d474f',
  ratPink: '#f4a6b7',
  // symbol hues
  pretzelLight: '#f6c27a',
  pretzel: '#c97a2e',
  pretzelDeep: '#6e3a10',
  coffeeRed: '#e0473a',
  umbrellaLight: '#8fc4ff',
  umbrella: '#2f6fd6',
  umbrellaDeep: '#173c82',
  pigeonLight: '#c7c2e8',
  pigeon: '#8a83b8',
  pigeonDeep: '#4b4478',
  pigeonNeck: '#3fbf9a',
  catLight: '#ffc27a',
  cat: '#f08a24',
  catDeep: '#9a4a0c',
  copLight: '#7aa2ff',
  cop: '#2c4fb3',
  copDeep: '#152a66',
  dogLight: '#f2d3a8',
  dog: '#d4a46c',
  dogDeep: '#8a5d2e',
  platinumLight: '#f4fbff',
  platinum: '#bfe3ee',
  platinumDeep: '#5f8f9e',
} as const;

let uid = 0;
/** Unique id prefix so several SVGs can be inlined on one page without id clashes. */
export const nextId = (p: string) => `${p}${(uid++).toString(36)}`;

export interface Layer {
  /** Filled shapes only (no strokes). They receive cel shading + highlight. */
  fills: string;
  /** Ink work for this layer (strokes or solid ink shapes), drawn right after its fills. */
  lines?: string;
}

export interface SymbolParts {
  /** Single-layer shorthand. */
  fills?: string;
  lines?: string;
  /** Back-to-front layers; each gets its own rim shade and its ink occludes the layers behind. */
  layers?: Layer[];
  /** Painted on top of the ink (eye shines, glints, glowing letters). */
  top?: string;
  /** Behind everything (glows, shadows). */
  under?: string;
  /** Outer sticker outline colour, drawn around the whole silhouette. */
  sticker?: string;
  stickerWidth?: number;
  /** Cel-shade strength 0..1 (default .30) and highlight strength (default .5). */
  shade?: number;
  light?: number;
  /** Ink line width in viewBox units (default 7.5). */
  lw?: number;
  size?: number;
  /** Extra defs (gradients etc). */
  defs?: string;
  /** Skip the baked drop shadow (for parts composited in the engine). */
  noDrop?: boolean;
  /**
   * Opt-in hand-made texture over the painted art (gouache mottling + paper grain, clipped to
   * the art, ink included). `true` uses the defaults. Off unless set.
   */
  texture?: boolean | TextureOpts;
  /**
   * Opt-in: an extra ink contour this many units beyond the outer ink line, so the silhouette
   * reads heavier than the interior lines (classic inking). Off unless set.
   */
  contour?: number;
  /**
   * Procedural rim shade + highlight filter on every layer (default true). Set false for art
   * that paints its own hand-shaped cel with `cel()`: flat fills stay flat and crisp.
   */
  autoCel?: boolean;
  /** Offset of the second ink pass that weights strokes toward the lower right (default [.8, 1]). */
  inkShift?: [number, number];
  /** Transform for the whole illustration inside the drop shadow (fit art to a safe margin). */
  transform?: string;
}

/** Settings for the opt-in `texture` of `composeSymbol`. */
export interface TextureOpts {
  /** Gouache mottling: a slow light/dark drift through the paint (0..1, default .5). */
  mottle?: number;
  /** Paper tooth: fine grain (0..1, default .5). */
  grain?: number;
  /** Noise seed; vary it per illustration so neighbours don't share one pattern. */
  seed?: number;
}

/**
 * The opt-in paint filter: an ink contour under the art and/or texture over it, one filter for
 * the whole illustration (cheap to rasterise; the noise is generated once per image).
 */
function paintFilter(id: string, size: number, contour: number, tex: TextureOpts | null): string {
  const pad = Math.ceil(contour * 2 + 12);
  let fx = '';
  const merge: string[] = [];
  if (contour > 0) {
    fx += `<feGaussianBlur in="SourceAlpha" stdDeviation="${(contour * 0.78).toFixed(2)}" result="cb"/>
    <feComponentTransfer in="cb" result="ca"><feFuncA type="linear" slope="34" intercept="-2.6"/></feComponentTransfer>
    <feFlood flood-color="${C.ink}" result="ci"/><feComposite in="ci" in2="ca" operator="in" result="ctr"/>`;
    merge.push('ctr');
  }
  merge.push('SourceGraphic');
  if (tex) {
    // luminance of the noise is centred on .5: above it darkens, below it lightens, so the
    // average tone of the paint is kept
    const m = 0.62 * (tex.mottle ?? 0.5);
    const g = 0.4 * (tex.grain ?? 0.5);
    const s = tex.seed ?? 3;
    const signed = (src: string, k: number, out: string) =>
      `<feColorMatrix in="${src}" type="luminanceToAlpha" result="${out}l"/>
    <feComponentTransfer in="${out}l" result="${out}d"><feFuncA type="linear" slope="${(2 * k).toFixed(3)}" intercept="${(-k).toFixed(3)}"/></feComponentTransfer>
    <feComponentTransfer in="${out}l" result="${out}w"><feFuncR type="linear" slope="0" intercept="1"/><feFuncG type="linear" slope="0" intercept="1"/><feFuncB type="linear" slope="0" intercept=".94"/><feFuncA type="linear" slope="${(-2 * k).toFixed(3)}" intercept="${k.toFixed(3)}"/></feComponentTransfer>`;
    // dark flecks sit on all paint; light flecks only where the paint is light, so ink stays dense
    fx += `<feTurbulence type="fractalNoise" baseFrequency=".026" numOctaves="3" seed="${s}" result="mn"/>
    ${signed('mn', m, 'm')}
    <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="1" seed="${s + 7}" result="gn"/>
    ${signed('gn', g, 'g')}
    <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum0"/>
    <feComposite in="lum0" in2="SourceAlpha" operator="in" result="lum"/>
    <feMerge result="txd"><feMergeNode in="md"/><feMergeNode in="gd"/></feMerge>
    <feMerge result="txw"><feMergeNode in="mw"/><feMergeNode in="gw"/></feMerge>
    <feComposite in="txd" in2="SourceAlpha" operator="in" result="txdc"/>
    <feComposite in="txw" in2="lum" operator="in" result="txwc"/>`;
    merge.push('txdc', 'txwc');
  }
  return `<filter id="${id}-pnt" filterUnits="userSpaceOnUse" x="${-pad}" y="${-pad}" width="${size + pad * 2}" height="${size + pad * 2}" color-interpolation-filters="sRGB">
    ${fx}
    <feMerge>${merge.map((n) => `<feMergeNode in="${n}"/>`).join('')}</feMerge>
  </filter>`;
}

/**
 * Wrap illustration parts into one SVG with the shared filters.
 * The cel shade is computed per layer from its fill silhouette so it hugs the lower-right
 * rim; the ink gets a second pass nudged down-right so strokes are a touch heavier on the
 * shadow side, like a brush-inked cel.
 */
export function composeSymbol(p: SymbolParts): string {
  const id = nextId('s');
  const size = p.size ?? 256;
  const lw = p.lw ?? 7.5;
  const shade = p.shade ?? 0.3;
  const light = p.light ?? 0.5;
  const sw = p.stickerWidth ?? 9;
  const autoCel = p.autoCel ?? true;
  const [ix, iy] = p.inkShift ?? [0.8, 1];
  const tex = p.texture ? (p.texture === true ? {} : p.texture) : null;
  const contour = p.contour ?? 0;
  const paint = tex || contour > 0;
  const layers: Layer[] = p.layers ?? [{ fills: p.fills ?? '', lines: p.lines ?? '' }];
  const allFills = layers.map((l) => l.fills).join('');
  const sticker = p.sticker ? `<g filter="url(#${id}-stk)">${allFills}</g>` : '';
  const ink = (lines: string) =>
    lines
      ? `<g fill="none" stroke="${C.ink}" stroke-width="${lw}" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(${ix} ${iy})">${lines}</g>
    ${lines}
  </g>`
      : '';
  const body = layers.map((l) => `${autoCel ? `<g filter="url(#${id}-cel)">${l.fills}</g>` : l.fills}${ink(l.lines ?? '')}`).join('\n');
  const art = `${sticker}
  ${body}
  ${p.top ?? ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>
  ${
    autoCel
      ? `<filter id="${id}-cel" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="-15" dy="-17" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="1.4" result="rimb"/>
    <feFlood flood-color="${C.ink}" flood-opacity="${shade}"/>
    <feComposite in2="rimb" operator="in" result="sh0"/>
    <feComposite in="sh0" in2="SourceAlpha" operator="in" result="shade"/>
    <feOffset in="SourceAlpha" dx="7" dy="9" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="rim2"/>
    <feGaussianBlur in="rim2" stdDeviation="3" result="rim2b"/>
    <feFlood flood-color="#ffffff" flood-opacity="${light}"/>
    <feComposite in2="rim2b" operator="in" result="hl0"/>
    <feComposite in="hl0" in2="SourceAlpha" operator="in" result="hl"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="hl"/></feMerge>
  </filter>`
      : ''
  }
  ${paint ? paintFilter(id, size, contour, tex) : ''}
  ${
    p.sticker
      ? `<filter id="${id}-stk" x="-25%" y="-25%" width="150%" height="150%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${(sw * 0.78).toFixed(2)}" result="b"/>
    <feComponentTransfer in="b" result="t"><feFuncA type="linear" slope="34" intercept="-2.6"/></feComponentTransfer>
    <feFlood flood-color="${p.sticker}"/>
    <feComposite in2="t" operator="in"/>
  </filter>`
      : ''
  }
  <filter id="${id}-drop" x="-20%" y="-20%" width="140%" height="150%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="5"/>
    <feOffset dy="7" result="d"/>
    <feFlood flood-color="#000" flood-opacity=".55"/>
    <feComposite in2="d" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  ${p.defs ?? ''}
</defs>
<g ${p.noDrop ? '' : `filter="url(#${id}-drop)"`}>
  ${p.transform ? `<g transform="${p.transform}">` : ''}
  ${p.under ?? ''}
  ${paint ? `<g filter="url(#${id}-pnt)">${art}</g>` : art}
  ${p.transform ? '</g>' : ''}
</g>
</svg>`;
}

/** Blend two palette colours (#rrggbb): t = 0 gives a, 1 gives b. Derives in-between cel tones from the tokens. */
export function mix(a: string, b: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Small deterministic PRNG (mulberry32) so procedural ink is identical on every raster. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hand-inked hatching as a pattern: rows of broken, tapered strokes running with the light
 * (upper left to lower right), `gap` units apart, drawn once into a seamless 36-unit tile. Returns
 * the pattern definition; fill a shape with `url(#id)` (`cel()` does this for its shadow).
 */
export function hatchPattern(id: string, color: string, gap = 6, w = 0.9, seed = 1): string {
  const r = rng(seed);
  const T = gap * 6;
  let d = '';
  const dash = (x0: number, x1: number, y: number, ww: number) => {
    const xm = (x0 + x1) / 2;
    d += `M${x0.toFixed(1)} ${y.toFixed(1)}L${xm.toFixed(1)} ${(y - ww).toFixed(1)}L${x1.toFixed(1)} ${y.toFixed(1)}L${xm.toFixed(1)} ${(y + ww).toFixed(1)}Z`;
  };
  for (let row = 0; row < 6; row++) {
    const y = gap * (row + 0.5) + (r() - 0.5) * gap * 0.3;
    let x = r() * T;
    const end = x + T;
    while (x < end - 6) {
      const len = Math.min(9 + r() * 20, end - x - 3);
      const ww = w * (0.7 + r() * 0.6);
      // wrap across the tile edge so the pattern tiles without seams
      for (const k of [0, -T]) if (x + k < T && x + len + k > 0) dash(x + k, x + len + k, y, ww);
      x += len + 2.5 + r() * 6;
    }
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${T}" height="${T}" patternTransform="rotate(45)"><path d="${d}" fill="${color}"/></pattern>`;
}

/** Bounding box of an absolute or relative SVG path's points (control points included). */
export function pathBox(d: string): [number, number, number, number] {
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = 'M';
  let i = 0;
  const xs: number[] = [];
  const ys: number[] = [];
  const num = () => Number(tok[i++]);
  const put = (px: number, py: number) => {
    xs.push(px);
    ys.push(py);
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? x : 0;
    const by = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'Z':
        x = sx;
        y = sy;
        break;
      case 'M':
      case 'L':
      case 'T':
        x = bx + num();
        y = by + num();
        if (cmd.toUpperCase() === 'M') {
          sx = x;
          sy = y;
          cmd = rel ? 'l' : 'L';
        }
        put(x, y);
        break;
      case 'H':
        x = bx + num();
        put(x, y);
        break;
      case 'V':
        y = by + num();
        put(x, y);
        break;
      case 'C':
        put(bx + num(), by + num());
        put(bx + num(), by + num());
        x = bx + num();
        y = by + num();
        put(x, y);
        break;
      case 'S':
      case 'Q':
        put(bx + num(), by + num());
        x = bx + num();
        y = by + num();
        put(x, y);
        break;
      case 'A': {
        const rx = num();
        const ry = num();
        i += 3;
        x = bx + num();
        y = by + num();
        put(x - rx, y - ry);
        put(x + rx, y + ry);
        break;
      }
      default:
        i++;
    }
    if (cmd.toUpperCase() === 'Z' && i < tok.length && !/[a-zA-Z]/.test(tok[i])) i++;
  }
  if (!xs.length) return [0, 0, 256, 256];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Options for `cel()`. */
export interface CelOpts {
  /** Flat body colour. */
  base: string;
  /** Cel shadow colour (the lower-right side, away from the key light). */
  shade: string;
  /** Optional lighter band hugging the upper-left edge. */
  light?: string;
  /** Shift of the lit copy toward the light (default [-9, -11]); the crescent it uncovers is the shadow. */
  cut?: [number, number];
  /** Rotation (degrees) of the lit copy about `at`: swells the crescent on one side, like a hand-cut shadow. */
  twist?: number;
  /** Scale of the lit copy about `at` (default 1): below 1 the shadow wraps further round the form. */
  shrink?: number;
  /** Pivot for `twist` / `shrink` (default: the centre of the form's box). */
  at?: [number, number];
  /** Width of the light band, as a shift of the base away from the light (default [4.5, 5.5]). */
  band?: [number, number];
  /** A hand-drawn lit region instead of the shifted copy (everything it leaves uncovered is shadow). */
  lit?: string;
  /** Hatch the shadow with this ink colour (omit for none). */
  hatch?: string;
  hatchGap?: number;
  hatchW?: number;
  seed?: number;
  /** Transform for the whole form (a posed claw); the light direction stays in screen space. */
  t?: string;
  /** Extra paint clipped inside the form, drawn over the cel (spots, planks, patterns). */
  inner?: string;
  /** 'evenodd' for forms with holes (rings, annuli). */
  rule?: 'evenodd';
}

/**
 * A hand-cel-painted form for the `fills` of a layer (use with `autoCel: false`): flat base,
 * a crisp shadow cut on the lower right (optionally hatched with broken, tapered ink strokes;
 * see `hatchPattern`), an optional light band on the upper left. Everything is clipped to the form `d`, so the
 * layer's ink line covers the seams.
 */
export function cel(d: string, o: CelOpts): string {
  const id = nextId('cf');
  const ft = o.t ?? '';
  const box = pathBox(d);
  const at = o.at ?? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const [cx, cy] = o.cut ?? [-9, -11];
  const tr = (s: string) => (s.trim() ? ` transform="${s.trim()}"` : '');
  // the form's outline is written once and referenced (clip, shadow fill, lit copy)
  const ref = (key: string, extra = '') => `<use href="#${id}-${key}"${extra}/>`;
  const rule = o.rule ? ` fill-rule="${o.rule}" clip-rule="${o.rule}"` : '';
  const defs = `<defs><path id="${id}-f" d="${d}"${rule}/>${o.lit ? `<path id="${id}-p" d="${o.lit}"${rule}/>` : ''}</defs>`;
  // the lit copy: the form (or the hand-drawn lit region) under the form's own transform, then
  // shifted / twisted toward the light in screen space
  const litT = o.lit ? ft : `translate(${cx} ${cy}) translate(${at[0]} ${at[1]}) rotate(${o.twist ?? 0}) scale(${o.shrink ?? 1}) translate(${-at[0]} ${-at[1]}) ${ft}`;
  const litKey = o.lit ? 'p' : 'f';
  const band = o.band ?? [4.5, 5.5];
  // hatching fills the whole form under the lit copy, so it only shows in the shadow; a posed
  // form's hatching turns with it
  const hatch = o.hatch ? `${hatchPattern(`${id}-h`, o.hatch, o.hatchGap ?? 6, o.hatchW ?? 0.9, o.seed ?? 1)}${ref('f', `${tr(ft)} fill="url(#${id}-h)"`)}` : '';
  const lit = o.light
    ? `${ref(litKey, `${tr(litT)} fill="${o.light}"`)}
      <clipPath id="${id}-l">${ref(litKey, tr(litT))}</clipPath>
      <g clip-path="url(#${id}-l)">${ref(litKey, `${tr(`translate(${band[0]} ${band[1]}) ${litT}`)} fill="${o.base}"`)}</g>`
    : ref(litKey, `${tr(litT)} fill="${o.base}"`);
  return `${defs}<clipPath id="${id}">${ref('f', tr(ft))}</clipPath>
    <g clip-path="url(#${id})">${ref('f', `${tr(ft)} fill="${o.shade}"`)}${hatch}${lit}${o.inner ?? ''}</g>`;
}

/**
 * `cel()` plus a matching ink line that reuses the form's outline (no second copy of a long
 * path): put `fills` in a layer's fills and `line()` in its lines.
 */
export function celForm(d: string, o: CelOpts): { fills: string; line: (attrs?: string) => string } {
  const fills = cel(d, o);
  const ref = /<path id="([^"]+)"/.exec(fills)![1];
  return { fills, line: (attrs = '') => `<use href="#${ref}"${o.t ? ` transform="${o.t}"` : ''} ${attrs}/>` };
}

/** Classic 1930s "pie eye": black oval with a wedge cut for the shine. */
export function pieEye(cx: number, cy: number, rx: number, ry: number, look = 0, tilt = 0): string {
  // wedge points toward upper-right by default; `look` shifts the pupil sideways
  const x = cx + look;
  const a0 = -60 * (Math.PI / 180);
  const a1 = -20 * (Math.PI / 180);
  const p0 = [x + Math.cos(a0) * rx * 1.4, cy + Math.sin(a0) * ry * 1.4];
  const p1 = [x + Math.cos(a1) * rx * 1.4, cy + Math.sin(a1) * ry * 1.4];
  const cut = `M${x} ${cy} L${p0[0].toFixed(1)} ${p0[1].toFixed(1)} L${p1[0].toFixed(1)} ${p1[1].toFixed(1)} Z`;
  const mid = nextId('pe');
  return `<g transform="rotate(${tilt} ${cx} ${cy})">
    <mask id="${mid}"><rect x="${x - rx * 2}" y="${cy - ry * 2}" width="${rx * 4}" height="${ry * 4}" fill="#fff"/><path d="${cut}" fill="#000"/></mask>
    <ellipse cx="${x}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.ink}" stroke="none" mask="url(#${mid})"/>
  </g>`;
}

/** Closed-eye arc for blink frames. */
export function closedEye(cx: number, cy: number, w: number, up = true): string {
  const d = up ? -w * 0.45 : w * 0.45;
  return `<path d="M${cx - w / 2} ${cy} Q${cx} ${cy + d} ${cx + w / 2} ${cy}" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>`;
}

/** Soft radial glow blob. */
export function glow(id: string, cx: number, cy: number, r: number, color: string, opacity = 0.8): string {
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`;
}

/** Polygon star/spike ring around a centre, returned as a path string. */
export function spikeRing(cx: number, cy: number, rIn: number, rOut: number, n: number, rot = 0, half = 0.5): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ((i / n) * 360 + rot) * (Math.PI / 180);
    const w = (half * Math.PI) / n;
    const b0 = [cx + Math.cos(a - w) * rIn, cy + Math.sin(a - w) * rIn];
    const t = [cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut];
    const b1 = [cx + Math.cos(a + w) * rIn, cy + Math.sin(a + w) * rIn];
    d += `M${b0[0].toFixed(1)} ${b0[1].toFixed(1)} L${t[0].toFixed(1)} ${t[1].toFixed(1)} L${b1[0].toFixed(1)} ${b1[1].toFixed(1)} Z `;
  }
  return d;
}

export const f = (n: number) => n.toFixed(1);

/** Tapered brush-stroke brow between two points, bulging by `bend` toward the normal. */
export function brow(x0: number, y0: number, x1: number, y1: number, bend: number, thick: number, fill: string = C.ink): string {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const c1 = [mx + nx * (bend + thick), my + ny * (bend + thick)];
  const c2 = [mx + nx * (bend - thick), my + ny * (bend - thick)];
  return `<path d="M${x0} ${y0} Q${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${x1} ${y1} Q${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${x0} ${y0} Z" fill="${fill}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/>`;
}

/**
 * A scalloped (cloud / beard / foam) edge through `pts`: each consecutive pair is joined by an
 * outward bump of `bulge` (fraction of the segment length). Returns path commands without "M".
 */
export function scallops(pts: [number, number][], bulge = 0.35, outward = 1): string {
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (dy / len) * outward;
    const ny = (-dx / len) * outward;
    d += ` Q${(mx + nx * len * bulge).toFixed(1)} ${(my + ny * len * bulge).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Shared hand-paint helpers (opt-in)                                  */
/* ------------------------------------------------------------------ */
/** Cel tones for one hue, derived from palette tokens: base, shadow, light band, hatch ink. */
export function celTones(base: string, deep: string, light: string): { base: string; shade: string; light: string; hatch: string } {
  return { base, shade: mix(base, deep, 0.58), light: mix(base, light, 0.72), hatch: mix(deep, C.ink, 0.35) };
}

/** Cel tones for brass / gold fittings. */
export const GOLD_TONES = { base: C.gold, shade: mix(C.gold, C.goldDeep, 0.62), light: mix(C.gold, C.goldLight, 0.8), hatch: mix(C.goldDeep, C.ink, 0.3) };

/** A cut highlight: a swelling, pointed brush stroke through `pts` (hand-shaped, never a gradient). */
export function shine(pts: [number, number][], w: number, o = 0.8, fill: string = C.white): string {
  return `<path d="${lens(pts, w)}" fill="${fill}" opacity="${o}"/>`;
}

/**
 * Twisted cord along a spline (rope, fuse): ink casing, a shaded core with the lit strand on
 * the upper-left side and diagonal twist marks. `w` is the core half-width; `from`/`to` pick a
 * stretch of the spline (0..1).
 */
export function cord(
  pts: [number, number][],
  w = 6,
  o: { from?: number; to?: number; core?: string; lit?: string; twist?: string; ink?: number } = {},
): string {
  const n = 90;
  const s = sample(pts, n).slice(Math.round((o.from ?? 0) * n), Math.round((o.to ?? 1) * n) + 1);
  const d = `M${s.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`;
  let twist = '';
  for (let i = 2; i < s.length - 2; i += 3) {
    const a = s[i - 1];
    const b = s[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    const k = w * 0.95;
    const t0 = w * 0.45;
    twist += `M${(s[i][0] - ty * k - tx * t0).toFixed(1)} ${(s[i][1] + tx * k - ty * t0).toFixed(1)} L${(s[i][0] + ty * k + tx * t0).toFixed(1)} ${(s[i][1] - tx * k + ty * t0).toFixed(1)} `;
  }
  return `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w * 2 + (o.ink ?? 7.5)}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${o.core ?? C.woodLight}" stroke-width="${w * 2}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${o.lit ?? C.paperWarm}" stroke-width="${w * 1.2}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${(-w * 0.22).toFixed(2)} ${(-w * 0.27).toFixed(2)})"/>
    <path d="${twist}" fill="none" stroke="${o.twist ?? C.woodMid}" stroke-width="${Math.max(1.4, w * 0.4).toFixed(2)}" stroke-linecap="round"/>`;
}

/**
 * Soft emitted light (fuse sparks, glowing locks): one blurred disc. Light may be soft; paint
 * may not. The visible halo reaches about 1.6 x `r` from the centre, so keep that inside the box.
 */
export function softGlow(cx: number, cy: number, r: number, color: string, opacity = 0.6): string {
  const id = nextId('gl');
  return `<filter id="${id}-b" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="${(r * 0.42).toFixed(1)}"/></filter><circle cx="${cx}" cy="${cy}" r="${(r * 0.62).toFixed(1)}" fill="${color}" opacity="${opacity}" filter="url(#${id}-b)"/>`;
}

/** Soft glow hugging a shape's outline (a red-hot rim, a burning stencil): the shape's markup blurred. */
export function glowOf(markup: string, blur: number, opacity = 0.8): string {
  const id = nextId('go');
  return `<filter id="${id}-b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter><g filter="url(#${id}-b)" opacity="${opacity}">${markup}</g>`;
}
