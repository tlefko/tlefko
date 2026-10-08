/**
 * Third Rail Riches environment: an art-deco subway station at midnight (docs/ART.md).
 *
 * The station pieces live in station.ts; this file composes the static ones into one backdrop per
 * layout (stationBackdrop) and re-exports everything the renderer needs. Back to front: the dark
 * vault with a riveted girder, the mosaic frieze, the cream glazed tile wall with its emerald
 * band and deep wainscot, engaged cast-iron columns, posters and enamel signs, warm pools of
 * lamplight, the track pit (third rail on its insulators, running rails on sleepers), the two
 * tunnel mouths with their signal heads, then the near platform: coping, yellow safety strip and
 * terrazzo floor, with a bench, a vending machine, a litter bin and a vent grate.
 *
 * render/scene/Background.ts animates the living parts on top (lamps, clock, signals, pigeons,
 * sparks, dust, passing headlights, the Rush Hour crowd); render/grid/Reels.ts builds the
 * train-window reel frame (carFrame).
 */
import { C, f, mix, rng } from './kit';
import {
  svg,
  ink,
  lin,
  radial,
  place,
  ironRivet,
  tilePattern,
  tileVariation,
  mosaicPattern,
  emeraldPattern,
  ironColumn,
  tunnelPortal,
  signalHead,
  enamelSign,
  poster,
  bench,
  vendingMachine,
  litterBin,
  floorGrate,
  TUNNEL,
  SIGNAL,
} from './station';

export * from './station';
export { mix, rng };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PropKind = 'bench' | 'vending' | 'bin';

/** Where each prop's feet sit in its box (fraction of the height) and its aspect (h / w). */
export const PROP_BOX: Record<PropKind, { foot: number; aspect: number; art: () => string }> = {
  bench: { foot: 172 / 180, aspect: 180 / 360, art: bench },
  vending: { foot: 326 / 330, aspect: 330 / 150, art: vendingMachine },
  bin: { foot: 200 / 204, aspect: 204 / 120, art: litterBin },
};

/** Everything the backdrop needs for one layout, in CSS px (the raster is scaled by the caller). */
export interface BackdropSpec {
  w: number;
  h: number;
  /** Cell size: the scale of every detail. */
  S: number;
  /** Bottom of the ceiling girder (the frieze starts here). */
  ceilY: number;
  /** Top of the emerald band. */
  bandY: number;
  /** Foot of the far wall = back of the track pit. */
  baseY: number;
  /** Near platform edge (front of the track pit). */
  lipY: number;
  /** Deck line the characters stand on. */
  floorY: number;
  /** Tunnel portals: left x and width (their bottom sits on lipY). */
  tunnels: { x: number; w: number; side: -1 | 1 }[];
  signals: { x: number; y: number; h: number }[];
  /** Engaged columns: centre x and box width. */
  columns: { x: number; w: number }[];
  posters: { x: number; y: number; w: number; kind: 0 | 1 | 2 }[];
  signs: { x: number; y: number; w: number; kind: 0 | 1 | 2 }[];
  /** Props on the near platform: centre x, width, feet y. */
  props: { kind: PropKind; x: number; w: number; y: number }[];
  grates: { x: number; y: number; w: number }[];
  /** Lamp globe centres: baked warm pools on the wall and floor. */
  lamps: { x: number; y: number }[];
  /** Areas kept quiet (no posters / signs). */
  calm?: Box[];
}

/** Track pit layout as fractions of its height (baseY..lipY): the third rail and the running rails. */
export const PIT = { third: 0.3, railFar: 0.6, railNear: 0.9 };

/**
 * The static station for one layout as one SVG (CSS px units). Animated parts (lamps, clock,
 * signal glows, sparks, headlights) are separate sprites laid over it.
 */
