import { t } from '../i18n';
import gsap from 'gsap';
import { ICON } from './icons';
import { fmtBalance, fmtBet, fmtWin } from '../stake/money';
import { quality } from '../render/quality';
import { warmGlyphs } from '../render/text';
import { sound } from '../game/sound';
import { copy } from './copy';
import { installUiArt, passSvg, uri } from './art';
import { setNumerals, numeralsHtml, type NumFace } from './numerals';
import { modalState } from './Modal';
import { BOOST_COST } from '../math/types';
import type { SpeedMode } from '../render/timing';
import type { BonusKind } from '../math/types';

export interface HudHandlers {
  spin(): void;
  betUp(): void;
  betDown(): void;
  openBuy(): void;
  openMenu(): void;
  openAuto(): void;
  stopAuto(): void;
  cycleTurbo(): void;
  disableFeature(): void;
  /** Express Pass toggle: main.ts wires it to `ctrl.setBoost(on)`; the Controller answers with hud.setBoost. */
  boost?(on: boolean): void;
}

const BONUS_LABEL: Record<BonusKind, () => string> = { rush: () => t('rushHour'), last: () => t('lastTrain') };
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * An amount as numeral chunks that may wrap (Hud.fit): it breaks only after a thousands separator or
 * before the currency, never inside a digit group. Each chunk carries its text (data-t) for the QA tools.
 */
function wrappedHtml(text: string, face: NumFace): string {
  const attr = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return text
    .split(/(?<=,)|(?= )/)
    .map((chunk) => numeralsHtml(chunk, face).replace('<svg ', `<svg data-t="${attr(chunk)}" `))
    .join('');
}

/**
 * Bottom control bar (DOM), themed as the ship's rail: deck planks under a brass rail, the spin
 * button a ship's helm that turns while a round plays, the bonus buy a crimson wax seal, carved
 * brass-bezel knobs for the menu, autoplay and speed, brass studs for the stake, and the Powder
 * Express Pass switch beside the spin button. Balance, win and stake are set in the game's own numerals.
 * State changes animate; nothing moves while idle.
 */
export class Hud {
  el: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private shownBalance = { v: 0 };
  private shownWin = { v: 0 };
  private spinning = false;
  private autoLeft: number | null = null;
  private inBonus = false;
  private boostOn = false;
  private boostTipTimer = 0;
  private helmTween?: gsap.core.Tween;
  private betApi = 0;

