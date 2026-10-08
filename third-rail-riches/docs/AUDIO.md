# Audio: Third Rail Riches

Everything you hear is authored as code with **Tone.js** in `tools/audio-lab`, rendered offline
(Tone.Offline in headless Chromium, driven by Playwright), then encoded with ffmpeg into
`public/audio`. The game runtime (`src/audio/index.ts`) is a small Web Audio player that decodes
those MP3s; Tone.js is never bundled into the game. The pipeline, runtime and loop technique are the
Powder Keg Cove ones; the content is new.

Style: a 1930s rubber-hose cartoon score for a subway at midnight: hot swing and stride piano,
walking upright bass, brushes playing a "chugga-chugga" train shuffle (accents on 2 and 4), muted
trumpet, clarinet, saxes and trombones, a steam-whistle motif. Warm, vintage and slightly lo-fi: a
subtle film-crackle bed in the music, gentle tape saturation and wow, narrowed stereo, club/tunnel
reverb, cartoon timing. SFX are brass, iron, rails, electricity (the third rail), steam, tickets and
tokens, short and soft enough to fire constantly without fatigue.

## Files

| file | contents |
|---|---|
| `public/audio/sfx-core.mp3` | sprite bank: every SFX used in the base game and the free spins plus the two loop beds (128 kbps) |
| `public/audio/sfx-extra.mp3` | sprite bank: bonus title/end stings, retrigger, Golden Locomotive, big-win stings, max win (loaded right after `ready`) |
| `public/audio/music-base.mp3` | base game loop, "The Midnight Local" |
| `public/audio/music-rush.mp3` + `music-rush-tension.mp3` | Rush Hour free-spins loop and its tension stem |
| `public/audio/music-last.mp3` | Last Train loop |
| `public/audio/music-bigwin.mp3` | big-win loop, "Full Steam Shout" |
| `public/audio/music-surge.mp3` | "Power Surge", a short tense bed for anticipation moments |
| `src/audio/manifest.ts` | generated: sprite offsets, loop points, bpm/bars, variants |
| `src/audio/index.ts` | runtime player (API below) |

The list of SFX ids, their indices and when to call them is in [`docs/SOUNDS.md`](SOUNDS.md).

## Runtime API (`import { audio } from './audio'`)

- `audio.init()`: call from the first user gesture. Creates/resumes the AudioContext (never
  before), unlocks iOS, starts loading. Everything else is safe to call before `init()`:
  `music()`, `loop()`, `intensity()` and the setters are remembered and applied later;
  `play()` and `duck()` are no-ops until the context runs.
- `audio.ready`: resolves once the core SFX bank and the base music are decoded (also resolves if
  loading fails, so it never blocks the game).
- `audio.play(name, { rate, volume, pan, index, delay })`: `index` picks the variant with that number
  (`reelDrop` 0..5, `ticketLand` 1..6, `coinLand` 0..3, `coinCollect` 1..12, `powerStep` 1..12 cycling,
  `bigWinTier` 0..3; see SOUNDS.md for clamping). Omitting it picks a random variation, never the same
  twice in a row. Frequent sounds get a tiny random pitch variation when no `rate` is given.
- `audio.loop('anticipation' | 'trainRun', on)`: looping beds with short fades.
- `audio.music(track, { fade })`: crossfades (default 0.9 s) to `base | rush | last | bigwin | surge |
  none`. Loops are gapless (see below). Base music resumes at the start of the 4-bar phrase it was in
  when you come back from a bonus or big win; other tracks start at bar 1.
- `audio.intensity(0..1)`: the Rush Hour track (`rush`) fades in its tension stem (equal-power).
  While the `anticipation` loop is on (and the track is not `rush`) the music also recedes (lowpass
  down to 1.6 kHz and -3.7 dB at 1) and the anticipation bed brightens and rises in pitch.
- `audio.duck(amount, seconds)`: dips the music bus (overlapping ducks keep the deepest and the
  longest).
- `audio.beat()`: `{ bpm, beat, phase, bar }` from the playing track's clock, compensated for
  output latency. All tracks are in 4/4 and count quarter notes (base 144 bpm, rush 200, last 120,
  bigwin 180, surge 150). Before `init()` it free-runs at the base tempo.
