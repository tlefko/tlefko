#!/usr/bin/env node
// Build every game sound: render (Tone.Offline in headless Chromium) -> normalise -> pack -> MP3.
//
//   node tools/audio-lab/render.mjs                 render everything and rebuild public/audio
//   node tools/audio-lab/render.mjs --only=howl,base  re-render just these ids (others reuse WAVs)
//   node tools/audio-lab/render.mjs --skip-render    rebuild banks/MP3/manifest from existing WAVs
//
// Outputs: public/audio/*.mp3, src/audio/manifest.ts, tools/audio-lab/out/{wav,build-report.json}
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { startLabServer, OUT_DIR, ROOT } from './lib/server.mjs';
import { readWav, writeWav, loudness, encodeMp3, samplePeak, db, undb, decodeToChannels } from './lib/audio-io.mjs';

const SR = 44100;
const MUSIC_TARGET_LUFS = -18;
const PEAK_CEILING_DBTP = -1.5; // leaves room for MP3 overshoot; QA checks decoded peak <= -1 dBFS
const MUSIC_KBPS = 160;
const SFX_KBPS = 128;
const BANK_LEAD = Math.round(0.05 * SR);
const BANK_GAP = Math.round(0.06 * SR);
const SFX_LOOP_PAD = Math.round(0.12 * SR);
const MUSIC_PAD = Math.round(0.25 * SR);

const PUBLIC_AUDIO = path.join(ROOT, 'public', 'audio');
const MANIFEST_TS = path.join(ROOT, 'src', 'audio', 'manifest.ts');
const WAV_DIR = path.join(OUT_DIR, 'wav');
const BUILD_DIR = path.join(OUT_DIR, 'build');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;

fs.mkdirSync(WAV_DIR, { recursive: true });
fs.mkdirSync(BUILD_DIR, { recursive: true });
fs.mkdirSync(PUBLIC_AUDIO, { recursive: true });

// ------------------------------------------------------------------ 1. render
async function render() {
  const { url, close } = await startLabServer();
  const browser = await chromium.launch({
    args: [
      '--autoplay-policy=no-user-gesture-required',
      // Tone.Offline yields with setTimeout while rendering; never let Chromium throttle those timers
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
    ],
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[page error]', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning' || m.text().startsWith('[render]') || m.text().startsWith('[mixer]')) console.log(`[page ${m.type()}]`, m.text());
    });
    // first load can take a while: Vite pre-bundles Tone.js on demand
    const tLoad = Date.now();
    await page.goto(`${url}tools/audio-lab/render.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__lab !== undefined, null, { timeout: 180000 });
    const catalog = await page.evaluate(() => window.__lab.list());
    console.log(`render page ready in ${((Date.now() - tLoad) / 1000).toFixed(1)} s`);
    fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
    const t0 = Date.now();
    const missing = (sub, id) => !fs.existsSync(path.join(WAV_DIR, sub, `${id}.wav`));
    for (const tr of catalog.tracks) {
      if (only && !only.has(tr.id) && !missing('music', tr.id)) continue;
      const r = await page.evaluate((id) => window.__lab.renderTrack(id), tr.id);
      console.log(`track ${tr.id.padEnd(10)} ${String(r.ms).padStart(6)} ms  (${r.parts.map((p) => p.id).join(', ')})`);
    }
    for (const s of catalog.sfx) {
      if (only && !only.has(s.id) && !only.has(s.name) && !missing('sfx', s.id)) continue;
      const r = await page.evaluate((id) => window.__lab.renderSfx(id), s.id);
      console.log(`sfx   ${s.id.padEnd(20)} ${String(r.ms).padStart(5)} ms  ${(r.samples / SR).toFixed(3)} s`);
    }
    console.log(`rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return catalog;
  } finally {
    await browser.close();
    await close();
  }
}

// ------------------------------------------------------------------ 2. normalise + pack + encode
const CACHE_FILE = path.join(OUT_DIR, 'loudness-cache.json');
const lcache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
function measure(file) {
  const h = fileHash(file);
  if (!lcache[h]) lcache[h] = loudness(file, { padTo: 1.2 });
  return lcache[h];
}

function gainFor(file, targetFn) {
  const m = measure(file);
  const want = targetFn(m);
  const ceiling = PEAK_CEILING_DBTP - m.truePeak;
  const gainDb = Math.min(want, ceiling);
  return { m, gainDb, limited: want > ceiling + 0.05 };
}

function applyGain(chs, gainDb) {
  const g = undb(gainDb);
  return chs.map((c) => c.map((v) => v * g));
}

function toStereo(chs) {
  return chs.length >= 2 ? chs.slice(0, 2) : [chs[0], chs[0].slice()];
}

function withPads(chs, pad) {
  return chs.map((c) => {
    const n = c.length;
    const out = new Float32Array(n + 2 * pad);
    for (let i = 0; i < pad; i++) out[i] = c[(n - pad + i + n * 4) % n];
    out.set(c, pad);
    for (let i = 0; i < pad; i++) out[pad + n + i] = c[i % n];
    return out;
  });
}

