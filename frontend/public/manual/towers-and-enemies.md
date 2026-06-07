# Math Defense — Field Reference

Quick-lookup tables for towers, enemies, spells, buffs, and Monty Hall rewards. Open this in-game any time.

---

## Towers

Seven tower types, each tied to a real math concept. Stats below are the **base** tier. Tier 2 adds +25% damage and +10% range at 60% of base cost; Tier 3 adds +50% damage, +20% range, **and a universal +15% attack speed** at 100% of base cost. The +15% speed reduces base cooldown by 15% and so has no effect on Calculus (whose base cooldown is 0). Any other per-tower bonuses (sweep speed, target count, crit, ramp, AoE width, pet stats) are listed in each row.

![All towers at a glance](towers/_overview.png)

### Magic Tower — ✦

![Magic Tower](towers/magic.png)

- **Cost / Damage / Range / Cooldown:** 60 / 8 / 10 / 1.0 s
- **Math:** function curves (polynomial, trigonometric, log)
- **Unlocked from:** Star 1
- **Mechanic:** draws a math curve as a band-shaped zone. Toggle the band between **Debuff** (enemies inside take damage-over-time and are slowed to 60% speed for 2 s — the slow refreshes on re-hit) and **Buff** (towers inside a wider band of the same curve gain damage). Pick a curve that hugs the enemy path for damage; pick a curve that passes through your tower cluster for utility.
- **Tip:** the right curve is the one your enemies will walk on. The 2 s slow outlasts the 1 s damage tick, so a single Magic tower keeps enemies slowed continuously between ticks.
- **Exam tie-in:** GSAT Math A polynomial/trig curves; AP Precalculus.

### Radar A — Sweep — ◐

![Radar A — Sweep](towers/radarA.png)

- **Cost / Damage / Range / Cooldown:** 50 / 5 / 6 / 0.5 s
- **Math:** radian arcs, sector area
- **Unlocked from:** Star 1
- **Mechanic:** a needle sweeps around the tower and **pings** each enemy once as the beam passes over it — one clean hit per pass, not a continuous drip. It hits *every* enemy the beam crosses, so it shines against packed groups, but its per-enemy damage is deliberately low (a stationary enemy is struck once per revolution). Faster sweep speed = more passes = more damage. By default the needle circles the **full 360°** and the configurable arc only marks the ×1.5 focus sector; with **Restrict attacks to arc** on, the needle becomes a windshield wiper that oscillates strictly *inside* the sector (and ignores everything outside it).
- **Tier 2/3:** sweep speed +20% / +40% — and because the sweep now pings per pass, that speed directly raises damage; Tier 3 also widens the detection band by +0.3 rad (on top of the base 0.5 rad half-band, ~+60% wider catch).
- **Pick when:** a crowd of low-HP enemies funnels through a region — one Radar A tags the whole group every pass. Restrict it to a tight wiper over the chokepoint to concentrate the sweep where the path actually is.

### Radar B — Rapid — ◑

![Radar B — Rapid](towers/radarB.png)

- **Cost / Damage / Range / Cooldown:** 65 / 8 / 7 / 0.3 s
- **Math:** radian arcs
- **Unlocked from:** Star 2
- **Mechanic:** fast single-target shots — the shortest cooldown in the roster. Fires in every direction by default; the arc adds a ×1.5 focus sector, or restricts targeting to that sector when toggled on (see below).
- **Tier 2/3:** simultaneous target count +1 / +2.
- **Pick when:** lots of small, fast enemies in a corridor.

### Radar C — Sniper — ◒

![Radar C — Sniper](towers/radarC.png)

- **Cost / Damage / Range / Cooldown:** 90 / 40 / 12 / 2.5 s
- **Math:** radian arcs
- **Unlocked from:** Star 2
- **Mechanic:** slow, very heavy single-target shots at long range — the longest range and the heaviest base damage in the roster. Shots **lead** moving targets (aim ahead of them). Uses the arc for a ×1.5 focus sector and an optional restriction (see below).
- **Tier 2/3:** +10% / +20% crit chance, plus +50% crit damage at Tier 3.
- **Pick when:** the path has one chokepoint a long way from a placeable cell — and you want every shot to count.

