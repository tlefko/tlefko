import { t, num, type StringKey } from '../i18n';
import { Modal } from './Modal';
import { ICON } from './icons';
import { copy } from './copy';
import { numeralsHtml } from './numerals';
import type { Controller } from '../game/Controller';
import { MAX_WIN, TANTRUM_SIZE, LIT_MULT, BOMB_FUSE, BOMB_START_SIZE, BOMB_MAX_SIZE, BOMB_BIG_SIZE, BLAST_SPARKS, CHARGE_MAX, CHARGE_MAX_BOOST, BOOST_COST } from '../math/types';
import { BOMB_WHEEL_SIZES } from '../math/model';
import { SYMBOL_ART } from '../art/symbols';
import { puff, spark } from '../art/fx';
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
  return typeof v === 'number' ? `${(v > 1.5 ? v : v * 100).toFixed(2)}%` : '96.20%';
};
const maxWin = (mode: string) => num(STATS[mode]?.maxWin ?? MAX_WIN);
const payMod = import.meta.glob('../math/paytable.ts', { eager: true }) as Record<string, { PAYTABLE?: readonly (readonly number[])[]; SIZE_LABELS?: readonly string[]; TIER_LABELS?: readonly string[] }>;
const PT = Object.values(payMod)[0] ?? {};
const art = (svg: string, cls = '') => `<span class="art ${cls}">${svg}</span>`;
/**
 * Step-by-step blast diagrams for the rules (Stake asked for the chain reaction to be spelled
 * out): three little boards drawn with the game's own symbols. Cells are [row][col] codes:
 * s0..s3 lows, K cold keg, L lit keg, B bomb (hot), . empty, and each step lists the blast
 * areas (fire outline), the cells that are exploding (burst), clearing (smoke) or newly lit.
 */
type Step = { area: [number, number, number, number][]; burst: [number, number][]; puff: [number, number][]; lit: [number, number][]; empty: [number, number][]; badge?: [number, number, string][] };
const DIAGRAMS: Record<'keg' | 'bomb', { board: string[][]; steps: Step[] }> = {
  keg: {
    board: [
      ['K', 's1', 's2', 's3'],
      ['s1', 'L', 's0', 's0'],
      ['s2', 's3', 'L', 's1'],
    ],
    steps: [
      { area: [], burst: [[1, 1]], puff: [], lit: [], empty: [] },
      { area: [[0, 0, 3, 3]], burst: [[2, 2]], puff: [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1]], lit: [[0, 0]], empty: [], badge: [[0, 0, `x${LIT_MULT}`]] },
      { area: [[1, 1, 2, 3]], burst: [], puff: [[1, 2], [1, 3], [2, 2], [2, 3]], lit: [[0, 0]], empty: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [2, 1]] },
    ],
  },
  bomb: {
    // a hot bomb catches a cold keg (it lights), a lit keg and a second bomb (both go off); their
    // blasts never reach the keg that just lit, which explodes on a later cascade
    board: [
      ['K', 's1', 's2', 's3'],
      ['s1', 'B', 'B', 's0'],
      ['s2', 'L', 's3', 's1'],
    ],
    steps: [
      { area: [], burst: [[1, 1]], puff: [], lit: [], empty: [] },
      { area: [[0, 0, 3, 3]], burst: [[1, 2], [2, 1]], puff: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [2, 2]], lit: [[0, 0]], empty: [], badge: [[1, 1, '+1'], [0, 0, `x${LIT_MULT}`]] },
      { area: [[0, 1, 3, 3], [1, 0, 2, 3]], burst: [], puff: [[0, 3], [1, 3], [2, 3]], lit: [[0, 0]], empty: [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], badge: [[1, 2, '+1']] },
    ],
  },
};
let diagramArt: Record<string, string> | null = null;
function blastDiagram(kind: 'keg' | 'bomb', captions: string[]): string {
  const A = (diagramArt ??= {
    s0: uri(SYMBOL_ART[0].idle()),
    s1: uri(SYMBOL_ART[1].idle()),
    s2: uri(SYMBOL_ART[2].idle()),
    s3: uri(SYMBOL_ART[3].idle()),
    K: uri(SYMBOL_ART[9].idle()),
    L: uri(SYMBOL_ART[9].win!()),
    B: uri((SYMBOL_ART[11]?.hot ?? SYMBOL_ART[11]?.idle ?? (() => SYMBOL_ART[9].win!()))()),
    puff: uri(puff()),
    burst: uri(spark()),
  });
  const D = DIAGRAMS[kind];
  const has = (list: [number, number][], r: number, c: number) => list.some(([a, b]) => a === r && b === c);
  const img = (src: string, cls: string) => `<img class="${cls}" src="${src}" alt=""/>`;
  const steps = D.steps.map((st, i) => {
    const cells = D.board
      .map((row, r) =>
        row
          .map((code, c) => {
            if (has(st.empty, r, c)) return '<span class="dg-cell gone"></span>';
            if (has(st.puff, r, c) && !has(st.burst, r, c)) return `<span class="dg-cell">${img(A.puff, 'dg-puff')}</span>`;
            const src = has(st.lit, r, c) ? A.L : A[code] ?? '';
            const lit = has(st.lit, r, c) ? ' lit' : '';
            return `<span class="dg-cell${lit}">${src ? img(src, 'dg-sym') : ''}${has(st.burst, r, c) ? img(A.burst, 'dg-burst') : ''}</span>`;
          })
          .join(''),
      )
      .join('');
    const areas = st.area.map(([r, c, h, w]) => `<i class="dg-area" style="left:${(c / 4) * 100}%;top:${(r / 3) * 100}%;width:${(w / 4) * 100}%;height:${(h / 3) * 100}%"></i>`).join('');
    const badges = (st.badge ?? []).map(([r, c, txt]) => `<span class="dg-badge" style="left:${((c + 0.5) / 4) * 100}%;top:${(r / 3) * 100}%">${numeralsHtml(txt, 'fire')}</span>`).join('');
    return `<figure class="dg-step"><div class="dg-board">${cells}${areas}${badges}</div><figcaption><b>${num(i + 1)}</b>${captions[i]}</figcaption></figure>`;
  });
  return `<div class="diagram" role="img" aria-label="${captions.map((c, i) => `${i + 1}. ${c}`).join(' ')}">${steps.join('')}</div>`;
}

