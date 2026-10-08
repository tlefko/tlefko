import { CanvasSource, Container, MeshRope, Point, Sprite, Texture, type RopeGeometry } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { captainRigPart, HEAD_PIVOT, CAP_EYE, type CapMouth, type CapPart, type CaptainExpr } from '../../art/captain';
import { captainTorso, pirateBoot, linstock, LINSTOCK_GRIP, LINSTOCK_TIP, captainCoatTail, COAT_TAIL_HINGE, captainBomb, CAP_BOMB, chargePip, bombLamps, bombBand, BOMB_LAMP, pegPart, PEG, PEG_BOX, PEG_PIVOT, hoseSection, cropTo, BOOT_BOX, COAT_TAIL_BOX } from '../../art/crew';
import { C as PAL } from '../../art/kit';
import { glove, prayingHands, flame, type HandPose } from '../../art/characters';
import { spark } from '../../art/fx';
import { T } from '../timing';
import { motion } from './motion';
import { sound } from '../../game/sound';
import { cast } from './cast';
import type { Particles } from '../fx/Particles';

export type CaptainState = 'idle' | 'cheer' | 'pray' | 'dance' | 'shock' | 'laugh' | 'duck' | 'watch';
type State = CaptainState;
/** Rig faces: the head's own expressions plus the rig-only grit, wince and ooh. */
type Face = 'idle' | 'laugh' | 'pray' | 'shock' | 'smug' | 'grit' | 'wince' | 'ooh';
type Vec = { x: number; y: number };
/** Where the bomb leaves his hand: global point, velocity (px/s) and on-screen diameter. */
export interface ThrowRelease {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}


/** Design units: the rig is ~520 tall, origin at his feet (layout.ts sizes it by CAP_L/CAP_R/CAP_H). */
const HS = 300 / 256; // head parts: units per 256-box unit
const GS = 96 / 256; // gloves
const HIP_Y = -112;
const TORSO_LEN = 150; // hip centre to neck
const SH_X = 62;
const SH_Y = 40;
const ARM = 124; // rubber-hose arm length at rest
const BOMB_R = 39; // hand bomb radius
const BOMB_BOX = (2 * BOMB_R * 256) / (2 * CAP_BOMB.r);
/** Charge lamp size (units): the lamps sit in the bomb's brass band. */
const PIP = (BOMB_LAMP * BOMB_BOX) / 256;
/** Frock-coat tail length (units); its tips' reach below the hinge and half-spread across it. */
const TAIL = 124;
const TAIL_REACH = (TAIL * (243 - COAT_TAIL_HINGE[1])) / 256;
const TAIL_SPREAD = (TAIL * 25) / 256;
/** Nothing may reach lower than this (units above the deck line at y = 0). */
const DECK_CLEAR = 3;
/** Fist centre and cupped palm, measured from the wrist in glove space. */
const FIST = { x: 4 * GS, y: -70 * GS };
const PALM = { x: 0, y: -80 * GS };
/** Where the linstock's grip stands when he plants it in the deck to pray. */
const PLANT = { x: 104, y: -72 };

interface FaceDef {
  lid: number;
  laugh: number;
  eye: number;
  pupil: number;
  look: [number, number];
  /** Brows: [lift (box units, negative = up), rotation, arch scale (negative flips the arch)]. */
  bR: [number, number, number];
  bL: [number, number, number];
  mouth: CapMouth;
  tache: number;
}
const FACES: Record<Face, FaceDef> = {
  idle: { lid: 0, laugh: 0, eye: 1, pupil: 1, look: [0, 0], bR: [0, 0, 1], bL: [0, 0, 1], mouth: 'grin', tache: 0 },
  laugh: { lid: 0, laugh: 1, eye: 1, pupil: 1, look: [0, 0], bR: [-7, -0.05, 1.1], bL: [-7, 0.05, 1.1], mouth: 'laugh', tache: -5 },
  pray: { lid: 0, laugh: 0, eye: 1, pupil: 0.95, look: [-0.2, -0.85], bR: [-3, 0.16, -0.85], bL: [-1, -0.16, 0.85], mouth: 'pray', tache: 1 },
  shock: { lid: 0, laugh: 0, eye: 1.13, pupil: 0.62, look: [0, -0.1], bR: [-10, 0.05, -0.7], bL: [-10, -0.06, 0.7], mouth: 'shock', tache: -3 },
  smug: { lid: 0.42, laugh: 0, eye: 1, pupil: 0.95, look: [0.15, 0.3], bR: [3, -0.2, 0.45], bL: [0, 0, 1], mouth: 'smug', tache: 1 },
  grit: { lid: 0.24, laugh: 0, eye: 1, pupil: 0.9, look: [0.85, -0.25], bR: [4, -0.3, 1], bL: [4, 0.3, 1], mouth: 'grit', tache: 2 },
  wince: { lid: 0, laugh: 1, eye: 1, pupil: 1, look: [0, 0], bR: [5, -0.32, 1], bL: [5, 0.32, 1], mouth: 'grit', tache: 3 },
  ooh: { lid: 0, laugh: 0, eye: 1.06, pupil: 0.85, look: [0.9, -0.3], bR: [-6, 0, 0.85], bL: [-6, 0, 0.85], mouth: 'ooh', tache: 0 },
};
const EXPR_FACE: Record<CaptainExpr, Face> = { idle: 'idle', blink: 'idle', laugh: 'laugh', pray: 'pray', shock: 'shock', smug: 'smug' };
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
  stick: number;
  plant: number;
  pray: number;
  hatLift: number;
  hatTilt: number;
  bomb: number;
  kick: number;
  tap: number;
  shake: number;
}
const REST: Pose = { crouch: 0, lift: 0, lean: 0, bounce: 1, tilt: 0, dip: 0, lx: -46, ly: 84, lw: 1.45, rx: 58, ry: 50, rw: 0, stick: 0.12, plant: 0, pray: 0, hatLift: 0, hatTilt: 0, bomb: 0, kick: 0, tap: 0, shake: 0 };
/**
 * The bomb held up at his side, palm cupped under it: beside his ear, clear of the face and beard,
 * and inside the rig's measured extent (layout.ts CAP_L = 182 units).
 */
const HOLD = { lx: -70, ly: 12, lw: -0.35 };
const HIP = { lx: REST.lx, ly: REST.ly, lw: REST.lw };

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


/** A limb cross-section texture: `w` units wide (plus a feathered pixel each side), painted at `dp` device px per unit. */
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
  // feather the two long edges so the mesh's geometric edge never shows a hard stair
  g.clearRect(0, 0, 4, pad);
  g.clearRect(0, hpx - pad, 4, pad);
  return new Texture({ source: new CanvasSource({ resource: c, resolution: hpx / (w + (pad * 2) / dp) }) });
}

/**
 * One rubber-hose limb: a rope mesh with a fixed number of points along a quadratic curve and a
 * cel cross-section texture (the limb's ink edges, fill, lit stripe and shadow band), plus an
 * optional round cap at the root. Moving it only rewrites the vertex positions: no tessellation.
 */
