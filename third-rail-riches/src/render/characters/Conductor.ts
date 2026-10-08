import { CanvasSource, Container, MeshRope, Point, Sprite, Texture, type RopeGeometry } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { conductorRigPart, CON_HEAD_PIVOT, CON_EYES, CON_MOUTH, type ConMouth, type ConPart, type ConductorExpr } from '../../art/conductor';
import { conductorTorso, conductorBoot, CON_BOOT_BOX, lanternBody, lanternGlass, LANTERN, LANTERN_BOX, whistle, WHISTLE, capHeld, CAP_HELD, CAP_HELD_BOX, cropBox } from '../../art/uniform';
import { C as PAL } from '../../art/kit';
import { glove, prayingHands, type HandPose } from '../../art/characters';
import { T } from '../timing';
import { motion } from './motion';
import { sound } from '../../game/sound';
import type { Particles } from '../fx/Particles';

export type ConductorState = 'idle' | 'cheer' | 'pray' | 'dance' | 'shock' | 'laugh' | 'duck' | 'watch';
type State = ConductorState;
/** Rig faces: the head's own expressions plus the rig-only grit, wince and ooh. */
type Face = 'idle' | 'laugh' | 'pray' | 'shock' | 'smug' | 'whistle' | 'grit' | 'wince' | 'ooh';
type Vec = { x: number; y: number };

/** Design units: the rig is ~520 tall, origin at his feet (layout.ts sizes it by CAPTAIN_UNITS / CAPTAIN_EXTENT). */
const HS = 300 / 256; // head parts: units per 256-box unit
const GS = 96 / 256; // gloves
const HIP_Y = -112;
const TORSO_LEN = 148; // hip centre to neck
const TORSO_W = 240; // torso art width (units per 256 box)
const SH_X = 63;
const SH_Y = 40;
const ARM = 124; // rubber-hose arm length at rest
/** Lantern: units per 256-box unit, and the pendulum length (grip to the centre of mass). */
const LS = 184 / 256;
const PEND = (LANTERN.glass[1] + 20 - LANTERN.grip[1]) * LS;
/** Whistle: units per 128-box unit. */
const WS = 60 / 128;
/** The doffed cap, units per 256 box (the cap on his head is 300). */
const CAPH_U = 196;
/** The boot's painted sole line (its ink included) in the boot's 256 box: it stands on y = 0. */
const BOOT_SOLE = 216;
/** Boot drawn this wide per 256 box. */
const BOOT_U = 116;
/** Ankle to the ball of the foot, units (the boots pivot there to rise on their toes). */
const TOE = (90 * BOOT_U) / 256;
/** The lantern's reach below the grip (to its foot) and half its width, units; the swing limits. */
const LAN_REACH = (LANTERN.foot[1] - LANTERN.grip[1]) * LS;
const LAN_HALF = 40 * LS;
/** Furthest the lantern may reach either side (layout.ts CAPTAIN_EXTENT l/r, less a margin). */
const LAN_X = 204;
const FLOOR_CLEAR = 7;
/** Half the head's width at the cheeks (units): a raised lantern keeps its globe outside it. */
const FACE_R = 92;
/** Fist centre and the wrist, in glove space (units). */
const FIST = { x: 4 * GS, y: -70 * GS };
/** Where the lantern's grip stands when he sets it down on the platform to pray (the foot on y = 0). */
const PLANT = { x: 112, y: -(LANTERN.foot[1] - LANTERN.grip[1] + 5) * LS };
/** The eyes' centre relative to the neck (for lookAt), units. */
const EYE_UP = (CON_HEAD_PIVOT[1] - CON_EYES.y) * HS;

interface FaceDef {
  lid: number;
  laugh: number;
  eye: number;
  pupil: number;
  look: [number, number];
  /** Brows: [lift (box units, negative = up), rotation (inner end down > 0), arch scale (negative flips the arch)]. */
  b: [number, number, number];
  mouth: ConMouth;
  tache: number;
  puff: number;
}
const FACES: Record<Face, FaceDef> = {
  idle: { lid: 0, laugh: 0, eye: 1, pupil: 1, look: [0, 0], b: [0, 0, 1], mouth: 'grin', tache: 0, puff: 0 },
  laugh: { lid: 0, laugh: 1, eye: 1, pupil: 1, look: [0, 0], b: [-7, -0.06, 1.15], mouth: 'laugh', tache: -5, puff: 0 },
  pray: { lid: 0, laugh: 0, eye: 1, pupil: 0.95, look: [-0.1, -0.9], b: [-2, -0.24, 0.8], mouth: 'pray', tache: 1, puff: 0 },
  shock: { lid: 0, laugh: 0, eye: 1.14, pupil: 0.6, look: [0, -0.1], b: [-12, -0.08, 1.2], mouth: 'shock', tache: -3, puff: 0 },
  smug: { lid: 0.42, laugh: 0, eye: 1, pupil: 0.95, look: [0.25, 0.3], b: [3, 0.14, 0.6], mouth: 'smug', tache: 1, puff: 0 },
  whistle: { lid: 0, laugh: 1, eye: 1, pupil: 1, look: [0, 0], b: [-6, -0.1, 1.1], mouth: 'whistle', tache: -6, puff: 1 },
  grit: { lid: 0.24, laugh: 0, eye: 1, pupil: 0.9, look: [0.85, -0.25], b: [4, 0.28, 1], mouth: 'grit', tache: 2, puff: 0 },
  wince: { lid: 0, laugh: 1, eye: 1, pupil: 1, look: [0, 0], b: [5, 0.3, 1], mouth: 'grit', tache: 3, puff: 0 },
  ooh: { lid: 0, laugh: 0, eye: 1.06, pupil: 0.85, look: [0.9, -0.3], b: [-6, -0.04, 0.9], mouth: 'ooh', tache: 0, puff: 0 },
};
const EXPR_FACE: Record<ConductorExpr, Face> = { idle: 'idle', blink: 'idle', laugh: 'laugh', pray: 'pray', shock: 'shock', smug: 'smug', whistle: 'whistle' };
const STATE_FACE: Record<State, Face> = { idle: 'idle', cheer: 'laugh', pray: 'pray', dance: 'laugh', shock: 'shock', laugh: 'laugh', duck: 'wince', watch: 'ooh' };

/** Tweened pose. Hand targets are relative to their shoulder, in the un-leaned upper body. */
interface Pose {
  crouch: number;
  lift: number;
  lean: number;
  bounce: number;
  tilt: number;
  dip: number;
  lx: number;
  ly: number;
  lw: number;
  rx: number;
  ry: number;
  rw: number;
  plant: number;
  pray: number;
  capLift: number;
  capTilt: number;
  kick: number;
  rock: number;
  shake: number;
  /** 0..1: the whistle carried from his chest to his lips. */
  blow: number;
  /** 0..1: the cap off his head and in his hand (the whoop). */
  doff: number;
}
const REST: Pose = { crouch: 0, lift: 0, lean: 0, bounce: 1, tilt: 0, dip: 0, lx: -34, ly: 96, lw: 1.35, rx: 44, ry: 66, rw: -0.15, plant: 0, pray: 0, capLift: 0, capTilt: 0, kick: 0, rock: 0, shake: 0, blow: 0, doff: 0 };
const HIP = { lx: REST.lx, ly: REST.ly, lw: REST.lw };
const LANT = { rx: REST.rx, ry: REST.ry, rw: REST.rw };

/** One damped spring (secondary motion). */
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