- `setMusicEnabled`, `setSfxEnabled`, `setVolume(v)` (perceptual, gain = v^2).
- Extras: `setAudioBaseUrl(url)` (default `${import.meta.env.BASE_URL}audio/`), `audioDebug()`.

Robustness (unchanged from the engine): per-sound polyphony caps with voice stealing, repeats closer than a
per-sound `minGap` are merged, a global cap of 32 voices, a safety limiter on the master; on tab hide
the context is suspended and `play()` is ignored. Tuning knobs live in `PARAMS` at the top of
`src/audio/index.ts` and need no re-render.

## Gapless loops

Each music loop is rendered DAW-style: every unique note is rendered once with Tone.Offline, notes
are sequenced sample-accurately into stems (wrapping at the loop length), and a final Tone.Offline
mixdown runs the stems through buses, convolution reverb and tape wow. Everything that rings past
the loop end (reverb, releases) is folded back onto the start, so one period of audio is exactly
one cycle of the infinitely repeated piece. LFO rates are snapped to whole cycles per loop, hum tones
are pitched to whole cycles per loop or per crossfaded segment, and the master EQ runs circularly, so
the seam is continuous by construction. Noise beds in the SFX loops dip briefly at the loop point
(`seamDip`) so the decoded MP3 still matches across the jump.

The file then carries 0.25 s of pre-roll (the loop's last 0.25 s) and 0.25 s of post-roll (its
first 0.25 s): `loopStart`/`loopEnd` in the manifest sit on exact bar boundaries inside the file.
Tempos were chosen so every loop is a whole number of samples at both 44.1 and 48 kHz (a multiple of
1/300 s): base 144 bpm x 32 bars = 53.33 s, rush 200 x 32 = 38.4 s, last 120 x 24 = 48 s, bigwin 180 x 12 =
16 s, surge 150 x 8 = 12.8 s. The QA script checks the seam and decodes every file in Chromium (and
WebKit when installed) to confirm lengths and alignment.

## Sound list

Music (all -18 LUFS integrated so SFX cut through):

| track | description |
|---|---|
| base "The Midnight Local" | easy, toe-tapping hot swing in F, 144 bpm, AABA: muted trumpet sings the A sections (clarinet harmonises the second A and weaves an obbligato through the last), clarinet takes the bridge over "doo-wah" muted-trumpet backgrounds, the steam-whistle motif closes the bridge; stride piano, walking upright bass (two-feel in the first A), brushed train shuffle with accents on 2 and 4, ride in the second half, sax pads, distant trains rumbling through the tunnel |
| rush "Rush Hour" (free spins) | busy hot jazz in Bb, 200 bpm: a 16-bar riff chorus with trumpets in harmony and the clarinet weaving 8th-note lines, then a shout with trombones doubling and the clarinet wailing; stride piano, walking bass, stick backbeat over the brushed shuffle, a rush-hour crowd murmuring and shouting "hey!", a whistle. Tension stem: rail clatter in 8ths, hi-hat 16ths, growling off-beat brass and sax stabs, a climbing clarinet trill, electric arcs |
| last "Last Train" (buy) | 120 bpm shuffle: a 12-bar D minor noir blues (plunger-muted trumpet, low chalumeau clarinet, sparse piano, two-feel bass, a far-off minor whistle) builds into a 12-bar F major golden swing (open trumpet and clarinet in harmony, trombone pads, stride, ride, glockenspiel glints, the whistle motif in major), turning back through A7; the train never stops: rail joints on the beat, the third rail humming |
| bigwin "Full Steam Shout" | big-band shout chorus on a 12-bar Bb blues, 180 bpm: screaming trumpets in harmony, saxes doubling, trombone punches, stride, walking bass, kicks on the "bombs", crashes, a whistle into the turnaround, a snare pickup across the seam |
| surge "Power Surge" | tense, electric 12.8 s bed: creeping pizzicato ostinato on a D pedal, tremolo strings (Dm, Eb/D, A7b9), growling muted-trumpet stabs, ticking hats over the brushed shuffle, rail clatter, the third rail humming with arcs every two bars, a clarinet trill |

SFX: see [`docs/SOUNDS.md`](SOUNDS.md) for every id with its description and index range.

