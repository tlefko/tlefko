/** Audition page: drives the real game runtime (src/audio) with the shipped assets. */
import { audio, audioDebug, type SfxName, type Track } from '../../src/audio/index';
import { VARIANTS, TRACKS } from '../../src/audio/manifest';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// exposed for tools/audio-lab/smoke.mjs
(window as unknown as { __audio: unknown }).__audio = { audio, audioDebug, VARIANTS, TRACKS };

interface SoundMeta { id: string; name: string; variant: number; desc: string; kind: string; bank: string }
interface QaRow { file: string; kind: string; seconds: number; I: number; mMax: number; samplePeak: number; truePeak: number; ok: boolean; notes?: string }

/** Every runtime SFX id in a sensible order (the manifest's VARIANTS is the source of truth). */
const SFX_ORDER: string[] = [
  'uiClick', 'uiToggle', 'uiOpen', 'uiClose', 'betUp', 'betDown', 'spinPress', 'buy', 'error', 'iris', 'boostOn', 'boostOff', 'lowPowerClick',
  'reelDrop', 'reelStop', 'ticketLand', 'coinLand', 'locoLand', 'switchLand', 'wildLand',
  'win', 'clusterTrace', 'symPretzel', 'symCoffee', 'symNewspaper', 'symUmbrella', 'symPigeon', 'symCat', 'symBulldog', 'symRat', 'symConductor',
  'whistle', 'trainDepart', 'trainExit', 'trainBrake', 'coinCollect', 'switchThrow', 'branch', 'haulCount', 'haulMult', 'barTick', 'barApply',
  'anticipationStart', 'anticipationEnd', 'bonusTrigger', 'bonusIntro', 'bonusEnd', 'retrigger', 'powerStep', 'levelUp', 'goldenArrive',
  'bigWinStart', 'bigWinTier', 'bigWinEnd', 'maxWin', 'tierSlam',
  'introSting', 'playSting', 'carouselWhoosh', 'coachPop',
];
const LOOPS = ['anticipation', 'trainRun'] as const;
/** SfxName in src/audio/index.ts is typed separately; the lab plays any manifest id. */
const play = (name: string, o: Parameters<typeof audio.play>[1] = {}) => audio.play(name as SfxName, o);

let started = false;
let fade = 0.9;
const status = $('status');

async function start() {
  await audio.init();
  if (!started) {
    started = true;
    status.textContent = 'loading...';
    await audio.ready;
    status.textContent = 'ready';
    $('start').textContent = 'Audio running';
  }
}
$('start').onclick = () => void start();

function toggle(btn: HTMLElement, label: string, fn: (on: boolean) => void) {
  let on = true;
  btn.onclick = () => {
    on = !on;
    btn.classList.toggle('on', on);
    btn.textContent = `${label} ${on ? 'on' : 'off'}`;
    fn(on);
  };
}
toggle($('musicOn'), 'music', (on) => audio.setMusicEnabled(on));
toggle($('sfxOn'), 'sfx', (on) => audio.setSfxEnabled(on));
const vol = $<HTMLInputElement>('vol');
audio.setVolume(parseFloat(vol.value));
vol.oninput = () => audio.setVolume(parseFloat(vol.value));
const fadeEl = $<HTMLInputElement>('fade');
fadeEl.oninput = () => {
  fade = parseFloat(fadeEl.value);
  $('fadeV').textContent = `${fade.toFixed(1)} s`;
};
const intEl = $<HTMLInputElement>('intensity');
intEl.oninput = () => {
  audio.intensity(parseFloat(intEl.value));
  $('intV').textContent = parseFloat(intEl.value).toFixed(2);
};
$('duck').onclick = () => audio.duck(0.6, 2);

// ---------------------------------------------------------------- music
const trackBtns = new Map<Track, HTMLButtonElement>();
for (const t of ['base', 'rush', 'last', 'bigwin', 'surge', 'none'] as Track[]) {
  const b = document.createElement('button');
  const info = t === 'none' ? null : TRACKS[t];
  b.textContent = info ? `${t} (${info.bpm} bpm)` : t;
  b.onclick = async () => {
    await start();
    audio.music(t, { fade });
    trackBtns.forEach((x, k) => x.classList.toggle('on', k === t));
  };
  trackBtns.set(t, b);
  $('tracks').appendChild(b);
}