function fileHash(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
}

function build(catalog) {
  const report = { sfx: {}, music: {}, files: {} };
  const sounds = {};
  const variants = {};

  // SFX banks
  for (const bank of ['core', 'extra']) {
    const defs = catalog.sfx.filter((d) => d.bank === bank);
    if (!defs.length) continue;
    const pieces = [];
    let pos = BANK_LEAD;
    for (const d of defs) {
      const wav = path.join(WAV_DIR, 'sfx', `${d.id}.wav`);
      if (!fs.existsSync(wav)) throw new Error(`missing render ${wav} (run without --skip-render)`);
      const g = gainFor(wav, (m) => d.level - m.mMax);
      let chs = toStereo(applyGain(readWav(wav).chs, g.gainDb));
      const entry = { bank, start: pos, length: 0 };
      if (d.kind === 'loop') {
        const n = chs[0].length;
        chs = withPads(chs, SFX_LOOP_PAD);
        entry.loopStart = pos + SFX_LOOP_PAD;
        entry.loopEnd = pos + SFX_LOOP_PAD + n;
      }
      entry.length = chs[0].length;
      pieces.push({ pos, chs });
      pos += entry.length + BANK_GAP;
      sounds[d.id] = entry;
      (variants[d.name] ??= []).push({ variant: d.variant, id: d.id });
      report.sfx[d.id] = {
        name: d.name, bank, kind: d.kind, level: d.level, gainDb: +g.gainDb.toFixed(2), limited: g.limited,
        renderMMax: g.m.mMax, renderTruePeak: g.m.truePeak, seconds: +(entry.length / SR).toFixed(3),
      };
    }
    const total = pos + BANK_LEAD;
    const out = [new Float32Array(total), new Float32Array(total)];
    for (const p of pieces) for (let ch = 0; ch < 2; ch++) out[ch].set(p.chs[ch], p.pos);
    const wavOut = path.join(BUILD_DIR, `sfx-${bank}.wav`);
    writeWav(wavOut, out, SR);
    const mp3 = path.join(PUBLIC_AUDIO, `sfx-${bank}.mp3`);
    encodeMp3(wavOut, mp3, SFX_KBPS);
    report.files[`sfx-${bank}.mp3`] = { samples: total, bytes: fs.statSync(mp3).size, hash: fileHash(mp3) };
    console.log(`bank ${bank}: ${defs.length} sounds, ${(total / SR).toFixed(2)} s, ${(fs.statSync(mp3).size / 1024).toFixed(0)} KB`);
  }

  // Music
  const tracks = {};
  for (const tr of catalog.tracks) {
    const wav = path.join(WAV_DIR, 'music', `${tr.id}.wav`);
    if (!fs.existsSync(wav)) throw new Error(`missing render ${wav}`);
    const g = gainFor(wav, (m) => MUSIC_TARGET_LUFS - m.I);
    const parts = [{ id: tr.id, wav }, ...tr.stems.map((st) => ({ id: `${tr.id}-${st}`, wav: path.join(WAV_DIR, 'music', `${tr.id}-${st}.wav`), stem: st }))];
    const info = { file: '', samples: 0, loopStart: MUSIC_PAD, loopEnd: 0, bpm: tr.bpm, beatsPerBar: tr.beatsPerBar, bars: tr.bars, stems: {} };
    const encodePart = (p, gainDb) => {
      const chs = withPads(toStereo(applyGain(readWav(p.wav).chs, gainDb)), MUSIC_PAD);
      const wavOut = path.join(BUILD_DIR, `music-${p.id}.wav`);
      writeWav(wavOut, chs, SR);
      const file = `music-${p.id}.mp3`;
      encodeMp3(wavOut, path.join(PUBLIC_AUDIO, file), MUSIC_KBPS);
      return { file, samples: chs[0].length, n: chs[0].length - 2 * MUSIC_PAD };
    };
    // two-pass: MP3 coding shifts integrated loudness a little, so measure the decoded loop and correct
    let gainDb = g.gainDb;
    let measured = NaN;
    for (let pass = 0; pass < 3; pass++) {
      const e = encodePart(parts[0], gainDb);
      const dec = decodeToChannels(path.join(PUBLIC_AUDIO, e.file), SR, 2).map((c) => c.slice(MUSIC_PAD, MUSIC_PAD + e.n));
      const tmp = path.join(BUILD_DIR, `measure-${tr.id}.wav`);
      writeWav(tmp, dec, SR);
      const m = loudness(tmp);
      measured = m.I;
      const err = MUSIC_TARGET_LUFS - m.I;
      const ceiling = gainDb + (PEAK_CEILING_DBTP - m.truePeak);
      if (Math.abs(err) < 0.1 || gainDb >= ceiling - 0.01) break;
      gainDb = Math.min(gainDb + err, ceiling);
    }
    for (const p of parts) {
      const e = encodePart(p, gainDb);
      const mp3 = path.join(PUBLIC_AUDIO, e.file);
      report.files[e.file] = { samples: e.samples, bytes: fs.statSync(mp3).size, hash: fileHash(mp3) };
      if (p.stem) info.stems[p.stem] = e.file;
      else {
        info.file = e.file;
        info.samples = e.samples;
        info.loopEnd = MUSIC_PAD + e.n;
      }
      console.log(`music ${e.file}: ${(e.n / SR).toFixed(3)} s loop, ${(fs.statSync(mp3).size / 1024).toFixed(0)} KB, gain ${gainDb.toFixed(2)} dB (mp3 ${measured.toFixed(2)} LUFS)`);
    }
    g.gainDb = gainDb;
    tracks[tr.id] = info;
    report.music[tr.id] = { gainDb: +g.gainDb.toFixed(2), limited: g.limited, renderI: g.m.I, renderTruePeak: g.m.truePeak };
  }

  // decoded-length sanity check with ffmpeg (honours the LAME gapless header)
  for (const [file, f] of Object.entries(report.files)) {
    const dec = decodeToChannels(path.join(PUBLIC_AUDIO, file), SR, 2);
    f.ffmpegDecoded = dec[0].length;
    if (dec[0].length !== f.samples) console.warn(`  ! ${file}: ffmpeg decodes ${dec[0].length} samples, expected ${f.samples}`);
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(lcache));
  const version = crypto.createHash('sha1').update(Object.values(report.files).map((f) => f.hash).join()).digest('hex').slice(0, 8);
  writeManifest({ sounds, variants, tracks, files: report.files, version });
  report.version = version;
  fs.writeFileSync(path.join(OUT_DIR, 'build-report.json'), JSON.stringify(report, null, 2));
  // small descriptor for the audition page
  fs.writeFileSync(
    path.join(ROOT, 'tools', 'audio-lab', 'sounds.json'),
    JSON.stringify({ version, sfx: catalog.sfx.map(({ id, name, variant, desc, kind, bank }) => ({ id, name, variant, desc, kind, bank })), tracks: catalog.tracks }, null, 1),
  );
  const totalBytes = fs.readdirSync(PUBLIC_AUDIO).reduce((a, f) => a + fs.statSync(path.join(PUBLIC_AUDIO, f)).size, 0);
  console.log(`public/audio total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB, version ${version}`);
}

