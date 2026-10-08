/**
 * Art for the splash's feature demos. The mini maps are drawn with the network map's own recipe
 * (art/map.ts: dark casing, the line's deep / main / light core, sleepers, split-flap station
 * housings with brass rims, terminal rings in the line colour with the line's numeral, interchange
 * double rings), on a small window of the enamel map field that fades out at its edges, so each
 * card reads as a stretch of the real board. Everything is rasterised once per splash build at the
 * size it shows.
 */
import { Texture } from 'pixi.js';
import { svgTexture } from '../../textures';
import { LINE_COLORS, LINE_NUMERALS } from '../../../art/map';
import { trainCarSvg, crashBoomSvg } from '../../../art/trainTop';
import { securityCheck } from '../../../art/specials';
import { locoSide } from '../../../art/train';
import { SYMBOL_ART, ART } from '../../../art/symbols';
import { C, nextId } from '../../../art/kit';
import { F, celDefs, svgDoc, pill } from './svg';

export type LineKey = 'red' | 'blue' | 'green' | 'gold';
export const LINE_KEYS: readonly LineKey[] = ['red', 'blue', 'green', 'gold'];
export type StationKind = 'terminal' | 'interchange' | 'stop';

/** A station of a mini map, in demo units (the demo square is 1 x 1, centred on 0). */
export interface MiniStation {
  x: number;
  y: number;
  kind: StationKind;
}

export interface MiniLine {
  key: LineKey;
  /** Station indices in line order. */
  stops: number[];
  /** Where the line comes from / runs on to past its first / last stop (it fades out at the window's edge). */
  head?: [number, number];
  tail?: [number, number];
}

export interface MiniSpec {
  id: string;
  /** Station footprint in demo units. */
  S: number;
  stations: MiniStation[];
  lines: MiniLine[];
}

/** The plate is drawn this much bigger than the demo square on each side (housings at the edge never clip). */
export const MINI_PAD = 0.08;
/** Symbol size inside a station face (MapView.SYM_K). */
export const SYM_K = 0.9;

const LINE_INDEX: Record<LineKey, number> = { red: 0, blue: 1, green: 2, gold: 3 };

function linePts(spec: MiniSpec, l: MiniLine, full: boolean): [number, number][] {
  const pts: [number, number][] = l.stops.map((i) => [spec.stations[i].x, spec.stations[i].y]);
  if (full && l.head) pts.unshift(l.head);
  if (full && l.tail) pts.push(l.tail);
  return pts;
}

