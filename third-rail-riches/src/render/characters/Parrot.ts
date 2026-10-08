import { Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture } from '../textures';
import { parrotHead, type ParrotExpr } from '../../art/critters';
import { parrotBody, parrotWing, parrotWingSpread, parrotTail, perchBarrel, cropTo, BARREL_BOX } from '../../art/crew';
import { T } from '../timing';
import { motion } from './motion';
import { sound } from '../../game/sound';
import { cast } from './cast';
import type { Particles } from '../fx/Particles';

export type ParrotState = 'idle' | 'squawk' | 'happy' | 'worried' | 'duck' | 'watch';
type State = ParrotState;
type Vec = { x: number; y: number };
type HeadPart = 'base' | 'eyeWhite' | 'eyeRing' | 'pupil' | 'lid' | 'lidHappy' | 'beak' | 'jaw' | 'browL' | 'browR' | 'tear';

// design units: ~360 tall, origin on the deck under the barrel
const BARREL = 170;
const BODY = 150;
const HEAD = 196;
const WING = 100;
const TAIL = 136;
const HS = HEAD / 256;
/** The barrel stands on its painted bottom (ink included) at the deck line, y = 0. */
const BARREL_FOOT = 245;
const LID_Y = -((BARREL_FOOT - 70) / 256) * BARREL; // barrel lid, where the feet grip
const NECK_Y = LID_Y - ((220 - 50) / 256) * BODY;
const HEAD_PIVOT: [number, number] = [128, 205];
/** Crop boxes and pivots of the head parts (parrotHead's 256 box). */
const PARTS: Record<HeadPart, { box: [number, number, number, number]; pivot: [number, number] }> = {
  base: { box: [26, 0, 230, 216], pivot: [128, 205] },
  eyeWhite: { box: [82, 103, 46, 54], pivot: [105, 130] },
  eyeRing: { box: [78, 99, 54, 62], pivot: [105, 130] },
  pupil: { box: [96, 118, 26, 34], pivot: [109, 135] },
  lid: { box: [80, 100, 50, 58], pivot: [105, 104] },
  lidHappy: { box: [84, 112, 42, 26], pivot: [104, 132] },
  beak: { box: [94, 136, 68, 80], pivot: [128, 154] },
  jaw: { box: [96, 166, 68, 54], pivot: [130, 176] },
  browL: { box: [78, 92, 44, 22], pivot: [100, 103] },
  browR: { box: [134, 92, 44, 22], pivot: [156, 103] },
  tear: { box: [184, 144, 24, 30], pivot: [196, 159] },
};
/** The right eye is the left one moved over (its pupil sits a little further in, toward the beak). */
const EYE_DX = 46;
const PUPIL_R_DX = 40;

interface Face {
  happy: number;
  lid: number;
  pupil: number;
  look: [number, number];
  beak: number;
  worry: number;
}
type FaceKey = ParrotExpr | 'duck' | 'watch';
const FACES: Record<FaceKey, Face> = {
  idle: { happy: 0, lid: 0, pupil: 1, look: [0, 0], beak: 0, worry: 0 },
  blink: { happy: 0, lid: 0, pupil: 1, look: [0, 0], beak: 0, worry: 0 },
  happy: { happy: 1, lid: 0, pupil: 1, look: [0, 0], beak: 0.55, worry: 0 },
  squawk: { happy: 0, lid: 0, pupil: 0.85, look: [0.2, -0.3], beak: 1, worry: 0 },
  worried: { happy: 0, lid: 0.12, pupil: 1, look: [-0.4, -0.7], beak: 0, worry: 1 },
  duck: { happy: 1, lid: 0, pupil: 1, look: [0, 0], beak: 0, worry: 0.6 },
  watch: { happy: 0, lid: 0, pupil: 0.9, look: [-0.9, -0.3], beak: 0.2, worry: 0 },
};
const STATE_FACE: Record<State, FaceKey> = { idle: 'idle', squawk: 'squawk', happy: 'happy', worried: 'worried', duck: 'duck', watch: 'watch' };

