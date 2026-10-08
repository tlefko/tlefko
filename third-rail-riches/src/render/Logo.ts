import { Container, Sprite, Texture, type DestroyOptions } from 'pixi.js';
import { svgTexture, evict } from './textures';
import { logoSvg } from '../art/lettering';
import type { Rect } from './layout';

let seq = 0;

/**
 * Title lockup (track H): POWDER arched over a bigger KEG in carved wooden block letters with a
 * brass rim and a fire face, a lit fuse curling off the G, COVE burned into the parchment scroll and
 * the LIGHT THE FUSE tagline. Hand-built lettering (art/lettering.ts), no font: the whole lockup is
 * one SVG rasterised at the exact display size, so it is crisp at every size and nothing can be
 * clipped (the SVG's box holds every outline, extrusion and shadow). Small sizes get a simplified
 * variant with heavier outlines and no tagline, readable down to the portrait HUD logo.
 */
export class Logo extends Container {
  private sprite = new Sprite();
  private key = `logo${seq++}-`;
  private gen = 0;

  constructor() {
    super();
    this.addChild(this.sprite);
  }

  async layout(r: Rect, res: number) {
    const gen = ++this.gen;
    const w = Math.max(40, r.w);
    const h = Math.max(24, r.h);
    const id = `${this.key}${Math.round(w)}`;
    const tex = await svgTexture(id, logoSvg({ width: w, height: h }), w * res, h * res);
    if (gen !== this.gen || this.destroyed) return;
    this.sprite.texture = tex;
    this.sprite.width = w;
    this.sprite.height = h;
    this.position.set(r.x, r.y);
    // drop this logo's older rasters (other Logo instances keep their own)
    evict(this.key, new Set([tex.source.label]));
  }

  override destroy(options?: DestroyOptions) {
    this.gen++;
    this.sprite.texture = Texture.EMPTY; // never leave a sprite on a texture about to be freed
    super.destroy(options);
    evict(this.key, new Set());
  }
}
