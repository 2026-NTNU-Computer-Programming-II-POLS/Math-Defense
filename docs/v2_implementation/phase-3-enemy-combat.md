# Phase 3 — Enemy & Combat System

> **Goal**: Replace V1's slime-themed enemies with V2's 5 standard types plus
> 2 boss variants. Implement kill-value scoring, math-curve pathing, and the
> Boss Type-B chain rule challenge.

**Prerequisites**: Phase 1 (path system — enemies follow math curves),
Phase 2 (tower system — combat interactions).

---

## 3.1 Enemy Type Definitions

### V1 → V2 Mapping

| V1 Enemy | V2 Replacement |
|----------|---------------|
| Basic Slime | General |
| Fast Slime | Fast |
| Tank Slime | Strong |
| Split Slime | Split |
| Stealth Slime | REMOVED |
| Boss Dragon | Boss Type-A / Type-B |
| (none) | Helper (new) |

### V2 Enemy Stats

| Type | HP | Speed | Kill Value | Gold Reward | Special |
|------|----|----|----|----|---------|
| **General** | Medium | Medium | Base | Base | None |
| **Split** | Low | Medium | Low | Low | Splits into 2-3 smaller units on death |
| **Strong** | High | Slow | High | High | None |
| **Fast** | Low | High | Low | Low | None |
| **Helper** | Medium | Medium | Medium | Medium | Buffs/heals nearby enemies |

Exact stat values are tuning parameters — define as constants in a data file.

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/src/data/enemy-defs.ts` | Rewrite — define 5 standard types + 2 boss types with full stat tables including kill_value |
| `frontend/src/entities/types.ts` | Modify — update Enemy interface: add `kill_value`, `enemy_kind`, split config, helper aura config |
| `frontend/src/entities/EnemyFactory.ts` | Modify — factory for new enemy types |

---

## 3.2 Kill Value System

V2 scoring uses **cumulative kill value**, not kill count. Each enemy type
has a different kill value, and bosses are worth significantly more than
standard enemies.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/EconomySystem.ts` | Modify — on enemy death, add `enemy.kill_value` (not flat +10) to cumulative total |
| `frontend/src/stores/` (game store) | Modify — track `cumulative_kill_value` separately from kill count |

### Kill Value Hierarchy (relative)

```
Boss Type-B > Boss Type-A >> Strong > Helper > General > Fast ≈ Split
```

---

## 3.3 Enemy Pathing on Math Curves

V1 enemies follow piecewise segment chains. V2 enemies follow continuous
math curves. The movement system needs to track progress along a curve
parametrically.

### Parametric Progress

Instead of "which segment, how far along it", track a single parameter `t`
representing progress along the curve from spawn to endpoint:

```
t = 0  → spawn point (boundary intersection)
t = 1  → endpoint (shared destination)

position(t) = (x(t), f(x(t)))
where x(t) interpolates from x_spawn to x_endpoint
```

For curves where x is not monotonic (e.g., some trig functions), use
**arc-length parameterization**: pre-compute a lookup table of
(arc_length → x) at level start.

### Files to Modify

| File | Action |
|------|--------|
| `frontend/src/domain/path/path-progress-tracker.ts` | Rewrite — parametric/arc-length progress along a CurveDefinition |
| `frontend/src/domain/movement/` | Modify — movement strategies use new parametric progress instead of segment progress |
| `frontend/src/systems/MovementSystem.ts` | Modify — update position from curve evaluator + progress tracker |

### Speed on Curves

Enemy speed is measured in **units per second along the curve** (arc-length
speed), not horizontal speed. This ensures enemies move at consistent
perceived speed regardless of curve steepness.

---

## 3.4 Split Enemy Mechanics

On death, a Split enemy spawns 2-3 smaller child enemies at the same position
and progress along the path.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/CombatSystem.ts` | Modify — on Split enemy death, spawn child enemies via EnemyFactory |
| `frontend/src/data/enemy-defs.ts` | Add split config: `split_count`, `child_type`, `child_scale` (HP/size multiplier for children) |

---

## 3.5 Helper Enemy

Helper enemies buff or heal nearby allies. They do not attack towers directly.

### Aura Mechanic

```
Every tick:
  For each enemy within helper_radius of this Helper:
    Apply buff (e.g., +20% speed, or heal X HP/sec)
```

### Priority Targeting Note

Helpers should be high-priority targets for the player. Their kill value
reflects this — moderate reward for eliminating a force multiplier.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/EnemyAbilitySystem.ts` | Create — processes Helper aura, Split death trigger, and future enemy abilities |

---

## 3.6 Boss Type-A

