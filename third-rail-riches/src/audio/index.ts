/**
 * Powder Keg Cove audio runtime.
 *
 * A small Web Audio player for the pre-rendered assets in public/audio (built by tools/audio-lab;
 * Tone.js is only used offline, never at runtime). SFX live in two sprite banks, music tracks are
 * gapless loops with pre/post-roll so AudioBufferSourceNode loopStart/loopEnd sit on exact bar
 * boundaries (see docs/AUDIO.md).
 *
 * Safe to call anything before init(): setters and music()/loop()/intensity() are remembered and
 * applied once the context exists; play()/duck() are no-ops. No AudioContext is created until
 * init() runs (call it from the first user gesture).
 */
import { AUDIO_SR, AUDIO_VERSION, BANKS, SOUNDS, TRACKS, VARIANTS, type BankId, type TrackInfo } from './manifest';

export type SfxName =
  | 'uiClick' | 'uiToggle' | 'uiOpen' | 'uiClose' | 'betUp' | 'betDown' | 'spinPress' | 'buy' | 'error'
  | 'reelDrop' | 'reelStop' | 'symbolFall' | 'sixLand' | 'sixIgnite' | 'fsLand' | 'anticipationStart' | 'anticipationEnd'
  | 'win' | 'pop' | 'cascade' | 'wheelAppear' | 'wheelTick' | 'wheelLand' | 'howl'
  | 'cashBronze' | 'cashSilver' | 'cashGold' | 'multAdd' | 'multMul' | 'maxWin'
  | 'barTick' | 'barApply' | 'bonusTrigger' | 'bonusIntro' | 'bonusEnd' | 'retrigger'
  | 'bigWinStart' | 'bigWinTier' | 'bigWinEnd' | 'iris' | 'coin'
  // original rules: Powder Kegs, the fuse meter, Captain's Wheel outcomes
  | 'explode' | 'blastDebris' | 'meterFlame' | 'meterFull' | 'hounds' | 'inferno' | 'boost' | 'wildLand';
export type Track = 'base' | 'tantrum' | 'witching' | 'limbo' | 'bigwin' | 'none';
export type LoopName = 'anticipation' | 'wheelSpin' | 'bombFuseLoop' | 'bombHotLoop';

export interface PlayOptions {
  /** Playback rate (pitch). Omit to get a tiny random variation on frequent sounds. */
  rate?: number;
  /** Linear gain multiplier, default 1. */
  volume?: number;
  /** Stereo position -1..1. */
  pan?: number;
  /**
   * Variation or step. Stepped (rising) sounds: fsLand 1..6, win 0..7 (per cascade), bigWinTier 0..3,
   * explode 1..6 (chain position), meterFlame 1..10, hounds 1..5 (count), boost = multiplier level
   * 2..20 (nearest step at or below). Past the last step the pitch keeps rising a semitone per step
   * (max +5). For other sounds it picks a variation.
   */
  index?: number;
  /** Seconds from now. */
  delay?: number;
}

export interface BeatInfo {
  bpm: number;
  /** Beat inside the bar (0-based integer). */
  beat: number;
  /** 0..1 position inside the current beat (0 = on the beat). */
  phase: number;
  /** Bar inside the track's loop (0-based integer). */
  bar: number;
}

