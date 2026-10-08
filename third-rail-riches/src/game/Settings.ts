/** Per-player preferences (speed, sound, quality). Never holds money: balances come from the RGS. */
const KEY = 'powder-keg-cove.settings.v1';
/**
 * Never stored or restored, even if some code sets them: Stake requires the bet to start at the
 * default level on every load (an open round restores its own bet from the RGS).
 */
const SESSION_ONLY = new Set(['bet', 'betIndex', 'betLevel']);

export interface HistoryItem {
  t: number;
  mode: string;
  betApi: number;
  costApi: number;
  winApi: number;
  bonus?: string;
  maxWin?: boolean;
}

type Listener = (value: unknown, key: string) => void;

/**
 * One store per page: every `Settings` instance reads and writes the same object, so a second
 * instance (quality.ts keeps one next to the Controller's) can never overwrite the other's keys
 * with a stale copy when it saves.
 */
let shared: Record<string, unknown> | null = null;
const history: HistoryItem[] = [];
const listeners = new Map<string, Set<Listener>>();

function load(): Record<string, unknown> {
  if (shared) return shared;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    shared = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    shared = {};
  }
  for (const k of SESSION_ONLY) delete shared[k];
  return shared;
}

export class Settings {
  data: Record<string, unknown> = load();
  history: HistoryItem[] = history; // this session only

  get<T>(k: string, fallback: T): T {
    return (this.data[k] as T) ?? fallback;
  }

  set(k: string, v: unknown) {
    const changed = this.data[k] !== v;
    this.data[k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(Object.entries(this.data).filter(([key]) => !SESSION_ONLY.has(key)))));
    } catch {
      /* storage unavailable */
    }
    if (changed) for (const fn of listeners.get(k) ?? []) fn(v, k);
  }

  /** Call `fn` whenever `k` changes (from any Settings instance). Returns an unsubscribe. */
  onChange(k: string, fn: Listener): () => void {
    let set = listeners.get(k);
    if (!set) listeners.set(k, (set = new Set()));
    set.add(fn);
    return () => void set.delete(fn);
  }
}