| Property | Value |
|----------|-------|
| **Shield** | Must be depleted before HP damage applies. Separate shield HP bar. |
| **High health** | Significantly more HP than Strong enemies. |
| **Minion generation** | Every N seconds, spawns a wave of minion enemies (General or Fast type). |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/EnemyAbilitySystem.ts` | Extend — Boss Type-A shield logic, minion spawn timer |
| `frontend/src/renderers/` | Modify — render shield bar above HP bar for shielded enemies |

---

## 3.7 Boss Type-B (Chain Rule Challenge)

Boss Type-B has all Type-A abilities **plus** a chain rule math challenge.

### Flow

```
Boss Type-B spawns
  → System displays: "What is f(g(x))' ?"
  → Multiple-choice options shown (one correct: f'(g(x)) · g'(x))
  │
  ├── Player answers CORRECTLY
  │   → Boss immediately splits into TWO separate enemies:
  │     Enemy 1: represents f'(g(x))  (reduced HP)
  │     Enemy 2: represents g'(x)     (reduced HP)
  │   Total HP of split < original boss HP → significant advantage
  │
  └── Player answers INCORRECTLY
      → Must defeat the original boss at full HP first
      → THEN boss splits into the same two enemies
      → Total fight = full boss HP + split enemies HP
```

### Split HP Distribution

When the boss splits (either immediately on correct answer, or after defeat
on wrong answer), the two child enemies receive:

| Child | HP | Speed |
|-------|----|-------|
| f'(g(x)) | 60% of original boss max HP | Same as boss |
| g'(x) | 40% of original boss max HP | 1.2× boss speed |

Total child HP = 100% of original. The advantage of answering correctly is
skipping the full boss fight (which has shield + minion generation), NOT
reduced total HP.

### Question Generation

1. Pick f(x) and g(x) from a pool of simple functions.
2. Compute f(g(x))' = f'(g(x)) · g'(x) (chain rule).
3. Generate distractor answers (common mistakes: f'(x)·g'(x), f'(g'(x)), etc.).
4. Present as multiple choice.
5. Use `<MathDisplay>` component (from Phase 1) to render all expressions.

### Files to Create / Modify

| File | Action |
|------|--------|
| `frontend/src/math/chain-rule-generator.ts` | Create — generates f, g, computes chain rule, produces distractors |
| `frontend/src/components/game/ChainRulePanel.vue` | Create — multiple-choice UI for chain rule question |
| `frontend/src/systems/EnemyAbilitySystem.ts` | Extend — Boss Type-B challenge trigger, split on correct/incorrect |

---

## 3.8 Wave Composition

Define how waves are composed for each star rating. Higher stars have more
enemies, more varied types, and bosses appear in later waves.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/WaveSystem.ts` | Modify — wave definitions now reference V2 enemy types; wave composition scales with star rating |
| `frontend/src/data/wave-templates.ts` | Create — wave composition templates per star rating (which types, quantities, spawn timing, boss waves) |

---

## 3.9 Enemy Reaching Endpoint

When an enemy reaches the shared endpoint (t = 1.0 along its path), it
deals damage to the player's HP and is removed. This is the core tower
defense loss mechanic carried forward from V1.

| Property | Value |
|----------|-------|
| **Damage per enemy** | `enemy.damage` (defined per enemy type in `enemy-defs.ts`) |
| **Trigger** | `path_progress >= 1.0` |
| **Effect** | `player_hp -= enemy.damage`; enemy deactivated |
| **Game over** | `player_hp <= 0` → level failed |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/MovementSystem.ts` | Verify — V1 endpoint-reach logic must work with new parametric progress (t=1.0 instead of segment chain end) |
| `frontend/src/data/enemy-defs.ts` | Ensure every enemy type has a `damage` value (damage dealt to player on reaching endpoint) |

---

## 3.10 Remove V1 Enemy Code

| File | Action |
|------|--------|
| `frontend/src/data/enemy-defs.ts` | V1 definitions removed as part of rewrite |
| Any stealth-related rendering/logic | Remove (Stealth Slime is removed in V2) |

---

## Acceptance Criteria

- [ ] All 5 standard enemy types spawn, move along math curves, and die correctly.
- [ ] Kill values correctly tracked: `cumulative_kill_value` reflects per-enemy values, not flat count.
- [ ] Split enemies spawn children on death at the same path position.
- [ ] Helper enemies buff/heal nearby allies with a visible aura effect.
- [ ] Boss Type-A: shield absorbs damage before HP; minions periodically spawn.
- [ ] Boss Type-B: chain rule question appears; correct answer → immediate split; wrong → full fight then split.
- [ ] Enemy movement along curves is smooth with consistent perceived speed (arc-length parameterization).
- [ ] Wave composition varies by star rating; bosses appear at appropriate wave numbers.
- [ ] Enemy reaching endpoint deducts correct damage from player HP; game over triggers at HP ≤ 0.
- [ ] Boss Type-B split HP: f'(g(x)) gets 60%, g'(x) gets 40% of original boss HP.
- [ ] Chain rule question rendered with KaTeX `<MathDisplay>` component.
- [ ] All V1 enemy definitions and stealth mechanics removed.
