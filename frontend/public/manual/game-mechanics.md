# Math Defense — Gameplay Manual

A strategic tower-defense game where **math is the mechanic, not the gate**. The functions you choose, the angles you sweep, the limits you evaluate — all of them *are* the attacks. There is no quiz overlay between you and the action.

---

## 1. The Goal

The world is a coordinate plane. The **origin (0, 0)** is a glowing rune you must defend. Enemies spawn at the edge of the grid and walk along a mathematical curve toward the origin. Every enemy that reaches the origin damages it. When the origin's HP hits zero, the run ends.

You win a level by surviving every wave (3–5 waves depending on star rating).

---

## 2. The Map

| Property | Value |
|---|---|
| Grid bounds | x ∈ [-14, 14], y ∈ [-14, 14] |
| Coordinate unit | 20 pixels |
| Origin | center of the screen |
| Path | one or more polynomial curves (degrees 1–3) procedurally generated each run |
| Tower placement | snapped to grid intersection points; only points clear of the path are legal |

The path is **randomized per run** — you cannot memorize a solution. To play well you must read the curve at a glance and decide where the bends will be.

---

## 3. Run Flow

```
Menu  →  Level Select  →  Initial Answer  →  [ Build → Wave ] × N  →  Score
                                                ↑              ↓
                                              Monty Hall, Chain Rule, …
```

- **Menu** — choose Play, Leaderboards, Class, Profile, etc.
- **Level Select** — pick a star rating from 1 to 5. Higher stars draw from harder polynomial multisets and tougher wave compositions.
- **Initial Answer (IA)** — a pre-game intersection-point question. The level's curves and a disclosure region (a rectangle that contains the answer) are shown, and you must enter the exact `(x, y)` of the curves' common intersection. See §11.
- **Build Phase** — no enemies on the board. Place towers, configure each tower's math, buy buffs from the shop, decide when to start the wave. Time still passes but is recorded as prep time and excluded from the score's active-time term.
- **Wave Phase** — enemies spawn from a queue. Towers fire automatically; you cast spells, watch resources, react.
- **Wave End** — short return to Build. New towers, upgrades, buffs.
- **Loop** — Build/Wave repeats until you clear the final wave or your HP hits 0.
- **Score Result** — the post-run breakdown (S1 / S2 / K / TotalScore) is shown; the score is submitted to the leaderboard.

Between phases the engine may inject special events:

- **Monty Hall** — see §7.
- **Chain Rule** challenge — Boss Type-B mid-fight modal, see §8.
- **Principle Overlay** — a one-card "what you just exercised" surfacing after a notable wave.

---

## 4. Resources

| Resource | Source | Sink |
|---|---|---|
| **HP** | starts at 20 (`initialHp`) | each enemy that reaches the origin deals its `damage` |
| **Gold** | start with 200–320 by star; earned on kill (`enemy.reward × goldMultiplier`); wave-clear bonus | tower placement, tower upgrades, shop buffs, spells |
| **Score** | computed at run end from the killValue/cost/time/HP record (each kill adds `killValue` to the in-run score counter) | — |
| **Kill Value** | accumulator of enemy "worth" killed this run | drives Monty Hall thresholds and the score formula |

Starting gold by star (`shared/game-constants.json → economy.startingGoldByStar`):

| Star | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Gold | 200 | 230 | 260 | 290 | 320 |

Wave-clear bonus: `10 + 20 × starRating`. Answering the Boss Type-B Chain Rule correctly pays a one-off `+100` gold bonus (`bossCorrectAnswerBonus`).

---

## 5. The Build Phase — What You Actually Do

In Build Phase no enemies are on the board, so you can think without time pressure. The engine still ticks (so spells, audio, and HUD update) but everything you do here is captured as prep time and is **subtracted** from the score's active-time term. What you can do:

