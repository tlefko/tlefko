/**
 * Social casino (Stake.us) wording in every language: each string exactly as a social-mode player
 * sees it (src/i18n/index.ts: the locale's own social form for any key, else SOCIAL_EN, else the
 * normal text), markup and {placeholders} stripped, must contain no restricted gambling term of
 * that language (restricted.json: one pattern per language, used with flags "iu").
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN, SOCIAL_EN } from '../../src/i18n/en';
import R from './restricted.json';

const dir = join(__dirname, '../../src/i18n/locales');
const strip = (s: string) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\{\w+\}/g, ' ');
const regex = R.regex as Record<string, string>;
const controls = (R.positiveControls ?? {}) as Record<string, string[]>;
const en = EN as Record<string, string>;
const socialEn = SOCIAL_EN as Record<string, string>;

describe('social casino wording (Stake.us) in every language', () => {
  const langs: [string, Record<string, unknown>][] = [['en', {}], ...readdirSync(dir).filter((f) => f.endsWith('.json')).map((f): [string, Record<string, unknown>] => [f.replace('.json', ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))])];
  for (const [lang, table] of langs) {
    const soc = (table._social ?? {}) as Record<string, string>;
    const re = new RegExp(regex[lang], 'iu');
    it(`${lang}: nothing a social-mode player sees uses a restricted term`, () => {
      const hits: string[] = [];
      for (const k of Object.keys(en)) {
        const v = (lang !== 'en' && k in soc ? soc[k] : socialEn[k]) ?? (table[k] as string | undefined) ?? en[k];
        const m = strip(v).match(re);
        if (m) hits.push(`${k}: "${m[0]}" in "${strip(v).slice(0, 90)}"`);
      }
      expect(hits).toEqual([]);
    });
    if (lang !== 'en') {
      it(`${lang}: has its own social form for every key that needs one`, () => {
        expect(Object.keys(socialEn).filter((k) => !(k in soc))).toEqual([]);
      });
    }
    it(`${lang}: the checker still catches that language's restricted terms`, () => {
      expect(regex[lang], 'pattern present').toBeTruthy();
      for (const term of controls[lang] ?? []) expect(re.test(term), term).toBe(true);
    });
  }
});
