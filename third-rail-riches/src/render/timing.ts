import gsap from 'gsap';

/** Presentation speed profiles. Every presentation duration goes through `T()`. */
export type SpeedMode = 'normal' | 'turbo' | 'super';

const FACTOR: Record<SpeedMode, number> = { normal: 1, turbo: 0.55, super: 0.28 };

export const speed = {
  mode: 'normal' as SpeedMode,
  /** Temporary boost while the player slams (taps spin again). */
  slam: 1,
  reduced: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};

export function T(seconds: number): number {
  return seconds * FACTOR[speed.mode] * speed.slam;
}

/** True in turbo / super turbo or while slammed: secondary flourishes may be skipped. */
export function brisk(): boolean {
  return speed.mode !== 'normal' || speed.slam < 1;
}

/**
 * Wait on the GSAP clock (not setTimeout): a beat of choreography pauses with the animation when
 * the tab is hidden, and a slam (which speeds up every running tween) shortens it too.
 */
export function wait(seconds: number): Promise<void> {
  if (seconds <= 0) return Promise.resolve();
  return new Promise((r) => {
    gsap.to({}, { duration: seconds, onComplete: r });
  });
}

/** Resolve when a GSAP tween/timeline finishes (typed as Promise<void>). */
export function done(anim: { then: (cb: () => void) => unknown }): Promise<void> {
  return new Promise((resolve) => {
    anim.then(() => resolve());
  });
}
