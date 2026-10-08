import { MAX_WIN } from './math/types';
import { loadLanguage, t, t as tr, num } from './i18n';
import '@fontsource/rye/400.css';
import '@fontsource/luckiest-guy/400.css';
import '@fontsource-variable/inter/index.css';
import './ui/base.css';
import './ui/hud.css';
import './ui/panels.css';
import { loadFonts, warmFonts } from './render/text';
import { Scene } from './game/Scene';
import { replayColumn } from './render/layout';
import { Controller } from './game/Controller';
import { Hud } from './ui/Hud';
import { openBuy, openAuto, openMenu, openInfo } from './ui/panels';
import { modalState } from './ui/Modal';
import { toast } from './ui/toast';
import { setSocial } from './ui/copy';
import { sound } from './game/sound';
import { IntroSplash, introSkipped, CoachMarks, coachSeen, LOGO_SWAP } from './render/overlays/IntroSplash';
import { TitleCard } from './render/overlays/TitleCard';
import { rasterCount } from './render/textures';
import { BigWin } from './render/overlays/BigWin';
import { env, isLive } from './stake/env';
import { DemoRgs, HttpRgs, RgsError, type Rgs } from './stake/rgs';
import { playRound } from './math/engine';
import { createRng } from './math/rng';
import gsap from 'gsap';

const boot = document.getElementById('boot')!;
type BootHooks = { __bootP?: (p: number, next?: number, ms?: number) => void; __bootSub?: (q: number) => void; __setTips?: (tips: string[]) => void; __tips?: string[] };
const bootWin = window as unknown as BootHooks;
/**
 * The boot phases, in order: where the loading screen's fuse stands when a phase starts, and how
 * long the phase takes on a mid-range phone (the fuse glides toward the next phase over that time;
 * index.html runs the glide on the compositor). The shares follow measured boot timings, so the
 * spark burns at an even pace instead of rushing and parking.
 */
const BOOT_PHASES = {
  lang: [0.3, 550],
  scene: [0.37, 3400],
  warm: [0.7, 900],
  session: [0.81, 800],
  splash: [0.91, 550],
} as const;
type BootPhase = keyof typeof BOOT_PHASES;
const ORDER = Object.keys(BOOT_PHASES) as BootPhase[];
/** Resolves after the next frame has painted. */
const nextFrame = (): Promise<void> => new Promise((res) => requestAnimationFrame(() => window.setTimeout(res, 0)));
/** Boot phases done so far on this device: actual vs expected time (sets the pace of the rest). */
const bootPace = { at: 0, phase: null as BootPhase | null, actual: 0, expected: 0 };
/**
 * Enter a boot phase, then let one frame paint so the fuse's glide is on the compositor before the
 * phase's heavy work. The expected times are scaled by how fast this device ran the phases so far,
 * so a fast desktop burns the fuse briskly and evenly and a slow phone slowly and evenly.
 */
const bootPhase = (ph: BootPhase): Promise<void> => {
  const now = performance.now();
  if (bootPace.phase) {
    bootPace.actual += now - bootPace.at;
    bootPace.expected += BOOT_PHASES[bootPace.phase][1];
  }
  bootPace.phase = ph;
  bootPace.at = now;
  const pace = bootPace.expected ? Math.min(2.5, Math.max(0.35, bootPace.actual / bootPace.expected)) : 1;
  const [p, ms] = BOOT_PHASES[ph];
  const nextPh = ORDER[ORDER.indexOf(ph) + 1];
  bootWin.__bootP?.(p, nextPh ? BOOT_PHASES[nextPh][0] : 0.97, ms * pace);
  return nextFrame();
};
const setProgress = (p: number) => bootWin.__bootP?.(Math.max(0, Math.min(1, p)));
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The fuse reaches the keg and it blows: the loading screen flashes out over the intro. `onFlash`
 * runs at the flash, so the splash's entrance starts under it (no empty frame between the two).
 */
function bootOut(onFlash: () => void): Promise<void> {
  return new Promise((res) => {
    setProgress(1);
    window.setTimeout(
      () => {
        boot.classList.add('boom');
        window.setTimeout(
          () => {
            boot.classList.add('gone');
            onFlash();
            res();
          },
          reducedMotion ? 0 : 170,
        );
        window.setTimeout(() => boot.remove(), 1000);
      },
      reducedMotion ? 0 : 420,
    );
  });
}

