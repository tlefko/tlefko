# Third Rail Riches: math model

Third Rail Riches is a 6x4 ways slot with train-collect mechanics, built on the Powder Keg Cove
engine (static Stake Engine books + RGS). The rules, the model and the published math are new; only
the pipeline (generator, tilt, verifier, demo packs) is shared.

Code names kept from the engine: mode `WITCHING` = **Rush Hour** (buy 100x), `INFERNO` = **Last
Train** (buy 400x), `BOOST` = **Express Pass** (1.5x spin). Bonus kinds are `rush` and `last`.

| File | Purpose |
|---|---|
| `src/math/types.ts` | Engine/renderer contract (rules summary, SpinResult / Train / WayWin) |
| `src/math/paytable.ts` | Ways paytable (per way, by reels 3-6), integer hundredths `PAY_H` |
| `src/math/model.ts` | Parameter sets base / boost / rush / last, coin values, bonus constants |
| `src/math/engine.ts` | `playRound`, `evalWays`, `runTrains` |
| `src/stake/book.ts` | Book format (`g` symbol ids + `v` coin values per spin), `roundToBook` / `bookToRound` |
| `tests/math/engine.test.ts`, `tests/stake/book.test.ts` | Rules, routing, sticky coins, power, cap, parity, book round trip |
| `tools/sim/cli.ts` | Monte Carlo (`--kind all --rounds 2e6 --knobs JSON --force JSON`) |
| `tools/stake/*` | Generator, tilt, verifier, scenarios, demo packs (as in Powder Keg Cove) |

All money is in bet multiples on a 0.01x grid; the engine adds in integer hundredths.

## 1. Rules as implemented

**Grid.** 6 reels x 4 rows, cell index `reel * 4 + row`, row 0 at the top. No cascades.

**Ways.** For each paying symbol s (L1..TOP) count the cells on each reel holding s or a Live Wire
(WILD; reels 2-6 only). Reading from reel 1, stop at the first reel with a count of 0. With 3 or more
reels, pay `PAYTABLE[s][reels - 3] x product(counts)`. Every symbol pays its one longest way win.

**Trains.** Every LOCO on reel 1 (row order) is a train in its row. All trains move right together,
one column per beat. Per column: every running train enters the column first (a train whose cell
ahead was already run stops); then each train standing on a SWITCH (Junction) sends branch trains
into the row above and below, in the same column, if those cells are not run yet; a branch entering
a SWITCH branches again (recursively). Entering a cell with a COIN collects its value. Every cell is
run at most once, so a coin is collected at most once. Haul = sum of collected values; train win =
haul x train multiplier (x1 in the base game).

**Paid spin.** Tickets (FS): k from `fsDist` on k distinct reels, random free row. Every other cell
independently: reel 1 = LOCO with probability `loco`, else a paying symbol; reels 2-5 = WILD / COIN
/ SWITCH / paying; reel 6 = WILD / COIN / paying. Coin values from `coinWeights` over
`COIN_VALUES = 0.2 0.5 1 2 3 5 10 15 25 50 100 250 500 1000`. Express Pass (`minLoco: 1`): if reel 1
has no LOCO, one replaces a random reel-1 paying symbol.

**Rush Hour** (3/4/5/6 tickets on the paid spin: 8/10/12/15 spins). Uncollected coins are sticky
(held, same id and value) until a train collects them; held cells do not spin. Every collected coin
adds 1 passenger to POWER. Levels at 5 / 12 / 22 / 35 passengers give train multipliers x2 / x3 / x5 /
x10 from the next spin and +3 spins each. 3+ tickets on a free spin add +5 spins. Way wins are never
multiplied.

**Last Train** (buy 400x): a trigger spin forced to 3 tickets (its win counts), then 10 free spins
with POWER starting at 5 (x2) and a Golden Locomotive held on reel 1 in a random row every spin.

**Buy Rush Hour** (100x): trigger spin with 3/4/5 tickets weighted 80/16/4.

**Max win.** 10,000x per round in every mode, checked after every spin; the round ends at exactly
10,000x.

## 2. Paytable (per way, bet multiples)

| Symbol | 3 | 4 | 5 | 6 |
|---|---|---|---|---|
| L1 pretzel | 0.05 | 0.10 | 0.20 | 0.40 |
| L2 coffee cup | 0.05 | 0.10 | 0.25 | 0.50 |
| L3 newspaper | 0.05 | 0.15 | 0.30 | 0.60 |
| L4 umbrella | 0.10 | 0.15 | 0.40 | 0.80 |
| H4 pigeon | 0.10 | 0.25 | 0.60 | 1.50 |
| H3 alley cat | 0.15 | 0.30 | 0.80 | 2.00 |
| H2 Officer Bulldog | 0.20 | 0.40 | 1.00 | 3.00 |
| H1 Rivets | 0.25 | 0.60 | 1.50 | 5.00 |
| TOP Conductor Casey | 0.40 | 1.00 | 3.00 | 10.00 |

