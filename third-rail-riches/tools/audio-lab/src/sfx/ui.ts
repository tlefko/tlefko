/** UI sounds: short, soft and woody (ship's timber, brass fittings, rope), plus the bosun's-call iris wipe. */
import { hz } from '../core/notes';
import { block, kick } from '../instruments/drums';
import { additive, glock, marimba, shipBell } from '../instruments/tuned';
import { bosunCall, mutedTrumpet, tuba } from '../instruments/winds';
import { fireWhoomp, poof, whoosh } from '../instruments/fx';
import { coinSpill, crate, doubloon, fuse, ropeRun } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, tailFade, withRoom } from './common';

/** Brass tube sliding (spyglass): a resonant, metallic noise sweep. */
function spyglass(s: Parameters<SfxDef['render']>[0], d: Parameters<SfxDef['render']>[1], t: number, dur: number, f0: number, f1: number, vel: number) {
  whoosh(s, d, t, dur, vel, { f0, f1, q: 3.5, peakAt: 0.75, color: 'white' });
  whoosh(s, d, t, dur, vel * 0.5, { f0: f0 * 2.1, f1: f1 * 2.1, q: 6, peakAt: 0.75, color: 'white' });
}

export const UI_SFX: SfxDef[] = [
  one('uiClick', { kind: 'sfx', seconds: 0.25, level: -25, desc: 'soft wooden peg tick' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    block(s, d, 0, 1240, 0.5, { decay: 0.03 });
    block(s, d, 0.001, 2750, 0.1, { decay: 0.012 });
  }),
  one('uiToggle', { kind: 'sfx', seconds: 0.3, level: -24, desc: 'two-step wooden latch click' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    block(s, d, 0, 1050, 0.4, { decay: 0.03 });
    block(s, d, 0.05, 1580, 0.45, { decay: 0.03 });
    block(s, d, 0.051, 3900, 0.08, { decay: 0.01 });
  }),
  one('uiOpen', { kind: 'sfx', seconds: 0.6, level: -22, desc: 'brass spyglass slides open + a tiny ping' }, (s, out) => {
    const d = withRoom(s, out, 0.12);
    spyglass(s, d, 0, 0.13, 1300, 3600, 0.35);
    block(s, d, 0.125, 2300, 0.25, { decay: 0.015 });
    glock(s, d, 0.13, hz('E6'), 0.22, { decay: 0.5 });
  }),
  one('uiClose', { kind: 'sfx', seconds: 0.5, level: -23, desc: 'spyglass slides shut with a soft wooden thock' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    spyglass(s, d, 0, 0.1, 3400, 1300, 0.3);
    block(s, d, 0.095, 820, 0.35, { decay: 0.035 });
  }),
  one('betUp', { kind: 'sfx', seconds: 0.6, level: -22, desc: 'a doubloon clinks onto the stack, stepping up' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    marimba(s, d, 0, hz('G5'), 0.4);
    marimba(s, d, 0.06, hz('C6'), 0.5);
    doubloon(s, d, 0.06, 0.35, { f: 2700, bounce: false, decay: 0.16 });
  }),
  one('betDown', { kind: 'sfx', seconds: 0.6, level: -22, desc: 'a doubloon lifted off the stack, stepping down' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    marimba(s, d, 0, hz('C6'), 0.45);
    marimba(s, d, 0.06, hz('G5'), 0.45);
    doubloon(s, d, 0, 0.3, { f: 2450, bounce: false, decay: 0.14 });
  }),
  one('spinPress', { kind: 'sfx', seconds: 0.6, level: -21, desc: 'rope-and-pulley lever: wooden thock, rope run, pulley squeak' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    block(s, d, 0, 230, 0.6, { decay: 0.07 });
    kick(s, d, 0, 0.3, { tone: 80, decay: 0.1 });
    ropeRun(s, d, 0.02, 0.2, 0.45, { f0: 800, f1: 2000, squeak: 0.7 });
    whoosh(s, d, 0.03, 0.24, 0.18, { f0: 500, f1: 2800, q: 1.2, peakAt: 0.55 });
  }),
  one('buy', { kind: 'sfx', seconds: 1.4, level: -16, desc: 'heavy coin pouch drops, the chest latch snaps shut, a small bell' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    // pouch: soft leather thud with muffled coins inside
    crate(s, d, 0, 0.7, { size: 1.1, pitch: 0.6 });
    const muffle = s.filter('lowpass', 2600, 0.7, d);
    coinSpill(s, muffle, 0.005, 0.12, 8, 0.6, { f: 2300 });
    // latch
    const lt = 0.3;
    block(s, d, lt, 1650, 0.6, { decay: 0.02 });
    block(s, d, lt + 0.002, 3700, 0.25, { decay: 0.012 });
    crate(s, d, lt + 0.004, 0.35, { size: 0.6, pitch: 1.4 });
    shipBell(s, d, lt + 0.06, hz('A6'), 0.35, { decay: 1.0, bright: 1.1 });
    doubloon(s, d, lt + 0.1, 0.35, { f: 2900 });
  }),
  one('error', { kind: 'sfx', seconds: 0.7, level: -22, desc: 'gentle two-note muted-horn womp over a soft tuba' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    mutedTrumpet(s, d, 0, hz('A3'), 0.16, 0.6, 'w');
    mutedTrumpet(s, d, 0.19, hz('Ab3'), 0.28, 0.6, 'wf');
    tuba(s, d, 0, hz('A2'), 0.14, 0.35);
    tuba(s, d, 0.19, hz('Ab2'), 0.26, 0.35);
  }),
  one('iris', { kind: 'sfx', seconds: 1.1, level: -19, desc: "bosun's call for the iris wipe: pipe up, warble, fall away" }, (s, out) => {
    const d = withRoom(s, tailFade(s, out, 0.95, 1.08), 0.16, 'medium');
    bosunCall(s, d, [
      { t: 0, f: 1150 },
      { t: 0.15, f: 2050, a: 1 },
      { t: 0.46, f: 2050, a: 0.95 },
      { t: 0.74, f: 1050, a: 0.5 },
    ], 0.8, { warble: [0.19, 0.44], rate: 15 });
  }),
  one('boostOn', { kind: 'sfx', seconds: 0.8, level: -21, desc: 'Powder Boost on: a brass switch click and a fuse fizzing up' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    block(s, d, 0, 1500, 0.5, { decay: 0.02 });
    block(s, d, 0.002, 3600, 0.15, { decay: 0.008 });
    fireWhoomp(s, d, 0.03, 0.12, { size: 0.25 });
    fuse(s, d, 0.03, 0.45, 0.55, { fadeIn: 0.06, swell: 3, sparks: 1.5, fadeOut: 0.12 });
  }),
  one('boostOff', { kind: 'sfx', seconds: 0.7, level: -22, desc: 'Powder Boost off: a click and the fuse fizzling out with a puff' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    block(s, d, 0, 1150, 0.5, { decay: 0.02 });
    fuse(s, d, 0.01, 0.32, 0.45, { fadeIn: 0.005, fadeOut: 0.28, sparks: 0.8 });
    poof(s, d, 0.28, 0.25, { f: 900 });
  }),
  one('lowPowerClick', { kind: 'sfx', seconds: 0.3, level: -24, desc: 'a lantern shutter click (low-power toggle): metal click and a glass tink' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    block(s, d, 0, 2500, 0.45, { decay: 0.01 });
    additive(s, d, 0.003, 4300, 0.1, [[1, 1, 0.1], [1.5, 0.5, 0.07]], 0.0003);
    block(s, d, 0.03, 1300, 0.25, { decay: 0.015 });
  }),
];
