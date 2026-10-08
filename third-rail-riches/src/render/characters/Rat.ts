import { CanvasSource, Container, MeshRope, Point, Sprite, Texture, type RopeGeometry } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture } from '../textures';
import {
  ratHead,
  ratTorso,
  ratFoot,
  ratTailStrip,
  ratLuggage,
  ratCrumb,
  ratSqueakLines,
  cropBox,
  RAT_PARTS,
  TORSO_BOX,
  TORSO_HIP,
  FOOT_BOX,
  FOOT_ANKLE,
  FOOT_SOLE,
  LUGGAGE_BOX,
  LUGGAGE_FOOT,
  LUGGAGE_TOP,
  RAT_EYES,
  RAT_MOUTH,
  type RatExpr,
  type RatPart,
} from '../../art/rat';
import { caseyGlove as glove, type CaseyHand } from '../../art/cast/casey';
/** Rivets wears the cast's gloves (three fingers and a thumb). */
type HandPose = Extract<CaseyHand, 'open' | 'fist' | 'flat'>;
import { hoseSection } from '../../art/hose';
import { C } from '../../art/kit';
import { T } from '../timing';
import { motion } from './motion';
import { sound } from '../../game/sound';
import type { Particles } from '../fx/Particles';

export type RatState = 'idle' | 'squeak' | 'happy' | 'worried' | 'duck' | 'watch';
type State = RatState;
type Vec = { x: number; y: number };

/* ------------------------------------------------------------------ */
/* Proportions, in design units (~360 tall, origin on the floor under the luggage) */
/* ------------------------------------------------------------------ */
/** Luggage width for its 256 box. */
const LUG = 186;
const LK = LUG / 256;
/** The top case's lid, where his feet stand. */
const LID_Y = -(LUGGAGE_FOOT - LUGGAGE_TOP) * LK;
/** Foot art scale (256 box -> units) and the ankle's height above the sole. */
const FK = 0.26;
const ANKLE_H = (FOOT_SOLE - FOOT_ANKLE[1]) * FK;
const FOOT_X = 15;
const LEG = 25;
const TORSO = 112;
const TS = TORSO / 256;
const NECK_H = (TORSO_HIP[1] - 34) * TS;
const HEAD = 150;
const HS = HEAD / 256;
const HEAD_PIVOT: [number, number] = [128, 226];
const ARM = 56;
const ARM_W = 12;
const LEG_W = 14;
const GLOVE = 56;
const TAIL_W = 15;
const SHOULDER = { x: 19, y: (TORSO_HIP[1] - 66) * TS };
const CAP_PIVOT = RAT_PARTS.cap.pivot;
/** Cap seat, in head-local units. */
const CAP_ON: Vec = { x: (CAP_PIVOT[0] - HEAD_PIVOT[0]) * HS, y: (CAP_PIVOT[1] - HEAD_PIVOT[1]) * HS };
/** Mouth, in head-local units (where the crumb is nibbled and squeaks come from). */
const MOUTH: Vec = { x: 0, y: (RAT_MOUTH[1] - HEAD_PIVOT[1]) * HS };

const EYE_DX = RAT_EYES.dx;
const PUPIL_R_DX = RAT_EYES.pupilDx;

interface Face {
  happy: number;
  lid: number;
  pupil: number;
  look: [number, number];
  worry: number;
  mouth: Mouth;
  /** Brows: lift (box units, negative = up) and turn (deg, positive drops the inner end). */
  brow: [number, number];
}
type Mouth = 'mouth' | 'grin' | 'open' | 'worry';
type FaceKey = RatExpr | 'duck' | 'watch';
const FACES: Record<FaceKey, Face> = {
  idle: { happy: 0, lid: 0, pupil: 1, look: [0, 0], worry: 0, mouth: 'mouth', brow: [0, -7] },
  blink: { happy: 0, lid: 0, pupil: 1, look: [0, 0], worry: 0, mouth: 'mouth', brow: [4, -5] },
  happy: { happy: 1, lid: 0, pupil: 1, look: [0, 0], worry: 0, mouth: 'grin', brow: [-2, -8] },
  squeak: { happy: 0, lid: 0, pupil: 0.8, look: [0.1, -0.4], worry: 0, mouth: 'open', brow: [-7, -6] },
  worried: { happy: 0, lid: 0, pupil: 1.05, look: [-0.3, -0.6], worry: 1, mouth: 'worry', brow: [-2, -22] },
  duck: { happy: 1, lid: 0, pupil: 1, look: [0, 0], worry: 0.8, mouth: 'worry', brow: [5, 14] },
  watch: { happy: 0, lid: 0, pupil: 0.95, look: [-1, -0.2], worry: 0, mouth: 'mouth', brow: [3, 10] },
};
const STATE_FACE: Record<State, FaceKey> = { idle: 'idle', squeak: 'squeak', happy: 'happy', worried: 'worried', duck: 'duck', watch: 'watch' };

