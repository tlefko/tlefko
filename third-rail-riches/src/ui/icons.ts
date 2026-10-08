/**
 * UI icons in the game's ink style (docs/ART.md): filled shapes with a warm ink outline, a cel shade
 * and a small highlight, never thin line icons. Inline SVG strings (no ids, so any number can sit on
 * one page). 48 box.
 */
import { C } from '../art/kit';

const W = 3.2; // ink width in the 48 box
const svg = (body: string) =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const ink = `stroke="${C.ink}" stroke-width="${W}"`;
const hi = (d: string, o = 0.75) => `<path d="${d}" fill="none" stroke="${C.white}" stroke-width="2.2" opacity="${o}"/>`;

export const ICON = {
  /** three lashed planks */
  menu: svg(
    [10, 20.5, 31]
      .map(
        (y) => `<rect x="8" y="${y}" width="32" height="8" rx="3.6" fill="${C.paper}" ${ink}/><path d="M11 ${y + 6.4} L37 ${y + 6.4}" stroke="${C.paperWarm}" stroke-width="2.4" stroke-linecap="round"/>`,
      )
      .join(''),
  ),
  /** two crossed planks */
  close: svg(
    `<g transform="rotate(45 24 24)"><rect x="8" y="19.5" width="32" height="9" rx="4" fill="${C.paper}" ${ink}/></g>
     <g transform="rotate(-45 24 24)"><rect x="8" y="19.5" width="32" height="9" rx="4" fill="${C.paper}" ${ink}/></g>
     ${hi('M15 15 L21 21', 0.6)}`,
  ),
  minus: svg(`<rect x="10" y="19.5" width="28" height="9" rx="4" fill="${C.inkSoft}" ${ink}/>${hi('M14 22.5 L22 22.5', 0.35)}`),
  plus: svg(`<path d="M19.5 10 L28.5 10 L28.5 19.5 L38 19.5 L38 28.5 L28.5 28.5 L28.5 38 L19.5 38 L19.5 28.5 L10 28.5 L10 19.5 L19.5 19.5 Z" fill="${C.inkSoft}" ${ink}/>${hi('M22.5 13 L22.5 18', 0.35)}`),
  /** curling arrow (spin / play again) */
  spin: svg(
    `<path d="M38 26 A14 14 0 1 1 30.6 11.6 L27.6 7.4 L40.4 9.2 L37.4 21.6 L34.6 17.6 A8 8 0 1 0 32.2 26 Z" fill="${C.paper}" ${ink}/>
     ${hi('M13.5 21 A11 11 0 0 1 21 13.4', 0.7)}`,
  ),
  stop: svg(`<rect x="12" y="12" width="24" height="24" rx="5" fill="${C.paper}" ${ink}/>${hi('M16 20 L16 16 L20 16', 0.7)}`),
  /** two arrows chasing round a loop */
  auto: svg(
    `<path d="M10 22 A14 14 0 0 1 33 13 L34.5 9 L41 19.5 L29 21 L31 17.5 A8.5 8.5 0 0 0 16 22 Z" fill="${C.paper}" ${ink}/>
     <path d="M38 26 A14 14 0 0 1 15 35 L13.5 39 L7 28.5 L19 27 L17 30.5 A8.5 8.5 0 0 0 32 26 Z" fill="${C.paper}" ${ink}/>
     ${hi('M13 19.5 A11 11 0 0 1 20 12.5', 0.6)}`,
  ),
  /** a cannonball with speed streaks */
  turbo: svg(
    `<path d="M4 17 L18 17 M2 24 L16 24 M5 31 L18 31" stroke="${C.ink}" stroke-width="6.4"/>
     <path d="M4 17 L18 17 M2 24 L16 24 M5 31 L18 31" stroke="${C.fireHot}" stroke-width="2.8"/>
     <circle cx="30" cy="24" r="13" fill="${C.steelDeep}" ${ink}/>
     <path d="M41.5 27 A12 12 0 0 1 24 35.6" fill="none" stroke="${C.inkSoft}" stroke-width="4"/>
     <circle cx="25.5" cy="19.5" r="3.4" fill="${C.steelLight}"/>`,
  ),
  /** a rolled rules scroll */
  info: svg(
    `<path d="M13 9 L35 9 Q39 9 39 13 L39 35 Q39 39 35 39 L13 39 Q9 39 9 35 L9 13 Q9 9 13 9 Z" fill="${C.paper}" ${ink}/>
     <path d="M9 13 Q9 9 13 9 Q17 9 17 13 L17 16 L9 16 Z M31 35 L31 32 L39 32 L39 35 Q39 39 35 39 Q31 39 31 35 Z" fill="${C.paperWarm}" ${ink}/>
     <path d="M21 17 L33 17 M21 22.5 L33 22.5 M15 28 L27 28" stroke="${C.woodMid}" stroke-width="2.6"/>`,
  ),
  /** a ship's bell */
  sound: svg(
    `<path d="M24 7 Q15 8 14 20 L13 31 Q10 32 9 35 L39 35 Q38 32 35 31 L34 20 Q33 8 24 7 Z" fill="${C.gold}" ${ink}/>
     <path d="M30 13 Q33 18 33 30" fill="none" stroke="${C.goldDeep}" stroke-width="3"/>
     <circle cx="24" cy="39" r="3.6" fill="${C.goldDeep}" ${ink}/>
     ${hi('M18 14 Q17 20 17 27', 0.8)}`,
  ),
  /** a sea-shanty note */
  music: svg(
    `<path d="M19 33 L19 11 L37 7 L37 29" fill="none" stroke="${C.ink}" stroke-width="7.4"/>
     <path d="M19 33 L19 11 L37 7 L37 29" fill="none" stroke="${C.paper}" stroke-width="2.6"/>
     <ellipse cx="14.5" cy="34.5" rx="6.8" ry="5.4" fill="${C.paper}" ${ink}/>
     <ellipse cx="32.5" cy="30.5" rx="6.8" ry="5.4" fill="${C.paper}" ${ink}/>`,
  ),
  /** an hourglass */
  history: svg(
    `<path d="M15 11 L33 11 Q33 20 26 24 Q33 28 33 37 L15 37 Q15 28 22 24 Q15 20 15 11 Z" fill="${C.seaFoam}" ${ink}/>
     <path d="M18 34.5 Q18 30 24 28 Q30 30 30 34.5 Z M20 15 L28 15 Q27 19 24 21 Q21 19 20 15 Z" fill="${C.gold}"/>
     <rect x="10" y="6" width="28" height="6" rx="2.5" fill="${C.wood}" ${ink}/>
     <rect x="10" y="36" width="28" height="6" rx="2.5" fill="${C.wood}" ${ink}/>`,
  ),
  /** a doubloon inside a returning arrow */
  reset: svg(
    `<path d="M40 25 A16 16 0 1 1 33.6 11 L35.4 6.6 L41 17.6 L28.8 18.8 L30.6 14.8 A10.4 10.4 0 1 0 34.4 25 Z" fill="${C.paper}" ${ink}/>
     <circle cx="24" cy="25" r="7" fill="${C.gold}" ${ink}/>`,
  ),
  back: svg(`<path d="M28 9 L13 24 L28 39 L34 33 L25 24 L34 15 Z" fill="${C.paper}" ${ink}/>`),
  keyboard: svg(
    `<rect x="5" y="13" width="38" height="23" rx="4" fill="${C.woodMid}" ${ink}/>
     ${[
       [9, 17],
       [16, 17],
       [23, 17],
       [30, 17],
       [37, 17],
       [9, 24],
       [16, 24],
       [23, 24],
       [30, 24],
       [37, 24],
     ]
       .map(([x, y]) => `<rect x="${x - 2.4}" y="${y - 2}" width="5" height="4.6" rx="1" fill="${C.paper}"/>`)
       .join('')}
     <rect x="13" y="30" width="22" height="3.6" rx="1.2" fill="${C.paper}"/>`,
  ),
  /** a powder keg with a lit fuse (Powder Boost) */
  boost: svg(
    `<path d="M26 12 Q29 5 37 5" fill="none" stroke="${C.ink}" stroke-width="5.4"/>
     <path d="M26 12 Q29 5 37 5" fill="none" stroke="${C.fireCore}" stroke-width="2"/>
     <path d="M13 13 Q11 25 13 39 Q24 43 35 39 Q37 25 35 13 Q24 9 13 13 Z" fill="${C.wood}" ${ink}/>
     <path d="M12 20 Q24 24 36 20 M12 32 Q24 36 36 32" fill="none" stroke="${C.gold}" stroke-width="3" />
     <path d="M37 1 L38.6 4 L42 5 L38.6 6.2 L37 9.4 L35.4 6.2 L32 5 L35.4 4 Z" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="1.4"/>`,
  ),
  /** a ship's lantern (low power mode) */
  power: svg(
    `<rect x="17" y="5" width="14" height="5" rx="2" fill="${C.inkSoft}" ${ink}/>
     <path d="M14 12 L34 12 L32 36 L16 36 Z" fill="${C.fireCore}" ${ink}/>
     <path d="M24 30 Q19 26 22 20 Q23 24 25 22 Q27 26 24 30 Z" fill="${C.fire}"/>
     <path d="M20 12 L19.4 36 M28 12 L28.6 36" stroke="${C.ink}" stroke-width="2"/>
     <rect x="12" y="36" width="24" height="6" rx="2" fill="${C.inkSoft}" ${ink}/>`,
  ),
  /** a lit Kaboom Bomb (rules) */
  bomb: svg(
    `<path d="M30 14 Q32 7 38 6" fill="none" stroke="${C.ink}" stroke-width="5"/>
     <path d="M30 14 Q32 7 38 6" fill="none" stroke="${C.paperWarm}" stroke-width="2"/>
     <circle cx="22" cy="28" r="14" fill="${C.inkSoft}" ${ink}/>
     <rect x="24" y="11" width="9" height="7" rx="1.5" transform="rotate(30 28 14)" fill="${C.steelDeep}" ${ink}/>
     <circle cx="17" cy="23" r="3.6" fill="${C.steel}"/>
     <path d="M39 2 L40.4 4.8 L43.4 5.8 L40.4 7 L39 9.8 L37.6 7 L34.6 5.8 L37.6 4.8 Z" fill="${C.fireHot}" stroke="${C.ink}" stroke-width="1.3"/>`,
  ),
};
