# Math Defense — Final Project Specification

> Subsystem references:
> - Frontend: [`frontend/README.md`](frontend/README.md)
> - Backend: [`backend/README.md`](backend/README.md)
> - WASM: [`wasm/README.md`](wasm/README.md)
> - Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
> - Database: [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md)
> - Security: [`SECURITY.md`](SECURITY.md)
> - In-game manual: `frontend/public/manual/*.md`

---

## 1. Project Overview

| Item | Detail |
|------|--------|
| Title | Math Defense |
| Course | Programming (II) — Final Project |
| Team | Three students (freshman / sophomore / junior), education-and-technology majors |
| Target audience | High-school students |
| Genre | Strategic tower defense × mathematics learning |
| Tech stack | Vue 3 + TypeScript (frontend), FastAPI + DDD (backend), PostgreSQL 16, HTML5 Canvas, C → WebAssembly (math + scoring core) |
| Schedule | 6+ weeks |
| Difficulty levels | 5 star tiers (1★ Beginner Training → 5★ Legendary; 5★ is locked until the player answers an Initial Answer correctly) |

### Core Philosophy

**"Math IS the mechanic" — not "answer-a-question for coins".** Mathematical concepts directly form the operational mechanics of the game. The function parameters the player types decide projectile trajectories, attack regions, and tower interactions; mathematical understanding directly drives performance.

### Design Principles

- **Manual input, not sliders** — players must type math parameters (e.g. `m`, `b`, an angle, a polynomial). They cannot drag a slider and "watch the result". Every change forces them to reason from a visual goal back to a numeric value. (An opt-in **slider-fallback practice mode** exists as an accommodation for dyscalculic / high-anxiety learners; runs played with it are flagged `practice_mode` and excluded from the global leaderboard.)
- **Terminology shown alongside actions** — Build Phase panels label inputs with their mathematical names ("slope `m`", "definite integral `∫`", "limit `lim`"), building a continuous association between the term and the intuition.
- **Productive Failure (Kapur, 2008)** — the Build Phase allows unlimited retries; parameters lock when the wave starts. Failure has learning value because every retry requires a new piece of reasoning.

---

## 2. Map: A Living Coordinate Plane

The world **is** a 2D Cartesian plane.

- `P*` — the unique point shared by every path curve in the level — is a glowing magic rune the player must defend; it sits at a random position on the plane (not necessarily the origin), and enemies reaching it drain HP.
- Towers occupy lattice points (e.g. `(3, 5)`).
- Enemies spawn at grid-edge points and march toward `P*` along procedurally generated **polynomial paths** (degree 1–3, depending on star).
- All tower ranges are expressed as geometric regions on the plane (sectors, polynomial zones, intervals, etc.).

### Procedural Paths

At run start, the WASM `generate_level` routine samples a multiset of polynomial curves whose composition depends on the star tier. A rejection-sampling loop (≤ 8 batches × 50 attempts) ensures:

1. The curves share **exactly one** common intersection inside a chosen disclosure rectangle.
2. Spawn points sit on the grid boundary; each enemy walks along one curve toward `P*`.

| Star | Label | Path multiset | Waves | Enemy mix |
|------|-------|---------------|-------|-----------|
| 1 | Beginner Training | 2–4 curves, degree 1–2 | 3 | General only |
| 2 | Intermediate | 2–6 curves, adds degree 3 | 4 | General, Fast; one Bulwark in the finale |
| 3 | Advanced | 3–6 curves, degree 1–3 | 5 (last = Boss A) | Adds Strong, Split, Regenerator, Helper, Bulwark, Swarmling bursts |
| 4 | Expert | 3–6 curves, denser degree-3 mixes | 5 (last = Boss B) | Helper-heavy waves + Chain-Rule boss |
| 5 | Legendary | 4–6 curves, degree-3-heavy multisets | 5 (last = Boss B + Swarmling burst) | Densest mix of every special enemy type |

> Trigonometric and logarithmic curves are used **only by the Magic tower's zone shapes**, not by enemy paths.

---

## 3. Visual Style

Medieval-fantasy × pixel art, with a single math-themed visual vocabulary across towers, enemies, pets, and spells.

