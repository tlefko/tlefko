import { t } from '../i18n';
import { BitmapText, Container, RenderTexture, Sprite, type Texture } from 'pixi.js';
import gsap from 'gsap';
import type { Scene } from './Scene';
import { sound } from './sound';
import { T, wait, done, speed } from '../render/timing';
import { cellCenter, type Layout } from '../render/layout';
import { Wheel, segKindFor } from '../render/wheel/Wheel';
import { bitmapNum, displayText, type DisplayText, type NumTone } from '../render/text';
import { Iris } from '../render/overlays/Iris';
import { TitleCard, type CardSpec } from '../render/overlays/TitleCard';
import { BigWin, tierFor } from '../render/overlays/BigWin';
import { JackPop, buildJackTextures, type JackTextures } from '../render/overlays/JackPop';
import { quality } from '../render/quality';
import { RETRIGGER_SPINS } from '../math/model';
import { CHARGE_MAX, MAX_WIN, ROWS, TANTRUM_SIZE, type BonusKind, type Cluster, type Explosion, type RoundResult, type SpinResult, type Step, type ThrownBomb } from '../math/types';
import type { SymbolView } from '../render/grid/SymbolView';

export interface HudBridge {
  bonus(on: boolean, kind?: BonusKind): void;
  freeSpins(left: number, total: number): void;
  bonusTotal(multiple: number): void;
  spinWin(multiple: number): void;
}

export interface PresentCtx {
  fmt: (multiple: number) => string;
  auto: boolean;
  hud: HudBridge;
  /** Report the RGS book event index about to play (bonus progress, for resume). */
  progress?: (eventIndex: number) => void;
}

const MOOD: Record<BonusKind, { tint: number; alpha: number; music: string }> = {
  witching: { tint: 0x9fe6ff, alpha: 0.3, music: 'witching' },
};

export const BONUS_NAME: Record<BonusKind, () => string> = { witching: () => t('witchingHourCaps') };

const BLURB = {
  get witching() {
    return t('bonusBlurbWitching');
  },
  get inferno() {
    return t('bonusBlurbInferno');
  },
};

/** Where the bomb leaves the captain's hand (track C's throwBomb resolves with it). */
interface Release {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  size?: number;
}

/** The captain's bomb API (track C); optional so the game still plays against an older rig. */
/** Symbol win accents by symbol (docs/SOUNDS.md); none for the captain, keg, chest or bomb. */
const SYM_SFX = ['symAnchor', 'symShell', 'symMap', 'symCompass', 'symCrab', 'symOcto', 'symShark', 'symParrot'];

type LoopName = Parameters<typeof sound.loop>[0];
type PlayOpts = Parameters<typeof sound.play>[1];
const BOMB_SYM = 11;
const clamp15 = (n: number) => Math.min(5, Math.max(1, Math.round(n)));

interface BombHand {
  setCharge?(value: number, max: number): void;
  throwBomb?(): Promise<Release>;
  lookAt?(gx: number | null, gy?: number): void;
}

/**
 * Turns a RoundResult into motion. Every await here is a beat of the choreography; beats that
 * can overlap (labels flying, the board undimming, a refill under the smoke) are started without
 * waiting, so the board is never idle mid-round and never empty.
 */
export class Presenter {
  private iris = new Iris();
  private jackTex?: JackTextures;
  private jacks: JackPop[] = [];
  private waitingCard?: TitleCard;
  /** Running win shown on the bar (labels add to it as they land). */
  private barTotal = 0;
  /** Winning cascades in the current spin, and the medallion that counts them. */
  private combo = 0;
  private medal?: Container;
  private medalNum?: BitmapText;
  private prepareGen = 0;
  /** Charge that throws a bomb on the spin being shown. */
  private chargeMax = CHARGE_MAX;
  /** Lazy rasters only run when nothing is playing: not in a bonus, and a while after the last spin. */
  private inBonus = false;
  private quietSince = 0;

  /* ------------------------------------------------------------------ */
  /* sound funnel: every sound the presenter and the grid make goes      */
  /* through these (a QA shim can wrap them to record the calls)         */
  /* ------------------------------------------------------------------ */

  play(id: string, opts?: PlayOpts) {
    sound.play(id, opts);
  }
  loop(name: LoopName, on: boolean) {
    sound.loop(name, on);
  }
  duck(amount: number, seconds: number) {
    sound.duck(amount, seconds);
  }
  music(track: string, fade?: number) {
    sound.music(track, fade);
  }
  intensity(v: number) {
    sound.intensity(v);
  }

  /** Bomb loops that are on right now (only changes reach the funnel). */
  private loops = new Set<LoopName>();
  /** A slam silences the bomb loops for the rest of that spin. */
  private loopsMuted = false;
  /** Bombs of the blasts in progress that haven't gone off yet (id -> fuse): they still hiss. */
  private pendingBombs = new Map<number, number>();

  private setLoop(name: LoopName, on: boolean) {
    if (on === this.loops.has(name)) return;
    if (on) this.loops.add(name);
    else this.loops.delete(name);
    this.loop(name, on);
  }

  /**
   * The fuse hiss runs while any bomb on the board has a lit fuse; the red-hot sizzle from the moment
   * one goes hot until it blows. Read from the board itself, plus bombs winding up to blow.
   */
  private syncBombLoops() {
    let lit = 0;
    let hot = 0;
    for (const v of this.scene.grid.views) {
      if (!v || v.sym !== BOMB_SYM) continue;
      if ((v.cell.fuse ?? 1) <= 0) hot++;
      else lit++;
    }
    for (const f of this.pendingBombs.values()) {
      if (f <= 0) hot++;
      else lit++;
    }
    const mute = this.loopsMuted;
    this.setLoop('bombFuseLoop', !mute && lit > 0);
    this.setLoop('bombHotLoop', !mute && hot > 0);
  }

  /** Both bomb loops off (round end, slam, a card skipped, bonus exit, destroy). */
  private bombLoopsOff() {
    this.pendingBombs.clear();
    this.setLoop('bombFuseLoop', false);
    this.setLoop('bombHotLoop', false);
  }

  /** The grid's one-beat sounds (trace, growth, fuse ticks) come through the funnel too. */
  private hookGrid() {
    const grid = this.scene.grid;
    if (!grid) return;
    grid.sfx = (id, o) => {
      this.play(id, o);
      // the tick flips the view's fuse right after this call: re-read the loops once it has
      if (id === 'bombTick') queueMicrotask(() => this.syncBombLoops());
    };
    // the badge overlay rides just above the particles (numbers are never covered by sparks)
    const sh = this.scene.shake;
    const fx = this.scene.fx;
    if (fx.parent === sh) {
      const b = grid.badgeRoot;
      if (b.parent !== sh || sh.getChildIndex(b) !== sh.getChildIndex(fx) + 1) {
        b.removeFromParent();
        sh.addChildAt(b, sh.getChildIndex(fx) + 1);
      }
    }
  }

