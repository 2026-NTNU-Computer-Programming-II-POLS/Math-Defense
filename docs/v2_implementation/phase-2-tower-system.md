# Phase 2 — Tower System

> **Goal**: Implement all 5 V2 tower types (Magic, Radar A/B/C, Matrix, Limit,
> Calculus) with grid-intersection-point placement and the new pet system.

**Prerequisites**: Phase 1 (path system — needed for Magic tower zone rendering,
legal placement calculation, and grid-point coordinate system).

---

## 2.1 Grid Intersection Point Placement

V2 towers are placed on **grid intersection points** (lattice points), not
inside grid cells as in V1.

### Changes

| File | Action |
|------|--------|
| `frontend/src/systems/TowerPlacementSystem.ts` | Rewrite — snap placement to nearest grid intersection; validate against path clearance |
| `shared/game-constants.json` | Modify — add `grid.point_spacing` (distance between intersection points), `grid.path_clearance` (minimum distance from any path) |

### Legal Placement Generation

At level start, pre-compute the set of legal grid intersection points:

```
For each intersection point (ix, iy) on the grid:
  For each path curve f:
    d = min distance from (ix, iy) to curve f
    if d < path_clearance: mark as illegal
  If not illegal: add to legal_positions set
```

### Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/domain/placement/legal-positions.ts` | Pre-compute and cache legal grid intersection points for the current level |

---

## 2.2 Tower Type Architecture

Replace V1's 6 tower types with V2's 5 types. Each tower shares a base
interface but has unique mechanics.

### V1 → V2 Tower Mapping

| V1 Tower | V2 Replacement |
|----------|---------------|
| FunctionCannon | Magic Tower |
| RadarSweep | Radar Tower (now 3 sub-types) |
| MatrixLink | Matrix Tower (dot product, not 2×2 matrix) |
| ProbabilityShrine | REMOVED (replaced by Monty Hall events) |
| IntegralCannon | Calculus Tower (derivative/integral + pets) |
| FourierShield | REMOVED (replaced by Boss Type-B chain rule) |

### Files to Modify / Create

| File | Action |
|------|--------|
| `frontend/src/data/tower-defs.ts` | Rewrite — define 5 tower types (Magic, RadarA, RadarB, RadarC, Matrix, Limit, Calculus) with base stats, costs, upgrade paths |
| `frontend/src/entities/types.ts` | Modify — update Tower interface: add `towerKind`, sub-type discriminator, mode (for Magic), radian interval config (for Radar), pair reference (for Matrix) |
| `frontend/src/entities/TowerFactory.ts` | Modify — factory for new tower types |

---

## 2.3 Magic Tower

### Mechanic

The tower's assigned function is drawn on the map as a visible curve. The curve
acts as a zone of effect. The player chooses one of two modes:

| Mode | Effect |
|------|--------|
| **Debuff enemies** | Enemies passing through the curve zone receive a debuff (slow, damage-over-time, etc.) |
| **Buff allied towers** | Allied towers on or near the curve receive a stat buff (damage, attack speed, etc.) |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/MagicTowerSystem.ts` | Create — manages zone effect: detects entities intersecting the curve, applies buff/debuff |
| `frontend/src/renderers/MagicZoneRenderer.ts` | Create — renders the function curve as a glowing zone overlay on the map |
| `frontend/src/components/game/MagicModePanel.vue` | Create — UI for toggling debuff/buff mode per Magic tower |

### Function Selection

When placing a Magic tower, the player chooses its function:

1. System generates **3 candidate functions** (one per available family:
   polynomial, trig, log — filtered by what the current level's path types use).
2. Each candidate is previewed on the map as a translucent curve so the player
   can see its zone coverage before committing.
3. Player selects one. The function is locked to the tower for the rest of
   the level.

### Design Notes

- The curve is drawn using the same math engine from Phase 1.
- Zone width (thickness around the curve) is a tunable constant.
- Function assignment: each Magic tower gets one function (n=1).

---

## 2.4 Radar Tower (A / B / C)

### Sub-types

All three share a circular base range but differ in behavior. They are
**purchased separately** and **cannot switch** type after placement.

### Radian Interval Mechanic

Every Radar tower has a configurable **arc sector** within its circular range:

```
Full circle = [0, 2π)
Arc sector  = [θ_start, θ_end]  (player-configurable, with max arc cap)
```

Within the arc:
- Attack speed and/or damage receive a **bonus multiplier**.
- Optionally: tower can be **restricted** to only attack within the arc.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/RadarTowerSystem.ts` | Create — handles all 3 sub-types: sweep (A), fast-fire (B), sniper (C); arc sector bonus logic |
| `frontend/src/renderers/RadarRangeRenderer.ts` | Create — renders circular range + highlighted arc sector overlay |
| `frontend/src/components/game/RadarConfigPanel.vue` | Create — UI for configuring arc sector (angle slider / drag), toggle restrict-to-arc |

### Sub-type Specifics

