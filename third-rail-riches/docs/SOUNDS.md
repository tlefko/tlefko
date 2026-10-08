# New sounds: Kaboom Bomb, Cap'n Kaboom, Powder Boost, symbol wins, splash

Every id below is in `public/audio` and `src/audio/manifest.ts` now. All existing ids are unchanged.
Sources live in `tools/audio-lab/src/sfx/`: `bomb.ts`, `crew.ts`, `symbols.ts`, `splash.ts`, plus additions to
`wheel.ts`, `events.ts` and `ui.ts`. Descriptions are in `tools/audio-lab/sounds.json` and can be auditioned on
`/tools/audio-lab/`.

Play them through the game adapter: `sound.play(id, { index, volume, rate, pan, delay })` (`src/game/sound.ts`
takes any string, so no type changes are needed to call one-shots). Only Presenter, Controller, main and
panels import `sound` today. A render class either imports it, or raises a hook that one of those callers
already listens to (GridView's `DropHooks`/`BlastHooks`, `Wheel.onTick`, the `onTier`/`onTick` hooks on
`BigWin.run`, `SplashOptions.sfx`).

Line numbers are approximate (from 2026-09-29): these files are being edited, so go by the function names.

## Read this first (runtime limits, `src/audio/index.ts` was not changed)

1. **The two loops don't loop yet.** `bombFuseLoop` and `bombHotLoop` are rendered as seamless loops with loop
   points in the manifest. But `audio.loop()` only knows `'anticipation' | 'wheelSpin'`: see the `LoopName`
   type and the `loopWanted` object in `src/audio/index.ts`, plus the `loop()` signature in `src/game/sound.ts`.
   The owner of those files has to add both names (one line each in `LoopName` and `loopWanted`, and widen
   `sound.loop`'s type). Until then, `sound.play('bombFuseLoop')` plays a single pass (about 3 s), not a loop.
   Once supported, call `sound.loop('bombFuseLoop', on)` like `wheelSpin`.
2. **Indexed ids need an in-range index.** The runtime only clamps "stepped" indices for the older names
   (`STEPPED` in index.ts). For `bombGrow`, `bombBlast` and `capChargePip`, an out-of-range index wraps around:
   `bombBlast` index 6 would play the smallest blast. Always clamp:
   - `bombGrow`, `bombBlast`: `index: Math.min(5, Math.max(1, size))`
   - `capChargePip`: `Math.min(3, Math.max(1, pip))`

   With no index, a random variant plays.
3. **Variation ids:** `bombChain` (3), `capPegTap` (3) and `parrotFlap` (2). Call them without an index and you
   get a random take, never the same one twice in a row.
4. **Banks.** `tierSlam` is in the extra bank, like the other big-win stings. That bank is decoded right after
   `audio.ready`, and a call made before then is silently dropped. Everything else is in the core bank.
5. **`introSting` must wait for `audio.ready`.** The core bank has to be decoded first, otherwise the call is
   dropped. `audio.ready` exists on the audio module but `sound.ts` doesn't expose it yet (add
   `ready: () => api?.ready`). Playing it in the `.then` that runs after unlock (main.ts, around line 240) is
   right, as long as that chain waits for `ready`.
6. **Auto-duck.** New ids have no auto-duck (`PARAMS` in index.ts only lists the old names). For the huge ones,
   duck from the caller if the music feels in the way:
   - `bombBlast` 4-5, `tierSlam`: `sound.duck(0.35, 1.2)`
   - `endRumble`: `sound.duck(0.25, 2)`
   - `wheelBombReveal`: `sound.duck(0.3, 1.5)`

## Kaboom Bomb