// ------------------------------------------------------------------------------------------------
// Per-sound runtime behaviour (hand-tuned; no re-render needed to change these)
interface SfxParams {
  voices: number; // max simultaneous instances of this sound (oldest is stolen)
  minGap: number; // seconds; repeats closer than this are merged (avoids phasing stacks)
  jitter: number; // random +-rate variation when no rate is given
  gain: number;
  priority: number; // global voice stealing prefers lower priority
  duck?: [amount: number, seconds: number]; // automatic music duck
}
const DEFAULTS: SfxParams = { voices: 3, minGap: 0.015, jitter: 0, gain: 1, priority: 1 };
const PARAMS: Partial<Record<SfxName, Partial<SfxParams>>> = {
  uiClick: { voices: 2, minGap: 0.03, jitter: 0.02 },
  uiToggle: { voices: 2, minGap: 0.04 },
  betUp: { voices: 2, minGap: 0.03 },
  betDown: { voices: 2, minGap: 0.03 },
  spinPress: { voices: 1, minGap: 0.08 },
  reelDrop: { voices: 6, minGap: 0.02, jitter: 0.025 },
  reelStop: { voices: 2, minGap: 0.05 },
  symbolFall: { voices: 4, minGap: 0.035, jitter: 0.05, priority: 0 },
  pop: { voices: 5, minGap: 0.03, jitter: 0.04 },
  cascade: { voices: 2, minGap: 0.06, jitter: 0.03 },
  coin: { voices: 8, minGap: 0.018, jitter: 0.04, priority: 0 },
  wheelTick: { voices: 3, minGap: 0.012, jitter: 0.02, priority: 0 },
  barTick: { voices: 2, minGap: 0.022, jitter: 0.03, priority: 0 },
  win: { voices: 3, minGap: 0.05 },
  fsLand: { voices: 3, minGap: 0.04 },
  sixLand: { voices: 3, minGap: 0.04 },
  sixIgnite: { voices: 3, minGap: 0.05 },
  cashBronze: { voices: 3, minGap: 0.04 },
  cashSilver: { voices: 2, minGap: 0.05 },
  howl: { voices: 1, minGap: 0.3, priority: 2 },
  bonusTrigger: { voices: 1, minGap: 0.3, priority: 3, duck: [0.45, 1.6] },
  bonusIntro: { voices: 1, minGap: 0.3, priority: 3, duck: [0.5, 2.2] },
  bonusEnd: { voices: 1, minGap: 0.3, priority: 3, duck: [0.5, 2.4] },
  bigWinStart: { voices: 1, minGap: 0.2, priority: 3, duck: [0.4, 1.6] },
  bigWinTier: { voices: 2, minGap: 0.15, priority: 3, duck: [0.35, 1.2] },
  bigWinEnd: { voices: 1, minGap: 0.2, priority: 3, duck: [0.4, 2] },
  maxWin: { voices: 1, minGap: 0.5, priority: 4, duck: [0.7, 3.5] },
  multMul: { voices: 2, priority: 2, duck: [0.25, 0.8] },
  barApply: { voices: 2, priority: 2, duck: [0.25, 0.8] },
  explode: { voices: 4, minGap: 0.04, jitter: 0.015, priority: 2 },
  blastDebris: { voices: 4, minGap: 0.03, jitter: 0.06, priority: 0 },
  meterFlame: { voices: 3, minGap: 0.03, priority: 0 },
  meterFull: { voices: 1, minGap: 0.4, priority: 3, duck: [0.45, 1.4] },
  hounds: { voices: 2, minGap: 0.1, priority: 2 },
  inferno: { voices: 2, minGap: 0.1, priority: 2, duck: [0.25, 0.9] },
  boost: { voices: 2, minGap: 0.08, priority: 2 },
  wildLand: { voices: 4, minGap: 0.03, jitter: 0.02 },
};
/** Sounds whose index is a rising step (clamped, then pitched up a little past the last step). */
const STEPPED = new Set<string>(['fsLand', 'win', 'bigWinTier', 'explode', 'meterFlame', 'hounds', 'boost', 'bombGrow', 'bombBlast', 'capChargePip']);

const MAX_VOICES = 32;
const DEFAULT_FADE = 0.9;
const LOOP_FADE_IN = 0.12;
const LOOP_FADE_OUT = 0.25;

// ------------------------------------------------------------------------------------------------
type Ctx = AudioContext;
interface Voice {
  name: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  end: number;
  priority: number;
}
interface LoopVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
}
interface MusicVoice {
  track: Exclude<Track, 'none'>;
  info: TrackInfo;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
  stemGain: GainNode | null;
  stopped: boolean;
}
interface ClockState {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  period: number; // seconds per loop
  anchorTime: number; // clock seconds at which the content position was anchorPos
  anchorPos: number; // content seconds from the loop's first downbeat
  source: 'ctx' | 'perf';
}

let ctx: Ctx | null = null;
let baseUrl: string | null = null;

