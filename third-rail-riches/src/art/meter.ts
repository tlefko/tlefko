/**
 * The POWER meter: an enamel sign strip over the reels. A label plate on the left, a short line of
 * track with station stops (x2, x3, x5, x10) and a brass multiplier seal on the right. The little
 * train that runs along it is train.ts art.
 *
 * Coordinates: the strip is drawn in a box `aspect * 100` wide and 100 tall (plus padding above and
 * below, see METER), so the renderer can stretch it to any meter rect without distorting the round
 * parts (the round parts are separate sprites).
 */
import { C, mix, nextId } from './kit';

export const METER = { padTop: 8, padBottom: 10, railY: 64 };

export interface MeterLayout {
  /** Box width / height. */
  aspect: number;
  /** Label plate width (box units). */
  labelW: number;
  /** Track start / end x (box units). */
  trackX0: number;
  trackX1: number;
  /** Seal centre x (box units). */
  sealX: number;
}

const f = (n: number) => n.toFixed(1);

/** The strip: enamel back plate, label plate, track bed (rails on sleepers), seal mount. */
export function meterBack(L: MeterLayout): string {
  const W = L.aspect * 100;
  const H = 100 + METER.padTop + METER.padBottom;
  const id = nextId('mt');
  const y0 = METER.padTop;
  const plate = `M${f(L.labelW * 0.35)} ${y0 + 14} H${f(W - 30)} Q${f(W - 8)} ${y0 + 14} ${f(W - 8)} ${y0 + 36} V${y0 + 78} Q${f(W - 8)} ${y0 + 96} ${f(W - 30)} ${y0 + 96} H${f(L.labelW * 0.35)} Z`;
  const label = `M6 ${y0 + 8} H${f(L.labelW - 6)} Q${f(L.labelW + 8)} ${y0 + 8} ${f(L.labelW + 8)} ${y0 + 26} V${y0 + 84} Q${f(L.labelW + 8)} ${y0 + 100} ${f(L.labelW - 6)} ${y0 + 100} H6 Q-8 ${y0 + 100} -8 ${y0 + 84} V${y0 + 26} Q-8 ${y0 + 8} 6 ${y0 + 8} Z`;
  const ry = y0 + METER.railY;
  let sleepers = '';
  for (let x = L.trackX0 + 6; x < L.trackX1 - 2; x += 15) sleepers += `<rect x="${f(x)}" y="${ry - 9}" width="8" height="22" rx="2" fill="${C.woodMid}" stroke="${C.ink}" stroke-width="2.2"/>`;
  let rivets = '';
  for (let x = L.labelW + 30; x < W - 40; x += 60) rivets += `<circle cx="${f(x)}" cy="${y0 + 22}" r="3" fill="${C.ironLight}" stroke="${C.ink}" stroke-width="1.6"/><circle cx="${f(x)}" cy="${y0 + 90}" r="3" fill="${C.ironLight}" stroke="${C.ink}" stroke-width="1.6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 ${f(W + 20)} ${H}" width="${f(W + 20)}" height="${H}" preserveAspectRatio="none">
  <defs>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(C.iron, C.ironLight, 0.25)}"/><stop offset=".55" stop-color="${C.iron}"/><stop offset="1" stop-color="${C.ironDeep}"/></linearGradient>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.emeraldLight}"/><stop offset=".45" stop-color="${C.emerald}"/><stop offset="1" stop-color="${C.emeraldDeep}"/></linearGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.steelLight}"/><stop offset="1" stop-color="${C.steelDeep}"/></linearGradient>
    <filter id="${id}d" x="-5%" y="-20%" width="110%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/><feOffset dy="4"/><feComponentTransfer><feFuncA type="linear" slope=".55"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g filter="url(#${id}d)">
    <path d="${plate}" fill="url(#${id}p)" stroke="${C.ink}" stroke-width="4"/>
    <path d="M${f(L.labelW * 0.35 + 6)} ${y0 + 20} H${f(W - 30)}" stroke="${C.goldDeep}" stroke-width="2.5" opacity=".9"/>
    <path d="M${f(L.labelW * 0.35 + 6)} ${y0 + 90} H${f(W - 30)}" stroke="${C.goldDeep}" stroke-width="2.5" opacity=".9"/>
    ${rivets}
    <rect x="${f(L.trackX0)}" y="${ry - 12}" width="${f(L.trackX1 - L.trackX0)}" height="28" rx="6" fill="${C.ironDeep}" opacity=".85"/>
    ${sleepers}
    <rect x="${f(L.trackX0)}" y="${ry - 6}" width="${f(L.trackX1 - L.trackX0)}" height="5" rx="2" fill="url(#${id}r)" stroke="${C.ink}" stroke-width="1.6"/>
    <rect x="${f(L.trackX0)}" y="${ry + 6}" width="${f(L.trackX1 - L.trackX0)}" height="5" rx="2" fill="url(#${id}r)" stroke="${C.ink}" stroke-width="1.6"/>
    <path d="${label}" fill="url(#${id}l)" stroke="${C.ink}" stroke-width="4.5"/>
    <path d="M2 ${y0 + 18} H${f(L.labelW - 4)}" stroke="${C.emeraldLight}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    <path d="M2 ${y0 + 92} H${f(L.labelW - 4)}" stroke="${C.goldDeep}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    <circle cx="${f(L.sealX)}" cy="${y0 + 54}" r="44" fill="${C.ironDeep}" stroke="${C.ink}" stroke-width="4"/>
  </g>
</svg>`;
}

