# Sounds: ids the game calls

Every id below is in `public/audio` and `src/audio/manifest.ts`. Sources live in `tools/audio-lab/src/sfx/`
(`ui.ts`, `reels.ts`, `wins.ts`, `symbols.ts`, `trains.ts`, `events.ts`, `splash.ts`, `map.ts`); descriptions are also in
`tools/audio-lab/sounds.json` and can be auditioned on `/tools/audio-lab/` (with game-like demo sequences).

Call them through the game adapter: `sound.play(id, { index, volume, rate, pan, delay })`,
`sound.loop(name, on)`, `sound.music(track, opts)`, `sound.intensity(v)`.

## Runtime notes (read first)

1. **Indexed ids.** `index` picks the variant whose number equals it (see the ranges below). With no
   `index`, a random variant plays (never the same twice in a row).
   - `STEPPED` in `src/audio/index.ts` still lists the old Powder Keg names, so for the new ids an
     out-of-range index **wraps around** (modulo the variant count) instead of clamping. Clamp in the
     caller (`ticketLand`: 1..6, `coinCollect`: 1..12, `coinLand`: 0..3, `reelDrop`: 0..5), or have the
     owner of `index.ts` add `'ticketLand', 'coinCollect'` to `STEPPED` (then past the top the pitch keeps
     climbing a semitone per step, max +5, which suits a long coin run).
   - `powerStep` is 1..12 and the wrap is intended: index 13 plays step 1 again, so a 35-step meter can
     pass its step number straight through and the blips cycle up the scale.
2. **Loops.** `LoopName` is now `'anticipation' | 'trainRun'`. `src/game/sound.ts` has its own copy of the
   old union (`'anticipation' | 'wheelSpin' | 'bombFuseLoop' | 'bombHotLoop'`): its owner should change it to
   `'anticipation' | 'trainRun'`.
3. **Tracks.** `Track` is `'base' | 'rush' | 'last' | 'bigwin' | 'surge' | 'none'`. `intensity()` fades in the
   Rush Hour tension stem when the track is `rush`; on other tracks it drives the anticipation bed (the
   music recedes under it). `surge` is a short loopable bed you can switch to for long anticipation moments
   instead of (or as well as) the `anticipation` loop.
4. **`SfxName`** in `src/audio/index.ts` (and the `PARAMS` voice/duck table) still lists the old names. The
   adapter accepts any string, so nothing breaks, but the typed list, `PARAMS` and auto-duck should be
   updated by the file's owner. Suggested `PARAMS`: `reelDrop {voices 6, minGap .02, jitter .025}`,
   `coinCollect {voices 4, minGap .03, priority 0}`, `coinLand {voices 6, minGap .02, jitter .02}`,
   `haulCount`/`barTick {voices 2, minGap .022, jitter .03, priority 0}`, `powerStep {voices 3, minGap .03}`,
   ducks: `bonusTrigger [.45,1.6]`, `bonusIntro [.5,2.2]`, `bonusEnd [.5,2.4]`, `goldenArrive [.45,2.4]`,
   `levelUp [.3,1.2]`, `haulMult`/`barApply [.25,.8]`, `bigWin* [.4,1.6]`, `maxWin [.7,3.5]`, `tierSlam [.35,1.2]`.
5. **Banks.** `bonusIntro`, `bonusEnd`, `retrigger`, `goldenArrive`, `bigWinStart`, `bigWinTier`, `bigWinEnd`,
   `maxWin` and `tierSlam` are in the extra bank (decoded right after `audio.ready`; a call before then is
   dropped). Everything else, including both loops, is in the core bank. `introSting` must wait for
   `audio.ready`.
6. Pitched SFX sit on F major pentatonic (= D minor pentatonic), the big-win stings on Bb, so they agree
   with every track.

## UI

| id | sound |
|---|---|
| `uiClick` | soft Bakelite button tick with a hint of brass |
| `uiToggle` | two-step brass toggle switch |
| `uiOpen` / `uiClose` | the ticket-window shutter rolls up (tiny bell ping) / rolls down with a soft clack |
| `betUp` / `betDown` | two marimba notes and a fare token clink, up / down |
| `spinPress` | the turnstile: lever thunk, ratchet, a little air |
| `buy` | tokens drop in the fare box, the register "ka-ching", a ticket punched |
| `error` | gentle muted-trumpet "wah-wah" over a soft tuba |
| `iris` | cartoon iris wipe: slide whistle up and down over a brush swish |
| `boostOn` / `boostOff` | Express Pass: knife switch, spark, power humming up / click and power winding down |
| `lowPowerClick` | lamp switch click and the bulb tinking |

## Reels

