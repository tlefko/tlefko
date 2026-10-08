/**
 * Pick QA / demo scenario books from the published math.
 *
 *   npx tsx tools/stake/scenarios.ts [--dir stake-math/publish] [--out stake-math/scenarios.json]
 *
 * Per mode, one representative book (plus a few alternates) for each scenario: zero win, small win,
 * big win (>= 20x for BASE / BOOST, >= 2x cost for buys), max win, bonus trigger (BASE / BOOST),
 * retrigger, a train haul, a route win, a crash, a Signal redirect, a Security Check that clears
 * (Delay Repay) and one that holds the train (incident), two or more locomotives, a power level-up,
 * the x10 power level and a Fare Coin of 100x or more.
 * Among the candidates the smallest books are preferred (they keep the demo pack light); every pick
 * has non-zero weight.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Book, BookEvent } from '../../src/stake/book';
import { CAP_HUNDREDTHS, MODES, fileNames, isSpinMode, parseCsv, readBooks, type ModeSpec } from './common';

export const SCENARIOS = ['zero', 'small', 'big', 'max', 'bonus', 'retrigger', 'train', 'route', 'crash', 'redirect', 'clear', 'incident', 'multi_loco', 'levelup', 'x10', 'big_coin'] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface Pick {
  id: number;
  payoutMultiplier: number;
  bytes: number;
  alternates: number[];
}

export type ScenarioFile = Record<string, Partial<Record<Scenario, Pick>> & { missing: Scenario[] }>;

export function classify(book: Book, m: { kind: ModeSpec['kind']; cost: number }): Set<Scenario> {
  const out = new Set<Scenario>();
  const spin = m.kind === 'base' || m.kind === 'boost';
  const pay = book.payoutMultiplier;
  const x = pay / 100;
  if (pay === 0) out.add('zero');
  if (pay > 0 && (spin ? x <= 2 : x < 0.5 * m.cost)) out.add('small');
  if (spin ? x >= 20 : x >= 2 * m.cost) out.add('big');
  if (pay >= CAP_HUNDREDTHS) out.add('max');
  for (const e of book.events as BookEvent[]) {
    if (e.type === 'bonusStart' && spin) out.add('bonus');
    if (e.type !== 'spin') continue;
    const sp = e.spin;
    if (e.retrigger) out.add('retrigger');
    if (sp.trains.some((t) => t.coins.length > 0)) out.add('train');
    if (sp.routes.length) out.add('route');
    if (sp.crashes.length) out.add('crash');
    if (sp.trains.some((t) => t.steps.some((x) => x.event === 'redirect'))) out.add('redirect');
    if (sp.trains.some((t) => t.steps.some((x) => x.event === 'clear'))) out.add('clear');
    if (sp.trains.some((t) => t.steps.some((x) => x.event === 'held'))) out.add('incident');
    if (sp.trains.length >= 2) out.add('multi_loco');
    if (sp.levelAfter > sp.levelBefore) out.add('levelup');
    if (sp.levelAfter >= 4 && sp.levelBefore < 4) out.add('x10');
    if (Object.values(sp.v).some((v) => v >= 100)) out.add('big_coin');
  }
  return out;
}

async function main() {
  const { values } = parseArgs({ options: { dir: { type: 'string', default: 'stake-math/publish' }, out: { type: 'string' } } });
  const dir = resolve(values.dir!);
  const outPath = resolve(values.out ?? join(dirname(dir), 'scenarios.json'));
  const result: ScenarioFile = {};
  for (const m of MODES) {
    const f = fileNames(m.name);
    const { weight } = parseCsv(readFileSync(join(dir, f.weights), 'utf8'));
    const cand = new Map<Scenario, { id: number; pay: number; bytes: number }[]>();
    for await (const { book, line } of readBooks(join(dir, f.events))) {
      if (!(weight[book.id - 1] > 0n)) continue;
      for (const s of classify(book, m)) {
        let list = cand.get(s);
        if (!list) cand.set(s, (list = []));
        list.push({ id: book.id, pay: book.payoutMultiplier, bytes: line.length });
        if (list.length > 4000) {
          list.sort((a, b) => a.bytes - b.bytes || a.id - b.id);
          list.length = 50;
        }
      }
    }
    const picks: ScenarioFile[string] = { missing: [] };
    for (const s of SCENARIOS) {
      if (s === 'bonus' && !isSpinMode(m)) continue;
      const list = cand.get(s);
      if (!list?.length) {
        picks.missing.push(s);
        continue;
      }
      list.sort((a, b) => a.bytes - b.bytes || a.id - b.id);
      picks[s] = { id: list[0].id, payoutMultiplier: list[0].pay, bytes: list[0].bytes, alternates: list.slice(1, 6).map((x) => x.id) };
    }
    result[m.name] = picks;
    console.log(
      `${m.name}: ${SCENARIOS.filter((s) => picks[s]).map((s) => `${s}=#${picks[s]!.id}`).join(' ')}${picks.missing.length ? `  MISSING: ${picks.missing.join(', ')}` : ''}`,
    );
  }
  const tmp = `${outPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n');
  renameSync(tmp, outPath);
  console.log(`wrote ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('scenarios.ts')) await main();