/** The lit stretch of rail (an electric-blue glow along both rails), revealed up to the train. */
export function meterRailLit(L: MeterLayout): string {
  const W = L.aspect * 100;
  const H = 100 + METER.padTop + METER.padBottom;
  const ry = METER.padTop + METER.railY;
  const id = nextId('ml');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 ${f(W + 20)} ${H}" width="${f(W + 20)}" height="${H}" preserveAspectRatio="none">
  <defs><filter id="${id}g" x="-5%" y="-100%" width="110%" height="300%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
  <g filter="url(#${id}g)"><rect x="${f(L.trackX0)}" y="${ry - 9}" width="${f(L.trackX1 - L.trackX0)}" height="24" rx="10" fill="${C.volt}" opacity=".75"/></g>
  <rect x="${f(L.trackX0)}" y="${ry - 6}" width="${f(L.trackX1 - L.trackX0)}" height="5" rx="2" fill="${C.voltLight}"/>
  <rect x="${f(L.trackX0)}" y="${ry + 6}" width="${f(L.trackX1 - L.trackX0)}" height="5" rx="2" fill="${C.voltLight}"/>
</svg>`;
}

/** A station stop: a round enamel disc on a post. lit = emerald with a gold ring and a glow. */
export function stationStop(lit: boolean): string {
  const face = lit ? C.emerald : C.iron;
  const faceL = lit ? C.emeraldLight : C.ironLight;
  const ring = lit ? C.gold : C.steelDeep;
  const id = nextId('ss');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs><radialGradient id="${id}f" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${faceL}"/><stop offset=".6" stop-color="${face}"/><stop offset="1" stop-color="${mix(face, C.ink, 0.45)}"/></radialGradient></defs>
  ${lit ? `<circle cx="64" cy="64" r="60" fill="${C.emeraldLight}" opacity=".35"/>` : ''}
  <circle cx="64" cy="64" r="50" fill="${ring}" stroke="${C.ink}" stroke-width="6"/>
  <circle cx="64" cy="64" r="40" fill="url(#${id}f)" stroke="${C.ink}" stroke-width="4"/>
  <path d="M40 44 Q52 32 70 32" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity="${lit ? 0.7 : 0.35}"/>
</svg>`;
}

/** The brass multiplier seal (the number is printed by the game). */
export function multSeal(hot = false): string {
  const id = nextId('ms');
  const rim = hot ? C.amber : C.gold;
  let teeth = '';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    teeth += `<circle cx="${f(64 + Math.cos(a) * 54)}" cy="${f(64 + Math.sin(a) * 54)}" r="6" fill="${rim}" stroke="${C.ink}" stroke-width="2.5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs><radialGradient id="${id}f" cx=".4" cy=".3" r=".85"><stop offset="0" stop-color="${C.goldLight}"/><stop offset=".55" stop-color="${C.gold}"/><stop offset="1" stop-color="${C.goldDeep}"/></radialGradient>
  <radialGradient id="${id}c" cx=".45" cy=".35" r=".8"><stop offset="0" stop-color="${hot ? C.maroonLight : C.uniformLight}"/><stop offset="1" stop-color="${hot ? C.maroonDeep : C.uniformDeep}"/></radialGradient></defs>
  ${teeth}
  <circle cx="64" cy="64" r="52" fill="url(#${id}f)" stroke="${C.ink}" stroke-width="5"/>
  <circle cx="64" cy="64" r="38" fill="url(#${id}c)" stroke="${C.ink}" stroke-width="4"/>
  <path d="M38 50 Q48 34 68 32" stroke="#ffffff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>
</svg>`;
}