| Element | Color / treatment |
|---------|-------------------|
| Floor | Dark slate (`#1a1520` / `#252030` alternating) |
| Grid lines | Dim gold (`#3a3028`) — engraved runes |
| Axes | Bright gold (`#8b7342`) |
| Enemies | Glyph bodies with cyan/magenta chromatic fringe |
| P* rune | Pulsing gold glow |

**Build Phase panels** use a parchment-on-stone treatment, gold borders, monospace input fonts, and label every field with its math term. The confirm button reads **"Cast Spell"** rather than "OK".

**HUD** shows: phase (Build / Wave X / Boss), gold, HP, score, spell cooldowns, and active buff timers.

### Towers — mathematical instruments

All seven tower bodies fit a 22×22 px silhouette above a shared baseplate. Tier rings (T2 gold rim, T3 rotating sub-glyph ring) read tier at a glance.

| Tower | Glyph | Instrument body | Companion VFX aligned |
|-------|-------|-----------------|------------------------|
| Magic | ✦ | Parchment scroll with a breathing polynomial / sinusoid curve | `MagicZoneRenderer` zone curve |
| Radar A | ◐ | Sextant with a sweeping arm | `RadarRangeRenderer` sweep arc |
| Radar B | ◑ | Astrolabe with two counter-rotating rings | `RadarRangeRenderer` rotating ring |
| Radar C | ◒ | Brass telescope on tripod that tracks the nearest enemy | `RadarRangeRenderer` scope cone |
| Matrix | ⊞ | Floating 2×2 bracket pair `[ ]` with scrolling digits; diagonal-cell flash on fire | `MatrixLaserRenderer` beam |
| Limit | ∞ | Dashed asymptote pair flanking an ascending point; bound-snap on fire | Range preview only |
| Calculus | ∫ | Rotating `∫` sigil shedding `dx` / `dy` particles toward target | Range preview only |

### Enemies — math-error chaos constructs

Every enemy is built from a glyph body + cyan/magenta chromatic-aberration fringe + a behaviour-tied motion modifier. Status auras (frost, regen, helper) and HP/shield bars are drawn on the glyph bodies.

| Enemy | Glyph | Motion / signal |
|-------|-------|------------------|
| General | `x` | Gait wobble |
| Fast | `÷` | Lean + motion-blur streak |
| Strong | `( + − = )` cluster | Chromatic fringe widens as HP drops |
| Split | Fraction stack | On death, numerator drifts up / denominator down |
| Helper | `Σ` | Breathes while helper aura active |
| Regenerator | `lim` | Nested inside rotating dashed regen ring; `+ε` particles rise |
| Bulwark | `∥` | Two thick parallel bars with rivets |
| Swarmling | `ε` | Three smaller `ε` satellites orbit jittering |
| Boss A | `∀x. f(x) ≠ 0` | Halo of flickering "QED" boxes |
| Boss B | Möbius lemniscate | Orbiting `↻` paradox satellites |

**Pets.** The Calculus tower's pets are math-helper glyphs sharing the construction recipe of enemies but with a **cyan-only fringe**, so allied vs. hostile reads at a glance. Glyph mapping: `½` (slow) / `→` (fast) / `×` (heavy) / `+` (basic). An allied aura ring + orbiting satellites serve as the "friendly buff field" cue.

**Spells.** Each spell's name *is* its math operator, rendered as a glyph-centred composition by `SpellEffectRenderer`: Exponential (`fireball`) = `eˣ` rising from cast point with expanding shockwave rings; Asymptote (`slow`) = `→0` with concentric contour rings collapsing inward; Impulse (`lightning`) = `δ` at the strike point with a chromatic vertical bolt; Acceleration (`haste`) = `dv/dt` drifting upward over a green/gold aura with radiating speed lines. All four use the player-action **gold-only fringe** (`#ffd700` / `#c47206`) — distinct from enemies (cyan/magenta) and pets (cyan-only). The same name + glyph mapping appears on `SpellBar.vue` icons and in the `public/manual/*.md` spell tables.