// ---------------------------------------------------------------- loops
for (const name of LOOPS) {
  const b = document.createElement('button');
  let on = false;
  b.textContent = `loop ${name}`;
  b.onclick = async () => {
    await start();
    on = !on;
    b.classList.toggle('on', on);
    audio.loop(name, on);
  };
  $('loops').appendChild(b);
}

// ---------------------------------------------------------------- demos (game-like sequences)
const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const demos: Record<string, () => Promise<void>> = {
  'spin + drop': async () => {
    play('spinPress');
    await wait(0.35);
    for (let c = 0; c < 6; c++) play(c === 5 ? 'reelStop' : 'reelDrop', { index: c, delay: c * 0.11, pan: (c - 2.5) / 4 });
  },
  'landings': async () => {
    for (let k = 1; k <= 6; k++) {
      play('ticketLand', { index: k });
      await wait(0.7);
    }
    for (let m = 0; m < 4; m++) {
      play('coinLand', { index: m });
      await wait(0.45);
    }
    play('locoLand');
    await wait(0.7);
    play('switchLand');
    await wait(0.5);
    play('wildLand');
  },
  'way win': async () => {
    play('win');
    play('clusterTrace', { delay: 0.05 });
    for (const [k, n] of ['symPretzel', 'symCoffee', 'symNewspaper', 'symUmbrella', 'symPigeon', 'symCat', 'symBulldog', 'symRat', 'symConductor'].entries()) play(n, { delay: 0.8 + k * 0.75 });
  },
  'train run': async () => {
    play('whistle');
    await wait(0.9);
    play('trainDepart');
    await wait(0.9);
    audio.loop('trainRun', true);
    for (let k = 1; k <= 6; k++) {
      await wait(0.42);
      play('coinCollect', { index: k });
      if (k === 3) {
        play('switchThrow');
        play('branch', { delay: 0.2 });
      }
    }
    await wait(0.4);
    audio.loop('trainRun', false);
    play('trainExit');
    await wait(1.2);
    for (let i = 0; i < 24; i++) {
      play('haulCount', { index: i });
      await wait(0.04);
    }
    play('haulMult');
  },
  'brake + coins 1..12': async () => {
    play('trainBrake');
    await wait(1.6);
    for (let k = 1; k <= 12; k++) {
      play('coinCollect', { index: k });
      await wait(0.16);
    }
  },
  'bar count + apply': async () => {
    for (let i = 0; i < 40; i++) {
      play('barTick', { index: i });
      await wait(0.035);
    }
    play('barApply');
  },
  anticipation: async () => {
    play('anticipationStart');
    audio.loop('anticipation', true);
    for (let k = 1; k <= 6; k++) {
      audio.intensity(k / 6);
      play('ticketLand', { index: k });
      await wait(0.9);
    }
    audio.loop('anticipation', false);
    audio.intensity(0);
    play('anticipationEnd');
    play('bonusTrigger', { delay: 0.2 });
  },
  'rush hour': async () => {
    play('bonusIntro');
    audio.music('rush', { fade: 1 });
    for (let i = 0; i <= 20; i++) {
      audio.intensity(i / 20);
      intEl.value = String(i / 20);
      $('intV').textContent = (i / 20).toFixed(2);
      await wait(0.6);
    }
  },
  'power meter': async () => {
    for (let k = 1; k <= 14; k++) {
      play('powerStep', { index: k });
      await wait(0.22);
      if (k === 12) play('levelUp');
    }
    await wait(1.2);
    play('retrigger');
  },
  'last train': async () => {
    audio.music('last', { fade: 1 });
    await wait(2);
    play('goldenArrive');
  },
  'big win': async () => {
    audio.music('bigwin', { fade: 0.3 });
    play('bigWinStart');
    for (let t = 0; t < 4; t++) {
      await wait(1.8);
      play('tierSlam');
      play('bigWinTier', { index: t });
      for (let i = 0; i < 10; i++) play('coinLand', { index: i % 4, delay: i * 0.08, pan: Math.random() * 1.6 - 0.8 });
    }
    await wait(1.8);
    play('bigWinEnd');
    await wait(2.2);
    audio.music('base', { fade: 1.2 });
  },
  'stress (voice cap)': async () => {
    for (let i = 0; i < 200; i++) {
      play(i % 2 ? 'coinCollect' : 'barTick', { index: i });
      if (i % 20 === 0) play('reelDrop');
      await wait(0.005);
    }
  },
};
for (const [label, fn] of Object.entries(demos)) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = async () => {
    await start();
    await fn();
  };
  $('demos').appendChild(b);
}