/** Tweened pose. Hand targets are relative to the neck (units); `ears` -1 flat .. 1 perked. */
interface Pose {
  hop: number;
  crouch: number;
  lean: number;
  tilt: number;
  jut: number;
  lx: number;
  ly: number;
  lw: number;
  rx: number;
  ry: number;
  rw: number;
  capOff: number;
  ears: number;
  clutch: number;
  drape: number;
  wave: number;
  nibble: number;
  tremble: number;
}
type Hands = { l: HandPose; r: HandPose };
const POSES: Record<State, Partial<Pose> & { hands: Hands }> = {
  idle: { crouch: 0, lean: 0, tilt: 0, jut: 0, lx: -31, ly: 50, lw: 0.3, rx: 30, ry: 60, rw: 0, capOff: 0, ears: 0, clutch: 0, drape: 0, wave: 0, tremble: 0, hands: { l: 'fist', r: 'flat' } },
  happy: { crouch: 0, lean: 0, tilt: 0.06, jut: 0.2, lx: -50, ly: -20, lw: -0.2, rx: 32, ry: -46, rw: 0.1, capOff: 1, ears: 0.6, clutch: 0, drape: 0, wave: 1, tremble: 0, hands: { l: 'open', r: 'fist' } },
  squeak: { crouch: 0, lean: 0, tilt: -0.08, jut: 1, lx: -38, ly: -30, lw: -0.5, rx: 38, ry: -30, rw: 0.5, capOff: 0, ears: 1, clutch: 0, drape: 0, wave: 0, tremble: 0, hands: { l: 'open', r: 'open' } },
  worried: { crouch: 0.3, lean: 0.03, tilt: 0.08, jut: 0, lx: -9, ly: 36, lw: 0.6, rx: 11, ry: 32, rw: -0.6, capOff: 0, ears: -0.8, clutch: 1, drape: 0, wave: 0, tremble: 1, hands: { l: 'fist', r: 'fist' } },
  duck: { crouch: 1, lean: 0, tilt: 0.1, jut: 0, lx: -22, ly: -92, lw: 1.1, rx: 22, ry: -96, rw: -1.1, capOff: 0, ears: -1, clutch: 0, drape: 1, wave: 0, tremble: 0.5, hands: { l: 'flat', r: 'flat' } },
  watch: { crouch: 0.12, lean: -0.13, tilt: -0.1, jut: 0.6, lx: -31, ly: 50, lw: 0.3, rx: 34, ry: -92, rw: -1.75, capOff: 0, ears: 0.5, clutch: 0, drape: 0, wave: 0, tremble: 0, hands: { l: 'fist', r: 'flat' } },
};
/** Hands at the mouth, holding the cheese (idle nibble). */
const NIBBLE = { lx: -11, ly: -12, rx: 11, ry: -12 };

/** Tail control points relative to its root, per shape. */
const TAIL_CURL: [number, number][] = [[0, 0], [22, 24], [50, 32], [74, 18], [86, -16], [80, -50], [60, -60]];
const TAIL_DRAPE: [number, number][] = [[0, 0], [20, 20], [44, 30], [70, 40], [86, 64], [90, 96], [82, 118]];
const TAIL_CLUTCH: [number, number][] = [[0, 0], [30, 12], [32, -12], [12, -28], [-6, -42], [-16, -58], [-10, -78]];
const TAIL_N = 30;

type PartSprite = Sprite & { base: Vec; k0: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rot = (v: Vec, a: number): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private c: number,
  ) {}
  step(target: number, dt: number): number {
    this.v += (this.k * (target - this.x) - this.c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/** A limb cross-section texture `w` units wide painted at `dp` device px per unit (see crew.hoseSection). */
function hoseTexture(w: number, ink: number, fill: string, lit: string, shade: string, dp: number): Texture {
  const pad = 1;
  const hpx = Math.max(8, Math.round(w * dp)) + pad * 2;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = hpx;
  const g = c.getContext('2d')!;
  const { stops } = hoseSection(ink, fill, lit, shade);
  const body = hpx - pad * 2;
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, col] = stops[i];
    const [b] = stops[i + 1];
    if (b <= a) continue;
    g.fillStyle = col;
    g.fillRect(0, pad + a * body, 4, Math.max(0.5, (b - a) * body));
  }
  g.clearRect(0, 0, 4, pad);
  g.clearRect(0, hpx - pad, 4, pad);
  return new Texture({ source: new CanvasSource({ resource: c, resolution: hpx / (w + (pad * 2) / dp) }) });
}

let capTex: Texture | null = null;
/** A white disc with an ink ring (tinted to the sleeve): the round root of a hose. */
function capTexture(): Texture {
  if (capTex) return capTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = C.ink;
  g.beginPath();
  g.arc(32, 32, 31, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(32, 32, 31 - (64 * 3.5) / 30, 0, Math.PI * 2);
  g.fill();
  capTex = Texture.from(c);
  return capTex;
}

/** One rubber-hose limb: a rope mesh laid along a quadratic (see Captain.ts). */
class Hose extends Container {
  private pts: Point[];
  private rope?: MeshRope;
  private cap?: Sprite;
  constructor(private n: number) {
    super();
    this.pts = Array.from({ length: n }, (_, i) => new Point(i, 0));
  }
  skin(tex: Texture, w: number, capColor?: string) {
    this.removeChildren();
    this.rope?.destroy();
    this.rope = new MeshRope({ texture: tex, points: this.pts });
    this.rope.autoUpdate = false;
    if (capColor) {
      if (!this.cap) this.cap = new Sprite(capTexture());
      this.cap.anchor.set(0.5);
      this.cap.width = this.cap.height = w;
      this.cap.tint = capColor;
      this.addChild(this.cap);
    }
    this.addChild(this.rope);
  }
  private lay(a: Vec, cx: number, cy: number, b: Vec): Vec {
    const n = this.n;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const flip = dy - dx > 0;
    for (let i = 0; i < n; i++) {
      const t = (flip ? n - 1 - i : i) / (n - 1);
      const u = 1 - t;
      this.pts[i].set(u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y);
    }
    (this.rope?.geometry as RopeGeometry | undefined)?.updateVertices();
    this.cap?.position.set(a.x, a.y);
    const tx = b.x - cx;
    const ty = b.y - cy;
    return Math.hypot(tx, ty) > 0.5 ? { x: tx, y: ty } : { x: dx, y: dy };
  }
  /** Rest length `len`: bows toward `pref` when the ends come closer (a free elbow / knee). */
  bend(a: Vec, b: Vec, len: number, pref: Vec): Vec {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    const side = clamp((nx * pref.x + ny * pref.y) * 3, -1, 1);
    const h = Math.sqrt((3 * d * Math.max(0, len - d)) / 8) * side;
    return this.lay(a, (a.x + b.x) / 2 + nx * h, (a.y + b.y) / 2 + ny * h, b);
  }
  override destroy(options?: Parameters<Container['destroy']>[0]) {
    const t = this.rope?.texture;
    super.destroy(options ?? { children: true });
    if (t && !t.destroyed) t.destroy(true);
  }
}

/** Catmull-Rom through `c` into `out` (n points). */
function spline(c: Vec[], out: Vec[]) {
  const segs = c.length - 1;
  const n = out.length;
  for (let s = 0; s < n; s++) {
    const u = (s / (n - 1)) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const t = u - i;
    const p0 = c[i - 1] ?? c[i];
    const p1 = c[i];
    const p2 = c[i + 1];
    const p3 = c[i + 2] ?? p2;
    const t2 = t * t;
    const t3 = t2 * t;
    const f = (a: number, b: number, cc: number, e: number) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - e) * t2 + (-a + 3 * b - 3 * cc + e) * t3);
    out[s].x = f(p0.x, p1.x, p2.x, p3.x);
    out[s].y = f(p0.y, p1.y, p2.y, p3.y);
  }
}

