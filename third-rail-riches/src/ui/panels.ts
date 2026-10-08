import { t, num, type StringKey } from '../i18n';
import { Modal } from './Modal';
import { ICON } from './icons';
import { copy } from './copy';
import { numeralsHtml } from './numerals';
import type { Controller } from '../game/Controller';
import { MAX_WIN, BOOST_COST, POWER_STEPS, POWER_MULTS } from '../math/types';
import { COIN_VALUES, LAST_TRAIN } from '../math/model';
import { SYMBOL_ART, ART } from '../art/symbols';
import { uri } from './art';
import { speed, type SpeedMode } from '../render/timing';
import { quality, type QualityMode } from '../render/quality';
import { sound } from '../game/sound';
import { fmtBalance, fmtBet, fmtWin, winApi } from '../stake/money';
import { MODE_COST } from '../stake/book';

const statsMod = import.meta.glob('../stake/stats.json', { eager: true }) as Record<string, { default: Record<string, { rtp?: number; maxWin?: number }> }>;
const STATS = Object.values(statsMod)[0]?.default ?? {};
const rtp = (mode: string) => {
  const v = STATS[mode]?.rtp;
  return typeof v === 'number' ? `${(v > 1.5 ? v : v * 100).toFixed(2)}%` : '96.30%';
};
const maxWin = (mode: string) => num(STATS[mode]?.maxWin ?? MAX_WIN);
const payMod = import.meta.glob('../math/paytable.ts', { eager: true }) as Record<string, { PAYTABLE?: readonly (readonly number[])[]; REEL_LABELS?: readonly string[] }>;
const PT = Object.values(payMod)[0] ?? {};
const art = (svg: string, cls = '') => `<span class="art ${cls}">${svg}</span>`;
/**
 * The train diagram for the rules: a little 4 x 3 board drawn with the game's own symbols, with the
 * route a Locomotive takes (its row, then the branches a Junction sends up and down) drawn over it,
 * and the coins it collects ringed.
 */
const TRAIN_BOARD = [
  ['s0', 'c', 's1', 'c', 's2'],
  ['L', 's3', 'J', 'c', 'c'],
  ['s1', 'c', 's0', 's2', 'c'],
];
let trainArt: Record<string, string> | null = null;
function trainDiagram(caption: string): string {
  const A = (trainArt ??= {
    s0: uri(SYMBOL_ART[0].idle()),
    s1: uri(SYMBOL_ART[1].idle()),
    s2: uri(SYMBOL_ART[2].idle()),
    s3: uri(SYMBOL_ART[3].idle()),
    c: uri(SYMBOL_ART[ART.COIN_SILVER].idle()),
    L: uri(SYMBOL_ART[ART.LOCO].win!()),
    J: uri(SYMBOL_ART[ART.SIGNAL].win!()),
  });
  const cols = TRAIN_BOARD[0].length;
  const rows = TRAIN_BOARD.length;
  const collected = new Set(['1,3', '1,4', '0,3', '2,4']);
  const cells = TRAIN_BOARD.map((row, r) =>
    row.map((code, c) => `<span class="dg-cell${collected.has(`${r},${c}`) ? ' lit' : ''}"><img class="dg-sym" src="${A[code]}" alt=""/></span>`).join(''),
  ).join('');
  // route: row 1 from the locomotive to the right edge; from the junction's column, up to row 0 and down to row 2
  const x = (c: number) => ((c + 0.5) / cols) * 100;
  const y = (r: number) => ((r + 0.5) / rows) * 100;
  const route = `<svg class="dg-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M${x(0)} ${y(1)} H100 M${x(2)} ${y(1)} V${y(0)} H100 M${x(2)} ${y(1)} V${y(2)} H100" fill="none" stroke="#3fc8ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".9"/></svg>`;
  return `<div class="diagram one" role="img" aria-label="${caption}"><figure class="dg-step wide"><div class="dg-board" style="grid-template-columns:repeat(${cols},1fr)">${cells}${route}</div><figcaption>${caption}</figcaption></figure></div>`;
}

