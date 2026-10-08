// The six Stake findings ported on 2026-10-04 (Polar Siege's review, Bandit's Burrow's audit, Lucifer's Lullaby's
// Engine review figures), checked on a built game served locally against a mocked RGS: no network, audio muted,
// nothing is sent anywhere. One line per check (PASS/FAIL) and screenshots + results.json in --out.
//
//   viewport  item 28: the viewport meta has maximum-scale=1 beside user-scalable=no
//   live      item 2: any Stake launch parameter means live (sessionID with an empty or missing rgs_url shows the
//             connection error, never the demo); the HUD is inert (no Tab focus) until authenticate answers
//   english   item 39: Stake.us is English only (social=true&lang=de, and socialCasino from authenticate)
//   replay    item 43: replay at Popout S (480x270, 320x180), normal and Stake.us: the REPLAY tag, mode, results and
//             Play / Play again beside or below the board, never over it, readable, before, during and after the round
//   paywide   the rules paytable never scrolls sideways (XGC/IDR/VND/KRW at the biggest play amount, phone to desktop,
//             the popouts), every win whole inside its card; at Popout S the rules content shows
//   hud375    Lullaby's review figures at 375x667 in Stake.us mode: 70,000.00 GC never clipped under the play-amount
//             plaque; a 1.5x cost shows in full (1.845 SC)
//
// Usage: node tools/qa/stake-port.mjs <baseUrl> [--only=viewport,live,...] [--out=tools/qa/out/stake-port]
//   (serve a build first: npx vite build --outDir <dir>; python3 -m http.server <port> -d <dir>)
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const require = createRequire(`${process.cwd()}/package.json`);
const { chromium } = require('@playwright/test');
const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:5701/').replace(/\/?$/, '/');
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',');
const out = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? 'tools/qa/out/stake-port';
const want = (s) => !only || only.includes(s);
mkdirSync(out, { recursive: true });

const GAME = basename(process.cwd()).replace(/^sq-fix$/, 'squirrel-stash');
// per game: the mode costs (src/stake/book.ts / src/math/types.ts) and the 1.5x mode, if any
const COSTS = {
  'powder-keg-cove': { BASE: 1, BOOST: 1.5, WITCHING: 100, INFERNO: 500 },
  'lucifers-lullaby': { BASE: 1, WITCHING: 100, INFERNO: 500 },
  'marigold-mariachi': { BASE: 1, FIESTA: 100, PARADE: 250 },
  'salamanders-gold': { BASE: 1, STOKE: 1.5, BUY: 100, SUPER: 400 },
  'squirrel-stash': { BASE: 1, STOKE: 1.5, BUY: 100, SUPER: 400 },
}[GAME];
if (!COSTS) throw new Error(`no config for ${GAME}`);
const X15 = Object.keys(COSTS).find((m) => COSTS[m] === 1.5);
const M = 1_000_000;
const RGS = 'rgs.mock.test';
const books = (mode) => JSON.parse(readFileSync(`public/demo-books/${mode}.json`, 'utf8')).books.map((x) => x.b);
const BASE_BOOKS = books('BASE');
// a short winning base round (no bonus) for the replays
const REPLAY_BOOK = BASE_BOOKS.filter((b) => b.payoutMultiplier >= 200 && b.events.length <= 4).sort((a, b) => a.events.length - b.events.length)[0] ?? BASE_BOOKS[0];

