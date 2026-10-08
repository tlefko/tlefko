/**
 * RGS clients. `HttpRgs` talks to Stake Engine (rgs_url from the launch URL). `DemoRgs` implements
 * the same contract in the browser over a bundled pack of real books, so the public demo plays the
 * exact uploaded math with a local play balance.
 */
import { env } from './env';
import { API_MULT } from './money';
import type { Book, BookEvent, StakeMode } from './book';
import { MODE_COST } from './book';
import { DEV_SCENARIOS, makeScenario } from './devScenarios';

export interface Jurisdiction {
  socialCasino: boolean;
  disabledFullscreen: boolean;
  disabledTurbo: boolean;
  disabledSuperTurbo: boolean;
  disabledAutoplay: boolean;
  disabledSlamstop: boolean;
  disabledSpacebar: boolean;
  disabledBuyFeature: boolean;
  displayNetPosition: boolean;
  displayRTP: boolean;
  displaySessionTimer: boolean;
  minimumRoundDuration: number;
}

export interface RgsConfig {
  minBet: number;
  maxBet: number;
  stepBet: number;
  defaultBetLevel: number;
  betLevels: number[];
  jurisdiction: Jurisdiction;
}

export interface RgsRound {
  roundID?: number;
  amount?: number;
  payout?: number;
  payoutMultiplier: number; // float, e.g. 11.5
  active: boolean;
  mode: StakeMode;
  event?: string | null;
  state: BookEvent[];
}

export interface AuthResult {
  balance: { amount: number; currency: string };
  config: RgsConfig;
  round?: RgsRound | null;
}

export class RgsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Rgs {
  readonly kind: 'live' | 'demo';
  authenticate(): Promise<AuthResult>;
  balance(): Promise<{ amount: number; currency: string }>;
  play(mode: StakeMode, betApi: number): Promise<{ balance: { amount: number; currency: string }; round: RgsRound }>;
  endRound(): Promise<{ balance: { amount: number; currency: string } }>;
  event(index: number): Promise<void>;
  replay(): Promise<{ payoutMultiplier: number; costMultiplier: number; state: BookEvent[] }>;
}

const DEFAULT_JUR: Jurisdiction = {
  socialCasino: false,
  disabledFullscreen: false,
  disabledTurbo: false,
  disabledSuperTurbo: false,
  disabledAutoplay: false,
  disabledSlamstop: false,
  disabledSpacebar: false,
  disabledBuyFeature: false,
  displayNetPosition: false,
  displayRTP: false,
  displaySessionTimer: false,
  minimumRoundDuration: 0,
};

/* --------------------------------- live ---------------------------------- */
export class HttpRgs implements Rgs {
  readonly kind = 'live';
  private base = env.rgsUrl.startsWith('http') ? env.rgsUrl.replace(/\/$/, '') : `https://${env.rgsUrl.replace(/\/$/, '')}`;

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new RgsError('ERR_NET', 'Connection lost. Please check your internet connection.');
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; message?: string };
    if (!res.ok || data.error || data.code) throw new RgsError(String(data.code ?? data.error ?? `HTTP_${res.status}`), String(data.message ?? data.error ?? 'Request failed'));
    return data;
  }

  async authenticate() {
    const d = await this.post<AuthResult & { config: Partial<RgsConfig> }>('/wallet/authenticate', { sessionID: env.sessionID, language: env.lang });
    return { ...d, config: { ...d.config, jurisdiction: { ...DEFAULT_JUR, ...(d.config?.jurisdiction ?? {}) } } as RgsConfig };
  }
  balance() {
    return this.post<{ balance: { amount: number; currency: string } }>('/wallet/balance', { sessionID: env.sessionID }).then((d) => d.balance);
  }
  play(mode: StakeMode, betApi: number) {
    return this.post<{ balance: { amount: number; currency: string }; round: RgsRound }>('/wallet/play', { sessionID: env.sessionID, amount: betApi, mode });
  }
  endRound() {
    return this.post<{ balance: { amount: number; currency: string } }>('/wallet/end-round', { sessionID: env.sessionID });
  }
  async event(index: number) {
    await this.post('/bet/event', { sessionID: env.sessionID, event: String(index) }).catch(() => undefined);
  }
  async replay() {
    const url = `${this.base}/bet/replay/${encodeURIComponent(env.game)}/${encodeURIComponent(env.version)}/${encodeURIComponent(env.mode)}/${encodeURIComponent(env.event)}`;
    const res = await fetch(url);
    if (!res.ok) throw new RgsError(`HTTP_${res.status}`, 'This replay could not be loaded.');
    return res.json();
  }
}