  constructor(
    root: HTMLElement,
    private h: HudHandlers,
  ) {
    installUiArt();
    // low power: the DOM drops its backdrop blurs too (see .pk-low in panels.css)
    const low = (on: boolean) => document.documentElement.classList.toggle('pk-low', on);
    low(quality.low);
    quality.onChange(low);
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="feature-bar" hidden>
        <span class="fb-text"></span>
        <button class="fb-off" type="button">${t('turnOff')}</button>
      </div>
      <div class="boost-tip" role="note" hidden><b class="bt-name"></b><span class="bt-text"></span></div>
      <div class="hud-bar">
        <div class="hud-left">
          <button class="buy-btn" type="button" aria-label="${t('buyBonus')}">
            <span class="buy-text">BUY<br/>BONUS</span>
          </button>
          <button class="knob menu-btn" type="button" aria-label="${t('menu')}">${ICON.menu}</button>
          <div class="meter bal"><span class="lbl" data-k="balLabel">${t('balance')}</span><span class="val" data-k="balance"></span></div>
        </div>
        <div class="hud-center">
          <div class="meter win"><span class="lbl" data-k="winLabel">${t('win')}</span><span class="val" data-k="win"></span></div>
          <div class="meter fs" hidden><span class="lbl" data-k="fsLabel">${t('freeSpins')}</span><span class="val" data-k="fs"></span></div>
        </div>
        <div class="hud-right">
          <div class="meter bet">
            <span class="lbl" data-k="betLabel">${t('bet')}</span>
            <div class="bet-row">
              <button class="step" type="button" data-k="betDown" aria-label="${t('lowerBet')}">${ICON.minus}</button>
              <span class="val" data-k="bet"></span>
              <button class="step" type="button" data-k="betUp" aria-label="${t('raiseBet')}">${ICON.plus}</button>
            </div>
          </div>
          <button class="boost-btn" type="button" role="switch" aria-checked="false" hidden>
            <img class="boost-art" alt="" src="${uri(passSvg(false))}"/>
            <span class="boost-text"><b class="boost-name"></b><span class="boost-cost"></span><span class="boost-x"></span></span>
            <i class="boost-lamp"></i>
          </button>
          <button class="spin-btn" type="button" aria-label="${t('spin')}">
            <span class="spin-helm"></span>
            <span class="spin-icon">${ICON.spin}</span>
            <span class="spin-stop" hidden>${ICON.stop}</span>
            <span class="spin-count" hidden></span>
          </button>
          <div class="side-btns">
            <button class="knob auto-btn" type="button" aria-label="${t('autoplay')}">${ICON.auto}</button>
            <button class="knob turbo-btn" type="button" aria-label="${t('turbo')}" data-mode="normal">${ICON.turbo}<i class="pips"><b></b><b></b></i></button>
          </div>
        </div>
      </div>`;
    const extras = document.createElement('div');
    extras.className = 'hud-extras tabular';
    extras.hidden = true;
    this.el.appendChild(extras);
    const replay = document.createElement('div');
    replay.className = 'replay-bar';
    replay.hidden = true;
    replay.setAttribute('role', 'region');
    replay.setAttribute('aria-label', t('replay'));
    replay.innerHTML = `<div class="rp-stats"><span class="rp-tag">${t('replay')}</span><span class="rp-info"></span></div><button class="rp-play" type="button">${t('play')}</button>`;
    this.el.appendChild(replay);
    root.appendChild(this.el);
    this.q('.spin-btn').addEventListener('click', () => this.h.spin());
    this.q('[data-k="betUp"]').addEventListener('click', () => this.h.betUp());
    this.q('[data-k="betDown"]').addEventListener('click', () => this.h.betDown());
    this.q('.buy-btn').addEventListener('click', () => this.h.openBuy());
    this.q('.menu-btn').addEventListener('click', () => this.h.openMenu());
    this.q('.auto-btn').addEventListener('click', () => (this.autoLeft !== null ? this.h.stopAuto() : this.h.openAuto()));
    this.q('.turbo-btn').addEventListener('click', () => this.h.cycleTurbo());
    this.q('.fb-off').addEventListener('click', () => this.h.disableFeature());
    this.q('.boost-btn').addEventListener('click', () => {
      if (this.q<HTMLButtonElement>('.boost-btn').disabled) return;
      const was = this.boostOn;
      this.h.boost?.(!was);
      // the Controller answers through setBoost straight away: sound the switch only if it moved
      if (this.boostOn !== was) sound.play(this.boostOn ? 'boostOn' : 'boostOff');
    });
    // press feedback on every control: a quick squash and a springy release
    this.el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.addEventListener('pointerdown', () => !b.disabled && !reduced && gsap.to(b, { scale: 0.9, duration: 0.08, ease: 'power2.out', overwrite: 'auto' }));
      const up = () => !reduced && gsap.to(b, { scale: 1, duration: 0.42, ease: 'elastic.out(1.1, .45)', overwrite: 'auto' });
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
    });
    this.boostTexts();
    this.setWin(0);
  }

  /** Apply wording (social casino) and demo labelling. */
  labels(demo: boolean) {
    this.q('[data-k="balLabel"]').textContent = demo ? copy.demoBalance : copy.balance;
    this.q('[data-k="betLabel"]').textContent = copy.bet;
    this.q('.buy-btn .buy-text').innerHTML = copy.buyShort;
    this.q('.buy-btn').setAttribute('aria-label', copy.buyBonus);
    this.q('[data-k="betDown"]').setAttribute('aria-label', copy.lowerBet);
    this.q('[data-k="betUp"]').setAttribute('aria-label', copy.raiseBet);
    // every other text the HUD was built with, again: a Stake.us session switches to English at authenticate
    if (!this.inBonus) this.q('[data-k="winLabel"]').textContent = t('win');
    this.q('[data-k="fsLabel"]').textContent = t('freeSpins');
    this.q('.fb-off').textContent = t('turnOff');
    this.q('.menu-btn').setAttribute('aria-label', t('menu'));
    this.q('.spin-btn').setAttribute('aria-label', t('spin'));
    this.q('.auto-btn').setAttribute('aria-label', t('autoplay'));
    const sp = this.q('.turbo-btn').dataset.mode;
    this.q('.turbo-btn').setAttribute('aria-label', `${t('turbo')}: ${sp === 'super' ? t('speedSuper') : sp === 'turbo' ? t('speedTurbo') : t('speedNormal')}`);
    this.boostTexts();
    this.fitSeal();
    this.fit();
  }

  /** The seal's label shrinks to fit (long words in some languages), never below a readable size. */
  private fitSeal() {
    const txt = this.q('.buy-text');
    txt.style.fontSize = '';
    const box = this.q('.buy-btn');
    requestAnimationFrame(() => {
      const max = box.clientWidth * 0.74;
      let fs = parseFloat(getComputedStyle(txt).fontSize) || 12;
      for (let i = 0; i < 8 && txt.scrollWidth > max && fs > 7.5; i++) {
        fs *= 0.9;
        txt.style.fontSize = `${fs}px`;
      }
    });
  }

  /** Hide controls the jurisdiction disables. */
  restrict(o: { buy: boolean; auto: boolean; turbo: boolean }) {
    this.q('.buy-btn').hidden = !o.buy;
    this.q('.auto-btn').hidden = !o.auto;
    this.q('.turbo-btn').hidden = !o.turbo;
  }

  /** Jurisdiction extras: net position, session timer, RTP. */
  setExtras(text: string | null) {
    const el = this.q('.hud-extras');
    el.hidden = !text;
    if (text) el.textContent = text;
  }

  /**
   * Replay mode (Stake bet replay): the betting controls go (balance, spin, stake, autoplay, buy,
   * Express Pass, speed) and the bar becomes the replay panel: the REPLAY tag, the round's results
   * (replayStats), the win reading, the menu (sound, rules) and one Play / Play again control.
   * Space plays or replays; nothing here can start normal play.
   */
  replayMode(info: string, onPlay: () => void) {
    this.enterReplay();
    if (!this.hasReplayStats) {
      const i = this.q('.rp-info');
      i.hidden = false;
      i.textContent = info;
    }
    this.q('.rp-play').onclick = onPlay;
    this.fitReplay();
  }

  /**
   * The five replay results, each { label, value } (labels already in the player's wording), under the REPLAY
   * tag and the round's mode (Stake's replay review: the mode, the play and the win stay readable the whole time).
   */
  replayStats(stats: Record<'baseBet' | 'costMultiplier' | 'totalBet' | 'payoutMultiplier' | 'win', { label: string; value: string }>, mode = '') {
    this.enterReplay();
    this.hasReplayStats = true;
    const box = this.q('.rp-stats');
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    box.innerHTML =
      `<span class="rp-tag">${esc(t('replay'))}</span>` +
      (mode ? `<span class="rp-mode">${esc(mode)}</span>` : '') +
      (['baseBet', 'costMultiplier', 'totalBet', 'payoutMultiplier', 'win'] as const)
        .map((k) => {
          const x = stats[k];
          // data-r, not data-k: the win reading's [data-k="win"] (setWin) must never find a result
          return `<span class="rp-item" data-r="${k}"><span class="rp-lbl">${esc(x.label)}</span><span class="rp-val" aria-label="${esc(x.value)}">${numeralsHtml(x.value, k === 'win' ? 'gold' : 'paper')}</span></span>`;
        })
        .join('');
    this.fitReplay();
  }

  replayButton(label: string | null) {
    const b = this.q<HTMLButtonElement>('.rp-play');
    // the control keeps its place while a replay plays (no jump in the panel), just unusable
    b.classList.toggle('gone', label === null);
    b.disabled = label === null;
    b.setAttribute('aria-hidden', String(label === null));
    if (label) b.textContent = label;
    this.fitReplay();
  }

  private hasReplayStats = false;
  private inReplay = false;
  private onReplayKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat || modalState.open) return;
    const b = this.q<HTMLButtonElement>('.rp-play');
    e.preventDefault();
    if (!b.disabled && !b.classList.contains('gone')) b.click();
  };

  private enterReplay() {
    if (this.inReplay) return;
    this.inReplay = true;
    this.el.classList.add('replay');
    const bar = this.q('.replay-bar');
    bar.hidden = false;
    // the menu (sound, rules) and the win reading stay, as part of the replay panel
    bar.prepend(this.q('.menu-btn'));
    this.q('.rp-stats').after(this.q('.meter.win'));
    window.addEventListener('keydown', this.onReplayKey);
  }

  /**
   * Fit the replay panel to the bar: one row of readings where there is room, else the readings
   * flow into lines (label and value side by side), and in every layout the type steps down until
   * everything sits inside the bar, never clipped.
   */
  private fitReplay() {
    if (!this.inReplay) return;
    requestAnimationFrame(() => {
      const bar = this.q('.replay-bar');
      const stats = this.q('.rp-stats');
      bar.classList.remove('compact');
      bar.style.fontSize = '';
      const portrait = this.el.classList.contains('portrait');
      if (!portrait && stats.scrollWidth > stats.clientWidth + 1) bar.classList.add('compact');
      const fits = () => {
        const b = bar.getBoundingClientRect();
        const cs = getComputedStyle(bar);
        const top = b.top + parseFloat(cs.paddingTop) - 1;
        const bottom = b.bottom - parseFloat(cs.paddingBottom) + 1;
        for (const el of bar.querySelectorAll<HTMLElement>('.rp-stats, .rp-item, .rp-tag, .rp-mode, .rp-play, .menu-btn, .meter.win')) {
          if (el.offsetParent === null) continue;
          const r = el.getBoundingClientRect();
          if (r.top < top || r.bottom > bottom || r.left < b.left - 1 || r.right > b.right + 1) return false;
        }
        for (const el of bar.querySelectorAll<HTMLElement>('.rp-lbl, .rp-val')) if (el.scrollWidth > el.clientWidth + 1) return false;
        return stats.scrollWidth <= stats.clientWidth + 1;
      };
      let fs = parseFloat(getComputedStyle(bar).fontSize) || 13;
      // the column (Stake's popouts) never under 12.5 px: Stake wants the replay readable at Popout S
      const floor = this.el.classList.contains('rp-col') ? 12.5 : 9;
      for (let i = 0; i < 12 && !fits() && fs > floor; i++) {
        fs -= 0.5;
        bar.style.fontSize = `${fs}px`;
      }
    });
  }

  /** `col`: in replay on short landscape screens, the results column's width at the right (layout.ts replayColumn). */
  layout(portrait: boolean, height: number, col = 0) {
    this.el.classList.toggle('portrait', portrait);
    this.el.style.setProperty('--hud-h', `${height}px`);
    this.el.classList.toggle('rp-col', col > 0);
    this.el.style.setProperty('--rp-w', `${col}px`);
    this.fitSeal();
    this.fitReplay();
    requestAnimationFrame(() => this.fit());
  }

  /** The legibility floor for HUD amounts (tools/qa/layout.mjs): numerals never read smaller than 12.5px text. */
  static MIN_VALUE_PX = 12.5;

  /**
   * Keep every amount legible inside its own plate (Stake review, "it is possible to overlap the win
   * and play amounts"). An amount's fluid numerals shrink to fit their plate, but not below the
   * legibility floor (numerals are 1.2em tall: 15px reads like 12.5px text). Still too long there, the
   * amount wraps at the floor, breaking only after a thousands separator or before the currency,
   * never inside a digit group ("30,634,567.8 / 9 GC" would misread as another amount): a
   * 30,634,567.89 GC balance on a 375px phone reads "30,634, / 567.89 GC".
   * A wrapped amount takes at most two lines (three in portrait, where the readings' row may grow)
   * and stays inside its plate and the bar; one that cannot (a 22-character win in the mini-player)
   * scales down as it always did. Plates with two lines of label or amount close up their spacing
   * (.tight), and in portrait the bar does too (.tall), so the helm keeps its size.
   */
  fit() {
    const floor = Hud.MIN_VALUE_PX * 1.2;
    const portrait = this.el.classList.contains('portrait');
    const maxLines = portrait ? 3 : 2;
    const vals = [...this.el.querySelectorAll<HTMLElement>('.meter .val[data-num]')];
    for (const el of vals) this.unwrap(el);
    for (const m of this.el.querySelectorAll('.meter.tight')) m.classList.remove('tight');
    this.el.classList.remove('tall');
    const shown = (el: HTMLElement) => !!el.clientWidth && !!el.getAttribute('aria-label');
    const small = (el: HTMLElement) => {
      const svg = el.querySelector('.numsvg');
      // measured without the win's pop (a scale on the reading)
      const k = el.getBoundingClientRect().width / el.offsetWidth || 1;
      return !!svg && svg.getBoundingClientRect().height / k < floor - 0.25;
    };
    // a wrapped amount needs less of the landscape row, so its neighbours grow: look again until
    // every amount reads, or nothing more can be done
    for (let pass = 0; pass < 6; pass++) {
      const short = vals.filter((el) => !el.dataset.wrapped && shown(el) && small(el));
      if (!short.length) break;
      let changed = false;
      for (const el of short) if (small(el) && this.wrap(el, maxLines)) changed = true;
      if (changed) continue;
      // none of them can wrap where it stands. In the landscape row a neighbour that still reads can
      // make room by wrapping itself (the widest first); portrait columns do not move, so not there.
      if (portrait) break;
      const donor = vals
        .filter((el) => !el.dataset.wrapped && shown(el) && !short.includes(el) && /[, ]/.test(el.getAttribute('aria-label') ?? ''))
        .sort((a, b) => b.clientWidth - a.clientWidth)[0];
      if (!donor || !this.wrap(donor, maxLines)) break;
    }
    let tall = false;
    for (const m of this.el.querySelectorAll<HTMLElement>('.meter')) {
      const lbl = m.querySelector<HTMLElement>('.lbl');
      const twoLineLabel = !!lbl && lbl.offsetHeight > parseFloat(getComputedStyle(lbl).fontSize) * 1.5;
      if (m.offsetParent === null || !(twoLineLabel || m.querySelector('.val.wrap'))) continue;
      m.classList.add('tight');
      tall = true;
    }
    this.el.classList.toggle('tall', tall);
  }

  /** Wrap an amount at the floor (see fit). False, and back to one line, if it cannot fit `maxLines`. */
  private wrap(el: HTMLElement, maxLines: number): boolean {
    const text = el.getAttribute('aria-label') ?? '';
    el.classList.add('wrap');
    el.dataset.wrapped = '1';
    el.style.fontSize = `${Hud.MIN_VALUE_PX}px`;
    el.innerHTML = wrappedHtml(text, this.face(el));
    const plate = el.closest('.meter')?.getBoundingClientRect();
    const bar = el.closest('.hud-bar, .replay-bar')?.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    // a line's first chunk keeps its outline's room (0.194em) out over the edge: never more
    const slack = Hud.MIN_VALUE_PX * 0.2;
    const lines = new Set<number>();
    let fits = !!plate && !!bar && plate.top >= bar.top - 0.5 && plate.bottom <= bar.bottom + 0.5;
    for (const c of el.querySelectorAll('.numsvg')) {
      const r = c.getBoundingClientRect();
      lines.add(Math.round(r.top));
      if (r.left < box.left - slack || r.right > box.right + slack) fits = false;
      if (plate && (r.left < plate.left - 0.5 || r.right > plate.right + 0.5)) fits = false;
    }
    if (fits && lines.size <= maxLines) return true;
    this.unwrap(el);
    return false;
  }

  /** Back to one line of fluid numerals (an earlier fit may have wrapped this amount). */
  private unwrap(el: HTMLElement) {
    el.classList.remove('wrap');
    el.style.removeProperty('font-size');
    if (!el.dataset.wrapped) return;
    delete el.dataset.wrapped;
    const text = el.getAttribute('aria-label') ?? '';
    el.innerHTML = text ? numeralsHtml(text, this.face(el), true) : '';
  }

  private face(el: HTMLElement): NumFace {
    return (el.dataset.num ?? '').split(':')[0] as NumFace;
  }

  /**
   * Put an amount into a reading. A wrapped amount keeps its wrapped form while it counts (no jump
   * back to one shrunken line on every frame); fit() looks again whenever its length changes.
   */
  private amount(el: HTMLElement, text: string, face: NumFace): boolean {
    const resized = (el.getAttribute('aria-label') ?? '').length !== text.length;
    if (!el.dataset.wrapped) setNumerals(el, text, face, true);
    else if (el.dataset.num !== `${face}:${text}`) {
      el.dataset.num = `${face}:${text}`;
      el.setAttribute('aria-label', text);
      el.innerHTML = text ? wrappedHtml(text, face) : '';
    }
    return resized;
  }

  private warmed = '';
  setBalance(cents: number, animate = true) {
    const el = this.q('[data-k="balance"]');
    // the first amount tells us the currency: its glyphs go into the numeral atlases now
    const sample = fmtBalance(123456789);
    if (sample !== this.warmed) {
      this.warmed = sample;
      warmGlyphs(`${sample} ${fmtWin(123456789)}`);
    }
    gsap.killTweensOf(this.shownBalance);
    if (!animate || Math.abs(cents - this.shownBalance.v) < 1) {
      this.shownBalance.v = cents;
      this.amount(el, fmtBalance(cents), 'paper');
      this.fit();
      return;
    }
    gsap.to(this.shownBalance, {
      v: cents,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => this.amount(el, fmtBalance(Math.round(this.shownBalance.v)), 'paper') && this.fit(),
      onComplete: () => this.fit(),
    });
  }

  /**
   * Put exact display strings into the readings (any currency format), bypassing the formatter.
   * The QA overlap check (tools/qa/hud-overlap.mjs) drives the worst cases through this.
   */
  showAmounts(o: { balance?: string; win?: string; bet?: string }) {
    if (o.balance !== undefined) this.amount(this.q('[data-k="balance"]'), o.balance, 'paper');
    if (o.bet !== undefined) this.amount(this.q('[data-k="bet"]'), o.bet, 'paper');
    if (o.win !== undefined) {
      this.q('.win').classList.toggle('empty', !o.win);
      this.amount(this.q('[data-k="win"]'), o.win, 'gold');
    }
    this.fit();
  }

  setBet(cents: number) {
    this.betApi = cents;
    this.amount(this.q('[data-k="bet"]'), fmtBet(cents), 'paper');
    this.q('.bet').setAttribute('title', '');
    this.boostTexts();
    this.fit();
  }

  setWin(cents: number, animate = false) {
    const el = this.q('[data-k="win"]');
    gsap.killTweensOf(this.shownWin);
    this.q('.win').classList.toggle('empty', cents <= 0);
    if (!animate || cents <= 0) {
      this.shownWin.v = cents;
      this.amount(el, cents > 0 ? fmtWin(cents) : '', 'gold');
      this.fit();
      return;
    }
    // counts up at 2 decimals (never above the win), lands on the exact win (every decimal it needs)
    gsap.to(this.shownWin, {
      v: cents,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: () => this.amount(el, fmtBet(Math.round(this.shownWin.v)), 'gold') && this.fit(),
      onComplete: () => (this.amount(el, fmtWin(cents), 'gold'), this.fit()),
    });
    if (!reduced) gsap.fromTo(el, { scale: 1.22 }, { scale: 1, duration: 0.5, ease: 'back.out(2.6)' });
  }

  setSpinning(on: boolean) {
    this.spinning = on;
    this.el.classList.toggle('busy', on);
    const helm = this.q('.spin-helm');
    this.helmTween?.kill();
    if (reduced) return;
    if (on) {
      // the helm is hauled round: a wind-up tug back, then it turns while the round plays
      this.helmTween = gsap.to(helm, {
        keyframes: [
          { rotation: '-=14', duration: 0.12, ease: 'power2.out' },
          { rotation: '+=374', duration: 0.9, ease: 'power2.in' },
        ],
        onComplete: () => {
          // low power: one turn per round, no running loop
          if (!quality.low) this.helmTween = gsap.to(helm, { rotation: '+=360', duration: 1.1, ease: 'none', repeat: -1 });
        },
      });
    } else {
      // it coasts to rest on the nearest spoke with a little overshoot
      const r = (gsap.getProperty(helm, 'rotation') as number) || 0;
      const rest = Math.ceil((r + 20) / 45) * 45;
      this.helmTween = gsap.to(helm, { rotation: rest, duration: 0.7, ease: 'back.out(2)', onComplete: () => gsap.set(helm, { rotation: rest % 360 }) });
    }
  }

  setLocked(on: boolean) {
    for (const s of ['.buy-btn', '[data-k="betUp"]', '[data-k="betDown"]', '.auto-btn', '.boost-btn']) {
      const b = this.q<HTMLButtonElement>(s);
      if (s === '.auto-btn' && this.autoLeft !== null) b.disabled = false;
      else b.disabled = on;
    }
  }

  setAuto(left: number | null) {
    this.autoLeft = left;
    const count = this.q('.spin-count');
    const icon = this.q('.spin-icon');
    const stop = this.q('.spin-stop');
    this.q('.auto-btn').classList.toggle('on', left !== null);
    this.q('.auto-btn').setAttribute('aria-label', left !== null ? t('stopAutoplay') : t('autoplay'));
    if (left === null) {
      count.hidden = true;
      stop.hidden = true;
      icon.hidden = false;
      return;
    }
    icon.hidden = true;
    stop.hidden = true;
    count.hidden = false;
    if (Number.isFinite(left)) setNumerals(count, String(left), 'sea');
    else {
      count.dataset.num = '';
      count.setAttribute('aria-label', t('untilStopped'));
      count.innerHTML = ICON.auto;
    }
  }

  setTurbo(mode: SpeedMode) {
    const b = this.q('.turbo-btn');
    b.dataset.mode = mode;
    b.setAttribute('aria-label', `${t('turbo')}: ${mode === 'normal' ? t('speedNormal') : mode === 'turbo' ? t('speedTurbo') : t('speedSuper')}`);
    if (mode !== 'normal' && !reduced) gsap.fromTo(b.querySelector('svg'), { x: -6 }, { x: 0, duration: 0.35, ease: 'back.out(3)' });
  }

  /**
   * Express Pass state from the Controller (track M calls this at start, in replay and after every
   * change). Hidden where boost is not allowed (jurisdictions without bonus buys, replay).
   */
  setBoost(on: boolean, allowed: boolean) {
    const b = this.q<HTMLButtonElement>('.boost-btn');
    const was = this.boostOn;
    this.boostOn = on && allowed;
    b.hidden = !allowed;
    this.el.classList.toggle('boost-on', this.boostOn);
    this.el.classList.toggle('has-boost', allowed);
    b.setAttribute('aria-checked', String(this.boostOn));
    (b.querySelector('.boost-art') as HTMLImageElement).src = uri(passSvg(this.boostOn));
    this.boostTexts();
    if (this.boostOn && !was) {
      if (!reduced) gsap.fromTo(b, { scale: 1.16, rotation: -4 }, { scale: 1, rotation: 0, duration: 0.55, ease: 'elastic.out(1, .4)' });
      this.showBoostTip();
    } else if (!this.boostOn) this.hideBoostTip();
  }

  get boost() {
    return this.boostOn;
  }

  private boostTexts() {
    const b = this.q('.boost-btn');
    if (!b) return;
    const cost = t('boostCost', { x: BOOST_COST });
    const tip = t('boostTip', { x: BOOST_COST, amount: fmtWin(Math.round(this.betApi * BOOST_COST)), bet: copy.betLower });
    this.q('.boost-name').textContent = t('boostName');
    this.q('.boost-cost').textContent = cost;
    setNumerals(this.q('.boost-x'), `${BOOST_COST}x`, 'fire');
    b.setAttribute('aria-label', `${t('boostName')}: ${cost}. ${tip}`);
    b.title = tip;
    this.q('.bt-name').textContent = t('boostName');
    this.q('.bt-text').textContent = tip;
  }

  /** A short note by the switch when Express Pass goes on: what it costs and what it does. */
  private showBoostTip() {
    const tip = this.q('.boost-tip');
    tip.hidden = false;
    clearTimeout(this.boostTipTimer);
    if (!reduced) gsap.fromTo(tip, { y: 10, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.32, ease: 'back.out(2)' });
    this.boostTipTimer = window.setTimeout(() => this.hideBoostTip(), 4200);
  }

  private hideBoostTip() {
    const tip = this.q('.boost-tip');
    clearTimeout(this.boostTipTimer);
    if (tip.hidden) return;
    if (reduced) {
      tip.hidden = true;
      return;
    }
    gsap.to(tip, { y: 8, opacity: 0, duration: 0.2, ease: 'power1.in', onComplete: () => void (tip.hidden = true) });
  }

  setBonus(on: boolean, kind?: BonusKind) {
    this.inBonus = on;
    this.el.classList.toggle('in-bonus', on);
    this.q('.fs').hidden = !on;
    this.q('[data-k="winLabel"]').textContent = on ? t('totalWin') : t('win');
    if (on && kind) this.q('[data-k="fsLabel"]').textContent = BONUS_LABEL[kind]();
    if (!on) this.setWin(0);
    this.fit();
  }

  setFreeSpins(left: number, total: number) {
    const el = this.q('[data-k="fs"]');
    el.textContent = t('spinsLeft', { n: left });
    el.setAttribute('aria-label', `${t('freeSpins')}: ${left} / ${total}`);
    gsap.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
  }

  setBonusTotal(cents: number) {
    if (!this.inBonus) return;
    this.setWin(cents, true);
    this.q('.win').classList.remove('empty');
  }

  setFeature(label: string | null) {
    const bar = this.q('.feature-bar');
    bar.hidden = label === null;
    if (label) this.q('.fb-text').textContent = label;
  }

  get isSpinning() {
    return this.spinning;
  }
}