## Regenerating

```bash
node tools/audio-lab/render.mjs                    # render everything, normalise, pack, encode, write manifest
node tools/audio-lab/render.mjs --only=whistle,base # re-render some ids (anything without a WAV yet too), rebuild
node tools/audio-lab/render.mjs --only=x --strict --no-build   # render just x, no packing (sound design)
node tools/audio-lab/render.mjs --skip-render      # rebuild banks/MP3s/manifest from existing WAVs
node tools/audio-lab/qa.mjs                        # measurements, spectrograms, browser decode check
node tools/audio-lab/smoke.mjs                     # drives the runtime in Chromium (+ WebKit if installed)
```

A full render takes about 4 minutes (2 min render, 2 min ffmpeg build). The build removes MP3s in
`public/audio` that are no longer produced. Loudness measurements are cached by WAV hash.

Browsers: `tools/audio-lab/lib/browser.mjs` launches headless Chromium from `CHROMIUM_PATH`, else
`/opt/pw-browsers/chromium` when present, else Playwright's download, with SwiftShader GL flags and
autoplay allowed (no GPU or Metal needed). WebKit is optional and skipped when not installed. ffmpeg
must have libmp3lame and ebur128 (`FFMPEG`, else `/opt/homebrew/bin/ffmpeg`, else `ffmpeg` on PATH).
Intermediate WAVs, spectrograms and logs go to `tools/audio-lab/out/` (git-ignored).

Audition: run `npx vite` in the project root and open `/tools/audio-lab/` (or
`node tools/audio-lab/lib/server.mjs` and open the printed URL): a button per SFX and variation,
every track with crossfade, intensity and duck controls, a beat-synced dot, loop toggles and demo
sequences (spin, landings, way win, train run, coins 1..12, anticipation, Rush Hour ramp, POWER meter,
Last Train, big win, stress). `/tools/audio-lab/render.html` renders any definition live.

Where things live: instruments in `tools/audio-lab/src/instruments` (`keys.ts` stride piano,
`train.ts` rails/electricity/steam/bells/tickets, `voices.ts` the critters and the crowd, `winds.ts`
brass, muted trumpet, clarinet, sax), the shared house band and arrangement helpers in
`src/music/band.ts`, SFX in `src/sfx`, music in `src/music` (parts in the small validated notation of
`src/core/score.ts`), mastering in `src/pipeline.ts`, loudness targets per SFX in each definition
(`level`, max momentary LUFS; an optional `drive` soft-clips a transient-heavy sting so it can reach its
target under the peak ceiling). One-shots get a 30 ms fade at the end of their render window.

Loudness: music is normalised to -18 LUFS integrated, measured on the decoded MP3 loop. Each SFX is
normalised to its own max-momentary target and capped at -1.5 dBTP before encoding so decoded peaks stay
under -1 dBFS: counting ticks -27, symbol accents -24/-25, UI -21 to -25, column drops -20, coins -21 to
-18, events -14 to -19 (ticketLand climbs 3 dB across its steps), bonus and big-win stings -12 to -14; subway-map sounds (`src/sfx/map.ts`): flaps -26/-23, train steps -27,
route trace -22, signal -19, security alarm / all clear / incident -17, crash rumble and wreck scatter -18,
crash multiplier -14, crash impact -12.
Percussive sounds may hit the peak cap 1 to 2 dB under target ("limited" in `out/build-report.json`).

## Measurements

<!-- QA:BEGIN -->
Generated by `node tools/audio-lab/qa.mjs` on 2026-10-08. Total public/audio: **6.07 MB**. Checks: sample peak <= -1 dBFS on every asset; no silent gaps in music; loop seams exact in the pre-encode WAV, and after MP3 the post-roll matches the loop start (SNR >= 12 dB, error in the 2 ms after the jump <= -12 dB re local level). Failures: **0**.

