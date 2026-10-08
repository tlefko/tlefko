/** Audition page: drives the real game runtime (src/audio) with the shipped assets. */
import { audio, audioDebug, type SfxName, type Track } from '../../src/audio/index';
import { VARIANTS, TRACKS } from '../../src/audio/manifest';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// exposed for tools/audio-lab/smoke.mjs
(window as unknown as { __audio: unknown }).__audio = { audio, audioDebug, VARIANTS, TRACKS };

interface SoundMeta { id: string; name: string; variant: number; desc: string; kind: string; bank: string }
interface QaRow { file: string; kind: string; seconds: number; I: number; mMax: number; samplePeak: number; truePeak: number; ok: boolean; notes?: string }

const SFX_ORDER: SfxName[] = [
  'uiClick', 'uiToggle', 'uiOpen', 'uiClose', 'betUp', 'betDown', 'spinPress', 'buy', 'error', 'iris',
  'reelDrop', 'reelStop', 'symbolFall', 'sixLand', 'sixIgnite', 'fsLand', 'anticipationStart', 'anticipationEnd',
  'win', 'pop', 'cascade', 'wheelAppear', 'wheelTick', 'wheelLand', 'howl',
  'cashBronze', 'cashSilver', 'cashGold', 'multAdd', 'multMul', 'maxWin',
  'barTick', 'barApply', 'bonusTrigger', 'bonusIntro', 'bonusEnd', 'retrigger',
  'bigWinStart', 'bigWinTier', 'bigWinEnd', 'coin',
  'explode', 'blastDebris', 'wildLand', 'meterFlame', 'meterFull', 'hounds', 'inferno', 'boost',
];

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
for (const t of ['base', 'tantrum', 'witching', 'limbo', 'bigwin', 'none'] as Track[]) {
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
for (const name of ['anticipation', 'wheelSpin'] as const) {
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
    audio.play('spinPress');
    await wait(0.35);
    for (let c = 0; c < 6; c++) audio.play(c === 5 ? 'reelStop' : 'reelDrop', { index: c, delay: c * 0.11, pan: (c - 2.5) / 4 });
  },
  'cascade chain': async () => {
    for (let k = 0; k < 5; k++) {
      audio.play('win', { index: k });
      for (let i = 0; i < 8; i++) audio.play('pop', { delay: 0.25 + i * 0.01, pan: Math.random() * 1.6 - 0.8 });
      audio.play('cascade', { delay: 0.45 });
      for (let i = 0; i < 6; i++) audio.play('symbolFall', { delay: 0.5 + i * 0.05 });
      await wait(1.0);
    }
  },
  'keg + wheel': async () => {
    audio.play('sixLand');
    await wait(0.8);
    audio.play('sixIgnite');
    await wait(0.6);
    audio.play('wheelAppear');
    audio.play('howl', { delay: 0.3 });
    await wait(0.5);
    audio.loop('wheelSpin', true);
    await wait(1.6);
    audio.loop('wheelSpin', false);
    let gap = 0.06;
    for (let i = 0; i < 14; i++) {
      audio.play('wheelTick', { index: i });
      await wait(gap);
      gap *= 1.18;
    }
    audio.play('wheelLand');
    await wait(0.4);
    audio.play('cashGold');
    for (let i = 0; i < 12; i++) audio.play('coin', { delay: 0.2 + i * 0.06, pan: Math.random() * 1.4 - 0.7 });
  },
  'bar count + apply': async () => {
    for (let i = 0; i < 40; i++) {
      audio.play('barTick', { index: i });
      await wait(0.035);
    }
    audio.play('multAdd');
    await wait(0.6);
    audio.play('multMul');
    await wait(0.8);
    audio.play('barApply');
  },
  anticipation: async () => {
    audio.play('anticipationStart');
    audio.loop('anticipation', true);
    for (let k = 1; k <= 6; k++) {
      audio.intensity(k / 6);
      audio.play('fsLand', { index: k });
      await wait(0.9);
    }
    audio.loop('anticipation', false);
    audio.intensity(0);
    audio.play('anticipationEnd');
    audio.play('bonusTrigger', { delay: 0.2 });
  },
  'big win': async () => {
    audio.music('bigwin', { fade: 0.3 });
    audio.play('bigWinStart');
    for (let t = 0; t < 4; t++) {
      await wait(1.8);
      audio.play('bigWinTier', { index: t });
      for (let i = 0; i < 10; i++) audio.play('coin', { delay: i * 0.08, pan: Math.random() * 1.6 - 0.8 });
    }
    await wait(1.8);
    audio.play('bigWinEnd');
    await wait(2.2);
    audio.music('base', { fade: 1.2 });
  },
  'witching ramp': async () => {
    audio.music('witching', { fade: 1 });
    for (let i = 0; i <= 20; i++) {
      audio.intensity(i / 20);
      intEl.value = String(i / 20);
      $('intV').textContent = (i / 20).toFixed(2);
      await wait(0.6);
    }
  },
  'powder keg chain': async () => {
    audio.play('wildLand');
    await wait(0.5);
    for (let k = 1; k <= 6; k++) {
      audio.play('explode', { index: k, pan: (k % 3) / 2 - 0.5 });
      for (let i = 0; i < 5; i++) audio.play('blastDebris', { delay: 0.15 + i * 0.07, pan: Math.random() * 1.6 - 0.8 });
      audio.play('meterFlame', { index: k, delay: 0.3 });
      await wait(0.55);
    }
    for (let k = 7; k <= 10; k++) {
      audio.play('meterFlame', { index: k });
      await wait(0.18);
    }
    audio.play('meterFull');
  },
  "captain's wheel": async () => {
    audio.play('wheelAppear');
    audio.loop('wheelSpin', true);
    await wait(1.4);
    audio.loop('wheelSpin', false);
    audio.play('wheelLand');
    await wait(0.8);
    audio.play('hounds', { index: 3 });
    await wait(1.2);
    audio.play('inferno');
    await wait(1.4);
    for (const lvl of [2, 3, 5, 10, 20]) {
      audio.play('boost', { index: lvl });
      await wait(0.7);
    }
  },
  'kaboom bomb': async () => {
    const p = (n: string, o: Parameters<typeof audio.play>[1] = {}) => audio.play(n as SfxName, o);
    p('bombLand');
    await wait(0.9);
    for (let k = 0; k < 3; k++) {
      p('bombTick');
      await wait(0.5);
    }
    for (let size = 2; size <= 5; size++) {
      p('explode', { index: size });
      p('bombGrow', { index: size, delay: 0.08 });
      await wait(0.9);
    }
    p('bombHotLoop');
    await wait(1.2);
    p('endRumble');
    await wait(1.9);
    p('bombBlast', { index: 5 });
    p('bombChain', { delay: 0.35 });
    p('bombChain', { delay: 0.7 });
  },
  "captain's throw": async () => {
    const p = (n: string, o: Parameters<typeof audio.play>[1] = {}) => audio.play(n as SfxName, o);
    p('capBelt');
    for (let k = 1; k <= 3; k++) p('capChargePip', { index: k, delay: 0.5 + k * 0.45 });
    p('capChargeFull', { delay: 2 });
    p('capWindup', { delay: 3.2 });
    p('capThrow', { delay: 4.2 });
    p('parrotSquawk', { delay: 4.9 });
    p('bombLand', { delay: 5.1 });
  },
  'stress (voice cap)': async () => {
    for (let i = 0; i < 200; i++) {
      audio.play(i % 2 ? 'coin' : 'barTick', { index: i });
      if (i % 20 === 0) audio.play('pop');
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
  const names: string[] = [...SFX_ORDER, ...Object.keys(VARIANTS).filter((n) => !(SFX_ORDER as string[]).includes(n) && n !== 'anticipation' && n !== 'wheelSpin')];
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
    const play = document.createElement('button');
    play.textContent = v && v.ids.length > 1 ? 'random' : 'play';
    play.onclick = async () => {
      await start();
      audio.play(name as SfxName);
    };
    row.appendChild(play);
    if (v && v.ids.length > 1) {
      v.ids.forEach((_, i) => {
        const num = v.nums?.[i] ?? v.base + i;
        const b = document.createElement('button');
        b.textContent = String(num);
        b.onclick = async () => {
          await start();
          audio.play(name as SfxName, { index: num });
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
  // one pip per beat of the playing track's bar (6/8 base counts 2, the 3/4 waltz 3)
  setPips((d.track !== 'none' && TRACKS[d.track]?.beatsPerBar) || TRACKS.base?.beatsPerBar || 4);
}, 500);