type Offer = { mode: 'WITCHING' | 'INFERNO'; title: StringKey; blurb: StringKey; vol: StringKey; cls: string; sym: number };
const OFFERS: Offer[] = [
  { mode: 'WITCHING', title: 'rushHour', blurb: 'rushBlurb', vol: 'volVeryHigh', cls: 'o-witching', sym: 10 },
  { mode: 'INFERNO', title: 'lastTrain', blurb: 'lastBlurb', vol: 'volExtreme', cls: 'o-tantrum', sym: ART.LOCO_GOLD },
];

export function openBuy(c: Controller) {
  const m = new Modal(copy.buyTitle, 'buy-modal');
  const render = () => {
    const bet = c.betApi;
    m.body.innerHTML = `
      <div class="bet-line"><span class="lbl">${copy.bet}</span>
        <button class="step" data-a="down" type="button" aria-label="${copy.lowerBet}">${ICON.minus}</button>
        <span class="val" aria-label="${fmtBet(bet)}">${numeralsHtml(fmtBet(bet))}</span>
        <button class="step" data-a="up" type="button" aria-label="${copy.raiseBet}">${ICON.plus}</button></div>
      <div class="offers two">${OFFERS.map((o) => `<article class="offer ${o.cls}">
          <div class="offer-art">${art(SYMBOL_ART[o.sym].win!(), 'big')}</div>
          <h3>${t(o.title)}</h3><p>${t(o.blurb, { mult: POWER_MULTS[LAST_TRAIN.level] })}</p>
          <div class="offer-foot"><span class="price" aria-label="${fmtBet(MODE_COST[o.mode] * bet)}">${numeralsHtml(fmtBet(MODE_COST[o.mode] * bet), 'gold')}</span><span class="vol">${t(o.vol)} · RTP ${rtp(o.mode)}</span></div>
          <button class="offer-cta" type="button" data-id="${o.mode}">${copy.buy}</button></article>`).join('')}</div>`;
    m.body.querySelector('[data-a="down"]')!.addEventListener('click', () => (c.changeBet(-1), render()));
    m.body.querySelector('[data-a="up"]')!.addEventListener('click', () => (c.changeBet(1), render()));
    m.body.querySelectorAll<HTMLButtonElement>('.offer-cta').forEach((b) => b.addEventListener('click', () => confirm(OFFERS.find((o) => o.mode === b.dataset.id)!)));
  };
  const confirm = (o: Offer) => {
    sound.play('uiClick');
    const price = MODE_COST[o.mode] * c.betApi;
    const ok = c.balanceApi >= price;
    m.body.innerHTML = `<div class="confirm ${o.cls}"><div class="offer-art">${art(SYMBOL_ART[o.sym].win!(), 'big')}</div><h3>${t(o.title)}</h3>
      <p class="confirm-q">${copy.buyConfirm(t(o.title), fmtBet(price))}</p>
      <p class="confirm-note">${ok ? copy.buyFrom(fmtBalance(c.balanceApi)) : copy.notEnough(fmtBalance(c.balanceApi))}</p>
      <div class="confirm-actions"><button class="btn ghost" type="button" data-a="back">${t('back')}</button><button class="btn primary" type="button" data-a="buy" ${ok ? '' : 'disabled'}>${copy.buy}</button></div></div>`;
    m.body.querySelector('[data-a="back"]')!.addEventListener('click', render);
    m.body.querySelector('[data-a="buy"]')!.addEventListener('click', () => {
      sound.play('buy');
      m.close();
      c.buy(o.mode);
    });
  };
  render();
  m.open();
  sound.play('uiOpen');
}

