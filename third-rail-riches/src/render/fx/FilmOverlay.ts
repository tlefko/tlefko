import { Container, Sprite, Texture, TilingSprite, Graphics } from 'pixi.js';
import { canvasTexture, freeTexture } from '../textures';

/**
 * Old-cartoon film treatment: animated grain (24 fps), soft vignette and the odd dust fleck. Pure sprites, so it costs almost nothing.
 * Low quality keeps only the vignette: no grain pass over the whole screen, no dust.
 */
export class FilmOverlay extends Container {
  private grainFrames: Texture[] = [];
  private grain: TilingSprite;
  private vignette = new Sprite();
  private flicker = new Graphics();
  private scratches = new Graphics();
  private acc = 0;
  private frame = 0;
  private w = 1;
  private h = 1;
  private low = false;
  reduced = false;

  constructor() {
    super();
    this.eventMode = 'none';
    for (let i = 0; i < 4; i++) this.grainFrames.push(noiseTexture(256, i));
    this.grain = new TilingSprite({ texture: this.grainFrames[0], width: 16, height: 16 });
    this.grain.alpha = 0.075;
    // the flicker layer is never shown (exposure flicker read as tearing): keep it out of the render
    this.flicker.visible = false;
    this.addChild(this.vignette, this.grain, this.flicker, this.scratches);
  }

  /** Low quality: vignette only. */
  setLow(low: boolean) {
    this.low = low;
    this.grain.visible = !low;
    this.scratches.visible = !low;
    if (low) this.scratches.clear();
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.grain.width = w;
    this.grain.height = h;
    freeTexture(this.vignette.texture);
    this.vignette.texture = canvasTexture(Math.min(1024, w / 2), Math.min(1024, h / 2), (ctx) => {
      const cw = ctx.canvas.width;
      const ch = ctx.canvas.height;
      const g = ctx.createRadialGradient(cw / 2, ch * 0.46, Math.min(cw, ch) * 0.28, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, 'rgba(0,0,0,.35)');
      g.addColorStop(1, 'rgba(0,0,0,.82)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    });
    this.vignette.width = w;
    this.vignette.height = h;
    this.flicker.clear().rect(0, 0, w, h).fill({ color: 0x000000 });
    this.flicker.alpha = 0;
  }

  update(dtMs: number) {
    if (this.low) return;
    this.acc += dtMs;
    if (this.acc < 1000 / 24) return;
    this.acc = 0;
    this.frame++;
    this.grain.texture = this.grainFrames[this.frame % this.grainFrames.length];
    this.grain.tilePosition.set((Math.random() * 256) | 0, (Math.random() * 256) | 0);
    // no exposure flicker or full-height scratches: on modern displays they read as screen tearing
    this.scratches.clear();
    if (this.reduced) return;
    if (Math.random() < 0.06) {
      const x = Math.random() * this.w;
      const y = Math.random() * this.h;
      this.scratches.circle(x, y, 1 + Math.random() * 1.5).fill({ color: 0xf4efe3, alpha: 0.18 });
    }
  }
}

function noiseTexture(size: number, seed: number): Texture {
  let s = (seed + 1) * 99991;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return canvasTexture(size, size, (ctx) => {
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}