- **Place towers.** Click the tower bar (top), then click a legal grid point. Cost is deducted immediately. Towers snap to integer coordinates.
- **Configure each tower's math.** Click any placed tower to open its panel. Each tower has its own UI — Magic picks a curve and a debuff/buff mode, Radars aim an angular arc (a ×1.5 focus sector, optionally a hard attack restriction), Matrix picks its pair partner, Limit answers a `lim` question, Calculus picks a function then solves a derivative or integral to apply it.
- **Upgrade or refund.** Each tower can be upgraded twice (Tier 2 / Tier 3) for a fraction of base cost. Refunding pays back a portion of total invested gold.
- **Open the shop.** Buy time-based buffs (extra damage, slow enemies, heal, shield, gold multiplier). See §9.
- **Set targeting.** Each combat tower has a targeting mode toggle: closest / strongest / first / last.
- **Start the wave.** Press **Start Wave** when you're ready.

Build Phase is intentionally generous: you can experiment freely, refund what didn't work, and only commit when you start the wave.

---

## 6. The Wave Phase

When Build Phase ends:

- Enemies spawn from the wave queue at the curve's far endpoint. Each wave specifies an `enemies[]` list and a default `spawnInterval`. Tight clusters (`burst`) overlap their spawn timer for swarm pressure.
- Towers fire automatically according to their math configuration and targeting mode.
- You retain control of: **spells** and **pausing** (Space / Esc). Tower configuration is locked at wave start — the BuildPanel only opens in BUILD.
- The wave ends when the spawn queue is empty *and* every enemy is dead or off the path.

If your HP hits 0 mid-wave, the run ends as **Game Over**. On Star-5 a "retry from last cleared wave" checkpoint is offered (but the run is then flagged as practice and is leaderboard-ineligible).

---

## 7. Monty Hall Event

When your cumulative kill value crosses one of the star's thresholds, the wave pauses and a 3–5-door Monty Hall mini-event opens.

- You **pick a door**.
- The system **reveals a losing door** from the remainder.
- You decide to **stay** with your original pick or **switch** to another unrevealed door.
- The chosen door's reward is applied — a powerful time-based buff (double damage, +50% range, slow all enemies, gold rush, full heal, free towers).

Thresholds and door counts by star (`monty-hall-defs.ts`):

| Star | Thresholds (killValue → doors) |
|---|---|
| 1 | 50→3, 120→3 |
| 2 | 80→3, 200→4, 350→4 |
| 3 | 120→3, 300→4, 500→5 |
| 4 | 150→4, 400→4, 700→5, 1000→5 |
| 5 | 200→4, 500→5, 900→5, 1000→5 |

Mathematically: **switching wins** P = (doors − 1) / doors after a reveal, so 2/3 at 3 doors, 3/4 at 4 doors, 4/5 at 5 doors. The game does not tell you that — it's the lesson.

---

## 8. Chain Rule Challenge (Boss Type-B)

When Boss Type-B drops to ~50% HP, the wave pauses and a chain-rule question appears (e.g. *"if f(g(x)) = sin(x²), what is f'(g(x)) · g'(x) at x = 1?"*).