| asset | kind | s | LUFS-I | LUFS-M max | sample pk | true pk | ok | notes |
|---|---|---:|---:|---:|---:|---:|:-:|---|
| sfx-core#uiClick | sfx | 0.19 | -25.5 | -25.5 | -3.2 | -3.2 | yes |  |
| sfx-core#uiToggle | sfx | 0.23 | -24.5 | -24.5 | -4.3 | -4.3 | yes |  |
| sfx-core#uiOpen | sfx | 0.55 | -24.5 | -22.4 | -7.1 | -7.1 | yes |  |
| sfx-core#uiClose | sfx | 0.35 | -24.2 | -23.5 | -4.8 | -4.8 | yes |  |
| sfx-core#betUp | sfx | 0.61 | -24.5 | -22.5 | -9.8 | -9.7 | yes |  |
| sfx-core#betDown | sfx | 0.63 | -26.2 | -22.5 | -11.4 | -11.4 | yes |  |
| sfx-core#spinPress | sfx | 0.29 | -21.5 | -21.5 | -3.0 | -3.0 | yes |  |
| sfx-core#buy | sfx | 1.41 | -18.7 | -16.5 | -7.6 | -7.6 | yes |  |
| sfx-core#error | sfx | 0.70 | -24.7 | -22.5 | -13.9 | -13.9 | yes |  |
| sfx-core#iris | sfx | 1.30 | -22.1 | -19.5 | -18.3 | -18.3 | yes |  |
| sfx-core#boostOn | sfx | 0.78 | -23.7 | -21.5 | -15.0 | -15.0 | yes |  |
| sfx-core#boostOff | sfx | 0.60 | -25.4 | -22.4 | -14.2 | -14.2 | yes |  |
| sfx-core#lowPowerClick | sfx | 0.18 | -24.6 | -24.6 | -5.3 | -5.1 | yes |  |
| sfx-core#reelDrop_0 | sfx | 0.24 | -20.6 | -20.6 | -2.0 | -2.0 | yes |  |
| sfx-core#reelDrop_1 | sfx | 0.27 | -20.2 | -20.2 | -1.7 | -1.7 | yes |  |
| sfx-core#reelDrop_2 | sfx | 0.26 | -20.5 | -20.5 | -2.6 | -2.6 | yes |  |
| sfx-core#reelDrop_3 | sfx | 0.26 | -20.6 | -20.6 | -2.9 | -2.8 | yes |  |
| sfx-core#reelDrop_4 | sfx | 0.22 | -21.9 | -21.9 | -2.0 | -2.0 | yes |  |
| sfx-core#reelDrop_5 | sfx | 0.23 | -21.1 | -21.1 | -2.1 | -2.1 | yes |  |
| sfx-core#reelStop | sfx | 0.55 | -18.5 | -18.5 | -2.9 | -2.9 | yes |  |
| sfx-core#ticketLand_1 | sfx | 1.23 | -21.1 | -17.4 | -6.7 | -6.5 | yes |  |
| sfx-core#ticketLand_2 | sfx | 1.29 | -20.4 | -16.8 | -7.2 | -7.1 | yes |  |
| sfx-core#ticketLand_3 | sfx | 1.92 | -19.4 | -16.3 | -7.4 | -7.4 | yes |  |
| sfx-core#ticketLand_4 | sfx | 1.92 | -18.9 | -15.6 | -7.7 | -7.6 | yes |  |
| sfx-core#ticketLand_5 | sfx | 1.92 | -18.2 | -15.0 | -6.0 | -6.0 | yes |  |
| sfx-core#ticketLand_6 | sfx | 1.92 | -17.0 | -14.5 | -6.9 | -6.8 | yes |  |
| sfx-core#coinLand_0 | sfx | 0.26 | -21.4 | -21.4 | -3.1 | -3.0 | yes |  |
| sfx-core#coinLand_1 | sfx | 0.33 | -20.7 | -20.7 | -5.3 | -5.1 | yes |  |
| sfx-core#coinLand_2 | sfx | 0.74 | -22.6 | -20.0 | -7.6 | -7.4 | yes |  |
| sfx-core#coinLand_3 | sfx | 1.48 | -24.8 | -19.3 | -8.8 | -8.6 | yes |  |
| sfx-core#locoLand | sfx | 0.75 | -21.1 | -17.3 | -1.9 | -1.9 | yes |  |
| sfx-core#switchLand | sfx | 0.29 | -20.4 | -20.4 | -1.6 | -1.5 | yes |  |
| sfx-core#wildLand_0 | sfx | 0.45 | -22.8 | -18.5 | -3.0 | -3.0 | yes |  |
| sfx-core#wildLand_1 | sfx | 0.45 | -22.8 | -18.5 | -2.8 | -2.8 | yes |  |
| sfx-core#wildLand_2 | sfx | 0.40 | -22.8 | -18.5 | -2.0 | -2.0 | yes |  |
| sfx-core#win | sfx | 1.26 | -19.4 | -17.5 | -8.8 | -8.8 | yes |  |
| sfx-core#clusterTrace | sfx | 1.08 | -26.0 | -24.3 | -13.5 | -13.3 | yes |  |
| sfx-core#symPretzel | sfx | 0.32 | -26.0 | -24.6 | -9.1 | -9.1 | yes |  |
| sfx-core#symCoffee | sfx | 0.68 | -25.5 | -25.4 | -13.9 | -13.5 | yes |  |
| sfx-core#symNewspaper | sfx | 0.51 | -25.1 | -24.4 | -9.7 | -9.6 | yes |  |
| sfx-core#symUmbrella | sfx | 0.45 | -24.7 | -24.4 | -9.0 | -9.0 | yes |  |
| sfx-core#symPigeon | sfx | 0.93 | -26.4 | -24.4 | -17.8 | -17.8 | yes |  |
| sfx-core#symCat | sfx | 0.66 | -25.8 | -24.5 | -17.7 | -17.7 | yes |  |
| sfx-core#symBulldog | sfx | 0.65 | -27.5 | -24.5 | -16.8 | -16.8 | yes |  |
| sfx-core#symRat | sfx | 0.49 | -27.8 | -25.4 | -23.5 | -23.5 | yes |  |
| sfx-core#symConductor | sfx | 0.69 | -26.2 | -23.4 | -13.1 | -13.1 | yes |  |
| sfx-core#whistle | sfx | 1.40 | -18.3 | -16.5 | -13.4 | -13.4 | yes |  |
| sfx-core#trainDepart | sfx | 2.35 | -16.7 | -15.4 | -7.7 | -7.7 | yes |  |
| sfx-core#trainRun | sfx loop | 1.74 | -22.8 | -21.4 | -7.7 | -7.7 | yes | seam: wav exact yes, mp3 SNR 29.8 dB, junction -29 dB, step x1.53 |
| sfx-core#trainExit | sfx | 1.89 | -18.8 | -16.4 | -5.9 | -5.8 | yes |  |
| sfx-core#trainBrake | sfx | 2.10 | -18.4 | -16.4 | -7.5 | -7.5 | yes |  |
| sfx-core#coinCollect_1 | sfx | 0.66 | -25.6 | -21.4 | -6.9 | -6.8 | yes |  |
| sfx-core#coinCollect_2 | sfx | 0.70 | -25.3 | -21.1 | -6.4 | -6.4 | yes |  |
| sfx-core#coinCollect_3 | sfx | 0.75 | -25.0 | -20.9 | -8.2 | -8.2 | yes |  |
| sfx-core#coinCollect_4 | sfx | 0.75 | -24.6 | -20.6 | -8.0 | -8.0 | yes |  |
| sfx-core#coinCollect_5 | sfx | 0.73 | -24.6 | -20.4 | -8.2 | -8.2 | yes |  |
| sfx-core#coinCollect_6 | sfx | 0.79 | -24.3 | -20.2 | -7.6 | -7.6 | yes |  |
| sfx-core#coinCollect_7 | sfx | 0.75 | -24.0 | -19.9 | -7.9 | -7.9 | yes |  |
| sfx-core#coinCollect_8 | sfx | 0.76 | -23.7 | -19.7 | -9.1 | -9.1 | yes |  |
| sfx-core#coinCollect_9 | sfx | 0.75 | -23.4 | -19.4 | -7.5 | -7.5 | yes |  |
| sfx-core#coinCollect_10 | sfx | 0.73 | -23.1 | -19.1 | -8.2 | -8.1 | yes |  |
| sfx-core#coinCollect_11 | sfx | 0.75 | -22.9 | -18.9 | -8.3 | -8.2 | yes |  |
| sfx-core#coinCollect_12 | sfx | 0.74 | -22.7 | -18.8 | -7.7 | -7.6 | yes |  |
| sfx-core#switchThrow | sfx | 0.80 | -20.6 | -18.1 | -2.0 | -2.0 | yes |  |
| sfx-core#branch | sfx | 0.41 | -20.5 | -20.5 | -2.0 | -2.0 | yes |  |
| sfx-core#haulCount_0 | sfx | 0.03 | -27.4 | -27.4 | -4.5 | -4.5 | yes |  |
| sfx-core#haulCount_1 | sfx | 0.03 | -27.5 | -27.5 | -5.0 | -5.0 | yes |  |
| sfx-core#haulCount_2 | sfx | 0.03 | -27.5 | -27.4 | -5.8 | -5.8 | yes |  |
| sfx-core#haulMult | sfx | 1.04 | -17.7 | -14.4 | -7.4 | -7.4 | yes |  |
| sfx-core#barTick_0 | sfx | 0.03 | -27.5 | -27.5 | -5.5 | -5.5 | yes |  |
| sfx-core#barTick_1 | sfx | 0.03 | -27.8 | -27.8 | -5.6 | -5.4 | yes |  |
| sfx-core#barTick_2 | sfx | 0.03 | -27.4 | -27.4 | -5.3 | -5.3 | yes |  |
| sfx-core#barApply | sfx | 1.30 | -16.5 | -14.4 | -5.2 | -5.2 | yes |  |
| sfx-core#anticipationStart | sfx | 1.76 | -17.4 | -16.5 | -5.3 | -5.3 | yes |  |
| sfx-core#anticipationEnd | sfx | 0.99 | -23.8 | -19.7 | -6.8 | -6.8 | yes |  |
| sfx-core#anticipation | sfx loop | 5.04 | -21.2 | -20.5 | -10.4 | -10.4 | yes | seam: wav exact yes, mp3 SNR 25.4 dB, junction -25.9 dB, step x0.34 |
| sfx-core#bonusTrigger | sfx | 2.49 | -15.9 | -13.5 | -2.8 | -2.7 | yes |  |
| sfx-core#powerStep_1 | sfx | 0.90 | -26.5 | -22.5 | -8.5 | -8.4 | yes |  |
| sfx-core#powerStep_2 | sfx | 0.90 | -26.2 | -22.3 | -8.5 | -8.5 | yes |  |
| sfx-core#powerStep_3 | sfx | 0.90 | -26.0 | -22.1 | -8.3 | -8.2 | yes |  |
| sfx-core#powerStep_4 | sfx | 0.90 | -25.9 | -22.0 | -8.5 | -8.5 | yes |  |
| sfx-core#powerStep_5 | sfx | 0.90 | -25.8 | -21.9 | -8.5 | -8.4 | yes |  |
| sfx-core#powerStep_6 | sfx | 0.90 | -25.6 | -21.6 | -9.8 | -9.8 | yes |  |
| sfx-core#powerStep_7 | sfx | 0.90 | -25.4 | -21.6 | -9.8 | -9.7 | yes |  |
| sfx-core#powerStep_8 | sfx | 0.90 | -25.3 | -21.3 | -9.4 | -9.2 | yes |  |
| sfx-core#powerStep_9 | sfx | 0.90 | -25.2 | -21.3 | -10.9 | -10.6 | yes |  |
| sfx-core#powerStep_10 | sfx | 0.90 | -25.0 | -21.1 | -11.2 | -11.1 | yes |  |
| sfx-core#powerStep_11 | sfx | 0.90 | -24.8 | -21.0 | -11.6 | -11.5 | yes |  |
| sfx-core#powerStep_12 | sfx | 0.90 | -24.6 | -20.7 | -10.7 | -10.7 | yes |  |
| sfx-core#levelUp | sfx | 1.95 | -16.8 | -14.5 | -5.6 | -5.6 | yes |  |
| sfx-core#introSting | sfx | 2.91 | -18.8 | -15.5 | -5.2 | -5.1 | yes |  |
| sfx-core#playSting | sfx | 1.74 | -17.2 | -15.4 | -7.2 | -7.1 | yes |  |
| sfx-core#carouselWhoosh | sfx | 0.39 | -25.2 | -24.4 | -11.0 | -11.0 | yes |  |
| sfx-core#coachPop | sfx | 0.39 | -26.3 | -23.4 | -5.4 | -5.4 | yes |  |
| sfx-core#flapRattle_0 | sfx | 0.33 | -29.8 | -26.5 | -8.4 | -8.3 | yes |  |
| sfx-core#flapRattle_1 | sfx | 0.32 | -28.4 | -26.6 | -8.9 | -8.9 | yes |  |
| sfx-core#flapRattle_2 | sfx | 0.37 | -29.3 | -26.5 | -10.6 | -10.6 | yes |  |
| sfx-core#flapRattle_3 | sfx | 0.32 | -28.4 | -26.6 | -8.8 | -8.7 | yes |  |
| sfx-core#flapSettle_0 | sfx | 0.17 | -23.4 | -23.4 | -2.4 | -2.4 | yes |  |
| sfx-core#flapSettle_1 | sfx | 0.17 | -23.4 | -23.4 | -2.0 | -2.0 | yes |  |
| sfx-core#flapSettle_2 | sfx | 0.17 | -23.4 | -23.4 | -2.3 | -2.3 | yes |  |
| sfx-core#trainStep_0 | sfx | 0.20 | -28.8 | -27.5 | -8.9 | -8.9 | yes |  |
| sfx-core#trainStep_1 | sfx | 0.20 | -28.8 | -27.4 | -8.5 | -8.5 | yes |  |
| sfx-core#trainStep_2 | sfx | 0.20 | -28.7 | -27.4 | -8.6 | -8.6 | yes |  |
| sfx-core#signalSwitch | sfx | 0.80 | -21.4 | -19.5 | -3.4 | -3.4 | yes |  |
| sfx-core#securityAlarm | sfx | 1.00 | -18.6 | -17.4 | -8.7 | -8.7 | yes |  |
| sfx-core#allClear | sfx | 0.84 | -20.4 | -17.4 | -3.5 | -3.4 | yes |  |
| sfx-core#incident | sfx | 0.97 | -20.0 | -17.6 | -7.1 | -7.1 | yes |  |
| sfx-core#crashRumble | sfx | 0.70 | -20.1 | -18.4 | -7.8 | -7.8 | yes |  |
| sfx-core#crashImpact | sfx | 1.50 | -17.6 | -12.5 | -3.0 | -2.8 | yes |  |
| sfx-core#wreckScatter | sfx | 0.95 | -20.6 | -18.5 | -9.5 | -9.5 | yes |  |
| sfx-core#crashMult | sfx | 0.57 | -16.7 | -14.5 | -4.0 | -4.0 | yes |  |
| sfx-core#routeTrace | sfx | 0.60 | -24.3 | -22.4 | -14.0 | -14.0 | yes |  |
| sfx-extra#bonusIntro | sfx | 2.94 | -17.7 | -14.5 | -4.0 | -4.0 | yes |  |
| sfx-extra#bonusEnd | sfx | 3.37 | -19.0 | -14.4 | -4.3 | -4.2 | yes |  |
| sfx-extra#retrigger | sfx | 1.95 | -17.1 | -14.5 | -5.5 | -5.5 | yes |  |
| sfx-extra#goldenArrive | sfx | 3.36 | -15.9 | -13.5 | -4.3 | -4.3 | yes |  |
| sfx-extra#bigWinStart | sfx | 2.90 | -14.5 | -12.5 | -2.5 | -2.4 | yes |  |
| sfx-extra#bigWinTier_0 | sfx | 2.18 | -16.2 | -13.5 | -2.1 | -2.0 | yes |  |
| sfx-extra#bigWinTier_1 | sfx | 2.17 | -15.9 | -13.5 | -2.1 | -2.2 | yes |  |
| sfx-extra#bigWinTier_2 | sfx | 2.15 | -16.3 | -13.7 | -1.8 | -1.7 | yes |  |
| sfx-extra#bigWinTier_3 | sfx | 2.18 | -15.0 | -12.5 | -1.8 | -1.8 | yes |  |
| sfx-extra#bigWinEnd | sfx | 3.43 | -14.7 | -12.5 | -2.8 | -2.7 | yes |  |
| sfx-extra#maxWin | sfx | 4.85 | -14.5 | -12.5 | -3.6 | -3.6 | yes |  |
| sfx-extra#tierSlam | sfx | 1.89 | -19.8 | -12.6 | -1.7 | -1.7 | yes |  |
| music-base.mp3 | music | 53.33 | -18.0 | -13.7 | -7.6 | -7.5 | yes | no gaps; seam: wav exact yes, mp3 SNR 26.2 dB, junction -27.9 dB, step x1.71; rms last/first 50 ms -28.4/-18.9 dB |
| music-rush.mp3 | music | 38.40 | -18.0 | -15.0 | -8.0 | -7.9 | yes | no gaps; seam: wav exact yes, mp3 SNR 18.9 dB, junction -22.9 dB, step x2.3; rms last/first 50 ms -22.3/-18.6 dB |
| music-rush-tension.mp3 | music stem | 38.40 | -22.0 | -17.4 | -8.2 | -8.2 | yes | seam: wav exact yes, mp3 SNR 22.4 dB, junction -17.1 dB, step x0.8; rms last/first 50 ms -34.4/-25.7 dB |
| music-last.mp3 | music | 48.00 | -18.0 | -15.0 | -7.9 | -7.9 | yes | no gaps; seam: wav exact yes, mp3 SNR 31.1 dB, junction -26.1 dB, step x2.12; rms last/first 50 ms -29.7/-19.2 dB |
| music-bigwin.mp3 | music | 16.00 | -18.0 | -16.0 | -8.9 | -8.9 | yes | no gaps; seam: wav exact yes, mp3 SNR 16.8 dB, junction -20.4 dB, step x1.75; rms last/first 50 ms -24.3/-19.4 dB |
| music-surge.mp3 | music | 12.80 | -18.0 | -12.4 | -6.6 | -6.6 | yes | no gaps; seam: wav exact yes, mp3 SNR 23.8 dB, junction -21.7 dB, step x1.09; rms last/first 50 ms -25.2/-21.1 dB |

