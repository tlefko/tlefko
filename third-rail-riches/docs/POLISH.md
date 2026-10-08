# Powder Keg Cove: polish + Kaboom Bomb program (started 2026-09-29)

Every track reads this whole file before touching code. It holds the goal, the quality bar, who owns
which file, the contracts between tracks and the hard rules.

## Why we are doing this

Stake Engine rated our sister game Lucifer's Lullaby (same engine, same code base) 1.67 / 2.00 / 1.67
from three reviewers: 5.33 of 9 points, and 6 are needed to publish. Their tags and definitions:

- **Poor animations**: "Animations feel janky, are missing in key moments or fall short of expected polish."
- **Limited gameplay depth**: "Players exhaust the experience quickly: few mechanics or meaningful decisions
  to sustain engagement."
- **Low quality assets**: "Heavy reliance on generic or AI art, standard fonts, emoji icons or gradient fills
  that don't meet visual quality standards."

Lucifer was later re-rated and is now in Stake's approval queue. It is **frozen: nobody touches
`../lucifers-lullaby`**. Powder Keg Cove (this repo, not yet submitted) must clear the bar
comfortably. The target is 3 stars from every reviewer.

## The bar ("3 stars" in practice)

- **Motion.** Every key moment has anticipation, action and follow-through (squash and stretch,
  overshoot, settle, secondary motion). Nothing pops in or out without motion, and there are no dead
  frames. No jank: a steady 60 fps on desktop, with no hitch at transitions, bonus entry, big wins or
  resizes.
- **Bespoke look.**
  - Display text never looks like a stock font with a gradient and an outline: use custom lettering and
    numerals, or rich layered treatments.
  - The UI is themed art, not generic web buttons or line icons.
  - No emoji and no Unicode pictographs.
  - Rendering is inked, cel-shaded and textured, not flat gradient fills.
- **Depth.** New mechanics (the Kaboom Bomb) plus a real decision (Powder Boost), taught clearly (splash,
  rules, first-time hints), with progress always visible (charge, fuse, size, multiplier).

## Ownership (one owner per file; everyone else is read-only)

| Track | Area | Files it owns |
|---|---|---|
| **M** | Math, engine, Stake layer | `src/math/**`, `src/stake/**`, `src/game/Controller.ts`, `tools/sim/**`, `tools/stake/**`, `stake-math/**`, `public/demo-books/**`, `docs/MATH.md`, `docs/BOMB.md`, `tools/qa/soak.mjs` |
| **G** | Grid and choreography | `src/game/Presenter.ts`, `src/render/grid/**`, `src/render/fx/Particles.ts`, `src/render/timing.ts`, `src/art/fx.ts` |
| **C** | Characters, wheel, big moments | `src/render/characters/**`, `src/art/{captain,crew,characters,props}.ts`, `src/render/wheel/**`, `src/render/winbar/**`, `src/render/overlays/{BigWin,TitleCard,Iris,JackPop}.ts`, and **only** the `parrotHead()` function in `src/art/critters.ts` |
| **D** | Symbol art | `src/art/{sea,critters (except parrotHead),keg,symbols,kit,geo}.ts`, new `src/art/bomb.ts`, `tools/art/**` |
| **S** | Splash, boot, onboarding | `src/render/overlays/IntroSplash.ts`, `index.html`, `src/main.ts`, `public/boot/**`, `tools/brand/boot.mjs` |
| **P** | Performance, low power, portrait | `src/render/app.ts`, new `src/render/quality.ts`, `src/render/layout.ts`, `src/game/Scene.ts`, `src/game/Settings.ts`, `src/render/fx/FilmOverlay.ts`, `src/render/scene/**`, `src/art/scene.ts`, `src/render/textures.ts`, `tools/qa/{layout,perf}.mjs` |
| **H** | HUD, UI, lettering | `src/ui/**`, `src/render/text.ts`, `src/render/Logo.ts`, new `src/art/lettering.ts`, `tools/brand/tile.ts` |

- **Shared, append-only: `src/i18n/en.ts`.** Each track adds keys inside its own block, marked with a
  `// --- track X ---` comment at the end of `EN` (and of `SOCIAL_EN` when needed). Use small Edit
  insertions only, re-read the file right before each edit, and never rewrite the file. Don't touch
  `src/i18n/locales/*`: a translation pass runs at the end.
- **Lead only:** `dist/`, `deploy/`, `.vercel/`, `README.md`, `package.json` / lockfile (ask in your
  report if you need a dependency; avoid new ones), `docs/ART.md`, audio (`tools/audio-lab`,
  `public/audio`, `src/audio`). A sound pass for the new mechanics comes later. Use existing sound
  ids as placeholders and list the sounds you want in your report.
