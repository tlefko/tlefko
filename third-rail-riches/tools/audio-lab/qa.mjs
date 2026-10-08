#!/usr/bin/env node
// Measure the shipped assets (you can't listen from CI, so measure):
//  - per sound / track: EBU R128 integrated loudness, max momentary, sample + true peak (<= -1 dBFS)
//  - music: silent gaps (silencedetect) and loop-seam continuity (post-roll vs loop start)
//  - decoded lengths + start alignment in Chromium AND WebKit (MP3 encoder padding check)
//  - spectrogram PNGs (tools/audio-lab/out/spectrograms)
// Writes tools/audio-lab/qa-report.json and the measurements table in docs/AUDIO.md.
//
//   node tools/audio-lab/qa.mjs            everything
//   node tools/audio-lab/qa.mjs --no-browser   skip the Chromium/WebKit decode check
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchChromium, launchWebkit } from './lib/browser.mjs';
import { startLabServer, OUT_DIR, ROOT, LAB_DIR } from './lib/server.mjs';
import { FFMPEG, readWav, writeWav, loudness, decodeToChannels, samplePeak, db } from './lib/audio-io.mjs';

const SR = 44100;
const args = new Set(process.argv.slice(2));
const PUBLIC_AUDIO = path.join(ROOT, 'public', 'audio');
const SPEC_DIR = path.join(OUT_DIR, 'spectrograms');
const TMP = path.join(OUT_DIR, 'qa-tmp');
fs.mkdirSync(SPEC_DIR, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

// ------------------------------------------------------------------ manifest (parse the generated TS)
function loadManifest() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'audio', 'manifest.ts'), 'utf8');
  const grab = (name) => {
    const m = new RegExp(`export const ${name}[^=]*= (\\{[\\s\\S]*?\\n\\});`).exec(src);
    if (!m) throw new Error(`manifest: ${name} not found`);
    return JSON.parse(m[1]);
  };
  return { BANKS: grab('BANKS'), SOUNDS: grab('SOUNDS'), VARIANTS: grab('VARIANTS'), TRACKS: grab('TRACKS') };
}
const M = loadManifest();
const catalog = fs.existsSync(path.join(OUT_DIR, 'catalog.json')) ? JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'catalog.json'), 'utf8')) : { sfx: [] };
const kindOf = Object.fromEntries(catalog.sfx.map((d) => [d.id, d.kind]));

// ------------------------------------------------------------------ helpers
const slice = (chs, a, b) => chs.map((c) => c.slice(Math.max(0, a), Math.min(c.length, b)));
function rmsOf(chs, a, b) {
  let s = 0;
  let n = 0;
  for (const c of chs) for (let i = Math.max(0, a); i < Math.min(b, c.length); i++) { s += c[i] * c[i]; n++; }
  return Math.sqrt(s / Math.max(1, n));
}
function seam(chs, loopStart, loopEnd, ref) {
  const w = Math.round(0.05 * SR);
  const rEnd = rmsOf(chs, loopEnd - w, loopEnd);
  const rStart = rmsOf(chs, loopStart, loopStart + w);
  // after loopEnd the browser plays x[loopStart..]; the "true" continuation is the post-roll x[loopEnd..]
  let err = 0;
  let sig = 0;
  for (const c of chs) for (let k = 0; k < w; k++) {
    const d = c[loopStart + k] - c[loopEnd + k];
    err += d * d;
    sig += c[loopEnd + k] * c[loopEnd + k];
  }
  // first 2 ms after the jump vs the local level (a click would show up here)
  const j = Math.round(0.002 * SR);
  let jerr = 0;
  for (const c of chs) for (let k = 0; k < j; k++) jerr += (c[loopStart + k] - c[loopEnd + k]) ** 2;
  const local = Math.max(1e-6, rmsOf(chs, loopEnd - Math.round(0.01 * SR), loopEnd + Math.round(0.01 * SR)));
  const junctionErrDb = 20 * Math.log10(Math.sqrt(jerr / (j * chs.length)) / local + 1e-12);
  // actual step across the jump vs the ideal step into the post-roll
  let stepRatio = 0;
  for (const c of chs) {
    const actual = Math.abs(c[loopStart] - c[loopEnd - 1]);
    const ideal = Math.abs(c[loopEnd] - c[loopEnd - 1]);
    stepRatio = Math.max(stepRatio, actual / Math.max(ideal, local * 0.05));
  }
  // exactness before encoding (pre/post-roll are copies, so the difference must be 0)
  let refMax = null;
  if (ref) {
    refMax = 0;
    for (const c of ref) for (let k = 0; k < w; k++) refMax = Math.max(refMax, Math.abs(c[loopStart + k] - c[loopEnd + k]));
  }
  return {
    rmsEndDb: +db(rEnd).toFixed(1),
    rmsStartDb: +db(rStart).toFixed(1),
    seamSnrDb: sig > 0 ? +(10 * Math.log10(sig / Math.max(1e-20, err))).toFixed(1) : null,
    junctionErrDb: +junctionErrDb.toFixed(1),
    stepRatio: +stepRatio.toFixed(2),
    wavSeamMaxDiff: refMax,
  };
}
const seamOk = (sm) => (sm.seamSnrDb === null || sm.seamSnrDb >= 12) && sm.junctionErrDb <= -12 && (sm.wavSeamMaxDiff === null || sm.wavSeamMaxDiff < 1e-6);
const seamNote = (sm) => `seam: wav exact ${sm.wavSeamMaxDiff === null ? 'n/a' : sm.wavSeamMaxDiff < 1e-6 ? 'yes' : 'NO'}, mp3 SNR ${sm.seamSnrDb} dB, junction ${sm.junctionErrDb} dB, step x${sm.stepRatio}`;
function silentGaps(file, from, to) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-ss', String(from), '-t', String(to - from), '-i', file, '-af', 'silencedetect=noise=-50dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' });
  return [...(r.stderr ?? '').matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => +parseFloat(m[1]).toFixed(2));
}
function spectrogram(file, out, title, w = 1200, h = 360) {
  spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-lavfi', `showspectrumpic=s=${w}x${h}:legend=1:fscale=log:scale=log:start=30:stop=16000,drawtext=text='${title}':x=10:y=8:fontcolor=white:fontsize=18`, out]);
  if (!fs.existsSync(out)) spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-lavfi', `showspectrumpic=s=${w}x${h}:legend=1:fscale=log:scale=log`, out]);
}

