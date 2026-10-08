/** Query parameters Stake Engine passes to the game (play and replay). */
const q = new URLSearchParams(location.search);

export const LANGS = ['ar', 'de', 'en', 'es', 'fi', 'fr', 'hi', 'id', 'ja', 'ko', 'pl', 'pt', 'ru', 'tr', 'vi', 'zh'] as const;

export const env = {
  sessionID: q.get('sessionID') ?? '',
  rgsUrl: q.get('rgs_url') ?? '',
  lang: (q.get('lang') === 'br' ? 'pt' : q.get('lang')) || 'en',
  device: q.get('device') === 'mobile' ? 'mobile' : 'desktop',
  social: q.get('social') === 'true',
  currencyHint: q.get('currency') ?? '',
  // replay
  replay: q.get('replay') === 'true',
  game: q.get('game') ?? '',
  version: q.get('version') ?? '',
  mode: q.get('mode') ?? '',
  event: q.get('event') ?? '',
  amount: Number(q.get('amount')) || 0,
  // local only
  debug: q.has('debug'),
};

/**
 * Real RGS when Stake launched us; otherwise the in-browser demo RGS. Any Stake launch parameter (a session
 * or an RGS) means a live game: a broken, empty or missing rgs_url then fails at authenticate with an error on
 * the loading screen (Stake approval 2), never a playable demo. A replay with no rgs_url is the local demo replay.
 */
export const isLive = () => !!(env.rgsUrl || env.sessionID);