| Type | Targeting | Attack Pattern | Key Stat |
|------|-----------|----------------|----------|
| A | No target selection | Continuous sweep around circle, AoE damage on contact | Sweep speed, AoE width |
| B | Single target (selectable) | Fast single projectiles | Attack speed, damage per hit |
| C | Single target (selectable) | Slow powerful shots | Damage per hit, range |

---

## 2.5 Matrix Tower

### Mechanic

Two Matrix towers form a **pair**. Each tower's grid coordinates become a
vector. The base damage is the **dot product** of the two vectors.

```
Tower A at (x1, y1) → row vector [x1, y1]
Tower B at (x2, y2) → column vector [x2, y2]^T
base_damage = x1*x2 + y1*y2
```

The pair locks a **laser** onto one target in the overlap zone. Damage
**increases over time** while the laser stays connected.

### Pairing Logic

- When a player places a second Matrix tower, it automatically pairs with the
  nearest unpaired Matrix tower.
- Player can manually re-pair towers via UI.
- A lone Matrix tower has no effect until paired.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/MatrixTowerSystem.ts` | Create — pairing logic, overlap zone calculation, laser targeting, damage ramp |
| `frontend/src/renderers/MatrixLaserRenderer.ts` | Create — renders laser beam between paired towers → target, with visual intensity scaling |
| `frontend/src/components/game/MatrixPairPanel.vue` | Create — UI for viewing/managing tower pairs |

---

## 2.6 Limit Tower

### Mechanic

Tower placed at grid point with x-coordinate = a. System presents a
multiple-choice question: evaluate `lim f(x)/(x-a) as x→a`.

| Result | Effect |
|--------|--------|
| +∞ | Max damage to enemies |
| +C (positive finite) | Moderate damage |
| 0 | Tower removed, no refund |
| Non-zero constant | Tower disabled |
| -C (negative finite) | Moderate heal to enemies |
| -∞ | Max heal to enemies |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/LimitTowerSystem.ts` | Create — question generation, answer evaluation, effect application |
| `frontend/src/math/limit-evaluator.ts` | Create — symbolically or numerically evaluate limits of f(x)/(x-a) for given f and a |
| `frontend/src/components/game/LimitQuestionPanel.vue` | Create — multiple-choice UI for limit evaluation |

### Question Generation

1. Pick a function f(x) from a pool (polynomials, trig, log).
2. Compute the true limit of f(x)/(x-a) as x→a.
3. Generate distractor answers (other limit values, including ±∞, 0, constants).
4. Present as multiple choice.

---

## 2.7 Calculus Tower (Pet System)

### Mechanic

System offers 3-5 preset single-term functions. Player picks one, then
chooses: 1st derivative, 2nd derivative, or integral. Result `C*x^n`
determines pet spawning.

### Pet Entity

