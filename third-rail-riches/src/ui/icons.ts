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
  /** three cream enamel bars */
  menu: svg(
    [10, 20.5, 31]
      .map(
        (y) => `<rect x="8" y="${y}" width="32" height="8" rx="3.6" fill="${C.cream}" ${ink}/><path d="M11 ${y + 6.4} L37 ${y + 6.4}" stroke="${C.tileDeep}" stroke-width="2.4" stroke-linecap="round"/>`,
      )
      .join(''),
  ),
  /** two crossed bars */
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
  /** a lightning bolt with speed streaks */
  turbo: svg(
    `<path d="M3 17 L15 17 M1 24 L13 24 M4 31 L15 31" stroke="${C.ink}" stroke-width="6.4"/>
     <path d="M3 17 L15 17 M1 24 L13 24 M4 31 L15 31" stroke="${C.voltLight}" stroke-width="2.8"/>
     <path d="M33 4 L18 27 H27 L22 44 L41 19 H31 L38 4 Z" fill="${C.amberLight}" ${ink}/>
     <path d="M32 9 L24 22" stroke="${C.white}" stroke-width="2.2" opacity=".8"/>`,
  ),
  /** an enamel notice board (the rules) */
  info: svg(
    `<rect x="9" y="7" width="30" height="35" rx="4" fill="${C.cream}" ${ink}/>
     <rect x="9" y="7" width="30" height="9" rx="4" fill="${C.emerald}" ${ink}/>
     <path d="M15 22.5 L33 22.5 M15 28.5 L33 28.5 M15 34.5 L26 34.5" stroke="${C.iron}" stroke-width="2.6"/>
     <circle cx="14" cy="11.5" r="1.6" fill="${C.goldLight}"/><circle cx="34" cy="11.5" r="1.6" fill="${C.goldLight}"/>`,
  ),
  /** the platform bell */
  sound: svg(
    `<path d="M24 7 Q15 8 14 20 L13 31 Q10 32 9 35 L39 35 Q38 32 35 31 L34 20 Q33 8 24 7 Z" fill="${C.gold}" ${ink}/>
     <path d="M30 13 Q33 18 33 30" fill="none" stroke="${C.goldDeep}" stroke-width="3"/>
     <circle cx="24" cy="39" r="3.6" fill="${C.goldDeep}" ${ink}/>
     ${hi('M18 14 Q17 20 17 27', 0.8)}`,
  ),
  /** a music note */
  music: svg(
    `<path d="M19 33 L19 11 L37 7 L37 29" fill="none" stroke="${C.ink}" stroke-width="7.4"/>
     <path d="M19 33 L19 11 L37 7 L37 29" fill="none" stroke="${C.paper}" stroke-width="2.6"/>
     <ellipse cx="14.5" cy="34.5" rx="6.8" ry="5.4" fill="${C.paper}" ${ink}/>
     <ellipse cx="32.5" cy="30.5" rx="6.8" ry="5.4" fill="${C.paper}" ${ink}/>`,
  ),
  /** the station clock */
  history: svg(
    `<circle cx="24" cy="25" r="17" fill="${C.gold}" ${ink}/>
     <circle cx="24" cy="25" r="12.5" fill="${C.cream}" stroke="${C.ink}" stroke-width="2.2"/>
     <path d="M24 16 L24 25 L30.5 28.5" fill="none" stroke="${C.ink}" stroke-width="3"/>
     <rect x="20.5" y="3.5" width="7" height="5" rx="1.6" fill="${C.goldDeep}" ${ink}/>
     ${hi('M11.5 19 A13.5 13.5 0 0 1 18 11.5', 0.7)}`,
  ),
  /** a Fare Coin inside a returning arrow */
  reset: svg(
    `<path d="M40 25 A16 16 0 1 1 33.6 11 L35.4 6.6 L41 17.6 L28.8 18.8 L30.6 14.8 A10.4 10.4 0 1 0 34.4 25 Z" fill="${C.paper}" ${ink}/>
     <circle cx="24" cy="25" r="7" fill="${C.gold}" ${ink}/>`,
  ),
  back: svg(`<path d="M28 9 L13 24 L28 39 L34 33 L25 24 L34 15 Z" fill="${C.paper}" ${ink}/>`),
  keyboard: svg(
    `<rect x="5" y="13" width="38" height="23" rx="4" fill="${C.iron}" ${ink}/>
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
  /** a lightning bolt in a brass ring (Express Pass) */
  boost: svg(
    `<circle cx="24" cy="24" r="18" fill="${C.voltNight}" ${ink}/>
     <circle cx="24" cy="24" r="14" fill="none" stroke="${C.gold}" stroke-width="3"/>
     <path d="M27 9 L15 27 H23 L19 40 L34 20 H26 L31 9 Z" fill="${C.voltLight}" ${ink}/>
     <path d="M40 4 L41.6 7 L45 8 L41.6 9.2 L40 12.4 L38.4 9.2 L35 8 L38.4 7 Z" fill="${C.voltCore}" stroke="${C.ink}" stroke-width="1.4"/>`,
  ),
  /** a station lamp globe (low power mode) */
  power: svg(
    `<rect x="20" y="4" width="8" height="6" rx="2" fill="${C.iron}" ${ink}/>
     <path d="M16 13 Q16 9 20 9 H28 Q32 9 32 13 Z" fill="${C.gold}" ${ink}/>
     <circle cx="24" cy="27" r="14" fill="${C.amberLight}" ${ink}/>
     <path d="M24 33 Q19 29 22 22 Q23 26 25 24 Q28 28 24 33 Z" fill="${C.amber}"/>
     ${hi('M15 23 A10 10 0 0 1 20 16.5', 0.8)}`,
  ),
  /** a crackling spark (rules) */
  bomb: svg(
    `<path d="M24 3 L29 17 L44 13 L32 24 L44 35 L29 31 L24 45 L19 31 L4 35 L16 24 L4 13 L19 17 Z" fill="${C.voltLight}" ${ink}/>
     <circle cx="24" cy="24" r="6" fill="${C.voltCore}"/>`,
  ),
};