const rows = [];
const PEAK_LIMIT = -1.0;

// ------------------------------------------------------------------ SFX banks
const decodedBanks = {};
for (const [bank, info] of Object.entries(M.BANKS)) {
  const file = path.join(PUBLIC_AUDIO, info.file);
  const chs = decodeToChannels(file, SR, 2);
  decodedBanks[bank] = chs;
  const refWav = path.join(OUT_DIR, 'build', `sfx-${bank}.wav`);
  const ref = fs.existsSync(refWav) ? readWav(refWav).chs : null;
  for (const [id, s] of Object.entries(M.SOUNDS)) {
    if (s.bank !== bank) continue;
    const part = slice(chs, s.start, s.start + s.length);
    const tmp = path.join(TMP, `${id}.wav`);
    writeWav(tmp, part, SR);
    const L = loudness(tmp, { padTo: 1.2 });
    const sp = db(samplePeak(part));
    const row = {
      file: `${info.file}#${id}`, kind: kindOf[id] === 'loop' ? 'sfx loop' : 'sfx', seconds: s.length / SR,
      I: L.I, mMax: L.mMax, samplePeak: +sp.toFixed(2), truePeak: L.truePeak, ok: sp <= PEAK_LIMIT,
    };
    if (s.loopStart !== undefined) {
      const sm = seam(chs, s.loopStart, s.loopEnd, ref);
      row.seam = sm;
      row.notes = seamNote(sm);
      row.ok = row.ok && seamOk(sm);
    }
    rows.push(row);
  }
}