// graph
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let tensionFilter: BiquadFilterNode | null = null;
let tensionGain: GainNode | null = null;
let duckGain: GainNode | null = null;
let musicEnableGain: GainNode | null = null;
let sfxEnableGain: GainNode | null = null;

// settings (remembered before init)
let musicOn = true;
let sfxOn = true;
let volume = 1;
let tension = 0;
let desiredTrack: Track = 'none';
let pendingFade = DEFAULT_FADE;
const loopWanted: Record<LoopName, boolean> = { anticipation: false, wheelSpin: false, bombFuseLoop: false, bombHotLoop: false };

// assets
const banks: Partial<Record<BankId, AudioBuffer>> = {};
const bankLoads: Partial<Record<BankId, Promise<void>>> = {};
const fileBytes = new Map<string, Promise<ArrayBuffer>>();
const trackBuffers = new Map<string, AudioBuffer>();
const trackDecodes = new Map<string, Promise<AudioBuffer>>();

// playback state
const voices: Voice[] = [];
const lastStart = new Map<string, number>();
const lastVariant = new Map<string, number>();
const loops: Partial<Record<LoopName, LoopVoice>> = {};
let current: MusicVoice | null = null;
let musicToken = 0;
let duckUntil = 0;
let duckDepth = 0;
let baseResumePos = 0;
let clock: ClockState = defaultClock();

let resolveReady: () => void = () => {};
const ready: Promise<void> = new Promise<void>((r) => (resolveReady = r));

// ------------------------------------------------------------------------------------------------
// helpers
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mod = (a: number, n: number) => ((a % n) + n) % n;
const hasDoc = () => typeof document !== 'undefined';
const isHidden = () => hasDoc() && document.visibilityState === 'hidden';

function defaultClock(): ClockState {
  const t = TRACKS.base;
  const bpm = t?.bpm ?? 90;
  const beatsPerBar = t?.beatsPerBar ?? 4;
  const bars = t?.bars ?? 16;
  return { bpm, beatsPerBar, bars, period: (bars * beatsPerBar * 60) / bpm, anchorTime: 0, anchorPos: 0, source: 'perf' };
}

function assetUrl(file: string): string {
  if (baseUrl === null) {
    const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
    baseUrl = `${env?.BASE_URL ?? './'}audio/`;
  }
  return `${baseUrl}${file}?v=${AUDIO_VERSION}`;
}

/** Hold an AudioParam at its current value, then ramp linearly to `target`. */
function rampTo(p: AudioParam, target: number, seconds: number, at?: number): void {
  if (!ctx) return;
  const now = at ?? ctx.currentTime;
  const hold = (p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }).cancelAndHoldAtTime;
  if (hold) hold.call(p, now);
  else {
    const v = p.value;
    p.cancelScheduledValues(now);
    p.setValueAtTime(v, now);
  }
  if (seconds <= 0) p.setValueAtTime(target, now);
  else p.linearRampToValueAtTime(target, now + seconds);
}

