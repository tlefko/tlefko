# Third Rail Riches

An original 1930s cartoon subway slot by Psycho Games, built for **Stake Engine** (static math books +
RGS) on the Powder Keg Cove engine. **Demo credits only** outside Stake: the demo plays from bundled
books with no deposit, withdrawal or cash value.

The engine (Pixi scene, HUD, RGS client, Stake math pipeline, QA tools) is shared with Powder Keg
Cove; the **mechanics, math, RTP, art, music and copy are all new**. Art bible: `docs/ART.md`. Math:
`docs/MATH.md`. Audio: `docs/AUDIO.md`, `docs/SOUNDS.md`.

## The game

- **6 reels x 4 rows, 4,096 ways**: matching symbols on 3+ adjacent reels from the left win in any
  row position. The **Live Wire** (wild) lands on reels 2-6.
- **Locomotives** land on reel 1. After the way wins, Conductor Casey blows his whistle and every
  Locomotive pulls out along its row, collecting the cash value of every **Fare Coin** it reaches
  (bronze / silver / gold / platinum, 0.2x to 1,000x).
- **Junctions** (reels 2-5) branch a passing train into the rows above and below; branches can
  branch again. Every cell is run once, so every coin is collected once.
- **Rush Hour** free spins: 3/4/5/6 Golden Tickets give 8/10/12/15 spins. Fare Coins are **sticky**
  until a train collects them; every collected coin is a passenger on the **POWER** meter, and at
  5 / 12 / 22 / 35 passengers the train multiplier steps x2 / x3 / x5 / x10 with +3 spins each.
  3+ tickets retrigger +5.
- **Buys**: Rush Hour 100x; **Last Train** 400x (10 spins, train multiplier x2 from the start and a
  **Golden Locomotive** held on reel 1 that runs its row every spin).
- **Express Pass** (1.5x bet): a Locomotive on every spin.
- **RTP 96.30%** in every mode (exact in the published weights), **max win 10,000x**. Stake 2-Star
  and 3-Star dashboards: 0 failing classes.
- Cast: **Conductor Casey** (left, signal lantern and whistle) and **Rivets** the subway rat (right,
  on a stack of suitcases).
- Code keeps the engine's mode names: `WITCHING` = Rush Hour, `INFERNO` = Last Train, `BOOST` =
  Express Pass.

## Stack

Vite + TypeScript, **PixiJS 8**, **GSAP 3**, DOM HUD. All art is original SVG authored in code and
rasterised at the device-pixel size at runtime. Music and SFX are composed in Tone.js and rendered
offline to MP3 (`tools/audio-lab`).

```
src/math      engine, model, paytable, RNG (unit tested)
src/art       every illustration as SVG (symbols, specials, train, characters, station, logo)
src/render    Pixi views: board, trains, POWER meter, win bar, characters, overlays
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
(`train`, `junction`, `multi`, `ways`, `tease`, `bonus`, `rushBig`, `lastTrain`, `express`,
`maxWin`), `forceBook(id)` plays a demo book next.

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