type PartSprite = Sprite & { base: Vec; k0: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Cross-section of a rubber-hose limb: ink edge, fill, a lit stripe on the upper side, fill, a
 * darker cel band on the shadow side, ink edge (v = 0 is the left of the direction of travel).
 */
function hoseStops(ink: number, fill: string, lit: string, shade: string): [number, string][] {
  const e = ink;
  return [
    [0, PAL.ink],
    [e, PAL.ink],
    [e + 0.001, fill],
    [0.24, fill],
    [0.241, lit],
    [0.38, lit],
    [0.381, fill],
    [0.7, fill],
    [0.701, shade],
    [1 - e, shade],
    [1 - e + 0.001, PAL.ink],
    [1, PAL.ink],
  ];
}

/** A limb cross-section texture: `w` units wide (plus a feathered pixel each side), painted at `dp` device px per unit. */
function hoseTexture(w: number, ink: number, fill: string, lit: string, shade: string, dp: number): Texture {
  const pad = 1;
  const hpx = Math.max(6, Math.round(w * dp)) + pad * 2;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = hpx;
  const g = c.getContext('2d')!;
  const stops = hoseStops(ink, fill, lit, shade);
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

/** A white disc with an ink ring (tinted to the sleeve colour): the round end of a sleeve. */
let capTex: Texture | null = null;
function capTexture(): Texture {
  if (capTex) return capTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = PAL.ink;
  g.beginPath();
  g.arc(32, 32, 31, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(32, 32, 31 - (64 * 4) / 30, 0, Math.PI * 2);
  g.fill();
  capTex = Texture.from(c);
  return capTex;
}

/**
 * One rubber-hose limb: a rope mesh along a quadratic curve with a cel cross-section texture and an
 * optional round cap at the root. Moving it only rewrites the vertex positions.
 */
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
    // the lit stripe runs on the rope's left side: turn the rope so that side faces the key light
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
  /** A sleeve of rest length `len`: it bows toward `pref` when the ends are closer (an elbow for free). */
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
  /** A leg bowing by `bow` units off the straight line. */
  arc(a: Vec, b: Vec, bow: number): Vec {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return this.lay(a, (a.x + b.x) / 2 + (-dy / d) * bow, (a.y + b.y) / 2 + (dx / d) * bow, b);
  }
  override destroy(options?: Parameters<Container['destroy']>[0]) {
    const t = this.rope?.texture;
    super.destroy(options ?? { children: true });
    if (t && !t.destroyed) t.destroy(true);
  }
}

const HEAD_PARTS: ConPart[] = [
  'face',
  'cheeks',
  'eyeWhiteL',
  'eyeWhiteR',
  'pupilL',
  'pupilR',
  'eyeRingL',
  'eyeRingR',
  'lidL',
  'lidR',
  'lidLaughL',
  'lidLaughR',
  'moustache',
  'cap',
  'browL',
  'browR',
];
const MOUTHS: ConMouth[] = ['grin', 'laugh', 'pray', 'shock', 'smug', 'whistle', 'grit', 'ooh'];
/** Stacking of the head parts (the mouth slots in under the moustache). */
const HEAD_ORDER = ['face', 'cheeks', 'eyeWhiteL', 'eyeWhiteR', 'pupilL', 'pupilR', 'eyeRingL', 'eyeRingR', 'lidL', 'lidR', 'lidLaughL', 'lidLaughR', 'mouth', 'moustache', 'cap', 'browL', 'browR'];

/**
 * Conductor Casey, rubber-hose rig. Every frame is laid out from a tweened pose plus procedural
 * layers (beat bounce, breath, jig, belly-laugh shakes) and springs / a pendulum for the secondary
 * motion (cap, moustache, belly, the swinging lantern, the whistle cord). Arms are hoses of
 * constant length, so elbows bend by themselves, and each glove turns to continue its sleeve. The
 * head is built from parts so faces blend: brows glide, lids close, pupils glance, mouths squash
 * through a change, cheeks puff for the whistle.
 *
 * He holds the brass signal lantern in his right hand (screen right, toward the board) and wears
 * the whistle on a cord. dispatch() raises and swings the lantern and blows the whistle (trains
 * depart); lanternGlow() makes the lantern burn brighter (features).
 */
export class Conductor extends Container {
  private rig = new Container();
  private legL: Hose;
  private legR: Hose;
  private bootL = new Sprite();
  private bootR = new Sprite();
  private torso = new Sprite();
  private armR: Hose;
  private lanGlass = new Sprite();
  private lanHot = new Sprite();
  private lanBody = new Sprite();
  private lanGlow = new Sprite(softDotTexture());
  private lanHalo = new Sprite(softDotTexture());
  private handR = new Sprite();
  private head = new Container();
  private part = new Map<string, PartSprite>();
  private mouthTex = new Map<ConMouth, Texture>();
  private mouthBox = new Map<ConMouth, [number, number, number, number]>();
  private mouth = new Sprite() as PartSprite;
  private armL: Hose;
  private cord: Hose;
  private whistleS = new Sprite();
  private handL = new Sprite();
  private capHand = new Sprite();
  private prayS = new Sprite();
  private gloves = new Map<HandPose, Texture>();

  private P: Pose = { ...REST };
  private F = { lid: 0, laugh: 0, eye: 1, pupil: 1, lookX: 0, lookY: 0, by: 0, br: 0, bs: 1, tache: 0, puff: 0, blink: 0 };
  private t = 0;
  private unit = 1;
  private built = false;
  private state: State = 'idle';
  private face: Face = 'idle';
  private glance = { x: 0, y: 0 };
  private lookOverride: Vec | null = null;
  private lookTarget: Vec | null = null;
  private followTl?: gsap.core.Tween;
  private poseL: HandPose = 'fist';
  private poseR: HandPose = 'fist';
  private holdTimer?: gsap.core.Tween;
  private poseTween?: gsap.core.Timeline;
  private dispatchTl?: gsap.core.Timeline;
  private dispatching = false;
  private pendingState: { s: State; hold: number } | null = null;
  private busy = 0;
  private beat?: gsap.core.Timeline;
  private nextIdle = { blink: 2, glance: 3.5, rock: 6, check: 10, twirl: 15, twitch: 4, flicker: 2 };
  private springs = { capY: new Spring(260, 16), capR: new Spring(200, 14), tache: new Spring(240, 9), belly: new Spring(150, 7) };
  private prev = { hy: 0, hvy: 0, hr: 0, hipY: 0, hipVy: 0 };
  /** The lantern pendulum: angle (rad, 0 = hanging straight down) and angular velocity, plus the grip's last positions. */
  private pend = { a: 0, v: 0, px: 0, py: 0, vx: 0, vy: 0, init: false };
  private lastFistR: Vec = { x: FIST.x, y: FIST.y };
  /** Lantern brightness: 0 calm, 1 the feature glow (lanternGlow), plus a flash on dispatch. */
  private glow = { k: 0, flash: 0, flick: 0 };
  private whistleBase = 1;
  fx?: Particles;
  getBeat: () => { phase: number; bpm: number } = () => ({ phase: (this.t * 1.5) % 1, bpm: 90 });

  constructor() {
    super();
    this.eventMode = 'none';
    this.torso.anchor.set(0.5, 0.14);
    // boots stand on their soles (ink included), the platform line at y = 0; the ankle is x 128
    for (const b of [this.bootL, this.bootR]) b.anchor.set((128 - CON_BOOT_BOX[0]) / CON_BOOT_BOX[2], (BOOT_SOLE - CON_BOOT_BOX[1]) / CON_BOOT_BOX[3]);
    this.handL.anchor.set(0.5, 0.86);
    this.handR.anchor.set(0.5, 0.86);
    this.prayS.anchor.set(0.5, 0.85);
    const [lx, ly, lw, lh] = LANTERN_BOX;
    for (const s of [this.lanGlass, this.lanHot, this.lanBody]) s.anchor.set((LANTERN.grip[0] - lx) / lw, (LANTERN.grip[1] - ly) / lh);
    this.lanHot.blendMode = 'add';
    for (const g of [this.lanGlow, this.lanHalo]) {
      g.anchor.set(0.5);
      g.blendMode = 'add';
      g.tint = 0xffb43c;
    }
    this.lanHalo.tint = 0xffd27a;
    this.whistleS.anchor.set(WHISTLE.lip[0] / WHISTLE.size, WHISTLE.lip[1] / WHISTLE.size);
    const [cx, cy, cw, ch] = CAP_HELD_BOX;
    this.capHand.anchor.set((CAP_HELD.grip[0] - cx) / cw, (CAP_HELD.grip[1] - cy) / ch);
    this.capHand.visible = false;
    this.prayS.visible = false;
    this.armL = new Hose(14);
    this.armR = new Hose(14);
    this.legL = new Hose(12);
    this.legR = new Hose(12);
    this.cord = new Hose(10);
    this.rig.addChild(
      this.legL,
      this.legR,
      this.bootL,
      this.bootR,
      this.torso,
      this.head,
      this.armR,
      this.lanHalo,
      this.lanGlass,
      this.lanHot,
      this.lanBody,
      this.lanGlow,
      this.handR,
      this.cord,
      this.whistleS,
      this.armL,
      this.handL,
      this.capHand,
      this.prayS,
    );
    this.addChild(this.rig);
  }

  async build(h: number, res: number) {
    const k = h / 520;
    const px = (u: number) => Math.max(8, Math.round(u * k * res));
    const defs = [...HEAD_PARTS.map((p) => ({ key: p as string, def: conductorRigPart(p) })), ...MOUTHS.map((m) => ({ key: `mouth-${m}`, def: conductorRigPart(`mouth-${m}`) }))];
    const poses: HandPose[] = ['open', 'fist', 'flat', 'point'];
    const [, , lw, lh] = LANTERN_BOX;
    const [headTex, [torso, boot, glass, body, sw, capH, pray, ...gl]] = await Promise.all([
      Promise.all(defs.map((j) => svgTexture(`con-${j.key}`, j.def.svg, px(j.def.box[2] * HS), px(j.def.box[3] * HS)))),
      Promise.all([
        svgTexture('con-torso', conductorTorso(), px(TORSO_W)),
        svgTexture('con-boot', cropBox(conductorBoot(), CON_BOOT_BOX), px((BOOT_U * CON_BOOT_BOX[2]) / 256), px((BOOT_U * CON_BOOT_BOX[3]) / 256)),
        svgTexture('con-lan-glass', cropBox(lanternGlass(true), LANTERN_BOX), px(lw * LS), px(lh * LS)),
        svgTexture('con-lan-body', cropBox(lanternBody(), LANTERN_BOX), px(lw * LS), px(lh * LS)),
        svgTexture('con-whistle', whistle(), px(WHISTLE.size * WS)),
        svgTexture('con-cap-held', cropBox(capHeld(), CAP_HELD_BOX), px((CAP_HELD_BOX[2] * CAPH_U) / 256), px((CAP_HELD_BOX[3] * CAPH_U) / 256)),
        svgTexture('con-pray', prayingHands(), px(130)),
        ...poses.map((p) => svgTexture(`glove-${p}`, glove(p), px(96))),
      ]),
    ]);
    if (this.destroyed) return;
    this.unit = k;
    this.rig.scale.set(k);
    // head parts, stacked in head-box coordinates round the head pivot
    this.head.removeChildren();
    defs.forEach((j, i) => {
      const tex = headTex[i];
      const [bx, by, bw, bh] = j.def.box;
      if (j.key.startsWith('mouth-')) {
        const m = j.key.slice(6) as ConMouth;
        this.mouthTex.set(m, tex);
        this.mouthBox.set(m, j.def.box);
        return;
      }
      const [pvx, pvy] = j.def.pivot;
      const s = this.part.get(j.key) ?? (new Sprite() as PartSprite);
      s.texture = tex;
      s.anchor.set((pvx - bx) / bw, (pvy - by) / bh);
      s.k0 = (bw * HS) / tex.width;
      s.scale.set(s.k0);
      s.base = { x: (pvx - CON_HEAD_PIVOT[0]) * HS, y: (pvy - CON_HEAD_PIVOT[1]) * HS };
      s.position.set(s.base.x, s.base.y);
      this.part.set(j.key, s);
    });
    this.mouth.base = { x: 0, y: (CON_MOUTH[1] - CON_HEAD_PIVOT[1]) * HS };
    this.mouth.position.set(this.mouth.base.x, this.mouth.base.y);
    this.setMouthTex(FACES[this.face].mouth);
    for (const key of HEAD_ORDER) this.head.addChild(key === 'mouth' ? this.mouth : this.part.get(key)!);
    // body
    const size = (s: Sprite, t: Texture, u: number) => {
      s.texture = t;
      s.scale.set(u / t.width);
    };
    size(this.torso, torso, TORSO_W);
    size(this.bootL, boot, (BOOT_U * CON_BOOT_BOX[2]) / 256);
    size(this.bootR, boot, (BOOT_U * CON_BOOT_BOX[2]) / 256);
    this.bootL.scale.x *= -1; // left foot: toe points outward
    size(this.lanGlass, glass, lw * LS);
    size(this.lanHot, glass, lw * LS);
    size(this.lanBody, body, lw * LS);
    size(this.whistleS, sw, WHISTLE.size * WS);
    this.whistleBase = this.whistleS.scale.x;
    size(this.capHand, capH, (CAP_HELD_BOX[2] * CAPH_U) / 256);
    size(this.prayS, pray, 130);
    // the limbs' cel cross-sections, painted at the rig's device resolution
    const dp = k * res;
    this.armL.skin(hoseTexture(30, 4 / 30, PAL.uniform, PAL.uniformLight, PAL.uniformDeep, dp), 30, PAL.uniform);
    this.armR.skin(hoseTexture(30, 4 / 30, PAL.uniform, PAL.uniformLight, PAL.uniformDeep, dp), 30, PAL.uniform);
    this.legL.skin(hoseTexture(38, 4 / 38, PAL.uniform, PAL.uniformLight, PAL.uniformDeep, dp), 38);
    this.legR.skin(hoseTexture(38, 4 / 38, PAL.uniform, PAL.uniformLight, PAL.uniformDeep, dp), 38);
    this.cord.skin(hoseTexture(6, 0.3, PAL.crimson, PAL.crimsonLight, PAL.crimsonDeep, dp), 6);
    poses.forEach((p, i) => this.gloves.set(p, gl[i]));
    const pl = this.poseL;
    const pr = this.poseR;
    this.poseL = this.poseR = 'open';
    this.setGlove('L', pl, false);
    this.setGlove('R', pr, false);
    this.built = true;
  }

  /* ------------------------------------------------------------------ */
  /* faces                                                               */
  /* ------------------------------------------------------------------ */

  /** Show one of the head's expressions (blended, never a hard swap). */
  setExpr(e: ConductorExpr) {
    if (e === 'blink') this.blink();
    else this.setFace(EXPR_FACE[e]);
  }

  private setMouthTex(m: ConMouth) {
    const tex = this.mouthTex.get(m);
    const box = this.mouthBox.get(m);
    if (!tex || !box) return;
    this.mouth.texture = tex;
    this.mouth.anchor.set((CON_MOUTH[0] - box[0]) / box[2], (CON_MOUTH[1] - box[1]) / box[3]);
    this.mouth.k0 = (box[2] * HS) / tex.width;
  }

  private setFace(f: Face, dur = 0.16) {
    if (f === this.face) return;
    const from = FACES[this.face];
    const to = FACES[f];
    this.face = f;
    if (!this.built) return;
    const d = T(dur);
    gsap.killTweensOf(this.F, 'lid,laugh,eye,pupil,lookX,lookY,by,br,bs,tache,puff');
    gsap.to(this.F, { lid: to.lid, laugh: to.laugh, eye: to.eye, pupil: to.pupil, lookX: to.look[0], lookY: to.look[1], by: to.b[0], br: to.b[1], bs: to.b[2], tache: to.tache, duration: d, ease: 'back.out(1.6)' });
    gsap.to(this.F, { puff: to.puff, duration: to.puff > from.puff ? d * 1.4 : d, ease: to.puff > from.puff ? 'back.out(2.5)' : 'power2.in' });
    if (to.mouth !== from.mouth) this.swapMouth(to.mouth, d);
    if (to.laugh > 0.5 !== from.laugh > 0.5 || (to.eye > 1.05 && from.eye <= 1.05)) this.headPunch(to.eye > 1.05 ? 1 : -1);
    // the moustache bounces on any change of face
    this.springs.tache.v -= motion.reduced ? 0 : 60;
  }

  /** Mouths change on a squash: the old one closes to a line, the new one pops open past full and settles. */
  private swapMouth(m: ConMouth, d: number) {
    const mo = this.mouth;
    gsap.killTweensOf(this.mq);
    gsap
      .timeline()
      .to(this.mq, { y: 0.25, x: 1.08, duration: Math.max(0.035, d * 0.35), ease: 'power2.in' })
      .call(() => {
        if (!mo.destroyed) this.setMouthTex(m);
      })
      .to(this.mq, { y: 1, x: 1, duration: Math.max(0.1, d * 1.3), ease: 'back.out(2.6)' });
  }
  private mq = { x: 1, y: 1 };
  private hq = { x: 1, y: 1 };
  private headPunch(dir: 1 | -1) {
    if (motion.reduced) return;
    gsap.killTweensOf(this.hq);
    gsap
      .timeline()
      .to(this.hq, { x: dir > 0 ? 0.93 : 1.07, y: dir > 0 ? 1.08 : 0.93, duration: T(0.07), ease: 'power2.out' })
      .to(this.hq, { x: 1, y: 1, duration: T(0.35), ease: 'elastic.out(1, .45)' });
  }

  /** A blink: the lids drop, hold shut for two frames and lift. */
  private blink() {
    if (this.F.laugh > 0.5 || !this.built) return;
    gsap.killTweensOf(this.F, 'blink');
    gsap.timeline().to(this.F, { blink: 1, duration: 0.055, ease: 'power2.in' }).to(this.F, { blink: 1, duration: 0.04 }).to(this.F, { blink: 0, duration: 0.09, ease: 'power2.out' });
  }

  /** Look toward a global point (a train, a cell on the board); `null` hands the gaze back to the face. */
  lookAt(gx: number | null, gy = 0) {
    if (gx === null || this.destroyed) {
      this.lookOverride = null;
      this.lookTarget = null;
      return;
    }
    this.lookTarget = { x: gx, y: gy };
    const lp = this.toLocal({ x: gx, y: gy });
    const k = this.unit;
    const vx = lp.x;
    const vy = lp.y + (-HIP_Y + TORSO_LEN - 8 + EYE_UP) * k;
    const len = Math.hypot(vx, vy) || 1;
    this.lookOverride = { x: vx / len, y: (vy / len) * 0.85 };
  }

  /** Track something travelling from one global point to another along an arc, then keep looking at where it ended. */
  follow(x0: number, y0: number, x1: number, y1: number, dur: number) {
    this.followTl?.kill();
    const p = { t: 0 };
    const cx = (x0 + x1) / 2;
    const cy = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.35;
    this.followTl = gsap.to(p, {
      t: 1,
      duration: dur,
      ease: 'none',
      onUpdate: () => {
        const u = 1 - p.t;
        const t = this.lookTarget;
        this.lookAt(u * u * x0 + 2 * u * p.t * cx + p.t * p.t * x1, u * u * y0 + 2 * u * p.t * cy + p.t * p.t * y1);
        this.lookTarget = t;
      },
    });
  }

  /* ------------------------------------------------------------------ */
  /* states                                                              */
  /* ------------------------------------------------------------------ */

  /** Switch pose. Reactions blend in and hold for `hold` seconds (0 = until changed). */
  react(state: State, hold = 0) {
    const prev = this.state;
    this.state = state;
    this.holdTimer?.kill();
    this.holdTimer = undefined;
    if (this.dispatching) {
      // a dispatch owns the body until it ends; the latest request plays out afterwards
      this.pendingState = { s: state, hold };
      return;
    }
    this.setFace(STATE_FACE[state]);
    this.stopBeat();
    const P = this.P;
    const d = T(state === 'idle' ? 0.34 : 0.22);
    const ease = state === 'idle' ? 'power2.inOut' : 'back.out(1.5)';
    let pose: Partial<Pose> = { lean: 0, bounce: 1, tilt: 0, dip: 0, kick: 0, shake: 0, capTilt: 0, capLift: 0, rock: 0 };
    let gL: HandPose = 'fist';
    let gR: HandPose = 'fist';
    let crouch = 0;
    switch (state) {
      case 'idle':
        pose = { ...pose, ...HIP, ...LANT };
        break;
      case 'cheer':
        pose = { ...pose, bounce: 1.3, lx: -60, ly: -116, lw: 0.2, rx: 70, ry: -122, rw: 0.1, tilt: -0.05 };
        gL = 'open';
        this.hop(44);
        this.capPop(18);
        break;
      case 'laugh':
        // both hands on the belly while it shakes
        pose = { ...pose, lean: -0.08, tilt: -0.12, lx: 30, ly: 112, lw: -1.2, rx: -6, ry: 108, rw: 1.1, shake: 1 };
        gL = 'open';
        break;
      case 'dance':
        pose = { ...pose, bounce: 1.9, lx: -56, ly: -40, lw: 0.2, rx: 62, ry: -40, kick: 1 };
        gL = 'open';
        break;
      case 'shock':
        pose = { ...pose, lean: -0.1, tilt: -0.06, lx: -50, ly: -60, lw: 0.4, rx: 44, ry: -40, rw: 0.3 };
        gL = 'open';
        crouch = 0.28;
        this.capPop(26);
        break;
      case 'duck':
        pose = { ...pose, lean: -0.04, dip: 22, tilt: 0.1, lx: -16, ly: -150, lw: 0.5, rx: -36, ry: 36, rw: -0.4, capLift: -5 };
        gL = 'open';
        crouch = 1;
        break;
      case 'watch':
        // the lantern held out toward the board, his free hand shading his eyes
        pose = { ...pose, lean: 0.06, tilt: 0.05, lx: 26, ly: -170, lw: -1.45, rx: 60, ry: -10, rw: 0.2 };
        gL = 'flat';
        break;
      case 'pray':
        pose = { ...pose, bounce: 0, tilt: -0.08 };
        break;
    }
    this.poseTween?.kill();
    const tl = gsap.timeline();
    this.poseTween = tl;
    if (state !== 'cheer') tl.to(P, { crouch, duration: T(state === 'shock' ? 0.08 : 0.25), ease: state === 'shock' ? 'power2.out' : 'power2.inOut' }, 0);
    if (state === 'shock') tl.to(P, { crouch: 0, duration: T(0.4), ease: 'elastic.out(1, .5)' }, T(0.12));
    if (state === 'pray') {
      // set the lantern down on the platform, then press the hands together
      tl.to(P, { plant: 1, duration: T(0.2), ease: 'power2.inOut' }, 0).to(P, { pray: 1, duration: T(0.22), ease: 'back.out(1.4)' }, T(0.18));
      tl.to(P, { ...pose, duration: d, ease }, 0);
      this.setGlove('L', 'open');
      this.setGlove('R', 'open', true, T(0.19));
    } else {
      if (prev === 'pray' || P.pray > 0.01 || P.plant > 0.01) {
        tl.to(P, { pray: 0, duration: T(0.16), ease: 'power2.in' }, 0).to(P, { plant: 0, duration: T(0.2), ease: 'power2.inOut' }, T(0.15));
        tl.to(P, { ...pose, duration: d, ease }, T(0.15));
        this.setGlove('R', gR, true, T(0.15));
      } else {
        tl.to(P, { ...pose, duration: d, ease }, 0);
        this.setGlove('R', gR);
      }
      this.setGlove('L', gL);
    }
    if (hold > 0) this.holdTimer = gsap.delayedCall(hold, () => this.state === state && this.react('idle'));
  }

  /** A one-off accent that keeps the current state: a whoop (jump, cap doffed and waved), a nod or a flinch. */
  accent(kind: 'whoop' | 'nod' | 'flinch' = 'whoop') {
    if (!this.built || this.dispatching) return;
    const P = this.P;
    if (kind === 'whoop') {
      this.hop(54);
      this.headPunch(-1);
      if (P.pray > 0.01 || this.beat) return;
      // doff the cap: the free hand snatches it off, waves it high and claps it back on
      this.stopBeat();
      this.busy++;
      const back = { lx: P.lx, ly: P.ly, lw: P.lw };
      const was = this.poseL;
      const red = motion.reduced;
      gsap.killTweensOf(P, 'lx,ly,lw,doff');
      const tl = gsap.timeline({ onComplete: () => (this.busy = Math.max(0, this.busy - 1)) });
      tl.to(P, { lx: 18, ly: -150, lw: 0.3, duration: T(0.1), ease: 'power2.out' })
        .call(() => this.setGlove('L', 'fist', false))
        .set(P, { doff: 1 })
        .to(P, { lx: -40, ly: -176, lw: -0.5, duration: T(0.14), ease: 'back.out(2)' })
        .call(() => {
          const [x, y] = this.globalOf(this.capHand.position);
          this.fx?.burst(x, y, Math.round(6 * motion.fx), 'white', 0.6);
        })
        .to(P, { lx: red ? -40 : -76, ly: -150, lw: -0.9, duration: T(0.13), ease: 'sine.inOut' })
        .to(P, { lx: -40, ly: -176, lw: -0.5, duration: T(0.13), ease: 'sine.inOut' })
        .to(P, { lx: 18, ly: -150, lw: 0.3, duration: T(0.14), ease: 'power2.in' })
        .set(P, { doff: 0 })
        .call(() => this.capPop(10))
        .call(() => this.setGlove('L', was))
        .to(P, { ...back, duration: T(0.26), ease: 'back.out(1.4)' });
    } else if (kind === 'nod') {
      gsap.timeline().to(P, { tilt: 0.12, duration: T(0.1), ease: 'power2.out' }).to(P, { tilt: 0, duration: T(0.3), ease: 'back.out(2)' });
      this.springs.tache.v += motion.reduced ? 0 : 50;
    } else {
      gsap.timeline().to(P, { crouch: 0.35, lean: -0.08, duration: T(0.07), ease: 'power2.out' }).to(P, { crouch: 0, lean: 0, duration: T(0.35), ease: 'elastic.out(1, .5)' });
      this.capPop(14);
    }
  }

  /**
   * Dispatch a train: he raises the lantern high and swings it, brings the whistle to his lips and
   * blows (cheeks puffed, a puff of steam from the whistle). Resolves after ~0.6 s, on the blast;
   * he settles back into his state afterwards.
   */
  dispatch(): Promise<void> {
    if (!this.built || this.destroyed) return Promise.resolve();
    const P = this.P;
    this.dispatchTl?.kill();
    this.dispatching = true;
    this.pendingState ??= { s: this.state, hold: 0 };
    this.stopBeat();
    this.holdTimer?.kill();
    this.poseTween?.kill();
    gsap.killTweensOf(P, 'lx,ly,lw,rx,ry,rw,crouch,lean,tilt,blow,doff,dip,kick,shake,capLift,capTilt');
    P.doff = 0;
    if (P.pray > 0.01 || P.plant > 0.01) gsap.to(P, { pray: 0, plant: 0, duration: T(0.12), ease: 'power2.in' });
    this.setGlove('R', 'fist');
    this.setGlove('L', 'fist');
    const red = motion.reduced;
    let res!: () => void;
    const done = new Promise<void>((r) => (res = r));
    const tl = gsap.timeline();
    this.dispatchTl = tl;
    // 1) anticipation: a little dip, lantern drawn back, whistle hand up to the chest
    tl.to(P, { crouch: red ? 0.04 : 0.16, lean: -0.04, rx: 30, ry: 40, lx: 0, ly: 10, lw: 0, bounce: 0.3, kick: 0, shake: 0, dip: 0, duration: T(0.1), ease: 'power2.inOut' }, 0)
      // 2) up goes the lantern, the whistle to his lips
      .to(P, { crouch: 0, lean: 0.03, tilt: -0.04, rx: 64, ry: -142, rw: 0.1, duration: T(0.18), ease: 'back.out(1.6)' }, T(0.1))
      .to(P, { blow: 1, duration: T(0.16), ease: 'power2.out' }, T(0.1))
      .call(() => this.setFace('whistle', 0.1), [], T(0.14))
      // 3) the swing: lantern arcs out toward the track and back, twice
      .to(P, { rx: red ? 70 : 88, ry: -118, duration: T(0.14), ease: 'sine.inOut' }, T(0.28))
      .to(P, { rx: red ? 58 : 44, ry: -150, duration: T(0.14), ease: 'sine.inOut' }, T(0.42))
      .to(P, { rx: red ? 70 : 86, ry: -120, duration: T(0.14), ease: 'sine.inOut' }, T(0.56))
      .to(P, { rx: 64, ry: -140, duration: T(0.14), ease: 'sine.inOut' }, T(0.7))
      // the blast
      .call(() => this.blast(), [], T(0.3))
      .call(() => this.blast(true), [], T(0.48))
      .call(() => res(), [], T(0.6))
      // 4) whistle down, settle
      .to(P, { blow: 0, duration: T(0.2), ease: 'power2.inOut' }, T(0.86))
      .call(() => this.setFace('laugh', 0.12), [], T(0.86))
      .call(() => this.endDispatch(), [], T(0.96));
    sound.play('caseyWhistle', { delay: T(0.28) });
    gsap.to(this.glow, { flash: 1, duration: T(0.18), ease: 'power2.out', delay: T(0.12) });
    gsap.to(this.glow, { flash: 0, duration: T(0.6), ease: 'power2.in', delay: T(0.7) });
    return done;
  }

  private blast(second = false) {
    if (this.destroyed) return;
    // steam from the whistle's sound slot, a jolt of the cheeks and the moustache
    const slot = this.whistleSlot();
    const [x, y] = this.globalOf(slot);
    const n = Math.round((second ? 3 : 5) * motion.fx);
    this.fx?.smoke(x, y, n, 0.35, 0xf4f0e6);
    if (!second) this.fx?.burst(x, y, Math.round(4 * motion.fx), 'white', 0.45);
    this.springs.tache.v -= motion.reduced ? 0 : 90;
    gsap.fromTo(this.F, { puff: 1.18 }, { puff: 1, duration: T(0.22), ease: 'elastic.out(1, .4)' });
  }

  private endDispatch() {
    if (this.destroyed) return;
    this.dispatching = false;
    const next = this.pendingState;
    this.pendingState = null;
    this.face = 'laugh';
    this.react(next?.s ?? 'idle', next?.hold ?? 0);
  }

  /** The lantern burns brighter while a feature runs (a slow, warm pulse). */
  lanternGlow(on: boolean) {
    gsap.killTweensOf(this.glow, 'k');
    gsap.to(this.glow, { k: on ? 1 : 0, duration: T(on ? 0.5 : 0.8), ease: on ? 'power2.out' : 'power2.inOut' });
  }

  /** The lantern's glass centre as a global point (for a light beam or a spark trail to the board). */
  lanternPoint(): { x: number; y: number } {
    const g = this.lanGlow.getGlobalPosition();
    return { x: g.x, y: g.y };
  }

  private hop(h: number) {
    if (motion.reduced) h *= 0.25;
    gsap.killTweensOf(this.P, 'lift,crouch');
    gsap
      .timeline()
      .to(this.P, { crouch: 0.3, duration: T(0.06), ease: 'power2.in' })
      .to(this.P, { crouch: 0, lift: h, duration: T(0.18), ease: 'power2.out' })
      .to(this.P, { lift: 0, duration: T(0.24), ease: 'power2.in' })
      .to(this.P, { crouch: 0.22, duration: T(0.05), ease: 'power1.out' })
      .to(this.P, { crouch: 0, duration: T(0.22), ease: 'back.out(2)' });
  }

  private capPop(h: number) {
    if (motion.reduced || motion.low) h *= 0.3;
    this.springs.capY.v -= h * 22;
    this.springs.capR.v += (Math.random() - 0.5) * 3;
  }

  private setGlove(side: 'L' | 'R', pose: HandPose, pop = true, delay = 0) {
    const s = side === 'L' ? this.handL : this.handR;
    const cur = side === 'L' ? this.poseL : this.poseR;
    if (cur === pose) return;
    if (side === 'L') this.poseL = pose;
    else this.poseR = pose;
    const apply = () => {
      const tex = this.gloves.get(side === 'L' ? this.poseL : this.poseR);
      if (!tex || s.destroyed) return;
      s.texture = tex;
      const k = 96 / tex.width;
      const mir = side === 'L' ? -1 : 1;
      gsap.killTweensOf(s.scale);
      if (pop && !motion.reduced) {
        s.scale.set(k * 0.8 * mir, k * 0.8);
        gsap.to(s.scale, { x: k * mir, y: k, duration: T(0.22), ease: 'back.out(3)' });
      } else s.scale.set(k * mir, k);
    };
    if (delay > 0) gsap.delayedCall(delay, apply);
    else apply();
  }

  /* ------------------------------------------------------------------ */
  /* idle life                                                           */
  /* ------------------------------------------------------------------ */

  private idleLife() {
    const t = this.t;
    const n = this.nextIdle;
    const calm = this.state === 'idle' && !this.dispatching && this.busy === 0;
    if (t > n.blink) {
      n.blink = t + 2 + Math.random() * 3.5;
      if (this.F.laugh < 0.5 && this.F.lid < 0.6) this.blink();
    }
    if (motion.low) return;
    if (t > n.twitch) {
      // the moustache twitches (a sniff)
      n.twitch = t + 3.5 + Math.random() * 4;
      if (!motion.reduced) {
        this.springs.tache.v += 70;
        gsap.timeline().to(this.F, { tache: this.F.tache - 3, duration: 0.06 }).to(this.F, { tache: FACES[this.face].tache, duration: 0.2, ease: 'back.out(3)' });
      }
    }
    if (t > n.glance) {
      n.glance = t + 2.6 + Math.random() * 3.2;
      if (calm || this.state === 'watch') {
        const r = Math.random();
        const g = r < 0.4 ? { x: 1, y: -0.2 } : r < 0.6 ? { x: -0.8, y: 0.3 } : r < 0.8 ? { x: 0.7, y: 0.5 } : { x: 0.25, y: -0.9 };
        gsap.killTweensOf(this.glance);
        gsap
          .timeline()
          .to(this.glance, { x: g.x, y: g.y, duration: 0.09, ease: 'power2.out' })
          .to(this.glance, { x: 0, y: 0, duration: 0.14, ease: 'power2.inOut', delay: 0.7 + Math.random() * 0.9 });
        if (Math.random() < 0.4) this.blink();
      }
    }
    if (!calm) return;
    if (t > n.rock) {
      n.rock = t + 6 + Math.random() * 5;
      this.rockOnHeels();
    } else if (t > n.check) {
      n.check = t + 10 + Math.random() * 6;
      this.lanternCheck();
    } else if (t > n.twirl) {
      n.twirl = t + 13 + Math.random() * 8;
      this.twirl();
    }
  }

  private stopBeat() {
    if (this.beat) {
      this.beat.kill();
      this.beat = undefined;
      this.busy = 0;
      this.P.rock = 0;
      this.P.capTilt = 0;
      this.P.capLift = 0;
    }
    const n = this.nextIdle;
    const t = this.t;
    n.rock = Math.max(n.rock, t + 3 + Math.random() * 3);
    n.check = Math.max(n.check, t + 5 + Math.random() * 4);
    n.twirl = Math.max(n.twirl, t + 7 + Math.random() * 5);
  }

  private beatTl(): gsap.core.Timeline {
    this.busy++;
    const tl = gsap.timeline({
      onComplete: () => {
        this.busy = Math.max(0, this.busy - 1);
        if (this.beat === tl) this.beat = undefined;
      },
    });
    this.beat = tl;
    return tl;
  }

  /** Up on his toes and down again, twice: a jolly little rock on the heels. */
  private rockOnHeels() {
    const P = this.P;
    this.beatTl()
      .to(P, { rock: 1, duration: 0.2, ease: 'power2.out' })
      .to(P, { rock: 0, duration: 0.16, ease: 'power2.in' })
      .call(() => sound.play('caseyStep', { volume: 0.4 }))
      .to(P, { rock: 0.8, duration: 0.2, ease: 'power2.out' })
      .to(P, { rock: 0, duration: 0.16, ease: 'power2.in' })
      .call(() => sound.play('caseyStep', { volume: 0.4 }));
  }

  /** He lifts the lantern to eye level, peers at it, gives it a little shake, lowers it. */
  private lanternCheck() {
    const P = this.P;
    this.beatTl()
      .to(P, { rx: 18, ry: -60, rw: 0.1, tilt: 0.06, duration: 0.36, ease: 'power2.inOut' })
      .to(this.glance, { x: 0.9, y: 0.1, duration: 0.12 }, 0.12)
      .to(P, { rx: 24, duration: 0.08, ease: 'sine.inOut', repeat: 3, yoyo: true })
      .to(this.glow, { flash: 0.6, duration: 0.1 }, '<')
      .to(this.glow, { flash: 0, duration: 0.5 })
      .to(this.glance, { x: 0, y: 0, duration: 0.14 }, '<')
      .to(P, { ...LANT, tilt: 0, duration: 0.4, ease: 'power2.inOut' }, '<');
  }

  /** A twirl of the moustache tip with the free hand. */
  private twirl() {
    const P = this.P;
    const tl = this.beatTl();
    tl.call(() => this.setGlove('L', 'point'))
      .to(P, { lx: -20, ly: -40, lw: 0.6, tilt: -0.05, duration: 0.3, ease: 'power2.inOut' })
      .call(() => this.setFace('smug'));
    for (let i = 0; i < 2; i++) tl.to(P, { lx: -14, ly: -48, duration: 0.12, ease: 'sine.inOut' }).to(P, { lx: -24, ly: -36, duration: 0.12, ease: 'sine.inOut' }).call(() => (this.springs.tache.v += 30));
    tl.call(() => this.setFace('idle'))
      .call(() => this.setGlove('L', 'fist'))
      .to(P, { ...HIP, tilt: 0, duration: 0.36, ease: 'power2.inOut' });
  }

  /* ------------------------------------------------------------------ */
  /* frame                                                               */
  /* ------------------------------------------------------------------ */

  private globalOf(p: Vec): [number, number] {
    const g = this.rig.toGlobal(p);
    return [g.x, g.y];
  }

  /** The whistle's sound slot, in rig space. */
  private whistleSlot(): Vec {
    const s = this.whistleS;
    const sx = s.scale.x / this.whistleBase;
    const o = this.rot({ x: (WHISTLE.slot[0] - WHISTLE.lip[0]) * WS * sx, y: (WHISTLE.slot[1] - WHISTLE.lip[1]) * WS }, s.rotation);
    return { x: s.x + o.x, y: s.y + o.y };
  }

  update(dtMs: number) {
    if (!this.built || this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0.001, dtMs / 1000));
    this.t += dt;
    const t = this.t;
    const P = this.P;
    const red = motion.reduced;
    const low = motion.low;
    this.idleLife();
    const { phase } = this.getBeat();
    const beat = Math.abs(Math.sin(Math.PI * phase));
    const dance = P.kick;
    const bob = (10 + dance * 16) * P.bounce * (red ? 0.35 : 1) * beat;
    const breath = low ? 0 : Math.sin(t * 2.1);
    const prayK = P.pray;
    const tremble = prayK > 0.5 && !red ? Math.sin(t * 60) * 1.2 * prayK : 0;
    const shake = P.shake > 0 && !red ? Math.abs(Math.sin(t * 16)) * 6 * P.shake : 0;
    const sway = Math.sin(t * (dance > 0.5 ? 7 : 1.8)) * (2.5 + dance * 9) * (red ? 0.4 : 1);
    const rockLift = P.rock * 9;
    const hip = { x: sway * 0.5, y: HIP_Y - bob * 0.9 - P.lift - rockLift + P.crouch * 44 + tremble };
    const lean = P.lean + (dance > 0 && !red ? Math.sin(t * 7) * 0.05 * dance : 0);
    const cs = Math.cos(lean);
    const sn = Math.sin(lean);
    const U = (x: number, y: number): Vec => ({ x: hip.x + x * cs - y * sn, y: hip.y + x * sn + y * cs });
    const neckY = -TORSO_LEN + breath * 1.6 - shake * 0.3;
    const neck = U(0, neckY);
    // the belly: breathes, wobbles on landings, shakes with laughter
    const hipVy = (hip.y - this.prev.hipY) / dt;
    const hipAy = clamp((hipVy - this.prev.hipVy) / dt, -30000, 30000);
    this.prev.hipY = hip.y;
    this.prev.hipVy = hipVy;
    const spr = this.springs;
    if (!low) spr.belly.v += hipAy * dt * 0.00009;
    const belly = low ? 0 : clamp(spr.belly.step(0, dt), -0.07, 0.07);
    const squash = 1 + (beat - 0.6) * 0.045 * P.bounce - P.crouch * 0.03 + belly + (shake ? Math.sin(t * 32) * 0.012 : 0);
    const tw = this.torso;
    const tk = TORSO_W / tw.texture.width;
    tw.position.set(neck.x, neck.y + 4);
    tw.rotation = lean;
    tw.scale.set(tk * (1 + breath * 0.008 - belly * 0.5 + (shake ? Math.sin(t * 32) * 0.01 : 0)), tk * squash);

    // head: rides the neck, tilts, dips into the collar and turns a touch with the gaze
    const look = this.lookOverride ?? { x: this.F.lookX + this.glance.x, y: this.F.lookY + this.glance.y };
    const lookX = clamp(look.x, -1, 1);
    const lookY = clamp(look.y, -1, 1);
    const headRot = lean + P.tilt + Math.sin(Math.PI * 2 * phase) * (0.03 + dance * 0.06) * P.bounce * (red ? 0.4 : 1) + lookX * 0.05 + (shake ? Math.sin(t * 16) * 0.03 : 0);
    const hp = U(sway * 0.3 + lookX * 5, neckY + 8 + P.dip + (1 - squash) * 50);
    this.head.position.set(hp.x, hp.y);
    this.head.rotation = headRot;
    this.head.scale.set(this.hq.x, this.hq.y);
    const hvy = (hp.y - this.prev.hy) / dt;
    const hay = clamp((hvy - this.prev.hvy) / dt, -20000, 20000);
    const dRot = headRot - this.prev.hr;
    this.prev.hy = hp.y;
    this.prev.hvy = hvy;
    this.prev.hr = headRot;
    if (!low) {
      spr.capY.v += -hay * dt * 0.05;
      spr.capR.v += -dRot * 9;
      spr.tache.v += hay * dt * 0.02;
    }
    const capY = low ? 0 : spr.capY.step(0, dt);
    const capR = low ? 0 : spr.capR.step(0, dt);
    const tacheK = low ? 0 : spr.tache.step(0, dt);
    const cap = this.part.get('cap')!;
    cap.position.set(cap.base.x, cap.base.y + clamp(capY, -44, 10) - P.capLift);
    cap.rotation = P.capTilt + clamp(capR, -0.3, 0.3);
    cap.visible = P.doff < 0.5;
    this.faceFrame(lookX, lookY, shake, tacheK);

    // legs: two boots, the jig lifts them in turn; rocking on his heels tips the boots up
    let liftL = 0;
    let liftR = 0;
    if (dance > 0 && !red) {
      liftL += Math.max(0, Math.sin(t * 7)) * 26 * dance;
      liftR += Math.max(0, -Math.sin(t * 7)) * 26 * dance;
    }
    const spread = P.crouch * 8;
    // up on the toes: each boot turns about its toe, the heel lifting
    const heel = P.rock * 0.16;
    const toeUp = TOE * Math.sin(heel);
    this.bootL.position.set(-46 - spread, -liftL - toeUp);
    this.bootL.rotation = liftL * 0.004 + heel;
    this.bootR.position.set(46 + spread, -liftR - toeUp);
    this.bootR.rotation = -liftR * 0.004 - heel;
    const hipL = U(-36, 0);
    const hipR = U(36, 0);
    const legBend = 8 + (1 - beat) * 12 + P.crouch * 22;
    const ankle = (b: Sprite, s: number) => ({ x: b.x - s * 2 + (s * Math.sin(b.rotation) * 60), y: b.y - 60 * Math.cos(b.rotation) });
    this.legL.arc(hipL, ankle(this.bootL, -1), -legBend * 0.6);
    this.legR.arc(hipR, ankle(this.bootR, 1), legBend * 0.6);

    // arms: shoulders, hand targets (turned with the lean), hose sleeves, gloves turned to the sleeve
    const shL = U(-SH_X, neckY + SH_Y);
    const shR = U(SH_X, neckY + SH_Y);
    const swing = Math.sin(Math.PI * 2 * phase) * (red ? 0.3 : 1);
    const danceArm = dance > 0 && !red ? Math.sin(t * 7) * 18 * dance : 0;
    let hl = U(-SH_X + P.lx + danceArm, neckY + SH_Y + P.ly - bob * 0.06 + swing * 2);
    let hr = U(SH_X + P.rx - swing * 3 - danceArm, neckY + SH_Y + P.ry - bob * 0.12);
    // the whistle: hangs on its cord on his chest; carried to the lips by the free hand
    const hRot = (v: Vec) => this.rot({ x: v.x * this.hq.x, y: v.y * this.hq.y }, headRot);
    const mo = hRot({ x: 0, y: (CON_MOUTH[1] - CON_HEAD_PIVOT[1]) * HS });
    const lips = { x: hp.x + mo.x, y: hp.y + mo.y };
    const blow = P.blow;
    const restW = U(-34 + sway * 0.1, neckY + 62 + breath);
    const ringOff = { x: (WHISTLE.ring[0] - WHISTLE.lip[0]) * WS, y: (WHISTLE.ring[1] - 8 - WHISTLE.lip[1]) * WS };
    // at rest the whistle hangs from its ring; on the way to his lips it turns over in his hand
    // (scale.x runs 1 -> -1) so at the lips the barrel sticks out on his right, toward the free hand
    const rRest = lean + 1.15 + Math.sin(t * 1.7) * 0.04;
    const rBlow = headRot - 0.22;
    const wr = rRest + (rBlow - rRest) * blow;
    const fl = Math.cos(Math.PI * clamp(blow, 0, 1));
    const lipRest = (() => {
      const o = this.rot(ringOff, rRest);
      return { x: restW.x - o.x, y: restW.y - o.y };
    })();
    const lip = { x: lipRest.x + (lips.x - lipRest.x) * blow, y: lipRest.y + (lips.y - lipRest.y) * blow };
    const ws = this.whistleS;
    ws.position.set(lip.x, lip.y);
    ws.rotation = wr;
    ws.scale.set(this.whistleBase * (Math.abs(fl) < 0.12 ? Math.sign(fl || 1) * 0.12 : fl), this.whistleBase);
    if (blow > 0.001) {
      // the free hand grips the barrel
      const barrel = this.rot({ x: (84 - WHISTLE.lip[0]) * WS * fl, y: (72 - WHISTLE.lip[1]) * WS }, wr);
      const grip = { x: ws.x + barrel.x, y: ws.y + barrel.y + 4 };
      const want = { x: grip.x - FIST.x + 10, y: grip.y - FIST.y };
      const k = clamp(blow * 1.6, 0, 1);
      hl = { x: hl.x + (want.x - hl.x) * k, y: hl.y + (want.y - hl.y) * k };
    }
    // planting the lantern: the lantern hand carries it down to the platform
    if (P.plant > 0) {
      const to = { x: PLANT.x - this.lastFistR.x, y: PLANT.y - this.lastFistR.y };
      hr = { x: hr.x + (to.x - hr.x) * P.plant, y: hr.y + (to.y - hr.y) * P.plant };
    }
    const prayP = U(0, neckY + 100);
    if (prayK > 0) {
      const pl = { x: prayP.x - 22, y: prayP.y + 30 };
      const pr = { x: prayP.x + 22, y: prayP.y + 30 };
      hl = { x: hl.x + (pl.x - hl.x) * prayK, y: hl.y + (pl.y - hl.y) * prayK };
      hr = { x: hr.x + (pr.x - hr.x) * prayK, y: hr.y + (pr.y - hr.y) * prayK };
    }
    const tanL = this.armL.bend(shL, hl, ARM, { x: -0.8, y: 0.6 });
    const tanR = this.armR.bend(shR, hr, ARM, { x: 0.8, y: 0.7 });
    const blowW = blow > 0.001 ? -0.9 * clamp(blow * 1.6, 0, 1) : 0;
    const rotL = Math.atan2(tanL.y, tanL.x) + Math.PI / 2 - (P.lw + blowW) * (1 - prayK) + 0.35 * prayK;
    const rotR = Math.atan2(tanR.y, tanR.x) + Math.PI / 2 + P.rw * (1 - prayK) - 0.35 * prayK;
    this.handL.position.set(hl.x, hl.y);
    this.handL.rotation = rotL;
    this.handR.position.set(hr.x, hr.y);
    this.handR.rotation = rotR;
    const praySprite = prayK > 0.82;
    const handsA = praySprite ? Math.max(0, 1 - (prayK - 0.82) / 0.12) : 1;
    this.handL.alpha = this.handR.alpha = handsA;
    this.prayS.visible = praySprite;
    if (praySprite) {
      this.prayS.alpha = 1 - handsA;
      this.prayS.position.set(prayP.x, prayP.y + 26);
      this.prayS.rotation = lean + tremble * 0.01;
    }
    // the cord from his collar to the whistle's ring
    const ringP = (() => {
      const o = this.rot({ x: ringOff.x * fl, y: ringOff.y }, ws.rotation);
      return { x: ws.x + o.x, y: ws.y + o.y };
    })();
    this.cord.bend(U(-14, neckY + 34), ringP, 76, { x: -0.4, y: 1 });
    // the doffed cap rides in the free hand
    this.capHand.visible = P.doff >= 0.5;
    if (this.capHand.visible) {
      const f = this.rot(FIST, rotL);
      this.capHand.position.set(hl.x + f.x, hl.y + f.y + 6);
      this.capHand.rotation = rotL * 0.6 - 0.2;
    }

    // the lantern hangs from the fist and swings like a pendulum; set down, it stands upright
    const fist = this.rot(FIST, rotR);
    this.lastFistR = fist;
    const planted = prayK > 0.001 && P.plant > 0.999;
    let gx = hr.x + fist.x;
    let gy = hr.y + fist.y;
    if (planted) {
      gx = PLANT.x;
      gy = PLANT.y;
    }
    const pd = this.pend;
    if (!pd.init) {
      pd.px = gx;
      pd.py = gy;
      pd.init = true;
    }
    const vx = (gx - pd.px) / dt;
    const vy = (gy - pd.py) / dt;
    const ax = clamp((vx - pd.vx) / dt, -40000, 40000);
    const ay = clamp((vy - pd.vy) / dt, -40000, 40000);
    pd.px = gx;
    pd.py = gy;
    pd.vx = vx;
    pd.vy = vy;
    if (planted || low) {
      pd.a += (0 - pd.a) * Math.min(1, dt * 14);
      pd.v = 0;
    } else {
      const G = 1100;
      const steps = 4;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        // the lantern's foot sits at rot((0, L), a) = (-L sin a, L cos a) from the grip; in the grip's
        // frame gravity is (−ax, G − ay), so a'' = (ax cos a − (G − ay) sin a) / L, damped
        const acc = (ax * Math.cos(pd.a) - (G - ay) * Math.sin(pd.a)) / PEND - 2.8 * pd.v;
        pd.v += acc * h;
        pd.a += pd.v * h;
      }
    }
    if (!planted && P.plant > 0.001) {
      // being set down: the hand steadies it upright as it nears the platform
      const k = clamp(P.plant * 1.4, 0, 1);
      pd.a *= 1 - k * Math.min(1, dt * 20);
      pd.v *= 1 - k;
    }
    if (!planted) {
      pd.a = clamp(pd.a, -1.1, 1.1);
      // keep the swing inside the motion envelope (layout.ts CAPTAIN_EXTENT) and off the floor: the
      // lantern knocks against the limit and swings back
      // (a grip already past the limit just keeps the lantern tipped a little inward)
      const lim = (room: number) => Math.asin(clamp(room / LAN_REACH, -0.25, 1));
      // foot x = gx − L sin a: the right limit bounds a from below, the left one from above
      const loA = -lim(LAN_X - LAN_HALF - gx);
      let hiA = lim(LAN_X - LAN_HALF + gx);
      // raised above his chin, the lantern may not swing in across his face: its globe stays
      // clear of the head (centre x 0, ~FACE_R wide)
      const raised = clamp((-gy - (-HIP_Y + TORSO_LEN - 30)) / 50, 0, 1);
      if (raised > 0) {
        const guard = Math.asin(clamp((gx - LAN_HALF - FACE_R) / (0.65 * LAN_REACH), -0.3, 1));
        hiA = Math.min(hiA, guard + (1 - raised) * 1.2);
      }
      hiA = Math.max(loA, hiA);
      if (pd.a > hiA) {
        pd.a = hiA;
        if (pd.v > 0) pd.v *= -0.35;
      } else if (pd.a < loA) {
        pd.a = loA;
        if (pd.v < 0) pd.v *= -0.35;
      }
      // the fount's lower corner: L cos a + half-width |sin a| must stay above the platform; a
      // lantern held too low tips outward as it touches down
      const low2 = (a: number) => gy + LAN_REACH * Math.cos(a) + LAN_HALF * Math.abs(Math.sin(a));
      if (P.plant < 0.01 && low2(pd.a) > -FLOOR_CLEAR) {
        const s0 = pd.a >= 0 ? 1 : -1;
        let a = Math.abs(pd.a);
        for (let i = 0; i < 24 && low2(s0 * a) > -FLOOR_CLEAR; i++) a += 0.05;
        pd.a = s0 * Math.min(a, 1.4);
        pd.v *= 0.2;
      }
    }
    // a lantern in the hand tips a little with the wrist (the bail is stiff), the rest is the swing
    const la = planted ? 0 : pd.a + (P.plant > 0 ? 0 : clamp(P.rw * 0.15, -0.1, 0.1));
    for (const s of [this.lanGlass, this.lanHot, this.lanBody]) {
      s.position.set(gx, gy);
      s.rotation = la;
    }
    const gc = this.rot({ x: 0, y: (LANTERN.glass[1] - LANTERN.grip[1]) * LS }, la);
    const gp = { x: gx + gc.x, y: gy + gc.y };
    const G = this.glow;
    if (t > this.nextIdle.flicker) {
      this.nextIdle.flicker = t + 1.5 + Math.random() * 3;
      if (!low) gsap.timeline().to(G, { flick: 1, duration: 0.05 }).to(G, { flick: 0, duration: 0.25, ease: 'power2.in' });
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
    const noise = low ? 0 : Math.sin(t * 13) * 0.04 + Math.sin(t * 23.7) * 0.03;
    const bright = clamp(0.35 + G.k * (0.35 + 0.25 * pulse) + G.flash * 0.5 + G.flick * 0.25 + noise, 0, 1.4);
    this.lanHot.alpha = clamp(G.k * (0.25 + 0.35 * pulse) + G.flash * 0.6 + G.flick * 0.2, 0, 1);
    this.lanGlow.position.set(gp.x, gp.y);
    this.lanGlow.alpha = clamp(0.45 * bright, 0, 0.75);
    this.lanGlow.width = this.lanGlow.height = 80 + 40 * G.k + 30 * G.flash;
    this.lanHalo.position.set(gp.x, gp.y);
    this.lanHalo.alpha = clamp(0.12 + 0.3 * G.k * (0.7 + 0.3 * pulse) + 0.25 * G.flash, 0, 0.6);
    this.lanHalo.width = this.lanHalo.height = 170 + 120 * G.k + 60 * G.flash;
  }

  /** Pose the face parts from the blended face state. */
  private faceFrame(lookX: number, lookY: number, shake: number, tacheK: number) {
    const F = this.F;
    const get = (k: string) => this.part.get(k)!;
    const open = 1 - F.laugh;
    const shut = Math.min(1, F.lid + F.blink * (1 - F.lid));
    const ey = (CON_EYES.y - CON_HEAD_PIVOT[1]) * HS;
    const ox = CON_EYES.pupil[0] * (1 - Math.abs(lookX)) + lookX * (lookX > 0 ? 6.5 : 7);
    const oy = CON_EYES.pupil[1] * (1 - Math.abs(lookY)) + lookY * (lookY > 0 ? 6 : 8);
    for (const side of ['L', 'R'] as const) {
      const white = get(`eyeWhite${side}`);
      const ring = get(`eyeRing${side}`);
      const pupil = get(`pupil${side}`);
      const lid = get(`lid${side}`);
      const ll = get(`lidLaugh${side}`);
      white.scale.set(white.k0 * F.eye);
      ring.scale.set(ring.k0 * F.eye);
      white.alpha = ring.alpha = open;
      const ex = ((side === 'L' ? CON_EYES.L : CON_EYES.R) - CON_HEAD_PIVOT[0]) * HS;
      pupil.position.set(ex + ox * HS * F.eye, ey + oy * HS * F.eye);
      pupil.scale.set(pupil.k0 * F.pupil);
      pupil.alpha = open;
      lid.scale.set(lid.k0 * F.eye, lid.k0 * Math.max(0.001, shut) * F.eye);
      lid.position.set(lid.base.x, ey + (lid.base.y - ey) * F.eye);
      lid.alpha = shut > 0.02 ? open : 0;
      ll.alpha = F.laugh;
      for (const s of [white, ring, pupil, lid, ll]) s.visible = s.alpha > 0.01;
    }
    // bushy brows: lift, tilt (the inner ends), arch
    const bL = get('browL');
    const bR = get('browR');
    bL.position.set(bL.base.x, bL.base.y + F.by * HS - F.blink * 2);
    bR.position.set(bR.base.x, bR.base.y + F.by * HS - F.blink * 2);
    bL.rotation = F.br;
    bR.rotation = -F.br;
    bL.scale.set(bL.k0, bL.k0 * F.bs);
    bR.scale.set(bR.k0, bR.k0 * F.bs);
    const tache = get('moustache');
    tache.position.set(tache.base.x, tache.base.y + F.tache * HS + clamp(tacheK, -0.6, 0.6) * 4);
    tache.rotation = 0;
    tache.scale.set(tache.k0 * (1 + F.puff * 0.06), tache.k0 * (1 + clamp(-tacheK, -0.6, 0.6) * 0.08 + (shake ? Math.sin(this.t * 16) * 0.04 : 0)));
    const ch = get('cheeks');
    const puff = F.puff;
    ch.visible = puff > 0.02;
    ch.alpha = clamp(puff * 2, 0, 1);
    ch.scale.set(ch.k0 * (0.7 + 0.3 * puff), ch.k0 * (0.75 + 0.25 * puff));
    const mo = this.mouth;
    mo.scale.set(mo.k0 * this.mq.x, mo.k0 * this.mq.y * (shake ? 1 + Math.sin(this.t * 16) * 0.12 : 1));
    mo.position.set(mo.base.x, mo.base.y + (shake ? Math.sin(this.t * 16) * 2 : 0));
  }

  private rot(p: Vec, r: number): Vec {
    const c = Math.cos(r);
    const s = Math.sin(r);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.holdTimer?.kill();
    this.poseTween?.kill();
    this.dispatchTl?.kill();
    this.beat?.kill();
    this.followTl?.kill();
    gsap.killTweensOf([this.P, this.F, this.glance, this.glow, this.mq, this.hq, this.handL.scale, this.handR.scale]);
    super.destroy(options);
  }
}