// ------------------------------------------------------------------ music
const trackFiles = [];
for (const [id, t] of Object.entries(M.TRACKS)) {
  for (const [label, f] of [[id, t.file], ...Object.entries(t.stems).map(([k, v]) => [`${id}-${k}`, v])]) {
    const file = path.join(PUBLIC_AUDIO, f);
    trackFiles.push({ id: label, file: f, info: t });
    const chs = decodeToChannels(file, SR, 2);
    const loopOnly = path.join(TMP, `${label}-loop.wav`);
    writeWav(loopOnly, slice(chs, t.loopStart, t.loopEnd), SR);
    const L = loudness(loopOnly);
    const sp = db(samplePeak(chs));
    const gaps = silentGaps(loopOnly, 0, (t.loopEnd - t.loopStart) / SR);
    const refWav = path.join(OUT_DIR, 'build', f.replace('.mp3', '.wav'));
    const sm = seam(chs, t.loopStart, t.loopEnd, fs.existsSync(refWav) ? readWav(refWav).chs : null);
    const isStem = label !== id;
    rows.push({
      file: f, kind: isStem ? 'music stem' : 'music', seconds: (t.loopEnd - t.loopStart) / SR,
      I: L.I, mMax: L.mMax, LRA: L.LRA, samplePeak: +sp.toFixed(2), truePeak: L.truePeak,
      ok: sp <= PEAK_LIMIT && (isStem || gaps.length === 0) && seamOk(sm),
      gaps, seam: sm,
      notes: `${isStem ? '' : gaps.length ? `GAPS at ${gaps.join(', ')} s; ` : 'no gaps; '}${seamNote(sm)}; rms last/first 50 ms ${sm.rmsEndDb}/${sm.rmsStartDb} dB`,
    });
    spectrogram(loopOnly, path.join(SPEC_DIR, `music-${label}.png`), label);
  }
}

// spectrograms for a few SFX
for (const id of ['whistle', 'trainDepart', 'trainRun', 'ticketLand_6', 'coinLand_3', 'wildLand_0', 'bonusTrigger', 'anticipation', 'maxWin', 'reelDrop_0', 'symCat', 'flapRattle_0', 'securityAlarm', 'crashImpact', 'wreckScatter', 'signalSwitch']) {
  const tmp = path.join(TMP, `${id}.wav`);
  if (fs.existsSync(tmp)) spectrogram(tmp, path.join(SPEC_DIR, `sfx-${id}.png`), id, 700, 260);
}

