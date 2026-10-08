# Third Rail Riches: art bible

A new game on the Powder Keg Cove engine (Pixi 8 + GSAP, every illustration authored as SVG strings
in `src/art/*.ts` and rasterised at display size). **The mechanics are new** (docs/MATH.md): 6 reels
x 4 rows, ways pays, Locomotives that drive along their row collecting Fare Coins, Junctions that
branch trains into neighbouring rows, sticky coins and a POWER meter in the free spins. The quality
bar is Powder Keg Cove or better, in every asset.

## Premise

Midnight on the **Third Rail Line**, a 1930s cartoon subway. The reels are the station's **track
board**: each of the 4 rows is a track, and each Locomotive that lands on reel 1 pulls out of the
station and runs its row left to right, picking up the passengers' Fare Coins. **Conductor Casey**
(left) dispatches trains with his signal lantern and whistle; **Rivets** the subway rat (right)
cheers from a stack of luggage. Electricity crackles along the third rail.

Tagline under the logo: **ALL ABOARD!**

## Look

1930s rubber-hose cartoon (Fleischer / early Disney, the Cuphead lineage), the same ink + cel
technique as Powder Keg Cove (`src/art/kit.ts`: `composeSymbol`, `celForm`, `celTones`, `cord`,
`shine`, `pieEye`, `brow`): warm ink outlines weighted on the lower right, flat fills, cel shade on
the lower-right rim, soft highlight upper left, a baked drop shadow, optional gouache texture.
Characters have pie eyes, white gloves, rubber-hose limbs. Everything bold, round and readable at
90 px.

Setting: an **art-deco subway station at night**. Cream glazed tile walls with an emerald trim band
and mosaic border, green cast-iron columns with rivets and flared capitals, brass fittings, amber
pendant globe lamps, a big round station clock, enamel signs (shapes only, no text), dark tunnel
mouths with red/green signal lights, the track pit with rails, sleepers and the **third rail glowing
electric blue**.

Two light sources: **warm amber lamplight** (pools of light, upper left) and **cool electric blue**
(the third rail and sparks, lower right rim light). Saturated but never neon, except electricity.

## Palette (`C` in `src/art/kit.ts`; use the tokens, never ad hoc hexes)

Shared from the engine: ink / paper / white, wood, gold (`goldLight/gold/goldDeep`), steel,
bronze / silver, crimson, skin, fire (for headlamps and lamp flames).

Added for this game: `tile*` (station tile), `emerald*` (trim, columns), `maroon*` + `cream`
(train livery), `iron*` + `tunnel` (cast iron, tunnel dark), `volt*` (electricity: `voltCore`
white-hot, `voltLight`, `volt`, `voltDeep`, `voltNight`), `amber*` (lamplight), `uniform*`
(Casey's navy), `rat*` + `ratPink` (Rivets), and one hue family per symbol (below).

## Symbols (ids are `Sym` in `src/math/types.ts`)

| Id | Symbol | Hue | Notes |
|---|---|---|---|
| 0 L1 | **Pretzel** (salted, twisted) | `pretzel*` | warm brown, white salt flecks |
| 1 L2 | **Coffee cup** (diner mug, steam curl) | `coffeeRed` + cream | red band, saucer |
| 2 L3 | **Newspaper** (folded, headline bars, no letters) | paper + `uniform` ink | |
| 3 L4 | **Umbrella** (closed with hook handle, or half-open) | `umbrella*` | |
| 4 H4 | **Pigeon** (head, iridescent neck) | `pigeon*`, `pigeonNeck` | |
| 5 H3 | **Alley Cat** (orange tabby head, bent ear, bandage) | `cat*` | |
| 6 H2 | **Officer Bulldog** (head, police cap with badge) | `cop*` cap, `dog*` face | |
| 7 H1 | **Rivets the rat** (head, red newsboy cap) | `rat*`, crimson cap | the sidekick |
| 8 TOP | **Conductor Casey** (head, walrus moustache, conductor cap) | `uniform*`, gold badge | the hero |
| 9 WILD | **Live Wire**: a brass hex plate with a crackling `volt` lightning bolt, small arcs | brass + `volt*` | lit / win = arcs flare white-hot |
| 10 FS | **Golden Ticket**: gold ticket, scalloped edge, punched star | gold | win = it flips and shines |
| 11 COIN | **Fare Coin**: a subway token in 4 metals by value: bronze (< 1x), silver (1-5x), gold (10-50x), platinum with a gem (100x+) | metal | the game prints the value on the coin's face: keep the centre plain |
| 12 LOCO | **Locomotive** (front 3/4 view of a 1930s streamliner nose, maroon + cream, brass grille, big headlamp, cowcatcher) | `maroon*` | states: idle, lit (headlamp blazing); **Golden Locomotive** variant (Last Train) all gold |
| 13 SWITCH | **Junction**: a track-switch stand: lever + round target disc with a double up/down arrow | iron + emerald / crimson | states: idle (red), thrown (green, glowing) |

The **train** that runs along a row is a side-view sprite: locomotive (side) + passenger car(s);
branch trains use the same art. A Golden Locomotive side view exists for Last Train.

## Mechanic names (code -> theme)

| Code | Theme | UI label |
|---|---|---|
| ways win | way win | |
| LOCO / Train | Locomotive / train | |
| SWITCH | Junction | |
| COIN | Fare Coin | |
| power, POWER_STEPS | POWER meter, passengers | `POWER` |
| level / multiplier | x1 Local, x2 Express, x3 Limited, x5 Bullet, x10 Lightning | |
| WITCHING / `rush` | **Rush Hour** free spins (buy 100x) | |
| INFERNO / `last` | **Last Train** (buy 400x) | |
| BOOST | **Express Pass** (1.5x, a Locomotive every spin) | |
| big win tiers | BIG HAUL / MEGA HAUL / EPIC HAUL / FULL STEAM | |

## Type

- Numbers, win amounts, coin values (`numStyle`, bitmap text): Rye.
- Logo and banners: the lettering engine (`src/art/lettering.ts`), deco treatment.
- UI: Inter.

## Technical rules

- SVG strings authored in `src/art/*.ts`, rasterised at display size (`svgTexture`). 256x256
  viewBox for symbols unless stated. **No text inside art** (localised text and numbers are
  rendered by the game). No external images or fonts.
- Use `C` tokens. Reuse kit helpers. Keep each illustration readable as a silhouette at 90 px.
- Review at 2x with `npx tsx tools/art/sheet.ts <group> 2` (writes `tools/art/out/<group>.png`;
  look at it with the Read tool) before calling anything done.

## Ownership (parallel tracks)

| Track | Files |
|---|---|
| Symbols: lows + critters | `src/art/lows.ts`, `src/art/critters.ts`, `tools/art/groups/lows.ts`, `tools/art/groups/critters.ts` |
| Specials + train | `src/art/specials.ts`, `src/art/train.ts`, `src/art/fx.ts`, `tools/art/groups/specials.ts` |
| Conductor Casey | `src/art/conductor.ts`, `src/art/uniform.ts`, `src/render/characters/Conductor.ts` |
| Rivets the rat | `src/art/rat.ts`, `src/render/characters/Rat.ts` |
| Station scene + reel frame | `src/art/scene.ts`, `src/art/station.ts`, `src/render/scene/Background.ts`, `src/render/grid/Reels.ts` |
| Logo | `src/art/lettering.ts`, `src/render/Logo.ts`, `public/boot/*`, the boot screen in `index.html` |
| Presentation (lead) | everything else |