export function stationBackdrop(s: BackdropSpec): string {
  const { w, h, S } = s;
  const R = rng(5);
  const id = `st${Math.round(w)}x${Math.round(h)}`;
  const lw = Math.max(1.2, S * 0.022);
  const tw = Math.max(9, Math.min(34, S * 0.21));
  const th = tw / 2;
  const fh = Math.max(7, S * 0.15); // frieze height
  const bh = Math.max(6, S * 0.13); // emerald band height
  const gH = Math.max(6, S * 0.16); // girder depth
  const mos = fh / 5;
  const defs: string[] = [];
  defs.push(tilePattern(`${id}t`, tw, th, 0), tilePattern(`${id}tw`, tw, th, 1), tileVariation(`${id}tv`, tw, th, 7), mosaicPattern(`${id}m`, mos), emeraldPattern(`${id}e`, bh * 0.62));
  let out = '';

  // ---- vault + girder
  const ceilY = s.ceilY;
  defs.push(lin(`${id}vault`, [[0, C.ink], [1, mix(C.iron, C.ink, 0.45)]]));
  out += `<rect x="0" y="0" width="${f(w)}" height="${f(ceilY + 1)}" fill="url(#${id}vault)"/>`;
  // faint vault ribs
  for (let x = S * 0.6; x < w; x += S * 1.7) out += `<path d="M${f(x)} 0 V${f(ceilY - gH)}" stroke="${C.ironDeep}" stroke-width="${f(S * 0.05)}" opacity=".7"/>`;
  const gy = ceilY - gH;
  defs.push(lin(`${id}gird`, [[0, mix(C.ironLight, C.iron, 0.4)], [0.18, C.iron], [0.8, C.ironDeep], [1, C.ink]]));
  out += `<rect x="-4" y="${f(gy)}" width="${f(w + 8)}" height="${f(gH)}" fill="url(#${id}gird)"/>`;
  out += `<path d="M0 ${f(gy + gH * 0.16)} H${f(w)}" stroke="${C.ironLight}" stroke-width="${f(lw * 0.7)}" opacity=".5"/>`;
  let rv = '';
  for (let x = S * 0.25; x < w; x += S * 0.32) rv += ironRivet(x, gy + gH * 0.55, Math.max(0.9, S * 0.018));
  out += rv;
  // girder stiffeners
  for (let x = S * 0.9; x < w; x += S * 1.7) out += `<rect x="${f(x - S * 0.03)}" y="${f(gy)}" width="${f(S * 0.06)}" height="${f(gH)}" fill="${C.ironDeep}"/>`;
  out += ink(`<path d="M-4 ${f(gy)} H${f(w + 4)} M-4 ${f(ceilY)} H${f(w + 4)}"/>`, lw);

  // ---- frieze: emerald cornice, mosaic, gold pin line
  const fy = ceilY;
  out += `<rect x="0" y="${f(fy)}" width="${f(w)}" height="${f(fh)}" fill="url(#${id}m)"/>`;
  out += `<rect x="0" y="${f(fy)}" width="${f(w)}" height="${f(Math.max(1.5, fh * 0.12))}" fill="${C.emeraldDeep}"/>`;
  out += `<rect x="0" y="${f(fy + fh)}" width="${f(w)}" height="${f(Math.max(1, fh * 0.1))}" fill="${C.gold}"/>`;

  // ---- tile field, emerald band, wainscot
  const t0 = fy + fh + Math.max(1, fh * 0.1);
  const bandY = s.bandY;
  const baseY = s.baseY;
  out += `<rect x="0" y="${f(t0)}" width="${f(w)}" height="${f(bandY - t0)}" fill="url(#${id}t)"/>`;
  out += `<rect x="0" y="${f(t0)}" width="${f(w)}" height="${f(bandY - t0)}" fill="url(#${id}tv)"/>`;
  out += `<rect x="0" y="${f(bandY + bh)}" width="${f(w)}" height="${f(baseY - bandY - bh)}" fill="url(#${id}tw)"/>`;
  out += `<rect x="0" y="${f(bandY + bh)}" width="${f(w)}" height="${f(baseY - bandY - bh)}" fill="url(#${id}tv)"/>`;
  out += `<rect x="0" y="${f(bandY + bh)}" width="${f(w)}" height="${f(baseY - bandY - bh)}" fill="${C.emeraldDeep}" opacity=".16"/>`;
  out += `<rect x="0" y="${f(bandY)}" width="${f(w)}" height="${f(bh)}" fill="url(#${id}e)"/>`;
  out += `<rect x="0" y="${f(bandY + bh * 0.62)}" width="${f(w)}" height="${f(bh * 0.38)}" fill="url(#${id}m)" opacity=".9"/>`;
  out += `<rect x="0" y="${f(bandY - Math.max(1, bh * 0.1))}" width="${f(w)}" height="${f(Math.max(1, bh * 0.1))}" fill="${C.gold}"/>`;
  out += `<rect x="0" y="${f(bandY + bh)}" width="${f(w)}" height="${f(Math.max(1.5, bh * 0.16))}" fill="${C.ink}" opacity=".35"/>`;

  // ---- night: the whole wall sits in shadow, lifted by the lamps
  defs.push(
    lin(`${id}night`, [
      [0, C.ink, 0.72],
      [0.12, C.nightDeep, 0.58],
      [0.5, C.nightDeep, 0.42],
      [1, C.nightDeep, 0.6],
    ], 0, 1, `gradientUnits="userSpaceOnUse" x1="0" y1="${f(ceilY)}" x2="0" y2="${f(baseY)}"`),
  );
  out += `<rect x="0" y="${f(ceilY)}" width="${f(w)}" height="${f(baseY - ceilY)}" fill="url(#${id}night)"/>`;
  // side vignette
  defs.push(lin(`${id}vig`, [[0, C.ink, 0.45], [0.18, C.ink, 0], [0.82, C.ink, 0], [1, C.ink, 0.45]], 1, 0));
  out += `<rect x="0" y="0" width="${f(w)}" height="${f(baseY)}" fill="url(#${id}vig)"/>`;
  // warm pools of lamplight
  s.lamps.forEach((l, i) => {
    defs.push(radial(`${id}pool${i}`, [[0, C.amber, 0.34], [0.35, C.amber, 0.14], [1, C.amber, 0]], `gradientUnits="userSpaceOnUse" cx="${f(l.x)}" cy="${f(l.y + S * 0.4)}" r="${f(S * 2.6)}"`));
    out += `<rect x="0" y="${f(ceilY)}" width="${f(w)}" height="${f(baseY - ceilY)}" fill="url(#${id}pool${i})"/>`;
  });

  // ---- columns, posters, signs
  for (const c of s.columns) {
    const top = ceilY - gH * 0.6;
    const ch = baseY + S * 0.04 - top;
    const units = Math.max(220, (ch / c.w) * 100);
    out += `<rect x="${f(c.x + c.w * 0.2)}" y="${f(top)}" width="${f(c.w * 0.5)}" height="${f(ch)}" fill="${C.ink}" opacity=".3"/>`;
    out += place(ironColumn(Math.round(units)), c.x - c.w / 2, top, c.w, ch);
  }
  for (const p of s.posters) out += place(poster(p.kind), p.x, p.y, p.w);
  for (const g of s.signs) out += place(enamelSign(g.kind), g.x, g.y, g.w);

  // ---- track pit
  const P = s.lipY - baseY;
  const pitTop = baseY;
  defs.push(lin(`${id}pw`, [[0, mix(C.iron, C.tunnel, 0.55)], [1, C.tunnel]]));
  defs.push(lin(`${id}pf`, [[0, mix(C.tunnel, C.ink, 0.3)], [1, mix(C.tunnel, C.iron, 0.25)]]));
  out += `<rect x="0" y="${f(pitTop)}" width="${f(w)}" height="${f(P * 0.42)}" fill="url(#${id}pw)"/>`;
  out += `<rect x="0" y="${f(pitTop + P * 0.42)}" width="${f(w)}" height="${f(P * 0.58 + 2)}" fill="url(#${id}pf)"/>`;
  // grime streaks on the pit wall
  for (let x = R() * S; x < w; x += S * (0.5 + R() * 0.8)) out += `<path d="M${f(x)} ${f(pitTop)} v${f(P * (0.15 + R() * 0.2))}" stroke="${C.ink}" stroke-width="${f(S * 0.04)}" opacity=".35" stroke-linecap="round"/>`;
  // ballast: speckles
  const bal = Math.max(2, S * 0.05);
  defs.push(`<pattern id="${id}bal" patternUnits="userSpaceOnUse" width="${f(bal * 4)}" height="${f(bal * 3)}">
    <circle cx="${f(bal * 0.8)}" cy="${f(bal * 0.7)}" r="${f(bal * 0.42)}" fill="${C.ironLight}" opacity=".22"/>
    <circle cx="${f(bal * 2.6)}" cy="${f(bal * 1.6)}" r="${f(bal * 0.5)}" fill="${C.g4}" opacity=".3"/>
    <circle cx="${f(bal * 1.6)}" cy="${f(bal * 2.5)}" r="${f(bal * 0.36)}" fill="${C.ironLight}" opacity=".18"/></pattern>`);
  out += `<rect x="0" y="${f(pitTop + P * 0.44)}" width="${f(w)}" height="${f(P * 0.56)}" fill="url(#${id}bal)"/>`;
  // sleepers (foreshortened: short, slightly wider toward the viewer)
  const sp = Math.max(8, S * 0.3);
  const yS0 = pitTop + P * PIT.railFar - P * 0.12;
  const yS1 = s.lipY;
  defs.push(`<pattern id="${id}sl" patternUnits="userSpaceOnUse" width="${f(sp)}" height="${f(yS1 - yS0)}" y="${f(yS0)}">
    <path d="M${f(sp * 0.3)} 0 H${f(sp * 0.62)} L${f(sp * 0.68)} ${f(yS1 - yS0)} H${f(sp * 0.24)} Z" fill="${mix(C.woodDeep, C.ink, 0.35)}"/>
    <path d="M${f(sp * 0.3)} 0 L${f(sp * 0.24)} ${f(yS1 - yS0)}" stroke="${C.woodMid}" stroke-width="${f(Math.max(0.6, S * 0.012))}" opacity=".5"/></pattern>`);
  out += `<rect x="0" y="${f(yS0)}" width="${f(w)}" height="${f(yS1 - yS0)}" fill="url(#${id}sl)"/>`;
  // running rails
  const rail = (y: number, k: number) => {
    const rh = Math.max(2, S * 0.05 * k);
    return `<rect x="0" y="${f(y - rh * 0.4)}" width="${f(w)}" height="${f(rh * 1.3)}" fill="${C.ink}" opacity=".7"/>
      <rect x="0" y="${f(y - rh * 0.5)}" width="${f(w)}" height="${f(rh)}" fill="${C.steelDeep}"/>
      <rect x="0" y="${f(y - rh * 0.5)}" width="${f(w)}" height="${f(Math.max(0.8, rh * 0.32))}" fill="${C.steelLight}" opacity=".75"/>`;
  };
  out += rail(pitTop + P * PIT.railFar, 0.85) + rail(pitTop + P * PIT.railNear, 1);
  // third rail: insulator pots, the rail, its timber cover board on brackets
  const y3 = pitTop + P * PIT.third;
  const r3 = Math.max(2, S * 0.05);
  for (let x = S * 0.3; x < w; x += S * 0.75) {
    out += `<rect x="${f(x - r3 * 0.7)}" y="${f(y3 + r3 * 0.4)}" width="${f(r3 * 1.4)}" height="${f(r3 * 1.4)}" rx="${f(r3 * 0.4)}" fill="${mix(C.paperWarm, C.g3, 0.5)}"/>`;
    out += `<path d="M${f(x)} ${f(y3 - r3 * 2.3)} V${f(y3)}" stroke="${C.ironDeep}" stroke-width="${f(Math.max(1, r3 * 0.5))}"/>`;
  }
  defs.push(`<filter id="${id}vb" x="-5%" y="-300%" width="110%" height="700%"><feGaussianBlur stdDeviation="${f(Math.max(1.2, S * 0.05))}"/></filter>`);
  out += `<rect x="0" y="${f(y3 - r3 * 0.6)}" width="${f(w)}" height="${f(r3 * 1.4)}" fill="${C.volt}" opacity=".55" filter="url(#${id}vb)"/>`;
  out += `<rect x="0" y="${f(y3 - r3 * 0.5)}" width="${f(w)}" height="${f(r3)}" fill="${C.steelDeep}"/>`;
  out += `<rect x="0" y="${f(y3 - r3 * 0.5)}" width="${f(w)}" height="${f(Math.max(0.8, r3 * 0.35))}" fill="${C.voltLight}" opacity=".8"/>`;
  out += `<rect x="0" y="${f(y3 - r3 * 2.6)}" width="${f(w)}" height="${f(r3 * 1.1)}" fill="${mix(C.woodDark, C.ink, 0.25)}"/>`;
  out += `<rect x="0" y="${f(y3 - r3 * 2.6)}" width="${f(w)}" height="${f(Math.max(0.6, r3 * 0.25))}" fill="${C.woodMid}" opacity=".6"/>`;
  // shade under the near platform's lip
  defs.push(lin(`${id}lip`, [[0, C.ink, 0], [1, C.ink, 0.7]]));
  out += `<rect x="0" y="${f(s.lipY - P * 0.4)}" width="${f(w)}" height="${f(P * 0.4 + 1)}" fill="url(#${id}lip)"/>`;

  // ---- tunnels + signals
  for (const t of s.tunnels) {
    const th2 = (t.w * TUNNEL.h) / TUNNEL.w;
    out += place(tunnelPortal(t.side), t.x, s.lipY - th2, t.w, th2);
  }
  for (const g of s.signals) out += place(signalHead(), g.x - (g.h * SIGNAL.w) / SIGNAL.h / 2, g.y, (g.h * SIGNAL.w) / SIGNAL.h, g.h);

  // ---- near platform: coping, yellow safety strip, terrazzo floor
  const cH = Math.max(3, S * 0.07);
  const yH = Math.max(3, S * 0.085);
  const fl0 = s.lipY + cH + yH;
  defs.push(lin(`${id}cop`, [[0, mix(C.g2, C.paperWarm, 0.2)], [1, C.g3]]));
  defs.push(lin(`${id}flr`, [[0, mix(C.g4, C.woodDark, 0.18)], [0.5, mix(C.g5, C.woodDeep, 0.2)], [1, mix(C.g5, C.ink, 0.5)]], 0, 1, `gradientUnits="userSpaceOnUse" x1="0" y1="${f(fl0)}" x2="0" y2="${f(h)}"`));
  out += `<rect x="0" y="${f(s.lipY)}" width="${f(w)}" height="${f(cH)}" fill="url(#${id}cop)"/>`;
  for (let x = S * 0.2; x < w; x += S * 0.9) out += `<path d="M${f(x)} ${f(s.lipY)} v${f(cH)}" stroke="${C.g4}" stroke-width="${f(lw * 0.6)}"/>`;
  const dot = Math.max(2.4, yH * 0.5);
  defs.push(`<pattern id="${id}tac" patternUnits="userSpaceOnUse" width="${f(dot)}" height="${f(dot)}" y="${f(s.lipY + cH)}"><circle cx="${f(dot / 2)}" cy="${f(dot / 2)}" r="${f(dot * 0.22)}" fill="${C.goldDeep}" opacity=".55"/></pattern>`);
  out += `<rect x="0" y="${f(s.lipY + cH)}" width="${f(w)}" height="${f(yH)}" fill="${mix(C.gold, C.parrotYellow, 0.4)}"/>`;
  out += `<rect x="0" y="${f(s.lipY + cH)}" width="${f(w)}" height="${f(yH)}" fill="url(#${id}tac)"/>`;
  out += `<rect x="0" y="${f(fl0)}" width="${f(w)}" height="${f(h - fl0 + 1)}" fill="url(#${id}flr)"/>`;
  // terrazzo joints in gentle perspective (vanishing point high above the centre)
  const vx = w / 2;
  let joints = '';
  for (let x = -w; x < w * 2; x += S * 1.1) {
    const x1 = vx + (x - vx) * (1 + (h - fl0) / (S * 4));
    joints += `<path d="M${f(x)} ${f(fl0)} L${f(x1)} ${f(h)}"/>`;
  }
  for (let k = 1; k < 6; k++) {
    const y = fl0 + (h - fl0) * Math.pow(k / 6, 1.4);
    joints += `<path d="M0 ${f(y)} H${f(w)}"/>`;
  }
  out += `<g stroke="${C.ink}" stroke-width="${f(lw * 0.55)}" opacity=".3" fill="none">${joints}</g>`;
  // terrazzo chips
  let chips = '';
  for (let i = 0; i < Math.min(600, (w * (h - fl0)) / (S * S * 0.05)); i++) {
    const x = R() * w;
    const y = fl0 + R() * (h - fl0);
    chips += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(Math.max(0.5, S * 0.012 * (0.6 + R())))}" fill="${R() < 0.5 ? C.paperWarm : C.g2}" opacity=".18"/>`;
  }
  out += chips;
  out += ink(`<path d="M-4 ${f(s.lipY)} H${f(w + 4)}"/>`, lw * 1.1);
  out += `<path d="M0 ${f(s.lipY + lw * 0.9)} H${f(w)}" stroke="${C.paperWarm}" stroke-width="${f(lw * 0.6)}" opacity=".45"/>`;
  // floor lit under the lamps, darker away from them
  s.lamps.forEach((l, i) => {
    defs.push(radial(`${id}fp${i}`, [[0, C.amber, 0.22], [1, C.amber, 0]], `gradientUnits="userSpaceOnUse" cx="${f(l.x)}" cy="${f(fl0 + S * 0.2)}" r="${f(S * 2.2)}" gradientTransform="translate(${f(l.x)} ${f(fl0)}) scale(1 .35) translate(${f(-l.x)} ${f(-fl0)})"`));
    out += `<rect x="0" y="${f(s.lipY)}" width="${f(w)}" height="${f(h - s.lipY)}" fill="url(#${id}fp${i})"/>`;
  });

  // ---- grates and props on the platform
  for (const g of s.grates) out += place(floorGrate(), g.x - g.w / 2, g.y, g.w, g.w * 0.21);
  for (const p of s.props) {
    const b = PROP_BOX[p.kind];
    const ph = p.w * b.aspect;
    out += place(b.art(), p.x - p.w / 2, p.y - ph * b.foot, p.w, ph);
  }
  return svg(w, h, out, defs.join(''));
}