**Radar arc (A / B / C).** Each radar has a configurable angular sector, set in its panel in degrees. Enemies inside it take **×1.5 damage** — a focus-fire bonus that is always on, even on the default 0°–90° sector. The **Restrict attacks to arc** checkbox is optional: off (the default) leaves the tower firing in every direction with the arc as a pure bonus zone; on makes the tower ignore every enemy outside the sector. For full-circle coverage, set Arc Start 0° and Arc End 360°.

### Matrix Tower — ⊞

![Matrix Tower](towers/matrix.png)

- **Cost / Damage / Range / Cooldown:** 80 / 1 base / 8 / 0.5 s
- **Math:** vectors, dot product
- **Unlocked from:** Star 2
- **Mechanic:** Matrix towers fire **nothing** alone — pairing is required. Pair two Matrix towers via the panel and the **base damage = 1 + dot product of their grid-coordinate vectors**. A laser locks onto a target and ramps its damage the longer it stays locked.
- **Tier 2/3:** lock-on ramp rate +20% / +40%; Tier 3 lets the laser sweep one extra target.
- **Pick when:** you can place two towers whose coordinate vectors give you a useful dot product, and there's a single long-lived target (mini-boss, Bulwark, Boss).
- **Exam tie-in:** AST 學測 linear algebra unit (2×2 matrices, dot product).

### Limit Tower — ∞

![Limit Tower](towers/limit.png)

- **Cost / Damage / Range / Cooldown:** 70 / 25 / 8 / 3.0 s
- **Math:** limits, L'Hôpital's rule
- **Unlocked from:** Star 3
- **Mechanic:** charges for **3 s**, then releases an AoE burst that hits every enemy in range at **1.5×** the formula damage. The panel presents a multiple-choice **one-sided** `lim` question of the form `lim[x→a⁺] f(x)/(x − a)`; your answer determines the formula:

| Answer | Effect |
|---|---|
| `+∞` | **instakill** every enemy in range (bypasses defensive caps) |
| `+C` (finite positive) | `effectiveDamage × \|C\| × 1.5` per enemy |
| `0` / DNE (undefined) / `−C` / `−∞` | chip damage `effectiveDamage × 0.35 × 1.5` |

- **Pick when:** you can reliably solve the shown `lim[x→a⁺] f(x)/(x − a)` quickly, especially against long-lived high-HP enemies where a correct `+∞` result has time to swing the wave. Wrong / degenerate answers no longer remove the tower or heal enemies — they just chip — but the lost burst on a 3 s cadence is still expensive.
- **Exam tie-in:** AP Calculus AB one-sided / infinite limits; AST calculus subject test.

### Calculus Tower — ∫

![Calculus Tower](towers/calculus.png)

- **Cost / Damage / Range / Cooldown:** 100 / 0 base / 10 / — (does not fire directly)
- **Math:** derivatives, integrals, power rule
- **Unlocked from:** Star 3
- **Mechanic:** pick a monomial `f(x)`, then pick an operation — `f'`, `f''`, or `∫f` — and **solve it yourself**: type the resulting monomial. The panel never shows the answer; only a correct answer applies the operation. The result `C·x^n` spawns pets that home onto the nearest enemy and detonate. The exponent **n** picks the **trait** (`n=1` → slow, `n=2` → fast, `n=3` → heavy, `n ≥ 4` → basic), which sets per-pet damage / fire rate / movement speed (a "fast" pet hits softer but more often; a "heavy" pet hits hard but slow). The coefficient **C** is **log-compressed** into pet count — `floor(log₂(C+1))` pets — so a `99·x²` result spawns 6 fast pets, not 99. Talents add to that count; non-integer `|C|` becomes a damage multiplier on each pet. The first operation is free; chaining another costs gold; a wrong answer is rejected at no cost.
- **Tier 2/3:** pet damage +25% / +50%; Tier 3 also +1 pet count and +20% pet speed.
- **Pick when:** you want autonomous chip damage during waves or extra cleanup that doesn't need direct line-of-sight positioning.
- **Exam tie-in:** AP Calculus AB Section I differentiation/integration of polynomials.