| id | what it is | when it plays | who should call it |
|---|---|---|---|
| `bombLand` | cast-iron thunk on the deck, one bounce, a short roll, its fuse spitting (0.7 s) | a bomb lands on the reels, on the first drop or after the Captain's throw | `Presenter.landed` (bomb branch, ~319, replacing the `wildLand` there) and `Presenter.fly` onLand (~414, replacing `wildLand`). Both are fired by `GridView.spinIn` onSpecial / `GridView.throwBomb` onLand. |
| `bombFuseLoop` | loop (3.0 s): the fuse hissing and spitting sparks, with a little sputter each pass | while any bomb on the board has a lit fuse (fuse > 0) | on at `bombLand`, off when the last bomb blows (`GridView.blastOne` releases it, ~511). The visual owners are `SymbolView.bombLoop` / `GridView.update`. **Needs the loop support in note 1.** |
| `bombTick` | clockwork tock, a spark and a low marimba "dunk" (0.26 s) | a bomb's fuse counter drops by one (3 to 2 to 1 to 0) | `GridView.tickFuses`, inside the per-bomb `.then` (~762-766) where `v.tickFuse(b.fuse)` runs. Only for bombs whose fuse actually dropped. Bombs are staggered 0.05 s apart, so each gets its own tick. |
| `bombHotLoop` | loop (3.2 s): red-hot frying sizzle that breathes, iron ticks, a low shiver | from the moment a bomb goes red-hot (fuse reaches 0) until it detonates | start in `SymbolView.tickFuse`'s `if (hot)` branch (~683-698; in Presenter: `step.bombs.some(b => b.fuse <= 0)`), stop at detonation. **Needs the loop support in note 1.** |
| `bombGrow` [1-5] | inflating whistle and squeezebox swell into a springy "pop" plus a glock ping, pitched up each step (1.1 s) | a bomb grows after a keg blast; index = the new size | `Presenter.spin` onBoom, keg branch (~263-266): 0.08 s after each keg boom, per bomb, with `index: to` (new size 2-5). `GridView.growBomb` returns early when there's nothing to grow (~746), so play after that check. This replaces the `boost {index:1}` stand-in (~272). |
| `bombBlast` [1-5] | the bomb detonates: bigger than a keg, cannon crack and boom, a low-end whump, wooden debris, iron shrapnel. It grows with size: 1 is 0.9 s; 5 (the 5x5) is a double detonation with debris raining down (3.1 s). | a bomb blows; index = `ex.bomb.size` | `Presenter.bombBoom` (top, ~351-353), replacing the `explode {n+2}` + `inferno` stand-ins (keep `blastDebris` if you like). Called from onBoom, which `GridView.blastOne` fires right after `blast.bomb(...)`. Use `index: Math.min(5, ex.bomb.size)`. |
| `bombChain` [3 takes] | a chained bomb: a spit of fuse and a punchy blast (1.0 s) | a bomb set off by another blast (`ex.bomb.cause === 'chain'`) | `Presenter.spin` onBoom, bomb branch (~254), instead of `bombBlast` for chained bombs (or layered at `volume: 0.7` for big ones). GridView fires them 0.06 s after the parent's boom. For bomb-parents only: `step.explosions.find(p => p.chain.includes(ex.id))?.bomb`. |
| `endRumble` | the deck starts to shake: a rumble, deck rattles and a timpani roll building for 2 s, faded out clean (2.3 s) | the finale step, just before every remaining bomb blows (`cause: 'end'`) | `Presenter.spin` before `grid.blasts(...)` (~248-251), guarded by `step.finale` (Presenter doesn't read it yet). It pairs with the existing camera `Presenter.rumble()`. Wait ~1.8 s (or `await` the rumble) before the blasts. |

## Cap'n Kaboom

| id | what it is | when it plays | who should call it |
|---|---|---|---|
| `capBelt` | leather creak, buckle jingle, iron slapped into his palm (0.5 s) | the Captain draws a bomb from his belt | `Captain.drawBomb` (~629-642), as the hand reaches the hip. It's reached from `setCharge` (first charge), `throwBomb` (wheel bomb, empty hand) and `release` (leftover charge). |
| `capChargePip` [1-3] | a lamp flares: a little flame and a glassy ping, rising D, F#, A (0.9 s) | one charge lamp lights; index = the pip that lit | `Captain.refreshPips` lit-and-animated branch (~694-697), or `Captain.setCharge`'s `v > was` block (~614-625). Charge can jump by more than 1, so play one per new pip (`was + 1 .. v`), staggered ~0.08 s. In Powder Boost the max is 2. |
| `capChargeFull` | a fizzing surge into a bright two-note "rea-DY!" on brass and concertina (1.6 s) | the charge is full; he's about to throw | `Captain.setCharge`, `if (v >= m)` (~618-623): the big burst and gritted-teeth face (Presenter's "full" moment is ~262). |
| `capWindup` | arm whooshes speeding up over a creaking stretch and a rising whistle (1.2 s) | the throw wind-up | `Presenter.windUp` (~380-389), replacing the `spinPress` stand-in (~385), just before `cap.throwBomb()`. The visual lean-back is in `Captain.throwBomb` (~739-742). |
| `capThrow` | a grunted "hup!", a big whoosh, the fuse fizzing away to the right (0.8 s) | the bomb leaves his hand | `Captain.release` (~753-791) at the release burst, or `Presenter.fly` (~412), replacing the `multMul` stand-in. |
| `capPegTap` [3 takes] | his peg leg taps the deck (0.2 s, quiet) | idle peg taps | `Captain.pegTap` (~864-870, from `idleLife`), once per tap: the peg meets the deck at about 0.20 s and 0.40 s. |