/**
 * Rivets the subway rat, standing on a stack of two old suitcases. Rubber-hose arms and legs,
 * white gloves, a long pink tail on a rope mesh that sways and curls like a question mark. Idle he
 * breathes, blinks, twitches his whiskers, flicks an ear, sniffs, glances about and now and then
 * nibbles a crumb of cheese. Happy: hops on the beat waving his cap; squeak: pipes up with his
 * mouth wide and little squeak lines; worried: ears down, clutching his tail; duck: cowers under his
 * hands; watch: leans toward the reels shading his eyes. Faces left (toward the reels) unflipped.
 */
export class Rat extends Container {
  private rig = new Container();
  private luggage = new Sprite();
  private tailHolder = new Container();
  private tail?: MeshRope;
  private tailPts: Point[] = Array.from({ length: TAIL_N }, (_, i) => new Point(i, 0));
  private tailVec: Vec[] = Array.from({ length: TAIL_N }, () => ({ x: 0, y: 0 }));
  private tailK = 1;
  private legL = new Hose(10);
  private legR = new Hose(10);
  private footL = new Sprite();
  private footR = new Sprite();
  private torso = new Sprite();
  private head = new Container();
  private headFront = new Container();
  private cap = new Sprite();
  private armL = new Hose(14);
  private armR = new Hose(14);
  private gloveL = new Sprite();
  private gloveR = new Sprite();
  private crumb = new Sprite();
  private squeakL = new Sprite();
  private squeakR = new Sprite();
  private part = new Map<string, PartSprite>();
  private gloveTex = new Map<HandPose, Texture>();
  private hands: Hands = { l: 'fist', r: 'flat' };
  private t = 0;
  private built = false;
  private state: State = 'idle';
  private face: FaceKey = 'idle';
  private F = { happy: 0, lid: 0, pupil: 1, lookX: 0, lookY: 0, worry: 0, blink: 0, open: 0, squeakFx: 0, sniff: 0, twitch: 0, by: 0, br: -7 };
  private mouth: Mouth = 'mouth';
  private P: Pose = { hop: 0, crouch: 0, lean: 0, tilt: 0, jut: 0, lx: -31, ly: 50, lw: 0.3, rx: 30, ry: 60, rw: 0, capOff: 0, ears: 0, clutch: 0, drape: 0, wave: 0, nibble: 0, tremble: 0 };
  private glance = { x: 0, y: 0 };
  private lookOverride: Vec | null = null;
  private followTl?: gsap.core.Tween;
  private releaseLook?: gsap.core.Tween;
  private holdTimer?: gsap.core.Tween;
  private poseTl?: gsap.core.Timeline;
  private nibbleTl?: gsap.core.Timeline;
  private next = { blink: 2.5, ear: 3, twitch: 2, sniff: 4.5, glance: 3.5, nibble: 8 };
  private springs = { head: new Spring(220, 14), earL: new Spring(260, 9), earR: new Spring(260, 9), tail: new Spring(60, 5), cap: new Spring(180, 10) };
  private prevFeetY = LID_Y;
  private torsoK = 1;
  private capK = 1;
  private crumbLeft = 1;
  private noteAcc = 0;
  fx?: Particles;
  getBeat: () => { phase: number; bpm: number } = () => ({ phase: (this.t * 1.6) % 1, bpm: 96 });

  constructor() {
    super();
    this.eventMode = 'none';
    this.luggage.anchor.set((128 - LUGGAGE_BOX[0]) / LUGGAGE_BOX[2], (LUGGAGE_FOOT - LUGGAGE_BOX[1]) / LUGGAGE_BOX[3]);
    this.torso.anchor.set((TORSO_HIP[0] - TORSO_BOX[0]) / TORSO_BOX[2], (TORSO_HIP[1] - TORSO_BOX[1]) / TORSO_BOX[3]);
    // the right foot's box is FOOT_BOX; the left one is its mirror
    this.footR.anchor.set((FOOT_ANKLE[0] - FOOT_BOX[0]) / FOOT_BOX[2], (FOOT_SOLE - FOOT_BOX[1]) / FOOT_BOX[3]);
    this.footL.anchor.set((256 - FOOT_ANKLE[0] - (256 - FOOT_BOX[0] - FOOT_BOX[2])) / FOOT_BOX[2], (FOOT_SOLE - FOOT_BOX[1]) / FOOT_BOX[3]);
    this.gloveL.anchor.set(0.5, 220 / 256);
    this.gloveR.anchor.set(0.5, 220 / 256);
    this.crumb.anchor.set(0.5);
    this.squeakL.anchor.set(0.1, 0.5);
    this.squeakR.anchor.set(0.1, 0.5);
    // z: the hose arms run behind the head (raised arms tuck behind it), the gloves come in front
    const z: [Container, number][] = [
      [this.luggage, 0], [this.tailHolder, 1], [this.legL, 2], [this.legR, 2], [this.footL, 3], [this.footR, 3], [this.torso, 4],
      [this.armL, 6], [this.armR, 6], [this.head, 7], [this.cap, 8], [this.headFront, 9], [this.gloveL, 10], [this.gloveR, 10], [this.crumb, 11], [this.squeakL, 13], [this.squeakR, 13],
    ];
    for (const [c, i] of z) {
      c.zIndex = i;
      this.rig.addChild(c);
    }
    this.rig.sortableChildren = true;
    this.addChild(this.rig);
  }