### Tower Roster At-a-Glance

| Tower | Cost | DMG | Range | CD | Role |
|---|---|---|---|---|---|
| ![Magic](towers/magic.png) Magic | 60 | 8 | 10 | 1.0 | Curve zone (debuff DoT + 2 s slow, or buff allies) |
| ![Radar A](towers/radarA.png) Radar A — Sweep | 50 | 5 | 6 | 0.5 | AoE sweep |
| ![Radar B](towers/radarB.png) Radar B — Rapid | 65 | 8 | 7 | 0.3 | Fast single target |
| ![Radar C](towers/radarC.png) Radar C — Sniper | 90 | 40 | 12 | 2.5 | Slow heavy single target |
| ![Matrix](towers/matrix.png) Matrix | 80 | 1* | 8 | 0.5 | Paired laser, 1 + dot-product damage |
| ![Limit](towers/limit.png) Limit | 70 | 25 | 8 | 3.0 | Charge-up AoE burst (1.5× damage) from `lim` answer |
| ![Calculus](towers/calculus.png) Calculus | 100 | 0* | 10 | — | Spawns C·x^n pets |

\* Effective damage comes from the tower's mechanic, not the base stat.

---

## Enemies

Ten enemy types. `killValue` is what they contribute to the Monty Hall and score formulas; `reward` is the raw gold drop.

![All enemies at a glance](monsters/_overview.png)

| Enemy | HP | Speed | Reward | Damage | Kill value | Special |
|---|---|---|---|---|---|---|
| ![General](monsters/general.png) **General** | 30 | 2.0 | 15 | 1 | 10 | Baseline mob |
| ![Fast](monsters/fast.png) **Fast** | 15 | 4.0 | 8 | 1 | 5 | 2× speed, thin HP — sneaks past slow towers |
| ![Strong](monsters/strong.png) **Strong** | 120 | 1.0 | 38 | 2 | 25 | Tanky bruiser |
| ![Split](monsters/split.png) **Split** | 40 | 2.0 | 8 | 1 | 5 | On death, splits into 2 smaller General enemies (40% scale) |
| ![Helper](monsters/helper.png) **Helper** | 35 | 2.0 | 23 | 1 | 15 | Aura: heals nearby allies +5 HP/s and grants +20% speed within r=3 |
| ![Boss Type-A](monsters/bossA.png) **Boss Type-A** | 500 | 0.8 | 150 | 99 | 100 | Shield 200 HP; spawns a General minion every 8 s |
| ![Boss Type-B](monsters/bossB.png) **Boss Type-B** | 600 | 0.7 | 225 | 99 | 150 | Shield 250 HP; spawns a Fast every 8 s; triggers a **Chain Rule** challenge at ~50% HP |
| ![Regenerator](monsters/regenerator.png) **Regenerator** | 80 | 1.5 | 30 | 2 | 20 | Regenerates 18 HP/s constantly — burst-kill or it never dies |
| ![Bulwark](monsters/bulwark.png) **Bulwark** | 220 | 0.9 | 45 | 3 | 30 | Tower damage is reduced to **40%** — pets and player effects bypass it |
| ![Swarmling](monsters/swarmling.png) **Swarmling** | 12 | 3.2 | 6 | 1 | 4 | Takes **only 35% of tower damage**; pets bypass this. Spawns in tight bursts |

### Boss Mechanics (extra detail)

**Boss Type-A (`bossA`)**

![Boss Type-A](monsters/bossA.png)

- Shield HP is absorbed first (the blue overhead bar). While the shield is up, all tower damage hits the shield, not the underlying HP.
- Minion spawn every 8 s. Killing the minion gives normal General rewards.
- HP-99 contact: one Boss reaching P\* will essentially end the run. Stop them well before then.