const results = [];
let section = '';
const check = (name, ok, detail = '') => {
  results.push({ section, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${section}] ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`);
};

const browser = await chromium.launch({ args: ['--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/** A page wired to the mock RGS. */
async function open({ query = '', w = 1280, h = 720, mobile = false, currency = 'USD', balance = 1_000 * M, levels = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].map((v) => v * M), def, social = false, authDelay = 0, goto = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const calls = [];
  await page.route(`https://${RGS}/**`, async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname;
    calls.push(path);
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
    if (path === '/wallet/authenticate') {
      if (authDelay) await new Promise((r) => setTimeout(r, authDelay));
      return json({ balance: { amount: balance, currency }, config: { minBet: levels[0], maxBet: levels.at(-1), stepBet: 10_000, defaultBetLevel: def ?? levels[3] ?? levels[0], betLevels: levels, jurisdiction: { socialCasino: social } }, round: null });
    }
    if (path === '/wallet/balance' || path === '/wallet/end-round') return json({ balance: { amount: balance, currency } });
    if (path === '/bet/event') return json({});
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  if (goto) await page.goto(`${base}?${query}`, { waitUntil: 'load', timeout: 120000 });
  return { ctx, page, errors, calls };
}
const liveQuery = (extra = '') => `sessionID=qa&rgs_url=${RGS}&device=desktop&mute${extra}`;

/** Past the loading screen and the splash: the HUD fully in. */
async function enter(page) {
  await page.waitForFunction(() => { const b = document.querySelector('.hud [data-k="bet"]'); return b && (b.getAttribute('aria-label') || b.textContent); }, null, { timeout: 120000 });
  for (let i = 0; i < 14; i++) {
    const inn = await page.evaluate(() => {
      const h = document.querySelector('.hud');
      return !!h && getComputedStyle(h).opacity === '1' && !h.inert && h.style.pointerEvents !== 'none';
    });
    if (inn) break;
    const v = page.viewportSize();
    await page.mouse.click(v.width / 2, v.height * 0.45);
    if (i % 2) await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(1200);
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const closeModal = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
};
async function openRules(page) {
  await page.evaluate(() => document.querySelector('.hud .menu-btn')?.click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-a="info"]')?.click());
  await page.waitForTimeout(900);
}
/** One section; a crash is a FAIL of that section, the run goes on. */
async function guard(name, fn) {
  if (!want(name)) return;
  section = name;
  try {
    await fn();
  } catch (e) {
    check('section crashed', false, String(e?.message ?? e).split('\n')[0]);
  }
}

/* ------------------------------------------------------------------ item 28 */
await guard('viewport', async () => {
  const html = await (await fetch(`${base}index.html`)).text();
  const vp = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1] ?? '';
  check('viewport meta: maximum-scale=1 beside user-scalable=no', /maximum-scale=1\b/.test(vp) && /user-scalable=no/.test(vp), vp);
});

/* ------------------------------------------------------------------ item 2 */
await guard('live', async () => {
  for (const [name, q] of [
    ['sessionID, no rgs_url', 'sessionID=qa&lang=en&mute'],
    ['sessionID, empty rgs_url', 'sessionID=qa&rgs_url=&lang=en&mute'],
    ['sessionID, broken rgs_url', 'sessionID=qa&rgs_url=rgs.invalid.example&lang=en&mute'],
  ]) {
    const s = await open({ query: q });
    await page_wait(s.page, 9000);
    const r = await s.page.evaluate(() => {
      const hud = document.querySelector('.hud');
      const title = document.querySelector('.boot-title')?.textContent?.trim() ?? '';
      const bootShown = !!document.querySelector('.boot, #boot') && getComputedStyle(document.querySelector('.boot, #boot')).display !== 'none' && getComputedStyle(document.querySelector('.boot, #boot')).opacity !== '0';
      const hudLive = !!hud && !hud.inert && !hud.closest('[inert]');
      return { title, bootShown, hudLive };
    });
    await shot(s.page, `live-${name.replace(/[^a-z]+/gi, '-')}`);
    check(`${name}: the connection error on the loading screen, never the playable demo, the HUD inert`, !!r.title && r.bootShown && !r.hudLive, r);
    await s.ctx.close();
  }
  // the HUD is inert until authenticate answers (here 6 s): Tab never reaches a HUD control behind the loading screen
  const s = await open({ query: liveQuery('&lang=en'), authDelay: 6000 });
  await s.page.waitForFunction(() => !!document.querySelector('.hud'), null, { timeout: 60000 });
  await s.page.waitForTimeout(1500);
  const before = await s.page.evaluate(() => document.querySelector('.hud')?.inert);
  let reached = null;
  for (let i = 0; i < 12; i++) {
    await s.page.keyboard.press('Tab');
    const inHud = await s.page.evaluate(() => (document.activeElement?.closest('.hud') ? document.activeElement.className || document.activeElement.tagName : null));
    if (inHud) reached = inHud;
  }
  await enter(s.page);
  const after = await s.page.evaluate(() => document.querySelector('.hud')?.inert);
  check('the HUD is inert until authenticate answers (no Tab focus behind the loading screen)', before === true && reached === null, { before, reached, afterEnter: after });
  await s.ctx.close();
});
async function page_wait(page, ms) {
  await page.waitForTimeout(ms);
}

/* ------------------------------------------------------------------ item 39 */
await guard('english', async () => {
  const read = (page) =>
    page.evaluate(() => ({
      lang: document.documentElement.lang,
      hud: [...document.querySelectorAll('.hud [data-k$="Label"], .hud .lbl, .hud button[aria-label]')].map((e) => e.getAttribute('aria-label') || e.textContent.trim()).join(' | '),
    }));
  const ref = await open({ query: liveQuery('&social=true&lang=en'), currency: 'XGC', social: true });
  await enter(ref.page);
  const en = await read(ref.page);
  await ref.ctx.close();
  for (const [name, q, social] of [
    ['social=true&lang=de', '&social=true&lang=de', true],
    ['lang=de, socialCasino from authenticate', '&lang=de', true],
  ]) {
    const s = await open({ query: liveQuery(q), currency: 'XGC', social });
    await enter(s.page);
    const r = await read(s.page);
    await shot(s.page, `english-${name.replace(/[^a-z]+/gi, '-')}`);
    check(`Stake.us ${name}: English only`, r.lang === 'en' && r.hud === en.hud, r.hud === en.hud ? `lang ${r.lang}` : { lang: r.lang, got: r.hud.slice(0, 160), want: en.hud.slice(0, 160) });
    await s.ctx.close();
  }
});

/* ------------------------------------------------------------------ item 43 */
/** The board (the frame) in CSS px and every visible replay element; problems listed. */
const replayGeometry = (page, phase) =>
  page.evaluate((phase) => {
    const sc = (window.__ll ?? window.__sg)?.scene;
    const L = sc?.L;
    if (!L) return { problems: [`${phase}: no scene layout (debug hook)`] };
    const cv = document.querySelector('canvas').getBoundingClientRect();
    const k = sc.root?.scale?.x ?? 1;
    const ox = cv.left + (sc.root?.position?.x ?? 0);
    const oy = cv.top + (sc.root?.position?.y ?? 0);
    const board = { left: ox + L.frame.x * k, top: oy + L.frame.y * k, right: ox + (L.frame.x + L.frame.w) * k, bottom: oy + (L.frame.y + L.frame.h) * k };
    const vis = (el) => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && parseFloat(getComputedStyle(el).opacity) > 0.05 && !el.closest('[hidden]');
    const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const problems = [];
    const sels = ['.replay-bar', '.replay-card', '.rp-card', '.rp-tag', '.rp-mode', '.rp-item', '.rp-info', '.rp-play'];
    const els = sels.flatMap((s) => [...document.querySelectorAll(s)].filter(vis).map((e) => [s, e]));
    for (const [s, e] of els) {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (hit(r, board)) problems.push(`${phase}: ${s} over the board`);
      if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) problems.push(`${phase}: ${s} off screen`);
    }
    const items = [...document.querySelectorAll('.rp-item')].filter(vis);
    const texts = [...document.querySelectorAll('.rp-item, .rp-lbl, .rp-val, .rp-tag, .rp-mode, .rp-info, .rp-play')].filter(vis);
    for (const e of texts) if (e.scrollWidth > e.clientWidth + 1) problems.push(`${phase}: ${e.className} clipped "${e.textContent.trim().slice(0, 30)}"`);
    const fs = (sel) => Math.min(...[...document.querySelectorAll(sel)].filter(vis).map((e) => parseFloat(getComputedStyle(e).fontSize)), 99);
    const minLbl = fs('.rp-lbl');
    const minVal = Math.min(fs('.rp-val'), fs('.rp-val .lt-fb'));
    const minTag = fs('.rp-tag');
    if (items.length < 5 && !texts.some((e) => e.matches('.rp-info') && e.textContent.length > 20)) problems.push(`${phase}: ${items.length} results shown`);
    if (!document.querySelector('.rp-mode') || !vis(document.querySelector('.rp-mode'))) problems.push(`${phase}: no mode shown`);
    // the type floor where Stake looks (the popouts, landscape); portrait's band may step down for extreme amounts
    if ((innerWidth > innerHeight || phase !== 'worst') && (minLbl < 12 || minVal < 12 || minTag < 12)) problems.push(`${phase}: type below 12 px (labels ${minLbl}, values ${minVal}, tag ${minTag})`);
    const play = document.querySelector('.rp-play');
    const area = (100 * (board.right - board.left) * (board.bottom - board.top)) / (innerWidth * innerHeight);
    return { problems, board: `${Math.round(board.right - board.left)}x${Math.round(board.bottom - board.top)} (${area.toFixed(0)}% of the screen)`, area, playVisible: vis(play), playText: play?.textContent?.trim(), minLbl, minVal };
  }, phase);