/* --------------------------------- demo ---------------------------------- */
interface Pack {
  mode: StakeMode;
  cost: number;
  books: { w: number; b: Book }[];
}

const DEMO_KEY = 'powder-keg-cove.demo.v1';
/**
 * The demo plays in the `?currency=` of the URL (default USD), so the HUD and paytable can be
 * checked in any currency outside replay. Amounts are scaled to roughly match a dollar's value, which
 * also gives the long strings (Rp50,000,000.00) the layout has to fit.
 */
const DEMO_CURRENCY = /^[A-Za-z]{3}$/.test(env.currencyHint) ? env.currencyHint.toUpperCase() : 'USD';
const DEMO_SCALE: Record<string, number> = {
  JPY: 100, INR: 100, RUB: 100, PHP: 50, TRY: 30, MXN: 20, BRL: 5, CNY: 5, ARS: 1000, NGN: 1000, KRW: 1000, CLP: 1000, PKR: 250, IDR: 10000,
  VND: 20000, TZS: 2000, UGX: 3000, KES: 100, EGP: 50, CRC: 500, ISK: 100, DKK: 5, NOK: 10, TWD: 30, BOB: 5, GHS: 10, XOF: 500,
};
const SCALE = DEMO_SCALE[DEMO_CURRENCY] ?? 1;
const DEMO_START = 5000 * SCALE * API_MULT;
const DEMO_LEVELS = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50, 100].map((v) => Math.round(v * SCALE * API_MULT));
/** Balance key per currency (USD keeps the original key). */
const BAL_KEY = DEMO_CURRENCY === 'USD' ? DEMO_KEY : `${DEMO_KEY}.${DEMO_CURRENCY}`;
/** Packs are loaded in this order in the background after the first frame. */
const PRELOAD: readonly StakeMode[] = ['BASE', 'BOOST', 'WITCHING', 'INFERNO'];

type LoadedPack = Pack & { total: number; byId: Map<number, Book> };

/** Resolve after the next frame and an idle moment (never during the first frame). */
function idle(): Promise<void> {
  return new Promise((res) => {
    const go = () => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => res(), { timeout: 1500 });
      else setTimeout(res, 50);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0));
    else setTimeout(go, 0);
  });
}

