import { pigeonHead, pigeonWinFrames, catHead, catWinFrames, bulldogHead, bulldogWinFrames, type Pose } from '../../../src/art/critters';

/** Third Rail Riches critter highs: every pose and win frame, on the dark subway hold, and @90 px. */
const SUBWAY = '#151b1f';
const poses: Pose[] = ['idle', 'blink', 'win'];
const SET: [string, (p: Pose) => string, (() => string)[]][] = [
  ['pigeon', pigeonHead, pigeonWinFrames],
  ['cat', catHead, catWinFrames],
  ['bulldog', bulldogHead, bulldogWinFrames],
];

export default () => [
  ...SET.flatMap(([n, head, frames]) => [
    ...poses.map((p) => ({ label: `${n} ${p}`, svg: head(p), w: 240 })),
    ...frames.map((f, k) => ({ label: `${n} win ${k + 1}`, svg: f(), w: 180 })),
  ]),
  ...SET.map(([n, head]) => ({ label: `${n} on subway`, svg: head('idle'), w: 200, bg: SUBWAY })),
  ...SET.map(([n, head]) => ({ label: `${n} @90`, svg: head('idle'), w: 90, bg: SUBWAY })),
  ...SET.flatMap(([n, , frames]) => frames.map((f, k) => ({ label: `${n} w${k + 1} @90`, svg: f(), w: 90, bg: SUBWAY }))),
];
