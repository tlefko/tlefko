/**
 * UI sounds: short and soft, the station's brass and Bakelite (buttons, the ticket-window shutter,
 * fare tokens, the turnstile), plus a cartoon slide-whistle iris wipe.
 */
import { hz } from '../core/notes';
import { block, brushSwish, kick } from '../instruments/drums';
import { additive, glock, marimba } from '../instruments/tuned';
import { mutedTrumpet, slideWhistle, tuba } from '../instruments/winds';
import { coinClink, ratchet, whoosh } from '../instruments/fx';
import { ironClank } from '../instruments/foley';
import { electricHum, motorWhine, register, ticketPunch, zap } from '../instruments/train';
import type { Dest, Studio } from '../core/studio';
import type { SfxDef } from '../types';
import { one, withRoom } from './common';

/** The ticket-window shutter: a rattly steel slat sliding (resonant metallic noise sweep). */
function shutter(s: Studio, d: Dest, t: number, dur: number, f0: number, f1: number, vel: number) {
  whoosh(s, d, t, dur, vel, { f0, f1, q: 3.2, peakAt: 0.7, color: 'white' });
  whoosh(s, d, t, dur, vel * 0.4, { f0: f0 * 2.3, f1: f1 * 2.3, q: 6, peakAt: 0.7, color: 'white' });
  for (let k = 0; k < 4; k++) block(s, d, t + (k / 4) * dur, 2600 + k * 180, vel * 0.18, { decay: 0.006 });
}

/** A fare token clinking on the brass counter. */
function token(s: Studio, d: Dest, t: number, f: number, vel: number, bounce = false) {
  coinClink(s, d, t, vel, { f, bounce, decay: 0.2 });
}

