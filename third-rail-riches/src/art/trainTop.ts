/**
 * Trains on the map, seen from above: a three-car subway set (lead car + two cars) in the house ink
 * + cel style. A car points RIGHT (+x) in its own space; the renderer rotates it along the track.
 * viewBox 240 x 96; the body is ~200 x 64, centred, so the cars couple ~8 units apart.
 *
 * Each set wears its starting line's colour as the waist stripe; the Golden Locomotive of Last Train
 * is gilded. Roofs are cream enamel with vents and a walkway; the lead car has a wrapped dark
 * windscreen, two headlamps and a marker lamp.
 */
import { LINE_COLORS } from './map';
import type { Line } from '../math/network';

const W = 240;
const H = 96;
const INK = '#14100e';

interface Tones {
  body: string;
  bodyLight: string;
  bodyDeep: string;
  roof: string;
  roofShade: string;
  nose: string;
  noseDeep: string;
}

function tones(line: Line['key'], golden: boolean): Tones {
  if (golden) return { body: '#f2b632', bodyLight: '#ffe79a', bodyDeep: '#9a6410', roof: '#fff3cf', roofShade: '#e2c27a', nose: '#fff6dc', noseDeep: '#c99a3a' };
  const [main, light, deep] = LINE_COLORS[line];
  return { body: main, bodyLight: light, bodyDeep: deep, roof: '#f1eadb', roofShade: '#c8bda6', nose: '#ffc93c', noseDeep: '#c4860f' };
}

