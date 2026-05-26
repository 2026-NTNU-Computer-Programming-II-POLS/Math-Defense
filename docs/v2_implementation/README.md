# V2 Implementation Plan — Phase Overview

> Source of truth for requirements: [`v2_draft/V2.md`](v2_draft/V2.md)
>
> This directory contains the implementation plan broken into 7 sequential
> phases. Each phase document is self-contained with goals, prerequisites,
> file-level task lists, and acceptance criteria.

---

## Phase Summary

| Phase | Name | Focus | Prerequisites |
|-------|------|-------|--------------|
| [**0**](phase-0-foundation.md) | Foundation & Infrastructure | DB schema, User model (email/role), RBAC, Class management, join codes | — |
| [**1**](phase-1-path-system.md) | Path System & Level Generation | Math curve engine (7 path groups), reverse endpoint generation, difficulty stars, Initial Answer, KaTeX, engine wiring | Phase 0 |
| [**2**](phase-2-tower-system.md) | Tower System | Grid-point placement, 7 tower types, pet system, in-game upgrades, projectile system update | Phase 1 |
| [**3**](phase-3-enemy-combat.md) | Enemy & Combat | 5 standard + 2 boss types, kill values, curve pathing, chain rule, endpoint damage | Phase 1, 2 |
| [**4**](phase-4-economy-scoring-events.md) | Economy, Scoring & Wave Events | Money system, buffs/debuffs/spells, S1/S2/K scoring, Monty Hall, session sync, HUD, game store | Phase 2, 3 |
| [**5**](phase-5-progression.md) | Progression | Achievements, talent tree, profile/avatar | Phase 0, 2, 4 |
| [**6**](phase-6-classroom-competition.md) | Classroom & Competition | Grabbing Territory (with optimistic locking), 4 ranking types, teacher/admin dashboards, settlement | Phase 0–5 |

## Dependency Graph

```
Phase 0  (Foundation)
   │
   ▼
Phase 1  (Paths)
   │
   ├──────────┐
   ▼           ▼
Phase 2     Phase 3
(Towers)    (Enemies)   ← Phase 3 also needs Phase 2
   │           │
   └─────┬─────┘
         ▼
      Phase 4  (Economy / Scoring / Events)
         │
         ▼
      Phase 5  (Progression)
         │
         ▼
      Phase 6  (Classroom / Competition)
```

## Cross-Cutting Concerns

These items span multiple phases. Each is assigned to the phase that owns it,
but later phases build on the foundation.

| Concern | Owner Phase | Used By |
|---------|------------|---------|
| **KaTeX / `<MathDisplay>`** | Phase 1 (setup + IA) | Phase 2 (Limit, Calculus), Phase 3 (Boss Type-B) |
| **Engine wiring (`useGameLoop.ts`)** | Phase 1 (pluggable refactor) | Phase 2–4 (register new systems) |
| **Session sync (`useSessionSync.ts`)** | Phase 4 (full rewrite) | — |
| **Game store (`gameStore`)** | Phase 4 (state expansion) | — |
| **HUD overhaul** | Phase 4 (comprehensive) | — |
| **Stat stacking** (in-game × talent × buff) | Phase 2 (in-game upgrades) | Phase 4 (buffs), Phase 5 (talents) |
| **Projectile system** | Phase 2 (dispatch rewrite) | Phase 3 (enemy hit detection) |
| **Canvas coordinate system** | Phase 1 (review) | All rendering phases |

## New Tables Summary (All Phases)

| Phase | Tables Created |
|-------|---------------|
| 0 | `classes` (with `join_code`), `class_memberships` |
| 1 | (alter `game_sessions`: add star_rating, path_config, IA, timing fields) |
| 5 | `achievements`, `talent_allocations` |
| 6 | `grabbing_territory_activities`, `territory_slots`, `territory_occupations` |

## 2026-05 Balance Overhaul (player-visible changelog)

19 approved balance changes shipped in 8 phases across `feat/balance-overhaul-2026-05`. See [`balance-overhaul-plan.md`](balance-overhaul-plan.md) for the full plan and [`balance-after-2026-05.md`](balance-after-2026-05.md) for the post-deployment audit.

| Area | Change | Why |
|---|---|---|
| **Scoring** | `K^(1/√denom)` and continuous K blend | Smoother high-difficulty curve; no more `S1 == S2` jump |
| **Shield (Ward)** | Halves the next 3 hits instead of nullifying them | Boss still deals ~50 HP through an active shield |
| **BULWARK** | Takes 40% of all tower damage (pets/effects bypass) | Replaces the binary `damageCapPerHit: 14` cap |
| **MAGIC tower** | Zone deals AoE damage + applies slow | Distinct role from radar towers |
| **LIMIT tower** | Charge-up burst (×1.5 multiplier) | Distinct role; `+inf` instakill preserved |
| **MATRIX tower** | Base damage 1 (was 0) — fires while pairing | UI also shows "Pairing Required" hint |
| **Calculus pets** | Count = `floor(log2(coefficient + 1))` | Closes the `99x` → 99-pet exploit |
| **Pet talents** | `pet_hp` removed, `pet_range` (+20%/lv) added | `pet_hp` had no game effect; range matters |
| **Pet attack speed** | Linear `max(0.1, 1 - 0.1·(lv-1))` (was `0.85^(lv-1)`) | Less compounding at high levels |
| **Wave bonus** | `10 + 20·star` (was `25 + 8·star`) | High-star runs net richer; low-star gentler |
| **Enemy rewards** | Unified at `round(killValue × 1.5)` | Removes ad-hoc per-enemy ratios |
| **Gold buff stacking** | Additive bonus (×2 + ×3 → ×4, not ×6) | Removes runaway compounding |
| **Monty Hall (5★ 4th)** | Threshold 1000 (was 1400) | Earlier access to top-tier rewards |
| **Monty Hall gating** | Per-reward `minStar` filter | 1★ players can no longer roll game-trivializing rewards |
| **Talent tree** | +7 advanced "Tier-2" nodes, parent-at-max prereq | Tree budget 111 TP vs 55 TP achievement pool — meaningful choice |
| **Qualitative talents** | 4 of them now cost 3 TP/lv (was 2) | Reflects their actual power tier |

The in-game manual (`frontend/public/manual/`) already mirrors all of the above as of `f8a24f9`.

## V1 Code Removed

| Phase | Removed |
|-------|---------|
| 1 | Piecewise path segments (`path-segment-types.ts`), fixed 4-level structure |
| 2 | V1 tower types (FunctionCannon, RadarSweep, MatrixLink, ProbabilityShrine, IntegralCannon, FourierShield) and their UI panels |
| 3 | V1 enemy types (slime variants, Stealth, Boss Dragon) |
| 4 | V1 flat scoring (+10 per kill), V1 buff card system, V1 session sync payloads, V1 gameStore fields |
