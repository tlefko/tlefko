/**
 * The game's own numerals in the DOM (HUD balance, win and stake; panel prices): each value is a
 * tiny inline SVG of <use> references to the glyph outlines from art/lettering.ts, defined once in
 * a hidden sprite sheet, with the house treatment (ink outline, dark drop, hard cel bands). Any
 * character we did not draw (currency codes, other scripts) falls back to Rye inside the same SVG.
 * The element keeps the plain text as its accessible label.
 */
import { glyph, SPACE_ADV } from '../art/lettering';
import { C } from '../art/kit';
import { mix } from './art';

const NS = 'http://www.w3.org/2000/svg';
let sheet: SVGDefsElement | null = null;
const defined = new Set<string>();
const hex = (ch: string) => (ch.codePointAt(0) ?? 0).toString(16);

export type NumFace = 'paper' | 'gold' | 'fire' | 'sea';
const FACES: Record<NumFace, [string, string, string]> = {
  // cream enamel lettering
  paper: [C.white, C.cream, mix(C.tile, C.tileDeep, 0.55)],
  // brass
  gold: [C.goldLight, C.gold, mix(C.gold, C.goldDeep, 0.45)],
  // amber lamplight
  fire: [C.amberLight, C.amber, C.amberDeep],
  // electric blue (the autoplay counter on the spin button's hub)
  sea: [C.voltCore, C.voltLight, C.volt],
};

function ensureSheet(): SVGDefsElement {
  if (sheet) return sheet;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.innerHTML = `<defs>${(Object.keys(FACES) as NumFace[])
    .map((k) => {
      const [l, b, s] = FACES[k];
      // hard cel bands in glyph units (cap 100): highlight over the top, shade across the foot
      return `<linearGradient id="pkn-face-${k}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"><stop offset=".4" stop-color="${l}"/><stop offset=".4" stop-color="${b}"/><stop offset=".76" stop-color="${b}"/><stop offset=".76" stop-color="${s}"/></linearGradient>`;
    })
    .join('')}</defs>`;
  document.body.appendChild(svg);
  sheet = svg.querySelector('defs')!;
  return sheet;
}

function define(ch: string) {
  if (defined.has(ch)) return;
  const g = glyph(ch);
  if (!g) return;
  defined.add(ch);
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('id', `pkn-${hex(ch)}`);
  p.setAttribute('d', g.d);
  p.setAttribute('fill-rule', 'evenodd');
  ensureSheet().appendChild(p);
}

let probe: CanvasRenderingContext2D | null = null;
/** Advance of a fallback character in glyph units (Rye sized so its caps match our cap height). */
function fallbackAdv(ch: string): number {
  probe ??= document.createElement('canvas').getContext('2d')!;
  probe.font = '132px Rye';
  return probe.measureText(ch).width;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * SVG markup for `text` in our numerals (height 1.2em, width from the glyph advances). `fluid`
 * numerals fill their box up to that natural width and scale down in a narrower one (HUD readings:
 * a long amount shrinks to fit instead of spilling into a neighbour).
 */
export function numeralsHtml(text: string, face: NumFace = 'paper', fluid = false): string {
  ensureSheet();
  let x = 0;
  const parts: string[] = [];
  for (const ch of text) {
    if (/\s/.test(ch)) {
      x += SPACE_ADV * 0.7;
      continue;
    }
    const g = glyph(ch);
    if (g) {
      define(ch);
      parts.push(`<use href="#pkn-${hex(ch)}" x="${x.toFixed(1)}"/>`);
      x += g.adv;
    } else {
      parts.push(`<text x="${x.toFixed(1)}" y="100">${esc(ch)}</text>`);
      x += fallbackAdv(ch);
    }
  }
  const padL = 10;
  const padR = 12;
  const top = -16;
  const h = 136;
  const w = Math.max(1, x + padL + padR);
  const body = parts.join('');
  const natural = ((w / h) * 1.2).toFixed(3);
  const size = fluid ? `class="numsvg fluid f-${face}" style="max-width:${natural}em"` : `class="numsvg f-${face}" width="${natural}em" height="1.2em"`;
  return `<svg ${size} viewBox="${-padL} ${top} ${w.toFixed(1)} ${h}" aria-hidden="true" focusable="false"><g class="nd" transform="translate(2 7)">${body}</g><g class="nf" fill="url(#pkn-face-${face})">${body}</g></svg>`;
}

/** Put `text` into `el` as numerals, keeping it as the element's accessible label. */
export function setNumerals(el: HTMLElement, text: string, face: NumFace = 'paper', fluid = false) {
  if (el.dataset.num === `${face}:${text}`) return;
  el.dataset.num = `${face}:${text}`;
  el.setAttribute('aria-label', text);
  el.innerHTML = text ? numeralsHtml(text, face, fluid) : '';
}