function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const c = ctx;
  if (!c) return Promise.reject(new Error('no audio context'));
  return new Promise<AudioBuffer>((resolve, reject) => {
    // callback form for old Safari, promise form everywhere else
    const p = c.decodeAudioData(bytes, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

function fetchBytes(file: string): Promise<ArrayBuffer> {
  let p = fileBytes.get(file);
  if (!p) {
    const attempt = () =>
      fetch(assetUrl(file)).then((r) => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.arrayBuffer();
      });
    p = attempt().catch(() => attempt());
    p.catch(() => fileBytes.delete(file));
    fileBytes.set(file, p);
  }
  return p;
}

function loadBank(id: BankId): Promise<void> {
  const info = BANKS[id];
  if (!info) return Promise.resolve();
  let p = bankLoads[id];
  if (!p) {
    p = fetchBytes(info.file)
      .then((b) => decode(b.slice(0)))
      .then((buf) => {
        banks[id] = buf;
        applyLoops();
      })
      .catch(() => {
        // a failed bank stays silent and can be retried on the next load
        delete bankLoads[id];
      });
    bankLoads[id] = p;
  }
  return p;
}

function trackBuffer(file: string): Promise<AudioBuffer> {
  const have = trackBuffers.get(file);
  if (have) return Promise.resolve(have);
  let p = trackDecodes.get(file);
  if (!p) {
    p = fetchBytes(file)
      .then((b) => decode(b.slice(0)))
      .then((buf) => {
        trackBuffers.set(file, buf);
        trackDecodes.delete(file);
        return buf;
      });
    p.catch(() => trackDecodes.delete(file));
    trackDecodes.set(file, p);
  }
  return p;
}

/** Keep decoded PCM only for what is likely to be needed (decoded music is large). */
function evictTracks(): void {
  const keep = new Set<string>();
  for (const id of ['base', 'bigwin', desiredTrack, current?.track]) {
    const t = id && id !== 'none' ? TRACKS[id] : undefined;
    if (!t) continue;
    keep.add(t.file);
    for (const f of Object.values(t.stems)) keep.add(f);
  }
  for (const f of [...trackBuffers.keys()]) if (!keep.has(f)) trackBuffers.delete(f);
}

// ------------------------------------------------------------------------------------------------
// context + graph
function buildGraph(c: Ctx): void {
  master = c.createGain();
  master.gain.value = volume * volume;
  // safety limiter; the pre-gain offsets the compressor's automatic make-up gain
  const pre = c.createGain();
  pre.gain.value = 0.89;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  master.connect(pre);
  pre.connect(limiter);
  limiter.connect(c.destination);

  sfxEnableGain = c.createGain();
  sfxEnableGain.gain.value = sfxOn ? 1 : 0;
  sfxEnableGain.connect(master);
  sfxBus = c.createGain();
  sfxBus.connect(sfxEnableGain);

  musicEnableGain = c.createGain();
  musicEnableGain.gain.value = musicOn ? 1 : 0;
  musicEnableGain.connect(master);
  duckGain = c.createGain();
  duckGain.connect(musicEnableGain);
  tensionGain = c.createGain();
  tensionGain.connect(duckGain);
  tensionFilter = c.createBiquadFilter();
  tensionFilter.type = 'lowpass';
  tensionFilter.frequency.value = 20000;
  tensionFilter.Q.value = 0.5;
  tensionFilter.connect(tensionGain);
  musicBus = c.createGain();
  musicBus.connect(tensionFilter);
}

function unlock(c: Ctx): void {
  // iOS: play a 1-sample silent buffer inside the gesture
  try {
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {
    /* ignore */
  }
}

let gestureArmed = false;
function armGestureResume(): void {
  if (gestureArmed || !hasDoc()) return;
  gestureArmed = true;
  const go = () => {
    gestureArmed = false;
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.removeEventListener(ev, go, true);
    if (ctx && ctx.state !== 'running' && !isHidden()) void ctx.resume().catch(() => {});
  };
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, go, true);
}

function resumeIfVisible(): void {
  if (!ctx || isHidden() || ctx.state === 'running') return;
  ctx.resume().catch(() => armGestureResume());
  // Safari may leave the context "interrupted" without rejecting; retry on the next gesture
  setTimeout(() => {
    if (ctx && ctx.state !== 'running' && !isHidden()) armGestureResume();
  }, 300);
}

function installLifecycle(c: Ctx): void {
  if (!hasDoc()) return;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (isHidden()) void ctx.suspend().catch(() => {});
    else resumeIfVisible();
  });
  window.addEventListener('pagehide', () => void ctx?.suspend().catch(() => {}));
  window.addEventListener('pageshow', () => resumeIfVisible());
  c.addEventListener('statechange', () => {
    if (ctx && ctx.state !== 'running' && !isHidden()) armGestureResume();
  });
}

function startLoading(): void {
  const base = TRACKS.base;
  const core = loadBank('core');
  const firstMusic = base ? trackBuffer(base.file).catch(() => undefined) : Promise.resolve();
  void Promise.allSettled([core, firstMusic]).then(() => {
    resolveReady();
    void applyMusic(pendingFade);
    void loadBank('extra');
    // warm the compressed bytes of everything else (small), decode big-win eagerly (short loop)
    for (const t of Object.values(TRACKS)) {
      void fetchBytes(t.file).catch(() => {});
      for (const f of Object.values(t.stems)) void fetchBytes(f).catch(() => {});
    }
    if (TRACKS.bigwin) void trackBuffer(TRACKS.bigwin.file).catch(() => {});
  });
}