export const UI_SFX: SfxDef[] = [
  one('uiClick', { kind: 'sfx', seconds: 0.25, level: -25, desc: 'soft Bakelite button tick with a hint of brass' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    block(s, d, 0, 1380, 0.5, { decay: 0.025 });
    block(s, d, 0.001, 3100, 0.1, { decay: 0.01 });
    additive(s, d, 0.001, 5200, 0.025, [[1, 1, 0.05]], 0.0003);
  }),
  one('uiToggle', { kind: 'sfx', seconds: 0.3, level: -24, desc: 'two-step brass toggle switch' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    block(s, d, 0, 1100, 0.4, { decay: 0.025 });
    ironClank(s, d, 0.048, 0.25, { f: 1250, decay: 0.03 });
    block(s, d, 0.05, 1650, 0.4, { decay: 0.025 });
  }),
  one('uiOpen', { kind: 'sfx', seconds: 0.6, level: -22, desc: 'ticket-window shutter rolls up, a tiny bell ping' }, (s, out) => {
    const d = withRoom(s, out, 0.12);
    shutter(s, d, 0, 0.14, 1200, 3400, 0.3);
    block(s, d, 0.135, 2200, 0.25, { decay: 0.015 });
    glock(s, d, 0.14, hz('C7'), 0.2, { decay: 0.5 });
  }),
  one('uiClose', { kind: 'sfx', seconds: 0.5, level: -23, desc: 'the shutter rolls down and lands with a soft clack' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    shutter(s, d, 0, 0.11, 3200, 1200, 0.28);
    ironClank(s, d, 0.105, 0.35, { f: 700, decay: 0.05 });
    block(s, d, 0.106, 760, 0.3, { decay: 0.03 });
  }),
  one('betUp', { kind: 'sfx', seconds: 0.8, level: -22, desc: 'a fare token clinks onto the stack, stepping up' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    marimba(s, d, 0, hz('C5'), 0.4);
    marimba(s, d, 0.06, hz('F5'), 0.5);
    token(s, d, 0.06, 3300, 0.35);
  }),
  one('betDown', { kind: 'sfx', seconds: 0.8, level: -22, desc: 'a fare token lifted off the stack, stepping down' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    marimba(s, d, 0, hz('F5'), 0.45);
    marimba(s, d, 0.06, hz('C5'), 0.45);
    token(s, d, 0, 3000, 0.3);
  }),
  one('spinPress', { kind: 'sfx', seconds: 0.6, level: -21, desc: 'the turnstile: a lever thunk, the ratchet turning, a little air' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    block(s, d, 0, 260, 0.6, { decay: 0.06 });
    kick(s, d, 0, 0.3, { tone: 85, decay: 0.09 });
    ironClank(s, d, 0.004, 0.35, { f: 560, decay: 0.06 });
    for (let k = 0; k < 4; k++) ratchet(s, d, 0.05 + k * 0.035, 0.32 - k * 0.04, { body: 2300 + k * 90 });
    whoosh(s, d, 0.03, 0.24, 0.16, { f0: 600, f1: 2800, q: 1.2, peakAt: 0.55 });
  }),
  one('buy', { kind: 'sfx', seconds: 1.6, level: -16, desc: 'tokens drop in the fare box, the register goes "ka-ching", a ticket is punched' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    [3100, 2800, 3400, 2950].forEach((f, k) => token(s, d, k * 0.035, f, 0.55 - k * 0.06, k === 3));
    register(s, d, 0.16, 0.8, { bell: hz('C7') });
    ticketPunch(s, d, 0.5, 0.7);
    glock(s, d, 0.24, hz('F6'), 0.22, { decay: 0.9 });
  }),
  one('error', { kind: 'sfx', seconds: 0.7, level: -22, desc: 'gentle two-note muted-horn "wah-wah" over a soft tuba' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    mutedTrumpet(s, d, 0, hz('A3'), 0.16, 0.6, 'w');
    mutedTrumpet(s, d, 0.19, hz('Ab3'), 0.28, 0.6, 'wf');
    tuba(s, d, 0, hz('A2'), 0.14, 0.35);
    tuba(s, d, 0.19, hz('Ab2'), 0.26, 0.35);
  }),
  one('iris', { kind: 'sfx', seconds: 1.3, level: -19, desc: 'cartoon iris wipe: a slide whistle up and down over a brush swish' }, (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    slideWhistle(s, d, [{ t: 0, f: 700 }, { t: 0.22, f: 1900, a: 1 }, { t: 0.3, f: 1900, a: 0.9 }, { t: 0.7, f: 600, a: 0.5 }], 0.8);
    brushSwish(s, d, 0.02, 0.55, 1.4);
  }),
  one('boostOn', { kind: 'sfx', seconds: 0.9, level: -21, desc: 'Express Pass on: a knife switch thrown, a spark and the power humming up' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    ironClank(s, d, 0, 0.5, { f: 820, decay: 0.05 });
    block(s, d, 0, 1500, 0.4, { decay: 0.02 });
    zap(s, d, 0.012, 0.35, { size: 0.5, pitch: 1.2 });
    electricHum(s, d, 0.04, 0.6, 0.6, { f0: 50, f1: 120, fadeIn: 0.1, fadeOut: 0.25 });
    motorWhine(s, d, 0.04, 0.6, 0.7, 300, 1100, { fadeOut: 0.25 });
  }),
  one('boostOff', { kind: 'sfx', seconds: 0.8, level: -22, desc: 'Express Pass off: the switch opens with a click and the power winds down' }, (s, out) => {
    const d = withRoom(s, out, 0.1);
    ironClank(s, d, 0, 0.45, { f: 700, decay: 0.04 });
    block(s, d, 0, 1150, 0.4, { decay: 0.02 });
    electricHum(s, d, 0.01, 0.5, 0.5, { f0: 110, f1: 45, fadeIn: 0.01, fadeOut: 0.35 });
    motorWhine(s, d, 0.01, 0.5, 0.6, 900, 250, { fadeOut: 0.35 });
  }),
  one('lowPowerClick', { kind: 'sfx', seconds: 0.3, level: -24, desc: 'a lamp switch clicks (low-power toggle): metal click and the bulb tinking' }, (s, out) => {
    const d = withRoom(s, out, 0.06);
    block(s, d, 0, 2500, 0.45, { decay: 0.01 });
    additive(s, d, 0.003, 4300, 0.1, [[1, 1, 0.1], [1.5, 0.5, 0.07]], 0.0003);
    block(s, d, 0.03, 1300, 0.25, { decay: 0.015 });
  }),
];
