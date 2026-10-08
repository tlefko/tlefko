# Kaboom Bomb and Powder Boost: engine contract

Owner: track M. Field names live in `src/math/types.ts`; this file says what every field means,
when it fires and in what order, and lists the player-facing numbers and the dev hooks. If this
file and `docs/POLISH.md` disagree, this file wins.

**Status (2026-09-29):** final. Rules, field names, hooks and every number below are what the
published math (`stake-math/publish`) and the demo packs use.

## 1. Rules (exact)

Grid: 6 reels x 5 rows, cell index `pos = reel * 5 + row`, row 0 at the top (unchanged).

- **Symbol.** `Sym.BOMB = 11`. It never pays, is not wild and never joins or bridges a cluster. It is
  sticky: wins never remove it, it only leaves the board by detonating. It falls with gravity like
  any symbol that survives a step.
- **State.** Every bomb cell carries `size` (the multiplier it will add, `BOMB_START_SIZE = 1` for
  natural and charge bombs) and `fuse` (cascade steps left, `BOMB_FUSE = 3` on landing). `fuse = 0`
  means **hot**: it detonates in the next step.
- **Natural.** A spin's initial drop holds 0 or 1 bomb (`bombRate` per parameter set, section 6), on
  a random cell that is not a scatter or a keg. Refills never produce bombs.
- **Charge (thrown).** `charge` counts Powder Keg explosions (chain explosions count; bomb
  detonations do not). When a step's explosions bring it to `CHARGE_MAX` (3; `CHARGE_MAX_BOOST = 2`
  on a Powder Boost spin) or more, Cap'n Kaboom throws one bomb into that step's refill and the
  charge resets to 0 (explosions past the threshold in that step are spent: at most one charge
  throw per step). The bomb lands on a uniformly random empty cell after gravity; the refill fills
  the other cells.
- **Wheel.** New Captain's Wheel outcome `{ kind: 'bomb', size }` with size 2, 3 or 5: Cap'n Kaboom
  throws a bomb of that size onto a random cell holding a paying symbol (it replaces that symbol).
- **Growth.** After a step's blasts, every bomb still on the board gains +1 size per keg explosion in
  that step, capped at `BOMB_MAX_SIZE = 5`. Bomb detonations never grow bombs. A bomb that
  detonates in a step does not grow from that step's keg explosions.
- **Fuse.** Every step (any kind of step) ticks the fuse of every bomb still on the board after that
  step's blasts down by 1. Bombs that landed during the step (charge or wheel) are not ticked.
- **Detonation.** A bomb detonates (a) in the blast phase of the first step that begins with its
  fuse at 0 (`cause: 'fuse'`), (b) when a keg explosion or another detonation catches it
  (`cause: 'chain'`), or (c) on the end-of-sequence step (`cause: 'end'`): when the cascade would
  end (no win, no lit keg, no hot bomb, meter below 10) and bombs are left, one more step runs in
  which every bomb detonates. A spin therefore always ends with no bomb on the board (except when
  the round hits the 50,000x cap, which ends everything at once).
- **Blast.** A bomb of size 1-2 clears the 3x3 square around it; size 3 or more (`BOMB_BIG_SIZE`)
  clears the 5x5 square (both clipped at the grid edge; `blastArea(pos, radius)` lists the cells).
  In the area: paying symbols vanish without paying, scatters are spared, cold kegs light (they
  stay and explode next step), lit kegs explode, other bombs detonate. Then the plunder multiplier
  gains `+size` and the Powder Fuse meter `+2` (`BLAST_SPARKS`), exactly like a keg's `+2`.
- **Multiplier timing.** A step's clusters pay at the multiplier the step began with
  (`multBefore`); detonations raise it for the next step on (`multAfter`).
- **Carry-over.** Base game (and Powder Boost): meter, multiplier and charge start at 0 / x1 / 0
  every paid spin. Free spins: all three carry from spin to spin for the whole bonus (and start at
  0 / x1 / 0, or 5 / x5 / 0 for Blackpowder Raid).
