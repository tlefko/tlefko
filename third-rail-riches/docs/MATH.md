# Third Rail Riches: math model

Third Rail Riches is a subway-map slot with train-collect mechanics, built on the Powder Keg Cove
engine (static Stake Engine books + RGS). The rules, the model and the published math are new; only
the pipeline (generator, tilt, verifier, demo packs) is shared.

Code names kept from the engine: mode `WITCHING` = **Rush Hour** (buy 100x), `INFERNO` = **Last
Train** (buy 400x), `BOOST` = **Express Pass** (1.5x spin). Bonus kinds are `rush` and `last`.

| File | Purpose |
|---|---|
| `src/math/network.ts` | The map: 4 lines, 19 stations, kinds (terminal / interchange / stop), neighbours |
| `src/math/types.ts` | Engine/renderer contract (rules summary, SpinResult / Train / Crash / RouteWin) |
| `src/math/paytable.ts` | Route paytable (by run length 3-7), integer hundredths `PAY_H` |
| `src/math/model.ts` | Parameter sets base / boost / rush / last, coin values, bonus constants |
| `src/math/engine.ts` | `playRound`, `evalRoutes`, `runTrains` |
| `src/stake/book.ts` | Book format (`g` symbol ids + `v` coin values per spin, trains, crashes), `roundToBook` / `bookToRound` |
| `tests/math/engine.test.ts`, `tests/stake/book.test.ts` | Rules, routing, crashes, security, sticky coins, power, cap, parity, book round trip |
| `tools/sim/cli.ts` | Monte Carlo (`--kind all --rounds 2e6 --knobs JSON --force JSON`) |
| `tools/stake/*` | Generator, tilt, verifier, scenarios, demo packs |

All money is in bet multiples on a 0.01x grid; the engine adds in integer hundredths.

## 1. Rules as implemented

**The map.** Four lines: Red (stations 0-6, west to east), Blue (7-13), Green (14, 2, 15, 11, 16)
and Gold (17, 4, 15, 9, 18). 19 stations: 8 **terminals** (line ends), 5 **interchanges** (2, 4,
9, 11 and Grand Junction 15) and 6 **stops**. Two stations are **neighbours** when they are next to
each other on any line.

**Route wins.** For every line and every paying symbol s (L1..TOP), every maximal run of
consecutive stations along the line holding s or a Live Wire (WILD), containing at least one s and
3 or more long, pays `PAYTABLE[s][run - 3]`. Runs can start anywhere on the line; an interchange
counts for both of its lines; every run pays.

**Trains.** Every LOCO on a terminal is a train that departs along its line away from that end.
All trains move one station per beat. Per beat, before anyone moves, collisions are found:

- two trains entering the same station,
- two trains swapping stations (head-on between them),
- a train entering the station where a train is waiting at a cleared Security Check.

