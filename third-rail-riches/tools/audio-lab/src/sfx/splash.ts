/**
 * Intro splash: the welcome sting (right after audio unlocks), the PLAY press, carousel swooshes and
 * coach-mark pops. The stings use open fifths on D so they sit on the base music whatever it is doing.
 */
import { hz } from '../core/notes';
import { block, crash, snare } from '../instruments/drums';
import { glock, shipBell } from '../instruments/tuned';
import { accordion, brass, concertina, tuba } from '../instruments/winds';
import { whoosh } from '../instruments/fx';
import { cannon, cork } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, tailFade, withRoom } from './common';

export const SPLASH_SFX: SfxDef[] = [
  one('introSting', { kind: 'sfx', seconds: 3.0, level: -15, desc: "welcome aboard: ship's bell ding-ding, a concertina run into an open-fifth brass \"ta-da\" and a distant cannon" }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 2.6, 2.95), 0.2, 'hall');
    shipBell(s, d, 0, hz('A5'), 0.55, { decay: 1.6, double: 0.26 });
    ['A4', 'D5', 'E5', 'F5', 'A5', 'D6'].forEach((n, k) => concertina(s, d, 0.5 + k * 0.07, hz(n), 0.07, 0.55 + k * 0.05, { attack: 0.008, release: 0.04 }));
    const hit = 0.92;
    for (const n of ['D4', 'A4', 'D5', 'A5']) brass(s, d, hit, hz(n), 0.9, 0.9, { bright: 1.15 });
    for (const n of ['D5', 'A5', 'D6']) concertina(s, d, hit, hz(n), 0.85, 0.6);
    tuba(s, d, hit, hz('D2'), 0.8, 0.8);
    snare(s, d, hit, 0.6);
    crash(s, d, hit, 0.45, { decay: 1.8 });
    cannon(s, d, hit + 0.05, 0.45, { size: 1, distance: 0.6, echo: 1 });
    ['D6', 'A6', 'D7'].forEach((n, k) => glock(s, d, hit + 0.05 + k * 0.05, hz(n), 0.25, { decay: 1.1 }));
  }),
  one('playSting', { kind: 'sfx', seconds: 1.8, level: -15, desc: 'PLAY pressed: a wooden button thock, an accordion run up and an open-fifth brass "ta-da"' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.5, 1.75), 0.18, 'hall');
    block(s, d, 0, 900, 0.5, { decay: 0.03 });
    ['D4', 'E4', 'A4', 'D5', 'E5'].forEach((n, k) => accordion(s, d, 0.02 + k * 0.045, hz(n), 0.05, 0.5 + k * 0.06, { attack: 0.006, release: 0.03 }));
    const hit = 0.25;
    for (const n of ['D4', 'A4', 'D5', 'A5']) brass(s, d, hit, hz(n), 0.6, 0.9, { bright: 1.15 });
    for (const n of ['A4', 'D5', 'A5']) accordion(s, d, hit, hz(n), 0.55, 0.6);
    tuba(s, d, hit, hz('D2'), 0.5, 0.8);
    snare(s, d, hit, 0.65);
    crash(s, d, hit, 0.4, { decay: 1.4 });
    glock(s, d, hit + 0.02, hz('A6'), 0.3, { decay: 1.0 });
  }),
  one('carouselWhoosh', { kind: 'sfx', seconds: 0.5, level: -24, desc: 'the splash carousel slides: a soft card swoosh' }, (s, out) => {
    whoosh(s, out, 0, 0.28, 0.5, { f0: 700, f1: 2600, q: 1.1, peakAt: 0.45, pan0: -0.25, pan1: 0.25, color: 'pink' });
    block(s, out, 0.02, 2100, 0.08, { decay: 0.01 });
  }),
  one('coachPop', { kind: 'sfx', seconds: 0.5, level: -23, desc: 'a coach-mark tip pops up: a soft cork pop and a tiny ping' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    cork(s, d, 0, 760, 0.7);
    glock(s, d, 0.03, hz('A6'), 0.25, { decay: 0.5 });
  }),
];