  async build(h: number, res: number) {
    const k = h / 360;
    const dp = k * res;
    const px = (u: number) => Math.max(8, Math.round(u * dp));
    const keys = Object.keys(RAT_PARTS) as RatPart[];
    const handPoses: HandPose[] = ['open', 'fist', 'flat'];
    const [heads, gloves, [torso, luggage, footL, footR, tail, crumb, squeak]] = await Promise.all([
      Promise.all(keys.map((p) => svgTexture(`rat-${p}`, ratHead(p === 'tear' || p.startsWith('brow') ? 'worried' : 'idle', false, p), px(RAT_PARTS[p].box[2] * HS), px(RAT_PARTS[p].box[3] * HS)))),
      Promise.all(handPoses.map((p) => svgTexture(`rat-glove-${p}`, glove(p), px(GLOVE)))),
      Promise.all([
        svgTexture('rat-torso', cropBox(ratTorso(), TORSO_BOX), px(TORSO_BOX[2] * TS), px(TORSO_BOX[3] * TS)),
        svgTexture('rat-luggage', cropBox(ratLuggage(), LUGGAGE_BOX), px(LUGGAGE_BOX[2] * LK), px(LUGGAGE_BOX[3] * LK)),
        svgTexture('rat-foot-l', ratFoot('L'), px(FOOT_BOX[2] * FK), px(FOOT_BOX[3] * FK)),
        svgTexture('rat-foot-r', ratFoot('R'), px(FOOT_BOX[2] * FK), px(FOOT_BOX[3] * FK)),
        svgTexture('rat-tail', ratTailStrip(), px(190), px(TAIL_W)),
        svgTexture('rat-crumb', ratCrumb(), px(26)),
        svgTexture('rat-squeak', ratSqueakLines(), px(34)),
      ]),
    ]);
    if (this.destroyed) return;
    this.rig.scale.set(k);
    this.head.removeChildren();
    this.headFront.removeChildren();
    const tex = new Map(keys.map((p, i) => [p, heads[i]]));
    const make = (key: string, p: RatPart, dx = 0) => {
      const { box, pivot } = RAT_PARTS[p];
      const t = tex.get(p)!;
      const s = this.part.get(key) ?? (new Sprite() as PartSprite);
      s.texture = t;
      s.anchor.set((pivot[0] - box[0]) / box[2], (pivot[1] - box[1]) / box[3]);
      s.k0 = (box[2] * HS) / t.width;
      s.scale.set(s.k0);
      s.base = { x: (pivot[0] + dx - HEAD_PIVOT[0]) * HS, y: (pivot[1] - HEAD_PIVOT[1]) * HS };
      s.position.set(s.base.x, s.base.y);
      this.part.set(key, s);
      return s;
    };
    const order: [string, RatPart, number][] = [
      ['earL', 'earL', 0],
      ['earR', 'earR', 0],
      ['base', 'base', 0],
      ['whiteL', 'eyeWhite', 0],
      ['whiteR', 'eyeWhite', EYE_DX],
      ['pupilL', 'pupil', 0],
      ['pupilR', 'pupil', PUPIL_R_DX],
      ['lidL', 'lid', 0],
      ['lidR', 'lid', EYE_DX],
      ['happyL', 'lidHappy', 0],
      ['happyR', 'lidHappy', EYE_DX],
      ['mouth', 'mouth', 0],
      ['grin', 'grin', 0],
      ['open', 'open', 0],
      ['worry', 'worry', 0],
      ['nose', 'nose', 0],
      ['whiskerL', 'whiskerL', 0],
      ['whiskerR', 'whiskerR', 0],
    ];
    for (const [key, p, dx] of order) this.head.addChild(make(key, p, dx));
    for (const p of ['browL', 'browR', 'tear'] as const) this.headFront.addChild(make(p, p));
    // the cap lives in the rig (it leaves the head to be waved)
    const capS = make('cap', 'cap');
    this.cap.texture = capS.texture;
    this.cap.anchor.copyFrom(capS.anchor);
    this.cap.scale.set(capS.k0);
    this.capK = capS.k0;
    this.part.delete('cap');

    const size = (s: Sprite, t: Texture, u: number) => {
      s.texture = t;
      s.scale.set(u / t.width);
    };
    size(this.torso, torso, TORSO_BOX[2] * TS);
    this.torsoK = this.torso.scale.x;
    size(this.luggage, luggage, LUGGAGE_BOX[2] * LK);
    size(this.footL, footL, FOOT_BOX[2] * FK);
    size(this.footR, footR, FOOT_BOX[2] * FK);
    size(this.crumb, crumb, 26);
    size(this.squeakL, squeak, 34);
    size(this.squeakR, squeak, 34);
    this.squeakL.scale.x *= -1;
    handPoses.forEach((p, i) => this.gloveTex.set(p, gloves[i]));
    this.gloveL.texture = this.gloveTex.get(this.hands.l)!;
    this.gloveR.texture = this.gloveTex.get(this.hands.r)!;
    const gk = GLOVE / gloves[0].width;
    this.gloveL.scale.set(-gk, gk);
    this.gloveR.scale.set(gk, gk);

    // limbs: grey fur hoses
    const fur = [C.rat, C.ratLight, '#6e6870'] as const;
    this.armL.skin(hoseTexture(ARM_W, 3.6 / ARM_W, ...fur, dp), ARM_W, C.rat);
    this.armR.skin(hoseTexture(ARM_W, 3.6 / ARM_W, ...fur, dp), ARM_W, C.rat);
    this.legL.skin(hoseTexture(LEG_W, 3.6 / LEG_W, ...fur, dp), LEG_W, C.rat);
    this.legR.skin(hoseTexture(LEG_W, 3.6 / LEG_W, ...fur, dp), LEG_W, C.rat);

    // tail: the strip stretched along a rope; the holder maps texture px back to units
    this.tail?.destroy();
    this.tailHolder.removeChildren();
    this.tail = new MeshRope({ texture: tail, points: this.tailPts, textureScale: 0 });
    this.tail.autoUpdate = false;
    this.tailK = tail.height / TAIL_W;
    this.tailHolder.scale.set(1 / this.tailK);
    this.tailHolder.addChild(this.tail);
    this.built = true;
    this.update(16);
  }

  /* ------------------------------------------------------------------ */

  /** Show one of the head's expressions. */
  setExpr(e: RatExpr) {
    if (e === 'blink') this.blink();
    else this.setFace(e);
  }

