import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { svgTexture, softDotTexture } from '../textures';
import { jackBody, jackLid, jackLidOpen, chestLock, chestHoard, chestRays, jester, jesterJaw, coin, CHEST, JESTER_NECK } from '../../art/props';
import { twinkle } from '../../art/fx';
import { T, done } from '../timing';
import { motion } from '../characters/motion';

export interface JackTextures {
  body: Texture;
  lid: Texture;
  lidOpen: Texture;
  lock: Texture;
  hoard: Texture;
  rays: Texture;
  jester: Texture;
  jaw: Texture;
  coin: Texture;
  glint: Texture;
}

/** The skull is drawn in its own 256 box at this fraction of the cell. */
const HEAD = 0.8;
const COINS = 8;
const GLINTS = 5;

export async function buildJackTextures(S: number, res: number): Promise<JackTextures> {
  const px = Math.round(S * 1.22 * res);
  const [body, lid, lidOpen, lock, hoard, rays, jest, jaw, coinT, glint] = await Promise.all([
    svgTexture('jack-body', jackBody(), px),
    svgTexture('jack-lid', jackLid(), px),
    svgTexture('jack-lid-open', jackLidOpen(), px),
    svgTexture('jack-lock', chestLock(), px),
    svgTexture('jack-hoard', chestHoard(), px),
    svgTexture('jack-rays', chestRays(), px * 1.2),
    svgTexture('jack-jester', jester(), px * HEAD),
    svgTexture('jack-jaw', jesterJaw(), px * HEAD),
    svgTexture('jack-coin', coin('gold'), S * 0.32 * res),
    svgTexture('jack-glint', twinkle(), S * 0.26 * res),
  ]);
  return { body, lid, lidOpen, lock, hoard, rays, jester: jest, jaw, coin: coinT, glint };
}

/** y of a 256-box coordinate in cell space (cell centre = 0). */
const Y = (S: number, v: number) => S * (v / 256 - 0.5);

/**
 * Treasure-chest scatter trigger: the chest rattles and hops with gold light leaking from its
 * seam, the moon lock drops, the lid bursts open on a flash of gold (rays, flying doubloons),
 * and a grinning golden skull in a tiny tricorn springs up on a coil, sways and chatters.
 * The chest parts share the scatter symbol's geometry, so the pop starts as that same chest.
 */
export class JackPop extends Container {
  /** Squash and stretch pivot at the chest's feet. */
  private rig = new Container();
  private aura = new Sprite(softDotTexture());
  private lidOpen: Sprite;
  private rays: Sprite;
  private spring = new Graphics();
  private head = new Container();
  private skull: Sprite;
  private jaw: Sprite;
  private hoard: Sprite;
  private lid: Sprite;
  private body: Sprite;
  private lock: Sprite;
  private seam = new Sprite(softDotTexture());
  private flash = new Sprite(softDotTexture());
  private coins: Sprite[] = [];
  private glints: Sprite[] = [];
  private rise = { h: 0 };
  private S: number;
  private k: number;
  private lidY: number;
  private base: number;
  private anim: gsap.core.Animation[] = [];