export class DemoRgs implements Rgs {
  readonly kind = 'demo';
  /** One load per mode: the in-flight or finished parse of demo-books/<MODE>.json. */
  private packs = new Map<StakeMode, Promise<LoadedPack>>();
  private preloading = false;
  private bal = DEMO_START;
  private open: { mode: StakeMode; bet: number; book: Book } | null = null;
  /** QA: force the next play to a specific book id. */
  forceBookId: number | null = null;
  /** Dev: a scenario book queued for the next play in its mode (docs/BOMB.md). */
  private queued: { mode: StakeMode; book: Book } | null = null;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(BAL_KEY) ?? 'null');
      if (s && Number.isFinite(s.balance) && s.balance >= 0) this.bal = s.balance;
    } catch {
      /* ignore */
    }
  }

  private save() {
    try {
      localStorage.setItem(BAL_KEY, JSON.stringify({ balance: this.bal }));
    } catch {
      /* ignore */
    }
  }

  /** The mode's pack: the one load in flight or done (a failed load is retried on the next call). */
  private pack(mode: StakeMode): Promise<LoadedPack> {
    let p = this.packs.get(mode);
    if (!p) {
      p = (async () => {
        const res = await fetch(`${import.meta.env.BASE_URL}demo-books/${mode}.json`);
        if (!res.ok) throw new RgsError('ERR_GEN', 'Demo content failed to load.');
        const raw = (await res.json()) as Pack;
        return { ...raw, total: raw.books.reduce((a, x) => a + x.w, 0), byId: new Map(raw.books.map((x) => [x.b.id, x.b])) };
      })();
      p.catch(() => this.packs.delete(mode));
      this.packs.set(mode, p);
    }
    return p;
  }

  /**
   * Load and parse every pack in the background: one at a time, each after the next frame and an
   * idle moment, so the first frame (and the intro) never waits on a download or a parse.
   */
  private preload() {
    if (this.preloading) return;
    this.preloading = true;
    void (async () => {
      for (const mode of PRELOAD) {
        await idle();
        await this.pack(mode).catch(() => undefined);
      }
    })();
  }

  reset() {
    this.bal = DEMO_START;
    this.save();
  }

  /** Dev: the QA scenarios and the mode each one plays in. */
  scenarios(): { name: string; mode: StakeMode; note: string }[] {
    return Object.keys(DEV_SCENARIOS).map((name) => {
      const s = DEV_SCENARIOS[name];
      return { name, mode: s.kind === 'boost' ? 'BOOST' : s.kind === 'buy_witching' ? 'WITCHING' : s.kind === 'buy_inferno' ? 'INFERNO' : 'BASE', note: s.note };
    });
  }

  /**
   * Dev: build a scenario round with the engine and queue it for the next play in its mode (spin for
   * BASE, Express Pass spin for BOOST, the buys for WITCHING / INFERNO). Returns what to play.
   */
  scenario(name: string): { name: string; mode: StakeMode; id: number; payoutMultiplier: number; note: string } {
    const sc = makeScenario(name);
    this.queued = { mode: sc.mode, book: sc.book };
    return { name, mode: sc.mode, id: sc.book.id, payoutMultiplier: sc.book.payoutMultiplier / 100, note: sc.note };
  }

  /** Dev: the queued scenario, if any (cleared by the play that uses it). */
  get queuedScenario(): { mode: StakeMode; id: number } | null {
    return this.queued ? { mode: this.queued.mode, id: this.queued.book.id } : null;
  }

  async authenticate(): Promise<AuthResult> {
    this.preload();
    return {
      balance: { amount: this.bal, currency: DEMO_CURRENCY },
      config: {
        minBet: DEMO_LEVELS[0],
        maxBet: DEMO_LEVELS[DEMO_LEVELS.length - 1],
        stepBet: 10_000 * SCALE,
        defaultBetLevel: 1 * SCALE * API_MULT,
        betLevels: DEMO_LEVELS,
        jurisdiction: { ...DEFAULT_JUR, socialCasino: env.social },
      },
      round: null,
    };
  }
  async balance() {
    return { amount: this.bal, currency: DEMO_CURRENCY };
  }
  async play(mode: StakeMode, betApi: number) {
    const cost = Math.round(betApi * MODE_COST[mode]);
    if (this.bal < cost) throw new RgsError('ERR_IPB', 'Insufficient balance.');
    let book: Book | undefined;
    if (this.queued && this.queued.mode === mode) {
      book = this.queued.book;
      this.queued = null;
    }
    if (!book) {
      const p = await this.pack(mode);
      if (this.forceBookId !== null) book = p.byId.get(this.forceBookId);
      this.forceBookId = null;
      if (!book) {
        let r = Math.random() * p.total;
        for (const x of p.books) {
          r -= x.w;
          if (r <= 0) {
            book = x.b;
            break;
          }
        }
        book = book ?? p.books[p.books.length - 1].b;
      }
    }
    this.bal -= cost;
    const pm = book.payoutMultiplier / 100;
    this.open = { mode, bet: betApi, book };
    this.save();
    const hasBonus = book.events.some((e) => e.type === 'bonusStart');
    return {
      balance: { amount: this.bal, currency: DEMO_CURRENCY },
      round: { roundID: Date.now(), amount: betApi, payout: Math.floor(book.payoutMultiplier * betApi / 100), payoutMultiplier: pm, active: pm > 0 || hasBonus, mode, event: null, state: book.events },
    };
  }
  async endRound() {
    if (this.open) {
      this.bal += Math.floor((this.open.book.payoutMultiplier * this.open.bet) / 100);
      this.open = null;
      this.save();
    }
    return { balance: { amount: this.bal, currency: DEMO_CURRENCY } };
  }
  async event() {
    /* progress is not persisted in the demo */
  }
  async replay() {
    const mode = (env.mode || 'BASE') as StakeMode;
    const p = await this.pack(mode);
    const b = p.byId.get(Number(env.event)) ?? p.books[0].b;
    return { payoutMultiplier: b.payoutMultiplier / 100, costMultiplier: MODE_COST[mode], state: b.events };
  }
}