await guard('replay', async () => {
  for (const [w, h] of [[480, 270], [320, 180], [375, 667]]) {
    // the board in normal play at this size (demo, debug hook), for comparison
    const n = await open({ query: 'debug&lang=en&mute&intro=0', w, h, mobile: w < h });
    await enter(n.page);
    const normal = await n.page.evaluate(() => {
      const L = (window.__ll ?? window.__sg)?.scene?.L;
      return L ? (100 * L.frame.w * L.frame.h) / (innerWidth * innerHeight) : 0;
    });
    await n.ctx.close();
    for (const social of [false, true]) {
      const cur = social ? 'XSC' : 'USD';
      const tag = `${w}x${h}-${social ? 'social' : 'regular'}`;
      const s = await open({ query: `replay=true&game=qa&version=1&mode=BASE&event=${REPLAY_BOOK.id}&amount=${1.23 * M}&currency=${cur}&lang=en&debug&mute${social ? '&social=true' : ''}`, w, h, mobile: w < h });
      await s.page.waitForSelector('.rp-play', { state: 'attached', timeout: 120000 });
      await s.page.waitForTimeout(2500);
      // through the splash (a tap), not on the Play control
      for (let i = 0; i < 4; i++) {
        const shown = await s.page.evaluate(() => {
          const h = document.querySelector('.hud');
          return !!h && getComputedStyle(h).opacity === '1';
        });
        if (shown) break;
        await s.page.mouse.click(w * 0.3, h * 0.4);
        await s.page.waitForTimeout(1500);
      }
      await s.page.waitForTimeout(1000);
      const g0 = await replayGeometry(s.page, 'before');
      await shot(s.page, `replay-${tag}-before`);
      await s.page.evaluate(() => document.querySelector('.rp-play')?.click());
      await s.page.waitForTimeout(1800);
      const g1 = await replayGeometry(s.page, 'during');
      await shot(s.page, `replay-${tag}-during`);
      await s.page.waitForFunction(() => {
        const b = document.querySelector('.rp-play');
        return b && !b.disabled && !b.classList.contains('gone');
      }, null, { timeout: 90000 }).catch(() => {});
      await s.page.waitForTimeout(1200);
      const g2 = await replayGeometry(s.page, 'after');
      await shot(s.page, `replay-${tag}-after`);
      // the worst results Stake.us can show, pushed through the real panel
      await s.page.evaluate(() => {
        const hud = (window.__ll ?? window.__sg).ctrl.hud;
        const keys = ['baseBet', 'costMultiplier', 'totalBet', 'payoutMultiplier', 'win'];
        const labels = [...document.querySelectorAll('.rp-item .rp-lbl')].map((e) => e.textContent);
        const vals = ['70,000.00 GC', '500.00x', '35,000,000.00 GC', '20,000.00x', '1,400,000,000.00 GC'];
        hud.replayStats(Object.fromEntries(keys.map((k, i) => [k, { label: labels[i] ?? k, value: vals[i] }])), document.querySelector('.rp-mode')?.textContent ?? undefined);
      });
      await s.page.waitForTimeout(600);
      const g3 = await replayGeometry(s.page, 'worst');
      await shot(s.page, `replay-${tag}-worst`);
      // (portrait's band with the worst amounts is noted, not judged: Stake's finding is about the popouts)
      const problems = [...(g0.problems ?? []), ...(g1.problems ?? []), ...(g2.problems ?? []), ...(w > h ? (g3.problems ?? []) : [])];
      if (w < h && g3.problems?.length) console.log(`note  [replay] ${tag} worst amounts: ${g3.problems.join('; ')}`);
      if (!g0.playVisible) problems.push('before: Play not visible');
      if (!g2.playVisible) problems.push('after: Play again not visible');
      if (w > h && w >= 480 && g0.area < normal * 0.85) problems.push(`the board shrinks in replay: ${g0.area?.toFixed(0)}% vs ${normal.toFixed(0)}% in normal play`);
      check(`${tag}: results, tag, mode and Play beside or below the board, readable, the whole replay`, problems.length === 0, problems.length ? problems.slice(0, 6) : `board ${g0.board}, normal play ${normal.toFixed(0)}%, labels ${g0.minLbl}px values ${g0.minVal}px, "${g0.playText}" -> "${g2.playText}"`);
      if (s.errors.length) check(`${tag}: no page errors`, false, s.errors.slice(0, 3));
      await s.ctx.close();
    }
  }
});