// ------------------------------------------------------------------------------------------------
// clock
function clockNow(source: ClockState['source']): number {
  if (source === 'ctx' && ctx) {
    if (ctx.state === 'running' && typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        return ts.contextTime + Math.max(0, performance.now() - ts.performanceTime) / 1000;
      }
    }
    return Math.max(0, ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0));
  }
  return typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
}

function setClock(info: TrackInfo, when: number, pos: number): void {
  clock = {
    bpm: info.bpm,
    beatsPerBar: info.beatsPerBar,
    bars: info.bars,
    period: (info.loopEnd - info.loopStart) / AUDIO_SR,
    anchorTime: when,
    anchorPos: pos,
    source: 'ctx',
  };
}

function contentPos(): number {
  return mod(clockNow(clock.source) - clock.anchorTime + clock.anchorPos, clock.period);
}

// ------------------------------------------------------------------------------------------------
// music
function stemLevel(): number {
  return Math.sin(clamp01(tension) * Math.PI * 0.5);
}

function startSources(m: MusicVoice, bufs: AudioBuffer[], when: number, pos: number): void {
  const c = ctx;
  if (!c) return;
  const ls = m.info.loopStart / AUDIO_SR;
  const le = m.info.loopEnd / AUDIO_SR;
  bufs.forEach((buf, i) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = ls;
    src.loopEnd = le;
    if (i === 0) src.connect(m.gain);
    else if (m.stemGain) src.connect(m.stemGain);
    src.start(when, ls + mod(pos, le - ls));
    m.sources.push(src);
  });
}

function stopMusicVoice(m: MusicVoice, fade: number): void {
  if (!ctx || m.stopped) return;
  m.stopped = true;
  const now = ctx.currentTime;
  rampTo(m.gain.gain, 0, Math.max(0.02, fade), now);
  for (const s of m.sources) {
    try {
      s.stop(now + Math.max(0.02, fade) + 0.05);
    } catch {
      /* already stopped */
    }
  }
  const sources = m.sources;
  const gain = m.gain;
  setTimeout(() => {
    for (const s of sources) s.disconnect();
    gain.disconnect();
    evictTracks();
  }, (fade + 0.3) * 1000);
}

async function applyMusic(fade: number): Promise<void> {
  const c = ctx;
  if (!c || !musicBus) return;
  const want = desiredTrack;
  const token = ++musicToken;
  if (current && current.track === want && !current.stopped) return;
  if (want === 'none') {
    if (current) {
      if (current.track === 'base') baseResumePos = contentPos();
      stopMusicVoice(current, fade);
    }
    current = null;
    return;
  }
  const info = TRACKS[want];
  if (!info) return;
  let bufs: AudioBuffer[];
  try {
    bufs = await Promise.all([trackBuffer(info.file), ...Object.values(info.stems).map((f) => trackBuffer(f))]);
  } catch {
    return; // music is optional; the game plays on without it
  }
  if (token !== musicToken || !ctx || !musicBus) return; // superseded while loading
  const old = current;
  if (old && old.track === 'base') baseResumePos = contentPos();
  const gain = c.createGain();
  gain.connect(musicBus);
  const m: MusicVoice = { track: want, info, gain, sources: [], stemGain: null, stopped: false };
  if (Object.keys(info.stems).length) {
    m.stemGain = c.createGain();
    m.stemGain.gain.value = stemLevel();
    m.stemGain.connect(gain);
  }
  // base resumes at the start of the 4-bar phrase it was in; everything else starts at bar 1
  const period = (info.loopEnd - info.loopStart) / AUDIO_SR;
  const phrase = (4 * info.beatsPerBar * 60) / info.bpm;
  const pos = want === 'base' ? mod(Math.floor(baseResumePos / phrase) * phrase, period) : 0;
  const when = c.currentTime + 0.04;
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(1, when + Math.max(0.01, fade));
  if (musicOn) startSources(m, bufs, when, pos);
  if (old) stopMusicVoice(old, fade);
  current = m;
  setClock(info, when, pos);
  updateTension();
  evictTracks();
}