// ------------------------------------------------------------------ browser decode check
async function browserCheck() {
  const files = [...Object.values(M.BANKS).map((b) => ({ file: b.file, samples: b.samples, probe: firstOnset(b.file) })), ...trackFiles.map((t) => ({ file: t.file, samples: fileSamples(t.file), probe: t.info.loopStart }))];
  const { url, close } = await startLabServer();
  const results = {};
  try {
    for (const name of ['chromium', 'webkit']) {
      const browser = name === 'chromium' ? await launchChromium() : await launchWebkit();
      if (!browser) continue;
      const page = await browser.newPage();
      await page.goto(`${url}tools/audio-lab/qa-decode.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });
      const out = await page.evaluate(async (list) => {
        const res = [];
        for (const f of list) {
          const bytes = await (await fetch(`/audio/${f.file}`)).arrayBuffer();
          const r = { file: f.file };
          for (const rate of [44100, 48000]) {
            const ctx = new OfflineAudioContext(2, rate, rate);
            const buf = await new Promise((ok, bad) => {
              const p = ctx.decodeAudioData(bytes.slice(0), ok, bad);
              if (p && p.then) p.then(ok, bad);
            });
            r[`len${rate}`] = buf.length;
            if (rate === 44100) {
              const c = buf.getChannelData(0);
              const a = Math.max(0, f.probe - 3000);
              r.probeStart = a;
              r.probe = Array.from(c.subarray(a, a + 12000));
            }
          }
          res.push(r);
        }
        return res;
      }, files);
      results[name] = out;
      await browser.close();
    }
  } finally {
    await close();
  }
  // alignment: cross-correlate each browser probe against the ffmpeg decode
  const table = [];
  for (const f of files) {
    const ref = decodeToChannels(path.join(PUBLIC_AUDIO, f.file), SR, 2)[0];
    const row = { file: f.file, expected44: f.samples, expected48: Math.round((f.samples * 48000) / 44100) };
    for (const name of Object.keys(results)) {
      const r = results[name].find((x) => x.file === f.file);
      const probe = r.probe;
      let best = 0;
      let bestErr = Infinity;
      for (let lag = -2000; lag <= 2000; lag++) {
        let e = 0;
        for (let i = 2500; i < probe.length - 2500; i += 3) {
          const d = probe[i] - (ref[r.probeStart + i - lag] ?? 0);
          e += d * d;
        }
        if (e < bestErr) { bestErr = e; best = lag; }
      }
      row[`${name}44`] = r.len44100;
      row[`${name}48`] = r.len48000;
      row[`${name}Offset`] = best;
    }
    row.ok = Object.keys(results).every((n) => row[`${n}44`] === row.expected44 && Math.abs(row[`${n}48`] - row.expected48) <= 2 && row[`${n}Offset`] === 0);
    table.push(row);
  }
  return table;
}
function fileSamples(f) {
  const r = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'build-report.json'), 'utf8'));
  return r.files[f].samples;
}
function firstOnset(file) {
  const bank = Object.keys(M.BANKS).find((b) => M.BANKS[b].file === file);
  const first = Object.values(M.SOUNDS).filter((s) => s.bank === bank).sort((a, b) => a.start - b.start)[0];
  return first ? first.start : 0;
}

let decode = null;
if (!args.has('--no-browser')) decode = await browserCheck();

// ------------------------------------------------------------------ report
const totalBytes = fs.readdirSync(PUBLIC_AUDIO).reduce((a, f) => a + fs.statSync(path.join(PUBLIC_AUDIO, f)).size, 0);
const report = { generated: new Date().toISOString(), totalBytes, rows, decode };
fs.writeFileSync(path.join(LAB_DIR, 'qa-report.json'), JSON.stringify(report, null, 1));

const bad = rows.filter((r) => !r.ok);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : String(x));
let md = `Generated by \`node tools/audio-lab/qa.mjs\` on ${report.generated.slice(0, 10)}. Total public/audio: **${(totalBytes / 1024 / 1024).toFixed(2)} MB**. `;
md += `Checks: sample peak <= -1 dBFS on every asset; no silent gaps in music; loop seams exact in the pre-encode WAV, and after MP3 the post-roll matches the loop start (SNR >= 12 dB, error in the 2 ms after the jump <= -12 dB re local level). Failures: **${bad.length}**.\n\n`;
md += '| asset | kind | s | LUFS-I | LUFS-M max | sample pk | true pk | ok | notes |\n|---|---|---:|---:|---:|---:|---:|:-:|---|\n';
for (const r of rows) md += `| ${r.file.replace('.mp3#', '#')} | ${r.kind} | ${r.seconds.toFixed(2)} | ${f1(r.I)} | ${f1(r.mMax)} | ${f1(r.samplePeak)} | ${f1(r.truePeak)} | ${r.ok ? 'yes' : '**NO**'} | ${r.notes ?? ''} |\n`;
if (decode) {
  md += '\n**Decoded lengths (samples) and start offset vs ffmpeg, per engine**\n\n| file | expected @44.1k | Chromium | WebKit | expected @48k | Chromium | WebKit | offset Cr/WK | ok |\n|---|---:|---:|---:|---:|---:|---:|:-:|:-:|\n';
  for (const d of decode) md += `| ${d.file} | ${d.expected44} | ${d.chromium44} | ${d.webkit44 ?? 'n/a'} | ${d.expected48} | ${d.chromium48} | ${d.webkit48 ?? 'n/a'} | ${d.chromiumOffset}/${d.webkitOffset ?? 'n/a'} | ${d.ok ? 'yes' : '**NO**'} |\n`;
}
const docPath = path.join(ROOT, 'docs', 'AUDIO.md');
if (fs.existsSync(docPath)) {
  const doc = fs.readFileSync(docPath, 'utf8');
  const a = doc.indexOf('<!-- QA:BEGIN -->');
  const b = doc.indexOf('<!-- QA:END -->');
  if (a >= 0 && b > a) fs.writeFileSync(docPath, `${doc.slice(0, a + 17)}\n${md}\n${doc.slice(b)}`);
}
fs.writeFileSync(path.join(OUT_DIR, 'qa-table.md'), md);

console.log(md.split('\n').slice(0, 3).join('\n'));
for (const r of rows) console.log(`${r.ok ? ' ' : '!'} ${r.file.padEnd(40)} I ${f1(r.I).padStart(6)}  M ${f1(r.mMax).padStart(6)}  pk ${f1(r.samplePeak).padStart(6)}  tp ${f1(r.truePeak).padStart(6)}  ${r.notes ?? ''}`);
if (decode) for (const d of decode) console.log(`${d.ok ? ' ' : '!'} decode ${d.file.padEnd(28)} 44k exp ${d.expected44} cr ${d.chromium44} wk ${d.webkit44 ?? 'n/a'} | 48k exp ${d.expected48} cr ${d.chromium48} wk ${d.webkit48 ?? 'n/a'} | offset ${d.chromiumOffset}/${d.webkitOffset ?? 'n/a'}`);
console.log(bad.length ? `${bad.length} FAILURES` : 'all checks passed');
fs.rmSync(TMP, { recursive: true, force: true });
if (bad.length) process.exitCode = 1;
