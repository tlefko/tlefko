/**
 * Player-facing text in the language Stake passes as `lang` (16 supported). Only the active
 * language file is loaded. Missing keys fall back to English.
 *
 * Social-casino wording (Stake.us, `social=true`) replaces every restricted gambling term (see
 * Stake's jurisdiction requirements). English uses SOCIAL_EN; each locale file carries its own
 * social overrides in a `_social` object. With social wording on, a key that has a social form
 * never shows its normal text: a locale without its social form falls back to SOCIAL_EN.
 */
import { env, LANGS } from '../stake/env';
import { EN, SOCIAL_EN, type StringKey } from './en';

export type { StringKey };

const loaders = import.meta.glob('./locales/*.json') as Record<string, () => Promise<{ default: Record<string, string> }>>;

/**
 * The game's language. Stake.us (social mode) supports English only (Stake approval 39): `social=true`
 * selects English whatever `lang` says, and a social jurisdiction found at authenticate switches the game to
 * English (setSocialWording). These are live bindings: read them at use time.
 */
export let lang: string = env.social ? 'en' : (LANGS as readonly string[]).includes(env.lang) ? env.lang : 'en';
export let rtl = lang === 'ar';
/** Scripts whose letters join (no letter spacing, no glyph-by-glyph bitmap text). */
export let joinedScript = lang === 'ar' || lang === 'hi';
/** Scripts without spaces between words (wrapped text must break inside words). */
export let cjkScript = lang === 'ja' || lang === 'zh' || lang === 'ko';
/** Short banners drawn glyph by glyph with the bitmap number font: kept in English for joined scripts. */
const BITMAP_KEYS = new Set<StringKey>(['tantrum', 'hounds', 'inferno', 'plusFreeSpins', 'freeSpinsCaps']);
let table: Record<string, string> = {};
let socialTable: Record<string, string> = {};
let social = env.social;

/** Load the active language (call once at boot, before anything renders text). */
export async function loadLanguage(): Promise<void> {
  document.documentElement.lang = lang;
  if (lang === 'en') return;
  const load = loaders[`./locales/${lang}.json`];
  if (!load) return;
  try {
    const data = (await load()).default as Record<string, unknown>;
    const { _social, ...rest } = data;
    table = rest as Record<string, string>;
    socialTable = _social && typeof _social === 'object' ? (_social as Record<string, string>) : {};
  } catch {
    table = {}; // English fallback
    socialTable = {};
  }
}

/** Social wording on or off; returns true when the language changed (a Stake.us session switches to English). */
export function setSocialWording(on: boolean): boolean {
  social = on;
  // Stake.us is English only: a social session the URL did not announce drops the loaded language
  if (on && lang !== 'en') {
    lang = 'en';
    rtl = joinedScript = cjkScript = false;
    table = {};
    socialTable = {};
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    return true;
  }
  return false;
}

/** Translate `key`, filling `{name}` placeholders from `vars`. */
export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s = (social ? socialText(key) : undefined) ?? (joinedScript && BITMAP_KEYS.has(key) ? undefined : table[key]) ?? EN[key];
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/**
 * The social (Stake.us) form of `key`, if it has one: the locale's own, else the English one. A
 * locale may also give a social form for a key whose English needs none (its own translation used
 * a restricted word there).
 */
function socialText(key: StringKey): string | undefined {
  if (lang !== 'en' && key in socialTable) return socialTable[key];
  return SOCIAL_EN[key];
}

/** Number formatting for counts shown in text (1,000 / 1.000 / ١٬٠٠٠ ...). Money uses stake/money. */
export const num = (n: number) => n.toLocaleString(lang === 'en' ? 'en-US' : lang);
