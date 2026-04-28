# Phase 4 — Economy, Scoring & Wave Events

> **Goal**: Implement the V2 money system (income + spending + buff/debuff/spells),
> the S1/S2/K/Total Score formula, and the Monty Hall wave events.

**Prerequisites**: Phase 2 (tower system — spending on towers), Phase 3
(enemy system — kill values drive income and Monty Hall triggers).

---

## 4.1 Money System — Income

### Income Sources

| Source | Amount | Trigger |
|--------|--------|---------|
| **Enemy kill** | `enemy.gold_reward` (varies by type) | On enemy death |
| **Wave completion** | Flat bonus + scaling with star rating | End of each wave |
| **Boss Type-B correct answer** | Bonus gold | On correct chain rule answer |

### Starting Gold

Starting gold is defined per star rating in `game-constants.json`.

**Timing**: Starting gold must be available **before** the Initial Answer
phase, since "pay money to skip IA" (Section 6.1) is an option during that
phase. The game store initializes gold at level generation time, not at
wave 1 start.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/EconomySystem.ts` | Rewrite — replace flat +10 per kill with per-enemy gold_reward; add wave completion bonus; add Boss correct answer bonus |
| `shared/game-constants.json` | Modify — add `economy.starting_gold_by_star`, `economy.wave_completion_bonus` |

---

## 4.2 Money System — Spending

### Spending Categories

| Category | UI Location | Effect |
|----------|-------------|--------|
| **Buy tower** | Build panel | Deduct tower cost, place tower |
| **Upgrade tower** | Tower info panel | Deduct upgrade cost, increase tower stats |
| **Intersection point (IA skip)** | Initial Answer screen | Deduct gold, set IA=0, grant path visibility |
| **Buff / Debuff** | Shop panel | Apply global persistent modifier |
| **Tools: Move tower** | Tower info panel | Deduct cost, relocate tower to new legal position |
| **Tools: Buff for tower** | Tower info panel | Deduct cost, apply temporary stat buff to specific tower |
| **Health** | Shop panel | Deduct cost, restore player HP |
| **Spells** | Spell bar / quick-cast | Deduct cost, fire single-cast targeted effect |

### Cost Tracking

All spending is accumulated into `cost_total` for scoring (S2 formula).

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/EconomySystem.ts` | Extend — track cost_total; implement all spending category deductions |
| `frontend/src/stores/` (game store) | Extend — expose gold, cost_total, HP |

---

## 4.3 Buff / Debuff System

Buffs and debuffs are **global, persistent modifiers** that affect all
towers or all enemies for a duration.

### Examples

| Type | Target | Effect |
|------|--------|--------|
| Buff | All towers | +20% damage for 60 seconds |
| Buff | All towers | +15% attack speed for 45 seconds |
| Debuff | All enemies | -15% speed for 30 seconds |
| Debuff | All enemies | -10% HP regeneration for 60 seconds |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/BuffSystem.ts` | Rewrite — V1 buff system replaced with global modifier system; track active buffs/debuffs with timers |
| `frontend/src/data/buff-defs.ts` | Rewrite — define purchasable buffs/debuffs with costs, durations, effects |
| `frontend/src/components/game/ShopPanel.vue` | Create — UI for purchasing buffs/debuffs and health |

### Modifier Application

```
effective_stat = base_stat * product(1 + modifier_i for each active buff/debuff)
```

All tower/enemy systems read effective stats through a modifier layer.

---

## 4.4 Spell System

Spells are **single-cast, temporary, targeted effects**. They are fired at a
specific target or area and then consumed.

### Examples

| Spell | Target | Effect |
|-------|--------|--------|
| Fireball | Area (click position) | AoE damage to enemies in radius |
| Slow | Group of enemies | Temporarily slow enemies in area |
| Lightning | Single enemy | High single-target damage |
| Heal | Single tower | Restore tower HP (if tower HP exists) or boost stats briefly |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/SpellSystem.ts` | Create — spell casting logic, area/target selection, effect application, cooldown management |
| `frontend/src/data/spell-defs.ts` | Create — define available spells with costs, cooldowns, effects, targeting modes |
| `frontend/src/renderers/SpellEffectRenderer.ts` | Create — visual effects for spell casts (fireball explosion, slow wave, lightning bolt) |
| `frontend/src/components/game/SpellBar.vue` | Create — horizontal bar of available spells with cooldown indicators; click to cast |

---

## 4.5 Scoring Formula

### Formulas