function writeManifest({ sounds, variants, tracks, files, version }) {
  const vs = {};
  for (const [name, list] of Object.entries(variants)) {
    list.sort((a, b) => a.variant - b.variant);
    vs[name] = { base: list[0].variant, nums: list.map((x) => x.variant), ids: list.map((x) => x.id) };
  }
  const banks = {};
  for (const b of ['core', 'extra']) if (files[`sfx-${b}.mp3`]) banks[b] = { file: `sfx-${b}.mp3`, samples: files[`sfx-${b}.mp3`].samples };
  const src = `// AUTO-GENERATED by tools/audio-lab/render.mjs. Do not edit by hand; re-run the render instead.
// All positions are in samples at AUDIO_SR (convert to seconds at runtime).

export const AUDIO_VERSION = '${version}';
export const AUDIO_SR = ${SR};

export type BankId = 'core' | 'extra';
export interface BankInfo { file: string; samples: number }
export interface SoundInfo { bank: BankId; start: number; length: number; loopStart?: number; loopEnd?: number }
/** nums[i] is the index value variant ids[i] answers to (steps may be non-contiguous, e.g. boost 2,3,4,5,7,10,15,20). */
export interface VariantInfo { base: number; nums: number[]; ids: string[] }
export interface TrackInfo {
  file: string; samples: number; loopStart: number; loopEnd: number;
  bpm: number; beatsPerBar: number; bars: number; stems: Record<string, string>;
}

export const BANKS: Partial<Record<BankId, BankInfo>> = ${JSON.stringify(banks, null, 2)};

export const SOUNDS: Record<string, SoundInfo> = ${JSON.stringify(sounds, null, 2)};

export const VARIANTS: Record<string, VariantInfo> = ${JSON.stringify(vs, null, 2)};

export const TRACKS: Record<string, TrackInfo> = ${JSON.stringify(tracks, null, 2)};
`;
  fs.writeFileSync(MANIFEST_TS, src);
}

const T0 = Date.now();
let catalog;
if (args['skip-render']) catalog = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'catalog.json'), 'utf8'));
else catalog = await render();
const T1 = Date.now();
if (!args['no-build']) build(catalog);
console.log(`total ${((Date.now() - T0) / 1000).toFixed(1)} s (render phase ${((T1 - T0) / 1000).toFixed(1)} s, build ${((Date.now() - T1) / 1000).toFixed(1)} s)`);