  /** Stop everything this presenter keeps running (loops); the owner calls it on teardown. */
  destroy() {
    this.bombLoopsOff();
    this.setLoop('anticipation', false);
    this.setLoop('wheelSpin', false);
  }

  constructor(private scene: Scene) {
    scene.overlay.addChild(this.iris);
    // symbol frame loops are rasterised lazily, only while the board is at rest, and uploaded at once
    scene.symTex.idleGate = () => !scene.busy && !this.inBonus && performance.now() - this.quietSince > 1500;
    scene.symTex.onLazy = (t) => this.upload(t);
  }

  async prepare() {
    const gen = ++this.prepareGen;
    const L = this.scene.L;
    const { S } = L;
    const res = this.scene.stage.resolution;
    this.hookGrid();
    this.iris.resize(L.W, L.H);
    const kit = this.scene.grid.kit.build(S, res);
    this.jackTex = await buildJackTextures(S, res);
    await kit;
    if (gen !== this.prepareGen) return;
    if (this.banner) this.banner.d.destroy();
    const d = this.paintBanner(RETRIGGER_SPINS);
    this.banner = { n: RETRIGGER_SPINS, d, k: d.scale.x };
    // the wheel's word labels (track C) for this layout's wheel size (the same D as wheel())
    this.warmGpu([d.texture, ...Wheel.prepare(L.S * 2.7)]);
    await this.prepareOverlays(gen, L, res);
  }

  /**
   * Title cards and the big win (track C) rasterise and upload everything they need now, so
   * entering a bonus or a big win never builds a texture mid-round. At boot this runs straight
   * away; after a resize it waits for a quiet board (a round never pays for it).
   */
  private prepareOverlays(gen: number, L: Layout, res: number): Promise<void> {
    const run = async () => {
      if (gen !== this.prepareGen) return;
      const coins = await BigWin.prepare(L.W, L.H);
      if (gen !== this.prepareGen) return;
      const floor = L.H - L.hudH;
      const cards = await TitleCard.prepare(L.W, L.H, res, floor, this.scene.stage.app.renderer);
      if (gen !== this.prepareGen) return;
      this.upload([...coins, ...cards]);
    };
    this.overlays = (this.scene.busy ? this.untilQuiet() : Promise.resolve()).then(run).catch(() => undefined);
    return this.overlays;
  }
  private overlays: Promise<void> = Promise.resolve();

  /** Resolves once no round is playing. */
  private untilQuiet(): Promise<void> {
    return new Promise((res) => {
      const check = () => (this.scene.busy ? window.setTimeout(check, 250) : res());
      check();
    });
  }

  /**
   * Upload every texture the choreography can reach (win frames, bomb art and badges, blast kit,
   * particles) to the GPU now, so the first blast or bomb of a session never hitches.
   */
  private warmGpu(extra: Texture[] = []) {
    const sc = this.scene;
    this.upload([...sc.symTex.all(), ...sc.grid.kit.all(), ...sc.fx.textures(), ...extra]);
  }

  /** Draw textures once off screen so they are on the GPU before anything animates with them. */
  private upload(texs: Texture[]) {
    const sc = this.scene;
    if (!texs.length || !sc.stage.app.renderer) return;
    const tmp = new Container();
    for (const tx of texs) {
      const s = new Sprite(tx);
      s.width = s.height = 4;
      tmp.addChild(s);
    }
    const rt = RenderTexture.create({ width: 8, height: 8 });
    try {
      sc.stage.app.renderer.render({ container: tmp, target: rt });
    } catch {
      /* a lost context re-uploads on first use anyway */
    }
    rt.destroy(true);
    tmp.destroy({ children: true });
  }

  /* ------------------------------------------------------------------ */
  /**
   * Present a round. `from` is the book event index the RGS saved for an unfinished round (a resumed
   * bonus, Stake's /bet/event): the free spins already shown are skipped and the bonus picks up at
   * that free spin, with its count and total as recorded (each spin carries its own start state).
   * Without it (a new play, a replay) the whole round plays.
   */
  async round(r: RoundResult, ctx: PresentCtx, from?: number): Promise<void> {
    try {
      const trig = r.trigger;
      const resumeAt = r.bonus && typeof from === 'number' && from >= 2 ? Math.min(from - 2, r.bonus.spins.length) : -1;
      if (resumeAt >= 0) {
        await this.bonus(r, ctx, resumeAt);
        return;
      }
      await this.spin(trig, ctx, false);
      if (trig.maxWin) {
        await this.maxWin(ctx);
        return;
      }
      if (r.bonus) {
        await this.fsTrigger(trig);
        await this.bonus(r, ctx);
      }
    } finally {
      this.bombLoopsOff();
      this.setLoop('anticipation', false);
      this.setLoop('wheelSpin', false);
    }
  }

  private get cap(): BombHand {
    return this.scene.captain as unknown as BombHand;
  }

