/** Render host page: exposes window.__lab for the Node build script, plus a live preview UI. */
import { SFX, TRACKS } from './registry';
import { renderSfx, renderTrack, SR, type RenderResult } from './pipeline';
import { encodeWav } from './core/dsp';

async function save(path: string, data: ArrayBuffer): Promise<void> {
  const r = await fetch(`/__lab/save?path=${encodeURIComponent(path)}`, { method: 'POST', body: data });
  if (!r.ok) throw new Error(`save ${path}: HTTP ${r.status}`);
}

function sfxDef(id: string) {
  const d = SFX.find((x) => x.id === id);
  if (!d) throw new Error(`unknown sfx ${id}`);
  return d;
}
function trackDef(id: string) {
  const d = TRACKS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown track ${id}`);
  return d;
}

const api = {
  list() {
    return {
      sfx: SFX.map((d) => ({ id: d.id, name: d.name, variant: d.variant, bank: d.bank, kind: d.kind, level: d.level, seconds: d.seconds, desc: d.desc })),
      tracks: TRACKS.map((t) => ({ id: t.id, title: t.title, desc: t.desc, bpm: t.bpm, beatsPerBar: t.beatsPerBar, bars: t.bars, stems: (t.stems ?? []).map((s) => s.id) })),
    };
  },
  async renderSfx(id: string) {
    const t0 = performance.now();
    const r = await renderSfx(sfxDef(id));
    await save(`wav/sfx/${id}.wav`, encodeWav(r.chs, SR));
    return { ...r.meta, ms: Math.round(performance.now() - t0) };
  },
  async renderTrack(id: string) {
    const t0 = performance.now();
    const rs = await renderTrack(trackDef(id));
    for (const r of rs) await save(`wav/music/${r.meta.id}.wav`, encodeWav(r.chs, SR));
    return { parts: rs.map((r) => r.meta), ms: Math.round(performance.now() - t0) };
  },
};
(window as unknown as { __lab: typeof api }).__lab = api;

// ------------------------------------------------------------------ live preview UI
let actx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
const status = document.getElementById('status');

function playResult(r: RenderResult, loop: boolean) {
  actx ??= new AudioContext({ sampleRate: SR });
  void actx.resume();
  current?.stop();
  const b = actx.createBuffer(r.chs.length, r.chs[0].length, SR);
  r.chs.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  const src = actx.createBufferSource();
  src.buffer = b;
  src.loop = loop;
  src.connect(actx.destination);
  src.start();
  current = src;
}

function button(parent: HTMLElement, label: string, fn: (btn: HTMLButtonElement) => Promise<void>) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.onclick = async () => {
    btn.classList.add('busy');
    try {
      await fn(btn);
    } catch (e) {
      if (status) status.textContent = String(e);
    } finally {
      btn.classList.remove('busy');
    }
  };
  parent.appendChild(btn);
}

const tracksEl = document.getElementById('tracks');
const sfxEl = document.getElementById('sfx');
if (tracksEl && sfxEl) {
  button(tracksEl, 'stop', async () => { current?.stop(); current = null; });
  for (const t of TRACKS) {
    button(tracksEl, t.title, async () => {
      if (status) status.textContent = `rendering ${t.id}...`;
      const rs = await renderTrack(t);
      playResult(rs[0], true);
      if (status) status.textContent = `${t.id}: ${(rs[0].chs[0].length / SR).toFixed(2)} s loop`;
    });
    for (const st of t.stems ?? []) {
      button(tracksEl, `${t.title} + ${st.id}`, async () => {
        const rs = await renderTrack(t);
        const mix = rs[0].chs.map((c, ch) => c.map((v, i) => v + rs[1 + (t.stems ?? []).indexOf(st)].chs[ch][i]));
        playResult({ chs: mix, meta: {} }, true);
      });
    }
  }
  for (const d of SFX) {
    button(sfxEl, d.id, async () => {
      const r = await renderSfx(d);
      playResult(r, d.kind === 'loop');
      if (status) status.textContent = `${d.id}: ${(r.chs[0].length / SR).toFixed(3)} s — ${d.desc}`;
    });
  }
}