function restartCurrentSources(): void {
  // music re-enabled: restart the current track where its clock says it should be
  const c = ctx;
  if (!c || !current || current.stopped || current.sources.length) return;
  const m = current;
  const bufs = [trackBuffers.get(m.info.file), ...Object.values(m.info.stems).map((f) => trackBuffers.get(f))];
  if (bufs.some((b) => !b)) return;
  const when = c.currentTime + 0.03;
  const pos = mod(when - clock.anchorTime + clock.anchorPos, clock.period);
  rampTo(m.gain.gain, 0, 0, c.currentTime);
  m.gain.gain.linearRampToValueAtTime(1, when + 0.3);
  startSources(m, bufs as AudioBuffer[], when, pos);
}

function stopCurrentSources(): void {
  if (!ctx || !current) return;
  // after the 0.15 s enable-gain fade has finished
  const t = ctx.currentTime + 0.25;
  for (const s of current.sources) {
    try {
      s.stop(t);
    } catch {
      /* ignore */
    }
  }
  current.sources = [];
}

// ------------------------------------------------------------------------------------------------
// tension (Witching Hour stem + anticipation)
function updateTension(): void {
  if (!ctx || !tensionFilter || !tensionGain) return;
  const t = 0.25;
  if (current?.stemGain) rampTo(current.stemGain.gain, stemLevel(), t);
  const antic = loops.anticipation;
  if (antic) {
    rampTo(antic.filter.frequency, 1500 * Math.pow(8, tension), 0.2);
    rampTo(antic.src.playbackRate, 1 + 0.12 * tension, 0.3);
    rampTo(antic.gain.gain, 0.8 + 0.2 * tension, 0.2);
  }
  // under the anticipation bed the music recedes (not in Witching Hour, whose stem is the tension)
  const lvl = loopWanted.anticipation && current?.track !== 'witching' ? tension : 0;
  rampTo(tensionFilter.frequency, 20000 * Math.pow(1600 / 20000, lvl), 0.25);
  rampTo(tensionGain.gain, 1 - 0.35 * lvl, 0.25);
}

// ------------------------------------------------------------------------------------------------
// loops
function applyLoops(): void {
  (Object.keys(loopWanted) as LoopName[]).forEach(applyLoop);
}

function applyLoop(name: LoopName): void {
  const c = ctx;
  if (!c || !sfxBus) return;
  const want = loopWanted[name] && sfxOn;
  const cur = loops[name];
  if (want && !cur) {
    const info = SOUNDS[name];
    const buf = info ? banks[info.bank] : undefined;
    if (!info || !buf || info.loopStart === undefined || info.loopEnd === undefined) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = info.loopStart / AUDIO_SR;
    src.loopEnd = info.loopEnd / AUDIO_SR;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = name === 'anticipation' ? 1500 * Math.pow(8, tension) : 20000;
    src.playbackRate.value = name === 'anticipation' ? 1 + 0.12 * tension : 1;
    const gain = c.createGain();
    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(name === 'anticipation' ? 0.8 + 0.2 * tension : 1, now + LOOP_FADE_IN);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(now, src.loopStart);
    loops[name] = { src, gain, filter };
  } else if (!want && cur) {
    delete loops[name];
    const now = c.currentTime;
    rampTo(cur.gain.gain, 0, LOOP_FADE_OUT, now);
    try {
      cur.src.stop(now + LOOP_FADE_OUT + 0.05);
    } catch {
      /* ignore */
    }
    setTimeout(() => cur.gain.disconnect(), (LOOP_FADE_OUT + 0.2) * 1000);
  }
  if (name === 'anticipation') updateTension();
}

// ------------------------------------------------------------------------------------------------
// sfx
function params(name: string): SfxParams {
  return { ...DEFAULTS, ...(PARAMS[name as SfxName] ?? {}) };
}

