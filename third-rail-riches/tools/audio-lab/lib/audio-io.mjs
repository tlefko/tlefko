// Node helpers: float WAV read/write and ffmpeg measurement/encoding.
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

export const FFMPEG = process.env.FFMPEG ?? (fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');

/** Read a PCM16/PCM24/float32 WAV into per-channel Float32Arrays. */
export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not a WAV`);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    let size = b.readUInt32LE(off + 4);
    if (id === 'data' && (size === 0 || size === 0xffffffff || off + 8 + size > b.length)) size = b.length - off - 8;
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(off + 8),
        channels: b.readUInt16LE(off + 10),
        sampleRate: b.readUInt32LE(off + 12),
        bits: b.readUInt16LE(off + 22),
      };
      if (fmt.format === 0xfffe) fmt.format = b.readUInt16LE(off + 8 + 24);
    } else if (id === 'data') {
      data = b.subarray(off + 8, off + 8 + size);
    }
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt/data`);
  const { channels, bits, format } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const chs = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * bytes;
      let v;
      if (format === 3 && bits === 32) v = data.readFloatLE(p);
      else if (bits === 16) v = data.readInt16LE(p) / 32768;
      else if (bits === 24) v = (data.readIntLE(p, 3)) / 8388608;
      else if (bits === 32) v = data.readInt32LE(p) / 2147483648;
      else throw new Error(`${file}: unsupported ${bits}-bit format ${format}`);
      chs[c][i] = v;
    }
  }
  return { sampleRate: fmt.sampleRate, chs };
}

export function writeWav(file, chs, sampleRate) {
  const nch = chs.length;
  const len = chs[0].length;
  const dataBytes = len * nch * 4;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(nch, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * nch * 4, 28); b.writeUInt16LE(nch * 4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(dataBytes, 40);
  let p = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < nch; c++) { b.writeFloatLE(chs[c][i], p); p += 4; }
  fs.writeFileSync(file, b);
}

export function samplePeak(chs) {
  let p = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; }
  return p;
}

export const db = (g) => 20 * Math.log10(Math.max(1e-12, g));
export const undb = (d) => Math.pow(10, d / 20);

/**
 * EBU R128 via ffmpeg: integrated loudness, max momentary, max short-term, true peak.
 * `padTo` pads short clips with silence so ffmpeg's 400 ms gating windows see the whole sound.
 */
export function loudness(file, { padTo = 0 } = {}) {
  const af = [padTo ? `apad=whole_dur=${padTo}` : null, 'ebur128=peak=true+sample:framelog=info'].filter(Boolean).join(',');
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const err = r.stderr ?? '';
  let mMax = -Infinity;
  let sMax = -Infinity;
  for (const m of err.matchAll(/ M:\s*(-?[\d.]+)\s+S:\s*(-?[\d.]+)/g)) {
    mMax = Math.max(mMax, parseFloat(m[1]));
    sMax = Math.max(sMax, parseFloat(m[2]));
  }
  const summary = err.slice(err.lastIndexOf('Summary:'));
  const I = parseFloat((/I:\s*(-?[\d.]+) LUFS/.exec(summary) ?? [])[1]);
  const LRA = parseFloat((/LRA:\s*(-?[\d.]+) LU/.exec(summary) ?? [])[1]);
  const tp = /True peak:\s*\n\s*Peak:\s*(-?[\d.inf]+) dBFS/.exec(summary);
  const sp = /Sample peak:\s*\n\s*Peak:\s*(-?[\d.inf]+) dBFS/.exec(summary);
  return {
    I,
    LRA,
    mMax,
    sMax,
    truePeak: tp ? parseFloat(tp[1]) : NaN,
    samplePeak: sp ? parseFloat(sp[1]) : NaN,
  };
}

export function encodeMp3(wav, mp3, kbps, { mono = false } = {}) {
  execFileSync(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', wav,
    '-c:a', 'libmp3lame', '-b:a', `${kbps}k`, '-compression_level', '0', '-ar', '44100', '-ac', mono ? '1' : '2',
    mp3,
  ]);
}

/** Decode any audio file to float32 stereo at `sr` via ffmpeg. */
export function decodeToChannels(file, sr = 44100, channels = 2) {
  const out = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', String(channels), '-ar', String(sr), '-'], { maxBuffer: 1024 * 1024 * 1024 });
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength - (out.byteLength % 4));
  const f = new Float32Array(ab);
  const frames = Math.floor(f.length / channels);
  const chs = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) chs[c][i] = f[i * channels + c];
  return chs;
}