Colliding trains (and everything chained to them that beat) form a **crash**. Every other train
enters its station: a COIN there that is not collected yet is collected (its value goes to the
train's haul); then

- **SIGNAL** (interchanges only), not yet taken by this train: the train switches to the crossing
  line, heading towards the end with more stations ahead (ties: forward along the line's order);
- **SECURITY** (stops only): with probability `clear` **ALL CLEAR**: the train waits one beat and its
  **repay** multiplier doubles (x2, x4, ...); otherwise **INCIDENT**: the train is held and stops.

A train that runs off the end of its line has arrived. **Crash pile** = the crashed trains' hauls x
their repay, plus every uncollected COIN at the crash station(s) and their neighbours (the wreck);
the crash pays pile x 2 (`CRASH_MULT`). **Train payout** = trains not in a crash (haul x repay) +
crash pays; **train win** = train payout x the POWER multiplier (x1 in the base game). A coin is
collected at most once (by a train or a wreck).

**Paid spin.** Tickets (FS): k from `fsDist` on k distinct non-terminal stations. Every other station
independently: terminal = LOCO with probability `loco`, interchange = SIGNAL with `signal`, stop =
SECURITY with `security`; otherwise WILD `wild`, COIN `coin`, else a paying symbol from `pay`. Coin
values from `coinWeights` over `COIN_VALUES = 0.2 0.5 1 2 3 5 10 15 25 50 100 250 500 1000`.
Express Pass (`minLoco: 1`): if no terminal has a LOCO, one replaces a random terminal's paying
symbol.

**Rush Hour** (3/4/5/6 tickets on the paid spin: 8/10/12/15 spins). Uncollected coins are sticky
(held, same id and value) until a train or a wreck collects them; held stations do not flip. Every
collected coin adds 1 passenger to POWER. Levels at 5 / 12 / 22 / 35 passengers give train
multipliers x2 / x3 / x5 / x10 from the next spin and +3 spins each. 3+ tickets on a free spin add
+5 spins. Route wins are never multiplied.

**Last Train** (buy 400x): a trigger spin forced to 3 tickets (its win counts), then 10 free spins
with POWER starting at 5 (x2) and a Golden Locomotive held on one random terminal every spin.

**Buy Rush Hour** (100x): trigger spin with 3/4/5 tickets weighted 80/16/4.

**Max win.** 10,000x per round in every mode, checked after every spin; the round ends at exactly
10,000x.

## 2. Paytable (per run, bet multiples)

| Symbol | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|
| L1 pretzel | 0.20 | 0.60 | 2 | 6 | 15 |
| L2 coffee cup | 0.30 | 0.80 | 2.50 | 7 | 20 |
| L3 newspaper | 0.40 | 1 | 3 | 8 | 25 |
| L4 umbrella | 0.50 | 1.20 | 3.50 | 9 | 30 |
| H4 pigeon | 1 | 2.50 | 6 | 15 | 50 |
| H3 alley cat | 1.20 | 3 | 8 | 20 | 60 |
| H2 Officer Bulldog | 1.50 | 4 | 10 | 30 | 100 |
| H1 Rivets | 2 | 5 | 15 | 50 | 150 |
| TOP Conductor Casey | 3 | 8 | 25 | 80 | 300 |

Runs of 6 and 7 exist only on the Red and Blue lines (7 stations); Green and Gold have 5.

## 3. Parameters (`src/math/model.ts`)

| Set | loco | signal | security | P(clear) | wild | coin | tickets 3+ |
|---|---|---|---|---|---|---|---|
| base | 0.05 | 0.12 | 0.08 | 0.50 | 0.04 | 0.095 | ~1 in 220 |
| boost | 0.06 + min 1 | 0.12 | 0.08 | 0.50 | 0.04 | 0.10 | ~1 in 220 |
| rush | 0.165 | 0.15 | 0.10 | 0.55 | 0.03 | 0.127 | retrigger |
| last | 0.122 | 0.15 | 0.10 | 0.55 | 0.03 | 0.12 | retrigger |

Paying-symbol weights: base / boost `0.25 0.18 0.13 0.09 0.12 0.09 0.07 0.04 0.03` (L1..TOP); rush /
last `payWeights(0.6, 0.85, 0.75)`. Coin weights per set are in the file.

Design notes. A locomotive appears in about a third of base spins; a crash about 1 spin in 52 in the
base game and about 1 free spin in 4 in Last Train. Security Checks stop a train in about 1 base
spin in 22, half of them clearing. The base game hits about 40% (route wins carry the small hits,
trains the medium ones); the bonus carries the volatility (sticky coins, a POWER ladder to x10,
crashes multiplying the haul again).

## 4. Natural game (engine, unweighted; `tools/sim/cli.ts`, seed 7)

| | BASE | BOOST (1.5x) | Rush Hour (100x) | Last Train (400x) |
|---|---|---|---|---|
| RTP | 98.4% (2M) | 96.8% (2M) | 97.7% (200k buys) | 96.7% (200k buys) |
| hit rate | 39.8% | 60.4% | 99.7% | 100% |
| sd (x bet) | 11.5 | 12.7 | 141 | 391 |
| bonus | 1 in 220, avg 94x, 13.2 spins | same trigger | 13.6 spins | 15.5 spins |
| P(>= 1,000x) | 1 in 69k | 1 in 91k | 1 in 351 | 1 in 19 |
| P(>= 10,000x) | | | 1 in 200k | 1 in 15k |

## 5. Stake Engine files (`stake-math/publish/`)

`tools/stake/generate.ts --base 400000 --boost 400000 --witching 60000 --inferno 60000 --seed 1`:
natural books, a stratified tail sample (BASE/BOOST 12M rounds >= 500x; WITCHING 600k >= 2,000x;
INFERNO 600k >= 5,000x), gap fill (a Stake hit-rate range below the cap that no book reached gets up
to 3 searched books from legitimate rounds at a token probability), max-win books, then the min-KL
tilt to RTP exactly 96.30% (`10 * costDen * sum(w * pay) == 963 * costNum * sum(w)`) under the
2-Star dashboard limits with headroom, BASE hit rate 38-55%.

The verified figures (`tools/stake/verify.ts`) are in `stake-math/verify.log` and `src/stake/stats.json`.