function pickVariant(name: string, index: number | undefined): { id: string; rate: number } | null {
  const v = VARIANTS[name];
  if (!v || !v.ids.length) return null;
  const n = v.ids.length;
  if (index === undefined || !Number.isFinite(index)) {
    if (n === 1) return { id: v.ids[0], rate: 1 };
    let i = Math.floor(Math.random() * n);
    if (i === lastVariant.get(name)) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    lastVariant.set(name, i);
    return { id: v.ids[i], rate: 1 };
  }
  const k = Math.round(index);
  const nums = v.nums ?? v.ids.map((_, i) => v.base + i);
  if (STEPPED.has(name)) {
    // last step at or below k; past the top keep climbing a semitone per step (max +5)
    let i = 0;
    while (i + 1 < n && nums[i + 1] <= k) i++;
    const over = Math.max(0, k - nums[n - 1]);
    return { id: v.ids[i], rate: Math.pow(2, Math.min(over, 5) / 12) };
  }
  const i = nums.indexOf(k);
  return { id: v.ids[i >= 0 ? i : mod(k - v.base, n)], rate: 1 };
}

function releaseVoice(v: Voice, at: number): void {
  try {
    v.gain.gain.setTargetAtTime(0, at, 0.006);
    v.src.stop(at + 0.04);
  } catch {
    /* ignore */
  }
}

function prune(now: number): void {
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) voices.splice(i, 1);
}

function playSfx(name: SfxName, o: PlayOptions): void {
  const c = ctx;
  if (!c || !sfxOn || !sfxBus || c.state !== 'running' || isHidden()) return;
  const pick = pickVariant(name, o.index);
  if (!pick) return;
  const info = SOUNDS[pick.id];
  const buf = info ? banks[info.bank] : undefined;
  if (!info || !buf) return;
  const p = params(name);
  const now = c.currentTime;
  const when = now + Math.max(0, o.delay ?? 0);
  const last = lastStart.get(name);
  if (last !== undefined && Math.abs(when - last) < p.minGap) return;
  lastStart.set(name, when);
  prune(now);
  // per-sound polyphony
  const mine = voices.filter((v) => v.name === name);
  while (mine.length >= p.voices) {
    const oldest = mine.shift();
    if (!oldest) break;
    voices.splice(voices.indexOf(oldest), 1);
    releaseVoice(oldest, now);
  }
  // global polyphony: steal the oldest of the lowest priority
  while (voices.length >= MAX_VOICES) {
    let victim = 0;
    for (let i = 1; i < voices.length; i++) {
      const a = voices[i];
      const b = voices[victim];
      if (a.priority < b.priority || (a.priority === b.priority && a.start < b.start)) victim = i;
    }
    releaseVoice(voices[victim], now);
    voices.splice(victim, 1);
  }
  let rate = (o.rate ?? 1) * pick.rate;
  if (o.rate === undefined && p.jitter) rate *= 1 + (Math.random() * 2 - 1) * p.jitter;
  rate = Math.max(0.25, Math.min(4, rate));
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const gain = c.createGain();
  gain.gain.value = Math.max(0, (o.volume ?? 1) * p.gain);
  src.connect(gain);
  let out: AudioNode = gain;
  if (o.pan && typeof c.createStereoPanner === 'function') {
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, o.pan));
    gain.connect(pan);
    out = pan;
  }
  out.connect(sfxBus);
  const offset = info.start / AUDIO_SR;
  const dur = info.length / AUDIO_SR;
  src.start(when, offset, dur);
  const v: Voice = { name, src, gain, start: when, end: when + dur / rate + 0.05, priority: p.priority };
  voices.push(v);
  src.onended = () => {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    out.disconnect();
    gain.disconnect();
  };
  if (p.duck) duckMusic(p.duck[0], p.duck[1], when);
}

