/**
 * Intro splash: the welcome sting (right after audio unlocks), the PLAY press, carousel swooshes and
 * coach-mark pops. The stings use open fifths on F so they sit on the base music whatever it is doing.
 */
import { hz } from '../core/notes';
import { block, crash, kick, snare } from '../instruments/drums';
import { glock } from '../instruments/tuned';
import { brass, clarinet, tuba } from '../instruments/winds';
import { piano } from '../instruments/keys';
import { ratchet, whoosh } from '../instruments/fx';
import { cork, ironClank } from '../instruments/foley';
import { electricBell, steamWhistle } from '../instruments/train';
import type { SfxDef } from '../types';
import { one, tailFade, withRoom } from './common';

export const SPLASH_SFX: SfxDef[] = [
  one('introSting', { kind: 'sfx', seconds: 3.0, level: -15, desc: 'ALL ABOARD: the station bell, a whistle "woo-woo", a stride-piano run into an open-fifth brass "ta-da"' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 2.6, 2.95), 0.2, 'hall');
    electricBell(s, d, 0, 0.35, hz('C7'), 0.45);
    steamWhistle(s, d, 0.25, 0.18, [hz('A5'), hz('C6'), hz('F6')], 0.5);
    steamWhistle(s, d, 0.5, 0.4, [hz('A5'), hz('C6'), hz('F6')], 0.55, { release: 0.2 });
    ['C4', 'F4', 'A4', 'C5', 'F5', 'A5'].forEach((n, k) => piano(s, d, 0.6 + k * 0.05, hz(n), 0.2, 0.5 + k * 0.05, { bright: 1.1 }));
    const hit = 0.92;
    for (const n of ['F4', 'C5', 'F5', 'C6']) brass(s, d, hit, hz(n), 0.9, 0.9, { bright: 1.15 });
    for (const n of ['F2', 'C3', 'F3', 'C4']) piano(s, d, hit, hz(n), 1.0, 0.6, { sustain: true });
    clarinet(s, d, hit, hz('F5'), 0.85, 0.5);
    tuba(s, d, hit, hz('F2'), 0.8, 0.8);
    snare(s, d, hit, 0.6);
    kick(s, d, hit, 0.5, { tone: 52, decay: 0.3 });
    crash(s, d, hit, 0.45, { decay: 1.8 });
    ['F6', 'C7', 'F7'].forEach((n, k) => glock(s, d, hit + 0.05 + k * 0.05, hz(n), 0.25, { decay: 1.1 }));
  }),
  one('playSting', { kind: 'sfx', seconds: 1.8, level: -15, desc: 'PLAY pressed: a turnstile clack, a clarinet run up and an open-fifth brass "ta-da"' }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 1.5, 1.75), 0.18, 'hall');
    ironClank(s, d, 0, 0.4, { f: 600, decay: 0.05 });
    block(s, d, 0, 900, 0.45, { decay: 0.03 });
    ratchet(s, d, 0.03, 0.25, { body: 2200 });
    ['F4', 'G4', 'C5', 'F5', 'G5'].forEach((n, k) => clarinet(s, d, 0.02 + k * 0.045, hz(n), 0.045, 0.5 + k * 0.06, k === 0 ? 'b' : ''));
    const hit = 0.25;
    for (const n of ['F4', 'C5', 'F5', 'C6']) brass(s, d, hit, hz(n), 0.6, 0.9, { bright: 1.15 });
    for (const n of ['F3', 'C4', 'F4']) piano(s, d, hit, hz(n), 0.6, 0.55, { sustain: true });
    tuba(s, d, hit, hz('F2'), 0.5, 0.8);
    snare(s, d, hit, 0.65);
    crash(s, d, hit, 0.4, { decay: 1.4 });
    glock(s, d, hit + 0.02, hz('C7'), 0.3, { decay: 1.0 });
  }),
  one('carouselWhoosh', { kind: 'sfx', seconds: 0.5, level: -24, desc: 'the splash carousel slides: a soft card swoosh' }, (s, out) => {
    whoosh(s, out, 0, 0.28, 0.5, { f0: 700, f1: 2600, q: 1.1, peakAt: 0.45, pan0: -0.25, pan1: 0.25, color: 'pink' });
    block(s, out, 0.02, 2100, 0.08, { decay: 0.01 });
  }),
  one('coachPop', { kind: 'sfx', seconds: 0.5, level: -23, desc: 'a coach-mark tip pops up: a soft cork pop and a tiny ping' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    cork(s, d, 0, 760, 0.7);
    glock(s, d, 0.03, hz('C7'), 0.25, { decay: 0.5 });
  }),
];
