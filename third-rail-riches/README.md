# Third Rail Riches

An original 1930s cartoon subway slot by Psycho Games, built for **Stake Engine** (static math books +
RGS) on the Powder Keg Cove engine. **Demo credits only** outside Stake: the demo plays from bundled
books with no deposit, withdrawal or cash value.

The engine (Pixi scene, HUD, RGS client, Stake math pipeline, QA tools) is shared with Powder Keg
Cove; the **mechanics, math, RTP, art, music and copy are all new**. Art bible: `docs/ART.md`. Math:
`docs/MATH.md`. Audio: `docs/AUDIO.md`, `docs/SOUNDS.md`.

## The game

The board is a **live subway map**: four lines (Crimson I, Cobalt II, Emerald III, Gilded IV), 19
stations, each a split-flap departure board that flips to a new symbol every spin.

- **Route wins**: 3 or more consecutive stations along a line showing the same symbol (Live Wires
  substitute) pay; interchanges count for both lines.
- **Locomotives** land on terminals (line ends). After the route wins, Conductor Casey checks his
  watch and blows the whistle, and every train runs its line one station a beat, collecting every
  **Fare Coin** it reaches (bronze / silver / gold / platinum, 0.2x to 1,000x).
- **Signals** land on interchanges: a train reaching one is **redirected** onto the crossing line.
- **Security Checks** land on stops: the train is stopped and searched. **ALL CLEAR**: it waits a
  beat and its haul pays x2 (Delay Repay). **INCIDENT**: the train is held and **misses** the rest of
  its route.
- **Crashes**: two trains entering the same station together, meeting head-on, or one running into a
  train held at a check **crash**. The wreck sweeps every Fare Coin at and around the crash into one
  pile, which pays x2 together with both trains' hauls.
- **Rush Hour** free spins: 3/4/5/6 Golden Tickets give 8/10/12/15 spins. Fare Coins are sticky until
  a train collects them; every collected coin is a passenger on the **POWER** meter: at 5 / 12 / 22 /
  35 passengers the train multiplier steps x2 / x3 / x5 / x10 with +3 spins each. 3+ tickets retrigger
  +5.
- **Buys**: Rush Hour 100x; **Last Train** 400x (10 spins, train multiplier x2 from the start and a
  **Golden Locomotive** held on one terminal that departs every spin).
- **Express Pass** (1.5x bet): a Locomotive on every spin.
- **RTP 96.30%** in every mode (exact in the published weights), **max win 10,000x**.
- Cast: **Conductor Casey** (left, lantern, pocket watch and whistle) and **Rivets** the subway rat
  (right, on a stack of suitcases).
- Code keeps the engine's mode names: `WITCHING` = Rush Hour, `INFERNO` = Last Train, `BOOST` =
  Express Pass.
- Portrait screens show the map transposed (the lines run top to bottom).

## Stack

Vite + TypeScript, **PixiJS 8**, **GSAP 3**, DOM HUD. All art is original SVG authored in code and
rasterised at the device-pixel size at runtime. Music and SFX are composed in Tone.js and rendered
offline to MP3 (`tools/audio-lab`).

```
src/math      network topology, engine, model, paytable, RNG (unit tested)
src/art       every illustration as SVG (map panel, trains, symbols, specials, characters, station, logo)
src/render    Pixi views: map (MapView, TrainRunner), POWER meter, win bar, characters, overlays
src/game      Scene, Presenter (choreography), Controller (flow, wallet, autoplay)
src/stake     RGS client, demo RGS, book format, dev scenarios
src/ui        HUD, menus, rules / symbol wins
tools/sim     Monte Carlo simulator;   tools/stake  Stake book generator + verifier
tools/art     art review sheets;       tools/brand  Stake tile + loading-screen assets
```

## Run

```bash
npm install
npm run dev                      # http://localhost:5318   (?debug for QA hooks)
npm run build && npm run preview
```

`?debug` (demo only) exposes `window.__ll`: `ctrl.devScenario(name)` plays an engine-built round
(`train`, `redirect`, `security`, `missed`, `crash`, `junction`, `multi`, `ways`, `tease`, `bonus`,
`rushBig`, `lastTrain`, `express`, `maxWin`), `forceBook(id)` plays a demo book next.

## Math

```bash
npx vitest run                                         # rules, routing, books, i18n
npx tsx tools/sim/cli.ts --kind all --rounds 2e6       # natural RTP per mode
npx tsx tools/stake/generate.ts --out stake-math/publish --base 400000 --boost 400000 --witching 60000 --inferno 60000 --seed 1
npx tsx tools/stake/verify.ts --dir stake-math/publish --stats src/stake/stats.json
npx tsx tools/stake/scenarios.ts && npx tsx tools/stake/demo.ts   # QA picks + public/demo-books
```

## Brand

`npx tsx tools/brand/tile.ts` (and `TILE=wide`) writes the Stake tile BG/FG to `tools/brand/out`.