/** The plate: map field window, the lines and the station housings. */
export function miniMapSvg(spec: MiniSpec, D: number): string {
  const W = D * (1 + MINI_PAD * 2);
  const X = (x: number) => (x + 0.5 + MINI_PAD) * D;
  const S = spec.S * D;
  const id = nextId('mm');
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${F(X(x))} ${F(X(y))}`).join(' ');
  const w0 = MINI_PAD * D;
  const w1 = (1 + MINI_PAD) * D;
  const fade = 0.11;
  // the window fades out at its edges (two crossed gradients make a soft rounded rectangle)
  const grad = (n: string, horiz: boolean) =>
    `<linearGradient id="${id}${n}" gradientUnits="userSpaceOnUse" x1="${horiz ? F(w0) : 0}" y1="${horiz ? 0 : F(w0)}" x2="${horiz ? F(w1) : 0}" y2="${horiz ? 0 : F(w1)}"><stop offset="0" stop-color="#000"/><stop offset="${fade}" stop-color="#fff"/><stop offset="${1 - fade}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`;
  const mask = (n: string) => `<mask id="${id}m${n}" maskUnits="userSpaceOnUse" x="0" y="0" width="${F(W)}" height="${F(W)}"><rect width="${F(W)}" height="${F(W)}" fill="url(#${id}${n})"/></mask>`;
  // city blocks and the survey grid (seeded, so every build draws the same streets)
  let seed = spec.id.length * 97 + 13;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blocks: string[] = [];
  const bs = S * 0.62;
  for (let by = w0 + bs * 0.1; by < w1; by += bs)
    for (let bx = w0 + bs * 0.1; bx < w1; bx += bs) {
      if (rnd() < 0.22) continue;
      blocks.push(`<rect x="${F(bx)}" y="${F(by)}" width="${F(bs * (0.7 + rnd() * 0.14))}" height="${F(bs * (0.7 + rnd() * 0.14))}" rx="${F(bs * 0.1)}"/>`);
    }
  const grid: string[] = [];
  const step = S * 0.65;
  const c = X(0);
  for (let k = -12; k <= 12; k++) {
    const v = c + k * step;
    if (v < w0 || v > w1) continue;
    grid.push(`M${F(v)} ${F(w0)} V${F(w1)} M${F(w0)} ${F(v)} H${F(w1)}`);
  }
  const unit = S * 1.25;
  const strokes = (pts: [number, number][], li: number, casing: boolean) => {
    const d = path(pts);
    if (casing) return `<path d="${d}" fill="none" stroke="#04070d" stroke-width="${F(S * 0.46)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
    const [main, light, deep] = LINE_COLORS[spec.lines[li].key];
    return `<path d="${d}" fill="none" stroke="${deep}" stroke-width="${F(S * 0.34)}" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="${main}" stroke-width="${F(S * 0.26)}" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${d}" fill="none" stroke="${light}" stroke-width="${F(S * 0.06)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.75"/>
      <path d="${d}" fill="none" stroke="${deep}" stroke-width="${F(S * 0.26)}" stroke-dasharray="${F(S * 0.03)} ${F(unit * 0.25 - S * 0.03)}" opacity="0.45"/>`;
  };
  const network = (full: boolean) => {
    const ls = spec.lines.map((l) => linePts(spec, l, full));
    return ls.map((p) => strokes(p, 0, true)).join('') + ls.map((p, li) => strokes(p, li, false)).join('');
  };
  // station housings (map.ts): interchanges ringed in cream with each line's colour, terminals in their line's colour
  const housings: string[] = [];
  spec.stations.forEach((st, si) => {
    const x = X(st.x);
    const y = X(st.y);
    const r = S * 0.46;
    const through = spec.lines.filter((l) => l.stops.includes(si));
    if (st.kind === 'interchange') {
      housings.push(`<circle cx="${F(x)}" cy="${F(y)}" r="${F(r * 1.18)}" fill="#04070d"/><circle cx="${F(x)}" cy="${F(y)}" r="${F(r * 1.1)}" fill="none" stroke="#f4ecd8" stroke-width="${F(S * 0.07)}"/>`);
      through.forEach((l, k) => {
        const [main] = LINE_COLORS[l.key];
        const a0 = ((k * 180 + 200) * Math.PI) / 180;
        const a1 = a0 + Math.PI * 0.45;
        const R = r * 1.1;
        housings.push(`<path d="M${F(x + Math.cos(a0) * R)} ${F(y + Math.sin(a0) * R)} A${F(R)} ${F(R)} 0 0 1 ${F(x + Math.cos(a1) * R)} ${F(y + Math.sin(a1) * R)}" fill="none" stroke="${main}" stroke-width="${F(S * 0.075)}" stroke-linecap="round"/>`);
      });
    } else if (st.kind === 'terminal') {
      const [main, , deep] = LINE_COLORS[(through[0] ?? spec.lines[0]).key];
      housings.push(`<circle cx="${F(x)}" cy="${F(y)}" r="${F(r * 1.18)}" fill="#04070d"/><circle cx="${F(x)}" cy="${F(y)}" r="${F(r * 1.1)}" fill="none" stroke="${main}" stroke-width="${F(S * 0.1)}"/><circle cx="${F(x)}" cy="${F(y)}" r="${F(r * 1.1)}" fill="none" stroke="${deep}" stroke-width="${F(S * 0.025)}" stroke-dasharray="${F(S * 0.05)} ${F(S * 0.07)}"/>`);
    } else housings.push(`<circle cx="${F(x)}" cy="${F(y)}" r="${F(r * 1.08)}" fill="#04070d"/>`);
    housings.push(`<circle cx="${F(x)}" cy="${F(y)}" r="${F(r)}" fill="url(#${id}face)" stroke="url(#${id}brass)" stroke-width="${F(S * 0.05)}"/>`);
    housings.push(`<path d="M${F(x - r * 0.93)} ${F(y)} H${F(x + r * 0.93)}" stroke="#000" stroke-width="${F(S * 0.02)}" opacity="0.8"/><path d="M${F(x - r * 0.9)} ${F(y + S * 0.018)} H${F(x + r * 0.9)}" stroke="#5a6a80" stroke-width="${F(S * 0.01)}" opacity="0.6"/>`);
    housings.push(`<circle cx="${F(x - r * 0.93)}" cy="${F(y)}" r="${F(S * 0.026)}" fill="#c9a85a"/><circle cx="${F(x + r * 0.93)}" cy="${F(y)}" r="${F(S * 0.026)}" fill="#c9a85a"/>`);
  });
  // the line's numeral on a diamond beside each of its terminals
  const badges: string[] = [];
  spec.lines.forEach((l) => {
    const [main, , deep] = LINE_COLORS[l.key];
    for (const end of [0, l.stops.length - 1]) {
      const si = l.stops[end];
      if (spec.stations[si].kind !== 'terminal') continue;
      const nb = spec.stations[l.stops[end === 0 ? 1 : end - 1]];
      const a = spec.stations[si];
      const dx = a.x - nb.x;
      const dy = a.y - nb.y;
      const n = Math.hypot(dx, dy) || 1;
      const off = spec.S * 0.7;
      const s = end === 0 ? 1 : -1;
      const px = X(a.x + (dx / n) * off * 0.2 + (-dy / n) * off * s);
      const py = X(a.y + (dy / n) * off * 0.2 + (dx / n) * off * s);
      const bw = S * 0.34;
      badges.push(`<g><rect x="${F(px - bw / 2)}" y="${F(py - bw / 2)}" width="${F(bw)}" height="${F(bw)}" rx="${F(bw * 0.22)}" transform="rotate(45 ${F(px)} ${F(py)})" fill="${main}" stroke="${deep}" stroke-width="${F(S * 0.025)}"/><text x="${F(px)}" y="${F(py + S * 0.06)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${F(S * 0.17)}" fill="#fffaf0">${LINE_NUMERALS[LINE_INDEX[l.key]]}</text></g>`);
    }
  });
  const defs = `${grad('gx', true)}${grad('gy', false)}${mask('gx')}${mask('gy')}
    <radialGradient id="${id}field" cx="0.5" cy="0.45" r="0.72"><stop offset="0" stop-color="#1e4373"/><stop offset="0.6" stop-color="#14305a"/><stop offset="1" stop-color="#0c1d3d"/></radialGradient>
    <radialGradient id="${id}face" cx="0.4" cy="0.3" r="0.8"><stop offset="0" stop-color="#2a3446"/><stop offset="0.7" stop-color="#121822"/><stop offset="1" stop-color="#07090e"/></radialGradient>
    <linearGradient id="${id}brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c2"/><stop offset="0.5" stop-color="#c9922e"/><stop offset="1" stop-color="#7d5313"/></linearGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F(W)} ${F(W)}" width="${F(W)}" height="${F(W)}"><defs>${defs}</defs>
    <g mask="url(#${id}mgx)"><g mask="url(#${id}mgy)">
      <rect x="${F(w0)}" y="${F(w0)}" width="${F(D)}" height="${F(D)}" fill="url(#${id}field)"/>
      <g fill="#2f5486" opacity="0.24">${blocks.join('')}</g>
      <path d="${grid.join(' ')}" stroke="#8fc0e4" stroke-width="${F(Math.max(0.6, S * 0.018))}" opacity="0.12"/>
      ${network(true)}
    </g></g>
    ${network(false)}
    ${housings.join('')}
    ${badges.join('')}
  </svg>`;
}

/** One line's neon glow (blurred), lit while a train runs it. */
export function miniGlowSvg(spec: MiniSpec, D: number, li: number): string {
  const W = D * (1 + MINI_PAD * 2);
  const X = (x: number) => (x + 0.5 + MINI_PAD) * D;
  const S = spec.S * D;
  const [main, light] = LINE_COLORS[spec.lines[li].key];
  const d = linePts(spec, spec.lines[li], true)
    .map(([x, y], i) => `${i ? 'L' : 'M'}${F(X(x))} ${F(X(y))}`)
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F(W)} ${F(W)}" width="${F(W)}" height="${F(W)}">
    <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${F(S * 0.17)}"/></filter></defs>
    <path d="${d}" fill="none" stroke="${main}" stroke-width="${F(S * 0.6)}" stroke-linejoin="round" stroke-linecap="round" filter="url(#b)"/>
    <path d="${d}" fill="none" stroke="${light}" stroke-width="${F(S * 0.09)}" stroke-linejoin="round" stroke-linecap="round" opacity="0.55"/>
  </svg>`;
}

/* ------------------------------------------------------------------------------------------
 * The Express Pass lever and the max-win sunburst
 * ---------------------------------------------------------------------------------------- */

export function leverBaseSvg(on: boolean): string {
  const id = nextId('lv');
  const plate = pill(8, 44, 144, 44);
  const slot = pill(34, 58, 92, 16);
  const screw = (x: number) => `<circle cx="${x}" cy="66" r="5.5" fill="${C.goldLight}" stroke="${C.ink}" stroke-width="2.2"/><path d="M${x - 3} ${66 - 3} L${x + 3} ${66 + 3}" stroke="${C.goldDeep}" stroke-width="1.8"/>`;
  return svgDoc(
    160,
    100,
    celDefs(id, 0.6),
    `<g filter="url(#${id}drop)">
    ${on ? `<path d="${pill(0, 36, 160, 60)}" fill="${C.volt}" opacity=".3"/>` : ''}
    <path d="${plate}" fill="${C.iron}" filter="url(#${id}cel)"/>
    <path d="${pill(13, 48, 134, 36)}" fill="none" stroke="${C.gold}" stroke-width="2" opacity=".8"/>
    <path d="${slot}" fill="${on ? C.volt : C.tunnel}"/>
    ${on ? `<path d="${pill(40, 61.5, 80, 9)}" fill="${C.voltCore}"/>` : ''}
    <path d="${slot}" fill="none" stroke="${C.ink}" stroke-width="3"/>
    ${screw(22)}${screw(138)}
    <path d="${plate}" fill="none" stroke="${C.ink}" stroke-width="4.5"/>
  </g>`,
  );
}

/** Lever handle: steel rod and maroon knob; pivot at (32, 116). 64 x 128. */
export function leverHandleSvg(): string {
  const id = nextId('lh');
  return svgDoc(
    64,
    128,
    celDefs(id, 0.4),
    `<path d="M32 116 L32 34" stroke="${C.ink}" stroke-width="13" stroke-linecap="round"/>
    <path d="M32 116 L32 34" stroke="${C.steel}" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 108 L30 40" stroke="${C.steelLight}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>
    <circle cx="32" cy="26" r="19" fill="${C.maroon}" filter="url(#${id}cel)"/>
    <circle cx="32" cy="26" r="19" fill="none" stroke="${C.ink}" stroke-width="4.5"/>
    <path d="M21 21 Q25 12 34 11" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".7"/>
    <circle cx="32" cy="116" r="8" fill="${C.gold}" stroke="${C.ink}" stroke-width="3.5"/>`,
  );
}

/** Sunburst rays behind the max-win demo. */
export function raysSvg(): string {
  let rays = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = a + Math.PI / 32;
    rays += `<path d="M128 128 L${F(128 + Math.cos(a) * 128)} ${F(128 + Math.sin(a) * 128)} L${F(128 + Math.cos(b) * 128)} ${F(128 + Math.sin(b) * 128)} Z" fill="${C.goldLight}" opacity="${i % 2 ? 0.55 : 0.85}"/>`;
  }
  return svgDoc(256, 256, '', rays);
}