// ---------------------------------------------------------------- sfx cards
async function buildSfx() {
  let meta: SoundMeta[] = [];
  try {
    meta = ((await (await fetch(new URL('./sounds.json', import.meta.url))).json()) as { sfx: SoundMeta[] }).sfx;
  } catch {
    /* optional */
  }
  const desc = (name: string) => meta.find((m) => m.name === name)?.desc ?? '';
  // the typed runtime list first, then every other name in the manifest (newer sounds, loops played once)
  const names: string[] = [...SFX_ORDER.filter((n) => VARIANTS[n]), ...Object.keys(VARIANTS).filter((n) => !SFX_ORDER.includes(n) && !(LOOPS as readonly string[]).includes(n))];
  for (const name of names) {
    const v = VARIANTS[name];
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('div');
    title.className = 'name';
    title.textContent = name;
    const d = document.createElement('div');
    d.className = 'desc';
    d.textContent = desc(name);
    const row = document.createElement('div');
    row.className = 'row idx';
    const btn = document.createElement('button');
    btn.textContent = v && v.ids.length > 1 ? 'random' : 'play';
    btn.onclick = async () => {
      await start();
      play(name);
    };
    row.appendChild(btn);
    if (v && v.ids.length > 1) {
      v.ids.forEach((_, i) => {
        const num = v.nums?.[i] ?? v.base + i;
        const b = document.createElement('button');
        b.textContent = String(num);
        b.onclick = async () => {
          await start();
          play(name, { index: num });
        };
        row.appendChild(b);
      });
    }
    card.append(title, d, row);
    $('sfx').appendChild(card);
  }
}
void buildSfx();

// ---------------------------------------------------------------- measurements
async function buildQa() {
  try {
    const r = (await (await fetch(new URL('./qa-report.json', import.meta.url))).json()) as { rows: QaRow[]; generated: string };
    const head = '<tr><th>asset</th><th>kind</th><th>s</th><th>LUFS-I</th><th>LUFS-M max</th><th>sample pk</th><th>true pk</th><th>ok</th><th>notes</th></tr>';
    const rows = r.rows
      .map((x) => `<tr><td>${x.file}</td><td>${x.kind}</td><td>${x.seconds.toFixed(2)}</td><td>${x.I.toFixed(1)}</td><td>${x.mMax.toFixed(1)}</td><td>${x.samplePeak.toFixed(1)}</td><td>${x.truePeak.toFixed(1)}</td><td class="${x.ok ? '' : 'bad'}">${x.ok ? 'yes' : 'NO'}</td><td>${x.notes ?? ''}</td></tr>`)
      .join('');
    $('qa').innerHTML = `<p style="color:var(--dim)">generated ${r.generated}</p><table>${head}${rows}</table>`;
  } catch {
    /* not generated yet */
  }
}
void buildQa();

// ---------------------------------------------------------------- beat display + debug
const pips = $('pips');
function setPips(n: number) {
  while (pips.children.length < n) pips.appendChild(Object.assign(document.createElement('div'), { className: 'pip' }));
  while (pips.children.length > n) pips.lastElementChild?.remove();
}
setPips(TRACKS.base?.beatsPerBar ?? 4);
function frame() {
  const b = audio.beat();
  const squash = 1 - 0.35 * Math.pow(1 - b.phase, 3);
  $('dot').style.transform = `scale(${2 - squash}, ${squash})`;
  [...pips.children].forEach((p, i) => p.classList.toggle('on', i === b.beat));
  $('beatTxt').textContent = `bpm ${b.bpm}  bar ${b.bar + 1}  beat ${b.beat + 1}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => {
  const d = audioDebug();
  $('debug').textContent = JSON.stringify(d, null, 1);
  // one pip per beat of the playing track's bar
  setPips((d.track !== 'none' && TRACKS[d.track]?.beatsPerBar) || TRACKS.base?.beatsPerBar || 4);
}, 500);