  /* ------------------------------------------------------------------ */
  async spin(s: SpinResult, ctx: PresentCtx, inBonus: boolean): Promise<void> {
    const sc = this.scene;
    const { grid, winBar, reels, meter } = sc;
    sc.busy = true;
    // a slam (spin pressed mid-round) speeds up one spin; every spin, free spins included, starts at normal speed
    this.unslam();
    this.hookGrid();
    // the last board has gone (a spin always ends with every bomb blown)
    this.bombLoopsOff();
    winBar.format = ctx.fmt;
    winBar.reset(0, null);
    this.barTotal = 0;
    this.combo = 0;
    this.hideMedal();
    meter.set(s.meterStart, false);
    meter.setMult(s.multStart, false);
    const chargeMax = s.chargeMax || CHARGE_MAX;
    this.chargeMax = chargeMax;
    this.cap.setCharge?.(s.chargeStart ?? 0, chargeMax);
    sc.captain.react('idle');

    let anticipating = false;
    await grid.spinIn(s.initial, {
      onColumnLanded: (reel, last) => this.play(last ? 'reelStop' : 'reelDrop', { index: reel }),
      onSpecial: (v, kind, idx) => this.landed(v, kind, idx),
      onAnticipation: (rs, on) => {
        reels.setAnticipation(sc.L, rs, on ? 1 : 0);
        if (on === anticipating) return; // the held reels shrink as they land; the crew reacts once
        anticipating = on;
        this.setLoop('anticipation', on);
        this.intensity(on ? 1 : 0);
        sc.captain.react(on ? 'pray' : 'idle');
        sc.parrot.react(on ? 'worried' : 'idle');
      },
      onHeartbeat: () => reels.beat(),
    }, !inBonus);
    reels.setAnticipation(sc.L, [], 0);

    let total = 0;
    let chain = 0;
    let mult = s.multStart;
    let charge = s.chargeStart ?? 0;
    const flights: Promise<void>[] = [];
    let undim: Promise<void> = Promise.resolve();
    let slams: Promise<void> = Promise.resolve();
    for (let i = 0; i < s.steps.length; i++) {
      const step = s.steps[i];
      // 1-3: pay, ignite, remove
      if (step.clusters.length) {
        await slams;
        this.combo++;
        this.play('win', { index: i });
        // one accent per winning cluster (never per cell), a hair apart so equal ones don't phase
        step.clusters.forEach((c, k) => {
          const id = SYM_SFX[c.sym];
          if (id && k < 4) this.play(id, k ? { delay: 0.07 * k } : undefined);
        });
        sc.parrot.react('happy', 0.8);
        await grid.celebrate(step.clusters);
        if (step.ignited.length) {
          this.play('sixIgnite');
          sc.captain.react('cheer', 1);
          await grid.ignite(step.ignited);
        }
        // labels pop (and multipliers slam) over the winners; their flight to the bar runs on
        // while the board moves on, and each adds its pay to the bar as it lands
        const labels = step.clusters.map((c, k) => this.clusterLabel(c, ctx, k));
        if (this.combo >= 2) this.bumpMedal(this.combo);
        this.play('pop');
        // the board moves on while a multiplier slams into its label (it lands before the next win)
        await grid.pop(step.removed);
        slams = Promise.all(labels.map((l) => l.slammed)).then(() => undefined);
        flights.push(...labels.map((l) => l.landed));
        total += step.stepWin;
        undim = grid.undim();
      }
      // 4-5: blasts (kegs and bombs); charge fills per keg, the multiplier steps per bomb, and every
      // bomb left on the board swells a notch as each keg blast hits it (6: growth)
      const growth = step.growth ?? [];
      const growing: Promise<void>[] = [];
      const charged = (step.thrown ?? []).filter((b) => b.source === 'charge');
      // the captain winds up as soon as the keg that fills his charge blows (the flight waits for the refill)
      let windUp: Promise<Release> | null = null;
      if (step.explosions.length) {
        await Promise.all([undim, slams]);
        // bombs about to blow keep hissing until their own boom
        this.pendingBombs.clear();
        for (const ex of step.explosions) {
          const v = ex.bomb ? grid.bombView(ex.id) : undefined;
          if (v) this.pendingBombs.set(ex.id, v.cell.fuse ?? 1);
        }
        if (step.finale) await this.finale();
        let kegs = 0;
        await grid.blasts(step.explosions, {
          onBoom: (ex) => {
            chain++;
            if (ex.bomb) {
              mult += ex.bomb.size;
              const parent = step.explosions.find((p) => p.chain.includes(ex.id));
              flights.push(this.bombBoom(ex, chain, mult, !!parent?.bomb));
              this.pendingBombs.delete(ex.id);
              this.syncBombLoops();
            } else {
              charge++;
              kegs++;
              this.kegBoom(ex, chain);
              this.cap.setCharge?.(Math.min(charge, chargeMax), chargeMax);
              if (!windUp && charged.length && charge >= chargeMax) windUp = this.windUp(charged[0]);
              for (const g of growth) {
                const to = Math.min(g.to, g.from + kegs);
                growing.push(wait(T(0.08)).then(() => grid.growBomb(g.id, to)));
              }
            }
          },
        });
        this.pendingBombs.clear();
        this.syncBombLoops();
      }
      // anything a boom callback didn't reach (each growth plays its own bombGrow)
      if (growth.length) growing.push(grid.growBombs(growth));
      // 6: every surviving bomb's fuse ticks down; it runs on while the board refills
      const ticking = step.bombs?.length ? grid.tickFuses(step.bombs) : Promise.resolve();
      // 7: gravity, charge throws into the refill, the refill (the meter fills meanwhile); the
      // survivors start falling while the board is still lighting back up
      const filling = step.meterAfter > meter.value ? meter.fill(step.meterAfter, (n) => this.play('meterFlame', { index: n })) : Promise.resolve();
      const casc = grid.cascade(step, {
        onColumnLanded: (reel) => this.play('symbolFall', { index: reel }),
        onSpecial: (v) => {
          this.play('wildLand');
          sc.fx.embers(v.x, v.y, 4);
        },
      });
      const throws = charged.length ? this.chargeThrows(charged, windUp, step.chargeAfter) : Promise.resolve();
      if (!charged.length && typeof step.chargeAfter === 'number' && step.chargeAfter !== charge) this.cap.setCharge?.(step.chargeAfter, chargeMax);
      if (typeof step.chargeAfter === 'number') charge = step.chargeAfter;
      await Promise.all([casc, throws, undim, ticking, ...growing]);
      if (mult !== step.multAfter && typeof step.multAfter === 'number') {
        mult = step.multAfter;
        meter.setMult(mult);
      }
      await filling;
      // 8: the wheel (a bomb outcome is thrown after the reveal)
      if (step.wheel) {
        const cash = await this.wheel(step, total, ctx);
        total += cash;
        mult = step.wheel.multAfter;
      }
    }
    await slams;
    await Promise.all(flights);
    if (Math.abs(this.barTotal - s.spinWin) > 1e-9) await winBar.setValue(s.spinWin, 0.4);
    this.barTotal = s.spinWin;
    if (s.maxWin) winBar.reset(MAX_WIN, winBar.mult);
    if (this.combo >= 2) this.hideMedal(true);
    ctx.hud.spinWin(s.spinWin);
    this.bombLoopsOff();
    sc.busy = false;
    this.quietSince = performance.now();
  }

  /** A keg, chest or bomb touches down on the drop. */
  private landed(v: SymbolView, kind: 'six' | 'fs' | 'bomb', idx: number) {
    const sc = this.scene;
    if (kind === 'six') {
      this.play('wildLand');
      sc.fx.embers(v.x, v.y, 4);
    } else if (kind === 'bomb') {
      this.play('bombLand');
      this.syncBombLoops();
      sc.fx.sparks(v.x, v.y - sc.L.S * 0.3, 6, 0.7, -Math.PI / 2, 2);
      this.shake(0.25);
    } else {
      this.play('fsLand', { index: idx });
      gsap.fromTo(v, { rotation: -0.14 }, { rotation: 0, duration: T(0.5), ease: 'elastic.out(1.2, .3)' });
      sc.fx.burst(v.x, v.y, 8, 'white', 0.7);
      for (let i = 0; i < 3; i++) gsap.delayedCall(T(0.05 + i * 0.07), () => sc.fx.glint(v.x + (Math.random() - 0.5) * sc.L.S * 0.6, v.y - sc.L.S * (0.1 + Math.random() * 0.25), 0.36));
      this.shake(0.2);
    }
  }

  /** A Powder Keg boom: sound, shake, a camera punch at the blast, the crew flinches. */
  private kegBoom(ex: Explosion, n: number) {
    const sc = this.scene;
    const c = cellCenter(sc.L, Math.floor(ex.pos / ROWS), ex.pos % ROWS);
    this.play('explode', { index: Math.min(6, n) });
    this.play('blastDebris', { delay: 0.15 });
    this.shake(Math.min(1.6, 0.7 + n * 0.15));
    this.punch(c.x, c.y, 1);
    sc.captain.react('shock', 0.6);
  }