  private setFace(f: FaceKey) {
    if (f === this.face) return;
    this.face = f;
    const to = FACES[f];
    this.mouth = to.mouth;
    gsap.killTweensOf(this.F, 'happy,lid,pupil,lookX,lookY,worry,by,br');
    // the brows lead the face change by a frame
    gsap.to(this.F, { by: to.brow[0], br: to.brow[1], duration: T(0.13), ease: 'back.out(2.2)' });
    gsap.to(this.F, { happy: to.happy, lid: to.lid, pupil: to.pupil, lookX: to.look[0], lookY: to.look[1], worry: to.worry, duration: T(0.15), delay: T(0.03), ease: 'back.out(1.6)' });
    // a pop of the mouth into its new shape
    gsap.fromTo(this.F, { open: 0.6 }, { open: 1, duration: T(0.18), ease: 'back.out(2.5)' });
  }

  private blink() {
    if (this.F.happy > 0.5 || !this.built) return;
    gsap.killTweensOf(this.F, 'blink');
    gsap.timeline().to(this.F, { blink: 1, duration: 0.05, ease: 'power2.in' }).to(this.F, { blink: 1, duration: 0.05 }).to(this.F, { blink: 0, duration: 0.09, ease: 'power2.out' });
  }

  /** Follow a global point with head and eyes; `null` lets go. */
  lookAt(gx: number | null, gy = 0) {
    if (gx === null || this.destroyed) {
      this.lookOverride = null;
      return;
    }
    const lp = this.toLocal({ x: gx, y: gy });
    const k = this.rig.scale.x || 1;
    const vy = lp.y - (LID_Y - 150) * k;
    const len = Math.hypot(lp.x, vy) || 1;
    this.lookOverride = { x: lp.x / len, y: (vy / len) * 0.85 };
  }

  /** Follow something flying from one global point to another, squeak as it lands, then let go. */
  follow(x0: number, y0: number, x1: number, y1: number, dur: number) {
    this.followTl?.kill();
    this.releaseLook?.kill();
    const p = { t: 0 };
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.35;
    this.followTl = gsap.to(p, {
      t: 1,
      duration: dur,
      ease: 'none',
      onUpdate: () => {
        const u = 1 - p.t;
        this.lookAt(u * u * x0 + 2 * u * p.t * cx + p.t * p.t * x1, u * u * y0 + 2 * u * p.t * cy + p.t * p.t * y1);
      },
      onComplete: () => {
        this.accent('squeak');
        this.releaseLook = gsap.delayedCall(0.8, () => this.lookAt(null));
      },
    });
  }

  /** Switch pose. Reactions blend in and hold for `hold` seconds (0 = until changed). */
  react(state: State, hold = 0) {
    this.state = state;
    this.stopNibble();
    this.setFace(STATE_FACE[state]);
    this.holdTimer?.kill();
    this.holdTimer = undefined;
    this.poseTl?.kill();
    const { hands, ...to } = POSES[state];
    this.hands = { ...hands };
    const fast = state === 'duck' || state === 'squeak';
    const tl = gsap.timeline();
    this.poseTl = tl;
    tl.to(this.P, { ...to, duration: T(fast ? 0.12 : state === 'idle' ? 0.3 : 0.22), ease: fast ? 'power3.out' : 'back.out(1.5)' });
    if (state === 'happy') this.hop(22);
    if (state === 'squeak') {
      this.springs.earL.v -= 8;
      this.springs.earR.v += 8;
      this.springs.tail.v -= 4;
      this.F.squeakFx = 1;
    } else this.F.squeakFx = 0;
    if (state === 'duck') this.hop(-10);
    if (hold > 0) this.holdTimer = gsap.delayedCall(hold, () => this.state === state && this.react('idle'));
  }

  /** A one-off accent that keeps the current state: a hop, a squeak or a wave. */
  accent(kind: 'hop' | 'squeak' | 'wave' = 'hop') {
    if (!this.built) return;
    if (kind === 'hop') {
      sound.play('ratHop');
      this.hop(this.state === 'happy' ? 14 : 25);
      this.springs.earL.v += 6;
      this.springs.earR.v -= 6;
    } else if (kind === 'squeak') {
      sound.play('ratSqueak');
      this.stopNibble();
      const back = this.face;
      this.setFace('squeak');
      const squeakFx = this.F.squeakFx;
      this.F.squeakFx = 1;
      this.springs.earL.v -= 7;
      this.springs.earR.v += 7;
      gsap
        .timeline()
        .to(this.P, { jut: 1, ears: 1, duration: T(0.08), ease: 'back.out(2)' })
        .to(this.P, { jut: POSES[this.state].jut ?? 0, ears: POSES[this.state].ears ?? 0, duration: T(0.35), ease: 'power2.inOut', delay: T(0.45) });
      gsap.delayedCall(T(0.65), () => {
        if (this.face === 'squeak' && this.state !== 'squeak') {
          this.F.squeakFx = squeakFx;
          this.setFace(back === 'squeak' ? STATE_FACE[this.state] : back);
        }
      });
      this.squeakNotes(3);
    } else {
      sound.play('ratHop', { volume: 0.6 });
      this.stopNibble();
      if (this.state === 'happy') return;
      gsap.killTweensOf(this.P, 'wave');
      const r0 = { rx: this.P.rx, ry: this.P.ry, rw: this.P.rw };
      const hand = this.hands.r;
      this.hands.r = 'open';
      gsap
        .timeline()
        .to(this.P, { wave: 1, rx: 44, ry: -64, rw: 0.1, duration: T(0.16), ease: 'back.out(1.8)' })
        .to(this.P, { wave: 0, ...r0, duration: T(0.3), ease: 'power2.inOut', delay: T(0.9) })
        .call(() => {
          if (this.state !== 'happy') this.hands.r = hand;
        });
    }
  }