/** "2, 3 or 5" in the player's language. */
const orList = (xs: readonly number[]) => (xs.length < 2 ? xs.map(num).join('') : t('sizesOr', { list: xs.slice(0, -1).map(num).join(', '), last: num(xs[xs.length - 1]) }));

type Offer = { mode: 'WITCHING' | 'INFERNO'; title: StringKey; blurb: StringKey; vol: StringKey; cls: string; sym: number };
const OFFERS: Offer[] = [
  { mode: 'WITCHING', title: 'witchingHour', blurb: 'witchingBlurb', vol: 'volVeryHigh', cls: 'o-witching', sym: 10 },
  { mode: 'INFERNO', title: 'infernoHour', blurb: 'infernoBlurb', vol: 'volExtreme', cls: 'o-tantrum', sym: 9 },
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
          <h3>${t(o.title)}</h3><p>${t(o.blurb)}</p>
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
  const labels = PT.SIZE_LABELS ?? PT.TIER_LABELS ?? ['5', '6', '7', '8', '9-10', '11-12', '13-15', '16+'];
  const order = [8, 7, 6, 5, 4, 3, 2, 1, 0];
  const head = `<tr><th></th>${[...labels].reverse().map((t) => `<th>${t}</th>`).join('')}</tr>`;
  const rows = order.map((s) => `<tr><td class="sym">${art(SYMBOL_ART[s].idle())}</td>${[...(table[s] ?? [])].reverse().map((p) => `<td class="tabular">${v(p)}</td>`).join('')}</tr>`).join('');
  const cards = order
    .map((s) => `<div class="pay-card"><div class="pc-art">${art(SYMBOL_ART[s].idle())}</div><dl>${[...labels].reverse().map((t, i) => `<div><dt>${t}</dt><dd class="tabular">${v([...(table[s] ?? [])].reverse()[i] ?? 0)}</dd></div>`).join('')}</dl></div>`)
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
  const bomb = SYMBOL_ART[11];
  const bombArt = (hot: boolean) => (bomb ? art((hot && bomb.hot ? bomb.hot : bomb.idle)(), 'mini') : `<span class="art mini icon">${ICON.bomb}</span>`);
  m.body.innerHTML = `<article class="rules" dir="auto">
    <section><h3>${t('rHowTitle')}</h3><p>${t('rHow', { max: maxWin('BASE'), bet: B })}</p></section>
    <section><h3>${t('rBrimTitle')}</h3>
      <div class="rule-row">${art(SYMBOL_ART[9].idle(), 'mini')}<p>${t('rBrim1')}</p></div>
      <div class="rule-row">${art(SYMBOL_ART[9].win!(), 'mini')}<p>${t('rBrim2', { lit: LIT_MULT })}</p></div>
      <h4>${t('rChainTitle')}</h4>
      <p class="rule-key">${t('rChain')}</p>
      ${blastDiagram('keg', [t('rChainStep1', { lit: LIT_MULT }), t('rChainStep2'), t('rChainStep3', { lit: LIT_MULT })])}</section>
    <section><h3>${t('rBombTitle')}</h3>
      <div class="rule-row">${bombArt(false)}<p>${t('rBomb1', { start: BOMB_START_SIZE, fuse: BOMB_FUSE })}</p></div>
      <p>${t('rBomb2', { charge: CHARGE_MAX })}</p>
      <p>${t('rBomb3', { max: BOMB_MAX_SIZE })}</p>
      <div class="rule-row">${bombArt(true)}<p>${t('rBomb4', { big: BOMB_BIG_SIZE, sparks: BLAST_SPARKS })}</p></div>
      <h4>${t('rChainTitle')}</h4>
      <p class="rule-key">${t('rBombChain')}</p>
      ${blastDiagram('bomb', [t('rBombStep1'), t('rBombStep2', { big: BOMB_BIG_SIZE }), t('rBombStep3')])}
      <p>${t('rBomb5')}</p></section>
    <section><h3>${t('rTantrumTitle')}</h3><p>${t('rTantrum', { size: TANTRUM_SIZE })}</p>
      <table class="kv desc"><tr><td>${t('rHounds')}</td><td>${t('rHoundsText')}</td></tr>
      <tr><td>${t('rInferno')}</td><td>${t('rInfernoText')}</td></tr>
      <tr><td>${t('rBoost')}</td><td>${t('rBoostText')}</td></tr>
      <tr><td>${t('rCash')}</td><td>${t('rCashText', { bet: B })}</td></tr>
      <tr><td>${t('rBombWheel')}</td><td>${t('rBombWheelText', { sizes: orList(BOMB_WHEEL_SIZES) })}</td></tr></table>
      <p>${t('rTantrumReset')}</p></section>
    ${boostOn ? `<section><h3>${t('rPowderTitle')}</h3><div class="rule-row"><span class="art mini icon">${ICON.boost}</span><p>${t('rPowderText', { x: BOOST_COST, bet: B, boost: CHARGE_MAX_BOOST, charge: CHARGE_MAX, rtp: rtp('BOOST') })}</p></div></section>` : ''}
    <section><h3>${t('rFsTitle')}</h3>
      <div class="rule-row">${art(SYMBOL_ART[10].idle(), 'mini')}<p>${t('rFs1')}</p></div>
      <p>${t('rFs2')}</p></section>
    <section><h3>${copy.payouts}</h3><p class="muted">${t('rPayNote', { bet: B, amount: fmtBet(c.betApi) })}</p>
      <div class="pay-scroll"><table class="pay">${head}${rows}</table></div><div class="pay-cards">${cards}</div>
      <h4>${t('rPaySpecial')}</h4>
      <div class="rule-row special">${art(SYMBOL_ART[9].idle(), 'mini')}<p>${t('rPayKeg', { lit: LIT_MULT })}</p></div>
      <div class="rule-row special">${art(SYMBOL_ART[10].idle(), 'mini')}<p>${t('rPayChest')}</p></div>
      <div class="rule-row special">${bombArt(false)}<p>${t('rPayBomb')}</p></div></section>
    <section><h3>${t('rModesTitle')}</h3><table class="kv">
      <tr><td>${t('rBaseGame')}</td><td class="tabular">${t('rCost', { x: 1, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('BASE') })}</td><td class="tabular">${t('rMax', { max: maxWin('BASE') })}</td></tr>
      ${boostOn ? `<tr><td>${t('boostName')}</td><td class="tabular">${t('rCost', { x: BOOST_COST, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('BOOST') })}</td><td class="tabular">${t('rMax', { max: maxWin('BOOST') })}</td></tr>` : ''}
      ${c.jur?.disabledBuyFeature ? '' : `<tr><td>${t('witchingHour')}</td><td class="tabular">${t('rCost', { x: MODE_COST.WITCHING, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('WITCHING') })}</td><td class="tabular">${t('rMax', { max: maxWin('WITCHING') })}</td></tr>
      <tr><td>${t('infernoHour')}</td><td class="tabular">${t('rCost', { x: MODE_COST.INFERNO, bet: B })}</td><td class="tabular">${t('rRtp', { rtp: rtp('INFERNO') })}</td><td class="tabular">${t('rMax', { max: maxWin('INFERNO') })}</td></tr>`}</table>
      <p>${t('rModesNote', { bet: B })}</p></section>
    <section><h3>${t('rButtonsTitle')}</h3><div class="guide">${guide.map(([ic, tt, d]) => `<div class="g-row"><span class="g-ic">${ic}</span><div><b>${tt}</b><p>${d}</p></div></div>`).join('')}</div></section>
    <section><h3>${t('rGeneralTitle')}</h3><p>${t('rGeneral')}</p></section></article>`;
  m.open();
  fitPayTable(m);
  sound.play('uiOpen');
}

export function openHistory(c: Controller) {
  const m = new Modal(t('historyLink'), 'history-modal');
  const label = (k: string) => ({ BASE: t('spin'), BOOST: t('boostName'), WITCHING: t('witchingHour'), INFERNO: t('infernoHour') })[k] ?? k;
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
