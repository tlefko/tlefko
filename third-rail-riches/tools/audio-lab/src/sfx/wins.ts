/** Cascade wins (xylophone flourish with a concertina chord, climbing per cascade), doubloon cash tiers, coins. */
import { hz, midi, mtof } from '../core/notes';
import { glock, xylophone, celesta, shipBell } from '../instruments/tuned';
import { concertina } from '../instruments/winds';
import { sample, whoosh } from '../instruments/fx';
import { coinSpill, doubloon } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, variants, withRoom } from './common';

// D minor pentatonic, so the flourishes sit happily over every track
const PENTA = ['D4', 'F4', 'G4', 'A4', 'C5', 'D5', 'F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6', 'C7', 'D7'].map(midi);

export const WIN_SFX: SfxDef[] = [
  ...variants('win', 8, { kind: 'sfx', seconds: 1.4, level: -16, desc: 'xylophone flourish onto a concertina chord; index = cascade number (climbs)' }, (k) => (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    const top = 5 + k;
    const run = [PENTA[top - 3], PENTA[top - 2], PENTA[top - 1]];
    run.forEach((m, i) => xylophone(s, d, i * 0.045, mtof(m), 0.45 + i * 0.1));
    const tt = 0.135;
    xylophone(s, d, tt, mtof(PENTA[top]), 0.85, { decay: 0.7 });
    // a short squeeze of the concertina under the top note
    for (const m of [PENTA[top] - 12, PENTA[top - 2] - 12]) concertina(s, d, tt, mtof(m), 0.22, 0.45, { attack: 0.012, release: 0.08 });
    xylophone(s, d, tt + 0.09, mtof(PENTA[top]), 0.35, { decay: 0.5 });
    if (k >= 3) glock(s, d, tt, mtof(PENTA[top] + 12), 0.12 + (k - 3) * 0.05, { decay: 1.2 });
  }, (k) => ({ level: -17 + k * 0.4 })),

  ...variants('coin', 8, { kind: 'sfx', seconds: 0.45, level: -22, desc: 'single heavy gold doubloon clink (coin showers)' }, (k) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    doubloon(s, d, 0, 0.8, { f: [2350, 2550, 2780, 2990, 3200, 2670, 2880, 3100][k], bounce: k % 3 !== 2, decay: 0.26 + (k % 4) * 0.035 });
  }),

  one('cashBronze', { kind: 'sfx', seconds: 1.0, level: -17, desc: 'small prize: two doubloons and a celesta chime' }, (s, out) => {
    const d = withRoom(s, out, 0.12);
    doubloon(s, d, 0, 0.7, { f: 2500 });
    doubloon(s, d, 0.07, 0.6, { f: 2750, bounce: false });
    celesta(s, d, 0.05, hz('A5'), 0.45, { decay: 0.8 });
  }),
  one('cashSilver', { kind: 'sfx', seconds: 1.4, level: -15, desc: 'medium prize: doubloon trio and a two-note glockenspiel' }, (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    [2550, 2850, 3150].forEach((f, i) => doubloon(s, d, i * 0.055, 0.7, { f, bounce: i === 2 }));
    glock(s, d, 0.06, hz('E6'), 0.4, { decay: 1.1 });
    glock(s, d, 0.16, hz('B6'), 0.45, { decay: 1.3 });
    celesta(s, d, 0.16, hz('E5'), 0.35, { decay: 1.0 });
  }),
  one('cashGold', { kind: 'sfx', seconds: 2.2, level: -13, desc: "big prize: a spill of doubloons, ship's bell ding-ding, glockenspiel sparkle" }, async (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    coinSpill(s, d, 0, 0.45, 14, 0.5);
    shipBell(s, d, 0.1, hz('D6'), 0.5, { decay: 1.6, double: 0.2 });
    for (const [i, n] of ['D6', 'F#6', 'A6', 'D7'].entries()) glock(s, d, 0.12 + i * 0.035, hz(n), 0.35, { decay: 1.5 });
    const sp = await sample(s, 'sparkle');
    s.play(sp, 0.1, s.gain(0.2, s.filter('lowpass', 9000, 0.7, d)));
  }),

  one('multAdd', { kind: 'sfx', seconds: 1.5, level: -14, desc: "upward swoosh into a glockenspiel run and a ship's bell" }, async (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    whoosh(s, d, 0, 0.38, 0.55, { f0: 350, f1: 5200, q: 1.6, peakAt: 0.85, pan0: -0.3, pan1: 0.3 });
    for (let i = 0; i < 5; i++) celesta(s, d, 0.05 + i * 0.055, hz(['A4', 'D5', 'F5', 'A5', 'D6'][i]), 0.25 + i * 0.05, { decay: 0.6 });
    shipBell(s, d, 0.36, hz('A5'), 0.45, { decay: 1.3 });
    glock(s, d, 0.36, hz('D7'), 0.4, { decay: 1.3 });
    const sp = await sample(s, 'sparkle');
    s.play(sp, 0.3, s.gain(0.13, s.filter('lowpass', 8000, 0.7, d)));
  }),
];