## Sparks the parrot

| id | what it is | when it plays | who should call it |
|---|---|---|---|
| `parrotSquawk` | a sharp, higher "AWK-awk!" with a flap (1.0 s). Deliberately different from `howl`, the long "rraawk!" with a whistle that stays on KEG DROP. | the parrot's squawk reactions | `Parrot.accent('squawk')` (~305-315) and `Parrot.react('squawk')` (~276-280). Its callers include `Parrot.follow` (a thrown bomb lands), `Wheel.appear` / `Wheel.celebrateLanding` (a bomb segment), odd tiers in `BigWin.slam`, and the splash reactions. Don't double it with `howl` on KEG DROP (`Presenter.wheel` ~535-536). |
| `parrotFlap` [2 takes] | 3-4 feathery wing flaps (0.4 s, quiet) | wing flaps | `Parrot.accent('flap')` (~316-318; nothing calls it yet), the idle ruffle (~369), `accent('hop')` (~304). Not per wing-beat frame. |

## Captain's Wheel

| id | what it is | when it plays | who should call it |
|---|---|---|---|
| `wheelPullback` | the helm hauled back: slowing brass ratchet clicks and a timber strain (0.6 s) | the pull-back before the spin | `Wheel.spin` (~315), on the `if (back)` tween. Skip it under reduced motion (back = 0). The `wheelSpin` loop starts at the same moment (Presenter ~491). |
| `wheelLandClunk` | a heavy wooden clunk with an iron latch, no bell (0.6 s) | the pointer drops into the winning notch | `Wheel.celebrateLanding` (~335-351), or `Presenter.wheel` next to `wheelLand` (~495). Layer it under `wheelLand`, which brings the bell. |
| `wheelIconLift` | a rising glockenspiel/celesta chime with a soft swoosh (1.4 s) | the landed icon pops out and flies to the centre | `Wheel.celebrateLanding` (~378-399), at the pop to 1.25x (~387). |
| `wheelBombReveal` | snare roll into a low "dun-DUN!" (D then E-flat) on brass, tuba and timpani, then a fuse catching (1.9 s) | a bomb outcome is revealed | `Presenter.wheel` at `await w.reveal(...)` (~499) when `o.kind === 'bomb'`, before the bomb branch (~524-530) throws it. |

## Big moments

| id | what it is | when it plays | who should call it |
|---|---|---|---|
| `tierSlam` | big-win tier title slams in: cannon crack, a wooden slam, doubled snare and crash, soft-clipped for punch. Unpitched, so it sits on the fanfare (1.9 s, extra bank). | each big-win tier title impact | `BigWin.slam`, the impact callback (~300-313, at `impact()`). `hooks.onTier` only fires from the second tier, so the first slam (~208) needs a direct call or a new hook. Layer it with `bigWinTier` / `bigWinStart`. |
| `sealStamp` | a padded thud, a wet wax splat and a tiny sizzle (0.6 s) | the plunder-multiplier wax seal is stamped | `TantrumMeter.setMult` (~221), at the stamp hit (~242-259, `T(0.17)`). It runs only when the multiplier grows, and follows the `boost` calls in Presenter (~374, ~521). |
| `clusterTrace` | a soft pentatonic glockenspiel shimmer (1.15 s, quiet) | a winning cluster's outline is traced | `GridView.celebrate` (~307), when the trace starts (~323). Once per celebration, not once per cluster (they trace in parallel). It sits under `win` (Presenter ~221). |