export function openAuto(c: Controller) {
  const m = new Modal(t('autoplay'), 'auto-modal');
  const counts = [10, 25, 50, 100, 250, 500, Infinity];
  const lossOpts = [0, 25, 50, 100, 250, 500];
  const winOpts = [0, 10, 50, 100, 500, 1000];
  let spins = 25;
  let loss = 0;
  let win = 0;
  let stopBonus = true;
  const seg = (name: string, opts: number[], cur: number, label: (v: number) => string) =>
    `<div class="seg" role="radiogroup" data-name="${name}">${opts.map((v) => `<button type="button" role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-v="${v}">${label(v)}</button>`).join('')}</div>`;
  const render = () => {
    const bet = c.betApi;
    m.body.innerHTML = `
      <div class="field"><span class="field-lbl">${t('autoSpins')}</span>${seg('spins', counts, spins, (v) => (Number.isFinite(v) ? String(v) : t('untilStopped')))}</div>
      <div class="field"><span class="field-lbl">${copy.autoLoss}</span>${seg('loss', lossOpts, loss, (v) => (v ? fmtBet(v * bet) : t('noLimit')))}</div>
      <div class="field"><span class="field-lbl">${copy.autoWin}</span>${seg('win', winOpts, win, (v) => (v ? fmtBet(v * bet) : t('noLimit')))}</div>
      <label class="check"><input type="checkbox" ${stopBonus ? 'checked' : ''}/><i></i><span>${t('autoStopBonus')}</span></label>
      <button class="btn primary wide" type="button" data-a="start">${t('startAutoplay')}</button>`;
    m.body.querySelectorAll<HTMLElement>('.seg').forEach((g) =>
      g.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const v = Number(b.dataset.v);
          if (g.dataset.name === 'spins') spins = v;
          if (g.dataset.name === 'loss') loss = v;
          if (g.dataset.name === 'win') win = v;
          sound.play('uiClick');
          render();
        }),
      ),
    );
    m.body.querySelector<HTMLInputElement>('.check input')!.addEventListener('change', (e) => (stopBonus = (e.target as HTMLInputElement).checked));
    m.body.querySelector('[data-a="start"]')!.addEventListener('click', () => {
      m.close();
      c.startAuto({ spins, stopOnBonus: stopBonus, lossLimitApi: loss ? loss * bet : undefined, singleWinApi: win ? win * bet : undefined });
    });
  };
  render();
  m.open();
  sound.play('uiOpen');
}

export function openMenu(c: Controller, audio: { music: boolean; sfx: boolean; setMusic(v: boolean): void; setSfx(v: boolean): void }) {
  const m = new Modal(t('menu'), 'menu-modal');
  let offQuality: (() => void) | null = null;
  const render = () => {
    const speeds = c.speeds();
    const qm = quality.mode;
    const qOpt = (mode: QualityMode, label: string) => `<button type="button" role="radio" aria-checked="${qm === mode}" class="${qm === mode ? 'on' : ''}" data-q="${mode}">${label}</button>`;
    m.body.innerHTML = `<div class="menu-list">
      <label class="row switch"><span class="ri">${ICON.sound}</span><span class="rt">${t('soundEffects')}</span><input type="checkbox" data-k="sfx" ${audio.sfx ? 'checked' : ''}/><i></i></label>
      <label class="row switch"><span class="ri">${ICON.music}</span><span class="rt">${t('music')}</span><input type="checkbox" data-k="music" ${audio.music ? 'checked' : ''}/><i></i></label>
      ${speeds.length > 1 ? `<div class="row"><span class="ri">${ICON.turbo}</span><span class="rt">${t('turbo')}</span><div class="seg small" role="radiogroup" aria-label="${t('turbo')}">${(['normal', 'turbo', 'super'] as SpeedMode[]).filter((s) => speeds.includes(s)).map((s) => `<button type="button" role="radio" aria-checked="${speed.mode === s}" class="${speed.mode === s ? 'on' : ''}" data-s="${s}">${s === 'normal' ? t('speedNormal') : s === 'turbo' ? t('speedTurbo') : t('speedSuper')}</button>`).join('')}</div></div>` : ''}
      <div class="row stack"><span class="ri">${ICON.power}</span><span class="rt">${t('lowPower')}<small>${t('lowPowerNote')}</small></span><div class="seg small" role="radiogroup" aria-label="${t('lowPower')}">${qOpt('auto', quality.autoLow ? t('qualityAutoOn') : t('qualityAuto'))}${qOpt('low', t('qualityOn'))}${qOpt('high', t('qualityOff'))}</div></div>
      <button class="row link" type="button" data-a="info"><span class="ri">${ICON.info}</span><span class="rt">${t('rulesLink')}</span></button>
      <button class="row link" type="button" data-a="history"><span class="ri">${ICON.history}</span><span class="rt">${t('historyLink')}</span></button>
      <button class="row link" type="button" data-a="keys"><span class="ri">${ICON.keyboard}</span><span class="rt">${t('keysLink')}</span></button>
      ${c.demo ? `<button class="row link" type="button" data-a="reset" ${c.busy ? 'disabled' : ''}><span class="ri">${ICON.reset}</span><span class="rt">${t('resetDemo')}</span></button>` : ''}</div>
      ${c.demo ? `<p class="fineprint">${t('demoNote')}</p>` : ''}`;
    m.body.querySelector<HTMLInputElement>('[data-k="sfx"]')!.addEventListener('change', (e) => audio.setSfx((e.target as HTMLInputElement).checked));
    m.body.querySelector<HTMLInputElement>('[data-k="music"]')!.addEventListener('change', (e) => audio.setMusic((e.target as HTMLInputElement).checked));
    m.body.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) =>
      b.addEventListener('click', () => {
        let guard = 0;
        while (speed.mode !== b.dataset.s && guard++ < 4) c.cycleTurbo();
        render();
      }),
    );
    m.body.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        quality.set(b.dataset.q as QualityMode);
        sound.play('lowPowerClick');
        render();
      }),
    );
    m.body.querySelector('[data-a="info"]')!.addEventListener('click', () => (m.close(), openInfo(c)));
    m.body.querySelector('[data-a="history"]')!.addEventListener('click', () => (m.close(), openHistory(c)));
    m.body.querySelector('[data-a="keys"]')!.addEventListener('click', () => (m.close(), openKeys(c)));
    m.body.querySelector('[data-a="reset"]')?.addEventListener('click', () => (c.resetDemo(), m.close()));
  };
  // auto may flip to low while the menu is open (the frame-rate probe): keep the label honest
  offQuality = quality.onChange(() => render());
  m.onClose = () => offQuality?.();
  render();
  m.open();
  sound.play('uiOpen');
}