  /**
   * A Kaboom Bomb goes off: a bigger boom, the crew ducks, and the "+size" it adds flies from the
   * blast to the plunder seal, which then shows the new multiplier.
   */
  private bombBoom(ex: Explosion, _n: number, multAfter: number, byBomb = false): Promise<void> {
    const sc = this.scene;
    const b = ex.bomb!;
    const c = cellCenter(sc.L, Math.floor(ex.pos / ROWS), ex.pos % ROWS);
    const size = clamp15(b.size);
    if (b.cause === 'chain' && byBomb) {
      // set off by another bomb: the punchy chain take, with the full blast under the big ones
      this.play('bombChain');
      if (size >= 3) this.play('bombBlast', { index: size, volume: 0.7 });
    } else this.play('bombBlast', { index: size });
    if (size >= 4) this.duck(0.35, 1.2);
    this.play('blastDebris', { delay: 0.1 });
    this.shake(b.radius === 2 ? 2 : 1.5);
    this.punch(c.x, c.y, b.radius === 2 ? 1.8 : 1.4);
    sc.captain.react('duck', 0.9);
    sc.parrot.react('duck', 0.9);
    const S = sc.L.S;
    const lbl = bitmapNum(`+${b.size}`, 'fire', S * 0.7);
    const k = lbl.scale.x;
    lbl.position.set(c.x, c.y);
    lbl.scale.set(0);
    sc.labelLayer.addChild(lbl);
    const to = sc.meter.badgeCenter();
    return done(
      gsap
        .timeline()
        .to(lbl.scale, { x: k * 1.3, y: k * 1.3, duration: T(0.13), ease: 'back.out(3)' })
        .to(lbl, { y: c.y - S * 0.3, duration: T(0.18), ease: 'power2.out' }, 0)
        .to(lbl.scale, { x: k, y: k, duration: T(0.08) }),
    )
      .then(() => this.flyTo(lbl, to, 0.36, 0.06))
      .then(() => {
        this.play('boost', { index: Math.min(5, b.size) });
        sc.meter.setMult(multAfter);
      });
  }

  /**
   * The end-of-sequence step: the deck starts to shake and every bomb left heats up before they all
   * go (the blasts follow straight on). Shorter in turbo and when slammed, skipped under reduced motion.
   */
  private async finale(): Promise<void> {
    const sc = this.scene;
    this.play('endRumble');
    this.duck(0.25, 2);
    const dur = T(1.6);
    sc.grid.heatBombs(dur);
    sc.captain.react('shock', dur);
    sc.parrot.react('worried', dur);
    this.rumble(1.6);
    await wait(dur);
  }

  /** The captain looks at the target, winds up and throws (track C); resolves at the release. */
  private windUp(tb: ThrownBomb): Promise<Release> {
    const sc = this.scene;
    const c = cellCenter(sc.L, Math.floor(tb.pos / ROWS), tb.pos % ROWS);
    this.cap.lookAt?.(c.x, c.y);
    sc.parrot.react('watch', 1.4);
    if (this.cap.throwBomb) return this.cap.throwBomb();
    const b = sc.captain.getBounds();
    return Promise.resolve({ x: b.x + b.width * 0.7, y: b.y + b.height * 0.2 });
  }

  /**
   * Charge-thrown bombs land in the refill: the first one's wind-up may already be running (started
   * by the keg that filled the charge); each flies once the refill has started, into its empty cell.
   */
  private async chargeThrows(list: ThrownBomb[], first: Promise<Release> | null, after: number): Promise<void> {
    for (let i = 0; i < list.length; i++) {
      const from = await (i === 0 && first ? first : this.windUp(list[i]));
      await this.fly(list[i], from, i === list.length - 1 ? after : 0);
    }
  }

  /** One throw from the wheel (or anywhere without a wind-up running): wind-up, release, flight. */
  private async throwOne(tb: ThrownBomb, chargeAfter: number): Promise<void> {
    const from = await this.windUp(tb);
    await this.fly(tb, from, chargeAfter);
  }

  /** The bomb's flight from the captain's hand to its cell; the pips show what is left of the charge. */
  private async fly(tb: ThrownBomb, from: Release, chargeAfter: number): Promise<void> {
    const sc = this.scene;
    this.cap.setCharge?.(chargeAfter, this.chargeMax);
    await sc.grid.throwBomb(tb.cell, tb.pos, from, tb.replacedId, sc.labelLayer, () => {
      this.play('bombLand');
      this.syncBombLoops();
      this.shake(0.55);
      sc.captain.react('laugh', 0.8);
    });
    this.cap.lookAt?.(null);
  }

  /**
   * Label a paying cluster: base pay, then any multiplier slams in, then it flies to the bar.
   * `slammed` resolves once the final amount is showing; `landed` when it reaches the bar.
   */
  private clusterLabel(c: Cluster, ctx: PresentCtx, order = 0): { slammed: Promise<void>; landed: Promise<void> } {
    const sc = this.scene;
    const S = sc.L.S;
    const p = this.centroid(c.positions);
    const tone: NumTone = c.sym === 8 ? 'fire' : c.sym >= 4 ? 'gold' : 'white';
    const lbl = this.popLabel(ctx.fmt(c.basePay), p.x, p.y, tone);
    const slammed = (async () => {
      await wait(T(c.mult > 1 ? 0.16 : 0.1));
      if (c.mult > 1) {
        const m = bitmapNum(`x${c.mult}`, 'fire', S * 0.6);
        // a plunder multiplier flies out of the meter seal, so it reads as "this cluster x N"
        const fromBadge = sc.meter.mult > 1;
        const o = fromBadge ? sc.meter.badgeCenter() : { x: p.x + S * 0.95, y: p.y - S * 0.6 };
        m.position.set(o.x, o.y);
        sc.labelLayer.addChild(m);
        this.play('multMul');
        const km = m.scale.x;
        // pops up, winds back, then whips into the amount
        const back = { x: o.x + (o.x - p.x) * 0.08, y: o.y - S * 0.12 };
        await done(
          gsap
            .timeline()
            .from(m.scale, { x: 0, y: 0, duration: T(0.15), ease: 'back.out(3)' })
            .to(m, { x: back.x, y: back.y, duration: T(0.1), ease: 'power2.out' })
            .to(m, { x: p.x, y: p.y, duration: T(fromBadge ? 0.24 : 0.16), ease: 'power3.in' })
            .to(m.scale, { x: km * 0.8, y: km * 1.2, duration: T(0.1), ease: 'power2.in' }, '<'),
        );
        m.destroy();
        sc.fx.burst(p.x, p.y, 16, 'fire', 1);
        lbl.text = ctx.fmt(c.pay);
        const k = lbl.scale.x;
        gsap.fromTo(lbl.scale, { x: k * 1.55, y: k * 1.55 }, { x: k, y: k, duration: T(0.32), ease: 'back.out(3)' });
        this.shake(0.35);
        await wait(T(0.12));
      }
    })();
    // several labels leave one after another, so they never pile up on the bar
    const landed = slammed.then(() => this.flyTo(lbl, sc.winBar.mainCenter(), 0.4, 0.08 + order * 0.08)).then(() => {
      this.play('barTick');
      this.barTotal += c.pay;
      void sc.winBar.setValue(this.barTotal, 0.3);
    });
    return { slammed, landed };
  }