- **Need a change in a file you don't own?** Don't make it. Put the exact request (file, function,
  change) in your report, or work around it through the owner's public API.

## Contracts (build against these now)

M finalises exact field names in `src/math/types.ts` and `docs/BOMB.md` early in its run, keeping these
shapes. If a detail below conflicts with `docs/BOMB.md`, `docs/BOMB.md` wins.

### Rules: Kaboom Bomb (code name BOMB) and Powder Boost (mode BOOST)

- **A new symbol, `Sym.BOMB = 11`.** It doesn't pay, isn't wild and is never part of a cluster. It is
  sticky for the rest of the spin: it survives wins and falls with gravity on refills like any
  surviving symbol.
- **Size and fuse.** Each bomb has `size` (starts at 1; it is the multiplier the bomb will add) and
  `fuse` (cascades left; starts at 3).
- **Three ways a bomb appears:**
  1. **Natural:** 0 or 1 bomb on a spin's initial drop, at a per-mode rate that is higher in Boost and
     free spins.
  2. **Thrown:** Cap'n Kaboom's charge (`charge`, 0 to `CHARGE_MAX`, which is 3, or 2 in Boost) gains
     +1 per Powder Keg explosion. When it reaches `CHARGE_MAX`, the captain throws a bomb onto a random
     eligible cell during the next refill, and the charge resets to 0.
  3. **Wheel:** a new Captain's Wheel outcome `{ kind: 'bomb', size }` throws a bomb of that size.
- **Growth.** Every Powder Keg explosion adds +1 size to every bomb on the board, up to a cap. Bomb
  detonations don't grow bombs.
- **Fuse.** Each cascade step ticks the fuse of every bomb already on the board down by 1. At 0 the
  bomb detonates at the start of the next step. If the cascade sequence ends with bombs still on the
  board, they all detonate then, so no bomb is ever wasted.
- **Detonation:**
  - The bomb clears a square around itself: 3x3 at small sizes, larger at big sizes (M sets the
    thresholds). Symbols in the area vanish without paying.
  - Cold kegs in the area light up and lit kegs explode (the existing chain rules). Other bombs in the
    area detonate too.
  - The plunder multiplier gains +size and the fuse meter gains +2. Then the board refills.
- **Base game vs free spins.** In the base game, charge and multiplier reset every spin. In free spins,
  charge and multiplier carry over between spins.
- **Powder Boost (mode `BOOST`, 1.5x the bet).** A toggle by the spin button. `CHARGE_MAX` drops to 2 and
  natural bombs are more frequent. It is hidden where the jurisdiction disables bonus buys.
- **Unchanged.** RTP is 96.20% in every mode (BASE 1x, BOOST 1.5x, WITCHING 100x, INFERNO 500x) and the
  max win stays 50,000x.

Theme names (player-facing, via `t()`): **Kaboom Bomb**, **Powder Boost**, **charge**.

### Round data (M, read by G)

Per cascade step, M records (exact names in `docs/BOMB.md`):

- the bombs on the board (cell, size, fuse);
- detonations (cell, size, cleared area, kegs lit, kegs exploded, chained bombs);
- growth after this step's explosions;
- a thrown bomb, if any (cell, size, source `'charge' | 'wheel'`);
- `chargeAfter`, `multAfter` and `meterAfter`.

A spin's initial grid may contain `Sym.BOMB` cells. M also documents dev hooks for forcing every bomb
scenario, so presentation tracks can work before the final books exist.

### Character API (C implements on the captain, G calls it)

```ts
captain.setCharge(value: number, max: number): void   // visible charge: a bomb in his free hand whose fuse glows more with each point (pips or sparks)
captain.throwBomb(): Promise<{ x: number; y: number }> // wind-up and throw; resolves at release with the global point the bomb leaves his hand
captain.react(state), parrot.react(state)             // existing; C may add states: 'duck', 'watch'
```

G flies the projectile from the release point to the target cell and lands the bomb symbol.

### Symbol art (D provides, G consumes)

- `SYMBOL_ART[11]` (bomb): `idle` (fuse lit) and `hot` (about to blow: red-hot glow, cracks). G scales
  the sprite and draws the size and fuse badges.
- Every paying symbol may add `winFrames?: (() => string)[]` (3 or 4 frames looped during its win
  highlight) and `idleFrames?`. G plays them; D draws them. 256 viewBox, same anchor, no text in art.

### Quality (P provides, everyone reads)

