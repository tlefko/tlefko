import { Container, Graphics } from 'pixi.js';
import { Stage, pickResolution } from '../render/app';
import { quality } from '../render/quality';
import { computeLayout, sceneLayout, type Layout } from '../render/layout';
import { Background } from '../render/scene/Background';
import { Reels } from '../render/grid/Reels';
import { GridView } from '../render/grid/GridView';
import { SymbolTextures } from '../render/grid/SymbolView';
import { WinBar } from '../render/winbar/WinBar';
import { TantrumMeter } from '../render/winbar/TantrumMeter';
import { Particles } from '../render/fx/Particles';
import { FilmOverlay } from '../render/fx/FilmOverlay';
import { Captain } from '../render/characters/Captain';
import { Parrot } from '../render/characters/Parrot';
import { Logo } from '../render/Logo';
import { buildWheelTextures, Wheel, type WheelTextures } from '../render/wheel/Wheel';
import { RenderTexture, Sprite, Container as PContainer } from 'pixi.js';
import { speed } from '../render/timing';

/**
 * Owns every display object and lays the stage out for the current viewport.
 */
export class Scene {
  stage = new Stage();
  L!: Layout;
  root = new Container();
  shake = new Container();
  bg = new Background();
  reels = new Reels();
  symTex = new SymbolTextures();
  fx = new Particles();
  grid!: GridView;
  winBar = new WinBar();
  meter = new TantrumMeter();
  captain = new Captain();
  parrot = new Parrot();
  logo = new Logo();
  chars = new Container();
  wheelLayer = new Container();
  labelLayer = new Container();
  overlay = new Container();
  dimmer = new Graphics();
  film = new FilmOverlay();
  wheelTex!: WheelTextures;
  busy = false;
  mood: 'tantrum' | 'witching' | 'limbo' | null = null;
  private ambientAcc = 0;
  private laidOut = 0;
  private lastRes = 0;
  /** The screen size the layout was made for (in the replay column, L.W is only the scene's part of it). */
  private laidFor = { W: 0, H: 0 };
  /** Time since the last round ended (ms); quality changes that need a re-raster wait for a quiet moment. */
  private idleMs = 0;
  private qualityDirty = false;
  onLayout?: (L: Layout) => void;

  async init(host: HTMLElement) {
    await this.stage.init(host);
    this.grid = new GridView(this.symTex, this.fx);
    // The crew stand in front of the hatch: drawn over the symbols (under the post finials), so a
    // throw or a lean that reaches across the frame's edge reads as depth, never as an arm behind the
    // board. Their layout envelopes keep every other pose clear of the reels (layout.ts).
    this.shake.addChild(this.bg, this.reels.back, this.grid, this.chars, this.reels.front, this.winBar, this.meter, this.logo, this.dimmer, this.wheelLayer, this.fx, this.labelLayer);
    this.chars.addChild(this.captain, this.parrot);
    this.captain.fx = this.fx;
    this.parrot.fx = this.fx;
    this.meter.fx = this.fx;
    this.root.addChild(this.shake, this.overlay, this.film);
    this.stage.app.stage.addChild(this.root);
    // Separate render groups: a structural change (a particle born, a symbol dropped in, a label
    // popped, a small graphic redrawn) rebuilds only its own group's draw list instead of the whole
    // scene's, and a screen shake moves a handful of group transforms instead of every object.
    for (const c of [this.bg, this.chars, this.grid, this.winBar, this.meter, this.wheelLayer, this.fx, this.labelLayer, this.overlay, this.film]) c.isRenderGroup = true;
    this.dimmer.alpha = 0;
    this.dimmer.visible = false;
    this.film.reduced = speed.reduced;
    this.applyLowFlags();
    await this.relayout();
    let t: number | undefined;
    const ro = new ResizeObserver(() => {
      this.fitInterim();
      clearTimeout(t);
      t = window.setTimeout(() => this.relayout(), 120);
    });
    ro.observe(host);
    this.stage.onFrame((dt) => this.update(dt));
    quality.onRenderChange(() => {
      this.applyLowFlags();
      this.qualityDirty = true;
    });
  }

  /** The cheap half of low quality, applied at once: no re-raster, just less per-frame work. */
  private applyLowFlags() {
    this.film.setLow(quality.low);
    this.bg.setLow(quality.low);
  }

  /**
   * The canvas resizes at once but the new layout needs its textures first: until then the old
   * composition is scaled to fit the new viewport and centred, instead of sitting misplaced in it.
   */
  private fitInterim() {
    const L = this.L;
    if (!L) return;
    const W = this.stage.app.screen.width;
    const H = this.stage.app.screen.height;
    const { W: W0, H: H0 } = this.laidFor;
    const k = Math.min(W / W0, H / H0);
    this.root.scale.set(k);
    this.root.position.set((W - W0 * k) / 2, (H - H0 * k) / 2);
  }