  /** The fuse is fully lit: the Captain's Wheel spins in the middle of the board. Returns doubloons won. */
  private async wheel(step: Step, _totalBefore: number, ctx: PresentCtx): Promise<number> {
    const sc = this.scene;
    const { grid, L, meter } = sc;
    const ws = step.wheel!;
    this.play('meterFull');
    sc.captain.react('shock', 1.2);
    // the board holds its breath while the fuse erupts: it darkens and rumbles
    const D = L.S * 2.7;
    const cx = L.grid.x + L.grid.w / 2;
    const cy = L.grid.y + L.grid.h / 2;
    grid.focus([]);
    gsap.to(sc.dimmer, { alpha: 0.3, duration: T(0.5) });
    this.rumble(0.9);
    await meter.erupt(Math.max(0, step.meterAfter - TANTRUM_SIZE));
    const w = new Wheel(sc.wheelTex, D);
    w.position.set(cx, cy);
    sc.wheelLayer.addChild(w);
    this.play('wheelAppear');
    sc.captain.react('pray');
    await w.appear();
    this.setLoop('wheelSpin', true);
    w.onTick = (i) => this.play('wheelTick', { index: i });
    await w.spin(segKindFor(ws.outcome));
    this.setLoop('wheelSpin', false);
    this.play('wheelLand');
    const o = ws.outcome;
    const label = o.kind === 'cash' ? `+${ctx.fmt(o.value)}` : o.kind === 'boost' ? `+${o.add}` : o.kind === 'hounds' ? t('hounds', { n: o.count }) : o.kind === 'bomb' ? `+${o.size}` : t('inferno');
    const tone: NumTone = o.kind === 'cash' ? 'gold' : o.kind === 'boost' ? 'fire' : o.kind === 'hounds' ? 'sea' : o.kind === 'bomb' ? 'fire' : 'crimson';
    const text = await w.reveal(label, tone);
    sc.fx.burst(cx, cy, 30, o.kind === 'hounds' ? 'white' : 'fire', 1.4);
    sc.captain.react('cheer', 1.2);
    await wait(T(0.3));
    const gp = text.getGlobalPosition();
    const lp = sc.labelLayer.toLocal(gp);
    const sx = text.scale.x * w.scale.x;
    text.removeFromParent();
    text.position.copyFrom(lp);
    text.scale.set(sx);
    sc.labelLayer.addChild(text);
    const collapse = w.collapse();
    gsap.to(sc.dimmer, { alpha: 0, duration: T(0.25) });
    grid.focus(null);
    let cash = 0;
    if (o.kind === 'cash') {
      this.play('cashGold');
      await this.flyTo(text, sc.winBar.mainCenter(), 0.45);
      cash = ws.cash;
      this.barTotal += cash;
      await sc.winBar.setValue(this.barTotal, 0.4);
    } else if (o.kind === 'boost') {
      this.play('boost', { index: ws.multAfter });
      await this.flyTo(text, sc.meter.badgeCenter(), 0.45);
      sc.meter.setMult(ws.multAfter);
    } else if (o.kind === 'bomb') {
      // KABOOM: the text burns off and the captain throws the wheel's bomb onto its cell
      gsap.to(text, { alpha: 0, duration: T(0.25), onComplete: () => text.destroy() });
      gsap.to(text.scale, { x: text.scale.x * 1.3, y: text.scale.y * 1.3, duration: T(0.25), ease: 'power1.out' });
      await collapse;
      const wb = (step.thrown ?? []).filter((b) => b.source === 'wheel');
      for (const tb of wb) await this.throwOne(tb, step.chargeAfter ?? 0);
    } else {
      gsap.to(text, { alpha: 0, duration: T(0.25), onComplete: () => text.destroy() });
      await collapse;
      if (o.kind === 'hounds') {
        sc.parrot.react('squawk', 1.4);
        this.play('howl');
        this.play('hounds', { index: o.count, delay: 0.3 });
        await grid.placeWilds(ws.placed, 'drop', () => {
          this.play('wildLand');
          this.shake(0.5);
        });
      } else {
        this.play('inferno');
        this.shake(1);
        await grid.placeWilds(ws.placed, 'sweep', () => this.play('wildLand'));
      }
    }
    await collapse;
    sc.captain.react('idle');
    return cash;
  }

  /* ------------------------------------------------------------------ */
  private centroid(positions: number[]) {
    const L = this.scene.L;
    let x = 0;
    let y = 0;
    for (const p of positions) {
      const c = cellCenter(L, Math.floor(p / ROWS), p % ROWS);
      x += c.x;
      y += c.y;
    }
    const n = Math.max(1, positions.length);
    return { x: x / n, y: y / n };
  }

  /** A win label pops over its cluster: springs up out of a flash, overshoots, settles. */
  private popLabel(text: string, x: number, y: number, tone: NumTone): BitmapText {
    const sc = this.scene;
    const S = sc.L.S;
    const lbl = bitmapNum(text, tone, S * 0.62);
    const k = lbl.scale.x;
    // keep the whole label on the board (a cluster at the edge must not push digits off it)
    const half = lbl.width * 0.62;
    const gx0 = sc.L.frame.x + half;
    const gx1 = sc.L.frame.x + sc.L.frame.w - half;
    lbl.position.set(gx0 < gx1 ? Math.max(gx0, Math.min(gx1, x)) : x, y + S * 0.12);
    sc.labelLayer.addChild(lbl);
    lbl.scale.set(0);
    sc.grid.blast.glow(x, y, S * 1.8, tone === 'fire' ? 0xff9a3a : 0xfff0b0, 0.55, 0.35);
    gsap
      .timeline()
      .to(lbl.scale, { x: k * 1.22, y: k * 1.22, duration: T(0.17), ease: 'back.out(2.6)' })
      .to(lbl, { y: y - S * 0.04, duration: T(0.24), ease: 'power2.out' }, 0)
      .to(lbl.scale, { x: k, y: k, duration: T(0.16), ease: 'sine.inOut' });
    return lbl;
  }