`endRumble` is in the bomb table above.

## Symbol wins

Short and quiet (-24/-25 LUFS-M against `win` at -17 to -14). Play them together with `win` (Presenter ~221) or
from `GridView.celebrate` (~317), **once per winning cluster**, using `cl.sym`, never once per cell. Pitched
parts stay on D minor pentatonic, like the `win` flourish.

| id | sym | what it is | who should call it |
|---|---|---|---|
| `symAnchor` | 0 anchor | a slow swinging chain creak and a soft iron clink (0.7 s) | `GridView.celebrate` / Presenter ~221, by `cl.sym` |
| `symShell` | 1 scallop shell | a clam snaps shut and a pearl twinkles (0.7 s) | same |
| `symMap` | 2 treasure map | a crinkle of paper and a small ding (0.8 s) | same |
| `symCompass` | 3 compass | the needle whirrs and settles with a tick (0.6 s) | same |
| `symCrab` | 4 crab | a quick claw snip-snap (0.2 s) | same |
| `symOcto` | 5 octopus | a wet squelch and a bubble (0.3 s) | same |
| `symShark` | 6 shark | a snapping chomp (0.2 s) | same |
| `symParrot` | 7 Sparks | a tiny squawk and a flap (0.4 s) | same |

A lookup for the caller:
`const SYM_SFX = ['symAnchor', 'symShell', 'symMap', 'symCompass', 'symCrab', 'symOcto', 'symShark', 'symParrot'];`
(no accent for 8 Captain, 9 keg, 10 chest or 11 bomb).

## UI and splash

| id | what it is | when it plays | who should call it |
|---|---|---|---|
| `boostOn` | brass switch click and a fuse fizzing up (0.6 s) | Powder Boost switched on by the player | the Boost switch handler: `Hud.ts` click (~122-125) calls back into main.ts (~109-113), where `'uiToggle'` plays today. Use `ctrl.boost ? 'boostOn' : 'boostOff'`. Not in `Hud.setBoost` (~410), which also runs at start-up and in replay. |
| `boostOff` | a click and the fuse fizzling out with a puff (0.5 s) | Powder Boost switched off | same place as `boostOn` |
| `lowPowerClick` | lantern shutter click: metal click and a glass tink (0.2 s) | the low-power / quality lantern option is toggled | `openMenu` in `src/ui/panels.ts` (lantern row ~198, click handler ~213-219), replacing the `'uiToggle'` at ~216. It's not in Hud.ts. |
| `playSting` | wooden button thock, an accordion run up and an open-fifth brass "ta-da" (1.7 s) | PLAY pressed on the intro splash | main.ts, the post-tap `.then` (~238-247), replacing `'sixIgnite' {volume:.8}` (~245). The visual press is `IntroSplash.close` (~2629). |
| `carouselWhoosh` | a soft card swoosh (0.4 s, quiet) | the splash carousel slides | `IntroSplash.slideTo` (~2188-2197), at the `carTween`, via `this.o.sfx?.('carouselWhoosh')` (~2268). It covers arrows, dots, swipe, auto-advance and keys. It's silent until audio unlocks. |
| `coachPop` | a soft cork pop and a tiny ping (0.4 s) | each coach-mark note pops up | `CoachMarks.show` in `IntroSplash.ts` (~2871-2886) has no sound hook. Play from main.ts (~296) with `delay: 0.15 + i * 0.35` per note. |
| `introSting` | ship's bell ding-ding, a concertina run into an open-fifth brass "ta-da" and a distant cannon with a cliff echo (2.8 s). Open fifths on D, so it sits on the base music as it fades in. | once, right after audio unlocks | main.ts, the `.then` after `sound.unlock()` (~238-246), after `ready` (see note 5). To also cover the early mouse unlock (`onArm`, ~180), guard with a played-once flag. The splash entrance (main ~216) runs before any gesture, so a sound there would never play. |
