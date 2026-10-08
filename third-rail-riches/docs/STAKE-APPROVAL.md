# Stake Engine approval issues (raised 2026-09-29): status for Powder Keg Cove

Stake raised these issues on Lucifer's Lullaby, which uses the same engine. Tyler asked for every one
to be resolved in Powder Keg Cove only; Lucifer is frozen in the approval queue. Each item lists the
fix and how it was verified. Sources: Stake's public docs (jurisdiction requirements, bet replay,
RGS and front-end communication, math verification) and the support tickets.

| # | Stake issue | Fix | Owner | Status |
|---|---|---|---|---|
| 1 | Bet on refresh: default bet level when there is no active or pending round; an active round uses its authenticate bet, displayed exactly, and continues | `Controller.start`: an active round keeps `round.amount` exactly (even off the level list) and resumes; otherwise the bet is `defaultBetLevel`. The saved bet was removed. After a resumed off-level round, the bet returns to a valid level. | lead + P | Done. P renamed the leftover settings key to `powder-keg-cove.settings.v1` and strips any stored bet; the unused legacy `Wallet.ts` (which saved a bet index) was deleted. Verified: reload resets $2.00 to the $1.00 default. Fake authenticate responses cover no round, a finished round (both default), an active round on a level (its bet) and an active round off level ($1.23, shown exactly); all resume correctly. |
| 2 | Balance at 2 decimals, bet levels at 2 decimals, wins with enough decimals for the full win | `money.ts`: `fmtApi` always shows 2 decimals in every currency, matching Stake's web-sdk (yen, won, rupiah, dong and pesos used to show 0). `fmtWin` shows at least 2 decimals and up to 6 as needed, never rounded. All win displays use `fmtWin` (ctx.fmt, HUD win, history, paytable). | lead + H | money and Controller done. HUD and history adopted. Paytable pending (H). |
| 3a | Symbol payouts displayed correctly in all versions | The paytable used 2-decimal formatting, so small payouts were rounded (0.015 showed 0.02). Both layouts (desktop table, mobile cards) switch to `fmtWin`, then get checked value by value against `paytable.ts` x bet in normal and social modes, several languages and currencies. | H | pending |
| 3b | Win and play amounts can overlap | HUD layout never lets the win meter and bet meter intersect, at any viewport, with worst-case strings. The layout gate (P) now pushes worst-case values through the real HUD setters and fails on any overlap; it reproduces the bug at 844x390 (win x bet) and 480x270 (balance x bet). | H + P | Gate done (P). HUD fix pending (H). |
| 4 | Restricted words (Stake.us) | Stake's full list is applied to every social-mode string. SOCIAL_EN overrides cover every key with a restricted term or inflection (pay, paying, payout, paytable, cost(s), and so on). Social wording now works in every language (locale `_social` blocks, falling back to SOCIAL_EN). The static boot tips are reworded. Scanner: `scratchpad/restricted.ts` must print "clean". | lead + H + S | English is clean: a stem scan of every social string (pay*, bet*, buy*, cost*, cash*, credit*, fund*, gambl*, and so on) finds none. The boot tips were reworded (S). Locale `_social` blocks for the 15 other languages come in the final translation pass; until then those keys fall back to the clean English social text. |
| 5 | Replay mode per the checklist; Stake.us wording Base Play / Feature Multiplier / Final Multiplier | Controller.replay passes labelled results: Base Bet, Cost Multiplier, Total Bet, Payout Multiplier, Win (social: Base Play, Feature Multiplier, Total Play, Final Multiplier). The HUD shows them in a clear panel before, during and after, with Play / Play Again. Betting UI is hidden, there are no session calls, and there is no path to normal play. | lead + H | Data and labels done; verified text in normal and social replays for WITCHING and BOOST. Panel pending (H). |
| 6 | Does an x2 block's blast set off other blocks? If intended, explain in detail | Intended. The rules get a step-by-step explanation of keg chains (cold kegs in a blast light up, lit kegs explode at once, the chain continues) with an illustrated diagram, plus the same for Kaboom Bombs. | H | pending |
| 7 | Math: RTP per mode, max win, Stake dashboard risk checks (Lucifer v1 failed 2-Star tail probability and CVaR in INFERNO) | Blackpowder Raid (INFERNO) retuned so its value comes from steady cascades instead of the jackpot-grade Broadside; weights tilted inside every 2-Star limit with >= 10% headroom; `tools/stake/verify.ts` runs every dashboard check at both tiers. See "Math" below. | M | Done 2026-09-29. `verify.ts` PASS: RTP 96.2000% exact in all four modes, 0 failing classes at 2-Star and 3-Star, no empty hit-rate range up to the max win. Demo packs rebuilt from the same publish; soak 58/58. Three open decisions below. |

Replay test URL (local demo): `/?replay=true&game=pkc&version=1&mode=WITCHING&event=3&amount=2000000&currency=USD` (add
`&social=true` for Stake.us wording).

## Math (item 7): what Stake's reviewers check, and where it is