  /**
   * Arc a label into a target point: a small dip (anticipation), then it whips along a curve,
   * shrinking, trailing embers; a burst where it lands; then it's removed.
   */
  private flyTo(obj: Container, to: { x: number; y: number }, dur: number, hold = 0.14): Promise<void> {
    const from = { x: obj.x, y: obj.y };
    const S = this.scene.L.S;
    const ctrl = { x: (from.x + to.x) / 2 + (from.x < to.x ? -1 : 1) * S * 0.35, y: Math.min(from.y, to.y) - S * 1.2 };
    const p = { t: 0 };
    const s0 = obj.scale.x;
    let lastEmber = 0;
    return done(
      gsap
        .timeline()
        .to(obj, { y: from.y + S * 0.06, duration: T(hold), ease: 'sine.inOut' })
        .to(obj.scale, { x: s0 * 1.08, y: s0 * 0.92, duration: T(hold), ease: 'sine.inOut' }, 0)
        .call(() => {
          from.y = obj.y;
        })
        .to(p, {
          t: 1,
          duration: T(dur),
          ease: 'power1.in',
          onUpdate: () => {
            const t = p.t;
            const u = 1 - t;
            obj.x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
            obj.y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
            obj.scale.set(s0 * (1 - 0.55 * t) * (1 + 0.08 * Math.sin(t * Math.PI)), s0 * (1 - 0.55 * t));
            if (t - lastEmber > 0.06) {
              lastEmber = t;
              this.scene.fx.embers(obj.x, obj.y, 1);
            }
          },
          onComplete: () => {
            this.scene.fx.burst(to.x, to.y, 10, 'fire', 0.6);
            obj.destroy();
          },
        }),
    );
  }

