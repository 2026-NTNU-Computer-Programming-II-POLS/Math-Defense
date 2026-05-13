# Phase 6 — Classroom & Competition

> **Goal**: Implement Grabbing Territory mode, the full ranking system (Class,
> Global, Internal, External), and teacher administration tools. This is the
> capstone social layer built on top of all prior gameplay systems.

**Prerequisites**: All prior phases (0–5). The complete gameplay loop, scoring
formula, difficulty system, and user roles must be functional before
competitive modes can work.

---

## 6.1 Grabbing Territory — Data Model

### Backend Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `grabbing_territory_activities` | id, class_id (FK, nullable for inter-class), teacher_id (FK), deadline, created_at | An activity instance configured by a Teacher |
| `territory_slots` | id, activity_id (FK), star_rating (1-5), path_config (JSON), slot_index | One playable territory within an activity |
| `territory_occupations` | id, slot_id (FK), student_id (FK), score (float), occupied_at | Current holder of a territory |

### Relationships

```
GrabbingTerritoryActivity
  └── has many ──> TerritorySlots
                     └── has zero or one ──> TerritoryOccupation
```

### Files to Create

| File | Action |
|------|--------|
| `backend/app/models/territory.py` | Create — all 3 tables above |
| `backend/app/domain/territory/aggregate.py` | Create — GrabbingTerritoryActivity aggregate with slot and occupation management |
| `backend/app/domain/territory/repository.py` | Create — abstract repository |
| `backend/app/domain/territory/errors.py` | Create — TerritoryCapReached, ActivityExpired, ScoreNotHighEnough, etc. |
| `backend/app/infrastructure/persistence/territory/repository.py` | Create — SQLAlchemy repository |
| `backend/alembic/versions/<hash>_v2_territory.py` | Create — migration |

---

## 6.2 Grabbing Territory — Application Service

### Core Operations

| Operation | Description | Authorization |
|-----------|-------------|--------------|
| `create_activity` | Teacher creates a GT activity with deadline, slots (star ratings, path configs) | Teacher (own classes) |
| `list_activities` | List activities for a class or across classes | Teacher / Student |
| `play_territory` | Student plays a territory slot; on win, attempt occupation | Student |
| `get_territory_status` | View all slots and their current occupants/scores | Teacher / Student |
| `settle_activity` | Freeze all territories at deadline; compute rankings | System (cron or on-demand) |

### Occupation Logic

```python
def attempt_occupation(slot_id, student_id, new_score):
    student_territories = count_occupied_by(student_id, activity_id)
    if student_territories >= 5:
        raise TerritoryCapReached()

    current = get_occupation(slot_id)
    if current is None:
        create_occupation(slot_id, student_id, new_score)  # seize unoccupied
    elif new_score > current.score:
        replace_occupation(slot_id, student_id, new_score)  # seize from holder
    else:
        raise ScoreNotHighEnough()
```

### Counter-Seize

There is no limit on counter-seize attempts. A displaced student can replay
the same territory and reclaim it if they beat the new holder's score. The
5-territory cap is checked on each occupation attempt — if the student already
holds 5 territories, they must lose one before seizing another (or they can
voluntarily abandon one).

### Concurrency Handling

Two students may play the same territory slot simultaneously. The occupation
attempt uses **optimistic locking**:

```python
def attempt_occupation(slot_id, student_id, new_score):
    with db.begin():
        current = get_occupation_for_update(slot_id)  # SELECT ... FOR UPDATE
        # ... compare scores and insert/replace as before
```

`SELECT ... FOR UPDATE` serializes concurrent writes to the same slot.
The loser's play result is still recorded (for stats/achievements) but
the territory is not seized.

### Files to Create

| File | Action |
|------|--------|
| `backend/app/application/territory_service.py` | Create — all operations above |
| `backend/app/routes/territory.py` | Create — see Section 6.3 |

---

## 6.3 Grabbing Territory — API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/activities` | Create a GT activity (Teacher) |
| `GET` | `/activities` | List activities (filtered by class or across classes) |
| `GET` | `/activities/{id}` | Activity detail with all slots and occupations |
| `POST` | `/activities/{id}/slots/{slot_id}/play` | Submit play result for a territory |
| `GET` | `/activities/{id}/rankings` | Compute and return rankings for this activity |
| `POST` | `/activities/{id}/settle` | Manually settle (Teacher) or auto-settle at deadline |

---

## 6.4 Grabbing Territory — Frontend

| File | Action |
|------|--------|
| `frontend/src/views/TerritoryListView.vue` | Create — list of available GT activities with deadlines |
| `frontend/src/views/TerritoryDetailView.vue` | Create — grid of territory slots; show star rating, current occupant, score; click to play |
| `frontend/src/views/TerritoryResultView.vue` | Create — after playing: show score comparison, seize success/failure |
| `frontend/src/components/territory/TerritorySlotCard.vue` | Create — card showing slot star, occupant avatar + name, score; visual state (unoccupied / occupied by me / occupied by other) |
| `frontend/src/services/territoryService.ts` | Create — API calls |
| `frontend/src/stores/territoryStore.ts` | Create — local state for current activity |

### Teacher Administration