async function start() {
  await bootPhase('lang');
  await loadLanguage();
  // the loading screen's rotating tips, in the player's language (swapped in at once, no English first)
  const tips = (['tip1', 'tip2', 'tip3', 'tip4', 'tip6', 'tip5'] as const).map((k) => t(k, { max: num(MAX_WIN), mult: 10 }));
  if (bootWin.__setTips) bootWin.__setTips(tips);
  else bootWin.__tips = tips;
  void sound.load();
  const rgs: Rgs = isLive() ? new HttpRgs() : new DemoRgs();
  await loadFonts();
  await bootPhase('scene');
  // the scene build is mostly art rasters: the fuse follows the finished ones through this phase
  const r0 = { ...rasterCount };
  const sceneP = BOOT_PHASES.scene[0];
  const sceneNext = BOOT_PHASES.warm[0];
  const follow = window.setInterval(() => {
    const started = rasterCount.started - r0.started;
    if (started < 12) return;
    const frac = (rasterCount.done - r0.done) / started;
    bootWin.__bootSub?.(sceneP + (sceneNext - sceneP) * 0.92 * frac);
  }, 120);
  const scene = new Scene();
  const ctrl = new Controller(scene, rgs);
  await scene.init(document.getElementById('stage')!);
  window.clearInterval(follow);
  await bootPhase('warm');
  await warmFonts(scene.stage.app.renderer, nextFrame);
  await scene.warmup([], nextFrame);
  await bootPhase('session');

  const prefs = {
    music: ctrl.settings.get('music', true),
    sfx: ctrl.settings.get('sfx', true),
    setMusic(v: boolean) {
      this.music = v;
      ctrl.settings.set('music', v);
      sound.setMusic(v);
    },
    setSfx(v: boolean) {
      this.sfx = v;
      ctrl.settings.set('sfx', v);
      sound.setSfx(v);
    },
  };
  // first-spin coach marks, once per game: the first spin, a tap or a resize puts them away
  let dismissCoach = () => {};
  const hud = new Hud(document.getElementById('hud')!, {
    spin: () => {
      dismissCoach();
      ctrl.spinPressed();
    },
    betUp: () => ctrl.changeBet(1),
    betDown: () => ctrl.changeBet(-1),
    openBuy: () => !ctrl.busy && openBuy(ctrl),
    openMenu: () => openMenu(ctrl, prefs),
    openAuto: () => !ctrl.busy && openAuto(ctrl),
    stopAuto: () => ctrl.stopAuto(),
    cycleTurbo: () => ctrl.cycleTurbo(),
    disableFeature: () => undefined,
    // Express Pass switch (track H's HUD, which plays boostOn / boostOff): the Controller answers with hud.setBoost
    boost: (on) => ctrl.setBoost(on),
  });
  // replay on short landscape screens: the results column at the right (the scene is laid out left of it)
  const column = () => replayColumn(scene.stage.app.screen.width, scene.stage.app.screen.height);
  hud.layout(scene.L.portrait, scene.L.hudH, column());
  scene.winBar.format = ctrl.fmt;
  const beat = () => {
    const b = sound.beat();
    return b ? { phase: b.phase, bpm: b.bpm } : { phase: (performance.now() / 1000 / (60 / 90)) % 1, bpm: 90 };
  };
  scene.conductor.getBeat = beat;
  scene.rat.getBeat = beat;

  // session: authenticate (or load a replay) before the player sees anything playable
  let resumeRound = null;
  if (env.replay) {
    setSocial(env.social);
    hud.labels(false);
    await ctrl.presenter.prepare();
    await ctrl.replay(hud);
  } else {
    try {
      resumeRound = await ctrl.start(hud);
      // Stake.us is English only: a social jurisdiction from authenticate switches the loaded language to English
      if (setSocial(ctrl.jur.socialCasino || env.social)) {
        const tips = (['tip1', 'tip2', 'tip3', 'tip4', 'tip6', 'tip5'] as const).map((k) => t(k, { max: num(MAX_WIN), mult: 10 }));
        bootWin.__setTips?.(tips);
        await scene.relayout(true); // the scene's lettering (the fuse meter's plank) in English
      }
      hud.labels(ctrl.demo);
    } catch (e) {
      const msg = e instanceof RgsError && (e.code === 'ERR_IS' || e.code === 'ERR_ATE') ? t('errSession') : t('errConnect');
      boot.querySelector('.boot-title')!.textContent = msg;
      return;
    }
  }
  scene.winBar.reset(0, null);

  // demo QA hook
  if (env.debug && rgs.kind === 'demo') {
    (window as unknown as Record<string, unknown>).__ll = { scene, ctrl, rgs, forceBook: (id: number) => ((rgs as DemoRgs).forceBookId = id) };
  }

  await ctrl.presenter.prepare();
  // The splash is rebuilt on every resize. The replacement is built off screen and swapped in
  // only when ready (no blank frame), stale builds from a burst of resizes are dropped, and a tap
  // on whichever splash is showing starts the game. "Don't show again" (stored per game) leaves
  // only the PLAY tap that unlocks audio.
  const quick = introSkipped();
  // the welcome sting plays once, as soon as audio is up: at the first mouse press on the splash,
  // a tap on one of its controls, or the PLAY tap, whichever comes first (and only once the core
  // sound bank is decoded; a sting played before then is dropped)
  let introStingDone = false;
  const introSting = () => {
    if (introStingDone) return;
    introStingDone = true;
    void sound.decoded().then(() => sound.play('introSting'));
  };
  // Cap'n Kaboom and Sparks step up onto the splash above its shade, and go home at the handoff;
  // the splash's lockup flies into the game's logo spot, so the game's own logo waits hidden
  const cast = quick ? undefined : { conductor: scene.conductor, rat: scene.rat };
  const castHome = scene.conductor.parent;
  const castIdx = castHome ? [castHome.getChildIndex(scene.conductor), castHome.getChildIndex(scene.rat)] : [0, 1];
  // the win bar and the fuse meter wait too, so nothing of the HUD shows through behind the lockup
  const backstage = cast ? [scene.logo, scene.winBar, scene.meter] : [];
  for (const o of backstage) o.visible = false;
  let splash: IntroSplash | null = null;
  let splashGen = 0;
  let splashDone = false;
  let tapped!: () => void;
  const splashTap = new Promise<void>((res) => (tapped = res));
  const showSplash = async (intro: boolean) => {
    const gen = ++splashGen;
    const next = new IntroSplash({
      // (the replay column: the scene keeps left of it, the splash still covers the screen)
      L: column() ? { ...scene.L, W: scene.stage.app.screen.width } : scene.L,
      symTex: scene.symTex,
      renderer: scene.stage.app.renderer,
      quick,
      boost: !env.replay && ctrl.boostAllowed,
      index: splash?.index,
      intro,
      cast,
      onArm: () => void sound.unlock().then(introSting, () => undefined),
      sfx: (id) => sound.play(id),
    });
    await next.build(scene.stage.resolution);
    if (gen !== splashGen || splashDone) {
      next.destroy({ children: true });
      return;
    }
    void next.waitTap().then(() => tapped());
    const old = splash;
    splash = next;
    scene.overlay.addChild(next);
    next.activate();
    old?.destroy({ children: true });
  };
  await bootPhase('splash');
  await showSplash(true);
  let leaving: IntroSplash | null = null;
  const stopSplashFrames = scene.stage.onFrame((dt) => (splash ?? leaving)?.update(dt));
  // QA: the splash on screen (null once the game has it)
  const qa = (window as unknown as { __ll?: Record<string, unknown> }).__ll;
  if (qa) qa.splash = () => splash;
  scene.onLayout = (L) => {
    dismissCoach();
    hud.layout(L.portrait, L.hudH, column());
    void ctrl.presenter.prepare();
    if (splash) void showSplash(false);
  };
  // the HUD is hidden AND inert until the intro is over: an invisible spin button under
  // "TAP TO PLAY" used to start a round behind the splash, and the attract board then
  // dropped onto it (stuck, doubled symbols until a refresh)
  hud.el.style.opacity = '0';
  hud.el.style.pointerEvents = 'none';
  // inert, not just pointer-events: hud.css turns pointer events back on for the bar and its
  // buttons, and those invisible buttons sat on top of the PLAY plaque and the toggle
  hud.el.inert = true;
  ctrl.busy = true;
  await bootOut(() => splash?.intro());

  await new Promise<void>((resolve) => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        window.removeEventListener('keydown', onKey);
        void sound.unlock();
        resolve();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        splash?.step(e.code === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    void splashTap.then(() => {
      window.removeEventListener('keydown', onKey);
      resolve();
    });
  });
  // audio unlocks on this very gesture and the music starts when it is ready; the handoff below
  // never waits for it (AudioContext.resume can take a while on some devices)
  const audioReady = sound
    .unlock()
    .then(() => {
      sound.setMusic(prefs.music);
      sound.setSfx(prefs.sfx);
      sound.music('base', 1.5);
      introSting();
      void sound.decoded().then(() => sound.play('playSting'));
    })
    .catch(() => undefined);
  splashDone = true;
  const s0 = splash as IntroSplash | null;
  splash = null;
  leaving = s0;
  // The game's logo, win bar and fuse meter come back once the splash's lockup has landed on the
  // logo spot: before that it flies across the bar and the meter, and no lettering may ever sit
  // under a moving sprite. The splash lockup and the game's cross-fade in place.
  const home = () => {
    for (const o of backstage) {
      o.visible = true;
      gsap.fromTo(o, { alpha: 0 }, { alpha: 1, duration: o === scene.logo ? LOGO_SWAP : 0.35, ease: 'power1.inOut' });
    }
  };
  const fade = s0?.close({ logo: cast ? scene.L.logo : undefined, onLogoHome: home });
  hud.el.style.transition = 'opacity .4s cubic-bezier(.4,0,.2,1)';
  hud.el.style.opacity = '1';
  // an attract board (not a result) under the splash, then any unfinished round resumes
  const attract = playRound({ kind: 'base', rng: createRng((Math.random() * 2 ** 31) | 0), record: true });
  // the board drops in as the shade lifts (with its sounds, once audio is up)
  await Promise.race([audioReady, new Promise((r) => setTimeout(r, 150))]);
  if (!env.replay) await scene.grid.spinIn(attract.trigger.grid, new Set(), { onColumnLanded: (c, last) => sound.play(last ? 'reelStop' : 'reelDrop', { index: c }) }, false);
  await fade;
  // the crew and the logo are the game's again
  if (s0) {
    s0.releaseCast();
    if (cast && castHome && !castHome.destroyed) {
      castHome.addChildAt(scene.conductor, Math.min(castIdx[0], castHome.children.length));
      castHome.addChildAt(scene.rat, Math.min(castIdx[1], castHome.children.length));
    }
    leaving = null;
    s0.destroy({ children: true });
  }
  scene.conductor.fx = scene.fx;
  scene.rat.fx = scene.fx;
  for (const o of backstage) {
    // (in case the flight was cut short)
    o.visible = true;
    if (!gsap.isTweening(o)) o.alpha = 1;
  }
  hud.el.style.pointerEvents = '';
  hud.el.inert = false;
  ctrl.busy = false;
  stopSplashFrames();
  if (resumeRound) await ctrl.resume(resumeRound);
  // (QA pages, ?debug, see them only with &coach, so other tracks' captures stay clean)
  else if (!coachSeen() && !env.replay && (!env.debug || new URLSearchParams(location.search).has('coach'))) void showCoach();

  async function showCoach() {
    const coach = new CoachMarks(scene.L, CoachMarks.targets(scene.L, scene.stage.app.canvas, ctrl.boostAllowed));
    await coach.build(scene.stage.resolution);
    if (coach.destroyed || ctrl.busy || scene.overlay.children.some((c) => c instanceof TitleCard || c instanceof BigWin)) {
      coach.destroy({ children: true });
      return;
    }
    scene.overlay.addChild(coach);
    coach.show();
    for (let i = 0; i < coach.count; i++) sound.play('coachPop', { delay: 0.15 + i * 0.35 });
    const timer = window.setTimeout(() => dismissCoach(), 9000);
    // any round start puts them away too (spin key, autoplay, a buy, dev hooks), and they never
    // share the screen with a title card or a big win
    const blocked = () => ctrl.busy || scene.overlay.children.some((c) => c instanceof TitleCard || c instanceof BigWin);
    const stopWatch = scene.stage.onFrame(() => blocked() && dismissCoach());
    dismissCoach = () => {
      window.removeEventListener('pointerdown', dismissCoach, true);
      clearTimeout(timer);
      stopWatch();
      coach.dismiss();
      dismissCoach = () => {};
    };
    window.addEventListener('pointerdown', dismissCoach, true);
  }

  window.addEventListener('keydown', (e) => {
    if (modalState.open || env.replay) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    if (e.code === 'Space' && !e.shiftKey) {
      if (ctrl.jur.disabledSpacebar) return;
      e.preventDefault();
      dismissCoach();
      if (!e.repeat) ctrl.spinPressed();
      return;
    }
    if (!e.shiftKey) return;
    if (e.code === 'ArrowUp') (e.preventDefault(), ctrl.changeBet(1));
    else if (e.code === 'ArrowDown') (e.preventDefault(), ctrl.changeBet(-1));
    else if (e.code === 'KeyB' && !ctrl.busy && !ctrl.jur.disabledBuyFeature) openBuy(ctrl);
    else if (e.code === 'KeyA' && !ctrl.jur.disabledAutoplay) ctrl.busy ? ctrl.stopAuto() : openAuto(ctrl);
    else if (e.code === 'KeyT') ctrl.cycleTurbo();
    else if (e.code === 'KeyI') openInfo(ctrl);
    else if (e.code === 'KeyS') prefs.setSfx(!prefs.sfx);
    else if (e.code === 'KeyM') prefs.setMusic(!prefs.music);
  });
  document.addEventListener('visibilitychange', () => document.hidden && sound.duck(1, 0.2));
  if (rgs.kind === 'live') window.addEventListener('online', () => toast(t('connectionRestored')));
}

start().catch(() => {
  const t = boot.querySelector('.boot-title');
  if (t) t.textContent = tr('errLoad');
});