  constructor(tex: JackTextures, S: number) {
    super();
    this.S = S;
    this.eventMode = 'none';
    const k = (this.k = S / tex.body.width);
    const part = (t: Texture, ay = 0.5) => {
      const s = new Sprite(t);
      s.anchor.set(0.5, ay);
      s.scale.set(k);
      s.y = Y(S, ay * 256);
      return s;
    };
    this.body = part(tex.body);
    this.lock = part(tex.lock);
    this.hoard = part(tex.hoard, CHEST.seam / 256);
    this.lid = part(tex.lid, CHEST.seam / 256);
    this.lidOpen = part(tex.lidOpen, CHEST.lidOpenBase / 256);
    this.lidY = this.lid.y;
    this.base = Y(S, CHEST.mouth + 6);
    this.hoard.visible = false;
    this.lidOpen.visible = false;
    // the scatter symbol's teal halo
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.aura.tint = 0x5fd6cc;
    this.aura.alpha = 0.35;
    this.aura.width = S * 1.45;
    this.aura.height = S * 1.3;
    this.aura.y = Y(S, 150);
    // light leaking from the lid seam, the burst flash and the rays
    this.seam.anchor.set(0.5);
    this.seam.blendMode = 'add';
    this.seam.tint = 0xffd66b;
    this.seam.width = S * 1.15;
    this.seam.height = S * 0.09;
    this.seam.y = Y(S, CHEST.seam - 3);
    this.seam.alpha = 0;
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.tint = 0xfff0b0;
    this.flash.y = Y(S, CHEST.mouth);
    this.flash.alpha = 0;
    this.rays = new Sprite(tex.rays);
    this.rays.anchor.set(0.5, 200 / 256);
    this.rays.blendMode = 'add';
    this.rays.y = Y(S, CHEST.mouth + 4);
    this.rays.alpha = 0;
    this.rays.scale.set(0);
    // the head sits on the spring; its pivot is the neck
    const hk = (S * HEAD) / tex.jester.width;
    this.skull = new Sprite(tex.jester);
    this.jaw = new Sprite(tex.jaw);
    for (const s of [this.skull, this.jaw]) {
      s.anchor.set(JESTER_NECK[0] / 256, JESTER_NECK[1] / 256);
      s.scale.set(hk);
    }
    this.head.addChild(this.skull, this.jaw);
    this.head.visible = false;
    this.rig.pivot.set(0, Y(S, CHEST.bottom));
    this.rig.position.set(0, Y(S, CHEST.bottom));
    this.rig.addChild(this.aura, this.lidOpen, this.rays, this.spring, this.head, this.hoard, this.lid, this.body, this.lock, this.seam, this.flash);
    this.addChild(this.rig);
    for (let i = 0; i < COINS; i++) {
      const c = new Sprite(tex.coin);
      c.anchor.set(0.5);
      c.visible = false;
      this.coins.push(c);
      this.addChild(c);
    }
    for (let i = 0; i < GLINTS; i++) {
      const g = new Sprite(tex.glint);
      g.anchor.set(0.5);
      g.visible = false;
      this.glints.push(g);
      this.addChild(g);
    }
  }

  /** A helix coil from the chest mouth up to the neck: back halves first, then the front halves. */
  private drawSpring() {
    const S = this.S;
    const top = this.base - this.rise.h;
    const g = this.spring.clear();
    const coils = 6;
    const rw = S * 0.075;
    const ry = rw * 0.34;
    const steps = coils * 14;
    const at = (i: number) => {
      const t = i / steps;
      const a = t * coils * Math.PI * 2;
      return { x: Math.sin(a) * rw, y: this.base + (top - this.base) * t + Math.cos(a) * ry, front: Math.cos(a) > 0 };
    };
    for (const front of [false, true]) {
      for (const [width, color] of [
        [S * 0.046, 0x1b1311],
        [S * 0.02, front ? 0xe2ecf2 : 0x4e6272],
      ] as const) {
        let open = false;
        for (let i = 0; i <= steps; i++) {
          const p = at(i);
          if (p.front === front) {
            if (!open) g.moveTo(p.x, p.y);
            else g.lineTo(p.x, p.y);
            open = true;
          } else if (open) {
            g.lineTo(p.x, p.y);
            open = false;
          }
        }
        g.stroke({ width, color, cap: 'round', join: 'round' });
      }
    }
    this.head.position.set(0, top);
  }

  private track<A extends gsap.core.Animation>(a: A): A {
    this.anim.push(a);
    return a;
  }

  /** Doubloons fly out of the chest and tumble away. */
  private burstCoins() {
    const S = this.S;
    const x0 = 0;
    const y0 = Y(S, CHEST.mouth);
    this.coins.forEach((c, i) => {
      const side = i % 2 ? 1 : -1;
      const vx = side * S * (0.5 + Math.random() * 1.3);
      const vy = -S * (2.6 + Math.random() * 1.2);
      const g = S * 7.5;
      const spin = 8 + Math.random() * 10;
      const size = S * (0.2 + Math.random() * 0.08);
      const life = T(0.85 + Math.random() * 0.3);
      // hidden until its own flight starts (a coin shown early sat on the chest front at full size)
      c.visible = false;
      c.alpha = 1;
      c.rotation = (Math.random() - 0.5) * 0.8;
      const p = { t: 0 };
      this.track(
        gsap.to(p, {
          t: 1,
          duration: life,
          delay: T(i * 0.015),
          ease: 'none',
          onStart: () => void (c.visible = true),
          onUpdate: () => {
            const s = (p.t * life) / Math.max(0.001, T(1));
            c.position.set(x0 + vx * s, y0 - S * 0.06 + vy * s + 0.5 * g * s * s);
            // it springs out of the hoard small and grows to full size as it flies
            const k = (size / c.texture.width) * Math.min(1, 0.35 + s * 8);
            c.scale.set(k * Math.cos(s * spin), k);
            c.alpha = p.t < 0.75 ? 1 : 1 - (p.t - 0.75) / 0.25;
          },
          onComplete: () => {
            c.visible = false;
          },
        }),
      );
    });
  }

