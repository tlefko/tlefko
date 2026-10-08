# Powder Keg Cove: math model

Powder Keg Cove is a 6x5 cascading cluster-pays slot with original mechanics (Powder Keg wilds that
light and explode, the Powder Fuse meter, the Captain's Wheel and, since 2026-09-29, the Kaboom
Bomb and the Powder Boost mode), played with demo credits on the static site and published to Stake
Engine as static books. It shares its engine code with Lucifer's Lullaby v2; the Kaboom Bomb,
Powder Boost and the retuned parameters are Powder Keg Cove only.

This document uses the engine's code names, which the books and mode files also use:

| Code name | Theme name |
|---|---|
| Brimstone Block, BRIM, block | Powder Keg (wild) |
| Tantrum meter, flames, TANTRUM_SIZE | the Powder Fuse, sparks |
| tantrum multiplier | plunder multiplier |
| Hellfire Wheel: hounds / inferno row / boost / cash / bomb | Captain's Wheel: Keg Drop / Broadside / Grog / Doubloons / Kaboom |
| BOMB, `Sym.BOMB = 11` | Kaboom Bomb |
| charge, `CHARGE_MAX` | Cap'n Kaboom's charge |
| `BOOST`, round kind `boost` | Powder Boost (1.5x bet) |
| Witching Hour, `WITCHING`, `witching` | Moonlight Raid (free spins, 100x buy) |
| Inferno Hour, `INFERNO`, `inferno` | Blackpowder Raid (500x buy) |
| FS (jack-in-the-box) | treasure chest scatter |

The Kaboom Bomb's fields, event order, player-facing numbers and dev hooks are specified in
`docs/BOMB.md`. This document describes the engine (`src/math/`), the model and its tuned
parameters, the Stake Engine files and how they were verified, and every interpretation choice made
where the rules contract (`src/math/types.ts`) leaves room.

| File | Purpose |
|---|---|
| `src/math/types.ts` | Engine/renderer contract (the rules spec), bomb constants, `blastArea` |
| `src/math/rng.ts` | xoshiro128** PRNG seeded via splitmix32; `createRng(seed?)` |
| `src/math/paytable.ts` | `PAYTABLE`, `SIZE_LABELS`/`TIER_LABELS`, `tierIndex`, `payFor`, integer-hundredths `PAY_H` |
| `src/math/model.ts` | Per-set parameters (base, boost, witching, inferno): shapes, wheel tables, `TUNED_KNOBS` |
| `src/math/engine.ts` | `playRound({ kind, rng, force?, record? })`; test hooks `findClusters`, `resolveStep` |
| `src/stake/book.ts` | Book format, `roundToBook` / `bookToRound`, `MODE_COST` |
| `src/stake/devScenarios.ts` | Engine-built dev scenarios for the presentation tracks (`docs/BOMB.md` section 5) |
| `tests/math/*.test.ts` | Vitest suite (`npx vitest run tests/math`) |
| `tools/sim/cli.ts` | Monte Carlo: `npx tsx tools/sim/cli.ts --kind all --rounds 2e7 --workers 9 [--knobs JSON] [--force JSON]` |
| `tools/stake/generate.ts` | Books + weights + index.json for Stake Engine |
| `tools/stake/verify.ts` | Independent verifier of the published files (`--selftest`, `--stats`) |
| `tools/stake/scenarios.ts` | QA scenario books -> `stake-math/scenarios.json` |
| `tools/stake/demo.ts` | Demo pack -> `public/demo-books/{BASE,BOOST,WITCHING,INFERNO}.json` |
| `src/stake/stats.json` | Verified per-mode figures for the UI (written by `verify.ts --stats`) |

All money inside the engine is in bet multiples. Every pay, cash prize and multiplier keeps amounts on
a 0.01x grid, so the engine computes in integer hundredths (the Stake `payoutMultiplier` unit) and
converts once when it writes a result.

## 1. Rules as implemented

Grid: 6 reels x 5 rows, cell index `reel * 5 + row`, row 0 at the top.

**Clusters.** 5 or more orthogonally connected cells (up/down/left/right; diagonals never connect)
of one paying symbol pay. Powder Kegs (BRIM, cold or lit) are wild for every paying symbol. A
cluster is a connected component of "symbol s or BRIM" cells grown from a real s cell, so a group
made only of kegs never pays, and a keg touching two different symbols' groups joins (and counts
in the size of) a cluster of each; both pay in the same step. FS and Kaboom Bombs never join or
bridge a cluster. Size counts wilds. Cluster pay = paytable(symbol, size) x mult, with
mult = `LIT_MULT ^ (lit kegs in the cluster)` x plunder multiplier (cold kegs x1; LIT_MULT = 2).

**One step** (a spin repeats steps; order is exactly this):
1. Find and pay every cluster (plunder multiplier as it is at the start of the step, `multBefore`).
2. Every cold keg in any winning cluster ignites: it stays, now lit (`Step.ignited`).
3. Every winning non-wild cell is removed (`Step.removed`).
4. Blasts (`Step.explosions`, one ordered list for kegs and bombs). Roots, in ascending position
   order: every keg that was already lit when the step began, whether or not it joined a win, and
   every bomb whose fuse was 0 when the step began (on the end-of-sequence step: every bomb). Each
   root's chain is processed breadth-first before the next root. A keg blast covers its 3x3 area; a
   bomb covers 3x3 below size 3 and 5x5 from size 3 (`BOMB_BIG_SIZE`); both are clipped at the grid
   edge. In the area paying symbols are removed, FS are spared, cold kegs ignite and stay
   (`ignited`), lit kegs explode and bombs detonate as a chain (`chain`; their own entries follow in
   breadth-first order).
   *Interpretation:* "lit" at blast time includes kegs ignited by a win in step 2 of the same step,
   so a freshly ignited keg caught in a blast chain-explodes immediately (it never gets its x2
   cascade). A keg ignited *by a blast* in this step is safe for the rest of the step (it "stays")
   even if a later blast catches it; it explodes in the next step. `Explosion.cleared` lists only
   cells that held something (the exploding keg or bomb first). A bomb caught by any blast
   detonates at once, whatever its fuse.
5. Meter += clusters + 2 x blasts (kegs and bombs, chains included). Plunder multiplier += the size
   of every detonated bomb (`multAfter`). Charge += keg explosions (bombs never charge).
