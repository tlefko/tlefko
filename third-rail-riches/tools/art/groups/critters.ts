import { crabHead, octoHead, sharkHead, parrotHead, type Pose, type ParrotExpr } from '../../../src/art/critters';

const poses: Pose[] = ['idle', 'blink', 'win'];
const px: ParrotExpr[] = ['idle', 'blink', 'happy', 'squawk', 'worried'];
export default () => [
  ...poses.map((p) => ({ label: `crab ${p}`, svg: crabHead(p), w: 260 })),
  ...poses.map((p) => ({ label: `octo ${p}`, svg: octoHead(p), w: 260 })),
  ...poses.map((p) => ({ label: `shark ${p}`, svg: sharkHead(p), w: 260 })),
  ...px.map((p) => ({ label: `parrot ${p}`, svg: parrotHead(p), w: 260 })),
  { label: 'crab @90', svg: crabHead('idle'), w: 90 },
  { label: 'octo @90', svg: octoHead('idle'), w: 90 },
  { label: 'shark @90', svg: sharkHead('idle'), w: 90 },
  { label: 'parrot @90', svg: parrotHead('idle'), w: 90 },
];