export function openInfo(c: Controller) {
  const m = new Modal(t('rulesTitle'), 'info-modal');
  // exact symbol wins at the current stake: every decimal the win needs, never rounded (fmtWin)
  const v = (x: number) => fmtWin(winApi(x, c.betApi));
  const table = PT.PAYTABLE ?? [];
  const labels = PT.REEL_LABELS ?? ['3', '4', '5', '6'];
  const order = [8, 7, 6, 5, 4, 3, 2, 1, 0];
  const head = `<tr><th></th>${[...labels].reverse().map((l) => `<th>${l}</th>`).join('')}</tr>`;
  const rows = order.map((s) => `<tr><td class="sym">${art(SYMBOL_ART[s].idle())}</td>${[...(table[s] ?? [])].reverse().map((p) => `<td class="tabular">${v(p)}</td>`).join('')}</tr>`).join('');
  const cards = order
    .map((s) => `<div class="pay-card"><div class="pc-art">${art(SYMBOL_ART[s].idle())}</div><dl>${[...labels].reverse().map((l, i) => `<div><dt>${l}</dt><dd class="tabular">${v([...(table[s] ?? [])].reverse()[i] ?? 0)}</dd></div>`).join('')}</dl></div>`)
    .join('');
  const B = copy.betLower;
  const boostOn = !!c.boostAllowed;
  const guide: [string, string, string][] = [
    [ICON.spin, t('spin'), t('gSpin', { bet: B })],
    [ICON.plus, t('gBetTitle', { Bet: copy.bet }), t('gBet', { bet: B })],
    ...(c.jur?.disabledBuyFeature ? [] : ([[ICON.info, copy.buyBonus, t('gBuy', { w: MODE_COST.WITCHING, i: MODE_COST.INFERNO, bet: B })]] as [string, string, string][])),
    ...(boostOn ? ([[ICON.boost, t('boostName'), t('gBoost', { x: BOOST_COST, bet: B })]] as [string, string, string][]) : []),
    ...(c.jur?.disabledAutoplay ? [] : ([[ICON.auto, t('autoplay'), t('gAuto')]] as [string, string, string][])),
    ...(c.speeds().length > 1 ? ([[ICON.turbo, t('turbo'), t('gSpeed')]] as [string, string, string][]) : []),
    [ICON.menu, t('menu'), t('gMenu')],
  ];
  const power = { s1: POWER_STEPS[0], s2: POWER_STEPS[1], s3: POWER_STEPS[2], s4: POWER_STEPS[3], m1: POWER_MULTS[1], m2: POWER_MULTS[2], m3: POWER_MULTS[3], m4: POWER_MULTS[4] };
  const coinRow = [ART.COIN_BRONZE, ART.COIN_SILVER, ART.COIN_GOLD, ART.COIN_PLATINUM].map((k) => art(SYMBOL_ART[k].idle(), 'mini')).join('');
  m.body.innerHTML = `<article class="rules" dir="auto">
    <section><h3>${t('rHowTitle')}</h3><p>${t('rHow', { max: maxWin('BASE'), bet: B })}</p></section>
    <section><h3>${t('rWaysTitle')}</h3><p>${t('rWays')}</p>
      <div class="rule-row">${art(SYMBOL_ART[9].idle(), 'mini')}<p><b>${t('rWildTitle')}.</b> ${t('rWild')}</p></div></section>
    <section><h3>${t('rTrainTitle')}</h3>
      <div class="rule-row">${art(SYMBOL_ART[ART.LOCO].win!(), 'mini')}<p>${t('rTrain')}</p></div>
      <h4>${t('rCoinTitle')}</h4>
      <div class="rule-row coins">${coinRow}</div>
      <p>${t('rCoin', { min: num(COIN_VALUES[0]), maxc: num(COIN_VALUES[COIN_VALUES.length - 1]), bet: B })}</p>
      <h4>${t('rJunctionTitle')}</h4>
      <div class="rule-row">${art(SYMBOL_ART[ART.SIGNAL].win!(), 'mini')}<p>${t('rJunction')}</p></div>
      ${trainDiagram(t('rJunction'))}</section>
    <section><h3>${t('rFsTitle')}</h3>
      <div class="rule-row">${art(SYMBOL_ART[10].idle(), 'mini')}<p>${t('rFs1')}</p></div>
      <p>${t('rFs2')}</p>
      <h4>${t('rPowerTitle')}</h4><p>${t('rPower', power)}</p>
      <h4>${t('rLastTitle')}</h4>
      <div class="rule-row">${art(SYMBOL_ART[ART.LOCO_GOLD].win!(), 'mini')}<p>${t('rLast', power)}</p></div></section>
    ${boostOn ? `<section><h3>${t('rExpressTitle')}</h3><div class="rule-row"><span class="art mini icon">${ICON.boost}</span><p>${t('rExpress', { x: BOOST_COST, bet: B, rtp: rtp('BOOST') })}</p></div></section>` : ''}
    <section><h3>${copy.payouts}</h3><p class="muted">${t('rPayNote', { bet: B, amount: fmtBet(c.betApi) })}</p>
      <div class="pay-scroll"><table class="pay">${head}${rows}</table></div><div class="pay-cards">${cards}</div>
      <h4>${t('rPaySpecial')}</h4>
      <div class="rule-row special">${art(SYMBOL_ART[9].idle(), 'mini')}<p>${t('rPayWild')}</p></div>
      <div class="rule-row special">${art(SYMBOL_ART[10].idle(), 'mini')}<p>${t('rPayTicket')}</p></div>
      <div class="rule-row special">${art(SYMBOL_ART[ART.COIN_GOLD].idle(), 'mini')}<p>${t('rPayCoin')}</p></div>
      <div class="rule-row special">${art(SYMBOL_ART[ART.LOCO].idle(), 'mini')}<p>${t('rPayLoco')}</p></div>
      <div class="rule-row special">${art(SYMBOL_ART[ART.SIGNAL].idle(), 'mini')}<p>${t('rPaySwitch')}</p></div></section>
    <section><h3>${t('rModesTitle')}</h3><table class="kv">
      <tr><td>${t('rBaseGame')}</td><td class="tabular">${t('rCost', { x: 1, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('BASE') })}</td><td class="tabular">${t('rMax', { max: maxWin('BASE') })}</td></tr>
      ${boostOn ? `<tr><td>${t('boostName')}</td><td class="tabular">${t('rCost', { x: BOOST_COST, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('BOOST') })}</td><td class="tabular">${t('rMax', { max: maxWin('BOOST') })}</td></tr>` : ''}
      ${c.jur?.disabledBuyFeature ? '' : `<tr><td>${t('rushHour')}</td><td class="tabular">${t('rCost', { x: MODE_COST.WITCHING, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('WITCHING') })}</td><td class="tabular">${t('rMax', { max: maxWin('WITCHING') })}</td></tr>
      <tr><td>${t('lastTrain')}</td><td class="tabular">${t('rCost', { x: MODE_COST.INFERNO, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('INFERNO') })}</td><td class="tabular">${t('rMax', { max: maxWin('INFERNO') })}</td></tr>`}</table>
      <p>${t('rModesNote', { bet: B })}</p></section>
    <section><h3>${t('rButtonsTitle')}</h3><div class="guide">${guide.map(([ic, tt, d]) => `<div class="g-row"><span class="g-ic">${ic}</span><div><b>${tt}</b><p>${d}</p></div></div>`).join('')}</div></section>
    <section><h3>${t('rGeneralTitle')}</h3><p>${t('rGeneral')}</p></section></article>`;
  m.open();
  fitPayTable(m);
  sound.play('uiOpen');
}

