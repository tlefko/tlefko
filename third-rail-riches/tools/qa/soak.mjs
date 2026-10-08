// Functional soak (v2, Stake flow): plays real rounds through the actual UI against the demo RGS
// (random books + scenario books found in the demo pack) and checks money, settlement,
// completion and page errors after every round.
// Covers trains, Junctions, the free spins and Express Pass: scenarios found by content in the BASE
// and BOOST packs, engine-built dev scenarios (ctrl.devScenario) and Express Pass rounds, whose
// balance drops by 1.5x the bet.
// Usage: node tools/qa/soak.mjs [url] [speed=super] [browser=chrome|webkit]
import { chromium, webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:5319/?debug';
const speedMode = process.argv[3] ?? 'super';
const engine = process.argv[4] ?? 'chrome';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : logs.push(`${m.type()}: ${m.text()}`)));
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__ll && (!document.getElementById('boot') || document.getElementById('boot').classList.contains('gone')), null, { timeout: 180000 });
await page.waitForTimeout(800);
await page.mouse.click(720, 450); // dismiss splash (the game stays busy until the intro is over)
await page.waitForFunction(() => !window.__ll.ctrl.busy, null, { timeout: 60000 });
await page.waitForTimeout(600);

// find scenario books by scanning the demo packs (ids change whenever the books are regenerated)
const found = await page.evaluate(async () => {
  const load = async (m) => (await fetch(`demo-books/${m}.json`)).json();
  // candidates per scenario, then one distinct book per scenario where possible (better coverage)
  const cand = {};
  const scan = async (mode, prefix) => {
    const pack = await load(mode);
    for (const { b } of pack.books) {
      const spins = b.events.filter((e) => e.type === 'spin').map((e) => e.spin);
      const fin = b.events.find((e) => e.type === 'final');
      const spin = spins[0];
      if (!spin) continue;
      const add = (k) => {
        const key = `${prefix}${k}`;
        const list = (cand[key] ??= []);
        if (list.length < 8 && !list.some((x) => x.id === b.id)) list.push({ id: b.id, mode });
      };
      if (spin.trains?.some((t) => t.coins.length)) add('train haul');
      if (spin.trains?.some((t) => t.parent >= 0)) add('junction branch');
      if ((spin.trains ?? []).filter((t) => t.parent < 0).length >= 2) add('two locomotives');
      if (spin.ways?.length) add('way win');
      if (b.events.some((e) => e.type === 'bonusStart')) add('bonus trigger');
      if (spins.slice(1).some((sp) => sp.levelAfter > sp.levelBefore)) add('power level-up');
      if (fin?.maxWin || spin.maxWin) add('max win');
      if (b.payoutMultiplier === 0) add('no win');
    }
  };
  await scan('BASE', '');
  await scan('BOOST', 'boost ');
  const pick = {};
  const used = new Set();
  for (const key of Object.keys(cand).sort((a, b) => cand[a].length - cand[b].length)) {
    const c = cand[key].find((x) => !used.has(`${x.mode}:${x.id}`)) ?? cand[key][0];
    pick[key] = c;
    used.add(`${c.mode}:${c.id}`);
  }
  return pick;
});

await page.evaluate((mode) => {
  const { ctrl } = window.__ll;
  ctrl.qaAuto = true;
  let guard = 0;
  while (document.querySelector('.turbo-btn').dataset.mode !== mode && guard++ < 5) ctrl.cycleTurbo();
}, speedMode);

