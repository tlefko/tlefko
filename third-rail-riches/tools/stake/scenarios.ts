/**
 * Pick QA / demo scenario books from the published math.
 *
 *   npx tsx tools/stake/scenarios.ts [--dir stake-math/publish] [--out stake-math/scenarios.json]
 *
 * Per mode, one representative book (plus a few alternates) for each scenario: zero win, small win,
 * big win (>= 20x for BASE / BOOST, >= 2x cost for buys), max win, bonus trigger (BASE / BOOST),
 * retrigger, a train haul, a Junction branch, two or more locomotives, a double branch (a branch
 * that branches again), a power level-up, the x10 power level, a full row of coins collected and a
 * Fare Coin of 100x or more.
 * Among the candidates the smallest books are preferred (they keep the demo pack light); every pick
 * has non-zero weight.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Book, BookEvent } from '../../src/stake/book';
import { CAP_HUNDREDTHS, MODES, fileNames, isSpinMode, parseCsv, readBooks, type ModeSpec } from './common';

export const SCENARIOS = ['zero', 'small', 'big', 'max', 'bonus', 'retrigger', 'train', 'branch', 'multi_loco', 'double_branch', 'levelup', 'x10', 'full_row', 'big_coin'] as const;
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
    if (sp.trains.some((t) => t.parent >= 0)) out.add('branch');
    if (sp.trains.some((t) => t.parent >= 0 && sp.trains[t.parent].parent >= 0)) out.add('double_branch');
    if (sp.trains.filter((t) => t.parent < 0).length >= 2) out.add('multi_loco');
    if (sp.levelAfter > sp.levelBefore) out.add('levelup');
    if (sp.levelAfter >= 4 && sp.levelBefore < 4) out.add('x10');
    if (sp.trains.some((t) => t.coins.length >= 5)) out.add('full_row');
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