export function openHistory(c: Controller) {
  const m = new Modal(t('historyLink'), 'history-modal');
  const label = (k: string) => ({ BASE: t('spin'), BOOST: t('boostName'), WITCHING: t('rushHour'), INFERNO: t('lastTrain') })[k] ?? k;
  const items = c.settings.history;
  m.body.innerHTML = items.length
    ? `<table class="hist"><thead><tr><th>${t('time')}</th><th>${t('round')}</th><th>${copy.bet}</th><th>${copy.win}</th></tr></thead><tbody>${items.map((h) => `<tr><td>${new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>${label(h.mode)}${h.bonus && h.mode !== 'WITCHING' && h.mode !== 'INFERNO' ? `<small>${h.bonus}</small>` : ''}${h.maxWin ? `<small>${t('maxWin')}</small>` : ''}</td><td class="tabular">${fmtBet(h.costApi)}</td><td class="tabular ${h.winApi > 0 ? 'won' : ''}">${fmtWin(h.winApi)}</td></tr>`).join('')}</tbody></table>`
    : `<p class="muted">${t('noRounds')}</p>`;
  m.open();
  sound.play('uiOpen');
}

/** Arrow keycaps drawn inline (no Unicode arrows in the text). */
const arrow = (rot: number) => `<svg class="kbd-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 L14 9 L10 9 L10 14 L6 14 L6 9 L2 9 Z" transform="rotate(${rot} 8 8)" fill="currentColor"/></svg>`;
const ARROW_UP = arrow(0);
const ARROW_DOWN = arrow(180);

export function openKeys(c: Controller) {
  const m = new Modal(t('keysLink'), 'keys-modal');
  const rows: [string, string][] = [
    ...(c.jur?.disabledSpacebar ? [] : ([[t('keySpace'), t('keySpin')]] as [string, string][])),
    [`Shift + ${ARROW_UP} / ${ARROW_DOWN}`, t('keyBet', { bet: copy.betLower })],
    ...(c.jur?.disabledBuyFeature ? [] : ([['Shift + B', copy.buyBonus]] as [string, string][])),
    ...(c.jur?.disabledAutoplay ? [] : ([['Shift + A', t('keyAuto')]] as [string, string][])),
    ['Shift + I', t('keyRules')],
    ['Shift + S', t('keySfx')],
    ['Shift + M', t('keyMusic')],
    ['Esc', t('keyClose')],
  ];
  m.body.innerHTML = `<table class="kv keys">${rows.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>`;
  m.open();
}

/**
 * Stake: the rules never scroll sideways. When the symbol-win table is wider than the sheet (long currencies
 * at high bets: "35,000,000.00 GC", rupiah and dong amounts), the symbol cards take its place: they show any
 * amount whole. Measured once laid out, again after the sheet's entrance, and on every resize while open.
 */
function fitPayTable(m: Modal) {
  const run = () => {
    const sc = m.body.querySelector<HTMLElement>('.pay-scroll');
    const sec = sc?.closest('section');
    if (!sc || !sec) return;
    sec.classList.remove('pay-cards-on');
    if (sc.offsetParent !== null && sc.scrollWidth > sc.clientWidth + 1) sec.classList.add('pay-cards-on');
  };
  requestAnimationFrame(run);
  setTimeout(run, 650);
  window.addEventListener('resize', run);
  const prev = m.onClose;
  m.onClose = () => {
    window.removeEventListener('resize', run);
    prev?.();
  };
}
