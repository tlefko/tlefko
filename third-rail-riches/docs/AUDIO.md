# Audio: Powder Keg Cove

Everything you hear is authored as code with **Tone.js** in `tools/audio-lab`, rendered offline
(Tone.Offline in headless Chromium, driven by Playwright), then encoded with ffmpeg into
`public/audio`. The game runtime (`src/audio/index.ts`) is a small Web Audio player that decodes
those MP3s; Tone.js is never bundled into the game.

Style: a 1930s rubber-hose cartoon score for cocky pirates in a moonlit cove: concertina and
accordion, fiddle, tuba and upright bass, frame drum and shaker, a little brass. Warm, vintage and
slightly lo-fi: a subtle film-crackle bed in the music, gentle tape saturation and wow, narrowed
stereo, room reverb, cartoon timing. SFX are wood, rope, brass, gunpowder and gold, short and soft
enough to fire constantly without fatigue.

## Files

| file | contents |
|---|---|
| `public/audio/sfx-core.mp3` | sprite bank: every SFX used in the base game (including the Powder Keg / fuse meter / Captain's Wheel sounds) plus the two loop beds (128 kbps) |
| `public/audio/sfx-extra.mp3` | sprite bank: bonus and big-win stings, max win (loaded right after `ready`) |
| `public/audio/music-base.mp3` | base game loop, "Powder Keg Cove" |
| `public/audio/music-tantrum.mp3` | "Light the Fuse" loop |
| `public/audio/music-witching.mp3` + `music-witching-tension.mp3` | free-spins loop "Moonlight Raid" and its tension stem |
| `public/audio/music-limbo.mp3` | "Davy Jones' Waltz" loop (hidden bonus) |
| `public/audio/music-bigwin.mp3` | big-win loop, "Plunder Fanfare" |
| `src/audio/manifest.ts` | generated: sprite offsets, loop points, bpm/bars, variants |
| `src/audio/index.ts` | runtime player (API below) |

## Runtime API (`import { audio } from './audio'`)

- `audio.init()`: call from the first user gesture. Creates/resumes the AudioContext (never
  before), unlocks iOS, starts loading. Everything else is safe to call before `init()`:
  `music()`, `loop()`, `intensity()` and the setters are remembered and applied later;
  `play()` and `duck()` are no-ops until the context runs.
- `audio.ready`: resolves once the core SFX bank and the base music are decoded (also resolves if
  loading fails, so it never blocks the game).
- `audio.play(name, { rate, volume, pan, index, delay })`: `index` picks a step for the rising
  sounds: `fsLand` 1..6, `win` 0..7 (per cascade), `bigWinTier` 0..3, `explode` 1..6 (chain
  position), `meterFlame` 1..10, `hounds` 1..5 (count) and `boost` (multiplier level 2..20, nearest
  rendered step at or below). Past the last step the pitch keeps climbing a semitone per step (max
  +5). For other sounds it selects a variation (`reelDrop`, `coin`, `wheelTick`, `blastDebris`,
  `wildLand`, ...). Omitting it picks a random variation, never the same twice in a row.
  Frequent sounds get a tiny random pitch variation when no `rate` is given.
- `audio.loop('anticipation' | 'wheelSpin', on)`: looping beds with short fades.
- `audio.music(track, { fade })`: crossfades (default 0.9 s) to `base | tantrum | witching |
  limbo | bigwin | none`. Loops are gapless (see below). Base music resumes at the start of the
  4-bar phrase it was in when you come back from a bonus or big win; other tracks start at bar 1.
- `audio.intensity(0..1)`: the free-spins track (`witching`) fades in its tension stem
  (equal-power). While the `anticipation` loop is on (and the track is not `witching`) the music
  also recedes (lowpass
  down to 1.6 kHz and -3.7 dB at 1) and the anticipation bed brightens and rises in pitch
  (+2 semitones at 1).
- `audio.duck(amount, seconds)`: dips the music bus (overlapping ducks keep the deepest and the
  longest). Big stings (`bonusTrigger`, `bonusIntro`, `bonusEnd`, `bigWin*`, `maxWin`, `multMul`,
  `barApply`) duck automatically.
- `audio.beat()`: `{ bpm, beat, phase, bar }` from the playing track's clock, compensated for
  output latency. `beat` is the beat inside the bar, `phase` 0..1 inside the beat, `bar` the bar
  inside the loop. Before `init()` it free-runs at the base tempo; it keeps running while music
  is disabled. The base track is in 6/8 and its clock counts the dotted-quarter pulse (96 bpm, 2
  beats per bar), which is what the characters bounce to.
- `setMusicEnabled`, `setSfxEnabled`, `setVolume(v)` (perceptual, gain = v^2).
- Extras: `setAudioBaseUrl(url)` (default `${import.meta.env.BASE_URL}audio/`), `audioDebug()`.

Robustness: per-sound polyphony caps with voice stealing (oldest first, 6 ms fade) plus a global
cap of 32 voices; repeats closer than a per-sound `minGap` are merged so a burst of 30 `pop` calls
does not phase or clip; a safety limiter sits on the master. On tab hide the context is suspended
(music and loops pause in place) and `play()` is ignored so nothing piles up; on show it resumes,
falling back to "resume on next tap" when Safari leaves the context interrupted. Decoded music is
large, so only base, big win and the current track stay decoded (compressed bytes stay cached).
Tuning knobs (voices, minGap, jitter, gain, auto-duck) live in `PARAMS` at the top of
`src/audio/index.ts` and need no re-render.

## Gapless loops

Each music loop is rendered DAW-style: every unique note is rendered once with Tone.Offline, notes
are sequenced sample-accurately into stems (wrapping at the loop length), and a final Tone.Offline
mixdown runs the stems through buses, convolution reverb and tape wow. Everything that rings past
the loop end (reverb, releases) is folded back onto the start, so one period of audio is exactly
one cycle of the infinitely repeated piece. LFO rates are snapped to whole cycles per loop and the
master EQ runs circularly, so the seam is continuous by construction.

The file then carries 0.25 s of pre-roll (the loop's last 0.25 s) and 0.25 s of post-roll (its
first 0.25 s): `loopStart`/`loopEnd` in the manifest sit on exact bar boundaries inside the file,
never at the file edges. Any window of one loop length inside the file is a perfect loop, so even a
decoder that mishandled MP3 encoder delay/padding would only shift the beat clock slightly, never
click. Tempos were chosen so every loop is a whole number of samples at both 44.1 and 48 kHz
(base 96 dotted-quarter bpm x 32 bars of 6/8 = 40 s, 150 x 32 = 51.2 s, 80 x 16 = 48 s, 90 in 3/4
x 24 = 48 s, 120 x 8 = 16 s). The QA script checks the seam, and decodes every file in Chromium and WebKit to
confirm lengths and alignment.

## Sound list

Music (all ~-18 LUFS so SFX cut through):

| track | description |
|---|---|
| base "Powder Keg Cove" | easy-going 6/8 sea shanty in D dorian (dotted quarter = 96): concertina lead with fiddle answers at the phrase ends (the fiddle harmonises in thirds and sixths on the second pass), pizzicato bass then oom-pah tuba, accordion off-beat chords, light frame drum and shaker, a low bed of waves and creaking timbers |
| tantrum "Light the Fuse" | hot G minor hornpipe, 150 bpm, AA'BB' with the stamped three-crotchet cadences: fiddle lead with 16th-note runs, concertina doubling and harmonising, stabbing brass, oom-pah tuba and accordion, driving snare with rolls, tambourine, crashes |
| witching "Moonlight Raid" (free spins) | spooky nocturnal shanty, D minor, 80 bpm: solo cello sings the tune over low bowed drones, then a ghost choir takes it over wordless "oo" pads; glockenspiel and celesta glints like moonlight on the water, slow ship's-bell accents, muffled oar strokes, waves lapping the hull. Tension stem: tremolo strings, the oars pulling hard, creaking rigging, low brass swells, a ghostly glass whistle |
| limbo "Davy Jones' Waltz" (hidden) | ethereal 3/4 waltz from the bottom of the sea, D minor lifting to F major: music box and celesta trade the tune over a soft oom-pah-pah, choir opening from "oo" to "ah" with high strings for the last phrase, underwater wobble, rising bubbles and a slow dark current |
| bigwin "Plunder Fanfare" | Bb major cartoon brass march with accordion flourishes and pumps, trumpets in thirds, oom-pah tuba and trombones, glockenspiel, snare rolls, a cheeky minor iv, timpani roll across the loop seam |

SFX (variations in brackets):

| name | sound |
|---|---|
| uiClick, uiToggle | soft wooden peg tick / two-step latch click |
| uiOpen, uiClose | brass spyglass sliding open (with a tiny ping) / shut (with a wooden thock) |
| betUp, betDown | two-note marimba step with a doubloon clink, up / down |
| spinPress | rope-and-pulley lever: wooden thock, rope run, pulley squeak |
| buy | heavy coin pouch drops, the chest latch snaps shut, a small ship's bell |
| error | gentle two-note muted-horn womp over a soft tuba |
| iris | bosun's call: pipe up, finger warble, fall away |
| reelDrop [5] | wooden cargo crate thunk per column |
| reelStop | heavier crate with a little wooden clatter |
| symbolFall [3] | very light air whoosh |
| cascade [2] | short tumble of small crates |
| pop [3] | soft grog-bottle cork and a puff |
| sixLand | a cold Powder Keg lands: heavy barrel thunk, iron hoops, gunpowder rattle, rocks and settles |
| sixIgnite | match strike, flare, fuse hiss catching |
| fsLand [1..6] | treasure chest thuds down, coins jingle, a glockenspiel/celesta plink rising a D minor arpeggio (ship's bell from step 4) |
| anticipationStart / End | heartbeat, straining rope creak, tremolo swell / soft release with a frame-drum settle |
| anticipation (loop) | heartbeat and creaking rigging over an endlessly rising Shepard-tone tremolo string bed |
| win [0..7] | xylophone flourish onto a short concertina chord, climbing a pentatonic step per cascade |
| wheelAppear | whoosh in, the helm seats with a wooden clunk, a creak and brass clicks |
| wheelSpin (loop) | brass pawl clicks, a steady spindle creak and a soft whir |
| wheelTick [4] | single brass pawl click |
| wheelLand | the helm locks with a clack and the ship's bell rings twice |
| howl | Sparks the parrot: a synthesised "rraawk!" (rough formant voice) with a whistled tail |
| cashBronze / Silver / Gold | doubloon clinks of increasing richness (gold: a spill of doubloons, ship's bell ding-ding, sparkle) |
| multAdd | upward swoosh into a glockenspiel run and a ship's bell |
| multMul | fuse fizz into a cannon thump with a brass and concertina stab |
| maxWin | drum roll, a three-gun cannon salute, full brass, accordion and choir |
| barTick [3] | tiny counting tick |
| barApply | cannon thump, snare, brass and accordion chord |
| bonusTrigger | treasure chest lid creaks open, doubloons spill, cymbal and a choir "aah" |
| bonusIntro | snare roll into a brass and accordion "ta-da" with a cannon |
| bonusEnd | "shave and a haircut, two bits" cadence (traditional) on accordion, xylophone and tuba, ship's bell |
| retrigger | ship's bell ding-ding over a glockenspiel and concertina run |
| bigWinStart | accordion run into a brass/accordion stab, cannon, crash, timpani |
| bigWinTier [0..3] | pickup into a brass/accordion stab, top note climbing Bb, D, F, Bb (a cannon from tier 2) |
| bigWinEnd | V-I brass and accordion "ta-da" with a drum roll and cannon |
| coin [8] | single heavy gold doubloon clink for coin showers |
| explode [1..6] | Powder Keg blast: crack, gunpowder boom and wooden debris; pitch and weight climb with chain position |
| blastDebris [4] | wood splinters landing with a short fuse sizzle (plays often) |
| meterFlame [1..10] | one spark catches on the powder fuse: crackle, tick and glock ping, rising a D dorian step per spark |
| meterFull | fuse fully lit: the hiss swells into a ship's bell (two strokes) and a cannon thump |
| hounds [1..5] | KEG DROP: kegs thump onto the board one after another across the stereo field, the last one rolls; index = count |
| inferno | BROADSIDE: a rolling volley of six cannon shots sweeping left to right |
| boost [2,3,4,5,7,10,15,20] | GROG: tankards clink, a glug, the crew whoops "hey!" with a rising whistle and glock run, higher and brighter for bigger levels; any level 2..20 maps to the nearest step at or below |
| wildLand [3] | cold Powder Keg lands: heavy barrel thunk with a faint gunpowder rattle, rocks on its rim |

New in the Kaboom Bomb update: 38 more names (53 assets) for the bomb, Cap'n Kaboom, Sparks, the wheel,
big moments, per-symbol win accents, Powder Boost and the splash. Their list, trigger moments and the
game functions that should call them are in [`docs/SOUNDS.md`](SOUNDS.md). That doc also covers the runtime
limits: the two new loops need `LoopName` support, and indexed ids need clamping.

## Regenerating

```bash
node tools/audio-lab/render.mjs              # render everything, normalise, pack, encode, write manifest
node tools/audio-lab/render.mjs --only=howl,base   # re-render some ids, rebuild from cached WAVs
node tools/audio-lab/render.mjs --skip-render      # rebuild banks/MP3s/manifest from existing WAVs
node tools/audio-lab/qa.mjs                  # measurements, spectrograms, Chromium + WebKit decode check
node tools/audio-lab/smoke.mjs               # drives the runtime in Chromium + WebKit (see below)
```

A full render takes a few minutes (music is rendered DAW-style, see "Gapless loops"; the ffmpeg
build step dominates on a busy machine). Loudness measurements are cached by WAV hash, so level
tweaks in the SFX definitions only need `--only=<one id>` to refresh the catalog, or `--skip-render`
if no `level` changed.

Needs `npx playwright install chromium webkit` once and ffmpeg (`/opt/homebrew/bin/ffmpeg`, or set
`FFMPEG`). Intermediate WAVs, spectrograms and logs go to `tools/audio-lab/out/` (git-ignored).

Audition: run `npx vite` in the project root and open `/tools/audio-lab/` (or
`node tools/audio-lab/lib/server.mjs` and open the printed URL). The page drives the real runtime
with the shipped files: a button per SFX and variation, every track with crossfade, intensity and
duck controls, a beat-synced bouncing dot, loop toggles, game-like demo sequences (spin, cascade
chain, wheel, bar count, anticipation, big win, stress test) and the QA table.
`/tools/audio-lab/render.html` renders any definition live in the browser for sound-design
iteration (before normalisation and MP3).

Where things live: instruments in `tools/audio-lab/src/instruments`, SFX in
`tools/audio-lab/src/sfx`, music in `tools/audio-lab/src/music` (parts are written in a small
validated notation, see `src/core/score.ts`), mastering in `src/pipeline.ts`, loudness targets per
SFX in each definition (`level`, max momentary LUFS; an optional `drive` soft-clips a transient-heavy
sting so it can reach its target under the peak ceiling).

Loudness: music is normalised to -18 LUFS integrated, measured on the decoded MP3 loop (a second
encode pass corrects the ~0.4 LU shift MP3 coding introduces). Each SFX is normalised to its own
max-momentary target and capped at -1.5 dBTP before encoding so decoded peaks stay under -1 dBFS.
Measured result: counting ticks -26 to -28 LUFS-M, cascade whooshes -26, coins -22.5, UI -21 to -25,
column drops and pops -20 to -22, events -14 to -18 (fsLand and win climb about 3 dB across their
steps), bonus and big-win stings -12.4 to -14.5. Percussive sounds hit the peak cap before their
loudness target, so a few land 1 to 2 dB under it (listed as "limited" in `out/build-report.json`).

## Runtime smoke test

`tools/audio-lab/smoke.mjs` loads the audition page in Chromium and WebKit and checks: every
`SfxName` has assets; calling `play/loop/intensity/duck/setVolume/music/beat` before `init()`
creates no AudioContext and throws nothing, and `beat()` already runs at the base tempo from the
manifest; after a real click the context runs and `ready`
resolves (about 1 s in both engines on the dev machine); the base loop decodes to exactly the
expected length at the context rate (1,944,000 samples at 48 kHz); every SFX name in the manifest plays (87);
stepped indices map to the right assets (e.g. `boost` 12 plays the level-10 step, `explode` 9 plays
step 6 pitched up); a
burst of 600 calls never exceeds the 32-voice cap; the anticipation loop starts; switching to
the free-spins track (`witching`) decodes its stem and the beat clock follows (80 bpm); hiding the tab suspends the
context and drops `play()` calls; showing it resumes. Last run: all checks passed in both engines.

## Measurements

<!-- QA:BEGIN -->
Generated by `node tools/audio-lab/qa.mjs` on 2026-09-29. Total public/audio: **7.59 MB**. Checks: sample peak <= -1 dBFS on every asset; no silent gaps in music; loop seams exact in the pre-encode WAV, and after MP3 the post-roll matches the loop start (SNR >= 12 dB, error in the 2 ms after the jump <= -12 dB re local level). Failures: **0**.

| asset | kind | s | LUFS-I | LUFS-M max | sample pk | true pk | ok | notes |
|---|---|---:|---:|---:|---:|---:|:-:|---|
| sfx-core#uiClick | sfx | 0.18 | -25.6 | -25.6 | -3.5 | -3.4 | yes |  |
| sfx-core#uiToggle | sfx | 0.24 | -24.5 | -24.5 | -5.0 | -5.0 | yes |  |
| sfx-core#uiOpen | sfx | 0.54 | -24.8 | -22.4 | -7.2 | -7.2 | yes |  |
| sfx-core#uiClose | sfx | 0.32 | -26.1 | -23.5 | -2.2 | -2.2 | yes |  |
| sfx-core#betUp | sfx | 0.47 | -24.9 | -22.5 | -7.7 | -7.6 | yes |  |
| sfx-core#betDown | sfx | 0.52 | -24.9 | -22.5 | -10.1 | -10.0 | yes |  |
| sfx-core#spinPress | sfx | 0.30 | -24.1 | -21.4 | -2.4 | -2.4 | yes |  |
| sfx-core#buy | sfx | 1.00 | -20.7 | -17.2 | -2.0 | -1.9 | yes |  |
| sfx-core#error | sfx | 0.70 | -24.7 | -22.5 | -13.8 | -13.8 | yes |  |
| sfx-core#iris | sfx | 1.07 | -21.6 | -19.5 | -20.0 | -20.0 | yes |  |
| sfx-core#boostOn | sfx | 0.61 | -24.5 | -22.1 | -8.2 | -8.1 | yes |  |
| sfx-core#boostOff | sfx | 0.49 | -25.9 | -23.1 | -8.7 | -8.6 | yes |  |
| sfx-core#lowPowerClick | sfx | 0.18 | -24.5 | -24.5 | -5.0 | -4.9 | yes |  |
| sfx-core#reelDrop_0 | sfx | 0.23 | -20.5 | -20.5 | -2.8 | -2.8 | yes |  |
| sfx-core#reelDrop_1 | sfx | 0.30 | -20.5 | -20.5 | -3.5 | -3.5 | yes |  |
| sfx-core#reelDrop_2 | sfx | 0.25 | -20.5 | -20.5 | -3.0 | -3.0 | yes |  |
| sfx-core#reelDrop_3 | sfx | 0.25 | -20.4 | -20.4 | -3.6 | -3.6 | yes |  |
| sfx-core#reelDrop_4 | sfx | 0.24 | -20.4 | -20.4 | -3.5 | -3.5 | yes |  |
| sfx-core#reelStop | sfx | 0.59 | -18.7 | -18.7 | -1.9 | -1.9 | yes |  |
| sfx-core#symbolFall_0 | sfx | 0.31 | -29.1 | -26.4 | -12.1 | -12.0 | yes |  |
| sfx-core#symbolFall_1 | sfx | 0.33 | -28.8 | -26.3 | -12.5 | -12.5 | yes |  |
| sfx-core#symbolFall_2 | sfx | 0.35 | -28.6 | -26.4 | -13.2 | -13.1 | yes |  |
| sfx-core#cascade_0 | sfx | 0.39 | -24.8 | -22.5 | -8.4 | -8.4 | yes |  |
| sfx-core#cascade_1 | sfx | 0.37 | -24.8 | -22.5 | -8.3 | -8.3 | yes |  |
| sfx-core#pop_0 | sfx | 0.26 | -21.5 | -21.5 | -2.6 | -2.6 | yes |  |
| sfx-core#pop_1 | sfx | 0.25 | -21.4 | -21.4 | -2.8 | -2.8 | yes |  |
| sfx-core#pop_2 | sfx | 0.26 | -21.5 | -21.5 | -3.2 | -3.2 | yes |  |
| sfx-core#sixLand | sfx | 0.79 | -19.8 | -15.5 | -2.3 | -2.3 | yes |  |
| sfx-core#sixIgnite | sfx | 1.60 | -16.9 | -15.1 | -8.2 | -7.9 | yes |  |
| sfx-core#fsLand_1 | sfx | 1.01 | -22.1 | -17.4 | -3.5 | -3.5 | yes |  |
| sfx-core#fsLand_2 | sfx | 0.97 | -21.5 | -16.8 | -2.4 | -2.4 | yes |  |
| sfx-core#fsLand_3 | sfx | 1.09 | -20.3 | -16.3 | -2.8 | -2.8 | yes |  |
| sfx-core#fsLand_4 | sfx | 1.13 | -19.1 | -15.6 | -3.3 | -3.3 | yes |  |
| sfx-core#fsLand_5 | sfx | 1.21 | -19.2 | -15.1 | -3.1 | -3.1 | yes |  |
| sfx-core#fsLand_6 | sfx | 1.63 | -18.7 | -14.4 | -4.3 | -4.3 | yes |  |
| sfx-core#win_0 | sfx | 0.96 | -19.7 | -17.5 | -4.9 | -4.9 | yes |  |
| sfx-core#win_1 | sfx | 0.99 | -19.2 | -17.0 | -2.9 | -2.9 | yes |  |
| sfx-core#win_2 | sfx | 0.95 | -19.0 | -16.6 | -4.1 | -4.1 | yes |  |
| sfx-core#win_3 | sfx | 0.98 | -18.3 | -16.2 | -4.6 | -4.6 | yes |  |
| sfx-core#win_4 | sfx | 1.02 | -17.9 | -15.9 | -3.5 | -3.5 | yes |  |
| sfx-core#win_5 | sfx | 0.97 | -17.7 | -15.5 | -3.4 | -3.3 | yes |  |
| sfx-core#win_6 | sfx | 1.00 | -17.2 | -14.9 | -2.9 | -2.9 | yes |  |
| sfx-core#win_7 | sfx | 0.99 | -16.9 | -14.7 | -4.0 | -4.0 | yes |  |
| sfx-core#coin_0 | sfx | 0.28 | -22.4 | -22.4 | -8.5 | -8.4 | yes |  |
| sfx-core#coin_1 | sfx | 0.33 | -22.5 | -22.5 | -9.3 | -9.2 | yes |  |
| sfx-core#coin_2 | sfx | 0.32 | -22.4 | -22.4 | -9.2 | -9.0 | yes |  |
| sfx-core#coin_3 | sfx | 0.37 | -25.1 | -22.4 | -9.7 | -9.8 | yes |  |
| sfx-core#coin_4 | sfx | 0.31 | -22.5 | -22.5 | -8.8 | -8.8 | yes |  |
| sfx-core#coin_5 | sfx | 0.29 | -22.5 | -22.5 | -8.5 | -8.5 | yes |  |
| sfx-core#coin_6 | sfx | 0.34 | -25.3 | -22.5 | -9.7 | -9.7 | yes |  |
| sfx-core#coin_7 | sfx | 0.37 | -25.2 | -22.4 | -10.1 | -10.1 | yes |  |
| sfx-core#cashBronze | sfx | 0.66 | -19.8 | -17.4 | -5.6 | -5.6 | yes |  |
| sfx-core#cashSilver | sfx | 1.11 | -19.3 | -15.5 | -5.9 | -5.8 | yes |  |
| sfx-core#cashGold | sfx | 1.89 | -17.9 | -13.5 | -2.5 | -2.5 | yes |  |
| sfx-core#multAdd | sfx | 1.50 | -17.0 | -14.5 | -4.9 | -4.8 | yes |  |
| sfx-core#wheelAppear | sfx | 1.03 | -18.7 | -18.0 | -1.9 | -1.9 | yes |  |
| sfx-core#wheelSpin | sfx loop | 1.24 | -23.8 | -23.5 | -5.1 | -5.1 | yes | seam: wav exact yes, mp3 SNR 18.3 dB, junction -26.1 dB, step x1.58 |
| sfx-core#wheelTick_0 | sfx | 0.15 | -25.2 | -25.2 | -2.2 | -2.1 | yes |  |
| sfx-core#wheelTick_1 | sfx | 0.15 | -24.5 | -24.5 | -2.3 | -2.3 | yes |  |
| sfx-core#wheelTick_2 | sfx | 0.15 | -25.0 | -25.0 | -2.2 | -2.1 | yes |  |
| sfx-core#wheelTick_3 | sfx | 0.15 | -26.4 | -26.4 | -2.3 | -2.2 | yes |  |
| sfx-core#wheelLand | sfx | 1.37 | -20.2 | -15.3 | -1.9 | -1.9 | yes |  |
| sfx-core#howl | sfx | 1.59 | -18.3 | -14.5 | -8.1 | -8.1 | yes |  |
| sfx-core#multMul | sfx | 2.19 | -18.7 | -14.1 | -2.0 | -2.0 | yes |  |
| sfx-core#wheelPullback | sfx | 0.63 | -24.5 | -21.4 | -2.9 | -2.8 | yes |  |
| sfx-core#wheelLandClunk | sfx | 0.59 | -18.2 | -18.2 | -2.0 | -2.0 | yes |  |
| sfx-core#wheelIconLift | sfx | 1.39 | -21.2 | -18.5 | -7.8 | -7.9 | yes |  |
| sfx-core#wheelBombReveal | sfx | 1.91 | -18.0 | -15.5 | -4.4 | -4.3 | yes |  |
| sfx-core#barTick_0 | sfx | 0.03 | -27.5 | -27.5 | -5.4 | -5.4 | yes |  |
| sfx-core#barTick_1 | sfx | 0.03 | -27.4 | -27.4 | -5.4 | -5.3 | yes |  |
| sfx-core#barTick_2 | sfx | 0.03 | -27.4 | -27.4 | -5.3 | -5.3 | yes |  |
| sfx-core#barApply | sfx | 1.12 | -18.0 | -14.8 | -2.0 | -1.9 | yes |  |
| sfx-core#bonusTrigger | sfx | 2.10 | -17.1 | -13.4 | -2.5 | -2.5 | yes |  |
| sfx-core#sealStamp | sfx | 0.57 | -18.4 | -15.5 | -2.2 | -2.2 | yes |  |
| sfx-core#clusterTrace | sfx | 1.15 | -27.7 | -24.5 | -15.8 | -15.8 | yes |  |
| sfx-core#anticipationStart | sfx | 1.56 | -22.8 | -16.8 | -1.9 | -1.9 | yes |  |
| sfx-core#anticipationEnd | sfx | 0.88 | -23.4 | -19.4 | -3.3 | -3.3 | yes |  |
| sfx-core#anticipation | sfx loop | 5.04 | -21.2 | -20.5 | -8.7 | -8.7 | yes | seam: wav exact yes, mp3 SNR 27.3 dB, junction -30.6 dB, step x1.59 |
| sfx-core#explode_1 | sfx | 0.72 | -21.8 | -19.1 | -4.0 | -4.0 | yes |  |
| sfx-core#explode_2 | sfx | 0.67 | -23.2 | -18.8 | -4.4 | -4.3 | yes |  |
| sfx-core#explode_3 | sfx | 0.71 | -22.4 | -18.1 | -4.7 | -4.7 | yes |  |
| sfx-core#explode_4 | sfx | 0.73 | -21.8 | -17.5 | -3.7 | -3.7 | yes |  |
| sfx-core#explode_5 | sfx | 0.74 | -21.2 | -16.8 | -2.7 | -2.7 | yes |  |
| sfx-core#explode_6 | sfx | 0.73 | -20.6 | -16.4 | -1.9 | -1.9 | yes |  |
| sfx-core#blastDebris_0 | sfx | 0.29 | -27.9 | -26.0 | -10.1 | -10.0 | yes |  |
| sfx-core#blastDebris_1 | sfx | 0.30 | -27.7 | -25.9 | -7.0 | -7.0 | yes |  |
| sfx-core#blastDebris_2 | sfx | 0.25 | -28.4 | -25.8 | -7.3 | -7.3 | yes |  |
| sfx-core#blastDebris_3 | sfx | 0.29 | -28.6 | -25.9 | -9.1 | -9.0 | yes |  |
| sfx-core#meterFlame_1 | sfx | 0.29 | -25.5 | -25.5 | -8.7 | -8.7 | yes |  |
| sfx-core#meterFlame_2 | sfx | 0.28 | -25.1 | -25.1 | -6.8 | -6.8 | yes |  |
| sfx-core#meterFlame_3 | sfx | 0.30 | -25.0 | -25.0 | -9.2 | -9.1 | yes |  |
| sfx-core#meterFlame_4 | sfx | 0.30 | -25.0 | -25.0 | -8.2 | -8.2 | yes |  |
| sfx-core#meterFlame_5 | sfx | 0.30 | -24.5 | -24.5 | -7.5 | -7.3 | yes |  |
| sfx-core#meterFlame_6 | sfx | 0.30 | -24.3 | -24.3 | -8.6 | -8.5 | yes |  |
| sfx-core#meterFlame_7 | sfx | 0.31 | -23.9 | -23.9 | -9.2 | -9.0 | yes |  |
| sfx-core#meterFlame_8 | sfx | 0.32 | -23.7 | -23.7 | -9.1 | -9.1 | yes |  |
| sfx-core#meterFlame_9 | sfx | 0.30 | -23.5 | -23.5 | -8.3 | -7.8 | yes |  |
| sfx-core#meterFlame_10 | sfx | 0.31 | -23.3 | -23.3 | -8.2 | -8.2 | yes |  |
| sfx-core#meterFull | sfx | 2.40 | -19.0 | -14.5 | -2.2 | -2.2 | yes |  |
| sfx-core#hounds_1 | sfx | 0.77 | -22.5 | -17.5 | -3.2 | -3.2 | yes |  |
| sfx-core#hounds_2 | sfx | 0.82 | -21.0 | -17.0 | -3.5 | -3.5 | yes |  |
| sfx-core#hounds_3 | sfx | 0.92 | -20.1 | -16.4 | -3.2 | -3.2 | yes |  |
| sfx-core#hounds_4 | sfx | 1.06 | -18.6 | -16.0 | -4.4 | -4.4 | yes |  |
| sfx-core#hounds_5 | sfx | 1.17 | -17.6 | -15.5 | -3.4 | -3.3 | yes |  |
| sfx-core#inferno | sfx | 1.49 | -15.9 | -14.5 | -2.5 | -2.5 | yes |  |
| sfx-core#boost_2 | sfx | 1.40 | -18.5 | -16.0 | -6.5 | -6.5 | yes |  |
| sfx-core#boost_3 | sfx | 1.40 | -18.1 | -15.6 | -5.7 | -5.7 | yes |  |
| sfx-core#boost_4 | sfx | 1.40 | -17.7 | -15.2 | -5.5 | -5.5 | yes |  |
| sfx-core#boost_5 | sfx | 1.40 | -17.5 | -14.9 | -5.0 | -5.0 | yes |  |
| sfx-core#boost_7 | sfx | 1.40 | -17.2 | -14.6 | -4.3 | -4.3 | yes |  |
| sfx-core#boost_10 | sfx | 1.40 | -16.9 | -14.2 | -3.5 | -3.5 | yes |  |
| sfx-core#boost_15 | sfx | 1.40 | -16.6 | -13.9 | -1.9 | -1.9 | yes |  |
| sfx-core#boost_20 | sfx | 1.40 | -16.3 | -13.6 | -2.2 | -2.2 | yes |  |
| sfx-core#wildLand_0 | sfx | 0.72 | -21.3 | -18.5 | -3.5 | -3.4 | yes |  |
| sfx-core#wildLand_1 | sfx | 0.71 | -21.1 | -18.3 | -3.6 | -3.6 | yes |  |
| sfx-core#wildLand_2 | sfx | 0.69 | -23.0 | -18.6 | -3.5 | -3.5 | yes |  |
| sfx-core#bombLand | sfx | 0.67 | -23.6 | -18.2 | -1.8 | -1.8 | yes |  |
| sfx-core#bombFuseLoop | sfx loop | 3.24 | -25.6 | -25.2 | -15.8 | -15.7 | yes | seam: wav exact yes, mp3 SNR 23.4 dB, junction -25.1 dB, step x0.85 |
| sfx-core#bombTick | sfx | 0.26 | -21.4 | -21.4 | -3.7 | -3.7 | yes |  |
| sfx-core#bombHotLoop | sfx loop | 3.44 | -25.5 | -24.2 | -15.1 | -15.1 | yes | seam: wav exact yes, mp3 SNR 40.3 dB, junction -43.8 dB, step x0.38 |
| sfx-core#bombGrow_1 | sfx | 1.04 | -18.5 | -17.4 | -5.8 | -5.8 | yes |  |
| sfx-core#bombGrow_2 | sfx | 1.05 | -18.0 | -16.9 | -5.7 | -5.7 | yes |  |
| sfx-core#bombGrow_3 | sfx | 1.07 | -17.3 | -16.2 | -5.0 | -5.0 | yes |  |
| sfx-core#bombGrow_4 | sfx | 1.04 | -16.8 | -15.7 | -3.4 | -3.4 | yes |  |
| sfx-core#bombGrow_5 | sfx | 1.08 | -16.1 | -15.1 | -4.5 | -4.5 | yes |  |
| sfx-core#bombBlast_1 | sfx | 0.92 | -21.0 | -15.7 | -1.8 | -1.8 | yes |  |
| sfx-core#bombBlast_2 | sfx | 1.29 | -20.2 | -15.2 | -2.1 | -2.1 | yes |  |
| sfx-core#bombBlast_3 | sfx | 2.08 | -21.8 | -15.0 | -2.1 | -2.1 | yes |  |
| sfx-core#bombBlast_4 | sfx | 2.61 | -20.9 | -13.4 | -2.6 | -2.5 | yes |  |
| sfx-core#bombBlast_5 | sfx | 3.06 | -18.5 | -13.1 | -2.2 | -2.2 | yes |  |
| sfx-core#bombChain_0 | sfx | 1.02 | -19.3 | -15.8 | -2.1 | -2.0 | yes |  |
| sfx-core#bombChain_1 | sfx | 1.02 | -19.1 | -15.8 | -2.6 | -2.6 | yes |  |
| sfx-core#bombChain_2 | sfx | 1.02 | -19.1 | -15.5 | -1.7 | -1.6 | yes |  |
| sfx-core#endRumble | sfx | 2.31 | -18.9 | -15.5 | -5.4 | -5.4 | yes |  |
| sfx-core#capBelt | sfx | 0.48 | -22.9 | -21.4 | -4.7 | -4.7 | yes |  |
| sfx-core#capChargePip_1 | sfx | 0.89 | -25.0 | -21.5 | -8.8 | -8.6 | yes |  |
| sfx-core#capChargePip_2 | sfx | 0.90 | -24.2 | -20.8 | -7.6 | -7.6 | yes |  |
| sfx-core#capChargePip_3 | sfx | 0.90 | -23.5 | -20.0 | -6.6 | -6.6 | yes |  |
| sfx-core#capChargeFull | sfx | 1.60 | -19.4 | -16.5 | -6.7 | -6.7 | yes |  |
| sfx-core#capWindup | sfx | 1.20 | -20.7 | -19.4 | -13.0 | -12.9 | yes |  |
| sfx-core#capThrow | sfx | 0.84 | -21.4 | -17.6 | -6.2 | -6.2 | yes |  |
| sfx-core#capPegTap_0 | sfx | 0.20 | -24.6 | -24.6 | -2.8 | -2.8 | yes |  |
| sfx-core#capPegTap_1 | sfx | 0.21 | -24.4 | -24.4 | -2.1 | -2.1 | yes |  |
| sfx-core#capPegTap_2 | sfx | 0.21 | -24.4 | -24.4 | -2.8 | -2.8 | yes |  |
| sfx-core#parrotSquawk | sfx | 0.99 | -19.4 | -16.6 | -7.3 | -7.3 | yes |  |
| sfx-core#parrotFlap_0 | sfx | 0.37 | -25.0 | -23.4 | -5.1 | -5.1 | yes |  |
| sfx-core#parrotFlap_1 | sfx | 0.44 | -26.2 | -23.5 | -7.2 | -7.2 | yes |  |
| sfx-core#symCrab | sfx | 0.20 | -24.5 | -24.5 | -3.1 | -2.9 | yes |  |
| sfx-core#symOcto | sfx | 0.28 | -28.3 | -25.4 | -5.4 | -5.4 | yes |  |
| sfx-core#symShark | sfx | 0.20 | -24.5 | -24.5 | -5.8 | -5.8 | yes |  |
| sfx-core#symParrot | sfx | 0.37 | -27.2 | -24.6 | -12.4 | -12.3 | yes |  |
| sfx-core#symAnchor | sfx | 0.66 | -25.5 | -24.3 | -7.8 | -7.8 | yes |  |
| sfx-core#symShell | sfx | 0.68 | -26.6 | -24.4 | -8.9 | -8.9 | yes |  |
| sfx-core#symMap | sfx | 0.79 | -26.7 | -24.5 | -13.3 | -13.2 | yes |  |
| sfx-core#symCompass | sfx | 0.57 | -28.9 | -25.5 | -11.1 | -11.0 | yes |  |
| sfx-core#introSting | sfx | 2.80 | -18.5 | -15.5 | -4.3 | -4.2 | yes |  |
| sfx-core#playSting | sfx | 1.71 | -17.3 | -15.5 | -5.6 | -5.5 | yes |  |
| sfx-core#carouselWhoosh | sfx | 0.39 | -25.1 | -24.4 | -10.9 | -10.9 | yes |  |
| sfx-core#coachPop | sfx | 0.39 | -26.3 | -23.4 | -5.3 | -5.3 | yes |  |
| sfx-extra#bonusIntro | sfx | 3.00 | -17.3 | -14.5 | -5.0 | -4.9 | yes |  |
| sfx-extra#bonusEnd | sfx | 3.37 | -17.9 | -14.5 | -4.0 | -3.9 | yes |  |
| sfx-extra#retrigger | sfx | 1.95 | -17.7 | -14.4 | -5.4 | -5.4 | yes |  |
| sfx-extra#bigWinStart | sfx | 2.57 | -14.3 | -12.5 | -2.3 | -2.2 | yes |  |
| sfx-extra#bigWinTier_0 | sfx | 2.40 | -14.5 | -12.4 | -2.4 | -2.3 | yes |  |
| sfx-extra#bigWinTier_1 | sfx | 2.39 | -14.7 | -12.4 | -2.4 | -2.4 | yes |  |
| sfx-extra#bigWinTier_2 | sfx | 2.40 | -14.6 | -12.5 | -2.3 | -2.3 | yes |  |
| sfx-extra#bigWinTier_3 | sfx | 2.34 | -14.9 | -12.5 | -1.7 | -1.7 | yes |  |
| sfx-extra#bigWinEnd | sfx | 3.29 | -16.6 | -14.3 | -2.0 | -1.9 | yes |  |
| sfx-extra#maxWin | sfx | 4.99 | -14.5 | -12.5 | -2.6 | -2.6 | yes |  |
| sfx-extra#tierSlam | sfx | 1.89 | -20.1 | -12.6 | -1.1 | -1.1 | yes |  |
| music-base.mp3 | music | 40.00 | -18.0 | -16.0 | -7.0 | -7.0 | yes | no gaps; seam: wav exact yes, mp3 SNR 26.3 dB, junction -27.2 dB, step x1.15; rms last/first 50 ms -25.4/-16.8 dB |
| music-tantrum.mp3 | music | 51.20 | -18.0 | -14.8 | -6.0 | -6.0 | yes | no gaps; seam: wav exact yes, mp3 SNR 32.9 dB, junction -25.7 dB, step x0.6; rms last/first 50 ms -36.8/-16.6 dB |
| music-witching.mp3 | music | 48.00 | -18.0 | -14.2 | -7.5 | -7.5 | yes | no gaps; seam: wav exact yes, mp3 SNR 31.6 dB, junction -26.6 dB, step x0.25; rms last/first 50 ms -24.1/-16.1 dB |
| music-witching-tension.mp3 | music stem | 48.00 | -21.2 | -17.4 | -7.9 | -7.9 | yes | seam: wav exact yes, mp3 SNR 38.7 dB, junction -30.5 dB, step x0.65; rms last/first 50 ms -30/-16.8 dB |
| music-limbo.mp3 | music | 48.00 | -18.0 | -13.7 | -7.6 | -7.6 | yes | no gaps; seam: wav exact yes, mp3 SNR 34 dB, junction -28.2 dB, step x1.57; rms last/first 50 ms -25/-15.5 dB |
| music-bigwin.mp3 | music | 16.00 | -18.0 | -16.2 | -7.6 | -7.8 | yes | no gaps; seam: wav exact yes, mp3 SNR 24 dB, junction -26.8 dB, step x0.69; rms last/first 50 ms -21.1/-14.7 dB |

**Decoded lengths (samples) and start offset vs ffmpeg, per engine**

| file | expected @44.1k | Chromium | WebKit | expected @48k | Chromium | WebKit | offset Cr/WK | ok |
|---|---:|---:|---:|---:|---:|---:|:-:|:-:|
| sfx-core.mp3 | 6508418 | 6508418 | 6508418 | 7083992 | 7083992 | 7083992 | 0/0 | yes |
| sfx-extra.mp3 | 1382463 | 1382463 | 1382463 | 1504722 | 1504721 | 1504722 | 0/0 | yes |
| music-base.mp3 | 1786050 | 1786050 | 1786050 | 1944000 | 1944000 | 1944000 | 0/0 | yes |
| music-tantrum.mp3 | 2279970 | 2279970 | 2279970 | 2481600 | 2481600 | 2481600 | 0/0 | yes |
| music-witching.mp3 | 2138850 | 2138850 | 2138850 | 2328000 | 2328000 | 2328000 | 0/0 | yes |
| music-witching-tension.mp3 | 2138850 | 2138850 | 2138850 | 2328000 | 2328000 | 2328000 | 0/0 | yes |
| music-limbo.mp3 | 2138850 | 2138850 | 2138850 | 2328000 | 2328000 | 2328000 | 0/0 | yes |
| music-bigwin.mp3 | 727650 | 727650 | 727650 | 792000 | 792000 | 792000 | 0/0 | yes |

<!-- QA:END -->

## Credits and licences

- All music is original, composed for this game in traditional sea-shanty, hornpipe, jig and
  waltz idioms; no existing tune is quoted. The only borrowed figure is the traditional (public
  domain) "shave and a haircut, two bits" cadence in `bonusEnd`.
- All other sounds are synthesised in `tools/audio-lab`, except these Pixabay samples, used
  processed and layered (Pixabay Content License: free commercial use, modification and
  redistribution, no attribution required; credited here anyway). Source copies live in
  `tools/audio-lab/samples/`:
  - `whoosh.mp3`: band-passed layer in `wheelAppear`
  - `sparkle.mp3`: low-passed shimmer in `cashGold`, `multAdd`, `retrigger`
  - `impact-bass-1.mp3`: sub layer in `multMul`
  - `impact-bass-2.mp3`: sub layer in `maxWin`
