# Math Defense — Final Project Specification

> **Status:** Reflects the live implementation as of **2026-05-16** (V2 Phase 5+). This document supersedes the earlier design draft. Where the historical draft and current code disagree, **the implementation wins** and is described here.
>
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
| Difficulty levels | 5 star tiers (1★ tutorial → 5★ expert) |

### Core Philosophy

**"Math IS the mechanic" — not "answer-a-question for coins".** Mathematical concepts directly form the operational mechanics of the game. The function parameters the player types decide projectile trajectories, attack regions, and tower interactions; mathematical understanding directly drives performance.

### Design Principles

- **Manual input, not sliders** — players must type math parameters (e.g. `m`, `b`, an angle, a polynomial). They cannot drag a slider and "watch the result". Every change forces them to reason from a visual goal back to a numeric value.
- **Terminology shown alongside actions** — Build Phase panels label inputs with their mathematical names ("slope `m`", "definite integral `∫`", "limit `lim`"), building a continuous association between the term and the intuition.
- **Productive Failure (Kapur, 2008)** — the Build Phase allows unlimited retries; parameters lock when the wave starts. Failure has learning value because every retry requires a new piece of reasoning.

---

## 2. V1 Draft vs. Current Implementation

A summary of the design evolution since the original v3 draft. The remainder of this document describes the **current** state.

| Aspect | V1 Draft | Current Implementation |
|--------|----------|------------------------|
| Towers | 6 towers (named differently) | **7 towers** — Magic, Radar A/B/C, Matrix, Limit, Calculus |
| Enemies | 5 slime variants + dragon boss | **10 enemies** — General, Fast, Strong, Split, Helper, Regenerator, Bulwark, Swarmling, Boss Type-A, Boss Type-B |
| Economy / abilities | Buff cards (drawn between waves) | **4 active Spells** (cast during wave, on cooldown) + **8 shop buffs** (Build Phase, time-based stacks) |
| Mid-run events | 3-card draw with curses | **Monty Hall** event (kill-value triggered) + **Chain Rule** challenge during Boss B |
| Difficulty | 4 hand-designed levels | **5 procedurally-generated star tiers** with curve multisets, wave counts, and enemy mixes per star |
| Progression | — | **27 achievements** (6 categories), **21-node talent tree** across all 7 towers, avatar unlocks |
| Competition | localStorage leaderboard | **4 leaderboard types** — global per-star (DENSE_RANK), per-class, per-challenge, territory rankings |
| Scoring | Simple gold-based score | Multi-factor formula `S1/S2/K → TotalScore` with kill-rate vs. cost-efficiency tradeoff (see §10) |
| Pre-run | — | **Initial Answer (IA)** — the player computes the common intersection of the level's curves before the run starts |
| Accounts | — | **Roles** (admin / teacher / student), classroom management with join codes, RBAC across API + router |
| Persistence | SQLite | **PostgreSQL 16** behind a DDD-layered FastAPI backend with optimistic locking on territory occupations |
| Boss mini-game | Fourier shield break | Boss A summons adds; **Boss B triggers a Chain-Rule multiple-choice question** at ~50% HP |

---

## 3. Map: A Living Coordinate Plane

The world **is** a 2D Cartesian plane.

- The origin `(0, 0)` is a glowing magic rune the player must defend; enemies reaching it drain HP.
- Towers occupy lattice points (e.g. `(3, 5)`).
- Enemies spawn at grid-edge points and march toward the origin along procedurally generated **polynomial paths** (degree 1–3, depending on star).
- All tower ranges are expressed as geometric regions on the plane (sectors, polynomial zones, intervals, etc.).

### Procedural Paths

At run start, the WASM `generate_level` routine samples a multiset of polynomial curves whose composition depends on the star tier. A rejection-sampling loop (≤ 8 batches × 50 attempts) ensures:

1. The curves share **exactly one** common intersection inside a chosen disclosure rectangle.
2. Spawn points sit on the grid boundary; each enemy walks along one curve toward `(0, 0)`.

| Star | Path multiset | Waves | Enemy mix |
|------|---------------|-------|-----------|
| 1 | Degree 1–2 polynomials, 2–4 curves | 3 | General |
| 2 | Adds degree 3, longer multisets | 4 | General, Fast, Bulwark |
| 3 | Denser mix of degrees 1–3 | 5 (last = Boss A) | Adds Strong, Split, Regenerator, Swarmling |
| 4 | Denser multisets, longer curves | 5 (last = Boss B) | Helper-heavy + Chain-Rule boss |
| 5 | Hardest multisets, longest curves | 5 (last = Boss B + Swarmling bursts) | All enemies; runs flagged `practice_mode` and excluded from the leaderboard |