- Answer correctly → the boss is **instakilled** on the spot, then shatters into two smaller enemies (a Strong-variant at 60% of the boss's max HP and a Fast-variant at 40%, both shield-stripped). You also collect a **+100 gold** bonus (`bossCorrectAnswerBonus`).
- Answer incorrectly (or close the prompt without answering) → the wave resumes with the boss at the HP it had when the question fired; no heal, no penalty beyond the lost insta-kill. When the boss is later killed by normal damage, it still splits into the same two smaller enemies.

There is no skip. The challenge fires once per Boss Type-B per run, with the trigger HP fraction sampled from `triggerHpRange: [0.45, 0.55]` so the timing is not memorizable. A backstop sample fires on the first tick after spawn in case the `ENEMY_SPAWNED` event was missed — the ability is guaranteed to never be skipped.

---

## 9. Shop & Time-Based Buffs

During Build Phase, the left utility column shows the **Shop**. Buffs you buy run on a real-time countdown (in active wave time) and stack independently.

| Buff | Cost | Duration | Effect |
|---|---|---|---|
| Sharpen Blades | 80 | 60 s | +20% damage on all towers |
| Overclock | 100 | 45 s | +15% attack speed on all towers |
| Far Sight | 70 | 50 s | +15% range on all towers |
| Quagmire | 90 | 30 s | -15% enemy speed |
| Corrode Armor | 110 | 40 s | enemies take +10% damage |
| Heal 5 HP | 60 | instant | restore 5 HP |
| Heal 10 HP | 100 | instant | restore 10 HP |
| Ward Shield | 120 | 30 s | halve next 3 damage hits |
| Prospector | 50 | 30 s | double gold from kills |

Monty Hall rewards are stronger (e.g. *double* damage, *triple* gold, *full* heal) but you have to earn them by clearing kill-value thresholds.

---

## 10. Spells

Four single-cast abilities on cooldown. Cost gold, fire instantly, no math input.

| Spell | Glyph | Cost | Cooldown | Target | Effect |
|---|---|---|---|---|---|
| Fireball | eˣ | 80 | 12 s | area (r=3) | 60 damage AoE — exponential blow-up |
| Frost Nova | lim → 0 | 60 | 15 s | area (r=4) | slow to 40% speed for 5 s — enemy speed limits to zero |
| Lightning | δ | 100 | 18 s | single | 150 damage one enemy — Dirac delta spike |
| Haste | d/dt | 120 | 25 s | self | +tower attack speed for 8 s — derivative of position |

Spells are your reactive layer — towers handle the steady pressure, spells handle the surprises (a burst of fast enemies, a boss low on HP, an unfavourable Monty Hall draw).

---

## 11. Initial Answer

Before each run, the engine shows you the level's curves (e.g. `Path 1: y = 2x − 1`, `Path 2: y = −x² + 3`, …) and a **disclosure region** — a rectangle that provably contains the curves' single common point. Your task is to find that point by hand and enter the exact `(x, y)` as fractions, integers, or exact decimals (e.g. `3/2`, `-5/4`).

Four outcomes:

- **Submit a correct answer** → IA flag = 1 (boosts the score exponent — see §12). In-game paths are drawn.
- **Submit a wrong answer** → IA flag = 0. The correct point is revealed. Paths are still drawn.
- **Pay 50 gold to skip** → IA flag = 0; paths drawn.
- **Proceed (Paths Hidden)** → IA flag = 0 and **the curve path overlay is hidden during gameplay**. You play against an invisible path.

On Star-1, the *recent* IA accuracy on your account also fades the in-canvas path label opacity (`iaAccuracyToLabelOpacity`). New players see fully labelled axes; consistent veterans see a more naked board.

---

## 12. The Score Formula

The leaderboard score is computed in WASM (`compute_total_score` in `wasm/math_engine.c`) so the server can re-verify it bit-deterministically. The frontend mirrors it for display.

Let:

```
activeTime  = max(0.001, timeTotal − Σ(time spent in Build Phase))
S1          = killValue / activeTime                    (kill rate)
S2          = killValue / costTotal       if costTotal > 0 else 0
alpha       = S1 / (S1 + S2)              if S1+S2 > 0 else 0
K           = alpha·S1 + (1 − alpha)·S2                 (continuous blend)

exponent    = 1 / sqrt(max(1, 1 + (2 + healthOrigin − healthFinal − initialAnswer)))
TotalScore  = max(0, K)^exponent           (killValue=0 → K=0 → score=0)
```

In English:

- More kills, faster, with cheaper towers → higher S1, S2, K.
- Less HP lost and a correct IA → smaller exponent denominator → larger exponent → K is raised to a larger power. The `sqrt` softens this curve so HP loss is no longer brutally punished at the top end.
- Sitting in Build Phase forever does not pad the timer — only active wave time counts toward S1.
- Building no towers (`costTotal = 0`) zeroes S2 and the blend collapses to `K = S1` (no penalty: the dominant rate carries the score).
- The K blend is continuous (no jump at S1 = S2): runs that flip between efficiency- and cost-dominant no longer see a score discontinuity.

---

## 13. Difficulty (Star Rating)

| Star | Path multisets drawn from | Waves | Typical enemy mix |
|---|---|---|---|
| 1 | degrees 1–2, 2–4 curves | 3 | General only |
| 2 | adds degree 3 and longer multisets | 4 | General, Fast, Bulwark |
| 3 | denser mix of degrees 1–3 | 5; last wave includes Boss Type-A | Strong, Fast, Split, Regenerator, Bulwark, Helper, Swarmling, Boss-A in wave 5 |
| 4 | even denser multisets | 5; last wave includes Boss Type-B | Helper-heavy plus Fast, Strong, Split, Regenerator, Bulwark, Swarmling; Boss-B with chain rule in wave 5 |
| 5 | hardest multisets, longest curves | 5; last wave includes Boss Type-B + Swarmling bursts | Everything but the entry-tier General (Helper, Strong, Fast, Split, Regenerator, Bulwark, Swarmling, Boss-B); only Star-5 grants the checkpoint retry |

The "multiset" is the polynomial-degree multiset used by `level-generator` to draw the run's curves (e.g. `[2,2,3]` = three curves of degrees 2, 2, 3 sharing one common point). Path generation is **polynomial-only**; the trig / log curve evaluator is used by the Magic tower and the curve LaTeX renderer, not by the path. The whole sequence is replay-deterministic from `rng_seed`.

---

## 14. Progression

What carries between runs:

- **Achievements** — 29 entries across 6 categories (`combat / scoring / efficiency / survival / exploration / territory`). Each clear yields talent points (TP); the full pool awards 52 TP, enough to fill any single tower's branch many times over but not the whole tree at once. Some achievements scale with seasonal multipliers.
- **Talents** — 26-node tree across the 7 tower types (19 base nodes plus 7 advanced "tier-2" nodes — one per tower — that unlock only when their parent base node sits at max level). Prerequisites form linear chains within each tower's branch. Each node has a `maxLevel` of 2 or 3 and grants a per-tower attribute bonus — damage, range, attack/sweep speed, target count, Magic's zone strength / zone width / duration / slow strength, Radar A's AoE width, Radar B/C crit chance / crit damage, Matrix's damage ramp / pair resonance, Limit's burst bonus, and Calculus pet attack speed / damage / range / crit. Per-level magnitudes vary by node (typically +8% to +25%; target-count nodes add whole targets; tier-2 crit nodes add a flat probability). Modifiers are **snapshotted at tower placement**, so re-build to refresh after reallocating. Free reset is supported.
- **Avatar & profile** — picked from the unlocks earned along the way.
- **Class & territory** — students can join classes and compete in time-bounded "Grabbing Territory" events with leaderboards by region / class / global.
- **Leaderboard** — every completed (non-practice) run posts its TotalScore by star rating.

Practice runs (Star-5 checkpoint retries, abandoned runs, runs marked `practice_mode`) are tracked but **never** posted to the leaderboard.

---

## 15. Controls & Accessibility

| Action | Control |
|---|---|
| Pan / inspect | Mouse over the canvas |
| Place tower | Click a legal grid point (after picking a tower in the bar) |
| Open tower panel | Click the tower |
| Start wave | "Start Wave" button (bottom right) |
| Pause / resume | Space or Escape (during a wave) |
| Cast spell | Click the spell button in the spell bar |
| Keyboard placement | Arrow keys + Enter (full pointer-free placement, WCAG 2.2 SC 2.1.1) |
| Exit run early | "Exit Run" button (top right) — the run will not be recorded |

Accessibility:

- Every tower type has a unique Unicode glyph in addition to its colour (WCAG 1.4.1).
- A polite ARIA live region announces phase transitions and HP warnings.
- A `prefers-reduced-motion` block tones down ambient animation.
- Path labels fade based on the player's IA history — so confident players are not over-explained.

---

## 16. Win / Lose / Abandon

| Outcome | Trigger | Score recorded? |
|---|---|---|
| **Victory** | every wave cleared, HP > 0 at level end | yes |
| **Game Over** | HP reaches 0 | yes (final stats up to the point of death) |
| **Star-5 Checkpoint Retry** | optional; resumes from last cleared wave | run flagged as practice; **not** leaderboard-eligible |
| **Abandon Run** | "Exit Run" or navigating away mid-run after confirmation | no record |

That is the whole engine. Everything else — the towers, the enemies, the spells, the events — is reference material covered in the second manual.
