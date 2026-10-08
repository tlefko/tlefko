import { pretzel, pretzelWinFrames, coffee, coffeeWinFrames, newspaper, newspaperWinFrames, umbrella, umbrellaWinFrames } from '../../../src/art/lows';

/** Third Rail Riches low symbols: idle, every win frame, the set on the dark subway hold, and @90 px. */
const SUBWAY = '#151b1f';
const SET: [string, () => string, (() => string)[]][] = [
  ['pretzel', pretzel, pretzelWinFrames],
  ['coffee', coffee, coffeeWinFrames],
  ['newspaper', newspaper, newspaperWinFrames],
  ['umbrella', umbrella, umbrellaWinFrames],
];

export default () => [
  ...SET.flatMap(([n, idle, frames]) => [
    { label: `${n} idle`, svg: idle(), w: 256 },
    ...frames.map((f, k) => ({ label: `${n} win ${k + 1}`, svg: f(), w: 180 })),
  ]),
  ...SET.map(([n, idle]) => ({ label: `${n} on subway`, svg: idle(), w: 200, bg: SUBWAY })),
  ...SET.map(([n, idle]) => ({ label: `${n} @90`, svg: idle(), w: 90, bg: SUBWAY })),
  ...SET.flatMap(([n, , frames]) => frames.map((f, k) => ({ label: `${n} w${k + 1} @90`, svg: f(), w: 90, bg: SUBWAY }))),
];