**Combat events and death animation.** `Events.TOWER_FIRED` (emitted by `CombatSystem` at projectile spawn) and `Events.ENEMY_DYING` (emitted by `SplitPolicy.killEnemy` for combat kills only — origin-breach removals stay instant) are registered in `EVENT_HANDLER_REGISTRY` and gated by `npm run event-registry-check`. The `Enemy.dying / dyingTimer / deathMaxTime` fields extend the entity lifecycle so corpses can play a ~0.35 s (regular) or ~1.20 s (boss) death animation without holding up combat resolution — `alive` flips to `false` at t=0.

### Accessibility

- Unicode glyphs per tower (WCAG 1.4.1 — color-blind-safe).
- Keyboard placement: arrow keys + Enter; no pointer required (WCAG 2.2 SC 2.1.1).
- ARIA live region announces phase, wave, and result.
- Opt-in slider-fallback practice mode (see §1 Design Principles).
- Reduced-motion mode honored (below).

**Reduced-motion contract.** `useReducedMotion` (`composables/useReducedMotion.ts`) and the engine-side `prefersReducedMotion()` helper provide a single source of truth. When the user opts in: `ShakeController` produces zero offset; `DeathParticleRenderer` halves both particle count and lifetime; `TowerLifecycleRenderer` collapses the upgrade pillar + rune sweep to a static colored flash; HUD value-pops drop the scale keyframe but keep the colour flash. `SpellEffectRenderer` drops each spell's motion-intensive layer — Exponential loses the expanding shockwave rings (heat bloom kept as static flash); Asymptote drops the inward-collapsing contour rings (the `→0` glyph itself carries the Regenerator differentiator); Impulse drops the chromatic offset passes and renders a single white bolt; Acceleration drops the upward drift + radiating speed lines (aura halo + static glyph kept above the tower). Identity-bearing visuals (silhouette, colour, glyph) are never removed.

---

## 4. Tower System (7 towers)

Every tower has three tiers. T2 (60% of base cost): +25% damage, +10% range, plus a type-specific bonus. T3 (100% of base cost): +50% damage, +20% range, +15% attack speed, plus a larger type-specific bonus (e.g. extra targets, crit chance, ramp rate, pet count). Talent-tree modifiers are snapshotted **at placement time**.

| # | Tower | Concept | Star unlock | Mechanic |
|---|-------|---------|-------------|----------|
| 1 | **Magic Tower** (✦) | Function curves (polynomial / trig / log) and zones | 1★ | Player types a curve; the tower projects damage / buff / debuff zones around the curve. Trig (`sin`/`cos`/`tan`) and log (`log`/`ln`) curve families unlock via the exploration achievements earned by clearing 1★ and 2★ levels. |
| 2 | **Radar A — Sweep** (◐) | Continuous arc sweep; sector-area AoE | 1★ | Inputs: start angle `θ`, sweep width `Δθ`, radius `r`. Damage-per-second to enemies inside the sector. |
| 3 | **Radar B — Rapid** (◑) | Fast projectiles within an arc | 2★ | Shortest cooldown of the Radar family; ideal for swarms. |
| 4 | **Radar C — Sniper** (◒) | Slow, heavy long-range shots | 2★ | Highest single-shot damage at the longest range. |
| 5 | **Matrix Tower** (⊞) | 2×2 matrix on a tower pair | 2★ | Pairing required. Base damage = 1 + the dot product of the paired towers' grid-coordinate vectors. Lasers lock onto targets and the damage ramps over time. |
| 6 | **Limit Tower** (∞) | Limits of functions | 3★ | The tower asks a multiple-choice limit question; the answer (`+∞ / −∞ / ±C / 0 / const`) determines its attack range type. |
| 7 | **Calculus Tower** (∫) | Differentiation and integration | 3★ | Player picks a polynomial **and** chooses `d/dx` or `∫`. The tower spawns autonomous "pets" whose movement & damage follow the power rule applied to the chosen polynomial. |

### WASM-backed tower math

Tower mechanics call into the deterministic C/WASM core (see §10):

- `matrix_multiply` — Matrix tower's paired-tower transform.
- `sector_coverage`, `point_in_sector` — Radar towers' range and hit checks.
- `numerical_integrate` — Calculus tower's trapezoid-rule integration.
- `curve_evaluate`, `curve_derivative`, `curve_in_domain` — Magic and Calculus zones / pets.

---