/* ------------------------------------------------------------------ the rules paytable */
await guard('paywide', async () => {
  const SIZES = [[1920, 1080], [1280, 720], [844, 390], [480, 270], [400, 225], [320, 180], [768, 1024], [390, 844], [375, 667], [360, 640]];
  const CURS = [
    { cur: 'XGC', social: true, max: 70_000 * M, lang: 'en' },
    { cur: 'IDR', social: false, max: 15_000_000 * M, lang: 'id' },
    { cur: 'VND', social: false, max: 25_000_000 * M, lang: 'vi' },
    { cur: 'KRW', social: false, max: 1_500_000 * M, lang: 'ko' },
  ];
  for (const c of CURS) {
    const s = await open({ query: liveQuery(`&lang=${c.lang}${c.social ? '&social=true' : ''}`), currency: c.cur, social: c.social, balance: c.max * 10, levels: [0.1 * M, c.max], def: c.max });
    await enter(s.page);
    const bad = [];
    let top = '';
    for (const [w, h] of SIZES) {
      await s.page.setViewportSize({ width: w, height: h });
      await s.page.waitForTimeout(700);
      await openRules(s.page);
      await s.page.evaluate(() => document.querySelector('.pay-cards')?.scrollIntoView({ block: 'start' }));
      await s.page.waitForTimeout(400);
      if ([1280, 480, 320, 375].includes(w)) await shot(s.page, `paywide-${w}x${h}-${c.cur}-${c.lang}`);
      const r = await s.page.evaluate(() => {
        const bad = [];
        const modal = document.querySelector('.modal');
        if (!modal) return { n: 0, bad: ['no rules modal'] };
        if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways');
        for (const el of modal.querySelectorAll('*')) {
          const ox = getComputedStyle(el).overflowX;
          if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) bad.push(`${(el.className || el.tagName).toString().slice(0, 30)} scrolls sideways`);
        }
        const sheet = (modal.querySelector('.modal-sheet, .sheet') ?? modal).getBoundingClientRect();
        const vals = [...modal.querySelectorAll('.pay-card dd')].filter((el) => el.offsetParent !== null);
        for (const el of vals) {
          const b = el.getBoundingClientRect();
          const card = el.closest('.pay-card').getBoundingClientRect();
          const why = [];
          if (el.scrollWidth > el.clientWidth + 1) why.push('clipped');
          if (b.left < card.left - 0.5 || b.right > card.right + 0.5) why.push('off its card');
          if (b.left < sheet.left - 0.5 || b.right > sheet.right + 0.5) why.push('off the sheet');
          if (why.length) bad.push(`${el.textContent.trim()} (${why.join(', ')})`);
        }
        // the content shows: the scrolling page of the rules gets most of the sheet (the tabs step aside on the popouts)
        const body = [...modal.querySelectorAll('*')].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight);
        const bodyH = body ? body.getBoundingClientRect().height : 0;
        if (body && bodyH < Math.min(sheet.height, innerHeight) * 0.5) bad.push(`the rules page is ${Math.round(bodyH)} px of a ${Math.round(Math.min(sheet.height, innerHeight))} px sheet`);
        return { n: vals.length, bad, top: vals.map((v) => v.textContent.trim()).sort((a, b) => b.length - a.length)[0] };
      });
      top = r.top ?? top;
      if (!r.n || r.bad.length) bad.push(`${w}x${h}: ${r.n} values; ${[...new Set(r.bad)].slice(0, 3).join('; ')}`);
      await closeModal(s.page);
    }
    check(`${c.cur} ${c.lang}${c.social ? ' Stake.us' : ''} at the biggest play amount, ${SIZES.length} sizes 1920x1080 to 320x180: no sideways scroll, every win whole in its card, the content shows (top win ${top})`, bad.length === 0, bad.slice(0, 5));
    await s.ctx.close();
  }
});

