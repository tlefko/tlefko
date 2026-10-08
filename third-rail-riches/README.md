# Powder Keg Cove

An original cluster-pays slot by Psycho Games, built for **Stake Engine** (static math books + RGS).
**Demo credits only** outside Stake: the demo plays from bundled books with no deposit, withdrawal
or cash value.

It runs on the same engine and math as Lucifer's Lullaby (mechanics, paytable, RTP and max win are
identical); everything the player sees and hears is new. The art bible is `docs/ART.md`.

Demo: https://powder-keg-cove.vercel.app (Vercel project `powder-keg-cove`, scope `tlefkos-projects`).
It is a separate project from Lucifer's Lullaby (`lucifers-lullaby`), so deploying one never touches
the other.

## The game

- 6 reels x 5 rows, cascading **cluster pays** (5+ matching symbols connected up/down/left/right).
- **Powder Kegs** (wild) land cold. A keg in a winning cluster lights its fuse, stays as a x2 wild for
  the next cascade, then explodes and clears its 3x3 area. Blasts light cold kegs and set off lit ones.
- **The Powder Fuse**: +1 spark per winning cluster, +2 per explosion. A fully lit fuse (10) spins the
  **Captain's Wheel**: a keg drop, a broadside row of kegs, grog (+ to the plunder multiplier) or
  doubloons.
- **Moonlight Raid** free spins: 3/4/5+ treasure chests give 8/10/12 spins, 3+ during the bonus give +5.
  The fuse and the plunder multiplier carry over between free spins.
- **Buys**: Moonlight Raid 100x; Blackpowder Raid 500x (10 spins, plunder x5, fuse at 5).
- Max win 50,000x in every mode. RTP target 96.20% for every mode; see `docs/MATH.md` for the
  verified numbers and the Stake book files.
- Cast: **Cap'n Kaboom** (left, lit linstock, peg leg) and **Sparks** the parrot (right, on a barrel).
- Code keeps the engine's internal names (BRIM, TANTRUM, hounds, inferno, witching); the table in
  `docs/ART.md` maps them to the theme names.

## Stake Engine

- `src/stake`: URL params, RGS client (authenticate / play / end-round / event / replay), a demo RGS
  over `public/demo-books`, currency formatting, book <-> round conversion.
- Replay mode (`?replay=true&game=...&event=...`), social-casino wording, jurisdiction flags
  (disabled buy / autoplay / turbo / spacebar, session timer, net position) are all handled in
  `src/game/Controller.ts` and `src/ui`.
- 16 languages (`src/i18n`, English source in `en.ts`).
- Brand assets: `tools/brand/tile.ts` writes the game tile BG/FG (3:4, `TILE=wide` for 16:9,
  `TILE=focus` for a single-subject FG) to `../_brand/powder-keg-cove`, with Stake-ready copies in
  `stake/`; `tools/brand/boot.mjs` regenerates the loading screen assets in `public/boot` from the
  running game; the provider logo comes from `tools/brand/logo.mjs`.

## Stack

Vite + TypeScript, **PixiJS 8** (WebGL scene), **GSAP 3** (every motion), DOM HUD and menus. All art is
original SVG, rasterised at the exact device-pixel size at runtime (`src/art`, `src/render/textures.ts`).
Music and SFX are composed in Tone.js and rendered offline to MP3 (`tools/audio-lab`); the game ships a
small Web Audio player.

```
src/math      engine, model, paytable, RNG (the rules; unit tested)
src/art       every illustration as SVG: symbols (sea, critters, captain, keg), rigs (crew),
              scene, props, fx; shared ink + cel kit (kit.ts) and geometry helpers (geo.ts)
src/render    Pixi views: grid, wheel, win bar, fuse meter, characters, overlays, film grain
src/game      Scene, Presenter (choreography), Controller (flow, wallet, autoplay)
src/ui        HUD, menus, rules/paytable
src/audio     runtime audio player (assets in public/audio)
tools/art     art review sheets: npx tsx tools/art/sheet.ts <symbols|sea|critters|crew|rig|...> 2
tools/qa      QA gates (below);  tools/sim  RTP simulator + tuner
```

## Run

```bash
npm install
npm run dev          # http://localhost:5318   (add ?debug for QA hooks)
npm run build && npm run preview   # production build on :5319
```

`?debug` (demo mode only) exposes `window.__ll` (`forceBook(id)` plays that demo book next, `ctrl`, `scene`, `rgs`).

## QA (run against the production preview, `npm run preview`)

| Gate | Command | Checks |
|---|---|---|
| Types + unit tests | `npm run typecheck && npm test` | math tests (clusters, blasts, wheel, cap, record/fast parity) |
| Stake math | `npx tsx tools/stake/verify.ts --dir stake-math/publish` | index/books/CSV schema, RTP per mode, hit rate, std dev, max-win odds, tail checks (see `docs/MATH.md`) |
| Soak | `node tools/qa/soak.mjs http://127.0.0.1:5319/?debug super [chrome\|webkit]` | 22 real rounds through the UI against the demo RGS: random books plus scenario books (chain blasts, all 4 wheel outcomes, bonus, 50,000x max win), both buys, min/max bet. Balance = before - cost + win in game, RGS and HUD; no stuck rounds; zero page errors and zero console output |
| Layout | `node tools/qa/layout.mjs [url] [--selftest]` | 12 viewports 360 to 2560 plus Stake's mini-player (480x270, 400x300): no overflow, HUD collisions or clipped text, text >= 12.5px, 40px tap targets, board/bar/meter/logo on screen, characters clear of the board |
| Performance | `node tools/qa/perf.mjs` | boot + bytes on throttled 4G; rAF pacing through the heaviest base book, desktop and a 4x-CPU phone |
| Replay | open `/?replay=true&mode=BASE&event=<id>&amount=1000000&social=true` | replay bar, Play / Play again, social wording |
| Motion review | `node tools/qa/record.mjs <name> 1440x900 16 '<js>'` | real video, tiled into contact sheets |
| Screens | `node tools/qa/shot.mjs <url> 390x844@3,1440x900` | full-resolution screenshots |

## Deploy

The exact tested `dist` is uploaded as a prebuilt deployment (no remote build), then the live
`index-*.js` hash is checked against the local build:

```bash
npm run deploy      # = deploy/deploy.sh (cache headers live in deploy/vercel-output-config.json)
```