6. Every bomb still on the board grows +1 per keg explosion of this step, up to `BOMB_MAX_SIZE = 5`
   (`Step.growth`); then its fuse ticks down by 1. (A bomb that detonates in a step does not grow
   from that step.)
7. Gravity: everything left (symbols, FS, kegs, bombs) falls to the bottom of its reel. If the charge
   is at `CHARGE_MAX` or more, Cap'n Kaboom throws one bomb (size 1, fuse 3) onto a uniformly random
   empty cell and the charge resets to 0 (`Step.thrown`, source `charge`). Refill the other empty
   cells from the top: each new cell is a cold keg with probability `brimRefill`, else a symbol from
   the set's refill weights; refills are never FS or bombs. `spawnRow = row - (empty cells in the
   reel)`.
8. If meter >= TANTRUM_SIZE (10): the Captain's Wheel spins once (meter -= 10) and applies:
   - hounds (2/3/4): that many cold kegs replace distinct random cells holding a paying symbol
     (never FS, a keg or a bomb; fewer if not enough such cells);
   - inferno: a uniformly random row; every paying-symbol cell in it becomes a cold keg
     (*interpretation:* FS, kegs and bombs stay as they are);
   - boost (+1/+2/+3/+5): plunder multiplier += value; applies from the next step on;
   - cash (2/5/10/25/50/100x): added to the spin win, never multiplied;
   - bomb (size 2/3/5): Cap'n Kaboom throws a bomb of that size (fuse 3) onto a random cell holding a
     paying symbol (`Step.thrown`, source `wheel`).
   New cells from the wheel get fresh ids; `placed[].replacedId` / `thrown[].replacedId` is the cell
   they replaced.

A spin continues while there is a win, a lit keg, a hot bomb (fuse 0), **or a full meter**.
*Interpretation:* one step spins at most one wheel (`Step.wheel` is singular), so if a step leaves
the meter at 20+ the spin continues with a "wheel-only" step that spins the next wheel. When none of
those holds but bombs are left on the board, one more step runs in which every bomb detonates (the
end-of-sequence step, `Step.finale`), and the spin goes on from there (the refill can win again).
A spin therefore ends only with no win, no lit keg, no bomb and meter < 10 (or at the cap).

**Initial drop.** FS count k from the set's `fsDist` (0..6) on k distinct random reels, random row;
then b cold kegs from `brimDist` on distinct random non-FS cells; then 0 or 1 natural bomb (size 1,
fuse 3) with probability `bombRate` on a random free cell; every other cell from the set's drop
weights. Cell ids are unique per round (a round-wide counter across all spins; initial cells get ids
in position order).

**Base game.** Meter 0, plunder multiplier x1 and charge 0 on every paid spin (nothing carries
between base spins); `CHARGE_MAX = 3`. 3 / 4 / 5+ FS on the initial drop award 8 / 10 / 12 Moonlight
Raid free spins.

**Powder Boost (`BOOST`, round kind `boost`, 1.5x the bet).** A base spin played with the `boost`
parameter set, which is the base set with exactly three changes: `CHARGE_MAX_BOOST = 2`, natural
bombs 1.5x as often and (since 2026-10-04, section 7) 1.5x the Kaboom wedges on the Captain's Wheel
(`BOOST_WHEEL`). Everything else (symbols, kegs, scatters, trigger rate) is identical;
free spins won on a Boost spin are the normal Moonlight Raid. The max win is 50,000x the base bet.

**Moonlight Raid (free spins).** Fresh drop every spin; meter, plunder multiplier and charge carry
from spin to spin for the whole bonus. 3+ FS on a free spin's initial drop add 5 spins
(`retriggers`). Free spins use their own parameter set (`witching`).

**Buy Moonlight Raid (100x).** A trigger spin (base parameters) whose FS count is drawn from
3 / 4 / 5 with weights 80 / 16 / 4 (8 / 10 / 12 spins); its own win counts. Then Moonlight Raid.

**Buy Blackpowder Raid (500x).** A trigger spin (base parameters) that always lands exactly 4 FS;
its win counts. Then 10 free spins starting with the plunder multiplier at x5, the meter at 5 and
the charge at 0 (parameter set `inferno`; same rules as Moonlight Raid, retriggers included;
`BonusKind` is `'witching'`). Its wheel has no +5 grog and no size-5 bomb, and the Broadside is a
token outcome (section 3): at a carried x5+ multiplier those outcomes are jackpot-grade, and Stake's
2-Star risk limits (section 5) cap how heavy a 500x buy's tail may be.

**Max win.** 50,000x per round in every mode. The cap is checked after every step (after its cluster
pay) and after every wheel. When it is reached the round total is set to exactly 50,000x and the
round ends immediately: the capping step is completed physically (removals, blasts, gravity, throw,
refill, so `gridAfter` stays consistent) but spins no wheel, no further step or free spin is played
and bombs still on the board stay there. `spinWin` is capped; `symbolWin` / `cashWin` / `stepWin`
are the raw amounts.

**Force** (QA): `scatCount`, `brimCount` and `bombCount` set the paid spin's FS / keg / natural-bomb
counts exactly (buys reject a trigger with fewer than 3 FS); `grid` sets the paid spin's whole
initial drop (ids = positions; `lit` lights kegs, `bombs` sets bomb size and fuse); `wheels` is a
queue consumed by the round's wheel spins in order (natural draws after it runs out; a forced
inferno uses its given row); `meter`, `mult` and `charge` set the paid spin's start state.

**record: false** runs the same code with identical RNG use (parity-tested over 200,000 base seeds,
60,000 Boost seeds, buys and bomb-forced rounds) and skips building per-step arrays; it is the
simulation fast path.

## 2. Paytable (bet multiples; cluster size tiers; unchanged)

| Symbol | 5 | 6 | 7 | 8 | 9-10 | 11-12 | 13-15 | 16+ |
|---|---|---|---|---|---|---|---|---|
| L1 anchor | 0.15 | 0.2 | 0.25 | 0.3 | 0.6 | 1.2 | 3 | 10 |
| L2 scallop shell | 0.15 | 0.2 | 0.3 | 0.4 | 0.75 | 1.5 | 4 | 12 |
| L3 treasure map | 0.2 | 0.25 | 0.4 | 0.45 | 0.9 | 2 | 4.5 | 15 |
| L4 compass | 0.2 | 0.3 | 0.45 | 0.6 | 1.2 | 2.2 | 6 | 22 |
| H4 crab | 0.3 | 0.45 | 0.6 | 0.9 | 2 | 4 | 9 | 40 |
| H3 octopus | 0.4 | 0.6 | 0.75 | 1.2 | 2.5 | 5 | 14 | 60 |
| H2 shark | 0.5 | 0.75 | 1 | 1.5 | 4 | 7.5 | 20 | 80 |
| H1 Sparks the parrot | 0.6 | 0.9 | 1.4 | 2.2 | 5 | 10 | 25 | 120 |
| TOP Cap'n Kaboom | 1 | 1.5 | 2.5 | 4 | 10 | 25 | 60 | 500 |

Monotone in size and in symbol rank; all values on the 0.01 grid.

## 3. Parameters (`src/math/model.ts`)

Drop weights are a low share split 1.15 : 1.05 : 0.95 : 0.85 over L1..L4 and the rest 1.3 : 1.15 :
1.0 : 0.85 : 0.7 over H4..TOP. Refill weights are clumpier (low share 0.85, geometric ratio 0.5 inside
lows and inside highs), which keeps cascades going. Cold kegs on the drop are Poisson(mean) truncated
at 6.

| Set | drop weights L1..TOP | kegs on the drop | brimRefill | natural bomb | charge | P(3+ FS) |
|---|---|---|---|---|---|---|
| base | .218 .200 .180 .162 .062 .055 .048 .041 .034 (low 0.76) | Poisson(0.46) | 0.013 | 0.015 | 3 | 1 in 219 |
| boost | same as base | same | same | 0.0225 | 2 | 1 in 219 |
| witching | .244 .223 .202 .181 .039 .035 .030 .026 .021 (low 0.85) | Poisson(0.70) | 0.0164 | 0.09 | 3 | 1 in 70 (retrigger) |
| inferno | .275 .251 .227 .203 .012 .010 .009 .008 .006 (low 0.955) | Poisson(1.00) | 0.0164 | 0.01 | 3 | 1 in 70 (retrigger) |

Refill weights: .453 .227 .113 .057 .077 .039 .019 .010 .005 (base, boost, witching: low share 0.85,
ratio 0.5); inferno .546 .202 .075 .028 .095 .035 .013 .005 .002 (ratio 0.37, clumpier). fsDist base / boost:
P(0..6 FS) = .8252 .14 .03 .00416 .000368 .0000319 .0000024 (the reference rates x 0.957); free
spins: .81078 .14 .035 .0125 .0016 .00012 .000005.

Captain's Wheel weights (relative):

| Outcome | 2 hounds | 3 | 4 | inferno row | +1 | +2 | +3 | +5 | cash 2 | 5 | 10 | 25 | 50 | 100 | bomb 2 | 3 | 5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| base | 30 | 20 | 10 | 0.15 | 10 | 6 | 3 | 1 | 24 | 14 | 7 | 2.5 | 0.8 | 0.25 | 6 | 3 | 1 |
| boost (since 2026-10-04; was the base wheel) | 28 | 20 | 10 | 0.15 | 10 | 6 | 3 | 1 | 21 | 14 | 7 | 2.5 | 0.8 | 0.25 | 9 | 4.5 | 1.5 |
| witching | 8 | 5 | 2 | 1 | 15 | 8 | 3 | 0.5 | 10 | 6 | 3 | 1 | 0.3 | 0.1 | 12 | 6 | 0.8 |
| inferno | 8 | 5 | 2 | 0.005 | 15 | 8 | 3 | 0 | 10 | 6 | 3 | 1 | 0.3 | 0.1 | 3 | 1.5 | 0 |

Bonus constants: Moonlight Raid 8/10/12 spins for 3/4/5+ FS, +5 per retrigger (3+ FS); Buy
Moonlight Raid trigger FS 3/4/5 weighted 80/16/4; Buy Blackpowder Raid 10 spins, multiplier x5,
meter 5, charge 0, trigger always 4 FS.

**Tuning (2026-09-29, with the Kaboom Bomb).** The bomb turned out to be the strongest value source
in the engine: each detonation adds its size to the plunder multiplier, which multiplies the lit-keg
products of every later cluster, and a 5x5 blast re-drops most of the board at the higher
multiplier. With the old parameters the base game returned about 350% and a free-spin bonus about
330x. The retune moved value from kegs to bombs:

- **Keg density** is the dominant knob (more kegs means more lit multipliers, more explosions, more
  charge, more bombs, more sparks, more wheels and more hound kegs, a feedback loop). Kegs on the
  drop fell from 0.70 to 0.46 (base), 1.08 to 0.70 (Moonlight Raid) and 1.38 to 1.13 (Blackpowder
  Raid, later 1.00 in the Stake retune below); refill keg rates fell by about a third.
- **Low share** rose (base 0.72 to 0.76, free spins 0.83 to 0.85): more low symbols make more,
  smaller wins, which keeps the hit rate where it was with fewer wild kegs.
- **Free-spin wheel**: bombs took over part of the multiplier's job, so grog boosts and keg drops are
  rarer and doubloons more common (section 3 table). Blackpowder Raid has fewer bomb wedges than
  Moonlight Raid (it starts at x5), and since the Stake retune no size-5 bomb at all.
- **Charge reset.** The charge resets to 0 when it throws (the literal rule in `docs/POLISH.md`),
  which caps charge throws at one per step. Letting the excess carry over made Powder Boost's base
  spin run away (standard deviation about 90x per spin) and priced Boost far above 1.5x.
- **Powder Boost** differs from the base set only in the charge threshold and the natural rate. The
  threshold alone is worth about +0.46x per spin. Each natural bomb is worth about 3.7x on a Boost
  spin (it feeds the charge) but only about 1.6x on a base spin, so Boost's natural rate is 1.5x
  base's (1.5% vs 2.25% of drops), not more.
- **Trigger rate.** The free-spin bonus is worth the same absolute amount on a base and a Boost spin,
  which favours the base spin relative to its cost, so the last few tenths of base RTP came from the
  trigger scale (0.9 to 0.957: 1 in 233 to 1 in 219) rather than from more kegs (which would have
  lifted Boost about twice as much).

**Blackpowder Raid retune (2026-09-29, Stake dashboard).** Stake's 2-Star tier caps every mode's raw
P(>= 5,000x) at 1%, P(>= 10,000x) at 0.5% and the mean of its worst 0.1% of outcomes (CVaR) at
20,000x the base bet, so a 500x buy (mean 481x) needs CVaR / mean <= 41.6 (37.4 with the 10% margin).
The bomb-era Blackpowder Raid had 76 (P(>= 5,000x) 1.6%, CVaR 36,300), and pure reweighting would
have needed KL 0.024 with cliffs in the weights (x3.2 just below 5,000x, x0.01 above 20,000x). The
cause was the Broadside: a row of kegs at a carried x5+ multiplier is a jackpot, and although it came
up on only ~8% of bonuses it carried 55% of the buy's RTP (without it the buy returned 41%). The new
`inferno` set gets its value from steady low-symbol cascades instead: low share 0.955 (was 0.85),
clumpier refills (ratio 0.37), kegs 1.00 / 0.0164 on the drop / refill, natural bombs 1%, and a wheel
with more keg drops per multiplier outcome, no +5 grog or size-5 bomb and a token Broadside (weight
0.005 of 65.9, 0.008% of wheel spins or 1 in ~13,000: rare but possible, so the wheel never shows a
prize that cannot land). The natural buy now has mean 480x, sd 865x, P(>= 5,000x) 0.47% and a
free-spin hit rate of 66% (was 53%), at about 5 bombs per bonus (`stake-math/sim_inferno.log`); the
published weights have CVaR 15,963 (CVaR / mean 33). Other levers measured on the way (per point of RTP, most tail first):
Broadside, extra refill kegs, keg drops, keg density, clumpier refills, more lows, natural bombs.

Knobs were set with `tools/sim/cli.ts --knobs` and component estimates rather than by chasing
confidence intervals: Stake computes RTP exactly from the weights, and the weight tilt (section 5)
absorbs the residual. The base RTP was assembled from low-variance parts: the paid spin's own return
(10M rounds) plus the exact trigger probabilities times the bonus value per trigger size, measured
with forced buys (2M / 600k / 600k bonuses for 3 / 4 / 5 FS: 84.7x / 129.0x / 180.3x).

## 4. Natural game (engine, unweighted)

20M base rounds, 20M Powder Boost rounds, 1M rounds per buy; seed 7 (`stake-math/sim.log`; Buy
Blackpowder Raid rerun with the retuned `inferno` set in `stake-math/sim_inferno.log`, and a rerun of
the other three modes at 17:13 on 2026-09-29 reproduced `sim.log` exactly).

| | BASE | BOOST (1.5x) | Buy Moonlight Raid (100x) | Buy Blackpowder Raid (500x) |
|---|---|---|---|---|
| RTP (95% CI) | 96.44% +- 2.46% | 97.60% +- 1.90% | 96.91% +- 1.58% (avg 96.9x) | 96.13% +- 0.34% (avg 480.5x) |
| hit rate (round) | 32.13% | 32.31% | 99.72% | 100.00% (0.0018% pay 0) |
| sd (x bet) | 56.1 | 65.2 (43.5 x cost) | 806 | 864.5 |
| bonus trigger | 1 in 219, avg 89.4x, 8.8 spins | 1 in 219, avg 89.4x | 9.1 spins | 10.8 spins |
| retriggers per bonus | 0.125 | 0.124 | 0.130 | 0.154 |
| wheels | 1 paid spin in 57 | 1 in 31 | 1 free spin in 5.1 | 1 in 2.4 |
| keg explosions | 13.1% of paid spins; 0.23/spin | 13.2%; 0.27/spin | 27.0% of free spins; 0.66/spin | 44.5%; 1.51/spin |
| **bombs** | 1 paid spin in 34.1 has one; 0.040/spin (natural 0.015, thrown 0.023, wheel 0.002) | 1 in 15.4; 0.099/spin (natural 0.023, thrown 0.073, wheel 0.004) | 2.94 per bonus (0.32 per free spin: natural 0.09, thrown 0.16, wheel 0.07) | 5.03 per bonus (0.47 per free spin: natural 0.01, thrown 0.40, wheel 0.05) |
| detonations: fuse / end / chain | 11% / 74% / 15% | 10% / 75% / 14% | 12% / 73% / 15% | 23% / 55% / 22% |
| 5x5 share, average size | 10.8%, 1.41 | 8.6%, 1.35 | 16.5%, 1.61 | 16.1%, 1.61 |
| free-spin hit rate | 48.7% | 48.7% | 48.8% | 65.8% |
| 50,000x cap | 1 in 3.3M (6) | 1 in 2.5M (8) | 1 in 16,667 | 1 in 62,500 |
| longest spin | 62 steps | 72 | 51 | 69 |

Bombs per Moonlight Raid bonus: 0: 13.7%, 1: 19.0%, 2: 18.6%, 3: 15.3%, 4: 11.4%, 5: 7.9%, 6+: 14.1%
(Blackpowder Raid: 0: 1.9%, 1: 7.1%, 2: 11.9%, 3: 14.4%, 4: 14.4%, 5: 12.9%, 6+: 37.4%).

How the RTP splits: a base spin alone returns 0.555x (symbols 0.485, wheel cash 0.071) and the
bonus 0.408x (1 in 219 x 89.4x); a Boost spin returns 1.057x on its own plus the same 0.408x bonus.
Bonus value by trigger size (forced buys, 2M / 600k / 600k bonuses): 84.7x for 3 FS (8 spins),
129.0x for 4 FS (10 spins), 180.3x for 5+ FS (12 spins). Before the Kaboom Bomb the base game had a
30.1% hit rate, a bonus 1 in 232 worth 92x and a base spin worth 0.56x; the bomb kept all three
close while moving value from kegs to bombs.

Target checks: bombs every 25-60 base spins (34.1), about twice as often with Boost (15.4, 2.2x),
2-5 per free-spin bonus (2.9 Moonlight Raid, 5.0 Blackpowder Raid).

Blackpowder Raid natural payout distribution (x base bet, 1M buys): below 100x 19.9%, 100-500x
53.0%, 500-2,000x 23.9%, 2,000-5,000x 2.74%, 5,000-10,000x 0.38%, 10,000x+ 0.091% (cap 1 in 62,500).
Before the retune: 5,000x+ was 1.69% and the cap 1 in 2,119.


## 5. Stake Engine files (`stake-math/publish/`)

`tools/stake/generate.ts --out stake-math/publish --base 400000 --boost 400000 --witching 60000
--inferno 60000 --seed 1` (log: `stake-math/generate.log`, summary: `stake-math/generate_report.json`):

1. **Books.** N natural rounds per mode (book id = round index + 1; round i is seeded from (i, stream
   word of seed x mode)), each `roundToBook(id, round)` from `src/stake/book.ts`, streamed in id order
   into one zstd frame (level 12, long-distance matching, window 2^27). Empty bomb arrays are left
   out of each step (`docs/BOMB.md` section 3).
2. **Tail sample.** M more natural rounds per mode on the fast path; every round paying at least the
   threshold is replayed with recording and appended as a book (ids N+1...). The top buckets'
   probabilities are estimated from all N + M rounds, so the tail is both better estimated and made
   of many distinct books. BASE and BOOST: 16M rounds, >= 1,000x (1,355 and 2,294 books); WITCHING:
   300k buys, >= 15,000x (159); INFERNO: 300k buys, >= 10,000x (298).
3. **Max-win books.** Every mode needs at least 12. Natural ones count; missing ones come from a
   deterministic search (BASE and BOOST: rounds forced to 5 FS, i.e. a legitimate round with a
   12-spin bonus; buys: unforced), fast path first, replayed with recording, appended last. Found:
   BASE 5 natural + 7 searched, BOOST 2 + 10, WITCHING 24 natural, INFERNO 9 + 3.
4. **Weights.** Max-win books are pinned to the mode's max-win probability (BASE 1 in 5M, BOOST 1 in
   2.5M, WITCHING 1 in 40k, INFERNO 1 in 60k), shared evenly. The rest is a minimum-KL exponential
   tilt of the natural probabilities over 38 fine payout buckets (0, [0.1,0.3), [0.3,0.5) ...
   [40000,50000), cap; books in a bucket keep equal weights) with RTP = 96.20% as an equality and, as
   bounds: the hit rate ([26%, 34%] BASE, [22%, 43%] BOOST), BASE's standard deviation (<= 44x), and
   every Stake 2-Star dashboard limit with about 12% headroom (`DASH_TARGET` in
   `tools/stake/common.ts`: P(>= 5k / 10k / 25k) <= 0.88% / 0.44% / 0.176%, CVaR <= 17,600 and
   <= 616 x cost, ETL > 40x <= 0.70, ETL > 10,000x <= 0.52, ETL sum <= 1.14). Weights are integers
   summing to ~1e15; a final exact integer correction on two books makes
   `5 * costDen * sum(w * pay) == 481 * costNum * sum(w)` (cost = costNum / costDen, BOOST 1.5 =
   3 / 2), i.e. RTP is exactly 0.962 in every mode.

   | | natural RTP of the sample | active bounds | KL | weight factor vs natural |
   |---|---|---|---|---|
   | BASE | 98.42% | RTP, sd | 4.0e-6 | flat to ~1.35 up to 5,000x, then falling: ~0.5 at 12,500x, ~0.04 at 20,000x, ~0 above 30,000x |
   | BOOST | 108.21% (400k sample runs hot; true ~97.6%) | RTP | 2.3e-7 | monotone, 0.58 to 1.0 |
   | WITCHING | 94.80% | RTP, CVaR | 6.9e-5 | up to 1.28 around 10,000x, down again above 15,000x |
   | INFERNO | 97.19% | RTP | 3.8e-6 | monotone, within 0.2% of natural below the cap |

   *Note on BASE:* the sd bound is met by thinning the top of the distribution, so BASE's
   20,000-50,000x range holds 12 books at a combined 1 in 111M. The range is not empty (Stake's
   no-gap rule passes) but it is a token; a win there is mostly reached as the 50,000x cap.
   `generate.ts --reweight` recomputes only the CSVs from the published payouts.
5. `lookUpTable_<MODE>_0.csv` rows `id,weight,payoutMultiplier`; `index.json` modes BASE (cost 1),
   BOOST (1.5), WITCHING (100), INFERNO (500) with `books_<MODE>.jsonl.zst`.

### Verified figures (`tools/stake/verify.ts`, reads only the published files)

*These tables are the seed-1 publish of 2026-09-29. It was replaced on 2026-10-04 by the seed-1004
publish with the Powder Boost wheel change; the current figures are in section 7.*

`stake-math/verify.log` and `verify.json` (2026-09-29 16:40, PASS in 325 s; `src/stake/stats.json`
written from the same run).

| | BASE | BOOST | WITCHING | INFERNO |
|---|---|---|---|---|
| cost | 1 | 1.5 | 100 | 500 |
| books | 401,362 | 402,304 | 60,159 | 60,301 |
| RTP | 96.2000% (exact) | 96.2000% (exact) | 96.2000% (exact) | 96.2000% (exact) |
| hit rate | 32.15% | 32.30% | 99.74% | 100.00% |
| sd (x base bet) | 44.00 | 63.38 (42.3 x cost) | 731.1 | 874.5 |
| max win 50,000x | 1 in 5,000,000 (12 books) | 1 in 2,500,000 (12 books) | 1 in 40,000 (24 books) | 1 in 60,000 (12 books) |
| P(>= 5,000x) | 1.24e-5 | 1.62e-5 | 2.82e-3 | 5.09e-3 |
| P(>= 10,000x) | 2.67e-6 | 5.05e-6 | 1.14e-3 | 9.66e-4 |
| P(>= 25,000x) | 2.01e-7 | 1.19e-6 | 1.26e-4 | 9.69e-5 |
| P(>= 50,000x) | 2.00e-7 | 4.00e-7 | 2.50e-5 | 1.67e-5 |
| CVaR (worst 0.1%, x base bet) | 512.6 | 752.5 | 17,600 | 15,962.7 |
| CVaR / cost | 512.6 | 501.7 | 176.0 | 31.9 |
| ETL > 40x cost (share of RTP) | 0.657 | 0.660 | 0.365 | 0.011 |
| ETL > 10,000x cost | 0.042 | 0.047 | 0 | 0 |
| ETL absolute (x base bet) | 0.63 | 0.95 | 35.1 | 5.15 |
| most likely book share | 2.7e-4% | 2.5e-4% | 2.1e-3% | 1.7e-3% |
| books_*.jsonl.zst | 35.3 MB | 40.7 MB | 98.0 MB | 206.4 MB |
| lookUpTable CSV | 8.1 MB | 8.1 MB | 1.4 MB | 1.4 MB |

Total upload 399.3 MB (limit 4.2 GB). Cross-mode RTP spread 0. Every CSV payout equals its book's
`payoutMultiplier`, which equals `round(final.totalWin * 100)` and is <= 5,000,000 for every id; ids
are contiguous from 1. BOOST's RTP is checked exactly as `5 * 2 * sum(w * pay) == 481 * 3 * sum(w)`.
Per-mode checks: BASE hit rate 25-35%, sd 0.6-50x, max win 1 in 2M..5M; BOOST hit rate 20-45%, sd
<= 75x (non-critical), max win 1 in 1M..5M; buys hit rate >= 2%, max win 1 in 20k..100k.
`verify.ts --selftest` corrupts copies (CSV payout, one weight, a missing row, a truncated books
file, a wrong index cost) and every case FAILs as required (`stake-math/selftest.log`).

**Stake "Math Distribution & Summary" dashboard** (worst mode per check; margin = headroom against
the 2-Star limit; the verifier requires >= 10% on every 2-Star check except the max payout, which is
50,000x by design):

| Check | Worst value (mode) | 2-Star limit | 3-Star limit | 2-Star | 3-Star | Margin |
|---|---|---|---|---|---|---|
| Max payout multiplier | 50,000 (all) | 50,000 | 100,000 | PASS | PASS | n/a |
| Cost multiplier | 500 (INFERNO) | 1,000 | 2,000 | PASS | PASS | 50.0% |
| Base std dev | 44.00 (BASE) | 50 | 60 | PASS | PASS | 12.0% |
| P(>= 5,000x) | 5.09e-3 (INFERNO) | 1.0e-2 | 5.0e-2 | PASS | PASS | 49.1% |
| P(>= 10,000x) | 1.14e-3 (WITCHING) | 5.0e-3 | 1.0e-2 | PASS | PASS | 77.2% |
| P(>= 25,000x) | 1.26e-4 (WITCHING) | 2.0e-3 | 5.0e-3 | PASS | PASS | 93.7% |
| P(>= 50,000x) | 2.50e-5 (WITCHING) | 1.0e-3 | 1.0e-3 | PASS | PASS | 97.5% |
| P(>= 100,000x) | 0 | 5.0e-4 | 5.0e-4 | PASS | PASS | 100% |
| CVaR per stake (CVaR / cost) | 512.6 (BASE) | 700 | 700 | PASS | PASS | 26.8% |
| CVaR absolute (x base bet) | 17,600 (WITCHING) | 20,000 | 50,000 | PASS | PASS | 12.0% |
| ETL > 40x cost (share of RTP) | 0.660 (BOOST) | 0.8 | 0.9 | PASS | PASS | 17.5% |
| ETL > 10,000x cost | 0.047 (BOOST) | 0.6 | 0.8 | PASS | PASS | 92.2% |
| ETL sum | 0.706 (BOOST) | 1.3 | 1.5 | PASS | PASS | 45.7% |
| ETL absolute (x base bet) | 35.1 (WITCHING) | 3,000 | 10,000 | PASS | PASS | 98.8% |
| Critical: base mode is the cheapest (cost 1) | BASE | | | PASS | PASS | |
| Critical: base std dev >= 0.6 | 44.00 | | | PASS | PASS | |
| Critical: RTP 90%..96.7% in every mode | 96.20% all | | | PASS | PASS | |
| Critical: cross-mode RTP spread | 0 | | | PASS | PASS | |
| Critical: a non-zero win at least 1 in N | BASE 1 in 3.11 | | | PASS | PASS | |

2-Star failing classes: 0. 3-Star failing classes: 0. For comparison, Lucifer's Lullaby v1 failed
2-Star on INFERNO tail probability (P(>= 5,000x) 0.0171) and CVaR (37,313).

Base std dev is checked on BASE only (the cost-1 mode). If Stake also applies it to Powder Boost,
BOOST's raw sd is 63.4x the base bet (42.3x its 1.5x cost); see `docs/STAKE-APPROVAL.md`, open
decisions.

### Hit-rate ranges per mode (published weights, x base bet)

Stake's "every range between the smallest payout and the max win has outcomes" rule passes in every
mode (`verify.ts`: no gaps). The (0,0.1) range is empty everywhere because the smallest paytable
entry is 0.15x (open decisions). "1 in" is the odds of landing in the range; "RTP share" is the
range's share of the mode's return.

BASE (cost 1):

| Range | Books | Probability | 1 in | RTP share |
|---|---|---|---|---|
| (0,0.1) | 0 | 0 | - | 0% |
| (0.1,1) | 104,770 | 2.619e-1 | 3.82 | 9.06% |
| (1,2) | 12,862 | 3.216e-2 | 31.1 | 4.29% |
| (2,5) | 5,099 | 1.275e-2 | 78.4 | 3.89% |
| (5,10) | 2,222 | 5.559e-3 | 180 | 3.94% |
| (10,20) | 1,573 | 3.939e-3 | 254 | 5.42% |
| (20,50) | 1,119 | 2.808e-3 | 356 | 8.80% |
| (50,100) | 487 | 1.227e-3 | 815 | 8.19% |
| (100,200) | 250 | 6.354e-4 | 1,574 | 8.76% |
| (200,500) | 125 | 3.240e-4 | 3,086 | 9.96% |
| (500,1000) | 27 | 7.298e-5 | 13,702 | 5.04% |
| (1000,2000) | 725 | 5.106e-5 | 19,586 | 7.07% |
| (2000,5000) | 449 | 3.523e-5 | 28,387 | 11.05% |
| (5000,10000) | 126 | 9.677e-6 | 103,343 | 6.67% |
| (10000,20000) | 73 | 2.463e-6 | 406,092 | 3.05% |
| (20000,50000) | 12 | 8.973e-9 | 111,446,168 | 0.02% |
| (50000,100000) (max win) | 12 | 2.000e-7 | 5,000,000 | 1.00% |

BOOST (cost 1.5; ranges in base-bet multiples):

| Range | Books | Probability | 1 in | RTP share |
|---|---|---|---|---|
| (0,0.1) | 0 | 0 | - | 0% |
| (0.1,1) | 103,486 | 2.587e-1 | 3.87 | 5.93% |
| (1,2) | 11,064 | 2.766e-2 | 36.2 | 2.46% |
| (2,5) | 5,626 | 1.407e-2 | 71.1 | 2.97% |
| (5,10) | 3,342 | 8.355e-3 | 120 | 3.91% |
| (10,20) | 2,375 | 5.937e-3 | 168 | 5.45% |
| (20,50) | 1,845 | 4.611e-3 | 217 | 9.51% |
| (50,100) | 727 | 1.816e-3 | 551 | 8.20% |
| (100,200) | 390 | 9.735e-4 | 1,027 | 8.86% |
| (200,500) | 221 | 5.505e-4 | 1,816 | 11.16% |
| (500,1000) | 85 | 2.107e-4 | 4,746 | 10.07% |
| (1000,2000) | 1,337 | 8.021e-5 | 12,467 | 7.33% |
| (2000,5000) | 722 | 4.248e-5 | 23,543 | 8.56% |
| (5000,10000) | 199 | 1.119e-5 | 89,373 | 5.10% |
| (10000,20000) | 64 | 3.349e-6 | 298,643 | 2.88% |
| (20000,50000) | 30 | 1.301e-6 | 768,388 | 2.47% |
| (50000,100000) (max win) | 12 | 4.000e-7 | 2,500,000 | 1.33% |

WITCHING, Buy Moonlight Raid (cost 100):

| Range | Books | Probability | 1 in | RTP share |
|---|---|---|---|---|
| (0,0.1) | 0 | 0 | - | 0% |
| (0.1,1) | 3,424 | 5.696e-2 | 17.6 | 0.04% |
| (1,2) | 4,714 | 7.842e-2 | 12.8 | 0.11% |
| (2,5) | 7,563 | 1.258e-1 | 7.95 | 0.42% |
| (5,10) | 8,535 | 1.420e-1 | 7.04 | 1.04% |
| (10,20) | 10,438 | 1.737e-1 | 5.76 | 2.52% |
| (20,50) | 12,392 | 2.063e-1 | 4.85 | 6.62% |
| (50,100) | 6,192 | 1.032e-1 | 9.69 | 7.18% |
| (100,200) | 3,316 | 5.535e-2 | 18.1 | 7.66% |
| (200,500) | 1,880 | 3.151e-2 | 31.7 | 9.54% |
| (500,1000) | 604 | 1.023e-2 | 97.8 | 7.08% |
| (1000,2000) | 373 | 6.432e-3 | 155 | 9.12% |
| (2000,5000) | 258 | 4.644e-3 | 215 | 14.48% |
| (5000,10000) | 85 | 1.677e-3 | 596 | 11.32% |
| (10000,20000) | 117 | 9.240e-4 | 1,082 | 12.53% |
| (20000,50000) | 86 | 1.931e-4 | 5,178 | 5.30% |
| (50000,100000) (max win) | 24 | 2.500e-5 | 40,000 | 1.25% |

INFERNO, Buy Blackpowder Raid (cost 500):

| Range | Books | Probability | 1 in | RTP share |
|---|---|---|---|---|
| (0,0.1) | 0 | 0 | - | 0% |
| (0.1,1) | 2 | 3.340e-5 | 29,936 | 0.000% |
| (1,2) | 4 | 6.678e-5 | 14,974 | 0.000% |
| (2,5) | 37 | 6.177e-4 | 1,619 | 0.000% |
| (5,10) | 146 | 2.437e-3 | 410 | 0.004% |
| (10,20) | 647 | 1.080e-2 | 92.6 | 0.03% |
| (20,50) | 3,566 | 5.953e-2 | 16.8 | 0.43% |
| (50,100) | 7,633 | 1.274e-1 | 7.85 | 1.92% |
| (100,200) | 12,775 | 2.132e-1 | 4.69 | 6.26% |
| (200,500) | 18,976 | 3.165e-1 | 3.16 | 20.52% |
| (500,1000) | 9,721 | 1.619e-1 | 6.18 | 22.55% |
| (1000,2000) | 4,562 | 7.583e-2 | 13.2 | 20.68% |
| (2000,5000) | 1,609 | 2.661e-2 | 37.6 | 15.32% |
| (5000,10000) | 252 | 4.120e-3 | 243 | 5.36% |
| (10000,20000) | 297 | 7.917e-4 | 1,263 | 2.10% |
| (20000,50000) | 62 | 1.579e-4 | 6,335 | 0.86% |
| (50000,100000) (max win) | 12 | 1.667e-5 | 60,000 | 0.17% |

INFERNO never pays 0 (every published book wins something; the smallest pays 0.75x).

### Scenarios and demo pack

`tools/stake/scenarios.ts` writes `stake-math/scenarios.json`: per mode the smallest book (plus
alternates) for zero win, small win, big win (>= 20x BASE / BOOST, >= 2x cost for buys), max win,
bonus trigger (BASE / BOOST), retrigger, every wheel kind, chain explosion, a cluster paid at x5 or
more, and the Kaboom Bomb set (natural, thrown, growth, 5x5, fuse-out, end-of-sequence, bomb -> keg,
keg -> bomb, bomb -> bomb). Every scenario exists in every mode where it can (`stake-math/scenarios.log`):
22 in BASE and BOOST, 21 in WITCHING (no trigger spin scenario) and 20 in INFERNO, which has no
zero-win book.

`tools/stake/demo.ts` picks books per payout bucket in proportion to the published probability (at
least one per non-empty bucket, all scenario books included), preferring books no larger than the
bucket's size quantile, weighs each P(bucket) / picks, then applies a one-parameter exponential tilt
so the pack RTP is 96.20%. Pack weights are integers (sum ~1e12); book ids are the published ids.
Result (`stake-math/demo.log`, rebuilt 2026-09-29 from this publish): BASE 1,540 books (2.64 MB),
BOOST 1,537 (2.75 MB), WITCHING 97 (1.72 MB), INFERNO 95 (2.88 MB), total 9.99 MB raw. Checked
against the publish: every pack book is byte-for-byte (as JSON) the published book with the same id,
its payout equals the CSV row, every scenario book is in its pack, and each pack's weighted RTP is
96.200% with the published hit rate (32.15% / 32.30% / 99.74% / 100.00%). Books with a bomb: 59 BASE,
88 BOOST, 76 of 97 WITCHING, 81 of 95 INFERNO. *Trade-off:* free-spin books are 13-60 KB each
(Blackpowder Raid books grew with the retune's longer cascades), so ~150 books per buy mode cannot
fit the ~9 MB budget; the tool shrinks the size quantile and then the buy count (to about 100 books
per buy mode). The final pack is 1 MB over the nominal budget because the buy count stops shrinking
at its floor.

## 6. Tests (`tests/math`, 79 tests)

Cluster detection (diagonals, 4 vs 5, wild bridging, a wild in two clusters, a real symbol required,
FS never bridges), lit multiplier products, ignition, 3x3 blasts in the middle / corners / edges,
FS spared and cold kegs ignited, chain order, blast-ignited kegs survive the step, spins do not
settle while a keg is lit, meter math, every wheel outcome (and wheel-only steps), multiplier
persistence in free spins vs reset in base, triggers 3/4/5/6, one FS per reel, retrigger +5, both
buys, the 50,000x cap ending the round, every Force field, and a full field-consistency replay of
every Step (clusters, removed, blasts, growth, fuse ticks, throws, moves, added, wheel placements ->
gridAfter and `bombs`; meter, multiplier and charge bookkeeping; unique ids) over ~2,000 rounds.

`bomb.test.ts` (28 tests): stickiness and gravity, bombs never bridging a cluster, fuse ticks and
the hot step, bombs that land mid-step not ticking, growth (+1 per keg explosion, chains counted,
capped, never from detonations or in the step a bomb detonates), 3x3 / 5x5 areas at every edge and
corner, FS spared and kegs lit by a detonation, clusters paying at `multBefore`, chains bomb -> keg,
keg -> bomb and bomb -> bomb in breadth-first root order, the charge threshold per mode (3 base and
free spins, 2 Boost) and the reset to 0, detonations never charging, charge and multiplier reset per
base spin and carried across free spins, the wheel bomb for every size, the end-of-sequence
detonation, spins always ending bomb-free, the natural rate and `bombCount`, the max-win cap reached
in a detonation step and after a detonation raised the multiplier, the book round trip of every bomb
field, and every dev scenario. `parity.test.ts`: record vs fast path identical results and RNG state
for 200,000 base seeds, 60,000 Boost seeds, both buys and bomb-forced rounds.

## 7. Math fix (2026-10-04): Powder Boost wheel, new seed

**The change (BOOST only).** The Powder Boost paid spin now has its own wheel, `BOOST_WHEEL`. It is the
base wheel with 1.5x the Kaboom wedges: bomb 2 / 3 / 5 goes from 6 / 3 / 1 to 9 / 4.5 / 1.5, which is
7.2% to 10.8% of wheel spins. The extra weight comes from the 2-keg Keg Drop (30 -> 28) and the 2x
Doubloons (24 -> 21), so the total weight (138.7) and every other wedge's odds stay the same. This
makes the rules line "On a boosted spin ... the Captain's Wheel carries more Kaboom wedges" true in the
math; before this change the Boost wheel was identical to the base wheel. The base game, both buys,
the paytable and every printed number are unchanged.

**Holding the natural RTP.** On a Boost spin, wheel outcomes are worth a lot more than their face value
because they feed the charge. Forced first-wheel values relative to a 2x Doubloons are about +10x / +17x
/ +23x for Kaboom 2 / 3 / 5 and +24x / +49x / +85x for Keg Drop 2 / 3 / 4. So 1.5x Kaboom paid for only
by Doubloons would have added about 2.8 points of RTP (doubling the Kaboom wedges: +5.6). The split
between the Keg Drop and the Doubloons was set with paired simulations: 80M Boost rounds, seed 7, same
seeds as the baseline. Natural Boost RTP went from 96.75% to 96.53% (-0.22 points, inside the noise).
The other figures: wheel bombs 0.0043 -> 0.0064 per spin, bombs 0.0993 -> 0.1009 per spin, 5x5 share
of detonations 8.6% -> 9.4%. Hit rate (32.29%) and wheels (1 in 31 spins) did not change. The wheel
only spins after wins, so it cannot move the hit rate.

**New publish.** `generate.ts --base 400000 --boost 400000 --witching 60000 --inferno 60000 --seed 1004`
regenerated every mode (`stake-math/generate.log`, 1 min 51 s). After it ran: `verify.ts --stats`
(PASS, `stake-math/verify.log` / `verify.json`, `src/stake/stats.json`), `scenarios.ts` and `demo.ts`
(BASE 1,541 / BOOST 1,539 / WITCHING 95 / INFERNO 95 books, 10.05 MB, each pack 96.200%). The dev
scenarios still build with their seeds. The seed-1 publish and its logs are kept in
`stake-math/before-mathfix/`.

| | BASE | BOOST | WITCHING | INFERNO |
|---|---|---|---|---|
| books (seed 1 -> 1004) | 401,362 -> 401,348 | 402,304 -> 402,309 | 60,159 -> 60,160 | 60,301 -> 60,252 |
| RTP | 96.2000% exact | 96.2000% exact | 96.2000% exact | 96.2000% exact |
| hit rate | 32.15% -> 32.09% | 32.30% -> 32.30% | 99.74% -> 99.75% | 100% -> 100% |
| sd (x base bet) | 44.00 -> 44.00 | 63.38 -> 62.96 | 731.1 -> 738.5 | 874.5 -> 849.3 |
| max win 50,000x | 1 in 5M | 1 in 2.5M | 1 in 40k | 1 in 60k |
| P(>= 5,000x) | 1.24e-5 -> 1.31e-5 | 1.62e-5 -> 1.70e-5 | 2.82e-3 -> 3.07e-3 | 5.09e-3 -> 4.69e-3 |
| P(>= 10,000x) | 2.67e-6 -> 2.01e-6 | 5.05e-6 -> 5.61e-6 | 1.14e-3 -> 1.01e-3 | 9.66e-4 -> 8.44e-4 |
| CVaR (x base bet) | 512.6 -> 528.3 | 752.5 -> 738.1 | 17,600 -> 17,600 | 15,962.7 -> 14,972.3 |
| ETL > 40x cost | 0.657 -> 0.654 | 0.660 -> 0.660 | 0.365 -> 0.369 | 0.011 -> 0.008 |
| natural RTP of the 400k / 60k sample, tilt KL | 93.60%, 5.6e-6 | 91.15%, 2.7e-7 | 101.72%, 8.9e-6 | 97.05%, 1.8e-7 |

Stake dashboard: 2-Star and 3-Star have 0 failing classes. The smallest 2-Star margin is 12.0% (base
sd 44.00 against 50, and WITCHING CVaR 17,600 against 20,000). Every mode's RTP is exactly 96.20%, and
no hit-rate range is empty in any mode.