## 5. Enemy System (10 enemies)

| Enemy | HP | Speed | Gold | Kill-value | Special |
|-------|----|----|------|------------|---------|
| General | 30 | 2.0 | 15 | 10 | Baseline |
| Fast | 15 | 4.0 | 8 | 5 | 2× speed, low HP |
| Strong | 120 | 1.0 | 38 | 25 | Tank |
| Split | 40 | 2.0 | 8 | 5 | Splits into 2 Generals (0.4× size) on death |
| Helper | 35 | 2.0 | 23 | 15 | Aura (r=3): +5 HP/s and +20% speed to allies |
| Regenerator | 80 | 1.5 | 30 | 20 | Regenerates 18 HP/s, never interrupted by damage |
| Bulwark | 220 | 0.9 | 45 | 30 | Takes only 40% of tower damage (only Calculus pets bypass) |
| Swarmling | 12 | 3.2 | 6 | 4 | Takes only 35% of tower damage (Calculus pets bypass) |
| **Boss Type-A** | 500 | 0.8 | 150 | 100 | 200-HP shield; summons a General every 8 s |
| **Boss Type-B** | 600 | 0.7 | 225 | 150 | 250-HP shield; summons a Fast every 8 s; triggers the **Chain Rule** event at 45–55% HP (fraction sampled per spawn) |

`Kill-value (KV)` is the threshold currency for Monty Hall and contributes to the kill-rate term `S1` in the score formula (see §9).

---

## 6. Spells & Shop Buffs

### 6.1 Active Spells (4) — cast during a wave

| Spell | Glyph | Cost | Cooldown | Effect |
|-------|-------|------|----------|--------|
| Exponential (`fireball`) | eˣ | 80 g | 12 s | 60 AoE damage, radius 3 |
| Asymptote (`slow`) | →0 | 60 g | 15 s | Slow enemies to 40% speed inside radius 4 for 5 s |
| Impulse (`lightning`) | δ | 100 g | 18 s | 150 single-target damage |
| Acceleration (`haste`) | dv/dt | 120 g | 25 s | All towers deal 1.5× damage for 8 s |

### 6.2 Shop Buffs (9) — bought during the Build Phase, time-based stacks

| Buff | Cost | Effect |
|------|------|--------|
| Sharpen Blades | 80 g | All towers +20% damage for 60 s |
| Overclock | 100 g | All towers +15% attack speed for 45 s |
| Far Sight | 70 g | All towers +15% range for 50 s |
| Quagmire | 90 g | All enemies −15% speed for 30 s |
| Corrode Armor | 110 g | All enemies take +10% damage for 40 s |
| Heal 5 HP | 60 g | Restore 5 HP immediately |
| Heal 10 HP | 100 g | Restore 10 HP immediately |
| Ward Shield | 120 g | Halve the next 3 damage hits within 30 s |
| Prospector | 50 g | Double gold from kills for 30 s |

---

## 7. Mid-Run Events

### 7.1 Monty Hall

Triggered when cumulative kill-value crosses star-specific thresholds — a run can present 2 events (1★) up to 4 events (4★–5★), each at a higher KV threshold.

- Player picks a door; the system reveals one losing door; player chooses to stay or switch.
- The door count grows with star tier and threshold (3 doors at low tiers up to 5 doors at high tiers). The classic 3-door variant offers a 2/3 advantage to switching; the 5-door variant raises this to 4/5.
- Reward pool: **Power Surge** (2× tower damage, 30 s; 3★+), **Eagle Eye** (+50% range, 25 s; 2★+), **Time Warp** (−40% enemy speed, 20 s; 2★+), **Gold Rush** (3× gold from kills, 20 s; 3★+), **Divine Blessing** (full HP), **Master Builder** (next 2 towers free). Game-trivializing rewards are star-gated so 1★ players never roll them.
- Reinforces conditional probability and expected-value reasoning each run.

### 7.2 Chain Rule (Boss Type-B)

When Boss Type-B falls to 45–55% HP, the game pauses into a dedicated Chain-Rule phase and presents a multiple-choice derivative problem (chain rule on a composition `f(g(x))`).