| id | index | sound |
|---|---|---|
| `reelDrop` | **0..5** (column) | soft wooden-metal clack, pitched per column |
| `reelStop` | | last column: heavier thunk with an iron rattle |
| `ticketLand` | **1..6** (Golden Tickets so far) | ticket punch "chk", register "ka-ching", a chime climbing the pentatonic; from 3: a brass "ta-DA", glockenspiel run and shimmer; from 5: a cymbal and a muted-trumpet shake |
| `coinLand` | **0..3** (metal) | 0 bronze: dull clink · 1 silver: bright double clink · 2 gold: rich clink with a chime · 3 platinum: bright clink, glockenspiel run and shimmer |
| `locoLand` | | heavy iron clunk, a puff of steam, short horn toot |
| `switchLand` | | iron clank, the lever rattling in its stand |
| `wildLand` | 3 takes (random) | the Live Wire: electric zap and crackle |

## Wins

| id | sound |
|---|---|
| `win` | small sting: clarinet scoop into a muted-trumpet/piano "doo-DAH" on F6, ride ting |
| `clusterTrace` | electric sweep along the winning cells: rising arc, crackles, faint glockenspiel (quiet, once per celebration) |
| `symPretzel` | salty crunch and a pop |
| `symCoffee` | a slurp and the cup clinking on its saucer |
| `symNewspaper` | rustle and a crisp flap |
| `symUmbrella` | catch click, whoosh, canopy snapping open with a little boing |
| `symPigeon` | soft "croo-ROO-coo" and a wing flutter |
| `symCat` | a sly "mee-ow" |
| `symBulldog` | gruff "WOOF-woof" |
| `symRat` | cheeky "squeak-squeak" |
| `symConductor` | jolly "HO-ho!" on a trombone blat |

Symbol accents are short and quiet (about -24 LUFS-M against `win` at -17): play once per winning symbol,
together with `win`.

## Trains

| id | index | sound |
|---|---|---|
| `whistle` | | Casey's two-tone brass guard's whistle: a short and a long blast |
| `trainDepart` | | brakes release, motor hums up, horn, wheels start clacking (2.4 s) |
| `trainRun` | **loop** (1.5 s) | clickety-clack over the third-rail hum, motor whine and low roar: `sound.loop('trainRun', on)` while a train runs |
| `trainExit` | | whoosh past and a Doppler horn fading off |
| `trainBrake` | | wheels slowing, brake squeal, final clunk, big steam hiss |
| `coinCollect` | **1..12** (coins picked up so far) | token clink + chime, one F major scale step higher per coin (C5 to G6) |
| `switchThrow` | | lever hauled over (ratchet, clank), electric snap, the signal lighting |
| `branch` | | quick whoosh and the points clacking over |
| `haulCount` | 3 takes | soft counting tick (called rapidly) |
| `haulMult` | | punchy brass "BWAP!" with timpani, kick, snare and crash for the multiplier |
| `barTick` | 3 takes | tiny counting tick for the Total Win Bar |
| `barApply` | | register "ka-ching" into a brass hit with snare and crash |

## Subway map (live board)

All in the core bank (`tools/audio-lab/src/sfx/map.ts`). Variant sounds wrap their `index` (modulo the
variant count), so you can pass a station or train number straight through; omit `index` for a random
take. `PARAMS` already sets voices/minGap/jitter/ducks for these.

| id | index | sound |
|---|---|---|
| `flapRattle` | **0..3** (4 takes) | a station's split-flap board flipping: light, crisp burst of cards clattering (~0.3 s, -26 LUFS-M). One per station during the flip wave: `sound.play('flapRattle', { index: station, delay, pan })`; stagger by >= 12 ms (`minGap`), up to 8 overlap |
| `flapSettle` | **0..2** (3 takes) | the last flap landing: wood-and-tin clack with a tiny rebound (~0.15 s). Play when that station's board stops |
| `trainStep` | **0..2** (3 takes) | a train moves one station: quick, quiet clickety-clack (~0.18 s, -27). Pass the step count as `index` to rotate takes |
| `signalSwitch` | | a Signal changes aspect: relay click, lamp humming up, then the points sliding over and locking with a clunk (~0.6 s; the clunk lands at 0.42 s) |
| `securityAlarm` | | Security Check: two-tone station klaxon (hi-lo, hi-lo) with a bell trill and a scanner sweep (~0.9 s); ducks music a little |
| `allClear` | | ALL CLEAR / Delay Repay x2: bright F-A-C chime climbing, a rubber stamp thump with a brass blip on the last note (stamp at 0.17 s) |
| `incident` | | INCIDENT / train held: low "denied" buzzer (two blasts), dull stamp at 0.21 s, heavy air-brake hiss |
| `crashRumble` | | two trains closing in: rising rush from both sides, motors screaming up, wheels hammering faster (0.6 s). Start it 0.6 s before the trains meet, then `crashImpact` |
| `crashImpact` | | the collision: heavy iron impact, crunching metal, glass shattering, deep boom with sub thump, bolts and debris bouncing down (~1.5 s, -12 LUFS-M); ducks music [0.55, 1.6 s] |
| `wreckScatter` | | coins and bolts flying out of the wreck, jingling and tumbling into a pile (~0.9 s; pile settles at ~0.6 s) |
| `crashMult` | | the x2 crash multiplier slamming onto the pile: iron-and-brass stamp, kick, snare, coins jumping (~0.5 s) |
| `routeTrace` | | a route win: light electric zip along the glowing line, a glint at the end (~0.45 s). Once per route |