class Hose extends Container {
  private pts: Point[];
  private rope?: MeshRope;
  private cap?: Sprite;
  constructor(private n: number) {
    super();
    this.pts = Array.from({ length: n }, (_, i) => new Point(i, 0));
  }
  /** Give it its cross-section (`w` units wide) and, with `capColor`, a round cap at the root. */
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
  /** Lay the rope along a quadratic from `a` through control `c` to `b`; returns the end tangent. */
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

/** A white disc with an ink ring (tinted to the sleeve colour): the round end of a sleeve. */
let capTex: Texture | null = null;
function capTexture(): Texture {
  if (capTex) return capTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1311';
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
 * Cap'n Kaboom, rubber-hose rig. Every frame is laid out from a tweened pose plus procedural
 * layers (beat bounce, breath, jig, belly-laugh shakes) and springs for the secondary motion
 * (hat, beard, coat tails). Arms are hoses of constant length, so elbows bend by themselves, and
 * each glove turns to continue its sleeve, so hands always meet their arms. The head is built from
 * parts so faces blend: brows glide, the lid closes, the pupil glances, mouths squash through a
 * change instead of swapping.
 *
 * Contract (docs/POLISH.md): setCharge() shows the charge as a bomb in his free hand, a pip per
 * point and a fuse spark that grows with each one; throwBomb() winds up and throws overhand,
 * resolving at the release with the global point the bomb leaves his hand.
 */
export class Captain extends Container {
  private rig = new Container();
  private tails = [new Sprite(), new Sprite()];
  /** Legs: two hose ropes, then the peg's shaft, foot cap and knee cuff. */
  private legs = new Container();
  private legL: Hose;
  private legR: Hose;
  private pegShaft = new Sprite();
  private pegFoot = new Sprite();
  private pegCuff = new Sprite();
  private boot = new Sprite();
  private torso = new Sprite();
  private armR: Hose;
  private prop = new Sprite();
  private handR = new Sprite();
  private fire = new Sprite();
  private head = new Container();
  private part = new Map<string, PartSprite>();
  private mouthTex = new Map<CapMouth, Texture>();
  private mouthBox = new Map<CapMouth, [number, number, number, number]>();
  private mouth = new Sprite() as PartSprite;
  /** The free (throwing) arm, drawn in front of the head: sleeve, bomb, fuse spark, glove, charge lamps. */
  private groupL = new Container();
  private armL: Hose;
  private bombS = new Sprite();
  private bombHot = new Sprite();
  /** The brass charge band round the bomb, sockets for 2 or 3 lamps. */
  private bandS = new Sprite();
  private bandTex = new Map<number, Texture>();
  private sparkS = new Sprite();
  private sparkGlow = new Sprite(softDotTexture());
  private handL = new Sprite();
  private pipLayer = new Container();
  private pips: { s: Sprite; glow: Sprite; lit: boolean }[] = [];
  private pipTex: Texture[] = [];
  private prayS = new Sprite();
  private gloves = new Map<HandPose, Texture>();

  private P: Pose = { ...REST };
  private F = { lid: 0, laugh: 0, eye: 1, pupil: 1, lookX: 0, lookY: 0, bRy: 0, bRr: 0, bRs: 1, bLy: 0, bLr: 0, bLs: 1, tache: 0, blink: 0 };
  private t = 0;
  private unit = 1;
  private built = false;
  private state: State = 'idle';
  private face: Face = 'idle';
  private glance = { x: 0, y: 0 };
  private lookOverride: Vec | null = null;
  /** The last global point he was told to look at (the throw's target cell). */
  private lookTarget: Vec | null = null;
  private followTl?: gsap.core.Tween;
  private poseL: HandPose = 'fist';
  private poseR: HandPose = 'fist';
  private holdTimer?: gsap.core.Tween;
  private poseTween?: gsap.core.Timeline;
  private throwTl?: gsap.core.Timeline;
  private throwing = false;
  private pendingState: { s: State; hold: number } | null = null;
  private busy = 0;
  /** The idle beat playing (peg tap, hat adjust, toss): a reaction cancels it. */
  private beat?: gsap.core.Timeline;
  private nextIdle = { blink: 2, glance: 3.5, tap: 7, hat: 12, toss: 5, flare: 4 };
  private springs = { hatY: new Spring(260, 16), hatR: new Spring(200, 14), beard: new Spring(170, 11), tailL: new Spring(110, 7), tailR: new Spring(110, 7) };
  private prev = { hy: 0, hvy: 0, hr: 0, hipX: 0, hipY: 0 };
  private bombPos = { cur: { x: 0, y: 0 }, last: { x: 0, y: 0 }, dt: 1 / 60 };
  private lastFist: Vec = { x: FIST.x, y: FIST.y };
  private tossY = { y: 0 };
  /** Delay before the charge lamps chime: the bomb is still coming out of his belt. */
  private pipLead = 0;
  private flare = { k: 0 };
  /** The bomb's wanted visibility (drawn or stowed) and the tween taking it there. */
  private bombWanted = false;
  private bombTl?: gsap.core.Timeline;
  private emberAcc = 0;
  private fireBase = 1;
  /** Charge shown in his hand (see setCharge). */
  charge = 0;
  chargeMax = 3;
  fx?: Particles;
  getBeat: () => { phase: number; bpm: number } = () => ({ phase: (this.t * 1.5) % 1, bpm: 90 });

  constructor() {
    super();
    this.eventMode = 'none';
    cast.captain ??= this;
    this.torso.anchor.set(0.5, 0.14);
    // the boot stands on its painted sole (ink included), the deck line at y = 0; the ankle is x 128
    this.boot.anchor.set((128 - BOOT_BOX[0]) / BOOT_BOX[2], (211 - BOOT_BOX[1]) / BOOT_BOX[3]);
    this.handL.anchor.set(0.5, 0.86);
    this.handR.anchor.set(0.5, 0.86);
    this.prayS.anchor.set(0.5, 0.85);
    this.prop.anchor.set(0.5, LINSTOCK_GRIP / 256);
    this.fire.anchor.set(0.5, 0.92);
    for (const s of this.tails) s.anchor.set((COAT_TAIL_HINGE[0] - COAT_TAIL_BOX[0]) / COAT_TAIL_BOX[2], (COAT_TAIL_HINGE[1] - COAT_TAIL_BOX[1]) / COAT_TAIL_BOX[3]);
    for (const s of [this.bombS, this.bombHot, this.bandS]) s.anchor.set(CAP_BOMB.cx / 256, CAP_BOMB.cy / 256);
    this.sparkS.anchor.set(0.5);
    this.sparkS.blendMode = 'add';
    this.sparkGlow.anchor.set(0.5);
    this.sparkGlow.blendMode = 'add';
    this.sparkGlow.tint = 0xffa53a;
    this.prayS.visible = false;
    this.bombS.visible = this.bombHot.visible = this.sparkS.visible = this.sparkGlow.visible = false;
    this.armL = new Hose(14);
    this.armR = new Hose(14);
    this.legL = new Hose(12);
    this.legR = new Hose(12);
    // each peg piece pivots on its fitting (knee, knee, ground contact) in its cropped box
    for (const [sp, part] of [[this.pegShaft, 'shaft'], [this.pegFoot, 'foot'], [this.pegCuff, 'cuff']] as const) {
      const [bx, by, bw, bh] = PEG_BOX[part];
      sp.anchor.set((PEG_PIVOT[part][0] - bx) / bw, (PEG_PIVOT[part][1] - by) / bh);
    }
    this.legs.addChild(this.legL, this.legR, this.pegShaft, this.pegFoot, this.pegCuff);
    this.groupL.addChild(this.armL, this.bombS, this.bombHot, this.bandS, this.sparkGlow, this.sparkS, this.handL, this.pipLayer);
    this.rig.addChild(this.tails[0], this.tails[1], this.legs, this.boot, this.torso, this.armR, this.prop, this.handR, this.head, this.fire, this.groupL, this.prayS);
    this.addChild(this.rig);
  }

  async build(h: number, res: number) {
    const k = h / 520;
    const px = (u: number) => Math.max(8, Math.round(u * k * res));
    const parts: CapPart[] = ['face', 'beard', 'hat', 'eyeWhite', 'pupil', 'eyeRing', 'lid', 'lidLaugh', 'browL', 'browR', 'moustache'];
    const mouths: CapMouth[] = ['grin', 'laugh', 'pray', 'shock', 'smug', 'grit', 'ooh'];
    const defs = [...parts.map((p) => ({ key: p as string, def: captainRigPart(p) })), ...mouths.map((m) => ({ key: `mouth-${m}`, def: captainRigPart(`mouth-${m}`) }))];
    const poses: HandPose[] = ['open', 'fist', 'cup'];
    const [headTex, [torso, boot, stick, fl, tail, bomb, hot, sparkT, pray, pipOff, pipOn, band2, band3, pegS, pegF, pegC, ...gl]] = await Promise.all([
      Promise.all(defs.map((j) => svgTexture(`cap2-${j.key}`, j.def.svg, px(j.def.box[2] * HS), px(j.def.box[3] * HS)))),
      Promise.all([
        svgTexture('cap-torso', captainTorso(), px(236)),
        svgTexture('cap-boot', cropTo(pirateBoot(), BOOT_BOX), px((110 * BOOT_BOX[2]) / 256), px((110 * BOOT_BOX[3]) / 256)),
        svgTexture('cap-linstock', linstock(), px((210 * 72) / 256), px(210)),
        svgTexture('cap-fire', flame('fire'), px(64)),
        svgTexture('cap-tail', cropTo(captainCoatTail(), COAT_TAIL_BOX), px((TAIL * COAT_TAIL_BOX[2]) / 256), px((TAIL * COAT_TAIL_BOX[3]) / 256)),
        svgTexture('cap-bomb', captainBomb(false), px(BOMB_BOX)),
        svgTexture('cap-bomb-hot', captainBomb(true), px(BOMB_BOX)),
        svgTexture('cap-spark', spark(), px(40)),
        svgTexture('cap-pray', prayingHands(), px(130)),
        svgTexture('cap-pip0', chargePip(false), px(PIP)),
        svgTexture('cap-pip1', chargePip(true), px(PIP)),
        svgTexture('cap-band2', bombBand(2), px(BOMB_BOX)),
        svgTexture('cap-band3', bombBand(3), px(BOMB_BOX)),
        svgTexture('cap-peg-shaft', pegPart('shaft'), px(PEG_BOX.shaft[2]), px(PEG_BOX.shaft[3])),
        svgTexture('cap-peg-foot', pegPart('foot'), px(PEG_BOX.foot[2]), px(PEG_BOX.foot[3])),
        svgTexture('cap-peg-cuff', pegPart('cuff'), px(PEG_BOX.cuff[2]), px(PEG_BOX.cuff[3])),
        ...poses.map((p) => svgTexture(`glove-${p}`, glove(p), px(96))),
      ]),
    ]);
    if (this.destroyed) return;
    this.unit = k;
    this.rig.scale.set(k);
    // head parts, stacked in head-box coordinates round HEAD_PIVOT
    this.head.removeChildren();
    defs.forEach((j, i) => {
      const tex = headTex[i];
      const [bx, by, bw, bh] = j.def.box;
      if (j.key.startsWith('mouth-')) {
        const m = j.key.slice(6) as CapMouth;
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
      s.base = { x: (pvx - HEAD_PIVOT[0]) * HS, y: (pvy - HEAD_PIVOT[1]) * HS };
      s.position.set(s.base.x, s.base.y);
      this.part.set(j.key, s);
    });
    this.mouth.base = { x: 0, y: (220 - HEAD_PIVOT[1]) * HS };
    this.mouth.position.set(this.mouth.base.x, this.mouth.base.y);
    this.setMouthTex(FACES[this.face].mouth);
    for (const key of ['face', 'beard', 'hat', 'eyeWhite', 'pupil', 'eyeRing', 'lid', 'lidLaugh', 'browL', 'browR', 'mouth', 'moustache']) this.head.addChild(key === 'mouth' ? this.mouth : this.part.get(key)!);
    // body
    const size = (s: Sprite, t: Texture, u: number) => {
      s.texture = t;
      s.scale.set(u / t.width);
    };
    size(this.torso, torso, 236);
    size(this.boot, boot, (110 * BOOT_BOX[2]) / 256);
    this.boot.scale.x *= -1; // left foot: toe points outward
    this.prop.texture = stick;
    this.prop.scale.set(210 / stick.height);
    size(this.fire, fl, 64);
    this.fireBase = this.fire.scale.x;
    for (const s of this.tails) size(s, tail, (TAIL * COAT_TAIL_BOX[2]) / 256);
    this.tails[1].scale.x *= -1;
    for (const [sp, t, part] of [[this.pegShaft, pegS, 'shaft'], [this.pegFoot, pegF, 'foot'], [this.pegCuff, pegC, 'cuff']] as const) size(sp, t, PEG_BOX[part][2]);
    this.pegK = this.pegShaft.scale.x;
    // the limbs' cel cross-sections, painted at the rig's device resolution
    const dp = k * res;
    this.armL.skin(hoseTexture(30, 4 / 30, PAL.crimson, PAL.crimsonLight, PAL.crimsonDeep, dp), 30, PAL.crimson);
    this.armR.skin(hoseTexture(30, 4 / 30, PAL.crimson, PAL.crimsonLight, PAL.crimsonDeep, dp), 30, PAL.crimson);
    this.legL.skin(hoseTexture(36, 4 / 36, PAL.navy, PAL.navyLight, PAL.nightDeep, dp), 36);
    this.legR.skin(hoseTexture(36, 4 / 36, PAL.navy, PAL.navyLight, PAL.nightDeep, dp), 36);
    size(this.bombS, bomb, BOMB_BOX);
    size(this.bombHot, hot, BOMB_BOX);
    size(this.sparkS, sparkT, 40);
    size(this.prayS, pray, 130);
    this.pipTex = [pipOff, pipOn];
    this.bandTex.set(2, band2).set(3, band3);
    size(this.bandS, this.bandTex.get(this.chargeMax === 2 ? 2 : 3)!, BOMB_BOX);
    poses.forEach((p, i) => this.gloves.set(p, gl[i]));
    const pl = this.poseL;
    const pr = this.poseR;
    this.poseL = this.poseR = 'open';
    this.setGlove('L', pl, false);
    this.setGlove('R', pr, false);
    this.layoutPips();
    this.built = true;
  }

  /* ------------------------------------------------------------------ */
  /* faces                                                               */
  /* ------------------------------------------------------------------ */

  /** Show one of the head's expressions (blended, never a hard swap). */
  setExpr(e: CaptainExpr) {
    if (e === 'blink') this.blink();
    else this.setFace(EXPR_FACE[e]);
  }

  private setMouthTex(m: CapMouth) {
    const tex = this.mouthTex.get(m);
    const box = this.mouthBox.get(m);
    if (!tex || !box) return;
    this.mouth.texture = tex;
    this.mouth.anchor.set((128 - box[0]) / box[2], (220 - box[1]) / box[3]);
    this.mouth.k0 = (box[2] * HS) / tex.width;
  }

  private setFace(f: Face, dur = 0.16) {
    if (f === this.face) return;
    const from = FACES[this.face];
    const to = FACES[f];
    this.face = f;
    if (!this.built) return;
    const d = T(dur);
    gsap.killTweensOf(this.F, 'lid,laugh,eye,pupil,lookX,lookY,bRy,bRr,bRs,bLy,bLr,bLs,tache');
    gsap.to(this.F, {
      lid: to.lid,
      laugh: to.laugh,
      eye: to.eye,
      pupil: to.pupil,
      lookX: to.look[0],
      lookY: to.look[1],
      bRy: to.bR[0],
      bRr: to.bR[1],
      bRs: to.bR[2],
      bLy: to.bL[0],
      bLr: to.bL[1],
      bLs: to.bL[2],
      tache: to.tache,
      duration: d,
      ease: 'back.out(1.6)',
    });
    if (to.mouth !== from.mouth) this.swapMouth(to.mouth, d);
    // the eye pinches shut on the way into a laugh or a wince (and a big change gets a blink)
    if (to.laugh > 0.5 !== from.laugh > 0.5 || (to.eye > 1.05 && from.eye <= 1.05)) this.headPunch(to.eye > 1.05 ? 1 : -1);
  }

  /** Mouths change on a squash: the old one closes to a line, the new one pops open past full and settles. */
  private swapMouth(m: CapMouth, d: number) {
    const mo = this.mouth;
    gsap.killTweensOf(this.mq);
    const q = this.mq;
    gsap
      .timeline()
      .to(q, { y: 0.25, x: 1.08, duration: Math.max(0.035, d * 0.35), ease: 'power2.in' })
      .call(() => {
        if (!mo.destroyed) this.setMouthTex(m);
      })
      .to(q, { y: 1, x: 1, duration: Math.max(0.1, d * 1.3), ease: 'back.out(2.6)' });
  }
  /** Mouth squash (multiplies the mouth's resting scale). */
  private mq = { x: 1, y: 1 };
  /** Head squash on a big change of face (a stretch up for a shock, a squash for a laugh). */
  private hq = { x: 1, y: 1 };
  private headPunch(dir: 1 | -1) {
    if (motion.reduced) return;
    gsap.killTweensOf(this.hq);
    gsap
      .timeline()
      .to(this.hq, { x: dir > 0 ? 0.93 : 1.07, y: dir > 0 ? 1.08 : 0.93, duration: T(0.07), ease: 'power2.out' })
      .to(this.hq, { x: 1, y: 1, duration: T(0.35), ease: 'elastic.out(1, .45)' });
  }

  /** A blink: the lid drops, holds shut for two frames and lifts. */
  private blink() {
    if (this.F.laugh > 0.5 || !this.built) return;
    gsap.killTweensOf(this.F, 'blink');
    gsap.timeline().to(this.F, { blink: 1, duration: 0.055, ease: 'power2.in' }).to(this.F, { blink: 1, duration: 0.04 }).to(this.F, { blink: 0, duration: 0.09, ease: 'power2.out' });
  }

  /**
   * Look toward a global point (the bomb in flight, a cell on the board); `null` hands the gaze
   * back to the face. Works for a flipped rig.
   */
  lookAt(gx: number | null, gy = 0) {
    if (gx === null || this.destroyed) {
      this.lookOverride = null;
      this.lookTarget = null;
      return;
    }
    this.lookTarget = { x: gx, y: gy };
    const lp = this.toLocal({ x: gx, y: gy });
    const k = this.unit;
    const vx = lp.x - 37 * k;
    const vy = lp.y + 318 * k;
    const len = Math.hypot(vx, vy) || 1;
    this.lookOverride = { x: vx / len, y: (vy / len) * 0.85 };
  }

  /**
   * Track something flying from one global point to another (the bomb), along an arc like its
   * flight, then keep looking at where it landed.
   */
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
        this.lookAtPoint(u * u * x0 + 2 * u * p.t * cx + p.t * p.t * x1, u * u * y0 + 2 * u * p.t * cy + p.t * p.t * y1);
      },
    });
  }

  /** Point the gaze without changing the remembered target. */
  private lookAtPoint(gx: number, gy: number) {
    const t = this.lookTarget;
    this.lookAt(gx, gy);
    this.lookTarget = t;
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
    if (this.throwing) {
      // a throw owns the body until the release; the latest request plays out afterwards
      this.pendingState = { s: state, hold };
      return;
    }
    this.setFace(STATE_FACE[state]);
    this.stopBeat();
    const P = this.P;
    const held = this.bombWanted;
    const d = T(state === 'idle' ? 0.34 : 0.22);
    const ease = state === 'idle' ? 'power2.inOut' : 'back.out(1.5)';
    let pose: Partial<Pose> = { lean: 0, bounce: 1, tilt: 0, dip: 0, kick: 0, shake: 0, hatTilt: 0, hatLift: 0 };
    let gL: HandPose = held ? 'cup' : 'fist';
    let crouch = 0;
    switch (state) {
      case 'idle':
        pose = { ...pose, ...(held ? HOLD : HIP), rx: REST.rx, ry: REST.ry, rw: 0, stick: REST.stick };
        break;
      case 'cheer':
        pose = { ...pose, bounce: 1.3, lx: -64, ly: -118, lw: held ? -0.3 : 0.2, rx: 42, ry: -112, rw: 0, stick: 0.18, tilt: -0.05 };
        gL = held ? 'cup' : 'open';
        this.hop(46);
        this.hatPop(18);
        break;
      case 'laugh':
        pose = { ...pose, lean: -0.08, tilt: -0.12, ...(held ? HOLD : { lx: 54, ly: 104, lw: -1.4 }), rx: REST.rx, ry: REST.ry, stick: 0.2, shake: 1 };
        gL = held ? 'cup' : 'open';
        break;
      case 'dance':
        pose = { ...pose, bounce: 1.9, lx: -58, ly: -40, lw: held ? -0.3 : 0.2, rx: 50, ry: -30, stick: 0.3, kick: 1 };
        gL = held ? 'cup' : 'open';
        break;
      case 'shock':
        pose = { ...pose, lean: -0.1, tilt: -0.06, lx: -70, ly: -54, lw: held ? -0.3 : 0.4, rx: 64, ry: -20, stick: -0.1 };
        gL = held ? 'cup' : 'open';
        crouch = 0.28;
        this.hatPop(22);
        break;
      case 'duck':
        pose = { ...pose, lean: -0.04, dip: 26, tilt: 0.1, lx: 18, ly: -98, lw: held ? -0.2 : 0.9, rx: -18, ry: -80, rw: -0.4, stick: -0.35, hatLift: -6 };
        gL = held ? 'cup' : 'open';
        crouch = 1;
        break;
      case 'watch':
        pose = { ...pose, lean: 0.07, tilt: 0.05, ...(held ? HOLD : HIP), rx: 78, ry: -22, rw: 0.2, stick: 0.95 };
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
      // plant the linstock in the deck, then press the hands together (or clutch the bomb)
      tl.to(P, { plant: 1, duration: T(0.18), ease: 'power2.inOut' }, 0).to(P, { pray: 1, duration: T(0.22), ease: 'back.out(1.4)' }, T(0.16));
      tl.to(P, { ...pose, duration: d, ease }, 0);
      this.setGlove('L', held ? 'cup' : 'open');
      this.setGlove('R', 'open', true, T(0.17));
    } else {
      if (prev === 'pray' || P.pray > 0.01 || P.plant > 0.01) {
        // let go of the prayer, then pick the linstock back up
        tl.to(P, { pray: 0, duration: T(0.16), ease: 'power2.in' }, 0).to(P, { plant: 0, duration: T(0.18), ease: 'power2.inOut' }, T(0.15));
        tl.to(P, { ...pose, duration: d, ease }, T(0.15));
        this.setGlove('R', 'fist', true, T(0.15));
      } else {
        tl.to(P, { ...pose, duration: d, ease }, 0);
        this.setGlove('R', 'fist');
      }
      this.setGlove('L', gL);
    }
    if (hold > 0) this.holdTimer = gsap.delayedCall(hold, () => this.state === state && this.react('idle'));
  }

  /** A one-off accent that keeps the current state: a whoop (jump and hat toss), a nod or a flinch. */
  accent(kind: 'whoop' | 'nod' | 'flinch' = 'whoop') {
    if (!this.built || this.throwing) return;
    if (kind === 'whoop') {
      this.hop(58);
      this.hatPop(30);
      const [x, y] = this.globalOf({ x: 0, y: -470 });
      this.fx?.burst(x, y, Math.round(8 * motion.fx), 'fire', 0.7);
      this.headPunch(-1);
    } else if (kind === 'nod') {
      gsap.timeline().to(this.P, { tilt: 0.12, duration: T(0.1), ease: 'power2.out' }).to(this.P, { tilt: 0, duration: T(0.3), ease: 'back.out(2)' });
    } else {
      gsap.timeline().to(this.P, { crouch: 0.35, lean: -0.08, duration: T(0.07), ease: 'power2.out' }).to(this.P, { crouch: 0, lean: 0, duration: T(0.35), ease: 'elastic.out(1, .5)' });
      this.hatPop(14);
    }
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

  private hatPop(h: number) {
    if (motion.reduced || motion.low) h *= 0.3;
    this.springs.hatY.v -= h * 22;
    this.springs.hatR.v += (Math.random() - 0.5) * 3;
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
  /* charge + throw                                                      */
  /* ------------------------------------------------------------------ */

  /** Show the charge (0..max): a bomb in his free hand, one lit pip per point, the fuse spark growing. */
  setCharge(value: number, max: number) {
    const m = Math.max(1, Math.round(max));
    const v = clamp(Math.round(value), 0, m);
    const was = this.charge;
    const maxChanged = m !== this.chargeMax;
    this.chargeMax = m;
    this.charge = v;
    if (!this.built) return;
    if (maxChanged) this.layoutPips();
    if (this.throwing) {
      this.refreshPips(false);
      return;
    }
    if (v > 0 && !this.bombWanted) this.drawBomb();
    else if (v === 0 && this.bombWanted) this.stowBomb();
    this.refreshPips(v > was);
    if (v > was) {
      const bp = this.bombPos.cur;
      this.fx?.burst(bp.x, bp.y - BOMB_R * this.unit, Math.round((v >= m ? 14 : 6) * motion.fx), 'fire', v >= m ? 0.9 : 0.5);
      // one lamp chime per lamp that lit (charge can jump by more than one), then the full sting
      const lead = this.pipLead;
      for (let pip = was + 1; pip <= v; pip++) sound.play('capChargePip', { index: Math.min(3, Math.max(1, pip)), delay: lead + T(0.08) * (pip - was - 1) });
      if (v >= m) sound.play('capChargeFull', { delay: lead + T(0.08) * (v - was) + T(0.05) });
      this.pipLead = 0;
      if (v >= m) {
        // full: he grits his teeth, ready to throw
        this.setFace('grit');
        gsap.delayedCall(T(0.8), () => {
          if (this.state === 'idle' && !this.throwing) this.setFace('idle');
        });
      } else this.accent('nod');
    }
  }

  /** He pulls a bomb from his belt: the hand drops to the hip, the bomb swells into it, up it comes. */
  private drawBomb(fast = false) {
    const P = this.P;
    this.bombWanted = true;
    this.bombTl?.kill();
    gsap.killTweensOf(P, 'lx,ly,lw,bomb');
    this.setGlove('L', 'cup');
    const d = T(fast ? 0.5 : 1);
    const tl = gsap
      .timeline()
      .to(P, { lx: -34, ly: 96, lw: 0.9, duration: 0.12 * d, ease: 'power2.in' })
      .call(() => sound.play('capBelt'), [], 0.1 * d)
      .to(P, { bomb: 1, duration: 0.22 * d, ease: 'back.out(2.2)' }, 0.1 * d);
    // the lamps light once the bomb is in his hand
    this.pipLead = 0.3 * d;
    if (this.state !== 'pray') tl.to(P, { ...HOLD, duration: 0.28 * d, ease: 'back.out(1.6)' }, 0.18 * d);
    this.bombTl = tl;
  }

  /** Charge gone without a throw (a new base spin): the bomb goes back on his belt. */
  private stowBomb() {
    const P = this.P;
    this.bombWanted = false;
    this.bombTl?.kill();
    gsap.killTweensOf(P, 'lx,ly,lw,bomb');
    this.bombTl = gsap
      .timeline()
      .to(P, { lx: -34, ly: 96, lw: 0.9, duration: T(0.18), ease: 'power2.inOut' })
      .to(P, { bomb: 0, duration: T(0.12), ease: 'power2.in' }, T(0.1))
      .call(() => this.setGlove('L', this.state === 'idle' || this.state === 'watch' ? 'fist' : 'open'))
      .to(P, { ...HIP, duration: T(0.24), ease: 'back.out(1.4)' });
  }

  private layoutPips() {
    const bt = this.bandTex.get(this.chargeMax === 2 ? 2 : 3);
    if (bt) this.bandS.texture = bt;
    for (const p of this.pips) {
      gsap.killTweensOf([p.s.scale, p.glow]);
      p.s.destroy();
      p.glow.destroy();
    }
    this.pips = [];
    const n = this.chargeMax;
    for (let i = 0; i < n; i++) {
      const glow = new Sprite(softDotTexture());
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.tint = 0xff9a2a;
      glow.width = glow.height = PIP * 2.2;
      glow.alpha = 0;
      const s = new Sprite(this.pipTex[0] ?? Texture.EMPTY);
      s.anchor.set(0.5);
      if (this.pipTex[0]) s.scale.set(PIP / this.pipTex[0].width);
      this.pipLayer.addChild(glow, s);
      this.pips.push({ s, glow, lit: false });
    }
    this.refreshPips(false);
  }

  private refreshPips(animate: boolean) {
    this.pips.forEach((p, i) => {
      const lit = i < this.charge;
      if (lit === p.lit) return;
      p.lit = lit;
      const tex = this.pipTex[lit ? 1 : 0];
      if (!tex) return;
      p.s.texture = tex;
      const k = PIP / tex.width;
      gsap.killTweensOf([p.s.scale, p.glow]);
      if (lit && animate && !motion.reduced) {
        p.s.scale.set(k * 1.9);
        gsap.to(p.s.scale, { x: k, y: k, duration: T(0.5), ease: 'elastic.out(1, .45)' });
        gsap.fromTo(p.glow, { alpha: 1 }, { alpha: 0.7, duration: T(0.5) });
      } else {
        p.s.scale.set(k);
        p.glow.alpha = lit ? 0.7 : 0;
      }
    });
  }

  /**
   * Wind up and throw overhand. Resolves at the release with the global point the bomb leaves his
   * hand (`x`, `y`), plus its velocity there in px/s (`vx`, `vy`) and its on-screen diameter
   * (`size`), so the flight can pick up the motion. With no bomb in hand (a wheel bomb) he pulls
   * one out first.
   */
  throwBomb(): Promise<ThrowRelease> {
    if (!this.built || this.destroyed) {
      const p = this.getGlobalPosition();
      return Promise.resolve({ x: p.x, y: p.y, vx: 0, vy: 0, size: 0 });
    }
    const P = this.P;
    this.throwing = true;
    this.pendingState = null;
    this.stopBeat();
    this.holdTimer?.kill();
    this.poseTween?.kill();
    this.throwTl?.kill();
    gsap.killTweensOf(P);
    const need = !this.bombWanted || P.bomb < 0.5;
    const lead = need ? T(0.22) : 0;
    this.bombTl?.kill();
    if (need) this.drawBomb(true);
    else P.bomb = 1;
    if (P.pray > 0.01 || P.plant > 0.01) gsap.to(P, { pray: 0, plant: 0, duration: T(0.14), ease: 'power2.in' });
    this.setGlove('R', 'fist');
    this.setGlove('L', 'cup');
    this.setFace('grit', 0.1);
    const red = motion.reduced;
    const wind = T(red ? 0.14 : 0.3);
    const whip = T(red ? 0.1 : 0.14);
    let res!: (r: ThrowRelease) => void;
    const done = new Promise<ThrowRelease>((r) => (res = r));
    const tl = gsap.timeline({ delay: lead });
    tl.call(() => sound.play('capWindup'), [], 0);
    // 1) anticipation: he sinks and leans back, the bomb swings up behind his head, the linstock
    //    arm reaches forward for balance, eyes locked on the board
    tl.to(P, { lx: -30, ly: 104, lw: 0.2, crouch: red ? 0.05 : 0.18, duration: wind * 0.3, ease: 'power2.inOut' }, 0)
      .to(P, { crouch: red ? 0.1 : 0.42, lean: red ? -0.03 : -0.08, tilt: -0.1, bounce: 0.2, lx: -60, ly: -96, lw: -0.5, rx: 86, ry: -6, rw: 0.3, stick: 0.5, hatTilt: -0.1, dip: 0, kick: 0, shake: 0, duration: wind * 0.7, ease: 'power2.out' }, wind * 0.3)
      // 2) the whip: over the top and forward as the body uncoils; the bomb leaves at the top-front
      .to(P, { crouch: 0, lean: red ? 0.05 : 0.2, tilt: 0.1, lift: red ? 0 : 10, lx: 64, ly: -172, lw: 0.3, rx: 40, ry: 58, stick: 0.1, duration: whip * 0.62, ease: 'power3.in' }, wind)
      .call(() => this.release(res), [], wind + whip * 0.62)
      // 3) follow-through: the arm carries on down across his body, he tips forward and settles
      .to(P, { lx: 118, ly: 70, lw: 1.3, lean: red ? 0.04 : 0.24, lift: 0, crouch: 0.2, duration: whip * 0.9, ease: 'power3.out' }, wind + whip * 0.62)
      .to(P, { crouch: 0, lean: 0.07, bounce: 1, tilt: 0.05, rx: 78, ry: -22, rw: 0.2, stick: 0.95, ...HIP, hatTilt: 0, duration: T(0.42), ease: 'power2.inOut' }, wind + whip * 1.7);
    this.throwTl = tl;
    return done;
  }

  private release(res: (r: ThrowRelease) => void) {
    const p = this.bombPos.cur;
    const l = this.bombPos.last;
    const dt = Math.max(1 / 240, this.bombPos.dt);
    const vx = clamp((p.x - l.x) / dt, -4000, 4000);
    const vy = clamp((p.y - l.y) / dt, -4000, 4000);
    const size = 2 * BOMB_R * this.unit * Math.abs(this.scale.y || 1);
    sound.play('capThrow');
    this.P.bomb = 0;
    this.bombWanted = false;
    this.setGlove('L', 'open', false);
    this.fx?.burst(p.x, p.y, Math.round(8 * motion.fx), 'fire', 0.6);
    this.charge = 0;
    this.refreshPips(false);
    this.springs.hatY.v -= motion.reduced ? 0 : 160;
    // both of them follow the bomb along its arc to the cell he was aiming at
    const to = this.lookTarget;
    if (to) {
      const dur = T(0.55);
      this.follow(p.x, p.y, to.x, to.y, dur);
      cast.parrot?.follow(p.x, p.y, to.x, to.y, dur);
    }
    // he watches it go, then relaxes unless told otherwise
    gsap.delayedCall(T(0.24), () => {
      if (this.destroyed) return;
      this.throwing = false;
      this.setGlove('L', 'fist');
      // charge left over after the throw (it overflowed): the next bomb comes straight out
      if (this.charge > 0 && !this.bombWanted) this.drawBomb();
      const next = this.pendingState;
      this.pendingState = null;
      if (next) this.react(next.s, next.hold);
      else {
        this.state = 'watch';
        this.setFace('ooh');
        this.holdTimer = gsap.delayedCall(1.4, () => this.state === 'watch' && this.react('idle'));
      }
    });
    res({ x: p.x, y: p.y, vx, vy, size });
  }

  /* ------------------------------------------------------------------ */
  /* idle life                                                           */
  /* ------------------------------------------------------------------ */

  private idleLife() {
    const t = this.t;
    const n = this.nextIdle;
    const calm = this.state === 'idle' && !this.throwing && this.busy === 0;
    if (t > n.blink) {
      n.blink = t + 2 + Math.random() * 3.5;
      if (this.F.laugh < 0.5 && this.F.lid < 0.6) this.blink();
    }
    if (motion.low) return;
    if (t > n.glance) {
      n.glance = t + 2.6 + Math.random() * 3.2;
      if (calm || this.state === 'watch') {
        const held = this.charge > 0;
        const r = Math.random();
        const g = r < 0.35 ? { x: 1, y: -0.2 } : r < 0.6 && held ? { x: -0.9, y: -0.2 } : r < 0.8 ? { x: -0.8, y: 0.35 } : { x: 0.25, y: -0.9 };
        gsap.killTweensOf(this.glance);
        gsap
          .timeline()
          .to(this.glance, { x: g.x, y: g.y, duration: 0.09, ease: 'power2.out' })
          .to(this.glance, { x: 0, y: 0, duration: 0.14, ease: 'power2.inOut', delay: 0.7 + Math.random() * 0.9 });
        if (Math.random() < 0.4) this.blink();
      }
    }
    if (!calm) return;
    if (t > n.tap) {
      n.tap = t + 6 + Math.random() * 5;
      this.pegTap();
    } else if (t > n.hat && !this.bombWanted && this.P.bomb < 0.01) {
      n.hat = t + 11 + Math.random() * 7;
      this.hatAdjust();
    } else if (t > n.toss && this.bombWanted && this.P.bomb > 0.99) {
      n.toss = t + 4 + Math.random() * 3;
      this.toss();
    }
  }

  /** Cancel the idle beat and hold the next ones off for a moment after a reaction. */
  private stopBeat() {
    if (this.beat) {
      this.beat.kill();
      this.beat = undefined;
      this.busy = 0;
      this.tossY.y = 0;
      this.P.tap = 0;
      this.P.hatTilt = 0;
      this.P.hatLift = 0;
    }
    const n = this.nextIdle;
    const t = this.t;
    n.tap = Math.max(n.tap, t + 3 + Math.random() * 3);
    n.hat = Math.max(n.hat, t + 5 + Math.random() * 5);
    n.toss = Math.max(n.toss, t + 2.5 + Math.random() * 2);
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

  /** The peg leg taps twice on the deck. */
  private pegTap() {
    this.beatTl()
      .to(this.P, { tap: 1, duration: 0.12, ease: 'power2.out' })
      .to(this.P, { tap: 0, duration: 0.08, ease: 'power3.in' })
      .call(() => sound.play('capPegTap'))
      .to(this.P, { tap: 0.8, duration: 0.12, ease: 'power2.out' })
      .to(this.P, { tap: 0, duration: 0.08, ease: 'power3.in' })
      .call(() => sound.play('capPegTap'));
  }

  /** Hand up to the brim, a tug and a tilt, hand back to the hip. */
  private hatAdjust() {
    const P = this.P;
    this.beatTl()
      .to(P, { lx: -40, ly: -118, lw: 0.1, duration: 0.3, ease: 'power2.inOut' })
      .to(P, { hatTilt: -0.14, hatLift: 5, tilt: -0.04, duration: 0.14, ease: 'power2.out' })
      .to(P, { hatTilt: 0.02, hatLift: -2, duration: 0.2, ease: 'back.out(2)' })
      .to(P, { hatTilt: 0, hatLift: 0, tilt: 0, ...HIP, duration: 0.36, ease: 'power2.inOut' });
  }

  /** A little toss of the bomb, caught again in the palm. */
  private toss() {
    const P = this.P;
    const o = this.tossY;
    this.beatTl()
      .to(P, { ly: HOLD.ly + 14, duration: 0.12, ease: 'power2.in' })
      .to(P, { ly: HOLD.ly - 6, duration: 0.1, ease: 'power2.out' })
      .to(o, { y: -46, duration: 0.24, ease: 'power2.out' }, 0.18)
      .to(o, { y: 0, duration: 0.22, ease: 'power2.in' })
      .to(P, { ly: HOLD.ly + 10, duration: 0.07, ease: 'power2.out' }, '-=0.02')
      .to(P, { ly: HOLD.ly, duration: 0.2, ease: 'back.out(2)' });
  }

  /* ------------------------------------------------------------------ */
  /* frame                                                               */
  /* ------------------------------------------------------------------ */

  private globalOf(p: Vec): [number, number] {
    const g = this.rig.toGlobal(p);
    return [g.x, g.y];
  }

  update(dtMs: number) {
    if (!this.built || this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0.001, dtMs / 1000));
    this.t += dt;
    const t = this.t;
    const P = this.P;
    const st = this.state;
    const red = motion.reduced;
    const low = motion.low;
    this.idleLife();
    const { phase } = this.getBeat();
    const beat = Math.abs(Math.sin(Math.PI * phase));
    const dance = P.kick;
    const bob = (12 + dance * 16) * P.bounce * (red ? 0.35 : 1) * beat;
    const breath = low ? 0 : Math.sin(t * 2.3) * 1.6;
    const prayK = P.pray;
    const tremble = prayK > 0.5 && !red ? Math.sin(t * 60) * 1.4 * prayK : 0;
    const shake = P.shake > 0 && !red ? Math.abs(Math.sin(t * 17)) * 6 * P.shake : 0;
    const sway = Math.sin(t * (dance > 0.5 ? 7 : 2)) * (3 + dance * 9) * (red ? 0.4 : 1);
    // hips, and the upper body leaned round the hip centre
    const hip = { x: sway * 0.5, y: HIP_Y - bob * 0.9 - P.lift + P.crouch * 44 + tremble };
    const lean = P.lean + (dance > 0 && !red ? Math.sin(t * 7) * 0.05 * dance : 0);
    const cs = Math.cos(lean);
    const sn = Math.sin(lean);
    const U = (x: number, y: number): Vec => ({ x: hip.x + x * cs - y * sn, y: hip.y + x * sn + y * cs });
    const neckY = -TORSO_LEN + breath - shake * 0.3;
    const neck = U(0, neckY);
    const squash = 1 + (beat - 0.6) * 0.05 * P.bounce - P.crouch * 0.03;
    this.torso.position.set(neck.x, neck.y + 4);
    this.torso.rotation = lean;
    this.torso.scale.y = Math.abs(this.torso.scale.x) * squash;

    // head: rides the neck, tilts, dips into the collar and turns a touch with the gaze
    const look = this.lookOverride ?? { x: this.F.lookX + this.glance.x, y: this.F.lookY + this.glance.y };
    const lookX = clamp(look.x, -1, 1);
    const lookY = clamp(look.y, -1, 1);
    const headRot = lean + P.tilt + Math.sin(Math.PI * 2 * phase) * (0.035 + dance * 0.06) * P.bounce * (red ? 0.4 : 1) + lookX * 0.05 + (shake ? Math.sin(t * 17) * 0.03 : 0);
    const hp = U(sway * 0.3 + lookX * 5, neckY + 8 + P.dip + (1 - squash) * 50);
    this.head.position.set(hp.x, hp.y);
    this.head.rotation = headRot;
    this.head.scale.set(this.hq.x, this.hq.y);
    // secondary: the hat and beard lag the head
    const hvy = (hp.y - this.prev.hy) / dt;
    const hay = clamp((hvy - this.prev.hvy) / dt, -20000, 20000);
    const dRot = headRot - this.prev.hr;
    this.prev.hy = hp.y;
    this.prev.hvy = hvy;
    this.prev.hr = headRot;
    const spr = this.springs;
    if (!low) {
      spr.hatY.v += -hay * dt * 0.05;
      spr.hatR.v += -dRot * 9;
      spr.beard.v += -dRot * 7;
    }
    const hatY = low ? 0 : spr.hatY.step(0, dt);
    const hatR = low ? 0 : spr.hatR.step(0, dt);
    const beardR = low ? 0 : spr.beard.step(0, dt);
    const hat = this.part.get('hat')!;
    hat.position.set(hat.base.x, hat.base.y + clamp(hatY, -44, 10) - P.hatLift);
    hat.rotation = P.hatTilt + clamp(hatR, -0.3, 0.3);
    const beard = this.part.get('beard')!;
    beard.rotation = clamp(beardR, -0.18, 0.18);
    beard.scale.set(beard.k0, beard.k0 * (1 + clamp(hvy * -0.00012, -0.05, 0.07) + (shake ? Math.sin(t * 17) * 0.03 : 0)));
    this.faceFrame(lookX, lookY, shake);

    // legs: boot on the left, peg on the right; the jig lifts them in turn, the peg taps
    let liftL = 0;
    let liftR = P.tap * 18;
    if (dance > 0 && !red) {
      liftL += Math.max(0, Math.sin(t * 7)) * 26 * dance;
      liftR += Math.max(0, -Math.sin(t * 7)) * 26 * dance;
    }
    this.boot.position.set(-42 - P.crouch * 6, -liftL);
    this.boot.rotation = -liftL * 0.004;
    const pegFoot = { x: 40 + P.crouch * 6, y: -liftR };
    const hipL = U(-32, 0);
    const hipR = U(32, 0);
    const knee = { x: 38 + sway * 0.2 + P.crouch * 10, y: pegFoot.y - 92 + P.crouch * 26 };

    // coat tails hang from the waist and trail the body's motion
    const hvx = (hip.x - this.prev.hipX) / dt;
    const hipVy = (hip.y - this.prev.hipY) / dt;
    this.prev.hipX = hip.x;
    this.prev.hipY = hip.y;
    const trail = clamp(hvx * 0.004, -0.35, 0.35);
    const flare = clamp(hipVy * 0.0015, -0.1, 0.45);
    const tl = low ? 0 : spr.tailL.step(trail + flare, dt);
    const tr = low ? 0 : spr.tailR.step(trail - flare, dt);
    const tailL = U(-38, -24);
    const tailR = U(38, -24);
    this.tails[0].position.set(tailL.x, tailL.y);
    this.tails[1].position.set(tailR.x, tailR.y);
    // the tails never reach the deck: crouching, they splay outward just as far as they must
    const keepUp = (hingeY: number, rot: number, out: 1 | -1) => {
      const room = -DECK_CLEAR - hingeY;
      const R = Math.hypot(TAIL_REACH, TAIL_SPREAD);
      if (R <= room) return rot;
      const min = Math.atan2(TAIL_SPREAD, TAIL_REACH) + Math.acos(clamp(room / R, -1, 1));
      return out > 0 ? Math.max(rot, min) : Math.min(rot, -min);
    };
    this.tails[0].rotation = keepUp(tailL.y, 0.1 + tl, 1);
    this.tails[1].rotation = keepUp(tailR.y, -0.1 + tr, -1);

    // arms: shoulders, hand targets (turned with the lean), hose sleeves, gloves turned to the sleeve
    const shL = U(-SH_X, neckY + SH_Y);
    const shR = U(SH_X, neckY + SH_Y);
    const swing = Math.sin(Math.PI * 2 * phase) * (red ? 0.3 : 1);
    const danceArm = dance > 0 && !red ? Math.sin(t * 7) * 18 * dance : 0;
    const heldBomb = P.bomb > 0.01;
    let hl = U(-SH_X + P.lx + danceArm, neckY + SH_Y + P.ly - bob * 0.06 + (heldBomb ? Math.sin(t * 2.1) * 2 : swing * 2));
    let hr = U(SH_X + P.rx - swing * 4 - danceArm, neckY + SH_Y + P.ry - bob * 0.12);
    // planting the linstock: the right hand carries it down to the deck
    if (P.plant > 0) {
      const to = { x: PLANT.x - this.lastFist.x, y: PLANT.y - this.lastFist.y };
      hr = { x: hr.x + (to.x - hr.x) * P.plant, y: hr.y + (to.y - hr.y) * P.plant };
    }
    const clutch = heldBomb;
    const prayP = U(2, neckY + 100);
    if (prayK > 0) {
      const pl = clutch ? U(-6, neckY + 132) : { x: prayP.x - 22, y: prayP.y + 30 };
      const pr = clutch ? U(42, neckY + 112) : { x: prayP.x + 22, y: prayP.y + 30 };
      hl = { x: hl.x + (pl.x - hl.x) * prayK, y: hl.y + (pl.y - hl.y) * prayK };
      hr = { x: hr.x + (pr.x - hr.x) * prayK, y: hr.y + (pr.y - hr.y) * prayK };
    }
    const tanL = this.armL.bend(shL, hl, ARM, { x: -0.8, y: 0.6 });
    const tanR = this.armR.bend(shR, hr, ARM, { x: 0.8, y: 0.7 });
    const rotL = Math.atan2(tanL.y, tanL.x) + Math.PI / 2 - P.lw * (1 - prayK) + (clutch ? -0.1 : 0.35) * prayK;
    const rotR = Math.atan2(tanR.y, tanR.x) + Math.PI / 2 + P.rw * (1 - prayK) - (clutch ? 1.1 : 0.35) * prayK;
    this.handL.position.set(hl.x, hl.y);
    this.handL.rotation = rotL;
    this.handR.position.set(hr.x, hr.y);
    this.handR.rotation = rotR;
    const praySprite = prayK > 0.82 && !clutch;
    const handsA = praySprite ? Math.max(0, 1 - (prayK - 0.82) / 0.12) : 1;
    this.handL.alpha = this.handR.alpha = handsA;
    this.prayS.visible = praySprite;
    if (praySprite) {
      this.prayS.alpha = 1 - handsA;
      this.prayS.position.set(prayP.x, prayP.y + 26);
      this.prayS.rotation = lean + tremble * 0.01;
    }

    // linstock: held through the fist (its grip is the fist's centre), or standing in the deck
    const fist = this.rot(FIST, rotR);
    this.lastFist = fist;
    const planted = prayK > 0.001 && P.plant > 0.999;
    const heldR = lean + P.stick + (dance > 0 && !red ? Math.sin(t * 12) * 0.12 * dance : swing * 0.05);
    const sr = planted ? 0.06 : heldR + (0.06 - heldR) * P.plant;
    if (planted) this.prop.position.set(PLANT.x, PLANT.y);
    else this.prop.position.set(hr.x + fist.x, hr.y + fist.y);
    this.prop.rotation = sr;
    const reach = (LINSTOCK_GRIP - LINSTOCK_TIP) * (210 / 256);
    const tip = { x: this.prop.x + Math.sin(sr) * reach, y: this.prop.y - Math.cos(sr) * reach };
    this.fire.position.set(tip.x, tip.y + 4);
    const n1 = Math.sin(t * 11) * 0.5 + Math.sin(t * 17.3) * 0.3 + (Math.random() - 0.5) * 0.12;
    const up = st === 'cheer' || st === 'dance';
    const fk = this.flare.k;
    this.fire.scale.set(this.fireBase * (1 + n1 * 0.07) * (1 + fk * 0.25), this.fireBase * (1 + n1 * 0.15) * (up ? 1.2 : 1) * (1 + fk * 0.55));
    this.fire.rotation = -sr * 0.4 + Math.sin(t * 5) * 0.08;
    if (t > this.nextIdle.flare) {
      this.nextIdle.flare = t + 3 + Math.random() * 4;
      if (!low) {
        gsap.timeline().to(this.flare, { k: 1, duration: 0.08, ease: 'power2.out' }).to(this.flare, { k: 0, duration: 0.5, ease: 'power2.in' });
        const fp = this.fire.getGlobalPosition();
        this.fx?.embers(fp.x, fp.y - 30 * this.unit, 3);
      }
    }
    this.emberAcc += dtMs;
    if (this.fx && this.emberAcc > (low ? 520 : up ? 90 : 240)) {
      this.emberAcc = 0;
      const gp = this.fire.getGlobalPosition();
      this.fx.embers(gp.x, gp.y - 24 * this.unit, 1);
    }

    // the bomb: sits in the cupped palm, fuse up; the pips arc round its outer side
    const bombK = Math.max(0, P.bomb);
    const vis = bombK > 0.01;
    this.bombS.visible = this.bombHot.visible = this.bandS.visible = vis;
    this.pipLayer.visible = vis;
    if (vis) {
      const palm = this.rot(PALM, rotL);
      const lift = this.rot({ x: 0, y: -BOMB_R * 0.6 * bombK + this.tossY.y }, rotL * 0.3);
      const bx = hl.x + palm.x + lift.x;
      const by = hl.y + palm.y + lift.y;
      const heat = this.charge / this.chargeMax;
      const kb = (BOMB_BOX / this.bombS.texture.width) * bombK;
      const wob = heat >= 1 && !red ? Math.sin(t * 40) * 0.05 : 0;
      this.bombS.position.set(bx, by);
      this.bombS.scale.set(kb);
      this.bombS.rotation = rotL * 0.3 + wob + this.tossY.y * 0.02;
      this.bombHot.position.set(bx, by);
      this.bombHot.scale.set(kb);
      this.bombHot.rotation = this.bombS.rotation;
      this.bombHot.alpha = heat >= 1 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 9)) : heat >= 0.66 ? 0.18 * Math.abs(Math.sin(t * 5)) : 0;
      this.bandS.position.set(bx, by);
      this.bandS.scale.set(kb);
      this.bandS.rotation = this.bombS.rotation;
      this.bandS.tint = heat >= 1 ? 0xffc9a0 : 0xffffff;
      // the fuse spark sits on the fuse tip: bigger and brighter with every point of charge
      const lit = this.charge > 0 || this.throwing;
      this.sparkS.visible = this.sparkGlow.visible = lit;
      if (lit) {
        const tipL = { x: (CAP_BOMB.tip[0] - CAP_BOMB.cx) * (BOMB_BOX / 256) * bombK, y: (CAP_BOMB.tip[1] - CAP_BOMB.cy) * (BOMB_BOX / 256) * bombK };
        const tp = this.rot(tipL, this.bombS.rotation);
        const s = (0.55 + 0.45 * heat + Math.random() * 0.25) * bombK;
        this.sparkS.position.set(bx + tp.x, by + tp.y);
        this.sparkS.scale.set((40 / this.sparkS.texture.width) * s);
        this.sparkS.rotation = Math.random() * Math.PI * 2;
        this.sparkGlow.position.copyFrom(this.sparkS.position);
        this.sparkGlow.alpha = (0.35 + 0.45 * heat) * (0.8 + Math.random() * 0.2);
        this.sparkGlow.width = this.sparkGlow.height = (60 + 60 * heat) * bombK;
        if (this.fx && Math.random() < dtMs / (heat >= 1 ? 45 : 170)) {
          const gp = this.sparkS.getGlobalPosition();
          this.fx.embers(gp.x, gp.y, 1);
        }
      }
      // the charge lamps ride in the bomb's band (they turn with it)
      const lamps = bombLamps(this.pips.length);
      const u = (BOMB_BOX / 256) * bombK;
      this.pips.forEach((p, i) => {
        const [lx, ly] = lamps[i];
        const lp = this.rot({ x: (lx - CAP_BOMB.cx) * u, y: (ly - CAP_BOMB.cy) * u }, this.bombS.rotation);
        p.s.position.set(bx + lp.x, by + lp.y);
        p.glow.position.copyFrom(p.s.position);
        p.s.alpha = Math.min(1, bombK * 1.5);
        p.s.rotation = this.bombS.rotation;
        if (p.lit && !gsap.isTweening(p.glow)) p.glow.alpha = (0.6 + 0.25 * Math.sin(t * 6 + i) + (heat >= 1 ? 0.2 * Math.sin(t * 22 + i) : 0)) * bombK;
      });
    } else {
      this.sparkS.visible = this.sparkGlow.visible = false;
    }
    const bg = this.bombS.getGlobalPosition();
    this.bombPos.last = this.bombPos.cur;
    this.bombPos.cur = { x: bg.x, y: bg.y };
    this.bombPos.dt = dt;

    // legs behind the body (bowing as he lands), then the oak peg: shaft stretched knee to foot,
    // the shod foot and the knee cuff riding on it unstretched
    const legBend = 10 + (1 - beat) * 14 + P.crouch * 20;
    this.legL.arc(hipL, { x: this.boot.x, y: this.boot.y - 64 }, -legBend * 0.6);
    this.legR.arc(hipR, knee, legBend * 0.5);
    const pdx = pegFoot.x - knee.x;
    const pdy = pegFoot.y - knee.y;
    const pl = Math.hypot(pdx, pdy) || 1;
    const pr = Math.atan2(-pdx, pdy);
    this.pegShaft.position.set(knee.x, knee.y);
    this.pegShaft.rotation = pr;
    this.pegShaft.scale.set(this.pegK, this.pegK * (pl / PEG.len));
    this.pegFoot.position.set(pegFoot.x, pegFoot.y);
    this.pegFoot.rotation = pr;
    this.pegCuff.position.set(knee.x, knee.y);
    this.pegCuff.rotation = pr;
  }
  private pegK = 1;

  /** Pose the face parts from the blended face state. */
  private faceFrame(lookX: number, lookY: number, shake: number) {
    const F = this.F;
    const get = (k: string) => this.part.get(k)!;
    const white = get('eyeWhite');
    const ring = get('eyeRing');
    const pupil = get('pupil');
    const lid = get('lid');
    const open = 1 - F.laugh;
    white.scale.set(white.k0 * F.eye);
    ring.scale.set(ring.k0 * F.eye);
    white.alpha = ring.alpha = open;
    // the pupil glances inside the white (the ring hides its edge)
    const ex = (CAP_EYE.x - HEAD_PIVOT[0]) * HS;
    const ey = (CAP_EYE.y - HEAD_PIVOT[1]) * HS;
    const ox = 3 * (1 - Math.abs(lookX)) + lookX * (lookX > 0 ? 7.2 : 7.5);
    const oy = 4 * (1 - Math.abs(lookY)) + lookY * (lookY > 0 ? 6 : 9);
    pupil.position.set(ex + ox * HS * F.eye, ey + oy * HS * F.eye);
    pupil.scale.set(pupil.k0 * F.pupil);
    pupil.alpha = open;
    // the lid is hinged at the top of the eye; blinks ride on the face's own lid
    const shut = Math.min(1, F.lid + F.blink * (1 - F.lid));
    lid.scale.set(lid.k0 * F.eye, lid.k0 * Math.max(0.001, shut) * F.eye);
    lid.position.set(lid.base.x, ey + (lid.base.y - ey) * F.eye);
    lid.alpha = shut > 0.02 ? open : 0;
    get('lidLaugh').alpha = F.laugh;
    const bR = get('browR');
    const bL = get('browL');
    bR.position.set(bR.base.x, bR.base.y + F.bRy * HS - F.blink * 2);
    bR.rotation = F.bRr;
    bR.scale.set(bR.k0, bR.k0 * F.bRs);
    bL.position.set(bL.base.x, bL.base.y + F.bLy * HS);
    bL.rotation = F.bLr;
    bL.scale.set(bL.k0, bL.k0 * F.bLs);
    const tache = get('moustache');
    tache.position.set(tache.base.x, tache.base.y + F.tache * HS);
    // parts faded right out are hidden, not drawn at alpha 0
    for (const s of [white, ring, pupil, lid, get('lidLaugh')]) s.visible = s.alpha > 0.01;
    const mo = this.mouth;
    mo.scale.set(mo.k0 * this.mq.x, mo.k0 * this.mq.y * (shake ? 1 + Math.sin(this.t * 17) * 0.12 : 1));
    mo.position.set(mo.base.x, mo.base.y + (shake ? Math.sin(this.t * 17) * 2 : 0));
  }

  private rot(p: Vec, r: number): Vec {
    const c = Math.cos(r);
    const s = Math.sin(r);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.holdTimer?.kill();
    this.poseTween?.kill();
    this.throwTl?.kill();
    this.bombTl?.kill();
    this.beat?.kill();
    this.followTl?.kill();
    gsap.killTweensOf([this.P, this.F, this.glance, this.tossY, this.flare, this.mq, this.hq, this.handL.scale, this.handR.scale, ...this.pips.flatMap((p) => [p.s.scale, p.glow])]);
    if (cast.captain === this) cast.captain = undefined;
    super.destroy(options);
  }
}
