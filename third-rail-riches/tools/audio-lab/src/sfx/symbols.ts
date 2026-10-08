/**
 * Per-symbol win accents: short and soft, meant to sit under the main `win` flourish (pitched notes
 * stay on D minor pentatonic so they agree with it).
 */
import { hz } from '../core/notes';
import { block, kick } from '../instruments/drums';
import { celesta, glock } from '../instruments/tuned';
import { parrot } from '../instruments/fx';
import { creak, flap, ironClank, paperRustle, splinters, squelch, whirr } from '../instruments/foley';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, withRoom } from './common';

/** A hard little click: chitin, shell or tooth. */
function click(s: Studio, d: Dest, t: number, f: number, vel: number) {
  block(s, d, t, f, vel * 0.6, { decay: 0.012 });
  const bp = s.filter('bandpass', f * 2, 3, d);
  const g = s.gain(0, bp);
  s.perc(g.gain, t, vel * 0.6, 0.0002, 0.006);
  s.noise('white', t, t + 0.015, g);
}

export const SYMBOL_SFX: SfxDef[] = [
  one('symCrab', { kind: 'sfx', seconds: 0.35, level: -24, desc: 'crab win accent: a quick claw snip-snap' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    click(s, d, 0, 1650, 0.8);
    block(s, d, 0.002, 900, 0.25, { decay: 0.02 });
    click(s, d, 0.07, 1750, 0.65);
    block(s, d, 0.072, 950, 0.2, { decay: 0.02 });
  }),
  one('symOcto', { kind: 'sfx', seconds: 0.5, level: -25, desc: 'octopus win accent: a wet squelch and a bubble' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    squelch(s, d, 0, 0.2, 0.8, { f0: 1300, f1: 360 });
  }),
  one('symShark', { kind: 'sfx', seconds: 0.4, level: -24, desc: 'shark win accent: a snapping chomp' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    kick(s, d, 0, 0.5, { tone: 95, decay: 0.07 });
    click(s, d, 0.004, 2300, 0.7);
    click(s, d, 0.007, 2750, 0.5);
    splinters(s, d, 0.012, 0.05, 3, 0.35, { center: 1600 });
  }),
  one('symParrot', { kind: 'sfx', seconds: 0.6, level: -24, desc: 'parrot win accent: a tiny squawk and a flap' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    parrot(s, d, 0, 0.5, { pitch: 1.35, len: 0.14, whistle: false });
    flap(s, d, 0.12, 0.45);
    flap(s, d, 0.21, 0.32);
  }),
  one('symAnchor', { kind: 'sfx', seconds: 0.8, level: -24, desc: 'anchor win accent: a slow swinging chain creak and a soft iron clink' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    creak(s, d, 0, 0.45, 0.7, { rate: [[0, 20], [0.5, 42], [1, 24]], body: [[330, 7, 1], [760, 9, 0.6], [1600, 10, 0.3]], jitter: 0.2 });
    ironClank(s, d, 0.42, 0.3, { f: 1300, decay: 0.12 });
  }),
  one('symShell', { kind: 'sfx', seconds: 0.8, level: -24, desc: 'shell win accent: a clam snaps shut and a pearl twinkles' }, (s, out) => {
    const d = withRoom(s, out, 0.12);
    click(s, d, 0, 2100, 0.7);
    click(s, d, 0.012, 2600, 0.5);
    glock(s, d, 0.08, hz('A6'), 0.25, { decay: 0.6 });
    glock(s, d, 0.15, hz('D7'), 0.2, { decay: 0.7 });
    celesta(s, d, 0.15, hz('D6'), 0.15, { decay: 0.6 });
  }),
  one('symMap', { kind: 'sfx', seconds: 0.8, level: -24, desc: 'map win accent: a crinkle of paper and a small ding' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    paperRustle(s, d, 0, 0.18, 0.6);
    glock(s, d, 0.16, hz('D6'), 0.4, { decay: 0.8 });
  }),
  one('symCompass', { kind: 'sfx', seconds: 0.6, level: -25, desc: 'compass win accent: the needle whirrs and settles with a tick' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    whirr(s, d, 0, 0.4, 0.7);
  }),
];