- **Powder Boost.** Mode `BOOST`, round kind `'boost'`, cost `BOOST_COST = 1.5` x bet. The paid spin
  uses the `boost` parameter set, which is the base set with exactly three changes: charge max 2,
  natural bombs 1.5x as often and, since 2026-10-04, 1.5x the Kaboom wedges on the wheel
  (`BOOST_WHEEL`). Free spins won on a Boost spin are the normal Moonlight Raid. Hidden
  where `jurisdiction.disabledBuyFeature` is set.
- **Max win** stays 50,000x the bet in every mode (for BOOST: 50,000x the base bet).

## 2. One step, in order (what G animates)

1. **Pay** every cluster at `multBefore` (`clusters`, `stepWin`). Bombs never take part.
2. **Ignite** cold kegs that joined a win (`ignited`).
3. **Remove** winning non-wild cells (`removed`).
4. **Blasts** (`explosions`, one ordered list for kegs and bombs). Roots are, in ascending position
   order: every keg that was lit when the step began, and every bomb whose fuse was 0 when the step
   began (on the end-of-sequence step: every bomb). Each root's chain is processed breadth-first
   before the next root. An entry with `bomb` is a detonation; without it, a keg explosion.
5. `meterAfter = meterBefore + clusters + 2 x explosions.length`; `multAfter = multBefore + sum of
   detonated sizes`; the charge gains one per keg explosion.
6. **Growth** (`growth`), then the **fuse tick** of every bomb left (no field: read `bombs`).
7. **Gravity** (`moves`, bombs included). The **charge throw**, if the charge filled (at most one
   `thrown` entry with `source: 'charge'`), lands in an empty cell, then the **refill** (`added`)
   fills the rest.
8. **Wheel** if the meter is 10+ (`wheel`); a bomb outcome adds a `thrown` entry with `source:
   'wheel'` after the charge throw.

