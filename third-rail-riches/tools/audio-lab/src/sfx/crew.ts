/** Cap'n Kaboom (belt, charge lamps, wind-up, throw, peg leg) and Sparks the parrot (squawk, flaps). */
import { hz } from '../core/notes';
import { block, crash, kick, snare } from '../instruments/drums';
import { celesta, glock } from '../instruments/tuned';
import { brass, concertina, slideWhistle } from '../instruments/winds';
import { fireWhoomp, formantVoice, parrot, whoosh } from '../instruments/fx';
import { crate, creak, doubloon, flap, fuse, ironClank } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, variants, withRoom } from './common';

export const CREW_SFX: SfxDef[] = [
  one('capBelt', { kind: 'sfx', seconds: 0.8, level: -21, desc: "Cap'n Kaboom pulls the bomb from his belt: leather creak, buckle jingle, iron slapped into his palm" }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    creak(s, d, 0, 0.18, 0.7, { rate: [[0, 60], [0.5, 110], [1, 70]], env: [[0, 0], [0.2, 1], [1, 0]], body: [[260, 6, 1], [640, 8, 0.6], [1500, 9, 0.25]], jitter: 0.3, grit: 0.5 });
    doubloon(s, d, 0.05, 0.35, { f: 3400, bounce: false, decay: 0.09 });
    doubloon(s, d, 0.09, 0.25, { f: 3900, bounce: false, decay: 0.07 });
    whoosh(s, d, 0.1, 0.12, 0.3, { f0: 900, f1: 2800, q: 1.5, peakAt: 0.6, color: 'white' });
    ironClank(s, d, 0.22, 0.4, { f: 520, decay: 0.08 });
    kick(s, d, 0.22, 0.3, { tone: 90, decay: 0.08 });
  }),
  ...variants('capChargePip', 3, { kind: 'sfx', seconds: 0.9, level: -21, desc: "a charge lamp flares on the Captain's rig: a little flame and a glassy ping; index 1..3 rises (D, F#, A)" }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    fireWhoomp(s, d, 0, 0.22 + i * 0.05, { size: 0.3 });
    fuse(s, d, 0.01, 0.15, 0.3, { fadeIn: 0.005, fadeOut: 0.1, sparks: 1.5 });
    const note = hz(['D5', 'F#5', 'A5'][i]);
    glock(s, d, 0.03, note, 0.5, { decay: 1.0 });
    celesta(s, d, 0.03, note * 2, 0.25, { decay: 0.7 });
  }, (i) => ({ id: `capChargePip_${i + 1}`, variant: i + 1, level: -21 + i * 0.8 })),
  one('capChargeFull', { kind: 'sfx', seconds: 1.6, level: -16, desc: 'fully charged: a fizzing surge into a bright two-note "rea-DY!" on brass and concertina' }, (s, out) => {
    const d = withRoom(s, out, 0.18, 'medium');
    fuse(s, d, 0, 0.36, 0.6, { fadeIn: 0.05, swell: 3, sparks: 1.8, fadeOut: 0.02 });
    whoosh(s, d, 0.02, 0.34, 0.3, { f0: 400, f1: 4200, q: 1.2, peakAt: 0.95, color: 'white' });
    const t1 = 0.36;
    const t2 = 0.5;
    for (const n of ['A4', 'E5']) brass(s, d, t1, hz(n), 0.1, 0.75, { bright: 1.1 });
    for (const n of ['D5', 'F#5', 'A5']) brass(s, d, t2, hz(n), 0.5, 0.9, { bright: 1.2 });
    for (const n of ['F#5', 'A5', 'D6']) concertina(s, d, t2, hz(n), 0.45, 0.6);
    snare(s, d, t1, 0.4, { decay: 0.08 });
    snare(s, d, t2, 0.6, { decay: 0.14 });
    glock(s, d, t2, hz('D7'), 0.35, { decay: 1.0 });
    crash(s, d, t2, 0.25, { decay: 1.1 });
  }),
  one('capWindup', { kind: 'sfx', seconds: 1.2, level: -19, desc: 'the Captain winds up: arm whooshes speeding up over a creaking stretch and a rising whistle' }, (s, out) => {
    const d = withRoom(s, out, 0.12, 'medium');
    [0, 0.26, 0.45, 0.59, 0.69].forEach((t, k) =>
      whoosh(s, d, t, 0.2 - k * 0.02, 0.25 + k * 0.06, { f0: 400 + k * 150, f1: 1400 + k * 300, q: 1.2, peakAt: 0.55, pan0: -0.3, pan1: 0.3, color: 'pink' }),
    );
    creak(s, d, 0.05, 0.75, 0.5, { rate: [[0, 25], [0.6, 70], [1, 130]], body: [[340, 7, 1], [820, 9, 0.6], [1700, 11, 0.3]], jitter: 0.15, grit: 0.35 });
    slideWhistle(s, d, [{ t: 0.1, f: 300 }, { t: 0.78, f: 900, a: 0.9 }], 0.25);
  }),
  one('capThrow', { kind: 'sfx', seconds: 1.0, level: -17, desc: 'the throw: a grunted "hup!", a big whoosh and the fuse fizzing away across the deck' }, (s, out) => {
    const d = withRoom(s, out, 0.12, 'medium');
    formantVoice(s, d, 0, 0.1, [[0, 150], [1, 175]], [[0, 620, 1150], [1, 560, 1050]], 0.25, 0.01, 0.005);
    whoosh(s, d, 0.05, 0.3, 0.9, { f0: 350, f1: 2800, q: 1.3, peakAt: 0.4, pan0: -0.2, pan1: 0.7, color: 'pink' });
    whoosh(s, d, 0.06, 0.28, 0.4, { f0: 1500, f1: 5000, q: 2, peakAt: 0.4, pan0: -0.2, pan1: 0.7, color: 'white' });
    const p = s.panner(-0.1, d);
    p.pan.setValueAtTime(-0.1, 0.1);
    p.pan.linearRampToValueAtTime(0.8, 0.6);
    fuse(s, p, 0.08, 0.5, 0.35, { fadeIn: 0.02, fadeOut: 0.4, sparks: 1.2 });
  }),
  ...variants('capPegTap', 3, { kind: 'sfx', seconds: 0.3, level: -24, desc: "the Captain's peg leg taps the deck (variations)" }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    block(s, d, 0, [760, 700, 820][i], 0.6, { decay: 0.05 });
    crate(s, d, 0, 0.3, { size: 0.55, pitch: [1.3, 1.22, 1.38][i] });
  }),
  one('parrotSquawk', { kind: 'sfx', seconds: 1.0, level: -16, desc: 'Sparks the parrot: a sharp, higher "AWK-awk!" with a flap (shorter than the KEG DROP squawk "howl")' }, (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    parrot(s, d, 0, 0.9, { pitch: 1.28, len: 0.2, whistle: false });
    parrot(s, d, 0.27, 0.75, { pitch: 1.4, len: 0.15, whistle: false });
    flap(s, d, 0.05, 0.3);
    flap(s, d, 0.14, 0.25);
  }),
  ...variants('parrotFlap', 2, { kind: 'sfx', seconds: 0.6, level: -23, desc: 'Sparks flaps his wings (variations)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    const n = 3 + i;
    for (let k = 0; k < n; k++) flap(s, d, k * 0.085, 0.8 - k * 0.12, { f: 900 + k * 60 + i * 80 });
  }),
];
