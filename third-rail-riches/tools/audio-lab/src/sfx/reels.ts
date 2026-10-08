/** Grid sounds: column drops (wooden crates), cascades, win pops, the Powder Kegs and the treasure-chest scatters. */
import { hz } from '../core/notes';
import { block, kick } from '../instruments/drums';
import { celesta, glock, shipBell } from '../instruments/tuned';
import { fireWhoomp, poof, whoosh } from '../instruments/fx';
import { barrel, cork, crate, doubloon, fuse, grainRattle, matchStrike } from '../instruments/foley';
import type { SfxDef } from '../types';
import { one, variants, withRoom } from './common';

const DROP_PITCH = [1.0, 1.12, 1.06, 1.19, 0.94];

export const REEL_SFX: SfxDef[] = [
  ...variants('reelDrop', 5, { kind: 'sfx', seconds: 0.45, level: -20, desc: 'wooden cargo crate thunks down as a column lands' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.1);
    const p = DROP_PITCH[i];
    crate(s, d, 0, 0.8, { size: 0.85, pitch: p });
    kick(s, d, 0, 0.3, { tone: 66 + i * 4, decay: 0.11 });
    // loose lid settles
    block(s, d, 0.045 + i * 0.004, 520 * p, 0.12, { decay: 0.035 });
  }),
  one('reelStop', { kind: 'sfx', seconds: 0.7, level: -18, desc: 'last column: a heavier crate with a little wooden clatter' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    crate(s, d, 0, 0.9, { size: 1.3, pitch: 0.82 });
    kick(s, d, 0, 0.5, { tone: 55, decay: 0.24 });
    block(s, d, 0.06, 470, 0.16, { decay: 0.045 });
    block(s, d, 0.1, 380, 0.11, { decay: 0.045 });
    block(s, d, 0.13, 560, 0.07, { decay: 0.03 });
  }),
  ...variants('symbolFall', 3, { kind: 'sfx', seconds: 0.35, level: -26, desc: 'very light air whoosh for cascading symbols' }, (i) => (s, out) => {
    whoosh(s, out, 0, 0.2 + i * 0.02, 0.35, { f0: 2600 - i * 300, f1: 800 + i * 100, q: 1.3, peakAt: 0.35, pan0: -0.2 + i * 0.2, color: 'pink' });
  }),
  ...variants('cascade', 2, { kind: 'sfx', seconds: 0.6, level: -22, desc: 'short tumble of small wooden crates' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.12);
    const pitches = i === 0 ? [1.5, 1.3, 1.15, 1.0] : [1.42, 1.22, 1.08, 0.94];
    pitches.forEach((p, k) => crate(s, d, k * 0.045 + s.rng.next() * 0.006, 0.5 - k * 0.07, { size: 0.55, pitch: p }));
    whoosh(s, d, 0, 0.22, 0.1, { f0: 1800, f1: 500, q: 1, peakAt: 0.3 });
  }),
  ...variants('pop', 3, { kind: 'sfx', seconds: 0.5, level: -21, desc: 'a win pops: soft grog-bottle cork and a puff' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.08);
    const f = [620, 540, 700][i];
    cork(s, d, 0, f, 0.8);
    poof(s, d, 0.012, 0.45, { f: [1300, 1100, 1550][i] });
  }),
  one('sixLand', { kind: 'sfx', seconds: 2.4, level: -15, desc: 'a cold Powder Keg lands: heavy barrel thunk, iron hoops, a gunpowder rattle' }, (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    barrel(s, d, 0, 0.95, { size: 1.3, pitch: 0.88 });
    kick(s, d, 0, 0.55, { tone: 48, decay: 0.3 });
    grainRattle(s, d, 0.012, 0.45, 0.32, { density: 300, center: 3800 });
    // the keg rocks on its rim and settles
    barrel(s, d, 0.16, 0.24, { size: 0.9, pitch: 1.05, hoop: 0.6, knock: 0.6 });
    barrel(s, d, 0.29, 0.12, { size: 0.8, pitch: 1.1, hoop: 0.5, knock: 0.6 });
    barrel(s, d, 0.37, 0.05, { size: 0.7, pitch: 1.12, hoop: 0.4, knock: 0.5 });
  }),
  one('sixIgnite', { kind: 'sfx', seconds: 1.6, level: -14, desc: 'the keg fuse lights: match strike, flare, fuse hiss catching' }, (s, out) => {
    const d = withRoom(s, out, 0.14, 'medium');
    matchStrike(s, d, 0, 0.8);
    fireWhoomp(s, d, 0.1, 0.18, { size: 0.4 });
    fuse(s, d, 0.16, 1.05, 0.75, { fadeIn: 0.12, swell: 0.7, sparks: 1.2, fadeOut: 0.35 });
  }),
  // treasure chests land, a coin jingle and a bell/plink rising with the count of scatters (index 1..6)
  ...variants('fsLand', 6, { kind: 'sfx', seconds: 1.8, level: -18, desc: 'treasure chest thuds down, coins jingle, a bell plink rises with index 1..6' }, (i) => (s, out) => {
    const d = withRoom(s, out, 0.2, 'medium');
    const notes = ['D5', 'F5', 'A5', 'C6', 'D6', 'F6'];
    const grace = ['A4', 'C5', 'E5', 'G5', 'A5', 'C6'];
    const vel = 0.55 + i * 0.07;
    crate(s, d, 0, 0.85, { size: 1.25, pitch: 0.8 + i * 0.03 });
    kick(s, d, 0, 0.35, { tone: 58, decay: 0.16 });
    for (let k = 0; k < 2 + Math.floor(i / 2); k++) doubloon(s, d, 0.03 + k * 0.045 + s.rng.next() * 0.02, 0.3 + i * 0.03, { f: 2300 + s.rng.next() * 700, bounce: k === 0 });
    celesta(s, d, 0.05, hz(grace[i]), vel * 0.4, { decay: 0.6 });
    glock(s, d, 0.1, hz(notes[i]), vel * 0.8, { decay: 1.1 + i * 0.1 });
    celesta(s, d, 0.1, hz(notes[i]), vel * 0.6, { decay: 1.2 });
    if (i >= 3) shipBell(s, d, 0.1, hz(notes[i]), 0.12 + (i - 3) * 0.05, { decay: 1.4 });
    if (i === 5) for (let k = 0; k < 4; k++) glock(s, d, 0.22 + k * 0.06, hz(k % 2 ? 'F6' : 'E6'), 0.22);
  }, (i) => ({ variant: i + 1, id: `fsLand_${i + 1}`, level: -17 + i * 0.6 })),
];
