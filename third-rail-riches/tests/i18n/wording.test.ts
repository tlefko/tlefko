/**
 * Player-facing wording gates (Stake Engine review; ported from Lucifer's Lullaby, f865a5d).
 *
 * 1. Social casino (Stake.us): no restricted gambling term may reach the player. The list is Stake
 *    Engine's "Jurisdiction Requirements" table
 *    (https://studio.engine.io/docs/approval-guidelines/jurisdiction-requirements), checked against
 *    every string exactly as the player would see it in social mode: SOCIAL_EN over EN, with the
 *    {bet} placeholders filled by the social wording and markup stripped. (Every other language:
 *    tests/i18n/social-all-langs.test.ts.)
 * 2. The loading screen (static HTML, shown before any script runs and blind to social mode) is clean.
 * 3. In EVERY mode and EVERY language the rules link and the symbol wins heading carry no pay-family
 *    word: the owner saw "paytable" in the regular game and wants it gone everywhere.
 * 4. Every language file carries every English key, with the same {placeholders}, so a new string can
 *    never ship half-translated.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN, SOCIAL_EN, type StringKey } from '../../src/i18n/en';
import R from './restricted.json';

/** Restricted phrase (as the guidelines name it) -> how it is found, inflections included. */
const RESTRICTED: [string, RegExp][] = [
  ['win feature', /\bwin feature\b/i],
  ['pay / pays / paid / paying / payer / pay out / payout / paytable', /\bpa(?:y|id)[a-z]*/i],
  ['stake', /\bstakes?\b/i],
  ['bet / bets / betting / rebet / total bet / place your bets', /\b(?:re)?bet(?:s|ting)?\b/i],
  ['cash', /\bcash[a-z]*/i],
  ['money', /\bmoney\b/i],
  ['buy / bought / buy bonus / bonus buy', /\b(?:buy[a-z]*|bought)\b/i],
  ['purchase', /\bpurchas[a-z]*/i],
  ['cost of / at the cost of', /\bcost of\b/i],
  ['credit', /\bcredits?\b/i],
  ['gamble', /\bgambl[a-z]*/i],
  ['wager', /\bwager[a-z]*/i],
  ['deposit', /\bdeposit[a-z]*/i],
  ['withdraw', /\bwithdraw[a-z]*/i],
  ['currency', /\bcurrenc[a-z]*/i],
  ['fund', /\bfunds?\b/i],
  ["be awarded to player's accounts", /\bawarded to (?:the )?player/i],
];

const social = { ...EN, ...SOCIAL_EN } as Record<StringKey, string>;

/** A string as a social-mode player reads it. */
function rendered(s: string): string {
  return s
    .replace(/\{bet\}/g, social.betLower)
    .replace(/\{Bet\}/g, social.bet)
    .replace(/\{\w+\}/g, '9')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');
}