```
S1 = kill_value / active_time
   where active_time = time_total - n * sum(time_exclude_prepare)

S2 = kill_value / cost_total

K  = MAX over m in [0.5, 0.7] of (m * S1 + (1 - m) * S2)

Total Score = K ^ (1 / [1 + (2 + health_origin - health_final - IA)])
```

### Variable Collection

Each variable must be tracked during gameplay and sent to the backend at
level end.

| Variable | Collected By | When |
|----------|-------------|------|
| `kill_value` | EconomySystem (cumulative sum of enemy kill values) | On each enemy death |
| `time_total` | GameLoop timer | Level start → level end |
| `time_exclude_prepare` | GameLoop timer | Each preparation phase duration |
| `n` | WaveSystem | Count of preparation phases |
| `cost_total` | EconomySystem (cumulative sum of all spending) | On each purchase |
| `health_origin` | Game store | Level start |
| `health_final` | Game store | Level end |
| `IA` | InitialAnswer result | Pre-level phase |

### K Optimization

To find `K = MAX(m * S1 + (1 - m) * S2)` for m in [0.5, 0.7]:

Since this is a linear function of m, the maximum is at one of the endpoints:
- If S1 > S2: K = 0.7 * S1 + 0.3 * S2
- If S1 < S2: K = 0.5 * S1 + 0.5 * S2
- If S1 = S2: K = S1 (= S2)

### Implementation

| File | Action |
|------|--------|
| `frontend/src/domain/scoring/score-calculator.ts` | Create — implements S1, S2, K, Total Score formulas |
| `frontend/src/systems/EconomySystem.ts` | Extend — expose kill_value, cost_total at level end |
| `frontend/src/composables/useGameLoop.ts` | Modify — track time_total, time_exclude_prepare, n |
| `frontend/src/views/ScoreResultView.vue` | Create — end-of-level score breakdown (show S1, S2, K, exponent, Total Score) |

### Backend Score Storage

| File | Action |
|------|--------|
| `backend/app/models/game_session.py` | (Already updated in Phase 1) — stores all scoring variables |
| `backend/app/routes/game_session.py` | Modify — accept full scoring payload on session end |
| `backend/app/application/session_service.py` | Modify — validate and store scoring variables; optionally re-compute Total Score server-side for anti-cheat |

---

## 4.6 Monty Hall Wave Events

### Trigger Condition

The Monty Hall event fires when **cumulative kill value** reaches progressive
thresholds. It does NOT fire after every wave.

### Threshold Design

```
thresholds = [T1, T2, T3, ...]  (increasing values)
When cumulative_kill_value crosses T_i for the first time → trigger event
```

Threshold values scale with star rating. Define in a data file.

### Flow

```
1. Display 3-5 doors (random count per event).
2. Exactly 1 door contains a buff; rest are empty.
3. Player selects one door (not opened).
4. System reveals and removes one empty door from the unchosen set.
5. System asks: "Do you want to switch?"
6. Player keeps or switches.
7. Chosen door opens → buff (or nothing).
```

### Buff Rewards

Monty Hall buffs are drawn from a separate pool (stronger/rarer than
purchasable buffs) to incentivize engagement.

### Implementation

| File | Action |
|------|--------|
| `frontend/src/systems/MontyHallSystem.ts` | Create — threshold tracking, door generation, reveal logic, switch prompt, reward distribution |
| `frontend/src/data/monty-hall-defs.ts` | Create — threshold tables per star rating, buff reward pool |
| `frontend/src/components/game/MontyHallPanel.vue` | Create — door selection UI with animation (reveal, switch prompt) |
| `frontend/src/components/game/HUD.vue` | Modify — show Monty Hall progress bar (kill value toward next threshold) |

---

## 4.7 Session Sync Overhaul (`useSessionSync.ts`)

V1 syncs limited data to the backend. V2 requires a full overhaul.

### V1 Payload (current)

| Event | Data Sent |
|-------|-----------|
| WAVE_END | `current_wave`, `gold`, `hp`, `score` |
| LEVEL_END | `score`, `kills`, `waves_survived` |

### V2 Payload (target)

