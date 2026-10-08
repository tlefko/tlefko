/**
 * Thin adapter over the audio module (src/audio). Everything is a safe no-op until the
 * audio module has loaded, and the module is optional so the game runs without it.
 */
type LoopName = 'anticipation' | 'wheelSpin' | 'bombFuseLoop' | 'bombHotLoop';
type Api = {
  init(): Promise<void>;
  play(name: string, opts?: { rate?: number; volume?: number; pan?: number; index?: number; delay?: number }): void;
  loop(name: LoopName, on: boolean): void;
  /** Resolves once the core sound bank is decoded (a sound played before then is dropped). */
  ready: Promise<void>;
  music(track: string, opts?: { fade?: number }): void;
  intensity(level: number): void;
  duck(amount: number, seconds: number): void;
  beat(): { bpm: number; beat: number; phase: number; bar: number };
  setMusicEnabled(on: boolean): void;
  setSfxEnabled(on: boolean): void;
  setVolume(v: number): void;
};

const mods = import.meta.glob('../audio/index.ts');
let api: Api | null = null;
let loading: Promise<void> | null = null;

export const sound = {
  get ready() {
    return api !== null;
  },
  async load() {
    if (api || loading) return loading ?? undefined;
    const key = Object.keys(mods)[0];
    if (!key) return;
    loading = mods[key]().then((m) => {
      api = (m as { audio: Api }).audio;
    });
    return loading;
  },
  async unlock() {
    await this.load();
    await api?.init();
  },
  play(name: string, opts?: Parameters<Api['play']>[1]) {
    api?.play(name, opts);
  },
  loop(name: LoopName, on: boolean) {
    api?.loop(name, on);
  },
  /** Resolves when the core bank is decoded; play one-shot stings (e.g. introSting) after this. */
  decoded(): Promise<void> {
    return api?.ready ?? Promise.resolve();
  },
  music(track: string, fade = 0.8) {
    api?.music(track, { fade });
  },
  intensity(v: number) {
    api?.intensity(v);
  },
  duck(amount: number, seconds: number) {
    api?.duck(amount, seconds);
  },
  beat(): { bpm: number; beat: number; phase: number; bar: number } | null {
    return api ? api.beat() : null;
  },
  setMusic(on: boolean) {
    api?.setMusicEnabled(on);
  },
  setSfx(on: boolean) {
    api?.setSfxEnabled(on);
  },
  setVolume(v: number) {
    api?.setVolume(v);
  },
};
