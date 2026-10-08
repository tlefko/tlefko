#!/usr/bin/env node
// Runtime smoke test: drives src/audio (via the audition page) in Chromium and WebKit.
//   node tools/audio-lab/smoke.mjs
import { chromium, webkit } from 'playwright';
import { startLabServer } from './lib/server.mjs';

// static check: every SfxName in the runtime has assets in the manifest
{
  const fs = await import('node:fs');
  const idx = fs.readFileSync(new URL('../../src/audio/index.ts', import.meta.url), 'utf8');
  const man = fs.readFileSync(new URL('../../src/audio/manifest.ts', import.meta.url), 'utf8');
  const union = /export type SfxName =([\s\S]*?);/.exec(idx)[1];
  const names = [...union.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
  const vs = JSON.parse(/export const VARIANTS[^=]*= (\{[\s\S]*?\n\});/.exec(man)[1]);
  const missing = names.filter((n) => !vs[n]);
  console.log(`${missing.length ? 'FAIL' : 'ok  '} [static] ${names.length} SfxNames, all have assets${missing.length ? '; missing: ' + missing.join(', ') : ''}`);
  if (missing.length) process.exitCode = 1;
  for (const loop of ['anticipation', 'wheelSpin']) if (!vs[loop]) { console.log(`FAIL [static] loop ${loop} missing`); process.exitCode = 1; }
}
const { url, close } = await startLabServer();
const failures = [];
const check = (engine, cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} [${engine}] ${msg}`);
  if (!cond) failures.push(`[${engine}] ${msg}`);
};
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ args: name === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${url}tools/audio-lab/index.html`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__audio !== undefined, null, { timeout: 180000 });

    // 1. everything is safe before init and no context exists
    const pre = await page.evaluate(() => {
      const { audio, audioDebug, TRACKS } = window.__audio;
      audio.play('win', { index: 2 });
      audio.loop('wheelSpin', true);
      audio.loop('wheelSpin', false);
      audio.intensity(0.5);
      audio.intensity(0);
      audio.duck(0.5, 1);
      audio.setVolume(0.8);
      audio.music('base');
      const b1 = audio.beat();
      return { state: audioDebug().state, beat: b1, baseBpm: TRACKS.base.bpm };
    });
    check(name, pre.state === 'none', `no AudioContext before init (state=${pre.state})`);
    check(name, pre.beat.bpm === pre.baseBpm && pre.beat.phase >= 0 && pre.beat.phase < 1, `beat() before init runs at the base tempo (${pre.baseBpm} bpm): ${JSON.stringify(pre.beat)}`);

    // 2. init from a real click, wait for ready
    await page.click('#start');
    const t0 = Date.now();
    await page.evaluate(() => window.__audio.audio.ready);
    const st = await page.evaluate(() => window.__audio.audioDebug());
    check(name, st.state === 'running', `running after click (state=${st.state}, sr=${st.sampleRate}, ready in ${Date.now() - t0} ms)`);
    check(name, st.banks.includes('core'), 'core bank decoded at ready');

    // 3. decoded lengths match the manifest at the context rate
    const lens = await page.evaluate(async () => {
      const { audioDebug, TRACKS } = window.__audio;
      for (let i = 0; i < 100 && audioDebug().track !== 'base'; i++) await new Promise((r) => setTimeout(r, 100));
      const d = audioDebug();
      return { d, base: TRACKS.base };
    });
    const sr = lens.d.sampleRate;
    const expBase = Math.round((lens.base.samples * sr) / 44100);
    const gotBase = lens.d.trackLengths[lens.base.file];
    check(name, lens.d.track === 'base', `base music playing (track=${lens.d.track})`);
    check(name, Math.abs(gotBase - expBase) <= 2, `base decoded ${gotBase} samples @${sr}, expected ${expBase}`);

    // 4. every SFX plays without throwing; stress stays under the voice cap
    const sfx = await page.evaluate(async () => {
      const { audio, audioDebug, VARIANTS } = window.__audio;
      const names = Object.keys(VARIANTS).filter((n) => n !== 'anticipation' && n !== 'wheelSpin');
      for (const n of names) audio.play(n);
      let maxVoices = 0;
      for (let i = 0; i < 300; i++) {
        audio.play(i % 3 ? 'coin' : 'barTick', { index: i });
        audio.play('pop');
        if (i % 10 === 0) { await new Promise((r) => setTimeout(r, 5)); maxVoices = Math.max(maxVoices, audioDebug().voices); }
      }
      maxVoices = Math.max(maxVoices, audioDebug().voices);
      return { count: names.length, maxVoices };
    });
    check(name, sfx.count >= 49, `played ${sfx.count} sfx names`);
    const picks = await page.evaluate(() => {
      const { pick } = window.__audio.audioDebug();
      return { b12: pick('boost', 12), b20: pick('boost', 20), b25: pick('boost', 25), e1: pick('explode', 1), e9: pick('explode', 9), m10: pick('meterFlame', 10), h3: pick('hounds', 3), f0: pick('fsLand', 0), r2: pick('reelDrop', 7) };
    });
    check(name, picks.b12.id === 'boost_10' && picks.b20.id === 'boost_20' && picks.b25.id === 'boost_20' && picks.b25.rate > 1.3, `boost level mapping ${JSON.stringify([picks.b12, picks.b20, picks.b25])}`);
    check(name, picks.e1.id === 'explode_1' && picks.e9.id === 'explode_6' && picks.e9.rate > 1 && picks.m10.id === 'meterFlame_10' && picks.h3.id === 'hounds_3' && picks.f0.id === 'fsLand_1' && picks.r2.id === 'reelDrop_2', `stepped/variant mapping ${JSON.stringify(picks)}`);
    check(name, sfx.maxVoices <= 32, `voice cap respected under stress (max ${sfx.maxVoices})`);

    // 5. loops, intensity, track switching with the witching stem
    const sw = await page.evaluate(async () => {
      const { audio, audioDebug } = window.__audio;
      audio.loop('anticipation', true);
      audio.intensity(1);
      await new Promise((r) => setTimeout(r, 300));
      const loops = audioDebug().loops.slice();
      audio.loop('anticipation', false);
      audio.intensity(0);
      audio.music('witching', { fade: 0.3 });
      for (let i = 0; i < 150 && audioDebug().track !== 'witching'; i++) await new Promise((r) => setTimeout(r, 100));
      const w = audioDebug();
      audio.intensity(0.7);
      const b = [];
      for (let i = 0; i < 3; i++) { b.push(audio.beat()); await new Promise((r) => setTimeout(r, 400)); }
      audio.music('base', { fade: 0.3 });
      return { loops, track: w.track, decoded: w.decodedTracks, beats: b };
    });
    check(name, sw.loops.includes('anticipation'), 'anticipation loop starts');
    check(name, sw.track === 'witching', `switched to witching (decoded: ${sw.decoded.join(', ')})`);
    check(name, sw.beats[0].bpm === 80 && sw.beats.some((x, i) => i > 0 && (x.beat !== sw.beats[0].beat || x.bar !== sw.beats[0].bar)), `beat clock follows witching: ${JSON.stringify(sw.beats)}`);

    // 6. tab hide/show suspends and resumes; play() while hidden is ignored
    const vis = await page.evaluate(async () => {
      const { audio, audioDebug } = window.__audio;
      const setVis = (v) => {
        Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
        Object.defineProperty(document, 'hidden', { value: v === 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      };
      setVis('hidden');
      await new Promise((r) => setTimeout(r, 400));
      const hidden = audioDebug().state;
      const before = audioDebug().voices;
      for (let i = 0; i < 20; i++) audio.play('coin');
      const afterPlays = audioDebug().voices;
      setVis('visible');
      await new Promise((r) => setTimeout(r, 600));
      return { hidden, visible: audioDebug().state, before, afterPlays };
    });
    check(name, vis.hidden === 'suspended', `suspended when hidden (${vis.hidden})`);
    check(name, vis.afterPlays === vis.before, 'play() ignored while hidden');
    check(name, vis.visible === 'running', `resumed when visible (${vis.visible})`);
    check(name, errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
  }
} finally {
  await close();
}
console.log(failures.length ? `${failures.length} FAILURES` : 'smoke test passed');
if (failures.length) process.exitCode = 1;