function duckMusic(amount: number, seconds: number, at?: number): void {
  const c = ctx;
  if (!c || !duckGain) return;
  const now = Math.max(c.currentTime, at ?? c.currentTime);
  const a = clamp01(amount);
  const until = Math.max(duckUntil, now + Math.max(0, seconds));
  const depth = now < duckUntil ? Math.max(duckDepth, a) : a;
  duckUntil = until;
  duckDepth = depth;
  const g = duckGain.gain;
  rampTo(g, 1 - depth, 0.06, now);
  g.setValueAtTime(1 - depth, until);
  g.linearRampToValueAtTime(1, until + 0.6);
}

// ------------------------------------------------------------------------------------------------
// public API
export const audio = {
  /** Create/resume the AudioContext (call from a user gesture) and start loading. */
  init(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (!ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        resolveReady();
        return Promise.resolve();
      }
      let c: Ctx;
      try {
        c = new AC({ latencyHint: 'interactive' });
      } catch {
        c = new AC();
      }
      ctx = c;
      buildGraph(c);
      unlock(c);
      installLifecycle(c);
      startLoading();
    }
    const c = ctx;
    if (c.state !== 'running' && !isHidden()) {
      return c.resume().then(
        () => undefined,
        () => armGestureResume(),
      );
    }
    return Promise.resolve();
  },

  ready,

  setMusicEnabled(on: boolean): void {
    if (musicOn === on) return;
    musicOn = on;
    if (!ctx || !musicEnableGain) return;
    rampTo(musicEnableGain.gain, on ? 1 : 0, 0.15);
    if (on) restartCurrentSources();
    else stopCurrentSources();
  },

  setSfxEnabled(on: boolean): void {
    if (sfxOn === on) return;
    sfxOn = on;
    if (!ctx || !sfxEnableGain) return;
    rampTo(sfxEnableGain.gain, on ? 1 : 0, 0.05);
    if (!on) {
      const now = ctx.currentTime;
      for (const v of voices.splice(0)) releaseVoice(v, now + 0.06);
    }
    applyLoops();
  },

  /** Master volume 0..1 (perceptual: gain = v^2). */
  setVolume(v: number): void {
    volume = clamp01(Number.isFinite(v) ? v : 1);
    if (master) rampTo(master.gain, volume * volume, 0.05);
  },

  play(name: SfxName, opts: PlayOptions = {}): void {
    playSfx(name, opts);
  },

  loop(name: LoopName, on: boolean): void {
    if (!(name in loopWanted)) return;
    loopWanted[name] = on;
    applyLoop(name);
  },

  music(track: Track, opts: { fade?: number } = {}): void {
    desiredTrack = track;
    pendingFade = Math.max(0, opts.fade ?? DEFAULT_FADE);
    void applyMusic(pendingFade);
  },

  intensity(level: number): void {
    tension = clamp01(Number.isFinite(level) ? level : 0);
    updateTension();
  },

  duck(amount: number, seconds: number): void {
    duckMusic(amount, seconds);
  },

  beat(): BeatInfo {
    const pos = contentPos();
    const beats = (pos * clock.bpm) / 60;
    const whole = Math.floor(beats);
    return {
      bpm: clock.bpm,
      beat: whole % clock.beatsPerBar,
      phase: beats - whole,
      bar: Math.floor(whole / clock.beatsPerBar) % clock.bars,
    };
  },
};

/** Override where the MP3s are fetched from (default: `${import.meta.env.BASE_URL}audio/`). Call before init(). */
export function setAudioBaseUrl(url: string): void {
  baseUrl = url.endsWith('/') ? url : `${url}/`;
}

/** Diagnostics for the audio lab / QA. */
export function audioDebug() {
  return {
    state: ctx?.state ?? 'none',
    sampleRate: ctx?.sampleRate ?? 0,
    voices: voices.length,
    loops: Object.keys(loops),
    track: current?.track ?? 'none',
    desiredTrack,
    banks: Object.keys(banks),
    decodedTracks: [...trackBuffers.keys()],
    bankLengths: Object.fromEntries(Object.entries(banks).map(([k, b]) => [k, b?.length ?? 0])),
    trackLengths: Object.fromEntries([...trackBuffers.entries()].map(([k, b]) => [k, b.length])),
    /** Which asset id and rate `play(name, { index })` would use. */
    pick: (name: SfxName, index: number) => pickVariant(name, index),
  };
}