  /** Gold glints pop around the open chest. */
  private sparkle(delay: number) {
    const S = this.S;
    this.glints.forEach((g, i) => {
      const a = -Math.PI * (0.15 + 0.7 * (i / (GLINTS - 1))) + (Math.random() - 0.5) * 0.3;
      const r = S * (0.45 + Math.random() * 0.25);
      g.position.set(Math.cos(a) * r, Y(S, CHEST.mouth) + Math.sin(a) * r * 0.9);
      g.visible = true;
      const k = (S * (0.14 + Math.random() * 0.1)) / g.texture.width;
      g.scale.set(0);
      g.rotation = 0;
      this.track(
        gsap
          .timeline({ delay: delay + T(i * 0.07) })
          .to(g.scale, { x: k, y: k, duration: T(0.14), ease: 'back.out(3)' })
          .to(g, { rotation: 1.2, duration: T(0.5), ease: 'none' }, 0)
          .to(g.scale, { x: 0, y: 0, duration: T(0.2), ease: 'power2.in' }, T(0.3)),
      );
    });
  }

  play(): Promise<void> {
    const S = this.S;
    const k = this.k;
    const tl = gsap.timeline();
    this.track(tl);
    // 1) rattle: two hops, the lid chattering and gold light leaking from its seam
    const hop = (t0: number, dir: number) => {
      tl.to(this.rig.scale, { x: 1.08, y: 0.88, duration: T(0.06), ease: 'power2.out' }, t0)
        .to(this.rig.scale, { x: 0.95, y: 1.07, duration: T(0.08), ease: 'power2.out' }, t0 + T(0.06))
        .to(this.rig, { y: this.rig.position.y - S * 0.07, rotation: dir * 0.07, duration: T(0.08), ease: 'power2.out' }, t0 + T(0.06))
        .to(this.rig, { y: this.rig.position.y, rotation: 0, duration: T(0.07), ease: 'power2.in' }, t0 + T(0.14))
        .to(this.rig.scale, { x: 1, y: 1, duration: T(0.07), ease: 'power2.in' }, t0 + T(0.14))
        .to(this.lid, { y: this.lidY - S * 0.055, rotation: -dir * 0.06, duration: T(0.06), ease: 'power2.out' }, t0 + T(0.06))
        .to(this.lid, { y: this.lidY, rotation: 0, duration: T(0.06), ease: 'power2.in' }, t0 + T(0.13))
        .fromTo(this.seam, { alpha: 1 }, { alpha: 0.2, duration: T(0.18) }, t0 + T(0.06));
    };
    hop(0, 1);
    hop(T(0.22), -1);
    tl.to(this.aura, { alpha: 0.75, duration: T(0.42) }, 0);
    // the swell: it holds its breath, puffs up, light blazing from the seam
    const red = motion.reduced;
    tl.to(this.rig.scale, { x: red ? 1 : 1.07, y: red ? 1 : 1.1, duration: T(0.09), ease: 'power2.out' }, T(0.4))
      .to(this.seam, { alpha: 1, duration: T(0.08) }, T(0.4))
      .to(this.lid, { y: this.lidY - S * 0.03, duration: T(0.09), ease: 'power2.out' }, T(0.4));
    // 2) burst: the lid flies back and swings open past upright, the lock drops, gold light and coins fly
    const tb = T(0.5);
    tl.call(
      () => {
        this.hoard.visible = true;
        this.head.visible = true;
        this.rise.h = S * 0.02;
        this.drawSpring();
        this.burstCoins();
        this.sparkle(T(0.12));
      },
      [],
      tb,
    );
    tl.to(this.lid.scale, { y: 0, duration: T(0.07), ease: 'power2.in' }, tb)
      .set(this.lid, { visible: false }, tb + T(0.07))
      .set(this.lidOpen, { visible: true }, tb + T(0.04))
      .fromTo(this.lidOpen.scale, { y: 0 }, { y: k * 1.14, duration: T(0.1), ease: 'power2.out' }, tb + T(0.04))
      .to(this.lidOpen.scale, { y: k, duration: T(0.4), ease: 'elastic.out(1, .4)' }, tb + T(0.14))
      .fromTo(this.lidOpen, { rotation: red ? 0 : 0.14 }, { rotation: 0, duration: T(0.55), ease: 'elastic.out(1.1, .35)' }, tb + T(0.04))
      .fromTo(this.hoard.scale, { y: k * 0.35 }, { y: k, duration: T(0.35), ease: 'back.out(3)' }, tb)
      .to(this.lock, { y: this.lock.y + (S * (CHEST.lockOpen - CHEST.lockClosed)) / 256, duration: T(0.5), ease: 'bounce.out' }, tb)
      .fromTo(this.lock, { rotation: -0.25 }, { rotation: 0, duration: T(0.6), ease: 'elastic.out(1.2, .3)' }, tb)
      .fromTo(this.rig.scale, { x: 1.14, y: 0.84 }, { x: 1, y: 1, duration: T(0.55), ease: 'elastic.out(1, .35)' }, tb)
      .fromTo(this.flash, { alpha: 1, width: S * 0.6, height: S * 0.6 }, { alpha: 0, width: S * 2.4, height: S * 2.4, duration: T(0.45), ease: 'power2.out' }, tb)
      .to(this.seam, { alpha: 0, duration: T(0.1) }, tb)
      .fromTo(this.rays, { alpha: 0 }, { alpha: 0.9, duration: T(0.1) }, tb)
      .fromTo(this.rays.scale, { x: 0, y: 0 }, { x: (S * 1.35) / this.rays.texture.width, y: (S * 1.35) / this.rays.texture.width, duration: T(0.5), ease: 'back.out(1.7)' }, tb)
      .to(this.rays, { alpha: 0.6, duration: T(0.6) }, tb + T(0.5));
    // 3) the skull springs up (stretched on the way, squashed where the spring catches it), sways and laughs
    tl.to(this.rise, { h: S * 0.92, duration: T(0.8), ease: 'elastic.out(1.1, .38)', onUpdate: () => this.drawSpring() }, tb + T(0.03))
      .fromTo(this.head.scale, { x: 0.55, y: 0.7 }, { x: red ? 1 : 0.88, y: red ? 1 : 1.18, duration: T(0.16), ease: 'power2.out' }, tb + T(0.03))
      .to(this.head.scale, { x: red ? 1 : 1.12, y: red ? 1 : 0.88, duration: T(0.1), ease: 'power2.inOut' }, tb + T(0.19))
      .to(this.head.scale, { x: 1, y: 1, duration: T(0.45), ease: 'elastic.out(1, .4)' }, tb + T(0.29))
      .to(this.head, { rotation: 0.2, duration: T(0.14), ease: 'sine.out' }, tb + T(0.4))
      .to(this.head, { rotation: -0.15, duration: T(0.22), ease: 'sine.inOut' })
      .to(this.head, { rotation: 0.09, duration: T(0.2), ease: 'sine.inOut' })
      .to(this.head, { rotation: 0, duration: T(0.2), ease: 'sine.inOut' })
      .to(this.jaw, { y: S * 0.035, duration: T(0.065), yoyo: true, repeat: 9, ease: 'sine.inOut' }, tb + T(0.42));
    return done(tl).then(() => {
      if (!this.destroyed) this.idle();
    });
  }