/* ------------------------------------------------------------------ Lullaby's review figures at 375x667 */
const hudGeometry = (page) =>
  page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const vals = ['balance', 'win', 'bet'].map((k) => document.querySelector(`.hud [data-k="${k}"]`)).filter((e) => e && e.offsetParent);
    const meters = [...document.querySelectorAll('.hud .meter')].filter((e) => e.offsetParent);
    const bad = [];
    for (let i = 0; i < meters.length; i++)
      for (let j = i + 1; j < meters.length; j++) {
        const a = rect(meters[i]);
        const b = rect(meters[j]);
        if (!meters[i].contains(meters[j]) && !meters[j].contains(meters[i]) && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5) bad.push(`${meters[i].className} x ${meters[j].className}`);
      }
    for (const v of vals) {
      const m = v.closest('.meter') ?? v.parentElement;
      const mr = rect(m);
      const kids = [...v.querySelectorAll('.lt, .lt-fb, svg')];
      const boxes = (kids.length ? kids : [v]).map(rect);
      const top = Math.min(...boxes.map((x) => x.top));
      const bot = Math.max(...boxes.map((x) => x.bottom));
      const l = Math.min(...boxes.map((x) => x.left));
      const r = Math.max(...boxes.map((x) => x.right));
      const tx = v.getAttribute('aria-label') || v.textContent;
      if (v.scrollWidth > v.clientWidth + 1 || v.scrollHeight > v.clientHeight + 2) bad.push(`${v.dataset.k} clipped "${tx}"`);
      if (top < mr.top - 1 || bot > mr.bottom + 1 || l < mr.left - 0.5 || r > mr.right + 0.5) bad.push(`${v.dataset.k} leaves its plaque "${tx}"`);
      if (r > innerWidth + 0.5 || l < -0.5) bad.push(`${v.dataset.k} off screen`);
    }
    for (const lb of document.querySelectorAll('.hud .meter .lbl')) {
      if (!lb.offsetParent) continue;
      const mr = rect(lb.closest('.meter'));
      const b = rect(lb);
      if (b.top < mr.top - 1 || b.bottom > mr.bottom + 1 || lb.scrollWidth > lb.clientWidth + 1) bad.push(`label "${lb.textContent}" clipped`);
    }
    return { bad, text: Object.fromEntries(vals.map((v) => [v.dataset.k, v.getAttribute('aria-label') || v.textContent])), sizes: vals.map((e) => parseFloat(getComputedStyle(e).fontSize)) };
  });