`bombs` is the state after all of that (the board the next step starts from). `finale: true` marks
the end-of-sequence step: it has no clusters and no lit keg, so every blast in it is a bomb (cause
`end`, or `chain` when another bomb's blast caught it first); cold kegs in those blasts light up and
explode in the next step.

## 3. Fields

### Cell (`initial`, `gridAfter`, `finalGrid`, `added[].cell`, `thrown[].cell`)

| Field | Meaning |
|---|---|
| `sym: 11` | Kaboom Bomb |
| `size` | multiplier it adds when it detonates (1..5) |
| `fuse` | steps left (3 on landing; 0 = hot, detonates in the next step) |

### Step additions

| Field | Type | Meaning |
|---|---|---|
| `explosions[i].bomb` | `{ size, radius, cause }` | present when blast `i` is a bomb: size = multiplier added, radius 1 (3x3) or 2 (5x5), cause `'fuse' \| 'end' \| 'chain'` |
| `explosions[i].cleared` | `Pos[]` | its own cell first, then every paying symbol removed (never scatters, kegs or bombs) |
| `explosions[i].ignited` | `id[]` | cold kegs it lit (they stay lit and explode next step) |
| `explosions[i].chain` | `id[]` | lit kegs and bombs it caught; each has its own entry later in `explosions` |
| `growth` | `{ id, pos, from, to }[]` | bombs that grew after the blasts (`pos` = position during the blast phase, before gravity) |
| `thrown` | `{ source, cell, pos, replacedId }[]` | bombs that landed this step (0-2): the charge throw first (`replacedId: -1`, empty refill slot), then the wheel's bomb (`replacedId` = the paying symbol it replaced) |
| `bombs` | `{ id, pos, size, fuse }[]` | every bomb on the board at the end of the step, position order |
| `chargeBefore`, `chargeAfter` | number | charge when the step began / after its keg explosions and throw (0 after a throw; `0 <= chargeAfter < chargeMax`) |
| `multBefore`, `multAfter` | number | plunder multiplier this step's clusters paid at / after its detonations (before the wheel; `wheel.multAfter` is after it, and `wheel.multBefore === multAfter`) |
| `finale` | `true` or absent | the end-of-sequence step |
| `added` | | refills only; a charge-thrown bomb is in `thrown`, never in `added`. `spawnRow = row - (empty cells in the reel before the throw)` |
| `wheel.placed` | | kegs only (hounds / inferno); a wheel bomb is in `thrown` |

### SpinResult additions

| Field | Meaning |
|---|---|
| `chargeMax` | 3, or 2 on a Powder Boost paid spin |
| `chargeStart`, `chargeEnd` | charge at the start / end of the spin (free spins: `chargeStart` = previous `chargeEnd`) |
| `multStart`, `multEnd` | unchanged meaning; bombs now move them too |

`RoundKind` gains `'boost'` (`COST.boost = 1.5`); `StakeMode` gains `'BOOST'`
(`MODE_COST.BOOST = 1.5`). `WheelOutcome` gains `{ kind: 'bomb'; size: number }`.

### Books

`roundToBook` leaves `growth`, `thrown` and `bombs` out of a step when they are empty (and never
writes `gridAfter` / `finalGrid`); `bookToRound` restores them as empty arrays, so presenter code can
always read `step.thrown`, `step.growth`, `step.bombs`. Books made before the bomb existed also load
(charge 0, multiplier bookkeeping rebuilt).

## 4. Presentation notes (for G, C, H)

- Show the bomb's `size` and `fuse` badges from the cell; update fuse after each step's blasts
  (compare with `bombs`), size on `growth`, and swap to the `hot` art when `fuse === 0`.
- Blast radius: `bomb.radius` (or `bombRadius(size)`); `blastArea(pos, radius)` gives the square for
  an outline or shockwave before the boom. `cleared` is what actually flies away.
- The multiplier badge steps from `multBefore` by each detonation's `size` in blast order and ends at
  `multAfter`.
- Charge pips: `chargeBefore` + one per keg entry in `explosions`, capped at `chargeMax`; when they
  reach it the captain throws (the `thrown` entry with source `charge`) and the pips empty
  (`chargeAfter` is 0). `captain.setCharge(value, max)` with `max = spin.chargeMax`.
- A charge throw lands during the refill (`pos` is an empty cell after gravity); a wheel bomb lands
  after the wheel reveal on a cell that holds a paying symbol (`replacedId`).
- End-of-sequence step: every remaining bomb goes off at once (`finale`), after which the board
  refills and the cascade may continue (more steps can follow a finale).

## 5. Dev hooks (demo build, `?debug`)

`window.__ll.ctrl.devBomb(name)` builds the scenario with the real engine and plays it at once in
its own mode (it returns `{ name, mode, id, payoutMultiplier, note }`, or `null` while a round is
running). `window.__ll.rgs.bomb(name)` only queues it: the next play in that mode uses it (spin for
BASE, `ctrl.setBoost(true)` then spin for BOOST, the Moonlight Raid buy for WITCHING).
`window.__ll.rgs.bombScenarios()` lists `{ name, mode, note }`. The same name always gives the same
round. Scenario book ids are 900001 and up.

| name | mode | what happens |
|---|---|---|
| `natural` | BASE | a natural bomb on the drop, no win: end-of-sequence detonation (3x3, x2), the refill pays |
| `thrown` | BASE | three kegs light in one win and explode together next step: charge 3, a bomb is thrown into the refill |
| `wheel` | BASE | the meter fills, the wheel lands on a size-3 bomb (thrown after the wheel; 5x5 later) |
| `growth` | BASE | a bomb sits while three kegs explode: it grows 1 to 4, then goes off with a thrown one |
| `fuse` | BASE | a fuse-1 bomb and a win: the fuse ticks to 0 (hot), it detonates next step (cause `fuse`) |
| `countdown` | BASE | a fresh bomb counts 3, 2, 1, 0 through a cascade of 4+ steps and detonates by its fuse |
| `small` | BASE | a hot size-1 bomb: 3x3, x2 |
| `big` | BASE | a hot size-5 bomb in the middle: 5x5, +5 |
| `edge` | BASE | a size-4 bomb in a corner and a size-1 in the opposite corner: clipped squares |
| `bombKeg` | BASE | bomb to keg: a keg lights in a win and the hot bomb beside it makes it explode; a cold keg in the blast lights for the next step |
| `kegBomb` | BASE | keg to bomb: a lit keg explodes and sets off the bomb beside it (cause `chain`) |
| `bombBomb` | BASE | bomb to bomb: a hot size-1 bomb catches a size-3 bomb (5x5) |
| `megaChain` | BASE | lit keg, bomb, two kegs, bomb: one chain, multiplier +3 |
| `finale` | BASE | two bombs, no win: both detonate on the end-of-sequence step and the refill pays |
| `cap` | BASE | the 50,000x cap is reached in the step where a hot bomb detonates; the round ends there |
| `freeSpins` | WITCHING | Moonlight Raid with several bombs; charge and multiplier carry between spins |
| `boost` | BOOST | Powder Boost: two keg explosions fill the charge (max 2) and a bomb is thrown |
| `boostNatural` | BOOST | a natural Powder Boost spin with a natural bomb and a win |

`window.__ll.forceBook(id)` still forces a book from the demo pack by id; the regenerated packs
contain natural bomb and boost rounds (the soak finds them by content, `tools/qa/soak.mjs`).

Controller API for H: `ctrl.boost`, `ctrl.boostAllowed`, `ctrl.setBoost(on)` (ignored while a round
runs), `ctrl.spinMode` (`'BASE' | 'BOOST'`), `ctrl.spinCostApi` (bet or bet x 1.5, API units).
The Controller calls `hud.setBoost(on, allowed)` (optional method) at start, in replay and after
every `setBoost`.

## 6. Player-facing numbers

| Number | Value |
|---|---|
| Fuse on landing | 3 steps (hot at 0, detonates in the next step) |
| Charge to throw | 3 keg explosions (2 with Powder Boost); the charge then resets to 0 |
| Start size | 1 (natural and thrown); wheel bombs 2, 3 or 5 |
| Growth | +1 per Powder Keg explosion while on the board, up to 5 |
| Blast | size 1-2: 3x3; size 3-5: 5x5 |
| Detonation | multiplier +size, fuse meter +2 |
| Powder Boost cost | 1.5x bet |

Per-mode rates (final; `src/math/model.ts`):

| Parameter set | natural bomb per drop | wheel: bomb 2 / 3 / 5 (share of wheel spins) | charge to throw |
|---|---|---|---|
| base game | 1.5% (1 drop in 67) | 4.33% / 2.16% / 0.72% (7.2% of wheels) | 3 |
| Powder Boost | 2.25% (1 in 44; 1.5x base) | 6.49% / 3.24% / 1.08% (10.8% of wheels; since 2026-10-04) | 2 |
| Moonlight Raid free spins | 9% (1 in 11) | 14.7% / 7.3% / 1.0% (23.0%) | 3 |
| Blackpowder Raid free spins | 1% (1 in 100) | 4.55% / 2.28% / none (6.8%) | 3 |

Everything else about a Powder Boost spin (symbols, kegs, scatters) is identical to a base spin. Its
wheel (`BOOST_WHEEL`, 2026-10-04) is the base wheel with the Kaboom wedges at 9 / 4.5 / 1.5 instead of
6 / 3 / 1, paid for by the 2-keg Keg Drop (30 -> 28) and the 2x Doubloons (24 -> 21): same total
weight, every other wedge unchanged, natural Boost RTP held (`docs/MATH.md` section 7). How often bombs show up and what they do is in `docs/MATH.md` section 4.

Blackpowder Raid (retuned 2026-09-29 for Stake's 2-Star risk limits, `docs/MATH.md` section 5): its
wheel has no size-5 bomb and no +5 grog, and the Broadside is a token outcome (0.008% of its wheel
spins, about 1 in 13,000); bombs per bonus stay at about 5.