type PartSprite = Sprite & { base: Vec; k0: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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

/**
 * Sparks the parrot, perched on a little powder barrel. Bobs on the beat with his head a touch
 * behind his body, snaps into curious head tilts, blinks with real lids and flaps with the wing
 * drawn spread at the top of each beat (open-shut reads clearly). A squawk works the beak open
 * and shut; a hop lifts his feet off the lid and lands in a squash; he ducks under his wings at a
 * big blast and follows the bomb in flight with head and eyes (lookAt).
 */
export class Parrot extends Container {
  private rig = new Container();
  private barrel = new Sprite();
  private tail = new Sprite();
  private body = new Sprite();
  private wingL = new Sprite();
  private wingR = new Sprite();
  private head = new Container();
  private part = new Map<string, PartSprite>();
  private wingTex: Texture[] = [];
  private t = 0;
  private built = false;
  private state: State = 'idle';
  private face: FaceKey = 'idle';
  private F = { happy: 0, lid: 0, pupil: 1, lookX: 0, lookY: 0, beak: 0, worry: 0, blink: 0 };
  /** Tweened pose: hop height, crouch, lean, tilt, wing raise and flap rate, tuck (ducking), jut (squawking). */
  private P = { hop: 0, crouch: 0, lean: 0, tilt: 0, flap: 0, rate: 16, tuck: 0, jut: 0 };
  private glance = { x: 0, y: 0 };
  private lookOverride: Vec | null = null;
  private followTl?: gsap.core.Tween;
  private releaseLook?: gsap.core.Tween;
  private holdTimer?: gsap.core.Tween;
  private poseTl?: gsap.core.Timeline;
  private next = { blink: 3, tilt: 2.5, ruffle: 5, glance: 4 };
  private flapPhase = 0;
  private springs = { tail: new Spring(90, 6), head: new Spring(220, 14) };
  private prevBodyY = LID_Y;
  private bodyK = 1;
  private barrelK = 1;
  private noteAcc = 0;
  fx?: Particles;
  getBeat: () => { phase: number; bpm: number } = () => ({ phase: (this.t * 1.5) % 1, bpm: 90 });

  constructor() {
    super();
    this.eventMode = 'none';
    cast.parrot ??= this;
    this.barrel.anchor.set((128 - BARREL_BOX[0]) / BARREL_BOX[2], (BARREL_FOOT - BARREL_BOX[1]) / BARREL_BOX[3]);
    this.body.anchor.set(0.5, 220 / 256);
    this.tail.anchor.set(0.5, 24 / 256);
    this.wingL.anchor.set(64 / 256, 40 / 256);
    this.wingR.anchor.set(64 / 256, 40 / 256);
    this.rig.addChild(this.barrel, this.tail, this.body, this.wingL, this.wingR, this.head);
    this.addChild(this.rig);
  }

  async build(h: number, res: number) {
    const k = h / 360;
    const px = (u: number) => Math.max(8, Math.round(u * k * res));
    const keys = Object.keys(PARTS) as HeadPart[];
    const exprOf = (p: HeadPart): ParrotExpr => (p === 'jaw' ? 'squawk' : p === 'browL' || p === 'browR' || p === 'tear' ? 'worried' : 'idle');
    const [heads, [body, barrel, tail, wing, spread]] = await Promise.all([
      Promise.all(keys.map((p) => svgTexture(`parrot2-${p}`, parrotHead(exprOf(p), false, p), px(PARTS[p].box[2] * HS), px(PARTS[p].box[3] * HS)))),
      Promise.all([
        svgTexture('parrot-body', parrotBody(), px(BODY)),
        svgTexture('parrot-barrel', cropTo(perchBarrel(), BARREL_BOX), px((BARREL * BARREL_BOX[2]) / 256), px((BARREL * BARREL_BOX[3]) / 256)),
        svgTexture('parrot-tail', parrotTail(), px(TAIL)),
        svgTexture('parrot-wing', parrotWing(), px(WING)),
        svgTexture('parrot-wing-open', parrotWingSpread(), px(WING)),
      ]),
    ]);
    if (this.destroyed) return;
    this.rig.scale.set(k);
    this.head.removeChildren();
    const tex = new Map(keys.map((p, i) => [p, heads[i]]));
    const make = (key: string, p: HeadPart, dx = 0) => {
      const { box, pivot } = PARTS[p];
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
    const order: [string, HeadPart, number][] = [
      ['base', 'base', 0],
      ['whiteL', 'eyeWhite', 0],
      ['whiteR', 'eyeWhite', EYE_DX],
      ['pupilL', 'pupil', 0],
      ['pupilR', 'pupil', PUPIL_R_DX],
      ['ringL', 'eyeRing', 0],
      ['ringR', 'eyeRing', EYE_DX],
      ['lidL', 'lid', 0],
      ['lidR', 'lid', EYE_DX],
      ['happyL', 'lidHappy', 0],
      ['happyR', 'lidHappy', EYE_DX + 2],
      ['browL', 'browL', 0],
      ['browR', 'browR', 0],
      ['jaw', 'jaw', 0],
      ['beak', 'beak', 0],
      ['tear', 'tear', 0],
    ];
    for (const [key, p, dx] of order) this.head.addChild(make(key, p, dx));
    const size = (s: Sprite, t: Texture, u: number) => {
      s.texture = t;
      s.scale.set(u / t.width);
    };
    size(this.body, body, BODY);
    size(this.barrel, barrel, (BARREL * BARREL_BOX[2]) / 256);
    this.bodyK = this.body.scale.x;
    this.barrelK = this.barrel.scale.x;
    size(this.tail, tail, TAIL);
    size(this.wingL, wing, WING);
    size(this.wingR, wing, WING);
    this.wingL.scale.x *= -1;
    this.wingTex = [wing, spread];
    this.built = true;
  }

  /* ------------------------------------------------------------------ */

  /** Show one of the head's expressions (blended). */
  setExpr(e: ParrotExpr) {
    if (e === 'blink') this.blink();
    else this.setFace(e);
  }

  private setFace(f: FaceKey) {
    if (f === this.face) return;
    this.face = f;
    const to = FACES[f];
    gsap.killTweensOf(this.F, 'happy,lid,pupil,lookX,lookY,beak,worry');
    gsap.to(this.F, { happy: to.happy, lid: to.lid, pupil: to.pupil, lookX: to.look[0], lookY: to.look[1], beak: to.beak, worry: to.worry, duration: T(0.15), ease: 'back.out(1.6)' });
  }

  private blink() {
    if (this.F.happy > 0.5 || !this.built) return;
    gsap.killTweensOf(this.F, 'blink');
    gsap.timeline().to(this.F, { blink: 1, duration: 0.05, ease: 'power2.in' }).to(this.F, { blink: 1, duration: 0.05 }).to(this.F, { blink: 0, duration: 0.09, ease: 'power2.out' });
  }

  /** Follow a global point with head and eyes (the bomb in flight); `null` lets go. */
  lookAt(gx: number | null, gy = 0) {
    if (gx === null || this.destroyed) {
      this.lookOverride = null;
      return;
    }
    // toLocal accounts for the mirrored rig (scale.x -1)
    const lp = this.toLocal({ x: gx, y: gy });
    const k = this.rig.scale.x || 1;
    const vy = lp.y - (NECK_Y - 70) * k;
    const len = Math.hypot(lp.x, vy) || 1;
    this.lookOverride = { x: lp.x / len, y: (vy / len) * 0.85 };
  }

  /**
   * Follow something flying from one global point to another (the captain's bomb) with head and
   * eyes along its arc; squawk as it lands, keep looking a moment, then let go.
   */
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
        this.accent('squawk');
        this.releaseLook = gsap.delayedCall(0.8, () => this.lookAt(null));
      },
    });
  }

  /** Switch pose. Reactions blend in and hold for `hold` seconds (0 = until changed). */
  react(state: State, hold = 0) {
    this.state = state;
    this.setFace(STATE_FACE[state]);
    this.holdTimer?.kill();
    this.holdTimer = undefined;
    this.poseTl?.kill();
    const P = this.P;
    const tl = gsap.timeline();
    this.poseTl = tl;
    switch (state) {
      case 'idle':
        tl.to(P, { crouch: 0, lean: 0, tilt: 0, flap: 0, rate: 16, tuck: 0, jut: 0, duration: T(0.3), ease: 'power2.inOut' });
        break;
      case 'squawk':
        // head juts up and forward, wings burst open, tail flicks
        tl.to(P, { jut: 1, tilt: -0.22, lean: -0.05, flap: 1, rate: 24, tuck: 0, crouch: 0, duration: T(0.12), ease: 'back.out(2)' });
        this.springs.tail.v -= 6;
        break;
      case 'happy':
        tl.to(P, { flap: 0.85, rate: 20, tilt: 0.1, lean: 0, tuck: 0, jut: 0.3, crouch: 0, duration: T(0.22), ease: 'back.out(1.6)' });
        this.hop(30);
        break;
      case 'worried':
        tl.to(P, { crouch: 0.35, lean: 0.04, tilt: 0.1, flap: 0.12, rate: 30, tuck: 0.2, jut: 0, duration: T(0.3), ease: 'power2.out' });
        break;
      case 'duck':
        // squashed down on the lid, head pulled in, both wings thrown up over the head
        tl.to(P, { crouch: 1, tuck: 1, lean: 0, tilt: 0.12, flap: 0, jut: 0, duration: T(0.12), ease: 'power3.out' });
        break;
      case 'watch':
        tl.to(P, { crouch: 0.1, lean: -0.06, tilt: -0.14, flap: 0.2, rate: 14, tuck: 0, jut: 0.6, duration: T(0.22), ease: 'back.out(1.6)' });
        break;
    }
    if (hold > 0) this.holdTimer = gsap.delayedCall(hold, () => this.state === state && this.react('idle'));
  }

  /** A one-off accent that keeps the current state: a hop, a squawk or a quick wing flap. */
  accent(kind: 'hop' | 'squawk' | 'flap' = 'hop') {
    if (!this.built) return;
    if (kind === 'hop') {
      sound.play('parrotFlap');
      this.hop(40);
      gsap.timeline().to(this.P, { flap: 1, duration: T(0.1) }).to(this.P, { flap: this.state === 'happy' ? 0.85 : 0, duration: T(0.5), ease: 'power2.in' });
    } else if (kind === 'squawk') {
      // react('squawk') stays silent: its caller (KEG DROP) plays the long howl with it
      sound.play('parrotSquawk');
      const back = this.face;
      this.setFace('squawk');
      gsap
        .timeline()
        .to(this.P, { jut: 1, flap: 1, duration: T(0.1), ease: 'back.out(2)' })
        .to(this.P, { jut: 0, flap: this.state === 'happy' ? 0.85 : 0, duration: T(0.4), ease: 'power2.inOut', delay: T(0.5) });
      gsap.delayedCall(T(0.7), () => {
        if (this.face === 'squawk' && this.state !== 'squawk') this.setFace(back === 'squawk' ? STATE_FACE[this.state] : back);
      });
      this.squawkNotes(4);
    } else {
      sound.play('parrotFlap');
      gsap.timeline().to(this.P, { flap: 0.7, duration: T(0.08) }).to(this.P, { flap: 0, duration: T(0.45), ease: 'power2.out' });
    }
  }

  private hop(h: number) {
    if (motion.reduced) h *= 0.3;
    gsap.killTweensOf(this.P, 'hop');
    gsap
      .timeline()
      .to(this.P, { hop: -6, duration: T(0.06), ease: 'power2.in' })
      .to(this.P, { hop: h, duration: T(0.17), ease: 'power2.out' })
      .to(this.P, { hop: 0, duration: T(0.2), ease: 'power2.in' })
      .to(this.P, { hop: -8, duration: T(0.05), ease: 'power1.out' })
      .to(this.P, { hop: 0, duration: T(0.22), ease: 'back.out(2.2)' });
  }

  private squawkNotes(n: number) {
    if (!this.fx || !this.built) return;
    const k = this.rig.scale.x;
    const hp = this.head.getGlobalPosition();
    this.fx.notes(hp.x + (this.scale.x < 0 ? -30 : 30) * k, hp.y - 110 * k, Math.max(1, Math.round(n * motion.fx)));
  }

  /* ------------------------------------------------------------------ */

  private idleLife() {
    const t = this.t;
    const n = this.next;
    if (t > n.blink) {
      n.blink = t + 2.4 + Math.random() * 3.8;
      this.blink();
    }
    if (motion.low) return;
    const calm = this.state === 'idle';
    if (calm && t > n.tilt) {
      // a curious snap of the head, held, then back
      n.tilt = t + 2.2 + Math.random() * 3.5;
      const a = (Math.random() < 0.5 ? -1 : 1) * (0.16 + Math.random() * 0.14);
      gsap
        .timeline()
        .to(this.P, { tilt: a, duration: 0.08, ease: 'power3.out' })
        .to(this.P, { tilt: 0, duration: 0.22, ease: 'power2.inOut', delay: 0.45 + Math.random() * 0.8 });
    }
    if (calm && t > n.glance) {
      n.glance = t + 3 + Math.random() * 3;
      const g = { x: (Math.random() - 0.5) * 1.8, y: (Math.random() - 0.6) * 0.8 };
      gsap.killTweensOf(this.glance);
      gsap.timeline().to(this.glance, { ...g, duration: 0.08, ease: 'power2.out' }).to(this.glance, { x: 0, y: 0, duration: 0.14, delay: 0.6 + Math.random() * 0.8 });
    }
    if (calm && t > n.ruffle) {
      // a wing ruffle every few seconds
      n.ruffle = t + 4 + Math.random() * 5;
      sound.play('parrotFlap', { volume: 0.7 });
      gsap.timeline().to(this.P, { flap: 0.6, duration: 0.1 }).to(this.P, { flap: 0, duration: 0.45, ease: 'power2.out' });
    }
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
    const bob = Math.pow(Math.abs(Math.sin(Math.PI * phase)), 2) * (red ? 0.4 : 1);
    // the happy bird bounces on the beat: a small hop every beat
    const beatHop = st === 'happy' && !red ? Math.pow(Math.max(0, Math.sin(Math.PI * 2 * phase)), 2) * 14 : 0;
    const lift = P.hop + beatHop;
    const crouch = P.crouch;
    // body: sits on the lid, squashes on the beat and on landing, stretches going up
    const bodyY = LID_Y - Math.max(0, lift);
    const vy = (bodyY - this.prevBodyY) / dt;
    this.prevBodyY = bodyY;
    const stretch = clamp(-vy * 0.0006, -0.12, 0.14);
    const squash = 1 - bob * 0.04 - crouch * 0.14 + stretch + Math.min(0, lift) * 0.012;
    this.body.position.set(0, bodyY);
    this.body.scale.set(this.bodyK * (1 + (1 - squash) * 0.6), this.bodyK * squash);
    this.body.rotation = P.lean;
    // head: a touch behind the body (spring), jutting up in a squawk, tucked in to duck
    const look = this.lookOverride ?? { x: this.F.lookX + this.glance.x, y: this.F.lookY + this.glance.y };
    const lookX = clamp(look.x, -1, 1);
    const lookY = clamp(look.y, -1, 1);
    const lag = low ? 0 : this.springs.head.step(clamp(vy * 0.012, -12, 12), dt);
    const headY = NECK_Y - Math.max(0, lift) + bob * 6 + crouch * 26 + P.tuck * 30 - P.jut * 10 + lag;
    const sway = Math.sin(t * 1.3) * 3 * (red ? 0.3 : 1);
    this.head.position.set(sway + lookX * 6 + P.lean * 60, headY + 8);
    const chatter = st === 'squawk' && !red ? Math.sin(t * 24) * 0.035 : 0;
    this.head.rotation = P.tilt + P.lean * 0.5 + chatter + lookX * 0.06 + (st === 'idle' ? Math.sin(t * 1.7) * 0.03 + (bob - 0.5) * 0.04 : 0);
    const hk = 1 + P.jut * 0.04;
    this.head.scale.set(hk, hk * (1 - P.tuck * 0.06));
    this.faceFrame(lookX, lookY);

    // wings: shoulders on the body; a flap cycles raise and spread, with the spread drawing at the top
    const flapK = P.flap;
    const sh = { x: 27, y: bodyY - 100 * (squash * 0.5 + 0.5) + 34 };
    this.flapPhase += dt * P.rate * (red ? 0.5 : 1);
    const raise = flapK * (0.55 + 0.45 * Math.sin(this.flapPhase));
    const tuck = P.tuck;
    const open = raise > 0.5 && flapK > 0.25;
    const wt = this.wingTex[open ? 1 : 0];
    if (this.wingR.texture !== wt) this.wingR.texture = this.wingL.texture = wt;
    // folded hangs down and is raised by turning it out; spread sits level and lifts at the top
    const rot = (open ? 0.55 - raise * 0.95 : 0.1 - raise * 1.3) * (1 - tuck) - 2.3 * tuck + (st === 'worried' ? 0.1 + Math.sin(t * 40) * 0.03 : 0);
    this.wingR.position.set(sh.x + tuck * 4, sh.y - tuck * 18);
    this.wingL.position.set(-sh.x - tuck * 4, sh.y - tuck * 18);
    this.wingR.rotation = rot;
    this.wingL.rotation = -rot;
    // tail: sways under the lid, flicks when the body moves
    const tailS = low ? 0 : this.springs.tail.step(clamp(vy * 0.002, -0.3, 0.3), dt);
    const swayT = Math.sin(t * (st === 'happy' ? 8 : 2.2));
    this.tail.position.set(8, bodyY - 26);
    this.tail.rotation = -0.12 + swayT * (st === 'happy' ? 0.12 : 0.05) + tailS;
    // the barrel gives a little under a landing
    this.barrel.scale.set(this.barrelK, this.barrelK * (1 + Math.min(0, P.hop) * 0.004));

    // squawk: feathers fly while the beak works
    if (st === 'squawk' && this.fx) {
      this.noteAcc += dtMs;
      if (this.noteAcc > (low ? 380 : 170)) {
        this.noteAcc = 0;
        this.squawkNotes(1);
      }
    }
  }

  private faceFrame(lookX: number, lookY: number) {
    const F = this.F;
    const g = (k: string) => this.part.get(k)!;
    const open = 1 - F.happy;
    const shut = Math.min(1, F.lid + F.blink * (1 - F.lid));
    for (const side of ['L', 'R'] as const) {
      const pupil = g(`pupil${side}`);
      const lid = g(`lid${side}`);
      g(`white${side}`).alpha = g(`ring${side}`).alpha = pupil.alpha = open;
      pupil.position.set(pupil.base.x + lookX * 6 * HS, pupil.base.y + lookY * 6 * HS - F.worry * 2);
      pupil.scale.set(pupil.k0 * F.pupil);
      lid.scale.set(lid.k0, lid.k0 * Math.max(0.001, shut));
      lid.alpha = shut > 0.02 ? open : 0;
      g(`happy${side}`).alpha = F.happy;
    }
    // the beak works open and shut while he squawks
    const beakOpen = F.beak * (this.state === 'squawk' && !motion.reduced ? 0.55 + 0.45 * Math.abs(Math.sin(this.t * 17)) : 1);
    g('beak').rotation = -0.23 * beakOpen;
    const jaw = g('jaw');
    jaw.alpha = beakOpen > 0.04 ? 1 : 0;
    jaw.rotation = 0.12 * beakOpen;
    jaw.scale.set(jaw.k0, jaw.k0 * clamp(0.35 + beakOpen * 0.65, 0.35, 1));
    jaw.position.set(jaw.base.x, jaw.base.y - (1 - beakOpen) * 8 * HS);
    for (const k of ['browL', 'browR']) {
      const b = g(k);
      b.alpha = F.worry;
      b.position.set(b.base.x, b.base.y - F.worry * 2);
    }
    const tear = g('tear');
    tear.alpha = F.worry;
    tear.position.set(tear.base.x, tear.base.y + ((this.t * 30) % 14) * F.worry * 0.5);
    // parts faded right out are hidden, not drawn at alpha 0
    for (const s of this.part.values()) s.visible = s.alpha > 0.01;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.holdTimer?.kill();
    this.poseTl?.kill();
    this.followTl?.kill();
    this.releaseLook?.kill();
    gsap.killTweensOf([this.P, this.F, this.glance]);
    if (cast.parrot === this) cast.parrot = undefined;
    super.destroy(options);
  }
}