describe('social casino wording (Stake.us)', () => {
  it('contains no restricted gambling term in any player-facing string', () => {
    const hits: string[] = [];
    for (const [key, raw] of Object.entries(social)) {
      const text = rendered(raw);
      for (const [term, re] of RESTRICTED) {
        const m = text.match(re);
        if (m) hits.push(`${key}: "${m[0]}" (restricted: ${term}) in "${text}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the loading screen (static HTML, shown before any script runs) is clean too', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    const boot = [
      ...html.matchAll(/class="boot-tip"><span>([^<]*(?:<b>[^<]*<\/b>[^<]*)*)</g),
      ...html.matchAll(/^\s*'((?:[^'\\]|\\.)*)',?$/gm),
    ].map((m) => rendered(m[1]));
    expect(boot.length).toBeGreaterThan(1);
    const hits = boot.flatMap((text) => RESTRICTED.filter(([, re]) => re.test(text)).map(([term]) => `"${text}" (restricted: ${term})`));
    expect(hits).toEqual([]);
  });

  it('renames the replay fields exactly as the Engine review asked', () => {
    expect(social.replayBaseBet).toBe('Base Play');
    expect(social.replayCostMultiplier).toBe('Feature Multiplier');
    expect(social.replayPayoutMultiplier).toBe('Final Multiplier');
  });

  it('the checker itself catches every family it lists', () => {
    const samples = ['win feature', 'paytable', 'paying', 'stake', 'betting', 'cashout', 'money', 'bought', 'purchase', 'cost of', 'credits', 'gambling', 'wager', 'deposit', 'withdraw', 'currency', 'funds', 'awarded to player'];
    for (const s of samples) expect(RESTRICTED.some(([, re]) => re.test(s)), s).toBe(true);
    // ...and does not flag ordinary words that merely contain the letters
    for (const s of ['better', 'between', 'alphabet', 'played', 'display', 'replay', 'Play amount', 'multiplayer']) {
      expect(RESTRICTED.filter(([, re]) => re.test(s)).map(([term]) => term), s).toEqual([]);
    }
  });
});

describe('no paytable or pay wording in the rules link and the symbol wins heading, in any mode or language', () => {
  const dir = join(__dirname, '../../src/i18n/locales');
  const regex = R.regex as Record<string, string>;
  /** The keys the owner and the review look at: the menu's rules link and the rules' symbol wins heading. */
  const HEADINGS: StringKey[] = ['rulesLink', 'rPayTitle'];
  /** Each language's word for a paytable (what the regular game used to show in its rules link). */
  const PAYTABLE = /pay ?table|tabla de pagos|gewinntabelle|auszahlungstabelle|table des gains|tabela de pagamentos|tabela wypłat|таблиц\S* выплат|ödeme tablosu|bảng trả thưởng|赔付表|配当表|배당표|पे ?टेबल|tabel pembayaran|voittotaulukko|جدول الأرباح/iu;
  const langs: [string, Record<string, unknown>][] = [
    ['en', { ...EN, _social: SOCIAL_EN }],
    ...readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f): [string, Record<string, unknown>] => [f.replace('.json', ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
  ];
  for (const [lang, table] of langs) {
    const soc = (table._social ?? {}) as Record<string, string>;
    const re = new RegExp(regex[lang], 'iu');
    it(`${lang}: the headings use win wording in the regular and the social game`, () => {
      const hits: string[] = [];
      for (const k of HEADINGS) {
        for (const [mode, v] of [['regular', table[k] as string], ['social', soc[k] ?? (table[k] as string)]] as const) {
          const m = v.match(re);
          if (m) hits.push(`${mode} ${k}: "${m[0]}" in "${v}"`);
        }
      }
      expect(hits).toEqual([]);
    });
    it(`${lang}: no string in either mode names a paytable`, () => {
      const all = [...Object.entries(table).filter(([k]) => k !== '_social'), ...Object.entries(soc)] as [string, unknown][];
      expect(all.filter(([, v]) => typeof v === 'string' && PAYTABLE.test(v)).map(([k, v]) => `${k}: "${v}"`)).toEqual([]);
    });
  }
  it('the checker catches the old wording', () => {
    for (const old of ['Game rules and paytable', 'Symbol payouts', 'Reglas del juego y tabla de pagos', 'ゲームルールと配当表', 'Spielregeln und Gewinntabelle']) expect(PAYTABLE.test(old) || /pay/i.test(old), old).toBe(true);
    expect(new RegExp(regex.de, 'iu').test('Symbolauszahlungen')).toBe(true);
    expect(new RegExp(regex.es, 'iu').test('Pagos de símbolos')).toBe(true);
  });
});

describe('translations', () => {
  const dir = join(__dirname, '../../src/i18n/locales');
  const keys = Object.keys(EN) as StringKey[];
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const table = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, string>;
    it(`${file} has every English key`, () => {
      expect(keys.filter((k) => !(k in table))).toEqual([]);
    });
    it(`${file} keeps every {placeholder}`, () => {
      const wrong = keys.filter((k) => k in table && holes(table[k]).join() !== holes(EN[k]).join());
      expect(wrong).toEqual([]);
    });
  }
});
