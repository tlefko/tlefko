/**
 * Per-symbol win accents: short and soft, meant to sit under `win` (once per winning symbol, not per
 * cell). Pitched parts stay on F major pentatonic like the win sting.
 */
import { hz } from '../core/notes';
import { block, kick } from '../instruments/drums';
import { glock } from '../instruments/tuned';
import { brass } from '../instruments/winds';
import { boing, whoosh } from '../instruments/fx';
import { cork, flap, grainRattle, paperRustle, splinters } from '../instruments/foley';
import { chinaClink } from '../instruments/train';
import { coo, hoHo, meow, squeak, woof } from '../instruments/voices';
import type { SfxDef } from '../types';
import { one, withRoom } from './common';

export const SYMBOL_SFX: SfxDef[] = [
  one('symPretzel', { kind: 'sfx', seconds: 0.45, level: -24, desc: 'pretzel: a salty crunch and a little pop' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    grainRattle(s, d, 0, 0.12, 0.9, { density: 900, center: 2600, decay: 0.25 });
    splinters(s, d, 0, 0.08, 5, 0.45, { center: 1800 });
    kick(s, d, 0, 0.2, { tone: 110, decay: 0.05 });
    cork(s, d, 0.13, 700, 0.6);
  }),
  one('symCoffee', { kind: 'sfx', seconds: 0.8, level: -25, desc: 'diner coffee: a short slurp and the cup clinking on its saucer' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    // slurp: a sucked band of noise rising, bubbling
    const bp = s.filter('bandpass', 700, 3, d);
    bp.frequency.setValueAtTime(600, 0);
    bp.frequency.exponentialRampToValueAtTime(2400, 0.22);
    const am = s.gain(0.5, bp);
    s.osc('square', 34, 0, 0.3, s.filter('lowpass', 120, 0.7, s.gain(0.45, am.gain)));
    const g = s.gain(0, am);
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.9, 0.05);
    g.gain.linearRampToValueAtTime(0.6, 0.18);
    g.gain.linearRampToValueAtTime(0, 0.26);
    s.noise('pink', 0, 0.3, g);
    chinaClink(s, d, 0.3, 2350, 0.7);
    chinaClink(s, d, 0.34, 3020, 0.35);
  }),
  one('symNewspaper', { kind: 'sfx', seconds: 0.6, level: -24, desc: 'newspaper: a quick rustle and a crisp flap as it snaps open' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    paperRustle(s, d, 0, 0.16, 0.6);
    whoosh(s, d, 0.12, 0.14, 0.3, { f0: 900, f1: 3500, q: 0.9, peakAt: 0.8, color: 'white' });
    flap(s, d, 0.24, 0.9, { f: 1500 });
    paperRustle(s, d, 0.25, 0.06, 0.5);
  }),
  one('symUmbrella', { kind: 'sfx', seconds: 0.7, level: -24, desc: 'umbrella pops open: catch click, a whoosh and the canopy snapping taut with a little boing' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    block(s, d, 0, 2200, 0.4, { decay: 0.01 });
    whoosh(s, d, 0.01, 0.12, 0.45, { f0: 500, f1: 2600, q: 1, peakAt: 0.85 });
    flap(s, d, 0.12, 1.0, { f: 700 });
    kick(s, d, 0.12, 0.3, { tone: 120, decay: 0.05 });
    boing(s, d, 0.125, 0.25, { f0: 300, f1: 520, decay: 0.35 });
  }),
  one('symPigeon', { kind: 'sfx', seconds: 1.1, level: -24, desc: 'pigeon: a soft "croo-ROO-coo" and a wing flutter' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    coo(s, d, 0, 0.9);
    flap(s, d, 0.62, 0.35, { f: 1100 });
    flap(s, d, 0.69, 0.3, { f: 1200 });
  }),
  one('symCat', { kind: 'sfx', seconds: 0.7, level: -24, desc: 'alley cat: a sly "mee-ow"' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    meow(s, d, 0, 0.9);
  }),
  one('symBulldog', { kind: 'sfx', seconds: 0.65, level: -24, desc: 'Officer Bulldog: a gruff "WOOF-woof"' }, (s, out) => {
    const d = withRoom(s, out, 0.08);
    woof(s, d, 0, 0.9);
  }),
  one('symRat', { kind: 'sfx', seconds: 0.55, level: -25, desc: 'Rivets the rat: a cheeky "squeak-squeak" and a tiny tail flick' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    squeak(s, d, 0, 0.9);
    whoosh(s, d, 0.24, 0.08, 0.15, { f0: 2500, f1: 5000, q: 1.5, peakAt: 0.5, color: 'white' });
  }),
  one('symConductor', { kind: 'sfx', seconds: 0.85, level: -23, desc: 'Conductor Casey: a jolly "HO-ho!" on a trombone blat' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    hoHo(s, d, 0, 0.8);
    brass(s, d, 0.03, hz('F3'), 0.16, 0.55, { bright: 0.85, vib: false });
    brass(s, d, 0.25, hz('C3'), 0.24, 0.5, { bright: 0.75, vib: false });
    glock(s, d, 0.27, hz('C6'), 0.12, { decay: 0.6 });
  }),
];