  private hop(h: number) {
    if (motion.reduced) h *= 0.3;
    gsap.killTweensOf(this.P, 'hop');
    if (h < 0) {
      gsap.timeline().to(this.P, { hop: h, duration: T(0.08), ease: 'power2.out' }).to(this.P, { hop: 0, duration: T(0.3), ease: 'back.out(2)' });
      return;
    }
    gsap
      .timeline()
      .to(this.P, { hop: -7, duration: T(0.07), ease: 'power2.in' })
      .to(this.P, { hop: h, duration: T(0.18), ease: 'power2.out' })
      .to(this.P, { hop: 0, duration: T(0.18), ease: 'power2.in' })
      .to(this.P, { hop: -9, duration: T(0.05), ease: 'power1.out' })
      .to(this.P, { hop: 0, duration: T(0.22), ease: 'back.out(2.2)' });
  }

  private squeakNotes(n: number) {
    if (!this.fx || !this.built) return;
    const k = this.rig.scale.x;
    const hp = this.head.getGlobalPosition();
    this.fx.notes(hp.x + (this.scale.x < 0 ? 26 : -26) * k, hp.y - 120 * k, Math.max(1, Math.round(n * motion.fx)));
  }

  /** Idle nibble: hands up to the mouth with a crumb of cheese, three quick nibbles, swallow. */
  private nibble() {
    this.nibbleTl?.kill();
    if (this.crumbLeft < 0.35) this.crumbLeft = 1;
    const tl = gsap.timeline();
    this.nibbleTl = tl;
    tl.to(this.P, { nibble: 1, duration: 0.28, ease: 'back.out(1.4)' });
    for (let i = 0; i < 3; i++) {
      tl.to(this.F, { open: 0.45, duration: 0.07, ease: 'power2.out', onStart: () => (this.mouth = 'open') })
        .to(this.F, { open: 1, duration: 0.08, ease: 'power2.in', onComplete: () => ((this.mouth = 'mouth'), (this.crumbLeft = Math.max(0.3, this.crumbLeft - 0.2))) })
        .to({}, { duration: 0.12 });
    }
    tl.to({}, { duration: 0.35 }).to(this.P, { nibble: 0, duration: 0.3, ease: 'power2.inOut' });
  }

  private stopNibble() {
    if (!this.nibbleTl) return;
    this.nibbleTl.kill();
    this.nibbleTl = undefined;
    gsap.to(this.P, { nibble: 0, duration: T(0.15) });
    this.mouth = FACES[this.face].mouth;
  }

  /* ------------------------------------------------------------------ */

  private idleLife() {
    const t = this.t;
    const n = this.next;
    if (t > n.blink) {
      n.blink = t + 2.2 + Math.random() * 3.6;
      this.blink();
    }
    if (motion.low) return;
    const calm = this.state === 'idle';
    if (t > n.ear) {
      // an ear flick, now and then both
      n.ear = t + 2.5 + Math.random() * 4;
      const kick = 7 + Math.random() * 5;
      if (Math.random() < 0.6) this.springs.earL.v -= kick;
      if (Math.random() < 0.6) this.springs.earR.v += kick;
    }
    if (t > n.twitch) {
      n.twitch = t + 1.6 + Math.random() * 3;
      gsap.killTweensOf(this.F, 'twitch');
      gsap.timeline().to(this.F, { twitch: 1, duration: 0.05 }).to(this.F, { twitch: 0, duration: 0.35, ease: 'power2.in' });
    }
    if (calm && t > n.sniff) {
      n.sniff = t + 4 + Math.random() * 4;
      gsap.killTweensOf(this.F, 'sniff');
      const tl = gsap.timeline();
      for (let i = 0; i < 3; i++) tl.to(this.F, { sniff: 1, duration: 0.06, ease: 'power2.out' }).to(this.F, { sniff: 0, duration: 0.09, ease: 'power2.in' });
    }
    if (calm && t > n.glance && this.P.nibble < 0.1) {
      n.glance = t + 3 + Math.random() * 3;
      const g = { x: (Math.random() - 0.5) * 1.8, y: (Math.random() - 0.6) * 0.8 };
      gsap.killTweensOf(this.glance);
      gsap.timeline().to(this.glance, { ...g, duration: 0.08, ease: 'power2.out' }).to(this.glance, { x: 0, y: 0, duration: 0.14, delay: 0.6 + Math.random() * 0.8 });
    }
    if (calm && t > n.nibble) {
      n.nibble = t + 9 + Math.random() * 7;
      this.nibble();
    }
  }

  update(dtMs: number) {
    if (!this.built || this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0.001, dtMs / 1000));
    this.t += dt;
    const t = this.t;
    const P = this.P;
    const F = this.F;
    const st = this.state;
    const red = motion.reduced;
    const low = motion.low;
    this.idleLife();
    const { phase } = this.getBeat();
    const bob = Math.pow(Math.abs(Math.sin(Math.PI * phase)), 2) * (red ? 0.4 : 1);
    const beatHop = st === 'happy' && !red ? Math.pow(Math.max(0, Math.sin(Math.PI * 2 * phase)), 2) * 9 : 0;
    const lift = P.hop + beatHop;
    const up = Math.max(0, lift);
    const crouch = clamp(P.crouch + Math.max(0, -lift) * 0.03, 0, 1.2);
    const tremble = P.tremble && !red ? Math.sin(t * 46) * 1.2 * P.tremble : 0;

    // feet leave the lid in a hop; the luggage gives a little under a landing
    const feetY = LID_Y - up;
    const vy = (feetY - this.prevFeetY) / dt;
    this.prevFeetY = feetY;
    const stretch = clamp(-vy * 0.0005, -0.1, 0.12);
    const breath = Math.sin(t * 2.3) * (red ? 0.006 : 0.014);
    const hipY = feetY - ANKLE_H - LEG * (1 - crouch * 0.55) + stretch * 10;
    const sy = 1 + breath - crouch * 0.1 - bob * 0.03 + stretch;
    const sx = 1 + (1 - sy) * 0.6;
    this.torso.position.set(tremble, hipY);
    this.torso.scale.set(this.torsoK * sx, this.torsoK * sy);
    this.torso.rotation = P.lean;
    const hip: Vec = { x: tremble, y: hipY };
    const toBody = (v: Vec): Vec => {
      const r = rot({ x: v.x * sx, y: v.y * sy }, P.lean);
      return { x: hip.x + r.x, y: hip.y + r.y };
    };
    const neck = toBody({ x: 0, y: -NECK_H });

