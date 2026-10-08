import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { T, done } from '../timing';

/** The hole's outline: a unit circle with enough points to stay round at any screen size. */
const HOLE_PTS = 256;
/** The black square around the unit hole reaches this many radii out. */
const REACH = 6000;

/**
 * Classic cartoon iris wipe: the picture closes to a circle on a point, then opens again.
 *
 * The black is one mesh built once: a huge square with a unit-circle hole cut from it. Each frame
 * only its scale changes (the hole's radius) and its position, so nothing is re-tessellated. When
 * the opening is tiny the square would no longer cover the screen, so a plain black sprite takes
 * over; when it is wider than the screen everything hides.
 */
export class Iris extends Container {
  private ring = new Graphics();
  private solid = new Sprite(Texture.WHITE);
  private st = { r: 0 };
  private cx = 0;
  private cy = 0;
  private W = 1;
  private H = 1;

  constructor() {
    super();
    const pts: number[] = [];
    for (let i = 0; i < HOLE_PTS; i++) {
      const a = (i / HOLE_PTS) * Math.PI * 2;
      pts.push(Math.cos(a), Math.sin(a));
    }
    this.ring.rect(-REACH, -REACH, REACH * 2, REACH * 2).fill({ color: 0x050404 });
    this.ring.poly(pts).cut();
    this.solid.tint = 0x050404;
    this.addChild(this.ring, this.solid);
    this.visible = false;
    this.eventMode = 'none';
  }

  resize(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  private draw() {
    const r = this.st.r;
    const far = this.maxR();
    if (r >= far) {
      this.ring.visible = this.solid.visible = false;
      return;
    }
    // the square reaches REACH * r: while that covers every corner the holed square does the job
    const covers = r * REACH >= far + 8;
    this.ring.visible = covers && r > 0.5;
    this.solid.visible = !this.ring.visible;
    if (this.ring.visible) {
      this.ring.position.set(this.cx, this.cy);
      this.ring.scale.set(r);
    } else {
      this.solid.position.set(0, 0);
      this.solid.width = this.W;
      this.solid.height = this.H;
    }
  }

  private maxR() {
    const dx = Math.max(this.cx, this.W - this.cx);
    const dy = Math.max(this.cy, this.H - this.cy);
    return Math.hypot(dx, dy) + 10;
  }

  /** Close onto (x, y). */
  close(x: number, y: number, dur = 0.7): Promise<void> {
    this.cx = x;
    this.cy = y;
    this.visible = true;
    this.st.r = this.maxR();
    this.draw();
    return done(
      gsap
        .timeline()
        .to(this.st, { r: Math.min(this.W, this.H) * 0.09, duration: T(dur * 0.72), ease: 'power2.in', onUpdate: () => this.draw() })
        .to({}, { duration: T(0.14) })
        .to(this.st, { r: 0, duration: T(dur * 0.2), ease: 'power1.in', onUpdate: () => this.draw() }),
    );
  }

  /** Open from (x, y). */
  open(x: number, y: number, dur = 0.7): Promise<void> {
    this.cx = x;
    this.cy = y;
    this.st.r = 0;
    this.visible = true;
    this.draw();
    return done(
      gsap.to(this.st, {
        r: this.maxR(),
        duration: T(dur),
        ease: 'power2.out',
        onUpdate: () => this.draw(),
        onComplete: () => {
          this.visible = false;
        },
      }),
    );
  }
}
