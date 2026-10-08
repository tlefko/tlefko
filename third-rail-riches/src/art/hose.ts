import { C } from './kit';

/**
 * Cross-section of a rubber-hose limb for the rig's rope meshes: a thin vertical strip whose
 * height is the limb's full width. Across it: ink edge, the fill, a lit stripe on the upper side
 * (v = 0 is the left of the direction of travel; the rig orients each rope so that side faces the
 * light), fill, a darker cel band on the shadow side, ink edge. Colours are CSS strings; the rig
 * paints it into a canvas (see Captain.ts).
 */
export function hoseSection(ink: number, fill: string, lit: string, shade: string): { stops: [number, string][] } {
  const e = ink;
  return {
    stops: [
      [0, C.ink],
      [e, C.ink],
      [e + 0.001, fill],
      [0.24, fill],
      [0.241, lit],
      [0.38, lit],
      [0.381, fill],
      [0.7, fill],
      [0.701, shade],
      [1 - e, shade],
      [1 - e + 0.001, C.ink],
      [1, C.ink],
    ],
  };
}