await guard('hud375', async () => {
  const GC = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 1_000, 10_000, 70_000].map((v) => Math.round(v * M));
  for (const balance of [575 * M, 1_234_567.89 * M]) {
    const s = await open({ query: liveQuery('&social=true&lang=en&device=mobile'), w: 375, h: 667, mobile: true, currency: 'XGC', social: true, balance, levels: GC, def: 70_000 * M });
    await enter(s.page);
    const g = await hudGeometry(s.page);
    await s.page.screenshot({ path: `${out}/hud375-social-${balance / M}.png` });
    check(`375x667 Stake.us, play amount 70,000.00 GC, balance ${(balance / M).toLocaleString('en-US', { minimumFractionDigits: 2 })} GC: nothing clipped or overlapping`, g.text.bet === '70,000.00 GC' && !g.bad.length, { ...g.text, bad: g.bad.slice(0, 4) });
    await s.ctx.close();
  }
  if (X15) {
    // a 1.5x mode at 1.23 SC costs 1.845 SC: the replay's total shows it in full
    const s = await open({ query: `replay=true&game=qa&version=1&mode=${X15}&event=${books(X15)[0].id}&amount=${1.23 * M}&currency=XSC&social=true&lang=en&debug&mute`, w: 375, h: 667, mobile: true });
    await s.page.waitForSelector('.rp-play', { state: 'attached', timeout: 120000 });
    await s.page.waitForTimeout(3000);
    const tot = await s.page.evaluate(() => document.querySelector('.rp-item:is([data-k="totalBet"],[data-r="totalBet"]) .rp-val')?.getAttribute('aria-label') ?? document.querySelector('.rp-item:is([data-k="totalBet"],[data-r="totalBet"])')?.textContent ?? document.querySelector('.replay-bar, .replay-card')?.textContent);
    await s.page.screenshot({ path: `${out}/hud375-replay-${X15}-1.845.png` });
    check(`a ${X15} (1.5x) replay at 1.23 SC: the total shows 1.845 SC in full`, /1\.845 SC/.test(tot ?? ''), tot?.slice(0, 120));
    await s.ctx.close();
    // the 1.5x mode's own cost in the HUD / its tip, at 1.23 SC
    const t = await open({ query: liveQuery('&social=true&lang=en&device=mobile'), w: 375, h: 667, mobile: true, currency: 'XSC', social: true, balance: 575 * M, levels: [0.1, 0.5, 1, 1.23, 2].map((v) => v * M), def: 1.23 * M });
    await enter(t.page);
    const txt = await t.page.evaluate(() => [...document.querySelectorAll('.hud *')].map((e) => [e.getAttribute('title'), e.getAttribute('aria-label'), e.dataset?.tip].filter(Boolean).join(' ')).join(' ') + ' ' + document.querySelector('.hud').textContent);
    const m = txt.match(/1\.84\d? SC|1\.85 SC/);
    check(`the ${X15} cost at 1.23 SC in the HUD reads 1.845 SC where it is shown`, !m || m[0] === '1.845 SC', m?.[0] ?? 'not shown in the HUD');
    await t.ctx.close();
  } else check('a 1.5x cost in full (1.845 SC)', true, 'no 1.5x mode in this game');
});

await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${GAME}: ${results.length - failed.length}/${results.length} checks pass; evidence in ${out}`);
process.exit(failed.length ? 1 : 0);
