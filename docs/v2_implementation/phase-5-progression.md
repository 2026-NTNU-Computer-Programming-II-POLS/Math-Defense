# Phase 5 — Progression System (Achievements & Talents)

> **Goal**: Implement the persistent achievement system and talent tree that
> let players unlock and spend talent points to permanently upgrade tower
> attributes across sessions.

**Prerequisites**: Phase 0 (user model), Phase 2 (tower system — talent
upgrades apply to towers), Phase 4 (scoring — achievement conditions reference
gameplay stats).

---

## 5.1 Achievement System

### Overview

Achievements are unlocked by meeting specific conditions during gameplay.
Each unlocked achievement grants **talent points** that the player can spend
in the talent tree.

### Achievement Categories (Examples)

| Category | Example Conditions |
|----------|-------------------|
| **Combat** | Kill N enemies total, kill N enemies in one level, defeat a Boss Type-B |
| **Scoring** | Achieve Total Score > X, get a perfect IA + no damage run |
| **Efficiency** | Complete a level spending less than X gold, achieve S2 > threshold |
| **Survival** | Survive N waves without losing HP, complete a 5-star level |
| **Exploration** | Play levels at every star rating, use every tower type |
| **Territory** | Seize N territories, hold a 5-star territory |

### Achievement Definition Schema

```typescript
interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: 'combat' | 'scoring' | 'efficiency' | 'survival' | 'exploration' | 'territory';
  condition: AchievementCondition;   // evaluatable condition
  talent_points: number;             // points awarded on unlock
  icon: string;                      // asset reference
}
```

### Backend

| File | Action |
|------|--------|
| `backend/app/models/achievement.py` | Create — `achievements` table (id, user_id FK, achievement_id, unlocked_at) |
| `backend/app/domain/achievement/aggregate.py` | Create — Achievement aggregate |
| `backend/app/domain/achievement/repository.py` | Create — abstract repository |
| `backend/app/infrastructure/persistence/achievement/repository.py` | Create — SQLAlchemy repository |
| `backend/app/application/achievement_service.py` | Create — check conditions after game session, unlock, return newly unlocked list |
| `backend/app/routes/achievement.py` | Create — `GET /achievements` (list all + unlock status), `GET /achievements/unlocked` |
| `backend/alembic/versions/<hash>_v2_achievement.py` | Create — migration |

### Frontend

| File | Action |
|------|--------|
| `frontend/src/data/achievement-defs.ts` | Create — all achievement definitions with conditions |
| `frontend/src/services/achievementService.ts` | Create — API calls to fetch/check achievements |
| `frontend/src/views/AchievementView.vue` | Create — grid/list of all achievements; unlocked ones highlighted with date; locked ones show progress toward condition |
| `frontend/src/components/game/AchievementToast.vue` | Create — toast notification when achievement unlocks during gameplay |

### Condition Evaluation

After each game session ends, the backend:
1. Receives the session result (score, kills, HP, waves survived, etc.).
2. Loads the player's cumulative stats (total kills, total sessions, etc.).
3. Evaluates all locked achievement conditions against current + cumulative data.
4. Unlocks any newly satisfied achievements.
5. Returns the list of newly unlocked achievements to the frontend for display.

---

## 5.2 Talent Tree

### Overview

Talent points (earned from achievements) are spent to permanently upgrade
tower attributes. Upgrades persist across all game sessions.

### Talent Nodes Per Tower

| Tower | Upgradeable Attributes |
|-------|----------------------|
| **Magic** | Zone effect strength, zone width, duration |
| **Radar Type-A** | AoE range, sweep speed |
| **Radar Type-B** | Attack speed, damage, target count |
| **Radar Type-C** | Damage, range, target count |
| **Matrix** | Range MR, target count, damage ramp rate |
| **Limit** | Damage multiplier, range |
| **Calculus** | Pet attack speed, pet damage, pet HP |

### Talent Node Schema

```typescript
interface TalentNode {
  id: string;
  tower_type: TowerKind;
  attribute: string;           // which stat to upgrade
  max_level: number;           // max times this node can be upgraded
  cost_per_level: number;      // talent points per level
  effect_per_level: number;    // stat increase per level (e.g., +5% damage)
  prerequisites: string[];     // other talent node IDs that must be unlocked first
}
```

### Backend

| File | Action |
|------|--------|
| `backend/app/models/talent.py` | Create — `talent_allocations` table (id, user_id FK, talent_node_id, current_level) |
| `backend/app/domain/talent/aggregate.py` | Create — TalentAllocation aggregate |
| `backend/app/domain/talent/repository.py` | Create — abstract repository |
| `backend/app/infrastructure/persistence/talent/repository.py` | Create — SQLAlchemy repository |
| `backend/app/application/talent_service.py` | Create — allocate_point (validate prerequisites + cost), reset_tree, get_allocations |
| `backend/app/routes/talent.py` | Create — `GET /talents` (tree + allocations), `POST /talents/{node_id}/allocate`, `POST /talents/reset` |
| `backend/alembic/versions/<hash>_v2_talent.py` | Create — migration |

### Frontend

| File | Action |
|------|--------|
| `frontend/src/data/talent-defs.ts` | Create — talent tree definition (nodes, edges, costs, effects) |
| `frontend/src/services/talentService.ts` | Create — API calls |
| `frontend/src/views/TalentTreeView.vue` | Create — visual tree with nodes per tower type; click to allocate; shows remaining points |
| `frontend/src/stores/talentStore.ts` | Create — local cache of allocations; computes effective stat modifiers |

### Talent Application at Runtime

During gameplay, tower stats are computed as:

```
effective_stat = base_stat * (1 + sum of talent bonuses for this stat)
```

The talent store provides a `getTowerModifiers(towerKind)` function that
all tower systems call when computing effective stats.

| File | Action |
|------|--------|
| `frontend/src/systems/*TowerSystem.ts` | Modify (all tower systems) — read talent modifiers when computing damage, attack speed, range, etc. |

---

## 5.3 Profile Page

The profile page aggregates achievement and talent data.

| File | Action |
|------|--------|
| `frontend/src/views/ProfileView.vue` | Extend (created in Phase 0) — add sections for: total talent points (earned / spent / available), achievement count (unlocked / total), link to full Achievement and Talent views |

---

## 5.4 Avatar System

| File | Action |
|------|--------|
| `frontend/src/views/ProfileView.vue` | Extend — avatar selector (predefined set of images, or upload) |
| `backend/app/routes/user.py` or `profile.py` | Create — `PUT /profile/avatar` (upload or select preset) |
| `backend/app/infrastructure/` | Store avatars (local filesystem or S3-compatible, depending on deployment) |

---

## Acceptance Criteria

- [ ] Achievement definitions cover all categories; at least 3-5 achievements per category.
- [ ] Achievements unlock correctly based on session results and cumulative stats.
- [ ] Newly unlocked achievements trigger a toast notification in-game.
- [ ] Achievement view shows all achievements with locked/unlocked status and progress.
- [ ] Talent points correctly computed from unlocked achievements.
- [ ] Talent tree displays per-tower-type nodes with prerequisites and current allocations.
- [ ] Allocating a talent point deducts from available pool, respects prerequisites and max levels.
- [ ] Talent bonuses correctly applied to tower stats during gameplay (verify with a Radar tower that talent-upgraded damage matches expected value).
- [ ] Reset tree refunds all points; allocations cleared.
- [ ] Profile page shows avatar, player name, achievement summary, talent summary.
- [ ] Avatar upload/selection works and persists across sessions.