Pets are autonomous companion units that fight within the tower's effective
range. They are a new entity type, distinct from towers and projectiles.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/CalculusTowerSystem.ts` | Create — function selection, operation application, pet spawning logic, wave chaining |
| `frontend/src/entities/PetEntity.ts` | Create — pet unit: position, HP, attack behavior (slow/fast/high-damage/basic), ability modifier |
| `frontend/src/entities/PetFactory.ts` | Create — spawn C pets (or 1 weakened pet for fractional C) |
| `frontend/src/systems/PetCombatSystem.ts` | Create — pet targeting, attacking, trait effects |
| `frontend/src/renderers/PetRenderer.ts` | Create — render pet sprites within tower range |
| `frontend/src/components/game/CalculusPanel.vue` | Create — function selection UI, operation choice, current result display |

### Pet Behavior Table

| Exponent (n) | Trait |
|-------------|-------|
| 1 | Slow-down (slows enemies) |
| 2 | High attack speed |
| 3 | High damage |
| n > 3 or n < 0 | Basic attack only |
| 0 (constant) | Tower disabled, no pets |
| result = 0 | Tower removed, no refund |

### Coefficient Rules

| Coefficient C | Pets | Ability |
|--------------|------|---------|
| Integer (e.g., 4) | C pets | Full strength |
| Fraction (e.g., 1/4) | 1 pet | Ability × C (weakened) |

### Preset Function Pool

The 3–5 preset functions are generated **per tower placement** (not per level
or per wave). Generation rules:

1. All presets are single-term monomials: `a * x^n` where a is a small
   integer or simple fraction, n ∈ {1, 2, 3, 4}.
2. At least one preset should produce an "interesting" derivative (non-zero,
   non-constant after one operation).
3. At least one preset should be a "trap" (leads to result=0 or constant
   after a likely operation, disabling or removing the tower).

The pool is shown on the `CalculusPanel.vue` as buttons with the function
rendered via `<MathDisplay>`.

### Wave Chaining

Each wave, the player can pay gold to apply another derivative or integral
to the **current result**, chaining transformations. The function offered is
always the current state — so the result always remains a monomial.

---

## 2.8 Tower UI Overhaul

### Build Panel

| File | Action |
|------|--------|
| `frontend/src/components/game/BuildPanel.vue` | Rewrite — show 5 tower categories (Magic, Radar, Matrix, Limit, Calculus); Radar expands to A/B/C sub-options with different prices |

### Tower Info / Upgrade Panel

| File | Action |
|------|--------|
| `frontend/src/components/game/TowerInfoPanel.vue` | Create — shows selected tower stats, type-specific info (Magic mode, Radar arc, Matrix pair, Limit result, Calculus current function), upgrade button |

---

## 2.9 In-Game Tower Upgrade System

Separate from the persistent Talent system (Phase 5), each placed tower can
be upgraded during a level by spending gold. These upgrades reset when the
level ends. See V2.md Section 7.6 for the full stat table.

### Upgrade Tiers

| Level | Cost (% of base price) | Generic Bonus |
|-------|----------------------|---------------|
| 1 (base) | — | — |
| 2 | 60% | +25% damage, +10% range |
| 3 | 100% | +50% damage, +20% range, +15% attack speed |

Each tower type has additional type-specific bonuses per level (e.g., Radar B
gains +1 target count at Level 2).

### Stat Stacking

```
effective_stat = base_stat * (1 + in_game_bonus) * (1 + talent_bonus) * active_buffs
```

### Implementation

| File | Action |
|------|--------|
| `frontend/src/data/tower-defs.ts` | Extend — add `upgrade_costs`, `upgrade_bonuses` per tower type per level |
| `frontend/src/systems/TowerUpgradeSystem.ts` | Create — handles upgrade requests, deducts gold via EconomySystem, applies stat changes |
| `frontend/src/components/game/TowerInfoPanel.vue` | Extend — "Upgrade" button with cost display, current level indicator, next-level stat preview |

---

## 2.10 Projectile System Update

V1 assumes all towers fire projectiles. V2 tower types use varied attack
patterns:

| Tower | Attack Mechanism | Uses Projectiles? |
|-------|-----------------|-------------------|
| Magic | Zone effect on map | No |
| Radar A | Sweep AoE | No (direct AoE) |
| Radar B | Fast single-target shots | **Yes** |
| Radar C | Slow powerful shots | **Yes** |
| Matrix | Laser lock-on | No (continuous beam) |
| Limit | Instant effect from question answer | No |
| Calculus | Pets attack autonomously | No (pet entities) |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/CombatSystem.ts` | Rewrite — dispatch by tower type: only Radar B/C create projectiles; others use their dedicated system |
| `frontend/src/renderers/ProjectileRenderer.ts` | Modify — only renders projectiles from Radar B/C; add distinct visual styles per sub-type |

---

## 2.11 Remove V1 Tower Code

| File | Action |
|------|--------|
| `frontend/src/data/tower-defs.ts` | V1 definitions removed as part of rewrite |
| `frontend/src/components/game/FunctionPanel.vue` | Remove (V1 FunctionCannon UI) |
| `frontend/src/components/game/IntegralPanel.vue` | Remove (V1 IntegralCannon UI) |
| `frontend/src/components/game/MatrixInputPanel.vue` | Remove (V1 MatrixLink UI) |
| `frontend/src/components/game/BuffCardPanel.vue` | Remove (V1 ProbabilityShrine UI) |
| `frontend/src/systems/CombatSystem.ts` | Modify — integrate with new tower systems instead of V1 tower types |

---

## Acceptance Criteria

- [ ] Towers snap to grid intersection points; illegal positions (too close to paths) rejected.
- [ ] Magic tower: function curve renders on map; debuff/buff mode toggleable; zone effect applies correctly.
- [ ] Radar A: sweeps continuously, AoE damage. Radar B: fast single-target. Radar C: slow high-damage.
- [ ] Radar: arc sector configurable; bonus applies within arc; restrict-to-arc option works.
- [ ] Matrix: two towers pair; dot product calculates correctly; laser renders; damage ramps over time.
- [ ] Limit: multiple-choice question presents; all 6 outcome categories (±∞, ±C, 0, constant) handled correctly.
- [ ] Calculus: function selection works; derivative/integral computed correctly; pets spawn with correct count and trait.
- [ ] Calculus: fractional coefficient → 1 weakened pet. Exponent out of 1-3 → basic attack only. Result 0 → tower removed.
- [ ] Calculus: wave chaining works (pay gold, apply operation to current result).
- [ ] Build panel shows all tower options with correct prices.
- [ ] In-game upgrade: Level 2 and 3 upgrades apply correct stat bonuses; gold deducted; cost_total tracked.
- [ ] Stat stacking: in-game upgrade × talent × buff all multiply correctly.
- [ ] Magic function selection: 3 candidates shown with preview; player picks one; locked after selection.
- [ ] Calculus preset pool: 3–5 monomials generated per placement; at least one "trap" included.
- [ ] Projectile system: only Radar B/C produce projectiles; other towers use their dedicated attack mechanisms.
- [ ] All V1 tower code removed; no dead imports or unused components.