  /* ------------------------------------------------------------------ */
  /* camera                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Screen shake, bounded so no text on the canvas (logo, win bar, fuse) is ever pushed off the
   * screen: the amplitude is capped by the smallest margin those elements have to the edges.
   */
  shake(power = 1) {
    if (speed.reduced) return;
    const s = this.scene.shake;
    const L = this.scene.L;
    const amp = Math.min(L.S * 0.06 * power, this.margin(L) * 0.8);
    if (amp < 0.5) return;
    gsap.killTweensOf(s.position);
    const tl = gsap.timeline({ onComplete: () => s.position.set(0, 0) });
    const n = quality.low ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const k = 1 - i / (n + 1);
      tl.to(s.position, { x: (Math.random() - 0.5) * amp * 2 * k, y: (Math.random() - 0.5) * amp * 2 * k, duration: 0.035 });
    }
    tl.to(s.position, { x: 0, y: 0, duration: 0.06 });
  }

  /** A slow low rumble (the fuse about to erupt). */
  private rumble(dur: number) {
    if (speed.reduced) return;
    const s = this.scene.shake;
    const L = this.scene.L;
    const amp = Math.min(L.S * 0.02, this.margin(L) * 0.5);
    const tl = gsap.timeline({ onComplete: () => s.position.set(0, 0) });
    const n = Math.round(T(dur) / 0.05);
    for (let i = 0; i < n; i++) tl.to(s.position, { x: (Math.random() - 0.5) * amp * 2 * (i / n), y: (Math.random() - 0.5) * amp * (i / n), duration: 0.05, ease: 'none' });
    tl.to(s.position, { x: 0, y: 0, duration: 0.05 });
  }

  /**
   * Camera punch: the stage kicks in toward (x, y) for a beat and springs back. The zoom is capped
   * so the canvas text nearest an edge (logo, win bar, fuse) and the board stay fully on screen,
   * with room left for the shake running at the same time. Overlapping punches share one zoom.
   */
  punch(x: number, y: number, power = 1) {
    if (speed.reduced) return;
    const L = this.scene.L;
    let k = 1 + 0.022 * power;
    const m = 3 + L.S * 0.06 * 1.6;
    for (const r of [L.logo, L.winBar, L.meter, L.frame]) {
      // scaling about (x, y) moves an edge e to x + (e - x) * k: keep every edge inside the screen
      if (r.x < x) k = Math.min(k, (x - m) / Math.max(1, x - r.x));
      if (r.x + r.w > x) k = Math.min(k, (L.W - m - x) / Math.max(1, r.x + r.w - x));
      if (r.y < y) k = Math.min(k, (y - m) / Math.max(1, y - r.y));
      if (r.y + r.h > y) k = Math.min(k, (L.H - m - y) / Math.max(1, r.y + r.h - y));
    }
    if (k <= 1.002) return;
    const z = this.zoom;
    z.x = x;
    z.y = y;
    gsap.killTweensOf(z);
    gsap
      .timeline({ onUpdate: () => this.applyZoom(), onComplete: () => this.applyZoom() })
      .to(z, { k: Math.max(k, z.k), duration: T(0.06), ease: 'power2.out' })
      .to(z, { k: 1, duration: T(0.36), ease: 'elastic.out(1, .5)' });
  }
  private zoom = { k: 1, x: 0, y: 0 };

  /** Scale the stage about the punch point: the pivot keeps that point fixed; the shake still owns position. */
  private applyZoom() {
    const s = this.scene.shake;
    const z = this.zoom;
    if (Math.abs(z.k - 1) < 1e-4) {
      s.scale.set(1);
      s.pivot.set(0, 0);
      return;
    }
    s.scale.set(z.k);
    s.pivot.set(z.x * (1 - 1 / z.k), z.y * (1 - 1 / z.k));
  }

  /** Smallest distance from any canvas text block to the screen edge (px). */
  private margin(L: Layout): number {
    let m = Infinity;
    for (const r of [L.logo, L.winBar, L.meter]) {
      m = Math.min(m, r.x, L.W - (r.x + r.w), r.y);
    }
    return Math.max(0, m);
  }

  /* ------------------------------------------------------------------ */
  /* cascade chain medallion                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The chain medallion hangs off the left end of the win bar from the second winning cascade on;
   * its count flips up with each new cascade.
   */
  private bumpMedal(n: number) {
    const sc = this.scene;
    const tex = sc.grid.kit.medal;
    if (!tex) return;
    const r = sc.winBar.displayBounds;
    const size = Math.min(r.h * 1.05, sc.L.S * 0.8);
    const x = r.x + size * 0.34;
    const y = r.y + r.h * 0.5 + size * 0.02;
    if (!this.medal) {
      const m = new Container();
      const face = new Sprite(tex);
      face.anchor.set(0.5, 0.53);
      face.width = face.height = size;
      m.addChild(face);
      m.position.set(x, y);
      sc.labelLayer.addChildAt(m, 0);
      this.medal = m;
      m.scale.set(0);
      gsap.to(m.scale, { x: 1, y: 1, duration: T(0.36), ease: 'back.out(2.6)' });
      gsap.fromTo(m, { rotation: -0.6 }, { rotation: 0, duration: T(0.55), ease: 'elastic.out(1, .5)' });
    } else {
      gsap.fromTo(this.medal.scale, { x: 1.28, y: 1.28 }, { x: 1, y: 1, duration: T(0.4), ease: 'back.out(3)' });
      gsap.fromTo(this.medal, { rotation: 0.25 }, { rotation: 0, duration: T(0.45), ease: 'elastic.out(1, .45)' });
    }
    const old = this.medalNum;
    const num = bitmapNum(`${n}`, 'white', size * 0.44);
    const k = num.scale.x;
    if (num.width > size * 0.5) num.scale.set(k * ((size * 0.5) / num.width));
    const kk = num.scale.x;
    num.position.set(0, size * 0.04);
    this.medal.addChild(num);
    this.medalNum = num;
    num.scale.set(kk, 0);
    gsap.to(num.scale, { y: kk, duration: T(0.22), ease: 'back.out(3)', delay: T(0.06) });
    if (old) gsap.to(old.scale, { y: 0, duration: T(0.06), ease: 'power2.in', onComplete: () => old.destroy() });
    sc.fx.burst(x, y, 8, 'white', 0.5);
  }

  private hideMedal(animate = false) {
    const m = this.medal;
    if (!m) return;
    this.medal = undefined;
    this.medalNum = undefined;
    gsap.killTweensOf(m);
    gsap.killTweensOf(m.scale);
    if (!animate) return void m.destroy({ children: true });
    gsap
      .timeline({ onComplete: () => m.destroy({ children: true }) })
      .to(m.scale, { x: 1.18, y: 1.18, duration: T(0.1), ease: 'power2.out', delay: T(0.25) })
      .to(m.scale, { x: 0, y: 0, duration: T(0.2), ease: 'back.in(2)' });
  }

  /* ------------------------------------------------------------------ */
  private async fsTrigger(s: SpinResult) {
    const sc = this.scene;
    if (!this.jackTex) return;
    this.play('bonusTrigger');
    sc.captain.react('cheer', 1.6);
    sc.parrot.react('happy', 1.6);
    // the chests take the stage: the board dims around them and they beat once more
    const chests = new Set(s.scatPositions);
    sc.grid.views.forEach((v, p) => v && !chests.has(p) && gsap.to(v, { alpha: 0.35, duration: T(0.3) }));
    sc.grid.heartbeat();
    await wait(T(0.3));
    const pops: Promise<void>[] = [];
    s.scatPositions.forEach((p: number, i: number) => {
      const v = sc.grid.views[p];
      const c = v ? { x: v.x, y: v.y } : cellCenter(sc.L, Math.floor(p / ROWS), p % ROWS);
      const j = new JackPop(this.jackTex!, sc.L.S);
      j.position.set(c.x, c.y);
      sc.labelLayer.addChild(j);
      this.jacks.push(j);
      pops.push(
        wait(T(i * 0.12)).then(() => {
          if (v) v.visible = false;
          return j.play();
        }),
      );
    });
    await Promise.all(pops);
    await wait(T(0.6));
  }

  private clearJacks() {
    for (const j of this.jacks) j.destroy({ children: true });
    this.jacks = [];
    for (const v of this.scene.grid.views)
      if (v) {
        v.visible = true;
        v.alpha = 1;
      }
  }

  /** Build a title card off screen (textures take a moment); show it once the iris has closed. */
  private card(spec: CardSpec): Promise<TitleCard> {
    const L = this.scene.L;
    const card = new TitleCard(L.W, L.H, spec, L.H - L.hudH);
    card.visible = false;
    this.scene.overlay.addChildAt(card, 0);
    return card.build(this.scene.stage.resolution).then(() => card);
  }

  private async bonus(r: RoundResult, ctx: PresentCtx, start = 0) {
    this.inBonus = true;
    try {
      await this.bonusFlow(r, ctx, start);
    } finally {
      this.inBonus = false;
      this.quietSince = performance.now();
    }
  }

  private async bonusFlow(r: RoundResult, ctx: PresentCtx, start = 0) {
    const sc = this.scene;
    const b = r.bonus!;
    const kind = b.kind;
    const mood = MOOD[kind];
    const gc = { x: sc.L.grid.x + sc.L.grid.w / 2, y: sc.L.grid.y + sc.L.grid.h / 2 };
    this.play('iris');
    const inferno = r.kind === 'buy_inferno';
    if (start > 0) {
      // a resumed bonus: straight back in, no intro card
      await this.iris.close(gc.x, gc.y, 0.5);
      this.music(mood.music, 1.2);
    } else {
      const closing = this.iris.close(gc.x, gc.y, 0.8);
      const building = this.overlays.then(() => this.card({
        palette: inferno ? [0x5a1a08, 0x2a0b04] : [0x123a52, 0x061426],
        kicker: t('youWon'),
        title: inferno ? t('infernoHourCaps') : BONUS_NAME[kind](),
        titleTone: inferno ? 'fire' : 'sea',
        big: t('freeSpinsCaps', { n: b.awarded }),
        bigTone: 'gold',
        body: inferno ? BLURB.inferno : BLURB.witching,
        cta: ctx.auto ? '' : t('tapToBegin'),
        captain: inferno ? 'laugh' : 'smug',
        parrot: 'happy',
      }));
      const [card] = await Promise.all([building, closing]);
      card.visible = true;
      this.play('bonusIntro');
      this.music(mood.music, 1.2);
      await this.iris.open(gc.x, gc.y, 0.7);
      this.waitingCard = card;
      await card.waitTap(ctx.auto ? 3 : 0);
      this.waitingCard = undefined;
      this.unslam();
      this.play('uiClick');
      this.play('iris');
      await this.iris.close(gc.x, gc.y, 0.6);
      card.destroy();
    }
    this.clearJacks();
    sc.setMood(kind);
    ctx.hud.bonus(true, kind);
    // the count and the total as they stood before free spin `start` (a resume skips the ones shown)
    let left = b.awarded - start + b.retriggers.filter((x) => x.afterSpin < start).reduce((a, x) => a + x.added, 0);
    let total = r.trigger.spinWin + b.spins.slice(0, start).reduce((a, x) => a + x.spinWin, 0);
    ctx.hud.freeSpins(left, b.awarded);
    ctx.hud.bonusTotal(total);
    sc.winBar.reset(0, null);
    await this.iris.open(gc.x, gc.y, 0.7);

    let played = start;
    for (let i = start; i < b.spins.length; i++) {
      const s = b.spins[i];
      left--;
      played++;
      ctx.hud.freeSpins(left, b.awarded);
      ctx.progress?.(2 + i);
      await this.spin(s, ctx, true);
      total += s.spinWin;
      ctx.hud.bonusTotal(total);
      const re = b.retriggers.find((x) => x.afterSpin === i);
      if (re) {
        left += re.added;
        await this.retrigger(re.added);
        ctx.hud.freeSpins(left, b.awarded);
      }
      if (s.maxWin) break;
      await wait(T(0.3));
    }
    if (r.maxWin) {
      await this.maxWin(ctx);
    }
    const final = r.totalWin;
    ctx.hud.bonusTotal(final);
    await wait(T(0.5));
    this.play('iris');
    const closing2 = this.iris.close(gc.x, gc.y, 0.7);
    const tier = tierFor(final);
    const building2 = this.card({
      palette: inferno ? [0x4a1606, 0x1f0903] : [0x10304a, 0x05101f],
      kicker: tier >= 0 ? [t('bigWin'), t('megaWin'), t('epicWin'), t('unholyWin')][tier] : t('bonusOver', { name: inferno ? t('infernoHourCaps') : BONUS_NAME[kind]() }),
      title: t('totalWinCaps'),
      titleTone: 'white',
      big: ctx.fmt(0),
      bigTone: 'gold',
      body: played === 1 ? t('spinsPlayedOne') : t('spinsPlayed', { n: played }),
      cta: ctx.auto ? '' : t('tapToContinue'),
      captain: final > 0 ? 'laugh' : 'shock',
      parrot: final > 0 ? 'happy' : 'squawk',
    });
    const [end] = await Promise.all([building2, closing2]);
    end.visible = true;
    this.play('bonusEnd');
    await this.iris.open(gc.x, gc.y, 0.6);
    // count the total up on the card
    const cnt = { v: 0 };
    await done(
      gsap.to(cnt, {
        v: final,
        duration: T(Math.min(4, 1 + Math.log10(1 + final))),
        ease: 'power2.out',
        onUpdate: () => {
          end.setBig(ctx.fmt(cnt.v));
          if (Math.random() < 0.3) this.play('barTick');
        },
      }),
    );
    end.setBig(ctx.fmt(final));
    if (final >= 20) sc.fx.coins(sc.L.W / 2, sc.L.H * 1.02, 40, 2, 1.2);
    this.waitingCard = end;
    await end.waitTap(ctx.auto ? 2.5 : 0);
    this.waitingCard = undefined;
    this.unslam();
    this.play('uiClick');
    this.play('iris');
    await this.iris.close(gc.x, gc.y, 0.6);
    end.destroy();
    sc.setMood(null);
    ctx.hud.bonus(false);
    sc.winBar.reset(0, null);
    this.cap.setCharge?.(0, CHARGE_MAX);
    this.bombLoopsOff();
    this.music('base', 1.2);
    await this.iris.open(gc.x, gc.y, 0.7);
  }

  /**
   * The "+N FREE SPINS" banner, in track H's display lettering. A retrigger always adds
   * RETRIGGER_SPINS, so that banner is painted at prepare time (boot, resize) and reused; any other
   * count would be painted on the spot.
   */
  private paintBanner(n: number): DisplayText {
    const L = this.scene.L;
    const d = displayText(t('plusFreeSpins', { n }), { size: L.S * 0.62, tone: 'sea', treatment: 'banner', res: this.scene.stage.resolution });
    // fitted inside the board with room for the entrance overshoot (x1.12)
    const maxW = L.frame.w * 0.86;
    d.scale.set(Math.min(1, maxW / (Math.max(1, d.inkWidth) * 1.12)));
    d.visible = false;
    return d;
  }
  private banner?: { n: number; d: DisplayText; k: number };

  private async retrigger(added: number) {
    const sc = this.scene;
    const L = sc.L;
    this.play('retrigger');
    const own = this.banner?.n === added ? this.banner : undefined;
    const banner = own?.d ?? this.paintBanner(added);
    const k = own?.k ?? banner.scale.x;
    banner.visible = true;
    banner.alpha = 1;
    banner.rotation = 0;
    banner.position.set(L.grid.x + L.grid.w / 2, L.grid.y + L.grid.h / 2);
    sc.labelLayer.addChild(banner);
    sc.fx.burst(banner.x, banner.y, 18, 'white', 1.1);
    await done(
      gsap
        .timeline()
        .fromTo(banner.scale, { x: 0, y: 0 }, { x: k * 1.12, y: k * 1.12, duration: T(0.3), ease: 'back.out(2.4)' })
        .fromTo(banner, { rotation: -0.12 }, { rotation: 0, duration: T(0.5), ease: 'elastic.out(1, .5)' }, 0)
        .to(banner.scale, { x: k, y: k, duration: T(0.18), ease: 'sine.out' }, T(0.3))
        .to(banner, { alpha: 0, y: banner.y - L.S, duration: T(0.4) }, T(0.3 + 0.18 + 0.62)),
    );
    if (own && this.banner === own) {
      banner.visible = false;
      banner.removeFromParent();
      banner.scale.set(k);
    } else banner.destroy();
  }

  /** Big win overlay for a finished base round. */
  async bigWin(multiple: number, ctx: PresentCtx) {
    if (tierFor(multiple) < 0) return;
    const sc = this.scene;
    const bw = new BigWin(sc.L.W, sc.L.H, sc.fx);
    sc.overlay.addChild(bw);
    sc.captain.react('dance');
    sc.parrot.react('happy');
    this.play('bigWinStart');
    this.music('bigwin', 0.3);
    await bw.run(multiple, ctx.fmt, {
      onTier: () => this.play('bigWinTier'),
      onTick: () => this.play('barTick', { volume: 0.5 }),
      auto: ctx.auto,
    });
    this.play('bigWinEnd');
    this.music('base', 1);
    sc.captain.react('idle');
    sc.parrot.react('idle');
  }

  private async maxWin(ctx: PresentCtx) {
    const sc = this.scene;
    this.shake(2);
    sc.fx.coins(sc.L.W / 2, sc.L.H * 1.02, 60, 2, 1.6);
    const bw = new BigWin(sc.L.W, sc.L.H, sc.fx);
    sc.overlay.addChild(bw);
    sc.captain.react('dance');
    this.play('maxWin');
    await bw.run(MAX_WIN, ctx.fmt, { onTier: () => this.play('bigWinTier'), auto: ctx.auto });
    sc.captain.react('idle');
  }

  /** Spin pressed while a title card waits: dismiss it (no speed-up). */
  skipCard(): boolean {
    const hit = this.waitingCard?.tap() ?? false;
    if (hit) this.bombLoopsOff();
    return hit;
  }

  /**
   * Speed up whatever is animating (player tapped spin again). Lasts for the current spin only:
   * running animations play 3x, delayed ones are pulled in and sped up too, and everything that
   * starts from now on is timed shorter (speed.slam).
   */
  slam() {
    speed.slam = 0.35;
    // the loops would outlast a hurried board: silence them for the rest of this spin
    this.loopsMuted = true;
    this.bombLoopsOff();
    const now = gsap.globalTimeline.time();
    for (const a of gsap.globalTimeline.getChildren(false, true, true)) {
      if (a.repeat() === -1 || a.totalDuration() > 30 || a.paused()) continue;
      if (a.isActive()) {
        a.timeScale(3);
        this.slammed.push(a);
      } else if (a.startTime() > now) {
        a.startTime(now + (a.startTime() - now) / 3);
        a.timeScale(3);
        this.slammed.push(a);
      }
    }
  }

  /** Back to normal speed: new animations and any sped-up ones still running. */
  unslam() {
    speed.slam = 1;
    this.loopsMuted = false;
    for (const a of this.slammed) a.timeScale(1);
    this.slammed = [];
  }
  private slammed: gsap.core.Animation[] = [];
}

export type { SymbolView, Sprite };