| File | Action |
|------|--------|
| `frontend/src/views/TeacherTerritorySetup.vue` | Create — form to create GT activity: set deadline, add territory slots (pick star rating for each, optionally customize path config), assign to class(es) |

---

## 6.5 Ranking System

### Ranking Types

| Type | Scope | Metric | Source |
|------|-------|--------|--------|
| **Class Ranking** | Within one class | Player's Total Score | Individual mode + GT |
| **Global Ranking** | All players | Player's Total Score | Individual mode |
| **Internal** | Cross-class, per-student | Individual's Total Score in GT | GT activity |
| **External** | Cross-class, per-class | Average Total Score of class members in GT | GT activity |

### Backend

| File | Action |
|------|--------|
| `backend/app/models/leaderboard.py` | Modify — add `ranking_type` enum (global, class, internal, external), `class_id` (FK, nullable), `activity_id` (FK, nullable) |
| `backend/app/domain/leaderboard/aggregate.py` | Modify — support multiple ranking types |
| `backend/app/application/leaderboard_service.py` | Modify — compute_class_ranking, compute_global_ranking, compute_internal_ranking, compute_external_ranking |
| `backend/app/routes/leaderboard.py` | Modify — `GET /rankings?type=global\|class\|internal\|external&class_id=X&activity_id=Y` |
| `backend/alembic/versions/<hash>_v2_rankings.py` | Create — migration |

### Ranking Computation

#### Class Ranking
```sql
SELECT user_id, MAX(total_score) as best_score
FROM game_sessions
WHERE user_id IN (SELECT student_id FROM class_memberships WHERE class_id = ?)
GROUP BY user_id
ORDER BY best_score DESC
```

#### Global Ranking
```sql
SELECT user_id, MAX(total_score) as best_score
FROM game_sessions
GROUP BY user_id
ORDER BY best_score DESC
```

#### Internal Ranking (GT, per-student across classes)
```sql
SELECT student_id, SUM(star_rating) as territory_value
FROM territory_occupations o
JOIN territory_slots s ON o.slot_id = s.id
WHERE s.activity_id = ?
GROUP BY student_id
ORDER BY territory_value DESC
```

#### External Ranking (GT, per-class average)
```sql
SELECT cm.class_id,
       AVG(sub.territory_value) as avg_territory_value
FROM (
  SELECT o.student_id, SUM(s.star_rating) as territory_value
  FROM territory_occupations o
  JOIN territory_slots s ON o.slot_id = s.id
  WHERE s.activity_id = ?
  GROUP BY o.student_id
) sub
JOIN class_memberships cm ON cm.student_id = sub.student_id
GROUP BY cm.class_id
ORDER BY avg_territory_value DESC
```

### Frontend

| File | Action |
|------|--------|
| `frontend/src/views/RankingsView.vue` | Rewrite — tabbed view: Global / Class / Internal / External; each tab loads appropriate ranking data |
| `frontend/src/services/rankingService.ts` | Create — API calls for all ranking types |
| `frontend/src/composables/useLeaderboard.ts` | Modify — support multiple ranking types |

---

## 6.6 Teacher Dashboard

Teachers need a consolidated view of their classes, activities, and student
performance.

| File | Action |
|------|--------|
| `frontend/src/views/TeacherDashboard.vue` | Create — overview: classes list, active GT activities, class rankings snapshot |

---

## 6.7 Admin Panel

Admins can audit all teachers, classes, and students.

| File | Action |
|------|--------|
| `frontend/src/views/AdminPanel.vue` | Create — list all teachers (with their classes), list all classes (with student counts), search users |

---

## 6.8 Settlement & Deadline Enforcement

When a GT activity's deadline arrives, territories must be frozen.

### Options

1. **Cron job**: Backend task runs periodically, checks for expired activities,
   settles them.
2. **Lazy settlement**: On any read request for an expired activity, settle
   it on first access.
3. **Both**: Cron for guaranteed settlement + lazy as fallback.

### Implementation

| File | Action |
|------|--------|
| `backend/app/application/territory_service.py` | Extend — `settle_activity(activity_id)` freezes occupations, computes final rankings |
| `backend/app/infrastructure/scheduler.py` | Create (optional) — periodic task to auto-settle expired activities |

---

## Acceptance Criteria

- [ ] Teacher can create a GT activity with deadline, territory slots (each with star rating), and assign to class(es).
- [ ] Student sees available GT activities and territory slots with current occupants.
- [ ] Playing a territory slot runs a full game at the slot's star rating; score is recorded.
- [ ] Occupation logic: unoccupied → seize; occupied + higher score → seize; occupied + lower score → fail.
- [ ] 5-territory cap enforced per student per activity.
- [ ] Counter-seize: displaced student can replay and reclaim with a higher score.
- [ ] Settlement freezes territories at deadline; final rankings computed.
- [ ] Global Ranking: all players, best Total Score.
- [ ] Class Ranking: within one class, best Total Score.
- [ ] Internal Ranking: per-student territory value sum across classes in a GT activity.
- [ ] External Ranking: per-class average territory value in a GT activity.
- [ ] Rankings view shows all 4 types with correct data.
- [ ] Teacher dashboard shows class overview and active activities.
- [ ] Admin panel shows all teachers, classes, students.
- [ ] Concurrent occupation: two simultaneous plays on the same slot resolve correctly (one wins, one fails gracefully).