| Event | Data Sent |
|-------|-----------|
| LEVEL_START | `star_rating`, `path_config` (JSON), `health_origin`, `initial_answer` (0 or 1) |
| WAVE_END | `current_wave`, `gold`, `hp`, `kill_value`, `cost_total` |
| LEVEL_END | `total_score`, `kill_value`, `cost_total`, `time_total`, `time_exclude_prepare`, `n_prep_phases`, `health_final`, `waves_survived` |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/composables/useSessionSync.ts` | Rewrite — send all V2 fields; update event payloads; keep race-condition guards and generation counters |
| `backend/app/routes/game_session.py` | Modify — accept V2 payload fields on create and end |
| `backend/app/application/session_service.py` | Modify — validate new fields; server-side Total Score re-computation for anti-cheat |

---

## 4.8 Game Store State Expansion

V1 `gameStore` tracks: `phase`, `level`, `wave`, `totalWaves`, `gold`, `hp`,
`maxHp`, `score`, `kills`, `enemiesAlive`, `buffCards`, `pathPanel`.

### New State Fields

| Field | Type | Purpose |
|-------|------|---------|
| `star_rating` | number | Current level's star difficulty |
| `initial_answer` | 0 \| 1 | IA result |
| `kill_value` | number | Cumulative kill value (not count) |
| `cost_total` | number | Cumulative gold spent |
| `time_total` | number | Elapsed time since level start (seconds) |
| `time_exclude_prepare` | number[] | Array of preparation phase durations |
| `health_origin` | number | HP at level start |
| `paths_visible` | boolean | Whether paths are rendered (IA outcome) |
| `monty_hall_progress` | number | Kill value toward next Monty Hall threshold |

### Removed State Fields

| Field | Reason |
|-------|--------|
| `level` | Replaced by `star_rating` |
| `buffCards` | V1 ProbabilityShrine removed |
| `pathPanel` | V1 segment-based path panel removed |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/stores/gameStore.ts` | Rewrite — replace V1 state with V2 fields; add computed getters for active_time, S1, S2 |

---

## 4.9 HUD Overhaul

V1 HUD shows: Phase label, Level, Gold, HP, Enemies remaining, Score.

V2 HUD needs significant updates spread across multiple phases. Phase 4 is
the natural owner since most HUD changes relate to economy and scoring.

### V2 HUD Layout

| Element | Source | Notes |
|---------|--------|-------|
| **Star rating** | `gameStore.star_rating` | Replaces "Level" display; show as star icons |
| **Wave** | `gameStore.wave / totalWaves` | Unchanged |
| **Gold** | `gameStore.gold` | Unchanged |
| **HP** | `gameStore.hp / health_origin` | Show origin HP for context |
| **Kill value** | `gameStore.kill_value` | New — replaces or supplements enemies-remaining |
| **Monty Hall progress** | `gameStore.monty_hall_progress` | Progress bar toward next event |
| **Spell bar** | SpellSystem | Horizontal row of spell buttons with cooldowns |
| **IA indicator** | `gameStore.initial_answer` | Show IA status (correct / wrong / paid / ignored) |
| **Active buffs** | BuffSystem | Icons with remaining duration timers |
| **Prep phase timer** | `gameStore` | Countdown during preparation phases |

### Implementation

| File | Action |
|------|--------|
| `frontend/src/components/game/HUD.vue` | Rewrite — all elements above; responsive layout |

---

## 4.10 Remove V1 Economy Code

| File | Action |
|------|--------|
| `frontend/src/systems/EconomySystem.ts` | V1 flat scoring removed as part of rewrite |
| `frontend/src/data/buff-defs.ts` | V1 buff card definitions removed as part of rewrite |

---

## Acceptance Criteria

- [ ] Gold income per enemy kill matches enemy's gold_reward value; wave completion bonuses work.
- [ ] All 7 spending categories deduct gold correctly; cost_total accumulates.
- [ ] Buffs/debuffs apply globally and persist for their duration; modifier stacking works correctly.
- [ ] Spells are single-cast, targeted, and consumed on use; visual effects render.
- [ ] S1, S2, K computed correctly (verify K optimization picks correct endpoint of m range).
- [ ] Total Score formula matches V2.md specification; example values from spec reproduced exactly.
- [ ] Monty Hall event triggers at correct kill-value thresholds, not every wave.
- [ ] Monty Hall flow: door selection → reveal → switch prompt → outcome is correct.
- [ ] Score result screen shows full breakdown at level end.
- [ ] Backend accepts and stores all scoring variables; server-side re-computation matches frontend.
- [ ] `useSessionSync.ts` sends all V2 fields (star_rating, IA, kill_value, cost_total, times, HP).
- [ ] `gameStore` has all V2 state fields; V1-only fields (level, buffCards, pathPanel) removed.
- [ ] HUD displays: star rating, kill value, Monty Hall progress, spell bar, IA indicator, active buffs.
- [ ] Starting gold is available during IA phase (before wave 1).