/** One car. `lead`: the front car (safety-yellow nose, windscreen, headlamps). `lit`: headlamps on. */
export function trainCarSvg(line: Line['key'], lead: boolean, golden = false, lit = true): string {
  const t = tones(line, golden);
  const x0 = 16;
  const x1 = 226;
  const y0 = 14;
  const y1 = 82;
  const cy = (y0 + y1) / 2;
  const r = 16;
  const body = lead
    ? `M${x0 + r} ${y0} H${x1 - 40} C${x1 - 12} ${y0} ${x1} ${y0 + 14} ${x1} ${cy} C${x1} ${y1 - 14} ${x1 - 12} ${y1} ${x1 - 40} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`
    : `M${x0 + r} ${y0} H${x1 - r} Q${x1} ${y0} ${x1} ${y0 + r} V${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} H${x0 + r} Q${x0} ${y1} ${x0} ${y1 - r} V${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} Z`;
  const rx0 = x0 + 12;
  const rx1 = lead ? x1 - 46 : x1 - 12;
  // windows: a row along each side
  const wins: string[] = [];
  const n = lead ? 5 : 6;
  for (let i = 0; i < n; i++) {
    const wx = rx0 + 6 + i * ((rx1 - rx0 - 12) / n);
    const ww = (rx1 - rx0 - 12) / n - 6;
    wins.push(`<rect x="${wx.toFixed(1)}" y="${y0 + 4}" width="${ww.toFixed(1)}" height="7" rx="2" fill="#1a2433"/><rect x="${wx.toFixed(1)}" y="${y1 - 11}" width="${ww.toFixed(1)}" height="7" rx="2" fill="#1a2433"/>`);
    wins.push(`<path d="M${(wx + 2).toFixed(1)} ${y0 + 6} h${(ww * 0.4).toFixed(1)}" stroke="#bfe3ff" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`);
  }
  const vents: string[] = [];
  for (let i = 0; i < 3; i++) {
    const vx = rx0 + 26 + i * ((rx1 - rx0 - 52) / 2);
    vents.push(`<rect x="${(vx - 11).toFixed(1)}" y="${cy - 10}" width="22" height="20" rx="5" fill="${t.roofShade}" stroke="${INK}" stroke-width="2.6"/>
      <path d="M${(vx - 6).toFixed(1)} ${cy - 5} H${(vx + 6).toFixed(1)} M${(vx - 6).toFixed(1)} ${cy} H${(vx + 6).toFixed(1)} M${(vx - 6).toFixed(1)} ${cy + 5} H${(vx + 6).toFixed(1)}" stroke="${INK}" stroke-width="1.8" opacity="0.7"/>`);
  }
  const nose = lead
    ? `<path d="M${x1 - 44} ${y0 + 1} H${x1 - 40} C${x1 - 12} ${y0 + 1} ${x1 - 1} ${y0 + 14} ${x1 - 1} ${cy} C${x1 - 1} ${y1 - 14} ${x1 - 12} ${y1 - 1} ${x1 - 40} ${y1 - 1} H${x1 - 44} Z" fill="${t.nose}"/>
       <path d="M${x1 - 44} ${y1 - 1} H${x1 - 40} C${x1 - 12} ${y1 - 1} ${x1 - 1} ${y1 - 14} ${x1 - 1} ${cy} L${x1 - 6} ${cy} C${x1 - 6} ${y1 - 18} ${x1 - 16} ${y1 - 7} ${x1 - 44} ${y1 - 7} Z" fill="${t.noseDeep}" opacity="0.7"/>
       <path d="M${x1 - 38} ${y0 + 9} C${x1 - 22} ${y0 + 10} ${x1 - 13} ${y0 + 18} ${x1 - 12} ${cy} C${x1 - 13} ${y1 - 18} ${x1 - 22} ${y1 - 10} ${x1 - 38} ${y1 - 9} C${x1 - 31} ${y1 - 20} ${x1 - 31} ${y0 + 20} ${x1 - 38} ${y0 + 9} Z" fill="#1c2a3c" stroke="${INK}" stroke-width="2.6"/>
       <path d="M${x1 - 30} ${y0 + 15} C${x1 - 22} ${y0 + 19} ${x1 - 18} ${y0 + 25} ${x1 - 17} ${y0 + 31}" stroke="#a9dcff" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>
       <circle cx="${x1 - 8}" cy="${y0 + 13}" r="6" fill="${lit ? '#fff6c8' : '#6f6a5c'}" stroke="${INK}" stroke-width="2.4"/>
       <circle cx="${x1 - 8}" cy="${y1 - 13}" r="6" fill="${lit ? '#fff6c8' : '#6f6a5c'}" stroke="${INK}" stroke-width="2.4"/>`
    : '';
  const couplers = `<rect x="${x0 - 12}" y="${cy - 7}" width="16" height="14" rx="3" fill="#3a3530" stroke="${INK}" stroke-width="2.2"/>` + (lead ? '' : `<rect x="${x1 - 4}" y="${cy - 7}" width="16" height="14" rx="3" fill="#3a3530" stroke="${INK}" stroke-width="2.2"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.bodyLight}"/><stop offset="0.3" stop-color="${t.body}"/><stop offset="1" stop-color="${t.bodyDeep}"/>
    </linearGradient>
    <linearGradient id="rf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffaf0"/><stop offset="0.5" stop-color="${t.roof}"/><stop offset="1" stop-color="${t.roofShade}"/>
    </linearGradient>
  </defs>
  <ellipse cx="${(x0 + x1) / 2 + 5}" cy="${y1 + 5}" rx="${(x1 - x0) / 2 + 4}" ry="8" fill="#000" opacity="0.4"/>
  ${couplers}
  <path d="${body}" fill="url(#bd)"/>
  ${wins.join('')}
  <rect x="${rx0}" y="${y0 + 15}" width="${rx1 - rx0}" height="${y1 - y0 - 30}" rx="10" fill="url(#rf)" stroke="${INK}" stroke-width="2.4"/>
  ${vents.join('')}
  ${nose}
  <path d="M${rx0 + 8} ${y0 + 18} H${rx1 - 8}" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.7"/>
  <path d="${body}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>
</svg>`;
}

export const TRAIN_BOX = { w: W, h: H, bodyLen: 202, bodyW: 64 };

/**
 * The crash cloud: a jagged cartoon explosion (orange burst, yellow core, white-hot centre) ringed
 * by soot puffs, in the house ink. 256 viewBox, centred. `seed` varies the spikes.
 */
export function crashBoomSvg(seed = 3): string {
  let s = seed * 9973;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const star = (n: number, r0: number, r1: number, jit: number) => {
    const pts: string[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2 + (rnd() - 0.5) * 0.12;
      const r = (i % 2 ? r0 : r1) * (1 + (rnd() - 0.5) * jit);
      pts.push(`${(128 + Math.cos(a) * r).toFixed(1)},${(128 + Math.sin(a) * r).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const puffs: string[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.4;
    const r = 92 + rnd() * 14;
    const pr = 16 + rnd() * 10;
    const x = 128 + Math.cos(a) * r;
    const y = 128 + Math.sin(a) * r;
    puffs.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${pr.toFixed(1)}" fill="#5d534c" stroke="${INK}" stroke-width="4"/><circle cx="${(x - pr * 0.3).toFixed(1)}" cy="${(y - pr * 0.3).toFixed(1)}" r="${(pr * 0.45).toFixed(1)}" fill="#8a7f76"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  ${puffs.join('')}
  <polygon points="${star(12, 64, 112, 0.25)}" fill="#ff5a1f" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
  <polygon points="${star(10, 50, 86, 0.25)}" fill="#ffa52e"/>
  <polygon points="${star(9, 34, 62, 0.3)}" fill="#ffd84a"/>
  <polygon points="${star(8, 20, 38, 0.3)}" fill="#fff6d0"/>
  <path d="M96 84 Q110 70 128 72" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.8"/>
</svg>`;
}