```ts
// src/render/quality.ts
export type QualityMode = 'auto' | 'high' | 'low';
export const quality: { readonly low: boolean; mode: QualityMode; set(m: QualityMode): void; onChange(fn: (low: boolean) => void): () => void };
```

Tracks cut work in their own files when `quality.low` is set: fewer particles, no secondary motion
loops, simpler fx.

### Boost (M provides in Controller, H binds the UI)

`ctrl.boost: boolean`, `ctrl.setBoost(on)`, `ctrl.boostAllowed: boolean`, and a HUD callback when it
changes. The cost shown is `bet x 1.5`.

### Wheel bomb outcome

M adds the kind, C adds the wedge art and mapping in `Wheel.ts`, and G adds the Presenter branch.

## Hard rules (every track)

1. **No clipped text, ever (Tyler's rule).**
   - Canvas `Text` needs padding that covers stroke, shadow and glyph overhang.
   - No masks or containers that slice glyphs, and no `cacheAsTexture` on text containers.
   - Fit-to-width with margins that include entrance overshoot.
   - Check your text in all 16 languages (`?lang=ru|vi|de|fi|es|pt|fr|pl|tr|id|ja|ko|zh|ar|hi`); ru, vi,
     fi and de are the longest.
   - DOM text never truncates.
   - Every frame counts, not just the settled state.
2. **No emoji or Unicode pictographs** (✓ ★ ⚡ ♪ and so on) in UI or text. Icons are SVG in the
   game's ink style.
3. **Display type** uses H's lettering and treatment helpers once they exist (see H's report). Until
   then, no new plain font-plus-gradient text.
4. **Art** follows `docs/ART.md`: `kit.ts` ink and cel, palette tokens, hand-shaped highlights and
   texture. Flat gradient fills are the "cheap vector" tell.
5. **Motion:**
   - GSAP only, time-based. Every tween is killed on destroy (`gsap.context`).
   - Respect speed modes (`T()`), slam (Space speeds up the current spin only), prefers-reduced-motion
     and `quality.low`.
   - At normal speed a base spin with no win may not get more than 10% longer than today, and turbo and
     super turbo stay snappy.
6. **PixiJS 8:**
   - Create each `FillGradient` once and cache it.
   - Never destroy shared textures (`Texture.EMPTY`/`WHITE`); use `freeTexture()`, and never leave a
     Sprite on a destroyed texture.
   - Async relayout uses generation counters.
   - Build textures at layout or prepare time, never mid-animation.
7. **Stake:**
   - No external network loads (everything bundled) and no console output.
   - All player text goes through `t()`, with EN in `en.ts` and social wording in `SOCIAL_EN` when
     bet, buy or cash words appear.
   - The disclaimer stays as is. Replay mode and the jurisdiction flags keep working
     (`disabledBuyFeature` hides buys and Boost, and so on).
8. **Only M changes outcomes.** Every other track is presentation, and rules numbers come from M.
9. **Keep the build green.** `npx tsc --noEmit -p .` passes at every stopping point. If another track's
   work in progress breaks the build, don't fix their files: wait, retry, and note it.
10. **Off limits:** no git commits, no deploys, no Stake uploads, no edits to `../lucifers-lullaby`.

## Servers, builds, QA

- **Ports per track:** M 5410-19, G 5420-29, C 5430-39, D 5440-49, S 5450-59, P 5460-69, H 5470-79. The
  lead uses 5318 and 5319.
- **Build and preview privately; never write to `./dist`:**
  - Build: `npx vite build --outDir /private/tmp/claude-501/pkc-<track>/dist --emptyOutDir`
  - Preview: `npx vite preview --outDir <same> --port <p> --strictPort --host 127.0.0.1`
  - A dev server is fine (`npx vite --port <p> --strictPort --host 127.0.0.1`); run one at most and stop
    it when done.
- **Debug hooks.** `?debug` exposes `window.__ll = { scene, ctrl, rgs, forceBook(id) }`. Demo books live
  in `public/demo-books`; M regenerates them with bomb rounds and documents the scenario hooks.
- **QA tools** (pass your URL):
  - `tools/qa/shot.mjs`, `record.mjs` (video to contact sheets), `soak.mjs`, `layout.mjs`, `perf.mjs`,
    `bigwin-monotonic.mjs`.
  - Art sheets: `npx tsx tools/art/sheet.ts <group> 2`.
- **The machine is shared by seven tracks.** Keep Chrome instances few and short-lived. Write outputs to
  `tools/qa/out/<track>/`, and delete videos after review (about 11 GB of disk is free).

## Report (your final message)

- files changed;
- before and after screenshot paths;
- what you verified (commands and results);
- open issues;
- exact requests for other tracks;
- sounds you want;
- new EN keys.