    // legs + feet
    for (const s of [-1, 1] as const) {
      const foot = s < 0 ? this.footL : this.footR;
      foot.position.set(s * FOOT_X, feetY);
      foot.rotation = up > 2 ? s * -0.12 * Math.min(1, up / 20) : 0;
      const ankle = { x: s * FOOT_X, y: feetY - ANKLE_H + 2 };
      const h = toBody({ x: s * 11, y: -4 });
      (s < 0 ? this.legL : this.legR).bend(h, ankle, LEG + 8, { x: s, y: 0 });
    }
    this.luggage.scale.y = this.luggage.scale.x * (1 + Math.min(0, lift) * 0.003);

    // head: rides the neck a touch behind the body, juts for a squeak, sinks to cower
    const look = this.lookOverride ?? { x: F.lookX + this.glance.x, y: F.lookY + this.glance.y };
    const lookX = clamp(look.x, -1, 1);
    const lookY = clamp(look.y, -1, 1);
    const lag = low ? 0 : this.springs.head.step(clamp(vy * 0.012, -12, 12), dt);
    const sway = Math.sin(t * 1.25) * 2.4 * (red ? 0.3 : 1);
    const hx = neck.x + sway + lookX * 4 + P.lean * 40 - P.jut * 3;
    const hy = neck.y + 8 + bob * 4 + crouch * 10 - P.jut * 8 + lag;
    const chatter = st === 'squeak' && !red ? Math.sin(t * 26) * 0.03 : 0;
    const hr = P.tilt + P.lean * 0.5 + chatter + lookX * 0.05 + (st === 'idle' ? Math.sin(t * 1.6) * 0.03 : 0) + tremble * 0.004;
    const hk = 1 + P.jut * 0.03;
    for (const c of [this.head, this.headFront]) {
      c.position.set(hx, hy);
      c.rotation = hr;
      c.scale.set(hk, hk * (1 - crouch * 0.04));
    }
    this.faceFrame(lookX, lookY, dt);

    // arms: shoulders on the torso; hand targets relative to the neck, turned with the lean
    const wave = P.wave * (red ? 0.4 : 1);
    const handAt = (x: number, y: number) => {
      const r = rot({ x, y }, P.lean);
      return { x: neck.x + r.x, y: neck.y + r.y };
    };
    const nib = P.nibble;
    const swing = Math.sin(t * 13) * wave;
    const tgtL = handAt(lerp(P.lx, NIBBLE.lx, nib) + Math.sin(t * 11 + 1) * wave * 6, lerp(P.ly, NIBBLE.ly, nib) + tremble);
    const tgtR = handAt(lerp(P.rx, NIBBLE.rx, nib) + swing * 8, lerp(P.ry, NIBBLE.ry, nib) - Math.abs(swing) * 4 + tremble);
    const handL: HandPose = nib > 0.5 ? 'fist' : this.hands.l;
    const handR: HandPose = nib > 0.5 ? 'fist' : this.hands.r;
    const shL = toBody({ x: -SHOULDER.x, y: -SHOULDER.y });
    const shR = toBody({ x: SHOULDER.x, y: -SHOULDER.y });
    const tanL = this.armL.bend(shL, tgtL, ARM, { x: -1, y: 0.4 });
    const tanR = this.armR.bend(shR, tgtR, ARM, { x: 1, y: 0.4 });
    const gl = this.gloveL;
    const gr = this.gloveR;
    gl.texture = this.gloveTex.get(handL) ?? gl.texture;
    gr.texture = this.gloveTex.get(handR) ?? gr.texture;
    gl.position.set(tgtL.x, tgtL.y);
    gr.position.set(tgtR.x, tgtR.y);
    gl.rotation = Math.atan2(tanL.y, tanL.x) + Math.PI / 2 + P.lw * (1 - nib) + nib * 0.9;
    gr.rotation = Math.atan2(tanR.y, tanR.x) + Math.PI / 2 + P.rw * (1 - nib) - nib * 0.9 + swing * 0.25;

    // cap: on the head, or in the right glove when he waves it
    const capOn = rot({ x: CAP_ON.x * hk, y: CAP_ON.y * hk - F.worry * 4 }, hr);
    const onX = hx + capOn.x;
    const onY = hy + capOn.y;
    const gup = rot({ x: 0, y: -18 }, gr.rotation);
    const offX = tgtR.x + gup.x;
    const offY = tgtR.y + gup.y;
    const c = P.capOff;
    const capSpring = low ? 0 : this.springs.cap.step(clamp(-vy * 0.0012, -0.25, 0.25), dt);
    this.cap.position.set(lerp(onX, offX, c), lerp(onY, offY, c) - capSpring * 10 * (1 - c));
    this.cap.rotation = lerp(hr + capSpring * 0.3, gr.rotation * 0.6 - 0.2, c);
    this.cap.scale.set(this.capK * (1 - c * 0.1));
    // over the glove's fingers while held, on the head under them
    this.cap.zIndex = c > 0.5 ? 12 : 8;

    // the cheese crumb sits between the hands at the mouth
    this.crumb.visible = nib > 0.05;
    if (this.crumb.visible) {
      const m = rot(MOUTH, hr);
      this.crumb.position.set(lerp((tgtL.x + tgtR.x) / 2, hx + m.x, 0.7), lerp((tgtL.y + tgtR.y) / 2 - 10, hy + m.y + 8, 0.6));
      const ck = (26 / this.crumb.texture.width) * this.crumbLeft * Math.min(1, nib * 1.5);
      this.crumb.scale.set(ck);
      this.crumb.rotation = Math.sin(t * 9) * 0.08;
    }

    // squeak lines either side of the head
    const sq = F.squeakFx * (st === 'squeak' || this.face === 'squeak' ? 1 : 0);
    for (const [s, sp] of [[-1, this.squeakL], [1, this.squeakR]] as const) {
      sp.visible = sq > 0.05;
      if (!sp.visible) continue;
      const o = rot({ x: s * 72, y: -86 }, hr);
      const pulse = 0.85 + 0.25 * Math.abs(Math.sin(t * 15 + (s > 0 ? 1 : 0)));
      sp.position.set(hx + o.x, hy + o.y);
      const k0 = 34 / sp.texture.width;
      sp.scale.set(s * k0 * pulse, k0 * pulse);
      sp.rotation = hr - s * 0.35;
    }
    if (st === 'squeak' && this.fx) {
      this.noteAcc += dtMs;
      if (this.noteAcc > (low ? 420 : 220)) {
        this.noteAcc = 0;
        this.squeakNotes(1);
      }
    }