  /** `force`: lay out again at the same size (a Stake.us session switched the language at authenticate). */
  async relayout(force = false) {
    const W = this.stage.app.screen.width;
    const H = this.stage.app.screen.height;
    if (W < 10 || H < 10) return;
    // every texture is rebuilt for a new viewport anyway, so re-pick the pixel ratio for it too
    this.stage.setResolution(pickResolution());
    if (!force && this.L && this.laidFor.W === W && this.laidFor.H === H && this.stage.resolution === this.lastRes) {
      this.fitInterim(); // back to the size we are laid out for (a resize that came and went)
      return;
    }
    this.lastRes = this.stage.resolution;
    const L = computeLayout(W, H);
    const stamp = ++this.laidOut;
    const res = this.stage.resolution;
    const S = L.S;
    const needSymbols = Math.abs(this.symTex.size - S * res) > 2;
    await Promise.all([
      this.bg.layout(L, res),
      this.reels.layout(L, res),
      needSymbols ? this.symTex.build(S * res) : Promise.resolve(),
      this.winBar.layout(L.winBar, res),
      this.meter.layout(L.meter, res),
      this.fx.build(S, res),
      this.captain.build(L.captain.h, res),
      this.parrot.build(L.parrot.h, res),
      this.logo.layout(L.logo, res),
      buildWheelTextures(S * 2.35, res).then((t) => (this.wheelTex = t)),
    ]);
    if (stamp !== this.laidOut) return;
    this.L = L;
    this.laidFor = { W, H };
    sceneLayout.L = L;
    this.root.scale.set(1);
    this.root.position.set(0, 0);
    this.grid.layout(L);
    this.captain.position.set(L.captain.x, L.captain.y);
    this.captain.scale.x = L.captain.flip ? -1 : 1;
    this.parrot.position.set(L.parrot.x, L.parrot.y);
    this.parrot.scale.x = L.parrot.flip ? -1 : 1;
    this.dimmer.clear().rect(0, 0, W, H).fill({ color: 0x000000 });
    this.film.resize(W, H);
    this.onLayout?.(L);
  }

  /**
   * Render every rarely-seen visual once off-screen so shaders compile and textures upload at boot.
   * One group per render and `pause` (a frame at boot) between them, so no single frame carries
   * every upload and the loading screen keeps animating.
   */
  async warmup(extra: PContainer[] = [], pause: () => Promise<void> = () => Promise.resolve()) {
    const rt = RenderTexture.create({ width: 8, height: 8 });
    const draw = async (...items: PContainer[]) => {
      const tmp = new PContainer();
      for (const it of items) tmp.addChild(it);
      this.stage.app.renderer.render({ container: tmp, target: rt });
      tmp.destroy({ children: true });
      await pause();
    };
    const add = new Sprite(this.wheelTex.bulb);
    add.blendMode = 'add';
    await draw(new Wheel(this.wheelTex, this.L.S * 2.35), add);
    const sets = [...this.symTex.sets.values()];
    for (let i = 0; i < sets.length; i += 3) {
      const group: Sprite[] = [];
      for (const t of sets.slice(i, i + 3)) for (const tex of [t.idle, t.blink, t.win]) if (tex) group.push(new Sprite(tex));
      await draw(...group);
    }
    if (extra.length) await draw(...extra);
    this.fx.burst(0, 0, 6, 'fire');
    this.fx.poof(0, 0);
    this.fx.coins(0, 0, 3, 2);
    const holder = new PContainer();
    holder.addChild(this.fx);
    this.stage.app.renderer.render({ container: holder, target: rt });
    rt.destroy(true);
    this.shake.addChildAt(this.fx, this.shake.children.indexOf(this.wheelLayer) + 1);
    holder.destroy();
  }

  setMood(kind: 'tantrum' | 'witching' | 'limbo' | null) {
    this.mood = kind;
    this.bg.setBonusLight(kind);
  }

  update(dt: number) {
    this.idleMs = this.busy ? 0 : this.idleMs + dt;
    // a new pixel ratio means re-rasterising everything: never mid-round, only once things are quiet
    if (this.qualityDirty && this.L && this.idleMs > 1200) {
      this.qualityDirty = false;
      if (pickResolution() !== this.stage.resolution) void this.relayout();
    }
    // Pixi 8 still draws a batched sprite or graphic at alpha 0: the full-screen dimmer only renders while shown
    this.dimmer.visible = this.dimmer.alpha > 0.002;
    if (this.mood && this.L) {
      this.ambientAcc += dt;
      const every = (this.mood === 'tantrum' ? 55 : 110) * (quality.low ? 2 : 1);
      while (this.ambientAcc > every) {
        this.ambientAcc -= every;
        const x = Math.random() * this.L.W;
        this.fx.embers(x, this.L.H - this.L.hudH * 0.6, 1, this.mood !== 'tantrum');
      }
    }
    this.bg.update(dt);
    this.meter.update(dt);
    this.fx.update(dt);
    this.film.update(dt);
    this.captain.update(dt);
    this.parrot.update(dt);
    this.grid?.update(dt, this.busy);
    for (const w of this.wheelLayer.children) (w as unknown as { update?: (d: number) => void }).update?.(dt);
  }
}