**Decoded lengths (samples) and start offset vs ffmpeg, per engine**

| file | expected @44.1k | Chromium | WebKit | expected @48k | Chromium | WebKit | offset Cr/WK | ok |
|---|---:|---:|---:|---:|---:|---:|:-:|:-:|
| sfx-core.mp3 | 4438900 | 4438900 | n/a | 4831456 | 4831455 | n/a | 0/n/a | yes |
| sfx-extra.mp3 | 1507697 | 1507697 | n/a | 1641031 | 1641030 | n/a | 0/n/a | yes |
| music-base.mp3 | 2374050 | 2374050 | n/a | 2584000 | 2584000 | n/a | 0/n/a | yes |
| music-rush.mp3 | 1715490 | 1715490 | n/a | 1867200 | 1867200 | n/a | 0/n/a | yes |
| music-rush-tension.mp3 | 1715490 | 1715490 | n/a | 1867200 | 1867200 | n/a | 0/n/a | yes |
| music-last.mp3 | 2138850 | 2138850 | n/a | 2328000 | 2328000 | n/a | 0/n/a | yes |
| music-bigwin.mp3 | 727650 | 727650 | n/a | 792000 | 792000 | n/a | 0/n/a | yes |
| music-surge.mp3 | 586530 | 586530 | n/a | 638400 | 638400 | n/a | 0/n/a | yes |

<!-- QA:END -->

## Credits and licences

- All music is original, composed for this game in traditional swing, stride, blues and big-band
  idioms; no existing tune is quoted. The only borrowed figure is the traditional (public domain)
  "shave and a haircut, two bits" cadence in `bonusEnd`.
- All other sounds are synthesised in `tools/audio-lab`, except these Pixabay samples, used
  processed and layered (Pixabay Content License: free commercial use, modification and
  redistribution, no attribution required; credited here anyway). Source copies live in
  `tools/audio-lab/samples/`:
  - `sparkle.mp3`: low-passed shimmer in `ticketLand` 3..6, `coinLand` 3, `bonusTrigger`, `retrigger`, `goldenArrive`
  - `impact-bass-1.mp3`: sub layer in `tierSlam`
  - `impact-bass-2.mp3`: sub layer in `maxWin`
  - `whoosh.mp3`: kept in the lab, not used by this game