Background: Stake's dashboard for Lucifer v1 (2026-09-29) found its statistics valid but failed two
non-critical classes at 2-Star, both in INFERNO: tail probability (P(>= 5,000x) 0.0171 vs 0.010,
P(>= 10,000x) 0.0072 vs 0.005) and CVaR absolute (37,313 vs 20,000). That cut Lucifer's 2-Star caps
to $10M exposure and $50k bet cost. Lucifer is left as submitted. All three to-dos raised then are
done for Powder Keg Cove.

| What reviewers check | Powder Keg Cove | Where |
|---|---|---|
| RTP per mode (90% to 96.7%, spread < 0.5%) | 96.2000% exactly in BASE (cost 1), BOOST (1.5), WITCHING (100), INFERNO (500); spread 0. Exact integer check `5 * costDen * sum(w * pay) == 481 * costNum * sum(w)` | `stake-math/verify.log`, `docs/MATH.md` section 5 |
| Max win | 50,000x in every mode, obtainable: BASE 1 in 5,000,000, BOOST 1 in 2,500,000, WITCHING 1 in 40,000, INFERNO 1 in 60,000 (12 to 24 max-win books per mode) | same |
| Hit rate | BASE 32.15%, BOOST 32.30%, WITCHING 99.74%, INFERNO 100.00% | same |
| Base volatility | BASE sd 44.0x (2-Star limit 50, 3-Star 60) | same |
| Dashboard: tail probability, CVaR, ETL, cost, max payout | 0 failing classes at 2-Star and at 3-Star. Tightest 2-Star margins: base sd 12.0%, CVaR absolute 12.0% (17,600, WITCHING), ETL > 40x 17.5% (BOOST). INFERNO: P(>= 5,000x) 0.51% (limit 1%), CVaR 15,963 (limit 20,000; Lucifer 37,313) | `stake-math/verify.log` (dashboard table), `stake-math/verify.json`, `docs/MATH.md` section 5 |
| Intermediate wins (no empty hit-rate range up to the max win) | No gaps in any mode from the smallest payout to the max win. Per-range tables in `docs/MATH.md` section 5 | same |
| File integrity | Every CSV payout equals its book's `payoutMultiplier` (= `round(totalWin * 100)`, <= 5,000,000); ids contiguous from 1; `index.json` modes and costs; `verify.ts --selftest` catches every injected corruption | `stake-math/verify.log`, `stake-math/selftest.log` |
| Upload | `stake-math/publish/`: `index.json`, `books_<MODE>.jsonl.zst`, `lookUpTable_<MODE>_0.csv`; 399.3 MB total (limit 4.2 GB); 401,362 / 402,304 / 60,159 / 60,301 books | `stake-math/publish/` |

Commands: generate `npx tsx tools/stake/generate.ts --out stake-math/publish --base 400000 --boost
400000 --witching 60000 --inferno 60000 --seed 1`; verify `npx tsx tools/stake/verify.ts` (writes
`src/stake/stats.json` with `--stats`); demo packs `npx tsx tools/stake/demo.ts`. The demo packs in
`public/demo-books/` were rebuilt from this publish on 2026-09-29 and match it book for book.

The INFERNO retune (Blackpowder Raid) in one line: the Broadside is now a token outcome (about 1 wheel
spin in 13,000), there is no +5 grog or size-5 bomb in that mode, and the value comes from steady
low-symbol cascades (mean 480x, about 5 bombs per bonus, free-spin hit rate 66%, was 53%). Details in
`docs/MATH.md` sections 1 and 3.

Not uploaded yet: no Stake upload has been made from this publish.

## Open decisions (for Tyler)

1. **Powder Boost standard deviation.** BOOST's sd is 63.4x the base bet (42.3x per unit of its 1.5x
   cost). Stake's base-volatility check (2-Star <= 50, 3-Star <= 60) is applied to the cost-1 base
   mode, which is BASE (44.0x), so today everything passes. If Stake also applies it to Boost, raw
   63.4 fails both tiers, while 42.3 per unit cost passes. Options: leave it (most likely fine), or
   add an sd bound to BOOST's weight tilt (costs some top-end BOOST outcomes, like BASE's thinned
   20,000-50,000x range). Decide once Stake's dashboard shows which number it uses.
2. **The empty (0, 0.1) range.** No mode has a payout below 0.1x, because the smallest paytable entry
   is 0.15x (L1 / L2, 5-cluster). The verifier's no-gap rule starts at the smallest payout, so this
   passes, but if Stake reads its hit-rate table literally from 0, filling it needs a paytable change
   (for example L1 and L2 at 5 to 0.05 or 0.1x), which changes the math and means regenerating and
   re-verifying all four modes. Recommendation: do nothing unless Stake asks.
3. **The Broadside wedge on the Blackpowder Raid wheel.** The INFERNO wheel still shows the Broadside
   (inferno row) wedge, but it lands on about 1 wheel spin in 13,000 (weight 0.005 of 65.9), so most
   players never see it land in that mode. It is rare but possible, so the wheel never shows a prize
   that cannot land. Options: keep it as it is; keep it and draw the wedge smaller in that mode
   (presentation only, track C, `src/render/wheel/**`); or remove the outcome and the wedge from the
   INFERNO wheel (a math change: regenerate and re-verify INFERNO).
