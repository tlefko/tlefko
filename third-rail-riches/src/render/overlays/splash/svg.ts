/**
 * SVG helpers shared by the intro splash and its demo art (house ink + cel, docs/ART.md): every
 * piece is authored as an SVG string in code and rasterised at its display size.
 */
import { C } from '../../../art/kit';

export const F = (n: number) => n.toFixed(1);
export const hex = (c: string) => parseInt(c.slice(1), 16);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** kit.composeSymbol's cel + drop filters for art on any viewBox; `s` scales the offsets. */
export function celDefs(id: string, s = 1, shade = 0.3, light = 0.45): string {
  return `<filter id="${id}cel" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feOffset in="SourceAlpha" dx="${F(-15 * s)}" dy="${F(-17 * s)}" result="o"/>
    <feComposite in="SourceAlpha" in2="o" operator="out" result="rim"/>
    <feGaussianBlur in="rim" stdDeviation="${F(1.4 * s)}" result="rimb"/>
    <feFlood flood-color="${C.ink}" flood-opacity="${shade}"/>
    <feComposite in2="rimb" operator="in" result="sh0"/>
    <feComposite in="sh0" in2="SourceAlpha" operator="in" result="shade"/>
    <feOffset in="SourceAlpha" dx="${F(7 * s)}" dy="${F(9 * s)}" result="o2"/>
    <feComposite in="SourceAlpha" in2="o2" operator="out" result="rim2"/>
    <feGaussianBlur in="rim2" stdDeviation="${F(3 * s)}" result="rim2b"/>
    <feFlood flood-color="#ffffff" flood-opacity="${light}"/>
    <feComposite in2="rim2b" operator="in" result="hl0"/>
    <feComposite in="hl0" in2="SourceAlpha" operator="in" result="hl"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="shade"/><feMergeNode in="hl"/></feMerge>
  </filter>
  <filter id="${id}drop" x="-12%" y="-12%" width="124%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${F(4.5 * s)}"/>
    <feOffset dy="${F(6 * s)}" result="d"/>
    <feFlood flood-color="#000" flood-opacity=".5"/>
    <feComposite in2="d" operator="in"/>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="${id}soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${F(4 * s)}"/></filter>`;
}

export const svgDoc = (w: number, h: number, defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;

export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): string {
  return `M${F(x0 + r)} ${F(y0)} H${F(x1 - r)} Q${F(x1)} ${F(y0)} ${F(x1)} ${F(y0 + r)} V${F(y1 - r)} Q${F(x1)} ${F(y1)} ${F(x1 - r)} ${F(y1)} H${F(x0 + r)} Q${F(x0)} ${F(y1)} ${F(x0)} ${F(y1 - r)} V${F(y0 + r)} Q${F(x0)} ${F(y0)} ${F(x0 + r)} ${F(y0)} Z`;
}

export function pill(x: number, y: number, w: number, h: number): string {
  const r = h / 2;
  return `M${F(x + r)} ${F(y)} H${F(x + w - r)} A${F(r)} ${F(r)} 0 0 1 ${F(x + w - r)} ${F(y + h)} H${F(x + r)} A${F(r)} ${F(r)} 0 0 1 ${F(x + r)} ${F(y)} Z`;
}

/** A hand-inked wobbly line (wood grain). */
export function wobble(x0: number, y0: number, x1: number, y1: number, amp: number, n: number, seed: number): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${F(x0)} ${F(y0)}`;
  for (let i = 1; i <= n; i++) {
    const tm = (i - 0.5) / n;
    const te = i / n;
    const o = Math.sin(seed * 1.7 + i * 2.3) * amp;
    d += ` Q${F(x0 + dx * tm + nx * o)} ${F(y0 + dy * tm + ny * o)} ${F(x0 + dx * te)} ${F(y0 + dy * te)}`;
  }
  return d;
}

export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
