import { t, num, lang, type StringKey } from '../i18n';
import type { Scene } from './Scene';
import { Presenter, type PresentCtx } from './Presenter';
import { sound } from './sound';
import { Settings } from './Settings';
import { initialBet } from './bet';
import { speed, type SpeedMode } from '../render/timing';
import type { Hud } from '../ui/Hud';
import { toast } from '../ui/toast';
import { copy } from '../ui/copy';
import { MAX_WIN } from '../math/types';
import { bookToRound, MODE_COST, type StakeMode } from '../stake/book';
import { currency, fmtBalance, fmtBet, fmtWin, winApi, API_MULT } from '../stake/money';
import { RgsError, type DemoRgs, type Jurisdiction, type Rgs, type RgsRound } from '../stake/rgs';
import { env } from '../stake/env';

/** The game's RTP for the jurisdiction display, in the player's number format (96.30% / 96,30 %). */
// read at use time: a Stake.us session switches to English at authenticate
const rtpText = () => new Intl.NumberFormat(lang === 'en' ? 'en-US' : lang, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(0.963);

export interface AutoConfig {
  spins: number;
  lossLimitApi?: number;
  singleWinApi?: number;
  stopOnBonus: boolean;
}

const ERR_TEXT: Record<string, StringKey> = {
  ERR_IPB: 'errBalance',
  ERR_IS: 'errSession',
  ERR_ATE: 'errSession',
  ERR_GLE: 'errLimit',
  ERR_LOC: 'errLocation',
  ERR_MAINTENANCE: 'errMaintenance',
  ERR_NET: 'errNetwork',
};

/**
 * Game flow against the RGS: authenticate, bet levels, play, present, end round.
 * Win amounts shown to the player are always derived from the RGS payout multiplier.
 */
export class Controller {
  settings = new Settings();
  presenter: Presenter;
  busy = false;
  balanceApi = 0;
  levels: number[] = [];
  betIndex = 0;
  jur!: Jurisdiction;
  lastRound?: { mode: StakeMode; payoutMultiplier: number; winApi: number; bonus: boolean };
  rounds = 0;
  /** QA hook: auto-advance title cards. */
  qaAuto = false;
  /** Express Pass: spins play mode BOOST at bet x MODE_COST.BOOST. Off at every session start. */
  boost = false;
  private auto: (AutoConfig & { left: number; startApi: number }) | null = null;
  private hud!: Hud;
  private sessionStart = Date.now();
  private netApi = 0;
  private extrasTimer = 0;

  constructor(
    scene: Scene,
    public rgs: Rgs,
  ) {
    this.presenter = new Presenter(scene);
    const sp = this.settings.get<SpeedMode>('speed', 'normal');
    if (sp === 'turbo' || sp === 'super') speed.mode = sp;
  }

  get betApi() {
    return this.resumeBetApi ?? this.levels[this.betIndex] ?? 0;
  }
  /**
   * The bet of an active round found at authenticate, shown exactly as it was played while that
   * round resumes, even if it is no longer one of the offered levels. Cleared once the round ends.
   */
  private resumeBetApi: number | undefined;
  /** Express Pass is offered unless the jurisdiction disables buy features (never in replay). */
  get boostAllowed(): boolean {
    return !!this.jur && !this.jur.disabledBuyFeature && !env.replay;
  }
  /** The mode a spin press plays now: BOOST while Express Pass is on (and allowed), else BASE. */
  get spinMode(): StakeMode {
    return this.boost && this.boostAllowed ? 'BOOST' : 'BASE';
  }
  /** What the next spin costs in API units: the bet, or bet x 1.5 with Express Pass. */
  get spinCostApi(): number {
    return Math.round(this.betApi * MODE_COST[this.spinMode]);
  }
  get demo() {
    return this.rgs.kind === 'demo';
  }

  /** Authenticate; returns an active round to resume, if any. */
  async start(hud: Hud): Promise<RgsRound | null> {
    this.hud = hud;
    // nothing on the HUD can be reached (keyboard included) until the RGS has authenticated the session
    hud.el.inert = true;
    const a = await this.rgs.authenticate();
    hud.el.inert = false;
    currency.code = a.balance.currency;
    this.balanceApi = a.balance.amount;
    this.jur = a.config.jurisdiction;
    const { minBet, maxBet, stepBet } = a.config;
    let levels = (a.config.betLevels ?? []).filter((l) => l >= minBet && l <= maxBet && (!stepBet || l % stepBet === 0));
    if (!levels.length) levels = [minBet];
    this.levels = levels;
    // Bet on load (Stake approval; src/game/bet.ts): an active round keeps the bet it was played
    // with, displayed exactly, and continues; with no such round the bet resets to the default bet
    // level. A bet from an earlier session is never restored.
    const init = initialBet(levels, a.config.defaultBetLevel, a.round);
    this.betIndex = init.index;
    this.resumeBetApi = init.resumeBetApi ?? undefined;
    if (this.jur.disabledTurbo) speed.mode = 'normal';
    if (this.jur.disabledSuperTurbo && speed.mode === 'super') speed.mode = 'turbo';
    hud.labels(this.demo);
    hud.restrict({ buy: !this.jur.disabledBuyFeature, auto: !this.jur.disabledAutoplay, turbo: !this.jur.disabledTurbo });
    this.boost = this.boost && this.boostAllowed;
    this.notifyBoost();
    hud.setTurbo(speed.mode);
    hud.setFeature(null);
    this.refreshHud();
    this.startExtras();
    return a.round && a.round.active && a.round.state?.length ? a.round : null;
  }

  private startExtras() {
    const j = this.jur;
    if (!j.displayNetPosition && !j.displaySessionTimer && !j.displayRTP) return;
    const tick = () => {
      const parts: string[] = [];
      if (j.displaySessionTimer) {
        const s = Math.floor((Date.now() - this.sessionStart) / 1000);
        parts.push(t('extraSession', { time: `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }));
      }
      if (j.displayNetPosition) parts.push(t('extraNet', { amount: `${this.netApi >= 0 ? '+' : ''}${fmtBalance(this.netApi)}` }));
      if (j.displayRTP) parts.push(t('extraRtp', { rtp: rtpText() }));
      this.hud.setExtras(parts.join('  ·  '));
    };
    tick();
    this.extrasTimer = window.setInterval(tick, 1000);
  }

  refreshHud() {
    this.hud.setBalance(this.balanceApi, false);
    this.hud.setBet(this.betApi);
  }

  /** Bet multiple -> currency string at the current bet. */
  fmt = (multiple: number) => fmtWin(winApi(multiple, this.betApi));

  private ctx(): PresentCtx {
    return {
      fmt: this.fmt,
      auto: this.auto !== null || this.qaAuto,
      hud: {
        bonus: (on, kind) => this.hud.setBonus(on, kind),
        freeSpins: (l, t) => this.hud.setFreeSpins(l, t),
        bonusTotal: (m) => this.hud.setBonusTotal(winApi(m, this.betApi)),
        spinWin: () => undefined,
      },
      progress: (i) => void this.rgs.event(i),
    };
  }

  changeBet(dir: 1 | -1) {
    if (this.busy) return;
    const i = this.betIndex + dir;
    if (i < 0 || i >= this.levels.length) return;
    this.setBetIndex(i);
    sound.play(dir > 0 ? 'betUp' : 'betDown');
  }

  setBetIndex(i: number) {
    if (this.busy) return;
    this.resumeBetApi = undefined;
    this.betIndex = Math.max(0, Math.min(this.levels.length - 1, i));
    this.refreshHud();
  }

  /**
   * Turn Express Pass on or off (the HUD toggle calls this). Ignored while a round is running (the
   * HUD is told the unchanged state) and forced off where the jurisdiction disables buy features.
   */
  setBoost(on: boolean) {
    if (!this.busy) this.boost = on && this.boostAllowed;
    this.notifyBoost();
  }

  /** Tell the HUD the Express Pass state (track H adds Hud.setBoost; the call is optional until then). */
  private notifyBoost() {
    (this.hud as { setBoost?: (on: boolean, allowed: boolean) => void } | undefined)?.setBoost?.(this.boost, this.boostAllowed);
  }

  speeds(): SpeedMode[] {
    if (this.jur?.disabledTurbo) return ['normal'];
    return this.jur?.disabledSuperTurbo ? ['normal', 'turbo'] : ['normal', 'turbo', 'super'];
  }

  cycleTurbo() {
    const order = this.speeds();
    speed.mode = order[(order.indexOf(speed.mode) + 1) % order.length];
    this.settings.set('speed', speed.mode);
    this.hud.setTurbo(speed.mode);
    sound.play('uiToggle');
  }

  spinPressed() {
    void sound.unlock();
    if (this.busy) {
      if (this.presenter.skipCard()) return;
      if (!this.jur.disabledSlamstop) this.presenter.slam();
      return;
    }
    sound.play('spinPress');
    void this.play(this.spinMode);
  }

  buy(mode: 'WITCHING' | 'INFERNO') {
    if (!this.busy && !this.jur.disabledBuyFeature) void this.play(mode);
  }

  startAuto(cfg: AutoConfig) {
    if (this.busy || this.jur.disabledAutoplay) return;
    this.auto = { ...cfg, left: cfg.spins, startApi: this.balanceApi };
    this.hud.setAuto(this.auto.left);
    void this.play(this.spinMode);
  }

  stopAuto() {
    this.auto = null;
    this.hud.setAuto(null);
    sound.play('uiToggle');
  }

  resetDemo() {
    if (this.busy || this.rgs.kind !== 'demo') return;
    (this.rgs as unknown as { reset(): void }).reset();
    void this.rgs.balance().then((b) => {
      this.balanceApi = b.amount;
      this.refreshHud();
      toast(t('demoReset', { amount: fmtBalance(this.balanceApi) }));
    });
  }

  private fail(e: unknown) {
    const code = e instanceof RgsError ? e.code : 'ERR_GEN';
    sound.play('error');
    toast(t(ERR_TEXT[code] ?? 'errGeneric'));
    this.auto = null;
    this.hud.setAuto(null);
  }

  /**
   * Dev hook (demo only): build a QA scenario with the engine and play it now in its own mode.
   * window.__ll.ctrl.devScenario('junction') with ?debug.
   */
  async devScenario(name: string) {
    if (this.busy || this.rgs.kind !== 'demo') return null;
    const info = (this.rgs as DemoRgs).scenario(name);
    await this.play(info.mode);
    return info;
  }

  /** Play a round end to end. */
  private async play(mode: StakeMode) {
    const bet = this.betApi;
    const cost = Math.round(bet * MODE_COST[mode]);
    if (this.balanceApi < cost) {
      sound.play('error');
      toast(copy.insufficient);
      this.auto = null;
      this.hud.setAuto(null);
      return;
    }
    this.busy = true;
    this.hud.setSpinning(true);
    this.hud.setLocked(true);
    this.hud.setWin(0);
    const t0 = performance.now();
    let round: RgsRound;
    try {
      const res = await this.rgs.play(mode, bet);
      round = res.round;
      this.balanceApi = res.balance.amount;
      this.hud.setBalance(this.balanceApi);
    } catch (e) {
      this.busy = false;
      this.hud.setSpinning(false);
      this.hud.setLocked(false);
      this.fail(e);
      return;
    }
    await this.present(round, mode, bet, t0);
    this.continueAuto();
  }

  /** Present an RGS round, settle it, update balance. Used for new plays and resumed rounds. */
  async present(round: RgsRound, mode: StakeMode, bet: number, t0 = performance.now(), from?: number) {
    this.busy = true;
    this.hud.setSpinning(true);
    this.hud.setLocked(true);
    const r = bookToRound(round.state, mode, round.payoutMultiplier);
    const pm = round.payoutMultiplier;
    const win = winApi(pm, bet);
    const bonus = !!r.bonus;
    // single-round wins settle right away; bonus rounds settle after the free spins
    let settled: Promise<{ amount: number } | null> = Promise.resolve(null);
    if (pm > 0 && !bonus) settled = this.rgs.endRound().then((d) => d.balance).catch((e) => (this.fail(e), null));
    try {
      await this.presenter.round(r, this.ctx(), from);
      if (!bonus && pm > 0 && !r.maxWin) await this.presenter.bigWin(pm, this.ctx());
    } catch {
      // a presentation fault must never block settlement; the round still ends below
    } finally {
      this.presenter.unslam();
    }
    if (bonus && round.active !== false) settled = this.rgs.endRound().then((d) => d.balance).catch((e) => (this.fail(e), null));
    const bal = await settled;
    const minDur = (this.jur?.minimumRoundDuration ?? 0) - (performance.now() - t0);
    if (minDur > 0) await new Promise((res) => setTimeout(res, minDur));
    if (bal) this.balanceApi = bal.amount;
    const cost = Math.round(bet * (MODE_COST[mode] ?? 1));
    this.netApi += win - cost;
    this.settings.history.unshift({ t: Date.now(), mode, betApi: bet, costApi: cost, winApi: win, bonus: r.bonus ? (r.bonus.kind === 'last' ? t('lastTrain') : t('rushHour')) : undefined, maxWin: r.maxWin || undefined });
    this.lastRound = { mode, payoutMultiplier: pm, winApi: win, bonus };
    this.hud.setBalance(this.balanceApi);
    this.hud.setWin(win, true);
    this.hud.setSpinning(false);
    this.hud.setLocked(false);
    this.busy = false;
    this.rounds++;
    if (pm >= MAX_WIN) toast(t('maxWinReached', { max: num(MAX_WIN) }));
  }

  /** Resume a round that was still open when the player left. */
  async resume(round: RgsRound) {
    const mode = (round.mode ?? 'BASE') as StakeMode;
    const bet = round.amount && round.amount > 0 ? round.amount : this.betApi;
    toast(t('resuming'));
    // a bonus resumes at the free spin the RGS saved (/bet/event), not from its trigger
    const from = round.event != null && round.event !== '' ? Number(round.event) : NaN;
    await this.present(round, mode, bet, performance.now(), Number.isFinite(from) ? from : undefined);
    // the resumed round has ended: an off-level bet gives way to the default bet level
    if (this.resumeBetApi !== undefined) {
      this.resumeBetApi = undefined;
      this.refreshHud();
    }
  }

  /** Bet replay: fetch the round, then play it on demand (no session calls). */
  async replay(hud: Hud) {
    this.hud = hud;
    const mode = (env.mode || 'BASE').toUpperCase() as StakeMode;
    const bet = env.amount > 0 ? env.amount : API_MULT;
    this.levels = [bet];
    this.betIndex = 0;
    this.boost = false;
    currency.code = env.currencyHint || 'USD';
    this.jur = { socialCasino: env.social, disabledFullscreen: true, disabledTurbo: false, disabledSuperTurbo: false, disabledAutoplay: true, disabledSlamstop: false, disabledSpacebar: false, disabledBuyFeature: true, displayNetPosition: false, displayRTP: false, displaySessionTimer: false, minimumRoundDuration: 0 };
    this.notifyBoost();
    let data: Awaited<ReturnType<Rgs['replay']>>;
    try {
      data = await this.rgs.replay();
    } catch {
      toast(t('replayFailed'));
      this.hud.replayMode(t('replayUnavailable'), () => undefined);
      this.hud.replayButton(null);
      return;
    }
    // Replay results (Stake approval): base bet, cost multiplier, bet cost, payout multiplier and
    // win are all shown during and after the replay. Social mode uses the Stake.us wording.
    const costMult = data.costMultiplier || MODE_COST[mode] || 1;
    const cost = Math.round(bet * costMult);
    const winAmt = winApi(data.payoutMultiplier, bet);
    const mult = (m: number) => `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m)}x`;
    const stats = {
      baseBet: { label: t('replayBaseBet'), value: fmtBet(bet) },
      costMultiplier: { label: t('replayCostMultiplier'), value: mult(costMult) },
      totalBet: { label: t('replayTotalBet'), value: fmtWin(cost) }, // in full: 1.5x an odd bet can need a third decimal
      payoutMultiplier: { label: t('replayPayoutMultiplier'), value: mult(data.payoutMultiplier) },
      win: { label: t('replayWin'), value: fmtWin(winAmt) },
    };
    const modeName = ({ BASE: t('rBaseGame'), BOOST: t('boostName'), WITCHING: t('rushHour'), INFERNO: t('lastTrain') } as Record<string, string>)[mode] ?? mode;
    this.hud.replayStats(stats, modeName);
    const info = Object.values(stats).map((x) => `${x.label} ${x.value}`).join('  ·  ');
    const run = async () => {
      if (this.busy) return;
      this.hud.replayButton(null);
      this.busy = true;
      const r = bookToRound(data.state, mode, data.payoutMultiplier);
      try {
        await this.presenter.round(r, { ...this.ctx(), progress: undefined });
        if (!r.bonus && data.payoutMultiplier > 0 && !r.maxWin) await this.presenter.bigWin(data.payoutMultiplier, this.ctx());
      } finally {
        this.presenter.unslam();
      }
      this.hud.setWin(winAmt, true);
      this.busy = false;
      this.hud.replayButton(t('playAgain'));
    };
    this.hud.replayMode(info, () => void run());
    this.hud.replayButton(t('play'));
  }

  private continueAuto() {
    const a = this.auto;
    const last = this.lastRound;
    if (!a || !last) return;
    if (Number.isFinite(a.left)) a.left--;
    this.hud.setAuto(a.left);
    const lost = a.startApi - this.balanceApi;
    if (a.left <= 0 || (a.stopOnBonus && last.bonus) || (a.lossLimitApi !== undefined && lost >= a.lossLimitApi) || (a.singleWinApi !== undefined && last.winApi >= a.singleWinApi) || this.balanceApi < this.spinCostApi) {
      this.auto = null;
      this.hud.setAuto(null);
      return;
    }
    // autoplay honours Express Pass (each spin plays the mode that is on when it starts)
    setTimeout(() => this.auto && !this.busy && void this.play(this.spinMode), speed.mode === 'normal' ? 350 : 120);
  }

  dispose() {
    clearInterval(this.extrasTimer);
  }
}
