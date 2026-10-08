/** Way wins: the small band sting, and the electric sweep that traces the winning cells. */
import { hz } from '../core/notes';
import { brushTap, ride } from '../instruments/drums';
import { glock, xylophone } from '../instruments/tuned';
import { clarinet, mutedTrumpet } from '../instruments/winds';
import { piano } from '../instruments/keys';
import { whoosh } from '../instruments/fx';
import { arc, crackle } from '../instruments/train';
import type { SfxDef } from '../types';
import { one, tailFade, withRoom } from './common';

export const WIN_SFX: SfxDef[] = [
  one('win', { kind: 'sfx', seconds: 1.4, level: -17, desc: 'small win sting: a clarinet scoop up into a muted-trumpet and piano "doo-DAH" on F6, a ride ting' }, (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    ['A4', 'C5', 'D5', 'F5'].forEach((n, i) => clarinet(s, d, i * 0.045, hz(n), 0.05, 0.5 + i * 0.08, i === 0 ? 'b' : ''));
    xylophone(s, d, 0.0, hz('C6'), 0.3);
    xylophone(s, d, 0.09, hz('F6'), 0.4);
    const t = 0.19;
    mutedTrumpet(s, d, t - 0.1, hz('C5'), 0.08, 0.5);
    mutedTrumpet(s, d, t, hz('A5'), 0.42, 0.7, 'w');
    clarinet(s, d, t, hz('F5'), 0.42, 0.55);
    for (const n of ['F3', 'A3', 'D4', 'F4']) piano(s, d, t, hz(n), 0.45, 0.55);
    brushTap(s, d, t, 0.6);
    ride(s, d, t, 0.35, { decay: 0.9 });
    glock(s, d, t + 0.01, hz('A6'), 0.2, { decay: 0.9 });
  }),
  one('clusterTrace', { kind: 'sfx', seconds: 1.2, level: -24, desc: 'an electric sweep running along the winning cells: a rising arc, crackles and a faint glockenspiel shimmer' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.95, 1.18), 0.2, 'medium');
    arc(s, d, 0, 0.75, 0.6, { f0: 120, f1: 240, sweep: [600, 6000] });
    whoosh(s, d, 0, 0.7, 0.15, { f0: 900, f1: 7000, q: 1.2, peakAt: 0.8, pan0: -0.6, pan1: 0.6, color: 'white' });
    crackle(s, d, 0.05, 0.7, 14, 0.35, { spread: 0.7 });
    ['F6', 'G6', 'A6', 'C7', 'D7', 'F7'].forEach((n, k) => glock(s, d, 0.08 + k * 0.1, hz(n), 0.1 + k * 0.02, { decay: 0.6 }));
  }),
];