## 3. Parameters (`src/math/model.ts`)

| Set | low share | loco | wild | coin | switch | tickets 3+ | coin weights (0.2 .. 1000) |
|---|---|---|---|---|---|---|---|
| base | 0.50 | 0.035 | 0.025 | 0.09 | 0.025 | ~1 in 200 | 30 26 18 10 6 4 2.4 1.2 .6 .2 .05 .01 0 0 |
| boost | 0.50 | 0.035 + min 1 | 0.025 | 0.09 | 0.025 | ~1 in 200 | 36 28 17 8 4.5 3 1.8 .9 .45 .15 .04 .008 0 0 |
| rush | 0.50 | 0.16 | 0.025 | 0.10 | 0.035 | retrigger | 10 20 20 16 10 8 5 2.5 1.2 .5 .12 .04 .01 .003 |
| last | 0.50 | 0.16 | 0.025 | 0.10 | 0.035 | retrigger | 6 13 17 18 13 11 8.5 4.6 2.3 1.1 .28 .09 .018 .005 |

Design notes. A 6x5 ways board hit 65% (mostly sub-bet wins), so the board is 6x4 (4,096 ways).
The bonus carries the volatility: sticky coins pile up and locomotives in the free spins land at
0.16 per reel-1 cell (~50% of spins have one). Express Pass is priced by a guaranteed locomotive and
lighter coin weights. Max win was set to 10,000x after measuring the bonus tail: a doubling power
ladder could not make 25,000x honestly reachable.

## 4. Natural game (engine, unweighted; `tools/sim/cli.ts`, seed 7)

| | BASE | BOOST (1.5x) | Rush Hour (100x) | Last Train (400x) |
|---|---|---|---|---|
| RTP | 96.15% (1M) | 96.07% (1M) | 96.02% (1M buys) | 95.64% (1M buys) |
| hit rate | 48.5% | 64.4% | 99.95% | 100% |
| sd (x bet) | 11.7 | 12.0 | 140 | 382 |
| bonus | 1 in 201, avg 92.6x, 13.3 spins | same trigger | 13.6 spins | 16.0 spins |
| paid spin parts | ways 0.38, trains 0.12 | ways 0.30, trains 0.85 | | |
| P(>= 1,000x) | 1 in 71k | 1 in 77k | 1 in 347 | 1 in 18 |
| P(>= 10,000x) | | | 1 in 333k | 1 in 17.5k |

## 5. Stake Engine files (`stake-math/publish/`)

`tools/stake/generate.ts --base 400000 --boost 400000 --witching 60000 --inferno 60000 --seed 1`:
natural books, a stratified tail sample (BASE/BOOST 12M rounds >= 500x; WITCHING 600k >= 2,000x;
INFERNO 600k >= 5,000x), **gap fill** (a Stake hit-rate range below the cap that no book reached gets
up to 3 searched books from legitimate rounds — BASE/BOOST forced to 6 tickets — at a token
probability), max-win books (BASE/BOOST searched with 6 tickets; buys natural), then the min-KL tilt
to RTP exactly 96.30% (`10 * costDen * sum(w * pay) == 963 * costNum * sum(w)`) under the 2-Star
dashboard limits with headroom.

### Verified (`tools/stake/verify.ts`, PASS)

| | BASE | BOOST | WITCHING | INFERNO |
|---|---|---|---|---|
| cost | 1 | 1.5 | 100 | 400 |
| books | 400,865 | 400,872 | 60,276 | 60,309 |
| RTP | 96.3000% exact | 96.3000% exact | 96.3000% exact | 96.3000% exact |
| hit rate | 48.38% | 64.37% | 99.95% | 100% |
| sd (x base bet) | 11.67 | 12.49 | 143.5 | 386.6 |
| max win 10,000x | 1 in 20M | 1 in 20M | 1 in 300k | 1 in 20k |
| CVaR (x base bet) | 268.8 | 277.2 | 2,340.6 | 5,174.3 |
| books file | 16.3 MB | 17.1 MB | 38.2 MB | 47.1 MB |

Stake dashboard: 0 failing 2-Star classes, 0 failing 3-Star classes, every 2-Star check with >= 10%
margin; no empty hit-rate range from the smallest payout to the max win in any mode.