const scenarios = [
  ...Array.from({ length: 8 }, () => ({ name: 'base random', mode: 'BASE' })),
  ...Array.from({ length: 6 }, () => ({ name: 'boost random', mode: 'BOOST' })),
  ...Object.entries(found).map(([name, v]) => ({ name, mode: v.mode, book: v.id })),
  // engine-built dev scenarios (src/stake/devScenarios.ts), played through ctrl.devScenario
  { name: 'dev junction', mode: 'BASE', dev: 'junction' },
  { name: 'dev multi', mode: 'BASE', dev: 'multi' },
  { name: 'dev express', mode: 'BOOST', dev: 'express' },
  { name: 'dev rushBig', mode: 'WITCHING', dev: 'rushBig' },
  { name: 'dev lastTrain', mode: 'INFERNO', dev: 'lastTrain' },
  { name: 'dev maxWin', mode: 'INFERNO', dev: 'maxWin' },
  { name: 'buy witching', mode: 'WITCHING' },
  { name: 'buy inferno', mode: 'INFERNO' },
  { name: 'min bet', mode: 'BASE', bet: 'min' },
  { name: 'max bet', mode: 'BASE', bet: 'max' },
  { name: 'boost min bet', mode: 'BOOST', bet: 'min' },
  { name: 'boost max bet', mode: 'BOOST', bet: 'max' },
];
const COST = { BASE: 1, BOOST: 1.5, WITCHING: 100, INFERNO: 400 };
const API = 1e6;
const fmt = (api) => `$${(api / API).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let failures = 0;
const t0 = Date.now();
for (const [i, sc] of scenarios.entries()) {
  const before = await page.evaluate(async ({ sc, COST }) => {
    const { ctrl, rgs } = window.__ll;
    const want = sc.bet === 'min' ? 0 : sc.bet === 'max' ? ctrl.levels.length - 1 : ctrl.levels.indexOf(1_000_000) >= 0 ? ctrl.levels.indexOf(1_000_000) : 0;
    ctrl.setBetIndex(want);
    if (ctrl.balanceApi < ctrl.betApi * COST[sc.mode] + ctrl.betApi * 10) {
      rgs.reset();
      ctrl.balanceApi = (await rgs.balance()).amount;
      ctrl.refreshHud();
    }
    const b = ctrl.balanceApi;
    const bet = ctrl.betApi;
    const rounds = ctrl.rounds;
    const spin = sc.mode === 'BASE' || sc.mode === 'BOOST';
    ctrl.setBoost(sc.mode === 'BOOST');
    const boostOk = ctrl.boost === (sc.mode === 'BOOST') && ctrl.spinMode === (sc.mode === 'BOOST' ? 'BOOST' : 'BASE');
    if (sc.dev) void ctrl.devScenario(sc.dev);
    else {
      if (sc.book) window.__ll.forceBook(sc.book);
      if (spin) ctrl.spinPressed();
      else ctrl.buy(sc.mode);
    }
    return { b, bet, rounds, boostOk };
  }, { sc, COST });
  const started = Date.now();
  let done = false;
  while (Date.now() - started < 240000) {
    await page.waitForTimeout(400);
    done = await page.evaluate((n) => window.__ll.ctrl.rounds > n && !window.__ll.ctrl.busy, before.rounds);
    if (done) break;
  }
  await page.waitForTimeout(900); // let the HUD count-up finish
  const res = await page.evaluate(async () => {
    const { ctrl, rgs } = window.__ll;
    return {
      after: ctrl.balanceApi,
      rgsBalance: (await rgs.balance()).amount,
      last: ctrl.lastRound ?? null,
      // the HUD draws bespoke numerals; the value is in aria-label (plain text before track H's numerals)
      hudBalance: (() => {
        const el = document.querySelector('[data-k="balance"]');
        return el.getAttribute('aria-label') || el.textContent;
      })(),
      busyHud: document.querySelector('.hud').classList.contains('busy'),
    };
  });
  const r = res.last;
  const pm = r?.payoutMultiplier ?? 0;
  const winApi = Math.floor((Math.round(pm * 100) * before.bet) / 100); // payoutMultiplier is a float multiple
  const expect = before.b - Math.round(COST[sc.mode] * before.bet) + (r?.winApi ?? 0);
  const problems = [];
  if (!before.boostOk) problems.push('ctrl.setBoost did not set the spin mode');
  if (!done) problems.push('round did not finish within 240s');
  if (r?.mode !== sc.mode) problems.push(`round mode ${r?.mode} != ${sc.mode}`);
  if (r && Math.abs(r.winApi - winApi) > 1) problems.push(`win ${r.winApi} != ${pm}x bet (${winApi})`);
  if (res.after !== expect) problems.push(`balance ${res.after} != expected ${expect}`);
  if (res.rgsBalance !== res.after) problems.push(`RGS balance ${res.rgsBalance} != game ${res.after}`);
  if (res.hudBalance !== fmt(res.after)) problems.push(`HUD balance "${res.hudBalance}" != ${fmt(res.after)}`);
  if (res.busyHud) problems.push('HUD still busy');
  if ((!['BASE', 'BOOST'].includes(sc.mode) || /bonus trigger|free spins/.test(sc.name)) && !r?.bonus) problems.push('no bonus played');
  if (sc.name === 'max win' && pm < 50_000) problems.push(`max win book paid ${pm}x`);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const line = `${String(i + 1).padStart(2)} ${sc.name.padEnd(24)}${sc.book ? ` #${sc.book}`.padEnd(9) : ''.padEnd(9)} ${sc.mode.padEnd(8)} win ${pm.toFixed(2).padStart(10)}x${r?.bonus ? ' [bonus]' : ''} ${secs}s`;
  if (problems.length) {
    failures++;
    console.log(`FAIL ${line} :: ${problems.join('; ')}`);
  } else console.log(`ok   ${line}`);
}
await page.evaluate(() => window.__ll.ctrl.setBoost(false));
const missing = [
  'train haul', 'junction branch', 'two locomotives', 'way win', 'bonus trigger', 'power level-up', 'no win',
  'boost train haul', 'boost junction branch', 'boost bonus trigger',
].filter((k) => !(k in found));
console.log(`\n${scenarios.length - failures}/${scenarios.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s; page errors: ${errors.length}; console output: ${logs.length}`);
if (missing.length) console.log(`scenarios not present in the demo pack: ${missing.join(', ')}`);
if (errors.length) console.log(errors.slice(0, 8).join('\n'));
if (logs.length) console.log(logs.slice(0, 8).join('\n'));
await browser.close();
process.exit(failures || errors.length || logs.length ? 1 : 0);