/* ------------------------------------------------------------------------------------------
 * The demos' texture set
 * ---------------------------------------------------------------------------------------- */

export interface DemoArt {
  /** Top-down cars by `${line}L` (lead) / `${line}C`. */
  cars: Map<string, Texture>;
  /** Station symbols rasterised at the demos' size, by `${artKey}${'i' | 'w'}` (the rest come from the game's set). */
  sym: Map<string, Texture>;
  incident: Texture;
  boom: Texture;
  plates: Map<string, Texture>;
  /** Line glows by `${spec.id}:${line index}`. */
  glows: Map<string, Texture>;
  /** The POWER meter's little side-view train. */
  side: Texture;
  leverOff: Texture;
  leverOn: Texture;
  handle: Texture;
  rays: Texture;
}

/** Station symbols the demos draw crisp (art key, poses). */
const CRISP: [number, ('i' | 'w')[]][] = [
  [ART.COIN_BRONZE, ['i']],
  [ART.COIN_SILVER, ['i']],
  [ART.COIN_GOLD, ['i']],
  [ART.LOCO, ['i', 'w']],
  [ART.SIGNAL, ['i', 'w']],
  [ART.SECURITY, ['i', 'w']],
];

export async function buildDemoArt(o: { D: number; res: number; specs: MiniSpec[]; needs: Set<string> }): Promise<DemoArt> {
  const { D, res, specs, needs } = o;
  const maxS = Math.max(0.12, ...specs.map((s) => s.S)) * D;
  const symPx = Math.max(24, maxS * SYM_K * res * 1.08);
  const carW = Math.max(24, maxS * 1.15 * res);
  const jobs: Promise<unknown>[] = [];
  const art: DemoArt = {
    cars: new Map(),
    sym: new Map(),
    incident: Texture.EMPTY,
    boom: Texture.EMPTY,
    plates: new Map(),
    glows: new Map(),
    side: Texture.EMPTY,
    leverOff: Texture.EMPTY,
    leverOn: Texture.EMPTY,
    handle: Texture.EMPTY,
    rays: Texture.EMPTY,
  };
  const job = <T>(p: Promise<T>, put: (t: T) => void) => jobs.push(p.then(put));
  if (specs.length) {
    for (const key of LINE_KEYS)
      for (const lead of [true, false]) job(svgTexture(`splash-car-${key}${lead ? 'L' : 'C'}`, trainCarSvg(key, lead), carW, (carW * 96) / 240), (t) => art.cars.set(`${key}${lead ? 'L' : 'C'}`, t));
    for (const [key, poses] of CRISP)
      for (const p of poses) {
        const a = SYMBOL_ART[key];
        const svg = p === 'w' && a.win ? a.win() : a.idle();
        job(svgTexture(`splash-sym${key}${p}`, svg, symPx), (t) => art.sym.set(`${key}${p}`, t));
      }
    job(svgTexture('splash-sec-incident', securityCheck('incident'), symPx), (t) => (art.incident = t));
    for (const s of specs) {
      job(svgTexture(`splash-mini-${s.id}`, miniMapSvg(s, D), D * (1 + MINI_PAD * 2) * res), (t) => art.plates.set(s.id, t));
      s.lines.forEach((_, li) => job(svgTexture(`splash-mini-${s.id}-glow${li}`, miniGlowSvg(s, D, li), (D * (1 + MINI_PAD * 2) * res) / 2), (t) => art.glows.set(`${s.id}:${li}`, t)));
    }
  }
  if (needs.has('crash')) job(svgTexture('splash-boom', crashBoomSvg(5), maxS * 2.8 * res), (t) => (art.boom = t));
  if (needs.has('power')) job(svgTexture('splash-train', locoSide(false, false), Math.max(64, D * 0.5) * res, (Math.max(64, D * 0.5) * res) / 2), (t) => (art.side = t));
  if (needs.has('boost')) {
    job(svgTexture('splash-lever-off', leverBaseSvg(false), D * 0.7 * res), (t) => (art.leverOff = t));
    job(svgTexture('splash-lever-on', leverBaseSvg(true), D * 0.7 * res), (t) => (art.leverOn = t));
    job(svgTexture('splash-lever-handle', leverHandleSvg(), D * 0.3 * res), (t) => (art.handle = t));
  }
  if (needs.has('max')) {
    job(svgTexture('splash-rays', raysSvg(), D * 1.1 * res), (t) => (art.rays = t));
    const g = SYMBOL_ART[ART.LOCO_GOLD];
    job(svgTexture(`splash-sym${ART.LOCO_GOLD}i`, g.idle(), D * 0.7 * res), (t) => art.sym.set(`${ART.LOCO_GOLD}i`, t));
    if (g.win) {
      const win = g.win;
      job(svgTexture(`splash-sym${ART.LOCO_GOLD}w`, win(), D * 0.7 * res), (t) => art.sym.set(`${ART.LOCO_GOLD}w`, t));
    }
  }
  await Promise.all(jobs);
  return art;
}