- **Correct:** the boss is slain on the spot — and splits into the two factors of the chain rule: an `f′(g(x))` child (Strong-type, 60% of boss max HP) and a `g′(x)` child (Fast-type, 40% of boss max HP, 1.2× speed), each with reduced gold / kill-value.
- **Wrong / skip:** the boss keeps fighting at its current HP; when it is eventually killed without a correct answer, it splits into the same two children anyway.

---

## 8. Progression

### 8.1 Initial Answer (IA)

Before each run, the player sees the level's curves displayed inside a disclosure rectangle that contains their single common intersection. The player enters the intersection `(x, y)` exactly (fractions, integers, or exact decimals are accepted).

| Choice | Effect |
|--------|--------|
| Correct answer | `initialAnswer = 1` (sharpens the score exponent — see §9); permanently unlocks the 5★ Legendary tier on the player's account |
| Wrong answer | `initialAnswer = 0`; the path overlay stays visible |
| Pay 50 gold to skip | `initialAnswer = 0`; −50 gold (counted into the run's cost total); the path overlay stays visible; the 5★ unlock is **not** earned |
| "Proceed (paths hidden)" | `initialAnswer = 0`; the path overlay is hidden during play, along with every placement-legality cue that could betray it — the grid paints no blocked-cell hatch, the hover cursor shows a neutral (colour-free) ring, and the keyboard cursor can visit every lattice point. Blocked cells still reject an actual placement attempt. |

A **rolling IA accuracy** over the last 10 sessions is tracked per user; on 1★ the path overlay opacity fades as accuracy rises, gradually weaning students off the visual aid.

### 8.2 Achievements

**29 achievements** across 6 categories: combat, scoring, efficiency, survival, exploration, territory. The full pool grants **52 talent points**; active seasons can multiply awards. Two exploration achievements double as **curve-family unlocks** — clearing a 1★ level unlocks trig curves and clearing a 2★ level unlocks log curves in the Magic tower.

### 8.3 Talent Tree

**26 nodes** distributed across the 7 tower types — 19 base nodes in short prerequisite chains plus 7 advanced nodes (one per tower) that unlock only when their parent node is at max level:

| Tower | Nodes |
|-------|-------|
| Magic | 4 |
| Radar A | 3 |
| Radar B | 4 |
| Radar C | 4 |
| Matrix | 4 |
| Limit | 3 |
| Calculus | 4 |

Each node has `maxLevel = 2` or `3` and grants a per-tower multiplier (damage, range, attack / sweep speed, target count, zone width / strength, Magic duration / slow strength, Matrix ramp rate / pair resonance, crit chance / crit damage, Limit burst bonus, Calculus pet damage / speed / range / crit). Base nodes cost 1 talent point per level; advanced nodes cost 3. Talent effects are **snapshotted at tower placement** so mid-run respecs do not retroactively buff existing towers.

### 8.4 Stealth Assessment & Adaptive Recommendations

A Bayesian **Beta-Bernoulli** posterior per competency is updated from in-game evidence using a Q-matrix linking towers / events to skills. The Application layer's recommender service surfaces a suggested star tier and a next talent node based on the current posterior.

### 8.5 Empirical Validity Probe

Optional A/B study enrollment: pre-test, post-test, delayed post-test, plus affect surveys (math anxiety + intrinsic motivation, Likert). Data exportable as CSV for analysis.

---

## 9. Scoring

`compute_total_score` is implemented in C/WASM, mirrored in TypeScript for live display, and recomputed on the backend during anti-cheat validation. The server is the sole authority for the stored score; the client-side value is display-only.

```
activeTime  = max(0.001, totalTime − Σ buildPhaseTime)
S1          = killValue / activeTime                  (kill rate)
S2          = killValue / costTotal   if costTotal > 0 else 0   (cost efficiency)
α           = S1 / (S1 + S2)          (0 if S1 + S2 = 0)
K           = α·S1 + (1 − α)·S2       (continuous blend, weighted toward the larger term)
exponent    = 1 / sqrt(max(1, 1 + (2 + healthOrigin − healthFinal − initialAnswer)))
core        = killValue^exponent × K
TotalScore  = core × (1 + 0.25·(star − 1))
```

Edge cases:

- `killValue = 0` (no kills) ⇒ `TotalScore = 0` by design.
- `costTotal = 0` (no towers built) ⇒ `S2 = 0`, so `α = 1` and `K = S1`.
- A correct **Initial Answer** sharpens the exponent toward 1 (higher score), so understanding the level geometry up-front is materially rewarded.
- The per-star difficulty multiplier `1 + 0.25·(star − 1)` is exact in IEEE-754, so it is bit-identical across JS and Python.

### Anti-cheat replay

The backend uses `wasmtime-py` to load the same WASM module the browser ran, replays the recorded event stream, and recomputes the score with the same musl-backed `pow` and `compute_total_score` exports. For replay-v2 sessions, any deviation > `1e−4` rejects the submission with `HTTP 422 replay_mismatch`; v1 sessions use the looser `5e−4` tolerance.

---

## 10. WASM Core

The C source (compiled with deterministic floating-point flags: `-fno-fast-math -fno-unsafe-math-optimizations -ffp-contract=off`) exports **17 user-facing functions** plus `_malloc` / `_free`.

| Category | Exports |
|----------|---------|
| Tower mechanics | `matrix_multiply`, `sector_coverage`, `point_in_sector`, `numerical_integrate` |
| Level generation | `find_pair_intersections`, `find_all_curves_common_point`, `count_common_intersections_in_interval`, `compute_spawn_points`, `generate_level`, `curve_evaluate`, `curve_derivative`, `curve_in_domain` |
| Replay-v2 PRNG | `prng_seed`, `prng_next_u32`, `prng_next_f64` (PCG XSL-RR 64/32) |
| Scoring | `compute_total_score`, `power_f64` (musl `pow` for bit-exact recompute) |

Two replay versions are supported:

- **v1** — `mulberry32` JS PRNG + native `Math.*`, tolerance `ε = 5e−4`.
- **v2** — PCG WASM PRNG + musl transcendentals; **bit-exact** server / client recomputation.

A pure-TypeScript fallback in `frontend/src/math/WasmBridge.ts` mirrors every export, and Vitest parity tests guard divergence.

---

## 11. Backend Architecture (DDD)

```
┌────────────────────────────┐    ┌──────────────────────────────────────────┐
│  Browser (frontend)        │    │  FastAPI backend                         │
│                            │    │  ┌────────────────────────────────────┐  │
│  Vue 3 + TS, Pinia, Vite   │    │  │ HTTP (thin routers)                │  │
│  Canvas engine             │ ── │  │ Application services (use cases)   │  │
│  WasmBridge (ccall/cwrap)  │HTTP│  │ Domain (aggregates, value objects) │  │
│  Manual modal (md → HTML)  │ ── │  │ Infrastructure (SQLAlchemy, JWT,   │  │
│  Audio bus (music/sfx/ui)  │ WS │  │   wasm_runtime, scheduler)         │  │
│                            │    │  └────────────────────────────────────┘  │
└────────────────────────────┘    │  PostgreSQL 16 (29 tables, Alembic)     │
                                  └──────────────────────────────────────────┘
```

| Layer | Responsibilities |
|-------|------------------|
| **Domain** | Pure Python; no FastAPI / Pydantic / SQLAlchemy imports. Aggregates (`User`, `GameSession`, `LeaderboardEntry`, `Achievement`, `Talent`, `Class`, `Territory`, `Challenge`, `Season`), value objects (`SessionStatus`, `Level`, `Score`, `GameResult`), policies, repository protocols. |
| **Application** | 15 services orchestrating use cases (auth — register / login / MFA / refresh rotation, session, leaderboard, achievement, season, talent, class, admin, territory, territory recommendation, assessment, recommender, challenge, replay, study). Receives repositories through DI. `SessionEventBus` dispatches post-commit consumers (leaderboard insert, achievement check + assessment evidence, IA rolling accuracy) in separate Units of Work. |
| **Infrastructure** | SQLAlchemy repositories, `UnitOfWork` with explicit commit, login guard (exponential-backoff lockout), token denylist, audit logger, email service, territory-settlement scheduler, in-process spectate hub, `wasm_runtime` singleton for server-side score recompute. |
| **HTTP** | Thin routers; the domain layer is HTTP-free (errors carry no `status_code`) — a single mapping table (`app/http_status_map.py`) plus a global exception handler translate each domain error class to an HTTP response. |

---

## 12. Roles, Classrooms, and Leaderboards

### Roles

- **admin** — manages teachers, classes, students, seasons.
- **teacher** — creates classes (8-character uppercase `join_code`), authors generative challenges, opens territory activities, views per-class competency posteriors, exports study data.
- **student** — default role; joins a class by code; plays runs.

RBAC is enforced both in Vue Router guards and in FastAPI middleware. Accounts support optional TOTP-based MFA and soft email verification.

### Classroom Management

Teachers can manage students and remove memberships with a **soft delete** so removed students cannot rejoin with the old code. Classes additionally support co-teachers, student groups, pending email invites, and soft-archiving.

### Leaderboard Types

| Type | Scope | Notes |
|------|-------|-------|
| Global per-star | Difficulty 1–5★ | `DENSE_RANK` ordering, personal-best timeline |
| Per-class | Class-scoped | Teacher view |
| Per-challenge | Per generative challenge | Soft-deleting a challenge cascades removal from its board |
| Territory rankings | Per activity slot | Optimistic locking on occupations; snapshots track historical rank deltas |

Sessions flagged `practice_mode` (slider-fallback runs) or `is_preview` (teacher / admin smoke-test runs) are excluded from every competitive board; achievement and talent awards still fire.

A separate "Grabbing Territory" activity layer hosts classroom competition with the territory leaderboard above it.

---

## 13. Game Flow

```
Build Phase                              Wave Phase
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ • See enemy path equations    │        │ • Enemies march toward P*     │
│ • Place / configure towers    │        │ • Towers fire automatically   │
│ • Curve / range preview       │ ─────► │ • Tower parameters locked     │
│   (with terminology labels)   │        │ • Cast spells on cooldown     │
│ • Unlimited retries           │        │ • Observe consequences        │
│ • Shop buffs purchasable      │        │                               │
│ • Confirm with "Cast Spell"   │        │                               │
└───────────────────────────────┘        └───────────────────────────────┘
                                              │
                                              ▼
                                     Possible mid-run events
                                     (Monty Hall, Chain Rule)
                                              │
                                              ▼
                                     Next Build Phase / Boss / End
```

Key flow rules:

- **No math interrupts during a wave.** Spells, talents, and shop buffs are pre-decided in the Build Phase; the wave is observation + reactive spell casting.
- **No between-wave summary screen.** Build → Wave → Build is uninterrupted to preserve flow.
- **End-of-run** shows total score, kills, leaderboard delta, achievements unlocked, and talent points earned, plus an optional free-text reflection the player can attach to the session.

---

## 14. Manual & Audio Subsystems

- **In-game Manual** — a modal renders Markdown directly from `frontend/public/manual/` (`game-mechanics.md`, `towers-and-enemies.md`). Updating a tower or mechanic is a documentation-only change.
- **Audio bus** — `HTMLAudioElement`-backed asset manager with polyphony cap, randomized jitter, crossfade, and three buses (music / SFX / UI). SFX definitions are mapped to gameplay events (tower fire, enemy death, boss arrival, Monty Hall reveal, IA correct).

---

## 15. Schedule (6–7 weeks)

| Week | Deliverable |
|------|-------------|
| 1 | Engine skeleton, coordinate-plane renderer, WASM toolchain, Magic & Radar towers playable on procedurally generated paths. |
| 2 | Build Phase UI (parchment panels), shop-buff loop, scoring pipeline (frontend + WASM), Initial Answer screen. |
| 3 | Matrix / Limit / Calculus towers, Spells & cooldowns, Monty Hall event, achievement + talent infrastructure. |
| 4 | FastAPI backend with DDD layering, auth (JWT + refresh rotation), per-star leaderboard, replay v1. |
| 5 | Boss Type-A & B, Chain-Rule event, talent tree, classroom management, per-class leaderboard, audio bus, accessibility polish. |
| 6 | Replay v2 (PCG WASM + musl `pow`), anti-cheat recompute via `wasmtime-py`, territory activity + ranking snapshots, manual modal. |
| 7 | Stealth assessment, empirical validity probe, report + presentation, final QA. |

---

## 16. Team Division

| Member | Primary surface |
|--------|-----------------|
| **Junior (architecture & math core)** | Game engine, Canvas renderer, `math_engine.c`, WASM bridge, level generator, scoring formula, enemy systems, all towers, replay v2, anti-cheat backend recompute. |
| **Sophomore (Radar family)** | Radar A / B / C towers (Build-Phase inputs, sector preview, hit detection, DPS), plus shared tower scaffolding extensions. |
| **Freshman (UI & presentation)** | HUD, parchment Build-Phase panels, shop UI, Monty Hall modal, spell-cast indicators, main menu, leaderboard pages, classroom dashboards, accessibility polish, asset packs, manual content, report & slides. |

Shared interface contracts (tower base class, WASM bridge, event bus, score / state DTOs) are defined by the architecture lead so each member can ship independently.

---

## 17. Competitive Differentiation

| Game | Math depth | Role of math |
|------|------------|--------------|
| Defense Math | Elementary arithmetic | Gate (answer to fire) |
| Hooda Math Defense | Elementary arithmetic | Currency (math → gold) |
| Math Tower Defense (app) | Elementary arithmetic | Gate |
| Super Number Defense | Elementary arithmetic | Embedded (closest analogue) |
| **Math Defense (this project)** | **High-school → introductory university (functions, trig, matrices, limits, derivatives, integrals, probability)** | **Mechanic** — math IS the gameplay |

Unique features: coordinate-plane map, random polynomial paths preventing answer memorization, manual-input UX with terminology labels, talent-driven progression, Bayesian stealth assessment, deterministic replay with bit-exact server-side recompute.

---

## 18. Evaluation Strategy

### Creativity & Originality

- "Math IS the mechanic" — answering Hernández-Sabaté et al. (2015)'s call for genuine math-as-mechanic tower defense.
- Coordinate-plane map turns the gameboard itself into a math diagram.
- Randomized polynomial paths force transfer of understanding rather than memorization.
- Monty Hall and Chain-Rule events teach probability and calculus through gameplay decisions.
- Calculus tower's autonomous "pets" make differentiation and integration physically observable.

### Technical Execution

- HTML5 Canvas engine (fixed-step loop, renderer, collision, particle FX).
- C/WASM math core with deterministic FP and a musl-backed `pow`.
- DDD-layered FastAPI backend with optimistic locking, refresh-token rotation, and audit logging.
- Replay determinism v2 and `wasmtime-py` server recompute for anti-cheat.
- Bayesian stealth assessment with Q-matrix evidence and a recommender service.
- Live spectate via WebSocket pub/sub.

### Art & Design

- Coherent medieval-fantasy × pixel-art identity.
- Parchment Build-Phase panels with monospace input.
- Unicode tower glyphs for color-blind accessibility.
- Chiptune soundtrack and SFX bus.

### Presentation & Report

- Zero-install demo (Vue web app + WASM).
- Live tower-building demo where the audience types `m`, `b`, polynomials, etc.
- Performance comparison: JS fallback vs. WASM core.
- Report covers educational theory, Bayesian assessment, replay determinism, and competitive analysis.

---

## 19. Educational Theory Anchors

| Theory | Author | Manifestation |
|--------|--------|---------------|
| Bloom's Taxonomy | Bloom (1956) | Magic = Apply, Monty Hall = Evaluate, Matrix = Analyze, Calculus = Create |
| Zone of Proximal Development | Vygotsky (1978) | Per-star path multisets, progressive boss mechanics |
| Flow Theory | Csikszentmihalyi (1990) | No between-wave interrupts; difficulty curve matches mastery |
| Productive Failure | Kapur (2008) | Unlimited Build-Phase retries; every retry requires reasoning |
| Transfer Learning | — | Randomized paths prevent rote answers; force concept transfer |
| Game-Based Learning in TD | Hernández-Sabaté et al. (2015) | Direct response to the "math as mechanic" recommendation |
| Expected Value Decision-Making | Kahneman & Tversky (1979) | Monty Hall door choices; spell-vs-buff resource tradeoffs |
| Stealth Assessment | Shute (2011) | Bayesian Beta-Bernoulli posteriors over gameplay-derived evidence |
