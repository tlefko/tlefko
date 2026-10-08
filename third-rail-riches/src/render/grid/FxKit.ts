import { Texture } from 'pixi.js';
import { svgTexture } from '../textures';
import { blastStar, shockRing, scorch, chainMedal } from '../../art/fx';

let glowRing: Texture | null = null;
/** Soft additive ring (heat wave behind the inked shockwave). Size-independent, made once. */
function glowRingTexture(): Texture {
  if (glowRing) return glowRing;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.18)');
  g.addColorStop(0.84, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.92, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  glowRing = Texture.from(c);
  return glowRing;
}

/**
 * Blast textures for the board (built at prepare time, never mid-animation): the cartoon blast
 * star, the inked shock ring, scorch decals, the soft heat ring and the cascade chain medal.
 */
export class FxKit {
  star?: Texture;
  ring?: Texture;
  scorch: Texture[] = [];
  glow = glowRingTexture();
  medal?: Texture;
  private gen = 0;

  async build(S: number, res: number) {
    const gen = ++this.gen;
    const [star, ring, s0, s1, s2, medal] = await Promise.all([
      svgTexture('gfx-star', blastStar(), S * 2.4 * res),
      svgTexture('gfx-ring', shockRing(), S * 3 * res),
      svgTexture('gfx-scorch0', scorch(1), S * 1.9 * res),
      svgTexture('gfx-scorch1', scorch(2), S * 1.9 * res),
      svgTexture('gfx-scorch2', scorch(3), S * 1.9 * res),
      svgTexture('gfx-medal', chainMedal(), S * 0.9 * res),
    ]);
    if (gen !== this.gen) return;
    this.star = star;
    this.ring = ring;
    this.scorch = [s0, s1, s2];
    this.medal = medal;
  }

  get ready() {
    return !!this.star;
  }

  all(): Texture[] {
    return [this.star, this.ring, ...this.scorch, this.glow, this.medal].filter((t): t is Texture => !!t);
  }
}