Suggested order for a crash: `crashRumble` (t-0.6 s) -> `crashImpact` (t) -> `wreckScatter` (t+0.3..0.5 s)
-> `crashMult` when the x2 lands on the pile.

## Bonus

| id | index | sound |
|---|---|---|
| `anticipation` | **loop** (4.8 s) | endlessly rising tremolo strings over an approaching train (roar, hum, rail clacks); brightens and rises with `intensity()` |
| `anticipationStart` | | far-off whistle, rails singing, tremolo swell, a crackle |
| `anticipationEnd` | | soft down-whoosh, air brakes sighing, brush settle |
| `bonusTrigger` | | Golden Tickets punched chk-chk-chk, the register rings, brass fanfare with the train whistle |
| `bonusIntro` | | title card: snare roll and piano glissando into a big-band "ta-da", whistle motif on top (extra bank) |
| `bonusEnd` | | "shave and a haircut" (trad.) on piano, clarinet and muted trumpet, station bell, band "ta-da" (extra) |
| `retrigger` | | electric station bell, clarinet run, glockenspiel, whistle toot (extra) |
| `powerStep` | **1..12, cycling** | electric bell blip, one pentatonic step higher (F5 to G7); 13+ wraps to 1 |
| `levelUp` | | station bell, power surge whining up, brass hit |
| `goldenArrive` | | the Golden Locomotive: timpani roll, brakes, a majestic horn chord over brass and choir, golden shimmer (extra) |

## Big win (extra bank)

| id | index | sound |
|---|---|---|
| `bigWinStart` | | clarinet run into a full-band Bb stab, crash, timpani, whistle toot |
| `bigWinTier` | **0..3** | brass pickup into a band stab; top note climbs Bb, D, F, Bb; whistle from tier 2 |
| `bigWinEnd` | | F7 into Bb6/9 big-band "ta-da" with drum roll and whistle |
| `maxWin` | | drum roll and glissando, horn and whistle blasting, full band and choir on Bb, station bell, two hits |
| `tierSlam` | | unpitched title slam: iron coupling, doubled snare and crash, electric crack |

## Intro / splash

| id | sound |
|---|---|
| `introSting` | ALL ABOARD: station bell, whistle "woo-woo", stride-piano run into an open-fifth brass "ta-da" on F |
| `playSting` | turnstile clack, clarinet run, open-fifth brass "ta-da" |
| `carouselWhoosh` | soft card swoosh |
| `coachPop` | soft cork pop and a tiny ping |

## Music

| track | title | |
|---|---|---|
| `base` | The Midnight Local | hot swing in F, 144 bpm, 32 bars AABA (53.3 s) |
| `rush` | Rush Hour | hot jazz in Bb, 200 bpm, 32 bars (38.4 s), plus `tension` stem for `intensity()` |
| `last` | Last Train | D minor noir blues into F major golden swing, 120 bpm shuffle, 24 bars (48 s) |
| `bigwin` | Full Steam Shout | big-band shout chorus, 12-bar Bb blues, 180 bpm (16 s) |
| `surge` | Power Surge | tense electric bed on a D pedal, 150 bpm, 8 bars (12.8 s) |

Removed from the build (Powder Keg Cove only): `symbolFall`, `cascade`, `pop`, `sixLand`, `sixIgnite`, `fsLand`,
`wheel*`, `howl`, `cash*`, `coin`, `multAdd`, `multMul`, `explode`, `blastDebris`, `meterFlame`, `meterFull`,
`hounds`, `inferno`, `boost`, `bomb*`, `endRumble`, `cap*`, `parrot*`, `sealStamp`, the old `sym*` and the
`wheelSpin`/`bombFuseLoop`/`bombHotLoop` loops; tracks `tantrum`, `witching`, `limbo`.