> Trigonometric and logarithmic curves are used **only by the Magic tower's zone shapes**, not by enemy paths.

---

## 4. Visual Style

Medieval-fantasy × pixel art.

| Element | Color / treatment |
|---------|-------------------|
| Floor | Dark slate (`#1a1520` / `#252030` alternating) |
| Grid lines | Dim gold (`#3a3028`) — engraved runes |
| Axes | Bright gold (`#8b7342`) |
| Magic tower | Blue / arcane glyph (✦) |
| Radar A/B/C | Green family with distinct icons (◐ ◑ ◒) |
| Matrix tower | Purple (⊞) |
| Limit tower | Crimson with limit glyph (∞) |
| Calculus tower | Amber (∫) |
| Enemies | Red family with shape-coded silhouettes |
| Origin rune | Pulsing gold glow |

**Build Phase panels** use a parchment-on-stone treatment, gold borders, monospace input fonts, and label every field with its math term. The confirm button reads **"Cast Spell"** rather than "OK".

**HUD** shows: phase (Build / Wave X / Boss), gold, HP, score, spell cooldowns, and active buff timers.

**Accessibility**

- Unicode glyphs per tower (WCAG 1.4.1 — color-blind-safe).
- Keyboard placement: arrow keys + Enter; no pointer required (WCAG 2.2 SC 2.1.1).
- ARIA live region announces phase, wave, and result.
- Reduced-motion mode honored.

### 4.1 Visual Redesign delta (2026-05-16)

The Track-B redesign tracked in [`docs/V3_surgicalPlan/Visual_Redesign_Plan.md`](docs/V3_surgicalPlan/Visual_Redesign_Plan.md) replaces the original "geometric tower vs. cartoon slime" split with a single math-themed vocabulary. Phases 0–6 have shipped; this delta supersedes the silhouette rows in the §4 table above where they disagree.

**Towers — mathematical instruments.** All seven tower bodies fit a 22×22 px silhouette above a shared baseplate. Tier rings (T2 gold rim, T3 rotating sub-glyph ring) read tier at a glance.

| Tower | Instrument body | Companion VFX aligned |
|-------|-----------------|------------------------|
| Magic | Parchment scroll with a breathing polynomial / sinusoid curve | `MagicZoneRenderer` zone curve |
| Radar A | Sextant with a sweeping arm | `RadarRangeRenderer` sweep arc |
| Radar B | Astrolabe with two counter-rotating rings | `RadarRangeRenderer` rotating ring |
| Radar C | Brass telescope on tripod that tracks the nearest enemy | `RadarRangeRenderer` scope cone |
| Matrix | Floating 2×2 bracket pair `[ ]` with scrolling digits; diagonal-cell flash on fire | `MatrixLaserRenderer` beam |
| Limit | Dashed asymptote pair flanking an ascending point; bound-snap on fire | Range preview only |
| Calculus | Rotating `∫` sigil shedding `dx` / `dy` particles toward target | Range preview only |

**Enemies — math-error chaos constructs.** Slime bodies and kawaii faces are dropped wholesale. Every enemy is built from a glyph body + cyan/magenta chromatic-aberration fringe + a behaviour-tied motion modifier. Status auras (frost, regen, helper) and HP/shield bars are retained on the new bodies. Glyph mapping:

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

**Phase 6.5 — Pet visual alignment.** Decision: **6.5-A taken** (align). Pets are recast as math-helper glyphs sharing the construction recipe of enemies but with a **cyan-only fringe** so allied vs. hostile reads at a glance. Glyph mapping: `½` (slow) / `→` (fast) / `×` (heavy) / `+` (basic). The legacy allied aura ring + orbiting satellites are retained as the "friendly buff field" cue. Rationale: pets are visible on the same field as towers and enemies; leaving them on cartoon art creates a third visual style at odds with both. Cost was ~1 day; risk is zero (the fringe-color override is additive to `drawGlyphBody`, defaulting to the hostile cyan/magenta pair so no enemy callsite changed).