    this.tailFrame(toBody({ x: 16, y: -8 }), dt, vy);
  }

  private tailFrame(root: Vec, dt: number, vy: number) {
    const P = this.P;
    const t = this.t;
    const st = this.state;
    const red = motion.reduced;
    const clutch = clamp(P.clutch, 0, 1);
    const drape = clamp(P.drape, 0, 1) * (1 - clutch);
    const curl = 1 - clutch - drape;
    const spring = motion.low ? 0 : this.springs.tail.step(clamp(vy * 0.004, -1, 1), dt);
    const happy = st === 'happy';
    const rate = happy ? 7.5 : st === 'worried' ? 11 : 2.1;
    const amp = (happy ? 1.1 : st === 'worried' ? 0.35 : 1) * (red ? 0.4 : 1);
    const c: Vec[] = TAIL_CURL.map((p, i) => {
      const k = i / (TAIL_CURL.length - 1);
      const w = Math.sin(t * rate - i * 0.7) * amp * k * 10;
      const x = p[0] * curl + TAIL_DRAPE[i][0] * drape + TAIL_CLUTCH[i][0] * clutch;
      const y = p[1] * curl + TAIL_DRAPE[i][1] * drape + TAIL_CLUTCH[i][1] * clutch;
      // the curl sways round its hook; the drape swings like a rope; up in a hop it trails
      return {
        x: root.x + x + w * (curl + drape * 0.6) - (happy ? k * 6 : 0),
        y: root.y + y + w * 0.5 * curl - (happy ? k * k * 22 : 0) + spring * k * k * 26,
      };
    });
    spline(c, this.tailVec);
    // the rope's lit stripe runs along one side: lay it root to tip
    for (let i = 0; i < TAIL_N; i++) this.tailPts[i].set(this.tailVec[i].x * this.tailK, this.tailVec[i].y * this.tailK);
    (this.tail?.geometry as RopeGeometry | undefined)?.updateVertices();
    // clutched round to the front, the tail draws over the body (under the hands)
    this.tailHolder.zIndex = clutch > 0.5 ? 5 : 1;
  }

  private faceFrame(lookX: number, lookY: number, dt: number) {
    const F = this.F;
    const P = this.P;
    const t = this.t;
    const g = (k: string) => this.part.get(k)!;
    const open = 1 - F.happy;
    const shut = Math.min(1, F.lid + F.blink * (1 - F.lid));
    for (const side of ['L', 'R'] as const) {
      const pupil = g(`pupil${side}`);
      const lid = g(`lid${side}`);
      g(`white${side}`).alpha = pupil.alpha = open;
      pupil.position.set(pupil.base.x + lookX * 6 * HS, pupil.base.y + lookY * 7 * HS - F.worry * 2);
      pupil.scale.set(pupil.k0 * F.pupil);
      lid.scale.set(lid.k0, lid.k0 * Math.max(0.001, shut));
      lid.alpha = shut > 0.02 ? open : 0;
      g(`happy${side}`).alpha = F.happy;
    }
    // mouth: one shape at a time, popped open; a squeak works it open and shut
    const chatter = this.state === 'squeak' && this.mouth === 'open' && !motion.reduced ? 0.75 + 0.25 * Math.abs(Math.sin(t * 18)) : 1;
    for (const m of ['mouth', 'grin', 'open', 'worry'] as const) {
      const s = g(m);
      s.alpha = m === this.mouth ? 1 : 0;
      if (m === this.mouth) s.scale.set(s.k0 * (0.9 + 0.1 * F.open), s.k0 * clamp(F.open * chatter, 0.3, 1.2));
    }
    // nose sniffs (with the whiskers), whiskers twitch
    const nose = g('nose');
    nose.scale.set(nose.k0 * (1 - F.sniff * 0.08), nose.k0 * (1 + F.sniff * 0.14));
    nose.position.set(nose.base.x, nose.base.y - F.sniff * 2);
    const tw = F.twitch * Math.sin(t * 60) * 0.09 + F.sniff * 0.08;
    const droop = P.ears < 0 ? -P.ears * 0.12 : 0;
    g('whiskerL').rotation = tw + droop;
    g('whiskerR').rotation = -tw * 0.8 - droop;
    // ears: perk / flatten, plus springy flicks
    const eL = this.springs.earL.step(0, dt);
    const eR = this.springs.earR.step(0, dt);
    const earPose = P.ears >= 0 ? P.ears * 0.14 : P.ears * 0.75;
    const earL = g('earL');
    const earR = g('earR');
    earL.rotation = earPose + eL * 0.05;
    earR.rotation = -earPose + eR * 0.05;
    earL.position.set(earL.base.x, earL.base.y - Math.max(0, P.ears) * 3);
    earR.position.set(earR.base.x, earR.base.y - Math.max(0, P.ears) * 3);
    // brows: always on, they carry the acting (a blink tugs them down a hair)
    for (const k of ['browL', 'browR'] as const) {
      const b = g(k);
      const s = k === 'browL' ? 1 : -1;
      b.alpha = 1;
      b.position.set(b.base.x, b.base.y + (F.by + F.blink * 2.5) * HS);
      b.rotation = (s * F.br * Math.PI) / 180;
    }
    const tear = g('tear');
    tear.alpha = this.state === 'worried' ? F.worry : 0;
    tear.position.set(tear.base.x, tear.base.y + ((t * 30) % 14) * F.worry * 0.5);
    for (const s of this.part.values()) s.visible = s.alpha > 0.01;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.holdTimer?.kill();
    this.poseTl?.kill();
    this.nibbleTl?.kill();
    this.followTl?.kill();
    this.releaseLook?.kill();
    gsap.killTweensOf([this.P, this.F, this.glance]);
    super.destroy(options);
  }
}
