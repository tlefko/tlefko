/**
 * Track-board sounds: column landings (wooden-metal clacks), Golden Tickets (punch + "ka-ching" +
 * a sparkle climbing with the count), Fare Coins by metal, Locomotives, Junctions and the Live Wire.
 * Pitched parts sit on F major pentatonic (= D minor pentatonic) so they agree with every track.
 */
import { hz } from '../core/notes';
import { block, crash, kick } from '../instruments/drums';
import { celesta, glock } from '../instruments/tuned';
import { brass, mutedTrumpet } from '../instruments/winds';
import { coinClink, ratchet, sample } from '../instruments/fx';
import { crate, doubloon, ironClank } from '../instruments/foley';
import { airHorn, arc, crackle, register, steamHiss, ticketPunch, zap } from '../instruments/train';
import type { SfxDef } from '../types';
import { one, variants, withRoom } from './common';

const DROP_PITCH = [1.0, 1.09, 1.04, 1.15, 0.96, 1.11];
const TICKET = ['C6', 'D6', 'F6', 'G6', 'A6', 'C7'];
const TICKET_GRACE = ['G5', 'A5', 'C6', 'D6', 'F6', 'G6'];

export const REEL_SFX: SfxDef[] = [
  ...variants('reelDrop', 6, { kind: 'sfx', seconds: 0.45, level: -20, desc: 'a column lands: soft wooden-metal clack (index = column 0..5)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.1);
    const p = DROP_PITCH[i];
    crate(s, d, 0, 0.55, { size: 0.7, pitch: p * 1.1 });
    ironClank(s, d, 0.002, 0.28, { f: 980 * p, decay: 0.04 });
    kick(s, d, 0, 0.28, { tone: 68 + i * 3, decay: 0.1 });
    block(s, d, 0.04 + i * 0.003, 600 * p, 0.1, { decay: 0.03 });
  }),
  one('reelStop', { kind: 'sfx', seconds: 0.7, level: -18, drive: 1.5, desc: 'last column: a heavier thunk with an iron rattle' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    crate(s, d, 0, 0.85, { size: 1.25, pitch: 0.85 });
    kick(s, d, 0, 0.5, { tone: 55, decay: 0.24 });
    ironClank(s, d, 0.003, 0.4, { f: 620, decay: 0.08 });
    ironClank(s, d, 0.07, 0.14, { f: 880, decay: 0.04 });
    block(s, d, 0.11, 470, 0.1, { decay: 0.04 });
  }),

  // Golden Ticket: punch, "ka-ching", a sparkle rising with the count; from 3 on it gets exciting
  ...variants('ticketLand', 6, { kind: 'sfx', seconds: 2.0, level: -17, desc: 'Golden Ticket lands: punch "chk", register "ka-ching" and a rising sparkle (index = count 1..6; 3+ adds bell, brass and shimmer)' }, (i) => async (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    const n = TICKET[i];
    const vel = 0.55 + i * 0.07;
    ticketPunch(s, d, 0, 0.8, { pitch: 1 + i * 0.03 });
    kick(s, d, 0, 0.25, { tone: 70, decay: 0.08 });
    register(s, d, 0.02, 0.45 + i * 0.05, { bell: hz(n) });
    celesta(s, d, 0.06, hz(TICKET_GRACE[i]), vel * 0.4, { decay: 0.6 });
    glock(s, d, 0.1, hz(n), vel * 0.8, { decay: 1.1 + i * 0.1 });
    celesta(s, d, 0.1, hz(n) / 2, vel * 0.5, { decay: 1.2 });
    if (i >= 2) {
      // three or more: a brass "ta-DA" stab under the chime, and the sparkle
      const top = hz(n) / 4;
      for (const r of [1, 1.26, 1.5]) brass(s, d, 0.1, top * r, 0.32 + i * 0.04, 0.4 + i * 0.07, { bright: 1.1 });
      for (let k = 0; k < 3 + i; k++) glock(s, d, 0.2 + k * 0.05, hz(TICKET[(k + i) % 6]) * (k + i >= 6 ? 2 : 1), 0.18 + k * 0.02, { decay: 0.9 });
      const sp = await sample(s, 'sparkle');
      s.play(sp, 0.12, s.gain(0.08 + i * 0.03, s.filter('lowpass', 9000, 0.7, d)));
    }
    if (i >= 4) {
      crash(s, d, 0.1, 0.25 + (i - 4) * 0.1, { decay: 1.4, hp: 5000 });
      mutedTrumpet(s, d, 0.42, hz(n) / 2, 0.35, 0.5, 's');
    }
  }, (i) => ({ variant: i + 1, id: `ticketLand_${i + 1}`, level: -17 + i * 0.6 })),

  // Fare Coins by metal: 0 bronze, 1 silver, 2 gold, 3 platinum
  ...variants('coinLand', 4, { kind: 'sfx', seconds: 1.8, level: -21, desc: 'a Fare Coin lands (index = metal: 0 bronze, 1 silver, 2 gold, 3 platinum with a shimmer)' }, (i) => async (s, out) => {
    const d = withRoom(s, out, 0.1 + i * 0.03, i >= 2 ? 'medium' : 'small');
    kick(s, d, 0, 0.18, { tone: 90, decay: 0.05 });
    if (i === 0) {
      coinClink(s, d, 0, 0.7, { f: 2100, decay: 0.16, bounce: true });
      block(s, d, 0, 900, 0.2, { decay: 0.02 });
    } else if (i === 1) {
      coinClink(s, d, 0, 0.75, { f: 3300, decay: 0.3, bounce: true });
      coinClink(s, d, 0.004, 0.35, { f: 4150, decay: 0.2, bounce: false });
    } else if (i === 2) {
      doubloon(s, d, 0, 0.8, { f: 2650, decay: 0.42 });
      glock(s, d, 0.03, hz('F6'), 0.3, { decay: 0.9 });
      celesta(s, d, 0.03, hz('C6'), 0.25, { decay: 0.8 });
    } else {
      coinClink(s, d, 0, 0.85, { f: 3900, decay: 0.5, bounce: true });
      doubloon(s, d, 0.003, 0.45, { f: 2900, decay: 0.4, bounce: false });
      ['C7', 'F7', 'A7', 'C8'].forEach((nn, k) => glock(s, d, 0.05 + k * 0.045, hz(nn), 0.22 + k * 0.03, { decay: 1.0 }));
      const sp = await sample(s, 'sparkle');
      s.play(sp, 0.03, s.gain(0.16, s.filter('lowpass', 10000, 0.7, d)));
    }
  }, (i) => ({ level: -21 + i * 0.7 })),

  one('locoLand', { kind: 'sfx', seconds: 1.2, level: -16, desc: 'a Locomotive lands: heavy iron clunk, a puff of steam and a short horn toot' }, (s, out) => {
    const d = withRoom(s, out, 0.16, 'medium');
    crate(s, d, 0, 0.9, { size: 1.5, pitch: 0.7 });
    ironClank(s, d, 0.002, 0.6, { f: 380, decay: 0.16 });
    kick(s, d, 0, 0.65, { tone: 46, decay: 0.3 });
    steamHiss(s, d, 0.03, 0.3, 0.35, { bright: 1.1 });
    airHorn(s, d, 0.1, 0.24, [hz('A3'), hz('C4'), hz('F4')], 0.85, { bright: 1.05 });
  }),
  one('switchLand', { kind: 'sfx', seconds: 0.8, level: -19, desc: 'a Junction lands: an iron clank with the lever rattling in its stand' }, (s, out) => {
    const d = withRoom(s, out, 0.12);
    ironClank(s, d, 0, 0.75, { f: 460, decay: 0.18 });
    ironClank(s, d, 0.003, 0.35, { f: 1180, decay: 0.08 });
    kick(s, d, 0, 0.35, { tone: 60, decay: 0.12 });
    for (let k = 0; k < 3; k++) ratchet(s, d, 0.07 + k * 0.045, 0.22 - k * 0.05, { body: 1500 + k * 120 });
  }),
  ...variants('wildLand', 3, { kind: 'sfx', seconds: 0.9, level: -18, drive: 2.5, desc: 'the Live Wire lands: an electric zap and crackle (3 takes)' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.12);
    const p = [1, 1.12, 0.9][i];
    block(s, d, 0, 1900 * p, 0.3, { decay: 0.015 });
    zap(s, d, 0, 0.9, { size: 1.1, pitch: p });
    arc(s, d, 0.05, 0.3, 0.5, { f0: 100 * p, f1: 60 * p, sweep: [3000, 900] });
    crackle(s, d, 0.1, 0.35, 8, 0.4);
  }),
];