**Spells — re-skin completed (Spell_Reskin_Plan Phases 0–2, 2026-05-16).** `SpellEffectRenderer` was migrated to extend `EffectLayer` (Phase 0) and each spell rebuilt as a glyph-centred composition (Phase 1, Option A): Fireball = `eˣ` rising from cast point with expanding shockwave rings; Frost Nova = `lim → 0` with concentric contour rings collapsing inward (load-bearing motion that distinguishes it from the Regenerator's static `lim`); Lightning = `δ` at the strike point with a chromatic vertical bolt; Haste = `d/dt` drifting upward over a green/gold aura with radiating speed lines. All four use the player-action **gold-only fringe** (`#ffd700` / `#c47206`) — distinct from enemies (cyan/magenta) and pets (cyan-only). The same glyph mapping appears on `SpellBar.vue` icons and in the `public/manual/*.md` spell tables. Reduced-motion contract (Phase 2) is documented in the **Reduced-motion contract** paragraph below.

**Event surface added by the redesign.** `Events.TOWER_FIRED` (emitted by `CombatSystem` at projectile spawn) and `Events.ENEMY_DYING` (emitted by `SplitPolicy.killEnemy` for combat kills only — origin-breach removals stay instant). Both are registered in `EVENT_HANDLER_REGISTRY` and gated by `npm run event-registry-check`. The `Enemy.dying / dyingTimer / deathMaxTime` fields extend the entity lifecycle so corpses can play a ~0.35 s (regular) or ~1.20 s (boss) death animation without holding up the combat resolution — `alive` flips to `false` at t=0 exactly as before.

**Reduced-motion contract.** `useReducedMotion` (`composables/useReducedMotion.ts`) and the engine-side `prefersReducedMotion()` helper provide a single source of truth. When the user opts in: `ShakeController` produces zero offset; `DeathParticleRenderer` halves both particle count and lifetime; `TowerLifecycleRenderer` collapses the upgrade pillar + rune sweep to a static colored flash; HUD value-pops drop the scale keyframe but keep the colour flash. `SpellEffectRenderer` drops each spell's motion-intensive layer — Fireball loses the expanding shockwave rings (heat bloom kept as static flash); Frost Nova drops the inward-collapsing contour rings (`→ 0` arrow inside the glyph carries the Regenerator differentiator per Spell_Reskin_Plan §2.4); Lightning drops the chromatic offset passes and renders a single white bolt; Haste drops the upward drift + radiating speed lines (aura halo + static glyph kept above the tower). Identity-bearing visuals (silhouette, colour, glyph) are never removed.

---

## 5. Tower System (7 towers)

Every tower has three tiers (T2: +25% damage, +10% range; T3: +50% damage, +20% range plus a type-specific bonus). Talent-tree modifiers are snapshotted **at placement time**.

| # | Tower | Concept | Star unlock | Mechanic |
|---|-------|---------|-------------|----------|
| 1 | **Magic Tower** (✦) | Function curves (polynomial / trig / log) and zones | 1★ | Player types a curve; the tower projects damage / buff / debuff zones around the curve. Strength × duration scales with talents. |
| 2 | **Radar A — Sweep** (◐) | Continuous arc sweep; sector-area AoE | 1★ | Inputs: start angle `θ`, sweep width `Δθ`, radius `r`. Damage-per-second to enemies inside the sector. |
| 3 | **Radar B — Rapid** (◑) | Fast projectiles within an arc | 2★ | Shortest cooldown of the Radar family; ideal for swarms. |
| 4 | **Radar C — Sniper** (◒) | Slow, heavy long-range shots | 2★ | Highest single-shot damage at the longest range. |
| 5 | **Matrix Tower** (⊞) | 2×2 matrix on a tower pair | 2★ | Pair two towers; the dot product of their attack vectors drives damage. Lasers lock onto targets and the damage ramps over time. |
| 6 | **Limit Tower** (∞) | Limits of functions | 3★ | The tower asks a multiple-choice limit question; the answer (`+∞ / −∞ / ±C / 0 / const`) determines its attack range type. |
| 7 | **Calculus Tower** (∫) | Differentiation and integration | 3★ | Player picks a polynomial **and** chooses `d/dx` or `∫`. The tower spawns autonomous "pets" whose movement & damage follow the power rule applied to the chosen polynomial. |

### WASM-backed tower math

Tower mechanics call into the deterministic C/WASM core (see §11):

- `matrix_multiply` — Matrix tower's paired-tower transform.
- `sector_coverage`, `point_in_sector` — Radar towers' range and hit checks.
- `numerical_integrate` — Calculus tower's trapezoid-rule integration.
- `curve_evaluate`, `curve_derivative`, `curve_in_domain` — Magic and Calculus zones / pets.

---

## 6. Enemy System (10 enemies)

| Enemy | HP | Speed | Gold | Kill-value | Special |
|-------|----|----|------|------------|---------|
| General | 30 | 2.0 | 15 | 10 | Baseline |
| Fast | 15 | 4.0 | 10 | 5 | 2× speed, low HP |
| Strong | 120 | 1.0 | 40 | 25 | Tank |
| Split | 40 | 2.0 | 15 | 5 | Splits into 2 Generals on death |
| Helper | 35 | 2.0 | 30 | 15 | Aura (r=3): +5 HP/s and +20% speed to allies |
| Regenerator | 80 | 1.5 | 35 | 20 | Regenerates 18 HP/s |
| Bulwark | 220 | 0.9 | 50 | 30 | Takes only 40% of tower damage (pets and player effects bypass) |
| Swarmling | 12 | 3.2 | 6 | 4 | Takes only 35% of tower damage (Calculus pets bypass) |
| **Boss Type-A** | 500 | 0.8 | 200 | 100 | 200-HP shield; summons a General every 8 s |
| **Boss Type-B** | 600 | 0.7 | 300 | 150 | 250-HP shield; summons a Fast every 8 s; triggers **Chain Rule** event at ~50% HP |

`Kill-value (KV)` is the threshold currency for Monty Hall and contributes to the kill-rate term `S1` in the score formula.

---

## 7. Spells & Shop Buffs

The historical "buff card draw" has been replaced by two distinct systems.

### 7.1 Active Spells (4) — cast during a wave

| Spell | Cost | Cooldown | Effect |
|-------|------|----------|--------|
| Fireball | 80 g | 12 s | 60 AoE damage, radius 3 |
| Frost Nova (`slow`) | 60 g | 15 s | Slow enemies to 40% speed inside radius 4 for 5 s |
| Lightning | 100 g | 18 s | 150 single-target damage |
| Haste | 120 g | 25 s | +tower attack speed for 8 s |

### 7.2 Shop Buffs (8) — bought during the Build Phase, time-based stacks

Sharpen Blades (+20% damage), Overclock (+15% attack speed), Far Sight (+15% range), Quagmire (−15% enemy speed), Corrode Armor (+10% damage taken), Heal 5 / Heal 10, Ward Shield (halve next 3 hits), Prospector (2× gold for the next wave).

> The earlier "Rejuvenate" spell from the V1 draft is **not** implemented; no other documented mechanic depends on it.

---

## 8. Mid-Run Events

### 8.1 Monty Hall

Triggered when cumulative kill-value crosses a star-specific threshold.

- Player picks a door; the system reveals one losing door; player chooses to stay or switch.
- The classic 3-door variant offers a 2/3 advantage to switching; a 5-door variant raises this to 4/5.
- Reward pool: **Power Surge** (double damage), **Eagle Eye** (+50% range), **Time Warp** (−40% enemy speed), **Gold Rush** (3× gold), **Divine Blessing** (full HP), **Master Builder** (next 2 towers free).
- Reinforces conditional probability and expected-value reasoning each run.

### 8.2 Chain Rule (Boss Type-B)

At ~50% boss HP the game presents a multiple-choice derivative problem (chain rule on a composition).

- **Correct:** massive bonus damage to the boss + 100 gold.
- **Wrong / skip:** the boss heals.

---

## 9. Progression

### 9.1 Initial Answer (IA)

Before each run, the player sees the level's curves displayed inside a disclosure rectangle that contains their single common intersection. The player enters the intersection `(x, y)` exactly (fractions, integers, or exact decimals are accepted).

| Choice | Effect |
|--------|--------|
| Correct answer | `initialAnswer = 1` (sharpens the score exponent — see §10) |
| Wrong | Refund 50 g, `initialAnswer = 0` |
| "Proceed (paths hidden)" | `initialAnswer = 0`; the path overlay is hidden during play |

A **rolling IA accuracy** over the last 10 sessions is tracked per user; on 1★ the path overlay opacity fades as accuracy rises, gradually weaning students off the visual aid.

### 9.2 Achievements

**27 achievements** across 6 categories: combat, scoring, efficiency, survival, exploration, territory. Some scale with seasonal multipliers. Each unlock grants talent points.

### 9.3 Talent Tree

**21 nodes** distributed across the 7 tower types, organised as linear prerequisite chains:

| Tower | Nodes |
|-------|-------|
| Magic | 3 |
| Radar A | 2 |
| Radar B | 3 |
| Radar C | 3 |
| Matrix | 3 |
| Limit | 2 |
| Calculus | 3 |

Each node has `maxLevel = 2` or `3` and grants a per-tower multiplier (damage, range, attack / sweep speed, target count, zone width / strength, Magic duration, Matrix ramp rate, Calculus pet damage / speed / HP). Talent effects are **snapshotted at tower placement** so mid-run respecs do not retroactively buff existing towers.

### 9.4 Stealth Assessment & Adaptive Recommendations

A Bayesian **Beta-Bernoulli** posterior per competency is updated from in-game evidence using a Q-matrix linking towers / events to skills. The Application layer's recommender service surfaces a suggested star tier and a next talent node based on the current posterior.

### 9.5 Empirical Validity Probe

Optional A/B study enrollment: pre-test, post-test, delayed post-test, plus affect surveys (math anxiety + intrinsic motivation, Likert). Data exportable as CSV for analysis.

---

## 10. Scoring

`compute_total_score` is implemented in C/WASM, mirrored in TypeScript for live display, and recomputed on the backend during anti-cheat validation.

```
activeTime  = max(0.001, totalTime − Σ buildPhaseTime)
S1          = killValue / activeTime                  (kill rate)
S2          = killValue / costTotal   if costTotal > 0 else 0   (cost efficiency)
K           = 0.7·S1 + 0.3·S2   if S1 ≥ S2
              0.5·S1 + 0.5·S2   otherwise
exponent    = 1 / max(1, 1 + (2 + healthOrigin − healthFinal − initialAnswer))
TotalScore  = max(0, K)^exponent
```

Edge cases:

- `costTotal = 0` (no towers built) ⇒ `S2 = 0`, `K = 0.7·S1` (30% penalty).
- A correct **Initial Answer** sharpens the exponent toward 1 (higher score), so understanding the level geometry up-front is materially rewarded.

### Anti-cheat replay (V2)

The backend uses `wasmtime-py` to load the same WASM module the browser ran, replays the recorded event stream, and recomputes the score with the same musl-backed `pow`. Any deviation > `1e−4` rejects the submission with `HTTP 422 replay_mismatch`.

---

## 11. WASM Core

The C source (compiled with deterministic floating-point flags: `-fno-fast-math -ffp-contract=off`) exports **17 user-facing functions** plus `_malloc` / `_free`.

| Category | Exports |
|----------|---------|
| Tower mechanics | `matrix_multiply`, `sector_coverage`, `point_in_sector`, `numerical_integrate` |
| Level generation | `find_pair_intersections`, `find_all_curves_common_point`, `count_common_intersections_in_interval`, `compute_spawn_points`, `generate_level`, `curve_evaluate`, `curve_derivative`, `curve_in_domain` |
| Replay-v2 PRNG | `prng_seed`, `prng_next_u32`, `prng_next_f64` (PCG XSL-RR 64/32) |
| Scoring | `compute_total_score`, `power_f64` (musl `pow` for bit-exact recompute) |

Two replay versions are supported:

- **v1** — `mulberry32` JS PRNG + native `Math.*`, tolerance `ε = 5e−4`.
- **v2** — PCG WASM PRNG + musl transcendentals; **bit-exact** server / client recomputation.

A pure-TypeScript fallback in `frontend/src/engine/WasmBridge.ts` mirrors every export, and Vitest parity tests guard divergence.

---

## 12. Backend Architecture (DDD)

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
└────────────────────────────┘    │  PostgreSQL 16 (25 tables, Alembic)     │
                                  └──────────────────────────────────────────┘
```

| Layer | Responsibilities |
|-------|------------------|
| **Domain** | Pure Python; no FastAPI / Pydantic / SQLAlchemy imports. Aggregates (`User`, `GameSession`, `LeaderboardEntry`, `Achievement`, `Talent`, `Class`, `Territory`, `Challenge`, `Season`), value objects (`SessionStatus`, `Level`, `Score`, `GameResult`), policies, repository protocols. |
| **Application** | 13+ services orchestrating use cases (auth, session, leaderboard, achievement, talent, class, admin, territory, assessment, recommender, challenge, replay, study). Receives repositories through DI. `SessionEventBus` dispatches post-commit consumers (leaderboard, achievements, competency, study) in separate Units of Work. |
| **Infrastructure** | SQLAlchemy repositories, `UnitOfWork` with explicit commit, login guard, token denylist, audit logger, email service, territory-settlement scheduler (5-minute job), in-process spectate hub, `wasm_runtime` singleton for FU-A score recompute. |
| **HTTP** | Thin routers; domain errors carry `status_code`; a single global exception handler maps them to HTTP responses. |

---

## 13. Roles, Classrooms, and Leaderboards

### Roles

- **admin** — manages teachers, classes, students, seasons.
- **teacher** — creates classes (8-character uppercase `join_code`), authors generative challenges, opens territory activities, views per-class competency posteriors, exports study data.
- **student** — default role; joins a class by code; plays runs.

RBAC is enforced both in Vue Router guards and in FastAPI middleware.

### Classroom Management

Teachers can manage students and remove memberships with a **soft delete** so removed students cannot rejoin with the old code.

### Leaderboard Types

| Type | Scope | Notes |
|------|-------|-------|
| Global per-star | Difficulty 1–5★ | `DENSE_RANK` ordering, personal-best timeline |
| Per-class | Class-scoped | Teacher view |
| Per-challenge | Per generative challenge | Soft-deleting a challenge cascades removal from its board |
| Territory rankings | Per activity slot | Optimistic locking on occupations; snapshots track historical rank deltas |

A separate "Grabbing Territory" activity layer hosts classroom competition with the territory leaderboard above it.

---

## 14. Game Flow

```
Build Phase                              Wave Phase
┌───────────────────────────────┐        ┌───────────────────────────────┐
│ • See enemy path equations    │        │ • Enemies march toward origin │
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
- **End-of-run** shows total score, kills, leaderboard delta, achievements unlocked, and talent points earned.

---

## 15. Manual & Audio Subsystems

- **In-game Manual** — a modal renders Markdown directly from `frontend/public/manual/` (`game-mechanics.md`, `towers-and-enemies.md`, …). Updating a tower or mechanic is a documentation-only change.
- **Audio bus** — `HTMLAudioElement`-backed asset manager with polyphony cap, randomized jitter, crossfade, and three buses (music / SFX / UI). SFX definitions are mapped to gameplay events (tower fire, enemy death, boss arrival, Monty Hall reveal, IA correct).

---

## 16. Schedule (6–7 weeks)

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

## 17. Team Division

| Member | Primary surface |
|--------|-----------------|
| **Junior (architecture & math core)** | Game engine, Canvas renderer, `math_engine.c`, WASM bridge, level generator, scoring formula, enemy systems, all towers, replay v2, anti-cheat backend recompute. |
| **Sophomore (Radar family)** | Radar A / B / C towers (Build-Phase inputs, sector preview, hit detection, DPS), plus shared tower scaffolding extensions. |
| **Freshman (UI & presentation)** | HUD, parchment Build-Phase panels, shop UI, Monty Hall modal, spell-cast indicators, main menu, leaderboard pages, classroom dashboards, accessibility polish, asset packs, manual content, report & slides. |

Shared interface contracts (tower base class, WASM bridge, event bus, score / state DTOs) are defined by the architecture lead so each member can ship independently.

---

## 18. Competitive Differentiation

| Game | Math depth | Role of math |
|------|------------|--------------|
| Defense Math | Elementary arithmetic | Gate (answer to fire) |
| Hooda Math Defense | Elementary arithmetic | Currency (math → gold) |
| Math Tower Defense (app) | Elementary arithmetic | Gate |
| Super Number Defense | Elementary arithmetic | Embedded (closest analogue) |
| **Math Defense (this project)** | **High-school → introductory university (functions, trig, matrices, limits, derivatives, integrals, probability)** | **Mechanic** — math IS the gameplay |

Unique features: coordinate-plane map, random polynomial paths preventing answer memorization, manual-input UX with terminology labels, talent-driven progression, Bayesian stealth assessment, deterministic replay with bit-exact server-side recompute.

---

## 19. Evaluation Strategy

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

## 20. Educational Theory Anchors

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