**Boss Type-B (`bossB`)**

![Boss Type-B](monsters/bossB.png)

- Shield + Fast-minion spawn behave as above.
- When current HP enters the range `[0.45, 0.55] × maxHp` (sampled per spawn so it isn't memorizable), the wave enters `CHAIN_RULE` phase.
- A KaTeX-rendered chain rule question is presented (e.g. compute `(f∘g)'(x)`).
  - **Correct** → +100 gold (`bossCorrectAnswerBonus`) **and the boss is instakilled immediately**, then shatters into two smaller enemies on the same path: a Strong-variant at 60% of the boss's max HP and a Fast-variant at 40% (both shield-stripped, with reduced reward and kill value).
  - **Incorrect / no answer** → no heal, no penalty beyond the lost insta-kill. The boss returns to combat at the HP it had when the question fired. Whenever the boss eventually dies by normal damage, it still splits into the same two smaller enemies.
- After resolution, the wave resumes.

### Counter-Enemies: How to Beat Each

| Threat | Why standard towers struggle | What to do |
|---|---|---|
| Regenerator | constant HP regen | Burst damage (Radar C, Impulse spell). Damage over Time (DoT) alone is unreliable. |
| Bulwark | takes only 40% tower damage | Calculus pets, Exponential/Impulse spells, and Monty-Hall power-ups bypass the cut. Matrix laser ramps through it. |
| Swarmling | -65% tower damage; bursty | Calculus pets ignore the modifier. Asymptote to slow the cluster. |
| Helper | buffs nearby allies | Kill the Helper *first*. Radar C or an Impulse spell are reliable openers. |
| Split | doubles into smaller mobs | Place AoE (Magic curve, Radar A sweep) where the children will spawn. |
| Boss A | shield + minion pressure | Sustained DPS on the shield; a Matrix pair locks on for ramp damage. |
| Boss B | shield + chain-rule gate + post-split adds | Answer the chain rule correctly to insta-kill (boss still splits into a Strong + Fast pair, so have Exponential / Asymptote ready for the cleanup). |

---

## Spells

Cast from the spell bar. Cost gold, fire instantly, share no resource pool with Build Phase shop buffs.

| Spell | Glyph | Cost | Cooldown | Effect |
|---|---|---|---|---|
| **Exponential** | eˣ | 80 | 12 s | 60 damage in a r=3 AoE around the click point — the value blows up exponentially |
| **Asymptote** | →0 | 60 | 15 s | Slow enemies in r=4 to 40% speed for 5 s — their speed is driven asymptotically toward zero |
| **Impulse** | δ | 100 | 18 s | 150 damage to a single targeted enemy — a Dirac-delta spike, all the energy at one point |
| **Acceleration** | dv/dt | 120 | 25 s | Boost tower attack speed for 8 s (self-cast) — the rate of change of velocity |

When to cast:

- **Asymptote** opens a Helper-led wave so you can kill the Helper first.
- **Impulse** finishes a Boss that's chunked through its shield.
- **Exponential** clears Swarmling bursts and Split children at the choke.
- **Acceleration** is the panic button when a wave is denser than you priced for.

---

## Time-Based Buffs (Shop, Build Phase)

| Buff | Cost | Duration | Effect |
|---|---|---|---|
| Sharpen Blades | 80 | 60 s | All towers +20% damage |
| Overclock | 100 | 45 s | All towers +15% attack speed |
| Far Sight | 70 | 50 s | All towers +15% range |
| Quagmire | 90 | 30 s | All enemies -15% speed |
| Corrode Armor | 110 | 40 s | Enemies take +10% damage |
| Heal 5 HP | 60 | instant | +5 HP |
| Heal 10 HP | 100 | instant | +10 HP |
| Ward Shield | 120 | 30 s | Halve the next 3 incoming damage hits (rounded up) |
| Prospector | 50 | 30 s | Double gold from kills |

Stack rules: each buff stacks **independently**. Two damage buffs are multiplicative.

---

## Monty Hall Rewards

When you clear a kill-value threshold, the event opens. The chosen door grants one of:

| Reward | Effect | Duration | Min ★ |
|---|---|---|---|
| Divine Blessing | Restore HP to full | instant | 1 |
| Master Builder | Next 2 towers are free | until used | 1 |
| Eagle Eye | +50% tower range | 25 s | 2 |
| Time Warp | -40% enemy speed | 20 s | 2 |
| Power Surge | Double tower damage | 30 s | 3 |
| Gold Rush | Triple gold from kills | 20 s | 3 |

**Min ★** is the lowest star rating that can roll the reward. At 1★ only the two utility rewards appear; higher tiers unlock the damage- and economy-amplifying rewards as the difficulty rises.

Reward strength is the same regardless of door count — the door count only changes the **probability** of picking the right door. Always switch after the reveal: at 3 doors, switching wins 2/3 of the time; at 5 doors, 4/5.

Gold-multiplier rewards (Gold Rush) stack **additively** with shop buffs: a ×2 shop buff plus the ×3 Gold Rush yields 4× per kill (not 6×), so two stacked gold buffs can never make the run trivial.

---

## Targeting Modes

Each combat tower can be set to one of:

- **Closest** — shortest distance to tower (default; smooth coverage)
- **Strongest** — highest current HP (Bosses, Bulwark)
- **First** — furthest along the path (kill before they get close)
- **Last** — nearest to P\* (catch leaks)

Switch via the small targeting toggle on the tower panel.

---

## Talent Tree (Persistent)

Twenty-six nodes across the seven tower types: nineteen base nodes (Magic 3, Radar A 2, Radar B 3, Radar C 3, Matrix 3, Limit 2, Calculus 3) plus seven advanced **"tier-2"** nodes — one per tower — that each require their parent base node at max level. Prerequisites within each tower form linear chains. The Talent Tree view renders each tower as its own mini-tree (two-column grid, tower-color theming, dashed border on the tier-2 cap node) so the prerequisite path inside a tower is visible at a glance.

| Tier | Per-tower coverage | Magnitude |
|---|---|---|
| Base | `damage`, `range`, `attack_speed` / `sweep_speed`, `target_count`, Magic `zone_strength` / `zone_width` / `duration`, Matrix `damage_ramp`, Calculus `pet_attack_speed` / `pet_damage` / `pet_range` | +8% to +20% per level (target-count nodes add a whole target) |
| Tier-2 | Magic `slow_strength`, Radar A `aoe_width`, Radar B `crit_chance`, Radar C `crit_damage`, Matrix `resonance` (paired-tower base damage ×(1+resonance)), Limit `burst_bonus` (adds to the 1.5× burst multiplier), Calculus `pet_crit` | +10% to +50% per level depending on the node; crit-chance nodes add a probability |

Each node has a `maxLevel` of 2 or 3. Free reset is available from the Talent Tree view. Effects apply at *tower placement* — re-build a tower to refresh its modifier snapshot after reallocating.

---

## Glossary

| Term | Meaning |
|---|---|
| Active time | Wave-phase seconds; excludes Build-Phase prep. Feeds the S1 score term. |
| Kill value | Per-enemy "worth" — drives Monty Hall thresholds and the score formula. |
| Gold per kill | `enemy.reward × goldMultiplier`, rounded — distinct from `killValue` (which feeds score, not gold). |
| IA | Initial Answer — the pre-game intersection-point question. The score's exponent uses IA = 1 only when you submit a correct `(x, y)`. |
| Multiset | The polynomial-degree multiset (e.g. `[1,2,2]`) used to generate the path. |
| Practice mode | A run that won't post to leaderboards (Star-5 checkpoint retry, manual abandon). |
| Tier | A tower upgrade level (1 base, 2 mid, 3 max). |

---

That's the field reference. For the deeper "why each system exists" and the run-level flow, see the Gameplay manual.