  /** Until the bonus starts: the skull bobs on its spring, the rays turn, the jaw now and then laughs. */
  private idle() {
    const S = this.S;
    const h = this.rise.h;
    this.track(
      gsap
        .timeline({ repeat: -1 })
        .to(this.head, { rotation: 0.07, duration: 0.45, ease: 'sine.out' })
        .to(this.head, { rotation: -0.07, duration: 0.9, ease: 'sine.inOut' })
        .to(this.head, { rotation: 0, duration: 0.45, ease: 'sine.in' }),
    );
    this.track(gsap.fromTo(this.rise, { h }, { h: h - S * 0.05, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut', onUpdate: () => this.drawSpring() }));
    this.track(gsap.to(this.rays, { rotation: 0.1, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    this.track(gsap.to(this.rays, { alpha: 0.4, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    this.track(gsap.timeline({ repeat: -1, repeatDelay: 1.1, delay: 0.5 }).to(this.jaw, { y: S * 0.03, duration: 0.07, yoyo: true, repeat: 5, ease: 'sine.inOut' }));
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    for (const a of this.anim) a.kill();
    this.anim = [];
    gsap.killTweensOf([this, this.rig, this.rig.scale, this.lid, this.lid.scale, this.lidOpen.scale, this.hoard.scale, this.lock, this.head, this.head.scale, this.jaw, this.rays, this.rays.scale, this.flash, this.seam, this.aura, this.rise]);
    super.destroy(options);
  }
}
